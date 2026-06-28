/**
 * @fileoverview StateManager - Single Source of Truth for Trading State
 *
 * This module centralizes ALL trading state management with atomic updates.
 * It prevents the critical position/balance desync bugs that occurred when
 * multiple components tracked state independently.
 *
 * @description
 * ARCHITECTURE ROLE:
 * StateManager sits at the center of the trading system. Every component
 * (TradingBrain, ExecutionLayer, RiskManager) MUST read from and write to
 * StateManager rather than maintaining their own state copies.
 *
 * HISTORICAL BUGS FIXED:
 * - Position desync: this.currentPosition vs this.tradingBrain.position
 * - Balance desync: Multiple components tracking different balances
 * - P&L calculation: Wrong unit conversion (lost $99.99 per trade)
 * - activeTrades accumulation: Closed trades not removed from Map
 *
 * CRITICAL INVARIANTS:
 * 1. position is always in USD (position size in dollars)
 * 2. balance is always in USD
 * 3. inPosition tracks USD locked in positions
 * 4. totalBalance = balance + inPosition + unrealizedPnL
 * 5. All updates go through updateState() for atomicity
 *
 * @module core/StateManager
 * @requires fs
 * @requires path
 *
 * @example
 * // Get the singleton instance
 * const { getInstance } = require('./core/StateManager');
 * const stateManager = getInstance();
 *
 * // Open a position (size in USD) with immutable trade scope
 * await stateManager.openPosition(500, 100, {
 *   source: 'TradingBrain',
 *   symbol: 'BTC-USD',
 *   brokerId: 'kraken',
 *   assetClass: 'crypto',
 *   executionMode: 'paper',
 *   timeframe: '15m'
 * });
 *
 * // Close position
 * await stateManager.closePosition(101);
 *
 * // Check current state
 * const state = stateManager.getState();
 * console.log(`Balance: $${state.balance}, Position: $${state.position}`);
 */

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: StateManager Class
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Centralized state management for trading operations.
 * Implements atomic updates, state persistence, and change notifications.
 *
 * @class StateManager
 * @property {Object} state - The current trading state
 * @property {number} state.position - Current position size in USD
 * @property {number} state.positionCount - Number of entries (for averaging)
 * @property {number} state.entryPrice - Average entry price in USD
 * @property {Date|null} state.entryTime - When position was opened
 * @property {number} state.balance - Available USD balance (not in positions)
 * @property {number} state.totalBalance - Total account value in USD
 * @property {number} state.inPosition - USD value locked in positions
 * @property {Map} state.activeTrades - Active trade records (orderId → trade)
 * @property {number} state.realizedPnL - Cumulative realized profit/loss
 * @property {number} state.unrealizedPnL - Current unrealized P&L
 * @property {boolean} state.isTrading - Whether trading is active
 * @property {boolean} state.recoveryMode - Emergency recovery mode flag
 */

const TradingConfig = require('./TradingConfig');
const { get: getConfigValue, getSource: getConfigSource } = require('../foundation/ConfigLoader');
const { getNarrator } = require('./TradeNarrator');
const FeeModel = require('./FeeModel');
// Cache singleton at module load — narrator.enabled is sealed from env vars.
// Both hook sites (openPosition / closePosition) check cached narrator.enabled
// first; try frame only entered when enabled (C1 zero-cost when OFF).
const narrator = getNarrator();

const INVALID_SCOPE_PLACEHOLDER_VALUES = new Set([
  'unknown',
  'undefined',
  'unclassified',
  'null',
  'none',
  'n/a',
  'na'
]);

const TTP_CUTOFF_FLATNESS_PAUSE_SOURCE = 'ttp_cutoff_unverified_broker_flatness';
const TTP_CUTOFF_FLATNESS_PAUSE_PREFIX = '[TTP_MARKET_TIME] broker flatness unverified after cutoff';

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function holdTimeMsOrNull(trade, now = Date.now()) {
  const startedAt = Number.isFinite(trade?.entryTime) && trade.entryTime > 0
    ? trade.entryTime
    : (Number.isFinite(trade?.timestamp) && trade.timestamp > 0 ? trade.timestamp : null);
  return startedAt === null ? null : now - startedAt;
}

function clonePlain(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneStateSnapshot(value) {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Map) {
    const clonedMap = new Map();
    for (const [key, mapValue] of value.entries()) {
      clonedMap.set(key, cloneStateSnapshot(mapValue));
    }
    return clonedMap;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => cloneStateSnapshot(entry));
  }
  const clonedObject = {};
  for (const [key, objectValue] of Object.entries(value)) {
    clonedObject[key] = cloneStateSnapshot(objectValue);
  }
  return clonedObject;
}

function deepFreezePlain(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Map) {
    for (const mapValue of value.values()) {
      deepFreezePlain(mapValue);
    }
    for (const methodName of ['set', 'delete', 'clear']) {
      Object.defineProperty(value, methodName, {
        value: () => {
          throw new TypeError('StateManager snapshot Map is read-only');
        },
        configurable: false,
        writable: false,
      });
    }
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) {
    deepFreezePlain(value[key]);
  }
  return Object.freeze(value);
}

function initialBeScaleOutState(status = 'idle') {
  return {
    status,
    intentId: null,
    targetQuantity: null,
    filledQuantity: 0,
    brokerOrderIds: [],
  };
}

function initialExitLifecycleFields() {
  return {
    tradeRevision: 0,
    pendingExitIntent: null,
    beScaleOutState: initialBeScaleOutState(),
    tierStates: [],
  };
}

function normalizeBeScaleOutState(value, legacy = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return initialBeScaleOutState(legacy ? 'unknown_legacy' : 'idle');
  }
  return {
    status: typeof value.status === 'string' && value.status.trim()
      ? value.status.trim()
      : (legacy ? 'unknown_legacy' : 'idle'),
    intentId: value.intentId ?? null,
    targetQuantity: value.targetQuantity === null || value.targetQuantity === undefined
      ? null
      : (Number.isFinite(Number(value.targetQuantity)) ? Number(value.targetQuantity) : null),
    filledQuantity: Number.isFinite(Number(value.filledQuantity)) ? Number(value.filledQuantity) : 0,
    brokerOrderIds: Array.isArray(value.brokerOrderIds) ? [...value.brokerOrderIds] : [],
  };
}

function normalizeTierStates(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((tierState) => clonePlain(tierState));
}

function withExitLifecycleFields(trade, { legacy = false, reset = false } = {}) {
  if (!trade || typeof trade !== 'object' || Array.isArray(trade)) {
    return trade;
  }

  const revision = Number(trade.tradeRevision);
  return {
    ...trade,
    tradeRevision: !reset && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    pendingExitIntent: !reset && Object.prototype.hasOwnProperty.call(trade, 'pendingExitIntent')
      ? clonePlain(trade.pendingExitIntent)
      : null,
    beScaleOutState: reset ? initialBeScaleOutState() : normalizeBeScaleOutState(trade.beScaleOutState, legacy),
    tierStates: reset ? [] : normalizeTierStates(trade.tierStates),
  };
}

function requireNonEmptyString(value, field, caller) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`[${caller}] ${field} requires explicit non-empty string; got ${JSON.stringify(value)}`);
  }
  return value.trim();
}

function optionalFiniteNumber(value, field, caller, { min = -Infinity, max = Infinity } = {}) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`[${caller}] ${field} must be finite number between ${min} and ${max}; got ${JSON.stringify(value)}`);
  }
  return numeric;
}

class StateManager {
  /**
   * Creates a new StateManager instance.
   * Initializes default state, sets up listeners, and loads persisted state.
   *
   * @constructor
   * @note This should only be called by getInstance() - use the singleton!
   */
  constructor() {
    // ─────────────────────────────────────────────────────────────────────
    // POSITION TRACKING
    // Position is in USD (position size in dollars)
    // ─────────────────────────────────────────────────────────────────────
    this.state = {
      position: 0,              // Current position size in USD
      positionCount: 0,         // Number of entries (for DCA/averaging)
      entryPrice: 0,            // Average entry price in USD
      entryTime: null,          // Timestamp when position was opened

      // ─────────────────────────────────────────────────────────────────────
      // BALANCE TRACKING (all values in USD)
      // Invariant: totalBalance ≈ balance + inPosition + unrealizedPnL
      // ─────────────────────────────────────────────────────────────────────
      balance: 10000,           // Available USD (not locked in positions)
      totalBalance: 10000,      // Total account value in USD
      initialBalance: 10000,    // FIX 2026-03-14: Reference point for drawdown calculation
      inPosition: 0,            // USD locked in positions (position × entryPrice)

      // ─────────────────────────────────────────────────────────────────────
      // TRADE TRACKING
      // activeTrades Map persists across restarts via save()/load()
      // ─────────────────────────────────────────────────────────────────────
      activeTrades: new Map(),  // orderId → { size, price, entryTime, symbol, ... }
      symbolEntryHalts: {},     // canonical symbol -> { reason, haltedAt }
      ttpCutoffQuarantine: null,
      // Per-symbol last-known prices for cross-asset equity math.
      // Mercury attack 2026-05-04: getEquity previously applied ONE caller-
      // supplied currentPrice across all activeTrades, which corrupts equity
      // when the trade map mixes asset classes (e.g. SessionRouter dual-broker).
      // Populated from OHLC handlers; used by getEquity/getAvailableCapital
      // and by SessionRouter for symbol-correct force-close prices.
      lastPrices: new Map(),    // symbol → most recent close price
      lastPriceTimes: new Map(), // symbol → event timestamp for lastPrices
      lastTradeTime: null,      // Timestamp of last trade execution
      tradeCount: 0,            // Total trades (lifetime)
      dailyTradeCount: 0,       // Trades today (resets via resetDaily())

      // ─────────────────────────────────────────────────────────────────────
      // P&L TRACKING (all values in USD)
      // ─────────────────────────────────────────────────────────────────────
      realizedPnL: 0,           // Cumulative closed trade P&L
      unrealizedPnL: 0,         // Current open position P&L (updated externally)
      totalPnL: 0,              // realizedPnL + unrealizedPnL
      closedTrades: [],         // Append-only log of full-close records (for win-rate math)

      // ─────────────────────────────────────────────────────────────────────
      // SYSTEM STATE
      // ─────────────────────────────────────────────────────────────────────
      isTrading: false,         // false = paused/stopped
      recoveryMode: false,      // true = emergency mode active
      lastError: null,          // Last error message (for pause reason)
      pauseReason: null,
      pauseSource: null,
      pauseRecoverable: false,
      pauseScope: null,
      lastUpdate: Date.now()    // Timestamp of last state update
    };

    this.dashboardRuntimeScope = null;

    /** @type {Set<Function>} Listeners notified on state changes */
    this.listeners = new Set();

    /** @type {Array<Object>} Rolling log of recent transactions for debugging */
    this.transactionLog = [];
    this.maxLogSize = 100;

    /** @type {boolean} Lock flag for atomic operations */
    this.locked = false;
    /** @type {Array<Function>} Queue of callbacks waiting for lock */
    this.lockQueue = [];
    this.dashboardHeartbeatInterval = null;

    // Bind methods to preserve 'this' context when passed as callbacks
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);
    this.updateActiveTrade = this.updateActiveTrade.bind(this);
    this.removeActiveTrade = this.removeActiveTrade.bind(this);
    this.reserveExitSlot = this.reserveExitSlot.bind(this);
    this.releaseExitSlot = this.releaseExitSlot.bind(this);
    this.openPosition = this.openPosition.bind(this);
    this.closePosition = this.closePosition.bind(this);

