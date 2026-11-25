'use strict';

require('../../../../../../test/helpers/require-isolation.cjs')();
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const cp = require('child_process');
const root = process.cwd();

if (process.argv.includes('--child-ok') || process.argv.includes('--child-fail')) {
  console.log('CHILD_OBSERVATION=' + JSON.stringify({ namespacesVerified: true, operatorHomeAbsent: !fs.existsSync('/home/linuxuser'), gitAbsent: !fs.existsSync('.git') }));
  process.exitCode = process.argv.includes('--child-fail') ? 17 : 0;
} else {
  const runtime = 'test/fixtures/claudito-verification-runtime';
  const current = path.join(root, runtime, 'current.json');
  fs.mkdirSync(runtime, { recursive: true });
  const repaired = process.argv.includes('--expect-repair');
  const observations = [];
  const calls = [];
  const execSync = cp.execSync;
  const execFileSync = cp.execFileSync;
  // The outer real launcher removes .git and disables nested user namespaces.
  // Observe the handler's launcher argv, then run the requested harmless child
  // inside this already isolated namespace. Separate --child-ok/fail commands
  // exercise the real launcher itself without this boundary instrumentation.
  cp.execFileSync = (executable, args, options) => {
    if (executable === 'python3' && path.resolve(args[0]) === path.join(root, 'scripts/test-isolated.py')) {
      assert.equal(args[1], '--');
      calls.push({ kind: 'isolated_dispatch', executable, args, timeoutMs: options.timeout || null });
      return execFileSync(args[2], args.slice(3), options);
    }
    throw new Error(`Fixture forbids child executable: ${executable}`);
  };
  cp.execSync = (command, options) => {
    if (command === 'git branch --show-current') {
      calls.push({ kind: 'synthetic_branch', command });
      return 'fixture-branch\n';
    }
    if (command === 'npm test') {
      calls.push({ kind: 'blocked_automatic_jest', command });
      return ''; // Observe the inherited request without ever starting Jest.
    }
    calls.push({ kind: 'raw_dispatch', command });
    return execSync(command, options);
  };
  const packageId = require.resolve(path.join(root, 'package.json'));
  require.cache[packageId] = { id: packageId, filename: packageId, loaded: true, exports: { scripts: { test: 'jest --runInBand' } } };
  const { route } = require(path.join(root, 'ogz-meta/slash-router'));
  const { createManifest, saveManifest, shouldStop } = require(path.join(root, 'ogz-meta/manifest-schema'));
  const read = () => JSON.parse(fs.readFileSync(current, 'utf8'));
  const fresh = name => {
    const manifest = createManifest(`FIXTURE-${name}`);
    manifest.issue = `Synthetic ${name}`;
    return manifest;
  };
  const checkDispatch = slice => {
    if (repaired) {
      assert.equal(slice.some(call => call.kind === 'raw_dispatch' || call.kind === 'blocked_automatic_jest'), false);
      assert.ok(slice.some(call => call.kind === 'isolated_dispatch'));
    }
  };
  (async () => {
    for (const fail of [false, true]) {
      const manifest = fresh(fail ? 'debugger-failure' : 'debugger-success');
      manifest.forensics.recommended_verifications = [`node ${path.relative(root, __filename)} --child-${fail ? 'fail' : 'ok'}`];
      saveManifest(manifest, current);
      const from = calls.length;
      await route('/debugger --forensics', { manifest: current });
      const after = read();
      const dispatch = calls.slice(from);
      observations.push({ name: fail ? 'debugger_command_failure' : 'debugger_command_success', dispatch,
        state: after.state, stopped: shouldStop(after), results: after.debugger.results });
      checkDispatch(dispatch);
      assert.equal(shouldStop(after).stop, fail);
      if (fail) assert.equal(after.state, 'HALTED');
    }

    const smokePath = path.join(root, 'scripts/smoke-test.js');
    const originalSmoke = fs.readFileSync(smokePath);
    for (const mode of ['success', 'failure', 'missing']) {
      // This is a synthetic verifier program only inside the disposable source
      // snapshot; no real trading module or smoke sweep is imported.
      fs.writeFileSync(smokePath, "require('../test/helpers/require-isolation.cjs')();\nconsole.log('Synthetic isolated smoke');\n" + (mode === 'failure' ? 'process.exitCode = 17;\n' : ''));
      if (mode === 'missing') fs.renameSync(smokePath, smokePath + '.fixture-held');
      const target = `${runtime}/target.js`;
      fs.writeFileSync(target, 'module.exports = 1;\n');
      const manifest = fresh(`smoke-${mode}`);
      manifest.mode = 'EXECUTE';
      manifest.pipeline_type = 'refactor';
      manifest.approval = { status: 'APPROVED' };
      manifest.fixer.edits = [{ file: target, line_start: 1, line_end: 1, current_code: 'module.exports = 1;', new_code: 'module.exports = 2;' }];
      saveManifest(manifest, current);
      const from = calls.length;
      await route('/fixer', { manifest: current });
      const after = read();
      const dispatch = calls.slice(from);
      const content = fs.readFileSync(target, 'utf8');
      observations.push({ name: `smoke_${mode}`, dispatch, state: after.state, stopped: shouldStop(after), fixer: after.fixer, content });
      if (mode !== 'missing') checkDispatch(dispatch);
      if (repaired) {
        assert.equal(shouldStop(after).stop, mode !== 'success');
        assert.equal(content, mode === 'success' ? 'module.exports = 2;\n' : 'module.exports = 1;\n');
      }
      if (mode === 'missing') fs.renameSync(smokePath + '.fixture-held', smokePath);
    }
    fs.writeFileSync(smokePath, originalSmoke);

    const runnerPath = path.join(root, 'run-empire-v2.js');
    const originalRunner = fs.readFileSync(runnerPath);
    for (const fail of [false, true]) {
      if (fail) fs.writeFileSync(runnerPath, 'const = invalid synthetic syntax;\n');
      saveManifest(fresh(`cicd-syntax-${fail}`), current);
      const from = calls.length;
      await route('/cicd', { manifest: current });
      const after = read();
      const dispatch = calls.slice(from);
      checkDispatch(dispatch);
      assert.equal(shouldStop(after).stop, fail);
      if (repaired) assert.equal(after.cicd.test_result, 'NOT_RUN');
      await route('/warden', { manifest: current });
      const consumed = read();
      assert.equal(consumed.state, fail ? 'HALTED' : 'COMPLETE');
      assert.equal(consumed.warden.final_approval, !fail);
      observations.push({ name: fail ? 'cicd_failure_stays_halted' : 'cicd_syntax', dispatch,
        state: after.state, stopped: shouldStop(after), result: after.cicd,
        finalState: consumed.state, wardenApproved: consumed.warden.final_approval });
      fs.writeFileSync(runnerPath, originalRunner);
    }

    // Exercise the real final report with a valid approved no-change mission.
    // Required role answers and branch identity are synthetic boundaries;
    // route order, verification, state persistence and final report are real.
    const askId = require.resolve(path.join(root, 'trai_brain/mercury-bridge/ask.js'));
    require.cache[askId] = { id: askId, filename: askId, loaded: true, exports: { runAgentic: async () => ({
      answer: JSON.stringify({ reviews: [], overall_verdict: 'approve_all', risks: [], silent_bugs: [], loop_back_required: false, confidence: 'high' }),
      termination: 'answer_given', iterations: 20
    }) } };
    const approved = fresh('completion-consumer');
    approved.pipeline_type = 'bugfix';
    approved.approval.status = 'APPROVED';
    saveManifest(approved, path.join(root, 'ogz-meta/manifests/current.json'));
    const log = console.log;
    const output = [];
    const beforeCompletion = calls.length;
    console.log = (...args) => { output.push(args.join(' ')); log(...args); };
    const final = await require(path.join(root, 'ogz-meta/pipeline')).execute('--execute');
    console.log = log;
    const successPrinted = output.some(line => line.includes('SUCCESS: Pipeline completed'));
    checkDispatch(calls.slice(beforeCompletion));
    assert.equal(final.state, 'COMPLETE');
    assert.equal(final.warden.final_approval, true);
    assert.equal(shouldStop(final).stop, false);
    assert.equal(successPrinted, true);
    if (repaired) assert.equal(final.cicd.test_result, 'NOT_RUN');
    observations.push({ name: 'pipeline_completion_consumer', state: final.state,
      stopped: shouldStop(final), cicd: final.cicd, debugger: final.debugger, successPrinted });
    console.log('OBSERVATION_JSON=' + JSON.stringify({ sourceMode: repaired ? 'candidate' : 'baseline', observations,
      boundaries: 'Real router, writer, smoke/debugger/CICD handlers, Warden, pipeline final report and manifest; harmless real child commands inside outer isolation. Nested launcher dispatch instrumented, automatic Jest request recorded without executing it, smoke program synthetic. Completion control has a valid approved no-change mission with synthetic role answers and branch identity. No models or trading imports.' }));
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
