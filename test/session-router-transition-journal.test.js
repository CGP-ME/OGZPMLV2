'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionRouter = require('../core/SessionRouter');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('SessionRouter transition journal', () => {
  const now = new Date('2026-05-26T14:30:00.000Z');
  let tempDir;
  let consoleLogSpy;
  let consoleErrorSpy;
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
      pauseTrading: jest.fn().mockImplementation(async (reason) => {
        router.stateManager.state.isTrading = false;
        router.stateManager.state.pauseReason = reason;
        return { success: true };
      }),
      resumeTrading: jest.fn().mockImplementation(async () => {
        router.stateManager.state.isTrading = true;
        return { success: true };
      }),
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
    router.executeTrade = jest.fn().mockImplementation(async (decision) => {
      router.stateManager.state.activeTrades.delete(decision.tradeId);
    });
    router.getExitPrice = jest.fn(() => null);
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-journal-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    restoreRuntimeEnv();
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
      'SESSION_BROKER_RECONCILED',
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
      brokerReconciliation: expect.objectContaining({
        source: expect.objectContaining({
          brokerId: 'kraken',
          openPositions: [],
          openOrders: [],
          balanceChecked: true
        }),
        target: expect.objectContaining({
          brokerId: 'alpaca',
          openPositions: [],
          openOrders: [],
          balanceChecked: true
        })
      })
    }));
    expect(events[3]).toEqual(expect.objectContaining({
      activeSession: 'crypto',
      patternMemory: expect.objectContaining({
        skipped: false,
        reason: 'already_active',
        storagePath: '/data/unified-patterns.paper.stocks.json',
        mode: 'paper',
        assetBucket: 'stocks'
      })
    }));
    expect(events[4]).toEqual(expect.objectContaining({
      brokerId: 'alpaca',
      symbols: ['TSLA']
    }));
    expect(events[5]).toEqual(expect.objectContaining({
      activeSession: 'stocks',
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      runtimeScope: expect.objectContaining({
        symbol: 'TSLA',
        brokerId: 'alpaca',
        accountId: 'acct-main',
        accountIdSource: 'config',
        assetClass: 'stocks',
        executionMode: 'paper',
        timeframe: '15m',
        scopeComplete: true
      }),
      runtimeScopeStatus: 'complete',
      scopeComplete: true
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
      runtimeScope: expect.objectContaining({
        symbol: 'TSLA',
        brokerId: 'alpaca',
        accountId: 'acct-main',
        accountIdSource: 'config',
        assetClass: 'stocks',
        executionMode: 'paper',
        timeframe: '15m',
        scopeComplete: true
      }),
      runtimeScopeStatus: 'complete',
      scopeComplete: true,
      eventsCount: 6
    }));
    expect(intentCall).toBeGreaterThanOrEqual(0);
    expect(recordSpy.mock.invocationCallOrder[intentCall]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
    expect(router.stateManager.resumeTrading).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(router.transitionStore.lockPath)).toBe(false);
  });

  test('transition broker side effects are persisted as committed broker intents', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';

    await router._transitionToStocks(now);

    const intentRecords = router.transitionStore.readBrokerIntents();
    expect(intentRecords.map((record) => `${record.event}:${record.action}:${record.brokerId}:${record.symbol || (record.symbols || []).join(',')}`)).toEqual([
      'BROKER_INTENT_RECORDED:unsubscribe_all:kraken:',
      'BROKER_INTENT_COMMITTED:unsubscribe_all:kraken:',
      'BROKER_INTENT_RECORDED:remove_ohlc_listeners:kraken:',
      'BROKER_INTENT_COMMITTED:remove_ohlc_listeners:kraken:',
      'BROKER_INTENT_RECORDED:register_order_router:alpaca:TSLA',
      'BROKER_INTENT_COMMITTED:register_order_router:alpaca:TSLA',
      'BROKER_INTENT_RECORDED:subscribe_candles:alpaca:TSLA',
      'BROKER_INTENT_COMMITTED:subscribe_candles:alpaca:TSLA'
    ]);
    expect(new Set(intentRecords.map((record) => record.transitionId))).toEqual(new Set([
      router.transitionStore.readEvents()[0].transitionId
    ]));
    expect(new Set(intentRecords.map((record) => record.epoch)).size).toBe(1);
    for (const record of intentRecords) {
      expect(record).toEqual(expect.objectContaining({
        accountId: 'acct-main',
        accountIdSource: 'config',
        executionMode: 'paper',
        timeframe: '15m'
      }));
    }
  });

  test('committed broker intent replay skips duplicate broker side effect', async () => {
    const router = makeRouter();
    const transitionContext = router._beginTransitionContext('crypto', 'stocks', now, {
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m'
    });
    const execute = jest.fn(() => ({ ok: true }));

    const first = await router._executeBrokerIntent(transitionContext, 'alpaca', 'subscribe_candles', execute, {
      symbol: 'TSLA',
      timeframe: '15m'
    });
    const second = await router._executeBrokerIntent(transitionContext, 'alpaca', 'subscribe_candles', execute, {
      symbol: 'TSLA',
      timeframe: '15m'
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(first).toEqual(expect.objectContaining({
      skipped: false
    }));
    expect(second).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'already_committed',
      intentId: first.intentId
    }));
    expect(router.transitionStore.readBrokerIntents().map((record) => record.event)).toEqual([
      'BROKER_INTENT_RECORDED',
      'BROKER_INTENT_COMMITTED'
    ]);
  });

  test('recorded uncommitted broker intent blocks replay before broker side effect', async () => {
    const router = makeRouter();
    const transitionContext = router._beginTransitionContext('crypto', 'stocks', now, {
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m'
    });
    const intentDetails = router._brokerIntentDetails(transitionContext, 'alpaca', 'subscribe_candles', {
      symbol: 'TSLA',
      timeframe: '15m'
    });
    const prior = router.transitionStore.recordBrokerIntent(intentDetails);
    const execute = jest.fn();

    await expect(router._executeBrokerIntent(transitionContext, 'alpaca', 'subscribe_candles', execute, {
      symbol: 'TSLA',
      timeframe: '15m'
    })).rejects.toThrow(`SessionRouter broker intent ${prior.intentId} already recorded without commit; recovery required before replay`);

    expect(execute).not.toHaveBeenCalled();
    expect(router.transitionStore.readBrokerIntents()).toHaveLength(1);
  });

  test('commit failure after broker side effect leaves intent uncommitted for recovery', async () => {
    const router = makeRouter();
    const transitionContext = router._beginTransitionContext('crypto', 'stocks', now, {
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m'
    });
    const execute = jest.fn(() => ({ ok: true }));
    jest.spyOn(router.transitionStore, 'commitBrokerIntent').mockImplementation(() => {
      throw new Error('intent disk full');
    });

    await expect(router._executeBrokerIntent(transitionContext, 'alpaca', 'subscribe_candles', execute, {
      symbol: 'TSLA',
      timeframe: '15m'
    })).rejects.toThrow(/broker side effect completed but commit failed: intent disk full/);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(router.transitionStore.readBrokerIntents().map((record) => record.event)).toEqual([
      'BROKER_INTENT_RECORDED'
    ]);
    expect(router.transitionStore.readEvents().map((record) => record.event)).toEqual([
      'RECOVERY_REQUIRED'
    ]);
    expect(router.transitionStore.readStatus()).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      safeModeReason: expect.stringContaining('completed but commit failed')
    }));
  });

  test('fresh transition lock blocks broker mutation and enters failed-safe', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.transitionStore.acquireLock({
      transitionId: 'other-owner',
      epoch: 1
    });

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter transition lock unavailable: fresh transition lock already held');
    expect(router.stateManager.pauseTrading).not.toHaveBeenCalledWith(
      'SessionRouter: transitioning to stocks'
    );
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(fs.existsSync(router.transitionStore.lockPath)).toBe(true);
    expect(router.transitionStore.readEvents()).toHaveLength(0);
  });

  test('stale transition lock blocks broker mutation and projects recovery required', async () => {
    const router = makeRouter({
      transitionStoreOptions: {
        dir: tempDir,
        staleLockMs: 1000,
        clock: () => now.getTime()
      }
    });
    router.activeSession = 'crypto';
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(router.transitionStore.lockPath, JSON.stringify({
      transitionId: 'stale-owner',
      epoch: 7,
      ownerId: 'pid:old',
      acquiredAt: new Date(now.getTime() - 5000).toISOString(),
      heartbeatAt: new Date(now.getTime() - 5000).toISOString()
    }), 'utf8');

    await router._transitionToStocks(now);

    const status = router.transitionStore.readStatus();
    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter transition lock unavailable: stale transition lock present');
    expect(status).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      safeModeReason: 'stale transition lock present'
    }));
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
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
      router.alpacaAdapter.getBalance.mock.invocationCallOrder[0]
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
      'SESSION_BROKER_RECONCILED',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_ORDER_INTENT_RECORDED',
      'SESSION_TARGET_ACTIVATED'
    ]);
  });

  test('transition to stocks force-closes crypto source trades before REST reconcile and target handoff', async () => {
    const router = makeRouter({ forceCloseOnSessionEnd: true });
    router.activeSession = 'crypto';
    router.getExitPrice = jest.fn(() => 70000);
    router.stateManager.state.activeTrades = new Map([
      ['BTC_1', { tradeId: 'BTC_1', symbol: 'BTC-USD', action: 'BUY', direction: 'long', assetClass: 'crypto' }]
    ]);

    await router._transitionToStocks(now);

    expect(router.executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'BTC_1', exitReason: 'session_close' },
      { totalConfidence: 100 },
      70000,
      {},
      [],
      null,
      null,
      'BTC-USD'
    );
    expect(router.executeTrade.mock.invocationCallOrder[0]).toBeLessThan(
      router.krakenAdapter.getPositions.mock.invocationCallOrder[0]
    );
    expect(router.krakenAdapter.getPositions.mock.invocationCallOrder[0]).toBeLessThan(
      router.ctx.patternChecker.memory.switchSessionScope.mock.invocationCallOrder[0]
    );
    expect(router.activeSession).toBe('stocks');
    expect(router.failedSafeMode).toBe(false);
  });

  test('source broker open position blocks target activation before pattern handoff', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.krakenAdapter.getPositions.mockResolvedValue([
      { symbol: 'BTC-USD', quantity: 0, side: 'long' }
    ]);
    const memory = router.ctx.patternChecker.memory;

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter broker REST reconciliation blocked activation: source kraken open positions=1');
    expect(memory.switchSessionScope).not.toHaveBeenCalled();
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_BROKER_RECONCILE_FAILED',
      'SESSION_FAILED_SAFE'
    ]);
  });

  test('target broker open order blocks target activation before pattern handoff', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.alpacaAdapter.getOpenOrders.mockResolvedValue([
      { orderId: 'ALPACA_OPEN_1', symbol: 'TSLA', side: 'buy', amount: 10, filledAmount: 10, status: 'open' }
    ]);
    const memory = router.ctx.patternChecker.memory;

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter broker REST reconciliation blocked activation: target alpaca open orders=1');
    expect(memory.switchSessionScope).not.toHaveBeenCalled();
    expect(router.krakenAdapter.unsubscribeAll).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE',
      'SESSION_BROKER_RECONCILE_FAILED',
      'SESSION_FAILED_SAFE'
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
      'SESSION_BROKER_RECONCILED',
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
      'SESSION_BROKER_RECONCILED',
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
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', action: 'BUY', direction: 'long', assetClass: 'stocks' }]
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
    expect(router.executeTrade.mock.invocationCallOrder[0]).toBeLessThan(
      router.alpacaAdapter.getPositions.mock.invocationCallOrder[0]
    );
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
    expect(router.alpacaAdapter.getPositions.mock.invocationCallOrder[0]).toBeLessThan(
      memory.switchSessionScope.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.alpacaAdapter.unsubscribeAll.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
  });

  test('initial activation reconciles broker REST and switches pattern bank before broker activation', async () => {
    const router = makeRouter();
    const memory = router.ctx.patternChecker.memory;

    await router._activateCrypto();

    expect(memory.switchSessionScope).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '15m',
    }), expect.objectContaining({
      reason: 'initial_activation'
    }));
    expect(router.krakenAdapter.getPositions.mock.invocationCallOrder[0]).toBeLessThan(
      memory.switchSessionScope.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
    expect(memory.switchSessionScope.mock.invocationCallOrder[0]).toBeLessThan(
      router.krakenAdapter.subscribeToCandles.mock.invocationCallOrder[0]
    );
    expect(router.activeSession).toBe('crypto');
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_BROKER_RECONCILED',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_TARGET_ACTIVATED'
    ]);
  });

  test('startup activation clears only a stale SessionRouter-owned pause after target activation', async () => {
    const router = makeRouter();
    router.stateManager.state.isTrading = false;
    router.stateManager.state.pauseReason = 'SessionRouter wind-down soft_stop: 30 min until crypto';
    router.stateManager.resumeTradingIfPausedBy = jest.fn().mockImplementation(async () => {
      router.stateManager.state.isTrading = true;
      router.stateManager.state.pauseReason = null;
      return { success: true, resumed: true };
    });

    await router._activateCrypto();

    expect(router.stateManager.resumeTradingIfPausedBy).toHaveBeenCalledWith(
      'session_router_wind_down',
      expect.objectContaining({
        allowLegacyUnscoped: true,
        legacyReasonPrefixes: ['SessionRouter wind-down', 'SessionRouter: transitioning'],
        resumeSource: 'session_router_startup_activation',
        reason: 'SessionRouter startup activation confirmed crypto'
      })
    );
    expect(router.krakenAdapter.subscribeToCandles.mock.invocationCallOrder[0]).toBeLessThan(
      router.stateManager.resumeTradingIfPausedBy.mock.invocationCallOrder[0]
    );
    expect(router.stateManager.state.isTrading).toBe(true);
  });

  test('initial activation aborts before pattern handoff when target REST is unavailable', async () => {
    const router = makeRouter();
    const memory = router.ctx.patternChecker.memory;
    router.krakenAdapter.getBalance.mockRejectedValue(new Error('kraken REST unavailable'));

    await expect(router._activateCrypto()).rejects.toThrow('kraken REST unavailable');

    expect(memory.switchSessionScope).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.activeSession).toBe(null);
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_BROKER_RECONCILE_FAILED'
    ]);
  });

  test('initial activation does not claim active session when broker registration fails', async () => {
    const router = makeRouter();
    router.orderRouter.registerBroker.mockImplementation(() => {
      throw new Error('register failed');
    });

    await expect(router._activateCrypto()).rejects.toThrow('register failed');

    expect(router.activeSession).toBe(null);
    expect(router.activeBroker).toBe(null);
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.transitionStore.readEvents().map((event) => event.event)).toEqual([
      'SESSION_BROKER_RECONCILED',
      'SESSION_PATTERN_MEMORY_HANDOFF'
    ]);
  });

  test('start refuses persisted recovery-required transition state before activation', async () => {
    const router = makeRouter();
    router.transitionStore.markRecoveryRequired('prior transition failed', {
      transitionId: 'stocks-to-crypto-prior',
      epoch: 9
    });

    await expect(router.start()).resolves.toEqual(expect.objectContaining({
      started: false,
      failedSafe: true,
      reason: 'SessionRouter transition store requires recovery before start: prior transition failed',
      activeSession: null
    }));

    expect(router.activeSession).toBe(null);
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
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
      'SESSION_BROKER_RECONCILED',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_FAILED_SAFE'
    ]);
    expect(new Set(events.map((event) => event.transitionId)).size).toBe(1);
    expect(new Set(events.map((event) => event.epoch)).size).toBe(1);
    expect(events[4]).toEqual(expect.objectContaining({
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
      eventsCount: 5
    }));
    expect(router.failedSafeMode).toBe(true);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.stateManager.state.isTrading).toBe(false);
  });

  test('journal write failure enters failed-safe before broker mutation', async () => {
    const router = makeRouter({
      transitionStore: {
        nextEpoch: jest.fn(() => 44),
        acquireLock: jest.fn((details) => ({
          success: true,
          lock: {
            transitionId: details.transitionId,
            epoch: details.epoch,
            ownerId: 'test-owner',
            acquiredAt: now.toISOString()
          }
        })),
        releaseLock: jest.fn(() => ({ released: true })),
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

  test('target journal failure before resume keeps trading paused and records failed-safe', async () => {
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
      'SESSION_BROKER_RECONCILED',
      'SESSION_PATTERN_MEMORY_HANDOFF',
      'SESSION_ORDER_INTENT_RECORDED',
      'SESSION_FAILED_SAFE'
    ]);
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.stateManager.pauseTrading).toHaveBeenCalledTimes(1);
    expect(router.stateManager.pauseTrading).toHaveBeenCalledWith(
      'SessionRouter: transitioning to stocks'
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
