'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const acorn = require('acorn');
const dir = __dirname;
const now = 1800000000000;
class FixedDate extends Date { static now() { return now; } }
const plain = value => JSON.parse(JSON.stringify(value));
function method(source, name) {
  const tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script'});
  for (const cls of tree.body.filter(n => n.type === 'ClassDeclaration')) {
    const node = cls.body.body.find(n => n.key?.name === name);
    if (node) return source.slice(node.start, node.end);
  }
  throw Error(`Fixture cannot find ${name}`);
}
async function exercise(version) {
  const internals = JSON.parse(fs.readFileSync(path.join(dir, `${version}-internals.json`)));
  const cpSource = fs.readFileSync(path.join(dir, `${version}-processor.cjs`), 'utf8');
  const runnerSource = fs.readFileSync(path.join(dir, `${version}-runner.cjs`), 'utf8');
  const traces = [], timers = [], logs = [], effects = [];
  const config = {mode:{backtest:false},backtest:{fast:true},execution:{symbols:['BTC-USD'],broker:'kraken',assetClass:'crypto',tradingPair:'BTC-USD'},dashboard:internals.dashboard};
  const sandbox = {
    module:{exports:{}}, Date:FixedDate, console:Object.fromEntries(['log','warn','error'].map(k=>[k,(...a)=>logs.push([k,...a])])),
    setInterval(fn,ms){const timer={fn,ms,cleared:false};timers.push(timer);return timer;},clearInterval(timer){timer.cleared=true;},
    require(id){
      if(id==='./StateManager') return {getInstance:()=>({})};
      if(id==='../foundation/ConfigLoader') return {get:key=>key.split('.').reduce((v,k)=>v?.[k],config)};
      if(id==='../foundation/ohlc-normalize') return {normalizeOhlc:x=>x,toTimestampMs:Number};
      if(id==='../foundation/MarketCalendar') return {getInstance:()=>({})};
      if(id==='./TraceSpine') return {emitTrace:(ctx,event,fields)=>traces.push({event,fields})};
      throw Error(`Fixture unexpected dependency ${id}`);
    }
  };
  vm.runInNewContext(cpSource,sandbox);
  const Processor=sandbox.module.exports;
  async function feedCase(age,gap,backfillSuccess=false) {
    const frame={priceHistory:gap?[{etime:now-age-240000,symbol:'BTC-USD'}]:[]};
    const ctx={tradingPair:'BTC-USD',candleTimeframe:'1m',config:{dataFeed:internals.dataFeed,assetClass:'crypto',brokerId:'kraken'},getSymbolTimeframeContext:()=>frame};
    if(version==='base') ctx.staleFeedPaused=false;
    const processor=new Processor(ctx);
    processor._isExpectedStockMarketQuiet=()=>false;
    processor._resolveTraceContext=x=>x;
    processor._stampRuntimeScopeFields=x=>x;
    processor.processNewCandle=(candle)=>{effects.push(['candle',plain(candle)]);return true;};
    processor.attemptBackfill=async(a,b,scope)=>{effects.push(['backfill',a,b,plain(scope)]);return backfillSuccess?[[now-age-120000,now-age-60000,10,11,9,10,10,3,1]]:[];};
    const input={data:[now-age-60000,now-age,10,11,9,10,10,3,1],symbol:'BTC-USD',timeframe:'1m',brokerId:'kraken',accountId:'fixture-account',assetClass:'crypto',executionMode:'paper'};
    const result=processor.handleMarketData(input);
    await Promise.resolve();
    assert.equal(result.acceptedAsNew,true);
    if(gap&&!backfillSuccess){assert.equal(timers.at(-1).ms,internals.dataFeed.gapBackfillRetryDelayMs);await timers.at(-1).fn();}
    processor.cleanup();
    return plain(result);
  }
  const results=[];
  for(const args of [[0,false],[180000,false],[0,true,false],[0,true,true]])results.push(await feedCase(...args));
  const runner=vm.runInNewContext(`({${method(runnerSource,'startLivenessWatchdog')}})`,sandbox);
  const watchdog=[];
  for(const recovered of [0,2]) {
    const pending=[];
    const ctx={...runner,config:{dataFeed:internals.dataFeed},lastBrokerDataReceived:now-600000,lastActiveTimeframeDataReceived:now-600000,
      _isExpectedMarketQuiet:()=>false,_getLivenessSymbol:()=> 'BTC-USD',_getLivenessTimeframe:()=> '1m',candleAggregator:{getIntervalMs:()=>60000},
      _activeTimeframeSilenceLimitMs:()=>120000,_trackRuntimeOperation:(name,fn)=>pending.push(fn()),
      _attemptLivenessBackfill:async(s,t)=>{watchdog.push(['fetch',s,t]);return recovered;},
      _recoverDataFeedPauseIfFresh:async(s,t)=>watchdog.push(['legacy-recovery',s,t])};
    if(version==='base')ctx.staleFeedPaused=false;
    ctx.startLivenessWatchdog();await timers.at(-1).fn();await Promise.all(pending);
    assert.equal(timers.at(-1).ms,internals.dataFeed.livenessCheckIntervalMs);
  }
  return {results,effects,traces,logs,watchdog,timers:timers.map(({ms,cleared})=>({ms,cleared}))};
}
(async()=>{
 const a=await exercise('base'),b=await exercise('candidate');
 assert.deepEqual(b,a);
 const internals=JSON.parse(fs.readFileSync(path.join(dir,'candidate-internals.json')));
 assert.equal(Object.hasOwn(internals.dataFeed,'staleDataRecoveryAgeMs'),false);
 assert.equal(Object.hasOwn(internals.dataFeed,'gapRecoveryCleanCandlesRequired'),false);
 console.log(JSON.stringify({pass:true,cases:['fresh candle','stale candle still accepted and reported','gap retries remain scheduled','successful gap backfill still replayed','watchdog no recovery','watchdog successful REST recovery'],observedCandles:b.effects.filter(x=>x[0]==='candle').length,watchdogActions:b.watchdog,scope:'actual parsed methods with explicit collaborators; no broker/full runtime activation'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
