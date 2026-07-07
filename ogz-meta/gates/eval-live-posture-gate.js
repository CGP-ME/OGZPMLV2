#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');
const dotenv = require('dotenv');

const ConfigLoader = require('../../foundation/ConfigLoader');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVAL_MIN_TRADE_CONFIDENCE = ConfigLoader.getConfigFileValue('confidence.minTradeConfidence');
if (!Number.isFinite(EVAL_MIN_TRADE_CONFIDENCE)) {
  throw new Error('ConfigLoader confidence.minTradeConfidence file value must be a finite number');
}
const TUNING_PROFILE_DEFINITIONS = ConfigLoader.getConfigFileValue('tuningProfiles.definitions') || {};

const REQUIRED_ENV_EXACT = Object.freeze({
  SESSION_ROUTER_ENABLED: 'false',
  WEBHOOK_ORDERS_ENABLED: 'true',
  WEBHOOK_DRY_RUN: 'false',
  MIN_TRADE_CONFIDENCE: String(EVAL_MIN_TRADE_CONFIDENCE),
  EVAL_RULES_ENABLED: 'true',
  TTP_RULES_ENABLED: 'true',
  TTP_VOLUME_CAP_ENABLED: 'true',
  TTP_VOLUME_CAP_TIMEFRAME: '1m',
  TTP_MARKET_TIME_ENABLED: 'true',
  TTP_BLOCK_ENTRIES_AFTER_CUTOFF: 'true',
  TTP_LIQUIDATION_ENABLED: 'true',
  TTP_ACCOUNT_LIMITS_ENABLED: 'true',
  TTP_DAILY_LOSS_PAUSE_ENABLED: 'true',
  TTP_MAX_LOSS_ENABLED: 'true',
  TTP_EARNINGS_RESTRICTION_ENABLED: 'true',
  TTP_EARNINGS_BLOCK_ENTRIES: 'true',
  TTP_CONSISTENCY_ENABLED: 'true',
  ENTRY_STOCK_SHARE_RANGE_ENABLED: 'true',
  ENTRY_MIN_STOCK_SHARES: '2',
  ENTRY_MAX_STOCK_SHARES: '0',
  ENTRY_MAX_STOCK_NOTIONAL: '5000',
  ENTRY_CONSISTENCY_CAP_BUFFER: '0.98',
  ENTRY_DAILY_LOSS_RISK_FRACTION: '1.0',
});

const REQUIRED_ENV_PROCESS_SOURCE = Object.freeze([
  'MIN_TRADE_CONFIDENCE',
]);

const REQUIRED_CONFIG_EXACT = Object.freeze({
  'mode.execution': 'live',
  'mode.backtest': false,
  'mode.paperTrading': false,
  'mode.liveTrading': true,
  'mode.confirmLiveTrading': true,
  'broker.id': 'alpaca',
  'broker.assetClass': 'stocks',
  'risk.riskManagerBypass': false,
  'risk.accountDrawdownBypass': false,
  'webhookOrders.enabled': true,
  'webhookOrders.dryRun': false,
  'confidence.minTradeConfidence': EVAL_MIN_TRADE_CONFIDENCE,
  'trai.enabled': true,
  'trai.mode': 'passive',
  'trai.vetoPower': false,
  'evalRules.enabled': true,
  'evalRules.ttp.enabled': true,
  'evalRules.ttp.volumeCap.enabled': true,
  'evalRules.ttp.volumeCap.timeframe': '1m',
  'evalRules.ttp.marketTime.enabled': true,
  'evalRules.ttp.marketTime.blockEntriesAfterCutoff': true,
  'evalRules.ttp.marketTime.liquidationEnabled': true,
  'evalRules.ttp.accountLimits.enabled': true,
  'evalRules.ttp.accountLimits.enforceDailyLossPause': true,
  'evalRules.ttp.accountLimits.enforceMaxLoss': true,
  'evalRules.ttp.earningsRestriction.enabled': true,
  'evalRules.ttp.earningsRestriction.blockEntries': true,
  'evalRules.ttp.consistency.enabled': true,
});

const REQUIRED_CONFIG_PRESENT = Object.freeze([
  'broker.tradingPair',
  'broker.alpacaSymbols',
  'broker.candleTimeframe',
  'paths.stateFile',
]);

