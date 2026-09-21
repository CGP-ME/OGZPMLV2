'use strict';

const fs = require('fs');
const path = require('path');
const {
  ALL_STRATEGIES,
} = require('./matrix-sweep');
const {
  assertLabIntegrity,
} = require('./campaign-integrity');

const DEFAULT_MIN_TRADES = 100;
const DEFAULT_REQUIRED_FEE_PROFILE = 'ttp_real';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function percent(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

function addBucket(target, key, trade) {
  const bucketKey = key || 'unknown';
  if (!target[bucketKey]) {
    target[bucketKey] = {
      count: 0,
      wins: 0,
      losses: 0,
      netPnl: 0,
      fees: 0,
    };
  }
  const bucket = target[bucketKey];
  const pnl = finiteNumber(trade.netPnlDollars);
  bucket.count += 1;
  bucket.netPnl += pnl;
  bucket.fees += finiteNumber(trade.feesDollars);
  if (pnl > 0) bucket.wins += 1;
  else if (pnl < 0) bucket.losses += 1;
}

function summarizeTrades(trades) {
  const summary = {
    totalTrades: trades.length,
    wins: 0,
    losses: 0,
    netPnl: 0,
    fees: 0,
    avgWin: 0,
    avgLoss: 0,
    avgHoldWinnerMinutes: 0,
    avgHoldLoserMinutes: 0,
    byExitReason: {},
    bySession: {},
    byConfidenceTier: {},
    byDirection: {},
  };

  let winPnl = 0;
  let lossPnl = 0;
  let winnerHold = 0;
  let loserHold = 0;

  for (const trade of trades) {
    const pnl = finiteNumber(trade.netPnlDollars);
    const hold = finiteNumber(trade.holdTimeMinutes);
    summary.netPnl += pnl;
    summary.fees += finiteNumber(trade.feesDollars);

    if (pnl > 0) {
      summary.wins += 1;
      winPnl += pnl;
      winnerHold += hold;
    } else if (pnl < 0) {
      summary.losses += 1;
      lossPnl += pnl;
      loserHold += hold;
    }

    addBucket(summary.byExitReason, trade.exitReason, trade);
    addBucket(summary.bySession, trade.session, trade);
    addBucket(summary.byConfidenceTier, trade.confidenceTier, trade);
    addBucket(summary.byDirection, trade.direction, trade);
  }

  summary.winRate = percent(summary.wins, summary.totalTrades);
  summary.avgWin = summary.wins ? winPnl / summary.wins : 0;
  summary.avgLoss = summary.losses ? lossPnl / summary.losses : 0;
  summary.avgHoldWinnerMinutes = summary.wins ? winnerHold / summary.wins : 0;
  summary.avgHoldLoserMinutes = summary.losses ? loserHold / summary.losses : 0;
  return summary;
}

function feeProfileNameFromReport(report, result = null) {
  return result?.feeProfile?.name
    || result?.workerEnv?.BACKTEST_FEE_PROFILE
    || report?.feeProfile?.name
    || report?.workerEnv?.BACKTEST_FEE_PROFILE
    || null;
}

function assertFeeProfile(filePath, report, result, requiredFeeProfile) {
  const feeProfile = feeProfileNameFromReport(report, result);
  if (feeProfile !== requiredFeeProfile) {
    throw new Error(
      `Strategy Lab requires fee profile ${requiredFeeProfile}; ${filePath} declares ${feeProfile || 'UNKNOWN'}`
    );
  }
}

function assertOptionalFeeProfile(filePath, report, requiredFeeProfile) {
  const feeProfile = feeProfileNameFromReport(report);
  if (feeProfile && feeProfile !== requiredFeeProfile) {
    throw new Error(
      `Strategy Lab requires fee profile ${requiredFeeProfile}; ${filePath} declares ${feeProfile}`
    );
  }
}

function normalizeRequiredFeeProfile(value) {
  const profile = value || DEFAULT_REQUIRED_FEE_PROFILE;
  if (profile !== DEFAULT_REQUIRED_FEE_PROFILE) {
    throw new Error(`Strategy Lab only supports ${DEFAULT_REQUIRED_FEE_PROFILE}; got ${profile}`);
  }
  return profile;
}

function normalizeMinTrades(value) {
  const number = Number(value ?? DEFAULT_MIN_TRADES);
  if (!Number.isInteger(number) || number < DEFAULT_MIN_TRADES) {
    throw new Error(`Strategy Lab minTrades must be an integer >= ${DEFAULT_MIN_TRADES}; got ${value}`);
  }
  return number;
}

function validateFeeEvidence(filePath, result, requiredFeeProfile) {
  const trades = finiteNumber(result?.trades);
  const fees = finiteNumber(result?.fees);
  if (requiredFeeProfile === 'ttp_real' && trades > 0 && fees <= 0) {
    throw new Error(
      `Strategy Lab requires nonzero ttp_real fee evidence; ${filePath} result ${result?.name || 'unknown'} has trades=${trades} fees=${fees}`
    );
  }
}

function validateWorkerFeeEvidence(filePath, trades, requiredFeeProfile) {
  if (requiredFeeProfile !== 'ttp_real') return;
  trades.forEach((trade, index) => {
    const fees = Number(trade?.feesDollars);
    if (!Number.isFinite(fees) || fees <= 0) {
      throw new Error(
        `Strategy Lab requires per-trade ttp_real fee evidence; ${filePath} trade[${index}] has feesDollars=${trade?.feesDollars ?? 'MISSING'}`
      );
    }
  });
}

function collectJsonFiles(inputPaths) {
  const files = [];
  for (const inputPath of inputPaths) {
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(inputPath)) {
        const child = path.join(inputPath, entry);
        if (fs.statSync(child).isFile() && entry.endsWith('.json')) files.push(child);
      }
    } else if (inputPath.endsWith('.json')) {
      files.push(inputPath);
    }
  }
  return files.sort();
}

