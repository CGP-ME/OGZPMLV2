/**
 * @fileoverview MaxProfitManager - Advanced Profit Optimization & Exit Strategy Engine
 *
 * ============================================================================
 * THE PROFIT MAXIMIZER OF OGZ PRIME - TURNING WINS INTO MAXIMUM GAINS
 * ============================================================================
 *
 * @module core/MaxProfitManager
 *
 * @example
 * const MaxProfitManager = require('./core/MaxProfitManager');
 * const profitManager = new MaxProfitManager();
 *
 * // Start tracking a position
 * profitManager.startTracking(entryPrice, positionSize);
 *
 * // Update on each candle - returns exit signal if triggered
 * const exitSignal = profitManager.update(currentPrice, { volatility, trend });
 * if (exitSignal.shouldExit) {
 *   console.log(`Exit at ${exitSignal.exitPrice} - Reason: ${exitSignal.reason}`);
 * }
 * 
 * This is where good trades become GREAT trades. While the AI finds opportunities
 * and the TradingBrain executes them, the MaxProfitManager ensures you extract
 * maximum profit from every winning position through sophisticated exit strategies.
 * 
 * CRITICAL FOR SCALING:
 * New developers must understand this system separates amateur trading from
 * professional profit extraction. It's the difference between small wins and
 * life-changing gains that fund your Houston mission.
 * 
 * BUSINESS IMPACT:
 * - Implements tiered profit-taking to maximize gains from winning trades
 * - Uses dynamic trailing stops that adapt to market volatility
 * - Applies time-based exit optimizations for different market sessions
 * - Protects profits with breakeven stops and risk-adjusted trailing
 * - Provides detailed profit analytics for strategy optimization
 * 
 * HOUSTON MISSION CRITICAL:
 * Every dollar of additional profit gets you closer to financial freedom.
 * This system is designed to maximize the return from every successful trade,
 * compounding your growth toward the Houston goal.
 * 
 * AUTHOR: OGZ Prime Team - Built for Maximum Profit Extraction
 * DATE: Advanced Profit Management Implementation
 * 
 * ============================================================================
 * PROFIT OPTIMIZATION PHILOSOPHY:
 * ============================================================================
 * 
 * 1. TIERED EXITS: Take profits in stages to balance risk and reward
 * 2. DYNAMIC TRAILING: Adapt stop distances based on volatility and time
 * 3. VOLATILITY SCALING: Wider stops in volatile markets, tighter in calm ones
 * 4. TIME OPTIMIZATION: Adjust strategies based on trade duration
 * 5. BREAKEVEN PROTECTION: Lock in profits once position becomes profitable
 * 6. MARKET ADAPTATION: Different strategies for different market conditions
 * 
 * ============================================================================
 */

const TradingConfig = require('./TradingConfig');  // CHANGE 2026-02-28: Centralized config
const FeeModel = require('./FeeModel');
const { getNarrator } = require('./TradeNarrator');
const { assertExplicitExitOwnership } = require('./dto/ExitContractOwnership');
// Cache singleton at module load — narrator.enabled is sealed from env vars.
// Hot-path hook below checks cached narrator.enabled first; try frame only
// entered when enabled (C1 zero-cost when OFF).
const narrator = getNarrator();

function requireMpmConfig(path) {
  const value = TradingConfig.get(path);
  if (value === undefined || value === null) {
    throw new Error(`[MaxProfitManager] Missing required TradingConfig value: ${path}`);
  }
  return value;
}

function requireMpmNumber(path) {
  const value = requireMpmConfig(path);
  if (!Number.isFinite(value)) {
    throw new Error(`[MaxProfitManager] TradingConfig value must be a finite number: ${path}`);
  }
  return value;
}

function requireMpmNumberInRange(path, { greaterThan = null, min = null, max = null } = {}) {
  const value = requireMpmNumber(path);
  if (greaterThan !== null && !(value > greaterThan)) {
    throw new Error(`[MaxProfitManager] TradingConfig value must be > ${greaterThan}: ${path}`);
  }
  if (min !== null && !(value >= min)) {
    throw new Error(`[MaxProfitManager] TradingConfig value must be >= ${min}: ${path}`);
  }
  if (max !== null && !(value <= max)) {
    throw new Error(`[MaxProfitManager] TradingConfig value must be <= ${max}: ${path}`);
  }
  return value;
}

function requireMpmBoolean(path) {
  const value = requireMpmConfig(path);
  if (typeof value !== 'boolean') {
    throw new Error(`[MaxProfitManager] TradingConfig value must be boolean: ${path}`);
  }
  return value;
}

function requireMpmString(path) {
  const value = requireMpmConfig(path);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[MaxProfitManager] TradingConfig value must be a non-empty string: ${path}`);
  }
  return value;
}

function requireMpmArray(path) {
  const value = requireMpmConfig(path);
  if (!Array.isArray(value)) {
    throw new Error(`[MaxProfitManager] TradingConfig value must be an array: ${path}`);
  }
  return value;
}

function requireMpmObject(path) {
  const value = requireMpmConfig(path);
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[MaxProfitManager] TradingConfig value must be an object: ${path}`);
  }
  return value;
}

function buildBeScaleOutConfig() {
  const triggerType = requireMpmString('exitLogic.beScaleOut.triggerType');
  if (!['one_to_one_r', 'fixed_percent'].includes(triggerType)) {
    throw new Error(`[MaxProfitManager] exitLogic.beScaleOut.triggerType must be one_to_one_r or fixed_percent, got ${triggerType}`);
  }

  return {
    enabled: requireMpmBoolean('exitLogic.beScaleOut.enabled'),
    triggerType,
    fixedPercentTrigger: requireMpmNumberInRange('exitLogic.beScaleOut.fixedPercentTrigger', { greaterThan: 0 }) / 100,
    scaleOutFraction: requireMpmNumberInRange('exitLogic.beScaleOut.scaleOutFraction', { greaterThan: 0, max: 1 }),
    feeBufferPercent: requireMpmNumberInRange('exitLogic.beScaleOut.feeBufferPercent', { min: 0 }),
  };
}

/**
 * MaxProfitManager Class - Advanced Profit Optimization Engine
 * 
 * CRITICAL PROFIT COMPONENT: This class implements sophisticated profit-taking
 * strategies that can significantly increase overall trading profitability by
 * optimizing exit timing and partial position management.
 * 
 * SCALING BENEFIT: New team members can adjust profit-taking parameters
 * without understanding the complex calculations behind dynamic trailing
 * stops and tiered exit strategies.
 * 
 * CORE RESPONSIBILITIES:
 * 1. Tiered profit-taking at multiple price levels
 * 2. Dynamic trailing stops that adapt to market conditions
 * 3. Time-based exit optimizations
 * 4. Volatility-adjusted stop management
 * 5. Breakeven stop activation and management
 * 6. Profit analytics and performance tracking
 */
class MaxProfitManager {
  
