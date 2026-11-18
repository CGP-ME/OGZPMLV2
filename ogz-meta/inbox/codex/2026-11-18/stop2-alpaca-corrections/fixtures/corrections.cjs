'use strict';

// Runs only in the disposable helper namespace. Synthetic broker messages are
// protocol fixtures, not trading results or a claim of live provider verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const baseline = process.argv.includes('--baseline');
const sourceOverrides = process.argv.find(arg => arg.startsWith('--source-overrides='));
if (baseline || sourceOverrides) {
  const sourceFile = sourceOverrides ? sourceOverrides.slice('--source-overrides='.length) : path.join(__dirname, 'before-source.json');
  for (const [name, source] of Object.entries(JSON.parse(fs.readFileSync(sourceFile)))) {
    fs.writeFileSync(name, source);
  }
}
const credentials = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(credentials, ['ALPACA_API_KEY=fixture-key', 'ALPACA_API_SECRET=fixture-secret',
  'KRAKEN_API_KEY=fixture-key', 'KRAKEN_API_SECRET=fixture-secret',
  'WEBSOCKET_AUTH_TOKEN=fixture-token'].join('\n') + '\n');
process.env.DOTENV_CONFIG_PATH = credentials;
process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
ConfigLoader.load({ role: 'bot', silent: true });
const AlpacaAdapter = require(path.join(process.cwd(), 'brokers/AlpacaAdapter'));
const { CandleStore } = require(path.join(process.cwd(), 'core/CandleStore'));
const CandleProcessor = require(path.join(process.cwd(), 'core/CandleProcessor'));
const { SymbolTradingContext } = require(path.join(process.cwd(), 'core/SymbolTradingContext'));
const MultiTimeframeAdapter = require(path.join(process.cwd(), 'modules/MultiTimeframeAdapter'));
const IndicatorEngine = require(path.join(process.cwd(), 'core/indicators/IndicatorEngine'));
const stateManager = require(path.join(process.cwd(), 'core/StateManager')).getInstance();
const acorn = require('acorn');
function parsed(filename) {
  const source = fs.readFileSync(filename, 'utf8'), nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type) nodes.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' }));
  return { source, nodes };
}
const runner = parsed('run-empire-v2.js');
const frames = ['1m', '5m'], symbols = ['NVDA', 'TSLA'];
const scope = { brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper' };
const candleStore = new CandleStore({ maxCandles: 2000 });
const engineConfig = { ...ConfigLoader.get('indicators.engine'), ...ConfigLoader.get('internals.indicators.engine') };
const contexts = new Map(), mtf = new Map();
for (const symbol of symbols) {
  contexts.set(symbol, new Map(frames.map(timeframe => [timeframe, new SymbolTradingContext(symbol, candleStore, {
    timeframe, indicatorConfig: { ...engineConfig, tf: timeframe },
    emaCrossoverConfigProvider: () => ({ ...ConfigLoader.get('strategies.EMASMACrossover'), ...ConfigLoader.get('strategyBehavior.emaCrossover') }),
    maDynamicSRConfig: ConfigLoader.get('strategies.MADynamicSR'),
    maDynamicSRConfigProvider: () => ConfigLoader.get('strategies.MADynamicSR'),
    volumeProfileConfigProvider: () => ConfigLoader.get('strategies.VolumeProfile'),
  })])));
  const service = ConfigLoader.get('orchestrator.mtfConfluenceService');
  mtf.set(symbol, new MultiTimeframeAdapter({ baseTimeframe: '1m', activeTimeframes: ConfigLoader.get('orchestrator.mtfTimeframes'),
    minReadyTimeframes: service.minReadyTimeframes, weights: service.weights,
    maxCandlesByTimeframe: ConfigLoader.get('internals.multiTimeframe.maxCandlesByTimeframe') }));
}
const decisions = [], journal = [], traces = [], events = [], failures = [], commands = [], restCalls = [];
const bot = {
  sessionRouter: { activeSession: 'stocks', activeBroker: { id: 'alpaca' } },
  tradingPair: 'NVDA', candleTimeframe: '1m', evaluationTimeframes: frames,
  config: { dataFeed: ConfigLoader.get('dataFeed'), assetClass: 'stocks', brokerId: 'alpaca' },
  _candleStore: candleStore, priceHistory: [], candleSaveCounter: 0, saveCandleHistory() {},
  indicatorEngine: new IndicatorEngine({ ...engineConfig, symbol: 'NVDA', tf: '1m' }),
  symbolContexts: new Map(symbols.map(symbol => [symbol, contexts.get(symbol).get('1m')])),
  timeframeHistories: {},
  getSymbolTimeframeContext: (symbol, timeframe) => contexts.get(symbol)?.get(timeframe),
  getCandleScopeEnvelope: ({ timeframe }) => ({ ...scope, timeframe }),
  _markActiveTimeframeData() {}, syncDashboardRuntimeScope() {},
  strategyOrchestrator: {
    ingestMarketCandle(symbol, candle) { mtf.get(symbol).ingestCandle(candle, candle.timeframe); },
    captureDecisionMtf(symbol, candle) { return mtf.get(symbol).captureDecisionSnapshot(candle); },
  },
  journalBridge: { recordClosedCandle: candle => journal.push(structuredClone(candle)) },
  _trackRuntimeOperation(_label, operation) { return operation(); },
  runTradingCycle(symbol, traceId, timeframe, input) { decisions.push({ symbol, timeframe, traceId, input }); },
};
bot.candleProcessor = new CandleProcessor(bot);
bot.handleMarketData = packet => bot.candleProcessor.handleMarketData(packet);
let trace = 0;
const sandbox = vm.createContext({ bot, ConfigLoader, Date, Set, Map, console, structuredClone, stateManager,
  createTraceId: () => `fixture-${++trace}`,
  emitTrace: (_ctx, type, fields) => traces.push({ type, ...fields }),
  ...require(path.join(process.cwd(), 'foundation/ohlc-normalize')),
  ...require(path.join(process.cwd(), 'core/ReplayClosedCandleBoundary')),
});
for (const name of ['normalizeRuntimeSymbol', 'describeSymbolContexts', 'ohlcTimestampMs', 'normalizeOhlcForProcessor']) {
  const node = runner.nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  assert.ok(node, name);
  vm.runInContext(runner.source.slice(node.start, node.end), sandbox);
}
function method(file, name, owner) {
  const node = file.nodes.find(n => n.type === 'MethodDefinition' && n.key.name === name);
  assert.ok(node, name);
  return vm.runInContext('({' + file.source.slice(node.start, node.end) + '})', sandbox)[name].bind(owner);
}
for (const name of ['storeTimeframeCandle', 'storeSymbolTimeframeCandle', 'getSymbolTimeframeCandles']) bot[name] = method(runner, name, bot);
const diagnostics = runner.nodes.find(n => n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.property.name === 'timeframeDiagnostics');
bot.timeframeDiagnostics = vm.runInContext('(' + runner.source.slice(diagnostics.right.start, diagnostics.right.end) + ')', sandbox);
bot.tradingLoop = { captureDecisionInput: method(parsed('core/TradingLoop.js'), 'captureDecisionInput', { ctx: bot }) };
const handler = runner.nodes.find(n => n.type === 'VariableDeclarator' && n.id.name === 'ohlcHandler');
const onCandle = vm.runInContext('(function(){ return (' + runner.source.slice(handler.init.start, handler.init.end) + '); }).call(bot)', sandbox);
const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper',
  accountId: scope.accountId, webSocket: ConfigLoader.get('broker.alpacaWebSocket') });
