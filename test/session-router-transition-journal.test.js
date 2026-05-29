'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionRouter = require('../core/SessionRouter');

describe('SessionRouter transition journal', () => {
  const now = new Date('2026-05-26T14:30:00.000Z');
  let tempDir;
  let consoleLogSpy;
  let consoleErrorSpy;

  function makeRouter(overrides = {}) {
    const router = new SessionRouter({
      enabled: true,
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
      unsubscribeAll: jest.fn(),
      removeAllListeners: jest.fn(),
      subscribeToCandles: jest.fn(),
      on: jest.fn()
    };
    router.alpacaAdapter = {
      unsubscribeAll: jest.fn(),
      removeAllListeners: jest.fn(),
      subscribeToCandles: jest.fn(),
      on: jest.fn()
    };

    return router;
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-journal-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('successful transition appends ordered durable phase events', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    const recordSpy = jest.spyOn(router.transitionStore, 'recordTransitionEvent');

    await router._transitionToStocks(now);

    const events = router.transitionStore.readEvents();
    const status = router.transitionStore.readStatus();
    const intentCall = recordSpy.mock.calls.findIndex(([eventName]) => (
      eventName === 'SESSION_ORDER_INTENT_RECORDED'
    ));

    expect(events.map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_ORDER_INTENT_RECORDED',
      'SESSION_TARGET_ACTIVATED'
    ]);
    expect(new Set(events.map((event) => event.transitionId)).size).toBe(1);
    expect(new Set(events.map((event) => event.epoch)).size).toBe(1);
    expect(events[0]).toEqual(expect.objectContaining({
      from: 'crypto',
      to: 'stocks',
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m'
    }));
    expect(events[1]).toEqual(expect.objectContaining({
      activeSession: 'crypto',
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m',
      pauseConfirmed: true
    }));
    expect(events[2]).toEqual(expect.objectContaining({
      activeSession: 'crypto',
      patternMemory: expect.objectContaining({
        skipped: false,
        reason: 'already_active',
        storagePath: '/data/unified-patterns.paper.stocks.json',
        mode: 'paper',
        assetBucket: 'stocks'
      })
    }));
    expect(events[3]).toEqual(expect.objectContaining({
      brokerId: 'alpaca',
      symbols: ['TSLA']
    }));
    expect(events[4]).toEqual(expect.objectContaining({
      activeSession: 'stocks',
      brokerId: 'alpaca',
      symbols: ['TSLA']
    }));
    expect(status).toEqual(expect.objectContaining({
      state: 'TARGET_ACTIVATED',
      recoveryRequired: false,
      freezeNewEntries: false,
      from: 'crypto',
      to: 'stocks',
      activeSession: 'stocks',
      brokerId: 'alpaca',
      lastEvent: 'SESSION_TARGET_ACTIVATED',
      eventsCount: 5
    }));
    expect(intentCall).toBeGreaterThanOrEqual(0);
    expect(recordSpy.mock.invocationCallOrder[intentCall]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
    expect(router.stateManager.resumeTrading).toHaveBeenCalledTimes(1);
  });

  test('transition to stocks switches pattern bank before target broker mutation', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    const memory = {
      switchSessionScope: jest.fn(() => ({
        switched: true,
        reason: 'session_router_transition',
        previousPath: '/data/unified-patterns.paper.crypto.json',
        storagePath: '/data/unified-patterns.paper.stocks.json',
        mode: 'paper',
        assetBucket: 'stocks',
        patternCount: 0,
        loaded: false,
        targetExists: false
      }))
    };
    router.ctx = {
      config: {
        executionMode: 'paper',
        accountId: 'acct-main',
        accountIdSource: 'config',
        timeframe: '1m',
      },
      patternChecker: { memory }
    };

    await router._transitionToStocks(now);

    expect(memory.switchSessionScope).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
    }), expect.objectContaining({
      reason: 'session_router_transition',
      from: 'crypto',
      to: 'stocks'
    }));
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeGreaterThan(
      router.stateManager.pauseTrading.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.krakenAdapter.unsubscribeAll.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.stateManager.resumeTrading.mock.invocationCallOrder[0]
    );
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_ORDER_INTENT_RECORDED',
      'SESSION_TARGET_ACTIVATED'
    ]);
  });

  test('pattern bank switch failure enters failed-safe before target broker mutation', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    const memory = {
      switchSessionScope: jest.fn(() => {
        throw new Error('target pattern bank corrupt');
      })
    };
    router.ctx = {
      config: {
        executionMode: 'paper',
        accountId: 'acct-main',
        accountIdSource: 'config',
        timeframe: '1m',
      },
      patternChecker: { memory }
    };

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('target pattern bank corrupt');
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_FAILED_SAFE'
    ]);
  });

  test('missing pattern memory owner enters failed-safe before target broker mutation', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.ctx = {
      candleTimeframe: '15m',
      config: {
        executionMode: 'paper',
        accountId: 'acct-main',
        accountIdSource: 'config',
        timeframe: '15m',
      }
    };

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter pattern memory unavailable for session handoff');
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_FAILED_SAFE'
    ]);
  });

  test('wrong target pattern bank result enters failed-safe before target broker mutation', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    const memory = {
      switchSessionScope: jest.fn(() => ({
        switched: true,
        reason: 'session_router_transition',
        storagePath: '/data/unified-patterns.paper.crypto.json',
        mode: 'paper',
        assetBucket: 'crypto',
        patternCount: 4,
        loaded: true,
        targetExists: true
      }))
    };
    router.ctx = {
      candleTimeframe: '15m',
      config: {
        executionMode: 'paper',
        accountId: 'acct-main',
        accountIdSource: 'config',
        timeframe: '15m',
      },
      patternChecker: { memory }
    };

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toMatch(/pattern memory handoff target mismatch/);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
  });

  test('transition to crypto saves stock outcomes before switching pattern bank', async () => {
    const router = makeRouter({ forceCloseOnSessionEnd: true });
    router.activeSession = 'stocks';
    router.stateManager.getLastPrice = jest.fn(() => 125);
    router.stateManager.closePosition = jest.fn().mockResolvedValue({ success: true });
    router.stateManager.state.activeTrades = new Map([
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', assetClass: 'stocks' }]
    ]);
    const memory = {
      switchSessionScope: jest.fn(() => ({
        switched: true,
        reason: 'session_router_transition',
        previousPath: '/data/unified-patterns.paper.stocks.json',
        storagePath: '/data/unified-patterns.paper.crypto.json',
        mode: 'paper',
        assetBucket: 'crypto',
        patternCount: 2,
        loaded: true,
        targetExists: true
      }))
    };
    router.ctx = {
      config: {
        executionMode: 'paper',
        accountId: 'acct-main',
        accountIdSource: 'config',
        timeframe: '1m',
      },
      patternChecker: { memory }
    };

    await router._transitionToCrypto(now);

    expect(memory.switchSessionScope).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      accountId: 'acct-main',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '1m',
    }), expect.objectContaining({
      sourceFlatConfirmed: true
    }));
    expect(router.stateManager.closePosition.mock.invocationCallOrder[0]).toBeLessThan(
      memory.switchSessionScope.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.alpacaAdapter.unsubscribeAll.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
  });

  test('initial activation switches pattern bank before broker activation', () => {
    const router = makeRouter();
    const memory = router.ctx.patternChecker.memory;

    router._activateCrypto();

    expect(memory.switchSessionScope).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '15m',
    }), expect.objectContaining({
      reason: 'initial_activation'
    }));
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.krakenAdapter.subscribeToCandles.mock.invocationCallOrder[0]
    );
    expect(router.activeSession).toBe('crypto');
  });

  test('transition failure appends failed-safe event and keeps trading paused', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.krakenAdapter.unsubscribeAll.mockImplementation(() => {
      throw new Error('kraken unsubscribe failed');
    });

    await router._transitionToStocks(now);

    const events = router.transitionStore.readEvents();
    const status = router.transitionStore.readStatus();

    expect(events.map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_FAILED_SAFE'
    ]);
    expect(new Set(events.map((event) => event.transitionId)).size).toBe(1);
    expect(new Set(events.map((event) => event.epoch)).size).toBe(1);
    expect(events[3]).toEqual(expect.objectContaining({
      from: 'crypto',
      to: 'stocks',
      activeSession: 'crypto',
      reason: 'kraken unsubscribe failed'
    }));
    expect(status).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true,
      from: 'crypto',
      to: 'stocks',
      activeSession: 'crypto',
      safeModeReason: 'kraken unsubscribe failed',
      lastEvent: 'SESSION_FAILED_SAFE',
      eventsCount: 4
    }));
    expect(router.failedSafeMode).toBe(true);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.stateManager.state.isTrading).toBe(false);
  });

  test('journal write failure enters failed-safe before broker mutation', async () => {
    const router = makeRouter({
      transitionStore: {
        nextEpoch: jest.fn(() => 44),
        recordTransitionEvent: jest.fn(() => {
          throw new Error('journal unavailable');
        }),
        readStatus: jest.fn(() => ({
          state: 'RECOVERY_REQUIRED',
          recoveryRequired: true,
          freezeNewEntries: true
        }))
      }
    });
    router.activeSession = 'crypto';

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('journal unavailable');
    expect(router.stateManager.pauseTrading).not.toHaveBeenCalledWith(
      'SessionRouter: transitioning to stocks'
    );
    expect(router.stateManager.pauseTrading).toHaveBeenCalledWith(
      'SessionRouter failed safe: crypto -> stocks: journal unavailable'
    );
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
  });

  test('target journal failure after resume re-pauses trading and records failed-safe', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    const originalRecord = router.transitionStore.recordTransitionEvent.bind(router.transitionStore);
    jest.spyOn(router.transitionStore, 'recordTransitionEvent').mockImplementation((eventName, details) => {
      if (eventName === 'SESSION_TARGET_ACTIVATED') {
        throw new Error('target journal write failed');
      }
      return originalRecord(eventName, details);
    });

    await router._transitionToStocks(now);

    const events = router.transitionStore.readEvents();
    const status = router.transitionStore.readStatus();

    expect(events.map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_ORDER_INTENT_RECORDED',
      'SESSION_FAILED_SAFE'
    ]);
    expect(router.stateManager.resumeTrading).toHaveBeenCalledTimes(1);
    expect(router.stateManager.pauseTrading).toHaveBeenCalledWith(
      'SessionRouter failed safe: crypto -> stocks: target journal write failed'
    );
    expect(router.stateManager.state.isTrading).toBe(false);
    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafePauseConfirmed).toBe(true);
    expect(status).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true,
      activeSession: 'stocks',
      safeModeReason: 'target journal write failed',
      lastEvent: 'SESSION_FAILED_SAFE'
    }));
  });
});
