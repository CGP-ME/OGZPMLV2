'use strict';

const TradingConfig = require('./TradingConfig');
const { freezePolicy } = require('./dto/FrozenExitPolicy');

const REQUIRED_CONTRACT_FIELDS = Object.freeze([
  'stopLossPercent',
  'takeProfitPercent',
  'trailingStopPercent',
  'trailingActivation',
  'maxHoldTimeMinutes',
  'useStructuralExits',
  'invalidationConditions',
]);

const CONFIG_PATHS = Object.freeze({
  beScaleOut: Object.freeze({
    enabled: 'exitLogic.beScaleOut.enabled',
    triggerType: 'exitLogic.beScaleOut.triggerType',
    fixedPercentTrigger: 'exitLogic.beScaleOut.fixedPercentTrigger',
    scaleOutFraction: 'exitLogic.beScaleOut.scaleOutFraction',
    feeBufferPercent: 'exitLogic.beScaleOut.feeBufferPercent',
  }),
  breakEvenStop: Object.freeze({
    enabled: 'exitLogic.breakEvenStop.enabled',
    triggerPercent: 'exitLogic.breakEvenStop.triggerPercent',
  }),
  tieredExit: Object.freeze({
    enabled: 'exitLogic.tieredExit.enabled',
    tier1ExitFraction: 'exitLogic.tieredExit.tier1ExitFraction',
    tier2ExitFraction: 'exitLogic.tieredExit.tier2ExitFraction',
    tier3ExitFraction: 'exitLogic.tieredExit.tier3ExitFraction',
    enableMarketAdaptation: 'exitLogic.tieredExit.enableMarketAdaptation',
    trendingTargetMultiplier: 'exitLogic.tieredExit.trendingTargetMultiplier',
    rangingTargetMultiplier: 'exitLogic.tieredExit.rangingTargetMultiplier',
    highConfidenceThreshold: 'exitLogic.tieredExit.highConfidenceThreshold',
    highConfidenceMultiplier: 'exitLogic.tieredExit.highConfidenceMultiplier',
    lowConfidenceThreshold: 'exitLogic.tieredExit.lowConfidenceThreshold',
    lowConfidenceMultiplier: 'exitLogic.tieredExit.lowConfidenceMultiplier',
  }),
  volatilityAdjustment: Object.freeze({
    enabled: 'exitLogic.volatilityAdjustment.enabled',
    lowThresholdPercent: 'exitLogic.volatilityAdjustment.lowThresholdPercent',
    highThresholdPercent: 'exitLogic.volatilityAdjustment.highThresholdPercent',
    lookbackPeriods: 'exitLogic.volatilityAdjustment.lookbackPeriods',
  }),
  profitTargets: Object.freeze({
    tier1: 'exits.profitTiers.tier1',
    tier2: 'exits.profitTiers.tier2',
    tier3: 'exits.profitTiers.tier3',
    final: 'exits.profitTiers.final',
  }),
  fees: Object.freeze({
    model: 'fees.model',
    makerFee: 'fees.makerFee',
    takerFee: 'fees.takerFee',
    slippage: 'fees.slippage',
    totalRoundTrip: 'fees.totalRoundTrip',
    safetyBuffer: 'fees.safetyBuffer',
    perShare: 'fees.perShare',
    minOrderFee: 'fees.minOrderFee',
  }),
});

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[PolicyBuilder] ${label} must be a plain object`);
  }
}

function requireContractField(contract, field) {
  if (!hasOwn(contract, field)) {
    throw new Error(`[PolicyBuilder] exitContract.${field} is required`);
  }
  return contract[field];
}

function requireFiniteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`[PolicyBuilder] ${label} must be a finite number`);
  }
  return value;
}

function requireFraction(value, label) {
  const numericValue = requireFiniteNumber(value, label);
  if (numericValue < 0 || numericValue > 1) {
    throw new Error(`[PolicyBuilder] ${label} must be between 0 and 1`);
  }
  return numericValue;
}

function requirePercent(value, label) {
  const numericValue = requireFiniteNumber(value, label);
  if (numericValue < 0 || numericValue > 100) {
    throw new Error(`[PolicyBuilder] ${label} must be between 0 and 100 percent-form`);
  }
  return numericValue;
}

function requirePositiveNumber(value, label) {
  const numericValue = requireFiniteNumber(value, label);
  if (numericValue <= 0) {
    throw new Error(`[PolicyBuilder] ${label} must be greater than 0`);
  }
  return numericValue;
}

function requireNegativePercent(value, label) {
  const numericValue = requireFiniteNumber(value, label);
  if (numericValue >= 0 || numericValue < -100) {
    throw new Error(`[PolicyBuilder] ${label} must be negative percent-form between -100 and 0`);
  }
  return numericValue;
}

function requireNullablePercent(value, label) {
  if (value === null) {
    return null;
  }
  return requirePercent(value, label);
}

function requireNullableFraction(value, label) {
  if (value === null) {
    return null;
  }
  return requireFraction(value, label);
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`[PolicyBuilder] ${label} must be boolean`);
  }
  return value;
}

function requireOptionalBoolean(value, label) {
  if (value === undefined || value === null) {
    return null;
  }
  return requireBoolean(value, label);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[PolicyBuilder] ${label} must be a non-empty string`);
  }
  return value;
}

