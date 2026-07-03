#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(PROJECT_ROOT, 'run-empire-v2.js');
const CAMPAIGN_ROOT = path.join(PROJECT_ROOT, 'ogz-meta', 'cognition-history', 'weekend-campaign');

const {
  ALL_STRATEGIES,
  DATA_SHORTCUTS,
  STOCK_TICKERS,
} = require('./matrix-sweep');
const { resolveInstrumentFromDataFile } = require('./instrument-env');
const { buildBacktestWorkerEnv, summarizeWorkerEnv } = require('./backtest-worker-env');
const { resolveTuningProfile } = require('./tuning-profiles');
const { resolveFeeProfile } = require('./fee-profiles');
const {
  findLatestMatrixReport,
  validateMatrixRun,
} = require('./campaign-integrity');

const DORMANT_STRATEGY_ENV = Object.freeze({
  SmartMoneySweep: { ENABLE_SMS: 'true', SMS_VP_RTH_ONLY: 'true' },
  OpeningRangeBreakout: { ENABLE_ORB: 'true' },
  NoWickImbalance: { ENABLE_NOWICK: 'true' },
  BreakRetest: { ENABLE_BREAKRETEST: 'true' },
  DonchianBreakout: { ENABLE_DONCHIAN: 'true' },
  PropSafeEMAPullback: { ENABLE_PROPSAFE_EMA: 'true' },
  EMATrendRetest: { ENABLE_EMA_TREND_RETEST: 'true' },
  RSI2MeanReversion: { ENABLE_RSI2_MR: 'true' },
  TimeSeriesMomentum: { ENABLE_TSMOM: 'true' },
});

const DEFAULT_SMOKE_DATA = 'tsla-unseen';
const DEFAULT_FEE_PROFILE = 'ttp_real';
const DEFAULT_BASELINE_PROFILE = 'current-eval';
const DEFAULT_TREY_PROFILE = 'trey-spec';
const DEFAULT_PHASE = 'conf';
const DEFAULT_CAMPAIGN_SYMBOLS = Object.freeze(
  STOCK_TICKERS.filter(symbol => !String(symbol).includes('-'))
);

function usage(exitCode = 0) {
  const lines = [
    'Usage:',
    '  node tools/weekend-campaign-gauntlet.js smoke [--data=tsla-unseen] [--fee-profile=ttp_real] [--run-id=<id>]',
    '  node tools/weekend-campaign-gauntlet.js plan [--symbols=tsla,spy,qqq,nvda,riot,mara,coin] [--phase=conf] [--run-id=<id>]',
    '  node tools/weekend-campaign-gauntlet.js launch --manifest=<path> [--resume]',
    '  node tools/weekend-campaign-gauntlet.js status --manifest=<path>',
    '',
    'Smoke writes smoke-summary.json and refuses to greenlight launch if any roster row fails.',
    'Launch writes manifest.json, heartbeat.json, per-run status JSON, and full per-run logs.',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const command = argv[2];
  const options = { _: [] };
  for (const arg of argv.slice(3)) {
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq === -1) {
      options[arg.slice(2)] = true;
    } else {
      options[arg.slice(2, eq)] = arg.slice(eq + 1);
    }
  }
  return { command, options };
}

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function appendLogHeader(logPath, title, payload) {
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, [
    `# ${title}`,
    `# startedAt=${new Date().toISOString()}`,
    `# cwd=${PROJECT_ROOT}`,
    `# ${JSON.stringify(payload)}`,
    '',
  ].join('\n'));
}

