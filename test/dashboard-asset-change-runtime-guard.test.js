'use strict';

const WebSocketManager = require('../core/WebSocketManager');
const MultiAssetManager = require('../core/MultiAssetManager');

describe('dashboard asset_change runtime guard', () => {
  let logSpy;
  let warnSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('WebSocketManager does not route dashboard asset_change into MultiAssetManager', () => {
    const send = jest.fn();
    const switchAsset = jest.fn();
    const manager = new WebSocketManager({
      assetManager: { switchAsset },
      dashboardWs: { readyState: 1, send }
    });

    const result = manager.handleDashboardAssetChange('NVDA');

    expect(result).toBe(false);
    expect(switchAsset).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][0])).toEqual({
      type: 'asset_change_ignored',
      asset: 'NVDA',
      reason: 'display_only_runtime_guard'
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Ignoring dashboard asset_change NVDA'));
  });

  test('MultiAssetManager refuses live runtime mutation unless a broker transition owner opts in', async () => {
    const send = jest.fn();
    const bot = {
      config: { tradingPair: 'BTC-USD' },
      tradingPair: 'BTC/USD',
      dashboardWs: { send },
      dashboardWsConnected: true,
      priceHistory: [{ symbol: 'BTC-USD', c: 73500 }],
      fetchAndSendHistoricalCandles: jest.fn()
    };
    const manager = new MultiAssetManager(bot);

    const result = await manager.switchAsset('NVDA');

    expect(result).toBe(false);
    expect(bot.config.tradingPair).toBe('BTC-USD');
    expect(bot.tradingPair).toBe('BTC/USD');
    expect(bot.fetchAndSendHistoricalCandles).not.toHaveBeenCalled();
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      type: 'asset_change_ignored',
      data: {
        asset: 'NVDA',
        broker: 'alpaca',
        assetClass: 'stocks',
        reason: 'session_router_required'
      }
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing runtime asset switch to NVDA'));
  });
});