adapter._buildResilientWS(); // Construct the real stream; never start/connect it.
adapter.rws.isReady = () => true;
adapter.rws.send = packet => commands.push(structuredClone(packet));
adapter.rws.stop = async () => ({ success: true });
adapter.on('ohlc', event => { events.push(structuredClone(event)); onCandle(event); });
adapter.on('broker_truth_unavailable', failure => failures.push(failure));
for (const symbol of symbols) for (const timeframe of frames) adapter.subscribeToCandles(symbol, timeframe, () => {});
adapter._replaySubscriptions();
const end = Math.floor(Date.now() / 300000) * 300000;
function restBar(start, close) { return { t: start, o: close - 1, h: close + 2, l: close - 2, c: close, v: close * 10 }; }
function message(type, symbol, start, close) { return { T: type, S: symbol, ...restBar(start, close), t: new Date(start).toISOString() }; }
const restBySymbol = new Map(symbols.map((symbol, index) => [symbol, [restBar(end - 300000, 100 + index * 100), restBar(end, 101 + index * 100)]]));
let pending = null;
adapter.getCandles = (symbol, timeframe, count) => {
  restCalls.push({ symbol, timeframe, count });
  if (pending) { const promise = pending; pending = null; return promise; }
  return Promise.resolve(structuredClone(restBySymbol.get(symbol)));
};
async function settle() {
  for (;;) {
    const active = [...adapter.barSubscriptions.values()].flatMap(sub => [...sub.requestedFrames.values()].map(frame => frame.requestedBarFetch)).filter(Boolean);
    if (!active.length) return;
    await Promise.all(active);
  }
}
function check(condition, label) { if (!baseline) assert.ok(condition, label); return Boolean(condition); }

