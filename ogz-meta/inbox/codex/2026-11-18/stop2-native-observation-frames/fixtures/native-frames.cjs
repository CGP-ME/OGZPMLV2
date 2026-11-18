'use strict';

// Protocol/data fixtures only. Real modules run inside the required disposable
// namespace; account, broker network, persistence and order dispatch are seams.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
require(path.join(process.cwd(), 'test/helpers/require-isolation.cjs'));
const baseline = process.argv.includes('--baseline');
const sourceArg = process.argv.find(arg => arg.startsWith('--source-overrides='));
if (sourceArg) for (const [name, source] of Object.entries(JSON.parse(fs.readFileSync(sourceArg.split('=')[1])))) fs.writeFileSync(name, source);
const credentials = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(credentials, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = credentials;
process.env.PROFILE = 'paper';
const ConfigLoader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
const resolvedConfig = ConfigLoader.load({ role: 'bot', silent: true });
const AlpacaAdapter = require(path.join(process.cwd(), 'brokers/AlpacaAdapter'));
const CandleProcessor = require(path.join(process.cwd(), 'core/CandleProcessor'));
const { CandleStore } = require(path.join(process.cwd(), 'core/CandleStore'));
const { CandleAggregator } = require(path.join(process.cwd(), 'core/CandleAggregator'));
const { SymbolTradingContext } = require(path.join(process.cwd(), 'core/SymbolTradingContext'));
const MultiTimeframeAdapter = require(path.join(process.cwd(), 'modules/MultiTimeframeAdapter'));
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
const runner = parsed('run-empire-v2.js'), router = parsed('core/SessionRouter.js');
const symbols = ['NVDA', 'TSLA'], allFrames = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const entryFrames = ['1m', '5m', '15m', '1h', '4h'];
const scope = { brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper' };
const decisions = [], journal = [], traces = [], events = [], restCalls = [], commands = [];
const store = new CandleStore({ maxCandles: 2000 });
const bot = {
  tradingPair: 'NVDA', candleTimeframe: ConfigLoader.get('execution.candleTimeframe'), _candleStore: store,
  priceHistory: [], candleSaveCounter: 0, saveCandleHistory() {}, timeframeHistories: {},
  config: { dataFeed: ConfigLoader.get('dataFeed'), assetClass: 'stocks', brokerId: 'alpaca' },
  candleAggregator: new CandleAggregator(), symbolContexts: new Map(), symbolTimeframeContexts: new Map(),
  getCandleScopeEnvelope: ({ timeframe }) => ({ ...scope, timeframe }),
  _recordSymbolContextRegistrationFailure(symbol, error) { assert.fail(`${symbol}: ${error.stack}`); },
  _markActiveTimeframeData() {}, syncDashboardRuntimeScope() {},
  journalBridge: { recordClosedCandle(candle) { journal.push(structuredClone(candle)); } },
  _trackRuntimeOperation(_label, operation) { return operation(); },
  runTradingCycle(symbol, traceId, timeframe, input) { decisions.push({ symbol, timeframe, traceId, input }); },
};
let trace = 0;
const sandbox = vm.createContext({ bot, ConfigLoader, resolvedConfig, SymbolTradingContext, MultiTimeframeAdapter,
  Date, Set, Map, console, structuredClone, stateManager,
  createTraceId: () => `fixture-${++trace}`, emitTrace: (_ctx, type, fields) => traces.push({ type, ...fields }),
  ...require(path.join(process.cwd(), 'foundation/ohlc-normalize')),
  ...require(path.join(process.cwd(), 'core/ReplayClosedCandleBoundary')),
});
function method(file, name, owner) {
  const node = file.nodes.find(n => n.type === 'MethodDefinition' && n.key.name === name);
  assert.ok(node, name);
  return vm.runInContext('({' + file.source.slice(node.start, node.end) + '})', sandbox)[name].bind(owner);
}
for (const name of ['normalizeRuntimeSymbol', 'describeSymbolContexts', 'ohlcTimestampMs', 'normalizeOhlcForProcessor', 'candleToProcessorOhlc']) {
  const node = runner.nodes.find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
  assert.ok(node, name); vm.runInContext(runner.source.slice(node.start, node.end), sandbox);
}
for (const name of ['observationTimeframes', 'evaluationTimeframes', 'timeframeDiagnostics']) {
  const node = runner.nodes.find(n => n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.property.name === name);
  if (node) bot[name] = vm.runInContext('(' + runner.source.slice(node.right.start, node.right.end) + ')', sandbox);
}
assert.deepEqual(Array.from(bot.evaluationTimeframes), entryFrames, 'entry eligibility stays at the existing five frames');
for (const name of ['_registerRoutableSymbolContexts', 'getSymbolTimeframeContext', 'storeTimeframeCandle', 'storeSymbolTimeframeCandle',
  'getSymbolTimeframeCandles', '_normalizeHydrationCandle', '_getRestRecoveryScopeEnvelope', 'hydrateActiveTimeframeFromRest']) bot[name] = method(runner, name, bot);
assert.deepEqual(Array.from(bot._registerRoutableSymbolContexts(symbols, { timeframe: bot.candleTimeframe })), symbols);
bot.indicatorEngine = bot.getSymbolTimeframeContext('NVDA', bot.candleTimeframe).indicatorEngine;
const orchestrator = { mtfBaseTimeframe: '1m', symbolStrategyModules: new Map() };
const orchestratorSource = parsed('core/StrategyOrchestrator.js');
for (const name of ['_buildMtfAdapterConfig', '_getSymbolStrategyModule', '_getMtfConfluenceAdapter', 'ingestMarketCandle', 'captureDecisionMtf']) {
  orchestrator[name] = method(orchestratorSource, name, orchestrator);
}
bot.strategyOrchestrator = orchestrator;
bot.candleProcessor = new CandleProcessor(bot);
bot.handleMarketData = data => bot.candleProcessor.handleMarketData(data);
bot.tradingLoop = { captureDecisionInput: method(parsed('core/TradingLoop.js'), 'captureDecisionInput', { ctx: bot }) };
const handler = runner.nodes.find(n => n.type === 'VariableDeclarator' && n.id.name === 'ohlcHandler');
const onCandle = vm.runInContext('(function(){ return (' + runner.source.slice(handler.init.start, handler.init.end) + '); }).call(bot)', sandbox);
const adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper',
  accountId: scope.accountId, webSocket: ConfigLoader.get('broker.alpacaWebSocket') });
