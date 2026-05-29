'use strict';

/**
 * SessionRouter
 *
 * Sequential dual-broker switch. Bot trades crypto 24/7 via Kraken and
 * automatically swaps to stocks via Alpaca during NYSE Regular Trading
 * Hours (09:30-16:00 ET, with half-day awareness). Only ONE feed is
 * active at a time. On RTH open: pause Kraken, start Alpaca. On RTH
 * close: force-close stock positions at the current market price, pause
 * Alpaca, resume Kraken.
 *
 * Gated by SESSION_ROUTER_ENABLED (default false). When disabled, the
 * router is constructed but start() is a no-op and the bot's existing
 * single-broker path is undisturbed.
 *
 * NYSE phase detection delegates to foundation/MarketCalendar — the
 * project's single source of truth for sessions, holidays, half-days,
 * and DST. There is no parallel calendar in this file.
 */

const EventEmitter = require('events');
const { getMarketPhase, getNYTimeParts } = require('../foundation/MarketCalendar');
const { getInstance: getStateManager } = require('./StateManager');
const TransitionStore = require('./session-router/TransitionStore');

class SessionRouter extends EventEmitter {
  constructor(config = {}) {
    super();
    this.enabled = config.enabled !== false;
    this.clock = config.clock || (() => Date.now());
    this.checkIntervalMs = config.fast ? 1000 : (config.checkIntervalMs || 60000);
    this.forceCloseOnSessionEnd = config.forceCloseOnSessionEnd !== false;

    this.krakenAdapter = null;
    this.alpacaAdapter = null;
    this.orderRouter = null;
    this.stateManager = getStateManager();
    this.transitionStore = config.transitionStore || new TransitionStore(config.transitionStoreOptions || {});

    this.activeSession = null;     // 'crypto' | 'stocks' | null
    this.activeBroker = null;
    this.transitionInProgress = false;
    this.failedSafeMode = false;
    this.failedSafeReason = null;
    this.failedSafeAt = null;
    this.failedSafePauseConfirmed = false;
    this.failedSafePauseError = null;
    this.failedSafePauseFallbackApplied = false;
    this.lastTransitionAt = 0;
    this.intervalId = null;

    // Dash-form symbols only — slash form is a path-traversal hazard
    // (path.join('data', 'BTC/USD.json') creates BTC/ subdir). Kraken's
    // native slash form is translated at the adapter boundary.
    this.stockSymbols = config.stockSymbols || ['TSLA','SPY','QQQ','NVDA','COIN','MARA','RIOT'];
    this.cryptoSymbols = config.cryptoSymbols || ['BTC-USD','ETH-USD','SOL-USD'];

    this.onOhlcCallback = null;
    this.ctx = null;

    console.log(`[SessionRouter] Initialized | enabled=${this.enabled} | interval=${this.checkIntervalMs}ms`);
  }

  /**
   * Inject broker adapters, OrderRouter, OHLC callback, and bot context.
   * Must be called before start(). The bot context (`ctx`) gives the
   * router access to `ctx.marketData.price` for force-close P&L.
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
   * Read the current market price from the bot context. Falls back to
   * the last candle in priceHistory if marketData is empty (pre-first-tick).
   * Used for force-close P&L — closePosition computes (exit - entry), so
   * passing entryPrice as exit produces $0 P&L (silent loss of records).
   */
  _getCurrentPrice() {
    if (this.ctx && this.ctx.marketData && this.ctx.marketData.price > 0) {
      return this.ctx.marketData.price;
    }
    if (this.ctx && Array.isArray(this.ctx.priceHistory) && this.ctx.priceHistory.length > 0) {
      const last = this.ctx.priceHistory[this.ctx.priceHistory.length - 1];
      if (Array.isArray(last)) return last[5] || null;             // [t,o,h,l,c,...]
      if (last && typeof last === 'object') return last.close || null;
    }
    return null;
  }

