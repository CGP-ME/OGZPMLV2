#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_TOP = 10;
const DEFAULT_SAMPLES = 3;
const REQUIRED_SCOPE_FIELDS = ['brokerId', 'assetClass', 'timeframe', 'executionMode'];

function usage() {
  return [
    'Usage:',
    '  node tools/decision-autopsy-report.js --latest',
    '  node tools/decision-autopsy-report.js --file logs/decisions/autopsy_2026-06-29.jsonl',
    '  node tools/decision-autopsy-report.js --date 2026-06-29 --json',
    '',
    'Summarizes decision_autopsy JSONL into trade visibility and tuning evidence:',
    'take/skip/exit reasons, failed gates, strategy winners, confidence contributors, MTF coverage, and schema health.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = { top: DEFAULT_TOP, samples: DEFAULT_SAMPLES };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--latest') {
      args.latest = true;
      continue;
    }
    if (arg === '--json') {
      args.json = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    if (key === 'top' || key === 'samples') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`--${key} must be a positive integer`);
      }
      args[key] = parsed;
    } else {
      args[key] = value;
    }
    i += 1;
  }
  return args;
}

function inc(map, key, by = 1) {
  const normalized = key === undefined || key === null || key === '' ? '(missing)' : String(key);
  map.set(normalized, (map.get(normalized) || 0) + by);
}

function topMap(map, limit) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function addSample(samples, key, record, limit) {
  if (!samples[key]) samples[key] = [];
  if (samples[key].length >= limit) return;
  samples[key].push(compactRecord(record));
}

function compactRecord(record) {
  const decision = record.decision || {};
  const orchestrator = record.orchestratorDecision || {};
  const minGate = record.gates?.minConfidence || null;
  return {
    traceId: record.traceId || null,
    persistedAt: record._persistedAt || null,
    candleTimestamp: record.candleTimestamp ?? null,
    symbol: record.symbol || null,
    originalSymbol: record.originalSymbol || null,
    source: record.source || null,
    status: record.status || null,
    action: decision.action || null,
    direction: decision.direction || null,
    confidence: decision.confidence ?? null,
    skipReason: record.skipReason || null,
    exitReason: decision.exitReason || null,
    winnerStrategy: orchestrator.winnerStrategy || null,
    finalConfidence: orchestrator.finalConfidence ?? null,
    minConfidenceGate: minGate,
    failedRiskGates: Array.isArray(record.gates?.failedRiskGates)
      ? record.gates.failedRiskGates.map(gate => gate.gate || '(missing)')
      : [],
    exitEvaluations: Array.isArray(record.exitEvaluations)
      ? record.exitEvaluations.map(evaluation => ({
        checker: evaluation.checker || null,
        shouldExit: evaluation.shouldExit ?? null,
        exitReason: evaluation.exitReason || null,
        confidence: evaluation.confidence ?? null,
      }))
      : [],
    mtfConfluenceSnapshot: record.mtfConfluenceSnapshot
      ? {
        available: record.mtfConfluenceSnapshot.available ?? null,
        unavailableReason: record.mtfConfluenceSnapshot.unavailableReason || null,
        direction: record.mtfConfluenceSnapshot.direction || null,
        confidence: record.mtfConfluenceSnapshot.confidence ?? null,
        confluenceScore: record.mtfConfluenceSnapshot.confluenceScore ?? null,
        readyTimeframes: record.mtfConfluenceSnapshot.readyTimeframes || [],
      }
      : null,
  };
}

function createReport(file, opts = {}) {
  return {
    file,
    generatedAt: new Date().toISOString(),
    options: {
      top: opts.top || DEFAULT_TOP,
      samples: opts.samples || DEFAULT_SAMPLES,
    },
    summary: {
      lines: 0,
      records: 0,
      badJson: 0,
      decisionAutopsyRecords: 0,
      firstPersistedAt: null,
      lastPersistedAt: null,
    },
    counts: {
      status: new Map(),
      source: new Map(),
      action: new Map(),
      symbol: new Map(),
      winnerStrategy: new Map(),
      skipReason: new Map(),
      decisionExitReason: new Map(),
      exitChecker: new Map(),
      exitCheckerReason: new Map(),
      failedGate: new Map(),
      passedGate: new Map(),
      confidenceContributor: new Map(),
      mtfAvailability: new Map(),
      mtfUnavailableReason: new Map(),
      mtfReadyTimeframe: new Map(),
      mtfDirection: new Map(),
    },
    quality: {
      missingScope: 0,
      missingOriginalSymbol: 0,
      missingStrategySignals: 0,
      malformedStrategyEvidence: 0,
      missingExitEvaluationsOnExit: 0,
      missingMtfSnapshot: 0,
      badJsonLines: [],
    },
    samples: {},
  };
}

