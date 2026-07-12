'use strict';

const fs = require('fs');
const path = require('path');
const SessionRouter = require('../core/SessionRouter');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('SessionRouter stock symbol config ownership', () => {
  let restoreRuntimeEnv;

  function loadBotForRouteIdentity() {
    jest.doMock('../instrument.js', () => ({
      captureException: jest.fn(),
      captureMessage: jest.fn(),
    }));
    return require('../run-empire-v2');
  }

  beforeEach(() => {
    restoreRuntimeEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'backtest',
      BACKTEST_MODE: 'true',
      CANDLE_SOURCE: 'file',
      // Backtest mode refuses the implicit $10000 reset by StateManager
      // guard; the fixture supplies its balance explicitly.
      INITIAL_BALANCE: '10000',
    });
  });

  afterEach(() => {
    restoreRuntimeEnv();
    jest.restoreAllMocks();
  });

  test('enabled SessionRouter requires explicit stockSymbols', () => {
    expect(() => new SessionRouter({
      mode: 'scheduled',
      cryptoSymbols: ['BTC-USD'],
    })).toThrow(/stockSymbols must be explicitly provided/);
  });

  test('enabled SessionRouter requires explicit cryptoSymbols', () => {
    expect(() => new SessionRouter({
      mode: 'scheduled',
      stockSymbols: ['TSLA'],
    })).toThrow(/cryptoSymbols must be explicitly provided/);
  });

  test('static crypto routing does not require stock symbols', () => {
    const router = new SessionRouter({
      mode: 'static',
      staticSession: 'crypto',
      cryptoSymbols: ['BTC-USD'],
    });

    expect(router.stockSymbols).toEqual([]);
    expect(router.cryptoSymbols).toEqual(['BTC-USD']);
  });

  test('runtime stock symbol routing has no sessions.stockSymbols fallback path', () => {
    const root = path.resolve(__dirname, '..');
    const runEmpire = fs.readFileSync(path.join(root, 'run-empire-v2.js'), 'utf8');
    const candleProcessor = fs.readFileSync(path.join(root, 'core', 'CandleProcessor.js'), 'utf8');

    expect(runEmpire).not.toContain('fallbackSymbols: sessionsCfg.stockSymbols');
    expect(runEmpire).not.toContain('options.fallbackSymbols');
    expect(runEmpire).toContain('allowTradingPairFallback: false');
    expect(runEmpire).toContain("routerMode === 'static'");
    expect(runEmpire).not.toContain('process.env.SESSION_ROUTER_ENABLED');
    expect(runEmpire).not.toContain('STATIC BACKTEST ROUTE');
    expect(candleProcessor).not.toContain("getConfigValue('sessions.stockSymbols')");
  });

  test('static routed backtests use explicit backtest account identity', () => {
    jest.resetModules();
    const OGZPrimeV14Bot = loadBotForRouteIdentity();

    expect(OGZPrimeV14Bot._test.resolveRuntimeAccountIdentity(true, {
      accountId: 'default',
    })).toEqual({
      accountId: 'backtest',
      accountIdSource: 'backtest',
    });

    expect(OGZPrimeV14Bot._test.resolveRuntimeAccountIdentity(false, {
      accountId: 'default',
    })).toEqual({
      accountId: 'default',
      accountIdSource: 'default',
    });
  });

  test('static routed backtest scope envelope carries backtest account source', () => {
    jest.resetModules();
    const OGZPrimeV14Bot = loadBotForRouteIdentity();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouterConfig: {
        mode: 'static',
        staticSession: 'stocks',
      },
      sessionRouter: {
        enabled: true,
        activeSession: 'stocks',
        activeBroker: null,
      },
      brokerAccountIdentities: new Map(),
      config: {
        brokerId: 'alpaca',
        accountId: 'backtest',
        accountIdSource: 'backtest',
        assetClass: 'stocks',
        executionMode: 'backtest',
        timeframe: '15m',
      },
      timeframeSelector: null,
      candleTimeframe: '15m',
    });

    expect(bot.getCandleScopeEnvelope({ timeframe: '15m' })).toEqual({
      brokerId: 'alpaca',
      accountId: 'backtest',
      accountIdSource: 'backtest',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
    });
  });

  test('static backtest activation registers broker routing without live REST or subscriptions', async () => {
    const router = new SessionRouter({
      mode: 'static',
      staticSession: 'stocks',
      stockSymbols: ['TSLA'],
      cryptoSymbols: ['BTC-USD'],
      backtestMode: true,
      transitionStore: {
        readStatus: jest.fn(() => ({ recoveryRequired: false })),
      },
    });
    const alpacaAdapter = {
      id: 'alpaca',
      getBrokerName: jest.fn(() => 'alpaca'),
      getPositions: jest.fn(),
      getOpenOrders: jest.fn(),
      getBalance: jest.fn(),
      subscribeToCandles: jest.fn(),
      on: jest.fn(),
    };
    const orderRouter = {
      registerBroker: jest.fn(),
    };

    router.wire(null, alpacaAdapter, orderRouter, jest.fn(), {
      config: { timeframe: '15m', executionMode: 'backtest', accountId: 'acct-main' },
      candleTimeframe: '15m',
    });

    await router.start();

    expect(router.activeSession).toBe('stocks');
    expect(router.activeBroker).toBe(alpacaAdapter);
    expect(orderRouter.registerBroker).toHaveBeenCalledWith(alpacaAdapter, ['TSLA']);
    expect(alpacaAdapter.getPositions).not.toHaveBeenCalled();
    expect(alpacaAdapter.getOpenOrders).not.toHaveBeenCalled();
    expect(alpacaAdapter.getBalance).not.toHaveBeenCalled();
    expect(alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(alpacaAdapter.on).not.toHaveBeenCalled();
  });

  test('routed-static stocks preserves the prior single-broker Alpaca symbol route in backtest', async () => {
    jest.resetModules();
    const OGZPrimeV14Bot = loadBotForRouteIdentity();
    const legacySymbols = OGZPrimeV14Bot._test.resolveSingleBrokerSubscriptionSymbols({
      id: 'alpaca',
      alpacaSymbols: 'TSLA, nvda, SPY, TSLA',
      tradingPair: 'TSLA',
    });
    const router = new SessionRouter({
      mode: 'static',
      staticSession: 'stocks',
      stockSymbols: legacySymbols,
      cryptoSymbols: ['BTC-USD'],
      backtestMode: true,
      transitionStore: {
        readStatus: jest.fn(() => ({ recoveryRequired: false })),
      },
    });
    const alpacaAdapter = {
      id: 'alpaca',
      getBrokerName: jest.fn(() => 'alpaca'),
      getPositions: jest.fn(),
      getOpenOrders: jest.fn(),
      getBalance: jest.fn(),
      subscribeToCandles: jest.fn(),
      on: jest.fn(),
    };
    const krakenAdapter = {
      id: 'kraken',
      getBrokerName: jest.fn(() => 'kraken'),
      getPositions: jest.fn(),
      getOpenOrders: jest.fn(),
      getBalance: jest.fn(),
      subscribeToCandles: jest.fn(),
      on: jest.fn(),
    };
    const orderRouter = {
      registerBroker: jest.fn(),
    };

    router.wire(krakenAdapter, alpacaAdapter, orderRouter, jest.fn(), {
      config: { timeframe: '15m', executionMode: 'backtest', accountId: 'backtest' },
      candleTimeframe: '15m',
    });

    await router.start();

    expect(legacySymbols).toEqual(['TSLA', 'NVDA', 'SPY']);
    expect(router.activeSession).toBe('stocks');
    expect(router.activeBroker).toBe(alpacaAdapter);
    expect(orderRouter.registerBroker).toHaveBeenCalledTimes(1);
    expect(orderRouter.registerBroker).toHaveBeenCalledWith(alpacaAdapter, legacySymbols);
    expect(alpacaAdapter.getPositions).not.toHaveBeenCalled();
    expect(alpacaAdapter.getOpenOrders).not.toHaveBeenCalled();
    expect(alpacaAdapter.getBalance).not.toHaveBeenCalled();
    expect(alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
  });
});
