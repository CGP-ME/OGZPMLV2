'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packet = path.resolve(__dirname, '..');
const fixedNow = Date.parse('2026-10-16T00:00:00.000Z');
const NativeDate = Date;

class FixedDate extends NativeDate {
  constructor(...args) {
    super(...(args.length === 0 ? [fixedNow] : args));
  }

  static now() {
    return fixedNow;
  }
}

global.Date = FixedDate;

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function effectiveConfig(internalsPath) {
  const settings = readJson(path.join(packet, 'fixtures/baseline/config/settings.json'));
  const internals = readJson(internalsPath);
  // This mirrors run-empire-v2.js:725-728: settings first, internals second.
  return { ...settings.performanceAnalysis, ...internals.performanceAnalysis };
}

function execute(label, internalsPath, analyzerPath) {
  const logs = [];
  const originalLog = console.log;
  console.log = (...parts) => logs.push(parts.join(' '));
  try {
    const PerformanceAnalyzer = require(analyzerPath);
    const analyzer = new PerformanceAnalyzer(effectiveConfig(internalsPath));
    const trades = [
      {
        entryPrice: 100,
        exitPrice: 104,
        entryTime: '2026-10-15T14:00:00.000Z',
        exitTime: '2026-10-15T15:00:00.000Z',
        pnl: 4,
        direction: 'buy',
        entryReason: 'synthetic_signal',
        exitReason: 'synthetic_target'
      },
      {
        entryPrice: 104,
        exitPrice: 102,
        entryTime: '2026-10-15T15:15:00.000Z',
        exitTime: '2026-10-15T15:45:00.000Z',
        pnl: -2,
        direction: 'sell',
        entryReason: 'synthetic_signal',
        exitReason: 'synthetic_stop'
      }
    ];
    const analysis = {
      patternEvaluation: { exactMatch: true, confidence: 0.8, direction: 'buy' },
      trend: 'uptrend',
      rsi: 25
    };
    const results = trades.map((trade) => analyzer.processTrade(trade, analysis));
    return { label, config: analyzer.config, results, state: analyzer.state, logs };
  } finally {
    console.log = originalLog;
  }
}

const baseline = execute(
  'baseline',
  path.join(packet, 'fixtures/baseline/config/internals.json'),
  path.join(packet, 'fixtures/baseline/core/PerformanceAnalyzer.js')
);
const candidate = execute(
  'candidate',
  path.join(packet, 'fixtures/candidate/config/internals.json'),
  path.join(packet, 'fixtures/candidate/core/PerformanceAnalyzer.js')
);

assert.equal(baseline.config.updateIntervalMs, 60000);
assert.equal(Object.hasOwn(candidate.config, 'updateIntervalMs'), false);
assert.deepEqual(candidate.results, baseline.results);
assert.deepEqual(candidate.state, baseline.state);
assert.ok(baseline.logs.some((line) => line.includes('Update interval: 60000ms')));
assert.equal(candidate.logs.some((line) => line.includes('Update interval:')), false);
assert.equal(fs.readFileSync(path.join(packet, 'fixtures/baseline/core/PerformanceAnalyzer.js'), 'utf8').includes('setInterval'), false);
assert.equal(fs.readFileSync(path.join(packet, 'fixtures/candidate/core/PerformanceAnalyzer.js'), 'utf8').includes('setInterval'), false);
assert.equal(fs.readFileSync(path.join(packet, 'fixtures/baseline/core/PerformanceAnalyzer.js'), 'utf8').includes('setTimeout'), false);
assert.equal(fs.readFileSync(path.join(packet, 'fixtures/candidate/core/PerformanceAnalyzer.js'), 'utf8').includes('setTimeout'), false);

process.stdout.write(`${JSON.stringify({
  result: 'pass',
  canonicalMerge: 'settings.performanceAnalysis then internals.performanceAnalysis',
  syntheticClosedTrades: 2,
  resultsIdentical: true,
  stateIdentical: true,
  baselineLoggedObsoleteInterval: true,
  candidateLoggedObsoleteInterval: false,
  analyzerContainsNoIntervalOrTimeoutTimer: true,
  limitation: 'Copied committed sources only; this does not start the application or exercise broker execution.'
}, null, 2)}\n`);
