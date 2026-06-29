'use strict';

const fs = require('fs');
const path = require('path');

const {
  analyzeFile,
  latestAutopsyFile,
  parseArgs,
  resolveInputFile,
} = require('../tools/decision-autopsy-report');

const TEST_ROOT = path.join(__dirname, '..', 'data', 'test-decision-autopsy-report');

function freshDir(name) {
  const dir = path.join(TEST_ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJsonl(file, records) {
  fs.writeFileSync(file, records.map(record => (
    typeof record === 'string' ? record : JSON.stringify(record)
  )).join('\n') + '\n');
}

function countFor(rows, key) {
  const row = rows.find(item => item.key === key);
  return row ? row.count : 0;
}

describe('decision-autopsy-report', () => {
  const runDirs = [];

  afterAll(() => {
    for (const dir of runDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    try {
      fs.rmdirSync(TEST_ROOT);
    } catch (_error) {
      // Leave the parent when another focused run still owns files in it.
    }
  });

  test('summarizes execution, skips, exits, gates, contributors, MTF, and schema health', async () => {
    const dir = freshDir('summary');
    runDirs.push(dir);
    const file = path.join(dir, 'autopsy_2026-06-29.jsonl');
    writeJsonl(file, [
      {
        _type: 'decision_autopsy',
        _persistedAt: '2026-06-29T14:00:00.000Z',
        traceId: 'buy-1',
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'backtest',
        source: 'backtest',
        symbol: 'TSLA',
        originalSymbol: 'TSLA',
        status: 'execute',
        decision: { action: 'BUY', direction: 'long', confidence: 82 },
        orchestratorDecision: { winnerStrategy: 'EMA', finalConfidence: 82 },
        gates: {
          minConfidence: { passed: true },
          riskGates: [{ gate: 'kill_switch', passed: true }],
        },
        strategySignals: [{
          name: 'EMA',
          decisionAttribution: {
            contributors: [
              { name: 'strategy_signal', value: 72 },
              { source: 'mtf_confluence', value: 10 },
            ],
          },
        }],
        mtfConfluenceSnapshot: {
          direction: 'long',
          confidence: 10,
          confluenceScore: 0.4,
          readyTimeframes: ['15m', '1h'],
        },
      },
      {
        _type: 'decision_autopsy',
        _persistedAt: '2026-06-29T14:15:00.000Z',
        traceId: 'skip-1',
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'backtest',
        source: 'backtest',
        symbol: 'TSLA',
        originalSymbol: 'TSLA',
        status: 'skip',
        skipReason: 'below_min_confidence',
        decision: { action: 'HOLD', confidence: 48 },
        orchestratorDecision: { winnerStrategy: 'RSI', finalConfidence: 48 },
        gates: {
          minConfidence: { passed: false },
          failedRiskGates: [{ gate: 'daily_loss_limit', passed: false }],
        },
        strategySignals: [{
          name: 'RSI',
          decisionAttribution: {
            contributors: [{ name: 'strategy_signal', value: 48 }],
          },
        }],
      },
      {
        _type: 'decision_autopsy',
        _persistedAt: '2026-06-29T14:30:00.000Z',
        traceId: 'sell-1',
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'backtest',
        source: 'backtest',
        symbol: 'TSLA',
        originalSymbol: 'TSLA',
        status: 'execute',
        decision: { action: 'SELL', direction: 'long', confidence: 91, exitReason: 'take_profit' },
        orchestratorDecision: { winnerStrategy: 'EMA', finalConfidence: 91 },
        strategySignals: [{
          name: 'EMA',
          decisionAttribution: {
            contributors: [{ name: 'strategy_signal', value: 91 }],
          },
        }],
        exitEvaluations: [{
          checker: 'exit_contract_manager',
          shouldExit: true,
          exitReason: 'take_profit',
          confidence: 91,
        }],
      },
      '{ bad json',
    ]);

    const report = await analyzeFile(file, { top: 20, samples: 2 });

    expect(report.summary).toEqual(expect.objectContaining({
      lines: 4,
      records: 3,
      badJson: 1,
      decisionAutopsyRecords: 3,
      scopeCompleteRecords: 3,
      mtfCoveragePercent: 33.33,
      firstPersistedAt: '2026-06-29T14:00:00.000Z',
      lastPersistedAt: '2026-06-29T14:30:00.000Z',
    }));
    expect(countFor(report.counts.status, 'execute')).toBe(2);
    expect(countFor(report.counts.action, 'BUY')).toBe(1);
    expect(countFor(report.counts.action, 'SELL')).toBe(1);
    expect(countFor(report.counts.skipReason, 'below_min_confidence')).toBe(1);
    expect(countFor(report.counts.decisionExitReason, 'take_profit')).toBe(1);
    expect(countFor(report.counts.exitChecker, 'exit_contract_manager')).toBe(1);
    expect(countFor(report.counts.exitCheckerReason, 'exit_contract_manager:take_profit')).toBe(1);
    expect(countFor(report.counts.failedGate, 'min_confidence')).toBe(1);
    expect(countFor(report.counts.failedGate, 'daily_loss_limit')).toBe(1);
    expect(countFor(report.counts.passedGate, 'min_confidence')).toBe(1);
    expect(countFor(report.counts.confidenceContributor, 'strategy_signal')).toBe(3);
    expect(countFor(report.counts.confidenceContributor, 'mtf_confluence')).toBe(1);
    expect(countFor(report.counts.mtfReadyTimeframe, '15m')).toBe(1);
    expect(countFor(report.counts.mtfReadyTimeframe, '1h')).toBe(1);
    expect(countFor(report.counts.mtfDirection, 'long')).toBe(1);
    expect(report.quality).toEqual(expect.objectContaining({
      missingScope: 0,
      missingOriginalSymbol: 0,
      missingStrategySignals: 0,
      missingExitEvaluationsOnExit: 0,
      missingMtfSnapshot: 2,
      badJsonLines: [{ line: 4, error: expect.any(String) }],
    }));
    expect(report.samples['status:execute']).toHaveLength(2);
    expect(report.samples['skip:below_min_confidence'][0]).toEqual(expect.objectContaining({
      traceId: 'skip-1',
      skipReason: 'below_min_confidence',
    }));
    expect(report.samples.mtf[0].mtfConfluenceSnapshot.readyTimeframes).toEqual(['15m', '1h']);
  });

  test('finds the latest autopsy file by modification time', () => {
    const dir = freshDir('latest');
    runDirs.push(dir);
    const older = path.join(dir, 'autopsy_2026-06-28.jsonl');
    const newer = path.join(dir, 'autopsy_2026-06-29.jsonl');
    fs.writeFileSync(older, '{}\n');
    fs.writeFileSync(newer, '{}\n');
    fs.utimesSync(older, new Date('2026-06-28T12:00:00.000Z'), new Date('2026-06-28T12:00:00.000Z'));
    fs.utimesSync(newer, new Date('2026-06-29T12:00:00.000Z'), new Date('2026-06-29T12:00:00.000Z'));

    expect(latestAutopsyFile(dir)).toBe(newer);
  });

  test('parses CLI arguments and resolves date-based file paths', () => {
    const args = parseArgs([
      'node',
      'tools/decision-autopsy-report.js',
      '--date',
      '2026-06-29',
      '--json',
      '--top',
      '5',
      '--samples',
      '1',
    ]);

    expect(args).toEqual({
      date: '2026-06-29',
      json: true,
      top: 5,
      samples: 1,
    });
    expect(resolveInputFile(args)).toBe(path.join('logs', 'decisions', 'autopsy_2026-06-29.jsonl'));
  });
});
