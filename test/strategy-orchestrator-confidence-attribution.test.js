'use strict';

describe('StrategyOrchestrator confidence attribution', () => {
  const originalEnv = process.env;
  let configOverrides;

  function setConfigOverrides(overrides = {}) {
    configOverrides = {
      ...configOverrides,
      ...overrides,
      'orchestrator.mtfConfluenceBooster': {
        ...(configOverrides?.['orchestrator.mtfConfluenceBooster'] || {}),
        ...(overrides['orchestrator.mtfConfluenceBooster'] || {}),
      },
    };
  }

  function installConfigMock(overrides = {}) {
    configOverrides = {
      'orchestrator.mtfConfluenceBooster': {
        enabled: true,
        minScore: 0.1,
        minConfidence: 0.1,
        strengthMultiplier: 1,
        maxMultiplier: 2,
      },
    };
    setConfigOverrides(overrides);
    const ConfigLoader = require('../foundation/ConfigLoader');
    const realGet = ConfigLoader.get.bind(ConfigLoader);
    jest.spyOn(ConfigLoader, 'get').mockImplementation((path, defaultValue) => {
      if (path === 'orchestrator.mtfConfluenceBooster') {
        return { ...(realGet(path, defaultValue) || {}), ...(configOverrides[path] || {}) };
      }
      return realGet(path, defaultValue);
    });
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
      ATR_FILTER_ENABLED: 'true',
      ATR_MIN_PERCENT: '0.1',
      MIN_STRATEGY_CONFIDENCE: '0',
    };
    installConfigMock();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('records raw-to-final confidence contributors for ranking boosts', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.BASE_CONFIG.regimeBoosts.ranging.AttributionProbe = 1.1;
    ConfigLoader.BASE_CONFIG.volumeProfileBoosts.atPOC.AttributionProbe = 1.2;

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'AttributionProbe',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.5,
        reason: 'attribution probe',
      }),
    }];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
      {
        symbol: 'TSLA',
        timeframe: '15m',
        price: 100,
        volumeProfile: {
          getProfile: () => ({
            poc: 100,
            vah: 110,
            val: 90,
            lvns: [],
          }),
        },
      }
    );

    const attribution = result.allResults[0].decisionAttribution;
    expect(result.winnerStrategy).toBe('AttributionProbe');
    expect(result.confidence).toBeCloseTo(66, 6);
    expect(attribution).toEqual(expect.objectContaining({
      strategyName: 'AttributionProbe',
      baseConfidence: 0.5,
      confidenceScale: '0..1',
      selectionScore: {
        scale: 'nonnegative_selector',
        initial: 0.5,
        final: expect.any(Number),
      },
      finalConfidence: expect.any(Number),
      publicConfidence: expect.any(Number),
    }));
    expect(attribution.selectionScore.final).toBeCloseTo(0.66, 6);
    expect(attribution.finalConfidence).toBeCloseTo(0.66, 6);
    expect(attribution.publicConfidence).toBeCloseTo(0.66, 6);
    expect(attribution.contributors.map((item) => item.name)).toEqual([
      'strategy_signal',
      'atr_pre_entry_filter',
      'regime_boost',
      'volume_profile_boost',
    ]);
    expect(attribution.contributors.find((item) => item.name === 'regime_boost')).toEqual(expect.objectContaining({
      configuredMultiplier: 1.1,
      previousSelectionScore: 0.5,
      nextSelectionScore: 0.55,
    }));
    expect(attribution.contributors.find((item) => item.name === 'volume_profile_boost')).toEqual(expect.objectContaining({
      zone: 'atPOC',
      configuredMultiplier: 1.2,
      previousSelectionScore: 0.55,
      nextSelectionScore: 0.66,
    }));
  });

  test('keeps ranking score private while exposing capped public confidence', () => {
    setConfigOverrides({
      'orchestrator.mtfConfluenceBooster': { enabled: false },
    });
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.BASE_CONFIG.regimeBoosts.ranging.PublicBoundaryProbe = 1.5;

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'PublicBoundaryProbe',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.9,
        reason: 'public boundary probe',
      }),
    }];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { symbol: 'TSLA', timeframe: '15m', price: 100 }
    );

    expect(result.confidence).toBe(100);
    expect(result.allResults[0]).not.toHaveProperty('rankingScore');
    expect(result.signalBreakdown.signals[0]).not.toHaveProperty('rankingScore');
    expect(result.allResults[0].confidence).toBe(1);
    expect(result.allResults[0].decisionAttribution).toEqual(expect.objectContaining({
      confidenceScale: '0..1',
      baseConfidence: 0.9,
      selectionScore: {
        scale: 'nonnegative_selector',
        initial: 0.9,
        final: 1.35,
      },
      finalConfidence: 1,
      publicConfidence: 1,
    }));
  });

  test('records candidates rejected by ATR before winner selection', () => {
    setConfigOverrides({
      'orchestrator.mtfConfluenceBooster': { enabled: false },
    });
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.BASE_CONFIG.exitContracts.HighAtrProbe = {
      ...ConfigLoader.BASE_CONFIG.exitContracts.default,
      minConfidence: null,
      atrMinPercent: 2,
    };
    ConfigLoader.BASE_CONFIG.exitContracts.LowAtrProbe = {
      ...ConfigLoader.BASE_CONFIG.exitContracts.default,
      minConfidence: null,
      atrMinPercent: 0.1,
    };

    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [
      {
        name: 'HighAtrProbe',
        evaluate: () => ({
          direction: 'buy',
          confidence: 0.9,
          reason: 'higher confidence but too quiet',
        }),
      },
      {
        name: 'LowAtrProbe',
        evaluate: () => ({
          direction: 'buy',
          confidence: 0.7,
          reason: 'lower confidence ATR survivor',
        }),
      },
    ];

    const result = orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'unknown', confidence: 0.5, positionMultiplier: 1 },
      [{ symbol: 'TSLA', timeframe: '15m', o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { symbol: 'TSLA', timeframe: '15m', price: 100 }
    );

    expect(result.winnerStrategy).toBe('LowAtrProbe');
    expect(result.allResults.map((item) => item.strategyName)).toEqual(['LowAtrProbe']);
    expect(result.filteredResults).toHaveLength(1);
    expect(result.filteredResults[0]).toEqual(expect.objectContaining({
      strategyName: 'HighAtrProbe',
      confidence: 0.9,
      rejectedBy: 'atr_pre_entry_filter',
      rejectReason: 'ATR 1.000% below 2%',
    }));
    expect(result.filteredResults[0].decisionAttribution.contributors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'atr_pre_entry_filter',
        passed: false,
        atrPercent: 1,
        threshold: 2,
      }),
    ]));
  });
});
