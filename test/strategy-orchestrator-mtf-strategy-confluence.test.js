'use strict';

describe('StrategyOrchestrator strategy-specific MTF confluence', () => {
  const originalEnv = process.env;
  let configOverrides;

  function setConfigOverrides(overrides = {}) {
    configOverrides = {
      ...configOverrides,
      ...overrides,
      pipeline: {
        ...(configOverrides?.pipeline || {}),
        ...(overrides.pipeline || {}),
      },
      'orchestrator.mtfConfluenceBooster': {
        ...(configOverrides?.['orchestrator.mtfConfluenceBooster'] || {}),
        ...(overrides['orchestrator.mtfConfluenceBooster'] || {}),
      },
      'orchestrator.strategyMtfConfluence': {
        ...(configOverrides?.['orchestrator.strategyMtfConfluence'] || {}),
        ...(overrides['orchestrator.strategyMtfConfluence'] || {}),
      },
    };
  }

  function installConfigMock(overrides = {}) {
    configOverrides = {
      pipeline: { enableMultiTimeframe: true },
      'orchestrator.mtfConfluenceBooster': { enabled: false },
      'orchestrator.strategyMtfConfluence': { enabled: true },
    };
    setConfigOverrides(overrides);
    const ConfigLoader = require('../foundation/ConfigLoader');
    const realGet = ConfigLoader.get.bind(ConfigLoader);
    jest.spyOn(ConfigLoader, 'get').mockImplementation((path, defaultValue) => {
      if (path === 'pipeline') {
        return { ...realGet(path, defaultValue), ...(configOverrides.pipeline || {}) };
      }
      if (path === 'orchestrator.mtfConfluenceBooster' || path === 'orchestrator.strategyMtfConfluence') {
        return { ...(realGet(path, defaultValue) || {}), ...(configOverrides[path] || {}) };
      }
      if (Object.prototype.hasOwnProperty.call(configOverrides, path)) {
        return configOverrides[path];
      }
      return realGet(path, defaultValue);
    });
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
      ATR_FILTER_ENABLED: 'false',
      MIN_STRATEGY_CONFIDENCE: '0',
    };
    installConfigMock();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function makeContext() {
    return {
      indicators: { atr: 1, volatility: 1, rsi: 20, trend: 'bullish' },
      patterns: [],
      regime: { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      priceHistory: [{ symbol: 'TSLA', timeframe: '15m', o: 99, h: 101, l: 98, c: 100, t: 1 }],
      extras: { symbol: 'TSLA', timeframe: '15m', price: 100 },
    };
  }

  function attachMtf(orchestrator, confluence, indicatorsByTimeframe) {
    jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation').mockImplementation(function cacheMtf() {
      if (this.mtfEvaluationCache && this.mtfEvaluationCache.evalCount === this.evalCount) {
        return this.mtfEvaluationCache.confluence;
      }
      this.mtfEvaluationCache = {
        evalCount: this.evalCount,
        confluence,
        adapter: {
          getTimeframeIndicators: (timeframe) => indicatorsByTimeframe[timeframe] || null,
        },
        snapshot: this._buildMtfConfluenceSnapshot(confluence),
      };
      return confluence;
    });
  }

  test('does not apply strategy-specific MTF confluence when feature flag is disabled', () => {
    setConfigOverrides({
      'orchestrator.strategyMtfConfluence': { enabled: false },
    });

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    attachMtf(orchestrator, {
      direction: 'buy',
      confluenceScore: 0.5,
      confidence: 0.8,
      readyTimeframes: ['1h', '4h'],
    }, {
      '1h': { trend: 'bearish', trendStrength: 0.1 },
      '4h': { macd: { bullish: true } },
    });
    orchestrator.strategies = [{
      name: 'EMASMACrossover',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.6,
        reason: 'EMA crossover',
        signalData: {
          crossovers: [{ pair: 'ema50_200', type: 'golden' }],
        },
      }),
    }];

    const ctx = makeContext();
    const result = orchestrator.evaluate(ctx.indicators, ctx.patterns, ctx.regime, ctx.priceHistory, ctx.extras);

    expect(result.winnerStrategy).toBe('EMASMACrossover');
    const contributors = result.allResults[0].decisionAttribution.contributors.map((item) => item.name);
    expect(contributors).not.toEqual(expect.arrayContaining([
      'ema_mtf_1h_trend_conflict_context',
      'ema_mtf_4h_macd_alignment_context',
      'ema_mtf_fresh_50_200_unconfirmed',
    ]));
  });

  test('records RSI 4h trend conflict as a non-blocking MTF penalty', () => {
    process.env.MIN_STRATEGY_CONFIDENCE = '0.6';
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    attachMtf(orchestrator, {
      direction: 'sell',
      confluenceScore: -0.5,
      confidence: 0.8,
      readyTimeframes: ['1h', '4h'],
    }, {
      '4h': { trend: 'bearish', trendStrength: 0.7 },
      '1h': { rsi: 35 },
    });
    orchestrator.strategies = [{
      name: 'RSI',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.7,
        reason: 'RSI oversold',
        signalData: { rsi: 20 },
      }),
    }];

    const ctx = makeContext();
    const result = orchestrator.evaluate(ctx.indicators, ctx.patterns, ctx.regime, ctx.priceHistory, ctx.extras);

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('RSI');
    expect(result.filteredResults).toHaveLength(0);
    expect(result.allResults[0].decisionAttribution.contributors).toContainEqual(expect.objectContaining({
      name: 'rsi_mtf_4h_trend_conflict_penalty',
      passed: false,
      timeframe: '4h',
      mtfTrend: 'bearish',
    }));
  });

  test('applies EMA 1h trend penalty, 4h MACD boost, and unconfirmed 50/200 crossover adjustment', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    attachMtf(orchestrator, {
      direction: 'buy',
      confluenceScore: 0.5,
      confidence: 0.8,
      readyTimeframes: ['1h', '4h'],
    }, {
      '1h': { trend: 'bearish', trendStrength: 0.1 },
      '4h': { macd: { bullish: true } },
    });
    orchestrator.strategies = [{
      name: 'EMASMACrossover',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.6,
        reason: 'EMA crossover',
        signalData: {
          crossovers: [{ pair: 'ema50_200', type: 'golden' }],
        },
      }),
    }];

    const ctx = makeContext();
    const result = orchestrator.evaluate(ctx.indicators, ctx.patterns, ctx.regime, ctx.priceHistory, ctx.extras);
    const contributors = result.allResults[0].decisionAttribution.contributors.map((item) => item.name);

    expect(result.winnerStrategy).toBe('EMASMACrossover');
    expect(result.confidence).toBeCloseTo(51, 6);
    expect(contributors).toEqual(expect.arrayContaining([
      'ema_mtf_1h_trend_conflict_context',
      'ema_mtf_4h_macd_alignment_context',
      'ema_mtf_fresh_50_200_unconfirmed',
    ]));
  });

  test('keeps standalone MultiTimeframe live while observing missing higher timeframes', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    attachMtf(orchestrator, {
      direction: 'buy',
      confluenceScore: 0.5,
      confidence: 0.8,
      readyTimeframes: ['15m', '1h'],
    }, {});
    orchestrator.strategies = [{
      name: 'MultiTimeframe',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'MTF confluence',
        signalData: {
          direction: 'buy',
          confidence: 0.8,
          confluenceScore: 0.5,
          readyTimeframes: ['15m', '1h'],
        },
      }),
    }];

    const ctx = makeContext();
    const result = orchestrator.evaluate(ctx.indicators, ctx.patterns, ctx.regime, ctx.priceHistory, ctx.extras);

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('MultiTimeframe');
    expect(result.confidence).toBeCloseTo(80, 6);
    expect(result.filteredResults).toHaveLength(0);
    expect(result.allResults[0].decisionAttribution.contributors).toContainEqual(expect.objectContaining({
      name: 'mtf_standalone_higher_tf_missing_observation',
      missingTimeframes: ['4h'],
    }));
  });

  test('applies OGZTPO MTF boosts and records 4h volatility without mutating exits', () => {
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    attachMtf(orchestrator, {
      direction: 'buy',
      confluenceScore: 0.5,
      confidence: 0.8,
      readyTimeframes: ['1h', '4h'],
    }, {
      '1h': { macd: { bullish: true } },
      '4h': { trend: 'bullish', trendStrength: 0.8, bollinger: { bandwidth: 0.02 } },
    });
    orchestrator.strategies = [{
      name: 'OGZTPO',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.8,
        reason: 'TPO signal',
        signalData: { zone: 'bullish' },
        overrideLevels: { stopLoss: 98, takeProfit: 104 },
      }),
    }];

    const ctx = makeContext();
    const result = orchestrator.evaluate(ctx.indicators, ctx.patterns, ctx.regime, ctx.priceHistory, ctx.extras);
    const contributors = result.allResults[0].decisionAttribution.contributors.map((item) => item.name);

    expect(result.winnerStrategy).toBe('OGZTPO');
    expect(result.confidence).toBeCloseTo(96.768, 6);
    expect(result.exitContract.stopLossPercent).toBeCloseTo(-2, 6);
    expect(result.exitContract.takeProfitPercent).toBeCloseTo(4, 6);
    expect(contributors).toEqual(expect.arrayContaining([
      'ogztpo_mtf_4h_trend_boost',
      'ogztpo_mtf_1h_macd_boost',
      'ogztpo_mtf_4h_volatility_context',
    ]));
  });
});
