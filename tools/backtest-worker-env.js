'use strict';

const path = require('path');
const TradingConfig = require('../core/TradingConfig');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const {
  DEFAULT_TUNING_PROFILE,
  resolveTuningProfile,
} = require('./tuning-profiles');

const WORKER_ENV_ALLOWLIST = [
  'PATH',
  'NODE_PATH',
  'HOME',
  'USER',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'BACKTEST_OUTPUT_DIR',
  'NODE_OPTIONS',
  'SystemRoot',
  'SYSTEMROOT',
  'ComSpec',
  'COMSPEC',
  'PATHEXT',
  'WINDIR',
];

const CANONICAL_BACKTEST_ENV = TradingConfig.getBacktestWorkerEnvDefaults();
const STOCK_ZERO_FEE_ENV = TradingConfig.getBacktestStockZeroFeeEnv();
const STOCK_BACKTEST_ALPACA_ENV = Object.freeze({
  ALPACA_MODE: 'paper',
  ALPACA_API_KEY: 'backtest-alpaca-key',
  ALPACA_API_SECRET: 'backtest-alpaca-secret',
});

const DIRECTION_FILTER_ALIASES = Object.freeze({
  long: 'long_only',
  short: 'short_only',
});

const VALID_DIRECTION_FILTERS = Object.freeze(new Set([
  'both',
  'long_only',
  'short_only',
]));

const CONFIG_ENV_OVERRIDE_ALLOWLIST = Object.freeze(new Set([
  'ACCOUNT_DRAWDOWN_BYPASS',
  'ATR_FILTER_ENABLED',
  'ATR_MIN_PERCENT',
  'CANDLE_LIMIT',
  'DEBUG_AGG',
  'DEBUG_BRAIN',
  'DIRECTION_FILTER',
  'ENABLE_BREAKRETEST',
  'ENABLE_DONCHIAN',
  'ENABLE_EMA',
  'ENABLE_NOWICK',
  'ENABLE_ORB',
  'ENABLE_SMS',
  'ENABLE_SHORTS',
  'ENABLE_TRAI',
  'FEE_MAKER',
  'FEE_MODEL',
  'FEE_MIN_ORDER',
  'FEE_PER_SHARE',
  'FEE_SAFETY_BUFFER',
  'FEE_SLIPPAGE',
  'FEE_TAKER',
  'FEE_TOTAL_ROUNDTRIP',
  'MAX_POSITION_SIZE_PCT',
  'MAX_DRAWDOWN',
  'MAX_DAILY_LOSS',
  'MAX_WEEKLY_LOSS',
  'MAX_MONTHLY_LOSS',
  'MIN_TRADE_CONFIDENCE',
  'PATTERN_DOMINANCE',
  'RISK_MANAGER_BYPASS',
  'RSI_OVERBOUGHT',
  'RSI_OVERSOLD',
  'SMS_VP_RTH_ONLY',
  'SOLO_STRATEGY',
  'TIER1_TARGET',
  'TIER2_TARGET',
  'TIER3_TARGET',
  'FINAL_TARGET',
]));

const INSTRUMENT_ENV_ALLOWLIST = Object.freeze(new Set([
  'TRADING_PAIR',
  'BROKER',
  'ASSET_CLASS',
  'CANDLE_TIMEFRAME',
]));

