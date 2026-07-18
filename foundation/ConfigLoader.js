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
  'risk.guardMode',
  'risk.venueRailBuffer.enabled',
  'risk.venueRailBuffer.railDrawdownPercent',
  'risk.venueRailBuffer.triggerPercent',
  'risk.venueRailBuffer.releaseOnSessionReset',
  'risk.reconciliationReporter.enabled',
  'risk.reconciliationReporter.alertDeltaDollars',
  'risk.reconciliationReporter.alertDeltaPercent',
  'risk.sessionRiskResponse.enabled',
  'risk.sessionRiskResponse.triggerPercent',
  'risk.sessionRiskResponse.action',
  'risk.sessionRiskResponse.actionParams',
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

function requiredConfiguredString(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} must be a non-empty string`);
  }
  return value;
}

function requiredConfiguredPlainObject(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} must be an object`);
  }
  return cloneConfiguredObject(value);
}

function requiredConfluenceBoostConfig(strategyName) {
  const configPath = `strategies.${strategyName}.confluenceBoost`;
  const value = requiredConfiguredPlainObject(configPath);
  if (typeof value.enabled !== 'boolean') {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath}.enabled must be a boolean`);
  }
  if (!Number.isFinite(value.weight) || value.weight < 0) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath}.weight must be a finite non-negative number`);
  }
  return value;
}

function requiredRsiRegimeMaFilterConfig() {
  const configPath = 'strategies.RSI.regimeMaFilter';
  const value = requiredConfiguredPlainObject(configPath);
  if (typeof value.enabled !== 'boolean') {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath}.enabled must be a boolean`);
  }
  if (!Number.isInteger(value.period) || value.period <= 0) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath}.period must be a positive integer`);
  }
  const allowedTimeframes = ['trading', '1h', '4h'];
  if (typeof value.timeframe !== 'string' || !allowedTimeframes.includes(value.timeframe)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath}.timeframe must be one of ${allowedTimeframes.join(', ')}`);
  }
  return value;
}

function requiredRsiStrategyConfig() {
  const value = {
    period: requiredConfiguredNumber('strategies.RSI.period'),
    buyBelow: requiredConfiguredNumber('strategies.RSI.buyBelow'),
    exitAbove: requiredConfiguredNumber('strategies.RSI.exitAbove'),
    regimeMaFilter: requiredRsiRegimeMaFilterConfig(),
    confidenceBase: requiredConfiguredNumber('strategies.RSI.confidenceBase'),
    confidenceDepthRange: requiredConfiguredNumber('strategies.RSI.confidenceDepthRange'),
    confidenceDepthMultiplier: requiredConfiguredNumber('strategies.RSI.confidenceDepthMultiplier'),
    maxConfidence: requiredConfiguredNumber('strategies.RSI.maxConfidence'),
    confluenceBoost: requiredConfluenceBoostConfig('RSI'),
    enabled: requiredConfiguredBool('strategies.RSI.enabled'),
  };
  if (value.buyBelow >= value.exitAbove) {
    throw new Error(`[ConfigLoader] config/trading.config.json strategies.RSI.buyBelow (${value.buyBelow}) must be < strategies.RSI.exitAbove (${value.exitAbove})`);
  }
  return value;
}

function configuredValue(configPath, fallback = undefined) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  return value === undefined ? fallback : value;
}

function readConfiguredPath(root, configPath) {
  return configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), root);
}

function cloneConfiguredObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function requiredLaunchProfileValue(configPath) {
  const profileName = activeLaunchProfileContext?.profileName;
  const profile = activeLaunchProfileContext?.profile;
  if (!profileName || !profile) {
    throw new Error(`[ConfigLoader] launch profile context missing while reading ${configPath}`);
  }
  const value = readConfiguredPath(profile, configPath);
  if (value === undefined) {
    throw new Error(`[ConfigLoader] config/trading.config.json launchProfiles.${profileName}.${configPath} is required`);
  }
  return {
    value,
    source: `config:launchProfiles.${profileName}.${configPath}`,
  };
}

function requiredLaunchProfileBool(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (typeof result.value !== 'boolean') {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be a boolean`);
  }
  return result;
}

function requiredLaunchProfileNumber(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (!Number.isFinite(result.value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be a finite number`);
  }
  return result;
}

function requiredLaunchProfileNullableNumber(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (result.value === null) return result;
  if (!Number.isFinite(result.value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be a finite number or null`);
  }
  return result;
}

function requiredLaunchProfileString(configPath, allowedValues = null) {
  const result = requiredLaunchProfileValue(configPath);
  const value = typeof result.value === 'string' ? result.value.trim() : '';
  if (!value) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be a non-empty string`);
  }
  if (allowedValues && !allowedValues.has(value)) {
    throw new Error(
      `[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be one of ${Array.from(allowedValues).join(', ')}`
    );
  }
  return { value, source: result.source };
}

function requiredLaunchProfileStringList(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (!Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be an array`);
  }
  const values = result.value.map(item => String(item).trim()).filter(Boolean);
  if (values.length !== result.value.length) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} cannot contain blank strategy names`);
  }
  return { value: values, source: result.source };
}

function requiredLaunchProfilePlainObject(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be an object`);
  }
  return { value: cloneConfiguredObject(result.value), source: result.source };
}

function requiredLaunchProfileNullablePlainObject(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (result.value === null) {
    return { value: null, source: result.source };
  }
  if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be an object or null`);
  }
  return { value: cloneConfiguredObject(result.value), source: result.source };
}

function operationalLaunchProfileString(configPath, envKey) {
  const result = requiredLaunchProfileValue(configPath);
  const val = envSource()[envKey];
  if (val !== undefined && val !== '') {
    return { value: String(val), source: valueSource(envKey) };
  }
  if (typeof result.value !== 'string') {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be a string`);
  }
  return { value: result.value, source: result.source };
}

function operationalLaunchProfileNumber(configPath, envKey) {
  const result = requiredLaunchProfileValue(configPath);
  const val = envSource()[envKey];
  if (val !== undefined && val !== '') {
    const parsed = Number(val);
    return { value: Number.isFinite(parsed) ? parsed : NaN, source: valueSource(envKey) };
  }
  if (!Number.isFinite(result.value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)} must be a finite number`);
  }
  return result;
}

function operationalLaunchProfileNullablePlainObject(configPath, envKey) {
  const val = envSource()[envKey];
  if (val !== undefined && val !== '') {
    try {
      return { value: JSON.parse(val), source: valueSource(envKey) };
    } catch (error) {
      return { value: { __parseError: error.message }, source: valueSource(envKey) };
    }
  }
  return requiredLaunchProfileNullablePlainObject(configPath);
}

function validateMtfBoosterConfig(value, sourcePath) {
  const numericFields = [
    'minScore',
    'minConfidence',
    'strengthMultiplier',
    'maxMultiplier',
    'conflictMultiplier',
  ];
  const boolFields = [
    'enabled',
    'penalizeConflicts',
  ];

  for (const field of numericFields) {
    if (!Number.isFinite(value[field])) {
      throw new Error(`[ConfigLoader] config/trading.config.json ${sourcePath}.${field} must be a finite number`);
    }
  }
  for (const field of boolFields) {
    if (typeof value[field] !== 'boolean') {
      throw new Error(`[ConfigLoader] config/trading.config.json ${sourcePath}.${field} must be a boolean`);
    }
  }
  return value;
}

function requiredLaunchProfileMtfBooster() {
  const result = requiredLaunchProfilePlainObject('confluence.mtfBooster');
  return {
    value: validateMtfBoosterConfig(result.value, result.source.slice('config:'.length)),
    source: result.source,
  };
}

function requiredLaunchProfileStrategyMtf() {
  const result = requiredLaunchProfilePlainObject('confluence.strategyMtf');
  if (typeof result.value.enabled !== 'boolean') {
    throw new Error(`[ConfigLoader] config/trading.config.json ${result.source.slice('config:'.length)}.enabled must be a boolean`);
  }
  return result;
}

function validateMtfServiceConfig(value, sourcePath) {
  if (!Number.isInteger(value.minReadyTimeframes) || value.minReadyTimeframes < 1) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${sourcePath}.minReadyTimeframes must be a positive integer`);
  }
  if (!value.weights || typeof value.weights !== 'object' || Array.isArray(value.weights)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${sourcePath}.weights must be an object`);
  }
  for (const timeframe of ['1m', '5m', '15m', '30m', '1h', '4h', '1d']) {
    const weight = Number(value.weights[timeframe]);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`[ConfigLoader] config/trading.config.json ${sourcePath}.weights.${timeframe} must be a finite positive number`);
    }
  }
  return value;
}

function requiredLaunchProfileMtfService() {
  const result = requiredLaunchProfilePlainObject('confluence.mtfService');
  return {
    value: validateMtfServiceConfig(result.value, result.source.slice('config:'.length)),
    source: result.source,
  };
}

function configuredBoolResult(configPath) {
  return {
    value: requiredConfiguredBool(configPath),
    source: `config:${configPath}`,
  };
}

function configuredNumberResult(configPath) {
  return {
    value: requiredConfiguredNumber(configPath),
    source: `config:${configPath}`,
  };
}

function configuredValueResult(configPath) {
  const value = readConfiguredPath(tradingConfigFile, configPath);
  if (value === undefined) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} is required`);
  }
  return {
    value,
    source: `config:${configPath}`,
  };
}