  /**
   * Constructor - Initialize the Profit Optimization System
   * 
   * Sets up the comprehensive profit management framework with default settings
   * optimized for maximum profit extraction while maintaining risk control.
   * 
   * @param {Object} config - Disallowed legacy constructor overrides
   */
  constructor(config = {}) {
    if (config && Object.keys(config).length > 0) {
      throw new Error('[MaxProfitManager] Constructor tunable overrides are disabled; use TradingConfig profiles or TradingConfig.setOverrides so MPM cannot silently override config');
    }

    // ======================================================================
    // CORE PROFIT OPTIMIZATION CONFIGURATION
    // ======================================================================
    this.config = {
      // --------------------------------------------------------------------
      // TIERED EXIT STRATEGY
      // --------------------------------------------------------------------
      enableTieredExit: requireMpmBoolean('exitLogic.tieredExit.enabled'),
      // FIX 2026-03-17: Read from TradingConfig for backtester env var support
      // FIX 2026-04-16: Tier exit fractions extracted to exitLogic.tieredExit
      // FIX TIER-5-MPM-TIER-COLLAPSE: prior code mixed two patterns in same block.
      // Target fields used `|| 0.007` (silent zero collapse). Exit fraction fields
      // used `.get(key, default)` (correct). Unified.
      firstTierTarget: requireMpmNumber('exits.profitTiers.tier1'),
      firstTierExit: requireMpmNumber('exitLogic.tieredExit.tier1ExitFraction'),
      secondTierTarget: requireMpmNumber('exits.profitTiers.tier2'),
      secondTierExit: requireMpmNumber('exitLogic.tieredExit.tier2ExitFraction'),
      thirdTierTarget: requireMpmNumber('exits.profitTiers.tier3'),
      thirdTierExit: requireMpmNumber('exitLogic.tieredExit.tier3ExitFraction'),
      finalTarget: requireMpmNumber('exits.profitTiers.final'),
      
      // --------------------------------------------------------------------
      // TRAILING STOP MANAGEMENT
      // --------------------------------------------------------------------
      enableTrailingStop: requireMpmBoolean('exitLogic.trail.enabled'),
      initialStopLossPercent: requireMpmNumber('exits.stopLossPercent') / 100,  // CHANGE 629 -> 2026-02-28: From TradingConfig (percent -> decimal)
      // CHANGE 653: Realistic trailing stop thresholds for scalping
      minProfit: requireMpmNumber('exitLogic.trail.minActivationPercent') / 100,
      trailDistance: requireMpmNumber('exits.normalTrailDistance'),
      tightTrailThreshold: requireMpmNumber('exitLogic.trail.profitRatchetThreshold') / 100,
      tightTrailDistance: requireMpmNumber('exits.tightTrailDistance'),
      enableBreakevenStop: requireMpmBoolean('exitLogic.breakEvenStop.enabled'),
      breakevenThreshold: requireMpmNumber('exitLogic.breakEvenStop.triggerPercent') / 100,
      
      // --------------------------------------------------------------------
      // TIME-BASED OPTIMIZATIONS
      // --------------------------------------------------------------------
      enableTimeBasedAdjustments: requireMpmBoolean('holdTimes.enableTimeBasedAdjustments'),
      maxHoldTimeMinutes: requireMpmNumber('holdTimes.defaultMaxHold'),

      // Minimum hold time - can be 0 for aggressive scalping
      // Read from TradingConfig to allow flexibility in backtest/scalping modes
      minHoldTimeMinutes: requireMpmNumber('holdTimes.minHoldTimeMinutes'),

      timeAdjustmentIntervals: requireMpmArray('holdTimes.tighteningSchedule'),
      
      // --------------------------------------------------------------------
      // VOLATILITY ADAPTATIONS
      // --------------------------------------------------------------------
      enableVolatilityAdjustment: requireMpmBoolean('exitLogic.volatilityAdjustment.enabled'),
      lowVolatilityThreshold: requireMpmNumber('exitLogic.volatilityAdjustment.lowThresholdPercent') / 100,
      highVolatilityThreshold: requireMpmNumber('exitLogic.volatilityAdjustment.highThresholdPercent') / 100,
      volatilityLookbackPeriods: requireMpmNumber('exitLogic.volatilityAdjustment.lookbackPeriods'),
      
      // --------------------------------------------------------------------
      // MARKET CONDITION ADAPTATIONS
      // --------------------------------------------------------------------
      enableMarketAdaptation: requireMpmBoolean('exitLogic.tieredExit.enableMarketAdaptation'),
      // FIX 2026-04-16: Market multipliers extracted to exitLogic.tieredExit
      trendingMarketMultiplier: requireMpmNumber('exitLogic.tieredExit.trendingTargetMultiplier'),
      rangeboundMarketMultiplier: requireMpmNumber('exitLogic.tieredExit.rangingTargetMultiplier'),
      
      // --------------------------------------------------------------------
      // PERFORMANCE TRACKING
      // --------------------------------------------------------------------
      trackPerformance: requireMpmBoolean('exitLogic.maxProfitManager.trackPerformance'),
      logLevel: requireMpmString('exitLogic.maxProfitManager.logLevel'),
    };
    
    // ======================================================================
    // POSITION STATE MANAGEMENT
    // ======================================================================
    this.state = {
      // POSITION BASICS
      active: false,              // Whether actively managing a position
      entryPrice: 0,              // Position entry price
      direction: null,            // Position direction ('buy' or 'sell')
      originalSize: 0,            // Original position size
      remainingSize: 0,           // Remaining position size after partial exits
      entryOrderQuantity: null,   // Broker/base quantity accepted at entry
      remainingOrderQuantity: null, // Broker/base quantity still open
      quantityUnit: null,
      
      // PRICE TRACKING
      currentPrice: 0,            // Latest price update
      highestPrice: 0,            // Highest price reached (for longs)
      lowestPrice: Infinity,      // Lowest price reached (for shorts)
      
      // STOP MANAGEMENT
      currentStop: null,          // Current stop loss price
      initialStop: null,          // Original stop loss price
      trailingActive: false,      // Whether trailing stop is active
      breakevenActive: false,     // Whether breakeven stop is active
      
      // PROFIT TIERS
      tiers: [],                  // Array of profit tier definitions
      completedTiers: [],         // Array of completed tier exits
      
      // TIMING
      entryTime: 0,               // Position entry timestamp
      lastUpdateTime: 0,          // Last price update timestamp
      
      // PERFORMANCE METRICS
      unrealizedPnL: 0,           // Current unrealized profit/loss
      realizedPnL: 0,             // Realized profit from partial exits
      maxUnrealizedPnL: 0,        // Peak unrealized profit reached
      totalFeesEstimated: 0       // Estimated trading fees
    };
    
    // ======================================================================
    // PERFORMANCE ANALYTICS
    // ======================================================================
    this.analytics = {
      totalPositionsManaged: 0,
      totalProfitExtracted: 0,
      averageHoldTime: 0,
      tiersCompletedDistribution: {},
      trailingStopTriggered: 0,
      breakevenStopsTriggered: 0,
      averageProfitPerPosition: 0,
      bestPositionProfit: 0,
      worstPositionLoss: 0,
      volatilityAdjustments: 0,
      timeBasedExits: 0
    };
    
    console.log('[MaxProfitManager] initialized with advanced profit optimization');
    this.log('Configuration loaded with tiered exits and dynamic trailing', 'info');

    requireMpmObject('exitLogic.beScaleOut');
    this.beScaleOutConfig = buildBeScaleOutConfig();
    this.trailConfig = requireMpmObject('exitLogic.trail');
  }
  
