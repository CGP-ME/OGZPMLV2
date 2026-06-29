'use strict';

const mockStateManager = {
  getTradesBySymbol: jest.fn(),
};

const entryExitContract = () => ({
  stopLossPercent: -0.5,
  takeProfitPercent: 1,
  trailingStopPercent: 0.5,
  trailingActivation: 1,
  maxHoldTimeMinutes: 120,
  useStructuralExits: false,
  invalidationConditions: [],
});

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

const TradingLoop = require('../core/TradingLoop');
const OrderExecutor = require('../core/OrderExecutor');

describe('SessionRouter runtime scope propagation', () => {
  const staleCryptoConfig = {
    brokerId: 'kraken',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'crypto',
    executionMode: 'paper',
    timeframe: '1m',
    enableBacktestMode: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function stockRunnerScope() {
    return {
      getCandleScopeEnvelope: jest.fn(() => ({
        brokerId: 'alpaca',
        accountId: 'acct-main',
        accountIdSource: 'config',
        assetClass: 'stocks',
        executionMode: 'paper',
        timeframe: '5m',
      })),
    };
  }

  function cryptoRunnerScope() {
    return {
      getCandleScopeEnvelope: jest.fn(() => ({
        brokerId: 'kraken',
        accountId: 'acct-main',
        accountIdSource: 'config',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
      })),
    };
  }

  function incompleteEnabledRouterScope() {
    return {
      sessionRouter: { enabled: true },
      getCandleScopeEnvelope: jest.fn(() => ({})),
    };
  }

  function missingAccountEnabledRouterScope() {
    return {
      sessionRouter: { enabled: true },
      getCandleScopeEnvelope: jest.fn(() => ({
        brokerId: 'alpaca',
        accountId: null,
        accountIdSource: null,
        assetClass: 'stocks',
        executionMode: 'paper',
        timeframe: '5m',
      })),
    };
  }

  test('TradingLoop pattern scope follows active SessionRouter scope', () => {
    const runner = stockRunnerScope();
    const loop = new TradingLoop({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner,
    });

    expect(loop._patternScope('TSLA')).toEqual({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '5m',
    });
  });

  test('TradingLoop TTP consistency uses active SessionRouter asset class', () => {
    const loop = new TradingLoop({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: stockRunnerScope(),
      marketData: { symbol: 'TSLA' },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: {
            enabled: true,
            profitTargetDollars: 100,
            maxPositionProfitRatio: 0.5,
          },
        },
      },
    });

    const result = loop._checkTtpConsistencyProfitCap({
      id: 'BUY_1',
      orderId: 'BUY_1',
      symbol: 'TSLA',
      action: 'BUY',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }, 110);

    expect(result).toEqual(expect.objectContaining({
      enabled: true,
      shouldExit: true,
      ruleId: 'TTP_CONSISTENCY_PROFIT_CAP',
      symbol: 'TSLA',
      direction: 'long',
    }));
  });

  test('TradingLoop refuses static config fallback when SessionRouter scope is incomplete', () => {
    const loop = new TradingLoop({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: incompleteEnabledRouterScope(),
    });

    expect(() => loop._patternScope('TSLA')).toThrow(/refusing static config fallback/);
    expect(() => loop._dashboardScope('TSLA')).toThrow(/refusing static config fallback/);
  });

  test('OrderExecutor entry plan uses active SessionRouter asset class for quantity units', () => {
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: stockRunnerScope(),
    });

    const plan = executor._buildEntryPlan({
      decision: { action: 'BUY', confidence: 88 },
      symbol: 'TSLA',
      price: 100,
      positionSize: 250,
      currentBalance: 10000,
      currentEquity: 10000,
      tradeConfidence: 0.88,
      confidenceMultiplier: 1,
      entryVolatility: 0.01,
      orchResult: {
        winnerStrategy: 'ScopeStrategy',
        sizingMultiplier: 1,
        exitContract: entryExitContract(),
        mtfConfluenceSnapshot: {
          direction: 'buy',
          confluenceScore: 0.35,
          confidence: 0.65,
          readyTimeframes: ['15m', '1h'],
          totalTimeframes: 4,
          shouldTrade: true,
          overallBias: 'bullish',
        },
      },
    });

    expect(plan).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '5m',
      quantityUnit: 'shares',
      orderQuantity: 2.5,
      frozenExitPolicy: expect.objectContaining({
        mtfConfluenceSnapshot: expect.objectContaining({
          available: true,
          entryDirection: 'long',
          direction: 'buy',
          alignment: 'aligned',
          score: 0.35,
          confidence: 0.65,
          readyTimeframes: ['15m', '1h'],
        }),
      }),
    }));
  });

  test('OrderExecutor refuses static account fallback when SessionRouter account identity is missing', () => {
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: missingAccountEnabledRouterScope(),
    });

    expect(() => executor._buildEntryPlan({
      decision: { action: 'BUY', confidence: 88 },
      symbol: 'TSLA',
      price: 100,
      positionSize: 250,
      currentBalance: 10000,
      currentEquity: 10000,
      tradeConfidence: 0.88,
      confidenceMultiplier: 1,
      entryVolatility: 0.01,
      orchResult: {
        winnerStrategy: 'ScopeStrategy',
        sizingMultiplier: 1,
        exitContract: entryExitContract(),
      },
    })).toThrow(/accountId/);
  });

  test('OrderExecutor dashboard trade payload fallback uses active SessionRouter scope', () => {
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: stockRunnerScope(),
    });

    const payload = executor._dashboardTradePayload({ symbol: 'TSLA', action: 'BUY' }, {});

    expect(payload).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '5m',
      scopeComplete: false,
    }));
  });

  test('OrderExecutor refuses static config fallback when SessionRouter scope is incomplete', () => {
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: incompleteEnabledRouterScope(),
    });

    expect(() => executor._buildEntryPlan({
      decision: { action: 'BUY', confidence: 88 },
      symbol: 'TSLA',
      price: 100,
      positionSize: 250,
      currentBalance: 10000,
      currentEquity: 10000,
      tradeConfidence: 0.88,
      confidenceMultiplier: 1,
      entryVolatility: 0.01,
      orchResult: {
        winnerStrategy: 'ScopeStrategy',
        sizingMultiplier: 1,
        exitContract: entryExitContract(),
      },
    })).toThrow(/refusing static config fallback/);
  });

  test('OrderExecutor dashboard trade payload does not complete trade records from current router scope', () => {
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: stockRunnerScope(),
    });

    const payload = executor._dashboardTradePayload({ action: 'BUY' }, {
      id: 'BUY_1',
      orderId: 'BUY_1',
      symbol: 'TSLA',
      action: 'BUY',
    });

    expect(payload).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: null,
      assetClass: null,
      executionMode: null,
      timeframe: null,
      scopeComplete: false,
    }));
  });

  test('OrderExecutor dashboard trade broadcast uses socket readiness instead of stale connected flag', () => {
    const send = jest.fn();
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      dashboardWs: { readyState: 1, send },
      dashboardWsConnected: false,
    });

    const sent = executor._broadcastDashboardTrade({
      action: 'SELL',
      direction: 'long',
      symbol: 'BTC-USD',
      price: 101,
      pnl: 12.5,
      timestamp: 123456,
      confidence: 88,
    }, {
      orderId: 'ORDER-1',
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '1m',
      scopeKey: 'paper:kraken:acct-main:crypto:BTC-USD:1m',
      exitReason: 'take_profit',
      entryStrategy: 'MADynamicSR',
      sizeUsd: 250,
      entryPrice: 99,
    });

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const frame = JSON.parse(send.mock.calls[0][0]);
    expect(frame).toEqual(expect.objectContaining({
      type: 'trade',
      action: 'SELL',
      direction: 'long',
      tradeId: 'ORDER-1',
      orderId: 'ORDER-1',
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      accountId: 'acct-main',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '1m',
      scopeComplete: true,
      exitReason: 'take_profit',
      strategy: 'MADynamicSR',
      strategyName: 'MADynamicSR',
      sizeUsd: 250,
      entryPrice: 99,
    }));
  });

  test('OrderExecutor dashboard trade broadcast catches socket send failures', () => {
    const send = jest.fn(() => {
      throw new Error('socket closed during trade emit');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      dashboardWs: { readyState: 1, send },
      dashboardWsConnected: true,
    });

    const sent = executor._broadcastDashboardTrade({
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      price: 100,
      pnl: 0,
      timestamp: 123456,
      confidence: 75,
    }, { orderId: 'ORDER-2', symbol: 'TSLA' });

    expect(sent).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('[OrderExecutor] dashboard trade broadcast failed: socket closed during trade emit');
    errorSpy.mockRestore();
  });

  test('OrderExecutor dashboard trade broadcast logs inconsistent connected socket state', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      dashboardWs: null,
      dashboardWsConnected: true,
    });

    expect(executor._broadcastDashboardTrade({
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      price: 100,
      pnl: 0,
      timestamp: 123456,
      confidence: 75,
    }, { orderId: 'ORDER-3', symbol: 'TSLA' })).toBe(false);

    expect(warnSpy).toHaveBeenCalledWith('[OrderExecutor] dashboard trade broadcast skipped: socket missing');
    warnSpy.mockRestore();
  });

  test('OrderExecutor dashboard trade broadcast logs missing live socket even when connected flag is false', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      dashboardWs: null,
      dashboardWsConnected: false,
    });

    expect(executor._broadcastDashboardTrade({
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      price: 100,
      pnl: 0,
      timestamp: 123456,
      confidence: 75,
    }, { orderId: 'ORDER-4', symbol: 'TSLA' })).toBe(false);

    expect(warnSpy).toHaveBeenCalledWith('[OrderExecutor] dashboard trade broadcast skipped: socket missing');
    warnSpy.mockRestore();
  });

  test('OrderExecutor dashboard trade broadcast does not warn for missing backtest dashboard socket', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const executor = new OrderExecutor({
      config: { ...staleCryptoConfig, enableBacktestMode: true },
      candleTimeframe: '1m',
      dashboardWs: null,
      dashboardWsConnected: false,
    });

    expect(executor._broadcastDashboardTrade({
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      price: 100,
      pnl: 0,
      timestamp: 123456,
      confidence: 75,
    }, { orderId: 'ORDER-BACKTEST', symbol: 'TSLA' })).toBe(false);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('OrderExecutor dashboard trade broadcast logs non-open socket state', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      dashboardWs: { readyState: 3, send: jest.fn() },
      dashboardWsConnected: false,
    });

    expect(executor._broadcastDashboardTrade({
      action: 'SELL',
      direction: 'long',
      symbol: 'TSLA',
      price: 100,
      pnl: 5,
      timestamp: 123456,
      confidence: 75,
    }, { orderId: 'ORDER-5', symbol: 'TSLA' })).toBe(false);

    expect(warnSpy).toHaveBeenCalledWith('[OrderExecutor] dashboard trade broadcast skipped: socket not open readyState=3');
    warnSpy.mockRestore();
  });

  test('OrderExecutor dashboard trade broadcast rejects symbol mismatch without changing execution path', () => {
    const send = jest.fn();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      dashboardWs: { readyState: 1, send },
      dashboardWsConnected: true,
    });

    expect(executor._broadcastDashboardTrade({
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      price: 100,
      pnl: 0,
      timestamp: 123456,
      confidence: 75,
    }, { orderId: 'ORDER-6', symbol: 'BTC-USD' })).toBe(false);

    expect(send).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[OrderExecutor] dashboard trade frame build failed: dashboard trade symbol mismatch orderId=ORDER-6 payload=TSLA trade=BTC-USD'
    );
    errorSpy.mockRestore();
  });

  test('OrderExecutor dashboard trade broadcast rejects orderId mismatch without emitting telemetry', () => {
    const send = jest.fn();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      dashboardWs: { readyState: 1, send },
      dashboardWsConnected: true,
    });

    expect(executor._broadcastDashboardTrade({
      action: 'SELL',
      direction: 'long',
      symbol: 'TSLA',
      orderId: 'ORDER-PAYLOAD',
      price: 100,
      pnl: 5,
      timestamp: 123456,
      confidence: 75,
    }, { orderId: 'ORDER-TRADE', symbol: 'TSLA' })).toBe(false);

    expect(send).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[OrderExecutor] dashboard trade frame build failed: dashboard trade orderId mismatch payload=ORDER-PAYLOAD trade=ORDER-TRADE'
    );
    errorSpy.mockRestore();
  });

  test('OrderExecutor exit plan trusts stored trade scope over current router scope', () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_1',
      orderId: 'BUY_1',
      action: 'BUY',
      sizeUsd: 250,
      entryTime: 1000,
      remainingOrderQuantity: 2,
      remainingOrderQuantityUnit: 'shares',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
    }]);
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: cryptoRunnerScope(),
    });

    const plan = executor._buildExitPlan({
      decision: { action: 'SELL', traceId: 'trace-1', signalId: 'signal-1' },
      symbol: 'TSLA',
      price: 110,
    });

    expect(plan).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
      quantityUnit: 'shares',
      orderQuantity: 2,
      tradeId: 'BUY_1',
    }));
  });

  test('OrderExecutor exit plan rejects stored trades with incomplete scope', () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_1',
      orderId: 'BUY_1',
      action: 'BUY',
      sizeUsd: 250,
      entryTime: 1000,
      remainingOrderQuantity: 2,
      remainingOrderQuantityUnit: 'shares',
      entryOrderQuantityUnit: 'shares',
    }]);
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner: stockRunnerScope(),
    });

    expect(() => executor._buildExitPlan({
      decision: { action: 'SELL', traceId: 'trace-1', signalId: 'signal-1' },
      symbol: 'TSLA',
      price: 110,
    })).toThrow(/missing immutable scope field/);
  });

  test('broker ack frame keeps dispatch-time scope if SessionRouter flips before webhook resolves', async () => {
    let activeSession = 'stocks';
    const runner = {
      getCandleScopeEnvelope: jest.fn(() => (
        activeSession === 'stocks'
          ? {
              brokerId: 'alpaca',
              accountId: 'acct-main',
              accountIdSource: 'config',
              assetClass: 'stocks',
              executionMode: 'paper',
            }
          : {
              brokerId: 'kraken',
              accountId: 'acct-main',
              accountIdSource: 'config',
              assetClass: 'crypto',
              executionMode: 'paper',
            }
      )),
    };
    const sentFrames = [];
    const executor = new OrderExecutor({
      config: staleCryptoConfig,
      candleTimeframe: '1m',
      runner,
      dashboardWs: {
        readyState: 1,
        send: (payload) => sentFrames.push(JSON.parse(payload)),
      },
      webhookAdapter: {
        emit: jest.fn(() => {
          activeSession = 'crypto';
          return Promise.resolve({
            sent: true,
            orderId: 'ACK_1',
            response: { status: 200 },
          });
        }),
      },
    });

    await executor._emitWebhookOrder('BUY', {
      action: 'buy',
      symbol: 'TSLA',
      quantity: 2,
      quantityUnit: 'shares',
      orderType: 'market',
    }, {
      traceId: 'trace-1',
      signalId: 'signal-1',
      decisionId: 'decision-1',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
    });

    expect(sentFrames).toHaveLength(1);
    expect(sentFrames[0]).toEqual(expect.objectContaining({
      type: 'broker_ack',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
    }));
    expect(sentFrames[0].data).toEqual(expect.objectContaining({
      brokerId: 'alpaca',
      accountId: 'acct-main',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
    }));
  });
});
