'use strict';

describe('StrategyOrchestrator MultiTimeframe source timeframe wiring', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
      SOLO_STRATEGY: 'MultiTimeframe',
      ENABLE_MTF: 'true',
      MIN_CANDLES_MTF: '1',
      ATR_FILTER_ENABLED: 'false',
      MIN_STRATEGY_CONFIDENCE: '0',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.dontMock('../modules/MultiTimeframeAdapter');
    jest.restoreAllMocks();
  });

  test('passes evaluation timeframe into the MTF adapter ingest call', () => {
    const ingestCandle = jest.fn();
    const getConfluenceScore = jest.fn(() => ({
      direction: 'neutral',
      score: 0,
    }));
    jest.doMock('../modules/MultiTimeframeAdapter', () => jest.fn().mockImplementation(() => ({
      ingestCandle,
      getConfluenceScore,
    })));

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const latestCandle = {
      symbol: 'TSLA',
      timeframe: '15m',
      t: Date.UTC(2026, 0, 1, 14, 30, 0),
      etime: Date.UTC(2026, 0, 1, 14, 45, 0),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    };

    orchestrator.evaluate(
      { atr: 1, trend: 'bullish' },
      [],
      null,
      [latestCandle],
      { symbol: 'TSLA', timeframe: '15m', price: 100.5 }
    );

    expect(ingestCandle).toHaveBeenCalledWith(latestCandle, '15m');
  });

  test('prefers stamped candle timeframe over malformed extras timeframe', () => {
    const ingestCandle = jest.fn();
    const getConfluenceScore = jest.fn(() => ({
      direction: 'neutral',
      score: 0,
    }));
    jest.doMock('../modules/MultiTimeframeAdapter', () => jest.fn().mockImplementation(() => ({
      ingestCandle,
      getConfluenceScore,
    })));

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const latestCandle = {
      symbol: 'TSLA',
      timeframe: '15m',
      t: Date.UTC(2026, 0, 1, 14, 30, 0),
      etime: Date.UTC(2026, 0, 1, 14, 45, 0),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    };

    orchestrator.evaluate(
      { atr: 1, trend: 'bullish' },
      [],
      null,
      [latestCandle],
      { symbol: 'TSLA', timeframe: '2m', price: 100.5 }
    );

    expect(ingestCandle).toHaveBeenCalledWith(latestCandle, '15m');
  });

  test('fails loudly when the latest candle has no stamped timeframe', () => {
    const ingestCandle = jest.fn();
    const getConfluenceScore = jest.fn(() => ({
      direction: 'neutral',
      score: 0,
    }));
    jest.doMock('../modules/MultiTimeframeAdapter', () => jest.fn().mockImplementation(() => ({
      ingestCandle,
      getConfluenceScore,
    })));

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const latestCandle = {
      symbol: 'TSLA',
      t: Date.UTC(2026, 0, 1, 14, 30, 0),
      etime: Date.UTC(2026, 0, 1, 14, 45, 0),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    };

    expect(() => orchestrator.evaluate(
      { atr: 1, trend: 'bullish' },
      [],
      null,
      [latestCandle],
      { symbol: 'TSLA', timeframe: '15m', price: 100.5 }
    )).toThrow(/MultiTimeframe latest candle missing timeframe/);
    expect(ingestCandle).not.toHaveBeenCalled();
  });

  test('uses adapter confluenceScore when producing an MTF decision', () => {
    const ingestCandle = jest.fn();
    const getConfluenceScore = jest.fn(() => ({
      direction: 'buy',
      confluenceScore: 0.42,
      confidence: 0.75,
      readyTimeframes: ['15m', '1h', '4h'],
    }));
    jest.doMock('../modules/MultiTimeframeAdapter', () => jest.fn().mockImplementation(() => ({
      ingestCandle,
      getConfluenceScore,
    })));

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const latestCandle = {
      symbol: 'TSLA',
      timeframe: '15m',
      t: Date.UTC(2026, 0, 1, 14, 30, 0),
      etime: Date.UTC(2026, 0, 1, 14, 45, 0),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    };

    const result = orchestrator.evaluate(
      { atr: 1, trend: 'bullish' },
      [],
      null,
      Array.from({ length: 30 }, (_, index) => ({
        ...latestCandle,
        t: latestCandle.t + index * 900000,
        etime: latestCandle.etime + index * 900000,
      })),
      { symbol: 'TSLA', timeframe: '15m', price: 100.5 }
    );

    expect(result).toEqual(expect.objectContaining({
      winnerStrategy: 'MultiTimeframe',
      direction: 'buy',
      confidence: 75,
    }));
    expect(result.reasons.join(' ')).toContain('15m, 1h, 4h');
  });

	  test('uses confluence score magnitude for bearish MTF decisions', () => {
    const ingestCandle = jest.fn();
    const getConfluenceScore = jest.fn(() => ({
	      direction: 'sell',
	      confluenceScore: -0.44,
	      confidence: 0.70,
	      readyTimeframes: ['15m', '1h', '4h'],
	    }));
    jest.doMock('../modules/MultiTimeframeAdapter', () => jest.fn().mockImplementation(() => ({
      ingestCandle,
      getConfluenceScore,
    })));

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const latestCandle = {
      symbol: 'TSLA',
      timeframe: '15m',
      t: Date.UTC(2026, 0, 1, 14, 30, 0),
      etime: Date.UTC(2026, 0, 1, 14, 45, 0),
      o: 100,
      h: 101,
      l: 99,
      c: 100.5,
      v: 1000,
    };

    const result = orchestrator.evaluate(
      { atr: 1, trend: 'bearish' },
      [],
      null,
      Array.from({ length: 30 }, (_, index) => ({
        ...latestCandle,
        t: latestCandle.t + index * 900000,
        etime: latestCandle.etime + index * 900000,
      })),
      { symbol: 'TSLA', timeframe: '15m', price: 100.5 }
    );

	    expect(result).toEqual(expect.objectContaining({
	      winnerStrategy: 'MultiTimeframe',
	      direction: 'sell',
	      confidence: 70,
	    }));
	  });

	  test('can disable MTF booster while still capturing observational MTF state', () => {
	    process.env = {
	      ...process.env,
	      ENABLE_MTF_CONFLUENCE_BOOSTER: 'false',
	    };
	    jest.resetModules();
		    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
		    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    const confluenceSpy = jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation');

	    orchestrator.strategies = [{
	      name: 'ProbeBuy',
	      evaluate: () => ({
	        direction: 'buy',
	        confidence: 0.62,
	        reason: 'probe buy',
	      }),
	    }];

	    const result = orchestrator.evaluate(
	      { atr: 1, volatility: 1 },
	      [],
	      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
	      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
	      { symbol: 'TSLA', timeframe: '15m', price: 100 }
	    );

	    expect(confluenceSpy).toHaveBeenCalledTimes(1);
	    expect(result.winnerStrategy).toBe('ProbeBuy');
	    expect(result.confidence).toBeCloseTo(62, 6);
	    expect(result.allResults[0].mtfConfluenceBooster).toBeUndefined();
	    expect(result.mtfConfluenceSnapshot).toEqual(expect.objectContaining({
	      available: false,
	      direction: 'neutral',
	      confluenceScore: 0,
	      readyTimeframes: [],
	    }));
	  });

	  test('does not read MTF when both MTF strategy and booster are disabled', () => {
	    process.env = {
	      ...process.env,
	      SOLO_STRATEGY: '',
	      ENABLE_MTF: 'false',
	      ENABLE_MTF_CONFLUENCE_BOOSTER: 'false',
	    };
	    jest.resetModules();
	    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
	    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    const confluenceSpy = jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation');

	    orchestrator.strategies = [{
	      name: 'ProbeBuy',
	      evaluate: () => ({
	        direction: 'buy',
	        confidence: 0.62,
	        reason: 'probe buy',
	      }),
	    }];

	    const result = orchestrator.evaluate(
	      { atr: 1, volatility: 1 },
	      [],
	      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
	      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
	      { symbol: 'TSLA', timeframe: '15m', price: 100 }
	    );

	    expect(confluenceSpy).not.toHaveBeenCalled();
	    expect(result.winnerStrategy).toBe('ProbeBuy');
	    expect(result.mtfConfluenceSnapshot).toBeNull();
	  });

	  test('default-on booster adjusts aligned and conflicting candidates without mutating raw confidence', () => {
	    process.env = {
	      ...process.env,
	      MTF_BOOSTER_MIN_SCORE: '0.1',
	      MTF_BOOSTER_MIN_CONFIDENCE: '0.1',
	      MTF_BOOSTER_STRENGTH_MULT: '1',
	      MTF_BOOSTER_MAX_MULT: '2',
	      MTF_BOOSTER_CONFLICT_MULT: '0.5',
	    };

	    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
	    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    const buySignal = { direction: 'buy', confidence: 0.60, reason: 'probe buy' };
	    const sellSignal = { direction: 'sell', confidence: 0.62, reason: 'probe sell' };
	    jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation').mockReturnValue({
	      confluenceScore: 0.6,
	      confidence: 0.9,
	      readyTimeframes: ['15m', '1h'],
	    });

	    orchestrator.strategies = [
	      { name: 'ProbeBuy', evaluate: () => buySignal },
	      { name: 'ProbeSell', evaluate: () => sellSignal },
	    ];

	    const result = orchestrator.evaluate(
	      { atr: 1, volatility: 1 },
	      [],
	      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
	      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
	      { symbol: 'TSLA', timeframe: '15m', price: 100 }
	    );

	    expect(result.winnerStrategy).toBe('ProbeBuy');
	    expect(result.direction).toBe('buy');
	    expect(result.confidence).toBeCloseTo(96, 6);
	    expect(buySignal.confidence).toBe(0.60);
	    expect(sellSignal.confidence).toBe(0.62);
	    expect(result.allResults.map((item) => [item.strategyName, item.confidence])).toEqual([
	      ['ProbeBuy', 0.96],
	      ['ProbeSell', 0.31],
	    ]);
	  });

	  test('does not let MTF conflict penalty demote a qualified trade into HOLD', () => {
	    process.env = {
	      ...process.env,
	      MIN_STRATEGY_CONFIDENCE: '0.50',
	      MTF_BOOSTER_MIN_SCORE: '0.1',
	      MTF_BOOSTER_MIN_CONFIDENCE: '0.1',
	      MTF_BOOSTER_CONFLICT_MULT: '0.5',
	    };

	    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
	    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation').mockReturnValue({
	      confluenceScore: -0.6,
	      confidence: 0.9,
	      readyTimeframes: ['15m', '1h'],
	    });

	    orchestrator.strategies = [{
	      name: 'ProbeBuy',
	      evaluate: () => ({
	        direction: 'buy',
	        confidence: 0.51,
	        reason: 'qualified raw signal',
	      }),
	    }];

	    const result = orchestrator.evaluate(
	      { atr: 1, volatility: 1 },
	      [],
	      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
	      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
	      { symbol: 'TSLA', timeframe: '15m', price: 100 }
	    );

	    expect(result.action).toBe('BUY');
	    expect(result.winnerStrategy).toBe('ProbeBuy');
	    expect(result.confidence).toBeCloseTo(50, 6);
	    expect(result.allResults[0].decisionAttribution.contributors).toEqual(
	      expect.arrayContaining([
	        expect.objectContaining({
	          name: 'mtf_confluence_booster',
	          aligned: false,
	          previousSelectionScore: 0.51,
	          nextSelectionScore: 0.5,
	        }),
	      ])
	    );
	  });

	  test('exposes cached MTF confluence snapshot on the orchestrator result', () => {
	    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
	    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    const confluence = {
	      direction: 'buy',
	      confluenceScore: 0.45,
	      confidence: 0.8,
	      readyTimeframes: ['15m', '1h'],
	      totalTimeframes: 4,
	      shouldTrade: true,
	      overallBias: 'bullish',
	    };
	    jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation').mockImplementation(function cacheMtfConfluence() {
	      if (this.mtfEvaluationCache && this.mtfEvaluationCache.evalCount === this.evalCount) {
	        return this.mtfEvaluationCache.confluence;
	      }
	      this.mtfEvaluationCache = {
	        evalCount: this.evalCount,
	        confluence,
	        snapshot: this._buildMtfConfluenceSnapshot(confluence),
	      };
	      return confluence;
	    });

	    orchestrator.strategies = [{
	      name: 'ProbeBuy',
	      evaluate: (ctx) => {
	        orchestrator._getMtfConfluenceForEvaluation(ctx);
	        confluence.direction = 'sell';
	        confluence.readyTimeframes.push('4h');
	        return { direction: 'buy', confidence: 0.70, reason: 'probe buy' };
	      },
	    }];

	    const result = orchestrator.evaluate(
	      { atr: 1, volatility: 1 },
	      [],
	      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
	      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
	      { symbol: 'TSLA', timeframe: '15m', price: 100 }
	    );

	    expect(result.mtfConfluenceSnapshot).toEqual({
	      source: 'StrategyOrchestrator.mtfConfluence',
	      available: true,
	      unavailableReason: null,
	      direction: 'buy',
	      confluenceScore: 0.45,
	      confidence: 0.8,
	      readyTimeframes: ['15m', '1h'],
	      totalTimeframes: 4,
	      shouldTrade: true,
	      overallBias: 'bullish',
	    });
	    expect(Object.isFrozen(result.mtfConfluenceSnapshot)).toBe(true);
	    expect(Object.isFrozen(result.mtfConfluenceSnapshot.readyTimeframes)).toBe(true);
	  });

	  test('uses signed bearish MTF score instead of absolute-value direction', () => {
	    process.env = {
	      ...process.env,
	      ENABLE_MTF_CONFLUENCE_BOOSTER: 'true',
	      MTF_BOOSTER_MIN_SCORE: '0.1',
	      MTF_BOOSTER_MIN_CONFIDENCE: '0.1',
	      MTF_BOOSTER_STRENGTH_MULT: '1',
	      MTF_BOOSTER_MAX_MULT: '2',
	      MTF_BOOSTER_CONFLICT_MULT: '0.5',
	    };

	    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
	    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation').mockReturnValue({
	      confluenceScore: -0.6,
	      confidence: 0.9,
	      readyTimeframes: ['15m', '1h'],
	    });

	    orchestrator.strategies = [
	      { name: 'ProbeBuy', evaluate: () => ({ direction: 'buy', confidence: 0.70, reason: 'probe buy' }) },
	      { name: 'ProbeSell', evaluate: () => ({ direction: 'sell', confidence: 0.65, reason: 'probe sell' }) },
	    ];

	    const result = orchestrator.evaluate(
	      { atr: 1, volatility: 1 },
	      [],
	      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
	      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
	      { symbol: 'TSLA', timeframe: '15m', price: 100 }
	    );

	    expect(result.winnerStrategy).toBe('ProbeSell');
	    expect(result.direction).toBe('sell');
	    expect(result.allResults.map((item) => [item.strategyName, item.confidence])).toEqual([
	      ['ProbeSell', 1],
	      ['ProbeBuy', 0.35],
	    ]);
	  });

	  test('does not double-ingest MTF candle when standalone MTF and booster share confluence', () => {
	    process.env = {
	      ...process.env,
	      ENABLE_MTF_CONFLUENCE_BOOSTER: 'true',
	      MTF_BOOSTER_MIN_SCORE: '0.1',
	      MTF_BOOSTER_MIN_CONFIDENCE: '0.1',
	    };

	    const ingestCandle = jest.fn();
	    const getConfluenceScore = jest.fn(() => ({
	      direction: 'buy',
	      confluenceScore: 0.42,
	      confidence: 0.75,
	      readyTimeframes: ['15m', '1h', '4h'],
	    }));
	    jest.doMock('../modules/MultiTimeframeAdapter', () => jest.fn().mockImplementation(() => ({
	      ingestCandle,
	      getConfluenceScore,
	    })));

	    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
	    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    const latestCandle = {
	      symbol: 'TSLA',
	      timeframe: '15m',
	      t: Date.UTC(2026, 0, 1, 14, 30, 0),
	      etime: Date.UTC(2026, 0, 1, 14, 45, 0),
	      o: 100,
	      h: 101,
	      l: 99,
	      c: 100.5,
	      v: 1000,
	    };

	    const result = orchestrator.evaluate(
	      { atr: 1, trend: 'bullish' },
	      [],
	      null,
	      Array.from({ length: 30 }, (_, index) => ({
	        ...latestCandle,
	        t: latestCandle.t + index * 900000,
	        etime: latestCandle.etime + index * 900000,
	      })),
	      { symbol: 'TSLA', timeframe: '15m', price: 100.5 }
	    );

	    expect(result.winnerStrategy).toBe('MultiTimeframe');
	    expect(ingestCandle).toHaveBeenCalledTimes(1);
	    expect(getConfluenceScore).toHaveBeenCalledTimes(1);
	  });

	  test('leaves structural exit hints unchanged when MTF booster is active', () => {
	    process.env = {
	      ...process.env,
	      ENABLE_MTF_CONFLUENCE_BOOSTER: 'true',
	      MTF_BOOSTER_MIN_SCORE: '0.1',
	      MTF_BOOSTER_MIN_CONFIDENCE: '0.1',
	      MTF_BOOSTER_STRENGTH_MULT: '1',
	      MTF_BOOSTER_MAX_MULT: '2',
	    };

	    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
	    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
	    jest.spyOn(orchestrator, '_getMtfConfluenceForEvaluation').mockReturnValue({
	      confluenceScore: 0.6,
	      confidence: 0.9,
	      readyTimeframes: ['15m', '1h'],
	    });

	    orchestrator.strategies = [{
	      name: 'OpeningRangeBreakout',
	      evaluate: () => ({
	        direction: 'buy',
	        confidence: 0.8,
	        reason: 'orb structural entry',
	        overrideLevels: { stopLoss: 100, takeProfit: 110 },
	        exitContractHint: {
	          strategyName: 'OpeningRangeBreakout',
	          stopLossPercent: -0.5,
	          takeProfitPercent: 1.5,
	          trailingStopPercent: 0.6,
	          trailingActivation: 0.8,
	          maxHoldTimeMinutes: 180,
	          invalidationConditions: ['fvg_filled', 'or_break_reversal'],
	        },
	      }),
	    }];

	    const result = orchestrator.evaluate(
	      { atr: 1, volatility: 1 },
	      [],
	      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
	      [{ symbol: 'TSLA', timeframe: '15m', o: 99, h: 100, l: 98, c: 99, t: 1 }],
	      { symbol: 'TSLA', timeframe: '15m', price: 99 }
	    );

	    expect(result.winnerStrategy).toBe('OpeningRangeBreakout');
	    expect(result.confidence).toBeCloseTo(100, 6);
	    expect(result.exitContract.stopLossPercent).toBeCloseTo(-0.5, 6);
	    expect(result.exitContract.takeProfitPercent).toBeCloseTo(1.5, 6);
	    expect(result.exitContract.trailingStopPercent).toBeCloseTo(0.6, 6);
	    expect(result.exitContract.trailingActivation).toBeCloseTo(0.8, 6);
	    expect(result.exitContract.maxHoldTimeMinutes).toBe(180);
	    expect(result.exitContract.invalidationConditions).toEqual(['fvg_filled', 'or_break_reversal']);
	  });
	});
