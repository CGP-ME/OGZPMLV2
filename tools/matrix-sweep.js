#!/usr/bin/env node
/**
 * OGZPrime MATRIX SWEEP BACKTESTER
 * =================================
 *
 * THE FULL OPTIMIZATION MATRIX.
 *
 * Tests every strategy individually x every exit config x every confidence level.
 * Each combination runs in isolation (SOLO_STRATEGY) through the real trading pipeline.
 *
 * What this produces:
 *   A complete Strategy x Exit x Confidence config matrix telling you
 *   the BEST parameters for each strategy, backed by data not guesses.
 *
 * Dimensions (full grid):
 *   Strategies:  RSI, EMASMACrossover, MADynamicSR, LiquiditySweep (4 validated)
 *   Stop Loss:   [0.5, 0.8, 1.0, 1.5, 2.0, 3.0] (6 values)
 *   Take Profit: [1.0, 1.5, 2.0, 2.5, 3.0, 4.0] (6 values, where TP > SL)
 *   Confidence:  [0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75] (8 values)
 *
 *   = 4 strategies x 25 valid SL/TP combos x 8 confidence levels = 800 configs
 *   At ~30s each with 14 workers on 7800X3D = ~30 minutes total
 *
 * Metrics captured per run (FIX 2026-04-21):
 *   finalBalance, trades, winRate, netPnl, fees,
 *   maxDrawdown, profitFactor, expectancy, avgWin, avgLoss
 *   (previously only 5 of 10 — stdout regex + JSON read now both emit full set)
 *
 * Usage:
 *   node tools/matrix-sweep.js --data tsla              # Full matrix, all strategies
 *   node tools/matrix-sweep.js --data tsla --solo=RSI   # RSI only (200 configs)
 *   node tools/matrix-sweep.js --data tsla --phase exits # Just SL/TP sweep, locked conf
 *   node tools/matrix-sweep.js --data tsla --phase conf  # Just confidence, locked exits
 *   # ATR dimension tuning: use `node tools/parallel-backtest.js --atr --data <ticker>`
 *   node tools/matrix-sweep.js --data tsla --quick       # Reduced grid (fast sanity check)
 *
 * Output:
 *   backtest-results/matrix-{timestamp}.json    Full results
 *   backtest-results/matrix-{timestamp}.csv     Spreadsheet-friendly
 *   Console: Per-strategy leaderboard + best config per strategy
 *
 * WORKFLOW (from handoff doc):
 *   1. Isolate one strategy
 *   2. Tune entries: confidence sweep (--phase conf)
 *   3. Tune exits: SL/TP sweep (--phase exits)
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
const RESULTS_DIR = getMatrixDir();

// ===================================================================
// DATA FILE SHORTCUTS
// ===================================================================
const DATA_SHORTCUTS = {
  'tsla': 'tuning/tsla-15m-2y.json',
  'tsla-train': 'tuning/tsla-15m-train.json',
  'tsla-test': 'tuning/tsla-15m-test.json',
  'spy': 'tuning/spy-15m-2y.json',
  'qqq': 'tuning/qqq-15m-2y.json',
  'nvda': 'tuning/nvda-15m-2y.json',
  'riot': 'tuning/riot-15m-2y.json',
  'mara': 'tuning/mara-15m-2y.json',
  'coin': 'tuning/coin-15m-2y.json',
  'btc': 'data/polygon-btc-1y.json',
};
const STOCK_TICKERS = ['tsla', 'spy', 'qqq', 'nvda', 'riot', 'mara', 'coin',
                        'tsla-train', 'tsla-test'];

// Extract human-readable label from data file path
// 'tuning/tsla-15m-2y.json'    → 'tsla-2y'
// 'tuning/tsla-15m-train.json' → 'tsla-train'
// 'data/polygon-btc-1y.json'   → 'btc-1y'
function getDataLabel(dataFile) {
  var base = path.basename(dataFile, '.json');
  base = base.replace(/^polygon-/, '');
  base = base.replace(/-15m-/, '-');
  base = base.replace(/-1m-/, '-');
  base = base.replace(/-5m-/, '-');
  base = base.replace(/-1h-/, '-');
  return base;
}

// ===================================================================
// MATRIX DIMENSIONS - The search space
// ===================================================================

// Strategies that have validated walk-forward results
const VALIDATED_STRATEGIES = ['RSI', 'EMASMACrossover', 'MADynamicSR', 'LiquiditySweep', 'SmartMoneySweep'];

// All registered strategies (for exploratory sweeps)
const ALL_STRATEGIES = [
  ...VALIDATED_STRATEGIES,
  'MarketRegime', 'MultiTimeframe', 'OGZTPO', 'OpeningRangeBreakout', 'CandlePattern',
];

const GRID = {
  // Full grid: SL × Tier targets × Confidence
  // NOTE: takeProfit is IGNORED by the code — MPM tier targets control profit exits.
  // We sweep TIER1_TARGET/TIER2_TARGET/TIER3_TARGET instead.
  full: {
    stopLoss:   [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0, 3.5, 4.0, 5.0],
    tierPresets: [
      { t1: 0.005, t2: 0.010, t3: 0.015, label: 'tight' },
      { t1: 0.007, t2: 0.010, t3: 0.015, label: 'default' },
      { t1: 0.010, t2: 0.015, t3: 0.020, label: 'wide' },
      { t1: 0.015, t2: 0.020, t3: 0.030, label: 'ultra-wide' },
    ],
    confidence: [0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75],
  },
  // Quick sanity check (reduced grid)
  quick: {
    stopLoss:   [0.5, 0.8, 1.5],
    tierPresets: [
      { t1: 0.005, t2: 0.010, t3: 0.015, label: 'tight' },
      { t1: 0.007, t2: 0.010, t3: 0.015, label: 'default' },
      { t1: 0.010, t2: 0.015, t3: 0.020, label: 'wide' },
    ],
    confidence: [0.40, 0.55, 0.70],
  },
  // Exit-only phase (locked confidence, sweep SL + tiers)
  exits: {
    stopLoss:   [0.3, 0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0],
    tierPresets: [
      { t1: 0.003, t2: 0.006, t3: 0.010, label: 'scalp' },
      { t1: 0.005, t2: 0.010, t3: 0.015, label: 'tight' },
      { t1: 0.007, t2: 0.010, t3: 0.015, label: 'default' },
      { t1: 0.010, t2: 0.015, t3: 0.020, label: 'wide' },
      { t1: 0.015, t2: 0.020, t3: 0.030, label: 'ultra-wide' },
    ],
    confidence: [0.60],  // Locked at current validated value
  },
  // Confidence-only phase (locked exits at current best per strategy)
  conf: {
    stopLoss:   null,  // Uses per-strategy locked exits
    tierPresets: null,  // Uses current MPM defaults
    confidence: [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80],
  },
};

// Locked exits per strategy — pulled from canonical source TradingConfig.exitContracts
// (DEC-013: contracts are sealed with _validated markers). Previously this was a hardcoded
// dict that had drifted from TradingConfig — 4 strategies (MultiTimeframe, OGZTPO,
// OpeningRangeBreakout, SmartMoneySweep) had values that didn't match the real contract,
// so sweeps were using the wrong locked-SL baseline. Reading from BASE_CONFIG keeps the
// two in sync automatically.
//
// TradingConfig stores stopLossPercent as negative (e.g. -0.5 = "stop 0.5% below entry for long").
// Matrix-sweep passes STOP_LOSS_PERCENT env var to workers as positive absolute. Math.abs() bridges.
const { BASE_CONFIG } = require('../core/TradingConfig.js');
function getLockedSL(strat) {
  const contract = BASE_CONFIG.exitContracts[strat] || BASE_CONFIG.exitContracts.default;
  return Math.abs(contract.stopLossPercent);
}

// ===================================================================
// MATRIX GENERATOR - Builds the combinatorial config list
// ===================================================================

function generateMatrix(strategies, grid, phase) {
  const configs = [];

  for (const strat of strategies) {
    // Get SL values: if phase='conf', use locked exits from TradingConfig
    let slValues;
    if (phase === 'conf' || !grid.stopLoss) {
      slValues = [getLockedSL(strat)];
    } else {
      slValues = grid.stopLoss;
    }

    // Get tier presets: if phase='conf', use defaults (null = don't set env var)
    const tierPresets = grid.tierPresets || [null];

    for (const sl of slValues) {
      for (const tiers of tierPresets) {
        for (const conf of grid.confidence) {
          const shortName = strat.substring(0, 4);
          const tierLabel = tiers ? tiers.label : 'def';
          const name = shortName + '_sl' + sl + '_' + tierLabel + '_c' + (conf * 100).toFixed(0);

          const env = {
            SOLO_STRATEGY: strat,
            STOP_LOSS_PERCENT: String(sl),
            MIN_TRADE_CONFIDENCE: String(conf),
          };

          // Set tier targets if sweeping (otherwise MPM uses TradingConfig defaults)
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

          configs.push({
            name,
            strategy: strat,
            sl, tiers, conf,
            env,
          });
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

function runWorker(config, dataFile, stockMode) {
  return new Promise(function(resolve) {
    var startTime = Date.now();
    var uid = 'matrix-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    var stateFile = path.join(PROJECT_ROOT, 'data', 'state-' + uid + '.json');

    // FIX 2026-04-16: Build worker env from scratch (not clone-and-scrub).
    // Previous approach cloned process.env and deleted 6 known-bad vars.
    // ~180+ trading env vars could leak from a dirty shell (ENABLE_*,
    // REGIME_*, VP_*, TRAIL_*, BE_*, etc). Now we build from a whitelist
    // of only what matrix workers need. Leakage is impossible regardless
    // of shell state.
    var workerBaseEnv = {};
    var SYSTEM_VARS = ['PATH', 'NODE_PATH', 'HOME', 'USERPROFILE',
                       'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
                       'BACKTEST_OUTPUT_DIR', 'NODE_OPTIONS'];
    for (var i = 0; i < SYSTEM_VARS.length; i++) {
      var key = SYSTEM_VARS[i];
      if (process.env[key] !== undefined) {
        workerBaseEnv[key] = process.env[key];
      }
    }

    var env = Object.assign({}, workerBaseEnv, {
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      BACKTEST_SILENT: 'true',
      BACKTEST_VERBOSE: 'false',
      BACKTEST_FAST: 'true',
      INITIAL_BALANCE: '10000',
      CANDLE_DATA_FILE: path.resolve(PROJECT_ROOT, dataFile),
      STATE_FILE: stateFile,
      DATA_DIR: path.join(PROJECT_ROOT, 'data', 'backtest'),
      PAPER_TRADING: 'true',
      TEST_MODE: 'true',
      BACKTEST_NO_PATTERN_SAVE: 'true',
      SKIP_CSV_EXPORT: 'true',
      ENABLE_DASHBOARD: 'false',
      SENTRY_DSN: '',
      NODE_ENV: 'test',
      BACKTEST_REPORT_TAG: uid,
      STRATEGY_DIAG: 'false',
    }, stockMode ? { FEE_MAKER: '0', FEE_TAKER: '0' } : {}, config.env);

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
        var reportResult = tryReadReport(PROJECT_ROOT, uid);
        if (reportResult) Object.assign(result, reportResult);
      }

      result.elapsed = elapsed;
      result.exitCode = code;

      // Cleanup
      try { fs.unlinkSync(stateFile); } catch (e) {}

      resolve(result);
    });

    child.on('error', function(err) {
      resolve({
        name: config.name,
        strategy: config.strategy,
        sl: config.sl, tp: config.tp, conf: config.conf,
        error: err.message,
        elapsed: ((Date.now() - startTime) / 1000).toFixed(1),
      });
    });
  });
}

function parseOutput(output, config) {
  var r = {
    name: config.name,
    strategy: config.strategy,
    sl: config.sl,
    tp: config.tp,
    conf: config.conf,
  };

  // FIX 2026-04-21: regex patterns aligned with BacktestRecorder.printSummary actual format
  //   - "Net P&L:" prints with "+$" prefix on positive values → allow optional +
  //   - "Avg Winner:" / "Avg Loser:" (not "Win" / "Loss") → match Winner/Loser
  //   - "Expectancy:" is now emitted by BacktestRecorder (was missing entirely before)
  var bal = output.match(/Final Balance:\s*\$?([\d,.]+)/);
  var trades = output.match(/Total Trades:\s*(\d+)/);
  var wr = output.match(/Win Rate:\s*([\d.]+)%/);
  var pnl = output.match(/Net P&L:\s*\+?\$?([-\d,.]+)/);
  var fees = output.match(/Total Fees.*?:\s*\$?([\d,.]+)/);
  var dd = output.match(/Max Drawdown:\s*([\d.]+)%/);
  var pf = output.match(/Profit Factor:\s*([\d.]+)/);
  var exp = output.match(/Expectancy:\s*\+?\$?([-\d,.]+)/);
  var avgWin = output.match(/Avg Winner:\s*\+?\$?([-\d,.]+)/);
  var avgLoss = output.match(/Avg Loser:\s*\$?([-\d,.]+)/);

  r.finalBalance = bal ? parseFloat(bal[1].replace(',', '')) : null;
  r.trades = trades ? parseInt(trades[1]) : null;
  r.winRate = wr ? parseFloat(wr[1]) : null;
  r.netPnl = pnl ? parseFloat(pnl[1].replace(',', '')) : null;
  r.fees = fees ? parseFloat(fees[1].replace(',', '')) : null;
  r.maxDrawdown = dd ? parseFloat(dd[1]) : null;
  r.profitFactor = pf ? parseFloat(pf[1]) : null;
  r.expectancy = exp ? parseFloat(exp[1].replace(',', '')) : null;
  r.avgWin = avgWin ? parseFloat(avgWin[1].replace(',', '')) : null;
  r.avgLoss = avgLoss ? parseFloat(avgLoss[1].replace(',', '')) : null;

  if (r.finalBalance && r.netPnl == null) {
    r.netPnl = r.finalBalance - 10000;
  }

  return r;
}

function tryReadReport(projectRoot, tag) {
  try {
    // FIX 2026-04-22: per-worker tag filter — prevents race condition under parallelism.
    // When tag is provided (matrix-sweep call), match only files containing that tag.
    // When tag is absent (hypothetical future callers), falls back to mtime-sort behavior.
    // FIX 2026-04-22 (2nd pass): scan backtest-results/worker-reports/ first (new routing
    // for tagged workers), fall back to project root for legacy files still lingering there.
    var workerDir = path.join(projectRoot, 'backtest-results', 'worker-reports');
    var scanDir = fs.existsSync(workerDir) ? workerDir : projectRoot;
    var reports = fs.readdirSync(scanDir)
      .filter(function(f) {
        if (!f.startsWith('backtest-report-') || !f.endsWith('.json')) return false;
        if (tag) return f.indexOf(tag) !== -1;
        return true;
      })
      .map(function(f) { return { name: f, mtime: fs.statSync(path.join(scanDir, f)).mtimeMs }; })
      .sort(function(a, b) { return b.mtime - a.mtime; });

    if (reports.length === 0) return null;
    var reportPath = path.join(scanDir, reports[0].name);
    var data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    // FIX 2026-04-21: removed unlinkSync — per-worker reports are kept for postmortem analysis.
    // Race fix (2026-04-22, commit 747909d): workers route to backtest-results/worker-reports/
    // via BACKTEST_REPORT_TAG uid, and tryReadReport filters by tag (scanDir logic above).

    var tradeList = data.trades || [];
    var summary = data.summary || {};
    if (tradeList.length === 0 && !summary.finalBalance) return null;

    var winners = tradeList.filter(function(t) { return (t.netPnlDollars || t.pnl || 0) > 0; });
    var totalFees = tradeList.reduce(function(s, t) { return s + (t.feesDollars || 0); }, 0);
    var netPnl = summary.finalBalance ? summary.finalBalance - 10000 :
                 tradeList.reduce(function(s, t) { return s + (t.netPnlDollars || 0); }, 0);

    // FIX 2026-04-21: expanded return shape — BacktestRunner.js now merges BacktestRecorder.getSummary()
    // into report.summary, so these fields are available on JSON read (fallback path still returns null
    // for absent values). Matches parseOutput() return shape for downstream consumers.
    return {
      finalBalance: summary.finalBalance || null,
      trades: tradeList.length || (summary.totalTrades || null),
      winRate: tradeList.length > 0 ? (winners.length / tradeList.length) * 100 :
               (summary.winRate != null ? parseFloat(summary.winRate) : null),
      netPnl: netPnl,
      fees: totalFees || summary.totalFeesPaid || null,
      maxDrawdown: summary.maxDrawdownPercent != null ? parseFloat(summary.maxDrawdownPercent) : null,
      profitFactor: summary.profitFactor != null && summary.profitFactor !== 'N/A'
                    ? parseFloat(summary.profitFactor) : null,
      expectancy: summary.expectancy != null ? parseFloat(summary.expectancy) : null,
      avgWin: summary.avgWinnerDollars != null ? summary.avgWinnerDollars : null,
      avgLoss: summary.avgLoserDollars != null ? summary.avgLoserDollars : null,
    };
  } catch (e) { return null; }
}

// ===================================================================
// PARALLEL RUNNER
// ===================================================================

async function runMatrix(configs, dataFile, stockMode, soloStrategy, phase) {
  var totalStart = Date.now();

  console.log('\n' + '='.repeat(72));
  console.log('  OGZPrime MATRIX SWEEP' + (stockMode ? ' [STOCK MODE]' : ''));
  console.log('  ' + cpuModel + ' | ' + threadCount + ' threads | ' + MAX_WORKERS + ' workers');
  console.log('  ' + configs.length + ' configurations to test');
  console.log('  Data: ' + dataFile);
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
      batch.map(function(c) { return runWorker(c, dataFile, stockMode); })
    );

    batchResults.forEach(function(r) { results.push(r); });
    completed += batch.length;

    // Quick status line
    var successes = batchResults.filter(function(r) { return r.netPnl != null; }).length;
    var bestInBatch = batchResults
      .filter(function(r) { return r.netPnl != null; })
      .sort(function(a, b) { return b.netPnl - a.netPnl; })[0];
    var bestStr = bestInBatch ? 'best=$' + bestInBatch.netPnl.toFixed(0) : 'no results';
    console.log(' ' + successes + '/' + batch.length + ' parsed, ' + bestStr);
  }

  var totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);

  // -- Per-strategy analysis --
  var strategies = [];
  results.forEach(function(r) { if (strategies.indexOf(r.strategy) === -1) strategies.push(r.strategy); });
  var parsed = results.filter(function(r) { return r.netPnl != null; });

  console.log('\n' + '='.repeat(72));
  console.log('  MATRIX RESULTS - ' + parsed.length + '/' + results.length + ' parsed in ' + totalTime + 's');
  console.log('='.repeat(72));

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
    console.log('  |  BEST:   SL=' + best.sl + '% TP=' + best.tp + '% Conf=' + (best.conf * 100).toFixed(0) + '%');
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
      console.log('  |   #' + (idx + 1) + ' SL=' + r.sl + ' TP=' + r.tp + ' C=' + (r.conf * 100).toFixed(0) + '%  ->  $' + r.netPnl.toFixed(2) + ' | ' + (r.trades || '?') + ' trades | WR ' + (r.winRate != null ? r.winRate.toFixed(1) : '?') + '%');
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
  console.log('  BEST CONFIG PER STRATEGY (copy to TradingConfig.exitContracts)');
  console.log('='.repeat(72));

  Object.entries(bestPerStrategy).forEach(function(e) {
    var stName = e[0], b = e[1];
    console.log('  ' + stName + ': { stopLossPercent: -' + b.sl + ', takeProfitPercent: ' + b.tp + ' }  // conf=' + (b.conf * 100).toFixed(0) + '% -> $' + b.netPnl.toFixed(2));
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
    totalConfigs: configs.length,
    parsedConfigs: parsed.length,
    totalTime: totalTime + 's',
    bestPerStrategy: bestPerStrategy,
    results: parsed.sort(function(a, b) { return b.netPnl - a.netPnl; }),
    failed: results.filter(function(r) { return r.netPnl == null; }).map(function(r) {
      return { name: r.name, strategy: r.strategy, elapsed: r.elapsed, exitCode: r.exitCode };
    }),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nJSON: ' + reportPath);

  // CSV for spreadsheet analysis
  var csvHeader = 'strategy,stopLoss,takeProfit,confidence,netPnl,trades,winRate,maxDrawdown,profitFactor,expectancy,avgWin,avgLoss,fees,elapsed';
  var csvRows = parsed.map(function(r) {
    return [r.strategy, r.sl, r.tp, r.conf,
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
    console.log('\nOVERALL BEST: ' + overallBest.strategy + ' SL=' + overallBest.sl + '% TP=' + overallBest.tp + '% Conf=' + (overallBest.conf * 100).toFixed(0) + '%');
    console.log('   P&L: $' + overallBest.netPnl.toFixed(2) + ' | Trades: ' + overallBest.trades + ' | WR: ' + (overallBest.winRate != null ? overallBest.winRate.toFixed(1) : '?') + '%');
  }

  return report;
}

// ===================================================================
// CLI
// ===================================================================

async function main() {
  var args = process.argv.slice(2);
  var dataFile = 'tuning/tsla-15m-2y.json';
  var stockMode = false;
  var phase = 'full';       // full | exits | conf | quick
  var soloStrategy = null;  // null = all validated strategies
  var useAllStrategies = false;

  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--data' && args[i + 1]) {
      var val = args[++i].toLowerCase();
      dataFile = DATA_SHORTCUTS[val] || args[i];
      if (STOCK_TICKERS.indexOf(val) !== -1) stockMode = true;
    } else if (args[i].indexOf('--data=') === 0) {
      var dval = args[i].split('=')[1].toLowerCase();
      dataFile = DATA_SHORTCUTS[dval] || args[i].split('=')[1];
      if (STOCK_TICKERS.indexOf(dval) !== -1) stockMode = true;
    } else if (args[i] === '--phase' && args[i + 1]) {
      phase = args[++i];
    } else if (args[i].indexOf('--phase=') === 0) {
      phase = args[i].split('=')[1];
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
      if (STOCK_TICKERS.indexOf(key) !== -1) stockMode = true;
    } else if (args[i] === '--help') {
      console.log('\nOGZPrime Matrix Sweep Backtester');
      console.log('================================\n');
      console.log('Usage: node tools/matrix-sweep.js [options]\n');
      console.log('Phases (what to sweep):');
      console.log('  --full         Full matrix: SL x TP x Confidence (default)');
      console.log('  --quick        Reduced grid (fast sanity check)');
      console.log('  --exits        SL/TP sweep only (confidence locked)');
      console.log('  --conf         Confidence sweep only (exits locked)\n');
      console.log('Strategy Selection:');
      console.log('  --solo=RSI          Test only RSI');
      console.log('  --solo=EMA          Test only EMASMACrossover');
      console.log('  --all-strategies    Test ALL strategies\n');
      console.log('Data:');
      console.log('  --data tsla    TSLA 15m 2-year (default)');
      console.log('  --data spy     SPY, --data qqq, nvda, riot, etc.');
      console.log('  --stocks       Force zero-commission mode\n');
      console.log('Examples:');
      console.log('  node tools/matrix-sweep.js --data tsla');
      console.log('  node tools/matrix-sweep.js --data tsla --solo=RSI --conf');
      console.log('  node tools/matrix-sweep.js --data tsla --solo=EMA --exits');
      console.log('  node tools/matrix-sweep.js --data tsla --quick');
      console.log('  node tools/matrix-sweep.js --data spy --stocks\n');
      console.log('Walk-Forward Workflow:');
      console.log('  1. Run --exits on training data:  --data tsla-train --exits');
      console.log('  2. Lock best SL/TP per strategy');
      console.log('  3. Run --conf on training data:   --data tsla-train --conf');
      console.log('  4. Lock best confidence');
      console.log('  5. Validate on test data:         --data tsla-test');
      console.log('  6. Compare train vs test P&L (WFE > 60% = robust)');
      process.exit(0);
    }
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

  // Generate matrix
  var configs = generateMatrix(strategies, GRID[phase], phase);

  if (configs.length === 0) {
    console.error('No configurations generated. Check strategy name and phase.');
    process.exit(1);
  }

  console.log('\n  Phase: ' + phase);
  console.log('  Strategies: ' + strategies.join(', '));
  console.log('  Total configs: ' + configs.length);

  await runMatrix(configs, dataFile, stockMode, soloStrategy, phase);
}

main().catch(function(err) {
  console.error('Fatal error:', err);
  process.exit(1);
});