function readConfig(configReader, path) {
  const value = configReader.get(path);
  if (value === undefined) {
    throw new Error(`[PolicyBuilder] missing TradingConfig value: ${path}`);
  }
  return value;
}

function readConfigGroup(configReader, paths) {
  return Object.entries(paths).reduce((acc, [key, path]) => {
    acc[key] = readConfig(configReader, path);
    return acc;
  }, {});
}

function normalizeContract(strategyName, contract) {
  assertPlainObject(contract, 'exitContract');

  for (const field of REQUIRED_CONTRACT_FIELDS) {
    requireContractField(contract, field);
  }

  const invalidationConditions = requireContractField(contract, 'invalidationConditions');
  if (!Array.isArray(invalidationConditions)) {
    throw new Error('[PolicyBuilder] exitContract.invalidationConditions must be an array');
  }

  return {
    strategyName,
    stopLossPercent: requireNegativePercent(contract.stopLossPercent, 'exitContract.stopLossPercent'),
    takeProfitPercent: requirePositiveNumber(contract.takeProfitPercent, 'exitContract.takeProfitPercent'),
    trailingStopPercent: requireNullablePercent(contract.trailingStopPercent, 'exitContract.trailingStopPercent'),
    trailingActivation: requireNullablePercent(contract.trailingActivation, 'exitContract.trailingActivation'),
    maxHoldTimeMinutes: requirePositiveNumber(contract.maxHoldTimeMinutes, 'exitContract.maxHoldTimeMinutes'),
    minConfidence: hasOwn(contract, 'minConfidence')
      ? requireNullableFraction(contract.minConfidence, 'exitContract.minConfidence')
      : null,
    atrMinPercent: hasOwn(contract, 'atrMinPercent')
      ? requireNullablePercent(contract.atrMinPercent, 'exitContract.atrMinPercent')
      : null,
    useStructuralExits: requireBoolean(contract.useStructuralExits, 'exitContract.useStructuralExits'),
    invalidationConditions: invalidationConditions.map((condition, index) => (
      requireString(condition, `exitContract.invalidationConditions[${index}]`)
    )),
    validatedAt: hasOwn(contract, '_validated') ? contract._validated : null,
  };
}

function normalizeBeScaleOut(raw) {
  return {
    enabled: requireBoolean(raw.enabled, 'exitLogic.beScaleOut.enabled'),
    triggerType: requireString(raw.triggerType, 'exitLogic.beScaleOut.triggerType'),
    fixedPercentTrigger: requirePercent(raw.fixedPercentTrigger, 'exitLogic.beScaleOut.fixedPercentTrigger'),
    scaleOutFraction: requireFraction(raw.scaleOutFraction, 'exitLogic.beScaleOut.scaleOutFraction'),
    feeBufferPercent: requirePercent(raw.feeBufferPercent, 'exitLogic.beScaleOut.feeBufferPercent'),
  };
}

