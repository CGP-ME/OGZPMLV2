#!/usr/bin/env node
/**
 * OGZPrime MATRIX SWEEP BACKTESTER
 * =================================
 *
 * THE FULL OPTIMIZATION MATRIX.
 *
 * Tests every strategy individually x every honored tier config x every confidence level.
 * Each combination runs in isolation (SOLO_STRATEGY) through the real trading pipeline.
 *
 * What this produces:
 *   A complete Strategy x Tier Targets x Confidence config matrix telling you
 *   the best honored tunables for each strategy, backed by data not guesses.
 *
 * Dimensions (full grid):
 *   Strategies:  RSI, EMASMACrossover, MADynamicSR, LiquiditySweep (4 validated)
 *   Tier targets: MPM profit tier target presets or strict-monotonic tier cube
 *   Confidence:  [0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75] (8 values)
 *
 *   Structural-exit strategies are skipped for phases where module overrideLevels
 *   would make tier geometry false data.
 *
 * Metrics captured per run (FIX 2026-04-21):
 *   finalBalance, trades, winRate, netPnl, fees,
 *   maxDrawdown, profitFactor, expectancy, avgWin, avgLoss
 *   (previously only 5 of 10 — stdout regex + JSON read now both emit full set)
 *
 * Usage:
 *   node tools/matrix-sweep.js --data tsla --fee-profile=ttp_real              # Full matrix, all strategies
 *   node tools/matrix-sweep.js --data tsla --solo=RSI --fee-profile=ttp_real   # RSI only
 *   node tools/matrix-sweep.js --data tsla --phase exits --fee-profile=ttp_real # Tier-target sweep, locked conf
 *   node tools/matrix-sweep.js --data tsla --phase conf --fee-profile=ttp_real  # Just confidence, locked exits
 *   # ATR dimension tuning: use `node tools/parallel-backtest.js --atr --data <ticker> --fee-profile=ttp_real`
 *   node tools/matrix-sweep.js --data tsla --quick --fee-profile=ttp_real       # Reduced grid (fast sanity check)
 *
 * Output:
 *   backtest-results/matrix-{timestamp}.json    Full results
 *   backtest-results/matrix-{timestamp}.csv     Spreadsheet-friendly
 *   Console: Per-strategy leaderboard + best config per strategy
 *
 * WORKFLOW (from handoff doc):
 *   1. Isolate one strategy
 *   2. Tune entries: confidence sweep (--phase conf)
 *   3. Tune honored exit targets: tier-target sweep (--phase exits)
 *   4. Retest combined: stacked winners dont always stay winners
 *   5. Validate on unseen data: train/validate/test split
 *
 * @author Claude Opus (Architect) for Trey / OGZPrime
 * @date 2026-03-20
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ConfigLoader = require('../foundation/ConfigLoader');

// ===================================================================
// HARDWARE DETECTION
// ===================================================================
const cpuModel = os.cpus()[0]?.model || 'Unknown';
const threadCount = os.cpus().length;
const is7800X3D = cpuModel.includes('7800X3D');
const MAX_WORKERS = Math.max(1, is7800X3D ? 14 : threadCount - 2);

// ===================================================================
// PATHS
// ===================================================================
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(PROJECT_ROOT, 'run-empire-v2.js');
// FIX 2026-04-16: Route matrix output to unified output directory
const { getMatrixDir } = require('../core/OutputPaths');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const {
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
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
const RESULTS_DIR = getMatrixDir();
const WORKER_LOG_DIR = path.join(PROJECT_ROOT, 'backtest-results', 'worker-logs');
const MATRIX_SWEEP_CONFIG = ConfigLoader.getMatrixSweepConfig();
const DEFAULT_DATA = MATRIX_SWEEP_CONFIG.defaultData;

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
    var trimmed = value.trim();
    if (!trimmed) return 0;
    var count = Number(trimmed);
    if (Number.isFinite(count)) return count > 0 ? Math.trunc(count) : 0;
    return 1;
  }
  if (value) return 1;
  return 0;
}

function hasWorkerError(result) {
  return normalizeWorkerErrors(result && result.workerErrors) > 0
    || (result && result.error)
    || (result && result.exitCode !== undefined && result.exitCode !== 0);
}

function isCleanParsedResult(result) {
  return result && result.netPnl != null && !hasWorkerError(result);
}

function getWorkerFailureReason(result) {
  var workerErrors = normalizeWorkerErrors(result && result.workerErrors);
  if (workerErrors > 0) {
    return 'Worker reported ' + workerErrors + ' candle processing error(s)';
  }
  if (result && result.exitCode !== undefined && result.exitCode !== 0) {
    return 'Worker exited with code ' + result.exitCode;
  }
  if (result && result.error) return result.error;
  return null;
}

function writeWorkerOutputLog(reportTag, output, workerLogDir) {
  var targetDir = workerLogDir || WORKER_LOG_DIR;
  fs.mkdirSync(targetDir, { recursive: true });
  var contents = output == null ? '' : String(output);
  var safeTag = String(reportTag || ('worker-' + Date.now())).replace(/[^a-zA-Z0-9_.-]/g, '_');
  for (var attempt = 0; attempt < 1000; attempt += 1) {
    var suffix = attempt === 0 ? '' : '-' + attempt;
    var logPath = path.join(targetDir, safeTag + suffix + '.log');
    try {
      fs.writeFileSync(logPath, contents, { flag: 'wx' });
      return logPath;
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error('Unable to allocate worker log path for ' + safeTag);
}

function summarizeFailedResult(result) {
  var error = result.error || getWorkerFailureReason(result);
  return {
    name: result.name,
    strategy: result.strategy,
    elapsed: result.elapsed,
    exitCode: result.exitCode,
    workerErrors: normalizeWorkerErrors(result.workerErrors),
    error: error || null,
    netPnl: result.netPnl != null ? result.netPnl : null,
    trades: result.trades != null ? result.trades : null,
    winRate: result.winRate != null ? result.winRate : null,
    reportPath: result.reportPath || null,
    workerLogPath: result.workerLogPath || null,
  };
}

function buildWorkerProcessErrorResult(config, env, reportTag, output, err, elapsed, workerLogDir) {
  var workerLogPath = writeWorkerOutputLog(reportTag, output, workerLogDir);
  return {
    name: config.name,
    strategy: config.strategy,
    timeframe: config.timeframe || null,
    lockedSL: config.lockedSL,
    tiers: config.tiers,
    conf: config.conf,
    workerEnv: summarizeWorkerEnv(env),
    error: err.message,
    elapsed: elapsed,
    workerLogPath: workerLogPath,
  };
}

// ===================================================================
// DATA FILE SHORTCUTS
// ===================================================================
const DATA_SHORTCUTS = Object.freeze({ ...MATRIX_SWEEP_CONFIG.dataShortcuts });
const STOCK_TICKERS = Object.freeze([...MATRIX_SWEEP_CONFIG.stockTickers]);

function isStockTickerShortcut(key) {
  return STOCK_TICKERS.includes(key);
}

// Extract human-readable label from data file path
// 'tuning/tsla-15m-2y.json'    → 'tsla-2y'
// 'tuning/tsla-15m-train.json' → 'tsla-train'
// 'data/polygon-btc-1y.json'   → 'btc-1y'
function getDataLabel(dataFile) {
  var base = path.basename(dataFile, '.json');
  base = base.replace(/^polygon-/, '');
  base = base.replace(/^alpaca-/, '');
  base = base.replace(/-15m-/, '-');
  base = base.replace(/-1m-/, '-');
  base = base.replace(/-5m-/, '-');
  base = base.replace(/-1h-/, '-');
  return base;
}

// Build the full strict-monotonic tier cube (tier1 < tier2 < tier3) from a
// single grid of decimal percentages. N values produce C(N,3) tier combinations.
// e.g. 10 values → 120 combos. Each combo is a {t1, t2, t3, label} object that
// matches the existing tierPreset contract in generateMatrix.
function buildMonotonicTierCube(grid) {
  var combos = [];
  for (var i = 0; i < grid.length - 2; i++) {
    for (var j = i + 1; j < grid.length - 1; j++) {
      for (var k = j + 1; k < grid.length; k++) {
        combos.push({
          t1: grid[i],
          t2: grid[j],
          t3: grid[k],
          label: 't' + (grid[i] * 100).toFixed(2) + '_' + (grid[j] * 100).toFixed(2) + '_' + (grid[k] * 100).toFixed(2),
        });
      }
    }
  }
  return combos;
}

function freezeTierPreset(tier) {
  if (tier == null) return null;
  return Object.freeze({ ...tier });
}

function freezeTierPresetList(tiers) {
  if (tiers == null) return null;
  return Object.freeze(tiers.map(freezeTierPreset));
}

function buildGridPhaseFromConfig(phaseConfig) {
  const tierPresets = Object.prototype.hasOwnProperty.call(phaseConfig, 'tierGrid')
    ? buildMonotonicTierCube(phaseConfig.tierGrid)
    : phaseConfig.tierPresets;

  return Object.freeze({
    stopLoss: phaseConfig.stopLoss == null ? null : Object.freeze([...phaseConfig.stopLoss]),
    tierPresets: freezeTierPresetList(tierPresets),
    confidence: Object.freeze([...phaseConfig.confidence]),
  });
}

function buildGridFromConfig(config) {
  const grid = {};
  for (const [phase, phaseConfig] of Object.entries(config.grid)) {
    grid[phase] = buildGridPhaseFromConfig(phaseConfig);
  }
  return Object.freeze(grid);
}

// ===================================================================
// MATRIX DIMENSIONS - The search space
// ===================================================================

const VALIDATED_STRATEGIES = Object.freeze([...MATRIX_SWEEP_CONFIG.validatedStrategies]);
const ALL_STRATEGIES = Object.freeze([
  ...VALIDATED_STRATEGIES,
  ...MATRIX_SWEEP_CONFIG.exploratoryStrategies,
]);
const GRID = buildGridFromConfig(MATRIX_SWEEP_CONFIG);

// Locked exits per strategy — pulled from canonical source ConfigLoader.exitContracts
// (DEC-013: contracts are sealed with _validated markers). Previously this was a hardcoded
// dict that had drifted from ConfigLoader — 4 strategies (MultiTimeframe, OGZTPO,
// OpeningRangeBreakout, SmartMoneySweep) had values that didn't match the real contract,
// so sweeps were using the wrong locked-SL baseline. Reading from BASE_CONFIG keeps the
// two in sync automatically.
//
// ConfigLoader stores stopLossPercent as negative (e.g. -0.5 = "stop 0.5% below entry for long").
// Matrix-sweep changes strategy-owned stop geometry through a backtest-only config
// override payload, not global STOP_LOSS_PERCENT.
const { BASE_CONFIG } = ConfigLoader;
function getLockedSL(strat) {
  const contract = BASE_CONFIG.exitContracts[strat] || BASE_CONFIG.exitContracts.default;
  return Math.abs(contract.stopLossPercent);
}

function buildBacktestOverrideEnv(strategyName, stopLoss, confidence, timeframe) {
  const numericConfidence = Number(confidence);
  if (!Number.isFinite(numericConfidence) || numericConfidence < 0 || numericConfidence > 1) {
    throw new Error('Matrix confidence must be a finite 0-1 value, got ' + confidence);
  }

  const overrides = {
    'confidence.minTradeConfidence': numericConfidence,
  };

  if (timeframe != null) {
    const normalizedTimeframe = String(timeframe).trim();
    if (!normalizedTimeframe) {
      throw new Error('Matrix timeframe must be a non-empty string');
    }
    overrides['broker.candleTimeframe'] = normalizedTimeframe;
  }

  if (stopLoss == null) {
    return {
      BACKTEST_CONFIG_OVERRIDES_JSON: JSON.stringify(overrides),
    };
  }

  const numericStop = Number(stopLoss);
  if (!Number.isFinite(numericStop) || numericStop <= 0) {
    throw new Error('Matrix stopLoss must be a positive finite percentage, got ' + stopLoss);
  }
  overrides[`exitContracts.${strategyName}.stopLossPercent`] = -Math.abs(numericStop);

  return {
    BACKTEST_CONFIG_OVERRIDES_JSON: JSON.stringify(overrides),
  };
}

function formatTiers(tiers) {
  if (!tiers) return 'default';
  return tiers.label + '(' + tiers.t1 + '/' + tiers.t2 + '/' + tiers.t3 + ')';
}

function usesStructuralExits(strat) {
  const contract = BASE_CONFIG.exitContracts[strat] || BASE_CONFIG.exitContracts.default || {};
  return contract.useStructuralExits === true;
}

function phaseSweepsExitGeometry(phase) {
  return phase !== 'conf';
}

function filterStrategiesForPhase(strategies, phase) {
  const skipped = [];
  const runnable = strategies.filter(function(strat) {
    if (phaseSweepsExitGeometry(phase) && usesStructuralExits(strat)) {
      skipped.push(strat);
      return false;
    }
    return true;
  });
  return { runnable, skipped };
}

// ===================================================================
// MATRIX GENERATOR - Builds the combinatorial config list
// ===================================================================

function generateMatrix(strategies, grid, phase) {
  const configs = [];
  const phaseStrategies = filterStrategiesForPhase(strategies, phase).runnable;

  for (const strat of phaseStrategies) {
    // Confidence phase tests entry threshold against the locked exit contract.
    // Full/exits phases sweep strategy-owned stop geometry through backtest-only
    // config overrides so workers exercise the same frozen-policy path as live.
    const slValues = phase === 'conf' || !grid.stopLoss ? [null] : grid.stopLoss;
    const tierPresets = grid.tierPresets || [null];
    const timeframeValues = Array.isArray(grid.timeframes) && grid.timeframes.length > 0 ? grid.timeframes : [null];
    const lockedSL = getLockedSL(strat);

    for (const sl of slValues) {
      const effectiveSL = sl == null ? lockedSL : sl;
      for (const tiers of tierPresets) {
        for (const conf of grid.confidence) {
          for (const timeframe of timeframeValues) {
            const shortName = strat.substring(0, 4);
            const tierLabel = tiers ? tiers.label : 'def';
            const slLabel = sl == null ? 'lockedsl' + lockedSL : 'sl' + effectiveSL;
            const timeframeLabel = timeframe == null ? '' : '_tf' + String(timeframe).replace(/[^a-zA-Z0-9_.-]/g, '_');
            const name = shortName + '_' + slLabel + '_' + tierLabel + timeframeLabel + '_c' + (conf * 100).toFixed(0);

            const env = {
              SOLO_STRATEGY: strat,
              ...buildBacktestOverrideEnv(strat, sl, conf, timeframe),
            };

            // Set tier targets if sweeping (otherwise MPM uses ConfigLoader defaults)
            if (tiers) {
              env.TIER1_TARGET = String(tiers.t1);
              env.TIER2_TARGET = String(tiers.t2);
              env.TIER3_TARGET = String(tiers.t3);
            }

            // SMS needs explicit enable
            if (strat === 'SmartMoneySweep') {
              env.ENABLE_SMS = 'true';
              env.SMS_VP_RTH_ONLY = 'true';
            }

            // NoWick needs explicit enable (off by default; sweep uses opt-in env)
            if (strat === 'NoWickImbalance') {
              env.ENABLE_NOWICK = 'true';
            }

            // BreakRetest needs explicit enable (off by default; sweep uses opt-in env)
            if (strat === 'BreakRetest') {
              env.ENABLE_BREAKRETEST = 'true';
            }

            // ORB needs explicit enable (off by default; sweep uses opt-in env)
            if (strat === 'OpeningRangeBreakout') {
              env.ENABLE_ORB = 'true';
            }

            // DonchianBreakout needs explicit enable (off by default; sweep uses opt-in env)
            if (strat === 'DonchianBreakout') {
              env.ENABLE_DONCHIAN = 'true';
            }

            if (strat === 'PropSafeEMAPullback') {
              env.ENABLE_PROPSAFE_EMA = 'true';
            }

            if (strat === 'EMATrendRetest') {
              env.ENABLE_EMA_TREND_RETEST = 'true';
            }

            if (strat === 'RSI2MeanReversion') {
              env.ENABLE_RSI2_MR = 'true';
            }

            if (strat === 'TimeSeriesMomentum') {
              env.ENABLE_TSMOM = 'true';
            }

            configs.push({
              name,
              strategy: strat,
              timeframe,
              lockedSL,
              sl: effectiveSL,
              tiers,
              conf,
              env,
            });
          }
        }
      }
    }
  }

  return configs;
}

// ===================================================================
// WORKER - Runs a single backtest as child process
// (Same pattern as parallel-backtest.js)
// ===================================================================

function runWorker(config, dataFile, stockMode, profileName, feeProfileName) {
  return new Promise(function(resolve) {
    var startTime = Date.now();
    var uid = 'matrix-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    var stateFile = path.join(PROJECT_ROOT, 'data', 'state-' + uid + '.json');

    var instrumentEnv = resolveInstrumentFromDataFile(dataFile);

    var env = buildBacktestWorkerEnv({
      sourceEnv: process.env,
      projectRoot: PROJECT_ROOT,
      dataFile: dataFile,
      stateFile: stateFile,
      dataDir: path.join(PROJECT_ROOT, 'data', 'backtest'),
      reportTag: uid,
      stockMode: stockMode,
      profileName: profileName,
      feeProfileName: feeProfileName,
      strategyDiag: 'false',
      configEnv: config.env,
      instrumentEnv: instrumentEnv,
    });

    var output = '';
    var child = spawn('node', [RUNNER], {
      cwd: PROJECT_ROOT,
      env: env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', function(d) { output += d.toString(); });
    child.stderr.on('data', function(d) { output += d.toString(); });

    child.on('close', function(code) {
      var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      var result = parseOutput(output, config);

      // Try reading report JSON as fallback
      if (result.trades == null) {
        var reportResult = tryReadReport(PROJECT_ROOT, uid, env.BACKTEST_OUTPUT_DIR);
        if (reportResult) Object.assign(result, reportResult);
      }

      result.elapsed = elapsed;
      result.exitCode = code;
      result.workerEnv = summarizeWorkerEnv(env);
      result.workerErrors = normalizeWorkerErrors(result.workerErrors);
      if (hasWorkerError(result)) {
        var workerLogPath = writeWorkerOutputLog(uid, output);
        if (workerLogPath) result.workerLogPath = workerLogPath;
        if (!result.error) result.error = getWorkerFailureReason(result);
      }

      // Cleanup
      try { fs.unlinkSync(stateFile); } catch (e) {}

      resolve(result);
    });

    child.on('error', function(err) {
      resolve(buildWorkerProcessErrorResult(
        config,
        env,
        uid,
        output,
        err,
        ((Date.now() - startTime) / 1000).toFixed(1)
      ));
    });
  });
}

function parseOutput(output, config) {
  var r = {
    name: config.name,
    strategy: config.strategy,
    timeframe: config.timeframe || null,
    lockedSL: config.lockedSL,
    tiers: config.tiers,
    conf: config.conf,
  };

  // FIX 2026-04-21: regex patterns aligned with BacktestRecorder.printSummary actual format
  //   - "Net P&L:" prints with "+$" prefix on positive values → allow optional +
  //   - "Avg Winner:" / "Avg Loser:" (not "Win" / "Loss") → match Winner/Loser
  //   - "Expectancy:" is now emitted by BacktestRecorder (was missing entirely before)
  var bal = output.match(/Final Balance:\s*\$?([\d,.]+)/);
  var startingBal = output.match(/Starting Balance:\s*\$?([\d,.]+)/);
  var trades = output.match(/Total Trades:\s*(\d+)/);
  var wr = output.match(/Win Rate:\s*([\d.]+)%/);
  var pnl = output.match(/Net P&L:\s*\+?\$?([-\d,.]+)/);
  var fees = output.match(/Total Fees.*?:\s*\$?([\d,.]+)/);
  var dd = output.match(/Max Drawdown:\s*([\d.]+)%/);
  var pf = output.match(/Profit Factor:\s*([\d.]+)/);
  var exp = output.match(/Expectancy:\s*\+?\$?([-\d,.]+)/);
  var avgWin = output.match(/Avg Winner:\s*\+?\$?([-\d,.]+)/);
  var avgLoss = output.match(/Avg Loser:\s*\$?([-\d,.]+)/);
  var errorMatches = Array.from(output.matchAll(/Errors:\s*(\d+)/g));

  r.finalBalance = bal ? parseFloat(bal[1].replace(',', '')) : null;
  r.startingBalance = startingBal ? parseFloat(startingBal[1].replace(',', '')) : null;
  r.trades = trades ? parseInt(trades[1]) : null;
  r.winRate = wr ? parseFloat(wr[1]) : null;
  r.netPnl = pnl ? parseFloat(pnl[1].replace(',', '')) : null;
  r.fees = fees ? parseFloat(fees[1].replace(',', '')) : null;
  r.maxDrawdown = dd ? parseFloat(dd[1]) : null;
  r.profitFactor = pf ? parseFloat(pf[1]) : null;
  r.expectancy = exp ? parseFloat(exp[1].replace(',', '')) : null;
  r.avgWin = avgWin ? parseFloat(avgWin[1].replace(',', '')) : null;
  r.avgLoss = avgLoss ? parseFloat(avgLoss[1].replace(',', '')) : null;
  r.workerErrors = errorMatches.length > 0
    ? normalizeWorkerErrors(errorMatches[errorMatches.length - 1][1])
    : 0;

  if (
    Number.isFinite(r.finalBalance) &&
    Number.isFinite(r.startingBalance) &&
    r.netPnl == null
  ) {
    r.netPnl = r.finalBalance - r.startingBalance;
  }

  return r;
}

function finiteNumber(value) {
  var number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function listTaggedReports(scanDir, tag) {
  if (!scanDir || !fs.existsSync(scanDir)) return [];
  var reports = [];
  for (var entry of fs.readdirSync(scanDir, { withFileTypes: true })) {
    var full = path.join(scanDir, entry.name);
    if (entry.isDirectory()) {
      reports = reports.concat(listTaggedReports(full, tag));
      continue;
    }
    var matchesLegacyName = entry.name.startsWith('backtest-report-') && entry.name.endsWith('.json');
    var matchesCampaignName = entry.name.startsWith('report-') && entry.name.endsWith('.json');
    if (!matchesLegacyName && !matchesCampaignName) continue;
    if (tag && full.indexOf(tag) === -1) continue;
    reports.push({ name: entry.name, path: full, mtime: fs.statSync(full).mtimeMs });
  }
  return reports;
}

function tryReadReport(projectRoot, tag, outputRoot) {
  try {
    // FIX 2026-04-22: per-worker tag filter — prevents race condition under parallelism.
    // When tag is provided (matrix-sweep call), match only files containing that tag.
    // When tag is absent (hypothetical future callers), falls back to mtime-sort behavior.
    // FIX 2026-04-22 (2nd pass): scan backtest-results/worker-reports/ first (new routing
    // for tagged workers), fall back to project root for legacy files still lingering there.
    var workerDir = path.join(projectRoot, 'backtest-results', 'worker-reports');
    var reports = []
      .concat(listTaggedReports(outputRoot, tag))
      .concat(listTaggedReports(workerDir, tag))
      .concat(listTaggedReports(projectRoot, tag))
      .sort(function(a, b) { return b.mtime - a.mtime; });

    if (reports.length === 0) return null;
    var reportPath = reports[0].path;
    var data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    // FIX 2026-04-21: removed unlinkSync — per-worker reports are kept for postmortem analysis.
    // Race fix (2026-04-22, commit 747909d): workers route to backtest-results/worker-reports/
    // via BACKTEST_REPORT_TAG uid, and tryReadReport filters by tag (scanDir logic above).

    var tradeList = data.trades || [];
    var summary = data.summary || {};
    var finalBalance = finiteNumber(summary.finalBalance);
    var startingBalance = finiteNumber(summary.startingBalance);
    if (startingBalance == null) startingBalance = finiteNumber(summary.initialBalance);
    if (startingBalance == null && data.config) startingBalance = finiteNumber(data.config.initialBalance);
    if (tradeList.length === 0 && finalBalance == null) return null;

    var winners = tradeList.filter(function(t) { return (t.netPnlDollars || t.pnl || 0) > 0; });
    var totalFees = tradeList.reduce(function(s, t) { return s + (t.feesDollars || 0); }, 0);
    var netPnl = finiteNumber(summary.netPnlDollars);
    if (netPnl == null) netPnl = finiteNumber(summary.totalPnL);
    if (netPnl == null && finalBalance != null && startingBalance != null) {
      netPnl = finalBalance - startingBalance;
    }
    if (netPnl == null) {
      netPnl = tradeList.reduce(function(s, t) { return s + (t.netPnlDollars || 0); }, 0);
    }

    // CC-A Change 3 (Option B): aggregate pattern dimensions per (strategy,
    // dayOfWeek, session, holdBucket, confidenceTier, exitType) instead of
    // carrying raw trades through (Option A bloats sweep JSON to GBs).
    // Pattern-pack harvester (tools/harvest-pattern-pack.js, Change 4) reads
    // these aggregates from per-worker reports — matrix sweep results stay slim.
    var dimensionAgg = {};
    tradeList.forEach(function(t) {
      var key = [
        t.strategyName || 'unknown',
        t.dayOfWeek || 'unknown',
        t.session || 'unknown',
        t.holdBucket || 'unknown',
        t.confidenceTier || 'unknown',
        t.exitType || 'unknown'
      ].join('|');
      if (!dimensionAgg[key]) {
        dimensionAgg[key] = {
          strategy: t.strategyName || 'unknown',
          dayOfWeek: t.dayOfWeek || 'unknown',
          session: t.session || 'unknown',
          holdBucket: t.holdBucket || 'unknown',
          confidenceTier: t.confidenceTier || 'unknown',
          exitType: t.exitType || 'unknown',
          count: 0, wins: 0, losses: 0, totalPnl: 0
        };
      }
      var pnl = t.netPnlDollars || 0;
      dimensionAgg[key].count++;
      if (pnl > 0) dimensionAgg[key].wins++;
      else if (pnl < 0) dimensionAgg[key].losses++;
      dimensionAgg[key].totalPnl += pnl;
    });

    // FIX 2026-04-21: expanded return shape — BacktestRunner.js now merges BacktestRecorder.getSummary()
    // into report.summary, so these fields are available on JSON read (fallback path still returns null
    // for absent values). Matches parseOutput() return shape for downstream consumers.
    return {
      finalBalance: finalBalance,
      startingBalance: startingBalance,
      trades: tradeList.length || (summary.totalTrades || null),
      winRate: tradeList.length > 0 ? (winners.length / tradeList.length) * 100 :
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
      reportPath: reportPath,
      // CC-A Change 3: aggregated pattern dimensions for harvester
      dimensionAgg: Object.values(dimensionAgg),
    };
  } catch (e) { return null; }
}

// ===================================================================
// PARALLEL RUNNER
// ===================================================================

async function runMatrix(configs, dataFile, stockMode, soloStrategy, phase, profileName, feeProfileName) {
  var tuningProfile = resolveTuningProfile(profileName);
  var feeProfile = resolveFeeProfile(feeProfileName);
  var totalStart = Date.now();

  console.log('\n' + '='.repeat(72));
  console.log('  OGZPrime MATRIX SWEEP' + (stockMode ? ' [STOCK MODE]' : ''));
  console.log('  ' + cpuModel + ' | ' + threadCount + ' threads | ' + MAX_WORKERS + ' workers');
  console.log('  ' + configs.length + ' configurations to test');
  console.log('  Data: ' + dataFile);
  console.log('  Profile: ' + tuningProfile.name);
  console.log('  Fee profile: ' + feeProfile.name);
  console.log('  ETA: ~' + Math.ceil(configs.length / MAX_WORKERS * 30 / 60) + ' minutes');
  console.log('='.repeat(72) + '\n');

  // Show strategy breakdown
  var stratCounts = {};
  configs.forEach(function(c) { stratCounts[c.strategy] = (stratCounts[c.strategy] || 0) + 1; });
  Object.entries(stratCounts).forEach(function(e) { console.log('  ' + e[0] + ': ' + e[1] + ' configs'); });
  console.log('');

  var results = [];
  var completed = 0;

  for (var i = 0; i < configs.length; i += MAX_WORKERS) {
    var batch = configs.slice(i, i + MAX_WORKERS);
    var batchNum = Math.floor(i / MAX_WORKERS) + 1;
    var totalBatches = Math.ceil(configs.length / MAX_WORKERS);
    var pct = ((completed / configs.length) * 100).toFixed(0);

    process.stdout.write('  Batch ' + batchNum + '/' + totalBatches + ' (' + pct + '% done, ' + batch.length + ' workers)...');

    var batchResults = await Promise.all(
      batch.map(function(c) { return runWorker(c, dataFile, stockMode, tuningProfile.name, feeProfile.name); })
    );

    batchResults.forEach(function(r) { results.push(r); });
    completed += batch.length;

    // Quick status line
    var successes = batchResults.filter(isCleanParsedResult).length;
    var bestInBatch = batchResults
      .filter(isCleanParsedResult)
      .sort(function(a, b) { return b.netPnl - a.netPnl; })[0];
    var bestStr = bestInBatch ? 'best=$' + bestInBatch.netPnl.toFixed(0) : 'no results';
    console.log(' ' + successes + '/' + batch.length + ' parsed, ' + bestStr);
  }

  var totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);

  // -- Per-strategy analysis --
  var strategies = [];
  results.forEach(function(r) { if (strategies.indexOf(r.strategy) === -1) strategies.push(r.strategy); });
  var parsed = results.filter(isCleanParsedResult);
  var failed = results.filter(function(r) { return r.netPnl == null || hasWorkerError(r); });

  console.log('\n' + '='.repeat(72));
  console.log('  MATRIX RESULTS - ' + parsed.length + '/' + results.length + ' parsed in ' + totalTime + 's');
  console.log('='.repeat(72));
  if (failed.length > 0) {
    console.log('  ' + failed.length + ' configs failed or reported worker errors');
  }

  var bestPerStrategy = {};

  for (var si = 0; si < strategies.length; si++) {
    var strat = strategies[si];
    var stratResults = parsed
      .filter(function(r) { return r.strategy === strat; })
      .sort(function(a, b) { return b.netPnl - a.netPnl; });

    if (stratResults.length === 0) {
      console.log('\n  ' + strat + ': No parseable results');
      continue;
    }

    var best = stratResults[0];
    var worst = stratResults[stratResults.length - 1];
    var profitable = stratResults.filter(function(r) { return r.netPnl > 0; });
    var median = stratResults[Math.floor(stratResults.length / 2)];

    bestPerStrategy[strat] = best;

    console.log('\n  +-- ' + strat + ' (' + stratResults.length + ' configs tested) -----');
    console.log('  |');
    console.log('  |  BEST:   LockedSL=' + best.lockedSL + '% Tiers=' + formatTiers(best.tiers) + ' Conf=' + (best.conf * 100).toFixed(0) + '%');
    console.log('  |          P&L: $' + best.netPnl.toFixed(2) + ' | ' + (best.trades || '?') + ' trades | WR: ' + (best.winRate != null ? best.winRate.toFixed(1) : '?') + '%');
    if (best.maxDrawdown != null) {
      console.log('  |          DD: ' + best.maxDrawdown.toFixed(1) + '% | PF: ' + (best.profitFactor != null ? best.profitFactor.toFixed(2) : '?'));
    }
    console.log('  |');
    console.log('  |  Median: P&L $' + median.netPnl.toFixed(2) + ' | Worst: $' + worst.netPnl.toFixed(2));
    console.log('  |  Profitable: ' + profitable.length + '/' + stratResults.length + ' (' + (profitable.length / stratResults.length * 100).toFixed(0) + '%)');
    console.log('  |');

    // Show top 5
    console.log('  |  Top 5:');
    stratResults.slice(0, 5).forEach(function(r, idx) {
      console.log('  |   #' + (idx + 1) + ' TF=' + (r.timeframe || 'default') + ' LockedSL=' + r.lockedSL + ' Tiers=' + formatTiers(r.tiers) + ' C=' + (r.conf * 100).toFixed(0) + '%  ->  $' + r.netPnl.toFixed(2) + ' | ' + (r.trades || '?') + ' trades | WR ' + (r.winRate != null ? r.winRate.toFixed(1) : '?') + '%');
    });

    // Sensitivity check: are neighboring configs also profitable?
    if (stratResults.length >= 3) {
      var top3 = stratResults.slice(0, 3);
      var allClose = top3.every(function(r) { return r.netPnl > 0; });
      console.log('  |');
      console.log('  |  ' + (allClose ? 'ROBUST' : 'WARNING') + ': Top 3 all profitable = ' + (allClose ? 'YES (robust)' : 'NO (fragile, may be overfit)'));
    }
    console.log('  +------------------------------------------------------');
  }

  // -- Cross-strategy summary --
  console.log('\n' + '='.repeat(72));
  console.log('  BEST HONORED SWEEP CONFIG PER STRATEGY');
  console.log('='.repeat(72));

  Object.entries(bestPerStrategy).forEach(function(e) {
    var stName = e[0], b = e[1];
    console.log('  ' + stName + ': timeframe=' + (b.timeframe || 'default') + ' conf=' + (b.conf * 100).toFixed(0) + '% tiers=' + formatTiers(b.tiers) + ' lockedSL=' + b.lockedSL + '% -> $' + b.netPnl.toFixed(2));
  });

  // -- Save results --
  // FIX 2026-04-22: human-readable leaderboard filenames — ticker/strategy/phase/date
  // before the timestamp suffix so multiple sweeps in a day don't collide but are
  // still identifiable at a glance.
  var dataLabel = getDataLabel(dataFile);
  var stratLabel = soloStrategy || 'all';
  var phaseLabel = phase || 'full';
  var dateStr = new Date().toISOString().slice(0, 10);
  var sweepName = dataLabel + '-' + stratLabel + '-' + phaseLabel + '-' + dateStr;
  var timestamp = Date.now();
  var reportPath = path.join(RESULTS_DIR, 'matrix-' + sweepName + '-' + timestamp + '.json');
  var csvPath = path.join(RESULTS_DIR, 'matrix-' + sweepName + '-' + timestamp + '.csv');

  // JSON report
  var report = {
    timestamp: new Date().toISOString(),
    hardware: { cpu: cpuModel, threads: threadCount, workers: MAX_WORKERS },
    dataFile: dataFile,
    stockMode: stockMode,
    tuningProfile: summarizeTuningProfile(tuningProfile),
    feeProfile: summarizeFeeProfile(feeProfile),
    totalConfigs: configs.length,
    parsedConfigs: parsed.length,
    erroredConfigs: failed.length,
    totalTime: totalTime + 's',
    bestPerStrategy: bestPerStrategy,
    results: parsed.sort(function(a, b) { return b.netPnl - a.netPnl; }),
    failed: failed.map(summarizeFailedResult),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nJSON: ' + reportPath);

  // CSV for spreadsheet analysis
  var csvHeader = 'strategy,timeframe,lockedStopLoss,tierLabel,tier1Target,tier2Target,tier3Target,confidence,netPnl,trades,winRate,maxDrawdown,profitFactor,expectancy,avgWin,avgLoss,fees,elapsed';
  var csvRows = parsed.map(function(r) {
    var tiers = r.tiers || {};
    return [r.strategy, r.timeframe || '', r.lockedSL, tiers.label || 'default', tiers.t1 || '', tiers.t2 || '', tiers.t3 || '', r.conf,
      r.netPnl != null ? r.netPnl.toFixed(2) : '',
      r.trades || '', r.winRate != null ? r.winRate.toFixed(2) : '',
      r.maxDrawdown != null ? r.maxDrawdown.toFixed(2) : '',
      r.profitFactor != null ? r.profitFactor.toFixed(2) : '',
      r.expectancy != null ? r.expectancy.toFixed(2) : '',
      r.avgWin != null ? r.avgWin.toFixed(2) : '',
      r.avgLoss != null ? r.avgLoss.toFixed(2) : '',
      r.fees != null ? r.fees.toFixed(2) : '',
      r.elapsed].join(',');
  });
  fs.writeFileSync(csvPath, [csvHeader].concat(csvRows).join('\n'));
  console.log('CSV: ' + csvPath);

  // -- Summary --
  var overallBest = parsed.sort(function(a, b) { return b.netPnl - a.netPnl; })[0];
  if (overallBest) {
    console.log('\nOVERALL BEST: ' + overallBest.strategy + ' TF=' + (overallBest.timeframe || 'default') + ' LockedSL=' + overallBest.lockedSL + '% Tiers=' + formatTiers(overallBest.tiers) + ' Conf=' + (overallBest.conf * 100).toFixed(0) + '%');
    console.log('   P&L: $' + overallBest.netPnl.toFixed(2) + ' | Trades: ' + overallBest.trades + ' | WR: ' + (overallBest.winRate != null ? overallBest.winRate.toFixed(1) : '?') + '%');
  }

  // -- CC-A Change 5: TRAI auto-harvest (gated by TRAI_AUTO_HARVEST=true) --
  if (process.env.TRAI_AUTO_HARVEST === 'true') {
    console.log('\n[TRAI] Auto-harvesting pattern pack from sweep results...');
    try {
      var harvestModule = require('./harvest-pattern-pack');
      var workerDir = path.join(PROJECT_ROOT, 'backtest-results', 'worker-reports');
      var packOutputPath = path.join(PROJECT_ROOT, 'data', 'pattern-pack.json');
      var harvestResult = harvestModule.harvest(workerDir, packOutputPath, {
        minTrades: parseInt(process.env.TRAI_HARVEST_MIN_TRADES || '20', 10),
        boostThreshold: parseFloat(process.env.TRAI_HARVEST_BOOST_WR || '0.55'),
        penaltyThreshold: parseFloat(process.env.TRAI_HARVEST_PENALTY_WR || '0.40'),
        afterTimestamp: totalStart,
        source: 'matrix-sweep:' + (soloStrategy || 'all') + ':' + phase,
      });
      console.log('[TRAI] Pattern pack: ' + harvestResult.patterns + ' patterns, ' +
        harvestResult.antiPatterns + ' anti-patterns from ' +
        harvestResult.totalTrades.toLocaleString() + ' trades (' +
        harvestResult.dimensionCount + ' dimensions)');
      console.log('[TRAI] Output: ' + harvestResult.outputPath);
    } catch (e) {
      console.error('[TRAI] Auto-harvest failed (non-fatal): ' + e.message);
    }
  }

  return report;
}

// ===================================================================
// CLI
// ===================================================================

async function main() {
  var args = process.argv.slice(2);
  var dataFile = DEFAULT_DATA;
  var stockMode = false;
  var phase = 'full';       // full | exits | conf | quick
  var soloStrategy = null;  // null = all validated strategies
  var useAllStrategies = false;
  var profileName = DEFAULT_TUNING_PROFILE;
  var feeProfileName = null;

  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) {
      var val = args[++i].toLowerCase();
      dataFile = DATA_SHORTCUTS[val] || args[i];
      if (isStockTickerShortcut(val)) stockMode = true;
    } else if (args[i].indexOf('--data=') === 0) {
      var dval = args[i].split('=')[1].toLowerCase();
      dataFile = DATA_SHORTCUTS[dval] || args[i].split('=')[1];
      if (isStockTickerShortcut(dval)) stockMode = true;
    } else if (args[i] === '--phase' && args[i + 1]) {
      phase = args[++i];
    } else if (args[i].indexOf('--phase=') === 0) {
      phase = args[i].split('=')[1];
    } else if (args[i] === '--profile' && args[i + 1]) {
      profileName = args[++i];
    } else if (args[i].indexOf('--profile=') === 0) {
      profileName = args[i].split('=')[1];
    } else if (args[i] === '--fee-profile' && args[i + 1]) {
      feeProfileName = args[++i];
    } else if (args[i].indexOf('--fee-profile=') === 0) {
      feeProfileName = args[i].split('=')[1];
    } else if (args[i] === '--quick') {
      phase = 'quick';
    } else if (args[i] === '--full') {
      phase = 'full';
    } else if (args[i] === '--exits') {
      phase = 'exits';
    } else if (args[i] === '--conf') {
      phase = 'conf';
    } else if (args[i].indexOf('--solo=') === 0) {
      soloStrategy = args[i].split('=')[1];
    } else if (args[i] === '--solo' && args[i + 1]) {
      soloStrategy = args[++i];
    } else if (args[i] === '--all-strategies') {
      useAllStrategies = true;
    } else if (args[i] === '--stocks') {
      stockMode = true;
    } else if (DATA_SHORTCUTS[args[i] ? args[i].toLowerCase() : '']) {
      var key = args[i].toLowerCase();
      dataFile = DATA_SHORTCUTS[key];
      if (isStockTickerShortcut(key)) stockMode = true;
    } else if (args[i] === '--help') {
      console.log('\nOGZPrime Matrix Sweep Backtester');
      console.log('================================\n');
      console.log('Usage: node tools/matrix-sweep.js [options]\n');
      console.log('Phases (what to sweep):');
      console.log('  --full         Full matrix: Tier targets x Confidence (default)');
      console.log('  --quick        Reduced grid (fast sanity check)');
      console.log('  --exits        Tier-target sweep only (confidence locked; skips structural-exit strategies)');
      console.log('  --conf         Confidence sweep only (tier targets locked)\n');
      console.log('Strategy Selection:');
      console.log('  --solo=RSI          Test only RSI');
      console.log('  --solo=EMA          Test only EMASMACrossover');
      console.log('  --all-strategies    Test ALL strategies\n');
      console.log('Profiles:');
      console.log('  --profile=NAME      Tuning profile (' + listTuningProfileNames().join(', ') + ')\n');
      console.log('  --fee-profile=NAME  Required venue fee profile (' + listFeeProfileNames().join(', ') + ')\n');
      console.log('Data:');
      console.log('  --data tsla    TSLA 15m 2-year (default)');
      console.log('  --data spy     SPY, --data qqq, nvda, riot, etc.');
      console.log('  --stocks       Force stock instrument validation\n');
      console.log('Examples:');
      console.log('  node tools/matrix-sweep.js --data tsla --fee-profile=ttp_real');
      console.log('  node tools/matrix-sweep.js --data tsla --solo=RSI --conf --fee-profile=ttp_real');
      console.log('  node tools/matrix-sweep.js --data tsla --solo=EMA --exits --profile=current-eval --fee-profile=ttp_real');
      console.log('  node tools/matrix-sweep.js --data tsla --quick --fee-profile=ttp_real');
      console.log('  node tools/matrix-sweep.js --data spy --stocks --fee-profile=ttp_real\n');
      console.log('Walk-Forward Workflow:');
      console.log('  1. Run --exits on training data:  --data tsla-train --exits');
      console.log('  2. Lock best honored tier targets per strategy/profile');
      console.log('  3. Run --conf on training data:   --data tsla-train --conf');
      console.log('  4. Lock best confidence');
      console.log('  5. Validate on test data:         --data tsla-test');
      console.log('  6. Compare train vs test P&L (WFE > 60% = robust)');
      process.exit(0);
    }
  }

  if (!feeProfileName) {
    console.error('Missing required --fee-profile. Available: ' + listFeeProfileNames().join(', '));
    process.exit(1);
  }

  // Resolve solo strategy (prefix match)
  var strategies = useAllStrategies ? ALL_STRATEGIES : VALIDATED_STRATEGIES;
  if (soloStrategy) {
    var match = ALL_STRATEGIES.find(function(s) {
      return s.toLowerCase().indexOf(soloStrategy.toLowerCase()) === 0;
    });
    if (!match) {
      console.error('Unknown strategy: ' + soloStrategy);
      console.error('Available: ' + ALL_STRATEGIES.join(', '));
      process.exit(1);
    }
    strategies = [match];
    console.log('[SOLO] Testing only: ' + match);
  }

  // Validate phase
  if (!GRID[phase]) {
    console.error('Unknown phase: ' + phase);
    console.error('Available: ' + Object.keys(GRID).join(', '));
    process.exit(1);
  }

  var phaseStrategyFilter = filterStrategiesForPhase(strategies, phase);
  if (phaseStrategyFilter.skipped.length > 0) {
    console.log('[SKIP] Structural-exit strategies excluded from ' + phase + ' exit-geometry sweep: ' + phaseStrategyFilter.skipped.join(', '));
  }

  // Generate matrix
  var configs = generateMatrix(strategies, GRID[phase], phase);

  if (configs.length === 0) {
    console.error('No configurations generated. Check strategy name and phase.');
    if (phaseStrategyFilter.skipped.length > 0) {
      console.error('Skipped structural-exit strategies because this phase sweeps exit geometry that their overrideLevels ignore. Use --conf or the ATR sweep instead.');
    }
    process.exit(1);
  }

  console.log('\n  Phase: ' + phase);
  console.log('  Strategies: ' + strategies.join(', '));
  console.log('  Profile: ' + resolveTuningProfile(profileName).name);
  console.log('  Fee profile: ' + resolveFeeProfile(feeProfileName).name);
  console.log('  Total configs: ' + configs.length);

  await runMatrix(configs, dataFile, stockMode, soloStrategy, phase, profileName, feeProfileName);
}

if (require.main === module) {
  main().catch(function(err) {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_DATA,
  DATA_SHORTCUTS,
  STOCK_TICKERS,
  VALIDATED_STRATEGIES,
  ALL_STRATEGIES,
  GRID,
  usesStructuralExits,
  filterStrategiesForPhase,
  getDataLabel,
  buildMonotonicTierCube,
  generateMatrix,
  parseOutput,
  tryReadReport,
  isCleanParsedResult,
  getWorkerFailureReason,
  writeWorkerOutputLog,
  buildWorkerProcessErrorResult,
  listTuningProfileNames,
  resolveTuningProfile,
  summarizeTuningProfile,
};
