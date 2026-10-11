'use strict';

// Adapter-level acceptance probe. The optional source path lets the parent
// compare a candidate AlpacaAdapter export with the checked-in baseline:
//   node alpaca-15m-adapter-acceptance.cjs /path/to/AlpacaAdapter.js
//   node alpaca-15m-adapter-acceptance.cjs --baseline /path/to/AlpacaAdapter.js
// No socket or REST request is made; getCandles is stubbed below.
const assert = require('node:assert/strict');
const path = require('node:path');
const args = process.argv.slice(2);
const baseline = args[0] === '--baseline';
const defaultAdapterPath = path.resolve(__dirname, '../../../../../../brokers/AlpacaAdapter');
const adapterPath = path.resolve(baseline ? (args[1] || defaultAdapterPath) : (args[0] || defaultAdapterPath));
const sourceRoot = path.dirname(path.dirname(adapterPath));
Object.assign(process.env, {
  PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-token',
  ALPACA_API_KEY: 'fixture-key', ALPACA_API_SECRET: 'fixture-secret',
  KRAKEN_API_KEY: 'fixture-key', KRAKEN_API_SECRET: 'fixture-secret',
});
require(path.join(sourceRoot, 'foundation/ConfigLoader')).load({ force: true, silent: true, loadDotenv: false });
const AlpacaAdapter = require(adapterPath);

const START = Date.UTC(2026, 5, 12, 14, 30, 0);
const BAR_1415 = { t: START - 15 * 60_000, o: 99, h: 102, l: 98, c: 101, v: 150 };
const BAR_1430 = { t: START, o: 101, h: 106, l: 100, c: 105, v: 125 };

function nativeMessage(symbol, minute, close = 100 + minute) {
  const t = new Date(START + minute * 60_000).toISOString();
  return { T: 'b', S: symbol, o: close - 1, h: close + 1, l: close - 2, c: close, v: 10, t };
}

