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
    const logger = { log: jest.fn() };
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
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
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('brokerFlatVerified=false'));
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
    const enforcer = new TtpCutoffEnforcer({
      evalRuleEngine: makeRuleEngine(now),
      stateManager: { get: jest.fn(() => activeTrades) },
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
    const activeTrades = new Map([['BUY_MSFT', makeTrade({ id: 'BUY_MSFT', orderId: 'BUY_MSFT', symbol: 'MSFT' })]]);
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
