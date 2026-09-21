/**
 * StrategyOrchestrator.js — Isolated Strategy Entry Pipeline
 * ============================================================
 * 
 * THE FIX FOR THE SOUPY POOLED CONFIDENCE PROBLEM.
 * 
 * BEFORE (broken):
 *   All signals → blend into one number → trade on that number
 *   Result: 8 weak signals = high confidence = bad trade
 * 
 * AFTER (this file):
 *   Each strategy evaluates independently → highest confidence WINS →
 *   winner OWNS the trade (its exit contract, its SL/TP) →
 *   confluence only affects POSITION SIZING (2x for 2 agree, 3x for 3)
 * 
 * INTEGRATION:
 *   const orchestrator = new StrategyOrchestrator(config);
 *   const result = orchestrator.evaluate(indicators, patterns, regime, priceHistory, extras);
 *   // result = { action, direction, confidence, winnerStrategy, exitContract, sizingMultiplier, ... }
 * 
 * WIRING INTO run-empire-v2.js:
 *   Replace the tradingBrain.getDecision() call in analyzeAndTrade() with:
 *     const orchResult = this.strategyOrchestrator.evaluate(indicators, patterns, regime, priceHistory, extras);
 *   Then use orchResult.direction, orchResult.confidence, orchResult.exitContract, orchResult.sizingMultiplier
 * 
 * @module core/StrategyOrchestrator
 */

'use strict';

const { getInstance: getExitContractManager } = require('./ExitContractManager');
const { getNarrator } = require('./TradeNarrator');
// Cache singleton at module load — narrator.enabled is sealed from env vars
// in the constructor, so one lookup lasts the process lifetime. Hot-path
// hooks below check `narrator.enabled` directly; when OFF, the try/catch
// frame is never entered (zero allocation per C1 contract).
const narrator = getNarrator();
const MAExtensionFilter = require('./MAExtensionFilter');
const ConfigLoader = require('../foundation/ConfigLoader');
const { IndicatorCalculator } = require('./IndicatorCalculator');
const { c } = require('./CandleHelper');
const { createTraceId, emitTrace } = require('./TraceSpine');
const OpeningRangeBreakout = require('../modules/OpeningRangeBreakout');
const BreakAndRetest = require('../modules/BreakAndRetest');
const MISSING_EXIT_CONTRACT_VALUE = Symbol('missing_exit_contract_value');

// FIX 2026-03-19: Self-contained strategies — each computes its own signals
// No more ctx.extras handoff — each strategy owns its signal computation
const EMASMACrossoverSignal = require('../modules/EMASMACrossoverSignal');
const MADynamicSR = require('../modules/MADynamicSR');
const LiquiditySweepDetector = require('../modules/LiquiditySweepDetector');
const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
const OgzTpoIntegration = require('./OgzTpoIntegration');
const SmartMoneySweep = require('../modules/SmartMoneySweep');
const DonchianBreakout = require('../modules/DonchianBreakout');
const PropSafeEMAPullback = require('../modules/PropSafeEMAPullback');
const EMATrendRetest = require('../modules/EMATrendRetest');
const RSI2MeanReversion = require('../modules/RSI2MeanReversion');
const TimeSeriesMomentum = require('../modules/TimeSeriesMomentum');
const MTF_CONFLUENCE_STATS_KEY = '__OGZ_MTF_CONFLUENCE_STATS';
const STRATEGY_UNAVAILABLE = 'strategy_unavailable';

function assertBaseConfidence01(confidence, label) {
  if (!Number.isFinite(confidence)) {
    throw new Error(`[HIGH-25] ${label} non-finite (got ${confidence})`);
  }
  if (confidence < 0 || confidence > 1) {
    throw new Error(`[HIGH-25] ${label} outside 0..1 (got ${confidence})`);
  }
  return confidence;
}

function assertRankingScore(score, label) {
  if (!Number.isFinite(score)) {
    throw new Error(`[HIGH-25] ${label} non-finite (got ${score})`);
  }
  if (score < 0) {
    throw new Error(`[HIGH-25] ${label} negative (got ${score})`);
  }
  return score;
}

function boundedConfidenceFromRankingScore(score, label = 'publicConfidence') {
  return Math.min(1.0, assertRankingScore(score, label));
}

function parseStructuralPrice(value, label, strategyName) {
  const type = typeof value;
  let numeric;

  if (type === 'number') {
    numeric = value;
  } else if (type === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return {
        ok: false,
        reason: `[EXIT-GEOMETRY] ${strategyName} ${label} must be a finite positive price (got empty string)`,
      };
    }
    numeric = Number(trimmed);
  } else {
    return {
      ok: false,
      reason: `[EXIT-GEOMETRY] ${strategyName} ${label} must be a finite positive price (got ${String(value)})`,
    };
  }

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      ok: false,
      reason: `[EXIT-GEOMETRY] ${strategyName} ${label} must be a finite positive price (got ${String(value)})`,
    };
  }

  return { ok: true, value: numeric };
}

function formatStructuralPriceForLog(value) {
  return Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function hasStructuralLevelOverride(result) {
  const levels = result?.overrideLevels;
  return Boolean(
    levels &&
    typeof levels === 'object' &&
    (
      Object.prototype.hasOwnProperty.call(levels, 'stopLoss') ||
      Object.prototype.hasOwnProperty.call(levels, 'takeProfit')
    )
  );
}

function validateStructuralLevelOverride(result, entryPriceInput) {
  if (!hasStructuralLevelOverride(result)) return { ok: true, signalOverrides: {} };

  const strategyName = result.strategyName || result.name || 'unknown_strategy';
  const exitContractHint = result.exitContractHint || result.signalData?.exitContractHint;
  if (exitContractHint || strategyName === 'OpeningRangeBreakout') {
    return { ok: true, signalOverrides: {}, ignored: true };
  }

  const isShort = result.direction === 'sell';
  const hasStopLossLevel = Object.prototype.hasOwnProperty.call(result.overrideLevels, 'stopLoss');
  const hasTakeProfitLevel = Object.prototype.hasOwnProperty.call(result.overrideLevels, 'takeProfit');
  if (!hasStopLossLevel && !hasTakeProfitLevel) return { ok: true, signalOverrides: {} };

  const parsedEntry = parseStructuralPrice(entryPriceInput, 'entry price', strategyName);
  if (!parsedEntry.ok) return parsedEntry;
  const entryPrice = parsedEntry.value;
  const signalOverrides = {};
  let stopLossLevel;
  let takeProfitLevel;

  if (hasStopLossLevel) {
    const parsedStop = parseStructuralPrice(result.overrideLevels.stopLoss, 'stopLoss', strategyName);
    if (!parsedStop.ok) return parsedStop;
    stopLossLevel = parsedStop.value;
    const rawSL = ((stopLossLevel - entryPrice) / entryPrice) * 100;
    if ((!isShort && rawSL >= 0) || (isShort && rawSL <= 0)) {
      return {
        ok: false,
        reason: `[EXIT-GEOMETRY] ${strategyName} stopLoss ${stopLossLevel} is on the wrong side of entry ${entryPrice} for ${result.direction}`,
      };
    }
    signalOverrides.stopLossPercent = isShort ? -rawSL : rawSL;
  }

  if (hasTakeProfitLevel) {
    const parsedTarget = parseStructuralPrice(result.overrideLevels.takeProfit, 'takeProfit', strategyName);
    if (!parsedTarget.ok) return parsedTarget;
    takeProfitLevel = parsedTarget.value;
    const rawTP = ((takeProfitLevel - entryPrice) / entryPrice) * 100;
    if ((!isShort && rawTP <= 0) || (isShort && rawTP >= 0)) {
      return {
        ok: false,
        reason: `[EXIT-GEOMETRY] ${strategyName} takeProfit ${takeProfitLevel} is on the wrong side of entry ${entryPrice} for ${result.direction}`,
      };
    }
    signalOverrides.takeProfitPercent = isShort ? -rawTP : rawTP;
  }

  return {
    ok: true,
    signalOverrides,
    stopLossLevel,
    takeProfitLevel,
    entryPrice,
  };
}

function validateEntryFanout(result, entryPriceInput) {
  if (!Array.isArray(result.entryFanout) || result.entryFanout.length === 0) {
    return { ok: true, entryFanout: [] };
  }

  const entryFanout = [];
  for (const entry of result.entryFanout) {
    const validation = validateStructuralLevelOverride({
      ...result,
      ...entry,
      strategyName: result.strategyName,
      direction: entry.direction || result.direction,
      overrideLevels: entry.overrideLevels,
      signalData: entry.signalData || result.signalData,
    }, entryPriceInput);
    if (!validation.ok) {
      return {
        ok: false,
        reason: `[ENTRY-FANOUT] ${result.strategyName} fanout ${entry.fanoutIndex ?? entryFanout.length}: ${validation.reason}`,
      };
    }
    entryFanout.push({
      ...entry,
      structuralExitOverrides: validation.signalOverrides || {},
      structuralExitLevels: {
        entryPrice: validation.entryPrice,
        stopLoss: validation.stopLossLevel,
        takeProfit: validation.takeProfitLevel,
      },
    });
  }

  return { ok: true, entryFanout };
}

function cloneDecisionAttribution(attribution) {
  if (!attribution || typeof attribution !== 'object') return null;
  return {
    ...attribution,
    contributors: Array.isArray(attribution.contributors)
      ? attribution.contributors.map((item) => ({ ...item }))
      : [],
  };
}

function deepFreezePlain(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreezePlain(child);
    }
  }
  return value;
}

function refreshDecisionAttribution(result) {
  if (!result.decisionAttribution) return;
  if (!result.decisionAttribution.selectionScore) {
    result.decisionAttribution.selectionScore = {
      scale: 'nonnegative_selector',
      initial: result.decisionAttribution.baseConfidence,
      final: result.decisionAttribution.baseConfidence,
    };
  }
  result.decisionAttribution.selectionScore.final = result.rankingScore;
  result.decisionAttribution.finalConfidence = boundedConfidenceFromRankingScore(
    result.rankingScore,
    `${result.strategyName}.attributionRankingScore`
  );
  result.decisionAttribution.publicConfidence = result.decisionAttribution.finalConfidence;
}

function createDecisionAttribution(strategyName, baseConfidence) {
  return {
    strategyName,
    baseConfidence,
    confidenceScale: '0..1',
    selectionScore: {
      scale: 'nonnegative_selector',
      initial: baseConfidence,
      final: baseConfidence,
    },
    finalConfidence: baseConfidence,
    publicConfidence: baseConfidence,
    contributors: [{
      name: 'strategy_signal',
      type: 'base',
      confidence: baseConfidence,
      score: baseConfidence,
    }],
  };
}

function addDecisionContributor(result, contributor) {
  if (!result.decisionAttribution) {
    result.decisionAttribution = createDecisionAttribution(result.strategyName, result.confidence);
  }
  result.decisionAttribution.contributors.push(contributor);
  refreshDecisionAttribution(result);
}

function recordRankingScoreChange(result, nextRankingScore, label, contributor) {
  const previousRankingScore = result.rankingScore;
  const updatedRankingScore = assertRankingScore(nextRankingScore, label);
  result.rankingScore = updatedRankingScore;
  addDecisionContributor(result, {
    ...contributor,
    previousSelectionScore: previousRankingScore,
    nextSelectionScore: updatedRankingScore,
    selectionMultiplier: previousRankingScore > 0 ? updatedRankingScore / previousRankingScore : null,
  });
}

function getMtfConfluenceStats() {
  if (!globalThis[MTF_CONFLUENCE_STATS_KEY]) {
    globalThis[MTF_CONFLUENCE_STATS_KEY] = {
      boosterEvaluations: 0,
      candidatesSeen: 0,
      appliedContributors: 0,
      alignedBoosts: 0,
      conflictPenalties: 0,
      conflictFloorProtections: 0,
    };
  }
  return globalThis[MTF_CONFLUENCE_STATS_KEY];
}

function publicResult(result) {
  const { rankingScore, ...publicFields } = result;
  return {
    ...publicFields,
    decisionAttribution: cloneDecisionAttribution(result.decisionAttribution),
    confidence: boundedConfidenceFromRankingScore(result.rankingScore, `${result.strategyName}.publicRankingScore`),
  };
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function isStrategyUnavailableRecord(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.code === STRATEGY_UNAVAILABLE &&
    value.status === 'unavailable'
  );
}

function normalizeTimeframeValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mtfTrendDirection(indicators) {
  const trend = typeof indicators?.trend === 'string' ? indicators.trend.toLowerCase() : '';
  if (trend === 'bullish' || trend === 'uptrend' || trend === 'buy' || trend === 'long') return 'buy';
  if (trend === 'bearish' || trend === 'downtrend' || trend === 'sell' || trend === 'short') return 'sell';
  return null;
}

function isMtfTrendAligned(indicators, direction) {
  const trendDirection = mtfTrendDirection(indicators);
  return trendDirection != null && trendDirection === direction;
}

function isMtfTrendConflicting(indicators, direction) {
  const trendDirection = mtfTrendDirection(indicators);
  return trendDirection != null && trendDirection !== direction;
}

function isMtfMacdAligned(indicators, direction) {
  if (!indicators?.macd || typeof indicators.macd.bullish !== 'boolean') return false;
  return direction === 'buy' ? indicators.macd.bullish : !indicators.macd.bullish;
}

function requireOptionalTimeframe(value, label) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = normalizeTimeframeValue(value);
  if (!normalized) {
    throw new Error(`[TIMEFRAME-CONTRACT] ${label} must be a non-empty string when provided (got ${typeof value}: ${value})`);
  }
  return normalized;
}

function resolveSignalTimeframe(result, ctx, strategyName = 'strategy') {
  return requireOptionalTimeframe(result?.timeframe, `${strategyName}.timeframe`)
    || requireOptionalTimeframe(result?.sourceTimeframe, `${strategyName}.sourceTimeframe`)
    || requireOptionalTimeframe(result?.signalData?.timeframe, `${strategyName}.signalData.timeframe`)
    || requireOptionalTimeframe(ctx?.extras?.timeframe, 'extras.timeframe')
    || requireOptionalTimeframe(ctx?.priceHistory?.[ctx.priceHistory.length - 1]?.timeframe, 'latestCandle.timeframe')
    || null;
}

function finiteConfigNumber(value, label, fallback, min = null) {
  const resolved = value ?? fallback;
  const numeric = Number(resolved);
  if (!Number.isFinite(numeric)) {
    throw new Error(`[MTF-BOOSTER] ${label} must be a finite number (got ${resolved})`);
  }
  if (min != null && numeric < min) {
    throw new Error(`[MTF-BOOSTER] ${label} must be >= ${min} (got ${numeric})`);
  }
  return numeric;
}

function requiredRsiNumber(config, key, { min = null, max = null, integer = false, path = `strategies.RSI.${key}` } = {}) {
  const value = config?.[key];
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`[RSI-CONFIG] ${path} must be a finite number (got ${value})`);
  }
  if (integer && !Number.isInteger(numeric)) {
    throw new Error(`[RSI-CONFIG] ${path} must be an integer (got ${numeric})`);
  }
  if (min != null && numeric < min) {
    throw new Error(`[RSI-CONFIG] ${path} must be >= ${min} (got ${numeric})`);
  }
  if (max != null && numeric > max) {
    throw new Error(`[RSI-CONFIG] ${path} must be <= ${max} (got ${numeric})`);
  }
  return numeric;
}

