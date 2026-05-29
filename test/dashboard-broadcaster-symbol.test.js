'use strict';

const DashboardBroadcaster = require('../core/DashboardBroadcaster');

describe('DashboardBroadcaster symbol attribution', () => {
  let logSpy;
  let errorSpy;

  function buildHistory(symbol, count = 20, start = 100) {
    return Array.from({ length: count }, (_, index) => ({
      symbol,
      timeframe: '1m',
      o: start + index,
      h: start + index + 1,
      l: start + index - 1,
      c: start + index,
      v: 10,
      t: Date.now() - ((count - index) * 60000),
    }));
  }

  function buildCtx(sent, priceHistory = []) {
    return {
      tradingPair: 'BTC-USD',
      marketData: { symbol: 'BTC-USD' },
      dashboardTimeframe: '1m',
      edgeAnalyticsMaxScopes: 200,
      priceHistory,
      indicatorEngine: {
        config: { symbol: 'BTC-USD' },
        getSnapshot: () => ({ indicators: { rsi: 60 } }),
      },
      dashboardWs: {
        readyState: 1,
        send: (message) => sent.push(JSON.parse(message)),
      },
    };
  }

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('delta frames carry symbol on the frame and tick payload', () => {
    const sent = [];
    const ctx = buildCtx(sent, buildHistory('BTC-USD'));
    const broadcaster = new DashboardBroadcaster(ctx);

    broadcaster.broadcastEdgeAnalytics(74750, 2.5, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      o: 74700,
      h: 74800,
      l: 74650,
      c: 74750,
      v: 2.5,
      t: Date.now(),
    });

    const delta = sent.find((message) => message.type === 'delta');
    expect(delta).toEqual(expect.objectContaining({
      symbol: 'BTC-USD',
      timeframe: '1m',
      tick: expect.objectContaining({ symbol: 'BTC-USD', timeframe: '1m' }),
    }));
  });

  test('edge analytics frames carry the source symbol and timeframe', () => {
    const sent = [];
    const ctx = buildCtx(sent, buildHistory('BTC-USD'));
    const broadcaster = new DashboardBroadcaster(ctx);

    broadcaster.broadcastEdgeAnalytics(119, 100, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      o: 118,
      h: 120,
      l: 117,
      c: 119,
      v: 100,
      t: Date.now(),
    });

    const scopedTypes = [
      'delta',
      'cvd_update',
      'liquidation_data',
      'whale_trade',
      'market_internals',
      'funding_rate',
      'fear_greed',
      'smart_money',
    ];
    for (const type of scopedTypes) {
      const frame = sent.find((message) => message.type === type);
      expect(frame).toEqual(expect.objectContaining({
        symbol: 'BTC-USD',
        timeframe: '1m',
      }));
    }
  });

  test('edge analytics frames expose panel-compatible aliases from real payload fields', () => {
    const sent = [];
    const ctx = buildCtx(sent, buildHistory('BTC-USD'));
    const broadcaster = new DashboardBroadcaster(ctx);

    broadcaster.broadcastEdgeAnalytics(119, 100, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      o: 118,
      h: 120,
      l: 117,
      c: 119,
      v: 100,
      t: Date.now(),
    });

    expect(sent.find((message) => message.type === 'cvd_update')).toEqual(expect.objectContaining({
      cvdValue: expect.any(Number),
      cvdTrend: expect.any(String),
    }));
    expect(sent.find((message) => message.type === 'liquidation_data')).toEqual(expect.objectContaining({
      longLiqPrice: expect.any(Number),
      longLiqVol: expect.any(Number),
      shortLiqPrice: expect.any(Number),
      shortLiqVol: expect.any(Number),
    }));
    expect(sent.find((message) => message.type === 'funding_rate')).toEqual(expect.objectContaining({
      currentFunding: expect.any(Number),
      predictedFunding: expect.any(Number),
      fundingSignal: expect.any(String),
    }));
    expect(sent.find((message) => message.type === 'fear_greed')).toEqual(expect.objectContaining({
      fgValue: expect.any(Number),
      fgLabel: expect.any(String),
    }));
    expect(sent.find((message) => message.type === 'smart_money')).toEqual(expect.objectContaining({
      smartFlow: expect.any(String),
      instActivity: expect.any(String),
    }));
  });

  test('edge analytics accumulators are isolated by source symbol', () => {
    const sent = [];
    const ctx = buildCtx(sent);
    const broadcaster = new DashboardBroadcaster(ctx);

    broadcaster.broadcastEdgeAnalytics(100, 2, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      o: 99,
      h: 101,
      l: 98,
      c: 100,
      v: 2,
      t: Date.now(),
    });
    broadcaster.broadcastEdgeAnalytics(200, 3, {
      symbol: 'ETH-USD',
      timeframe: '1m',
      o: 201,
      h: 202,
      l: 199,
      c: 200,
      v: 3,
      t: Date.now(),
    });

    const cvdFrames = sent.filter((message) => message.type === 'cvd_update');
    expect(cvdFrames).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'BTC-USD', cvd: 2, buyVolume: 2, sellVolume: 0 }),
      expect.objectContaining({ symbol: 'ETH-USD', cvd: -3, buyVolume: 0, sellVolume: 3 }),
    ]));
  });

  test('edge analytics accumulators are isolated by symbol and timeframe', () => {
    const sent = [];
    const ctx = buildCtx(sent);
    const broadcaster = new DashboardBroadcaster(ctx);

    broadcaster.broadcastEdgeAnalytics(100, 2, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      o: 99,
      h: 101,
      l: 98,
      c: 100,
      v: 2,
      t: Date.now(),
    });
    broadcaster.broadcastEdgeAnalytics(100, 3, {
      symbol: 'BTC-USD',
      timeframe: '5m',
      o: 101,
      h: 102,
      l: 99,
      c: 100,
      v: 3,
      t: Date.now(),
    });

    const cvdFrames = sent.filter((message) => message.type === 'cvd_update');
    expect(cvdFrames).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'BTC-USD', timeframe: '1m', cvd: 2, buyVolume: 2, sellVolume: 0 }),
      expect.objectContaining({ symbol: 'BTC-USD', timeframe: '5m', cvd: -3, buyVolume: 0, sellVolume: 3 }),
    ]));
  });

  test('missing candle symbol does not fall back to stale runtime symbol', () => {
    const sent = [];
    const ctx = buildCtx(sent);
    ctx.tradingPair = 'TSLA';
    ctx.marketData = { symbol: 'TSLA' };
    const broadcaster = new DashboardBroadcaster(ctx);

    broadcaster.broadcastEdgeAnalytics(74750, 2.5, {
      o: 74700,
      h: 74800,
      l: 74650,
      c: 74750,
      v: 2.5,
      t: Date.now(),
    });

    expect(sent).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[DashboardBroadcaster] Missing candle.symbol; refusing unattributed edge analytics broadcast'
    );
  });

  test('missing candle timeframe fails closed instead of broadcasting null timeframe', () => {
    const sent = [];
    const ctx = buildCtx(sent);
    const broadcaster = new DashboardBroadcaster(ctx);

    const result = broadcaster.broadcastEdgeAnalytics(74750, 2.5, {
      symbol: 'BTC-USD',
      o: 74700,
      h: 74800,
      l: 74650,
      c: 74750,
      v: 2.5,
      t: Date.now(),
    });

    expect(result).toBe(false);
    expect(sent).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      '[DashboardBroadcaster] Missing candle.timeframe for BTC-USD; refusing unattributed edge analytics broadcast'
    );
  });

  test('malformed price and volume fail closed instead of broadcasting NaN analytics', () => {
    const sent = [];
    const ctx = buildCtx(sent);
    const broadcaster = new DashboardBroadcaster(ctx);

    expect(broadcaster.broadcastEdgeAnalytics(NaN, 2.5, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      o: 74700,
      h: 74800,
      l: 74650,
      c: 74750,
      v: 2.5,
      t: Date.now(),
    })).toBe(false);

    expect(broadcaster.broadcastEdgeAnalytics(74750, Infinity, {
      symbol: 'BTC-USD',
      timeframe: '1m',
      o: 74700,
      h: 74800,
      l: 74650,
      c: 74750,
      v: 2.5,
      t: Date.now(),
    })).toBe(false);

    expect(sent).toEqual([]);
  });

  test('edge analytics scope cache is capped by configuration', () => {
    const sent = [];
    const ctx = buildCtx(sent);
    ctx.edgeAnalyticsMaxScopes = 2;
    const broadcaster = new DashboardBroadcaster(ctx);

    for (const symbol of ['BTC-USD', 'ETH-USD', 'SOL-USD']) {
      broadcaster.broadcastEdgeAnalytics(100, 1, {
        symbol,
        timeframe: '1m',
        o: 99,
        h: 101,
        l: 98,
        c: 100,
        v: 1,
        t: Date.now(),
      });
    }

    expect(broadcaster.edgeAnalyticsByScope.size).toBe(2);
    expect(broadcaster.edgeAnalyticsByScope.has('BTC-USD:1m')).toBe(false);
    expect(broadcaster.edgeAnalyticsByScope.has('ETH-USD:1m')).toBe(true);
    expect(broadcaster.edgeAnalyticsByScope.has('SOL-USD:1m')).toBe(true);
  });
});
