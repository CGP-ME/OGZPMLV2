'use strict';

const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

const restoreRuntimeEnvForImports = applyExplicitRuntimeTestEnv({
  DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
  EXECUTION_MODE: 'paper',
  CANDLE_SOURCE: 'live',
  BACKTEST_MODE: 'false',
  PAPER_TRADING: 'true',
  LIVE_TRADING: 'false',
  CONFIRM_LIVE_TRADING: 'false',
  BROKER: 'kraken',
  TRADING_PAIR: 'BTC-USD',
  ASSET_CLASS: 'crypto',
  WEBHOOK_ORDERS_ENABLED: 'false',
  WEBHOOK_DRY_RUN: 'true',
});

const WebSocketManager = require('../core/WebSocketManager');
const MultiAssetManager = require('../core/MultiAssetManager');
const { SymbolTradingContext } = require('../core/SymbolTradingContext');
const { ASSET_REGISTRY, normalizeAssetSymbol } = require('../core/AssetRegistry');

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

  afterAll(() => {
    restoreRuntimeEnvForImports();
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

  test('MultiAssetManager uses the shared asset registry and refuses unknown Kraken mappings', () => {
    const manager = new MultiAssetManager({});

    expect(manager.assetRegistry).toBe(ASSET_REGISTRY);
    expect(normalizeAssetSymbol('btc/usd')).toBe('BTC-USD');
    expect(normalizeAssetSymbol('XBTUSD')).toBe('BTC-USD');
    expect(normalizeAssetSymbol('XDG/USD')).toBe('DOGE-USD');
    expect(normalizeAssetSymbol('TSLA-USD')).toBe('TSLA');
    expect(normalizeAssetSymbol('FAKE-USD')).toBeNull();
    expect(manager.toKrakenRest('BTC-USD')).toBe('XXBTZUSD');
    expect(manager.toKrakenWs('BTC-USD')).toBe('XBT/USD');
    expect(manager.toKrakenWs('DOGE-USD')).toBe('XDG/USD');
    expect(manager.fromKrakenWs('XBT/USD')).toBe('BTC-USD');
    expect(manager.fromKrakenWs('XDG/USD')).toBe('DOGE-USD');
    expect(manager.fromKrakenWs('UNKNOWN/PAIR')).toBeNull();
    expect(() => manager.toKrakenRest('FAKE-USD')).toThrow(
      '[MultiAsset] Unknown asset FAKE-USD; refusing Kraken REST mapping'
    );
    expect(() => manager.toKrakenWs('FAKE-USD')).toThrow(
      '[MultiAsset] Unknown asset FAKE-USD; refusing Kraken WS mapping'
    );
    expect(() => manager.toKrakenRest('TSLA-USD')).toThrow(
      '[MultiAsset] Asset TSLA-USD belongs to broker alpaca; refusing Kraken REST mapping'
    );
    expect(() => manager.toKrakenWs('TSLA')).toThrow(
      '[MultiAsset] Asset TSLA belongs to broker alpaca; refusing Kraken WS mapping'
    );
  });

  test('shared registry does not allow half-registered Kraken assets', () => {
    for (const [symbol, config] of Object.entries(ASSET_REGISTRY)) {
      if (config.broker !== 'kraken') continue;
      expect(config.krakenRest).toEqual(expect.any(String));
      expect(config.krakenRest.length).toBeGreaterThan(0);
      expect(config.krakenWs).toEqual(expect.any(String));
      expect(config.krakenWs.length).toBeGreaterThan(0);
      expect(normalizeAssetSymbol(config.krakenRest)).toBe(symbol);
      expect(normalizeAssetSymbol(config.krakenWs)).toBe(symbol);
    }
  });

  test('MultiAssetManager refuses explicit startup broker and asset mismatches', () => {
    const previousBroker = process.env.BROKER;
    const previousTradingPair = process.env.TRADING_PAIR;
    process.env.BROKER = 'kraken';
    process.env.TRADING_PAIR = 'TSLA';

    try {
      expect(() => new MultiAssetManager({})).toThrow(
        '[MultiAsset] Startup asset TSLA belongs to broker alpaca; BROKER=kraken'
      );
    } finally {
      if (previousBroker === undefined) delete process.env.BROKER;
      else process.env.BROKER = previousBroker;
      if (previousTradingPair === undefined) delete process.env.TRADING_PAIR;
      else process.env.TRADING_PAIR = previousTradingPair;
    }
  });

  test('SymbolTradingContext uses the shared asset resolver before registry lookup', () => {
    const candleStore = { getCandles: jest.fn(() => []) };

    const context = new SymbolTradingContext('btc/usd', candleStore, { timeframe: '1m' });

    expect(context.symbol).toBe('BTC-USD');
    expect(context.metadata).toBe(ASSET_REGISTRY['BTC-USD']);
    expect(() => new SymbolTradingContext('FAKE-USD', candleStore, { timeframe: '1m' }))
      .toThrow("SymbolTradingContext: unregistered symbol 'FAKE-USD'");
  });
});
