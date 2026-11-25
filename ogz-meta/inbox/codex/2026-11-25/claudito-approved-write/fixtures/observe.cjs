'use strict';

// Runs only inside scripts/test-isolated.py. Targets and approval here are
// synthetic workflow inputs; this is not operator approval of a real mission.
require('../../../../../../test/helpers/require-isolation.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const root = process.cwd();
const { createManifest, saveManifest } = require(path.join(root, 'ogz-meta/manifest-schema'));
const current = path.join(root, 'ogz-meta/manifests/current.json');
const fixtureDir = 'test/fixtures/claudito-approval-observation-runtime';
fs.mkdirSync(fixtureDir, { recursive: true });
fs.mkdirSync(path.dirname(current), { recursive: true });
const receipts = [];
const expectRepair = process.argv.includes('--expect-repair');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const read = () => JSON.parse(fs.readFileSync(current, 'utf8'));
const write = value => saveManifest(value, current);
function cli(file, args = [], cwd = root) {
  const result = spawnSync(process.execPath, [path.resolve(root, file), ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.signal, null, result.stderr);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  return result;
}
function route(command) {
  return cli('ogz-meta/slash-router.js', [command, current]);
}
function spec(file, before, after) {
  return [
    '### Fix 1: Isolated workflow source change', '', `**File:** \`${file}\``, '',
    '**str_replace target:**', '```js', before, '```', '',
    '**str_replace replacement:**', '```js', after, '```', ''
  ].join('\n');
}
function prepare(name, proposal = true) {
  const target = `${fixtureDir}/${name}.js`;
  const specPath = `${fixtureDir}/${name}.md`;
  fs.writeFileSync(target, "module.exports = 'before';\n");
  fs.writeFileSync(specPath, spec(target, "module.exports = 'before';", "module.exports = 'after';"));
  const manifest = createManifest(`MISSION-FIXTURE-${name}`);
  manifest.issue = `isolated ${name}`;
  manifest.pipeline_type = 'write';
  manifest.spec_source = { path: specPath, fixId: '1' };
  write(manifest);
  if (proposal) {
    assert.equal(route('/architect-verify').status, 0);
    assert.equal(route('/fixer-write').status, 0);
  }
  return { target, specPath, missionId: manifest.mission_id };
}
function record(name, value, repaired) {
  receipts.push({ name, ...value });
  if (expectRepair) assert.equal(repaired, true, `${name}: ${JSON.stringify(value)}`);
}

let fixture = prepare('wrong-mission');
let before = hash(fs.readFileSync(current));
let result = cli('ogz-meta/approve.js', ['MISSION-FIXTURE-other']);
record('wrong_mission_id', { exitCode: result.status, unchanged: hash(fs.readFileSync(current)) === before, status: read().approval.status }, result.status !== 0 && hash(fs.readFileSync(current)) === before);

fixture = prepare('no-approval');
let manifest = read();
manifest.mode = 'EXECUTE';
write(manifest);
result = route('/fixer-write');
record('unapproved_direct_write', { exitCode: result.status, target: fs.readFileSync(fixture.target, 'utf8'), stopped: read().stop_conditions }, result.status !== 0 && fs.readFileSync(fixture.target, 'utf8') === "module.exports = 'before';\n");

fixture = prepare('spec-substitution');
assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
before = hash(fs.readFileSync(current));
result = cli('ogz-meta/pipeline.js', ['--write', '--execute', '--spec', `${fixtureDir}/other-missing-spec.md`, '--fix-id', '1', read().issue]);
record('approved_spec_substitution', { exitCode: result.status, originalSpec: fixture.specPath, persistedSpec: read().spec_source.path, unchanged: hash(fs.readFileSync(current)) === before }, result.status !== 0 && hash(fs.readFileSync(current)) === before);

fixture = prepare('pending-stop');
assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
manifest = read();
manifest.stop_conditions.verification_failed = true;
write(manifest);
before = hash(fs.readFileSync(current));
result = cli('ogz-meta/pipeline.js', ['--write', '--execute', '--spec', fixture.specPath, '--fix-id', '1', manifest.issue]);
record('execution_preserves_stop', { exitCode: result.status, verificationFailed: read().stop_conditions.verification_failed, unchanged: hash(fs.readFileSync(current)) === before }, result.status !== 0 && hash(fs.readFileSync(current)) === before);

fixture = prepare('source-drift');
assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
fs.appendFileSync(fixture.target, '// Concurrent source change.\n');
before = hash(fs.readFileSync(fixture.target));
manifest = read(); manifest.mode = 'EXECUTE'; write(manifest);
result = route('/fixer-write');
record('approved_source_drift', { exitCode: result.status, unchanged: hash(fs.readFileSync(fixture.target)) === before }, result.status !== 0 && hash(fs.readFileSync(fixture.target)) === before);

fixture = prepare('spec-drift');
assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
fs.writeFileSync(fixture.specPath, spec(fixture.target, "module.exports = 'before';", "module.exports = 'different';"));
before = hash(fs.readFileSync(fixture.target));
manifest = read(); manifest.mode = 'EXECUTE'; write(manifest);
result = route('/fixer-write');
record('approved_spec_content_drift', { exitCode: result.status, unchanged: hash(fs.readFileSync(fixture.target)) === before }, result.status !== 0 && hash(fs.readFileSync(fixture.target)) === before);

fixture = prepare('valid-handoff');
assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
manifest = read(); manifest.mode = 'EXECUTE'; write(manifest);
result = route('/fixer-write');
manifest = read();
const hook = JSON.parse(fs.readFileSync(path.join(root, 'ogz-meta/manifests', `${fixture.missionId}.hook`), 'utf8'));
record('approved_stage_handoff', {
  exitCode: result.status,
  target: fs.readFileSync(fixture.target, 'utf8'),
  changedPaths: manifest.artifacts.files_modified,
  edits: manifest.fixer.changes_applied,
  hook,
  approvalScopePresent: Boolean(manifest.approval.write_scope)
}, result.status === 0 && fs.readFileSync(fixture.target, 'utf8') === "module.exports = 'after';\n" && manifest.artifacts.files_modified.includes(fixture.target) && hook.command === '/fixer-write' && Boolean(manifest.approval.write_scope));

result = cli('ogz-meta/slash-router.js', ['/architect-verify', `${fixtureDir}/missing-manifest.json`]);
record('missing_manifest_cli', { exitCode: result.status }, result.status !== 0);

if (expectRepair) {
  fixture = prepare('active-copy');
  const archived = read();
  archived.issue = 'stale saved mission copy';
  const archivePath = path.join(root, 'ogz-meta/manifests', `${fixture.missionId}.json`);
  saveManifest(archived, archivePath);
  const archivedBefore = hash(fs.readFileSync(archivePath));
  result = cli('ogz-meta/approve.js', [fixture.missionId]);
  record('approve_active_copy_of_named_mission', { exitCode: result.status, activeStatus: read().approval.status, savedCopyUnchanged: hash(fs.readFileSync(archivePath)) === archivedBefore }, result.status === 0 && read().approval.status === 'APPROVED' && hash(fs.readFileSync(archivePath)) === archivedBefore);

  fixture = prepare('proposal-tamper');
  fs.appendFileSync(read().fixer.proposal_path, '\nUnreviewed replacement text.\n');
  before = hash(fs.readFileSync(current));
  result = cli('ogz-meta/approve.js', [fixture.missionId]);
  record('proposal_changed_before_approval', { exitCode: result.status, unchanged: hash(fs.readFileSync(current)) === before }, result.status !== 0 && hash(fs.readFileSync(current)) === before);

  fixture = prepare('target-before-approval');
  fs.appendFileSync(fixture.target, '// Changed after the proposal.\n');
  before = hash(fs.readFileSync(current));
  result = cli('ogz-meta/approve.js', [fixture.missionId]);
  record('target_changed_before_approval', { exitCode: result.status, unchanged: hash(fs.readFileSync(current)) === before }, result.status !== 0 && hash(fs.readFileSync(current)) === before);

  fixture = prepare('legacy-approval');
  manifest = read(); manifest.mode = 'EXECUTE'; manifest.approval.status = 'APPROVED'; write(manifest);
  before = hash(fs.readFileSync(fixture.target));
  result = route('/fixer-write');
  record('legacy_unbound_approval', { exitCode: result.status, unchanged: hash(fs.readFileSync(fixture.target)) === before }, result.status !== 0 && hash(fs.readFileSync(fixture.target)) === before);

  fixture = prepare('other-working-directory');
  assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
  manifest = read(); manifest.mode = 'EXECUTE'; write(manifest);
  result = cli('ogz-meta/slash-router.js', ['/fixer-write', current], path.join(root, fixtureDir));
  record('approved_target_independent_of_cwd', { exitCode: result.status, target: fs.readFileSync(fixture.target, 'utf8'), artifact: read().artifacts.files_modified }, result.status === 0 && fs.readFileSync(fixture.target, 'utf8') === "module.exports = 'after';\n" && read().artifacts.files_modified.includes(fixture.target));
  before = hash(fs.readFileSync(fixture.target));
  result = route('/fixer-write');
  record('already_applied_scope_not_reused', { exitCode: result.status, unchanged: hash(fs.readFileSync(fixture.target)) === before }, result.status !== 0 && hash(fs.readFileSync(fixture.target)) === before);

  fixture = prepare('literal-backslash-path', false);
  const literalPath = `${fixtureDir}/literal\\source.js`;
  const otherPath = `${fixtureDir}/literal/source.js`;
  fs.mkdirSync(path.dirname(otherPath), { recursive: true });
  fs.writeFileSync(literalPath, "module.exports = 'before';\n");
  fs.writeFileSync(otherPath, "module.exports = 'before';\n// Different file.\n");
  fs.writeFileSync(fixture.specPath, spec(literalPath, "module.exports = 'before';", "module.exports = 'after';"));
  assert.equal(route('/architect-verify').status, 0);
  assert.equal(route('/fixer-write').status, 0);
  assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
  manifest = read(); manifest.mode = 'EXECUTE'; write(manifest);
  before = hash(fs.readFileSync(otherPath));
  result = route('/fixer-write');
  record('literal_backslash_keeps_exact_target_identity', { exitCode: result.status, target: fs.readFileSync(literalPath, 'utf8'), otherFileUnchanged: hash(fs.readFileSync(otherPath)) === before, artifacts: read().artifacts.files_modified }, result.status === 0 && fs.readFileSync(literalPath, 'utf8') === "module.exports = 'after';\n" && hash(fs.readFileSync(otherPath)) === before && read().artifacts.files_modified.includes(literalPath));

  fixture = prepare('outside-root', false);
  const outside = '/tmp/claudito-approval-outside.js';
  fs.writeFileSync(outside, "module.exports = 'before';\n");
  fs.writeFileSync(fixture.specPath, spec(outside, "module.exports = 'before';", "module.exports = 'after';"));
  manifest = read(); manifest.mode = 'EXECUTE'; manifest.approval.status = 'APPROVED'; write(manifest);
  before = hash(fs.readFileSync(outside));
  result = route('/fixer-write');
  record('outside_repository_source', { exitCode: result.status, unchanged: hash(fs.readFileSync(outside)) === before }, result.status !== 0 && hash(fs.readFileSync(outside)) === before);

  fixture = prepare('symlink', false);
  const link = `${fixtureDir}/source-link.js`;
  fs.symlinkSync(path.basename(fixture.target), link);
  fs.writeFileSync(fixture.specPath, spec(link, "module.exports = 'before';", "module.exports = 'after';"));
  manifest = read(); manifest.mode = 'EXECUTE'; manifest.approval.status = 'APPROVED'; write(manifest);
  before = hash(fs.readFileSync(fixture.target));
  result = route('/fixer-write');
  record('symlink_source', { exitCode: result.status, unchanged: hash(fs.readFileSync(fixture.target)) === before }, result.status !== 0 && hash(fs.readFileSync(fixture.target)) === before);

  fixture = prepare('multi-file-preflight', false);
  const secondTarget = `${fixtureDir}/second.js`;
  fs.writeFileSync(secondTarget, "module.exports = 'before';\n");
  const firstBlock = spec(fixture.target, "module.exports = 'before';", "module.exports = 'after';").split('\n').slice(4).join('\n');
  const secondBlock = spec(secondTarget, "module.exports = 'before';", "module.exports = 'removed';").split('\n').slice(4).join('\n');
  fs.writeFileSync(fixture.specPath, [
    '### Fix 1: Isolated multi-file preparation', '', `#### File 1: \`${fixture.target}\``, '', firstBlock,
    `#### File 2: \`${secondTarget}\``, '', secondBlock, firstBlock
  ].join('\n'));
  assert.equal(route('/architect-verify').status, 0);
  assert.equal(route('/fixer-write').status, 0);
  assert.equal(cli('ogz-meta/approve.js', [fixture.missionId]).status, 0);
  manifest = read(); manifest.mode = 'EXECUTE'; write(manifest);
  const targetsBefore = [fixture.target, secondTarget].map(f => hash(fs.readFileSync(f)));
  result = route('/fixer-write');
  const targetsAfter = [fixture.target, secondTarget].map(f => hash(fs.readFileSync(f)));
  record('later_edit_failure_leaves_all_targets_untouched', { exitCode: result.status, targetsBefore, targetsAfter }, result.status !== 0 && JSON.stringify(targetsAfter) === JSON.stringify(targetsBefore));
}

console.log('CLAUDITO_APPROVAL_RECEIPT=' + JSON.stringify({ sourceMode: expectRepair ? 'candidate' : 'baseline', liveProviderAccess: 'excluded by helper network and credential isolation; no model stage reached', realApprovals: 0, targets: fixtureDir, observations: receipts }));
