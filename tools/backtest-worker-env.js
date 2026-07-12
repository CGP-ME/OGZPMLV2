'use strict';

const path = require('path');
const ConfigLoader = require('../foundation/ConfigLoader');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const {
  DEFAULT_TUNING_PROFILE,
  listTuningProfileNames,
  resolveTuningProfile,
} = require('./tuning-profiles');
const {
  listFeeProfileNames,
  resolveFeeProfile,
} = require('./fee-profiles');

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

const CANONICAL_BACKTEST_ENV = ConfigLoader.getBacktestWorkerEnvDefaults();
const STOCK_ZERO_FEE_ENV = ConfigLoader.getBacktestStockZeroFeeEnv();
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

const TUNING_PROFILE_LAUNCH_PROFILE = Object.freeze({
  'current-eval': 'backtest-all',
  'legacy-wide': 'backtest-all',
  'ttp-5k-max': 'backtest-ttp-5k-max',
  'trey-spec': 'backtest-trey-spec',
});

const CONFIG_ENV_OVERRIDE_ALLOWLIST = Object.freeze(new Set([
  'ATR_FILTER_ENABLED',
  'ATR_MIN_PERCENT',
  'BACKTEST_CONFIG_OVERRIDES_JSON',
  'CANDLE_LIMIT',
  'DEBUG_AGG',
  'DEBUG_BRAIN',
  'DIRECTION_FILTER',
  'ENABLE_BREAKRETEST',
  'ENABLE_DONCHIAN',
  'ENABLE_EMA',
  'ENABLE_EMA_TREND_RETEST',
  'ENABLE_MTF_CONFLUENCE_BOOSTER',
  'ENABLE_NOWICK',
  'ENABLE_ORB',
  'ENABLE_PROPSAFE_EMA',
  'ENABLE_RSI2_MR',
  'ENABLE_SMS',
  'ENABLE_SHORTS',
  'ENABLE_TSMOM',
  'ENABLE_TRAI',
  'DONCHIAN_ATR_STOP_MULT',
  'DONCHIAN_MAX_HOLD_MINUTES',
  'DONCHIAN_TAKE_PROFIT_PERCENT',
  'DONCHIAN_TRAILING_ACTIVATION',
  'DONCHIAN_TRAILING_STOP_PERCENT',
  'EMA_TREND_RETEST_ATR_STOP_MULT',
  'EMA_TREND_RETEST_MAX_HOLD_MINUTES',
  'EMA_TREND_RETEST_TARGET_RR',
  'EMA_TREND_RETEST_TRAIL_ACTIVATION_R',
  'EMA_TREND_RETEST_TRAIL_DISTANCE_R',
  'EMA_MTF_4H_MACD_BOOST_MULT',
  'EMA_MTF_FRESH_50_200_MIN_1H_TREND_STRENGTH',
  'EMA_MTF_HOURLY_TREND_VETO_MULT',
  'MAX_POSITION_SIZE_PCT',
  'MTF_BOOSTER_BOOST_MTF_CANDIDATE',
  'MTF_BOOSTER_CONFLICT_MULT',
  'MTF_BOOSTER_MAX_MULT',
  'MTF_BOOSTER_MIN_CONFIDENCE',
  'MTF_BOOSTER_MIN_SCORE',
  'MTF_BOOSTER_PENALIZE_CONFLICTS',
  'MTF_BOOSTER_STRENGTH_MULT',
  'MTF_REQUIRE_HIGHER_TF_READY',
  'MASR_MTF_4H_ALIGN_BOOST',
  'MASR_MTF_4H_COMPRESSION_BANDWIDTH',
  'MASR_MTF_REQUIRE_HOURLY_TREND_ALIGN',
  'OGZTPO_MTF_1H_MACD_BOOST_MULT',
  'OGZTPO_MTF_4H_BANDWIDTH_THRESHOLD',
  'OGZTPO_MTF_4H_TREND_BOOST_MULT',
  'OGZTPO_MTF_4H_VOL_STOP_WIDEN',
  'OGZTPO_MTF_STOP_WIDEN_FACTOR',
  'PATTERN_DOMINANCE',
  'PROPSAFE_EMA_ATR_STOP_MULT',
  'PROPSAFE_EMA_MAX_HOLD_MINUTES',
  'PROPSAFE_EMA_TARGET_RR',
  'PROPSAFE_EMA_TRAIL_ACTIVATION_R',
  'PROPSAFE_EMA_TRAIL_DISTANCE_R',
  'RSI_OVERBOUGHT',
  'RSI_OVERSOLD',
  'RSI2_MR_MAX_HOLD_MINUTES',
  'RSI2_MR_STOP_LOSS_PERCENT',
  'RSI2_MR_TAKE_PROFIT_PERCENT',
  'RSI2_MR_TRAILING_ACTIVATION',
  'RSI2_MR_TRAILING_STOP_PERCENT',
  'RSI_MTF_1H_RSI_ALIGN_BOOST',
  'RSI_MTF_1H_RSI_BUY_MAX',
  'RSI_MTF_1H_RSI_SELL_MIN',
  'RSI_MTF_VETO_AGAINST_4H_TREND',
  'SMS_VP_RTH_ONLY',
  'SOLO_STRATEGY',
  'TIER1_TARGET',
  'TIER2_TARGET',
  'TIER3_TARGET',
  'FINAL_TARGET',
  'TSMOM_MAX_HOLD_MINUTES',
  'TSMOM_MIN_RETURN',
  'TSMOM_STOP_LOSS_PERCENT',
  'TSMOM_TAKE_PROFIT_PERCENT',
  'TSMOM_TRAILING_ACTIVATION',
  'TSMOM_TRAILING_STOP_PERCENT',
]));

