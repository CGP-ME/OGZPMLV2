'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SessionRouter = require('../core/SessionRouter');
const { subscribeTrace } = require('../core/TraceSpine');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

// Trey's law: boundary-flat is proven at the broker, never in the ledger.
// Ruling (a): a ghost leg is registered into state FROM broker truth, born
// quarantined and tagged STALE_BROKER_ORPHAN, closed through the ORDINARY exit
// path, and only the broker re-read proves flat. These probes stage what state
// cannot see and assert the rung sees it, registers it, closes it, and re-reads.
describe('SessionRouter broker-proof wind-down rung', () => {
  const flattenNow = new Date('2026-05-26T13:25:00.000Z');
  let consoleLogSpy;
  let consoleErrorSpy;
  let tempDir;
  let restoreRuntimeEnv;

  function makeRouter(overrides = {}) {
    const router = new SessionRouter({
      mode: 'scheduled',
      clock: () => flattenNow.getTime(),
      stockSymbols: ['TSLA'],
      cryptoSymbols: ['BTC-USD'],
      forceCloseOnSessionEnd: true,
      transitionStoreOptions: { dir: tempDir },
      ...overrides
    });

    const activeTrades = new Map();
    router.stateManager = {
      state: { activeTrades, isTrading: true },
      getLastPrice: jest.fn(() => 70000),
      // Registration goes through the real StateManager.openPosition contract
      // in production; here the mock records the context it was handed and
      // inserts the trade so the ordinary close path can find it by tradeId.
      openPosition: jest.fn().mockImplementation(async (sizeUsd, price, context) => {
        activeTrades.set(context.orderId, { ...context, id: context.orderId, sizeUsd, price, entryPrice: price, status: 'open' });
        return { success: true };
      }),
      pauseTrading: jest.fn().mockImplementation(async (reason) => {
        router.stateManager.state.isTrading = false;
        router.stateManager.state.pauseReason = reason;
        return { success: true };
      }),
      resumeTrading: jest.fn().mockResolvedValue({ success: true }),
      setDashboardRuntimeScope: jest.fn((scope) => ({ ...scope, scopeComplete: true }))
    };
    router.executeTrade = jest.fn().mockImplementation(async (decision) => {
      activeTrades.delete(decision.tradeId);
      return { success: true };
    });
    router.getExitPrice = jest.fn(() => null);
    router.orderRouter = { registerBroker: jest.fn() };
    router.onOhlcCallback = jest.fn();
    router.ctx = {
      candleTimeframe: '15m',
      config: { executionMode: 'paper', accountId: 'acct-main', accountIdSource: 'config', timeframe: '15m' }
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

  function captureJournal(router) {
    const journal = [];
    const originalRecord = router._recordTransitionEvent.bind(router);
    router._recordTransitionEvent = jest.fn((eventName, ctx, details) => {
      journal.push({ eventName, details });
      return originalRecord(eventName, ctx, details);
    });
    return journal;
  }

  function orphanStages(traces) {
    return traces
      .filter((t) => t.event === 'SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION')
      .map((t) => t.fields.stage);
  }

  beforeEach(() => {
    restoreRuntimeEnv = applyExplicitRuntimeTestEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-router-broker-proof-'));
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
    restoreRuntimeEnv();
  });

  test('probe 1 (a end to end): ghost registered from broker truth -> ordinary path closes -> re-read [] -> boundary crosses', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.activeBroker = router.krakenAdapter;
    // State knows nothing. The broker holds a long BTC leg with its own entry price.
    router.krakenAdapter.getPositions
      .mockResolvedValueOnce([{ symbol: 'BTC-USD', side: 'long', size: 0.25, entryPrice: 68000 }])
      .mockResolvedValueOnce([]);
    const journal = captureJournal(router);
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    let ready;
    try {
      ready = await router._readyForBoundarySwitch(flattenNow, 'crypto', 'stocks');
    } finally {
      unsubscribe();
    }

    // Registration: born quarantined, tagged, broker-sourced, exit-only.
    expect(router.stateManager.openPosition).toHaveBeenCalledTimes(1);
    const [sizeUsd, entryPrice, context] = router.stateManager.openPosition.mock.calls[0];
    expect(entryPrice).toBe(68000);
    expect(sizeUsd).toBeCloseTo(0.25 * 68000, 6);
    expect(context).toEqual(expect.objectContaining({
      orderId: 'STALE_BROKER_ORPHAN:kraken:BTC-USD:long',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'STALE_BROKER_ORPHAN',
      provenance: 'STALE_BROKER_ORPHAN',
      quarantined: true,
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 0.25,
      entryOrderQuantityUnit: 'base',
      remainingOrderQuantity: 0.25,
      remainingOrderQuantityUnit: 'base'
    }));
    expect(context.exitContract).toEqual(expect.objectContaining({ useStructuralExits: expect.any(Boolean), strategyName: 'STALE_BROKER_ORPHAN' }));
    expect(context.operationalQuarantine).toEqual(expect.objectContaining({
      code: 'STALE_BROKER_ORPHAN',
      entryPriceSource: 'broker_answer',
      eligibleFor: ['exit']
    }));

    // Close: the ORDINARY path, by registered tradeId, no special mechanism.
    expect(router.executeTrade).toHaveBeenCalledTimes(1);
    expect(router.executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'STALE_BROKER_ORPHAN:kraken:BTC-USD:long', exitReason: 'session_close' },
      { totalConfidence: 100 },
      70000,
      {},
      [],
      null,
      null,
      'BTC-USD'
    );
    expect(router.stateManager.state.activeTrades.size).toBe(0);

    // Proof: second broker read returned [], and only then the boundary crosses.
    expect(router.krakenAdapter.getPositions).toHaveBeenCalledTimes(2);
    expect(router.windDownFlattenComplete).toBe(true);
    expect(ready).toBe(true);
    expect(router.failedSafeMode).toBe(false);

    // Two receipts: registration and close, journaled and traced max-loud.
    expect(journal.map((e) => e.eventName)).toEqual(expect.arrayContaining([
      'SESSION_STALE_BROKER_ORPHAN_REGISTERED',
      'SESSION_STALE_BROKER_ORPHAN_FLATTENED'
    ]));
    expect(orphanStages(traces)).toEqual(['detected', 'registered', 'flattened']);
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'SESSION_WIND_DOWN_BROKER_FLAT_PROVEN',
        fields: expect.objectContaining({ brokerId: 'kraken', openPositions: 0, openOrders: 0, orphansFlattened: 1 })
      })
    ]));
  });

  test('probe 1 mirror: stocks->crypto registers an Alpaca short ghost as SELL_SHORT and covers it the same way', async () => {
    const router = makeRouter();
    router.activeSession = 'stocks';
    router.activeBroker = router.alpacaAdapter;
    router.stateManager.getLastPrice = jest.fn(() => 250);
    router.alpacaAdapter.getPositions
      .mockResolvedValueOnce([{ symbol: 'TSLA', side: 'short', size: 10, entryPrice: 255 }])
      .mockResolvedValueOnce([]);

    const ready = await router._readyForBoundarySwitch(flattenNow, 'stocks', 'crypto');

    const context = router.stateManager.openPosition.mock.calls[0][2];
    expect(context).toEqual(expect.objectContaining({
      orderId: 'STALE_BROKER_ORPHAN:alpaca:TSLA:short',
      action: 'SELL_SHORT',
      direction: 'short',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      entryOrderQuantityUnit: 'shares'
    }));
    expect(router.executeTrade).toHaveBeenCalledWith(
      { action: 'COVER', confidence: 100, tradeId: 'STALE_BROKER_ORPHAN:alpaca:TSLA:short', exitReason: 'session_close' },
      { totalConfidence: 100 },
      250,
      {},
      [],
      null,
      null,
      'TSLA'
    );
    expect(router.alpacaAdapter.getPositions).toHaveBeenCalledTimes(2);
    expect(router.krakenAdapter.getPositions).not.toHaveBeenCalled();
    expect(ready).toBe(true);
  });

  test('probe 2: getPositions rejection means broker-unverifiable - boundary refused, failed-safe governs, process alive', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.activeBroker = router.krakenAdapter;
    const typedError = new Error('[Kraken] kraken_positions_unavailable: ECONNRESET');
    typedError.reason = 'kraken_positions_unavailable';
    typedError.code = 'KRAKEN_POSITION_TRUTH_UNAVAILABLE';
    router.krakenAdapter.getPositions.mockRejectedValue(typedError);
    const transitionSpy = jest.spyOn(router, '_transitionToStocks');
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    let ready;
    try {
      ready = await router._readyForBoundarySwitch(flattenNow, 'crypto', 'stocks');
    } finally {
      unsubscribe();
    }

    expect(ready).toBe(false);
    expect(transitionSpy).not.toHaveBeenCalled();
    expect(router.windDownFlattenComplete).toBe(false);
    expect(router.stateManager.openPosition).not.toHaveBeenCalled();
    expect(router.executeTrade).not.toHaveBeenCalled();
    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toBe('[Kraken] kraken_positions_unavailable: ECONNRESET');
    expect(router.activeSession).toBe('crypto');
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'SESSION_WIND_DOWN_BROKER_FLAT_UNVERIFIABLE_HALT',
        fields: expect.objectContaining({
          brokerId: 'kraken',
          stage: 'initial',
          brokerErrorReason: 'kraken_positions_unavailable',
          brokerErrorCode: 'KRAKEN_POSITION_TRUTH_UNAVAILABLE',
          route: 'session_router_wind_down_broker_unverifiable_boundary_refused'
        })
      }),
      expect.objectContaining({
        event: 'SESSION_ROUTER_FAILED_SAFE_HALT',
        fields: expect.objectContaining({ from: 'crypto', to: 'stocks', failureSource: 'wind_down_broker_flat_proof' })
      })
    ]));
  });

  test('probe 3 (floor): broker answer without an entry price is refused registration - no fabricated cost basis, loud, boundary shut, no failed-safe', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.activeBroker = router.krakenAdapter;
    // Kraken spot getPositions derives holdings from balances: symbol + quantity + side, no cost basis.
    router.krakenAdapter.getPositions.mockResolvedValue([{ symbol: 'BTC-USD', quantity: 0.25, side: 'long' }]);
    const journal = captureJournal(router);
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    let ready;
    try {
      ready = await router._readyForBoundarySwitch(flattenNow, 'crypto', 'stocks');
    } finally {
      unsubscribe();
    }

    expect(router.stateManager.openPosition).not.toHaveBeenCalled();
    expect(router.executeTrade).not.toHaveBeenCalled();
    expect(ready).toBe(false);
    expect(router.windDownFlattenComplete).toBe(false);
    expect(router.failedSafeMode).toBe(false);
    expect(orphanStages(traces)).toEqual(['detected', 'register_refused']);
    const refused = traces.find((t) => t.fields?.stage === 'register_refused');
    expect(refused.fields.reason).toContain('no entry price');
    expect(journal.map((e) => e.eventName)).toContain('SESSION_STALE_BROKER_ORPHAN_FLATTEN_FAILED');
    expect(journal.map((e) => e.eventName)).not.toContain('SESSION_STALE_BROKER_ORPHAN_REGISTERED');
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'SESSION_WIND_DOWN_BROKER_NOT_FLAT_RECONCILIATION',
        fields: expect.objectContaining({ openPositions: 1, orphansFlattened: 0 })
      })
    ]));
  });

  test('probe 4 (condition 5): ordinary close refuses the registered leg -> flatten_failed, boundary shut, failed-safe', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.activeBroker = router.krakenAdapter;
    router.executeTrade = jest.fn().mockResolvedValue({ success: false, reason: 'broker_rejected_order', orderAccepted: false });
    router.krakenAdapter.getPositions.mockResolvedValue([{ symbol: 'BTC-USD', side: 'long', size: 0.25, entryPrice: 68000 }]);
    const journal = captureJournal(router);
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    let ready;
    try {
      ready = await router._readyForBoundarySwitch(flattenNow, 'crypto', 'stocks');
    } finally {
      unsubscribe();
    }

    expect(router.stateManager.openPosition).toHaveBeenCalledTimes(1);
    expect(router.executeTrade).toHaveBeenCalledTimes(1);
    expect(ready).toBe(false);
    expect(router.windDownFlattenComplete).toBe(false);
    expect(router.failedSafeMode).toBe(true);
    // The pre-existing close contract fires first: the registered leg is still in
    // state after executeTrade, which is the same failure named at its source.
    expect(router.failedSafeReason).toMatch(/did not close source position|refused orphan close: broker_rejected_order/);
    expect(orphanStages(traces)).toEqual(['detected', 'registered', 'flatten_failed']);
    const names = journal.map((e) => e.eventName);
    expect(names).toContain('SESSION_STALE_BROKER_ORPHAN_REGISTERED');
    expect(names).toContain('SESSION_STALE_BROKER_ORPHAN_FLATTEN_FAILED');
    expect(names).not.toContain('SESSION_STALE_BROKER_ORPHAN_FLATTENED');
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'SESSION_ROUTER_FAILED_SAFE_HALT',
        fields: expect.objectContaining({ failureSource: 'wind_down_orphan_close_failed' })
      })
    ]));
  });

  test('probe 5 (re-read governs): leg still standing after a successful close keeps the boundary shut; a second sighting in the same wind-down is failed-safe, never re-registered', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.activeBroker = router.krakenAdapter;
    router.krakenAdapter.getPositions.mockResolvedValue([{ symbol: 'BTC-USD', side: 'long', size: 0.25, entryPrice: 68000 }]);
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    let firstReady;
    let secondReady;
    try {
      firstReady = await router._readyForBoundarySwitch(flattenNow, 'crypto', 'stocks');
      secondReady = await router._readyForBoundarySwitch(flattenNow, 'crypto', 'stocks');
    } finally {
      unsubscribe();
    }

    // First pass: registered, closed through the ordinary path, re-read still shows the leg.
    expect(firstReady).toBe(false);
    expect(router.stateManager.openPosition).toHaveBeenCalledTimes(1);
    expect(router.executeTrade).toHaveBeenCalledTimes(1);
    // Second pass: no second registration, no second order; ruled failure floor.
    expect(secondReady).toBe(false);
    expect(router.stateManager.openPosition).toHaveBeenCalledTimes(1);
    expect(router.executeTrade).toHaveBeenCalledTimes(1);
    expect(router.failedSafeMode).toBe(true);
    expect(router.failedSafeReason).toContain('still standing after ordinary close');
    expect(orphanStages(traces)).toEqual(['detected', 'registered', 'flattened', 'still_standing_after_close']);
  });

  test('probe 6: a broker leg that state already tracks is not a ghost - no registration, state flatten owns it', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.activeBroker = router.krakenAdapter;
    router.stateManager.state.activeTrades.set('BTC_1', {
      id: 'BTC_1', tradeId: 'BTC_1', symbol: 'BTC-USD', action: 'BUY', direction: 'long', assetClass: 'crypto'
    });
    // Tracked trade closes through the state flatten; the broker reflects it only on the re-read.
    router.krakenAdapter.getPositions
      .mockResolvedValueOnce([{ symbol: 'BTC-USD', side: 'long', size: 0.25, entryPrice: 68000 }])
      .mockResolvedValueOnce([]);
    router.executeTrade = jest.fn().mockImplementation(async (decision) => {
      // Simulate the state flatten closing BTC_1 while the first broker read is still stale.
      router.stateManager.state.activeTrades.delete(decision.tradeId);
      return { success: true };
    });
    // Make the tracked trade visible to the rung's state check by keeping it until after the first read.
    const originalRead = router._readSourceBrokerSnapshot.bind(router);
    let reads = 0;
    router._readSourceBrokerSnapshot = jest.fn(async (...args) => {
      reads += 1;
      const out = await originalRead(...args);
      if (reads === 1) {
        router.stateManager.state.activeTrades.set('BTC_1', {
          id: 'BTC_1', tradeId: 'BTC_1', symbol: 'BTC-USD', action: 'BUY', direction: 'long', assetClass: 'crypto'
        });
      }
      return out;
    });
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    try {
      await router._windDownForceFlatten(flattenNow, { from: 'crypto', to: 'stocks', minutesUntil: 5, boundaryMinute: null, phase: 'force_flatten' });
    } finally {
      unsubscribe();
    }

    expect(router.stateManager.openPosition).not.toHaveBeenCalled();
    expect(orphanStages(traces)).toEqual(['state_tracked_skip']);
    expect(router.failedSafeMode).toBe(false);
  });

  test('probe 7: boundary crossing with zero state trades still reads the broker before switching', async () => {
    const router = makeRouter();
    router.activeSession = 'crypto';
    router.activeBroker = router.krakenAdapter;

    const ready = await router._readyForBoundarySwitch(flattenNow, 'crypto', 'stocks');

    expect(ready).toBe(true);
    expect(router.krakenAdapter.getPositions).toHaveBeenCalledTimes(1);
    expect(router.stateManager.openPosition).not.toHaveBeenCalled();
    expect(router.windDownFlattenComplete).toBe(true);
  });
});
