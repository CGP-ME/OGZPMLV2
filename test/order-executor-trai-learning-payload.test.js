'use strict';

const fs = require('fs');

const mockStateManager = {};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

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

  test('TRAI core records explicit entry feature vectors instead of rebuilding from indicators', () => {
    const trai = makeTraiCoreWithRecorder();
    const entryFeatures = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99];
    const recorded = trai.recordTradeResult({
      entry: {
        features: entryFeatures,
        indicators: {
          rsi: 99,
          macd: 9,
          macdSignal: 1,
          bbWidth: 0.9,
        },
        trend: 'downtrend',
        volatility: 0.9,
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
    expect(trai.patternMemory.recordOutcome.mock.calls[0][0]).toEqual(entryFeatures);
    expect(trai.patternMemory.recordOutcome.mock.calls[0][0]).not.toBe(entryFeatures);
  });

  test('TRAI core rejects invalid explicit entry feature vectors instead of falling back', () => {
    const trai = makeTraiCoreWithRecorder();
    const recorded = trai.recordTradeResult({
      entry: {
        features: [0.11, Number.NaN, 0.33],
        indicators: {
          rsi: 52,
          macd: 1.25,
          macdSignal: 1.1,
          bbWidth: 0.045,
        },
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

  test('OrderExecutor exposes only clean entry pattern feature vectors to TRAI learning', () => {
    const executor = makeExecutor();
    const entryFeatures = [0.11, 0.22, 0.33, 0.44, 0.55, 0.66, 0.77, 0.88, 0.99];

    expect(executor._entryPatternFeaturesForTrai({
      patterns: [
        { name: 'bad-pattern', features: [0.1, Infinity] },
        { name: 'ema-cross', features: entryFeatures },
      ],
    })).toEqual(entryFeatures);
    expect(executor._entryPatternFeaturesForTrai({
      patterns: [
        { name: 'bad-pattern', features: [0.1, Infinity] },
      ],
    })).toBeNull();
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
    expect(missingPosition.approved).toBe(true);
    expect(missingPosition.opinionOnly).toBe(true);
    expect(missingPosition.vetoReason).toBeNull();
    expect(missingPosition.factors).toContain('missing_position_size');

    const missingVolatility = await module.assessRisk({ stopLossPercent: 0.01 }, {
      positionSize: 100,
    }, 0.8);
    expect(missingVolatility.approved).toBe(true);
    expect(missingVolatility.opinionOnly).toBe(true);
    expect(missingVolatility.vetoReason).toBeNull();
    expect(missingVolatility.factors).toContain('missing_volatility');
  });

  test('TRAI legacy pattern key skips incomplete context instead of using unknown or neutral', () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    const scopedContext = {
      regime: 'bull',
      trend: 'uptrend',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'eval-58356',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    };

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
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    })).toBeNull();
    expect(module.generatePatternKey({ patterns: [{ name: 'ema-cross' }] }, scopedContext))
      .toBe('paper:alpaca:eval-58356:stocks:TSLA:15m|ema-cross_bull_uptrend');
  });

  test('TRAI local pattern memory cannot cross-read between scoped venue keys', () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.decisionHistory = [];
    module.patternMemory = new Map();
    const signal = { patterns: [{ name: 'ema-cross' }] };
    const stockContext = {
      regime: 'bull',
      trend: 'uptrend',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'eval-58356',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    };
    const cryptoContext = {
      ...stockContext,
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      assetClass: 'crypto',
    };

    const stockKey = module.generatePatternKey(signal, stockContext);
    const cryptoKey = module.generatePatternKey(signal, cryptoContext);

    expect(stockKey).not.toBe(cryptoKey);
    module.storeDecision({ id: 1 }, signal, stockContext);

    expect(module.patternMemory.has(stockKey)).toBe(true);
    expect(module.patternMemory.has(cryptoKey)).toBe(false);
  });

  test('TRAI decision store skips null pattern keys', () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.decisionHistory = [];
    module.patternMemory = new Map();

    module.storeDecision({ id: 1 }, {
      patterns: [],
    }, {
      regime: 'bull',
    });

    expect(module.decisionHistory).toHaveLength(1);
    expect(module.patternMemory.has(null)).toBe(false);
    expect(module.patternMemory.size).toBe(0);
  });

  test('OrderExecutor only attaches TRAI decisions that match the order scope', () => {
    const executor = makeExecutor();
    const now = 1700000000000;
    const matchingDecision = {
      id: 'TRAI_MATCH',
      createdAt: now - 500,
      mode: 'advisory',
      originalSignal: {
        symbol: 'TSLA',
        action: 'BUY',
      },
    };

    expect(executor._shouldStoreTraiDecisionForOrder(
      matchingDecision,
      { action: 'BUY' },
      'TSLA',
      now
    )).toBe(true);

    expect(executor._shouldStoreTraiDecisionForOrder(
      {
        ...matchingDecision,
        mode: 'passive',
      },
      { action: 'BUY' },
      'TSLA',
      now
    )).toBe(false);

    expect(executor._shouldStoreTraiDecisionForOrder(
      {
        ...matchingDecision,
        originalSignal: { symbol: 'NVDA', action: 'BUY' },
      },
      { action: 'BUY' },
      'TSLA',
      now
    )).toBe(false);

    expect(executor._shouldStoreTraiDecisionForOrder(
      {
        ...matchingDecision,
        originalSignal: { symbol: 'TSLA', action: 'SELL' },
      },
      { action: 'BUY' },
      'TSLA',
      now
    )).toBe(false);

    expect(executor._shouldStoreTraiDecisionForOrder(
      {
        ...matchingDecision,
        createdAt: now - 60001,
      },
      { action: 'BUY' },
      'TSLA',
      now
    )).toBe(false);
  });

  test('TRAI passive mode observes without execution adjustments or boost wording', async () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.config = {
      mode: 'passive',
      enableVetoPower: false,
      trackDecisions: false,
      minConfidenceOverride: 0.4,
      maxRiskTolerance: 999,
      emergencyStopLoss: 0.05,
    };
    module.state = { totalDecisions: 0 };
    module.decisionHistory = [];
    module.patternMemory = new Map();
    module.patternIntegration = {
      evaluate: jest.fn(() => ({
        matchedPatterns: [],
        matchedAntiPatterns: [],
        confidenceMultiplier: 1,
      })),
    };
    module.traiCore = null;
    module.emit = jest.fn();
    module.broadcastChainOfThought = jest.fn();
    const adjustSpy = jest.spyOn(module, 'calculateAdjustments');

    const decision = await module.processDecision({
      action: 'BUY',
      confidence: 0.62,
      patterns: [{ name: 'ema-cross' }],
      symbol: 'TSLA',
      timeframe: '15m',
    }, {
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      indicators: {
        rsi: 54,
        macd: { histogram: 0.1 },
      },
      trend: 'uptrend',
      volatility: 0.02,
      regime: 'trend',
      positionSize: 100,
      price: 100,
    });

    expect(decision.finalConfidence).toBe(0.62);
    expect(decision.adjustments).toEqual([]);
    expect(adjustSpy).not.toHaveBeenCalled();
    expect(decision.reasoning).toContain('TRAI observed');
    expect(decision.reasoning).not.toContain('TRAI +');

    adjustSpy.mockRestore();
  });

  test('TRAI normalizes percent confidence before passive reasoning', async () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.config = {
      mode: 'passive',
      enableVetoPower: false,
      trackDecisions: false,
      minConfidenceOverride: 0.4,
      maxRiskTolerance: 999,
      emergencyStopLoss: 0.05,
    };
    module.state = { totalDecisions: 0 };
    module.decisionHistory = [];
    module.patternMemory = new Map();
    module.patternIntegration = {
      evaluate: jest.fn(signal => {
        expect(signal.confidence).toBeCloseTo(0.85623);
        return {
          matchedPatterns: [],
          matchedAntiPatterns: [],
          confidenceMultiplier: 1,
        };
      }),
    };
    module.analyzeMarketConditions = jest.fn().mockResolvedValue({
      volatility: 2.326,
      trend: 'up trend',
      sentiment: 'neutral',
      risk: 'medium',
    });
    module.calculateConfidence = jest.fn(async signal => {
      expect(signal.confidence).toBeCloseTo(0.85623);
      return 0.83;
    });
    module.assessRisk = jest.fn().mockResolvedValue({
      riskScore: 1,
      approved: false,
      reasons: ['risk guard active'],
    });
    module.makeRecommendation = jest.fn(() => 'HOLD');
    module.storeDecision = jest.fn();
    module.logDecision = jest.fn();
    module.traiCore = null;
    module.emit = jest.fn();
    module.broadcastChainOfThought = jest.fn();

    expect(module.normalizeConfidence01('85.623%')).toBeCloseTo(0.85623);
    expect(module.normalizeConfidence01('0.5%')).toBeCloseTo(0.005);
    expect(module.normalizeConfidence01('8562.3%')).toBeNull();

    const decision = await module.processDecision({
      action: 'HOLD',
      confidence: '85.623%',
      patterns: [],
      symbol: 'TSLA',
      timeframe: '15m',
    }, {
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      assetClass: 'stocks',
      executionMode: 'paper',
      indicators: { rsi: 81.5 },
      trend: 'up',
      volatility: 2.326,
      price: 380,
      positionSize: 100,
    });

    expect(decision.originalConfidence).toBeCloseTo(0.85623);
    expect(decision.confidenceInputInvalid).toBe(false);
    expect(decision.finalConfidence).toBeCloseTo(0.85623);
    expect(decision.reasoning).toContain('Holding: 85.6% confidence');
    expect(decision.reasoning).toContain('base 85.6%');
    expect(decision.reasoning).toContain('TRAI observed 83.0%');
    expect(decision.reasoning).not.toContain('8562.3%');
    expect(module.storeDecision.mock.calls[0][1].confidence).toBeCloseTo(0.85623);
  });

  test('TRAI fails closed and labels impossible confidence inputs', async () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.config = {
      mode: 'advisory',
      confidenceWeight: 0.3,
      enableVetoPower: false,
      trackDecisions: false,
      minConfidenceOverride: 0.4,
      maxRiskTolerance: 999,
      emergencyStopLoss: 0.05,
    };
    module.state = { totalDecisions: 0 };
    module.decisionHistory = [];
    module.patternMemory = new Map();
    module.patternIntegration = {
      evaluate: jest.fn(signal => {
        expect(signal.confidence).toBe(0);
        return {
          matchedPatterns: [],
          matchedAntiPatterns: [],
          confidenceMultiplier: 1,
        };
      }),
    };
    module.analyzeMarketConditions = jest.fn().mockResolvedValue({
      volatility: 0.01,
      trend: 'up trend',
      sentiment: 'neutral',
      risk: 'low',
    });
    module.calculateConfidence = jest.fn(async () => 0.83);
    module.assessRisk = jest.fn().mockResolvedValue({
      riskScore: 0.1,
      approved: true,
      factors: [],
    });
    module.makeRecommendation = jest.fn(() => 'BUY');
    module.storeDecision = jest.fn();
    module.logDecision = jest.fn();
    module.traiCore = null;
    module.emit = jest.fn();
    module.broadcastChainOfThought = jest.fn();

    const decision = await module.processDecision({
      action: 'BUY',
      confidence: '8562.3%',
      patterns: [],
      symbol: 'TSLA',
      timeframe: '15m',
    }, {
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      accountId: 'paper-account',
      assetClass: 'stocks',
      executionMode: 'paper',
      indicators: { rsi: 81.5 },
      trend: 'up',
      volatility: 0.01,
      price: 380,
      positionSize: 100,
    });

    expect(module.makeRecommendation).not.toHaveBeenCalled();
    expect(decision.confidenceInputInvalid).toBe(true);
    expect(decision.originalConfidence).toBeNull();
    expect(decision.traiRecommendation).toBe('HOLD');
    expect(decision.finalConfidence).toBe(0);
    expect(decision.riskAssessment.approved).toBe(true);
    expect(decision.riskAssessment.opinionOnly).toBe(true);
    expect(decision.riskAssessment.vetoReason).toBeNull();
    expect(decision.riskAssessment.factors).toContain('invalid_confidence_input');
    expect(decision.reasoning).toContain('invalid confidence input');
    expect(decision.reasoning).not.toContain('base 0.0%');
    expect(module.storeDecision.mock.calls[0][0].confidenceInputInvalid).toBe(true);
    expect(module.storeDecision.mock.calls[0][1].confidence).toBeNull();
    expect(module.storeDecision.mock.calls[0][1].confidenceInputInvalid).toBe(true);
  });

  test('TRAI LLM reasoning uses scoped symbol instead of phantom BTC', async () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.traiCore = {
      generateIntelligentResponse: jest.fn().mockResolvedValue('TSLA setup aligned.'),
    };
    module.generateRuleBasedReasoning = jest.fn(() => 'rule fallback');

    const response = await module.generateReasoning({
      symbol: 'TSLA',
      action: 'BUY',
      confidence: 0.62,
    }, {
      indicators: { rsi: 54 },
      trend: 'uptrend',
      symbol: 'TSLA',
    }, {
      traiRecommendation: 'BUY',
    });

    expect(response).toBe('TSLA setup aligned.');
    expect(module.traiCore.generateIntelligentResponse.mock.calls[0][0]).toContain('TSLA BUY 62%');
    expect(module.traiCore.generateIntelligentResponse.mock.calls[0][0]).not.toContain('BTC ');
  });

  test('TRAI LLM reasoning falls back when symbol scope is missing', async () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.traiCore = {
      generateIntelligentResponse: jest.fn(),
    };
    module.generateRuleBasedReasoning = jest.fn(() => 'rule fallback');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await module.generateReasoning({
      action: 'BUY',
      confidence: 0.62,
    }, {
      indicators: { rsi: 54 },
      trend: 'uptrend',
    }, {
      traiRecommendation: 'BUY',
    });

    expect(response).toBe('rule fallback');
    expect(module.traiCore.generateIntelligentResponse).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[TRAI] LLM reasoning skipped: missing scoped symbol');

    warnSpy.mockRestore();
  });

  test('TRAI decision telemetry refuses unscoped writes and stamps runtime scope', () => {
    const module = Object.create(TRAIDecisionModule.prototype);
    module.config = {
      trackDecisions: true,
      logPath: './logs/test-trai-decisions.log',
      mode: 'passive',
    };
    module.state = { totalDecisions: 1 };
    const appendSpy = jest.spyOn(fs, 'appendFile').mockImplementation((file, payload, cb) => cb());
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    module.logDecision({
      id: 1,
      originalConfidence: 0.62,
      finalConfidence: 0.62,
      traiConfidence: 0.4,
      traiRecommendation: 'BUY',
      riskAssessment: { riskScore: 0.2, factors: [] },
      adjustments: [],
      reasoning: 'scoped',
      processingTime: 5,
    }, {
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      action: 'BUY',
      patterns: [],
    }, {
      symbol: 'TSLA',
      timeframe: '15m',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      indicators: { rsi: 54 },
      regime: 'trend',
      trend: 'uptrend',
      volatility: 0.02,
    });

    const telemetry = JSON.parse(appendSpy.mock.calls[0][1]);
    expect(telemetry.input).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      timeframe: '15m',
    }));
    expect(telemetry.meta).toEqual(expect.objectContaining({
      brokerId: 'alpaca',
      assetClass: 'stocks',
      mode: 'paper',
      traiMode: 'passive',
    }));
    expect(JSON.stringify(telemetry)).not.toContain('kraken');
    expect(JSON.stringify(telemetry)).not.toContain('quantum');

    appendSpy.mockClear();
    module.logDecision({
      id: 2,
      originalConfidence: 0.62,
      finalConfidence: 0.62,
      traiConfidence: 0.4,
      traiRecommendation: 'BUY',
      riskAssessment: { riskScore: 0.2, factors: [] },
      adjustments: [],
      reasoning: 'missing scope',
      processingTime: 5,
    }, {
      action: 'BUY',
    }, {});

    expect(appendSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Decision telemetry scope incomplete'));

    appendSpy.mockRestore();
    errorSpy.mockRestore();
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