function configuredPlainObjectResult(configPath) {
  const result = configuredValueResult(configPath);
  if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} must be an object`);
  }
  return {
    value: cloneConfiguredObject(result.value),
    source: result.source,
  };
}

const LIVE_MIN_TRADE_CONFIDENCE_FLOOR = requiredConfiguredNumber('confidence.minTradeConfidence');

// ═══════════════════════════════════════════════════════════════
// ENV READER HELPERS (private — only used inside this file)
// ═══════════════════════════════════════════════════════════════

let activeEnv = process.env;
let activeEnvSources = {};
let activeLaunchProfileContext = null;

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

function envStringList(key, fallback) {
  const val = envSource()[key];
  if (val !== undefined && val !== '') {
    return {
      value: String(val).split(',').map(item => item.trim()).filter(Boolean),
      source: valueSource(key),
    };
  }
  return { value: fallback, source: 'default' };
}

function configStringListWithBacktestEnvAlias(configPath, envKey) {
  const configured = requiredLaunchProfileStringList(configPath);
  const val = envSource()[envKey];
  if (activeLaunchProfileContext?.mode === 'backtest' && val !== undefined && val !== '') {
    return {
      value: String(val).split(',').map(item => item.trim()).filter(Boolean),
      source: valueSource(envKey),
    };
  }
  return configured;
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

function applyTuningProfileEnv(sourceEnv, sourceOverrides = {}) {
  const selectedKey = sourceEnv.BACKTEST_TUNING_PROFILE
    ? 'BACKTEST_TUNING_PROFILE'
    : (sourceEnv.TUNING_PROFILE ? 'TUNING_PROFILE' : null);
  if (!selectedKey) {
    return { values: sourceEnv, sources: sourceOverrides };
  }

  const profileName = String(sourceEnv[selectedKey] || '').trim();
  if (!profileName) {
    return { values: sourceEnv, sources: sourceOverrides };
  }

  const definitions = tradingConfigFile.tuningProfiles?.definitions || {};
  const profile = definitions[profileName];
  if (!profile) {
    throw new Error(
      `[ConfigLoader] Unknown tuning profile '${profileName}'. Available: ${Object.keys(definitions).join(', ')}`
    );
  }

  const values = { ...sourceEnv };
  const sources = { ...sourceOverrides };
  for (const [key, value] of Object.entries(profile.env || {})) {
    values[key] = String(value);
    sources[key] = `profile:${profileName}:${key}`;
  }
  return { values, sources };
}

const VALID_LAUNCH_MODES = Object.freeze(new Set(['live', 'paper', 'backtest']));
const VALID_DIRECTION_FILTERS = Object.freeze(new Set(['both', 'long_only', 'short_only']));
const VALID_SESSION_ROUTER_MODES = Object.freeze(new Set(['static', 'scheduled']));
const VALID_SESSION_ROUTER_STATIC_SESSIONS = Object.freeze(new Set(['stocks', 'crypto']));
const VALID_RISK_GUARD_MODES = Object.freeze(new Set(['off', 'venueRailBuffer']));
const VALID_SESSION_RISK_ACTIONS = Object.freeze(new Set(['halt', 'pause', 'reduce', 'tighten', 'alert']));

function requireLaunchProfiles() {
  const launchProfiles = tradingConfigFile.launchProfiles;
  if (!launchProfiles || typeof launchProfiles !== 'object' || Array.isArray(launchProfiles)) {
    throw new Error('[ConfigLoader] config/trading.config.json must define launchProfiles');
  }
  return launchProfiles;
}

function getLaunchProfileDefinitions(launchProfiles) {
  const rawDefinitions = launchProfiles.definitions || launchProfiles;
  return Object.fromEntries(
    Object.entries(rawDefinitions)
      .filter(([name, value]) => name !== 'defaultProfile' && value && typeof value === 'object' && !Array.isArray(value))
  );
}

function resolveLaunchProfileName(sourceEnv, launchProfiles = requireLaunchProfiles()) {
  const explicitProfileName = String(sourceEnv.PROFILE || '').trim();
  if (explicitProfileName) {
    return { profileName: explicitProfileName, source: 'env:PROFILE' };
  }

  const defaultProfileName = String(launchProfiles.defaultProfile || '').trim();
  if (!defaultProfileName) {
    throw new Error('[ConfigLoader] config/trading.config.json launchProfiles.defaultProfile is required when PROFILE is absent');
  }
  return { profileName: defaultProfileName, source: 'config:launchProfiles.defaultProfile' };
}

function normalizeLaunchMode(profileName, profile) {
  const mode = String(profile?.mode || '').trim().toLowerCase();
  if (!VALID_LAUNCH_MODES.has(mode)) {
    throw new Error(`[ConfigLoader] launchProfiles.${profileName}.mode must be live, paper, or backtest`);
  }
  if (typeof profile.confirmLive !== 'boolean') {
    throw new Error(`[ConfigLoader] launchProfiles.${profileName}.confirmLive must be boolean`);
  }
  return mode;
}

function validateLaunchProfileSessionRouter(profileName, profile) {
  const router = profile?.sessionRouter;
  if (!router || typeof router !== 'object' || Array.isArray(router)) {
    throw new Error(`[ConfigLoader] launchProfiles.${profileName}.sessionRouter is required`);
  }
  const mode = String(router.mode || '').trim().toLowerCase();
  if (!VALID_SESSION_ROUTER_MODES.has(mode)) {
    throw new Error(`[ConfigLoader] launchProfiles.${profileName}.sessionRouter.mode must be static or scheduled`);
  }
  if (mode === 'static') {
    const staticSession = String(router.staticSession || '').trim().toLowerCase();
    if (!VALID_SESSION_ROUTER_STATIC_SESSIONS.has(staticSession)) {
      throw new Error(`[ConfigLoader] launchProfiles.${profileName}.sessionRouter.staticSession must be stocks or crypto when mode=static`);
    }
  }
  if (mode === 'scheduled' && (!router.schedule || typeof router.schedule !== 'object' || Array.isArray(router.schedule))) {
    throw new Error(`[ConfigLoader] launchProfiles.${profileName}.sessionRouter.schedule is required when mode=scheduled`);
  }
}

function resolveLaunchProfile(sourceEnv, launchProfiles = requireLaunchProfiles()) {
  const profileDefinitions = getLaunchProfileDefinitions(launchProfiles);
  const { profileName, source } = resolveLaunchProfileName(sourceEnv, launchProfiles);
  const profile = profileDefinitions[profileName];
  if (!profile) {
    throw new Error(
      `[ConfigLoader] Unknown PROFILE '${profileName}'. Available: ${Object.keys(profileDefinitions).join(', ')}`
    );
  }

  const mode = normalizeLaunchMode(profileName, profile);
  validateLaunchProfileSessionRouter(profileName, profile);
  return {
    profileName,
    profileSource: source,
    profile,
    mode,
    confirmLive: profile.confirmLive,
  };
}

function applyLaunchProfileEnv(sourceEnv, sourceOverrides = {}) {
  const launchProfile = resolveLaunchProfile(sourceEnv);
  const values = {
    ...sourceEnv,
    PROFILE: launchProfile.profileName,
  };
  const sources = {
    ...sourceOverrides,
    PROFILE: launchProfile.profileSource,
  };

  return { values, sources, launchProfile };
}

function buildEffectiveEnv(sourceEnv, sourceOverrides = {}, launchProfileContext = null) {
  const effectiveEnv = { ...sourceEnv };
  const sources = { ...sourceOverrides };

  if (launchProfileContext?.mode === 'backtest') {
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
  const feeMakerConfig = envFloat('FEE_MAKER', 0);
  const feeTakerConfig = envFloat('FEE_TAKER', 0);
  const feeTotalRoundTripConfig = envFloat(
    'FEE_TOTAL_ROUNDTRIP',
    feeMakerConfig.value + feeTakerConfig.value
  );
  const sessionRouterMode = track('sessionRouter.mode', requiredLaunchProfileString('sessionRouter.mode', VALID_SESSION_ROUTER_MODES));
  const sessionRouterConfig = {
    mode: sessionRouterMode,
    cryptoSymbols: track('sessionRouter.cryptoSymbols', requiredLaunchProfileStringList('sessionRouter.cryptoSymbols')),
    checkIntervalMs: track('sessionRouter.checkIntervalMs', requiredLaunchProfileNumber('sessionRouter.checkIntervalMs')),
    forceCloseOnSessionEnd: track('sessionRouter.forceCloseOnSessionEnd', requiredLaunchProfileBool('sessionRouter.forceCloseOnSessionEnd')),
    fast: track('sessionRouter.fast', requiredLaunchProfileBool('sessionRouter.fast')),
  };
  if (sessionRouterMode === 'static') {
    sessionRouterConfig.staticSession = track(
      'sessionRouter.staticSession',
      requiredLaunchProfileString('sessionRouter.staticSession', VALID_SESSION_ROUTER_STATIC_SESSIONS)
    );
  } else {
    sessionRouterConfig.schedule = track(
      'sessionRouter.schedule',
      requiredLaunchProfilePlainObject('sessionRouter.schedule')
    );
  }

  const config = {
    // ─── EXECUTION MODE ───
    mode: {
      launchProfile: track('mode.launchProfile', {
        value: activeLaunchProfileContext.profileName,
        source: activeLaunchProfileContext.profileSource,
      }),
      execution: track('mode.execution', {
        value: activeLaunchProfileContext.mode,
        source: `config:launchProfiles.${activeLaunchProfileContext.profileName}.mode`,
      }),
      confirmLive: track('mode.confirmLive', {
        value: activeLaunchProfileContext.confirmLive,
        source: `config:launchProfiles.${activeLaunchProfileContext.profileName}.confirmLive`,
      }),
      backtest: track('mode.backtest', {
        value: activeLaunchProfileContext.mode === 'backtest',
        source: `config:launchProfiles.${activeLaunchProfileContext.profileName}.mode`,
      }),
      paperTrading: track('mode.paperTrading', {
        value: activeLaunchProfileContext.mode === 'paper',
        source: `config:launchProfiles.${activeLaunchProfileContext.profileName}.mode`,
      }),
      liveTrading: track('mode.liveTrading', {
        value: activeLaunchProfileContext.mode === 'live',
        source: `config:launchProfiles.${activeLaunchProfileContext.profileName}.mode`,
      }),
      confirmLiveTrading: track('mode.confirmLiveTrading', {
        value: activeLaunchProfileContext.confirmLive,
        source: `config:launchProfiles.${activeLaunchProfileContext.profileName}.confirmLive`,
      }),
      testMode: track('mode.testMode', {
        value: false,
        source: `config:launchProfiles.${activeLaunchProfileContext.profileName}.mode`,
      }),
      candleSource: track('mode.candleSource', envStr('CANDLE_SOURCE', 'websocket')),
    },

    sessionRouter: sessionRouterConfig,

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
      minTradeConfidence: track('confidence.minTradeConfidence', requiredLaunchProfileNumber('confidence.minTradeConfidence')),
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

    exitLogic: {
      beScaleOut: {
        enabled: track('exitLogic.beScaleOut.enabled', envBool('BE_SCALEOUT_ENABLED', configuredValue('exitLogic.beScaleOut.enabled', true))),
        triggerType: track('exitLogic.beScaleOut.triggerType', envStr('BE_SCALEOUT_TRIGGER', configuredValue('exitLogic.beScaleOut.triggerType', 'one_to_one_r'))),
        fixedPercentTrigger: track('exitLogic.beScaleOut.fixedPercentTrigger', envFloat('BE_SCALEOUT_TRIGGER_PCT', configuredValue('exitLogic.beScaleOut.fixedPercentTrigger', 0.5))),
        scaleOutFraction: track('exitLogic.beScaleOut.scaleOutFraction', envFloat('BE_SCALEOUT_FRACTION', configuredValue('exitLogic.beScaleOut.scaleOutFraction', 0.5))),
        feeBufferPercent: track('exitLogic.beScaleOut.feeBufferPercent', envFloat('BE_SCALEOUT_FEE_BUFFER', configuredValue('exitLogic.beScaleOut.feeBufferPercent', 0.05))),
      },
      tieredExit: {
        enabled: track('exitLogic.tieredExit.enabled', envBool('TIERED_EXIT_ENABLED', configuredValue('exitLogic.tieredExit.enabled', true))),
        tier1ExitFraction: track('exitLogic.tieredExit.tier1ExitFraction', envFloat('TIER1_EXIT_FRACTION', configuredValue('exitLogic.tieredExit.tier1ExitFraction', 0.3))),
        tier2ExitFraction: track('exitLogic.tieredExit.tier2ExitFraction', envFloat('TIER2_EXIT_FRACTION', configuredValue('exitLogic.tieredExit.tier2ExitFraction', 0.3))),
        tier3ExitFraction: track('exitLogic.tieredExit.tier3ExitFraction', envFloat('TIER3_EXIT_FRACTION', configuredValue('exitLogic.tieredExit.tier3ExitFraction', 0.2))),
        enableMarketAdaptation: track('exitLogic.tieredExit.enableMarketAdaptation', envBool('TIER_MARKET_ADAPTATION_ENABLED', configuredValue('exitLogic.tieredExit.enableMarketAdaptation', true))),
        trendingTargetMultiplier: track('exitLogic.tieredExit.trendingTargetMultiplier', envFloat('TIER_TREND_MULT', configuredValue('exitLogic.tieredExit.trendingTargetMultiplier', 1.3))),
        rangingTargetMultiplier: track('exitLogic.tieredExit.rangingTargetMultiplier', envFloat('TIER_RANGE_MULT', configuredValue('exitLogic.tieredExit.rangingTargetMultiplier', 0.8))),
        highConfidenceThreshold: track('exitLogic.tieredExit.highConfidenceThreshold', envFloat('TIER_HIGH_CONF_THRESHOLD', configuredValue('exitLogic.tieredExit.highConfidenceThreshold', 0.8))),
        highConfidenceMultiplier: track('exitLogic.tieredExit.highConfidenceMultiplier', envFloat('TIER_HIGH_CONF_MULT', configuredValue('exitLogic.tieredExit.highConfidenceMultiplier', 1.2))),
        lowConfidenceThreshold: track('exitLogic.tieredExit.lowConfidenceThreshold', envFloat('TIER_LOW_CONF_THRESHOLD', configuredValue('exitLogic.tieredExit.lowConfidenceThreshold', 0.6))),
        lowConfidenceMultiplier: track('exitLogic.tieredExit.lowConfidenceMultiplier', envFloat('TIER_LOW_CONF_MULT', configuredValue('exitLogic.tieredExit.lowConfidenceMultiplier', 0.8))),
      },
    },

    strategyBehavior: {
      emaCrossover: {
        entryEventsOnly: track('strategyBehavior.emaCrossover.entryEventsOnly', requiredLaunchProfileBool('strategyBehavior.emaCrossover.entryEventsOnly')),
        confirmBars: track('strategyBehavior.emaCrossover.confirmBars', requiredLaunchProfileNumber('strategyBehavior.emaCrossover.confirmBars')),
        warmupBars: track('strategyBehavior.emaCrossover.warmupBars', requiredLaunchProfileNumber('strategyBehavior.emaCrossover.warmupBars')),
      },
      trendRegimeGate: {
        enabled: track('strategyBehavior.trendRegimeGate.enabled', envBool('TREND_REGIME_GATE_ENABLED', configuredValue('strategyBehavior.trendRegimeGate.enabled', false))),
        minConfidence: track('strategyBehavior.trendRegimeGate.minConfidence', envFloat('TREND_REGIME_GATE_MIN_CONFIDENCE', configuredValue('strategyBehavior.trendRegimeGate.minConfidence', 0.25))),
        strategies: track('strategyBehavior.trendRegimeGate.strategies', {
          value: configuredValue('strategyBehavior.trendRegimeGate.strategies', []),
          source: 'default',
        }),
      },
      atrContracts: {
        enabled: track('strategyBehavior.atrContracts.enabled', envBool('ATR_CONTRACTS_ENABLED', configuredValue('strategyBehavior.atrContracts.enabled', false))),
        stopMultiplier: track('strategyBehavior.atrContracts.stopMultiplier', envFloat('ATR_STOP_MULTIPLIER', configuredValue('strategyBehavior.atrContracts.stopMultiplier', 2.0))),
        trailMultiplier: track('strategyBehavior.atrContracts.trailMultiplier', envFloat('ATR_TRAIL_MULTIPLIER', configuredValue('strategyBehavior.atrContracts.trailMultiplier', 2.0))),
        trailingActivationR: track('strategyBehavior.atrContracts.trailingActivationR', envFloat('ATR_TRAILING_ACTIVATION_R', configuredValue('strategyBehavior.atrContracts.trailingActivationR', 1.0))),
      },
    },

    orchestrator: {
      mtfTimeframes: track('orchestrator.mtfTimeframes', envStringList(
        'MTF_TIMEFRAMES',
        configuredValue('orchestrator.mtfTimeframes', ['1m', '5m', '15m', '1h', '4h'])
      )),
      mtfConfluenceService: track('orchestrator.mtfConfluenceService', requiredLaunchProfileMtfService()),
      mtfConfluenceBooster: track('orchestrator.mtfConfluenceBooster', requiredLaunchProfileMtfBooster()),
      strategyMtfConfluence: track('orchestrator.strategyMtfConfluence', requiredLaunchProfileStrategyMtf()),
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
      guardMode: track('risk.guardMode', requiredLaunchProfileString('risk.guardMode', VALID_RISK_GUARD_MODES)),
      venueRailBuffer: {
        enabled: track('risk.venueRailBuffer.enabled', requiredLaunchProfileBool('risk.venueRailBuffer.enabled')),
        railDrawdownPercent: track('risk.venueRailBuffer.railDrawdownPercent', requiredLaunchProfileNullableNumber('risk.venueRailBuffer.railDrawdownPercent')),
        triggerPercent: track('risk.venueRailBuffer.triggerPercent', requiredLaunchProfileNullableNumber('risk.venueRailBuffer.triggerPercent')),
        releaseOnSessionReset: track('risk.venueRailBuffer.releaseOnSessionReset', requiredLaunchProfileBool('risk.venueRailBuffer.releaseOnSessionReset')),
      },
      reconciliationReporter: {
        enabled: track('risk.reconciliationReporter.enabled', requiredLaunchProfileBool('risk.reconciliationReporter.enabled')),
        alertDeltaDollars: track('risk.reconciliationReporter.alertDeltaDollars', requiredLaunchProfileNullableNumber('risk.reconciliationReporter.alertDeltaDollars')),
        alertDeltaPercent: track('risk.reconciliationReporter.alertDeltaPercent', requiredLaunchProfileNullableNumber('risk.reconciliationReporter.alertDeltaPercent')),
      },
      sessionRiskResponse: {
        enabled: track('risk.sessionRiskResponse.enabled', requiredLaunchProfileBool('risk.sessionRiskResponse.enabled')),
        triggerPercent: track('risk.sessionRiskResponse.triggerPercent', requiredLaunchProfileNullableNumber('risk.sessionRiskResponse.triggerPercent')),
        action: track('risk.sessionRiskResponse.action', requiredLaunchProfileString('risk.sessionRiskResponse.action', VALID_SESSION_RISK_ACTIONS)),
        actionParams: track('risk.sessionRiskResponse.actionParams', requiredLaunchProfilePlainObject('risk.sessionRiskResponse.actionParams')),
      },
    },

    // ─── FILTERS ───
    filters: {
      atrEnabled: track('filters.atrEnabled', envBool('ATR_FILTER_ENABLED', requiredConfiguredBool('filters.atrEnabled'))),
      atrMinPercent: track('filters.atrMinPercent', envFloat('ATR_MIN_PERCENT', requiredConfiguredNumber('filters.atrMinPercent'))),
    },

    // --- EVAL RULES ---
    evalRules: {
      enabled: track('evalRules.enabled', requiredLaunchProfileBool('venueGuards.ttp.enabled')),
      ttp: {
        enabled: track('evalRules.ttp.enabled', requiredLaunchProfileBool('venueGuards.ttp.enabled')),
        volumeCap: {
          enabled: track('evalRules.ttp.volumeCap.enabled', requiredLaunchProfileBool('venueGuards.ttp.volumeCap.enabled')),
          percent: track('evalRules.ttp.volumeCap.percent', requiredLaunchProfileNumber('venueGuards.ttp.volumeCap.percent')),
          timeframe: track('evalRules.ttp.volumeCap.timeframe', requiredLaunchProfileString('venueGuards.ttp.volumeCap.timeframe')),
          fallbackToMostRecentVolume: track('evalRules.ttp.volumeCap.fallbackToMostRecentVolume', requiredLaunchProfileBool('venueGuards.ttp.volumeCap.fallbackToMostRecentVolume')),
          maxReferenceAgeMs: track('evalRules.ttp.volumeCap.maxReferenceAgeMs', requiredLaunchProfileNumber('venueGuards.ttp.volumeCap.maxReferenceAgeMs')),
          maxReferenceAgeLimitMs: 300000,
        },
        marketTime: {
          enabled: track('evalRules.ttp.marketTime.enabled', requiredLaunchProfileBool('venueGuards.ttp.marketTime.enabled')),
          blockEntriesAfterCutoff: track('evalRules.ttp.marketTime.blockEntriesAfterCutoff', requiredLaunchProfileBool('venueGuards.ttp.marketTime.blockEntriesAfterCutoff')),
          liquidationEnabled: track('evalRules.ttp.marketTime.liquidationEnabled', requiredLaunchProfileBool('venueGuards.ttp.marketTime.liquidationEnabled')),
          cutoffMinutesBeforeClose: track('evalRules.ttp.marketTime.cutoffMinutesBeforeClose', requiredLaunchProfileNumber('venueGuards.ttp.marketTime.cutoffMinutesBeforeClose')),
          entryBufferMinutesBeforeCutoff: track('evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff', requiredLaunchProfileNumber('venueGuards.ttp.marketTime.entryBufferMinutesBeforeCutoff')),
        },
        accountLimits: {
          enabled: track('evalRules.ttp.accountLimits.enabled', requiredLaunchProfileBool('venueGuards.ttp.accountLimits.enabled')),
          enforceDailyLossPause: track('evalRules.ttp.accountLimits.enforceDailyLossPause', requiredLaunchProfileBool('venueGuards.ttp.accountLimits.enforceDailyLossPause')),
          enforceMaxLoss: track('evalRules.ttp.accountLimits.enforceMaxLoss', requiredLaunchProfileBool('venueGuards.ttp.accountLimits.enforceMaxLoss')),
          accountStartOfDayDate: track('evalRules.ttp.accountLimits.accountStartOfDayDate', operationalLaunchProfileString('venueGuards.ttp.accountLimits.accountStartOfDayDate', 'TTP_ACCOUNT_START_OF_DAY_DATE')),
          accountStartOfDayEquity: track('evalRules.ttp.accountLimits.accountStartOfDayEquity', operationalLaunchProfileNumber('venueGuards.ttp.accountLimits.accountStartOfDayEquity', 'TTP_ACCOUNT_START_OF_DAY_EQUITY')),
          dailyLossDollars: track('evalRules.ttp.accountLimits.dailyLossDollars', requiredLaunchProfileNumber('venueGuards.ttp.accountLimits.dailyLossDollars')),
          maxLossThresholdEquity: track('evalRules.ttp.accountLimits.maxLossThresholdEquity', requiredLaunchProfileNumber('venueGuards.ttp.accountLimits.maxLossThresholdEquity')),
        },
        earningsRestriction: {
          enabled: track('evalRules.ttp.earningsRestriction.enabled', requiredLaunchProfileBool('venueGuards.ttp.earningsRestriction.enabled')),
          blockEntries: track('evalRules.ttp.earningsRestriction.blockEntries', requiredLaunchProfileBool('venueGuards.ttp.earningsRestriction.blockEntries')),
          manualStatus: track('evalRules.ttp.earningsRestriction.manualStatus', operationalLaunchProfileNullablePlainObject('venueGuards.ttp.earningsRestriction.manualStatus', 'TTP_EARNINGS_STATUS_JSON')),
        },
        consistency: {
          enabled: track('evalRules.ttp.consistency.enabled', requiredLaunchProfileBool('venueGuards.ttp.consistency.enabled')),
          maxPositionProfitRatio: track('evalRules.ttp.consistency.maxPositionProfitRatio', requiredLaunchProfileNumber('venueGuards.ttp.consistency.maxPositionProfitRatio')),
          profitTargetDollars: track('evalRules.ttp.consistency.profitTargetDollars', requiredLaunchProfileNumber('venueGuards.ttp.consistency.profitTargetDollars')),
          maxProfitTargetInitialBalanceRatio: track('evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio', requiredLaunchProfileNumber('venueGuards.ttp.consistency.maxProfitTargetInitialBalanceRatio')),
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
      soloFilter: track('strategies.soloFilter', configStringListWithBacktestEnvAlias('strategies.soloFilter', 'SOLO_STRATEGY')),
      enableRSI: track('strategies.enableRSI', requiredLaunchProfileBool('pipeline.enableRSI')),
      enableMADynamicSR: track('strategies.enableMADynamicSR', requiredLaunchProfileBool('pipeline.enableMADynamicSR')),
      MADynamicSR: track('strategies.MADynamicSR', configuredPlainObjectResult('strategies.MADynamicSR')),
      enableEMACrossover: track('strategies.enableEMACrossover', requiredLaunchProfileBool('pipeline.enableEMACrossover')),
      enableLiquiditySweep: track('strategies.enableLiquiditySweep', requiredLaunchProfileBool('pipeline.enableLiquiditySweep')),
      enableCandlePattern: track('strategies.enableCandlePattern', requiredLaunchProfileBool('pipeline.enableCandlePattern')),
      enableBreakRetest: track('strategies.enableBreakRetest', requiredLaunchProfileBool('pipeline.enableBreakRetest')),
      enableMarketRegime: track('strategies.enableMarketRegime', requiredLaunchProfileBool('pipeline.enableMarketRegime')),
      enableOGZTPO: track('strategies.enableOGZTPO', requiredLaunchProfileBool('pipeline.enableOGZTPO')),
      enableORB: track('strategies.enableORB', requiredLaunchProfileBool('pipeline.enableOpeningRangeBreakout')),
      enableSmartMoneySweep: track('strategies.enableSmartMoneySweep', requiredLaunchProfileBool('pipeline.enableSmartMoneySweep')),
      enableNoWickImbalance: track('strategies.enableNoWickImbalance', requiredLaunchProfileBool('pipeline.enableNoWickImbalance')),
      enableDonchianBreakout: track('strategies.enableDonchianBreakout', requiredLaunchProfileBool('pipeline.enableDonchianBreakout')),
      enablePropSafeEMAPullback: track('strategies.enablePropSafeEMAPullback', requiredLaunchProfileBool('pipeline.enablePropSafeEMAPullback')),
      enableEMATrendRetest: track('strategies.enableEMATrendRetest', requiredLaunchProfileBool('pipeline.enableEMATrendRetest')),
      enableRSI2MeanReversion: track('strategies.enableRSI2MeanReversion', requiredLaunchProfileBool('pipeline.enableRSI2MeanReversion')),
      enableTimeSeriesMomentum: track('strategies.enableTimeSeriesMomentum', requiredLaunchProfileBool('pipeline.enableTimeSeriesMomentum')),
      enableDashboard: track('strategies.enableDashboard', envBool('ENABLE_DASHBOARD', true)),
      EMASMACrossover: track('strategies.EMASMACrossover', requiredConfiguredPlainObject('strategies.EMASMACrossover')),
      OpeningRangeBreakout: track('strategies.OpeningRangeBreakout', configuredPlainObjectResult('strategies.OpeningRangeBreakout')),
      OGZTPO: track('strategies.OGZTPO', configuredPlainObjectResult('strategies.OGZTPO')),
      NoWickImbalance: track('strategies.NoWickImbalance', configuredPlainObjectResult('strategies.NoWickImbalance')),
      PropSafeEMAPullback: track('strategies.PropSafeEMAPullback', configuredPlainObjectResult('strategies.PropSafeEMAPullback')),
      EMATrendRetest: track('strategies.EMATrendRetest', configuredPlainObjectResult('strategies.EMATrendRetest')),
      RSI2MeanReversion: track('strategies.RSI2MeanReversion', configuredPlainObjectResult('strategies.RSI2MeanReversion')),
      TimeSeriesMomentum: track('strategies.TimeSeriesMomentum', configuredPlainObjectResult('strategies.TimeSeriesMomentum')),
    },

    features: {
      enableShorts: track('features.enableShorts', requiredLaunchProfileBool('features.enableShorts')),
    },

    pipeline: {
      directionFilter: track('pipeline.directionFilter', requiredLaunchProfileString('pipeline.directionFilter', VALID_DIRECTION_FILTERS)),
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

  if (!config.mode.launchProfile) {
    errors.push('mode.launchProfile must resolve from PROFILE or config/trading.config.json launchProfiles.defaultProfile');
  }
  if (!VALID_LAUNCH_MODES.has(config.mode.execution)) {
    errors.push(`mode.execution must be live, paper, or backtest; got ${config.mode.execution || '(missing)'}`);
  }

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
  if (!VALID_RISK_GUARD_MODES.has(config.risk.guardMode)) {
    errors.push(`risk.guardMode must be off or venueRailBuffer; got ${config.risk.guardMode || '(missing)'}`);
  }
  if (config.risk.venueRailBuffer?.enabled) {
    if (!Number.isFinite(config.risk.venueRailBuffer.railDrawdownPercent)) {
      errors.push('risk.venueRailBuffer.railDrawdownPercent is required when venue rail buffer is enabled');
    }
    if (!Number.isFinite(config.risk.venueRailBuffer.triggerPercent)) {
      errors.push('risk.venueRailBuffer.triggerPercent is required when venue rail buffer is enabled');
    }
  }
  if (config.mode.liveTrading && config.webhookOrders.enabled && config.webhookOrders.dryRun) {
    errors.push('LIVE_TRADING=true cannot run with WEBHOOK_ORDERS_ENABLED=true and WEBHOOK_DRY_RUN=true');
  }
  const sessionRouter = config.sessionRouter || {};
  if (!VALID_SESSION_ROUTER_MODES.has(sessionRouter.mode)) {
    errors.push(`sessionRouter.mode must be static or scheduled; got ${sessionRouter.mode || '(missing)'}`);
  }
  if (sessionRouter.mode === 'static' && !VALID_SESSION_ROUTER_STATIC_SESSIONS.has(sessionRouter.staticSession)) {
    errors.push(`sessionRouter.staticSession must be stocks or crypto when mode=static; got ${sessionRouter.staticSession || '(missing)'}`);
  }
  if (sessionRouter.mode === 'scheduled' && (!sessionRouter.schedule || typeof sessionRouter.schedule !== 'object' || Array.isArray(sessionRouter.schedule))) {
    errors.push('sessionRouter.schedule is required when mode=scheduled');
  }
  if (!Array.isArray(sessionRouter.cryptoSymbols) || sessionRouter.cryptoSymbols.length === 0) {
    errors.push('sessionRouter.cryptoSymbols must be a non-empty array');
  }
  if (!Number.isInteger(sessionRouter.checkIntervalMs) || sessionRouter.checkIntervalMs <= 0) {
    errors.push(`sessionRouter.checkIntervalMs must be a positive integer; got ${sessionRouter.checkIntervalMs}`);
  }
  if (typeof sessionRouter.forceCloseOnSessionEnd !== 'boolean') {
    errors.push('sessionRouter.forceCloseOnSessionEnd must be boolean');
  }
  if (typeof sessionRouter.fast !== 'boolean') {
    errors.push('sessionRouter.fast must be boolean');
  }
  for (const [strategyName, strategyConfig] of Object.entries(config.strategies || {})) {
    if (!strategyConfig || typeof strategyConfig !== 'object' || Array.isArray(strategyConfig)) {
      continue;
    }
    const boost = strategyConfig.confluenceBoost;
    if (!boost || typeof boost !== 'object' || Array.isArray(boost)) {
      errors.push(`strategies.${strategyName}.confluenceBoost must be configured as an object`);
      continue;
    }
    if (typeof boost.enabled !== 'boolean') {
      errors.push(`strategies.${strategyName}.confluenceBoost.enabled must be boolean`);
    }
    if (!Number.isFinite(boost.weight) || boost.weight < 0) {
      errors.push(`strategies.${strategyName}.confluenceBoost.weight must be a finite non-negative number`);
    }
  }
  if (config.mode.liveTrading) {
    const minTradeConfidenceSource = sources['confidence.minTradeConfidence'];
    const minTradeConfidenceExplicit = /^config:launchProfiles\.[^.]+\.confidence\.minTradeConfidence$/.test(String(minTradeConfidenceSource || ''));
    if (!minTradeConfidenceExplicit) {
      errors.push(`LIVE_TRADING=true requires launchProfiles.<profile>.confidence.minTradeConfidence, got ${minTradeConfidenceSource || 'missing'}`);
    }
    if (!Number.isFinite(config.confidence.minTradeConfidence) || config.confidence.minTradeConfidence < LIVE_MIN_TRADE_CONFIDENCE_FLOOR) {
      errors.push(`LIVE_TRADING=true requires launchProfiles.<profile>.confidence.minTradeConfidence >= ${LIVE_MIN_TRADE_CONFIDENCE_FLOOR}, got ${config.confidence.minTradeConfidence}`);
    }
  }
  if (config.mode.liveTrading && config.evalRules.enabled !== true) {
    errors.push('LIVE_TRADING=true cannot run with launchProfiles.<profile>.venueGuards.ttp.enabled=false because EvalRuleEngine fails open when disabled');
  }
  if (config.mode.liveTrading && config.evalRules.enabled === true && config.evalRules.ttp.enabled !== true) {
    errors.push('LIVE_TRADING=true cannot run with launchProfiles.<profile>.venueGuards.ttp.enabled=false while eval rules are enabled because TTP rules fail open when disabled');
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
        warnings.push(`TTP_ACCOUNT_START_OF_DAY_DATE should be YYYY-MM-DD for daily loss pause, got ${ttpAccountLimits.accountStartOfDayDate || '(missing)'}; entries will be blocked by TTP account limits until refreshed`);
      } else if (config.mode.liveTrading && String(ttpAccountLimits.accountStartOfDayDate) !== currentNewYorkDate) {
        warnings.push(`TTP_ACCOUNT_START_OF_DAY_DATE ${ttpAccountLimits.accountStartOfDayDate} does not match current New York date ${currentNewYorkDate}; entries will be blocked by TTP account limits until refreshed`);
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
          warnings.push(`TTP_EARNINGS_STATUS_JSON.date should be YYYY-MM-DD, got ${manualStatus.date || '(missing)'}; stale manual earnings status will block entries until refreshed`);
        } else if (config.mode.liveTrading && String(manualStatus.date) !== currentNewYorkDate) {
          warnings.push(`TTP_EARNINGS_STATUS_JSON.date ${manualStatus.date} does not match current New York date ${currentNewYorkDate}; stale manual earnings status will block entries until refreshed`);
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
let baseConfigFallbackWarnedPaths = new Set();

function buildSnapshot(sourceEnv = process.env, opts = {}) {
  const envPath = sourceEnv.DOTENV_CONFIG_PATH || '.env';
  const dotenvValues = opts.loadDotenv === false ? {} : loadDotenvValues(envPath);
  const baseEnv = { ...dotenvValues, ...sourceEnv };
  const baseEnvSources = buildDotenvSources(dotenvValues, sourceEnv);
  const launchProfiledEnv = applyLaunchProfileEnv(baseEnv, baseEnvSources);
  const profiledEnv = applyTuningProfileEnv(launchProfiledEnv.values, launchProfiledEnv.sources);

  const previousEnv = activeEnv;
  const previousEnvSources = activeEnvSources;
  const previousLaunchProfileContext = activeLaunchProfileContext;
  const effectiveEnv = buildEffectiveEnv(profiledEnv.values, profiledEnv.sources, launchProfiledEnv.launchProfile);
  activeEnv = effectiveEnv.values;
  activeEnvSources = effectiveEnv.sources;
  activeLaunchProfileContext = launchProfiledEnv.launchProfile;

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
    activeLaunchProfileContext = previousLaunchProfileContext;
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
  baseConfigFallbackWarnedPaths.clear();
}

// ═══════════════════════════════════════════════════════════════
// LEGACY TRADING CONFIG COMPATIBILITY API
// Single module rule: callers use foundation/ConfigLoader.js only.
// ═══════════════════════════════════════════════════════════════

const configCompatibility = (() => {
const CONFIG_LOADER_MISSING = Symbol('CONFIG_LOADER_MISSING');
const CONFIG_LOADER_RUNTIME_PATHS = Object.freeze({
  'confidence.minTradeConfidence': 'confidence.minTradeConfidence',
  'confidence.maxConfidence': 'confidence.maxConfidence',
  'confidence.minStrategyConfidence': 'confidence.minStrategyConfidence',
  'positionSizing.basePositionSize': 'sizing.basePositionSize',
  'positionSizing.maxPositionSize': 'sizing.maxPositionSize',
  'positionSizing.maxPositions': 'sizing.maxPositions',
  'exits.stopLossPercent': 'exits.stopLossPercent',
  'exits.takeProfitPercent': 'exits.takeProfitPercent',
  'exits.trailingStopPercent': 'exits.trailingStopPercent',
  'exits.trailingActivation': 'exits.trailingActivation',
  'exits.maxHoldMinutes': 'exits.maxHoldMinutes',
  'exits.exitSystem': 'exits.exitSystem',
  'exits.profitTiers.tier1': 'tiers.tier1',
  'exits.profitTiers.tier2': 'tiers.tier2',
  'exits.profitTiers.tier3': 'tiers.tier3',
  'exits.profitTiers.final': 'tiers.final',
  'fees.model': 'fees.model',
  'fees.makerFee': 'fees.makerFee',
  'fees.takerFee': 'fees.takerFee',
  'fees.totalRoundTrip': 'fees.totalRoundTrip',
  'fees.perShare': 'fees.perShare',
  'fees.minOrderFee': 'fees.minOrderFee',
  'risk.guardMode': 'risk.guardMode',
  'risk.venueRailBuffer.enabled': 'risk.venueRailBuffer.enabled',
  'risk.venueRailBuffer.railDrawdownPercent': 'risk.venueRailBuffer.railDrawdownPercent',
  'risk.venueRailBuffer.triggerPercent': 'risk.venueRailBuffer.triggerPercent',
  'risk.venueRailBuffer.releaseOnSessionReset': 'risk.venueRailBuffer.releaseOnSessionReset',
  'risk.reconciliationReporter.enabled': 'risk.reconciliationReporter.enabled',
  'risk.reconciliationReporter.alertDeltaDollars': 'risk.reconciliationReporter.alertDeltaDollars',
  'risk.reconciliationReporter.alertDeltaPercent': 'risk.reconciliationReporter.alertDeltaPercent',
  'risk.sessionRiskResponse.enabled': 'risk.sessionRiskResponse.enabled',
  'risk.sessionRiskResponse.triggerPercent': 'risk.sessionRiskResponse.triggerPercent',
  'risk.sessionRiskResponse.action': 'risk.sessionRiskResponse.action',
  'risk.sessionRiskResponse.actionParams': 'risk.sessionRiskResponse.actionParams',
  'filters.atrEnabled': 'filters.atrEnabled',
  'filters.atrMinPercent': 'filters.atrMinPercent',
  'evalRules.enabled': 'evalRules.enabled',
  'evalRules.ttp.enabled': 'evalRules.ttp.enabled',
  'evalRules.ttp.volumeCap.enabled': 'evalRules.ttp.volumeCap.enabled',
  'evalRules.ttp.volumeCap.percent': 'evalRules.ttp.volumeCap.percent',
  'evalRules.ttp.volumeCap.timeframe': 'evalRules.ttp.volumeCap.timeframe',
  'evalRules.ttp.volumeCap.fallbackToMostRecentVolume': 'evalRules.ttp.volumeCap.fallbackToMostRecentVolume',
  'evalRules.ttp.volumeCap.maxReferenceAgeMs': 'evalRules.ttp.volumeCap.maxReferenceAgeMs',
  'evalRules.ttp.marketTime.enabled': 'evalRules.ttp.marketTime.enabled',
  'evalRules.ttp.marketTime.blockEntriesAfterCutoff': 'evalRules.ttp.marketTime.blockEntriesAfterCutoff',
  'evalRules.ttp.marketTime.liquidationEnabled': 'evalRules.ttp.marketTime.liquidationEnabled',
  'evalRules.ttp.marketTime.cutoffMinutesBeforeClose': 'evalRules.ttp.marketTime.cutoffMinutesBeforeClose',
  'evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff': 'evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff',
  'evalRules.ttp.accountLimits.enabled': 'evalRules.ttp.accountLimits.enabled',
  'evalRules.ttp.accountLimits.enforceDailyLossPause': 'evalRules.ttp.accountLimits.enforceDailyLossPause',
  'evalRules.ttp.accountLimits.enforceMaxLoss': 'evalRules.ttp.accountLimits.enforceMaxLoss',
  'evalRules.ttp.accountLimits.accountStartOfDayDate': 'evalRules.ttp.accountLimits.accountStartOfDayDate',
  'evalRules.ttp.accountLimits.accountStartOfDayEquity': 'evalRules.ttp.accountLimits.accountStartOfDayEquity',
  'evalRules.ttp.accountLimits.dailyLossDollars': 'evalRules.ttp.accountLimits.dailyLossDollars',
  'evalRules.ttp.accountLimits.maxLossThresholdEquity': 'evalRules.ttp.accountLimits.maxLossThresholdEquity',
  'evalRules.ttp.earningsRestriction.enabled': 'evalRules.ttp.earningsRestriction.enabled',
  'evalRules.ttp.earningsRestriction.blockEntries': 'evalRules.ttp.earningsRestriction.blockEntries',
  'evalRules.ttp.earningsRestriction.manualStatus': 'evalRules.ttp.earningsRestriction.manualStatus',
  'evalRules.ttp.consistency.enabled': 'evalRules.ttp.consistency.enabled',
  'evalRules.ttp.consistency.profitTargetDollars': 'evalRules.ttp.consistency.profitTargetDollars',
  'evalRules.ttp.consistency.maxPositionProfitRatio': 'evalRules.ttp.consistency.maxPositionProfitRatio',
  'evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio': 'evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio',
  'exitLogic.beScaleOut.enabled': 'exitLogic.beScaleOut.enabled',
  'exitLogic.beScaleOut.triggerType': 'exitLogic.beScaleOut.triggerType',
  'exitLogic.beScaleOut.fixedPercentTrigger': 'exitLogic.beScaleOut.fixedPercentTrigger',
  'exitLogic.beScaleOut.scaleOutFraction': 'exitLogic.beScaleOut.scaleOutFraction',
  'exitLogic.beScaleOut.feeBufferPercent': 'exitLogic.beScaleOut.feeBufferPercent',
  'exitLogic.tieredExit.enabled': 'exitLogic.tieredExit.enabled',
  'exitLogic.tieredExit.tier1ExitFraction': 'exitLogic.tieredExit.tier1ExitFraction',
  'exitLogic.tieredExit.tier2ExitFraction': 'exitLogic.tieredExit.tier2ExitFraction',
  'exitLogic.tieredExit.tier3ExitFraction': 'exitLogic.tieredExit.tier3ExitFraction',
  'exitLogic.tieredExit.enableMarketAdaptation': 'exitLogic.tieredExit.enableMarketAdaptation',
  'exitLogic.tieredExit.trendingTargetMultiplier': 'exitLogic.tieredExit.trendingTargetMultiplier',
  'exitLogic.tieredExit.rangingTargetMultiplier': 'exitLogic.tieredExit.rangingTargetMultiplier',
  'exitLogic.tieredExit.highConfidenceThreshold': 'exitLogic.tieredExit.highConfidenceThreshold',
  'exitLogic.tieredExit.highConfidenceMultiplier': 'exitLogic.tieredExit.highConfidenceMultiplier',
  'exitLogic.tieredExit.lowConfidenceThreshold': 'exitLogic.tieredExit.lowConfidenceThreshold',
  'exitLogic.tieredExit.lowConfidenceMultiplier': 'exitLogic.tieredExit.lowConfidenceMultiplier',
  'strategyBehavior.emaCrossover.entryEventsOnly': 'strategyBehavior.emaCrossover.entryEventsOnly',
  'strategyBehavior.emaCrossover.confirmBars': 'strategyBehavior.emaCrossover.confirmBars',
  'strategyBehavior.emaCrossover.warmupBars': 'strategyBehavior.emaCrossover.warmupBars',
  'strategyBehavior.trendRegimeGate.enabled': 'strategyBehavior.trendRegimeGate.enabled',
  'strategyBehavior.trendRegimeGate.minConfidence': 'strategyBehavior.trendRegimeGate.minConfidence',
  'strategyBehavior.trendRegimeGate.strategies': 'strategyBehavior.trendRegimeGate.strategies',
  'strategyBehavior.atrContracts.enabled': 'strategyBehavior.atrContracts.enabled',
  'strategyBehavior.atrContracts.stopMultiplier': 'strategyBehavior.atrContracts.stopMultiplier',
  'strategyBehavior.atrContracts.trailMultiplier': 'strategyBehavior.atrContracts.trailMultiplier',
  'strategyBehavior.atrContracts.trailingActivationR': 'strategyBehavior.atrContracts.trailingActivationR',
  'sessionRouter.mode': 'sessionRouter.mode',
  'sessionRouter.staticSession': 'sessionRouter.staticSession',
  'sessionRouter.cryptoSymbols': 'sessionRouter.cryptoSymbols',
  'sessionRouter.checkIntervalMs': 'sessionRouter.checkIntervalMs',
  'sessionRouter.forceCloseOnSessionEnd': 'sessionRouter.forceCloseOnSessionEnd',
  'sessionRouter.fast': 'sessionRouter.fast',
  'orchestrator.mtfTimeframes': 'orchestrator.mtfTimeframes',
  'orchestrator.mtfConfluenceService': 'orchestrator.mtfConfluenceService',
  'orchestrator.mtfConfluenceBooster': 'orchestrator.mtfConfluenceBooster',
  'orchestrator.strategyMtfConfluence': 'orchestrator.strategyMtfConfluence',
  'trail.atrMultiplier': 'trail.atrMultiplier',
  'trail.minActivation': 'trail.minActivation',
  'trail.trendWiden': 'trail.trendWiden',
  'trail.structureTighten': 'trail.structureTighten',
  'strategies.soloFilter': 'strategies.soloFilter',
  'strategies.enableRSI': 'strategies.enableRSI',
  'strategies.enableMADynamicSR': 'strategies.enableMADynamicSR',
  'strategies.enableEMACrossover': 'strategies.enableEMACrossover',
  'strategies.enableLiquiditySweep': 'strategies.enableLiquiditySweep',
  'strategies.enableCandlePattern': 'strategies.enableCandlePattern',
  'strategies.enableBreakRetest': 'strategies.enableBreakRetest',
  'strategies.enableMarketRegime': 'strategies.enableMarketRegime',
  'strategies.enableOGZTPO': 'strategies.enableOGZTPO',
  'strategies.enableORB': 'strategies.enableORB',
  'strategies.enableSmartMoneySweep': 'strategies.enableSmartMoneySweep',
  'strategies.enableNoWickImbalance': 'strategies.enableNoWickImbalance',
  'strategies.enableDonchianBreakout': 'strategies.enableDonchianBreakout',
  'strategies.enablePropSafeEMAPullback': 'strategies.enablePropSafeEMAPullback',
  'strategies.enableEMATrendRetest': 'strategies.enableEMATrendRetest',
  'strategies.enableRSI2MeanReversion': 'strategies.enableRSI2MeanReversion',
  'strategies.enableTimeSeriesMomentum': 'strategies.enableTimeSeriesMomentum',
  'strategies.OGZTPO': 'strategies.OGZTPO',
  'strategies.RSI': 'strategies.RSI',
  'strategies.NoWickImbalance': 'strategies.NoWickImbalance',
  'strategies.PropSafeEMAPullback': 'strategies.PropSafeEMAPullback',
  'strategies.EMATrendRetest': 'strategies.EMATrendRetest',
  'strategies.RSI2MeanReversion': 'strategies.RSI2MeanReversion',
  'strategies.TimeSeriesMomentum': 'strategies.TimeSeriesMomentum',
  'features.enableShorts': 'features.enableShorts',
  'pipeline.enableRSI': 'strategies.enableRSI',
  'pipeline.enableMADynamicSR': 'strategies.enableMADynamicSR',
  'pipeline.enableMASR': 'strategies.enableMADynamicSR',
  'pipeline.enableEMACrossover': 'strategies.enableEMACrossover',
  'pipeline.enableEMA': 'strategies.enableEMACrossover',
  'pipeline.enableLiquiditySweep': 'strategies.enableLiquiditySweep',
  'pipeline.enableCandlePattern': 'strategies.enableCandlePattern',
  'pipeline.enableBreakRetest': 'strategies.enableBreakRetest',
  'pipeline.enableMarketRegime': 'strategies.enableMarketRegime',
  'pipeline.enableOGZTPO': 'strategies.enableOGZTPO',
  'pipeline.enableTPO': 'strategies.enableOGZTPO',
  'pipeline.enableOpeningRangeBreakout': 'strategies.enableORB',
  'pipeline.enableSmartMoneySweep': 'strategies.enableSmartMoneySweep',
  'pipeline.enableNoWickImbalance': 'strategies.enableNoWickImbalance',
  'pipeline.enableDonchianBreakout': 'strategies.enableDonchianBreakout',
  'pipeline.enablePropSafeEMAPullback': 'strategies.enablePropSafeEMAPullback',
  'pipeline.enableEMATrendRetest': 'strategies.enableEMATrendRetest',
  'pipeline.enableRSI2MeanReversion': 'strategies.enableRSI2MeanReversion',
  'pipeline.enableTimeSeriesMomentum': 'strategies.enableTimeSeriesMomentum',
  'pipeline.directionFilter': 'pipeline.directionFilter',
  'pipeline.enableDashboard': 'strategies.enableDashboard',
  'startingBalance': 'backtest.initialBalance',
});

const LAUNCH_PROFILE_RUNTIME_PATHS = Object.freeze({
  'confidence.minTradeConfidence': 'confidence.minTradeConfidence',
  'risk.guardMode': 'risk.guardMode',
  'risk.venueRailBuffer.enabled': 'risk.venueRailBuffer.enabled',
  'risk.venueRailBuffer.railDrawdownPercent': 'risk.venueRailBuffer.railDrawdownPercent',
  'risk.venueRailBuffer.triggerPercent': 'risk.venueRailBuffer.triggerPercent',
  'risk.venueRailBuffer.releaseOnSessionReset': 'risk.venueRailBuffer.releaseOnSessionReset',
  'risk.reconciliationReporter.enabled': 'risk.reconciliationReporter.enabled',
  'risk.reconciliationReporter.alertDeltaDollars': 'risk.reconciliationReporter.alertDeltaDollars',
  'risk.reconciliationReporter.alertDeltaPercent': 'risk.reconciliationReporter.alertDeltaPercent',
  'risk.sessionRiskResponse.enabled': 'risk.sessionRiskResponse.enabled',
  'risk.sessionRiskResponse.triggerPercent': 'risk.sessionRiskResponse.triggerPercent',
  'risk.sessionRiskResponse.action': 'risk.sessionRiskResponse.action',
  'risk.sessionRiskResponse.actionParams': 'risk.sessionRiskResponse.actionParams',
  'evalRules.enabled': 'venueGuards.ttp.enabled',
  'evalRules.ttp.enabled': 'venueGuards.ttp.enabled',
  'evalRules.ttp.volumeCap.enabled': 'venueGuards.ttp.volumeCap.enabled',
  'evalRules.ttp.volumeCap.percent': 'venueGuards.ttp.volumeCap.percent',
  'evalRules.ttp.volumeCap.timeframe': 'venueGuards.ttp.volumeCap.timeframe',
  'evalRules.ttp.volumeCap.fallbackToMostRecentVolume': 'venueGuards.ttp.volumeCap.fallbackToMostRecentVolume',
  'evalRules.ttp.volumeCap.maxReferenceAgeMs': 'venueGuards.ttp.volumeCap.maxReferenceAgeMs',
  'evalRules.ttp.marketTime.enabled': 'venueGuards.ttp.marketTime.enabled',
  'evalRules.ttp.marketTime.blockEntriesAfterCutoff': 'venueGuards.ttp.marketTime.blockEntriesAfterCutoff',
  'evalRules.ttp.marketTime.liquidationEnabled': 'venueGuards.ttp.marketTime.liquidationEnabled',
  'evalRules.ttp.marketTime.cutoffMinutesBeforeClose': 'venueGuards.ttp.marketTime.cutoffMinutesBeforeClose',
  'evalRules.ttp.marketTime.entryBufferMinutesBeforeCutoff': 'venueGuards.ttp.marketTime.entryBufferMinutesBeforeCutoff',
  'evalRules.ttp.accountLimits.enabled': 'venueGuards.ttp.accountLimits.enabled',
  'evalRules.ttp.accountLimits.enforceDailyLossPause': 'venueGuards.ttp.accountLimits.enforceDailyLossPause',
  'evalRules.ttp.accountLimits.enforceMaxLoss': 'venueGuards.ttp.accountLimits.enforceMaxLoss',
  'evalRules.ttp.accountLimits.accountStartOfDayDate': 'venueGuards.ttp.accountLimits.accountStartOfDayDate',
  'evalRules.ttp.accountLimits.accountStartOfDayEquity': 'venueGuards.ttp.accountLimits.accountStartOfDayEquity',
  'evalRules.ttp.accountLimits.dailyLossDollars': 'venueGuards.ttp.accountLimits.dailyLossDollars',
  'evalRules.ttp.accountLimits.maxLossThresholdEquity': 'venueGuards.ttp.accountLimits.maxLossThresholdEquity',
  'evalRules.ttp.earningsRestriction.enabled': 'venueGuards.ttp.earningsRestriction.enabled',
  'evalRules.ttp.earningsRestriction.blockEntries': 'venueGuards.ttp.earningsRestriction.blockEntries',
  'evalRules.ttp.earningsRestriction.manualStatus': 'venueGuards.ttp.earningsRestriction.manualStatus',
  'evalRules.ttp.consistency.enabled': 'venueGuards.ttp.consistency.enabled',
  'evalRules.ttp.consistency.profitTargetDollars': 'venueGuards.ttp.consistency.profitTargetDollars',
  'evalRules.ttp.consistency.maxPositionProfitRatio': 'venueGuards.ttp.consistency.maxPositionProfitRatio',
  'evalRules.ttp.consistency.maxProfitTargetInitialBalanceRatio': 'venueGuards.ttp.consistency.maxProfitTargetInitialBalanceRatio',
  'strategies.soloFilter': 'strategies.soloFilter',
  'strategies.enableRSI': 'pipeline.enableRSI',
  'strategies.enableMADynamicSR': 'pipeline.enableMADynamicSR',
  'strategies.enableEMACrossover': 'pipeline.enableEMACrossover',
  'strategies.enableLiquiditySweep': 'pipeline.enableLiquiditySweep',
  'strategies.enableCandlePattern': 'pipeline.enableCandlePattern',
  'strategies.enableBreakRetest': 'pipeline.enableBreakRetest',
  'strategies.enableMarketRegime': 'pipeline.enableMarketRegime',
  'strategies.enableOGZTPO': 'pipeline.enableOGZTPO',
  'strategies.enableORB': 'pipeline.enableOpeningRangeBreakout',
  'strategies.enableSmartMoneySweep': 'pipeline.enableSmartMoneySweep',
  'strategies.enableNoWickImbalance': 'pipeline.enableNoWickImbalance',
  'strategies.enableDonchianBreakout': 'pipeline.enableDonchianBreakout',
  'strategies.enablePropSafeEMAPullback': 'pipeline.enablePropSafeEMAPullback',
  'strategies.enableEMATrendRetest': 'pipeline.enableEMATrendRetest',
  'strategies.enableRSI2MeanReversion': 'pipeline.enableRSI2MeanReversion',
  'strategies.enableTimeSeriesMomentum': 'pipeline.enableTimeSeriesMomentum',
  'features.enableShorts': 'features.enableShorts',
  'pipeline.directionFilter': 'pipeline.directionFilter',
  'strategyBehavior.emaCrossover.entryEventsOnly': 'strategyBehavior.emaCrossover.entryEventsOnly',
  'strategyBehavior.emaCrossover.confirmBars': 'strategyBehavior.emaCrossover.confirmBars',
  'strategyBehavior.emaCrossover.warmupBars': 'strategyBehavior.emaCrossover.warmupBars',
  'sessionRouter.mode': 'sessionRouter.mode',
  'sessionRouter.staticSession': 'sessionRouter.staticSession',
  'sessionRouter.cryptoSymbols': 'sessionRouter.cryptoSymbols',
  'sessionRouter.checkIntervalMs': 'sessionRouter.checkIntervalMs',
  'sessionRouter.forceCloseOnSessionEnd': 'sessionRouter.forceCloseOnSessionEnd',
  'sessionRouter.fast': 'sessionRouter.fast',
  'orchestrator.mtfConfluenceService': 'confluence.mtfService',
  'orchestrator.mtfConfluenceBooster': 'confluence.mtfBooster',
  'orchestrator.strategyMtfConfluence': 'confluence.strategyMtf',
});

function readObjectPath(root, path) {
  const parts = path.split('.');
  let value = root;
  for (const part of parts) {
    if (value === undefined || value === null) return undefined;
    value = value[part];
  }
  return value;
}

function applyActiveChildOverrides(path, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const prefix = `${path}.`;
  const childEntries = Object.entries(activeOverrides)
    .filter(([overridePath]) => overridePath.startsWith(prefix));
  if (childEntries.length === 0) {
    return value;
  }

  const clone = cloneConfiguredObject(value);
  for (const [overridePath, overrideValue] of childEntries) {
    const relativeParts = overridePath.slice(prefix.length).split('.');
    let cursor = clone;
    for (let i = 0; i < relativeParts.length - 1; i += 1) {
      const part = relativeParts[i];
      if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    cursor[relativeParts[relativeParts.length - 1]] = overrideValue;
  }
  return clone;
}

function readLaunchProfileRuntimeValue(loaderPath) {
  const launchPath = LAUNCH_PROFILE_RUNTIME_PATHS[loaderPath];
  if (!launchPath) return CONFIG_LOADER_MISSING;
  const context = activeLaunchProfileContext || resolveLaunchProfile(process.env);
  const value = readConfiguredPath(context.profile, launchPath);
  if (value === undefined) {
    throw new Error(`[ConfigLoader] config/trading.config.json launchProfiles.${context.profileName}.${launchPath} is required`);
  }
  if (value && typeof value === 'object') return cloneConfiguredObject(value);
  return value;
}

function readConfigLoaderRuntimeValue(path) {
  const loaderPath = CONFIG_LOADER_RUNTIME_PATHS[path];
  if (!loaderPath) return CONFIG_LOADER_MISSING;

  const loaded = _cached;
  if (loaded && loaded.config) {
    const value = readObjectPath(loaded.config, loaderPath);
    if (value !== undefined) return value;
  }

  if (path === 'strategies.RSI') {
    const value = readObjectPath(tradingConfigFile, loaderPath);
    if (value !== undefined) return cloneConfiguredObject(value);
  }

  return readLaunchProfileRuntimeValue(loaderPath);
}

function warnBaseConfigCompatibilityFallback(path) {
  if (!path || baseConfigFallbackWarnedPaths.has(path)) return;
  baseConfigFallbackWarnedPaths.add(path);
  console.warn(
    `[ConfigLoader] Compatibility BASE_CONFIG fallback used for '${path}'. ` +
    'Migrate this caller to ConfigLoader-owned snapshot paths or retire it in the config compatibility cleanup slice.'
  );
}

function hasConfigLoaderSnapshot() {
  return _cached !== null;
}

const BACKTEST_CONFIG_LOADER_OVERRIDE_PATHS = Object.freeze(new Set([
  'confidence.minTradeConfidence',
]));

function assertConfigLoaderOwnedPathsNotOverridden(flatOverrides, source, options = {}) {
  if (!hasConfigLoaderSnapshot()) return;
  const ownedPaths = Object.keys(flatOverrides)
    .filter(path => Object.prototype.hasOwnProperty.call(CONFIG_LOADER_RUNTIME_PATHS, path))
    .filter(path => !(
      source === 'applyBacktestConfigOverrides' &&
      isValidatedBacktestOverrideContext(options) &&
      BACKTEST_CONFIG_LOADER_OVERRIDE_PATHS.has(path)
    ));

  if (ownedPaths.length === 0) return;

  throw new Error(
    `[ConfigLoader] ${source} attempted to override ConfigLoader-owned path(s) after config load: ` +
    `${ownedPaths.sort().join(', ')}`
  );
}

function setObjectPath(root, path, value) {
  const parts = path.split('.');
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const existing = current[part];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[part] = {};
    } else if (Object.isFrozen(existing) || Object.getPrototypeOf(existing) !== Object.prototype) {
      current[part] = { ...existing };
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function applyConfigLoaderSectionValues(section, result) {
  for (const tradingPath of Object.keys(CONFIG_LOADER_RUNTIME_PATHS)) {
    if (!tradingPath.startsWith(`${section}.`)) continue;
    const value = readConfigLoaderRuntimeValue(tradingPath);
    if (value === CONFIG_LOADER_MISSING) continue;
    setObjectPath(result, tradingPath.slice(section.length + 1), value);
  }
}

function envSourceValue(key) {
  const direct = process.env[key];
  if (direct !== undefined && direct !== '') return direct;
  return undefined;
}

// Helper to parse env vars with fallback
const env = (key, fallback) => {
  const val = envSourceValue(key);
  if (val === undefined) return fallback;
  const num = parseFloat(val);
  return isNaN(num) ? val : num;
};

// FIX 28: Strict numeric env reader — returns Number, throws on non-numeric.
// Used by Fix 20 (DTS/UPM/DLL env-read centralization) to surface bad config
// loudly rather than silently coerce strings/NaN through to risk math.
// NOTE: module.exports attachment for this function is in a separate str_replace
// pair below — must be attached AFTER the module.exports = ConfigLoader line
// at ~1130, otherwise the late reassignment wipes the attachment.
const envNumber = (key, fallback) => {
  const val = envSourceValue(key);
  if (val === undefined) return fallback;
  const num = Number(val);
  if (!Number.isFinite(num)) {
    throw new Error(`[FIX-28] envNumber: ${key}="${val}" is not a finite number`);
  }
  return num;
};

const envBool = (key, fallback) => {
  const val = envSourceValue(key);
  if (val === undefined) return fallback;
  return val === 'true' || val === '1';
};

function requiredConfigNumber(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (!Number.isFinite(value)) {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} must be a finite number`);
  }
  return value;
}

