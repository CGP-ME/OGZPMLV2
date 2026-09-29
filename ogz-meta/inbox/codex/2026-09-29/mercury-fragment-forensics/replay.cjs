const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const root = cp.execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding:'utf8'}).trim();
const api = require(path.join(root, 'trai_brain/mercury-bridge/evidence-ingestion.js'));
const parser = require('@babel/parser');
const target = 'trai_brain/mercury-bridge/evidence-ingestion.js';
const historicalTree = 'f93161d39f016be57591dfda72101c3ed5c8da59';
// Same source blob, reachable through the pushed repair commit; no orphan tree dependency.
const tree = '6bcfad8a25f72cb9e1eb946e854695913b2133c4';
const source = cp.execFileSync('git', ['show', `${tree}:${target}`], {encoding:'utf8'});
const baseline = 'e6d80e0a';
const diff = cp.execFileSync('git', ['diff', baseline, tree, '--', target], {encoding:'utf8'});
const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'recorded-allegation.json')));
const recorded = original.record;
assert(recorded);
assert.equal(source.split('\n')[462].trim(), 'let stat = null;');
const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
assert.equal(sourceHash, original.source_sha256);
const ast = parser.parse(source, {sourceType:'unambiguous'});
const fn = ast.program.body.find(n=>n.type==='FunctionDeclaration' && n.id.name==='collectExplicitTargetCorpus');
assert(fn);
const scope = {file:target, name:fn.id.name, line:fn.loc.start.line, endLine:fn.loc.end.line};
const fixtureRoot = path.join(__dirname, 'fixtures', 'candidate-root');
const fixtureSource = path.join(fixtureRoot, target);
fs.mkdirSync(path.dirname(fixtureSource), {recursive:true});
fs.writeFileSync(fixtureSource, source);
const matched = require(path.join(root, 'tools/serena-symbol-scanner.js')).scanRepo(fixtureRoot);
assert.equal(matched.errors.length, 0);
assert(matched.fileReceipts.some(r=>r.file===target && r.source_sha256===sourceHash));
assert(matched.functionScopes.some(s=>s.file===target && s.name===scope.name && s.line===scope.line && s.endLine===scope.endLine));
const mismatched = {...matched, fileReceipts:[{...matched.fileReceipts[0], source_sha256:'0'.repeat(64)}]};
const corpus = api.buildExplicitTargetCorpus({targets:[{path:target,status:'current',sourceRef:tree,sourceContent:source,diffContent:diff}],isPolicyExcluded:()=>false});
const requiredTarget = {...corpus.targets[0], source_coverage_complete:true,diff_coverage_complete:true,accepted_source_ranges:[{line_start:1,line_end:source.split('\n').length}]};
const record = {...recorded,claims:[{statement:recorded.summary,citations:recorded.citations}]};
const mapReceipt = {unit_records:[record],accepted_unit_ids:[record.unit_id],raw_output_sha256:'fixture-original-allegation',shard_id:'fixture-recorded-shard15'};
function binding(context) {return api.bindCandidateClaims([requiredTarget],[mapReceipt],corpus,context)[0];}
function candidateRecord(bound, disposition, evidenceCitation) {
 return {target,disposition:disposition==='supported'?'finding':'examined_no_finding',summary:'Fixture only: candidate adjudication transport probe.',adjudications:[{claim_id:bound.claims[0].claim_id,disposition,reason:'Fixture probe of structural acceptance; this sentence is not semantic proof.',evidence:[{citation:evidenceCitation}]}]};
}
const qualified = binding(matched);
assert(qualified.source_evidence.some(e=>e.line_start===scope.line && e.line_end===scope.endLine && e.content.includes('let stat = null;')));
const fallbackCases=[];
for(const [name,context] of [['missing',null],['mismatched',mismatched]]) {
 const bound = binding(context);
 assert.equal(bound.source_evidence.length,1);
 assert.equal(bound.source_evidence[0].content,source);
 assert.equal(bound.source_evidence[0].context_basis,'accepted_source_without_attested_enclosing_scope');
 fallbackCases.push({case:name,full_accepted_source_delivered:true,context_basis:bound.source_evidence[0].context_basis});
}
(async()=>{
 const runs=[];
 for(const [caseName,syntaxContext,maxRequestBytes] of [['matching',matched,98304],['missing',null,1000000],['mismatched',mismatched,1000000],['fallback_over_limit',null,98304]]) {
 const seen=[];
 const result=await api.runExplicitTargetReview({corpus,syntaxContext,query:'Offline historical allegation transport regression.',maxRequestBytes,maxTokens:7750,call:async(_client,messages,tools,options)=>{
  assert(api.providerRequestBytes(messages,tools,options)<=maxRequestBytes,'oversized request dispatched');
  const payload=JSON.parse(messages[1].content);
  const texts=messages.map(m=>m.content).join('\n');
  if(payload.task==='map_explicit_review_evidence') return {role:'assistant',content:payload.units.map(u=>JSON.stringify({unit_id:u.unit_id,target:u.target,disposition:u.kind==='diff'?'finding':'examined_no_finding',summary:u.kind==='diff'?recorded.summary:'Fixture: no additional claim.',claims:u.kind==='diff'?[{statement:recorded.summary,citations:recorded.citations}]:[]})).join('\n')};
  const bound=payload.leaf_manifest.targets[0];
  seen.push({task:payload.task,whole_function_delivered:texts.includes('434: function collectExplicitTargetCorpus({') && texts.includes('463:     let stat = null;') && texts.includes('479:       if (selected && !stat)'),source_start_delivered:texts.includes('function collectExplicitTargetCorpus({'),declaration_delivered:texts.includes('let stat = null;'),source_message_count:messages.filter(m=>m.content.startsWith('INERT CAPTURED SOURCE')).length});
  const adjudication={claim_id:bound.claims[0].claim_id,disposition:'refuted',reason:'The declaration at463 and assignment at465 precede use479 in the same containing function.',evidence:[{citation:`${target}:463-479`}]};
  if(payload.task==='file_explicit_target_candidate_set') return {role:'assistant',content:JSON.stringify({target,disposition:'examined_no_finding',summary:'Recorded stat allegation is refuted by the same-scope declaration.',adjudications:[adjudication]})};
  if(payload.task==='decide_explicit_target_review') return {role:'assistant',content:JSON.stringify({record_type:'final_decision',decision:'no_break_found',summary:'Historical allegation refuted.',answer:'VERDICT: no_break_found\nThe supplied declaration precedes the use.',citations:[`${target}:463-479`],adjudications:[adjudication]})};
  assert.fail(`Unexpected provider task ${payload.task}`);
 }});
 if(caseName==='fallback_over_limit') {
  assert.equal(seen.length,0,'Oversized literal evidence must not be dispatched or summarized');
  assert.equal(result.shardedReview.coverage.authorityReady,false);
  assert(result.shardedReview.candidates.some(r=>r.error==='literal_source_and_manifest_exceed_request_envelope'));
  assert(result.shardedReview.synthesis.error.includes('exceed_request_envelope'));
 } else {
  assert(seen.find(s=>s.task==='file_explicit_target_candidate_set').whole_function_delivered);
  assert(seen.find(s=>s.task==='decide_explicit_target_review').whole_function_delivered);
  assert.equal(result.shardedReview.synthesis.status,'succeeded');
 }
 assert.equal(result.shardedReview.coverage.mercury_call_limit,null);
 runs.push({case:caseName,maxRequestBytes,requests:seen,result_termination:result.termination,result_synthesis_status:result.shardedReview.synthesis.status,synthesis_error:result.shardedReview.synthesis.error});
 }
 const out={candidate_tree:historicalTree,source_commit:tree,source_sha256:sourceHash,original_allegation:recorded.summary,original_citations:recorded.citations,function_scope:scope,fallbackCases,runs,implementation_sha256:global.__mercuryQualificationImplementation?.files.find(f=>f.path===target).implementation_sha256 || crypto.createHash('sha256').update(fs.readFileSync(path.join(root,target))).digest('hex'),no_network_or_provider_calls:true};
 fs.writeFileSync(path.join(__dirname,'replay-result.json'),JSON.stringify(out,null,2)+'\n');
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
