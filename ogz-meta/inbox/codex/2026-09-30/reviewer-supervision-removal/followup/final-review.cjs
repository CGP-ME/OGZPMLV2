'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const packet=path.resolve(__dirname,'..'),root=path.resolve(packet,'../../../../..');
const source='be416a802443e2b27df69365c9a18e1123977047',harness='a5ecf975923c1c024ee98adf849016181dd6e482';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const priorPath=path.join(packet,'private/review-result.json'),priorBytes=fs.readFileSync(priorPath),previous=JSON.parse(priorBytes);
assert.equal(previous.runLedgerEntry.run_id,'2026-09-30T11-08-31-424Z-daca827939e7');
process.env.MERCURY_HARNESS_TREE=harness;
require('../../../2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs');
const cp=require('child_process'),bridge=path.join(root,'trai_brain/mercury-bridge');
const {captureGitReviewView,buildExplicitTargetCorpus}=require(path.join(bridge,'evidence-ingestion'));
const view=captureGitReviewView({repoRoot:root,ref:source,baseRef:'c080995a94d322a61950ee606d4f667c9dfe63c0',outputDir:path.join(__dirname,'private/final-source')});
const snapshot=view.sourceRoot;
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20e6});
const paths=previous.shardedReview.corpus.targets.map(t=>t.path);assert.equal(paths.length,6);
const corpus=buildExplicitTargetCorpus({targets:paths.map(file=>({path:file,status:'modified',sourceRef:source,sourceContent:fs.readFileSync(path.join(snapshot,file),'utf8'),diffRef:view.baseTree+'..'+source,diffContent:git(['diff','--no-ext-diff','--no-color',view.baseTree,source,'--',file])}))});
const artifacts=corpus.artifacts;
const reviewTargets=corpus.targets.map(target=>{const old=previous.shardedReview.claim_inventory.find(x=>x.target===target.path);assert(old);return {...target,claims:old.claims.map(claim=>({...claim,historical_source_ref:'5ca3c369188c3841c10593d8ece061f57f21886a',authority:'historical reviewer allegation; must be reverified against current selected source'})),source_evidence:[]};});
const latestResultPath=path.join(__dirname,'private/2026-09-30T12:29:51.817Z-focused-followup/result.json');
const latestBytes=fs.readFileSync(latestResultPath),latest=JSON.parse(latestBytes);
const latestRaw={source_ref:latest.identity.source,result_sha256:hash(latestBytes),mercury:latest.mercury.answer,fable:latest.fable.answer,kimi:latest.kimi.answer,parsedFable:latest.fable.parsed};
fs.writeFileSync(path.join(__dirname,'FINAL-PRIOR-RECEIPT.json'),JSON.stringify(latestRaw,null,2)+'\n');
const evidenceFiles=['CONSUMER-CLOSURE.md','CONSUMER-CLOSURE.json','../INGESTION-PROOF.json','../PANEL-INGESTION-PROOF.json','../tests/exact-result.log','../continuation/owner-proof.json','final-ingestion-proof.cjs','final-ingestion-proof.json','FINAL-PRIOR-RECEIPT.json'];
const evidenceDocuments=evidenceFiles.map(file=>{const full=path.resolve(__dirname,file),content=fs.readFileSync(full,'utf8');return {path:path.relative(root,full),sha256:hash(content),bytes:Buffer.byteLength(content),content};});
const evidenceSources=evidenceFiles.flatMap(file=>{const full=path.resolve(__dirname,file),text=fs.readFileSync(full,'utf8'),lines=text.split('\n'),chunks=[];for(let start=0;start<lines.length;start+=150){const excerpt=lines.slice(start,start+150).join('\n');chunks.push({path:path.relative(root,full),excerpt,artifact_sha256:hash(text),excerpt_sha256:hash(excerpt),artifact_bytes:Buffer.byteLength(text),excerpt_bytes:Buffer.byteLength(excerpt),line_start:start+1,line_end:Math.min(start+150,lines.length)});}return chunks;});
const sourceRanges={
 'evidence-ingestion':[[2280,2320],[2680,2751],[2758,2835]],
 'explicit-continuation':[[21,58],[106,127],[259,306]],
 'react-loop':[[94,145],[1125,1178]],
 'tool-adapter':[[679,715],[991,1024],[1890,1918]],
 'ask':[[747,754],[1288,1318],[1360,1402]],
 'reviewer-panel':[[190,239]],
 'run-ledger':[[535,565],[852,880],[978,1015]],
 'doctrine-review':[[88,120],[155,178],[225,245]]
};
const closure=JSON.parse(fs.readFileSync(path.join(__dirname,'CONSUMER-CLOSURE.json')));
const hostEvidenceSources=Object.entries(sourceRanges).flatMap(([name,ranges])=>{
 const file='trai_brain/mercury-bridge/'+name+'.js',full=fs.readFileSync(path.join(snapshot,file));
 // Closure is historical test evidence; current excerpt identity comes from the new immutable snapshot.
 const lines=full.toString('utf8').split('\n');
 return ranges.map(([start,end])=>{const excerpt=lines.slice(start-1,end).join('\n');return {path:file,source_ref:source,line_start:start,line_end:end,
 artifact_sha256:hash(full),artifact_bytes:full.length,excerpt_sha256:hash(excerpt),excerpt_bytes:Buffer.byteLength(excerpt),excerpt,authority:'immutable_selected_source_excerpt'};});
});
const completeDiffDocuments=artifacts.filter(a=>a.kind==='diff').map(a=>({path:'selected-diff://'+a.target,source_ref:source,base_ref:view.baseTree,sha256:hash(a.content),bytes:Buffer.byteLength(a.content),content:a.content}));
evidenceDocuments.push(...completeDiffDocuments);
for(const document of completeDiffDocuments){const lines=document.content.split('\n');for(let start=0;start<lines.length;start+=150){const excerpt=lines.slice(start,start+150).join('\n');hostEvidenceSources.push({path:document.path,source_ref:source,base_ref:view.baseTree,line_start:start+1,line_end:Math.min(start+150,lines.length),artifact_sha256:document.sha256,artifact_bytes:document.bytes,excerpt_sha256:hash(excerpt),excerpt_bytes:Buffer.byteLength(excerpt),excerpt,authority:'complete immutable selected change diff'});}}
const priorAnswers={latestFullTaskRun:latestRaw,mercury:previous.answer,mercuryRechecks:(previous.adversarialReview.rechecks||[]).map(r=>({rawAnswer:r.answer,recordedParsed:r.parsed,qualification:'Historical parsed metadata may be stale; raw needs_more_evidence answer is controlling testimony, not rewritten as found_break.'})),fable:previous.adversarialReview.answer,kimi:previous.reviewerPanel.seats.find(s=>s.id==='kimi')?.answer};
const originalQuery='Mercury, break my fix. Operator-requested outcome: the adversarial panel owns reviewer conclusions; remove host-mandated candidate submission, schema-compliance retries, and whole-file-read acceptance while preserving honest source/call/failure receipts, substantive panel-requested rechecks, and bounded request transport. Preserve TRAI, the actual reviewer panel, the pipeline, and operator restrictions. Attack the complete selected change against that task; delivery of an answer is not certification of its correctness.';
const operatorTask=['Trey: "the adversarial layer watches itself thats why its a layer that needs to go whatever that is and then all the rest of the stuff is my intended architecturew"',
 'Trey: "and make sure we arent leaving phantom calls or code or hanging stuff when it gets ripped out please"',
 'Trey: "maybe use blast radius"',
 'Trey: "we changed the enviornmment or somehting or it printed to a ddoc and then just read it insteaad of transporting ore somehting"'].join('\n');