const REQUIRED_NUMERIC_CONFIG = Object.freeze([
  'backtest.initialBalance',
  'evalRules.ttp.volumeCap.percent',
  'evalRules.ttp.volumeCap.maxReferenceAgeMs',
  'evalRules.ttp.marketTime.cutoffMinutesBeforeClose',
  'evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff',
  'evalRules.ttp.accountLimits.accountStartOfDayEquity',
  'evalRules.ttp.accountLimits.dailyLossDollars',
  'evalRules.ttp.accountLimits.maxLossThresholdEquity',
  'evalRules.ttp.consistency.maxPositionProfitRatio',
  'evalRules.ttp.consistency.profitTargetDollars',
  'evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio',
]);

const RUNTIME_PROFILE_KEYS = Object.freeze([
  'RUNTIME_TUNING_PROFILE',
  'TUNING_PROFILE',
]);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function getPath(obj, configPath) {
  return configPath.split('.').reduce((value, part) => (
    value === undefined || value === null ? undefined : value[part]
  ), obj);
}

function loadDotenvForEnv(sourceEnv, options = {}) {
  if (options.loadDotenv === false) {
    return { values: {}, path: null };
  }

  const envPath = sourceEnv.DOTENV_CONFIG_PATH || '.env';
  const resolvedPath = path.isAbsolute(envPath)
    ? envPath
    : path.resolve(process.cwd(), envPath);

  try {
    return {
      values: dotenv.parse(fs.readFileSync(resolvedPath)),
      path: resolvedPath,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { values: {}, path: resolvedPath };
    }
    throw error;
  }
}

function buildEffectiveEnv(sourceEnv = process.env, options = {}) {
  const baseEnv = { ...sourceEnv };
  const dotenvResult = loadDotenvForEnv(baseEnv, options);
  const values = { ...dotenvResult.values, ...baseEnv };
  const sources = {};

  for (const key of Object.keys(dotenvResult.values)) {
    sources[key] = `dotenv:${key}`;
  }
  for (const key of Object.keys(baseEnv)) {
    sources[key] = `env:${key}`;
  }

  const profileKey = values.BACKTEST_TUNING_PROFILE
    ? 'BACKTEST_TUNING_PROFILE'
    : (values.TUNING_PROFILE ? 'TUNING_PROFILE' : null);
  if (profileKey) {
    const profileName = String(values[profileKey] || '').trim();
    const profile = TUNING_PROFILE_DEFINITIONS[profileName];
    if (profile && profile.env) {
      for (const [key, value] of Object.entries(profile.env)) {
        values[key] = String(value);
        sources[key] = `profile:${profileName}:${key}`;
      }
    }
  }

  return {
    values,
    sources,
    envFile: dotenvResult.path,
  };
}

function loadConfigSnapshot(sourceEnv, options = {}) {
  return ConfigLoader.snapshot(sourceEnv, {
    silent: true,
    loadDotenv: options.loadDotenv !== false,
  });
}

function safeWebhookReport(configSnapshot) {
  const webhookUrl = getPath(configSnapshot.config, 'webhookOrders.webhookUrl');
  if (!webhookUrl) {
    return { present: false, protocol: null, source: configSnapshot.sources['webhookOrders.webhookUrl'] || null };
  }

  try {
    return {
      present: true,
      protocol: new URL(webhookUrl).protocol,
      source: configSnapshot.sources['webhookOrders.webhookUrl'] || null,
    };
  } catch (_) {
    return {
      present: true,
      protocol: 'invalid',
      source: configSnapshot.sources['webhookOrders.webhookUrl'] || null,
    };
  }
}

function addError(errors, message) {
  errors.push(message);
}

function addWarning(report, message) {
  report.warnings.push(message);
}

function resolveRepoPath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function runtimeStateFilePath(config) {
  const configuredStateFile = getPath(config, 'paths.stateFile');
  if (configuredStateFile) return resolveRepoPath(configuredStateFile);

  const configuredDataDir = getPath(config, 'paths.dataDir');
  const dataDir = configuredDataDir
    ? resolveRepoPath(configuredDataDir)
    : path.join(REPO_ROOT, 'data');
  return path.join(dataDir, 'state.json');
}

