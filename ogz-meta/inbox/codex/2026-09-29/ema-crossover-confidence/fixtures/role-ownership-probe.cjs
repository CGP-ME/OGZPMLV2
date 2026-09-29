'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),Module=require('module'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),diff=require('diff');
const root=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim(),packet=path.resolve(__dirname,'..');
// Historical tree is an attestation label only; all source bytes reconstruct from reachable history.
const exposureTree='8b381e69c5bed1ecb73c5bcfc6f8e7728c49eea2',baseline='6bcfad8a',reconstructionBase='8eabf0f4e61d4edd4cdae974a19c6fdbf41400e2';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const gitRead=(ref,file)=>cp.execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8',maxBuffer:20e6});
const reconstructed=new Map(),reconstructionPatches={};
for(const patchName of ['module.patch','loader-final-head.patch','producers.patch']){
 const patchSource=fs.readFileSync(path.join(__dirname,patchName),'utf8');reconstructionPatches[patchName]=hash(patchSource);
 for(const change of diff.parsePatch(patchSource)){
  const file=change.oldFileName.replace(/^a\//,''),prior=reconstructed.get(file)||gitRead(reconstructionBase,file),next=diff.applyPatch(prior,change);
  assert.ok(next,`reconstruction patch failed: ${patchName}: ${file}`);reconstructed.set(file,next);
 }
}
const sources={},read=(ref,file)=>{
 const s=ref===exposureTree?(reconstructed.get(file)||gitRead(reconstructionBase,file)):gitRead(ref,file);
 sources[`${ref}:${file}`]=hash(s);return s;
};
const attestation=JSON.parse(fs.readFileSync(path.join(packet,'FIRST-REVIEW-TREE-PROOF.json'),'utf8'));
assert.equal(attestation.tree,exposureTree);
for(const[file,expected]of Object.entries(attestation.files))assert.equal(hash(read(exposureTree,file)),expected,`historical source identity: ${file}`);
const patch=fs.readFileSync(path.join(__dirname,'role-ownership.patch'),'utf8');
const exposedSource=read(exposureTree,'foundation/ConfigLoader.js'),fixedSource=diff.applyPatch(exposedSource,patch);assert.ok(fixedSource,'role patch applies to reconstructed attested EMA bytes');assert.equal(hash(fixedSource),'094320239c2f40eb5cb323c1a328f88954ef840dcdb871b916fa6a9876cbfaaf','corrected loader remains byte-identical');
const logs=[],quiet={log:(...x)=>logs.push({level:'log',text:x.join(' ')}),warn:(...x)=>logs.push({level:'warn',text:x.join(' ')}),error:(...x)=>logs.push({level:'error',text:x.join(' ')})};
const originalConsole={...console};Object.assign(console,quiet);
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
fs.mkdirSync(path.join(packet,'private'),{recursive:true});
const pure=(source,deps={})=>{const module={exports:{}};vm.runInNewContext(source,{module,require:id=>{assert.ok(Object.hasOwn(deps,id),id);return deps[id];},console:quiet});return module.exports;};
const plain=x=>JSON.parse(JSON.stringify(x));
const state=x=>plain(Object.fromEntries(Object.entries(x).filter(([key])=>key!=='confidenceConfigProvider')));
const globalNames=['settingsConfigFile','internalsConfigFile','activeEnv','activeEnvSources','activeLaunchProfileContext','activeCredentialEnv','activeCredentialSources','activeProcessRole','activeRunDescriptor','_cached','_cachedRole'];
try{
 const results=[],initials=new Map(),candles=JSON.parse(read(exposureTree,'data/kraken-btc-15m-recent.json'));
 for(const[mode,ref,loaderSource]of [['baseline',baseline,read(baseline,'foundation/ConfigLoader.js')],['exposed_ema',exposureTree,exposedSource],['corrected_ema',exposureTree,fixedSource]])for(const[initialRole,requestedRole]of [['bot','dashboard'],['dashboard','bot']]){
  const dir=fs.mkdtempSync(path.join(packet,'private/role-ownership-'));fs.mkdirSync(path.join(dir,'config'));fs.mkdirSync(path.join(dir,'foundation'));
  for(const file of ['settings','internals'])fs.writeFileSync(path.join(dir,`config/${file}.json`),read(ref,`config/${file}.json`));
  const filename=path.join(dir,'foundation/ConfigLoader.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(root);
  const atomic=pure(read(ref,'core/AtomicWrite.js'),{fs}),req=m.require.bind(m);m.require=id=>id==='../core/AtomicWrite'?atomic:req(id);
  m._compile(loaderSource+'\nmodule.exports.probeGlobals=()=>({'+globalNames.join(',')+'});',filename);
  const loader=m.exports,initial=loader.load({role:initialRole,loadDotenv:false,silent:true});assert.equal(initial.role,initialRole);
  if(mode==='exposed_ema')initials.set(initialRole,{config:initial.config,sources:initial.sources,revisions:initial.revisions});
  if(mode==='corrected_ema')assert.deepEqual({config:initial.config,sources:initial.sources,revisions:initial.revisions},initials.get(initialRole),'initial role boot unchanged');
  let detector,control;
  if(initialRole==='bot'){
   const helper=pure(read(ref,'core/CandleHelper.js')),Detector=pure(read(ref,'modules/EMASMACrossoverSignal.js'),{'../core/CandleHelper':helper});
   const config={...initial.config.strategies.EMASMACrossover,...initial.config.strategyBehavior.emaCrossover};
   detector=new Detector(config,()=>loader.get('strategies.EMASMACrossover'));control=new Detector(config);
   for(let i=0;i<400;i++){const history=candles.slice(0,i+1);assert.deepEqual(plain(detector.update(candles[i],history)),plain(control.update(candles[i],history)));}
  }
  const before=loader.probeGlobals(),beforeReceipt=loader.getSettingsView().configuration,beforeDetector=detector&&state(detector),settingsBefore=fs.readFileSync(path.join(dir,'config/settings.json')),internalsBefore=fs.readFileSync(path.join(dir,'config/internals.json'));
  const logStart=logs.length,result=loader.load({force:true,role:requestedRole,loadDotenv:false,silent:true}),after=loader.probeGlobals();
  const row={mode,initialRole,requestedRole,loaderSha256:hash(loaderSource),resultRole:result.role,reason:result.reason,globalChanges:globalNames.filter(k=>after[k]!==before[k])};
  if(mode==='corrected_ema'){
   assert.equal(result.success,false);assert.equal(result.applied,false);assert.equal(result.reloaded,false);assert.equal(result.reason,'forced_reload_role_change_rejected');assert.equal(result.requestedRole,requestedRole);assert.equal(result.currentRole,initialRole);assert.deepEqual(result.configuration,beforeReceipt);
   for(const name of globalNames)assert.equal(after[name],before[name],name);
   assert.deepEqual(fs.readFileSync(path.join(dir,'config/settings.json')),settingsBefore);assert.deepEqual(fs.readFileSync(path.join(dir,'config/internals.json')),internalsBefore);
   assert.ok(logs.slice(logStart).some(x=>x.level==='error'&&x.text.includes(result.reason)&&x.text.includes(initialRole)&&x.text.includes(requestedRole)));
   assert.equal(loader.load({role:initialRole,silent:true}),initial);assert.deepEqual(loader.getSettingsView().configuration,beforeReceipt);
   if(detector){assert.deepEqual(state(detector),beforeDetector);for(let i=400;i<500;i++){const history=candles.slice(0,i+1);assert.deepEqual(plain(detector.update(candles[i],history)),plain(control.update(candles[i],history)));assert.deepEqual(state(detector),state(control));}row.retainedCallbackContinuedBars=100;}
   // Same-role valid replacement remains effective, including the real retained callback.
   if(initialRole==='bot'){
    const configured=JSON.parse(settingsBefore);configured.revision+=1;configured.strategies.EMASMACrossover.baseConfidence=0.7;fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(configured));
   }
   const sameRole=loader.load({force:true,role:initialRole,loadDotenv:false,silent:true});assert.equal(sameRole.role,initialRole);assert.notEqual(sameRole,initial);row.sameRoleForceAccepted=true;
   if(detector){let changed=0;for(let i=500;i<candles.length;i++){const history=candles.slice(0,i+1),a=detector.update(candles[i],history),b=control.update(candles[i],history);assert.equal(detector.cfg.baseConfidence,0.7);if(a.confidence!==b.confidence)changed++;}assert.ok(changed>0);row.sameRoleChangedSignals=changed;}
  }else{
   assert.equal(result.role,requestedRole);assert.ok(row.globalChanges.includes('_cached'));
   if(detector){let error;try{detector.update(candles[400],candles.slice(0,401));}catch(e){error={name:e.name,message:e.message};}row.nextUpdateError=error;if(mode==='exposed_ema')assert.equal(error?.name,'TypeError');else assert.equal(error,undefined);}
  }
  results.push(row);
 }
 const receipt={result:'PASS',baseline,exposureTree,reconstruction:{base:reconstructionBase,patches:reconstructionPatches,attestedFiles:Object.keys(attestation.files).length,historicalTreeUsedAsGitDependency:false},patchSha256:hash(patch),fixedLoaderSha256:hash(fixedSource),sourceManifest:sources,results,notes:['Reachable base plus three EMA patches reconstructs all nine attested historical source hashes; historical tree ID is only a receipt label. Corrected bytes add one role-ownership patch.','No full bot/bootstrap/broker call; actual loader, persistence reads, recorded candles and retained EMA callback execute.','Production exports unchanged;11 loader global identities are observed through a test-only export.','No production/index/commit/provider actions.']};
 fs.writeFileSync(path.join(packet,'role-ownership-result.json'),JSON.stringify(receipt,null,2)+'\n');originalConsole.log(JSON.stringify({result:receipt.result,patchSha256:receipt.patchSha256,results}));
}catch(error){originalConsole.error(error);process.exitCode=1;}finally{Object.assign(console,originalConsole);fs.writeFileSync(path.join(packet,'private/role-ownership.log'),logs.map(x=>JSON.stringify(x)).join('\n'));}