const archivedObservation={...previous.shardedReview.continuation?.observation,
 supplemental_prior_seat_testimony:{authority:'historical reviewer testimony appended by followup driver',previousResultSha256:hash(priorBytes),rawAnswers:priorAnswers},
 supplemental_evidence_documents:{authority:'verbatim mechanical evidence documents, not source or semantic approval',documents:evidenceDocuments}};
const evidenceReceiptId='prior-review:'+hash(JSON.stringify(archivedObservation));
const query=[originalQuery,operatorTask,
 'The following is Fable\'s complete recheck question, quoted verbatim. Its old tree ID identifies the earlier finding; perform these checks against the current selected tree '+source+' and verify the three prompt-hunk correction:\n'+latest.fable.parsed.recheckPrompt,
 'Review source '+source+'. Harness '+harness+' is separately qualified transport/receipt implementation; its changes are not part of this selected removal diff. The inherited stale parsed-verdict issue is separately repaired in that harness, not silently claimed fixed in the selected source.',
 'Inherited sharded coverage, source corpus and failed-envelope records describe the earlier 5ca3c369 review. They remain historical receipts, not current read credit. The current selected corpus and this continuation\'s source delivery identify this review. Do not silently reinterpret historical failures as present failures or current approval.',
 'The complete original question above controls this review. Prior testimony and the complete evidence documents are stored verbatim, not summarized, in read_review_receipt receipt_id '+evidenceReceiptId+'. Its json_line_segments format reconstructs the original record by joining text segments by line and JSON.parse. The original six targets and all original claims remain in the continuation inventory. Read the evidence needed to attack this change; a missing receipt or unread document is not a finding against the code. Current source remains available through selected-tree source tools.',
 'Compared with the prior reviewed source5ca, the new selected source changes exactly three ingestion-prompt hunks removing the remaining mandatory candidate-format instructions. Preserve the previous real finding and verify its correction. Read COMPLETE captured diff receipts; git_diff tool summaries truncated at2000characters are not the complete diff. The complete new diffs are also in supplemental_evidence_documents.',
 'Document catalog:\n'+JSON.stringify(evidenceDocuments.map(({content,...entry})=>entry)),
 'Complete diff receipt catalog for read_review_receipt:\n'+JSON.stringify(artifacts.filter(a=>a.kind==='diff').map(a=>({target:a.target,receipt_id:'captured-diff:'+a.sha256,start_line:1,end_line:a.content.split('\n').length,sha256:a.sha256,bytes:a.bytes}))),
 'Prior Mercury, Fable and Kimi raw answers are in supplemental_prior_seat_testimony.rawAnswers in the same receipt. The earlier Kimi pass resolved agreement, not code approval. Resolve the panel challenges using the actual code and test evidence without replacing the original task with a claim-format exercise. Report the code verdict, evidence, findings and named limits.'].join('\n\n');