function resolveReportPath(baseFilePath, reportPath) {
  if (!reportPath || typeof reportPath !== 'string') return null;
  if (path.isAbsolute(reportPath)) return reportPath;
  return path.resolve(path.dirname(baseFilePath), reportPath);
}

function emptyDossier(strategy) {
  return {
    strategy,
    verdict: 'NO_DATA',
    requiredNextAction: 'Run Strategy Lab sweep under ttp_real fee profile.',
    sampleGate: {
      minTrades: DEFAULT_MIN_TRADES,
      observedTrades: 0,
      passed: false,
    },
    matrix: {
      configsTested: 0,
      profitableConfigs: 0,
      profitableConfigRate: 0,
      best: null,
      median: null,
      worst: null,
    },
    trades: summarizeTrades([]),
    evidence: [],
  };
}

function normalizeMatrixResult(result) {
  const hasWorkerReportPointer = typeof result.reportPath === 'string' && result.reportPath.trim().length > 0;
  return {
    name: result.name || null,
    strategy: result.strategy || 'unknown',
    netPnl: finiteNumber(result.netPnl),
    trades: finiteNumber(result.trades),
    winRate: finiteNumber(result.winRate),
    profitFactor: finiteNumber(result.profitFactor),
    expectancy: finiteNumber(result.expectancy),
    maxDrawdown: result.maxDrawdown == null ? null : finiteNumber(result.maxDrawdown),
    fees: finiteNumber(result.fees),
    confidence: result.conf ?? null,
    lockedStopLoss: result.lockedSL ?? null,
    tiers: result.tiers || null,
    reportPath: result.reportPath || null,
    hasWorkerReportPointer,
    countsTowardSampleGate: false,
  };
}

