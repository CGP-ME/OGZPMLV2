'use strict';
// Production configuration/receiver/policy/exit methods; disposable settings,
// recorded bars and explicit fixture trades. No broker, PM2 or live bot.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const phase=process.argv[2];assert.ok(['baseline','candidate','cold'].includes(phase));
const out=fs.mkdtempSync(path.join(packet,'private/'+phase+'-')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceFiles=['core/PolicyBuilder.js','core/ExitContractManager.js','core/TradingLoop.js','foundation/ConfigLoader.js','core/OrderExecutor.js','core/StateManager.js','core/WebSocketManager.js','core/dto/FrozenExitPolicy.js','core/TraceSpine.js','core/NtfyTraceNotifier.js'];
const sources=Object.fromEntries(sourceFiles.map(p=>[p,hash(fs.readFileSync(path.join(clone,p)))]));
fs.mkdirSync(path.join(out,'config'));fs.mkdirSync(path.join(out,'foundation'));
const settings=JSON.parse(fs.readFileSync(path.join(clone,'config/settings.json')));
// Isolate managed-stop behavior from the separately recorded partial/tier policy.
settings.exitLogic.beScaleOut.enabled=false;settings.exitLogic.tieredExit.enabled=false;
settings.exitLogic.breakEvenStop={enabled:true,triggerPercent:0.8};
settings.exitLogic.trail.feeBufferPercent=0.05;
settings.entryLogic.sizing.stockShareRange.enabled=false;
const settingsPath=path.join(out,'config/settings.json');
fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2)+'\n',{flag:'wx'});
fs.copyFileSync(path.join(clone,'config/internals.json'),path.join(out,'config/internals.json'),fs.constants.COPYFILE_EXCL);
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
function makeLoader(){const file=path.join(out,'foundation/ConfigLoader.js'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file)).concat(Module._nodeModulePaths(root));const actual=m.require.bind(m);m.require=n=>n==='../core/AtomicWrite'?require(path.join(clone,'core/AtomicWrite')):actual(n);m._compile(fs.readFileSync(path.join(clone,'foundation/ConfigLoader.js'),'utf8'),file);return m.exports;}
const loader=makeLoader();loader.load({loadDotenv:false,silent:true});
const loaderPath=path.join(clone,'foundation/ConfigLoader.js');require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
const original={...console},logs=[];for(const k of ['log','warn','error'])console[k]=(...args)=>logs.push({level:k,text:args.join(' ')});
let record;
try{
 const policy=require(path.join(clone,'core/PolicyBuilder')),ecm=require(path.join(clone,'core/ExitContractManager')).getInstance();
 const {subscribeTrace}=require(path.join(clone,'core/TraceSpine'));
 const {notificationForTrace}=require(path.join(clone,'core/NtfyTraceNotifier'));
 const traces=[];const unsubscribe=subscribeTrace(p=>traces.push(p));
 const bytes=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json')),bars=JSON.parse(bytes).candles;
 const engine=new(require(path.join(clone,'core/indicators/IndicatorEngine')))({...loader.get('indicators.engine'),symbol:'TSLA',tf:'15m'});
 const frames=bars.map(b=>engine.updateCandle(b));
 const contract=ecm.createExitContract('TimeSeriesMomentum',{}, {stopLossPercent:-10,tsmLookback:20,tsmEntryTrailingReturn:0.02,trailAtrMult:2,invalidationConditions:[]});
 function build(){return policy.buildForTrade({strategyName:'TimeSeriesMomentum',exitContract:contract,nowMs:bars[100].t,volatility:0.5,confidence:0.7,marketCondition:'normal',entryDirection:'long',mtfConfluenceSnapshot:null});}
 const oldPolicy=build(),oldBytes=JSON.stringify(oldPolicy);
 const oeFile=path.join(clone,'core/OrderExecutor.js'),oeModule=new Module(oeFile,module);oeModule.filename=oeFile;oeModule.paths=Module._nodeModulePaths(path.dirname(oeFile)).concat(Module._nodeModulePaths(root));
 const oeRequire=oeModule.require.bind(oeModule),inertImports={'./StateManager':{getInstance:()=>({})},'./AuthFailureGuard':{},'../ogz-meta/claudito-logger':{},'./UnifiedPatternMemory':{},'./PIDController':{},'./TradeNarrator':{}};
 oeModule.require=n=>Object.hasOwn(inertImports,n)?inertImports[n]:oeRequire(n);oeModule._compile(fs.readFileSync(oeFile,'utf8'),oeFile);
 function entryPlans(){const plans=[];for(const assetClass of ['crypto','stocks'])for(const action of ['BUY','SELL_SHORT']){
  const executor=new oeModule.exports({config:{brokerId:assetClass==='stocks'?'alpaca':'kraken',accountId:'fixture-account',accountIdSource:'fixture',assetClass,executionMode:'paper',timeframe:'15m'}});
  const plan=executor._buildEntryPlan({decision:{action,confidence:70},symbol:assetClass==='stocks'?'TSLA':'FIXTURE-PAIR',price:bars[100].c,positionSize:100,currentBalance:10000,currentEquity:10000,tradeConfidence:0.7,confidenceMultiplier:1,orchResult:{winnerStrategy:'TimeSeriesMomentum',exitContract:contract},entryVolatility:0.5,absoluteCapPercent:0.075});
  assert.ok(Object.isFrozen(plan.frozenExitPolicy));plans.push(plan);
 }return plans;}
 const entryPlansBefore=entryPlans();
 const fixture=(p,direction='long')=>({id:'fixture-'+direction,symbol:'TSLA',direction,entryPrice:bars[100].c,entryTime:bars[100].t,entryStrategy:'TimeSeriesMomentum',exitContract:contract,frozenExitPolicy:p,entryOrderQuantity:1,remainingOrderQuantity:1,tradeRevision:0,beScaleOutState:{status:'idle'},tierStates:p.profitManagement.tieredExit.tiers.map(()=>({status:'idle'}))});
 function observations(p){
  const rows=[];
  for(const direction of ['long','short'])for(let i=101;i<bars.length;i++){
   const trade=fixture(p,direction),price=bars[i].c,pnl=(direction==='long'?price-trade.entryPrice:trade.entryPrice-price)/trade.entryPrice*100;
   const context={currentTime:bars[i].t,intentId:'fixture-'+i,indicators:frames[i].indicators,priceHistory:bars.slice(0,i+1),symbol:'TSLA',traceId:'fixture-'+i};
   const trail=ecm._updateTrailingStopState(trade,price,pnl,context),trailStop=trade.currentStop??null;
   const beTrade=fixture(p,direction),be=ecm._updateBreakevenStopState(beTrade,price,pnl);
   const coordinatorTrade=fixture(p,direction),coordinator=ecm.checkExitConditions(coordinatorTrade,price,context);
   rows.push({direction,index:i,price,pnl,trail,trailStop,be,beStop:beTrade.currentStop??null,coordinator,coordinatorStop:coordinatorTrade.currentStop??null});
  }
  return rows;
 }
 const before=observations(oldPolicy),wire=[],saves=[];
 const wsFile=path.join(clone,'core/WebSocketManager.js'),wm=new Module(wsFile,module);wm.filename=wsFile;wm.paths=Module._nodeModulePaths(path.dirname(wsFile)).concat(Module._nodeModulePaths(root));
 const wr=wm.require.bind(wm),replacements={'../foundation/ConfigLoader':loader,'./StateManager':{getInstance:()=>({})},'./TradeNarrator':{getNarrator:()=>({})},'./BotStateFrame':{buildBotStateFrame:()=>({})}};wm.require=n=>Object.hasOwn(replacements,n)?replacements[n]:wr(n);wm._compile(fs.readFileSync(wsFile,'utf8'),wsFile);
 const receiver=new wm.exports({dashboardWs:{readyState:1,send:t=>wire.push(JSON.parse(t))}});
 function save(changes){const r=loader.getSettingsView().configuration;receiver.handleSettings({type:'save_settings',requestId:'exit-'+saves.length,expectedRevision:r.settings,expectedSettingsHash:r.settingsHash,changes});const response=wire.at(-1);saves.push({changes,response});return response;}
 const changes={'exitLogic.trail.enabled':true,'exitLogic.trail.minActivationPercent':0.1,'exitLogic.trail.atrMultiplier':4,'exitLogic.trail.trendWidenMultiplier':2,'exitLogic.trail.structureTightenMultiplier':0.2,'exitLogic.trail.structureDistanceThreshold':2,'exitLogic.trail.profitRatchetThreshold':1,'exitLogic.trail.profitRatchetRate':0.2,'exitLogic.trail.profitRatchetFloor':0.4,'exitLogic.trail.minTrailPercent':0.05,'exitLogic.trail.maxTrailPercent':2,'exitLogic.trail.feeBufferPercent':0.1,'exitLogic.breakEvenStop.enabled':true,'exitLogic.breakEvenStop.triggerPercent':0.2};
 const fieldEffects=[];
 const first=save(changes);
 if(phase==='baseline'){
  assert.equal(first.reason,'setting_not_hot_editable');
  // Reproduce a real config reload using the existing loader, not a mocked get.
  for(const [key,value]of Object.entries(changes)){const parts=key.split('.'),last=parts.pop();parts.reduce((o,k)=>o[k],settings)[last]=value;}
  settings.revision++;fs.writeFileSync(settingsPath,JSON.stringify(settings,null,2)+'\n');loader.load({force:true,loadDotenv:false,silent:true});
 }else assert.equal(first.applied,true);
 const newPolicy=build(),afterOld=observations(oldPolicy),afterNew=observations(newPolicy),entryPlansAfter=entryPlans();
 const oldChanged=before.filter((v,i)=>JSON.stringify(v)!==JSON.stringify(afterOld[i])).length;
 if(phase==='baseline'){assert.ok(oldChanged>0);assert.equal(oldPolicy.profitManagement.trail,undefined);}
 else{
  assert.equal(oldChanged,0);assert.notEqual(oldPolicy.policyHash,newPolicy.policyHash);assert.ok(Object.isFrozen(oldPolicy.profitManagement.trail));
  for(const plan of entryPlansBefore)assert.deepEqual(plan.frozenExitPolicy.profitManagement,oldPolicy.profitManagement);
  for(const plan of entryPlansAfter)assert.deepEqual(plan.frozenExitPolicy.profitManagement,newPolicy.profitManagement);
  const restored=require(path.join(clone,'core/dto/FrozenExitPolicy')).freezePolicy(JSON.parse(oldBytes));
  assert.equal(restored.policyHash,oldPolicy.policyHash);assert.deepEqual(observations(restored),before);
  assert.ok(afterNew.some((v,i)=>JSON.stringify(v)!==JSON.stringify(afterOld[i])));
  for(const [key,value]of Object.entries(changes)){const parts=key.split('.').slice(1);assert.equal(parts.reduce((o,k)=>o[k],newPolicy.profitManagement),value);}
  const accepted=loader.getSettingsView().configuration.fingerprint;
  for(const changes of [{'exitLogic.trail.minTrailPercent':3,'exitLogic.trail.maxTrailPercent':1},{'exitLogic.trail.feeBufferPercent':-1},{'exitLogic.trail.enabled':'false'},{'exitLogic.trail.atrMultiplier':0},{'exitLogic.trail.profitRatchetFloor':2}])assert.equal(save(changes).applied,false);
  assert.equal(loader.getSettingsView().configuration.fingerprint,accepted);
  assert.equal(save({'exitLogic.trail.enabled':false,'exitLogic.breakEvenStop.enabled':false,'exitLogic.trail.feeBufferPercent':0}).applied,true);
  const off=build();assert.equal(off.profitManagement.trail.enabled,false);assert.equal(off.profitManagement.trail.feeBufferPercent,0);
  assert.ok(observations(off).every(x=>!x.trail.updated&&!x.be.updated));
  assert.equal(makeLoader().load({loadDotenv:false,silent:true}).fingerprint,loader.getSettingsView().configuration.fingerprint);
  // One field at a time at actual managed-stop seams. These explicit numeric
  // boundary fixtures complement, and are not represented as, recorded trades.
  const base={...changes,'exitLogic.trail.atrMultiplier':1,'exitLogic.trail.trendWidenMultiplier':1.5,'exitLogic.trail.structureTightenMultiplier':0.5,'exitLogic.trail.structureDistanceThreshold':1,'exitLogic.trail.profitRatchetThreshold':3,'exitLogic.trail.profitRatchetRate':0.1,'exitLogic.trail.profitRatchetFloor':0.6,'exitLogic.trail.minTrailPercent':0.3,'exitLogic.trail.maxTrailPercent':3};
  const tweaks={'exitLogic.trail.enabled':false,'exitLogic.trail.minActivationPercent':20,'exitLogic.trail.atrMultiplier':1.3,'exitLogic.trail.trendWidenMultiplier':2,'exitLogic.trail.structureTightenMultiplier':0.2,'exitLogic.trail.structureDistanceThreshold':0,'exitLogic.trail.profitRatchetThreshold':12,'exitLogic.trail.profitRatchetRate':0,'exitLogic.trail.profitRatchetFloor':0.2,'exitLogic.trail.minTrailPercent':2,'exitLogic.trail.maxTrailPercent':0.3,'exitLogic.trail.feeBufferPercent':0,'exitLogic.breakEvenStop.enabled':false,'exitLogic.breakEvenStop.triggerPercent':20};
  function boundary(p,direction){const t=fixture(p,direction);t.entryPrice=100;t.exitContract={...contract,trailAtrMult:null};t.frozenExitPolicy=p;const price=direction==='long'?110:90;const context={indicators:{atr:2,rsi:direction==='long'?70:30,trend:direction==='long'?'up':'down'},nearestStructure:{price:price*1.005}};const trail=ecm._updateTrailingStopState(t,price,10,context);const b={...fixture(p,direction),entryPrice:100};const be=ecm._updateBreakevenStopState(b,price,10);return {trail,trailStop:t.currentStop??null,be,beStop:b.currentStop??null};}
  for(const [field,value]of Object.entries(tweaks)){
   assert.equal(save(base).applied,true);const originalPolicy=build();const beforeDirections=['long','short'].map(d=>boundary(originalPolicy,d));
   assert.equal(save({[field]:value}).applied,true);const updatedPolicy=build(),afterDirections=['long','short'].map(d=>boundary(updatedPolicy,d));
   assert.notDeepEqual(afterDirections,beforeDirections,field+' has no observed effect');
   assert.deepEqual(['long','short'].map(d=>boundary(originalPolicy,d)),beforeDirections,field+' mutated existing trade');
   fieldEffects.push({field,value,before:beforeDirections,after:afterDirections,oldPolicyHash:originalPolicy.policyHash,newPolicyHash:updatedPolicy.policyHash});
  }
  assert.equal(save({...base,'exitLogic.trail.profitRatchetFloor':0,'exitLogic.trail.profitRatchetRate':1,'exitLogic.trail.profitRatchetThreshold':0}).applied,true);
  const zeroFloorPolicy=build(),zeroFloor=['long','short'].map(d=>boundary(zeroFloorPolicy,d));
  for(const result of zeroFloor){assert.equal(result.trail.updated,true,'Zero ratchet floor must still honor the configured minimum trail distance');assert.equal(result.trail.trailDistance,0.003);}
  fieldEffects.push({field:'zero_floor_minimum_distance',after:zeroFloor,newPolicyHash:zeroFloorPolicy.policyHash});
 }
 assert.equal(JSON.stringify(oldPolicy),oldBytes);
 const legacy=JSON.parse(oldBytes);delete legacy.profitManagement.trail;
 const missingTrade=fixture(legacy),legacyResult=ecm.checkExitConditions(missingTrade,missingTrade.entryPrice*1.02,{currentTime:bars[101].t,intentId:'legacy',indicators:{atr:1},symbol:'TSLA',traceId:'legacy'});
 if(phase!=='baseline'){
  assert.equal(legacyResult.profitStopUpdate.trailing.reason,'missing_entry_trail_policy');
  assert.equal(legacyResult.profitStopUpdate.breakeven.reason,'missing_entry_fee_buffer');
  assert.equal(missingTrade.currentStop,undefined);assert.ok(traces.some(p=>notificationForTrace(p)?.priority==='max'));
  const knownStop={...fixture(legacy),currentStop:fixture(legacy).entryPrice*1.01,trailingActive:true};
  assert.equal(ecm.checkExitConditions(knownStop,knownStop.entryPrice*1.005,{currentTime:bars[101].t,intentId:'legacy-known'}).exitReason,'trailing_stop');
 }
 unsubscribe();
 record={at:new Date().toISOString(),phase,boundary:'Actual receiver, ConfigLoader, AtomicWrite, OrderExecutor entry-plan method, PolicyBuilder and ECM methods on recorded data with explicit fixture trades; inert order/state services, not running bot, fills, StateManager persistence or notification delivery',sources,input:{path:'tuning/tsla-15m-tiny.json',sha256:hash(bytes),bars:bars.length},isolatedSettings:settings,oldPolicy,newPolicy,entryPlansBefore,entryPlansAfter,before,afterOld,afterNew,oldChanged,oldPolicyBytesUnchanged:JSON.stringify(oldPolicy)===oldBytes,saves,fieldEffects,legacyResult,traces,notificationSelections:traces.map(notificationForTrace),configuration:loader.getSettingsView().configuration};
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,sources},null,2)+'\n',{flag:'wx'});throw error;}
finally{Object.assign(console,original);fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(logs,null,2)+'\n',{flag:'wx'});}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({receipt:path.relative(root,path.join(out,'receipt.json')),phase,oldChanged:record.oldChanged,rows:record.before.length,trailUpdates:record.before.filter(x=>x.trail.updated).length,beUpdates:record.before.filter(x=>x.be.updated).length,alarms:record.traces.length}));
