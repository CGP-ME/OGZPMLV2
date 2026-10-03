'use strict';

const TEST_ENV_DEFAULTS = Object.freeze({
  ALPACA_API_KEY: 'test-alpaca-key',
  ALPACA_API_SECRET: 'test-alpaca-secret',
  ALPACA_MODE: 'paper',
  BROKER: 'alpaca',
  EXECUTION_MODE: 'paper',
  PAPER_TRADING: 'true',
  LIVE_TRADING: 'false',
  CONFIRM_LIVE_TRADING: 'false',
});

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  process.env[key] = value;
}

const mockStateManager = {
  getTradesBySymbol: jest.fn(() => []),
  get: jest.fn((key) => {
    if (key === 'position') return 0;
    if (key === 'initialBalance') return 10000;
    return null;
  }),
  getEquity: jest.fn(() => 10000),
  getLastPrice: jest.fn(() => null),
  isHalted: jest.fn(() => false),
  getHaltReason: jest.fn(() => null),
  isSymbolHalted: jest.fn(() => false),
  getSymbolHaltReason: jest.fn(() => null),
};

const mockExitContractManager = {
  updateMaxProfit: jest.fn(),
  checkExitConditions: jest.fn(() => ({ shouldExit: false })),
};

const mockDecisionAutopsyLogger = {
  writeAutopsy: jest.fn(() => true),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

jest.mock('../core/ExitContractManager', () => ({
  getInstance: () => mockExitContractManager,
}));

jest.mock('../core/DecisionAutopsyLogger', () => mockDecisionAutopsyLogger);

const TradingLoop = require('../core/TradingLoop');
const ConfigLoader = require('../foundation/ConfigLoader');
const { getNarrator } = require('../core/TradeNarrator');

function candles(count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    time: 1700000000000 + i * 60000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  }));
}

function baseEntryContext(overrides = {}) {
  return {
    priceHistory: candles(),
    marketData: {
      symbol: 'TSLA',
      price: 100,
      timestamp: 1700000000000,
      volume: 1000,
    },
    config: {
      minTradeConfidence: 0.5,
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      timeframe: '15m',
      executionMode: 'paper',
      enableBacktestMode: false,
      evalTraceEnabled: false,
      traceEventMaxBufferedBytes: 1048576,
    },
    strategyOrchestrator: {
      strategies: [{ name: 'RSI' }],
      evaluate: jest.fn(() => ({
        direction: 'buy',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'buy', confidence: 0.8, reason: 'test signal' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      })),
    },
    executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'ORDER_TRACE_1' }),
    broadcastPatternAnalysis: jest.fn(),
    dashboardWs: { readyState: 1, bufferedAmount: 0, send: jest.fn() },
    ...overrides,
  };
}

function stubGatherData(loop) {
  loop._gatherData = jest.fn(() => ({
    indicators: {
      rsi: 55,
      macd: {},
      trend: 'sideways',
      atr: 1,
      ema20: 100,
      ema50: 100,
    },
    patterns: [],
    regime: { currentRegime: 'sideways' },
    tpoResult: null,
    fibLevels: null,
    nearestFibLevel: null,
    nearestStructure: null,
  }));
  loop._runTRAI = jest.fn();
}

function sentFrames(ctx) {
  return ctx.dashboardWs.send.mock.calls.map(call => JSON.parse(call[0]));
}

function mockDirectionConfig({ directionFilter = 'both' } = {}) {
  const originalGet = ConfigLoader.get.bind(ConfigLoader);
  return jest.spyOn(ConfigLoader, 'get').mockImplementation((key, defaultValue) => {
    if (key === 'pipeline.directionFilter') return directionFilter;
    return originalGet(key, defaultValue);
  });
}

