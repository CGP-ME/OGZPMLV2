#!/usr/bin/env node
/**
 * OGZPrime PARALLEL BACKTESTER — REAL PIPELINE EDITION v2
 * ========================================================
 * 
 * Runs the ACTUAL trading pipeline via child processes with env var overrides.
 * Each worker = fresh node run-empire-v2.js with different config.
 * 
 * Fixes from v1:
 * - Timeout raised to 20 min
 * - BACKTEST_SILENT passes through summary lines for parsing
 * - EMFILE fix: skip pattern saving + CSV export in parallel mode
 * - Reads results from JSON report file as fallback
 * 
 * Usage:
 *   node tools/parallel-backtest.js --real     (HONORED env vars only - default)
 *   node tools/parallel-backtest.js --full     (all HONORED sweeps)
 *   node tools/parallel-backtest.js --atr      (ATR filter sweep)
 * 
 * @author Claude (Opus) for Trey / OGZPrime
 * @date 2026-03-16
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const TradingConfig = require('../core/TradingConfig');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const {
  buildWorkerBaseEnv,
  buildBacktestWorkerEnv,
  resolveFeeEnv,
  summarizeWorkerEnv,
} = require('./backtest-worker-env');
const {
  DEFAULT_TUNING_PROFILE,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
} = require('./tuning-profiles');

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
const PARALLEL_BACKTEST_CONFIG = TradingConfig.getParallelBacktestConfig();
const DEFAULT_DATA = PARALLEL_BACKTEST_CONFIG.defaultData;
const DATA_SHORTCUTS = Object.freeze({ ...PARALLEL_BACKTEST_CONFIG.dataShortcuts });
const STOCK_DATA_SHORTCUTS = Object.freeze([...PARALLEL_BACKTEST_CONFIG.stockDataShortcutKeys]);
const RESULTS_DIR = path.join(PROJECT_ROOT, 'backtest-results');
const WORKER_LOG_DIR = path.join(RESULTS_DIR, 'worker-logs');
const TIMEOUT_MS = 0; // No timeout - let it finish

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

function buildDormantStrategyEnableEnv(soloStrategy) {
  const soloStrategies = new Set(parseSoloStrategies(soloStrategy));
  if (soloStrategies.size === 0) return {};

  const env = {};
  if (soloStrategies.has('nowickimbalance')) env.ENABLE_NOWICK = 'true';
  if (soloStrategies.has('openingrangebreakout')) env.ENABLE_ORB = 'true';
  if (soloStrategies.has('breakretest')) env.ENABLE_BREAKRETEST = 'true';
  if (soloStrategies.has('donchianbreakout')) env.ENABLE_DONCHIAN = 'true';
  if (soloStrategies.has('smartmoneysweep')) {
    env.ENABLE_SMS = 'true';
    env.SMS_VP_RTH_ONLY = 'true';
  }
  return env;
}

function assertDormantStrategyEnvCompatible(soloStrategy, configEnv = {}) {
  const requiredEnv = buildDormantStrategyEnableEnv(soloStrategy);
  for (const [key, requiredValue] of Object.entries(requiredEnv)) {
    if (!Object.prototype.hasOwnProperty.call(configEnv, key)) continue;
    if (String(configEnv[key]).toLowerCase() === requiredValue) continue;
    throw new Error(
      `Invalid parallel-backtest config: ${key}=${configEnv[key]} conflicts with SOLO_STRATEGY=${soloStrategy}`
    );
  }
}

function applySoloStrategyToConfigs(configs, soloStrategy) {
  if (!soloStrategy) return configs;
  return configs.map(config => {
    if (config.env?.SOLO_STRATEGY) return config;
    return {
      ...config,
      env: {
        ...(config.env || {}),
        SOLO_STRATEGY: soloStrategy,
      },
    };
  });
}

function generateGauntlet(paramType, values) {
  const configs = [];
  for (const strat of STRATEGIES) {
    for (const val of values) {
      let env = { SOLO_STRATEGY: strat };
      let name = `${strat.substring(0,4)}-`;

      if (paramType === 'confidence') {
        env.MIN_TRADE_CONFIDENCE = String(val);
        name += `c${(val*100).toFixed(0)}`;
      } else if (paramType === 'atr') {
        if (val === 0) {
          env.ATR_FILTER_ENABLED = 'false';
          name += 'atr-off';
        } else {
          env.ATR_FILTER_ENABLED = 'true';
          env.ATR_MIN_PERCENT = String(val);
          name += `atr${(val*100).toFixed(0)}`;
        }
      }

      configs.push({ name, env });
    }
  }
  return configs;
}

// ═══════════════════════════════════════════════════════════════
// PARAMETER SWEEP DEFINITIONS
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ENV VAR AUDIT (2026-04-07)
// ═══════════════════════════════════════════════════════════════
// HONORED: ATR_FILTER_ENABLED, ATR_MIN_PERCENT, RISK_MANAGER_BYPASS,
//          ACCOUNT_DRAWDOWN_BYPASS, MAX_POSITION_SIZE_PCT, TIER1/2/3_TARGET
// REJECTED: STOP_LOSS_PERCENT, TAKE_PROFIT_PERCENT, TRAILING_STOP_PERCENT
//           (locked exitContracts own strategy risk; worker env rejects fake tuning)
// GHOST:   TRAILING_STOP_ENABLED, REGIME_FILTER_ENABLED, REGIME_ALLOW_*
//          (never read by trading code)
// PARTIAL: MIN_TRADE_CONFIDENCE (entry gate works, but strategies have own minConfidence)
// ═══════════════════════════════════════════════════════════════

const SWEEP_PRESET_DEFINITIONS = PARALLEL_BACKTEST_CONFIG.sweepPresets;

function cloneSweepConfig(config) {
  return {
    name: config.name,
    env: { ...(config.env || {}) },
  };
}

function cloneSweepConfigs(configs) {
  return (configs || []).map(cloneSweepConfig);
}

function freezeSweepConfigs(configs) {
  return Object.freeze(cloneSweepConfigs(configs).map(config => Object.freeze({
    ...config,
    env: Object.freeze({ ...config.env }),
  })));
}

const SWEEP_PRESETS = Object.freeze({
  // ═══════════════════════════════════════════════════════════════
  // REAL — Only HONORED env vars that actually affect trading
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

  risk: freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.risk),

  // ═══════════════════════════════════════════════════════════════
  // STRATEGY ISOLATION — Test each strategy individually
  // ═══════════════════════════════════════════════════════════════
  'strategy-sweep': freezeSweepConfigs(SWEEP_PRESET_DEFINITIONS.strategySweep),

  // RSI thresholds sweep - oversold x overbought grid
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
      ...SWEEP_PRESET_DEFINITIONS.risk,
    ]);
  },
});

function generateRSISweep(options = PARALLEL_BACKTEST_CONFIG.rsiSweep) {
  const configs = [];
  const { oversoldLevels, overboughtLevels, minSpread } = options;
  for (const os of oversoldLevels) {
    for (const ob of overboughtLevels) {
      // Only valid combinations where oversold < overbought with reasonable spread
      if (ob - os < minSpread) continue;
      configs.push({
        name: `rsi-${os}-${ob}`,
        env: { RSI_OVERSOLD: String(os), RSI_OVERBOUGHT: String(ob) }
      });
    }
  }
  return configs;
}

// ═══════════════════════════════════════════════════════════════
// WORKER — Runs a single backtest as a child process
// ═══════════════════════════════════════════════════════════════

function runSingleBacktest(config, dataFile, stockMode = false, profileName = DEFAULT_TUNING_PROFILE) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const uniqueId = `${config.name}-${Date.now()}-${Math.random().toString(36).substr(2,4)}`;
    const stateFile = path.join(PROJECT_ROOT, 'data', `state-parallel-${uniqueId}.json`);
    const reportTag = `parallel-${uniqueId}`;
    
    const instrumentEnv = resolveInstrumentFromDataFile(dataFile);
    const selectedSoloStrategy = config.env?.SOLO_STRATEGY;
    assertDormantStrategyEnvCompatible(selectedSoloStrategy, config.env || {});
    const dormantStrategyEnv = buildDormantStrategyEnableEnv(selectedSoloStrategy);

    const env = buildBacktestWorkerEnv({
      sourceEnv: process.env,
      projectRoot: PROJECT_ROOT,
      dataFile,
      stateFile,
      dataDir: path.join(PROJECT_ROOT, 'data', 'backtest'),
      reportTag,
      stockMode,
      profileName,
      strategyDiag: process.env.STRATEGY_DIAG || 'false',
      configEnv: { ...dormantStrategyEnv, ...(config.env || {}) },
      instrumentEnv,
    });

    let output = '';

    const child = spawn('node', [RUNNER], {
      cwd: PROJECT_ROOT,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Timeout handler (disabled when TIMEOUT_MS = 0)
    let timer = null;
    if (TIMEOUT_MS > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, TIMEOUT_MS);
    }

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // If exit code 1 and quick failure, show the error
      if (code === 1 && parseFloat(elapsed) < 3) {
        // Extract error message from output
        const errorMatch = output.match(/Error:|CRITICAL|Cannot find module|❌/i);
        if (errorMatch || output.length < 500) {
          console.error(`\n  [${config.name}] CRASH OUTPUT:\n${output.slice(0, 1000)}\n`);
        }
      }

      // Try parsing from console output first
      let result = parseBacktestOutput(output, config.name);

      // If console parsing failed, try reading the report JSON
      if (result.trades == null) {
        const reportResult = tryReadReport(PROJECT_ROOT, reportTag);
        if (reportResult) {
          result = { ...result, ...reportResult };
        }
      }

      // Also try reading the most recent report file
      if (result.trades == null) {
        const latestResult = tryReadLatestReport(PROJECT_ROOT);
        if (latestResult) {
          result = { ...result, ...latestResult };
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

      // Clean up state file
      try { fs.unlinkSync(stateFile); } catch(e) {}

      resolve(result);
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve(buildWorkerProcessErrorResult(
        config,
        env,
        reportTag,
        output,
        err,
        ((Date.now() - startTime) / 1000).toFixed(1)
      ));
    });
  });
}

function tryReadReport(projectRoot, tag) {
  try {
    // FIX 2026-04-22: sibling of matrix-sweep's reporter fix.
    // Scan backtest-results/worker-reports/ first (tagged reports land there per
    // BacktestRunner.js 3-way path branch), fallback to project root for legacy.
    const workerDir = path.join(projectRoot, 'backtest-results', 'worker-reports');
    const scanDir = fs.existsSync(workerDir) ? workerDir : projectRoot;

    const reports = fs.readdirSync(scanDir)
      .filter(f => {
        if (!f.startsWith('backtest-report-') || !f.endsWith('.json')) return false;
        // If tag provided, match only this worker's report (prevents cross-worker race)
        if (tag) return f.indexOf(tag) !== -1;
        return true;
      })
      .map(f => ({ name: f, mtime: fs.statSync(path.join(scanDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (reports.length === 0) return null;

    const reportPath = path.join(scanDir, reports[0].name);
    const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    // FIX 2026-04-22: removed unlinkSync — reports retained for postmortem.

    const trades = data.trades || [];
    const summary = data.summary || {};

    if (trades.length === 0 && !summary.finalBalance) return null;

    const winners = trades.filter(t => (t.netPnlDollars || t.pnl || 0) > 0);
    const totalFees = trades.reduce((s, t) => s + (t.feesDollars || 0), 0);
    const netPnl = summary.finalBalance ? summary.finalBalance - 10000 :
                   trades.reduce((s, t) => s + (t.netPnlDollars || 0), 0);

    // FIX 2026-04-22: expanded return shape — BacktestRunner now spreads the full
    // BacktestRecorder.getSummary() into report.summary, so these extra fields are
    // available and downstream leaderboard can render Trades/WR/DD/PF columns.
    return {
      finalBalance: summary.finalBalance || null,
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

function tryReadLatestReport(projectRoot) {
  return tryReadReport(projectRoot, null);
}

function parseBacktestOutput(output, name) {
  const result = { name };

  // Parse BacktestRecorder summary block
  const balanceMatch = output.match(/Final Balance:\s*\$?([\d,.]+)/);
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

  // If we got balance but no PnL, calculate it
  if (result.finalBalance && result.netPnl == null) {
    result.netPnl = result.finalBalance - 10000;
  }

  return result;
}

function describeFeePosture(configs, stockMode, sourceEnv = process.env) {
  if (!stockMode) return null;

  const sweepConfigs = configs && configs.length > 0 ? configs : [{ env: {} }];
  const resolvedFeeEnvs = sweepConfigs
    .map(config => resolveFeeEnv(sourceEnv, (config && config.env) || {}))
    .map(env => (Object.keys(env).length > 0 ? env : { __stockZeroDefault: true }));

  const uniqueFeePostures = new Set(resolvedFeeEnvs.map(env => JSON.stringify(env)));
  if (uniqueFeePostures.size > 1) {
    return 'config-specific fee overrides';
  }

  const feeEnv = resolvedFeeEnvs[0];
  if (feeEnv.__stockZeroDefault === true) {
    return '$0 stock default';
  }

  if (feeEnv.FEE_MODEL === 'per_share_minimum') {
    return `per-share minimum model (perShare=${feeEnv.FEE_PER_SHARE || 'unset'}, minOrder=${feeEnv.FEE_MIN_ORDER || 'unset'})`;
  }
  if (feeEnv.FEE_MODEL) {
    return `${feeEnv.FEE_MODEL} model`;
  }
  if (Object.keys(feeEnv).length > 0) {
    return 'config-specific fee overrides';
  }
  return '$0 stock default';
}

// ═══════════════════════════════════════════════════════════════
// PARALLEL RUNNER
// ═══════════════════════════════════════════════════════════════

async function runParallelSweep(configs, dataFile, stockMode = false, profileName = DEFAULT_TUNING_PROFILE) {
  const tuningProfile = resolveTuningProfile(profileName);
  const feePosture = describeFeePosture(configs, stockMode);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  OGZPrime PARALLEL BACKTESTER v2${stockMode ? ' [STOCK MODE]' : ''}`);
  console.log(`  ${cpuModel} | ${threadCount} threads | ${MAX_WORKERS} workers`);
  console.log(`  ${configs.length} configurations to test`);
  console.log(`  Data: ${dataFile}`);
  console.log(`  Profile: ${tuningProfile.name}`);
  console.log(`  Timeout: None (runs until complete)`);
  if (feePosture) console.log(`  Fees: ${feePosture}`);
  console.log(`${'═'.repeat(70)}\n`);

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < configs.length; i += MAX_WORKERS) {
    const batch = configs.slice(i, i + MAX_WORKERS);
    const batchNum = Math.floor(i / MAX_WORKERS) + 1;
    const totalBatches = Math.ceil(configs.length / MAX_WORKERS);

    console.log(`\n── Batch ${batchNum}/${totalBatches} (${batch.length} workers) ──`);
    batch.forEach(c => console.log(`  → ${c.name}`));
    console.log(`  ⏳ Running... (no timeout, will finish when done)`);

    const batchResults = await Promise.all(
      batch.map(config => runSingleBacktest(config, dataFile, stockMode, tuningProfile.name))
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

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  LEADERBOARD (${ranked.length}/${results.length} parsed, ${totalTime}s total)`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`  ${'#'.padEnd(4)} ${'Config'.padEnd(28)} ${'P&L'.padEnd(14)} ${'Trades'.padEnd(8)} ${'WR%'.padEnd(8)} ${'DD%'.padEnd(8)} ${'PF'.padEnd(6)}`);
  console.log(`  ${'-'.repeat(66)}`);

  ranked.forEach((r, i) => {
    const icon = i === 0 ? '👑' : (r.netPnl > 0 ? '🟢' : '🔴');
    const pnl = `$${r.netPnl.toFixed(2)}`;
    const trades = r.trades || '-';
    const wr = r.winRate != null ? `${r.winRate.toFixed(1)}%` : '-';
    const dd = r.maxDrawdown != null ? `${r.maxDrawdown.toFixed(1)}%` : '-';
    const pf = r.profitFactor != null ? r.profitFactor.toFixed(2) : '-';
    console.log(`  ${icon}${String(i+1).padEnd(3)} ${r.name.padEnd(28)} ${pnl.padEnd(14)} ${String(trades).padEnd(8)} ${wr.padEnd(8)} ${dd.padEnd(8)} ${pf.padEnd(6)}`);
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
    totalConfigs: configs.length,
    parsedConfigs: ranked.length,
    erroredConfigs: failed.length,
    totalTime: `${totalTime}s`,
    results: ranked,
    failed: failed.map(summarizeFailedResult),
    winner: ranked[0] || null,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📁 Full results saved: ${reportPath}`);

  if (ranked[0]) {
    console.log(`\n👑 WINNER: ${ranked[0].name}`);
    console.log(`   P&L: $${ranked[0].netPnl.toFixed(2)} | WR: ${ranked[0].winRate?.toFixed(1) || '?'}% | Trades: ${ranked[0].trades || '?'}`);
    if (ranked[0].config.env && Object.keys(ranked[0].config.env).length > 0) {
      console.log(`   Config: ${JSON.stringify(ranked[0].config.env)}`);
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
  let sweepName = 'real';  // Default to HONORED env vars only
  let dataFile = DEFAULT_DATA;
  let stockMode = false;
  let cliSoloStrategy = null;
  let profileName = DEFAULT_TUNING_PROFILE;

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
    else if (args[i] === '--real') sweepName = 'real';
    else if (args[i] === '--quick') sweepName = 'quick';  // alias to real
    else if (args[i] === '--full') sweepName = 'full';
    else if (args[i] === '--sizing') sweepName = 'sizing';
    else if (args[i] === '--tiers') sweepName = 'tiers';
    else if (args[i] === '--atr') sweepName = 'atr';
    else if (args[i] === '--risk') sweepName = 'risk';
    else if (args[i] === '--rsi') sweepName = 'rsi';
    else if (args[i] === '--strategy-sweep') sweepName = 'strategy-sweep';
    else if (args[i] === '--gauntlet-atr') sweepName = 'gauntlet-atr';
    else if (args[i] === '--strategy' && args[i+1]) {
      // Single strategy isolation mode - adds SOLO_STRATEGY to all configs
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

REAL Sweeps (HONORED env vars only):
  --real         11 configs - ATR, sizing, tiers, risk (default)
  --quick        Alias to --real
  --full         All HONORED sweeps combined (~30 configs)

Focused Optimization (one variable at a time):
  --atr          ATR volatility filter (8 configs: off, 0.10-0.40)
  --sizing       Position size sweep (6 configs: 2%-10%)
  --tiers        Profit tier sweep (5 configs)
  --risk         Risk manager + drawdown bypass (4 configs)
  --rsi          RSI oversold/overbought grid (15 configs)

Strategy Isolation:
  --strategy-sweep  Test each strategy individually (11 configs)
  --solo=NAME       Run sweep with ONLY this strategy enabled

Gauntlet:
  --gauntlet-atr    11 strategies x 8 ATR levels (88 configs)

Options:
  --data FILE    Candle data file (default: ${DEFAULT_DATA})
                 Shortcuts: tsla, spy, qqq, btc, btc-5sec
  --solo=NAME    Test single strategy (RSI, MADynamicSR, EMASMACrossover, SmartMoneySweep, etc)
  --profile=NAME Tuning profile (${listTuningProfileNames().join(', ')})
  --stocks       Zero commission mode (for stocks)
  --help         Show this help

NOTE: STOP_LOSS_PERCENT, TAKE_PROFIT_PERCENT, TRAILING_STOP_* are not sweep knobs.
      Locked exitContracts own strategy risk, and worker env rejects fake tuning.

Examples:
  node tools/parallel-backtest.js --real --stocks --data=tsla --profile=current-eval
  node tools/parallel-backtest.js --atr --solo=RSI --stocks --profile=legacy-wide

Walk-Forward Validation:
  After finding winners, test on unseen data:
  1. Train on first 6 months, find optimal params
  2. Validate on next 6 months, confirm they hold
  3. Test on final year, prove edge is real

Notes:
  - Results saved to backtest-results/
  - Run sweeps one at a time, lock in winners, stack them
`);
      process.exit(0);
    }
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

  await runParallelSweep(configs, dataFile, stockMode, profileName);
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
  buildDormantStrategyEnableEnv,
  assertDormantStrategyEnvCompatible,
  buildWorkerBaseEnv,
  applySoloStrategyToConfigs,
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