function requiredRsiConfig() {
  const config = ConfigLoader.get('strategies.RSI');
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('[RSI-CONFIG] strategies.RSI must be an object');
  }
  const regimeMaFilter = config.regimeMaFilter;
  if (!regimeMaFilter || typeof regimeMaFilter !== 'object' || Array.isArray(regimeMaFilter)) {
    throw new Error('[RSI-CONFIG] strategies.RSI.regimeMaFilter must be an object');
  }
  const allowedTimeframes = ['trading', '1h', '4h'];
  if (typeof regimeMaFilter.timeframe !== 'string' || !allowedTimeframes.includes(regimeMaFilter.timeframe)) {
    throw new Error(`[RSI-CONFIG] strategies.RSI.regimeMaFilter.timeframe must be one of ${allowedTimeframes.join(', ')}`);
  }
  if (typeof regimeMaFilter.enabled !== 'boolean') {
    throw new Error('[RSI-CONFIG] strategies.RSI.regimeMaFilter.enabled must be boolean');
  }

  const resolved = {
    period: requiredRsiNumber(config, 'period', { min: 1, integer: true }),
    buyBelow: requiredRsiNumber(config, 'buyBelow', { min: 1, max: 99 }),
    exitAbove: requiredRsiNumber(config, 'exitAbove', { min: 1, max: 99 }),
    confidenceBase: requiredRsiNumber(config, 'confidenceBase', { min: 0, max: 1 }),
    confidenceDepthRange: requiredRsiNumber(config, 'confidenceDepthRange', { min: 0.000001 }),
    confidenceDepthMultiplier: requiredRsiNumber(config, 'confidenceDepthMultiplier', { min: 0, max: 1 }),
    maxConfidence: requiredRsiNumber(config, 'maxConfidence', { min: 0, max: 1 }),
    regimeMaFilter: {
      enabled: regimeMaFilter.enabled,
      period: requiredRsiNumber(regimeMaFilter, 'period', { min: 1, integer: true, path: 'strategies.RSI.regimeMaFilter.period' }),
      timeframe: regimeMaFilter.timeframe,
    },
  };
  if (resolved.buyBelow >= resolved.exitAbove) {
    throw new Error(`[RSI-CONFIG] strategies.RSI.buyBelow (${resolved.buyBelow}) must be < exitAbove (${resolved.exitAbove})`);
  }
  return resolved;
}

function booleanConfigValue(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
}

function getEmaCrossoverConfig() {
  return {
    ...(ConfigLoader.get('strategies.EMASMACrossover') || {}),
    entryEventsOnly: booleanConfigValue(ConfigLoader.get('strategyBehavior.emaCrossover.entryEventsOnly'), false),
    confirmBars: finiteConfigNumber(ConfigLoader.get('strategyBehavior.emaCrossover.confirmBars'), 'emaCrossover.confirmBars', 0, 0),
    warmupBars: finiteConfigNumber(ConfigLoader.get('strategyBehavior.emaCrossover.warmupBars'), 'emaCrossover.warmupBars', 10, 1),
  };
}

function getTrendRegimeGateConfig() {
  const strategyListConfig = ConfigLoader.get('strategyBehavior.trendRegimeGate.strategies');
  const strategyList = Array.isArray(strategyListConfig)
    ? strategyListConfig
      : [
        'EMASMACrossover',
        'MADynamicSR',
        'DonchianBreakout',
        'PropSafeEMAPullback',
        'EMATrendRetest',
        'TimeSeriesMomentum',
      ];
  return {
    enabled: booleanConfigValue(ConfigLoader.get('strategyBehavior.trendRegimeGate.enabled'), false),
    minConfidence: finiteConfigNumber(ConfigLoader.get('strategyBehavior.trendRegimeGate.minConfidence'), 'trendRegimeGate.minConfidence', 0.25, 0),
    strategies: new Set(strategyList.map(name => String(name || '').trim()).filter(Boolean)),
  };
}

function getAtrContractConfig() {
  return {
    enabled: booleanConfigValue(ConfigLoader.get('strategyBehavior.atrContracts.enabled'), false),
    stopMultiplier: finiteConfigNumber(ConfigLoader.get('strategyBehavior.atrContracts.stopMultiplier'), 'atrContracts.stopMultiplier', 2.0, 0),
    trailMultiplier: finiteConfigNumber(ConfigLoader.get('strategyBehavior.atrContracts.trailMultiplier'), 'atrContracts.trailMultiplier', 2.0, 0),
    trailingActivationR: finiteConfigNumber(ConfigLoader.get('strategyBehavior.atrContracts.trailingActivationR'), 'atrContracts.trailingActivationR', 1.0, 0),
  };
}

function buildAtrContractOverrides({ indicators, price, strategyName }) {
  const cfg = getAtrContractConfig();
  if (!cfg.enabled) return null;
  const atr = Number(indicators?.atr);
  const entryPrice = Number(price);
  if (!Number.isFinite(atr) || atr <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    return null;
  }

  const atrPercent = (atr / entryPrice) * 100;
  const stopLossPercent = -Math.abs(atrPercent * cfg.stopMultiplier);
  const trailingStopPercent = Math.abs(atrPercent * cfg.trailMultiplier);
  return {
    stopLossPercent,
    trailingStopPercent,
    trailingActivation: Math.abs(stopLossPercent) * cfg.trailingActivationR,
    atrContract: {
      strategyName,
      atr,
      price: entryPrice,
      atrPercent,
      stopMultiplier: cfg.stopMultiplier,
      trailMultiplier: cfg.trailMultiplier,
      trailingActivationR: cfg.trailingActivationR,
    },
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function firstFeatureVector(result, ctx) {
  const candidates = [
    { source: 'signalData.features', value: result?.signalData?.features },
    { source: 'result.features', value: result?.features },
  ];

  if (Array.isArray(ctx?.patterns)) {
    ctx.patterns.forEach((pattern, index) => {
      candidates.push({ source: `patterns[${index}].features`, value: pattern?.features });
    });
  }

  for (const candidate of candidates) {
    if (Array.isArray(candidate.value) && candidate.value.length > 0) {
      return { source: candidate.source, features: candidate.value };
    }
  }

  return null;
}

function buildLearningSnapshot(result, ctx) {
  const memory = ctx?.extras?.patternMemory;
  if (!memory || typeof memory.getConfidence !== 'function') {
    return null;
  }

  const featureVector = firstFeatureVector(result, ctx);
  if (!featureVector) {
    return {
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      featureSource: null,
      source: 'no_features',
      status: 'unavailable',
      confidence: null,
      wins: null,
      losses: null,
      sampleCount: null,
      modifier: null,
    };
  }

  try {
    const learned = memory.getConfidence(featureVector.features, ctx.extras?.patternScope || {});
    const stats = learned?.stats || null;
    const wins = firstFiniteNumber(stats?.wins, stats?.successCount);
    const losses = firstFiniteNumber(stats?.losses, stats?.failureCount);
    const sampleCount = Number.isFinite(wins) && Number.isFinite(losses)
      ? wins + losses
      : firstFiniteNumber(stats?.totalTrades, stats?.seenCount, stats?.timesSeen);

    return {
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      featureSource: featureVector.source,
      source: learned?.source || 'unknown',
      status: learned?.status || stats?.status || 'unknown',
      confidence: firstFiniteNumber(learned?.confidence),
      wins,
      losses,
      sampleCount,
      modifier: null,
    };
  } catch (error) {
    return {
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      featureSource: featureVector.source,
      source: 'lookup_error',
      status: 'error',
      confidence: null,
      wins: null,
      losses: null,
      sampleCount: null,
      modifier: null,
      error: error.message,
    };
  }
}

function getEffectiveExitContractValue(strategyName, key, timeframe = null) {
  const normalizedTimeframe = normalizeTimeframeValue(timeframe);
  if (normalizedTimeframe) {
    const timeframeValue = ConfigLoader.get(`exitContracts.${strategyName}.timeframes.${normalizedTimeframe}.${key}`, MISSING_EXIT_CONTRACT_VALUE);
    if (timeframeValue !== MISSING_EXIT_CONTRACT_VALUE) {
      return { value: timeframeValue, source: 'strategy_timeframe', timeframe: normalizedTimeframe };
    }
  }
  const strategyValue = ConfigLoader.get(`exitContracts.${strategyName}.${key}`, MISSING_EXIT_CONTRACT_VALUE);
  if (strategyValue !== MISSING_EXIT_CONTRACT_VALUE) {
    return { value: strategyValue, source: 'strategy', timeframe: normalizedTimeframe };
  }
  const strategyContract = ConfigLoader.get(`exitContracts.${strategyName}`, MISSING_EXIT_CONTRACT_VALUE);
  if (strategyContract !== MISSING_EXIT_CONTRACT_VALUE) {
    throw new Error(`[EXIT-CONTRACT] ${strategyName}.${key} must be explicit null or a finite number; key is missing from strategy contract`);
  }
  if (normalizedTimeframe) {
    const defaultTimeframeValue = ConfigLoader.get(`exitContracts.default.timeframes.${normalizedTimeframe}.${key}`, MISSING_EXIT_CONTRACT_VALUE);
    if (defaultTimeframeValue !== MISSING_EXIT_CONTRACT_VALUE) {
      return { value: defaultTimeframeValue, source: 'default_timeframe', timeframe: normalizedTimeframe };
    }
  }
  return {
    value: ConfigLoader.get(`exitContracts.default.${key}`, null),
    source: 'default',
    timeframe: normalizedTimeframe,
  };
}

function getContractMinConfidence(strategyName, timeframe = null) {
  const { value: minConfidence } = getEffectiveExitContractValue(strategyName, 'minConfidence', timeframe);
  if (minConfidence == null) return null;
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error(`[EXIT-CONTRACT] ${strategyName}.minConfidence must be null or a finite 0..1 number (got ${minConfidence})`);
  }
  return minConfidence;
}

function getContractAtrMinPercent(strategyName, timeframe = null) {
  const contractAtrMin = getEffectiveExitContractValue(strategyName, 'atrMinPercent', timeframe);
  if (contractAtrMin.value == null) return contractAtrMin;
  if (!Number.isFinite(contractAtrMin.value) || contractAtrMin.value < 0) {
    throw new Error(`[EXIT-CONTRACT] ${strategyName}.atrMinPercent must be null or a finite non-negative number (got ${contractAtrMin.value})`);
  }
  return contractAtrMin;
}

function requireExitHintEnum(hint, strategyName, key, allowed) {
  if (hint[key] === undefined) return null;
  if (typeof hint[key] !== 'string' || !allowed.includes(hint[key])) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.${key} must be one of ${allowed.join(', ')} (got ${hint[key]})`);
  }
  return hint[key];
}

function validateExitHintFamilyShape(hint, strategyName) {
  if (strategyName === 'DonchianBreakout') {
    if (
      hint.stopType !== 'structural'
      || hint.trailType !== 'channel'
      || hint.tpMode !== 'off'
      || hint.maxHoldMode !== 'off'
    ) {
      throw new Error('[EXIT-HINT] DonchianBreakout exitContractHint must remain structural/channel/tp-off/maxHold-off');
    }
  }
  if (strategyName === 'TimeSeriesMomentum') {
    if (hint.tpMode !== 'off' || hint.maxHoldMode !== 'off') {
      throw new Error('[EXIT-HINT] TimeSeriesMomentum exitContractHint must keep tpMode/maxHoldMode off');
    }
  }
}

function normalizeExitHintPartialExit(partialExit, strategyName) {
  if (partialExit === undefined) return undefined;
  if (!partialExit || typeof partialExit !== 'object' || Array.isArray(partialExit)) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.partialExit must be an object when provided`);
  }
  const triggerR = Number(partialExit.triggerR);
  if (!Number.isFinite(triggerR) || triggerR <= 0) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.partialExit.triggerR must be positive when provided (got ${partialExit.triggerR})`);
  }
  const fraction = Number(partialExit.fraction);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.partialExit.fraction must be between 0 and 1 when provided (got ${partialExit.fraction})`);
  }
  if (typeof partialExit.enabled !== 'boolean') {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.partialExit.enabled must be boolean when provided`);
  }
  if (!['terrain', 'atr'].includes(partialExit.remainderTrail)) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.partialExit.remainderTrail must be terrain or atr when provided`);
  }
  return {
    enabled: partialExit.enabled,
    triggerR,
    fraction,
    remainderTrail: partialExit.remainderTrail,
  };
}

function normalizeExitContractHint(hint, strategyName) {
  if (!hint || typeof hint !== 'object') {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint must be an object`);
  }

  const stopLossPercent = Number(hint.stopLossPercent);
  if (!Number.isFinite(stopLossPercent) || stopLossPercent >= 0) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.stopLossPercent must be a negative finite risk distance (got ${hint.stopLossPercent})`);
  }

  const stopType = requireExitHintEnum(hint, strategyName, 'stopType', ['structural', 'atr', 'percent']);
  const trailType = requireExitHintEnum(hint, strategyName, 'trailType', ['percent', 'atr', 'channel']);
  const explicitTpMode = requireExitHintEnum(hint, strategyName, 'tpMode', ['off', 'atrMultiple', 'percent']);
  const maxHoldMode = requireExitHintEnum(hint, strategyName, 'maxHoldMode', ['off', 'session', 'minutes']);
  validateExitHintFamilyShape({
    ...hint,
    ...(stopType !== null ? { stopType } : {}),
    ...(trailType !== null ? { trailType } : {}),
    ...(explicitTpMode !== null ? { tpMode: explicitTpMode } : {}),
    ...(maxHoldMode !== null ? { maxHoldMode } : {}),
  }, strategyName);

  const tpMode = explicitTpMode || 'percent';
  const takeProfitPercent = hint.takeProfitPercent === null && tpMode === 'off'
    ? null
    : Number(hint.takeProfitPercent);
  if (tpMode !== 'off' && (!Number.isFinite(takeProfitPercent) || takeProfitPercent <= 0)) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.takeProfitPercent must be a positive finite target distance (got ${hint.takeProfitPercent})`);
  }

  const normalized = {
    ...hint,
    stopLossPercent,
    takeProfitPercent,
  };
  if (stopType !== null) normalized.stopType = stopType;
  if (trailType !== null) normalized.trailType = trailType;
  if (explicitTpMode !== null) normalized.tpMode = explicitTpMode;
  if (maxHoldMode !== null) normalized.maxHoldMode = maxHoldMode;

  const optionalPositiveFields = new Set(['trailingStopPercent', 'maxHoldTimeMinutes']);
  const optionalNonNegativeFields = new Set(['trailingActivation']);
  for (const key of [...optionalPositiveFields, ...optionalNonNegativeFields]) {
    if (hint[key] === undefined) continue;
    if (key === 'maxHoldTimeMinutes' && hint.maxHoldMode === 'off' && hint[key] === null) {
      normalized[key] = null;
      continue;
    }
    if (hint[key] === null) {
      throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.${key} must be numeric when provided (got null)`);
    }
    const numericValue = Number(hint[key]);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.${key} must be finite when provided (got ${hint[key]})`);
    }
    if (optionalPositiveFields.has(key) && numericValue <= 0) {
      throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.${key} must be positive when provided (got ${hint[key]})`);
    }
    if (optionalNonNegativeFields.has(key) && numericValue < 0) {
      throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.${key} must be non-negative when provided (got ${hint[key]})`);
    }
    normalized[key] = numericValue;
  }

  for (const key of ['atrStopMult', 'trailAtrMult', 'trailChannelBars', 'tpAtrMultiple', 'donchianChannelUpper', 'donchianChannelLower', 'tsmLookback', 'tsmEntryTrailingReturn']) {
    if (hint[key] === undefined || hint[key] === null) continue;
    const numericValue = Number(hint[key]);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.${key} must be finite when provided (got ${hint[key]})`);
    }
    normalized[key] = numericValue;
  }
  if (tpMode === 'atrMultiple' && normalized.tpAtrMultiple === undefined) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.tpAtrMultiple is required when tpMode is atrMultiple`);
  }
  const partialExit = normalizeExitHintPartialExit(hint.partialExit, strategyName);
  if (partialExit !== undefined) {
    normalized.partialExit = partialExit;
  }

  if (hint.invalidationConditions !== undefined) {
    if (!Array.isArray(hint.invalidationConditions)) {
      throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.invalidationConditions must be an array when provided`);
    }
    for (const condition of hint.invalidationConditions) {
      if (typeof condition !== 'string' || condition.trim() === '') {
        throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.invalidationConditions entries must be non-empty strings`);
      }
    }
    normalized.invalidationConditions = [...hint.invalidationConditions];
  }
  if (hint.rsiExitLong !== undefined) {
    const rsiExitLong = Number(hint.rsiExitLong);
    if (!Number.isFinite(rsiExitLong) || rsiExitLong <= 50 || rsiExitLong >= 100) {
      throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.rsiExitLong must be between 50 and 100 when provided (got ${hint.rsiExitLong})`);
    }
    normalized.rsiExitLong = rsiExitLong;
  }

  return normalized;
}

