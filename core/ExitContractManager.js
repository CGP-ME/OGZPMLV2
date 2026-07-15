/**
 * ExitContractManager.js - Strategy-Owned Exit System
 * =====================================================
 * Each trade stores its own exit conditions frozen at entry.
 * Exit evaluation checks ONLY the trade's contract, not aggregate confidence.
 *
 * ARCHITECTURE:
 * - Entry: Strategy generates exitContract with SL/TP/invalidation
 * - Trade: exitContract stored on trade object, immutable after entry
 * - Exit: Only check this trade's contract, ignore other strategies
 *
 * FIX 2026-02-17: Stops premature exits caused by unrelated strategy confidence drops
 *
 * @module core/ExitContractManager
 */

'use strict';

// Phase 1 REWRITE: Single source of truth for all trading params
const ConfigLoader = require('../foundation/ConfigLoader');
const { assertExplicitExitOwnership } = require('./dto/ExitContractOwnership');
const { IndicatorCalculator } = require('./IndicatorCalculator');
const ProfitExitPlanner = require('./ProfitExitPlanner');

// Phase 10: Delegate to individual exit checkers
const StopLossChecker = require('./exit/StopLossChecker');
const TakeProfitChecker = require('./exit/TakeProfitChecker');
const MaxHoldChecker = require('./exit/MaxHoldChecker');
// Phase 11: Break-even state machine (single source of truth)
const BreakEvenManager = require('./exit/BreakEvenManager');

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function finiteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveFiniteOrNull(value) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

