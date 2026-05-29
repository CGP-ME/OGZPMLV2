'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionRouter = require('../core/SessionRouter');

describe('SessionRouter failed-safe transition behavior', () => {
  const now = new Date('2026-05-26T14:30:00.000Z');
  let consoleLogSpy;
  let consoleErrorSpy;
  let tempDir;

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
      getLastPrice: jest.fn(() => 125),
      closePosition: jest.fn().mockImplementation(async () => ({ success: true })),
      pauseTrading: jest.fn().mockImplementation(async (reason) => {
        router.stateManager.state.isTrading = false;
        router.stateManager.state.pauseReason = reason;
        router.stateManager.state.lastError = reason;
        return { success: true };
      }),
      resumeTrading: jest.fn().mockResolvedValue({ success: true })
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-fail-safe-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
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
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', assetClass: 'stock' }]
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
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', assetClass: 'stock' }]
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

  test('transition to crypto fails safe when closePosition does not confirm success', async () => {
    const router = makeRouter({ forceCloseOnSessionEnd: true });
    router.activeSession = 'stocks';
    router.stateManager.state.activeTrades = new Map([
      ['STOCK_1', { tradeId: 'STOCK_1', symbol: 'TSLA', assetClass: 'stock' }]
    ]);
    router.stateManager.closePosition.mockResolvedValue({ success: false, error: 'broker close rejected' });

    await router._transitionToCrypto(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('SessionRouter source force-close failed for 1 position(s)');
    expect(router.stateManager.closePosition).toHaveBeenCalledWith(125, false, null, {
      orderId: 'STOCK_1',
      exitReason: 'session_close',
      tradeId: 'STOCK_1'
    });
    expect(router.stateManager.resumeTrading).not.toHaveBeenCalled();
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.stateManager.state.isTrading).toBe(false);
  });

  test('pause failure applies visible local pause fallback', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.stateManager.pauseTrading.mockRejectedValue(new Error('state write failed'));
    const fallbackEvents = [];
    router.on('session_failed_safe_pause_fallback', (event) => fallbackEvents.push(event));

    await router._transitionToStocks(now);

    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('state write failed');
    expect(router.failedSafePauseConfirmed).toBe(true);
    expect(router.failedSafePauseError).toBe('state write failed');
    expect(router.failedSafePauseFallbackApplied).toBe(true);
    expect(router.stateManager.state.isTrading).toBe(false);
    expect(router.stateManager.state.pauseReason).toBe(
      'SessionRouter failed safe: crypto -> stocks: state write failed'
    );
    expect(fallbackEvents).toEqual([
      expect.objectContaining({
        from: 'crypto',
        to: 'stocks',
        reason: 'state write failed',
        fallbackApplied: true,
        pauseConfirmed: true,
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

  test('direct activation methods refuse to run while failed-safe mode is active', () => {
    const router = makeRouter();
    router.failedSafeMode = true;

    router._activateCrypto();
    router._activateStocks();

    expect(router.activeSession).toBe(null);
    expect(router.orderRouter.registerBroker).not.toHaveBeenCalled();
    expect(router.krakenAdapter.subscribeToCandles).not.toHaveBeenCalled();
    expect(router.alpacaAdapter.subscribeToCandles).not.toHaveBeenCalled();
  });

  test('transition check is blocked while failed-safe mode is active', () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.failedSafeMode = true;
    const transitionSpy = jest.spyOn(router, '_transitionToStocks');

    router._checkTransition();

    expect(transitionSpy).not.toHaveBeenCalled();
  });
});
