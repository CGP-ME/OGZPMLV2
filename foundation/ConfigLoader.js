/**
 * ConfigLoader.js - Single Source of Truth for ALL Configuration
 * ==============================================================
 * 
 * CONTRACT:
 * 1. settings.json owns customer/trading settings
 * 2. internals.json owns implementation constants
 * 3. .env is privately parsed for credentials; inherited env is limited to bootstrap inputs
 * 4. Each process receives an applicable, frozen, source-tracked role snapshot
 * 5. Backtest descriptors are applied before validation, fingerprinting, and freeze
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
const { writeJsonAtomic } = require('../core/AtomicWrite');
const SETTINGS_PATH = path.resolve(__dirname, '../config/settings.json');
const INTERNALS_PATH = path.resolve(__dirname, '../config/internals.json');
let settingsConfigFile = null;
let internalsConfigFile = null;

function readCanonicalJson(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`[ConfigLoader] Unable to read ${label}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[ConfigLoader] ${label} must contain a JSON object`);
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error(`[ConfigLoader] ${label} schemaVersion must be 1`);
  }
  if (!Number.isInteger(parsed.revision) || parsed.revision < 1) {
    throw new Error(`[ConfigLoader] ${label} revision must be a positive integer`);
  }
  return parsed;
}

function loadCanonicalFiles() {
  const settings = readCanonicalJson(SETTINGS_PATH, 'config/settings.json');
  const internals = readCanonicalJson(INTERNALS_PATH, 'config/internals.json');
  settingsConfigFile = settings;
  internalsConfigFile = internals;
  return { settings: settingsConfigFile, internals: internalsConfigFile };
}

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
  ), settingsConfigFile);
  if (!Number.isFinite(value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath} must be a finite number`);
  }
  return value;
}

function requiredConfiguredString(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), settingsConfigFile);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath} must be a non-empty string`);
  }
  return value;
}

function requiredConfiguredPlainObject(configPath) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), settingsConfigFile);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath} must be an object`);
  }
  return cloneConfiguredObject(value);
}

function requiredConfluenceBoostConfig(strategyName) {
  const configPath = `strategies.${strategyName}.confluenceBoost`;
  const value = requiredConfiguredPlainObject(configPath);
  if (typeof value.enabled !== 'boolean') {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath}.enabled must be a boolean`);
  }
  if (!Number.isFinite(value.weight) || value.weight < 0) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath}.weight must be a finite non-negative number`);
  }
  return value;
}

function requiredRsiRegimeMaFilterConfig() {
  const configPath = 'strategies.RSI.regimeMaFilter';
  const value = requiredConfiguredPlainObject(configPath);
  if (typeof value.enabled !== 'boolean') {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath}.enabled must be a boolean`);
  }
  if (!Number.isInteger(value.period) || value.period <= 0) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath}.period must be a positive integer`);
  }
  const allowedTimeframes = ['trading', '1h', '4h'];
  if (typeof value.timeframe !== 'string' || !allowedTimeframes.includes(value.timeframe)) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath}.timeframe must be one of ${allowedTimeframes.join(', ')}`);
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
  };
  if (value.buyBelow >= value.exitAbove) {
    throw new Error(`[ConfigLoader] config/settings.json strategies.RSI.buyBelow (${value.buyBelow}) must be < strategies.RSI.exitAbove (${value.exitAbove})`);
  }
  return value;
}

function configuredValue(configPath, fallback = undefined) {
  const value = configPath.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), settingsConfigFile);
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
    throw new Error(`[ConfigLoader] config/settings.json launchProfiles.${profileName}.${configPath} is required`);
  }
  return {
    value,
    source: `config:launchProfiles.${profileName}.${configPath}`,
  };
}

function requiredLaunchProfileBool(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (typeof result.value !== 'boolean') {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be a boolean`);
  }
  return result;
}

function requiredLaunchProfileNumber(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (!Number.isFinite(result.value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be a finite number`);
  }
  return result;
}

function requiredLaunchProfileNullableNumber(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (result.value === null) return result;
  if (!Number.isFinite(result.value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be a finite number or null`);
  }
  return result;
}

function requiredLaunchProfileString(configPath, allowedValues = null) {
  const result = requiredLaunchProfileValue(configPath);
  const value = typeof result.value === 'string' ? result.value.trim() : '';
  if (!value) {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be a non-empty string`);
  }
  if (allowedValues && !allowedValues.has(value)) {
    throw new Error(
      `[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be one of ${Array.from(allowedValues).join(', ')}`
    );
  }
  return { value, source: result.source };
}

function requiredLaunchProfileStringList(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (!Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be an array`);
  }
  const values = result.value.map(item => String(item).trim()).filter(Boolean);
  if (values.length !== result.value.length) {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} cannot contain blank strategy names`);
  }
  return { value: values, source: result.source };
}

function requiredLaunchProfilePlainObject(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be an object`);
  }
  return { value: cloneConfiguredObject(result.value), source: result.source };
}

function requiredLaunchProfileNullablePlainObject(configPath) {
  const result = requiredLaunchProfileValue(configPath);
  if (result.value === null) {
    return { value: null, source: result.source };
  }
  if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)} must be an object or null`);
  }
  return { value: cloneConfiguredObject(result.value), source: result.source };
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
      throw new Error(`[ConfigLoader] config/settings.json ${sourcePath}.${field} must be a finite number`);
    }
  }
  for (const field of boolFields) {
    if (typeof value[field] !== 'boolean') {
      throw new Error(`[ConfigLoader] config/settings.json ${sourcePath}.${field} must be a boolean`);
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
    throw new Error(`[ConfigLoader] config/settings.json ${result.source.slice('config:'.length)}.enabled must be a boolean`);
  }
  return result;
}

function validateMtfServiceConfig(value, sourcePath) {
  if (!Number.isInteger(value.minReadyTimeframes) || value.minReadyTimeframes < 1) {
    throw new Error(`[ConfigLoader] config/settings.json ${sourcePath}.minReadyTimeframes must be a positive integer`);
  }
  if (!value.weights || typeof value.weights !== 'object' || Array.isArray(value.weights)) {
    throw new Error(`[ConfigLoader] config/settings.json ${sourcePath}.weights must be an object`);
  }
  for (const timeframe of ['1m', '5m', '15m', '30m', '1h', '4h', '1d']) {
    const weight = Number(value.weights[timeframe]);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`[ConfigLoader] config/settings.json ${sourcePath}.weights.${timeframe} must be a finite positive number`);
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

function configuredNumberResult(configPath) {
  return {
    value: requiredConfiguredNumber(configPath),
    source: `config:${configPath}`,
  };
}

function configuredValueResult(configPath) {
  const value = readConfiguredPath(settingsConfigFile, configPath);
  if (value === undefined) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath} is required`);
  }
  return {
    value,
    source: `config:${configPath}`,
  };
}

function configuredPlainObjectResult(configPath) {
  const result = configuredValueResult(configPath);
  if (!result.value || typeof result.value !== 'object' || Array.isArray(result.value)) {
    throw new Error(`[ConfigLoader] config/settings.json ${configPath} must be an object`);
  }
  return {
    value: cloneConfiguredObject(result.value),
    source: result.source,
  };
}

// ═══════════════════════════════════════════════════════════════
// ENV READER HELPERS (private — only used inside this file)
// ═══════════════════════════════════════════════════════════════

let activeEnv = {};
let activeEnvSources = {};
let activeLaunchProfileContext = null;
let activeCredentialEnv = {};
let activeCredentialSources = {};
let activeProcessRole = 'bot';
let activeRunDescriptor = null;

const PROCESS_CREDENTIAL_KEYS = Object.freeze({
  bot: new Set([
    'SENTRY_DSN',
    'KRAKEN_API_KEY',
    'KRAKEN_API_SECRET',
    'ALPACA_API_KEY',
    'ALPACA_API_SECRET',
    'BROKER_ACCOUNT_ID',
    'SIGNALSTACK_WEBHOOK_URL',
    'WEBSOCKET_AUTH_TOKEN',
    'POLYGON_API_KEY',
    'BRIGHTDATA_API_KEY',
    'TAVILY_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'DISCORD_STATUS_WEBHOOK_URL',
    'DISCORD_STATS_WEBHOOK_URL',
    'NTFY_TOPIC',
    'ELEVENLABS_API_KEY',
    'DID_API_KEY',
    'INCEPTION_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
  ]),
  dashboard: new Set([
    'WEBSOCKET_AUTH_TOKEN',
    'ALPACA_API_KEY',
    'ALPACA_API_SECRET',
    'POLYGON_API_KEY',
    'BRIGHTDATA_API_KEY',
    'TAVILY_API_KEY',
    'INCEPTION_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
  ]),
  checkout: new Set(['STRIPE_SECRET_KEY']),
  supervisor: new Set(['SUPERVISOR_DEADMAN_URL']),
  'market-data-tool': new Set(['ALPACA_API_KEY', 'ALPACA_API_SECRET', 'POLYGON_API_KEY']),
});

function envSource() {
  return activeEnv;
}

function valueSource(key) {
  return activeEnvSources[key] || `env:${key}`;
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

const VALID_LAUNCH_MODES = Object.freeze(new Set(['live', 'paper', 'backtest']));
const VALID_DIRECTION_FILTERS = Object.freeze(new Set(['both', 'long_only', 'short_only']));
const VALID_SESSION_ROUTER_MODES = Object.freeze(new Set(['static', 'scheduled']));
const VALID_SESSION_ROUTER_STATIC_SESSIONS = Object.freeze(new Set(['stocks', 'crypto']));
const VALID_RISK_GUARD_MODES = Object.freeze(new Set(['off', 'venueRailBuffer']));
const VALID_SESSION_RISK_ACTIONS = Object.freeze(new Set(['halt', 'pause', 'reduce', 'tighten', 'alert']));

function requireLaunchProfiles() {
  const launchProfiles = settingsConfigFile.launchProfiles;
  if (!launchProfiles || typeof launchProfiles !== 'object' || Array.isArray(launchProfiles)) {
    throw new Error('[ConfigLoader] config/settings.json must define launchProfiles');
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
    throw new Error('[ConfigLoader] config/settings.json launchProfiles.defaultProfile is required when PROFILE is absent');
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

// ═══════════════════════════════════════════════════════════════
// ROLE-SCOPED CREDENTIAL DELIVERY
// ═══════════════════════════════════════════════════════════════

function credentialForRole(role, envKey, sources, pathName) {
  const allowed = PROCESS_CREDENTIAL_KEYS[role];
  if (!allowed || !allowed.has(envKey)) return '';
  const raw = activeCredentialEnv[envKey];
  sources[pathName] = activeCredentialSources[envKey] || `dotenv:${envKey}:missing`;
  return raw === undefined ? '' : String(raw);
}

function recordTreeSources(sources, pathName, value, source) {
  sources[pathName] = source;
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    recordTreeSources(sources, pathName ? `${pathName}.${key}` : key, child, source);
  }
}

function buildRoleConfig(role) {
  const sources = {};
  const cloneSetting = (pathName) => {
    const value = readConfiguredPath(settingsConfigFile, pathName);
    if (value === undefined) throw new Error(`[ConfigLoader] config/settings.json ${pathName} is required`);
    const cloned = cloneConfiguredObject(value);
    recordTreeSources(sources, pathName, cloned, `config:settings.json:${pathName}`);
    return cloned;
  };
  const cloneInternal = (pathName) => {
    const value = readConfiguredPath(internalsConfigFile, pathName);
    if (value === undefined) throw new Error(`[ConfigLoader] config/internals.json ${pathName} is required`);
    const cloned = cloneConfiguredObject(value);
    recordTreeSources(sources, pathName, cloned, `config:internals.json:${pathName}`);
    return cloned;
  };

  if (role === 'dashboard') {
    const dashboard = cloneSetting('services.dashboard');
    const news = {
      ...cloneSetting('services.news'),
      ...cloneInternal('services.news'),
    };
    const traiLlm = cloneSetting('trai.llm');
    const traiCredentialName = String(traiLlm.apiKeyEnv || '').trim();
    const trai = {
      llm: traiLlm,
      apiKey: traiCredentialName
        ? credentialForRole(role, traiCredentialName, sources, 'trai.apiKey')
        : '',
    };
    const launchProfile = resolveLaunchProfile(activeEnv);
    const mode = {
      execution: launchProfile.mode,
    };
    recordTreeSources(
      sources,
      'mode',
      mode,
      `config:settings.json:launchProfiles.${launchProfile.profileName}.mode`
    );
    dashboard.authToken = credentialForRole(role, 'WEBSOCKET_AUTH_TOKEN', sources, 'services.dashboard.authToken');
    dashboard.polygonApiKey = credentialForRole(role, 'POLYGON_API_KEY', sources, 'services.dashboard.polygonApiKey');
    dashboard.stockData = {
      ...dashboard.stockData,
      apiKey: credentialForRole(role, 'ALPACA_API_KEY', sources, 'services.dashboard.stockData.apiKey'),
      apiSecret: credentialForRole(role, 'ALPACA_API_SECRET', sources, 'services.dashboard.stockData.apiSecret'),
    };
    news.brightDataApiKey = credentialForRole(role, 'BRIGHTDATA_API_KEY', sources, 'services.news.brightDataApiKey');
    news.tavilyApiKey = credentialForRole(role, 'TAVILY_API_KEY', sources, 'services.news.tavilyApiKey');
    const broker = {
      alpacaApiKey: credentialForRole(role, 'ALPACA_API_KEY', sources, 'broker.alpacaApiKey'),
      alpacaApiSecret: credentialForRole(role, 'ALPACA_API_SECRET', sources, 'broker.alpacaApiSecret'),
    };
    return {
      config: {
        schemaVersion: settingsConfigFile.schemaVersion,
        revision: settingsConfigFile.revision,
        services: { dashboard, news },
        broker,
        mode,
        trai,
        dashboard: cloneInternal('dashboard'),
        instruments: cloneInternal('instruments'),
      },
      sources,
    };
  }

  if (role === 'checkout') {
    const checkout = cloneSetting('services.checkout');
    checkout.stripeSecretKey = credentialForRole(role, 'STRIPE_SECRET_KEY', sources, 'services.checkout.stripeSecretKey');
    return {
      config: {
        schemaVersion: settingsConfigFile.schemaVersion,
        revision: settingsConfigFile.revision,
        services: { checkout },
      },
      sources,
    };
  }

  if (role === 'supervisor') {
    const supervisor = cloneInternal('services.supervisor');
    supervisor.deadmanUrl = credentialForRole(role, 'SUPERVISOR_DEADMAN_URL', sources, 'services.supervisor.deadmanUrl');
    return {
      config: {
        schemaVersion: internalsConfigFile.schemaVersion,
        revision: internalsConfigFile.revision,
        services: { supervisor },
      },
      sources,
    };
  }

  if (role === 'market-data-tool') {
    const stockData = cloneSetting('services.dashboard.stockData');
    stockData.apiKey = credentialForRole(role, 'ALPACA_API_KEY', sources, 'services.marketData.alpaca.apiKey');
    stockData.apiSecret = credentialForRole(role, 'ALPACA_API_SECRET', sources, 'services.marketData.alpaca.apiSecret');
    return {
      config: {
        schemaVersion: settingsConfigFile.schemaVersion,
        revision: settingsConfigFile.revision,
        services: {
          marketData: {
            alpaca: {
              ...stockData,
            },
            polygon: {
              apiKey: credentialForRole(role, 'POLYGON_API_KEY', sources, 'services.marketData.polygon.apiKey'),
            },
          },
        },
        tooling: {
          dataParity: cloneInternal('tooling.dataParity'),
          stockDownload: cloneInternal('tooling.stockDownload'),
        },
      },
      sources,
    };
  }

  throw new Error(`[ConfigLoader] Unsupported process role '${role}'`);
}

const DESCRIPTOR_OVERRIDE_PATHS = Object.freeze([
  /^exitContracts\.[A-Za-z0-9_]+\.(stopLossPercent|takeProfitPercent|trailingStopPercent|trailingActivation|maxHoldTimeMinutes|atrStopMult|targetRR|trailActivationR|trailDistanceR|trailChannelBars|trailAtrMult|rsiExitLong|stopLookbackBars|stopBufferAtr|rewardRiskRatio|stopBufferAtrMultiplier|stopBufferPct|targetRR)$/,
  /^strategies\.[A-Za-z0-9_]+\.[A-Za-z0-9_.]+$/,
  /^strategies\.soloFilter$/,
  /^confidence\.minTradeConfidence$/,
  /^positionSizing\.maxPositionSize$/,
  /^filters\.(atrEnabled|atrMinPercent)$/,
  /^exits\.profitTiers\.(tier1|tier2|tier3)$/,
  /^pipeline\.directionFilter$/,
  /^execution\.candleTimeframe$/,
  /^orchestrator\.mtfConfluenceService\.minReadyTimeframes$/,
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function setObjectPath(root, pathName, value) {
  const parts = pathName.split('.');
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isPlainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = cloneConfiguredObject(value);
}

function profileTypedOverrides(profile, kind, runtimeConfig = null) {
  if (!isPlainObject(profile) || !isPlainObject(profile.overrides)) {
    throw new Error(`[ConfigLoader] ${kind} profile must contain typed canonical overrides`);
  }
  const overlay = {};
  for (const [pathName, value] of Object.entries(profile.overrides)) {
    const canonicalValue = runtimeConfig
      ? readConfiguredPath(runtimeConfig, pathName)
      : readConfiguredPath(settingsConfigFile, pathName);
    if (canonicalValue === undefined) {
      throw new Error(`[ConfigLoader] ${kind} profile override '${pathName}' has no canonical config leaf`);
    }
    const canonicalType = Array.isArray(canonicalValue) ? 'array' : typeof canonicalValue;
    const valueType = Array.isArray(value) ? 'array' : typeof value;
    if (canonicalType !== valueType) {
      throw new Error(`[ConfigLoader] ${kind} profile override '${pathName}' must be ${canonicalType}`);
    }
    if (valueType === 'number' && !Number.isFinite(value)) {
      throw new Error(`[ConfigLoader] ${kind} profile override '${pathName}' must be finite`);
    }
    overlay[pathName] = cloneConfiguredObject(value);
  }
  return overlay;
}

function validateFeeProfileApplicability(profile, profileName, assetClass = null) {
  if (!Array.isArray(profile.assetClasses) || profile.assetClasses.length === 0
      || profile.assetClasses.some(value => typeof value !== 'string' || value.trim() === '')) {
    throw new Error(`[ConfigLoader] fee profile '${profileName}' must declare non-empty assetClasses`);
  }
  const assetClasses = profile.assetClasses.map(value => value.trim().toLowerCase());
  if (assetClass && !assetClasses.includes(String(assetClass).trim().toLowerCase())) {
    throw new Error(`[ConfigLoader] fee profile '${profileName}' does not apply to asset class '${assetClass}'`);
  }
  return assetClasses;
}

function validateDescriptorOverride(config, pathName, value) {
  if (!DESCRIPTOR_OVERRIDE_PATHS.some(pattern => pattern.test(pathName))) {
    throw new Error(`[ConfigLoader] Backtest descriptor override '${pathName}' is unsupported`);
  }
  const canonicalValue = readConfiguredPath(config, pathName);
  if (canonicalValue === undefined) {
    throw new Error(`[ConfigLoader] Backtest descriptor override '${pathName}' has no canonical config leaf`);
  }
  if (pathName === 'strategies.soloFilter') {
    if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || name.trim() === '')) {
      throw new Error('[ConfigLoader] Backtest descriptor strategies.soloFilter must be a string array');
    }
    return value.map(name => name.trim());
  }
  if (pathName === 'pipeline.directionFilter') {
    if (typeof value !== 'string' || !VALID_DIRECTION_FILTERS.has(value)) {
      throw new Error('[ConfigLoader] Backtest descriptor pipeline.directionFilter must be both, long_only, or short_only');
    }
    return value;
  }
  if (!['string', 'number', 'boolean'].includes(typeof canonicalValue)) {
    throw new Error(`[ConfigLoader] Backtest descriptor ${pathName} does not target a canonical scalar leaf`);
  }
  if (typeof value !== typeof canonicalValue) {
    throw new Error(
      `[ConfigLoader] Backtest descriptor ${pathName} must be ${typeof canonicalValue}, matching the canonical leaf`
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`[ConfigLoader] Backtest descriptor ${pathName} must be finite`);
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      throw new Error(`[ConfigLoader] Backtest descriptor ${pathName} must be a non-empty string`);
    }
    return value.trim();
  }
  return value;
}

function validateRunDescriptor(raw, descriptorPath) {
  if (!isPlainObject(raw)) throw new Error('[ConfigLoader] Backtest run descriptor must be an object');
  const assertExactKeys = (value, label, required, optional = []) => {
    const allowed = new Set([...required, ...optional]);
    const missing = required.filter(key => !Object.prototype.hasOwnProperty.call(value, key));
    const unknown = Object.keys(value).filter(key => !allowed.has(key));
    if (missing.length || unknown.length) {
      throw new Error(
        `[ConfigLoader] Backtest run descriptor ${label} has invalid keys`
        + `${missing.length ? `; missing ${missing.join(', ')}` : ''}`
        + `${unknown.length ? `; unknown ${unknown.join(', ')}` : ''}`
      );
    }
  };
  assertExactKeys(
    raw,
    'root',
    ['schemaVersion', 'launchProfile', 'identity', 'data', 'report', 'state', 'services', 'feeProfile'],
    ['tuningProfile', 'overrides']
  );
  if (raw.schemaVersion !== 1) throw new Error('[ConfigLoader] Backtest run descriptor schemaVersion must be 1');
  if (typeof raw.launchProfile !== 'string' || raw.launchProfile.trim() === '') {
    throw new Error('[ConfigLoader] Backtest run descriptor launchProfile is required');
  }
  for (const section of ['identity', 'data', 'report', 'state', 'services']) {
    if (!isPlainObject(raw[section])) throw new Error(`[ConfigLoader] Backtest run descriptor ${section} must be an object`);
  }
  assertExactKeys(raw.identity, 'identity', ['broker', 'assetClass', 'tradingPair', 'symbols', 'candleTimeframe']);
  assertExactKeys(raw.data, 'data', ['candleFile']);
  assertExactKeys(raw.report, 'report', ['tag', 'outputDir']);
  assertExactKeys(raw.state, 'state', ['stateFile', 'dataDir', 'freshStart']);
  assertExactKeys(raw.services, 'services', ['dashboard', 'notifications', 'sentry', 'webhookOrders']);
  for (const key of ['broker', 'assetClass', 'tradingPair', 'candleTimeframe']) {
    if (typeof raw.identity[key] !== 'string' || raw.identity[key].trim() === '') {
      throw new Error(`[ConfigLoader] Backtest run descriptor identity.${key} is required`);
    }
  }
  if (!Array.isArray(raw.identity.symbols) || raw.identity.symbols.length === 0 || raw.identity.symbols.some(symbol => typeof symbol !== 'string' || symbol.trim() === '')) {
    throw new Error('[ConfigLoader] Backtest run descriptor identity.symbols must be a non-empty string array');
  }
  for (const [section, key] of [['data', 'candleFile'], ['report', 'tag'], ['report', 'outputDir'], ['state', 'stateFile'], ['state', 'dataDir']]) {
    if (typeof raw[section][key] !== 'string' || raw[section][key].trim() === '') {
      throw new Error(`[ConfigLoader] Backtest run descriptor ${section}.${key} must be a non-empty string`);
    }
  }
  if (typeof raw.state.freshStart !== 'boolean') {
    throw new Error('[ConfigLoader] Backtest run descriptor state.freshStart must be boolean');
  }
  for (const key of ['dashboard', 'notifications', 'sentry', 'webhookOrders']) {
    if (typeof raw.services[key] !== 'boolean') {
      throw new Error(`[ConfigLoader] Backtest run descriptor services.${key} must be boolean`);
    }
  }
  if (typeof raw.feeProfile !== 'string' || raw.feeProfile.trim() === '') {
    throw new Error('[ConfigLoader] Backtest run descriptor feeProfile must be a non-empty string');
  }
  if (raw.tuningProfile !== undefined && raw.tuningProfile !== null
      && (typeof raw.tuningProfile !== 'string' || raw.tuningProfile.trim() === '')) {
    throw new Error('[ConfigLoader] Backtest run descriptor tuningProfile must be null or a non-empty string');
  }
  if (raw.overrides !== undefined && !isPlainObject(raw.overrides)) {
    throw new Error('[ConfigLoader] Backtest run descriptor overrides must be an object');
  }
  const normalized = cloneConfiguredObject(raw);
  normalized.launchProfile = normalized.launchProfile.trim();
  for (const key of ['broker', 'assetClass', 'tradingPair', 'candleTimeframe']) {
    normalized.identity[key] = normalized.identity[key].trim();
  }
  normalized.identity.symbols = normalized.identity.symbols.map(symbol => symbol.trim());
  normalized.data.candleFile = normalized.data.candleFile.trim();
  normalized.report.tag = normalized.report.tag.trim();
  normalized.report.outputDir = normalized.report.outputDir.trim();
  normalized.state.stateFile = normalized.state.stateFile.trim();
  normalized.state.dataDir = normalized.state.dataDir.trim();
  normalized.feeProfile = normalized.feeProfile.trim();
  if (typeof normalized.tuningProfile === 'string') {
    normalized.tuningProfile = normalized.tuningProfile.trim();
  }
  return {
    value: normalized,
    path: descriptorPath,
    hash: canonicalHash(normalized),
  };
}

function loadBacktestRunDescriptor(descriptorPath) {
  if (typeof descriptorPath !== 'string' || descriptorPath.trim() === '') return null;
  const resolvedPath = path.isAbsolute(descriptorPath)
    ? descriptorPath
    : path.resolve(process.cwd(), descriptorPath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    throw new Error(`[ConfigLoader] Unable to read backtest run descriptor ${resolvedPath}: ${error.message}`);
  }
  return validateRunDescriptor(parsed, resolvedPath);
}

function applyFlatOverlay(config, sources, overlay, source) {
  for (const [pathName, value] of Object.entries(overlay || {})) {
    setObjectPath(config, pathName, value);
    recordTreeSources(sources, pathName, value, `${source}:${pathName}`);
  }
}


function fillSourceGaps(config, sources) {
  const visit = (pathName, value) => {
    if (!sources[pathName]) {
      const root = pathName.split('.')[0];
      if (Object.prototype.hasOwnProperty.call(settingsConfigFile, root)) {
        sources[pathName] = `config:settings.json:${pathName}`;
      } else if (Object.prototype.hasOwnProperty.call(internalsConfigFile, root)) {
        sources[pathName] = `config:internals.json:${pathName}`;
      } else if (root === 'internals') {
        sources[pathName] = `config:internals.json:${pathName.slice('internals.'.length)}`;
      } else {
        sources[pathName] = `derived:${pathName}`;
      }
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      visit(pathName ? `${pathName}.${key}` : key, child);
    }
  };
  for (const [key, value] of Object.entries(config)) visit(key, value);
}

function applyRunDescriptor(config, sources, descriptorReceipt) {
  if (!descriptorReceipt) return;
  const descriptor = descriptorReceipt.value;
  if (!config.mode.backtest || config.mode.liveTrading || config.execution.candleSource !== 'file') {
    throw new Error('[ConfigLoader] BACKTEST_RUN_DESCRIPTOR_PATH requires a file-backed backtest launch profile');
  }
  const identity = descriptor.identity;
  const brokerId = identity.broker.trim().toLowerCase();
  const assetClass = identity.assetClass.trim().toLowerCase();
  const expectedBroker = assetClass === 'crypto'
    ? 'kraken'
    : (assetClass === 'stocks' ? 'alpaca' : null);
  if (!expectedBroker || brokerId !== expectedBroker) {
    throw new Error(
      `[ConfigLoader] Backtest descriptor broker/asset pairing must be kraken/crypto or alpaca/stocks; got ${brokerId}/${assetClass}`
    );
  }
  config.execution.broker = brokerId;
  config.execution.assetClass = assetClass;
  config.execution.tradingPair = identity.tradingPair;
  config.execution.symbols = identity.symbols.map(symbol => symbol.trim());
  config.execution.candleTimeframe = identity.candleTimeframe;
  for (const key of ['broker', 'assetClass', 'tradingPair', 'symbols', 'candleTimeframe']) {
    recordTreeSources(
      sources,
      `execution.${key}`,
      config.execution[key],
      `descriptor:${descriptorReceipt.path}:identity.${key}`
    );
  }

  config.sessionRouter.mode = 'static';
  config.sessionRouter.staticSession = assetClass === 'crypto' ? 'crypto' : 'stocks';
  if (assetClass === 'crypto') {
    config.sessionRouter.cryptoSymbols = cloneConfiguredObject(config.execution.symbols);
    recordTreeSources(
      sources,
      'sessionRouter.cryptoSymbols',
      config.sessionRouter.cryptoSymbols,
      `descriptor:${descriptorReceipt.path}:identity.symbols`
    );
  } else {
    config.sessionRouter.stockSymbols = cloneConfiguredObject(config.execution.symbols);
    recordTreeSources(
      sources,
      'sessionRouter.stockSymbols',
      config.sessionRouter.stockSymbols,
      `descriptor:${descriptorReceipt.path}:identity.symbols`
    );
  }
  sources['sessionRouter.mode'] = `descriptor:${descriptorReceipt.path}:derived-static-route`;
  sources['sessionRouter.staticSession'] = `descriptor:${descriptorReceipt.path}:identity.assetClass`;

  config.backtest.candleDataFile = descriptor.data.candleFile;
  config.backtest.reportTag = descriptor.report.tag;
  config.backtest.freshStart = descriptor.state.freshStart;
  config.paths.backtestOutputDir = descriptor.report.outputDir;
  config.paths.stateFile = descriptor.state.stateFile;
  config.paths.dataDir = descriptor.state.dataDir;
  sources['backtest.candleDataFile'] = `descriptor:${descriptorReceipt.path}:data.candleFile`;
  sources['backtest.reportTag'] = `descriptor:${descriptorReceipt.path}:report.tag`;
  sources['backtest.freshStart'] = `descriptor:${descriptorReceipt.path}:state.freshStart`;
  sources['paths.backtestOutputDir'] = `descriptor:${descriptorReceipt.path}:report.outputDir`;
  sources['paths.stateFile'] = `descriptor:${descriptorReceipt.path}:state.stateFile`;
  sources['paths.dataDir'] = `descriptor:${descriptorReceipt.path}:state.dataDir`;

  config.services.dashboard.enabled = descriptor.services.dashboard;
  config.services.notifications.enabled = descriptor.services.notifications;
  config.monitoring.sentryEnabled = descriptor.services.sentry;
  config.webhookOrders.enabled = descriptor.services.webhookOrders;
  recordTreeSources(sources, 'services.dashboard.enabled', descriptor.services.dashboard, `descriptor:${descriptorReceipt.path}:services.dashboard`);
  recordTreeSources(sources, 'services.notifications.enabled', descriptor.services.notifications, `descriptor:${descriptorReceipt.path}:services.notifications`);
  recordTreeSources(sources, 'monitoring.sentryEnabled', descriptor.services.sentry, `descriptor:${descriptorReceipt.path}:services.sentry`);
  recordTreeSources(sources, 'webhookOrders.enabled', descriptor.services.webhookOrders, `descriptor:${descriptorReceipt.path}:services.webhookOrders`);

  if (descriptor.tuningProfile) {
    const profile = settingsConfigFile.tuningProfiles?.definitions?.[descriptor.tuningProfile];
    if (!profile) throw new Error(`[ConfigLoader] Unknown descriptor tuningProfile '${descriptor.tuningProfile}'`);
    if (profile.launchProfile !== descriptor.launchProfile) {
      throw new Error(
        `[ConfigLoader] tuning profile '${descriptor.tuningProfile}' requires launchProfile '${profile.launchProfile}'`
      );
    }
    applyFlatOverlay(config, sources, profileTypedOverrides(profile, 'tuning', config), `descriptor:tuning:${descriptor.tuningProfile}`);
  }
  if (descriptor.feeProfile) {
    const profile = settingsConfigFile.feeProfiles?.definitions?.[descriptor.feeProfile];
    if (!profile) throw new Error(`[ConfigLoader] Unknown descriptor feeProfile '${descriptor.feeProfile}'`);
    validateFeeProfileApplicability(profile, descriptor.feeProfile, assetClass);
    applyFlatOverlay(config, sources, profileTypedOverrides(profile, 'fee', config), `descriptor:fee:${descriptor.feeProfile}`);
  }
  const typedOverrides = {};
  for (const [pathName, value] of Object.entries(descriptor.overrides || {})) {
    typedOverrides[pathName] = validateDescriptorOverride(config, pathName, value);
  }
  applyFlatOverlay(config, sources, typedOverrides, 'descriptor:override');
}

function buildConfig() {
  if (activeProcessRole !== 'bot') return buildRoleConfig(activeProcessRole);
  const sources = {};
  const profileName = activeLaunchProfileContext.profileName;
  const profile = activeLaunchProfileContext.profile;

  function remember(pathName, value, source) {
    sources[pathName] = source;
    return value && typeof value === 'object' ? cloneConfiguredObject(value) : value;
  }

  function rememberTree(pathName, value, source) {
    const cloned = value && typeof value === 'object' ? cloneConfiguredObject(value) : value;
    const visit = (currentPath, currentValue) => {
      sources[currentPath] = source;
      if (!currentValue || typeof currentValue !== 'object') return;
      for (const [key, child] of Object.entries(currentValue)) {
        visit(`${currentPath}.${key}`, child);
      }
    };
    visit(pathName, cloned);
    return cloned;
  }

  function setting(pathName) {
    const value = readConfiguredPath(settingsConfigFile, pathName);
    if (value === undefined) {
      throw new Error(`[ConfigLoader] config/settings.json ${pathName} is required`);
    }
    return rememberTree(pathName, value, `config:settings.json:${pathName}`);
  }

  function internal(pathName) {
    const value = readConfiguredPath(internalsConfigFile, pathName);
    if (value === undefined) {
      throw new Error(`[ConfigLoader] config/internals.json ${pathName} is required`);
    }
    return rememberTree(pathName, value, `config:internals.json:${pathName}`);
  }

  function credential(pathName, envKey) {
    const allowedKeys = PROCESS_CREDENTIAL_KEYS[activeProcessRole] || PROCESS_CREDENTIAL_KEYS.bot;
    if (!allowedKeys.has(envKey)) {
      return remember(pathName, '', `not-applicable:${activeProcessRole}`);
    }
    const value = activeCredentialEnv[envKey];
    const source = activeCredentialSources[envKey] || `dotenv:${envKey}:missing`;
    return remember(pathName, value === undefined ? '' : String(value), source);
  }

  const sessionRouter = rememberTree(
    'sessionRouter',
    profile.sessionRouter,
    `config:settings.json:launchProfiles.${profileName}.sessionRouter`
  );
  const profileRisk = rememberTree(
    'risk',
    profile.risk,
    `config:settings.json:launchProfiles.${profileName}.risk`
  );
  const venueGuards = rememberTree(
    'evalRules.ttp',
    profile.venueGuards.ttp,
    `config:settings.json:launchProfiles.${profileName}.venueGuards.ttp`
  );
  const profilePipeline = rememberTree(
    'pipeline',
    profile.pipeline,
    `config:settings.json:launchProfiles.${profileName}.pipeline`
  );
  const strategyPipeline = {
    ...profilePipeline,
  };
  const strategyBehavior = setting('strategyBehavior');
  strategyBehavior.emaCrossover = rememberTree(
    'strategyBehavior.emaCrossover',
    profile.strategyBehavior.emaCrossover,
    `config:settings.json:launchProfiles.${profileName}.strategyBehavior.emaCrossover`
  );

  const execution = setting('execution');
  execution.brokerMode = activeLaunchProfileContext.mode === 'live' ? 'live' : 'paper';
  sources['execution.brokerMode'] = `derived:launchProfiles.${profileName}.mode`;
  if (activeLaunchProfileContext.mode === 'backtest') {
    execution.candleSource = 'file';
    sources['execution.candleSource'] = 'derived:backtest-file-source';
  }
  const backtest = internal('backtest');
  const configuredPaths = internal('paths');
  const paths = {
    ...configuredPaths,
    envFile: remember('paths.envFile', envSource().DOTENV_CONFIG_PATH || '.env', valueSource('DOTENV_CONFIG_PATH')),
  };
  if (paths.journalDataDir) {
    paths.journalDataDir = path.resolve(process.cwd(), paths.journalDataDir);
  }
  if (activeLaunchProfileContext.mode === 'backtest') {
    paths.stateFile = path.join(process.cwd(), 'data', 'state-backtest.json');
    paths.dataDir = path.join(process.cwd(), 'data', 'backtest');
    sources['paths.stateFile'] = 'derived:backtest-state-isolation';
    sources['paths.dataDir'] = 'derived:backtest-state-isolation';
  }

  const exits = setting('exits');
  const featureExtraction = { ...setting('featureExtraction'), ...internal('featureExtraction') };
  const exitContracts = setting('exitContracts');
  exitContracts.DonchianBreakout.stopType = internal('exitContracts.DonchianBreakout.stopType');
  exitContracts.DonchianBreakout.trailType = internal('exitContracts.DonchianBreakout.trailType');
  exitContracts.DonchianBreakout.tpMode = internal('exitContracts.DonchianBreakout.tpMode');
  exitContracts.DonchianBreakout.maxHoldMode = internal('exitContracts.DonchianBreakout.maxHoldMode');
  exitContracts.TimeSeriesMomentum.trailType = internal('exitContracts.TimeSeriesMomentum.trailType');
  exitContracts.TimeSeriesMomentum.tpMode = internal('exitContracts.TimeSeriesMomentum.tpMode');
  exitContracts.TimeSeriesMomentum.maxHoldMode = internal('exitContracts.TimeSeriesMomentum.maxHoldMode');
  const trai = setting('trai');
  const llmCredentialName = String(trai.llm?.apiKeyEnv || '').trim();
  trai.apiKey = llmCredentialName ? credential('trai.apiKey', llmCredentialName) : '';

  const configuredOrchestrator = setting('orchestrator');
  const featureCatalog = setting('featureCatalog');
  const orchestrator = {
    ...configuredOrchestrator,
    mtfConfluenceService: rememberTree(
      'orchestrator.mtfConfluenceService',
      profile.confluence.mtfService,
      `config:settings.json:launchProfiles.${profileName}.confluence.mtfService`
    ),
    mtfConfluenceBooster: rememberTree(
      'orchestrator.mtfConfluenceBooster',
      profile.confluence.mtfBooster,
      `config:settings.json:launchProfiles.${profileName}.confluence.mtfBooster`
    ),
    strategyMtfConfluence: rememberTree(
      'orchestrator.strategyMtfConfluence',
      profile.confluence.strategyMtf,
      `config:settings.json:launchProfiles.${profileName}.confluence.strategyMtf`
    ),
  };

  const configuredStrategies = setting('strategies');
  const strategies = {
    ...configuredStrategies,
    soloFilter: remember(
      'strategies.soloFilter',
      cloneConfiguredObject(profile.strategies.soloFilter),
      `config:settings.json:launchProfiles.${profileName}.strategies.soloFilter`
    ),
  };

  const dashboardService = setting('services.dashboard');
  const newsService = setting('services.news');
  const notificationService = setting('services.notifications');
  const voiceService = setting('services.voice');
  const narratorService = setting('services.narrator');
  const webhookSettings = setting('services.webhookOrders');

  const runtimeSettings = cloneConfiguredObject(settingsConfigFile);
  delete runtimeSettings.launchProfiles;
  delete runtimeSettings.tuningProfiles;
  delete runtimeSettings.feeProfiles;
  delete runtimeSettings.services;
  const botInternals = cloneConfiguredObject(internalsConfigFile);
  delete botInternals.dashboard;
  delete botInternals.deployment;
  delete botInternals.services;
  delete botInternals.tooling;
  delete botInternals.exitContracts;
  delete botInternals.featureExtraction;

  const config = {
    ...runtimeSettings,
    execution,
    mode: {
      launchProfile: remember('mode.launchProfile', profileName, activeLaunchProfileContext.profileSource),
      execution: remember('mode.execution', activeLaunchProfileContext.mode, `config:settings.json:launchProfiles.${profileName}.mode`),
      confirmLive: remember('mode.confirmLive', activeLaunchProfileContext.confirmLive, `config:settings.json:launchProfiles.${profileName}.confirmLive`),
      backtest: activeLaunchProfileContext.mode === 'backtest',
      paperTrading: activeLaunchProfileContext.mode === 'paper',
      liveTrading: activeLaunchProfileContext.mode === 'live',
      confirmLiveTrading: activeLaunchProfileContext.confirmLive,
      testMode: remember('mode.testMode', false, 'derived:no-test-mode'),
      candleSource: execution.candleSource,
    },
    sessionRouter,
    featureCatalog,
    tierPolicy: setting('tierPolicy'),
    backtest,
    startingBalance: setting('startingBalance'),
    paths,
    monitoring: {
      ...internal('monitoring'),
      sentryDsn: credential('monitoring.sentryDsn', 'SENTRY_DSN'),
    },
    observability: internal('observability'),
    dataFeed: internal('dataFeed'),
    confidence: {
      ...setting('confidence'),
      minTradeConfidence: remember(
        'confidence.minTradeConfidence',
        profile.confidence.minTradeConfidence,
        `config:settings.json:launchProfiles.${profileName}.confidence.minTradeConfidence`
      ),
    },
    positionSizing: setting('positionSizing'),
    entryLogic: setting('entryLogic'),
    exitLogic: setting('exitLogic'),
    exitContracts,
    strategyBehavior,
    orchestrator,
    exits,
    featureExtraction,
    fees: setting('fees'),
    risk: profileRisk,
    filters: setting('filters'),
    evalRules: {
      enabled: remember('evalRules.enabled', venueGuards.enabled, `config:settings.json:launchProfiles.${profileName}.venueGuards.ttp.enabled`),
      ttp: {
        ...venueGuards,
        volumeCap: {
          ...venueGuards.volumeCap,
          maxReferenceAgeLimitMs: internal('dataFeed.volumeCapMaxReferenceAgeLimitMs'),
        },
      },
    },
    broker: {
      apiKey: credential('broker.apiKey', 'KRAKEN_API_KEY'),
      apiSecret: credential('broker.apiSecret', 'KRAKEN_API_SECRET'),
      alpacaApiKey: credential('broker.alpacaApiKey', 'ALPACA_API_KEY'),
      alpacaApiSecret: credential('broker.alpacaApiSecret', 'ALPACA_API_SECRET'),
      tradingInterval: internal('broker.tradingIntervalMs'),
      alpacaWebSocket: internal('broker.alpacaWebSocket'),
      accountId: credential('broker.accountId', 'BROKER_ACCOUNT_ID'),
    },
    webhookOrders: {
      enabled: remember('webhookOrders.enabled', webhookSettings.enabled, 'config:settings.json:services.webhookOrders.enabled'),
      dryRun: remember('webhookOrders.dryRun', webhookSettings.dryRun, 'config:settings.json:services.webhookOrders.dryRun'),
      entryThrottleMs: remember('webhookOrders.entryThrottleMs', webhookSettings.entryThrottleMs, 'config:settings.json:services.webhookOrders.entryThrottleMs'),
      webhookUrl: credential('webhookOrders.webhookUrl', 'SIGNALSTACK_WEBHOOK_URL'),
      ...internal('webhookOrders'),
    },
    trai,
    strategies,
    pipeline: {
      ...strategyPipeline,
      directionFilter: strategyPipeline.directionFilter,
    },
    dashboard: internal('dashboard'),
    misc: setting('misc'),
    patternMemory: setting('patternMemory'),
    proofPublication: setting('proofPublication'),
    features: setting('features'),
    services: {
      dashboard: {
        ...dashboardService,
        authToken: credential('services.dashboard.authToken', 'WEBSOCKET_AUTH_TOKEN'),
        polygonApiKey: credential('services.dashboard.polygonApiKey', 'POLYGON_API_KEY'),
        stockData: {
          ...dashboardService.stockData,
          apiKey: credential('services.dashboard.stockData.apiKey', 'ALPACA_API_KEY'),
          apiSecret: credential('services.dashboard.stockData.apiSecret', 'ALPACA_API_SECRET'),
        },
      },
      news: {
        ...newsService,
        ...internal('services.news'),
        edgarUserAgent: remember('services.news.edgarUserAgent', newsService.edgarUserAgent, 'config:settings.json:services.news.edgarUserAgent'),
        brightDataApiKey: credential('services.news.brightDataApiKey', 'BRIGHTDATA_API_KEY'),
        tavilyApiKey: credential('services.news.tavilyApiKey', 'TAVILY_API_KEY'),
      },
      notifications: {
        ...notificationService,
        ...internal('services.notifications'),
        telegramBotToken: credential('services.notifications.telegramBotToken', 'TELEGRAM_BOT_TOKEN'),
        telegramChatId: credential('services.notifications.telegramChatId', 'TELEGRAM_CHAT_ID'),
        discordStatusWebhookUrl: credential('services.notifications.discordStatusWebhookUrl', 'DISCORD_STATUS_WEBHOOK_URL'),
        discordStatsWebhookUrl: credential('services.notifications.discordStatsWebhookUrl', 'DISCORD_STATS_WEBHOOK_URL'),
        ntfyTopic: credential('services.notifications.ntfyTopic', 'NTFY_TOPIC'),
      },
      narrator: narratorService,
      voice: {
        ...voiceService,
        elevenlabsApiKey: credential('services.voice.elevenlabsApiKey', 'ELEVENLABS_API_KEY'),
        didApiKey: credential('services.voice.didApiKey', 'DID_API_KEY'),
      },
    },
    internals: botInternals,
  };

  applyRunDescriptor(config, sources, activeRunDescriptor);
  fillSourceGaps(config, sources);
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

function roleConfigValue(config, pathName) {
  return pathName.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), config);
}

function roleError(errors, pathName, message) {
  errors.push(`${pathName} ${message}`);
}

function requireRoleObject(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    roleError(errors, pathName, 'must be an object');
    return null;
  }
  return value;
}

function requireRoleString(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (typeof value !== 'string' || value.trim() === '') {
    roleError(errors, pathName, 'must be a non-empty string');
  }
}

function requireRoleBoolean(errors, config, pathName) {
  if (typeof roleConfigValue(config, pathName) !== 'boolean') {
    roleError(errors, pathName, 'must be boolean');
  }
}

function requireRolePositiveInteger(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (!Number.isInteger(value) || value <= 0) {
    roleError(errors, pathName, 'must be a positive integer');
  }
}

function requireRolePort(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    roleError(errors, pathName, 'must be an integer from 1 through 65535');
  }
}

function requireRoleUrl(errors, config, pathName, protocols) {
  const value = roleConfigValue(config, pathName);
  if (typeof value !== 'string' || value.trim() === '') {
    roleError(errors, pathName, 'must be a non-empty URL string');
    return;
  }
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) {
      roleError(errors, pathName, `must use ${protocols.join(' or ')}`);
    }
  } catch (_) {
    roleError(errors, pathName, 'must be a valid URL');
  }
}

function requireRoleNonNegativeInteger(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (!Number.isInteger(value) || value < 0) {
    roleError(errors, pathName, 'must be a non-negative integer');
  }
}

function requireRoleFiniteNumber(errors, config, pathName, { positive = false } = {}) {
  const value = roleConfigValue(config, pathName);
  if (!Number.isFinite(value) || (positive && value <= 0)) {
    roleError(errors, pathName, positive ? 'must be a finite positive number' : 'must be a finite number');
  }
}

function requireRoleStringArray(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.trim() === '')) {
    roleError(errors, pathName, 'must be a non-empty string array');
  }
}

function requireRoleStringArrayShape(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) {
    roleError(errors, pathName, 'must be a string array');
  }
}

function requireRoleNonNegativeNumber(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (!Number.isFinite(value) || value < 0) {
    roleError(errors, pathName, 'must be a finite non-negative number');
  }
}

function optionalRoleString(errors, config, pathName) {
  const value = roleConfigValue(config, pathName);
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || value.trim() === '') {
    roleError(errors, pathName, 'must be a string when configured');
  }
}

function validateDashboardRole(config, errors) {
  const dashboard = requireRoleObject(errors, config, 'services.dashboard');
  if (dashboard) {
    requireRoleBoolean(errors, config, 'services.dashboard.enabled');
    requireRoleString(errors, config, 'services.dashboard.host');
    requireRolePort(errors, config, 'services.dashboard.port');
    requireRoleBoolean(errors, config, 'services.dashboard.secureCookies');
    requireRoleStringArray(errors, config, 'services.dashboard.cryptoSymbols');
    optionalRoleString(errors, config, 'services.dashboard.polygonApiKey');

    const stockData = requireRoleObject(errors, config, 'services.dashboard.stockData');
    if (stockData) {
      requireRoleUrl(errors, config, 'services.dashboard.stockData.baseUrl', ['http:', 'https:']);
      requireRoleString(errors, config, 'services.dashboard.stockData.feed');
      requireRoleString(errors, config, 'services.dashboard.stockData.adjustment');
      requireRoleStringArray(errors, config, 'services.dashboard.stockData.symbols');
      requireRolePositiveInteger(errors, config, 'services.dashboard.stockData.tickerMaxAgeMs');
      optionalRoleString(errors, config, 'services.dashboard.stockData.apiKey');
      optionalRoleString(errors, config, 'services.dashboard.stockData.apiSecret');
      requireRoleBoolean(errors, config, 'services.dashboard.stockData.streamEnabled');
      if (stockData.streamEnabled === true) {
        requireRoleUrl(errors, config, 'services.dashboard.stockData.streamUrl', ['ws:', 'wss:']);
        requireRoleString(errors, config, 'services.dashboard.stockData.streamFeed');
      }
    }
  }

  const internals = requireRoleObject(errors, config, 'dashboard');
  if (internals) {
    for (const pathName of [
      'stateUpdateHeartbeatMs', 'websocketAuthTimeoutMs', 'statusLogIntervalMs',
      'traiFetchTimeoutMs', 'errorEventMessageMaxLength',
      'errorEventDedupeMaxKeys', 'brokerStatusDedupeMaxKeys', 'edgeAnalyticsMaxScopes',
      'depthMinIntervalMs', 'stockPriceIntervalMs', 'cryptoPriceIntervalMs',
    ]) {
      requireRolePositiveInteger(errors, config, `dashboard.${pathName}`);
    }
    for (const pathName of [
      'sessionTtlMs', 'ticketTtlMs', 'traiEventsCacheTtlMs', 'traiRegimeCacheTtlMs',
      'traiSessionContextCacheTtlMs', 'traiTradeSummaryCacheTtlMs', 'traiWhalesCacheTtlMs',
      'decisionLedgerSyncMaxBytes', 'errorEventDedupeMs',
    ]) {
      requireRoleNonNegativeInteger(errors, config, `dashboard.${pathName}`);
    }
    requireRoleString(errors, config, 'dashboard.decisionLedgerPath');
    requireRoleUrl(errors, config, 'dashboard.krakenRestTickerUrl', ['http:', 'https:']);
    requireRoleUrl(errors, config, 'dashboard.botRelayUrl', ['ws:', 'wss:']);

    const feed = requireRoleObject(errors, config, 'dashboard.cryptoMarketFeed');
    if (feed) {
      requireRoleUrl(errors, config, 'dashboard.cryptoMarketFeed.publicWsUrl', ['ws:', 'wss:']);
      requireRoleObject(errors, config, 'dashboard.cryptoMarketFeed.pairBySymbol');
      for (const pathName of [
        'bookDepth', 'watchdogMs', 'backoffMinMs', 'backoffMaxMs', 'tradeWindowMs',
        'emitIntervalMs',
      ]) {
        requireRolePositiveInteger(errors, config, `dashboard.cryptoMarketFeed.${pathName}`);
      }
      for (const pathName of ['maxWalls', 'maxDensityLevels']) {
        requireRoleNonNegativeInteger(errors, config, `dashboard.cryptoMarketFeed.${pathName}`);
      }
      for (const pathName of [
        'backoffMultiplier', 'densityWeightDivisorUsd',
      ]) {
        requireRoleFiniteNumber(errors, config, `dashboard.cryptoMarketFeed.${pathName}`, { positive: true });
      }
      for (const pathName of [
        'nearMidBandFraction', 'wallMinUsd', 'whaleTradeMinUsd', 'densityWeightCap',
        'cvdTrendDeltaThresholdUsd', 'buySellRatioWhenNoSells',
      ]) {
        requireRoleNonNegativeNumber(errors, config, `dashboard.cryptoMarketFeed.${pathName}`);
      }
      if (feed.backoffMaxMs < feed.backoffMinMs) {
        roleError(errors, 'dashboard.cryptoMarketFeed.backoffMaxMs', 'must be greater than or equal to backoffMinMs');
      }
      const pairBySymbol = roleConfigValue(config, 'dashboard.cryptoMarketFeed.pairBySymbol');
      const symbols = roleConfigValue(config, 'services.dashboard.cryptoSymbols');
      if (pairBySymbol && typeof pairBySymbol === 'object' && !Array.isArray(pairBySymbol)
          && Array.isArray(symbols)) {
        for (const symbol of symbols) {
          const pair = pairBySymbol[symbol];
          if (typeof pair !== 'string' || pair.trim() === '') {
            roleError(errors, `dashboard.cryptoMarketFeed.pairBySymbol.${symbol}`, 'must map to a non-empty string');
          }
        }
      }
    }
  }
}

function validateCheckoutRole(config, errors) {
  const checkout = requireRoleObject(errors, config, 'services.checkout');
  if (!checkout) return;
  requireRolePort(errors, config, 'services.checkout.port');
  requireRoleNonNegativeInteger(errors, config, 'services.checkout.trialPeriodDays');
  requireRoleUrl(errors, config, 'services.checkout.successUrl', ['https:']);
  requireRoleUrl(errors, config, 'services.checkout.cancelUrl', ['https:']);
  const priceMap = requireRoleObject(errors, config, 'services.checkout.priceMap');
  if (priceMap) {
    if (Object.keys(priceMap).length === 0) {
      roleError(errors, 'services.checkout.priceMap', 'must define at least one tier');
    }
    for (const [tier, priceId] of Object.entries(priceMap)) {
      if (typeof priceId !== 'string' || priceId.trim() === '') {
        roleError(errors, `services.checkout.priceMap.${tier}`, 'must be a non-empty string');
      }
    }
  }
}

function validateSupervisorRole(config, errors) {
  const supervisor = requireRoleObject(errors, config, 'services.supervisor');
  if (!supervisor) return;
  for (const pathName of [
    'pollMs', 'restartWindowMs',
    'flappingUptimeWindowMs', 'healthTimeoutMs', 'alertTimeoutMs',
    'deadmanHeartbeatMs', 'deadmanRequestTimeoutMs', 'healthRequestTimeoutMs',
    'pm2ListTimeoutMs', 'pm2RestartTimeoutMs',
  ]) {
    requireRolePositiveInteger(errors, config, `services.supervisor.${pathName}`);
  }
  for (const pathName of [
    'degradeMs', 'healAttempts', 'healCooldownMs', 'deadCooldownMs', 'maxRestartsIn10min',
    'flappingRestartThreshold', 'shutdownDelayMs',
  ]) {
    requireRoleNonNegativeInteger(errors, config, `services.supervisor.${pathName}`);
  }
  requireRoleUrl(errors, config, 'services.supervisor.healthUrl', ['http:', 'https:']);
  for (const pathName of ['botProcess', 'relayProcess', 'ledgerPath']) {
    requireRoleString(errors, config, `services.supervisor.${pathName}`);
  }
  optionalRoleString(errors, config, 'services.supervisor.deadmanUrl');
  const alertHookPath = roleConfigValue(config, 'services.supervisor.alertHookPath');
  if (alertHookPath !== undefined && alertHookPath !== null && alertHookPath !== '') {
    optionalRoleString(errors, config, 'services.supervisor.alertHookPath');
  }
}

function validateMarketDataToolRole(config, errors) {
  const marketData = requireRoleObject(errors, config, 'services.marketData');
  if (marketData) {
    const alpaca = requireRoleObject(errors, config, 'services.marketData.alpaca');
    if (alpaca) {
      requireRoleUrl(errors, config, 'services.marketData.alpaca.baseUrl', ['http:', 'https:']);
      requireRoleString(errors, config, 'services.marketData.alpaca.feed');
      requireRoleString(errors, config, 'services.marketData.alpaca.adjustment');
      requireRoleStringArrayShape(errors, config, 'services.marketData.alpaca.symbols');
      optionalRoleString(errors, config, 'services.marketData.alpaca.apiKey');
      optionalRoleString(errors, config, 'services.marketData.alpaca.apiSecret');
    }
    const polygon = requireRoleObject(errors, config, 'services.marketData.polygon');
    if (polygon) optionalRoleString(errors, config, 'services.marketData.polygon.apiKey');
  }

  const tooling = requireRoleObject(errors, config, 'tooling');
  if (!tooling) return;
  const dataParity = requireRoleObject(errors, config, 'tooling.dataParity');
  if (dataParity) {
    for (const pathName of ['sameWindowStart', 'sameWindowEnd', 'spotStart', 'spotEnd', 'alpacaFeed', 'alpacaAdjustment']) {
      requireRoleString(errors, config, `tooling.dataParity.${pathName}`);
    }
    requireRolePositiveInteger(errors, config, 'tooling.dataParity.alpacaPageLimit');
    requireRoleNonNegativeNumber(errors, config, 'tooling.dataParity.maxCloseBps');
    requireRoleNonNegativeNumber(errors, config, 'tooling.dataParity.maxFillOutsideBps');
  }
  const stockDownload = requireRoleObject(errors, config, 'tooling.stockDownload');
  if (stockDownload) {
    requireRoleString(errors, config, 'tooling.stockDownload.outputDir');
    requireRolePositiveInteger(errors, config, 'tooling.stockDownload.years');
    requireRoleString(errors, config, 'tooling.stockDownload.timeframe');
    requireRoleString(errors, config, 'tooling.stockDownload.filenameTimeframe');
    requireRolePositiveInteger(errors, config, 'tooling.stockDownload.limit');
    requireRolePositiveInteger(errors, config, 'tooling.stockDownload.chunkMonths');
    requireRolePositiveInteger(errors, config, 'tooling.stockDownload.rateLimitMs');
    requireRoleString(errors, config, 'tooling.stockDownload.feed');
    requireRoleString(errors, config, 'tooling.stockDownload.adjustment');
    requireRoleString(errors, config, 'tooling.stockDownload.sessionProfile');
  }
}

function validateBotRuntimeContract(config, errors) {
  requireRoleString(errors, config, 'misc.botTier');
  requireRoleString(errors, config, 'misc.subscriptionTier');
  const botTier = roleConfigValue(config, 'misc.botTier');
  const tierPolicy = requireRoleObject(errors, config, 'tierPolicy');
  if (tierPolicy && typeof botTier === 'string') {
    requireRoleObject(errors, config, `tierPolicy.${botTier}`);
  }

  requireRoleString(errors, config, 'execution.broker');
  requireRoleString(errors, config, 'execution.assetClass');
  requireRoleString(errors, config, 'execution.candleTimeframe');

  const pipeline = requireRoleObject(errors, config, 'pipeline');
  if (pipeline) {
    const validDirections = new Set(['both', 'long_only', 'short_only']);
    if (!validDirections.has(pipeline.directionFilter)) {
      roleError(errors, 'pipeline.directionFilter', 'must be both, long_only, or short_only');
    }
    for (const key of [
      'enableRSI', 'enableMADynamicSR', 'enableEMACrossover', 'enableLiquiditySweep',
      'enableCandlePattern', 'enableBreakRetest', 'enableMarketRegime', 'enableOGZTPO',
      'enableOpeningRangeBreakout', 'enableSmartMoneySweep', 'enableNoWickImbalance',
      'enableDonchianBreakout', 'enablePropSafeEMAPullback', 'enableEMATrendRetest',
      'enableRSI2MeanReversion', 'enableTimeSeriesMomentum',
    ]) {
      requireRoleBoolean(errors, config, `pipeline.${key}`);
    }
  }

  requireRolePositiveInteger(errors, config, 'internals.sessionRouter.fastCheckIntervalMs');
  requireRoleString(errors, config, 'internals.sessionRouter.transitionStoreDir');
  requireRolePositiveInteger(errors, config, 'internals.sessionRouter.transitionStoreStaleLockMs');

  requireRoleBoolean(errors, config, 'services.dashboard.enabled');
  if (roleConfigValue(config, 'services.dashboard.enabled') === true) {
    requireRoleUrl(errors, config, 'dashboard.botRelayUrl', ['ws:', 'wss:']);
    requireRoleString(errors, config, 'services.dashboard.authToken');
  }

  const patternExit = requireRoleObject(errors, config, 'featureCatalog.PATTERN_EXIT_MODEL');
  if (patternExit) {
    requireRoleBoolean(errors, config, 'featureCatalog.PATTERN_EXIT_MODEL.enabled');
    requireRoleBoolean(errors, config, 'featureCatalog.PATTERN_EXIT_MODEL.shadowMode');
    if (patternExit.enabled === true) {
      const settingsPath = 'featureCatalog.PATTERN_EXIT_MODEL.settings';
      const settings = requireRoleObject(errors, config, settingsPath);
      if (settings) {
        for (const key of [
          'enablePatternTargets', 'enablePatternStops', 'enablePatternTrailing',
          'enableReversalDetection', 'enableMomentumExhaustion', 'enableRegimeExits',
        ]) {
          requireRoleBoolean(errors, config, `${settingsPath}.${key}`);
        }
        for (const key of [
          'minPatternExitConfidence', 'minReversalConfidence', 'targetConfidenceWeight',
          'minTargetAdjustment', 'maxTargetAdjustment', 'stopConfidenceWeight',
          'minStopAdjustment', 'maxStopAdjustment', 'patternTrailWeight',
          'reversalExitPercent', 'exhaustionThreshold',
        ]) {
          requireRoleFiniteNumber(errors, config, `${settingsPath}.${key}`);
        }
        requireRoleStringArray(errors, config, `${settingsPath}.reversalPatterns`);
        const regimeMultipliers = requireRoleObject(errors, config, `${settingsPath}.regimeExitMultipliers`);
        if (regimeMultipliers) {
          for (const key of ['trending', 'ranging', 'volatile', 'breakout', 'unknown']) {
            requireRoleFiniteNumber(errors, config, `${settingsPath}.regimeExitMultipliers.${key}`, { positive: true });
          }
        }
        const protectionTiers = roleConfigValue(config, `${settingsPath}.profitProtectionTiers`);
        if (!Array.isArray(protectionTiers) || protectionTiers.length === 0) {
          roleError(errors, `${settingsPath}.profitProtectionTiers`, 'must be a non-empty array');
        } else {
          protectionTiers.forEach((tier, index) => {
            if (!tier || typeof tier !== 'object' || Array.isArray(tier)) {
              roleError(errors, `${settingsPath}.profitProtectionTiers.${index}`, 'must be an object');
              return;
            }
            for (const key of ['profit', 'protect']) {
              const value = tier[key];
              if (!Number.isFinite(value) || value < 0) {
                roleError(errors, `${settingsPath}.profitProtectionTiers.${index}.${key}`, 'must be a finite non-negative number');
              }
            }
          });
        }
      }
    }
  }

  const alpacaWebSocket = requireRoleObject(errors, config, 'broker.alpacaWebSocket');
  if (alpacaWebSocket) {
    for (const key of [
      'initialReconnectDelayMs', 'maxReconnectDelayMs', 'dataWatchdogMs',
      'maxPayloadBytes', 'maxBytesPerSecond',
    ]) {
      requireRolePositiveInteger(errors, config, `broker.alpacaWebSocket.${key}`);
    }
    for (const key of ['heartbeatPingMs', 'pongTimeoutMs']) {
      requireRoleNonNegativeInteger(errors, config, `broker.alpacaWebSocket.${key}`);
    }
    if (
      Number.isInteger(alpacaWebSocket.initialReconnectDelayMs)
      && Number.isInteger(alpacaWebSocket.maxReconnectDelayMs)
      && alpacaWebSocket.maxReconnectDelayMs < alpacaWebSocket.initialReconnectDelayMs
    ) {
      roleError(errors, 'broker.alpacaWebSocket.maxReconnectDelayMs', 'must be greater than or equal to initialReconnectDelayMs');
    }
  }
}

function validate(config, sources = {}, opts = {}) {
  const errors = [];
  const warnings = [];
  const processRole = opts.role || 'bot';

  if (processRole === 'dashboard') {
    if (!config.services?.dashboard?.authToken) {
      errors.push('WEBSOCKET_AUTH_TOKEN must be configured for the public dashboard process');
    }
    validateDashboardRole(config, errors);
    return { errors, warnings };
  }

  if (processRole === 'checkout') {
    if (!config.services?.checkout?.stripeSecretKey) {
      errors.push('STRIPE_SECRET_KEY must be configured for the checkout process');
    }
    validateCheckoutRole(config, errors);
    return { errors, warnings };
  }

  if (processRole === 'supervisor') {
    validateSupervisorRole(config, errors);
    return { errors, warnings };
  }
  if (processRole === 'market-data-tool') {
    validateMarketDataToolRole(config, errors);
    return { errors, warnings };
  }
  validateBotRuntimeContract(config, errors);
  const currentNewYorkDate = getCurrentNewYorkDate();

  if (!config.mode.launchProfile) {
    errors.push('mode.launchProfile must resolve from PROFILE or config/settings.json launchProfiles.defaultProfile');
  }
  if (!VALID_LAUNCH_MODES.has(config.mode.execution)) {
    errors.push(`mode.execution must be live, paper, or backtest; got ${config.mode.execution || '(missing)'}`);
  }
  if (config.mode.backtest && !activeRunDescriptor) {
    errors.push('backtest mode requires a typed BACKTEST_RUN_DESCRIPTOR_PATH');
  }
  if (config.mode.backtest && activeRunDescriptor) {
    requireRoleString(errors, config, 'backtest.candleDataFile');
    requireRoleString(errors, config, 'backtest.reportTag');
    requireRoleString(errors, config, 'paths.backtestOutputDir');
    requireRoleString(errors, config, 'paths.stateFile');
    requireRoleString(errors, config, 'paths.dataDir');
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
  if (config.positionSizing.maxPositionSize > 0.25) {
    errors.push(`maxPositionSize too high: ${config.positionSizing.maxPositionSize} (>25% of account per trade)`);
  }

  const feeModel = String(config.fees.model || '').trim().toLowerCase();
  // Tiers must be above fees. Percent fees can be checked statically; per-share
  // minimum fees require order quantity/notional and are enforced by FeeModel at runtime.
  if (feeModel === 'percent') {
    const feeThreshold = config.fees.totalRoundTrip;
    if (config.exits.profitTiers.tier1 < feeThreshold) {
      warnings.push(`tier1 (${config.exits.profitTiers.tier1}) below round-trip fees (${feeThreshold}) — tier 1 exits are net losses`);
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
  if (!Number.isFinite(config.fees.totalRoundTrip) || config.fees.totalRoundTrip < 0) {
    errors.push(`FEE_TOTAL_ROUNDTRIP out of range: ${config.fees.totalRoundTrip}`);
  }
  if (!Number.isFinite(config.fees.slippage) || config.fees.slippage < 0) {
    errors.push(`FEE_SLIPPAGE out of range: ${config.fees.slippage}`);
  }
  if (!Number.isFinite(config.fees.safetyBuffer) || config.fees.safetyBuffer < 0) {
    errors.push(`FEE_SAFETY_BUFFER out of range: ${config.fees.safetyBuffer}`);
  }
  if (!Number.isFinite(config.fees.perShare) || config.fees.perShare < 0) {
    errors.push(`FEE_PER_SHARE out of range: ${config.fees.perShare}`);
  }
  if (!Number.isFinite(config.fees.minOrderFee) || config.fees.minOrderFee < 0) {
    errors.push(`FEE_MIN_ORDER out of range: ${config.fees.minOrderFee}`);
  }
  if (feeModel === 'per_share_minimum') {
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
  if (typeof config.execution.tradingPair !== 'string' || config.execution.tradingPair.trim().length === 0) {
    errors.push('execution.tradingPair must resolve to a non-empty string');
  }
  for (const [strategyName, strategyConfig] of Object.entries(config.strategies || {})) {
    // VolumeProfile is a per-symbol market feature, not an orchestrator strategy.
    // It is always constructed and does not participate in strategy confluence.
    if (strategyName === 'VolumeProfile') continue;
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
    const minTradeConfidenceExplicit = /^config:settings\.json:launchProfiles\.[^.]+\.confidence\.minTradeConfidence$/.test(String(minTradeConfidenceSource || ''));
    if (!minTradeConfidenceExplicit) {
      errors.push(`LIVE_TRADING=true requires launchProfiles.<profile>.confidence.minTradeConfidence, got ${minTradeConfidenceSource || 'missing'}`);
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

  const sessionUsesStocks = config.sessionRouter.mode === 'scheduled'
    || (config.sessionRouter.mode === 'static' && config.sessionRouter.staticSession === 'stocks');
  const sessionUsesCrypto = config.sessionRouter.mode === 'scheduled'
    || (config.sessionRouter.mode === 'static' && config.sessionRouter.staticSession === 'crypto');
  if (!config.mode.backtest && sessionUsesStocks) {
    if (!config.broker.alpacaApiKey) {
      errors.push('ALPACA_API_KEY must be configured when SessionRouter uses stocks outside backtest mode');
    }
    if (!config.broker.alpacaApiSecret) {
      errors.push('ALPACA_API_SECRET must be configured when SessionRouter uses stocks outside backtest mode');
    }
    if (config.execution.brokerMode !== 'paper' && config.execution.brokerMode !== 'live') {
      errors.push(`ALPACA_MODE must be explicitly set to paper or live when SessionRouter uses stocks outside backtest mode, got ${config.execution.brokerMode || '(missing)'}`);
    }
    const hasExplicitAlpacaSymbols = config.execution.symbols.length > 0 && sources['execution.symbols'] !== 'default';
    const hasExplicitTradingPair = !!config.execution.tradingPair && sources['execution.tradingPair'] !== 'default';
    if (!hasExplicitAlpacaSymbols && !hasExplicitTradingPair) {
      errors.push('ALPACA_SYMBOLS or TRADING_PAIR must be explicitly configured when SessionRouter uses stocks outside backtest mode');
    }
  }
  if (!config.mode.backtest && sessionUsesCrypto) {
    if (!config.broker.apiKey) {
      errors.push('KRAKEN_API_KEY must be configured when SessionRouter uses crypto outside backtest mode');
    }
    if (!config.broker.apiSecret) {
      errors.push('KRAKEN_API_SECRET must be configured when SessionRouter uses crypto outside backtest mode');
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
  if (!Number.isInteger(config.webhookOrders.entryThrottleMs) || config.webhookOrders.entryThrottleMs < 0) {
    errors.push(`webhookOrders.entryThrottleMs must be a non-negative integer; got ${config.webhookOrders.entryThrottleMs}`);
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
    const maxProfitTargetDollars = config.startingBalance * ttpConsistency.maxProfitTargetInitialBalanceRatio;
    if (Number.isFinite(maxProfitTargetDollars) && ttpConsistency.profitTargetDollars > maxProfitTargetDollars) {
      errors.push(`TTP_PROFIT_TARGET_DOLLARS too high for initial balance: ${ttpConsistency.profitTargetDollars} > ${maxProfitTargetDollars}`);
    }
  }

  // Balance
  if (!Number.isFinite(config.startingBalance) || config.startingBalance <= 0) {
    errors.push(`initialBalance must be a finite positive number: ${config.startingBalance}`);
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])])
  );
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalHash(value) {
  return crypto.createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function deleteObjectPath(root, pathName) {
  const parts = pathName.split('.');
  let cursor = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor?.[parts[index]];
    if (!cursor || typeof cursor !== 'object') return;
  }
  if (cursor && typeof cursor === 'object') delete cursor[parts[parts.length - 1]];
}

function fingerprint(config, sources = {}, metadata = {}) {
  // Fingerprints cover the final applicable role view and provenance identity,
  // never credential bytes or inactive definition catalogs.
  const safeConfig = cloneConfiguredObject(config);
  for (const [pathName, source] of Object.entries(sources)) {
    if (!/^(dotenv|explicit):/.test(String(source))) continue;
    const current = readConfiguredPath(safeConfig, pathName);
    if (current === undefined) continue;
    setObjectPath(safeConfig, pathName, current === null || current === '' ? '[UNSET]' : '[SET]');
  }

  const inactivePaths = [
    'launchProfiles',
    'tuningProfiles',
    'feeProfiles',
    'internals.tooling',
  ];
  if ((metadata.role || 'bot') === 'bot') {
    inactivePaths.push('services.checkout', 'services.supervisor');
  }
  for (const inactivePath of inactivePaths) {
    deleteObjectPath(safeConfig, inactivePath);
  }

  const activeSources = Object.fromEntries(
    Object.entries(sources).filter(([pathName]) => readConfiguredPath(safeConfig, pathName) !== undefined)
  );

  return canonicalHash({
    schemaVersion: 1,
    role: metadata.role || 'bot',
    config: safeConfig,
    sources: activeSources,
    revisions: metadata.revisions || null,
    runDescriptorHash: metadata.runDescriptorHash || null,
  });
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
let _cachedRole = null;

function buildSnapshot(sourceEnv = process.env, opts = {}) {
  loadCanonicalFiles();
  const settingsHash = canonicalHash(settingsConfigFile);
  const internalsHash = canonicalHash(internalsConfigFile);
  const revisionReceipt = {
    settings: settingsConfigFile.revision,
    internals: internalsConfigFile.revision,
    settingsHash,
    internalsHash,
  };
  const processRole = opts.role || 'bot';
  const envPath = sourceEnv.DOTENV_CONFIG_PATH || '.env';
  const dotenvValues = opts.loadDotenv === false ? {} : loadDotenvValues(envPath);
  const descriptorPath = opts.runDescriptorPath || sourceEnv.BACKTEST_RUN_DESCRIPTOR_PATH || '';
  const descriptorReceipt = processRole === 'bot' ? loadBacktestRunDescriptor(descriptorPath) : null;
  const bootstrapEnv = {
    PROFILE: descriptorReceipt?.value?.launchProfile || sourceEnv.PROFILE,
    DOTENV_CONFIG_PATH: sourceEnv.DOTENV_CONFIG_PATH,
    BACKTEST_RUN_DESCRIPTOR_PATH: descriptorPath || undefined,
  };
  const bootstrapSources = {
    PROFILE: descriptorReceipt
      ? `descriptor:${descriptorReceipt.path}:launchProfile`
      : (sourceEnv.PROFILE === undefined ? 'config:settings.json:launchProfiles.defaultProfile' : 'env:PROFILE'),
    DOTENV_CONFIG_PATH: sourceEnv.DOTENV_CONFIG_PATH === undefined ? 'default:.env' : 'env:DOTENV_CONFIG_PATH',
    BACKTEST_RUN_DESCRIPTOR_PATH: descriptorPath ? 'env:BACKTEST_RUN_DESCRIPTOR_PATH' : 'not-applicable',
  };
  const launchProfiledEnv = processRole === 'bot'
    ? applyLaunchProfileEnv(bootstrapEnv, bootstrapSources)
    : { values: bootstrapEnv, sources: bootstrapSources, launchProfile: null };
  if (descriptorReceipt) {
    launchProfiledEnv.launchProfile.profileSource = `descriptor:${descriptorReceipt.path}:launchProfile`;
  }

  const previousEnv = activeEnv;
  const previousEnvSources = activeEnvSources;
  const previousLaunchProfileContext = activeLaunchProfileContext;
  const previousCredentialEnv = activeCredentialEnv;
  const previousCredentialSources = activeCredentialSources;
  const previousProcessRole = activeProcessRole;
  const previousRunDescriptor = activeRunDescriptor;
  activeEnv = launchProfiledEnv.values;
  activeEnvSources = launchProfiledEnv.sources;
  activeLaunchProfileContext = launchProfiledEnv.launchProfile;
  activeCredentialEnv = opts.loadDotenv === false ? { ...sourceEnv } : { ...dotenvValues };
  activeCredentialSources = Object.fromEntries(
    Object.keys(activeCredentialEnv).map(key => [key, opts.loadDotenv === false ? `explicit:${key}` : `dotenv:${key}`])
  );
  activeProcessRole = processRole;
  activeRunDescriptor = descriptorReceipt;

  let config;
  let sources;
  let errors;
  let warnings;
  try {
    ({ config, sources } = buildConfig());
    fillSourceGaps(config, sources);
    ({ errors, warnings } = validate(config, sources, opts));
  } finally {
    activeEnv = previousEnv;
    activeEnvSources = previousEnvSources;
    activeLaunchProfileContext = previousLaunchProfileContext;
    activeCredentialEnv = previousCredentialEnv;
    activeCredentialSources = previousCredentialSources;
    activeProcessRole = previousProcessRole;
    activeRunDescriptor = previousRunDescriptor;
  }
  const fp = fingerprint(config, sources, {
    role: processRole,
    revisions: {
      settings: revisionReceipt.settings,
      internals: revisionReceipt.internals,
    },
    runDescriptorHash: descriptorReceipt?.hash || null,
  });

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

  if (errors.length > 0) {
    throw new Error(`ConfigLoader: ${errors.length} validation errors: ${errors.join('; ')}`);
  }

  // Freeze
  const frozen = deepFreeze(config);
  const sourceReceipt = deepFreeze({ ...sources });

  return {
    config: frozen,
    entrySizing: processRole === 'bot' ? buildEntrySizingInput(frozen) : null,
    sources: sourceReceipt,
    fingerprint: fp,
    errors: Object.freeze([...errors]),
    warnings: Object.freeze([...warnings]),
    role: processRole,
    revisions: Object.freeze(revisionReceipt),
    runDescriptor: descriptorReceipt ? deepFreeze(cloneConfiguredObject(descriptorReceipt)) : null,
    timestamp: new Date().toISOString(),
  };
}

function snapshot(sourceEnv = process.env, opts = {}) {
  return buildSnapshot(sourceEnv, opts);
}

function emaConfidenceReplacementProblem(config) {
  const cfg = config.strategies?.EMASMACrossover;
  const confidence = {};
  for (const key of ['baseConfidence', 'confluenceWeight', 'freshCrossoverBonusPerCross', 'freshCrossoverBonusMax', 'maxConfidence']) {
    let value;
    try {
      value = Number(cfg?.[key]);
    } catch (error) {
      return { reason: 'invalid_ema_crossover_confidence', path: `strategies.EMASMACrossover.${key}` };
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return { reason: 'invalid_ema_crossover_confidence', path: `strategies.EMASMACrossover.${key}` };
    }
    confidence[key] = value;
  }
  if (confidence.maxConfidence < confidence.baseConfidence) {
    return { reason: 'ema_crossover_max_confidence_below_base', path: 'strategies.EMASMACrossover.maxConfidence' };
  }
  return null;
}

function maDynamicSRConfidenceReplacementProblem(config) {
  const cfg = config.strategies?.MADynamicSR;
  for (const key of ['baseConfidence', 'touchQualityWeight', 'maxConfidence']) {
    let value;
    try {
      value = Number(cfg?.[key]);
    } catch (error) {
      return { reason: 'invalid_ma_dynamic_sr_confidence', path: `strategies.MADynamicSR.${key}` };
    }
    if (!Number.isFinite(value) || value <= 0 || (key === 'maxConfidence' && value > 1)) {
      return { reason: 'invalid_ma_dynamic_sr_confidence', path: `strategies.MADynamicSR.${key}` };
    }
  }
  return null;
}

function liquiditySweepWeightsReplacementProblem(config) {
  const weights = config.strategies?.LiquiditySweep?.weights;
  for (const key of ['manipCandle', 'wickSweep', 'sweepReject', 'hammerPattern', 'engulfPattern']) {
    const problem = { reason: 'invalid_liquidity_sweep_weight', path: `strategies.LiquiditySweep.weights.${key}` };
    if (weights == null || !Object.hasOwn(weights, key) || weights[key] == null) return problem;
    let value;
    try {
      value = Number(weights[key]);
    } catch (error) {
      return problem;
    }
    if (!Number.isFinite(value) || value < 0) return problem;
  }
  return null;
}

function timeSeriesMomentumConfidenceReplacementProblem(config) {
  const cfg = config.strategies?.TimeSeriesMomentum;
  const confidence = {};
  for (const key of ['confidenceBase', 'confidenceReturnMultiplier', 'maxConfidence']) {
    const problem = { reason: 'invalid_time_series_momentum_confidence', path: `strategies.TimeSeriesMomentum.${key}` };
    let value;
    try {
      value = Number(cfg?.[key]);
    } catch (error) {
      return problem;
    }
    if (!Number.isFinite(value)
        || (key === 'confidenceReturnMultiplier' ? value <= 0 : value < 0 || value > 1)) return problem;
    confidence[key] = value;
  }
  if (confidence.maxConfidence < confidence.confidenceBase) {
    return { reason: 'time_series_momentum_max_confidence_below_base', path: 'strategies.TimeSeriesMomentum.maxConfidence' };
  }
  return null;
}

function rsi2ConfidenceReplacementProblem(config) {
  const cfg = config.strategies?.RSI2MeanReversion;
  const confidence = {};
  for (const key of ['confidenceBase', 'confidenceDepthMultiplier', 'maxConfidence']) {
    const problem = { reason: 'invalid_rsi2_confidence', path: `strategies.RSI2MeanReversion.${key}` };
    let value;
    try {
      value = Number(cfg?.[key]);
    } catch (error) {
      return problem;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) return problem;
    confidence[key] = value;
  }
  if (confidence.maxConfidence < confidence.confidenceBase) {
    return { reason: 'rsi2_max_confidence_below_base', path: 'strategies.RSI2MeanReversion.maxConfidence' };
  }
  return null;
}

function emaRetestConfidenceReplacementProblem(config) {
  const cfg = config.strategies?.EMATrendRetest;
  const confidence = {};
  for (const key of ['confidenceBase', 'confidenceSlopeBonus', 'confidenceRetestBonus', 'confidenceConfirmationBonus', 'maxConfidence']) {
    const problem = { reason: 'invalid_ema_retest_confidence', path: `strategies.EMATrendRetest.${key}` };
    const raw = cfg?.[key];
    if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim() === '')) return problem;
    let value;
    try {
      value = Number(raw);
    } catch (error) {
      return problem;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) return problem;
    confidence[key] = value;
  }
  if (confidence.maxConfidence < confidence.confidenceBase) {
    return { reason: 'ema_retest_max_confidence_below_base', path: 'strategies.EMATrendRetest.maxConfidence' };
  }
  return null;
}

function propSafeConfidenceReplacementProblem(config) {
  const cfg = config.strategies?.PropSafeEMAPullback;
  const confidence = {};
  for (const key of ['confidenceBase', 'confidenceTrendBonus', 'confidencePullbackBonus', 'confidenceConfirmationBonus', 'confidenceFreshCrossBonus', 'maxConfidence']) {
    const problem = { reason: 'invalid_propsafe_confidence', path: `strategies.PropSafeEMAPullback.${key}` };
    const raw = cfg?.[key];
    if ((typeof raw !== 'number' && typeof raw !== 'string')
        || (typeof raw === 'string' && raw.trim() === '')) return problem;
    let value;
    try {
      value = Number(raw);
    } catch (error) {
      return problem;
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) return problem;
    confidence[key] = value;
  }
  if (confidence.maxConfidence < confidence.confidenceBase) {
    return { reason: 'propsafe_max_confidence_below_base', path: 'strategies.PropSafeEMAPullback.maxConfidence' };
  }
  return null;
}

function load(opts = {}) {
  const requestedRole = opts.role || 'bot';
  if (_cached && !opts.force) {
    if (_cachedRole !== requestedRole) {
      throw new Error(`[ConfigLoader] Process already loaded role '${_cachedRole}'; refusing role '${requestedRole}'`);
    }
    return _cached;
  }

  if (_cached && opts.force && requestedRole !== _cachedRole) {
    const reason = 'forced_reload_role_change_rejected';
    console.error(`[ConfigLoader] Forced reload rejected: ${reason}: ${_cachedRole} -> ${requestedRole}`);
    return { success: false, applied: false, reloaded: false, reason,
      requestedRole, currentRole: _cachedRole, configuration: getReceipt() };
  }

  const previousSettings = settingsConfigFile;
  const previousInternals = internalsConfigFile;
  const candidate = buildSnapshot(process.env, opts);
  if (_cached && opts.force && requestedRole === 'bot') {
    const problem = emaConfidenceReplacementProblem(candidate.config)
      || maDynamicSRConfidenceReplacementProblem(candidate.config)
      || liquiditySweepWeightsReplacementProblem(candidate.config)
      || timeSeriesMomentumConfidenceReplacementProblem(candidate.config)
      || rsi2ConfidenceReplacementProblem(candidate.config)
      || emaRetestConfidenceReplacementProblem(candidate.config)
      || propSafeConfidenceReplacementProblem(candidate.config);
    if (problem) {
      // buildSnapshot restores its temporary active contexts in finally. Restore
      // its canonical-file reads too, keeping every reader on the prior owner.
      settingsConfigFile = previousSettings;
      internalsConfigFile = previousInternals;
      console.error(`[ConfigLoader] Forced reload rejected: ${problem.path}: ${problem.reason}`);
      return { success: false, applied: false, reloaded: false, ...problem, configuration: getReceipt() };
    }
  }
  _cached = candidate;
  _cachedRole = requestedRole;

  return _cached;
}

function get(path, missingValue = undefined) {
  if (!_cached) load();
  const parts = path.split('.');
  let val = _cached.config;
  for (const part of parts) {
    if (val === undefined || val === null) return missingValue;
    val = val[part];
  }
  return val === undefined ? missingValue : val;
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

function getReceipt() {
  return Object.freeze({
    fingerprint: _cached.fingerprint,
    role: _cached.role,
    ..._cached.revisions,
  });
}

function openingRangeBreakoutConfigurationProblem(config) {
  const orb = config.strategies?.OpeningRangeBreakout;
  if (!isPlainObject(orb)) return { reason: 'invalid_orb_configuration', path: 'strategies.OpeningRangeBreakout' };
  if (orb.maxFVGPercent < orb.minFVGPercent) {
    return { reason: 'orb_min_fvg_must_not_exceed_max', path: 'strategies.OpeningRangeBreakout.minFVGPercent' };
  }
  if (typeof orb.sessionOpenET !== 'string'
    || (orb.sessionOpenET !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(orb.sessionOpenET))) {
    return { reason: 'invalid_orb_session_open_et', path: 'strategies.OpeningRangeBreakout.sessionOpenET' };
  }
  if (typeof orb.sessionTimeZone !== 'string' || !orb.sessionTimeZone.trim()) {
    return { reason: 'invalid_orb_session_time_zone', path: 'strategies.OpeningRangeBreakout.sessionTimeZone' };
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: orb.sessionTimeZone });
  } catch {
    return { reason: 'invalid_orb_session_time_zone', path: 'strategies.OpeningRangeBreakout.sessionTimeZone' };
  }
  return null;
}

// This is the delivered hot-edit surface, not a list of every declared setting.
// Add fields only with their producer/consumer connection in the same change.
const EDITABLE_SETTINGS = deepFreeze({
  'features.enableLearning': { type: 'boolean', unit: 'boolean', label: 'Enable pattern learning', effect: 'next_pattern_observation; TRAI_memory_requires_restart' },
  'patternMemory.minSamples': { type: 'number', unit: 'trade count', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Pattern memory minimum samples', effect: 'next_pattern_memory_initialization_restart_required' },
  'patternMemory.successThreshold': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Pattern memory success threshold', effect: 'next_pattern_memory_initialization_restart_required' },
  'patternMemory.failureThreshold': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Pattern memory failure threshold', effect: 'next_pattern_memory_initialization_restart_required' },
  'patternMemory.maxAgeDays': { type: 'number', unit: 'days', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Pattern memory maximum age', effect: 'next_pattern_memory_initialization_restart_required' },
  'patternMemory.decayHalflifeDays': { type: 'number', unit: 'days', min: 0, exclusiveMin: true, max: Number.MAX_VALUE, label: 'Pattern memory decay half-life', effect: 'next_pattern_memory_initialization_restart_required' },
  'patternMemory.maxPatterns': { type: 'number', unit: 'patterns', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Pattern memory maximum patterns', effect: 'next_pattern_memory_initialization_restart_required' },
  'patternMemory.dtwThreshold': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Pattern memory DTW similarity threshold', effect: 'next_pattern_memory_initialization_restart_required' },
  'performanceAnalysis.minTradesForAnalysis': { type: 'number', unit: 'trade count', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Minimum trades before performance insights', effect: 'next_performance_analyzer_initialization_restart_required' },
  'performanceAnalysis.edgeDecayLookback': { type: 'number', unit: 'trade count', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Performance edge-decay lookback', effect: 'next_performance_analyzer_initialization_restart_required' },
  'performanceAnalysis.edgeDecayThreshold': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Edge-decay detection threshold', effect: 'next_performance_analyzer_initialization_restart_required' },
  'performanceAnalysis.entryQualityWeight': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Entry-quality score weight', effect: 'next_performance_analyzer_initialization_restart_required' },
  'performanceAnalysis.exitQualityWeight': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Exit-quality score weight', effect: 'next_performance_analyzer_initialization_restart_required' },
  'performanceAnalysis.patternAccuracyWeight': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Pattern-accuracy score weight', effect: 'next_performance_analyzer_initialization_restart_required' },
  'performanceAnalysis.recommendationInterval': { type: 'number', unit: 'trade count', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Performance recommendation interval', effect: 'next_performance_analyzer_initialization_restart_required' },
  'performanceAnalysis.alertOnTradesBelow': { type: 'number', unit: 'quality points', min: 0, max: 100, label: 'Low-quality trade alert threshold', effect: 'next_performance_analyzer_initialization_restart_required' },
  'patternRecognition.confidenceThreshold': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Pattern confidence threshold', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.useOptimizedIndicators': { type: 'boolean', unit: 'boolean', label: 'Use optimized indicators for pattern features', effect: 'next_pattern_feature_extraction' },
  'patternRecognition.flatCandleWickRatio': { type: 'number', unit: 'ratio', min: 0, max: 1, label: 'Flat-candle wick ratio fallback', effect: 'next_pattern_feature_extraction' },
  'patternRecognition.optimizedVolatilityCeiling': { type: 'number', unit: 'price fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE, label: 'Optimized volatility ceiling', effect: 'next_pattern_feature_extraction' },
  'patternRecognition.defaultPatternQuality': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Default pattern quality', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.historySimilarityThreshold': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Pattern-history similarity threshold', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.decayRate': { type: 'number', unit: 'per hour', min: 0, max: Number.MAX_VALUE, label: 'Pattern confidence decay rate', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.minimumDecayMultiplier': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Minimum pattern decay multiplier', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.fastPathMinTradeHistory': { type: 'number', unit: 'trade results', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Fast-path minimum trade history', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.fastPathRecentResultCount': { type: 'number', unit: 'trade results', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Fast-path recent result count', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.fastPathHistoricalWeight': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Fast-path historical confidence weight', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.fastPathRecentWeight': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Fast-path recent confidence weight', effect: 'next_pattern_checker_initialization_restart_required' },
  'patternRecognition.fastPathNewPatternConfidence': { type: 'number', unit: 'fraction', min: 0, max: 1, label: 'Fast-path new-pattern confidence', effect: 'next_pattern_checker_initialization_restart_required' },
  'indicators.optimized.rsiPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized RSI period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.macdFastPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized MACD fast period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.macdSlowPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized MACD slow period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.macdSignalPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized MACD signal period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.volatilityPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized volatility period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.bollingerPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized Bollinger period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.bollingerStdDev': { type: 'number', unit: 'standard deviations', min: 0, max: Number.MAX_VALUE, label: 'Optimized Bollinger standard deviation', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.atrPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized ATR period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.trendShortPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized trend short period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.trendLongPeriod': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized trend long period', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.smaLength': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized two-pole smaLength', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.filterLength': { type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Optimized two-pole filterLength', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.extremeOverbought': { type: 'number', unit: 'oscillator units', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, label: 'Optimized two-pole extremeOverbought', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.overbought': { type: 'number', unit: 'oscillator units', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, label: 'Optimized two-pole overbought', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.neutral': { type: 'number', unit: 'oscillator units', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, label: 'Optimized two-pole neutral', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.oversold': { type: 'number', unit: 'oscillator units', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, label: 'Optimized two-pole oversold', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.deltaDenominatorFloor': { type: 'number', unit: 'oscillator units', min: 0, exclusiveMin: true, max: Number.MAX_VALUE, label: 'Optimized two-pole deltaDenominatorFloor', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.crossoverMinDeltaRatio': { type: 'number', unit: 'ratio', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole crossoverMinDeltaRatio', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceMidZone': { type: 'number', unit: 'oscillator units', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole confidenceMidZone', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceExtreme': { type: 'number', unit: 'confidence points', min: 0, max: 100, label: 'Optimized two-pole confidenceExtreme', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceOverbought': { type: 'number', unit: 'confidence points', min: 0, max: 100, label: 'Optimized two-pole confidenceOverbought', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceMid': { type: 'number', unit: 'confidence points', min: 0, max: 100, label: 'Optimized two-pole confidenceMid', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceNeutral': { type: 'number', unit: 'confidence points', min: 0, max: 100, label: 'Optimized two-pole confidenceNeutral', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceStrongDeltaThreshold': { type: 'number', unit: 'ratio', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole confidenceStrongDeltaThreshold', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceGoodDeltaThreshold': { type: 'number', unit: 'ratio', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole confidenceGoodDeltaThreshold', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceModerateDeltaThreshold': { type: 'number', unit: 'ratio', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole confidenceModerateDeltaThreshold', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceStrongDeltaBoost': { type: 'number', unit: 'confidence points', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole confidenceStrongDeltaBoost', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceGoodDeltaBoost': { type: 'number', unit: 'confidence points', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole confidenceGoodDeltaBoost', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceModerateDeltaBoost': { type: 'number', unit: 'confidence points', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole confidenceModerateDeltaBoost', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceWeakDeltaPenalty': { type: 'number', unit: 'confidence points', min: -Number.MAX_VALUE, max: 0, label: 'Optimized two-pole confidenceWeakDeltaPenalty', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.noisyFilterBelow': { type: 'number', unit: 'filter length', min: 0, max: Number.MAX_SAFE_INTEGER, label: 'Optimized two-pole noisyFilterBelow', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.noisyFilterPenalty': { type: 'number', unit: 'confidence points', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, label: 'Optimized two-pole noisyFilterPenalty', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.laggyFilterAbove': { type: 'number', unit: 'filter length', min: 0, max: Number.MAX_SAFE_INTEGER, label: 'Optimized two-pole laggyFilterAbove', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.laggyFilterPenalty': { type: 'number', unit: 'confidence points', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, label: 'Optimized two-pole laggyFilterPenalty', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceMin': { type: 'number', unit: 'confidence points', min: 0, max: 100, label: 'Optimized two-pole confidenceMin', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.confidenceMax': { type: 'number', unit: 'confidence points', min: 0, max: 100, label: 'Optimized two-pole confidenceMax', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.stopBufferFraction': { type: 'number', unit: 'price fraction', min: 0, max: Number.MAX_VALUE, label: 'Optimized two-pole stopBufferFraction', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.fallbackLongLowMultiplier': { type: 'number', unit: 'price multiplier', min: 0, exclusiveMin: true, max: Number.MAX_VALUE, label: 'Optimized two-pole fallbackLongLowMultiplier', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.fallbackShortHighMultiplier': { type: 'number', unit: 'price multiplier', min: 0, exclusiveMin: true, max: Number.MAX_VALUE, label: 'Optimized two-pole fallbackShortHighMultiplier', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  'indicators.optimized.twoPole.rewardRiskRatio': { type: 'number', unit: 'risk/reward ratio', min: 0, exclusiveMin: true, max: Number.MAX_VALUE, label: 'Optimized two-pole rewardRiskRatio', effect: 'next_optimized_indicator_engine_initialization_restart_required' },
  ...Object.fromEntries([
    ['volumeMinimumCandles', 'Volume feature minimum candles', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['volumeLookback', 'Volume feature lookback', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['volumeRatioCeiling', 'Volume feature normalization ceiling', { unit: 'volume ratio', min: 0, exclusiveMin: true, max: Number.MAX_VALUE }],
    ['volatilityPercentCeiling', 'Volatility feature normalization ceiling', { unit: 'ATR percent of price', min: 0, exclusiveMin: true, max: Number.MAX_VALUE }],
    ['changeMultiplier', 'Price-change feature normalization multiplier', { unit: 'multiplier', min: 0, max: Number.MAX_VALUE }],
    ['macdDeltaRange', 'MACD feature normalization range', { unit: 'MACD delta', min: 0, exclusiveMin: true, max: Number.MAX_VALUE }],
  ].map(([key, label, domain]) => [`featureExtraction.${key}`, {
    type: 'number', ...domain, label, effect: 'next_feature_extraction_changes_future_pattern_features',
  }])),
  ...Object.fromEntries([
    ['enabled', 'Enable TRAI advisor'],
    ['trackDecisions', 'Record TRAI decisions'],
    ['enableBacktest', 'Run TRAI during backtests'],
  ].map(([key, label]) => [`trai.${key}`, {
    type: 'boolean', unit: 'boolean', label, effect: 'next_bot_initialization_restart_required',
  }])),
  'trai.mode': {
    type: 'string', unit: 'mode', values: ['passive', 'advisory', 'hybrid', 'autonomous'],
    label: 'TRAI advisory mode', effect: 'next_bot_initialization_restart_required',
  },
  ...Object.fromEntries([
    ['weight', 'TRAI confidence contribution', { unit: 'confidence multiplier', min: 0, max: Number.MAX_VALUE }],
    ['maxRisk', 'TRAI maximum-loss advisory threshold', { unit: 'account currency', min: 0, max: Number.MAX_VALUE }],
    ['emergencyStopLoss', 'TRAI advisory stop distance when signal lacks a stop', { unit: 'price fraction', min: 0, max: Number.MAX_VALUE }],
    ['minConf', 'TRAI recommendation confidence threshold', { unit: 'confidence fraction', min: 0, max: 1 }],
    ['legacyPatternMinSamples', 'TRAI legacy pattern minimum samples', { unit: 'samples', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
  ].map(([key, label, domain]) => [`trai.${key}`, {
    type: 'number', ...domain, label, effect: 'next_bot_initialization_restart_required',
  }])),
  'exits.volatilityThreshold': {
    type: 'number', unit: 'ATR percent of price', min: 0, max: Number.MAX_VALUE,
    label: 'Exit volatility adjustment threshold', effect: 'new_trade_exit_contract',
  },
  ...Object.fromEntries([
    ['volatilitySlMultiplier', 'High-volatility stop-loss multiplier'],
    ['volatilityTpMultiplier', 'High-volatility take-profit multiplier'],
  ].map(([key, label]) => [`exits.${key}`, {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label, effect: 'new_trade_exit_contract',
  }])),
  ...Object.fromEntries([
    ['smaPeriods', 'SMA periods'], ['emaPeriods', 'EMA periods'],
  ].map(([key, label]) => [`indicators.engine.${key}`, {
    type: 'array', itemType: 'number', itemInteger: true, itemMin: 0, minItems: 1,
    unit: 'candles', label, effect: 'next_engine_initialization_restart_required',
  }])),
  ...Object.fromEntries([
    ['bbPeriod', 'Bollinger period', 'candles', 1], ['atrPeriod', 'ATR period', 'candles', 1],
    ['rsiPeriod', 'RSI period', 'candles', 1], ['stochRsiPeriod', 'Stochastic RSI period', 'candles', 1],
    ['stochRsiK', 'Stochastic RSI K period', 'candles', 1], ['stochRsiD', 'Stochastic RSI D period', 'candles', 1],
    ['adxPeriod', 'ADX period', 'candles', 1], ['superTrendPeriod', 'SuperTrend period', 'candles', 1],
    ['keltnerPeriod', 'Keltner period', 'candles', 1], ['donchianPeriod', 'Donchian period', 'candles', 1],
    ['mfiPeriod', 'MFI period', 'candles', 1], ['twoPolePeriod', 'Two-pole period', 'candles', 1],
    ['ogzTpoLength', 'OGZ TPO length', 'candles', 2], ['ogzTpoNormLength', 'OGZ TPO normalization length', 'candles', 2],
    ['ogzTpoVolLength', 'OGZ TPO volatility length', 'candles', 2], ['ichimokuTenkan', 'Ichimoku Tenkan', 'candles', 1],
    ['ichimokuKijun', 'Ichimoku Kijun', 'candles', 1], ['ichimokuSenkouB', 'Ichimoku Senkou B', 'candles', 1],
    ['pivotLeft', 'Pivot left window', 'candles', 0], ['pivotRight', 'Pivot right window', 'candles', 0],
    ['maxSRLevels', 'Maximum support/resistance levels', 'levels', 1],
    ['trendMinPivots', 'Minimum trend pivots', 'pivots', 1], ['trendMaxLookback', 'Trendline lookback', 'candles', 1],
  ].map(([key, label, unit, min]) => [`indicators.engine.${key}`, {
    type: 'number', unit, min, max: Number.MAX_SAFE_INTEGER, integer: true,
    label, effect: 'next_engine_initialization_restart_required',
  }])),
  ...Object.fromEntries([
    ['bbStdDev', 'Bollinger standard-deviation multiplier', 'multiplier', 0],
    ['superTrendMultiplier', 'SuperTrend multiplier', 'multiplier', 0],
    ['keltnerMultiplier', 'Keltner multiplier', 'multiplier', 0],
    ['srClusterPct', 'Support/resistance clustering fraction', 'fraction', 0],
  ].map(([key, label, unit, min]) => [`indicators.engine.${key}`, {
    type: 'number', unit, min, max: Number.MAX_VALUE,
    label, effect: 'next_engine_initialization_restart_required',
  }])),
  ...Object.fromEntries([
    ['twoPoleNormalizeByATR', 'Normalize two-pole oscillator by ATR'],
    ['ogzTpoEnabled', 'Enable OGZ TPO oscillator'],
    ['ogzTpoEmitMarkers', 'Emit OGZ TPO markers'],
  ].map(([key, label]) => [`indicators.engine.${key}`, {
    type: 'boolean', unit: 'boolean', label, effect: 'next_engine_initialization_restart_required',
  }])),
  'indicators.engine.macdFast': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'MACD fast period', effect: 'next_engine_initialization_restart_required',
  },
  'indicators.engine.macdSlow': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'MACD slow period', effect: 'next_engine_initialization_restart_required',
  },
  'indicators.engine.macdSignal': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'MACD signal period', effect: 'next_engine_initialization_restart_required',
  },
  'indicators.engine.ogzTpoLagBars': {
    type: 'number', unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'OGZ TPO lag bars', effect: 'next_engine_initialization_restart_required',
  },
  'indicators.engine.ichimokuDisplacement': {
    type: 'number', unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Ichimoku displacement', effect: 'next_engine_initialization_restart_required',
  },
  ...Object.fromEntries([
    ['tier1', 'First profit target'],
    ['tier2', 'Second profit target'],
    ['tier3', 'Third profit target'],
    ['final', 'Final profit target'],
  ].map(([key, label]) => [`exits.profitTiers.${key}`, {
    type: 'number', unit: 'price fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label, effect: 'new_trade_exit_policy_and_next_entry_consistency_budget',
  }])),
  'entryLogic.sizing.absoluteCapPercent': {
    type: 'number', unit: 'account fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'Absolute position-size cap', effect: 'next_entry_size_calculation',
  },
  'entryLogic.sizing.stockShareRange.enabled': {
    type: 'boolean', unit: 'boolean', label: 'Apply stock share limits', effect: 'next_stock_entry_size_calculation',
  },
  ...Object.fromEntries([
    ['minShares', 'Minimum whole shares', { unit: 'shares', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['maxShares', 'Maximum whole shares (0 disables this cap)', { unit: 'shares', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['maxNotionalUsd', 'Maximum stock order value (0 disables this cap)', { unit: 'USD', min: 0, max: Number.MAX_VALUE }],
    ['consistencyCapBuffer', 'Consistency profit-cap fraction', { unit: 'fraction', min: 0, exclusiveMin: true, max: 1 }],
    ['dailyLossRiskFraction', 'Daily-loss budget fraction per stock entry', { unit: 'fraction', min: 0, exclusiveMin: true, max: 1 }],
  ].map(([key, label, domain]) => [`entryLogic.sizing.stockShareRange.${key}`, {
    type: 'number', ...domain, label, effect: 'next_stock_entry_size_calculation',
  }])),
  ...Object.fromEntries([
    ['minimumCandles', 'Market regime minimum history', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['trendLookback', 'Market regime trend lookback', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['volatilityLookback', 'Market regime volatility lookback', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['directionalLookback', 'Market regime direction lookback', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['trendThreshold', 'Market regime trend threshold', { unit: 'price fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE }],
    ['strongTrendThreshold', 'Market regime strong-trend threshold', { unit: 'price fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE }],
    ['volatilityThreshold', 'Market regime volatility threshold', { unit: 'price fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE }],
    ['minTrendConsistency', 'Market regime minimum trend consistency', { unit: 'fraction', min: 0, max: 1 }],
    ['strongTrendConsistency', 'Market regime strong-trend consistency', { unit: 'fraction', min: 0, max: 1 }],
    ['consistencyConfidenceWeight', 'Market regime consistency confidence weight', { unit: 'fraction', min: 0, max: 1 }],
    ['dominanceConfidenceWeight', 'Market regime direction confidence weight', { unit: 'fraction', min: 0, max: 1 }],
    ['moderateTrendConfidenceMultiplier', 'Market regime moderate-trend confidence multiplier', { unit: 'multiplier', min: 0, max: 1 }],
    ['volatileConfidenceThresholdMultiplier', 'Market regime volatility confidence divisor', { unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_VALUE }],
  ].map(([key, label, domain]) => [`regimeDetection.${key}`, {
    type: 'number', ...domain, label, effect: 'next_market_regime_evaluation',
  }])),
  'strategies.NoWickImbalance.confidence': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'NoWick entry confidence', effect: 'next_entry_evaluation',
  },
  'strategies.NoWickImbalance.minBodyPercent': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'NoWick minimum candle body', effect: 'next_entry_evaluation',
  },
  'strategies.NoWickImbalance.entrySideWickMaxPct': {
    type: 'number', unit: 'percent', min: 0, max: 100,
    label: 'NoWick entry-side wick maximum', effect: 'next_entry_evaluation',
  },
  'strategies.NoWickImbalance.almostTouchPct': {
    type: 'number', unit: 'percent', min: 0, max: 100,
    label: 'NoWick almost-touch band', effect: 'next_entry_evaluation',
  },
  'strategies.NoWickImbalance.maxCandleAge': {
    type: 'number', unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, exclusiveMin: true, integer: true,
    label: 'NoWick pending-level lifetime', effect: 'next_observation_evaluation_affects_pending_expiry',
  },
  'strategies.NoWickImbalance.swingLookback': {
    type: 'number', unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, exclusiveMin: true, integer: true,
    label: 'NoWick trend swing lookback', effect: 'next_observation_evaluation',
  },
  'strategies.NoWickImbalance.swingExtremeLookback': {
    type: 'number', unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, exclusiveMin: true, integer: true,
    label: 'NoWick formation swing-extreme lookback', effect: 'next_observation_evaluation',
  },
  'exitContracts.NoWickImbalance.stopLookbackBars': {
    type: 'number', unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, exclusiveMin: true, integer: true,
    label: 'NoWick structural-stop lookback', effect: 'next_new_NoWick_signal_geometry',
  },
  'exitContracts.NoWickImbalance.stopBufferAtr': {
    type: 'number', unit: 'ATR multiples', min: 0, max: Number.MAX_VALUE,
    label: 'NoWick structural-stop buffer', effect: 'next_new_NoWick_signal_geometry',
  },
  'exitContracts.NoWickImbalance.targetRR': {
    type: 'number', unit: 'risk-reward ratio', min: 0, max: Number.MAX_VALUE, exclusiveMin: true,
    label: 'NoWick structural target reward ratio', effect: 'next_new_NoWick_signal_geometry',
  },
  'strategies.NoWickImbalance.entryMode': {
    type: 'string', unit: 'choice', values: ['tap', 'rejection'],
    label: 'NoWick pending-level entry mode', effect: 'next_NoWick_pending_entry_evaluation',
  },
  'strategies.NoWickImbalance.twinSplitEnabled': {
    type: 'boolean', unit: 'boolean',
    label: 'NoWick twin-entry split', effect: 'next_NoWick_formation_and_pending_entry_evaluation',
  },
  'strategies.NoWickImbalance.twinProximityBars': {
    type: 'number', unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, exclusiveMin: true, integer: true,
    label: 'NoWick twin formation proximity', effect: 'next_new_NoWick_formation_grouping',
  },
  ...Object.fromEntries([
    ['sessionLookback', 'BreakRetest level lookback', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['minLevelTests', 'BreakRetest minimum level tests', { unit: 'tests', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['swingLookback', 'BreakRetest swing lookback', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['maxRetestWait', 'BreakRetest maximum retest wait', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['minBattleCandles', 'BreakRetest minimum battle candles', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['maxBattleCandles', 'BreakRetest maximum battle candles', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['minimumHistoryBars', 'BreakRetest minimum history', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['recentBufferExtraBars', 'BreakRetest retained candle buffer', { unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['atrPeriod', 'BreakRetest ATR period', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['keyLevelRefreshBars', 'BreakRetest key-level refresh', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['minimumLevelHistoryBars', 'BreakRetest minimum level history', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['maxKeyLevels', 'BreakRetest maximum key levels', { unit: 'levels', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['minimumDefendingWicks', 'BreakRetest minimum defending wicks', { unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['battleConfidenceOffsetBars', 'BreakRetest battle confidence offset', { unit: 'candles', min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }],
  ].map(([key, label, domain]) => [`strategies.BreakRetest.${key}`, {
    type: 'number', ...domain, label, effect: 'next_BreakRetest_observation_and_entry_evaluation',
  }])),
  ...Object.fromEntries([
    ['srZonePct', 'BreakRetest support/resistance zone', 'percent'],
    ['breakConfirmPct', 'BreakRetest break confirmation', 'percent'],
    ['retestZonePct', 'BreakRetest retest zone', 'percent'],
    ['ntzMaxRangePct', 'BreakRetest no-trade-zone range', 'percent'],
    ['minBreakerBodyRatio', 'BreakRetest minimum breaker body', 'ATR multiples'],
    ['wickProximityFraction', 'BreakRetest wick proximity', 'fraction'],
    ['strongCandleAtrMultiplier', 'BreakRetest strong-candle threshold', 'ATR multiples'],
    ['secondaryTargetRiskMultiplier', 'BreakRetest signal PT2 metadata target', 'risk multiples'],
    ['invalidationThresholdMultiplier', 'BreakRetest invalidation threshold', 'multiplier'],
    ['fibDistance', 'BreakRetest Fibonacci proximity', 'fraction'],
    ['fibBoostNormal', 'BreakRetest Fibonacci confidence contribution', 'fraction'],
    ['fibBoostGolden', 'BreakRetest golden-zone confidence contribution', 'fraction'],
  ].map(([key, label, unit]) => [`strategies.BreakRetest.${key}`, {
    type: 'number', unit, min: 0, max: Number.MAX_VALUE,
    label,
    effect: key === 'secondaryTargetRiskMultiplier'
      ? 'next_BreakRetest_signal_pt2_metadata'
      : 'next_BreakRetest_observation_and_entry_evaluation',
  }])),
  'exitContracts.BreakRetest.rewardRiskRatio': {
    type: 'number', unit: 'risk-reward ratio', min: 0, max: Number.MAX_VALUE, exclusiveMin: true,
    label: 'BreakRetest signal take-profit risk ratio', effect: 'next_BreakRetest_signal_exit_levels_and_new_exit_contract',
  },
  'exitContracts.BreakRetest.stopBufferAtrMultiplier': {
    type: 'number', unit: 'ATR multiples', min: 0, max: Number.MAX_VALUE,
    label: 'BreakRetest signal stop-loss buffer', effect: 'next_BreakRetest_signal_exit_levels_and_new_exit_contract',
  },
  ...Object.fromEntries([
    ['baseConfidence', 'BreakRetest base confidence'],
    ['wickConfidencePerCount', 'BreakRetest per-wick confidence contribution'],
    ['wickConfidenceMax', 'BreakRetest wick confidence ceiling'],
    ['engulfingConfidenceBoost', 'BreakRetest engulfing confidence contribution'],
    ['strongCandleConfidenceBoost', 'BreakRetest strong-candle confidence contribution'],
    ['battleConfidencePerBar', 'BreakRetest battle confidence contribution'],
    ['battleConfidenceMax', 'BreakRetest battle confidence ceiling'],
    ['levelTestConfidencePerCount', 'BreakRetest level-test confidence contribution'],
    ['levelTestConfidenceMax', 'BreakRetest level-test confidence ceiling'],
    ['maxConfidence', 'BreakRetest confidence ceiling'],
  ].map(([key, label]) => [`strategies.BreakRetest.${key}`, {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label, effect: 'next_BreakRetest_entry_evaluation',
  }])),
  ...Object.fromEntries([
    ['enableRSI', 'RSI'],
    ['enableMADynamicSR', 'MADynamicSR'],
    ['enableEMACrossover', 'EMA crossover'],
    ['enableLiquiditySweep', 'Liquidity sweep'],
    ['enableCandlePattern', 'Candle pattern'],
    ['enableBreakRetest', 'Break and retest'],
    ['enableMarketRegime', 'Market regime'],
    ['enableOGZTPO', 'OGZ TPO'],
    ['enableOpeningRangeBreakout', 'Opening range breakout'],
    ['enableSmartMoneySweep', 'Smart money sweep'],
    ['enableNoWickImbalance', 'No wick imbalance'],
    ['enableDonchianBreakout', 'Donchian breakout'],
    ['enablePropSafeEMAPullback', 'PropSafe EMA pullback'],
    ['enableEMATrendRetest', 'EMA trend retest'],
    ['enableRSI2MeanReversion', 'RSI2 mean reversion'],
    ['enableTimeSeriesMomentum', 'Time series momentum'],
  ].map(([key, label]) => [`pipeline.${key}`, {
    type: 'boolean', unit: 'boolean', scope: 'active_launch_profile',
    label: `Enable ${label} strategy`, effect: 'next_entry_evaluation',
  }])),
  ...Object.fromEntries([
    ['confidenceBase', 'PropSafe base confidence'],
    ['confidenceTrendBonus', 'PropSafe trend confidence contribution'],
    ['confidencePullbackBonus', 'PropSafe pullback confidence contribution'],
    ['confidenceConfirmationBonus', 'PropSafe confirmation confidence contribution'],
    ['confidenceFreshCrossBonus', 'PropSafe fresh-cross confidence contribution'],
    ['maxConfidence', 'PropSafe confidence ceiling'],
  ].map(([key, label]) => [`strategies.PropSafeEMAPullback.${key}`, {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label, effect: 'next_entry_evaluation',
  }])),
  ...Object.fromEntries([
    ['confidenceBase', 'EMA retest base confidence'],
    ['confidenceSlopeBonus', 'EMA retest slope confidence contribution'],
    ['confidenceRetestBonus', 'EMA retest quality confidence contribution'],
    ['confidenceConfirmationBonus', 'EMA retest confirmation confidence contribution'],
    ['maxConfidence', 'EMA retest confidence ceiling'],
  ].map(([key, label]) => [`strategies.EMATrendRetest.${key}`, {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label, effect: 'next_entry_evaluation',
  }])),
  'strategies.EMATrendRetest.emaPeriods': {
    type: 'string', format: 'integer_list', unit: 'EMA periods in candles', itemMin: 1, itemExclusiveMin: true,
    itemInteger: true, minItems: 1,
    label: 'EMA retest periods', effect: 'next_entry_evaluation',
  },
  ...Object.fromEntries([
    ['manipCandle', 'Liquidity sweep manipulation-candle confidence weight'],
    ['wickSweep', 'Liquidity sweep wick confidence weight'],
    ['sweepReject', 'Liquidity sweep rejection confidence weight'],
    ['hammerPattern', 'Liquidity sweep hammer confidence weight'],
    ['engulfPattern', 'Liquidity sweep engulfing confidence weight'],
  ].map(([key, label]) => [`strategies.LiquiditySweep.weights.${key}`, {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label, effect: 'next_signal_calculation',
  }])),
  ...Object.fromEntries(Object.entries({
    atrMultiplier: { unit: 'ATR multiples', min: 0, exclusiveMin: true, label: 'Liquidity sweep ATR manipulation multiplier', effect: 'next_opening_range_qualification' },
    atrPeriod: { integer: true, max: Number.MAX_SAFE_INTEGER, unit: 'daily candles', min: 0, exclusiveMin: true, label: 'Liquidity sweep daily ATR period', effect: 'next_daily_close_ATR_calculation' },
    entryWindowMinutes: { unit: 'minutes', min: 0, exclusiveMin: true, label: 'Liquidity sweep entry window', effect: 'next_observation_entry_window_evaluation' },
    openingRangeMinutes: { unit: 'minutes', min: 0, exclusiveMin: true, label: 'Liquidity sweep opening range', effect: 'next_opening_range_aggregation' },
    hammerBodyMaxPct: { unit: 'fraction', min: 0, label: 'Liquidity sweep hammer maximum body', effect: 'next_reversal_pattern_evaluation' },
    hammerWickMinRatio: { unit: 'ratio', min: 0, label: 'Liquidity sweep hammer minimum wick ratio', effect: 'next_reversal_pattern_evaluation' },
    engulfMinRatio: { unit: 'ratio', min: 0, label: 'Liquidity sweep engulfing minimum ratio', effect: 'next_reversal_pattern_evaluation' },
    stopBufferPct: { unit: 'percent', min: 0, label: 'Liquidity sweep structural stop buffer', effect: 'next_new_signal_geometry' },
    sweepMinExtensionPct: { unit: 'percent', min: 0, label: 'Liquidity sweep minimum sweep extension', effect: 'next_opening_sweep_qualification' },
    sweepExtensionBandMult: { unit: 'multiplier', min: 0, exclusiveMin: true, label: 'Liquidity sweep sweep-extension band', effect: 'next_opening_sweep_qualification' },
    sweepLookbackBars: { integer: true, max: Number.MAX_SAFE_INTEGER, unit: 'daily candles', min: 0, exclusiveMin: true, label: 'Liquidity sweep retained sweep history', effect: 'next_daily_close_sweep_history_trim' },
    sessionOpenHour: { integer: true, max: 23, unit: 'UTC hour', min: 0, label: 'Liquidity sweep session-open hour', effect: 'next_UTC_session_open_observation' },
    sessionOpenMinute: { integer: true, max: 59, unit: 'UTC minute', min: 0, label: 'Liquidity sweep session-open minute', effect: 'next_UTC_session_open_observation' },
  }).map(([key, definition]) => [`strategies.LiquiditySweep.${key}`, {
    type: 'number', max: Number.MAX_VALUE, ...definition,
  }])),
  ...Object.fromEntries([
    ['baseConfidence', 'EMA crossover base confidence'],
    ['confluenceWeight', 'EMA crossover confluence confidence weight'],
    ['freshCrossoverBonusPerCross', 'EMA crossover bonus per fresh cross'],
    ['freshCrossoverBonusMax', 'EMA crossover maximum fresh-cross bonus'],
    ['maxConfidence', 'EMA crossover maximum confidence'],
  ].map(([key, label]) => [`strategies.EMASMACrossover.${key}`, {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label, effect: 'next_strategy_evaluation',
  }])),
  ...Object.fromEntries([
    ['decayBars', 'EMA crossover confidence-decay bars', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['decayMinMultiplier', 'EMA crossover minimum confidence-decay multiplier', { unit: 'fraction', min: 0, max: 1 }],
    ['velocityWindowBars', 'EMA crossover velocity window', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['velocityAtrPeriod', 'EMA crossover velocity ATR period', { unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }],
    ['velocityScale', 'EMA crossover velocity scale', { unit: 'scale', min: -Number.MAX_VALUE, max: Number.MAX_VALUE }],
    ['velocityMaxBoost', 'EMA crossover velocity maximum confidence boost', { unit: 'fraction', min: 0, max: 1 }],
    ['velocityMaxPenalty', 'EMA crossover velocity maximum confidence penalty', { unit: 'fraction', min: 0, max: 1 }],
    ['elasticityMinAtr', 'EMA crossover elasticity minimum ATR', { unit: 'ATR multiples', min: -Number.MAX_VALUE, max: Number.MAX_VALUE }],
    ['elasticityMaxAtr', 'EMA crossover elasticity maximum ATR', { unit: 'ATR multiples', min: -Number.MAX_VALUE, max: Number.MAX_VALUE }],
    ['elasticityScale', 'EMA crossover elasticity scale', { unit: 'scale', min: -Number.MAX_VALUE, max: Number.MAX_VALUE }],
    ['elasticityMaxBoost', 'EMA crossover elasticity maximum confidence boost', { unit: 'fraction', min: 0, max: 1 }],
    ['elasticityMaxPenalty', 'EMA crossover elasticity maximum confidence penalty', { unit: 'fraction', min: 0, max: 1 }],
  ].map(([key, label, domain]) => [`strategies.EMASMACrossover.${key}`, {
    type: 'number', ...domain,
    label, effect: 'next_EMASMACrossover_observation_and_evaluation',
  }])),
  'orchestrator.maDynamicSRMtf.requireHourlyTrendAlign': {
    type: 'boolean', unit: 'boolean',
    label: 'MA dynamic S/R require hourly trend alignment', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.maDynamicSRMtf.hourlyTrendConflictMultiplier': {
    type: 'number', unit: 'multiplier', min: 0, max: Number.MAX_SAFE_INTEGER,
    label: 'MA dynamic S/R hourly trend-conflict ranking multiplier', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.maDynamicSRMtf.fourHourAlignBoost': {
    type: 'number', unit: 'ranking_points', min: 0, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R four-hour alignment ranking boost', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.rsiMtf.penalizeAgainst4hTrend': {
    type: 'boolean', unit: 'boolean',
    label: 'RSI penalize four-hour trend conflict', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.rsiMtf.fourHourTrendConflictMultiplier': {
    type: 'number', unit: 'multiplier', min: 0, max: Number.MAX_SAFE_INTEGER,
    label: 'RSI four-hour trend-conflict ranking multiplier', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.rsiMtf.hourlyRsiAlignBoost': {
    type: 'number', unit: 'ranking_points', min: 0, max: Number.MAX_VALUE,
    label: 'RSI hourly alignment ranking boost', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.rsiMtf.hourlyRsiBuyMax': {
    type: 'number', unit: 'rsi_points', min: 0, max: Number.MAX_VALUE,
    label: 'RSI hourly buy-alignment threshold', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.rsiMtf.hourlyRsiSellMin': {
    type: 'number', unit: 'rsi_points', min: 0, max: Number.MAX_VALUE,
    label: 'RSI hourly sell-alignment threshold', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.ogzTpoMtf.fourHourTrendBoostMultiplier': {
    type: 'number', unit: 'multiplier', min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'OGZ TPO four-hour trend ranking multiplier', effect: 'next_strategy_ranking_evaluation',
  },
  'orchestrator.ogzTpoMtf.hourlyMacdAlignBoost': {
    type: 'number', unit: 'multiplier', min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'OGZ TPO hourly MACD alignment ranking multiplier', effect: 'next_strategy_ranking_evaluation',
  },
  ...Object.fromEntries([1, 2, 3, 4].map(count => [
    `positionSizing.confluenceMultipliers.${count}`,
    {
      type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true,
      max: Number.MAX_SAFE_INTEGER,
      label: `Sizing multiplier for ${count === 4 ? '4 or more' : count} agreeing strategies`,
      effect: 'next_entry_decision',
    },
  ])),
  'regimeBoosts.trending.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Trending EMA/SMA regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.trending.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Trending MA Dynamic SR regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.trending.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Trending RSI regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.trending.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Trending liquidity sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.trending.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Trending smart money sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.ranging.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Ranging EMA/SMA regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.ranging.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Ranging MA Dynamic SR regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.ranging.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Ranging RSI regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.ranging.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Ranging liquidity sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.ranging.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Ranging smart money sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.volatile.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Volatile EMA/SMA regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.volatile.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Volatile MA Dynamic SR regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.volatile.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Volatile RSI regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.volatile.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Volatile liquidity sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.volatile.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Volatile smart money sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.volatile._positionSizeMultiplier': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Volatile regime position sizing multiplier', effect: 'next_regime_evaluation_sizing',
  },
  'regimeBoosts.dead.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Dead EMA/SMA regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.dead.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Dead MA Dynamic SR regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.dead.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Dead RSI regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.dead.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Dead liquidity sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.dead.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Dead smart money sweep regime ranking multiplier', effect: 'next_regime_evaluation_ranking',
  },
  'regimeBoosts.dead._positionSizeMultiplier': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Dead regime position sizing multiplier', effect: 'next_regime_evaluation_sizing',
  },

  'positionSizing.maxPositions': {
    type: 'number', unit: 'positions per symbol', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Maximum open positions per symbol', effect: 'next_entry_decision',
  },
  'positionSizing.basePositionSize': {
    type: 'number', unit: 'fraction', min: 0, exclusiveMin: true, max: 1,
    label: 'Base position size', effect: 'next_entry_decision',
  },
  'positionSizing.maxPositionSize': {
    type: 'number', unit: 'fraction', min: 0, exclusiveMin: true, max: 0.25,
    label: 'Maximum position size', effect: 'next_entry_decision',
  },
  'strategies.MADynamicSR.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'MADynamicSR MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.MADynamicSR.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'MADynamicSR MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.EMASMACrossover.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'EMASMACrossover MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.EMASMACrossover.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'EMASMACrossover MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.LiquiditySweep.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'LiquiditySweep MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.LiquiditySweep.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'LiquiditySweep MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.RSI.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'RSI MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.RSI.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'RSI MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.BreakRetest.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'BreakRetest MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.BreakRetest.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'BreakRetest MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.CandlePattern.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'CandlePattern MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.CandlePattern.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'CandlePattern MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.MarketRegime.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'MarketRegime MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.MarketRegime.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'MarketRegime MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.SmartMoneySweep.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'SmartMoneySweep MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.SmartMoneySweep.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'SmartMoneySweep MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.SmartMoneySweep.vpDays': {
    type: "number", unit: "days", min: 1, max: 9007199254740991, integer: true, label: "Smart money sweep: Volume-profile lookback days", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.ivbMinutes': {
    type: "number", unit: "minutes", min: 1, max: 9007199254740991, integer: true, label: "Smart money sweep: Initial balance window", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.volAvgLen': {
    type: "number", unit: "candles", min: 1, max: 9007199254740991, integer: true, label: "Smart money sweep: Volume average period", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.cvdDivLen': {
    type: "number", unit: "candles", min: 1, max: 9007199254740991, integer: true, label: "Smart money sweep: Volume-delta divergence lookback", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.atrLen': {
    type: "number", unit: "candles", min: 1, max: 9007199254740991, integer: true, label: "Smart money sweep: ATR period", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.maxDailyLosses': {
    type: "number", unit: "losses", min: 0, max: 9007199254740991, integer: true, label: "Smart money sweep: Daily losing-trade limit", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.vpLookbackBars': {
    type: "number", unit: "candles", min: 0, max: 9007199254740991, integer: true, label: "Smart money sweep: Volume-profile candle lookback (0 uses days)", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.minConditionsGate': {
    type: "number", unit: "conditions", min: 0, max: 9007199254740991, integer: true, label: "Smart money sweep: Minimum satisfied entry conditions", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.breakHigh': {
    type: "number", unit: "conditions", min: 0, max: 9007199254740991, integer: true, label: "Smart money sweep: High-confidence condition count", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.breakMid': {
    type: "number", unit: "conditions", min: 0, max: 9007199254740991, integer: true, label: "Smart money sweep: Mid-confidence condition count", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.cashSessionStartHour': {
    type: "number", unit: "hour", min: 0, max: 23, integer: true, label: "Smart money sweep: Cash-session start hour (Eastern)", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.cashSessionEndHour': {
    type: "number", unit: "hour", min: 0, max: 23, integer: true, label: "Smart money sweep: Cash-session end hour (Eastern)", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.validSessionStartHour': {
    type: "number", unit: "hour", min: 0, max: 23, integer: true, label: "Smart money sweep: Entry-session start hour (Eastern)", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.validSessionEndHour': {
    type: "number", unit: "hour", min: 0, max: 23, integer: true, label: "Smart money sweep: Entry-session end hour (Eastern)", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.cashSessionStartMinute': {
    type: "number", unit: "minute", min: 0, max: 59, integer: true, label: "Smart money sweep: Cash-session start minute", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.cashSessionEndMinute': {
    type: "number", unit: "minute", min: 0, max: 59, integer: true, label: "Smart money sweep: Cash-session end minute", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.validSessionStartMinute': {
    type: "number", unit: "minute", min: 0, max: 59, integer: true, label: "Smart money sweep: Entry-session start minute", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.validSessionEndMinute': {
    type: "number", unit: "minute", min: 0, max: 59, integer: true, label: "Smart money sweep: Entry-session end minute", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.valueAreaPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Volume-profile value area", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.bodyWeightPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Candle-body volume share", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.lvnPctile': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Low-volume node percentile", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.absorbBodyPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Absorption maximum body share", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.absorbWickPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Absorption minimum wick share", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.initBodyPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Initiative minimum body share", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.absorbBodyProgPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Developing absorption maximum body share", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.absorbWickProgPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Developing absorption minimum wick share", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.initBodyProgPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Developing initiative minimum body share", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.slBufferPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Stop-loss buffer", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.maxLossPct': {
    type: "number", unit: "percent", min: 0, max: 100, label: "Smart money sweep: Maximum loss distance", effect: "next_SmartMoneySweep_observation_and_entry_evaluation",
  },
  'strategies.SmartMoneySweep.absorbVolMult': {
    type: "number", unit: "multiplier", min: 0, max: 1.7976931348623157e+308, label: "Smart money sweep: Absorption volume multiplier", effect: "next_SmartMoneySweep_entry_geometry_and_confidence",
  },
  'strategies.SmartMoneySweep.absorbVolProgMult': {
    type: "number", unit: "multiplier", min: 0, max: 1.7976931348623157e+308, label: "Smart money sweep: Developing absorption volume multiplier", effect: "next_SmartMoneySweep_entry_geometry_and_confidence",
  },
  'strategies.SmartMoneySweep.lowConvATRMult': {
    type: "number", unit: "multiplier", min: 0, max: 1.7976931348623157e+308, label: "Smart money sweep: Low-conviction target ATR multiplier", effect: "next_SmartMoneySweep_entry_geometry_and_confidence",
  },
  'strategies.SmartMoneySweep.midConvATRMult': {
    type: "number", unit: "multiplier", min: 0, max: 1.7976931348623157e+308, label: "Smart money sweep: Mid-conviction target ATR multiplier", effect: "next_SmartMoneySweep_entry_geometry_and_confidence",
  },
  'strategies.SmartMoneySweep.highConvATRMult': {
    type: "number", unit: "multiplier", min: 0, max: 1.7976931348623157e+308, label: "Smart money sweep: High-conviction target ATR multiplier", effect: "next_SmartMoneySweep_entry_geometry_and_confidence",
  },
  'strategies.SmartMoneySweep.tierHigh': {
    type: "number", unit: "fraction", min: 0, max: 1, label: "Smart money sweep: High confidence", effect: "next_SmartMoneySweep_confidence_evaluation",
  },
  'strategies.SmartMoneySweep.tierMid': {
    type: "number", unit: "fraction", min: 0, max: 1, label: "Smart money sweep: Mid confidence", effect: "next_SmartMoneySweep_confidence_evaluation",
  },
  'strategies.SmartMoneySweep.tierFloor': {
    type: "number", unit: "fraction", min: 0, max: 1, label: "Smart money sweep: Confidence floor", effect: "next_SmartMoneySweep_confidence_evaluation",
  },
  'strategies.SmartMoneySweep.useSessionFilter': {
    type: "boolean", unit: "boolean", label: "Smart money sweep session filter", effect: "next_SmartMoneySweep_session_evaluation",
  },
  'strategies.SmartMoneySweep.vpRthOnly': {
    type: "boolean", unit: "boolean", label: "Smart money sweep RTH profile", effect: "next_SmartMoneySweep_observation_evaluation",
  },
  'strategies.SmartMoneySweep.confidenceMode': {
    type: "string", unit: "mode", values: ["tiered", "continuous"], label: "Smart money sweep confidence mode", effect: "next_SmartMoneySweep_confidence_evaluation",
  },
  'strategies.OpeningRangeBreakout.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'OpeningRangeBreakout MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.OpeningRangeBreakout.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'OpeningRangeBreakout MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.OpeningRangeBreakout.sessionOpenHourUTC': {
    type: 'number', unit: 'UTC hour', min: 0, max: 23, integer: true,
    label: 'Opening range UTC session hour fallback when ET open is blank', effect: 'next_session_date_boundary_when_session_open_et_is_blank',
  },
  'strategies.OpeningRangeBreakout.sessionOpenET': {
    type: 'string', unit: 'HH:MM',
    label: 'Opening range session open in the configured timezone; takes precedence over UTC hour', effect: 'next_session_date_boundary',
  },
  'strategies.OpeningRangeBreakout.sessionTimeZone': {
    type: 'string', unit: 'IANA timezone',
    label: 'Opening range session timezone for the ET session-open owner', effect: 'next_session_date_boundary',
  },
  'strategies.OpeningRangeBreakout.orDurationMinutes': {
    type: 'number', unit: 'minutes', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Opening range collection duration', effect: 'next_session_opening_range_window',
  },
  'strategies.OpeningRangeBreakout.orMinWidthAtr': {
    type: 'number', unit: 'ATR multiples', min: 0, max: Number.MAX_VALUE,
    label: 'Opening range minimum width filter', effect: 'next_opening_range_finalization',
  },
  'strategies.OpeningRangeBreakout.fvgScanBars': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Opening range post-breakout FVG scan window', effect: 'next_FVG_scan_observation',
  },
  'strategies.OpeningRangeBreakout.minFVGPercent': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Opening range minimum fair-value-gap size', effect: 'next_FVG_detection',
  },
  'strategies.OpeningRangeBreakout.maxFVGPercent': {
    type: 'number', unit: 'percent', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'Opening range maximum fair-value-gap size', effect: 'next_FVG_detection',
  },
  'strategies.OpeningRangeBreakout.entryLevel': {
    type: 'string', unit: 'choice', values: ['top', 'middle', 'bottom'],
    label: 'Opening range fair-value-gap entry level', effect: 'next_generated_ORB_signal_geometry',
  },
  'exitContracts.OpeningRangeBreakout.stopBufferPct': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Opening range fair-value-gap stop buffer', effect: 'next_generated_ORB_signal_geometry',
  },
  'exitContracts.OpeningRangeBreakout.targetRR': {
    type: 'number', unit: 'risk-reward ratio', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'Opening range fair-value-gap target reward ratio', effect: 'next_generated_ORB_signal_geometry',
  },
  'exitContracts.OpeningRangeBreakout.trailingStopPercent': { type: 'number', unit: 'percent', min: 0, exclusiveMin: true, max: Number.MAX_VALUE, label: 'Opening range trailing stop distance', effect: 'next_generated_ORB_signal_geometry' },
  'exitContracts.OpeningRangeBreakout.trailingActivation': { type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE, label: 'Opening range trailing stop activation', effect: 'next_generated_ORB_signal_geometry' },
  'exitContracts.OpeningRangeBreakout.maxHoldTimeMinutes': { type: 'number', unit: 'minutes', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true, label: 'Opening range maximum hold time', effect: 'next_generated_ORB_signal_geometry' },
  'strategies.DonchianBreakout.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'DonchianBreakout MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.DonchianBreakout.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'DonchianBreakout MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.OGZTPO.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'OGZTPO MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.OGZTPO.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'OGZTPO MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.OGZTPO.mode': {
    type: 'string', unit: 'mode', values: ['conservative', 'standard', 'aggressive'], label: 'OGZTPO operating mode', effect: 'next_OGZTPO_update_and_signal_evaluation',
  },
  ...Object.fromEntries([
    ['dynamicSL', 'OGZTPO dynamic levels'], ['confluence', 'OGZTPO confluence requirement'],
  ].map(([key, label]) => [`strategies.OGZTPO.${key}`, { type: 'boolean', unit: 'boolean', label, effect: 'next_OGZTPO_signal_evaluation' }])),
  ...Object.fromEntries([
    ['voteWeight', 'OGZTPO vote weight', 'weight', 0, false, 'next_OGZTPO_vote_evaluation'],
    ['tpoLength', 'OGZTPO oscillator length', 'candles', 0, true, 'next_OGZTPO_update_and_calculation'],
    ['normLength', 'OGZTPO normalization length', 'candles', 0, true, 'next_OGZTPO_update_and_calculation', true],
    ['volLength', 'OGZTPO volatility length', 'candles', 0, true, 'next_OGZTPO_update_and_calculation', true],
    ['lagBars', 'OGZTPO lag bars', 'candles', 1, false, 'next_OGZTPO_update_and_calculation', true],
    ['maxHistory', 'OGZTPO retained history', 'candles', 0, true, 'next_OGZTPO_update_history_bound', true],
    ['lastSignalTtlBars', 'OGZTPO signal TTL', 'candles', 0, false, 'next_OGZTPO_signal_freshness_evaluation', true],
    ['confluenceBonusStrength', 'OGZTPO confluence vote strength', 'strength_points', 0, false, 'next_OGZTPO_vote_evaluation'],
    ['strengthConfidenceMultiplier', 'OGZTPO signal confidence multiplier', 'multiplier', 0, true, 'next_OGZTPO_entry_evaluation'],
  ].map(([key, label, unit, min, exclusiveMin, effect, integer]) => [`strategies.OGZTPO.${key}`, { type: 'number', unit, min, max: Number.MAX_VALUE, exclusiveMin, ...(integer ? { integer: true } : {}), label, effect }])),
  ...Object.fromEntries(['conservative', 'standard', 'aggressive'].flatMap((mode) => [
    [`strategies.OGZTPO.dynamicLevelMultipliers.${mode}`, { type: 'number', unit: 'multiplier', min: 0, max: Number.MAX_VALUE, exclusiveMin: true, label: `OGZTPO ${mode} dynamic-level multiplier`, effect: 'next_OGZTPO_signal_evaluation' }],
    [`strategies.OGZTPO.modes.${mode}.minStrength`, { type: 'number', unit: 'fraction', min: 0, max: Number.MAX_VALUE, label: `OGZTPO ${mode} minimum strength`, effect: 'next_OGZTPO_signal_evaluation' }],
    [`strategies.OGZTPO.modes.${mode}.zoneRequired`, { type: 'boolean', unit: 'boolean', label: `OGZTPO ${mode} zone requirement`, effect: 'next_OGZTPO_signal_evaluation' }],
    [`strategies.OGZTPO.modes.${mode}.voteMultiplier`, { type: 'number', unit: 'multiplier', min: 0, max: Number.MAX_VALUE, exclusiveMin: true, label: `OGZTPO ${mode} vote multiplier`, effect: 'next_OGZTPO_vote_evaluation' }],
  ])),
  'strategies.NoWickImbalance.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'NoWickImbalance MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.NoWickImbalance.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'NoWickImbalance MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.PropSafeEMAPullback.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'PropSafeEMAPullback MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.PropSafeEMAPullback.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'PropSafeEMAPullback MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.EMATrendRetest.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'EMATrendRetest MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.EMATrendRetest.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'EMATrendRetest MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.RSI2MeanReversion.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'RSI2MeanReversion MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.RSI2MeanReversion.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'RSI2MeanReversion MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.TimeSeriesMomentum.confluenceBoost.enabled': {
    type: 'boolean', unit: 'boolean',
    label: 'TimeSeriesMomentum MTF confluence contribution', effect: 'next_entry_evaluation_ranking',
  },
  'strategies.TimeSeriesMomentum.confluenceBoost.weight': {
    type: 'number', unit: 'weight', min: 0, max: Number.MAX_VALUE,
    label: 'TimeSeriesMomentum MTF confluence weight', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.aboveVAH.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Above value area high: EMA/SMA ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.aboveVAH.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Above value area high: MA Dynamic SR ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.aboveVAH.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Above value area high: RSI ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.aboveVAH.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Above value area high: Liquidity sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.aboveVAH.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Above value area high: Smart money sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.belowVAL.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Below value area low: EMA/SMA ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.belowVAL.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Below value area low: MA Dynamic SR ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.belowVAL.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Below value area low: RSI ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.belowVAL.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Below value area low: Liquidity sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.belowVAL.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Below value area low: Smart money sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.atPOC.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'At point of control: EMA/SMA ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.atPOC.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'At point of control: MA Dynamic SR ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.atPOC.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'At point of control: RSI ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.atPOC.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'At point of control: Liquidity sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.atPOC.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'At point of control: Smart money sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.inLVN._allStrategies': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Near low-volume node: all strategies ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.inValueArea.EMASMACrossover': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Inside value area: EMA/SMA ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.inValueArea.MADynamicSR': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Inside value area: MA Dynamic SR ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.inValueArea.RSI': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Inside value area: RSI ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.inValueArea.LiquiditySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Inside value area: Liquidity sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'volumeProfileBoosts.inValueArea.SmartMoneySweep': {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER,
    label: 'Inside value area: Smart money sweep ranking multiplier', effect: 'next_entry_evaluation_ranking',
  },
  'fees.slippage': {
    type: 'number', unit: 'fraction', min: 0, max: 1, exclusiveMax: true,
    label: 'Simulated fill slippage', effect: 'next_simulated_fill',
  },
  'fees.model': {
    type: 'string', values: ['percent', 'per_share_minimum'], unit: 'model',
    label: 'Trading fee model', effect: 'next_fee_calculation',
  },
  'fees.makerFee': {
    type: 'number', unit: 'fraction', min: 0, max: Number.MAX_VALUE,
    label: 'Maker fee', effect: 'next_fee_calculation',
  },
  'fees.takerFee': {
    type: 'number', unit: 'fraction', min: 0, max: Number.MAX_VALUE,
    label: 'Taker fee', effect: 'next_fee_calculation',
  },
  'fees.perShare': {
    type: 'number', unit: 'currency_per_share', min: 0, max: Number.MAX_VALUE,
    label: 'Per-share fee', effect: 'next_fee_calculation',
  },
  'fees.minOrderFee': {
    type: 'number', unit: 'currency', min: 0, max: Number.MAX_VALUE,
    label: 'Minimum order fee', effect: 'next_fee_calculation',
  },
  'features.enableDynamicSizing': {
    type: 'boolean', unit: 'boolean',
    label: 'Dynamic confidence sizing', effect: 'next_entry_decision',
  },

  'confidence.minTradeConfidence': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    scope: 'active_launch_profile', label: 'Minimum entry confidence',
    effect: 'next_entry_decision',
  },
  'confidence.minStrategyConfidence': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'Minimum individual strategy confidence',
    effect: 'next_strategy_evaluation',
  },
  'confidence.candlePatternMinConfidence': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'Minimum candle-pattern confidence',
    effect: 'next_pattern_evaluation',
  },

  'filters.atrEnabled': {
    type: 'boolean', unit: 'boolean', label: 'ATR entry filter',
    effect: 'next_strategy_evaluation',
  },
  'filters.atrMinPercent': {
    type: 'number', unit: 'percent', min: 0, max: 100,
    label: 'Global ATR entry minimum',
    effect: 'next_strategy_evaluation_without_strategy_atr_override',
  },
  'strategies.MADynamicSR.baseConfidence': {
    type: 'number', unit: 'fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R base confidence', effect: 'next_MADynamicSR_signal_evaluation',
  },
  'strategies.MADynamicSR.touchQualityWeight': {
    type: 'number', unit: 'fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R touch quality confidence contribution', effect: 'next_MADynamicSR_signal_evaluation',
  },
  'strategies.MADynamicSR.maxConfidence': {
    type: 'number', unit: 'fraction', min: 0, exclusiveMin: true, max: 1,
    label: 'MA dynamic S/R confidence ceiling', effect: 'next_MADynamicSR_signal_evaluation',
  },
  'strategies.MADynamicSR.touchZonePct': {
    type: 'number', unit: 'percent', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R entry-MA touch zone', effect: 'next_MADynamicSR_signal_evaluation',
  },
  'strategies.MADynamicSR.minSlopePct': {
    type: 'number', unit: 'percent', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R minimum EMA slope', effect: 'next_MADynamicSR_signal_evaluation',
  },
  ...Object.fromEntries([
    ['approachSide', 'MA dynamic S/R approach-side entry condition'],
    ['extension', 'MA dynamic S/R extension confidence condition'],
    ['firstTouchAfterParabolic', 'MA dynamic S/R first-touch-after-extension confidence condition'],
    ['pullbackCooldown', 'MA dynamic S/R pullback cooldown confidence condition'],
    ['confirmationCandle', 'MA dynamic S/R confirmation-candle confidence condition'],
    ['srAlignment', 'MA dynamic S/R support/resistance alignment confidence condition'],
    ['structuralValidity', 'MA dynamic S/R structural-validity confidence condition'],
  ].map(([key, label]) => [`strategies.MADynamicSR.conditionFlags.${key}`, {
    type: 'boolean', unit: 'boolean', label, effect: 'next_MADynamicSR_signal_evaluation',
  }])),
  ...Object.fromEntries([
    ['allowLongFromAbove', 'MA dynamic S/R allow long approach from above'],
    ['allowLongFromBelowBullReclaim', 'MA dynamic S/R allow long approach from below after bullish reclaim'],
    ['allowLongFromBelowOutsideBull', 'MA dynamic S/R allow long approach from below outside bullish regime'],
    ['allowShortFromBelow', 'MA dynamic S/R allow short approach from below'],
    ['allowShortFromAboveBearReclaim', 'MA dynamic S/R allow short approach from above after bearish reclaim'],
    ['allowShortFromAboveOutsideBear', 'MA dynamic S/R allow short approach from above outside bearish regime'],
  ].map(([key, label]) => [`strategies.MADynamicSR.approachRules.${key}`, {
    type: 'boolean', unit: 'boolean', label, effect: 'next_MADynamicSR_signal_evaluation',
  }])),
  ...Object.fromEntries([
    ['extensionMin', 'MA dynamic S/R extension confidence floor'],
    ['extensionPenaltyScale', 'MA dynamic S/R extension confidence penalty scale'],
    ['firstTouchAfterParabolic', 'MA dynamic S/R first-touch-after-extension confidence multiplier'],
    ['pullbackCooldown', 'MA dynamic S/R pullback cooldown confidence multiplier'],
    ['confirmationAligned', 'MA dynamic S/R aligned-confirmation confidence multiplier'],
    ['confirmationMissing', 'MA dynamic S/R missing-confirmation confidence multiplier'],
    ['confirmationConflict', 'MA dynamic S/R conflicting-confirmation confidence multiplier'],
    ['srAligned', 'MA dynamic S/R aligned S/R confidence multiplier'],
    ['srMissing', 'MA dynamic S/R missing S/R confidence multiplier'],
    ['srWrongSide', 'MA dynamic S/R wrong-side S/R confidence multiplier'],
    ['structuralValid', 'MA dynamic S/R valid-structure confidence multiplier'],
    ['structuralInvalid', 'MA dynamic S/R invalid-structure confidence multiplier'],
  ].map(([key, label]) => [`strategies.MADynamicSR.multipliers.${key}`, {
    type: 'number', unit: 'multiplier', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label, effect: 'next_MADynamicSR_signal_confidence_evaluation',
  }])),
  'strategies.MADynamicSR.structural.atrBufferMultiplier': {
    type: 'number', unit: 'atr_multiple', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R structural ATR buffer', effect: 'next_MADynamicSR_signal_confidence_evaluation',
  },
  'strategies.MADynamicSR.structural.rewardRiskTarget': {
    type: 'number', unit: 'risk-reward ratio', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R structural reward-risk target', effect: 'next_MADynamicSR_signal_confidence_evaluation',
  },
  'strategies.MADynamicSR.structural.minRewardRisk': {
    type: 'number', unit: 'risk-reward ratio', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R minimum structural reward-risk', effect: 'next_MADynamicSR_signal_confidence_evaluation',
  },
  'strategies.MADynamicSR.structural.minTakeProfitPct': {
    type: 'number', unit: 'fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R minimum structural take-profit distance', effect: 'next_MADynamicSR_signal_confidence_evaluation',
  },
  ...Object.fromEntries([
    ['entryMaPeriod', 'MA dynamic S/R entry EMA period'],
    ['srMaPeriod', 'MA dynamic S/R support/resistance EMA period'],
    ['atrPeriod', 'MA dynamic S/R ATR period'],
    ['swingLookback', 'MA dynamic S/R swing lookback'],
  ].map(([key, label]) => [`strategies.MADynamicSR.${key}`, {
    type: 'number', unit: 'candles', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER, integer: true,
    label, effect: 'next_MADynamicSR_observation_evaluation',
  }])),
  'strategies.MADynamicSR.srTestCount': {
    type: 'number', unit: 'tests', min: 0, exclusiveMin: true, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'MA dynamic S/R required S/R tests', effect: 'next_MADynamicSR_observation_evaluation',
  },
  'strategies.MADynamicSR.slopeLookback': {
    type: 'number', unit: 'candles', min: 2, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'MA dynamic S/R EMA slope lookback', effect: 'next_MADynamicSR_signal_evaluation',
  },
  'strategies.MADynamicSR.srZonePct': {
    type: 'number', unit: 'percent', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R support/resistance zone', effect: 'next_MADynamicSR_observation_evaluation',
  },
  'strategies.MADynamicSR.maxExtensionAtr': {
    type: 'number', unit: 'atr_multiple', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'MA dynamic S/R maximum extension', effect: 'next_MADynamicSR_signal_evaluation',
  },
  'strategies.VolumeProfile.sessionLookback': {
    type: 'number', unit: 'candles', min: 20, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Volume profile history', effect: 'next_scheduled_volume_profile_rebuild',
  },
  ...Object.fromEntries([
    ['valueAreaPct', 'Volume profile value-area share'],
    ['lvnThresholdPct', 'Volume profile low-volume threshold'],
    ['hvnThresholdPct', 'Volume profile high-volume threshold'],
  ].map(([key, label]) => [`strategies.VolumeProfile.${key}`, {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label, effect: 'next_scheduled_volume_profile_rebuild',
  }])),
  'strategies.VolumeProfile.outOfBalancePct': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Volume profile out-of-balance distance', effect: 'next_volume_profile_market_state_read',
  },
  'strategies.VolumeProfile.recalcInterval': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Volume profile rebuild interval', effect: 'next_volume_profile_observation',
  },
  'strategies.RSI.period': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'RSI period', effect: 'next_RSI_entry_and_its_owned_exit',
  },
  'strategies.RSI.buyBelow': {
    type: 'number', unit: 'rsi_points', min: 1, max: 99,
    label: 'RSI buy below', effect: 'next_RSI_entry',
  },
  'strategies.RSI.exitAbove': {
    type: 'number', unit: 'rsi_points', min: 1, max: 99,
    label: 'RSI exit above', effect: 'new_RSI_trades_only',
  },
  'strategies.RSI.confidenceBase': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'RSI base confidence', effect: 'next_RSI_entry_evaluation',
  },
  'strategies.RSI.confidenceDepthRange': {
    type: 'number', unit: 'rsi_points', min: 0.000001, max: Number.MAX_VALUE,
    label: 'RSI depth for full confidence contribution', effect: 'next_RSI_entry_evaluation',
  },
  'strategies.RSI.confidenceDepthMultiplier': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'RSI depth confidence contribution', effect: 'next_RSI_entry_evaluation',
  },
  'strategies.RSI.maxConfidence': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'RSI confidence ceiling', effect: 'next_RSI_entry_evaluation',
  },
  'strategies.RSI.regimeMaFilter.enabled': {
    type: 'boolean', unit: 'boolean', label: 'RSI moving-average entry condition',
    effect: 'next_RSI_entry',
  },
  'strategies.RSI.regimeMaFilter.period': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'RSI moving-average period', effect: 'next_RSI_entry_after_lookback_ready',
  },
  'strategies.RSI.regimeMaFilter.timeframe': {
    type: 'string', unit: 'timeframe', values: ['trading', '1h', '4h'],
    label: 'RSI moving-average timeframe', effect: 'next_RSI_entry_using_selected_frame_candles',
  },
  'strategies.DonchianBreakout.entryPeriod': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Donchian entry channel period', effect: 'next_Donchian_entry_after_lookback_ready',
  },
  'strategies.DonchianBreakout.atrPeriod': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Donchian ATR period', effect: 'next_Donchian_entry_risk_and_confidence',
  },
  'exitContracts.DonchianBreakout.atrStopMult': {
    type: 'number', unit: 'atr_multiple', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'Donchian stop ATR multiple', effect: 'new_Donchian_trade_stop_only',
  },
  'strategies.DonchianBreakout.allowShorts': {
    type: 'boolean', unit: 'boolean', label: 'Donchian short signals',
    effect: 'next_Donchian_evaluation_subject_to_existing_direction_policy',
  },
  'exitContracts.DonchianBreakout.trailChannelBars': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Donchian exit channel period', effect: 'new_Donchian_trade_channel_trail_only',
  },
  'strategies.TimeSeriesMomentum.confidenceBase': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'Momentum base confidence', effect: 'next_TSM_entry_evaluation',
  },
  'strategies.TimeSeriesMomentum.confidenceReturnMultiplier': {
    type: 'number', unit: 'confidence_per_return_fraction', min: 0, exclusiveMin: true, max: Number.MAX_VALUE,
    label: 'Momentum return confidence multiplier', effect: 'next_TSM_entry_evaluation',
  },
  'strategies.TimeSeriesMomentum.maxConfidence': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'Momentum confidence ceiling', effect: 'next_TSM_entry_evaluation',
  },
  'strategies.TimeSeriesMomentum.lookback': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Momentum return lookback', effect: 'next_TSM_entry_and_new_trade_return_flip_exit',
  },
  'strategies.TimeSeriesMomentum.trendPeriod': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Momentum trend period', effect: 'next_TSM_evaluation_after_lookback_available',
  },
  'strategies.TimeSeriesMomentum.atrPeriod': {
    type: 'number', unit: 'candles', min: 1, max: Number.MAX_SAFE_INTEGER, integer: true,
    label: 'Momentum entry-stop ATR period', effect: 'new_TSM_entry_stop_only',
  },
  'strategies.TimeSeriesMomentum.minReturn': {
    type: 'number', unit: 'fraction', min: 0, max: Number.MAX_VALUE,
    label: 'Momentum minimum return', effect: 'next_TSM_entry_evaluation',
  },
  'strategies.TimeSeriesMomentum.allowShorts': {
    type: 'boolean', unit: 'boolean', label: 'Momentum short signals',
    effect: 'next_TSM_evaluation_subject_to_existing_direction_policy',
  },
  'exitContracts.TimeSeriesMomentum.atrStopMult': {
    type: 'number', unit: 'atr_multiple', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'Momentum entry-stop ATR multiple', effect: 'new_TSM_entry_stop_only',
  },
  'exitContracts.TimeSeriesMomentum.trailAtrMult': {
    type: 'number', unit: 'atr_multiple', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'Momentum trailing ATR multiple', effect: 'new_TSM_trade_existing_dynamic_trailing_policy',
  },
  'exitLogic.trail.enabled': {
    type: 'boolean', unit: 'boolean', label: 'Managed ATR trailing for new trades',
    effect: 'new_trades_only_except_contract_channel_trailing',
  },
  'exitLogic.trail.minActivationPercent': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Managed trail activation profit', effect: 'new_trades_only',
  },
  'exitLogic.trail.atrMultiplier': {
    type: 'number', unit: 'atr_multiple', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'Trail ATR multiple for contracts without their own multiple', effect: 'new_trades_without_contract_trailAtrMult',
  },
  'exitLogic.trail.trendWidenMultiplier': {
    type: 'number', unit: 'multiple', min: 1, max: Number.MAX_VALUE,
    label: 'Trend-supported trail widening', effect: 'new_trades_only',
  },
  'exitLogic.trail.structureTightenMultiplier': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'Nearby-structure trail tightening', effect: 'new_trades_only_with_structure_evidence',
  },
  'exitLogic.trail.structureDistanceThreshold': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Structure distance for trail tightening (zero disables)', effect: 'new_trades_only_with_structure_evidence',
  },
  'exitLogic.trail.profitRatchetThreshold': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Profit threshold for trail ratcheting', effect: 'new_trades_only',
  },
  'exitLogic.trail.profitRatchetRate': {
    type: 'number', unit: 'fraction_per_profit_percentage_point', min: 0, max: Number.MAX_VALUE,
    label: 'Trail ratchet rate (zero disables)', effect: 'new_trades_only',
  },
  'exitLogic.trail.profitRatchetFloor': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'Minimum trail ratchet factor', effect: 'new_trades_only',
  },
  'exitLogic.trail.minTrailPercent': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Minimum managed trail distance', effect: 'new_trades_only',
  },
  'exitLogic.trail.maxTrailPercent': {
    type: 'number', unit: 'percent', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'Maximum managed trail distance', effect: 'new_trades_only',
  },
  'exitLogic.trail.feeBufferPercent': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Managed break-even stop buffer', effect: 'new_trades_only_not_legacy_1R_fee_model',
  },
  'exitLogic.breakEvenStop.enabled': {
    type: 'boolean', unit: 'boolean', label: 'Managed profit-threshold break-even stop',
    effect: 'new_trades_only_not_legacy_1R_break_even',
  },
  'exitLogic.breakEvenStop.triggerPercent': {
    type: 'number', unit: 'percent', min: 0, max: Number.MAX_VALUE,
    label: 'Managed break-even profit trigger', effect: 'new_trades_only',
  },
  'strategies.RSI2MeanReversion.confidenceBase': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'RSI2 base confidence', effect: 'next_RSI2_entry_evaluation',
  },
  'strategies.RSI2MeanReversion.confidenceDepthMultiplier': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'RSI2 depth confidence multiplier', effect: 'next_RSI2_entry_evaluation',
  },
  'strategies.RSI2MeanReversion.maxConfidence': {
    type: 'number', unit: 'fraction', min: 0, max: 1,
    label: 'RSI2 confidence ceiling', effect: 'next_RSI2_entry_evaluation',
  },
  'strategies.RSI2MeanReversion.rsiPeriod': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'RSI2 period', effect: 'next_entry_and_new_trade_rsi_exit',
  },
  'strategies.RSI2MeanReversion.rsiEntry': {
    type: 'number', unit: 'rsi_points', min: 0, max: 50, exclusiveMin: true, exclusiveMax: true,
    label: 'RSI2 long entry below', effect: 'next_entry_evaluation',
  },
  'exitContracts.RSI2MeanReversion.rsiExitLong': {
    type: 'number', unit: 'rsi_points', min: 50, max: 99, exclusiveMin: true,
    label: 'RSI2 long exit at or above', effect: 'new_long_trades_only',
  },
  'strategies.RSI2MeanReversion.rsiEntryOB': {
    type: 'number', unit: 'rsi_points', min: 50, max: 100, exclusiveMin: true, exclusiveMax: true,
    label: 'RSI2 short entry above', effect: 'next_entry_when_shorts_allowed',
  },
  'strategies.RSI2MeanReversion.trendPeriod': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'RSI2 trend SMA period', effect: 'next_entry_with_selected_lookback',
  },
  'strategies.RSI2MeanReversion.allowShorts': {
    type: 'boolean', unit: 'boolean', label: 'Allow RSI2 short signals', effect: 'next_entry_evaluation',
  },
  'exitContracts.RSI2MeanReversion.stopLossPercent': {
    // The order consumer requires a nonzero fraction strictly below one.
    type: 'number', unit: 'percent', min: -100, exclusiveMin: true, max: -(Number.MIN_VALUE * 100),
    label: 'RSI2 initial stop (negative percent)', effect: 'new_trades_only',
  },
  'exitContracts.RSI2MeanReversion.takeProfitPercent': {
    type: 'number', unit: 'percent', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'RSI2 profit target', effect: 'new_trades_only',
  },
  'exitContracts.RSI2MeanReversion.trailingStopPercent': {
    type: 'number', unit: 'percent', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'RSI2 trailing distance', effect: 'new_trades_only',
  },
  'exitContracts.RSI2MeanReversion.trailingActivation': {
    type: 'number', unit: 'percent', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'RSI2 trailing activation', effect: 'new_trades_only',
  },
  'exitContracts.RSI2MeanReversion.maxHoldTimeMinutes': {
    type: 'number', unit: 'minutes', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'RSI2 maximum hold', effect: 'new_trades_only',
  },
  'strategies.PropSafeEMAPullback.fastEmaPeriod': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'PropSafe fast EMA', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.pullbackEmaPeriod': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'PropSafe pullback EMA', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.trendEmaPeriod': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'PropSafe trend EMA', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.atrPeriod': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'PropSafe ATR period', effect: 'next_entry_and_new_trade_stop',
  },
  'strategies.PropSafeEMAPullback.crossLookbackBars': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'PropSafe fresh-cross lookback', effect: 'next_entry_confidence',
  },
  'strategies.PropSafeEMAPullback.pullbackLookbackBars': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'PropSafe pullback lookback', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.pullbackMinAtr': {
    type: 'number', unit: 'ATR multiples', min: 0, max: Number.MAX_VALUE,
    label: 'PropSafe minimum pullback distance', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.pullbackMaxAtr': {
    type: 'number', unit: 'ATR multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'PropSafe maximum pullback distance', effect: 'next_entry_evaluation',
  },
  'exitContracts.PropSafeEMAPullback.atrStopMult': {
    type: 'number', unit: 'ATR multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'PropSafe initial stop ATR multiple', effect: 'new_trades_only',
  },
  'exitContracts.PropSafeEMAPullback.targetRR': {
    type: 'number', unit: 'risk-reward ratio', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'PropSafe target reward/risk', effect: 'new_trades_only',
  },
  'exitContracts.PropSafeEMAPullback.trailActivationR': {
    type: 'number', unit: 'risk multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'PropSafe trailing activation', effect: 'new_trades_only',
  },
  'exitContracts.PropSafeEMAPullback.trailDistanceR': {
    type: 'number', unit: 'risk multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'PropSafe trailing distance', effect: 'new_trades_only',
  },
  'exitContracts.PropSafeEMAPullback.maxHoldTimeMinutes': {
    type: 'number', unit: 'minutes', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'PropSafe maximum hold', effect: 'new_trades_only',
  },
  'strategies.PropSafeEMAPullback.requireRth': {
    type: 'boolean', unit: 'boolean', label: 'Require PropSafe regular trading hours', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.rthStartET': {
    type: 'string', unit: 'HH:mm', label: 'PropSafe session start', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.rthEndET': {
    type: 'string', unit: 'HH:mm', label: 'PropSafe session end', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.sessionTimeZone': {
    type: 'string', unit: 'IANA time zone', label: 'PropSafe session time zone', effect: 'next_entry_evaluation',
  },
  'strategies.PropSafeEMAPullback.allowShorts': {
    type: 'boolean', unit: 'boolean', label: 'Allow PropSafe short signals', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.atrPeriod': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'EMA retest ATR period', effect: 'next_entry_and_new_trade_stop',
  },
  'strategies.EMATrendRetest.slopeLookbackBars': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'EMA retest slope lookback', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.minSlopePct': {
    type: 'number', unit: 'percent', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest minimum EMA slope', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.retestLookbackBars': {
    type: 'number', unit: 'candles', integer: true, min: 1, max: Number.MAX_SAFE_INTEGER,
    label: 'EMA retest retest lookback', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.touchZoneAtr': {
    type: 'number', unit: 'ATR multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest touch zone', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.closeAwayAtr': {
    type: 'number', unit: 'ATR multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest confirmation distance', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.maxExtensionAtr': {
    type: 'number', unit: 'ATR multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest maximum extension', effect: 'next_entry_evaluation',
  },
  'exitContracts.EMATrendRetest.atrStopMult': {
    type: 'number', unit: 'ATR multiples', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest initial stop distance', effect: 'new_trades_only',
  },
  'exitContracts.EMATrendRetest.targetRR': {
    type: 'number', unit: 'R multiple', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest profit target multiple', effect: 'new_trades_only',
  },
  'exitContracts.EMATrendRetest.trailActivationR': {
    type: 'number', unit: 'R multiple', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest trailing activation multiple', effect: 'new_trades_only',
  },
  'exitContracts.EMATrendRetest.trailDistanceR': {
    type: 'number', unit: 'R multiple', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest trailing distance multiple', effect: 'new_trades_only',
  },
  'exitContracts.EMATrendRetest.maxHoldTimeMinutes': {
    type: 'number', unit: 'minutes', min: Number.MIN_VALUE, max: Number.MAX_VALUE,
    label: 'EMA retest maximum hold', effect: 'new_trades_only',
  },
  'strategies.EMATrendRetest.requireRth': {
    type: 'boolean', unit: 'boolean', label: 'Require EMA retest regular trading hours', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.rthStartET': {
    type: 'string', unit: 'HH:mm', label: 'EMA retest session start', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.rthEndET': {
    type: 'string', unit: 'HH:mm', label: 'EMA retest session end', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.sessionTimeZone': {
    type: 'string', unit: 'IANA time zone', label: 'EMA retest session time zone', effect: 'next_entry_evaluation',
  },
  'strategies.EMATrendRetest.allowShorts': {
    type: 'boolean', unit: 'boolean', label: 'Allow EMA retest short signals', effect: 'next_entry_evaluation',
  },
});

// Compile the external settings input before it can become an entry-sizing input.
// Invalid input is named and kept out of entry routing; no customer value is guessed.
function buildEntrySizingInput(config) {
  const configured = readConfiguredPath(config, 'positionSizing.confluenceMultipliers');
  const mapIsObject = isPlainObject(configured);
  const issues = [];
  for (const count of [1, 2, 3, 4]) {
    const path = `positionSizing.confluenceMultipliers.${count}`;
    const value = mapIsObject ? configured[count] : undefined;
    const definition = EDITABLE_SETTINGS[path];
    if (typeof value !== 'number' || !Number.isFinite(value)
        || value <= definition.min || value > definition.max) {
      issues.push({ path, reason: value === undefined ? 'missing_setting' : 'invalid_setting_value' });
    }
  }
  return deepFreeze({ multipliers: issues.length === 0 ? configured : null, issues });
}

function getEntrySizingInput() {
  if (!_cached) load({ silent: true });
  return _cached.entrySizing;
}

function getSettingsView() {
  if (!_cached) load({ silent: true });
  return {
    configuration: getReceipt(),
    unavailableInputs: _cached.entrySizing ? _cached.entrySizing.issues : [],
    profile: _cached.config.mode.launchProfile,
    fields: Object.fromEntries(Object.entries(EDITABLE_SETTINGS).map(([key, definition]) => [key, {
      ...definition, value: get(key), source: getSource(key),
      editable: _cached.role === 'bot' && !_cached.runDescriptor,
    }])),
  };
}

function saveSettings(request) {
  const reject = (reason, details = {}) => ({ success: false, saved: false, applied: false, reason, ...details });
  if (!_cached || _cached.role !== 'bot') return reject('settings_owner_not_loaded');
  if (_cached.runDescriptor) return reject('backtest_settings_are_descriptor_owned');
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || typeof request.requestId !== 'string' || !request.requestId.trim() || request.requestId.length > 128
    || !Number.isSafeInteger(request.expectedRevision)
    || typeof request.expectedSettingsHash !== 'string'
    || !request.changes || typeof request.changes !== 'object' || Array.isArray(request.changes)) {
    return reject('invalid_settings_request');
  }
  const entries = Object.entries(request.changes);
  if (!entries.length) return reject('empty_settings_change');
  for (const [key, value] of entries) {
    if (!Object.hasOwn(EDITABLE_SETTINGS, key)) return reject('setting_not_hot_editable', { path: key });
    const definition = EDITABLE_SETTINGS[key];
    const validIntegerList = definition.format !== 'integer_list' || (typeof value === 'string'
      && value.split(',').length >= definition.minItems
      && value.split(',').every(item => item.trim() !== ''
        && Number.isSafeInteger(Number(item.trim()))
        && Number(item.trim()) > definition.itemMin));
    const validNumericArray = definition.type !== 'array' || (Array.isArray(value)
      && value.length >= definition.minItems
      && value.every(item => typeof item === definition.itemType
        && Number.isFinite(item)
        && (!definition.itemInteger || Number.isSafeInteger(item))
        && (definition.itemMin === undefined || item > definition.itemMin)));
    if ((definition.type !== 'array' && typeof value !== definition.type) || !validIntegerList || !validNumericArray
      || (definition.values && !definition.values.includes(value))
      || (definition.type === 'number' && (!Number.isFinite(value) || value < definition.min || value > definition.max
        || (definition.exclusiveMin && value === definition.min) || (definition.exclusiveMax && value === definition.max)
        || (definition.integer && !Number.isSafeInteger(value))))) {
      return reject('invalid_setting_value', { path: key });
    }
  }
  let diskSettings;
  try {
    diskSettings = readCanonicalJson(SETTINGS_PATH, 'config/settings.json');
  } catch (error) {
    console.error('[ConfigLoader] Settings read failed:', error.message);
    return reject('settings_read_failed');
  }
  const diskHash = canonicalHash(diskSettings);
  if (diskHash !== _cached.revisions.settingsHash) return reject('settings_changed_outside_loaded_owner');
  if (request.expectedRevision !== diskSettings.revision || request.expectedSettingsHash !== diskHash) {
    return reject('settings_revision_changed', { configuration: getReceipt() });
  }
  const nextSettings = clonePlain(diskSettings);
  const nextConfig = clonePlain(_cached.config);
  for (const [key, value] of entries) {
    const canonicalPath = EDITABLE_SETTINGS[key].scope === 'active_launch_profile'
      ? `launchProfiles.${_cached.config.mode.launchProfile}.${key}` : key;
    setObjectPath(nextSettings, canonicalPath, value);
    setObjectPath(nextConfig, key, value);
  }
  if (entries.some(([key]) => key.startsWith('strategies.RSI.'))
      && nextConfig.strategies.RSI.buyBelow >= nextConfig.strategies.RSI.exitAbove) {
    return reject('rsi_buy_must_be_below_exit');
  }
  if (entries.some(([key]) => key.startsWith('strategies.PropSafeEMAPullback.'))) {
    const cfg = nextConfig.strategies.PropSafeEMAPullback;
    if (!(cfg.fastEmaPeriod < cfg.pullbackEmaPeriod && cfg.pullbackEmaPeriod < cfg.trendEmaPeriod)) {
      return reject('propsafe_ema_periods_must_increase');
    }
    if (!(cfg.pullbackMinAtr < cfg.pullbackMaxAtr)) {
      return reject('propsafe_pullback_min_must_be_below_max');
    }
    const isHhMm = value => typeof value === 'string'
      && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!isHhMm(cfg.rthStartET)) {
      return reject('propsafe_rth_start_must_use_hh_mm', { path: 'strategies.PropSafeEMAPullback.rthStartET' });
    }
    if (!isHhMm(cfg.rthEndET)) {
      return reject('propsafe_rth_end_must_use_hh_mm', { path: 'strategies.PropSafeEMAPullback.rthEndET' });
    }
    if (typeof cfg.sessionTimeZone !== 'string' || cfg.sessionTimeZone.trim() === '') {
      return reject('propsafe_session_time_zone_must_be_iana', { path: 'strategies.PropSafeEMAPullback.sessionTimeZone' });
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: cfg.sessionTimeZone }).format(new Date(Date.UTC(2026, 0, 1)));
    } catch (error) {
      return reject('propsafe_session_time_zone_must_be_iana', { path: 'strategies.PropSafeEMAPullback.sessionTimeZone' });
    }
  }
  if (entries.some(([key]) => key.startsWith('strategies.OpeningRangeBreakout.'))) {
    const problem = openingRangeBreakoutConfigurationProblem(nextConfig);
    if (problem) return reject(problem.reason, { path: problem.path });
  }
  if (entries.some(([key]) => key.startsWith('strategies.EMATrendRetest.'))
      && nextConfig.strategies.EMATrendRetest.maxExtensionAtr <= nextConfig.strategies.EMATrendRetest.closeAwayAtr) {
    return reject('ema_retest_extension_must_exceed_confirmation');
  }
  if (entries.some(([key]) => key.startsWith('fees.'))
      && nextConfig.fees.model === 'per_share_minimum'
      && nextConfig.fees.perShare === 0 && nextConfig.fees.minOrderFee === 0) {
    return reject('per_share_minimum_requires_per_share_or_min_order');
  }
  for (const [key, value] of entries) {
    if ((key === 'strategies.EMATrendRetest.rthStartET' || key === 'strategies.EMATrendRetest.rthEndET')
        && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      return reject(key.endsWith('rthStartET') ? 'ema_retest_rth_start_must_use_hh_mm' : 'ema_retest_rth_end_must_use_hh_mm', { path: key });
    }
    if (key === 'strategies.EMATrendRetest.sessionTimeZone') {
      if (value.trim() === '') return reject('ema_retest_session_time_zone_must_be_iana', { path: key });
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(Date.UTC(2026, 0, 1)));
      } catch (error) {
        return reject('ema_retest_session_time_zone_must_be_iana', { path: key });
      }
    }
  }
  if (entries.some(([key]) => key.startsWith('strategies.EMASMACrossover.'))
      && Number(nextConfig.strategies.EMASMACrossover.maxConfidence) < Number(nextConfig.strategies.EMASMACrossover.baseConfidence)) {
    return reject('ema_crossover_max_confidence_below_base', { path: 'strategies.EMASMACrossover.maxConfidence' });
  }
  if (entries.some(([key]) => key.startsWith('strategies.EMASMACrossover.'))
      && Number(nextConfig.strategies.EMASMACrossover.elasticityMaxAtr) <= Number(nextConfig.strategies.EMASMACrossover.elasticityMinAtr)) {
    return reject('ema_crossover_elasticity_max_must_exceed_min', { path: 'strategies.EMASMACrossover.elasticityMaxAtr' });
  }
  if (entries.some(([key]) => key.startsWith('strategies.TimeSeriesMomentum.'))) {
    const problem = timeSeriesMomentumConfidenceReplacementProblem(nextConfig);
    if (problem) return reject(problem.reason, { path: problem.path });
  }
  if (entries.some(([key]) => key.startsWith('strategies.RSI2MeanReversion.'))) {
    const problem = rsi2ConfidenceReplacementProblem(nextConfig);
    if (problem) return reject(problem.reason, { path: problem.path });
  }
  if (entries.some(([key]) => key.startsWith('strategies.EMATrendRetest.'))) {
    const problem = emaRetestConfidenceReplacementProblem(nextConfig);
    if (problem) return reject(problem.reason, { path: problem.path });
  }
  if (entries.some(([key]) => key.startsWith('strategies.PropSafeEMAPullback.'))) {
    const problem = propSafeConfidenceReplacementProblem(nextConfig);
    if (problem) return reject(problem.reason, { path: problem.path });
  }
  const nextEntrySizing = buildEntrySizingInput(nextConfig);
  if (nextEntrySizing.issues.length > 0) {
    return reject('invalid_entry_sizing_configuration', { issues: nextEntrySizing.issues });
  }
  nextSettings.revision += 1;
  if (entries.some(([key]) => key.startsWith('exitLogic.trail.'))
      && nextConfig.exitLogic.trail.minTrailPercent > nextConfig.exitLogic.trail.maxTrailPercent) {
    return reject('trail_min_must_not_exceed_max');
  }
  nextConfig.revision = nextSettings.revision;
  const revisions = { ..._cached.revisions, settings: nextSettings.revision, settingsHash: canonicalHash(nextSettings) };
  const nextSnapshot = { ..._cached, config: deepFreeze(nextConfig), entrySizing: nextEntrySizing, revisions: Object.freeze(revisions),
    timestamp: new Date().toISOString(),
    fingerprint: fingerprint(nextConfig, _cached.sources, { role: _cached.role,
      revisions: { settings: revisions.settings, internals: revisions.internals } }) };
  try {
    writeJsonAtomic(SETTINGS_PATH, nextSettings, { flag: 'wx' });
  } catch (error) {
    console.error('[ConfigLoader] Settings save failed:', error.message);
    return reject('settings_save_failed');
  }
  // Synchronous publication after the existing atomic writer succeeds.
  settingsConfigFile = nextSettings;
  _cached = nextSnapshot;
  return { success: true, saved: true, applied: true, ...getSettingsView() };
}

function _resetForTest() {
  _cached = null;
  _cachedRole = null;
  activeEnv = {};
  activeEnvSources = {};
  activeCredentialEnv = {};
  activeCredentialSources = {};
  activeProcessRole = 'bot';
  activeRunDescriptor = null;
}

// ═══════════════════════════════════════════════════════════════
// COMPATIBILITY READ API
// Every runtime value below is read from the single frozen snapshot.
function ensureCanonicalFiles() {
  if (!settingsConfigFile || !internalsConfigFile) loadCanonicalFiles();
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreezePlain(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreezePlain(child);
  return value;
}

function getConfigFileValue(configPath) {
  ensureCanonicalFiles();
  const value = readConfiguredPath(settingsConfigFile, configPath);
  return value === undefined ? undefined : deepFreezePlain(clonePlain(value));
}

function getInternalsFileValue(configPath) {
  ensureCanonicalFiles();
  const value = readConfiguredPath(internalsConfigFile, configPath);
  return value === undefined ? undefined : deepFreezePlain(clonePlain(value));
}

function getTuningProfileDefinitions() {
  ensureCanonicalFiles();
  return settingsConfigFile.tuningProfiles?.definitions || {};
}

function getFeeProfileDefinitions() {
  ensureCanonicalFiles();
  return settingsConfigFile.feeProfiles?.definitions || {};
}

class ConfigLoader {
  static get(pathName, defaultValue = undefined) {
    const value = get(pathName);
    return value === undefined ? defaultValue : value;
  }

  static getSection(section) {
    if (!_cached) load({ silent: true });
    const value = _cached.config[section];
    return value === undefined ? undefined : clonePlain(value);
  }

  static getExitContract(strategyName) {
    const contracts = this.get('exitContracts');
    return contracts?.[strategyName] || contracts?.default;
  }

  static getTimeframeConfig(timeframe) {
    const normalized = typeof timeframe === 'string' ? timeframe.trim() : '';
    if (!normalized) throw new Error('[ConfigLoader] timeframeConfig lookup requires a non-empty timeframe');
    const value = this.get('timeframeConfig')?.[normalized];
    if (!value) throw new Error("[ConfigLoader] Unknown timeframeConfig '" + normalized + "'");
    return clonePlain(value);
  }

  static listTuningProfileNames() {
    return Object.keys(getTuningProfileDefinitions());
  }

  static resolveTuningProfile(profileName) {
    ensureCanonicalFiles();
    const normalized = String(profileName || settingsConfigFile.tuningProfiles.defaultProfile || '').trim();
    const profile = getTuningProfileDefinitions()[normalized];
    if (!profile) {
      throw new Error("[ConfigLoader] Unknown tuning profile '" + normalized + "'. Available: " + this.listTuningProfileNames().join(', '));
    }
    const launchProfile = settingsConfigFile.launchProfiles?.[profile.launchProfile];
    if (!launchProfile || launchProfile.mode !== 'backtest') {
      throw new Error(`[ConfigLoader] tuning profile '${normalized}' must name an existing backtest launchProfile`);
    }
    profileTypedOverrides(profile, 'tuning');
    return deepFreezePlain(clonePlain(profile));
  }

  static summarizeTuningProfile(profileOrName) {
    const profile = typeof profileOrName === 'object' && profileOrName
      ? this.resolveTuningProfile(profileOrName.name)
      : this.resolveTuningProfile(profileOrName);
    return {
      name: profile.name,
      launchProfile: profile.launchProfile,
      description: profile.description,
      evidence: [...(profile.evidence || [])],
      overrides: { ...profile.overrides },
      configPaths: this.getTuningProfileConfigPaths(profile.name),
    };
  }

  static getTuningProfileDefinitions() {
    return deepFreezePlain(clonePlain(getTuningProfileDefinitions()));
  }

  static listFeeProfileNames() {
    return Object.keys(getFeeProfileDefinitions());
  }

  static resolveFeeProfile(profileName) {
    const normalized = String(profileName || '').trim();
    const profile = getFeeProfileDefinitions()[normalized];
    if (!profile) {
      throw new Error("[ConfigLoader] Unknown fee profile '" + normalized + "'. Available: " + this.listFeeProfileNames().join(', '));
    }
    validateFeeProfileApplicability(profile, normalized);
    profileTypedOverrides(profile, 'fee');
    return deepFreezePlain(clonePlain(profile));
  }

  static summarizeFeeProfile(profileOrName) {
    const profile = typeof profileOrName === 'object' && profileOrName
      ? this.resolveFeeProfile(profileOrName.name)
      : this.resolveFeeProfile(profileOrName);
    return {
      name: profile.name,
      description: profile.description,
      assetClasses: [...profile.assetClasses],
      overrides: { ...profile.overrides },
    };
  }

  static getParallelBacktestConfig() {
    ensureCanonicalFiles();
    return deepFreezePlain(clonePlain(internalsConfigFile.tooling?.parallelBacktest));
  }

  static getMatrixSweepConfig() {
    ensureCanonicalFiles();
    return deepFreezePlain(clonePlain(internalsConfigFile.tooling?.matrixSweep));
  }

  static getTuningProfileConfigPaths(profileName) {
    const profile = this.resolveTuningProfile(profileName);
    return Object.freeze(Object.keys(profileTypedOverrides(profile, 'tuning')).sort());
  }

  static buildTuningProfileOverrides(profileName) {
    const profile = this.resolveTuningProfile(profileName);
    return deepFreezePlain(clonePlain(profileTypedOverrides(profile, 'tuning')));
  }

  static buildFeeProfileOverrides(profileName) {
    const profile = this.resolveFeeProfile(profileName);
    return deepFreezePlain(clonePlain(profileTypedOverrides(profile, 'fee')));
  }

  static getTuningProfileStatus() {
    return {
      activeProfile: _cached?.runDescriptor?.value?.tuningProfile || null,
      activeProfileAppliedAt: _cached?.timestamp || null,
      activeProfileSource: _cached?.runDescriptor ? 'backtest-run-descriptor' : null,
      profiles: this.listTuningProfileNames(),
      profileOverrideCount: _cached?.runDescriptor?.value?.tuningProfile
        ? this.getTuningProfileConfigPaths(_cached.runDescriptor.value.tuningProfile).length
        : 0,
    };
  }

  static getAll() {
    if (!_cached) load({ silent: true });
    return clonePlain(_cached.config);
  }

  static printSummary() {
    const config = this.getAll();
    console.log('\n=== TRADING CONFIG SUMMARY ===');
    console.log('Launch profile:        ' + config.mode?.launchProfile);
    console.log('Execution mode:        ' + config.mode?.execution);
    console.log('Direction filter:      ' + config.pipeline?.directionFilter);
    console.log('Min Trade Confidence: ' + config.confidence?.minTradeConfidence);
    console.log('Fee model:             ' + config.fees?.model);
    console.log('==============================\n');
  }

  static validate() {
    if (!_cached) load({ silent: true });
    return [..._cached.errors];
  }
}

const exported = Object.assign(ConfigLoader, {
  load,
  get,
  getSource,
  hasLoadedSnapshot,
  getCachedSnapshot,
  getSettingsView,
  getEntrySizingInput,
  saveSettings,
  fingerprint,
  snapshot,
  validate,
  _resetForTest,
  loadBacktestRunDescriptor,
  getConfigFileValue,
  getInternalsFileValue,
  MIN_CONFIDENCE: () => ConfigLoader.get('confidence.minTradeConfidence'),
  FEES_ROUND_TRIP: () => ConfigLoader.get('fees.totalRoundTrip'),
});
exported.validateLegacy = ConfigLoader.validate.bind(ConfigLoader);

Object.defineProperty(exported, 'DEFAULT_TUNING_PROFILE', {
  enumerable: true,
  get() {
    ensureCanonicalFiles();
    return settingsConfigFile.tuningProfiles.defaultProfile;
  },
});

const compatibilitySections = [
  'authFailureGuard', 'confidence', 'entryLogic', 'execution',
  'exitContracts', 'exitLogic', 'exits', 'featureCatalog', 'features',
  'featureExtraction', 'fees', 'fibonacci', 'filters', 'fundTarget', 'indicators',
  'misc', 'orchestrator', 'patternMemory', 'patternRecognition', 'performanceAnalysis',
  'pid', 'pipeline', 'positionSizing', 'proofPublication',
  'regimeBoosts', 'risk', 'services', 'startingBalance',
  'regimeDetection', 'strategies', 'strategyBehavior', 'tierPolicy', 'timeframeConfig', 'trai',
  'volumeProfileBoosts',
  'broker', 'backtest', 'paths', 'monitoring', 'observability', 'dataFeed',
  'dashboard', 'webhookOrders', 'sessionRouter', 'evalRules', 'internals',
];
for (const section of compatibilitySections) {
  Object.defineProperty(exported, section, {
    enumerable: true,
    get() {
      return ConfigLoader.getSection(section);
    },
  });
}

module.exports = exported;