const SUMMARY_KEYS = [
  'EXECUTION_MODE',
  'CANDLE_SOURCE',
  'BACKTEST_MODE',
  'TEST_MODE',
  'BACKTEST_FAST',
  'BACKTEST_NO_PATTERN_SAVE',
  'DIRECTION_FILTER',
  'ACCOUNT_DRAWDOWN_BYPASS',
  'RISK_MANAGER_BYPASS',
  'MAX_DRAWDOWN',
  'MAX_DAILY_LOSS',
  'MAX_WEEKLY_LOSS',
  'MAX_MONTHLY_LOSS',
  'EXIT_SYSTEM',
  'TUNING_PROFILE',
  'BACKTEST_TUNING_PROFILE',
  'ENABLE_DYNAMIC_SIZING',
  'BASE_POSITION_SIZE',
  'MAX_POSITION_SIZE_PCT',
  'BASE_POSITION_PCT',
  'MAX_POSITION_PCT',
  'ABSOLUTE_POSITION_CAP',
  'FEE_MODEL',
  'FEE_MAKER',
  'FEE_TAKER',
  'FEE_TOTAL_ROUNDTRIP',
  'FEE_SAFETY_BUFFER',
  'FEE_SLIPPAGE',
  'FEE_PER_SHARE',
  'FEE_MIN_ORDER',
  'ALPACA_MODE',
  'ALPACA_SYMBOLS',
  'TRADING_PAIR',
  'BROKER',
  'ASSET_CLASS',
  'CANDLE_TIMEFRAME',
  'SOLO_STRATEGY',
  'ENABLE_DONCHIAN',
  'ENABLE_EMA',
  'ENABLE_TRAI',
  'ENABLE_SHORTS',
  'ENABLE_SMS',
  'ENABLE_NOWICK',
  'ENABLE_ORB',
  'ENABLE_BREAKRETEST',
  'ATR_FILTER_ENABLED',
  'ATR_MIN_PERCENT',
  'MIN_TRADE_CONFIDENCE',
  'TIER1_TARGET',
  'TIER2_TARGET',
  'TIER3_TARGET',
  'FINAL_TARGET',
  'TIER1_EXIT_FRACTION',
  'TIER2_EXIT_FRACTION',
  'TIER3_EXIT_FRACTION',
];

const FEE_ENV_KEYS = Object.freeze([
  'FEE_MODEL',
  'FEE_MAKER',
  'FEE_TAKER',
  'FEE_TOTAL_ROUNDTRIP',
  'FEE_SAFETY_BUFFER',
  'FEE_SLIPPAGE',
  'FEE_PER_SHARE',
  'FEE_MIN_ORDER',
]);

function buildWorkerBaseEnv(sourceEnv = process.env) {
  const workerBaseEnv = {};
  for (const key of WORKER_ENV_ALLOWLIST) {
    if (sourceEnv[key] !== undefined) {
      workerBaseEnv[key] = sourceEnv[key];
    }
  }
  return workerBaseEnv;
}

function assertEnvKeysAllowed(env, allowlist, label) {
  for (const key of Object.keys(env || {})) {
    if (allowlist.has(key)) continue;
    throw new Error(
      `Disallowed ${label} override '${key}'. Add it to the explicit backtest worker allowlist before using it.`
    );
  }
}

function normalizeDirectionFilter(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }

  const raw = String(value).trim();
  const normalized = DIRECTION_FILTER_ALIASES[raw] || raw;
  if (!VALID_DIRECTION_FILTERS.has(normalized)) {
    throw new Error(
      `Invalid ${label} DIRECTION_FILTER '${raw}'. Expected one of: both, long_only, short_only, long, short.`
    );
  }
  return normalized;
}

function resolveDirectionFilter(sourceEnv = {}, configEnv = {}) {
  return normalizeDirectionFilter(configEnv.DIRECTION_FILTER, 'configEnv')
    || normalizeDirectionFilter(sourceEnv.DIRECTION_FILTER, 'sourceEnv')
    || CANONICAL_BACKTEST_ENV.DIRECTION_FILTER;
}

function resolveFeeEnv(sourceEnv = {}, configEnv = {}) {
  const feeEnv = {};
  const sourceFeeModelExplicit = sourceEnv.FEE_MODEL !== undefined;
  for (const key of FEE_ENV_KEYS) {
    if (configEnv[key] !== undefined) {
      feeEnv[key] = configEnv[key];
    } else if (sourceFeeModelExplicit && sourceEnv[key] !== undefined) {
      feeEnv[key] = sourceEnv[key];
    }
  }
  return feeEnv;
}

function assertStockModeMatchesInstrument(stockMode, instrumentEnv = {}) {
  const assetClass = instrumentEnv.ASSET_CLASS;
  if (!assetClass) {
    throw new Error('Backtest worker instrumentEnv requires ASSET_CLASS');
  }
  if (stockMode && assetClass !== 'stocks') {
    throw new Error(`Backtest stockMode=true requires ASSET_CLASS=stocks, got ${assetClass}`);
  }
  if (!stockMode && assetClass === 'stocks') {
    throw new Error('Backtest stock data requires stockMode=true');
  }
}

