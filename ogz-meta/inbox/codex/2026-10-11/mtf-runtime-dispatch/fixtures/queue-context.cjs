'use strict';

// Queue/context proof only: actual TradingLoop queue methods, stubbed operation
// bodies. Usage: node queue-context.cjs /source/root [candidate-path]
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(process.argv[2]);
const candidate = path.resolve(process.argv[3] || path.join(root, 'core/TradingLoop.js'));
process.chdir(root);
Object.assign(process.env, {
  PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token',
  ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret',
  KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret',
});
require(path.join(root, 'foundation/ConfigLoader')).load({ force: true, silent: true, loadDotenv: false });

const originalLoad = Module._load;
Module._load = function fixtureLoad(request, parent, isMain) {
  if (parent?.filename === candidate && request.startsWith('./')) {
    return originalLoad(path.join(root, 'core', request.slice(2)), parent, isMain);
  }
  if (parent?.filename === candidate && request.startsWith('../')) {
    return originalLoad(path.join(root, request.slice(3)), parent, isMain);
  }
  return originalLoad(request, parent, isMain);
};
const TradingLoop = require(candidate);
Module._load = originalLoad;

const loop = new TradingLoop({
  config: { timeframe: '15m', executionMode: 'paper' },
  runner: null,
  getSymbolTimeframeContext: (_symbol, timeframe) => ({ timeframe }),
});
assert.equal(loop._patternScope('TSLA', '5m').timeframe, '5m', 'router-disabled scope must retain explicit frame');

const started = [];
const finished = [];
let releaseFirst;
const firstBarrier = new Promise(resolve => { releaseFirst = resolve; });
loop._analyze = async (symbol, traceId, timeframe) => {
  started.push(`${symbol}:${traceId}:${timeframe}`);
  if (traceId === 'first') await firstBarrier;
  if (traceId === 'boom') throw new Error('fixture error');
  finished.push(`${symbol}:${traceId}:${timeframe}`);
  return traceId;
};

async function tick() { await new Promise(resolve => setImmediate(resolve)); }
async function main() {
  const first = loop.analyzeAndTrade('TSLA', 'first', '5m');
  await tick();
  const second = loop.analyzeAndTrade('TSLA', 'second', '15m');
  await tick();
  assert.deepEqual(started, ['TSLA:first:5m'], 'same-symbol next frame waits behind active work');
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(finished.slice(0, 2), ['TSLA:first:5m', 'TSLA:second:15m']);

  let releaseTsla;
  const tslaBarrier = new Promise(resolve => { releaseTsla = resolve; });
  loop._analyze = async (symbol, traceId, timeframe) => {
    started.push(`${symbol}:${traceId}:${timeframe}`);
    if (traceId === 'parallel-tsla') await tslaBarrier;
    finished.push(`${symbol}:${traceId}:${timeframe}`);
    return traceId;
  };
  const tsla = loop.analyzeAndTrade('TSLA', 'parallel-tsla', '5m');
  const spy = loop.analyzeAndTrade('SPY', 'parallel-spy', '15m');
  await tick();
  assert.ok(started.includes('TSLA:parallel-tsla:5m'));
  assert.ok(started.includes('SPY:parallel-spy:15m'), 'different symbols run independently');
  releaseTsla();
  await Promise.all([tsla, spy]);

  loop._analyze = async (_symbol, traceId) => {
    if (traceId === 'boom') throw new Error('fixture error');
    return traceId;
  };
  await assert.rejects(loop.analyzeAndTrade('TSLA', 'boom', '5m'), /fixture error/);
  assert.equal(await loop.analyzeAndTrade('TSLA', 'after-error', '15m'), 'after-error', 'rejected work does not strand the next frame');

  let releasePending;
  const pendingBarrier = new Promise(resolve => { releasePending = resolve; });
  let originalFailureObserved = false;
  loop._analyze = async (_symbol, traceId) => {
    if (traceId === 'wait-first') await pendingBarrier;
    if (traceId === 'wait-failure') throw new Error('wait fixture failure');
    return traceId;
  };
  const waitingFirst = loop.analyzeAndTrade('TSLA', 'wait-first', '5m');
  const waitingFailure = loop.analyzeAndTrade('TSLA', 'wait-failure', '15m');
  const observedFailure = waitingFailure.then(
    () => { throw new Error('wait fixture failure unexpectedly resolved'); },
    error => { originalFailureObserved = /wait fixture failure/.test(error.message); }
  );
  let pendingWaitResolved = false;
  const pendingWait = loop.waitForPendingOperations().then(() => { pendingWaitResolved = true; });
  await tick();
  assert.equal(pendingWaitResolved, false, 'waitForPendingOperations holds while a queued barrier is active');
  releasePending();
  assert.equal(await waitingFirst, 'wait-first');
  await observedFailure;
  assert.equal(originalFailureObserved, true, 'the original queued failure promise rejects before the waiter resolves');
  await pendingWait;
  assert.equal(loop.symbolOperationQueues.size, 0, 'waitForPendingOperations resolves only after all queued work drains');

  let exitCalls = 0;
  let releaseAnalysis;
  const analysisBarrier = new Promise(resolve => { releaseAnalysis = resolve; });
  loop._analyze = async () => analysisBarrier;
  loop._checkExitsOnly = async () => { exitCalls += 1; return 'exit'; };
  const activeAnalysis = loop.analyzeAndTrade('TSLA', 'analysis', '5m');
  await tick();
  const exitOne = loop.checkExitsOnly('TSLA');
  const exitTwo = loop.checkExitsOnly('TSLA');
  releaseAnalysis();
  await Promise.all([activeAnalysis, exitOne, exitTwo]);
  assert.equal(exitCalls, 1, 'duplicate exit monitor calls coalesce behind the active analysis');
  console.log('PASS queue-context: frame serialization, cross-symbol parallelism, error continuation, pending-operation drain, exit coalescing, explicit scope frame');
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