function resolveDataFile(dataArg) {
  const key = dataArg || DEFAULT_SMOKE_DATA;
  const shortcut = DATA_SHORTCUTS[key];
  const dataFile = shortcut || key;
  const absolute = path.resolve(PROJECT_ROOT, dataFile);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Data file not found for '${key}': ${absolute}`);
  }
  return dataFile;
}

function parseList(value, fallback) {
  if (!value) return [...fallback];
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function strategyEnv(strategy) {
  return {
    SOLO_STRATEGY: strategy,
    ...(DORMANT_STRATEGY_ENV[strategy] || {}),
  };
}

function buildRunEnv({ dataFile, outputDir, stateFile, dataDir, reportTag, strategy, profileName, feeProfileName }) {
  const instrumentEnv = resolveInstrumentFromDataFile(dataFile);
  const stockMode = instrumentEnv.ASSET_CLASS === 'stocks';
  return buildBacktestWorkerEnv({
    sourceEnv: {
      ...process.env,
      BACKTEST_OUTPUT_DIR: outputDir,
    },
    projectRoot: PROJECT_ROOT,
    dataFile,
    stateFile,
    dataDir,
    reportTag,
    stockMode,
    strategyDiag: 'false',
    configEnv: strategyEnv(strategy),
    instrumentEnv,
    profileName,
    feeProfileName,
  });
}

function pickProofEnv(env) {
  const keys = [
    'TUNING_PROFILE',
    'BACKTEST_TUNING_PROFILE',
    'BACKTEST_FEE_PROFILE',
    'SOLO_STRATEGY',
    'EMA_CROSSOVER_ENTRY_EVENTS_ONLY',
    'EMA_CROSSOVER_CONFIRM_BARS',
    'EMA_CROSSOVER_WARMUP_BARS',
    'ORCH_MIN_CANDLES_EMA',
    'TREND_REGIME_GATE_ENABLED',
    'ATR_CONTRACTS_ENABLED',
    'ATR_STOP_MULTIPLIER',
    'ATR_TRAIL_MULTIPLIER',
    'ATR_TRAILING_ACTIVATION_R',
    'BE_SCALEOUT_FRACTION',
    'TIERED_EXIT_ENABLED',
    'TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF',
  ];
  const proof = {};
  for (const key of keys) {
    if (env[key] !== undefined) proof[key] = env[key];
  }
  return proof;
}

function runNodeProcess({ args, env, logPath, statusPath, label }) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    writeJson(statusPath, {
      label,
      status: 'running',
      startedAt,
      command: [process.execPath, ...args],
      logPath,
    });
    appendLogHeader(logPath, label, { args });

    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    child.stdout.pipe(stream, { end: false });
    child.stderr.pipe(stream, { end: false });
    child.on('error', (error) => {
      stream.write(`\n[spawn-error] ${error.stack || error.message}\n`);
    });
    child.on('close', (exitCode, signal) => {
      const finishedAt = new Date().toISOString();
      stream.write(`\n# finishedAt=${finishedAt} exitCode=${exitCode} signal=${signal || ''}\n`);
      stream.end();
      const status = {
        label,
        status: exitCode === 0 ? 'done' : 'failed',
        startedAt,
        finishedAt,
        exitCode,
        signal,
        command: [process.execPath, ...args],
        logPath,
      };
      writeJson(statusPath, status);
      resolve(status);
    });
  });
}

function listFilesRecursive(root, predicate, results = []) {
  if (!fs.existsSync(root)) return results;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      listFilesRecursive(full, predicate, results);
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function newestFile(files) {
  if (!files.length) return null;
  return files
    .map(file => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].file;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { parseError: error.message, lineNumber: index + 1, raw: line };
      }
    });
}

function loadLedgerRecords(outputDir) {
  const ledgerDir = path.join(outputDir, 'ledger');
  const autopsyFiles = listFilesRecursive(ledgerDir, file => /autopsy_.*\.jsonl$/.test(path.basename(file)));
  const decisionFiles = listFilesRecursive(ledgerDir, file => /decisions_.*\.jsonl$/.test(path.basename(file)));
  const rejectionFiles = listFilesRecursive(ledgerDir, file => /rejections_.*\.jsonl$/.test(path.basename(file)));
  return {
    autopsyFiles,
    decisionFiles,
    rejectionFiles,
    autopsies: autopsyFiles.flatMap(readJsonl),
    decisions: decisionFiles.flatMap(readJsonl),
    rejections: rejectionFiles.flatMap(readJsonl),
  };
}

