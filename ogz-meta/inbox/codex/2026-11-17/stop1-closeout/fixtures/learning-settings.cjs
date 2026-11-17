'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.PROFILE='paper';
for(const key of ['KRAKEN_API_KEY','KRAKEN_API_SECRET','ALPACA_API_KEY','ALPACA_API_SECRET','WEBSOCKET_AUTH_TOKEN'])process.env[key]='synthetic-stop1-fixture';
const root=process.cwd(),loader=require(path.join(root,'foundation/ConfigLoader'));
loader.load({role:'bot',loadDotenv:false,silent:true});
const {EnhancedPatternChecker}=require(path.join(root,'core/EnhancedPatternRecognition'));
const {UnifiedPatternMemory}=require(path.join(root,'core/UnifiedPatternMemory'));
const checker=new EnhancedPatternChecker(),memory=checker.memory;
const WebSocketManager=require(path.join(root,'core/WebSocketManager'));
// Execute the runner's actual settings-application callback without starting a bot.
const runner=fs.readFileSync(path.join(root,'run-empire-v2.js'),'utf8');
const ast=require('@babel/parser').parse(runner,{sourceType:'unambiguous'});
let callback;
function visit(node){if(!node||typeof node!=='object')return;if(node.type==='AssignmentExpression'&&node.left?.object?.type==='ThisExpression'&&node.left.property?.name==='onSettingsApplied')callback=runner.slice(node.right.start,node.right.end);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
visit(ast);assert.ok(callback);
const sent=[],ctx={patternChecker:checker,dashboardWs:{readyState:1,send(raw){sent.push(JSON.parse(raw));}}};
ctx.onSettingsApplied=vm.runInNewContext('(function(){return '+callback+';}).call(bot)',{bot:ctx,ConfigLoader:loader,resolvedConfig:loader.getCachedSnapshot(),runtimeAuditSink:{bindConfiguration(){},setSourceReceiptId(){}},logRuntimeConfigProof(){},console});
let sequence=0;
function save(changes){const {revisions}=loader.getCachedSnapshot();const result=WebSocketManager.prototype.handleSettings.call({ctx},{type:'save_settings',requestId:`learning-${++sequence}`,expectedRevision:revisions.settings,expectedSettingsHash:revisions.settingsHash,changes});assert.equal(result.success,true,result.reason);return result.configuration;}
const scope={brokerId:'kraken',accountId:'synthetic-account',assetClass:'crypto',executionMode:'paper',symbol:'BTC-USD',timeframe:'1h'};
const features=[0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9],second=features.map(x=>1-x);
(async()=>{
 const signature=memory.recordObservation(features,scope);assert.ok(signature);
 assert.equal(memory.recordOutcome(features,{...scope,pnl:2,pnlPercent:1,holdTimeMs:60000,exitReason:'take_profit',strategy:'synthetic'}),true);
 const before=memory.getConfidence(features,scope);
 const configuration=save({'patternMemory.minSamples':1,'patternMemory.successThreshold':0.6,
  'patternMemory.failureThreshold':0.2,'patternMemory.decayHalflifeDays':100,
  'patternRecognition.fastPathNewPatternConfidence':0.37,'patternRecognition.decayRate':0,
  'patternRecognition.minimumDecayMultiplier':0.8,'features.enableLearning':true});
 const after=memory.getConfidence(features,scope);assert.equal(after.source,'learned_success');
 assert.equal(checker.evaluatePattern(second,{...scope,fastPath:true}).confidence,0.37);
 const TraiCore=require(path.join(root,'core/trai_core'));const core=Object.create(TraiCore.prototype);
 assert.equal(core.patternMemory,memory);
 save({'features.enableLearning':false});assert.equal(core.patternMemory,null);
 save({'features.enableLearning':true});assert.equal(core.patternMemory,memory);
 assert.equal(memory.save().success,true);const diskBefore=fs.readFileSync(memory.storagePath,'utf8');
 save({'patternMemory.persistToDisk':false});assert.equal(memory._saveTimer,null);
 const secondSignature=memory.recordObservation(second,scope);assert.ok(secondSignature);
 assert.equal(memory.save().skipped,true);assert.equal(fs.readFileSync(memory.storagePath,'utf8'),diskBefore);
 const restoredWhileDisabled=new UnifiedPatternMemory();
 assert.ok(restoredWhileDisabled.patterns[signature]);assert.equal(restoredWhileDisabled._saveTimer,null);
 assert.equal(fs.readFileSync(memory.storagePath,'utf8'),diskBefore);
 await restoredWhileDisabled.cleanup();
 save({'patternMemory.persistToDisk':true,'patternMemory.saveIntervalMs':20});
 const timer=memory._saveTimer;assert.ok(timer);
 save({'patternRecognition.fastPathNewPatternConfidence':0.38});assert.equal(memory._saveTimer,timer);
 await new Promise(resolve=>setTimeout(resolve,65));
 const persisted=JSON.parse(fs.readFileSync(memory.storagePath,'utf8'));
 assert.ok(persisted.patterns[signature]);assert.ok(persisted.patterns[secondSignature]);
 assert.equal(persisted.patterns[signature].wins,1);
 await memory.cleanup();
 console.log('STOP1_LEARNING_RECEIPT',JSON.stringify({configuration,before:before.source,after:after.source,retainedMemory:true,newPatternConfidence:0.37,learningTogglePreservesBank:true,persistenceTogglePreservesSavedAndNewPatterns:true,disabledStartupReadsWithoutWriting:true,timerActuallySaved:true,unrelatedSavePreservesTimer:true,settingsReceipts:sent.length,callback:'actual runner callback via AST; audit logging seams',runtimeActivated:false}));
})().catch(async error=>{console.error(error);await memory.cleanup();process.exitCode=1;});
