'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const sourceArg = process.argv.find(arg => arg.startsWith('--source='));
if (sourceArg) for (const [file, content] of Object.entries(JSON.parse(fs.readFileSync(sourceArg.slice(9))))) fs.writeFileSync(file, content);
const baseline = process.argv.includes('--baseline');
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, text: args.join(' ') });
const dotenv = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(dotenv, 'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH = dotenv;
process.env.PROFILE = 'paper';
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
const loaded = ConfigLoader.load({ role: 'bot', silent: true });
const CandleProcessor = require(process.cwd() + '/core/CandleProcessor');
const SessionRouter = require(process.cwd() + '/core/SessionRouter');
const { CandleStore } = require(process.cwd() + '/core/CandleStore');
const { subscribeTrace } = require(process.cwd() + '/core/TraceSpine');
const traces = [];
const unsubscribe = subscribeTrace(event => traces.push(event));
const capture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-22/stop2-kraken-history-pacing/fixtures/native-ohlc.json'));
const stockCapture = JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/alpaca-native.json'));
function native(symbol, timeframe) {
  if (symbol === 'TSLA') return stockCapture.lanes.bot[timeframe].response.bars.map(bar => ({ ...bar, t: Date.parse(bar.t), etime: Date.parse(bar.t) + 60000 })).sort((a,b) => a.t-b.t);
  const interval = { '1m': 1, '5m': 5 }[timeframe];
  const pair = symbol === 'BTC-USD' ? 'XXBTZUSD' : 'XETHZUSD';
  const rows = capture.observations.find(row => row.interval === interval && row.response.result[pair]).response.result[pair];
  return rows.map(c => ({t: Number(c[0])*1000, etime: (Number(c[0])+interval*60)*1000, o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]), v: Number(c[6])}));
}
const timers = new Map(); let timerId = 0;
global.setInterval = (callback, ms) => {const id=++timerId;timers.set(id,{callback,ms,repeating:true});return id;};
global.clearInterval = id => timers.delete(id);
global.setTimeout = (callback, ms) => {const id=++timerId;timers.set(id,{callback,ms,repeating:false});return id;};
global.clearTimeout = id => timers.delete(id);
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve};}
async function fireTimers() {
  const snapshot = [...timers.entries()];
  for (const [id,timer] of snapshot) {if (!timer.repeating) timers.delete(id);timer.callback();}
  await flush();
}
function build() {
  const calls=[], ingested=[], lifecycle=[], handlers=new Map(), contexts=new Map();
  const store=new CandleStore({maxCandles:2000});
  function adapter(id) {const broker=new EventEmitter();broker.id=id;broker.getCandles=async(symbol,timeframe,count)=>{
    calls.push({broker:id,symbol,timeframe,count});
    const handler=handlers.get(symbol+' '+timeframe);return handler ? handler() : [];
  };return broker;}
  const kraken=adapter('kraken'),alpaca=adapter('alpaca');
  const ctx={config:loaded.config,tradingPair:'BTC-USD',candleTimeframe:'1m',priceHistory:[],candleSaveCounter:0,saveCandleHistory(){},_candleStore:store,
    strategyOrchestrator:{ingestMarketCandle(symbol,candle){ingested.push({symbol,...candle});}},
    getSymbolTimeframeContext(symbol,timeframe){const key=symbol+' '+timeframe;if(!contexts.has(key))contexts.set(key,{symbol,timeframe,get priceHistory(){return store.getCandles(symbol,timeframe);},indicatorEngine:{updateCandle(){}}});return contexts.get(key);},
    observationTimeframes:['1m','5m','15m','30m','1h','4h','1d'],_runtimeOperations:new Map(),
    tradingLoop:{async waitForPendingOperations(){}},promoteBrokerAccountIdentity(){},async hydrateActiveTimeframeFromRest(){return {fixture:true};},
  };
  const router=Object.create(SessionRouter.prototype);let epoch=1,paused=false;
  Object.assign(router,{ctx,activeBroker:kraken,activeSession:'crypto',activeCallbackEpoch:epoch,transitionInProgress:false,stopping:false,
    krakenAdapter:kraken,alpacaAdapter:alpaca,stockSymbols:['TSLA'],cryptoSymbols:['BTC-USD'],activeOperations:new Set(),
    _currentTimeframe(){return '1m';},_createTransitionContext(from,to,now,details){return {from,to,...details,transitionId:'fixture-transition'};},
    transitionStore:{acquireLock(){return {success:true,lock:{epoch:++epoch,ownerId:'fixture-owner',acquiredAt:'fixture'}};},releaseLock(){return {released:true};}},
    _recordTransitionEvent(event){lifecycle.push({event,remainingJobs:ctx.candleProcessor?.backfillJobs?.size??null,timers:timers.size});},
    stateManager:{async pauseTrading(){paused=true;},async resumeTradingIfPausedBy(){paused=false;return {stateMutationSucceeded:true};}},_stateManagerReportsPaused(){return paused;},
    async _forceCloseSourceTradesThroughExecution(){lifecycle.push({event:'fixture_source_reconciliation'});},async _reconcileBrokerRestBeforeActivation(){},
    _buildRuntimeScopeForSession(session,timeframe,broker){return {brokerId:broker.id,scopeComplete:true};},_handoffPatternMemory(){},
    async _executeBrokerIntent(context,brokerId,intent,operation){lifecycle.push({event:'fixture_broker_intent',brokerId,intent});return operation();},
    _syncDashboardRuntimeScopeForSession(session,scope){return scope;},_transitionEvent(from,to){return {from,to};},
    async _enterFailedSafe(from,to,error){throw error;},onOhlcCallback(){},
  });
  ctx.sessionRouter=router;
  const processor=new CandleProcessor(ctx);ctx.candleProcessor=processor;
  function scope(symbol,timeframe){return {symbol,timeframe,brokerId:router.activeBroker.id,assetClass:router.activeSession==='crypto'?'crypto':'stocks',executionMode:'paper',accountId:'fixture-account',accountIdSource:'fixture',sessionRouterEpoch:router.activeCallbackEpoch,traceId:'fixture-'+symbol+'-'+timeframe};}
  function feed(symbol,timeframe,index){const c=native(symbol,timeframe)[index];return processor.handleMarketData({...scope(symbol,timeframe),data:[c.t,c.etime,c.o,c.h,c.l,c.c,null,c.v,null],sourceEventTime:Date.now(),sourceEventKind:'captured_native_fixture'});}
  function gap(symbol,timeframe){feed(symbol,timeframe,0);feed(symbol,timeframe,4);}
  return {ctx,router,processor,calls,ingested,lifecycle,handlers,scope,feed,gap,store};
}
async function main(){
  const results={};
  const a=build();
  for(const [symbol,frame]of [['BTC-USD','1m'],['BTC-USD','5m'],['ETH-USD','1m']])a.gap(symbol,frame);
  await flush();
  const initialCalls=a.calls.splice(0), initialTimers=timers.size;
  a.handlers.set('BTC-USD 1m',()=>native('BTC-USD','1m'));
  await fireTimers();
  results.independentOwners={initialCalls,initialTimers,retryCalls:a.calls.splice(0),remainingTimers:timers.size,
    btcOneMinuteStored:a.store.getCandles('BTC-USD','1m').map(c=>({t:c.t,etime:c.etime,o:c.o,h:c.h,l:c.l,c:c.c,v:c.v})),
    remainingOwners:[...(a.processor.backfillJobs?.values()||[])].map(j=>({symbol:j.traceContext.symbol,timeframe:j.traceContext.timeframe}))};
  if(!baseline){assert.equal(initialTimers,3);assert.equal(timers.size,2);assert.equal(results.independentOwners.retryCalls.length,3);assert.equal(results.independentOwners.btcOneMinuteStored.length,5);assert.deepEqual(results.independentOwners.btcOneMinuteStored,native('BTC-USD','1m').slice(0,5));}
  a.processor.cleanup();timers.clear();

  const b=build();b.gap('BTC-USD','1m');await flush();
  const late=deferred();b.handlers.set('BTC-USD 1m',()=>late.promise);
  await fireTimers();const callsBeforeHandoff=b.calls.length;const storedBeforeHandoff=b.store.getCandles('BTC-USD','1m').length;
  await b.router._transitionToStocks(new Date('2026-11-23T14:30:00Z'));
  const timersAfterHandoff=timers.size;
  late.resolve(native('BTC-USD','1m'));await flush();
  const lateInserted=b.store.getCandles('BTC-USD','1m').length-storedBeforeHandoff;
  await fireTimers();
  results.handoff={actualTargetBroker:b.router.activeBroker.id,timersAfterHandoff,lateInserted,callsBeforeHandoff,callsAfterHandoff:b.calls.length,lifecycle:b.lifecycle};
  if(!baseline){assert.equal(b.router.activeBroker.id,'alpaca');assert.equal(timersAfterHandoff,0);assert.equal(lateInserted,0);assert.equal(b.calls.length,callsBeforeHandoff);}
  b.processor.cleanup();timers.clear();

  const c=build();await c.router._transitionToStocks(new Date('2026-11-23T14:30:00Z'));
  const stock=native('TSLA','1m');
  if(baseline)c.processor.startBackfillRetry(stock[0].etime,stock[4].etime,c.scope('TSLA','1m'));
  else await c.processor.startBackfill(stock[0].etime,stock[4].etime,c.scope('TSLA','1m'));
  const beforeReverse=timers.size;
  await c.router._transitionToCrypto(new Date('2026-11-23T21:00:00Z'));await fireTimers();
  results.reverseHandoff={timersBefore:beforeReverse,timersAfter:timers.size,actualTargetBroker:c.router.activeBroker.id,dispatches:c.calls};
  if(!baseline){assert.equal(beforeReverse,1);assert.equal(timers.size,0);assert.equal(c.calls.filter(v=>v.broker==='kraken'&&v.symbol==='TSLA').length,0);}
  c.processor.cleanup();timers.clear();

  const d=build();const delayed=deferred();d.handlers.set('BTC-USD 1m',()=>delayed.promise);d.gap('BTC-USD','1m');await flush();
  const beforeStop=d.store.getCandles('BTC-USD','1m').length;
  await d.router.stop();delayed.resolve(native('BTC-USD','1m'));await flush();
  results.stop={lateInserted:d.store.getCandles('BTC-USD','1m').length-beforeStop,timers:timers.size};
  if(!baseline){assert.equal(results.stop.lateInserted,0);assert.equal(timers.size,0);}
  d.processor.cleanup();timers.clear();

  if(!baseline){
    const e=build();const slow=deferred();e.handlers.set('BTC-USD 1m',()=>slow.promise);e.gap('BTC-USD','1m');await flush();
    const job=[...e.processor.backfillJobs.values()][0];const duplicate=e.processor.startBackfill(job.gapStart,job.gapEnd,job.traceContext);assert.equal(duplicate,job.pending);
    assert.equal(e.calls.length,1);assert.equal(timers.size,0);
    e.feed('BTC-USD','1m',8);await flush();assert.equal(e.calls.length,2);
    slow.resolve([]);await Promise.all([...e.processor.backfillJobs.values()].map(j=>j.pending));
    const afterUnavailable=timers.size;assert.equal(afterUnavailable,2);
    e.handlers.set('BTC-USD 1m',async()=>{throw new Error('explicit fixture HTTP 503');});await fireTimers();assert.equal(timers.size,2);
    results.slowAndAdditionalGap={dispatches:e.calls.length,duplicateDispatches:0,timersDuringSlowRequest:0,independentGaps:afterUnavailable,timersAfterProviderFailure:timers.size};
    e.ctx._shutdownRequested=true;e.processor.cleanup('fixture_shutdown');const count=e.calls.length;e.gap('ETH-USD','1m');await flush();assert.equal(e.calls.length,count);assert.equal(timers.size,0);
    results.shutdownRejectsNewGap=true;
  }
  unsubscribe();
  const files=['core/CandleProcessor.js','core/SessionRouter.js','foundation/ConfigLoader.js','config/settings.json','config/internals.json'];
  process.stdout.write(JSON.stringify({baseline,isolation:'test-isolated.py',results,sourceHashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),traces,logs,
    limitations:['Actual CandleProcessor intake, recovery, replay and CandleStore execute with captured native Kraken/Alpaca candles.','Actual SessionRouter transition entry/body, cleanup and stop methods execute; order execution, account reconciliation, hydration, lock storage and pattern handoff are explicit seams.','Timers and broker transport/unavailability/delay/failure are controlled. Indicators and strategy ingestion are observation seams; strategy economics are not tested.','Retiring an owner suppresses late publication; it does not abort an already dispatched provider HTTP request. No live fault injection or real order occurred.']},null,2)+'\n');
}
main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
