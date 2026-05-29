'use strict';

const mockStateManager = {
  getTradesBySymbol: jest.fn(),
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
      orchResult: {
        winnerStrategy: 'ScopeStrategy',
        sizingMultiplier: 1,
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
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
      orderQuantity: 2,
    }));
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
      orchResult: {
        winnerStrategy: 'ScopeStrategy',
        sizingMultiplier: 1,
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
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
