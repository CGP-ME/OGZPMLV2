'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = process.cwd();
// The isolation snapshot excludes .ignore suffixes. Supply the captured,
// non-secret policy only inside this disposable workspace.
const ignore = require('./mercury-ignore.json');
assert.equal(crypto.createHash('sha256').update(ignore.text).digest('hex'), ignore.sha256);
fs.writeFileSync(path.join(root, 'mercury.ignore'), ignore.text);
const askPath = require.resolve(path.join(root, 'trai_brain/mercury-bridge/ask.js'));
const { buildMercuryIntentPrompt } = require(askPath);
const { assessDoctrineReview } = require(path.join(root, 'trai_brain/mercury-bridge/doctrine-review'));
const requests = [];
require.cache[askPath].exports = {
  runAgentic: async (query, options) => {
    requests.push({ query, options, composedPrompt: buildMercuryIntentPrompt(query) });
    return { answer: 'VERDICT: cannot_verify\nWHAT I DID NOT DO: Synthetic provider boundary; no source investigation.',
      termination: 'answer_given', iterations: 1 };
  },
};
const serena = require.resolve(path.join(root, 'tools/serena-bridge.js'));
require.cache[serena] = { id: serena, filename: serena, loaded: true, exports: {
  getBlastRadius: async () => ({ callerCount: 0, riskLevel: 'synthetic', latencyMs: 0, summary: 'Synthetic dependency boundary' }),
  formatForMercury: () => 'Synthetic dependency boundary; no source claim.',
} };
const { createManifest, saveManifest } = require(path.join(root, 'ogz-meta/manifest-schema'));
const { route } = require(path.join(root, 'ogz-meta/slash-router'));
const dir = path.join(root, 'test/fixtures/focused-request-runtime');
fs.mkdirSync(dir, { recursive: true });
const spec = path.join(dir, 'spec.md');
fs.writeFileSync(spec, [
  '### Fix 1: Implementer diagnosis must not become the review question',
  '**File:** `core/CandleProcessor.js`', '**Line:** ~1',
  '**str_replace target:**', '```js', 'before', '```',
  '**str_replace replacement:**', '```js', 'after', '```',
].join('\n'));

async function main() {
  const manifest = createManifest('FIXTURE-focused-review');
  manifest.mode = 'EXECUTE';
  manifest.issue = 'Ownership of a queued candle when another candle arrives before processing.';
  manifest.spec_source = { path: spec, fixId: '1' };
  const file = path.join(dir, 'manifest.json');
  saveManifest(manifest, file);
  await route('/mercury-attack', { manifest: file });
  assert.equal(requests.length, 1);
  const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
  const request = requests[0];
  assert.equal(request.options.maxTokens, 7750);
  assert.equal(request.options.maxIterations, undefined);
  assert.equal(actual.critic.mercury_attack.completed, true);
  const transcript = fs.readFileSync(path.join(root, actual.critic.mercury_attack.transcript), 'utf8');
  assert.ok(transcript.includes('VERDICT: cannot_verify'));
  const directQuestion = 'Scope: ownership of a queued candle when another arrives before processing. How does this fail or cost me money in production?';
  const directPrompt = buildMercuryIntentPrompt(directQuestion);
  const diagnostics = assessDoctrineReview({ answer: 'VERDICT: cannot_verify', changedFiles: ['core/CandleProcessor.js'] });
  assert.ok(diagnostics.namedAbsences.includes('whole_file_read_absent'));
  assert.ok(diagnostics.namedAbsences.includes('inherited_section_incomplete'));
  console.log('OBSERVATION_JSON=' + JSON.stringify({ realProviderCalls: 0,
    boundary: 'Actual spec parser, router, prompt composition, transcript and diagnostic assessor; synthetic model and dependency discovery',
    issue: manifest.issue, request, directPrompt, diagnostics,
    directPromptSha256: crypto.createHash('sha256').update(directPrompt).digest('hex'),
    receipt: actual.critic.mercury_attack }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