function requiredConfigBool(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (typeof value !== 'boolean') {
    throw new Error(`[ConfigLoader] config/trading.config.json ${configPath} must be a boolean`);
  }
  return value;
}

function configValue(configPath, fallback = undefined) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  return value === undefined ? fallback : value;
}

const PROFILE_FORBIDDEN_ENV_KEYS = Object.freeze([
  'PROFILE',
  'EXECUTION_MODE',
  'CANDLE_SOURCE',
  'BACKTEST_MODE',
  'TEST_MODE',
  'BACKTEST_NO_PATTERN_SAVE',
  'PAPER_TRADING',
  'NODE_ENV',
  'STOP_LOSS_PERCENT',
  'TAKE_PROFIT_PERCENT',
  'TRAILING_STOP_PERCENT',
  'TRAILING_ACTIVATION',
]);

const PROFILE_ENV_CONFIG_PATHS = Object.freeze({
  INITIAL_BALANCE: Object.freeze(['startingBalance']),
  ENABLE_DYNAMIC_SIZING: Object.freeze(['features.enableDynamicSizing']),
  BASE_POSITION_SIZE: Object.freeze(['positionSizing.basePositionSize']),
  MAX_POSITION_SIZE_PCT: Object.freeze(['positionSizing.maxPositionSize']),
  BASE_POSITION_PCT: Object.freeze(['entryLogic.sizing.basePositionPercent']),
  MAX_POSITION_PCT: Object.freeze(['entryLogic.sizing.maxPositionPercent']),
  ABSOLUTE_POSITION_CAP: Object.freeze(['entryLogic.sizing.absoluteCapPercent']),
  ENTRY_STOCK_SHARE_RANGE_ENABLED: Object.freeze(['entryLogic.sizing.stockShareRange.enabled']),
  ENTRY_MIN_STOCK_SHARES: Object.freeze(['entryLogic.sizing.stockShareRange.minShares']),
  ENTRY_MAX_STOCK_SHARES: Object.freeze(['entryLogic.sizing.stockShareRange.maxShares']),
  ENTRY_MAX_STOCK_NOTIONAL: Object.freeze(['entryLogic.sizing.stockShareRange.maxNotionalUsd']),
  ENTRY_CONSISTENCY_CAP_BUFFER: Object.freeze(['entryLogic.sizing.stockShareRange.consistencyCapBuffer']),
  ENTRY_DAILY_LOSS_RISK_FRACTION: Object.freeze(['entryLogic.sizing.stockShareRange.dailyLossRiskFraction']),
  TIER1_TARGET: Object.freeze(['exits.profitTiers.tier1']),
  TIER2_TARGET: Object.freeze(['exits.profitTiers.tier2']),
  TIER3_TARGET: Object.freeze(['exits.profitTiers.tier3']),
  FINAL_TARGET: Object.freeze(['exits.profitTiers.final']),
  TIER1_EXIT_FRACTION: Object.freeze(['exitLogic.tieredExit.tier1ExitFraction']),
  TIER2_EXIT_FRACTION: Object.freeze(['exitLogic.tieredExit.tier2ExitFraction']),
  TIER3_EXIT_FRACTION: Object.freeze(['exitLogic.tieredExit.tier3ExitFraction']),
  ATR_FILTER_ENABLED: Object.freeze(['filters.atrEnabled']),
  ATR_MIN_PERCENT: Object.freeze(['filters.atrMinPercent']),
  EXIT_SYSTEM: Object.freeze(['exits.exitSystem']),
  FEE_MODEL: Object.freeze(['fees.model']),
  FEE_MAKER: Object.freeze(['fees.makerFee']),
  FEE_TAKER: Object.freeze(['fees.takerFee']),
  FEE_TOTAL_ROUNDTRIP: Object.freeze(['fees.totalRoundTrip']),
  FEE_SAFETY_BUFFER: Object.freeze(['fees.safetyBuffer']),
  FEE_SLIPPAGE: Object.freeze(['fees.slippage']),
  FEE_PER_SHARE: Object.freeze(['fees.perShare']),
  FEE_MIN_ORDER: Object.freeze(['fees.minOrderFee']),
  MTF_TIMEFRAMES: Object.freeze(['orchestrator.mtfTimeframes']),
  ORCH_MIN_CANDLES_EMA: Object.freeze(['orchestrator.minCandlesEMA']),
  TREND_REGIME_GATE_ENABLED: Object.freeze(['strategyBehavior.trendRegimeGate.enabled']),
  TREND_REGIME_GATE_MIN_CONFIDENCE: Object.freeze(['strategyBehavior.trendRegimeGate.minConfidence']),
  ATR_CONTRACTS_ENABLED: Object.freeze(['strategyBehavior.atrContracts.enabled']),
  ATR_STOP_MULTIPLIER: Object.freeze(['strategyBehavior.atrContracts.stopMultiplier']),
  ATR_TRAIL_MULTIPLIER: Object.freeze(['strategyBehavior.atrContracts.trailMultiplier']),
  ATR_TRAILING_ACTIVATION_R: Object.freeze(['strategyBehavior.atrContracts.trailingActivationR']),
  BE_SCALEOUT_ENABLED: Object.freeze(['exitLogic.beScaleOut.enabled']),
  BE_SCALEOUT_FRACTION: Object.freeze(['exitLogic.beScaleOut.scaleOutFraction']),
  TIERED_EXIT_ENABLED: Object.freeze(['exitLogic.tieredExit.enabled']),
});

