'use strict';
// Actual configuration, strategy and exit methods on recorded data; isolated
// files and inert socket/state dependencies. Not a running bot or paper trade.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const phase=process.argv[2];assert.ok(['baseline','candidate','cold'].includes(phase));
const out=fs.mkdtempSync(path.join(packet,'private/'+phase+'-')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputs=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json')),bars=JSON.parse(inputs).candles;
const sourceFiles=['modules/TimeSeriesMomentum.js','core/StrategyOrchestrator.js','foundation/ConfigLoader.js','core/ExitContractManager.js','core/PolicyBuilder.js','core/WebSocketManager.js'];
const sources=Object.fromEntries(sourceFiles.map(p=>[p,hash(fs.readFileSync(path.join(clone,p)))]));
fs.mkdirSync(path.join(out,'config'));fs.mkdirSync(path.join(out,'foundation'));
const settings=JSON.parse(fs.readFileSync(path.join(clone,'config/settings.json')));settings.filters.atrEnabled=false;
fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(settings,null,2)+'\n',{flag:'wx'});
fs.copyFileSync(path.join(clone,'config/internals.json'),path.join(out,'config/internals.json'),fs.constants.COPYFILE_EXCL);
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
const file=path.join(out,'foundation/ConfigLoader.js');
function makeLoader(){const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file)).concat(Module._nodeModulePaths(root));const actual=m.require.bind(m);m.require=n=>n==='../core/AtomicWrite'?require(path.join(clone,'core/AtomicWrite')):actual(n);m._compile(fs.readFileSync(path.join(clone,'foundation/ConfigLoader.js'),'utf8'),file);return m.exports;}
const loader=makeLoader();loader.load({loadDotenv:false,silent:true});
const loaderPath=path.join(clone,'foundation/ConfigLoader.js');require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
const original={...console},logs=[];for(const k of ['log','warn','error'])console[k]=(...args)=>logs.push({level:k,text:args.join(' ')});
let record;
try{
 const {StrategyOrchestrator}=require(path.join(clone,'core/StrategyOrchestrator'));
 const IndicatorEngine=require(path.join(clone,'core/indicators/IndicatorEngine'));
 const {IndicatorCalculator}=require(path.join(clone,'core/IndicatorCalculator'));
 const ecm=require(path.join(clone,'core/ExitContractManager')).getInstance(),policy=require(path.join(clone,'core/PolicyBuilder'));
 const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'});orch.strategies=orch.strategies.filter(s=>s.name==='TimeSeriesMomentum');assert.equal(orch.strategies.length,1);
 function run(symbol){
  const engine=new IndicatorEngine({...loader.get('indicators.engine'),symbol,tf:'15m'}),entries=[],errors=[];
  const cfg=loader.get('strategies.TimeSeriesMomentum');
  for(let i=0;i<bars.length;i++){
   const history=bars.slice(0,i+1),frame=engine.updateCandle(bars[i]);
   try{
    const result=orch.evaluate(frame.indicators,[],null,history,{symbol,timeframe:'15m',price:bars[i].c});
    if(['BUY','SELL'].includes(result.action)){
     const contract=result.exitContract,ownedAtr=IndicatorCalculator.calculateATR(history,cfg.atrPeriod),expectedStop=-cfg.atrStopMult*ownedAtr/bars[i].c*100;
     const frozen=policy.buildForTrade({strategyName:'TimeSeriesMomentum',exitContract:contract,nowMs:bars[i].t,volatility:0.5,confidence:0.7,marketCondition:'normal',entryDirection:result.action==='BUY'?'long':'short',mtfConfluenceSnapshot:null});
     assert.ok(Object.isFrozen(frozen.contract));
     if(phase!=='baseline'){
      assert.ok(Math.abs(contract.stopLossPercent-expectedStop)<1e-10,JSON.stringify({i,observed:contract.stopLossPercent,expectedStop}));
      assert.equal(contract.tsmLookback,cfg.lookback);assert.equal(contract.trailAtrMult,cfg.trailAtrMult);assert.equal(frozen.contract.trailAtrMult,cfg.trailAtrMult);
      assert.ok(Math.abs(contract.tsmEntryTrailingReturn)>cfg.minReturn);
      assert.ok(i+1>=Math.max(cfg.lookback,cfg.trendPeriod,cfg.atrPeriod)+2);
     }
     entries.push({index:i,action:result.action,contract,policy:frozen,sharedAtr:frame.indicators.atr,ownedAtr,expectedStop});
    }
   }catch(error){errors.push({index:i,message:error.message});}
  }
  return {symbol,configuration:cfg,entries,errors};
 }
 const initial=run('TSLA'),oldSerialized=JSON.stringify(initial.entries),runs=[initial],saves=[],wire=[],applied=[];
 const instance=orch.symbolStrategyModules.get('TimeSeriesMomentum').get('TSLA');
 const wsFile=path.join(clone,'core/WebSocketManager.js'),wm=new Module(wsFile,module);wm.filename=wsFile;wm.paths=Module._nodeModulePaths(path.dirname(wsFile)).concat(Module._nodeModulePaths(root));
 const wsRequire=wm.require.bind(wm),replacements={'../foundation/ConfigLoader':loader,'./StateManager':{getInstance:()=>({})},'./TradeNarrator':{getNarrator:()=>({})},'./BotStateFrame':{buildBotStateFrame:()=>({})}};
 wm.require=n=>Object.hasOwn(replacements,n)?replacements[n]:wsRequire(n);wm._compile(fs.readFileSync(wsFile,'utf8'),wsFile);
 const receiver=new wm.exports({dashboardWs:{readyState:1,send:t=>wire.push(JSON.parse(t))},onSettingsApplied:(snapshot,result)=>applied.push(result.configuration)});
 receiver.handleSettings({type:'get_settings',requestId:'read'});assert.ok(wire.at(-1).fields);
 const save=changes=>{const view=loader.getSettingsView();receiver.handleSettings({type:'save_settings',requestId:'tsm-'+saves.length,expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes});const response=wire.at(-1);saves.push({changes,response});return response;};
 const changed={'strategies.TimeSeriesMomentum.lookback':10,'strategies.TimeSeriesMomentum.trendPeriod':20,'strategies.TimeSeriesMomentum.atrPeriod':7,'strategies.TimeSeriesMomentum.minReturn':0.001,'strategies.TimeSeriesMomentum.allowShorts':true,'strategies.TimeSeriesMomentum.atrStopMult':3,'strategies.TimeSeriesMomentum.trailAtrMult':2};
 const firstSave=save(changed),trailObservations=[],returnFlipObservations=[],coordinatorObservations=[];
 assert.equal(initial.errors.length,0);assert.ok(initial.entries.length>0);
 if(phase==='baseline'){
  assert.ok(initial.entries.some(e=>Math.abs(e.contract.stopLossPercent-e.expectedStop)>1e-10));
  assert.equal(firstSave.reason,'setting_not_hot_editable');
 }else{
  assert.equal(firstSave.applied,true);runs.push(run('TSLA'));
  assert.equal(orch.symbolStrategyModules.get('TimeSeriesMomentum').get('TSLA'),instance);
  assert.equal(instance.cfg.lookback,10);assert.equal(instance.cfg.trendPeriod,20);assert.equal(instance.cfg.atrPeriod,7);assert.equal(instance.minHistory,22);
  runs.push(run('FIXTURE-SECOND'));assert.notEqual(orch.symbolStrategyModules.get('TimeSeriesMomentum').get('FIXTURE-SECOND'),instance);
  for(const r of runs.slice(1)){assert.equal(r.errors.length,0);assert.ok(r.entries.some(e=>e.action==='SELL'));}
  assert.equal(save({'strategies.TimeSeriesMomentum.minReturn':0,'strategies.TimeSeriesMomentum.allowShorts':false}).applied,true);runs.push(run('TSLA'));
  assert.equal(runs.at(-1).entries.some(e=>e.action==='SELL'),false);assert.equal(runs.at(-1).errors.length,0);
  const accepted=loader.getSettingsView().configuration.fingerprint;
  for(const changes of [{'strategies.TimeSeriesMomentum.lookback':1.5},{'strategies.TimeSeriesMomentum.trendPeriod':0},{'strategies.TimeSeriesMomentum.atrPeriod':0},{'strategies.TimeSeriesMomentum.minReturn':-0.1},{'strategies.TimeSeriesMomentum.allowShorts':'false'},{'strategies.TimeSeriesMomentum.atrStopMult':0},{'strategies.TimeSeriesMomentum.trailAtrMult':0}])assert.equal(save(changes).reason,'invalid_setting_value');
  assert.equal(loader.getSettingsView().configuration.fingerprint,accepted);
  // Exercise actual trailing consumer with recorded shared ATR. Existing
  // activation/clamps remain visible, not replaced by invented new policy.
  for(const runRecord of runs.slice(0,2))for(const entry of runRecord.entries){
   const direction=entry.action==='BUY'?'long':'short',entryPrice=bars[entry.index].c;
   for(let i=entry.index+1;i<bars.length;i++){
    const history=bars.slice(0,i+1),current=bars[i].c,past=bars[i-entry.contract.tsmLookback]?.c;
    if(past){const expected=direction==='long'?(current-past)/past<=0:(current-past)/past>=0;const result=ecm.checkInvalidationConditions(['tsm_return_flip'],{direction,exitContract:entry.contract},{},{priceHistory:history,currentPrice:current});assert.equal(result.triggered,expected);if(expected){returnFlipObservations.push({entryIndex:entry.index,index:i,lookback:entry.contract.tsmLookback,direction,result});break;}}
   }
   const engine=new IndicatorEngine({...loader.get('indicators.engine'),symbol:'TSLA',tf:'15m'});
   for(let i=0;i<bars.length;i++){
    const frame=engine.updateCandle(bars[i]);if(i<=entry.index)continue;
    const current=bars[i].c,pnl=(direction==='long'?current-entryPrice:entryPrice-current)/entryPrice*100;
    const trade={id:'fixture-'+entry.index,entryStrategy:'TimeSeriesMomentum',direction,entryPrice,entryTime:bars[entry.index].t,exitContract:entry.contract,frozenExitPolicy:entry.policy,highestPrice:current,lowestPrice:current};
    const result=ecm._updateTrailingStopState(trade,current,pnl,{indicators:frame.indicators,priceHistory:bars.slice(0,i+1)});
    if(result.updated){
     const cfg=ecm.trailConfig,ind=frame.indicators,trend=String(ind.trend||'').toLowerCase();
     let distance=ind.atr/current*entry.contract.trailAtrMult;
     const supports=direction==='long'?['bullish','uptrend','trending_up','up'].includes(trend):['bearish','downtrend','trending_down','down'].includes(trend);
     if(supports&&Number.isFinite(ind.rsi)&&cfg.trendWidenMultiplier>1)distance*=1+(cfg.trendWidenMultiplier-1)*Math.max(0,(direction==='long'?ind.rsi-50:50-ind.rsi)/50);
     if(pnl>cfg.profitRatchetThreshold&&cfg.profitRatchetRate>0)distance*=Math.max(cfg.profitRatchetFloor,1-(pnl-cfg.profitRatchetThreshold)*cfg.profitRatchetRate);
     assert.ok(!ind.nearestStructure,'No invented structure evidence');
     distance=Math.max(cfg.minTrailPercent/100,Math.min(cfg.maxTrailPercent/100,distance));
     assert.ok(Math.abs(result.trailDistance-distance)<1e-12);
     trailObservations.push({entryIndex:entry.index,index:i,direction,contractMultiplier:entry.contract.trailAtrMult,sharedAtr:ind.atr,price:current,pnl,expectedDistance:distance,result,stop:trade.currentStop});
     const fullTrade={id:'fixture-full-'+entry.index,entryStrategy:'TimeSeriesMomentum',direction,entryPrice,entryTime:bars[entry.index].t,exitContract:entry.contract,frozenExitPolicy:entry.policy,entryOrderQuantity:1,remainingOrderQuantity:1,highestPrice:current,lowestPrice:current,tradeRevision:0,beScaleOutState:{status:'idle'},tierStates:entry.policy.profitManagement.tieredExit.tiers.map(()=>({status:'idle'}))};
     const fullResult=ecm.checkExitConditions(fullTrade,current,{intentId:'fixture-intent-'+i,indicators:ind,priceHistory:bars.slice(0,i+1),currentTime:bars[i].t});
     coordinatorObservations.push({entryIndex:entry.index,index:i,result:fullResult,trailingActive:fullTrade.trailingActive===true,currentStop:fullTrade.currentStop});
     assert.ok(Number.isFinite(trade.currentStop));break;
    }
   }
  }
  assert.ok(returnFlipObservations.length>0);assert.ok(trailObservations.some(x=>x.contractMultiplier===1));assert.ok(trailObservations.some(x=>x.contractMultiplier===2));
  assert.ok(coordinatorObservations.some(x=>x.trailingActive));assert.equal(coordinatorObservations.some(x=>x.result.profitPlannerSkipped),false);
  assert.equal(JSON.stringify(initial.entries),oldSerialized);
  assert.equal(makeLoader().load({loadDotenv:false,silent:true}).fingerprint,loader.getSettingsView().configuration.fingerprint);
 }
 record={at:new Date().toISOString(),boundary:'Actual bot-side receiver/ConfigLoader/AtomicWrite, full orchestrator restricted to TSM, frozen PolicyBuilder contracts, ECM trailing and return-flip methods plus coordinator; recorded TSLA data, inert socket/state; no broker/bot boot',sources,input:{path:'tuning/tsla-15m-tiny.json',sha256:hash(inputs),bars:bars.length},phase,runs,saves,wire,applied,trailObservations,returnFlipObservations,coordinatorObservations,oldContractsUnchanged:JSON.stringify(initial.entries)===oldSerialized,finalConfiguration:loader.getSettingsView().configuration};
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,sources},null,2)+'\n',{flag:'wx'});throw error;}
finally{Object.assign(console,original);fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(logs,null,2)+'\n',{flag:'wx'});}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({receipt:path.relative(root,path.join(out,'receipt.json')),runs:record.runs.map(x=>({symbol:x.symbol,entries:x.entries.length,shorts:x.entries.filter(e=>e.action==='SELL').length,errors:x.errors.length,firstError:x.errors[0]})),trail:record.trailObservations.length,returnFlip:record.returnFlipObservations.length}));
