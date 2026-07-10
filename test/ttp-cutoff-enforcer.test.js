'use strict';

const TtpCutoffEnforcer = require('../core/TtpCutoffEnforcer');
const EvalRuleEngine = require('../core/EvalRuleEngine');

function makeRuleEngine(now) {
  return new EvalRuleEngine({
    config: {
      enabled: true,
      ttp: {
        enabled: true,
        volumeCap: { enabled: false },
        marketTime: {
          enabled: true,
          blockEntriesAfterCutoff: true,
          liquidationEnabled: true,
          cutoffMinutesBeforeClose: 10,
        },
      },
    },
    now,
  });
}

function makeTrade(overrides = {}) {
  return {
    id: 'BUY_1',
    orderId: 'BUY_1',
    action: 'BUY',
    direction: 'long',
    symbol: 'TSLA',
    assetClass: 'stocks',
    remainingOrderQuantity: 5,
    remainingOrderQuantityUnit: 'shares',
    ...overrides,
  };
}

describe('TtpCutoffEnforcer', () => {
  test('does nothing before the liquidation window', async () => {
    const now = () => new Date('2026-05-22T19:49:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade()]]);
    const executeTrade = jest.fn();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 125),
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(false);
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('cancels pending orders and force-closes stock trades at cutoff', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade()]]);
    const executeTrade = jest.fn(async () => {
      activeTrades.delete('BUY_1');
    });
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 2, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([{ symbol: 'TSLA', size: 5, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 125),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(orderRouter.cancelAllOpenOrders).toHaveBeenCalledTimes(1);
    expect(executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'ttp_1550_liquidation' },
      { totalConfidence: 100 },
      125,
      {},
      [],
      null,
      null,
      'TSLA'
    );
    expect(result.closed).toEqual([
      { tradeId: 'BUY_1', symbol: 'TSLA', action: 'SELL', price: 125 },
    ]);
    expect(result.orphanClosed).toEqual([]);
  });

  test('clears stale cutoff quarantine when broker flatness is verified', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map();
    const staleQuarantine = {
      source: 'ttp_cutoff_unverified_broker_flatness',
      status: 'quarantined',
      entryBlocking: false,
      manualReconciliationRequired: true,
      brokerFlatVerified: false,
    };
    const stateManager = {
      get: jest.fn((key) => {
        if (key === 'activeTrades') return activeTrades;
        if (key === 'ttpCutoffQuarantine') return staleQuarantine;
        return undefined;
      }),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 0, failed: 0, results: [] })),
      getAllPositions: jest.fn(async () => []),
    };
    const logger = { log: jest.fn() };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(() => 125),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger,
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.brokerFlatVerified).toBe(true);
    expect(stateManager.updateState).toHaveBeenCalledWith(
      { ttpCutoffQuarantine: null },
      expect.objectContaining({
        action: 'TTP_CUTOFF_QUARANTINE_CLEAR',
        source: 'ttp_cutoff_unverified_broker_flatness',
        brokerFlatVerified: true,
      })
    );
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('cleared cutoff reconciliation quarantine'));
  });

  test('fails loud instead of guessing a cutoff exit side for ambiguous active trades', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['AMBIGUOUS_1', makeTrade({
      id: 'AMBIGUOUS_1',
      orderId: 'AMBIGUOUS_1',
      action: undefined,
      direction: undefined,
    })]]);
    const executeTrade = jest.fn();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 125),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    await expect(enforcer.enforce()).rejects.toThrow(/active_trade_direction_unknown_for_cutoff/);
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('webhook-routed cutoff closes tracked state without treating unrelated broker positions as truth', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({ remainingOrderQuantity: 1 })]]);
    const executeTrade = jest.fn(async () => {
      activeTrades.delete('BUY_1');
    });
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn(() => activeTrades),
      pauseTrading: jest.fn(async () => ({ success: true })),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const logger = { log: jest.fn() };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger,
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.brokerFlatVerified).toBe(false);
    expect(result.cancelResult).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'broker_reconciliation_disabled',
    }));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.getAllPositions).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'ttp_1550_liquidation' },
      { totalConfidence: 100 },
      126,
      {},
      [],
      null,
      null,
      'TSLA'
    );
    expect(result.closed).toEqual([
      { tradeId: 'BUY_1', symbol: 'TSLA', action: 'SELL', price: 126 },
    ]);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.quarantine).toEqual(expect.objectContaining({
      source: 'ttp_cutoff_unverified_broker_flatness',
      status: 'quarantined',
      entryBlocking: true,
      manualReconciliationRequired: true,
      brokerFlatVerified: false,
      currentDateET: '2026-05-22',
      marketTimeBlocksNewEntries: true,
      inLiquidationWindow: true,
    }));
    expect(enforcer.completedKeys.size).toBe(0);
    expect(enforcer.unverifiedKeys.has('2026-05-22:950')).toBe(true);
    expect(stateManager.pauseTrading).not.toHaveBeenCalled();
    expect(stateManager.updateState).toHaveBeenCalledWith(
      { ttpCutoffQuarantine: expect.objectContaining({
        source: 'ttp_cutoff_unverified_broker_flatness',
        entryBlocking: true,
      }) },
      expect.objectContaining({
        action: 'TTP_CUTOFF_QUARANTINE',
        entryBlocking: true,
      })
    );
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('BROKER FLATNESS QUARANTINED'));
  });

  test('webhook-routed cutoff verifies broker flatness through read-only position reconciliation', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => []),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger,
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.brokerFlatVerified).toBe(true);
    expect(result.requiresManualReconciliation).toBeUndefined();
    expect(result.cancelResult).toEqual(expect.objectContaining({
      skipped: true,
      reason: 'broker_order_management_disabled',
    }));
    expect(orderRouter.getAllPositions).toHaveBeenCalledWith(expect.objectContaining({
      symbols: expect.arrayContaining(['TSLA']),
      strict: true,
    }));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(stateManager.updateState).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('BROKER FLATNESS QUARANTINED'));
    expect(enforcer.completedKeys.has('2026-05-22:950')).toBe(true);
    expect(enforcer.unverifiedKeys.size).toBe(0);
  });

  test('webhook-routed cutoff returns manual reconciliation when read-only broker check disagrees with active state', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({ remainingOrderQuantity: 1 })]]);
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => []),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger,
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.brokerFlatVerified).toBe(false);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.failures).toEqual([
      { tradeId: 'BUY_1', symbol: 'TSLA', reason: 'state_trade_open_without_broker_position' },
    ]);
    expect(result.quarantine).toEqual(expect.objectContaining({
      source: 'ttp_cutoff_unverified_broker_flatness',
      status: 'quarantined',
      brokerFlatVerified: false,
      manualReconciliationRequired: true,
      failures: result.failures,
    }));
    expect(orderRouter.getAllPositions).toHaveBeenCalled();
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(enforcer.completedKeys.size).toBe(0);
    expect(enforcer.unverifiedKeys.has('2026-05-22:950')).toBe(true);
  });

  test('webhook-routed cutoff returns manual reconciliation when broker quantity disagrees with active state', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({ remainingOrderQuantity: 5 })]]);
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => [{ symbol: 'TSLA', size: 3, side: 'long', currentPrice: 126 }]),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const logger = { log: jest.fn(), warn: jest.fn() };
    const executeTrade = jest.fn();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger,
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.brokerFlatVerified).toBe(false);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tradeId: 'BUY_1',
        symbol: 'TSLA',
        reason: 'broker_position_quantity_mismatch',
        brokerPositionSize: 3,
        expectedRemainingQuantity: 5,
      }),
    ]));
    expect(result.quarantine).toEqual(expect.objectContaining({
      source: 'ttp_cutoff_unverified_broker_flatness',
      failures: result.failures,
    }));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(executeTrade).not.toHaveBeenCalled();
    expect(enforcer.completedKeys.size).toBe(0);
    expect(enforcer.unverifiedKeys.has('2026-05-22:950')).toBe(true);
  });

  test('webhook-routed cutoff does not treat near-equal broker quantity as verified flatness', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({
      remainingOrderQuantity: 100,
      remainingOrderQuantityUnit: 'shares',
    })]]);
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => [{ symbol: 'TSLA', size: 100.00000001, side: 'long', currentPrice: 126 }]),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const executeTrade = jest.fn();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.brokerFlatVerified).toBe(false);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'broker_position_quantity_mismatch',
        brokerPositionSize: 100.00000001,
        expectedRemainingQuantity: 100,
      }),
    ]));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('webhook-routed cutoff does not treat equal quantity on the wrong broker side as verified flatness', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['SHORT_1', makeTrade({
      id: 'SHORT_1',
      orderId: 'SHORT_1',
      action: 'SELL_SHORT',
      direction: 'short',
      remainingOrderQuantity: 10,
      remainingOrderQuantityUnit: 'shares',
    })]]);
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => [{ symbol: 'TSLA', size: 10, side: 'long', currentPrice: 126 }]),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const executeTrade = jest.fn();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.brokerFlatVerified).toBe(false);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'broker_position_quantity_mismatch',
        brokerPositionSize: 10,
        expectedRemainingQuantity: 10,
        brokerPositionSide: 'long',
        expectedPositionSide: 'short',
      }),
    ]));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('webhook-routed cutoff does not ignore zero-remaining active trades with broker positions', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({
      remainingOrderQuantity: 0,
      remainingOrderQuantityUnit: 'shares',
    })]]);
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => [{ symbol: 'TSLA', size: 5, side: 'long', currentPrice: 126 }]),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const executeTrade = jest.fn();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.brokerFlatVerified).toBe(false);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'broker_position_quantity_mismatch',
        brokerPositionSize: 5,
        expectedRemainingQuantity: 0,
      }),
    ]));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('webhook-routed cutoff does not verify broker flatness when active trade quantity is unknown', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({
      remainingOrderQuantity: undefined,
      entryOrderQuantity: undefined,
      orderQuantity: undefined,
      quantity: undefined,
    })]]);
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => [{ symbol: 'TSLA', size: 5, side: 'long', currentPrice: 126 }]),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const executeTrade = jest.fn();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.brokerFlatVerified).toBe(false);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'broker_position_quantity_mismatch',
        brokerPositionSize: 5,
        expectedRemainingQuantity: null,
        expectedQuantityKnown: false,
      }),
    ]));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('webhook-routed cutoff does not verify out-of-scope active trade quantities as flat', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_XYZ', makeTrade({
      id: 'BUY_XYZ',
      orderId: 'BUY_XYZ',
      symbol: 'XYZ',
      remainingOrderQuantity: 10,
    })]]);
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(async () => [{ symbol: 'XYZ', size: 3, side: 'long', currentPrice: 100 }]),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn((key) => (key === 'activeTrades' ? activeTrades : null)),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const executeTrade = jest.fn();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 100),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      brokerPositionReadEnabled: true,
      brokerOrderManagementEnabled: false,
      now,
      logger: { log: jest.fn(), warn: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.brokerFlatVerified).toBe(false);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tradeId: 'BUY_XYZ',
        symbol: 'XYZ',
        reason: 'symbol_not_in_ttp_cutoff_scope',
      }),
    ]));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('webhook-routed cutoff still closes tracked state after the liquidation window is missed', async () => {
    const now = () => new Date('2026-05-22T20:05:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({ remainingOrderQuantity: 1 })]]);
    const executeTrade = jest.fn(async () => {
      activeTrades.delete('BUY_1');
    });
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(),
      sendOrder: jest.fn(),
    };
    const stateManager = {
      get: jest.fn(() => activeTrades),
      pauseTrading: jest.fn(async () => ({ success: true })),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.state.inLiquidationWindow).toBe(false);
    expect(result.state.blocksNewEntries).toBe(true);
    expect(executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'ttp_1550_liquidation' },
      { totalConfidence: 100 },
      126,
      {},
      [],
      null,
      null,
      'TSLA'
    );
    expect(result.closed).toEqual([
      { tradeId: 'BUY_1', symbol: 'TSLA', action: 'SELL', price: 126 },
    ]);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.quarantine).toEqual(expect.objectContaining({
      status: 'quarantined',
      entryBlocking: true,
      manualReconciliationRequired: true,
      marketTimeBlocksNewEntries: true,
      inLiquidationWindow: false,
    }));
    expect(enforcer.completedKeys.size).toBe(0);
    expect(enforcer.unverifiedKeys.has('2026-05-22:950')).toBe(true);
    expect(stateManager.pauseTrading).not.toHaveBeenCalled();
    expect(stateManager.updateState).toHaveBeenCalledWith(
      { ttpCutoffQuarantine: expect.objectContaining({ source: 'ttp_cutoff_unverified_broker_flatness' }) },
      expect.objectContaining({ action: 'TTP_CUTOFF_QUARANTINE' })
    );
  });

  test('premarket recovery closes previous-day tracked stock trades without blocking same-day premarket entries', async () => {
    const now = () => new Date('2026-05-22T13:29:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({
      remainingOrderQuantity: 1,
      entryTime: new Date('2026-05-21T19:45:00.000Z').getTime(),
    })]]);
    const executeTrade = jest.fn(async () => {
      activeTrades.delete('BUY_1');
    });
    const stateManager = {
      get: jest.fn(() => activeTrades),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter: {},
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.state.phase).toBe('pre');
    expect(result.state.blocksNewEntries).toBe(false);
    expect(executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'ttp_1550_liquidation' },
      { totalConfidence: 100 },
      126,
      {},
      [],
      null,
      null,
      'TSLA'
    );
  });

  test('premarket recovery leaves same-day tracked stock trades alone', async () => {
    const now = () => new Date('2026-05-22T13:29:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({
      remainingOrderQuantity: 1,
      entryTime: new Date('2026-05-22T12:00:00.000Z').getTime(),
    })]]);
    const executeTrade = jest.fn();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter: {},
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(false);
    expect(result.state.phase).toBe('pre');
    expect(result.state.blocksNewEntries).toBe(false);
    expect(executeTrade).not.toHaveBeenCalled();
  });

  test('premarket recovery closes only previous-day tracked trades when same-day trades also exist', async () => {
    const now = () => new Date('2026-05-22T13:29:00.000Z').getTime();
    const activeTrades = new Map([
      ['STALE_1', makeTrade({
        id: 'STALE_1',
        orderId: 'STALE_1',
        entryTime: new Date('2026-05-21T19:45:00.000Z').getTime(),
      })],
      ['TODAY_1', makeTrade({
        id: 'TODAY_1',
        orderId: 'TODAY_1',
        entryTime: new Date('2026-05-22T12:00:00.000Z').getTime(),
      })],
    ]);
    const executeTrade = jest.fn(async (decision) => {
      activeTrades.delete(decision.tradeId);
    });
    const stateManager = {
      get: jest.fn(() => activeTrades),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter: {},
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade).toHaveBeenCalledWith(
      { action: 'SELL', confidence: 100, tradeId: 'STALE_1', exitReason: 'ttp_1550_liquidation' },
      { totalConfidence: 100 },
      126,
      {},
      [],
      null,
      null,
      'TSLA'
    );
    expect(activeTrades.has('TODAY_1')).toBe(true);
  });

  test('webhook-routed cutoff quarantines unverified broker flatness without entry pause API', async () => {
    const now = () => new Date('2026-05-22T20:05:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({ remainingOrderQuantity: 1 })]]);
    const executeTrade = jest.fn(async () => {
      activeTrades.delete('BUY_1');
    });
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: {
        get: jest.fn(() => activeTrades),
        updateState: jest.fn(async () => ({ success: true })),
      },
      orderRouter: {
        cancelAllOpenOrders: jest.fn(),
        getAllPositions: jest.fn(),
        sendOrder: jest.fn(),
      },
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(result.quarantine).toEqual(expect.objectContaining({
      status: 'quarantined',
      entryBlocking: true,
    }));
    expect(enforcer.completedKeys.size).toBe(0);
  });

  test('webhook-routed cutoff fails loud when tracked state remains open after close attempt', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({ remainingOrderQuantity: 1 })]]);
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter: {
        cancelAllOpenOrders: jest.fn(),
        getAllPositions: jest.fn(),
        sendOrder: jest.fn(),
      },
      executeTrade: jest.fn(async () => ({ success: false, reason: 'webhook_http_403' })),
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    await expect(enforcer.enforce()).rejects.toThrow(/state_trade_still_open_after_liquidation/);
    expect(enforcer.completedKeys.size).toBe(0);
  });

  test('webhook-routed cutoff handles serialized activeTrades array shape instead of treating it as flat', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = [['BUY_1', makeTrade({ remainingOrderQuantity: 1 })]];
    const executeTrade = jest.fn(async () => {
      activeTrades.length = 0;
    });
    const stateManager = {
      get: jest.fn(() => activeTrades),
      pauseTrading: jest.fn(async () => ({ success: true })),
      updateState: jest.fn(async () => ({ success: true })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter: {
        cancelAllOpenOrders: jest.fn(),
        getAllPositions: jest.fn(),
        sendOrder: jest.fn(),
      },
      executeTrade,
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(executeTrade).toHaveBeenCalled();
    expect(result.closed).toEqual([
      { tradeId: 'BUY_1', symbol: 'TSLA', action: 'SELL', price: 126 },
    ]);
    expect(result.requiresManualReconciliation).toBe(true);
    expect(enforcer.completedKeys.size).toBe(0);
    expect(enforcer.unverifiedKeys.has('2026-05-22:950')).toBe(true);
    expect(stateManager.pauseTrading).not.toHaveBeenCalled();
    expect(stateManager.updateState).toHaveBeenCalledWith(
      { ttpCutoffQuarantine: expect.objectContaining({ status: 'quarantined', entryBlocking: true }) },
      expect.objectContaining({ action: 'TTP_CUTOFF_QUARANTINE' })
    );
  });

  test('does not relabel unverified webhook cutoff as complete on repeated empty checks', async () => {
    const now = () => new Date('2026-05-22T20:05:00.000Z').getTime();
    const activeTrades = new Map();
    const stateManager = {
      get: jest.fn(() => activeTrades),
      pauseTrading: jest.fn(async () => ({ success: true })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager,
      orderRouter: {
        cancelAllOpenOrders: jest.fn(),
        getAllPositions: jest.fn(),
        sendOrder: jest.fn(),
      },
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });
    enforcer.unverifiedKeys.add('2026-05-22:950');

    const result = await enforcer.enforce();

    expect(result).toEqual(expect.objectContaining({
      enforced: false,
      alreadyUnverified: true,
      requiresManualReconciliation: true,
      brokerFlatVerified: false,
    }));
    expect(enforcer.completedKeys.size).toBe(0);
    expect(enforcer.unverifiedKeys.has('2026-05-22:950')).toBe(true);
    expect(stateManager.pauseTrading).not.toHaveBeenCalled();
  });

  test('fails loud on unsupported activeTrades container instead of marking cutoff complete', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => ({ BUY_1: makeTrade() })) },
      orderRouter: {
        cancelAllOpenOrders: jest.fn(),
        getAllPositions: jest.fn(),
      },
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(() => 126),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerReconciliationEnabled: false,
      now,
      logger: { log: jest.fn() },
    });

    await expect(enforcer.enforce()).rejects.toThrow(/activeTrades container invariant failed/);
    expect(enforcer.completedKeys.size).toBe(0);
  });

  test('fails loud and leaves cutoff uncompleted when a liquidation trade has no price', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade()]]);
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter: {
        cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 0, failed: 0, results: [] })),
        getAllPositions: jest.fn()
          .mockResolvedValueOnce([{ symbol: 'TSLA', size: 5, side: 'long', currentPrice: 125 }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(() => null),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger: { log: jest.fn() },
    });

    await expect(enforcer.enforce()).rejects.toThrow(/missing_exit_price/);
    expect(enforcer.completedKeys.size).toBe(0);
  });

  test('uses runtime asset class for legacy active trades missing assetClass', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_1', makeTrade({ assetClass: undefined })]]);
    const executeTrade = jest.fn(async () => {
      activeTrades.delete('BUY_1');
    });
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 0, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([{ symbol: 'TSLA', size: 5, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 125),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger: { log: jest.fn() },
    });

    await enforcer.enforce();

    expect(executeTrade).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SELL', tradeId: 'BUY_1' }),
      expect.any(Object),
      125,
      expect.any(Object),
      expect.any(Array),
      null,
      null,
      'TSLA'
    );
  });

  test('fails loud when pending order cancellation skips a target broker', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter: {
        cancelAllOpenOrders: jest.fn(async () => ({
          success: false,
          cancelled: 0,
          failed: 1,
          results: [{ broker: 'alpaca', success: false, reason: 'adapter_missing_order_cancel_api' }],
        })),
        getAllPositions: jest.fn(),
      },
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger: { log: jest.fn() },
    });

    await expect(enforcer.enforce()).rejects.toThrow(/pending-order cancellation failed/);
    expect(enforcer.completedKeys.size).toBe(0);
  });

  test('directly closes broker positions that have no active state trade', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 0, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'TSLA', size: 3, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'TSLA', size: 3, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([]),
      sendOrder: jest.fn(async () => ({ orderId: 'CLOSE_1' })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(orderRouter.sendOrder).toHaveBeenCalledWith({
      symbol: 'TSLA',
      side: 'sell',
      amount: 3,
      type: 'market',
      options: {
        quantityUnit: 'shares',
        exitReason: 'ttp_1550_broker_reconciliation',
      },
    });
    expect(result.orphanClosed).toEqual([
      { broker: 'alpaca', symbol: 'TSLA', side: 'sell', amount: 3, orderId: 'CLOSE_1' },
    ]);
  });

  test('directly closes broker positions after the liquidation window is missed', async () => {
    const now = () => new Date('2026-05-22T20:05:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 0, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'TSLA', size: 3, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'TSLA', size: 3, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([]),
      sendOrder: jest.fn(async () => ({ orderId: 'CLOSE_1' })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerNames: ['alpaca'],
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.state.inLiquidationWindow).toBe(false);
    expect(orderRouter.cancelAllOpenOrders).toHaveBeenCalledWith({ brokerNames: ['alpaca'] });
    expect(orderRouter.sendOrder).toHaveBeenCalledWith({
      symbol: 'TSLA',
      side: 'sell',
      amount: 3,
      type: 'market',
      options: {
        quantityUnit: 'shares',
        exitReason: 'ttp_1550_broker_reconciliation',
      },
    });
    expect(result.orphanClosed).toEqual([
      { broker: 'alpaca', symbol: 'TSLA', side: 'sell', amount: 3, orderId: 'CLOSE_1' },
    ]);
  });

  test('rechecks broker positions after a completed cutoff key when exposure appears late', async () => {
    const now = () => new Date('2026-05-22T20:05:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 0, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'TSLA', size: 2, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'TSLA', size: 2, side: 'long', currentPrice: 125 }])
        .mockResolvedValueOnce([]),
      sendOrder: jest.fn(async () => ({ orderId: 'CLOSE_LATE' })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerNames: ['alpaca'],
      now,
      logger: { log: jest.fn() },
    });
    enforcer.completedKeys.add('2026-05-22:950');

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.alreadyCompleted).toBe(true);
    expect(orderRouter.sendOrder).toHaveBeenCalledWith({
      symbol: 'TSLA',
      side: 'sell',
      amount: 2,
      type: 'market',
      options: {
        quantityUnit: 'shares',
        exitReason: 'ttp_1550_broker_reconciliation',
      },
    });
    expect(result.orphanClosed).toEqual([
      { broker: 'alpaca', symbol: 'TSLA', side: 'sell', amount: 2, orderId: 'CLOSE_LATE' },
    ]);
  });

  test('broker-scoped cutoff closes dynamic stock symbols not present at construction', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 2, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'MSFT', size: 2, side: 'long', currentPrice: 310 }])
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'MSFT', size: 2, side: 'long', currentPrice: 310 }])
        .mockResolvedValueOnce([]),
      sendOrder: jest.fn(async () => ({ orderId: 'CLOSE_MSFT' })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      brokerNames: ['alpaca'],
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(orderRouter.cancelAllOpenOrders).toHaveBeenCalledWith({ brokerNames: ['alpaca'] });
    expect(orderRouter.getAllPositions).toHaveBeenCalledWith({ brokerNames: ['alpaca'], strict: true });
    expect(orderRouter.sendOrder).toHaveBeenCalledWith({
      symbol: 'MSFT',
      side: 'sell',
      amount: 2,
      type: 'market',
      options: {
        quantityUnit: 'shares',
        exitReason: 'ttp_1550_broker_reconciliation',
      },
    });
    expect(result.orphanClosed).toEqual([
      { broker: 'alpaca', symbol: 'MSFT', side: 'sell', amount: 2, orderId: 'CLOSE_MSFT' },
    ]);
  });

  test('rechecks after a completed cutoff key so late pending orders cannot survive', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 1, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger: { log: jest.fn() },
    });
    enforcer.completedKeys.add('2026-05-22:950');

    const result = await enforcer.enforce();

    expect(result.enforced).toBe(true);
    expect(result.alreadyCompleted).toBe(true);
    expect(orderRouter.cancelAllOpenOrders).toHaveBeenCalledWith({
      symbols: expect.arrayContaining(['TSLA']),
    });
  });

  test('does not mark complete while target broker positions remain open', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 0, failed: 0, results: [] })),
      getAllPositions: jest.fn(async () => ([{ broker: 'alpaca', symbol: 'TSLA', size: 3, side: 'long', currentPrice: 125 }])),
      sendOrder: jest.fn(async () => ({ orderId: 'CLOSE_1' })),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      now,
      logger: { log: jest.fn() },
    });

    await expect(enforcer.enforce()).rejects.toThrow(/broker_positions_still_open_after_cutoff/);
    expect(enforcer.completedKeys.size).toBe(0);
  });

  test('does not cancel or liquidate when runtime asset class is crypto', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(),
      getAllPositions: jest.fn(),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map([['BUY_1', makeTrade({ assetClass: 'crypto', symbol: 'BTC-USD' })]])) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'crypto',
      symbols: [],
      now,
      logger: { log: jest.fn() },
    });

    const result = await enforcer.enforce();

    expect(result).toEqual(expect.objectContaining({ enforced: false, reason: 'non_ttp_asset_class' }));
    expect(orderRouter.cancelAllOpenOrders).not.toHaveBeenCalled();
  });

  test('expands stock slash symbols so Alpaca broker symbols stay in cutoff scope', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 1, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => new Map()) },
      orderRouter,
      executeTrade: jest.fn(),
      getExitPrice: jest.fn(),
      assetClass: 'stocks',
      symbols: ['AAPL/USD'],
      now,
      logger: { log: jest.fn() },
    });

    await enforcer.enforce();

    expect(orderRouter.cancelAllOpenOrders).toHaveBeenCalledWith({
      symbols: expect.arrayContaining(['AAPL', 'AAPL-USD']),
    });
  });

  test('refreshes symbol scope from the supplied getter before each cutoff run', async () => {
    const now = () => new Date('2026-05-22T19:50:00.000Z').getTime();
    const activeTrades = new Map([['BUY_MSFT', makeTrade({
      id: 'BUY_MSFT',
      orderId: 'BUY_MSFT',
      symbol: 'MSFT',
      remainingOrderQuantity: 1,
    })]]);
    const executeTrade = jest.fn(async () => {
      activeTrades.delete('BUY_MSFT');
    });
    const orderRouter = {
      cancelAllOpenOrders: jest.fn(async () => ({ success: true, cancelled: 1, failed: 0, results: [] })),
      getAllPositions: jest.fn()
        .mockResolvedValueOnce([{ broker: 'alpaca', symbol: 'MSFT', size: 1, side: 'long', currentPrice: 310 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
      orderRouter,
      executeTrade,
      getExitPrice: jest.fn(() => 310),
      assetClass: 'stocks',
      symbols: ['TSLA'],
      getSymbols: () => ['MSFT'],
      now,
      logger: { log: jest.fn() },
    });

    await enforcer.enforce();

    expect(orderRouter.cancelAllOpenOrders).toHaveBeenCalledWith({
      symbols: expect.arrayContaining(['TSLA', 'MSFT']),
    });
    expect(executeTrade).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SELL', tradeId: 'BUY_MSFT' }),
      expect.any(Object),
      310,
      expect.any(Object),
      expect.any(Array),
      null,
      null,
      'MSFT'
    );
  });
});