function normalizeBreakEvenStop(raw) {
  return {
    enabled: requireBoolean(raw.enabled, 'exitLogic.breakEvenStop.enabled'),
    triggerPercent: requireFiniteNumber(raw.triggerPercent, 'exitLogic.breakEvenStop.triggerPercent'),
  };
}

function normalizeVolatilityAdjustment(raw, volatility) {
  const runtimeVolatility = requirePositiveNumber(volatility, 'volatility');
  const enabled = requireBoolean(raw.enabled, 'exitLogic.volatilityAdjustment.enabled');
  const lowThreshold = requireFiniteNumber(raw.lowThresholdPercent, 'exitLogic.volatilityAdjustment.lowThresholdPercent') / 100;
  const highThreshold = requireFiniteNumber(raw.highThresholdPercent, 'exitLogic.volatilityAdjustment.highThresholdPercent') / 100;
  requirePositiveNumber(raw.lookbackPeriods, 'exitLogic.volatilityAdjustment.lookbackPeriods');

  if (!enabled) {
    return {
      enabled,
      volatility: runtimeVolatility,
      targetFactor: 1.0,
      volatilityLevel: 'disabled',
      adjusted: false,
    };
  }

  if (runtimeVolatility <= lowThreshold) {
    return {
      enabled,
      volatility: runtimeVolatility,
      targetFactor: 0.8,
      volatilityLevel: 'low',
      adjusted: true,
    };
  }

  if (runtimeVolatility >= highThreshold) {
    return {
      enabled,
      volatility: runtimeVolatility,
      targetFactor: 1.4,
      volatilityLevel: 'high',
      adjusted: true,
    };
  }

  return {
    enabled,
    volatility: runtimeVolatility,
    targetFactor: 1.0,
    volatilityLevel: 'normal',
    adjusted: false,
  };
}

function normalizeMarketCondition(marketCondition) {
  return requireString(marketCondition, 'marketCondition');
}

function normalizeEntryDirection(direction) {
  if (direction === undefined || direction === null || direction === '') {
    return 'unknown';
  }
  const value = requireString(direction, 'entryDirection').toLowerCase();
  if (['long', 'buy', 'bullish'].includes(value)) return 'long';
  if (['short', 'sell', 'sell_short', 'bearish'].includes(value)) return 'short';
  throw new Error(`[PolicyBuilder] entryDirection must be long/buy or short/sell when provided (got ${direction})`);
}

function normalizeMtfDirection(direction, score) {
  if (direction === undefined || direction === null || direction === '') {
    if (score > 0) return 'buy';
    if (score < 0) return 'sell';
    return 'neutral';
  }
  const value = requireString(direction, 'mtfConfluenceSnapshot.direction').toLowerCase();
  if (['buy', 'bullish', 'long'].includes(value)) return 'buy';
  if (['sell', 'bearish', 'short'].includes(value)) return 'sell';
  if (value === 'neutral') return 'neutral';
  throw new Error(`[PolicyBuilder] mtfConfluenceSnapshot.direction must be buy, sell, or neutral (got ${direction})`);
}

function normalizeStringArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`[PolicyBuilder] ${label} must be an array when provided`);
  }
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}

function normalizeOptionalNonNegativeInteger(value, label) {
  if (value === undefined || value === null) return null;
  const numericValue = requireFiniteNumber(value, label);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new Error(`[PolicyBuilder] ${label} must be a non-negative integer`);
  }
  return numericValue;
}

