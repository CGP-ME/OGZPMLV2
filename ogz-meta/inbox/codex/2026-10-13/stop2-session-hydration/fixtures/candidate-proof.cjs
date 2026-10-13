'use strict';

/*
 * Immutable candidate rehearsal. Runs actual SessionRouter transitions and
 * extracted runner hydration/symbol methods with in-memory adapters/state.
 * No source rewrites, credentials, network, or persistent state writes.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const cp=require('child_process'), Module=require('module');
const ref=process.argv.find(a=>a.startsWith('--candidate-ref='))?.split('=')[1];
assert(ref,'Pass immutable --candidate-ref');
const read=name=>cp.execFileSync('git',['show',`${ref}:${name}`],{cwd:root,encoding:'utf8'});
const cache=new Map();
function load(name) {
 if(name==='core/StateManager.js')return {getInstance:()=>({})};
 if(cache.has(name))return cache.get(name).exports;
 const filename=path.join(root,name),m=new Module(filename,module);
 m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));cache.set(name,m);
 m.require=function(request){
  if(request.startsWith('.')){const resolved=Module._resolveFilename(request,m);return load(path.relative(root,resolved));}
  return Module.prototype.require.call(m,request);
 };
 if(name.endsWith('.json'))m.exports=JSON.parse(read(name));else m._compile(read(name),filename);
 return m.exports;
}
const SessionRouter=load('core/SessionRouter.js');
const runnerSource=read('run-empire-v2.js');
const routerSource=read('core/SessionRouter.js');
const order = [];

function method(source, signature) {
  const start = source.indexOf(signature);
  assert(start >= 0, `missing live method ${signature}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`unterminated live method ${signature}`);
}

function compileHydrator() {
  const source = method(runnerSource, '  async hydrateActiveTimeframeFromRest()')
    .replace('async hydrateActiveTimeframeFromRest()', 'async function hydrateActiveTimeframeFromRest()');
  const resolvedConfig = { config: { mode: { backtest: false, execution: 'paper', candleSource: 'broker' } } };
  return new Function('resolvedConfig', 'normalizeRuntimeSymbol', 'ohlcTimestampMs', 'createTraceId', 'emitTrace', 'candleToProcessorOhlc', 'stateManager', `return (${source});`)(
    resolvedConfig,
    value => String(value || '').trim().toUpperCase(),
    value => Number(value),
    prefix => `${prefix}-${order.length + 1}`,
    () => {},
    candle => [candle.t / 1000, candle.etime / 1000, candle.o, candle.h, candle.l, candle.c, candle.c, candle.v, 1],
    { updateLastPrice: () => true }
  );
}

function memoryTransitionStore() {
  let epoch = 0;
  let intent = 0;
  return {
    nextEpoch: () => epoch + 1,
    acquireLock: () => ({ success: true, lock: { epoch: ++epoch, ownerId: 'isolated', acquiredAt: '2026-10-13T00:00:00.000Z' } }),
    releaseLock: () => ({ released: true }),
    recordTransitionEvent: (event, details) => { order.push(`event:${event}`); return { event, ...details }; },
    recordBrokerIntent: () => ({ intentId: `intent-${++intent}` }),
    commitBrokerIntent: () => ({ committed: true }),
    failBrokerIntent: () => ({ failed: true }),
    markRecoveryRequired: () => ({ marked: true }),
    readStatus: () => ({ recoveryRequired: false }),
  };
}

function adapter(id) {
  return {
    id,
    getBrokerName: () => id,
    getPositions: async () => [], getOpenOrders: async () => [],
    getBalance: async () => (id === 'alpaca' ? { equity: 10000 } : { total: 10000 }),
    unsubscribeAll: async () => {}, removeAllListeners: async () => {},
    subscribeToCandles: async () => {}, on: () => { order.push(`attach:${id}`); },
    getCandles: async (symbol, timeframe, limit) => {
      order.push(`rest:${id}:${symbol}:${timeframe}:${limit}`);
      return [{ t: 1760313600000, o: 100, h: 101, l: 99, c: 100.5, v: 10 }];
    },
  };
}

function makeRouter() {
  const router = new SessionRouter({
    mode: 'scheduled', clock: () => Date.parse('2026-10-13T14:30:00.000Z'),
    stockSymbols: ['TSLA', 'NVDA'], cryptoSymbols: ['BTC-USD', 'ETH-USD'],
    forceCloseOnSessionEnd: false, transitionStore: memoryTransitionStore(),
  });
  router.krakenAdapter = adapter('kraken');
  router.alpacaAdapter = adapter('alpaca');
  router.orderRouter = { registerBroker: async () => {} };
  router.onOhlcCallback = () => {};
  router.stateManager = {
    state: { activeTrades: new Map(), isTrading: true },
    pauseTrading: async () => { router.stateManager.state.isTrading = false; order.push('pause'); },
    resumeTrading: async () => { order.push('resume'); router.stateManager.state.isTrading = true; },
    setDashboardRuntimeScope: scope => ({ ...scope, scopeComplete: true, runtimeScopeStatus: 'complete', scopeKey: 'isolated', scopeKeyVersion: 2 }),
  };
  const hydrate = compileHydrator();
  const runner = {
    config: { enableBacktestMode: false, dataFeed: { bootRestHydrationLimit: 2 } },
    candleTimeframe: '1m', evaluationTimeframes: ['1m', '15m'], candleAggregator: { getIntervalMs: tf => tf === '15m' ? 900000 : 60000 },
    _getBootHydrationSymbols() { return this.sessionRouter.activeSession === 'stocks' ? this.sessionRouter.stockSymbols : this.sessionRouter.cryptoSymbols; },
    _normalizeHydrationCandle(raw, symbol, timeframe, timeframeMs) {
      const t = Number(raw.t);
      return Number.isFinite(t) ? { symbol, timeframe, t, etime: t + timeframeMs, o: Number(raw.o), h: Number(raw.h), l: Number(raw.l), c: Number(raw.c), v: Number(raw.v) } : null;
    },
    _getRestRecoveryScopeEnvelope(_source, _symbol, timeframe, overrides) { return { brokerId: overrides.brokerId, accountId: 'isolated', accountIdSource: 'fixture', assetClass: this.sessionRouter.activeSession, executionMode: 'paper', timeframe }; },
    candleProcessor: { processNewCandle(candle) { order.push(`process:${candle.symbol}:${candle.timeframe}`); return true; } },
    storeTimeframeCandle() {}, storeSymbolTimeframeCandle() {}, getSymbolTimeframeContext() { return null; }, _markActiveTimeframeData() {},
    hydrateActiveTimeframeFromRest: null,
  };
  const normalizeSource=method(runnerSource,'function normalizeRuntimeSymbol(symbol)');
  const normalize=new Function(`return (${normalizeSource});`)();
  const symbolSource=method(runnerSource,'  _getBootHydrationSymbols()').replace('_getBootHydrationSymbols()', 'function _getBootHydrationSymbols()');
  runner._getBootHydrationSymbols=new Function('normalizeRuntimeSymbol',`return (${symbolSource});`)(normalize);
  runner.sessionRouter = router;
  runner.hydrateActiveTimeframeFromRest = hydrate.bind(runner);
  router.ctx = {
    candleTimeframe: '1m', evaluationTimeframes: ['1m', '15m'],
    config: { executionMode: 'paper', accountId: 'isolated', accountIdSource: 'fixture' },
    tradingLoop: { waitForPendingOperations: async () => {} },
    patternChecker: { memory: { switchSessionScope: scope => ({ switched: false, reason: 'already_active', storagePath: `/data/unified-patterns.paper.${scope.assetClass}.json`, mode: 'paper', assetBucket: scope.assetClass }) } },
    hydrateActiveTimeframeFromRest: runner.hydrateActiveTimeframeFromRest,
  };
  return router;
}

async function exercise(name, from, expectedBroker, expectedSymbols) {
  order.length = 0;
  const router = makeRouter();
  router.activeSession = from;
  await router[name](new Date('2026-10-13T14:30:00.000Z'));
  const requests = order.filter(item => item.startsWith(`rest:${expectedBroker}:`));
  assert.deepEqual(requests, expectedSymbols.flatMap(symbol => ['1m', '15m'].map(tf => `rest:${expectedBroker}:${symbol}:${tf}:2`)));
  const lastProcess = Math.max(...order.map((item, index) => item.startsWith('process:') ? index : -1));
  assert(lastProcess >= 0 && lastProcess < order.indexOf('attach:' + expectedBroker));
  assert(lastProcess < order.indexOf('resume'));
  return { direction: `${from}->${expectedBroker === 'alpaca' ? 'stocks' : 'crypto'}`, requests, order: [...order] };
}

async function main() {
  const results = [];
  results.push(await exercise('_transitionToStocks', 'crypto', 'alpaca', ['TSLA', 'NVDA']));
  results.push(await exercise('_transitionToCrypto', 'stocks', 'kraken', ['BTC-USD', 'ETH-USD']));
  console.log(JSON.stringify({verdict:'PASS',candidateRef:ref,results,limits:['in-memory adapters and state; actual SessionRouter transitions and runner hydration/symbol producer; candle processor is a seam, replay proven separately'],brokerRequests:0,runtimeActivation:false},null,2));
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
