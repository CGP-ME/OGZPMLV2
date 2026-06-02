'use strict';

const mockStateManager = {
  getTradesBySymbol: jest.fn(() => []),
  get: jest.fn((key) => {
    if (key === 'position') return 0;
    if (key === 'initialBalance') return 10000;
    return null;
  }),
  getEquity: jest.fn(() => 10000),
  isHalted: jest.fn(() => false),
  getHaltReason: jest.fn(() => null),
  isSymbolHalted: jest.fn(() => false),
  getSymbolHaltReason: jest.fn(() => null),
};

const mockExitContractManager = {
  updateMaxProfit: jest.fn(),
  checkExitConditions: jest.fn(() => ({ shouldExit: false })),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

jest.mock('../core/ExitContractManager', () => ({
  getInstance: () => mockExitContractManager,
}));

const TradingLoop = require('../core/TradingLoop');
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
    dashboardWs: { readyState: 1, send: jest.fn() },
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

describe('TradingLoop trace spine', () => {
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateManager.getTradesBySymbol.mockReturnValue([]);
    mockExitContractManager.checkExitConditions.mockReturnValue({ shouldExit: false });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('preserves the analysis trace id on the execution decision and ledger data', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'ORDER_TRACE_1' });
    const ctx = {
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
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      strategyOrchestrator: {
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
      executeTrade,
      broadcastPatternAnalysis: jest.fn(),
    };
    const loop = new TradingLoop(ctx);
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
    loop._broadcastDecision = jest.fn();

    await loop._analyze('TSLA', 'trace_fixed_1');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    const decision = executeTrade.mock.calls[0][0];
    expect(decision).toEqual(expect.objectContaining({
      action: 'BUY',
      traceId: 'trace_fixed_1',
      signalId: 'trace_fixed_1:signal',
    }));
    expect(decision.ledgerData).toEqual(expect.objectContaining({
      traceId: 'trace_fixed_1',
      signalId: 'trace_fixed_1:signal',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      timeframe: '15m',
      executionMode: 'paper',
    }));
    expect(decision.ledgerData.strategySignals[0].baseConfidence).toBe(0.8);
    expect(decision.ledgerData.orchestratorDecision.finalConfidence).toBe(0.8);
    expect(decision.ledgerData.orchestratorDecision.competingStrategies[0].adjustedConfidence).toBe(0.8);
  });

  test('rejects 0-100 strategy confidences before writing decision ledger evidence', async () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }],
        evaluate: jest.fn(() => ({
          direction: 'buy',
          confidence: 80,
          winnerStrategy: 'RSI',
          allResults: [{ strategyName: 'RSI', direction: 'buy', confidence: 80, reason: 'test signal' }],
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await expect(loop._analyze('TSLA', 'trace_bad_ledger_conf')).rejects.toThrow('allResults[0].confidence must be explicit 0..1');
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test('rejects executable decisions without strategy-result evidence', async () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }],
        evaluate: jest.fn(() => ({
          direction: 'buy',
          confidence: 80,
          winnerStrategy: 'RSI',
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await expect(loop._analyze('TSLA', 'trace_missing_all_results')).rejects.toThrow('orchResult.allResults missing or not an array');
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test('rejects executable decisions without winner strategy attribution', async () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }],
        evaluate: jest.fn(() => ({
          direction: 'buy',
          confidence: 80,
          allResults: [{ strategyName: 'RSI', direction: 'buy', confidence: 0.8, reason: 'test signal' }],
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await expect(loop._analyze('TSLA', 'trace_missing_winner')).rejects.toThrow('orchResult.winnerStrategy missing or blank');
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test('emits a scoped gate_event before approved trade execution', async () => {
    const ctx = baseEntryContext({
      executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'ORDER_GATE_PASS_1' }),
      riskManager: {
        isTradingAllowed: jest.fn(() => ({
          allowed: true,
          riskGates: [{ gate: 'daily_loss_limit', threshold: 500, value: 0, passed: true }],
        })),
        assessTradeRisk: jest.fn(() => ({
          approved: true,
          riskLevel: 'LOW',
          recommendation: 'standard',
          riskGates: [{ gate: 'max_drawdown', threshold: 1000, value: 0, passed: true }],
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    const gateNarratorSpy = jest.spyOn(getNarrator(), 'gateDecision').mockImplementation(() => {});
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_gate_pass_1');

    expect(ctx.executeTrade).toHaveBeenCalledTimes(1);
    const gateEvent = sentFrames(ctx).find(frame => frame.type === 'gate_event');
    expect(gateEvent).toEqual(expect.objectContaining({
      traceId: 'trace_gate_pass_1',
      signalId: 'trace_gate_pass_1:signal',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      action: 'BUY',
      kind: 'eval_pass',
      passed: true,
    }));
    expect(gateEvent.riskGates.map(g => g.gate)).toEqual(expect.arrayContaining([
      'warmup',
      'min_confidence',
      'direction_filter',
      'same_direction_block',
      'max_positions',
      'daily_loss_limit',
      'max_drawdown',
    ]));
    expect(gateNarratorSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gate_event',
      symbol: 'TSLA',
      kind: 'eval_pass',
      passed: true,
    }));
    gateNarratorSpy.mockRestore();
  });

  test('emits a scoped risk_block gate_event without executing when RiskManager blocks', async () => {
    const ctx = baseEntryContext({
      executeTrade: jest.fn(),
      riskManager: {
        isTradingAllowed: jest.fn(() => ({
          allowed: false,
          reason: 'Daily loss limit',
          riskGates: [{ gate: 'daily_loss_limit', threshold: 500, value: 750, passed: false, rejectReason: 'Daily loss limit' }],
        })),
        assessTradeRisk: jest.fn(),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_gate_block_1');

    expect(ctx.executeTrade).not.toHaveBeenCalled();
    expect(ctx.riskManager.assessTradeRisk).not.toHaveBeenCalled();
    const frames = sentFrames(ctx);
    const gateEvent = frames.find(frame => frame.type === 'gate_event');
    expect(gateEvent).toEqual(expect.objectContaining({
      traceId: 'trace_gate_block_1',
      signalId: 'trace_gate_block_1:signal',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      action: 'HOLD',
      kind: 'risk_block',
      passed: false,
      reason: 'Daily loss limit',
    }));
    expect(gateEvent.riskGates).toEqual([
      { gate: 'daily_loss_limit', threshold: 500, value: 750, passed: false, rejectReason: 'Daily loss limit' },
    ]);
    expect(frames.find(frame => frame.type === 'bot_thinking')).toEqual(expect.objectContaining({
      message: 'Blocked: Daily loss limit',
      asset: 'TSLA',
      data: expect.objectContaining({
        indicators: {
          rsi: 55,
          atr: 1,
          macd: null,
          macdSignal: null,
          macdHistogram: null,
          volume: 1000,
        }
      })
    }));
  });

  test('does not emit entry gate_event frames for exit decisions', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_GATE_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_GATE_EXIT_1',
      orderId: 'BUY_GATE_EXIT_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = baseEntryContext({
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 190,
        timestamp: 1700000000000,
        volume: 1000,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      strategyOrchestrator: {
        strategies: [],
        evaluate: jest.fn(() => ({
          direction: 'hold',
          confidence: 0,
          winnerStrategy: null,
          allResults: [],
          confluence: { count: 0, strategies: [] },
          sizingMultiplier: 1,
        })),
      },
      executeTrade,
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_gate_exit_1');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_GATE_EXIT_1',
    }));
    expect(executeTrade.mock.calls[0][0].ledgerData).toBeUndefined();
    expect(sentFrames(ctx).filter(frame => frame.type === 'gate_event')).toEqual([]);
  });

  test('applies the TTP consistency cap on the main candle exit path', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_MAIN_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_MAIN_1',
      orderId: 'BUY_MAIN_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = {
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 190,
        timestamp: 1700000000000,
        volume: 1000,
      },
      config: {
        minTradeConfidence: 0.5,
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
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      strategyOrchestrator: {
        evaluate: jest.fn(() => ({
          direction: 'hold',
          confidence: 0,
          winnerStrategy: null,
          allResults: [],
          confluence: { count: 0, strategies: [] },
          sizingMultiplier: 1,
        })),
      },
      maxProfitManagers: new Map(),
      executeTrade,
      broadcastPatternAnalysis: jest.fn(),
    };
    const loop = new TradingLoop(ctx);
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
    loop._broadcastDecision = jest.fn();

    await loop._analyze('TSLA', 'trace_consistency_main');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      direction: 'close',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_MAIN_1',
      traceId: 'trace_consistency_main',
      signalId: 'trace_consistency_main:exit',
    }));
    expect(executeTrade.mock.calls[0][0].ledgerData).toBeUndefined();
    expect(mockExitContractManager.checkExitConditions).not.toHaveBeenCalled();
  });

  test('main candle MaxProfitManager exits do not inherit zero hold confidence', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_MPM_MAIN_1' });
    const mpm = {
      state: { active: true },
      update: jest.fn(() => ({
        action: 'exit_full',
        exitSize: 1000,
        exitFraction: 1,
        reason: 'max_profit_exit',
      })),
    };
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_MPM_1',
      orderId: 'BUY_MPM_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = baseEntryContext({
      marketData: {
        symbol: 'TSLA',
        price: 101,
        timestamp: 1700000000000,
        volume: 1000,
      },
      strategyOrchestrator: {
        evaluate: jest.fn(() => ({
          direction: 'hold',
          confidence: 0,
          winnerStrategy: null,
          allResults: [],
          confluence: { count: 0, strategies: [] },
          sizingMultiplier: 1,
        })),
      },
      maxProfitManagers: new Map([['BUY_MPM_1', mpm]]),
      executeTrade,
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);
    loop._broadcastDecision = jest.fn();

    await loop._analyze('TSLA', 'trace_mpm_exit_zero_hold_conf');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      direction: 'close',
      confidence: 100,
      exitReason: 'max_profit_exit',
      tradeId: 'BUY_MPM_1',
    }));
    expect(executeTrade.mock.calls[0][0].ledgerData).toBeUndefined();
  });

  test('forces a TTP consistency exit when an open stock position reaches the configured profit cap', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_1',
      orderId: 'BUY_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = {
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 190,
        timestamp: 1700000000000,
        volume: 1000,
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
      maxProfitManagers: new Map(),
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await loop._checkExitsOnly('TSLA');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      direction: 'close',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_1',
    }));
    expect(mockExitContractManager.checkExitConditions).not.toHaveBeenCalled();
  });

  test('does not let a missing active-trade asset class bypass the TTP consistency cap in stock runtime', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_2' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_2',
      orderId: 'BUY_2',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = {
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
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
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      maxProfitManagers: new Map(),
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await loop._checkExitsOnly('TSLA');

    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_2',
    }));
  });

  test('forces a TTP consistency cover when a short position reaches the configured profit cap', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_SHORT_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'SHORT_1',
      orderId: 'SHORT_1',
      direction: 'SHORT',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 10, timestamp: 1700000000000, volume: 1000 },
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
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      maxProfitManagers: new Map(),
      executeTrade,
    });

    await loop._checkExitsOnly('TSLA');

    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'COVER',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'SHORT_1',
    }));
  });

  test('fails loud when runtime asset class is missing while TTP consistency rules are enabled', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_4',
      orderId: 'BUY_4',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      maxProfitManagers: new Map(),
      executeTrade: jest.fn(),
    });

    await expect(loop._checkExitsOnly('TSLA')).rejects.toThrow(/runtime assetClass missing/);
  });

  test('fails loud instead of filtering out a malformed active trade before TTP consistency evaluation', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'MALFORMED_1',
      orderId: 'MALFORMED_1',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
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
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      maxProfitManagers: new Map(),
      executeTrade: jest.fn(),
    });

    await expect(loop._checkExitsOnly('TSLA')).rejects.toThrow(/missing close side/);
  });

  test('fails loud when TTP consistency config is missing while TTP eval rules are enabled', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_3',
      orderId: 'BUY_3',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: { enabled: true, ttp: { enabled: true } },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      maxProfitManagers: new Map(),
      executeTrade: jest.fn(),
    });

    await expect(loop._checkExitsOnly('TSLA')).rejects.toThrow(/consistency rule disabled or missing/);
  });
});
