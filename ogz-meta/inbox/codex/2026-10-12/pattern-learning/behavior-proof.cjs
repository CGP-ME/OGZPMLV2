'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const cp = require('node:child_process');
const root = process.cwd();
const receiptPath = path.join(__dirname, 'source-receipt.json');
const candidate = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath)).candidate : null;
const source = file => candidate ? cp.execFileSync('git', ['show', `${candidate}:${file}`], {encoding:'utf8'}) : fs.readFileSync(file,'utf8');
// Only in this short-lived fixture process; no broker or server is imported.
for (const key of ['WEBSOCKET_AUTH_TOKEN','ALPACA_API_KEY','ALPACA_API_SECRET','KRAKEN_API_KEY','KRAKEN_API_SECRET']) process.env[key]='isolated-fixture-not-a-credential';
process.env.PROFILE='paper';
const actualLoad = Module._load;
const actualRead = fs.readFileSync;
const sourceFiles = new Set(['config/settings.json','config/internals.json']);
fs.readFileSync = function(file, ...args) {
  const relative = typeof file === 'string' ? path.relative(root, file) : '';
  if(candidate && sourceFiles.has(relative)) {
    const data = cp.execFileSync('git',['show',`${candidate}:${relative}`]);
    return typeof args[0] === 'string' || args[0]?.encoding ? data.toString() : data;
  }
  return actualRead.call(this,file,...args);
};
function compile(file) {
 const full=path.join(root,file), mod=new Module(full,module);mod.filename=full;mod.paths=Module._nodeModulePaths(path.dirname(full));mod._compile(source(file),full);return mod.exports;
}
const loader=compile('foundation/ConfigLoader.js');
const resolved=loader.load({silent:true,loadDotenv:false});
const canonical=resolved.config.patternMemory;
assert.equal(canonical.recentResultCount,100);
assert.equal(canonical.unweightedResultWeight,.1);
assert.equal(canonical.decayHalflifeDays,30);
const fields=loader.getSettingsView().fields;
for(const key of ['recentResultCount','unweightedResultWeight']) assert.equal(fields['patternMemory.'+key].value,canonical[key]);
for(const key of ['fastPathRecentResultCount','fastPathHistoricalWeight','fastPathRecentWeight']) assert.equal(fields['patternRecognition.'+key],undefined);
const runtime=structuredClone(resolved.config);
runtime.paths.dataDir=path.join(__dirname,'private','nonexistent-memory');
const memoryConfig={...canonical,persistToDisk:false};
Module._load=function(request,parent,isMain) {
 if(request==='../foundation/ConfigLoader' && parent?.filename===path.join(root,'core/UnifiedPatternMemory.js')) return {load:()=>({config:runtime}), getSection:()=>memoryConfig};
 return actualLoad.apply(this,arguments);
};
const {UnifiedPatternMemory}=compile('core/UnifiedPatternMemory.js');
const memory=new UnifiedPatternMemory();
const scope={symbol:'TSLA',brokerId:'alpaca',accountId:'fixture',accountIdSource:'config',assetClass:'stocks',executionMode:'paper',timeframe:'15m',scopeKey:'paper:alpaca:fixture:stocks:TSLA:15m'};
const features=[.51,.02,1,.03,.01,.5,.01,.02,0];
const nativeNow=Date.now;
const end=Date.UTC(2026,9,12);
let now=end;Date.now=()=>now;
const results=[];
for(let i=0;i<120;i++) {
 now=end-(119-i)*86400000;
 // Forty older wins, forty losses, forty recent wins: latest100 =60wins/40losses.
 const pnl=i<40||i>=80?1:-1;
 results.push({pnl,time:now});
 assert(memory.recordOutcome(features,{...scope,pnl,pnlPercent:pnl,holdTimeMs:1000,exitReason:'fixture-close',strategy:'fixture'}));
}
now=end;
const pattern=Object.values(memory.patterns)[0];
assert.equal(pattern.outcomes.length,100);
const retained=results.slice(-100);
const weighted=retained.map(x=>({weight:2**(-(end-x.time)/(30*86400000)),win:x.pnl>0}));
const decayed=weighted.reduce((s,x)=>s+(x.win?x.weight:0),0)/weighted.reduce((s,x)=>s+x.weight,0);
const expected=.9*decayed+.1*.6;
const exact=memory.getConfidence(features,scope);
assert(Math.abs(exact.confidence-expected)<1e-12);
assert.equal(memory.evaluatePattern(features,scope).confidence,exact.confidence);
assert.equal(pattern.status,expected>=canonical.successThreshold?'promoted':expected<canonical.failureThreshold?'quarantined':'neutral');
const fuzzy=memory.getConfidence(features.map((x,i)=>i===0?x+.2:x),scope);
assert(fuzzy && fuzzy.similarity>0 && fuzzy.similarity<1);
assert(Math.abs(fuzzy.confidence-(.5+(expected-.5)*fuzzy.similarity))<1e-12);
assert.equal(memory.getConfidence(features,{...scope,timeframe:'1h',scopeKey:'paper:alpaca:fixture:stocks:TSLA:1h'}),null);
const unknown=new UnifiedPatternMemory();assert.equal(unknown.getConfidence(features,scope),null);
// Configured zero smoothing is the original weighted calculation; one gives plain WR.
for(const [weight,target] of [[0,decayed],[1,.6]]) {
 const scratch={config:{...canonical,unweightedResultWeight:weight}};
 assert(Math.abs(UnifiedPatternMemory.prototype._applyDecay.call(scratch,pattern)-target)<1e-12);
}
// A smaller configured window affects reads immediately even for a larger saved history.
const smaller={config:{...canonical,recentResultCount:20}};
assert.equal(UnifiedPatternMemory.prototype._applyDecay.call(smaller,pattern),1);
// Historical 20-result banks remain usable; no padding or fabricated outcomes.
const oldBank={...pattern,outcomes:pattern.outcomes.slice(-20)};
assert.equal(memory._applyDecay(oldBank),1);
// Verify the shared score changes actual status at an unchanged threshold.
const crossing=new UnifiedPatternMemory();
for(let i=0;i<100;i++) {
 now=i<50?end-28*86400000:end;
 const pnl=i<50?-1:1;
 assert(crossing.recordOutcome(features,{...scope,pnl,pnlPercent:pnl,holdTimeMs:1000,exitReason:'fixture-close',strategy:'fixture'}));
}
now=end;
const crossingDecayed=1/(1+2**(-28/30));
const crossingBlended=.9*crossingDecayed+.1*.5;
assert(crossingDecayed>=canonical.successThreshold);
assert(crossingBlended<canonical.successThreshold);
assert.equal(Object.values(crossing.patterns)[0].status,'neutral');
assert(Math.abs(crossing.getConfidence(features,scope).confidence-crossingBlended)<1e-12);
Date.now=nativeNow;Module._load=actualLoad;fs.readFileSync=actualRead;
const receipt={passed:true,source:candidate||'WORKTREE',retainedOutcomes:pattern.outcomes.length,halfLifeDays:canonical.decayHalflifeDays,unweightedContribution:canonical.unweightedResultWeight,decayedScore:decayed,plainScore:.6,actualScore:exact.confidence,dtwSimilarity:fuzzy.similarity,statusThresholdCrossing:{decayed:crossingDecayed,smoothed:crossingBlended,status:Object.values(crossing.patterns)[0].status},status:pattern.status,checks:['canonical loader and UI fields','removed old field descriptors','120 actual writes retain100','exact evaluator','compatibility evaluator','non-unit DTW similarity scaling','status threshold crossing','scope isolation','unknown unchanged','weight0and1','smaller window on existing history','old20result bank'],productionWrites:0,brokerRequests:0,runtimeActivation:false};
fs.writeFileSync(path.join(__dirname,'behavior-proof.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
