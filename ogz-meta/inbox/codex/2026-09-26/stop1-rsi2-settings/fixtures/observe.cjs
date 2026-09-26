'use strict';
// Actual receiver/configuration/strategy/exit methods. Disposable files and
// recorded prices; no live bot, broker, socket transmission or paper fills.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const phase=process.argv[2];assert.ok(['baseline','candidate','cold'].includes(phase));
const out=fs.mkdtempSync(path.join(packet,'private/'+phase+'-')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const input=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json')),bars=JSON.parse(input).candles;
const sourcePaths=['modules/RSI2MeanReversion.js','core/StrategyOrchestrator.js','foundation/ConfigLoader.js','core/ExitContractManager.js','core/PolicyBuilder.js','core/WebSocketManager.js','core/IndicatorCalculator.js','core/indicators/IndicatorEngine.js','core/exit/StopLossChecker.js','core/exit/MaxHoldChecker.js','core/OrderExecutor.js'];
const sources=Object.fromEntries(sourcePaths.map(p=>[p,hash(fs.readFileSync(path.join(clone,p)))]));
fs.mkdirSync(path.join(out,'config'));fs.mkdirSync(path.join(out,'foundation'));
const settings=JSON.parse(fs.readFileSync(path.join(clone,'config/settings.json')));
settings.filters.atrEnabled=false;
fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(settings),{flag:'wx'});
fs.copyFileSync(path.join(clone,'config/internals.json'),path.join(out,'config/internals.json'),fs.constants.COPYFILE_EXCL);
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
function compile(file,target,replacements={}){const m=new Module(target,module);m.filename=target;m.paths=Module._nodeModulePaths(path.dirname(file)).concat(Module._nodeModulePaths(root));const actual=m.require.bind(m);m.require=n=>Object.hasOwn(replacements,n)?replacements[n]:actual(n);m._compile(fs.readFileSync(file,'utf8'),target);return m.exports;}
const loaderPath=path.join(clone,'foundation/ConfigLoader.js');
const makeLoader=()=>compile(loaderPath,path.join(out,'foundation/ConfigLoader.js'),{'../core/AtomicWrite':require(path.join(clone,'core/AtomicWrite'))});
const loader=makeLoader();loader.load({loadDotenv:false,silent:true});require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
const logs=[],original={...console};for(const k of ['log','warn','error'])console[k]=(...args)=>logs.push({level:k,text:args.join(' ')});
let receipt;
try {
 const {StrategyOrchestrator}=require(path.join(clone,'core/StrategyOrchestrator'));
 const {IndicatorCalculator}=require(path.join(clone,'core/IndicatorCalculator'));
 const IndicatorEngine=require(path.join(clone,'core/indicators/IndicatorEngine'));
 const PolicyBuilder=require(path.join(clone,'core/PolicyBuilder')),ecm=require(path.join(clone,'core/ExitContractManager')).getInstance();
 const oeFile=path.join(clone,'core/OrderExecutor.js'),OE=compile(oeFile,oeFile,{'./StateManager':{getInstance:()=>({})},'./AuthFailureGuard':{},'../ogz-meta/claudito-logger':{},'./UnifiedPatternMemory':{},'./PIDController':{},'./TradeNarrator':{}});
 const stopConsumer=Object.create(OE.prototype);
 const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'});orch.strategies=orch.strategies.filter(s=>s.name==='RSI2MeanReversion');assert.equal(orch.strategies.length,1);
 const frames=(()=>{const engine=new IndicatorEngine({...loader.get('indicators.engine'),symbol:'TSLA',tf:'15m'});return bars.map(b=>engine.updateCandle(b));})();
 const runs=[],wire=[],saves=[],effects=[],exits=[],thresholdBoundary=[];
 function run(symbol){const cfg=loader.get('strategies.RSI2MeanReversion'),entries=[],errors=[];
  for(let i=0;i<bars.length;i++){const history=bars.slice(0,i+1);try{
   const result=orch.evaluate(frames[i].indicators,[],null,history,{symbol,timeframe:'15m',price:bars[i].c});
   if(!['BUY','SELL'].includes(result.action))continue;
   const contract=result.exitContract,policy=PolicyBuilder.buildForTrade({strategyName:'RSI2MeanReversion',exitContract:contract,nowMs:bars[i].t,volatility:0.5,confidence:0.7,marketCondition:'normal',entryDirection:result.action==='BUY'?'long':'short',mtfConfluenceSnapshot:null});
   const stopFraction=stopConsumer._resolveContractStopPercent(contract);assert.equal(stopFraction,-contract.stopLossPercent/100);
   if(phase!=='baseline'){
    for(const key of ['rsiPeriod','rsiExitLong','stopLossPercent','maxHoldTimeMinutes']){assert.equal(contract[key],cfg[key],key);assert.equal(policy.contract[key],cfg[key],key);}
    assert.ok(i+1>=Math.max(cfg.trendPeriod,cfg.rsiPeriod)+2);
    const rsi=IndicatorCalculator.calculateRSI(history,cfg.rsiPeriod),sma=IndicatorCalculator.calculateSMA(history,cfg.trendPeriod);
    assert.ok(result.action==='BUY'?bars[i].c>sma&&rsi<cfg.rsiEntry:cfg.allowShorts&&bars[i].c<sma&&rsi>cfg.rsiEntryOB);
   }
   entries.push({index:i,action:result.action,contract,policy,stopFraction});
  }catch(error){errors.push({index:i,message:error.message});}}
  const r={symbol,configuration:cfg,entries,errors};runs.push(r);assert.equal(errors.length,0,JSON.stringify(errors[0]));return r;
 }
 const initial=run('TSLA'),oldBytes=JSON.stringify(initial.entries),instance=orch.symbolStrategyModules.get('RSI2MeanReversion').get('TSLA');
 const wsFile=path.join(clone,'core/WebSocketManager.js'),WS=compile(wsFile,wsFile,{'../foundation/ConfigLoader':loader,'./StateManager':{getInstance:()=>({})},'./TradeNarrator':{getNarrator:()=>({})},'./BotStateFrame':{buildBotStateFrame:()=>({})}});
 const receiver=new WS({dashboardWs:{readyState:1,send:t=>wire.push(JSON.parse(t))}});
 const prefix='strategies.RSI2MeanReversion.';
 function save(values){const changes=Object.fromEntries(Object.entries(values).map(([k,v])=>[prefix+k,v])),c=loader.getSettingsView().configuration;receiver.handleSettings({type:'save_settings',requestId:'rsi2-'+saves.length,expectedRevision:c.settings,expectedSettingsHash:c.settingsHash,changes});const response=wire.at(-1);saves.push({changes,response});return response;}
 const common={rsiPeriod:2,rsiEntry:30,rsiExitLong:70,rsiEntryOB:60,trendPeriod:10,allowShorts:true,stopLossPercent:-2,maxHoldTimeMinutes:120};
 const first=save(common);
 if(phase==='baseline'){
  assert.equal(first.reason,'setting_not_hot_editable');Object.assign(settings.strategies.RSI2MeanReversion,common);settings.revision++;fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(settings));loader.load({force:true,loadDotenv:false,silent:true});
  run('TSLA');assert.notEqual(instance.cfg.trendPeriod,loader.get(prefix.slice(0,-1)).trendPeriod);
 }else{
  assert.equal(first.applied,true);const changed=run('TSLA');assert.ok(changed.entries.length);assert.equal(orch.symbolStrategyModules.get('RSI2MeanReversion').get('TSLA'),instance);assert.equal(instance.minHistory,12);
  run('FIXTURE-SECOND');assert.notEqual(orch.symbolStrategyModules.get('RSI2MeanReversion').get('FIXTURE-SECOND'),instance);
  const signature=r=>JSON.stringify(r.entries.map(e=>({index:e.index,action:e.action,contract:e.contract})));
  for(const [key,value]of Object.entries({rsiPeriod:3,rsiEntry:15,rsiExitLong:90,rsiEntryOB:90,trendPeriod:30,allowShorts:false,stopLossPercent:-0.5,maxHoldTimeMinutes:30})){
   assert.equal(save({...common,[key]:value}).applied,true);const r=run('TSLA');assert.notEqual(signature(r),signature(changed),key+' must reach an operative output');effects.push({key,value,entries:r.entries.length,shorts:r.entries.filter(e=>e.action==='SELL').length,changedOutput:true});
  }
  const lastFieldRun=runs.at(-1);
  assert.equal(save({rsiEntry:30,rsiExitLong:99,rsiEntryOB:50.5,allowShorts:false}).applied,true);
  const endpoint=run('TSLA');assert.ok(endpoint.entries.length>0);
  for(const direction of ['long','short'])for(const value of [98.999,99]){const contract=endpoint.entries[0].contract,indicators={[`rsi${contract.rsiPeriod}`]:value};const result=ecm.checkInvalidationConditions(['rsi2_exit_long'],{direction,exitContract:contract},indicators,{});assert.equal(result.triggered,direction==='long'&&value>=99);thresholdBoundary.push({direction,value,result});}
  for(const r of [initial,changed,lastFieldRun,endpoint])for(const entry of r.entries){
   const direction=entry.action==='BUY'?'long':'short';const trade={id:'fixture-'+entry.index,entryStrategy:'RSI2MeanReversion',direction,entryPrice:100,entryTime:1000000,exitContract:entry.contract,frozenExitPolicy:entry.policy,maxProfitPercent:0,entryOrderQuantity:1,remainingOrderQuantity:1};
   const stopAt=ecm.stopLossChecker.check({...trade},direction==='long'?100+entry.contract.stopLossPercent:100-entry.contract.stopLossPercent,entry.contract.stopLossPercent);
   const stopBefore=ecm.stopLossChecker.check({...trade},100,entry.contract.stopLossPercent+0.01);assert.equal(stopAt.exitReason,'stop_loss');assert.equal(stopBefore.shouldExit,false);
   const holdAt=ecm.maxHoldChecker.check({...trade},entry.contract.maxHoldTimeMinutes,0),holdBefore=ecm.maxHoldChecker.check({...trade},entry.contract.maxHoldTimeMinutes-0.01,0);assert.equal(holdAt.shouldExit,true);assert.equal(holdBefore.shouldExit,false);
   const fullStop=ecm.checkExitConditions({...trade},direction==='long'?100+entry.contract.stopLossPercent-0.0001:100-entry.contract.stopLossPercent+0.0001,{currentTime:trade.entryTime+1000});assert.equal(fullStop.exitReason,'stop_loss');
   const fullHold=ecm.checkExitConditions({...trade},100,{currentTime:trade.entryTime+entry.contract.maxHoldTimeMinutes*60000});assert.equal(fullHold.exitReason,'max_hold_loser');
   const rsiRows=[];for(let i=entry.index+1;i<bars.length;i+=11){const history=bars.slice(0,i+1),rsi=IndicatorCalculator.calculateRSI(history,entry.contract.rsiPeriod);const result=ecm.checkInvalidationConditions(['rsi2_exit_long'],{...trade},frames[i].indicators,{priceHistory:history});assert.equal(result.triggered,direction==='long'&&rsi>=entry.contract.rsiExitLong);let full=null;if(result.triggered){full=ecm.checkExitConditions({...trade},100,{currentTime:trade.entryTime+1000,indicators:frames[i].indicators,priceHistory:history});assert.equal(full.exitReason,'invalidation');}rsiRows.push({index:i,rsi,result,full});}
   exits.push({entryIndex:entry.index,direction,contract:entry.contract,stopAt,stopBefore,holdAt,holdBefore,fullStop,fullHold,rsiRows});
  }
  assert.ok(exits.some(e=>e.rsiRows.some(r=>r.result.triggered)));assert.ok(exits.some(e=>e.direction==='short'));
  assert.equal(JSON.stringify(initial.entries),oldBytes);
  const accepted=loader.getSettingsView().configuration.fingerprint;
  if(process.argv.includes('--reproduce-stop-boundary')){assert.equal(save({rsiEntry:30,stopLossPercent:-100}).applied,true);run('TSLA');}
  for(const value of [{rsiPeriod:0},{rsiPeriod:1.5},{trendPeriod:0},{rsiEntry:0},{rsiEntry:50},{rsiExitLong:50},{rsiExitLong:99.5},{rsiExitLong:100},{rsiEntryOB:50},{rsiEntryOB:100},{allowShorts:'false'},{stopLossPercent:0},{stopLossPercent:-100},{stopLossPercent:-101},{stopLossPercent:-Number.MIN_VALUE},{maxHoldTimeMinutes:0}])assert.equal(save(value).reason,'invalid_setting_value');
  assert.equal(loader.getSettingsView().configuration.fingerprint,accepted);
  for(const stopLossPercent of [-99.9,-(Number.MIN_VALUE*100)]){assert.equal(save({rsiEntry:30,stopLossPercent}).applied,true);assert.ok(run('TSLA').entries.length>0);}
  assert.equal(save({rsiEntry:0.5,rsiExitLong:98.5,rsiEntryOB:50.5,allowShorts:false}).applied,true);run('TSLA');
  assert.equal(makeLoader().load({loadDotenv:false,silent:true}).fingerprint,loader.getSettingsView().configuration.fingerprint);
 }
 receipt={at:new Date().toISOString(),phase,sources,input:{path:'tuning/tsla-15m-tiny.json',sha256:hash(input),bars:bars.length},boundary:'Actual bot-side receiver, AtomicWrite and configuration, full orchestrator restricted to RSI2, PolicyBuilder, OrderExecutor stop conversion and ECM exit consumers; recorded bars and synthetic exit-boundary trades; no live bot, broker or page',runs,saves,effects,exits,thresholdBoundary,oldContractsUnchanged:JSON.stringify(initial.entries)===oldBytes};
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,sources},null,2),{flag:'wx'});throw error;}
finally{Object.assign(console,original);fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(logs),{flag:'wx'});}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify({receipt:path.relative(root,path.join(out,'receipt.json')),phase,runs:receipt.runs.map(r=>({symbol:r.symbol,entries:r.entries.length,shorts:r.entries.filter(e=>e.action==='SELL').length,errors:r.errors.length})),fieldEffects:receipt.effects.length,exitBoundaries:receipt.exits.length}));
