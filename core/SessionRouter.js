/**
 * SessionRouter.js — Dual-broker session orchestration
 * ====================================================
 *
 * Watches the NYSE clock and switches the active data feed between Kraken
 * (crypto, 24/7) and Alpaca (stocks, RTH only). Sequential operation —
 * only ONE feed active at a time.
 *
 * On RTH open (09:30 ET, M-F, non-holiday):
 *   - Pause trading
 *   - Unsubscribe Kraken feed
 *   - Register Alpaca with stock symbols in OrderRouter
 *   - Subscribe Alpaca to stock symbols
 *   - Re-attach the OHLC callback to Alpaca
 *   - Resume trading
 *
 * On RTH close (16:00 ET, or 13:00 on early-close days):
 *   - Pause trading
 *   - Force-close any open stock positions using LIVE market price
 *     (NOT entry price — that would compute P&L = $0)
 *   - Unsubscribe Alpaca feed
 *   - Register Kraken with crypto symbols in OrderRouter
 *   - Subscribe Kraken to primary crypto symbol
 *   - Re-attach OHLC callback to Kraken
 *   - Resume trading
 *
 * Gated by `SESSION_ROUTER_ENABLED` env (default false). When off, the bot
 * runs single-broker exactly as it does today — no behavior change. Phase 0
 * baseline must reproduce byte-exact with the gate disabled.
 *
 * Source: ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL_1.md (Wolf v2)
 * Calendar: foundation/MarketCalendar.js (replaces Wolf's nyse-calendar.js
 * proposal — single source of truth for NYSE holidays and sessions).
 *
 * @date 2026-04-26
 */

'use strict';

const EventEmitter = require('events');
const { getMarketPhase, getNYTimeParts } = require('../foundation/MarketCalendar');
const { getInstance: getStateManager } = require('./StateManager');

class SessionRouter extends EventEmitter {
  constructor(config = {}) {
    super();
    this.enabled = config.enabled !== false;
    this.clock = config.clock || (() => Date.now());
    this.checkIntervalMs = config.fast ? 1000 : 60000;

    this.krakenAdapter = null;
    this.alpacaAdapter = null;
    this.orderRouter = null;
    this.stateManager = getStateManager();

    this.activeSession = null;   // 'crypto' | 'stocks' | null
    this.activeBroker = null;
    this.transitionInProgress = false;
    this.lastTransitionAt = 0;
    this.intervalId = null;

    this.stockSymbols = config.stockSymbols || ['TSLA','SPY','QQQ','NVDA','COIN','MARA','RIOT'];
    this.cryptoSymbols = config.cryptoSymbols || ['BTC/USD','ETH/USD','SOL/USD'];

    this.onOhlcCallback = null;

    // Bot context — set via wire() for access to marketData.price during force-close
    this.ctx = null;

    console.log(`[SessionRouter] Initialized | enabled=${this.enabled} | interval=${this.checkIntervalMs}ms`);
  }

  /**
   * Wire SessionRouter to its dependencies.
   * @param {Object} krakenAdapter - Kraken broker adapter instance
   * @param {Object} alpacaAdapter - Alpaca broker adapter instance
   * @param {Object} orderRouter - OrderRouter instance
   * @param {Function} onOhlcCallback - The OHLC handler from run-empire-v2 (eventData) => void
   * @param {Object} ctx - Bot context (`this` from run-empire) — gives access to marketData/priceHistory
   */
  wire(krakenAdapter, alpacaAdapter, orderRouter, onOhlcCallback, ctx) {
    this.krakenAdapter = krakenAdapter;
    this.alpacaAdapter = alpacaAdapter;
    this.orderRouter = orderRouter;
    this.onOhlcCallback = onOhlcCallback;
    this.ctx = ctx || null;
    console.log('[SessionRouter] Wired — Kraken + Alpaca + OrderRouter');
  }

