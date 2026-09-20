/**
 * CryptoMarketFeed - Direct public Kraken WebSocket market data for the
 * dashboard relay.
 *
 * Context: the SSL server's original direct Kraken connection was stubbed
 * out ("bot sends all data") but the bot-side relay never materialized —
 * the hub tracked 0 assets and every depth/CVD consumer sat dormant
 * (see ogz-meta/ledger/frontend/CURRENT-ARCHITECTURE.md). This module
 * revives the direct feed as a self-contained client of Kraken's PUBLIC
 * v1 WebSocket (wss://ws.kraken.com) — no API key, no cost, market data
 * only. It never places orders and is loaded only by the web server;
 * the trading process does not require this module.
 *
 * Emits via caller-supplied callbacks (the server owns broadcasting):
 *   onPrice({asset, price, volume})                      — ticker channel
 *   onDepth({asset, isLive, walls, density, timestamp})  — book-25 channel,
 *     throttled per symbol; walls/density shaped for the dashboard's
 *     chart renderLiquidity() contract.
 *   onCvd({asset, cvdValue, cvdTrend, buyVolume, sellVolume}) — TRUE
 *     taker-side delta from the trade channel (buyer-aggressor notional
 *     minus seller-aggressor notional), NOT the close>=open candle proxy.
 *   onWhaleTrade({symbol, side, amount, price})          — single prints
 *     >= whaleTradeMinUsd.
 *   onInternals({asset, bookImbalance, buySellRatio})    — near-mid book
 *     imbalance + rolling taker buy/sell notional ratio.
 *
 * Failure semantics: reconnect with capped backoff, 60s silence watchdog.
 * Callbacks are called with real observed data only; a dead upstream
 * means no frames (consumers keep their honest empty/dormant states).
 *
 * @module core/CryptoMarketFeed
 */

'use strict';

const WebSocket = require('ws');

function krakenPairForSymbol(symbol, pairBySymbol) {
  const pair = pairBySymbol[symbol];
  if (!pair) {
    throw new Error(`[CryptoFeed] No Kraken pair mapping for dashboard symbol ${symbol}`);
  }
  return pair;
}

function symbolForKrakenPair(pair) {
  return String(pair).toUpperCase().replace('XBT', 'BTC').replace('/', '-');
}