function runtimeStateFilePathFromEnv(effectiveEnv) {
  const configuredStateFile = effectiveEnv.values.STATE_FILE;
  if (configuredStateFile) return resolveRepoPath(configuredStateFile);

  const configuredDataDir = effectiveEnv.values.DATA_DIR;
  const dataDir = configuredDataDir
    ? resolveRepoPath(configuredDataDir)
    : path.join(REPO_ROOT, 'data');
  return path.join(dataDir, 'state.json');
}

function normalizeSerializedActiveTrades(activeTrades) {
  if (activeTrades === undefined || activeTrades === null) {
    throw new Error('persisted activeTrades is required for exposure reconciliation');
  }
  if (Array.isArray(activeTrades)) {
    return activeTrades.map((entry, index) => {
      if (Array.isArray(entry) && entry.length >= 2) {
        return { key: entry[0], trade: entry[1] };
      }
      return { key: String(index), trade: entry };
    });
  }
  if (activeTrades && typeof activeTrades === 'object') {
    return Object.entries(activeTrades).map(([key, trade]) => ({ key, trade }));
  }
  throw new Error(`persisted activeTrades must be an array/object, got ${typeof activeTrades}`);
}

function summarizeActiveTrade(entry) {
  const trade = entry.trade && typeof entry.trade === 'object' ? entry.trade : {};
  const id = trade.orderId || trade.id || entry.key || '<unknown>';
  const symbol = trade.symbol || '<missing-symbol>';
  const side = trade.side || trade.direction || trade.action || '<missing-side>';
  const brokerId = trade.brokerId || trade.broker || '<missing-broker>';
  return `${id}:${symbol}:${brokerId}:${side}`;
}

function readPersistedStateExposure(stateFile) {
  const resolvedStateFile = resolveRepoPath(stateFile);
  if (!resolvedStateFile) {
    throw new Error('state file path is required for persisted exposure reconciliation');
  }
  if (!fs.existsSync(resolvedStateFile)) {
    throw new Error(`persisted state file missing: ${resolvedStateFile}`);
  }

  const state = JSON.parse(fs.readFileSync(resolvedStateFile, 'utf8'));
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error(`persisted state file must contain an object, got ${typeof state}`);
  }
  const activeTrades = normalizeSerializedActiveTrades(state.activeTrades);
  const malformedTrades = activeTrades.filter((entry) => !entry.trade || typeof entry.trade !== 'object');
  if (malformedTrades.length > 0) {
    throw new Error(`persisted activeTrades contains malformed entries: ${malformedTrades.map((entry) => entry.key).join(', ')}`);
  }
  const position = Number(state.position || 0);
  const inPosition = Number(state.inPosition || 0);

  return {
    exists: true,
    path: resolvedStateFile,
    activeTrades: activeTrades.map(summarizeActiveTrade),
    sourceLessExposure: activeTrades.length === 0 && (
      !Number.isFinite(position)
      || position !== 0
      || !Number.isFinite(inPosition)
      || inPosition !== 0
    ),
    position,
    inPosition,
  };
}

function normalizeBrokerPosition(position) {
  const size = Number(position.size ?? position.qty ?? position.quantity ?? 0);
  return {
    symbol: position.symbol || '<missing-symbol>',
    size,
    side: position.side || (size < 0 ? 'short' : 'long'),
  };
}

