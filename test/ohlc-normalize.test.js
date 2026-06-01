'use strict';

const { normalizeOhlc, toTimestampMs } = require('../foundation/ohlc-normalize');

describe('OHLC normalization', () => {
  test('parses Kraken numeric-string timestamps as integer Unix milliseconds', () => {
    expect(toTimestampMs('1779850177.477202')).toBe(1779850177477);
    expect(toTimestampMs('1779850800.000000')).toBe(1779850800000);
  });

  test('keeps ISO string timestamps supported after numeric-string parsing', () => {
    expect(toTimestampMs('2026-05-27T02:53:00.000Z')).toBe(1779850380000);
  });

  test('preserves valid epoch seconds and milliseconds numeric strings', () => {
    expect(toTimestampMs('1779850380')).toBe(1779850380000);
    expect(toTimestampMs('1779850380000')).toBe(1779850380000);
    expect(toTimestampMs('1779850380000.987')).toBe(1779850380000);
  });

  test('rejects numeric strings that are not epoch-shaped timestamps', () => {
    expect(toTimestampMs('0.001')).toBeNull();
    expect(toTimestampMs('1e3')).toBeNull();
    expect(toTimestampMs('123456789')).toBeNull();
    expect(toTimestampMs('-1779850380')).toBeNull();
  });

  test('normalizes object candles with numeric-string open and close times', () => {
    const normalized = normalizeOhlc({
      t: '1779850177.477202',
      etime: '1779850800.000000',
      o: '75628.10000',
      h: '75656.30000',
      l: '75613.50000',
      c: '75642.20000',
      v: '1.33538492',
    });

    expect(normalized).toEqual([
      1779850177477,
      1779850800000,
      75628.1,
      75656.3,
      75613.5,
      75642.2,
      null,
      1.33538492,
      null,
    ]);
  });
});
