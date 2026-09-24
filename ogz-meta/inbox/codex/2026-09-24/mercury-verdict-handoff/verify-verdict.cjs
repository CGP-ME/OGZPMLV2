'use strict';
// No provider calls. Replay saved answers and direct producer/consumer cases.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
const bridge = path.join(root, 'trai_brain/mercury-bridge');
const { finalizeMercuryEvidenceResult, panelSeatMetadata, runReviewRechecks, buildMercuryIntentPrompt } = require(path.join(bridge, 'ask'));
const { structuredPanelVerdict, evaluatePanelAuthority } = require(path.join(bridge, 'reviewer-panel'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const cases = [
  { name: 'explicit no break', answer: 'VERDICT: no_break_found\nADVERSARIAL_REVIEW_BLOCKING: no', expected: 'pass' },
  { name: 'explicit break', answer: 'VERDICT: found_break\nADVERSARIAL_REVIEW_BLOCKING: yes', expected: 'found_break' },
  { name: 'explicit cannot verify', answer: 'VERDICT: cannot_verify\nADVERSARIAL_REVIEW_BLOCKING: yes', expected: 'cannot_verify' },
  { name: 'prose success', answer: 'Everything works and no break was found.', expected: 'no_claim' },
  { name: 'missing blocking', answer: 'VERDICT: no_break_found', expected: 'cannot_verify' },
  { name: 'unknown', answer: 'VERDICT: unknown\nADVERSARIAL_REVIEW_BLOCKING: no', expected: 'no_claim' },
  { name: 'partial loop', answer: 'VERDICT: no_break_found\nADVERSARIAL_REVIEW_BLOCKING: no', termination: 'max_iterations', expected: 'no_claim' },
  { name: 'keep existing parsed', answer: 'VERDICT: no_break_found\nADVERSARIAL_REVIEW_BLOCKING: no', parsed: { verdict: 'found_break', blocking: true }, expected: 'found_break' },
];

async function main() {
  const outcomes = cases.map(c => {
    const input = { answer: c.answer, termination: c.termination || 'answer_given', ...(c.parsed ? { parsed: c.parsed } : {}) };
    const original = input.answer;
    finalizeMercuryEvidenceResult(input);
    const metadata = panelSeatMetadata('mercury', input);
    return { name: c.name, expected: c.expected, observed: metadata.verdict,
      answerUnchanged: original === input.answer, evidenceChecksPassed: metadata.evidenceChecksPassed,
      passed: metadata.verdict === c.expected && original === input.answer && !metadata.evidenceChecksPassed };
  });
  const recheck = await runReviewRechecks({
    prompts: ['Single synthetic recheck'], evidenceSources: [], createProviderAudit: () => null,
    runLoop: async () => ({ answer: cases[1].answer, termination: 'answer_given' }),
    notify: async items => items,
  });
  const historical = [];
  for (const relative of ['ogz-meta/cognition-history/mercury-runs/2026-09-19.jsonl',
    'ogz-meta/cognition-history/mercury-runs/2026-09-20.jsonl',
    'ogz-meta/inbox/codex/2026-09-23/stop1-landing-review/ledger/2026-09-23.jsonl']) {
    const bytes = fs.readFileSync(path.join(root, relative));
    for (const [index, line] of bytes.toString('utf8').trim().split('\n').entries()) {
      const entry = JSON.parse(line);
      const seats = entry.reviewer_panel?.seats || [];
      const mercury = seats.find(s => s.id === 'mercury');
      if (!mercury || !mercury.answer) continue;
      const result = finalizeMercuryEvidenceResult({ answer: mercury.answer, termination: 'answer_given' });
      const verdict = structuredPanelVerdict(result.parsed);
      const revised = seats.map(s => s === mercury ? { ...s, verdict } : s);
      historical.push({ receipt: `${relative}:${index + 1}`, receiptSha256: sha(line),
        runId: entry.run_id, answerSha256: sha(mercury.answer), before: mercury.verdict, after: verdict,
        originalCeiling: entry.reviewer_panel.authority?.ceiling,
        replayCeiling: evaluatePanelAuthority(revised).ceiling,
        originalAbsences: mercury.doctrineReview?.namedAbsences || [] });
    }
  }
  const prompt = buildMercuryIntentPrompt('Mercury, break my fix.');
  const required = ['VERDICT:', 'ADVERSARIAL_REVIEW_BLOCKING:', 'CANDIDATE SET:', 'AST EVIDENCE:',
    'INHERITED:', 'FOURTH SHAPE CLASSIFIER:', 'ALLEGATIONS:', 'SUBSTANTIVE RESOLUTION:',
    'WHAT I DID:', 'WHAT I DID NOT DO:', 'WHAT I ASSUMED:', 'WHY THIS VERDICT:', 'IF INCOMPLETE, WHY:'];
  const receipt = { observedAt: new Date().toISOString(), outcomes, historical,
    recheckVerdict: structuredPanelVerdict(recheck.rechecks[0].parsed),
    promptFields: required.map(field => ({ field, present: prompt.includes(field) })),
    sourceHashes: ['ask.js', 'doctrine-review.js', 'adversarial-review.js', 'reviewer-panel.js']
      .map(file => ({ file, sha256: sha(fs.readFileSync(path.join(bridge, file))) })),
    limitations: ['Synthetic cases and saved-answer replay, not a new provider review.',
      'Historical failures and coverage gaps remain; no authority criterion was changed.',
      'No Jest, DB, bot, PM2, broker, deployment or reindex.'] };
  receipt.passed = outcomes.every(o => o.passed) && receipt.recheckVerdict === 'found_break'
    && receipt.promptFields.every(f => f.present)
    && historical.every(r => r.originalCeiling !== 'UNVERIFIED' || r.replayCeiling === 'UNVERIFIED');
  fs.writeFileSync(path.join(__dirname, 'verdict-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ passed: receipt.passed, cases: outcomes.length, recheckVerdict: receipt.recheckVerdict,
    historical: historical.length, recoveredExplicitVerdicts: historical.filter(r => r.before === 'no_claim' && r.after !== 'no_claim').length,
    missingPromptFields: receipt.promptFields.filter(f => !f.present), historicalCeilings: [...new Set(historical.map(r => r.replayCeiling))] }));
  if (!receipt.passed) process.exitCode = 1;
}
main().catch(error => { console.error(`${error.name}: ${error.message}`); process.exitCode = 1; });
