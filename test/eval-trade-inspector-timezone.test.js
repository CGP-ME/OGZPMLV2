'use strict';

const {
  formatEt,
  formatUtc,
  timestampFields,
} = require('../tools/eval-trade-inspector');

describe('eval trade inspector timezone labels', () => {
  test('renders cutoff timestamps with explicit UTC and ET labels', () => {
    const cutoff = Date.parse('2026-06-25T19:50:00.000Z');

    expect(formatUtc(cutoff)).toBe('2026-06-25T19:50:00.000Z UTC');
    expect(formatEt(cutoff)).toContain('03:50:00 PM ET');
    expect(timestampFields(cutoff)).toEqual({
      time_utc: '2026-06-25T19:50:00.000Z UTC',
      time_et: expect.stringContaining('03:50:00 PM ET'),
    });
  });
});