  start() {
    if (!this.enabled) {
      console.log('[SessionRouter] Disabled (SESSION_ROUTER_ENABLED=false) — single-broker path active');
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
    if (this.failedSafeMode) return;
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

  _stateManagerReportsPaused() {
    if (!this.stateManager) return false;
    if (typeof this.stateManager.get === 'function') {
      return this.stateManager.get('isTrading') === false;
    }
    return this.stateManager.state && this.stateManager.state.isTrading === false;
  }

  _applyLocalPauseFallback(reason) {
    if (!this.stateManager || !this.stateManager.state || typeof this.stateManager.state !== 'object') {
      return false;
    }

    this.stateManager.state.isTrading = false;
    this.stateManager.state.lastError = reason;
    this.stateManager.state.pauseReason = reason;
    this.stateManager.state.pausedAt = Date.now();
    return true;
  }

  _transitionAt(now) {
    return now instanceof Date ? now.toISOString() : new Date(this.clock()).toISOString();
  }

  _createTransitionContext(from, to, now, details = {}) {
    const at = this._transitionAt(now);
    const epoch = this.transitionStore && typeof this.transitionStore.nextEpoch === 'function'
      ? this.transitionStore.nextEpoch()
      : null;
    return {
      transitionId: `${from}-to-${to}-${at}`,
      epoch,
      from,
      to,
      at,
      ...details
    };
  }

  _recordTransitionEvent(eventName, transitionContext, details = {}) {
    if (!this.transitionStore || typeof this.transitionStore.recordTransitionEvent !== 'function') {
      throw new Error('SessionRouter transition journal unavailable');
    }
    if (!transitionContext || !transitionContext.transitionId || !Number.isFinite(Number(transitionContext.epoch))) {
      throw new Error('SessionRouter transition context missing durable transitionId/epoch');
    }

    return this.transitionStore.recordTransitionEvent(eventName, {
      ...transitionContext,
      ...details
    });
  }

  async _enterFailedSafe(from, to, err, now, options = {}) {
    const reason = err && err.message ? err.message : String(err);
    const at = this._transitionAt(now);
    this.failedSafeMode = true;
    this.failedSafeReason = reason;
    this.failedSafeAt = at;
    this.failedSafePauseConfirmed = Boolean(options.pauseConfirmed);
    this.failedSafePauseError = null;
    this.failedSafePauseFallbackApplied = false;

    let journalError = null;
    try {
      const transitionContext = options.transitionContext || this._createTransitionContext(from, to, now);
      this._recordTransitionEvent('SESSION_FAILED_SAFE', transitionContext, {
        reason,
        activeSession: this.activeSession
      });
    } catch (recordErr) {
      journalError = recordErr;
      console.error('[SessionRouter] Failed to record SESSION_FAILED_SAFE:', recordErr.message);
    }

    console.error(`[SessionRouter] SESSION_FAILED_SAFE: ${from} -> ${to}: ${reason}`);
    this.emit('session_failed_safe', {
      from,
      to,
      at,
      reason,
      activeSession: this.activeSession,
      journalError: journalError ? journalError.message : null
    });

    if (!this.failedSafePauseConfirmed) {
      const pauseReason = `SessionRouter failed safe: ${from} -> ${to}: ${reason}`;
      let pauseErr = null;
      if (this.stateManager && typeof this.stateManager.pauseTrading === 'function') {
        try {
          await this.stateManager.pauseTrading(pauseReason);
        } catch (errPause) {
          pauseErr = errPause;
        }
      }

      this.failedSafePauseConfirmed = this._stateManagerReportsPaused();
      if (!this.failedSafePauseConfirmed) {
        this.failedSafePauseFallbackApplied = this._applyLocalPauseFallback(pauseReason);
        this.failedSafePauseConfirmed = this._stateManagerReportsPaused();
      }

      this.failedSafePauseError = pauseErr
        ? pauseErr.message
        : (this.failedSafePauseConfirmed ? null : 'StateManager pauseTrading failed before confirming a paused state');
      this.emit('session_failed_safe_pause_fallback', {
        from,
        to,
        at,
        reason,
        fallbackApplied: this.failedSafePauseFallbackApplied,
        pauseConfirmed: this.failedSafePauseConfirmed,
        pauseError: this.failedSafePauseError
      });
      console.error('[SessionRouter] Failed-safe pause was not confirmed by StateManager pauseTrading');
    }
  }

  async _transitionToStocks(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    console.log(`[SessionRouter] TRANSITION: crypto -> stocks at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);
    let pauseConfirmed = false;
    let transitionContext = null;
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';

    try {
      transitionContext = this._createTransitionContext('crypto', 'stocks', now, {
        brokerId: 'alpaca',
        symbols: this.stockSymbols,
        timeframe
      });
      this._recordTransitionEvent('SESSION_TRANSITION_PLANNED', transitionContext, {
        activeSession: this.activeSession
      });

      await this.stateManager.pauseTrading('SessionRouter: transitioning to stocks');
      pauseConfirmed = true;
      this._recordTransitionEvent('SESSION_FREEZE_SOURCE', transitionContext, {
        activeSession: this.activeSession,
        pauseConfirmed: true
      });

      if (typeof this.krakenAdapter.unsubscribeAll === 'function') this.krakenAdapter.unsubscribeAll();
      if (typeof this.krakenAdapter.removeAllListeners === 'function') this.krakenAdapter.removeAllListeners('ohlc');

      if (this.orderRouter) {
        this._recordTransitionEvent('SESSION_ORDER_INTENT_RECORDED', transitionContext, {
          activeSession: this.activeSession
        });
        this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);
      }

      for (const symbol of this.stockSymbols) {
        if (typeof this.alpacaAdapter.subscribeToCandles === 'function') {
          this.alpacaAdapter.subscribeToCandles(symbol, timeframe);
        }
      }

      if (this.onOhlcCallback && typeof this.alpacaAdapter.on === 'function') {
        this.alpacaAdapter.on('ohlc', this.onOhlcCallback);
      }

      this.activeSession = 'stocks';
      this.activeBroker = this.alpacaAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();
      pauseConfirmed = false;
      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession
      });
      this.emit('transition', { from: 'crypto', to: 'stocks', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: stocks session');

    } catch (err) {
      console.error('[SessionRouter] Transition to stocks FAILED:', err.message);
      await this._enterFailedSafe('crypto', 'stocks', err, now, { pauseConfirmed, transitionContext });
    } finally {
      this.transitionInProgress = false;
    }
  }

  async _transitionToCrypto(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    console.log(`[SessionRouter] TRANSITION: stocks -> crypto at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);
    let pauseConfirmed = false;
    let transitionContext = null;
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';

    try {
      transitionContext = this._createTransitionContext('stocks', 'crypto', now, {
        brokerId: 'kraken',
        symbols: this.cryptoSymbols,
        timeframe
      });
      this._recordTransitionEvent('SESSION_TRANSITION_PLANNED', transitionContext, {
        activeSession: this.activeSession
      });

      await this.stateManager.pauseTrading('SessionRouter: transitioning to crypto');
      pauseConfirmed = true;
      this._recordTransitionEvent('SESSION_FREEZE_SOURCE', transitionContext, {
        activeSession: this.activeSession,
        pauseConfirmed: true
      });

      // Force-close stock positions. Each trade is closed at the SYMBOL'S
      // last-known price (StateManager tracks per-symbol prices), not a
      // single global price. This eliminates the cross-asset equity
      // corruption Mercury identified — TSLA closes at TSLA price, never
      // at BTC price. closePosition with a real recent price produces
      // accurate P&L; the original silent-$0 path (entryPrice fallback)
      // is closed at the StateManager.closePosition signature level.
      const activeTrades = this.stateManager.state && this.stateManager.state.activeTrades;
      if (activeTrades && activeTrades.size > 0) {
        if (!this.forceCloseOnSessionEnd) {
          const failures = Array.from(activeTrades.entries()).map(([orderId, trade]) => ({
            orderId,
            symbol: trade && trade.symbol,
            reason: 'forceCloseOnSessionEnd disabled with active source position'
          }));
          this._recordTransitionEvent('SESSION_SOURCE_FLAT_FAILED', transitionContext, {
            activeSession: this.activeSession,
            failures
          });
          throw new Error(`SessionRouter source force-close disabled with ${activeTrades.size} active position(s)`);
        }

          console.log(`[SessionRouter] Force-closing ${activeTrades.size} stock position(s)...`);
          const closeFailures = [];
          for (const [orderId, trade] of activeTrades.entries()) {
            try {
              const symbol = trade.symbol;
              const exitPrice = symbol && this.stateManager.getLastPrice
                ? this.stateManager.getLastPrice(symbol)
                : null;
              if (!exitPrice || exitPrice <= 0) {
                closeFailures.push({
                  orderId,
                  symbol,
                  reason: 'no last-known price'
                });
                console.error(`[SessionRouter] CANNOT force-close ${orderId} (symbol=${symbol}): no last-known price; trade left open`);
                continue;
              }
              const closeResult = await this.stateManager.closePosition(exitPrice, false, null, {
                orderId,
                exitReason: 'session_close',
                tradeId: trade.tradeId || orderId,
              });
              if (!closeResult || closeResult.success === false) {
                closeFailures.push({
                  orderId,
                  symbol,
                  reason: closeResult && closeResult.error ? closeResult.error : 'closePosition did not confirm success'
                });
                console.error(`[SessionRouter] Failed to close ${orderId}:`, closeResult && closeResult.error ? closeResult.error : 'closePosition did not confirm success');
                continue;
              }
              console.log(`[SessionRouter] Closed ${orderId} (${symbol}) at $${exitPrice}`);
            } catch (closeErr) {
              closeFailures.push({
                orderId,
                symbol: trade && trade.symbol,
                reason: closeErr.message
              });
              console.error(`[SessionRouter] Failed to close ${orderId}:`, closeErr.message);
            }
          }
          if (closeFailures.length > 0) {
            this._recordTransitionEvent('SESSION_SOURCE_FLAT_FAILED', transitionContext, {
              activeSession: this.activeSession,
              failures: closeFailures
            });
            throw new Error(`SessionRouter source force-close failed for ${closeFailures.length} position(s)`);
          }
      }

      if (typeof this.alpacaAdapter.unsubscribeAll === 'function') this.alpacaAdapter.unsubscribeAll();
      if (typeof this.alpacaAdapter.removeAllListeners === 'function') this.alpacaAdapter.removeAllListeners('ohlc');

      if (this.orderRouter) {
        this._recordTransitionEvent('SESSION_ORDER_INTENT_RECORDED', transitionContext, {
          activeSession: this.activeSession
        });
        this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);
      }

      // SESSION-HIGH-01: throw on empty cryptoSymbols. Same class as CRIT-03 —
      // refusing to default to BTC-USD which would route a stocks bot's crypto
      // session to the wrong instrument.
      if (!Array.isArray(this.cryptoSymbols) || this.cryptoSymbols.length === 0) {
        throw new Error('[SESSION-HIGH-01] SessionRouter.cryptoSymbols is empty/non-array — refusing to default to BTC-USD');
      }
      const primaryCrypto = this.cryptoSymbols[0];
      if (typeof this.krakenAdapter.subscribeToCandles === 'function') {
        this.krakenAdapter.subscribeToCandles(primaryCrypto, timeframe);
      }

      if (this.onOhlcCallback && typeof this.krakenAdapter.on === 'function') {
        this.krakenAdapter.on('ohlc', this.onOhlcCallback);
      }

      this.activeSession = 'crypto';
      this.activeBroker = this.krakenAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();
      pauseConfirmed = false;
      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession
      });
      this.emit('transition', { from: 'stocks', to: 'crypto', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: crypto session');

    } catch (err) {
      console.error('[SessionRouter] Transition to crypto FAILED:', err.message);
      await this._enterFailedSafe('stocks', 'crypto', err, now, { pauseConfirmed, transitionContext });
    } finally {
      this.transitionInProgress = false;
    }
  }

  _activateCrypto() {
    if (this.failedSafeMode) {
      console.error('[SessionRouter] Refusing crypto activation while failed-safe mode is active');
      return;
    }
    this.activeSession = 'crypto';
    this.activeBroker = this.krakenAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    // FIX MIRROR-SESSION-CRYPTO: refuse silent BTC-USD default. Same class as
    // SESSION-HIGH-01 which hardened _setActiveSession but left this mirror.
    if (!Array.isArray(this.cryptoSymbols) || this.cryptoSymbols.length === 0) {
      throw new Error('[MIRROR-SESSION-CRYPTO] SessionRouter._activateCrypto: cryptoSymbols empty/non-array — refusing BTC-USD default');
    }
    const primaryCrypto = this.cryptoSymbols[0];
    if (typeof this.krakenAdapter.subscribeToCandles === 'function') {
      this.krakenAdapter.subscribeToCandles(primaryCrypto, timeframe);
    }
    if (this.onOhlcCallback && typeof this.krakenAdapter.on === 'function') {
      this.krakenAdapter.on('ohlc', this.onOhlcCallback);
    }
    console.log('[SessionRouter] Initial activation: crypto');
  }

  _activateStocks() {
    if (this.failedSafeMode) {
      console.error('[SessionRouter] Refusing stocks activation while failed-safe mode is active');
      return;
    }
    this.activeSession = 'stocks';
    this.activeBroker = this.alpacaAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    for (const symbol of this.stockSymbols) {
      if (typeof this.alpacaAdapter.subscribeToCandles === 'function') {
        this.alpacaAdapter.subscribeToCandles(symbol, timeframe);
      }
    }
    if (this.onOhlcCallback && typeof this.alpacaAdapter.on === 'function') {
      this.alpacaAdapter.on('ohlc', this.onOhlcCallback);
    }
    console.log('[SessionRouter] Initial activation: stocks');
  }

  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    console.log('[SessionRouter] Stopped');
  }