function normalizeMtfConfluenceSnapshot(rawSnapshot, entryDirection) {
  const normalizedEntryDirection = normalizeEntryDirection(entryDirection);
  const emptySnapshot = {
    available: false,
    source: 'none',
    entryDirection: normalizedEntryDirection,
    direction: 'neutral',
    alignment: 'unknown',
    score: 0,
    magnitude: 0,
    confidence: 0,
    readyTimeframes: [],
    totalTimeframes: null,
    shouldTrade: null,
    overallBias: null,
  };

  if (rawSnapshot === undefined || rawSnapshot === null) {
    return emptySnapshot;
  }
  assertPlainObject(rawSnapshot, 'mtfConfluenceSnapshot');

  const score = rawSnapshot.confluenceScore !== undefined
    ? requireFiniteNumber(rawSnapshot.confluenceScore, 'mtfConfluenceSnapshot.confluenceScore')
    : rawSnapshot.score !== undefined
      ? requireFiniteNumber(rawSnapshot.score, 'mtfConfluenceSnapshot.score')
      : 0;
  const confidence = rawSnapshot.confidence !== undefined
    ? requireFraction(rawSnapshot.confidence, 'mtfConfluenceSnapshot.confidence')
    : Math.min(1, Math.abs(score));
  const direction = normalizeMtfDirection(rawSnapshot.direction, score);
  const readyTimeframes = normalizeStringArray(
    rawSnapshot.readyTimeframes !== undefined ? rawSnapshot.readyTimeframes : rawSnapshot.timeframes,
    'mtfConfluenceSnapshot.readyTimeframes'
  );
  const available = rawSnapshot.available !== undefined
    ? requireBoolean(rawSnapshot.available, 'mtfConfluenceSnapshot.available')
    : direction !== 'neutral' || score !== 0 || readyTimeframes.length > 0;
  const totalTimeframes = normalizeOptionalNonNegativeInteger(rawSnapshot.totalTimeframes, 'mtfConfluenceSnapshot.totalTimeframes');
  const shouldTrade = requireOptionalBoolean(rawSnapshot.shouldTrade, 'mtfConfluenceSnapshot.shouldTrade');
  const overallBias = rawSnapshot.overallBias === undefined || rawSnapshot.overallBias === null
    ? null
    : requireString(rawSnapshot.overallBias, 'mtfConfluenceSnapshot.overallBias');

  let alignment = 'unknown';
  if (!available || direction === 'neutral' || normalizedEntryDirection === 'unknown') {
    alignment = available ? 'neutral' : 'unknown';
  } else {
    const entryMtfDirection = normalizedEntryDirection === 'long' ? 'buy' : 'sell';
    alignment = entryMtfDirection === direction ? 'aligned' : 'conflicted';
  }

  return {
    available,
    source: rawSnapshot.source === undefined || rawSnapshot.source === null
      ? 'StrategyOrchestrator.mtfConfluence'
      : requireString(rawSnapshot.source, 'mtfConfluenceSnapshot.source'),
    entryDirection: normalizedEntryDirection,
    direction,
    alignment,
    score,
    magnitude: Math.abs(score),
    confidence,
    readyTimeframes,
    totalTimeframes,
    shouldTrade,
    overallBias,
  };
}

