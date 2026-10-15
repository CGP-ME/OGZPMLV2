'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const adapterHashes = require('../adapter-hashes.json');
const readSource = file => process.env.REVIEW_TREE
  ? require('child_process').execFileSync('git', ['show', process.env.REVIEW_TREE + ':' + file], { encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');
const beforeFlags = fs.readdirSync(root).filter((name) => name.startsWith('.broker-auth-quarantine-')).sort();
const { subscribeTrace } = require(path.join(root, 'core', 'TraceSpine'));
const Module = require('module');
const filename = path.join(root, 'core/AuthFailureGuard.js');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(readSource('core/AuthFailureGuard.js'), filename);
const { AuthFailureGuard } = compiled.exports;
const traces = [];
const unsubscribe = subscribeTrace((event) => traces.push(event));
const capturedErrors = [];
const originalError = console.error;
console.error = (...args) => capturedErrors.push(args.join(' '));

try {
  const guard = new AuthFailureGuard();
  assert.strictEqual(typeof guard.wireRuntime, 'undefined');
  assert.strictEqual(typeof guard.getEntryBlock, 'undefined');
  assert.strictEqual(typeof guard._flattenBrokerTrades, 'undefined');
  assert.strictEqual(typeof guard._persistQuarantine, 'undefined');

  const threshold = guard.getState('alpaca').thresholdCount;
  for (let count = 0; count < threshold; count += 1) {
    const result = guard.recordFailure('alpaca', 'rest-auth', {
      authFailure: true,
      evidence: 'native-auth-guard-probe',
    });
    assert.strictEqual(result, undefined);
  }

  assert.strictEqual(guard.getState('alpaca').failures.length, threshold);
  assert.strictEqual(capturedErrors.length, threshold);
  assert.ok(capturedErrors.every((line) => line.includes('[AuthFailureGuard] alpaca rest-auth failure')));
  const alarm = traces.find((entry) => entry.event === 'BROKER_AUTH_FAILURE_THRESHOLD_ALARM');
  assert.ok(alarm, 'threshold must emit a trace alarm');
  assert.deepStrictEqual(alarm.fields.tradingAction, 'none');
  assert.strictEqual(alarm.fields.manualReconciliationRequired, true);
  assert.strictEqual(alarm.fields.entryBlocking, undefined);

  const afterFlags = fs.readdirSync(root).filter((name) => name.startsWith('.broker-auth-quarantine-')).sort();
  assert.deepStrictEqual(afterFlags, beforeFlags, 'threshold must not write a quarantine flag');
  for (const file of ['brokers/AlpacaAdapter.js', 'kraken_adapter_simple.js']) {
    const body = fs.readFileSync(path.join(root, file));
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    assert.strictEqual(hash, adapterHashes[file], `${file} must remain unchanged`);
  }

  const orderExecutor = readSource('core/OrderExecutor.js');
  const runner = readSource('run-empire-v2.js');
  assert.ok(!orderExecutor.includes("require('./AuthFailureGuard')"));
  assert.ok(!orderExecutor.includes('getEntryBlock(executionScope.brokerId)'));
  assert.ok(!runner.includes("require('./core/AuthFailureGuard')"));
  assert.ok(!runner.includes('authFailureGuard.wireRuntime'));
  console.log('PASS auth guard threshold telemetry only; no file write, flatten helper, or entry veto');
} finally {
  console.error = originalError;
  unsubscribe();
}
