/**
 * ConfigAudit.js - Print every resolved config value and its source
 * =================================================================
 * 
 * Run: node tools/config-audit.js
 * 
 * Or from run-empire-v2.js:
 *   if (process.argv.includes('--audit-config')) {
 *     require('./tools/config-audit.js');
 *     process.exit(0);
 *   }
 * 
 * Outputs the ACTUAL values every module will receive, with source tracking.
 * Use this to prove the pipeline isn't being poisoned by hidden defaults.
 * 
 * @author Claude (Opus) for Trey / OGZPrime
 * @date 2026-03-17
 */

'use strict';

// Load env first (same as run-empire-v2.js)
const envPath = process.env.DOTENV_CONFIG_PATH || '.env';
require('dotenv').config({ path: envPath });

// Normalize BACKTEST_MODE (same as run-empire-v2.js lines 28-41)
if (process.env.EXECUTION_MODE === 'backtest' || process.env.CANDLE_SOURCE === 'file') {
  process.env.BACKTEST_MODE = 'true';
}

const TradingConfig = require('../core/TradingConfig');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// TRACE EVERY VALUE
// ═══════════════════════════════════════════════════════════════

function getSource(envKey, configPath, hardcodedDefault) {
  const envVal = process.env[envKey];
  const configVal = configPath ? TradingConfig.get(configPath) : undefined;
  
  if (envVal !== undefined && envVal !== '') {
    return { value: envVal, source: `env:${envKey}`, raw: true };
  }
  if (configVal !== undefined && configVal !== null) {
    return { value: configVal, source: `TradingConfig:${configPath}`, raw: false };
  }
  return { value: hardcodedDefault, source: 'hardcoded-default', raw: false };
}

function buildResolvedConfig() {
  const resolved = {};

  // === EXECUTION MODE ===
  resolved['mode.execution'] = getSource('EXECUTION_MODE', 'pipeline.executionMode', 'paper');
  resolved['mode.backtest'] = getSource('BACKTEST_MODE', null, 'false');
  resolved['mode.paperTrading'] = getSource('PAPER_TRADING', null, 'false');
  resolved['mode.liveTading'] = getSource('LIVE_TRADING', null, 'false');
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
  resolved['fees.makerFee'] = getSource('FEE_MAKER', 'fees.makerFee', 0.0025);
  resolved['fees.takerFee'] = getSource('FEE_TAKER', 'fees.takerFee', 0.004);
  resolved['fees.totalRoundTrip'] = { value: TradingConfig.get('fees.totalRoundTrip'), source: 'TradingConfig:fees.totalRoundTrip' };

  // === RISK MANAGEMENT ===
  resolved['risk.riskManagerBypass'] = getSource('RISK_MANAGER_BYPASS', null, 'true (BYPASSED)');
  resolved['risk.accountDrawdownBypass'] = getSource('ACCOUNT_DRAWDOWN_BYPASS', null, 'false (ACTIVE)');
  resolved['risk.maxDrawdown'] = getSource('MAX_DRAWDOWN', 'risk.maxDrawdown', 10);
  resolved['risk.maxDailyLoss'] = getSource('MAX_DAILY_LOSS', 'risk.maxDailyLoss', 3);

  // === UNIVERSAL LIMITS ===
  resolved['limits.hardStopLoss'] = { value: TradingConfig.get('universalLimits.hardStopLossPercent'), source: 'TradingConfig:universalLimits.hardStopLossPercent' };
  resolved['limits.accountDrawdown'] = { value: TradingConfig.get('universalLimits.accountDrawdownPercent'), source: 'TradingConfig:universalLimits.accountDrawdownPercent' };
  resolved['limits.maxHoldTime'] = { value: TradingConfig.get('universalLimits.maxHoldTimeMinutes'), source: 'TradingConfig:universalLimits.maxHoldTimeMinutes' };

  // === STRATEGY TOGGLES ===
  const pipeline = TradingConfig.get('pipeline') || {};
  resolved['strategies.RSI'] = { value: pipeline.enableRSI, source: 'TradingConfig:pipeline.enableRSI' };
  resolved['strategies.MADynamicSR'] = { value: pipeline.enableMADynamicSR, source: 'TradingConfig:pipeline.enableMADynamicSR' };
  resolved['strategies.EMACrossover'] = { value: pipeline.enableEMACrossover, source: 'TradingConfig:pipeline.enableEMACrossover' };
  resolved['strategies.LiquiditySweep'] = { value: pipeline.enableLiquiditySweep, source: 'TradingConfig:pipeline.enableLiquiditySweep' };
  resolved['strategies.BreakRetest'] = { value: pipeline.enableBreakRetest, source: 'TradingConfig:pipeline.enableBreakRetest' };
  resolved['strategies.MarketRegime'] = { value: pipeline.enableMarketRegime, source: 'TradingConfig:pipeline.enableMarketRegime' };
  resolved['strategies.MultiTimeframe'] = { value: pipeline.enableMultiTimeframe, source: 'TradingConfig:pipeline.enableMultiTimeframe' };
  resolved['strategies.OGZTPO'] = { value: pipeline.enableOGZTPO, source: 'TradingConfig:pipeline.enableOGZTPO' };
  resolved['strategies.ORB'] = { value: pipeline.enableOpeningRangeBreakout, source: 'TradingConfig:pipeline.enableOpeningRangeBreakout' };
  resolved['strategies.TRAI'] = { value: pipeline.enableTRAI, source: 'TradingConfig:pipeline.enableTRAI' };
  resolved['strategies.Dashboard'] = { value: pipeline.enableDashboard, source: 'TradingConfig:pipeline.enableDashboard' };

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

  // === PER-STRATEGY EXIT CONTRACTS (actual values from TradingConfig) ===
  const strategies = ['RSI', 'EMASMACrossover', 'LiquiditySweep', 'MADynamicSR', 'CandlePattern', 'MarketRegime'];
  for (const s of strategies) {
    const contract = TradingConfig.getExitContract(s);
    if (contract) {
      resolved[`exitContract.${s}.SL`] = { value: contract.stopLossPercent, source: `TradingConfig:exitContracts.${s}.stopLossPercent` };
      resolved[`exitContract.${s}.TP`] = { value: contract.takeProfitPercent, source: `TradingConfig:exitContracts.${s}.takeProfitPercent` };
      resolved[`exitContract.${s}.trail`] = { value: contract.trailingStopPercent, source: `TradingConfig:exitContracts.${s}.trailingStopPercent` };
      resolved[`exitContract.${s}.trailAct`] = { value: contract.trailingActivation, source: `TradingConfig:exitContracts.${s}.trailingActivation` };
      resolved[`exitContract.${s}.maxHold`] = { value: contract.maxHoldTimeMinutes, source: `TradingConfig:exitContracts.${s}.maxHoldTimeMinutes` };
    }
  }

  return resolved;
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
    'core/TradingConfig.js',
    'core/TradingLoop.js',
    'core/OrderExecutor.js',
    'core/ExitContractManager.js',
    'core/StateManager.js',
    'core/RiskManager.js',
    'core/MaxProfitManager.js',
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
        // Find process.env reads (not in TradingConfig's env() helper)
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

// ═══════════════════════════════════════════════════════════════
// MAIN OUTPUT
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(80));
console.log('  OGZPRIME CONFIG AUDIT — Resolved Values & Sources');
console.log('═'.repeat(80));

