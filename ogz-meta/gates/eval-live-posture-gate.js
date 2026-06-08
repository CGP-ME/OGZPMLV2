#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const dotenv = require('dotenv');

const ConfigLoader = require('../../foundation/ConfigLoader');
const TradingConfig = require('../../core/TradingConfig');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const REQUIRED_ENV_EXACT = Object.freeze({
  SESSION_ROUTER_ENABLED: 'false',
  WEBHOOK_ORDERS_ENABLED: 'true',
  WEBHOOK_DRY_RUN: 'false',
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
  TTP_EARNINGS_REQUIRE_KNOWN_STATUS: 'true',
  TTP_CONSISTENCY_ENABLED: 'true',
});

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
  'trai.enabled': false,
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
  'evalRules.ttp.earningsRestriction.requireKnownStatus': true,
  'evalRules.ttp.consistency.enabled': true,
});

const REQUIRED_CONFIG_PRESENT = Object.freeze([
  'broker.tradingPair',
  'broker.candleTimeframe',
]);

const REQUIRED_NUMERIC_CONFIG = Object.freeze([
  'backtest.initialBalance',
  'evalRules.ttp.volumeCap.percent',
  'evalRules.ttp.volumeCap.maxReferenceAgeMs',
  'evalRules.ttp.marketTime.cutoffMinutesBeforeClose',
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

function loadDotenvForEnv(sourceEnv) {
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

function buildEffectiveEnv(sourceEnv = process.env) {
  const baseEnv = { ...sourceEnv };
  const dotenvResult = loadDotenvForEnv(baseEnv);
  const values = { ...dotenvResult.values, ...baseEnv };
  const sources = {};

  for (const key of Object.keys(dotenvResult.values)) {
    sources[key] = `dotenv:${key}`;
  }
  for (const key of Object.keys(baseEnv)) {
    sources[key] = `env:${key}`;
  }

  return {
    values,
    sources,
    envFile: dotenvResult.path,
  };
}

function loadConfigSnapshot(sourceEnv) {
  return ConfigLoader.snapshot(sourceEnv, { silent: true });
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
  const alpacaSymbols = report.effectiveEnv.values.ALPACA_SYMBOLS;
  const alpacaSymbolsSource = report.effectiveEnv.sources.ALPACA_SYMBOLS || 'missing';
  const symbols = typeof alpacaSymbols === 'string'
    ? alpacaSymbols.split(',').map((symbol) => symbol.trim()).filter(Boolean)
    : [];

  report.checked.symbol = {
    tradingPair,
    alpacaSymbols: symbols,
    alpacaSymbolsSource,
  };

  if (!alpacaSymbols) {
    addError(report.errors, 'ALPACA_SYMBOLS must be explicitly set for eval-live posture');
    return;
  }
  if (symbols.length !== 1) {
    addError(report.errors, `ALPACA_SYMBOLS must contain exactly one symbol for eval-live posture, got ${symbols.join(', ') || '(none)'}`);
    return;
  }
  if (symbols[0] !== tradingPair) {
    addError(report.errors, `ALPACA_SYMBOLS must match broker.tradingPair ${tradingPair}, got ${symbols[0]}`);
  }
}

function validateTtpCrossChecks(report) {
  const manualStatus = getPath(report.configSnapshot.config, 'evalRules.ttp.earningsRestriction.manualStatus');
  const accountStartDate = getPath(report.configSnapshot.config, 'evalRules.ttp.accountLimits.accountStartOfDayDate');
  const tradingPair = getPath(report.configSnapshot.config, 'broker.tradingPair');
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
    addError(report.errors, 'TTP earnings status must be an explicit object');
    return;
  }
  if (manualStatus.date !== accountStartDate) {
    addError(report.errors, `TTP earnings status date must match account start date ${accountStartDate}, got ${manualStatus.date}`);
  }
  if (!symbols || typeof symbols !== 'object' || Array.isArray(symbols)) {
    addError(report.errors, 'TTP earnings status symbols must be an object');
    return;
  }
  if (typeof symbols[tradingPair] !== 'boolean') {
    addError(report.errors, `TTP earnings status must include ${tradingPair} boolean, got ${typeof symbols[tradingPair]}`);
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
    profile = TradingConfig.resolveTuningProfile(profileName);
  } catch (error) {
    addError(report.errors, `Runtime tuning profile '${profileName}' failed to resolve: ${error.message}`);
    return;
  }

  const runtimeSnapshotKeys = Array.from(TradingConfig.PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS || [])
    .filter((key) => hasOwn(profile.env || {}, key));
  if (runtimeSnapshotKeys.length > 0) {
    addError(
      report.errors,
      `Runtime tuning profile '${profileName}' owns startup-snapshot key(s) ${runtimeSnapshotKeys.join(', ')} and cannot be used for eval-live posture`
    );
  }

  for (const key of ['RISK_MANAGER_BYPASS', 'ACCOUNT_DRAWDOWN_BYPASS']) {
    if (hasOwn(profile.env || {}, key) && String(profile.env[key]) !== 'false') {
      addError(report.errors, `Runtime tuning profile '${profileName}' sets ${key}=${profile.env[key]}; eval-live requires false`);
    }
  }
}

function validateEvalLivePosture(sourceEnv = process.env) {
  const effectiveEnv = buildEffectiveEnv(sourceEnv);
  const report = {
    status: 'FAIL',
    envFile: effectiveEnv.envFile,
    errors: [],
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

  try {
    report.configSnapshot = loadConfigSnapshot(sourceEnv);
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

function assertEvalLivePosture(sourceEnv = process.env) {
  const report = validateEvalLivePosture(sourceEnv);
  if (report.status !== 'PASS') {
    throw new Error(`eval-live posture gate failed: ${report.errors.join('; ')}`);
  }
  return report;
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
  return match.pm2_env && match.pm2_env.env
    ? match.pm2_env.env
    : match.pm2_env;
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

function main() {
  const args = parseCli(process.argv.slice(2));
  const sourceEnv = args.pm2 ? readPm2ProcessEnv(args.pm2) : process.env;
  const report = validateEvalLivePosture(sourceEnv);
  printReport(report);
  if (report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_CONFIG_EXACT,
  REQUIRED_CONFIG_PRESENT,
  REQUIRED_ENV_EXACT,
  assertEvalLivePosture,
  buildEffectiveEnv,
  readPm2ProcessEnv,
  validateEvalLivePosture,
};
