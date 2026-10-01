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
const resultPath=path.join(packet,reviewTree?`private/cap-boundary-review-${selectedTree}.json`:'cap-boundary-result.json');
const logPath=path.join(packet,`private/cap-boundary-${process.env.MA_CAP_CORRECTION==='1'?'corrected':'exposed'}-${selectedTree}.log`);
const head=p=>cp.execFileSync('git',['show',`${selectedRef}:${p}`],{cwd:root,encoding:'utf8',maxBuffer:20e6});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const sourceCache=new Map(),modified=new Map();
const patchNames=reviewTree?[]:['module.patch','producers.patch','../ema-crossover-confidence/fixtures/loader-final-head.patch','../ema-crossover-confidence/fixtures/role-ownership.patch','loader-dependent.patch'];
const patchManifest={};
for(const patchName of patchNames){const patchSource=fs.readFileSync(path.join(packet,patchName),'utf8');patchManifest[patchName]=hash(patchSource);for(const patch of diff.parsePatch(patchSource)){
 const file=patch.oldFileName.replace(/^a\//,''); const source=diff.applyPatch(modified.get(file)||head(file),patch);assert.ok(source,`clean baseline patch application: ${file}`);modified.set(file,source);
}}
if(process.env.MA_CAP_CORRECTION==='1'){const patchSource=fs.readFileSync(path.join(packet,'cap-boundary.patch'),'utf8');patchManifest['cap-boundary.patch']=hash(patchSource);for(const patch of diff.parsePatch(patchSource)){const file=patch.oldFileName.replace(/^a\//,'');const source=diff.applyPatch(modified.get(file)||head(file),patch);assert.ok(source);modified.set(file,source);}}
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
 const corrected=process.env.MA_CAP_CORRECTION==='1'||process.env.MA_CAP_EXPECT_CORRECTED==='1';
 if(process.env.MA_CAP_CORRECTION==='1'){sourceSelection.correctionOverlay='cap-boundary.patch';sourceSelection.patchesApplied=true;if(reviewTree)sourceSelection.mode='immutable_review_tree_plus_correction';}
 orch.strategies=[strategy]; // Actual registered factory and evaluator, other strategies excluded from this focused fixture.
 const outcome={corrected,sourceSelection,patchManifest,selectedSourceHashes,save:[],force:[],consumer:[]};
 function consume(label){let capErrors=0,nonNeutral=0,max=0;const errors=[];for(let i=250;i<candles.length;i++){
  const history=candles.slice(0,i+1),candle=candles[i];
  orch.evaluate({atr:candle.close*0.01},[],null,history,{symbol:'BTC-USD',price:candle.close,timeframe:'15m'});
  const signal=perSymbol.lastSignal;if(signal?.direction!=='neutral'){nonNeutral++;max=Math.max(max,signal.confidence||0);}
  for(const x of orch.currentEvaluationUnavailableStrategies||[])if(x.strategyName==='MADynamicSR'&&String(x.errorMessage).includes('confidence')){capErrors++;if(errors.length<2)errors.push(x);}
 }const result={label,capErrors,nonNeutral,max,errors};outcome.consumer.push(result);return result;}
 // Save only the cap above one first. A subsequent large but otherwise supported base reveals the consumer incompatibility.
 const beforeCapSave=loader.probeGlobals(),beforeCapBytes=fs.readFileSync(path.join(dir,'config/settings.json')),beforeCapState=state(perSymbol);
 const capSave=save({'strategies.MADynamicSR.maxConfidence':2});outcome.save.push(capSave);
 assert.equal(capSave.applied,!corrected);
 if(corrected){for(const value of [1+Number.EPSILON,Number.MAX_VALUE])assert.equal(save({'strategies.MADynamicSR.maxConfidence':value}).applied,false);for(const name of globalNames)assert.equal(loader.probeGlobals()[name],beforeCapSave[name]);assert.deepEqual(fs.readFileSync(path.join(dir,'config/settings.json')),beforeCapBytes);assert.deepEqual(state(perSymbol),beforeCapState);}
 assert.equal(save({'strategies.MADynamicSR.baseConfidence':2,'strategies.MADynamicSR.touchQualityWeight':2}).applied,true);
 const hot=consume('save retained registered symbol');assert.ok(hot.nonNeutral>0);assert.equal(hot.capErrors>0,!corrected);if(corrected)assert.ok(hot.max<=1);
 const accepted=fs.readFileSync(path.join(dir,'config/settings.json')),before=loader.probeGlobals(),receipt=loader.getSettingsView().configuration,beforeForcedState=state(perSymbol);
 for(const value of [1+Number.EPSILON,2,Number.MAX_VALUE,'2']){
  const cfg=JSON.parse(accepted);cfg.strategies.MADynamicSR.maxConfidence=value;fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(cfg));
  const result=loader.load({force:true,loadDotenv:false,silent:true});outcome.force.push({value,applied:!!result.config,reason:result.reason});
  assert.equal(!!result.config,!corrected);
  if(corrected){assert.equal(result.reason,'invalid_ma_dynamic_sr_confidence');assert.equal(result.path,'strategies.MADynamicSR.maxConfidence');for(const name of globalNames)assert.equal(loader.probeGlobals()[name],before[name]);assert.deepEqual(loader.getSettingsView().configuration,receipt);assert.deepEqual(state(perSymbol),beforeForcedState);}
 }
 const forced=consume('force retained registered symbol');assert.equal(forced.capErrors>0,!corrected);if(corrected)assert.ok(forced.max<=1);
 fs.writeFileSync(path.join(dir,'config/settings.json'),accepted);
 if(corrected){
  for(const cap of [Number.MIN_VALUE,0.5,1]){assert.equal(save({'strategies.MADynamicSR.maxConfidence':cap}).applied,true);const r=consume('accepted cap '+cap);assert.equal(r.capErrors,0);assert.ok(r.max<=cap);}
  const bytes=fs.readFileSync(path.join(dir,'config/settings.json'));
  for(const value of ['1',true,'0.5']){const cfg=JSON.parse(bytes);cfg.strategies.MADynamicSR.maxConfidence=value;fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(cfg));assert.ok(loader.load({force:true,loadDotenv:false,silent:true}).config);assert.equal(consume('coerced cap '+value).capErrors,0);}
 }
 outcome.result='PASS';outcome.loadedSourceManifest=Object.fromEntries(loaded);outcome.tapeSha256=hash(tape);
 const destination=path.join(packet,'private',`cap-boundary-${corrected?'corrected':'exposed'}-${selectedTree}.json`);fs.writeFileSync(destination,JSON.stringify(outcome,null,2)+'\n');originalConsole.log(JSON.stringify({result:'PASS',destination,consumer:outcome.consumer}));
}catch(error){originalConsole.error(error);process.exitCode=1;}finally{fs.writeFileSync(logPath,logs.map(x=>JSON.stringify(x)).join('\n'));Object.assign(console,originalConsole);Module._extensions['.js']=originalJs;Module._extensions['.json']=originalJson;}
