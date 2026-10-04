'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),Module=require('module');
const root=path.resolve(__dirname,'../../../../..'),loaderPath=path.join(root,'foundation/ConfigLoader.js');
Object.assign(process.env,{PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'CHANGE_ME_IN_PRODUCTION',ALPACA_API_KEY:'CHANGE_ME_IN_PRODUCTION',ALPACA_API_SECRET:'CHANGE_ME_IN_PRODUCTION'});
const settingsPath=path.join(root,'config/settings.json');let disk=fs.readFileSync(settingsPath,'utf8');
const realRequire=Module.createRequire(loaderPath),fakeFs=Object.create(fs);
fakeFs.readFileSync=(file,...args)=>path.resolve(String(file))===settingsPath?disk:fs.readFileSync(file,...args);
const lm={exports:{}};const quiet={log(){},warn(){},error(){}};
vm.runInThisContext('(function(require,module,exports,__filename,__dirname,console){'+fs.readFileSync(path.join(__dirname,'loader-candidate.js'),'utf8')+'\n})',{filename:loaderPath})(id=>id==='fs'?fakeFs:id==='../core/AtomicWrite'?{writeJsonAtomic(file,value){assert.equal(file,settingsPath);disk=JSON.stringify(value);}}:realRequire(id),lm,lm.exports,loaderPath,path.dirname(loaderPath),quiet);
const loader=lm.exports;loader.load({loadDotenv:false,silent:true});
require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
function install(local,production){const filename=path.join(root,production),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=m;m._compile(fs.readFileSync(path.join(__dirname,local),'utf8'),filename);return m.exports;}
for(const name of ['EMASMACrossoverSignal','MADynamicSR','BreakAndRetest','SmartMoneySweep','NoWickImbalance','OpeningRangeBreakout','LiquiditySweepDetector'])install(name+'-candidate.js','modules/'+name+'.js');
install('integration-candidate.js','core/OgzTpoIntegration.js');
const {StrategyOrchestrator}=install('orchestrator-candidate.js','core/StrategyOrchestrator.js');
const original={...console};for(const key of ['log','warn','error'])console[key]=()=>{};
const orch=new StrategyOrchestrator({mtfBaseTimeframe:'1m'});
const map={RSI:'RSI',MADynamicSR:'MADynamicSR',EMACrossover:'EMASMACrossover',LiquiditySweep:'LiquiditySweep',CandlePattern:'CandlePattern',BreakRetest:'BreakRetest',MarketRegime:'MarketRegime',OGZTPO:'OGZTPO',OpeningRangeBreakout:'OpeningRangeBreakout',SmartMoneySweep:'SmartMoneySweep',NoWickImbalance:'NoWickImbalance',DonchianBreakout:'DonchianBreakout',PropSafeEMAPullback:'PropSafeEMAPullback',EMATrendRetest:'EMATrendRetest',RSI2MeanReversion:'RSI2MeanReversion',TimeSeriesMomentum:'TimeSeriesMomentum'};
let saves=0;
function setAll(on){const view=loader.getSettingsView();const changes=Object.fromEntries(Object.keys(map).map(suffix=>['pipeline.enable'+suffix,on]));const r=loader.saveSettings({requestId:'dispatch-'+saves++,expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes});assert.equal(r.applied,true);}
setAll(false);
const tapes=new Map([['AAA',[]],['BBB',[]]]);
let held=0;
for(let i=0;i<300;i++)for(const [symbol,history]of tapes){const price=100+(symbol==='BBB'?30:0)+Math.sin(i/8)*5+i*.01;history.push({symbol,timeframe:'1m',t:Date.UTC(2026,9,1,12)+i*60000,o:price-.2,h:price+.8,l:price-.8,c:price,v:100});const decision=orch.evaluate({atr:2},[],null,history,{symbol,timeframe:'1m'});assert.equal(decision.action,'HOLD');held++;}
assert.equal(orch.strategies.length,0);
const modules=orch.symbolStrategyModules;
const tpo=modules.get('OGZTPO');assert.equal(tpo.size,2);const a=tpo.get('AAA'),b=tpo.get('BBB');assert.notStrictEqual(a,b);assert.equal(a.lastBarTimestamp,tapes.get('AAA').at(-1).t);assert.equal(b.lastBarTimestamp,tapes.get('BBB').at(-1).t);assert.deepEqual(a.getVotes(),[]);assert.deepEqual(b.getVotes(),[]);
assert.equal(a.stats.newTpoSignals,0);assert.equal(b.stats.newTpoSignals,0);
for(const scoped of modules.get('OpeningRangeBreakout').values())assert.equal(scoped.pendingSignal,null);
for(const scoped of modules.get('LiquiditySweep').values())assert.equal(scoped.stats.signalsGenerated,0);
for(const scoped of modules.get('BreakRetest').values())assert.ok(scoped.signalLog.every(item=>!item.type.startsWith('ENTRY_')));
setAll(true);
for(const [symbol,history]of tapes){const last=history.at(-1);history.push({...last,t:last.t+60000});orch.evaluate({atr:2},[],null,history,{symbol,timeframe:'1m'});}
assert.strictEqual(modules.get('OGZTPO').get('AAA'),a);assert.strictEqual(modules.get('OGZTPO').get('BBB'),b);
assert.equal(a.config.enabled,true);assert.equal(b.config.enabled,true);
assert.equal(a.lastBarTimestamp,tapes.get('AAA').at(-1).t);
Object.assign(console,original);
const receipt={heldDisabledEvaluations:held,retainedRegistrations:orch.registeredStrategies.length,retainedSymbolModules:[...modules.keys()],twoSymbolTpo:true,reenabledSameObjects:true,configWritesOnlyInMemory:true,limits:'Actual full orchestrator with synthetic candles and in-memory ConfigLoader save; no broker/PM2 or exhaustive strategy pattern coverage.'};
fs.writeFileSync(path.join(__dirname,'dispatch-behavior.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