class StrategyOrchestrator {
  constructor(config = {}) {
    // Minimum confidence a single strategy needs to fire a trade
    // This is PER-STRATEGY, not aggregate — much more meaningful
    // TUNE 2026-02-27: Raised from 0.25 to filter garbage signals
    this.minStrategyConfidence = ConfigLoader.get('confidence.minStrategyConfidence') ?? 0.01;

    // FIX 2026-03-19: Extracted hardcoded thresholds to config
    this.regimeMinConfidence = ConfigLoader.get('confidence.regimeMinConfidence') ?? 0.30;
    this.confluenceMinScore = ConfigLoader.get('confidence.confluenceMinScore') ?? 0.30;

    // Minimum confluence signals to allow entry (default: 1 = winner alone is enough)
    this.minConfluenceCount = config.minConfluenceCount ?? 1;

    // Position sizing multipliers based on how many strategies agree
    this.confluenceSizing = config.confluenceSizing ?? {
      1: 1.0,   // Single strategy — base size
      2: 1.5,   // Two agree — 1.5x
      3: 2.0,   // Three agree — 2x
      4: 2.5,   // Four+ agree — 2.5x (cap)
    };
    this.mtfBaseTimeframe = typeof config.mtfBaseTimeframe === 'string' && config.mtfBaseTimeframe.trim()
      ? config.mtfBaseTimeframe.trim()
      : null;

    // Strategy definitions — each has an evaluate function
    // These are pluggable: add/remove strategies by editing this array
    this.strategies = [];
    this.symbolStrategyModules = new Map();

    // Opening Range Breakout stateful strategy instance
    // MUST be initialized BEFORE _registerBuiltinStrategies() so closure captures it
    this.openingRangeBreakoutConfig = ConfigLoader.get('strategies.OpeningRangeBreakout');
    this.orbStrategy = new OpeningRangeBreakout(this.openingRangeBreakoutConfig);

    // MA Extension Filter for trend confirmation + first-touch skip
    this.maExtensionFilter = new MAExtensionFilter();

    // FIX 2026-03-19: Self-contained signal modules
    // Each strategy owns its signal computation — no ctx.extras handoff
    this.emaCrossoverConfig = getEmaCrossoverConfig();
    this.emaCrossoverModule = new EMASMACrossoverSignal(this.emaCrossoverConfig);
    this.maDynamicSRConfig = ConfigLoader.get('strategies.MADynamicSR');
    this.maDynamicSRModule = new MADynamicSR(this.maDynamicSRConfig);
    this.liquiditySweepModule = new LiquiditySweepDetector(
      ConfigLoader.get('strategies.LiquiditySweep')
    );
    this.breakAndRetestModule = new BreakAndRetest();
    const NoWickImbalance = require('../modules/NoWickImbalance');
    this.noWickConfig = ConfigLoader.get('strategies.NoWickImbalance');
    this.noWickModule = new NoWickImbalance(this.noWickConfig);
    this.mtfAdapter = new MultiTimeframeAdapter(this._buildMtfAdapterConfig());
    this.ogzTpoConfig = ConfigLoader.get('strategies.OGZTPO');
    this.tpoIntegration = new OgzTpoIntegration(this.ogzTpoConfig);
    this.smartMoneySweepModule = new SmartMoneySweep(
      ConfigLoader.get('strategies.SmartMoneySweep') || {}
    );
    this.donchianBreakoutModule = new DonchianBreakout(
      ConfigLoader.get('strategies.DonchianBreakout') || {}
    );
    // Solo strategy mode is resolved by ConfigLoader as strategies.soloFilter.
    const soloFilter = ConfigLoader.get('strategies.soloFilter') || [];
    this.soloStrategies = Array.isArray(soloFilter) && soloFilter.length > 0
      ? soloFilter.map(s => String(s).trim().toLowerCase()).filter(Boolean)
      : null;
    if (this.soloStrategies) {
      console.log(`[StrategyOrchestrator] SOLO MODE: Only ${this.soloStrategies.join(', ')} enabled`);
    }

    // FIX 2026-03-19: Load orchestrator config from ConfigLoader (no hardcodes)
    this.minCandlesEMA = ConfigLoader.get('orchestrator.minCandlesEMA') ?? 20;
    this.minCandlesMASR = ConfigLoader.get('orchestrator.minCandlesMASR') ?? 50;
    this.minCandlesSweep = ConfigLoader.get('orchestrator.minCandlesSweep') ?? 20;
    this.minCandlesMTF = ConfigLoader.get('orchestrator.minCandlesMTF') ?? 30;
    this.minCandlesTPO = ConfigLoader.get('orchestrator.minCandlesTPO') ?? 30;
    this.fibDistanceEMA = ConfigLoader.get('orchestrator.fibDistanceEMA') ?? 0.5;
    this.fibDistanceMASR = ConfigLoader.get('orchestrator.fibDistanceMASR') ?? 0.5;
    this.fibDistanceSweep = ConfigLoader.get('orchestrator.fibDistanceSweep') ?? 0.8;
    this.fibBoostNormal = ConfigLoader.get('orchestrator.fibBoostNormal') ?? 0.10;
    this.fibBoostGolden = ConfigLoader.get('orchestrator.fibBoostGolden') ?? 0.15;

    // Stats tracking
    this.lastEvaluation = null;
    this.evalCount = 0;
    this.mtfEvaluationCache = null;
    this.currentEvaluationUnavailableStrategies = null;

    // DIAGNOSTIC FUNNELS - track where signals die (MUST be before _registerBuiltinStrategies)
    this.diagFunnel = {
      EMASMACrossover: {
        evaluated: 0,
        moduleNonNull: 0,
        nonNeutral: 0,
        passedConf: 0,
        traded: 0,
        crossesDetected: 0,
        eventsFresh: 0,
        filtersComputed: 0,
        velocityFired: 0,
        elasticityFired: 0,
        decayFired: 0,
        votesEmitted: 0,
      },
      MADynamicSR: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      RSI: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      LiquiditySweep: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      OGZTPO: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      SmartMoneySweep: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
    };

    // Register built-in strategies (uses diagFunnel, so must come after)
    this._registerBuiltinStrategies();
  }

  _buildMtfAdapterConfig() {
    const serviceConfig = ConfigLoader.get('orchestrator.mtfConfluenceService') || {};
    return {
      ...(this.mtfBaseTimeframe ? { baseTimeframe: this.mtfBaseTimeframe } : {}),
      activeTimeframes: ConfigLoader.get('orchestrator.mtfTimeframes') || ['1m', '5m', '15m', '1h', '4h'],
      minReadyTimeframes: serviceConfig.minReadyTimeframes,
      weights: serviceConfig.weights,
    };
  }

  _getSymbolStrategyModule(strategyName, symbol, fallbackModule, factory) {
    if (typeof symbol !== 'string' || !symbol) return fallbackModule;
    if (typeof factory !== 'function') {
      throw new Error(`[STRATEGY-SCOPE] ${strategyName} requires a module factory for symbol-scoped state`);
    }

    const canonicalSymbol = symbol.toUpperCase();
    if (!this.symbolStrategyModules.has(strategyName)) {
      this.symbolStrategyModules.set(strategyName, new Map());
    }
    const bySymbol = this.symbolStrategyModules.get(strategyName);
    if (!bySymbol.has(canonicalSymbol)) {
      bySymbol.set(canonicalSymbol, factory());
    }
    return bySymbol.get(canonicalSymbol);
  }