  /**
   * Start Position Management - Initialize Profit Optimization
   * 
   * CRITICAL STARTUP: Begins profit management for a new position with
   * all optimization strategies activated based on market conditions.
   * 
   * @param {number} entryPrice - Position entry price
   * @param {string} direction - Position direction ('buy' or 'sell')
   * @param {number} size - Position size
   * @param {Object} options - Additional options
   * @param {number} options.volatility - Current market volatility
   * @param {string} options.marketCondition - Market condition ('trending', 'ranging', etc.)
   * @param {number} options.confidence - Trade confidence score
   * @param {Object} options.exitContract - Orchestrator exit contract selected for this trade
   * 
   * @returns {Object} - Initialization result with stop prices and targets
   */
  start(entryPrice, direction, size = 1.0, options = {}) {
    // ====================================================================
    // FIX 2026-02-24: Type validation (Phase 12 fuzzing - prevent NaN/crash)
    // ====================================================================
    if (typeof entryPrice !== 'number' || isNaN(entryPrice) || !isFinite(entryPrice) || entryPrice <= 0) {
      this.log('Invalid entry price provided (must be positive number)', 'error');
      return { success: false, error: 'Invalid entry price' };
    }
    if (typeof direction !== 'string') {
      this.log('Invalid direction provided (must be string)', 'error');
      return { success: false, error: 'Invalid direction' };
    }
    if (typeof size !== 'number' || isNaN(size) || size <= 0) {
      size = 1.0; // Default to 1.0 if invalid
    }

    // ====================================================================
    // CHANGE 614: Fix case-sensitivity bug - normalize direction
    // ====================================================================
    direction = direction.trim().toLowerCase();
    if (direction === 'long') direction = 'buy';
    if (direction === 'short' || direction === 'sell_short') direction = 'sell';

    // ====================================================================
    // INPUT VALIDATION
    // ====================================================================
    if (!['buy', 'sell'].includes(direction)) {
      this.log('Invalid direction provided', 'error');
      return { success: false, error: 'Invalid direction' };
    }

    const initialStopPercent = this.resolveInitialStopPercent(options);
    const entryOrderQuantity = this.resolveEntryOrderQuantity(entryPrice, size, options);

    // ====================================================================
    // STATE INITIALIZATION
    // ====================================================================
    this.state = {
      active: true,
      entryPrice: entryPrice,
      direction: direction,
      originalSize: size,
      remainingSize: size,
      entryOrderQuantity,
      remainingOrderQuantity: entryOrderQuantity,
      quantityUnit: options.quantityUnit || options.entryOrderQuantityUnit || null,
      currentPrice: entryPrice,
      highestPrice: direction === 'buy' ? entryPrice : 0,
      lowestPrice: direction === 'sell' ? entryPrice : Infinity,
      currentStop: null,
      initialStop: null,
      trailingActive: false,
      breakevenActive: false,
      tiers: [],
      completedTiers: [],
      entryTime: Date.now(),
      lastUpdateTime: Date.now(),
      unrealizedPnL: 0,
      realizedPnL: 0,
      maxUnrealizedPnL: 0,
      totalFeesEstimated: 0,
      // ═══ PATCH 1: Add state fields for consolidated exit logic ═══
      maxProfitPercent: 0,
      initialStopPercent,
      beScaleOutFired: false,
      // Narrator correlation: optional tradeId stashed from caller options.
      // Used only for narrator output; does not affect any trading logic.
      tradeId: options.tradeId || null
    };

    // ====================================================================
    // MARKET CONDITION ANALYSIS
    // ====================================================================
    const marketCondition = options.marketCondition || 'normal';
    // CRIT-02-followup-B: refuse phantom 2% volatility default. OrderExecutor
    // at :343, :490 passes `volatility: indicators.volatility ?? null` —
    // intentionally preserving null during indicator warmup. The previous
    // `|| 0.02` masked null as 2%, mis-calibrating stopFactor/trailFactor in
    // calculateVolatilityAdjustment (compares against config thresholds).
    // Pre-money fail-loud: throw if caller didn't actually have volatility yet.
    const volatility = options.volatility;
    if (!Number.isFinite(volatility) || volatility <= 0) {
      throw new Error(`MaxProfitManager.start: options.volatility missing/invalid (got ${volatility}) — refusing to default to phantom 2% (would mis-calibrate stop/target adjustment factors)`);
    }
    // CRIT-02-followup-A: refuse phantom 50% confidence default. Previously
    // `options.confidence || 0.5` silently masked missing/zero confidence as
    // neutral 50%, mis-calibrating profit tiers via setupProfitTiers below.
    // Caller (OrderExecutor at :342, :489) ALWAYS passes
    // `decision.confidence / 100` after CRIT-02's entry-confidence guard
    // upstream, so a missing value here signals a caller-contract bug.
    const confidence = options.confidence;
    if (!Number.isFinite(confidence) || confidence <= 0) {
      throw new Error(`MaxProfitManager.start: options.confidence missing/invalid (got ${confidence}) — refusing to default to phantom 50% (would silently mis-calibrate profit tiers)`);
    }
    
    // Calculate volatility adjustment factors
    const volatilityAdjustment = this.calculateVolatilityAdjustment(volatility);
    
    // ====================================================================
    // INITIAL STOP LOSS SETUP
    // ====================================================================
    const stopDistance = initialStopPercent * volatilityAdjustment.stopFactor;
    
    if (direction === 'buy') {
      this.state.currentStop = entryPrice * (1 - stopDistance);
      this.state.initialStop = this.state.currentStop;
    } else {
      this.state.currentStop = entryPrice * (1 + stopDistance);
      this.state.initialStop = this.state.currentStop;
    }
    
    // ====================================================================
    // PROFIT TIER SETUP
    // ====================================================================
    if (this.config.enableTieredExit) {
      this.setupProfitTiers(volatilityAdjustment, marketCondition, confidence);
    }
    
    // ====================================================================
    // ANALYTICS UPDATE
    // ====================================================================
    this.analytics.totalPositionsManaged++;
    if (volatilityAdjustment.adjusted) {
      this.analytics.volatilityAdjustments++;
    }
    
    // ====================================================================
    // LOGGING AND REPORTING
    // ====================================================================
    this.log(`Position management started: ${direction.toUpperCase()} at ${entryPrice}`, 'info');
    this.log(`Initial stop: ${this.state.currentStop.toFixed(2)} (${(stopDistance * 100).toFixed(2)}%)`, 'info');
    this.log(`Profit tiers: ${this.state.tiers.length} configured`, 'info');
    
    return {
      success: true,
      entryPrice: entryPrice,
      direction: direction,
      initialStop: this.state.currentStop,
      profitTiers: this.state.tiers.map(tier => ({
        target: tier.targetPrice,
        percentage: tier.exitPercentage * 100
      })),
      volatilityAdjustment: volatilityAdjustment
    };
  }

  resolveInitialStopPercent(options = {}) {
    if (!Object.prototype.hasOwnProperty.call(options, 'exitContract') || options.exitContract == null) {
      return this.config.initialStopLossPercent;
    }

    return MaxProfitManager.resolveContractStopPercent(options.exitContract);
  }

  resolveEntryOrderQuantity(entryPrice, size, options = {}) {
    const explicit = this._positiveFiniteNumber(
      options.entryOrderQuantity
        ?? options.orderQuantity
        ?? options.quantity
        ?? options.positionQuantity
    );
    if (explicit !== null) {
      return explicit;
    }

    const derived = Number(size) / Number(entryPrice);
    if (Number.isFinite(derived) && derived > 0) {
      return derived;
    }

    throw new Error(`MaxProfitManager.start: entry order quantity missing/invalid (got ${options.entryOrderQuantity ?? options.orderQuantity ?? options.quantity ?? options.positionQuantity}) — fee-aware stops require broker quantity`);
  }

  static resolveContractStopPercent(exitContract) {
    if (typeof exitContract !== 'object') {
      throw new Error(`MaxProfitManager.start: options.exitContract invalid (got ${typeof exitContract}) — refusing to use global stop for a malformed trade contract`);
    }
    assertExplicitExitOwnership(exitContract, 'MaxProfitManager.start');

    const rawStopLossPercent = Number(exitContract.stopLossPercent);
    if (!Number.isFinite(rawStopLossPercent) || rawStopLossPercent === 0) {
      throw new Error(`MaxProfitManager.start: exitContract.stopLossPercent missing/invalid (got ${exitContract.stopLossPercent}) — refusing to use global stop for a contracted trade`);
    }
    if (rawStopLossPercent > 0) {
      throw new Error(`MaxProfitManager.start: exitContract.stopLossPercent must be negative risk distance (got ${exitContract.stopLossPercent})`);
    }

    const stopPercent = -rawStopLossPercent / 100;
    if (!Number.isFinite(stopPercent) || stopPercent <= 0 || stopPercent >= 1) {
      throw new Error(`MaxProfitManager.start: exitContract.stopLossPercent out of range (got ${exitContract.stopLossPercent})`);
    }

    return stopPercent;
  }
  
