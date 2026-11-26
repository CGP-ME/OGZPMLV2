'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const calls = [];
let scenario;
let attempt;
const answer = { answer: JSON.stringify({ plan: { summary: 'Synthetic completed plan', files: [], ordering: [] } }), termination: 'answer_given', iterations: 5 };
const ask = require.resolve(path.join(root, 'trai_brain/mercury-bridge/ask.js'));
require.cache[ask] = { id: ask, filename: ask, loaded: true, exports: {
  runAgentic: async (prompt, options) => {
    attempt += 1;
    calls.push({ scenario, attempt, maxTokens: options.maxTokens });
    if (scenario === 'reset_then_success' && attempt === 1) throw new Error('Synthetic ECONNRESET after investigation');
    if (scenario === 'persistent_429') throw new Error('Synthetic 429 input_token_limit');
    if (scenario === 'returned_failure') return { answer: '(Synthetic failure)', termination: 'error', iterations: 5 };
    return answer;
  },
} };
const { createManifest, saveManifest, shouldStop } = require(path.join(root, 'ogz-meta/manifest-schema'));
const { route } = require(path.join(root, 'ogz-meta/slash-router'));
const output = path.join(root, 'test/fixtures/dispatch-replay-runtime');
fs.mkdirSync(output, { recursive: true });
const repaired = process.argv.includes('--expect-repair');
const observations = [];

async function main() {
  for (scenario of ['reset_then_success', 'persistent_429', 'returned_failure', 'success']) {
    attempt = 0;
    const m = createManifest(`FIXTURE-replay-${scenario}`);
    m.issue = 'Synthetic single behavior in fixture.js';
    const file = path.join(output, `${scenario}.json`);
    saveManifest(m, file);
    await route('/architect', { manifest: file });
    const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
    const event = fs.readFileSync(path.join(root, 'ogz-meta/logs/ai-activity.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).at(-1);
    const observation = { scenario, wholeInvestigations: attempt, state: actual.state,
      stopped: shouldStop(actual).stop, reason: actual.architect.reason || null,
      plan: actual.architect.plan, activity: event };
    if (scenario === 'success') {
      assert.equal(attempt, 1);
      assert.equal(observation.stopped, false);
      assert.equal(observation.plan.summary, 'Synthetic completed plan');
    } else if (repaired || scenario === 'returned_failure' || scenario === 'persistent_429') {
      if (repaired || scenario === 'returned_failure') assert.equal(attempt, 1);
      assert.equal(observation.stopped, true);
      assert.equal(actual.state, 'HALTED');
      assert.equal(event.event, 'mercury_failure');
      assert.equal(event.error, observation.reason);
    }
    observations.push(observation);
  }
  console.log('OBSERVATION_JSON=' + JSON.stringify({ sourceMode: repaired ? 'candidate' : 'baseline', realProviderCalls: 0,
    boundary: 'synthetic runAgentic success, exception and incomplete answers; actual bridge, architect router, parser, failure activity and persisted manifest', observations, calls }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