  _resolveStrategyStateSymbol(ctx, latestCandle = null) {
    const candidates = [
      ctx?.extras?.symbol,
      ctx?.symbol,
      latestCandle?.symbol,
      latestCandle?.asset,
      latestCandle?.ticker,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return null;
  }

  _getMtfConfluenceForEvaluation(ctx) {
    if (this.mtfEvaluationCache && this.mtfEvaluationCache.evalCount === this.evalCount) {
      return this.mtfEvaluationCache.confluence;
    }

    const cacheResult = (confluence, unavailableReason = null, adapter = null) => {
      this.mtfEvaluationCache = {
        evalCount: this.evalCount,
        confluence,
        adapter,
        snapshot: confluence
          ? this._buildMtfConfluenceSnapshot(confluence)
          : this._buildMtfUnavailableSnapshot(unavailableReason),
      };
      return confluence;
    };

    const candles = ctx.priceHistory;
    const timeframeAbsence = this._recordLatestCandleTimeframeAbsence(ctx);
    if (timeframeAbsence) {
      return cacheResult(null, 'mtf_missing_candle_timeframe');
    }
    if (!candles || candles.length < this.minCandlesMTF) {
      if (process.env.STRATEGY_DIAG === 'true') {
        console.log(`[DIAG] MultiTimeframe: NOT ENOUGH CANDLES (${candles?.length || 0} < ${this.minCandlesMTF})`);
      }
      return cacheResult(null, 'insufficient_candles');
    }

    const latestCandle = candles[candles.length - 1];
    const scopedMtfAdapter = this._getSymbolStrategyModule(
      'MtfConfluenceService',
      ctx.extras?.symbol,
      this.mtfAdapter,
      () => new MultiTimeframeAdapter(this._buildMtfAdapterConfig())
    );

    try {
      scopedMtfAdapter.ingestCandle(latestCandle, latestCandle.timeframe);
    } catch (e) {
      this._recordStrategyUnavailable({
        strategyName: 'MultiTimeframe',
        source: 'mtf_confluence.ingestCandle',
        reason: 'mtf_ingest_unavailable',
        error: e,
        ctx,
        timeframe: latestCandle.timeframe,
      });
      return cacheResult(null, `mtf_ingest_unavailable:${errorMessage(e)}`, scopedMtfAdapter);
    }

    let confluence;
    try {
      confluence = scopedMtfAdapter.crossFrameScore();
    } catch (e) {
      this._recordStrategyUnavailable({
        strategyName: 'MultiTimeframe',
        source: 'mtf_confluence.crossFrameScore',
        reason: 'mtf_confluence_unavailable',
        error: e,
        ctx,
        timeframe: latestCandle.timeframe,
      });
      return cacheResult(null, `mtf_confluence_unavailable:${errorMessage(e)}`, scopedMtfAdapter);
    }

    if (process.env.STRATEGY_DIAG === 'true') {
      console.log(`[DIAG] MultiTimeframe: confluence=${confluence ? JSON.stringify({ dir: confluence.direction, score: confluence.confluenceScore ?? confluence.score }) : 'null'}`);
    }
    return cacheResult(confluence || null, 'no_confluence', scopedMtfAdapter);
  }

  _getMtfIndicatorsForEvaluation(ctx, timeframe) {
    this._getMtfConfluenceForEvaluation(ctx);
    const adapter = this.mtfEvaluationCache?.evalCount === this.evalCount
      ? this.mtfEvaluationCache.adapter
      : null;
    if (!adapter || typeof adapter.getTimeframeIndicators !== 'function') return null;
    try {
      return adapter.getTimeframeIndicators(timeframe);
    } catch (e) {
      this._recordStrategyUnavailable({
        strategyName: 'MultiTimeframe',
        source: 'mtf_indicators.getTimeframeIndicators',
        reason: 'mtf_indicators_unavailable',
        error: e,
        ctx,
        timeframe,
      });
      return null;
    }
  }

  _getMtfCandlesForEvaluation(ctx, timeframe) {
    this._getMtfConfluenceForEvaluation(ctx);
    const adapter = this.mtfEvaluationCache?.evalCount === this.evalCount
      ? this.mtfEvaluationCache.adapter
      : null;
    if (!adapter || typeof adapter.getCandles !== 'function') return [];
    try {
      return adapter.getCandles(timeframe);
    } catch (e) {
      this._recordStrategyUnavailable({
        strategyName: 'MultiTimeframe',
        source: 'mtf_candles.getCandles',
        reason: 'mtf_candles_unavailable',
        error: e,
        ctx,
        timeframe,
      });
      return [];
    }
  }

  _resolveRsiRegimeMa(ctx, filter) {
    if (!filter.enabled) {
      return { allowed: true, enabled: false, timeframe: filter.timeframe, period: filter.period };
    }

    const timeframe = filter.timeframe;
    const period = filter.period;
    const tradingCandles = Array.isArray(ctx.priceHistory) ? ctx.priceHistory : [];
    let candles = tradingCandles;
    let latestPrice = tradingCandles.length > 0 ? c(tradingCandles[tradingCandles.length - 1]) : null;
    let ma = null;

    if (timeframe === 'trading') {
      if (period === 200 && Number.isFinite(Number(ctx.indicators?.sma200))) {
        ma = Number(ctx.indicators.sma200);
      } else {
        ma = IndicatorCalculator.calculateSMA(candles, period);
      }
    } else {
      candles = this._getMtfCandlesForEvaluation(ctx, timeframe);
      latestPrice = candles.length > 0 ? c(candles[candles.length - 1]) : null;
      ma = IndicatorCalculator.calculateSMA(candles, period);
    }

    if (!Number.isFinite(Number(latestPrice)) || !Number.isFinite(Number(ma))) {
      return {
        allowed: false,
        enabled: true,
        timeframe,
        period,
        price: Number.isFinite(Number(latestPrice)) ? Number(latestPrice) : null,
        ma: Number.isFinite(Number(ma)) ? Number(ma) : null,
        reason: 'regime_ma_unavailable',
      };
    }

    const price = Number(latestPrice);
    const maValue = Number(ma);
    return {
      allowed: price > maValue,
      enabled: true,
      timeframe,
      period,
      price,
      ma: maValue,
      reason: price > maValue ? 'price_above_regime_ma' : 'price_not_above_regime_ma',
    };
  }

  _buildMtfUnavailableSnapshot(reason = null) {
    return deepFreezePlain({
      source: 'StrategyOrchestrator.mtfConfluence',
      available: false,
      unavailableReason: reason || 'unavailable',
      direction: 'neutral',
      confluenceScore: null,
      confidence: null,
      readyTimeframes: [],
      totalTimeframes: null,
      shouldTrade: null,
      overallBias: null,
    });
  }

  _buildMtfConfluenceSnapshot(confluence) {
    if (!confluence || typeof confluence !== 'object') {
      return this._buildMtfUnavailableSnapshot('invalid_confluence');
    }
    const score = firstFiniteNumber(confluence.confluenceScore, confluence.score);
    const readyTimeframes = Array.isArray(confluence.readyTimeframes)
      ? confluence.readyTimeframes.slice()
      : Array.isArray(confluence.timeframes)
        ? confluence.timeframes.slice()
        : [];
    const direction = confluence.direction || 'neutral';
    const available = typeof confluence.available === 'boolean'
      ? confluence.available
      : direction !== 'neutral' || (score != null && score !== 0) || readyTimeframes.length > 0;

    return deepFreezePlain({
      source: 'StrategyOrchestrator.mtfConfluence',
      available,
      unavailableReason: available
        ? null
        : (Array.isArray(confluence.reasoning) && confluence.reasoning.length > 0
          ? confluence.reasoning[0]
          : 'no_ready_timeframes'),
      direction,
      confluenceScore: score == null ? null : score,
      confidence: firstFiniteNumber(confluence.confidence, score == null ? null : Math.abs(score)),
      readyTimeframes,
      totalTimeframes: Number.isInteger(confluence.totalTimeframes) && confluence.totalTimeframes >= 0
        ? confluence.totalTimeframes
        : null,
      shouldTrade: typeof confluence.shouldTrade === 'boolean' ? confluence.shouldTrade : null,
      overallBias: typeof confluence.overallBias === 'string' ? confluence.overallBias : null,
    });
  }

  _getCachedMtfConfluenceSnapshot() {
    if (!this.mtfEvaluationCache || this.mtfEvaluationCache.evalCount !== this.evalCount) {
      return null;
    }
    return this.mtfEvaluationCache.snapshot || null;
  }

  _recordLatestCandleTimeframeAbsence(ctx) {
    const candles = ctx?.priceHistory;
    if (!Array.isArray(candles) || candles.length === 0) {
      return null;
    }
    const latestCandle = candles[candles.length - 1];
    if (latestCandle && typeof latestCandle.timeframe === 'string' && latestCandle.timeframe.trim()) {
      return null;
    }
    return this._recordStrategyUnavailable({
      strategyName: 'MultiTimeframe',
      source: 'mtf_confluence.latestCandle',
      reason: 'mtf_missing_candle_timeframe',
      error: new Error('latest candle missing timeframe'),
      ctx,
    });
  }

  _recordStrategyUnavailable({
    strategyName,
    source,
    reason,
    error = null,
    ctx = null,
    timeframe = null,
  }) {
    const message = error ? errorMessage(error) : null;
    const record = {
      strategyName: strategyName || 'unknown_strategy',
      status: 'unavailable',
      code: STRATEGY_UNAVAILABLE,
      reason,
      source,
      errorMessage: message,
      symbol: ctx?.extras?.symbol || ctx?.symbol || null,
      timeframe: timeframe || ctx?.extras?.timeframe || null,
      evalCount: this.evalCount,
    };
    const sink = Array.isArray(this.currentEvaluationUnavailableStrategies)
      ? this.currentEvaluationUnavailableStrategies
      : null;
    if (sink) {
      const existing = sink.find(item => (
        item.strategyName === record.strategyName &&
        item.source === record.source &&
        item.reason === record.reason &&
        item.errorMessage === record.errorMessage
      ));
      if (existing) {
        return existing;
      }
      sink.push(record);
    }
    console.error(`[StrategyOrchestrator] STRATEGY_UNAVAILABLE strategy=${record.strategyName} source=${source} reason=${reason}${message ? ` error=${message}` : ''}`);
    emitTrace({}, 'STRATEGY_UNAVAILABLE', {
      traceId: createTraceId('strategy_unavailable'),
      ...record,
    });
    return record;
  }

  _shouldObserveMtfConfluence() {
    const booster = ConfigLoader.get('orchestrator.mtfConfluenceBooster') || {};
    const strategyMtf = ConfigLoader.get('orchestrator.strategyMtfConfluence') || {};
    return booster.enabled === true || strategyMtf.enabled === true;
  }

  _applyMtfConfluenceBooster(results, ctx) {
    const config = ConfigLoader.get('orchestrator.mtfConfluenceBooster') || {};
    if (config.enabled !== true) return false;
    if (results.length === 0) return false;

    const minScore = finiteConfigNumber(config.minScore, 'minScore', 0.30, 0);
    const minConfidence = finiteConfigNumber(config.minConfidence, 'minConfidence', 0.50, 0);
    const strengthMultiplier = finiteConfigNumber(config.strengthMultiplier, 'strengthMultiplier', 0.20, 0);
    const maxMultiplier = finiteConfigNumber(config.maxMultiplier, 'maxMultiplier', 1.15, 1);
    const conflictMultiplier = finiteConfigNumber(config.conflictMultiplier, 'conflictMultiplier', 0.85, 0);
    const penalizeConflicts = config.penalizeConflicts !== false;
    const confluence = this._getMtfConfluenceForEvaluation(ctx);
    const signedScore = firstFiniteNumber(confluence?.confluenceScore, confluence?.score);
    if (signedScore == null || signedScore === 0) return false;

    const scoreMagnitude = Math.abs(signedScore);
    const confidence = firstFiniteNumber(confluence?.confidence, scoreMagnitude);
    if (scoreMagnitude < minScore || confidence < minConfidence) return false;

    const mtfDirection = signedScore > 0 ? 'buy' : 'sell';
    const stats = getMtfConfluenceStats();
    stats.boosterEvaluations += 1;
    let changed = false;
    for (const result of results) {
      const strategyConfig = ConfigLoader.get(`strategies.${result.strategyName}`) || {};
      const strategyBoost = strategyConfig.confluenceBoost || {};
      if (strategyBoost.enabled !== true) continue;
      stats.candidatesSeen += 1;

      const aligned = result.direction === mtfDirection;
      const strategyWeight = finiteConfigNumber(strategyBoost.weight, `${result.strategyName}.confluenceBoost.weight`, undefined, 0);
      const multiplier = aligned
        ? Math.min(maxMultiplier, 1 + (scoreMagnitude * strengthMultiplier * strategyWeight))
        : (penalizeConflicts ? conflictMultiplier : 1);

      if (multiplier === 1) continue;
      const previousRankingScore = result.rankingScore;
      const boostedScore = previousRankingScore * multiplier;
      const conflictFloor = previousRankingScore >= this.minStrategyConfidence
        ? this.minStrategyConfidence
        : 0;
      const floorProtected = !aligned && boostedScore < conflictFloor;
      const cappedScore = aligned
        ? Math.min(boostedScore, Math.max(previousRankingScore, 1))
        : Math.max(boostedScore, conflictFloor);
      if (cappedScore === previousRankingScore) continue;
      recordRankingScoreChange(
        result,
        cappedScore,
        `${result.strategyName}.mtfConfluenceRankingScore`,
        {
          name: 'mtf_confluence_booster',
          type: 'multiplier',
          direction: mtfDirection,
          score: signedScore,
          confidence,
          configuredMultiplier: multiplier,
          aligned,
        }
      );
      result.mtfConfluenceBooster = {
        direction: mtfDirection,
        score: signedScore,
        confidence,
        multiplier: cappedScore / previousRankingScore,
        configuredMultiplier: multiplier,
        strategyWeight,
        aligned,
        floorProtected,
      };
      stats.appliedContributors += 1;
      if (aligned) {
        stats.alignedBoosts += 1;
      } else {
        stats.conflictPenalties += 1;
        if (floorProtected) stats.conflictFloorProtections += 1;
      }
      changed = true;
    }

    if (changed) results.sort((a, b) => b.rankingScore - a.rankingScore);
    return changed;
  }

  _applyStrategyMtfConfluence(result, ctx) {
    const strategyMtfConfig = ConfigLoader.get('orchestrator.strategyMtfConfluence') || {};
    if (strategyMtfConfig.enabled !== true) {
      return { disabled: true };
    }

    const applyPenalty = (name, multiplier, reason, extra = {}) => {
      const safeMultiplier = Number.isFinite(Number(multiplier)) ? Number(multiplier) : 1;
      const contributor = {
        name,
        type: 'mtf_confluence',
        passed: false,
        reason,
        configuredMultiplier: safeMultiplier,
        ...extra,
      };
      const floor = result.rankingScore >= this.minStrategyConfidence ? this.minStrategyConfidence : 0;
      const nextScore = Math.max(result.rankingScore * safeMultiplier, floor);
      if (nextScore !== result.rankingScore) {
        recordRankingScoreChange(
          result,
          nextScore,
          `${result.strategyName}.${name}`,
          contributor
        );
      } else {
        addDecisionContributor(result, contributor);
      }
      return { adjusted: nextScore !== result.rankingScore };
    };
    const add = (name, amount, extra = {}) => {
      if (!Number.isFinite(amount) || amount === 0) return;
      const nextScore = Math.max(0, Math.min(1, result.rankingScore + amount));
      if (nextScore === result.rankingScore) return;
      recordRankingScoreChange(
        result,
        nextScore,
        `${result.strategyName}.${name}`,
        {
          name,
          type: 'additive',
          amount,
          ...extra,
        }
      );
    };
    const multiply = (name, multiplier, extra = {}) => {
      if (!Number.isFinite(multiplier) || multiplier === 1) return;
      recordRankingScoreChange(
        result,
        result.rankingScore * multiplier,
        `${result.strategyName}.${name}`,
        {
          name,
          type: 'multiplier',
          configuredMultiplier: multiplier,
          ...extra,
        }
      );
    };

    switch (result.strategyName) {
      case 'EMASMACrossover': {
        const cfg = ConfigLoader.get('orchestrator.emaCrossoverMtf') || {};
        const tf1h = this._getMtfIndicatorsForEvaluation(ctx, '1h');
        const tf4h = this._getMtfIndicatorsForEvaluation(ctx, '4h');
        if (tf1h && isMtfTrendConflicting(tf1h, result.direction)) {
          const multiplier = finiteConfigNumber(cfg.hourlyTrendVetoMultiplier, 'emaCrossoverMtf.hourlyTrendVetoMultiplier', 0.95, 0);
          addDecisionContributor(result, {
            name: 'ema_mtf_1h_trend_conflict_context',
            type: 'annotation',
            passed: false,
            configuredMultiplier: multiplier,
            timeframe: '1h',
            mtfTrend: tf1h.trend,
            direction: result.direction,
          });
        }
        if (tf4h && isMtfMacdAligned(tf4h, result.direction)) {
          const multiplier = finiteConfigNumber(cfg.fourHourMacdBoostMultiplier, 'emaCrossoverMtf.fourHourMacdBoostMultiplier', 1.15, 1);
          addDecisionContributor(result, {
            name: 'ema_mtf_4h_macd_alignment_context',
            type: 'annotation',
            configuredMultiplier: multiplier,
            timeframe: '4h',
            direction: result.direction,
            macdBullish: tf4h.macd?.bullish,
          });
        }
        const minTrendStrength = finiteConfigNumber(cfg.freshLongTermCrossoverMinTrendStrength, 'emaCrossoverMtf.freshLongTermCrossoverMinTrendStrength', 0.3, 0);
        const crossovers = Array.isArray(result.signalData?.crossovers) ? result.signalData.crossovers : [];
        const matchingLongCrosses = crossovers.filter((crossover) => (
          crossover?.pair === 'ema50_200' &&
          ((result.direction === 'buy' && crossover.type === 'golden') ||
            (result.direction === 'sell' && crossover.type === 'death'))
        ));
        if (matchingLongCrosses.length > 0 && (!tf1h || !Number.isFinite(tf1h.trendStrength) || tf1h.trendStrength <= minTrendStrength)) {
          addDecisionContributor(result, {
            name: 'ema_mtf_fresh_50_200_unconfirmed',
            type: 'annotation',
            passed: false,
            timeframe: '1h',
            requiredTrendStrength: minTrendStrength,
            actualTrendStrength: Number.isFinite(tf1h?.trendStrength) ? tf1h.trendStrength : null,
            crossoverCount: matchingLongCrosses.length,
          });
        }
        break;
      }
      case 'MADynamicSR': {
        const cfg = ConfigLoader.get('orchestrator.maDynamicSRMtf') || {};
        const tf1h = this._getMtfIndicatorsForEvaluation(ctx, '1h');
        const tf4h = this._getMtfIndicatorsForEvaluation(ctx, '4h');
        if (cfg.requireHourlyTrendAlign === true && tf1h && isMtfTrendConflicting(tf1h, result.direction)) {
          const multiplier = finiteConfigNumber(cfg.hourlyTrendConflictMultiplier, 'maDynamicSRMtf.hourlyTrendConflictMultiplier', 0.95, 0);
          applyPenalty('masr_mtf_1h_trend_conflict_penalty', multiplier, 'MADynamicSR 1h trend conflicts with entry direction', {
            timeframe: '1h',
            mtfTrend: tf1h.trend,
            direction: result.direction,
          });
        }
        if (result.timeframe === '1h' && tf4h && isMtfTrendAligned(tf4h, result.direction)) {
          const boost = finiteConfigNumber(cfg.fourHourAlignBoost, 'maDynamicSRMtf.fourHourAlignBoost', 0.08, 0);
          add('masr_mtf_4h_trend_boost', boost, {
            timeframe: '4h',
            mtfTrend: tf4h.trend,
            direction: result.direction,
          });
        }
        const compressionThreshold = finiteConfigNumber(cfg.compressionBandwidthThreshold, 'maDynamicSRMtf.compressionBandwidthThreshold', 0.01, 0);
        const bandwidth = tf4h?.bollinger?.bandwidth;
        if (Number.isFinite(bandwidth) && bandwidth < compressionThreshold) {
          addDecisionContributor(result, {
            name: 'masr_mtf_4h_compression_annotation',
            type: 'annotation',
            timeframe: '4h',
            bandwidth,
            threshold: compressionThreshold,
          });
        }
        break;
      }
      case 'RSI': {
        const cfg = ConfigLoader.get('orchestrator.rsiMtf') || {};
        const tf4h = this._getMtfIndicatorsForEvaluation(ctx, '4h');
        if (cfg.penalizeAgainst4hTrend === true && tf4h && isMtfTrendConflicting(tf4h, result.direction)) {
          const multiplier = finiteConfigNumber(cfg.fourHourTrendConflictMultiplier, 'rsiMtf.fourHourTrendConflictMultiplier', 0.95, 0);
          applyPenalty('rsi_mtf_4h_trend_conflict_penalty', multiplier, 'RSI 4h trend conflicts with mean-reversion direction', {
            timeframe: '4h',
            mtfTrend: tf4h.trend,
            direction: result.direction,
          });
        }
        const tf1h = this._getMtfIndicatorsForEvaluation(ctx, '1h');
        const hourlyRsi = tf1h?.rsi;
        const buyMax = finiteConfigNumber(cfg.hourlyRsiBuyMax, 'rsiMtf.hourlyRsiBuyMax', 40, 0);
        const sellMin = finiteConfigNumber(cfg.hourlyRsiSellMin, 'rsiMtf.hourlyRsiSellMin', 60, 0);
        const alignedHourlyRsi = Number.isFinite(hourlyRsi) && (
          (result.direction === 'buy' && hourlyRsi < buyMax) ||
          (result.direction === 'sell' && hourlyRsi > sellMin)
        );
        if (alignedHourlyRsi) {
          const boost = finiteConfigNumber(cfg.hourlyRsiAlignBoost, 'rsiMtf.hourlyRsiAlignBoost', 0.10, 0);
          add('rsi_mtf_1h_rsi_boost', boost, {
            timeframe: '1h',
            hourlyRsi,
            direction: result.direction,
          });
        }
        break;
      }
      case 'OGZTPO': {
        const cfg = ConfigLoader.get('orchestrator.ogzTpoMtf') || {};
        const tf4h = this._getMtfIndicatorsForEvaluation(ctx, '4h');
        if (tf4h && isMtfTrendAligned(tf4h, result.direction)) {
          const multiplier = finiteConfigNumber(cfg.fourHourTrendBoostMultiplier, 'ogzTpoMtf.fourHourTrendBoostMultiplier', 1.12, 1);
          multiply('ogztpo_mtf_4h_trend_boost', multiplier, {
            timeframe: '4h',
            mtfTrend: tf4h.trend,
            direction: result.direction,
          });
        }
        const tf1h = this._getMtfIndicatorsForEvaluation(ctx, '1h');
        if (tf1h && isMtfMacdAligned(tf1h, result.direction)) {
          const multiplier = finiteConfigNumber(cfg.hourlyMacdAlignBoost, 'ogzTpoMtf.hourlyMacdAlignBoost', 1.08, 1);
          multiply('ogztpo_mtf_1h_macd_boost', multiplier, {
            timeframe: '1h',
            direction: result.direction,
            macdBullish: tf1h.macd?.bullish,
          });
        }
        const bandwidth = tf4h?.bollinger?.bandwidth;
        const bandwidthThreshold = finiteConfigNumber(cfg.bandwidthThreshold, 'ogzTpoMtf.bandwidthThreshold', 0.015, 0);
        if (Number.isFinite(bandwidth) && bandwidth > bandwidthThreshold) {
          addDecisionContributor(result, {
            name: 'ogztpo_mtf_4h_volatility_context',
            type: 'annotation',
            timeframe: '4h',
            bandwidth,
            threshold: bandwidthThreshold,
          });
        }
        break;
      }
      default:
        break;
    }

    return { applied: true };
  }

  /**
   * Print diagnostic funnel at end of backtest
   */
  printDiagnosticFunnel() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  STRATEGY DIAGNOSTIC FUNNEL - Where Signals Die');
    console.log('═══════════════════════════════════════════════════════════════');
    for (const [name, f] of Object.entries(this.diagFunnel)) {
      if (f.evaluated === 0) continue;
      const pctNonNull = f.evaluated > 0 ? (f.moduleNonNull / f.evaluated * 100).toFixed(2) : 0;
      const pctNonNeutral = f.moduleNonNull > 0 ? (f.nonNeutral / f.moduleNonNull * 100).toFixed(2) : 0;
      const pctConf = f.nonNeutral > 0 ? (f.passedConf / f.nonNeutral * 100).toFixed(2) : 0;
      console.log(`\n  ${name}:`);
      console.log(`    Candles evaluated:     ${f.evaluated}`);
      console.log(`    Module returned value: ${f.moduleNonNull} (${pctNonNull}%)`);
      console.log(`    Non-neutral direction: ${f.nonNeutral} (${pctNonNeutral}% of above)`);
      console.log(`    Passed confidence:     ${f.passedConf} (${pctConf}% of above)`);
      console.log(`    Actually traded:       ${f.traded}`);
    }
    console.log('\n═══════════════════════════════════════════════════════════════\n');
  }

  _logNoSignalSummary(ctx, noSignalStrategies, thrownStrategies) {
    const verbose = process.env.STRATEGY_DIAG === 'true';
    const shouldLog = verbose || this.evalCount <= 3 || this.evalCount % 25 === 0;
    if (!shouldLog) return;

    const candles = Array.isArray(ctx.priceHistory) ? ctx.priceHistory.length : 0;
    const patterns = Array.isArray(ctx.patterns) ? ctx.patterns.length : 0;
    const rsi = Number.isFinite(ctx.indicators?.rsi) ? ctx.indicators.rsi.toFixed(1) : 'n/a';
    const trend = ctx.indicators?.trend || 'n/a';
    const regime = ctx.regime?.currentRegime || 'n/a';
    const minStrategyPct = (this.minStrategyConfidence * 100).toFixed(0);
    const nullList = noSignalStrategies.slice(0, 12).join(',');
    const thrownList = thrownStrategies.slice(0, 5).join(',');

    console.log(
      `[ORCH][NO_SIGNAL] eval=${this.evalCount} candles=${candles} patterns=${patterns} rsi=${rsi} trend=${trend} regime=${regime} minStrategy=${minStrategyPct}% returnedNull=${noSignalStrategies.length}/${this.strategies.length}${nullList ? ` nullStrategies=${nullList}` : ''}${thrownList ? ` thrown=${thrownList}` : ''}`
    );
  }