  /**
   * Pull current market price from CandleProcessor's ctx.marketData.
   * Used for force-close P&L computation at session boundary. Returns null
   * if no price data available (pre-first-tick).
   *
   * CRITICAL: closePosition computes P&L as (exitPrice - entryPrice).
   * If we passed entryPrice as exitPrice, every force-close would book
   * P&L = $0 — wrong. Live price is the right input here.
   */
  _getCurrentPrice() {
    if (this.ctx && this.ctx.marketData && this.ctx.marketData.price > 0) {
      return this.ctx.marketData.price;
    }
    // Fallback: try the last candle in priceHistory
    if (this.ctx && this.ctx.priceHistory && this.ctx.priceHistory.length > 0) {
      const lastCandle = this.ctx.priceHistory[this.ctx.priceHistory.length - 1];
      return lastCandle[5] || lastCandle.close || null;  // index 5 = close in canonical array
    }
    return null;
  }

  start() {
    if (!this.enabled) {
      console.log('[SessionRouter] Disabled (SESSION_ROUTER_ENABLED=false)');
      return;
    }
    if (!this.krakenAdapter || !this.alpacaAdapter) {
      console.error('[SessionRouter] Cannot start — missing broker adapters. Call wire() first.');
      return;
    }

    const phase = getMarketPhase(new Date(this.clock()));
    if (phase.isRTH) {
      this._activateStocks();
    } else {
      this._activateCrypto();
    }

    this.intervalId = setInterval(() => {
      try { this._checkTransition(); }
      catch (err) { console.error('[SessionRouter] Check failed:', err.message); }
    }, this.checkIntervalMs);

    console.log(`[SessionRouter] Started | initial session: ${this.activeSession}`);
  }

  _checkTransition() {
    if (this.transitionInProgress) return;

    const now = new Date(this.clock());
    const phase = getMarketPhase(now);

    if (this.activeSession === 'crypto' && phase.isRTH) {
      this._transitionToStocks(now);
      return;
    }

    if (this.activeSession === 'stocks' && !phase.isRTH) {
      this._transitionToCrypto(now);
      return;
    }
  }

