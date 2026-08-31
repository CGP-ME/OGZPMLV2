'use strict';

const {
  REVIEWER_REGISTRY,
  ensureReviewerAnswer,
  evaluatePanelAuthority,
  parseReviewerSelection,
  resolveReviewerSelection,
  runReviewerPanel,
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
        return { verdict: 'pass', evidenceChecksPassed: true };
      },
      isHardStop: () => false,
    });

    expect(calls).toEqual(['fable', 'mercury', 'kimi']);
    expect(panel.seats).toEqual([
      expect.objectContaining({ id: 'fable', status: 'succeeded' }),
      expect.objectContaining({ id: 'mercury', status: 'failed', absence: 'quota_or_rate_limit' }),
      expect.objectContaining({ id: 'kimi', status: 'succeeded' }),
    ]);
    expect(panel.authority).toMatchObject({ ceiling: 'FULL', agreement: true, qualifyingSeats: 2 });
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
      { id: 'mercury', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true },
    ])).toMatchObject({ ceiling: 'UNVERIFIED', qualifyingSeats: 1 });

    expect(evaluatePanelAuthority([
      { id: 'mercury', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true },
      { id: 'fable', status: 'succeeded', verdict: 'found_break', evidenceChecksPassed: true },
    ])).toMatchObject({ ceiling: 'UNVERIFIED', agreement: false, rerunRequired: true });

    expect(evaluatePanelAuthority([
      { id: 'mercury', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: true },
      { id: 'fable', status: 'succeeded', verdict: 'pass', evidenceChecksPassed: false },
    ])).toMatchObject({ ceiling: 'UNVERIFIED', agreement: true, evidenceChecksPassed: false });
  });
});
