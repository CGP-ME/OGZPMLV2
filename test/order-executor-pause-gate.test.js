'use strict';

const mockStateManager = {
  get: jest.fn(),
  getAvailableCapital: jest.fn(),
  isHalted: jest.fn(() => false),
  getHaltReason: jest.fn(() => null),
  isSymbolHalted: jest.fn(() => false),
  getSymbolHaltReason: jest.fn(() => null),
  getState: jest.fn(),
  openPosition: jest.fn(),
  closePosition: jest.fn(),
  reducePosition: jest.fn(),
  getTradesBySymbol: jest.fn(),
  haltSymbol: jest.fn(),
  removeActiveTrade: jest.fn(),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

jest.mock('../core/MaxProfitManager', () => jest.fn().mockImplementation(() => ({
  start: jest.fn(),
})));

jest.mock('../ogz-meta/claudito-logger', () => ({
  TradingProofLogger: {
    trade: jest.fn(),
  },
}));

const OrderExecutor = require('../core/OrderExecutor');

function makeExecutor(config = {}, ctx = {}) {
  return new OrderExecutor({
    config: {
      brokerId: 'alpaca',
      assetClass: 'stocks',
      timeframe: '15m',
      executionMode: 'paper',
      enableBacktestMode: false,
      ...config,
    },
    backtestMode: false,
    paperTrading: true,
    backtestFast: true,
    orderRouter: { sendOrder: jest.fn() },
    maxProfitManagers: new Map(),
    notifyTrade: jest.fn(() => Promise.resolve()),
    discordNotifier: { notifyTrade: jest.fn() },
    ...ctx,
  });
}

function makeOrchResult(overrides = {}) {
  return {
    winnerStrategy: 'RSI',
    sizingMultiplier: 2,
    exitContract: {
      stopLossPercent: -0.5,
      takeProfitPercent: 1,
    },
    ...overrides,
  };
}

function makeBuyTrade(overrides = {}) {
  return {
    id: 'BUY_1',
    orderId: 'BUY_1',
    action: 'BUY',
    direction: 'long',
    size: 500,
    sizeUsd: 500,
    entryPrice: 100,
    entryTime: Date.now() - 60000,
    confidence: 75,
    symbol: 'TSLA',
    entryStrategy: 'RSI',
    exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
    ...overrides,
  };
}

function makeShortTrade(overrides = {}) {
  return {
    id: 'SHORT_1',
    orderId: 'SHORT_1',
    action: 'SELL_SHORT',
    direction: 'short',
    size: 600,
    sizeUsd: 600,
    entryPrice: 100,
    entryTime: Date.now() - 60000,
    confidence: 75,
    symbol: 'TSLA',
    entryStrategy: 'RSI',
    exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
    ...overrides,
  };
}

describe('OrderExecutor pause gate', () => {
  let errorSpy;
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return false;
      if (key === 'pauseReason') return 'manual pause';
      if (key === 'lastError') return null;
      return null;
    });
    mockStateManager.getAvailableCapital.mockReturnValue(10000);
    mockStateManager.getState.mockReturnValue({ position: 0, balance: 10000 });
    mockStateManager.openPosition.mockResolvedValue({ success: true });
    mockStateManager.closePosition.mockResolvedValue({ success: true });
    mockStateManager.reducePosition.mockResolvedValue({ success: true });
    mockStateManager.getTradesBySymbol.mockReturnValue([]);
    mockStateManager.haltSymbol.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('blocks paused non-backtest entries before sizing or routing', async () => {
    const executor = makeExecutor();

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    );

    expect(result).toBeNull();
    expect(mockStateManager.getAvailableCapital).not.toHaveBeenCalled();
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('trading paused (manual pause)'));
  });

  test('does not apply runtime pause gate to backtest entries', async () => {
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      { backtestMode: true, paperTrading: false }
    );
    mockStateManager.getAvailableCapital.mockReturnValue(0);

    await executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    );

    expect(mockStateManager.getAvailableCapital).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('trading paused'));
  });

  test('rejects backtest execution-mode spoofing outside runtime backtest mode', async () => {
    const executor = makeExecutor({ enableBacktestMode: true, executionMode: 'paper' });

    await expect(executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    )).rejects.toThrow('[ENTRY-MODE]');

    expect(mockStateManager.getAvailableCapital).not.toHaveBeenCalled();
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
  });

  test('rejects unsupported action names before sizing or routing', async () => {
    const executor = makeExecutor();

    await expect(executor.executeTrade(
      { action: 'BUY_LIMIT', confidence: 75 },
      {},
      425,
      {},
      [],
      null,
      {},
      'TSLA'
    )).rejects.toThrow('[ENTRY-ACTION]');

    expect(mockStateManager.getAvailableCapital).not.toHaveBeenCalled();
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
  });

  test('live entry plan routes final share quantity, not USD notional', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_1', price: 100 });
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        preOrderEntryGate,
      }
    );

    await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BUY',
      symbol: 'TSLA',
      sizeUsd: 500,
      orderQuantity: 5,
      quantityUnit: 'shares',
    }));
    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      side: 'buy',
      amount: 5,
      options: expect.objectContaining({
        sizeUsd: 500,
        quantityUnit: 'shares',
      }),
    }));
    expect(mockStateManager.openPosition).toHaveBeenCalledWith(
      500,
      100,
      expect.objectContaining({ symbol: 'TSLA', entryStrategy: 'RSI' })
    );
  });

  test('pre-order entry gate blocks before broker, webhook, or state side effects', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn();
    const webhookAdapter = { emit: jest.fn() };
    const preOrderEntryGate = jest.fn().mockResolvedValue({
      allowed: false,
      failedRules: [{ ruleId: 'TEST_BLOCK' }],
    });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        webhookAdapter,
        preOrderEntryGate,
      }
    );

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toBeNull();
    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      sizeUsd: 500,
      orderQuantity: 5,
    }));
    expect(sendOrder).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BLOCKED BUY TSLA before broker/webhook/state side effects'));
  });

  test('live entry throughput preserves one broker route and one state open per allowed candidate', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn()
      .mockResolvedValueOnce({ orderId: 'LIVE_1', price: 100 })
      .mockResolvedValueOnce({ orderId: 'LIVE_2', price: 100 })
      .mockResolvedValueOnce({ orderId: 'LIVE_3', price: 100 });
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        preOrderEntryGate,
      }
    );

    for (let i = 0; i < 3; i += 1) {
      await executor.executeTrade(
        { action: 'BUY', confidence: 50 },
        {},
        100,
        { rsi: 55, macd: {}, trend: 'sideways' },
        [],
        null,
        makeOrchResult(),
        'TSLA'
      );
    }

    expect(preOrderEntryGate).toHaveBeenCalledTimes(3);
    expect(sendOrder).toHaveBeenCalledTimes(3);
    expect(mockStateManager.openPosition).toHaveBeenCalledTimes(3);
    for (const call of sendOrder.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({
        symbol: 'TSLA',
        side: 'buy',
        amount: 5,
      }));
    }
  });

  test('live stock exit plan routes trade-close share quantity, not USD notional', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeBuyTrade()]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_EXIT_1', price: 125 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'test_exit' },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    );

    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      side: 'sell',
      amount: 4,
      options: expect.objectContaining({
        sizeUsd: 500,
        quantityUnit: 'shares',
      }),
    }));
    expect(mockStateManager.closePosition).toHaveBeenCalledWith(
      125,
      false,
      null,
      expect.objectContaining({ orderId: 'BUY_1' })
    );
  });

  test('live stock cover plan routes buy quantity from matched short trade', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: -600, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeShortTrade()]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_COVER_1', price: 120 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    await executor.executeTrade(
      { action: 'COVER', confidence: 100, tradeId: 'SHORT_1', exitReason: 'test_cover' },
      { totalConfidence: 100 },
      120,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    );

    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      side: 'buy',
      amount: 5,
      options: expect.objectContaining({
        sizeUsd: 600,
        quantityUnit: 'shares',
      }),
    }));
    expect(mockStateManager.closePosition).toHaveBeenCalledWith(
      120,
      false,
      null,
      expect.objectContaining({ orderId: 'SHORT_1', direction: 'short' })
    );
  });

  test('live stock quantity planning trims and accepts equity asset-class aliases', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_1', price: 100 });
    const executor = makeExecutor(
      { executionMode: 'live', assetClass: ' equity ' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        preOrderEntryGate: jest.fn().mockResolvedValue({ allowed: true }),
      }
    );

    await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5,
      options: expect.objectContaining({ quantityUnit: 'shares' }),
    }));
  });

  test('live broker quantity planning rejects unsupported asset classes before routing', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn();
    const executor = makeExecutor(
      { executionMode: 'live', assetClass: 'stonks' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    await expect(executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    )).rejects.toThrow('[ORDER-PLAN] unsupported assetClass');

    expect(sendOrder).not.toHaveBeenCalled();
  });
});
