'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const packet=path.resolve(__dirname,'..'),root=path.resolve(packet,'../../../../..');
const source='5ca3c369188c3841c10593d8ece061f57f21886a',harness='a8cac1feb7018bdd358d929077ec8de19dbb6e98';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const priorPath=path.join(packet,'private/review-result.json'),priorBytes=fs.readFileSync(priorPath),previous=JSON.parse(priorBytes);
assert.equal(previous.runLedgerEntry.run_id,'2026-09-30T11-08-31-424Z-daca827939e7');
const snapshot=path.join(packet,'private/ledger/2026-09-30T10-59-09-861Z-1404789-9ee57055fae2/source-5L8VhU');
const bundle=previous.serenaBlastRadius.evidenceBundle;
const bytes=fs.readFileSync(path.join(root,bundle.path)),manifestBytes=fs.readFileSync(path.join(root,bundle.manifest_path));
assert.equal(hash(bytes),bundle.sha256);assert.equal(hash(manifestBytes),bundle.manifest_sha256);
const manifest=JSON.parse(manifestBytes),lines=bytes.toString('utf8').split('\n');
const artifacts=previous.shardedReview.corpus.artifacts.map(a=>{
 const s=manifest.sections.find(s=>s.kind===a.kind&&s.target===a.target);assert(s,'section '+a.artifact_id);
 const encoded=lines.slice(s.line_start-1,s.line_end).join('\n');assert.equal(hash(encoded),s.sha256);
 const content=s.content_encoding==='source_line_numbered'?encoded.split('\n').map((line,i,all)=>{if(i===all.length-1&&line==='')return '';const prefix=(i+1)+': ';assert(line.startsWith(prefix));return line.slice(prefix.length);}).join('\n'):encoded;
 assert.equal(hash(content),a.sha256);assert.equal(Buffer.byteLength(content),a.bytes);
 if(a.kind==='source'){assert.equal(a.source_ref,source);assert.equal(hash(fs.readFileSync(path.join(snapshot,a.target))),a.sha256);}
 return {...a,content};
});
const corpus={...previous.shardedReview.corpus,artifacts};
const reviewTargets=corpus.targets.map(target=>{const inventory=previous.shardedReview.claim_inventory.find(x=>x.target===target.path);assert(inventory);return {...target,claims:inventory.claims,source_evidence:inventory.source_evidence};});
assert.equal(reviewTargets.length,6);
const evidenceFiles=['CONSUMER-CLOSURE.md','CONSUMER-CLOSURE.json','../INGESTION-PROOF.json','../PANEL-INGESTION-PROOF.json','../tests/exact-result.log','../continuation/owner-proof.json'];
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
 assert.equal(hash(full),closure.files.find(f=>f.file===file).sha256);
 const lines=full.toString('utf8').split('\n');
 return ranges.map(([start,end])=>{const excerpt=lines.slice(start-1,end).join('\n');return {path:file,source_ref:source,line_start:start,line_end:end,
 artifact_sha256:hash(full),artifact_bytes:full.length,excerpt_sha256:hash(excerpt),excerpt_bytes:Buffer.byteLength(excerpt),excerpt,authority:'immutable_selected_source_excerpt'};});
});
const priorAnswers={mercury:previous.answer,mercuryRechecks:(previous.adversarialReview.rechecks||[]).map(r=>({rawAnswer:r.answer,recordedParsed:r.parsed,qualification:'Historical parsed metadata may be stale; raw needs_more_evidence answer is controlling testimony, not rewritten as found_break.'})),fable:previous.adversarialReview.answer,kimi:previous.reviewerPanel.seats.find(s=>s.id==='kimi')?.answer};
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
 'Review source '+source+'. Harness '+harness+' is separately qualified transport/receipt implementation; its changes are not part of this selected removal diff. The inherited stale parsed-verdict issue is separately repaired in that harness, not silently claimed fixed in the selected source.',
 'The complete original question above controls this review. Prior testimony and the complete evidence documents are stored verbatim, not summarized, in read_review_receipt receipt_id '+evidenceReceiptId+'. Its json_line_segments format reconstructs the original record by joining text segments by line and JSON.parse. The original six targets and all original claims remain in the continuation inventory. Read the evidence needed to attack this change; a missing receipt or unread document is not a finding against the code. Current source remains available through selected-tree source tools.',
 'Document catalog:\n'+JSON.stringify(evidenceDocuments.map(({content,...entry})=>entry)),
 'Prior Mercury, Fable and Kimi raw answers are in supplemental_prior_seat_testimony.rawAnswers in the same receipt. The earlier Kimi pass resolved agreement, not code approval. Resolve the panel challenges using the actual code and test evidence without replacing the original task with a claim-format exercise. Report the code verdict, evidence, findings and named limits.'].join('\n\n');