function applyMatrixReport(dossiers, report, filePath, requiredFeeProfile, loadedWorkerReports) {
  assertLabIntegrity(filePath, report);
  assertFeeProfile(filePath, report, null, requiredFeeProfile);
  for (const result of ensureArray(report.results)) {
    assertFeeProfile(filePath, report, result, requiredFeeProfile);
    validateFeeEvidence(filePath, result, requiredFeeProfile);
    if (finiteNumber(result.trades) > 0) {
      const workerReportPath = resolveReportPath(filePath, result.reportPath);
      if (!workerReportPath) {
        throw new Error(`Strategy Lab matrix result ${result.name || 'unknown'} requires reportPath for ${result.trades} reported trades`);
      }
      if (!fs.existsSync(workerReportPath)) {
        throw new Error(`Strategy Lab matrix result ${result.name || 'unknown'} reportPath not found: ${workerReportPath}`);
      }
      const workerReportKey = path.resolve(workerReportPath);
      if (!loadedWorkerReports.has(workerReportKey)) {
        applyWorkerReport(dossiers, readJson(workerReportPath), workerReportPath, requiredFeeProfile, {
          allowMissingFeeProfile: true,
        });
        loadedWorkerReports.add(workerReportKey);
      }
    }
    const strategy = result.strategy || 'unknown';
    if (!dossiers[strategy]) dossiers[strategy] = emptyDossier(strategy);
    const dossier = dossiers[strategy];
    const normalized = normalizeMatrixResult(result);
    if (!dossier._matrixResults) dossier._matrixResults = [];
    dossier._matrixResults.push(normalized);
    dossier.evidence.push({
      type: 'matrix_result',
      path: filePath,
      config: normalized.name,
      trades: normalized.trades,
      netPnl: normalized.netPnl,
      fees: normalized.fees,
    });
  }
}

function applyWorkerReport(dossiers, report, filePath, requiredFeeProfile, options = {}) {
  assertLabIntegrity(filePath, report);
  if (!options.allowMissingFeeProfile) {
    assertFeeProfile(filePath, report, null, requiredFeeProfile);
  } else {
    assertOptionalFeeProfile(filePath, report, requiredFeeProfile);
  }
  if (!Array.isArray(report.trades) || report.trades.length === 0) {
    throw new Error(`Strategy Lab worker report requires non-empty trades array: ${filePath}`);
  }
  validateWorkerFeeEvidence(filePath, ensureArray(report.trades), requiredFeeProfile);
  const tradesByStrategy = {};
  for (const trade of ensureArray(report.trades)) {
    const strategy = trade.strategyName || trade.strategy || 'unknown';
    if (!tradesByStrategy[strategy]) tradesByStrategy[strategy] = [];
    tradesByStrategy[strategy].push(trade);
  }

  for (const [strategy, trades] of Object.entries(tradesByStrategy)) {
    if (!dossiers[strategy]) dossiers[strategy] = emptyDossier(strategy);
    const dossier = dossiers[strategy];
    if (!dossier._trades) dossier._trades = [];
    dossier._trades.push(...trades);
    const tradeSummary = summarizeTrades(trades);
    dossier.evidence.push({
      type: 'worker_report',
      path: filePath,
      trades: trades.length,
      netPnl: tradeSummary.netPnl,
      fees: tradeSummary.fees,
    });
  }
}

function finalizeMatrix(dossier) {
  const results = ensureArray(dossier._matrixResults)
    .sort((a, b) => b.netPnl - a.netPnl);
  if (results.length === 0) return;

  const profitable = results.filter(result => result.netPnl > 0);
  dossier.matrix = {
    configsTested: results.length,
    profitableConfigs: profitable.length,
    profitableConfigRate: percent(profitable.length, results.length),
    best: results[0],
    median: results[Math.floor(results.length / 2)],
    worst: results[results.length - 1],
  };
}

