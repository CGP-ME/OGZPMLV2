'use strict';

const DashboardBroadcaster = require('../core/DashboardBroadcaster');

describe('DashboardBroadcaster symbol attribution', () => {
  let logSpy;
  let errorSpy;

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
    const ctx = {
      tradingPair: 'BTC-USD',
      marketData: { symbol: 'BTC-USD' },
      priceHistory: [],
      dashboardWs: {
        readyState: 1,
        send: (message) => sent.push(JSON.parse(message)),
      },
    };
    const broadcaster = new DashboardBroadcaster(ctx);

    broadcaster.broadcastEdgeAnalytics(74750, 2.5, {
      symbol: 'BTC-USD',
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
      tick: expect.objectContaining({ symbol: 'BTC-USD' }),
    }));
  });

  test('missing candle symbol does not fall back to stale runtime symbol', () => {
    const sent = [];
    const ctx = {
      tradingPair: 'TSLA',
      marketData: { symbol: 'TSLA' },
      priceHistory: [],
      dashboardWs: {
        readyState: 1,
        send: (message) => sent.push(JSON.parse(message)),
      },
    };
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
});
