/**
 * ConfigAudit.js - Print every resolved config value and its source
 * =================================================================
 * 
 * Run: node tools/config-audit.js
 * 
 * Or from run-empire-v2.js:
 *   require('./tools/config-audit.js').run();
 *   process.exit(0);
 * 
 * Outputs the ACTUAL values every module will receive, with source tracking.
 * Use this to prove the pipeline isn't being poisoned by hidden defaults.
 * 
 * @author Claude (Opus) for Trey / OGZPrime
 * @date 2026-03-17
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const ConfigLoader = require('../foundation/ConfigLoader');

const REDACTED_VALUE = '[REDACTED]';
const SECRET_PATH_PATTERN = /(^|[._-])(apiKey|apiSecret|secret|token|dsn|webhookUrl|password|privateKey)($|[._-])/i;
const SECRET_ENV_PATTERN = /(^|_)(API_KEY|API_SECRET|SECRET|TOKEN|DSN|WEBHOOK_URL|PASSWORD|PRIVATE_KEY)($|_)/i;

const AUDIT_REQUIRED_ENV_FIXTURE = Object.freeze({
  ALPACA_MODE: 'paper',
  RISK_MANAGER_BYPASS: 'true',
  ACCOUNT_DRAWDOWN_BYPASS: 'true',
  MAX_DRAWDOWN: '5',
  MAX_DAILY_LOSS: '1',
  MAX_WEEKLY_LOSS: '5',
  MAX_MONTHLY_LOSS: '5',
});

const CONFIG_LOADER_ENV_PATHS = Object.freeze({
  EXECUTION_MODE: 'mode.execution',
  BACKTEST_MODE: 'mode.backtest',
  PAPER_TRADING: 'mode.paperTrading',
  LIVE_TRADING: 'mode.liveTrading',
  CANDLE_SOURCE: 'mode.candleSource',
  MIN_TRADE_CONFIDENCE: 'confidence.minTradeConfidence',
  MIN_STRATEGY_CONFIDENCE: 'confidence.minStrategyConfidence',
  MAX_CONFIDENCE: 'confidence.maxConfidence',
  BASE_POSITION_SIZE: 'sizing.basePositionSize',
  MAX_POSITION_SIZE_PCT: 'sizing.maxPositionSize',
  MAX_POSITIONS: 'sizing.maxPositions',
  STOP_LOSS_PERCENT: 'exits.stopLossPercent',
  TAKE_PROFIT_PERCENT: 'exits.takeProfitPercent',
  TRAILING_STOP_PERCENT: 'exits.trailingStopPercent',
  TRAILING_ACTIVATION: 'exits.trailingActivation',
  TIER1_TARGET: 'tiers.tier1',
  TIER2_TARGET: 'tiers.tier2',
  TIER3_TARGET: 'tiers.tier3',
  FINAL_TARGET: 'tiers.final',
  FEE_MODEL: 'fees.model',
  FEE_MAKER: 'fees.makerFee',
  FEE_TAKER: 'fees.takerFee',
  FEE_TOTAL_ROUNDTRIP: 'fees.totalRoundTrip',
  FEE_PER_SHARE: 'fees.perShare',
  FEE_MIN_ORDER: 'fees.minOrderFee',
  RISK_MANAGER_BYPASS: 'risk.riskManagerBypass',
  ACCOUNT_DRAWDOWN_BYPASS: 'risk.accountDrawdownBypass',
  MAX_DRAWDOWN: 'risk.maxDrawdown',
  MAX_DAILY_LOSS: 'risk.maxDailyLoss',
  MAX_WEEKLY_LOSS: 'risk.maxWeeklyLoss',
  MAX_MONTHLY_LOSS: 'risk.maxMonthlyLoss',
  ATR_FILTER_ENABLED: 'filters.atrEnabled',
  ATR_MIN_PERCENT: 'filters.atrMinPercent',
  CANDLE_DATA_FILE: 'backtest.candleDataFile',
  INITIAL_BALANCE: 'backtest.initialBalance',
  BACKTEST_SILENT: 'backtest.silent',
  BACKTEST_FAST: 'backtest.fast',
  BACKTEST_VERBOSE: 'backtest.verbose',
  BACKTEST_NO_PATTERN_SAVE: 'backtest.noPatternSave',
  TRAIL_ATR_MULTIPLIER: 'trail.atrMultiplier',
  TRAIL_MIN_ACTIVATION: 'trail.minActivation',
  TRAIL_TREND_WIDEN: 'trail.trendWiden',
  TRAIL_STRUCTURE_TIGHTEN: 'trail.structureTighten',
  ALPACA_MODE: 'broker.alpacaMode',
});

function readDotenvValues(envPath) {
  const resolvedPath = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  try {
    return dotenv.parse(fs.readFileSync(resolvedPath));
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function createAuditContext(options = {}) {
  const {
    sourceEnv = process.env,
    useAuditFixture = true,
  } = options;
  const envPath = sourceEnv.DOTENV_CONFIG_PATH || '.env';
  const dotenvValues = readDotenvValues(envPath);
  const auditEnv = { ...sourceEnv };
  const auditFixtureKeys = [];
  const auditFixtureSourceByPath = {};

  if (useAuditFixture) {
    for (const [key, value] of Object.entries(AUDIT_REQUIRED_ENV_FIXTURE)) {
      if (auditEnv[key] !== undefined && auditEnv[key] !== '') continue;
      if (dotenvValues[key] !== undefined && dotenvValues[key] !== '') continue;
      auditEnv[key] = value;
      auditFixtureKeys.push(key);
      const loaderPath = CONFIG_LOADER_ENV_PATHS[key];
      if (loaderPath) auditFixtureSourceByPath[loaderPath] = `audit-fixture:${key}`;
    }
  }

  const configSnapshot = ConfigLoader.snapshot(auditEnv, { silent: true });
  return { envPath, configSnapshot, auditFixtureKeys, auditFixtureSourceByPath };
}

// ═══════════════════════════════════════════════════════════════
// TRACE EVERY VALUE
// ═══════════════════════════════════════════════════════════════

function getPath(obj, configPath) {
  if (!configPath) return undefined;
  const parts = configPath.split('.');
  let value = obj;
  for (const part of parts) {
    if (value === undefined || value === null) return undefined;
    value = value[part];
  }
  return value;
}

function flattenConfigLeaves(obj, prefix = '', leaves = {}) {
  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) leaves[prefix] = obj;
    return leaves;
  }

  for (const [key, value] of Object.entries(obj)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    flattenConfigLeaves(value, pathKey, leaves);
  }

  return leaves;
}

function isSecretPath(configPath) {
  const candidate = String(configPath || '');
  const normalizedCandidate = candidate.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  return (
    SECRET_PATH_PATTERN.test(candidate) ||
    SECRET_PATH_PATTERN.test(normalizedCandidate) ||
    SECRET_ENV_PATTERN.test(candidate) ||
    SECRET_ENV_PATTERN.test(normalizedCandidate)
  );
}

function auditEntry(configPath, entry) {
  if (!isSecretPath(configPath)) return entry;
  return {
    ...entry,
    value: REDACTED_VALUE,
    redacted: true,
  };
}

function getSourceFromContext(context, envKey, configPath, hardcodedDefault) {
  const loaderPath = CONFIG_LOADER_ENV_PATHS[envKey];
  const loaderVal = getPath(context.configSnapshot.config, loaderPath);
  if (loaderPath && loaderVal !== undefined && loaderVal !== '') {
    return auditEntry(loaderPath, {
      value: loaderVal,
      source: context.auditFixtureSourceByPath?.[loaderPath] || context.configSnapshot.sources[loaderPath] || `ConfigLoader:${loaderPath}`,
      raw: false,
    });
  }

  const envVal = process.env[envKey];
  const configVal = configPath ? ConfigLoader.get(configPath) : undefined;
  
  if (envVal !== undefined && envVal !== '') {
    return auditEntry(envKey, { value: envVal, source: `env:${envKey}`, raw: true });
  }
  if (configVal !== undefined && configVal !== null) {
    return { value: configVal, source: `ConfigLoader:${configPath}`, raw: false };
  }
  return { value: hardcodedDefault, source: 'hardcoded-default', raw: false };
}

function addConfigLoaderLeaves(resolved, context) {
  const leaves = flattenConfigLeaves(context.configSnapshot.config);
  for (const [configPath, value] of Object.entries(leaves)) {
    if (Object.prototype.hasOwnProperty.call(resolved, configPath)) continue;
    resolved[configPath] = auditEntry(configPath, {
      value,
      source: context.auditFixtureSourceByPath?.[configPath] || context.configSnapshot.sources[configPath] || `ConfigLoader:${configPath}`,
      raw: false,
    });
  }
  return resolved;
}

function buildResolvedConfig(context = createAuditContext()) {
  const getSource = (envKey, configPath, hardcodedDefault) => (
    getSourceFromContext(context, envKey, configPath, hardcodedDefault)
  );
  const resolved = {};

  // === EXECUTION MODE ===
  resolved['mode.execution'] = getSource('EXECUTION_MODE', 'pipeline.executionMode', 'paper');
  resolved['mode.backtest'] = getSource('BACKTEST_MODE', null, 'false');
  resolved['mode.paperTrading'] = getSource('PAPER_TRADING', null, 'false');
  resolved['mode.liveTrading'] = getSource('LIVE_TRADING', null, 'false');
  resolved['mode.candleSource'] = getSource('CANDLE_SOURCE', 'pipeline.candleSource', 'websocket');

  // === CONFIDENCE GATES ===
  resolved['confidence.minTradeConfidence'] = getSource('MIN_TRADE_CONFIDENCE', 'confidence.minTradeConfidence', 0.01);
  resolved['confidence.minStrategyConfidence'] = getSource('MIN_STRATEGY_CONFIDENCE', 'confidence.minStrategyConfidence', 0.35);
  resolved['confidence.maxConfidence'] = getSource('MAX_CONFIDENCE', 'confidence.maxConfidence', 0.95);

  // === POSITION SIZING ===
  resolved['sizing.basePositionSize'] = getSource('BASE_POSITION_SIZE', 'positionSizing.basePositionSize', 0.01);
  resolved['sizing.maxPositionSize'] = getSource('MAX_POSITION_SIZE_PCT', 'positionSizing.maxPositionSize', 0.05);
  resolved['sizing.maxPositions'] = getSource('MAX_POSITIONS', 'positionSizing.maxPositions', 3);

  // === EXIT CONTRACTS (per-strategy, but env overrides all) ===
  resolved['exits.stopLossPercent'] = getSource('STOP_LOSS_PERCENT', 'exits.stopLossPercent', 1.5);
  resolved['exits.takeProfitPercent'] = getSource('TAKE_PROFIT_PERCENT', 'exits.takeProfitPercent', 2.0);
  resolved['exits.trailingStopPercent'] = getSource('TRAILING_STOP_PERCENT', 'exits.trailingStopPercent', 3.5);
  resolved['exits.trailingActivation'] = getSource('TRAILING_ACTIVATION', 'exits.trailingActivation', 2.5);

  // === PROFIT TIERS ===
  resolved['tiers.tier1'] = getSource('TIER1_TARGET', 'exits.profitTiers.tier1', 0.015);
  resolved['tiers.tier2'] = getSource('TIER2_TARGET', 'exits.profitTiers.tier2', 0.020);
  resolved['tiers.tier3'] = getSource('TIER3_TARGET', 'exits.profitTiers.tier3', 0.030);
  resolved['tiers.final'] = getSource('FINAL_TARGET', 'exits.profitTiers.final', 0.050);

  // === FEES ===
  resolved['fees.model'] = getSource('FEE_MODEL', 'fees.model', 'percent');
  resolved['fees.makerFee'] = getSource('FEE_MAKER', 'fees.makerFee', 0.0025);
  resolved['fees.takerFee'] = getSource('FEE_TAKER', 'fees.takerFee', 0.004);
  resolved['fees.totalRoundTrip'] = getSource('FEE_TOTAL_ROUNDTRIP', 'fees.totalRoundTrip', ConfigLoader.get('fees.totalRoundTrip'));
  resolved['fees.perShare'] = getSource('FEE_PER_SHARE', 'fees.perShare', 0);
  resolved['fees.minOrderFee'] = getSource('FEE_MIN_ORDER', 'fees.minOrderFee', 0);

  // === RISK MANAGEMENT ===
  resolved['risk.riskManagerBypass'] = getSource('RISK_MANAGER_BYPASS', null, 'true (BYPASSED)');
  resolved['risk.accountDrawdownBypass'] = getSource('ACCOUNT_DRAWDOWN_BYPASS', null, 'false (ACTIVE)');
  resolved['risk.maxDrawdown'] = getSource('MAX_DRAWDOWN', 'risk.maxDrawdown', 10);
  resolved['risk.maxDailyLoss'] = getSource('MAX_DAILY_LOSS', 'risk.maxDailyLoss', 3);
  resolved['risk.maxWeeklyLoss'] = getSource('MAX_WEEKLY_LOSS', 'risk.maxWeeklyLoss', 10);
  resolved['risk.maxMonthlyLoss'] = getSource('MAX_MONTHLY_LOSS', 'risk.maxMonthlyLoss', 20);

  // === UNIVERSAL LIMITS ===
  resolved['limits.hardStopLoss'] = { value: ConfigLoader.get('universalLimits.hardStopLossPercent'), source: 'ConfigLoader:universalLimits.hardStopLossPercent' };
  resolved['limits.accountDrawdown'] = { value: ConfigLoader.get('universalLimits.accountDrawdownPercent'), source: 'ConfigLoader:universalLimits.accountDrawdownPercent' };
  resolved['limits.maxHoldTime'] = { value: ConfigLoader.get('universalLimits.maxHoldTimeMinutes'), source: 'ConfigLoader:universalLimits.maxHoldTimeMinutes' };

  // === STRATEGY TOGGLES ===
  const pipeline = ConfigLoader.get('pipeline') || {};
  resolved['strategies.RSI'] = { value: pipeline.enableRSI, source: 'ConfigLoader:pipeline.enableRSI' };
  resolved['strategies.MADynamicSR'] = { value: pipeline.enableMADynamicSR, source: 'ConfigLoader:pipeline.enableMADynamicSR' };
  resolved['strategies.EMACrossover'] = { value: pipeline.enableEMACrossover, source: 'ConfigLoader:pipeline.enableEMACrossover' };
  resolved['strategies.LiquiditySweep'] = { value: pipeline.enableLiquiditySweep, source: 'ConfigLoader:pipeline.enableLiquiditySweep' };
  resolved['strategies.BreakRetest'] = { value: pipeline.enableBreakRetest, source: 'ConfigLoader:pipeline.enableBreakRetest' };
  resolved['strategies.MarketRegime'] = { value: pipeline.enableMarketRegime, source: 'ConfigLoader:pipeline.enableMarketRegime' };
  resolved['strategies.MultiTimeframe'] = { value: pipeline.enableMultiTimeframe, source: 'ConfigLoader:pipeline.enableMultiTimeframe' };
  resolved['strategies.OGZTPO'] = { value: pipeline.enableOGZTPO, source: 'ConfigLoader:pipeline.enableOGZTPO' };
  resolved['strategies.ORB'] = { value: pipeline.enableOpeningRangeBreakout, source: 'ConfigLoader:pipeline.enableOpeningRangeBreakout' };
  resolved['strategies.TRAI'] = { value: pipeline.enableTRAI, source: 'ConfigLoader:pipeline.enableTRAI' };
  resolved['strategies.Dashboard'] = { value: pipeline.enableDashboard, source: 'ConfigLoader:pipeline.enableDashboard' };

  // === ATR FILTER ===
  resolved['filters.atrEnabled'] = getSource('ATR_FILTER_ENABLED', null, 'false (DISABLED)');
  resolved['filters.atrMinPercent'] = getSource('ATR_MIN_PERCENT', null, 0.15);

  // === BACKTEST ===
  resolved['backtest.candleDataFile'] = getSource('CANDLE_DATA_FILE', null, 'none');
  resolved['backtest.initialBalance'] = getSource('INITIAL_BALANCE', null, 10000);
  resolved['backtest.silent'] = getSource('BACKTEST_SILENT', null, 'false');
  resolved['backtest.fast'] = getSource('BACKTEST_FAST', null, 'false');
  resolved['backtest.verbose'] = getSource('BACKTEST_VERBOSE', null, 'false');
  resolved['backtest.noPatternSave'] = getSource('BACKTEST_NO_PATTERN_SAVE', null, 'false');

  // === DYNAMIC TRAILING STOP ===
  resolved['trail.atrMultiplier'] = getSource('TRAIL_ATR_MULTIPLIER', null, 2.0);
  resolved['trail.minActivation'] = getSource('TRAIL_MIN_ACTIVATION', null, 1.5);
  resolved['trail.trendWiden'] = getSource('TRAIL_TREND_WIDEN', null, 1.5);
  resolved['trail.structureTighten'] = getSource('TRAIL_STRUCTURE_TIGHTEN', null, 0.5);

  // === PER-STRATEGY EXIT CONTRACTS (actual values from ConfigLoader) ===
  const strategies = ['RSI', 'EMASMACrossover', 'LiquiditySweep', 'MADynamicSR', 'CandlePattern', 'MarketRegime'];
  for (const s of strategies) {
    const contract = ConfigLoader.getExitContract(s);
    if (contract) {
      resolved[`exitContract.${s}.SL`] = { value: contract.stopLossPercent, source: `ConfigLoader:exitContracts.${s}.stopLossPercent` };
      resolved[`exitContract.${s}.TP`] = { value: contract.takeProfitPercent, source: `ConfigLoader:exitContracts.${s}.takeProfitPercent` };
      resolved[`exitContract.${s}.trail`] = { value: contract.trailingStopPercent, source: `ConfigLoader:exitContracts.${s}.trailingStopPercent` };
      resolved[`exitContract.${s}.trailAct`] = { value: contract.trailingActivation, source: `ConfigLoader:exitContracts.${s}.trailingActivation` };
      resolved[`exitContract.${s}.maxHold`] = { value: contract.maxHoldTimeMinutes, source: `ConfigLoader:exitContracts.${s}.maxHoldTimeMinutes` };
    }
  }

  addConfigLoaderLeaves(resolved, context);

  return resolved;
}

function getRiskConfigViolations(context = createAuditContext()) {
  return (context.configSnapshot.errors || [])
    .filter(error => /^risk\.[^.]+ requires explicit env\/profile source$/.test(error));
}

// ═══════════════════════════════════════════════════════════════
// GREP FOR PROCESS.ENV IN ACTIVE PATH
// ═══════════════════════════════════════════════════════════════

function findEnvReads() {
  const { execSync } = require('child_process');
  const path = require('path');
  const projectRoot = path.resolve(__dirname, '..');
  
  const activeFiles = [
    'run-empire-v2.js',
    'foundation/ConfigLoader.js',
    'core/TradingLoop.js',
    'core/OrderExecutor.js',
    'core/ExitContractManager.js',
    'core/StateManager.js',
    'core/RiskManager.js',
    'core/PolicyBuilder.js',
    'core/ProfitExitPlanner.js',
    'core/BacktestRunner.js',
    'core/StrategyOrchestrator.js',
    'core/CandleProcessor.js',
    'core/DrawdownTracker.js',
    'core/exit/StopLossChecker.js',
    'core/exit/DynamicTrailingStop.js',
    'core/exit/MaxHoldChecker.js',
    'core/exit/TakeProfitChecker.js',
    'core/exit/BreakEvenManager.js',
    'instrument.js',
  ];

  const results = [];
  for (const file of activeFiles) {
    const fullPath = path.join(projectRoot, file);
    try {
      const content = require('fs').readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        // Find process.env reads outside ConfigLoader's env helpers
        if (line.includes('process.env.') && !line.includes('const env =') && !line.includes('function env')) {
          const match = line.match(/process\.env\.([A-Z_]+)/);
          if (match) {
            results.push({
              file: file,
              line: i + 1,
              envVar: match[1],
              code: line.trim().substring(0, 100),
            });
          }
        }
      });
    } catch (e) {
      // File doesn't exist, skip
    }
  }
  return results;
}

function buildFingerprint(resolved) {
  const sortedKeys = Object.keys(resolved).sort();
  const fingerprintData = sortedKeys.map(k => `${k}=${JSON.stringify(resolved[k].value)}`).join('|');
  return crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);
}

function sourceLabelFor(source) {
  if (source.startsWith('audit-fixture:')) return 'AUD';
  if (source.startsWith('env:') || source.startsWith('dotenv:')) return 'ENV';
  if (source.startsWith('derived:')) return 'DER';
  if (source.startsWith('ConfigLoader:')) return 'CFG';
  if (source.startsWith('ConfigLoader')) return 'CFG';
  if (source === 'default' || source === 'hardcoded-default') return 'DEF';
  return 'UNK';
}

// ═══════════════════════════════════════════════════════════════
// MAIN OUTPUT
// ═══════════════════════════════════════════════════════════════

function run(context = createAuditContext()) {
  console.log('\n' + '═'.repeat(80));
  console.log('  OGZPRIME CONFIG AUDIT — Resolved Values & Sources');
  console.log('═'.repeat(80));

  const resolved = buildResolvedConfig(context);
  const riskConfigViolations = getRiskConfigViolations(context);
  const fingerprint = buildFingerprint(resolved);

  console.log(`\n  Config Fingerprint: ${fingerprint}`);
  console.log(`  Env File: ${context.envPath}`);
  if (context.auditFixtureKeys && context.auditFixtureKeys.length > 0) {
    console.log(`  Audit Fixture Keys: ${context.auditFixtureKeys.join(', ')}`);
  }
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  // Print grouped
  const groups = {};
  for (const [key, entry] of Object.entries(resolved)) {
    const group = key.split('.')[0];
    if (!groups[group]) groups[group] = [];
    groups[group].push({ key, ...entry });
  }

  for (const [groupName, entries] of Object.entries(groups)) {
    console.log(`\n── ${groupName.toUpperCase()} ${'─'.repeat(70 - groupName.length)}`);
    for (const entry of entries) {
      const val = typeof entry.value === 'boolean' ? (entry.value ? 'true' : 'false') : String(entry.value);
      console.log(`  [${sourceLabelFor(entry.source)}] ${entry.key.padEnd(45)} = ${val.padEnd(20)} [${entry.source}]`);
    }
  }

  if (riskConfigViolations.length > 0) {
    console.log(`\n── RISK CONFIG VIOLATIONS ${'─'.repeat(48)}`);
    for (const violation of riskConfigViolations) {
      console.log(`  [ERR] ${violation}`);
    }
  }

  // ENV LEAK SCAN
  console.log(`\n${'═'.repeat(80)}`);
  console.log('  PROCESS.ENV READS IN ACTIVE PIPELINE FILES');
  console.log(`${'═'.repeat(80)}\n`);

  const envReads = findEnvReads();
  const byFile = {};
  for (const r of envReads) {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r);
  }

  let totalReads = 0;
  for (const [file, reads] of Object.entries(byFile)) {
    // Separate bootstrap (ConfigLoader, run-empire-v2 top) from runtime
    const isBootstrap = file === 'foundation/ConfigLoader.js' || file === 'instrument.js';
    const label = isBootstrap ? '(bootstrap — OK)' : '(RUNTIME — should be injected)';
    console.log(`  ${file} ${label}`);
    for (const r of reads) {
      const readLabel = isBootstrap ? '[BOOT]' : '[RUNTIME]';
      console.log(`  ${readLabel} Line ${String(r.line).padEnd(5)} ${r.envVar.padEnd(30)} ${r.code.substring(0, 80)}`);
      totalReads++;
    }
    console.log('');
  }

  console.log(`\n  Total: ${totalReads} direct process.env reads across ${Object.keys(byFile).length} active files`);
  const runtimeReads = envReads.filter(r => r.file !== 'foundation/ConfigLoader.js' && r.file !== 'instrument.js');
  console.log(`  Runtime reads (should be 0): ${runtimeReads.length}`);

  // Save to file
  const auditData = {
    fingerprint,
    timestamp: new Date().toISOString(),
    envFile: context.envPath,
    auditFixtureKeys: context.auditFixtureKeys || [],
    resolved,
    riskConfigViolations,
    envReads: envReads.map(r => ({ file: r.file, line: r.line, envVar: r.envVar })),
    runtimeEnvReads: runtimeReads.length,
  };

  const outPath = path.join(__dirname, '..', 'backtest-results', `config-audit-${Date.now()}.json`);
  try {
    if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(auditData, null, 2));
    console.log(`\n[config-audit] Audit saved: ${outPath}`);
  } catch (e) {
    console.log(`\n[config-audit] Could not save audit file: ${e.message}`);
  }

  console.log(`\n${'═'.repeat(80)}\n`);
  return auditData;
}

if (require.main === module) {
  const auditData = run();
  if (auditData.riskConfigViolations.length > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  CONFIG_LOADER_ENV_PATHS,
  addConfigLoaderLeaves,
  auditEntry,
  buildFingerprint,
  buildResolvedConfig,
  createAuditContext,
  flattenConfigLeaves,
  getPath,
  getRiskConfigViolations,
  getSourceFromContext,
  isSecretPath,
  REDACTED_VALUE,
  run,
  sourceLabelFor,
};