async function readAlpacaPositions(effectiveEnv, configSnapshot) {
  const values = effectiveEnv.values;
  const brokerConfig = configSnapshot?.config?.broker || null;
  const brokerSources = configSnapshot?.sources || {};
  const apiKey = brokerConfig ? brokerConfig.alpacaApiKey : values.ALPACA_API_KEY;
  const apiSecret = brokerConfig ? brokerConfig.alpacaApiSecret : values.ALPACA_API_SECRET;
  const modeRaw = brokerConfig ? brokerConfig.alpacaMode : values.ALPACA_MODE;
  const mode = modeRaw ? String(modeRaw).trim().toLowerCase() : '';

  if (!apiKey) {
    throw new Error('ALPACA_API_KEY must be explicitly set for broker exposure reconciliation');
  }
  if (!apiSecret) {
    throw new Error('ALPACA_API_SECRET must be explicitly set for broker exposure reconciliation');
  }
  if (mode !== 'paper' && mode !== 'live') {
    throw new Error(`ALPACA_MODE must be explicitly set to paper or live for broker exposure reconciliation, got ${mode || 'missing'}`);
  }
  if (brokerConfig) {
    for (const [pathName, source] of Object.entries({
      'broker.alpacaApiKey': brokerSources['broker.alpacaApiKey'],
      'broker.alpacaApiSecret': brokerSources['broker.alpacaApiSecret'],
      'broker.alpacaMode': brokerSources['broker.alpacaMode'],
    })) {
      if (!source || source === 'default') {
        throw new Error(`${pathName} must be explicitly sourced for broker exposure reconciliation`);
      }
    }
  }

  const baseUrl = mode === 'live'
    ? 'https://api.alpaca.markets'
    : 'https://paper-api.alpaca.markets';
  const response = await axios.get(`${baseUrl}/v2/positions`, {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  if (!Array.isArray(response.data)) {
    throw new Error(`Alpaca positions response must be an array, got ${typeof response.data}`);
  }
  return response.data.map(normalizeBrokerPosition);
}

function brokerPositionReader(options = {}) {
  if (!options.readBrokerPositions) return readAlpacaPositions;
  if (options.allowInjectedBrokerPositions === true) return options.readBrokerPositions;
  throw new Error('injected broker position readers are only allowed in explicit test validation options');
}

function expectEnvExact(report, key, expected) {
  const actual = report.effectiveEnv.values[key];
  const source = report.effectiveEnv.sources[key] || 'missing';
  report.checked.env[key] = { value: actual === undefined ? null : String(actual), source };

  if (actual === undefined || actual === '') {
    addError(report.errors, `${key} must be explicitly set to ${expected}, got missing`);
    return;
  }
  if (String(actual) !== String(expected)) {
    addError(report.errors, `${key} must be ${expected}, got ${actual}`);
  }
}

function expectEnvProcessSource(report, key) {
  const source = report.effectiveEnv.sources[key] || 'missing';
  const existing = report.checked.env[key] || {
    value: report.effectiveEnv.values[key] === undefined ? null : String(report.effectiveEnv.values[key]),
    source,
  };
  report.checked.env[key] = { ...existing, source };

  const selectedProfileSource = /^profile:[^:]+:[A-Z0-9_]+$/.test(String(source || '')) &&
    source.endsWith(`:${key}`);
  if (source !== `env:${key}` && !selectedProfileSource) {
    addError(report.errors, `${key} must come from process env or selected tuning profile for eval-live posture, got ${source}`);
  }
}

function expectConfigExact(report, configPath, expected) {
  const actual = getPath(report.configSnapshot.config, configPath);
  const source = report.configSnapshot.sources[configPath] || 'missing';
  report.checked.config[configPath] = { value: actual, source };

  if (source === 'default') {
    addError(report.errors, `${configPath} must be explicitly sourced, got default ${actual}`);
    return;
  }
  if (actual !== expected) {
    addError(report.errors, `${configPath} must be ${expected}, got ${actual}`);
  }
}

function expectPositiveConfigNumber(report, configPath) {
  const actual = getPath(report.configSnapshot.config, configPath);
  const source = report.configSnapshot.sources[configPath] || 'missing';
  report.checked.config[configPath] = { value: actual, source };

  if (source === 'default') {
    addError(report.errors, `${configPath} must be explicitly sourced, got default ${actual}`);
    return;
  }
  if (!Number.isFinite(actual) || actual <= 0) {
    addError(report.errors, `${configPath} must be positive, got ${actual}`);
  }
}

function expectConfigPresent(report, configPath) {
  const actual = getPath(report.configSnapshot.config, configPath);
  const source = report.configSnapshot.sources[configPath] || 'missing';
  report.checked.config[configPath] = { value: actual, source };

  if (source === 'default') {
    addError(report.errors, `${configPath} must be explicitly sourced, got default ${actual}`);
    return;
  }
  if (actual === undefined || actual === null || String(actual).trim() === '') {
    addError(report.errors, `${configPath} must be explicitly set, got ${actual}`);
  }
}

function validateSymbolConsistency(report) {
  const tradingPair = getPath(report.configSnapshot.config, 'broker.tradingPair');
  const alpacaSymbols = getPath(report.configSnapshot.config, 'broker.alpacaSymbols');
  const alpacaSymbolsSource = report.configSnapshot.sources['broker.alpacaSymbols'] || 'missing';
  const rawSymbols = typeof alpacaSymbols === 'string'
    ? alpacaSymbols.split(',').map((symbol) => symbol.trim()).filter(Boolean)
    : [];
  const symbols = rawSymbols.map((symbol) => symbol.toUpperCase());
  const duplicateSymbols = symbols.filter((symbol, index) => symbols.indexOf(symbol) !== index);

  report.checked.symbol = {
    tradingPair,
    alpacaSymbols: symbols,
    alpacaSymbolsSource,
  };

  if (!alpacaSymbols || alpacaSymbolsSource === 'default') {
    addError(report.errors, `broker.alpacaSymbols must be explicitly sourced for eval-live posture, got ${alpacaSymbolsSource}`);
    return;
  }
  if (symbols.length === 0) {
    addError(report.errors, 'ALPACA_SYMBOLS must contain at least one explicit symbol for eval-live posture');
    return;
  }
  if (duplicateSymbols.length > 0) {
    addError(report.errors, `ALPACA_SYMBOLS must not contain duplicate symbols for eval-live posture, got ${[...new Set(duplicateSymbols)].join(', ')}`);
  }
  if (!symbols.includes(tradingPair)) {
    addError(report.errors, `ALPACA_SYMBOLS must include broker.tradingPair ${tradingPair}, got ${symbols.join(', ')}`);
  }
  if (symbols[0] !== tradingPair) {
    addError(report.errors, `ALPACA_SYMBOLS must list broker.tradingPair ${tradingPair} first so primary routing remains deterministic, got ${symbols[0]}`);
  }
}

function validateTtpCrossChecks(report) {
  const manualStatus = getPath(report.configSnapshot.config, 'evalRules.ttp.earningsRestriction.manualStatus');
  const accountStartDate = getPath(report.configSnapshot.config, 'evalRules.ttp.accountLimits.accountStartOfDayDate');
  const configuredSymbols = report.checked.symbol && Array.isArray(report.checked.symbol.alpacaSymbols)
    ? report.checked.symbol.alpacaSymbols
    : [getPath(report.configSnapshot.config, 'broker.tradingPair')].filter(Boolean);
  const symbols = manualStatus && typeof manualStatus === 'object' && !Array.isArray(manualStatus)
    ? manualStatus.symbols
    : null;

  report.checked.ttp = {
    accountStartDate,
    earningsStatusDate: manualStatus && manualStatus.date ? manualStatus.date : null,
    earningsSymbols: symbols && typeof symbols === 'object' && !Array.isArray(symbols)
      ? Object.keys(symbols).sort()
      : [],
  };

  if (!manualStatus || typeof manualStatus !== 'object' || Array.isArray(manualStatus)) {
    addWarning(report, 'TTP earnings status is not an explicit object; earnings calendar lane is quarantined');
    return;
  }
  if (manualStatus.date !== accountStartDate) {
    addWarning(report, `TTP earnings status date ${manualStatus.date} does not match account start date ${accountStartDate}; earnings calendar lane is quarantined`);
  }
  if (!symbols || typeof symbols !== 'object' || Array.isArray(symbols)) {
    addWarning(report, 'TTP earnings status symbols are not an object; earnings calendar lane is quarantined');
    return;
  }
  for (const symbol of configuredSymbols) {
    if (typeof symbols[symbol] !== 'boolean') {
      addWarning(report, `TTP earnings status symbols.${symbol} must be boolean, got ${typeof symbols[symbol]}; earnings calendar lane is quarantined`);
    }
  }

  const initialBalance = getPath(report.configSnapshot.config, 'backtest.initialBalance');
  const profitTarget = getPath(report.configSnapshot.config, 'evalRules.ttp.consistency.profitTargetDollars');
  const profitTargetRatio = getPath(report.configSnapshot.config, 'evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio');
  if (
    Number.isFinite(initialBalance)
    && Number.isFinite(profitTarget)
    && Number.isFinite(profitTargetRatio)
    && profitTarget > initialBalance * profitTargetRatio
  ) {
    addError(report.errors, `TTP profit target exceeds configured initial-balance cap: ${profitTarget} > ${initialBalance * profitTargetRatio}`);
  }

  const startEquity = getPath(report.configSnapshot.config, 'evalRules.ttp.accountLimits.accountStartOfDayEquity');
  const maxLossThreshold = getPath(report.configSnapshot.config, 'evalRules.ttp.accountLimits.maxLossThresholdEquity');
  if (
    Number.isFinite(startEquity)
    && Number.isFinite(maxLossThreshold)
    && maxLossThreshold >= startEquity
  ) {
    addError(report.errors, `TTP max loss threshold must be below account start equity: ${maxLossThreshold} >= ${startEquity}`);
  }
}

function selectedRuntimeProfileName(effectiveEnv) {
  for (const key of RUNTIME_PROFILE_KEYS) {
    if (effectiveEnv.values[key]) return String(effectiveEnv.values[key]);
  }
  return null;
}

function validateRuntimeProfile(report) {
  const backtestProfile = report.effectiveEnv.values.BACKTEST_TUNING_PROFILE;
  if (backtestProfile) {
    report.checked.profile.backtestTuningProfile = {
      value: String(backtestProfile),
      source: report.effectiveEnv.sources.BACKTEST_TUNING_PROFILE || 'env:BACKTEST_TUNING_PROFILE',
    };
    addError(report.errors, `BACKTEST_TUNING_PROFILE must not be set for eval-live posture, got ${backtestProfile}`);
  }

  const profileName = selectedRuntimeProfileName(report.effectiveEnv);
  report.checked.profile.selectedRuntimeProfile = profileName;
  if (!profileName) return;

  let profile;
  try {
    profile = ConfigLoader.resolveTuningProfile(profileName);
  } catch (error) {
    addError(report.errors, `Runtime tuning profile '${profileName}' failed to resolve: ${error.message}`);
    return;
  }

  for (const key of ['RISK_MANAGER_BYPASS', 'ACCOUNT_DRAWDOWN_BYPASS']) {
    if (hasOwn(profile.env || {}, key) && String(profile.env[key]) !== 'false') {
      addError(report.errors, `Runtime tuning profile '${profileName}' sets ${key}=${profile.env[key]}; eval-live requires false`);
    }
  }
}

function validateEvalLivePosture(sourceEnv = process.env, options = {}) {
  const effectiveEnv = buildEffectiveEnv(sourceEnv, options);
  const report = {
    status: 'FAIL',
    envFile: effectiveEnv.envFile,
    errors: [],
    warnings: [],
    checked: {
      env: {},
      config: {},
      profile: {},
      ttp: {},
      symbol: {},
      webhook: {},
    },
    effectiveEnv,
    configSnapshot: null,
  };

  for (const [key, expected] of Object.entries(REQUIRED_ENV_EXACT)) {
    expectEnvExact(report, key, expected);
  }
  for (const key of REQUIRED_ENV_PROCESS_SOURCE) {
    expectEnvProcessSource(report, key);
  }

  try {
    report.configSnapshot = loadConfigSnapshot(sourceEnv, options);
    for (const warning of report.configSnapshot.warnings || []) {
      addWarning(report, warning);
    }
  } catch (error) {
    addError(report.errors, error && error.message ? error.message : String(error));
  }

  if (report.configSnapshot) {
    for (const [configPath, expected] of Object.entries(REQUIRED_CONFIG_EXACT)) {
      expectConfigExact(report, configPath, expected);
    }
    for (const configPath of REQUIRED_CONFIG_PRESENT) {
      expectConfigPresent(report, configPath);
    }
    for (const configPath of REQUIRED_NUMERIC_CONFIG) {
      expectPositiveConfigNumber(report, configPath);
    }
    report.checked.webhook = safeWebhookReport(report.configSnapshot);
    validateSymbolConsistency(report);
    validateTtpCrossChecks(report);
  }

  validateRuntimeProfile(report);
  report.status = report.errors.length === 0 ? 'PASS' : 'FAIL';

  delete report.effectiveEnv;
  delete report.configSnapshot;

  return report;
}

async function validateEvalLiveReadiness(sourceEnv = process.env, options = {}) {
  const report = validateEvalLivePosture(sourceEnv, options);
  report.checked.runtimeExposure = {
    configSnapshotLoaded: false,
    stateFile: null,
    localActiveTrades: [],
    localStateExists: false,
    localSourceLessExposure: false,
    brokerPositions: [],
  };

  let effectiveEnv;
  let configSnapshot;
  try {
    effectiveEnv = buildEffectiveEnv(sourceEnv, options);
  } catch (error) {
    addError(report.errors, `Runtime exposure reconciliation could not load env: ${error.message}`);
    report.status = 'FAIL';
    return report;
  }

  try {
    configSnapshot = loadConfigSnapshot(sourceEnv, options);
  } catch (error) {
    addError(report.errors, `Runtime exposure reconciliation continuing without config snapshot: ${error.message}`);
  }

  report.checked.runtimeExposure.configSnapshotLoaded = Boolean(configSnapshot);
  const stateFileSource = configSnapshot
    ? (configSnapshot.sources['paths.stateFile'] || 'missing')
    : (effectiveEnv.sources.STATE_FILE ? effectiveEnv.sources.STATE_FILE.replace('STATE_FILE', 'paths.stateFile') : 'missing');
  const configuredStateFile = configSnapshot
    ? getPath(configSnapshot.config, 'paths.stateFile')
    : effectiveEnv.values.STATE_FILE;
  const resolvedStateFile = configSnapshot
    ? runtimeStateFilePath(configSnapshot.config)
    : runtimeStateFilePathFromEnv(effectiveEnv);
  report.checked.runtimeExposure.stateFile = {
    path: resolvedStateFile,
    source: stateFileSource,
  };

  if (!configuredStateFile || stateFileSource === 'default') {
    addError(report.errors, `paths.stateFile must be explicitly sourced for eval-live readiness, got ${stateFileSource}`);
  }

  try {
    const localExposure = readPersistedStateExposure(resolvedStateFile);
    report.checked.runtimeExposure.localStateExists = localExposure.exists;
    report.checked.runtimeExposure.localActiveTrades = localExposure.activeTrades;
    report.checked.runtimeExposure.localSourceLessExposure = localExposure.sourceLessExposure;
    report.checked.runtimeExposure.localPosition = localExposure.position;
    report.checked.runtimeExposure.localInPosition = localExposure.inPosition;

    if (localExposure.activeTrades.length > 0) {
      addError(report.errors, `Persisted StateManager activeTrades must be flat for eval-live readiness, found ${localExposure.activeTrades.length}: ${localExposure.activeTrades.join(', ')}`);
    }
    if (localExposure.sourceLessExposure) {
      addError(report.errors, `Persisted StateManager source-less exposure must be flat for eval-live readiness, got position=${localExposure.position} inPosition=${localExposure.inPosition}`);
    }
  } catch (error) {
    addError(report.errors, `Persisted StateManager exposure reconciliation failed: ${error.message}`);
  }

  try {
    const readBrokerPositions = brokerPositionReader(options);
    const positions = await readBrokerPositions(effectiveEnv, configSnapshot);
    if (!Array.isArray(positions)) {
      throw new Error(`broker position reader must return an array, got ${typeof positions}`);
    }
    const normalizedPositions = positions.map(normalizeBrokerPosition);
    const openPositions = normalizedPositions.filter((position) => (
      Number.isFinite(position.size) && Math.abs(position.size) > 0
    ));
    report.checked.runtimeExposure.brokerPositions = openPositions.map((position) => ({
      symbol: position.symbol,
      size: position.size,
      side: position.side,
    }));
    if (openPositions.length > 0) {
      addError(report.errors, `Alpaca broker positions must be flat for eval-live readiness, found ${openPositions.length}: ${openPositions.map((position) => `${position.symbol}:${position.side}:${position.size}`).join(', ')}`);
    }
  } catch (error) {
    addError(report.errors, `Broker exposure reconciliation failed: ${error.message}`);
  }

  report.status = report.errors.length === 0 ? 'PASS' : 'FAIL';
  return report;
}

function assertEvalLivePosture(sourceEnv = process.env, options = {}) {
  const report = validateEvalLivePosture(sourceEnv, options);
  if (report.status !== 'PASS') {
    throw new Error(`eval-live posture gate failed: ${report.errors.join('; ')}`);
  }
  return report;
}

async function assertEvalLiveReadiness(sourceEnv = process.env, options = {}) {
  const report = await validateEvalLiveReadiness(sourceEnv, options);
  if (report.status !== 'PASS') {
    throw new Error(`eval-live readiness gate failed: ${report.errors.join('; ')}`);
  }
  return report;
}

function parseProcEnviron(rawEnv) {
  return String(rawEnv || '')
    .split('\0')
    .filter(Boolean)
    .reduce((env, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex > 0) {
        env[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1);
      }
      return env;
    }, {});
}

function readProcRuntimeEnv(pid, fsModule = fs) {
  if (!pid) {
    throw new Error('runtime pid is required');
  }
  const env = parseProcEnviron(fsModule.readFileSync(`/proc/${pid}/environ`, 'utf8'));
  if (Object.keys(env).length === 0) {
    throw new Error(`runtime env was empty for pid ${pid}`);
  }
  return env;
}

function readProcCmdline(pid, fsModule = fs) {
  return String(fsModule.readFileSync(`/proc/${pid}/cmdline`, 'utf8') || '')
    .split('\0')
    .filter(Boolean);
}

function verifyProcRuntimeIdentity(process, runtimeEnv, fsModule = fs) {
  const processLabel = process.name || process.pm_id || process.pid;
  if (process.pm_id !== undefined && String(runtimeEnv.pm_id || '') !== String(process.pm_id)) {
    throw new Error(`PM2 process ${processLabel} pid ${process.pid} env pm_id mismatch: expected ${process.pm_id}, got ${runtimeEnv.pm_id || '(missing)'}`);
  }
  if (process.name && String(runtimeEnv.name || '') !== String(process.name)) {
    throw new Error(`PM2 process ${processLabel} pid ${process.pid} env name mismatch: expected ${process.name}, got ${runtimeEnv.name || '(missing)'}`);
  }

  const expectedExecPath = process.pm2_env && process.pm2_env.pm_exec_path;
  if (expectedExecPath) {
    if (String(runtimeEnv.pm_exec_path || '') !== String(expectedExecPath)) {
      throw new Error(`PM2 process ${processLabel} pid ${process.pid} env pm_exec_path mismatch: expected ${expectedExecPath}, got ${runtimeEnv.pm_exec_path || '(missing)'}`);
    }
    const cmdline = readProcCmdline(process.pid, fsModule).join(' ');
    if (!cmdline.includes(expectedExecPath)) {
      throw new Error(`PM2 process ${processLabel} pid ${process.pid} cmdline does not include expected script ${expectedExecPath}`);
    }
  }
}

function extractPm2RuntimeEnv(process, options = {}) {
  if (process && process.pid) {
    try {
      const fsModule = options.fs || fs;
      const runtimeEnv = readProcRuntimeEnv(process.pid, fsModule);
      verifyProcRuntimeIdentity(process, runtimeEnv, fsModule);
      return runtimeEnv;
    } catch (error) {
      throw new Error(`PM2 process ${process.name || process.pm_id || process.pid} actual runtime env unavailable at /proc/${process.pid}/environ: ${error.message}`);
    }
  }

  if (!process.pm2_env || !process.pm2_env.env || typeof process.pm2_env.env !== 'object') {
    throw new Error(`PM2 process ${process.name || process.pm_id || '(unknown)'} did not expose nested runtime env`);
  }
  return process.pm2_env.env;
}

function readPm2ProcessEnv(processName) {
  const output = execFileSync('pm2', ['jlist'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const processes = JSON.parse(output);
  const match = processes.find((proc) => (
    proc.name === processName || String(proc.pm_id) === String(processName)
  ));
  if (!match) {
    throw new Error(`PM2 process not found: ${processName}`);
  }
  return extractPm2RuntimeEnv(match);
}

function parseCli(argv) {
  const args = { pm2: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pm2') {
      args.pm2 = argv[i + 1];
      if (!args.pm2) throw new Error('--pm2 requires a process name or id');
      i += 1;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  return args;
}

function printReport(report) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const args = parseCli(process.argv.slice(2));
  const sourceEnv = args.pm2 ? readPm2ProcessEnv(args.pm2) : process.env;
  const report = await validateEvalLiveReadiness(sourceEnv, args.pm2 ? { loadDotenv: false } : {});
  printReport(report);
  if (report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_CONFIG_EXACT,
  REQUIRED_CONFIG_PRESENT,
  REQUIRED_ENV_EXACT,
  assertEvalLivePosture,
  assertEvalLiveReadiness,
  buildEffectiveEnv,
  extractPm2RuntimeEnv,
  readAlpacaPositions,
  readPersistedStateExposure,
  readPm2ProcessEnv,
  validateEvalLiveReadiness,
  validateEvalLivePosture,
};