function decideVerdict(dossier, minTrades) {
  const observedTrades = dossier.trades.totalTrades;

  dossier.sampleGate = {
    minTrades,
    observedTrades,
    passed: observedTrades >= minTrades,
  };

  if (observedTrades < minTrades) {
    dossier.verdict = 'INSUFFICIENT_SAMPLE';
    dossier.requiredNextAction = `Run more ttp_real backtests until ${minTrades}+ trades exist for ${dossier.strategy}.`;
    return;
  }

  const best = dossier.matrix.best;
  const median = dossier.matrix.median;
  if (best && best.netPnl > 0 && median && median.netPnl > 0 && dossier.matrix.profitableConfigRate >= 50) {
    dossier.verdict = 'KEEP_CANDIDATE';
    dossier.requiredNextAction = 'Validate best config on unseen data before roster promotion.';
    return;
  }

  if ((!best || best.netPnl <= 0) && dossier.matrix.profitableConfigRate < 20) {
    dossier.verdict = 'KILL_CANDIDATE';
    dossier.requiredNextAction = 'Bench or rebuild; do not activate without a new dossier.';
    return;
  }

  dossier.verdict = 'REBUILD_CANDIDATE';
  dossier.requiredNextAction = 'Rebuild entries/exits one variable class at a time and regenerate dossier.';
}

function buildStrategyLab(inputPaths, options = {}) {
  const requiredFeeProfile = normalizeRequiredFeeProfile(options.requiredFeeProfile);
  const minTrades = normalizeMinTrades(options.minTrades);
  const files = collectJsonFiles(inputPaths);
  const dossiers = {};
  const loadedWorkerReports = new Set();

  for (const strategy of ALL_STRATEGIES) {
    dossiers[strategy] = emptyDossier(strategy);
  }

  const parsedReports = files.map(file => ({
    file,
    fileKey: path.resolve(file),
    report: readJson(file),
  }));

  for (const { file, report } of parsedReports) {
    if (Array.isArray(report.results)) {
      applyMatrixReport(dossiers, report, file, requiredFeeProfile, loadedWorkerReports);
    }
  }

  for (const { file, fileKey, report } of parsedReports) {
    if (loadedWorkerReports.has(fileKey)) continue;
    if (Array.isArray(report.trades)) {
      throw new Error(`Strategy Lab worker report must be linked by matrix reportPath before it can support a dossier: ${file}`);
    }
  }

  for (const dossier of Object.values(dossiers)) {
    if (dossier._trades) dossier.trades = summarizeTrades(dossier._trades);
    finalizeMatrix(dossier);
    decideVerdict(dossier, minTrades);
    delete dossier._matrixResults;
    delete dossier._trades;
  }

  return {
    generatedAt: new Date().toISOString(),
    requiredFeeProfile,
    minTrades,
    sourceFiles: files,
    dossiers,
  };
}

