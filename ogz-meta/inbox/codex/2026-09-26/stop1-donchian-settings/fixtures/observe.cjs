'use strict';
// Real configuration/strategy/contract owners, recorded bars and isolated state.
// Not a bot boot, order, broker operation or deployed UI acceptance.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const phase=process.argv[2];assert.ok(['baseline','candidate','cold'].includes(phase));
const out=fs.mkdtempSync(path.join(packet,'private/'+phase+'-')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputs=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json')),bars=JSON.parse(inputs).candles;
const sourceFiles=['modules/DonchianBreakout.js','core/StrategyOrchestrator.js','foundation/ConfigLoader.js','core/ExitContractManager.js','core/PolicyBuilder.js'];
const sources=Object.fromEntries(sourceFiles.map(p=>[p,hash(fs.readFileSync(path.join(clone,p)))]));
fs.mkdirSync(path.join(out,'config'));fs.mkdirSync(path.join(out,'foundation'));
const settings=JSON.parse(fs.readFileSync(path.join(clone,'config/settings.json')));settings.filters.atrEnabled=false;
fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(settings,null,2)+'\n',{flag:'wx'});
fs.copyFileSync(path.join(clone,'config/internals.json'),path.join(out,'config/internals.json'),fs.constants.COPYFILE_EXCL);
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
const file=path.join(out,'foundation/ConfigLoader.js'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file)).concat(Module._nodeModulePaths(root));
const actualRequire=m.require.bind(m);m.require=name=>name==='../core/AtomicWrite'?require(path.join(clone,'core/AtomicWrite')):actualRequire(name);
m._compile(fs.readFileSync(path.join(clone,'foundation/ConfigLoader.js'),'utf8'),file);
const loader=m.exports;loader.load({loadDotenv:false,silent:true});
const loaderPath=path.join(clone,'foundation/ConfigLoader.js');require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
const original={...console},logs=[];for(const k of ['log','warn','error'])console[k]=(...args)=>logs.push({level:k,text:args.join(' ')});
let record;
try{
 const {StrategyOrchestrator}=require(path.join(clone,'core/StrategyOrchestrator'));
 const IndicatorEngine=require(path.join(clone,'core/indicators/IndicatorEngine'));
 const {IndicatorCalculator}=require(path.join(clone,'core/IndicatorCalculator'));
 const ecm=require(path.join(clone,'core/ExitContractManager')).getInstance();
 const policy=require(path.join(clone,'core/PolicyBuilder'));
 const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'});orch.strategies=orch.strategies.filter(s=>s.name==='DonchianBreakout');assert.equal(orch.strategies.length,1);
 function run(symbol){
  const engine=new IndicatorEngine({...loader.get('indicators.engine'),symbol,tf:'15m'}),entries=[],errors=[];
  for(let i=0;i<bars.length;i++){
   const frame=engine.updateCandle(bars[i]);
   try{
    const result=orch.evaluate(frame.indicators,[],null,bars.slice(0,i+1),{symbol,timeframe:'15m',price:bars[i].c});
    if(['BUY','SELL'].includes(result.action)){
     const contract=result.exitContract,expected=-loader.get('strategies.DonchianBreakout.atrStopMult')*IndicatorCalculator.calculateATR(bars.slice(0,i+1),loader.get('strategies.DonchianBreakout.atrPeriod'))/bars[i].c*100;
     assert.ok(Math.abs(contract.stopLossPercent-expected)<1e-10,JSON.stringify({i,contract,expected}));
     assert.equal(contract.trailChannelBars,loader.get('strategies.DonchianBreakout.trailChannelBars'));
     for(const k of ['takeProfitPercent','trailingStopPercent','trailingActivation','maxHoldTimeMinutes'])assert.equal(contract[k],null,k);
     const frozen=policy.buildForTrade({strategyName:'DonchianBreakout',exitContract:contract,nowMs:bars[i].t,volatility:0.5,confidence:0.7,marketCondition:'normal',entryDirection:result.action==='BUY'?'long':'short',mtfConfluenceSnapshot:null});
     assert.ok(Object.isFrozen(frozen.contract));
     entries.push({index:i,action:result.action,contract,policy:frozen});
    }
   }catch(error){errors.push({index:i,message:error.message});}
  }
  return {symbol,entries,errors};
 }
 const initial=run('TSLA'),oldSerialized=JSON.stringify(initial.entries),saves=[],runs=[initial];
 const instance=orch.symbolStrategyModules.get('DonchianBreakout').get('TSLA');
 // The real bot-side settings receiver; only unrelated eager state/narrator
 // dependencies and socket transport are supplied as inert fixture objects.
 const wsFile=path.join(clone,'core/WebSocketManager.js'),wm=new Module(wsFile,module);wm.filename=wsFile;wm.paths=Module._nodeModulePaths(path.dirname(wsFile)).concat(Module._nodeModulePaths(root));
 const wsRequire=wm.require.bind(wm),replacements={'../foundation/ConfigLoader':loader,'./StateManager':{getInstance:()=>({})},'./TradeNarrator':{getNarrator:()=>({})},'./BotStateFrame':{buildBotStateFrame:()=>({})}};
 wm.require=name=>Object.hasOwn(replacements,name)?replacements[name]:wsRequire(name);wm._compile(fs.readFileSync(wsFile,'utf8'),wsFile);
 const wire=[],applied=[];const receiver=new wm.exports({dashboardWs:{readyState:1,send:text=>wire.push(JSON.parse(text))},onSettingsApplied:(snapshot,result)=>applied.push(result.configuration)});
 receiver.handleSettings({type:'get_settings',requestId:'read'});assert.ok(wire.at(-1).fields);
 const save=changes=>{const view=loader.getSettingsView();receiver.handleSettings({type:'save_settings',requestId:'dc-'+saves.length,expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes});const response=wire.at(-1);saves.push({changes,response});return response;};
 const changed={'strategies.DonchianBreakout.entryPeriod':10,'strategies.DonchianBreakout.atrPeriod':7,'strategies.DonchianBreakout.atrStopMult':3,'strategies.DonchianBreakout.allowShorts':true,'strategies.DonchianBreakout.trailChannelBars':5};
 const firstSave=save(changed);
 const exits=[],coordinatorExits=[];
 if(phase==='baseline'){
  assert.ok(initial.errors.length>0);assert.ok(initial.errors.every(x=>x.message.includes('trailingStopPercent must be numeric')));assert.equal(firstSave.reason,'setting_not_hot_editable');
 }else{
  assert.equal(initial.errors.length,0);assert.ok(initial.entries.length>0);assert.equal(firstSave.applied,true);
  runs.push(run('TSLA'));assert.equal(orch.symbolStrategyModules.get('DonchianBreakout').get('TSLA'),instance);
  // Second identity exercises separate instance construction with identical
  // recorded input; it is not represented as data from a second market.
  runs.push(run('FIXTURE-SECOND'));assert.notEqual(orch.symbolStrategyModules.get('DonchianBreakout').get('FIXTURE-SECOND'),instance);
  for(const r of runs.slice(1)){assert.equal(r.errors.length,0);assert.ok(r.entries.some(x=>x.action==='SELL'));}
  assert.equal(instance.entryPeriod,10);assert.equal(instance.atrPeriod,7);assert.equal(instance.atrStopMult,3);assert.equal(instance.minHistory,12);
  assert.equal(JSON.stringify(initial.entries),oldSerialized);
  assert.equal(save({'strategies.DonchianBreakout.allowShorts':false}).applied,true);runs.push(run('TSLA'));
  assert.equal(runs.at(-1).entries.some(x=>x.action==='SELL'),false);assert.equal(runs.at(-1).errors.length,0);
  const identity=loader.getSettingsView().configuration.fingerprint;
  for(const changes of [{'strategies.DonchianBreakout.entryPeriod':1.5},{'strategies.DonchianBreakout.atrPeriod':0},{'strategies.DonchianBreakout.atrStopMult':0},{'strategies.DonchianBreakout.allowShorts':'false'},{'strategies.DonchianBreakout.trailChannelBars':2.5}])assert.equal(save(changes).reason,'invalid_setting_value');
  assert.equal(loader.getSettingsView().configuration.fingerprint,identity);
  // Actual channel exit consumer against recorded future bars and entry-owned
  // channel length. Contract stays old despite settings save.
  for(const r of runs.slice(0,2))for(const entry of r.entries){
   const direction=entry.action==='BUY'?'long':'short',contract=entry.contract;
   for(let i=entry.index+1;i<bars.length;i++){
    const history=bars.slice(0,i+1),previous=history.slice(-contract.trailChannelBars-1,-1);
    const channelStop=direction==='long'?Math.min(...previous.map(b=>b.l)):Math.max(...previous.map(b=>b.h));
    const expected=direction==='long'?bars[i].c<=channelStop:bars[i].c>=channelStop;
    const result=ecm._checkChannelTrail(contract,{direction,entryStrategy:'DonchianBreakout'},bars[i].c,{priceHistory:history});
    assert.equal(result.shouldExit,expected);
    if(expected){
     const complete=ecm.checkExitConditions({id:'fixture-'+entry.index,entryStrategy:'DonchianBreakout',direction,entryPrice:bars[entry.index].c,entryTime:bars[entry.index].t,exitContract:contract,frozenExitPolicy:entry.policy,entryOrderQuantity:1,remainingOrderQuantity:1},bars[i].c,{priceHistory:history,indicators:{},currentTime:bars[i].t});
     coordinatorExits.push({entryIndex:entry.index,exitIndex:i,direction,trailChannelBars:contract.trailChannelBars,result:complete});
    }
    if(expected){exits.push({entryIndex:entry.index,exitIndex:i,direction,trailChannelBars:contract.trailChannelBars,result});break;}
   }
  }
  assert.ok(exits.some(x=>x.trailChannelBars===10));assert.ok(exits.some(x=>x.trailChannelBars===5));
  assert.ok(coordinatorExits.some(x=>x.result.exitReason==='channel_trail'));
  assert.equal(JSON.stringify(initial.entries),oldSerialized);
  const coldModule=new Module(file,module);coldModule.filename=file;coldModule.paths=m.paths;
  const coldRequire=coldModule.require.bind(coldModule);coldModule.require=name=>name==='../core/AtomicWrite'?require(path.join(clone,'core/AtomicWrite')):coldRequire(name);
  coldModule._compile(fs.readFileSync(path.join(clone,'foundation/ConfigLoader.js'),'utf8'),file);
  assert.equal(coldModule.exports.load({loadDotenv:false,silent:true}).fingerprint,loader.getSettingsView().configuration.fingerprint);
 }
 record={at:new Date().toISOString(),boundary:'Actual WebSocketManager receiver/ConfigLoader save, full StrategyOrchestrator restricted to actual Donchian registration, PolicyBuilder, ECM channel method and full exit coordinator; fixture socket and recorded TSLA bars; no bot/order/broker',sources,input:{path:'tuning/tsla-15m-tiny.json',sha256:hash(inputs),bars:bars.length},phase,runs,saves,channelExits:exits,coordinatorExits,wire,applied,oldContractsUnchanged:JSON.stringify(initial.entries)===oldSerialized,finalConfiguration:loader.getSettingsView().configuration};
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,sources},null,2)+'\n',{flag:'wx'});throw error;}
finally{Object.assign(console,original);fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(logs,null,2)+'\n',{flag:'wx'});}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({receipt:path.relative(root,path.join(out,'receipt.json')),runs:record.runs.map(x=>({symbol:x.symbol,entries:x.entries.length,errors:x.errors.length,firstError:x.errors[0]})),channelExits:record.channelExits.length}));
