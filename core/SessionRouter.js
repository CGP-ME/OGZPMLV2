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
 * Always-on routing layer. Static profiles activate exactly one configured
 * session; scheduled profiles use the NYSE calendar transition path.
 *
 * NYSE phase detection delegates to foundation/MarketCalendar — the
 * project's single source of truth for sessions, holidays, half-days,
 * and DST. There is no parallel calendar in this file.
 */

const EventEmitter = require('events');
const path = require('path');
const { getMarketPhase, getNYTimeParts } = require('../foundation/MarketCalendar');
const { getInstance: getStateManager } = require('./StateManager');
const { createTraceId, emitTrace } = require('./TraceSpine');
const TransitionStore = require('./session-router/TransitionStore');
const { getInstance: getExitContractManager } = require('./ExitContractManager');

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
const SESSION_ROUTER_WIND_DOWN_SOURCE = 'session_router_wind_down';
const RTH_OPEN_MINUTE = 9 * 60 + 30;
const WIND_DOWN_SOFT_STOP_MINUTES = 30;
const WIND_DOWN_WARN_MINUTES = 15;
const WIND_DOWN_FORCE_FLATTEN_MINUTES = 5;

class SessionRouter extends EventEmitter {
  constructor(config = {}) {
    super();
    this.enabled = true;
    this.mode = String(config.mode || '').trim().toLowerCase();
    this.staticSession = String(config.staticSession || '').trim().toLowerCase() || null;
    if (this.mode !== 'static' && this.mode !== 'scheduled') {
      throw new Error(`[SessionRouter] mode must be static or scheduled, got ${this.mode || '(missing)'}`);
    }
    if (this.mode === 'static' && this.staticSession !== 'stocks' && this.staticSession !== 'crypto') {
      throw new Error(`[SessionRouter] staticSession must be stocks or crypto when mode=static, got ${this.staticSession || '(missing)'}`);
    }
    this.clock = config.clock || (() => Date.now());
    this.checkIntervalMs = config.fast ? 1000 : (config.checkIntervalMs || 60000);
    this.forceCloseOnSessionEnd = config.forceCloseOnSessionEnd !== false;
    this.executeTrade = typeof config.executeTrade === 'function' ? config.executeTrade : null;
    this.getExitPrice = typeof config.getExitPrice === 'function' ? config.getExitPrice : null;
    this.backtestMode = config.backtestMode === true;

    this.krakenAdapter = null;
    this.alpacaAdapter = null;
    this.orderRouter = null;

    this.activeSession = null;     // 'crypto' | 'stocks' | null
    this.activeBroker = null;
    this.transitionInProgress = false;
    this.failedSafeMode = false;
    this.failedSafeReason = null;
    this.failedSafeAt = null;
    this.failedSafePauseConfirmed = false;
    this.failedSafePauseError = null;
    this.failedSafePauseFallbackApplied = false;
    this.failedSafeEntryBlockReason = null;
    this.failedSafeEntryBlockAt = null;
    this.windDownPhase = null;
    this.windDownDirection = null;
    this.windDownStartedAt = null;
    this.windDownLastTraceAt = null;
    this.windDownFlattenComplete = false;
    this.windDownFlattenFailures = [];
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
    this.stockSymbols = Array.isArray(config.stockSymbols)
      ? config.stockSymbols
        .filter(symbol => typeof symbol === 'string' && symbol.trim())
        .map(symbol => symbol.trim().toUpperCase())
      : [];
    if ((this.mode === 'scheduled' || this.staticSession === 'stocks') && this.stockSymbols.length === 0) {
      throw new Error('[SessionRouter] stockSymbols must be explicitly provided for scheduled routing or static stocks routing');
    }
    this.cryptoSymbols = Array.isArray(config.cryptoSymbols)
      ? config.cryptoSymbols
        .filter(symbol => typeof symbol === 'string' && symbol.trim())
        .map(symbol => symbol.trim().toUpperCase().replace(/\//g, '-').replace(/^XBT/, 'BTC'))
      : [];
    if ((this.mode === 'scheduled' || this.staticSession === 'crypto') && this.cryptoSymbols.length === 0) {
      throw new Error('[SessionRouter] cryptoSymbols must be explicitly provided for scheduled routing or static crypto routing');
    }

    this.stateManager = getStateManager();
    this.transitionStore = config.transitionStore || new TransitionStore(config.transitionStoreOptions || {});

    this.onOhlcCallback = null;
    this.ctx = null;

    console.log(`[SessionRouter] Initialized | mode=${this.mode} | staticSession=${this.staticSession || '(none)'} | interval=${this.checkIntervalMs}ms`);
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

  _resolveSourceExitPrice(symbol, trade) {
    const configuredPrice = Number(this.getExitPrice?.(symbol, trade, []));
    if (Number.isFinite(configuredPrice) && configuredPrice > 0) return configuredPrice;

    const statePrice = symbol && this.stateManager?.getLastPrice
      ? Number(this.stateManager.getLastPrice(symbol))
      : null;
    if (Number.isFinite(statePrice) && statePrice > 0) return statePrice;

    return null;
  }

  _sourceTradeCloseAction(orderId, trade) {
    const tradeId = trade?.tradeId || trade?.orderId || trade?.id || orderId;
    const rawAction = typeof trade?.action === 'string' ? trade.action.trim() : '';
    const rawDirection = typeof trade?.direction === 'string' ? trade.direction.trim() : '';
    const actionSide = rawAction === 'BUY'
      ? 'long'
      : (rawAction === 'SELL_SHORT' ? 'short' : null);
    const directionSide = rawDirection === 'long' || rawDirection === 'short' ? rawDirection : null;

    if (actionSide && directionSide && actionSide !== directionSide) {
      throw new Error(`[SessionRouter] source force-close active trade direction mismatch for ${tradeId}: action=${rawAction} direction=${rawDirection}`);
    }
    const side = directionSide || actionSide;
    if (side === 'long') return 'SELL';
    if (side === 'short') return 'COVER';
    throw new Error(`[SessionRouter] source force-close active trade direction unprovable for ${tradeId}`);
  }

  async _closeSourceTradeThroughExecution(orderId, trade) {
    if (typeof this.executeTrade !== 'function') {
      throw new Error('SessionRouter source force-close requires executeTrade');
    }

    const symbol = trade?.symbol;
    const exitPrice = this._resolveSourceExitPrice(symbol, trade);
    if (!exitPrice || exitPrice <= 0) {
      throw new Error('no last-known price');
    }

    const tradeId = trade?.tradeId || trade?.orderId || trade?.id || orderId;
    const action = this._sourceTradeCloseAction(orderId, trade);
    const execution = await this.executeTrade(
      { action, confidence: 100, tradeId, exitReason: 'session_close' },
      { totalConfidence: 100 },
      exitPrice,
      {},
      [],
      null,
      null,
      symbol
    );

    const activeTrades = this.stateManager?.state?.activeTrades;
    if (activeTrades instanceof Map && (activeTrades.has(orderId) || activeTrades.has(tradeId))) {
      throw new Error('executeTrade did not close source position');
    }

    return { tradeId, symbol, action, exitPrice, execution };
  }

  _activeTradeEntries() {
    const activeTrades = this.stateManager && this.stateManager.state
      ? this.stateManager.state.activeTrades
      : null;
    if (!activeTrades) return [];
    if (activeTrades instanceof Map) return Array.from(activeTrades.entries());
    if (Array.isArray(activeTrades)) return activeTrades;
    return [];
  }

  _activeTradeCount() {
    return this._activeTradeEntries().length;
  }

  async _forceCloseSourceTradesThroughExecution(transitionContext, sourceLabel) {
    const activeTradeEntries = this._activeTradeEntries();
    if (activeTradeEntries.length === 0) {
      return { closed: [], failures: [] };
    }
    if (!this.forceCloseOnSessionEnd) {
      const failures = activeTradeEntries.map(([orderId, trade]) => ({
        orderId,
        symbol: trade && trade.symbol,
        reason: 'forceCloseOnSessionEnd disabled with active source position'
      }));
      this._recordTransitionEvent('SESSION_SOURCE_FLAT_FAILED', transitionContext, {
        activeSession: this.activeSession,
        sourceLabel,
        failures
      });
      throw new Error(`SessionRouter source force-close disabled with ${activeTradeEntries.length} active position(s)`);
    }

    console.log(`[SessionRouter] Force-closing ${activeTradeEntries.length} ${sourceLabel} position(s)...`);
    const closed = [];
    const failures = [];
    for (const [orderId, trade] of activeTradeEntries) {
      try {
        const closeResult = await this._closeSourceTradeThroughExecution(orderId, trade);
        closed.push({ orderId, ...closeResult });
        console.log(`[SessionRouter] Closed ${orderId} (${closeResult.symbol}) at $${closeResult.exitPrice}`);
      } catch (closeErr) {
        const failure = {
          orderId,
          symbol: trade && trade.symbol,
          reason: closeErr.message
        };
        failures.push(failure);
        console.error(`[SessionRouter] Failed to close ${orderId}:`, closeErr.message);
      }
    }
    if (failures.length > 0) {
      this._recordTransitionEvent('SESSION_SOURCE_FLAT_FAILED', transitionContext, {
        activeSession: this.activeSession,
        sourceLabel,
        failures
      });
      throw new Error(`SessionRouter source force-close failed for ${failures.length} position(s)`);
    }
    return { closed, failures };
  }

  async start() {
    let targetSession = 'unknown';
    try {
      const missingAdapters = [];
      if ((this.mode === 'scheduled' || this.staticSession === 'crypto') && !this.krakenAdapter) {
        missingAdapters.push('kraken');
      }
      if ((this.mode === 'scheduled' || this.staticSession === 'stocks') && !this.alpacaAdapter) {
        missingAdapters.push('alpaca');
      }
      if (missingAdapters.length > 0) {
        throw new Error(`[SessionRouter] Cannot start - missing broker adapter(s): ${missingAdapters.join(', ')}. Call wire() first.`);
      }
      this._assertTransitionStoreStartSafe();

      targetSession = this.mode === 'static'
        ? this.staticSession
        : this._targetSessionFromPhase(getMarketPhase(new Date(this.clock())), 'startup');
      if (this.mode === 'static' && this.backtestMode) {
        await this._activateStaticBacktestSession(targetSession);
      } else if (targetSession === 'stocks') {
        await this._activateStocks();
      } else {
        await this._activateCrypto();
      }
    } catch (err) {
      console.error('[SessionRouter] Initial activation FAILED:', err.message);
      await this._enterFailedSafe('startup', targetSession, err, new Date(this.clock()), {
        pauseConfirmed: false
      });
      return {
        started: false,
        failedSafe: true,
        reason: err.message || String(err),
        activeSession: this.activeSession || null,
      };
    }

    if (this.mode === 'scheduled') {
      this.intervalId = setInterval(() => {
        this._checkTransition().catch((err) => {
          this._routeScheduledTransitionFailure(err).catch((routeErr) => {
            const reason = routeErr && routeErr.message ? routeErr.message : String(routeErr);
            console.error('[SessionRouter] Check failure routing failed:', reason);
            this._emitSessionRouterTrace('SESSION_ROUTER_TRANSITION_CHECK_ROUTE_HALT', {
              reason,
              originalReason: err && err.message ? err.message : String(err),
              from: this.activeSession || 'unknown',
              to: 'unknown',
              route: 'scheduled_transition_check_failure_router',
              manualReconciliationRequired: true
            });
          });
        });
      }, this.checkIntervalMs);
    }

    console.log(`[SessionRouter] Started | initial session: ${this.activeSession}`);
    return {
      started: true,
      failedSafe: false,
      activeSession: this.activeSession,
    };
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
    if (this.mode === 'static') return;
    if (this.transitionInProgress) return;
    if (this.failedSafeMode) return;
    const now = new Date(this.clock());
    const phase = getMarketPhase(now);
    const windDownHandled = await this._handleWindDownCountdown(now, phase);
    if (windDownHandled) return;
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
      if (!(await this._readyForBoundarySwitch(now, 'crypto', 'stocks'))) return;
      await this._transitionToStocks(now);
      this._resetWindDownState();
      return;
    }
    if (this.activeSession === 'stocks' && targetSession === 'crypto') {
      if (!(await this._readyForBoundarySwitch(now, 'stocks', 'crypto'))) return;
      await this._transitionToCrypto(now);
      this._resetWindDownState();
      return;
    }
    if (this.windDownPhase) this._resetWindDownState();
  }

  _windDownCountdown(now, phase) {
    if (!this.activeSession || !phase) return null;
    const ny = getNYTimeParts(now);
    const minuteOfDay = Number(ny.minuteOfDay);
    if (!Number.isFinite(minuteOfDay)) return null;

    if (this.activeSession === 'crypto' && phase.phase === 'pre' && phase.isRTH === false) {
      return {
        from: 'crypto',
        to: 'stocks',
        minutesUntil: RTH_OPEN_MINUTE - minuteOfDay,
        boundaryMinute: RTH_OPEN_MINUTE,
        phase
      };
    }
    if (this.activeSession === 'stocks' && phase.isRTH === true) {
      const closeMinute = Number(phase.rthCloseMinute);
      if (!Number.isFinite(closeMinute)) return null;
      return {
        from: 'stocks',
        to: 'crypto',
        minutesUntil: closeMinute - minuteOfDay,
        boundaryMinute: closeMinute,
        phase
      };
    }
    return null;
  }

  async _handleWindDownCountdown(now, phase) {
    const countdown = this._windDownCountdown(now, phase);
    if (!countdown || countdown.minutesUntil > WIND_DOWN_SOFT_STOP_MINUTES || countdown.minutesUntil <= 0) {
      return false;
    }
    const phaseName = countdown.minutesUntil <= WIND_DOWN_FORCE_FLATTEN_MINUTES
      ? 'force_flatten'
      : countdown.minutesUntil <= WIND_DOWN_WARN_MINUTES
        ? 'warn'
        : 'soft_stop';
    const direction = `${countdown.from}->${countdown.to}`;
    const firstPhaseHit = this.windDownPhase !== phaseName || this.windDownDirection !== direction;
    this.windDownPhase = phaseName;
    this.windDownDirection = direction;
    this.windDownStartedAt = this.windDownStartedAt || this._transitionAt(now);
    this.windDownLastTraceAt = this._transitionAt(now);

    if (firstPhaseHit) {
      this._emitSessionRouterTrace(`SESSION_WIND_DOWN_${phaseName.toUpperCase()}`, {
        from: countdown.from,
        to: countdown.to,
        at: this._transitionAt(now),
        minutesUntil: countdown.minutesUntil,
        boundaryMinute: countdown.boundaryMinute,
        activeTrades: this._activeTradeCount(),
        route: 'session_router_boundary_wind_down_entries_blocked_exits_routable'
      });
    }
    if (this.stateManager && typeof this.stateManager.pauseTrading === 'function') {
      await this.stateManager.pauseTrading(
        `SessionRouter wind-down ${phaseName}: ${countdown.minutesUntil} min until ${countdown.to}`,
        {
          source: SESSION_ROUTER_WIND_DOWN_SOURCE,
          recoverable: true,
          scope: this._windDownPauseScope(countdown.from)
        }
      );
    }
    if (phaseName === 'force_flatten' && !this.windDownFlattenComplete) {
      await this._windDownForceFlatten(now, countdown);
    }
    return true;
  }

  async _windDownForceFlatten(now, countdown) {
    const transitionContext = this._createTransitionContext(countdown.from, countdown.to, now, {
      reason: 'wind_down_force_flatten',
      source: SESSION_ROUTER_WIND_DOWN_SOURCE,
      brokerId: this._brokerIdForSession(countdown.to),
      symbols: this._symbolsForSession(countdown.to),
      timeframe: this._currentTimeframe()
    });
    this._emitSessionRouterTrace('SESSION_WIND_DOWN_FORCE_FLATTEN_ATTEMPT', {
      from: countdown.from,
      to: countdown.to,
      at: this._transitionAt(now),
      activeTrades: this._activeTradeCount()
    });
    try {
      const result = await this._forceCloseSourceTradesThroughExecution(transitionContext, countdown.from);
      // Boundary-flat is proven at the broker, never in the ledger. The state
      // count only knows legs this process opened; broker legs unknown to state
      // are the ghost class, and only a broker read can see them.
      const brokerProof = await this._proveSourceFlatAtBroker(now, countdown, transitionContext);
      if (brokerProof.flat) {
        this.windDownFlattenComplete = true;
        this.windDownFlattenFailures = [];
        this._emitSessionRouterTrace('SESSION_WIND_DOWN_FORCE_FLATTEN_COMPLETE', {
          from: countdown.from,
          to: countdown.to,
          at: this._transitionAt(now),
          closedCount: result.closed.length,
          remainingActiveTrades: this._activeTradeCount(),
          brokerId: brokerProof.brokerId,
          brokerFlatProven: true,
          orphansFlattened: brokerProof.orphansFlattened
        });
      } else {
        this.windDownFlattenComplete = false;
        this.windDownFlattenFailures = [{ reason: brokerProof.reason }];
        this._emitSessionRouterTrace('SESSION_WIND_DOWN_FORCE_FLATTEN_PARTIAL', {
          from: countdown.from,
          to: countdown.to,
          at: this._transitionAt(now),
          reason: brokerProof.reason,
          remainingActiveTrades: this._activeTradeCount(),
          brokerId: brokerProof.brokerId,
          brokerVerified: brokerProof.verified,
          orphansFlattened: brokerProof.orphansFlattened,
          manualReconciliationRequired: true
        });
      }
    } catch (err) {
      this.windDownFlattenComplete = false;
      this.windDownFlattenFailures = [{ reason: err.message }];
      this._emitSessionRouterTrace('SESSION_WIND_DOWN_FORCE_FLATTEN_PARTIAL', {
        from: countdown.from,
        to: countdown.to,
        at: this._transitionAt(now),
        reason: err.message,
        remainingActiveTrades: this._activeTradeCount(),
        manualReconciliationRequired: true
      });
    }
  }

  _sourceAdapterForSession(sessionName) {
    if (sessionName === 'stocks') return this.alpacaAdapter;
    if (sessionName === 'crypto') return this.krakenAdapter;
    return null;
  }

  async _readSourceBrokerSnapshot(adapter, brokerId, stage, now, countdown, transitionContext) {
    try {
      return { ok: true, snapshot: await this._fetchBrokerRestSnapshot(adapter, brokerId) };
    } catch (err) {
      // Unreachable is not flat. The broker is an external boundary: detect,
      // trace, and let failed-safe govern the boundary. Nothing crosses on an
      // unverified leg and the process stays alive.
      this._emitSessionRouterTrace('SESSION_WIND_DOWN_BROKER_FLAT_UNVERIFIABLE_HALT', {
        from: countdown.from,
        to: countdown.to,
        at: this._transitionAt(now),
        brokerId,
        stage,
        reason: err.message,
        brokerErrorReason: err.reason || null,
        brokerErrorCode: err.code || null,
        route: 'session_router_wind_down_broker_unverifiable_boundary_refused',
        manualReconciliationRequired: true
      });
      await this._enterFailedSafe(countdown.from, countdown.to, err, now, {
        pauseConfirmed: this._stateManagerReportsPaused(),
        transitionContext,
        failureSource: 'wind_down_broker_flat_proof'
      });
      return { ok: false, reason: err.message };
    }
  }

  _normalizeSymbolForStateMatch(symbol) {
    if (this.stateManager && typeof this.stateManager.normalizeSymbol === 'function') {
      try {
        return this.stateManager.normalizeSymbol(String(symbol), 'SessionRouter ghost leg match');
      } catch (_) {
        // fall through to the plain form; a mismatch here only means "not tracked"
      }
    }
    return String(symbol || '').trim().toUpperCase().replace('/', '-');
  }

  _stateTracksBrokerLeg(position) {
    const target = this._normalizeSymbolForStateMatch(position.symbol);
    for (const [, trade] of this._activeTradeEntries()) {
      if (!trade || typeof trade !== 'object') continue;
      if (this._normalizeSymbolForStateMatch(trade.symbol) !== target) continue;
      const direction = trade.direction === 'long' || trade.direction === 'short'
        ? trade.direction
        : (trade.action === 'BUY' ? 'long' : (trade.action === 'SELL_SHORT' ? 'short' : null));
      if (direction === position.side) return true;
    }
    return false;
  }

  _staleBrokerOrphanExitContract(timeframe) {
    const contract = getExitContractManager().createExitContract('STALE_BROKER_ORPHAN', {}, { timeframe });
    return {
      ...contract,
      // A ghost leg has no structural levels; declaring false is the truth,
      // and the explicit boolean is what exit ownership requires.
      useStructuralExits: typeof contract.useStructuralExits === 'boolean' ? contract.useStructuralExits : false,
      strategyName: 'STALE_BROKER_ORPHAN',
      owner: SESSION_ROUTER_WIND_DOWN_SOURCE
    };
  }

  async _registerStaleBrokerOrphan({ position, tradeId, brokerId, adapter, countdown, transitionContext, orphanFields }) {
    if (!this.stateManager || typeof this.stateManager.openPosition !== 'function') {
      return { ok: false, reason: 'stateManager.openPosition unavailable' };
    }
    // Ruled: symbol, side, quantity, and entry come from the broker's own
    // answer. Anything the broker did not say is named missing, not filled.
    const entryPrice = Number(position.entryPrice);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return { ok: false, reason: `broker answer carries no entry price for ${position.symbol}; refusing to fabricate a cost basis` };
    }
    const quantity = Number(position.size);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, reason: `broker answer carries no positive quantity for ${position.symbol}` };
    }
    const direction = position.side === 'long' || position.side === 'short' ? position.side : null;
    if (!direction) {
      return { ok: false, reason: `broker answer side unprovable for ${position.symbol} (${position.side})` };
    }
    let scope;
    try {
      scope = this._buildRuntimeScopeForSession(countdown.from, this._currentTimeframe(), adapter);
    } catch (err) {
      return { ok: false, reason: `runtime scope unavailable: ${err.message}` };
    }
    let exitContract;
    try {
      exitContract = this._staleBrokerOrphanExitContract(scope.timeframe);
    } catch (err) {
      return { ok: false, reason: `exit contract unavailable: ${err.message}` };
    }
    // Same two-value table OrderExecutor._orderQuantityUnit applies to the
    // session asset classes; the exit plan rejects any other unit.
    const quantityUnit = scope.assetClass === 'stocks' ? 'shares' : 'base';
    const sizeUsd = quantity * entryPrice;
    const registeredAt = orphanFields.at;
    const context = {
      orderId: tradeId,
      tradeId,
      action: direction === 'long' ? 'BUY' : 'SELL_SHORT',
      direction,
      entryStrategy: 'STALE_BROKER_ORPHAN',
      symbol: position.symbol,
      brokerId: scope.brokerId,
      accountId: scope.accountId,
      accountIdSource: scope.accountIdSource,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      entryOrderQuantity: quantity,
      entryOrderQuantityUnit: quantityUnit,
      remainingOrderQuantity: quantity,
      remainingOrderQuantityUnit: quantityUnit,
      exitContract,
      provenance: 'STALE_BROKER_ORPHAN',
      quarantined: true,
      operationalQuarantine: {
        code: 'STALE_BROKER_ORPHAN',
        reason: 'broker leg unknown to state; registered from broker truth for exit only',
        registeredBy: SESSION_ROUTER_WIND_DOWN_SOURCE,
        brokerId,
        registeredAt,
        entryPriceSource: 'broker_answer',
        quantitySource: 'broker_answer',
        eligibleFor: ['exit']
      },
      entryTime: this.clock(),
      traceId: createTraceId('trace')
    };

