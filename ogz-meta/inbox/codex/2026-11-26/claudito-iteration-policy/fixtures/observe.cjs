'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const calls = [];
let response = { answer: '(synthetic unavailable)', termination: 'error', iterations: 1 };
const ask = require.resolve(path.join(root, 'trai_brain/mercury-bridge/ask.js'));
require.cache[ask] = { id: ask, filename: ask, loaded: true, exports: {
  runAgentic: async (prompt, options) => {
    calls.push({ role: /You are the (\w+) stage/.exec(prompt)?.[1], ...options });
    return response;
  },
} };
const { createManifest, saveManifest, shouldStop } = require(path.join(root, 'ogz-meta/manifest-schema'));
const { route } = require(path.join(root, 'ogz-meta/slash-router'));
const { callMercury } = require(path.join(root, 'ogz-meta/cognition/mercury-bridge'));
const output = path.join(root, 'test/fixtures/iteration-policy-runtime');
fs.mkdirSync(output, { recursive: true });
const observations = [];
const repaired = process.argv.includes('--expect-repair');

async function main() {
  for (const role of ['architect', 'entomologist', 'exterminator', 'fixer', 'critic', 'forensics']) {
    const manifest = createManifest(`FIXTURE-iteration-${role}`);
    manifest.issue = 'Synthetic single behavior in fixture.js';
    manifest.entomologist.bugs_found = [{ type: 'fixture', location: 'fixture.js:1', description: 'synthetic', code: 'before' }];
    manifest.exterminator.proposals = [{ bug_id: 'fixture', location: 'fixture.js:1', proposed_fix: 'after' }];
    manifest.architect.plan = { files: [{ path: 'fixture.js', changes: [] }] };
    const file = path.join(output, `${role}.json`);
    saveManifest(manifest, file);
    const count = calls.length;
    await route(`/${role}`, { manifest: file });
    const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(calls.length - count, 1);
    const request = calls.at(-1);
    assert.equal(request.maxTokens, 7750);
    assert.equal(request.quiet, true);
    assert.equal(actual[role].mercury_failed, true);
    assert.equal(shouldStop(actual).stop, true);
    if (repaired) assert.equal(request.maxIterations, undefined, role);
    observations.push({ role, request, state: actual.state, failure: actual[role].reason, stopped: shouldStop(actual).stop });
  }

  response = { answer: JSON.stringify({ plan: { summary: 'Synthetic plan', files: [], ordering: [] } }), termination: 'answer_given', iterations: 20 };
  const params = { role: 'architect', task: 'synthetic request observation', target: { issue: 'fixture' }, outputFormat: 'structured_plan' };
  for (const options of [{}, { maxIterations: 3 }]) {
    const count = calls.length;
    const result = await callMercury({ ...params, options });
    assert.equal(calls.length - count, 1);
    assert.equal(result.success, true);
    assert.equal(result.data.plan.summary, 'Synthetic plan');
    assert.equal(calls.at(-1).maxTokens, 7750);
    if (options.maxIterations) assert.equal(calls.at(-1).maxIterations, 3);
    else if (repaired) assert.equal(calls.at(-1).maxIterations, undefined);
    observations.push({ role: options.maxIterations ? 'explicit_operator_limit' : 'bridge_default', request: calls.at(-1), success: result.success, plan: result.data.plan });
  }
  console.log('OBSERVATION_JSON=' + JSON.stringify({ sourceMode: repaired ? 'candidate' : 'baseline', realProviderCalls: 0, boundary: 'synthetic runAgentic response; actual six router handlers, bridge, parsers and manifest persistence', observations }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
