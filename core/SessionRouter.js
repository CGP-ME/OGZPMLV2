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

      if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);

      const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
      for (const symbol of this.stockSymbols) {
        if (this.alpacaAdapter.subscribeToCandles) this.alpacaAdapter.subscribeToCandles(symbol, timeframe);
      }

      if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);

      this.activeSession = 'stocks';
      this.activeBroker = this.alpacaAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();

      this.emit('transition', { from: 'crypto', to: 'stocks', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: stocks session');

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
          }
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

    } catch (err) {
      console.error('[SessionRouter] Transition to crypto FAILED:', err.message);
      try { await this.stateManager.resumeTrading(); } catch (e) {}
    } finally {
      this.transitionInProgress = false;
    }
  }

  _activateCrypto() {
    this.activeSession = 'crypto';
    this.activeBroker = this.krakenAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    if (this.krakenAdapter.subscribeToCandles) this.krakenAdapter.subscribeToCandles(this.cryptoSymbols[0] || 'BTC/USD', timeframe);
    if (this.onOhlcCallback && this.krakenAdapter.on) this.krakenAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: crypto');
  }

  _activateStocks() {
    this.activeSession = 'stocks';
    this.activeBroker = this.alpacaAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    for (const symbol of this.stockSymbols) {
      if (this.alpacaAdapter.subscribeToCandles) this.alpacaAdapter.subscribeToCandles(symbol, timeframe);
    }
    if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: stocks');
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
