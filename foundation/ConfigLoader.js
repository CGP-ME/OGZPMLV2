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
const tradingConfigFile = require('../config/trading.config.json');

const REQUIRED_RISK_SOURCE_PATHS = Object.freeze([
  'risk.riskManagerBypass',
  'risk.maxDrawdown',
  'risk.maxDailyLoss',
  'risk.maxWeeklyLoss',
  'risk.maxMonthlyLoss',
]);

function requiredConfiguredNumber(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (!Number.isFinite(value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} must be a finite number`);
  }
  return value;
}

function requiredConfiguredBool(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (typeof value !== 'boolean') {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} must be a boolean`);
  }
  return value;
}

const LIVE_MIN_TRADE_CONFIDENCE_FLOOR = requiredConfiguredNumber('confidence.minTradeConfidence');

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
  const liveExecutionRequested = effectiveEnv.EXECUTION_MODE === 'live' ||
    effectiveEnv.TRADING_MODE === 'live' ||
    effectiveEnv.ENABLE_LIVE_TRADING === 'true';
  if (liveExecutionRequested) {
    effectiveEnv.LIVE_TRADING = 'true';
    if (sourceEnv.LIVE_TRADING !== 'true' && sourceEnv.LIVE_TRADING !== '1') {
      sources.LIVE_TRADING = 'derived:live-execution-mode';
    }
  }
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
  const feeMakerConfig = envFloat('FEE_MAKER', 0.0025);
  const feeTakerConfig = envFloat('FEE_TAKER', 0.004);
  const feeTotalRoundTripConfig = envFloat(
    'FEE_TOTAL_ROUNDTRIP',
    feeMakerConfig.value + feeTakerConfig.value
  );

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
      minTradeConfidence: track('confidence.minTradeConfidence', envFloat('MIN_TRADE_CONFIDENCE', LIVE_MIN_TRADE_CONFIDENCE_FLOOR)),
      minStrategyConfidence: track('confidence.minStrategyConfidence', envFloat('MIN_STRATEGY_CONFIDENCE', requiredConfiguredNumber('confidence.minStrategyConfidence'))),
      maxConfidence: track('confidence.maxConfidence', envFloat('MAX_CONFIDENCE', requiredConfiguredNumber('confidence.maxConfidence'))),
    },

    // ─── POSITION SIZING ───
    sizing: {
      basePositionSize: track('sizing.basePositionSize', envFloat('BASE_POSITION_SIZE', 0.01)),
      maxPositionSize: track('sizing.maxPositionSize', envFloat('MAX_POSITION_SIZE_PCT', 0.05)),
      maxPositions: track('sizing.maxPositions', envInt('MAX_POSITIONS', 3)),
    },

    entryLogic: {
      symbolLossCooldown: {
        enabled: track('entryLogic.symbolLossCooldown.enabled', envBool('SYMBOL_LOSS_COOLDOWN_ENABLED', tradingConfigFile.entryLogic?.symbolLossCooldown?.enabled === true)),
        consecutiveLosses: track('entryLogic.symbolLossCooldown.consecutiveLosses', envInt('SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES', tradingConfigFile.entryLogic?.symbolLossCooldown?.consecutiveLosses || 2)),
        cooldownMinutes: track('entryLogic.symbolLossCooldown.cooldownMinutes', envFloat('SYMBOL_LOSS_COOLDOWN_MINUTES', tradingConfigFile.entryLogic?.symbolLossCooldown?.cooldownMinutes || 120)),
      },
    },

    // ─── EXIT PARAMETERS ───
    exits: {
      stopLossPercent: track('exits.stopLossPercent', envFloat('STOP_LOSS_PERCENT', requiredConfiguredNumber('exits.stopLossPercent'))),
      takeProfitPercent: track('exits.takeProfitPercent', envFloat('TAKE_PROFIT_PERCENT', requiredConfiguredNumber('exits.takeProfitPercent'))),
      trailingStopPercent: track('exits.trailingStopPercent', envFloat('TRAILING_STOP_PERCENT', requiredConfiguredNumber('exits.trailingStopPercent'))),
      trailingActivation: track('exits.trailingActivation', envFloat('TRAILING_ACTIVATION', requiredConfiguredNumber('exits.trailingActivation'))),
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
      model: track('fees.model', envStr('FEE_MODEL', 'percent')),
      makerFee: track('fees.makerFee', feeMakerConfig),
      takerFee: track('fees.takerFee', feeTakerConfig),
      totalRoundTrip: track('fees.totalRoundTrip', feeTotalRoundTripConfig),
      perShare: track('fees.perShare', envFloat('FEE_PER_SHARE', 0)),
      minOrderFee: track('fees.minOrderFee', envFloat('FEE_MIN_ORDER', 0)),
    },

    // ─── RISK MANAGEMENT ───
    risk: {
      riskManagerBypass: track('risk.riskManagerBypass', envBool('RISK_MANAGER_BYPASS', true)),
      accountDrawdownBypass: track('risk.accountDrawdownBypass', envBool('ACCOUNT_DRAWDOWN_BYPASS', false)),
      maxDrawdown: track('risk.maxDrawdown', envFloat('MAX_DRAWDOWN', requiredConfiguredNumber('risk.maxDrawdown'))),
      maxDailyLoss: track('risk.maxDailyLoss', envFloat('MAX_DAILY_LOSS', requiredConfiguredNumber('risk.maxDailyLoss'))),
      maxWeeklyLoss: track('risk.maxWeeklyLoss', envFloat('MAX_WEEKLY_LOSS', 10)),
      maxMonthlyLoss: track('risk.maxMonthlyLoss', envFloat('MAX_MONTHLY_LOSS', 20)),
    },

    // ─── FILTERS ───
    filters: {
      atrEnabled: track('filters.atrEnabled', envBool('ATR_FILTER_ENABLED', requiredConfiguredBool('filters.atrEnabled'))),
      atrMinPercent: track('filters.atrMinPercent', envFloat('ATR_MIN_PERCENT', requiredConfiguredNumber('filters.atrMinPercent'))),
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
          entryBufferMinutesBeforeCutoff: track('evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff', envStrictFloat('TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF', 0)),
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
        alpacaApiKey: track('broker.alpacaApiKey', envStr('ALPACA_API_KEY', '')),
        alpacaApiSecret: track('broker.alpacaApiSecret', envStr('ALPACA_API_SECRET', '')),
        alpacaMode: track('broker.alpacaMode', envStr('ALPACA_MODE', '')),
        alpacaSymbols: track('broker.alpacaSymbols', envStr('ALPACA_SYMBOLS', '')),
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
      enabled: track('trai.enabled', envBool('ENABLE_TRAI', true)),
      mode: track('trai.mode', envStr('TRAI_MODE', 'passive')),
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
      enableBreakRetest: track('strategies.enableBreakRetest', envBool('ENABLE_BREAKRETEST', requiredConfiguredBool('pipeline.enableBreakRetest'))),
      enableMarketRegime: track('strategies.enableMarketRegime', envBool('ENABLE_REGIME', requiredConfiguredBool('pipeline.enableMarketRegime'))),
      enableMultiTimeframe: track('strategies.enableMultiTimeframe', envBool('ENABLE_MTF', true)),
      enableOGZTPO: track('strategies.enableOGZTPO', envBool('ENABLE_TPO', true)),
      enableORB: track('strategies.enableORB', envBool('ENABLE_ORB', requiredConfiguredBool('pipeline.enableOpeningRangeBreakout'))),
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

function isPlaceholderWebhookUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return false;
  try {
    const url = new URL(rawUrl);
    let candidate = [
      url.username,
      url.password,
      url.hostname,
      url.pathname,
      url.search,
    ].join('').toLowerCase();

    for (let i = 0; i < 5; i += 1) {
      const compact = candidate.replace(/[^a-z0-9]/g, '');
      if (candidate.includes('placeholder') || compact.includes('youruniqueid')) {
        return true;
      }
      try {
        const decoded = decodeURIComponent(candidate);
        if (decoded === candidate) break;
        candidate = decoded;
      } catch (_) {
        break;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

function getCurrentNewYorkDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function validate(config, sources = {}) {
  const errors = [];
  const warnings = [];
  const currentNewYorkDate = getCurrentNewYorkDate();

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

  const feeModel = String(config.fees.model || '').trim().toLowerCase();
  // Tiers must be above fees. Percent fees can be checked statically; per-share
  // minimum fees require order quantity/notional and are enforced by FeeModel at runtime.
  if (feeModel === 'percent') {
    const feeThreshold = config.fees.totalRoundTrip;
    if (config.tiers.tier1 < feeThreshold) {
      warnings.push(`tier1 (${config.tiers.tier1}) below round-trip fees (${feeThreshold}) — tier 1 exits are net losses`);
    }
  } else if (feeModel === 'per_share_minimum') {
    warnings.push('tier fee threshold cannot be statically validated for FEE_MODEL=per_share_minimum; runtime fee checks require order quantity/notional');
  }
  if (feeModel !== 'percent' && feeModel !== 'per_share_minimum') {
    errors.push(`FEE_MODEL must be percent or per_share_minimum, got ${config.fees.model}`);
  }
  if (!Number.isFinite(config.fees.makerFee) || config.fees.makerFee < 0) {
    errors.push(`FEE_MAKER out of range: ${config.fees.makerFee}`);
  }
  if (!Number.isFinite(config.fees.takerFee) || config.fees.takerFee < 0) {
    errors.push(`FEE_TAKER out of range: ${config.fees.takerFee}`);
  }
  if (feeModel === 'per_share_minimum') {
    if (!Number.isFinite(config.fees.perShare) || config.fees.perShare < 0) {
      errors.push(`FEE_PER_SHARE out of range: ${config.fees.perShare}`);
    }
    if (!Number.isFinite(config.fees.minOrderFee) || config.fees.minOrderFee < 0) {
      errors.push(`FEE_MIN_ORDER out of range: ${config.fees.minOrderFee}`);
    }
    if (config.fees.perShare === 0 && config.fees.minOrderFee === 0) {
      errors.push('FEE_MODEL=per_share_minimum requires FEE_PER_SHARE or FEE_MIN_ORDER to be positive');
    }
  }

  // Mode conflicts
  if (config.mode.liveTrading && config.mode.backtest) {
    errors.push('Cannot enable both live trading and backtest mode');
  }
  if (config.mode.liveTrading && config.mode.confirmLiveTrading !== true) {
    errors.push('LIVE_TRADING=true cannot run unless CONFIRM_LIVE_TRADING=true');
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
  if (config.mode.liveTrading) {
    const minTradeConfidenceSource = sources['confidence.minTradeConfidence'];
    if (minTradeConfidenceSource !== 'env:MIN_TRADE_CONFIDENCE') {
      errors.push(`LIVE_TRADING=true requires MIN_TRADE_CONFIDENCE from process env, got ${minTradeConfidenceSource || 'missing'} because live confidence must be process-explicit`);
    }
    if (!Number.isFinite(config.confidence.minTradeConfidence) || config.confidence.minTradeConfidence < LIVE_MIN_TRADE_CONFIDENCE_FLOOR) {
      errors.push(`LIVE_TRADING=true requires MIN_TRADE_CONFIDENCE >= ${LIVE_MIN_TRADE_CONFIDENCE_FLOOR}, got ${config.confidence.minTradeConfidence}`);
    }
  }
  if (config.mode.liveTrading && config.evalRules.enabled !== true) {
    errors.push('LIVE_TRADING=true cannot run with EVAL_RULES_ENABLED unset or false because EvalRuleEngine fails open when disabled');
  }
  if (config.mode.liveTrading && config.evalRules.enabled === true && config.evalRules.ttp.enabled !== true) {
    errors.push('LIVE_TRADING=true cannot run with TTP_RULES_ENABLED unset or false while EVAL_RULES_ENABLED=true because TTP rules fail open when disabled');
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
      if (config.webhookOrders.dryRun === false && isPlaceholderWebhookUrl(config.webhookOrders.webhookUrl)) {
        errors.push('WEBHOOK_DRY_RUN=false cannot run with WEBHOOK_ORDERS_ENABLED=true and placeholder SIGNALSTACK_WEBHOOK_URL');
      }
    } catch (error) {
      errors.push(`SIGNALSTACK_WEBHOOK_URL is invalid when WEBHOOK_ORDERS_ENABLED=true: ${error.message}`);
    }
  }

  if (!config.mode.backtest && config.broker.id === 'alpaca') {
    if (!config.broker.alpacaApiKey) {
      errors.push('ALPACA_API_KEY must be configured when BROKER=alpaca outside backtest mode');
    }
    if (!config.broker.alpacaApiSecret) {
      errors.push('ALPACA_API_SECRET must be configured when BROKER=alpaca outside backtest mode');
    }
    if (config.broker.alpacaMode !== 'paper' && config.broker.alpacaMode !== 'live') {
      errors.push(`ALPACA_MODE must be explicitly set to paper or live when BROKER=alpaca outside backtest mode, got ${config.broker.alpacaMode || '(missing)'}`);
    }
    const hasExplicitAlpacaSymbols = !!config.broker.alpacaSymbols && sources['broker.alpacaSymbols'] !== 'default';
    const hasExplicitTradingPair = !!config.broker.tradingPair && sources['broker.tradingPair'] !== 'default';
    if (!hasExplicitAlpacaSymbols && !hasExplicitTradingPair) {
      errors.push('ALPACA_SYMBOLS or TRADING_PAIR must be explicitly configured when BROKER=alpaca outside backtest mode');
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
    if (!Number.isInteger(ttpMarketTime.entryBufferMinutesBeforeCutoff) || ttpMarketTime.entryBufferMinutesBeforeCutoff < 0 || ttpMarketTime.entryBufferMinutesBeforeCutoff > 120) {
      errors.push(`TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF out of range: ${ttpMarketTime.entryBufferMinutesBeforeCutoff}`);
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
      warnings.push('TTP_EARNINGS_RESTRICTION_ENABLED=false; earnings calendar lane will not block entries');
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
        warnings.push(`TTP_ACCOUNT_START_OF_DAY_DATE should be YYYY-MM-DD for daily loss pause, got ${ttpAccountLimits.accountStartOfDayDate || '(missing)'}; daily loss pause will be skipped until refreshed`);
      } else if (config.mode.liveTrading && String(ttpAccountLimits.accountStartOfDayDate) !== currentNewYorkDate) {
        warnings.push(`TTP_ACCOUNT_START_OF_DAY_DATE ${ttpAccountLimits.accountStartOfDayDate} does not match current New York date ${currentNewYorkDate}; daily loss pause will be skipped until refreshed`);
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
      warnings.push('TTP_EARNINGS_BLOCK_ENTRIES=false; earnings calendar lane will not block entries');
    }
    const manualStatus = ttpEarningsRestriction.manualStatus;
    if (manualStatus !== null && manualStatus !== undefined) {
      if (typeof manualStatus !== 'object' || Array.isArray(manualStatus)) {
        warnings.push('TTP_EARNINGS_STATUS_JSON ignored because it is not an object');
      } else if (manualStatus.__parseError) {
        warnings.push(`TTP_EARNINGS_STATUS_JSON parse failed and will be ignored: ${manualStatus.__parseError}`);
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manualStatus.date || ''))) {
          warnings.push(`TTP_EARNINGS_STATUS_JSON.date should be YYYY-MM-DD, got ${manualStatus.date || '(missing)'}; earnings calendar will not block entries`);
        } else if (config.mode.liveTrading && String(manualStatus.date) !== currentNewYorkDate) {
          warnings.push(`TTP_EARNINGS_STATUS_JSON.date ${manualStatus.date} does not match current New York date ${currentNewYorkDate}; earnings calendar will not block entries`);
        }
        if (!manualStatus.symbols || typeof manualStatus.symbols !== 'object' || Array.isArray(manualStatus.symbols) || Object.keys(manualStatus.symbols).length === 0) {
          warnings.push('TTP_EARNINGS_STATUS_JSON.symbols should be a non-empty object of SYMBOL:boolean entries; earnings calendar will not block entries');
        } else {
          for (const [symbol, hasEarningsTonight] of Object.entries(manualStatus.symbols)) {
            if (!String(symbol || '').trim()) {
              warnings.push('TTP_EARNINGS_STATUS_JSON.symbols contains an empty symbol key; ignoring that entry');
            }
            if (typeof hasEarningsTonight !== 'boolean') {
              warnings.push(`TTP_EARNINGS_STATUS_JSON.symbols.${symbol} should be boolean, got ${typeof hasEarningsTonight}; ignoring that entry`);
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

  for (const riskPath of REQUIRED_RISK_SOURCE_PATHS) {
    if (!sources[riskPath] || sources[riskPath] === 'default') {
      errors.push(`${riskPath} requires explicit env/profile source`);
    }
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
    safe.broker.alpacaApiKey = safe.broker.alpacaApiKey ? '[SET]' : '[UNSET]';
    safe.broker.alpacaApiSecret = safe.broker.alpacaApiSecret ? '[SET]' : '[UNSET]';
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

function buildSnapshot(sourceEnv = process.env, opts = {}) {
  const envPath = sourceEnv.DOTENV_CONFIG_PATH || '.env';
  const dotenvValues = opts.loadDotenv === false ? {} : loadDotenvValues(envPath);
  const baseEnv = { ...dotenvValues, ...sourceEnv };
  const baseEnvSources = buildDotenvSources(dotenvValues, sourceEnv);

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
    ({ errors, warnings } = validate(config, sources));
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

  if (errors.length > 0 && (!config.mode.backtest || config.mode.liveTrading)) {
    throw new Error(`ConfigLoader: ${errors.length} validation errors: ${errors.join('; ')}`);
  }

  // Freeze
  const frozen = deepFreeze(config);

  return {
    config: frozen,
    sources,
    fingerprint: fp,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

function snapshot(sourceEnv = process.env, opts = {}) {
  return buildSnapshot(sourceEnv, opts);
}

function load(opts = {}) {
  if (_cached && !opts.force) return _cached;

  _cached = buildSnapshot(process.env, opts);

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

function getSource(path) {
  if (!_cached) load();
  return _cached.sources ? _cached.sources[path] : undefined;
}

function hasLoadedSnapshot() {
  return _cached !== null;
}

function getCachedSnapshot() {
  return _cached;
}

function _resetForTest() {
  _cached = null;
  activeEnv = process.env;
  activeEnvSources = {};
}

module.exports = {
  load,
  get,
  getSource,
  hasLoadedSnapshot,
  getCachedSnapshot,
  fingerprint,
  snapshot,
  validate,
  _resetForTest,
};