    // Load persisted state from disk (respects BACKTEST_MODE, FRESH_START)
    this.load();
  }

  /**
   * Get current state snapshot (read-only)
   */
  getState() {
    return deepFreezePlain(cloneStateSnapshot(this.state));
  }

  /**
   * Get specific state value
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Reset in-memory state to an explicit starting balance.
   * Used by backtests so execution sizing and recorder math share the same
   * configured INITIAL_BALANCE instead of the constructor's $10K bootstrap.
   */
  initializeFreshState(initialBalance, context = {}) {
    if (!Number.isFinite(initialBalance) || initialBalance <= 0) {
      throw new Error(`[StateManager] initializeFreshState requires positive finite initialBalance (got ${initialBalance})`);
    }

    return this._applyStateUpdatesLocked({
      position: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      balance: initialBalance,
      totalBalance: initialBalance,
      initialBalance,
      inPosition: 0,
      activeTrades: new Map(),
      symbolEntryHalts: {},
      ttpCutoffQuarantine: null,
      lastPrices: new Map(),
      lastTradeTime: null,
      tradeCount: 0,
      dailyTradeCount: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      closedTrades: [],
      isTrading: false,
      recoveryMode: false,
      lastError: null,
      pauseReason: null,
      pauseSource: null,
      pauseRecoverable: false,
      pauseScope: null,
    }, { action: 'INITIALIZE_FRESH_STATE', ...context });
  }

  /**
   * Set specific state value (for internal use)
   */
  set(key, value) {
    if (key === 'activeTrades') {
      const activeTrades = this._normalizeActiveTradesInput(value, 'StateManager.set', { resetLifecycle: true });
      this.state.activeTrades = activeTrades;
      return activeTrades;
    }
    this.state[key] = value;
    return value;
  }

  /**
   * Get equity (true account value for backtesting)
   * FIX 2026-03-28: Per-trade equity accounting
   * Equity = initialBalance + realizedPnL + unrealizedPnL
   * unrealizedPnL computed LIVE from activeTrades
   * Does NOT change get('balance') behavior
   */
  getEquity(currentPrice) {
    // CRIT-08: Phantom $10K capital. Corrupt or missing state previously
    // upgraded undefined initialBalance to $10K, so the bot believed the
    // account was funded regardless of reality. Pre-money: fail loud.
    if (!this.state.initialBalance) {
      throw new Error('initialBalance not set in state');
    }
    const initialBalance = this.state.initialBalance;
    const realizedPnL = this.state.realizedPnL || 0;

    // Compute unrealizedPnL live from activeTrades.
    // FIX 2026-05-05 (Mercury cross-asset attack): each trade priced at its
    // OWN symbol's last-known price (lastPrices map), with the caller's
    // currentPrice as a fallback. Single-asset modes (Apex stocks-only,
    // crypto-only) are byte-identical because the trade's symbol price
    // equals the global price. Cross-asset (SessionRouter) modes no
    // longer apply BTC price to TSLA trades.
    let unrealizedPnL = 0;
    if (this.state.activeTrades && this.state.activeTrades.size > 0) {
      for (const trade of this.state.activeTrades.values()) {
        const entry = trade.entryPrice;
        const size = trade.sizeUsd || trade.size;
        const direction = trade.direction;
        const tradePrice = (trade.symbol && this.state.lastPrices && this.state.lastPrices.get(trade.symbol))
          || currentPrice
          || entry;

        if (direction === 'long') {
          unrealizedPnL += size * ((tradePrice - entry) / entry);
        } else {
          unrealizedPnL += size * ((entry - tradePrice) / entry);
        }
      }
    }

    return initialBalance + realizedPnL + unrealizedPnL;
  }

  /**
   * Get available capital for position sizing
   * FIX 2026-03-28: Available = Equity - capital already reserved in open trades
   * This prevents sizing off full equity while positions are open
   */
  getAvailableCapital(currentPrice) {
    const equity = this.getEquity(currentPrice);

    // Sum capital reserved in open trades
    let reservedCapital = 0;
    if (this.state.activeTrades && this.state.activeTrades.size > 0) {
      for (const trade of this.state.activeTrades.values()) {
        reservedCapital += trade.sizeUsd || trade.size || 0;
      }
    }

    return Math.max(0, equity - reservedCapital);
  }

  _getActiveTradeExposureUsd(activeTrades = this.state.activeTrades) {
    if (!activeTrades) {
      return 0;
    }
    if (!(activeTrades instanceof Map)) {
      throw new Error(`[StateManager] activeTrades exposure invariant failed: expected Map, got ${Object.prototype.toString.call(activeTrades)}`);
    }

    let exposureUsd = 0;
    for (const [tradeId, trade] of activeTrades.entries()) {
      const sizeUsd = Number(trade?.sizeUsd ?? trade?.size);
      if (!Number.isFinite(sizeUsd) || sizeUsd < 0) {
        throw new Error(`[StateManager] activeTrades exposure invariant failed for ${tradeId}: invalid sizeUsd=${trade?.sizeUsd} size=${trade?.size}`);
      }
      exposureUsd += Math.abs(sizeUsd);
    }
    return exposureUsd;
  }

  /**
   * Record the most recent close price for a symbol.
   * Called from OHLC handlers on each candle close. Powers cross-asset
   * equity math in getEquity and the symbol-correct force-close exit
   * price lookup in SessionRouter._transitionToCrypto.
   */
  updateLastPrice(symbol, price, eventTimeMs = Date.now()) {
    if (!symbol || typeof price !== 'number' || !(price > 0)) return false;
    const incomingTime = Number(eventTimeMs);
    if (!Number.isFinite(incomingTime) || incomingTime <= 0) return false;
    if (!this.state.lastPrices) this.state.lastPrices = new Map();
    if (!this.state.lastPriceTimes) this.state.lastPriceTimes = new Map();
    const currentTime = this.state.lastPriceTimes.get(symbol);
    if (Number.isFinite(currentTime) && incomingTime < currentTime) return false;
    this.state.lastPrices.set(symbol, price);
    this.state.lastPriceTimes.set(symbol, incomingTime);
    return true;
  }

  /**
   * Look up the last-known close price for a symbol.
   * Returns null if the symbol has never been seen (caller must decide
   * whether that is a critical state — SessionRouter treats it as
   * "leave the trade open").
   */
  getLastPrice(symbol) {
    if (!symbol || !this.state.lastPrices) return null;
    return this.state.lastPrices.get(symbol) || null;
  }

  /**
   * ATOMIC state update with transaction safety
   * All state changes MUST go through this
   */
  async updateState(updates, context = {}) {
    // Wait for lock
    await this.acquireLock();

    try {
      return this._applyStateUpdatesLocked(updates, context, { resetActiveTradeLifecycle: true });
    } finally {
      this.releaseLock();
    }
  }

  _applyStateUpdatesLocked(updates, context = {}, options = {}) {
    try {
      // Snapshot for rollback
      const snapshot = { ...this.state };
      const timestamp = Date.now();

      // Validate updates
      this.validateUpdates(updates);

      // Apply updates atomically
      for (const [key, value] of Object.entries(updates)) {
        // DEBUG: Log balance changes
        if (key === 'balance') {
          console.log(`[StateManager] Balance update: ${this.state[key]} -> ${value}`);
        }

        // CRITICAL FIX: Protect activeTrades Map from being overwritten
        if (key === 'activeTrades') {
          this.state.activeTrades = this._normalizeActiveTradesInput(value, 'StateManager.updateState', {
            resetLifecycle: options.resetActiveTradeLifecycle === true,
          });
          if (Array.isArray(value)) {
            console.log(`[StateManager] Converted activeTrades array to Map with ${value.length} entries`);
          }
        } else {
          this.state[key] = value;
        }
      }

      this.state.lastUpdate = timestamp;

      // Log transaction
      this.logTransaction({
        timestamp,
        updates,
        context,
        snapshot
      });

      // Notify listeners
      this.notifyListeners(updates, context);

      // CHANGE 2025-12-13: Save state to disk after updates
      this.save();

      return { success: true, state: this.getState() };

    } catch (error) {
      console.error('[StateManager] Update failed:', error);
      // Rollback would go here if needed
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Position Management
  // These methods handle opening/closing positions with USD-based accounting
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Open a new position (BUY).
   *
   * @async
   * @param {number} size - Position size in USD
   * @param {number} price - Current market price
   * @param {Object} [context={}] - Additional context for logging/tracking
   * @param {string} [context.orderId] - Broker order ID
   * @param {string} [context.source] - Calling component (e.g., 'TradingBrain')
   * @param {string} [context.reason] - Trade reason (e.g., 'RSI oversold')
   * @param {number} [context.confidence] - Signal confidence (0-100)
   * @param {string} context.symbol - Canonical trade symbol
   * @param {string} context.brokerId - Broker identity that owns this trade
   * @param {string} context.assetClass - Asset class for this trade
   * @param {string} context.executionMode - paper/live/backtest
   * @param {string} context.timeframe - Candle timeframe that produced the entry
   * @param {number} context.entryOrderQuantity - Broker/base quantity accepted at entry
   * @param {string} context.entryOrderQuantityUnit - Quantity unit for the accepted entry
   * @param {number} context.remainingOrderQuantity - Broker/base quantity still open
   * @param {string} context.remainingOrderQuantityUnit - Quantity unit for the open remainder
   * @returns {Promise<{success: boolean, state?: Object, error?: string, scopeRejected?: boolean, missingFields?: string[]}>}
   *
   * @example
   * // Open $500 position at $100/share
   * await stateManager.openPosition(500, 100, {
   *   source: 'TradingBrain',
   *   reason: 'RSI oversold bounce',
   *   confidence: 75,
   *   symbol: 'BTC-USD',
   *   brokerId: 'kraken',
   *   accountId: 'default',
   *   assetClass: 'crypto',
   *   executionMode: 'paper',
   *   timeframe: '15m'
   * });
   * // Result: position = 500 USD, inPosition = $500
   *
   * @description
   * CRITICAL MATH:
   * - size is in USD (e.g., $500)
   * - price is current market price
   * - Per-trade equity accounting: only fees affect realizedPnL on open
   * - No principal movement on balance
   * - position increases by size (USD)
   */
  async openPosition(size, price, context = {}) {
    const identityMissing = [];
    const cleanIdentityText = (value, field) => {
      if (value === null || value === undefined) {
        identityMissing.push(field);
        return null;
      }
      const cleaned = String(value).trim();
      if (!cleaned) {
        identityMissing.push(field);
        return null;
      }
      return cleaned;
    };
    const tradeId = cleanIdentityText(context.orderId, 'orderId');
    const tradeAction = cleanIdentityText(context.action, 'action');
    const tradeDirection = cleanIdentityText(context.direction, 'direction');
    const entryStrategy = cleanIdentityText(context.entryStrategy, 'entryStrategy');
    if (identityMissing.length > 0) {
      return this._rejectOpenPositionIdentity(
        `StateManager.openPosition missing immutable entry identity field(s): ${identityMissing.join(', ')}`,
        identityMissing,
        context
      );
    }
    if (!['BUY', 'SELL_SHORT'].includes(tradeAction)) {
      return this._rejectOpenPositionIdentity(
        `StateManager.openPosition unsupported action ${tradeAction}`,
        ['action'],
        context
      );
    }
    if (!['long', 'short'].includes(tradeDirection)) {
      return this._rejectOpenPositionIdentity(
        `StateManager.openPosition unsupported direction ${tradeDirection}`,
        ['direction'],
        context
      );
    }
    if ((tradeAction === 'BUY' && tradeDirection !== 'long') || (tradeAction === 'SELL_SHORT' && tradeDirection !== 'short')) {
      return this._rejectOpenPositionIdentity(
        `StateManager.openPosition action/direction mismatch: action=${tradeAction} direction=${tradeDirection}`,
        ['action', 'direction'],
        context
      );
    }
    const tradeSymbolRaw = context.symbol
      || (context.ledgerData && context.ledgerData.symbol)
      || null;
    let tradeScope;

    try {
      tradeScope = this.buildTradeScope(context, tradeSymbolRaw, 'StateManager.openPosition scope');
    } catch (err) {
      return this._rejectOpenPositionScope(err, context);
    }

    const usdCost = size;

    // FIX 2026-03-28: Per-trade equity accounting.
    // Entry fee calculated upfront through the config-owned fee model.
    const entryFee = FeeModel.fromTradingConfig().calculateOrderFee({
      notionalUsd: usdCost,
      quantity: context.entryOrderQuantity,
      side: 'entry',
    });

    // Store trade in activeTrades with all required fields.
    // FIX 2026-05-05: promote `symbol` to a top-level trade field (was only
    // present inside decisionLedger sub-object). getEquity/getAvailableCapital
    // and SessionRouter need symbol-aware pricing.
    const tradeSymbol = tradeScope.symbol;

    const trade = {
      id: tradeId,
      action: tradeAction,  // BUY or SELL_SHORT
      type: tradeAction,    // Keep both for compatibility
      direction: tradeDirection,  // 'long' or 'short'
      sizeUsd: size,        // Position size in USD
      size: size,           // Keep for compatibility
      price: price,
      entryPrice: price,
      entryFee: entryFee,   // Store fee for accounting
      entryTime: Date.now(),
      timestamp: Date.now(),
      status: 'open',
      ...context,
      ...initialExitLifecycleFields(),
      // CC-C Commit 5: symbol assignment AFTER `...context` so the dash-
      // normalized value (line 405-407) wins over context.symbol (slash form
      // from the caller). The prior order had `symbol: tradeSymbol` BEFORE
      // the spread, which silently overwrote the normalization with the raw
      // slash form, making the :417 "Dash-form normalized" comment a lie.
      // This was the load-bearing reason getTradesBySymbol filter ran on a
      // dash-normalized input but matched against slash-stored trade.symbol
      // (returning [] for crypto pairs and silently breaking exit-checks).
      symbol: tradeSymbol,
      brokerId: tradeScope.brokerId,
      accountId: tradeScope.accountId,
      accountIdSource: tradeScope.accountIdSource,
      assetClass: tradeScope.assetClass,
      executionMode: tradeScope.executionMode,
      timeframe: tradeScope.timeframe,
      scopeKey: tradeScope.key,
      scopeKeyVersion: 2,
    };

    // L1: Attach decision ledger skeleton at trade birth
    if (context.ledgerData) {
      const { createLedgerSkeleton } = require('./dto/DecisionLedgerSchema');
      try {
        trade.decisionLedger = createLedgerSkeleton({
          tradeId,
          candleTimestamp: context.ledgerData.candleTimestamp,
          symbol: tradeScope.symbol,
          timeframe: tradeScope.timeframe,
          executionMode: tradeScope.executionMode,
          entryPrice: price,
          direction: tradeDirection,
          strategySignals: context.ledgerData.strategySignals,
          orchestratorDecision: context.ledgerData.orchestratorDecision,
          confluence: context.ledgerData.confluence,
          positionSizing: context.ledgerData.positionSizing,
          exitContract: context.ledgerData.exitContract,
          // L5: pre-trade + RiskManager gate observability (pass/fail per gate).
          // Pure instrumentation — never changes trade logic.
          riskGates: context.ledgerData.riskGates,
        });
      } catch (err) {
        return this._rejectOpenPositionLedger(err, context);
      }
    }

    const quantityIssues = this._activeTradeQuantityIssuesForTrade(trade, tradeId);
    if (quantityIssues.length > 0) {
      return this._rejectOpenPositionQuantity(quantityIssues, context);
    }

    let result;
    await this.acquireLock();
    try {
      if (this.state.position > 0) {
        console.warn('[StateManager] Already in position, adding to it');
      }

      // DEBUG: Log what we're doing
      // FIX 2026-03-28: size is already USD, no multiplication needed
      console.log(`[StateManager] Opening ${tradeDirection.toUpperCase()} position:`);
      console.log(`   Size: $${size.toFixed(2)} USD`);
      console.log(`   Price: $${price}`);
      console.log(`   USD Cost: $${usdCost.toFixed(2)}`);
      console.log(`   Direction: ${tradeDirection}`);
      console.log(`   Current Balance: $${this.state.balance}`);

      const nextActiveTrades = new Map(this.state.activeTrades || []);
      nextActiveTrades.set(tradeId, trade);
      console.log(`[StateManager] Added trade ${tradeId} to activeTrades (now ${nextActiveTrades.size} trades)`);

      // For position scalar (kept for compatibility)
      const positionDelta = tradeDirection === 'short' ? -size : size;
      const newPosition = this.state.position + positionDelta;

      // FIX 2026-03-28: Per-trade equity accounting
      // Only entryFee affects realizedPnL on open - NO principal movement
      console.log('[EQUITY-DEBUG] OPEN direction=' + tradeDirection + ' entryFee=' + entryFee.toFixed(4) + ' realizedPnL=' + this.state.realizedPnL);

      const updates = {
        activeTrades: nextActiveTrades,
        position: newPosition,  // Positive for long, negative for short (kept for compatibility)
        positionCount: this.state.positionCount + 1,
        entryPrice: Math.abs(this.state.position) > 0
          ? (this.state.entryPrice * Math.abs(this.state.position) + price * size) / (Math.abs(this.state.position) + size)
          : price,
        entryTime: this.state.entryTime || Date.now(),
        // FIX 2026-03-28: No balance principal movement - only fee deducted from realizedPnL
        realizedPnL: this.state.realizedPnL - entryFee,
        inPosition: this.state.inPosition + usdCost,  // Track USD exposure
        lastTradeTime: Date.now(),
        tradeCount: this.state.tradeCount + 1,
        dailyTradeCount: this.state.dailyTradeCount + 1
      };

      result = this._applyStateUpdatesLocked(updates, { action: 'OPEN_POSITION', price, size, ...context });
    } finally {
      this.releaseLock();
    }

    // Narrator: entered event. Uses module-cached singleton.
    // Disabled path: property-access + branch-taken, zero allocation.
    // Try frame only entered when enabled so a formatter throw can never
    // break an open path.
    if (result?.success && narrator.enabled) {
      try {
        narrator.entered({
          tradeId,
          strategy: entryStrategy,
          direction: tradeDirection,
          price,
          sizeUsd: size,
          confidence: context.confidence,
          exitContract: context.exitContract || null,
          confluence: context.signalBreakdown ? {
            count: context.signalBreakdown.confluenceCount,
          } : null,
          timestamp: Date.now(),
        });
      } catch (_) { /* narrator must never break trading */ }
    }

    return result;
  }

  _rejectOpenPositionScope(err, context = {}) {
    const missingFields = Array.isArray(err.missingFields) ? err.missingFields : [];
    const invalidFields = Array.isArray(err.invalidFields) ? err.invalidFields : [];
    const result = {
      success: false,
      error: err.message,
      code: err.code || 'SCOPE_REJECTED',
      scopeRejected: true,
      missingFields,
      invalidFields,
    };

    if (err.suppliedScopeKey !== undefined) {
      result.suppliedScopeKey = err.suppliedScopeKey;
    }
    if (err.expectedScopeKey !== undefined) {
      result.expectedScopeKey = err.expectedScopeKey;
    }

    const contextSymbol = context.symbol ?? context.ledgerData?.symbol ?? null;
    console.error(`[StateManager] openPosition BLOCKED - ${err.message} context.symbol=${contextSymbol}`);
    return result;
  }

  _rejectOpenPositionIdentity(message, missingFields = [], context = {}) {
    const result = {
      success: false,
      error: message,
      code: 'ENTRY_IDENTITY_REJECTED',
      identityRejected: true,
      missingFields,
    };
    const contextSymbol = context.symbol ?? context.ledgerData?.symbol ?? null;
    console.error(`[StateManager] openPosition BLOCKED - ${message} context.symbol=${contextSymbol}`);
    return result;
  }

  _rejectOpenPositionQuantity(quantityIssues, context = {}) {
    const message = `StateManager.openPosition active trade quantity invariant failed: ${quantityIssues.join('; ')}`;
    const result = {
      success: false,
      error: message,
      code: 'ENTRY_QUANTITY_REJECTED',
      quantityRejected: true,
      quantityIssues,
    };
    const contextSymbol = context.symbol ?? context.ledgerData?.symbol ?? null;
    console.error(`[StateManager] openPosition BLOCKED - ${message} context.symbol=${contextSymbol}`);
    return result;
  }

  _rejectOpenPositionLedger(err, context = {}) {
    const missingFields = Array.isArray(err.missingFields) ? err.missingFields : [];
    const result = {
      success: false,
      error: err.message,
      code: err.code || 'LEDGER_SKELETON_REJECTED',
      ledgerRejected: true,
      missingFields,
    };
    if (Array.isArray(err.validationIssues) && err.validationIssues.length > 0) {
      result.validationIssues = err.validationIssues;
    }
    const contextSymbol = context.symbol ?? context.ledgerData?.symbol ?? null;
    console.error(`[StateManager] openPosition BLOCKED - ${err.message} context.symbol=${contextSymbol}`);
    return result;
  }

  /**
   * Close position (SELL) - partial or full.
   *
   * @async
   * @param {number} price - Current market price
   * @param {boolean} [partial=false] - true for partial close, false for full
   * @param {number|null} [size=null] - USD amount to close (null = full position)
   * @param {Object} [context={}] - Additional context for logging/tracking
   * @returns {Promise<{success: boolean, state?: Object, error?: string}>}
   *
   * @example
   * // Full close at $101 (1% profit on $100 entry)
   * await stateManager.closePosition(101, false, null, { tradeId: 'TRADE_123' });
   * // Result: pnl = $500 × 1% = $5 profit
   *
   * @description
   * Per-trade equity accounting (fixed 2026-03-28):
   * - Looks up trade by tradeId (required, no fallback)
   * - Uses trade's entryPrice for percentage-based P&L
   * - pnl = positionUSD × ((exitPrice - entryPrice) / entryPrice)
   * - Only fees and P&L affect realizedPnL, no principal movement
   */
  async closePosition(price, partial = false, size = null, context = {}) {
    // Reject partial closes — use reducePosition instead
    if (partial) {
      console.error('[StateManager] closePosition does not support partial closes; use reducePosition.');
      return { success: false, error: 'closePosition does not support partial closes; use reducePosition' };
    }
    let result;
    let ledgerToWrite = null;
    let narratorPayload = null;

    await this.acquireLock();
    try {
      // Allow closing both long (positive) and short (negative) positions
      // FIX 2026-03-29: Allow close when position=0 but activeTrades exist (hedged positions)
      if (this.state.position === 0 && !(this.state.activeTrades && this.state.activeTrades.size > 0)) {
        console.error('[StateManager] No position to close!');
        return { success: false, error: 'No position to close' };
      }

      // FIX 2026-03-28: Per-trade equity accounting - look up trade FIRST
      // CRITICAL: No fallback to global state - require valid tradeId
      const tradeId = context.tradeId || context.orderId;
      if (!tradeId) {
        console.error('[StateManager] closePosition called without tradeId!');
        return { success: false, error: 'tradeId required for closePosition' };
      }

      const trade = this.state.activeTrades?.get(tradeId);
      if (!trade) {
        console.error(`[StateManager] Trade ${tradeId} not found in activeTrades!`);
        return { success: false, error: `Trade ${tradeId} not found` };
      }

      // Use trade's values - NO fallback to global state
      const tradeEntryPrice = trade.entryPrice;
      const tradeSizeUsd = trade.sizeUsd || trade.size;
      const tradeDirection = trade.direction;
      const isShort = tradeDirection === 'short';
      const closeSize = Math.abs(tradeSizeUsd);

      // CRITICAL: PnL depends on direction, using TRADE's entryPrice
      // LONG: profit when price goes UP (exit - entry)
      // SHORT: profit when price goes DOWN (entry - exit)
      let priceChangePercent;
      if (isShort) {
        priceChangePercent = tradeEntryPrice > 0
          ? ((tradeEntryPrice - price) / tradeEntryPrice)
          : 0;
      } else {
        priceChangePercent = tradeEntryPrice > 0
          ? ((price - tradeEntryPrice) / tradeEntryPrice)
          : 0;
      }
      const pnl = closeSize * priceChangePercent;  // USD P&L
      const pnlPercent = priceChangePercent * 100;

      // Calculate exit fee
      const usdValueAtClose = closeSize + pnl;
      const exitFee = FeeModel.fromTradingConfig().calculateOrderFee({
        notionalUsd: usdValueAtClose,
        quantity: context.orderQuantity || trade.remainingOrderQuantity || trade.entryOrderQuantity,
        side: 'exit',
      });

      const nextActiveTrades = new Map(this.state.activeTrades || []);
      if (nextActiveTrades.has(tradeId)) {
        nextActiveTrades.delete(tradeId);
        console.log(`[StateManager] Removed trade ${tradeId} (${trade?.action || trade?.type}) from activeTrades`);
        console.log(`[StateManager] ${nextActiveTrades.size} active trades remaining`);
      } else if ((this.state.position - closeSize) <= 0) {
        // Full close with no position remaining - clear all trades
        const tradeCount = nextActiveTrades.size;
        for (const [id, t] of nextActiveTrades.entries()) {
          nextActiveTrades.delete(id);
          console.log(`[StateManager] Removed trade ${id} (${t.action || t.type}) from activeTrades`);
        }
        console.log(`[StateManager] Cleared ${tradeCount} active trades (position fully closed)`);
      }

      // FIX 2026-03-28: Per-trade equity accounting
      // Net realized result = pnl - exitFee (added to realizedPnL)
      // NO balance principal movement
      const netRealizedResult = pnl - exitFee;

      // L8: Persist decision ledger to JSONL on full close (after netRealizedResult computed)
      const closedAt = Date.now();
      const exitReason = firstNonEmptyString(context.exitReason, context.reason);
      const tradeStrategy = firstNonEmptyString(trade.entryStrategy, trade.strategy);
      const holdTimeMs = holdTimeMsOrNull(trade, closedAt);
      if (trade.decisionLedger) {
        ledgerToWrite = {
          ...trade.decisionLedger,
          outcome: {
            exitPrice: price,
            exitTime: closedAt,
            pnlDollars: pnl,
            pnlPercent,
            exitFee,
            netPnlDollars: netRealizedResult,
            exitReason,
            holdTimeMs,
          },
        };
      }

      // Position scalar update (kept for compatibility)
      const noActiveTradesRemaining = nextActiveTrades.size === 0;
      const remainingExposureUsd = noActiveTradesRemaining ? 0 : this._getActiveTradeExposureUsd(nextActiveTrades);
      const calculatedPosition = isShort
        ? Math.min(0, this.state.position + closeSize)
        : Math.max(0, this.state.position - closeSize);
      const finalPosition = noActiveTradesRemaining ? 0 : calculatedPosition;

      console.log('[EQUITY-DEBUG] CLOSE isShort=' + isShort + ' pnl=' + pnl.toFixed(2) + ' exitFee=' + exitFee.toFixed(4) + ' netResult=' + netRealizedResult.toFixed(2));

      // 2026-05-04: closedTrades append for win-rate math (CandleProcessor:406-408 reads this).
      // Pure additive — fields mirror the session-doc record shape so downstream consumers
      // beyond the win-rate path can read direction/strategy/holdMs without further changes.
      const closedTradeRecord = {
        tradeId,
        symbol: trade.symbol || null,  // FIX S10-BUG-1: carry symbol for per-ticker analytics
        pnl,
        pnlPercent,
        direction: tradeDirection,
        entryPrice: tradeEntryPrice,
        exitPrice: price,
        strategy: tradeStrategy,
        holdMs: holdTimeMs,
        closedAt
      };

      const updates = {
        activeTrades: nextActiveTrades,
        position: finalPosition,
        positionCount: noActiveTradesRemaining ? 0 : nextActiveTrades.size,
        entryPrice: noActiveTradesRemaining ? 0 : this.state.entryPrice,
        entryTime: noActiveTradesRemaining ? null : this.state.entryTime,
        // FIX 2026-03-28: No balance principal movement - only realizedPnL changes
        inPosition: remainingExposureUsd,
        realizedPnL: this.state.realizedPnL + netRealizedResult,
        totalPnL: this.state.totalPnL + pnl,
        closedTrades: [...(this.state.closedTrades || []), closedTradeRecord],
        lastTradeTime: Date.now()
      };

      console.log(`Position closed: PnL ${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

      result = this._applyStateUpdatesLocked(updates, {
        action: 'CLOSE_POSITION',
        price,
        size: closeSize,
        pnl,
        partial,
        ...context
      });

      narratorPayload = {
        tradeId,
        strategy: tradeStrategy,
        direction: tradeDirection,
        entryPrice: tradeEntryPrice,
        exitPrice: price,
        pnl,
        pnlPercent,
        reason: exitReason,
        holdMs: holdTimeMs,
      };
    } finally {
      this.releaseLock();
    }

    if (result?.success && ledgerToWrite) {
      try {
        const ledgerLogger = require('./DecisionLedgerLogger');
        ledgerLogger.writeOnClose(ledgerToWrite);
      } catch (e) {
        console.warn('[LEDGER] Failed to persist decision ledger:', e.message);
      }
    }

    // Narrator: closed event. Uses module-cached singleton.
    if (result?.success && narrator.enabled && narratorPayload) {
      try {
        narrator.closed(narratorPayload);
      } catch (_) { /* narrator must never break trading */ }
    }

    return result;
  }

  /**
   * Reduce a position partially — handles multi-leg exits.
   * @param {string} tradeId - Identifier of the trade to reduce.
   * @param {number} fraction - Fraction of the trade to close (0-1).
   * @param {number} price - Exit price.
   * @param {Object} context - Additional context (orderId, exitReason, etc.).
   */
  async reducePosition(tradeId, fraction, price, context = {}) {
    if (fraction <= 0 || fraction > 1) {
      console.error('[StateManager] reducePosition called with invalid fraction:', fraction);
      return { success: false, error: 'Invalid fraction for reducePosition' };
    }

    await this.acquireLock();
    try {
      const trade = this.state.activeTrades?.get(tradeId);
      if (!trade) {
        console.error(`[StateManager] Trade ${tradeId} not found for reducePosition`);
        return { success: false, error: `Trade ${tradeId} not found` };
      }

      const tradeSizeUsd = trade.sizeUsd || trade.size;
      const closeSize = tradeSizeUsd * fraction;
      const tradeEntryPrice = trade.entryPrice;
      const isShort = trade.direction === 'short';
      const priceChangePercent = isShort
        ? (tradeEntryPrice > 0 ? (tradeEntryPrice - price) / tradeEntryPrice : 0)
        : (tradeEntryPrice > 0 ? (price - tradeEntryPrice) / tradeEntryPrice : 0);
      const pnl = closeSize * priceChangePercent;
      const usdValueAtClose = closeSize + pnl;
      const exitFee = FeeModel.fromTradingConfig().calculateOrderFee({
        notionalUsd: usdValueAtClose,
        quantity: context.orderQuantity || (Number(trade.remainingOrderQuantity) * fraction) || trade.entryOrderQuantity,
        side: 'exit',
      });
      const netRealizedResult = pnl - exitFee;

      const nextActiveTrades = new Map(this.state.activeTrades || []);
      const nextTrade = {
        ...trade,
        decisionLedger: trade.decisionLedger
          ? {
              ...trade.decisionLedger,
              exits: Array.isArray(trade.decisionLedger.exits)
                ? [...trade.decisionLedger.exits]
                : [],
            }
          : trade.decisionLedger,
      };

      // Update trade size (and possibly delete)
      const remainingSize = tradeSizeUsd - closeSize;
      const priorOrderQuantity = Number(trade.remainingOrderQuantity);
      const closedOrderQuantity = Number(context.orderQuantity);
      const hasBrokerQuantity = Number.isFinite(priorOrderQuantity) && priorOrderQuantity > 0;
      const hasClosedBrokerQuantity = Number.isFinite(closedOrderQuantity) && closedOrderQuantity > 0;
      const remainingOrderQuantity = hasBrokerQuantity
        ? Math.max(0, priorOrderQuantity - (hasClosedBrokerQuantity ? closedOrderQuantity : priorOrderQuantity * fraction))
        : null;
      if (remainingSize <= 0) {
        nextActiveTrades.delete(tradeId);
      } else {
        nextTrade.sizeUsd = remainingSize;
        nextTrade.size = remainingSize;  // FIX P1-A: keep both fields in sync - OrderExecutor reads trade.size for P&L computation, fees, console logs
        if (hasBrokerQuantity) {
          nextTrade.remainingOrderQuantity = remainingOrderQuantity;
          nextTrade.remainingOrderQuantityUnit = context.quantityUnit || trade.remainingOrderQuantityUnit || trade.entryOrderQuantityUnit || null;
        }
        nextActiveTrades.set(tradeId, nextTrade);
      }

      // Append exit info to decision ledger
      if (nextTrade.decisionLedger) {
        const exitEntry = {
          exitSize: closeSize,
          exitFraction: fraction,
          remainingSize: Math.max(0, remainingSize),
          exitOrderQuantity: hasClosedBrokerQuantity ? closedOrderQuantity : null,
          remainingOrderQuantity,
          exitPrice: price,
          exitReason: firstNonEmptyString(context.exitReason, context.reason),
          netPnlDollars: netRealizedResult,
          timestamp: Date.now()
        };
        nextTrade.decisionLedger.exits.push(exitEntry);
      }

      // Update global state metrics
      const positionDelta = isShort ? closeSize : -closeSize;
      const noActiveTradesRemaining = nextActiveTrades.size === 0;
      const remainingExposureUsd = noActiveTradesRemaining ? 0 : this._getActiveTradeExposureUsd(nextActiveTrades);
      const updates = {
        activeTrades: nextActiveTrades,
        position: noActiveTradesRemaining ? 0 : this.state.position + positionDelta,
        positionCount: noActiveTradesRemaining ? 0 : this.state.positionCount,
        entryPrice: noActiveTradesRemaining ? 0 : this.state.entryPrice,
        entryTime: noActiveTradesRemaining ? null : this.state.entryTime,
        inPosition: remainingExposureUsd,
        realizedPnL: this.state.realizedPnL + netRealizedResult,
        totalPnL: this.state.totalPnL + pnl,
        lastTradeTime: Date.now()
      };
      return this._applyStateUpdatesLocked(updates, {
        action: 'REDUCE_POSITION',
        tradeId,
        fraction,
        price,
        pnl,
        netRealizedResult,
        ...context
      });
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Update balance (deposits, withdrawals, fees)
   */
  async updateBalance(amount, reason = 'adjustment') {
    const updates = {
      balance: this.state.balance + amount,
      totalBalance: this.state.totalBalance + amount
    };

    return this.updateState(updates, { action: 'BALANCE_UPDATE', amount, reason });
  }

  /**
   * Reset daily counters
   */
  async resetDaily() {
    const updates = {
      dailyTradeCount: 0
    };

    return this.updateState(updates, { action: 'DAILY_RESET' });
  }

  /**
   * Set recovery mode
   */
  async setRecoveryMode(enabled) {
    const updates = {
      recoveryMode: enabled
    };

    return this.updateState(updates, { action: 'RECOVERY_MODE', enabled });
  }

  _activeTradeQuantityIssuesForTrade(trade, fallbackTradeId = '<unknown>') {
    const tradeId = trade?.orderId || trade?.id || fallbackTradeId || '<unknown>';
    if (!trade || typeof trade !== 'object') {
      return [`${tradeId}: trade record is not an object`];
    }

    const issues = [];
    const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
    const sizeUsd = Number(trade.sizeUsd ?? trade.size);
    const entryOrderQuantity = Number(trade.entryOrderQuantity);
    const remainingOrderQuantity = Number(trade.remainingOrderQuantity);
    const entryOrderQuantityUnit = trade.entryOrderQuantityUnit;
    const remainingOrderQuantityUnit = trade.remainingOrderQuantityUnit;
    const tolerance = 1e-12;

    if (!Number.isFinite(sizeUsd) || Math.abs(sizeUsd) <= tolerance) {
      issues.push(`${tradeId}: invalid open sizeUsd=${trade.sizeUsd ?? trade.size}`);
    }
    if (!Number.isFinite(entryOrderQuantity) || entryOrderQuantity <= 0) {
      issues.push(`${tradeId}: invalid entryOrderQuantity=${trade.entryOrderQuantity}`);
    }
    if (!Number.isFinite(remainingOrderQuantity) || remainingOrderQuantity <= 0) {
      issues.push(`${tradeId}: invalid remainingOrderQuantity=${trade.remainingOrderQuantity}`);
    }
    if (!hasText(entryOrderQuantityUnit)) {
      issues.push(`${tradeId}: missing entryOrderQuantityUnit`);
    }
    if (!hasText(remainingOrderQuantityUnit)) {
      issues.push(`${tradeId}: missing remainingOrderQuantityUnit`);
    }
    if (
      hasText(entryOrderQuantityUnit)
      && hasText(remainingOrderQuantityUnit)
      && String(entryOrderQuantityUnit).trim() !== String(remainingOrderQuantityUnit).trim()
    ) {
      issues.push(`${tradeId}: quantity unit mismatch entry=${entryOrderQuantityUnit} remaining=${remainingOrderQuantityUnit}`);
    }
    if (
      Number.isFinite(entryOrderQuantity)
      && entryOrderQuantity > 0
      && Number.isFinite(remainingOrderQuantity)
      && remainingOrderQuantity > entryOrderQuantity + tolerance
    ) {
      issues.push(`${tradeId}: remainingOrderQuantity=${remainingOrderQuantity} exceeds entryOrderQuantity=${entryOrderQuantity}`);
    }

    return issues;
  }

  _normalizeActiveTradesInput(value, caller = 'StateManager.activeTrades', { resetLifecycle = false } = {}) {
    let activeTrades;
    if (Array.isArray(value)) {
      activeTrades = new Map(value);
    } else if (value instanceof Map) {
      activeTrades = value;
    } else {
      throw new Error(
        `[${caller}] activeTrades container invariant failed: expected Map/array, got ${Object.prototype.toString.call(value)}`
      );
    }

    const issues = [];
    const normalizedTrades = new Map();
    for (const [tradeId, trade] of activeTrades.entries()) {
      const normalizedTrade = withExitLifecycleFields(trade, { reset: resetLifecycle });
      issues.push(...this._activeTradeQuantityIssuesForTrade(normalizedTrade, tradeId));
      normalizedTrades.set(tradeId, normalizedTrade);
    }
    if (issues.length > 0) {
      throw new Error(`[${caller}] active trade quantity invariant failed: ${issues.join('; ')}`);
    }

    return normalizedTrades;
  }

  _activeTradeQuantityIssues() {
    if (!this.state.activeTrades) {
      return [];
    }
    if (!(this.state.activeTrades instanceof Map)) {
      return [`activeTrades: invalid container ${Object.prototype.toString.call(this.state.activeTrades)}; expected Map`];
    }

    const issues = [];
    for (const [tradeId, trade] of this.state.activeTrades.entries()) {
      issues.push(...this._activeTradeQuantityIssuesForTrade(trade, tradeId));
    }
    return issues;
  }

  /**
   * Validate state consistency
   */
  validateState() {
    const issues = [];

    // Check balance consistency
    const expectedTotal = this.state.balance + this.state.inPosition;
    const diff = Math.abs(expectedTotal - this.state.totalBalance);
    if (diff > 0.01) {
      issues.push(`Balance mismatch: total=${this.state.totalBalance}, expected=${expectedTotal}`);
    }

    // Check position consistency
    if (this.state.position > 0 && !this.state.entryPrice) {
      issues.push('Position exists but no entry price');
    }

    if (this.state.position === 0 && this.state.inPosition > 0) {
      issues.push('No position but funds locked');
    }

    if (this.state.position < 0) {
      issues.push('Negative position detected!');
    }

    if (this.state.balance < 0) {
      issues.push('Negative balance detected!');
    }
    issues.push(...this._activeTradeQuantityIssues());

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Emergency state reset (use with caution!)
   */
  async emergencyReset(safeBalance = null) {
    console.warn('[StateManager] EMERGENCY RESET INITIATED');

    const updates = {
      position: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      balance: safeBalance || this.state.totalBalance,
      totalBalance: safeBalance || this.state.totalBalance,
      inPosition: 0,
      activeTrades: new Map(),
      recoveryMode: true
    };

    return this.updateState(updates, { action: 'EMERGENCY_RESET' });
  }

  /**
   * Pause trading for safety
   * @param {string} reason - Why trading is being paused
   */
  async pauseTrading(reason, options = {}) {
    console.log('[StateManager] PAUSING TRADING:', reason);

    const source = typeof options.source === 'string' && options.source.trim()
      ? options.source.trim()
      : null;
    const scope = options.scope && typeof options.scope === 'object'
      ? {
        symbol: options.scope.symbol || null,
        timeframe: options.scope.timeframe || null,
        brokerId: options.scope.brokerId || null,
        accountId: options.scope.accountId || null,
        assetClass: options.scope.assetClass || null,
        executionMode: options.scope.executionMode || null,
      }
      : null;

    const updates = {
      isTrading: false,
      lastError: reason,
      pausedAt: Date.now(),
      pauseReason: reason,
      pauseSource: source,
      pauseRecoverable: options.recoverable === true,
      pauseScope: scope
    };

    await this.updateState(updates, { action: 'PAUSE_TRADING', reason, source, scope });

    // Log to console with visible warning
    console.log('═══════════════════════════════════════════════════════');
    console.log('TRADING PAUSED - SAFETY STOP');
    console.log(`   Reason: ${reason}`);
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log('   Action Required: Review logs and resume manually');
    console.log('═══════════════════════════════════════════════════════');

    return { success: true, message: `Trading paused: ${reason}` };
  }

  /**
   * Resume trading after pause
   */
  async resumeTrading(context = {}) {
    console.log('[StateManager] RESUMING TRADING');

    const updates = {
      isTrading: true,
      lastError: null,
      pausedAt: null,
      pauseReason: null,
      pauseSource: null,
      pauseRecoverable: false,
      pauseScope: null,
      resumedAt: Date.now()
    };

    await this.updateState(updates, { action: 'RESUME_TRADING', ...context });

    console.log('═══════════════════════════════════════════════════════');
    console.log('TRADING RESUMED');
    console.log(`   Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════');

    return { success: true, message: 'Trading resumed' };
  }

  _pauseScopeMatches(expectedScope = {}) {
    const stored = this.state.pauseScope;
    if (!stored || typeof stored !== 'object') return true;

    for (const field of ['symbol', 'timeframe', 'brokerId', 'accountId', 'assetClass', 'executionMode']) {
      const expectedValue = expectedScope[field];
      const storedValue = stored[field];
      if (storedValue === null || storedValue === undefined || storedValue === '') return false;
      if (expectedValue === null || expectedValue === undefined || expectedValue === '') return false;
      const left = field === 'symbol'
        ? this.normalizeSymbol(String(storedValue), 'StateManager.pauseScope')
        : String(storedValue).trim();
      const right = field === 'symbol'
        ? this.normalizeSymbol(String(expectedValue), 'StateManager.resume scope')
        : String(expectedValue).trim();
      if (left !== right) return false;
    }

    return true;
  }

  _isLegacyTtpFlatnessPause() {
    const pauseReason = String(this.state.pauseReason || '').trim();
    const lastError = String(this.state.lastError || '').trim();
    const pauseSource = typeof this.state.pauseSource === 'string' ? this.state.pauseSource.trim() : this.state.pauseSource || null;
    const legacyReason = pauseReason || lastError;
    const reasonMatches = legacyReason.startsWith(TTP_CUTOFF_FLATNESS_PAUSE_PREFIX);
    const errorMatches = !lastError || lastError === legacyReason || lastError.startsWith(TTP_CUTOFF_FLATNESS_PAUSE_PREFIX);
    return pauseSource === TTP_CUTOFF_FLATNESS_PAUSE_SOURCE && reasonMatches && errorMatches;
  }

  _legacyTtpFlatnessReason() {
    const pauseReason = String(this.state.pauseReason || '');
    return pauseReason.trim() ? pauseReason : String(this.state.lastError || '');
  }

  _migrateLegacyTtpFlatnessPause(activeTradeCount) {
    if (this.state.isTrading !== false || !this._isLegacyTtpFlatnessPause()) {
      return false;
    }
    if (this.state.pauseRecoverable !== false) {
      return false;
    }
    if (activeTradeCount !== 0) {
      return false;
    }
    if (Number(this.state.position) !== 0 || Number(this.state.inPosition) !== 0) {
      return false;
    }

    const pauseReason = this._legacyTtpFlatnessReason();
    const cutoffDate = pauseReason.match(/date=([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1] || null;
    const migratedAt = new Date().toISOString();
    this.state.ttpCutoffQuarantine = {
      source: TTP_CUTOFF_FLATNESS_PAUSE_SOURCE,
      status: 'quarantined',
      entryBlocking: false,
      manualReconciliationRequired: true,
      requiresManualReconciliation: true,
      brokerFlatVerified: false,
      migratedFromLegacyPause: true,
      migratedAt,
      legacyPausedAt: this.state.pausedAt || null,
      legacyPauseRecoverable: this.state.pauseRecoverable,
      legacyPauseReason: pauseReason,
      manualReconciliationMessage: pauseReason,
      operatorMessage: pauseReason,
      currentDateET: cutoffDate,
      reason: `${pauseReason}; migrated from legacy global pause to non-blocking quarantine`,
    };
    this.state.isTrading = true;
    this.state.pauseReason = null;
    this.state.pauseSource = null;
    this.state.pauseRecoverable = false;
    this.state.pauseScope = null;
    this.state.lastError = null;
    this.state.pausedAt = null;
    this.state.resumedAt = Date.now();
    console.warn(`[StateManager] Migrated legacy TTP flatness pause to quarantine at ${migratedAt}`);
    return true;
  }

  async resumeTradingIfPausedBy(source, options = {}) {
    await this.acquireLock();
    try {
      if (this.state.isTrading !== false) {
        return { success: true, resumed: false, reason: 'not_paused' };
      }

      const pauseReason = String(this.state.pauseReason || this.state.lastError || '');
      const legacyPrefixes = Array.isArray(options.legacyReasonPrefixes)
        ? options.legacyReasonPrefixes
        : [];
      const sourceMatches = source && this.state.pauseSource === source;
      const legacyMatches = options.allowLegacyUnscoped === true
        && !this.state.pauseSource
        && legacyPrefixes.some(prefix => pauseReason.startsWith(prefix));
      if (!sourceMatches && !legacyMatches) {
        return {
          success: false,
          resumed: false,
          reason: 'pause_source_mismatch',
          pauseSource: this.state.pauseSource || null,
          pauseReason,
        };
      }

      if (this.state.pauseRecoverable === false && !legacyMatches) {
        return { success: false, resumed: false, reason: 'pause_not_recoverable', pauseSource: this.state.pauseSource || null };
      }

      if (!this._pauseScopeMatches(options.scope || {})) {
        return {
          success: false,
          resumed: false,
          reason: 'pause_scope_mismatch',
          pauseScope: this.state.pauseScope || null,
          recoveryScope: options.scope || null,
        };
      }

      const updates = {
        isTrading: true,
        lastError: null,
        pausedAt: null,
        pauseReason: null,
        pauseSource: null,
        pauseRecoverable: false,
        pauseScope: null,
        resumedAt: Date.now()
      };

      const result = this._applyStateUpdatesLocked(updates, {
        action: 'RESUME_TRADING',
        resumeSource: options.resumeSource || source,
        resumeReason: options.reason || null,
        recoveredPauseReason: pauseReason,
        recoveredPauseSource: this.state.pauseSource || (legacyMatches ? 'legacy' : null),
      });
      if (!result.success) return { ...result, resumed: false };

      console.log('═══════════════════════════════════════════════════════');
      console.log('TRADING RESUMED');
      console.log(`   Time: ${new Date().toISOString()}`);
      console.log('═══════════════════════════════════════════════════════');

      return { success: true, resumed: true, reason: 'resumed' };
    } finally {
      this.releaseLock();
    }
  }

  // === CHANGE 2025-12-13: STEP 1 - ACTIVE TRADES MANAGEMENT ===

  /**
   * Add or update an active trade
   * PHASE 13B: BYPASS HALT - triggers haltNewEntries when called from outside PositionTracker
   */
  updateActiveTrade(orderId, tradeData) {
    // PHASE 13B: Bypass halt switch ENABLED
    const BYPASS_HALT_ENABLED = true;

    const stack = new Error().stack;
    const isFromPositionTracker = stack.includes('PositionTracker');
    if (!isFromPositionTracker) {
      const caller = stack.split('\n')[2]?.trim() || 'unknown';

      // Always collect violation for analysis
      this._bypassViolations = this._bypassViolations || [];
      this._bypassViolations.push({
        method: 'updateActiveTrade',
        orderId,
        caller,
        timestamp: Date.now(),
        stack: stack.split('\n').slice(1, 6).join('\n')
      });

      // PHASE 13B: Trigger halt on bypass
      if (BYPASS_HALT_ENABLED) {
        this._haltNewEntries = true;
        this._haltReason = `Bypass detected: ${caller} called updateActiveTrade() directly`;

        console.error(`[StateManager] BYPASS HALT TRIGGERED`);
        console.error(`   Caller: ${caller}`);
        console.error(`   OrderId: ${orderId}`);
        console.error(`   Stack trace:\n${stack.split('\n').slice(1, 6).join('\n')}`);
        console.error(`   NEW ENTRIES HALTED - exits only until flat`);

        // Emit alert event if listeners registered
        if (this._alertListeners?.length > 0) {
          const alert = {
            type: 'BYPASS_VIOLATION',
            method: 'updateActiveTrade',
            caller,
            orderId,
            timestamp: Date.now()
          };
          for (const listener of this._alertListeners) {
            try { listener(alert); } catch (e) { /* ignore */ }
          }
        }
      } else {
        // Detection mode only (Phase 13A behavior)
        console.warn(`[StateManager] BYPASS DETECTED: updateActiveTrade() called from outside PositionTracker`);
        console.warn(`   Caller: ${caller}`);
        console.warn(`   OrderId: ${orderId}`);
      }
    }

    console.log(`[StateManager] updateActiveTrade called with orderId: ${orderId}`);
    console.log(`[StateManager] this.get exists: ${typeof this.get}`);
    console.log(`[StateManager] this.set exists: ${typeof this.set}`);

    const trades = new Map(this.state.activeTrades || []);
    console.log(`[StateManager] Got trades: ${trades instanceof Map ? 'Map' : typeof trades}`);
    if (!(trades instanceof Map)) {
      throw new Error(`[StateManager.updateActiveTrade] activeTrades container invariant failed: expected Map, got ${typeof trades}`);
    }

    const tradeRecord = tradeData && typeof tradeData === 'object'
      ? withExitLifecycleFields({
          ...tradeData,
          id: tradeData.id || orderId,
          orderId: tradeData.orderId || orderId,
        }, { reset: true })
      : tradeData;
    const quantityIssues = this._activeTradeQuantityIssuesForTrade(tradeRecord, orderId);
    if (quantityIssues.length > 0) {
      throw new Error(`[StateManager.updateActiveTrade] active trade quantity invariant failed: ${quantityIssues.join('; ')}`);
    }

    trades.set(orderId, tradeRecord);
    console.log(`[StateManager] About to normalize activeTrades`);

    this.state.activeTrades = this._normalizeActiveTradesInput(trades, 'StateManager.updateActiveTrade');
    // FIX 2026-02-16: REMOVED this.save() - was causing race condition!
    // openPosition() saves AFTER updating BOTH activeTrades AND position atomically
    console.log(`[StateManager] Updated trade ${orderId} (no save - openPosition will save)`);
  }

  /**
   * Remove an active trade
   */
  removeActiveTrade(orderId) {
    const trades = new Map(this.state.activeTrades || []);
    if (trades && trades.has(orderId)) {
      trades.delete(orderId);
      this.state.activeTrades = this._normalizeActiveTradesInput(trades, 'StateManager.removeActiveTrade');
      // FIX 2026-02-16: REMOVED this.save() - same race condition fix
      // closePosition() saves AFTER updating BOTH activeTrades AND position atomically
      console.log(`[StateManager] Removed trade ${orderId} (no save - closePosition will save)`);
    }
  }

  /**
   * Get all active trades as array — account-wide query across every symbol.
   * Use for equity/P&L reconciliation, snapshots, position-tracker rebuilds.
   * For symbol-specific decisions (exit-check on a symbol's candle, BUY-match
   * for a symbol's SELL) use getTradesBySymbol(symbol) instead — that filter
   * is what prevents cross-symbol contamination in multi-broker arbitrage.
   */
  getAllTrades() {
    const trades = this.state.activeTrades;
    return trades ? Array.from(trades.values()) : [];
  }

  /**
   * Get a read-only active trade snapshot by id/orderId.
   * This is the StateManager-owned read boundary for planner/coordinator code:
   * callers can inspect trade truth without mutating the live activeTrades Map.
   */
  getActiveTrade(tradeId) {
    if (typeof tradeId !== 'string' || !tradeId.trim()) {
      throw new Error(`[StateManager.getActiveTrade] requires explicit non-empty tradeId; got ${JSON.stringify(tradeId)}`);
    }

    const trades = this.get('activeTrades');
    if (!trades) {
      return null;
    }
    if (!(trades instanceof Map)) {
      throw new Error(`[StateManager.getActiveTrade] activeTrades container invariant failed: expected Map, got ${Object.prototype.toString.call(trades)}`);
    }

    const trade = trades.get(tradeId.trim()) || null;
    return trade ? deepFreezePlain(clonePlain(trade)) : null;
  }

  /**
   * Reserve a single in-flight exit intent for a trade before broker submission.
   * This is pre-confirm bookkeeping only: it prevents duplicate exits but does
   * not change size, quantity, P&L, tier state, or BE scale-out state.
   */
  async reserveExitSlot(tradeId, intentId, options = {}) {
    const caller = 'StateManager.reserveExitSlot';
    const normalizedTradeId = requireNonEmptyString(tradeId, 'tradeId', caller);
    const normalizedIntentId = requireNonEmptyString(intentId, 'intentId', caller);
    const submittedAtMs = optionalFiniteNumber(options.submittedAtMs, 'submittedAtMs', caller, { min: 1 });
    if (submittedAtMs === null) {
      throw new Error(`[${caller}] submittedAtMs is required for deterministic exit intent provenance`);
    }

    const exitFraction = optionalFiniteNumber(options.exitFraction, 'exitFraction', caller, { min: 0, max: 1 });
    if (exitFraction !== null && exitFraction <= 0) {
      throw new Error(`[${caller}] exitFraction must be > 0 when supplied; got ${exitFraction}`);
    }

    await this.acquireLock();
    try {
      const trades = this.state.activeTrades;
      if (!(trades instanceof Map)) {
        throw new Error(`[${caller}] activeTrades container invariant failed: expected Map, got ${Object.prototype.toString.call(trades)}`);
      }

      const trade = trades.get(normalizedTradeId);
      if (!trade) {
        return { success: false, reserved: false, reason: 'trade_not_found', tradeId: normalizedTradeId, intentId: normalizedIntentId };
      }

      if (trade.pendingExitIntent && trade.pendingExitIntent.intentId) {
        return {
          success: true,
          reserved: false,
          reason: 'exit_already_pending',
          tradeId: normalizedTradeId,
          intentId: normalizedIntentId,
          pendingExitIntent: clonePlain(trade.pendingExitIntent),
        };
      }

      const remainingQuantity = Number(trade.remainingOrderQuantity);
      const expectedRemainingQuantity = optionalFiniteNumber(
        options.expectedRemainingQuantity,
        'expectedRemainingQuantity',
        caller,
        { min: 0 }
      ) ?? (
        Number.isFinite(remainingQuantity) && remainingQuantity > 0 && exitFraction !== null
          ? Math.max(0, remainingQuantity * (1 - exitFraction))
          : null
      );
      const tradeRevision = Number.isSafeInteger(Number(trade.tradeRevision)) && Number(trade.tradeRevision) >= 0
        ? Number(trade.tradeRevision)
        : 0;
      const nextTrade = {
        ...trade,
        tradeRevision: tradeRevision + 1,
        pendingExitIntent: {
          intentId: normalizedIntentId,
          sourceEventId: typeof options.sourceEventId === 'string' && options.sourceEventId.trim()
            ? options.sourceEventId.trim()
            : null,
          brokerOrderId: typeof options.brokerOrderId === 'string' && options.brokerOrderId.trim()
            ? options.brokerOrderId.trim()
            : null,
          lifecycleState: 'submitted',
          submittedAtMs,
          exitFraction,
          expectedRemainingQuantity,
          tradeRevision,
        },
      };
      const nextActiveTrades = new Map(trades);
      nextActiveTrades.set(normalizedTradeId, nextTrade);

      const result = this._applyStateUpdatesLocked({
        activeTrades: nextActiveTrades,
      }, {
        action: 'RESERVE_EXIT_SLOT',
        tradeId: normalizedTradeId,
        intentId: normalizedIntentId,
        sourceEventId: nextTrade.pendingExitIntent.sourceEventId,
      });

      return {
        ...result,
        reserved: result.success === true,
        reason: result.success === true ? 'reserved' : 'state_update_failed',
        tradeId: normalizedTradeId,
        intentId: normalizedIntentId,
        pendingExitIntent: clonePlain(nextTrade.pendingExitIntent),
      };
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Release a reserved exit slot after broker rejection/cancel or caller abort.
   * A mismatched intent cannot clear another pending exit.
   */
  async releaseExitSlot(tradeId, intentId, options = {}) {
    const caller = 'StateManager.releaseExitSlot';
    const normalizedTradeId = requireNonEmptyString(tradeId, 'tradeId', caller);
    const normalizedIntentId = requireNonEmptyString(intentId, 'intentId', caller);

    await this.acquireLock();
    try {
      const trades = this.state.activeTrades;
      if (!(trades instanceof Map)) {
        throw new Error(`[${caller}] activeTrades container invariant failed: expected Map, got ${Object.prototype.toString.call(trades)}`);
      }

      const trade = trades.get(normalizedTradeId);
      if (!trade) {
        return { success: false, released: false, reason: 'trade_not_found', tradeId: normalizedTradeId, intentId: normalizedIntentId };
      }

      const pending = trade.pendingExitIntent;
      if (!pending || !pending.intentId) {
        return { success: true, released: false, reason: 'no_exit_pending', tradeId: normalizedTradeId, intentId: normalizedIntentId };
      }
      if (pending.intentId !== normalizedIntentId) {
        return {
          success: true,
          released: false,
          reason: 'intent_mismatch',
          tradeId: normalizedTradeId,
          intentId: normalizedIntentId,
          pendingExitIntent: clonePlain(pending),
        };
      }

      const tradeRevision = Number.isSafeInteger(Number(trade.tradeRevision)) && Number(trade.tradeRevision) >= 0
        ? Number(trade.tradeRevision)
        : 0;
      const nextTrade = {
        ...trade,
        tradeRevision: tradeRevision + 1,
        pendingExitIntent: null,
      };
      const nextActiveTrades = new Map(trades);
      nextActiveTrades.set(normalizedTradeId, nextTrade);

      const result = this._applyStateUpdatesLocked({
        activeTrades: nextActiveTrades,
      }, {
        action: 'RELEASE_EXIT_SLOT',
        tradeId: normalizedTradeId,
        intentId: normalizedIntentId,
        reason: options.reason || null,
      });

      return {
        ...result,
        released: result.success === true,
        reason: result.success === true ? 'released' : 'state_update_failed',
        tradeId: normalizedTradeId,
        intentId: normalizedIntentId,
      };
    } finally {
      this.releaseLock();
    }
  }

  normalizeSymbol(symbol, caller = 'StateManager.normalizeSymbol') {
    if (typeof symbol !== 'string' || !symbol.trim()) {
      throw new Error(
        `${caller} requires explicit non-empty string symbol; got ${JSON.stringify(symbol)}`
      );
    }
    return symbol.trim().toUpperCase().replace('XBT', 'BTC').replace('/', '-');
  }

  buildTradeScope(context, symbol, caller = 'StateManager.buildTradeScope') {
    const brokerId = context.brokerId || context.ledgerData?.brokerId || null;
    const rawAccountCandidate = context.accountId
      || context.account
      || context.brokerAccountId
      || context.ledgerData?.accountId
      || context.ledgerData?.account
      || null;
    const cleanedAccountCandidate = rawAccountCandidate !== null && rawAccountCandidate !== undefined
      ? String(rawAccountCandidate).trim()
      : '';
    const hasExplicitAccountId = rawAccountCandidate !== null
      && rawAccountCandidate !== undefined
      && cleanedAccountCandidate !== ''
      && cleanedAccountCandidate !== 'default';
    const accountId = hasExplicitAccountId ? cleanedAccountCandidate : 'default';
    const suppliedAccountIdSource = context.accountIdSource || context.ledgerData?.accountIdSource || null;
    const accountIdSource = hasExplicitAccountId
      ? (suppliedAccountIdSource && suppliedAccountIdSource !== 'default' ? suppliedAccountIdSource : 'trade')
      : 'default';
    const assetClass = context.assetClass || context.ledgerData?.assetClass || null;
    const executionMode = context.executionMode || context.ledgerData?.executionMode || null;
    const timeframe = context.timeframe || context.ledgerData?.timeframe || null;
    const missing = [];
    const invalid = [];
    const cleanText = (value, name) => {
      if (value === null || value === undefined) {
        missing.push(name);
        return null;
      }
      const cleaned = String(value).trim();
      if (!cleaned) {
        missing.push(name);
        return null;
      }
      if (INVALID_SCOPE_PLACEHOLDER_VALUES.has(cleaned.toLowerCase())) {
        invalid.push(name);
        return null;
      }
      return cleaned;
    };
    const rawSymbol = cleanText(symbol, 'symbol');
    const rawBrokerId = cleanText(brokerId, 'brokerId');
    const rawAccountId = cleanText(accountId, 'accountId');
    const rawAssetClass = cleanText(assetClass, 'assetClass');
    const rawExecutionMode = cleanText(executionMode, 'executionMode');
    const rawTimeframe = cleanText(timeframe, 'timeframe');
    if (missing.length > 0) {
      const error = new Error(`${caller} missing immutable trade scope field(s): ${missing.join(', ')}`);
      error.code = 'SCOPE_REJECTED';
      error.missingFields = missing;
      throw error;
    }
    if (invalid.length > 0) {
      const error = new Error(`${caller} invalid immutable trade scope placeholder field(s): ${invalid.join(', ')}`);
      error.code = 'SCOPE_REJECTED';
      error.invalidFields = invalid;
      throw error;
    }

    const scope = {
      symbol: this.normalizeSymbol(rawSymbol, caller),
      brokerId: rawBrokerId.toLowerCase(),
      accountId: rawAccountId,
      accountIdSource,
      assetClass: rawAssetClass.toLowerCase(),
      executionMode: rawExecutionMode.toLowerCase(),
      timeframe: rawTimeframe
    };
    scope.key = `${scope.executionMode}:${scope.brokerId}:${scope.accountId}:${scope.assetClass}:${scope.symbol}:${scope.timeframe}`;
    const suppliedScopeKey = context.scopeKey || context.ledgerData?.scopeKey || null;
    if (suppliedScopeKey !== null && suppliedScopeKey !== undefined && String(suppliedScopeKey).trim() !== scope.key) {
      const error = new Error(`${caller} scopeKey mismatch: supplied ${String(suppliedScopeKey).trim()} expected ${scope.key}`);
      error.code = 'SCOPE_REJECTED';
      error.missingFields = [];
      error.suppliedScopeKey = String(suppliedScopeKey).trim();
      error.expectedScopeKey = scope.key;
      throw error;
    }
    return scope;
  }

  setDashboardRuntimeScope(context = {}) {
    const symbol = context.symbol || context.tradingPair;
    const scope = this.buildTradeScope(context, symbol, 'StateManager.dashboardRuntimeScope');
    const missingFields = [];
    if (scope.accountId === 'default' || scope.accountIdSource === 'default') {
      missingFields.push('accountId');
    }
    const scopeComplete = missingFields.length === 0;
    this.dashboardRuntimeScope = {
      symbol: scope.symbol,
      broker: scope.brokerId,
      brokerId: scope.brokerId,
      accountId: scope.accountId,
      accountIdSource: scope.accountIdSource,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      scopeKey: scope.key,
      scopeKeyVersion: 2,
      scopeComplete,
      runtimeScopeStatus: scopeComplete ? 'complete' : 'incomplete',
      missingFields
    };
    return { ...this.dashboardRuntimeScope };
  }

  getDashboardRuntimeScope() {
    return this.dashboardRuntimeScope ? { ...this.dashboardRuntimeScope } : null;
  }

  clearDashboardRuntimeScope() {
    this.dashboardRuntimeScope = null;
    return true;
  }

  /**
   * Get active trades for ONE symbol. Required argument; throws on missing.
   * No null-fallback to "all trades" — that silent semantic is the footgun
   * that lets a caller forget the symbol and accidentally cross-contaminate
   * BUY-matching across TSLA/BTC/etc. Strict by design.
   */
  getTradesBySymbol(symbol) {
    // CC-C Commit 5: apply the SAME normalization openPosition uses at :406
    // (uppercase + XBT→BTC + slash→dash). External callers pass the broker/env
    // form ('BTC/USD', 'XBT/USD'); internal storage is dash-canonical
    // ('BTC-USD'). Without this, Phase 0 reproduces bit-identical for TSLA
    // (form-invariant) but Kraken/BTC mode silently fails: filter strict-eq
    // returns [] → exit-check skips → positions never close. Single source of
    // truth for the transform: when openPosition's canonical form changes,
    // change it here too.
    const normalized = this.normalizeSymbol(symbol, 'StateManager.getTradesBySymbol');
    const trades = this.get('activeTrades');
    if (!trades) return [];
    return Array.from(trades.values()).filter(t => t.symbol === normalized);
  }

  /**
   * Check if state is in sync
   */
  isInSync() {
    const validation = this.validateState();
    if (!validation.valid) {
      console.error('[StateManager] STATE DESYNC DETECTED:', validation.issues);
    }
    return validation.valid;
  }

  /**
   * PHASE 13A: Get bypass violations for analysis
   * Call this after backtest to see which code paths bypassed PositionTracker
   * @returns {Array} List of bypass violations
   */
  getBypassViolations() {
    return this._bypassViolations || [];
  }

  /**
   * PHASE 13A: Clear bypass violations (for fresh test runs)
   */
  clearBypassViolations() {
    this._bypassViolations = [];
  }

  /**
   * PHASE 13B: Check if new entries are halted due to bypass violation
   * @returns {boolean} True if entries halted
   */
  isHalted() {
    return this._haltNewEntries === true;
  }

  /**
   * PHASE 13B: Get halt reason
   * @returns {string|null} Reason for halt or null
   */
  getHaltReason() {
    return this._haltReason || null;
  }

  async haltSymbol(symbol, reason) {
    const normalized = this.normalizeSymbol(symbol, 'StateManager.haltSymbol');
    const halts = { ...(this.state.symbolEntryHalts || {}) };
    halts[normalized] = {
      reason: reason || 'unspecified',
      haltedAt: Date.now()
    };

    console.error(`[StateManager] SYMBOL ENTRY HALT: ${normalized} - ${halts[normalized].reason}`);
    return this.updateState(
      { symbolEntryHalts: halts },
      { action: 'SYMBOL_ENTRY_HALT', symbol: normalized, reason: halts[normalized].reason }
    );
  }

  isSymbolHalted(symbol) {
    const normalized = this.normalizeSymbol(symbol, 'StateManager.isSymbolHalted');
    return Boolean(this.state.symbolEntryHalts && this.state.symbolEntryHalts[normalized]);
  }

  getSymbolHaltReason(symbol) {
    const normalized = this.normalizeSymbol(symbol, 'StateManager.getSymbolHaltReason');
    return this.state.symbolEntryHalts?.[normalized]?.reason || null;
  }

  async resetSymbolHalt(symbol) {
    const normalized = this.normalizeSymbol(symbol, 'StateManager.resetSymbolHalt');
    const halts = { ...(this.state.symbolEntryHalts || {}) };
    delete halts[normalized];
    console.warn(`[StateManager] SYMBOL ENTRY HALT RESET: ${normalized}`);
    return this.updateState(
      { symbolEntryHalts: halts },
      { action: 'SYMBOL_ENTRY_HALT_RESET', symbol: normalized }
    );
  }

  /**
   * PHASE 13B: Reset halt flag (use with caution - only on bot restart)
   */
  resetHalt() {
    console.warn('[StateManager] HALT FLAG RESET - entries re-enabled');
    this._haltNewEntries = false;
    this._haltReason = null;
  }

  /**
   * PHASE 13B: Register alert listener for bypass violations
   * @param {Function} callback - Called with alert object on violation
   */
  onAlert(callback) {
    this._alertListeners = this._alertListeners || [];
    this._alertListeners.push(callback);
  }

  // === CHANGE 2025-12-13: CRITICAL - MAP SERIALIZATION FOR PERSISTENCE ===

  /**
   * Save state to disk with Map serialization
   */
  save() {
    try {
      // Skip state saving in backtest mode - don't corrupt real state
      if (getConfigValue('mode.backtest')) {
        return;
      }

      const fs = require('fs');
      const path = require('path');
      const dataDir = getConfigValue('paths.dataDir') || path.join(__dirname, '..', 'data');
      const stateFile = getConfigValue('paths.stateFile') || path.join(dataDir, 'state.json');

      // Create data directory if it doesn't exist
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Prepare state for serialization
      const stateToSave = { ...this.state };

      // CRITICAL: Convert Map to Array for JSON serialization
      if (this.state.activeTrades instanceof Map) {
        stateToSave.activeTrades = Array.from(this.state.activeTrades.entries());
      }
      if (this.state.lastPrices instanceof Map) {
        stateToSave.lastPrices = Object.fromEntries(this.state.lastPrices);
      }
      if (this.state.lastPriceTimes instanceof Map) {
        stateToSave.lastPriceTimes = Object.fromEntries(this.state.lastPriceTimes);
      }

      // Save to disk atomically (Mercury Vector 6 — crash-safe state persistence)
      const { writeJsonAtomic } = require('./AtomicWrite');
      writeJsonAtomic(stateFile, stateToSave);
      console.log('[StateManager] State saved to disk');
    } catch (error) {
      console.error('[StateManager] Failed to save state:', error);
    }
  }

  /**
   * Load state from disk with Map deserialization
   */
  load() {
    try {
      // Skip persisted state in backtest mode, but still honor explicit
      // INITIAL_BALANCE so sizing, recorder math, and state agree.
      if (getConfigValue('mode.backtest')) {
        const initialBalanceSource = getConfigSource('backtest.initialBalance');
        if (!initialBalanceSource || initialBalanceSource === 'default') {
          throw new Error('[StateManager] BACKTEST_MODE=true requires explicit INITIAL_BALANCE; refusing default $10000 reset');
        }
        const initialBalance = getConfigValue('backtest.initialBalance');
        console.log(`[StateManager] BACKTEST_MODE: Starting with clean $${initialBalance} state`);
        this.initializeFreshState(initialBalance, { source: 'StateManager.backtestMode' });
        return;
      }

      // CHANGE 2026-01-23: Option to start fresh in paper mode
      // Set FRESH_START=true to reset paper trading state on boot
      if (getConfigValue('backtest.freshStart')) {
        if (getConfigValue('mode.liveTrading')) {
          throw new Error('[StateManager] FRESH_START=true is not allowed when LIVE_TRADING=true');
        }
        const initialBalanceSource = getConfigSource('backtest.initialBalance');
        if (!initialBalanceSource || initialBalanceSource === 'default') {
          throw new Error('[StateManager] FRESH_START=true requires explicit INITIAL_BALANCE; refusing default $10000 reset');
        }
        const initialBalance = getConfigValue('backtest.initialBalance');
        console.log(`[StateManager] FRESH_START: Resetting to clean $${initialBalance} state`);
        this.initializeFreshState(initialBalance, { source: 'StateManager.freshStart' });
        return;
      }

      const fs = require('fs');
      const path = require('path');
      const dataDir = getConfigValue('paths.dataDir') || path.join(__dirname, '..', 'data');
      const stateFile = getConfigValue('paths.stateFile') || path.join(dataDir, 'state.json');

      if (fs.existsSync(stateFile)) {
        const savedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        let correctedStateShape = false;

        // CRITICAL: Convert Array back to Map
        if (Array.isArray(savedState.activeTrades)) {
          savedState.activeTrades = new Map(savedState.activeTrades);
        } else if (!savedState.activeTrades) {
          savedState.activeTrades = new Map();
        }
        // Rehydrate lastPrices Map (same pattern as activeTrades)
        if (savedState.lastPrices && !(savedState.lastPrices instanceof Map)) {
          savedState.lastPrices = new Map(Object.entries(savedState.lastPrices));
        } else if (!savedState.lastPrices) {
          savedState.lastPrices = new Map();
        }
        if (savedState.lastPriceTimes && !(savedState.lastPriceTimes instanceof Map)) {
          savedState.lastPriceTimes = new Map(Object.entries(savedState.lastPriceTimes).map(([symbol, value]) => [symbol, Number(value)]));
        } else if (!savedState.lastPriceTimes) {
          savedState.lastPriceTimes = new Map();
        }

        // Restore state
        this.state = { ...this.state, ...savedState };
        if (!(this.state.activeTrades instanceof Map)) {
          throw new Error(
            `[StateManager.load] activeTrades container invariant failed: expected serialized array/Map, got ${Object.prototype.toString.call(this.state.activeTrades)}`
          );
        }
        this.state.activeTrades = new Map(
          Array.from(this.state.activeTrades.entries()).map(([tradeId, trade]) => [
            tradeId,
            withExitLifecycleFields(trade, { legacy: true }),
          ])
        );
        if (typeof this.state.isTrading !== 'boolean') {
          const invalidIsTrading = this.state.isTrading;
          const pauseReason = `[StateManager.load] invalid persisted isTrading=${JSON.stringify(invalidIsTrading)}; forcing entries paused`;
          this.state.isTrading = false;
          this.state.pauseReason = this.state.pauseReason || pauseReason;
          this.state.lastError = this.state.lastError || pauseReason;
          correctedStateShape = true;
          console.warn(pauseReason);
        }
        if (!this.state.symbolEntryHalts || typeof this.state.symbolEntryHalts !== 'object' || Array.isArray(this.state.symbolEntryHalts)) {
          this.state.symbolEntryHalts = {};
        } else {
          const normalizedHalts = {};
          for (const [haltSymbol, halt] of Object.entries(this.state.symbolEntryHalts)) {
            const normalized = this.normalizeSymbol(haltSymbol, 'StateManager.load symbolEntryHalts');
            normalizedHalts[normalized] = halt;
          }
          this.state.symbolEntryHalts = normalizedHalts;
        }
        console.log('[StateManager] State loaded from disk');

        // Active trades without immutable scope are ambiguous. Do not infer
        // from current boot config: after symbol/broker switching, brokerId,
        // assetClass, executionMode, and timeframe may no longer match the
        // trade's true origin.
        const invalidScopeTrades = [];
        let normalizedExisting = 0;
        for (const trade of this.state.activeTrades.values()) {
          const tradeId = trade.id || trade.orderId || '<unknown>';
          if (!trade.symbol) {
            invalidScopeTrades.push(`${tradeId}:symbol`);
          } else {
            const normalizedTradeSymbol = this.normalizeSymbol(String(trade.symbol), 'StateManager.load trade.symbol');
            if (trade.symbol !== normalizedTradeSymbol) {
              trade.symbol = normalizedTradeSymbol;
              normalizedExisting++;
            }
          }
          const scopeInput = {
            symbol: trade.symbol,
            brokerId: trade.brokerId || trade.brokerName || trade.broker || null,
            accountId: trade.accountId || trade.account || null,
            accountIdSource: trade.accountIdSource,
            assetClass: trade.assetClass || trade.assetType || null,
            executionMode: trade.executionMode || trade.decisionLedger?.executionMode || null,
            timeframe: trade.timeframe || trade.decisionLedger?.timeframe || null
          };
          try {
            const scope = this.buildTradeScope(scopeInput, trade.symbol, 'StateManager.load trade scope');
            trade.brokerId = scope.brokerId;
            trade.accountId = scope.accountId;
            trade.accountIdSource = scope.accountIdSource;
            trade.assetClass = scope.assetClass;
            trade.executionMode = scope.executionMode;
            trade.timeframe = scope.timeframe;
            trade.scopeKey = scope.key;
          } catch (err) {
            invalidScopeTrades.push(`${tradeId}:${err.message}`);
          }
        }
        if (invalidScopeTrades.length > 0) {
          throw new Error(
            `[StateManager.load] Active trade(s) missing immutable scope: ${invalidScopeTrades.join('; ')}. Refusing to infer from current boot config because symbol/broker switching can corrupt positions. Reconcile or quarantine state.json manually.`
          );
        }
        const invalidQuantityTrades = this._activeTradeQuantityIssues();
        if (invalidQuantityTrades.length > 0) {
          throw new Error(
            `[StateManager.load] Active trade quantity invariant failed: ${invalidQuantityTrades.join('; ')}. Refusing to load positions whose USD exposure cannot be matched to broker quantity. Reconcile or quarantine state.json manually.`
          );
        }
        if (normalizedExisting > 0) {
          console.warn(`[StateManager] Normalized ${normalizedExisting} persisted trade symbol(s) to dash form.`);
        }
        const activeTradeCount = this.state.activeTrades instanceof Map ? this.state.activeTrades.size : 0;
        const symbolHaltCount = Object.keys(this.state.symbolEntryHalts || {}).length;
        if (activeTradeCount === 0) {
          const persistedPosition = Number(this.state.position);
          const persistedInPosition = Number(this.state.inPosition);
          if (!Number.isFinite(persistedPosition) || persistedPosition !== 0) {
            throw new Error(
              `[StateManager.load] Source-less position exposure: activeTrades empty but position=${this.state.position}. Refusing to infer a flat state without active trade evidence.`
            );
          }
          if (!Number.isFinite(persistedInPosition) || persistedInPosition < 0) {
            throw new Error(
              `[StateManager.load] Invalid flat-state inPosition=${this.state.inPosition}. Refusing to infer locked exposure without active trade evidence.`
            );
          }
          if (persistedInPosition > 0 || this.state.positionCount !== 0 || this.state.entryPrice !== 0 || this.state.entryTime !== null) {
            const staleFlatState = {
              inPosition: this.state.inPosition,
              positionCount: this.state.positionCount,
              entryPrice: this.state.entryPrice,
              entryTime: this.state.entryTime,
            };
            this.state.inPosition = 0;
            this.state.positionCount = 0;
            this.state.entryPrice = 0;
            this.state.entryTime = null;
            correctedStateShape = true;
            console.warn(`[StateManager] Cleared stale flat position metadata: ${JSON.stringify(staleFlatState)}`);
          }
        }
        if (this._migrateLegacyTtpFlatnessPause(activeTradeCount)) {
          correctedStateShape = true;
        }
        if (correctedStateShape) {
          this.save();
        }
        const validation = this.validateState();
        if (
          this.state.recoveryMode === true &&
          activeTradeCount === 0 &&
          symbolHaltCount === 0 &&
          !this.state.lastError &&
          !this.state.pauseReason &&
          this.state.isTrading !== false &&
          validation.valid
        ) {
          this.state.recoveryMode = false;
          console.warn('[StateManager] Cleared stale recoveryMode on flat, valid state with no active halts.');
          this.save();
        }

        // Verify Map restoration
        console.log(`[StateManager] Active trades restored: ${this.state.activeTrades.size} trades`);
      }
    } catch (error) {
      console.error('[StateManager] Failed to load state:', error);
      this.state.recoveryMode = true;
      this.state.lastError = error.message;
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Internal Methods (Lock, Validation, Logging)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate state updates before applying.
   * Throws if updates would create invalid state.
   *
   * @private
   * @param {Object} updates - Proposed state updates
   * @throws {Error} If updates would create negative position or balance
   */
  validateUpdates(updates) {
    // Position can be negative for shorts - don't validate sign
    // Only validate balance (can't go negative)
    if (updates.balance !== undefined && updates.balance < 0) {
      throw new Error('Cannot set negative balance');
    }
  }

  /**
   * Log a transaction for debugging/audit purposes.
   * Maintains a rolling window of the last N transactions.
   *
   * @private
   * @param {Object} transaction - Transaction record
   * @param {number} transaction.timestamp - When transaction occurred
   * @param {Object} transaction.updates - What was changed
   * @param {Object} transaction.context - Why it was changed
   * @param {Object} transaction.snapshot - State before change
   */
  logTransaction(transaction) {
    this.transactionLog.push(transaction);
    if (this.transactionLog.length > this.maxLogSize) {
      this.transactionLog.shift();
    }
  }

  /**
   * Acquire exclusive lock for atomic operations.
   * Uses a simple queue-based mutex to ensure only one update runs at a time.
   *
   * @private
   * @async
   * @returns {Promise<void>} Resolves when lock is acquired
   */
  async acquireLock() {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    // Wait for lock to be available
    await new Promise(resolve => {
      this.lockQueue.push(resolve);
    });
    this.locked = true;  // CRITICAL: Must set after wait completes
  }

  releaseLock() {
    if (this.lockQueue.length > 0) {
      const next = this.lockQueue.shift();
      this.locked = false;  // Release lock
      next();  // Wake next waiter
    } else {
      this.locked = false;  // Only release if no queue
    }
  }

  // === LISTENERS ===

  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(updates, context) {
    for (const listener of this.listeners) {
      try {
        listener(updates, context, this.getState());
      } catch (error) {
        console.error('[StateManager] Listener error:', error);
      }
    }

    // CHANGE 2025-12-11: Broadcast to dashboard AFTER state changes
    // This ensures dashboard always shows accurate, post-update state
    try {
      this.broadcastToDashboard(updates, context);
    } catch (error) {
      console.warn('[StateManager] state_update broadcast notification failed:', error.message);
    }
  }

  // === DASHBOARD INTEGRATION ===
  // CHANGE 2025-12-11: Dashboard gets state AFTER updates, never stale data

  setDashboardWs(ws) {
    const heartbeatMs = this._dashboardStateHeartbeatMs();
    const closeMethod = this._dashboardSocketCloseMethod(ws);
    this._assertDashboardSocketCanSend(ws);
    this._assertDashboardSocketOpen(ws);
    this._clearDashboardStateHeartbeat();
    this.dashboardWs = ws;
    console.log('[StateManager] Dashboard WebSocket connected');
    try {
      this.broadcastToDashboard({}, { reason: 'dashboard_connect' });
    } catch (error) {
      console.warn('[StateManager] dashboard_connect state_update failed:', error.message);
    }
    this._startDashboardStateHeartbeat(ws, heartbeatMs);
    this._bindDashboardSocketClose(ws, closeMethod);
  }

  _dashboardStateHeartbeatMs() {
    const heartbeatMs = Number(TradingConfig.get('dashboard.stateUpdateHeartbeatMs'));
    if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
      throw new Error(`TradingConfig dashboard.stateUpdateHeartbeatMs must be positive milliseconds; got ${heartbeatMs}`);
    }
    return heartbeatMs;
  }

  _startDashboardStateHeartbeat(ws, heartbeatMs = this._dashboardStateHeartbeatMs()) {
    this.dashboardHeartbeatInterval = setInterval(() => {
      if (this.dashboardWs !== ws) return;
      if (!ws || ws.readyState !== 1) {
        console.warn('[StateManager] dashboard_heartbeat stopped; socket not open:', ws ? ws.readyState : 'missing');
        this._clearDashboardStateHeartbeat();
        if (this.dashboardWs === ws) this.dashboardWs = null;
        return;
      }
      try {
        this.broadcastToDashboard({}, { reason: 'dashboard_heartbeat' });
      } catch (error) {
        console.warn('[StateManager] dashboard_heartbeat state_update failed:', error.message);
      }
    }, heartbeatMs);
    if (typeof this.dashboardHeartbeatInterval.unref === 'function') {
      this.dashboardHeartbeatInterval.unref();
    }
  }

  _clearDashboardStateHeartbeat() {
    if (this.dashboardHeartbeatInterval) {
      clearInterval(this.dashboardHeartbeatInterval);
      this.dashboardHeartbeatInterval = null;
    }
  }

  _dashboardSocketCloseMethod(ws) {
    if (!ws) {
      throw new Error('StateManager.setDashboardWs requires a dashboard WebSocket instance');
    }
    if (typeof ws.once === 'function') return 'once';
    if (typeof ws.on === 'function') return 'on';
    if (typeof ws.addEventListener === 'function') return 'addEventListener';
    throw new Error('StateManager dashboard WebSocket must expose once, on, or addEventListener close binding');
  }

  _assertDashboardSocketCanSend(ws) {
    if (typeof ws.send !== 'function') {
      throw new Error('StateManager dashboard WebSocket must expose send method');
    }
  }

  _assertDashboardSocketOpen(ws) {
    if (ws.readyState !== 1) {
      throw new Error(`StateManager dashboard WebSocket must be open; readyState=${ws.readyState}`);
    }
  }

  _bindDashboardSocketClose(ws, closeMethod = this._dashboardSocketCloseMethod(ws)) {
    const handleClose = () => {
      if (this.dashboardWs === ws) {
        console.warn('[StateManager] dashboard WebSocket closed; state_update broadcasts stopped');
        this._clearDashboardStateHeartbeat();
        this.dashboardWs = null;
      }
    };
    if (closeMethod === 'once') {
      ws.once('close', handleClose);
    } else if (closeMethod === 'on') {
      ws.on('close', handleClose);
    } else if (closeMethod === 'addEventListener') {
      ws.addEventListener('close', handleClose, { once: true });
    }
  }

  _getActiveTradesForProjection(state = this.state) {
    const trades = state.activeTrades;
    if (trades instanceof Map) {
      return Array.from(trades.values());
    }
    if (Array.isArray(trades)) {
      return trades
        .map((entry) => Array.isArray(entry) ? entry[1] : entry)
        .filter(Boolean);
    }
    if (trades && typeof trades === 'object') {
      return Object.values(trades).filter(Boolean);
    }
    return [];
  }

  _buildScopedDashboardPositions(state = this.state) {
    const lastPrices = state.lastPrices instanceof Map
      ? state.lastPrices
      : new Map(Object.entries(state.lastPrices || {}));

    return this._getActiveTradesForProjection(state).map((trade) => {
      let symbol = null;
      if (trade.symbol) {
        try {
          symbol = this.normalizeSymbol(String(trade.symbol), 'StateManager.dashboardPosition symbol');
        } catch (_) {
          symbol = null;
        }
      }

      const action = trade.action || trade.type || null;
      const side = trade.direction || (action === 'SELL_SHORT' ? 'short' : 'long');
      const entryPrice = Number(trade.entryPrice ?? trade.price ?? 0);
      const sizeUsd = Number(trade.sizeUsd ?? trade.size ?? 0);
      const currentPriceRaw = symbol && lastPrices.has(symbol)
        ? lastPrices.get(symbol)
        : (trade.currentPrice ?? trade.lastPrice ?? entryPrice);
      const currentPrice = Number(currentPriceRaw);
      let unrealizedPnL = 0;

      if (
        Number.isFinite(entryPrice) &&
        entryPrice > 0 &&
        Number.isFinite(currentPrice) &&
        Number.isFinite(sizeUsd)
      ) {
        unrealizedPnL = side === 'short'
          ? sizeUsd * ((entryPrice - currentPrice) / entryPrice)
          : sizeUsd * ((currentPrice - entryPrice) / entryPrice);
      }

      const brokerId = trade.brokerId || trade.broker || trade.brokerName || null;
      const accountId = trade.accountId || trade.account || 'default';
      const accountIdSource = trade.accountIdSource || (accountId !== 'default' ? 'trade' : 'default');
      const hasExplicitAccountId = Boolean(accountId && accountId !== 'default' && accountIdSource !== 'default');
      const assetClass = trade.assetClass || trade.assetType || null;
      const executionMode = trade.executionMode || null;
      const timeframe = trade.timeframe || null;
      const scopeKey = trade.scopeKey || null;
      const scopeKeyVersion = typeof scopeKey === 'string' && scopeKey.split(':').length >= 6 ? 2 : 1;

      return {
        tradeId: trade.id || trade.orderId || null,
        orderId: trade.orderId || trade.id || null,
        symbol,
        broker: brokerId,
        brokerId,
        accountId,
        accountIdSource,
        assetClass,
        executionMode,
        timeframe,
        scopeKey,
        scopeKeyVersion,
        scopeComplete: Boolean(symbol && brokerId && hasExplicitAccountId && assetClass && executionMode && timeframe && scopeKeyVersion >= 2),
        action,
        side,
        status: trade.status || 'open',
        sizeUsd: Number.isFinite(sizeUsd) ? sizeUsd : 0,
        size: Number.isFinite(sizeUsd) ? sizeUsd : 0,
        entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
        currentPrice: Number.isFinite(currentPrice) ? currentPrice : 0,
        unrealizedPnL,
        openedAt: trade.entryTime || trade.timestamp || null,
        strategy: trade.strategy || trade.source || null,
        reason: trade.reason || null
      };
    });
  }

  _getDashboardPricingStatus(state = this.state) {
    const lastPrices = state.lastPrices instanceof Map
      ? state.lastPrices
      : new Map(Object.entries(state.lastPrices || {}));
    const missingPriceSymbols = new Set();

    for (const trade of this._getActiveTradesForProjection(state)) {
      const rawSymbol = trade.symbol ? String(trade.symbol) : null;
      let symbol = null;
      if (rawSymbol) {
        try {
          symbol = this.normalizeSymbol(rawSymbol, 'StateManager.dashboardPricing symbol');
        } catch (_) {
          symbol = null;
        }
      }

      const price = rawSymbol && lastPrices.has(rawSymbol)
        ? Number(lastPrices.get(rawSymbol))
        : null;

      if (!Number.isFinite(price) || price <= 0) {
        missingPriceSymbols.add(symbol || rawSymbol || trade.id || trade.orderId || 'unknown');
      }
    }

    return {
      pnlStatus: missingPriceSymbols.size > 0 ? 'unpriced_open_position' : 'priced',
      pnlMissingPriceSymbols: [...missingPriceSymbols],
    };
  }

  broadcastToDashboard(updates, context) {
    if (!this.dashboardWs) return false;
    if (this.dashboardWs.readyState !== 1) {
      console.warn('[StateManager] state_update skipped; dashboard socket not open:', this.dashboardWs.readyState);
      return false;
    }

    try {
      const state = this.getState();
      const positions = this._buildScopedDashboardPositions(state);
      const pricingStatus = this._getDashboardPricingStatus(state);
      const hasPricedOpenPositions = pricingStatus.pnlMissingPriceSymbols.length === 0;
      const equity = hasPricedOpenPositions ? this.getEquity() : null;
      const initialBalance = state.initialBalance;
      const dashboardTotalPnL = equity != null ? equity - initialBalance : null;
      const dashboardUnrealizedPnL = dashboardTotalPnL != null ? dashboardTotalPnL - state.realizedPnL : null;
      const runtimeScope = this.getDashboardRuntimeScope();
      const runtimeScopeStatus = runtimeScope
        ? (runtimeScope.scopeComplete ? 'complete' : 'incomplete')
        : 'unset';
      const runtimeScopeMissing = runtimeScope
        ? [...(runtimeScope.missingFields || [])]
        : ['runtimeScope'];
      const authoritativeRuntimeScope = runtimeScope && runtimeScope.scopeComplete && positions.length === 0
        ? runtimeScope
        : null;
      const dashboardState = {
        position: state.position,
        balance: state.balance,
        totalBalance: state.totalBalance,
        initialBalance,
        equity,
        realizedPnL: state.realizedPnL,
        unrealizedPnL: dashboardUnrealizedPnL,
        totalPnL: dashboardTotalPnL,
        pnlStatus: pricingStatus.pnlStatus,
        pnlMissingPriceSymbols: pricingStatus.pnlMissingPriceSymbols,
        tradeCount: state.tradeCount,
        dailyTradeCount: state.dailyTradeCount,
        recoveryMode: state.recoveryMode,
        ttpCutoffQuarantine: state.ttpCutoffQuarantine || null,
        runtimeScope,
        runtimeScopeStatus,
        runtimeScopeMissing,
        ...(authoritativeRuntimeScope || {}),
        positions,
        scopedPositionCount: positions.length
      };
      this.dashboardWs.send(JSON.stringify({
        type: 'state_update',
        source: 'StateManager',
        updates: updates,
        context: context,
        balance: dashboardState.balance,
        totalBalance: dashboardState.totalBalance,
        initialBalance: dashboardState.initialBalance,
        equity: dashboardState.equity,
        realizedPnL: dashboardState.realizedPnL,
        unrealizedPnL: dashboardState.unrealizedPnL,
        totalPnL: dashboardState.totalPnL,
        pnlStatus: dashboardState.pnlStatus,
        pnlMissingPriceSymbols: dashboardState.pnlMissingPriceSymbols,
        tradeCount: dashboardState.tradeCount,
        dailyTradeCount: dashboardState.dailyTradeCount,
        ttpCutoffQuarantine: dashboardState.ttpCutoffQuarantine,
        runtimeScope,
        runtimeScopeStatus,
        runtimeScopeMissing,
        ...(authoritativeRuntimeScope || {}),
        positions: dashboardState.positions,
        scopedPositionCount: dashboardState.scopedPositionCount,
        state: dashboardState,
        timestamp: Date.now()
      }));
      return true;
    } catch (error) {
      console.warn('[StateManager] Dashboard state_update broadcast failed:', error.message);
      return false;
    }
  }

  // === DEBUGGING ===

  getTransactionLog() {
    return [...this.transactionLog];
  }

  printState() {
    console.log('\n=== STATE SNAPSHOT ===');
    console.log(`Position: ${this.state.position} @ ${this.state.entryPrice || 'N/A'}`);
    console.log(`Balance: $${this.state.balance.toFixed(2)} (Total: $${this.state.totalBalance.toFixed(2)})`);
    console.log(`P&L: $${this.state.totalPnL.toFixed(2)} (Realized: $${this.state.realizedPnL.toFixed(2)})`);
    console.log(`Trades: ${this.state.tradeCount} total, ${this.state.dailyTradeCount} today`);
    console.log(`Recovery Mode: ${this.state.recoveryMode}`);
    console.log('======================\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: Module Exports (Singleton Pattern)
// ═══════════════════════════════════════════════════════════════════════════

/** @type {StateManager|null} Singleton instance */
let instance = null;

/**
 * Get the singleton StateManager instance.
 * Creates the instance on first call, returns existing on subsequent calls.
 *
 * @function getInstance
 * @returns {StateManager} The singleton StateManager instance
 *
 * @example
 * const { getInstance } = require('./core/StateManager');
 * const stateManager = getInstance();
 * const state = stateManager.getState();
 */
module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new StateManager();
    }
    return instance;
  },
  /** @type {typeof StateManager} The StateManager class (for testing) */
  StateManager
};