(async () => {
  // Warm the actual indicator and MTF owners before revising their input. A
  // comparison of two empty/warming snapshots would not establish numeric repair.
  for (const [index, symbol] of symbols.entries()) {
    for (const timeframe of frames) {
      const interval = timeframe === '1m' ? 60000 : 300000;
      for (let i = 0; i < 60; i++) {
        const candle = restBar(end - (61 - i) * interval, 90 + index * 100 + i * 0.1 + (i % 3) * 0.2);
        bot.candleProcessor.processNewCandle({ ...candle, ...scope, symbol, timeframe, etime: candle.t + interval }, { persist: false });
      }
    }
  }
  const subscriptionComplete = commands.every(command => JSON.stringify(command.bars) === JSON.stringify(command.updatedBars));
  for (const [index, symbol] of symbols.entries()) adapter._handleStreamMessage(message('b', symbol, end - 60000, 100 + index * 100));
  await settle();
  assert.equal(decisions.length, 4);
  const decisionBeforeCorrection = JSON.stringify(decisions);
  const firstHistorySize = candleStore.getCandleCount('NVDA', '1m');
  restBySymbol.set('NVDA', [restBar(end - 300000, 105), restBar(end, 106)]);
  adapter._handleStreamMessage(message('u', 'NVDA', end - 60000, 105));
  await settle();
  const correctedMinute = candleStore.getLatestCandle('NVDA', '1m');
  const correctedFive = candleStore.getLatestCandle('NVDA', '5m');
  const outcome = {
    subscriptionAndReplayIncludeCorrections: check(subscriptionComplete, 'initial/reconnect subscriptions'),
    nativeCorrectionStored: check(correctedMinute.c === 105, 'minute revision stored'),
    nativeCorrectionDoesNotAppend: check(candleStore.getCandleCount('NVDA', '1m') === firstHistorySize, 'replacement, not append'),
    higherFrameCorrectionStored: check(correctedFive.c === 105, 'REST same-start revision stored'),
    otherSymbolUnchanged: check(candleStore.getLatestCandle('TSLA', '1m').c === 200 && candleStore.getLatestCandle('TSLA', '5m').c === 200, 'symbol ownership'),
    decisionsRemainImmutable: check(JSON.stringify(decisions) === decisionBeforeCorrection && journal.length === 4, 'no repeated decision or rewritten receipt'),
  };
  adapter._handleStreamMessage(message('b', 'NVDA', end, 108));
  await settle();
  const decisionCount = decisions.length;
  const higherEventCount = events.filter(event => event.symbol === 'NVDA' && event.timeframe === '5m').length;
  adapter._handleStreamMessage(message('u', 'NVDA', end - 60000, 107));
  await settle();
  outcome.historicalCorrectionKeepsLatestMarketData = check(contexts.get('NVDA').get('1m').marketData.price === 108, 'historical correction must not rewind latest market data');
  outcome.historicalCorrectionKeepsLatestMark = check(stateManager.getLastPrice('NVDA') === 108, 'mark timestamp remains monotonic');
  outcome.unchangedRestBarsNotReemitted = check(events.filter(event => event.symbol === 'NVDA' && event.timeframe === '5m').length === higherEventCount, 'unchanged REST bars omitted');
  outcome.historicalCorrectionNotNewDecision = check(decisions.length === decisionCount, 'older revision does not create decision');

  // The revised history must calculate the same indicator values as a fresh
  // engine fed the corrected broker bars, including an older retained revision.
  const rebuilt = new IndicatorEngine({ ...engineConfig, symbol: 'NVDA', tf: '1m' });
  for (const candle of candleStore.getCandles('NVDA', '1m')) rebuilt.updateCandle(candle);
  const indicators = contexts.get('NVDA').get('1m').indicatorEngine.getSnapshot().indicators;
  for (const field of ['rsi', 'atr', 'macd', 'macdSignal']) assert.ok(Number.isFinite(indicators[field]), field + ' warmed');
  assert.deepEqual(indicators, rebuilt.getSnapshot().indicators);
  outcome.indicatorsMatchCorrectedHistory = true;
  outcome.mtfStoresCorrection = check(mtf.get('NVDA').candles.get('1m').find(candle => candle.t === end - 60000).c === 107
    && mtf.get('NVDA').candles.get('5m').find(candle => candle.t === end - 300000).c === 105, 'MTF correction ownership');

  // Empty decision cursor models hydration/reconnection, not permission to
  // treat the first received correction as an entry event.
  contexts.get('TSLA').get('1m').lastDecisionCandle = null;
  const beforeFirstRevision = decisions.length;
  adapter._handleStreamMessage(message('u', 'TSLA', end - 60000, 202));
  await settle();
  outcome.firstRevisionWithNoDecisionCursorDoesNotEnter = check(decisions.length === beforeFirstRevision && candleStore.getLatestCandle('TSLA', '1m').c === 202, 'revision remains historical without a decision cursor');

  let resolveFetch;
  pending = new Promise(resolve => { resolveFetch = resolve; });
  adapter._handleStreamMessage(message('b', 'NVDA', end + 60000, 110));
  const fetchCountBeforeRevision = restCalls.length;
  restBySymbol.set('NVDA', [restBar(end - 300000, 109), restBar(end, 111)]);
  adapter._handleStreamMessage(message('u', 'NVDA', end + 60000, 111));
  adapter._handleStreamMessage(message('u', 'NVDA', end + 60000, 111));
  assert.equal(restCalls.length, fetchCountBeforeRevision);
  resolveFetch([restBar(end - 300000, 105), restBar(end, 110)]);
  await settle();
  outcome.pendingRevisionRefetchedOnce = check(restCalls.length === fetchCountBeforeRevision + 1 && candleStore.getLatestCandle('NVDA', '5m').c === 109, 'one coalesced followup fetch obtains revised REST data');

  // Data received as a revision cannot consume the later normal close event.
  for (let minute = 0; minute < 4; minute++) {
    adapter._handleStreamMessage(message('b', 'TSLA', end + minute * 60000, 203 + minute));
    await settle();
  }
  restBySymbol.set('TSLA', [restBar(end, 210), restBar(end + 300000, 211)]);
  const tslaCloses = () => decisions.filter(decision => decision.symbol === 'TSLA' && decision.timeframe === '5m').length;
  const beforeRevisionCloseCount = tslaCloses();
  adapter._handleStreamMessage(message('u', 'TSLA', end + 240000, 210));
  await settle();
  check(tslaCloses() === beforeRevisionCloseCount, 'revision does not trigger the new higher-frame close');
  adapter._handleStreamMessage(message('b', 'TSLA', end + 240000, 210));
  await settle();
  outcome.normalCloseAfterRevisionStillDispatches = check(tslaCloses() === beforeRevisionCloseCount + 1, 'unchanged values must not suppress the first normal close');

  // A genuine close queued alongside a correction must retain its own boundary.
  let finishMixedFetch;
  pending = new Promise(resolve => { finishMixedFetch = resolve; });
  adapter._handleStreamMessage(message('b', 'NVDA', end + 120000, 113));
  adapter._handleStreamMessage(message('b', 'NVDA', end + 180000, 114));
  adapter._handleStreamMessage(message('u', 'NVDA', end + 180000, 115));
  adapter._handleStreamMessage(message('b', 'NVDA', end + 240000, 120));
  restBySymbol.set('NVDA', [restBar(end, 120), restBar(end + 300000, 121)]);
  const nvdaCloses = () => decisions.filter(decision => decision.symbol === 'NVDA' && decision.timeframe === '5m').length;
  const beforeMixedCloseCount = nvdaCloses();
  finishMixedFetch([restBar(end - 300000, 109), restBar(end, 114)]);
  await settle();
  outcome.mixedRefreshPreservesNormalClose = check(nvdaCloses() === beforeMixedCloseCount + 1 && candleStore.getLatestCandle('NVDA', '5m').c === 120, 'mixed pending messages retain the genuine new close');

  pending = Promise.reject(new Error('fixture REST outage'));
  adapter._handleStreamMessage(message('b', 'NVDA', end + 300000, 121));
  await settle();
  outcome.restFailureEmittedWithSymbol = check(failures.length === 1 && failures[0].symbol === 'NVDA' && failures[0].timeframe === '5m' && failures[0].reason === 'alpaca_requested_bar_unavailable', 'REST error remains explicit');

  let finishRetiredFetch;
  pending = new Promise(resolve => { finishRetiredFetch = resolve; });
  adapter._handleStreamMessage(message('b', 'NVDA', end + 360000, 122));
  adapter._handleStreamMessage(message('u', 'NVDA', end + 360000, 123));
  const eventsBeforeRetirement = events.length, fetchesBeforeRetirement = restCalls.length;
  await adapter.unsubscribeAll();
  finishRetiredFetch([restBar(end - 300000, 999)]);
  await new Promise(resolve => setImmediate(resolve));
  outcome.retiredSubscriptionCannotPublishOrRefetch = check(events.length === eventsBeforeRetirement && restCalls.length === fetchesBeforeRetirement, 'retired subscription cannot deliver stale REST work');
  const unsubscribe = commands.at(-1);
  outcome.unsubscribeIncludesCorrections = check(JSON.stringify(unsubscribe.bars) === JSON.stringify(unsubscribe.updatedBars), 'unsubscribe both channels');
  const sources = ['brokers/AlpacaAdapter.js', 'core/CandleProcessor.js', 'core/ReplayClosedCandleBoundary.js', 'run-empire-v2.js',
    'core/CandleStore.js', 'core/indicators/IndicatorEngine.js', 'core/SymbolTradingContext.js', 'core/TradingLoop.js',
    'core/StateManager.js', 'modules/MultiTimeframeAdapter.js', 'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'];
  console.log('ALPACA_CORRECTION_RECEIPT ' + JSON.stringify({ baseline, outcome, commands, restCalls,
    sourceHashes: Object.fromEntries(sources.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')])),
    sample: { nativeCorrection: correctedMinute, higherCorrection: correctedFive,
      correctedHistoryIndicators: { rsi: indicators.rsi, atr: indicators.atr, macd: indicators.macd, macdSignal: indicators.macdSignal } },
    decisionCount: decisions.length, closedCandleReceiptCount: journal.length,
    correctionEvents: events.filter(event => event.candleRevision).map(event => ({ symbol: event.symbol, timeframe: event.timeframe, end: event.data.etime, close: event.data.c })),
    limits: ['Synthetic broker transport/REST responses and scoped account in disposable namespace; no paid broker request or order',
      'Actual adapter, runner OHLC handler, normalizer, CandleProcessor, CandleStore, symbol contexts, indicators, MTF and decision capture',
      'Runner startup, SessionRouter transitions, strategy selection, order execution and live dashboard are not instantiated',
      'Journal, scope supplier, transport and trade dispatch are observation seams; this is not live activation proof'] }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
