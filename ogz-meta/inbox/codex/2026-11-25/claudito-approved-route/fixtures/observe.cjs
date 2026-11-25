'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const cp = require('child_process');
const root = process.cwd();
const runtime = 'test/fixtures/claudito-approved-route-runtime';
const current = path.join(root, 'ogz-meta/manifests/current.json');
const events = path.join(root, runtime, 'events.jsonl');

// Only external service/context/verification boundaries are synthetic. The
// pipeline, router, cognition bridge/parsers, approval, writers and persistence
// are the real source. Event instrumentation delegates each actual file write.
if (process.env.CLAUDITO_ROUTE_PRELOAD === '1') {
  const scenario = process.env.CLAUDITO_ROUTE_SCENARIO;
  const phase = process.env.CLAUDITO_ROUTE_PHASE;
  const target = `${runtime}/${scenario}.js`;
  const event = data => fs.appendFileSync(events, JSON.stringify({ scenario, phase, ...data }) + '\n');
  const write = fs.writeFileSync;
  fs.writeFileSync = function(file, data, ...options) {
    const result = write.call(this, file, data, ...options);
    if (path.resolve(String(file)) === path.join(root, target)) event({ kind: 'target_write', content: String(data) });
    if (String(file).endsWith('.hook')) event({ kind: 'stage', ...JSON.parse(String(data)) });
    return result;
  };
  const replace = (file, exports) => {
    const id = require.resolve(path.join(root, file));
    require.cache[id] = { id, filename: id, loaded: true, exports };
  };
  replace('trai_brain/mercury-bridge/ask.js', { runAgentic: async prompt => {
    const role = /You are the (\w+) stage/.exec(prompt)?.[1]?.toLowerCase() || 'mercury-attack';
    event({ kind: 'provider', role });
    const responses = {
      architect: { plan: { summary: `${phase} synthetic approved plan`, files: [{ path: target, changes: [] }], ordering: [target], verification: 'synthetic smoke boundary' } },
      entomologist: { bugs: scenario === 'bugfix' ? [{ type: 'CODE_SCAN', file: target, line: 1, description: 'Synthetic wrong constant', evidence: 'module.exports = 1;', severity: 'low' }] : [], files_analyzed: [target], confidence: 'high' },
      exterminator: { proposals: process.env.CLAUDITO_ROUTE_MULTI === '1'
        ? ['first', 'second'].map((name, index) => ({ bug_id: 'CODE_SCAN', file: target, line_start: index + 1, line_end: index + 1, current_code: `const ${name} = 1;`, proposed_code: `const ${name} = 2;`, rationale: 'Synthetic same-file correction', side_effects: [], tests_needed: [] }))
        : [{ bug_id: 'CODE_SCAN', file: target, line_start: 1, current_code: 'module.exports = 1;', proposed_code: 'module.exports = 2;', rationale: 'Synthetic constant correction', side_effects: [], tests_needed: [] }], scope_violations: [] },
      fixer: { edits: [{ file: target, line_start: 2, current_code: '', new_code: '// synthetic approved note', rationale: 'Synthetic insertion' }], scope_violations: [], risks_identified: [] },
      critic: { reviews: [], overall_verdict: 'approve_all', loop_back_required: false },
      forensics: { risks: [], silent_bugs: [], loop_back_required: false, confidence: 'high' },
    };
    return { answer: responses[role] ? JSON.stringify(responses[role]) : 'VERDICT: no_break_found\nSynthetic review output.', iterations: 20, termination: 'answer_given' };
  } });
  replace('ogz-meta/commander.js', { getCurrentState: () => ({ fixture: true }), selectAgent: () => null });
  replace('ogz-meta/rag-query.js', { ragQuery: () => ({ ledger: [] }) });
  replace('tools/serena-bridge.js', {
    getBlastRadius: async () => ({ callerCount: 0, riskLevel: 'fixture', latencyMs: 0, summary: 'Synthetic external boundary' }),
    formatForMercury: () => 'Synthetic external boundary',
  });
  const exec = cp.execSync;
  cp.execSync = (command, options) => {
    if (command === 'git branch --show-current') return 'fixture-branch\n';
    if (command === 'node --check run-empire-v2.js') return exec(command, options);
    if (command === `node "${path.join(root, 'scripts/smoke-test.js')}"` ||
        command === 'node ogz-meta/update-ledger.js' || command === 'node ogz-meta/build-claudito-context.js') {
      event({ kind: 'synthetic_subprocess', command });
      if (process.env.CLAUDITO_ROUTE_SMOKE_FAIL === '1' && command.includes('smoke-test.js')) throw new Error('Synthetic smoke verification failed');
      return 'Synthetic subprocess success\n';
    }
    throw new Error(`Fixture forbids subprocess: ${command}`);
  };
  replace('package.json', { scripts: {} }); // No Jest or npm test in this exercise.
} else {
  const { saveManifest, shouldStop } = require(path.join(root, 'ogz-meta/manifest-schema'));
  fs.mkdirSync(runtime, { recursive: true });
  fs.mkdirSync(path.dirname(current), { recursive: true });
  const repaired = process.argv.includes('--expect-repair');
  const observations = [];
  const read = () => JSON.parse(fs.readFileSync(current, 'utf8'));
  const recorded = () => fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  function cli(scenario, phase, file, args = [], smokeFail = false, multiple = false) {
    const result = cp.spawnSync(process.execPath, ['--require', __filename, path.join(root, file), ...args], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, CLAUDITO_ROUTE_PRELOAD: '1', CLAUDITO_ROUTE_SCENARIO: scenario, CLAUDITO_ROUTE_PHASE: phase, CLAUDITO_ROUTE_SMOKE_FAIL: smokeFail ? '1' : '0', CLAUDITO_ROUTE_MULTI: multiple ? '1' : '0' },
    });
    assert.equal(result.signal, null, result.stderr);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return result;
  }
  for (const scenario of ['refactor', 'bugfix']) {
    const target = `${runtime}/${scenario}.js`;
    fs.writeFileSync(target, 'module.exports = 1;\n');
    const issue = `${scenario === 'refactor' ? 'refactor:' : 'fix:'} synthetic ${scenario} for ${target}`;
    const advisoryResult = cli(scenario, 'advisory', 'ogz-meta/pipeline.js', [issue]);
    const advisory = read();
    const approvalResult = cli(scenario, 'approval', 'ogz-meta/approve.js', [advisory.mission_id]);
    const approved = read();
    const result = cli(scenario, 'execute', 'ogz-meta/pipeline.js', ['--execute']);
    const after = read();
    const phaseEvents = recorded().filter(e => e.scenario === scenario && e.phase === 'execute');
    const content = fs.readFileSync(target, 'utf8');
    const data = {
      scenario, advisoryExit: advisoryResult.status, advisoryType: advisory.pipeline_type || null,
      advisoryState: advisory.state, approvalExit: approvalResult.status, executeExit: result.status,
      approvedPlan: approved.architect.plan, finalPlan: after.architect.plan,
      finalType: after.pipeline_type || null, finalState: after.state, stopped: shouldStop(after),
      successPrinted: result.stdout.includes('SUCCESS: Pipeline completed'),
      stages: phaseEvents.filter(e => e.kind === 'stage').map(e => e.command),
      providerRoles: phaseEvents.filter(e => e.kind === 'provider').map(e => e.role),
      writes: phaseEvents.filter(e => e.kind === 'target_write').length,
      content, fixes: after.exterminator.fixes_applied,
    };
    observations.push(data);
    if (repaired) {
      assert.equal(advisoryResult.status, 0);
      assert.equal(approvalResult.status, 0);
      assert.equal(advisory.pipeline_type, scenario);
      assert.equal(after.pipeline_type, scenario);
      assert.deepEqual(after.architect.plan, approved.architect.plan);
      assert.equal(result.status, 0, JSON.stringify(data));
      assert.equal(after.state, 'COMPLETE');
      assert.equal(data.writes, 1);
      assert.equal(content, scenario === 'refactor' ? 'module.exports = 1;\n// synthetic approved note\n' : 'module.exports = 2;\n');
      assert.equal(data.providerRoles.some(role => ['architect', 'entomologist', 'exterminator', 'fixer'].includes(role)), false);

      const beforeRepeat = recorded().length;
      const repeated = cli(scenario, 'repeat', 'ogz-meta/pipeline.js', ['--execute']);
      observations.push({ scenario: `${scenario}_repeat_refused`, exitCode: repeated.status,
        eventsAdded: recorded().length - beforeRepeat, contentUnchanged: fs.readFileSync(target, 'utf8') === content });
      assert.equal(repeated.status, 1);
      assert.equal(recorded().length, beforeRepeat);
      assert.equal(fs.readFileSync(target, 'utf8'), content);

      // The exact same approved writer must propagate a failed verification.
      fs.writeFileSync(target, 'module.exports = 1;\n');
      saveManifest(approved, current);
      const failed = cli(scenario, 'failed-verification', 'ogz-meta/pipeline.js', ['--execute'], true);
      const failedManifest = read();
      const failedStages = recorded().filter(e => e.scenario === scenario && e.phase === 'failed-verification' && e.kind === 'stage').map(e => e.command);
      observations.push({ scenario: `${scenario}_writer_verification_failure`, exitCode: failed.status,
        state: failedManifest.state, stopped: shouldStop(failedManifest), stages: failedStages,
        content: fs.readFileSync(target, 'utf8'), successPrinted: failed.stdout.includes('SUCCESS: Pipeline completed') });
      assert.equal(failed.status, 1);
      assert.equal(failedManifest.state, 'HALTED');
      assert.equal(shouldStop(failedManifest).stop, true);
      assert.equal(failedStages.includes('/warden'), false);
      assert.equal(fs.readFileSync(target, 'utf8'), 'module.exports = 1;\n');

      if (scenario === 'refactor') {
        const unknown = JSON.parse(JSON.stringify(approved));
        delete unknown.pipeline_type;
        saveManifest(unknown, current);
        const beforeUnknown = recorded().length;
        const unknownResult = cli(scenario, 'missing-type', 'ogz-meta/pipeline.js', ['--execute']);
        observations.push({ scenario: 'unidentified_approved_route_refused', exitCode: unknownResult.status,
          eventsAdded: recorded().length - beforeUnknown, mode: read().mode });
        assert.equal(unknownResult.status, 1);
        assert.equal(recorded().length, beforeUnknown);
        assert.equal(read().mode, 'ADVISORY');
      }
    }
    if (scenario === 'bugfix' && !repaired) {
      // Observe the approved bugfix consumer separately because the inherited
      // generic execute route never calls its intended exterminator writer.
      fs.writeFileSync(target, 'module.exports = 1;\n');
      approved.mode = 'EXECUTE';
      saveManifest(approved, current);
      const writer = cli(scenario, 'direct-writer', 'ogz-meta/slash-router.js', ['/exterminator', current]);
      observations.push({ scenario: 'approved_bugfix_consumer', exitCode: writer.status,
        undefinedProposals: writer.stderr.includes('proposals is not defined'),
        content: fs.readFileSync(target, 'utf8'), persisted: read().exterminator });
    }
  }
  if (repaired) {
    const target = `${runtime}/bugfix.js`;
    const original = 'const first = 1;\nconst second = 1;\nmodule.exports = { first, second };\n';
    fs.writeFileSync(target, original);
    const proposal = cli('bugfix', 'multiple-advisory', 'ogz-meta/pipeline.js', ['fix: synthetic two edits to one file'], false, true);
    assert.equal(proposal.status, 0);
    const approvedMission = read();
    assert.equal(approvedMission.exterminator.proposals.length, 2);
    assert.equal(cli('bugfix', 'multiple-approval', 'ogz-meta/approve.js', [approvedMission.mission_id]).status, 0);
    const result = cli('bugfix', 'multiple-failure', 'ogz-meta/pipeline.js', ['--execute'], true, true);
    const after = read();
    const content = fs.readFileSync(target, 'utf8');
    const data = { scenario: 'same_file_multiple_edits_rollback', exitCode: result.status,
      state: after.state, stopped: shouldStop(after), original, content,
      reportedApplied: after.exterminator.fixes_applied, restoredOriginal: content === original };
    observations.push(data);
    if (!process.argv.includes('--observe-rollback')) {
      assert.equal(result.status, 1);
      assert.equal(after.state, 'HALTED');
      assert.equal(content, original, JSON.stringify(data));
      assert.deepEqual(after.exterminator.fixes_applied, []);
    }
  }
  console.log('OBSERVATION_JSON=' + JSON.stringify({ sourceMode: repaired ? 'candidate' : 'baseline',
    realModelCalls: 0, realApprovals: 0, externalBoundaries: 'synthetic provider, commander context, RAG, AST, branch, smoke verification and ledger/context subprocesses; actual syntax-only check; no Jest', observations }));
}
