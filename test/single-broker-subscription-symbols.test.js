'use strict';

const fs = require('fs');
const path = require('path');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('SessionRouter-only market-data subscription ownership', () => {
  let restoreEnv;
  let logSpy;
  let errorSpy;

  function loadBot() {
    jest.doMock('../instrument.js', () => ({
      captureException: jest.fn(),
      captureMessage: jest.fn(),
    }));
    jest.doMock('../core/SingletonLock', () => ({
      OGZSingletonLock: jest.fn().mockImplementation(() => ({
        acquireLock: jest.fn(),
        releaseLock: jest.fn(),
      })),
      checkCriticalPorts: jest.fn(),
    }));
    return require('../run-empire-v2');
  }

  beforeEach(() => {
    jest.resetModules();
    restoreEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'paper',
      CANDLE_SOURCE: 'live',
      BACKTEST_MODE: 'false',
      PAPER_TRADING: 'true',
      LIVE_TRADING: 'false',
      CONFIRM_LIVE_TRADING: 'false',
      ALPACA_SYMBOLS: 'TSLA,NVDA',
      TRADING_PAIR: 'TSLA',
      CANDLE_TIMEFRAME: '15m',
      WEBHOOK_ORDERS_ENABLED: 'false',
      WEBHOOK_DRY_RUN: 'true',
    });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (restoreEnv) {
      restoreEnv();
      restoreEnv = null;
    }
    logSpy.mockRestore();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('run-empire has no pre-router single-broker subscription resolver', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'run-empire-v2.js'), 'utf8');

    expect(source).not.toContain('function resolveSingleBrokerSubscriptionSymbols');
    expect(source).not.toContain('resolveSingleBrokerSubscriptionSymbols(');
    expect(source).not.toContain('single-broker subscriptions');
    expect(source).not.toContain('source=single broker');
  });

  test('SessionRouter OHLC ingestion refuses missing timeframe with a loud diagnostic drop', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'run-empire-v2.js'), 'utf8');

    expect(source).not.toMatch(/eventData\.timeframe\s*\|\|\s*['"]1m['"]/);
    expect(source).toContain('this.timeframeDiagnostics.missingSessionRouterTimeframeDrops += 1');
    expect(source).toContain('[OHLC][TIMEFRAME-MISSING] dropped SessionRouter payload with missing timeframe');
  });

  test('SessionRouter transition consumer uses proven payload without a whole-handler try wrap', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'run-empire-v2.js'), 'utf8');
    const handlerStart = source.indexOf("this.sessionRouter.on('transition', (ev) => {");
    const handlerEnd = source.indexOf("console.log('[EMPIRE V2] OrderRouter initialized", handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(source).not.toContain('_routeSessionTransitionScopeSyncFailure');
    expect(handlerSource).not.toMatch(/\btry\s*\{/);
    expect(handlerSource).not.toMatch(/\bcatch\s*\(/);
    expect(handlerSource).not.toContain('getCandleScopeEnvelope');
    expect(handlerSource).not.toContain('syncDashboardRuntimeScope');
    expect(handlerSource).toContain('runtimeScope: ev.runtimeScope || null');
    expect(handlerSource).toContain('symbol: ev.symbol || ev.runtimeScope?.symbol || null');
  });

  test('SessionRouter failed-safe local block stops entries before analysis when StateManager pause is unconfirmed', async () => {
    const OGZPrimeV14Bot = loadBot();
    const { subscribeTrace } = require('../core/TraceSpine');
    const analyzeAndTrade = jest.fn();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: {
        getEntryBlockStatus: jest.fn(() => ({
          blocked: true,
          reason: 'SessionRouter failed safe: crypto -> stocks: state write failed',
          at: '2026-05-26T14:30:00.000Z',
          pauseConfirmed: false,
          pauseError: 'state write failed',
          activeSession: 'crypto',
        })),
      },
      timeframeSelector: { currentTimeframe: '5m' },
      candleTimeframe: '15m',
      tradingPair: 'TSLA',
      analyzeAndTrade,
      config: { executionMode: 'paper' },
    });
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    try {
      const result = await bot.run15mTradingCycle('TSLA', 'trace_session_router_failed_safe');

      expect(result).toEqual({
        success: false,
        reason: 'session_router_failed_safe_entry_block',
        detail: 'SessionRouter failed safe: crypto -> stocks: state write failed',
        symbol: 'TSLA',
      });
      expect(analyzeAndTrade).not.toHaveBeenCalled();
      expect(traces).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'SESSION_ROUTER_ENTRY_HALT',
          fields: expect.objectContaining({
            traceId: 'trace_session_router_failed_safe',
            symbol: 'TSLA',
            action: 'ANALYZE_ENTRY',
            reason: 'SessionRouter failed safe: crypto -> stocks: state write failed',
            failedSafePauseConfirmed: false,
            failedSafePauseError: 'state write failed',
            route: 'entry_block_exits_still_allowed',
            manualReconciliationRequired: true,
          }),
        })
      ]));
    } finally {
      unsubscribe();
    }
  });

  test('SessionRouter failed-safe local block refuses direct entries but allows exits through executeTrade', async () => {
    const OGZPrimeV14Bot = loadBot();
    const executeTrade = jest.fn().mockResolvedValue({ success: true });
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: {
        getEntryBlockStatus: jest.fn(() => ({
          blocked: true,
          reason: 'SessionRouter failed safe: stocks -> crypto: state write failed',
          at: '2026-05-26T20:00:00.000Z',
          pauseConfirmed: false,
          pauseError: 'state write failed',
          activeSession: 'stocks',
        })),
      },
      orderExecutor: {
        ctx: {},
        executeTrade,
      },
      marketData: { close: 100 },
      dashboardWs: null,
      dashboardWsConnected: false,
      _lastTraiDecision: null,
      config: { executionMode: 'paper' },
    });

    const entryResult = await bot.executeTrade({ action: 'BUY', traceId: 'entry_trace' }, {}, 100, {}, [], null, null, 'TSLA');
    expect(entryResult).toEqual(expect.objectContaining({
      success: false,
      reason: 'session_router_failed_safe_entry_block',
      detail: 'SessionRouter failed safe: stocks -> crypto: state write failed',
      symbol: 'TSLA',
      orderAccepted: false,
      stateMutationSucceeded: false,
    }));
    expect(executeTrade).not.toHaveBeenCalled();

    const exitResult = await bot.executeTrade({ action: 'SELL', tradeId: 'OPEN-LONG-1' }, {}, 100, {}, [], null, null, 'TSLA');
    expect(exitResult).toEqual({ success: true });
    expect(executeTrade).toHaveBeenCalledTimes(1);
  });

  test('subscribeToMarketData cannot revive the pre-router broker subscription path', () => {
    const OGZPrimeV14Bot = loadBot();
    const subscribeToCandles = jest.fn();
    const subscribeToTicker = jest.fn();
    const on = jest.fn();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: null,
      kraken: {
        subscribeToCandles,
        subscribeToTicker,
        on,
      },
    });

    bot.subscribeToMarketData();

    expect(subscribeToCandles).not.toHaveBeenCalled();
    expect(subscribeToTicker).not.toHaveBeenCalled();
    expect(on).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('V2 ARCHITECTURE: SessionRouter owns market-data subscriptions');
  });

  test('boot hydration resolves stocks from the SessionRouter route table', () => {
    const OGZPrimeV14Bot = loadBot();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: {
        activeSession: 'stocks',
        stockSymbols: ['TSLA', 'NVDA'],
        cryptoSymbols: ['BTC-USD'],
      },
      tradingPair: 'NVDA',
    });

    expect(bot._getBootHydrationSymbols()).toEqual(['TSLA']);
  });

  test('boot hydration resolves crypto from the SessionRouter route table', () => {
    const OGZPrimeV14Bot = loadBot();
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      sessionRouter: {
        activeSession: 'crypto',
        stockSymbols: ['TSLA'],
        cryptoSymbols: ['BTC-USD'],
      },
      tradingPair: 'TSLA',
    });

    expect(bot._getBootHydrationSymbols()).toEqual(['BTC-USD']);
  });
});
