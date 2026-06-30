'use strict';

const fs = require('fs');
const path = require('path');

const STRATEGY_ENV_KEYS = [
  'ENABLE_RSI',
  'ENABLE_MASR',
  'ENABLE_EMA',
  'ENABLE_LIQSWEEP',
  'ENABLE_CANDLEPATTERN',
  'ENABLE_BREAKRETEST',
  'ENABLE_REGIME',
  'ENABLE_MTF',
  'ENABLE_TPO',
  'ENABLE_ORB',
  'ENABLE_SMS',
  'ENABLE_NOWICK',
  'ENABLE_DONCHIAN',
  'ENABLE_PROPSAFE_EMA',
  'ENABLE_EMA_TREND_RETEST',
  'ENABLE_RSI2_MR',
  'ENABLE_TSMOM',
];

const PIPELINE_STRATEGY_KEYS = [
  'enableRSI',
  'enableMADynamicSR',
  'enableEMACrossover',
  'enableLiquiditySweep',
  'enableCandlePattern',
  'enableBreakRetest',
  'enableMarketRegime',
  'enableMultiTimeframe',
  'enableOGZTPO',
  'enableOpeningRangeBreakout',
  'enableSmartMoneySweep',
  'enableNoWickImbalance',
  'enableDonchianBreakout',
  'enablePropSafeEMAPullback',
  'enableEMATrendRetest',
  'enableRSI2MeanReversion',
  'enableTimeSeriesMomentum',
];

function withoutStrategyEnv(originalEnv) {
  const nextEnv = { ...originalEnv };
  for (const key of STRATEGY_ENV_KEYS) {
    delete nextEnv[key];
  }
  return nextEnv;
}

describe('StrategyOrchestrator pipeline toggles', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('CandlePattern has an explicit pipeline toggle and boots by default', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
    };

    try {
      const TradingConfig = require('../core/TradingConfig');
      const pipeline = TradingConfig.get('pipeline');
      expect(pipeline.enableCandlePattern).toBe(true);

      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
      expect(orchestrator.strategies.map((s) => s.name)).toContain('CandlePattern');
    } finally {
      process.env = originalEnv;
    }
  });

  test('CandlePattern fails loudly if its pipeline toggle is missing', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      ENABLE_TRAI: 'false',
    };

    try {
      const TradingConfig = require('../core/TradingConfig');
      const realGet = TradingConfig.get.bind(TradingConfig);
      jest.spyOn(TradingConfig, 'get').mockImplementation((path, defaultValue) => {
        if (path === 'pipeline') {
          const pipeline = { ...realGet(path, defaultValue) };
          delete pipeline.enableCandlePattern;
          return pipeline;
        }
        return realGet(path, defaultValue);
      });

      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      expect(() => new StrategyOrchestrator({ minConfluenceCount: 1 }))
        .toThrow(/CandlePattern pipeline toggle must be boolean/);
    } finally {
      process.env = originalEnv;
    }
  });

  test('every registered built-in strategy has a pipeline toggle entry', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'core', 'StrategyOrchestrator.js'),
      'utf8'
    );
    const registeredStrategies = [...source.matchAll(/shouldRegister\('([^']+)'\)/g)]
      .map((match) => match[1]);
    const toggleMapBlock = source.match(/const toggleMap = \{([\s\S]*?)\n    \};/);
    expect(toggleMapBlock).not.toBeNull();
    const toggleStrategies = [...toggleMapBlock[1].matchAll(/'([^']+)':\s+pipeline\./g)]
      .map((match) => match[1]);

    const missingToggles = [...new Set(registeredStrategies)]
      .filter((name) => !toggleStrategies.includes(name));
    expect(missingToggles).toEqual([]);
  });

  test('default pipeline brings every entry strategy lane online while MarketRegime stays confluence-only', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...withoutStrategyEnv(originalEnv),
      ENABLE_TRAI: 'false',
    };

    try {
      const expectedStrategies = [
        'EMASMACrossover',
        'MADynamicSR',
        'LiquiditySweep',
        'BreakRetest',
        'RSI',
        'CandlePattern',
        'MultiTimeframe',
        'OGZTPO',
        'OpeningRangeBreakout',
        'SmartMoneySweep',
        'NoWickImbalance',
        'DonchianBreakout',
        'PropSafeEMAPullback',
        'EMATrendRetest',
        'RSI2MeanReversion',
        'TimeSeriesMomentum',
      ];

      const TradingConfig = require('../core/TradingConfig');
      const pipeline = TradingConfig.get('pipeline');
      const expectedPipeline = Object.fromEntries(PIPELINE_STRATEGY_KEYS.map((key) => [key, true]));
      expectedPipeline.enableMarketRegime = false;
      expect(Object.fromEntries(PIPELINE_STRATEGY_KEYS.map((key) => [key, pipeline[key]])))
        .toEqual(expectedPipeline);

      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
      expect(orchestrator.strategies.map((s) => s.name)).toEqual(expectedStrategies);
    } finally {
      process.env = originalEnv;
    }
  });

  test('MTF confluence booster is an explicit default-off orchestrator control', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...withoutStrategyEnv(originalEnv),
      ENABLE_TRAI: 'false',
    };

    try {
      const TradingConfig = require('../core/TradingConfig');
      expect(TradingConfig.get('orchestrator.mtfConfluenceBooster')).toEqual({
        enabled: false,
        minScore: 0.3,
        minConfidence: 0.5,
        strengthMultiplier: 0.2,
        maxMultiplier: 1.15,
        conflictMultiplier: 0.85,
        penalizeConflicts: true,
        boostMtfCandidate: false,
      });
    } finally {
      process.env = originalEnv;
    }
  });
});
