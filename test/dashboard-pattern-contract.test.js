'use strict';

const {
  buildDashboardPatternGeometryFromCandles,
  normalizeDashboardPatternName,
} = require('../server/dashboard-pattern-contract');

describe('dashboard pattern producer contract', () => {
  function candles() {
    return [
      { time: 1700000000000, close: 100 },
      { time: 1700000060000, close: 101 },
      { time: 1700000120000, close: 99 },
      { time: 1700000180000, close: 102 },
    ];
  }

  test('generic ML names become geometry-backed ml_detected instead of fake TA labels', () => {
    const geometry = buildDashboardPatternGeometryFromCandles(candles());

    expect(normalizeDashboardPatternName('DTW_MATCH', Boolean(geometry))).toBe('ml_detected');
    expect(geometry.points).toHaveLength(4);
    expect(geometry).toEqual(expect.objectContaining({
      source: 'recent_candles',
      trendLines: [{ from: geometry.points[0], to: geometry.points[3] }],
    }));
  });

  test('canonical TA names are normalized to the dashboard SVG library keys', () => {
    expect(normalizeDashboardPatternName('cup and handle', false)).toBe('cup_handle');
    expect(normalizeDashboardPatternName('triangle ascending', false)).toBe('ascending_triangle');
    expect(normalizeDashboardPatternName('flag_bear', false)).toBe('bear_flag');
    expect(normalizeDashboardPatternName('novel model shape', false)).toBeNull();
    expect(normalizeDashboardPatternName('novel model shape', true)).toBe('ml_detected');
  });
});
