'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const baseRef='6bcfad8a25f72cb9e1eb946e854695913b2133c4';
const head=p=>cp.execFileSync('git',['show',`${baseRef}:${p}`],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const base=head('foundation/ConfigLoader.js');
const marker="  'strategies.RSI.confidenceBase': {",end="  'strategies.RSI.regimeMaFilter.enabled': {";
const addition=fs.readFileSync(path.join(__dirname,'rsi-confidence.patch'),'utf8').split('\n').filter(line=>line.startsWith('+')&&!line.startsWith('+++')).map(line=>line.slice(1)).join('\n')+'\n';assert.ok(addition.startsWith(marker));
const candidate=base.replace(end,addition+end);
fs.writeFileSync(path.join(packet,'private/candidate-ConfigLoader.js'),candidate);
const sourceFiles=cp.execFileSync('git',['ls-files','*.js'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const sources=new Map(sourceFiles.map(p=>[path.join(root,p),p]));
const extension=Module._extensions['.js'];
Module._extensions['.js']=(m,file)=>sources.has(file)?m._compile(head(sources.get(file)),file):extension(m,file);
const originalConsole={...console},logs=[];for(const k of ['log','warn','error'])console[k]=(...a)=>logs.push({level:k,text:a.join(' ')});
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'});
const input=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json'));const candles=JSON.parse(input).candles;
const fields=['confidenceBase','confidenceDepthRange','confidenceDepthMultiplier','maxConfidence'];
const receipts=[];
try{
for(const [label,source]of [['baseline',base],['candidate',candidate]]){
  for(const file of Object.keys(require.cache))if(file.startsWith(root+'/')&&!file.includes('/node_modules/'))delete require.cache[file];
  const dir=fs.mkdtempSync(path.join(packet,'private/'+label+'-'));fs.mkdirSync(path.join(dir,'config'));fs.mkdirSync(path.join(dir,'foundation'));
  fs.writeFileSync(path.join(dir,'config/settings.json'),head('config/settings.json'));fs.writeFileSync(path.join(dir,'config/internals.json'),head('config/internals.json'));
  const filename=path.join(dir,'foundation/ConfigLoader.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(root);
  const req=m.require.bind(m);m.require=n=>n==='../core/AtomicWrite'?require(path.join(root,'core/AtomicWrite')):req(n);m._compile(source,filename);
  const loader=m.exports;loader.load({loadDotenv:false,silent:true});const loaderPath=path.join(root,'foundation/ConfigLoader.js');require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
  const {StrategyOrchestrator}=require(path.join(root,'core/StrategyOrchestrator'));const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'});const rsi=orch.strategies.find(s=>s.name==='RSI');assert.ok(rsi);
  const evaluate=()=>candles.map((c,i)=>rsi.evaluate({priceHistory:candles.slice(0,i+1),extras:{symbol:'TSLA',timeframe:'15m',price:c.c}})).filter(Boolean).map(s=>({rsi:s.signalData.rsi,confidence:s.confidence,contract:s.exitContractHint}));
  const canonical=evaluate();assert.ok(canonical.length>0);
  const saves=[];const save=changes=>{const view=loader.getSettingsView();const result=loader.saveSettings({requestId:'rsi-confidence-'+saves.length,expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes});saves.push({changes,result});return result;};
  const original=loader.get('strategies.RSI');const variants={confidenceBase:0.6,confidenceDepthRange:30,confidenceDepthMultiplier:0.2,maxConfidence:0.55};const effects=[];
  for(const field of fields){
    const key='strategies.RSI.'+field,result=save({[key]:variants[field]});
    if(label==='baseline'){assert.equal(result.applied,false);continue;}
    assert.equal(result.applied,true,JSON.stringify(result));assert.equal(loader.get(key),variants[field]);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'config/settings.json'))).strategies.RSI[field],variants[field]);
    const changed=evaluate();assert.notDeepEqual(changed,canonical,field);assert.equal(changed.length,canonical.length);for(let i=0;i<changed.length;i++)assert.deepEqual(changed[i].contract,canonical[i].contract);
    effects.push({field,before:canonical.map(s=>s.confidence),after:changed.map(s=>s.confidence)});assert.equal(save({[key]:original[field]}).applied,true);
  }
  if(label==='candidate'){
    const bad=[['confidenceBase',-1],['confidenceBase',1.01],['confidenceDepthRange',0],['confidenceDepthRange',0.0000001],['confidenceDepthMultiplier',1.01],['maxConfidence',-1],['maxConfidence',NaN],['confidenceBase','0.5']];
    for(const[field,value]of bad){const before=fs.readFileSync(path.join(dir,'config/settings.json'));const view=loader.getSettingsView();assert.equal(save({['strategies.RSI.'+field]:value}).applied,false);assert.deepEqual(fs.readFileSync(path.join(dir,'config/settings.json')),before);assert.deepEqual(loader.getSettingsView().configuration,view.configuration);}
    assert.equal(save({'strategies.RSI.confidenceDepthMultiplier':0}).applied,true);assert.ok(evaluate().every(s=>s.confidence===original.confidenceBase));
    assert.equal(save({'strategies.RSI.maxConfidence':0}).applied,true);assert.equal(evaluate().length,0);
  }
  receipts.push({label,sourceSha256:hash(source),candles:candles.length,canonicalSignals:canonical.length,effects,saves});
}
fs.writeFileSync(path.join(packet,'OBSERVATION.json'),JSON.stringify({head:baseRef,inputSha256:hash(input),receipts},null,2)+'\n');
originalConsole.log(JSON.stringify({passed:true,results:receipts.map(r=>({label:r.label,signals:r.canonicalSignals,effects:r.effects.length,saves:r.saves.length}))}));
}catch(error){originalConsole.error(error);process.exitCode=1;}finally{fs.writeFileSync(path.join(packet,'private/observe.log'),logs.map(x=>JSON.stringify(x)).join('\n'));Object.assign(console,originalConsole);Module._extensions['.js']=extension;}
