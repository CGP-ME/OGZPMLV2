'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const packet=__dirname,root=path.resolve(packet,'../../../../..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const originalTask='Mercury, break my fix. Complete the Stop1 configuration migration for the existing MADynamicSR baseConfidence, touchQualityWeight and maxConfidence controls: saved settings must reach initialized retained runner, symbol-context and orchestrator consumers on the next evaluation without resetting detector state; explicit injected configurations remain pinned. Trey authorized named rejection of invalid forced replacements before publication while retaining current valid settings. Correct the observed mismatch that allowed a replacement maxConfidence above the existing orchestrator zero-to-one confidence domain. Preserve the positive finite base/weight domain, existing configuration ownership and all unrelated work. Do not invent sizing calibration, defaults, strategy changes, shutdowns or new trading gates. Attack the complete selected change with current source evidence and report actual findings and limits.';
async function main(){
 const identity=JSON.parse(fs.readFileSync(path.join(packet,'CANDIDATE.json'),'utf8'));
 for(const key of ['candidate','base','harness'])assert.match(identity[key],/^[a-f0-9]{40}$/);
 const proofFiles=[`private/integration-cap-review-${identity.candidate}.json`,`private/cap-boundary-corrected-${identity.candidate}.json`];
 const documents=proofFiles.map(file=>{const content=fs.readFileSync(path.join(packet,file),'utf8'),proof=JSON.parse(content);assert.equal(proof.result,'PASS');assert.equal(proof.sourceSelection.tree,identity.candidate);assert.equal(proof.sourceSelection.mode,'immutable_review_tree');assert.equal(proof.sourceSelection.patchesApplied,false);return{path:path.relative(root,path.join(packet,file)),sha256:hash(content),bytes:Buffer.byteLength(content),content};});
 const metadata=documents.map(({content,...entry})=>entry);
 const prepared={identity,originalTask,documents:metadata,proofDelivery:'Complete proof documents retained locally; filename/hash catalog is not a claim of provider delivery. The default run reviews selected source. Root may attach these complete documents through the repaired receipt-document flow for panel followup.',providers:0,maxTokens:7750,maxIterations:null};
 // Keep all document bytes available as a distinct local artifact for lossless
 // receipt registration; do not duplicate them into every source-review turn.
 fs.writeFileSync(path.join(packet,'private/review-evidence-documents.json'),JSON.stringify(documents,null,2)+'\n');
 const query=originalTask+'\n\nMechanical evidence exists for this exact source tree. The following is an artifact catalog, not evidence that a reviewer has read it: '+JSON.stringify(metadata)+'. Do not claim these proofs were examined unless their actual contents are delivered. The complete original task above governs the review.';
 fs.writeFileSync(path.join(packet,'private/review-prompt.txt'),query);
 prepared.reviewApiRequest={api:'runAgentic',query,options:{reviewRef:identity.candidate,reviewBase:identity.base,maxTokens:7750,maxIterations:null,reviewersExplicit:true,reviewers:'mercury,fable,kimi'}};
 fs.writeFileSync(path.join(packet,'delivery/REVIEW-PREPARED.json'),JSON.stringify(prepared,null,2)+'\n');
 console.log(JSON.stringify({mode:'prepare_only',identity,documents:metadata,providers:0,proofDelivery:prepared.proofDelivery}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