const INSTRUMENT_ENV_ALLOWLIST = Object.freeze(new Set([
  'TRADING_PAIR',
  'BROKER',
  'ASSET_CLASS',
  'CANDLE_TIMEFRAME',
]));

const SUMMARY_KEYS = [
  'PROFILE',
  'EXECUTION_MODE',
  'CANDLE_SOURCE',
  'BACKTEST_MODE',
  'TEST_MODE',
  'BACKTEST_FAST',
  'BACKTEST_NO_PATTERN_SAVE',
  'INITIAL_BALANCE',
  'DIRECTION_FILTER',
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
  'BACKTEST_FEE_PROFILE',
  'BACKTEST_CONFIG_OVERRIDES_JSON',
  'ALPACA_MODE',
  'ALPACA_SYMBOLS',
  'TRADING_PAIR',
  'BROKER',
  'ASSET_CLASS',
  'CANDLE_TIMEFRAME',
  'SOLO_STRATEGY',
  'ENABLE_DONCHIAN',
  'ENABLE_EMA',
  'ENABLE_EMA_TREND_RETEST',
  'ENABLE_MTF_CONFLUENCE_BOOSTER',
  'ENABLE_TRAI',
  'ENABLE_SHORTS',
  'ENABLE_SMS',
  'ENABLE_NOWICK',
  'ENABLE_ORB',
  'ENABLE_PROPSAFE_EMA',
  'ENABLE_RSI2_MR',
  'ENABLE_TSMOM',
  'ENABLE_BREAKRETEST',
  'DONCHIAN_ATR_STOP_MULT',
  'DONCHIAN_MAX_HOLD_MINUTES',
  'DONCHIAN_TAKE_PROFIT_PERCENT',
  'DONCHIAN_TRAILING_ACTIVATION',
  'DONCHIAN_TRAILING_STOP_PERCENT',
  'EMA_TREND_RETEST_ATR_STOP_MULT',
  'EMA_TREND_RETEST_MAX_HOLD_MINUTES',
  'EMA_TREND_RETEST_TARGET_RR',
  'EMA_TREND_RETEST_TRAIL_ACTIVATION_R',
  'EMA_TREND_RETEST_TRAIL_DISTANCE_R',
  'EMA_MTF_4H_MACD_BOOST_MULT',
  'EMA_MTF_FRESH_50_200_MIN_1H_TREND_STRENGTH',
  'EMA_MTF_HOURLY_TREND_VETO_MULT',
  'ATR_FILTER_ENABLED',
  'ATR_MIN_PERCENT',
  'BACKTEST_CONFIG_OVERRIDES_JSON',
  'MTF_BOOSTER_BOOST_MTF_CANDIDATE',
  'MTF_BOOSTER_CONFLICT_MULT',
  'MTF_BOOSTER_MAX_MULT',
  'MTF_BOOSTER_MIN_CONFIDENCE',
  'MTF_BOOSTER_MIN_SCORE',
  'MTF_BOOSTER_PENALIZE_CONFLICTS',
  'MTF_BOOSTER_STRENGTH_MULT',
  'MTF_REQUIRE_HIGHER_TF_READY',
  'MASR_MTF_4H_ALIGN_BOOST',
  'MASR_MTF_4H_COMPRESSION_BANDWIDTH',
  'MASR_MTF_REQUIRE_HOURLY_TREND_ALIGN',
  'OGZTPO_MTF_1H_MACD_BOOST_MULT',
  'OGZTPO_MTF_4H_BANDWIDTH_THRESHOLD',
  'OGZTPO_MTF_4H_TREND_BOOST_MULT',
  'OGZTPO_MTF_4H_VOL_STOP_WIDEN',
  'OGZTPO_MTF_STOP_WIDEN_FACTOR',
  'PROPSAFE_EMA_ATR_STOP_MULT',
  'PROPSAFE_EMA_MAX_HOLD_MINUTES',
  'PROPSAFE_EMA_TARGET_RR',
  'PROPSAFE_EMA_TRAIL_ACTIVATION_R',
  'PROPSAFE_EMA_TRAIL_DISTANCE_R',
  'RSI2_MR_MAX_HOLD_MINUTES',
  'RSI2_MR_STOP_LOSS_PERCENT',
  'RSI2_MR_TAKE_PROFIT_PERCENT',
  'RSI2_MR_TRAILING_ACTIVATION',
  'RSI2_MR_TRAILING_STOP_PERCENT',
  'RSI_MTF_1H_RSI_ALIGN_BOOST',
  'RSI_MTF_1H_RSI_BUY_MAX',
  'RSI_MTF_1H_RSI_SELL_MIN',
  'RSI_MTF_VETO_AGAINST_4H_TREND',
  'TIER1_TARGET',
  'TIER2_TARGET',
  'TIER3_TARGET',
  'FINAL_TARGET',
  'TIER1_EXIT_FRACTION',
  'TIER2_EXIT_FRACTION',
  'TIER3_EXIT_FRACTION',
  'TSMOM_MAX_HOLD_MINUTES',
  'TSMOM_MIN_RETURN',
  'TSMOM_STOP_LOSS_PERCENT',
  'TSMOM_TAKE_PROFIT_PERCENT',
  'TSMOM_TRAILING_ACTIVATION',
  'TSMOM_TRAILING_STOP_PERCENT',
];

