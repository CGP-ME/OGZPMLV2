'use strict';

const {
  maturityFromSamples,
  resolvePatternMaturity,
  stampPatternMaturity,
} = require('../core/PatternMaturity');

describe('Pattern maturity truth contract', () => {
  const now = Date.parse('2026-05-29T16:00:00.000Z');

  test('does not invent maturity when no sample evidence exists', () => {
    expect(resolvePatternMaturity({ name: 'DTW_MATCH' }, null, now)).toEqual({
      sampleCount: null,
      maturity: null,
    });
    expect(maturityFromSamples(null, {}, now)).toBeNull();
    expect(maturityFromSamples(0, {}, now)).toBeNull();
  });

  test('classifies observed sample counts into maturity tiers', () => {
    expect(maturityFromSamples(1, { lastSeen: now }, now)).toBe('New');
    expect(maturityFromSamples(3, { lastSeen: now }, now)).toBe('Forming');
    expect(maturityFromSamples(6, { lastSeen: now }, now)).toBe('Confirmed');
    expect(maturityFromSamples(6, { firstSeen: now - 31 * 60 * 1000, lastSeen: now }, now)).toBe('Mature');
    expect(maturityFromSamples(20, { lastSeen: now - 16 * 60 * 1000 }, now)).toBe('Stale');
    expect(maturityFromSamples(20, {}, now)).toBeNull();
  });

  test('prefers memory stats over detector-local fields', () => {
    expect(resolvePatternMaturity(
      { name: 'DTW_MATCH', samples: 1 },
      { timesSeen: 4, lastSeen: now },
      now
    )).toEqual({
      sampleCount: 4,
      maturity: 'Forming',
    });
  });

  test('stamps detected pattern objects with real maturity evidence', () => {
    const pattern = { name: 'Learning Pattern', confidence: 0.8 };
    const result = stampPatternMaturity(pattern, { timesSeen: 6, firstSeen: now - 31 * 60 * 1000, lastSeen: now }, now);

    expect(result).toEqual({ sampleCount: 6, maturity: 'Mature' });
    expect(pattern).toMatchObject({
      sampleCount: 6,
      samples: 6,
      maturity: 'Mature',
      isNew: false,
    });
  });
});
