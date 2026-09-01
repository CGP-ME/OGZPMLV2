'use strict';

const {
  REVIEWER_REGISTRY,
  canAttachFinalReview,
  effectiveIdentityFingerprint,
  ensureReviewerAnswer,
  evaluatePanelAuthority,
  parseReviewerSelection,
  positiveEvidenceBasis,
  resolveReviewerSelection,
  runReviewerPanel,
  structuredPanelVerdict,
} = require('../trai_brain/mercury-bridge/reviewer-panel');

describe('selectable Mercury adversarial reviewer panel', () => {
  test('registry exposes the current reviewer choices in stable order', () => {
    expect(REVIEWER_REGISTRY.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'mercury', label: 'Mercury' },
      { id: 'fable', label: 'Fable' },
      { id: 'kimi', label: 'Kimi' },
    ]);
  });

  test('parses, validates, and deduplicates explicit reviewer order', () => {
    expect(parseReviewerSelection('kimi,mercury,kimi,fable')).toEqual([
      'kimi', 'mercury', 'fable',
    ]);
    expect(() => parseReviewerSelection('')).toThrow('at least one reviewer');
    expect(() => parseReviewerSelection('mercury,unknown')).toThrow('Unknown reviewer');
    for (const selection of [
      'mercury', 'fable', 'kimi',
      'mercury,fable', 'mercury,kimi', 'fable,kimi',
      'mercury,fable,kimi',
    ]) {
      expect(parseReviewerSelection(selection)).toEqual(selection.split(','));
    }
  });

  test('explicit selection wins without prompting and stamps unselected seats', async () => {
    const prompt = jest.fn();
    await expect(resolveReviewerSelection({
      explicit: 'fable,kimi', interactive: true, prompt,
    })).resolves.toEqual({
      requested: ['fable', 'kimi'],
      selected: ['fable', 'kimi'],
      unselected: ['mercury'],
      source: 'explicit',
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  test('interactive no-selection prompts with registry-backed choices', async () => {
    const prompt = jest.fn(async ({ message, choices }) => {
      expect(message).toBe('Select reviewers for this adversarial run');
      expect(choices).toEqual(REVIEWER_REGISTRY);
      return ['kimi', 'mercury'];
    });
    await expect(resolveReviewerSelection({ interactive: true, prompt })).resolves.toEqual({
      requested: ['kimi', 'mercury'],
      selected: ['kimi', 'mercury'],
      unselected: ['fable'],
      source: 'interactive',
    });
  });

  test('non-interactive no-selection stamps the existing default panel', async () => {
    await expect(resolveReviewerSelection({
      interactive: false,
      defaultReviewers: ['mercury', 'fable', 'kimi'],
    })).resolves.toEqual({
      requested: null,
      selected: ['mercury', 'fable', 'kimi'],
      unselected: [],
      source: 'configured_default',
    });
  });

  test('dispatches exactly selected seats in declared order and continues after named absence', async () => {
    const calls = [];
    const panel = await runReviewerPanel({
      selected: ['fable', 'mercury', 'kimi'],
      runSeat: async (reviewer) => {
        calls.push(reviewer.id);
        if (reviewer.id === 'mercury') {
          const error = new Error('HTTP 429 rate limit');
          error.absence = 'quota_or_rate_limit';
          throw error;
        }
        return {
          answer: `${reviewer.id} answer`,
          verdict: 'pass',
          evidenceChecksPassed: true,
          effectiveIdentityFingerprint: `${reviewer.id}:model:attested`,
        };
      },
      isHardStop: () => false,
    });

    expect(calls).toEqual(['fable', 'mercury', 'kimi']);
    expect(panel.seats).toEqual([
      expect.objectContaining({ id: 'fable', status: 'succeeded' }),
      expect.objectContaining({ id: 'mercury', status: 'failed', absence: 'quota_or_rate_limit' }),
      expect.objectContaining({ id: 'kimi', status: 'succeeded' }),
    ]);
    expect(panel.authority).toMatchObject({
      ceiling: 'UNVERIFIED',
      agreement: true,
      qualifyingSeats: 2,
      capReasons: ['selected_seat_unavailable'],
      rerunRequired: true,
      survivorAuthority: { ceiling: 'FULL', agreedVerdict: 'pass' },
    });
  });

  test.each([
    'mercury', 'fable', 'kimi',
    'mercury,fable', 'mercury,kimi', 'fable,kimi',
    'mercury,fable,kimi',
    'kimi,fable', 'kimi,mercury,fable', 'fable,mercury', 'kimi,mercury',
  ])('persists every selected answer and ordered dependency receipt for %s', async (selection) => {
    const selected = selection.split(',');
    const panel = await runReviewerPanel({
      selected,
      runSeat: async (reviewer, priorSeats) => ({
        id: 'spoofed', label: 'spoofed', status: 'failed', qualifying: false,
        answer: `${reviewer.id} substance`,
        verdict: 'pass',
        evidenceChecksPassed: true,
        effectiveIdentityFingerprint: `${reviewer.id}:model:attested`,
        inputDependencies: priorSeats.map(seat => ({ sequence: seat.sequence, id: seat.id })),
      }),
      isHardStop: () => false,
    });

    expect(panel.seats.map(seat => seat.id)).toEqual(selected);
    expect(panel.seats.map(seat => seat.answer)).toEqual(selected.map(id => `${id} substance`));
    expect(panel.seats.map(seat => seat.status)).toEqual(selected.map(() => 'succeeded'));
    expect(panel.seats.map(seat => seat.sequence)).toEqual(selected.map((_, index) => index + 1));
    for (const [index, seat] of panel.seats.entries()) {
      expect(seat.inputDependencies).toEqual(panel.seats.slice(0, index).map(prior => ({
        sequence: prior.sequence, id: prior.id,
      })));
    }
  });

  test('unattested executable is the only delegated hard stop', async () => {
    const error = new Error('unattested executable');
    await expect(runReviewerPanel({
      selected: ['fable', 'kimi'],
      runSeat: async () => { throw error; },
      isHardStop: candidate => candidate === error,
    })).rejects.toBe(error);
  });

  test('classifies an in-band Mercury quota response as a failed seat rather than a clean answer', () => {
    expect(() => ensureReviewerAnswer({
      termination: 'error',
      answer: '(Mercury call failed: HTTP 402: free_tier_quota_exceeded)',
    }, 'mercury')).toThrow(expect.objectContaining({ absence: 'quota_or_rate_limit' }));
    expect(() => ensureReviewerAnswer({
      termination: 'answer_given', answer: 'No concrete break found.',
    }, 'mercury')).not.toThrow();
  });

  test('authority is UNVERIFIED for one clean seat, disagreement, or failed evidence checks', () => {
    expect(evaluatePanelAuthority([
      {
        id: 'mercury', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true,
        effectiveIdentityFingerprint: 'mercury:model:attested',
      },
    ])).toMatchObject({
      ceiling: 'UNVERIFIED', qualifyingSeats: 1,
      capReasons: ['insufficient_qualifying_seats'], rerunRequired: true,
    });

    expect(evaluatePanelAuthority([
      {
        id: 'mercury', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true,
        effectiveIdentityFingerprint: 'mercury:model:attested',
      },
      {
        id: 'fable', status: 'succeeded', verdict: 'found_break', evidenceChecksPassed: true,
        effectiveIdentityFingerprint: 'fable:model:attested',
      },
    ])).toMatchObject({
      ceiling: 'UNVERIFIED', agreement: false, rerunRequired: true,
      capReasons: ['reviewer_disagreement'],
    });

    expect(evaluatePanelAuthority([
      {
        id: 'mercury', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true,
        effectiveIdentityFingerprint: 'mercury:model:attested',
      },
      {
        id: 'fable', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: false,
        effectiveIdentityFingerprint: 'fable:model:attested',
      },
    ])).toMatchObject({
      ceiling: 'UNVERIFIED', agreement: true, evidenceChecksPassed: false,
      capReasons: ['evidence_failure'], rerunRequired: true,
    });
  });

  test('duplicate effective identities cap authority despite agreeing registry seats', () => {
    expect(evaluatePanelAuthority([
      {
        id: 'mercury', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true,
        effectiveIdentityFingerprint: 'provider:same-model:same-attestation',
      },
      {
        id: 'fable', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true,
        effectiveIdentityFingerprint: 'provider:same-model:same-attestation',
      },
    ])).toMatchObject({
      ceiling: 'UNVERIFIED', capReasons: ['identity_collision'], rerunRequired: true,
    });
  });

  test('seat verdict requires an explicit unambiguous structured field', () => {
    expect(structuredPanelVerdict(null)).toBe('cannot_verify');
    expect(structuredPanelVerdict({ verdict: 'pass', blocking: false })).toBe('pass');
    expect(structuredPanelVerdict({ verdict: 'found_break', blocking: true })).toBe('found_break');
    expect(structuredPanelVerdict({ verdict: 'pass', blocking: true })).toBe('cannot_verify');
    expect(structuredPanelVerdict({ verdict: 'unknown', blocking: false })).toBe('cannot_verify');
  });

  test('positive evidence excludes zero-tool and model-sandbox-only claims', () => {
    expect(positiveEvidenceBasis({ toolTelemetry: {}, autoBlastRadius: null, evidenceSources: [] })).toEqual([]);
    expect(positiveEvidenceBasis({
      toolTelemetry: { runChecks: [{ status: 'passed', execution_provenance: 'model_sandbox' }] },
      autoBlastRadius: null,
      evidenceSources: [],
    })).toEqual([]);
    expect(positiveEvidenceBasis({
      toolTelemetry: {
        calls: [{ name: 'open_file', status: 'succeeded' }],
        runChecks: [{ status: 'passed', execution_provenance: 'trusted_path' }],
      },
      autoBlastRadius: { changedFileCount: 2, errors: [] },
      evidenceSources: [{ path: 'evidence.md', excerpt_sha256: 'abc' }],
    })).toEqual([
      'successful_repo_tool', 'trusted_run_check', 'verified_current_diff', 'host_attested_evidence',
    ]);
  });

  test('zero-tool Mercury and an agreeing downstream seat cannot qualify without host evidence', () => {
    const mercuryBasis = positiveEvidenceBasis({ toolTelemetry: {}, evidenceSources: [] });
    expect(evaluatePanelAuthority([
      {
        id: 'mercury', status: 'succeeded', verdict: 'pass',
        evidenceBasis: mercuryBasis, evidenceChecksPassed: mercuryBasis.length > 0,
        effectiveIdentityFingerprint: 'mercury:model:attested',
      },
      {
        id: 'fable', status: 'succeeded', verdict: 'pass',
        evidenceBasis: [], evidenceChecksPassed: false,
        effectiveIdentityFingerprint: 'fable:model:attested',
      },
    ])).toMatchObject({
      ceiling: 'UNVERIFIED', capReasons: ['evidence_failure'], rerunRequired: true,
    });
  });

  test('host evidence qualifies only a seat that received it', () => {
    const supplied = [{ path: 'evidence.md', excerpt_sha256: 'abc' }];
    expect(positiveEvidenceBasis({ evidenceSources: supplied })).toEqual(['host_attested_evidence']);
    expect(positiveEvidenceBasis({ evidenceSources: [] })).toEqual([]);
  });

  test('effective identity uses applied provider/model attestation, not registry id', () => {
    const attempt = {
      requested_provider: 'claude-code',
      applied_model: 'claude-opus-4-8',
      executable_trust: { trusted: true, version: '2.1.236' },
      identity_posture: { status: 'documented_transition', authority: 'full' },
    };
    expect(effectiveIdentityFingerprint('fable', [attempt]))
      .toBe(effectiveIdentityFingerprint('kimi', [attempt]));
    expect(effectiveIdentityFingerprint('fable', [{
      ...attempt, executable_trust: null, identity_posture: null,
    }])).toBeNull();
  });

  test('Kimi can adjudicate only an earlier exact Fable answer', () => {
    const fable = { id: 'fable', status: 'succeeded', sequence: 2, answer: 'exact Fable output' };
    const answerSha256 = require('crypto').createHash('sha256').update(fable.answer).digest('hex');
    expect(canAttachFinalReview(fable, {
      id: 'kimi', status: 'succeeded', sequence: 3,
      inputDependencies: [{ id: 'fable', sequence: 2, answerSha256 }],
    })).toBe(true);
    expect(canAttachFinalReview(fable, {
      id: 'kimi', status: 'succeeded', sequence: 1,
      inputDependencies: [{ id: 'fable', sequence: 2, answerSha256 }],
    })).toBe(false);
    expect(canAttachFinalReview(fable, {
      id: 'kimi', status: 'succeeded', sequence: 3,
      inputDependencies: [{ id: 'fable', sequence: 2, answerSha256: 'stale' }],
    })).toBe(false);
  });

  test('authority is monotonic downward under fuzzed uncertainty', () => {
    let state = 0x5eed1234;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const authorityRank = authority => authority.ceiling === 'FULL' ? 1 : 0;
    for (let iteration = 0; iteration < 250; iteration += 1) {
      const size = 2 + Math.floor(random() * 4);
      const base = Array.from({ length: size }, (_, index) => ({
        id: `seat-${index}`,
        status: 'succeeded',
        verdict: random() < 0.5 ? 'pass' : 'found_break',
        evidenceChecksPassed: true,
        effectiveIdentityFingerprint: `identity-${index}`,
      }));
      const degraded = base.map(seat => ({ ...seat }));
      const target = degraded[Math.floor(random() * degraded.length)];
      const uncertainty = Math.floor(random() * 3);
      if (uncertainty === 0) {
        target.status = 'failed';
        target.absence = 'quota_or_rate_limit';
      } else if (uncertainty === 1) {
        target.evidenceChecksPassed = false;
      } else {
        target.effectiveIdentityFingerprint = degraded[(degraded.indexOf(target) + 1) % degraded.length]
          .effectiveIdentityFingerprint;
      }
      expect(authorityRank(evaluatePanelAuthority(degraded)))
        .toBeLessThanOrEqual(authorityRank(evaluatePanelAuthority(base)));
    }
  });
});
