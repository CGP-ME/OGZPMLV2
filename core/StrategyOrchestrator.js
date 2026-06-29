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
const TradingConfig = require('./TradingConfig');
const OpeningRangeBreakout = require('../modules/OpeningRangeBreakout');
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

function publicResult(result) {
  const { rankingScore, ...publicFields } = result;
  return {
    ...publicFields,
    decisionAttribution: cloneDecisionAttribution(result.decisionAttribution),
    confidence: boundedConfidenceFromRankingScore(result.rankingScore, `${result.strategyName}.publicRankingScore`),
  };
}

function normalizeTimeframeValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

function firstFiniteNumber(...values) {
  for (const value of values) {
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
    const timeframeValue = TradingConfig.get(`exitContracts.${strategyName}.timeframes.${normalizedTimeframe}.${key}`, MISSING_EXIT_CONTRACT_VALUE);
    if (timeframeValue !== MISSING_EXIT_CONTRACT_VALUE) {
      return { value: timeframeValue, source: 'strategy_timeframe', timeframe: normalizedTimeframe };
    }
  }
  const strategyValue = TradingConfig.get(`exitContracts.${strategyName}.${key}`, MISSING_EXIT_CONTRACT_VALUE);
  if (strategyValue !== MISSING_EXIT_CONTRACT_VALUE) {
    return { value: strategyValue, source: 'strategy', timeframe: normalizedTimeframe };
  }
  const strategyContract = TradingConfig.get(`exitContracts.${strategyName}`, MISSING_EXIT_CONTRACT_VALUE);
  if (strategyContract !== MISSING_EXIT_CONTRACT_VALUE) {
    throw new Error(`[EXIT-CONTRACT] ${strategyName}.${key} must be explicit null or a finite number; key is missing from strategy contract`);
  }
  if (normalizedTimeframe) {
    const defaultTimeframeValue = TradingConfig.get(`exitContracts.default.timeframes.${normalizedTimeframe}.${key}`, MISSING_EXIT_CONTRACT_VALUE);
    if (defaultTimeframeValue !== MISSING_EXIT_CONTRACT_VALUE) {
      return { value: defaultTimeframeValue, source: 'default_timeframe', timeframe: normalizedTimeframe };
    }
  }
  return {
    value: TradingConfig.get(`exitContracts.default.${key}`, null),
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

function normalizeExitContractHint(hint, strategyName) {
  if (!hint || typeof hint !== 'object') {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint must be an object`);
  }

  const stopLossPercent = Number(hint.stopLossPercent);
  if (!Number.isFinite(stopLossPercent) || stopLossPercent >= 0) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.stopLossPercent must be a negative finite risk distance (got ${hint.stopLossPercent})`);
  }

  const takeProfitPercent = Number(hint.takeProfitPercent);
  if (!Number.isFinite(takeProfitPercent) || takeProfitPercent <= 0) {
    throw new Error(`[EXIT-HINT] ${strategyName}.exitContractHint.takeProfitPercent must be a positive finite target distance (got ${hint.takeProfitPercent})`);
  }

  const normalized = {
    ...hint,
    stopLossPercent,
    takeProfitPercent,
  };

  const optionalPositiveFields = new Set(['trailingStopPercent', 'maxHoldTimeMinutes']);
  const optionalNonNegativeFields = new Set(['trailingActivation']);
  for (const key of [...optionalPositiveFields, ...optionalNonNegativeFields]) {
    if (hint[key] === undefined) continue;
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

  return normalized;
}

class StrategyOrchestrator {
  constructor(config = {}) {
    // Minimum confidence a single strategy needs to fire a trade
    // This is PER-STRATEGY, not aggregate — much more meaningful
    // TUNE 2026-02-27: Raised from 0.25 to filter garbage signals
    this.minStrategyConfidence = TradingConfig.get('confidence.minStrategyConfidence') ?? 0.01;

    // FIX 2026-03-19: Extracted hardcoded thresholds to config
    this.regimeMinConfidence = TradingConfig.get('confidence.regimeMinConfidence') ?? 0.30;
    this.confluenceMinScore = TradingConfig.get('confidence.confluenceMinScore') ?? 0.30;
    this.tpoStrengthMin = TradingConfig.get('confidence.tpoStrengthMin') ?? 0.03;

    // Minimum confluence signals to allow entry (default: 1 = winner alone is enough)
    this.minConfluenceCount = config.minConfluenceCount ?? 1;

    // Position sizing multipliers based on how many strategies agree
    this.confluenceSizing = config.confluenceSizing ?? {
      1: 1.0,   // Single strategy — base size
      2: 1.5,   // Two agree — 1.5x
      3: 2.0,   // Three agree — 2x
      4: 2.5,   // Four+ agree — 2.5x (cap)
    };

    // Strategy definitions — each has an evaluate function
    // These are pluggable: add/remove strategies by editing this array
    this.strategies = [];
    this.symbolStrategyModules = new Map();

    // Opening Range Breakout stateful strategy instance
    // MUST be initialized BEFORE _registerBuiltinStrategies() so closure captures it
    this.orbStrategy = new OpeningRangeBreakout();

    // MA Extension Filter for trend confirmation + first-touch skip
    this.maExtensionFilter = new MAExtensionFilter();

    // FIX 2026-03-19: Self-contained signal modules
    // Each strategy owns its signal computation — no ctx.extras handoff
    this.emaCrossoverModule = new EMASMACrossoverSignal();
    this.maDynamicSRModule = new MADynamicSR();
    this.liquiditySweepModule = new LiquiditySweepDetector({
      ...(TradingConfig.get('strategies.LiquiditySweep') || {}),
      disableSessionCheck: true,
    });
    const BreakAndRetest = require('../modules/BreakAndRetest');
    this.breakAndRetestModule = new BreakAndRetest();
    const NoWickImbalance = require('../modules/NoWickImbalance');
    this.noWickModule = new NoWickImbalance({
      maxCandleAge: 9,
      slBreathingATR: 0.3,
      swingLookback: 20,
      minBodyPercent: 0.3
    });
    this.mtfAdapter = new MultiTimeframeAdapter({
      activeTimeframes: TradingConfig.get('orchestrator.mtfTimeframes') || ['1m', '5m', '15m', '1h', '4h']
    });
    this.tpoIntegration = new OgzTpoIntegration();
    this.smartMoneySweepModule = new SmartMoneySweep(
      TradingConfig.get('strategies.SmartMoneySweep') || {}
    );
    this.donchianBreakoutModule = new DonchianBreakout(
      TradingConfig.get('strategies.DonchianBreakout') || {}
    );
    // SOLO_STRATEGY mode: only enable specified strategies for isolated testing
    // Usage: SOLO_STRATEGY=RSI node tools/parallel-backtest.js ...
    // Supports comma-separated: SOLO_STRATEGY=RSI,EMASMACrossover
    this.soloStrategies = process.env.SOLO_STRATEGY
      ? process.env.SOLO_STRATEGY.split(',').map(s => s.trim().toLowerCase())
      : null;
    if (this.soloStrategies) {
      console.log(`[StrategyOrchestrator] SOLO MODE: Only ${this.soloStrategies.join(', ')} enabled`);
    }

    // FIX 2026-03-19: Load orchestrator config from TradingConfig (no hardcodes)
    this.minCandlesEMA = TradingConfig.get('orchestrator.minCandlesEMA') ?? 20;
    this.minCandlesMASR = TradingConfig.get('orchestrator.minCandlesMASR') ?? 50;
    this.minCandlesSweep = TradingConfig.get('orchestrator.minCandlesSweep') ?? 20;
    this.minCandlesMTF = TradingConfig.get('orchestrator.minCandlesMTF') ?? 30;
    this.minCandlesTPO = TradingConfig.get('orchestrator.minCandlesTPO') ?? 30;
    this.fibDistanceEMA = TradingConfig.get('orchestrator.fibDistanceEMA') ?? 0.5;
    this.fibDistanceMASR = TradingConfig.get('orchestrator.fibDistanceMASR') ?? 0.5;
    this.fibDistanceSweep = TradingConfig.get('orchestrator.fibDistanceSweep') ?? 0.8;
    this.fibBoostNormal = TradingConfig.get('orchestrator.fibBoostNormal') ?? 0.10;
    this.fibBoostGolden = TradingConfig.get('orchestrator.fibBoostGolden') ?? 0.15;
    this.tpoStrengthMultiplier = TradingConfig.get('orchestrator.tpoStrengthMultiplier') ?? 10;

    // Stats tracking
    this.lastEvaluation = null;
    this.evalCount = 0;
    this.mtfEvaluationCache = null;

    // DIAGNOSTIC FUNNELS - track where signals die (MUST be before _registerBuiltinStrategies)
    this.diagFunnel = {
      EMASMACrossover: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      MADynamicSR: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      RSI: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      LiquiditySweep: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      OGZTPO: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      SmartMoneySweep: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
    };

    // Register built-in strategies (uses diagFunnel, so must come after)
    this._registerBuiltinStrategies();
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

  _getMtfConfluenceForEvaluation(ctx) {
    if (this.mtfEvaluationCache && this.mtfEvaluationCache.evalCount === this.evalCount) {
      return this.mtfEvaluationCache.confluence;
    }

    const cacheResult = (confluence, unavailableReason = null) => {
      this.mtfEvaluationCache = {
        evalCount: this.evalCount,
        confluence,
        snapshot: confluence
          ? this._buildMtfConfluenceSnapshot(confluence)
          : this._buildMtfUnavailableSnapshot(unavailableReason),
      };
      return confluence;
    };

    const candles = ctx.priceHistory;
    if (!candles || candles.length < this.minCandlesMTF) {
      if (process.env.STRATEGY_DIAG === 'true') {
        console.log(`[DIAG] MultiTimeframe: NOT ENOUGH CANDLES (${candles?.length || 0} < ${this.minCandlesMTF})`);
      }
      return cacheResult(null, 'insufficient_candles');
    }

    const latestCandle = candles[candles.length - 1];
    if (!latestCandle || typeof latestCandle.timeframe !== 'string' || !latestCandle.timeframe.trim()) {
      throw new Error('[STRATEGY-SCOPE] MultiTimeframe latest candle missing timeframe');
    }

    const scopedMtfAdapter = this._getSymbolStrategyModule(
      'MultiTimeframe',
      ctx.extras?.symbol,
      this.mtfAdapter,
      () => new MultiTimeframeAdapter({
        activeTimeframes: TradingConfig.get('orchestrator.mtfTimeframes') || ['1m', '5m', '15m', '1h', '4h']
      })
    );

    try {
      scopedMtfAdapter.ingestCandle(latestCandle, latestCandle.timeframe);
    } catch (e) {
      if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] MultiTimeframe: ingestCandle error: ${e.message}`);
      return cacheResult(null, `ingest_error:${e.message}`);
    }

    let confluence;
    try {
      confluence = scopedMtfAdapter.getConfluence ? scopedMtfAdapter.getConfluence() : scopedMtfAdapter.getConfluenceScore();
    } catch (e) {
      if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] MultiTimeframe: getConfluence error: ${e.message}`);
      return cacheResult(null, `confluence_error:${e.message}`);
    }

    if (process.env.STRATEGY_DIAG === 'true') {
      console.log(`[DIAG] MultiTimeframe: confluence=${confluence ? JSON.stringify({ dir: confluence.direction, score: confluence.confluenceScore ?? confluence.score }) : 'null'}`);
    }
    return cacheResult(confluence || null, 'no_confluence');
  }

  _buildMtfUnavailableSnapshot(reason = null) {
    return deepFreezePlain({
      source: 'StrategyOrchestrator.mtfConfluence',
      available: false,
      unavailableReason: reason || 'unavailable',
      direction: 'neutral',
      confluenceScore: 0,
      confidence: 0,
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
      confluenceScore: score == null ? 0 : score,
      confidence: firstFiniteNumber(confluence.confidence, score == null ? 0 : Math.abs(score)) ?? 0,
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

  _shouldObserveMtfConfluence() {
    const pipeline = TradingConfig.get('pipeline') || {};
    const booster = TradingConfig.get('orchestrator.mtfConfluenceBooster') || {};
    return pipeline.enableMultiTimeframe === true || booster.enabled === true;
  }

  _applyMtfConfluenceBooster(results, ctx) {
    const config = TradingConfig.get('orchestrator.mtfConfluenceBooster') || {};
    if (config.enabled !== true) return false;
    if (results.length === 0) return false;

    const minScore = finiteConfigNumber(config.minScore, 'minScore', 0.30, 0);
    const minConfidence = finiteConfigNumber(config.minConfidence, 'minConfidence', 0.50, 0);
    const strengthMultiplier = finiteConfigNumber(config.strengthMultiplier, 'strengthMultiplier', 0.20, 0);
    const maxMultiplier = finiteConfigNumber(config.maxMultiplier, 'maxMultiplier', 1.15, 1);
    const conflictMultiplier = finiteConfigNumber(config.conflictMultiplier, 'conflictMultiplier', 0.85, 0);
    const penalizeConflicts = config.penalizeConflicts !== false;
    const boostMtfCandidate = config.boostMtfCandidate === true;

    const confluence = this._getMtfConfluenceForEvaluation(ctx);
    const signedScore = firstFiniteNumber(confluence?.confluenceScore, confluence?.score);
    if (signedScore == null || signedScore === 0) return false;

    const scoreMagnitude = Math.abs(signedScore);
    const confidence = firstFiniteNumber(confluence?.confidence, scoreMagnitude);
    if (scoreMagnitude < minScore || confidence < minConfidence) return false;

    const mtfDirection = signedScore > 0 ? 'buy' : 'sell';
    let changed = false;
    for (const result of results) {
      if (result.strategyName === 'MultiTimeframe' && !boostMtfCandidate) continue;

      const aligned = result.direction === mtfDirection;
      const multiplier = aligned
        ? Math.min(maxMultiplier, 1 + (scoreMagnitude * strengthMultiplier))
        : (penalizeConflicts ? conflictMultiplier : 1);

      if (multiplier === 1) continue;
      const previousRankingScore = result.rankingScore;
      const boostedScore = previousRankingScore * multiplier;
      const cappedScore = aligned
        ? Math.min(boostedScore, Math.max(previousRankingScore, 1))
        : boostedScore;
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
        aligned,
      };
      changed = true;
    }

    if (changed) results.sort((a, b) => b.rankingScore - a.rankingScore);
    return changed;
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
    // Helper: check if strategy should be registered (respects SOLO_STRATEGY mode)
    const shouldRegister = (name) => {
      if (!this.soloStrategies) return true;  // No filter — register all
      return this.soloStrategies.includes(name.toLowerCase());
    };
    const shouldInstantiateDormantStrategy = (name, toggleKey, envName) => {
      if (!shouldRegister(name)) return false;
      const pipeline = TradingConfig.get('pipeline') || {};
      const toggle = pipeline[toggleKey];
      if (typeof toggle !== 'boolean') {
        throw new Error(`[PIPELINE] ${name} pipeline toggle must be boolean; got ${toggle}. Check TradingConfig.pipeline and ${envName}`);
      }
      if (toggle === false) {
        if (this.soloStrategies && this.soloStrategies.includes(name.toLowerCase())) {
          throw new Error(`[SOLO_STRATEGY] ${name} was requested but its pipeline toggle is disabled; set ${envName}=true or remove SOLO_STRATEGY`);
        }
        return false;
      }
      return true;
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
          () => new EMASMACrossoverSignal()
        );
        const sig = scopedEmaCrossover.update(latestCandle, candles);
        if (sig) diagEMA.moduleNonNull++;

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
        let conf = sig.confidence || 0;
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
          () => new MADynamicSR()
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
          () => new LiquiditySweepDetector({
            ...(TradingConfig.get('strategies.LiquiditySweep') || {}),
            disableSessionCheck: true,
          })
        );
        const sig = scopedLiquiditySweep.feedCandle(latestCandle);

        // DIAGNOSTIC: Log every call to see why no signals
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] LiquiditySweep: called, sig=${sig ? JSON.stringify({hasSignal: sig.hasSignal, direction: sig.direction, confidence: sig.confidence}) : 'null'}`);
        }
        if (!sig || !sig.hasSignal) return null;
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
          // FIX 2026-02-23: Pass structural stops from sweep analysis
          overrideLevels: sig.stopLoss && sig.takeProfit ? {
            stopLoss: sig.stopLoss,
            takeProfit: sig.takeProfit
          } : null
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
            overrideLevels: sig.stopLoss && sig.takeProfit ? {
              stopLoss: sig.stopLoss,
              takeProfit: sig.takeProfit,
              pt2: sig.pt2
            } : null
          };
        }
      });
    }

    // ─── 5. RSI Extreme Strategy ───
    // FIX 2026-03-06: Read thresholds from TradingConfig per STRATEGY-REWRITE-SPEC
    if (shouldRegister('RSI')) this.strategies.push({
      name: 'RSI',  // RSI Extreme strategy
      evaluate: (ctx) => {
        const rsi = ctx.indicators?.rsi;
        if (rsi == null) return null;

        const rsiConfig = TradingConfig.get('strategies.RSI') || {};
        const oversold = rsiConfig.oversoldLevel || 25;
        const overbought = rsiConfig.overboughtLevel || 75;

        // Only fire on extremes — not the gradient nonsense
        // FIX 2026-03-13: Boost confidence so RSI=25 passes 50% gate
        // OLD: 0.3 + (strength * 0.5) gave 0.30 at threshold — too weak
        // NEW: 0.5 + (strength * 0.4) gives 0.50 at threshold, 0.90 at extreme
        if (rsi < oversold) {
          const strength = Math.min(1.0, (oversold - rsi) / 15); // Stronger as RSI drops
          return {
            direction: 'buy',
            confidence: 0.5 + (strength * 0.4), // 0.50 - 0.90
            reason: `RSI Oversold (${rsi.toFixed(1)} < ${oversold})`,
            signalData: { rsi }
          };
        }
        if (rsi > overbought) {
          const strength = Math.min(1.0, (rsi - overbought) / 15);
          return {
            direction: 'sell',
            confidence: 0.5 + (strength * 0.4), // 0.50 - 0.90
            reason: `RSI Overbought (${rsi.toFixed(1)} > ${overbought})`,
            signalData: { rsi }
          };
        }
        return null;
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

    // ─── 7. Multi-Timeframe Confluence Strategy ───
    // FIX 2026-03-19: Self-contained — owns its MTF adapter internally
    if (shouldRegister('MultiTimeframe')) this.strategies.push({
      name: 'MultiTimeframe',
      evaluate: (ctx) => {
        // Self-contained: ingest candle and compute confluence internally
        const confluence = this._getMtfConfluenceForEvaluation(ctx);

        const rawScore = Number.isFinite(confluence?.score)
          ? confluence.score
          : confluence?.confluenceScore;
        const scoreMagnitude = Number.isFinite(rawScore) ? Math.abs(rawScore) : 0;
        const confidence = Number.isFinite(confluence?.confidence)
          ? confluence.confidence
          : scoreMagnitude;
        const timeframes = Array.isArray(confluence?.timeframes)
          ? confluence.timeframes
          : confluence?.readyTimeframes;

        if (!confluence || !confluence.direction || confluence.direction === 'neutral') return null;
        if (scoreMagnitude < this.confluenceMinScore) return null;

        return {
          direction: confluence.direction,
          confidence,
          reason: `MTF Confluence: ${confluence.direction} (${timeframes?.join(', ') || 'multiple'})`,
          signalData: confluence
        };
      }
    });

    // ─── 8. OGZ TPO Strategy ───
    // FIX 2026-03-19: Self-contained — owns its TPO integration internally
    const tpoIntegrationModule = this.tpoIntegration;
    const minCandlesTPO = this.minCandlesTPO;
    const tpoStrengthMultiplier = this.tpoStrengthMultiplier;
    if (shouldRegister('OGZTPO')) this.strategies.push({
      name: 'OGZTPO',  // OGZ TPO strategy
      evaluate: (ctx) => {
        // Self-contained: compute TPO signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesTPO) return null;

        const latestCandle = candles[candles.length - 1];
        let tpo;
        try {
          const scopedTpoIntegration = this._getSymbolStrategyModule(
            'OGZTPO',
            ctx.extras?.symbol,
            tpoIntegrationModule,
            () => new OgzTpoIntegration()
          );
          tpo = scopedTpoIntegration.update(latestCandle);
        } catch (e) {
          return null;
        }

        if (!tpo || !tpo.signal) return null;
        if (!tpo.signal.highProbability) return null; // Only fire on high probability

        const action = tpo.signal.action;
        const strength = tpo.signal.strength || 0;
        if (strength < this.tpoStrengthMin) return null;

        const direction = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : null;
        if (!direction) return null;

        // DIAGNOSTIC: Log TPO signal computation
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] OGZTPO computed: dir=${direction} strength=${(strength * 100).toFixed(1)}%`);
        }

        return {
          direction,
          confidence: Math.min(1.0, strength * tpoStrengthMultiplier), // Scale 0.03-0.1 → 0.3-1.0
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
        const scopedOrb = this._getSymbolStrategyModule(
          'OpeningRangeBreakout',
          ctx.extras?.symbol,
          orbInstance,
          () => new OpeningRangeBreakout()
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
          // ORB provides structural levels from FVG
          overrideLevels: {
            stopLoss: signal.stop,
            takeProfit: signal.target,
          },
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
            TradingConfig.get('strategies.SmartMoneySweep') || {}
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
          if (process.env.STRATEGY_DIAG === 'true') {
            console.warn('[NoWickImbalance] evaluate threw:', e.message);
          }
          return null;
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
          TradingConfig.get('strategies.DonchianBreakout') || {}
        )
      ).evaluate(ctx)
    });

    if (shouldInstantiateDormantStrategy('PropSafeEMAPullback', 'enablePropSafeEMAPullback', 'ENABLE_PROPSAFE_EMA')) {
      const propSafeEmaPullbackModule = new PropSafeEMAPullback(
        TradingConfig.get('strategies.PropSafeEMAPullback') || {}
      );
      this.strategies.push({
        name: 'PropSafeEMAPullback',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'PropSafeEMAPullback',
          ctx.extras?.symbol,
          propSafeEmaPullbackModule,
          () => new PropSafeEMAPullback(
            TradingConfig.get('strategies.PropSafeEMAPullback') || {}
          )
        ).evaluate(ctx)
      });
    }

    if (shouldInstantiateDormantStrategy('EMATrendRetest', 'enableEMATrendRetest', 'ENABLE_EMA_TREND_RETEST')) {
      const emaTrendRetestModule = new EMATrendRetest(
        TradingConfig.get('strategies.EMATrendRetest') || {}
      );
      this.strategies.push({
        name: 'EMATrendRetest',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'EMATrendRetest',
          ctx.extras?.symbol,
          emaTrendRetestModule,
          () => new EMATrendRetest(
            TradingConfig.get('strategies.EMATrendRetest') || {}
          )
        ).evaluate(ctx)
      });
    }

    if (shouldInstantiateDormantStrategy('RSI2MeanReversion', 'enableRSI2MeanReversion', 'ENABLE_RSI2_MR')) {
      const rsi2MeanReversionModule = new RSI2MeanReversion(
        TradingConfig.get('strategies.RSI2MeanReversion') || {}
      );
      this.strategies.push({
        name: 'RSI2MeanReversion',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'RSI2MeanReversion',
          ctx.extras?.symbol,
          rsi2MeanReversionModule,
          () => new RSI2MeanReversion(
            TradingConfig.get('strategies.RSI2MeanReversion') || {}
          )
        ).evaluate(ctx)
      });
    }

    if (shouldInstantiateDormantStrategy('TimeSeriesMomentum', 'enableTimeSeriesMomentum', 'ENABLE_TSMOM')) {
      const timeSeriesMomentumModule = new TimeSeriesMomentum(
        TradingConfig.get('strategies.TimeSeriesMomentum') || {}
      );
      this.strategies.push({
        name: 'TimeSeriesMomentum',
        evaluate: (ctx) => this._getSymbolStrategyModule(
          'TimeSeriesMomentum',
          ctx.extras?.symbol,
          timeSeriesMomentumModule,
          () => new TimeSeriesMomentum(
            TradingConfig.get('strategies.TimeSeriesMomentum') || {}
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
    const pipeline = TradingConfig.get('pipeline') || {};
    const toggleMap = {
      'RSI': pipeline.enableRSI,
      'MADynamicSR': pipeline.enableMADynamicSR,
      'EMASMACrossover': pipeline.enableEMACrossover,
      'LiquiditySweep': pipeline.enableLiquiditySweep,
      'CandlePattern': pipeline.enableCandlePattern,
      'BreakRetest': pipeline.enableBreakRetest,
      'MarketRegime': pipeline.enableMarketRegime,
      'MultiTimeframe': pipeline.enableMultiTimeframe,
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
    const enableEnvMap = {
      'BreakRetest': 'ENABLE_BREAKRETEST',
      'OpeningRangeBreakout': 'ENABLE_ORB',
      'SmartMoneySweep': 'ENABLE_SMS',
      'NoWickImbalance': 'ENABLE_NOWICK',
      'DonchianBreakout': 'ENABLE_DONCHIAN',
      'PropSafeEMAPullback': 'ENABLE_PROPSAFE_EMA',
      'EMATrendRetest': 'ENABLE_EMA_TREND_RETEST',
      'RSI2MeanReversion': 'ENABLE_RSI2_MR',
      'TimeSeriesMomentum': 'ENABLE_TSMOM',
    };

    const before = this.strategies.length;
    const disabled = [];

    this.strategies = this.strategies.filter(s => {
      const toggle = toggleMap[s.name];
      if (typeof toggle !== 'boolean') {
        const envName = enableEnvMap[s.name] || `ENABLE_${s.name.toUpperCase()}`;
        throw new Error(`[PIPELINE] ${s.name} pipeline toggle must be boolean; got ${toggle}. Check TradingConfig.pipeline and ${envName}`);
      }
      if (toggle === false) {
        if (this.soloStrategies && this.soloStrategies.includes(s.name.toLowerCase())) {
          const envName = enableEnvMap[s.name] || `ENABLE_${s.name.toUpperCase()}`;
          throw new Error(`[SOLO_STRATEGY] ${s.name} was requested but its pipeline toggle is disabled; set ${envName}=true or remove SOLO_STRATEGY`);
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
    // const TREND_STRATEGIES = ['MADynamicSR', 'EMASMACrossover', 'MultiTimeframe', 'MarketRegime'];
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
        thrownStrategies.push(`${strategy.name}:${err.message}`);
        console.warn(`[StrategyOrchestrator] ${strategy.name} threw: ${err.message}`);
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
    const filterATRpct = (filterATR && filterPrice > 0) ? (filterATR / filterPrice) * 100 : 0;

    // ATR filter: Per-strategy threshold via effective exitContracts.{strategy}.atrMinPercent
    // null = fall back to global filters.atrMinPercent (zero behavior change default)
    const atrFilterEnabled = TradingConfig.get('filters.atrEnabled');
    const globalAtrMin = TradingConfig.get('filters.atrMinPercent');
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
          reason: filterATR === null ? 'atr_unavailable' : 'atr_percent_unavailable',
        });
      }
    }
    if (process.env.STRATEGY_DIAG === 'true' && atrDropped.length > 0) {
      console.log(`[ORCH][FILTER_DROP] eval=${this.evalCount} filter=atr atrPct=${filterATRpct.toFixed(3)} dropped=${atrDropped.join(',')}`);
    }

    // ─── Step 2: Sort by ranking score (highest first) ───
    results.sort((a, b) => b.rankingScore - a.rankingScore);

    // ─── Step 2.5: Regime-based strategy boosting ───
    // FIX 2026-04-05: Read from TradingConfig for matrix sweep optimization
    // Multipliers, not gates. Losers still fire, just sized smaller.
    // HIGH-23: throw if regimeBoosts config missing or non-object.
    // TradingConfig.js:108 already defines this as an object, so the throw
    // only fires on genuine config breakage. Per Rule #1 — refusing to fall
    // back to {} which silently disables boosts.
    const regimeBoosts = TradingConfig.get('regimeBoosts');
    if (regimeBoosts == null || typeof regimeBoosts !== 'object') {
      throw new Error(`[HIGH-23] TradingConfig.regimeBoosts must be an object (got ${typeof regimeBoosts})`);
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
    // HIGH-24: same halt-class throw as HIGH-23. TradingConfig.js:146 always
    // provides volumeProfileBoosts as an object.
    const volumeProfileBoosts = TradingConfig.get('volumeProfileBoosts');
    if (volumeProfileBoosts == null || typeof volumeProfileBoosts !== 'object') {
      throw new Error(`[HIGH-24] TradingConfig.volumeProfileBoosts must be an object (got ${typeof volumeProfileBoosts})`);
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
      console.log(`🔍 [ORCH] ${results.length} strategies returned signals:`);
      results.slice(0, 5).forEach(r => console.log(`   - ${r.strategyName}: ${(r.confidence * 100).toFixed(1)}% ${r.direction}`));
    } else {
      if (process.env.STRATEGY_DIAG === 'true' && rawStrategyResults.length > 0) {
        const rawList = rawStrategyResults
          .slice(0, 8)
          .map(r => `${r.strategyName}:${r.direction}:${(r.confidence * 100).toFixed(1)}%`)
          .join(',');
        console.log(`[ORCH][FILTER_EMPTY] eval=${this.evalCount} rawCandidates=${rawStrategyResults.length} afterFilters=0 raw=${rawList}`);
      }
      console.log(`🔍 [ORCH] 0 strategies returned signals (all returned null or conf=0)`);
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

    // ─── Step 3: Filter by ranking score threshold ───
    // Regime/VP multipliers historically affected eligibility before winner
    // selection. Public/risk/exit confidence remains bounded by capping that
    // boosted score to 1.0 at the orchestrator boundary.
    const qualified = results.filter(r => r.rankingScore >= this.minStrategyConfidence);

    if (qualified.length === 0) {
      this.lastEvaluation = { action: 'HOLD', results: publicResults, qualified: [] };
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
        reasons: results.length > 0
          ? [`No strategy above ${(this.minStrategyConfidence * 100).toFixed(0)}% ranking threshold (best: ${results[0]?.strategyName} confidence ${(boundedConfidenceFromRankingScore(results[0]?.rankingScore, `${results[0]?.strategyName}.bestRankingScore`) * 100).toFixed(0)}%)`]
          : ['No signals detected']
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
    const price = extras.price || (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : 0);

    // If the winning strategy provided its own levels (e.g. TPO), use them
    const signalOverrides = {};
    // DEBUG: Log winner object keys to trace overrideLevels flow
    console.log(`[EXIT-DEBUG] Winner "${winner.strategyName}" keys: ${Object.keys(winner).join(', ')}`);
    console.log(`[EXIT-DEBUG] Winner overrideLevels type: ${typeof winner.overrideLevels}, value: ${JSON.stringify(winner.overrideLevels)}`);
    const exitContractHint = winner.exitContractHint || winner.signalData?.exitContractHint;
    if (winner.strategyName === 'OpeningRangeBreakout' && !exitContractHint) {
      throw new Error('[EXIT-HINT] OpeningRangeBreakout requires entry-based exitContractHint; refusing current-price override-level math');
    }
    if (exitContractHint) {
      Object.assign(signalOverrides, normalizeExitContractHint(exitContractHint, winner.strategyName));
      console.log(`[EXIT-DEBUG] ${winner.strategyName} using exitContractHint SL%=${signalOverrides.stopLossPercent.toFixed(2)} TP%=${signalOverrides.takeProfitPercent.toFixed(2)}`);
    } else if (winner.overrideLevels) {
      const isShort = winner.direction === 'sell';
      if (winner.overrideLevels.stopLoss && price) {
        // FIX 2026-03-27: SL% must always be negative (how far price can move against you)
        // For shorts, stopLoss is ABOVE entry → raw calc is positive → negate it
        const rawSL = ((winner.overrideLevels.stopLoss - price) / price) * 100;
        signalOverrides.stopLossPercent = isShort ? -Math.abs(rawSL) : rawSL;
      }
      if (winner.overrideLevels.takeProfit && price) {
        // FIX 2026-03-27: TP% must always be positive (how far price needs to move in your favor)
        // For shorts, takeProfit is BELOW entry → raw calc is negative → make positive
        const rawTP = ((winner.overrideLevels.takeProfit - price) / price) * 100;
        signalOverrides.takeProfitPercent = isShort ? Math.abs(rawTP) : rawTP;
      }
      // DEBUG: Log override level conversion
      console.log(`[EXIT-DEBUG] ${winner.strategyName} overrideLevels → Price=$${price?.toFixed(2)} SL=$${winner.overrideLevels.stopLoss?.toFixed(2)} TP=$${winner.overrideLevels.takeProfit?.toFixed(2)} → SL%=${signalOverrides.stopLossPercent?.toFixed(2)}% TP%=${signalOverrides.takeProfitPercent?.toFixed(2)}%`);
    } else {
      console.log(`[EXIT-DEBUG] ${winner.strategyName} NO overrideLevels — will use TradingConfig defaults`);
    }

    // FIX 2026-02-23: Convert ATR to percentage (was passing raw $ causing inflation)
    // HIGH-15: throw if neither ATR/price nor a finite volatility is available.
    // Old code substituted volPct=0 silently, producing wrong-fit SL/TP that
    // either fired immediately or never. These throw conditions are intentional:
    // let them propagate so OrderExecutor never receives a null exit contract.
    let volPct;
    if (indicators?.atr && price) {
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
    exitContract = ecm.createExitContract(
      winner.strategyName,
      { ...signalOverrides, confidence: publicWinnerConfidence },
      { volatility: volPct, timeframe: winnerTimeframe }
    );

    // ─── Step 8: Build reasons list ───
    const reasons = [
      `Winner: ${winner.strategyName} ${winnerTimeframe} (${(publicWinnerConfidence * 100).toFixed(0)}%) — ${winner.reason}`,
      `Confluence: ${confluenceCount} strategies agree on ${winner.direction.toUpperCase()}`,
      `Sizing: ${sizingMultiplier}x base position`,
    ];

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
      allResults: publicResults,
      filteredResults: publicFilteredResults,
      reasons,
      // Signal breakdown for trade logging (compatible with existing signalBreakdown format)
      signalBreakdown: {
        winnerStrategy: winner.strategyName,
        timeframe: winnerTimeframe,
        winnerConfidence: publicWinnerConfidence,
        confluenceCount,
        sizingMultiplier,
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
          TradingConfig.get('strategies.SmartMoneySweep') || {}
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
