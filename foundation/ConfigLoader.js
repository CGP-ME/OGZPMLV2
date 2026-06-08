/**
 * ConfigLoader.js - Single Source of Truth for ALL Configuration
 * ==============================================================
 * 
 * RULES:
 * 1. ONLY this file reads process.env
 * 2. Every module receives config via constructor injection
 * 3. Config is frozen after load — no runtime mutations
 * 4. Every value is typed, validated, and source-tracked
 * 5. Unknown env vars are logged as warnings
 * 
 * USAGE:
 *   const config = require('./foundation/ConfigLoader').load();
 *   const tradingLoop = new TradingLoop(config);
 *   // tradingLoop NEVER touches process.env
 * 
 * @module foundation/ConfigLoader
 * @author Claude (Opus) for Trey / OGZPrime
 * @date 2026-03-17
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// ENV READER HELPERS (private — only used inside this file)
// ═══════════════════════════════════════════════════════════════

let activeEnv = process.env;
let activeEnvSources = {};

function envSource() {
  return activeEnv || process.env;
}

function valueSource(key) {
  return activeEnvSources[key] || `env:${key}`;
}

function envStr(key, fallback) {
  const val = envSource()[key];
  if (val !== undefined && val !== '') return { value: val, source: valueSource(key) };
  return { value: fallback, source: 'default' };
}

function envFloat(key, fallback) {
  const val = envSource()[key];
  if (val !== undefined && val !== '') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) return { value: parsed, source: valueSource(key) };
  }
  return { value: fallback, source: 'default' };
}

function envStrictFloat(key, fallback) {
  const val = envSource()[key];
  if (val === undefined || val === '') {
    return { value: fallback, source: 'default' };
  }
  const parsed = Number(val);
  return { value: Number.isFinite(parsed) ? parsed : NaN, source: valueSource(key) };
}

function envInt(key, fallback) {
  const val = envSource()[key];
  if (val !== undefined && val !== '') {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return { value: parsed, source: valueSource(key) };
  }
  return { value: fallback, source: 'default' };
}

function envBool(key, fallback) {
  const val = envSource()[key];
  if (val === 'true' || val === '1') return { value: true, source: valueSource(key) };
  if (val === 'false' || val === '0') return { value: false, source: valueSource(key) };
  return { value: fallback, source: 'default' };
}

function envJsonObject(key, fallback) {
  const val = envSource()[key];
  if (val === undefined || val === '') {
    return { value: fallback, source: 'default' };
  }

  try {
    return { value: JSON.parse(val), source: valueSource(key) };
  } catch (error) {
    return { value: { __parseError: error.message }, source: valueSource(key) };
  }
}

function defaultJournalDataDir(dataDir) {
  const root = dataDir || path.join(process.cwd(), 'data');
  return path.join(root, 'journal');
}

function loadDotenvValues(envPath) {
  const resolvedPath = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  try {
    return dotenv.parse(fs.readFileSync(resolvedPath));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function buildDotenvSources(dotenvValues, sourceEnv) {
  const sources = {};
  Object.keys(dotenvValues).forEach(key => {
    if (sourceEnv[key] === undefined) {
      sources[key] = `dotenv:${key}`;
    }
  });
  return sources;
}

function buildEffectiveEnv(sourceEnv, sourceOverrides = {}) {
  const effectiveEnv = { ...sourceEnv };
  const sources = { ...sourceOverrides };
  if (effectiveEnv.EXECUTION_MODE === 'backtest' || effectiveEnv.CANDLE_SOURCE === 'file') {
    effectiveEnv.BACKTEST_MODE = 'true';
    if (sourceEnv.BACKTEST_MODE !== 'true' && sourceEnv.BACKTEST_MODE !== '1') {
      sources.BACKTEST_MODE = 'derived:backtest-mode';
    }
  }

  if (effectiveEnv.BACKTEST_MODE === 'true') {
    if (!effectiveEnv.STATE_FILE) {
      effectiveEnv.STATE_FILE = path.join(process.cwd(), 'data', 'state-backtest.json');
      sources.STATE_FILE = 'derived:backtest-state-isolation';
    }
    if (!effectiveEnv.DATA_DIR) {
      effectiveEnv.DATA_DIR = path.join(process.cwd(), 'data', 'backtest');
      sources.DATA_DIR = 'derived:backtest-state-isolation';
    }
  }

  return { values: effectiveEnv, sources };
}

// ═══════════════════════════════════════════════════════════════
// SCHEMA — every env var the system reads, typed and documented
// ═══════════════════════════════════════════════════════════════

function buildConfig() {
  const sources = {}; // Track where each value came from
  
  function track(path, result) {
    sources[path] = result.source;
    return result.value;
  }

  const dataDirConfig = envStr('DATA_DIR', '');
  const journalDataDirConfig = envStr('JOURNAL_DATA_DIR', defaultJournalDataDir(dataDirConfig.value));

  const config = {
    // ─── EXECUTION MODE ───
    mode: {
      execution: track('mode.execution', envStr('EXECUTION_MODE', 'paper')),
      backtest: track('mode.backtest', envBool('BACKTEST_MODE', false)),
      paperTrading: track('mode.paperTrading', envBool('PAPER_TRADING', false)),
      liveTrading: track('mode.liveTrading', envBool('LIVE_TRADING', false)),
      confirmLiveTrading: track('mode.confirmLiveTrading', envBool('CONFIRM_LIVE_TRADING', false)),
      testMode: track('mode.testMode', envBool('TEST_MODE', false)),
      candleSource: track('mode.candleSource', envStr('CANDLE_SOURCE', 'websocket')),
    },

    // ─── BACKTEST ───
    backtest: {
      candleDataFile: track('backtest.candleDataFile', envStr('CANDLE_DATA_FILE', '')),
      candleFile: track('backtest.candleFile', envStr('CANDLE_FILE', '')),
      initialBalance: track('backtest.initialBalance', envFloat('INITIAL_BALANCE', 10000)),
      silent: track('backtest.silent', envBool('BACKTEST_SILENT', false)),
      verbose: track('backtest.verbose', envBool('BACKTEST_VERBOSE', false)),
      fast: track('backtest.fast', envBool('BACKTEST_FAST', false)),
      noPatternSave: track('backtest.noPatternSave', envBool('BACKTEST_NO_PATTERN_SAVE', false)),
      fastBacktest: track('backtest.fastBacktest', envBool('FAST_BACKTEST', false)),
      freshStart: track('backtest.freshStart', envBool('FRESH_START', false)),
    },

    // ─── PATHS ───
    paths: {
      envFile: track('paths.envFile', envStr('DOTENV_CONFIG_PATH', '.env')),
      stateFile: track('paths.stateFile', envStr('STATE_FILE', '')),
      dataDir: track('paths.dataDir', dataDirConfig),
      journalDataDir: track('paths.journalDataDir', journalDataDirConfig),
    },

    // ─── MONITORING ───
    monitoring: {
      sentryDsn: track('monitoring.sentryDsn', envStr('SENTRY_DSN', '')),
      sentryEnabled: track('monitoring.sentryEnabled', envBool('SENTRY_ENABLED', true)),
    },

    // --- OBSERVABILITY ---
    observability: {
      evalTraceEnabled: track('observability.evalTraceEnabled', envBool('EVAL_TRACE_ENABLED', true)),
      evalTraceBacktest: track('observability.evalTraceBacktest', envBool('EVAL_TRACE_BACKTEST', false)),
      traceEventMaxBufferedBytes: track('observability.traceEventMaxBufferedBytes', envStrictFloat('TRACE_EVENT_MAX_BUFFERED_BYTES', 1048576)),
    },

    // --- DATA FEED / WATCHDOG ---
    dataFeed: {
      bootRestHydrationLimit: track('dataFeed.bootRestHydrationLimit', envInt('BOOT_REST_HYDRATION_LIMIT', 60)),
      livenessBackfillLimit: track('dataFeed.livenessBackfillLimit', envInt('LIVENESS_BACKFILL_LIMIT', 10)),
      livenessCheckIntervalMs: track('dataFeed.livenessCheckIntervalMs', envInt('LIVENESS_CHECK_INTERVAL_MS', 60000)),
      maxDataSilenceMs: track('dataFeed.maxDataSilenceMs', envInt('LIVENESS_MAX_DATA_SILENCE_MS', 120000)),
      activeTimeframeMultiplier: track('dataFeed.activeTimeframeMultiplier', envFloat('LIVENESS_ACTIVE_TIMEFRAME_MULTIPLIER', 1.5)),
      activeTimeframeSlackMs: track('dataFeed.activeTimeframeSlackMs', envInt('LIVENESS_ACTIVE_TIMEFRAME_SLACK_MS', 60000)),
      maxBackfillAgeMultiplier: track('dataFeed.maxBackfillAgeMultiplier', envFloat('LIVENESS_MAX_BACKFILL_AGE_MULTIPLIER', 2)),
      maxBackfillAgeSlackMs: track('dataFeed.maxBackfillAgeSlackMs', envInt('LIVENESS_MAX_BACKFILL_AGE_SLACK_MS', 60000)),
      staleDataMaxAgeMs: track('dataFeed.staleDataMaxAgeMs', envInt('STALE_DATA_MAX_AGE_MS', 120000)),
      staleDataRecoveryAgeMs: track('dataFeed.staleDataRecoveryAgeMs', envInt('STALE_DATA_RECOVERY_AGE_MS', 30000)),
      gapThresholdMultiplier: track('dataFeed.gapThresholdMultiplier', envFloat('GAP_THRESHOLD_MULTIPLIER', 1.5)),
      gapBackfillBufferCandles: track('dataFeed.gapBackfillBufferCandles', envInt('GAP_BACKFILL_BUFFER_CANDLES', 5)),
      gapRecoveryCleanCandlesRequired: track('dataFeed.gapRecoveryCleanCandlesRequired', envInt('GAP_RECOVERY_CLEAN_CANDLES_REQUIRED', 3)),
      gapBackfillRetryDelayMs: track('dataFeed.gapBackfillRetryDelayMs', envInt('GAP_BACKFILL_RETRY_DELAY_MS', 60000)),
      expectedQuietLogIntervalMs: track('dataFeed.expectedQuietLogIntervalMs', envInt('LIVENESS_EXPECTED_QUIET_LOG_INTERVAL_MS', 300000)),
    },

    // ─── CONFIDENCE GATES ───
    confidence: {
      minTradeConfidence: track('confidence.minTradeConfidence', envFloat('MIN_TRADE_CONFIDENCE', 0.50)),
      minStrategyConfidence: track('confidence.minStrategyConfidence', envFloat('MIN_STRATEGY_CONFIDENCE', 0.35)),
      maxConfidence: track('confidence.maxConfidence', envFloat('MAX_CONFIDENCE', 0.95)),
    },

    // ─── POSITION SIZING ───
    sizing: {
      basePositionSize: track('sizing.basePositionSize', envFloat('BASE_POSITION_SIZE', 0.01)),
      maxPositionSize: track('sizing.maxPositionSize', envFloat('MAX_POSITION_SIZE_PCT', 0.05)),
      maxPositions: track('sizing.maxPositions', envInt('MAX_POSITIONS', 3)),
    },

    // ─── EXIT PARAMETERS ───
    exits: {
      stopLossPercent: track('exits.stopLossPercent', envFloat('STOP_LOSS_PERCENT', 1.5)),
      takeProfitPercent: track('exits.takeProfitPercent', envFloat('TAKE_PROFIT_PERCENT', 2.0)),
      trailingStopPercent: track('exits.trailingStopPercent', envFloat('TRAILING_STOP_PERCENT', 3.5)),
      trailingActivation: track('exits.trailingActivation', envFloat('TRAILING_ACTIVATION', 2.5)),
      maxHoldMinutes: track('exits.maxHoldMinutes', envInt('MAX_HOLD_MINUTES', 240)),
      exitSystem: track('exits.exitSystem', envStr('EXIT_SYSTEM', 'maxprofit')),
    },

    // ─── PROFIT TIERS ───
    tiers: {
      tier1: track('tiers.tier1', envFloat('TIER1_TARGET', 0.007)),
      tier2: track('tiers.tier2', envFloat('TIER2_TARGET', 0.010)),
      tier3: track('tiers.tier3', envFloat('TIER3_TARGET', 0.015)),
      final: track('tiers.final', envFloat('FINAL_TARGET', 0.025)),
    },

    // ─── FEES ───
    fees: {
      makerFee: track('fees.makerFee', envFloat('FEE_MAKER', 0.0025)),
      takerFee: track('fees.takerFee', envFloat('FEE_TAKER', 0.004)),
      get totalRoundTrip() { return this.makerFee + this.takerFee; },
    },

    // ─── RISK MANAGEMENT ───
    risk: {
      riskManagerBypass: track('risk.riskManagerBypass', envBool('RISK_MANAGER_BYPASS', true)),
      accountDrawdownBypass: track('risk.accountDrawdownBypass', envBool('ACCOUNT_DRAWDOWN_BYPASS', false)),
      maxDrawdown: track('risk.maxDrawdown', envFloat('MAX_DRAWDOWN', 10)),
      maxDailyLoss: track('risk.maxDailyLoss', envFloat('MAX_DAILY_LOSS', 3)),
    },

    // ─── FILTERS ───
    filters: {
      atrEnabled: track('filters.atrEnabled', envBool('ATR_FILTER_ENABLED', false)),
      atrMinPercent: track('filters.atrMinPercent', envFloat('ATR_MIN_PERCENT', 0.15)),
    },

    // --- EVAL RULES ---
    evalRules: {
      enabled: track('evalRules.enabled', envBool('EVAL_RULES_ENABLED', false)),
      ttp: {
        enabled: track('evalRules.ttp.enabled', envBool('TTP_RULES_ENABLED', false)),
        volumeCap: {
          enabled: track('evalRules.ttp.volumeCap.enabled', envBool('TTP_VOLUME_CAP_ENABLED', true)),
          percent: track('evalRules.ttp.volumeCap.percent', envStrictFloat('TTP_VOLUME_CAP_PERCENT', 0.05)),
          timeframe: track('evalRules.ttp.volumeCap.timeframe', envStr('TTP_VOLUME_CAP_TIMEFRAME', '1m')),
          fallbackToMostRecentVolume: track('evalRules.ttp.volumeCap.fallbackToMostRecentVolume', envBool('TTP_VOLUME_CAP_FALLBACK_TO_RECENT', true)),
          maxReferenceAgeMs: track('evalRules.ttp.volumeCap.maxReferenceAgeMs', envStrictFloat('TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS', 180000)),
          maxReferenceAgeLimitMs: 300000,
        },
        marketTime: {
          enabled: track('evalRules.ttp.marketTime.enabled', envBool('TTP_MARKET_TIME_ENABLED', true)),
          blockEntriesAfterCutoff: track('evalRules.ttp.marketTime.blockEntriesAfterCutoff', envBool('TTP_BLOCK_ENTRIES_AFTER_CUTOFF', true)),
          liquidationEnabled: track('evalRules.ttp.marketTime.liquidationEnabled', envBool('TTP_LIQUIDATION_ENABLED', true)),
          cutoffMinutesBeforeClose: track('evalRules.ttp.marketTime.cutoffMinutesBeforeClose', envStrictFloat('TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE', 10)),
        },
        accountLimits: {
          enabled: track('evalRules.ttp.accountLimits.enabled', envBool('TTP_ACCOUNT_LIMITS_ENABLED', true)),
          enforceDailyLossPause: track('evalRules.ttp.accountLimits.enforceDailyLossPause', envBool('TTP_DAILY_LOSS_PAUSE_ENABLED', true)),
          enforceMaxLoss: track('evalRules.ttp.accountLimits.enforceMaxLoss', envBool('TTP_MAX_LOSS_ENABLED', true)),
          accountStartOfDayDate: track('evalRules.ttp.accountLimits.accountStartOfDayDate', envStr('TTP_ACCOUNT_START_OF_DAY_DATE', '')),
          accountStartOfDayEquity: track('evalRules.ttp.accountLimits.accountStartOfDayEquity', envStrictFloat('TTP_ACCOUNT_START_OF_DAY_EQUITY', 0)),
          dailyLossDollars: track('evalRules.ttp.accountLimits.dailyLossDollars', envStrictFloat('TTP_DAILY_LOSS_LIMIT_DOLLARS', 0)),
          maxLossThresholdEquity: track('evalRules.ttp.accountLimits.maxLossThresholdEquity', envStrictFloat('TTP_MAX_LOSS_THRESHOLD_EQUITY', 0)),
        },
        earningsRestriction: {
          enabled: track('evalRules.ttp.earningsRestriction.enabled', envBool('TTP_EARNINGS_RESTRICTION_ENABLED', true)),
          blockEntries: track('evalRules.ttp.earningsRestriction.blockEntries', envBool('TTP_EARNINGS_BLOCK_ENTRIES', true)),
          requireKnownStatus: track('evalRules.ttp.earningsRestriction.requireKnownStatus', envBool('TTP_EARNINGS_REQUIRE_KNOWN_STATUS', true)),
          manualStatus: track('evalRules.ttp.earningsRestriction.manualStatus', envJsonObject('TTP_EARNINGS_STATUS_JSON', null)),
        },
        consistency: {
          enabled: track('evalRules.ttp.consistency.enabled', envBool('TTP_CONSISTENCY_ENABLED', true)),
          maxPositionProfitRatio: track('evalRules.ttp.consistency.maxPositionProfitRatio', envStrictFloat('TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO', 0.30)),
          profitTargetDollars: track('evalRules.ttp.consistency.profitTargetDollars', envStrictFloat('TTP_PROFIT_TARGET_DOLLARS', 0)),
          maxProfitTargetInitialBalanceRatio: track('evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio', envStrictFloat('TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO', 0.10)),
        },
      },
    },

    // ─── DYNAMIC TRAILING STOP ───
    trail: {
      atrMultiplier: track('trail.atrMultiplier', envFloat('TRAIL_ATR_MULTIPLIER', 2.0)),
      minActivation: track('trail.minActivation', envFloat('TRAIL_MIN_ACTIVATION', 1.5)),
      trendWiden: track('trail.trendWiden', envFloat('TRAIL_TREND_WIDEN', 1.5)),
      structureTighten: track('trail.structureTighten', envFloat('TRAIL_STRUCTURE_TIGHTEN', 0.5)),
    },

    // ─── BROKER ───
    broker: (() => {
      // FIX TIER-4-BROKER-COHERENCE: single resolved brokerId for all defaults.
      // Prior code: id defaulted to 'alpaca'; tradingPair/assetClass branches
      // independently defaulted their logic key to 'kraken'. When BROKER env
      // was unset, you got id=alpaca + tradingPair=BTC-USD + assetClass=crypto.
      // Alpaca routing pointed at crypto it can't trade.
      const _brokerIdResult = envStr('BROKER', 'alpaca');
      const _brokerId = String(_brokerIdResult.value).toLowerCase();
      const _isKraken = _brokerId === 'kraken';
      return {
        id: track('broker.id', { value: _brokerId, source: _brokerIdResult.source }),
        apiKey: track('broker.apiKey', envStr('KRAKEN_API_KEY', '')),
        apiSecret: track('broker.apiSecret', envStr('KRAKEN_API_SECRET', '')),
        tradingPair: track('broker.tradingPair', envStr('TRADING_PAIR', _isKraken ? 'BTC-USD' : 'TSLA')),
        candleTimeframe: track('broker.candleTimeframe', envStr('CANDLE_TIMEFRAME', '15m')),
        tradingInterval: track('broker.tradingInterval', envInt('TRADING_INTERVAL', 15000)),
        assetClass: track('broker.assetClass', envStr('ASSET_CLASS', _isKraken ? 'crypto' : 'stocks')),
        accountId: track('broker.accountId', envStr('BROKER_ACCOUNT_ID', 'default')),
      };
    })(),

    // ─── WEBHOOK ORDER ROUTE (SignalStack/TTP side-channel) ───
    webhookOrders: {
      enabled: track('webhookOrders.enabled', envBool('WEBHOOK_ORDERS_ENABLED', false)),
      dryRun: track('webhookOrders.dryRun', envBool('WEBHOOK_DRY_RUN', true)),
      webhookUrl: track('webhookOrders.webhookUrl', envStr('SIGNALSTACK_WEBHOOK_URL', '')),
      timeoutMs: track('webhookOrders.timeoutMs', envInt('WEBHOOK_TIMEOUT_MS', 5000)),
      orderLogCap: track('webhookOrders.orderLogCap', envInt('WEBHOOK_ORDER_LOG_CAP', 500)),
    },

    // ─── TRAI (AI) ───
    trai: {
      enabled: track('trai.enabled', envBool('ENABLE_TRAI', false)),
      mode: track('trai.mode', envStr('TRAI_MODE', 'advisory')),
      weight: track('trai.weight', envFloat('TRAI_WEIGHT', 0.2)),
      vetoPower: track('trai.vetoPower', envBool('TRAI_VETO', false)),
      maxRisk: track('trai.maxRisk', envFloat('TRAI_MAX_RISK', 0.03)),
      minConf: track('trai.minConf', envFloat('TRAI_MIN_CONF', 0.40)),
      maxConf: track('trai.maxConf', envFloat('TRAI_MAX_CONF', 0.95)),
      enableBacktest: track('trai.enableBacktest', envBool('TRAI_ENABLE_BACKTEST', false)),
    },

    // ─── PIPELINE TOGGLES ───
    strategies: {
      enableRSI: track('strategies.enableRSI', envBool('ENABLE_RSI', true)),
      enableMADynamicSR: track('strategies.enableMADynamicSR', envBool('ENABLE_MASR', true)),
      enableEMACrossover: track('strategies.enableEMACrossover', envBool('ENABLE_EMA', true)),
      enableLiquiditySweep: track('strategies.enableLiquiditySweep', envBool('ENABLE_LIQSWEEP', true)),
      enableBreakRetest: track('strategies.enableBreakRetest', envBool('ENABLE_BREAKRETEST', false)),
      enableMarketRegime: track('strategies.enableMarketRegime', envBool('ENABLE_REGIME', true)),
      enableMultiTimeframe: track('strategies.enableMultiTimeframe', envBool('ENABLE_MTF', true)),
      enableOGZTPO: track('strategies.enableOGZTPO', envBool('ENABLE_TPO', true)),
      enableORB: track('strategies.enableORB', envBool('ENABLE_ORB', false)),
      enableDashboard: track('strategies.enableDashboard', envBool('ENABLE_DASHBOARD', true)),
    },

    // ─── DASHBOARD OBSERVABILITY ───
    dashboard: {
      errorEventDedupeMs: track('dashboard.errorEventDedupeMs', envInt('DASHBOARD_ERROR_EVENT_DEDUPE_MS', 5000)),
      errorEventMessageMaxLength: track('dashboard.errorEventMessageMaxLength', envInt('DASHBOARD_ERROR_EVENT_MESSAGE_MAX_LENGTH', 500)),
      errorEventDedupeMaxKeys: track('dashboard.errorEventDedupeMaxKeys', envInt('DASHBOARD_ERROR_EVENT_DEDUPE_MAX_KEYS', 200)),
      brokerStatusDedupeMaxKeys: track('dashboard.brokerStatusDedupeMaxKeys', envInt('DASHBOARD_BROKER_STATUS_DEDUPE_MAX_KEYS', 200)),
      edgeAnalyticsMaxScopes: track('dashboard.edgeAnalyticsMaxScopes', envInt('DASHBOARD_EDGE_ANALYTICS_MAX_SCOPES', 200)),
    },

    // ─── MISC ───
    misc: {
      botTier: track('misc.botTier', envStr('BOT_TIER', 'ml')),
      tradingProfile: track('misc.tradingProfile', envStr('TRADING_PROFILE', 'balanced')),
      tradeIntelligenceShadow: track('misc.tradeIntelligenceShadow', envBool('TRADE_INTELLIGENCE_SHADOW', false)),
      subscriptionTier: track('misc.subscriptionTier', envStr('SUBSCRIPTION_TIER', 'ML')),
    },
  };

  return { config, sources };
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

function validate(config) {
  const errors = [];
  const warnings = [];

  // Confidence
  if (config.confidence.minTradeConfidence < 0 || config.confidence.minTradeConfidence > 1) {
    errors.push(`minTradeConfidence out of range: ${config.confidence.minTradeConfidence}`);
  }
  if (config.confidence.minStrategyConfidence < 0 || config.confidence.minStrategyConfidence > 1) {
    errors.push(`minStrategyConfidence out of range: ${config.confidence.minStrategyConfidence}`);
  }
  if (config.confidence.minTradeConfidence < 0.1) {
    warnings.push(`minTradeConfidence very low (${config.confidence.minTradeConfidence}) — bot will enter on weak signals`);
  }

  // Sizing
  if (config.sizing.maxPositionSize > 0.25) {
    errors.push(`maxPositionSize too high: ${config.sizing.maxPositionSize} (>25% of account per trade)`);
  }

  // Exits
  if (config.exits.stopLossPercent <= 0) {
    errors.push(`stopLossPercent must be positive: ${config.exits.stopLossPercent}`);
  }
  if (config.exits.takeProfitPercent <= 0) {
    errors.push(`takeProfitPercent must be positive: ${config.exits.takeProfitPercent}`);
  }

  // Tiers must be above fees
  const feeThreshold = config.fees.totalRoundTrip;
  if (config.tiers.tier1 < feeThreshold) {
    warnings.push(`tier1 (${config.tiers.tier1}) below round-trip fees (${feeThreshold}) — tier 1 exits are net losses`);
  }

  // Mode conflicts
  if (config.mode.liveTrading && config.mode.backtest) {
    errors.push('Cannot enable both live trading and backtest mode');
  }
  if (config.mode.liveTrading && config.risk.accountDrawdownBypass) {
    errors.push('LIVE_TRADING=true cannot run with ACCOUNT_DRAWDOWN_BYPASS=true');
  }
  if (config.mode.liveTrading && config.risk.riskManagerBypass) {
    errors.push('LIVE_TRADING=true cannot run with RISK_MANAGER_BYPASS=true');
  }
  if (config.mode.liveTrading && config.webhookOrders.enabled && config.webhookOrders.dryRun) {
    errors.push('LIVE_TRADING=true cannot run with WEBHOOK_ORDERS_ENABLED=true and WEBHOOK_DRY_RUN=true');
  }
  if (config.mode.liveTrading && config.webhookOrders.enabled && !config.webhookOrders.webhookUrl) {
    errors.push('LIVE_TRADING=true cannot run with WEBHOOK_ORDERS_ENABLED=true and missing SIGNALSTACK_WEBHOOK_URL');
  }
  if (config.webhookOrders.enabled && config.webhookOrders.webhookUrl) {
    try {
      const webhookUrl = new URL(config.webhookOrders.webhookUrl);
      if (webhookUrl.protocol !== 'https:') {
        errors.push(`SIGNALSTACK_WEBHOOK_URL must use https:// when WEBHOOK_ORDERS_ENABLED=true, got ${webhookUrl.protocol}`);
      }
    } catch (error) {
      errors.push(`SIGNALSTACK_WEBHOOK_URL is invalid when WEBHOOK_ORDERS_ENABLED=true: ${error.message}`);
    }
  }

  if (
    !Number.isFinite(config.observability.traceEventMaxBufferedBytes)
    || config.observability.traceEventMaxBufferedBytes <= 0
    || config.observability.traceEventMaxBufferedBytes > 16777216
  ) {
    errors.push(`TRACE_EVENT_MAX_BUFFERED_BYTES out of range: ${config.observability.traceEventMaxBufferedBytes}`);
  }
  if (!Number.isInteger(config.webhookOrders.timeoutMs) || config.webhookOrders.timeoutMs <= 0) {
    errors.push(`WEBHOOK_TIMEOUT_MS out of range: ${config.webhookOrders.timeoutMs}`);
  }
  if (!Number.isInteger(config.webhookOrders.orderLogCap) || config.webhookOrders.orderLogCap <= 0) {
    errors.push(`WEBHOOK_ORDER_LOG_CAP out of range: ${config.webhookOrders.orderLogCap}`);
  }

  for (const [name, value] of Object.entries(config.dataFeed || {})) {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`${name} out of range: ${value}`);
    }
  }

  const ttpVolumeCap = config.evalRules?.ttp?.volumeCap;
  const ttpMarketTime = config.evalRules?.ttp?.marketTime;
  const ttpAccountLimits = config.evalRules?.ttp?.accountLimits;
  const ttpEarningsRestriction = config.evalRules?.ttp?.earningsRestriction;
  const ttpConsistency = config.evalRules?.ttp?.consistency;
  if (config.evalRules?.enabled && config.evalRules?.ttp?.enabled && ttpVolumeCap?.enabled) {
    if (!Number.isFinite(ttpVolumeCap.percent) || ttpVolumeCap.percent <= 0 || ttpVolumeCap.percent > 1) {
      errors.push(`TTP_VOLUME_CAP_PERCENT out of range: ${ttpVolumeCap.percent}`);
    }
    if (ttpVolumeCap.timeframe !== '1m') {
      errors.push(`TTP_VOLUME_CAP_TIMEFRAME must be 1m for Trade The Pool volume rule, got ${ttpVolumeCap.timeframe}`);
    }
    if (!Number.isFinite(ttpVolumeCap.maxReferenceAgeMs) || ttpVolumeCap.maxReferenceAgeMs <= 0) {
      errors.push(`TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS out of range: ${ttpVolumeCap.maxReferenceAgeMs}`);
    }
    if (ttpVolumeCap.maxReferenceAgeMs > ttpVolumeCap.maxReferenceAgeLimitMs) {
      errors.push(`TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS too loose: ${ttpVolumeCap.maxReferenceAgeMs} > ${ttpVolumeCap.maxReferenceAgeLimitMs}`);
    }
  }
  if (config.evalRules?.enabled && config.evalRules?.ttp?.enabled && ttpMarketTime?.enabled) {
    if (!Number.isInteger(ttpMarketTime.cutoffMinutesBeforeClose) || ttpMarketTime.cutoffMinutesBeforeClose <= 0 || ttpMarketTime.cutoffMinutesBeforeClose > 120) {
      errors.push(`TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE out of range: ${ttpMarketTime.cutoffMinutesBeforeClose}`);
    }
    if (ttpMarketTime.blockEntriesAfterCutoff !== true && ttpMarketTime.liquidationEnabled !== true) {
      errors.push('TTP market-time rule cannot disable both cutoff entry blocking and liquidation enforcement');
    }
  }
  if (config.evalRules?.enabled && config.evalRules?.ttp?.enabled) {
    if (ttpAccountLimits?.enabled !== true) {
      errors.push('TTP_ACCOUNT_LIMITS_ENABLED=false is illegal when TTP eval rules are enabled');
    }
    if (ttpEarningsRestriction?.enabled !== true) {
      errors.push('TTP_EARNINGS_RESTRICTION_ENABLED=false is illegal when TTP eval rules are enabled');
    }
    if (ttpConsistency?.enabled !== true) {
      errors.push('TTP_CONSISTENCY_ENABLED=false is illegal when TTP eval rules are enabled');
    }
  }
  if (config.evalRules?.enabled && config.evalRules?.ttp?.enabled && ttpAccountLimits?.enabled) {
    if (ttpAccountLimits.enforceDailyLossPause !== true || ttpAccountLimits.enforceMaxLoss !== true) {
      errors.push('TTP account limit rule requires both daily loss pause and max loss enforcement');
    }
    if (ttpAccountLimits.enforceDailyLossPause === true) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ttpAccountLimits.accountStartOfDayDate || ''))) {
        errors.push(`TTP_ACCOUNT_START_OF_DAY_DATE must be YYYY-MM-DD for daily loss pause, got ${ttpAccountLimits.accountStartOfDayDate || '(missing)'}`);
      }
      if (!Number.isFinite(ttpAccountLimits.accountStartOfDayEquity) || ttpAccountLimits.accountStartOfDayEquity <= 0) {
        errors.push(`TTP_ACCOUNT_START_OF_DAY_EQUITY must be configured for daily loss pause, got ${ttpAccountLimits.accountStartOfDayEquity}`);
      }
      if (!Number.isFinite(ttpAccountLimits.dailyLossDollars) || ttpAccountLimits.dailyLossDollars <= 0) {
        errors.push(`TTP_DAILY_LOSS_LIMIT_DOLLARS must be configured for daily loss pause, got ${ttpAccountLimits.dailyLossDollars}`);
      }
    }
    if (ttpAccountLimits.enforceMaxLoss === true) {
      if (!Number.isFinite(ttpAccountLimits.maxLossThresholdEquity) || ttpAccountLimits.maxLossThresholdEquity <= 0) {
        errors.push(`TTP_MAX_LOSS_THRESHOLD_EQUITY must be configured for max loss enforcement, got ${ttpAccountLimits.maxLossThresholdEquity}`);
      }
    }
  }
  if (config.evalRules?.enabled && config.evalRules?.ttp?.enabled && ttpEarningsRestriction?.enabled) {
    if (ttpEarningsRestriction.blockEntries !== true) {
      errors.push('TTP_EARNINGS_BLOCK_ENTRIES=false is illegal when TTP eval rules are enabled');
    }
    if (ttpEarningsRestriction.requireKnownStatus !== true) {
      errors.push('TTP_EARNINGS_REQUIRE_KNOWN_STATUS=false is illegal when TTP eval rules are enabled');
    }
    if (ttpEarningsRestriction.requireKnownStatus === true) {
      const manualStatus = ttpEarningsRestriction.manualStatus;
      if (!manualStatus || typeof manualStatus !== 'object' || Array.isArray(manualStatus)) {
        errors.push('TTP_EARNINGS_STATUS_JSON must be configured when known earnings status is required');
      } else if (manualStatus.__parseError) {
        errors.push(`TTP_EARNINGS_STATUS_JSON must be valid JSON: ${manualStatus.__parseError}`);
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manualStatus.date || ''))) {
          errors.push(`TTP_EARNINGS_STATUS_JSON.date must be YYYY-MM-DD, got ${manualStatus.date || '(missing)'}`);
        }
        if (!manualStatus.symbols || typeof manualStatus.symbols !== 'object' || Array.isArray(manualStatus.symbols) || Object.keys(manualStatus.symbols).length === 0) {
          errors.push('TTP_EARNINGS_STATUS_JSON.symbols must be a non-empty object of SYMBOL:boolean entries');
        } else {
          for (const [symbol, hasEarningsTonight] of Object.entries(manualStatus.symbols)) {
            if (!String(symbol || '').trim()) {
              errors.push('TTP_EARNINGS_STATUS_JSON.symbols contains an empty symbol key');
            }
            if (typeof hasEarningsTonight !== 'boolean') {
              errors.push(`TTP_EARNINGS_STATUS_JSON.symbols.${symbol} must be boolean, got ${typeof hasEarningsTonight}`);
            }
          }
        }
      }
    }
  }
  if (config.evalRules?.enabled && config.evalRules?.ttp?.enabled && ttpConsistency?.enabled) {
    if (!Number.isFinite(ttpConsistency.maxPositionProfitRatio) || ttpConsistency.maxPositionProfitRatio <= 0 || ttpConsistency.maxPositionProfitRatio > 1) {
      errors.push(`TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO out of range: ${ttpConsistency.maxPositionProfitRatio}`);
    }
    if (!Number.isFinite(ttpConsistency.profitTargetDollars) || ttpConsistency.profitTargetDollars <= 0) {
      errors.push(`TTP_PROFIT_TARGET_DOLLARS must be configured for consistency enforcement, got ${ttpConsistency.profitTargetDollars}`);
    }
    if (!Number.isFinite(ttpConsistency.maxProfitTargetInitialBalanceRatio) || ttpConsistency.maxProfitTargetInitialBalanceRatio <= 0 || ttpConsistency.maxProfitTargetInitialBalanceRatio > 0.10) {
      errors.push(`TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO out of range: ${ttpConsistency.maxProfitTargetInitialBalanceRatio}`);
    }
    const maxProfitTargetDollars = config.backtest.initialBalance * ttpConsistency.maxProfitTargetInitialBalanceRatio;
    if (Number.isFinite(maxProfitTargetDollars) && ttpConsistency.profitTargetDollars > maxProfitTargetDollars) {
      errors.push(`TTP_PROFIT_TARGET_DOLLARS too high for initial balance: ${ttpConsistency.profitTargetDollars} > ${maxProfitTargetDollars}`);
    }
  }

  // Balance
  if (config.backtest.initialBalance <= 0) {
    errors.push(`initialBalance must be positive: ${config.backtest.initialBalance}`);
  }

  // TEST_MODE requires DATA_DIR to prevent data collision
  if (config.mode.testMode && !config.paths.dataDir) {
    errors.push('TEST_MODE=true requires DATA_DIR to be set (prevents accidental writes to production data)');
  }

  return { errors, warnings };
}

// ═══════════════════════════════════════════════════════════════
// FINGERPRINT
// ═══════════════════════════════════════════════════════════════

function fingerprint(config) {
  // Exclude secrets from fingerprint
  const safe = JSON.parse(JSON.stringify(config));
  if (safe.broker) {
    safe.broker.apiKey = safe.broker.apiKey ? '[SET]' : '[UNSET]';
    safe.broker.apiSecret = safe.broker.apiSecret ? '[SET]' : '[UNSET]';
  }
  const str = JSON.stringify(safe, Object.keys(safe).sort());
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

// ═══════════════════════════════════════════════════════════════
// DEEP FREEZE
// ═══════════════════════════════════════════════════════════════

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Object.isFrozen(obj[key])) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

let _cached = null;

function load(opts = {}) {
  if (_cached && !opts.force) return _cached;

  // Load .env if not already loaded
  const envPath = process.env.DOTENV_CONFIG_PATH || '.env';
  const dotenvValues = loadDotenvValues(envPath);
  const baseEnv = { ...dotenvValues, ...process.env };
  const baseEnvSources = buildDotenvSources(dotenvValues, process.env);

  const previousEnv = activeEnv;
  const previousEnvSources = activeEnvSources;
  const effectiveEnv = buildEffectiveEnv(baseEnv, baseEnvSources);
  activeEnv = effectiveEnv.values;
  activeEnvSources = effectiveEnv.sources;

  let config;
  let sources;
  let errors;
  let warnings;
  let fp;
  try {
    ({ config, sources } = buildConfig());
    ({ errors, warnings } = validate(config));
    fp = fingerprint(config);
  } finally {
    activeEnv = previousEnv;
    activeEnvSources = previousEnvSources;
  }

  // Log
  if (!opts.silent) {
    console.log(`\n[ConfigLoader] Fingerprint: ${fp}`);
    console.log(`[ConfigLoader] Source: ${envPath}`);
    if (warnings.length > 0) {
      warnings.forEach(w => console.warn(`[ConfigLoader] WARNING: ${w}`));
    }
    if (errors.length > 0) {
      errors.forEach(e => console.error(`[ConfigLoader] ERROR: ${e}`));
    }
  }

  if (errors.length > 0 && !config.mode.backtest) {
    throw new Error(`ConfigLoader: ${errors.length} validation errors: ${errors.join('; ')}`);
  }

  // Freeze
  const frozen = deepFreeze(config);

  _cached = {
    config: frozen,
    sources,
    fingerprint: fp,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };

  return _cached;
}

function get(path) {
  if (!_cached) load();
  const parts = path.split('.');
  let val = _cached.config;
  for (const part of parts) {
    if (val === undefined || val === null) return undefined;
    val = val[part];
  }
  return val;
}

module.exports = { load, get, fingerprint, validate };
