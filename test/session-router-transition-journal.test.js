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
      brokerId: 'alpaca',
      symbols: ['TSLA']
    }));
    expect(events[3]).toEqual(expect.objectContaining({
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
      eventsCount: 4
    }));
    expect(intentCall).toBeGreaterThanOrEqual(0);
    expect(recordSpy.mock.invocationCallOrder[intentCall]).toBeLessThan(
      router.orderRouter.registerBroker.mock.invocationCallOrder[0]
    );
    expect(router.stateManager.resumeTrading).toHaveBeenCalledTimes(1);
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
      'SESSION_FAILED_SAFE'
    ]);
    expect(new Set(events.map((event) => event.transitionId)).size).toBe(1);
    expect(new Set(events.map((event) => event.epoch)).size).toBe(1);
    expect(events[2]).toEqual(expect.objectContaining({
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
      eventsCount: 3
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