  /**
   * Register the built-in strategies that map to existing modules.
   * Each strategy has:
   *   - name: identifier (matches ExitContractManager DEFAULT_CONTRACTS keys)
   *   - evaluate(ctx): returns { direction, confidence, reason } or null
   */
  _registerBuiltinStrategies() {
    // Helper: check if strategy should be registered (respects strategies.soloFilter)
    const shouldRegister = (name) => {
      if (!this.soloStrategies) return true;  // No filter — register all
      return this.soloStrategies.includes(name.toLowerCase());
    };
    // ─── 1. EMA/SMA Crossover Strategy ───
    // FIX 2026-03-19: Self-contained — computes crossovers internally from raw candles
    const emaCrossoverModule = this.emaCrossoverModule;
    const minCandlesEMA = this.minCandlesEMA;
    const fibDistanceEMA = this.fibDistanceEMA;
    const fibBoostNormal = this.fibBoostNormal;
    const fibBoostGolden = this.fibBoostGolden;
    const diagEMA = this.diagFunnel.EMASMACrossover;
    if (shouldRegister('EMASMACrossover')) this.strategies.push({
      name: 'EMASMACrossover',
      evaluate: (ctx) => {
        diagEMA.evaluated++;
        // Self-contained: compute signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesEMA) return null;

        const latestCandle = candles[candles.length - 1];
        const scopedEmaCrossover = this._getSymbolStrategyModule(
          'EMASMACrossover',
          ctx.extras?.symbol,
          emaCrossoverModule,
          () => new EMASMACrossoverSignal(this.emaCrossoverConfig)
        );
        const sig = scopedEmaCrossover.update(latestCandle, candles);
        if (sig) diagEMA.moduleNonNull++;
        if (sig?.diagnostics) {
          for (const key of ['crossesDetected', 'eventsFresh', 'filtersComputed', 'velocityFired', 'elasticityFired', 'decayFired', 'votesEmitted']) {
            diagEMA[key] = (diagEMA[key] || 0) + (Number(sig.diagnostics[key]) || 0);
          }
        }

        // DIAGNOSTIC: Log signal computation
        if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {
          console.log(`[DIAG] EMACrossover computed: dir=${sig.direction} conf=${(sig.confidence||0).toFixed(2)}`);
        }
        if (!sig || sig.direction === 'neutral' || !sig.direction) return null;
        const crossoverCount = Array.isArray(sig.crossovers) ? sig.crossovers.length : 0;
        const signalBasis = crossoverCount > 0 ? 'fresh_crossover' : 'ma_alignment';
        const basisLabel = signalBasis === 'fresh_crossover' ? 'Crossover' : 'Alignment';
        const triggerDetail = signalBasis === 'fresh_crossover'
          ? `${crossoverCount} fresh cross${crossoverCount === 1 ? '' : 'es'}`
          : 'no fresh crosses';
        diagEMA.nonNeutral++;
        let conf = Number.isFinite(Number(sig.confidence)) ? Number(sig.confidence) : 0;
        if (conf < this.minStrategyConfidence) return null;
        diagEMA.passedConf++;

        // Fib level boost: if price is bouncing at a fib level, this is a stronger setup
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < fibDistanceEMA) {
          // Price is within fib distance — boost confidence
          const boost = fib.isGoldenZone ? fibBoostGolden : fibBoostNormal;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` + Fib ${(fib.level * 100).toFixed(1)}% (${fib.isGoldenZone ? 'GOLDEN ZONE' : 'near level'})`;
        }

        return {
          direction: sig.direction,
          confidence: conf,
          reason: `EMA/SMA ${basisLabel} ${sig.direction} (${triggerDetail})${fibBoost}`,
          signalData: { ...sig, signalBasis, crossoverCount }
        };
      }
    });

