'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionRouter = require('../core/SessionRouter');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('SessionRouter OHLC epoch fencing', () => {
  const now = new Date('2026-05-29T14:30:00.000Z');
  let tempDir;
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;
  let restoreRuntimeEnv;

  function makeAdapter(id, balance) {
    const handlers = [];
    return {
      id,
      _handlers: handlers,
      getBrokerName: jest.fn(() => id),
      getPositions: jest.fn().mockResolvedValue([]),
      getOpenOrders: jest.fn().mockResolvedValue([]),
      getBalance: jest.fn().mockResolvedValue(balance),
      unsubscribeAll: jest.fn(),
      removeAllListeners: jest.fn((event) => {
        if (event === 'ohlc') handlers.length = 0;
      }),
      subscribeToCandles: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'ohlc') handlers.push(handler);
      })
    };
  }

  function makeRouter(overrides = {}) {
    const router = new SessionRouter({
      mode: 'scheduled',
      clock: () => now.getTime(),
      stockSymbols: ['TSLA'],
      cryptoSymbols: ['BTC-USD'],
      forceCloseOnSessionEnd: false,
      transitionStoreOptions: { dir: tempDir },
      ...overrides
    });

    router.stateManager = {
      state: { activeTrades: new Map(), isTrading: true },
      pauseTrading: jest.fn().mockImplementation(async (reason) => {
        router.stateManager.state.isTrading = false;
        router.stateManager.state.pauseReason = reason;
        return { success: true };
      }),
      resumeTrading: jest.fn().mockImplementation(async () => {
        router.stateManager.state.isTrading = true;
        return { success: true };
      })
    };
    router.orderRouter = { registerBroker: jest.fn() };
    router.onOhlcCallback = jest.fn();
    router.ctx = {
      candleTimeframe: '15m',
      config: {
        executionMode: 'paper',
        accountId: 'acct-main',
        accountIdSource: 'config',
        timeframe: '15m'
      },
      patternChecker: {
        memory: {
          switchSessionScope: jest.fn((scopeInput) => ({
            switched: false,
            reason: 'already_active',
            storagePath: `/data/unified-patterns.${scopeInput.executionMode}.${scopeInput.assetClass}.json`,
            mode: scopeInput.executionMode,
            assetBucket: scopeInput.assetClass,
            patternCount: 0,
            loaded: false,
            targetExists: false
          }))
        }
      }
    };
    router.krakenAdapter = makeAdapter('kraken', { total: 10000 });
    router.alpacaAdapter = makeAdapter('alpaca', { equity: 10000 });
    return router;
  }

  beforeEach(() => {
    restoreRuntimeEnv = applyExplicitRuntimeTestEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-epoch-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    restoreRuntimeEnv();
  });

  test('rejects stale source OHLC callback after session transition', async () => {
    const router = makeRouter();
    const rejected = [];
    router.on('ohlc_callback_rejected', (event) => rejected.push(event));

    await router._activateCrypto();
    const cryptoHandler = router.krakenAdapter._handlers[0];

    cryptoHandler({ symbol: 'BTC-USD', timeframe: '15m', close: 70000 });
    expect(router.onOhlcCallback).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'BTC-USD',
      sessionRouterEpoch: 1,
      sessionRouterSession: 'crypto',
      sessionRouterBrokerId: 'kraken',
      sessionRouterTransitionId: expect.stringContaining('startup-to-crypto')
    }));
    expect(router.callbackFenceStats.accepted).toBe(1);

    router.onOhlcCallback.mockClear();
    await router._transitionToStocks(now);
    const stockHandler = router.alpacaAdapter._handlers[0];

    cryptoHandler({ symbol: 'BTC-USD', timeframe: '15m', close: 71000 });
    expect(router.onOhlcCallback).not.toHaveBeenCalled();
    expect(router.callbackFenceStats.rejected).toBe(1);
    expect(rejected[0]).toEqual(expect.objectContaining({
      expectedSession: 'crypto',
      expectedBrokerId: 'kraken',
      expectedEpoch: 1,
      activeSession: 'stocks',
      activeBrokerId: 'alpaca',
      activeEpoch: 2
    }));

    stockHandler({ symbol: 'TSLA', timeframe: '15m', close: 225 });
    expect(router.onOhlcCallback).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      sessionRouterEpoch: 2,
      sessionRouterSession: 'stocks',
      sessionRouterBrokerId: 'alpaca',
      sessionRouterTransitionId: expect.stringContaining('crypto-to-stocks')
    }));
  });

  test('blocks OHLC callbacks while a transition is in progress', async () => {
    const router = makeRouter();
    await router._activateCrypto();
    const cryptoHandler = router.krakenAdapter._handlers[0];

    router.onOhlcCallback.mockClear();
    router.transitionInProgress = true;
    cryptoHandler({ symbol: 'BTC-USD', timeframe: '15m', close: 70000 });

    expect(router.onOhlcCallback).not.toHaveBeenCalled();
    expect(router.callbackFenceStats.rejected).toBe(1);
    expect(router.callbackFenceStats.lastRejectedReason).toBe('transition in progress');
  });

  test('blocks OHLC callbacks while failed-safe mode is active', async () => {
    const router = makeRouter();
    await router._activateCrypto();
    const cryptoHandler = router.krakenAdapter._handlers[0];

    router.onOhlcCallback.mockClear();
    router.failedSafeMode = true;
    cryptoHandler({ symbol: 'BTC-USD', timeframe: '15m', close: 70000 });

    expect(router.onOhlcCallback).not.toHaveBeenCalled();
    expect(router.callbackFenceStats.rejected).toBe(1);
    expect(router.callbackFenceStats.lastRejectedReason).toBe('failed-safe mode active');
  });

  test('status exposes active callback fence and rejection counters', async () => {
    const router = makeRouter();
    await router._activateCrypto();
    const cryptoHandler = router.krakenAdapter._handlers[0];

    router.transitionInProgress = true;
    cryptoHandler({ symbol: 'BTC-USD', timeframe: '15m', close: 70000 });
    router.transitionInProgress = false;
    cryptoHandler({ symbol: 'BTC-USD', timeframe: '15m', close: 70100 });

    expect(router.getStatus()).toEqual(expect.objectContaining({
      callbackFence: expect.objectContaining({
        activeEpoch: 1,
        activeSession: 'crypto',
        activeBrokerId: 'kraken',
        activeTransitionId: expect.stringContaining('startup-to-crypto'),
        accepted: 1,
        rejected: 1,
        lastAcceptedAt: now.toISOString(),
        lastRejectedAt: now.toISOString(),
        lastRejectedReason: 'transition in progress'
      })
    }));
  });

  test('refuses callback fence attachment without broker identity', async () => {
    const router = makeRouter();
    router.krakenAdapter.getBrokerName = jest.fn(() => null);
    delete router.krakenAdapter.id;

    await expect(router._activateCrypto()).rejects.toThrow(
      'SessionRouter crypto adapter missing broker identity for OHLC fence'
    );
    expect(router.onOhlcCallback).not.toHaveBeenCalled();
  });
});