function setup() {
  const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
  const sent = [];
  adapter._firstBarLogged = new Set();
  adapter._ensureDataStream = (callback, key) => {
    assert.match(key, /^bars-/);
    callback();
  };
  adapter.rws = { isReady: () => true, send: payload => sent.push(payload) };
  return { adapter, sent };
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

async function runBaseline() {
  const { adapter, sent } = setup();
  const output = [];
  const nativeOhlc = [];
  adapter.on('ohlc', event => nativeOhlc.push(event));
  adapter.getCandles = async () => [];
  adapter.subscribeToCandles('TSLA', '15m', bar => output.push(bar));
  adapter._handleOneStreamMessage(nativeMessage('TSLA', 14, 114));
  assert.equal(sent.length, 1);
  assert.equal(output.length, 1);
  assert.equal(output[0].symbol, 'TSLA');
  assert.equal(output[0].etime, START + 15 * 60_000);
  assert.equal(adapter.barSubscriptions.get('TSLA').streamTimeframe, '1m');
  console.log('PASS baseline: requested 15m emits one native 1m bar and no higher-frame bar');
}

async function runCandidate() {
  const { adapter, sent } = setup();
  const callbacks = [];
  const ohlc = [];
  adapter.on('ohlc', event => ohlc.push(event));
  const calls = [];
  const truthUnavailable = [];
  adapter.on('broker_truth_unavailable', payload => truthUnavailable.push(payload));
  const pending = [];
  adapter.getCandles = async (symbol, timeframe, limit) => {
    calls.push({ symbol, timeframe, limit });
    return new Promise((resolve, reject) => pending.push({ symbol, resolve, reject }));
  };

  adapter.subscribeToCandles('TSLA', '15m', bar => callbacks.push({ ...bar, callback: 'TSLA' }));
  adapter.subscribeToCandles('SPY', '15m', bar => callbacks.push({ ...bar, callback: 'SPY' }));
  assert.deepEqual(sent, [{ action: 'subscribe', bars: ['TSLA'] }, { action: 'subscribe', bars: ['SPY'] }]);

  // Native 14:44 closes at 14:45. REST returns a complete 14:30 bar and a
  // forming 14:45 bar; only the complete bar is an additional OHLC event.
  adapter._handleOneStreamMessage(nativeMessage('TSLA', 14, 114));
  await flush();
  assert.deepEqual(calls[0], { symbol: 'TSLA', timeframe: '15m', limit: 2 });
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].callback, 'TSLA');
  assert.equal(ohlc.filter(event => event.timeframe === '1m').length, 1);
  assert.equal(ohlc[0].data.etime, START + 15 * 60_000);
  pending.shift().resolve([BAR_1430, { ...BAR_1430, t: START + 15 * 60_000, c: 106 }]);
  await flush();
  const higher = ohlc.filter(event => event.timeframe === '15m');
  assert.deepEqual(higher[0], {
    timeframe: '15m', symbol: 'TSLA',
    data: { ...BAR_1430, etime: START + 15 * 60_000, symbol: 'TSLA' }
  });
  assert.equal(callbacks.length, 1, 'higher timeframe is an OHLC event only');

  // Two native closes while REST is in flight coalesce to one refresh. At the
  // 15:00 watermark the formerly forming 14:45 bar is now complete, while the
  // already emitted 14:30 bar remains deduped.
  adapter._handleOneStreamMessage(nativeMessage('TSLA', 29, 129));
  adapter._handleOneStreamMessage(nativeMessage('TSLA', 29, 129));
  await flush();
  assert.equal(calls.length, 2);
  pending.shift().resolve([BAR_1430, { ...BAR_1430, t: START + 15 * 60_000, c: 106 }]);
  await flush();
  assert.deepEqual(ohlc.filter(event => event.timeframe === '15m').map(event => event.data.t), [
    START,
    START + 15 * 60_000,
  ]);

  // Requested-frame state is per symbol. SPY receives its own REST OHLC event
  // and it never enters TSLA's callback, which remains native-only.
  const SPY_BAR_1430 = { t: START, o: 201, h: 206, l: 200, c: 205, v: 225 };
  adapter._handleOneStreamMessage(nativeMessage('SPY', 14, 214));
  await flush();
  assert.deepEqual(calls[2], { symbol: 'SPY', timeframe: '15m', limit: 2 });
  pending.shift().resolve([SPY_BAR_1430, { ...SPY_BAR_1430, t: START + 15 * 60_000, c: 206 }]);
  await flush();
  assert.deepEqual(ohlc.filter(event => event.timeframe === '15m' && event.symbol === 'SPY'), [{
    timeframe: '15m', symbol: 'SPY',
    data: { ...SPY_BAR_1430, etime: START + 15 * 60_000, symbol: 'SPY' }
  }]);
  assert.equal(callbacks.filter(item => item.callback === 'SPY').length, 1);
  assert.equal(callbacks.filter(item => item.callback === 'TSLA' && item.symbol === 'SPY').length, 0);

  // A rejected request from the old session is discarded after unsubscribe and
  // cannot create broker-truth evidence in the new SPY session.
  adapter._handleOneStreamMessage(nativeMessage('TSLA', 30, 130));
  await flush();
  assert.equal(calls.length, 4);
  adapter.unsubscribeAll();
  assert.equal(adapter.subscriptions.has('bars-SPY'), false, 'old SPY callback is removed before the new session');
  adapter.subscribeToCandles('SPY', '15m', bar => callbacks.push({ ...bar, callback: 'SPY-new' }));
  pending.shift().reject(new Error('stale REST failure'));
  await flush();
  assert.equal(truthUnavailable.length, 0, 'old-session rejection is not attributed to the new session');
  assert.equal(ohlc.filter(event => event.timeframe === '15m' && event.symbol === 'TSLA').length, 2);

  // A current-session REST failure remains observable as broker truth
  // unavailable evidence.
  adapter.getCandles = async () => { throw new Error('stubbed REST failure'); };
  adapter._handleOneStreamMessage(nativeMessage('SPY', 14, 214));
  await flush();
  assert.equal(truthUnavailable.length, 1, 'current-session REST failure preserves broker truth unavailable evidence');
  console.log('PASS candidate: REST 15m fetch, completion, coalescing, symbol/session isolation');
}

(baseline ? runBaseline() : runCandidate()).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
