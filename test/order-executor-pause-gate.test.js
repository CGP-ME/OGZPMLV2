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
  reserveExitSlot: jest.fn(),
  releaseExitSlot: jest.fn(),
  applyFill: jest.fn(),
  getTradesBySymbol: jest.fn(),
  haltSymbol: jest.fn(),
  removeActiveTrade: jest.fn(),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

jest.mock('../core/MaxProfitManager', () => {
  const { createMockMaxProfitManager } = require('./fixtures/mock-max-profit-manager');
  const ActualMaxProfitManager = jest.requireActual('../core/MaxProfitManager');
  return createMockMaxProfitManager(jest, ActualMaxProfitManager);
});

jest.mock('../ogz-meta/claudito-logger', () => ({
  TradingProofLogger: {
    trade: jest.fn(),
    explanation: jest.fn(),
  },
}));

const OrderExecutor = require('../core/OrderExecutor');
const MaxProfitManager = require('../core/MaxProfitManager');
const TradingConfig = require('../core/TradingConfig');
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

function makeExitContract(overrides = {}) {
  return {
    stopLossPercent: -0.5,
    takeProfitPercent: 1,
    trailingStopPercent: 0.6,
    trailingActivation: 0.8,
    maxHoldTimeMinutes: 240,
    minConfidence: 0.6,
    atrMinPercent: null,
    useStructuralExits: false,
    invalidationConditions: [],
    ...overrides,
  };
}

function makeOrchResult(overrides = {}) {
  return {
    winnerStrategy: 'RSI',
    sizingMultiplier: 2,
    exitContract: makeExitContract(),
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
    exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1, useStructuralExits: false },
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
    exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1, useStructuralExits: false },
    ...overrides,
  };
}

function expectExitFillApplied({
  tradeId,
  filledQuantity,
  fillPrice,
  remainingQuantity,
  direction = 'long',
  executionMode = 'live',
  simulated = false,
  expectedLifecycleState = 'full_fill',
  expectedReserveFraction = null,
  expectedReserveRemainingQuantity = null,
}) {
  const reserveExpectation = {};
  if (expectedReserveFraction !== null) reserveExpectation.exitFraction = expectedReserveFraction;
  if (expectedReserveRemainingQuantity !== null) reserveExpectation.expectedRemainingQuantity = expectedReserveRemainingQuantity;
  expect(mockStateManager.reserveExitSlot).toHaveBeenCalledWith(
    tradeId,
    expect.stringContaining(`exit:${tradeId}:`),
    expect.objectContaining(reserveExpectation)
  );
  expect(mockStateManager.applyFill).toHaveBeenCalledWith(expect.objectContaining({
    tradeId,
    lifecycleState: expectedLifecycleState,
    filledQuantity,
    filledQuantityUnit: 'shares',
    filledSizeUsd: filledQuantity * fillPrice,
    fillPrice,
    remainingQuantity,
    executionMode,
    simulated,
  }));
  expect(mockStateManager.closePosition).not.toHaveBeenCalled();
  expect(mockStateManager.reducePosition).not.toHaveBeenCalled();
  if (direction === 'long') {
    expect(mockStateManager.removeActiveTrade).not.toHaveBeenCalledWith(tradeId);
  }
}