const prepared={source,harness,previousRun:previous.runLedgerEntry.run_id,previousResultSha256:hash(priorBytes),corpusSha256:corpus.corpus_sha256,artifacts:artifacts.map(a=>({id:a.artifact_id,sha256:a.sha256,bytes:a.bytes})),targets:reviewTargets.map(t=>({path:t.path,claims:t.claims.map(c=>c.claim_id)})),evidence:evidenceSources.map(({excerpt,...s})=>s),hostEvidence:hostEvidenceSources.map(({excerpt,...s})=>s),querySha256:hash(query),providerCalls:0,mode:process.argv.includes('--run')?'run_requested':'prepare_only'};
fs.writeFileSync(path.join(__dirname,'FINAL-PREPARED.json'),JSON.stringify(prepared,null,2)+'\n');

async function run(){
 process.env.MERCURY_HARNESS_TREE=harness;
 require('../../../2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs');
 const bridge=path.join(root,'trai_brain/mercury-bridge');
 const {runReviewRechecks,createProviderAudit}=require(path.join(bridge,'ask'));
 const {createExplicitContinuation}=require(path.join(bridge,'explicit-continuation'));
 const {createToolAdapter}=require(path.join(bridge,'tool-adapter'));
 const {createMercuryLlmClient}=require(path.join(bridge,'llm-client'));
 const {runFableAdversarialReview,runKimiFinalAdjudication}=require(path.join(bridge,'adversarial-review'));
 const {ensureReviewerAnswer}=require(path.join(bridge,'reviewer-panel'));
 const {writeRawProviderOutput}=require(path.join(bridge,'run-ledger'));
 const config=require(path.join(bridge,'config'));
 const toolAdapter=createToolAdapter({repoRoot:snapshot,gitRepoRoot:root,reviewSource:{tree:source,baseTree:view.baseTree},mongoStore:null});
 const archivedPrevious={...previous,shardedReview:{...previous.shardedReview,continuation:{...previous.shardedReview.continuation,observation:archivedObservation}}};
 const factory=completed=>createExplicitContinuation({corpus,reviewTargets,previous:{...archivedPrevious,continuationRechecks:[...(previous.adversarialReview.rechecks||[]),...completed]},maxRequestBytes:config.AGENTIC_EXPLICIT_REVIEW_REQUEST_MAX_BYTES,originalQuery,recheck:true});
 const contract=factory([]),schema=toolAdapter.buildToolSchema();schema.push(contract.receiptTool);
 const envelope=contract.prepare([{role:'system',content:config.AGENTIC_SYSTEM_PROMPT},{role:'user',content:query}],schema,{maxTokens:7750,toolChoice:'auto',temperature:config.MERCURY_LLM_TEMPERATURE},[]);
 prepared.envelope={queryBytes:Buffer.byteLength(query),originalQueryBytes:Buffer.byteLength(originalQuery),requestBytes:envelope.receipt?.request_bytes,error:envelope.error||null};
 const archived=contract.receipt().archived_fixed_records.find(record=>record.receipt_id===evidenceReceiptId);assert(archived);
 const recovered=[];for(let start=1;start<=archived.lines;start+=5){const response=contract.readReceipt({receipt_id:evidenceReceiptId,start_line:start,end_line:Math.min(start+4,archived.lines)});assert(!response.error);for(const line of response.text.split('\n'))recovered.push(JSON.parse(line.slice(line.indexOf('\t')+1)));}
 const reconstructedLines=[];for(const row of recovered){reconstructedLines[row.line-1]=(reconstructedLines[row.line-1]||'')+row.text;}
 const recoveredRecord=JSON.parse(reconstructedLines.join('\n'));assert.deepEqual(recoveredRecord,archivedObservation);
 assert(envelope.messages.some(message=>message.content.includes(originalQuery)));assert(envelope.messages.some(message=>message.content.includes(operatorTask)));
 prepared.deliveryProof={originalQuestion:originalQuery,operatorTask,questionPresentVerbatim:true,operatorTaskPresentVerbatim:true,evidenceReceiptId,receiptLines:archived.lines,allDocumentsByteExact:true,allPriorAnswersByteExact:true,documents:evidenceDocuments.map(({content,...entry})=>entry)};
 prepared.closureManifestSha256=hash(fs.readFileSync(path.join(__dirname,'CONSUMER-CLOSURE.json')));
 fs.writeFileSync(path.join(__dirname,'FINAL-PREPARED.json'),JSON.stringify(prepared,null,2)+'\n');
 assert(!envelope.error,'Offline actual-tool envelope preparation failed: '+envelope.error);
 if(!process.argv.includes('--run')){console.log(JSON.stringify({mode:'prepare_only',...prepared.envelope,providerCalls:0}));return;}
 const runId=new Date().toISOString()+'-final-focused-followup',out=path.join(__dirname,'private',runId);fs.mkdirSync(out,{recursive:true});
 const save=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
 const activeIdentity={...prepared,runId,rawRunId:runId,outputDirectory:out,receiptType:'focused_review_continuation_not_runAgentic_ledger'};save('identity',activeIdentity);fs.writeFileSync(path.join(__dirname,'FINAL-ACTIVE.json'),JSON.stringify(activeIdentity,null,2)+'\n');fs.writeFileSync(path.join(out,'prompt.txt'),query);
 const audit=stage=>createProviderAudit(stage,{repoRoot:root,rawRunId:runId});
 const persistRaw=(stage,attempt,bytes)=>writeRawProviderOutput({repoRoot:root,runId,stage,attempt,bytes});
 const rechecks=await runReviewRechecks({prompts:[query],client:createMercuryLlmClient({systemPrompt:config.AGENTIC_SYSTEM_PROMPT}),toolAdapter,maxIterations:null,maxTokens:7750,verbose:false,evidenceSources:[],createProviderAudit:audit,claimInventory:previous.candidateSet.claimInventory,
 explicitContinuationFactory:factory});
 save('mercury',rechecks);assert.equal(rechecks.rechecks.length,1,'Mercury answer absent; preserve failure receipt');
 const mercury=rechecks.rechecks[0];
 ensureReviewerAnswer(mercury,'mercury');
 const panelQuery=query+'\n\nAll prior raw reviewer answers (historical testimony):\n'+JSON.stringify(priorAnswers)+'\n\nVerbatim evidence for the panel seats:\n'+evidenceSources.map(s=>'Source: '+s.path+'\n'+s.excerpt).join('\n\n');
 const fable=await runFableAdversarialReview({query:panelQuery,mercuryResult:mercury,evidenceSources,hostEvidenceSources,persistRaw});save('fable',fable);
 const kimi=await runKimiFinalAdjudication({query:panelQuery,mercuryResult:mercury,review:{...fable,rechecks:[],recheckPrompts:[]},evidenceSources,hostEvidenceSources,persistRaw});save('kimi',kimi);
 const result={receipt_type:'focused_review_continuation_not_runAgentic_ledger',identity:activeIdentity,priorAnswers,mercury,fable,kimi};save('result',result);fs.appendFileSync(path.join(__dirname,'private','focused-results.jsonl'),JSON.stringify(result)+'\n');console.log(JSON.stringify({out,mercury:mercury.parsed?.verdict,fable:fable.parsed?.verdict,kimi:kimi.parsed?.verdict}));
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