  /**
   * Update Position - Process New Price Information
   * 
   * CORE OPTIMIZATION ENGINE: Processes each price update to determine
   * if any profit-taking actions should be executed, trailing stops
   * should be adjusted, or position management should be modified.
   * 
   * @param {number} currentPrice - Current market price
   * @param {Object} options - Additional market data
   * @param {number} options.volatility - Current volatility
   * @param {number} options.volume - Current volume
   * 
   * @returns {Object} - Update result with any actions to take
   */
  update(currentPrice, options = {}) {
    // ====================================================================
    // VALIDATION AND SETUP
    // ====================================================================
    // FIX 2026-02-24: Type validation (Phase 12 fuzzing - prevent NaN)
    if (typeof currentPrice !== 'number' || isNaN(currentPrice) || !isFinite(currentPrice)) {
      return { action: 'none', reason: 'Invalid price type' };
    }
    if (!this.state.active || currentPrice <= 0) {
      return { action: 'none', reason: 'Invalid state or price' };
    }
    
    // Update state with new price information
    this.state.currentPrice = currentPrice;
    this.state.lastUpdateTime = Date.now();

    // ====================================================================
    // MINIMUM HOLD TIME GUARD
    // Prevents instant same-candle exits after entry
    // ====================================================================
    const holdTimeMinutes = (Date.now() - this.state.entryTime) / (1000 * 60);
    if (this.config.minHoldTimeMinutes && holdTimeMinutes < this.config.minHoldTimeMinutes) {
      return {
        action: 'hold',
        reason: `min_hold_not_reached_${holdTimeMinutes.toFixed(3)}m`,
        profitPercent: this.calculateProfitPercent(currentPrice),
        unrealizedPnL: this.state.unrealizedPnL,
        holdTimeMinutes
      };
    }
    
    // Track price extremes for trailing stop calculations
    if (this.state.direction === 'buy') {
      if (currentPrice > this.state.highestPrice) {
        this.state.highestPrice = currentPrice;
      }
    } else {
      if (currentPrice < this.state.lowestPrice) {
        this.state.lowestPrice = currentPrice;
      }
    }
    
    // ====================================================================
    // PROFIT/LOSS CALCULATION
    // ====================================================================
    const profitPercent = this.calculateProfitPercent(currentPrice);
    this.state.unrealizedPnL = profitPercent * this.state.originalSize;
    
    // Track maximum profit reached
    if (this.state.unrealizedPnL > this.state.maxUnrealizedPnL) {
      this.state.maxUnrealizedPnL = this.state.unrealizedPnL;
    }
    if (profitPercent > this.state.maxProfitPercent) {
      this.state.maxProfitPercent = profitPercent;
    }

    // ====================================================================
    // PATCH 1: BREAK-EVEN SCALE-OUT CHECK
    // ====================================================================
    if (this.beScaleOutConfig.enabled && !this.state.beScaleOutFired) {
      const trigger = this.beScaleOutConfig.triggerType === 'one_to_one_r'
        ? (this.state.initialStopPercent || this.config.initialStopLossPercent)
        : this.beScaleOutConfig.fixedPercentTrigger;

      if (profitPercent >= trigger) {
        this.state.beScaleOutFired = true;
        const scaleOutFraction = this.beScaleOutConfig.scaleOutFraction;
        const scaleOutSize = this.state.remainingSize * scaleOutFraction;
        const scaleOutQuantity = this.state.remainingOrderQuantity !== null
          ? this.state.remainingOrderQuantity * scaleOutFraction
          : null;
        this.state.remainingSize -= scaleOutSize;
        if (scaleOutQuantity !== null) {
          this.state.remainingOrderQuantity -= scaleOutQuantity;
        }
        this.rebalanceOpenTierExitSizes();
        this.state.realizedPnL += scaleOutSize * profitPercent;

        this.log(`BE Scale-Out: Sold ${(scaleOutFraction * 100).toFixed(0)}% at ${(profitPercent * 100).toFixed(2)}% profit`, 'info');

        return {
          action: 'exit_partial',
          price: currentPrice,
          exitSize: scaleOutSize,
          exitOrderQuantity: scaleOutQuantity,
          exitFraction: scaleOutFraction,
          remainingSize: this.state.remainingSize,
          remainingOrderQuantity: this.state.remainingOrderQuantity,
          reason: 'be_scaleout',
          profitPercent: profitPercent,
          newStopPrice: this.state.currentStop,
          stopMoved: false
        };
      }
    }

    // ====================================================================
    // STOP LOSS CHECK (HIGHEST PRIORITY)
    // ====================================================================
    if (this.shouldExitPosition(currentPrice, profitPercent)) {
      const reason = this.state.trailingActive ? 'trailing_stop' : this.state.breakevenActive ? 'break_even' : 'stop_loss';
      this.log(`Position exit triggered: ${reason} at ${currentPrice}`, 'info');
      
      // Update analytics
      if (reason === 'trailing_stop') {
        this.analytics.trailingStopTriggered++;
      }
      
      return {
        action: 'exit_full',
        price: currentPrice,
        reason: reason,
        profitPercent: profitPercent,
        unrealizedPnL: this.state.unrealizedPnL,
        holdTime: Date.now() - this.state.entryTime
      };
    }
    
    // ====================================================================
    // PROFIT TIER CHECK
    // ====================================================================
    const tierExit = this.checkProfitTiers(currentPrice, profitPercent);
    if (tierExit.shouldExit) {
      this.log(`Profit tier ${tierExit.tier} triggered at ${currentPrice} (${(profitPercent * 100).toFixed(2)}%)`, 'info');

      // Compute fraction before mutating remainingSize
      const exitFraction = this.state.remainingSize > 0 ? tierExit.exitSize / this.state.remainingSize : 0;
      // Capture pre-exit remaining size for narrator P&L math
      const _preExitRemaining = this.state.remainingSize;
      // Execute partial exit (mutates remainingSize)
      this.executePartialExit(tierExit);

      // Narrator: tier-exit event. Position sizes are USD notional, so P&L is size times return.
      // Uses module-cached singleton. Disabled path: property-access +
      // branch-taken, zero allocation. Try frame only entered when
      // enabled so a formatter throw can't break the post-partial-exit
      // return — state was already mutated by executePartialExit() above,
      // so we MUST return the exit receipt regardless of narrator outcome.
      if (narrator.enabled) {
        try {
          const partialPnl = (tierExit.exitSize || 0) * (profitPercent || 0);
          narrator.tierExit({
            tradeId: this.state.tradeId,
            tier: tierExit.tier,
            exitPrice: currentPrice,
            exitSize: tierExit.exitSize,
            remainingSize: this.state.remainingSize,
            profitPercent,
            partialPnl,
          });
        } catch (e) {
          console.warn('[Narrator] tierExit hook failed:', e && e.message);
        }
      }

      return {
        action: 'exit_partial',
        price: currentPrice,
        exitSize: tierExit.exitSize,
        exitFraction: exitFraction,
        remainingSize: this.state.remainingSize,
        reason: `profit_tier_${tierExit.tier}`,
        profitPercent: profitPercent,
        tier: tierExit.tier
      };
    }
    
    // ====================================================================
    // TRAILING STOP MANAGEMENT
    // ====================================================================
    const trailingUpdate = this.updateTrailingStop(currentPrice, profitPercent, options.volatility, {
      ...options,
      price: currentPrice
    });
    if (trailingUpdate.updated) {
      this.log(`Trailing stop updated to ${this.state.currentStop.toFixed(2)}`, 'debug');
    } else if (trailingUpdate.reason === 'missing_atr') {
      console.warn('[MaxProfitManager] Trailing stop skipped: ATR missing/non-positive; preserving existing stop');
    }
    
    // ====================================================================
    // BREAKEVEN STOP ACTIVATION
    // ====================================================================
    this.updateBreakevenStop(profitPercent);
    
    // ====================================================================
    // TIME-BASED ADJUSTMENTS
    // ====================================================================
    const timeAdjustment = this.applyTimeBasedAdjustments();
    if (timeAdjustment.exitRecommended) {
      this.log(`Time-based exit recommended after ${timeAdjustment.holdTimeMinutes} minutes`, 'info');
      this.analytics.timeBasedExits++;
      
      return {
        action: 'exit_full',
        price: currentPrice,
        reason: 'time_based_exit',
        profitPercent: profitPercent,
        holdTime: Date.now() - this.state.entryTime
      };
    }
    
    // ====================================================================
    // STANDARD UPDATE RESPONSE
    // ====================================================================
    return {
      action: 'update',
      state: this.getPositionState(),
      profitPercent: profitPercent,
      unrealizedPnL: this.state.unrealizedPnL,
      trailingStop: this.state.currentStop,
      nextTier: this.getNextProfitTier()
    };
  }
  
  /**
   * Calculate Profit Percentage - Profit Calculation
   * 
   * @param {number} currentPrice - Current market price
   * @returns {number} - Profit percentage (positive for profit, negative for loss)
   */
  calculateProfitPercent(currentPrice) {
    if (this.state.direction === 'buy') {
      return (currentPrice - this.state.entryPrice) / this.state.entryPrice;
    } else {
      return (this.state.entryPrice - currentPrice) / this.state.entryPrice;
    }
  }
  
