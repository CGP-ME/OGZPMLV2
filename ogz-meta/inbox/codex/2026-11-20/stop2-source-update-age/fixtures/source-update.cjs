'use strict';

// Protocol replay only. Run through scripts/test-isolated.py; no live accounts,
// credentials, orders, host journals or services enter this helper.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const acorn = require('acorn');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const baseline = process.argv.includes('--baseline');
const overrides = process.argv.find(arg => arg.startsWith('--source='));
if (baseline || overrides) {
  const file = overrides ? overrides.slice('--source='.length) : path.join(__dirname, 'before-source.json');
  for (const [name, value] of Object.entries(JSON.parse(fs.readFileSync(file)))) fs.writeFileSync(name, value);
}
const log = [], traces = [];
const originalConsole = { ...console };
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => log.push({ level, text: args.join(' ') });
const RealDate = Date;
let now = RealDate.parse('2026-11-19T16:08:02Z');
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
};
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
ConfigLoader.load({ role: 'bot', silent: true });
const CandleProcessor = require(process.cwd() + '/core/CandleProcessor');
const { CandleStore } = require(process.cwd() + '/core/CandleStore');
const AlpacaAdapter = require(process.cwd() + '/brokers/AlpacaAdapter');
const KrakenAdapter = require(process.cwd() + '/brokers/KrakenIBrokerAdapter');
const { subscribeTrace, emitTrace } = require(process.cwd() + '/core/TraceSpine');
const unsubscribe = subscribeTrace(event => traces.push(event));
const files = ['brokers/AlpacaAdapter.js', 'brokers/KrakenIBrokerAdapter.js', 'run-empire-v2.js', 'core/CandleProcessor.js'];
const hashes = Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const runnerSource = fs.readFileSync('run-empire-v2.js', 'utf8'), nodes = [];
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type) nodes.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(acorn.parse(runnerSource, { ecmaVersion: 'latest' }));
const frames = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const durations = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
let sequence = 0;
function makeBot(symbol, brokerId) {
  const store = new CandleStore({ maxCandles: 2000 });
  const assetClass = brokerId === 'alpaca' ? 'stocks' : 'crypto';
  const scope = { brokerId, accountId: 'fixture-account', accountIdSource: 'fixture', assetClass, executionMode: 'paper' };
  const contexts = new Map(frames.map(timeframe => [timeframe, {
    symbol, timeframe, get priceHistory() { return store.getCandles(symbol, timeframe); },
    indicatorEngine: { updateCandle() {} },
  }]));
  const bot = {
    tradingPair: symbol, candleTimeframe: '1m', observationTimeframes: frames, evaluationTimeframes: [],
    config: { dataFeed: ConfigLoader.get('dataFeed'), brokerId, assetClass, executionMode: 'paper' },
    sessionRouter: { activeSession: assetClass, activeBroker: { id: brokerId } },
    symbolContexts: new Map([[symbol, contexts.get('1m')]]), timeframeDiagnostics: {},
    getSymbolTimeframeContext: (_symbol, timeframe) => contexts.get(timeframe),
    getCandleScopeEnvelope: ({ timeframe }) => ({ ...scope, timeframe }),
    _candleStore: store, priceHistory: [], candleSaveCounter: 0, saveCandleHistory() {},
    strategyOrchestrator: { ingestMarketCandle() {} },
    _markActiveTimeframeData() {}, syncDashboardRuntimeScope() {},
  };
  const processor = new CandleProcessor(bot);
  bot.handleMarketData = packet => processor.handleMarketData(packet);
  const sandbox = vm.createContext({ bot, Date, console, Set, Map, ConfigLoader, stateManager: null,
    createTraceId: () => `fixture-${++sequence}`, emitTrace,
    ...require(process.cwd() + '/foundation/ohlc-normalize'),
    ...require(process.cwd() + '/core/ReplayClosedCandleBoundary'),
  });
  for (const name of ['normalizeRuntimeSymbol', 'describeSymbolContexts', 'ohlcTimestampMs', 'normalizeOhlcForProcessor']) {
    const node = nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
    assert.ok(node, name);
    vm.runInContext(runnerSource.slice(node.start, node.end), sandbox);
  }
  const node = nodes.find(n => n.type === 'VariableDeclarator' && n.id.name === 'ohlcHandler');
  const onCandle = vm.runInContext('(function(){return (' + runnerSource.slice(node.init.start, node.init.end) + ');}).call(bot)', sandbox);
  return { bot, processor, onCandle, store, scope };
}
function streamBar(type, closeMs, price = 100) {
  return { T: type, S: 'TSLA', t: new Date(closeMs - 60000).toISOString(), o: price - 1, h: price + 1, l: price - 2, c: price, v: 123 };
}
function getReceipt(start) { return traces.slice(start).filter(t => t.event === 'CANDLE_PROCESSOR_RECEIVED').map(t => t.fields); }
function ageWarnings(start) { return log.slice(start).filter(l => /\[STALE DATA\]|\[DATA UPDATE/.test(l.text)); }
async function stockRun(at, delay = 2000) {
  now = RealDate.parse(at);
  const bot = makeBot('TSLA', 'alpaca');
  const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper', accountId: 'fixture-account', webSocket: ConfigLoader.get('broker.alpacaWebSocket') });
  adapter._buildResilientWS();
  adapter.rws.isReady = () => true;
  adapter.rws.send = () => {};
  for (const tf of frames) adapter.subscribeToCandles('TSLA', tf, () => {});
  const sourceClose = now - delay;
  adapter.getCandles = async (_symbol, timeframe) => {
    const duration = durations[timeframe];
    let end = Math.floor(sourceClose / duration) * duration;
    if (at.startsWith('2026-11-23') && timeframe === '1d') end = RealDate.parse('2026-11-21T05:00:00Z');
    return [{ t: end - duration, o: 99, h: 101, l: 98, c: 100, v: 123 }];
  };
  const events = [], traceStart = traces.length, logStart = log.length;
  adapter.on('ohlc', event => { events.push(structuredClone(event)); bot.onCandle(event); });
  adapter._handleStreamMessage(streamBar('b', sourceClose));
  await Promise.all([...adapter.barSubscriptions.get('TSLA').requestedFrames.values()].map(f => f.requestedBarFetch).filter(Boolean));
  const rows = getReceipt(traceStart), warnings = ageWarnings(logStart);
  assert.equal(events.length, 7);
  assert.equal(rows.length, 7);
  for (const event of events) {
    const stored = bot.store.getLatestCandle('TSLA', event.timeframe);
    for (const field of ['o', 'h', 'l', 'c', 'v']) assert.equal(stored[field], event.data[field]);
    assert.equal(stored.etime, event.data.etime);
    if (!baseline) {
      assert.equal(event.sourceEventTime, sourceClose);
      assert.equal(rows.find(r => r.timeframe === event.timeframe).sourceEventAgeMs, delay);
    }
  }
  const revisionLogStart = log.length;
  adapter._handleStreamMessage(streamBar('u', sourceClose, 101));
  await Promise.all([...adapter.barSubscriptions.get('TSLA').requestedFrames.values()].map(f => f.requestedBarFetch).filter(Boolean));
  if (!baseline && delay <= 120000) assert.equal(ageWarnings(revisionLogStart).length, 0);
  return { at, sourceClose, rows, warnings,
    candleValues: frames.map(timeframe => {
      const candle = bot.store.getLatestCandle('TSLA', timeframe);
      return Object.fromEntries(['symbol', 'timeframe', 't', 'etime', 'o', 'h', 'l', 'c', 'v'].map(k => [k, candle[k]]));
    }) };
}
function krakenRun(mode, ageMs, sample = null) {
  now = sample ? sample.receivedAt : RealDate.parse('2026-11-19T16:08:02Z');
  const bot = makeBot('BTC-USD', 'kraken');
  if (mode === 'historical') bot.bot.config.enableBacktestMode = true;
  const adapter = new KrakenAdapter();
  let deliver;
  adapter.kraken.connectWebSocketStream = (...args) => { deliver = args.find(x => typeof x === 'function'); };
  adapter.on('ohlc', bot.onCandle);
  if (mode === 'orderbook') adapter.subscribeToOrderBook('BTC-USD');
  else adapter.subscribeToCandles('BTC-USD', '4h');
  const interval = sample ? Number(sample.message[2].split('-')[1]) : 240;
  const timeframe = Object.keys(durations).find(tf => durations[tf] === interval * 60000);
  const end = sample ? Number(sample.message[1][1]) * 1000 : Math.ceil(now / durations['4h']) * durations['4h'];
  const traceStart = traces.length, logStart = log.length;
  // Recorded public v1 data enters the IBroker adapter in the existing canonical
  // start/end shape; original epoc_last remains the source-update timestamp.
  const data = sample ? [...sample.message[1]] : [(end - durations['4h']) / 1000, end / 1000, 99, 101, 98, 100, 100, 123, 4];
  data[0] = (end - interval * 60000) / 1000;
  deliver({ type: 'ohlc', timeframe, symbol: 'BTC-USD', pair: 'XBT/USD', data,
    priceTimestamp: sample ? sample.message[1][0] : ageMs === null ? undefined : String((now - ageMs) / 1000) });
  const candle = bot.store.getLatestCandle('BTC-USD', timeframe);
  for (const [field, index] of [['o', 2], ['h', 3], ['l', 4], ['c', 5], ['v', 7]]) assert.equal(candle[field], Number(data[index]));
  assert.equal(candle.etime, end);
  return { mode, inputAgeMs: ageMs, rows: getReceipt(traceStart), warnings: ageWarnings(logStart) };
}
(async () => {
  const normal = await stockRun('2026-11-19T16:08:02Z');
  const weekend = await stockRun('2026-11-23T14:31:02Z');
  const delayed = await stockRun('2026-11-19T16:13:02Z', 302000);
  const kraken = [krakenRun('candles', 1000), krakenRun('candles', 300000), krakenRun('orderbook', 300000), krakenRun('candles', null), krakenRun('candles', -30000)];
  const historical = krakenRun('historical', null);
  assert.equal(historical.warnings.length, 0);
  const publicCapture = JSON.parse(fs.readFileSync(path.join(__dirname, 'kraken-public.json')));
  const publicReplay = publicCapture.rows.map(sample => krakenRun('candles', null, sample));
  if (baseline) {
    assert.ok(normal.warnings.length > 0, 'reproduce higher-frame false alarms');
    assert.equal(kraken[1].warnings.length, 0, 'reproduce future interval masking old update');
  } else {
    assert.equal(normal.warnings.length, 0);
    assert.equal(weekend.warnings.length, 0);
    assert.equal(delayed.warnings.length, 7);
    assert.equal(kraken[0].rows[0].sourceEventStatus, 'on_time');
    assert.equal(kraken[0].warnings.length, 0);
    for (const sample of kraken.slice(1, 3)) {
      assert.equal(sample.rows[0].sourceEventStatus, 'delayed');
      assert.equal(sample.warnings.length, 1);
    }
    assert.equal(kraken[3].rows[0].sourceEventStatus, 'unavailable');
    assert.equal(kraken[4].rows[0].sourceEventStatus, 'future_timestamp');
    assert.equal(kraken[3].warnings.length, 1);
    assert.equal(kraken[4].warnings.length, 1);
    assert.equal(historical.rows[0].sourceEventStatus, 'historical_replay');
    for (let i = 0; i < publicReplay.length; i++) {
      const sourceTime = Math.trunc(Number(publicCapture.rows[i].message[1][0]) * 1000);
      assert.equal(publicReplay[i].rows[0].sourceEventTimeMs, sourceTime);
      assert.equal(publicReplay[i].rows[0].sourceEventAgeMs, publicCapture.rows[i].receivedAt - sourceTime);
    }
  }
  unsubscribe();
  global.Date = RealDate;
  Object.assign(console, originalConsole);
  process.stdout.write(JSON.stringify({ baseline, hashes, normal, weekend, delayed, kraken, historical, publicReplay,
    limits: ['Synthetic protocol/REST fixtures with actual adapters, runner callback, processor, store and trace; no live activation or trading-strategy proof.'] }, null, 2) + '\n');
})().catch(error => { Object.assign(console, originalConsole); console.error(error); process.exitCode = 1; });