    let result;
    try {
      result = await this.stateManager.openPosition(sizeUsd, entryPrice, context);
    } catch (err) {
      return { ok: false, reason: `openPosition threw: ${err.message}` };
    }
    if (!result || result.success !== true) {
      return { ok: false, reason: result && result.error ? result.error : 'openPosition rejected registration' };
    }
    const activeTrades = this.stateManager.state?.activeTrades;
    const trade = activeTrades instanceof Map ? activeTrades.get(tradeId) : null;
    if (!trade) {
      return { ok: false, reason: 'registered orphan missing from activeTrades after openPosition' };
    }

    this._recordTransitionEvent('SESSION_STALE_BROKER_ORPHAN_REGISTERED', transitionContext, {
      activeSession: this.activeSession,
      brokerId,
      tradeId,
      symbol: position.symbol,
      side: direction,
      size: quantity,
      entryPrice,
      sizeUsd,
      quantityUnit,
      scope
    });
    this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
      ...orphanFields,
      stage: 'registered',
      sizeUsd,
      quantityUnit,
      eligibleFor: ['exit'],
      manualReconciliationRequired: true
    });
    return { ok: true, trade, tradeId };
  }

  async _proveSourceFlatAtBroker(now, countdown, transitionContext) {
    const adapter = this._sourceAdapterForSession(countdown.from);
    const brokerId = this._brokerIdFor(adapter, this._brokerIdForSession(countdown.from));
    const base = {
      from: countdown.from,
      to: countdown.to,
      at: this._transitionAt(now),
      brokerId
    };

    const initial = await this._readSourceBrokerSnapshot(adapter, brokerId, 'initial', now, countdown, transitionContext);
    if (!initial.ok) {
      return { flat: false, verified: false, reason: initial.reason, brokerId, orphansFlattened: 0 };
    }

    const standing = initial.snapshot.openPositions;
    let orphansFlattened = 0;
    if (standing.length > 0 && !this.forceCloseOnSessionEnd) {
      this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
        ...base,
        tag: 'STALE_BROKER_ORPHAN',
        stage: 'detected_force_close_disabled',
        orphans: standing.map((position) => ({ symbol: position.symbol, side: position.side, size: position.size })),
        manualReconciliationRequired: true
      });
    }
    if (standing.length > 0 && this.forceCloseOnSessionEnd) {
      if (!(this.windDownOrphanAttempts instanceof Map)) this.windDownOrphanAttempts = new Map();
      for (const position of standing) {
        // Each ghost leg is its own cell: registered into state from broker
        // truth, then closed through the ordinary exit path, with its own
        // journal entries and traces at registration and at close.
        const orphanKey = `${brokerId}:${position.symbol}:${position.side}`;
        const tradeId = `STALE_BROKER_ORPHAN:${orphanKey}`;
        const orphanFields = {
          ...base,
          tag: 'STALE_BROKER_ORPHAN',
          tradeId,
          symbol: position.symbol,
          side: position.side,
          size: position.size,
          entryPrice: position.entryPrice
        };
        const failureDetails = (reason) => ({
          activeSession: this.activeSession,
          brokerId,
          tradeId,
          symbol: position.symbol,
          side: position.side,
          size: position.size,
          reason
        });

        if (this._stateTracksBrokerLeg(position)) {
          // State already knows this leg; it is not a ghost. The state flatten
          // owns it and the re-read below still decides flat.
          this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
            ...orphanFields,
            stage: 'state_tracked_skip'
          });
          continue;
        }

        const priorAttempt = this.windDownOrphanAttempts.get(orphanKey);
        if (priorAttempt) {
          // Ruled: if the close fails again the boundary stays shut and
          // failed-safe governs. A leg still standing after the ordinary
          // close claimed success is that failure; never register it twice.
          const reason = `broker leg ${position.symbol} ${position.side} still standing after ordinary close of ${priorAttempt.tradeId} at ${priorAttempt.at}`;
          this._recordTransitionEvent('SESSION_STALE_BROKER_ORPHAN_FLATTEN_FAILED', transitionContext, failureDetails(reason));
          this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
            ...orphanFields,
            stage: 'still_standing_after_close',
            reason,
            manualReconciliationRequired: true
          });
          await this._enterFailedSafe(countdown.from, countdown.to, new Error(reason), now, {
            pauseConfirmed: this._stateManagerReportsPaused(),
            transitionContext,
            failureSource: 'wind_down_orphan_close_failed_again'
          });
          return { flat: false, verified: true, reason, brokerId, orphansFlattened };
        }

        this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
          ...orphanFields,
          stage: 'detected',
          manualReconciliationRequired: true
        });

        const registration = await this._registerStaleBrokerOrphan({
          position, tradeId, brokerId, adapter, countdown, transitionContext, orphanFields
        });
        if (!registration.ok) {
          // Fallback floor: detected, loud, journaled, boundary shut. The leg
          // waits for an operator; nothing is fabricated to force it through.
          this._recordTransitionEvent('SESSION_STALE_BROKER_ORPHAN_FLATTEN_FAILED', transitionContext, failureDetails(registration.reason));
          this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
            ...orphanFields,
            stage: 'register_refused',
            reason: registration.reason,
            manualReconciliationRequired: true
          });
          continue;
        }
        this.windDownOrphanAttempts.set(orphanKey, { tradeId, at: base.at });

        let closeResult = null;
        let closeFailure = null;
        try {
          closeResult = await this._closeSourceTradeThroughExecution(tradeId, registration.trade);
        } catch (closeErr) {
          closeFailure = closeErr;
        }
        if (!closeFailure && closeResult.execution && closeResult.execution.success === false) {
          const stillInState = this.stateManager?.state?.activeTrades instanceof Map
            && this.stateManager.state.activeTrades.has(tradeId);
          if (stillInState) {
            closeFailure = new Error(`executeTrade refused orphan close: ${closeResult.execution.reason || closeResult.execution.detail || 'unknown'}`);
          } else {
            // Another exit path closed the registered leg first. That is an
            // exit, which is the only thing the record was eligible for; the
            // re-read below is still the only proof of flat.
            this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
              ...orphanFields,
              stage: 'closed_outside_wind_down',
              reason: closeResult.execution.reason || null
            });
            continue;
          }
        }
        if (closeFailure) {
          // Ruled: the registered identity satisfied KILL-5 and the ordinary
          // close still failed. Boundary shut, failed-safe governs, loud.
          this._recordTransitionEvent('SESSION_STALE_BROKER_ORPHAN_FLATTEN_FAILED', transitionContext, failureDetails(closeFailure.message));
          this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
            ...orphanFields,
            stage: 'flatten_failed',
            reason: closeFailure.message,
            manualReconciliationRequired: true
          });
          await this._enterFailedSafe(countdown.from, countdown.to, closeFailure, now, {
            pauseConfirmed: this._stateManagerReportsPaused(),
            transitionContext,
            failureSource: 'wind_down_orphan_close_failed'
          });
          return { flat: false, verified: true, reason: closeFailure.message, brokerId, orphansFlattened };
        }
        orphansFlattened += 1;
        this._recordTransitionEvent('SESSION_STALE_BROKER_ORPHAN_FLATTENED', transitionContext, {
          activeSession: this.activeSession,
          brokerId,
          tradeId,
          symbol: closeResult.symbol,
          side: position.side,
          size: position.size,
          action: closeResult.action,
          exitPrice: closeResult.exitPrice
        });
        this._emitSessionRouterTrace('SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION', {
          ...orphanFields,
          stage: 'flattened',
          action: closeResult.action,
          exitPrice: closeResult.exitPrice
        });
      }
    }

    // Final rung: only the broker reporting [] proves flat. A successful close
    // call is state-side evidence and does not count; re-read after any flatten.
    const needsReread = standing.length > 0 || initial.snapshot.openOrders.length > 0;
    const proof = needsReread
      ? await this._readSourceBrokerSnapshot(adapter, brokerId, 'post_flatten', now, countdown, transitionContext)
      : initial;
    if (!proof.ok) {
      return { flat: false, verified: false, reason: proof.reason, brokerId, orphansFlattened };
    }

    const openPositions = proof.snapshot.openPositions.length;
    const openOrders = proof.snapshot.openOrders.length;
    const flat = openPositions === 0 && openOrders === 0;
    if (flat) {
      this._emitSessionRouterTrace('SESSION_WIND_DOWN_BROKER_FLAT_PROVEN', {
        ...base,
        openPositions,
        openOrders,
        orphansFlattened
      });
    } else {
      this._emitSessionRouterTrace('SESSION_WIND_DOWN_BROKER_NOT_FLAT_RECONCILIATION', {
        ...base,
        openPositions,
        openOrders,
        orphansFlattened,
        route: 'session_router_wind_down_broker_not_flat_boundary_refused',
        manualReconciliationRequired: true
      });
    }
    return {
      flat,
      verified: true,
      reason: flat ? null : `broker ${brokerId} not flat: positions=${openPositions} orders=${openOrders}`,
      brokerId,
      orphansFlattened
    };
  }

  async _readyForBoundarySwitch(now, from, to) {
    const activeTrades = this._activeTradeCount();
    if (activeTrades > 0) {
      this.windDownPhase = 'switch_blocked';
      this.windDownDirection = `${from}->${to}`;
      this.windDownLastTraceAt = this._transitionAt(now);
      this._emitSessionRouterTrace('SESSION_WIND_DOWN_SWITCH_BLOCKED_ACTIVE_TRADES', {
        from,
        to,
        at: this._transitionAt(now),
        activeTrades,
        route: 'session_router_boundary_switch_waiting_for_flat_source',
        manualReconciliationRequired: true
      });
    }
    // Boundary-flat is proven at the broker on every crossing, in both
    // directions. A zero state count is not evidence.
    await this._windDownForceFlatten(now, {
      from,
      to,
      minutesUntil: 0,
      boundaryMinute: null,
      phase: null
    });
    return this.windDownFlattenComplete;
  }

  _resetWindDownState() {
    this.windDownPhase = null;
    this.windDownDirection = null;
    this.windDownStartedAt = null;
    this.windDownLastTraceAt = null;
    this.windDownFlattenComplete = false;
    this.windDownFlattenFailures = [];
    this.windDownOrphanAttempts = new Map();
  }

  _windDownPauseScope(sessionName) {
    const config = this.ctx && this.ctx.config ? this.ctx.config : {};
    const symbols = this._symbolsForSession(sessionName);
    return {
      symbol: Array.isArray(symbols) && symbols.length > 0 ? symbols[0] : null,
      timeframe: this.ctx?.timeframeSelector?.currentTimeframe || this.ctx?.candleTimeframe || config.timeframe || null,
      brokerId: this._brokerIdForSession(sessionName),
      accountId: config.accountId || null,
      assetClass: this._assetClassForSession(sessionName),
      executionMode: config.executionMode || null
    };
  }

  async _resumeSessionRouterPauseAfterActivation(sessionName) {
    if (!this._stateManagerReportsPaused()) return { resumed: false, reason: 'not_paused' };
    if (!this.stateManager || typeof this.stateManager.resumeTradingIfPausedBy !== 'function') {
      this._emitSessionRouterTrace('SESSION_ROUTER_STARTUP_PAUSE_LEFT_IN_PLACE', {
        activeSession: sessionName,
        reason: 'resumeTradingIfPausedBy unavailable',
        route: 'startup_activation_does_not_clear_unowned_pause',
        manualReconciliationRequired: true
      });
      return { resumed: false, reason: 'resume_unavailable' };
    }

    const result = await this.stateManager.resumeTradingIfPausedBy(SESSION_ROUTER_WIND_DOWN_SOURCE, {
      allowLegacyUnscoped: true,
      legacyReasonPrefixes: [
        'SessionRouter wind-down',
        'SessionRouter: transitioning'
      ],
      scope: this._windDownPauseScope(sessionName),
      resumeSource: 'session_router_startup_activation',
      reason: `SessionRouter startup activation confirmed ${sessionName}`
    });
    this._emitSessionRouterTrace(result && result.success === true
      ? 'SESSION_ROUTER_STARTUP_PAUSE_RESUME'
      : 'SESSION_ROUTER_STARTUP_PAUSE_LEFT_IN_PLACE', {
      activeSession: sessionName,
      result: result || null,
      route: 'startup_activation_session_router_pause_recovery',
      manualReconciliationRequired: !(result && result.success === true)
    });
    return result;
  }

  _stateManagerReportsPaused() {
    if (!this.stateManager) return false;
    if (typeof this.stateManager.get === 'function') {
      return this.stateManager.get('isTrading') === false;
    }
    return this.stateManager.state && this.stateManager.state.isTrading === false;
  }

  _applyLocalPauseFallback(reason) {
    console.error(`[SessionRouter] Refusing direct StateManager pause fallback: ${reason}`);
    return false;
  }

  _emitSessionRouterTrace(eventName, fields = {}) {
    const traceId = fields.traceId || createTraceId('session_router', () => this.clock());
    emitTrace(this.ctx || {}, eventName, {
      traceId,
      ...fields
    });
    return traceId;
  }

  async _routeScheduledTransitionFailure(err) {
    const reason = err && err.message ? err.message : String(err);
    const now = new Date(this.clock());
    const from = this.activeSession || 'unknown';
    console.error('[SessionRouter] Check failed:', reason);
    await this._enterFailedSafe(from, 'unknown', err, now, {
      pauseConfirmed: false,
      failureSource: 'scheduled_transition_check'
    });
  }

  getEntryBlockStatus() {
    if (this.windDownPhase) {
      return {
        blocked: true,
        reason: `SessionRouter wind-down phase=${this.windDownPhase} direction=${this.windDownDirection || 'unknown'}`,
        at: this.windDownLastTraceAt || this.windDownStartedAt || null,
        pauseConfirmed: this._stateManagerReportsPaused(),
        pauseError: null,
        activeSession: this.activeSession,
        source: SESSION_ROUTER_WIND_DOWN_SOURCE,
        windDownPhase: this.windDownPhase,
        windDownDirection: this.windDownDirection,
        windDownFlattenComplete: this.windDownFlattenComplete,
        windDownFlattenFailures: this.windDownFlattenFailures
      };
    }
    if (this.failedSafeMode !== true) {
      return { blocked: false };
    }
    return {
      blocked: true,
      reason: this.failedSafeEntryBlockReason || `SessionRouter failed safe: ${this.failedSafeReason || 'unknown'}`,
      at: this.failedSafeEntryBlockAt || this.failedSafeAt || null,
      pauseConfirmed: this.failedSafePauseConfirmed,
      pauseError: this.failedSafePauseError,
      activeSession: this.activeSession
    };
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
          this._emitSessionRouterTrace('SESSION_ROUTER_TRANSITION_RECOVERY_HALT', {
            reason: markErr.message,
            originalReason: err.message,
            transitionId: transitionContext.transitionId,
            epoch: transitionContext.epoch,
            from: transitionContext.from,
            to: transitionContext.to,
            route: 'transition_lock_recovery_mark_failed',
            manualReconciliationRequired: true
          });
          this.emit('transition_lock_recovery_mark_failed', {
            transitionId: transitionContext.transitionId,
            epoch: transitionContext.epoch,
            from: transitionContext.from,
            to: transitionContext.to,
            reason: markErr.message,
            originalReason: err.message
          });
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

  _brokerIdForSession(sessionName) {
    if (sessionName === 'crypto') return 'kraken';
    if (sessionName === 'stocks') return 'alpaca';
    return null;
  }

  _assetClassForSession(sessionName) {
    if (sessionName === 'crypto') return 'crypto';
    if (sessionName === 'stocks') return 'stocks';
    return null;
  }

  _symbolsForSession(sessionName) {
    return sessionName === 'crypto' ? this.cryptoSymbols : this.stockSymbols;
  }

  _cleanRuntimeAccountId(value) {
    if (value === null || value === undefined) return null;
    const cleaned = String(value).trim();
    return cleaned && cleaned !== 'default' ? cleaned : null;
  }

  _accountIdentityForRuntimeScope(adapter, brokerId) {
    const config = this.ctx && this.ctx.config ? this.ctx.config : {};
    const adapterIdentity = typeof adapter?.getAccountIdentity === 'function'
      ? adapter.getAccountIdentity()
      : null;
    const adapterAccountId = this._cleanRuntimeAccountId(adapterIdentity?.accountId || adapter?.accountId);
    if (adapterAccountId) {
      return {
        accountId: adapterAccountId,
        accountIdSource: adapterIdentity?.accountIdSource || adapterIdentity?.source || 'broker:adapter'
      };
    }

    const configBrokerId = this._cleanRuntimeAccountId(config.brokerId)?.toLowerCase() || null;
    const configAccountId = this._cleanRuntimeAccountId(config.accountId);
    if (configAccountId && (!configBrokerId || configBrokerId === brokerId)) {
      return {
        accountId: configAccountId,
        accountIdSource: config.accountIdSource || 'config'
      };
    }

    return { accountId: null, accountIdSource: null };
  }

  _buildRuntimeScopeForSession(sessionName, timeframe, adapter) {
    const brokerId = this._brokerIdForSession(sessionName);
    const assetClass = this._assetClassForSession(sessionName);
    const symbols = this._symbolsForSession(sessionName);
    const symbol = Array.isArray(symbols) && symbols.length > 0 ? symbols[0] : null;
    const config = this.ctx && this.ctx.config ? this.ctx.config : {};
    const executionMode = config.executionMode || null;
    const accountIdentity = this._accountIdentityForRuntimeScope(adapter, brokerId);
    const scope = {
      symbol,
      brokerId,
      accountId: accountIdentity.accountId,
      accountIdSource: accountIdentity.accountIdSource,
      assetClass,
      executionMode,
      timeframe
    };
    const missing = [];
    for (const field of ['symbol', 'brokerId', 'accountId', 'accountIdSource', 'assetClass', 'executionMode', 'timeframe']) {
      if (!scope[field]) missing.push(field);
    }
    if (scope.accountId === 'default' || scope.accountIdSource === 'default') {
      missing.push('verifiedAccountIdentity');
    }
    if (missing.length > 0) {
      throw new Error(`SessionRouter ${sessionName} runtime scope missing required field(s): ${Array.from(new Set(missing)).join(', ')}`);
    }
    return scope;
  }

  _syncDashboardRuntimeScopeForSession(sessionName, scope) {
    if (!this.stateManager || typeof this.stateManager.setDashboardRuntimeScope !== 'function') {
      throw new Error('SessionRouter dashboard runtime scope writer unavailable');
    }
    const dashboardScope = this.stateManager.setDashboardRuntimeScope(scope);
    if (!dashboardScope || dashboardScope.scopeComplete !== true) {
      const missingFields = Array.isArray(dashboardScope?.missingFields)
        ? dashboardScope.missingFields.join(', ')
        : 'unknown';
      throw new Error(`SessionRouter ${sessionName} dashboard runtime scope incomplete: ${missingFields}`);
    }
    return {
      ...scope,
      scopeKey: dashboardScope.scopeKey || null,
      scopeKeyVersion: dashboardScope.scopeKeyVersion || null,
      runtimeScopeStatus: dashboardScope.runtimeScopeStatus || null,
      scopeComplete: dashboardScope.scopeComplete === true
    };
  }

  _assertRuntimeScopeForSession(sessionName, runtimeScope) {
    const expectedSymbol = this._symbolsForSession(sessionName)?.[0] || null;
    const expectedBrokerId = this._brokerIdForSession(sessionName);
    const expectedAssetClass = this._assetClassForSession(sessionName);
    const missing = [];
    for (const field of ['symbol', 'brokerId', 'accountId', 'accountIdSource', 'assetClass', 'executionMode', 'timeframe']) {
      if (!runtimeScope || !runtimeScope[field]) missing.push(field);
    }
    if (missing.length > 0) {
      throw new Error(`SessionRouter ${sessionName} transition runtime scope missing field(s): ${missing.join(', ')}`);
    }
    const mismatches = [];
    if (runtimeScope.symbol !== expectedSymbol) mismatches.push(`symbol expected ${expectedSymbol} got ${runtimeScope.symbol}`);
    if (runtimeScope.brokerId !== expectedBrokerId) mismatches.push(`brokerId expected ${expectedBrokerId} got ${runtimeScope.brokerId}`);
    if (runtimeScope.assetClass !== expectedAssetClass) mismatches.push(`assetClass expected ${expectedAssetClass} got ${runtimeScope.assetClass}`);
    if (runtimeScope.accountId === 'default' || runtimeScope.accountIdSource === 'default') mismatches.push('account identity is default');
    if (runtimeScope.scopeComplete !== true) mismatches.push('scopeComplete is not true');
    if (this.activeSession && this.activeSession !== sessionName) {
      mismatches.push(`activeSession expected ${sessionName} got ${this.activeSession}`);
    }
    if (mismatches.length > 0) {
      throw new Error(`SessionRouter ${sessionName} transition runtime scope mismatch: ${mismatches.join('; ')}`);
    }
    return true;
  }

  _transitionEvent(from, to, now, runtimeScope) {
    this._assertRuntimeScopeForSession(to, runtimeScope);
    return {
      from,
      to,
      at: now.toISOString(),
      symbol: runtimeScope.symbol,
      runtimeScope
    };
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
        // Entry price is carried only when the broker's own answer has it;
        // null here means "broker did not say", never a substitute.
        const entryPrice = this._numericField(
          position.entryPrice,
          position.avgEntryPrice,
          position.avg_entry_price,
          position.averagePrice,
          position.costBasisPrice
        );
        return {
          brokerId,
          symbol: symbol || '(missing)',
          side,
          size,
          entryPrice,
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
    this.failedSafeEntryBlockReason = `SessionRouter failed safe: ${from} -> ${to}: ${reason}`;
    this.failedSafeEntryBlockAt = at;

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
    const failedSafeJournalWriteFailed = Boolean(journalError);

    console.error(`[SessionRouter] SESSION_FAILED_SAFE: ${from} -> ${to}: ${reason}`);
    this._emitSessionRouterTrace('SESSION_ROUTER_FAILED_SAFE_HALT', {
      reason,
      from,
      to,
      at,
      activeSession: this.activeSession,
      failureSource: options.failureSource || null,
      journalError: journalError ? journalError.message : null,
      failedSafeJournalWriteFailed,
      manualReconciliationRequired: failedSafeJournalWriteFailed,
      reconciliationMarker: failedSafeJournalWriteFailed ? 'failed_safe_journal_write_failed' : null
    });
    this.emit('session_failed_safe', {
      from,
      to,
      at,
      reason,
      activeSession: this.activeSession,
      journalError: journalError ? journalError.message : null,
      failedSafeJournalWriteFailed,
      manualReconciliationRequired: failedSafeJournalWriteFailed
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
      if (!this.failedSafePauseConfirmed) {
        this._emitSessionRouterTrace('SESSION_ROUTER_FAILED_SAFE_PAUSE_HALT_UNCONFIRMED', {
          reason,
          from,
          to,
          at,
          pauseError: this.failedSafePauseError,
          fallbackApplied: this.failedSafePauseFallbackApplied,
          manualReconciliationRequired: true
        });
      }
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
      const runtimeScope = this._buildRuntimeScopeForSession('stocks', timeframe, this.alpacaAdapter);
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

      await this._forceCloseSourceTradesThroughExecution(transitionContext, 'crypto');
      await this._reconcileBrokerRestBeforeActivation(this.krakenAdapter, this.alpacaAdapter, transitionContext, {
        sourceBrokerId: 'kraken',
        targetBrokerId: 'alpaca'
      });

      this._handoffPatternMemory('stocks', transitionContext, timeframe, {
        sourceFlatConfirmed: true
      });

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

      this._attachActiveOhlcCallback('stocks', this.alpacaAdapter, transitionContext);
      const committedRuntimeScope = this._syncDashboardRuntimeScopeForSession('stocks', runtimeScope);
      const transitionEvent = this._transitionEvent('crypto', 'stocks', now, committedRuntimeScope);
      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession,
        runtimeScope: committedRuntimeScope,
        runtimeScopeStatus: committedRuntimeScope.runtimeScopeStatus,
        scopeComplete: committedRuntimeScope.scopeComplete
      });
      this._releaseTransitionLock(transitionContext);
      await this.stateManager.resumeTrading();
      pauseConfirmed = false;
      this.emit('transition', transitionEvent);
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
      const runtimeScope = this._buildRuntimeScopeForSession('crypto', timeframe, this.krakenAdapter);
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

      await this._forceCloseSourceTradesThroughExecution(transitionContext, 'stock');

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

      this._attachActiveOhlcCallback('crypto', this.krakenAdapter, transitionContext);
      const committedRuntimeScope = this._syncDashboardRuntimeScopeForSession('crypto', runtimeScope);
      const transitionEvent = this._transitionEvent('stocks', 'crypto', now, committedRuntimeScope);
      this._recordTransitionEvent('SESSION_TARGET_ACTIVATED', transitionContext, {
        activeSession: this.activeSession,
        runtimeScope: committedRuntimeScope,
        runtimeScopeStatus: committedRuntimeScope.runtimeScopeStatus,
        scopeComplete: committedRuntimeScope.scopeComplete
      });
      this._releaseTransitionLock(transitionContext);
      await this.stateManager.resumeTrading();
      pauseConfirmed = false;
      this.emit('transition', transitionEvent);
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
      this._handoffPatternMemory('crypto', transitionContext, timeframe, {
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
      await this._resumeSessionRouterPauseAfterActivation('crypto');
      this._releaseTransitionLock(transitionContext);
      console.log('[SessionRouter] Initial activation: crypto');
    } finally {
      this._releaseTransitionLockAfterFailure(transitionContext);
    }
  }

  async _activateStaticBacktestSession(targetSession) {
    const adapter = targetSession === 'stocks' ? this.alpacaAdapter : this.krakenAdapter;
    const symbols = targetSession === 'stocks' ? this.stockSymbols : this.cryptoSymbols;
    const brokerId = targetSession === 'stocks' ? 'alpaca' : 'kraken';

    if (this.orderRouter) {
      await this.orderRouter.registerBroker(adapter, symbols);
    }

    this.activeSession = targetSession;
    this.activeBroker = adapter;
    this.lastTransitionAt = this.clock();
    this.activeCallbackEpoch = null;
    this.activeOhlcSession = null;
    this.activeOhlcBrokerId = null;
    this.activeOhlcTransitionId = null;
    this.activeOhlcCallback = null;

    console.log(`[SessionRouter] Static backtest activation: ${targetSession} (${brokerId})`);
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
      this._handoffPatternMemory('stocks', transitionContext, timeframe, {
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
      await this._resumeSessionRouterPauseAfterActivation('stocks');
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
      mode: this.mode,
      staticSession: this.staticSession,
      activeSession: this.activeSession,
      activeBroker: this.activeBroker && this.activeBroker.constructor && this.activeBroker.constructor.name || null,
      transitionInProgress: this.transitionInProgress,
      failedSafeMode: this.failedSafeMode,
      failedSafeReason: this.failedSafeReason,
      failedSafeAt: this.failedSafeAt,
      failedSafePauseConfirmed: this.failedSafePauseConfirmed,
      failedSafePauseError: this.failedSafePauseError,
      failedSafeEntryBlockReason: this.failedSafeEntryBlockReason,
      failedSafeEntryBlockAt: this.failedSafeEntryBlockAt,
      failedSafePauseFallbackApplied: this.failedSafePauseFallbackApplied,
      windDown: {
        phase: this.windDownPhase,
        direction: this.windDownDirection,
        startedAt: this.windDownStartedAt,
        lastTraceAt: this.windDownLastTraceAt,
        flattenComplete: this.windDownFlattenComplete,
        flattenFailures: this.windDownFlattenFailures
      },
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
