'use strict';

const mockStateManager = {};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

jest.mock('../core/MaxProfitManager', () => jest.fn());

jest.mock('../ogz-meta/claudito-logger', () => ({
  TradingProofLogger: {
    trade: jest.fn(),
    explanation: jest.fn(),
  },
}));

const OrderExecutor = require('../core/OrderExecutor');
const TRAICore = require('../core/trai_core');
const TRAIDecisionModule = require('../core/TRAIDecisionModule');

function makeExecutor() {
  return new OrderExecutor({
    config: {
      brokerId: 'alpaca',
      accountId: 'paper-account',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      enableBacktestMode: false,
    },
    maxProfitManagers: new Map(),
  });
}

function makeTraiCoreWithRecorder() {
  const core = Object.create(TRAICore.prototype);
  core.patternMemory = {
    recordOutcome: jest.fn(() => true),
  };
  return core;
}

describe('OrderExecutor TRAI learning payload', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('threads macdSignal and bbWidth into the payload TRAI needs to record an outcome', () => {
    const executor = makeExecutor();
    const indicators = executor._buildTraiLearningIndicators({
      entryIndicators: {
        rsi: 52,
        macd: { macd: 1.25, signal: 1.1, histogram: 0.15 },
        bbWidth: 0.045,
      },
      patterns: [{ name: 'ema-cross' }],
    });

    expect(indicators).toEqual({
      rsi: 52,
      macd: 1.25,
      macdSignal: 1.1,
      macdHistogram: 0.15,
      bbWidth: 0.045,
      primaryPattern: 'ema-cross',
    });

    const trai = makeTraiCoreWithRecorder();
    const recorded = trai.recordTradeResult({
      entry: {
        indicators,
        trend: 'uptrend',
        volatility: 0.02,
      },
      profitLoss: 12.5,
      profitLossPercent: 0.8,
      holdDuration: 900000,
      exitReason: 'take_profit',
      strategy: 'EMASMACrossover',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
    });

    expect(recorded).toBe(true);
    expect(trai.patternMemory.recordOutcome).toHaveBeenCalledTimes(1);
    expect(trai.patternMemory.recordOutcome.mock.calls[0][0]).toEqual([
      0.52,
      0.1499999999999999,
      1,
      0.045,
      0.02,
      0.5,
      0,
      0,
      0,
    ]);
    expect(trai.patternMemory.recordOutcome.mock.calls[0][1]).toEqual(expect.objectContaining({
      pnl: 12.5,
      pnlPercent: 0.8,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'EMASMACrossover',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
    }));
  });

  test('does not fabricate missing TRAI learning fields', () => {
    const executor = makeExecutor();
    const indicators = executor._buildTraiLearningIndicators({
      entryIndicators: {
        rsi: 52,
        macd: { macd: 1.25 },
      },
      patterns: [{ name: 'ema-cross' }],
    });

    expect(indicators.macdSignal).toBeNull();
    expect(indicators.bbWidth).toBeNull();

    const trai = makeTraiCoreWithRecorder();
    const recorded = trai.recordTradeResult({
      entry: {
        indicators,
        trend: 'uptrend',
        volatility: 0.02,
      },
      profitLoss: 12.5,
      profitLossPercent: 0.8,
      holdDuration: 900000,
      exitReason: 'take_profit',
      strategy: 'EMASMACrossover',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
    });

    expect(recorded).toBe(false);
    expect(trai.patternMemory.recordOutcome).not.toHaveBeenCalled();
  });

  test('pattern outcome rejection reports unhealthy on the next health check', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const executor = makeExecutor();
    executor.ctx.patternChecker = {
      recordPatternResult: jest.fn(),
      memory: {
        healthCheck: jest.fn(() => ({
          healthy: true,
          issues: [],
          total: 1,
          totalOutcomes: 1,
        })),
      },
    };

    try {
      const recorded = executor._recordClosedTradePatternOutcome({
        orderId: 'trade-missing-strategy',
        patterns: [{ name: 'ema-cross', features: [0.5, 0.1] }],
        entryStrategy: null,
        strategy: null,
        symbol: 'TSLA',
        brokerId: 'alpaca',
        accountId: 'paper-account',
        accountIdSource: 'test',
        assetClass: 'stocks',
        executionMode: 'paper',
        timeframe: '15m',
        scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
      }, {
        exitReason: 'take_profit',
      }, 1.2, 900000);

      expect(recorded).toBe(false);
      expect(executor.ctx.patternChecker.recordPatternResult).not.toHaveBeenCalled();
      const health = executor._checkPatternOutcomeHealth();
      expect(health).toEqual(expect.objectContaining({
        healthy: false,
      }));
      expect(health.issues).toContain('1 pattern outcome recording rejection(s) since last health check');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('PATTERN SYSTEM UNHEALTHY'));
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test('TRAI core fails closed when trend or volatility is missing', () => {
    const completeIndicators = {
      rsi: 52,
      macd: 1.25,
      macdSignal: 1.1,
      macdHistogram: 0.15,
      bbWidth: 0.045,
      primaryPattern: 'ema-cross',
    };

    const missingVolatility = makeTraiCoreWithRecorder();
    expect(missingVolatility.recordTradeResult({
      entry: {
        indicators: completeIndicators,
        trend: 'uptrend',
        volatility: null,
      },
      profitLoss: 12.5,
      profitLossPercent: 0.8,
      holdDuration: 900000,
      exitReason: 'take_profit',
      strategy: 'EMASMACrossover',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
    })).toBe(false);
    expect(missingVolatility.patternMemory.recordOutcome).not.toHaveBeenCalled();

    const missingTrend = makeTraiCoreWithRecorder();
    expect(missingTrend.recordTradeResult({
      entry: {
        indicators: completeIndicators,
        trend: null,
        volatility: 0.02,
      },
      profitLoss: 12.5,
      profitLossPercent: 0.8,
      holdDuration: 900000,
      exitReason: 'take_profit',
      strategy: 'EMASMACrossover',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
    })).toBe(false);
    expect(missingTrend.patternMemory.recordOutcome).not.toHaveBeenCalled();
  });

  test('TRAI wrapper returns false when core skips the outcome', () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.traiCore = {
      recordTradeResult: jest.fn(() => false),
    };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const recorded = module.recordTradeOutcome({
      tradeId: 'TRADE_SKIPPED_1',
      profitLoss: 1,
      profitLossPercent: 0.1,
    });

    expect(recorded).toBe(false);
    expect(module.traiCore.recordTradeResult).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped trade outcome learning'));

    warnSpy.mockRestore();
  });

  test('TRAI core fails closed instead of defaulting missing outcome metadata', () => {
    const completeIndicators = {
      rsi: 52,
      macd: 1.25,
      macdSignal: 1.1,
      macdHistogram: 0.15,
      bbWidth: 0.045,
      primaryPattern: 'ema-cross',
    };

    const missingPercent = makeTraiCoreWithRecorder();
    expect(missingPercent.recordTradeResult({
      entry: {
        indicators: completeIndicators,
        trend: 'uptrend',
        volatility: 0.02,
      },
      profitLoss: 12.5,
      holdDuration: 900000,
      exitReason: 'take_profit',
      strategy: 'EMASMACrossover',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
    })).toBe(false);
    expect(missingPercent.patternMemory.recordOutcome).not.toHaveBeenCalled();

    const missingStrategy = makeTraiCoreWithRecorder();
    expect(missingStrategy.recordTradeResult({
      entry: {
        indicators: completeIndicators,
        trend: 'uptrend',
        volatility: 0.02,
      },
      profitLoss: 12.5,
      profitLossPercent: 0.8,
      holdDuration: 900000,
      exitReason: 'take_profit',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      accountIdSource: 'test',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-account:stocks:TSLA:15m',
    })).toBe(false);
    expect(missingStrategy.patternMemory.recordOutcome).not.toHaveBeenCalled();
  });

  test('TRAI indicator builder accepts nested stored MACD and Bollinger fields without defaults', () => {
    const executor = makeExecutor();
    const indicators = executor._buildTraiLearningIndicators({
      indicators: {
        rsi: 48,
        macd: { macd: -0.4, signalLine: -0.55, hist: 0.15 },
        bb: { width: 0.038 },
      },
    });

    expect(indicators).toEqual({
      rsi: 48,
      macd: -0.4,
      macdSignal: -0.55,
      macdHistogram: 0.15,
      bbWidth: 0.038,
      primaryPattern: null,
    });
  });

  test('TRAI decision pattern lookup features fail closed instead of using phantom indicators', () => {
    const module = Object.create(TRAIDecisionModule.prototype);

    expect(module._extractPatternMemoryFeatures({
      indicators: {
        rsi: 52,
        macd: { macd: 1.25 },
        bbWidth: 0.045,
      },
      trend: 'uptrend',
      volatility: 0.02,
    })).toBeNull();

    expect(module._extractPatternMemoryFeatures({
      indicators: {
        rsi: 52,
        macd: { macd: 1.25, signal: 1.1 },
        bbWidth: 0.045,
      },
      trend: 'uptrend',
      volatility: 0.02,
    })).toEqual([
      0.52,
      0.1499999999999999,
      1,
      0.045,
      0.02,
      0.5,
      0,
      0,
      0,
    ]);
  });

  test('TRAI market analysis and risk assessment do not invent volatility or position size', async () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.config = {
      maxRiskTolerance: 999,
      emergencyStopLoss: 0.05,
    };

    const analysis = await module.analyzeMarketConditions({
      indicators: {
        rsi: 50,
        macd: { histogram: 0.1 },
      },
    });
    expect(analysis.volatility).toBeNull();
    expect(analysis.trend).toBeNull();
    expect(analysis.risk).toBe('unknown');

    const missingPosition = await module.assessRisk({ stopLossPercent: 0.01 }, {
      volatility: 0.02,
    }, 0.8);
    expect(missingPosition.approved).toBe(false);
    expect(missingPosition.vetoReason).toBe('Missing finite positionSize for TRAI risk assessment');
    expect(missingPosition.factors).toContain('missing_position_size');

    const missingVolatility = await module.assessRisk({ stopLossPercent: 0.01 }, {
      positionSize: 100,
    }, 0.8);
    expect(missingVolatility.approved).toBe(false);
    expect(missingVolatility.vetoReason).toBe('Missing finite volatility for TRAI risk assessment');
    expect(missingVolatility.factors).toContain('missing_volatility');
  });

  test('TRAI legacy pattern key skips incomplete context instead of using unknown or neutral', () => {
    const module = Object.create(TRAIDecisionModule.prototype);

    expect(module.generatePatternKey({ patterns: [{ name: 'ema-cross' }] }, {
      regime: 'bull',
    })).toBeNull();
    expect(module.generatePatternKey({ patterns: [] }, {
      regime: 'bull',
      trend: 'uptrend',
    })).toBeNull();
    expect(module.generatePatternKey({ patterns: [{ name: 'ema-cross' }] }, {
      regime: 'bull',
      trend: 'uptrend',
    })).toBe('ema-cross_bull_uptrend');
  });

  test('TRAI wrapper preserves successful alias-shaped outcomes', () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.traiCore = {
      recordTradeResult: jest.fn(() => true),
    };

    const recorded = module.recordTradeOutcome({
      tradeId: 'TRADE_RECORDED_ALIAS_1',
      pnl: 1.25,
      pnlPercent: 0.42,
    });

    expect(recorded).toBe(true);
    expect(module.traiCore.recordTradeResult).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[TRAI] Recorded trade outcome: WIN (0.42%)');
  });

  test('TRAI wrapper fails closed when core is unavailable', () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.traiCore = null;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(module.recordTradeOutcome({ tradeId: 'NO_CORE' })).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('[TRAI] Cannot record trade - TRAI Core not initialized');

    warnSpy.mockRestore();
  });
});
