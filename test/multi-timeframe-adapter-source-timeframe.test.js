'use strict';

describe('MultiTimeframeAdapter source timeframe ownership', () => {
  function candle(index, timeframe = '15m') {
    const t = Date.UTC(2026, 0, 1, 14, 30 + (index * 15), 0);
    return {
      symbol: 'TSLA',
      timeframe,
      t,
      etime: t + (15 * 60 * 1000),
      o: 100 + index,
      h: 101 + index,
      l: 99 + index,
      c: 100.5 + index,
      v: 1000 + index,
    };
  }

  test('stores 15m source candles in the 15m bucket instead of implicit 1m', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter({
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h'],
      minCandlesForAnalysis: 2,
    });

    adapter.ingestCandle(candle(0), '15m');
    adapter.ingestCandle(candle(1), '15m');

    expect(adapter.getCandles('1m')).toHaveLength(0);
    expect(adapter.getCandles('5m')).toHaveLength(0);
    expect(adapter.getCandles('15m')).toHaveLength(2);
    expect(adapter.getCandles('15m')[0]).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      timeframe: '15m',
      c: 100.5,
    }));
    expect(adapter.getSnapshot()).toEqual(expect.objectContaining({
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h'],
    }));
  });

  test('baseTimeframe filters impossible lower buckets at construction', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter({
      baseTimeframe: '15m',
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h'],
    });

    expect(adapter.config.activeTimeframes).toEqual(['15m', '1h', '4h']);
    expect(adapter.getCandles('1m')).toHaveLength(0);
    expect(adapter.getCandles('5m')).toHaveLength(0);
  });

  test('emits source timeframe metadata for downstream proof surfaces', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter({
      activeTimeframes: ['15m', '1h'],
      minCandlesForAnalysis: 1,
    });
    const updates = [];
    adapter.on('timeframes_updated', (event) => updates.push(event));

    adapter.ingestCandle(candle(0), '15m');

    expect(updates[0]).toEqual(expect.objectContaining({
      sourceTimeframe: '15m',
      price: 100.5,
      readyTimeframes: ['15m'],
    }));
    expect(adapter.getSnapshot()).toEqual(expect.objectContaining({
      baseTimeframe: '1m',
      activeTimeframes: ['1m', '15m', '1h'],
    }));
  });

  test('rejects unsupported source timeframe instead of silently falling back', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter();

    expect(() => adapter.ingestCandle(candle(0, '2m'), '2m'))
      .toThrow(/unsupported sourceTimeframe '2m'/);
  });

  test('rejects missing source timeframe instead of falling back to base timeframe', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter();
    const { timeframe, ...unstampedCandle } = candle(0);

    expect(() => adapter.ingestCandle(unstampedCandle))
      .toThrow(/sourceTimeframe required/);
  });

  test('rejects a source timeframe below configured base timeframe', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter({
      baseTimeframe: '15m',
      activeTimeframes: ['15m', '1h'],
    });

    expect(() => adapter.ingestCandle(candle(0, '5m'), '5m'))
      .toThrow(/sourceTimeframe '5m' is below baseTimeframe '15m'/);
  });
});
