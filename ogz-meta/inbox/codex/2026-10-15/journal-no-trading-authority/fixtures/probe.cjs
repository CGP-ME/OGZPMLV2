'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const sourcePath = path.join(root, 'core', 'TradeJournalBridge.js');
const source = process.env.REVIEW_TREE
  ? require('child_process').execFileSync('git', ['show', process.env.REVIEW_TREE + ':core/TradeJournalBridge.js'], { encoding: 'utf8' })
  : fs.readFileSync(sourcePath, 'utf8');
assert(!/\.pauseTrading\(|\.resumeTradingIfPausedBy\(/.test(source), 'proposed bridge has no trading pause/resume call');
assert(!/TRADE_JOURNAL_INFRASTRUCTURE_(HALTED|RECOVERED)/.test(source), 'proposed bridge has no halt/recovery telemetry');

const isolated = new Module(sourcePath, module);
isolated.filename = sourcePath;
isolated.paths = Module._nodeModulePaths(path.dirname(sourcePath));
isolated._compile(source, sourcePath);
const { TradeJournalBridge } = isolated.exports;
const calls = { pause: 0, resume: 0 };
const bridge = Object.create(TradeJournalBridge.prototype);
bridge.bot = {
  stateManager: {
    pauseTrading() { calls.pause += 1; },
    resumeTradingIfPausedBy() { calls.resume += 1; }
  },
  config: { evalTraceEnabled: false }
};
bridge._journalPersistenceFailureStreak = 0;
const record = { orderId: 'journal-probe-1', action: 'BUY', phase: 'entry', source: 'probe', context: { entry: { symbol: 'TSLA' } } };
const oldError = console.error;
const errors = [];
console.error = (...args) => errors.push(args.join(' '));
try {
  const failure = bridge._recordJournalPersistenceFailure(record, Object.assign(new Error('disk full'), { code: 'ENOSPC' }));
  assert.equal(failure.tradingAction, 'none');
  assert.equal(record.journalPersistenceStatus, 'failed');
  assert.equal(record.journalPersistenceErrorCode, 'ENOSPC');
  assert.equal(record.journalPersistenceFailureStreak, 1);
  assert.equal(errors.length, 1, 'persistence failure remains loud');
  assert.match(errors[0], /journal persistence failed 1 consecutive time\(s\): disk full/);
  assert.equal(calls.pause, 0, 'journal failure never pauses trading');
  const recovery = bridge._recordJournalPersistenceSuccess({ phase: 'entry', orderId: 'journal-probe-1', symbol: 'TSLA' });
  assert.equal(recovery.tradingAction, 'none');
  assert.equal(recovery.previousFailureStreak, 1);
  assert.equal(bridge._journalPersistenceFailureStreak, 0);
  assert.equal(calls.resume, 0, 'journal success never resumes trading');
} finally {
  console.error = oldError;
}
console.log(JSON.stringify({ pass: true, checks: ['actual proposed helper methods executed', 'failure remains loud with status/evidence', 'pauseTrading spy untouched', 'resumeTradingIfPausedBy spy untouched'], limits: ['no journal record write', 'no service, live runtime, or backtest invoked'] }));