const PROFILE_BOOLEAN_ENV_KEYS = Object.freeze(new Set([
  'ENABLE_DYNAMIC_SIZING',
  'ENTRY_STOCK_SHARE_RANGE_ENABLED',
  'ATR_FILTER_ENABLED',
  'TREND_REGIME_GATE_ENABLED',
  'ATR_CONTRACTS_ENABLED',
  'BE_SCALEOUT_ENABLED',
  'TIERED_EXIT_ENABLED',
]));

const PROFILE_STRING_ENV_KEYS = Object.freeze(new Set([
  'EXIT_SYSTEM',
  'FEE_MODEL',
]));

const PROFILE_LIST_ENV_KEYS = Object.freeze(new Set([
  'MTF_TIMEFRAMES',
]));

const PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS = Object.freeze(new Set([
  'INITIAL_BALANCE',
  'EXIT_SYSTEM',
]));

const PROFILE_SNAPSHOT_MISSING = Symbol('profile_snapshot_missing');

function assertProfileEnvIsHonest(profile) {
  const forbidden = PROFILE_FORBIDDEN_ENV_KEYS.filter(key => (
    Object.prototype.hasOwnProperty.call(profile.env || {}, key)
  ));
  if (forbidden.length > 0) {
    throw new Error(
      `Tuning profile '${profile.name}' includes non-profile env key(s): ${forbidden.join(', ')}. ` +
      'Runtime mode, pattern-write protection, and locked strategy exit contracts must stay owned by their dedicated layers.'
    );
  }

  const unmapped = Object.keys(profile.env || {}).filter(key => !PROFILE_ENV_CONFIG_PATHS[key]);
  if (unmapped.length > 0) {
    throw new Error(
      `Tuning profile '${profile.name}' includes unmapped config key(s): ${unmapped.join(', ')}. ` +
      'Add an explicit PROFILE_ENV_CONFIG_PATHS mapping before the profile can own the value.'
    );
  }
}

function freezeTuningProfile(profile) {
  assertProfileEnvIsHonest(profile);
  return Object.freeze({
    ...profile,
    evidence: Object.freeze([...(profile.evidence || [])]),
    env: Object.freeze({ ...profile.env }),
  });
}

function buildTuningProfilesConfig() {
  const tuningProfiles = tradingConfigFile.tuningProfiles;
  if (!tuningProfiles || typeof tuningProfiles !== 'object' || Array.isArray(tuningProfiles)) {
    throw new Error('[ConfigLoader] config/trading.config.json must define tuningProfiles');
  }

  const { defaultProfile, definitions } = tuningProfiles;
  if (typeof defaultProfile !== 'string' || defaultProfile.trim() === '') {
    throw new Error('[ConfigLoader] tuningProfiles.defaultProfile must be a non-empty string');
  }
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw new Error('[ConfigLoader] tuningProfiles.definitions must be an object');
  }
  if (!Object.prototype.hasOwnProperty.call(definitions, defaultProfile)) {
    throw new Error(`[ConfigLoader] tuningProfiles.defaultProfile '${defaultProfile}' is missing from definitions`);
  }

  const frozenDefinitions = {};
  for (const [profileName, profile] of Object.entries(definitions)) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error(`[ConfigLoader] tuningProfiles.definitions.${profileName} must be an object`);
    }
    if (profile.name !== profileName) {
      throw new Error(`[ConfigLoader] tuning profile key '${profileName}' must match profile.name '${profile.name}'`);
    }
    frozenDefinitions[profileName] = freezeTuningProfile(profile);
  }

  return Object.freeze({
    defaultProfile,
    definitions: Object.freeze(frozenDefinitions),
  });
}

const FEE_PROFILE_ENV_KEYS = Object.freeze(new Set([
  'FEE_MODEL',
  'FEE_MAKER',
  'FEE_TAKER',
  'FEE_TOTAL_ROUNDTRIP',
  'FEE_SAFETY_BUFFER',
  'FEE_SLIPPAGE',
  'FEE_PER_SHARE',
  'FEE_MIN_ORDER',
]));

function freezeFeeProfile(profile, profileName) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`[ConfigLoader] feeProfiles.definitions.${profileName} must be an object`);
  }
  if (profile.name !== profileName) {
    throw new Error(`[ConfigLoader] fee profile key '${profileName}' must match profile.name '${profile.name}'`);
  }
  if (typeof profile.description !== 'string' || profile.description.trim() === '') {
    throw new Error(`[ConfigLoader] feeProfiles.definitions.${profileName}.description must be a non-empty string`);
  }
  if (!profile.env || typeof profile.env !== 'object' || Array.isArray(profile.env)) {
    throw new Error(`[ConfigLoader] feeProfiles.definitions.${profileName}.env must be an object`);
  }
  const unknownKeys = Object.keys(profile.env).filter(key => !FEE_PROFILE_ENV_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`[ConfigLoader] feeProfiles.definitions.${profileName}.env has non-fee key(s): ${unknownKeys.join(', ')}`);
  }
  return Object.freeze({
    ...profile,
    env: Object.freeze({ ...profile.env }),
  });
}

function buildFeeProfilesConfig() {
  const feeProfiles = tradingConfigFile.feeProfiles;
  if (!feeProfiles || typeof feeProfiles !== 'object' || Array.isArray(feeProfiles)) {
    throw new Error('[ConfigLoader] config/trading.config.json must define feeProfiles');
  }
  const { definitions } = feeProfiles;
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw new Error('[ConfigLoader] feeProfiles.definitions must be an object');
  }
  const frozenDefinitions = {};
  for (const [profileName, profile] of Object.entries(definitions)) {
    frozenDefinitions[profileName] = freezeFeeProfile(profile, profileName);
  }
  return Object.freeze({
    definitions: Object.freeze(frozenDefinitions),
  });
}

function freezeStringMap(values) {
  return Object.freeze({ ...values });
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreezePlain(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreezePlain(child);
  }
  return value;
}

function buildRuntimeProfilesConfig() {
  const profiles = tradingConfigFile.profiles;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    throw new Error('[ConfigLoader] config/trading.config.json must define profiles');
  }

  for (const [profileName, profile] of Object.entries(profiles)) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error(`[ConfigLoader] profiles.${profileName} must be an object`);
    }

    const requiredKeys = ['minConfidence', 'maxPositionSize', 'riskPercent', 'maxHoldMinutes'];
    const missing = requiredKeys.filter(key => !Number.isFinite(Number(profile[key])));
    if (missing.length > 0) {
      throw new Error(`[ConfigLoader] profiles.${profileName} has invalid numeric key(s): ${missing.join(', ')}`);
    }
  }

  return deepFreezePlain(clonePlain(profiles));
}

function sameConfigValue(left, right) {
  return Object.is(left, right);
}

function getConfigFileValue(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), tradingConfigFile);
  if (value === undefined) return undefined;
  return deepFreezePlain(clonePlain(value));
}

// =============================================================================
// BASE CONFIGURATION - Read from .env with sensible defaults
// =============================================================================