function loadReport(outputDir) {
  const reportPath = newestFile(listFilesRecursive(outputDir, file => /^report.*\.json$/.test(path.basename(file))));
  if (!reportPath) return { reportPath: null, report: null };
  return { reportPath, report: readJson(reportPath) };
}

function namesFrom(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => item && (item.name || item.strategyName)).filter(Boolean);
}

function countStrategyEvidence(strategy, ledgers) {
  let signalCount = 0;
  let competingCount = 0;
  let filteredCount = 0;
  let decisionSignalCount = 0;
  let rejectionCount = 0;
  let warmupBars = null;
  let atrContributorCount = 0;

  for (const record of ledgers.autopsies) {
    for (const signal of record.strategySignals || []) {
      if ((signal.name || signal.strategyName) !== strategy) continue;
      signalCount += 1;
      if (Number.isFinite(Number(signal.warmupBars))) {
        warmupBars = Number(signal.warmupBars);
      }
      const contributors = signal.decisionAttribution?.contributors || [];
      if (contributors.some(contributor => contributor && contributor.name === 'atr_scaled_exit_contract')) {
        atrContributorCount += 1;
      }
    }
    if (namesFrom(record.orchestratorDecision?.competingStrategies).includes(strategy)) {
      competingCount += 1;
    }
    if (namesFrom(record.orchestratorDecision?.filteredStrategies).includes(strategy)) {
      filteredCount += 1;
    }
  }

  for (const record of ledgers.decisions) {
    if (namesFrom(record.strategySignals).includes(strategy)) {
      decisionSignalCount += 1;
    }
  }
  for (const record of ledgers.rejections) {
    if (record.strategy === strategy || record.strategyName === strategy) {
      rejectionCount += 1;
    }
  }

  return {
    signalCount,
    competingCount,
    filteredCount,
    decisionSignalCount,
    rejectionCount,
    evaluatedCount: signalCount + competingCount + filteredCount + decisionSignalCount + rejectionCount,
    warmupBars,
    atrContributorCount,
  };
}

