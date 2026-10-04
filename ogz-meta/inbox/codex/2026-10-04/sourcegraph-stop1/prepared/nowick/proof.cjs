'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),Module=require('module');
const root=process.cwd(),dir=__dirname,loaderPath=path.join(root,'foundation/ConfigLoader.js');
const settingsPath=path.join(root,'config/settings.json');let disk=fs.readFileSync(settingsPath,'utf8');
const realRequire=Module.createRequire(loaderPath),source=fs.readFileSync(path.join(dir,'candidate.js'),'utf8');
const fakeFs=Object.create(fs);fakeFs.readFileSync=(file,...args)=>path.resolve(String(file))===settingsPath?disk:fs.readFileSync(file,...args);
const exportsObject={exports:{}};const quiet={log(){},warn(){},error(){}};
const wrapper=vm.runInThisContext('(function(require,module,exports,__filename,__dirname,console){'+source+'\n})',{filename:loaderPath});
wrapper(id=>id==='fs'?fakeFs:id==='../core/AtomicWrite'?{writeJsonAtomic(file,value){assert.equal(file,settingsPath);disk=JSON.stringify(value,null,2);}}:realRequire(id),exportsObject,exportsObject.exports,loaderPath,path.dirname(loaderPath),quiet);
const loader=exportsObject.exports;loader.load();
const modulePath=path.join(root,'modules/NoWickImbalance.js'),moduleObject={exports:{}};
vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(path.join(dir,'module-candidate.js'),'utf8')+'\n})',{filename:modulePath})(Module.createRequire(modulePath),moduleObject,moduleObject.exports);
const NoWick=moduleObject.exports;let calls=0;
const config={...loader.get('strategies.NoWickImbalance'),swingLookback:5,entryMode:'tap',stopLookbackBars:5};
const retained=new NoWick(config,()=>{calls++;return loader.get('strategies.NoWickImbalance.confidence');});
const standalone=new NoWick(config);retained._detectTrend=standalone._detectTrend=()=> 'uptrend';
const ctx={priceHistory:[...[101,102,103,104].map((c,i)=>({symbol:'TSLA',timeframe:'15m',o:c-.2,h:c+.5,l:c-.5,c,v:1000,t:`2026-06-12T14:0${i}:00Z`})),{symbol:'TSLA',timeframe:'15m',o:100.4,h:100.5,l:99.4,c:99.5,v:1000,t:'2026-06-12T14:05:00Z'}],indicators:{atr:1},extras:{symbol:'TSLA',timeframe:'15m'}};
function prepare(instance,twin=false){const levels=[{type:'bullish',level:100,formationCount:4,trend:'uptrend',timestamp:'2026-06-12T14:00:00Z'}];if(twin){levels[0].twinGroupId='proof-twin';levels.push({...levels[0],level:100.1,formationCount:3});}const state={candleCount:5,pendingLevels:levels,invalidatedLevels:[]};instance.scopedState.set('TSLA:15M',state);return state;}
let saves=0,rejections=0;const key='strategies.NoWickImbalance.confidence';
function save(value){const r=loader.getSettingsView().configuration;return loader.saveSettings({requestId:'nowick-'+saves++,expectedRevision:r.settings,expectedSettingsHash:r.settingsHash,changes:{[key]:value}});}
assert(loader.getSettingsView().fields[key]);
const outputs=[];for(const value of [0,0.25,1]){const state=prepare(retained,true),map=retained.scopedState;assert.equal(save(value).success,true);assert.strictEqual(retained.scopedState,map);assert.strictEqual(map.get('TSLA:15M'),state);assert.equal(state.pendingLevels.length,2);const before=calls,result=retained.evaluate(ctx);assert(result);assert.equal(calls-before,1);assert.equal(result.confidence,value);assert.equal(result.entryFanout.length,2);assert.deepEqual(result.entryFanout.map(x=>x.confidence),[value,value]);outputs.push(result.confidence);}
prepare(standalone);assert.equal(standalone.evaluate(ctx).confidence,config.confidence);
prepare(retained);const single=retained.evaluate(ctx);assert.equal(single.confidence,1);assert.deepEqual(single.entryFanout,[]);
for(const value of [-1,1.1,null,false,'',[],{},'0.2']){const old=disk,owner=loader.getCachedSnapshot();assert.equal(save(value).success,false);assert.equal(disk,old);assert.strictEqual(loader.getCachedSnapshot(),owner);rejections++;}
const valid=disk;for(const value of [-1,1.1,null,false,'','  ',[],{},undefined,'bad']){const candidate=JSON.parse(valid);candidate.strategies.NoWickImbalance.confidence=value;disk=JSON.stringify(candidate);const owner=loader.getCachedSnapshot();assert.equal(loader.load({force:true}).success,false);assert.strictEqual(loader.getCachedSnapshot(),owner);rejections++;}
const candidate=JSON.parse(valid);candidate.strategies.NoWickImbalance.confidence='0.6';disk=JSON.stringify(candidate);loader.load({force:true});prepare(retained,true);const refreshed=retained.evaluate(ctx);assert.equal(refreshed.confidence,.6);assert.deepEqual(refreshed.entryFanout.map(x=>x.confidence),[.6,.6]);
fs.writeFileSync(path.join(dir,'proof.json'),JSON.stringify({outputs,saves,rejections,providerCalls:calls,primaryAndTwin:true,staticInjectionPreserved:true,scopeStatePreservedAcrossSave:true,persistedOnlyInMemory:true,limits:'Actual candidate loader save/reload plus NoWick evaluate; seeded pending levels and fixed trend fixture. No full orchestrator/provider/broker/runtime run.'},null,2)+'\n');console.log('NoWick primary/twin confidence proof passed');
