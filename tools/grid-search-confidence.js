#!/usr/bin/env node
/**
 * Grid Search: confidence.minTradeConfidence threshold optimization
 * Tests values: 0.05, 0.10, 0.15, 0.20, 0.25, 0.30
 * Uses an explicitly selected candle file and venue fee profile.
 *
 * Usage:
 *   node tools/grid-search-confidence.js --data=tuning/alpaca-tsla-15m-2y.json --fee-profile=ttp_real
 *   node tools/grid-search-confidence.js --data=tuning/alpaca-tsla-15m-2y.json --fee-profile=ttp_real --parallel
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ConfigLoader = require('../foundation/ConfigLoader');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const {
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
  removeBacktestRunDescriptor,
} = require('./backtest-worker-env');
const {
  listFeeProfileNames,
  resolveFeeProfile,
} = require('./fee-profiles');

const CONFIDENCE_GRID_CONFIG = ConfigLoader.getInternalsFileValue('tooling.confidenceGrid');
const THRESHOLDS = Object.freeze([...CONFIDENCE_GRID_CONFIG.thresholds]);
const WORK_DIR = path.resolve(__dirname, '..');

const PARALLEL = process.argv.includes('--parallel') || process.argv.includes('-p');
const feeProfileArg = process.argv.find(arg => arg.startsWith('--fee-profile='));
const FEE_PROFILE = feeProfileArg ? feeProfileArg.split('=')[1] : null;

function buildGridSearchEnv(threshold, reportTag, stateFile, dataFile, sourceEnv = process.env, feeProfileName = FEE_PROFILE) {
  return buildBacktestWorkerEnv({
    sourceEnv,
    projectRoot: WORK_DIR,
    dataFile,
    stateFile,
    dataDir: path.join(WORK_DIR, 'data', 'backtest'),
    reportTag,
    outputDir: path.join(WORK_DIR, 'backtest-results'),
    freshStart: false,
    overrides: { 'confidence.minTradeConfidence': threshold },
    instrumentIdentity: resolveInstrumentFromDataFile(dataFile),
    feeProfileName,
  });
}

function runBacktest(threshold, dataFile) {
  return new Promise((resolve) => {
    const pct = (threshold * 100).toFixed(0);
    const logFile = path.join(WORK_DIR, `grid-${pct}pct.log`);
    const reportTag = `grid-${pct}pct-${Date.now()}`;
    const stateFile = path.join(WORK_DIR, 'data', `state-${reportTag}.json`);
    const startTime = Date.now();

    console.log(`[${pct}%] Starting backtest...`);

    const env = buildGridSearchEnv(threshold, reportTag, stateFile, dataFile);

    const child = spawn(process.execPath, ['run-empire-v2.js'], {
      cwd: WORK_DIR,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      removeBacktestRunDescriptor(env);
      try { fs.unlinkSync(stateFile); } catch (e) {}
      resolve(result);
    };

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (settled) return;
      const log = stdout + stderr;
      fs.writeFileSync(logFile, log);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      let metrics = { trades: 0, wins: 0, losses: 0, pnl: 0 };

      // Parse from report file
      const reportMatch = log.match(/Report saved: ([^\s]+\.json)/);
      if (reportMatch) {
        try {
          const report = JSON.parse(fs.readFileSync(reportMatch[1], 'utf8'));
          metrics.trades = report.metrics?.totalTrades || 0;
          metrics.wins = report.metrics?.winningTrades || 0;
          metrics.losses = report.metrics?.losingTrades || 0;
          metrics.pnl = report.summary?.totalReturn || 0;
        } catch (e) { /* ignore */ }
      }

      // Fallback parsing
      if (metrics.trades === 0) {
        const pnlMatch = log.match(/Total P&L: \$[+-]?\d+\.?\d* \(([+-]?\d+\.?\d*)%\)/);
        if (pnlMatch) metrics.pnl = parseFloat(pnlMatch[1]);
        metrics.trades = (log.match(/BUY DECISION:/g) || []).length;
      }

      // Parse pattern learning stats (more accurate trade count)
      const winsMatch = log.match(/Wins: (\d+)/);
      const lossesMatch = log.match(/Losses: (\d+)/);
      if (winsMatch) metrics.wins = parseInt(winsMatch[1]);
      if (lossesMatch) metrics.losses = parseInt(lossesMatch[1]);

      const winRate = (metrics.wins + metrics.losses) > 0
        ? (metrics.wins / (metrics.wins + metrics.losses)) * 100
        : 0;

      const result = {
        threshold: pct + '%',
        thresholdNum: threshold,
        trades: metrics.wins + metrics.losses,
        wins: metrics.wins,
        losses: metrics.losses,
        winRate: winRate.toFixed(1) + '%',
        winRateNum: winRate,
        pnl: metrics.pnl.toFixed(2) + '%',
        pnlNum: metrics.pnl,
        duration: duration + 's',
        exitCode: code,
        workerEnv: summarizeWorkerEnv(env)
      };

      console.log(`[${pct}%] Done: ${result.trades} trades, ${result.winRate} win rate, ${result.pnl} P&L (${duration}s)`);
      finish(result);
    });

    child.on('error', (error) => {
      finish({
        threshold: pct + '%',
        thresholdNum: threshold,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: '0.0%',
        winRateNum: 0,
        pnl: '0.00%',
        pnlNum: 0,
        duration: ((Date.now() - startTime) / 1000).toFixed(1) + 's',
        exitCode: null,
        error: error.message,
        workerEnv: summarizeWorkerEnv(env),
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dataEqualsArg = args.find(arg => arg.startsWith('--data='));
  const dataFlagIndex = args.indexOf('--data');
  const dataFile = dataEqualsArg
    ? dataEqualsArg.slice('--data='.length)
    : (dataFlagIndex >= 0 ? args[dataFlagIndex + 1] : null);
  if (!dataFile || dataFile.startsWith('--')) {
    console.error('Missing required --data=FILE. The candle filename must identify symbol and timeframe.');
    process.exit(1);
  }
  if (!FEE_PROFILE) {
    console.error(`Missing required --fee-profile. Available: ${listFeeProfileNames().join(', ')}`);
    process.exit(1);
  }
  resolveFeeProfile(FEE_PROFILE);

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     confidence.minTradeConfidence GRID SEARCH              ║');
  console.log(`║     Testing: ${THRESHOLDS.map(value => `${value * 100}%`).join(', ').padEnd(48)}║`);
  console.log(`║     Data: ${dataFile.slice(0, 50).padEnd(50)}║`);
  console.log(`║     Mode: ${(PARALLEL ? `PARALLEL (all ${THRESHOLDS.length} at once)` : 'Sequential').padEnd(48)}║`);
  console.log(`║     Fee profile: ${FEE_PROFILE.padEnd(44)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  const totalStart = Date.now();
  let results;

  if (PARALLEL) {
    console.log(`Launching all ${THRESHOLDS.length} backtests in parallel...\n`);
    results = await Promise.all(THRESHOLDS.map(t => runBacktest(t, dataFile)));
  } else {
    results = [];
    for (const threshold of THRESHOLDS) {
      results.push(await runBacktest(threshold, dataFile));
    }
  }

  // Sort by threshold for display
  results.sort((a, b) => a.thresholdNum - b.thresholdNum);

  const totalDuration = ((Date.now() - totalStart) / 1000 / 60).toFixed(1);

  console.log('\n' + '═'.repeat(70));
  console.log('GRID SEARCH RESULTS');
  console.log('═'.repeat(70));
  console.log('');
  console.log('| Threshold | Trades | Wins | Losses | Win Rate | P&L      |');
  console.log('|-----------|--------|------|--------|----------|----------|');

  for (const r of results) {
    console.log(`| ${r.threshold.padEnd(9)} | ${String(r.trades).padEnd(6)} | ${String(r.wins).padEnd(4)} | ${String(r.losses).padEnd(6)} | ${r.winRate.padEnd(8)} | ${r.pnl.padEnd(8)} |`);
  }

  console.log('');
  console.log(`Total duration: ${totalDuration} minutes`);

  // Find sweet spot - score balances trades, win rate, and P&L
  const validResults = results.filter(r => r.exitCode === 0 && r.trades > 0);
  if (validResults.length > 0) {
    // Score formula: trades * winRate * (1 + pnl/10)
    // Rewards: more trades, higher win rate, positive P&L
    const scored = validResults.map(r => ({
      ...r,
      score: r.trades * (r.winRateNum / 100) * (1 + r.pnlNum / 10)
    }));
    scored.sort((a, b) => b.score - a.score);

    console.log('');
    console.log('RANKED SCORE OBSERVATION:');
    console.log('─'.repeat(50));
    for (let i = 0; i < Math.min(3, scored.length); i++) {
      const r = scored[i];
      console.log(`  #${i+1}: ${r.threshold} threshold`);
      console.log(`      ${r.trades} trades, ${r.winRate} win rate, ${r.pnl} P&L`);
      console.log(`      Score: ${r.score.toFixed(2)}`);
    }
    console.log('');
    console.log(`Top observed score: confidence.minTradeConfidence=${scored[0].thresholdNum}`);
  }

  // Save results
  const resultsFile = path.join(WORK_DIR, 'grid-search-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${resultsFile}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  THRESHOLDS,
  buildGridSearchEnv,
  runBacktest,
};