const WORKER_GENERATED_ENV_KEYS = Object.freeze([
  ...Object.keys(CANONICAL_BACKTEST_ENV),
  ...Object.keys(STOCK_BACKTEST_ALPACA_ENV),
  'CANDLE_DATA_FILE',
  'STATE_FILE',
  'DATA_DIR',
  'BACKTEST_REPORT_TAG',
  'STRATEGY_DIAG',
  'DIRECTION_FILTER',
  'PROFILE',
  'TUNING_PROFILE',
  'BACKTEST_TUNING_PROFILE',
  'BACKTEST_FEE_PROFILE',
]);

const BACKTEST_PIPELINE_OPERATIONAL_ENV_KEYS = Object.freeze([
  'TRAI_AUTO_HARVEST',
  'TRAI_HARVEST_MIN_TRADES',
  'TRAI_HARVEST_BOOST_WR',
  'TRAI_HARVEST_PENALTY_WR',
  'WEEKEND_CAMPAIGN_DISK_RESERVE_MIB',
  'WEEKEND_CAMPAIGN_MIN_FREE_MIB',
  'WEEKEND_CAMPAIGN_PROJECTED_MIB_PER_RUN',
]);

function sortedUnique(values) {
  return Object.freeze([...new Set(values)].sort());
}

function listBacktestWorkerEnvWhitelist() {
  const tuningProfileGeneratedKeys = listTuningProfileNames()
    .flatMap(name => Object.keys(resolveTuningProfile(name).env || {}));
  const feeProfileGeneratedKeys = listFeeProfileNames()
    .flatMap(name => Object.keys(resolveFeeProfile(name).env || {}));

  return Object.freeze({
    ambient: sortedUnique(WORKER_ENV_ALLOWLIST),
    configEnv: sortedUnique([...CONFIG_ENV_OVERRIDE_ALLOWLIST]),
    instrumentEnv: sortedUnique([...INSTRUMENT_ENV_ALLOWLIST]),
    operationalAmbient: sortedUnique(BACKTEST_PIPELINE_OPERATIONAL_ENV_KEYS),
    generated: sortedUnique([
      ...WORKER_GENERATED_ENV_KEYS,
      ...tuningProfileGeneratedKeys,
      ...feeProfileGeneratedKeys,
    ]),
  });
}

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

