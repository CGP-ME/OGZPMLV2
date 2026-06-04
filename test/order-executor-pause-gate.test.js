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

jest.mock('../core/MaxProfitManager', () => {
  const MockMaxProfitManager = jest.fn().mockImplementation(() => ({
    start: jest.fn(),
  }));
  MockMaxProfitManager.resolveContractStopPercent = jest.fn((exitContract) => {
    const rawStopLossPercent = Number(exitContract?.stopLossPercent);
    if (!Number.isFinite(rawStopLossPercent) || rawStopLossPercent === 0) {
      throw new Error(`MaxProfitManager.start: exitContract.stopLossPercent missing/invalid (got ${exitContract?.stopLossPercent})`);
    }
    if (rawStopLossPercent > 0) {
      throw new Error(`MaxProfitManager.start: exitContract.stopLossPercent must be negative risk distance (got ${exitContract.stopLossPercent})`);
    }
    return -rawStopLossPercent / 100;
  });
  return MockMaxProfitManager;
});

jest.mock('../ogz-meta/claudito-logger', () => ({
  TradingProofLogger: {
    trade: jest.fn(),
    explanation: jest.fn(),
  },
}));

const OrderExecutor = require('../core/OrderExecutor');
const MaxProfitManager = require('../core/MaxProfitManager');
const { getNarrator } = require('../core/TradeNarrator');
const { TradingProofLogger } = require('../ogz-meta/claudito-logger');

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
    performanceAnalyzer: { processTrade: jest.fn() },
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
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'live',
    timeframe: '1m',
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
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'live',
    timeframe: '1m',
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

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'trading_paused',
      detail: 'manual pause',
      symbol: 'TSLA',
      action: 'BUY',
    }));
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
    const orchResult = makeOrchResult();
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
      orchResult,
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
    expect(MaxProfitManager).toHaveBeenCalledTimes(1);
    expect(MaxProfitManager.mock.results[0].value.start).toHaveBeenCalledWith(
      100,
      'buy',
      500,
      expect.objectContaining({
        exitContract: orchResult.exitContract,
      })
    );
  });

  test('stock quantity planning preserves Alpaca fractional shares but floors non-fractional stock brokers', () => {
    const executor = makeExecutor();

    expect(executor._orderQuantityFromSizeUsd(125, 100, {
      brokerId: 'alpaca',
      assetClass: 'stocks',
    })).toBe(1.25);
    expect(executor._orderQuantityFromSizeUsd(125, 100, {
      brokerId: 'interactivebrokers',
      assetClass: 'stocks',
    })).toBe(1);
  });

  test('generic broker adapter cannot anonymously grant stock fractional support', () => {
    const unnamedAdapterExecutor = makeExecutor(
      { brokerId: 'interactivebrokers', assetClass: 'stocks' },
      {
        brokerAdapter: {
          supportsFractionalShares: () => true,
        },
      }
    );
    const mismatchedAdapterExecutor = makeExecutor(
      { brokerId: 'interactivebrokers', assetClass: 'stocks' },
      {
        brokerAdapter: {
          getBrokerName: () => 'alpaca',
          supportsFractionalShares: () => true,
        },
      }
    );
    const matchedAdapterExecutor = makeExecutor(
      { brokerId: 'schwab', assetClass: 'stocks' },
      {
        brokerAdapter: {
          getBrokerName: () => 'Schwab',
          supportsFractionalShares: () => true,
        },
      }
    );

    expect(unnamedAdapterExecutor._orderQuantityFromSizeUsd(125, 100)).toBe(1);
    expect(mismatchedAdapterExecutor._orderQuantityFromSizeUsd(125, 100)).toBe(1);
    expect(matchedAdapterExecutor._orderQuantityFromSizeUsd(125, 100)).toBe(1.25);
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

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
      failedRules: 'TEST_BLOCK',
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      sizeUsd: 500,
      orderQuantity: 5,
    }));
    expect(sendOrder).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BLOCKED BUY TSLA before broker/webhook/state side effects'));
  });

  test('malformed entry exit contract fails before broker, gate, webhook, or state side effects', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn();
    const webhookAdapter = { emit: jest.fn() };
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        webhookAdapter,
        preOrderEntryGate,
      }
    );

    await expect(executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult({ exitContract: { stopLossPercent: 0.5, takeProfitPercent: 1 } }),
      'TSLA'
    )).rejects.toThrow(/must be negative risk distance/);

    expect(preOrderEntryGate).not.toHaveBeenCalled();
    expect(sendOrder).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
  });

  test('backtest non-fractional stock entry rejects zero-share order plan before simulated execution or state side effects', async () => {
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true });
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest', brokerId: 'interactivebrokers' },
      {
        backtestMode: true,
        paperTrading: false,
        preOrderEntryGate,
      }
    );

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      1000,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'non_positive_order_quantity',
      symbol: 'TSLA',
      action: 'BUY',
      quantityUnit: 'shares',
      orderQuantity: 0,
      sizeUsd: 500,
    }));
    expect(preOrderEntryGate).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
    expect(MaxProfitManager).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('planned shares quantity=0'));
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

    const result = await executor.executeTrade(
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

    expect(result).toEqual(expect.objectContaining({
      success: true,
      reason: null,
      orderId: 'LIVE_TRACE_1',
      traceId: 'trace_test_1',
      signalId: 'signal_test_1',
      decisionId: 'decision_test_1',
      symbol: 'TSLA',
      action: 'BUY',
    }));
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

  test('live broker response without order id returns explicit failure before state open', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn().mockResolvedValue({ price: 100 });
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        preOrderEntryGate,
      }
    );

    const result = await executor.executeTrade(
      {
        action: 'BUY',
        confidence: 50,
        traceId: 'trace_missing_order_id',
        signalId: 'signal_missing_order_id',
      },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'missing_broker_order_id for buy TSLA',
      orderId: null,
      traceId: 'trace_missing_order_id',
      signalId: 'signal_missing_order_id',
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(sendOrder).toHaveBeenCalledTimes(1);
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Order execution failed: missing_broker_order_id for buy TSLA');
  });

  test('live broker success followed by state open failure returns phase-specific failure', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.openPosition.mockResolvedValueOnce({ success: false, error: 'state write failed' });
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_STATE_FAIL', price: 100 });
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        preOrderEntryGate,
      }
    );

    const result = await executor.executeTrade(
      {
        action: 'BUY',
        confidence: 50,
        traceId: 'trace_state_open_fail',
        signalId: 'signal_state_open_fail',
      },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'state_open_failed',
      orderId: 'LIVE_STATE_FAIL',
      orderAccepted: true,
      stateMutationSucceeded: false,
      traceId: 'trace_state_open_fail',
      signalId: 'signal_state_open_fail',
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(sendOrder).toHaveBeenCalledTimes(1);
    expect(mockStateManager.openPosition).toHaveBeenCalledTimes(1);
    expect(mockStateManager.removeActiveTrade).toHaveBeenCalledWith('LIVE_STATE_FAIL');
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

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
      failedRules: 'TTP_VOLUME_5_PERCENT',
      symbol: 'TSLA',
      action: 'BUY',
    }));
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

  test('live stock cover partial fill reduces short state by accepted broker quantity', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: -600, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeShortTrade()]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_COVER_PARTIAL_FILL', price: 120, qty: 4 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    const result = await executor.executeTrade(
      { action: 'COVER', confidence: 100, tradeId: 'SHORT_1', exitReason: 'partial_fill_cover' },
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
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 400,
      orderQuantity: 4,
      quantityUnit: 'shares',
    }));
    expect(mockStateManager.reducePosition).toHaveBeenCalledWith(
      'SHORT_1',
      4 / 6,
      120,
      expect.objectContaining({
        orderId: 'SHORT_1',
        exitReason: 'partial_fill_cover',
        direction: 'short',
        orderQuantity: 4,
        quantityUnit: 'shares',
      })
    );
    expect(TradingProofLogger.trade).toHaveBeenCalledWith(expect.objectContaining({
      action: 'COVER',
      size: 400,
      value_usd: 400,
      pnl: -80,
    }));
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
  });

  test('live Alpaca stock partial exit preserves requested fractional share quantity', async () => {
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
      amount: 2.5,
      options: expect.objectContaining({
        sizeUsd: 250,
        quantityUnit: 'shares',
      }),
    }));
    expect(mockStateManager.reducePosition).toHaveBeenCalledWith(
      'BUY_1',
      0.5,
      125,
      expect.objectContaining({
        orderId: 'BUY_1',
        exitReason: 'tier_exit',
        orderQuantity: 2.5,
        quantityUnit: 'shares',
      })
    );
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
  });

  test('live stock partial exit reduces state by accepted broker quantity', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeBuyTrade()]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_EXIT_PARTIAL_FILL', price: 125, qty: 2 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'tier_exit', exitFraction: 0.6 },
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
      amount: 3,
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 200,
      orderQuantity: 2,
      quantityUnit: 'shares',
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

  test('backtest Alpaca stock partial exit uses requested fractional share quantity', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeBuyTrade()]);
    const backtestRecorder = { recordTrade: jest.fn() };
    const logTrade = jest.fn();
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder,
        logTrade,
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'tier_exit', exitFraction: 0.5 },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 250,
      orderQuantity: 2.5,
      quantityUnit: 'shares',
    }));
    expect(mockStateManager.reducePosition).toHaveBeenCalledWith(
      'BUY_1',
      0.5,
      125 * (1 - 0.0005),
      expect.objectContaining({
        orderId: 'BUY_1',
        exitReason: 'tier_exit',
        orderQuantity: 2.5,
        quantityUnit: 'shares',
      })
    );
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 250,
      exitReason: 'tier_exit',
    }));
    expect(logTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 250,
      positionSize: 250,
      pnl: expect.any(Number),
    }));
  });

  test('backtest Alpaca stock partial exit preserves sub-share requested fraction', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 300, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([
      makeBuyTrade({
        size: 300,
        sizeUsd: 300,
        entryOrderQuantity: 3,
        remainingOrderQuantity: 3,
      }),
    ]);
    const backtestRecorder = { recordTrade: jest.fn() };
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder,
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'tier_exit', exitFraction: 0.3 },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 90,
      orderQuantity: 0.8999999999999999,
      quantityUnit: 'shares',
    }));
    expect(mockStateManager.reducePosition).toHaveBeenCalledWith(
      'BUY_1',
      0.3,
      125 * (1 - 0.0005),
      expect.objectContaining({
        orderId: 'BUY_1',
        exitReason: 'tier_exit',
        orderQuantity: 0.8999999999999999,
        quantityUnit: 'shares',
      })
    );
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 90,
      exitReason: 'tier_exit',
    }));
  });

  test('backtest Alpaca stock multi-exit records no more than the original entry size', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });

    const activeTrade = makeBuyTrade({
      size: 500,
      sizeUsd: 500,
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      executionMode: 'backtest',
    });
    mockStateManager.getTradesBySymbol.mockImplementation(() => (
      activeTrade.sizeUsd > 0 ? [activeTrade] : []
    ));
    mockStateManager.reducePosition.mockImplementation(async (tradeId, fraction, price, context = {}) => {
      const closedSize = activeTrade.sizeUsd * fraction;
      activeTrade.sizeUsd -= closedSize;
      activeTrade.size = activeTrade.sizeUsd;
      activeTrade.remainingOrderQuantity -= context.orderQuantity;
      return { success: true };
    });
    mockStateManager.closePosition.mockImplementation(async () => {
      activeTrade.sizeUsd = 0;
      activeTrade.size = 0;
      activeTrade.remainingOrderQuantity = 0;
      return { success: true };
    });

    const recordedTrades = [];
    const backtestRecorder = {
      recordTrade: jest.fn((trade) => recordedTrades.push(trade)),
    };
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder,
      }
    );

    const baseArgs = [
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA',
    ];

    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'profit_tier_1', exitFraction: 0.3 },
      ...baseArgs
    );
    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'profit_tier_2', exitFraction: 150 / 350 },
      ...baseArgs
    );
    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'profit_tier_3', exitFraction: 100 / 200 },
      ...baseArgs
    );
    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'max_hold_winner' },
      ...baseArgs
    );

    expect(recordedTrades.map(t => t.size)).toEqual([150, 150, 100, 100]);
    expect(recordedTrades.reduce((sum, trade) => sum + trade.size, 0)).toBeCloseTo(500, 12);
    expect(mockStateManager.reducePosition).toHaveBeenCalledTimes(3);
    expect(mockStateManager.closePosition).toHaveBeenCalledTimes(1);
  });

  test('backtest Alpaca stock partial exits use remaining cost basis for larger later fractions', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });

    const activeTrade = makeBuyTrade({
      size: 500,
      sizeUsd: 500,
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      executionMode: 'backtest',
    });
    mockStateManager.getTradesBySymbol.mockImplementation(() => (
      activeTrade.sizeUsd > 0 ? [activeTrade] : []
    ));
    mockStateManager.reducePosition.mockImplementation(async (tradeId, fraction, price, context = {}) => {
      const closedSize = activeTrade.sizeUsd * fraction;
      activeTrade.sizeUsd -= closedSize;
      activeTrade.size = activeTrade.sizeUsd;
      activeTrade.remainingOrderQuantity -= context.orderQuantity;
      return { success: true };
    });
    mockStateManager.closePosition.mockImplementation(async () => {
      activeTrade.sizeUsd = 0;
      activeTrade.size = 0;
      activeTrade.remainingOrderQuantity = 0;
      return { success: true };
    });

    const recordedTrades = [];
    const backtestRecorder = {
      recordTrade: jest.fn((trade) => recordedTrades.push(trade)),
    };
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder,
      }
    );

    const baseArgs = [
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA',
    ];

    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'profit_tier_1', exitFraction: 0.3 },
      ...baseArgs
    );
    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'profit_tier_2', exitFraction: 0.8 },
      ...baseArgs
    );
    await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'max_hold_winner' },
      ...baseArgs
    );

    expect(recordedTrades.map(t => t.size)).toEqual([150, 280, 70]);
    expect(recordedTrades.reduce((sum, trade) => sum + trade.size, 0)).toBeCloseTo(500, 12);
    expect(mockStateManager.reducePosition).toHaveBeenCalledTimes(2);
    expect(mockStateManager.closePosition).toHaveBeenCalledTimes(1);
  });

  test('backtest non-fractional stock partial exit routes minimum whole share when requested fraction is sub-share', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 300, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([
      makeBuyTrade({
        size: 300,
        sizeUsd: 300,
        entryOrderQuantity: 3,
        remainingOrderQuantity: 3,
        brokerId: 'interactivebrokers',
      }),
    ]);
    const backtestRecorder = { recordTrade: jest.fn() };
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest', brokerId: 'interactivebrokers' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder,
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'tier_exit', exitFraction: 0.3 },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 100,
      orderQuantity: 1,
      quantityUnit: 'shares',
    }));
    expect(mockStateManager.reducePosition).toHaveBeenCalledWith(
      'BUY_1',
      1 / 3,
      125 * (1 - 0.0005),
      expect.objectContaining({
        orderId: 'BUY_1',
        exitReason: 'tier_exit',
        orderQuantity: 1,
        quantityUnit: 'shares',
      })
    );
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 100,
      exitReason: 'tier_exit',
    }));
  });

  test('backtest non-fractional stock sub-share partial request full-closes a one-share remainder', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 100, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([
      makeBuyTrade({
        size: 100,
        sizeUsd: 100,
        entryOrderQuantity: 1,
        remainingOrderQuantity: 1,
        brokerId: 'interactivebrokers',
      }),
    ]);
    const backtestRecorder = { recordTrade: jest.fn() };
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest', brokerId: 'interactivebrokers' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder,
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'tier_exit', exitFraction: 0.3 },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways' },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 100,
      orderQuantity: 1,
      quantityUnit: 'shares',
    }));
    expect(mockStateManager.closePosition).toHaveBeenCalledWith(
      125 * (1 - 0.0005),
      false,
      null,
      expect.objectContaining({
        orderId: 'BUY_1',
        exitReason: 'tier_exit',
      })
    );
    expect(mockStateManager.reducePosition).not.toHaveBeenCalled();
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 100,
      exitReason: 'tier_exit',
    }));
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

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'KILL-5: SELL with no matching BUY',
      symbol: 'TSLA',
      action: 'SELL',
    }));
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

  test('live stock buy opens state with accepted broker quantity size', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_BUY_PARTIAL_FILL', price: 100, qty: 3 });
    const executor = makeExecutor(
      { executionMode: 'live', assetClass: 'stocks' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
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

    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      amount: 5,
      options: expect.objectContaining({ sizeUsd: 500, quantityUnit: 'shares' }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 300,
      orderQuantity: 3,
      quantityUnit: 'shares',
    }));
    expect(mockStateManager.openPosition).toHaveBeenCalledWith(
      300,
      100,
      expect.objectContaining({
        action: 'BUY',
        direction: 'long',
        entryOrderQuantity: 3,
        remainingOrderQuantity: 3,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantityUnit: 'shares',
      })
    );
  });

  test('live stock sell short opens state with accepted broker quantity size', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_SHORT_PARTIAL_FILL', price: 100, qty: 4 });
    const executor = makeExecutor(
      { executionMode: 'live', assetClass: 'stocks' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL_SHORT', confidence: 50 },
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
      options: expect.objectContaining({ sizeUsd: 500, quantityUnit: 'shares' }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 400,
      orderQuantity: 4,
      quantityUnit: 'shares',
    }));
    expect(mockStateManager.openPosition).toHaveBeenCalledWith(
      400,
      100,
      expect.objectContaining({
        action: 'SELL_SHORT',
        direction: 'short',
        entryOrderQuantity: 4,
        remainingOrderQuantity: 4,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantityUnit: 'shares',
      })
    );
  });

  test('accepted order quantity rejects broker amount that differs from planned quantity', () => {
    const executor = makeExecutor();

    expect(() => executor._acceptedOrderQuantity({ amount: 500 }, 3))
      .toThrow('broker amount 500 differs from planned quantity 3');
    expect(() => executor._acceptedOrderQuantity({ amount: 2 }, 3))
      .toThrow('broker amount 2 differs from planned quantity 3');
    expect(executor._acceptedOrderQuantity({ qty: 2 }, 3)).toBe(2);
    expect(executor._acceptedOrderQuantity({ amount: 3 }, 3)).toBe(3);
    expect(executor._acceptedOrderQuantity({}, 3)).toBe(3);
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