  /**
   * Setup Profit Tiers - Initialize Profit Taking Levels
   * 
   * TIER STRATEGY: Creates multiple profit-taking levels that allow
   * the position to capture profits at different stages while leaving
   * room for larger moves.
   * 
   * @param {Object} volatilityAdjustment - Volatility-based adjustments
   * @param {string} marketCondition - Market condition
   * @param {number} confidence - Trade confidence score
   */
  setupProfitTiers(volatilityAdjustment, marketCondition = 'normal', confidence = 0.5) {
    this.state.tiers = [];
    
    // Base tier configuration
    const baseTiers = [
      { target: this.config.firstTierTarget, exit: this.config.firstTierExit },
      { target: this.config.secondTierTarget, exit: this.config.secondTierExit },
      { target: this.config.thirdTierTarget, exit: this.config.thirdTierExit },
      { target: this.config.finalTarget, exit: 1.0 - (this.config.firstTierExit + this.config.secondTierExit + this.config.thirdTierExit) }
    ];
    
    // Adjust targets based on market conditions
    let marketMultiplier = 1.0;
    if (marketCondition === 'trending' && this.config.enableMarketAdaptation) {
      marketMultiplier = this.config.trendingMarketMultiplier;
    } else if (marketCondition === 'ranging' && this.config.enableMarketAdaptation) {
      marketMultiplier = this.config.rangeboundMarketMultiplier;
    }
    
    // Adjust targets based on confidence
    // FIX 2026-04-16: Thresholds + multipliers extracted to exitLogic.tieredExit
    const highConfThreshold = TradingConfig.get('exitLogic.tieredExit.highConfidenceThreshold', 0.8);
    const highConfMult = TradingConfig.get('exitLogic.tieredExit.highConfidenceMultiplier', 1.2);
    const lowConfThreshold = TradingConfig.get('exitLogic.tieredExit.lowConfidenceThreshold', 0.6);
    const lowConfMult = TradingConfig.get('exitLogic.tieredExit.lowConfidenceMultiplier', 0.8);
    let confidenceMultiplier = 1.0;
    if (confidence > highConfThreshold) {
      confidenceMultiplier = highConfMult;
    } else if (confidence < lowConfThreshold) {
      confidenceMultiplier = lowConfMult;
    }
    
    // Create tier definitions
    baseTiers.forEach((tier, index) => {
      const adjustedTarget = tier.target * volatilityAdjustment.targetFactor * marketMultiplier * confidenceMultiplier;
      
      let targetPrice;
      if (this.state.direction === 'buy') {
        targetPrice = this.state.entryPrice * (1 + adjustedTarget);
      } else {
        targetPrice = this.state.entryPrice * (1 - adjustedTarget);
      }
      
      this.state.tiers.push({
        tier: index + 1,
        targetPercent: adjustedTarget,
        targetPrice: targetPrice,
        exitPercentage: tier.exit,
        exitSize: this.state.originalSize * tier.exit,
        completed: false
      });
    });
    this.rebalanceOpenTierExitSizes();
    
    this.log(`Setup ${this.state.tiers.length} profit tiers with market multiplier ${marketMultiplier.toFixed(2)}`, 'debug');
  }

  /**
   * Rebalance open tier exit sizes against the current remaining position.
   *
   * Tier fractions are configured as relative tier weights. Once any earlier
   * scale-out reduces the position, the still-open tiers must be resized to the
   * live runner instead of continuing to spend stale original notional.
   */
  rebalanceOpenTierExitSizes() {
    if (!Array.isArray(this.state.tiers) || this.state.tiers.length === 0) {
      return;
    }

    const openTiers = this.state.tiers.filter(tier => !tier.completed);
    if (openTiers.length === 0) {
      return;
    }

    const remainingSize = Number.isFinite(this.state.remainingSize) ? this.state.remainingSize : NaN;
    if (!Number.isFinite(remainingSize) || remainingSize < 0) {
      throw new Error(`MaxProfitManager.rebalanceOpenTierExitSizes: invalid remainingSize ${this.state.remainingSize}`);
    }

    if (remainingSize === 0) {
      openTiers.forEach(tier => {
        tier.exitSize = 0;
      });
      return;
    }

    const totalOpenWeight = openTiers.reduce((sum, tier) => {
      if (!Number.isFinite(tier.exitPercentage) || tier.exitPercentage < 0) {
        throw new Error(`MaxProfitManager.rebalanceOpenTierExitSizes: invalid tier ${tier.tier} exitPercentage ${tier.exitPercentage}`);
      }
      return sum + tier.exitPercentage;
    }, 0);

    if (totalOpenWeight <= 0) {
      throw new Error('MaxProfitManager.rebalanceOpenTierExitSizes: open tier exit weights must sum above zero');
    }

    let allocated = 0;
    openTiers.forEach((tier, index) => {
      if (index === openTiers.length - 1) {
        tier.exitSize = remainingSize - allocated;
      } else {
        tier.exitSize = remainingSize * (tier.exitPercentage / totalOpenWeight);
        allocated += tier.exitSize;
      }
    });
  }
  
  /**
   * Check Profit Tiers - Evaluate Tier Trigger Conditions
   * 
   * TIER EXECUTION: Checks if current price has reached any profit tier
   * targets and determines if partial exits should be executed.
   * 
   * @param {number} currentPrice - Current market price
   * @param {number} profitPercent - Current profit percentage
   * @returns {Object} - Tier exit recommendation
   */
  checkProfitTiers(currentPrice, profitPercent) {
    for (let tier of this.state.tiers) {
      if (tier.completed) continue;
      
      let targetReached = false;
      
      if (this.state.direction === 'buy') {
        targetReached = currentPrice >= tier.targetPrice;
      } else {
        targetReached = currentPrice <= tier.targetPrice;
      }
      
      if (targetReached) {
        return {
          shouldExit: true,
          tier: tier.tier,
          targetPrice: tier.targetPrice,
          exitSize: tier.exitSize,
          exitPercentage: tier.exitPercentage,
          profitPercent: tier.targetPercent
        };
      }
    }
    
    return { shouldExit: false };
  }
  
  /**
   * Execute Partial Exit - Process Tier Exit
   * 
   * POSITION MANAGEMENT: Executes a partial exit and updates position
   * state to reflect the reduced position size.
   * 
   * @param {Object} tierExit - Tier exit details
   */
  executePartialExit(tierExit) {
    const exitSize = Number.isFinite(tierExit.exitSize) ? tierExit.exitSize : NaN;
    if (!Number.isFinite(exitSize) || exitSize <= 0) {
      throw new Error(`MaxProfitManager.executePartialExit: tier ${tierExit.tier} has invalid exitSize ${tierExit.exitSize}`);
    }
    if (exitSize - this.state.remainingSize > 1e-9) {
      throw new Error(`MaxProfitManager.executePartialExit: tier ${tierExit.tier} over-allocated position by ${exitSize - this.state.remainingSize}`);
    }

    // Mark tier as completed
    const tier = this.state.tiers.find(t => t.tier === tierExit.tier);
    if (tier) {
      tier.completed = true;
      this.state.completedTiers.push({
        tier: tierExit.tier,
        executionTime: Date.now(),
        price: this.state.currentPrice,
        size: exitSize,
        profitPercent: tierExit.profitPercent
      });
    }
    
    // Update position size
    this.state.remainingSize -= exitSize;
    if (this.state.remainingSize < 0 && Math.abs(this.state.remainingSize) < 1e-9) {
      this.state.remainingSize = 0;
    }
    this.rebalanceOpenTierExitSizes();
    
    // Calculate realized P&L from this exit
    const realizedProfit = exitSize * tierExit.profitPercent;
    this.state.realizedPnL += realizedProfit;
    
    // Update analytics
    if (!this.analytics.tiersCompletedDistribution[tierExit.tier]) {
      this.analytics.tiersCompletedDistribution[tierExit.tier] = 0;
    }
    this.analytics.tiersCompletedDistribution[tierExit.tier]++;
    
    this.log(`Executed tier ${tierExit.tier} exit: ${tierExit.exitSize.toFixed(4)} units at ${this.state.currentPrice.toFixed(2)}`, 'info');
  }
  