function totalTrades(report) {
  const value = report?.summary?.totalTrades ?? report?.metrics?.totalTrades ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function countFrozenAtrPolicies(report) {
  let count = 0;
  for (const trade of report?.trades || []) {
    const contract = trade.frozenExitPolicy?.contract || trade.frozenExitPolicy?.exitContract || null;
    if (!contract) continue;
    const trailingStop = Number(contract.trailingStopPercent);
    const trailingActivation = Number(contract.trailingActivation);
    const stop = Number(contract.stopLossPercent);
    if (Number.isFinite(stop) && stop < 0 && Number.isFinite(trailingStop) && trailingStop > 0 && Number.isFinite(trailingActivation) && trailingActivation >= 0) {
      count += 1;
    }
  }
  return count;
}

async function runBacktest({ rootDir, name, strategy, dataFile, profileName, feeProfileName }) {
  const safe = safeName(name);
  const outputDir = ensureDir(path.join(rootDir, safe));
  const stateFile = path.join(outputDir, 'state.json');
  const dataDir = ensureDir(path.join(outputDir, 'data'));
  const reportTag = safe;
  const env = buildRunEnv({
    dataFile,
    outputDir,
    stateFile,
    dataDir,
    reportTag,
    strategy,
    profileName,
    feeProfileName,
  });
  const workerEnvSummary = summarizeWorkerEnv(env);
  const workerProofEnv = pickProofEnv(env);
  writeJson(path.join(outputDir, 'worker-env.json'), {
    summary: workerEnvSummary,
    proof: workerProofEnv,
  });
  const status = await runNodeProcess({
    args: [RUNNER],
    env,
    logPath: path.join(outputDir, 'worker.log'),
    statusPath: path.join(outputDir, 'status.json'),
    label: name,
  });
  const { reportPath, report } = loadReport(outputDir);
  const ledgers = loadLedgerRecords(outputDir);
  return {
    name,
    strategy,
    dataFile,
    profileName,
    feeProfileName,
    outputDir,
    reportPath,
    status,
    workerEnv: workerEnvSummary,
    workerProofEnv,
    report,
    ledgers,
  };
}

async function runSmoke(options) {
  const runId = options['run-id'] || `smoke-${isoStamp()}`;
  const rootDir = ensureDir(path.join(CAMPAIGN_ROOT, runId));
  const smokeDir = ensureDir(path.join(rootDir, 'smoke'));
  const dataFile = resolveDataFile(options.data || DEFAULT_SMOKE_DATA);
  const feeProfileName = resolveFeeProfile(options['fee-profile'] || DEFAULT_FEE_PROFILE).name;
  const baselineProfile = resolveTuningProfile(options.profile || DEFAULT_BASELINE_PROFILE).name;
  const treyProfile = resolveTuningProfile(options['trey-profile'] || DEFAULT_TREY_PROFILE).name;
  const strategies = parseList(options.strategies, ALL_STRATEGIES);

  const rows = [];
  for (const strategy of strategies) {
    const run = await runBacktest({
      rootDir: smokeDir,
      name: `smoke-${strategy}`,
      strategy,
      dataFile,
      profileName: baselineProfile,
      feeProfileName,
    });
    const evidence = countStrategyEvidence(strategy, run.ledgers);
    const trades = totalTrades(run.report);
    const verdict = run.status.exitCode === 0 && evidence.evaluatedCount > 0 && (trades >= 1 || evidence.evaluatedCount > 0)
      ? 'PASS'
      : 'FAIL';
    rows.push({
      strategy,
      evaluated: evidence.evaluatedCount,
      strategySignals: evidence.signalCount,
      trades,
      exitCode: run.status.exitCode,
      verdict,
      outputDir: run.outputDir,
      reportPath: run.reportPath,
      autopsyFiles: run.ledgers.autopsyFiles,
      decisionFiles: run.ledgers.decisionFiles,
      rejectionFiles: run.ledgers.rejectionFiles,
    });
    printSmokeRow(rows[rows.length - 1]);
  }

  const treySpec = await runTreySpecSmoke({
    smokeDir,
    dataFile,
    baselineProfile,
    treyProfile,
    feeProfileName,
  });

  const summary = {
    runId,
    rootDir,
    dataFile,
    feeProfileName,
    baselineProfile,
    treyProfile,
    generatedAt: new Date().toISOString(),
    rows,
    treySpec,
    passed: rows.every(row => row.verdict === 'PASS') && treySpec.verdict === 'PASS',
  };
  const summaryPath = path.join(rootDir, 'smoke-summary.json');
  writeJson(summaryPath, summary);
  printSmokeSummary(summary, summaryPath);
  if (!summary.passed) process.exitCode = 2;
  return summary;
}

async function runTreySpecSmoke({ smokeDir, dataFile, baselineProfile, treyProfile, feeProfileName }) {
  const baseline = await runBacktest({
    rootDir: path.join(smokeDir, 'trey-spec-engagement'),
    name: 'baseline-EMASMACrossover',
    strategy: 'EMASMACrossover',
    dataFile,
    profileName: baselineProfile,
    feeProfileName,
  });
  const trey = await runBacktest({
    rootDir: path.join(smokeDir, 'trey-spec-engagement'),
    name: 'trey-spec-EMASMACrossover',
    strategy: 'EMASMACrossover',
    dataFile,
    profileName: treyProfile,
    feeProfileName,
  });
  const atr = await runBacktest({
    rootDir: path.join(smokeDir, 'trey-spec-engagement'),
    name: 'trey-spec-DonchianBreakout',
    strategy: 'DonchianBreakout',
    dataFile,
    profileName: treyProfile,
    feeProfileName,
  });

  const baselineEvidence = countStrategyEvidence('EMASMACrossover', baseline.ledgers);
  const treyEvidence = countStrategyEvidence('EMASMACrossover', trey.ledgers);
  const atrEvidence = countStrategyEvidence('DonchianBreakout', atr.ledgers);
  const baselineSignals = baselineEvidence.signalCount;
  const treySignals = treyEvidence.signalCount;
  const eventSignalRatio = baselineSignals > 0 ? treySignals / baselineSignals : null;
  const frozenAtrPolicyCount = countFrozenAtrPolicies(atr.report);

  const checks = {
    baselineExitZero: baseline.status.exitCode === 0,
    treyExitZero: trey.status.exitCode === 0,
    atrExitZero: atr.status.exitCode === 0,
    entryEventsReduced: baselineSignals > 0 && treySignals < baselineSignals,
    warmup200Respected: trey.workerProofEnv.EMA_CROSSOVER_WARMUP_BARS === '200'
      && trey.workerProofEnv.ORCH_MIN_CANDLES_EMA === '200'
      && (treyEvidence.warmupBars === null || treyEvidence.warmupBars === 200),
    atrContractsEnabled: atr.workerProofEnv.ATR_CONTRACTS_ENABLED === 'true',
    atrFrozenPolicyPresent: frozenAtrPolicyCount > 0,
  };

  const verdict = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
  return {
    verdict,
    checks,
    baselineStateSignalCount: baselineSignals,
    treyEventSignalCount: treySignals,
    eventSignalRatio,
    treyWarmupBarsObserved: treyEvidence.warmupBars,
    atrStrategy: 'DonchianBreakout',
    atrTrades: totalTrades(atr.report),
    atrSignalCount: atrEvidence.signalCount,
    atrDecisionContributorCount: atrEvidence.atrContributorCount,
    frozenAtrPolicyCount,
    baselineOutputDir: baseline.outputDir,
    treyOutputDir: trey.outputDir,
    atrOutputDir: atr.outputDir,
  };
}

function printSmokeRow(row) {
  process.stdout.write([
    row.strategy,
    `evaluated=${row.evaluated}`,
    `signals=${row.strategySignals}`,
    `trades=${row.trades}`,
    `exit=${row.exitCode}`,
    row.verdict,
  ].join(' | ') + '\n');
}

function printSmokeSummary(summary, summaryPath) {
  process.stdout.write('\nSMOKE MATRIX\n');
  process.stdout.write('strategy | evaluated | trades | exit code | verdict\n');
  for (const row of summary.rows) {
    process.stdout.write(`${row.strategy} | ${row.evaluated} | ${row.trades} | ${row.exitCode} | ${row.verdict}\n`);
  }
  process.stdout.write('\nTREY-SPEC ENGAGEMENT\n');
  process.stdout.write(`${JSON.stringify(summary.treySpec, null, 2)}\n`);
  process.stdout.write(`\nsmokeSummary=${summaryPath}\n`);
}

function buildCampaignManifest(options) {
  const runId = options['run-id'] || `campaign-${isoStamp()}`;
  const rootDir = ensureDir(path.join(CAMPAIGN_ROOT, runId));
  const manifestPath = path.join(rootDir, 'manifest.json');
  const symbols = parseList(options.symbols, DEFAULT_CAMPAIGN_SYMBOLS);
  const strategies = parseList(options.strategies, ALL_STRATEGIES);
  const profiles = parseList(options.profiles, [DEFAULT_BASELINE_PROFILE, DEFAULT_TREY_PROFILE]);
  const phase = options.phase || DEFAULT_PHASE;
  const feeProfileName = resolveFeeProfile(options['fee-profile'] || DEFAULT_FEE_PROFILE).name;
  const planned = [];

  for (const profile of profiles) {
    resolveTuningProfile(profile);
    for (const symbol of symbols) {
      if (!DATA_SHORTCUTS[symbol]) {
        throw new Error(`Unknown campaign symbol shortcut '${symbol}'`);
      }
      for (const strategy of strategies) {
        planned.push({
          id: safeName(`${profile}-${symbol}-${strategy}-${phase}`),
          profile,
          symbol,
          strategy,
          phase,
          feeProfileName,
          command: [
            process.execPath,
            'tools/matrix-sweep.js',
            `--data=${symbol}`,
            `--solo=${strategy}`,
            `--phase=${phase}`,
            `--profile=${profile}`,
            `--fee-profile=${feeProfileName}`,
          ],
          status: 'planned',
          attempts: 0,
          logPath: path.join(rootDir, 'logs', `${safeName(`${profile}-${symbol}-${strategy}-${phase}`)}.log`),
          statusPath: path.join(rootDir, 'status', `${safeName(`${profile}-${symbol}-${strategy}-${phase}`)}.json`),
          artifactDir: path.join(rootDir, 'artifacts', safeName(`${profile}-${symbol}-${strategy}-${phase}`)),
          integrityPath: path.join(rootDir, 'integrity', `${safeName(`${profile}-${symbol}-${strategy}-${phase}`)}.json`),
          integrity: null,
        });
      }
    }
  }

  const manifest = {
    runId,
    rootDir,
    manifestPath,
    heartbeatPath: path.join(rootDir, 'heartbeat.json'),
    generatedAt: new Date().toISOString(),
    doneAt: null,
    status: 'planned',
    continueOnFailure: true,
    resumeFromManifest: true,
    counts: { planned: planned.length, done: 0, failed: 0, running: 0 },
    planned,
  };
  writeJson(manifestPath, manifest);
  writeHeartbeat(manifest, 'planned');
  return manifest;
}

function writeHeartbeat(manifest, event, currentRun = null) {
  const counts = summarizeManifest(manifest);
  const heartbeat = {
    event,
    updatedAt: new Date().toISOString(),
    runId: manifest.runId,
    status: manifest.status,
    counts,
    currentRun,
    manifestPath: manifest.manifestPath,
  };
  writeJson(manifest.heartbeatPath, heartbeat);
}

function summarizeManifest(manifest) {
  const counts = { planned: 0, running: 0, done: 0, failed: 0, skipped: 0, 'FAILED-INTEGRITY': 0 };
  for (const run of manifest.planned || []) {
    counts[run.status] = (counts[run.status] || 0) + 1;
  }
  return counts;
}

function renderIntegrityMark(value) {
  if (value === true) return '✓';
  if (value === false) return '✗';
  return '-';
}

function renderCampaignStatus(manifest) {
  const lines = [];
  lines.push('run | trades | identity | lifecycle | fields | coverage | schema | status');
  for (const run of manifest.planned || []) {
    const checks = run.integrity?.checks || {};
    lines.push([
      run.id,
      run.integrity?.trades ?? '-',
      renderIntegrityMark(checks.identity),
      renderIntegrityMark(checks.lifecycle),
      renderIntegrityMark(checks.fields),
      renderIntegrityMark(checks.coverage),
      renderIntegrityMark(checks.schema),
      run.status,
    ].join(' | '));
  }
  lines.push('');
  lines.push('aggregate | count');
  const counts = summarizeManifest(manifest);
  for (const [status, count] of Object.entries(counts)) {
    lines.push(`${status} | ${count}`);
  }
  return lines.join('\n');
}

function writeCampaignStatus(manifest) {
  const statusPath = path.join(manifest.rootDir, 'campaign-status.md');
  fs.writeFileSync(statusPath, `${renderCampaignStatus(manifest)}\n`);
  return statusPath;
}

async function launchCampaign(options) {
  const manifestPath = options.manifest
    ? path.resolve(PROJECT_ROOT, options.manifest)
    : null;
  if (!manifestPath) throw new Error('launch requires --manifest=<path>');
  const manifest = readJson(manifestPath);
  manifest.manifestPath = manifestPath;
  manifest.status = 'running';
  manifest.startedAt = manifest.startedAt || new Date().toISOString();
  writeHeartbeat(manifest, 'campaign_started');

  for (const run of manifest.planned) {
    if (options.resume && run.status === 'done' && run.integrity?.status === 'PASS') {
      continue;
    }
    if (options.resume && run.status === 'failed') {
      continue;
    }
    run.status = 'running';
    run.startedAt = new Date().toISOString();
    run.attempts = (run.attempts || 0) + 1;
    run.artifactDir = run.artifactDir || path.join(manifest.rootDir, 'artifacts', run.id);
    run.integrityPath = run.integrityPath || path.join(manifest.rootDir, 'integrity', `${run.id}.json`);
    writeJson(manifestPath, { ...manifest, counts: summarizeManifest(manifest) });
    writeCampaignStatus(manifest);
    writeHeartbeat(manifest, 'run_started', run);
    const status = await runNodeProcess({
      args: run.command.slice(1),
      env: {
        ...process.env,
        BACKTEST_OUTPUT_DIR: run.artifactDir,
      },
      logPath: run.logPath,
      statusPath: run.statusPath,
      label: run.id,
    });
    run.status = status.exitCode === 0 ? 'done' : 'failed';
    run.finishedAt = status.finishedAt;
    run.exitCode = status.exitCode;
    run.signal = status.signal;
    run.matrixReportPath = null;
    run.integrity = null;
    if (status.exitCode === 0) {
      const matrixReportPath = findLatestMatrixReport(run.artifactDir);
      if (!matrixReportPath) {
        run.status = 'FAILED-INTEGRITY';
        run.integrity = {
          status: 'FAILED-INTEGRITY',
          trades: 0,
          checks: { identity: false, lifecycle: false, fields: false, coverage: false, schema: false },
          errors: ['matrix report missing'],
        };
      } else {
        run.matrixReportPath = matrixReportPath;
        const stamp = validateMatrixRun({
          matrixReportPath,
          outputDir: run.artifactDir,
        });
        writeJson(run.integrityPath, stamp);
        run.integrity = {
          status: stamp.status,
          trades: stamp.trades,
          checks: stamp.checks,
          path: run.integrityPath,
        };
        if (stamp.status !== 'PASS') {
          run.status = 'FAILED-INTEGRITY';
        }
      }
    }
    writeJson(manifestPath, { ...manifest, counts: summarizeManifest(manifest) });
    writeCampaignStatus(manifest);
    writeHeartbeat(manifest, 'run_finished', run);
  }

  manifest.status = manifest.planned.some(run => run.status === 'failed' || run.status === 'FAILED-INTEGRITY')
    ? 'done_with_failures'
    : 'done';
  manifest.doneAt = new Date().toISOString();
  manifest.counts = summarizeManifest(manifest);
  writeJson(manifestPath, manifest);
  writeCampaignStatus(manifest);
  writeHeartbeat(manifest, 'campaign_finished');
  return manifest;
}

function showCampaignStatus(options) {
  const manifestPath = options.manifest
    ? path.resolve(PROJECT_ROOT, options.manifest)
    : null;
  if (!manifestPath) throw new Error('status requires --manifest=<path>');
  const manifest = readJson(manifestPath);
  manifest.manifestPath = manifestPath;
  process.stdout.write(`${renderCampaignStatus(manifest)}\n`);
}

async function main() {
  const { command, options } = parseArgs(process.argv);
  if (!command || command === '--help' || command === 'help') usage(0);
  if (command === 'smoke') {
    await runSmoke(options);
    return;
  }
  if (command === 'plan') {
    const manifest = buildCampaignManifest(options);
    process.stdout.write(`manifest=${manifest.manifestPath}\nheartbeat=${manifest.heartbeatPath}\nplanned=${manifest.planned.length}\n`);
    return;
  }
  if (command === 'launch') {
    const manifest = await launchCampaign(options);
    process.stdout.write(`manifest=${manifest.manifestPath}\nheartbeat=${manifest.heartbeatPath}\nstatus=${manifest.status}\n`);
    return;
  }
  if (command === 'status') {
    showCampaignStatus(options);
    return;
  }
  usage(1);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  buildCampaignManifest,
  countStrategyEvidence,
  countFrozenAtrPolicies,
  resolveDataFile,
  strategyEnv,
};