adapter._buildResilientWS(); // Construct protocol machinery without connecting.
adapter.rws.isReady = () => true;
adapter.rws.send = packet => commands.push(structuredClone(packet));
adapter.rws.stop = async () => ({ success: true });
adapter.on('ohlc', event => { events.push(structuredClone(event)); onCandle(event); });
bot.sessionRouter = { activeSession: 'stocks', activeBroker: adapter, stockSymbols: symbols, activeCallbackEpoch: 1, transitionInProgress: false };
const subscriptionObservations = [];
async function subscribeFromSource(methodName) {
  const owner = { ctx: bot, stockSymbols: symbols, alpacaAdapter: adapter,
    async _executeBrokerIntent(_transition, brokerId, operation, action, details) { subscriptionObservations.push({ methodName, brokerId, operation, ...details }); return action(); } };
  const parent = router.nodes.find(n => n.type === 'MethodDefinition' && n.key.name === methodName);
  const block = router.nodes.filter(n => n.type === 'VariableDeclaration' && n.start > parent.start && n.end < parent.end)
    .find(n => n.declarations.some(d => ['observationTimeframes', 'evaluationTimeframes'].includes(d.id.name)));
  const loop = router.nodes.find(n => n.type === 'ForOfStatement' && n.start > block.end && n.end < parent.end);
  sandbox.fixtureRouter = owner;
  return vm.runInContext('(async function(){ const timeframe=this.ctx.candleTimeframe, transitionContext={}; ' + router.source.slice(block.start, loop.end) + ' }).call(fixtureRouter)', sandbox);
}
const end = Math.floor(Date.now() / 86400000) * 86400000;
let phase = 'hydration', revision = 0;
function bar(symbol, timeframe, start, index) {
  const price = 100 + symbols.indexOf(symbol) * 1000 + allFrames.indexOf(timeframe) * 100 + index * 0.1;
  return { t: start, o: price - 1, h: price + 2, l: price - 2, c: price, v: 100 + index };
}
adapter.getCandles = async (symbol, timeframe, count) => {
  restCalls.push({ phase, symbol, timeframe, count });
  const interval = bot.candleAggregator.getIntervalMs(timeframe);
  if (phase === 'hydration') return Array.from({ length: 60 }, (_, i) => bar(symbol, timeframe, end - (61 - i) * interval, i));
  return [bar(symbol, timeframe, end - interval, 60 + revision), bar(symbol, timeframe, end, 61 + revision)];
};
async function settle() {
  for (;;) {
    const active = [...adapter.barSubscriptions.values()].flatMap(sub => [...sub.requestedFrames.values()].map(frame => frame.requestedBarFetch)).filter(Boolean);
    if (!active.length) return;
    await Promise.all(active);
  }
}
function confirmationReceipt(symbol) {
  const snapshot = orchestrator.captureDecisionMtf(symbol, store.getLatestCandle(symbol, '1m'));
  assert.deepEqual(Object.keys(snapshot.candles).sort(), [...(baseline ? entryFrames : allFrames)].sort());
  const frames = Object.entries(snapshot.candles).map(([timeframe, candles]) => {
    assert.ok(candles.every(candle => candle.etime <= snapshot.candleEndTime), 'no forming higher-frame evidence');
    assert.equal(candles.at(-1).c, bar(symbol, timeframe, end - bot.candleAggregator.getIntervalMs(timeframe), 65).c);
    return { timeframe, count: candles.length, latest: candles.at(-1) };
  });
  return { candleEndTime: snapshot.candleEndTime, frames, confluence: snapshot.confluence };
}
(async () => {
  await subscribeFromSource('_activateStocks');
  await subscribeFromSource('_transitionToStocks');
  const hydrated = await bot.hydrateActiveTimeframeFromRest(symbols);
  assert.equal(hydrated.status, 'ready');
  phase = 'stream';
  for (const symbol of symbols) adapter._handleStreamMessage({ T: 'b', S: symbol, ...bar(symbol, '1m', end - 60000, 60), t: new Date(end - 60000).toISOString() });
  await settle();
  const capturedDecisions = JSON.stringify(decisions);
  assert.equal(decisions.length, symbols.length * entryFrames.length);
  revision = 5;
  for (const symbol of symbols) adapter._handleStreamMessage({ T: 'u', S: symbol, ...bar(symbol, '1m', end - 60000, 65), t: new Date(end - 60000).toISOString() });
  await settle();
  assert.equal(JSON.stringify(decisions), capturedDecisions, 'corrections neither repeat nor rewrite decisions');
  const results = symbols.map(symbol => ({ symbol,
    subscribedFrames: [...adapter.barSubscriptions.get(symbol).requestedFrames.keys()],
    registeredFrames: [...bot.symbolTimeframeContexts.get(symbol).keys()],
    hydratedFrames: Array.from(hydrated.hydrated.filter(row => row.symbol === symbol).map(row => row.timeframe)),
    entryFrames: decisions.filter(row => row.symbol === symbol).map(row => row.timeframe).sort(),
    series: allFrames.map(timeframe => {
      const interval = bot.candleAggregator.getIntervalMs(timeframe);
      const expected = bar(symbol, timeframe, end - interval, 65);
      const latest = store.getLatestCandle(symbol, timeframe);
      const mtf = orchestrator._getMtfConfluenceAdapter(symbol);
      const mtfLatest = mtf.candles.get(timeframe)?.at(-1);
      const actual = latest && Object.fromEntries(['t','o','h','l','c','v'].map(k => [k,latest[k]]));
      const coherent = JSON.stringify(actual) === JSON.stringify(expected);
      if (!baseline) { assert.ok(coherent, `${symbol} ${timeframe} native values`); assert.equal(mtfLatest.c, expected.c); assert.equal(store.getCandleCount(symbol, timeframe), 61); }
      return { timeframe, expected, actual, coherent, mtfClose: mtfLatest?.c ?? null };
    }),
    confirmation: confirmationReceipt(symbol),
  }));
  const expectedFrames = baseline ? entryFrames : allFrames;
  for (const result of results) {
    assert.deepEqual([...result.subscribedFrames].sort(), [...expectedFrames].sort());
    assert.deepEqual([...result.registeredFrames].sort(), [...expectedFrames].sort());
    assert.deepEqual([...result.hydratedFrames].sort(), [...expectedFrames].sort());
    assert.deepEqual(result.entryFrames, [...entryFrames].sort());
  }
  assert.equal(subscriptionObservations.length, 2 * symbols.length * expectedFrames.length);
  assert.equal(journal.length, symbols.length * entryFrames.length);
  const observations = traces.filter(row => row.type === 'CANDLE_OBSERVATION_ONLY');
  assert.equal(observations.length, baseline ? 0 : 8);
  const restoreOwner = { ctx: bot, activeSession: null,
    _getTransitionStoreStatus: () => ({ state: 'TARGET_ACTIVATED', recoveryRequired: false }),
    _brokerIdForSession: () => 'alpaca', _cleanRuntimeAccountId: value => value,
    _assetClassForSession: () => 'stocks', _symbolsForSession: () => symbols,
    transitionStore: { readEvents: () => [{ event: 'SESSION_TARGET_ACTIVATED', activeSession: 'stocks', runtimeScope: scope }], readBrokerIntents: () => [] },
  };
  const restoreCheck = method(router, '_paperStartupRestoreCheck', restoreOwner);
  const restoreEligibility = allFrames.map(timeframe => {
    const result = restoreCheck({ from: 'startup', to: 'stocks', timeframe: '1m' }, { accountId: scope.accountId },
      [['fixture-trade', { ...scope, symbol: 'NVDA', timeframe, executionRoute: 'simulated' }]]);
    assert.equal(result.eligible, entryFrames.includes(timeframe));
    return { timeframe, ...result };
  });
  const files = ['run-empire-v2.js','core/SessionRouter.js','config/settings.json','core/StrategyOrchestrator.js','brokers/AlpacaAdapter.js','core/CandleProcessor.js','core/CandleStore.js','core/TradingLoop.js','core/ReplayClosedCandleBoundary.js','modules/MultiTimeframeAdapter.js','foundation/ConfigLoader.js'];
  console.log('NATIVE_FRAME_RECEIPT=' + JSON.stringify({ baseline, results, subscriptionObservations, observationOnlyEvents: observations, restoreEligibility,
    decisionCount: decisions.length, closedCandleReceipts: journal.length, restCalls,
    sourceSha256: Object.fromEntries(files.map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
    seams: ['Synthetic broker REST and stream messages, account scope, persistence and order-dispatch observer',
      'Actual SessionRouter subscription blocks, not complete transitions', 'Actual runner context registration, REST hydration, OHLC handler and decision capture',
      'Actual Alpaca adapter, CandleProcessor, canonical store, indicators and per-symbol MTF service methods',
      'No real broker/browser/PM2 activation or performance/profit claim'] }));
  await adapter.unsubscribeAll();
  bot.candleProcessor.cleanup();
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
