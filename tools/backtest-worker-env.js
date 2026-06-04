'use strict';

const path = require('path');
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

const CANONICAL_BACKTEST_ENV = Object.freeze({
  EXECUTION_MODE: 'backtest',
  CANDLE_SOURCE: 'file',
  BACKTEST_MODE: 'true',
  BACKTEST_SILENT: 'true',
  BACKTEST_VERBOSE: 'false',
  BACKTEST_FAST: 'true',
  INITIAL_BALANCE: '10000',
  PAPER_TRADING: 'true',
  TEST_MODE: 'true',
  BACKTEST_NO_PATTERN_SAVE: 'true',
  SKIP_CSV_EXPORT: 'true',
  ENABLE_DASHBOARD: 'false',
  SENTRY_DSN: '',
  NODE_ENV: 'test',
  DIRECTION_FILTER: 'both',
  ACCOUNT_DRAWDOWN_BYPASS: 'true',
  RISK_MANAGER_BYPASS: 'true',
  EXIT_SYSTEM: 'legacy',
  FEE_MAKER: '0.0025',
  FEE_TAKER: '0.0040',
  FEE_TOTAL_ROUNDTRIP: '0.0065',
  FEE_SAFETY_BUFFER: '0.001',
  FEE_SLIPPAGE: '0.0005',
});

const STOCK_ZERO_FEE_ENV = Object.freeze({
  FEE_MAKER: '0',
  FEE_TAKER: '0',
  FEE_TOTAL_ROUNDTRIP: '0',
  FEE_SAFETY_BUFFER: '0',
});

const CONFIG_ENV_OVERRIDE_ALLOWLIST = Object.freeze(new Set([
  'ACCOUNT_DRAWDOWN_BYPASS',
  'ATR_FILTER_ENABLED',
  'ATR_MIN_PERCENT',
  'CANDLE_LIMIT',
  'DEBUG_AGG',
  'DEBUG_BRAIN',
  'DIRECTION_FILTER',
  'ENABLE_BREAKRETEST',
  'ENABLE_EMA',
  'ENABLE_NOWICK',
  'ENABLE_ORB',
  'ENABLE_SMS',
  'ENABLE_SHORTS',
  'ENABLE_TRAI',
  'MAX_POSITION_SIZE_PCT',
  'MIN_TRADE_CONFIDENCE',
  'PATTERN_DOMINANCE',
  'RISK_MANAGER_BYPASS',
  'RSI_OVERBOUGHT',
  'RSI_OVERSOLD',
  'SMS_VP_RTH_ONLY',
  'SOLO_STRATEGY',
  'STOP_LOSS_PERCENT',
  'TAKE_PROFIT_PERCENT',
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
  'BACKTEST_FAST',
  'BACKTEST_NO_PATTERN_SAVE',
  'DIRECTION_FILTER',
  'ACCOUNT_DRAWDOWN_BYPASS',
  'RISK_MANAGER_BYPASS',
  'EXIT_SYSTEM',
  'TUNING_PROFILE',
  'BACKTEST_TUNING_PROFILE',
  'ENABLE_DYNAMIC_SIZING',
  'BASE_POSITION_SIZE',
  'MAX_POSITION_SIZE_PCT',
  'BASE_POSITION_PCT',
  'MAX_POSITION_PCT',
  'ABSOLUTE_POSITION_CAP',
  'FEE_MAKER',
  'FEE_TAKER',
  'FEE_TOTAL_ROUNDTRIP',
  'FEE_SAFETY_BUFFER',
  'FEE_SLIPPAGE',
  'TRADING_PAIR',
  'BROKER',
  'ASSET_CLASS',
  'CANDLE_TIMEFRAME',
  'SOLO_STRATEGY',
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
  'STOP_LOSS_PERCENT',
  'TAKE_PROFIT_PERCENT',
  'TRAILING_STOP_PERCENT',
  'TRAILING_ACTIVATION',
  'TIER1_TARGET',
  'TIER2_TARGET',
  'TIER3_TARGET',
  'FINAL_TARGET',
  'TIER1_EXIT_FRACTION',
  'TIER2_EXIT_FRACTION',
  'TIER3_EXIT_FRACTION',
];

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
    ...configEnv,
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
  return summary;
}

module.exports = {
  WORKER_ENV_ALLOWLIST,
  CANONICAL_BACKTEST_ENV,
  STOCK_ZERO_FEE_ENV,
  CONFIG_ENV_OVERRIDE_ALLOWLIST,
  INSTRUMENT_ENV_ALLOWLIST,
  DEFAULT_TUNING_PROFILE,
  buildWorkerBaseEnv,
  assertEnvKeysAllowed,
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
};