function hasNormalizationError(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'normalizationError')) return true;
  if (Array.isArray(value)) return value.some(hasNormalizationError);
  return Object.values(value).some(hasNormalizationError);
}

function ingestGate(report, gate) {
  if (!gate || typeof gate !== 'object') return;
  const name = gate.gate || '(missing)';
  if (gate.passed === false) inc(report.counts.failedGate, name);
  if (gate.passed === true) inc(report.counts.passedGate, name);
}

function ingestRecord(report, record, opts = {}) {
  const sampleLimit = opts.samples || DEFAULT_SAMPLES;
  report.summary.records += 1;
  if (record?._type === 'decision_autopsy') report.summary.decisionAutopsyRecords += 1;

  const persistedAt = record?._persistedAt || record?.timestamp || null;
  if (persistedAt) {
    if (!report.summary.firstPersistedAt || persistedAt < report.summary.firstPersistedAt) {
      report.summary.firstPersistedAt = persistedAt;
    }
    if (!report.summary.lastPersistedAt || persistedAt > report.summary.lastPersistedAt) {
      report.summary.lastPersistedAt = persistedAt;
    }
  }

  inc(report.counts.status, record?.status);
  inc(report.counts.source, record?.source);
  inc(report.counts.action, record?.decision?.action);
  inc(report.counts.symbol, record?.symbol);
  inc(report.counts.winnerStrategy, record?.orchestratorDecision?.winnerStrategy);

  if (record?.skipReason) {
    inc(report.counts.skipReason, record.skipReason);
    addSample(report.samples, `skip:${record.skipReason}`, record, sampleLimit);
  }
  if (record?.decision?.exitReason) {
    inc(report.counts.decisionExitReason, record.decision.exitReason);
    addSample(report.samples, `exit:${record.decision.exitReason}`, record, sampleLimit);
  }

  const missingScope = REQUIRED_SCOPE_FIELDS.filter(field => !record?.[field]);
  if (missingScope.length > 0) {
    report.quality.missingScope += 1;
    addSample(report.samples, 'quality:missing_scope', record, sampleLimit);
  }
  if (!record?.originalSymbol) {
    report.quality.missingOriginalSymbol += 1;
    addSample(report.samples, 'quality:missing_original_symbol', record, sampleLimit);
  }
  if (!Array.isArray(record?.strategySignals) || record.strategySignals.length === 0) {
    report.quality.missingStrategySignals += 1;
  }
  if (hasNormalizationError(record?.strategySignals) || hasNormalizationError(record?.orchestratorDecision)) {
    report.quality.malformedStrategyEvidence += 1;
    addSample(report.samples, 'quality:normalization_error', record, sampleLimit);
  }

  const action = record?.decision?.action;
  const exitEvaluations = Array.isArray(record?.exitEvaluations) ? record.exitEvaluations : [];
  if ((action === 'SELL' || action === 'COVER') && exitEvaluations.length === 0) {
    report.quality.missingExitEvaluationsOnExit += 1;
    addSample(report.samples, 'quality:exit_without_evaluation', record, sampleLimit);
  }
  for (const evaluation of exitEvaluations) {
    inc(report.counts.exitChecker, evaluation?.checker);
    if (evaluation?.exitReason) inc(report.counts.exitCheckerReason, `${evaluation.checker || '(missing)'}:${evaluation.exitReason}`);
  }

  ingestGate(report, record?.gates?.minConfidence ? { gate: 'min_confidence', passed: record.gates.minConfidence.passed } : null);
  for (const gate of (record?.gates?.riskGates || [])) ingestGate(report, gate);
  for (const gate of (record?.gates?.failedRiskGates || [])) ingestGate(report, gate);

  for (const signal of (record?.strategySignals || [])) {
    const contributors = signal?.decisionAttribution?.contributors;
    if (!Array.isArray(contributors)) continue;
    for (const contributor of contributors) {
      inc(report.counts.confidenceContributor, contributor?.name || contributor?.source);
    }
  }

  const mtf = record?.mtfConfluenceSnapshot;
  if (mtf) {
    inc(report.counts.mtfAvailability, mtf.available === false ? 'unavailable' : 'available');
    if (mtf.available === false) inc(report.counts.mtfUnavailableReason, mtf.unavailableReason || '(missing)');
    inc(report.counts.mtfDirection, mtf.direction);
    for (const timeframe of (mtf.readyTimeframes || [])) inc(report.counts.mtfReadyTimeframe, timeframe);
    addSample(report.samples, 'mtf', record, sampleLimit);
  } else {
    report.quality.missingMtfSnapshot += 1;
  }

  if (record?.status === 'execute') addSample(report.samples, 'status:execute', record, sampleLimit);
  if (record?.status === 'skip') addSample(report.samples, 'status:skip', record, sampleLimit);
}