const resolved = buildResolvedConfig();

// Generate fingerprint
const sortedKeys = Object.keys(resolved).sort();
const fingerprintData = sortedKeys.map(k => `${k}=${JSON.stringify(resolved[k].value)}`).join('|');
const fingerprint = crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);

console.log(`\n  Config Fingerprint: ${fingerprint}`);
console.log(`  Env File: ${envPath}`);
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
    const sourceIcon = entry.source.startsWith('env:') ? '🌐' : 
                       entry.source.startsWith('TradingConfig') ? '📋' : 
                       entry.source === 'hardcoded-default' ? '⚠️' : '❓';
    console.log(`  ${sourceIcon} ${entry.key.padEnd(45)} = ${val.padEnd(20)} [${entry.source}]`);
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
  // Separate bootstrap (TradingConfig, run-empire-v2 top) from runtime
  const isBootstrap = file === 'core/TradingConfig.js' || file === 'instrument.js';
  const label = isBootstrap ? '(bootstrap — OK)' : '(RUNTIME — should be injected)';
  console.log(`  ${file} ${label}`);
  for (const r of reads) {
    const icon = isBootstrap ? '  ✅' : '  ⚠️';
    console.log(`${icon} Line ${String(r.line).padEnd(5)} ${r.envVar.padEnd(30)} ${r.code.substring(0, 80)}`);
    totalReads++;
  }
  console.log('');
}

console.log(`\n  Total: ${totalReads} direct process.env reads across ${Object.keys(byFile).length} active files`);
const runtimeReads = envReads.filter(r => r.file !== 'core/TradingConfig.js' && r.file !== 'instrument.js');
console.log(`  Runtime reads (should be 0): ${runtimeReads.length}`);

// Save to file
const fs = require('fs');
const path = require('path');
const auditData = {
  fingerprint,
  timestamp: new Date().toISOString(),
  envFile: envPath,
  resolved,
  envReads: envReads.map(r => ({ file: r.file, line: r.line, envVar: r.envVar })),
  runtimeEnvReads: runtimeReads.length,
};

const outPath = path.join(__dirname, '..', 'backtest-results', `config-audit-${Date.now()}.json`);
try {
  if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(auditData, null, 2));
  console.log(`\n📁 Audit saved: ${outPath}`);
} catch (e) {
  console.log(`\n⚠️ Could not save audit file: ${e.message}`);
}

console.log(`\n${'═'.repeat(80)}\n`);