function positiveIntegerOrNull(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function resolveRsiForPeriod(indicators, priceHistory, period) {
  const keyedValue = finiteOrNull(indicators?.[`rsi${period}`]);
  if (keyedValue !== null) return keyedValue;
  if (!Array.isArray(priceHistory)) return null;
  return finiteOrNull(IndicatorCalculator.calculateRSI(priceHistory, period));
}

function normalizeTimeframeValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cloneExitContract(contract) {
  const { timeframes, ...runtimeContract } = contract || {};
  return { ...runtimeContract };
}

function resolveTimeframeContract(contract, timeframe) {
  const baseContract = cloneExitContract(contract);
  const normalizedTimeframe = normalizeTimeframeValue(timeframe);
  const timeframeContract = normalizedTimeframe && contract?.timeframes?.[normalizedTimeframe];
  if (!timeframeContract || typeof timeframeContract !== 'object' || Array.isArray(timeframeContract)) {
    return baseContract;
  }
  return {
    ...baseContract,
    ...cloneExitContract(timeframeContract),
  };
}

const MISSING_EXIT_CONTRACT_VALUE = Symbol('missing_exit_contract_value');
const EXIT_CONTRACT_VALUE_FIELDS = [
  'strategyName',
  'stopLossPercent',
  'takeProfitPercent',
  'trailingStopPercent',
  'trailingActivation',
  'maxHoldTimeMinutes',
  'useStructuralExits',
  'invalidationConditions',
  'minConfidence',
  'atrMinPercent',
];

function readRuntimeContractValue(path) {
  return ConfigLoader.get(path, MISSING_EXIT_CONTRACT_VALUE);
}

function hasRuntimeContractOverride(strategyName, timeframe) {
  const normalizedTimeframe = normalizeTimeframeValue(timeframe);
  return EXIT_CONTRACT_VALUE_FIELDS.some((field) => (
    readRuntimeContractValue(`exitContracts.${strategyName}.${field}`) !== MISSING_EXIT_CONTRACT_VALUE
    || (
      normalizedTimeframe
      && readRuntimeContractValue(`exitContracts.${strategyName}.timeframes.${normalizedTimeframe}.${field}`) !== MISSING_EXIT_CONTRACT_VALUE
    )
  ));
}

function applyRuntimeExitContractOverrides(contract, strategyName, timeframe) {
  const normalizedTimeframe = normalizeTimeframeValue(timeframe);
  const resolved = { ...contract };

  for (const field of EXIT_CONTRACT_VALUE_FIELDS) {
    const value = readRuntimeContractValue(`exitContracts.${strategyName}.${field}`);
    if (value !== MISSING_EXIT_CONTRACT_VALUE) {
      resolved[field] = value;
    }
  }

  if (normalizedTimeframe) {
    for (const field of EXIT_CONTRACT_VALUE_FIELDS) {
      const value = readRuntimeContractValue(`exitContracts.${strategyName}.timeframes.${normalizedTimeframe}.${field}`);
      if (value !== MISSING_EXIT_CONTRACT_VALUE) {
        resolved[field] = value;
      }
    }
  }

  return resolved;
}

function buildStrategyContract(contract, strategyName, timeframe) {
  return applyRuntimeExitContractOverrides(
    resolveTimeframeContract(contract, timeframe),
    strategyName,
    timeframe
  );
}

/**
 * Exit contracts and universal limits now come from ConfigLoader (single source of truth)
 * Phase 1 REWRITE: Eliminated hardcoded duplicates - ConfigLoader owns all trading params
 */
const DEFAULT_CONTRACTS = ConfigLoader.BASE_CONFIG.exitContracts;
const UNIVERSAL_LIMITS = ConfigLoader.getSection('universalLimits');

class ExitContractManager {
  constructor() {
    // Phase 1 REWRITE: Read from ConfigLoader (single source of truth)
    this.universalLimits = ConfigLoader.getSection('universalLimits');
    this.defaultContracts = ConfigLoader.BASE_CONFIG.exitContracts;

    // Phase 10: Delegate to individual checkers
    this.stopLossChecker = new StopLossChecker(this.universalLimits);
    this.takeProfitChecker = new TakeProfitChecker();
    this.trailConfig = ConfigLoader.BASE_CONFIG.exitLogic.trail;
    this.maxHoldChecker = new MaxHoldChecker(this.universalLimits);
    // Phase 11: Break-even state machine (for external access/dashboard)
    this.breakEvenManager = new BreakEvenManager();
  }

  /**
   * Get default exit contract for a strategy type
   * @param {string} strategyName - Name of the strategy
   * @returns {Object} Exit contract with SL/TP/invalidation
   */
  getDefaultContract(strategyName, context = {}) {
    // FIX 2026-02-24: Validate strategyName is a string (Phase 12 fuzzing)
    if (typeof strategyName !== 'string' || !strategyName) {
      strategyName = 'default';
    }
    const timeframe = normalizeTimeframeValue(context?.timeframe);

    // Try exact match first
    if (this.defaultContracts[strategyName]) {
      return buildStrategyContract(this.defaultContracts[strategyName], strategyName, timeframe);
    }

    // Try partial match
    const lowerName = strategyName.toLowerCase();
    if (lowerName.includes('ema') || lowerName.includes('crossover')) {
      return buildStrategyContract(this.defaultContracts.EMASMACrossover, strategyName, timeframe);
    }
    if (lowerName.includes('sweep') || lowerName.includes('liquidity')) {
      return buildStrategyContract(this.defaultContracts.LiquiditySweep, strategyName, timeframe);
    }
    if (lowerName.includes('sr') || lowerName.includes('support') || lowerName.includes('resistance')) {
      return buildStrategyContract(this.defaultContracts.MADynamicSR, strategyName, timeframe);
    }
    if (lowerName.includes('candle') || lowerName.includes('pattern')) {
      return buildStrategyContract(this.defaultContracts.CandlePattern, strategyName, timeframe);
    }
    if (lowerName.includes('regime')) {
      return buildStrategyContract(this.defaultContracts.MarketRegime, strategyName, timeframe);
    }
    if (lowerName.includes('mtf') || lowerName.includes('timeframe')) {
      return buildStrategyContract(this.defaultContracts.MultiTimeframe, strategyName, timeframe);
    }

    return buildStrategyContract(this.defaultContracts.default, strategyName, timeframe);
  }

  /**
   * Check if exit conditions are met for a trade
   * Phase 10: Delegates to individual checkers
   * @param {Object} trade - Trade object with exitContract
   * @param {number} currentPrice - Current market price
   * @param {Object} context - { indicators, accountBalance, initialBalance, currentTime }
   * @returns {Object} { shouldExit, exitReason, details }
   */
  checkExitConditions(trade, currentPrice, context = {}) {
    if (!trade || !trade.entryPrice) {
      return { shouldExit: false, exitReason: null, details: 'No valid trade' };
    }

    const entryPrice = trade.entryPrice;
    // PnL depends on direction: LONG = (exit-entry), SHORT = (entry-exit)
    const isShort = trade.direction === 'short' || trade.action === 'SELL_SHORT';
    const pnlPercent = isShort
      ? ((entryPrice - currentPrice) / entryPrice) * 100  // SHORT: profit when price drops
      : ((currentPrice - entryPrice) / entryPrice) * 100; // LONG: profit when price rises
    // EXIT-MED-01: throw on missing context.currentTime instead of falling back
    // to Date.now(). TradingLoop:175 always passes marketData.timestamp ?? Date.now()
    // so this throw catches genuine caller-contract violations only (backtests
    // that bypass TradingLoop).
    if (!Number.isFinite(context.currentTime)) {
      throw new Error(`[EXIT-MED-01] checkExitConditions: context.currentTime non-finite (got ${context.currentTime}) — caller must supply marketData.timestamp`);
    }
    const holdTimeMinutes = (context.currentTime - trade.entryTime) / 60000;

    if (trade.exitContract) {
      assertExplicitExitOwnership(trade.exitContract, 'ExitContractManager.checkExitConditions');
    }
    const contract = trade.exitContract || this.getDefaultContract(trade.entryStrategy || 'default', context);
    assertExplicitExitOwnership(contract, 'ExitContractManager.checkExitConditions');
    // Ensure trade has contract for checkers
    if (!trade.exitContract) trade.exitContract = contract;

    // PRIORITY ORDER: StopLoss > MaxHold > Invalidation > dynamic trailing > profit planner.
    // ExitContractManager is the single exit coordinator. ProfitExitPlanner is
    // stateless and emits intent only; OrderExecutor executes and StateManager
    // mutates from confirmed execution facts.

    // 1. Stop loss + universal circuit breakers (hard stop, account drawdown, strategy SL with BE)
    const slResult = this.stopLossChecker.check(trade, currentPrice, pnlPercent, context);
    if (slResult.shouldExit) return slResult;

    // 2. Max hold time (safety timeout)
    const mhResult = this.maxHoldChecker.check(trade, holdTimeMinutes, pnlPercent);
    if (mhResult.shouldExit) return mhResult;

    // 5. Invalidation conditions (stays in ECM — strategy-specific)
    if (contract.invalidationConditions && contract.invalidationConditions.length > 0 && context.indicators) {
      const invalidation = this.checkInvalidationConditions(
        contract.invalidationConditions,
        trade,
        context.indicators,
        context
      );
      if (invalidation.triggered) {
        return {
          shouldExit: true,
          exitReason: 'invalidation',
          details: `${trade.entryStrategy || 'Strategy'} invalidated: ${invalidation.reason}`,
          confidence: 90
        };
      }
    }

    const profitStopResult = this._checkProfitStopState(trade, currentPrice);
    if (profitStopResult.shouldExit) return profitStopResult;

    const plannerSnapshot = this._buildProfitPlannerSnapshot(trade, currentPrice, context);
    if (plannerSnapshot.skipped) {
      return {
        shouldExit: false,
        exitReason: null,
        details: `Profit planner skipped: ${plannerSnapshot.reason}`,
        profitPlannerSkipped: plannerSnapshot.reason,
        profitPlannerMissing: plannerSnapshot.missing || null,
      };
    }

    const profitIntent = ProfitExitPlanner.plan(plannerSnapshot.snapshot, { currentPrice });
    if (profitIntent.action === 'exit_full' || profitIntent.action === 'exit_partial') {
      return {
        shouldExit: true,
        exitReason: profitIntent.reason,
        details: `Profit planner exit: ${profitIntent.reason}`,
        confidence: 100,
        exitFraction: profitIntent.exitFraction,
        exitIntent: profitIntent,
      };
    }

    this._updateProfitStopState(trade, currentPrice, pnlPercent, context);

    // No exit condition met
    return {
      shouldExit: false,
      exitReason: null,
      details: `Holding: P&L ${pnlPercent.toFixed(2)}%, hold ${holdTimeMinutes.toFixed(0)} min`,
      profitPlanner: profitIntent,
    };
  }

  /**
   * Check strategy-specific invalidation conditions
   * @param {Array} conditions - Array of condition strings
   * @param {Object} trade - Trade object
   * @param {Object} indicators - Current market indicators
   * @returns {Object} { triggered, reason }
   */
  checkInvalidationConditions(conditions, trade, indicators, context = {}) {
    for (const condition of conditions) {
      switch (condition) {
        case 'ema_cross_reversal':
          // EMA crossover reversed (e.g., golden cross → death cross)
          if (trade.entryIndicators?.ema9 > trade.entryIndicators?.ema20 &&
              indicators.ema9 < indicators.ema20) {
            return { triggered: true, reason: 'EMA cross reversed (bullish → bearish)' };
          }
          break;

        case 'regime_change':
          // Market regime changed from entry
          if (trade.entryIndicators?.regime &&
              indicators.regime &&
              trade.entryIndicators.regime !== indicators.regime) {
            return { triggered: true, reason: `Regime changed: ${trade.entryIndicators.regime} → ${indicators.regime}` };
          }
          break;

        case 'rsi2_exit_long': {
          const isLong = trade.direction === 'long' || trade.action === 'BUY';
          const threshold = finiteOrNull(trade.exitContract?.rsiExitLong);
          const period = positiveIntegerOrNull(trade.exitContract?.rsiPeriod) || 2;
          const currentRsi = resolveRsiForPeriod(indicators, context.priceHistory, period);
          if (isLong && threshold !== null && currentRsi !== null && currentRsi >= threshold) {
            return { triggered: true, reason: `RSI${period} long exit threshold reached: ${currentRsi.toFixed(1)} >= ${threshold}` };
          }
          break;
        }

        case 'sr_level_broken':
          // Support/resistance level that triggered entry is now broken
          if (trade.customMetadata?.srLevel) {
            const level = trade.customMetadata.srLevel;
            if (level.type === 'support' && indicators.price < level.price * 0.995) {
              return { triggered: true, reason: `Support broken at ${level.price}` };
            }
            if (level.type === 'resistance' && indicators.price > level.price * 1.005) {
              return { triggered: true, reason: `Resistance broken at ${level.price}` };
            }
          }
          break;

        case 'pattern_negated':
          // Candle pattern that triggered entry is negated
          // This would need pattern-specific logic
          break;

        case 'sweep_invalidated':
          // Liquidity sweep setup is invalidated
          if (trade.customMetadata?.sweepBox) {
            const box = trade.customMetadata.sweepBox;
            // If price breaks back through the box in the wrong direction
            if (trade.direction === 'buy' && indicators.price < box.low * 0.99) {
              return { triggered: true, reason: 'Sweep box broken to downside' };
            }
          }
          break;

        case 'mtf_divergence':
          // Multi-timeframe alignment broke down
          if (trade.entryIndicators?.mtfAlignment &&
              indicators.mtfAlignment &&
              trade.entryIndicators.mtfAlignment !== indicators.mtfAlignment) {
            return { triggered: true, reason: 'MTF alignment diverged' };
          }
          break;
      }
    }

    return { triggered: false, reason: null };
  }

  /**
   * Update trade's max profit for trailing stop calculation
   * Phase 10: Delegates to TrailingStopChecker (single owner of maxProfitPercent)
   * @param {Object} trade - Trade object
   * @param {number} currentPrice - Current market price
   * @returns {number} Updated max profit percent
   */
  updateMaxProfit(trade, currentPrice) {
    if (!trade || !trade.entryPrice) return 0;

    const price = positiveFiniteOrNull(currentPrice);
    const entryPrice = positiveFiniteOrNull(trade.entryPrice);
    if (price === null || entryPrice === null) {
      return Number.isFinite(Number(trade.maxProfitPercent)) ? Number(trade.maxProfitPercent) : 0;
    }

    const isShort = trade.direction === 'short' || trade.action === 'SELL_SHORT';
    const pnlPercent = isShort
      ? ((entryPrice - price) / entryPrice) * 100
      : ((price - entryPrice) / entryPrice) * 100;

    const previousMax = Number.isFinite(Number(trade.maxProfitPercent)) ? Number(trade.maxProfitPercent) : 0;
    trade.maxProfitPercent = Math.max(previousMax, pnlPercent);
    trade.maxFavorableExcursionPercent = trade.maxProfitPercent;

    const previousAdverse = Number.isFinite(Number(trade.maxAdverseExcursionPercent))
      ? Number(trade.maxAdverseExcursionPercent)
      : 0;
    trade.maxAdverseExcursionPercent = Math.min(previousAdverse, pnlPercent);

    if (isShort) {
      const currentLow = positiveFiniteOrNull(trade.lowestPrice);
      trade.lowestPrice = currentLow === null ? price : Math.min(currentLow, price);
    } else {
      const currentHigh = positiveFiniteOrNull(trade.highestPrice);
      trade.highestPrice = currentHigh === null ? price : Math.max(currentHigh, price);
    }

    if (!Number.isFinite(Number(trade.currentStop)) || Number(trade.currentStop) <= 0) {
      const stopPercent = finiteOrNull(trade.exitContract?.stopLossPercent);
      if (stopPercent !== null && stopPercent !== 0) {
        const stopDistance = Math.abs(stopPercent) / 100;
        trade.currentStop = isShort ? entryPrice * (1 + stopDistance) : entryPrice * (1 - stopDistance);
        trade.initialStop = trade.currentStop;
      }
    }

    return trade.maxProfitPercent;
  }

  _checkProfitStopState(trade, currentPrice) {
    const stop = positiveFiniteOrNull(trade?.currentStop);
    const price = positiveFiniteOrNull(currentPrice);
    if (stop === null || price === null || (!trade.trailingActive && !trade.breakevenActive)) {
      return { shouldExit: false };
    }

    const isShort = trade.direction === 'short' || trade.action === 'SELL_SHORT';
    const crossedStop = isShort ? price >= stop : price <= stop;
    if (!crossedStop) {
      return { shouldExit: false };
    }

    const reason = trade.trailingActive ? 'trailing_stop' : 'break_even';
    return {
      shouldExit: true,
      exitReason: reason,
      details: `${reason}: current price ${price.toFixed(2)} crossed managed stop ${stop.toFixed(2)}`,
      confidence: 100,
      meta: {
        currentStop: stop,
        trailingActive: trade.trailingActive === true,
        breakevenActive: trade.breakevenActive === true,
      },
    };
  }

  _updateProfitStopState(trade, currentPrice, pnlPercent, context = {}) {
    const price = positiveFiniteOrNull(currentPrice);
    const entryPrice = positiveFiniteOrNull(trade?.entryPrice);
    if (price === null || entryPrice === null) {
      return { updated: false, reason: 'invalid_price' };
    }

    const profitPercent = finiteOrNull(pnlPercent);
    if (profitPercent === null) {
      return { updated: false, reason: 'invalid_profit' };
    }

    this._updateTrailingStopState(trade, price, profitPercent, context);
    this._updateBreakevenStopState(trade, price, profitPercent);
    return { updated: true };
  }

  _updateTrailingStopState(trade, currentPrice, pnlPercent, context = {}) {
    const trailConfig = this.trailConfig || {};
    if (trailConfig.enabled !== true) {
      return { updated: false, reason: 'trailing_disabled' };
    }

    const minActivation = finiteOrNull(trailConfig.minActivationPercent);
    if (minActivation === null || pnlPercent < minActivation) {
      return { updated: false, reason: 'insufficient_profit' };
    }

    const indicators = context.indicators || {};
    const atr = positiveFiniteOrNull(indicators.atr)
      || positiveFiniteOrNull(indicators.volatility)
      || positiveFiniteOrNull(context.volatility);
    const atrMultiplier = finiteOrNull(trailConfig.atrMultiplier);
    if (atr === null || atrMultiplier === null || atrMultiplier <= 0) {
      return { updated: false, reason: 'missing_atr' };
    }

    let trailDistance = (atr / currentPrice) * atrMultiplier;

    const direction = trade.direction === 'short' || trade.action === 'SELL_SHORT' ? 'short' : 'long';
    const trend = String(indicators.trend || context.trend || '').toLowerCase();
    const isBullTrend = trend === 'bullish' || trend === 'uptrend' || trend === 'trending_up' || trend === 'up';
    const isBearTrend = trend === 'bearish' || trend === 'downtrend' || trend === 'trending_down' || trend === 'down';
    const trendSupportsTrade = (direction === 'long' && isBullTrend) || (direction === 'short' && isBearTrend);
    const rsi = finiteOrNull(indicators.rsi ?? context.rsi);
    const trendWidenMultiplier = finiteOrNull(trailConfig.trendWidenMultiplier);
    if (trendSupportsTrade && rsi !== null && trendWidenMultiplier !== null && trendWidenMultiplier > 1) {
      const trendStrength = direction === 'long'
        ? Math.max(0, (rsi - 50) / 50)
        : Math.max(0, (50 - rsi) / 50);
      trailDistance *= 1 + ((trendWidenMultiplier - 1) * trendStrength);
    }

    const ratchetThreshold = finiteOrNull(trailConfig.profitRatchetThreshold);
    const ratchetRate = finiteOrNull(trailConfig.profitRatchetRate);
    const ratchetFloor = finiteOrNull(trailConfig.profitRatchetFloor);
    if (ratchetThreshold !== null && ratchetRate !== null && ratchetFloor !== null && pnlPercent > ratchetThreshold && ratchetRate > 0) {
      const ratchetFactor = Math.max(ratchetFloor, 1 - ((pnlPercent - ratchetThreshold) * ratchetRate));
      trailDistance *= ratchetFactor;
    }

    const nearestStructure = context.nearestStructure || indicators.nearestStructure || null;
    const structurePrice = positiveFiniteOrNull(nearestStructure?.price);
    const suppliedStructureDistance = finiteOrNull(nearestStructure?.distance);
    const structureDistance = structurePrice !== null
      ? Math.abs(currentPrice - structurePrice) / currentPrice * 100
      : suppliedStructureDistance;
    const structureThreshold = finiteOrNull(trailConfig.structureDistanceThreshold);
    const structureTightenMultiplier = finiteOrNull(trailConfig.structureTightenMultiplier);
    if (structureDistance !== null && structureDistance >= 0 && structureThreshold !== null && structureThreshold > 0
      && structureTightenMultiplier !== null && structureDistance < structureThreshold) {
      const distanceRatio = Math.max(0, Math.min(structureDistance / structureThreshold, 1));
      trailDistance *= Math.max(0, structureTightenMultiplier + ((1 - structureTightenMultiplier) * distanceRatio));
    }

    const minTrailPercent = finiteOrNull(trailConfig.minTrailPercent);
    const maxTrailPercent = finiteOrNull(trailConfig.maxTrailPercent);
    if (!Number.isFinite(trailDistance) || trailDistance <= 0 || minTrailPercent === null || maxTrailPercent === null) {
      return { updated: false, reason: 'invalid_trail_distance' };
    }
    const minTrail = Math.max(0, minTrailPercent) / 100;
    const maxTrail = Math.max(minTrail, maxTrailPercent / 100);
    trailDistance = Math.max(minTrail, Math.min(maxTrail, trailDistance));

    const high = positiveFiniteOrNull(trade.highestPrice) || currentPrice;
    const low = positiveFiniteOrNull(trade.lowestPrice) || currentPrice;
    const newStop = direction === 'short'
      ? low * (1 + trailDistance)
      : high * (1 - trailDistance);
    const currentStop = positiveFiniteOrNull(trade.currentStop);
    const shouldImprove = currentStop === null
      || (direction === 'short' ? newStop < currentStop : newStop > currentStop);

    if (!Number.isFinite(newStop) || newStop <= 0 || !shouldImprove) {
      return { updated: false, reason: 'no_improvement' };
    }

    trade.currentStop = newStop;
    trade.trailingActive = true;
    return { updated: true, newStop, trailDistance };
  }

  _updateBreakevenStopState(trade, currentPrice, pnlPercent) {
    const breakEvenConfig = ConfigLoader.BASE_CONFIG.exitLogic.breakEvenStop;
    if (breakEvenConfig?.enabled !== true || trade.breakevenActive === true) {
      return { updated: false, reason: 'breakeven_disabled_or_active' };
    }

    const triggerPercent = finiteOrNull(breakEvenConfig.triggerPercent);
    if (triggerPercent === null || pnlPercent < triggerPercent) {
      return { updated: false, reason: 'insufficient_profit' };
    }

    const entryPrice = positiveFiniteOrNull(trade.entryPrice);
    if (entryPrice === null) {
      return { updated: false, reason: 'missing_entry_price' };
    }

    const feeBufferPercent = ConfigLoader.BASE_CONFIG.exitLogic.trail.feeBufferPercent;
    const feeBuffer = Math.max(0, finiteOrNull(feeBufferPercent) ?? 0) / 100;
    const isShort = trade.direction === 'short' || trade.action === 'SELL_SHORT';
    const breakevenStop = isShort ? entryPrice * (1 - feeBuffer) : entryPrice * (1 + feeBuffer);

    if (isShort ? !(breakevenStop > currentPrice) : !(breakevenStop < currentPrice)) {
      return { updated: false, reason: 'not_beyond_fee_buffer' };
    }

    const currentStop = positiveFiniteOrNull(trade.currentStop);
    const shouldImprove = currentStop === null
      || (isShort ? breakevenStop < currentStop : breakevenStop > currentStop);
    if (!shouldImprove) {
      return { updated: false, reason: 'no_improvement' };
    }

    trade.currentStop = breakevenStop;
    trade.breakevenActive = true;
    return { updated: true, breakevenStop };
  }

  _buildProfitPlannerSnapshot(trade, currentPrice, context) {
    const tradeId = firstNonEmptyString(trade.id, trade.orderId);
    const intentId = firstNonEmptyString(context.intentId, context.signalId, context.traceId);
    const entryPrice = finiteOrNull(trade.entryPrice ?? trade.price);
    const entryOrderQuantity = finiteOrNull(trade.entryOrderQuantity ?? trade.quantity);
    const remainingOrderQuantity = finiteOrNull(trade.remainingOrderQuantity);
    const tradeRevision = finiteOrNull(trade.tradeRevision);
    const maxProfitPercent = finiteOrNull(trade.maxProfitPercent);

    if (!trade.frozenExitPolicy) {
      return {
        skipped: true,
        reason: 'missing_frozen_exit_policy',
        tradeId,
      };
    }
    if (!tradeId || !intentId || !Number.isFinite(entryPrice) || !Number.isFinite(entryOrderQuantity)
      || !Number.isFinite(remainingOrderQuantity) || !Number.isInteger(tradeRevision)) {
      return {
        skipped: true,
        reason: 'missing_profit_planner_snapshot_field',
        tradeId,
        missing: {
          tradeId: !tradeId,
          intentId: !intentId,
          entryPrice: !Number.isFinite(entryPrice),
          entryOrderQuantity: !Number.isFinite(entryOrderQuantity),
          remainingOrderQuantity: !Number.isFinite(remainingOrderQuantity),
          tradeRevision: !Number.isInteger(tradeRevision),
        },
      };
    }

    return {
      skipped: false,
      snapshot: {
        tradeId,
        intentId,
        tradeRevision,
        executionMode: firstNonEmptyString(trade.executionMode, context.executionMode),
        brokerId: firstNonEmptyString(trade.brokerId, context.brokerId),
        accountId: firstNonEmptyString(trade.accountId, context.accountId),
        assetClass: firstNonEmptyString(trade.assetClass, context.assetClass),
        symbol: firstNonEmptyString(trade.symbol, context.symbol),
        timeframe: firstNonEmptyString(trade.timeframe, context.timeframe),
        sessionId: firstNonEmptyString(context.sessionId),
        scopeKey: firstNonEmptyString(trade.scopeKey, context.scopeKey),
        direction: firstNonEmptyString(trade.direction, trade.action),
        entryPrice,
        entryTimeMs: finiteOrNull(trade.entryTime ?? trade.timestamp),
        entryOrderQuantity,
        remainingOrderQuantity,
        quantityUnit: firstNonEmptyString(trade.remainingOrderQuantityUnit, trade.entryOrderQuantityUnit),
        currentPrice,
        maxProfitPercent: maxProfitPercent === null ? null : maxProfitPercent / 100,
        frozenExitPolicy: trade.frozenExitPolicy,
        pendingExitIntent: trade.pendingExitIntent || null,
        beScaleOutState: trade.beScaleOutState,
        tierStates: trade.tierStates,
        priceSource: firstNonEmptyString(context.priceSource),
        eventTimeMs: finiteOrNull(context.eventTimeMs ?? context.currentTime),
        receivedAtMs: finiteOrNull(context.receivedAtMs ?? context.currentTime),
        nowMs: finiteOrNull(context.nowMs ?? context.currentTime),
      },
    };
  }

  /**
   * Create an exit contract from strategy signal
   * @param {string} strategyName - Name of the triggering strategy
   * @param {Object} signal - Strategy's signal object
   * @param {Object} context - Market context at entry (includes timeframe)
   * @returns {Object} Complete exit contract
   */
  createExitContract(strategyName, signal = {}, context = {}) {
    // FIX 2026-02-24: Null safety for signal and context (Phase 12 fuzzing)
    if (!signal || typeof signal !== 'object') signal = {};
    if (!context || typeof context !== 'object') context = {};

    // Start with default contract for this strategy
    const timeframe = normalizeTimeframeValue(context.timeframe) || '15m';
    const contract = this.getDefaultContract(strategyName, { timeframe });
    contract.timeframe = timeframe;

    // FIX 2026-03-20: Only apply timeframe config for strategies WITHOUT their own exit contracts
    // Bug: Was overwriting RSI's -2.0% SL with 15m's -1.5% SL, causing premature stops on TSLA
    const hasStrategyContract = !!ConfigLoader.BASE_CONFIG.exitContracts[strategyName]
      || hasRuntimeContractOverride(strategyName, timeframe);
    const tfConfig = ConfigLoader.getTimeframeConfig(timeframe);
    if (tfConfig && !hasStrategyContract) {
      // Only apply timeframe defaults for strategies using generic 'default' contract
      contract.stopLossPercent = -1 * (tfConfig.slPct * 100);  // 0.015 → -1.5
      contract.takeProfitPercent = tfConfig.tpPct * 100;       // 0.025 → 2.5
      contract.trailingStopPercent = tfConfig.trailPct * 100;  // 0.010 → 1.0
      contract.maxHoldTimeMinutes = tfConfig.maxHoldMin;       // 120
      console.log(`[EXIT] Using ${timeframe} config: SL=${contract.stopLossPercent}%, TP=${contract.takeProfitPercent}%, Trail=${contract.trailingStopPercent}%`);
    }

    // Override with signal-specific values if provided
    if (signal.stopLossPercent !== undefined) {
      contract.stopLossPercent = signal.stopLossPercent;
    }
    if (signal.takeProfitPercent !== undefined) {
      contract.takeProfitPercent = signal.takeProfitPercent;
    }
    if (signal.trailingStopPercent !== undefined) {
      contract.trailingStopPercent = signal.trailingStopPercent;
    }
    if (signal.trailingActivation !== undefined) {
      contract.trailingActivation = signal.trailingActivation;
    }
    if (signal.invalidationConditions) {
      contract.invalidationConditions = signal.invalidationConditions;
    }
    if (signal.rsiExitLong !== undefined) {
      const rsiExitLong = Number(signal.rsiExitLong);
      if (Number.isFinite(rsiExitLong) && rsiExitLong > 50 && rsiExitLong < 100) {
        contract.rsiExitLong = rsiExitLong;
      }
    }
    if (signal.rsiPeriod !== undefined) {
      const rsiPeriod = positiveIntegerOrNull(signal.rsiPeriod);
      if (rsiPeriod !== null) {
        contract.rsiPeriod = rsiPeriod;
      }
    }
    if (signal.maxHoldTimeMinutes !== undefined) {
      contract.maxHoldTimeMinutes = signal.maxHoldTimeMinutes;
    }

    // Adjust for volatility if provided
    // FIX 2026-02-21: Raised threshold from 2.0 to 5.0 for 1-minute data
    // On 1m candles, volatility 2.0 is normal - only widen on extreme vol
    // FIX 2026-03-19: Extracted hardcoded values to ConfigLoader
    // EXIT-MED-02: ?? preserves intentional zero on these thresholds (e.g.,
    // a 0 volSlMult means "no vol-based SL widening"). || coerced 0 to default.
    const volThreshold = ConfigLoader.get('exits.volatilityThreshold') ?? 5.0;
    const volSlMult = ConfigLoader.get('exits.volatilitySlMultiplier') ?? 1.15;
    const volTpMult = ConfigLoader.get('exits.volatilityTpMultiplier') ?? 1.20;
    if (context.volatility && context.volatility > volThreshold) {
      // High volatility - widen stops
      contract.stopLossPercent *= volSlMult;
      contract.takeProfitPercent *= volTpMult;
    }

    // Freeze contract metadata
    contract.createdAt = Date.now();
    // FIX 2026-02-24: Ensure strategyName is string (Phase 12 fuzzing - NaN prevention)
    contract.strategyName = (typeof strategyName === 'string' && strategyName) ? strategyName : 'default';
    contract.signalConfidence = (typeof signal.confidence === 'number' && !isNaN(signal.confidence)) ? signal.confidence : 0;

    // DEBUG: Log FINAL exit contract values after all overrides and adjustments
    console.log(`[ECM-FINAL] ${strategyName} → SL%=${contract.stopLossPercent?.toFixed(2)} TP%=${contract.takeProfitPercent?.toFixed(2)} Trail%=${contract.trailingStopPercent?.toFixed(2)} (signal had SL%=${signal.stopLossPercent?.toFixed(2)} TP%=${signal.takeProfitPercent?.toFixed(2)})`);

    return contract;
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new ExitContractManager();
  }
  return instance;
}

module.exports = {
  ExitContractManager,
  getInstance,
  DEFAULT_CONTRACTS,
  UNIVERSAL_LIMITS
};