function createCryptoMarketFeed({
  symbols,
  feedConfig,
  onPrice = null,
  onDepth = null,
  onCvd = null,
  onWhaleTrade = null,
  onInternals = null,
  log = console,
} = {}) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('[CryptoFeed] symbols must be a non-empty array of dashboard symbols');
  }
  const pairs = symbols.map(symbol => krakenPairForSymbol(symbol, feedConfig.pairBySymbol));

  let ws = null;
  let stopped = false;
  let backoffMs = feedConfig.backoffMinMs;
  let lastMessageAt = 0;
  let watchdogTimer = null;

  // Per-symbol market state.
  const books = new Map();  // asset -> { bids: Map<price,qty>, asks: Map<price,qty> }
  const cvd = new Map();    // asset -> { value, buyVolume, sellVolume, lastEmitValue, lastEmitAt }
  const trades = new Map(); // asset -> [{at, side, notional}] rolling window
  const lastDepthEmitAt = new Map();

  function bookFor(asset) {
    if (!books.has(asset)) books.set(asset, { bids: new Map(), asks: new Map() });
    return books.get(asset);
  }

  function cvdFor(asset) {
    if (!cvd.has(asset)) cvd.set(asset, { value: 0, buyVolume: 0, sellVolume: 0, lastEmitValue: 0, lastEmitAt: 0 });
    return cvd.get(asset);
  }

  function applyBookEntries(sideMap, entries) {
    for (const entry of entries) {
      const price = Number(entry[0]);
      const qty = Number(entry[1]);
      if (!Number.isFinite(price)) continue;
      if (qty > 0) sideMap.set(price, qty);
      else sideMap.delete(price);
    }
  }

  function emitDepth(asset) {
    const now = Date.now();
    if (now - (lastDepthEmitAt.get(asset) || 0) < feedConfig.emitIntervalMs) return;
    const book = bookFor(asset);
    if (book.bids.size === 0 || book.asks.size === 0) return;
    lastDepthEmitAt.set(asset, now);

    const bestBid = Math.max(...book.bids.keys());
    const bestAsk = Math.min(...book.asks.keys());
    const mid = (bestBid + bestAsk) / 2;
    const lo = mid * (1 - feedConfig.nearMidBandFraction);
    const hi = mid * (1 + feedConfig.nearMidBandFraction);

    const levels = [];
    let bidNotional = 0;
    let askNotional = 0;
    for (const [price, qty] of book.bids) {
      if (price < lo) continue;
      const notional = price * qty;
      bidNotional += notional;
      levels.push({ price, side: 'BID', size: notional });
    }
    for (const [price, qty] of book.asks) {
      if (price > hi) continue;
      const notional = price * qty;
      askNotional += notional;
      levels.push({ price, side: 'ASK', size: notional });
    }

    if (onDepth) {
      const walls = levels
        .filter(l => l.size >= feedConfig.wallMinUsd)
        .sort((a, b) => b.size - a.size)
        .slice(0, feedConfig.maxWalls);
      const density = levels
        .slice()
        .sort((a, b) => b.size - a.size)
        .slice(0, feedConfig.maxDensityLevels)
        .map(l => ({
          price: l.price,
          weight: Math.min(feedConfig.densityWeightCap, l.size / feedConfig.densityWeightDivisorUsd),
        }));
      onDepth({ asset, isLive: true, walls, density, timestamp: now });
    }

    if (onInternals) {
      const total = bidNotional + askNotional;
      const bookImbalance = total > 0 ? (bidNotional - askNotional) / total : 0;
      const windowStart = now - feedConfig.tradeWindowMs;
      let buyN = 0;
      let sellN = 0;
      const recent = (trades.get(asset) || []).filter(t => t.at >= windowStart);
      trades.set(asset, recent);
      for (const t of recent) {
        if (t.side === 'buy') buyN += t.notional;
        else sellN += t.notional;
      }
      const buySellRatio = sellN > 0
        ? buyN / sellN
        : (buyN > 0 ? feedConfig.buySellRatioWhenNoSells : 1);
      onInternals({ asset, bookImbalance, buySellRatio });
    }
  }

  function handleTrades(asset, rows) {
    const state = cvdFor(asset);
    const list = trades.get(asset) || [];
    for (const row of rows) {
      const price = Number(row[0]);
      const qty = Number(row[1]);
      const side = row[3] === 'b' ? 'buy' : 'sell'; // taker (aggressor) side
      if (!Number.isFinite(price) || !Number.isFinite(qty)) continue;
      const notional = price * qty;
      if (side === 'buy') {
        state.value += notional;
        state.buyVolume += notional;
      } else {
        state.value -= notional;
        state.sellVolume += notional;
      }
      list.push({ at: Date.now(), side, notional });
      if (onWhaleTrade && notional >= feedConfig.whaleTradeMinUsd) {
        onWhaleTrade({ symbol: asset, side: side === 'buy' ? 'BUY' : 'SELL', amount: qty, price });
      }
    }
    trades.set(asset, list);

    const now = Date.now();
    if (onCvd && now - state.lastEmitAt >= feedConfig.emitIntervalMs) {
      const delta = state.value - state.lastEmitValue;
      const cvdTrend = delta > feedConfig.cvdTrendDeltaThresholdUsd
        ? 'rising'
        : delta < -feedConfig.cvdTrendDeltaThresholdUsd ? 'falling' : 'flat';
      state.lastEmitAt = now;
      state.lastEmitValue = state.value;
      onCvd({
        asset,
        cvdValue: state.value,
        cvdTrend,
        buyVolume: state.buyVolume,
        sellVolume: state.sellVolume,
      });
    }
  }

  function handleMessage(raw) {
    lastMessageAt = Date.now();
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!Array.isArray(msg) || msg.length < 4) return; // events/heartbeats
    const channel = msg[msg.length - 2];
    const pair = msg[msg.length - 1];
    const asset = symbolForKrakenPair(pair);

    if (channel === 'ticker') {
      const ticker = msg[1];
      const price = Number(ticker && ticker.c && ticker.c[0]);
      if (!Number.isFinite(price)) return;
      const volume = Number(ticker && ticker.v && ticker.v[1]);
      if (onPrice) onPrice({ asset, price, volume: Number.isFinite(volume) ? volume : null });
    } else if (channel === 'trade') {
      if (Array.isArray(msg[1])) handleTrades(asset, msg[1]);
    } else if (typeof channel === 'string' && channel.startsWith('book')) {
      const book = bookFor(asset);
      // Payload objects between channel id and name: snapshot {as,bs} or
      // updates {a}/{b} (Kraken may split a and b into separate objects).
      for (let i = 1; i < msg.length - 2; i++) {
        const part = msg[i];
        if (!part || typeof part !== 'object') continue;
        if (Array.isArray(part.as)) applyBookEntries(book.asks, part.as);
        if (Array.isArray(part.bs)) applyBookEntries(book.bids, part.bs);
        if (Array.isArray(part.a)) applyBookEntries(book.asks, part.a);
        if (Array.isArray(part.b)) applyBookEntries(book.bids, part.b);
      }
      emitDepth(asset);
    }
  }

  function connect() {
    if (stopped) return;
    try {
      ws = new WebSocket(feedConfig.publicWsUrl);
    } catch (err) {
      log.error(`[CryptoFeed] WebSocket construct failed: ${err.message}`);
      scheduleReconnect();
      return;
    }

    ws.on('open', () => {
      backoffMs = feedConfig.backoffMinMs;
      lastMessageAt = Date.now();
      log.log(`[CryptoFeed] Connected to Kraken public feed; subscribing ${pairs.join(', ')}`);
      for (const name of [
        { name: 'ticker' },
        { name: 'trade' },
        { name: 'book', depth: feedConfig.bookDepth },
      ]) {
        ws.send(JSON.stringify({ event: 'subscribe', pair: pairs, subscription: name }));
      }
    });
    ws.on('message', handleMessage);
    ws.on('error', (err) => log.error(`[CryptoFeed] Socket error: ${err.message}`));
    ws.on('close', () => {
      books.clear(); // stale books must not render as live walls
      if (!stopped) scheduleReconnect();
    });

    if (!watchdogTimer) {
      watchdogTimer = setInterval(() => {
        if (stopped || !ws) return;
        if (ws.readyState === WebSocket.OPEN && Date.now() - lastMessageAt > feedConfig.watchdogMs) {
          log.warn(`[CryptoFeed] No messages for ${feedConfig.watchdogMs}ms; recycling connection`);
          try { ws.terminate(); } catch (_) { /* close event drives reconnect */ }
        }
      }, feedConfig.watchdogMs);
      if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = backoffMs;
    backoffMs = Math.min(
      backoffMs * feedConfig.backoffMultiplier,
      feedConfig.backoffMaxMs
    );
    log.warn(`[CryptoFeed] Reconnecting in ${delay}ms`);
    setTimeout(connect, delay).unref?.();
  }

  return {
    connect,
    isConnected: () => Boolean(ws && ws.readyState === WebSocket.OPEN),
    stop: () => {
      stopped = true;
      if (watchdogTimer) clearInterval(watchdogTimer);
      try { if (ws) ws.close(); } catch (_) { /* shutdown */ }
    },
  };
}

module.exports = { createCryptoMarketFeed, krakenPairForSymbol, symbolForKrakenPair };
