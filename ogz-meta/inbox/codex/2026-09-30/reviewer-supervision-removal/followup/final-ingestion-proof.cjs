'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),Module=require('module'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../../../..'),tree='be416a802443e2b27df69365c9a18e1123977047';
const file='trai_brain/mercury-bridge/evidence-ingestion.js',filename=path.join(root,file);
const source=cp.execFileSync('git',['show',tree+':'+file],{cwd:root,encoding:'utf8',maxBuffer:10e6});
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(source,filename);const api=mod.exports;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const mapText='Mapper testimony: inspect the exposed size calculation; source confidence remains uncertain.';
const candidateText='Candidate testimony: the observed producer permits the invalid size; review its caller.';
const answer='VERDICT: found_break\ncore/probe.js:1-2 allows the invalid size. This is offline fixture testimony, not a repository finding.';
async function exercise({empty=false,failed=false}={}){
 const calls=[];
 const corpus=api.buildExplicitTargetCorpus({targets:[{path:'core/probe.js',status:'modified',sourceRef:'fixture-tree',sourceContent:'const amount = input;\nsubmit(amount);\n',diffContent:'@@ -1 +1 @@\n-const amount = 1;\n+const amount = input;'}]});
 const result=await api.runExplicitTargetReview({corpus,query:'Mercury, break my fix.',maxRequestBytes:98304,maxTokens:7750,maxCalls:null,verifySourceSnapshots:()=>[],client:{},call:async(_client,messages,...args)=>{
  const system=messages[0].content;
  const stage=system===api.MAP_SYSTEM_PROMPT?'map':system===api.CANDIDATE_SYSTEM_PROMPT?'candidate':system===api.REDUCE_SYSTEM_PROMPT?'reduce':system===api.FINAL_SYSTEM_PROMPT?'final':null;
  assert(stage,'unknown exported prompt');const record={stage,messages,args};calls.push(record);
  if(stage==='final'&&failed){record.error='fixture_provider_unavailable';throw new Error(record.error);}
  const response={role:'assistant',content:stage==='map'?mapText:stage==='candidate'?candidateText:empty?'':answer};record.response=response;return response;
 }});
 return {result,calls};
}
async function main(){
 const after=await exercise();assert.equal(after.result.termination,'answer_given');assert.equal(after.result.answer,answer);
 assert.deepEqual(after.calls.map(c=>c.stage),['map','candidate','final']);
 assert.equal(after.result.shardedReview.map[0].status,'malformed');assert.equal(after.result.shardedReview.map[0].raw_output,mapText);
 assert.equal(after.result.shardedReview.candidates[0].raw_output,candidateText);assert(after.result.candidateSet.content.includes(candidateText));
 const input=JSON.stringify(after.calls.at(-1).messages);assert(input.includes(candidateText));assert(input.includes(mapText));assert(input.includes('const amount = input;'));
 assert.equal(after.result.shardedReview.coverage.map_repair_attempts,0);assert.equal(after.result.shardedReview.coverage.complete,false);assert.equal(after.result.shardedReview.coverage.authorityReady,false);assert.equal(after.result.shardedReview.synthesis.status,'malformed');
 const failure=await exercise({failed:true});assert.equal(failure.result.termination,'synthesis_failed');assert.equal(failure.result.answer,'');assert.equal(failure.calls.length,3);assert.equal(failure.result.shardedReview.synthesis.error,'fixture_provider_unavailable');
 const blank=await exercise({empty:true});assert.equal(blank.result.termination,'synthesis_failed');assert.equal(blank.calls.length,3);
 assert.match(api.CANDIDATE_SYSTEM_PROMPT,/optional/i);
 const proof={tree,source:{file,sha256:hash(source),bytes:Buffer.byteLength(source)},mechanical_only:true,providerCalls:0,stageClassification:'exact equality with exported API prompt constants',cases:{malformed:after,providerFailure:failure,empty:blank},claims:{threeCallsEach:true,noFormatRetries:true,rawAnswerPreserved:true,optionalCandidateInstruction:true,sourceAndTestimonyDelivered:true,diagnosticsPreserved:true},limitations:['Fake provider responses, real runExplicitTargetReview; no live provider semantic adjudication','No baseline rerun; historical baseline proof retained unchanged']};
 fs.writeFileSync(path.join(__dirname,'final-ingestion-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({tree,sourceSha256:proof.source.sha256,cases:3,callsPerCase:3,providerCalls:0,result:'PASS'}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
