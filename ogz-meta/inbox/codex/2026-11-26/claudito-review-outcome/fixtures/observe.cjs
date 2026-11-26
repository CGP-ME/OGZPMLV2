'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = process.cwd();
const ignore = require('../../mercury-focused-request/fixtures/mercury-ignore.json');
assert.equal(crypto.createHash('sha256').update(ignore.text).digest('hex'), ignore.sha256);
fs.writeFileSync(path.join(root, 'mercury.ignore'), ignore.text);
const { createManifest, saveManifest, shouldStop } = require(path.join(root, 'ogz-meta/manifest-schema'));
const { route } = require(path.join(root, 'ogz-meta/slash-router'));
const dir = path.join(root, 'test/fixtures/review-outcome-runtime');
fs.mkdirSync(dir, { recursive: true });
const longEvidence = 'Source inspection was documented in the attached receipt. '.repeat(70);
const examples = [
  { name: 'short_clean', body: 'VERDICT: no_break_found\nADVERSARIAL_REVIEW_BLOCKING: no\nWHY THIS VERDICT: The inspected consumer uses the producer value.', iterations: 2, outcome: 'no_break_found', gate: 'clean', stopped: false },
  { name: 'clean_with_bullets', body: 'VERDICT: no_break_found\nADVERSARIAL_REVIEW_BLOCKING: no\n1. Producer source inspected.\n2. Consumer source inspected.', iterations: 2, outcome: 'no_break_found', gate: 'clean', stopped: false },
  { name: 'long_cannot_verify', body: 'VERDICT: cannot_verify\nADVERSARIAL_REVIEW_BLOCKING: yes\n' + longEvidence, iterations: 20, outcome: 'cannot_verify', gate: 'unverified', stopped: true },
  { name: 'long_found_break', body: 'VERDICT: found_break\nADVERSARIAL_REVIEW_BLOCKING: yes\n' + longEvidence, iterations: 20, outcome: 'found_break', gate: 'findings', stopped: false },
  { name: 'missing_verdict', body: longEvidence, iterations: 20, outcome: 'no_claim', gate: 'unverified', stopped: true },
  { name: 'duplicate_verdict', body: 'VERDICT: no_break_found\nVERDICT: found_break\nADVERSARIAL_REVIEW_BLOCKING: no\n' + longEvidence, iterations: 20, outcome: 'no_claim', gate: 'unverified', stopped: true },
  { name: 'missing_blocking', body: 'VERDICT: no_break_found\n' + longEvidence, iterations: 20, outcome: 'no_claim', gate: 'unverified', stopped: true },
  { name: 'provider_failure', body: '(Mercury call failed: synthetic)', iterations: 2, completed: false, gate: 'infra_issue', stopped: true },
];
const repaired = process.argv.includes('--expect-repair');
async function main() {
  const observations = [];
  for (const example of examples) {
    const manifest = createManifest(`FIXTURE-verdict-${example.name}`);
    manifest.mode = 'EXECUTE';
    const transcript = path.join(dir, example.name + '.md');
    fs.writeFileSync(transcript, '# Synthetic receipt\n\n## Mercury Verdict\n\n' + example.body);
    manifest.critic.mercury_attack = { dispatched: true, completed: example.completed !== false,
      iterations: example.iterations, transcript: path.relative(root, transcript), error: example.completed === false ? 'synthetic provider failure' : undefined };
    const file = path.join(dir, example.name + '.json');
    saveManifest(manifest, file);
    await route('/mercury-critic', { manifest: file });
    const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
    const report = actual.critic.mercury_critic;
    const stop = shouldStop(actual);
    if (repaired) {
      if (example.completed === false) assert.equal(report, undefined, 'Provider failure stops before critic dispatch');
      else assert.equal(report.gate, example.gate, example.name);
      assert.equal(stop.stop, example.stopped, example.name);
      if (example.outcome) assert.equal(report.codeOutcome, example.outcome, example.name);
      if (example.stopped && example.completed !== false) assert.equal(actual.state, 'HALTED', example.name);
      if (example.completed === false) assert.equal(actual.state, manifest.state, 'Stopped dispatch preserves supplied manifest');
    }
    assert.equal(fs.readFileSync(transcript, 'utf8'), '# Synthetic receipt\n\n## Mercury Verdict\n\n' + example.body);
    observations.push({ name: example.name, declaredVerdict: example.body.split('\n')[0], bodyLength: example.body.length,
      iterations: example.iterations, report, stop, state: actual.state, transcriptPreserved: true });
  }
  console.log('OBSERVATION_JSON=' + JSON.stringify({ mode: repaired ? 'candidate' : 'baseline', realProviderCalls: 0,
    boundary: 'Actual transcript reader, router, verdict parser and persisted manifest; synthetic provider transcripts', observations }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