function finalizeReport(report) {
  const top = report.options.top;
  const counts = report.counts;
  report.counts = Object.fromEntries(Object.entries(counts).map(([name, map]) => [name, topMap(map, top)]));
  report.summary.scopeCompleteRecords = report.summary.records - report.quality.missingScope;
  report.summary.mtfCoveragePercent = report.summary.records > 0
    ? Number((((report.summary.records - report.quality.missingMtfSnapshot) / report.summary.records) * 100).toFixed(2))
    : 0;
  return report;
}

async function analyzeFile(file, opts = {}) {
  if (!file || !fs.existsSync(file)) {
    throw new Error(`Autopsy file not found: ${file}`);
  }
  const report = createReport(file, opts);
  const input = fs.createReadStream(file, 'utf8');
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of rl) {
    lineNumber += 1;
    if (!line.trim()) continue;
    report.summary.lines += 1;
    try {
      ingestRecord(report, JSON.parse(line), opts);
    } catch (error) {
      report.summary.badJson += 1;
      if (report.quality.badJsonLines.length < (opts.samples || DEFAULT_SAMPLES)) {
        report.quality.badJsonLines.push({ line: lineNumber, error: error.message });
      }
    }
  }
  return finalizeReport(report);
}

function latestAutopsyFile(dir = path.join('logs', 'decisions')) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Autopsy directory not found: ${dir}`);
  }
  const candidates = fs.readdirSync(dir)
    .filter(name => /^autopsy_\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .map(name => {
      const file = path.join(dir, name);
      return { file, mtimeMs: fs.statSync(file).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length === 0) {
    throw new Error(`No autopsy_YYYY-MM-DD.jsonl files found in ${dir}`);
  }
  return candidates[0].file;
}

function resolveInputFile(args) {
  if (args.file) return args.file;
  if (args.date) return path.join('logs', 'decisions', `autopsy_${args.date}.jsonl`);
  if (args.latest) return latestAutopsyFile();
  throw new Error(`Missing --file, --date, or --latest\n${usage()}`);
}

function renderText(report) {
  const lines = [];
  lines.push(`Decision Autopsy Report: ${report.file}`);
  lines.push(`Records: ${report.summary.records} | badJson: ${report.summary.badJson} | scopeComplete: ${report.summary.scopeCompleteRecords}`);
  lines.push(`Window: ${report.summary.firstPersistedAt || '(missing)'} -> ${report.summary.lastPersistedAt || '(missing)'}`);
  lines.push(`MTF coverage: ${report.summary.mtfCoveragePercent}%`);

  const section = (title, rows) => {
    lines.push('');
    lines.push(title);
    if (!rows || rows.length === 0) {
      lines.push('  (none)');
      return;
    }
    for (const row of rows) lines.push(`  ${row.key}: ${row.count}`);
  };

  section('Status', report.counts.status);
  section('Actions', report.counts.action);
  section('Skip Reasons', report.counts.skipReason);
  section('Decision Exit Reasons', report.counts.decisionExitReason);
  section('Exit Checkers', report.counts.exitChecker);
  section('Failed Gates', report.counts.failedGate);
  section('Winning Strategies', report.counts.winnerStrategy);
  section('Confidence Contributors', report.counts.confidenceContributor);
  section('MTF Availability', report.counts.mtfAvailability);
  section('MTF Unavailable Reasons', report.counts.mtfUnavailableReason);
  section('MTF Ready Timeframes', report.counts.mtfReadyTimeframe);

  lines.push('');
  lines.push('Quality');
  for (const [key, value] of Object.entries(report.quality)) {
    if (key === 'badJsonLines') continue;
    lines.push(`  ${key}: ${value}`);
  }

  lines.push('');
  lines.push('Samples');
  const sampleKeys = Object.keys(report.samples).sort();
  if (sampleKeys.length === 0) {
    lines.push('  (none)');
  } else {
    for (const key of sampleKeys) {
      lines.push(`  ${key}:`);
      for (const sample of report.samples[key]) {
        lines.push(`    ${JSON.stringify(sample)}`);
      }
    }
  }

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const file = resolveInputFile(args);
  const report = await analyzeFile(file, args);
  console.log(args.json ? JSON.stringify(report, null, 2) : renderText(report));
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[decision-autopsy-report] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  analyzeFile,
  createReport,
  finalizeReport,
  ingestRecord,
  latestAutopsyFile,
  parseArgs,
  renderText,
  resolveInputFile,
};
