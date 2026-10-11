'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(process.argv[2]);
process.chdir(root);
const candidate = path.join(root, 'brokers/AlpacaAdapter.js');
Object.assign(process.env, {
  PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token',
  ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret',
  KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret',
});
require(path.join(root, 'foundation/ConfigLoader')).load({ force: true, silent: true, loadDotenv: false });
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (parent?.filename === candidate && request.startsWith('../')) {
    return originalLoad(path.join(root, request.slice(3)), parent, isMain);
  }
  return originalLoad(request, parent, isMain);
};
const AlpacaAdapter = require(candidate);
Module._load = originalLoad;

const START = Date.UTC(2026, 5, 12, 14, 30);
const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
const sent = [];
const callbacks = { five: [], fifteen: [] };
const ohlc = [];
const pending = [];
adapter._firstBarLogged = new Set();
adapter._ensureDataStream = callback => callback();
adapter.rws = { isReady: () => true, send: payload => sent.push(payload) };
adapter.getCandles = (symbol, timeframe) => new Promise((resolve, reject) => pending.push({ symbol, timeframe, resolve, reject }));
adapter.on('ohlc', event => ohlc.push(event));
adapter.subscribeToCandles('TSLA', '5m', bar => callbacks.five.push(bar));
adapter.subscribeToCandles('TSLA', '15m', bar => callbacks.fifteen.push(bar));
assert.deepEqual(sent, [{ action: 'subscribe', bars: ['TSLA'] }]);
assert.deepEqual([...adapter.barSubscriptions.get('TSLA').requestedFrames.keys()], ['5m', '15m']);
const native = { T: 'b', S: 'TSLA', t: new Date(START + 14 * 60_000).toISOString(), o: 100, h: 102, l: 99, c: 101, v: 10 };
adapter._handleOneStreamMessage(native);
adapter._handleOneStreamMessage(native);
assert.equal(pending.length, 2, 'one in-flight REST request per requested frame');
assert.deepEqual(pending.map(item => item.timeframe).sort(), ['15m', '5m']);
pending.find(item => item.timeframe === '5m').resolve([{ t: START + 10 * 60_000, o: 100, h: 102, l: 99, c: 101, v: 10 }]);
pending.find(item => item.timeframe === '15m').resolve([{ t: START, o: 100, h: 102, l: 99, c: 101, v: 10 }]);
setImmediate(() => setImmediate(() => {
  assert.deepEqual(ohlc.filter(event => event.timeframe !== '1m').map(event => event.timeframe).sort(), ['15m', '5m']);
  assert.equal(callbacks.five.length, 2);
  assert.equal(callbacks.fifteen.length, 2);
  console.log('PASS multi-request: one native subscription, independent 5m/15m REST frames, coalesced per-frame fetches, native callbacks preserved');
}));
