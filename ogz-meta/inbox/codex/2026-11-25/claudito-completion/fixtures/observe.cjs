'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const cp = require('child_process');
const root = process.cwd();
const runtime = 'test/fixtures/claudito-completion-runtime';
const current = path.join(root, 'ogz-meta/manifests/current.json');
const calls = path.join(root, runtime, 'provider-calls.jsonl');

// Synthetic external boundaries only. Router, cognition bridge, parser,
// manifest persistence, approval and pipeline CLI are the real source.
if (process.env.CLAUDITO_COMPLETION_PRELOAD === '1') {
  const replace = (file, exports) => {
    const id = require.resolve(path.join(root, file));
    require.cache[id] = { id, filename: id, loaded: true, exports };
  };
  replace('trai_brain/mercury-bridge/ask.js', { runAgentic: async prompt => {
    const role = /You are the (\w+) stage/.exec(prompt)?.[1]?.toLowerCase() || 'mercury-attack';
    const failureMode = process.env.CLAUDITO_COMPLETION_FAIL;
    const failed = failureMode !== '0';
    fs.appendFileSync(calls, JSON.stringify({ role, failed, synthetic: true }) + '\n');
    if (failureMode === '1') throw new Error('Synthetic provider unavailable');
    if (failureMode === 'returned') return { answer: '(Mercury call failed: Request timeout)', iterations: 1, termination: 'error' };
    const responses = {
      architect: { plan: { summary: 'Synthetic empty plan', files: [], ordering: [], verification: 'fixture' } },
      entomologist: { bugs: [], files_analyzed: [], confidence: 'high' },
      exterminator: { proposals: [], scope_violations: [] },
      fixer: { edits: [], scope_violations: [], risks_identified: [] },
      critic: { reviews: [], overall_verdict: 'approve_all', loop_back_required: false },
      forensics: { risks: [], silent_bugs: [], loop_back_required: false, confidence: 'high' },
    };
    return { answer: responses[role] ? JSON.stringify(responses[role]) : 'VERDICT: no_break_found\nSynthetic review output for a fixture.', iterations: 20, termination: 'answer_given' };
  } });
  replace('ogz-meta/commander.js', { getCurrentState: () => ({ fixture: true }), selectAgent: () => null });
  replace('ogz-meta/rag-query.js', { ragQuery: () => ({ ledger: [] }) });
  replace('tools/serena-bridge.js', {
    getBlastRadius: async () => ({ callerCount: 0, riskLevel: 'fixture', latencyMs: 0, summary: 'Synthetic external boundary' }),
    formatForMercury: () => 'Synthetic external boundary',
  });
  // The sandbox has no git metadata. Keep branch observation synthetic and
  // forbid every other shell action except the existing syntax-only check.
  const exec = cp.execSync;
  cp.execSync = (command, options) => {
    if (command === 'git branch --show-current') return 'fixture-branch\n';
    if (command === 'node --check run-empire-v2.js') return exec(command, options);
    throw new Error(`Fixture forbids subprocess: ${command}`);
  };
  replace('package.json', { scripts: {} }); // No Jest or npm test in this exercise.
} else {
  const { createManifest, saveManifest, shouldStop } = require(path.join(root, 'ogz-meta/manifest-schema'));
  fs.mkdirSync(runtime, { recursive: true });
  fs.mkdirSync(path.dirname(current), { recursive: true });
  const repaired = process.argv.includes('--expect-repair');
  const observations = [];
  const read = () => JSON.parse(fs.readFileSync(current, 'utf8'));
  const write = manifest => saveManifest(manifest, current);
  const callCount = () => fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).length : 0;
  function cli(file, args = [], fail = false) {
    const result = cp.spawnSync(process.execPath, ['--require', __filename, path.join(root, file), ...args], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, CLAUDITO_COMPLETION_PRELOAD: '1', CLAUDITO_COMPLETION_FAIL: fail === 'returned' ? fail : fail ? '1' : '0' },
    });
    assert.equal(result.signal, null, result.stderr);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return result;
  }
  const route = (command, fail) => cli('ogz-meta/slash-router.js', [command, current], fail);
  function record(name, data, condition) {
    observations.push({ name, ...data });
    if (repaired) assert.equal(condition, true, `${name}: ${JSON.stringify(data)}`);
  }
  function manifest(name) {
    const m = createManifest(`FIXTURE-${name}`);
    m.issue = `Synthetic ${name}`;
    return m;
  }
  for (const failureMode of [true, 'returned']) {
   for (const role of ['architect', 'entomologist', 'exterminator', 'fixer', 'critic', 'forensics']) {
    const m = manifest(role);
    m.entomologist.bugs_found = [{ type: 'fixture', location: 'fixture.js:1', description: 'synthetic', code: 'before' }];
    m.exterminator.proposals = [{ bug_id: 'fixture', location: 'fixture.js:1', proposed_fix: 'after' }];
    m.architect.plan = { files: [{ path: 'fixture.js', changes: [] }] };
    write(m);
    const beforeCalls = callCount();
    const result = route(`/${role}`, failureMode);
    const failed = read();
    const wardenResult = route('/warden');
    const after = read();
    record(`${role}_${failureMode === 'returned' ? 'returned' : 'rejected'}_provider_failure`, {
      exitCode: result.status, roleFailureRecorded: failed[role].mercury_failed === true,
      reason: failed[role].reason || null, stopped: shouldStop(failed), state: failed.state,
      wardenExit: wardenResult.status, finalState: after.state, finalApproval: after.warden.final_approval,
      providerCalls: callCount() - beforeCalls,
    }, result.status === 1 && failed[role].mercury_failed === true && shouldStop(failed).stop && after.state !== 'COMPLETE' && !after.warden.final_approval && callCount() - beforeCalls === 1);
   }
  }

  write(manifest('successful-role'));
  let result = route('/architect');
  let after = read();
  record('successful_role_handoff', { exitCode: result.status, state: after.state, plan: after.architect.plan, stopped: shouldStop(after) }, result.status === 0 && after.state === 'ENTOMOLOGY' && !shouldStop(after).stop);

  let m = manifest('blocked-warden');
  m.artifacts.files_modified = Array.from({ length: 11 }, (_, i) => `fixture-${i}.js`);
  write(m);
  result = route('/warden');
  after = read();
  record('blocked_warden_is_not_complete', { exitCode: result.status, state: after.state, finalApproval: after.warden.final_approval, stopped: shouldStop(after) }, result.status === 1 && after.state !== 'COMPLETE' && !after.warden.final_approval);

  m = manifest('reported-findings');
  m.mode = 'EXECUTE';
  const transcript = `${runtime}/findings.md`;
  fs.writeFileSync(transcript, '# Synthetic review\n\n## Mercury Verdict\n1. Fixture finding at fixture.js:1 needs operator review.\n');
  m.critic.mercury_attack = { dispatched: true, transcript, iterations: 20 };
  write(m);
  result = route('/mercury-critic');
  after = read();
  const warden = route('/warden');
  record('substantive_findings_remain_report_only', { exitCode: result.status, gate: after.critic.mercury_critic.gate, stopped: shouldStop(after), wardenExit: warden.status, finalState: read().state }, result.status === 0 && after.critic.mercury_critic.gate === 'findings' && !shouldStop(after).stop && warden.status === 0);

  for (const legacyFailure of [false, true]) {
    m = manifest(legacyFailure ? 'legacy-failure-response' : 'quoted-error-finding');
    m.mode = 'EXECUTE';
    const transcript = `${runtime}/${legacyFailure ? 'legacy-failure' : 'quoted-error'}.md`;
    const verdict = legacyFailure
      ? '(Mercury call failed: Request timeout)'
      : '1. The source at core/persistent_llm_client.js:799 contains the error text "Request timeout". This completed synthetic review cites that text as evidence.';
    fs.writeFileSync(transcript, '# Synthetic review\n\n## Mercury Verdict\n' + verdict + '\n');
    m.critic.mercury_attack = { dispatched: true, transcript, iterations: 20 };
    write(m);
    result = route('/mercury-critic');
    after = read();
    record(legacyFailure ? 'legacy_failure_stub_stops' : 'quoted_error_remains_report_only', {
      exitCode: result.status, gate: after.critic.mercury_critic.gate, state: after.state, stopped: shouldStop(after),
    }, legacyFailure
      ? result.status === 1 && after.critic.mercury_critic.gate === 'infra_issue' && shouldStop(after).stop
      : result.status === 0 && after.critic.mercury_critic.gate === 'findings' && !shouldStop(after).stop);
  }

  m = manifest('unavailable-review-evidence');
  m.mode = 'EXECUTE';
  m.critic.mercury_attack = { dispatched: true, transcript: `${runtime}/absent.md`, iterations: 20 };
  write(m);
  result = route('/mercury-critic');
  after = read();
  record('unavailable_review_evidence_is_incomplete', { exitCode: result.status, gate: after.critic.mercury_critic.gate, state: after.state, stopped: shouldStop(after) }, result.status === 1 && after.critic.mercury_critic.gate === 'infra_issue' && shouldStop(after).stop && after.state !== 'COMPLETE');

  for (const fail of [true, 'returned', false]) {
    const name = fail === 'returned' ? 'returned-error-write-review' : fail ? 'failed-write-review' : 'successful-write-review';
    const target = `${runtime}/${name}.js`;
    const spec = `${runtime}/${name}.md`;
    fs.writeFileSync(target, "module.exports = 'before';\n");
    fs.writeFileSync(spec, ['### Fix 1: Synthetic change', '', `**File:** \`${target}\``, '', '**str_replace target:**', '```js', "module.exports = 'before';", '```', '', '**str_replace replacement:**', '```js', "module.exports = 'after';", '```', ''].join('\n'));
    m = manifest(name);
    m.pipeline_type = 'write';
    m.spec_source = { path: spec, fixId: '1' };
    write(m);
    assert.equal(route('/architect-verify').status, 0);
    assert.equal(route('/fixer-write').status, 0);
    assert.equal(cli('ogz-meta/approve.js', [m.mission_id]).status, 0);
    const beforeCalls = callCount();
    result = cli('ogz-meta/pipeline.js', ['--execute'], fail);
    after = read();
    const successPrinted = result.stdout.includes('SUCCESS: Pipeline completed');
    record(name, {
      exitCode: result.status, state: after.state, successPrinted, stopped: shouldStop(after),
      review: after.critic.mercury_attack, report: after.critic.mercury_critic || null,
      target: fs.readFileSync(target, 'utf8'), providerCalls: callCount() - beforeCalls,
      wardenReached: Boolean(after.warden.timestamp), finalApproval: after.warden.final_approval,
      debuggerReached: Boolean(after.debugger.timestamp),
    }, fail
      ? result.status === 1 && !successPrinted && after.state !== 'COMPLETE' && shouldStop(after).stop && !after.warden.timestamp && !after.debugger.timestamp
      : result.status === 0 && successPrinted && after.state === 'COMPLETE' && after.warden.final_approval && !shouldStop(after).stop);
  }
  console.log('OBSERVATION_JSON=' + JSON.stringify({ sourceMode: repaired ? 'candidate' : 'baseline', externalBoundaries: 'synthetic provider, commander context, RAG, AST and branch observation; real router, bridge, parser, approval, writer, manifest and pipeline CLI', realModelCalls: 0, realApprovals: 0, observations }));
}