const BASE_CONFIG = {
  authFailureGuard: deepFreezePlain(clonePlain(tradingConfigFile.authFailureGuard)),
  trai: deepFreezePlain(clonePlain(tradingConfigFile.trai)),

  // =========================================================================
  // CONFIDENCE THRESHOLDS
  // =========================================================================
  confidence: {
    minTradeConfidence: requiredConfigNumber('confidence.minTradeConfidence'),
    maxConfidence: env('MAX_CONFIDENCE', requiredConfigNumber('confidence.maxConfidence')),
    minStrategyConfidence: env('MIN_STRATEGY_CONFIDENCE', requiredConfigNumber('confidence.minStrategyConfidence')),
    candlePatternMinConfidence: env('CANDLE_PATTERN_MIN_CONFIDENCE', requiredConfigNumber('confidence.candlePatternMinConfidence')),
    regimeMinConfidence: env('REGIME_MIN_CONFIDENCE', requiredConfigNumber('confidence.regimeMinConfidence')),
    confluenceMinScore: env('CONFLUENCE_MIN_SCORE', requiredConfigNumber('confidence.confluenceMinScore')),
  },

  // =========================================================================
  // RISK MANAGEMENT
  // =========================================================================
  risk: {
    maxRiskPerTrade: env('MAX_RISK_PER_TRADE', 0.02),           // 2% max risk per trade
    counterTrendReduction: 0.30,                                  // 30% reduction against trend
    lowConfidenceReduction: 0.25,                                 // 25% reduction on weak signals
    highConfidenceBoost: 1.30,                                    // 1.3x on strong signals
  },

  // =========================================================================
  // PATTERN MEMORY
  // =========================================================================
  patternMemory: {
    minSamples: 10,
    successThreshold: 0.65,
    failureThreshold: 0.35,
    maxAgeDays: 90,
    decayHalflifeDays: 30,
    maxPatterns: 10000,
    dtwThreshold: 0.62,
    featureWeights: Object.freeze([
      0.25,
      0.15,
      0.15,
      0.10,
      0.05,
      0.05,
      0.15,
      0.05,
      0.05,
    ]),
    persistToDisk: true,
    saveIntervalMs: 300000,
    bank: Object.freeze({
      minTradesSample: 10,
      successThreshold: 0.65,
      failureThreshold: 0.35,
      maxPatternAgeMs: 7776000000,
      promoteMinSamples: 30,
      quarantineMinSamples: 15,
      promoteMinWinRate: 0.55,
      promoteMinAvgR: 0.15,
      quarantineMaxWinRate: 0.45,
      maxPatterns: 10000,
    }),
  },

  // =========================================================================
  // POSITION SIZING
  // =========================================================================
  positionSizing: {
    basePositionSize: env('BASE_POSITION_SIZE', 0.01),           // 1% base position
    maxPositionSize: env('MAX_POSITION_SIZE_PCT', 0.05),         // 5% max position
    maxPositions: env('MAX_POSITIONS', 3),                        // Max concurrent positions

    // Volatility-based scaling
    lowVolMultiplier: env('LOW_VOL_MULTIPLIER', 1.5),            // 1.5x in calm markets
    highVolMultiplier: env('HIGH_VOL_MULTIPLIER', 0.6),          // 0.6x in choppy markets
    lowVolThreshold: env('LOW_VOL_THRESHOLD', 0.015),            // 1.5% = low volatility
    highVolThreshold: env('HIGH_VOL_THRESHOLD', 0.035),          // 3.5% = high volatility

    // Confidence-scaled sizing (from engine tuning)
    confidenceSizeMin: 0.5,                                       // 50% base at low confidence
    confidenceSizeMax: 2.5,                                       // 250% base at high confidence
    confidenceSizeSlope: 4.0,                                     // scaling factor

    // Confluence multipliers
    confluenceMultipliers: {
      1: 1.0,   // 1 strategy = base size
      2: 1.5,   // 2 strategies agree = 1.5x
      3: 2.0,   // 3 strategies agree = 2x
      4: 2.5,   // 4+ strategies = capped at 2.5x
    },
  },

  // =========================================================================
  // REGIME-BASED STRATEGY BOOSTING (for matrix sweep optimization)
  // =========================================================================
  // FIX 2026-04-05: Multipliers applied during confidence evaluation
  // Trend strategies boosted in trending markets, suppressed in ranging
  // IMPORTANT 2026-04-16: Multipliers MUTATE result.confidence in-place
  // (StrategyOrchestrator.js:772). This affects winner selection AND
  // the MIN_TRADE_CONFIDENCE gate — not only position sizing.
  // A strategy whose raw confidence is below threshold can pass the gate
  // after regime boost. A raw-higher strategy can lose winner selection
  // to a raw-lower strategy with more favorable regime boost.
  regimeBoosts: {
    trending: {
      EMASMACrossover: env('REGIME_TREND_EMA', 1.15),
      MADynamicSR: env('REGIME_TREND_MASR', 1.15),
      RSI: env('REGIME_TREND_RSI', 0.85),
      LiquiditySweep: env('REGIME_TREND_SWEEP', 1.00),
      SmartMoneySweep: env('REGIME_TREND_SMS', 1.00),
    },
    ranging: {
      EMASMACrossover: env('REGIME_RANGE_EMA', 0.85),
      MADynamicSR: env('REGIME_RANGE_MASR', 0.85),
      RSI: env('REGIME_RANGE_RSI', 1.15),
      LiquiditySweep: env('REGIME_RANGE_SWEEP', 1.00),
      SmartMoneySweep: env('REGIME_RANGE_SMS', 1.10),
    },
    volatile: {
      EMASMACrossover: env('REGIME_VOL_EMA', 0.70),
      MADynamicSR: env('REGIME_VOL_MASR', 0.70),
      RSI: env('REGIME_VOL_RSI', 1.10),
      LiquiditySweep: env('REGIME_VOL_SWEEP', 1.20),
      SmartMoneySweep: env('REGIME_VOL_SMS', 1.15),
      _positionSizeMultiplier: env('REGIME_VOL_POS_MULT', 0.60),
    },
    dead: {
      EMASMACrossover: env('REGIME_DEAD_EMA', 0.60),
      MADynamicSR: env('REGIME_DEAD_MASR', 0.70),
      RSI: env('REGIME_DEAD_RSI', 0.70),
      LiquiditySweep: env('REGIME_DEAD_SWEEP', 0.50),
      SmartMoneySweep: env('REGIME_DEAD_SMS', 0.50),
      _positionSizeMultiplier: env('REGIME_DEAD_POS_MULT', 0.50),
    },
    unknown: {},
  },

  // VOLUME PROFILE BOOSTS (Auction Market Theory - Fabio Valentino)
  // =========================================================================
  // FIX 2026-04-05: Multipliers based on price position relative to VP levels
  // aboveVAH = breakout zone (boost trend), atPOC = mean reversion zone, inLVN = unpredictable
  volumeProfileBoosts: {
    aboveVAH: {  // Price broke above Value Area High = bullish breakout
      EMASMACrossover: env('VP_ABOVE_VAH_EMA', 1.20),
      MADynamicSR: env('VP_ABOVE_VAH_MASR', 1.20),
      RSI: env('VP_ABOVE_VAH_RSI', 0.80),
      LiquiditySweep: env('VP_ABOVE_VAH_SWEEP', 1.10),
      SmartMoneySweep: env('VP_ABOVE_VAH_SMS', 1.10),
    },
    belowVAL: {  // Price broke below Value Area Low = bearish breakdown
      EMASMACrossover: env('VP_BELOW_VAL_EMA', 1.20),
      MADynamicSR: env('VP_BELOW_VAL_MASR', 1.20),
      RSI: env('VP_BELOW_VAL_RSI', 0.80),
      LiquiditySweep: env('VP_BELOW_VAL_SWEEP', 1.10),
      SmartMoneySweep: env('VP_BELOW_VAL_SMS', 1.10),
    },
    atPOC: {  // Price at Point of Control = mean reversion zone
      EMASMACrossover: env('VP_AT_POC_EMA', 0.85),
      MADynamicSR: env('VP_AT_POC_MASR', 0.85),
      RSI: env('VP_AT_POC_RSI', 1.25),
      LiquiditySweep: env('VP_AT_POC_SWEEP', 0.90),
      SmartMoneySweep: env('VP_AT_POC_SMS', 0.90),
    },
    inLVN: {  // Price in Low Volume Node = unpredictable air pocket
      _allStrategies: env('VP_IN_LVN_ALL', 0.90),
    },
    inValueArea: {  // Inside VA but not at POC = neutral/slight mean reversion
      EMASMACrossover: env('VP_IN_VA_EMA', 0.95),
      MADynamicSR: env('VP_IN_VA_MASR', 0.95),
      RSI: env('VP_IN_VA_RSI', 1.10),
      LiquiditySweep: env('VP_IN_VA_SWEEP', 1.00),
      SmartMoneySweep: env('VP_IN_VA_SMS', 1.00),
    },
  },

  // PID CONTROLLER — Adaptive Parameter Optimization
  // =========================================================================
  // FIX 2026-04-05: Meta-controller that self-tunes system parameters
  // Runs every N trades, adjusts position size, regime boosts, trailing stops
  // All Kp/Ki/Kd gains sweepable via matrix for optimal feedback response
  pid: {
    enabled: env('PID_ENABLED', true),
    updateInterval: env('PID_UPDATE_INTERVAL', 10),      // Run every N trades
    warmupTrades: env('PID_WARMUP_TRADES', 50),          // Min trades before active
    windowSize: env('PID_WINDOW_SIZE', 20),              // Rolling trade window

    // Loop 1: Position Sizing - equity slope -> size multiplier
    positionKp: env('PID_POSITION_KP', 0.30),            // Proportional gain
    positionKi: env('PID_POSITION_KI', 0.05),            // Integral gain
    positionKd: env('PID_POSITION_KD', 0.10),            // Derivative gain
    targetEquitySlope: env('PID_TARGET_SLOPE', 0.005),   // Target equity curve slope

    // Loop 2: Regime Boost Adaptation - per-strategy P&L -> boost adjustment
    regimeKp: env('PID_REGIME_KP', 0.02),
    regimeKi: env('PID_REGIME_KI', 0.005),
    regimeKd: env('PID_REGIME_KD', 0.01),

    // Loop 3: Trailing Stop Adaptation - MFE capture -> ATR multiplier
    trailKp: env('PID_TRAIL_KP', 0.15),
    trailKi: env('PID_TRAIL_KI', 0.03),
    trailKd: env('PID_TRAIL_KD', 0.05),
    targetMFERatio: env('PID_TARGET_MFE', 0.60),         // Target: capture 60% of max profit
  },

  // =========================================================================
  // STOP LOSS / TAKE PROFIT - Defaults (strategies override via EXIT_CONTRACTS)
  // =========================================================================
  // NOTE: All percentages in PERCENT form (1.5 = 1.5%, not 0.015)
  // This matches .env and ExitContractManager convention
  // LOCKED 2026-03-20: Validated across 7/8 tickers with zero retuning
  exits: {
    stopLossPercent: env('STOP_LOSS_PERCENT', 0.8),              // 0.8% default SL - VALIDATED
    takeProfitPercent: env('TAKE_PROFIT_PERCENT', 1.0),          // 1.0% default TP - VALIDATED
    trailingStopPercent: env('TRAILING_STOP_PERCENT', 0.6),      // 0.6% trailing - tight exits work
    trailingActivation: env('TRAILING_ACTIVATION', 0.8),         // 0.8% profit before trailing kicks in
    exitSystem: env('EXIT_SYSTEM', 'maxprofit'),

    // Breakeven system (percent form)
    breakevenTrigger: env('BREAKEVEN_TRIGGER', 0.5),             // 0.5% profit triggers BE
    breakevenExitPercent: env('BREAKEVEN_EXIT_PERCENT', 50),     // 50% position exits at BE
    postBreakevenTrail: env('POST_BREAKEVEN_TRAIL', 5.0),        // 5% trail after BE withdrawal
    profitProtectionLevel: env('PROFIT_PROTECTION', 1.5),        // 1.5% min profit to lock in

    // Tiered profit targets (for ProfitExitPlanner)
    // FIX 2026-03-16: All tiers must clear 0.65% round-trip fees
    profitTiers: {
      tier1: env('TIER1_TARGET', 0.015),                         // 1.5% first tier (was 0.7% - below fees!)
      tier2: env('TIER2_TARGET', 0.020),                         // 2.0% second tier
      tier3: env('TIER3_TARGET', 0.030),                         // 3.0% third tier
      final: env('FINAL_TARGET', 0.050),                         // 5.0% final target
    },

    // Trail distances
    normalTrailDistance: env('TRAIL_DISTANCE', 0.025),           // 2.5% normal trail
    tightTrailDistance: env('TIGHT_TRAIL_DISTANCE', 0.015),      // 1.5% tight trail

    // FIX 2026-03-19: Extracted from ExitContractManager hardcodes
    // Volatility-based stop widening
    volatilityThreshold: env('EXIT_VOL_THRESHOLD', 5.0),         // ATR > 5% triggers widening
    volatilitySlMultiplier: env('EXIT_VOL_SL_MULT', 1.15),       // Widen SL by 15% in high vol
    volatilityTpMultiplier: env('EXIT_VOL_TP_MULT', 1.20),       // Widen TP by 20% in high vol
  },

  // =========================================================================
  // STRATEGY-SPECIFIC EXIT CONTRACTS
  // =========================================================================
  // FIX 2026-03-16: Load validated production config from tuning-summary.json (March 3rd)
  // All strategies: SL -2.0%, TP 2.5%
  exitContracts: {
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  EMASMACrossover - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION   ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train (Year 1+2): +$738, Test (Year 2): +$275                            ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    EMASMACrossover: {
      stopLossPercent: -0.5,          // LOCKED - validated SL
      takeProfitPercent: 1.0,         // LOCKED - validated TP
      trailingStopPercent: 0.8,
      trailingActivation: 1.0,
      maxHoldTimeMinutes: 300,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['ema_cross_reversal'],
      _validated: '2026-03-20',
    },
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  LiquiditySweep - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION    ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train: +$221, Test: +$72 (uses structural exits, ignores SL/TP)         ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    LiquiditySweep: {
      stopLossPercent: -2.0,          // Fallback only - sweep uses structural exits
      takeProfitPercent: 2.5,         // Fallback only - sweep uses structural exits
      trailingStopPercent: 0.5,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 180,
      useStructuralExits: true,       // LOCKED - uses sweep-specific exit logic
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['liquidity_absorbed'],
      _validated: '2026-03-20',
    },
    BreakRetest: {
      stopLossPercent: -2.0,          // Fallback only - strategy provides structural overrideLevels
      takeProfitPercent: 2.5,         // Fallback only - strategy provides structural overrideLevels
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: true,
      minConfidence: null,
      atrMinPercent: null,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      invalidationConditions: ['break_retest_invalidated'],
      _validated: null,
    },
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  RSI - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION               ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train (Year 1): +$334, 223 trades, 56.5% WR                              ║
    // ║  Test (Year 2):  +$282, 119 trades, 58.8% WR                              ║
    // ║  CHANGING THESE VALUES WILL BREAK THE VALIDATED EDGE                      ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    RSI: {
      stopLossPercent: -0.8,    // LOCKED - validated SL
      takeProfitPercent: 1.0,   // LOCKED - validated TP (tight mean-reversion)
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      minConfidence: 0.60,      // LOCKED - 60% gate filters garbage signals
      atrMinPercent: null,      // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: [],
      _validated: '2026-03-20', // Fingerprint - triggers warning if changed
    },
    // ╔═══════════════════════════════════════════════════════════════════════════╗
    // ║  MADynamicSR - LOCKED CONFIG - DO NOT CHANGE WITHOUT RE-VALIDATION       ║
    // ║  Walk-forward validated 2026-03-20 on TSLA 15m                            ║
    // ║  Train (Year 1+2): +$724, Test (Year 2): +$429                            ║
    // ╚═══════════════════════════════════════════════════════════════════════════╝
    MADynamicSR: {
      stopLossPercent: -0.8,          // LOCKED - validated SL
      takeProfitPercent: 1.0,         // LOCKED - validated TP
      trailingStopPercent: 0.5,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 180,
      useStructuralExits: false,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['sr_break'],
      _validated: '2026-03-20',
    },
    // CandlePattern - uses validated baseline exits
    CandlePattern: {
      stopLossPercent: -0.8,          // Use validated baseline
      takeProfitPercent: 1.0,         // Use validated baseline
      trailingStopPercent: 0.5,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 150,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['pattern_invalidated'],
    },
    // MarketRegime - uses validated baseline exits
    MarketRegime: {
      stopLossPercent: -0.8,          // Use validated baseline
      takeProfitPercent: 1.0,         // Use validated baseline
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 360,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['regime_change'],
    },
    OGZTPO: {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      useStructuralExits: false,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: [],
    },
    OpeningRangeBreakout: {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 180,
      useStructuralExits: true,
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      invalidationConditions: ['fvg_filled', 'or_break_reversal'],
    },
    SmartMoneySweep: {
      stopLossPercent: -0.3,          // maxLossPct from PineScript (hard cap, lose fast)
      takeProfitPercent: 1.5,         // High conviction ATR target
      trailingStopPercent: 0.5,       // Trail after 0.5 R:R (Fabio: risk-free in 1 minute)
      trailingActivation: 0.5,
      maxHoldTimeMinutes: 900,        // 60 candles x 15 min
      useStructuralExits: true,       // Strategy provides SL/TP via overrideLevels
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: ['sweep_absorbed'],
    },
    DonchianBreakout: {
      stopLossPercent: -2.5,
      stopType: 'structural',
      atrStopMult: 2.5,
      takeProfitPercent: null,
      tpMode: 'off',
      tpAtrMultiple: null,
      trailingStopPercent: null,
      trailingActivation: null,
      trailType: 'channel',
      trailAtrMult: null,
      trailChannelBars: 10,
      maxHoldTimeMinutes: null,
      maxHoldMode: 'off',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'terrain',
      },
      useStructuralExits: true,
      minConfidence: null,
      atrMinPercent: null,
      invalidationConditions: ['donchian_channel_reentry'],
      _validated: null,
    },
    PropSafeEMAPullback: requiredConfiguredPlainObject('exitContracts.PropSafeEMAPullback'),
    EMATrendRetest: requiredConfiguredPlainObject('exitContracts.EMATrendRetest'),
    RSI2MeanReversion: requiredConfiguredPlainObject('exitContracts.RSI2MeanReversion'),
    TimeSeriesMomentum: requiredConfiguredPlainObject('exitContracts.TimeSeriesMomentum'),
    // 2026-04-28 — NoWickImbalance (Wolf spec). Structural exits via
    // module's overrideLevels (1:1 RR computed from swing structure).
    // Fallbacks below are safety nets only — strategy's overrideLevels win.
    // Unvalidated — needs sweep + walk-forward before _validated set.
    NoWickImbalance: requiredConfiguredPlainObject('exitContracts.NoWickImbalance'),
    default: {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      useStructuralExits: false,
      maxConcurrentEntries: 1,
      stopType: 'percent',
      trailType: 'percent',
      tpMode: 'percent',
      maxHoldMode: 'minutes',
      partialExit: {
        enabled: false,
        triggerR: 1,
        fraction: 0.5,
        remainderTrail: 'atr',
      },
      scaleIn: {
        enabled: false,
        maxAdds: 0,
        addTriggerClass: 'none',
        requireProfitConfirmation: true,
        aggregateRiskCap: 1,
        addSizingLadder: [],
      },
      minConfidence: null,            // No locked per-strategy confidence gate yet.
      atrMinPercent: null,            // Per-strategy ATR threshold. null = use global default.
      invalidationConditions: [],
    },
  },

  // =========================================================================
  // EXIT LOGIC CONFIGURATION (frozen at trade birth by PolicyBuilder)
  // All values overridable via env vars for matrix sweep tuning
  // =========================================================================
  exitLogic: {
    // ─── Break-Even Scale-Out (PATCH 1: the 50% sell at BE) ───
    beScaleOut: {
      enabled: envBool('BE_SCALEOUT_ENABLED', true),
      triggerType: env('BE_SCALEOUT_TRIGGER', 'one_to_one_r'),  // 'one_to_one_r' | 'fixed_percent'
      fixedPercentTrigger: parseFloat(env('BE_SCALEOUT_TRIGGER_PCT', 0.5)),  // if triggerType=fixed_percent, fire at 0.5%
      scaleOutFraction: parseFloat(env('BE_SCALEOUT_FRACTION', 0.5)),  // sell 50% by default
      feeBufferPercent: parseFloat(env('BE_SCALEOUT_FEE_BUFFER', 0.05)),  // -0.05% below entry for fees
    },

    breakEvenStop: {
      enabled: envBool('BREAKEVEN_STOP_ENABLED', false),
      triggerPercent: parseFloat(env('BREAKEVEN_STOP_TRIGGER_PCT', 0.2)),
    },

    // ─── Tiered Exit Scale-Out (ProfitExitPlanner multi-tier profit taking) ───
    // Lifted from the legacy profit manager constructor hardcodes 2026-04-16
    // All values env-backed for matrix sweep tuning
    tieredExit: {
      enabled: envBool('TIERED_EXIT_ENABLED', true),
      // Relative tier weights. ProfitExitPlanner allocates open tiers against
      // the current remaining runner after any earlier partial exit.
      tier1ExitFraction: parseFloat(env('TIER1_EXIT_FRACTION', 0.30)),
      tier2ExitFraction: parseFloat(env('TIER2_EXIT_FRACTION', 0.30)),
      tier3ExitFraction: parseFloat(env('TIER3_EXIT_FRACTION', 0.20)),
      // Tier 4 (final) fraction is computed: 1.0 - (tier1 + tier2 + tier3) = 0.20 default

      // Market regime target multipliers (applied when enableMarketAdaptation=true)
      enableMarketAdaptation: envBool('TIER_MARKET_ADAPTATION_ENABLED', true),
      trendingTargetMultiplier: parseFloat(env('TIER_TREND_MULT', 1.3)),
      rangingTargetMultiplier: parseFloat(env('TIER_RANGE_MULT', 0.8)),

      // Confidence-based target adjustment
      highConfidenceThreshold: parseFloat(env('TIER_HIGH_CONF_THRESHOLD', 0.8)),
      highConfidenceMultiplier: parseFloat(env('TIER_HIGH_CONF_MULT', 1.2)),
      lowConfidenceThreshold: parseFloat(env('TIER_LOW_CONF_THRESHOLD', 0.6)),
      lowConfidenceMultiplier: parseFloat(env('TIER_LOW_CONF_MULT', 0.8)),
    },

    maxProfitManager: {
      trackPerformance: envBool('MPM_TRACK_PERFORMANCE', true),
      logLevel: env('MPM_LOG_LEVEL', 'info'),
    },

    // ─── Dynamic Trailing Stop (lifted from DynamicTrailingStop.js into MPM) ───
    trail: {
      enabled: envBool('TRAIL_ENABLED', true),
      minActivationPercent: parseFloat(env('TRAIL_MIN_ACTIVATION', 0.5)),  // % profit before trail arms
      atrMultiplier: parseFloat(env('TRAIL_ATR_MULTIPLIER', 2.0)),
      trendWidenMultiplier: parseFloat(env('TRAIL_TREND_WIDEN', 1.5)),
      structureTightenMultiplier: parseFloat(env('TRAIL_STRUCTURE_TIGHTEN', 0.5)),
      structureDistanceThreshold: parseFloat(env('TRAIL_STRUCTURE_DIST', 1.0)),  // % from structure
      profitRatchetThreshold: parseFloat(env('TRAIL_RATCHET_THRESHOLD', 3.0)),  // tighten past 3% profit
      profitRatchetRate: parseFloat(env('TRAIL_RATCHET_RATE', 0.1)),  // 10% tighter per 1% above threshold
      profitRatchetFloor: parseFloat(env('TRAIL_RATCHET_FLOOR', 0.6)),  // never tighter than 60% of base
      minTrailPercent: parseFloat(env('TRAIL_MIN_PCT', 0.3)),
      maxTrailPercent: parseFloat(env('TRAIL_MAX_PCT', 3.0)),
      feeBufferPercent: parseFloat(env('TRAIL_FEE_BUFFER', 0.65)),  // round-trip fee threshold
      roundNumberProximity: parseFloat(env('TRAIL_ROUND_PROXIMITY', 0.5)),
      roundNumberTighten: parseFloat(env('TRAIL_ROUND_TIGHTEN', 0.7)),
    },

    volatilityAdjustment: {
      enabled: envBool('MPM_VOLATILITY_ADJUSTMENT_ENABLED', false),
      lowThresholdPercent: parseFloat(env('MPM_LOW_VOLATILITY_THRESHOLD', 0.5)),
      highThresholdPercent: parseFloat(env('MPM_HIGH_VOLATILITY_THRESHOLD', 2.0)),
      lookbackPeriods: parseFloat(env('MPM_VOLATILITY_LOOKBACK_PERIODS', 20)),
    },

    // ─── Profit Floor Ladder (lifted from PatternBasedExitModel) ───
    // As profit grows, raise the stop to lock in this fraction of peak profit
    profitFloor: {
      enabled: envBool('PROFIT_FLOOR_ENABLED', true),
      tiers: [
        { profit: parseFloat(env('PROFIT_FLOOR_T1_AT', 0.5)), protect: parseFloat(env('PROFIT_FLOOR_T1_LOCK', 0.30)) },
        { profit: parseFloat(env('PROFIT_FLOOR_T2_AT', 1.0)), protect: parseFloat(env('PROFIT_FLOOR_T2_LOCK', 0.50)) },
        { profit: parseFloat(env('PROFIT_FLOOR_T3_AT', 1.5)), protect: parseFloat(env('PROFIT_FLOOR_T3_LOCK', 0.70)) },
        { profit: parseFloat(env('PROFIT_FLOOR_T4_AT', 2.0)), protect: parseFloat(env('PROFIT_FLOOR_T4_LOCK', 0.85)) },
      ],
    },

    // ─── Chart Reversal Detection (lifted from PatternBasedExitModel) ───
    reversalDetection: {
      enabled: envBool('REVERSAL_DETECT_ENABLED', true),
      minProfitRequired: parseFloat(env('REVERSAL_MIN_PROFIT', 0.3)),  // only act on reversals if in profit
      patterns: [
        'double_top', 'double_bottom', 'head_shoulders', 'inv_head_shoulders',
        'evening_star', 'morning_star', 'bearish_engulfing', 'bullish_engulfing',
        'shooting_star', 'hammer', 'doji_star', 'dark_cloud', 'piercing_line',
      ],
      exitFraction: parseFloat(env('REVERSAL_EXIT_FRACTION', 1.0)),  // close 100% on reversal by default
    },

    safety: {},
  },

  // =========================================================================
  // ENTRY LOGIC CONFIGURATION (read by DynamicPositionSizer + StrategyOrchestrator)
  // =========================================================================
  entryLogic: {
    // ─── Dynamic position sizing curves ───
    sizing: {
      enabled: envBool('DYNAMIC_SIZING_ENABLED', true),
      basePositionPercent: parseFloat(env('BASE_POSITION_PCT', 0.01)),
      maxPositionPercent: parseFloat(env('MAX_POSITION_PCT', 0.05)),
      absoluteCapPercent: parseFloat(env('ABSOLUTE_POSITION_CAP', 0.15)),  // hard ceiling even with all multipliers
      stockShareRange: {
        enabled: envBool('ENTRY_STOCK_SHARE_RANGE_ENABLED', false),
        minShares: env('ENTRY_MIN_STOCK_SHARES', 0),
        maxShares: env('ENTRY_MAX_STOCK_SHARES', 0),
        maxNotionalUsd: env('ENTRY_MAX_STOCK_NOTIONAL', 0),
        consistencyCapBuffer: env('ENTRY_CONSISTENCY_CAP_BUFFER', 0.98),
        dailyLossRiskFraction: env('ENTRY_DAILY_LOSS_RISK_FRACTION', 1.0),
      },
      confidenceCurve: [
        { confidence: 0.00, multiplier: 0.25 },
        { confidence: 0.50, multiplier: 0.50 },
        { confidence: 0.60, multiplier: 1.00 },
        { confidence: 0.75, multiplier: 1.50 },
        { confidence: 0.90, multiplier: 2.50 },
        { confidence: 1.00, multiplier: 2.50 },
      ],
      volatilityCurve: [
        { atrPercent: 0.00, multiplier: 1.50 },
        { atrPercent: 0.15, multiplier: 1.20 },
        { atrPercent: 0.30, multiplier: 1.00 },
        { atrPercent: 0.60, multiplier: 0.80 },
        { atrPercent: 1.00, multiplier: 0.60 },
        { atrPercent: 2.00, multiplier: 0.40 },
      ],
      patternMultipliers: {
        promoted:    1.00,
        neutral:     1.00,
        learning:    1.00,
        quarantined: 1.00,
        unknown:     1.00,
      },
      confluenceMultipliers: [1.0, 1.0, 1.25, 1.5, 1.75, 2.0],  // by confluence count
    },
  },

  // =========================================================================
  // DATA FEED / WATCHDOG
  // =========================================================================
  dataFeed: {
    bootRestHydrationLimit: env('BOOT_REST_HYDRATION_LIMIT', 60),
    livenessBackfillLimit: env('LIVENESS_BACKFILL_LIMIT', 10),
    livenessCheckIntervalMs: env('LIVENESS_CHECK_INTERVAL_MS', 60000),
    maxDataSilenceMs: env('LIVENESS_MAX_DATA_SILENCE_MS', 120000),
    activeTimeframeMultiplier: env('LIVENESS_ACTIVE_TIMEFRAME_MULTIPLIER', 1.5),
    activeTimeframeSlackMs: env('LIVENESS_ACTIVE_TIMEFRAME_SLACK_MS', 60000),
    maxBackfillAgeMultiplier: env('LIVENESS_MAX_BACKFILL_AGE_MULTIPLIER', 2),
    maxBackfillAgeSlackMs: env('LIVENESS_MAX_BACKFILL_AGE_SLACK_MS', 60000),
    staleDataMaxAgeMs: env('STALE_DATA_MAX_AGE_MS', 120000),
    staleDataRecoveryAgeMs: env('STALE_DATA_RECOVERY_AGE_MS', 30000),
    gapThresholdMultiplier: env('GAP_THRESHOLD_MULTIPLIER', 1.5),
    gapBackfillBufferCandles: env('GAP_BACKFILL_BUFFER_CANDLES', 5),
    gapRecoveryCleanCandlesRequired: env('GAP_RECOVERY_CLEAN_CANDLES_REQUIRED', 3),
    gapBackfillRetryDelayMs: env('GAP_BACKFILL_RETRY_DELAY_MS', 60000),
    expectedQuietLogIntervalMs: env('LIVENESS_EXPECTED_QUIET_LOG_INTERVAL_MS', 300000),
  },

  // =========================================================================
  // BROKER IDENTITY / SCOPE
  // =========================================================================
  broker: {
    id: env('BROKER', 'alpaca'),
    alpacaMode: env('ALPACA_MODE', ''),
    alpacaSymbols: env('ALPACA_SYMBOLS', ''),
    tradingPair: env('TRADING_PAIR', env('BROKER', 'alpaca') === 'kraken' ? 'BTC-USD' : 'TSLA'),
    candleTimeframe: env('CANDLE_TIMEFRAME', '15m'),
    assetClass: env('ASSET_CLASS', env('BROKER', 'alpaca') === 'kraken' ? 'crypto' : 'stocks'),
    accountId: env('BROKER_ACCOUNT_ID', 'default'),
  },

  // =========================================================================
  // STRATEGY-SPECIFIC PARAMETERS (per STRATEGY-REWRITE-SPEC.md)
  // =========================================================================
  strategies: {
    MADynamicSR: requiredConfiguredPlainObject('strategies.MADynamicSR'),
    EMASMACrossover: {
      // EMA/SMA crossover event geometry. All confidence constants are config-owned.
      decayBars: requiredConfigNumber('strategies.EMASMACrossover.decayBars'),
      decayMinMultiplier: requiredConfigNumber('strategies.EMASMACrossover.decayMinMultiplier'),
      velocityWindowBars: requiredConfigNumber('strategies.EMASMACrossover.velocityWindowBars'),
      velocityAtrPeriod: requiredConfigNumber('strategies.EMASMACrossover.velocityAtrPeriod'),
      velocityScale: requiredConfigNumber('strategies.EMASMACrossover.velocityScale'),
      velocityMaxBoost: requiredConfigNumber('strategies.EMASMACrossover.velocityMaxBoost'),
      velocityMaxPenalty: requiredConfigNumber('strategies.EMASMACrossover.velocityMaxPenalty'),
      elasticityMinAtr: requiredConfigNumber('strategies.EMASMACrossover.elasticityMinAtr'),
      elasticityMaxAtr: requiredConfigNumber('strategies.EMASMACrossover.elasticityMaxAtr'),
      elasticityScale: requiredConfigNumber('strategies.EMASMACrossover.elasticityScale'),
      elasticityMaxBoost: requiredConfigNumber('strategies.EMASMACrossover.elasticityMaxBoost'),
      elasticityMaxPenalty: requiredConfigNumber('strategies.EMASMACrossover.elasticityMaxPenalty'),
      baseConfidence: requiredConfigNumber('strategies.EMASMACrossover.baseConfidence'),
      confluenceWeight: requiredConfigNumber('strategies.EMASMACrossover.confluenceWeight'),
      freshCrossoverBonusPerCross: requiredConfigNumber('strategies.EMASMACrossover.freshCrossoverBonusPerCross'),
      freshCrossoverBonusMax: requiredConfigNumber('strategies.EMASMACrossover.freshCrossoverBonusMax'),
      maxConfidence: requiredConfigNumber('strategies.EMASMACrossover.maxConfidence'),
      confluenceBoost: requiredConfluenceBoostConfig('EMASMACrossover'),
      enabled: requiredConfigBool('strategies.EMASMACrossover.enabled'),
    },
    LiquiditySweep: requiredConfiguredPlainObject('strategies.LiquiditySweep'),
    RSI: requiredRsiStrategyConfig(),
    VolumeProfile: {
      // Fabio Valentino - Auction Market Theory
      sessionLookback: env('VP_SESSION_LOOKBACK', 96), // 24h of 15m candles
      numBins: env('VP_NUM_BINS', 50),                 // Price bins for profile
      valueAreaPct: env('VP_VALUE_AREA_PCT', 0.70),    // 70% value area
      outOfBalancePct: env('VP_OUT_OF_BALANCE_PCT', 0.5), // Was 0.1%, needs 0.5%
      recalcInterval: env('VP_RECALC_INTERVAL', 5),    // Candles between recalc
      confluenceBoost: requiredConfluenceBoostConfig('VolumeProfile'),
      enabled: true,
    },
    SmartMoneySweep: {
      // Fabio + Marco composite - institutional sweep detection
      vpDays: env('SMS_VP_DAYS', 5),
      vpBins: env('SMS_VP_BINS', 50),
      valueAreaPct: env('SMS_VA_PCT', 70),
      bodyWeightPct: env('SMS_BODY_WEIGHT', 70),
      lvnPctile: env('SMS_LVN_PCTILE', 20),
      ivbMinutes: env('SMS_IVB_MINUTES', 30),
      volAvgLen: env('SMS_VOL_AVG_LEN', 20),
      absorbBodyPct: env('SMS_ABSORB_BODY', 35),
      absorbWickPct: env('SMS_ABSORB_WICK', 60),
      absorbVolMult: env('SMS_ABSORB_VOL_MULT', 1.2),
      initBodyPct: env('SMS_INIT_BODY', 60),
      absorbBodyProgPct: env('SMS_ABSORB_BODY_PROG', 50),
      absorbWickProgPct: env('SMS_ABSORB_WICK_PROG', 40),
      absorbVolProgMult: env('SMS_ABSORB_VOL_PROG_MULT', 0.9),
      initBodyProgPct: env('SMS_INIT_BODY_PROG', 45),
      cvdDivLen: env('SMS_CVD_DIV_LEN', 10),
      atrLen: env('SMS_ATR_LEN', 14),
      lowConvATRMult: env('SMS_LOW_CONV_ATR', 0.5),
      midConvATRMult: env('SMS_MID_CONV_ATR', 1.0),
      highConvATRMult: env('SMS_HIGH_CONV_ATR', 1.5),
      slBufferPct: env('SMS_SL_BUFFER', 0.15),
      maxLossPct: env('SMS_MAX_LOSS', 0.3),
      maxHoldBars: env('SMS_MAX_HOLD', 60),
      maxDailyLosses: env('SMS_MAX_DAILY_LOSSES', 3),
      vpRthOnly: envBool('SMS_VP_RTH_ONLY', true),
      vpLookbackBars: env('SMS_VP_LOOKBACK_BARS', 0),
      sweepMaxOffset: env('SMS_SWEEP_MAX_OFFSET', 3),
      minConditionsGate: requiredConfiguredNumber('strategies.SmartMoneySweep.minConditionsGate'),
      tierHigh: requiredConfiguredNumber('strategies.SmartMoneySweep.tierHigh'),
      tierMid: requiredConfiguredNumber('strategies.SmartMoneySweep.tierMid'),
      tierFloor: requiredConfiguredNumber('strategies.SmartMoneySweep.tierFloor'),
      breakHigh: requiredConfiguredNumber('strategies.SmartMoneySweep.breakHigh'),
      breakMid: requiredConfiguredNumber('strategies.SmartMoneySweep.breakMid'),
      confidenceMode: requiredConfiguredString('strategies.SmartMoneySweep.confidenceMode'),
      confluenceBoost: requiredConfluenceBoostConfig('SmartMoneySweep'),
      enabled: true,
    },
    DonchianBreakout: {
      entryPeriod: env('DONCHIAN_ENTRY_PERIOD', 20),
      atrPeriod: env('DONCHIAN_ATR_PERIOD', 20),
      atrStopMult: env('DONCHIAN_ATR_STOP_MULT', 2.5),
      allowShorts: envBool('DONCHIAN_ALLOW_SHORTS', false),
      stopType: configuredValue('strategies.DonchianBreakout.stopType'),
      trailType: configuredValue('strategies.DonchianBreakout.trailType'),
      trailChannelBars: requiredConfiguredNumber('strategies.DonchianBreakout.trailChannelBars'),
      tpMode: configuredValue('strategies.DonchianBreakout.tpMode'),
      maxHoldMode: configuredValue('strategies.DonchianBreakout.maxHoldMode'),
      partialExit: requiredConfiguredPlainObject('strategies.DonchianBreakout.partialExit'),
      invalidationConditions: configuredValue('strategies.DonchianBreakout.invalidationConditions'),
      confluenceBoost: requiredConfluenceBoostConfig('DonchianBreakout'),
      enabled: true,
    },
    OGZTPO: requiredConfiguredPlainObject('strategies.OGZTPO'),
    NoWickImbalance: requiredConfiguredPlainObject('strategies.NoWickImbalance'),
    PropSafeEMAPullback: {
      fastEmaPeriod: env('PROPSAFE_EMA_FAST_PERIOD', requiredConfiguredNumber('strategies.PropSafeEMAPullback.fastEmaPeriod')),
      pullbackEmaPeriod: env('PROPSAFE_EMA_PULLBACK_PERIOD', requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackEmaPeriod')),
      trendEmaPeriod: env('PROPSAFE_EMA_TREND_PERIOD', requiredConfiguredNumber('strategies.PropSafeEMAPullback.trendEmaPeriod')),
      atrPeriod: env('PROPSAFE_EMA_ATR_PERIOD', requiredConfiguredNumber('strategies.PropSafeEMAPullback.atrPeriod')),
      crossLookbackBars: env('PROPSAFE_EMA_CROSS_LOOKBACK', requiredConfiguredNumber('strategies.PropSafeEMAPullback.crossLookbackBars')),
      pullbackLookbackBars: env('PROPSAFE_EMA_PULLBACK_LOOKBACK', requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackLookbackBars')),
      pullbackMinAtr: env('PROPSAFE_EMA_PULLBACK_MIN_ATR', requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackMinAtr')),
      pullbackMaxAtr: env('PROPSAFE_EMA_PULLBACK_MAX_ATR', requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackMaxAtr')),
      atrStopMult: env('PROPSAFE_EMA_ATR_STOP_MULT', requiredConfiguredNumber('strategies.PropSafeEMAPullback.atrStopMult')),
      targetRR: env('PROPSAFE_EMA_TARGET_RR', requiredConfiguredNumber('strategies.PropSafeEMAPullback.targetRR')),
      trailActivationR: env('PROPSAFE_EMA_TRAIL_ACTIVATION_R', requiredConfiguredNumber('strategies.PropSafeEMAPullback.trailActivationR')),
      trailDistanceR: env('PROPSAFE_EMA_TRAIL_DISTANCE_R', requiredConfiguredNumber('strategies.PropSafeEMAPullback.trailDistanceR')),
      maxHoldTimeMinutes: env('PROPSAFE_EMA_MAX_HOLD_MINUTES', requiredConfiguredNumber('strategies.PropSafeEMAPullback.maxHoldTimeMinutes')),
      confidenceBase: env('PROPSAFE_EMA_CONFIDENCE_BASE', requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceBase')),
      confidenceTrendBonus: env('PROPSAFE_EMA_CONFIDENCE_TREND_BONUS', requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceTrendBonus')),
      confidencePullbackBonus: env('PROPSAFE_EMA_CONFIDENCE_PULLBACK_BONUS', requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidencePullbackBonus')),
      confidenceConfirmationBonus: env('PROPSAFE_EMA_CONFIDENCE_CONFIRMATION_BONUS', requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceConfirmationBonus')),
      confidenceFreshCrossBonus: env('PROPSAFE_EMA_CONFIDENCE_FRESH_CROSS_BONUS', requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceFreshCrossBonus')),
      maxConfidence: env('PROPSAFE_EMA_MAX_CONFIDENCE', requiredConfiguredNumber('strategies.PropSafeEMAPullback.maxConfidence')),
      requireRth: envBool('PROPSAFE_EMA_REQUIRE_RTH', requiredConfiguredBool('strategies.PropSafeEMAPullback.requireRth')),
      rthStartET: env('PROPSAFE_EMA_RTH_START_ET', configuredValue('strategies.PropSafeEMAPullback.rthStartET')),
      rthEndET: env('PROPSAFE_EMA_RTH_END_ET', configuredValue('strategies.PropSafeEMAPullback.rthEndET')),
      sessionTimeZone: env('PROPSAFE_EMA_SESSION_TIMEZONE', configuredValue('strategies.PropSafeEMAPullback.sessionTimeZone')),
      allowShorts: envBool('PROPSAFE_EMA_ALLOW_SHORTS', requiredConfiguredBool('strategies.PropSafeEMAPullback.allowShorts')),
      confluenceBoost: requiredConfluenceBoostConfig('PropSafeEMAPullback'),
      enabled: true,
    },
    EMATrendRetest: {
      emaPeriods: env('EMA_TREND_RETEST_PERIODS', configuredValue('strategies.EMATrendRetest.emaPeriods')),
      atrPeriod: env('EMA_TREND_RETEST_ATR_PERIOD', requiredConfiguredNumber('strategies.EMATrendRetest.atrPeriod')),
      slopeLookbackBars: env('EMA_TREND_RETEST_SLOPE_LOOKBACK', requiredConfiguredNumber('strategies.EMATrendRetest.slopeLookbackBars')),
      minSlopePct: env('EMA_TREND_RETEST_MIN_SLOPE_PCT', requiredConfiguredNumber('strategies.EMATrendRetest.minSlopePct')),
      retestLookbackBars: env('EMA_TREND_RETEST_LOOKBACK', requiredConfiguredNumber('strategies.EMATrendRetest.retestLookbackBars')),
      touchZoneAtr: env('EMA_TREND_RETEST_TOUCH_ZONE_ATR', requiredConfiguredNumber('strategies.EMATrendRetest.touchZoneAtr')),
      closeAwayAtr: env('EMA_TREND_RETEST_CLOSE_AWAY_ATR', requiredConfiguredNumber('strategies.EMATrendRetest.closeAwayAtr')),
      maxExtensionAtr: env('EMA_TREND_RETEST_MAX_EXTENSION_ATR', requiredConfiguredNumber('strategies.EMATrendRetest.maxExtensionAtr')),
      confidenceBase: env('EMA_TREND_RETEST_CONFIDENCE_BASE', requiredConfiguredNumber('strategies.EMATrendRetest.confidenceBase')),
      confidenceSlopeBonus: env('EMA_TREND_RETEST_CONFIDENCE_SLOPE_BONUS', requiredConfiguredNumber('strategies.EMATrendRetest.confidenceSlopeBonus')),
      confidenceRetestBonus: env('EMA_TREND_RETEST_CONFIDENCE_RETEST_BONUS', requiredConfiguredNumber('strategies.EMATrendRetest.confidenceRetestBonus')),
      confidenceConfirmationBonus: env('EMA_TREND_RETEST_CONFIDENCE_CONFIRMATION_BONUS', requiredConfiguredNumber('strategies.EMATrendRetest.confidenceConfirmationBonus')),
      maxConfidence: env('EMA_TREND_RETEST_MAX_CONFIDENCE', requiredConfiguredNumber('strategies.EMATrendRetest.maxConfidence')),
      atrStopMult: env('EMA_TREND_RETEST_ATR_STOP_MULT', requiredConfiguredNumber('strategies.EMATrendRetest.atrStopMult')),
      targetRR: env('EMA_TREND_RETEST_TARGET_RR', requiredConfiguredNumber('strategies.EMATrendRetest.targetRR')),
      trailActivationR: env('EMA_TREND_RETEST_TRAIL_ACTIVATION_R', requiredConfiguredNumber('strategies.EMATrendRetest.trailActivationR')),
      trailDistanceR: env('EMA_TREND_RETEST_TRAIL_DISTANCE_R', requiredConfiguredNumber('strategies.EMATrendRetest.trailDistanceR')),
      maxHoldTimeMinutes: env('EMA_TREND_RETEST_MAX_HOLD_MINUTES', requiredConfiguredNumber('strategies.EMATrendRetest.maxHoldTimeMinutes')),
      requireRth: envBool('EMA_TREND_RETEST_REQUIRE_RTH', requiredConfiguredBool('strategies.EMATrendRetest.requireRth')),
      rthStartET: env('EMA_TREND_RETEST_RTH_START_ET', configuredValue('strategies.EMATrendRetest.rthStartET')),
      rthEndET: env('EMA_TREND_RETEST_RTH_END_ET', configuredValue('strategies.EMATrendRetest.rthEndET')),
      sessionTimeZone: env('EMA_TREND_RETEST_SESSION_TIMEZONE', configuredValue('strategies.EMATrendRetest.sessionTimeZone')),
      allowShorts: envBool('EMA_TREND_RETEST_ALLOW_SHORTS', requiredConfiguredBool('strategies.EMATrendRetest.allowShorts')),
      confluenceBoost: requiredConfluenceBoostConfig('EMATrendRetest'),
      enabled: true,
    },
    RSI2MeanReversion: {
      rsiPeriod: env('RSI2_MR_RSI_PERIOD', requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiPeriod')),
      rsiEntry: env('RSI2_MR_ENTRY', requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiEntry')),
      rsiExitLong: env('RSI2_MR_EXIT_LONG', requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiExitLong')),
      rsiEntryOB: env('RSI2_MR_ENTRY_OB', requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiEntryOB')),
      trendPeriod: env('RSI2_MR_TREND_PERIOD', requiredConfiguredNumber('strategies.RSI2MeanReversion.trendPeriod')),
      allowShorts: envBool('RSI2_MR_ALLOW_SHORTS', requiredConfiguredBool('strategies.RSI2MeanReversion.allowShorts')),
      stopLossPercent: env('RSI2_MR_STOP_LOSS_PERCENT', requiredConfiguredNumber('strategies.RSI2MeanReversion.stopLossPercent')),
      takeProfitPercent: env('RSI2_MR_TAKE_PROFIT_PERCENT', requiredConfiguredNumber('strategies.RSI2MeanReversion.takeProfitPercent')),
      trailingStopPercent: env('RSI2_MR_TRAILING_STOP_PERCENT', requiredConfiguredNumber('strategies.RSI2MeanReversion.trailingStopPercent')),
      trailingActivation: env('RSI2_MR_TRAILING_ACTIVATION', requiredConfiguredNumber('strategies.RSI2MeanReversion.trailingActivation')),
      maxHoldTimeMinutes: env('RSI2_MR_MAX_HOLD_MINUTES', requiredConfiguredNumber('strategies.RSI2MeanReversion.maxHoldTimeMinutes')),
      confidenceBase: env('RSI2_MR_CONFIDENCE_BASE', requiredConfiguredNumber('strategies.RSI2MeanReversion.confidenceBase')),
      confidenceDepthMultiplier: env('RSI2_MR_CONFIDENCE_DEPTH_MULT', requiredConfiguredNumber('strategies.RSI2MeanReversion.confidenceDepthMultiplier')),
      maxConfidence: env('RSI2_MR_MAX_CONFIDENCE', requiredConfiguredNumber('strategies.RSI2MeanReversion.maxConfidence')),
      invalidationConditions: ['regime_change'],
      confluenceBoost: requiredConfluenceBoostConfig('RSI2MeanReversion'),
      enabled: true,
    },
    TimeSeriesMomentum: {
      lookback: env('TSMOM_LOOKBACK', requiredConfiguredNumber('strategies.TimeSeriesMomentum.lookback')),
      trendPeriod: env('TSMOM_TREND_PERIOD', requiredConfiguredNumber('strategies.TimeSeriesMomentum.trendPeriod')),
      atrPeriod: requiredConfiguredNumber('strategies.TimeSeriesMomentum.atrPeriod'),
      minReturn: env('TSMOM_MIN_RETURN', requiredConfiguredNumber('strategies.TimeSeriesMomentum.minReturn')),
      allowShorts: envBool('TSMOM_ALLOW_SHORTS', requiredConfiguredBool('strategies.TimeSeriesMomentum.allowShorts')),
      stopType: configuredValue('strategies.TimeSeriesMomentum.stopType'),
      atrStopMult: requiredConfiguredNumber('strategies.TimeSeriesMomentum.atrStopMult'),
      trailType: configuredValue('strategies.TimeSeriesMomentum.trailType'),
      trailAtrMult: requiredConfiguredNumber('strategies.TimeSeriesMomentum.trailAtrMult'),
      tpMode: configuredValue('strategies.TimeSeriesMomentum.tpMode'),
      maxHoldMode: configuredValue('strategies.TimeSeriesMomentum.maxHoldMode'),
      partialExit: requiredConfiguredPlainObject('strategies.TimeSeriesMomentum.partialExit'),
      confidenceBase: env('TSMOM_CONFIDENCE_BASE', requiredConfiguredNumber('strategies.TimeSeriesMomentum.confidenceBase')),
      confidenceReturnMultiplier: env('TSMOM_CONFIDENCE_RETURN_MULT', requiredConfiguredNumber('strategies.TimeSeriesMomentum.confidenceReturnMultiplier')),
      maxConfidence: env('TSMOM_MAX_CONFIDENCE', requiredConfiguredNumber('strategies.TimeSeriesMomentum.maxConfidence')),
      invalidationConditions: configuredValue('strategies.TimeSeriesMomentum.invalidationConditions'),
      confluenceBoost: requiredConfluenceBoostConfig('TimeSeriesMomentum'),
      enabled: true,
    },
    OpeningRangeBreakout: requiredConfiguredPlainObject('strategies.OpeningRangeBreakout'),
  },

  // =========================================================================
  // STRATEGY ORCHESTRATOR SETTINGS
  // FIX 2026-03-19: Extracted hardcoded values from StrategyOrchestrator
  // =========================================================================
  orchestrator: {
    // Minimum candle history required for each strategy
    minCandlesEMA: env('MIN_CANDLES_EMA', 20),              // EMACrossover needs 20 candles
    minCandlesMASR: env('MIN_CANDLES_MASR', 50),            // MADynamicSR needs 50 candles (200 MA)
    minCandlesSweep: env('MIN_CANDLES_SWEEP', 20),          // LiquiditySweep needs 20 candles
    minCandlesMTF: env('MIN_CANDLES_MTF', 30),              // MultiTimeframe needs 30 candles
    minCandlesTPO: env('MIN_CANDLES_TPO', 30),              // OGZTPO needs 30 candles

    // Fibonacci level boost thresholds
    fibDistanceEMA: env('FIB_DISTANCE_EMA', 0.5),           // 0.5% distance for EMA fib boost
    fibDistanceMASR: env('FIB_DISTANCE_MASR', 0.5),         // 0.5% distance for MASR fib boost
    fibDistanceSweep: env('FIB_DISTANCE_SWEEP', 0.8),       // 0.8% distance for Sweep fib boost
    fibBoostNormal: env('FIB_BOOST_NORMAL', 0.10),          // 10% confidence boost at fib level
    fibBoostGolden: env('FIB_BOOST_GOLDEN', 0.15),          // 15% confidence boost at golden zone

    mtfTimeframes: configValue('orchestrator.mtfTimeframes', ['1m', '5m', '15m', '1h', '4h']),
    emaCrossoverMtf: {
      hourlyTrendVetoMultiplier: env('EMA_MTF_HOURLY_TREND_VETO_MULT', 0.95),
      fourHourMacdBoostMultiplier: env('EMA_MTF_4H_MACD_BOOST_MULT', 1.15),
      freshLongTermCrossoverMinTrendStrength: env('EMA_MTF_FRESH_50_200_MIN_1H_TREND_STRENGTH', 0.30),
    },
    maDynamicSRMtf: {
      requireHourlyTrendAlign: envBool('MASR_MTF_REQUIRE_HOURLY_TREND_ALIGN', true),
      hourlyTrendConflictMultiplier: env('MASR_MTF_1H_TREND_CONFLICT_MULT', 0.95),
      fourHourAlignBoost: env('MASR_MTF_4H_ALIGN_BOOST', 0.08),
      compressionBandwidthThreshold: env('MASR_MTF_4H_COMPRESSION_BANDWIDTH', 0.01),
    },
    rsiMtf: {
      penalizeAgainst4hTrend: envBool('RSI_MTF_PENALIZE_AGAINST_4H_TREND', true),
      fourHourTrendConflictMultiplier: env('RSI_MTF_4H_TREND_CONFLICT_MULT', 0.95),
      hourlyRsiAlignBoost: env('RSI_MTF_1H_RSI_ALIGN_BOOST', 0.10),
      hourlyRsiBuyMax: env('RSI_MTF_1H_RSI_BUY_MAX', 40),
      hourlyRsiSellMin: env('RSI_MTF_1H_RSI_SELL_MIN', 60),
    },
    ogzTpoMtf: {
      fourHourTrendBoostMultiplier: env('OGZTPO_MTF_4H_TREND_BOOST_MULT', 1.12),
      hourlyMacdAlignBoost: env('OGZTPO_MTF_1H_MACD_BOOST_MULT', 1.08),
      bandwidthThreshold: env('OGZTPO_MTF_4H_BANDWIDTH_THRESHOLD', 0.015),
    },
  },

  // =========================================================================
  // UNIVERSAL ALERT SURFACE (exit authority lives in strategy contracts)
  // =========================================================================
  universalLimits: {},

  // =========================================================================
  // MAX HOLD TIMES
  // =========================================================================
  holdTimes: {
    defaultMaxHold: 180,                                          // 3 hours default
    enableTimeBasedAdjustments: envBool('MPM_TIME_BASED_ADJUSTMENTS_ENABLED', false),
    minHoldTimeMinutes: parseFloat(env('MIN_HOLD_TIME_MINUTES', 0.0)), // 0 = no minimum (scalping)

    // Time-based trail tightening (for the exit planner path)
    tighteningSchedule: [
      { minutes: 30, trailFactor: 1.0 },
      { minutes: 60, trailFactor: 0.8 },
      { minutes: 120, trailFactor: 0.6 },
      { minutes: 180, trailFactor: 0.4 },
    ],
  },

  // =========================================================================
  // FEE CONFIGURATION
  // =========================================================================
  fees: {
    model: env('FEE_MODEL', 'percent'),
    makerFee: env('FEE_MAKER', 0),
    takerFee: env('FEE_TAKER', 0),
    slippage: env('FEE_SLIPPAGE', 0.0005),
    totalRoundTrip: env('FEE_TOTAL_ROUNDTRIP', 0),
    safetyBuffer: env('FEE_SAFETY_BUFFER', 0),
    perShare: env('FEE_PER_SHARE', 0),
    minOrderFee: env('FEE_MIN_ORDER', 0),
  },

  // =========================================================================
  // FILTERS (for StrategyOrchestrator)
  // =========================================================================
  filters: {
    atrEnabled: envBool('ATR_FILTER_ENABLED', false),             // Skip trades in dead markets
    atrMinPercent: env('ATR_MIN_PERCENT', 0.15),                  // Minimum ATR % to allow trades
  },

  strategyBehavior: {
    emaCrossover: {
      entryEventsOnly: requiredConfigBool('strategyBehavior.emaCrossover.entryEventsOnly'),
      confirmBars: requiredConfigNumber('strategyBehavior.emaCrossover.confirmBars'),
      warmupBars: requiredConfigNumber('strategyBehavior.emaCrossover.warmupBars'),
    },
    trendRegimeGate: {
      enabled: envBool('TREND_REGIME_GATE_ENABLED', false),
      minConfidence: env('TREND_REGIME_GATE_MIN_CONFIDENCE', 0.25),
      strategies: [
        'EMASMACrossover',
        'MADynamicSR',
        'DonchianBreakout',
        'PropSafeEMAPullback',
        'EMATrendRetest',
        'TimeSeriesMomentum',
      ],
    },
    atrContracts: {
      enabled: envBool('ATR_CONTRACTS_ENABLED', false),
      stopMultiplier: env('ATR_STOP_MULTIPLIER', 2.0),
      trailMultiplier: env('ATR_TRAIL_MULTIPLIER', 2.0),
      trailingActivationR: env('ATR_TRAILING_ACTIVATION_R', 1.0),
    },
  },

  // =========================================================================
  // EVAL RULE NUMBERS (ConfigLoader owns rule execution; ConfigLoader exposes
  // the same env-owned values for entry sizing math that must not silently miss
  // live TTP caps.)
  // =========================================================================
  evalRules: {
    ttp: {
      accountLimits: {
        dailyLossDollars: null,
        maxLossThresholdEquity: null,
      },
      consistency: {
        profitTargetDollars: null,
        maxPositionProfitRatio: null,
        maxProfitTargetInitialBalanceRatio: null,
      },
    },
  },

  // =========================================================================
  // TIMEFRAME-SPECIFIC ADJUSTMENTS
  // =========================================================================
  timeframeConfig: {
    '1m':  { trailPct: 0.003, maxHoldMin: 15,   slPct: 0.005, tpPct: 0.008 },
    '5m':  { trailPct: 0.006, maxHoldMin: 60,   slPct: 0.010, tpPct: 0.018 },
    '15m': { trailPct: 0.010, maxHoldMin: 120,  slPct: 0.015, tpPct: 0.025 },
    '30m': { trailPct: 0.015, maxHoldMin: 240,  slPct: 0.020, tpPct: 0.035 },
    '1h':  { trailPct: 0.020, maxHoldMin: 480,  slPct: 0.025, tpPct: 0.045 },
    '4h':  { trailPct: 0.030, maxHoldMin: 1440, slPct: 0.035, tpPct: 0.070 },
    '1d':  { trailPct: 0.040, maxHoldMin: 4320, slPct: 0.050, tpPct: 0.100 },
  },

  // =========================================================================
  // MARKET REGIME MULTIPLIERS
  // =========================================================================
  regimeMultipliers: {
    strong_uptrend:   { slMultiplier: 1.5, tpMultiplier: 2.0 },
    mild_uptrend:     { slMultiplier: 1.2, tpMultiplier: 1.5 },
    trading_range:    { slMultiplier: 0.8, tpMultiplier: 1.0 },
    accumulation:     { slMultiplier: 2.0, tpMultiplier: 1.5 },
    volatile_spike:   { slMultiplier: 0.5, tpMultiplier: 0.8 },
    breakout:         { slMultiplier: 1.0, tpMultiplier: 3.0 },
    consolidation:    { slMultiplier: 1.0, tpMultiplier: 2.0 },
  },

  // =========================================================================
  // TRADING PROFILES (for profile-based trading)
  // =========================================================================
  profiles: buildRuntimeProfilesConfig(),

  // =========================================================================
  // SCALPER-SPECIFIC CONFIG
  // =========================================================================
  scalper: {
    microProfitTarget: env('SCALPER_MICRO_PROFIT', 0.005),       // 0.5%
    quickProfitTarget: env('SCALPER_QUICK_PROFIT', 0.008),       // 0.8%
    momentumShiftExit: env('SCALPER_MOMENTUM_SHIFT', 0.15),      // 15% momentum loss = exit
    stopMultiplier: env('SCALPER_STOP_MULTIPLIER', 0.5),         // 50% tighter stops
    maxHoldTime: env('SCALPER_MAX_HOLD_TIME', 300000),           // 5 minutes in ms
  },

  // =========================================================================
  // DASHBOARD RUNTIME CONTRACT
  // =========================================================================
  dashboard: {
    stateUpdateHeartbeatMs: env('DASHBOARD_STATE_UPDATE_HEARTBEAT_MS', 30000),
    errorEventDedupeMs: env('DASHBOARD_ERROR_EVENT_DEDUPE_MS', 5000),
    errorEventMessageMaxLength: env('DASHBOARD_ERROR_EVENT_MESSAGE_MAX_LENGTH', 500),
    errorEventDedupeMaxKeys: env('DASHBOARD_ERROR_EVENT_DEDUPE_MAX_KEYS', 200),
    brokerStatusDedupeMaxKeys: env('DASHBOARD_BROKER_STATUS_DEDUPE_MAX_KEYS', 200),
    edgeAnalyticsMaxScopes: env('DASHBOARD_EDGE_ANALYTICS_MAX_SCOPES', 200),
  },

  // =========================================================================
  // BACKTEST WORKER ENV CONTRACT
  // =========================================================================
	  backtestWorkerEnv: {
	    canonical: freezeStringMap({
	      PROFILE: 'backtest-all',
	      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      BACKTEST_SILENT: 'true',
      BACKTEST_VERBOSE: 'false',
      BACKTEST_FAST: 'true',
      INITIAL_BALANCE: '10000',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      ENABLE_LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      TEST_MODE: 'false',
      BACKTEST_NO_PATTERN_SAVE: 'true',
      SKIP_CSV_EXPORT: 'true',
      ENABLE_DASHBOARD: 'false',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
      SENTRY_DSN: '',
      NODE_ENV: 'test',
      DIRECTION_FILTER: 'both',
      EXIT_SYSTEM: 'legacy',
      FEE_MAKER: '0',
      FEE_TAKER: '0',
      FEE_TOTAL_ROUNDTRIP: '0',
      FEE_SAFETY_BUFFER: '0',
      FEE_SLIPPAGE: '0.0005',
    }),
    stockZeroFee: freezeStringMap({
      FEE_MAKER: '0',
      FEE_TAKER: '0',
      FEE_TOTAL_ROUNDTRIP: '0',
      FEE_SAFETY_BUFFER: '0',
    }),
  },

  // =========================================================================
  // PARALLEL BACKTEST RUNNER CONFIG
  // =========================================================================
  parallelBacktest: deepFreezePlain({
    defaultData: 'tuning/alpaca-tsla-15m-2y.json',
    dataShortcuts: {
      tsla: 'tuning/alpaca-tsla-15m-2y.json',
      'tsla-train': 'tuning/tsla-15m-train.json',
      'tsla-test': 'tuning/tsla-15m-test.json',
      'tsla-unseen': 'tuning/tsla-15m-unseen.json',
      spy: 'tuning/alpaca-spy-15m-2y.json',
      qqq: 'tuning/alpaca-qqq-15m-2y.json',
      btc: 'data/polygon-btc-1y.json',
      'btc-5sec': 'data/polygon-btc-5sec.json',
    },
    stockDataShortcutKeys: [
      'tsla',
      'tsla-train',
      'tsla-test',
      'tsla-unseen',
      'spy',
      'qqq',
    ],
    strategies: [
      'RSI',
      'EMASMACrossover',
      'MADynamicSR',
      'LiquiditySweep',
      'SmartMoneySweep',
      'OGZTPO',
      'OpeningRangeBreakout',
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'DonchianBreakout',
      'PropSafeEMAPullback',
      'EMATrendRetest',
      'RSI2MeanReversion',
      'TimeSeriesMomentum',
    ],
    sweepPresets: {
      real: [
        { name: 'baseline', env: {} },
        { name: 'atr-off', env: { ATR_FILTER_ENABLED: 'false' } },
        { name: 'atr-015', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.15' } },
        { name: 'atr-025', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.25' } },
        { name: 'size-3pct', env: { MAX_POSITION_SIZE_PCT: '0.03' } },
        { name: 'size-5pct', env: { MAX_POSITION_SIZE_PCT: '0.05' } },
        { name: 'size-7pct', env: { MAX_POSITION_SIZE_PCT: '0.07' } },
        { name: 'tiers-tight', env: { TIER1_TARGET: '0.010', TIER2_TARGET: '0.015', TIER3_TARGET: '0.020' } },
        { name: 'tiers-wide', env: { TIER1_TARGET: '0.015', TIER2_TARGET: '0.025', TIER3_TARGET: '0.040' } },
      ],
      atr: [
        { name: 'atr-off', env: { ATR_FILTER_ENABLED: 'false' } },
        { name: 'atr-010', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.10' } },
        { name: 'atr-015', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.15' } },
        { name: 'atr-020', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.20' } },
        { name: 'atr-025', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.25' } },
        { name: 'atr-030', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.30' } },
        { name: 'atr-035', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.35' } },
        { name: 'atr-040', env: { ATR_FILTER_ENABLED: 'true', ATR_MIN_PERCENT: '0.40' } },
      ],
      sizing: [
        { name: 'size-2pct', env: { MAX_POSITION_SIZE_PCT: '0.02' } },
        { name: 'size-3pct', env: { MAX_POSITION_SIZE_PCT: '0.03' } },
        { name: 'size-4pct', env: { MAX_POSITION_SIZE_PCT: '0.04' } },
        { name: 'size-5pct', env: { MAX_POSITION_SIZE_PCT: '0.05' } },
        { name: 'size-7pct', env: { MAX_POSITION_SIZE_PCT: '0.07' } },
        { name: 'size-10pct', env: { MAX_POSITION_SIZE_PCT: '0.10' } },
      ],
      tiers: [
        { name: 'tiers-tight', env: { TIER1_TARGET: '0.005', TIER2_TARGET: '0.008', TIER3_TARGET: '0.012' } },
        { name: 'tiers-configD', env: { TIER1_TARGET: '0.007', TIER2_TARGET: '0.010', TIER3_TARGET: '0.015' } },
        { name: 'tiers-above-fees', env: { TIER1_TARGET: '0.010', TIER2_TARGET: '0.015', TIER3_TARGET: '0.020' } },
        { name: 'tiers-wide', env: { TIER1_TARGET: '0.015', TIER2_TARGET: '0.020', TIER3_TARGET: '0.030' } },
        { name: 'tiers-no-early', env: { TIER1_TARGET: '0.020', TIER2_TARGET: '0.030', TIER3_TARGET: '0.050' } },
      ],
      strategySweep: [
        { name: 'RSI-only', env: { SOLO_STRATEGY: 'RSI' } },
        { name: 'EMA-only', env: { SOLO_STRATEGY: 'EMASMACrossover' } },
        { name: 'MASR-only', env: { SOLO_STRATEGY: 'MADynamicSR' } },
        { name: 'Sweep-only', env: { SOLO_STRATEGY: 'LiquiditySweep' } },
        { name: 'SMS-only', env: { SOLO_STRATEGY: 'SmartMoneySweep' } },
        { name: 'TPO-only', env: { SOLO_STRATEGY: 'OGZTPO' } },
        { name: 'ORB-only', env: { SOLO_STRATEGY: 'OpeningRangeBreakout' } },
        { name: 'Candle-only', env: { SOLO_STRATEGY: 'CandlePattern' } },
        { name: 'NoWick-only', env: { SOLO_STRATEGY: 'NoWickImbalance' } },
        { name: 'BreakRetest-only', env: { SOLO_STRATEGY: 'BreakRetest' } },
        { name: 'Donchian-only', env: { SOLO_STRATEGY: 'DonchianBreakout' } },
        { name: 'PropEMA-only', env: { SOLO_STRATEGY: 'PropSafeEMAPullback' } },
        { name: 'EMARetest-only', env: { SOLO_STRATEGY: 'EMATrendRetest' } },
        { name: 'RSI2MR-only', env: { SOLO_STRATEGY: 'RSI2MeanReversion' } },
        { name: 'TSMOM-only', env: { SOLO_STRATEGY: 'TimeSeriesMomentum' } },
      ],
      exitGeometry: [
        { name: 'donchian-current', env: { SOLO_STRATEGY: 'DonchianBreakout', ENABLE_DONCHIAN: 'true' } },
        { name: 'donchian-fee-tight', env: { SOLO_STRATEGY: 'DonchianBreakout', ENABLE_DONCHIAN: 'true', DONCHIAN_ATR_STOP_MULT: '1.2', DONCHIAN_TAKE_PROFIT_PERCENT: '1.8', DONCHIAN_TRAILING_STOP_PERCENT: '0.6', DONCHIAN_TRAILING_ACTIVATION: '0.8', DONCHIAN_MAX_HOLD_MINUTES: '240' } },
        { name: 'donchian-balanced', env: { SOLO_STRATEGY: 'DonchianBreakout', ENABLE_DONCHIAN: 'true', DONCHIAN_ATR_STOP_MULT: '1.6', DONCHIAN_TAKE_PROFIT_PERCENT: '2.8', DONCHIAN_TRAILING_STOP_PERCENT: '0.8', DONCHIAN_TRAILING_ACTIVATION: '1.0', DONCHIAN_MAX_HOLD_MINUTES: '480' } },
        { name: 'donchian-runner', env: { SOLO_STRATEGY: 'DonchianBreakout', ENABLE_DONCHIAN: 'true', DONCHIAN_ATR_STOP_MULT: '2.0', DONCHIAN_TAKE_PROFIT_PERCENT: '4.0', DONCHIAN_TRAILING_STOP_PERCENT: '1.0', DONCHIAN_TRAILING_ACTIVATION: '1.2', DONCHIAN_MAX_HOLD_MINUTES: '720' } },

        { name: 'tsmom-current', env: { SOLO_STRATEGY: 'TimeSeriesMomentum', ENABLE_TSMOM: 'true' } },
        { name: 'tsmom-fee-tight', env: { SOLO_STRATEGY: 'TimeSeriesMomentum', ENABLE_TSMOM: 'true', TSMOM_MIN_RETURN: '0.004', TSMOM_STOP_LOSS_PERCENT: '-0.8', TSMOM_TAKE_PROFIT_PERCENT: '1.6', TSMOM_TRAILING_STOP_PERCENT: '0.6', TSMOM_TRAILING_ACTIVATION: '0.8', TSMOM_MAX_HOLD_MINUTES: '120' } },
        { name: 'tsmom-balanced', env: { SOLO_STRATEGY: 'TimeSeriesMomentum', ENABLE_TSMOM: 'true', TSMOM_MIN_RETURN: '0.006', TSMOM_STOP_LOSS_PERCENT: '-1.0', TSMOM_TAKE_PROFIT_PERCENT: '2.4', TSMOM_TRAILING_STOP_PERCENT: '0.8', TSMOM_TRAILING_ACTIVATION: '1.0', TSMOM_MAX_HOLD_MINUTES: '180' } },
        { name: 'tsmom-selective', env: { SOLO_STRATEGY: 'TimeSeriesMomentum', ENABLE_TSMOM: 'true', TSMOM_MIN_RETURN: '0.010', TSMOM_STOP_LOSS_PERCENT: '-1.2', TSMOM_TAKE_PROFIT_PERCENT: '3.0', TSMOM_TRAILING_STOP_PERCENT: '1.0', TSMOM_TRAILING_ACTIVATION: '1.2', TSMOM_MAX_HOLD_MINUTES: '240' } },

        { name: 'rsi2mr-current', env: { SOLO_STRATEGY: 'RSI2MeanReversion', ENABLE_RSI2_MR: 'true' } },
        { name: 'rsi2mr-scalp', env: { SOLO_STRATEGY: 'RSI2MeanReversion', ENABLE_RSI2_MR: 'true', RSI2_MR_STOP_LOSS_PERCENT: '-0.6', RSI2_MR_TAKE_PROFIT_PERCENT: '1.0', RSI2_MR_TRAILING_STOP_PERCENT: '0.4', RSI2_MR_TRAILING_ACTIVATION: '0.6', RSI2_MR_MAX_HOLD_MINUTES: '120' } },
        { name: 'rsi2mr-balanced', env: { SOLO_STRATEGY: 'RSI2MeanReversion', ENABLE_RSI2_MR: 'true', RSI2_MR_STOP_LOSS_PERCENT: '-0.8', RSI2_MR_TAKE_PROFIT_PERCENT: '1.4', RSI2_MR_TRAILING_STOP_PERCENT: '0.5', RSI2_MR_TRAILING_ACTIVATION: '0.7', RSI2_MR_MAX_HOLD_MINUTES: '180' } },

        { name: 'propema-current', env: { SOLO_STRATEGY: 'PropSafeEMAPullback', ENABLE_PROPSAFE_EMA: 'true' } },
        { name: 'propema-tight-r', env: { SOLO_STRATEGY: 'PropSafeEMAPullback', ENABLE_PROPSAFE_EMA: 'true', PROPSAFE_EMA_ATR_STOP_MULT: '0.8', PROPSAFE_EMA_TARGET_RR: '2.0', PROPSAFE_EMA_TRAIL_ACTIVATION_R: '1.0', PROPSAFE_EMA_TRAIL_DISTANCE_R: '0.7', PROPSAFE_EMA_MAX_HOLD_MINUTES: '120' } },
        { name: 'propema-balanced-r', env: { SOLO_STRATEGY: 'PropSafeEMAPullback', ENABLE_PROPSAFE_EMA: 'true', PROPSAFE_EMA_ATR_STOP_MULT: '1.0', PROPSAFE_EMA_TARGET_RR: '2.6', PROPSAFE_EMA_TRAIL_ACTIVATION_R: '1.2', PROPSAFE_EMA_TRAIL_DISTANCE_R: '0.8', PROPSAFE_EMA_MAX_HOLD_MINUTES: '180' } },

        { name: 'emaretest-current', env: { SOLO_STRATEGY: 'EMATrendRetest', ENABLE_EMA_TREND_RETEST: 'true' } },
        { name: 'emaretest-tight-r', env: { SOLO_STRATEGY: 'EMATrendRetest', ENABLE_EMA_TREND_RETEST: 'true', EMA_TREND_RETEST_ATR_STOP_MULT: '0.8', EMA_TREND_RETEST_TARGET_RR: '2.0', EMA_TREND_RETEST_TRAIL_ACTIVATION_R: '1.0', EMA_TREND_RETEST_TRAIL_DISTANCE_R: '0.7', EMA_TREND_RETEST_MAX_HOLD_MINUTES: '120' } },
        { name: 'emaretest-balanced-r', env: { SOLO_STRATEGY: 'EMATrendRetest', ENABLE_EMA_TREND_RETEST: 'true', EMA_TREND_RETEST_ATR_STOP_MULT: '1.0', EMA_TREND_RETEST_TARGET_RR: '2.6', EMA_TREND_RETEST_TRAIL_ACTIVATION_R: '1.2', EMA_TREND_RETEST_TRAIL_DISTANCE_R: '0.8', EMA_TREND_RETEST_MAX_HOLD_MINUTES: '180' } },
      ],
    },
    rsiSweep: {
      buyBelowLevels: [25, 30, 35, 40],
      exitAboveLevels: [45, 50, 55, 60],
      minSpread: 10,
    },
    gauntlet: {
      atrValues: [0, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40],
    },
  }),

  // =========================================================================
  // MATRIX SWEEP RUNNER CONFIG
  // =========================================================================
  matrixSweep: deepFreezePlain({
    defaultData: 'tuning/alpaca-tsla-15m-2y.json',
    dataShortcuts: {
      tsla: 'tuning/alpaca-tsla-15m-2y.json',
      'tsla-train': 'tuning/tsla-15m-train.json',
      'tsla-test': 'tuning/tsla-15m-test.json',
      'tsla-unseen': 'tuning/tsla-15m-unseen.json',
      spy: 'tuning/alpaca-spy-15m-2y.json',
      qqq: 'tuning/alpaca-qqq-15m-2y.json',
      nvda: 'tuning/alpaca-nvda-15m-2y.json',
      riot: 'tuning/alpaca-riot-15m-2y.json',
      mara: 'tuning/alpaca-mara-15m-2y.json',
      coin: 'tuning/alpaca-coin-15m-2y.json',
      btc: 'data/polygon-btc-1y.json',
    },
    stockTickers: [
      'tsla',
      'spy',
      'qqq',
      'nvda',
      'riot',
      'mara',
      'coin',
      'tsla-train',
      'tsla-test',
      'tsla-unseen',
    ],
    validatedStrategies: [
      'RSI',
      'EMASMACrossover',
      'MADynamicSR',
      'LiquiditySweep',
      'SmartMoneySweep',
    ],
    exploratoryStrategies: [
      'OGZTPO',
      'OpeningRangeBreakout',
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'DonchianBreakout',
      'PropSafeEMAPullback',
      'EMATrendRetest',
      'RSI2MeanReversion',
      'TimeSeriesMomentum',
    ],
    grid: {
      full: {
        stopLoss: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0, 3.5, 4.0, 5.0],
        tierPresets: [
          { t1: 0.005, t2: 0.010, t3: 0.015, label: 'tight' },
          { t1: 0.007, t2: 0.010, t3: 0.015, label: 'default' },
          { t1: 0.010, t2: 0.015, t3: 0.020, label: 'wide' },
          { t1: 0.015, t2: 0.020, t3: 0.030, label: 'ultra-wide' },
        ],
        confidence: [0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75],
      },
      quick: {
        stopLoss: [0.5, 0.8, 1.5],
        tierPresets: [
          { t1: 0.005, t2: 0.010, t3: 0.015, label: 'tight' },
          { t1: 0.007, t2: 0.010, t3: 0.015, label: 'default' },
          { t1: 0.010, t2: 0.015, t3: 0.020, label: 'wide' },
        ],
        confidence: [0.40, 0.55, 0.70],
      },
      exits: {
        stopLoss: [0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0],
        tierGrid: [0.005, 0.0075, 0.010, 0.0125, 0.015, 0.0175, 0.020, 0.0225, 0.025, 0.0275],
        confidence: [0.60],
      },
      conf: {
        stopLoss: null,
        tierPresets: null,
        confidence: [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80],
        globalParams: {
          'orchestrator.mtfConfluenceService.minReadyTimeframes': [2, 3],
        },
        strategyParams: {
          PropSafeEMAPullback: {
            'strategies.PropSafeEMAPullback.pullbackLookbackBars': [3, 5, 8],
          },
          NoWickImbalance: {
            'strategies.NoWickImbalance.entryMode': ['tap', 'rejection'],
            'strategies.NoWickImbalance.targetRR': [1.0, 1.5, 2.0],
          },
          SmartMoneySweep: {
            'strategies.SmartMoneySweep.minConditionsGate': [0, 1, 2, 3],
            'strategies.SmartMoneySweep.confidenceMode': ['tiered', 'continuous'],
          },
          OpeningRangeBreakout: {
            'strategies.OpeningRangeBreakout.orDurationMinutes': [5, 15, 30],
            'strategies.OpeningRangeBreakout.orMinWidthAtr': [0, 0.5, 1.0],
          },
        },
      },
    },
  }),

  // =========================================================================
  // TUNING PROFILES (single source for backtest/runtime profile tunables)
  // =========================================================================
  tuningProfiles: buildTuningProfilesConfig(),

  // =========================================================================
  // FEATURE FLAGS
  // =========================================================================
  features: {
    enableDynamicSizing: envBool('ENABLE_DYNAMIC_SIZING', true),
    enableVolatilityScaling: envBool('ENABLE_VOLATILITY_SCALING', true),
    enableLearning: envBool('ENABLE_LEARNING', true),
    enableArbitrage: envBool('ENABLE_ARBITRAGE', true),
    enableHedging: envBool('ENABLE_HEDGING', true),
    enableShorts: requiredConfiguredBool('features.enableShorts'),
  },

  // =========================================================================
  // PIPELINE TOGGLES - Component enable/disable for testing
  // =========================================================================
  pipeline: {
    // Strategy toggles
    enableRSI: requiredConfiguredBool('pipeline.enableRSI'),
    enableMADynamicSR: requiredConfiguredBool('pipeline.enableMADynamicSR'),
    enableEMACrossover: requiredConfiguredBool('pipeline.enableEMACrossover'),
    enableLiquiditySweep: requiredConfiguredBool('pipeline.enableLiquiditySweep'),
    enableCandlePattern: requiredConfiguredBool('pipeline.enableCandlePattern'),
    enableBreakRetest: requiredConfiguredBool('pipeline.enableBreakRetest'),
    enableMarketRegime: requiredConfiguredBool('pipeline.enableMarketRegime'),
    enableOGZTPO: requiredConfiguredBool('pipeline.enableOGZTPO'),
    enableOpeningRangeBreakout: requiredConfiguredBool('pipeline.enableOpeningRangeBreakout'),
    enableSmartMoneySweep: requiredConfiguredBool('pipeline.enableSmartMoneySweep'),
    enableNoWickImbalance: requiredConfiguredBool('pipeline.enableNoWickImbalance'),
    enableDonchianBreakout: requiredConfiguredBool('pipeline.enableDonchianBreakout'),
    enablePropSafeEMAPullback: requiredConfiguredBool('pipeline.enablePropSafeEMAPullback'),
    enableEMATrendRetest: requiredConfiguredBool('pipeline.enableEMATrendRetest'),
    enableRSI2MeanReversion: requiredConfiguredBool('pipeline.enableRSI2MeanReversion'),
    enableTimeSeriesMomentum: requiredConfiguredBool('pipeline.enableTimeSeriesMomentum'),

    // Component toggles
    enableRiskManager: envBool('ENABLE_RISK', true),
    enableTRAI: envBool('ENABLE_TRAI', true),
    traiEnableBacktest: envBool('TRAI_ENABLE_BACKTEST', true),  // Skip TRAI in backtest if false
    enableDashboard: envBool('ENABLE_DASHBOARD', true),
    enableNotifications: envBool('ENABLE_NOTIFICATIONS', true),

    // Execution mode: 'live' | 'paper' | 'backtest'
    executionMode: configuredValue('pipeline.executionMode'),

    // Candle source: 'live' | 'file'
    candleSource: env('CANDLE_SOURCE', 'live'),
    candleFile: env('CANDLE_FILE', 'tuning/full-45k.json'),

    // Direction filter: 'long_only' | 'both'
    directionFilter: configuredValue('pipeline.directionFilter'),

    // Position mode: 'single' | 'multi'
    positionMode: env('POSITION_MODE', 'single'),
  },

  // =========================================================================
  // FUND TARGET
  // =========================================================================
  fundTarget: env('FUND_TARGET', 25000),
  startingBalance: env('STARTING_BALANCE', 10000),
  feeProfiles: buildFeeProfilesConfig(),
};

// =============================================================================
// RUNTIME STATE
// =============================================================================

let activeOverrides = {};
let configFrozen = false;
let activeTuningProfile = null;
let activeTuningProfileAppliedAt = null;
let activeTuningProfileSource = null;
let activeTuningProfileOverridePaths = new Set();

function isJestRuntime() {
  return process.env.JEST_WORKER_ID !== undefined;
}

function isFileBackedBacktestContext(options = {}) {
  return options.isBacktest === true &&
    String(options.executionMode || '').toLowerCase() === 'backtest' &&
    String(options.candleSource || '').toLowerCase() === 'file' &&
    options.liveTrading !== true;
}

function isValidatedBacktestOverrideContext(options = {}) {
  return options.source === 'BacktestConfigOverrides' &&
    isFileBackedBacktestContext(options);
}

function assertJestOverrideMutationAllowed() {
  if (isJestRuntime()) return;

  throw new Error(
    '[ConfigLoader] setOverrides() is test-only; use BacktestConfigOverrides for file-backed backtest tuning'
  );
}

function assertBacktestOverrideMutationAllowed(options = {}) {
  if (isValidatedBacktestOverrideContext(options)) return;

  throw new Error(
    '[ConfigLoader] applyBacktestConfigOverrides() requires validated file-backed EXECUTION_MODE=backtest identity'
  );
}

function assertTuningProfileMutationAllowed(options = {}) {
  if (isJestRuntime()) return;
  if (isFileBackedBacktestContext(options)) return;

  throw new Error(
    '[ConfigLoader] applyTuningProfile() requires file-backed EXECUTION_MODE=backtest identity'
  );
}

function isLiveRuntimeEnv() {
  if (_cached?.config?.mode) {
    return _cached.config.mode.liveTrading === true;
  }
  return resolveLaunchProfile(process.env).mode === 'live';
}

function assertLiveConfidenceOverrideAllowed(flatOverrides, source) {
  if (!isLiveRuntimeEnv()) return;
  if (!Object.prototype.hasOwnProperty.call(flatOverrides, 'confidence.minTradeConfidence')) return;

  const expected = requiredConfigNumber('confidence.minTradeConfidence');
  const actual = flatOverrides['confidence.minTradeConfidence'];
  if (!Number.isFinite(actual) || actual !== expected) {
    throw new Error(
      `[ConfigLoader] Live runtime refuses ${source} override for confidence.minTradeConfidence: ` +
      `expected configured floor ${expected}, got ${actual}`
    );
  }
}

function normalizeTuningProfileName(profileName) {
  const fallback = BASE_CONFIG.tuningProfiles.defaultProfile;
  return String(profileName || fallback).trim();
}

function getTuningProfileDefinitions() {
  return BASE_CONFIG.tuningProfiles.definitions;
}

function normalizeFeeProfileName(profileName) {
  return String(profileName || '').trim();
}

function getFeeProfileDefinitions() {
  return BASE_CONFIG.feeProfiles.definitions;
}

function coerceProfileEnvValue(envKey, rawValue) {
  if (PROFILE_BOOLEAN_ENV_KEYS.has(envKey)) {
    if (rawValue === true || rawValue === false) return rawValue;
    const normalized = String(rawValue).trim();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    throw new Error(`[ConfigLoader] Tuning profile env key ${envKey} requires a boolean value; got '${rawValue}'`);
  }

  if (PROFILE_STRING_ENV_KEYS.has(envKey)) {
    const value = String(rawValue || '').trim();
    if (!value) {
      throw new Error(`[ConfigLoader] Tuning profile env key ${envKey} requires a non-empty string`);
    }
    return value;
  }

  if (PROFILE_LIST_ENV_KEYS.has(envKey)) {
    const values = String(rawValue || '').split(',').map(item => item.trim()).filter(Boolean);
    if (values.length === 0) {
      throw new Error(`[ConfigLoader] Tuning profile env key ${envKey} requires a comma-separated list`);
    }
    return values;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`[ConfigLoader] Tuning profile env key ${envKey} requires a finite numeric value; got '${rawValue}'`);
  }
  return value;
}

function flattenProfileOverrides(profile) {
  const overrides = {};
  for (const [envKey, rawValue] of Object.entries(profile.env)) {
    const configPaths = PROFILE_ENV_CONFIG_PATHS[envKey];
    if (!configPaths) {
      throw new Error(`[ConfigLoader] Tuning profile '${profile.name}' has unmapped env key '${envKey}'`);
    }

    const value = coerceProfileEnvValue(envKey, rawValue);
    for (const configPath of configPaths) {
      overrides[configPath] = value;
    }
  }
  return overrides;
}

function captureOverrideSnapshot(paths) {
  const snapshot = {};
  for (const path of paths) {
    snapshot[path] = Object.prototype.hasOwnProperty.call(activeOverrides, path)
      ? activeOverrides[path]
      : PROFILE_SNAPSHOT_MISSING;
  }
  return snapshot;
}

function restoreOverrideSnapshot(snapshot) {
  const nextOverrides = { ...activeOverrides };
  for (const [path, value] of Object.entries(snapshot)) {
    if (value === PROFILE_SNAPSHOT_MISSING) {
      delete nextOverrides[path];
    } else {
      nextOverrides[path] = value;
    }
  }
  activeOverrides = nextOverrides;
}

function assertFlatProfileState(flatState) {
  if (typeof flatState === 'function') {
    return assertFlatProfileState(flatState());
  }

  if (flatState === true) {
    return { flat: true };
  }

  if (!flatState || typeof flatState !== 'object') {
    throw new Error('[ConfigLoader] Flat-state tuning profile apply requires an explicit flatState probe result');
  }

  if (flatState.flat !== true) {
    const reason = flatState.reason || 'state_not_flat';
    throw new Error(`[ConfigLoader] Refusing tuning profile apply while state is not flat: ${reason}`);
  }

  return flatState;
}

// =============================================================================
// TRADING CONFIG CLASS
// =============================================================================

class ConfigLoader {
  /**
   * Get a config value by path (e.g., 'confidence.minTradeConfidence')
   * Overrides take precedence over base config
   */
  static get(path, defaultValue = undefined) {
    // Check overrides first
    if (activeOverrides[path] !== undefined) {
      return activeOverrides[path];
    }

    if (!path.includes('.') && path === 'pipeline') {
      return ConfigLoader.getSection(path);
    }

    const configLoaderValue = readConfigLoaderRuntimeValue(path);
    if (configLoaderValue !== CONFIG_LOADER_MISSING) {
      return applyActiveChildOverrides(path, configLoaderValue);
    }

    if (_cached && _cached.config) {
      const cachedValue = readObjectPath(_cached.config, path);
      if (cachedValue !== undefined) {
        return applyActiveChildOverrides(path, cachedValue);
      }
    }

    if (!path.includes('.')) {
      const section = BASE_CONFIG[path];
      if (section && typeof section === 'object' && !Array.isArray(section)) {
        warnBaseConfigCompatibilityFallback(path);
        return ConfigLoader.getSection(path);
      }
    }

    // Navigate nested path
    const parts = path.split('.');
    let value = BASE_CONFIG;

    for (const part of parts) {
      if (value === undefined || value === null) {
        return defaultValue;
      }
      value = value[part];
    }

    if (value !== undefined) {
      warnBaseConfigCompatibilityFallback(path);
      return applyActiveChildOverrides(path, value);
    }
    return defaultValue;
  }

  /**
   * Get entire section (e.g., 'confidence', 'exits', 'exitContracts')
   */
  static getSection(section) {
    const base = BASE_CONFIG[section];
    const hasConfigLoaderOwnedPaths = Object.keys(CONFIG_LOADER_RUNTIME_PATHS)
      .some(path => path.startsWith(`${section}.`));
    if (!base && !hasConfigLoaderOwnedPaths) return undefined;
    if (base) warnBaseConfigCompatibilityFallback(section);

    // Merge any overrides for this section
    const result = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
    applyConfigLoaderSectionValues(section, result);
    for (const [key, val] of Object.entries(activeOverrides)) {
      if (key.startsWith(`${section}.`)) {
        const subKey = key.slice(section.length + 1);
        setObjectPath(result, subKey, val);
      }
    }

    return result;
  }

  /**
   * Get exit contract for a strategy
   */
  static getExitContract(strategyName) {
    const contracts = BASE_CONFIG.exitContracts;
    return contracts[strategyName] || contracts.default;
  }

  /**
   * Get timeframe-specific config
   */
  static getTimeframeConfig(timeframe) {
    const normalizedTimeframe = typeof timeframe === 'string' ? timeframe.trim() : '';
    if (!normalizedTimeframe) {
      throw new Error(`[ConfigLoader] timeframeConfig lookup requires a non-empty timeframe (got ${timeframe})`);
    }

    const baseFrame = BASE_CONFIG.timeframeConfig[normalizedTimeframe];
    const config = baseFrame && typeof baseFrame === 'object' && !Array.isArray(baseFrame)
      ? { ...baseFrame }
      : {};
    const overridePrefix = `timeframeConfig.${normalizedTimeframe}.`;
    let hasOverride = false;
    for (const [path, value] of Object.entries(activeOverrides)) {
      if (!path.startsWith(overridePrefix)) continue;
      const field = path.slice(overridePrefix.length);
      if (!field) continue;
      config[field] = value;
      hasOverride = true;
    }

    if (!baseFrame && !hasOverride) {
      throw new Error(`[ConfigLoader] Unknown timeframeConfig '${normalizedTimeframe}'; refusing 15m fallback`);
    }

    for (const field of ['trailPct', 'maxHoldMin', 'slPct', 'tpPct']) {
      const numeric = Number(config[field]);
      if (!Number.isFinite(numeric)) {
        throw new Error(`[ConfigLoader] timeframeConfig.${normalizedTimeframe}.${field} must be finite (got ${config[field]})`);
      }
      config[field] = numeric;
    }

    return config;
  }

  /**
   * Get regime multipliers
   */
  static getRegimeMultipliers(regime) {
    return BASE_CONFIG.regimeMultipliers[regime] || { slMultiplier: 1.0, tpMultiplier: 1.0 };
  }

  /**
   * Get trading profile
   */
  static getProfile(profileName) {
    const normalized = typeof profileName === 'string' ? profileName.trim() : '';
    const profile = normalized ? BASE_CONFIG.profiles[normalized] : undefined;

    if (!profile) {
      throw new Error(
        `[ConfigLoader] Unknown trading profile '${profileName}'. Available: ${Object.keys(BASE_CONFIG.profiles).join(', ')}`
      );
    }

    return profile;
  }

  static listTuningProfileNames() {
    return Object.keys(getTuningProfileDefinitions());
  }

  static resolveTuningProfile(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const normalized = normalizeTuningProfileName(profileName);
    const profile = getTuningProfileDefinitions()[normalized];
    if (!profile) {
      throw new Error(`[ConfigLoader] Unknown tuning profile '${normalized}'. Available: ${this.listTuningProfileNames().join(', ')}`);
    }
    return deepFreezePlain(clonePlain(profile));
  }

  static summarizeTuningProfile(profileOrName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = typeof profileOrName === 'string' || !profileOrName
      ? this.resolveTuningProfile(profileOrName)
      : this.resolveTuningProfile(profileOrName.name);

    return {
      name: profile.name,
      description: profile.description,
      evidence: [...profile.evidence],
      env: { ...profile.env },
      configPaths: this.getTuningProfileConfigPaths(profile.name),
      runtimeSnapshotEnvKeys: this.getTuningProfileRuntimeSnapshotKeys(profile.name),
    };
  }

  static getTuningProfileDefinitions() {
    return deepFreezePlain(clonePlain(getTuningProfileDefinitions()));
  }

  static listFeeProfileNames() {
    return Object.keys(getFeeProfileDefinitions());
  }

  static resolveFeeProfile(profileName) {
    const normalized = normalizeFeeProfileName(profileName);
    if (!normalized) {
      throw new Error(`[ConfigLoader] Missing fee profile. Pass an explicit fee profile (${this.listFeeProfileNames().join(', ')})`);
    }
    const profile = getFeeProfileDefinitions()[normalized];
    if (!profile) {
      throw new Error(`[ConfigLoader] Unknown fee profile '${normalized}'. Available: ${this.listFeeProfileNames().join(', ')}`);
    }
    return deepFreezePlain(clonePlain(profile));
  }

  static summarizeFeeProfile(profileOrName) {
    const profile = typeof profileOrName === 'string' || !profileOrName
      ? this.resolveFeeProfile(profileOrName)
      : this.resolveFeeProfile(profileOrName.name);
    return {
      name: profile.name,
      description: profile.description,
      env: { ...profile.env },
    };
  }

  static getBacktestWorkerEnvDefaults() {
    return Object.freeze({ ...BASE_CONFIG.backtestWorkerEnv.canonical });
  }

  static getBacktestStockZeroFeeEnv() {
    return Object.freeze({ ...BASE_CONFIG.backtestWorkerEnv.stockZeroFee });
  }

  static getParallelBacktestConfig() {
    return deepFreezePlain(clonePlain(BASE_CONFIG.parallelBacktest));
  }

  static getMatrixSweepConfig() {
    return deepFreezePlain(clonePlain(BASE_CONFIG.matrixSweep));
  }

  static getTuningProfileConfigPaths(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = this.resolveTuningProfile(profileName);
    return Object.freeze([
      ...new Set(Object.keys(flattenProfileOverrides(profile)).sort()),
    ]);
  }

  static getTuningProfileRuntimeSnapshotKeys(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = this.resolveTuningProfile(profileName);
    return Object.freeze(
      Object.keys(profile.env)
        .filter(key => PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS.has(key))
        .sort()
    );
  }

  static buildTuningProfileOverrides(profileName = BASE_CONFIG.tuningProfiles.defaultProfile) {
    const profile = this.resolveTuningProfile(profileName);
    return Object.freeze({ ...flattenProfileOverrides(profile) });
  }

  static getTuningProfileStatus() {
    return {
      activeProfile: activeTuningProfile,
      activeProfileAppliedAt: activeTuningProfileAppliedAt,
      activeProfileSource: activeTuningProfileSource,
      profiles: this.listTuningProfileNames(),
      profileOverrideCount: activeTuningProfileOverridePaths.size,
    };
  }

  static applyTuningProfile(profileName = BASE_CONFIG.tuningProfiles.defaultProfile, options = {}) {
    if (configFrozen) {
      throw new Error('[ConfigLoader] Config is frozen; refusing tuning profile apply');
    }
    assertTuningProfileMutationAllowed(options);

    const {
      requireFlat = false,
      flatState,
      phase = 'startup',
      replaceActiveProfile = false,
      source = 'unknown',
    } = options;

    let flatStateVerified = false;
    if (requireFlat) {
      assertFlatProfileState(flatState);
      flatStateVerified = true;
    }

    const profile = this.resolveTuningProfile(profileName);
    if (activeTuningProfile && activeTuningProfile !== profile.name && !replaceActiveProfile) {
      throw new Error(
        `[ConfigLoader] Tuning profile '${profile.name}' cannot replace active profile '${activeTuningProfile}' without replaceActiveProfile=true and flat-state proof`
      );
    }

    const runtimeSnapshotKeys = this.getTuningProfileRuntimeSnapshotKeys(profile.name);
    if (phase !== 'startup' && runtimeSnapshotKeys.length > 0) {
      throw new Error(
        `[ConfigLoader] Tuning profile '${profile.name}' includes startup-snapshot key(s) ${runtimeSnapshotKeys.join(', ')}; ` +
        `phase '${phase}' would not update constructed runtime objects`
      );
    }

    const overrides = this.buildTuningProfileOverrides(profile.name);
    const paths = Object.keys(overrides);
    assertLiveConfidenceOverrideAllowed(overrides, `tuning profile '${profile.name}'`);
    assertConfigLoaderOwnedPathsNotOverridden(overrides, `tuning profile '${profile.name}'`);
    const previousProfilePaths = replaceActiveProfile
      ? Array.from(activeTuningProfileOverridePaths)
      : [];
    const replaceSnapshotPaths = [
      ...new Set([...previousProfilePaths, ...paths]),
    ];
    const snapshot = captureOverrideSnapshot(replaceSnapshotPaths);
    const conflicts = [];

    for (const path of paths) {
      if (!Object.prototype.hasOwnProperty.call(activeOverrides, path)) continue;
      if (sameConfigValue(activeOverrides[path], overrides[path])) continue;
      conflicts.push(`${path}: active=${activeOverrides[path]} profile=${overrides[path]}`);
    }

    if (conflicts.length > 0 && !replaceActiveProfile) {
      throw new Error(
        `[ConfigLoader] Tuning profile '${profile.name}' would overwrite active config path(s): ${conflicts.join('; ')}. ` +
        'Pass replaceActiveProfile=true only after proving state is flat and the caller intends a profile swap.'
      );
    }

    if (conflicts.length > 0 && replaceActiveProfile) {
      if (!flatStateVerified) {
        assertFlatProfileState(flatState);
        flatStateVerified = true;
      }
    }

    if (replaceActiveProfile && !flatStateVerified) {
      assertFlatProfileState(flatState);
    }

    const nextOverrides = { ...activeOverrides };
    if (replaceActiveProfile) {
      for (const path of previousProfilePaths) {
        delete nextOverrides[path];
      }
    }
    const previousProfile = activeTuningProfile;
    const previousAppliedAt = activeTuningProfileAppliedAt;
    const previousSource = activeTuningProfileSource;
    const previousOverridePaths = new Set(activeTuningProfileOverridePaths);

    activeOverrides = {
      ...nextOverrides,
      ...overrides,
    };
    activeTuningProfile = profile.name;
    activeTuningProfileAppliedAt = new Date().toISOString();
    activeTuningProfileSource = source;
    activeTuningProfileOverridePaths = new Set(paths);

    try {
      for (const [path, expected] of Object.entries(overrides)) {
        const actual = this.get(path);
        if (!sameConfigValue(actual, expected)) {
          throw new Error(
            `[ConfigLoader] Tuning profile '${profile.name}' verification failed for ${path}: expected ${expected}, got ${actual}`
          );
        }
      }
    } catch (err) {
      restoreOverrideSnapshot(snapshot);
      activeTuningProfile = previousProfile;
      activeTuningProfileAppliedAt = previousAppliedAt;
      activeTuningProfileSource = previousSource;
      activeTuningProfileOverridePaths = previousOverridePaths;
      throw err;
    }

    return {
      profile: profile.name,
      source,
      phase,
      appliedAt: activeTuningProfileAppliedAt,
      overrideCount: paths.length,
      configPaths: paths.sort(),
      runtimeSnapshotEnvKeys: runtimeSnapshotKeys,
    };
  }

  static async runWithTuningProfile(profileName, callback, options = {}) {
    if (typeof callback !== 'function') {
      throw new Error('[ConfigLoader] runWithTuningProfile requires a callback');
    }

    const profile = this.resolveTuningProfile(profileName);
    const overrides = this.buildTuningProfileOverrides(profile.name);
    const paths = Object.keys(overrides);
    const snapshot = captureOverrideSnapshot([
      ...new Set([...Array.from(activeTuningProfileOverridePaths), ...paths]),
    ]);
    const previousProfile = activeTuningProfile;
    const previousAppliedAt = activeTuningProfileAppliedAt;
    const previousSource = activeTuningProfileSource;
    const previousOverridePaths = new Set(activeTuningProfileOverridePaths);

    this.applyTuningProfile(profile.name, {
      ...options,
      replaceActiveProfile: true,
    });

    try {
      return await callback(this.getTuningProfileStatus());
    } finally {
      restoreOverrideSnapshot(snapshot);
      activeTuningProfile = previousProfile;
      activeTuningProfileAppliedAt = previousAppliedAt;
      activeTuningProfileSource = previousSource;
      activeTuningProfileOverridePaths = previousOverridePaths;
    }
  }

  static applyOverrideMap(overrides, source, options = {}) {
    if (configFrozen) {
      throw new Error(`[ConfigLoader] Config is frozen; refusing ${source}`);
    }

    // Flatten nested objects to dot notation
    const flatten = (obj, prefix = '') => {
      const result = {};
      for (const [key, val] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          Object.assign(result, flatten(val, fullKey));
        } else {
          result[fullKey] = val;
        }
      }
      return result;
    };

    const flatOverrides = flatten(overrides);
    assertLiveConfidenceOverrideAllowed(flatOverrides, source);
    assertConfigLoaderOwnedPathsNotOverridden(flatOverrides, source, options);
    activeOverrides = { ...activeOverrides, ...flatOverrides };
    for (const path of Object.keys(flatOverrides)) {
      activeTuningProfileOverridePaths.delete(path);
    }

    console.log(`[ConfigLoader] Overrides set: ${Object.keys(flatOverrides).join(', ')}`);
  }

  static applyBacktestConfigOverrides(overrides, options = {}) {
    assertBacktestOverrideMutationAllowed(options);
    ConfigLoader.applyOverrideMap(overrides, 'applyBacktestConfigOverrides', options);
  }

  /**
   * Jest-only helper for focused tests. Runtime backtest overrides must enter
   * through core/BacktestConfigOverrides so the allowlist and mode cage stay
   * in one place.
   */
  static setOverrides(overrides) {
    assertJestOverrideMutationAllowed();
    ConfigLoader.applyOverrideMap(overrides, 'setOverrides');
  }

  /**
   * Clear all overrides (restore to base config)
   */
  static clearOverrides() {
    activeOverrides = {};
    activeTuningProfile = null;
    activeTuningProfileAppliedAt = null;
    activeTuningProfileSource = null;
    activeTuningProfileOverridePaths = new Set();
    console.log('[ConfigLoader] Overrides cleared');
  }

  /**
   * Freeze config (prevent further overrides - use in production)
   */
  static freeze() {
    configFrozen = true;
    console.log('[ConfigLoader] Config frozen');
  }

  /**
   * Unfreeze config (allow overrides again)
   */
  static unfreeze() {
    configFrozen = false;
    console.log('[ConfigLoader] Config unfrozen');
  }

  /**
   * Get all current config (base + overrides merged)
   */
  static getAll() {
    const result = JSON.parse(JSON.stringify(BASE_CONFIG));

    // Apply overrides
    for (const [path, val] of Object.entries(activeOverrides)) {
      const parts = path.split('.');
      let target = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]]) target[parts[i]] = {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = val;
    }

    return result;
  }

  /**
   * Print current config summary (for debugging)
   */
  static printSummary() {
    const conf = this.getSection('confidence');
    const risk = this.getSection('risk');
    const pos = this.getSection('positionSizing');
    const exits = this.getSection('exits');
    const fees = this.getSection('fees');

    console.log('\n=== TRADING CONFIG SUMMARY ===');
    // Confidence/risk/position are decimal form (0.50 = 50%), multiply by 100
    console.log(`Min Trade Confidence: ${(conf.minTradeConfidence * 100).toFixed(1)}%`);
    console.log(`Max Risk Per Trade:   ${(risk.maxRiskPerTrade * 100).toFixed(1)}%`);
    console.log(`Base Position Size:   ${(pos.basePositionSize * 100).toFixed(1)}%`);
    console.log(`Max Position Size:    ${(pos.maxPositionSize * 100).toFixed(1)}%`);
    // Exits are already in percent form (1.5 = 1.5%), no multiplication needed
    console.log(`Stop Loss:            ${exits.stopLossPercent.toFixed(2)}%`);
    console.log(`Take Profit:          ${exits.takeProfitPercent.toFixed(2)}%`);
    console.log(`Trailing Stop:        ${exits.trailingStopPercent.toFixed(2)}%`);
    console.log(`Round-trip Fees:      ${(fees.totalRoundTrip * 100).toFixed(2)}%`);
    console.log(`Active Overrides:     ${Object.keys(activeOverrides).length}`);
    console.log('==============================\n');
  }

  /**
   * Validate config (check for obviously bad values)
   */
  static validate() {
    const errors = [];

    const conf = this.getSection('confidence');
    const exits = this.getSection('exits');
    const pos = this.getSection('positionSizing');

    // Confidence checks
    if (conf.minTradeConfidence < 0.1) {
      errors.push(`minTradeConfidence too low (${conf.minTradeConfidence}) - likely to enter bad trades`);
    }
    if (conf.minTradeConfidence > 0.9) {
      errors.push(`minTradeConfidence too high (${conf.minTradeConfidence}) - will rarely trade`);
    }

    // Exit checks
    if (Math.abs(exits.stopLossPercent) > Math.abs(exits.takeProfitPercent)) {
      errors.push(`SL (${exits.stopLossPercent}) is wider than TP (${exits.takeProfitPercent}) - negative R:R`);
    }

    // Position sizing checks
    if (pos.maxPositionSize > 0.25) {
      errors.push(`maxPositionSize (${pos.maxPositionSize}) > 25% - very high risk`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDATED CONFIG PROTECTION - SCREAM IF LOCKED VALUES CHANGED
    // ═══════════════════════════════════════════════════════════════════════
    const rsi = BASE_CONFIG.exitContracts.RSI;
    if (rsi._validated) {
      const lockedValues = { sl: -0.8, tp: 1.0, conf: 0.60 };
      if (rsi.stopLossPercent !== lockedValues.sl) {
        console.error('\nRSI STOP LOSS CHANGED FROM VALIDATED VALUE');
        console.error(`   Expected: ${lockedValues.sl}%, Got: ${rsi.stopLossPercent}%`);
        console.error('   This config was walk-forward validated on 2026-03-20');
        console.error('   RE-VALIDATE BEFORE DEPLOYING\n');
      }
      if (rsi.takeProfitPercent !== lockedValues.tp) {
        console.error('\nRSI TAKE PROFIT CHANGED FROM VALIDATED VALUE');
        console.error(`   Expected: ${lockedValues.tp}%, Got: ${rsi.takeProfitPercent}%`);
        console.error('   This config was walk-forward validated on 2026-03-20');
        console.error('   RE-VALIDATE BEFORE DEPLOYING\n');
      }
      if (rsi.minConfidence !== lockedValues.conf) {
        console.error('\nRSI MIN CONFIDENCE CHANGED FROM VALIDATED VALUE');
        console.error(`   Expected: ${lockedValues.conf}, Got: ${rsi.minConfidence}`);
        console.error('   This config was walk-forward validated on 2026-03-20');
        console.error('   RE-VALIDATE BEFORE DEPLOYING\n');
      }
    }

    if (errors.length > 0) {
      console.warn('\nTRADING CONFIG VALIDATION WARNINGS:');
      errors.forEach(e => console.warn(`   - ${e}`));
      console.warn('');
    }

    return errors;
  }
}


  return Object.assign(ConfigLoader, {
    BASE_CONFIG,
    envNumber,
    getConfigFileValue,
    DEFAULT_TUNING_PROFILE: BASE_CONFIG.tuningProfiles.defaultProfile,
    PROFILE_FORBIDDEN_ENV_KEYS,
    PROFILE_ENV_CONFIG_PATHS,
    PROFILE_RUNTIME_SNAPSHOT_ENV_KEYS,
    MIN_CONFIDENCE: () => ConfigLoader.get('confidence.minTradeConfidence'),
    MAX_RISK: () => ConfigLoader.get('risk.maxRiskPerTrade'),
    FEES_ROUND_TRIP: () => ConfigLoader.get('fees.totalRoundTrip'),
  });
})();

module.exports = Object.assign(configCompatibility, {
  load,
  getSource,
  hasLoadedSnapshot,
  getCachedSnapshot,
  fingerprint,
  snapshot,
  validate,
  _resetForTest,
  validateLegacy: configCompatibility.validate.bind(configCompatibility),
});
