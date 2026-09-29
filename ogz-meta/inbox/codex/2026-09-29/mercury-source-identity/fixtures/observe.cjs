'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const cp = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
require('dotenv').config({path: path.join(root, '.env'), quiet: true});
const {captureGitReviewView, collectExplicitTargetCorpus, verifyCorpusSnapshots} = require(path.join(root, 'trai_brain/mercury-bridge/evidence-ingestion'));
const {createToolAdapter} = require(path.join(root, 'trai_brain/mercury-bridge/tool-adapter'));
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const target = 'core/OrderExecutor.js';
const ref = 'e6d80e0a12ad8051cf81a09e7c104985d64502e0';
const baseRef = 'aa91945575b22b076273d2c829a35c7a6b5cc9ef';
const git = args => cp.execFileSync('git', args, {cwd: root, maxBuffer: 64000000});
const before = hash(fs.readFileSync(path.join(root, target)));
const view = captureGitReviewView({repoRoot: root, ref, baseRef, outputDir: path.join(packet, 'private/view')});
const adapter = createToolAdapter({repoRoot: view.sourceRoot, gitRepoRoot: root, reviewSource: view});
const checks = [];
(async () => {
  assert.equal(hash(fs.readFileSync(path.join(view.sourceRoot, target))), hash(git(['show', ref + ':' + target])));
  assert.ok(!fs.existsSync(path.join(view.sourceRoot, '.git')));
  assert.ok(!fs.existsSync(path.join(view.sourceRoot, '.env')));
  const opened = await adapter.execute('open_file', {path: target, start_line: 2395, end_line: 2410});
  assert.match(opened.text, /absoluteCapSizeUsd = currentBalance \* capPercent/);
  assert.equal(opened.source_ref, view.tree); checks.push({tool: 'open_file', result: opened});
  const positive = await adapter.execute('grep', {query: 'absoluteCapSizeUsd', file_pattern: target});
  assert.ok(positive.total > 0); checks.push({tool: 'grep-positive', result: positive});
  const grep = await adapter.execute('grep', {query: 'entryBudgetUsd', file_pattern: 'core/OrderExecutor.js'});
  assert.equal(grep.total, 0); checks.push({tool: 'grep', result: grep});
  const ast = await adapter.execute('serena_method_callers', {method: '_applyStockShareRange', scope: 'core/OrderExecutor.js'});
  assert.equal(ast.total, 1); assert.ok(!ast.callers[0].context.includes('entryBudgetUsd'));
  assert.ok(ast.callers[0].context.includes('absoluteCapSizeUsd')); checks.push({tool: 'serena_method_callers', result: ast});
  const blast = await adapter.execute('serena_blast_radius', {path: target});
  assert.ok(!blast.error); assert.equal(blast.source_ref, view.tree); checks.push({tool: 'serena_blast_radius', result: blast});
  const diff = await adapter.execute('git_diff', {target: 'current', path: target});
  assert.ok(diff.diff.includes('absoluteCapShares')); assert.ok(!diff.diff.includes('entryBudgetUsd'));
  assert.equal(diff.target, 'review'); checks.push({tool: 'git_diff', result: diff});
  const historical = await adapter.execute('git_show', {ref: baseRef, path: target, start_line: 2260, end_line: 2273});
  assert.match(historical.text, /const caps = \[\]/); checks.push({tool: 'git_show', result: historical});
  const corpus = collectExplicitTargetCorpus({repoRoot: view.sourceRoot, explicitPaths: [target], sourceRef: view.tree, baseRef: view.baseTree,
    diffRef: view.baseTree + '..' + view.tree,
    git: (_r, args) => git(args),
    currentDiffFn: () => git(['diff', view.baseTree, view.tree, '--', target]).toString()});
  assert.equal(corpus.targets[0].source_ref, view.tree);
  assert.equal(corpus.targets[0].source_sha256, hash(git(['show', ref + ':' + target])));
  assert.deepEqual(verifyCorpusSnapshots({repoRoot: view.sourceRoot, corpus}), []);
  const {runReviewRechecks} = require(path.join(root, 'trai_brain/mercury-bridge/ask'));
  const dispatched = await runReviewRechecks({prompts: ['Read the actual selected cap producer.'],
    client: {}, toolAdapter: adapter, starterContext: [], blastRadius: '', maxIterations: null,
    maxTokens: 7750, verbose: false, evidenceSources: [], createProviderAudit: () => ({}),
    notify: async records => records,
    runLoop: async ({toolAdapter, maxIterations}) => {
      assert.equal(maxIterations, null);
      const read = await toolAdapter.execute('open_file', {path: target, start_line: 2395, end_line: 2410});
      assert.match(read.text, /absoluteCapSizeUsd = currentBalance \* capPercent/);
      assert.equal(read.source_ref, view.tree);
      return {answer: 'VERDICT: cannot_verify\nSynthetic dispatcher observation, not a model verdict.',
        termination: 'answer_given', observedRead: read};
    }});
  assert.equal(dispatched.rechecks.length, 1);
  assert.equal(dispatched.quarantines.length, 0);
  checks.push({tool: 'recheck-dispatch', result: dispatched.rechecks[0].observedRead});
  assert.equal(hash(fs.readFileSync(path.join(root, target))), before);
  fs.writeFileSync(path.join(packet, 'private/observations.json'), JSON.stringify({passed: true, view, checks,
    captured: corpus.targets, workingFileUnchanged: true,
    boundary: 'Actual snapshot capture and read/search/AST/diff/history tools; no provider or bot execution'}, null, 2));
  console.log(JSON.stringify({passed: true, files: view.files.length, checks: checks.map(c => c.tool), tree: view.tree}));
})().catch(error => {console.error(error.stack); process.exitCode = 1;});
