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
const unfixedIndicators = process.argv.includes('--unfixed-indicators');
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
stateManager.set('initialBalance', 10000);
stateManager.set('activeTrades', new Map());
stateManager.set('realizedPnL', 0);
stateManager.set('position', 0);
stateManager.set('closedTrades', []);
const DashboardBroadcaster = require(path.join(process.cwd(), 'core/DashboardBroadcaster'));
const BacktestRunner = require(path.join(process.cwd(), 'core/BacktestRunner'));
const packets = [], displayChecks = [];
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
  if (!node && name === 'candleToProcessorOhlc') continue;
  assert.ok(node, name); vm.runInContext(runner.source.slice(node.start, node.end), sandbox);
}
for (const name of ['observationTimeframes', 'evaluationTimeframes', 'timeframeDiagnostics']) {
  const node = runner.nodes.find(n => n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.property.name === name);
  if (node) bot[name] = vm.runInContext('(' + runner.source.slice(node.right.start, node.right.end) + ')', sandbox);
}
assert.deepEqual(Array.from(bot.evaluationTimeframes), entryFrames, 'entry eligibility stays at the existing five frames');
for (const name of ['_registerRoutableSymbolContexts', 'getSymbolTimeframeContext', 'storeTimeframeCandle', 'storeSymbolTimeframeCandle',
  'getSymbolTimeframeCandles', 'getCandlesForTimeframe', '_normalizeHydrationCandle', '_getRestRecoveryScopeEnvelope', 'hydrateActiveTimeframeFromRest',
  'broadcastEdgeAnalytics', 'fetchAndSendHistoricalCandles', '_stampDashboardHistoricalCandles', '_getSymbolMatchedCachedCandles', 'getTtpExitPrice']) {
  if (runner.nodes.some(n => n.type === 'MethodDefinition' && n.key.name === name)) bot[name] = method(runner, name, bot);
}
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

