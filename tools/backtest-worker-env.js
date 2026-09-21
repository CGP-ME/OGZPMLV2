'use strict';

const fs = require('fs');
const path = require('path');
const ConfigLoader = require('../foundation/ConfigLoader');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const { DEFAULT_TUNING_PROFILE, resolveTuningProfile } = require('./tuning-profiles');
const { resolveFeeProfile } = require('./fee-profiles');

// Child processes inherit only operating-system process necessities. All bot
// behavior is carried by BACKTEST_RUN_DESCRIPTOR_PATH and resolved before the
// ConfigLoader snapshot is frozen.
const WORKER_ENV_ALLOWLIST = Object.freeze([
  'PATH', 'HOME', 'USER', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC',
  'PATHEXT', 'WINDIR',
]);

function buildWorkerBaseEnv(sourceEnv = process.env) {
  const result = {};
  for (const key of WORKER_ENV_ALLOWLIST) {
    if (sourceEnv[key] !== undefined) result[key] = sourceEnv[key];
  }
  return result;
}

function resolveWorkerLaunchProfile(explicitLaunchProfileName, tuningProfile) {
  const explicit = String(explicitLaunchProfileName || '').trim();
  const required = String(tuningProfile?.launchProfile || '').trim();
  if (!required) throw new Error(`Backtest tuning profile '${tuningProfile?.name || 'unknown'}' has no launch profile`);
  if (explicit && explicit !== required) {
    throw new Error(
      `Backtest tuning profile '${tuningProfile.name}' requires launch profile '${required}', not '${explicit}'`
    );
  }
  return required;
}

function resolveIdentity(dataFile, explicitInstrument) {
  const instrument = explicitInstrument || resolveInstrumentFromDataFile(dataFile);
  const required = ['tradingPair', 'broker', 'assetClass', 'candleTimeframe'];
  for (const key of required) {
    if (!instrument[key]) throw new Error(`Backtest descriptor identity is missing ${key}`);
  }
  const derived = resolveInstrumentFromDataFile(dataFile);
  for (const key of required) {
    if (instrument[key] !== derived[key]) {
      throw new Error(`Backtest identity ${key}=${instrument[key]} conflicts with data-file identity ${derived[key]}`);
    }
  }
  if (!Array.isArray(instrument.symbols) || instrument.symbols.length === 0) {
    throw new Error('Backtest descriptor identity is missing symbols');
  }
  const symbols = instrument.symbols.map(value => String(value).trim()).filter(Boolean);
  if (symbols.length !== derived.symbols.length || symbols.some((value, index) => value !== derived.symbols[index])) {
    throw new Error(`Backtest identity symbols=${symbols.join(',')} conflict with data-file identity ${derived.symbols.join(',')}`);
  }
  return {
    broker: instrument.broker,
    assetClass: instrument.assetClass,
    tradingPair: instrument.tradingPair,
    candleTimeframe: instrument.candleTimeframe,
    symbols,
  };
}

function atomicWriteJson(filePath, value) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  try {
    fs.linkSync(temporary, target);
    fs.unlinkSync(temporary);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
  return target;
}

function buildBacktestRunDescriptor(options = {}) {
  const {
    projectRoot, dataFile, stateFile, dataDir, reportTag, outputDir,
    instrumentIdentity, launchProfileName, profileName = DEFAULT_TUNING_PROFILE,
    feeProfileName, overrides = {}, freshStart,
  } = options;
  if (!projectRoot || !dataFile || !stateFile || !dataDir || !reportTag || !outputDir) {
    throw new Error('Backtest descriptor requires projectRoot, dataFile, stateFile, dataDir, reportTag, and outputDir');
  }
  if (typeof freshStart !== 'boolean') {
    throw new Error('Backtest descriptor requires an explicit boolean freshStart');
  }
  const candleFile = path.resolve(projectRoot, dataFile);
  let candleStat;
  try {
    candleStat = fs.statSync(candleFile);
  } catch (error) {
    throw new Error(`Backtest candle data is unavailable at ${candleFile}: ${error.message}`);
  }
  if (!candleStat.isFile()) {
    throw new Error(`Backtest candle data must be a regular file: ${candleFile}`);
  }
  const tuningProfile = resolveTuningProfile(profileName);
  const feeProfile = resolveFeeProfile(feeProfileName);
  const identity = resolveIdentity(dataFile, instrumentIdentity);
  if (!feeProfile.assetClasses.includes(identity.assetClass)) {
    throw new Error(
      `Fee profile '${feeProfile.name}' is not verified for ${identity.assetClass}; verified: ${feeProfile.assetClasses.join(', ') || 'none'}`
    );
  }
  return {
    schemaVersion: 1,
    launchProfile: resolveWorkerLaunchProfile(launchProfileName, tuningProfile),
    identity,
    data: { candleFile },
    report: { tag: String(reportTag), outputDir: path.resolve(outputDir) },
    state: {
      stateFile: path.resolve(stateFile),
      dataDir: path.resolve(dataDir),
      freshStart,
    },
    services: { dashboard: false, notifications: false, sentry: false, webhookOrders: false },
    tuningProfile: tuningProfile.name,
    feeProfile: feeProfile.name,
    overrides: { ...overrides },
  };
}

