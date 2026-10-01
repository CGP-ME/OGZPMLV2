'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const parser=require('@babel/parser'),diff=require('diff');
const root=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),packet=__dirname,baseline='6bcfad8a';
const reviewTree=process.env.MA_REVIEW_TREE;
if(reviewTree!==undefined){
 assert.match(reviewTree,/^[0-9a-f]{40}$/i,'MA_REVIEW_TREE must name an exact 40-hex tree');
 assert.equal(cp.execFileSync('git',['cat-file','-t',reviewTree],{cwd:root,encoding:'utf8'}).trim(),'tree','MA_REVIEW_TREE must identify a tree object');
}
const selectedRef=reviewTree||baseline;
const selectedTree=cp.execFileSync('git',['rev-parse',`${selectedRef}^{tree}`],{cwd:root,encoding:'utf8'}).trim();
const sourceSelection=reviewTree?{mode:'immutable_review_tree',tree:selectedTree,patchesApplied:false}:{mode:'pinned_baseline_plus_patches',baseline,baseTree:selectedTree,patchesApplied:true};
const resultPath=path.join(packet,reviewTree?`private/integration-cap-review-${selectedTree}.json`:'integration-cap-result.json');
const logPath=path.join(packet,reviewTree?`private/integration-cap-review-${selectedTree}.log`:'private/integration-cap.log');
const head=p=>cp.execFileSync('git',['show',`${selectedRef}:${p}`],{cwd:root,encoding:'utf8',maxBuffer:20e6});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const sourceCache=new Map(),modified=new Map();
const patchNames=reviewTree?[]:['module.patch','producers.patch','../ema-crossover-confidence/fixtures/loader-final-head.patch','../ema-crossover-confidence/fixtures/role-ownership.patch','loader-dependent.patch','cap-boundary.patch'];
const patchManifest={};
for(const patchName of patchNames){const patchSource=fs.readFileSync(path.join(packet,patchName),'utf8');patchManifest[patchName]=hash(patchSource);for(const patch of diff.parsePatch(patchSource)){
 const file=patch.oldFileName.replace(/^a\//,''); const source=diff.applyPatch(modified.get(file)||head(file),patch);assert.ok(source,`clean baseline patch application: ${file}`);modified.set(file,source);
}}
const files=cp.execFileSync('git',['ls-tree','-r','--name-only',selectedRef],{encoding:'utf8'}).trim().split('\n');
const tracked=new Set(files),loaded=new Map();
const getSource=file=>{if(!sourceCache.has(file))sourceCache.set(file,head(file));return modified.get(file)||sourceCache.get(file);};
const relevantSources=['modules/MADynamicSR.js','foundation/ConfigLoader.js','run-empire-v2.js','core/SymbolTradingContext.js','core/StrategyOrchestrator.js','modules/EMASMACrossoverSignal.js','core/CandleHelper.js','config/settings.json','config/internals.json'];
const selectedSourceHashes=Object.fromEntries(relevantSources.map(file=>[file,hash(getSource(file))]));
const originalJs=Module._extensions['.js'],originalJson=Module._extensions['.json'];
Module._extensions['.js']=(m,file)=>{const rel=path.relative(root,file);if(tracked.has(rel)){const source=getSource(rel);loaded.set(rel,hash(source));m._compile(source,file);}else {assert.ok(rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||rel.startsWith('node_modules/'),`untracked repository dependency outside selected tree: ${rel}`);originalJs(m,file);}};
Module._extensions['.json']=(m,file)=>{const rel=path.relative(root,file);if(tracked.has(rel)){const source=head(rel);loaded.set(rel,hash(source));m.exports=JSON.parse(source);}else {assert.ok(rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||rel.startsWith('node_modules/'),`untracked repository JSON outside selected tree: ${rel}`);originalJson(m,file);}};
const originalConsole={...console},logs=[];for(const key of ['log','warn','error'])console[key]=(...a)=>logs.push({level:key,text:a.join(' ')});
fs.mkdirSync(path.join(packet,'private'),{recursive:true});
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
const plain=x=>JSON.parse(JSON.stringify(x));
const state=x=>plain(Object.fromEntries(Object.entries(x).filter(([key])=>!['config','confidenceConfigProvider','lastSignal'].includes(key))));
function findNodes(node,predicate,result=[]){if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);for(const [key,value]of Object.entries(node)){if(['loc','start','end'].includes(key))continue;if(Array.isArray(value))value.forEach(v=>findNodes(v,predicate,result));else if(value&&typeof value==='object')findNodes(value,predicate,result);}return result;}
try{
 const dir=fs.mkdtempSync(path.join(packet,'private/loader-'));fs.mkdirSync(path.join(dir,'config'));fs.mkdirSync(path.join(dir,'foundation'));
 for(const file of ['settings','internals'])fs.writeFileSync(path.join(dir,`config/${file}.json`),head(`config/${file}.json`));
 const filename=path.join(dir,'foundation/ConfigLoader.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(root);
 const req=m.require.bind(m);m.require=n=>n==='../core/AtomicWrite'?require(path.join(root,'core/AtomicWrite')):req(n);const globalNames=['settingsConfigFile','internalsConfigFile','activeEnv','activeEnvSources','activeLaunchProfileContext','activeCredentialEnv','activeCredentialSources','activeProcessRole','activeRunDescriptor','_cached','_cachedRole'];
 m._compile(getSource('foundation/ConfigLoader.js')+'\nmodule.exports.probeGlobals=()=>({'+globalNames.join(',')+'});',filename);
 const loader=m.exports;loader.load({loadDotenv:false,silent:true});const loaderPath=path.join(root,'foundation/ConfigLoader.js');require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
 const MADynamicSR=require(path.join(root,'modules/MADynamicSR'));
 const {SymbolTradingContext}=require(path.join(root,'core/SymbolTradingContext'));
 const {StrategyOrchestrator}=require(path.join(root,'core/StrategyOrchestrator'));
 const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'}),strategy=orch.strategies.find(x=>x.name==='MADynamicSR');assert.ok(strategy);
 const runnerSource=getSource('run-empire-v2.js'),tree=parser.parse(runnerSource,{sourceType:'unambiguous'});
 const rootAssignment=findNodes(tree,n=>n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.type==='ThisExpression'&&n.left.property.name==='maDynamicSR');assert.equal(rootAssignment.length,1);
 const contextCalls=findNodes(tree,n=>n.type==='NewExpression'&&n.callee.name==='SymbolTradingContext');assert.equal(contextCalls.length,1);
 const rootOwner={};vm.runInNewContext(`(function(){const masrConfig=ConfigLoader.get('strategies.MADynamicSR');${runnerSource.slice(rootAssignment[0].start,rootAssignment[0].end)};}).call(owner)`,{ConfigLoader:loader,MADynamicSR,owner:rootOwner});
 const contextExpression=runnerSource.slice(contextCalls[0].start,contextCalls[0].end);
 const context=vm.runInNewContext(`(function(){return ${contextExpression};}).call(owner)`,{ConfigLoader:loader,SymbolTradingContext,sym:'BTC-USD',metadata:{timeframe:'15m'},resolvedConfig:loader.getCachedSnapshot(),owner:{_candleStore:{}}});
 const argNode=contextCalls[0].arguments[2],contextConfig=vm.runInNewContext(`(${runnerSource.slice(argNode.start,argNode.end)})`,{ConfigLoader:loader,metadata:{timeframe:'15m'},resolvedConfig:loader.getCachedSnapshot()});
 delete contextConfig.maDynamicSRConfidenceConfigProvider;
 const pinnedContext=new SymbolTradingContext('BTC-USD',{},contextConfig);
 const initial=loader.get('strategies.MADynamicSR'),tape=head('data/kraken-btc-15m-recent.json'),candles=JSON.parse(tape);
 const saves=[];const save=changes=>{const view=loader.getSettingsView();const result=loader.saveSettings({requestId:'masr-integration-'+saves.length,expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes});saves.push({changes,result:Object.fromEntries(Object.entries(result).filter(([key])=>key!=='fields'))});return result;};
 const evaluateOrch=(history,symbol)=>strategy.evaluate({priceHistory:history,extras:{symbol}});
 // Populate actual root and lazy per-symbol orchestrator paths before saving.
 const warm=candles.slice(0,250);
 for(let i=0;i<warm.length;i++){
  const history=warm.slice(0,i+1);rootOwner.maDynamicSR.update(warm[i],history);context.maDynamicSR.update(warm[i],history);
  evaluateOrch(history,undefined);evaluateOrch(history,'BTC-USD');
 }
 const perSymbol=orch.symbolStrategyModules.get('MADynamicSR').get('BTC-USD');
 const owners=[['runner_root',rootOwner.maDynamicSR],['symbol_context',context.maDynamicSR],['orchestrator_root',orch.maDynamicSRModule],['orchestrator_symbol',perSymbol]];
 const controls=new Map(owners.map(([name,instance])=>{const control=new MADynamicSR(initial);for(let i=0;i<warm.length;i++){const history=warm.slice(0,i+1);if(!name.startsWith('orchestrator')||history.length>=orch.minCandlesMASR)control.update(warm[i],history);}assert.deepEqual(state(instance),state(control));assert.ok(instance.swings.length>0);return[name,control];}));
 const pinned=new MADynamicSR(initial);
 const changesByOwner=Object.fromEntries(owners.map(([name])=>[name,{}]));
 const variants=[['baseConfidence',0.75],['touchQualityWeight',0.9],['maxConfidence',0.1]];
 for(const[field,value]of variants){
  assert.equal(save({['strategies.MADynamicSR.'+field]:value}).applied,true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'config/settings.json'))).strategies.MADynamicSR[field],value);
  for(const[name]of owners)changesByOwner[name][field]=0;
  for(let i=250;i<candles.length;i++){
   const history=candles.slice(0,i+1),candle=candles[i];
   const pinnedSignal=pinned.update(candle,history),pinnedContextSignal=pinnedContext.maDynamicSR.update(candle,history);assert.deepEqual(plain(pinnedSignal),plain(pinnedContextSignal));
   rootOwner.maDynamicSR.update(candle,history);context.maDynamicSR.update(candle,history);evaluateOrch(history,undefined);evaluateOrch(history,'BTC-USD');
   assert.equal(orch.symbolStrategyModules.get('MADynamicSR').get('BTC-USD'),perSymbol);
   for(const[name,instance]of owners){
    const control=controls.get(name),a=control.update(candle,history),b=instance.lastSignal;
    assert.equal(instance.config[field],value);assert.deepEqual(state(instance),state(control));
    if(a.direction==='neutral')continue;
    assert.ok(b);const q=Math.min(1,Math.max(0,1-Math.abs(candle.close-b.levels.ma20)/b.levels.ma20*100/initial.touchZonePct));
    const cfg={...initial,[field]:value},expected=Math.min(cfg.maxConfidence,Math.max(0,(cfg.baseConfidence+q*cfg.touchQualityWeight)*b.confidenceProfile.composite));
    assert.equal(b.confidence,expected);assert.deepEqual(plain({...b,confidence:a.confidence}),plain(a));
    if(b.confidence!==a.confidence)changesByOwner[name][field]++;
   }
  }
  for(const[name]of owners)assert.ok(changesByOwner[name][field]>0,`${name}.${field} inert`);
  assert.equal(save({['strategies.MADynamicSR.'+field]:initial[field]}).applied,true);
 }
 const invalid=[];
 for(const field of variants.map(x=>x[0]))for(const value of [0,-1,NaN,Infinity,'0.5',null]){
  const before=fs.readFileSync(path.join(dir,'config/settings.json')),receipt=loader.getSettingsView().configuration;const result=save({['strategies.MADynamicSR.'+field]:value});assert.equal(result.applied,false);assert.deepEqual(fs.readFileSync(path.join(dir,'config/settings.json')),before);assert.deepEqual(loader.getSettingsView().configuration,receipt);invalid.push({field,type:typeof value,value:String(value),reason:result.reason});
 }
 // Preserve base/weight positive domain; cap must satisfy existing orchestrator output contract.
 for(const field of variants.map(x=>x[0]))for(const value of (field==='maxConfidence'?[Number.MIN_VALUE,0.5,1]:[Number.MIN_VALUE,2,Number.MAX_VALUE])){
  assert.equal(save({['strategies.MADynamicSR.'+field]:value}).applied,true);assert.equal(loader.get('strategies.MADynamicSR.'+field),value);
  assert.equal(save({['strategies.MADynamicSR.'+field]:initial[field]}).applied,true);
 }
 // The dependent boundary rejects malformed forced replacements before publishing them.
 const acceptedSettingsBytes=fs.readFileSync(path.join(dir,'config/settings.json')),acceptedInternalsBytes=fs.readFileSync(path.join(dir,'config/internals.json'));
 const beforeForce=loader.probeGlobals(),beforeForceReceipt=loader.getSettingsView().configuration;
 const beforeCanonical=loader.getConfigFileValue('strategies.MADynamicSR'),beforeInternalRevision=loader.getInternalsFileValue('revision');
 const invalidForce=[];
 const malformedValues=[0,-1,'not-a-number','Infinity',null,[],{toString:null},undefined];
 for(const[field]of variants)for(const value of malformedValues){
  const malformed=JSON.parse(acceptedSettingsBytes),changedInternals=JSON.parse(acceptedInternalsBytes);
  if(value===undefined)delete malformed.strategies.MADynamicSR[field];else malformed.strategies.MADynamicSR[field]=value;
  changedInternals.revision+=1;
  fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(malformed));fs.writeFileSync(path.join(dir,'config/internals.json'),JSON.stringify(changedInternals));
  const logStart=logs.length,result=loader.load({force:true,loadDotenv:false,silent:true});
  assert.equal(result.success,false);assert.equal(result.applied,false);assert.equal(result.reloaded,false);assert.equal(result.reason,'invalid_ma_dynamic_sr_confidence');assert.equal(result.path,'strategies.MADynamicSR.'+field);
  const after=loader.probeGlobals();for(const name of globalNames)assert.equal(after[name],beforeForce[name],name);
  assert.deepEqual(loader.getSettingsView().configuration,beforeForceReceipt);assert.deepEqual(loader.getConfigFileValue('strategies.MADynamicSR'),beforeCanonical);assert.equal(loader.getInternalsFileValue('revision'),beforeInternalRevision);
  assert.ok(logs.slice(logStart).some(x=>x.level==='error'&&x.text.includes(result.reason)&&x.text.includes(result.path)),'named rejection must be visible');
  invalidForce.push({field,value:value===undefined?'missing':plain(value),reason:result.reason,path:result.path});
 }
 const absentBlocks=[];
 for(const value of [undefined,null,[]]){
  const malformed=JSON.parse(acceptedSettingsBytes);if(value===undefined)delete malformed.strategies.MADynamicSR;else malformed.strategies.MADynamicSR=value;
  fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(malformed));
  const result=loader.load({force:true,loadDotenv:false,silent:true});assert.equal(result.applied,false);assert.equal(result.reason,'invalid_ma_dynamic_sr_confidence');assert.equal(result.path,'strategies.MADynamicSR.baseConfidence');
  const after=loader.probeGlobals();for(const name of globalNames)assert.equal(after[name],beforeForce[name],name);absentBlocks.push(value===undefined?'missing':value);
 }
 assert.equal(loader.load({silent:true}),beforeForce._cached);
 const changedDiskSave=save({'strategies.MADynamicSR.baseConfidence':0.6});assert.equal(changedDiskSave.reason,'settings_changed_outside_loaded_owner');
 // A rejected read must leave actual retained consumers on the prior owner.
 for(let i=500;i<550;i++){
  const history=candles.slice(0,i+1),candle=candles[i];rootOwner.maDynamicSR.update(candle,history);context.maDynamicSR.update(candle,history);evaluateOrch(history,undefined);evaluateOrch(history,'BTC-USD');
  for(const[name,instance]of owners){const control=controls.get(name),a=control.update(candle,history);assert.deepEqual(state(instance),state(control));for(const[field]of variants)assert.equal(instance.config[field],initial[field]);if(a.direction!=='neutral')assert.deepEqual(plain(instance.lastSignal),plain(a));}
 }
 const replacement=JSON.parse(acceptedSettingsBytes);replacement.revision+=1;replacement.strategies.MADynamicSR.baseConfidence='0.75';
 fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(replacement));fs.writeFileSync(path.join(dir,'config/internals.json'),acceptedInternalsBytes);
 const validForce=loader.load({force:true,loadDotenv:false,silent:true});assert.ok(validForce.config);assert.notEqual(validForce,beforeForce._cached);assert.equal(loader.getConfigFileValue('strategies.MADynamicSR').baseConfidence,'0.75');
 const forceChanges=Object.fromEntries(owners.map(([name])=>[name,0]));
 for(let i=550;i<candles.length;i++){
  const history=candles.slice(0,i+1),candle=candles[i];rootOwner.maDynamicSR.update(candle,history);context.maDynamicSR.update(candle,history);evaluateOrch(history,undefined);evaluateOrch(history,'BTC-USD');
  for(const[name,instance]of owners){const control=controls.get(name),a=control.update(candle,history),b=instance.lastSignal;assert.deepEqual(state(instance),state(control));assert.equal(instance.config.baseConfidence,0.75);if(a.direction==='neutral')continue;
   const q=Math.min(1,Math.max(0,1-Math.abs(candle.close-b.levels.ma20)/b.levels.ma20*100/initial.touchZonePct));assert.equal(b.confidence,Math.min(initial.maxConfidence,Math.max(0,(0.75+q*initial.touchQualityWeight)*b.confidenceProfile.composite)));assert.deepEqual(plain({...b,confidence:a.confidence}),plain(a));if(b.confidence!==a.confidence)forceChanges[name]++;
  }
 }
 for(const[name]of owners)assert.ok(forceChanges[name]>0,name);
 // Existing finite-positive coercion remains supported at forced replacement too.
 const positiveCoercions=[];
 for(const[field]of variants)for(const value of (field==='maxConfidence'?[Number.MIN_VALUE,1,'0.5',true]:[Number.MIN_VALUE,2,Number.MAX_VALUE,'0.5',true])){
  const configured=JSON.parse(acceptedSettingsBytes);configured.strategies.MADynamicSR[field]=value;fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(configured));
  const result=loader.load({force:true,loadDotenv:false,silent:true});assert.ok(result.config);assert.equal(loader.get('strategies.MADynamicSR.'+field),value);rootOwner.maDynamicSR.update(null,[]);assert.equal(rootOwner.maDynamicSR.config[field],Number(value));positiveCoercions.push({field,value});
 }
 const forcedReplacement={invalid:invalidForce,absentBlocks,globalIdentitiesPreserved:globalNames.length,canonicalReadersPreserved:true,namedErrors:true,invalidDiskBlocksSave:true,validForceChanges:forceChanges,positiveCoercions,result:'PASS'};
 // Numeric strings accepted at construction must stay normalized on refresh.
 const stringDir=fs.mkdtempSync(path.join(packet,'private/string-loader-'));fs.mkdirSync(path.join(stringDir,'config'));fs.mkdirSync(path.join(stringDir,'foundation'));
 const stringSettings=JSON.parse(head('config/settings.json'));
 for(const[field]of variants)stringSettings.strategies.MADynamicSR[field]=String(stringSettings.strategies.MADynamicSR[field]);
 const stringSettingsSource=JSON.stringify(stringSettings,null,2);
 fs.writeFileSync(path.join(stringDir,'config/settings.json'),stringSettingsSource);fs.writeFileSync(path.join(stringDir,'config/internals.json'),head('config/internals.json'));
 const stringFile=path.join(stringDir,'foundation/ConfigLoader.js'),sm=new Module(stringFile,module);sm.filename=stringFile;sm.paths=Module._nodeModulePaths(root);
 const stringRequire=sm.require.bind(sm);sm.require=n=>n==='../core/AtomicWrite'?require(path.join(root,'core/AtomicWrite')):stringRequire(n);sm._compile(getSource('foundation/ConfigLoader.js'),stringFile);
 const stringLoader=sm.exports;stringLoader.load({loadDotenv:false,silent:true});
 const stringConfig=stringLoader.get('strategies.MADynamicSR');for(const[field]of variants)assert.equal(typeof stringConfig[field],'string');
 const stringLive=new MADynamicSR(stringConfig,()=>stringLoader.get('strategies.MADynamicSR')),stringPinned=new MADynamicSR(stringConfig);
 let stringChanges=0,stringSave;
 for(let i=0;i<candles.length;i++){
  if(i===400){const view=stringLoader.getSettingsView();stringSave=stringLoader.saveSettings({requestId:'masr-strings',expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes:{'strategies.MADynamicSR.baseConfidence':0.75}});assert.equal(stringSave.applied,true);}
  const history=candles.slice(0,i+1),a=stringPinned.update(candles[i],history),b=stringLive.update(candles[i],history);
  assert.deepEqual(state(stringLive),state(stringPinned));
  for(const[field]of variants)assert.equal(typeof stringLive.config[field],'number');
  if(i<400)assert.deepEqual(plain(b),plain(a));
  else if(a.direction!=='neutral'){
   const q=Math.min(1,Math.max(0,1-Math.abs(candles[i].close-b.levels.ma20)/b.levels.ma20*100/initial.touchZonePct));
   assert.equal(b.confidence,Math.min(initial.maxConfidence,Math.max(0,(0.75+q*initial.touchQualityWeight)*b.confidenceProfile.composite)));
   assert.deepEqual(plain({...b,confidence:a.confidence}),plain(a));if(a.confidence!==b.confidence)stringChanges++;
  }
 }
 assert.ok(stringChanges>0);
 const stringCase={settingsSourceSha256:hash(stringSettingsSource),initialConfidenceStrings:Object.fromEntries(variants.map(([field])=>[field,stringConfig[field]])),warmupBars:400,changedSignalsAfterSave:stringChanges,result:'PASS',configuration:stringSave.configuration};
 const receipt={baseline:reviewTree?null:baseline,sourceSelection,selectedSourceHashes,patchManifest,forcedReplacement,stringCase,sourceManifest:Object.fromEntries([...modified].map(([file,source])=>[file,{baselineSha256:hash(head(file)),candidateSha256:hash(source)}])),loadedSourceManifest:Object.fromEntries(loaded),tapeSha256:hash(tape),result:'PASS',candles:candles.length,owners:changesByOwner,invalid,pinnedContextUnchanged:true,baseAndWeightFinitePositiveDomainPreserved:true,maxConfidenceReplacementDomain:'(0,1]',saveCount:saves.length,saves,limits:['Runner constructor is not booted: exact parsed root assignment and SymbolTradingContext new-expression run in VM with actual constructors.','Actual StrategyOrchestrator root and lazy-symbol evaluate closures run; no full TradingLoop/order/broker or dashboard relay.',reviewTree?'Tracked production/configuration sources are read directly from the selected immutable tree; no lane patches reapplied.':'Only clean baseline plus packet patches compiled; fixture settings persisted within packet private directory.']};
 fs.writeFileSync(resultPath,JSON.stringify(receipt,null,2)+'\n');originalConsole.log(JSON.stringify({result:receipt.result,sourceSelection,resultPath,logPath,owners:changesByOwner,invalidRejected:invalid.length,saveCount:saves.length,forcedInvalid:invalidForce.length,forceChanges}));
}catch(error){originalConsole.error(error);process.exitCode=1;}finally{fs.writeFileSync(logPath,logs.map(x=>JSON.stringify(x)).join('\n'));Object.assign(console,originalConsole);Module._extensions['.js']=originalJs;Module._extensions['.json']=originalJson;}
