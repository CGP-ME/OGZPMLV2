"use strict";
const fs=require('fs'),path=require('path'),Module=require('module'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..'),phase=process.argv[2];
assert.ok(['baseline','candidate'].includes(phase));
const baseline=JSON.parse(fs.readFileSync(path.join(packet,'VERIFICATION.json'))).baseline;
const ref=phase==='baseline'?baseline+':':':';
const source=p=>cp.execFileSync('git',['show',ref+p],{cwd:root,encoding:'utf8',maxBuffer:10000000});
const out=fs.mkdtempSync(path.join(packet,'private/'+phase+'-'));
fs.mkdirSync(path.join(out,'config'));fs.mkdirSync(path.join(out,'foundation'));
const settings=JSON.parse(source('config/settings.json'));settings.filters.atrEnabled=false;
// Fixture threshold allows HOLD/TPO-bypass and entry routing to be exercised.
settings.launchProfiles.paper.confidence.minTradeConfidence=0;
if(process.argv.includes('--missing-key'))delete settings.positionSizing.confluenceMultipliers['1'];
if(process.argv.includes('--null-map'))settings.positionSizing.confluenceMultipliers=null;
fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(settings));fs.writeFileSync(path.join(out,'config/internals.json'),source('config/internals.json'));
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
const hashes={},originalExtension=Module._extensions['.js'];
Module._extensions['.js']=(m,f)=>{if(f.startsWith(root+'/')&&!f.includes('/node_modules/')&&!f.includes('/ogz-meta/inbox/')){const rel=path.relative(root,f);const text=source(rel);hashes[rel]=crypto.createHash('sha256').update(text).digest('hex');m._compile(text,f);}else originalExtension(m,f);};
const loaderPath=path.join(root,'foundation/ConfigLoader.js');
function makeLoader(){const target=path.join(out,'foundation/ConfigLoader.js'),m=new Module(target,module);m.filename=target;m.paths=Module._nodeModulePaths(root);const actual=m.require.bind(m);m.require=n=>n==='../core/AtomicWrite'?require(path.join(root,'core/AtomicWrite')):actual(n);m._compile(source('foundation/ConfigLoader.js'),target);return m.exports;}
const loader=makeLoader();loader.load({loadDotenv:false,silent:true});require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
const logs=[],original={...console};for(const k of ['log','warn','error'])console[k]=(...a)=>logs.push({level:k,text:a.join(' ')});
(async()=>{try{
 const {StrategyOrchestrator}=require(path.join(root,'core/StrategyOrchestrator'));
 function compile(rel,replacements){const target=path.join(root,rel),m=new Module(target,module);m.filename=target;m.paths=Module._nodeModulePaths(path.dirname(target));const actual=m.require.bind(m);m.require=n=>Object.hasOwn(replacements,n)?replacements[n]:actual(n);m._compile(source(rel),target);return m.exports;}
 const OE=compile('core/OrderExecutor.js',{'./StateManager':{getInstance:()=>({})},'./AuthFailureGuard':{},'../ogz-meta/claudito-logger':{},'./UnifiedPatternMemory':{},'./PIDController':{},'./TradeNarrator':{}});
 const executor=Object.create(OE.prototype);executor._runtimeScope=()=>({brokerId:'kraken',accountId:'fixture',accountIdSource:'fixture',assetClass:'crypto',executionMode:'paper',timeframe:'15m'});
 const plans=[];
 function plan(result){const value=executor._buildEntryPlan({decision:{action:'BUY',confidence:90},symbol:'BTC-USD',price:100,positionSize:100,currentBalance:10000,currentEquity:10000,tradeConfidence:.9,confidenceMultiplier:1,orchResult:result,entryVolatility:1,absoluteCapPercent:.5});assert.equal(value.requestedSizeUsd,100*result.sizingMultiplier);assert.equal(value.sizeUsd,value.requestedSizeUsd);assert.equal(value.orderQuantity,value.sizeUsd/100);plans.push(value);return value;}
 const WS=compile('core/WebSocketManager.js',{'../foundation/ConfigLoader':loader,'./StateManager':{getInstance:()=>({})},'./TradeNarrator':{getNarrator:()=>({})},'./BotStateFrame':{buildBotStateFrame:()=>({})}});
 const wire=[],receiver=new WS({dashboardWs:{readyState:1,send:t=>wire.push(JSON.parse(t))}});
 const orch=new StrategyOrchestrator({minConfluenceCount:1,minStrategyConfidence:0,mtfBaseTimeframe:'15m',...(process.argv.includes('--producer-paths')?{confluenceSizing:{1:99}}:{})});
 function run(count){orch.strategies=Array.from({length:count},()=>({name:'EMASMACrossover',evaluate:()=>({direction:'buy',confidence:0.9,reason:'synthetic agreeing signal',signalData:{crossovers:[{pair:'ema50_200',type:'golden'}]}})}));return orch.evaluate({atr:1,volatility:1,rsi:20,trend:'bullish'},[],{currentRegime:'ranging',confidence:.5,positionMultiplier:1},[{symbol:'TSLA',timeframe:'15m',o:99,h:101,l:98,c:100,t:1}],{symbol:'TSLA',timeframe:'15m',price:100});}
 const before=[1,2,3,4,5].map(run),oldBytes=JSON.stringify(before);

 const prefix='positionSizing.confluenceMultipliers.',saves=[];
 function save(changes){const c=loader.getSettingsView().configuration;receiver.handleSettings({type:'save_settings',requestId:'fixture-'+saves.length,expectedRevision:c.settings,expectedSettingsHash:c.settingsHash,changes});const result=wire.at(-1);saves.push(result);return result;}
 if(process.argv.includes('--fanout')){
  assert.equal(phase,'candidate');
  await require('./loop.cjs')({root,compile,orch,plan,entry:run(1)});
  const NoWick=require(path.join(root,'modules/NoWickImbalance'));
  const strategy=new NoWick({...loader.get('strategies.NoWickImbalance'),swingLookback:5,entryMode:'tap',twinSplitEnabled:true,stopLookbackBars:5});
  strategy._detectTrend=()=> 'uptrend';
  strategy.scopedState.set('TSLA:15M',{candleCount:4,pendingLevels:[100,100.1].map(level=>({type:'bullish',level,formationCount:3,trend:'uptrend',timestamp:'2026-09-29T00:00:00Z',twinGroupId:'fixture-twins'})),invalidatedLevels:[]});
  const candles=Array.from({length:20},(_,i)=>({symbol:'TSLA',timeframe:'15m',o:100.2,h:100.5,l:99.2,c:100,v:1000,t:1700000000000+i*900000}));
  const signal=strategy.evaluate({priceHistory:candles,indicators:{atr:1},extras:{symbol:'TSLA',timeframe:'15m'}});
  assert.deepEqual(signal.entryFanout.map(x=>x.sizingMultiplier),[.5,.5]);
  assert.equal(save({[prefix+1]:1.4}).applied,true);
  orch.strategies=[{name:'NoWickImbalance',evaluate:()=>signal}];
  const result=orch.evaluate({atr:1,volatility:1,rsi:20,trend:'bullish'},[],{currentRegime:'ranging',confidence:.5,positionMultiplier:1},candles,{symbol:'TSLA',timeframe:'15m',price:100});
  assert.deepEqual(result.entryFanout.map(x=>x.sizingMultiplier),[.7,.7]);
  await require('./loop.cjs')({root,compile,orch,plan,entry:result});
  fs.writeFileSync(path.join(out,'fanout.json'),JSON.stringify({passed:true,signal,result,plans,boundary:'Actual NoWick fanout producer with seeded pending levels and synthetic trend; actual orchestrator, loop ledger and order plan; stub execution'},null,2));
  original.log(JSON.stringify({receipt:path.relative(root,path.join(out,'fanout.json')),passed:true}));return;
 }
 if(process.argv.includes('--missing-key')||process.argv.includes('--null-map')){
  if(phase==='baseline'){assert.equal(before[0].sizingMultiplier,2.5);plan(before[0]);}
  else {
   assert.equal(before[0].direction,'hold');assert.equal(before[0].sizingMultiplier,null);
   const missing=process.argv.includes('--null-map')?[1,2,3,4]:[1];
   assert.deepEqual(loader.getSettingsView().unavailableInputs,missing.map(n=>({path:prefix+n,reason:'missing_setting'})));
   const traces=[];const unsubscribe=require(path.join(root,'core/TraceSpine')).subscribeTrace(p=>traces.push(p));
   let evaluated=0;orch.strategies=[{name:'EMASMACrossover',evaluate:()=>{evaluated++;}}];
   orch.evaluate({atr:1},[],{currentRegime:'ranging',confidence:.5,positionMultiplier:1},[{symbol:'TSLA',timeframe:'15m',o:99,h:101,l:98,c:100,t:1}],{symbol:'TSLA',timeframe:'15m',price:100});unsubscribe();
   assert.equal(evaluated,0);
   const alarm=traces.find(t=>t.event==='STRATEGY_UNAVAILABLE');assert.ok(alarm);
   assert.equal(require(path.join(root,'core/NtfyTraceNotifier')).notificationForTrace(alarm).priority,'max');
   await require('./loop.cjs')({root,compile,orch,plan});
   assert.equal(save({[prefix+2]:2}).applied,false);
   assert.equal(save(Object.fromEntries(missing.map(n=>[prefix+n,n+.25]))).applied,true);
   assert.deepEqual(loader.getSettingsView().unavailableInputs,[]);
   assert.equal(plan(run(1)).sizingMultiplier,1.25);
  }
  fs.writeFileSync(path.join(out,'missing-key.json'),JSON.stringify({phase,passed:true,before:before[0],saves,plans},null,2));original.log(JSON.stringify({receipt:path.relative(root,path.join(out,'missing-key.json')),passed:true}));return;
 }
 if(process.argv.includes('--producer-paths')){
  assert.equal(phase,'candidate');assert.deepEqual(before.map(r=>r.sizingMultiplier),[1,1.5,2,2.5,2.5]);
  const map=loader.get('positionSizing.confluenceMultipliers');assert.ok(Object.isFrozen(map));
  assert.throws(()=>{delete map['1'];},TypeError);
  const attempts=[{positionSizing:{}},{'positionSizing.confluenceMultipliers':{}},{[prefix+1]:null},{[prefix+1]:undefined},{[prefix+1]:{}},{[prefix+5]:1}];
  for(const input of attempts){const result=save(input);assert.equal(result.applied,false);assert.deepEqual(loader.get('positionSizing.confluenceMultipliers'),map);}
  for(const n of [1,2,3,4]){assert.equal(save({[prefix+n]:n+.75}).applied,true);const disk=JSON.parse(fs.readFileSync(path.join(out,'config/settings.json')));assert.deepEqual(Object.keys(disk.positionSizing.confluenceMultipliers),['1','2','3','4']);assert.deepEqual(disk.positionSizing.confluenceMultipliers,loader.get('positionSizing.confluenceMultipliers'));assert.deepEqual(disk.positionSizing.confluenceMultipliers,loader.get('sizing.confluenceMultipliers'));}
  const corrupted=JSON.parse(fs.readFileSync(path.join(out,'config/settings.json')));delete corrupted.positionSizing.confluenceMultipliers['1'];fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(corrupted));
  assert.equal(save({[prefix+2]:7}).reason,'settings_changed_outside_loaded_owner');assert.equal(run(1).sizingMultiplier,1.75);
  const proof={boundary:'Actual live settings receiver/owner and constructor; corrupted on-disk edit after boot is not published',constructorPartialMapCannotOverride:true,immutableSnapshot:true,rejectedReplacementDeletionRequests:attempts.length,leafSavesPreserveAllFourKeys:4,aliasAndDiskMatch:true,outOfBandDiskEditNotPublished:true,saves};
  fs.writeFileSync(path.join(out,'producer-paths.json'),JSON.stringify(proof,null,2));original.log(JSON.stringify({receipt:path.relative(root,path.join(out,'producer-paths.json')),passed:true}));return;
 }
 const changes=Object.fromEntries([1,2,3,4].map(n=>[prefix+n,n+.25]));
 const first=save(changes);
 if(phase==='baseline'){assert.equal(first.applied,false);assert.equal(first.reason,'setting_not_hot_editable');Object.assign(settings.positionSizing.confluenceMultipliers,{'1':1.25,'2':2.25,'3':3.25,'4':4.25});settings.revision++;fs.writeFileSync(path.join(out,'config/settings.json'),JSON.stringify(settings));loader.load({force:true,loadDotenv:false,silent:true});assert.equal(run(2).sizingMultiplier,before[1].sizingMultiplier);}
 else {assert.equal(first.applied,true,JSON.stringify(first));for(const n of [1,2,3,4,5])assert.equal(plan(run(n)).sizingMultiplier,(Math.min(n,4)+.25));assert.deepEqual(loader.get('sizing.confluenceMultipliers'),loader.get('positionSizing.confluenceMultipliers'));for(const n of [1,2,3,4]){assert.equal(save({[prefix+n]:n+.5}).applied,true);assert.equal(plan(run(n)).sizingMultiplier,(n+.5));}const fingerprint=loader.getSettingsView().configuration.fingerprint;for(const invalid of [0,-1,'2',Infinity])assert.equal(save({[prefix+1]:invalid}).applied,false);assert.equal(loader.getSettingsView().configuration.fingerprint,fingerprint);assert.equal(makeLoader().load({loadDotenv:false,silent:true}).fingerprint,fingerprint);}
 assert.equal(JSON.stringify(before),oldBytes);
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({phase,sourceRef:ref,hashes,plans,before,after:[1,2,3,4,5].map(run),saves,boundary:'Actual WebSocket settings receiver, ConfigLoader save/reload, retained full orchestrator evaluation, PolicyBuilder and OrderExecutor entry-plan quantity calculation; synthetic agreeing signals and broker scope, no broker or bot'},null,2));
 original.log(JSON.stringify({phase,receipt:path.relative(root,path.join(out,'receipt.json')),passed:true}));
}finally{Object.assign(console,original);fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(logs));}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
