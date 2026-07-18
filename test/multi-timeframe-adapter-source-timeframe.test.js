'use strict';

describe('MultiTimeframeAdapter source timeframe ownership', () => {
  const weights = Object.freeze({
    '1m': 0.05,
    '5m': 0.08,
    '15m': 0.10,
    '30m': 0.10,
    '1h': 0.15,
    '4h': 0.17,
    '1d': 0.15,
  });

  function adapterConfig(overrides = {}) {
    return {
      activeTimeframes: ['15m', '1h'],
      minReadyTimeframes: 1,
      weights,
      ...overrides,
    };
  }

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
    const adapter = new MultiTimeframeAdapter(adapterConfig({
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h'],
      minCandlesForAnalysis: 2,
    }));

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

  test('does not own private aggregation state or synthesize higher timeframe bars', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'modules', 'MultiTimeframeAdapter.js'), 'utf8');

    expect(source).not.toContain('TIMEFRAME_CONFIG');
    expect(source).not.toContain('pendingCandles');
    expect(source).not.toContain('_aggregateInto');

    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig({
      baseTimeframe: '15m',
      activeTimeframes: ['15m', '1h'],
      minCandlesForAnalysis: 1,
    }));

    adapter.ingestCandle(candle(0), '15m');
    adapter.ingestCandle(candle(1), '15m');
    adapter.ingestCandle(candle(2), '15m');
    adapter.ingestCandle(candle(3), '15m');

    expect(adapter.getCandles('15m')).toHaveLength(4);
    expect(adapter.getCandles('1h')).toHaveLength(0);
    expect(adapter.getSnapshot().stats.aggregationsPerformed).toBeUndefined();
  });

  test('baseTimeframe filters impossible lower buckets at construction', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig({
      baseTimeframe: '15m',
      activeTimeframes: ['1m', '5m', '15m', '1h', '4h'],
    }));

    expect(adapter.config.activeTimeframes).toEqual(['15m', '1h', '4h']);
    expect(adapter.getCandles('1m')).toHaveLength(0);
    expect(adapter.getCandles('5m')).toHaveLength(0);
  });

  test('emits source timeframe metadata for downstream proof surfaces', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig({
      baseTimeframe: '15m',
      activeTimeframes: ['15m', '1h'],
      minCandlesForAnalysis: 1,
    }));
    const updates = [];
    adapter.on('timeframes_updated', (event) => updates.push(event));

    adapter.ingestCandle(candle(0), '15m');

    expect(updates[0]).toEqual(expect.objectContaining({
      sourceTimeframe: '15m',
      price: 100.5,
      readyTimeframes: ['15m'],
    }));
    expect(adapter.getSnapshot()).toEqual(expect.objectContaining({
      baseTimeframe: '15m',
      activeTimeframes: ['15m', '1h'],
    }));
  });

  test('returns null confluence below configured minReadyTimeframes', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig({
      activeTimeframes: ['15m', '1h'],
      minCandlesForAnalysis: 1,
      minReadyTimeframes: 2,
    }));

    adapter.ingestCandle(candle(0), '15m');
    const score = adapter.crossFrameScore();

    expect(score).toEqual(expect.objectContaining({
      available: false,
      unavailableReason: 'insufficient_ready_timeframes',
      confluenceScore: null,
      confidence: null,
      readyTimeframes: ['15m'],
      minReadyTimeframes: 2,
    }));
  });

  test('uses explicit configured weights without a missing-timeframe fallback', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig({
      baseTimeframe: '15m',
      activeTimeframes: ['15m', '1h'],
      minCandlesForAnalysis: 2,
      minReadyTimeframes: 2,
    }));

    adapter.ingestCandle(candle(0, '15m'), '15m');
    adapter.ingestCandle(candle(1, '15m'), '15m');
    adapter.ingestCandle(candle(0, '1h'), '1h');
    adapter.ingestCandle(candle(1, '1h'), '1h');
    const score = adapter.crossFrameScore();

    expect(score.available).toBe(true);
    expect(score.timeframeSignals['15m'].weight).toBe(0.10);
    expect(score.timeframeSignals['1h'].weight).toBe(0.15);
  });

  test('refuses configured active timeframes without explicit weights', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');

    expect(() => new MultiTimeframeAdapter({
      baseTimeframe: '15m',
      activeTimeframes: ['15m', '1h'],
      minReadyTimeframes: 2,
      weights: {
        '15m': 0.10,
      },
    })).toThrow(/weights\.1h must be a finite positive number/);
  });

  test('refuses direct construction without explicit service config', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');

    expect(() => new MultiTimeframeAdapter({
      activeTimeframes: ['15m', '1h'],
      minReadyTimeframes: 2,
    })).toThrow(/weights are required/);

    expect(() => new MultiTimeframeAdapter({
      activeTimeframes: ['15m', '1h'],
      weights,
    })).toThrow(/minReadyTimeframes is required/);
  });

  test('rejects unsupported source timeframe instead of silently falling back', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig());

    expect(() => adapter.ingestCandle(candle(0, '2m'), '2m'))
      .toThrow(/unsupported sourceTimeframe '2m'/);
  });

  test('rejects missing source timeframe instead of falling back to base timeframe', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig());
    const { timeframe, ...unstampedCandle } = candle(0);

    expect(() => adapter.ingestCandle(unstampedCandle))
      .toThrow(/sourceTimeframe required/);
  });

  test('rejects a source timeframe below configured base timeframe', () => {
    const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
    const adapter = new MultiTimeframeAdapter(adapterConfig({
      baseTimeframe: '15m',
      activeTimeframes: ['15m', '1h'],
    }));

    expect(() => adapter.ingestCandle(candle(0, '5m'), '5m'))
      .toThrow(/sourceTimeframe '5m' is below baseTimeframe '15m'/);
  });
});