function targetAdjustment(raw, volatilityAdjustment, confidence, marketCondition) {
  const runtimeConfidence = requirePositiveNumber(confidence, 'confidence');
  const condition = normalizeMarketCondition(marketCondition);
  let marketMultiplier = 1.0;
  if (condition === 'trending' && requireBoolean(raw.enableMarketAdaptation, 'exitLogic.tieredExit.enableMarketAdaptation')) {
    marketMultiplier = requireFiniteNumber(raw.trendingTargetMultiplier, 'exitLogic.tieredExit.trendingTargetMultiplier');
  } else if (condition === 'ranging' && requireBoolean(raw.enableMarketAdaptation, 'exitLogic.tieredExit.enableMarketAdaptation')) {
    marketMultiplier = requireFiniteNumber(raw.rangingTargetMultiplier, 'exitLogic.tieredExit.rangingTargetMultiplier');
  }

  const highConfThreshold = requireFiniteNumber(raw.highConfidenceThreshold, 'exitLogic.tieredExit.highConfidenceThreshold');
  const highConfMult = requireFiniteNumber(raw.highConfidenceMultiplier, 'exitLogic.tieredExit.highConfidenceMultiplier');
  const lowConfThreshold = requireFiniteNumber(raw.lowConfidenceThreshold, 'exitLogic.tieredExit.lowConfidenceThreshold');
  const lowConfMult = requireFiniteNumber(raw.lowConfidenceMultiplier, 'exitLogic.tieredExit.lowConfidenceMultiplier');
  let confidenceMultiplier = 1.0;
  if (runtimeConfidence > highConfThreshold) {
    confidenceMultiplier = highConfMult;
  } else if (runtimeConfidence < lowConfThreshold) {
    confidenceMultiplier = lowConfMult;
  }

  return {
    volatilityTargetFactor: requireFiniteNumber(volatilityAdjustment.targetFactor, 'volatilityAdjustment.targetFactor'),
    marketCondition: condition,
    marketMultiplier,
    confidence: runtimeConfidence,
    confidenceMultiplier,
    combinedTargetMultiplier: volatilityAdjustment.targetFactor * marketMultiplier * confidenceMultiplier,
  };
}

function adjustedTarget(target, adjustment, label) {
  return requireFiniteNumber(target, label) * adjustment.combinedTargetMultiplier;
}

function normalizeTieredExit(raw, targets, volatilityAdjustment, confidence, marketCondition) {
  const tierFractions = [
    ['tier1', raw.tier1ExitFraction],
    ['tier2', raw.tier2ExitFraction],
    ['tier3', raw.tier3ExitFraction],
  ];
  const configuredFractionTotal = tierFractions.reduce((sum, [name, fraction]) => (
    sum + requireFraction(fraction, `exitLogic.tieredExit.${name}ExitFraction`)
  ), 0);
  if (configuredFractionTotal > 1) {
    throw new Error('[PolicyBuilder] exitLogic.tieredExit fractions cannot exceed 1.0 total');
  }
  const finalExitFraction = 1 - configuredFractionTotal;
  const adjustment = targetAdjustment(raw, volatilityAdjustment, confidence, marketCondition);

  return {
    enabled: requireBoolean(raw.enabled, 'exitLogic.tieredExit.enabled'),
    enableMarketAdaptation: requireBoolean(raw.enableMarketAdaptation, 'exitLogic.tieredExit.enableMarketAdaptation'),
    trendingTargetMultiplier: requireFiniteNumber(raw.trendingTargetMultiplier, 'exitLogic.tieredExit.trendingTargetMultiplier'),
    rangingTargetMultiplier: requireFiniteNumber(raw.rangingTargetMultiplier, 'exitLogic.tieredExit.rangingTargetMultiplier'),
    highConfidenceThreshold: requireFiniteNumber(raw.highConfidenceThreshold, 'exitLogic.tieredExit.highConfidenceThreshold'),
    highConfidenceMultiplier: requireFiniteNumber(raw.highConfidenceMultiplier, 'exitLogic.tieredExit.highConfidenceMultiplier'),
    lowConfidenceThreshold: requireFiniteNumber(raw.lowConfidenceThreshold, 'exitLogic.tieredExit.lowConfidenceThreshold'),
    lowConfidenceMultiplier: requireFiniteNumber(raw.lowConfidenceMultiplier, 'exitLogic.tieredExit.lowConfidenceMultiplier'),
    allocationBasis: 'open_tier_weight',
    adjustment,
    tiers: [
      {
        name: 'tier1',
        targetProfitMove: adjustedTarget(targets.tier1, adjustment, 'exits.profitTiers.tier1'),
        baseTargetProfitMove: requireFiniteNumber(targets.tier1, 'exits.profitTiers.tier1'),
        exitFraction: requireFraction(raw.tier1ExitFraction, 'exitLogic.tieredExit.tier1ExitFraction'),
      },
      {
        name: 'tier2',
        targetProfitMove: adjustedTarget(targets.tier2, adjustment, 'exits.profitTiers.tier2'),
        baseTargetProfitMove: requireFiniteNumber(targets.tier2, 'exits.profitTiers.tier2'),
        exitFraction: requireFraction(raw.tier2ExitFraction, 'exitLogic.tieredExit.tier2ExitFraction'),
      },
      {
        name: 'tier3',
        targetProfitMove: adjustedTarget(targets.tier3, adjustment, 'exits.profitTiers.tier3'),
        baseTargetProfitMove: requireFiniteNumber(targets.tier3, 'exits.profitTiers.tier3'),
        exitFraction: requireFraction(raw.tier3ExitFraction, 'exitLogic.tieredExit.tier3ExitFraction'),
      },
      {
        name: 'final',
        targetProfitMove: adjustedTarget(targets.final, adjustment, 'exits.profitTiers.final'),
        baseTargetProfitMove: requireFiniteNumber(targets.final, 'exits.profitTiers.final'),
        exitFraction: finalExitFraction,
      },
    ],
  };
}

