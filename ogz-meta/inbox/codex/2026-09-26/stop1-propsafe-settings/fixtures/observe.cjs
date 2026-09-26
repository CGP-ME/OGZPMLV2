'use strict';
// Actual receiver/configuration/strategy/exit methods. Disposable files and
// recorded prices; no live bot, broker, socket transmission or paper fills.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const phase=process.argv[2];assert.ok(['baseline','candidate','cold'].includes(phase));
const out=fs.mkdtempSync(path.join(packet,'private/'+phase+'-')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const input=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json')),bars=JSON.parse(input).candles;
const sourcePaths=['modules/PropSafeEMAPullback.js','core/StrategyOrchestrator.js','foundation/ConfigLoader.js','core/ExitContractManager.js','core/PolicyBuilder.js','core/WebSocketManager.js','core/IndicatorCalculator.js','core/indicators/IndicatorEngine.js','core/exit/StopLossChecker.js','core/exit/MaxHoldChecker.js','core/OrderExecutor.js'];
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
 const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'});orch.strategies=orch.strategies.filter(s=>s.name==='PropSafeEMAPullback');assert.equal(orch.strategies.length,1);
 const frames=(()=>{const engine=new IndicatorEngine({...loader.get('indicators.engine'),symbol:'TSLA',tf:'15m'});return bars.map(b=>engine.updateCandle(b));})();
 const runs=[],wire=[],saves=[],effects=[],exits=[];
 function run(symbol){
  const cfg=loader.get('strategies.PropSafeEMAPullback'),entries=[],errors=[];
  for(let i=0;i<bars.length;i++){const history=bars.slice(0,i+1);try{
   const result=orch.evaluate(frames[i].indicators,[],null,history,{symbol,timeframe:'15m',price:bars[i].c});
   if(!['BUY','SELL'].includes(result.action))continue;
   const contract=result.exitContract,ownedAtr=IndicatorCalculator.calculateATR(history,cfg.atrPeriod),expectedStop=-cfg.atrStopMult*ownedAtr/bars[i].c*100;
   const policy=PolicyBuilder.buildForTrade({strategyName:'PropSafeEMAPullback',exitContract:contract,nowMs:bars[i].t,volatility:0.5,confidence:0.7,marketCondition:'normal',entryDirection:result.action==='BUY'?'long':'short',mtfConfluenceSnapshot:null});
   const stopFraction=stopConsumer._resolveContractStopPercent(contract);
   if(phase!=='baseline'){
    assert.ok(Math.abs(contract.stopLossPercent-expectedStop)<1e-10);
    assert.equal(contract.maxHoldTimeMinutes,cfg.maxHoldTimeMinutes);assert.equal(policy.contract.maxHoldTimeMinutes,cfg.maxHoldTimeMinutes);
    assert.equal(policy.contract.stopLossPercent,contract.stopLossPercent);
    assert.ok(i+1>=Math.max(cfg.trendEmaPeriod+cfg.crossLookbackBars+2,cfg.atrPeriod+2));
   }
   entries.push({index:i,action:result.action,confidence:result.confidence,contract,policy,stopFraction,ownedAtr,sharedAtr:frames[i].indicators.atr,expectedStop});
  }catch(error){errors.push({index:i,message:error.message});}}
  const r={symbol,configuration:cfg,entries,errors};runs.push(r);assert.equal(errors.length,0,JSON.stringify(errors[0]));return r;
 }
 const initial=run('TSLA'),oldBytes=JSON.stringify(initial.entries),instance=orch.symbolStrategyModules.get('PropSafeEMAPullback').get('TSLA');
 assert.ok(initial.entries.length);
 const wsFile=path.join(clone,'core/WebSocketManager.js'),WS=compile(wsFile,wsFile,{'../foundation/ConfigLoader':loader,'./StateManager':{getInstance:()=>({})},'./TradeNarrator':{getNarrator:()=>({})},'./BotStateFrame':{buildBotStateFrame:()=>({})}});
 const receiver=new WS({dashboardWs:{readyState:1,send:t=>wire.push(JSON.parse(t))}});
 const prefix='strategies.PropSafeEMAPullback.';
 function save(values){const changes=Object.fromEntries(Object.entries(values).map(([k,v])=>[prefix+k,v])),c=loader.getSettingsView().configuration;receiver.handleSettings({type:'save_settings',requestId:'propsafe-'+saves.length,expectedRevision:c.settings,expectedSettingsHash:c.settingsHash,changes});const response=wire.at(-1);saves.push({changes,response});return response;}
 const common={fastEmaPeriod:3,pullbackEmaPeriod:6,trendEmaPeriod:12,atrPeriod:7,crossLookbackBars:5,pullbackLookbackBars:3,pullbackMinAtr:0,pullbackMaxAtr:2,atrStopMult:2,maxHoldTimeMinutes:30,requireRth:false,allowShorts:true};
 const first=save(common);
 if(phase==='baseline'){
  assert.equal(first.reason,'setting_not_hot_editable');assert.ok(initial.entries.some(e=>Math.abs(e.contract.stopLossPercent-e.expectedStop)>1e-10));
  Object.assign(settings.strategies.PropSafeEMAPullback,common);settings.revision++;fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(settings));loader.load({force:true,loadDotenv:false,silent:true});
  run('TSLA');assert.notEqual(instance.cfg.trendEmaPeriod,loader.get(prefix.slice(0,-1)).trendEmaPeriod);
 }else{
  assert.equal(first.applied,true);const changed=run('TSLA');assert.ok(changed.entries.some(e=>e.action==='SELL'));assert.equal(orch.symbolStrategyModules.get('PropSafeEMAPullback').get('TSLA'),instance);
  run('FIXTURE-SECOND');assert.notEqual(orch.symbolStrategyModules.get('PropSafeEMAPullback').get('FIXTURE-SECOND'),instance);
  const signature=r=>JSON.stringify(r.entries.map(e=>({index:e.index,action:e.action,confidence:e.confidence,stop:e.contract.stopLossPercent,hold:e.contract.maxHoldTimeMinutes})));
  for(const [key,value]of Object.entries({fastEmaPeriod:2,pullbackEmaPeriod:7,trendEmaPeriod:25,atrPeriod:14,crossLookbackBars:20,pullbackLookbackBars:6,pullbackMinAtr:0.1,pullbackMaxAtr:0.1,atrStopMult:3,maxHoldTimeMinutes:60,requireRth:true,allowShorts:false})){
   assert.equal(save({...common,[key]:value}).applied,true);const r=run('TSLA');const changedOutput=signature(r)!==signature(changed);effects.push({key,value,entries:r.entries.length,shorts:r.entries.filter(e=>e.action==='SELL').length,changedOutput});assert.ok(changedOutput,key+' needs actual consuming effect');
  }
  for(const r of [initial,changed])for(const entry of r.entries){
   const direction=entry.action==='BUY'?'long':'short',stop=entry.contract.stopLossPercent;
   const trade={id:'fixture-'+entry.index,entryStrategy:'PropSafeEMAPullback',direction,entryPrice:100,entryTime:1000000,exitContract:entry.contract,frozenExitPolicy:entry.policy,maxProfitPercent:0,entryOrderQuantity:1,remainingOrderQuantity:1};
   const stopAt=ecm.checkExitConditions({...trade},direction==='long'?100+stop-0.0001:100-stop+0.0001,{currentTime:trade.entryTime+1000});assert.equal(stopAt.exitReason,'stop_loss');
   const holdAt=ecm.checkExitConditions({...trade},100,{currentTime:trade.entryTime+entry.contract.maxHoldTimeMinutes*60000});assert.equal(holdAt.exitReason,'max_hold_loser');
   exits.push({index:entry.index,direction,contract:entry.contract,stopAt,holdAt});
  }
  assert.equal(JSON.stringify(initial.entries),oldBytes);
  const accepted=loader.getSettingsView().configuration.fingerprint;
  const invalid=[{fastEmaPeriod:0},{atrPeriod:1.5},{crossLookbackBars:0},{pullbackLookbackBars:0},{pullbackMinAtr:-1},{pullbackMaxAtr:0},{atrStopMult:0},{maxHoldTimeMinutes:0},{requireRth:'false'},{allowShorts:'false'},{fastEmaPeriod:6,pullbackEmaPeriod:6},{pullbackEmaPeriod:12,trendEmaPeriod:12},{pullbackMinAtr:2,pullbackMaxAtr:1}];
  for(const value of invalid)assert.equal(save(value).applied,false,JSON.stringify(value));
  assert.equal(loader.getSettingsView().configuration.fingerprint,accepted);
  assert.equal(makeLoader().load({loadDotenv:false,silent:true}).fingerprint,loader.getSettingsView().configuration.fingerprint);
 }
 receipt={at:new Date().toISOString(),phase,sources,input:{path:'tuning/tsla-15m-tiny.json',sha256:hash(input),bars:bars.length},boundary:'Actual receiver, ConfigLoader, AtomicWrite, full orchestrator restricted to PropSafe, PolicyBuilder, order stop converter, full ECM stop/max-hold consumers; recorded bars and explicitly synthetic exit boundaries; no bot/browser/broker',runs,saves,effects,exits,oldContractsUnchanged:JSON.stringify(initial.entries)===oldBytes};
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,sources},null,2),{flag:'wx'});throw error;}
finally{Object.assign(console,original);fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(logs),{flag:'wx'});}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify({receipt:path.relative(root,path.join(out,'receipt.json')),phase,runs:receipt.runs.map(r=>({symbol:r.symbol,entries:r.entries.length,shorts:r.entries.filter(e=>e.action==='SELL').length,errors:r.errors.length})),fieldEffects:receipt.effects.length,exits:receipt.exits.length}));
