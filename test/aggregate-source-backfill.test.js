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

  test('records the mark outcome and strategy eligibility before the strategy-frame branch', () => {
    const source = runEmpireSource();
    const handlerStart = source.indexOf('const ohlcHandler = (eventData) => {');
    const handlerEnd = source.indexOf('this.sessionRouter.wire(', handlerStart);
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);
    const markIndex = handler.indexOf('stateManager.updateLastPrice(');
    const influenceIndex = handler.indexOf("emitTrace(this, 'LAST_PRICE_INFLUENCE'");
    const strategyBranchIndex = handler.indexOf('if (tf === activeTf)');

    expect(markIndex).toBeGreaterThan(-1);
    expect(influenceIndex).toBeGreaterThan(markIndex);
    expect(strategyBranchIndex).toBeGreaterThan(influenceIndex);
    expect(handler).toContain('const markEventTimeMs = ohlcTimestampMs(ohlcData[1]);');
    expect(handler).toContain('stateManager.updateLastPrice(sym, ohlcData[5], markEventTimeMs)');
    expect(handler).toContain('eventTime: markEventTimeMs');
    expect(handler).toContain('markAttempted: canUpdateLastPrice');
    expect(handler).toContain("? (markUpdated ? 'mark_updated' : 'mark_rejected')");
    expect(handler).toContain(": 'mark_unavailable'");
    expect(handler).toContain('strategyEligible: tf === activeTf');
    expect(handler).not.toContain('strategyRouted:');
    expect(handler.match(/LAST_PRICE_INFLUENCE/g)).toHaveLength(1);
  });

  test('canonical millisecond producer accepts a later frame and rejects an older frame', () => {
    const { StateManager } = require('../core/StateManager');
    const { toTimestampMs } = require('../foundation/ohlc-normalize');
    const manager = Object.create(StateManager.prototype);
    manager.state = { lastPrices: new Map(), lastPriceTimes: new Map() };
    const restTimeMs = Date.UTC(2026, 8, 2, 0, 0, 0);

    expect(manager.updateLastPrice('TSLA', 100, restTimeMs)).toBe(true);
    expect(manager.updateLastPrice('TSLA', 101, toTimestampMs((restTimeMs + 60_000) / 1000))).toBe(true);
    expect(manager.getLastPrice('TSLA')).toBe(101);
    expect(manager.updateLastPrice('TSLA', 99, toTimestampMs((restTimeMs - 60_000) / 1000))).toBe(false);
    expect(manager.getLastPrice('TSLA')).toBe(101);
  });
});
