'use strict';

describe('active timeframe aggregate fallback removal', () => {
  function runEmpireSource() {
    const fs = require('fs');
    const path = require('path');
    return fs.readFileSync(path.resolve(__dirname, '..', 'run-empire-v2.js'), 'utf8');
  }

  test('runner does not own private active-timeframe aggregation fallback', () => {
    const source = runEmpireSource();

    expect(source).not.toContain('_feedAggregatedActiveCandle');
    expect(source).not.toContain('_requestAggregateSourceBackfill');
    expect(source).not.toContain('_trimAggregateTrackingSets');
    expect(source).not.toContain('_emittedAggregatedActiveCandles');
    expect(source).not.toContain('_settledAggregatedActiveCandles');
    expect(source).not.toContain('_aggregateSourceBackfills');
    expect(source).not.toContain('ACTIVE_CANDLE_AGGREGATED');
    expect(source).not.toContain('ACTIVE_CANDLE_SOURCE_BACKFILL_REQUESTED');
    expect(source).toContain('this.timeframeDiagnostics.nonActiveTimeframeDrops += 1');
    expect(source).toContain('[OHLC][TIMEFRAME-NON-ACTIVE] dropped non-active timeframe payload');
  });

  test('non-active timeframe path drops loudly instead of synthesizing active candles', () => {
    const source = runEmpireSource();
    const dropIndex = source.indexOf('[OHLC][TIMEFRAME-NON-ACTIVE] dropped non-active timeframe payload');
    const handleIndex = source.indexOf('this.handleMarketData({', dropIndex);
    const tradeCycleIndex = source.indexOf('this.run15mTradingCycle(', dropIndex);
    const nextSelectorIndex = source.indexOf("if (tf === '5m' && this.timeframeSelector)", dropIndex);

    expect(dropIndex).toBeGreaterThan(-1);
    expect(nextSelectorIndex).toBeGreaterThan(dropIndex);
    expect(handleIndex === -1 || handleIndex > nextSelectorIndex).toBe(true);
    expect(tradeCycleIndex === -1 || tradeCycleIndex > nextSelectorIndex).toBe(true);
  });
});