describe('OrderExecutor pause gate', () => {
  let errorSpy;
  let warnSpy;
  let clearTradingConfigOverrides;

  beforeEach(() => {
    jest.clearAllMocks();
    clearTradingConfigOverrides = false;
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
    mockStateManager.reserveExitSlot.mockResolvedValue({
      success: true,
      reserved: true,
      reason: 'reserved',
      pendingExitIntent: {
        intentId: 'reserved-intent',
        sourceEventId: 'reserved-source',
        submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
        tradeRevision: 0,
      },
    });
    mockStateManager.releaseExitSlot.mockResolvedValue({ success: true, released: true, reason: 'released' });
    mockStateManager.applyFill.mockResolvedValue({
      success: true,
      applied: true,
      code: 'FILL_APPLIED',
      fillId: 'fill-1',
      filledQuantity: 1,
      remainingOrderQuantity: 0,
      pnl: 0,
      netRealizedResult: 0,
    });
    mockStateManager.getTradesBySymbol.mockReturnValue([]);
    mockStateManager.haltSymbol.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    if (clearTradingConfigOverrides) TradingConfig.clearOverrides();
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

  test('blocks direct entries below configured minTradeConfidence before routing', async () => {
    clearTradingConfigOverrides = true;
    TradingConfig.setOverrides({ confidence: { minTradeConfidence: 0.9 } });
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      if (key === 'balance') return 10000;
      if (key === 'position') return 0;
      return null;
    });
    const executor = makeExecutor({ executionMode: 'live' }, { paperTrading: false });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 85 },
      {},
      425,
      {},
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'low_confidence',
      confidencePct: 85,
      minConfidencePct: 90,
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('confidence 85.0% below minimum 90.0%'));
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
        frozenExitPolicy: expect.objectContaining({
          source: 'PolicyBuilder.buildForTrade',
          strategyName: 'RSI',
          policyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          contract: expect.objectContaining({
            strategyName: 'RSI',
            stopLossPercent: -0.5,
            takeProfitPercent: 1,
            useStructuralExits: false,
          }),
        }),
      })
    );
    expect(MaxProfitManager).not.toHaveBeenCalled();
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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

  test('enabled webhook dry-run blocks paper entry before simulated execution or state mutation', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const webhookAdapter = { enabled: true, dryRun: true, emit: jest.fn() };
    const executor = makeExecutor({}, { webhookAdapter });

    const result = await executor.executeTrade(
      { action: 'SELL_SHORT', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'webhook_dry_run',
      route: 'webhook',
      orderAccepted: false,
      stateMutationSucceeded: false,
      symbol: 'TSLA',
      action: 'SELL_SHORT',
    }));
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('BLOCKED SELL_SHORT TSLA before execution/state side effects: webhook_dry_run'));
  });

  test('enabled stock webhook route rejects sub-one-share entry before state mutation', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: false },
      positionSizing: { maxPositionSize: 0.01 },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const webhookAdapter = { enabled: true, dryRun: false, emit: jest.fn() };
    const executor = makeExecutor({}, { webhookAdapter });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      1000,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 1 }),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'non_positive_order_quantity',
      orderQuantity: 0,
      quantityUnit: 'shares',
      sizeUsd: 0,
    }));
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
  });

  test('enabled stock webhook route plans whole shares before eval gate and emit', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const webhookAdapter = {
      enabled: true,
      dryRun: false,
      emit: jest.fn().mockResolvedValue({
        sent: true,
        response: { status: 202, body: '{"orderId":"WEBHOOK_WHOLE_SHARE_1"}' },
      }),
    };
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true, passedRules: ['test'] });
    const executor = makeExecutor({}, { webhookAdapter, preOrderEntryGate });

    const result = await executor.executeTrade(
      { action: 'SELL_SHORT', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 1 }),
      'TSLA'
    );

    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      orderQuantity: 2,
      quantityUnit: 'shares',
      sizeUsd: 200,
    }));
    expect(webhookAdapter.emit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'sell',
      symbol: 'TSLA',
      quantity: 2,
      quantityUnit: 'shares',
      orderType: 'market',
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      orderId: 'WEBHOOK_WHOLE_SHARE_1',
      orderQuantity: 2,
      quantityUnit: 'shares',
    }));
  });

  test('enabled webhook route opens state only after sent response supplies order identity', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const webhookAdapter = {
      enabled: true,
      dryRun: false,
      emit: jest.fn().mockResolvedValue({
        sent: true,
        response: { status: 202, body: '{"orderId":"WEBHOOK_ORDER_1"}' },
      }),
    };
    const executor = makeExecutor({}, { webhookAdapter });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      orderId: 'WEBHOOK_ORDER_1',
      orderAccepted: true,
      stateMutationSucceeded: true,
      orderQuantity: 5,
      quantityUnit: 'shares',
    }));
    expect(webhookAdapter.emit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'buy',
      symbol: 'TSLA',
      quantity: 5,
      quantityUnit: 'shares',
      orderType: 'market',
    }));
    expect(executor.ctx.orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).toHaveBeenCalledWith(
      500,
      100,
      expect.objectContaining({
        orderId: 'WEBHOOK_ORDER_1',
        action: 'BUY',
        entryOrderQuantity: 5,
        remainingOrderQuantity: 5,
        frozenExitPolicy: expect.objectContaining({
          source: 'PolicyBuilder.buildForTrade',
          strategyName: 'RSI',
          policyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    );
  });

  test('enabled webhook route dispatches fractional share exits instead of pre-blocking them', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeBuyTrade()]);
    const webhookAdapter = {
      enabled: true,
      dryRun: false,
      emit: jest.fn().mockResolvedValue({
        sent: true,
        response: { status: 202, body: '{"orderId":"WEBHOOK_EXIT_FRACTIONAL_1"}' },
      }),
    };
    const executor = makeExecutor({}, { webhookAdapter });

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'tier_exit', exitFraction: 0.3 },
      {},
      125,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      orderId: 'WEBHOOK_EXIT_FRACTIONAL_1',
      orderAccepted: true,
      stateMutationSucceeded: true,
      orderQuantity: 1.5,
      quantityUnit: 'shares',
    }));
    expect(webhookAdapter.emit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'sell',
      symbol: 'TSLA',
      quantity: 1.5,
      quantityUnit: 'shares',
      bypassThrottle: true,
    }));
    expectExitFillApplied({ tradeId: 'BUY_1', filledQuantity: 1.5, fillPrice: 125, remainingQuantity: 3.5, simulated: true });
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('webhook_fractional_share_quantity'));
  });

  test('enabled webhook route sent response without order identity blocks local state mutation', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const webhookAdapter = {
      enabled: true,
      dryRun: false,
      emit: jest.fn().mockResolvedValue({
        sent: true,
        response: { status: 202, body: 'accepted' },
      }),
    };
    const executor = makeExecutor({}, { webhookAdapter });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'missing_webhook_order_id',
      orderAccepted: false,
    }));
    expect(webhookAdapter.emit).toHaveBeenCalledTimes(1);
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
  });

  test('flat sizing profile disables confidence multiplier before confluence sizing', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: false },
      positionSizing: { maxPositionSize: 0.05 },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const preOrderEntryGate = jest.fn().mockResolvedValue({
      allowed: false,
      failedRules: [{ ruleId: 'SIZE_PROBE' }],
    });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        preOrderEntryGate,
      }
    );

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 2 }),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
      failedRules: 'SIZE_PROBE',
    }));
    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      baseSizeUsd: 500,
      sizeUsd: 1000,
      confidenceMultiplier: 1,
      sizingMultiplier: 2,
      orderQuantity: 10,
    }));
  });

  test('entry sizing enforces entryLogic absolute cap after confidence and confluence', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: true },
      positionSizing: { maxPositionSize: 0.05, absoluteCapPercent: 0.99 },
      entryLogic: { sizing: { absoluteCapPercent: 0.04 } },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const preOrderEntryGate = jest.fn().mockResolvedValue({
      allowed: false,
      failedRules: [{ ruleId: 'SIZE_PROBE' }],
    });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        preOrderEntryGate,
      }
    );

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 90 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 2.5 }),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
      failedRules: 'SIZE_PROBE',
    }));
    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      baseSizeUsd: 400,
      requestedSizeUsd: 1000,
      sizeUsd: 400,
      absoluteCapPercent: 0.04,
      absoluteCapSizeUsd: 400,
      cappedByAbsoluteCap: true,
      orderQuantity: 4,
    }));
  });

  test('stock share range raises fee-floor entries to configured minimum shares before eval gate', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: true },
      positionSizing: { maxPositionSize: 0.10 },
      entryLogic: {
        sizing: {
          absoluteCapPercent: 1.0,
          stockShareRange: {
            enabled: true,
            minShares: 2,
            maxShares: 0,
            maxNotionalUsd: 5000,
            consistencyCapBuffer: 0.98,
            dailyLossRiskFraction: 1.0,
          },
        },
      },
      exits: { profitTiers: { final: 0.025 } },
      evalRules: {
        ttp: {
          accountLimits: { dailyLossDollars: 50 },
          consistency: { profitTargetDollars: 300, maxPositionProfitRatio: 0.30 },
        },
      },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.getAvailableCapital.mockReturnValue(5000);
    mockStateManager.getEquity.mockReturnValue(5000);
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const preOrderEntryGate = jest.fn().mockResolvedValue({
      allowed: false,
      failedRules: [{ ruleId: 'SIZE_PROBE' }],
    });
    const executor = makeExecutor({ executionMode: 'live' }, { paperTrading: false, preOrderEntryGate });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      400,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 1 }),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
    }));
    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      baseSizeUsd: 250,
      requestedSizeUsd: 250,
      sizeUsd: 800,
      orderQuantity: 2,
      stockShareRange: expect.objectContaining({
        minShares: 2,
        maxShares: 8,
        reasons: expect.arrayContaining(['ttp_consistency_profit_cap', 'ttp_daily_loss_risk']),
      }),
    }));
  });

  test('stock share range caps high-confidence entries below the TTP best-trade profit limit', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: true },
      positionSizing: { maxPositionSize: 0.20 },
      entryLogic: {
        sizing: {
          absoluteCapPercent: 1.0,
          stockShareRange: {
            enabled: true,
            minShares: 2,
            maxShares: 20,
            maxNotionalUsd: 5000,
            consistencyCapBuffer: 0.98,
            dailyLossRiskFraction: 1.0,
          },
        },
      },
      exits: { profitTiers: { final: 0.025 } },
      evalRules: {
        ttp: {
          accountLimits: { dailyLossDollars: 50 },
          consistency: { profitTargetDollars: 300, maxPositionProfitRatio: 0.30 },
        },
      },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.getAvailableCapital.mockReturnValue(10000);
    mockStateManager.getEquity.mockReturnValue(10000);
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const preOrderEntryGate = jest.fn().mockResolvedValue({
      allowed: false,
      failedRules: [{ ruleId: 'SIZE_PROBE' }],
    });
    const executor = makeExecutor({ executionMode: 'live' }, { paperTrading: false, preOrderEntryGate });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 100 },
      {},
      400,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 2.5 }),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
    }));
    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      requestedSizeUsd: 12500,
      sizeUsd: 3200,
      orderQuantity: 8,
      stockShareRange: expect.objectContaining({
        minShares: 2,
        maxShares: 8,
        reasons: expect.arrayContaining(['ttp_consistency_profit_cap']),
      }),
    }));
  });

  test('stock share range caps cheap-symbol raw share counts by eval risk math instead of universal share ceiling', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: true },
      positionSizing: { maxPositionSize: 0.20 },
      entryLogic: {
        sizing: {
          absoluteCapPercent: 1.0,
          stockShareRange: {
            enabled: true,
            minShares: 2,
            maxShares: 0,
            maxNotionalUsd: 5000,
            consistencyCapBuffer: 0.98,
            dailyLossRiskFraction: 1.0,
          },
        },
      },
      exits: { profitTiers: { final: 0.025 } },
      evalRules: {
        ttp: {
          accountLimits: { dailyLossDollars: 50 },
          consistency: { profitTargetDollars: 300, maxPositionProfitRatio: 0.30 },
        },
      },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.getAvailableCapital.mockReturnValue(5000);
    mockStateManager.getEquity.mockReturnValue(5000);
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const preOrderEntryGate = jest.fn().mockResolvedValue({
      allowed: false,
      failedRules: [{ ruleId: 'SIZE_PROBE' }],
    });
    const executor = makeExecutor({ executionMode: 'live' }, { paperTrading: false, preOrderEntryGate });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 100 },
      {},
      15,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 2.5 }),
      'MARA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
    }));
    expect(preOrderEntryGate).toHaveBeenCalledWith(expect.objectContaining({
      requestedSizeUsd: 6250,
      orderQuantity: 235,
      sizeUsd: 3525,
      stockShareRange: expect.objectContaining({
        minShares: 2,
        maxShares: 235,
        reasons: expect.arrayContaining([
          'config_max_notional',
          'ttp_consistency_profit_cap',
          'ttp_daily_loss_risk',
        ]),
      }),
    }));
  });

  test('stock share range blocks when configured minimum shares would violate consistency cap', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: true },
      positionSizing: { maxPositionSize: 0.10 },
      entryLogic: {
        sizing: {
          absoluteCapPercent: 1.0,
          stockShareRange: {
            enabled: true,
            minShares: 2,
            maxShares: 8,
            maxNotionalUsd: 5000,
            consistencyCapBuffer: 0.98,
            dailyLossRiskFraction: 1.0,
          },
        },
      },
      exits: { profitTiers: { final: 0.025 } },
      evalRules: {
        ttp: {
          accountLimits: { dailyLossDollars: 50 },
          consistency: { profitTargetDollars: 300, maxPositionProfitRatio: 0.30 },
        },
      },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.getAvailableCapital.mockReturnValue(5000);
    mockStateManager.getEquity.mockReturnValue(5000);
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const preOrderEntryGate = jest.fn().mockResolvedValue({ allowed: true });
    const executor = makeExecutor({ executionMode: 'live' }, { paperTrading: false, preOrderEntryGate });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 100 },
      {},
      400,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({
        sizingMultiplier: 1,
        exitContract: makeExitContract({ takeProfitPercent: 12 }),
      }),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'stock_share_range_impossible:min=2:max=1',
      orderQuantity: 0,
      stockShareRange: expect.objectContaining({
        minShares: 2,
        maxShares: 1,
        reasons: expect.arrayContaining(['ttp_consistency_profit_cap']),
      }),
    }));
    expect(preOrderEntryGate).not.toHaveBeenCalled();
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ exitContract: { stopLossPercent: 0.5, takeProfitPercent: 1, useStructuralExits: false } }),
      'TSLA'
    )).rejects.toThrow(/must be negative risk distance/);

    expect(preOrderEntryGate).not.toHaveBeenCalled();
    expect(sendOrder).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
  });

  test('entry exit contract without structural ownership fails before broker, gate, webhook, or state side effects', async () => {
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 } }),
      'TSLA'
    )).rejects.toThrow(/exitContract\.useStructuralExits missing\/invalid/);

    expect(preOrderEntryGate).not.toHaveBeenCalled();
    expect(sendOrder).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
  });

  test('entry exit contract missing frozen policy fields fails before broker, gate, webhook, or state side effects', async () => {
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({
        exitContract: {
          stopLossPercent: -0.5,
          takeProfitPercent: 1,
          useStructuralExits: false,
        },
      }),
      'TSLA'
    )).rejects.toThrow(/exitContract\.trailingStopPercent is required/);

    expect(preOrderEntryGate).not.toHaveBeenCalled();
    expect(sendOrder).not.toHaveBeenCalled();
    expect(webhookAdapter.emit).not.toHaveBeenCalled();
    expect(mockStateManager.openPosition).not.toHaveBeenCalled();
  });

  test('entry plan helper rejects missing structural ownership before stock share routing', () => {
    const executor = makeExecutor();

    expect(() => executor._buildEntryPlan({
      decision: { action: 'BUY', confidence: 50 },
      symbol: 'TSLA',
      price: 100,
      positionSize: 500,
      currentBalance: 5000,
      currentEquity: 5000,
      tradeConfidence: 50,
      confidenceMultiplier: 1,
      entryVolatility: 0.01,
      orchResult: makeOrchResult({ exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 } }),
      absoluteCapPercent: 0.1,
    })).toThrow(/OrderExecutor\._buildEntryPlan: exitContract\.useStructuralExits missing\/invalid/);
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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

  test('eval market-time failure blocks webhook entries before SignalStack dispatch', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const webhookAdapter = { enabled: true, emit: jest.fn() };
    const evalRuleEngine = {
      check: jest.fn().mockResolvedValue({
        allowed: false,
        failedRules: [{ ruleId: 'TTP_MARKET_TIME', reason: 'outside_regular_session_no_openings' }],
      }),
    };
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        webhookAdapter,
        evalRuleEngine,
      }
    );

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 50 },
      {},
      100,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult(),
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'eval_rule_gate',
      failedRules: 'TTP_MARKET_TIME',
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(evalRuleEngine.check).toHaveBeenCalledWith(expect.objectContaining({
      action: 'BUY',
      symbol: 'TSLA',
      orderQuantity: 5,
      quantityUnit: 'shares',
    }));
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
        { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({ tradeId: 'BUY_1', filledQuantity: 5, fillPrice: 125, remainingQuantity: 0 });
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({ tradeId: 'SHORT_1', filledQuantity: 6, fillPrice: 120, remainingQuantity: 0, direction: 'short' });
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({ tradeId: 'SHORT_1', filledQuantity: 4, fillPrice: 120, remainingQuantity: 2, direction: 'short' });
    expect(TradingProofLogger.trade).toHaveBeenCalledWith(expect.objectContaining({
      action: 'COVER',
      size: 400,
      value_usd: 400,
      pnl: -80,
    }));
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({ tradeId: 'BUY_1', filledQuantity: 2.5, fillPrice: 125, remainingQuantity: 2.5 });
  });

  test('live SELL exits are not blocked by zero available entry capital or missing confidence', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getAvailableCapital.mockReturnValue(0);
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 0 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeBuyTrade()]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_EXIT_ZERO_CAPITAL', price: 125, qty: 5 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', tradeId: 'BUY_1', exitReason: 'risk_flatten' },
      { totalConfidence: 0 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      orderId: 'LIVE_EXIT_ZERO_CAPITAL',
      action: 'SELL',
      symbol: 'TSLA',
      orderAccepted: true,
      stateMutationSucceeded: true,
    }));
    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      side: 'sell',
      amount: 5,
    }));
    expectExitFillApplied({ tradeId: 'BUY_1', filledQuantity: 5, fillPrice: 125, remainingQuantity: 0 });
  });

  test('live COVER exits are not blocked by zero confidence or zero available entry capital', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getAvailableCapital.mockReturnValue(0);
    mockStateManager.getState.mockReturnValue({ position: -600, balance: 0 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeShortTrade()]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_COVER_ZERO_CONF', price: 120, qty: 6 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
      }
    );

    const result = await executor.executeTrade(
      { action: 'COVER', confidence: 0, tradeId: 'SHORT_1', exitReason: 'risk_flatten' },
      { totalConfidence: 0 },
      120,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      orderId: 'LIVE_COVER_ZERO_CONF',
      action: 'COVER',
      symbol: 'TSLA',
      orderAccepted: true,
      stateMutationSucceeded: true,
    }));
    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      side: 'buy',
      amount: 6,
    }));
    expectExitFillApplied({ tradeId: 'SHORT_1', filledQuantity: 6, fillPrice: 120, remainingQuantity: 0, direction: 'short' });
  });

  test('live SELL exits use stored trade scope instead of current SessionRouter scope', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    mockStateManager.getTradesBySymbol.mockReturnValue([makeBuyTrade({
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'live',
      timeframe: '15m',
    })]);
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_EXIT_STORED_SCOPE', price: 125, qty: 5 });
    const executor = makeExecutor(
      { executionMode: 'live' },
      {
        paperTrading: false,
        orderRouter: { sendOrder },
        runner: {
          sessionRouter: { enabled: true },
          getCandleScopeEnvelope: jest.fn(() => ({})),
        },
      }
    );

    const result = await executor.executeTrade(
      { action: 'SELL', tradeId: 'BUY_1', exitReason: 'cutoff_flatten' },
      { totalConfidence: 0 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      brokerId: 'alpaca',
      accountId: 'acct-main',
      assetClass: 'stocks',
      executionMode: 'live',
      timeframe: '15m',
    }));
    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      symbol: 'TSLA',
      side: 'sell',
      amount: 5,
    }));
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({
      tradeId: 'BUY_1',
      filledQuantity: 2,
      fillPrice: 125,
      remainingQuantity: 3,
      expectedReserveFraction: 0.6,
      expectedReserveRemainingQuantity: 2,
    });
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({
      tradeId: 'BUY_1',
      filledQuantity: 2.5,
      fillPrice: 125 * (1 - 0.0005),
      remainingQuantity: 2.5,
      executionMode: 'live',
      simulated: true,
    });
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 250,
      exitReason: 'tier_exit',
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantityBeforeExit: 5,
      remainingOrderQuantityUnit: 'shares',
      exitOrderQuantity: 2.5,
      exitOrderQuantityUnit: 'shares',
      closedOrderQuantity: 2.5,
      quantityUnit: 'shares',
      entryFeeQuantity: 2.5,
      exitFeeQuantity: 2.5,
    }));
    expect(logTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 250,
      positionSize: 250,
      pnl: expect.any(Number),
    }));
  });

  test('long exit records outcome from later clean entry pattern when first pattern has no features', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: 500, balance: 10000 });
    const features = [0.51, 0.62, 0.41, 0.53, 0.44, 0.35, 0.58, 0.49, 0.5];
    const activeTrade = makeBuyTrade({
      patterns: [
        { name: 'hammer', confidence: 0.82 },
        { name: 'Learning Pattern', confidence: 0.1, features },
      ],
      executionMode: 'backtest',
      scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:1m',
    });
    mockStateManager.getTradesBySymbol.mockReturnValue([activeTrade]);
    const recordPatternResult = jest.fn(() => true);
    const healthCheck = jest.fn(() => ({ healthy: true, issues: [] }));
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder: { recordTrade: jest.fn() },
        logTrade: jest.fn(),
        patternChecker: {
          recordPatternResult,
          memory: { healthCheck },
        },
      }
    );
    executor.tradeExitCount = 9;

    const result = await executor.executeTrade(
      { action: 'SELL', confidence: 100, tradeId: 'BUY_1', exitReason: 'signal' },
      { totalConfidence: 100 },
      125,
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(recordPatternResult).toHaveBeenCalledTimes(1);
    expect(recordPatternResult.mock.calls[0][0]).toBe(features);
    expect(recordPatternResult.mock.calls[0][1]).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '1m',
      scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:1m',
    }));
    expect(recordPatternResult.mock.calls[0][1].pnl).toBeCloseTo(24.9375, 12);
    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('PATTERN SYSTEM UNHEALTHY'));
  });

  test('short cover records pattern outcome through same closed-trade learning path', async () => {
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    mockStateManager.getState.mockReturnValue({ position: -600, balance: 10000 });
    const features = [0.45, 0.31, 0.72, 0.48, 0.67, 0.42, 0.39, 0.56, 0.25];
    const shortTrade = makeShortTrade({
      patterns: [
        { name: 'shooting_star', confidence: 0.86 },
        { name: 'Learning Pattern', confidence: 0.1, features },
      ],
      executionMode: 'backtest',
      scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:1m',
    });
    mockStateManager.getTradesBySymbol.mockReturnValue([shortTrade]);
    const recordPatternResult = jest.fn(() => true);
    const healthCheck = jest.fn(() => ({ healthy: true, issues: [] }));
    const executor = makeExecutor(
      { enableBacktestMode: true, executionMode: 'backtest' },
      {
        backtestMode: true,
        paperTrading: false,
        backtestRecorder: { recordTrade: jest.fn() },
        logTrade: jest.fn(),
        patternChecker: {
          recordPatternResult,
          memory: { healthCheck },
        },
      }
    );
    executor.tradeExitCount = 9;

    const result = await executor.executeTrade(
      { action: 'COVER', confidence: 100, tradeId: 'SHORT_1', exitReason: 'signal' },
      { totalConfidence: 100 },
      90,
      { rsi: 45, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      null,
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(recordPatternResult).toHaveBeenCalledTimes(1);
    expect(recordPatternResult.mock.calls[0][0]).toBe(features);
    expect(recordPatternResult.mock.calls[0][1]).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '1m',
      scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:1m',
    }));
    expect(recordPatternResult.mock.calls[0][1].pnl).toBeCloseTo(9.955, 12);
    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('PATTERN SYSTEM UNHEALTHY'));
  });

  test('pattern outcome health reports missing memory when recording is enabled', () => {
    const executor = makeExecutor({}, {
      patternChecker: {},
    });
    executor.tradeExitCount = 9;

    const health = executor._checkPatternOutcomeHealth();

    expect(health).toEqual({
      healthy: false,
      issues: ['patternChecker.memory.healthCheck missing'],
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('health check unavailable'));
  });

  test('pattern outcome health stays quiet when test mode intentionally disables recording', () => {
    const executor = makeExecutor({ tradingMode: 'TEST' }, {
      patternChecker: {},
    });
    executor.tradeExitCount = 9;

    const health = executor._checkPatternOutcomeHealth();

    expect(health).toBeNull();
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('health check unavailable'));
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({
      tradeId: 'BUY_1',
      filledQuantity: 0.8999999999999999,
      fillPrice: 125 * (1 - 0.0005),
      remainingQuantity: 2.1,
      simulated: true,
    });
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 90,
      exitReason: 'tier_exit',
      entryOrderQuantity: 3,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantityBeforeExit: 3,
      remainingOrderQuantityUnit: 'shares',
      exitOrderQuantity: 0.8999999999999999,
      exitOrderQuantityUnit: 'shares',
      closedOrderQuantity: 0.8999999999999999,
      quantityUnit: 'shares',
      entryFeeQuantity: 0.8999999999999999,
      exitFeeQuantity: 0.8999999999999999,
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
    mockStateManager.applyFill.mockImplementation(async (fill) => {
      const closedSize = activeTrade.sizeUsd * (fill.filledQuantity / activeTrade.remainingOrderQuantity);
      activeTrade.sizeUsd -= closedSize;
      activeTrade.size = activeTrade.sizeUsd;
      activeTrade.remainingOrderQuantity = fill.remainingQuantity;
      return {
        success: true,
        applied: true,
        code: 'FILL_APPLIED',
        fillId: fill.fillId,
        filledQuantity: fill.filledQuantity,
        remainingOrderQuantity: fill.remainingQuantity,
      };
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expect(mockStateManager.applyFill).toHaveBeenCalledTimes(4);
    expect(mockStateManager.reducePosition).not.toHaveBeenCalled();
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
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
    mockStateManager.applyFill.mockImplementation(async (fill) => {
      const closedSize = activeTrade.sizeUsd * (fill.filledQuantity / activeTrade.remainingOrderQuantity);
      activeTrade.sizeUsd -= closedSize;
      activeTrade.size = activeTrade.sizeUsd;
      activeTrade.remainingOrderQuantity = fill.remainingQuantity;
      return {
        success: true,
        applied: true,
        code: 'FILL_APPLIED',
        fillId: fill.fillId,
        filledQuantity: fill.filledQuantity,
        remainingOrderQuantity: fill.remainingQuantity,
      };
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expect(mockStateManager.applyFill).toHaveBeenCalledTimes(3);
    expect(mockStateManager.reducePosition).not.toHaveBeenCalled();
    expect(mockStateManager.closePosition).not.toHaveBeenCalled();
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({
      tradeId: 'BUY_1',
      filledQuantity: 1,
      fillPrice: 125 * (1 - 0.0005),
      remainingQuantity: 2,
      simulated: true,
    });
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 100,
      exitReason: 'tier_exit',
      entryOrderQuantity: 3,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantityBeforeExit: 3,
      remainingOrderQuantityUnit: 'shares',
      exitOrderQuantity: 1,
      exitOrderQuantityUnit: 'shares',
      closedOrderQuantity: 1,
      quantityUnit: 'shares',
      entryFeeQuantity: 1,
      exitFeeQuantity: 1,
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expectExitFillApplied({
      tradeId: 'BUY_1',
      filledQuantity: 1,
      fillPrice: 125 * (1 - 0.0005),
      remainingQuantity: 0,
      simulated: true,
    });
    expect(backtestRecorder.recordTrade).toHaveBeenCalledWith(expect.objectContaining({
      size: 100,
      exitReason: 'tier_exit',
      entryOrderQuantity: 1,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantityBeforeExit: 1,
      remainingOrderQuantityUnit: 'shares',
      exitOrderQuantity: 1,
      exitOrderQuantityUnit: 'shares',
      closedOrderQuantity: 1,
      quantityUnit: 'shares',
      entryFeeQuantity: 1,
      exitFeeQuantity: 1,
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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

  test('live stock entry partial fill below configured share minimum records broker truth and halts symbol', async () => {
    TradingConfig.setOverrides({
      features: { enableDynamicSizing: true },
      positionSizing: { maxPositionSize: 0.05 },
      entryLogic: {
        sizing: {
          absoluteCapPercent: 1.0,
          stockShareRange: {
            enabled: true,
            minShares: 2,
            maxShares: 8,
            maxNotionalUsd: 5000,
            consistencyCapBuffer: 0.98,
            dailyLossRiskFraction: 1.0,
          },
        },
      },
      exits: { profitTiers: { final: 0.025 } },
      evalRules: {
        ttp: {
          accountLimits: { dailyLossDollars: 50 },
          consistency: { profitTargetDollars: 300, maxPositionProfitRatio: 0.30 },
        },
      },
    });
    clearTradingConfigOverrides = true;
    mockStateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      return null;
    });
    const sendOrder = jest.fn().mockResolvedValue({ orderId: 'LIVE_BUY_BELOW_MIN_FILL', price: 100, qty: 1 });
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
      [],
      null,
      makeOrchResult({ sizingMultiplier: 1 }),
      'TSLA'
    );

    expect(sendOrder).toHaveBeenCalledWith(expect.objectContaining({
      amount: 2,
      options: expect.objectContaining({ sizeUsd: 200, quantityUnit: 'shares' }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      amount: 100,
      orderQuantity: 1,
      quantityUnit: 'shares',
      stockShareRangeFillViolation: '[RISK-ENTRY-SHARE-RANGE] stock_share_range_fill_below_min:min=2:accepted=1',
    }));
    expect(mockStateManager.openPosition).toHaveBeenCalledWith(
      100,
      100,
      expect.objectContaining({
        action: 'BUY',
        direction: 'long',
        entryOrderQuantity: 1,
        remainingOrderQuantity: 1,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantityUnit: 'shares',
      })
    );
    expect(mockStateManager.haltSymbol).toHaveBeenCalledWith(
      'TSLA',
      '[RISK-ENTRY-SHARE-RANGE] stock_share_range_fill_below_min:min=2:accepted=1'
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
        frozenExitPolicy: expect.objectContaining({
          source: 'PolicyBuilder.buildForTrade',
          strategyName: 'RSI',
          policyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          contract: expect.objectContaining({
            strategyName: 'RSI',
            useStructuralExits: false,
          }),
        }),
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
      { rsi: 55, macd: {}, trend: 'sideways', volatility: 0.01 },
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
    expect(stockExecutor._webhookQuantityBlockReason(1.3984412299830962, 'shares')).toBe('fractional_share_quantity');
    expect(stockExecutor._webhookQuantityBlockReason(1, 'shares')).toBeNull();
    expect(stockExecutor._webhookQuantityBlockReason(0, 'shares')).toBe('non_positive_quantity');
    expect(cryptoExecutor._webhookQuantityBlockReason(0.016588545429287938, 'base')).toBeNull();
  });

  test('webhook emit helper broadcasts dispatch and local result trace events', async () => {
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

  test('webhook emit helper converts rejected adapter promises into failed result traces', async () => {
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

  test('webhook emit helper broadcasts broker_reject when adapter throws synchronously', async () => {
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
