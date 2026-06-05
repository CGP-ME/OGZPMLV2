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
const path = require('path');
const { getMarketPhase, getNYTimeParts } = require('../foundation/MarketCalendar');
const { getInstance: getStateManager } = require('./StateManager');
const TransitionStore = require('./session-router/TransitionStore');

const TERMINAL_ORDER_STATUSES = new Set([
  'closed',
  'filled',
  'canceled',
  'cancelled',
  'expired',
  'rejected',
  'done'
]);
const FIAT_BALANCE_SYMBOLS = new Set([
  'USD', 'ZUSD',
  'EUR', 'ZEUR',
  'GBP', 'ZGBP',
  'CAD', 'ZCAD',
  'AUD', 'ZAUD',
  'JPY', 'ZJPY',
  'CHF', 'ZCHF'
]);

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
    this.activeCallbackEpoch = null;
    this.activeOhlcSession = null;
    this.activeOhlcBrokerId = null;
    this.activeOhlcTransitionId = null;
    this.activeOhlcCallback = null;
    this.callbackFenceStats = {
      accepted: 0,
      rejected: 0,
      lastAcceptedAt: null,
      lastRejectedAt: null,
      lastRejectedReason: null
    };
    this._callbackFenceWarnings = new Set();

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

  async start() {
    if (!this.enabled) {
      console.log('[SessionRouter] Disabled (SESSION_ROUTER_ENABLED=false) — single-broker path active');
      return;
    }
    if (!this.krakenAdapter || !this.alpacaAdapter) {
      throw new Error('[SessionRouter] Cannot start - missing broker adapters. Call wire() first.');
    }
    this._assertTransitionStoreStartSafe();

    const phase = getMarketPhase(new Date(this.clock()));
    let targetSession = 'unknown';
    try {
      targetSession = this._targetSessionFromPhase(phase, 'startup');
      if (targetSession === 'stocks') {
        await this._activateStocks();
      } else {
        await this._activateCrypto();
      }
    } catch (err) {
      console.error('[SessionRouter] Initial activation FAILED:', err.message);
      await this._enterFailedSafe('startup', targetSession, err, new Date(this.clock()), {
        pauseConfirmed: false
      });
      throw err;
    }

    this.intervalId = setInterval(() => {
      this._checkTransition().catch((err) => {
        console.error('[SessionRouter] Check failed:', err.message);
      });
    }, this.checkIntervalMs);

    console.log(`[SessionRouter] Started | initial session: ${this.activeSession}`);
  }

  _targetSessionFromPhase(phase, source) {
    if (!phase || typeof phase.isRTH !== 'boolean') {
      const phaseLabel = phase && typeof phase.phase === 'string' ? phase.phase : '(missing)';
      throw new Error(`SessionRouter ${source} market phase missing boolean isRTH (phase=${phaseLabel})`);
    }
    if (phase.phase && phase.phase !== 'rth' && phase.isRTH === true) {
      throw new Error(`SessionRouter ${source} market phase contradicts isRTH (phase=${phase.phase}, isRTH=${phase.isRTH})`);
    }
    if (phase.phase === 'rth' && phase.isRTH !== true) {
      throw new Error(`SessionRouter ${source} market phase contradicts isRTH (phase=${phase.phase}, isRTH=${phase.isRTH})`);
    }
    return phase.isRTH === true ? 'stocks' : 'crypto';
  }

  async _checkTransition() {
    if (this.transitionInProgress) return;
    if (this.failedSafeMode) return;
    const now = new Date(this.clock());
    const phase = getMarketPhase(now);
    let targetSession;
    try {
      targetSession = this._targetSessionFromPhase(phase, 'transition check');
    } catch (err) {
      await this._enterFailedSafe(this.activeSession || 'unknown', 'unknown', err, now, {
        pauseConfirmed: false
      });
      return;
    }

    if (this.activeSession === 'crypto' && targetSession === 'stocks') {
      await this._transitionToStocks(now);
      return;
    }
    if (this.activeSession === 'stocks' && targetSession === 'crypto') {
      await this._transitionToCrypto(now);
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

  _beginTransitionContext(from, to, now, details = {}) {
    if (!this.transitionStore || typeof this.transitionStore.acquireLock !== 'function') {
      throw new Error('SessionRouter transition lock unavailable');
    }

    const transitionContext = this._createTransitionContext(from, to, now, details);
    const lockResult = this.transitionStore.acquireLock(transitionContext);
    if (!lockResult || lockResult.success !== true || !lockResult.lock) {
      const reason = lockResult && lockResult.error ? lockResult.error : 'unknown transition lock failure';
      throw new Error(`SessionRouter transition lock unavailable: ${reason}`);
    }

    transitionContext.epoch = Number(lockResult.lock.epoch);
    transitionContext.lockOwnerId = lockResult.lock.ownerId || null;
    transitionContext.lockAcquiredAt = lockResult.lock.acquiredAt || null;
    transitionContext.lockReleased = false;
    return transitionContext;
  }

  _releaseTransitionLock(transitionContext) {
    if (!transitionContext || transitionContext.lockReleased) {
      return { released: false, skipped: true };
    }
    if (!this.transitionStore || typeof this.transitionStore.releaseLock !== 'function') {
      throw new Error('SessionRouter transition lock release unavailable');
    }

    const result = this.transitionStore.releaseLock({
      transitionId: transitionContext.transitionId,
      epoch: transitionContext.epoch
    });
    if (!result || result.released !== true) {
      const reason = result && result.error ? result.error : 'unknown transition lock release failure';
      throw new Error(`SessionRouter transition lock release failed: ${reason}`);
    }
    transitionContext.lockReleased = true;
    return result;
  }

  _releaseTransitionLockAfterFailure(transitionContext) {
    if (!transitionContext || transitionContext.lockReleased) return;
    try {
      this._releaseTransitionLock(transitionContext);
    } catch (err) {
      console.error('[SessionRouter] Failed to release transition lock:', err.message);
      if (this.transitionStore && typeof this.transitionStore.markRecoveryRequired === 'function') {
        try {
          this.transitionStore.markRecoveryRequired(`transition lock release failed: ${err.message}`, {
            transitionId: transitionContext.transitionId,
            epoch: transitionContext.epoch
          });
        } catch (markErr) {
          console.error('[SessionRouter] Failed to mark transition lock recovery:', markErr.message);
        }
      }
    }
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

  _brokerIntentDetails(transitionContext, brokerId, action, details = {}) {
    if (!transitionContext || !transitionContext.transitionId || !Number.isFinite(Number(transitionContext.epoch))) {
      throw new Error('SessionRouter broker intent missing durable transitionId/epoch');
    }

    const config = this.ctx && this.ctx.config ? this.ctx.config : {};
    const accountId = config.accountId;
    const executionMode = config.executionMode;
    const timeframe = details.timeframe || transitionContext.timeframe || config.timeframe || null;
    const missing = [];
    if (!brokerId) missing.push('brokerId');
    if (!accountId) missing.push('accountId');
    if (!executionMode) missing.push('executionMode');
    if (!action) missing.push('action');
    if (!timeframe) missing.push('timeframe');
    if (missing.length > 0) {
      throw new Error(`SessionRouter broker intent missing required field(s): ${missing.join(', ')}`);
    }

    return {
      transitionId: transitionContext.transitionId,
      epoch: Number(transitionContext.epoch),
      from: transitionContext.from,
      to: transitionContext.to,
      brokerId,
      accountId,
      accountIdSource: config.accountIdSource || (accountId !== 'default' ? 'config' : 'default'),
      executionMode,
      action,
      symbol: details.symbol || null,
      symbols: Array.isArray(details.symbols) ? [...details.symbols] : null,
      timeframe,
      activeSession: this.activeSession
    };
  }

  async _executeBrokerIntent(transitionContext, brokerId, action, execute, details = {}) {
    if (!this.transitionStore || typeof this.transitionStore.recordBrokerIntent !== 'function' || typeof this.transitionStore.commitBrokerIntent !== 'function') {
      throw new Error('SessionRouter broker intent store unavailable');
    }
    if (typeof execute !== 'function') {
      throw new Error(`SessionRouter broker intent ${action || '(missing)'} missing execution function`);
    }

    const intentDetails = this._brokerIntentDetails(transitionContext, brokerId, action, details);
    const intent = this.transitionStore.recordBrokerIntent(intentDetails);
    if (intent.committed) {
      return {
        intentId: intent.intentId,
        skipped: true,
        reason: 'already_committed'
      };
    }
    if (intent.pending) {
      throw new Error(`SessionRouter broker intent ${intent.intentId} already recorded without commit; recovery required before replay`);
    }
    if (intent.failed) {
      throw new Error(`SessionRouter broker intent ${intent.intentId} previously failed; recovery required before replay`);
    }

    let result;
    try {
      result = await execute();
    } catch (err) {
      const reason = err && err.message ? err.message : String(err);
      try {
        this.transitionStore.failBrokerIntent(intent.intentId, reason, intentDetails);
      } catch (recordErr) {
        throw new Error(`SessionRouter broker intent ${intent.intentId} failed and failure journal write failed: ${reason}; journalError=${recordErr.message}`);
      }
      throw err;
    }

    try {
      this.transitionStore.commitBrokerIntent(intent.intentId, intentDetails);
    } catch (err) {
      const reason = err && err.message ? err.message : String(err);
      let recoveryError = null;
      if (this.transitionStore && typeof this.transitionStore.markRecoveryRequired === 'function') {
        try {
          this.transitionStore.markRecoveryRequired(`broker intent ${intent.intentId} completed but commit failed: ${reason}`, intentDetails);
        } catch (markErr) {
          recoveryError = markErr;
        }
      }
      if (recoveryError) {
        throw new Error(`SessionRouter broker intent ${intent.intentId} broker side effect completed but commit failed: ${reason}; recovery mark failed: ${recoveryError.message}`);
      }
      throw new Error(`SessionRouter broker intent ${intent.intentId} broker side effect completed but commit failed: ${reason}`);
    }

    return {
      intentId: intent.intentId,
      skipped: false,
      result
    };
  }

  _assertTransitionStoreStartSafe() {
    const status = this._getTransitionStoreStatus();
    if (status && status.recoveryRequired) {
      const reason = status.safeModeReason || status.lastEvent || status.state || 'unknown transition-store recovery state';
      throw new Error(`SessionRouter transition store requires recovery before start: ${reason}`);
    }
  }

  _currentTimeframe() {
    const timeframe = this.ctx && this.ctx.timeframeSelector && this.ctx.timeframeSelector.currentTimeframe
      ? this.ctx.timeframeSelector.currentTimeframe
      : this.ctx && this.ctx.candleTimeframe
        ? this.ctx.candleTimeframe
        : this.ctx && this.ctx.config
          ? this.ctx.config.timeframe
          : null;
    if (!timeframe) {
      throw new Error('SessionRouter timeframe missing from runtime config');
    }
    return timeframe;
  }

  _getPatternMemoryForHandoff() {
    if (this.ctx && this.ctx.patternChecker && !this.ctx.patternChecker.memory) {
      throw new Error('SessionRouter patternChecker memory unavailable for session handoff');
    }

    const candidates = [
      this.ctx && this.ctx.patternChecker && this.ctx.patternChecker.memory,
      this.ctx && this.ctx.trai && this.ctx.trai.traiCore && this.ctx.trai.traiCore.patternMemory
    ].filter(Boolean);

    const switchable = candidates.filter((candidate) => (
      candidate && typeof candidate.switchSessionScope === 'function'
    ));
    const unique = Array.from(new Set(switchable));
    if (unique.length > 1) {
      throw new Error('SessionRouter pattern memory handoff found multiple switchable memory owners');
    }
    if (unique.length === 1) return unique[0];

    const unsafeMemory = candidates.find((candidate) => (
      candidate
      && (typeof candidate.recordOutcome === 'function' || typeof candidate.getConfidence === 'function')
      && typeof candidate.switchSessionScope !== 'function'
    ));
    if (unsafeMemory) {
      throw new Error('SessionRouter pattern memory owner lacks switchSessionScope handoff API');
    }
    return null;
  }

  _targetPatternScope(sessionName, timeframe) {
    const targetSymbols = sessionName === 'crypto' ? this.cryptoSymbols : this.stockSymbols;
    if (!Array.isArray(targetSymbols) || targetSymbols.length === 0) {
      throw new Error(`SessionRouter pattern memory handoff missing ${sessionName} symbol list`);
    }

    const config = this.ctx && this.ctx.config ? this.ctx.config : {};
    const executionMode = config.executionMode;
    const accountId = config.accountId || 'default';
    const brokerId = sessionName === 'crypto' ? 'kraken' : 'alpaca';
    const assetClass = sessionName === 'crypto' ? 'crypto' : 'stocks';
    const resolvedTimeframe = timeframe || config.timeframe || null;

    return {
      symbol: targetSymbols[0],
      brokerId,
      accountId,
      accountIdSource: config.accountIdSource || (accountId !== 'default' ? 'config' : 'default'),
      assetClass,
      executionMode,
      timeframe: resolvedTimeframe
    };
  }

  _handoffPatternMemory(targetSession, transitionContext, timeframe, details = {}) {
    const memory = this._getPatternMemoryForHandoff();
    if (!memory) {
      throw new Error('SessionRouter pattern memory unavailable for session handoff');
    }

    const scope = this._targetPatternScope(targetSession, timeframe);
    const expectedMode = scope.executionMode === 'backtest' ? 'backtest'
      : scope.executionMode === 'live' ? 'live'
        : 'paper';
    const expectedBucket = expectedMode === 'backtest' ? scope.symbol : scope.assetClass;
    const expectedStorageFile = `unified-patterns.${expectedMode}.${expectedBucket}.json`;
    const result = memory.switchSessionScope(scope, {
      reason: 'session_router_transition',
      transitionId: transitionContext && transitionContext.transitionId,
      from: transitionContext && transitionContext.from,
      to: transitionContext && transitionContext.to,
      ...details
    });
    if (!result || typeof result !== 'object' || !result.storagePath) {
      throw new Error('SessionRouter pattern memory handoff did not confirm target storage path');
    }
    if (result.switched === false && result.reason !== 'already_active') {
      throw new Error(`SessionRouter pattern memory handoff refused switch: ${result.reason || 'unknown reason'}`);
    }
    const storageFile = path.basename(result.storagePath);
    if (result.mode !== expectedMode || result.assetBucket !== expectedBucket || storageFile !== expectedStorageFile) {
      throw new Error(`SessionRouter pattern memory handoff target mismatch: expected ${expectedMode}/${expectedBucket}/${expectedStorageFile}, got ${result.mode || '(missing)'}/${result.assetBucket || '(missing)'}/${storageFile || '(missing)'}`);
    }

    const eventDetails = {
      activeSession: this.activeSession,
      patternMemory: {
        skipped: false,
        switched: Boolean(result && result.switched),
        reason: result && result.reason,
        previousPath: result && result.previousPath,
        storagePath: result && result.storagePath,
        mode: result && result.mode,
        assetBucket: result && result.assetBucket,
        patternCount: result && result.patternCount,
        loaded: result && result.loaded,
        targetExists: result && result.targetExists
      }
    };
    if (transitionContext) {
      this._recordTransitionEvent('SESSION_PATTERN_MEMORY_HANDOFF', transitionContext, eventDetails);
    }
    this.emit('pattern_memory_handoff', {
      targetSession,
      scope,
      ...eventDetails.patternMemory
    });
    return eventDetails.patternMemory;
  }

  _brokerIdFor(adapter, fallback) {
    if (adapter && typeof adapter.getBrokerName === 'function') {
      const name = adapter.getBrokerName();
      if (name) return String(name);
    }
    if (adapter && adapter.id) return String(adapter.id);
    if (adapter && adapter.name) return String(adapter.name);
    return fallback;
  }

  _nowIso() {
    return new Date(this.clock()).toISOString();
  }

  _recordOhlcFenceRejection(reason, expected) {
    const at = this._nowIso();
    this.callbackFenceStats.rejected += 1;
    this.callbackFenceStats.lastRejectedAt = at;
    this.callbackFenceStats.lastRejectedReason = reason;

    const event = {
      at,
      reason,
      expectedSession: expected.sessionName,
      expectedBrokerId: expected.brokerId,
      expectedEpoch: expected.epoch,
      expectedTransitionId: expected.transitionId,
      activeSession: this.activeSession,
      activeBrokerId: this._brokerIdFor(this.activeBroker, null),
      activeEpoch: this.activeCallbackEpoch,
      transitionInProgress: this.transitionInProgress,
      failedSafeMode: this.failedSafeMode
    };
    this.emit('ohlc_callback_rejected', event);

    const warningKey = `${reason}:${expected.sessionName}:${expected.epoch}`;
    if (!this._callbackFenceWarnings.has(warningKey)) {
      this._callbackFenceWarnings.add(warningKey);
      console.warn(`[SessionRouter] Rejected OHLC callback: ${reason} | expected=${expected.sessionName}/${expected.brokerId}/epoch:${expected.epoch} active=${this.activeSession || '(none)'}/${event.activeBrokerId || '(none)'}/epoch:${this.activeCallbackEpoch || '(none)'}`);
    }
  }

  _ohlcFenceRejectReason(expected) {
    if (this.failedSafeMode) {
      return 'failed-safe mode active';
    }
    if (this.transitionInProgress) {
      return 'transition in progress';
    }
    if (this.activeSession !== expected.sessionName) {
      return `session mismatch: active=${this.activeSession || '(none)'}`;
    }
    if (this.activeBroker !== expected.adapter) {
      return `broker mismatch: active=${this._brokerIdFor(this.activeBroker, null) || '(none)'}`;
    }
    if (this.activeCallbackEpoch !== expected.epoch) {
      return `epoch mismatch: active=${this.activeCallbackEpoch || '(none)'}`;
    }
    return null;
  }

  _buildOhlcFence(expected) {
    return (eventData) => {
      const rejectionReason = this._ohlcFenceRejectReason(expected);
      if (rejectionReason) {
        this._recordOhlcFenceRejection(rejectionReason, expected);
        return;
      }

      const at = this._nowIso();
      this.callbackFenceStats.accepted += 1;
      this.callbackFenceStats.lastAcceptedAt = at;

      const event = eventData && typeof eventData === 'object' && !Array.isArray(eventData)
        ? { ...eventData }
        : { data: eventData };
      event.sessionRouterEpoch = expected.epoch;
      event.sessionRouterTransitionId = expected.transitionId;
      event.sessionRouterSession = expected.sessionName;
      event.sessionRouterBrokerId = expected.brokerId;

      return this.onOhlcCallback(event);
    };
  }

  _attachActiveOhlcCallback(sessionName, adapter, transitionContext) {
    if (!this.onOhlcCallback || typeof this.onOhlcCallback !== 'function') {
      throw new Error('SessionRouter OHLC callback missing');
    }
    if (!adapter || typeof adapter.on !== 'function') {
      throw new Error(`SessionRouter ${sessionName} adapter cannot attach OHLC callback`);
    }
    if (!transitionContext || !Number.isFinite(Number(transitionContext.epoch))) {
      throw new Error('SessionRouter cannot attach OHLC callback without transition epoch');
    }

    const brokerId = this._brokerIdFor(adapter, null);
    if (!brokerId) {
      throw new Error(`SessionRouter ${sessionName} adapter missing broker identity for OHLC fence`);
    }
    const expected = {
      sessionName,
      adapter,
      brokerId,
      epoch: Number(transitionContext.epoch),
      transitionId: transitionContext.transitionId
    };
    const fencedCallback = this._buildOhlcFence(expected);

    this.activeCallbackEpoch = expected.epoch;
    this.activeOhlcSession = expected.sessionName;
    this.activeOhlcBrokerId = expected.brokerId;
    this.activeOhlcTransitionId = expected.transitionId;
    this.activeOhlcCallback = fencedCallback;
    adapter.on('ohlc', fencedCallback);
    return expected;
  }

  _requireBrokerMethod(adapter, brokerId, methodName) {
    if (!adapter || typeof adapter[methodName] !== 'function') {
      throw new Error(`SessionRouter broker REST reconciliation unavailable: ${brokerId} missing ${methodName}()`);
    }
    return adapter[methodName].bind(adapter);
  }

  _numericField(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  _isFiatBalanceSymbol(symbol) {
    return FIAT_BALANCE_SYMBOLS.has(String(symbol || '').toUpperCase());
  }

  _normalizeBrokerPositions(rawPositions, brokerId) {
    return rawPositions
      .map((position) => {
        const symbol = String(
          position.symbol
          || position.pair
          || position.asset
          || position.instrument
          || ''
        ).trim();
        const size = this._numericField(
          position.size,
          position.qty,
          position.quantity,
          position.amount,
          position.volume,
          position.units,
          position.position
        );
        const side = position.side || (size !== null && size < 0 ? 'short' : 'long');
        return {
          brokerId,
          symbol: symbol || '(missing)',
          side,
          size,
          unsafe: true
        };
      })
      .filter((position) => position.unsafe && !this._isFiatBalanceSymbol(position.symbol));
  }

  _normalizeBrokerOrders(rawOrders, brokerId) {
    return rawOrders
      .map((order) => {
        const status = String(order.status || '').toLowerCase();
        const amount = this._numericField(order.amount, order.qty, order.quantity, order.volume, order.size);
        const filled = this._numericField(order.filledAmount, order.filled_qty, order.executed, order.vol_exec);
        const remaining = amount !== null && filled !== null ? amount - filled : null;
        return {
          brokerId,
          orderId: order.orderId || order.id || order.txid || '(missing)',
          symbol: order.symbol || order.pair || order.instrument || '(missing)',
          side: order.side || order.type || '(missing)',
          status: status || '(missing)',
          remaining,
          unsafe: !TERMINAL_ORDER_STATUSES.has(status)
        };
      })
      .filter((order) => order.unsafe);
  }

  async _fetchBrokerRestSnapshot(adapter, brokerId) {
    const getPositions = this._requireBrokerMethod(adapter, brokerId, 'getPositions');
    const getOpenOrders = this._requireBrokerMethod(adapter, brokerId, 'getOpenOrders');
    const getBalance = this._requireBrokerMethod(adapter, brokerId, 'getBalance');

    const positionsResult = await getPositions();
    if (!Array.isArray(positionsResult)) {
      throw new Error(`SessionRouter broker REST reconciliation failed: ${brokerId}.getPositions() returned ${typeof positionsResult}, expected array`);
    }

    const ordersResult = await getOpenOrders();
    if (!Array.isArray(ordersResult)) {
      throw new Error(`SessionRouter broker REST reconciliation failed: ${brokerId}.getOpenOrders() returned ${typeof ordersResult}, expected array`);
    }

    const balanceResult = await getBalance();
    if (!balanceResult || typeof balanceResult !== 'object') {
      throw new Error(`SessionRouter broker REST reconciliation failed: ${brokerId}.getBalance() returned ${typeof balanceResult}, expected object`);
    }
    if (Object.keys(balanceResult).length === 0) {
      throw new Error(`SessionRouter broker REST reconciliation failed: ${brokerId}.getBalance() returned empty object`);
    }

    return {
      brokerId,
      openPositions: this._normalizeBrokerPositions(positionsResult, brokerId),
      openOrders: this._normalizeBrokerOrders(ordersResult, brokerId),
      balanceChecked: true
    };
  }

  async _reconcileBrokerRestBeforeActivation(sourceAdapter, targetAdapter, transitionContext, details = {}) {
    const sourceBrokerId = sourceAdapter
      ? this._brokerIdFor(sourceAdapter, details.sourceBrokerId || transitionContext.from)
      : null;
    const targetBrokerId = this._brokerIdFor(targetAdapter, details.targetBrokerId || transitionContext.to);
    const snapshots = {};

    try {
      if (sourceAdapter) {
        snapshots.source = await this._fetchBrokerRestSnapshot(sourceAdapter, sourceBrokerId);
      }
      snapshots.target = await this._fetchBrokerRestSnapshot(targetAdapter, targetBrokerId);

      const unsafeParts = [];
      for (const [role, snapshot] of Object.entries(snapshots)) {
        if (!snapshot) continue;
        if (snapshot.openPositions.length > 0) {
          unsafeParts.push(`${role} ${snapshot.brokerId} open positions=${snapshot.openPositions.length}`);
        }
        if (snapshot.openOrders.length > 0) {
          unsafeParts.push(`${role} ${snapshot.brokerId} open orders=${snapshot.openOrders.length}`);
        }
      }

      if (unsafeParts.length > 0) {
        throw new Error(`SessionRouter broker REST reconciliation blocked activation: ${unsafeParts.join('; ')}`);
      }

      this._recordTransitionEvent('SESSION_BROKER_RECONCILED', transitionContext, {
        activeSession: this.activeSession,
        brokerReconciliation: snapshots
      });
      this.emit('broker_reconciled', {
        transitionId: transitionContext.transitionId,
        from: transitionContext.from,
        to: transitionContext.to,
        sourceBrokerId,
        targetBrokerId,
        snapshots
      });
      return snapshots;
    } catch (err) {
      const reason = err && err.message ? err.message : String(err);
      this._recordTransitionEvent('SESSION_BROKER_RECONCILE_FAILED', transitionContext, {
        activeSession: this.activeSession,
        reason,
        brokerReconciliation: snapshots
      });
      throw err;
    }
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
    const lockUnavailable = reason.startsWith('SessionRouter transition lock unavailable');
    if (!lockUnavailable) {
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
    const timeframe = this._currentTimeframe();

    try {
      transitionContext = this._beginTransitionContext('crypto', 'stocks', now, {
        brokerId: 'alpaca',
        symbols: this.stockSymbols,
        timeframe
      });
      this._recordTransitionEvent('SESSION_TRANSITION_PLANNED', transitionContext, {
        activeSession: this.activeSession
      });

      await this.stateManager.pauseTrading('SessionRouter: transitioning to stocks');
      pauseConfirmed = this._stateManagerReportsPaused();
      if (!pauseConfirmed) {
        throw new Error('StateManager pauseTrading did not confirm paused state');
      }
      this._recordTransitionEvent('SESSION_FREEZE_SOURCE', transitionContext, {
        activeSession: this.activeSession,
        pauseConfirmed: true
      });

      await this._reconcileBrokerRestBeforeActivation(this.krakenAdapter, this.alpacaAdapter, transitionContext, {
        sourceBrokerId: 'kraken',
        targetBrokerId: 'alpaca'
      });

      this._handoffPatternMemory('stocks', transitionContext, timeframe);

      if (typeof this.krakenAdapter.unsubscribeAll === 'function') {
        await this._executeBrokerIntent(transitionContext, 'kraken', 'unsubscribe_all', () => (
          this.krakenAdapter.unsubscribeAll()
        ), { timeframe });
      }
      if (typeof this.krakenAdapter.removeAllListeners === 'function') {
        await this._executeBrokerIntent(transitionContext, 'kraken', 'remove_ohlc_listeners', () => (
          this.krakenAdapter.removeAllListeners('ohlc')
        ), { timeframe });
      }

      if (this.orderRouter) {
        this._recordTransitionEvent('SESSION_ORDER_INTENT_RECORDED', transitionContext, {
          activeSession: this.activeSession
        });
        await this._executeBrokerIntent(transitionContext, 'alpaca', 'register_order_router', () => (
          this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols)
        ), { symbols: this.stockSymbols, timeframe });
      }

      for (const symbol of this.stockSymbols) {
        if (typeof this.alpacaAdapter.subscribeToCandles === 'function') {
          await this._executeBrokerIntent(transitionContext, 'alpaca', 'subscribe_candles', () => (
            this.alpacaAdapter.subscribeToCandles(symbol, timeframe)
          ), { symbol, timeframe });
        }
      }

      this.activeSession = 'stocks';
      this.activeBroker = this.alpacaAdapter;
      this.lastTransitionAt = Date.now();

      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession
      });
      this._attachActiveOhlcCallback('stocks', this.alpacaAdapter, transitionContext);
      this._releaseTransitionLock(transitionContext);
      await this.stateManager.resumeTrading();
      pauseConfirmed = false;
      this.emit('transition', { from: 'crypto', to: 'stocks', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: stocks session');

    } catch (err) {
      console.error('[SessionRouter] Transition to stocks FAILED:', err.message);
      await this._enterFailedSafe('crypto', 'stocks', err, now, { pauseConfirmed, transitionContext });
    } finally {
      this._releaseTransitionLockAfterFailure(transitionContext);
      this.transitionInProgress = false;
    }
  }

  async _transitionToCrypto(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    console.log(`[SessionRouter] TRANSITION: stocks -> crypto at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);
    let pauseConfirmed = false;
    let transitionContext = null;
    const timeframe = this._currentTimeframe();

    try {
      transitionContext = this._beginTransitionContext('stocks', 'crypto', now, {
        brokerId: 'kraken',
        symbols: this.cryptoSymbols,
        timeframe
      });
      this._recordTransitionEvent('SESSION_TRANSITION_PLANNED', transitionContext, {
        activeSession: this.activeSession
      });

      await this.stateManager.pauseTrading('SessionRouter: transitioning to crypto');
      pauseConfirmed = this._stateManagerReportsPaused();
      if (!pauseConfirmed) {
        throw new Error('StateManager pauseTrading did not confirm paused state');
      }
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

      await this._reconcileBrokerRestBeforeActivation(this.alpacaAdapter, this.krakenAdapter, transitionContext, {
        sourceBrokerId: 'alpaca',
        targetBrokerId: 'kraken'
      });

      this._handoffPatternMemory('crypto', transitionContext, timeframe, {
        sourceFlatConfirmed: true
      });

      if (typeof this.alpacaAdapter.unsubscribeAll === 'function') {
        await this._executeBrokerIntent(transitionContext, 'alpaca', 'unsubscribe_all', () => (
          this.alpacaAdapter.unsubscribeAll()
        ), { timeframe });
      }
      if (typeof this.alpacaAdapter.removeAllListeners === 'function') {
        await this._executeBrokerIntent(transitionContext, 'alpaca', 'remove_ohlc_listeners', () => (
          this.alpacaAdapter.removeAllListeners('ohlc')
        ), { timeframe });
      }

      if (this.orderRouter) {
        this._recordTransitionEvent('SESSION_ORDER_INTENT_RECORDED', transitionContext, {
          activeSession: this.activeSession
        });
        await this._executeBrokerIntent(transitionContext, 'kraken', 'register_order_router', () => (
          this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols)
        ), { symbols: this.cryptoSymbols, timeframe });
      }

      // SESSION-HIGH-01: throw on empty cryptoSymbols. Same class as CRIT-03 —
      // refusing to default to BTC-USD which would route a stocks bot's crypto
      // session to the wrong instrument.
      if (!Array.isArray(this.cryptoSymbols) || this.cryptoSymbols.length === 0) {
        throw new Error('[SESSION-HIGH-01] SessionRouter.cryptoSymbols is empty/non-array — refusing to default to BTC-USD');
      }
      const primaryCrypto = this.cryptoSymbols[0];
      if (typeof this.krakenAdapter.subscribeToCandles === 'function') {
        await this._executeBrokerIntent(transitionContext, 'kraken', 'subscribe_candles', () => (
          this.krakenAdapter.subscribeToCandles(primaryCrypto, timeframe)
        ), { symbol: primaryCrypto, timeframe });
      }

      this.activeSession = 'crypto';
      this.activeBroker = this.krakenAdapter;
      this.lastTransitionAt = Date.now();

      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession
      });
      this._attachActiveOhlcCallback('crypto', this.krakenAdapter, transitionContext);
      this._releaseTransitionLock(transitionContext);
      await this.stateManager.resumeTrading();
      pauseConfirmed = false;
      this.emit('transition', { from: 'stocks', to: 'crypto', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: crypto session');

    } catch (err) {
      console.error('[SessionRouter] Transition to crypto FAILED:', err.message);
      await this._enterFailedSafe('stocks', 'crypto', err, now, { pauseConfirmed, transitionContext });
    } finally {
      this._releaseTransitionLockAfterFailure(transitionContext);
      this.transitionInProgress = false;
    }
  }

  async _activateCrypto() {
    if (this.failedSafeMode) {
      console.error('[SessionRouter] Refusing crypto activation while failed-safe mode is active');
      return;
    }
    const timeframe = this._currentTimeframe();
    // FIX MIRROR-SESSION-CRYPTO: refuse silent BTC-USD default. Same class as
    // SESSION-HIGH-01 which hardened _setActiveSession but left this mirror.
    if (!Array.isArray(this.cryptoSymbols) || this.cryptoSymbols.length === 0) {
      throw new Error('[MIRROR-SESSION-CRYPTO] SessionRouter._activateCrypto: cryptoSymbols empty/non-array — refusing BTC-USD default');
    }
    const transitionContext = this._beginTransitionContext('startup', 'crypto', new Date(this.clock()), {
      brokerId: 'kraken',
      symbols: this.cryptoSymbols,
      timeframe
    });
    try {
      await this._reconcileBrokerRestBeforeActivation(null, this.krakenAdapter, transitionContext, {
        targetBrokerId: 'kraken'
      });
      this._handoffPatternMemory('crypto', null, timeframe, {
        reason: 'initial_activation'
      });
      if (this.orderRouter) {
        await this._executeBrokerIntent(transitionContext, 'kraken', 'register_order_router', () => (
          this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols)
        ), { symbols: this.cryptoSymbols, timeframe });
      }
      const primaryCrypto = this.cryptoSymbols[0];
      if (typeof this.krakenAdapter.subscribeToCandles === 'function') {
        await this._executeBrokerIntent(transitionContext, 'kraken', 'subscribe_candles', () => (
          this.krakenAdapter.subscribeToCandles(primaryCrypto, timeframe)
        ), { symbol: primaryCrypto, timeframe });
      }
      this.activeSession = 'crypto';
      this.activeBroker = this.krakenAdapter;
      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession
      });
      this._attachActiveOhlcCallback('crypto', this.krakenAdapter, transitionContext);
      this._releaseTransitionLock(transitionContext);
      console.log('[SessionRouter] Initial activation: crypto');
    } finally {
      this._releaseTransitionLockAfterFailure(transitionContext);
    }
  }

  async _activateStocks() {
    if (this.failedSafeMode) {
      console.error('[SessionRouter] Refusing stocks activation while failed-safe mode is active');
      return;
    }
    const timeframe = this._currentTimeframe();
    const transitionContext = this._beginTransitionContext('startup', 'stocks', new Date(this.clock()), {
      brokerId: 'alpaca',
      symbols: this.stockSymbols,
      timeframe
    });
    try {
      await this._reconcileBrokerRestBeforeActivation(null, this.alpacaAdapter, transitionContext, {
        targetBrokerId: 'alpaca'
      });
      this._handoffPatternMemory('stocks', null, timeframe, {
        reason: 'initial_activation'
      });
      if (this.orderRouter) {
        await this._executeBrokerIntent(transitionContext, 'alpaca', 'register_order_router', () => (
          this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols)
        ), { symbols: this.stockSymbols, timeframe });
      }
      for (const symbol of this.stockSymbols) {
        if (typeof this.alpacaAdapter.subscribeToCandles === 'function') {
          await this._executeBrokerIntent(transitionContext, 'alpaca', 'subscribe_candles', () => (
            this.alpacaAdapter.subscribeToCandles(symbol, timeframe)
          ), { symbol, timeframe });
        }
      }
      this.activeSession = 'stocks';
      this.activeBroker = this.alpacaAdapter;
      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession
      });
      this._attachActiveOhlcCallback('stocks', this.alpacaAdapter, transitionContext);
      this._releaseTransitionLock(transitionContext);
      console.log('[SessionRouter] Initial activation: stocks');
    } finally {
      this._releaseTransitionLockAfterFailure(transitionContext);
    }
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
      callbackFence: {
        activeEpoch: this.activeCallbackEpoch,
        activeSession: this.activeOhlcSession,
        activeBrokerId: this.activeOhlcBrokerId,
        activeTransitionId: this.activeOhlcTransitionId,
        accepted: this.callbackFenceStats.accepted,
        rejected: this.callbackFenceStats.rejected,
        lastAcceptedAt: this.callbackFenceStats.lastAcceptedAt,
        lastRejectedAt: this.callbackFenceStats.lastRejectedAt,
        lastRejectedReason: this.callbackFenceStats.lastRejectedReason
      },
      transitionStore: this._getTransitionStoreStatus(),
      lastTransitionAt: this.lastTransitionAt ? new Date(this.lastTransitionAt).toISOString() : null,
      marketPhase: getMarketPhase(new Date(this.clock())),
    };
  }
}

module.exports = SessionRouter;