const prepared={source,harness,previousRun:previous.runLedgerEntry.run_id,previousResultSha256:hash(priorBytes),corpusSha256:corpus.corpus_sha256,artifacts:artifacts.map(a=>({id:a.artifact_id,sha256:a.sha256,bytes:a.bytes})),targets:reviewTargets.map(t=>({path:t.path,claims:t.claims.map(c=>c.claim_id)})),evidence:evidenceSources.map(({excerpt,...s})=>s),hostEvidence:hostEvidenceSources.map(({excerpt,...s})=>s),querySha256:hash(query),providerCalls:0,mode:process.argv.includes('--run')?'run_requested':'prepare_only'};
fs.writeFileSync(path.join(__dirname,'PREPARED.json'),JSON.stringify(prepared,null,2)+'\n');

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
 const toolAdapter=createToolAdapter({repoRoot:snapshot,gitRepoRoot:root,reviewSource:{tree:source,baseTree:'bd9f9c5312c37f4b466a8b61ad2f09f1e51a092c'},mongoStore:null});
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
 fs.writeFileSync(path.join(__dirname,'PREPARED.json'),JSON.stringify(prepared,null,2)+'\n');
 assert(!envelope.error,'Offline actual-tool envelope preparation failed: '+envelope.error);
 if(!process.argv.includes('--run')){console.log(JSON.stringify({mode:'prepare_only',...prepared.envelope,providerCalls:0}));return;}
 const runId=new Date().toISOString()+'-focused-followup',out=path.join(__dirname,'private',runId);fs.mkdirSync(out,{recursive:true});
 const save=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
 const activeIdentity={...prepared,runId,rawRunId:runId,outputDirectory:out,receiptType:'focused_review_continuation_not_runAgentic_ledger'};save('identity',activeIdentity);fs.writeFileSync(path.join(__dirname,'ACTIVE.json'),JSON.stringify(activeIdentity,null,2)+'\n');fs.writeFileSync(path.join(out,'prompt.txt'),query);
 const audit=stage=>createProviderAudit(stage,{repoRoot:root,rawRunId:runId});
 const persistRaw=(stage,attempt,bytes)=>writeRawProviderOutput({repoRoot:root,runId,stage,attempt,bytes});
 const rechecks=await runReviewRechecks({prompts:[query],client:createMercuryLlmClient({systemPrompt:config.AGENTIC_SYSTEM_PROMPT}),toolAdapter,maxIterations:null,maxTokens:7750,verbose:false,evidenceSources:[],createProviderAudit:audit,claimInventory:previous.candidateSet.claimInventory,
 explicitContinuationFactory:factory});
 save('mercury',rechecks);assert.equal(rechecks.rechecks.length,1,'Mercury answer absent; preserve failure receipt');
 const mercury=rechecks.rechecks[0];
 ensureReviewerAnswer(mercury,'mercury');
 const panelQuery=query+'\n\nVerbatim evidence for the panel seats:\n'+evidenceSources.map(s=>'Source: '+s.path+'\n'+s.excerpt).join('\n\n');
 const fable=await runFableAdversarialReview({query:panelQuery,mercuryResult:mercury,evidenceSources,hostEvidenceSources,persistRaw});save('fable',fable);
 const kimi=await runKimiFinalAdjudication({query:panelQuery,mercuryResult:mercury,review:{...fable,rechecks:[],recheckPrompts:[]},evidenceSources,hostEvidenceSources,persistRaw});save('kimi',kimi);
 const result={receipt_type:'focused_review_continuation_not_runAgentic_ledger',identity:activeIdentity,priorAnswers,mercury,fable,kimi};save('result',result);fs.appendFileSync(path.join(__dirname,'private','focused-results.jsonl'),JSON.stringify(result)+'\n');console.log(JSON.stringify({out,mercury:mercury.parsed?.verdict,fable:fable.parsed?.verdict,kimi:kimi.parsed?.verdict}));
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
