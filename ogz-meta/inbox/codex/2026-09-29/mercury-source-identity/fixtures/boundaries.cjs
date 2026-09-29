'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), cp = require('node:child_process');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
require('dotenv').config({path: path.join(root, '.env'), quiet: true});
const {captureGitReviewView, collectExplicitTargetCorpus, verifyCorpusSnapshots} = require(path.join(root, 'trai_brain/mercury-bridge/evidence-ingestion'));
const {createToolAdapter} = require(path.join(root, 'trai_brain/mercury-bridge/tool-adapter'));
const {view} = JSON.parse(fs.readFileSync(path.join(packet, 'private/observations.json')));
const git = (_root, args) => cp.execFileSync('git', args, {cwd: root, maxBuffer: 64000000});
const target = 'core/OrderExecutor.js';
(async () => {
 const untouched = path.join(packet, 'private/invalid-ref-must-not-capture');
 for (const refs of [{ref:'not-a-real-review-ref',baseRef:'HEAD'}, {ref:'HEAD'}, {baseRef:'HEAD'}]) {
   assert.throws(() => captureGitReviewView({repoRoot: root, ...refs, outputDir: untouched}));
   assert.equal(fs.existsSync(untouched), false);
 }
 const adapter = createToolAdapter({repoRoot:view.sourceRoot,gitRepoRoot:root,reviewSource:view});
 for (const target of ['working','staged']) assert.match((await adapter.execute('git_diff',{target})).error,/pinned Git tree/);
 assert.match((await adapter.execute('run_check',{command:['node','run-empire-v2.js']})).error,/unknown tool/);
 const opts = {repoRoot:view.sourceRoot,explicitPaths:[target],sourceRef:view.tree,baseRef:view.baseTree,
   diffRef:view.baseTree+'..'+view.tree,git,
   currentDiffFn:() => git(root,['diff',view.baseTree,view.tree,'--',target]).toString()};
 const corpus = collectExplicitTargetCorpus(opts);
 assert.ok(corpus.artifacts.some(a=>a.kind==='diff' && a.content.includes('absoluteCapShares')));
 const drift = verifyCorpusSnapshots({repoRoot:view.sourceRoot,corpus,fsImpl:{...fs,
   readFileSync: (...args) => args[0]===path.join(view.sourceRoot,target)?Buffer.from('changed source'):fs.readFileSync(...args)}});
 assert.ok(drift.length>0);
 // Synthetic missing-file boundary: actual baseline bytes and exact baseline identity,
 // not a claim that the real candidate deleted this file.
 const deleted = collectExplicitTargetCorpus({...opts, git: (r,args) => args[0] === 'ls-tree' && args[2] === view.tree ? Buffer.alloc(0) : git(r,args), fsImpl:{...fs,lstatSync:() => {const e=Error('fixture absent');e.code='ENOENT';throw e;}}});
 assert.equal(deleted.targets[0].status,'deleted');
 assert.equal(deleted.targets[0].source_ref,view.baseTree);
 assert.deepEqual(verifyCorpusSnapshots({repoRoot:view.sourceRoot,corpus:deleted}),[]);
 const symlinkGit = (r,args) => args[0] === 'ls-tree' && args[2] === view.tree
   ? Buffer.from('120000 blob ' + 'a'.repeat(40) + '\t' + target + '\0') : git(r,args);
 const excludedLink = collectExplicitTargetCorpus({...opts,git:symlinkGit});
 assert.equal(excludedLink.targets[0].status,'unsupported');
 assert.ok(excludedLink.unresolved.some(r=>r.reason==='selected_tree_non_regular_file'));
 const missingCapture = collectExplicitTargetCorpus({...opts,fsImpl:{...fs,lstatSync:()=>{const e=Error('fixture absent');e.code='ENOENT';throw e;}}});
 assert.ok(missingCapture.unresolved.some(r=>r.reason==='selected_blob_missing_from_capture'));
 const {parseArgs,resolveEvidenceSources} = require(path.join(root,'trai_brain/mercury-bridge/ask'));
 const args = parseArgs(['node','ask.js','--agentic','--review-ref='+view.tree,'--review-base='+view.baseTree,'--max-tokens=7750','Mercury, break my fix.']);
 assert.equal(args.reviewRef,view.tree);assert.equal(args.reviewBase,view.baseTree);assert.equal(args.maxIterations,null);
 const lines = fs.readFileSync(path.join(view.sourceRoot,target),'utf8').split('\n');
 const lineIndex = lines.findIndex(l=>l.includes('absoluteCapSizeUsd = currentBalance * capPercent'));
 const excerpts = resolveEvidenceSources({repoRoot:view.sourceRoot,query:lines[lineIndex],descriptors:[target+':'+(lineIndex+1)+'-'+(lineIndex+1)]});
 assert.equal(excerpts.length,1);assert.equal(excerpts[0].excerpt,lines[lineIndex]);
 const wrongRoot = resolveEvidenceSources({repoRoot:root,query:lines[lineIndex],descriptors:[target+':'+(lineIndex+1)+'-'+(lineIndex+1)]});
 assert.equal(wrongRoot.length,0);assert.ok(wrongRoot.quarantines.length>0);
 const ordinary = collectExplicitTargetCorpus({repoRoot:root,explicitPaths:[target]});
 assert.equal(ordinary.targets[0].source_ref,'WORKTREE');
 const result = {passed:true,checks:['invalid-or-missing-ref-no-fallback','mutable-diff-refused-explicitly','run_check-remains-unavailable',
   'diff-bytes-present','source-drift-detected','deleted-preimage-baseline-identity','ordinary-worktree-mode-preserved','symlink-replacement-unresolved','missing-captured-blob-unresolved','CLI-pins-and-unlimited-iterations','evidence-excerpt-source-identity']};
 fs.writeFileSync(path.join(packet,'private/boundaries.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