function normalizeFees(raw) {
  return {
    model: requireString(raw.model, 'fees.model'),
    makerFee: requireFiniteNumber(raw.makerFee, 'fees.makerFee'),
    takerFee: requireFiniteNumber(raw.takerFee, 'fees.takerFee'),
    slippage: requireFiniteNumber(raw.slippage, 'fees.slippage'),
    totalRoundTrip: requireFiniteNumber(raw.totalRoundTrip, 'fees.totalRoundTrip'),
    safetyBuffer: requireFiniteNumber(raw.safetyBuffer, 'fees.safetyBuffer'),
    perShare: requireFiniteNumber(raw.perShare, 'fees.perShare'),
    minOrderFee: requireFiniteNumber(raw.minOrderFee, 'fees.minOrderFee'),
  };
}

function buildForTrade(options = {}) {
  const {
    strategyName,
    exitContract,
    nowMs,
    volatility,
    confidence,
    marketCondition,
    entryDirection,
    mtfConfluenceSnapshot,
    configReader = TradingConfig,
  } = options;

  const normalizedStrategyName = requireString(strategyName, 'strategyName');
  requireFiniteNumber(nowMs, 'nowMs');
  if (!configReader || typeof configReader.get !== 'function') {
    throw new Error('[PolicyBuilder] configReader.get must be a function');
  }

  const rawBeScaleOut = readConfigGroup(configReader, CONFIG_PATHS.beScaleOut);
  const rawBreakEvenStop = readConfigGroup(configReader, CONFIG_PATHS.breakEvenStop);
  const rawTieredExit = readConfigGroup(configReader, CONFIG_PATHS.tieredExit);
  const rawVolatilityAdjustment = readConfigGroup(configReader, CONFIG_PATHS.volatilityAdjustment);
  const rawProfitTargets = readConfigGroup(configReader, CONFIG_PATHS.profitTargets);
  const rawFees = readConfigGroup(configReader, CONFIG_PATHS.fees);
  const volatilityAdjustment = normalizeVolatilityAdjustment(rawVolatilityAdjustment, volatility);

  return freezePolicy({
    version: 1,
    source: 'PolicyBuilder.buildForTrade',
    strategyName: normalizedStrategyName,
    builtAtMs: nowMs,
    contract: normalizeContract(normalizedStrategyName, exitContract),
    mtfConfluenceSnapshot: normalizeMtfConfluenceSnapshot(mtfConfluenceSnapshot, entryDirection),
    profitManagement: {
      beScaleOut: normalizeBeScaleOut(rawBeScaleOut),
      breakEvenStop: normalizeBreakEvenStop(rawBreakEvenStop),
      tieredExit: normalizeTieredExit(rawTieredExit, rawProfitTargets, volatilityAdjustment, confidence, marketCondition),
    },
    fees: normalizeFees(rawFees),
  });
}

module.exports = {
  buildForTrade,
  CONFIG_PATHS,
};