function buildBacktestWorkerEnv(options = {}) {
  if (options.configEnv !== undefined) {
    throw new Error('Behavioral configEnv transport was removed; pass typed descriptor overrides');
  }
  if (options.stockMode !== undefined) {
    throw new Error('stockMode transport was removed; broker and asset identity are derived from the candle-data filename');
  }
  const descriptor = buildBacktestRunDescriptor(options);
  const descriptorPath = path.resolve(options.descriptorPath || `${options.stateFile}.run.json`);
  atomicWriteJson(descriptorPath, descriptor);
  try {
    const receipt = ConfigLoader.snapshot({ BACKTEST_RUN_DESCRIPTOR_PATH: descriptorPath }, {
      role: 'bot', loadDotenv: false, silent: true, runDescriptorPath: descriptorPath,
    });
    if (receipt.errors.length > 0) {
      throw new Error(`Backtest descriptor produced invalid runtime configuration: ${receipt.errors.join('; ')}`);
    }
  } catch (error) {
    removeBacktestRunDescriptor(descriptorPath);
    throw error;
  }
  return {
    ...buildWorkerBaseEnv(options.sourceEnv),
    BACKTEST_RUN_DESCRIPTOR_PATH: descriptorPath,
  };
}

function readConfigPath(root, configPath) {
  return String(configPath).split('.').reduce((value, key) => value?.[key], root);
}

function summarizeWorkerEnv(env) {
  const descriptorPath = env?.BACKTEST_RUN_DESCRIPTOR_PATH;
  if (!descriptorPath) throw new Error('Worker environment has no BACKTEST_RUN_DESCRIPTOR_PATH');
  const receipt = ConfigLoader.snapshot({ BACKTEST_RUN_DESCRIPTOR_PATH: descriptorPath }, {
    role: 'bot', loadDotenv: false, silent: true, runDescriptorPath: descriptorPath,
  });
  const config = receipt.config;
  const requestedOverrides = { ...(receipt.runDescriptor.value.overrides || {}) };
  const resolvedOverrides = Object.fromEntries(
    Object.keys(requestedOverrides).map(configPath => [configPath, readConfigPath(config, configPath)])
  );
  return {
    descriptorPath: receipt.runDescriptor.path,
    descriptorHash: receipt.runDescriptor.hash,
    fingerprint: receipt.fingerprint,
    revisions: receipt.revisions,
    validation: {
      errors: [...receipt.errors],
      warnings: [...receipt.warnings],
    },
    launchProfile: config.mode.launchProfile,
    identity: {
      broker: config.execution.broker,
      assetClass: config.execution.assetClass,
      tradingPair: config.execution.tradingPair,
      symbols: [...config.execution.symbols],
      candleTimeframe: config.execution.candleTimeframe,
    },
    data: { candleFile: config.backtest.candleDataFile },
    report: { tag: config.backtest.reportTag, outputDir: config.paths.backtestOutputDir },
    state: { stateFile: config.paths.stateFile, dataDir: config.paths.dataDir, freshStart: config.backtest.freshStart },
    profiles: {
      tuning: receipt.runDescriptor.value.tuningProfile,
      fee: receipt.runDescriptor.value.feeProfile,
    },
    services: { ...receipt.runDescriptor.value.services },
    resolved: {
      minTradeConfidence: config.confidence.minTradeConfidence,
      directionFilter: config.pipeline.directionFilter,
      soloFilter: [...(config.strategies.soloFilter || [])],
      maxPositionSize: config.positionSizing.maxPositionSize,
      atrEnabled: config.filters.atrEnabled,
      atrMinPercent: config.filters.atrMinPercent,
      minCandlesEMA: config.orchestrator.minCandlesEMA,
      atrContractsEnabled: config.strategyBehavior.atrContracts.enabled,
      profitTiers: { ...config.exits.profitTiers },
      fees: { ...config.fees },
    },
    requestedOverrides,
    overrides: resolvedOverrides,
  };
}

function removeBacktestRunDescriptor(envOrPath) {
  const descriptorPath = typeof envOrPath === 'string' ? envOrPath : envOrPath?.BACKTEST_RUN_DESCRIPTOR_PATH;
  if (!descriptorPath) return false;
  try {
    fs.unlinkSync(descriptorPath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  WORKER_ENV_ALLOWLIST,
  DEFAULT_TUNING_PROFILE,
  buildWorkerBaseEnv,
  resolveWorkerLaunchProfile,
  buildBacktestRunDescriptor,
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
  removeBacktestRunDescriptor,
};