describe('TradingLoop exit balance independence', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  test('evaluates and executes exit-only stops without account balance inputs', async () => {
    mockDecisionAutopsyLogger.writeAutopsy.mockReturnValue({ success: true, persisted: true });
    mockStateManager.get.mockImplementation((key) => key === 'position' ? 0 : undefined);
    mockStateManager.getEquity.mockImplementation(() => { throw new Error('obsolete equity read'); });
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_FRESH_PRICE_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_STOP_1',
      orderId: 'BUY_STOP_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);
    mockStateManager.getLastPrice.mockReturnValue(98.9);
    mockExitContractManager.checkExitConditions.mockImplementation((_trade, currentPrice, context) => ({
      shouldExit: currentPrice <= 99,
      exitReason: currentPrice <= 99 ? 'stop_loss' : undefined,
      confidence: 100,
      details: `fresh price ${currentPrice}`,
      contextPriceSource: context.priceSource,
    }));

    const ctx = {
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 100.2,
        timestamp: 1700000000000,
        volume: 1000,
        timeframe: '15m',
        priceSource: 'active_timeframe',
      },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: {
            enabled: true,
            maxPositionProfitRatio: 0.30,
            profitTargetDollars: 3000,
          },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await loop._checkExitsOnly('TSLA');

    expect(mockExitContractManager.checkExitConditions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'BUY_STOP_1' }),
      98.9,
      expect.objectContaining({
        currentPrice: 98.9,
        priceSource: 'state_last_price',
      })
    );
    expect(mockStateManager.getEquity).not.toHaveBeenCalled();
    expect(mockStateManager.get).not.toHaveBeenCalledWith('initialBalance');
    const exitContext = mockExitContractManager.checkExitConditions.mock.calls[0][2];
    expect(exitContext).not.toHaveProperty('accountBalance');
    expect(exitContext).not.toHaveProperty('initialBalance');
    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      positionEffect: 'close_long',
      exitReason: 'stop_loss',
      tradeId: 'BUY_STOP_1',
    }));
    expect(executeTrade.mock.calls[0][0]).not.toHaveProperty('direction');
    expect(executeTrade.mock.calls[0][2]).toBe(98.9);
  });

  test('candle evaluation executes an exit without obsolete balance reads', async () => {
    mockDecisionAutopsyLogger.writeAutopsy.mockReturnValue({ success: true, persisted: true });
    mockStateManager.get.mockImplementation((key) => key === 'position' ? 0 : undefined);
    mockStateManager.getEquity.mockImplementation(() => { throw new Error('obsolete equity read'); });
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext({
        executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'SEQ_REVERSAL' }),
      });
      ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
        direction: 'sell',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'sell', confidence: 0.8, reason: 'short setup' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1, useStructuralExits: false, maxConcurrentEntries: 1, scaleIn: { enabled: false } },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      }));
      const openLong = {
        id: 'LONG_TO_EXIT_1',
        orderId: 'LONG_TO_EXIT_1',
        action: 'BUY',
        direction: 'long',
        symbol: 'TSLA',
        entryPrice: 100,
        entryTime: Date.now() - 60000,
      };
      mockStateManager.getTradesBySymbol.mockReturnValueOnce([openLong]);
      mockExitContractManager.checkExitConditions.mockReturnValueOnce({
        shouldExit: true,
        exitReason: 'stop_loss',
        confidence: 100,
        details: 'contract closed long',
      });
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await loop._analyze('TSLA', 'trace_sequence_exit_1');
      expect(ctx.executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
        action: 'SELL',
        tradeId: 'LONG_TO_EXIT_1',
      }));

      expect(mockStateManager.getEquity).not.toHaveBeenCalled();
      expect(mockStateManager.get).not.toHaveBeenCalledWith('initialBalance');
      const exitContext = mockExitContractManager.checkExitConditions.mock.calls[0][2];
      expect(exitContext).not.toHaveProperty('accountBalance');
      expect(exitContext).not.toHaveProperty('initialBalance');
    } finally { configSpy.mockRestore(); }
  });
});
