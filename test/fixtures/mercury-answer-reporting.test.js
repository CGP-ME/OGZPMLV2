'use strict';

const {
  ensureReviewerAnswer, hasReviewerAnswer, runReviewerPanel, reportedPanelDecision,
} = require('../../trai_brain/mercury-bridge/reviewer-panel');
const {
  finalizeMercuryEvidenceResult, panelSeatMetadata, recomputePanelSeatFromRecheck,
} = require('../../trai_brain/mercury-bridge/ask');
const { assessDoctrineReview } = require('../../trai_brain/mercury-bridge/doctrine-review');
const { runReactLoop } = require('../../trai_brain/mercury-bridge/react-loop');

function delivered(answer) {
  return {
    answer,
    rawFinalAnswer: { role: 'assistant', content: answer },
    termination: 'review_receipt_incomplete',
    lifecycle: { status: 'incomplete', missingFields: ['MISSING EVIDENCE'] },
  };
}

describe('Mercury answer delivery and report wording', () => {
  test.each([false, true])('actual response producer reaches the panel with complete fields=%s', async complete => {
    const answer = 'VERDICT: no_break_found\nWHY THIS VERDICT: core/example.js:1 returns the expected value.'
      + (complete ? '\nMISSING EVIDENCE: none' : '');
    const result = await runReactLoop({
      client: { generateWithTools: jest.fn(async () => ({ role: 'assistant', content: answer })) },
      toolAdapter: { buildToolSchema: () => [], execute: jest.fn() },
      userQuery: 'Mercury, break my fix.', attack: true, maxIterations: 2,
    });
    const panel = await runReviewerPanel({ selected: ['mercury'], isHardStop: () => false,
      runSeat: async () => {
        ensureReviewerAnswer(result, 'mercury');
        finalizeMercuryEvidenceResult(result);
        return panelSeatMetadata('mercury', result);
      } });
    expect(panel.seats[0]).toMatchObject({ status: 'succeeded', answer, parsed: { verdict: 'no_break_found' } });
    expect(panel.seats[0].termination).toBe(result.termination);
    expect(panel.seats[0].evidenceChecksPassed).toBe(false);
    console.log(`Producer complete=${complete}: ${result.termination} -> ${panel.seats[0].status}; evidence=false`);
  });

  test('actual transport-error and partial-tool-loop producers still fail answer qualification', async () => {
    const toolAdapter = { buildToolSchema: () => [], execute: jest.fn(async () => ({ text: 'source' })) };
    const error = await runReactLoop({
      client: { generateWithTools: jest.fn(async () => { throw new Error('HTTP 401: unauthorized'); }) },
      toolAdapter, userQuery: 'Mercury, break my fix.', attack: true, maxIterations: 1,
    });
    const partial = await runReactLoop({
      client: { generateWithTools: jest.fn(async () => ({ tool_calls: [{ id: 'read', type: 'function',
        function: { name: 'open_file', arguments: '{"path":"core/example.js"}' } }] })) },
      toolAdapter, userQuery: 'Mercury, break my fix.', attack: true, maxIterations: 1,
    });
    for (const result of [error, partial]) {
      expect(() => ensureReviewerAnswer(result, 'mercury')).toThrow();
      finalizeMercuryEvidenceResult(result);
      expect(result.parsed).toBeUndefined();
    }
    console.log(`Failure producers: ${error.termination}, ${partial.termination}; both rejected`);
  });

  test.each(['found_break', 'no_break_found', 'cannot_verify'])(
    'retains the delivered %s verdict independently of missing report fields', async verdict => {
      const result = delivered(`VERDICT: ${verdict}\nADVERSARIAL_REVIEW_BLOCKING: ${verdict === 'no_break_found' ? 'no' : 'yes'}\nWHY THIS VERDICT: core/example.js:12 supports this conclusion.`);
      const panel = await runReviewerPanel({
        selected: ['mercury', 'astra'],
        isHardStop: () => false,
        runSeat: async ({ id }) => {
          ensureReviewerAnswer(result, id);
          finalizeMercuryEvidenceResult(result);
          return panelSeatMetadata(id, result);
        },
      });
      expect(panel.seats.map(seat => seat.status)).toEqual(['succeeded', 'succeeded']);
      expect(panel.seats[0]).toMatchObject({
        answer: result.answer, termination: 'review_receipt_incomplete',
        lifecycle: result.lifecycle, parsed: { verdict },
        unavailable: false, failed: false, evidenceChecksPassed: false,
      });
      expect(panel.diagnostics.issues).not.toContain('selected_seat_unavailable');
      expect(panel.diagnostics.issues).not.toContain('insufficient_qualifying_seats');
      expect(panel.diagnostics.issues).toContain('evidence_failure');
      expect(panel.diagnostics.issues).toContain('identity_attestation_absent');
      expect(reportedPanelDecision(panel).verdict).toBe(verdict);
      expect(panel.seats.some(seat => seat.id === 'kimi')).toBe(false);
    }
  );

  test('a delivered prose answer cannot manufacture an explicit verdict', () => {
    const result = delivered('I found no break in core/example.js:12.');
    ensureReviewerAnswer(result, 'mercury');
    finalizeMercuryEvidenceResult(result);
    expect(result.parsed).toBeUndefined();
    expect(panelSeatMetadata('mercury', result).verdict).toBe('no_claim');
  });

  test.each(['error', 'max_iterations', 'finalization_error', 'finalization_tool_call'])(
    '%s text is not promoted to a delivered review', termination => {
      const result = { ...delivered('VERDICT: no_break_found'), termination };
      expect(hasReviewerAnswer(result)).toBeFalsy();
      expect(() => ensureReviewerAnswer(result, 'mercury')).toThrow();
      finalizeMercuryEvidenceResult(result);
      expect(result.parsed).toBeUndefined();
    }
  );

  test('empty, missing and tool-call-only final messages remain absent', () => {
    for (const result of [
      delivered('   '),
      { ...delivered('(empty content)'), rawFinalAnswer: { content: '' } },
      { ...delivered('VERDICT: no_break_found'), rawFinalAnswer: null },
      { ...delivered('VERDICT: no_break_found'), rawFinalAnswer: { content: 'different answer' } },
      { ...delivered('VERDICT: no_break_found'), rawFinalAnswer: { content: 'VERDICT: no_break_found', tool_calls: [{}] } },
    ]) expect(() => ensureReviewerAnswer(result, 'mercury')).toThrow();
    expect(() => ensureReviewerAnswer({ termination: 'error', answer: 'HTTP 429: rate limit' }, 'mercury'))
      .toThrow(expect.objectContaining({ absence: 'quota_or_rate_limit' }));
  });

  test('rechecks preserve delivered uncertainty and report diagnostics', () => {
    const recheck = delivered('VERDICT: cannot_verify\nADVERSARIAL_REVIEW_BLOCKING: yes\nWHY THIS VERDICT: Source is unread.');
    finalizeMercuryEvidenceResult(recheck);
    const seat = recomputePanelSeatFromRecheck({ id: 'mercury', verdict: 'pass' }, recheck);
    expect(seat).toMatchObject({ verdict: 'cannot_verify', termination: recheck.termination, lifecycle: recheck.lifecycle });
    expect(seat.evidenceChecksPassed).toBe(false);
  });

  test.each(['environment-bypass', 'environment‑bypass', 'bypass env', 'environment override'])(
    'ordinary %s wording and untagged retractions preserve actual coverage gaps', wording => {
      const assessment = assessDoctrineReview({
        answer: `CANDIDATE SET: examined 1 of 1\nINHERITED: config/internals.json has no ${wording} behavior.\nALLEGATIONS: The earlier missing-owner allegation is withdrawn; config/internals.json:10 defines it.`,
        changedFiles: ['config/internals.json'],
        candidateSet: { content: 'CANDIDATE SET: examined 1 of 1', coverage: { complete: false, authorityReady: false } },
        telemetry: { fileReads: [{ file: 'config/internals.json', startLine: 10, endLine: 20, totalLines: 1644 }] },
      });
      expect(assessment.namedAbsences).toEqual(['coverage_insufficient', 'coverage_unresolved', 'whole_file_read_absent']);
    }
  );

  test('writing every old tag cannot create whole-file, AST or producer evidence', () => {
    const assessment = assessDoctrineReview({
      answer: 'CANDIDATE SET: examined 1 of 1\nINHERITED: core/example.js || 0 swallowed catch bypass env silent default\nALLEGATIONS: MECHANICAL RECEIPT',
      changedFiles: ['core/example.js'],
      diff: 'diff --git a/core/example.js b/core/example.js\n@@ -1 +1 @@\n+throw new Error("bad");',
    });
    expect(assessment.namedAbsences).toEqual(expect.arrayContaining([
      'whole_file_read_absent', 'ast_evidence_absent', 'fourth_shape_unclassified',
    ]));
  });
});
