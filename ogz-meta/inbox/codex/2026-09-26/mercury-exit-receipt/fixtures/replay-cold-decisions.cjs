'use strict';
// Replays reporting on original live seat answers; does not rerun the models.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const packet = path.resolve(__dirname, '..');
const root = path.resolve(__dirname, '../../../../../..');
const clone = path.join(packet, 'private/cold-pull-5gJPFK');
require(path.join(root, 'node_modules/dotenv')).config({ path: path.join(root, '.env'), quiet: true });
const ownerPath = path.join(clone, 'trai_brain/mercury-bridge/reviewer-panel.js');
const historicalOwner = new Module(ownerPath, module);
historicalOwner.filename = ownerPath;
historicalOwner.paths = Module._nodeModulePaths(path.dirname(ownerPath));
historicalOwner._compile(execFileSync('git', ['show',
  'a51b33e4ccafa4a082e503c0423af7aad8805919:trai_brain/mercury-bridge/reviewer-panel.js'],
  { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }), ownerPath);
require.cache[ownerPath] = historicalOwner;
const oldOwner = historicalOwner.exports;
const newOwner = require(path.join(root, 'trai_brain/mercury-bridge/reviewer-panel'));
const { buildRunLedgerEntry } = require(path.join(clone, 'trai_brain/mercury-bridge/run-ledger'));
const { formatAdversarialReviewPacket } = require(path.join(clone, 'trai_brain/mercury-bridge/adversarial-review'));
const ledger = path.join(clone, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/ledger/2026-09-26.jsonl');
const originalBytes = fs.readFileSync(ledger);
const runs = originalBytes.toString('utf8').trim().split('\n').map(JSON.parse)
  .filter(row => ['2026-09-26T02-09-13-070Z-0dabcb61823d',
    '2026-09-26T02-13-00-248Z-34448cdfcba4'].includes(row.run_id));
// The cold-clone receipt consumers share its reviewer-panel module. Substitute
// only the corrected function, leaving all other reporting source cold-pulled.
// Both consumers call the function captured on import, so reload them after.
oldOwner.reportedPanelDecision = newOwner.reportedPanelDecision;
delete require.cache[require.resolve(path.join(clone, 'trai_brain/mercury-bridge/run-ledger'))];
delete require.cache[require.resolve(path.join(clone, 'trai_brain/mercury-bridge/adversarial-review'))];
const correctedLedger = require(path.join(clone, 'trai_brain/mercury-bridge/run-ledger'));
const correctedPacket = require(path.join(clone, 'trai_brain/mercury-bridge/adversarial-review'));
const results = runs.map(row => {
  const panel = row.reviewer_panel;
  const original = JSON.stringify(panel);
  const result = { answer: panel.seats[0].answer, reviewerPanel: panel, termination: row.termination,
    toolTelemetry: {}, adversarialReview: { ok: true,
      answer: row.adversarial_review.answer_full, parsed: row.adversarial_review.parsed,
      rechecks: row.adversarial_review.rechecks.map(r => ({ answer: r.answer_full })) } };
  const before = buildRunLedgerEntry({ repoRoot: clone, query: row.prompt_excerpt, result });
  const after = correctedLedger.buildRunLedgerEntry({ repoRoot: clone, query: row.prompt_excerpt, result });
  const packetBefore = formatAdversarialReviewPacket({ originalQuery: row.prompt_excerpt,
    mercuryResult: result, review: result.adversarialReview, panel });
  const packetAfter = correctedPacket.formatAdversarialReviewPacket({ originalQuery: row.prompt_excerpt,
    mercuryResult: result, review: result.adversarialReview, panel });
  assert.equal(after.verdict, panel.seats.at(-1).parsed.verdict);
  assert.equal(packetAfter.split('\n')[0], `VERDICT: ${after.verdict}`);
  assert.equal(JSON.stringify(panel), original);
  if (panel.seats.at(-1).parsed.verdict === 'pass') {
    assert.equal(before.verdict, 'no_break_found');
    assert.equal(after.verdict, 'pass');
    assert.ok(panel.seats.filter(seat => seat.id !== 'kimi').every(seat => seat.parsed.verdict === 'found_break'));
  }
  return { original_run: row.run_id, historical_verdict_unchanged: row.verdict,
    before: before.verdict, corrected: after.verdict,
    packet_before: packetBefore.split('\n')[0], packet_after: packetAfter.split('\n')[0],
    reported: after.reviewer_panel.reported_decision,
    seat_verdicts: panel.seats.map(s => ({ id: s.id, verdict: s.parsed.verdict })),
    all_original_answers_preserved: true };
});
assert.deepEqual(fs.readFileSync(ledger), originalBytes);
const observation = { kind: 'Actual receipt owners replaying live answers, not a fresh provider run', results };
fs.writeFileSync(path.join(packet, 'private/live-decision-replay-postpull.json'), JSON.stringify(observation, null, 2) + '\n', {
  flag: 'wx', mode: 0o600,
});
console.log(JSON.stringify(observation, null, 2));