function tableRowsFromBuckets(buckets) {
  return Object.entries(buckets)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, stats]) => `| ${name} | ${stats.count} | ${stats.wins} | ${stats.losses} | ${stats.netPnl.toFixed(2)} | ${stats.fees.toFixed(2)} |`)
    .join('\n');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Strategy Lab Dossiers');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Required fee profile: ${report.requiredFeeProfile}`);
  lines.push(`Min sample gate: ${report.minTrades} trades`);
  lines.push('');
  lines.push('| Strategy | Verdict | Sample | Best Net P&L | Median Net P&L | Profitable Configs | Trade Net P&L | WR |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const dossier of Object.values(report.dossiers)) {
    const best = dossier.matrix.best;
    const median = dossier.matrix.median;
    lines.push([
      `| ${dossier.strategy}`,
      dossier.verdict,
      `${dossier.sampleGate.observedTrades}/${dossier.sampleGate.minTrades}`,
      best ? best.netPnl.toFixed(2) : '',
      median ? median.netPnl.toFixed(2) : '',
      `${dossier.matrix.profitableConfigs}/${dossier.matrix.configsTested}`,
      dossier.trades.netPnl.toFixed(2),
      `${dossier.trades.winRate.toFixed(1)}% |`,
    ].join(' | '));
  }

  for (const dossier of Object.values(report.dossiers)) {
    lines.push('');
    lines.push(`## ${dossier.strategy}`);
    lines.push('');
    lines.push(`Verdict: ${dossier.verdict}`);
    lines.push(`Required next action: ${dossier.requiredNextAction}`);
    lines.push(`Sample gate: ${dossier.sampleGate.observedTrades}/${dossier.sampleGate.minTrades} trades`);
    if (dossier.matrix.best) {
      lines.push(`Best config: ${dossier.matrix.best.name || 'unknown'} netPnl=${dossier.matrix.best.netPnl.toFixed(2)} trades=${dossier.matrix.best.trades}`);
    }
    lines.push(`Trades: ${dossier.trades.totalTrades}, WR=${dossier.trades.winRate.toFixed(1)}%, netPnl=${dossier.trades.netPnl.toFixed(2)}, fees=${dossier.trades.fees.toFixed(2)}`);
    lines.push(`Hold asymmetry: winners=${dossier.trades.avgHoldWinnerMinutes.toFixed(1)}m, losers=${dossier.trades.avgHoldLoserMinutes.toFixed(1)}m`);
    lines.push('');
    lines.push('Evidence:');
    for (const item of dossier.evidence) {
      const details = [
        item.config ? `config=${item.config}` : null,
        item.trades != null ? `trades=${item.trades}` : null,
        item.netPnl != null ? `netPnl=${Number(item.netPnl).toFixed(2)}` : null,
        item.fees != null ? `fees=${Number(item.fees).toFixed(2)}` : null,
      ].filter(Boolean).join(', ');
      lines.push(`- ${item.type}: ${item.path}${details ? ` (${details})` : ''}`);
    }
    lines.push('');
    lines.push('Exit reasons:');
    lines.push('| Exit | Count | Wins | Losses | Net P&L | Fees |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    lines.push(tableRowsFromBuckets(dossier.trades.byExitReason) || '| none | 0 | 0 | 0 | 0.00 | 0.00 |');
  }

  return lines.join('\n') + '\n';
}

function writeStrategyLab(report, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `strategy-lab-${stamp}.json`);
  const mdPath = path.join(outDir, `strategy-lab-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}

function parseArgs(argv) {
  const args = {
    inputs: [],
    outDir: path.join(process.cwd(), 'backtest-results', 'strategy-lab'),
    minTrades: DEFAULT_MIN_TRADES,
    requiredFeeProfile: DEFAULT_REQUIRED_FEE_PROFILE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) args.inputs.push(argv[++i]);
    else if (arg.startsWith('--input=')) args.inputs.push(arg.slice('--input='.length));
    else if (arg === '--out-dir' && argv[i + 1]) args.outDir = argv[++i];
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length);
    else if (arg === '--min-trades' && argv[i + 1]) args.minTrades = Number(argv[++i]);
    else if (arg.startsWith('--min-trades=')) args.minTrades = Number(arg.slice('--min-trades='.length));
    else if (arg === '--fee-profile' && argv[i + 1]) args.requiredFeeProfile = argv[++i];
    else if (arg.startsWith('--fee-profile=')) args.requiredFeeProfile = arg.slice('--fee-profile='.length);
    else if (arg === '--help') {
      console.log('Usage: node tools/strategy-lab.js --input backtest-results/matrix-run.json --fee-profile=ttp_real');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.inputs.length === 0) {
    throw new Error('Strategy Lab requires at least one --input report path or directory.');
  }
  args.requiredFeeProfile = normalizeRequiredFeeProfile(args.requiredFeeProfile);
  args.minTrades = normalizeMinTrades(args.minTrades);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildStrategyLab(args.inputs, {
    minTrades: args.minTrades,
    requiredFeeProfile: args.requiredFeeProfile,
  });
  const written = writeStrategyLab(report, args.outDir);
  console.log(`Strategy Lab JSON: ${written.jsonPath}`);
  console.log(`Strategy Lab Markdown: ${written.mdPath}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Strategy Lab failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_MIN_TRADES,
  DEFAULT_REQUIRED_FEE_PROFILE,
  buildStrategyLab,
  renderMarkdown,
  writeStrategyLab,
  summarizeTrades,
  collectJsonFiles,
  normalizeRequiredFeeProfile,
  normalizeMinTrades,
};
