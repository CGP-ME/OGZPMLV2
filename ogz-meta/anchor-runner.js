#!/usr/bin/env node

/**
 * anchor-runner.js
 * Runs the canonical Phase 0 backtest and parses the report.
 *
 * Used by the --write pipeline's /anchor-verify stage to capture the
 * current state of the anchor after a fix has been applied. Returns a
 * structured summary that the /anchor-doc-update stage uses to refresh
 * the canonical baseline doc.
 *
 * Canonical command (source: ogz-meta/specs/baseline-phase0-2026-05-06.md):
 *   SOLO_STRATEGY=EMASMACrossover
 *   ENABLE_EMA=true
 *   EXECUTION_MODE=backtest
 *   CANDLE_SOURCE=file
 *   CANDLE_DATA_FILE=<path>           ← varies (full vs fast)
 *   BACKTEST_MODE=true
 *   BACKTEST_FAST=true
 *   BACKTEST_SILENT=true
 *   FEE_MAKER=0
 *   FEE_TAKER=0
 *   BROKER/TRADING_PAIR/ASSET_CLASS=<derived from CANDLE_DATA_FILE>
 *   MIN_TRADE_CONFIDENCE=0.60
 *   ACCOUNT_DRAWDOWN_BYPASS=true
 *   STATE_FILE=<state-file>           ← varies
 *   BACKTEST_NO_PATTERN_SAVE=true
 *   ENABLE_DASHBOARD=false
 *   DIRECTION_FILTER=long_only
 *   ENABLE_SHORTS=false
 *   ENABLE_TRAI=false
 *   node run-empire-v2.js
 *
 * Operator note: this file hardcodes the canonical env vars by design.
 * The anchor doc describes the spec; this runner enforces it. If the
 * canonical command ever changes, update both this file AND the doc in
 * the same commit so they don't drift.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveInstrumentFromDataFile } = require('../tools/instrument-env');
const {
  buildBacktestWorkerEnv,
  summarizeWorkerEnv,
} = require('../tools/backtest-worker-env');
const {
  resolveTuningProfile,
  summarizeTuningProfile,
} = require('../tools/tuning-profiles');

const REPO_ROOT = path.resolve(__dirname, '..');

const CANONICAL_ENV = {
  SOLO_STRATEGY: 'EMASMACrossover',
  ENABLE_EMA: 'true',
  MIN_TRADE_CONFIDENCE: '0.60',
  ACCOUNT_DRAWDOWN_BYPASS: 'true',
  DIRECTION_FILTER: 'long_only',
  ENABLE_SHORTS: 'false',
  ENABLE_TRAI: 'false'
};

const P0_TUNING_PROFILE = 'current-eval';

const PROFILES = {
  fast: {
    label: 'Fast P0 (750-candle)',
    candleFile: 'tuning/tsla-15m-750.json',
    stateFile: 'data/state-phase0-750.json',
    logSuffix: '750'
  },
  full: {
    label: 'Full P0 (canonical 15,889-candle)',
    candleFile: 'tuning/tsla-15m-2y.json',
    stateFile: 'data/state-baseline-phase0.json',
    logSuffix: 'canonical'
  }
};

function buildRunStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function buildP0RunSpec(profile, logTag, runStamp = buildRunStamp()) {
  const cfg = PROFILES[profile];
  if (!cfg) {
    throw new Error(`anchor-runner: unknown profile "${profile}" — expected one of ${Object.keys(PROFILES).join(', ')}`);
  }

  const logName = `phase0-${cfg.logSuffix}-${logTag}-${runStamp}.log`;
  const logPath = path.join(REPO_ROOT, 'ogz-meta', 'ledger', logName);
  const instrumentEnv = resolveInstrumentFromDataFile(cfg.candleFile);
  const tuningProfile = resolveTuningProfile(P0_TUNING_PROFILE);
  const env = buildBacktestWorkerEnv({
    sourceEnv: process.env,
    projectRoot: REPO_ROOT,
    dataFile: cfg.candleFile,
    stateFile: path.join(REPO_ROOT, cfg.stateFile),
    dataDir: path.join(REPO_ROOT, 'data', 'backtest', `phase0-${cfg.logSuffix}`),
    reportTag: `phase0-${cfg.logSuffix}-${logTag}-${runStamp}`,
    stockMode: true,
    configEnv: CANONICAL_ENV,
    instrumentEnv,
    profileName: tuningProfile.name,
  });

  return {
    cfg,
    env,
    logPath,
    tuningProfile,
    workerEnv: summarizeWorkerEnv(env),
  };
}

/**
 * Run a Phase 0 backtest profile and return the parsed summary.
 *
 * @param {string} profile - 'fast' or 'full'
 * @param {string} logTag - tag appended to the log file name (e.g. mission id)
 * @returns {object} { profile, label, log, report, summary }
 * @throws {Error} on profile invalid, backtest exit non-zero, or report missing
 */
function runP0(profile, logTag) {
  const {
    cfg,
    env,
    logPath,
    tuningProfile,
    workerEnv,
  } = buildP0RunSpec(profile, logTag);

  // Stream-capture: write everything to the log file so it's auditable
  // post-run. The "Report saved" line gives us the report JSON path.
  const cmd = `node run-empire-v2.js`;
  let stdout = '';
  try {
    stdout = execSync(cmd, {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024  // 50MB — full P0 can be verbose
    });
  } catch (err) {
    const errOutput = (err.stdout || '') + (err.stderr || '');
    fs.writeFileSync(logPath, errOutput, 'utf8');
    throw new Error(`anchor-runner: backtest failed (${err.message}); see ${logPath}`);
  }

  fs.writeFileSync(logPath, stdout, 'utf8');

  const reportMatch = stdout.match(/Report saved:\s+(\S+\.json)/);
  if (!reportMatch) {
    throw new Error(`anchor-runner: could not find "Report saved:" line in backtest stdout; see ${logPath}`);
  }
  const reportPath = reportMatch[1];

  if (!fs.existsSync(reportPath)) {
    throw new Error(`anchor-runner: report path from stdout not on disk: ${reportPath}`);
  }
  const reportRaw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const s = reportRaw.summary || {};

  const summary = {
    finalBalance: s.finalBalance,
    totalTrades: s.totalTrades,
    winners: s.winners,
    losers: s.losers,
    winRate: s.winRate,
    maxDrawdownPercent: s.maxDrawdownPercent,
    maxDrawdownDollars: s.maxDrawdownDollars,
    profitFactor: s.profitFactor,
    expectancy: s.expectancy,
    avgWinnerDollars: s.avgWinnerDollars,
    avgLoserDollars: s.avgLoserDollars,
    netPnlDollars: s.netPnlDollars,
    netPnlPercent: s.netPnlPercent,
    totalFeesPaid: s.totalFeesPaid
  };

  return {
    profile,
    label: cfg.label,
    log: logPath,
    report: reportPath,
    tuningProfile: summarizeTuningProfile(tuningProfile),
    workerEnv,
    summary
  };
}

/**
 * Numeric equality at float precision — true if both finalBalances match
 * to 12+ decimal digits. Used to detect anchor drift.
 */
function summariesMatch(a, b) {
  if (!a || !b) return false;
  return a.finalBalance === b.finalBalance &&
         a.totalTrades === b.totalTrades &&
         a.winners === b.winners &&
         a.losers === b.losers;
}

module.exports = {
  runP0,
  summariesMatch,
  PROFILES,
  CANONICAL_ENV,
  P0_TUNING_PROFILE,
  buildP0RunSpec,
  buildRunStamp,
};
