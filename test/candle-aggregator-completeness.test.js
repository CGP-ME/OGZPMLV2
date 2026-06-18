const { CandleAggregator } = require('../core/CandleAggregator');

function candleAt(ms, close = 100) {
  return {
    t: ms,
    o: close,
    h: close,
    l: close,
    c: close,
    v: 10
  };
}

describe('CandleAggregator source completeness', () => {
  test('accepts a 15m aggregate only when all expected 1m source periods are present', () => {
    const aggregator = new CandleAggregator();
    const start = Date.UTC(2026, 5, 11, 14, 30, 0);
    const source = Array.from({ length: 15 }, (_, index) => candleAt(start + index * 60_000));

    const result = aggregator.checkSourceCompleteness(source, '1m', start, '15m');

    expect(result).toEqual({
      complete: true,
      expectedCount: 15,
      actualCount: 15,
      missingPeriods: [],
      reason: null
    });
  });

  test('rejects a 15m aggregate when any 1m source period is missing', () => {
    const aggregator = new CandleAggregator();
    const start = Date.UTC(2026, 5, 11, 14, 30, 0);
    const source = Array.from({ length: 15 }, (_, index) => candleAt(start + index * 60_000))
      .filter(candle => candle.t !== start + 7 * 60_000);

    const result = aggregator.checkSourceCompleteness(source, '1m', start, '15m');

    expect(result.complete).toBe(false);
    expect(result.expectedCount).toBe(15);
    expect(result.actualCount).toBe(14);
    expect(result.reason).toBe('missing_source_periods');
    expect(result.missingPeriods).toEqual([start + 7 * 60_000]);
  });

  test('does not count duplicate source candles as missing-period coverage', () => {
    const aggregator = new CandleAggregator();
    const start = Date.UTC(2026, 5, 11, 14, 30, 0);
    const source = Array.from({ length: 15 }, (_, index) => candleAt(start + index * 60_000))
      .filter(candle => candle.t !== start + 5 * 60_000);
    source.push(candleAt(start + 4 * 60_000, 101));

    const result = aggregator.checkSourceCompleteness(source, '1m', start, '15m');

    expect(result.complete).toBe(false);
    expect(result.expectedCount).toBe(15);
    expect(result.actualCount).toBe(14);
    expect(result.missingPeriods).toEqual([start + 5 * 60_000]);
  });

  test('does not count the next period boundary candle as coverage for the closing period', () => {
    const aggregator = new CandleAggregator();
    const start = Date.UTC(2026, 5, 11, 14, 30, 0);
    const source = Array.from({ length: 14 }, (_, index) => candleAt(start + index * 60_000));
    source.push(candleAt(start + 15 * 60_000));

    const result = aggregator.checkSourceCompleteness(source, '1m', start, '15m');

    expect(result.complete).toBe(false);
    expect(result.expectedCount).toBe(15);
    expect(result.actualCount).toBe(14);
    expect(result.missingPeriods).toEqual([start + 14 * 60_000]);
  });

  test('rejects invalid aggregation ratios instead of treating them as complete', () => {
    const aggregator = new CandleAggregator();
    const start = Date.UTC(2026, 5, 11, 14, 30, 0);

    const result = aggregator.checkSourceCompleteness([candleAt(start)], '15m', start, '1m');

    expect(result).toEqual({
      complete: false,
      expectedCount: 0,
      actualCount: 0,
      missingPeriods: [],
      reason: 'invalid_timeframe_ratio'
    });
  });

  test('rejects second-based source timestamps with an explicit unit error', () => {
    const aggregator = new CandleAggregator();
    const startMs = Date.UTC(2026, 5, 11, 14, 30, 0);
    const startSeconds = Math.floor(startMs / 1000);
    const source = Array.from({ length: 15 }, (_, index) => candleAt(startSeconds + index * 60));

    const result = aggregator.checkSourceCompleteness(source, '1m', startMs, '15m');

    expect(result).toEqual({
      complete: false,
      expectedCount: 15,
      actualCount: 0,
      missingPeriods: [],
      reason: 'invalid_source_timestamp_unit'
    });
  });

  test('rejects unaligned millisecond source timestamps instead of flooring into a valid source slot', () => {
    const aggregator = new CandleAggregator();
    const start = Date.UTC(2026, 5, 11, 14, 30, 0);
    const source = Array.from({ length: 15 }, (_, index) => candleAt(start + index * 60_000));
    source[3] = candleAt(start + 3 * 60_000 + 45_000);

    const result = aggregator.checkSourceCompleteness(source, '1m', start, '15m');

    expect(result).toEqual({
      complete: false,
      expectedCount: 15,
      actualCount: 3,
      missingPeriods: [],
      reason: 'unaligned_source_timestamp'
    });
  });
});
