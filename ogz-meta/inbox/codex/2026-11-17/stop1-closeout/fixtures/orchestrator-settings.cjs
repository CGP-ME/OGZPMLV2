'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
process.env.PROFILE='paper';
for(const key of ['KRAKEN_API_KEY','KRAKEN_API_SECRET','ALPACA_API_KEY','ALPACA_API_SECRET','WEBSOCKET_AUTH_TOKEN']) process.env[key]='synthetic-stop1-fixture';
const loader=require(path.join(process.cwd(),'foundation/ConfigLoader'));
loader.load({role:'bot',loadDotenv:false,silent:true});
let sequence=0;
function save(changes){const {revisions}=loader.getCachedSnapshot();const result=loader.saveSettings({requestId:`orchestrator-${++sequence}`,expectedRevision:revisions.settings,expectedSettingsHash:revisions.settingsHash,changes});assert.equal(result.success,true,JSON.stringify(result));return result.configuration;}
const minimums={EMASMACrossover:'minCandlesEMA',MADynamicSR:'minCandlesMASR',LiquiditySweep:'minCandlesSweep',SmartMoneySweep:'minCandlesSmartMoneySweep',OGZTPO:'minCandlesTPO'};
const count=40;
save({...Object.fromEntries([...Object.values(minimums),'minCandlesMTF'].map(key=>['orchestrator.'+key,count+1])),
 'orchestrator.fibBoostNormal':0.01,'orchestrator.fibBoostGolden':0.02,
 'orchestrator.fibDistanceEMA':0.1,'orchestrator.fibDistanceMASR':0.1,'orchestrator.fibDistanceSweep':0.1});
const {StrategyOrchestrator}=require(path.join(process.cwd(),'core/StrategyOrchestrator'));
const bot=new StrategyOrchestrator({mtfBaseTimeframe:loader.get('execution.candleTimeframe')});
// Explicit signal seam: observe the real registered evaluator's admission and
// confidence calculation separately from each module's signal-generation math.
const calls={};
bot._getSymbolStrategyModule=name=>({
 update(){calls[name]=(calls[name]??0)+1;return name==='OGZTPO'?null:{direction:'buy',confidence:0.6,hasSignal:true,reason:'synthetic signal'};},
 feedCandle(){return this.update();},
 consumeSignal(){},observe(){calls[name]=(calls[name]??0)+1;},
});
const candles=Array.from({length:count},(_,i)=>({symbol:'BTC-USD',timeframe:'1h',t:1700000000000+i*3600000,etime:1700003600000+i*3600000,o:100+i,h:102+i,l:99+i,c:101+i,v:100}));
const ctx={
 priceHistory:candles,entriesEnabled:true,
 extras:{symbol:'BTC-USD',timeframe:'1h',
  nearestFibLevel:{distance:0.15,level:0.618,isGoldenZone:false},
  mtf:{confluence:{score:0.5,direction:'long',readyTimeframes:['1h']},indicators:{},candles:{}},
 },
};
for(const name of Object.keys(minimums)) assert.equal(bot.strategies.find(s=>s.name===name).evaluate(ctx),null);
assert.deepEqual(calls,{});
bot.evalCount++;
assert.equal(bot._getMtfConfluenceForEvaluation(ctx),null);
const configuration=save({...Object.fromEntries([...Object.values(minimums),'minCandlesMTF'].map(key=>['orchestrator.'+key,count])),
 'orchestrator.fibBoostNormal':0.07,'orchestrator.fibBoostGolden':0.13,
 'orchestrator.fibDistanceEMA':0.2,'orchestrator.fibDistanceMASR':0.2,'orchestrator.fibDistanceSweep':0.2});
const observations=[];
for(const name of Object.keys(minimums)) {
 const strategy=bot.strategies.find(s=>s.name===name),result=strategy.evaluate(ctx);
 observations.push({strategy:name,admitted:calls[name]===1,confidence:result?.confidence??null});
 if(!process.argv.includes('--observe')) {
  assert.equal(calls[name],1,name);
  if(name!=='OGZTPO')assert.ok(Math.abs(result.confidence-0.67)<1e-12,name);
 }
}
ctx.extras.nearestFibLevel.isGoldenZone=true;
for(const name of ['EMASMACrossover','MADynamicSR','LiquiditySweep','SmartMoneySweep']) {
 const result=bot.strategies.find(s=>s.name===name).evaluate(ctx);
 if(!process.argv.includes('--observe'))assert.ok(Math.abs(result.confidence-0.73)<1e-12,name);
}
bot.evalCount++;
const mtf=bot._getMtfConfluenceForEvaluation(ctx);
if(!process.argv.includes('--observe'))assert.equal(mtf,ctx.extras.mtf.confluence);
console.log('STOP1_ORCHESTRATOR_RECEIPT',JSON.stringify({configuration,observations,mtfAdmitted:mtf!==null,fields:11,actualRegisteredEvaluators:true,signalModules:'explicit synthetic seam',runtimeActivated:false}));