  /**
   * Update Trailing Stop - Dynamic Stop Management (PATCH 1: ATR-based)
   *
   * TRAILING OPTIMIZATION: Adjusts trailing stop based on ATR, RSI,
   * profit levels, and trend conditions.
   *
   * @param {number} currentPrice - Current market price
   * @param {number} profitPercent - Current profit percentage
   * @param {number} volatility - Current market volatility
   * @param {Object} context - Additional context (atr, rsi, candle, etc.)
   * @returns {Object} - Update result
   */
  updateTrailingStop(currentPrice, profitPercent, volatility = null, context = {}) {
    const trailEnabled = this.trailConfig.enabled ?? this.config.enableTrailingStop;
    if (!trailEnabled) {
      return { updated: false, reason: 'trailing_disabled' };
    }

    const currentPriceValue = this._positiveFiniteNumber(currentPrice);
    if (currentPriceValue === null) {
      return { updated: false, reason: 'invalid_price' };
    }

    const profitPercentFraction = this._finiteNumber(profitPercent);
    if (profitPercentFraction === null) {
      return { updated: false, reason: 'invalid_profit' };
    }

    if (this.state.direction !== 'buy' && this.state.direction !== 'sell') {
      return { updated: false, reason: 'invalid_direction' };
    }

    const profitPercentValue = profitPercentFraction * 100;
    const minActivation = this._finiteConfigNumber(
      this.trailConfig.minActivationPercent,
      (this.config.minProfit || 0.003) * 100
    );
    if (profitPercentValue < minActivation) {
      return { updated: false, reason: 'insufficient_profit' };
    }

    // Dynamic trail distance based on ATR if available.
    let trailDistance;
    const atr = this._positiveFiniteNumber(context.atr) || this._positiveFiniteNumber(volatility);
    const atrMultiplier = this._finiteConfigNumber(this.trailConfig.atrMultiplier, 1);
    const minTrailPercent = this._finiteConfigNumber(this.trailConfig.minTrailPercent, 0.3);
    const maxTrailPercent = this._finiteConfigNumber(this.trailConfig.maxTrailPercent, 3.0);
    if (atr === null || atrMultiplier <= 0) {
      return { updated: false, reason: 'missing_atr' };
    }
    trailDistance = (atr / currentPriceValue) * atrMultiplier;

    // Trend widening: use the config field TradingConfig exposes, not the
    // stale trendWidening name.
    const trendWidenMultiplier = this._finiteConfigNumber(this.trailConfig.trendWidenMultiplier, 1);
    const rsi = this._finiteNumber(context.rsi);
    const trend = String(context.trend || '').toLowerCase();
    const isBullTrend = trend === 'bullish' || trend === 'uptrend' || trend === 'trending_up' || trend === 'up';
    const isBearTrend = trend === 'bearish' || trend === 'downtrend' || trend === 'trending_down' || trend === 'down';
    const trendSupportsTrade = (this.state.direction === 'buy' && isBullTrend) ||
      (this.state.direction === 'sell' && isBearTrend);
    if (trendSupportsTrade && rsi !== null && trendWidenMultiplier > 1) {
      const trendStrength = this.state.direction === 'buy'
        ? Math.max(0, (rsi - 50) / 50)
        : Math.max(0, (50 - rsi) / 50);
      trailDistance *= 1 + ((trendWidenMultiplier - 1) * trendStrength);
    }

    // Profit ratchet.
    const ratchetThreshold = this._finiteConfigNumber(this.trailConfig.profitRatchetThreshold, 3.0);
    const ratchetRate = this._finiteConfigNumber(this.trailConfig.profitRatchetRate, 0.1);
    const ratchetFloor = this._finiteConfigNumber(this.trailConfig.profitRatchetFloor, 0.6);
    if (profitPercentValue > ratchetThreshold && ratchetRate > 0) {
      const ratchetFactor = Math.max(ratchetFloor, 1 - ((profitPercentValue - ratchetThreshold) * ratchetRate));
      trailDistance *= ratchetFactor;
    }

    // Structure proximity: nearestStructure is source-agnostic. Fibonacci,
    // support/resistance, or another detector can provide the same contract:
    // { type, price, distance } where distance is percent from current price.
    const nearestStructure = context.nearestStructure;
    const structurePrice = this._positiveFiniteNumber(nearestStructure?.price);
    const suppliedStructureDistance = this._finiteNumber(nearestStructure?.distance);
    const structureDistance = structurePrice !== null
      ? Math.abs(currentPriceValue - structurePrice) / currentPriceValue * 100
      : suppliedStructureDistance;
    const structureThreshold = this._finiteConfigNumber(this.trailConfig.structureDistanceThreshold, 1.0);
    const structureTightenMultiplier = this._finiteConfigNumber(this.trailConfig.structureTightenMultiplier, 0.5);
    if (structureDistance !== null && structureDistance >= 0 && structureThreshold > 0 && structureDistance < structureThreshold) {
      const distanceRatio = Math.max(0, Math.min(structureDistance / structureThreshold, 1));
      const tightenFactor = structureTightenMultiplier +
        ((1 - structureTightenMultiplier) * distanceRatio);
      trailDistance *= Math.max(0, tightenFactor);
    }

    if (!Number.isFinite(trailDistance) || trailDistance <= 0) {
      return { updated: false, reason: 'invalid_trail_distance' };
    }

    const minTrail = Math.max(0, minTrailPercent) / 100;
    const maxTrail = Math.max(minTrail, maxTrailPercent / 100);
    trailDistance = Math.max(minTrail, Math.min(maxTrail, trailDistance));

    // Calculate new stop
    let newStop;
    if (this.state.direction === 'buy') {
      newStop = this.state.highestPrice * (1 - trailDistance);
    } else {
      newStop = this.state.lowestPrice * (1 + trailDistance);
    }
    if (!Number.isFinite(newStop) || newStop <= 0) {
      return { updated: false, reason: 'invalid_trailing_stop' };
    }

    // Only update if better
    let shouldUpdate = false;
    const currentStop = this._finiteNumber(this.state.currentStop);
    if (currentStop === null) {
      shouldUpdate = true;
    } else if (this.state.direction === 'buy') {
      shouldUpdate = newStop > currentStop;
    } else {
      shouldUpdate = newStop < currentStop;
    }

    if (shouldUpdate) {
      const oldStop = this.state.currentStop;
      this.state.currentStop = newStop;
      if (!this.state.trailingActive) {
        this.state.trailingActive = true;
        this.log('Trailing stop activated', 'info');
      }
      const oldStopLabel = currentStop === null ? 'none' : currentStop.toFixed(2);
      this.log(`Trail: ${oldStopLabel} -> ${newStop.toFixed(2)} (${(trailDistance * 100).toFixed(2)}%)`, 'debug');
      return { updated: true, oldStop, newStop, trailDistance };
    }

    return { updated: false, reason: 'no_improvement' };
  }

