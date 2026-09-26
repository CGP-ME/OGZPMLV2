'use strict';
// Calls the actual receipt owners. Synthetic reviewer states are not live review proof.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const { reportedPanelDecision, summarizePanelDiagnostics } = require(path.join(root, 'trai_brain/mercury-bridge/reviewer-panel'));
const { buildRunLedgerEntry } = require(path.join(root, 'trai_brain/mercury-bridge/run-ledger'));
const { assessDoctrineReview } = require(path.join(root, 'trai_brain/mercury-bridge/doctrine-review'));
const { formatAdversarialReviewPacket } = require(path.join(root, 'trai_brain/mercury-bridge/adversarial-review'));
const observations = [];
function exercise(name, seats) {
  const originals = JSON.stringify(seats);
  const panel = { selected: seats.map(s => s.id), unselected: [], source: 'fixture', seats };
  panel.diagnostics = summarizePanelDiagnostics(seats);
  const result = { answer: seats[0]?.answer, reviewerPanel: panel, termination: 'answer_given',
    toolTelemetry: {}, doctrineReview: assessDoctrineReview({ answer: '', changedFiles: ['fixture.js'] }),
    adversarialReview: { ok: true, answer: 'VERDICT: pass', parsed: { verdict: 'pass', blocking: false },
      quarantines: [{ unit: 'fixture', name: 'missing_source', absence: 'source_absent', load_bearing: true }],
      rechecks: [{ answer: 'VERDICT: cannot_verify', termination: 'answer_given',
        doctrineReview: { namedAbsences: ['followup_unread'] } }] } };
  const entry = buildRunLedgerEntry({ repoRoot: root, query: 'Receipt-only observation.', result });
  assert.deepEqual(entry.reviewer_panel.diagnostics, panel.diagnostics);
  assert.equal(entry.verdict, reportedPanelDecision(panel).verdict);
  assert.equal(entry.reviewer_panel.authority, undefined);
  assert.equal(entry.doctrine_review.authorityCeiling, undefined);
  assert.ok(entry.doctrine_review.namedAbsences.includes('inherited_section_incomplete'));
  assert.equal(entry.adversarial_review.effective_verdict, 'pass');
  assert.equal(entry.review_quarantines[0].absence, 'source_absent');
  assert.deepEqual(entry.adversarial_review.rechecks[0].doctrine_review.namedAbsences, ['followup_unread']);
  assert.equal(JSON.stringify(seats), originals);
  const packet = formatAdversarialReviewPacket({ originalQuery: 'Receipt observation', mercuryResult: result,
    review: result.adversarialReview, panel });
  assert.ok(packet.startsWith(`VERDICT: ${entry.verdict}\n`));
  observations.push({ name, verdict: entry.verdict, reported: entry.reviewer_panel.reported_decision,
    diagnostics: entry.reviewer_panel.diagnostics, doctrine: entry.doctrine_review.namedAbsences,
    failures: entry.review_quarantines, answers_unchanged: true });
  return entry;
}
const seat = (id, verdict, extras = {}) => ({ id, sequence: id === 'mercury' ? 1 : id === 'fable' ? 2 : 3,
  status: 'succeeded', answer: `VERDICT: ${verdict}\nCITED_REASONING: fixture only`,
  parsed: { verdict, blocking: verdict !== 'pass' }, verdict,
  evidenceChecksPassed: true, effectiveIdentityFingerprint: id, ...extras });
assert.equal(exercise('disagreement remains visible; final reviewer owns reported answer',
  [seat('mercury', 'found_break'), seat('fable', 'cannot_verify'), seat('kimi', 'pass')]).verdict, 'pass');
assert.equal(exercise('missing evidence and identity collision do not rewrite an answer',
  [seat('mercury', 'pass', { evidenceChecksPassed: false }), seat('kimi', 'pass', { effectiveIdentityFingerprint: 'mercury' })]).verdict, 'pass');
assert.equal(exercise('failed final seat is not an earlier pass',
  [seat('mercury', 'pass'), seat('kimi', 'pass', { status: 'failed', absence: 'auth_failed', answer: null })]).verdict, 'review_incomplete');
assert.equal(exercise('missing verdict is not a pass',
  [seat('kimi', 'pass', { parsed: {}, verdict: 'no_claim' })]).verdict, 'no_claim');
assert.equal(exercise('identity conflict remains visible',
  [seat('mercury', 'pass'), seat('kimi', 'pass', { identityConflict: true })]).reviewer_panel.diagnostics.issues.includes('identity_conflict'), true);
assert.equal(exercise('real adverse conclusion preserved', [seat('kimi', 'found_break')]).verdict, 'found_break');
assert.equal(exercise('real uncertainty preserved', [seat('kimi', 'cannot_verify')]).verdict, 'cannot_verify');
const historical = path.join(root, 'ogz-meta/inbox/codex/2026-09-25/mercury-claim-reconciliation/private/ledger/2026-09-25.jsonl');
if (fs.existsSync(historical)) {
  for (const row of fs.readFileSync(historical, 'utf8').trim().split('\n').map(JSON.parse).filter(row =>
    ['2026-09-25T09-42-55-706Z-899db6eda4e8', '2026-09-25T09-50-14-821Z-bb3fa34fe93d'].includes(row.run_id))) {
    const original = JSON.stringify(row);
    const decision = reportedPanelDecision(row.reviewer_panel);
    observations.push({ replay_of: row.run_id, historical_verdict_unchanged: row.verdict,
      new_reported_decision: decision, diagnostics: summarizePanelDiagnostics(row.reviewer_panel.seats) });
    assert.equal(JSON.stringify(row), original);
  }
}
console.log(JSON.stringify({ level: 'actual receipt-owner execution, synthetic states and historical replay; not live review', observations }, null, 2));
