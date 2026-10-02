'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const acorn = require('acorn');
const packet = path.resolve(__dirname, '..');
const repo = path.resolve(packet, '../../../../..');
const base = JSON.parse(fs.readFileSync(path.join(packet, 'CANDIDATE.json'), 'utf8')).base;
const selected = process.env.EXIT_SELECTOR_REVIEW_TREE;
const read = (ref, file) => cp.execFileSync('git', ['show', `${ref}:${file}`], { cwd: repo, maxBuffer: 20e6, encoding: 'utf8' });
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const before = read(base, 'run-empire-v2.js');
const retired = [
  '    // EXIT_SYSTEM feature flag: Only ONE exit system active at a time',
  '    // Options: maxprofit, intelligence, pattern, brain, legacy (all active)',
  '    // Hard stop loss + stale trade exit + confidence crash ALWAYS run regardless',
  '    this.activeExitSystem = resolvedConfig.config.exits.exitSystem;',
  '    console.log(`Active Exit System: ${this.activeExitSystem.toUpperCase()}`);',
  '',
].join('\n') + '\n';
assert.equal(before.split(retired).length, 2);
const expected = before.replace(retired, '');
if (selected) assert.equal(cp.execFileSync('git', ['cat-file', '-t', selected], {cwd: repo, encoding:'utf8'}).trim(), 'tree');
const after = selected ? read(selected, 'run-empire-v2.js') : expected;
// Permit unrelated already-landed changes, but verify this exact boundary.
assert.ok(!/activeExitSystem|exits\.exitSystem|EXIT_SYSTEM/.test(after));
function boundary(source) {
  const tree = acorn.parse(source, {ecmaVersion:'latest', sourceType:'script'});
  const cls = tree.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'OGZPrimeV14Bot');
  const statements = cls.body.body.find(n => n.kind === 'constructor').value.body.body;
  const start = statements.findIndex(n => source.slice(n.start,n.end).includes("console.log('[ModularEntry] MTF + Crossovers + S/R + Liquidity initialized')"));
  assert.ok(start >= 0);
  const end = source.indexOf('// Phase 2 REWRITE: GridTradingStrategy deleted', statements[start].end);
  assert.ok(end > 0);
  return source.slice(statements[start].start, end);
}
const settings = JSON.parse(read(selected || base, 'config/settings.json'));
assert.equal(Object.hasOwn(settings.exits, 'exitSystem'), false);
const logs = [];
function execute(source) {
  const owner = {};
  vm.runInNewContext(`(function(){${boundary(source)}; this.reachedAfterRetiredSelector = true;}).call(owner)`, {
    owner, resolvedConfig: {config:{exits:settings.exits}}, console:{log: value => logs.push(value)},
  });
  return owner;
}
assert.throws(() => execute(before), /toUpperCase/);
const owner = execute(after);
assert.equal(owner.reachedAfterRetiredSelector, true);
assert.equal(Object.hasOwn(owner,'activeExitSystem'), false);
const result = {
  pass:true, baseline:base, selectedTree:selected || null,
  sourceMode:selected ? 'immutable_review_tree_no_patches' : 'packet_only_exact_removal',
  runnerBeforeSha256:sha(before), runnerAfterSha256:sha(after),
  canonicalExitsHasSelector:false, baselineConstructorBoundaryThrows:true,
  candidateContinuesPastBoundary:true, noReplacementSelector:true,
  limits:['Constructor boundary executed, not whole bot boot', 'No PM2 restart, broker, provider, trade or exit-policy execution'],
};
fs.writeFileSync(path.join(packet, selected ? `verification-${selected}.json` : 'verification-prepared.json'), JSON.stringify(result,null,2)+'\n');
if (!selected) {
  const line = before.slice(0,before.indexOf(retired)).split('\n').length;
  const patch = `diff --git a/run-empire-v2.js b/run-empire-v2.js\n--- a/run-empire-v2.js\n+++ b/run-empire-v2.js\n@@ -${line-2},9 +${line-2},3 @@\n     console.log('[ModularEntry] MTF + Crossovers + S/R + Liquidity initialized');\n \n` + retired.trimEnd().split('\n').map(x => '-'+x).join('\n') + '\n-\n     // Phase 2 REWRITE: GridTradingStrategy deleted - different trading style, feature-flagged off\n';
  fs.writeFileSync(path.join(packet,'retire.patch'),patch);
}
console.log(JSON.stringify(result));
