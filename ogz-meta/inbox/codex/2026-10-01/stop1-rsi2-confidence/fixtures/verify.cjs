'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict');
const {createSource,root,packet,hash}=require('./source.cjs');
const source=createSource(),js=Module._extensions['.js'],json=Module._extensions['.json'];
const safeExternal=rel=>rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||rel.startsWith('node_modules/');
Module._extensions['.js']=(m,file)=>{const rel=path.relative(root,file);if(source.tracked.has(rel)){const text=source.source(rel);source.loaded[rel]=hash(text);m._compile(text,file);}else{assert.ok(safeExternal(rel),`untracked repo JS: ${rel}`);js(m,file);}};
Module._extensions['.json']=(m,file)=>{const rel=path.relative(root,file);if(source.tracked.has(rel)){const text=source.source(rel);source.loaded[rel]=hash(text);m.exports=JSON.parse(text);}else{assert.ok(safeExternal(rel),`untracked repo JSON: ${rel}`);json(m,file);}};
const originalConsole={...console},logs=[];for(const key of ['log','warn','error'])console[key]=(...a)=>logs.push({level:key,text:a.join(' ')});
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
const plain=x=>JSON.parse(JSON.stringify(x)),keys=['confidenceBase','confidenceDepthMultiplier','maxConfidence'];
const globalNames=['settingsConfigFile','internalsConfigFile','activeEnv','activeEnvSources','activeLaunchProfileContext','activeCredentialEnv','activeCredentialSources','activeProcessRole','activeRunDescriptor','_cached','_cachedRole'];
fs.mkdirSync(path.join(packet,'private'),{recursive:true});
const selection=source.manifest().selection,resultFile=path.join(packet,selection.tree?`private/verification-review-${selection.tree}.json`:'verification.json'),logFile=path.join(packet,selection.tree?`private/verification-review-${selection.tree}.log`:'private/verification.log');
function makeLoader(label,settingsSource=source.source('config/settings.json'),selected=source){
 const dir=fs.mkdtempSync(path.join(packet,'private/'+label+'-'));for(const name of ['foundation','config'])fs.mkdirSync(path.join(dir,name));
 fs.writeFileSync(path.join(dir,'config/settings.json'),settingsSource);fs.writeFileSync(path.join(dir,'config/internals.json'),source.source('config/internals.json'));
 const filename=path.join(dir,'foundation/ConfigLoader.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(root);
 const req=m.require.bind(m);m.require=id=>id==='../core/AtomicWrite'?require(path.join(root,'core/AtomicWrite')):req(id);
 m._compile(selected.source('foundation/ConfigLoader.js')+'\nmodule.exports.probeGlobals=()=>({'+globalNames.join(',')+'});',filename);
 const loader=m.exports;loader.load({loadDotenv:false,silent:true});return{loader,dir};
}
try{
 const {loader,dir}=makeLoader('owner'),loaderPath=path.join(root,'foundation/ConfigLoader.js');require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
 const {StrategyOrchestrator}=require(path.join(root,'core/StrategyOrchestrator')),RSI2=require(path.join(root,'modules/RSI2MeanReversion'));
 const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'}),strategy=orch.strategies.find(s=>s.name==='RSI2MeanReversion');assert.ok(strategy,'actual registration enabled');
 const tape=source.source('data/kraken-btc-15m-recent.json'),candles=JSON.parse(tape),originalConfig=loader.get('strategies.RSI2MeanReversion'),pinned=new RSI2(originalConfig),control=new RSI2(originalConfig);
 let fallback;
 const resolve=orch._getSymbolStrategyModule;orch._getSymbolStrategyModule=function(name,symbol,defaultModule,factory){if(name==='RSI2MeanReversion')fallback=defaultModule;return resolve.call(this,name,symbol,defaultModule,factory);};
 const evaluate=(i,symbol)=>strategy.evaluate({priceHistory:candles.slice(0,i+1),extras:{symbol}});
 let baselineSignals=0;
 for(let i=0;i<350;i++){
  const ctx={priceHistory:candles.slice(0,i+1)},a=control.evaluate(ctx),b=evaluate(i,undefined),d=evaluate(i,'BTC-USD');assert.deepEqual(plain(b),plain(a));assert.deepEqual(plain(d),plain(a));if(a)baselineSignals++;
 }
 const scoped=orch.symbolStrategyModules.get('RSI2MeanReversion').get('BTC-USD');assert.ok(fallback&&scoped);assert.notEqual(fallback,scoped);
 const identities=[fallback,scoped],saves=[];
 const save=changes=>{const view=loader.getSettingsView(),result=loader.saveSettings({requestId:'rsi2-'+saves.length,expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes});saves.push({changes,result:Object.fromEntries(Object.entries(result).filter(([key])=>key!=='fields'))});return result;};
 const basePaths=Object.fromEntries(keys.map(k=>['strategies.RSI2MeanReversion.'+k,originalConfig[k]]));
 for(const key of keys){const field=loader.getSettingsView().fields['strategies.RSI2MeanReversion.'+key];assert.ok(field);assert.equal(field.value,originalConfig[key]);assert.equal(field.editable,true);}
 const effects=[];
 for(const[field,value]of [['confidenceBase',0.7],['confidenceDepthMultiplier',0],['maxConfidence',0.6]]){
  assert.equal(save({['strategies.RSI2MeanReversion.'+field]:value}).applied,true);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'config/settings.json'))).strategies.RSI2MeanReversion[field],value);
  let changed=0,signals=0;
  for(let i=350;i<candles.length;i++){
   const ctx={priceHistory:candles.slice(0,i+1)},a=control.evaluate(ctx),p=pinned.evaluate(ctx),b=evaluate(i,undefined),d=evaluate(i,'BTC-USD');assert.deepEqual(plain(p),plain(a));assert.deepEqual(plain(b),plain(d));
   assert.equal(fallback,identities[0]);assert.equal(orch.symbolStrategyModules.get('RSI2MeanReversion').get('BTC-USD'),identities[1]);
   assert.equal(fallback.configurationInput,loader.get('strategies.RSI2MeanReversion'));assert.equal(scoped.configurationInput,fallback.configurationInput);assert.equal(fallback.cfg[field],value);
   assert.equal(fallback.minHistory,control.minHistory);assert.equal(scoped.minHistory,control.minHistory);
   if(!a){assert.equal(b,null);continue;}signals++;
   const cfg={...originalConfig,[field]:value},expected=Math.min(cfg.maxConfidence,cfg.confidenceBase+Math.max(0,Math.min(1,(a.direction==='buy' ? (originalConfig.rsiEntry-a.signalData.rsi)/originalConfig.rsiEntry : (a.signalData.rsi-originalConfig.rsiEntryOB)/(100-originalConfig.rsiEntryOB))))*cfg.confidenceDepthMultiplier);
   assert.equal(b.confidence,expected);assert.deepEqual(plain({...b,confidence:a.confidence}),plain(a));if(b.confidence!==a.confidence)changed++;
  }
  assert.ok(changed>0,field);effects.push({field,value,signals,changed,exitHintsUnchanged:true,retainedRegisteredOwners:2});assert.equal(save(basePaths).applied,true);
 }
 const invalid=[];
 for(const[field,values]of [['confidenceBase',[-1,1.1,NaN,Infinity,'0.4',null]],['maxConfidence',[-1,1.1,NaN,Infinity,'0.85',null]],['confidenceDepthMultiplier',[-1,1.1,NaN,Infinity,'0.4',null]]])for(const value of values){
  const bytes=fs.readFileSync(path.join(dir,'config/settings.json')),receipt=loader.getSettingsView().configuration,result=save({['strategies.RSI2MeanReversion.'+field]:value});assert.equal(result.applied,false);assert.deepEqual(fs.readFileSync(path.join(dir,'config/settings.json')),bytes);assert.deepEqual(loader.getSettingsView().configuration,receipt);invalid.push({field,value:String(value),reason:result.reason});
 }
 const relationReceipt=loader.getSettingsView().configuration,relationBytes=fs.readFileSync(path.join(dir,'config/settings.json'));
 const relation=save({'strategies.RSI2MeanReversion.confidenceBase':0.9,'strategies.RSI2MeanReversion.maxConfidence':0.8});assert.equal(relation.reason,'rsi2_max_confidence_below_base');assert.deepEqual(loader.getSettingsView().configuration,relationReceipt);assert.deepEqual(fs.readFileSync(path.join(dir,'config/settings.json')),relationBytes);
 const singleRelations=[];
 for(const change of [{'strategies.RSI2MeanReversion.confidenceBase':0.95},{'strategies.RSI2MeanReversion.maxConfidence':0.1}]){
  const before=fs.readFileSync(path.join(dir,'config/settings.json')),configuration=loader.getSettingsView().configuration,result=save(change);assert.equal(result.reason,'rsi2_max_confidence_below_base');assert.deepEqual(fs.readFileSync(path.join(dir,'config/settings.json')),before);assert.deepEqual(loader.getSettingsView().configuration,configuration);singleRelations.push(change);
 }
 assert.equal(save({'strategies.RSI2MeanReversion.confidenceBase':0,'strategies.RSI2MeanReversion.maxConfidence':0}).applied,true);
 let zeroSignals=0;for(let i=350;i<candles.length;i++){const a=evaluate(i,undefined),b=evaluate(i,'BTC-USD');if(a){assert.equal(a.confidence,0);assert.equal(b.confidence,0);zeroSignals++;}}assert.ok(zeroSignals>0);assert.equal(save(basePaths).applied,true);
 for(const value of [0,Number.MIN_VALUE,1]){assert.equal(save({'strategies.RSI2MeanReversion.confidenceDepthMultiplier':value}).applied,true);const signal=evaluate(500,undefined);assert.equal(fallback.cfg.confidenceDepthMultiplier,value);if(signal)assert.ok(Number.isFinite(signal.confidence));}assert.equal(save(basePaths).applied,true);
 const accepted=fs.readFileSync(path.join(dir,'config/settings.json')),internals=fs.readFileSync(path.join(dir,'config/internals.json')),priorGlobals=loader.probeGlobals(),priorReceipt=loader.getSettingsView().configuration;
 const forced=[];
 for(const[field,values]of [['confidenceBase',[-1,1.1,'NaN',{toString:null},undefined]],['maxConfidence',[-1,1.1,'NaN',{toString:null},undefined]],['confidenceDepthMultiplier',[-1,1.1,'NaN',{toString:null},undefined]]])for(const value of values){
  const cfg=JSON.parse(accepted),it=JSON.parse(internals);it.revision++;if(value===undefined)delete cfg.strategies.RSI2MeanReversion[field];else cfg.strategies.RSI2MeanReversion[field]=value;
  fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(cfg));fs.writeFileSync(path.join(dir,'config/internals.json'),JSON.stringify(it));
  const start=logs.length,result=loader.load({force:true,loadDotenv:false,silent:true});assert.equal(result.applied,false);assert.equal(result.reason,'invalid_rsi2_confidence');assert.equal(result.path,'strategies.RSI2MeanReversion.'+field);
  const globals=loader.probeGlobals();for(const name of globalNames)assert.equal(globals[name],priorGlobals[name],name);assert.deepEqual(loader.getSettingsView().configuration,priorReceipt);assert.ok(logs.slice(start).some(x=>x.level==='error'&&x.text.includes(result.reason)));forced.push({field,value:value&&typeof value==='object'?JSON.stringify(value):String(value),reason:result.reason});
 }
 const missingBlocks=[];
 for(const value of [undefined,null,[]]){
  const configured=JSON.parse(accepted);if(value===undefined)delete configured.strategies.RSI2MeanReversion;else configured.strategies.RSI2MeanReversion=value;
  fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(configured));const result=loader.load({force:true,loadDotenv:false,silent:true});assert.equal(result.applied,false);assert.equal(result.reason,'invalid_rsi2_confidence');assert.equal(result.path,'strategies.RSI2MeanReversion.confidenceBase');for(const name of globalNames)assert.equal(loader.probeGlobals()[name],priorGlobals[name]);missingBlocks.push(value===undefined?'missing':value);
 }
 const inverted=JSON.parse(accepted);inverted.strategies.RSI2MeanReversion.maxConfidence=0.1;fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(inverted));assert.equal(loader.load({force:true,loadDotenv:false,silent:true}).reason,'rsi2_max_confidence_below_base');
 for(const name of globalNames)assert.equal(loader.probeGlobals()[name],priorGlobals[name]);
 for(let i=350;i<400;i++){const expected=control.evaluate({priceHistory:candles.slice(0,i+1)});assert.deepEqual(plain(evaluate(i,undefined)),plain(expected));assert.deepEqual(plain(evaluate(i,'BTC-USD')),plain(expected));}
 const mismatch=loader.load({force:true,role:'dashboard',loadDotenv:false,silent:true});assert.equal(mismatch.reason,'forced_reload_role_change_rejected');for(const name of globalNames)assert.equal(loader.probeGlobals()[name],priorGlobals[name]);
 assert.equal(save({'strategies.RSI2MeanReversion.confidenceBase':0.6}).reason,'settings_changed_outside_loaded_owner');
 const valid=JSON.parse(accepted);valid.revision++;valid.strategies.RSI2MeanReversion.confidenceBase='0.7';valid.strategies.RSI2MeanReversion.confidenceDepthMultiplier='0.4';valid.strategies.RSI2MeanReversion.maxConfidence='0.85';
 fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(valid));fs.writeFileSync(path.join(dir,'config/internals.json'),internals);const published=loader.load({force:true,loadDotenv:false,silent:true});assert.equal(published.config.strategies.RSI2MeanReversion.confidenceBase,'0.7');
 let forceChanged=0;for(let i=400;i<candles.length;i++){const a=control.evaluate({priceHistory:candles.slice(0,i+1)}),b=evaluate(i,undefined),d=evaluate(i,'BTC-USD');assert.deepEqual(plain(b),plain(d));assert.equal(fallback.cfg.confidenceBase,0.7);assert.equal(scoped.cfg.confidenceDepthMultiplier,0.4);if(a){assert.deepEqual(plain({...b,confidence:a.confidence}),plain(a));assert.equal(b.confidence,Math.min(0.85,0.7+Math.max(0,Math.min(1,(a.direction==='buy' ? (originalConfig.rsiEntry-a.signalData.rsi)/originalConfig.rsiEntry : (a.signalData.rsi-originalConfig.rsiEntryOB)/(100-originalConfig.rsiEntryOB))))*0.4));if(a.confidence!==b.confidence)forceChanged++;}}assert.ok(forceChanged>0);
 assert.equal(save({'strategies.RSI2MeanReversion.confidenceDepthMultiplier':0.5}).applied,true);evaluate(500,undefined);assert.equal(fallback.cfg.confidenceBase,0.7);assert.equal(fallback.cfg.confidenceDepthMultiplier,0.5);
 const forceCompatibility=[];
 for(const[field,value]of [['confidenceBase',null],['confidenceBase',false],['confidenceBase',[]],['confidenceBase','0.5'],['maxConfidence',true],['maxConfidence','1'],['confidenceDepthMultiplier',true],['confidenceDepthMultiplier','0.4'],['confidenceDepthMultiplier',Number.MIN_VALUE],['confidenceDepthMultiplier',0]]){
  const configured=JSON.parse(accepted);configured.strategies.RSI2MeanReversion[field]=value;
  const directlyInjected=new RSI2(configured.strategies.RSI2MeanReversion);
  fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(configured));const forcedConfig=loader.load({force:true,loadDotenv:false,silent:true});assert.ok(forcedConfig.config);
  const i=500,ctx={priceHistory:candles.slice(0,i+1)},expected=directlyInjected.evaluate(ctx),a=evaluate(i,undefined),b=evaluate(i,'BTC-USD');assert.deepEqual(plain(a),plain(expected));assert.deepEqual(plain(b),plain(expected));assert.equal(fallback.cfg[field],Number(value));forceCompatibility.push({field,value,normalized:Number(value)});
 }
 // A separate actual loader startup preserves numeric-string constructor semantics.
 const stringSettings=JSON.parse(source.source('config/settings.json'));for(const key of keys)stringSettings.strategies.RSI2MeanReversion[key]=String(stringSettings.strategies.RSI2MeanReversion[key]);const stringOwner=makeLoader('strings',JSON.stringify(stringSettings));
 const stringConfig=stringOwner.loader.get('strategies.RSI2MeanReversion'),stringDetector=new RSI2(stringConfig);let stringSignals=0;
 for(let i=0;i<candles.length;i++){const ctx={priceHistory:candles.slice(0,i+1)},a=stringDetector.evaluate(ctx,stringOwner.loader.get('strategies.RSI2MeanReversion')),b=control.evaluate(ctx);assert.deepEqual(plain(a),plain(b));if(a)stringSignals++;}assert.ok(stringSignals>0);
 const startupCompatibility=[];
 const dependency=selection.tree?null:createSource({includeOwn:false});
 for(const value of [-1,1.1,'NaN',undefined]){
  const configured=JSON.parse(source.source('config/settings.json'));if(value===undefined)delete configured.strategies.RSI2MeanReversion.confidenceBase;else configured.strategies.RSI2MeanReversion.confidenceBase=value;
  const outcomes=[];
  for(const selected of [source,...(dependency?[dependency]:[])]){
   const owner=makeLoader('startup-invalid',JSON.stringify(configured),selected);let failure;
   try{new RSI2(owner.loader.get('strategies.RSI2MeanReversion'));}catch(error){failure=error.message;}
   assert.ok(failure,'existing constructor rejects invalid startup');outcomes.push(failure);
  }
  if(dependency)assert.equal(outcomes[0],outcomes[1]);startupCompatibility.push({value:String(value),outcomes});
 }
 const receipt={result:'PASS',startupCompatibility,...source.manifest(),tapeSha256:hash(tape),candles:candles.length,baselineSignals,effects,invalid,relationRejected:true,singleRelations,zeroSignals,forced,missingBlocks,forceCompatibility,forceRelationRejected:true,loaderGlobalsPreserved:globalNames.length,roleMismatchRejected:true,invalidExternalDiskSaveRejected:true,forceChanged,stringSignals,saveCount:saves.length,saves,limits:['Actual StrategyOrchestrator registration/fallback/lazy factory and current ConfigLoader evaluate producer executed; no full TradingLoop/order/broker/dashboard relay.','Tracked production dependencies come only from immutable selection plus locked patches; installed external libraries are fixture dependencies.','No constructor/configure or strategy math changed; production delta is ConfigLoader only.']};
 fs.writeFileSync(resultFile,JSON.stringify(receipt,null,2)+'\n');originalConsole.log(JSON.stringify({result:receipt.result,selection:receipt.selection,resultFile,logFile,effects,invalid:invalid.length,forced:forced.length,forceChanged,zeroSignals,stringSignals,saveCount:saves.length}));
}catch(error){fs.writeFileSync(resultFile,JSON.stringify({result:'FAIL',...source.manifest(),error:error.stack},null,2)+'\n');originalConsole.error(error);process.exitCode=1;}finally{Object.assign(console,originalConsole);Module._extensions['.js']=js;Module._extensions['.json']=json;fs.writeFileSync(logFile,logs.map(x=>JSON.stringify(x)).join('\n'));}