function resolveDirectionFilter(configEnv = {}) {
  return normalizeDirectionFilter(configEnv.DIRECTION_FILTER, 'configEnv')
    || CANONICAL_BACKTEST_ENV.DIRECTION_FILTER;
}

function resolveWorkerLaunchProfile(explicitLaunchProfileName, tuningProfileName) {
  const explicit = String(explicitLaunchProfileName || '').trim();
  if (explicit) return explicit;
  const mapped = TUNING_PROFILE_LAUNCH_PROFILE[tuningProfileName];
  if (!mapped) {
    throw new Error(`Backtest worker tuning profile '${tuningProfileName}' has no launch profile mapping`);
  }
  return mapped;
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
    launchProfileName,
    profileName = DEFAULT_TUNING_PROFILE,
    feeProfileName,
  } = options || {};

  if (!projectRoot) throw new Error('buildBacktestWorkerEnv requires projectRoot');
  if (!dataFile) throw new Error('buildBacktestWorkerEnv requires dataFile');
  if (!stateFile) throw new Error('buildBacktestWorkerEnv requires stateFile');
  if (!dataDir) throw new Error('buildBacktestWorkerEnv requires dataDir');
  if (!reportTag) throw new Error('buildBacktestWorkerEnv requires reportTag');

  const profile = resolveTuningProfile(profileName);
  const feeProfile = resolveFeeProfile(feeProfileName);
  assertEnvKeysAllowed(configEnv, CONFIG_ENV_OVERRIDE_ALLOWLIST, 'configEnv');
  assertEnvKeysAllowed(instrumentEnv, INSTRUMENT_ENV_ALLOWLIST, 'instrumentEnv');
  assertStockModeMatchesInstrument(stockMode, instrumentEnv);
  assertInstrumentEnvMatchesDataFile(dataFile, instrumentEnv);
  const directionFilter = resolveDirectionFilter(configEnv);
  const resolvedLaunchProfileName = resolveWorkerLaunchProfile(launchProfileName, profile.name);
  const normalizedConfigEnv = { ...configEnv };
  if (normalizedConfigEnv.DIRECTION_FILTER !== undefined) {
    normalizedConfigEnv.DIRECTION_FILTER = directionFilter;
  }

  return {
    ...buildWorkerBaseEnv(sourceEnv),
    ...CANONICAL_BACKTEST_ENV,
    ...profile.env,
    CANDLE_DATA_FILE: path.resolve(projectRoot, dataFile),
    STATE_FILE: stateFile,
    DATA_DIR: dataDir,
    BACKTEST_REPORT_TAG: reportTag,
    STRATEGY_DIAG: strategyDiag,
    ...(stockMode ? STOCK_BACKTEST_ALPACA_ENV : {}),
    DIRECTION_FILTER: directionFilter,
    ...normalizedConfigEnv,
    ...instrumentEnv,
    ...feeProfile.env,
    PROFILE: resolvedLaunchProfileName,
    TUNING_PROFILE: profile.name,
    BACKTEST_TUNING_PROFILE: profile.name,
    BACKTEST_FEE_PROFILE: feeProfile.name,
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
  BACKTEST_PIPELINE_OPERATIONAL_ENV_KEYS,
  CONFIG_ENV_OVERRIDE_ALLOWLIST,
  INSTRUMENT_ENV_ALLOWLIST,
  TUNING_PROFILE_LAUNCH_PROFILE,
  DEFAULT_TUNING_PROFILE,
  listBacktestWorkerEnvWhitelist,
  buildWorkerBaseEnv,
  assertEnvKeysAllowed,
  normalizeDirectionFilter,
  resolveDirectionFilter,
  resolveWorkerLaunchProfile,
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
};
