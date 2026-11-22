'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const overlay = process.argv.find(v => v.startsWith('--source='));
if (overlay) for (const [file, text] of Object.entries(JSON.parse(fs.readFileSync(overlay.slice(9))))) fs.writeFileSync(file, text);
const baseline = process.argv.includes('--baseline');
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const loaded = require(process.cwd() + '/foundation/ConfigLoader').load({ role: 'bot', silent: true });
const Kraken = require(process.cwd() + '/brokers/KrakenIBrokerAdapter');
const Alpaca = require(process.cwd() + '/brokers/AlpacaAdapter');
const CandleProcessor = require(process.cwd() + '/core/CandleProcessor');
const { CandleStore } = require(process.cwd() + '/core/CandleStore');
const { subscribeTrace } = require(process.cwd() + '/core/TraceSpine');
const axios = require('axios');
const krakenCapture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-22/stop2-kraken-history-pacing/fixtures/native-ohlc.json'));
const alpacaCapture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/alpaca-native.json'));
const frames = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
const traces = [], requests = [], timers = new Map(), results = {};
const unsubscribe = subscribeTrace(event => traces.push(event));
let clock, timerId = 0, sequence = 0;
Date.now = () => clock;
global.setInterval = (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms, repeating: true }); return id; };
global.clearInterval = id => timers.delete(id);
global.setTimeout = (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms, repeating: false }); return id; };
global.clearTimeout = id => timers.delete(id);
const flush = () => new Promise(resolve => setImmediate(resolve));
function source(kind, frame) {
  const ms = frames[frame];
  if (kind === 'kraken') {
    const capture = krakenCapture.observations.find(o => o.interval === ms / 60000);
    const rows = capture.response.result.XXBTZUSD;
    return { rows, native: rows.map(c => ({ t: Number(c[0]) * 1000, etime: Number(c[0]) * 1000 + ms, o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[6]) })) };
  }
  const rows = alpacaCapture.lanes.bot[frame].response.bars.slice().sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return { rows, native: rows.map(c => ({ t: Date.parse(c.t), etime: Date.parse(c.t) + ms, o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c), v: Number(c.v) })) };
}
function build(kind, frame, mode = 'full') {
  const ms = frames[frame], { rows, native } = source(kind, frame);
  clock = Math.max(clock || 0, native[4].etime) + (++sequence * 2000);
  const broker = kind === 'kraken' ? new Kraken({ apiKey: 'fixture-key', apiSecret: 'fixture-secret' }) : new Alpaca({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
  const store = new CandleStore({ maxCandles: 2000 });
  const contexts = new Map(), ingested = [];
  const symbol = kind === 'kraken' ? 'BTC-USD' : 'TSLA';
  const ctx = { config: loaded.config, tradingPair: symbol, candleTimeframe: frame, priceHistory: [], candleSaveCounter: 0, saveCandleHistory() {}, _candleStore: store,
    strategyOrchestrator: { ingestMarketCandle(s, c) { ingested.push({ symbol: s, t: c.t, etime: c.etime }); } },
    getSymbolTimeframeContext(s, tf) { const key = s + ' ' + tf; if (!contexts.has(key)) contexts.set(key, { symbol: s, timeframe: tf, get priceHistory() { return store.getCandles(s, tf); }, indicatorEngine: { updateCandle() {} } }); return contexts.get(key); },
    sessionRouter: { activeBroker: broker, activeSession: kind === 'kraken' ? 'crypto' : 'stocks', activeCallbackEpoch: 1, transitionInProgress: false, stopping: false },
  };
  const processor = new CandleProcessor(ctx); ctx.candleProcessor = processor;
  const scope = { symbol, timeframe: frame, brokerId: broker.getBrokerName(), accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: kind === 'kraken' ? 'crypto' : 'stocks', executionMode: 'paper', sessionRouterEpoch: 1, traceId: 'range-fixture-' + sequence };
  let responseMode = mode, settle;
  axios.get = async (url, options) => {
    const p = kind === 'kraken' ? Object.fromEntries(new URL(url).searchParams) : { ...options.params };
    const from = kind === 'kraken' ? Number(p.since) * 1000 : Date.parse(p.start);
    const until = kind === 'kraken' ? clock : Date.parse(p.end) + 1;
    const startOf = c => kind === 'kraken' ? Number(c[0]) * 1000 : Date.parse(c.t);
    let selected = rows.filter(c => startOf(c) >= from && startOf(c) < until);
    if (responseMode === 'ordinary') selected = rows;
    if (responseMode === 'boundary_only') selected = [rows[4]];
    if (responseMode === 'sparse') selected = selected.filter(c => startOf(c) === native[0].t || startOf(c) >= native[4].t);
    if (responseMode === 'retention') selected = rows.slice(10, 20);
    if (responseMode === 'malformed') { selected = structuredClone(selected); const first = selected[0]; if (kind === 'kraken') first[1] = 'invalid'; else first.o = 'invalid'; }
    const request = { kind, frame, mode: responseMode, now: clock, start: from, end: until, limit: kind === 'kraken' ? null : p.limit, pageToken: p.page_token || null };
    requests.push(request);
    if (responseMode === 'unavailable') throw new Error('explicit fixture HTTP 503');
    let response;
    if (kind === 'kraken') {
      const cursor = responseMode === 'cursor_behind' ? native[0].t / 1000 : Math.floor(clock / ms) * ms / 1000 - ms / 1000;
      response = { data: { error: [], result: { XXBTZUSD: selected, last: cursor } } };
    } else {
      const offset = p.page_token ? Number(p.page_token) : 0;
      const pageSize = responseMode === 'paged' || responseMode === 'repeat_token' ? 1 : p.limit;
      const page = selected.slice(offset, offset + pageSize);
      const next = responseMode === 'repeat_token' ? '1' : offset + page.length < selected.length ? String(offset + page.length) : null;
      response = { data: { symbol: 'TSLA', bars: page, next_page_token: next } };
    }
    if (responseMode === 'held') return new Promise(resolve => { settle = () => resolve(response); });
    return response;
  };
  function seed() { for (const i of [0, 4]) processor.processNewCandle({ ...native[i], ...scope }); }
  function begin() { seed(); return processor.startBackfill(native[0].etime, native[4].etime, scope); }
  function snapshot() { return { stored: store.getCandles(symbol, frame).map(c => ({ t: c.t, etime: c.etime, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v })), pendingJobs: processor.backfillJobs.size, retryTimers: timers.size, events: traces.filter(t => t.traceId === scope.traceId && t.event.startsWith('GAP_BACKFILL_')), requests: requests.splice(0) }; }
  return { broker, processor, native, scope, ctx, begin, snapshot, setMode(v) { responseMode = v; }, settle() { settle(); }, cleanup() { processor.cleanup(); timers.clear(); } };
}
async function exercise(kind, mode) {
  const f = build(kind, '1m', mode);
  await f.begin();
  const r = f.snapshot();
  if (mode === 'full' || mode === 'paged') {
    assert.deepEqual(r.stored, f.native.slice(0, 5)); assert.equal(r.pendingJobs, 0);
    if (!baseline) assert.equal(r.events.find(t => t.event === 'GAP_BACKFILL_COMPLETED').fields.recoveredCandles, 3);
  } else if (mode === 'sparse') {
    assert.deepEqual(r.stored, [f.native[0], f.native[4]]); assert.equal(r.pendingJobs, 0);
    if (!baseline) assert.equal(r.events.find(t => t.event === 'GAP_BACKFILL_COMPLETED').fields.recoveredCandles, 0);
  } else {
    assert.equal(r.stored.length, 2);
    assert.equal(r.pendingJobs, 1); assert.equal(r.retryTimers, 1);
    assert.equal(r.events.filter(t => t.event === 'GAP_BACKFILL_COMPLETED').length, 0);
  }
  results[kind + '_' + mode] = r; f.cleanup();
}
async function main() {
  if (baseline) {
    const f = build('kraken', '1m', 'boundary_only'); await f.begin(); results.boundaryOnly = f.snapshot();
    assert.equal(results.boundaryOnly.pendingJobs, 0); assert.equal(results.boundaryOnly.stored.length, 2); f.cleanup();
  } else {
    for (const kind of ['kraken', 'alpaca']) for (const mode of ['full', 'sparse', 'boundary_only', 'malformed', 'unavailable']) await exercise(kind, mode);
    await exercise('kraken', 'retention'); await exercise('kraken', 'cursor_behind');
    await exercise('alpaca', 'paged'); await exercise('alpaca', 'repeat_token');
  }
  for (const kind of ['kraken', 'alpaca']) {
    const f = build(kind, '1m', 'unavailable'); await f.begin();
    clock += 31 * 60000; f.setMode('full');
    for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); }
    await flush();
    const r = f.snapshot(); results[kind + '_delayed_retry'] = r;
    if (!baseline) {
      assert.deepEqual(r.stored, f.native.slice(0, 5)); assert.equal(r.pendingJobs, 0);
      assert.equal(r.requests[0].start, r.requests[1].start);
      if (kind === 'alpaca') assert.equal(r.requests[0].end, r.requests[1].end);
    } else if (kind === 'kraken') { assert.equal(r.stored.length, 2); assert.equal(r.pendingJobs, 1); assert.ok(r.requests[1].start > f.native[4].etime); }
    f.cleanup();
  }
  if (!baseline) {
    for (const kind of ['kraken', 'alpaca']) {
      const f = build(kind, '1m', 'held'); const pending = f.begin(); await flush();
      f.processor.cleanup('session_transition'); f.ctx.sessionRouter.activeBroker = null; f.settle(); await pending;
      const r = f.snapshot(); assert.equal(r.stored.length, 2); assert.equal(r.pendingJobs, 0); assert.equal(r.retryTimers, 0);
      assert.equal(r.events.filter(t => t.event === 'GAP_BACKFILL_COMPLETED').length, 0);
      results[kind + '_retired_owner'] = r; f.cleanup();
    }
    for (const kind of ['kraken', 'alpaca']) for (const frame of Object.keys(frames)) {
      const f = build(kind, frame); await f.begin();
      const r = f.snapshot(); assert.deepEqual(r.stored, f.native.slice(0, 5)); assert.equal(r.pendingJobs, 0);
      results[kind + '_' + frame + '_range'] = r; f.cleanup();
      const ordinary = build(kind, frame, 'ordinary');
      const bars = await ordinary.broker.getCandles(ordinary.scope.symbol, frame, 60);
      assert.ok(Array.isArray(bars)); assert.deepEqual(bars, ordinary.native);
      results[kind + '_' + frame + '_ordinary'] = { count: bars.length, originalOhlcvPreserved: true, requests: requests.splice(0) }; ordinary.cleanup();
    }
  }
  unsubscribe();
  const files = ['core/CandleProcessor.js', 'core/CandleStore.js', 'brokers/KrakenIBrokerAdapter.js', 'kraken_adapter_simple.js', 'brokers/AlpacaAdapter.js', 'foundation/ohlc-normalize.js', 'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'];
  process.stdout.write(JSON.stringify({ baseline, isolation: 'test-isolated.py', results, sourceHashes: Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])), diagnosticLogs: logs.filter(l => l.level !== 'log'), limitations: ['Real adapter constructors, REST request builders, CandleProcessor gap jobs/replay and CandleStore run against captured native provider OHLCV. HTTP, clock and timers are controlled. Indicators and strategy intake are observation seams.', 'Explicit truncation, unavailable, malformed, retention, cursor and sparse scenarios alter the transport response only. They are controlled fault scenarios, not claims of live exchange events.', 'Known boundaries are seeded through processNewCandle; startBackfill is invoked directly for reproducible stock-session and higher-frame coverage. No production orders or PM2 changes.'] }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
