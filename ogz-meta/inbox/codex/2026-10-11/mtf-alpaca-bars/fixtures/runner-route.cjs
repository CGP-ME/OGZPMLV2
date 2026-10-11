'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const walk = require('acorn-walk');
const root = path.resolve(process.argv[2]);
Object.assign(process.env, { PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token', ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret', KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret' });
require(path.join(root, 'foundation/ConfigLoader')).load({ force: true, silent: true, loadDotenv: false });
const source = fs.readFileSync(path.join(root, 'run-empire-v2.js'), 'utf8');
const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
const functions = {};
walk.simple(ast, {
  FunctionDeclaration(node) {
    if (['ohlcTimestampMs', 'normalizeOhlcForProcessor'].includes(node.id.name)) functions[node.id.name] = source.slice(node.start, node.end);
  },
  VariableDeclarator(node) {
    if (node.id.name === 'ohlcHandler') functions.handler = source.slice(node.init.start, node.init.end);
  },
  MethodDefinition(node) {
    if (node.key.name === 'storeTimeframeCandle') functions.store = source.slice(node.start, node.end);
  }
});
assert.equal(Object.keys(functions).length, 4);
const { normalizeOhlc, toTimestampMs } = require(path.join(root, 'foundation/ohlc-normalize'));
const { normalizeAssetSymbol } = require(path.join(root, 'core/AssetRegistry'));
const traces = [], inputs = [], cycles = [], operations = [];
const context = vm.createContext({
  normalizeOhlc, toTimestampMs, normalizeRuntimeSymbol: normalizeAssetSymbol,
  createTraceId: () => 'fixture-candle', emitTrace: (_ctx, event, data) => traces.push({ event, data }),
  describeSymbolContexts: () => 'fixture TSLA15m',
  stateManager: { updateLastPrice: () => true },
  console: { log() {}, error() {}, warn() {} },
});
vm.runInContext(functions.ohlcTimestampMs + '\n' + functions.normalizeOhlcForProcessor, context);
const runner = {
  candleTimeframe: '15m', timeframeSelector: { currentTimeframe: '15m' },
  timeframeHistories: {}, timeframeDiagnostics: { nonActiveTimeframeDrops: 0 },
  sessionRouter: { activeSession: 'stocks', activeBroker: { id: 'alpaca' } },
  storeSymbolTimeframeCandle() {}, _markActiveTimeframeData() {},
  getCandleScopeEnvelope: extra => ({ accountId: 'fixture-account', executionMode: 'paper', ...extra }),
  syncDashboardRuntimeScope() {}, handleMarketData: value => inputs.push(value),
  run15mTradingCycle: async (symbol, traceId) => cycles.push({ symbol, traceId }),
  _trackRuntimeOperation(_label, work) { operations.push(work()); },
};
runner.storeTimeframeCandle = vm.runInContext('({' + functions.store + '}).storeTimeframeCandle', context);
const handler = vm.runInContext('(function(){return ' + functions.handler + ';})', context).call(runner);
const AlpacaAdapter = require(path.join(root, 'brokers/AlpacaAdapter'));
const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
adapter._ensureDataStream = callback => callback();
adapter._firstBarLogged = new Set();
adapter.rws = { send() {}, isReady: () => true };
const start = Date.UTC(2026, 5, 12, 14, 30);
const brokerBar = { t: start, o: 101, h: 106, l: 100, c: 105, v: 125 };
adapter.getCandles = async (symbol, timeframe, limit) => {
  assert.equal(symbol, 'TSLA'); assert.equal(timeframe, '15m'); assert.equal(limit, 2);
  return [brokerBar, { ...brokerBar, t: start + 900000 }];
};
adapter.on('ohlc', handler);
adapter.subscribeToCandles('TSLA', '15m');
adapter._handleOneStreamMessage({ T: 'b', S: 'TSLA', t: new Date(start + 840000).toISOString(), o: 103, h: 105, l: 103, c: 104, v: 7 });
(async () => {
  await new Promise(resolve => setImmediate(resolve)); await Promise.all(operations);
  if (process.argv[3] === '--baseline') {
    assert.equal(inputs.length, 0); assert.equal(cycles.length, 0);
    assert.equal(runner.timeframeDiagnostics.nonActiveTimeframeDrops, 1);
    console.log('PASS baseline reproduced: native1m dropped, requested15m never reaches active analysis');
    return;
  }
  assert.equal(inputs.length, 1); assert.equal(cycles.length, 1);
  assert.equal(inputs[0].symbol, 'TSLA'); assert.equal(inputs[0].timeframe, '15m');
  assert.equal(inputs[0].data[0] * 1000, start); assert.equal(inputs[0].data[1] * 1000, start + 900000);
  assert.equal(inputs[0].data[5], brokerBar.c); assert.equal(cycles[0].symbol, 'TSLA');
  assert.equal(inputs[0].brokerId, 'alpaca'); assert.equal(inputs[0].executionMode, 'paper');
  assert.equal(runner.timeframeDiagnostics.nonActiveTimeframeDrops, 1, 'native1m remains a separate existing path');
  console.log('PASS candidate: real adapter -> real normalization/runner OHLC handler -> requested15m market data and analysis dispatch');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
