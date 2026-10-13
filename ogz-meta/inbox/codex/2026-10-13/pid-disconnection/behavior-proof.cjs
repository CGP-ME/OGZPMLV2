'use strict';
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../../../../..');
const candidate=process.argv.find(a=>a.startsWith('--candidate-ref='))?.split('=')[1];
assert(candidate,'Pass immutable --candidate-ref');
const base='23b199486aa7d5a77da3ddc340417a0bad4f9696';
const read=(ref,file)=>cp.execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8'});
const executor=read(candidate,'core/OrderExecutor.js'),orchestrator=read(candidate,'core/StrategyOrchestrator.js');
const baselineExecutor=read(base,'core/OrderExecutor.js'),baselineOrchestrator=read(base,'core/StrategyOrchestrator.js');
const slice=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
let accesses=0;
const pid=()=>{accesses++;return {getPositionMultiplier:()=>2,getRegimeBoostAdjustment:()=>2,getTrailMultiplier:()=>2};};
const config={get(key){return {'features.enableDynamicSizing':true,'positionSizing.basePositionSize':0.02}[key];}};
function size(source,isEntryAction=true){
 const code=slice(source,"    const dynamicSizingEnabled =",'    // FIX 2026-03-06: ENFORCE MAX_POSITION_SIZE');
 return new Function('ConfigLoader','isEntryAction','tradeConfidence','basePositionPercent','getPIDController',code+'\nreturn basePositionPercent;')(config,isEntryAction,0.75,0.02,pid);
}
assert.equal(size(baselineExecutor),0.06);assert.equal(accesses,1);
accesses=0;assert.equal(size(executor),0.03);assert.equal(accesses,0);
assert.equal(size(executor,false),0.02);assert.equal(accesses,0);
function ranking(source){
 const code=slice(source,'    if (Object.keys(boosts).length > 0 && results.length > 0)', '    // ─── Step 2.6:');
 const recordCode=slice(source,'function recordRankingScoreChange(', '\nfunction getMtfConfluenceStats(');
 const record=new Function('assertRankingScore','addDecisionContributor',recordCode+'\nreturn recordRankingScoreChange;')((value)=>{assert(Number.isFinite(value)&&value>=0);return value;},(result,contributor)=>result.contributors.push(contributor));
 const results=[{strategyName:'TimeSeriesMomentum',rankingScore:0.5,contributors:[]}];
 new Function('boosts','results','recordRankingScoreChange','getPIDController','regimeType','rawRegime','regimeConfidence','regimePositionMultiplier',code)({TimeSeriesMomentum:1.2},results,record,pid,'trending','trending',0.8,1);
 return results[0];
}
accesses=0;assert.equal(ranking(baselineOrchestrator).rankingScore,1.2);assert.equal(accesses,1);
accesses=0;const result=ranking(orchestrator);assert.equal(result.rankingScore,0.6);assert.equal(accesses,0);assert.deepEqual(result.contributors.map(x=>x.name),['regime_boost']);
const contract={trailType:'atr',trailAtrMult:3,profitManagement:{trail:{enabled:true}}};
const entry=slice(executor,'    const entryStrategy = orchResult.winnerStrategy;','    const frozenExitPolicy =');
const returned=new Function('orchResult','assertExplicitExitOwnership','getPIDController',entry+'\nreturn exitContract;')({winnerStrategy:'TimeSeriesMomentum',sizingMultiplier:1,exitContract:contract},()=>{},pid);
assert.strictEqual(returned,contract);assert.equal(returned.trailAtrMult,3);assert.equal(accesses,0);
for(const [name,source] of [['executor',executor],['orchestrator',orchestrator]]){
 assert(!/getPIDController|require\([^\n]*PIDController|pidPositionMultiplier|pidRegimeMultiplier/.test(source),name+' retains a PID hookup');
}
assert.equal(read(candidate,'core/PIDController.js'),read(base,'core/PIDController.js'));
assert.deepEqual(JSON.parse(read(candidate,'config/settings.json')).pid,JSON.parse(read(base,'config/settings.json')).pid);
const files=cp.execFileSync('git',['ls-tree','-r','--name-only',candidate],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>/^(core|modules|foundation|brokers)\/.*\.js$/.test(f)||/^run-.*\.js$/.test(f));
const consumers=[];
for(const file of files){if(file==='core/PIDController.js')continue;const src=read(candidate,file);if(/getPIDController|require\([^\n]*PIDController|new PIDController/.test(src))consumers.push(file);}
assert.deepEqual(consumers,[]);
console.log(JSON.stringify({pass:true,candidate,checks:['baseline PID changes sizing and regime rank','disconnected sizing preserves confidence multiplier','configured regime boost preserved without PID adjustment','ATR contract unchanged','no long/short PID feedback or runtime module consumers','controller and PID settings preserved byte-for-byte/value-for-value'],runtimeFilesScanned:files.length,limits:['actual sizing/ranking/entry excerpts; full order and close paths not executed'],brokerCalls:0,runtimeActivation:false}));
