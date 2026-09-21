#!/usr/bin/env node
/**
 * OGZPrime PARALLEL BACKTESTER — REAL PIPELINE EDITION v2
 * ========================================================
 * 
 * Runs the ACTUAL trading pipeline via child processes with typed run descriptors.
 * Each worker = fresh node run-empire-v2.js with different config.
 * 
 * Fixes from v1:
 * - Worker timeout and shutdown grace come from canonical internals
 * - BACKTEST_SILENT passes through summary lines for parsing
 * - EMFILE fix: skip pattern saving + CSV export in parallel mode
 * - Reads results from JSON report file as fallback
 * 
 * Usage:
 *   node tools/parallel-backtest.js --real --fee-profile=ttp_real     (typed overrides only - default)
 *   node tools/parallel-backtest.js --full --fee-profile=ttp_real     (all HONORED sweeps)
 *   node tools/parallel-backtest.js --atr --fee-profile=ttp_real      (ATR filter sweep)
 * 
 * @author Claude (Opus) for Trey / OGZPrime
 * @date 2026-03-16
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ConfigLoader = require('../foundation/ConfigLoader');
const { getBacktestResultsDir } = require('../core/OutputPaths');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const {
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
  removeBacktestRunDescriptor,
} = require('./backtest-worker-env');
const {
  DEFAULT_TUNING_PROFILE,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
} = require('./tuning-profiles');
const {
  listFeeProfileNames,
  resolveFeeProfile,
  summarizeFeeProfile,
} = require('./fee-profiles');

// ═══════════════════════════════════════════════════════════════
// HARDWARE DETECTION
// ═══════════════════════════════════════════════════════════════
const cpuModel = os.cpus()[0]?.model || 'Unknown';
const threadCount = os.cpus().length;
const is7800X3D = cpuModel.includes('7800X3D');
const MAX_WORKERS = Math.max(1, is7800X3D ? 14 : threadCount - 2);

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(PROJECT_ROOT, 'run-empire-v2.js');
const PARALLEL_BACKTEST_CONFIG = ConfigLoader.getParallelBacktestConfig();
const DEFAULT_DATA = PARALLEL_BACKTEST_CONFIG.defaultData;
const DATA_SHORTCUTS = Object.freeze({ ...PARALLEL_BACKTEST_CONFIG.dataShortcuts });
const STOCK_DATA_SHORTCUTS = Object.freeze([...PARALLEL_BACKTEST_CONFIG.stockDataShortcutKeys]);
const RESULTS_DIR = getBacktestResultsDir();
const WORKER_LOG_DIR = path.join(RESULTS_DIR, 'worker-logs');
const TIMEOUT_MS = PARALLEL_BACKTEST_CONFIG.timeoutMs;
const KILL_GRACE_MS = PARALLEL_BACKTEST_CONFIG.killGraceMs;

function isStockDataShortcut(key) {
  return STOCK_DATA_SHORTCUTS.includes(key);
}

function prepareResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function cleanupParallelStateFiles() {
  // Clean up any leftover state files from previous runs.
  try {
    const dataDir = path.join(PROJECT_ROOT, 'data');
    if (fs.existsSync(dataDir)) {
      fs.readdirSync(dataDir)
        .filter(f => f.startsWith('state-parallel-'))
        .forEach(f => { try { fs.unlinkSync(path.join(dataDir, f)); } catch(e) {} });
    }
  } catch(e) {}
}

function normalizeWorkerErrors(value) {
  if (value == null || value === false) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }
  if (typeof value === 'bigint') {
    return value > 0n ? Math.min(Number(value), Number.MAX_SAFE_INTEGER) : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const count = Number(trimmed);
    if (Number.isFinite(count)) return count > 0 ? Math.trunc(count) : 0;
    return 1;
  }
  if (value) return 1;
  return 0;
}

function hasWorkerError(result) {
  return normalizeWorkerErrors(result?.workerErrors) > 0
    || result?.error
    || (result?.exitCode !== undefined && result.exitCode !== 0);
}

function isCleanParsedResult(result) {
  return result?.netPnl != null && !hasWorkerError(result);
}

function getWorkerFailureReason(result) {
  const workerErrors = normalizeWorkerErrors(result?.workerErrors);
  if (workerErrors > 0) {
    return `Worker reported ${workerErrors} candle processing error(s)`;
  }
  if (result?.exitCode !== undefined && result.exitCode !== 0) {
    return `Worker exited with code ${result.exitCode}`;
  }
  if (result?.error) return result.error;
  return null;
}

function writeWorkerOutputLog(reportTag, output, workerLogDir = WORKER_LOG_DIR) {
  fs.mkdirSync(workerLogDir, { recursive: true });
  const contents = output == null ? '' : String(output);
  const safeTag = String(reportTag || `worker-${Date.now()}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`;
    const logPath = path.join(workerLogDir, `${safeTag}${suffix}.log`);
    try {
      fs.writeFileSync(logPath, contents, { flag: 'wx' });
      return logPath;
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error(`Unable to allocate worker log path for ${safeTag}`);
}

function summarizeFailedResult(result) {
  const error = result.error || getWorkerFailureReason(result);
  return {
    name: result.name,
    elapsed: result.elapsed,
    exitCode: result.exitCode,
    workerErrors: normalizeWorkerErrors(result.workerErrors),
    error: error || null,
    netPnl: result.netPnl ?? null,
    trades: result.trades ?? null,
    winRate: result.winRate ?? null,
    reportPath: result.reportPath || null,
    workerLogPath: result.workerLogPath || null,
    requestedOverrides: { ...(result.config?.overrides || {}) },
    resolvedWorkerConfig: result.workerEnv || null,
  };
}

function buildWorkerProcessErrorResult(config, env, reportTag, output, err, elapsed, workerLogDir) {
  const workerLogPath = writeWorkerOutputLog(reportTag, output, workerLogDir);
  return {
    name: config.name,
    config: config,
    workerEnv: summarizeWorkerEnv(env),
    error: err.message,
    elapsed: elapsed,
    workerLogPath: workerLogPath,
  };
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY LIST & GAUNTLET GENERATORS (must be before SWEEP_PRESETS)
// ═══════════════════════════════════════════════════════════════

const STRATEGIES = Object.freeze([...PARALLEL_BACKTEST_CONFIG.strategies]);

function parseSoloStrategies(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function applySoloStrategyToConfigs(configs, soloStrategy) {
  if (!soloStrategy) return configs;
  const selected = String(soloStrategy).split(',').map(value => value.trim()).filter(Boolean);
  return configs.map(config => {
    return {
      ...config,
      overrides: {
        ...(config.overrides || {}),
        'strategies.soloFilter': selected,
      },
    };
  });
}

function filterConfigsByName(configs, pattern) {
  if (!pattern) return cloneSweepConfigs(configs);
  let matcher;
  try {
    matcher = new RegExp(pattern, 'i');
  } catch (error) {
    const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    matcher = new RegExp(escaped, 'i');
  }
  return cloneSweepConfigs(configs).filter(config => matcher.test(config.name));
}

function generateGauntlet(paramType, values) {
  const configs = [];
  for (const strat of STRATEGIES) {
    for (const val of values) {
      const overrides = { 'strategies.soloFilter': [strat] };
      let name = `${strat.substring(0,4)}-`;

      if (paramType === 'confidence') {
        overrides['confidence.minTradeConfidence'] = val;
        name += `c${(val*100).toFixed(0)}`;
      } else if (paramType === 'atr') {
        if (val === 0) {
          overrides['filters.atrEnabled'] = false;
          name += 'atr-off';
        } else {
          overrides['filters.atrEnabled'] = true;
          overrides['filters.atrMinPercent'] = val;
          name += `atr${(val*100).toFixed(0)}`;
        }
      }

      configs.push({ name, overrides });
    }
  }
  return configs;
}

// ═══════════════════════════════════════════════════════════════
// PARAMETER SWEEP DEFINITIONS
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// TYPED OVERRIDE AUDIT
// ═══════════════════════════════════════════════════════════════
// HONORED: filters.atrEnabled, filters.atrMinPercent,
//          positionSizing.maxPositionSize, exits.profitTiers.tier1/2/3.
// HONORED STRATEGY-OWNED EXIT GEOMETRY: canonical nested strategies.* leaves
//          exposed by --exit-geometry.
// REJECTED: generic stop/target/trail controls outside strategy exitContracts
//           (locked exitContracts own strategy risk; descriptors reject invented tuning).
// PARTIAL: confidence.minTradeConfidence (entry gate works, but strategies also
//          retain their canonical strategy-specific minimum-confidence leaves).
// ═══════════════════════════════════════════════════════════════

const SWEEP_PRESET_DEFINITIONS = PARALLEL_BACKTEST_CONFIG.sweepPresets;

function cloneSweepConfig(config) {
  if (config.env !== undefined) {
    throw new Error(`Sweep preset '${config.name}' still uses removed env-shaped behavior transport`);
  }
  return {
    name: config.name,
    overrides: { ...(config.overrides || {}) },
  };
}

function cloneSweepConfigs(configs) {
  return (configs || []).map(cloneSweepConfig);
}

function freezeSweepConfigs(configs) {
  return Object.freeze(cloneSweepConfigs(configs).map(config => Object.freeze({
    ...config,
    overrides: Object.freeze({ ...config.overrides }),
  })));
}

const SWEEP_PRESETS = Object.freeze({
  // ═══════════════════════════════════════════════════════════════
  // REAL — Only canonical typed leaves that actually affect trading
  // ═══════════════════════════════════════════════════════════════
  real: freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.real),

  // Quick is now an alias to real (old quick was theater)
  quick: function() { return cloneSweepConfigs(SWEEP_PRESET_DEFINITIONS.real); },

  // ═══════════════════════════════════════════════════════════════
  // FOCUSED SWEEPS — One variable at a time (HONORED only)
  // ═══════════════════════════════════════════════════════════════

  atr: freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.atr),

  sizing: freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.sizing),

  tiers: freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.tiers),

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY ISOLATION — Test each strategy individually
  // ═══════════════════════════════════════════════════════════════
  'strategy-sweep': freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.strategySweep),

  // Strategy-owned stop/target/trail geometry.
  'exit-geometry': freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.exitGeometry),

  // RSI truth sweep - buyBelow x exitAbove through caged config overrides
  rsi: freezeSweepConfigs(generateRSISweep()),

  // ═══════════════════════════════════════════════════════════════
  // GAUNTLET SWEEPS — All strategies x HONORED parameters
  // ═══════════════════════════════════════════════════════════════
  'gauntlet-atr': freezeSweepConfigs(generateGauntlet('atr', PARALLEL_BACKTEST_CONFIG.gauntlet.atrValues)),

  // ═══════════════════════════════════════════════════════════════
  // FULL — All HONORED sweeps combined
  // ═══════════════════════════════════════════════════════════════
  full: function() {
    return cloneSweepConfigs([
      ...SWEEP_PRESET_DEFINITIONS.real,
      ...SWEEP_PRESET_DEFINITIONS.atr,
      ...SWEEP_PRESET_DEFINITIONS.sizing,
      ...SWEEP_PRESET_DEFINITIONS.tiers,
    ]);
  },
});

function generateRSISweep(options = PARALLEL_BACKTEST_CONFIG.rsiSweep) {
  const configs = [];
  const { buyBelowLevels, exitAboveLevels, minSpread } = options;
  for (const buyBelow of buyBelowLevels) {
    for (const exitAbove of exitAboveLevels) {
      if (exitAbove - buyBelow < minSpread) continue;
      configs.push({
        name: `rsi-b${buyBelow}-x${exitAbove}`,
        overrides: {
          'strategies.RSI.buyBelow': buyBelow,
          'strategies.RSI.exitAbove': exitAbove,
        }
      });
    }
  }
  return configs;
}

// ═══════════════════════════════════════════════════════════════
// WORKER — Runs a single backtest as a child process
// ═══════════════════════════════════════════════════════════════

function runSingleBacktest(config, dataFile, stockMode = false, profileName = DEFAULT_TUNING_PROFILE, feeProfileName) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const uniqueId = `${config.name}-${Date.now()}-${Math.random().toString(36).substr(2,4)}`;
    const stateFile = path.join(PROJECT_ROOT, 'data', `state-parallel-${uniqueId}.json`);
    const reportTag = `parallel-${uniqueId}`;
    
    const instrumentIdentity = resolveInstrumentFromDataFile(dataFile);
    const env = buildBacktestWorkerEnv({
      sourceEnv: process.env,
      projectRoot: PROJECT_ROOT,
      dataFile,
      stateFile,
      dataDir: path.join(PROJECT_ROOT, 'data', 'backtest'),
      reportTag,
      outputDir: RESULTS_DIR,
      freshStart: false,
      profileName,
      feeProfileName,
      overrides: config.overrides || {},
      instrumentIdentity,
    });

    let output = '';
    let settled = false;

    const child = spawn(process.execPath, [RUNNER], {
      cwd: PROJECT_ROOT,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Timeout handler (disabled when TIMEOUT_MS = 0)
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      removeBacktestRunDescriptor(env);
      try { fs.unlinkSync(stateFile); } catch(e) {}
      resolve(result);
    };
    if (TIMEOUT_MS > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      }, TIMEOUT_MS);
    }

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    child.on('close', (code) => {
      if (settled) return;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // If exit code 1 and quick failure, show the error
      if (code === 1 && parseFloat(elapsed) < 3) {
        // Extract error message from output
        const errorMatch = output.match(/Error:|CRITICAL|Cannot find module/i);
        if (errorMatch || output.length < 500) {
          console.error(`\n  [${config.name}] CRASH OUTPUT:\n${output.slice(0, 1000)}\n`);
        }
      }

      // Try parsing from console output first
      let result = parseBacktestOutput(output, config.name);

      // If console parsing failed, try reading the report JSON
      if (result.trades == null) {
      const reportResult = tryReadReport(PROJECT_ROOT, reportTag, RESULTS_DIR);
        if (reportResult) {
          result = { ...result, ...reportResult };
        }
      }

      result.elapsed = elapsed;
      result.exitCode = code;
      result.config = config;
      result.workerEnv = summarizeWorkerEnv(env);
      result.workerErrors = normalizeWorkerErrors(result.workerErrors);
      if (hasWorkerError(result)) {
        const workerLogPath = writeWorkerOutputLog(reportTag, output);
        if (workerLogPath) result.workerLogPath = workerLogPath;
        if (!result.error) result.error = getWorkerFailureReason(result);
      }

      finish(result);
    });

    child.on('error', (err) => {
      const failure = buildWorkerProcessErrorResult(
        config,
        env,
        reportTag,
        output,
        err,
        ((Date.now() - startTime) / 1000).toFixed(1)
      );
      finish(failure);
    });
  });
}

function listTaggedReports(scanDir, tag) {
  if (!scanDir || !fs.existsSync(scanDir)) return [];
  const reports = [];
  for (const entry of fs.readdirSync(scanDir, { withFileTypes: true })) {
    const full = path.join(scanDir, entry.name);
    if (entry.isDirectory()) {
      reports.push(...listTaggedReports(full, tag));
      continue;
    }
    const matchesLegacyName = entry.name.startsWith('backtest-report-') && entry.name.endsWith('.json');
    const matchesCampaignName = entry.name.startsWith('report-') && entry.name.endsWith('.json');
    if (!matchesLegacyName && !matchesCampaignName) continue;
    if (tag && full.indexOf(tag) === -1) continue;
    reports.push({ name: entry.name, path: full, mtime: fs.statSync(full).mtimeMs });
  }
  return reports;
}

function tryReadReport(projectRoot, tag, outputRoot) {
  try {
    if (!tag) return null;
    // Match only this worker's tag across the configured output root and legacy
    // locations. Reading an unrelated "latest" report would silently attach a
    // different configuration's result to this descriptor.
    const workerDir = path.join(projectRoot, 'backtest-results', 'worker-reports');
    const reports = []
      .concat(listTaggedReports(outputRoot, tag))
      .concat(listTaggedReports(workerDir, tag))
      .concat(listTaggedReports(projectRoot, tag))
      .sort((a, b) => b.mtime - a.mtime);

    if (reports.length === 0) return null;

    const reportPath = reports[0].path;
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    // FIX 2026-04-22: removed unlinkSync — reports retained for postmortem.

    const trades = data.trades || [];
    const summary = data.summary || {};

    const finalBalance = finiteNumber(summary.finalBalance);
    const startingBalance = firstFiniteNumber(
      summary.startingBalance,
      summary.initialBalance,
      data.config && data.config.initialBalance
    );

    if (trades.length === 0 && finalBalance == null) return null;

    const winners = trades.filter(t => (t.netPnlDollars || t.pnl || 0) > 0);
    const totalFees = trades.reduce((s, t) => s + (t.feesDollars || 0), 0);
    let netPnl = firstFiniteNumber(summary.netPnlDollars, summary.totalPnL);
    if (netPnl == null && finalBalance != null && startingBalance != null) {
      netPnl = finalBalance - startingBalance;
    }
    if (netPnl == null && trades.length > 0) {
      netPnl = trades.reduce((s, t) => s + (t.netPnlDollars || 0), 0);
    }

    // FIX 2026-04-22: expanded return shape — BacktestRunner now spreads the full
    // BacktestRecorder.getSummary() into report.summary, so these extra fields are
    // available and downstream leaderboard can render Trades/WR/DD/PF columns.
    return {
      finalBalance,
      startingBalance,
      trades: trades.length > 0 ? trades.length : (summary.totalTrades || null),
      winRate: trades.length > 0 ? (winners.length / trades.length) * 100 :
               (summary.winRate != null ? parseFloat(summary.winRate) : null),
      netPnl: netPnl,
      fees: summary.totalFeesPaid != null ? summary.totalFeesPaid : totalFees,
      maxDrawdown: summary.maxDrawdownPercent != null ? parseFloat(summary.maxDrawdownPercent) : null,
      profitFactor: summary.profitFactor != null && summary.profitFactor !== 'N/A'
                    ? parseFloat(summary.profitFactor) : null,
      expectancy: summary.expectancy != null ? parseFloat(summary.expectancy) : null,
      avgWin: summary.avgWinnerDollars != null ? summary.avgWinnerDollars : null,
      avgLoss: summary.avgLoserDollars != null ? summary.avgLoserDollars : null,
      workerErrors: normalizeWorkerErrors(summary.errors),
      reportPath,
    };
  } catch(e) {
    return null;
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number != null) return number;
  }
  return null;
}

function parseBacktestOutput(output, name) {
  const result = { name };

  // Parse BacktestRecorder summary block
  const balanceMatch = output.match(/Final Balance:\s*\$?([\d,.]+)/);
  const startingBalanceMatch = output.match(/Starting Balance:\s*\$?([\d,.]+)/);
  const tradesMatch = output.match(/Total Trades:\s*(\d+)/);
  const winRateMatch = output.match(/Win Rate:\s*([\d.]+)%/);
  const pnlMatch = output.match(/Net P&L:\s*\$?([-\d,.]+)/);
  const feesMatch = output.match(/Total Fees.*?:\s*\$?([\d,.]+)/);
  const drawdownMatch = output.match(/Max Drawdown:\s*([\d.]+)%/);
  const profitFactorMatch = output.match(/Profit Factor:\s*([\d.]+)/);
  const errorMatches = Array.from(output.matchAll(/Errors:\s*(\d+)/g));
  
  // Also try the console dump format (when EMFILE prevents file write)
  const consolePnlMatch = output.match(/Total P&L:\s*\$?([-\d,.]+)\s*\(([-\d,.]+)%\)/);
  const consoleBalMatch = output.match(/Final Balance:\s*\$?([\d,.]+)/);

  result.finalBalance = balanceMatch ? parseFloat(balanceMatch[1].replace(',', '')) : null;
  result.startingBalance = startingBalanceMatch ? parseFloat(startingBalanceMatch[1].replace(',', '')) : null;
  result.trades = tradesMatch ? parseInt(tradesMatch[1]) : null;
  result.winRate = winRateMatch ? parseFloat(winRateMatch[1]) : null;
  result.netPnl = pnlMatch ? parseFloat(pnlMatch[1].replace(',', '')) : 
                  (consolePnlMatch ? parseFloat(consolePnlMatch[1].replace(',', '')) : null);
  result.fees = feesMatch ? parseFloat(feesMatch[1].replace(',', '')) : null;
  result.maxDrawdown = drawdownMatch ? parseFloat(drawdownMatch[1]) : null;
  result.profitFactor = profitFactorMatch ? parseFloat(profitFactorMatch[1]) : null;
  result.workerErrors = errorMatches.length > 0
    ? normalizeWorkerErrors(errorMatches[errorMatches.length - 1][1])
    : 0;

  if (result.finalBalance != null && result.startingBalance != null && result.netPnl == null) {
    result.netPnl = result.finalBalance - result.startingBalance;
  }

  return result;
}

function describeFeePosture(profile, stockMode) {
  if (!stockMode) return null;

  const fees = (profile && profile.overrides) || {};
  const slippage = fees['fees.slippage'];
  const slippageText = slippage !== undefined ? `, slippage=${slippage}` : '';
  if (fees['fees.model'] === 'per_share_minimum') {
    return `profile ${profile.name}: per-share minimum model (perShare=${fees['fees.perShare'] ?? 'unset'}, minOrder=${fees['fees.minOrderFee'] ?? 'unset'}${slippageText})`;
  }
  if (fees['fees.model']) {
    return `profile ${profile.name}: ${fees['fees.model']} model${slippageText}`;
  }
  return `profile ${profile.name}: stock zero-commission model${slippageText}`;
}

// ═══════════════════════════════════════════════════════════════
// PARALLEL RUNNER
// ═══════════════════════════════════════════════════════════════

async function runParallelSweep(configs, dataFile, stockMode = false, profileName = DEFAULT_TUNING_PROFILE, feeProfileName) {
  const tuningProfile = resolveTuningProfile(profileName);
  const feeProfile = resolveFeeProfile(feeProfileName);
  const feePosture = describeFeePosture(feeProfile, stockMode);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  OGZPrime PARALLEL BACKTESTER v2${stockMode ? ' [STOCK MODE]' : ''}`);
  console.log(`  ${cpuModel} | ${threadCount} threads | ${MAX_WORKERS} workers`);
  console.log(`  ${configs.length} configurations to test`);
  console.log(`  Data: ${dataFile}`);
  console.log(`  Profile: ${tuningProfile.name}`);
  console.log(`  Fee profile: ${feeProfile.name}`);
  console.log(`  Timeout: None (runs until complete)`);
  if (feePosture) console.log(`  Fees: ${feePosture}`);
  console.log(`${'═'.repeat(70)}\n`);

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < configs.length; i += MAX_WORKERS) {
    const batch = configs.slice(i, i + MAX_WORKERS);
    const batchNum = Math.floor(i / MAX_WORKERS) + 1;
    const totalBatches = Math.ceil(configs.length / MAX_WORKERS);

    console.log(`\n-- Batch ${batchNum}/${totalBatches} (${batch.length} workers) --`);
    batch.forEach(c => console.log(`  ${c.name}`));
    console.log('  Running... (no timeout, will finish when done)');

    const batchResults = await Promise.all(
      batch.map(config => runSingleBacktest(config, dataFile, stockMode, tuningProfile.name, feeProfile.name))
    );

    batchResults.forEach(r => {
      results.push(r);
      const status = r.error ? '[ERR]' : (r.netPnl > 0 ? '[WIN]' : (r.netPnl != null ? '[LOSS]' : '[MISS]'));
      const pnl = r.netPnl != null ? `$${r.netPnl.toFixed(2)}` : 'PARSE FAIL';
      const trades = r.trades || '?';
      const wr = r.winRate != null ? `${r.winRate.toFixed(1)}%` : '?';
      console.log(`  ${status} ${r.name.padEnd(25)} | P&L: ${pnl.padEnd(14)} | Trades: ${String(trades).padEnd(5)} | WR: ${wr.padEnd(7)} | ${r.elapsed}s`);
    });
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  const ranked = results
    .filter(isCleanParsedResult)
    .sort((a, b) => b.netPnl - a.netPnl);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  LEADERBOARD (${ranked.length}/${results.length} parsed, ${totalTime}s total)`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  ${'#'.padEnd(4)} ${'Config'.padEnd(28)} ${'P&L'.padEnd(14)} ${'Trades'.padEnd(8)} ${'WR%'.padEnd(8)} ${'DD%'.padEnd(8)} ${'PF'.padEnd(6)}`);
  console.log(`  ${'-'.repeat(66)}`);

  ranked.forEach((r, i) => {
    const pnl = `$${r.netPnl.toFixed(2)}`;
    const trades = r.trades || '-';
    const wr = r.winRate != null ? `${r.winRate.toFixed(1)}%` : '-';
    const dd = r.maxDrawdown != null ? `${r.maxDrawdown.toFixed(1)}%` : '-';
    const pf = r.profitFactor != null ? r.profitFactor.toFixed(2) : '-';
    console.log(`  ${String(i + 1).padEnd(4)} ${r.name.padEnd(28)} ${pnl.padEnd(14)} ${String(trades).padEnd(8)} ${wr.padEnd(8)} ${dd.padEnd(8)} ${pf.padEnd(6)}`);
  });

  // Show configs that failed to parse
  const failed = results.filter(r => r.netPnl == null || hasWorkerError(r));
  if (failed.length > 0) {
    console.log(`\n  ${failed.length} configs failed or reported worker errors:`);
    failed.forEach(r => {
      const err = r.error ? `, ${r.error}` : '';
      const workerLog = r.workerLogPath ? `, log: ${r.workerLogPath}` : '';
      console.log(`     ${r.name} (${r.elapsed}s, exit code: ${r.exitCode}${err}${workerLog})`);
    });
  }

  const reportPath = path.join(RESULTS_DIR, `sweep-${Date.now()}.json`);
  const report = {
    timestamp: new Date().toISOString(),
    hardware: { cpu: cpuModel, threads: threadCount, workers: MAX_WORKERS },
    dataFile,
    tuningProfile: summarizeTuningProfile(tuningProfile),
    feeProfile: summarizeFeeProfile(feeProfile),
    totalConfigs: configs.length,
    parsedConfigs: ranked.length,
    erroredConfigs: failed.length,
    totalTime: `${totalTime}s`,
    results: ranked,
    failed: failed.map(summarizeFailedResult),
    winner: ranked[0] || null,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull results saved: ${reportPath}`);

  if (ranked[0]) {
    console.log(`\nTop ranked result: ${ranked[0].name}`);
    console.log(`   P&L: $${ranked[0].netPnl.toFixed(2)} | WR: ${ranked[0].winRate?.toFixed(1) || '?'}% | Trades: ${ranked[0].trades || '?'}`);
    if (ranked[0].config.overrides && Object.keys(ranked[0].config.overrides).length > 0) {
      console.log(`   Config: ${JSON.stringify(ranked[0].config.overrides)}`);
    }
  }

  return report;
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

async function main() {
  prepareResultsDir();
  cleanupParallelStateFiles();

  const args = process.argv.slice(2);
  let sweepName = 'real';  // Default to canonical typed overrides only
  let dataFile = DEFAULT_DATA;
  let stockMode = false;
  let cliSoloStrategy = null;
  let profileName = DEFAULT_TUNING_PROFILE;
  let feeProfileName = null;
  let configNameMatch = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sweep' && args[i+1]) sweepName = args[++i];
    else if (args[i] === '--data' && args[i+1]) {
      const val = args[++i].toLowerCase();
      dataFile = DATA_SHORTCUTS[val] || args[i];
      if (isStockDataShortcut(val)) stockMode = true;
    }
    else if (args[i].startsWith('--data=')) {
      const val = args[i].split('=')[1].toLowerCase();
      dataFile = DATA_SHORTCUTS[val] || args[i].split('=')[1];
      if (isStockDataShortcut(val)) stockMode = true;
    }
    else if (args[i] === '--profile' && args[i+1]) {
      profileName = args[++i];
    }
    else if (args[i].startsWith('--profile=')) {
      profileName = args[i].split('=')[1];
    }
    else if (args[i] === '--fee-profile' && args[i+1]) {
      feeProfileName = args[++i];
    }
    else if (args[i].startsWith('--fee-profile=')) {
      feeProfileName = args[i].split('=')[1];
    }
    else if ((args[i] === '--match' || args[i] === '--config-match') && args[i+1]) {
      configNameMatch = args[++i];
    }
    else if (args[i].startsWith('--match=')) {
      configNameMatch = args[i].split('=')[1];
    }
    else if (args[i].startsWith('--config-match=')) {
      configNameMatch = args[i].split('=')[1];
    }
    else if (args[i] === '--real') sweepName = 'real';
    else if (args[i] === '--quick') sweepName = 'quick';  // alias to real
    else if (args[i] === '--full') sweepName = 'full';
    else if (args[i] === '--sizing') sweepName = 'sizing';
    else if (args[i] === '--tiers') sweepName = 'tiers';
    else if (args[i] === '--atr') sweepName = 'atr';
    else if (args[i] === '--rsi') sweepName = 'rsi';
    else if (args[i] === '--strategy-sweep') sweepName = 'strategy-sweep';
    else if (args[i] === '--exit-geometry') sweepName = 'exit-geometry';
    else if (args[i] === '--gauntlet-atr') sweepName = 'gauntlet-atr';
    else if (args[i] === '--strategy' && args[i+1]) {
      // Single strategy isolation mode - sets typed soloFilter in every descriptor.
      cliSoloStrategy = args[++i];
      console.log(`[SOLO MODE] Only testing strategy: ${cliSoloStrategy}`);
    }
    else if (args[i].startsWith('--solo=')) {
      // Shorthand: --solo=RSI is same as --strategy RSI
      cliSoloStrategy = args[i].split('=')[1];
      console.log(`[SOLO MODE] Only testing strategy: ${cliSoloStrategy}`);
    }
    else if (args[i] === '--stocks') stockMode = true;
    // Bare shortcut: tsla, spy, qqq, btc, etc.
    else if (DATA_SHORTCUTS[args[i].toLowerCase()]) {
      const key = args[i].toLowerCase();
      dataFile = DATA_SHORTCUTS[key];
      // Auto-enable stock mode for stock tickers
      if (isStockDataShortcut(key)) stockMode = true;
    }
    else if (args[i] === '--help') {
      console.log(`
OGZPrime Parallel Backtester v2 (AUDITED 2026-04-07)
Usage: node tools/parallel-backtest.js [options]

REAL Sweeps (canonical typed overrides only):
  --real         9 configs - ATR, sizing, tiers (default)
  --quick        Alias to --real
  --full         All HONORED sweeps combined

Focused Optimization (one variable at a time):
  --atr          ATR volatility filter (8 configs: off, 0.10-0.40)
  --sizing       Position size sweep (6 configs: 2%-10%)
  --tiers        Profit tier sweep (5 configs)
  --rsi          RSI oversold/overbought grid (15 configs)
  --exit-geometry Strategy-owned stop/target/trail sweep (${SWEEP_PRESETS['exit-geometry'].length} configs)

Strategy Isolation:
  --strategy-sweep  Test each strategy individually (11 configs)
  --solo=NAME       Run sweep with ONLY this strategy enabled
  --match=TEXT      Run only config names matching TEXT/regex

Gauntlet:
  --gauntlet-atr    ${STRATEGIES.length} strategies x ${PARALLEL_BACKTEST_CONFIG.gauntlet.atrValues.length} ATR levels (${SWEEP_PRESETS['gauntlet-atr'].length} configs)

Options:
  --data FILE    Candle data file (default: ${DEFAULT_DATA})
                 Shortcuts: ${Object.keys(DATA_SHORTCUTS).join(', ')}
  --solo=NAME    Test single strategy (RSI, MADynamicSR, EMASMACrossover, SmartMoneySweep, etc)
  --profile=NAME Tuning profile (${listTuningProfileNames().join(', ')})
  --fee-profile=NAME Required venue fee profile (${listFeeProfileNames().join(', ')})
  --stocks       Force stock instrument validation
  --help         Show this help

NOTE: Generic STOP_LOSS_PERCENT, TAKE_PROFIT_PERCENT, TRAILING_STOP_* are not sweep knobs.
      Use --exit-geometry for strategy-owned keys that live strategies read.

Examples:
  node tools/parallel-backtest.js --real --stocks --data=tsla --profile=current-eval --fee-profile=ttp_real
  node tools/parallel-backtest.js --atr --solo=RSI --stocks --profile=legacy-wide --fee-profile=ttp_real

Walk-Forward Validation:
  Supply each explicit train/test data file with --data. No synthetic split or
  retired train/test shortcut is selected by this tool.

Notes:
  - Results saved to backtest-results/
  - Run sweeps one at a time, lock in winners, stack them
`);
      process.exit(0);
    }
  }

  const resolvedInstrument = resolveInstrumentFromDataFile(dataFile);
  if (stockMode && resolvedInstrument.assetClass !== 'stocks') {
    throw new Error(`--stocks conflicts with ${dataFile}, which resolves to ${resolvedInstrument.assetClass}`);
  }
  stockMode = resolvedInstrument.assetClass === 'stocks';

  if (!feeProfileName) {
    console.error(`Missing required --fee-profile. Available: ${listFeeProfileNames().join(', ')}`);
    process.exit(1);
  }

  let configs;
  if (typeof SWEEP_PRESETS[sweepName] === 'function') configs = SWEEP_PRESETS[sweepName]();
  else configs = SWEEP_PRESETS[sweepName];

  if (!configs) {
    console.error(`Unknown sweep: ${sweepName}`);
    console.error(`Available: ${Object.keys(SWEEP_PRESETS).join(', ')}`);
    process.exit(1);
  }

  configs = applySoloStrategyToConfigs(configs, cliSoloStrategy);
  configs = filterConfigsByName(configs, configNameMatch);

  if (configs.length === 0) {
    console.error(`No configs matched${configNameMatch ? `: ${configNameMatch}` : ''}`);
    process.exit(1);
  }

  await runParallelSweep(configs, dataFile, stockMode, profileName, feeProfileName);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_DATA,
  DATA_SHORTCUTS,
  STOCK_DATA_SHORTCUTS,
  STRATEGIES,
  SWEEP_PRESETS,
  parseSoloStrategies,
  applySoloStrategyToConfigs,
  filterConfigsByName,
  parseBacktestOutput,
  describeFeePosture,
  tryReadReport,
  isCleanParsedResult,
  getWorkerFailureReason,
  writeWorkerOutputLog,
  buildWorkerProcessErrorResult,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
};