  _finiteConfigNumber(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  _finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  _positiveFiniteNumber(value) {
    const parsed = this._finiteNumber(value);
    return parsed !== null && parsed > 0 ? parsed : null;
  }

  roundTripFeeBufferPercent() {
    return FeeModel.fromTradingConfig().calculateRoundTripFeePercent({
      entryNotionalUsd: this.state.remainingSize,
      exitNotionalUsd: this.state.remainingSize,
      entryQuantity: this.state.remainingOrderQuantity,
      exitQuantity: this.state.remainingOrderQuantity,
    });
  }
  
  /**
   * Update Breakeven Stop - Breakeven Protection
   * 
   * CAPITAL PROTECTION: Moves stop to breakeven once position becomes
   * sufficiently profitable to lock in at least a neutral outcome.
   * 
   * @param {number} profitPercent - Current profit percentage
   */
  updateBreakevenStop(profitPercent) {
    if (!this.config.enableBreakevenStop) {
      return;
    }
    if (this.state.breakevenActive || profitPercent < this.config.breakevenThreshold) {
      return;
    }
    
    const feeBuffer = this.roundTripFeeBufferPercent() / 100;
    let breakevenStop;
    
    if (this.state.direction === 'buy') {
      breakevenStop = this.state.entryPrice * (1 + feeBuffer);
      if (!(breakevenStop < this.state.currentPrice)) {
        return;
      }
    } else {
      breakevenStop = this.state.entryPrice * (1 - feeBuffer);
      if (!(breakevenStop > this.state.currentPrice)) {
        return;
      }
    }
    
    // Only update if breakeven stop is better than current stop
    let shouldUpdate = false;
    if (this.state.direction === 'buy') {
      shouldUpdate = breakevenStop > this.state.currentStop;
    } else {
      shouldUpdate = breakevenStop < this.state.currentStop;
    }
    
    if (shouldUpdate) {
      this.state.currentStop = breakevenStop;
      this.state.breakevenActive = true;
      this.analytics.breakevenStopsTriggered++;
      
      this.log(`Breakeven stop activated at ${breakevenStop.toFixed(2)}`, 'info');
    }
  }
  
  /**
   * Apply Time-Based Adjustments - Time Optimization
   * 
   * TIME STRATEGY: Applies time-based exit logic and stop adjustments
   * based on how long the position has been held.
   * 
   * @returns {Object} - Time-based recommendations
   */
  applyTimeBasedAdjustments() {
    if (!this.config.enableTimeBasedAdjustments) {
      return { exitRecommended: false };
    }
    
    const holdTimeMinutes = (Date.now() - this.state.entryTime) / (1000 * 60);
    
    // Check for maximum hold time
    if (holdTimeMinutes >= this.config.maxHoldTimeMinutes) {
      return {
        exitRecommended: true,
        reason: 'max_hold_time',
        holdTimeMinutes: holdTimeMinutes
      };
    }
    
    // Apply time-based trail adjustments
    for (let interval of this.config.timeAdjustmentIntervals) {
      if (holdTimeMinutes >= interval.minutes) {
        // This could tighten trailing stops over time
        // Implementation depends on specific strategy
      }
    }
    
    return {
      exitRecommended: false,
      holdTimeMinutes: holdTimeMinutes
    };
  }
  
  /**
   * Calculate Volatility Adjustment - Volatility Adaptation
   * 
   * VOLATILITY SCALING: Calculates adjustment factors for stops and targets
   * based on current market volatility conditions.
   * 
   * @param {number} volatility - Current market volatility
   * @returns {Object} - Volatility adjustment factors
   */
  calculateVolatilityAdjustment(volatility) {
    if (!this.config.enableVolatilityAdjustment) {
      return {
        stopFactor: 1.0,
        trailFactor: 1.0,
        targetFactor: 1.0,
        adjusted: false
      };
    }
    
    let stopFactor = 1.0;
    let trailFactor = 1.0;
    let targetFactor = 1.0;
    let adjusted = false;
    
    if (volatility <= this.config.lowVolatilityThreshold) {
      // Low volatility: tighter stops and targets
      stopFactor = 0.7;   // 30% tighter stops
      trailFactor = 0.7;  // 30% tighter trailing
      targetFactor = 0.8; // 20% lower targets
      adjusted = true;
    } else if (volatility >= this.config.highVolatilityThreshold) {
      // High volatility: wider stops and targets
      stopFactor = 1.5;   // 50% wider stops
      trailFactor = 1.3;  // 30% wider trailing
      targetFactor = 1.4; // 40% higher targets
      adjusted = true;
    }
    
    return {
      stopFactor,
      trailFactor,
      targetFactor,
      adjusted,
      volatilityLevel: volatility <= this.config.lowVolatilityThreshold ? 'low' :
                      volatility >= this.config.highVolatilityThreshold ? 'high' : 'normal'
    };
  }
  
  /**
   * Should Exit Position - Exit Decision Logic
   * 
   * EXIT EVALUATION: Determines if position should be completely closed
   * based on stop loss conditions.
   * 
   * @param {number} currentPrice - Current market price
   * @param {number} profitPercent - Current profit percentage
   * @returns {boolean} - Whether to exit position
   */
  shouldExitPosition(currentPrice, profitPercent) {
    if (!this.state.currentStop) return false;
    if (!this.state.trailingActive && !this.state.breakevenActive) return false;
    
    if (this.state.direction === 'buy') {
      return currentPrice <= this.state.currentStop;
    } else {
      return currentPrice >= this.state.currentStop;
    }
  }
  
  /**
   * Get Next Profit Tier - Tier Information
   * 
   * @returns {Object|null} - Next uncompleted profit tier
   */
  getNextProfitTier() {
    return this.state.tiers.find(tier => !tier.completed) || null;
  }
  
  /**
   * Get Position State - Current State Summary
   * 
   * @returns {Object} - Complete position state information
   */
  getPositionState() {
    const holdTimeMinutes = (Date.now() - this.state.entryTime) / (1000 * 60);
    const profitPercent = this.calculateProfitPercent(this.state.currentPrice);
    
    return {
      active: this.state.active,
      direction: this.state.direction,
      entryPrice: this.state.entryPrice,
      currentPrice: this.state.currentPrice,
      profitPercent: profitPercent,
      unrealizedPnL: this.state.unrealizedPnL,
      realizedPnL: this.state.realizedPnL,
      totalPnL: this.state.unrealizedPnL + this.state.realizedPnL,
      remainingSize: this.state.remainingSize,
      originalSize: this.state.originalSize,
      currentStop: this.state.currentStop,
      trailingActive: this.state.trailingActive,
      breakevenActive: this.state.breakevenActive,
      completedTiers: this.state.completedTiers.length,
      totalTiers: this.state.tiers.length,
      holdTimeMinutes: holdTimeMinutes,
      maxUnrealizedPnL: this.state.maxUnrealizedPnL
    };
  }
  
  /**
   * Close Position - Position Closure
   * 
   * POSITION FINALIZATION: Closes the position and finalizes all profit
   * calculations and analytics.
   * 
   * @param {number} exitPrice - Final exit price
   * @param {string} reason - Reason for closure
   * @returns {Object} - Position closure summary
   */
  close(exitPrice, reason = 'manual') {
    if (!this.state.active) {
      return { success: false, error: 'No active position to close' };
    }
    
    const holdTime = Date.now() - this.state.entryTime;
    const holdTimeMinutes = holdTime / (1000 * 60);
    const finalProfitPercent = this.calculateProfitPercent(exitPrice);
    
    // Calculate final P&L
    const remainingPnL = this.state.remainingSize * finalProfitPercent;
    const totalPnL = this.state.realizedPnL + remainingPnL;
    
    // Update analytics
    this.analytics.totalProfitExtracted += totalPnL;
    this.analytics.averageHoldTime = ((this.analytics.averageHoldTime * (this.analytics.totalPositionsManaged - 1)) + holdTimeMinutes) / this.analytics.totalPositionsManaged;
    this.analytics.averageProfitPerPosition = this.analytics.totalProfitExtracted / this.analytics.totalPositionsManaged;
    
    if (totalPnL > this.analytics.bestPositionProfit) {
      this.analytics.bestPositionProfit = totalPnL;
    }
    if (totalPnL < this.analytics.worstPositionLoss) {
      this.analytics.worstPositionLoss = totalPnL;
    }
    
    // Create closure summary
    const summary = {
      success: true,
      entryPrice: this.state.entryPrice,
      exitPrice: exitPrice,
      direction: this.state.direction,
      originalSize: this.state.originalSize,
      finalSize: this.state.remainingSize,
      realizedPnL: this.state.realizedPnL,
      remainingPnL: remainingPnL,
      totalPnL: totalPnL,
      profitPercent: finalProfitPercent,
      maxUnrealizedPnL: this.state.maxUnrealizedPnL,
      holdTime: holdTime,
      holdTimeMinutes: holdTimeMinutes,
      reason: reason,
      tiersCompleted: this.state.completedTiers.length,
      totalTiers: this.state.tiers.length,
      trailingStopUsed: this.state.trailingActive,
      breakevenStopUsed: this.state.breakevenActive
    };
    
    // Reset state
    this.reset();
    
    this.log(`Position closed: ${reason} | P&L: ${totalPnL.toFixed(2)} (${(finalProfitPercent * 100).toFixed(2)}%)`, 'info');
    
    return summary;
  }
  
  /**
   * Reset State - Reset for New Position
   * 
   * SYSTEM RESET: Resets all state for managing a new position while
   * preserving analytics and configuration.
   */
  reset() {
    this.state = {
      active: false,
      entryPrice: 0,
      direction: null,
      originalSize: 0,
      remainingSize: 0,
      currentPrice: 0,
      highestPrice: 0,
      lowestPrice: Infinity,
      currentStop: null,
      initialStop: null,
      trailingActive: false,
      breakevenActive: false,
      tiers: [],
      completedTiers: [],
      entryTime: 0,
      lastUpdateTime: 0,
      unrealizedPnL: 0,
      realizedPnL: 0,
      maxUnrealizedPnL: 0,
      totalFeesEstimated: 0
    };
  }
  
  /**
   * Get Analytics Summary - Performance Analytics
   * 
   * PERFORMANCE REPORTING: Provides comprehensive analytics about
   * profit management performance for optimization and reporting.
   * 
   * @returns {Object} - Complete analytics summary
   */
  getAnalytics() {
    return {
      ...this.analytics,
      efficiency: this.analytics.totalPositionsManaged > 0 ? 
        (this.analytics.totalProfitExtracted / this.analytics.totalPositionsManaged) : 0,
      trailingStopSuccessRate: this.analytics.totalPositionsManaged > 0 ?
        (this.analytics.trailingStopTriggered / this.analytics.totalPositionsManaged) * 100 : 0,
      breakevenProtectionRate: this.analytics.totalPositionsManaged > 0 ?
        (this.analytics.breakevenStopsTriggered / this.analytics.totalPositionsManaged) * 100 : 0
    };
  }
  
  /**
   * Export Configuration - Config Export
   * 
   * SYSTEM BACKUP: Exports current configuration for backup or sharing.
   * 
   * @returns {Object} - Exportable configuration
   */
  exportConfig() {
    return {
      timestamp: Date.now(),
      version: '1.0',
      config: { ...this.config }
    };
  }
  
  /**
   * Import Configuration - Config Import
   * 
   * SYSTEM RESTORE: Imports configuration from backup or template.
   * 
   * @param {Object} configData - Configuration to import
   * @returns {boolean} - Success status
   */
  importConfig(configData) {
    try {
      if (!configData || !configData.config) {
        throw new Error('Invalid configuration data');
      }
      
      this.config = { ...this.config, ...configData.config };
      this.log('Configuration imported successfully', 'info');
      return true;
      
    } catch (error) {
      this.log(`Failed to import configuration: ${error.message}`, 'error');
      return false;
    }
  }
  
  /**
   * Validate Configuration - Config Validation
   * 
   * SYSTEM INTEGRITY: Validates configuration parameters to ensure
   * they're within safe and logical ranges.
   * 
   * @returns {Object} - Validation result
   */
  validateConfig() {
    const errors = [];
    const warnings = [];
    
    // Tier validation
    if (this.config.firstTierTarget >= this.config.secondTierTarget) {
      errors.push('First tier target must be less than second tier target');
    }
    
    if (this.config.secondTierTarget >= this.config.thirdTierTarget) {
      errors.push('Second tier target must be less than third tier target');
    }
    
    if (this.config.thirdTierTarget >= this.config.finalTarget) {
      errors.push('Third tier target must be less than final target');
    }
    
    // Exit percentage validation
    const totalExit = this.config.firstTierExit + this.config.secondTierExit + this.config.thirdTierExit;
    if (totalExit > 1.0) {
      errors.push('Total tier exit percentages cannot exceed 100%');
    }
    
    // Trailing stop validation
    if (this.config.tightTrailDistance >= this.config.trailDistance) {
      warnings.push('Tight trail distance should be smaller than regular trail distance');
    }
    
    if (this.config.minProfit >= this.config.firstTierTarget) {
      warnings.push('Minimum profit for trailing should be less than first tier target');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }
  
  getState() {
    return {
      currentStop: this.state?.currentStop ?? null,
      lastProfitTrigger: null,
      isTrailing: this.state?.trailingActive ?? false
    };
  }

  /**
   * Logging Function - Enhanced Logging
   * 
   * DEBUGGING SUPPORT: Provides structured logging with different severity levels.
   * 
   * @param {string} message - Log message
   * @param {string} level - Log level ('debug', 'info', 'warning', 'error')
   */
  log(message, level = 'info') {
    // Filter debug messages based on config
    if (level === 'debug' && this.config.logLevel !== 'debug') {
      return;
    }
    
    // Format based on severity
    let prefix = '[INFO]';
    
    switch (level) {
      case 'error':
        prefix = '[ERROR]';
        break;
      case 'warning':
        prefix = '[WARN]';
        break;
      case 'info':
        prefix = '[INFO]';
        break;
      case 'debug':
        prefix = '[DEBUG]';
        break;
    }
    
    const timestamp = new Date().toISOString();
    console.log(`${prefix} [${timestamp}] [MaxProfitManager] ${message}`);
  }
}


// ============================================================================
// EXPORTS
// ============================================================================

/* 
============================================================================
MAX PROFIT MANAGER USAGE EXAMPLES FOR NEW DEVELOPERS:
============================================================================

// 1. INITIALIZE PROFIT MANAGER
const MaxProfitManager = require('./core/MaxProfitManager');

const profitManager = new MaxProfitManager();

// 2. START MANAGING A POSITION
const startResult = profitManager.start(
  50000,                        // Entry price
  'buy',                        // Direction
  1.0,                          // Position size
  {
    volatility: 0.03,           // 3% market volatility
    marketCondition: 'trending', // Market condition
    confidence: 0.85            // Trade confidence
  }
);

console.log('Initial stop:', startResult.initialStop);
console.log('Profit tiers:', startResult.profitTiers);

// 3. UPDATE WITH NEW PRICES
const currentPrice = 51000;     // Price moved up $1000

const update = profitManager.update(currentPrice, {
  volatility: 0.025,            // Updated volatility
  volume: 150000                // Current volume
});

console.log('Update action:', update.action);

if (update.action === 'exit_partial') {
  console.log(`Execute partial exit: ${update.exitSize} units`);
  console.log(`Reason: ${update.reason}`);
  console.log(`Remaining size: ${update.remainingSize}`);
}

if (update.action === 'exit_full') {
  console.log(`Execute full exit at ${update.price}`);
  console.log(`Reason: ${update.reason}`);
  console.log(`Final profit: ${(update.profitPercent * 100).toFixed(2)}%`);
}

// 4. MONITOR POSITION STATE
const state = profitManager.getPositionState();

console.log(`Current P&L: ${state.totalPnL.toFixed(2)}`);
console.log(`Profit %: ${(state.profitPercent * 100).toFixed(2)}%`);
console.log(`Completed tiers: ${state.completedTiers}/${state.totalTiers}`);
console.log(`Trailing active: ${state.trailingActive}`);
console.log(`Hold time: ${state.holdTimeMinutes.toFixed(1)} minutes`);

// 5. CLOSE POSITION MANUALLY
if (someCondition) {
  const closure = profitManager.close(currentPrice, 'manual_override');
  
  console.log(`Position closed: ${closure.success}`);
  console.log(`Total P&L: ${closure.totalPnL.toFixed(2)}`);
  console.log(`Hold time: ${closure.holdTimeMinutes.toFixed(1)} minutes`);
  console.log(`Tiers completed: ${closure.tiersCompleted}/${closure.totalTiers}`);
}

// 6. ANALYZE PERFORMANCE
const analytics = profitManager.getAnalytics();

console.log(`Total positions managed: ${analytics.totalPositionsManaged}`);
console.log(`Total profit extracted: ${analytics.totalProfitExtracted.toFixed(2)}`);
console.log(`Average profit per position: ${analytics.averageProfitPerPosition.toFixed(2)}`);
console.log(`Average hold time: ${analytics.averageHoldTime.toFixed(1)} minutes`);
console.log(`Trailing stop success rate: ${analytics.trailingStopSuccessRate.toFixed(1)}%`);

// 7. CONFIGURATION MANAGEMENT
const configValidation = profitManager.validateConfig();

if (!configValidation.valid) {
  console.error('Configuration errors:', configValidation.errors);
}

if (configValidation.warnings.length > 0) {
  console.warn('Configuration warnings:', configValidation.warnings);
}

// 8. BACKUP AND RESTORE CONFIGURATION
const configBackup = profitManager.exportConfig();
// Save to file or database

// Later, restore configuration
// const success = profitManager.importConfig(configBackup);
 
============================================================================
THIS IS YOUR PROFIT AMPLIFIER.
============================================================================

The MaxProfitManager transforms good trades into GREAT trades by:

- TIERED EXITS - Take profits in stages to maximize gains
- DYNAMIC TRAILING - Protect profits while allowing for bigger moves
- VOLATILITY ADAPTATION - Adjust strategies based on market conditions
- TIME OPTIMIZATION - Different strategies for different hold periods
- BREAKEVEN PROTECTION - Lock in profits once position becomes profitable
- MARKET AWARENESS - Adapt targets based on trending vs ranging markets
- PERFORMANCE ANALYTICS - Track and optimize profit extraction efficiency

This system can be the difference between making rent and making life-changing
money. Every extra percent of profit gets you closer to Houston!

The difference between amateur and professional trading isn't just finding
good trades - it's maximizing the profit from every winning trade.

FOR MAXIMUM PROFITS.

*/

module.exports = MaxProfitManager;
