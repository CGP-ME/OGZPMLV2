'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const sourceArg = process.argv.find(value => value.startsWith('--source='));
if (sourceArg) for (const [file, content] of Object.entries(JSON.parse(fs.readFileSync(sourceArg.slice(9))))) fs.writeFileSync(file, content);
const prior = process.argv.includes('--prior');
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const loaded = require(process.cwd() + '/foundation/ConfigLoader').load({ role: 'bot', silent: true });
const Kraken = require(process.cwd() + '/brokers/KrakenIBrokerAdapter');
const CandleProcessor = require(process.cwd() + '/core/CandleProcessor');
const { CandleStore } = require(process.cwd() + '/core/CandleStore');
const { subscribeTrace } = require(process.cwd() + '/core/TraceSpine');
const axios = require('axios');
const capture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-22/stop2-kraken-history-pacing/fixtures/native-ohlc.json'));
const observation = capture.observations.find(row => row.interval === 1 && row.response.result.XXBTZUSD);
const nativeRows = observation.response.result.XXBTZUSD;
const native = nativeRows.map(c => ({ t: Number(c[0]) * 1000, etime: (Number(c[0]) + 60) * 1000, o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[6]) }));
const traces = [], requests = [], timers = new Map();
const unsubscribe = subscribeTrace(event => traces.push(event));
let timerId = 0, clock = native[4].etime + 1000, responseMode = 'requested_window';
Date.now = () => clock;
global.setInterval = (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms, repeating: true }); return id; };
global.clearInterval = id => timers.delete(id);
global.setTimeout = (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms, repeating: false }); return id; };
global.clearTimeout = id => timers.delete(id);
axios.get = async url => {
  const params = new URL(url).searchParams;
  assert.equal(params.get('interval'), '1');
  const since = Number(params.get('since')) * 1000;
  const rows = responseMode === 'boundary_only' ? [nativeRows[4]] : nativeRows.filter(c => Number(c[0]) * 1000 >= since && Number(c[0]) * 1000 < clock);
  const request = { mode: responseMode, now: clock, pair: params.get('pair'), interval: Number(params.get('interval')), since, gapStart: native[0].etime, gapEnd: native[4].etime, rows: responseMode === 'unavailable' ? 0 : rows.length, earliestReturnedStart: responseMode === 'unavailable' ? null : Number(rows[0]?.[0]) * 1000 };
  requests.push(request);
  if (responseMode === 'unavailable') throw new Error('explicit fixture HTTP 503');
  return { data: { error: [], result: { XXBTZUSD: rows, last: observation.response.result.last } } };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
function build() {
  const broker = new Kraken({ apiKey: 'fixture-key', apiSecret: 'fixture-secret' });
  const store = new CandleStore({ maxCandles: 2000 });
  const contexts = new Map();
  const ctx = { config: loaded.config, tradingPair: 'BTC-USD', candleTimeframe: '1m', priceHistory: [], candleSaveCounter: 0, saveCandleHistory() {}, _candleStore: store,
    strategyOrchestrator: { ingestMarketCandle() {} },
    getSymbolTimeframeContext(symbol, timeframe) { const key = symbol + ' ' + timeframe; if (!contexts.has(key)) contexts.set(key, { symbol, timeframe, get priceHistory() { return store.getCandles(symbol, timeframe); }, indicatorEngine: { updateCandle() {} } }); return contexts.get(key); },
    sessionRouter: { activeBroker: broker, activeSession: 'crypto', activeCallbackEpoch: 1, transitionInProgress: false, stopping: false },
  };
  const processor = new CandleProcessor(ctx);
  ctx.candleProcessor = processor;
  const scope = { symbol: 'BTC-USD', timeframe: '1m', brokerId: broker.getBrokerName(), accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: 'crypto', executionMode: 'paper', sessionRouterEpoch: 1, traceId: 'coverage-fixture-' + clock };
  function feed(index) { const c = native[index]; processor.handleMarketData({ ...scope, data: [c.t, c.etime, c.o, c.h, c.l, c.c, null, c.v, null], sourceEventTime: clock, sourceEventKind: 'captured_native_fixture' }); }
  function snapshot() { return { storedStarts: store.getCandles('BTC-USD', '1m').map(c => c.t), retryTimers: timers.size, pendingJobs: prior ? null : processor.backfillJobs.size }; }
  return { processor, feed, snapshot, scope };
}
async function main() {
  const control = build();
  control.feed(0); control.feed(4); await flush();
  const controlResult = { ...control.snapshot(), requests: requests.splice(0) };
  assert.deepEqual(controlResult.storedStarts, native.slice(0, 5).map(c => c.t));
  assert.equal(controlResult.retryTimers, 0);
  control.processor.cleanup(); timers.clear();

  clock += 2000; responseMode = 'boundary_only';
  const boundary = build();
  boundary.feed(0); boundary.feed(4); await flush();
  const boundaryResult = { ...boundary.snapshot(), requests: requests.splice(0), completionTraces: traces.filter(t => t.event === 'GAP_BACKFILL_COMPLETED' && t.traceId === boundary.scope.traceId), backfillSuccessLogs: logs.filter(l => l.text === '[GAP-RECOVERY] Backfilled 1 candles via REST') };
  assert.equal(boundaryResult.storedStarts.length, 2);
  assert.equal(boundaryResult.retryTimers, 0);
  assert.equal(boundaryResult.backfillSuccessLogs.length, 1);
  if (!prior) { assert.equal(boundaryResult.pendingJobs, 0); assert.equal(boundaryResult.completionTraces.length, 1); }
  boundary.processor.cleanup(); timers.clear();

  clock += 2000; responseMode = 'unavailable';
  const aged = build();
  aged.feed(0); aged.feed(4); await flush();
  const pendingAfterFailure = aged.snapshot();
  assert.equal(pendingAfterFailure.retryTimers, 1);
  clock += 30 * 60000 + aged.processor.backfillRetryDelayMs;
  responseMode = 'requested_window';
  for (const [id, timer] of [...timers]) { if (!timer.repeating) timers.delete(id); timer.callback(); }
  await flush();
  const agedResult = { pendingAfterFailure, ...aged.snapshot(), requests: requests.splice(0) };
  assert.equal(agedResult.storedStarts.length, 2);
  assert.equal(agedResult.retryTimers, 1);
  assert.equal(agedResult.requests.length, 2);
  assert.ok(agedResult.requests[1].since > native[4].etime);
  assert.ok(agedResult.requests[1].rows > 0);
  aged.processor.cleanup(); timers.clear();

  unsubscribe();
  const files = ['core/CandleProcessor.js', 'core/CandleStore.js', 'brokers/KrakenIBrokerAdapter.js', 'kraken_adapter_simple.js', 'foundation/ohlc-normalize.js', 'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'];
  process.stdout.write(JSON.stringify({ prior, isolation: 'test-isolated.py', results: { control: controlResult, delayedRetry: agedResult, boundaryOnly: boundaryResult }, sourceHashes: Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])), limitations: ['Actual Kraken adapter, low-level REST URL construction, CandleProcessor intake/recovery/replay and CandleStore execute. The only provider I/O is an axios.get seam returning captured native Kraken rows, an explicit HTTP 503, or an explicitly truncated boundary-only response.', 'The clock and retry timers are controlled; the HTTP response filters captured rows against the actual requested since value. No real exchange outage was injected.', 'Indicators and strategy ingestion are observation seams. This proves recovery behavior, not strategy profitability or trade outcomes.', 'The control capture contains genuine candles at the three missing timestamps. This does not require a candle in a broker interval with no trades.'] }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