  _getTransitionStoreStatus() {
    if (!this.transitionStore || typeof this.transitionStore.readStatus !== 'function') {
      return null;
    }

    try {
      return this.transitionStore.readStatus();
    } catch (err) {
      return {
        state: 'RECOVERY_REQUIRED',
        recoveryRequired: true,
        transitionId: null,
        epoch: null,
        freezeNewEntries: true,
        safeModeReason: `TransitionStore status read failed: ${err.message}`
      };
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      activeSession: this.activeSession,
      activeBroker: this.activeBroker && this.activeBroker.constructor && this.activeBroker.constructor.name || null,
      transitionInProgress: this.transitionInProgress,
      failedSafeMode: this.failedSafeMode,
      failedSafeReason: this.failedSafeReason,
      failedSafeAt: this.failedSafeAt,
      failedSafePauseConfirmed: this.failedSafePauseConfirmed,
      failedSafePauseError: this.failedSafePauseError,
      failedSafePauseFallbackApplied: this.failedSafePauseFallbackApplied,
      transitionStore: this._getTransitionStoreStatus(),
      lastTransitionAt: this.lastTransitionAt ? new Date(this.lastTransitionAt).toISOString() : null,
      marketPhase: getMarketPhase(new Date(this.clock())),
    };
  }
}

module.exports = SessionRouter;
