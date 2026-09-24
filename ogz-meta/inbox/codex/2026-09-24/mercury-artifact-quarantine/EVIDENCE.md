# Controlled boundary observations

After-source SHA-256: 2139e51d27accbce6a80dded885eb0abad4d8e9ea5fc787707c9d8ce48621921. Exact command below uses the actual coordinator, real current-change read-only scan, real existing artifact for the success case, and synthetic reviewer responses. All providers, database writes, notifications and run-ledger writes are intercepted. No product or model-compliance proof is claimed.

Observed 2026-09-24T04:39:17.882Z: both injected EACCES cases reached all three seats; their literal scan_artifact_unavailable quarantine and EACCES remained in the ledger; all seats retained pre_answer_scan_absent and evidenceChecksPassed=false. Successful reused-bundle delivery retained 32 excerpts per secondary seat and no artifact quarantine. Full output: BOUNDARY-OBSERVATIONS.json.

Before correction, the same actual-coordinator writer boundary at source hash 713aa134c6c55c87cf05b61062f01ac3bae442ee6d2a25647606522ce099d62e propagated EACCES: writerCalls=1, reviewerCalls=0, verdict=tool_failure. This is an injected failure, not a reported real disk incident. Syntax and scoped diff-whitespace checks passed; neither is runtime acceptance.

```bash
node <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),Module=require('module');
require('./trai_brain/mercury-bridge/indexer');
const root=process.cwd(),target='trai_brain/mercury-bridge/ask.js';
const ledger=require('./trai_brain/mercury-bridge/run-ledger'),adv=require('./trai_brain/mercury-bridge/adversarial-review'),react=require('./trai_brain/mercury-bridge/react-loop');
const lines=fs.readFileSync('ogz-meta/inbox/codex/2026-09-24/mercury-full-chain/candidate-comparison/ledger/2026-09-24.jsonl','utf8').trim().split('\n').map(JSON.parse);
const bundle=lines.findLast(r=>r.receipt_type==='bridge_run').source_refs.current_change_evidence_bundle;
class NoDatabase {constructor(){this.stats={find:()=>({sort:()=>({limit:()=>({toArray:async()=>[]})})})};}async connect(){}async disconnect(){}async healthCheck(){return {ok:true,chunkCount:1};}}
async function observe(mode) {
 let captured,writerCalls=0,readCalls=0,notified=[],seats=[],delivered=[],stderr=[],sources=[];
 const issue=Object.assign(new Error('INJECTED: evidence artifact filesystem denied'),{code:'EACCES'});
 const filename=path.join(root,target),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));const req=m.require.bind(m);
 const fakeAnswer='VERDICT: cannot_verify\nWHAT I DID: synthetic coordinator observation only\nWHAT I DID NOT DO: provider investigation\nWHAT I ASSUMED: no product acceptance';
 const overrides={
  fs:{...fs,readFileSync:(p,...args)=>{if(String(p)===path.join(root,bundle.path)){readCalls++;if(mode==='read_failure')throw issue;}return fs.readFileSync(p,...args);}},
  './mongo-store':NoDatabase,
  './trace-memory':{ensureTraceIndexes:async()=>{},evictStaleTraces:async()=>{},retrieveSimilarTrace:async()=>null,captureTrace:async()=>({captured:false,reason:'intercepted'})},
  './run-ledger':{...ledger,writeCurrentChangeEvidenceBundle:()=>{writerCalls++;if(mode==='write_failure')throw issue;return bundle;},writeRunLedgerEntry:({entry})=>{captured=entry;return {path:'in-memory-observation-only'};}},
  './llm-client':{createMercuryLlmClient:()=>({initialize:async()=>{}})},
  './react-loop':{...react,runReactLoop:async p=>{seats.push('mercury');delivered.push(p.blastRadius.includes('scan_artifact_unavailable'));return {answer:fakeAnswer,termination:'answer_given',iterations:0,history:[],toolTelemetry:{byTool:{},filesOpened:[],runChecks:[]},providerAttempts:[],answerQuality:{flags:[]}};}},
  './adversarial-review':{...adv,notifyReviewQuarantines:async q=>{notified.push(...q||[]);return(q||[]).map(v=>({...v,ntfy:{status:'intercepted'}}));},sendMaxPriorityNtfy:async()=>({status:'intercepted'}),runFableAdversarialReview:async p=>{seats.push('fable');sources.push(p.hostEvidenceSources.length);return {ok:true,answer:fakeAnswer,parsed:{verdict:'pass'},attempts:[],quarantines:[]};},runKimiFinalAdjudication:async p=>{seats.push('kimi');sources.push(p.hostEvidenceSources.length);return {ok:true,answer:fakeAnswer,parsed:{verdict:'agree'},attempts:[],quarantines:[]};}}
 };
 m.require=n=>Object.hasOwn(overrides,n)?overrides[n]:req(n);m._compile(fs.readFileSync(filename,'utf8'),filename);
 const old=console.error; console.error=(...x)=>stderr.push(x.join(' '));let result,error;
 try{result=await m.exports.runAgentic('Mercury, break my fix.',{quiet:true,topK:0,maxTokens:7750,reviewersExplicit:true,reviewers:['mercury','fable','kimi']});}catch(e){error={name:e.name,message:e.message};}finally{console.error=old;}
 return {mode,writerCalls,readCalls,seats,error:error||null,artifactAbsenceDelivered:delivered,hostExcerptCounts:sources,artifactQuarantines:notified.filter(q=>q.unit==='evidence_artifact'),ledgerQuarantines:captured?.review_quarantines?.filter(q=>q.unit==='evidence_artifact'),ledgerVerdict:captured?.verdict,seatAbsences:result?.reviewerPanel.seats.map(s=>({id:s.id,status:s.status,absence:s.doctrineReview?.namedAbsences,qualified:s.evidenceChecksPassed})),stderr,providerCalls:0,databaseWrites:0,notificationsSent:0};
}
(async()=>{const outcomes=[];for(const mode of ['write_failure','read_failure','existing_bundle_delivery'])outcomes.push(await observe(mode));console.log(JSON.stringify({at:new Date().toISOString(),sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),kind:'constructed coordinator boundary observations; synthetic reviewers, no provider or bot acceptance',outcomes},null,2));})().catch(e=>{console.error(e.message);process.exitCode=1;});
NODE
```

WHAT I DID: repair and directly observe two external artifact boundaries in the existing coordinator.
WHAT I DID NOT DO: invoke a provider with this repaired source, simulate a bot boot, prove exhaustive review, or close Stop 1.
WHAT I ASSUMED: intercepted synthetic seats establish coordinator continuation only.