    // ─── 2. MA Dynamic S/R Strategy ───
    // FIX 2026-03-19: Self-contained — computes S/R levels internally from raw candles
    const maDynamicSRModule = this.maDynamicSRModule;
    const minCandlesMASR = this.minCandlesMASR;
    const fibDistanceMASR = this.fibDistanceMASR;
    const diagMASR = this.diagFunnel.MADynamicSR;
    if (shouldRegister('MADynamicSR')) this.strategies.push({
      name: 'MADynamicSR',
      evaluate: (ctx) => {
        diagMASR.evaluated++;
        // Self-contained: compute signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesMASR) return null;

        const latestCandle = candles[candles.length - 1];
        const scopedMaDynamicSR = this._getSymbolStrategyModule(
          'MADynamicSR',
          ctx.extras?.symbol,
          maDynamicSRModule,
          () => new MADynamicSR(this.maDynamicSRConfig)
        );
        const sig = scopedMaDynamicSR.update(latestCandle, candles);
        if (sig && sig.direction) diagMASR.moduleNonNull++;

        // DIAGNOSTIC: Log signal computation
        if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {
          console.log(`[DIAG] MADynamicSR computed: dir=${sig.direction} conf=${(sig.confidence||0).toFixed(2)}`);
        }
        if (!sig || sig.direction === 'neutral' || !sig.direction) return null;
        diagMASR.nonNeutral++;
        let conf = sig.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;
        diagMASR.passedConf++;

        // MADynamicSR handles extension detection internally (slope detection, first-touch skip)
        const price = candles.length > 0 ? candles[candles.length - 1]?.c : null;

        // Fib level boost: bounce at MA + fib level = very strong S/R
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < fibDistanceMASR) {
          const boost = fib.isGoldenZone ? fibBoostGolden : fibBoostNormal;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` + Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
        }

        // FIX 2026-03-20: sl/tp extraction removed - exit contracts handle exits now

        return {
          direction: sig.direction,
          confidence: conf,
          reason: sig.reason || `MA Dynamic S/R ${sig.direction} (level touch)${fibBoost}`,
          signalData: sig,
          // FIX 2026-03-20: Removed overrideLevels - let exit contracts handle SL/TP
        };
      }
    });

    // ─── 3. Liquidity Sweep Strategy ───
    // FIX 2026-03-19: Self-contained — computes sweeps internally from raw candles
    const liquiditySweepModule = this.liquiditySweepModule;
    const minCandlesSweep = this.minCandlesSweep;
    const fibDistanceSweep = this.fibDistanceSweep;
    if (shouldRegister('LiquiditySweep')) this.strategies.push({
      name: 'LiquiditySweep',
      evaluate: (ctx) => {
        // Self-contained: compute signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesSweep) {
          if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] LiquiditySweep: NOT ENOUGH CANDLES (${candles?.length || 0} < ${minCandlesSweep})`);
          return null;
        }

        const latestCandle = candles[candles.length - 1];
        const scopedLiquiditySweep = this._getSymbolStrategyModule(
          'LiquiditySweep',
          ctx.extras?.symbol,
          liquiditySweepModule,
          () => new LiquiditySweepDetector(
            ConfigLoader.get('strategies.LiquiditySweep')
          )
        );
        const sig = scopedLiquiditySweep.feedCandle(latestCandle);

        // DIAGNOSTIC: Log every call to see why no signals
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] LiquiditySweep: called, sig=${sig ? JSON.stringify({hasSignal: sig.hasSignal, direction: sig.direction, confidence: sig.confidence}) : 'null'}`);
        }
        if (!sig || !sig.hasSignal) return null;
        if (typeof scopedLiquiditySweep.consumeSignal === 'function') {
          scopedLiquiditySweep.consumeSignal();
        }
        if (!sig.direction || sig.direction === 'neutral') return null;
        let conf = sig.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;

        // Fib level boost: sweep reversal at a fib level = institutional level
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < fibDistanceSweep) {
          const boost = fib.isGoldenZone ? fibBoostGolden : fibBoostNormal;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` @ Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
        }

        return {
          direction: sig.direction,
          confidence: conf,
          reason: `Liquidity Sweep ${sig.direction} (${sig.sweepType || 'institutional'})${fibBoost}`,
          signalData: sig,
          // Producer only exposes overrideLevels when entry-relative geometry is valid.
          overrideLevels: sig.overrideLevels || null
        };
      }
    });

    // ─── 4. Break & Retest Strategy (Desi Trades) ───
    // 2026-05-04: Migrated to self-contained pattern (was return-null disabled
    // since 2026-02-23). Calls BreakAndRetest.update() inline like LiquiditySweep.
    if (shouldRegister('BreakRetest')) {
      const breakAndRetestModule = this.breakAndRetestModule;
      this.strategies.push({
        name: 'BreakRetest',
        evaluate: (ctx) => {
          const candles = ctx.priceHistory;
          if (!candles || candles.length === 0) return null;
          const latestCandle = candles[candles.length - 1];
          const scopedBreakAndRetest = this._getSymbolStrategyModule(
            'BreakRetest',
            ctx.extras?.symbol,
            breakAndRetestModule,
            () => new BreakAndRetest()
          );
          const sig = scopedBreakAndRetest.update(latestCandle, candles);
          if (!sig || !sig.direction || sig.direction === 'neutral') return null;
          let conf = sig.confidence || 0;
          if (conf < this.minStrategyConfidence) return null;
          const fib = ctx.extras?.nearestFibLevel;
          let fibBoost = '';
          if (fib && fib.distance < 0.5) {
            const boost = fib.isGoldenZone ? 0.12 : 0.08;
            conf = Math.min(1.0, conf + boost);
            fibBoost = ` @ Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
          }
          return {
            direction: sig.direction,
            confidence: conf,
            reason: sig.reason || `Break & Retest ${sig.direction}${fibBoost}`,
            signalData: sig,
            overrideLevels: sig.overrideLevels || null
          };
        }
      });
    }

    // ─── 5. RSI Mean Reversion Strategy ───
    // Trey RSI truth: RSI(5) long mean reversion with strategy-owned 200MA regime filter.
    if (shouldRegister('RSI')) this.strategies.push({
      name: 'RSI',
      evaluate: (ctx) => {
        const diagRSI = this.diagFunnel.RSI;
        diagRSI.evaluated++;
        const candles = ctx.priceHistory;
        const rsiConfig = requiredRsiConfig();
        if (!Array.isArray(candles) || candles.length < rsiConfig.period + 1) return null;

        const rsi = IndicatorCalculator.calculateRSI(candles, rsiConfig.period);
        if (!Number.isFinite(rsi)) return null;
        diagRSI.moduleNonNull++;

        if (rsi >= rsiConfig.buyBelow) return null;
        diagRSI.nonNeutral++;

        const regimeMa = this._resolveRsiRegimeMa(ctx, rsiConfig.regimeMaFilter);
        if (!regimeMa.allowed) return null;

        const strength = Math.min(1.0, (rsiConfig.buyBelow - rsi) / rsiConfig.confidenceDepthRange);
        const confidence = Math.min(
          rsiConfig.maxConfidence,
          rsiConfig.confidenceBase + (strength * rsiConfig.confidenceDepthMultiplier)
        );
        if (confidence < this.minStrategyConfidence) return null;
        diagRSI.passedConf++;

        return {
          direction: 'buy',
          confidence,
          reason: `RSI(${rsiConfig.period}) mean reversion buy (${rsi.toFixed(1)} < ${rsiConfig.buyBelow}) above ${rsiConfig.regimeMaFilter.period}MA`,
          signalData: {
            rsi,
            rsiPeriod: rsiConfig.period,
            buyBelow: rsiConfig.buyBelow,
            exitAbove: rsiConfig.exitAbove,
            regimeMa,
          },
          exitContractHint: {
            rsiPeriod: rsiConfig.period,
            rsiExitLong: rsiConfig.exitAbove,
          },
        };
      }
    });

    // ─── 5. Pattern Recognition Strategy ───
    if (shouldRegister('CandlePattern')) this.strategies.push({
      name: 'CandlePattern',
      evaluate: (ctx) => {
        const patterns = ctx.patterns || [];
        if (patterns.length === 0) return null;

        // Use the highest-confidence pattern
        const best = patterns.reduce((a, b) =>
          (b.confidence || 0) > (a.confidence || 0) ? b : a, patterns[0]);

        if (!best || !best.direction || best.direction === 'neutral') return null;
        const conf = best.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;

        return {
          direction: best.direction === 'bullish' ? 'buy' : best.direction === 'bearish' ? 'sell' : best.direction,
          confidence: conf,
          reason: `Pattern: ${best.name || best.type || 'detected'} (${(conf * 100).toFixed(0)}%)`,
          signalData: best
        };
      }
    });

    // ─── 6. Market Regime + Trend Strategy ───
    if (shouldRegister('MarketRegime')) this.strategies.push({
      name: 'MarketRegime',
      evaluate: (ctx) => {
        const regime = ctx.regime;
        const trend = ctx.indicators?.trend;

        // DIAGNOSTIC: Log why no signals
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] MarketRegime: regime=${regime?.currentRegime || 'null'} trend=${trend || 'null'} conf=${regime?.confidence || 0}`);
        }

        // Structural: no regime data at all → can't vote
        if (!regime || !regime.currentRegime) return null;

        const regimeConf = regime.confidence || 0;
        const regimeName = regime.currentRegime.toLowerCase();
        const isBullRegime = regimeName.includes('bull') || regimeName.includes('uptrend') || regimeName.includes('accumulation');
        const isBearRegime = regimeName.includes('bear') || regimeName.includes('downtrend') || regimeName.includes('distribution');

        // Structural: no directional regime (ranging/volatile/unknown) → no directional vote
        if (!isBullRegime && !isBearRegime) return null;

        const isBullTrend = trend === 'bullish' || trend === 'uptrend';
        const isBearTrend = trend === 'bearish' || trend === 'downtrend';

        // Trend alignment modulates confidence — multipliers, not gates (let it flow)
        let trendMult;
        if ((isBullRegime && isBullTrend) || (isBearRegime && isBearTrend)) {
          trendMult = 1.0;   // full agreement
        } else if ((isBullRegime && isBearTrend) || (isBearRegime && isBullTrend)) {
          trendMult = 0.4;   // direct conflict — signal survives, heavily damped
        } else {
          trendMult = 0.7;   // trend unknown/neutral — moderate damping
        }

        const direction = isBullRegime ? 'buy' : 'sell';
        const finalConf = regimeConf * 0.8 * trendMult;
        const agreementLabel = trendMult === 1.0 ? 'aligned' : trendMult === 0.4 ? 'conflict' : 'partial';

        return {
          direction,
          confidence: finalConf,
          reason: `Regime: ${regime.currentRegime} + Trend: ${trend || 'unknown'} [${agreementLabel}]`,
          signalData: regime
        };
      }
    });

    // ─── 8. OGZ TPO Strategy ───
    // FIX 2026-03-19: Self-contained — owns its TPO integration internally
    const tpoIntegrationModule = this.tpoIntegration;
    const minCandlesTPO = this.minCandlesTPO;
    const ogzTpoConfig = this.ogzTpoConfig;
    if (shouldRegister('OGZTPO')) this.strategies.push({
      name: 'OGZTPO',  // OGZ TPO strategy
      evaluate: (ctx) => {
        // Self-contained: compute TPO signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesTPO) return null;

        const latestCandle = candles[candles.length - 1];
        const scopedTpoIntegration = this._getSymbolStrategyModule(
          'OGZTPO',
          ctx.extras?.symbol,
          tpoIntegrationModule,
          () => new OgzTpoIntegration(ogzTpoConfig)
        );
        const tpoBarTimestamp = latestCandle.etime
          ?? latestCandle.timestamp
          ?? latestCandle.time
          ?? latestCandle.t
          ?? candles.length - 1;
        const tpo = scopedTpoIntegration.update({
          ...latestCandle,
          t: tpoBarTimestamp,
        });

        if (!tpo || !tpo.signal) return null;

        const action = tpo.signal.action;
        const strength = tpo.signal.strength || 0;

        const direction = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : null;
        if (!direction) return null;

        // DIAGNOSTIC: Log TPO signal computation
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] OGZTPO computed: dir=${direction} strength=${(strength * 100).toFixed(1)}%`);
        }

        return {
          direction,
          confidence: Math.min(1.0, strength * ogzTpoConfig.strengthConfidenceMultiplier),
          reason: `OGZ TPO ${tpo.signal.zone} (strength: ${(strength * 100).toFixed(1)}%)`,
          signalData: tpo.signal,
          // TPO provides its own levels
          overrideLevels: tpo.signal.levels ? {
            stopLoss: tpo.signal.levels.stopLoss,
            takeProfit: tpo.signal.levels.takeProfit,
          } : null
        };
      }
    });

    // ─── 9. Opening Range Breakout Strategy ───
    // ICT-style session-based strategy with FVG entry
    const orbInstance = this.orbStrategy;
    if (shouldRegister('OpeningRangeBreakout')) this.strategies.push({
      name: 'OpeningRangeBreakout',
      evaluate: (ctx) => {
        // ORB needs the latest candle from priceHistory
        const candles = ctx.priceHistory;
        if (!candles || candles.length === 0) return null;

        const latestCandle = candles[candles.length - 1];
        const orbSymbol = this._resolveStrategyStateSymbol(ctx, latestCandle);
        const scopedOrb = this._getSymbolStrategyModule(
          'OpeningRangeBreakout',
          orbSymbol,
          orbInstance,
          () => new OpeningRangeBreakout(this.openingRangeBreakoutConfig)
        );
        const signal = scopedOrb.update(latestCandle);

        // DIAGNOSTIC: Log every call
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] OpeningRangeBreakout: signal=${signal ? JSON.stringify({dir: signal.direction, conf: signal.confidence}) : 'null'} candle_time=${latestCandle?.time || 'unknown'}`);
        }

        if (!signal) return null;

        // Consume the signal so it doesn't fire again
        scopedOrb.consumeSignal();

        return {
          direction: signal.direction,
          confidence: signal.confidence,
          reason: signal.reason,
          signalData: signal,
          exitContractHint: signal.exitContractHint,
          // Pass order type hint
          orderTypeHint: signal.orderType,
          limitPrice: signal.limitPrice,
        };
      }
    });

    // ─── 10. Smart Money Sweep Strategy (Fabio + Marco Composite) ───
    // Self-contained: computes VP, IVB, sweep detection, candle classification internally
    const smartMoneySweepModule = this.smartMoneySweepModule;
    const diagSMS = this.diagFunnel.SmartMoneySweep;
    if (shouldRegister('SmartMoneySweep')) this.strategies.push({
      name: 'SmartMoneySweep',
      evaluate: (ctx) => {
        diagSMS.evaluated++;
        const candles = ctx.priceHistory;
        if (!candles || candles.length < 50) return null;

        const latestCandle = candles[candles.length - 1];
        const scopedSmartMoneySweep = this._getSymbolStrategyModule(
          'SmartMoneySweep',
          ctx.extras?.symbol,
          smartMoneySweepModule,
          () => new SmartMoneySweep(
            ConfigLoader.get('strategies.SmartMoneySweep') || {}
          )
        );
        const sig = scopedSmartMoneySweep.update(latestCandle, candles);

        if (sig) diagSMS.moduleNonNull++;

        if (process.env.STRATEGY_DIAG === 'true' && sig) {
          console.log(`[DIAG] SmartMoneySweep: dir=${sig.direction} conf=${(sig.confidence||0).toFixed(2)} conds=${sig.conditionsMet}`);
        }
        if (!sig || !sig.direction) return null;
        diagSMS.nonNeutral++;

        let conf = sig.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;
        diagSMS.passedConf++;

        // Fib level boost (same pattern as other strategies)
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < 0.5) {
          const boost = fib.isGoldenZone ? 0.15 : 0.10;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` + Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
        }

        return {
          direction: sig.direction,
          confidence: conf,
          reason: sig.reason + fibBoost,
          signalData: sig.signalData,
          overrideLevels: sig.overrideLevels,
        };
      }
    });

    const noWickModule = this.noWickModule;
    if (shouldRegister('NoWickImbalance')) this.strategies.push({
      name: 'NoWickImbalance',
      evaluate: (ctx) => {
        try {
          return noWickModule.evaluate(ctx);
        } catch (e) {
          if (e.message && e.message.startsWith('[STRATEGY-SCOPE]')) {
            throw e;
          }
          return this._recordStrategyUnavailable({
            strategyName: 'NoWickImbalance',
            source: 'NoWickImbalance.evaluate',
            reason: 'strategy_exception',
            error: e,
            ctx,
          });
        }
      }
    });

    const donchianBreakoutModule = this.donchianBreakoutModule;
    if (shouldRegister('DonchianBreakout')) this.strategies.push({
      name: 'DonchianBreakout',
      evaluate: (ctx) => this._getSymbolStrategyModule(
        'DonchianBreakout',
        ctx.extras?.symbol,
        donchianBreakoutModule,
        () => new DonchianBreakout(
          ConfigLoader.get('strategies.DonchianBreakout') || {}
        )
      ).evaluate(ctx)
    });

    if (shouldRegister('PropSafeEMAPullback')) {
      const propSafeEmaPullbackModule = new PropSafeEMAPullback(
        ConfigLoader.get('strategies.PropSafeEMAPullback')
      );
      this.strategies.push({
        name: 'PropSafeEMAPullback',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'PropSafeEMAPullback',
          ctx.extras?.symbol,
          propSafeEmaPullbackModule,
          () => new PropSafeEMAPullback(
            ConfigLoader.get('strategies.PropSafeEMAPullback')
          )
        ).evaluate(ctx)
      });
    }

    if (shouldRegister('EMATrendRetest')) {
      const emaTrendRetestModule = new EMATrendRetest(
        ConfigLoader.get('strategies.EMATrendRetest')
      );
      this.strategies.push({
        name: 'EMATrendRetest',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'EMATrendRetest',
          ctx.extras?.symbol,
          emaTrendRetestModule,
          () => new EMATrendRetest(
            ConfigLoader.get('strategies.EMATrendRetest')
          )
        ).evaluate(ctx)
      });
    }

    if (shouldRegister('RSI2MeanReversion')) {
      const rsi2MeanReversionModule = new RSI2MeanReversion(
        ConfigLoader.get('strategies.RSI2MeanReversion')
      );
      this.strategies.push({
        name: 'RSI2MeanReversion',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'RSI2MeanReversion',
          ctx.extras?.symbol,
          rsi2MeanReversionModule,
          () => new RSI2MeanReversion(
            ConfigLoader.get('strategies.RSI2MeanReversion')
          )
        ).evaluate(ctx)
      });
    }

    if (shouldRegister('TimeSeriesMomentum')) {
      const timeSeriesMomentumModule = new TimeSeriesMomentum(
        ConfigLoader.get('strategies.TimeSeriesMomentum')
      );
      this.strategies.push({
        name: 'TimeSeriesMomentum',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'TimeSeriesMomentum',
          ctx.extras?.symbol,
          timeSeriesMomentumModule,
          () => new TimeSeriesMomentum(
            ConfigLoader.get('strategies.TimeSeriesMomentum')
          )
        ).evaluate(ctx)
      });
    }

    // Apply pipeline toggles - filter strategies based on env vars
    this._applyPipelineToggles();
  }

  /**
   * Filter registered strategies based on pipeline toggles.
   * Called once at end of _registerBuiltinStrategies().
   * Logs exactly which strategies are active/disabled - no silent failures.
   */
  _applyPipelineToggles() {
    const pipeline = ConfigLoader.get('pipeline') || {};
    const toggleMap = {
      'RSI': pipeline.enableRSI,
      'MADynamicSR': pipeline.enableMADynamicSR,
      'EMASMACrossover': pipeline.enableEMACrossover,
      'LiquiditySweep': pipeline.enableLiquiditySweep,
      'CandlePattern': pipeline.enableCandlePattern,
      'BreakRetest': pipeline.enableBreakRetest,
      'MarketRegime': pipeline.enableMarketRegime,
      'OGZTPO': pipeline.enableOGZTPO,
      'OpeningRangeBreakout': pipeline.enableOpeningRangeBreakout,
      'SmartMoneySweep': pipeline.enableSmartMoneySweep,
      'NoWickImbalance': pipeline.enableNoWickImbalance,
      'DonchianBreakout': pipeline.enableDonchianBreakout,
      'PropSafeEMAPullback': pipeline.enablePropSafeEMAPullback,
      'EMATrendRetest': pipeline.enableEMATrendRetest,
      'RSI2MeanReversion': pipeline.enableRSI2MeanReversion,
      'TimeSeriesMomentum': pipeline.enableTimeSeriesMomentum,
    };
    const before = this.strategies.length;
    const disabled = [];

    this.strategies = this.strategies.filter(s => {
      const toggle = toggleMap[s.name];
      if (typeof toggle !== 'boolean') {
        throw new Error(`[PIPELINE] ${s.name} pipeline toggle must be boolean; got ${toggle}. Check config path pipeline.${s.name}`);
      }
      if (toggle === false) {
        if (this.soloStrategies && this.soloStrategies.includes(s.name.toLowerCase())) {
          throw new Error(`[STRATEGY_SOLO_FILTER] ${s.name} was requested but its pipeline toggle is disabled; enable it in config or remove it from strategies.soloFilter`);
        }
        disabled.push(s.name);
        return false;
      }
      return true;
    });

    if (disabled.length > 0) {
      console.log(`[PIPELINE] Disabled ${disabled.length} strategies: ${disabled.join(', ')}`);
    }
    console.log(`[PIPELINE] Active strategies: ${this.strategies.map(s => s.name).join(', ')} (${this.strategies.length}/${before})`);
  }

  /**
   * Main entry point — evaluate all strategies independently, pick winner.
   * 
   * @param {Object} indicators - From IndicatorEngine.getSnapshot()
   * @param {Array} patterns - From EnhancedPatternRecognition.analyzePatterns()
   * @param {Object} regime - From MarketRegimeDetector.analyzeMarket()
   * @param {Array} priceHistory - Candle history
   * @param {Object} extras - { emaCrossoverSignal, maDynamicSRSignal, liquiditySweepSignal, mtfAdapter, tpoResult, price }
   * @returns {Object} { action, direction, confidence, winnerStrategy, exitContract, sizingMultiplier, confluence, allResults }
   */
  evaluate(indicators, patterns = [], regime = null, priceHistory = [], extras = {}) {
    this.evalCount++;

    const ctx = { indicators, patterns, regime, priceHistory, extras };
    const unavailableStrategies = [];
    this.currentEvaluationUnavailableStrategies = unavailableStrategies;
    this._recordLatestCandleTimeframeAbsence(ctx);

    // Narrator: pattern-spotted event. narrator is the module-cached
    // singleton; disabled path is property-access + branch-taken (zero
    // allocation). Try/catch only entered when enabled AND patterns
    // present so a formatter throw on unexpected shape can't interrupt
    // evaluate().
    if (narrator.enabled && Array.isArray(patterns) && patterns.length > 0) {
      try {
        narrator.patternSpotted(patterns);
      } catch (e) {
        console.warn('[Narrator] patternSpotted hook failed:', e && e.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHANGE 2026-02-23: Volume Profile Chop Filter (Fabio Valentino)
    // Only trend follow when OUT OF BALANCE (price outside value area)
    // When BALANCED (inside VA) = choppy market, trend strategies bleed fees
    // ═══════════════════════════════════════════════════════════════════════
    // DISABLED 2026-03-09: VP chop filter was one of 6 stacked gates killing signals
    // MADynamicSR now has its own slope/extension filters. VP chop filter is redundant.
    // TODO: Full gate audit needed — one filter, one job, no overlap.
    // const TREND_STRATEGIES = ['MADynamicSR', 'EMASMACrossover', 'MarketRegime'];
    let vpMarketState = null;
    let skipTrendStrategies = false;  // Always false now — strategies handle their own filtering

    // ─── Step 1: Run ALL strategies independently ───
    const results = [];
    const filteredResults = [];
    const noSignalStrategies = [];
    const thrownStrategies = [];
    const contractConfidenceDropped = [];
    for (const strategy of this.strategies) {
      // DISABLED 2026-03-09: VP chop filter removed — strategies handle own filtering
      // if (skipTrendStrategies && TREND_STRATEGIES.includes(strategy.name)) {
      //   continue;
      // }

      try {
        const result = strategy.evaluate(ctx);
        if (isStrategyUnavailableRecord(result)) {
          noSignalStrategies.push(`${strategy.name}:unavailable:${result.reason}`);
          continue;
        }
        if (!result || !result.direction) {
          noSignalStrategies.push(strategy.name);
          continue;
        }
        if (result && result.direction) {
          const confidence = assertBaseConfidence01(result.confidence, `${strategy.name}.confidence`);
          if (confidence <= 0) {
            noSignalStrategies.push(`${strategy.name}:conf<=0`);
            continue;
          }
          const signalTimeframe = resolveSignalTimeframe(result, ctx, strategy.name);
          const contractMinConfidence = getContractMinConfidence(strategy.name, signalTimeframe);
          if (contractMinConfidence != null && confidence < contractMinConfidence) {
            const rejectedCandidate = {
              ...result,
              confidence,
              rankingScore: confidence,
              strategyName: strategy.name,
              timeframe: signalTimeframe,
              decisionAttribution: createDecisionAttribution(strategy.name, confidence),
              learningSnapshot: buildLearningSnapshot({ ...result, strategyName: strategy.name }, ctx),
              rejectedBy: 'exit_contract_confidence_gate',
              rejectReason: `confidence ${(confidence * 100).toFixed(1)}% below exit contract min ${(contractMinConfidence * 100).toFixed(1)}%`,
            };
            addDecisionContributor(rejectedCandidate, {
              name: 'exit_contract_confidence_gate',
              type: 'gate',
              minConfidence: contractMinConfidence,
              actualConfidence: confidence,
              timeframe: signalTimeframe,
              passed: false,
            });
            filteredResults.push(rejectedCandidate);
            contractConfidenceDropped.push(`${strategy.name}:${result.direction}:${(confidence * 100).toFixed(1)}%<min${(contractMinConfidence * 100).toFixed(1)}%`);
            if (process.env.STRATEGY_DIAG === 'true' || this.evalCount % 200 === 0) {
              console.log(`[FILTER:contract-confidence] Skipped ${strategy.name} — confidence ${(confidence * 100).toFixed(1)}% below exit contract min ${(contractMinConfidence * 100).toFixed(1)}%`);
            }
            continue;
          }
          const candidate = {
            ...result,
            confidence,
            rankingScore: confidence,
            strategyName: strategy.name,
            timeframe: signalTimeframe,
            decisionAttribution: createDecisionAttribution(strategy.name, confidence),
            learningSnapshot: buildLearningSnapshot({ ...result, strategyName: strategy.name }, ctx),
          };
          if (contractMinConfidence != null) {
            addDecisionContributor(candidate, {
              name: 'exit_contract_confidence_gate',
              type: 'gate',
              minConfidence: contractMinConfidence,
              actualConfidence: confidence,
              timeframe: signalTimeframe,
              passed: true,
            });
          }
          const structuralPriceBasis = extras.price ?? (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : null);
          const structuralValidation = validateStructuralLevelOverride(candidate, structuralPriceBasis);
          if (!structuralValidation.ok) {
            addDecisionContributor(candidate, {
              name: 'exit_geometry',
              type: 'gate',
              passed: false,
              reason: structuralValidation.reason,
              timeframe: signalTimeframe,
            });
            filteredResults.push({
              ...candidate,
              rejectedBy: 'exit_geometry',
              rejectReason: structuralValidation.reason,
            });
            console.warn(`[EXIT-GEOMETRY] Rejected ${strategy.name}: ${structuralValidation.reason}`);
            continue;
          }
          if (structuralValidation.signalOverrides && Object.keys(structuralValidation.signalOverrides).length > 0) {
            candidate.structuralExitOverrides = structuralValidation.signalOverrides;
            candidate.structuralExitLevels = {
              entryPrice: structuralValidation.entryPrice,
              stopLoss: structuralValidation.stopLossLevel,
              takeProfit: structuralValidation.takeProfitLevel,
            };
            addDecisionContributor(candidate, {
              name: 'exit_geometry',
              type: 'gate',
              passed: true,
              timeframe: signalTimeframe,
            });
          }
          const fanoutValidation = validateEntryFanout(candidate, structuralPriceBasis);
          if (!fanoutValidation.ok) {
            addDecisionContributor(candidate, {
              name: 'entry_fanout_geometry',
              type: 'gate',
              passed: false,
              reason: fanoutValidation.reason,
              timeframe: signalTimeframe,
            });
            filteredResults.push({
              ...candidate,
              rejectedBy: 'entry_fanout_geometry',
              rejectReason: fanoutValidation.reason,
            });
            console.warn(`[ENTRY-FANOUT] Rejected ${strategy.name}: ${fanoutValidation.reason}`);
            continue;
          }
          if (fanoutValidation.entryFanout.length > 0) {
            candidate.entryFanout = fanoutValidation.entryFanout;
            addDecisionContributor(candidate, {
              name: 'entry_fanout_geometry',
              type: 'gate',
              passed: true,
              fanoutCount: fanoutValidation.entryFanout.length,
              timeframe: signalTimeframe,
            });
          }
          this._applyStrategyMtfConfluence(candidate, ctx);
          results.push(candidate);
        }
      } catch (err) {
        if (err.message && (
          err.message.startsWith('[EXIT-CONTRACT]') ||
          err.message.startsWith('[STRATEGY-SCOPE]') ||
          err.message.startsWith('[TIMEFRAME-CONTRACT]')
        )) {
          throw err;
        }
        const absence = this._recordStrategyUnavailable({
          strategyName: strategy.name,
          source: 'strategy.evaluate',
          reason: 'strategy_exception',
          error: err,
          ctx,
        });
        thrownStrategies.push(`${absence.strategyName}:${absence.reason}:${absence.errorMessage}`);
      }
    }

    const rawStrategyResults = results.map(r => ({
      strategyName: r.strategyName,
      direction: r.direction,
      timeframe: r.timeframe,
      confidence: r.confidence,
      rankingScore: r.rankingScore,
    }));
    if (process.env.STRATEGY_DIAG === 'true' && rawStrategyResults.length > 0) {
      const rawList = rawStrategyResults
        .slice(0, 8)
        .map(r => `${r.strategyName}:${r.direction}:${(r.confidence * 100).toFixed(1)}%`)
        .join(',');
      console.log(`[ORCH][RAW_CANDIDATES] eval=${this.evalCount} count=${rawStrategyResults.length} ${rawList}`);
    }
    if (process.env.STRATEGY_DIAG === 'true' && contractConfidenceDropped.length > 0) {
      console.log(`[ORCH][FILTER_DROP] eval=${this.evalCount} filter=contract-confidence dropped=${contractConfidenceDropped.join(',')}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ATR PRE-ENTRY FILTER — Data-driven threshold from backtest analysis
    // FIX 2026-03-13: 0.40% killed 74% of 15m BTC candles. Lowered to 0.15%
    // Original: Winners at 0.58%, losers at 0.34%, midpoint 0.40%
    // ═══════════════════════════════════════════════════════════════════════
    // CRIT-09: Pre-money fail-loud on missing price. Previously
    // `extras.price || (priceHistory[last]?.c ?? 0)` silently degraded
    // to filterPrice=0, which short-circuited the ATR filter (gate
    // `filterATRpct > 0`) and let strategies fire into dead-market
    // state. Now: switch to `??` to distinguish "missing" from
    // "explicit zero", then halt all candidates if price is unusable.
    const filterPrice = extras.price ?? (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : null);
    if (!Number.isFinite(filterPrice) || filterPrice <= 0) {
      console.warn('[FILTER:atr] HALT — no valid price (extras.price + priceHistory both unusable). Clearing all candidates.');
      for (const r of results) {
        addDecisionContributor(r, {
          name: 'atr_pre_entry_filter',
          type: 'gate',
          enabled: true,
          passed: false,
          reason: 'invalid_price',
        });
        filteredResults.push({
          ...r,
          rejectedBy: 'atr_pre_entry_filter',
          rejectReason: 'ATR filter could not evaluate because price was invalid',
        });
      }
      results.length = 0;
    }
    // CRIT-10: Distinguish missing ATR from genuine zero. Previously
    // `indicators?.atr || 0` silently turned a missing/undefined ATR
    // into 0, then the gate at `filterATRpct > 0` skipped the filter
    // — invisible bypass. Now: `??` preserves the "missing" semantic,
    // and we emit a warning so the bypass is observable. (Asymmetric
    // with CRIT-09: missing price = catastrophic halt; missing ATR =
    // benign warmup edge, log + skip.)
    const filterATR = indicators?.atr ?? null;
    if (filterATR === null) {
      console.warn('[FILTER:atr] ATR unavailable — filter cannot evaluate (likely warmup or upstream gap). Skipping ATR gate.');
    }
    const hasFiniteFilterAtr = Number.isFinite(filterATR);
    const filterATRpct = (hasFiniteFilterAtr && filterPrice > 0) ? (filterATR / filterPrice) * 100 : 0;

    // ATR filter: Per-strategy threshold via effective exitContracts.{strategy}.atrMinPercent
    // null = fall back to global filters.atrMinPercent (zero behavior change default)
    const atrFilterEnabled = ConfigLoader.get('filters.atrEnabled');
    const globalAtrMin = ConfigLoader.get('filters.atrMinPercent');
    const atrDropped = [];
    if (atrFilterEnabled && filterATRpct > 0 && results.length > 0) {
      for (let i = results.length - 1; i >= 0; i--) {
        const r = results[i];
        const contractAtrMin = getContractAtrMinPercent(r.strategyName, r.timeframe);
        const threshold = contractAtrMin.value != null ? contractAtrMin.value : globalAtrMin;
        if (filterATRpct < threshold) {
          addDecisionContributor(r, {
            name: 'atr_pre_entry_filter',
            type: 'gate',
            atrPercent: filterATRpct,
            threshold,
            thresholdSource: contractAtrMin.value != null ? contractAtrMin.source : 'global',
            timeframe: r.timeframe || null,
            passed: false,
          });
          filteredResults.push({
            ...r,
            rejectedBy: 'atr_pre_entry_filter',
            rejectReason: `ATR ${filterATRpct.toFixed(3)}% below ${threshold}%`,
          });
          atrDropped.push(`${r.strategyName}:${r.direction}:${(r.confidence * 100).toFixed(1)}%<atr${threshold}%`);
          if (process.env.STRATEGY_DIAG === 'true' || this.evalCount % 200 === 0) {
            console.log(`[FILTER:atr] Skipped ${r.strategyName} — ATR ${filterATRpct.toFixed(3)}% below ${threshold}% (${contractAtrMin.value != null ? contractAtrMin.source : 'global'})`);
          }
          results.splice(i, 1);
        } else {
          addDecisionContributor(r, {
            name: 'atr_pre_entry_filter',
            type: 'gate',
            atrPercent: filterATRpct,
            threshold,
            thresholdSource: contractAtrMin.value != null ? contractAtrMin.source : 'global',
            timeframe: r.timeframe || null,
            passed: true,
          });
        }
      }
    } else if (atrFilterEnabled && results.length > 0) {
      for (const r of results) {
        addDecisionContributor(r, {
          name: 'atr_pre_entry_filter',
          type: 'gate',
          enabled: true,
          atrPercent: filterATRpct,
          passed: null,
          reason: filterATR === null ? 'atr_unavailable' : (filterATR === 0 ? 'atr_zero' : 'atr_percent_unavailable'),
        });
      }
    }
    if (process.env.STRATEGY_DIAG === 'true' && atrDropped.length > 0) {
      console.log(`[ORCH][FILTER_DROP] eval=${this.evalCount} filter=atr atrPct=${filterATRpct.toFixed(3)} dropped=${atrDropped.join(',')}`);
    }

    // ─── Step 2: Sort by ranking score (highest first) ───
    results.sort((a, b) => b.rankingScore - a.rankingScore);

    // ─── Step 2.5: Regime-based strategy boosting ───
    // FIX 2026-04-05: Read from ConfigLoader for matrix sweep optimization
    // Multipliers, not gates. Losers still fire, just sized smaller.
    // HIGH-23: throw if regimeBoosts config missing or non-object.
    // ConfigLoader.js:108 already defines this as an object, so the throw
    // only fires on genuine config breakage. Per Rule #1 — refusing to fall
    // back to {} which silently disables boosts.
    const regimeBoosts = ConfigLoader.get('regimeBoosts');
    if (regimeBoosts == null || typeof regimeBoosts !== 'object') {
      throw new Error(`[HIGH-23] ConfigLoader.regimeBoosts must be an object (got ${typeof regimeBoosts})`);
    }

    // Classify regime name to category (trending_up/trending_down → trending, etc.)
    const rawRegime = regime?.currentRegime?.toLowerCase() || 'unknown';
    // HIGH-04: throw when regime object is present but confidence is non-finite
    // (RegimeDetector regression). The ?? 0 below remains for the case where
    // regime itself is null/undefined (legitimate 'no regime detected' signal,
    // common during warmup) — that semantically means "no regime boosting" and
    // is distinct from "regime detector returned a broken object."
    if (regime != null && !Number.isFinite(regime.confidence)) {
      throw new Error(`[HIGH-04] regime.confidence non-finite (currentRegime=${regime.currentRegime}, got ${regime.confidence}) — RegimeDetector regression`);
    }
    const regimeConfidence = regime?.confidence ?? 0;
    let regimeType = 'unknown';
    if (regimeConfidence >= 0.25) {
      if (rawRegime.includes('bull') || rawRegime.includes('uptrend') ||
          rawRegime.includes('bear') || rawRegime.includes('downtrend') ||
          rawRegime.includes('trending') || rawRegime.includes('momentum')) {
        regimeType = 'trending';
      } else if (rawRegime.includes('rang') || rawRegime.includes('sideways') ||
                 rawRegime.includes('consolidat') || rawRegime.includes('accumulation')) {
        regimeType = 'ranging';
      } else if (rawRegime.includes('volat') || rawRegime.includes('chaos') ||
                 rawRegime.includes('distribution') || rawRegime.includes('crash')) {
        regimeType = 'volatile';
      } else if (rawRegime.includes('dead') || rawRegime.includes('quiet') ||
                 rawRegime.includes('low_vol') || rawRegime.includes('flat')) {
        regimeType = 'dead';
      }
    }

    const boosts = regimeBoosts[regimeType] || {};
    const regimePositionMultiplier = boosts._positionSizeMultiplier || 1.0;

    const trendRegimeGate = getTrendRegimeGateConfig();
    const trendRegimeDropped = [];
    if (trendRegimeGate.enabled && results.length > 0) {
      const trendRegimePassed = regimeType === 'trending' && regimeConfidence >= trendRegimeGate.minConfidence;
      for (let i = results.length - 1; i >= 0; i -= 1) {
        const result = results[i];
        if (!trendRegimeGate.strategies.has(result.strategyName)) continue;
        addDecisionContributor(result, {
          name: 'trend_regime_entry_eligibility',
          type: 'gate',
          regimeType,
          rawRegime,
          regimeConfidence,
          minConfidence: trendRegimeGate.minConfidence,
          passed: trendRegimePassed,
        });
        if (trendRegimePassed) continue;
        filteredResults.push({
          ...result,
          rejectedBy: 'trend_regime_entry_eligibility',
          rejectReason: `trend strategy requires trending regime; got ${regimeType}`,
        });
        trendRegimeDropped.push(`${result.strategyName}:${result.direction}:${regimeType}`);
        results.splice(i, 1);
      }
      if (process.env.STRATEGY_DIAG === 'true' && trendRegimeDropped.length > 0) {
        console.log(`[ORCH][FILTER_DROP] eval=${this.evalCount} filter=trend-regime dropped=${trendRegimeDropped.join(',')}`);
      }
    }

    if (Object.keys(boosts).length > 0 && results.length > 0) {
      for (const result of results) {
        const boost = boosts[result.strategyName] || 1.0;
        if (boost !== 1.0) {
          recordRankingScoreChange(
            result,
            result.rankingScore * boost,
            `${result.strategyName}.regimeRankingScore`,
            {
              name: 'regime_boost',
              type: 'multiplier',
              regimeType,
              rawRegime,
              regimeConfidence,
              positionMultiplier: regimePositionMultiplier,
              configuredMultiplier: boost,
            }
          );
        }
      }
      // Re-sort after boosting
      results.sort((a, b) => b.rankingScore - a.rankingScore);
    }

    // ─── Step 2.6: Volume Profile-based strategy boosting ───
    // FIX 2026-04-05: Auction Market Theory - boost based on price position
    // HIGH-24: same halt-class throw as HIGH-23. ConfigLoader.js:146 always
    // provides volumeProfileBoosts as an object.
    const volumeProfileBoosts = ConfigLoader.get('volumeProfileBoosts');
    if (volumeProfileBoosts == null || typeof volumeProfileBoosts !== 'object') {
      throw new Error(`[HIGH-24] ConfigLoader.volumeProfileBoosts must be an object (got ${typeof volumeProfileBoosts})`);
    }
    const volumeProfile = extras.volumeProfile;
    // FIX MIRROR-CRIT-09-VP: mirror of CRIT-09 hardening at line 790. Prior code used
    // `||` which collapsed genuine zero price; VP zone math downstream produced
    // nonsense distance and zone classification when price was 0.
    const currentPrice = extras.price ?? (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : null);
    if (currentPrice != null && (!Number.isFinite(currentPrice) || currentPrice <= 0)) {
      console.warn('[FILTER:vp] currentPrice non-positive — VP zone boosting will be skipped');
    }

    if (volumeProfile && Number.isFinite(currentPrice) && currentPrice > 0 && Object.keys(volumeProfileBoosts).length > 0 && results.length > 0) {
      const vpProfile = typeof volumeProfile.getProfile === 'function' ? volumeProfile.getProfile() : volumeProfile;

      if (vpProfile && vpProfile.poc && vpProfile.vah && vpProfile.val) {
        // Classify price position relative to VP levels
        let vpZone = 'inValueArea';  // Default
        const pocThreshold = 0.002;  // Within 0.2% of POC = "at POC"
        const lvnProximity = 0.003;  // Within 0.3% of nearest LVN = "in LVN"

        const priceToPocPct = Math.abs(currentPrice - vpProfile.poc) / vpProfile.poc;

        if (currentPrice > vpProfile.vah) {
          vpZone = 'aboveVAH';
        } else if (currentPrice < vpProfile.val) {
          vpZone = 'belowVAL';
        } else if (priceToPocPct <= pocThreshold) {
          vpZone = 'atPOC';
        } else {
          // Check if near an LVN
          const lvns = vpProfile.lvns || [];
          for (const lvn of lvns) {
            const distPct = Math.abs(currentPrice - lvn.price) / currentPrice;
            if (distPct <= lvnProximity) {
              vpZone = 'inLVN';
              break;
            }
          }
        }

        const vpBoosts = volumeProfileBoosts[vpZone] || {};

        if (Object.keys(vpBoosts).length > 0) {
          for (const result of results) {
            // Check for _allStrategies (used in inLVN)
            const boost = vpBoosts._allStrategies || vpBoosts[result.strategyName] || 1.0;
            if (boost !== 1.0) {
              recordRankingScoreChange(
                result,
                result.rankingScore * boost,
                `${result.strategyName}.volumeProfileRankingScore`,
                {
                  name: 'volume_profile_boost',
                  type: 'multiplier',
                  zone: vpZone,
                  currentPrice,
                  poc: vpProfile.poc,
                  vah: vpProfile.vah,
                  val: vpProfile.val,
                  configuredMultiplier: boost,
                }
              );
            }
          }
          // Re-sort after VP boosting
          results.sort((a, b) => b.rankingScore - a.rankingScore);
          console.log(`📊 [VP] Zone: ${vpZone} | POC: ${vpProfile.poc?.toFixed(0)} | VAH: ${vpProfile.vah?.toFixed(0)} | VAL: ${vpProfile.val?.toFixed(0)}`);
        }
      }
    }

    if (this._shouldObserveMtfConfluence()) {
      this._getMtfConfluenceForEvaluation(ctx);
    }
    this._applyMtfConfluenceBooster(results, ctx);
    const mtfConfluenceSnapshot = this._getCachedMtfConfluenceSnapshot();

    // DEBUG 2026-03-06: Why is confidence 0?
    if (results.length > 0) {
      console.log(`[ORCH] ${results.length} strategies returned signals:`);
      results.slice(0, 5).forEach(r => console.log(`   - ${r.strategyName}: ${(r.confidence * 100).toFixed(1)}% ${r.direction}`));
    } else {
      if (process.env.STRATEGY_DIAG === 'true' && rawStrategyResults.length > 0) {
        const rawList = rawStrategyResults
          .slice(0, 8)
          .map(r => `${r.strategyName}:${r.direction}:${(r.confidence * 100).toFixed(1)}%`)
          .join(',');
        console.log(`[ORCH][FILTER_EMPTY] eval=${this.evalCount} rawCandidates=${rawStrategyResults.length} afterFilters=0 raw=${rawList}`);
      }
      const unavailableCount = unavailableStrategies.length;
      const emptyReason = unavailableCount > 0
        ? `${unavailableCount} strategy/service unavailable; remaining strategies returned null or conf=0`
        : 'all returned null or conf=0';
      console.log(`[ORCH] 0 strategies returned signals (${emptyReason})`);
      this._logNoSignalSummary(ctx, noSignalStrategies, thrownStrategies);
    }

    // Narrator: strategy-eval event. Uses module-cached singleton.
    // Disabled path: property-access + branch-taken, zero allocation.
    if (narrator.enabled && results.length > 0) {
      try {
        narrator.strategyEval(results, results[0]);
      } catch (e) {
        console.warn('[Narrator] strategyEval hook failed:', e && e.message);
      }
    }

    const publicResults = results.map(publicResult);
    const publicFilteredResults = filteredResults.map(publicResult);
    const publicUnavailableStrategies = unavailableStrategies.map(item => ({ ...item }));

    // ─── Step 3: Filter by ranking score threshold ───
    // Regime/VP multipliers historically affected eligibility before winner
    // selection. Public/risk/exit confidence remains bounded by capping that
    // boosted score to 1.0 at the orchestrator boundary.
    const qualified = results.filter(r => r.rankingScore >= this.minStrategyConfidence);

    if (qualified.length === 0) {
      const reasons = results.length > 0
        ? [`No strategy above ${(this.minStrategyConfidence * 100).toFixed(0)}% ranking threshold (best: ${results[0]?.strategyName} confidence ${(boundedConfidenceFromRankingScore(results[0]?.rankingScore, `${results[0]?.strategyName}.bestRankingScore`) * 100).toFixed(0)}%)`]
        : (publicUnavailableStrategies.length > 0
          ? [`No executable strategy signals; unavailable strategies: ${publicUnavailableStrategies.map(item => `${item.strategyName}:${item.reason}`).join(', ')}`]
          : ['No signals detected']);
      this.lastEvaluation = {
        action: 'HOLD',
        results: publicResults,
        qualified: [],
        unavailableStrategies: publicUnavailableStrategies,
      };
      return {
        action: 'HOLD',
        direction: 'hold',
        confidence: 0,
        winnerStrategy: null,
        exitContract: null,
        sizingMultiplier: 1.0,
        confluence: { count: 0, strategies: [] },
        mtfConfluenceSnapshot,
        allResults: publicResults,
        filteredResults: publicFilteredResults,
        unavailableStrategies: publicUnavailableStrategies,
        reasons
      };
    }

    // ─── Step 4: Winner = highest ranking score among bounded candidates ───
    const winner = qualified[0];
    const publicWinnerConfidence = boundedConfidenceFromRankingScore(winner.rankingScore, `${winner.strategyName}.winnerRankingScore`);
    assertRankingScore(winner.rankingScore, `${winner.strategyName}.winnerRankingScore`);

    // ─── Step 5: Count confluence (how many strategies agree on direction) ───
    const agreeing = qualified.filter(r => r.direction === winner.direction);
    const confluenceCount = agreeing.length;

    // Check minimum confluence requirement
    if (confluenceCount < this.minConfluenceCount) {
      this.lastEvaluation = {
        action: 'HOLD',
        results: publicResults,
        qualified: qualified.map(publicResult),
        winner: publicResult(winner),
        confluenceCount,
        unavailableStrategies: publicUnavailableStrategies,
      };
      return {
        action: 'HOLD',
        direction: 'hold',
        confidence: publicWinnerConfidence * 100,
        winnerStrategy: winner.strategyName,
        exitContract: null,
        sizingMultiplier: 1.0,
        confluence: { count: confluenceCount, strategies: agreeing.map(r => r.strategyName) },
        mtfConfluenceSnapshot,
        allResults: publicResults,
        filteredResults: publicFilteredResults,
        unavailableStrategies: publicUnavailableStrategies,
        reasons: [`Need ${this.minConfluenceCount} confluent signals, got ${confluenceCount}`]
      };
    }

    // ─── Step 6: Position sizing multiplier from confluence × regime ───
    const cappedCount = Math.min(confluenceCount, 4);
    const rawSizingMultiplier = this.confluenceSizing[cappedCount] || this.confluenceSizing[4] || 2.5;
    const sizingMultiplier = rawSizingMultiplier * regimePositionMultiplier;

    // ─── Step 7: Create exit contract from winning strategy ───
    let exitContract = null;
    const ecm = getExitContractManager();
    const price = extras.price ?? (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : 0);

    // If the winning strategy provided its own levels (e.g. TPO), use them
    const signalOverrides = {};
    // DEBUG: Log winner object keys to trace overrideLevels flow
    console.log(`[EXIT-DEBUG] Winner "${winner.strategyName}" keys: ${Object.keys(winner).join(', ')}`);
    console.log(`[EXIT-DEBUG] Winner overrideLevels type: ${typeof winner.overrideLevels}, value: ${JSON.stringify(winner.overrideLevels)}`);
    const exitContractHint = winner.exitContractHint || winner.signalData?.exitContractHint;
    if (exitContractHint) {
      Object.assign(signalOverrides, normalizeExitContractHint(exitContractHint, winner.strategyName));
      const tpLog = Number.isFinite(Number(signalOverrides.takeProfitPercent))
        ? Number(signalOverrides.takeProfitPercent).toFixed(2)
        : String(signalOverrides.takeProfitPercent);
      console.log(`[EXIT-DEBUG] ${winner.strategyName} using exitContractHint SL%=${signalOverrides.stopLossPercent.toFixed(2)} TP%=${tpLog}`);
    } else if (winner.strategyName === 'OpeningRangeBreakout' && winner.overrideLevels) {
      console.warn('[EXIT-HINT] OpeningRangeBreakout overrideLevels ignored without entry-based exitContractHint');
    } else if (winner.structuralExitOverrides) {
      Object.assign(signalOverrides, winner.structuralExitOverrides);
      const stopLossLevel = winner.structuralExitLevels?.stopLoss;
      const takeProfitLevel = winner.structuralExitLevels?.takeProfit;
      // DEBUG: Log override level conversion
      console.log(`[EXIT-DEBUG] ${winner.strategyName} overrideLevels → Price=$${formatStructuralPriceForLog(price)} SL=$${formatStructuralPriceForLog(stopLossLevel)} TP=$${formatStructuralPriceForLog(takeProfitLevel)} → SL%=${signalOverrides.stopLossPercent?.toFixed(2)}% TP%=${signalOverrides.takeProfitPercent?.toFixed(2)}%`);
    } else {
      console.log(`[EXIT-DEBUG] ${winner.strategyName} NO overrideLevels — will use ConfigLoader defaults`);
    }

    // FIX 2026-02-23: Convert ATR to percentage (was passing raw $ causing inflation)
    // HIGH-15: resolve volatility from ATR/price or finite fallback volatility.
    // ATR=0 is a known flat-market reading, not missing data.
    let volPct;
    if (Number.isFinite(indicators?.atr) && Number.isFinite(price) && price > 0) {
      volPct = (indicators.atr / price * 100);
    } else if (Number.isFinite(indicators?.volatility)) {
      volPct = indicators.volatility;
    } else {
      throw new Error(`[HIGH-15] volPct unresolvable: ATR=${indicators?.atr} price=${price} volatility=${indicators?.volatility}`);
    }
    // HIGH-16: extras.timeframe now wired from TradingLoop (which pulls
    // ctx.candleTimeframe from resolvedConfig.config.broker.candleTimeframe).
    // Throw on missing/non-string instead of silent '15m' default.
    const timeframe = extras.timeframe;
    if (typeof timeframe !== 'string' || !timeframe) {
      throw new Error(`[HIGH-16] extras.timeframe missing or non-string (got ${typeof timeframe}: ${timeframe}) — TradingLoop must thread broker.candleTimeframe`);
    }
    const winnerTimeframe = normalizeTimeframeValue(winner.timeframe) || timeframe;
    const atrContractOverrides = buildAtrContractOverrides({
      indicators,
      price,
      strategyName: winner.strategyName,
    });
    if (atrContractOverrides) {
      const { atrContract, ...contractFields } = atrContractOverrides;
      Object.assign(signalOverrides, contractFields);
      addDecisionContributor(winner, {
        name: 'atr_scaled_exit_contract',
        type: 'exit_contract',
        ...atrContract,
        stopLossPercent: signalOverrides.stopLossPercent,
        trailingStopPercent: signalOverrides.trailingStopPercent,
        trailingActivation: signalOverrides.trailingActivation,
      });
    }
    exitContract = ecm.createExitContract(
      winner.strategyName,
      { ...signalOverrides, confidence: publicWinnerConfidence },
      { volatility: volPct, timeframe: winnerTimeframe }
    );
    const outputEntryFanout = Array.isArray(winner.entryFanout) && winner.entryFanout.length > 0
      ? winner.entryFanout.map((entry, index) => {
        const entrySizingMultiplier = Number.isFinite(Number(entry.sizingMultiplier)) && Number(entry.sizingMultiplier) > 0
          ? Number(entry.sizingMultiplier)
          : 1.0;
        const entryExitContract = ecm.createExitContract(
          winner.strategyName,
          { ...(entry.structuralExitOverrides || {}), confidence: publicWinnerConfidence },
          { volatility: volPct, timeframe: winnerTimeframe }
        );
        return {
          action: winner.direction === 'buy' ? 'BUY' : winner.direction === 'sell' ? 'SELL_SHORT' : 'HOLD',
          direction: entry.direction || winner.direction,
          confidence: publicWinnerConfidence * 100,
          winnerStrategy: winner.strategyName,
          timeframe: winnerTimeframe,
          exitContract: entryExitContract,
          sizingMultiplier: sizingMultiplier * entrySizingMultiplier,
          entryGroupType: entry.entryGroupType || winner.entryGroupType || null,
          entryGroupId: entry.entryGroupId || winner.entryGroupId || null,
          fanoutIndex: Number.isInteger(entry.fanoutIndex) ? entry.fanoutIndex : index,
          fanoutCount: Number.isInteger(entry.fanoutCount) ? entry.fanoutCount : winner.entryFanout.length,
          entryTriggerClass: entry.entryTriggerClass || winner.entryTriggerClass || entry.signalData?.triggerClass || null,
          reason: entry.reason || winner.reason,
          signalData: entry.signalData || null,
          overrideLevels: entry.overrideLevels || null,
        };
      })
      : [];

    // ─── Step 8: Build reasons list ───
    const reasons = [
      `Winner: ${winner.strategyName} ${winnerTimeframe} (${(publicWinnerConfidence * 100).toFixed(0)}%) — ${winner.reason}`,
      `Confluence: ${confluenceCount} strategies agree on ${winner.direction.toUpperCase()}`,
      `Sizing: ${sizingMultiplier}x base position`,
    ];
    if (outputEntryFanout.length > 0) {
      reasons.push(`  Entry fanout: ${outputEntryFanout.length} ${winner.strategyName} entries`);
    }

    // Add supporting strategies
    agreeing.slice(1).forEach(r => {
      reasons.push(`  Supporting: ${r.strategyName}: ${r.reason}`);
    });

    // Log opposing strategies (info only)
    const opposing = qualified.filter(r => r.direction !== winner.direction);
    opposing.forEach(r => {
      reasons.push(`  Opposing: ${r.strategyName} says ${r.direction} (${(boundedConfidenceFromRankingScore(r.rankingScore) * 100).toFixed(0)}%)`);
    });

    const output = {
      action: winner.direction === 'buy' ? 'BUY' : winner.direction === 'sell' ? 'SELL' : 'HOLD',
      direction: winner.direction,
      confidence: publicWinnerConfidence * 100,
      winnerStrategy: winner.strategyName,
      timeframe: winnerTimeframe,
      exitContract,
      sizingMultiplier,
      confluence: {
        count: confluenceCount,
        strategies: agreeing.map(r => r.strategyName),
        opposing: opposing.map(r => ({
          name: r.strategyName,
          direction: r.direction,
          confidence: boundedConfidenceFromRankingScore(r.rankingScore, `${r.strategyName}.opposingRankingScore`),
        })),
      },
      mtfConfluenceSnapshot,
      entryFanout: outputEntryFanout,
      entryGroupType: winner.entryGroupType || null,
      entryGroupId: winner.entryGroupId || null,
      entryTriggerClass: winner.entryTriggerClass || winner.signalData?.triggerClass || null,
      allResults: results.map(publicResult),
      filteredResults: publicFilteredResults,
      unavailableStrategies: publicUnavailableStrategies,
      reasons,
      // Signal breakdown for trade logging (compatible with existing signalBreakdown format)
      signalBreakdown: {
        winnerStrategy: winner.strategyName,
        timeframe: winnerTimeframe,
        winnerConfidence: publicWinnerConfidence,
        confluenceCount,
        sizingMultiplier,
        fanoutCount: outputEntryFanout.length,
        unavailableStrategies: publicUnavailableStrategies,
        signals: publicResults.map(r => ({
          name: r.strategyName,
          direction: r.direction,
          timeframe: r.timeframe || null,
          confidence: r.confidence,
          reason: r.reason,
          decisionAttribution: cloneDecisionAttribution(r.decisionAttribution),
          signalBasis: r.signalData?.signalBasis || null,
          crossoverCount: Number.isFinite(r.signalData?.crossoverCount) ? r.signalData.crossoverCount : null,
        })),
      },
    };

    this.lastEvaluation = output;

    // Log decision
    console.log(`\n[ORCHESTRATOR] ${output.action} | ${winner.strategyName} @ ${(publicWinnerConfidence * 100).toFixed(0)}% | Confluence: ${confluenceCount}x (sizing: ${sizingMultiplier}x)`);
    if (agreeing.length > 1) {
      console.log(`   Supporting: ${agreeing.slice(1).map(r => r.strategyName).join(', ')}`);
    }

    return output;
  }

  resetNoWickState(scope = null) {
    if (!this.noWickModule || typeof this.noWickModule.reset !== 'function') {
      throw new Error('[STRATEGY-SCOPE] NoWickImbalance reset hook unavailable');
    }
    this.noWickModule.reset(scope);
  }

  /**
   * Get last evaluation for debugging / dashboard
   */
  getLastEvaluation() {
    return this.lastEvaluation;
  }

  /**
   * Register a custom strategy at runtime
   * @param {Object} strategy - { name: string, evaluate: function(ctx) }
   */
  registerStrategy(strategy) {
    if (!strategy.name || typeof strategy.evaluate !== 'function') {
      throw new Error('Strategy must have name and evaluate function');
    }
    this.strategies.push(strategy);
    console.log(`📌 [StrategyOrchestrator] Registered strategy: ${strategy.name}`);
  }

  /**
   * Remove a strategy by name
   */
  removeStrategy(name) {
    this.strategies = this.strategies.filter(s => s.name !== name);
    console.log(`🗑️ [StrategyOrchestrator] Removed strategy: ${name}`);
  }

  /**
   * Forward trade result to strategy module for daily loss tracking
   * FIX 2026-03-29: Wire up SMS dailyLosses counter
   * @param {string} strategyName - The strategy that made the trade
   * @param {number} pnl - The P&L of the closed trade (positive = win, negative = loss)
   */
  recordTradeResult(strategyName, pnl, symbol = null) {
    if (strategyName === 'SmartMoneySweep' && this.smartMoneySweepModule) {
      const smsModule = this._getSymbolStrategyModule(
        'SmartMoneySweep',
        symbol,
        this.smartMoneySweepModule,
        () => new SmartMoneySweep(
          ConfigLoader.get('strategies.SmartMoneySweep') || {}
        )
      );
      smsModule.recordTradeResult(pnl);
      console.log(`[SMS-DAILY] Recorded trade result: $${pnl.toFixed(2)} symbol=${symbol || 'legacy'} dailyLosses=${smsModule.dailyLosses}`);
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    return {
      registeredStrategies: this.strategies.map(s => s.name),
      evaluationCount: this.evalCount,
      lastResult: this.lastEvaluation ? {
        action: this.lastEvaluation.action,
        winner: this.lastEvaluation.winnerStrategy,
        confluence: this.lastEvaluation.confluence?.count || 0,
      } : null,
    };
  }
}

module.exports = { StrategyOrchestrator };