  async _transitionToStocks(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    console.log(`[SessionRouter] TRANSITION: crypto -> stocks at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);

    try {
      await this.stateManager.pauseTrading('SessionRouter: transitioning to stocks');

      if (this.krakenAdapter.unsubscribeAll) this.krakenAdapter.unsubscribeAll();
      if (this.krakenAdapter.removeAllListeners) this.krakenAdapter.removeAllListeners('ohlc');

      // FIX 2026-04-27 (Bot Swap Resilience audit): Reset cross-asset state
      // BEFORE the new feed is wired so no candles arrive during reset.
      // Without this, IndicatorEngine carries stale crypto state into the
      // first stock candles (RSI/EMA/MACD bleeding 14-200 candles deep).
      if (this.ctx && this.ctx.indicatorEngine && typeof this.ctx.indicatorEngine.reset === 'function') {
        this.ctx.indicatorEngine.reset();
      }
      if (this.ctx && Array.isArray(this.ctx.priceHistory)) {
        this.ctx.priceHistory.length = 0;
      }
      // FIX 2026-04-27 (Asset Isolation audit): Also clear the on-disk
      // candle-history.json. Without this, restart-after-swap replays
      // mixed-asset candles through indicatorEngine.computeBatch() at
      // run-empire-v2.js:721-722 — reproducing the indicator-state leak
      // we just fixed in-memory, just via the restart path.
      try {
        const fs = require('fs');
        const path = require('path');
        const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
        if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
      } catch (err) {
        console.warn('[SessionRouter] candle-history clear failed:', err.message);
      }

      if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);

      const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
      // BUG FIX 2026-04-27: see _activateStocks — multi-symbol bars contaminate
      // CandleProcessor's single stream. Subscribe to primary symbol only.
      const primaryStock = this.stockSymbols[0] || 'TSLA';
      if (this.alpacaAdapter.subscribeToCandles) {
        this.alpacaAdapter.subscribeToCandles(primaryStock, timeframe);
      }

      if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);

      this.activeSession = 'stocks';
      this.activeBroker = this.alpacaAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();

      this.emit('transition', { from: 'crypto', to: 'stocks', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: stocks session');
      this._kickHistoricalBackfill('stocks');

    } catch (err) {
      console.error('[SessionRouter] Transition to stocks FAILED:', err.message);
      try { await this.stateManager.resumeTrading(); } catch (e) {}
    } finally {
      this.transitionInProgress = false;
    }
  }

  async _transitionToCrypto(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    console.log(`[SessionRouter] TRANSITION: stocks -> crypto at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);

    try {
      await this.stateManager.pauseTrading('SessionRouter: transitioning to crypto');

      // Force-close open stock positions using LIVE market price.
      // See _getCurrentPrice doc: passing entryPrice as exitPrice books P&L=$0.
      const activeTrades = this.stateManager.state.activeTrades;
      if (activeTrades && activeTrades.size > 0) {
        const currentPrice = this._getCurrentPrice();
        console.log(`[SessionRouter] Force-closing ${activeTrades.size} stock position(s) at $${currentPrice}...`);
        const failedCloses = [];
        for (const [orderId, trade] of activeTrades.entries()) {
          try {
            const exitPrice = currentPrice || trade.price || trade.entryPrice;
            await this.stateManager.closePosition(exitPrice, false, null, {
              orderId,
              exitReason: 'session_close',
              tradeId: trade.tradeId || orderId,
            });
            console.log(`[SessionRouter] Closed position ${orderId}`);
          } catch (closeErr) {
            console.error(`[SessionRouter] Failed to close ${orderId}:`, closeErr.message);
            failedCloses.push({ orderId, error: closeErr.message });
          }
        }
        // FIX 2026-04-27 (Bot Swap Resilience audit Task 7): Abort the
        // transition if any force-close failed. Without this guard, the
        // subscription swap below would proceed and the failed positions
        // would become invisible orphans on the deactivated Alpaca side.
        // Better to stay in the stocks session, let the next clock tick
        // retry, or give the operator a chance to intervene.
        if (failedCloses.length > 0) {
          const errMsg = `Aborting stocks→crypto transition — ${failedCloses.length} close(s) failed: ${failedCloses.map(f => f.orderId).join(', ')}`;
          console.error(`[SessionRouter] ${errMsg}`);
          throw new Error(errMsg);
        }
      }

      if (this.alpacaAdapter.unsubscribeAll) this.alpacaAdapter.unsubscribeAll();
      if (this.alpacaAdapter.removeAllListeners) this.alpacaAdapter.removeAllListeners('ohlc');

      // FIX 2026-04-27 (Bot Swap Resilience audit): Reset cross-asset state
      // BEFORE the new feed is wired so no candles arrive during reset.
      // Without this, IndicatorEngine carries stale stock state into the
      // first crypto candles (RSI/EMA/MACD bleeding 14-200 candles deep).
      if (this.ctx && this.ctx.indicatorEngine && typeof this.ctx.indicatorEngine.reset === 'function') {
        this.ctx.indicatorEngine.reset();
      }
      if (this.ctx && Array.isArray(this.ctx.priceHistory)) {
        this.ctx.priceHistory.length = 0;
      }
      // FIX 2026-04-27 (Asset Isolation audit): Also clear the on-disk
      // candle-history.json. Without this, restart-after-swap replays
      // mixed-asset candles through indicatorEngine.computeBatch() at
      // run-empire-v2.js:721-722 — reproducing the indicator-state leak
      // we just fixed in-memory, just via the restart path.
      try {
        const fs = require('fs');
        const path = require('path');
        const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
        if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
      } catch (err) {
        console.warn('[SessionRouter] candle-history clear failed:', err.message);
      }

      if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);

      const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
      const primaryCrypto = this.cryptoSymbols[0] || 'BTC/USD';
      if (this.krakenAdapter.subscribeToCandles) this.krakenAdapter.subscribeToCandles(primaryCrypto, timeframe);

      if (this.onOhlcCallback && this.krakenAdapter.on) this.krakenAdapter.on('ohlc', this.onOhlcCallback);

      this.activeSession = 'crypto';
      this.activeBroker = this.krakenAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();

      this.emit('transition', { from: 'stocks', to: 'crypto', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: crypto session');
      this._kickHistoricalBackfill('crypto');

    } catch (err) {
      console.error('[SessionRouter] Transition to crypto FAILED:', err.message);
      try { await this.stateManager.resumeTrading(); } catch (e) {}
    } finally {
      this.transitionInProgress = false;
    }
  }

  _activateCrypto() {
    // FIX 2026-04-27: clear stale on-disk candle-history.json on initial
    // activation too — not just on transitions. Cold boot when previous
    // run ended on the OTHER asset replays foreign candles through
    // indicatorEngine and stalls warmup. Same bug class as 4433126,
    // different trigger.
    try {
      const fs = require('fs');
      const path = require('path');
      const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
      if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
    } catch (err) {
      console.warn('[SessionRouter] candle-history clear failed:', err.message);
    }

    this.activeSession = 'crypto';
    this.activeBroker = this.krakenAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    if (this.krakenAdapter.subscribeToCandles) this.krakenAdapter.subscribeToCandles(this.cryptoSymbols[0] || 'BTC/USD', timeframe);
    if (this.onOhlcCallback && this.krakenAdapter.on) this.krakenAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: crypto');
    this._kickHistoricalBackfill('crypto');
  }

  _activateStocks() {
    // FIX 2026-04-27: see _activateCrypto — same cold-boot stale-state fix.
    try {
      const fs = require('fs');
      const path = require('path');
      const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
      if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
    } catch (err) {
      console.warn('[SessionRouter] candle-history clear failed:', err.message);
    }

    this.activeSession = 'stocks';
    this.activeBroker = this.alpacaAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    // BUG FIX 2026-04-27: previously subscribed to ALL stockSymbols
    // (TSLA, SPY, QQQ, NVDA, COIN, MARA, RIOT) — but CandleProcessor
    // processes one stream at a time, so bars from MARA ($11) and QQQ
    // ($664) contaminated TSLA's history. Bot bought "TSLA" at $664
    // (QQQ price), notional math went phantom ($987k on $10k account),
    // dashboard showed +$54K/+$84K/+$226K nonsense.
    // Mirror the crypto pattern at L313 — subscribe to primary symbol only.
    const primaryStock = this.stockSymbols[0] || 'TSLA';
    if (this.alpacaAdapter.subscribeToCandles) {
      this.alpacaAdapter.subscribeToCandles(primaryStock, timeframe);
    }
    if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: stocks');
    this._kickHistoricalBackfill('stocks');
  }

  /**
   * Trigger REST-fetch of historical candles for the active asset.
   *
   * Live/paper mode doesn't auto-fetch historical bars on boot — the
   * existing path only fires on dashboard 'request_historical' messages
   * (WebSocketManager.js:152). On a cold-boot stocks-active session, the
   * chart sat empty and the right-rail HUD showed 0.00 forever until the
   * user happened to switch timeframes.
   *
   * Fired after activation with a small delay so:
   *   1. dashboardWs has time to connect (we ship to all connected tabs)
   *   2. this.ctx.kraken has been pointed at the active broker by the
   *      cold-boot pickup at run-empire-v2.js:1112
   *
   * Both 1m + 15m so all chart-timeframe selections have data.
   */
  _kickHistoricalBackfill(session) {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.fetchAndSendHistoricalCandles !== 'function') return;
    // Pick the symbol that matches the session's broker. fetchAndSend uses
    // ctx.kraken (= sessionRouter.activeBroker) — passing the wrong symbol
    // (e.g. TSLA on crypto-active KrakenIBroker) returns "Unknown asset pair."
    const symbol = session === 'stocks'
      ? (this.stockSymbols[0] || 'TSLA')
      : (this.cryptoSymbols[0] || 'BTC/USD');
    setTimeout(() => {
      try {
        ctx.fetchAndSendHistoricalCandles('1m', 500, symbol);
      } catch (e) { console.warn('[SessionRouter] historical 1m kick failed:', e.message); }
    }, 4000);
    setTimeout(() => {
      try {
        ctx.fetchAndSendHistoricalCandles('15m', 500, symbol);
      } catch (e) { console.warn('[SessionRouter] historical 15m kick failed:', e.message); }
    }, 5000);
  }

  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    console.log('[SessionRouter] Stopped');
  }

  getStatus() {
    return {
      enabled: this.enabled,
      activeSession: this.activeSession,
      activeBroker: this.activeBroker?.constructor?.name || null,
      transitionInProgress: this.transitionInProgress,
      lastTransitionAt: this.lastTransitionAt ? new Date(this.lastTransitionAt).toISOString() : null,
      marketPhase: getMarketPhase(new Date(this.clock())),
    };
  }
}

module.exports = SessionRouter;