function assertInstrumentEnvMatchesDataFile(dataFile, instrumentEnv = {}) {
  const resolved = resolveInstrumentFromDataFile(dataFile);
  const requiredKeys = ['TRADING_PAIR', 'BROKER', 'ASSET_CLASS'];
  if (resolved.CANDLE_TIMEFRAME !== undefined) requiredKeys.push('CANDLE_TIMEFRAME');

  for (const key of requiredKeys) {
    if (instrumentEnv[key] !== resolved[key]) {
      throw new Error(
        `Backtest worker instrumentEnv.${key}=${instrumentEnv[key]} conflicts with dataFile-derived ${key}=${resolved[key]}`
      );
    }
  }
}

function buildBacktestWorkerEnv(options) {
  const {
    sourceEnv = process.env,
    projectRoot,
    dataFile,
    stateFile,
    dataDir,
    reportTag,
    stockMode = false,
    strategyDiag = 'false',
    configEnv = {},
    instrumentEnv = {},
    profileName = DEFAULT_TUNING_PROFILE,
  } = options || {};

  if (!projectRoot) throw new Error('buildBacktestWorkerEnv requires projectRoot');
  if (!dataFile) throw new Error('buildBacktestWorkerEnv requires dataFile');
  if (!stateFile) throw new Error('buildBacktestWorkerEnv requires stateFile');
  if (!dataDir) throw new Error('buildBacktestWorkerEnv requires dataDir');
  if (!reportTag) throw new Error('buildBacktestWorkerEnv requires reportTag');

  const profile = resolveTuningProfile(profileName);
  assertEnvKeysAllowed(configEnv, CONFIG_ENV_OVERRIDE_ALLOWLIST, 'configEnv');
  assertEnvKeysAllowed(instrumentEnv, INSTRUMENT_ENV_ALLOWLIST, 'instrumentEnv');
  assertStockModeMatchesInstrument(stockMode, instrumentEnv);
  assertInstrumentEnvMatchesDataFile(dataFile, instrumentEnv);
  const directionFilter = resolveDirectionFilter(sourceEnv, configEnv);
  const normalizedConfigEnv = { ...configEnv };
  if (normalizedConfigEnv.DIRECTION_FILTER !== undefined) {
    normalizedConfigEnv.DIRECTION_FILTER = directionFilter;
  }
  const feeEnv = resolveFeeEnv(sourceEnv, normalizedConfigEnv);

  return {
    ...buildWorkerBaseEnv(sourceEnv),
    ...CANONICAL_BACKTEST_ENV,
    ...profile.env,
    CANDLE_DATA_FILE: path.resolve(projectRoot, dataFile),
    STATE_FILE: stateFile,
    DATA_DIR: dataDir,
    BACKTEST_REPORT_TAG: reportTag,
    STRATEGY_DIAG: strategyDiag,
    ...(stockMode ? STOCK_ZERO_FEE_ENV : {}),
    ...(stockMode ? STOCK_BACKTEST_ALPACA_ENV : {}),
    ...feeEnv,
    DIRECTION_FILTER: directionFilter,
    ...normalizedConfigEnv,
    ...instrumentEnv,
    TUNING_PROFILE: profile.name,
    BACKTEST_TUNING_PROFILE: profile.name,
  };
}

function summarizeWorkerEnv(env) {
  const summary = {};
  for (const key of SUMMARY_KEYS) {
    if (env[key] !== undefined) summary[key] = env[key];
  }
  if (env.ALPACA_API_KEY !== undefined) summary.ALPACA_API_KEY_PRESENT = Boolean(env.ALPACA_API_KEY);
  if (env.ALPACA_API_SECRET !== undefined) summary.ALPACA_API_SECRET_PRESENT = Boolean(env.ALPACA_API_SECRET);
  return summary;
}

module.exports = {
  WORKER_ENV_ALLOWLIST,
  CANONICAL_BACKTEST_ENV,
  STOCK_ZERO_FEE_ENV,
  STOCK_BACKTEST_ALPACA_ENV,
  CONFIG_ENV_OVERRIDE_ALLOWLIST,
  INSTRUMENT_ENV_ALLOWLIST,
  DEFAULT_TUNING_PROFILE,
  buildWorkerBaseEnv,
  assertEnvKeysAllowed,
  normalizeDirectionFilter,
  resolveDirectionFilter,
  resolveFeeEnv,
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
};
