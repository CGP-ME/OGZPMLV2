'use strict';

const mockStateManager = {
  get: jest.fn(),
  getEquity: jest.fn(),
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
const { getNarrator } = require('../core/TradeNarrator');

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
    entryOrderQuantity: 5,
    entryOrderQuantityUnit: 'shares',
    remainingOrderQuantity: 5,
    remainingOrderQuantityUnit: 'shares',
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
    entryOrderQuantity: 6,
    entryOrderQuantityUnit: 'shares',
    remainingOrderQuantity: 6,
    remainingOrderQuantityUnit: 'shares',
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
    mockStateManager.getEquity.mockReturnValue(10000);
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
      expect.objectContaining({
        symbol: 'TSLA',
        entryStrategy: 'RSI',
        entryOrderQuantity: 5,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantity: 5,
        remainingOrderQuantityUnit: 'shares',
      })
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

  test('threads trace identity through entry gate, broker request, and state open', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_TRACE_1', price: 100 });
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
      {
        action: 'BUY',
        confidence: 50,
        traceId: 'trace_test_1',
        signalId: 'signal_test_1',
        decisionId: 'decision_test_1',
      },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      traceId: 'trace_test_1',
      signalId: 'signal_test_1',
      decisionId: 'decision_test_1',
      currentEquity: 10000,
    }));
    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      traceId: 'trace_test_1',
      signalId: 'signal_test_1',
      decisionId: 'decision_test_1',
      options: expect.objectContaining({
        sizeUsd: 500,
        quantityUnit: 'shares',
      }),
    }));
    expect(mockStateManager.openPosition).toHaveBeenCalledWith(
      500,
      100,
      expect.objectContaining({
        traceId: 'trace_test_1',
        signalId: 'signal_test_1',
        decisionId: 'decision_test_1',
      })
    );
  });

  test('eval rule engine blocks entries through the same pre-order side-effect gate', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn();
    const webhookAdapter = { emit: jest.fn() };
    const evalRuleEngine = {
      check: jest.fn().mockResolvedValue({
        allowed: false,
        failedRules: [{ ruleId: 'TTP_VOLUME_5_PERCENT' }],
      }),
    };
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        webhookAdapter,
        evalRuleEngine,
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
    expect(evalRuleEngine.check).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BUY',
      symbol: 'TSLA',
      orderQuantity: 5,
      quantityUnit: 'shares',
      currentEquity: 10000,
    }));
    expect(sendOrder).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
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
      amount: 5,
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
      amount: 6,
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

  test('live stock partial exit reduces state by actual routed share fraction', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeBuyTrade()]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_EXIT_PARTIAL', price: 125 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'tier_exit', exitFraction: 0.5 },
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
      amount: 2,
      options: expect.objectContaining({
        sizeUsd: 200,
        quantityUnit: 'shares',
      }),
    }));
    expect(mockStateManager.reducePosition).toHaveBeenCalledWith(
      'BUY_1',
      0.4,
      125,
      expect.objectContaining({
        orderId: 'BUY_1',
        exitReason: 'tier_exit',
        orderQuantity: 2,
        quantityUnit: 'shares',
      })
    );
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
  });

  test('live stock exit refuses legacy active trades without stored broker quantity', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([
      makeBuyTrade({
        entryOrderQuantity: undefined,
        entryOrderQuantityUnit: undefined,
        remainingOrderQuantity: undefined,
        remainingOrderQuantityUnit: undefined,
      }),
    ]);
    const sendOrder = jest.fn();
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    await expect(executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'test_exit' },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    )).rejects.toThrow('missing remainingOrderQuantity');
    expect(sendOrder).not.toHaveBeenCalled();
  });

  test('enabled webhook exit with no matching trade blocks before local state mutation', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([]);
    const webhookAdapter = { enabled: true, emit: jest.fn() };
    const executor = makeExecutor(
      {},
      {
        webhookAdapter,
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'test_exit' },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toBeNull();
    expect(mockStateManager.haltSymbol).toHaveBeenCalledWith('TSLA', 'KILL-5: SELL with no matching BUY');
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
    expect(mockStateManager.reducePosition).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
  });

  test('enabled webhook exit refuses legacy active trades before local state mutation', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([
      makeBuyTrade({
        entryOrderQuantity: undefined,
        entryOrderQuantityUnit: undefined,
        remainingOrderQuantity: undefined,
        remainingOrderQuantityUnit: undefined,
      }),
    ]);
    const webhookAdapter = { enabled: true, emit: jest.fn() };
    const executor = makeExecutor(
      {},
      {
        webhookAdapter,
      }
    );

    await expect(executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'test_exit' },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    )).rejects.toThrow('missing remainingOrderQuantity');
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
    expect(mockStateManager.reducePosition).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
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

  test('webhook quantity guard blocks fractional shares but allows fractional base units', () => {
    const stockExecutor = makeExecutor({ assetClass: 'stocks' });
    const cryptoExecutor = makeExecutor({ assetClass: 'crypto', brokerId: 'kraken' });

    expect(stockExecutor._webhookQuantityBlockReason(0.5, 'shares')).toBe('fractional_share_quantity');
    expect(stockExecutor._webhookQuantityBlockReason(0, 'shares')).toBe('non_positive_quantity');
    expect(cryptoExecutor._webhookQuantityBlockReason(0.016588545429287938, 'base')).toBeNull();
  });

  test('webhook side-channel emits dispatch and local result trace events without blocking', async () => {
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const webhookAdapter = {
      emit: jest.fn().mockResolvedValue({
        sent: true,
        response: { status: 202, body: 'accepted' },
      }),
    };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const brokerNarratorSpy = jest.spyOn(getNarrator(), 'brokerResult').mockImplementation(() => {});
    const executor = makeExecutor(
      {
        evalTraceEnabled: true,
        traceEventMaxBufferedBytes: 1048576,
      },
      {
        dashboardWs,
        dashboardWsConnected: true,
        webhookAdapter,
      }
    );

    await executor._emitWebhookOrder('BUY', {
      action: 'buy',
      symbol: 'TSLA',
      quantity: 5,
      quantityUnit: 'shares',
      orderType: 'market',
    }, {
      traceId: 'trace_webhook_1',
      signalId: 'signal_webhook_1',
      decisionId: 'decision_webhook_1',
      symbol: 'TSLA',
    });

    expect(webhookAdapter.emit).toHaveBeenCalledWith({
      action: 'buy',
      symbol: 'TSLA',
      quantity: 5,
      quantityUnit: 'shares',
      orderType: 'market',
    });
    expect(dashboardWs.send).toHaveBeenCalledTimes(3);

    const dispatch = JSON.parse(dashboardWs.send.mock.calls[0][0]);
    const result = JSON.parse(dashboardWs.send.mock.calls[1][0]);
    const brokerAck = JSON.parse(dashboardWs.send.mock.calls[2][0]);
    expect(dispatch).toEqual(expect.objectContaining({
      type: 'trace_event',
      event: 'WEBHOOK_ORDER_DISPATCH',
      traceId: 'trace_webhook_1',
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(dispatch.fields).toEqual(expect.objectContaining({
      webhookAction: 'buy',
      quantity: 5,
      quantityUnit: 'shares',
      orderType: 'market',
      bypassThrottle: false,
    }));
    expect(result).toEqual(expect.objectContaining({
      type: 'trace_event',
      event: 'WEBHOOK_ORDER_RESULT',
      traceId: 'trace_webhook_1',
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(result.fields).toEqual(expect.objectContaining({
      success: true,
      sent: true,
      httpStatus: 202,
      responseBody: 'accepted',
    }));
    expect(brokerAck).toEqual(expect.objectContaining({
      type: 'broker_ack',
      ok: true,
      sent: true,
      route: 'webhook',
      traceId: 'trace_webhook_1',
      signalId: 'signal_webhook_1',
      decisionId: 'decision_webhook_1',
      symbol: 'TSLA',
      action: 'BUY',
      webhookAction: 'buy',
      quantity: 5,
      quantityUnit: 'shares',
      orderType: 'market',
      bypassThrottle: false,
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      httpStatus: 202,
      reason: null,
      responseBody: 'accepted',
    }));
    expect(brokerNarratorSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'broker_ack',
      symbol: 'TSLA',
      action: 'BUY',
      ok: true,
    }));

    brokerNarratorSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('webhook side-channel converts rejected adapter promises into failed result traces', async () => {
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const webhookAdapter = {
      emit: jest.fn().mockRejectedValue(new Error('network down')),
    };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const executor = makeExecutor(
      {
        evalTraceEnabled: true,
        traceEventMaxBufferedBytes: 1048576,
      },
      {
        dashboardWs,
        dashboardWsConnected: true,
        webhookAdapter,
      }
    );

    await expect(executor._emitWebhookOrder('SELL', {
      action: 'sell',
      symbol: 'TSLA',
      quantity: 3,
      quantityUnit: 'shares',
      orderType: 'market',
      bypassThrottle: true,
    }, {
      traceId: 'trace_webhook_2',
      signalId: 'signal_webhook_2',
      decisionId: 'decision_webhook_2',
      symbol: 'TSLA',
    })).resolves.toBeUndefined();

    expect(dashboardWs.send).toHaveBeenCalledTimes(3);
    const result = JSON.parse(dashboardWs.send.mock.calls[1][0]);
    const brokerReject = JSON.parse(dashboardWs.send.mock.calls[2][0]);
    expect(result).toEqual(expect.objectContaining({
      type: 'trace_event',
      event: 'WEBHOOK_ORDER_RESULT',
      traceId: 'trace_webhook_2',
      symbol: 'TSLA',
      action: 'SELL',
    }));
    expect(result.fields).toEqual(expect.objectContaining({
      success: false,
      sent: false,
      reason: 'network down',
      rejected: true,
      bypassThrottle: true,
    }));
    expect(brokerReject).toEqual(expect.objectContaining({
      type: 'broker_reject',
      ok: false,
      sent: false,
      route: 'webhook',
      traceId: 'trace_webhook_2',
      signalId: 'signal_webhook_2',
      decisionId: 'decision_webhook_2',
      symbol: 'TSLA',
      action: 'SELL',
      webhookAction: 'sell',
      quantity: 3,
      quantityUnit: 'shares',
      orderType: 'market',
      bypassThrottle: true,
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      httpStatus: null,
      reason: 'network down',
    }));
    expect(warnSpy).toHaveBeenCalledWith('[WebhookOrder] SELL emit failed: network down');

    logSpy.mockRestore();
  });

  test('webhook side-channel broadcasts broker_reject when adapter throws synchronously', async () => {
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const webhookAdapter = {
      emit: jest.fn(() => {
        throw new Error('adapter exploded');
      }),
    };
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const executor = makeExecutor(
      {
        evalTraceEnabled: true,
        traceEventMaxBufferedBytes: 1048576,
      },
      {
        dashboardWs,
        dashboardWsConnected: true,
        webhookAdapter,
      }
    );

    await expect(executor._emitWebhookOrder('COVER', {
      action: 'buy',
      symbol: 'TSLA',
      quantity: 2,
      quantityUnit: 'shares',
      orderType: 'market',
      bypassThrottle: true,
    }, {
      traceId: 'trace_webhook_3',
      signalId: 'signal_webhook_3',
      decisionId: 'decision_webhook_3',
      symbol: 'TSLA',
    })).resolves.toBeUndefined();

    expect(dashboardWs.send).toHaveBeenCalledTimes(3);
    const brokerReject = JSON.parse(dashboardWs.send.mock.calls[2][0]);
    expect(brokerReject).toEqual(expect.objectContaining({
      type: 'broker_reject',
      ok: false,
      sent: false,
      route: 'webhook',
      traceId: 'trace_webhook_3',
      signalId: 'signal_webhook_3',
      decisionId: 'decision_webhook_3',
      symbol: 'TSLA',
      action: 'COVER',
      webhookAction: 'buy',
      quantity: 2,
      orderType: 'market',
      bypassThrottle: true,
      reason: 'adapter exploded',
    }));
    expect(warnSpy).toHaveBeenCalledWith('[WebhookOrder] COVER emit failed: adapter exploded');

    logSpy.mockRestore();
  });
});