// Execute the actual dashboard timeframe-request block. Viewer selection may
// request history, but cannot retag a broker candle from another frame.
const socketSource = parsed('core/WebSocketManager.js');
const selection = socketSource.nodes.find(n => n.type === 'IfStatement' && socketSource.source.slice(n.test.start, n.test.end) === "msg.type === 'timeframe_change'");
const selectionRequests = [];
const savedHistoryMethod = bot.fetchAndSendHistoricalCandles;
bot.fetchAndSendHistoricalCandles = (...args) => selectionRequests.push(args);
sandbox.selectionMessage = { type: 'timeframe_change', timeframe: '1d', asset: 'TSLA' };
vm.runInContext('(function(){ const msg=selectionMessage; ' + socketSource.source.slice(selection.start, selection.end) + ' }).call({ctx:bot})', sandbox);
bot.fetchAndSendHistoricalCandles = savedHistoryMethod;
const selectionReceipt = { requests: selectionRequests, globalTimeframe: bot.dashboardTimeframe ?? null };
assert.equal(selectionReceipt.globalTimeframe, baseline ? '1d' : null);
sandbox.indicatorEngine = bot.indicatorEngine;
const broadcasterInit = runner.nodes.find(n => n.type === 'NewExpression' && n.callee.name === 'DashboardBroadcaster');
const broadcasterContext = vm.runInContext('(function(){return (' + runner.source.slice(broadcasterInit.arguments[0].start,broadcasterInit.arguments[0].end) + ');}).call(bot)',sandbox);
bot.dashboardBroadcaster = new DashboardBroadcaster(broadcasterContext);
for (const symbol of symbols) for (const timeframe of allFrames) {
  const analytics = bot.dashboardBroadcaster._getEdgeAnalytics(symbol,timeframe);
  for (const key of Object.keys(analytics).filter(k=>k.startsWith('last'))) analytics[key] = Date.now();
}
bot.dashboardWs = {readyState:1,send(json){
  const packet=JSON.parse(json); packets.push(packet);
  if (packet.type!=='price') return;
  const native=packet.candle, frame=bot.getSymbolTimeframeContext(packet.symbol,native.timeframe);
  const rendered=frame.indicatorEngine.getRenderPacket({maxPoints:ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.renderRequestMaxPoints')});
  const expectedHistory=frame.priceHistory.slice(ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.dashboardCandleSliceStart'));
  const snapshot=frame.indicatorEngine.getSnapshot().indicators;
  const expectedIndicators=Object.fromEntries(['rsi','atr','macd','macdSignal','macdHistogram','volume'].map(key=>[key,snapshot[key]]));
  const check={symbol:packet.symbol,timeframe:native.timeframe,packetTimeframe:packet.timeframe,timestamp:packet.timestamp,
    native,historyCount:packet.candles.length,
    expectedIndicators,actualIndicators:packet.indicators,scalarIndicatorsMatch:JSON.stringify(packet.indicators)===JSON.stringify(expectedIndicators),
    historyMatches:JSON.stringify(packet.candles)===JSON.stringify(expectedHistory),
    indicatorsMatch:JSON.stringify(packet.overlays)===JSON.stringify(rendered.overlays),
    scopeMatches:packet.timeframe===native.timeframe && packet.data.timeframe===native.timeframe && packet.candles.every(c=>c.symbol===packet.symbol&&c.timeframe===native.timeframe)};
  if (!baseline) {
    assert.ok(check.historyMatches, 'canonical history must match exactly');
    assert.ok(check.indicatorsMatch, 'render packet must use this frame engine');
    if(!unfixedIndicators) assert.ok(check.scalarIndicatorsMatch,'numeric indicators must use this frame engine');
    assert.ok(check.scopeMatches, 'no retagging or mixed series');
    assert.equal(native.etime,store.getCandleAt(packet.symbol,native.timeframe,packet.timestamp).etime);
  }
  displayChecks.push(check);
}};

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
  const frameIndex=allFrames.indexOf(timeframe), symbolIndex=symbols.indexOf(symbol);
  const price=100+symbolIndex*1000+frameIndex*100+index*(frameIndex+1)*0.3+Math.sin(index*(frameIndex+1))*5*(symbolIndex+1);
  return {t:start,o:price-1,h:price+2+frameIndex,l:price-2-frameIndex,c:price,v:100+index+frameIndex*10};
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
  assert.deepEqual(Object.keys(snapshot.candles).sort(), [...allFrames].sort());
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
  bot.dashboardWsConnected=true;
  for (const symbol of symbols) adapter._handleStreamMessage({ T: 'b', S: symbol, ...bar(symbol, '1m', end - 60000, 60), t: new Date(end - 60000).toISOString() });
  await settle();
  const capturedDecisions = JSON.stringify(decisions);
  assert.equal(decisions.length, symbols.length * entryFrames.length);
  revision = 5;
  for (const symbol of symbols) adapter._handleStreamMessage({ T: 'u', S: symbol, ...bar(symbol, '1m', end - 60000, 65), t: new Date(end - 60000).toISOString() });
  await settle();
  assert.equal(JSON.stringify(decisions), capturedDecisions, 'corrections neither repeat nor rewrite decisions');
  const beforeOldCorrection=JSON.stringify(decisions);
  for(const symbol of symbols) for(const timeframe of allFrames){
    const interval=bot.candleAggregator.getIntervalMs(timeframe), old=bar(symbol,timeframe,end-2*interval,70);
    old.v=0;
    onCandle({symbol,timeframe,candleClosed:true,candleRevision:true,priceTimestamp:old.t+interval,
      data:{...old,etime:old.t+interval}});
    assert.equal(store.getCandleCount(symbol,timeframe),61);
    assert.equal(store.getCandleAt(symbol,timeframe,old.t).v,0);
    const rows=store.getCandles(symbol,timeframe);
    assert.ok(rows.every((r,i)=>i===0||rows[i-1].t<r.t),'ordered unique canonical bars');
  }
  assert.equal(JSON.stringify(decisions),beforeOldCorrection);
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
  const expectedFrames = allFrames;
  for (const result of results) {
    assert.deepEqual([...result.subscribedFrames].sort(), [...expectedFrames].sort());
    assert.deepEqual([...result.registeredFrames].sort(), [...expectedFrames].sort());
    assert.deepEqual([...result.hydratedFrames].sort(), [...expectedFrames].sort());
    assert.deepEqual(result.entryFrames, [...entryFrames].sort());
  }
  assert.equal(subscriptionObservations.length, 2 * symbols.length * expectedFrames.length);
  assert.equal(journal.length, symbols.length * entryFrames.length);
  const observations = traces.filter(row => row.type === 'CANDLE_OBSERVATION_ONLY');
  assert.equal(observations.length, 12);
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
  assert.equal(displayChecks.length,42);
  if(baseline||unfixedIndicators) assert.ok(displayChecks.some(r=>!r.scalarIndicatorsMatch),'reproduce global numeric indicator reader');
  if(baseline) assert.ok(displayChecks.some(r=>!r.historyMatches||!r.indicatorsMatch||!r.scopeMatches));
  else assert.equal(packets.filter(p=>p.type==='delta').length,0,'candles do not become wall-clock price ticks');
  assert.equal(packets.filter(p=>p.type==='error_event').length,0,'no caught broadcast failure');
  if (!baseline) assert.equal(bot.getTtpExitPrice('TSLA',null,[]),store.getLatestPrice('TSLA',bot.candleTimeframe));
  const evalOwner=runner.nodes.find(n=>n.type==='NewExpression'&&n.callee.name==='EvalRuleEngine');
  const candleGetter=evalOwner.arguments[0].properties.find(n=>n.key.name==='getCandles').value;
  const getEvalCandles=vm.runInContext('(function(){return ('+runner.source.slice(candleGetter.start,candleGetter.end)+');}).call(bot)',sandbox);
  if(!baseline) assert.deepEqual(Array.from(getEvalCandles('TSLA','5m')),store.getCandles('TSLA','5m'));
  // Historical requests stay native broker reads; no request writes into live storage.
  sandbox.resolveDashboardStockConfigFromRuntime=()=>({data:{}});
  sandbox.isDashboardStockSymbol=symbol=>symbol==='TSLA';
  sandbox.looksLikeEquityTicker=symbol=>symbol==='TSLA';
  let requestMode='success'; const returned=[{t:end-300000,etime:end,o:51,h:53,l:50,c:52,v:12}];
  sandbox.fetchStockCandles=async()=>structuredClone(returned);
  bot.kraken={getCandles:async()=>{if(requestMode==='failure')throw new Error('fixture broker unavailable');return requestMode==='empty'?[]:structuredClone(returned);}};
  const beforeHistory=JSON.stringify(store.getCandles('TSLA','5m'));
  const historicalReceipt=[];
  for(const [symbol,mode] of [['TSLA','success'],['BTC-USD','success'],['BTC-USD','empty'],['BTC-USD','failure']]){
    requestMode=mode;const start=packets.length;
    await bot.fetchAndSendHistoricalCandles('5m',60,symbol);
    const sent=packets.slice(start).filter(p=>p.type==='historical_candles');
    historicalReceipt.push({symbol,mode,sent});
    if(!baseline){assert.equal(sent.length,1);assert.equal(sent[0].symbol,symbol);assert.equal(sent[0].timeframe,'5m');assert.equal(sent[0].candles.length,mode==='success'?1:0);if(mode!=='success')assert.ok(sent[0].error);}
  }
  assert.equal(JSON.stringify(store.getCandles('TSLA','5m')),beforeHistory);
  // Replay the actual backtest pump body with duplicate and older corrected bars.
  const backtestSource=parsed('core/BacktestRunner.js');
  const pump=backtestSource.nodes.find(n=>n.type==='ForOfStatement'&&backtestSource.source.slice(n.right.start,n.right.end)==='historicalCandles');
  const backtestDecisions=[];
  const backtestOwner=new BacktestRunner({handleMarketData:bot.handleMarketData,runTradingCycle:(symbol,traceId)=>backtestDecisions.push({symbol,traceId}),storeTimeframeCandle:bot.storeTimeframeCandle});
  sandbox.backtestOwner=backtestOwner;
  sandbox.historicalCandles=[bar('TSLA','1m',end,80),bar('TSLA','1m',end,81),bar('TSLA','1m',end-60000,82),bar('TSLA','1m',end+60000,83)];
  sandbox.backtestScope=scope;
  bot.dashboardWsConnected=false;bot.config.enableBacktestMode=true;
  const backtestReceipt=await vm.runInContext('(async function(){const historicalCandles=globalThis.historicalCandles,symbol="TSLA",timeframe="1m",timeframeMs=60000,candleScope=backtestScope,startTime=Date.now();let processedCount=0,errorCount=0;'+backtestSource.source.slice(pump.start,pump.end)+';return {processedCount,errorCount};}).call(backtestOwner)',sandbox);
  backtestReceipt.decisions=backtestDecisions.length;
  assert.equal(backtestReceipt.processedCount,4);assert.equal(backtestReceipt.errorCount,0);assert.equal(backtestReceipt.decisions,2);
  // Forming-feed boundary: only arrival of the next native bar closes the prior one.
  const startCount=decisions.length; Object.assign(scope,{brokerId:'kraken',assetClass:'crypto'});
  bot.sessionRouter.activeSession='crypto';bot.sessionRouter.activeBroker={id:'kraken'};
  bot._registerRoutableSymbolContexts(['BTC-USD'],{timeframe:bot.candleTimeframe});
  function forming(start,close,revision=false){onCandle({symbol:'BTC-USD',timeframe:'1m',candleClosed:false,candleRevision:revision,priceTimestamp:start+1000,data:[start,start+60000,close-1,close+2,close-2,close,null,17,1]});}
  forming(end,301);forming(end,305);assert.equal(decisions.length,startCount);
  forming(end+60000,309);assert.equal(decisions.length,startCount+1);
  forming(end,306,true);assert.equal(decisions.length,startCount+1);
  const captured=decisions.at(-1).input.priceHistory.at(-1);
  assert.equal(captured.t,end);assert.equal(captured.c,305);
  const formingReceipt={decisionCount:decisions.length-startCount,decidedCandle:captured,latestStored:store.getLatestCandle('BTC-USD','1m')};
  const files = ['core/BacktestRunner.js','core/DashboardBroadcaster.js','core/WebSocketManager.js','config/internals.json','run-empire-v2.js','core/SessionRouter.js','config/settings.json','core/StrategyOrchestrator.js','brokers/AlpacaAdapter.js','core/CandleProcessor.js','core/CandleStore.js','core/TradingLoop.js','core/ReplayClosedCandleBoundary.js','modules/MultiTimeframeAdapter.js','foundation/ConfigLoader.js'];
  console.log('CANONICAL_DISPLAY_RECEIPT=' + JSON.stringify({ baseline, displayChecks, deltaCount: packets.filter(p => p.type === 'delta').length, selectionReceipt, historicalReceipt, formingReceipt, backtestReceipt, results, subscriptionObservations, observationOnlyEvents: observations, restoreEligibility,
    decisionCount: decisions.length, closedCandleReceipts: journal.length, restCalls,
    sourceSha256: Object.fromEntries(files.map(file => [file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
    seams: ['Synthetic broker REST and stream messages, account scope, persistence and order-dispatch observer',
      'Actual SessionRouter subscription blocks, not complete transitions', 'Actual runner context registration, REST hydration, OHLC handler and decision capture',
      'Actual Alpaca adapter, CandleProcessor, canonical store, indicators and per-symbol MTF service methods',
      'No real broker/browser/PM2 activation or performance/profit claim'] }));
  await adapter.unsubscribeAll();
  bot.candleProcessor.cleanup();
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
