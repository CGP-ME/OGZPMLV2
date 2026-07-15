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

const WAKE_STRATEGIES = [
  'NoWickImbalance',
  'PropSafeEMAPullback',
  'EMATrendRetest',
  'RSI2MeanReversion',
  'TimeSeriesMomentum',
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
      const ConfigLoader = require('../foundation/ConfigLoader');
      const pipeline = ConfigLoader.get('pipeline');
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
      const ConfigLoader = require('../foundation/ConfigLoader');
      const realGet = ConfigLoader.get.bind(ConfigLoader);
      jest.spyOn(ConfigLoader, 'get').mockImplementation((path, defaultValue) => {
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

      const ConfigLoader = require('../foundation/ConfigLoader');
      const pipeline = ConfigLoader.get('pipeline');
      const expectedPipeline = Object.fromEntries(PIPELINE_STRATEGY_KEYS.map((key) => [key, true]));
      expectedPipeline.enableMarketRegime = false;
      expect(Object.fromEntries(PIPELINE_STRATEGY_KEYS.map((key) => [key, pipeline[key]])))
        .toEqual(expectedPipeline);

      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
      expect(orchestrator.strategies.map((s) => s.name)).toEqual(expectedStrategies);
      expect(orchestrator.noWickModule.cfg).toEqual(
        expect.objectContaining(ConfigLoader.get('strategies.NoWickImbalance'))
      );
    } finally {
      process.env = originalEnv;
    }
  });

  test('wake roster removed dormant strategy activation vocabulary', () => {
    const files = [
      path.join(__dirname, '..', 'core', 'StrategyOrchestrator.js'),
      path.join(__dirname, '..', 'tools', 'parallel-backtest.js'),
    ];
    const forbidden = [
      'shouldInstantiateDormantStrategy',
      'buildDormantStrategyEnableEnv',
      'assertDormantStrategyEnvCompatible',
      'dormantStrategyEnv',
    ];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const token of forbidden) {
        expect(source).not.toContain(token);
      }
    }
  });

  test('wake roster strategies have explicit config and exit contract ownership', () => {
    const tradingConfig = require('../config/trading.config.json');
    for (const strategy of WAKE_STRATEGIES) {
      expect(tradingConfig.strategies[strategy]).toEqual(expect.objectContaining({ enabled: true }));
      expect(tradingConfig.exitContracts[strategy]).toEqual(expect.objectContaining({
        maxHoldTimeMinutes: expect.any(Number),
        invalidationConditions: expect.any(Array),
      }));
    }

    expect(tradingConfig.strategies.RSI2MeanReversion).toEqual(expect.objectContaining({
      rsiPeriod: 2,
      rsiEntry: 10,
      rsiExitLong: 80,
    }));
    expect(tradingConfig.strategies.NoWickImbalance).toEqual(expect.objectContaining({
      maxCandleAge: 9,
      slBreathingATR: 0.3,
      swingLookback: 20,
      minBodyPercent: 0.3,
      confidence: 0.7,
    }));
  });

  test('MTF confluence booster is a default-on non-blocking orchestrator control', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...withoutStrategyEnv(originalEnv),
      ENABLE_TRAI: 'false',
    };

    try {
      const ConfigLoader = require('../foundation/ConfigLoader');
      expect(ConfigLoader.get('orchestrator.mtfConfluenceBooster')).toEqual({
        enabled: true,
        minScore: 0.3,
        minConfidence: 0.45,
        strengthMultiplier: 0.2,
        maxMultiplier: 1.15,
        conflictMultiplier: 0.88,
        penalizeConflicts: true,
        boostMtfCandidate: false,
      });
    } finally {
      process.env = originalEnv;
    }
  });
});
