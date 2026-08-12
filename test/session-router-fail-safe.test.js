'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionRouter = require('../core/SessionRouter');
const { subscribeTrace } = require('../core/TraceSpine');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('SessionRouter failed-safe transition behavior', () => {
  const now = new Date('2026-05-26T14:30:00.000Z');
  let consoleLogSpy;
  let consoleErrorSpy;
  let tempDir;
  let restoreRuntimeEnv;

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
      getLastPrice: jest.fn(() => 125),
      closePosition: jest.fn().mockImplementation(async () => ({ success: true })),
      pauseTrading: jest.fn().mockImplementation(async (reason) => {
        router.stateManager.state.isTrading = false;
        router.stateManager.state.pauseReason = reason;
        router.stateManager.state.lastError = reason;
        return { success: true };
      }),
      resumeTrading: jest.fn().mockResolvedValue({ success: true }),
      setDashboardRuntimeScope: jest.fn((scope) => ({
        ...scope,
        broker: scope.brokerId,
        scopeKey: `${scope.executionMode}:${scope.brokerId}:${scope.accountId}:${scope.assetClass}:${scope.symbol}:${scope.timeframe}`,
        scopeKeyVersion: 2,
        scopeComplete: true,
        runtimeScopeStatus: 'complete',
        missingFields: []
      }))
    };
    router.executeTrade = jest.fn().mockImplementation(async (decision) => {
      router.stateManager.state.activeTrades.delete(decision.tradeId);
    });
    router.getExitPrice = jest.fn(() => null);
    router.orderRouter = { registerBroker: jest.fn() };
    router.onOhlcCallback = jest.fn();
    router.ctx = {
      candleTimeframe: '15m',
      config: {
        executionMode: 'paper',
        accountId: 'acct-main',
        accountIdSource: 'config',
        timeframe: '15m',
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
            targetExists: false,
          }))
        }
      }
    };
    router.krakenAdapter = {
      getBrokerName: jest.fn(() => 'kraken'),
      getPositions: jest.fn().mockResolvedValue([]),
      getOpenOrders: jest.fn().mockResolvedValue([]),
      getBalance: jest.fn().mockResolvedValue({ total: 10000 }),
      unsubscribeAll: jest.fn(),
      removeAllListeners: jest.fn(),
      subscribeToCandles: jest.fn(),
      on: jest.fn()
    };
    router.alpacaAdapter = {
      getBrokerName: jest.fn(() => 'alpaca'),
      getPositions: jest.fn().mockResolvedValue([]),
      getOpenOrders: jest.fn().mockResolvedValue([]),
      getBalance: jest.fn().mockResolvedValue({ equity: 10000 }),
      unsubscribeAll: jest.fn(),
      removeAllListeners: jest.fn(),
      subscribeToCandles: jest.fn(),
      on: jest.fn()
    };

    return router;
  }

  beforeEach(() => {
    restoreRuntimeEnv = applyExplicitRuntimeTestEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-fail-safe-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    restoreRuntimeEnv();
  });

  test('transition to stocks failure enters failed-safe mode without resuming trading', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.krakenAdapter.unsubscribeAll.mockImplementation(() => {
      throw new Error('kraken unsubscribe failed');
    });
    const failedSafeEvents = [];
    router.on('session_failed_safe', (event) => failedSafeEvents.push(event));

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('kraken unsubscribe failed');
    expect(router.failedSafeAt).toBe(now.toISOString());
    expect(router.failedSafePauseConfirmed).toBe(true);
    expect(router.failedSafePauseError).toBe(null);
    expect(router.failedSafePauseFallbackApplied).toBe(false);
    expect(router.transitionInProgress).toBe(false);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.stateManager.pauseTrading).toHaveBeenCalledWith(
      'SessionRouter: transitioning to stocks'
    );
    expect(router.stateManager.pauseTrading).toHaveBeenCalledTimes(1);
    expect(failedSafeEvents).toEqual([
      expect.objectContaining({
        from: 'crypto',
        to: 'stocks',
        reason: 'kraken unsubscribe failed',
        at: now.toISOString(),
        journalError: null
      })
    ]);
    expect(router.getStatus()).toEqual(expect.objectContaining({
      failedSafeMode: true,
      failedSafeReason: 'kraken unsubscribe failed',
      failedSafeAt: now.toISOString(),
      failedSafePauseConfirmed: true,
      failedSafePauseError: null,
      failedSafePauseFallbackApplied: false
    }));
  });

  test('transition to crypto failure enters failed-safe mode without resuming trading', async () => {
    const router = makeRouter();
    router.activeSession = 'stocks';
    router.alpacaAdapter.unsubscribeAll.mockImplementation(() => {
      throw new Error('alpaca unsubscribe failed');
    });

    await router._transitionToCrypto(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('alpaca unsubscribe failed');
    expect(router.transitionInProgress).toBe(false);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.stateManager.pauseTrading).toHaveBeenCalledWith(
      'SessionRouter: transitioning to crypto'
    );
    expect(router.stateManager.pauseTrading).toHaveBeenCalledTimes(1);
  });

  test('transition to crypto fails safe when source position has no close price', async () => {
    const router = makeRouter({ forceCloseOnSessionEnd: true });
    router.activeSession = 'stocks';
    router.stateManager.state.activeTrades = new Map([
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', action: 'BUY', direction: 'long', assetClass: 'stock' }]
    ]);
    router.stateManager.getLastPrice.mockReturnValue(null);

    await router._transitionToCrypto(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter source force-close failed for 1 position(s)');
    expect(router.activeSession).toBe('stocks');
    expect(router.stateManager.closePosition).not.toHaveBeenCalled();
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.stateManager.state.isTrading).toBe(false);
  });

  test('transition to crypto fails safe when force close is disabled but source positions exist', async () => {
    const router = makeRouter({ forceCloseOnSessionEnd: false });
    router.activeSession = 'stocks';
    router.stateManager.state.activeTrades = new Map([
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', action: 'BUY', direction: 'long', assetClass: 'stock' }]
    ]);

    await router._transitionToCrypto(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter source force-close disabled with 1 active position(s)');
    expect(router.activeSession).toBe('stocks');
    expect(router.stateManager.closePosition).not.toHaveBeenCalled();
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.stateManager.state.isTrading).toBe(false);
  });

  test('transition to crypto fails safe when executeTrade does not close source state', async () => {
    const router = makeRouter({ forceCloseOnSessionEnd: true });
    router.activeSession = 'stocks';
    router.stateManager.state.activeTrades = new Map([
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', action: 'BUY', direction: 'long', assetClass: 'stock' }]
    ]);
    router.executeTrade.mockResolvedValue({ success: true });

    await router._transitionToCrypto(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter source force-close failed for 1 position(s)');
    expect(router.executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'STOCK_1', exitReason: 'session_close' },
      { totalConfidence: 100 },
      125,
      {},
      [],
      null,
      null,
      'TSLA'
    );
    expect(router.stateManager.closePosition).not.toHaveBeenCalled();
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.stateManager.state.isTrading).toBe(false);
  });

  test('pause failure reports unconfirmed pause without local state fallback', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.stateManager.pauseTrading.mockRejectedValue(new Error('state write failed'));
    const fallbackEvents = [];
    router.on('session_failed_safe_pause_fallback', (event) => fallbackEvents.push(event));

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('state write failed');
    expect(router.failedSafePauseConfirmed).toBe(false);
    expect(router.failedSafePauseError).toBe('state write failed');
    expect(router.failedSafePauseFallbackApplied).toBe(false);
    expect(router.getEntryBlockStatus()).toEqual(expect.objectContaining({
      blocked: true,
      reason: 'SessionRouter failed safe: crypto -> stocks: state write failed',
      pauseConfirmed: false,
      pauseError: 'state write failed',
      activeSession: 'crypto'
    }));
    expect(router.stateManager.state.isTrading).toBe(true);
    expect(router.stateManager.state.pauseReason).toBeUndefined();
    expect(fallbackEvents).toEqual([
      expect.objectContaining({
        from: 'crypto',
        to: 'stocks',
        reason: 'state write failed',
        fallbackApplied: false,
        pauseConfirmed: false,
        pauseError: 'state write failed'
      })
    ]);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
  });

  test('partial pause failure still reports fallback instead of confirmed pause', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.stateManager.pauseTrading.mockImplementation(async () => {
      router.stateManager.state.isTrading = false;
      throw new Error('partial pause write failed');
    });

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('partial pause write failed');
    expect(router.failedSafePauseConfirmed).toBe(true);
    expect(router.failedSafePauseFallbackApplied).toBe(false);
    expect(router.failedSafePauseError).toBe('partial pause write failed');
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
  });

  test('pause success without paused state enters failed-safe before broker reconciliation', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.stateManager.pauseTrading.mockResolvedValue({ success: true });

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('StateManager pauseTrading did not confirm paused state');
    expect(router.krakenAdapter.getPositions).not.toHaveBeenCalled();
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
  });

  test('transition emits only after SessionRouter writes a verified runtime scope upstream', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    const transitionEvents = [];
    router.on('transition', (ev) => transitionEvents.push(ev));

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(false);
    expect(router.stateManager.setDashboardRuntimeScope).toHaveBeenCalledWith({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m'
    });
    expect(router.stateManager.setDashboardRuntimeScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.stateManager.resumeTrading.mock.invocationCallOrder[0]
    );
    expect(transitionEvents).toEqual([
      expect.objectContaining({
        from: 'crypto',
        to: 'stocks',
        at: now.toISOString(),
        symbol: 'TSLA',
        runtimeScope: expect.objectContaining({
          symbol: 'TSLA',
          brokerId: 'alpaca',
          accountId: 'acct-main',
          accountIdSource: 'config',
          assetClass: 'stocks',
          executionMode: 'paper',
          timeframe: '15m',
          scopeComplete: true
        })
      })
    ]);
  });

  test('missing transition runtime scope is refused in SessionRouter before success emit', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.ctx.config.accountId = null;
    const transitionSpy = jest.fn();
    router.on('transition', transitionSpy);

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter stocks runtime scope missing required field(s): accountId, accountIdSource');
    expect(router.stateManager.setDashboardRuntimeScope).not.toHaveBeenCalled();
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(transitionSpy).not.toHaveBeenCalled();
  });

  test('transition event refuses a runtime scope that does not match the active target session', () => {
    const router = makeRouter();
    router.activeSession = 'stocks';

    expect(() => router._transitionEvent('crypto', 'stocks', now, {
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '15m',
      scopeComplete: true
    })).toThrow('SessionRouter stocks transition runtime scope mismatch: symbol expected TSLA got BTC-USD; brokerId expected alpaca got kraken; assetClass expected stocks got crypto');
  });

  test('runtime scope validation failure after dashboard write does not persist target activated', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    let brokerLookupCount = 0;
    router._brokerIdForSession = jest.fn((sessionName) => {
      if (sessionName === 'stocks') {
        brokerLookupCount += 1;
        return brokerLookupCount === 1 ? 'alpaca' : 'wrong-broker';
      }
      if (sessionName === 'crypto') return 'kraken';
      return null;
    });

    await router._transitionToStocks(now);

    const events = router.transitionStore.readEvents();
    expect(events.map((event) => event.event)).not.toContain('SESSION_TARGET_ACTIVATED');
    expect(router.transitionStore.readStatus()).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true,
      safeModeReason: expect.stringContaining('runtime scope mismatch')
    }));
    expect(router.failedSafeMode).toBe(true);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
  });

  test('direct activation methods refuse to run while failed-safe mode is active', async () => {
    const router = makeRouter();
    router.failedSafeMode = true;

    await router._activateCrypto();
    await router._activateStocks();

    expect(router.activeSession).toBe(null);
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
  });

  test('market phase resolver refuses missing isRTH instead of defaulting sessions', () => {
    const router = makeRouter();

    expect(router._targetSessionFromPhase({ phase: 'rth', isRTH: true }, 'test')).toBe('stocks');
    expect(router._targetSessionFromPhase({ phase: 'ah', isRTH: false }, 'test')).toBe('crypto');
    expect(() => router._targetSessionFromPhase({ phase: 'holiday' }, 'test'))
      .toThrow('SessionRouter test market phase missing boolean isRTH (phase=holiday)');
    expect(() => router._targetSessionFromPhase({ phase: 'rth', isRTH: false }, 'test'))
      .toThrow('SessionRouter test market phase contradicts isRTH (phase=rth, isRTH=false)');
    expect(() => router._targetSessionFromPhase({ phase: 'ah', isRTH: true }, 'test'))
      .toThrow('SessionRouter test market phase contradicts isRTH (phase=ah, isRTH=true)');
  });

  test('startup malformed market phase enters failed-safe without activating crypto fallback', async () => {
    const router = makeRouter();
    jest.spyOn(router, '_targetSessionFromPhase')
      .mockImplementation(() => {
        throw new Error('SessionRouter startup market phase missing boolean isRTH (phase=holiday)');
      });

    await expect(router.start())
      .rejects
      .toThrow('SessionRouter startup market phase missing boolean isRTH (phase=holiday)');

    expect(router.activeSession).toBe(null);
    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter startup market phase missing boolean isRTH (phase=holiday)');
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
  });

  test('transition check malformed market phase enters failed-safe instead of switching sessions', async () => {
    const router = makeRouter();
    router.activeSession = 'stocks';
    const transitionSpy = jest.spyOn(router, '_transitionToCrypto');
    jest.spyOn(router, '_targetSessionFromPhase')
      .mockImplementation(() => {
        throw new Error('SessionRouter transition check market phase missing boolean isRTH (phase=holiday)');
      });

    await router._checkTransition();

    expect(transitionSpy).not.toHaveBeenCalled();
    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter transition check market phase missing boolean isRTH (phase=holiday)');
  });

  test('transition check is blocked while failed-safe mode is active', () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.failedSafeMode = true;
    const transitionSpy = jest.spyOn(router, '_transitionToStocks');

    router._checkTransition();

    expect(transitionSpy).not.toHaveBeenCalled();
  });

  test('scheduled transition interval failure routes to failed-safe halt trace instead of log-only swallow', async () => {
    jest.useFakeTimers();
    const router = makeRouter({ checkIntervalMs: 5 });
    router.activeSession = 'stocks';
    jest.spyOn(router, '_activateStocks').mockImplementation(async () => {
      router.activeSession = 'stocks';
      router.activeBroker = router.alpacaAdapter;
    });
    jest.spyOn(router, '_checkTransition').mockRejectedValue(new Error('transition store read exploded'));
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    try {
      await router.start();
      jest.advanceTimersByTime(5);
      await Promise.resolve();
      await Promise.resolve();

      expect(router.failedSafeMode).toBe(true);
      expect(router.failedSafeReason).toBe('transition store read exploded');
      expect(router.stateManager.pauseTrading).toHaveBeenCalledWith(
        'SessionRouter failed safe: stocks -> unknown: transition store read exploded'
      );
      expect(traces).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'SESSION_ROUTER_FAILED_SAFE_HALT',
          fields: expect.objectContaining({
            reason: 'transition store read exploded',
            from: 'stocks',
            to: 'unknown',
            failureSource: 'scheduled_transition_check'
          })
        })
      ]));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SessionRouter] Check failed:',
        'transition store read exploded'
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Check failure routing failed:'),
        expect.anything()
      );
    } finally {
      unsubscribe();
      router.stop();
    }
  });
});
