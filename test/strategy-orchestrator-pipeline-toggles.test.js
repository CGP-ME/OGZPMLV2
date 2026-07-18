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
      expect(orchestrator.strategies.map((s) => s.name)).not.toContain('MultiTimeframe');
      expect(orchestrator.noWickModule.cfg).toEqual(
        expect.objectContaining(ConfigLoader.get('strategies.NoWickImbalance'))
      );
      const tpoConfig = ConfigLoader.get('strategies.OGZTPO');
      expect(orchestrator.tpoIntegration.config).toEqual(
        expect.objectContaining({
          enabled: tpoConfig.enabled,
          mode: tpoConfig.mode,
          dynamicSL: tpoConfig.dynamicSL,
          confluence: tpoConfig.confluence,
          voteWeight: tpoConfig.voteWeight,
          adaptive: tpoConfig.adaptive,
          tpoLength: tpoConfig.tpoLength,
          normLength: tpoConfig.normLength,
          volLength: tpoConfig.volLength,
          lagBars: tpoConfig.lagBars,
          maxHistory: tpoConfig.maxHistory,
          lastSignalTtlBars: tpoConfig.lastSignalTtlBars,
          confluenceBonusStrength: tpoConfig.confluenceBonusStrength,
          strengthConfidenceMultiplier: tpoConfig.strengthConfidenceMultiplier,
          tradingLoopOverrideMinStrength: tpoConfig.tradingLoopOverrideMinStrength,
          dynamicLevelMultipliers: tpoConfig.dynamicLevelMultipliers,
          modes: tpoConfig.modes,
        })
      );
      expect(tpoConfig.confluenceBoost).toEqual({ enabled: false, weight: 0 });
    } finally {
      process.env = originalEnv;
    }
  });

  test('OGZTPO update failures surface instead of returning a silent null signal', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...withoutStrategyEnv(originalEnv),
      ENABLE_TRAI: 'false',
    };

    try {
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
      const ogzTpo = orchestrator.strategies.find((strategy) => strategy.name === 'OGZTPO');
      expect(ogzTpo).toBeDefined();
      jest.spyOn(orchestrator, '_getSymbolStrategyModule').mockReturnValue({
        update: () => {
          throw new Error('ogztpo update exploded');
        },
      });

      const candles = Array.from({ length: 30 }, (_, i) => ({
        o: 100 + i,
        h: 101 + i,
        l: 99 + i,
        c: 100.5 + i,
        v: 1000,
        t: i + 1,
      }));

      expect(() => ogzTpo.evaluate({
        priceHistory: candles,
        extras: { symbol: 'TSLA' },
      })).toThrow(/ogztpo update exploded/);
    } finally {
      process.env = originalEnv;
    }
  });

  test('OGZTPO receives a stable fallback bar timestamp when raw candle omits time fields', () => {
    jest.resetModules();
    const originalEnv = process.env;
    process.env = {
      ...withoutStrategyEnv(originalEnv),
      ENABLE_TRAI: 'false',
    };

    try {
      const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
      const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
      const ogzTpo = orchestrator.strategies.find((strategy) => strategy.name === 'OGZTPO');
      expect(ogzTpo).toBeDefined();
      const update = jest.fn(() => ({ enabled: true, ready: true, signal: null }));
      jest.spyOn(orchestrator, '_getSymbolStrategyModule').mockReturnValue({ update });

      const candles = Array.from({ length: 30 }, (_, i) => ({
        o: 100 + i,
        h: 101 + i,
        l: 99 + i,
        c: 100.5 + i,
        v: 1000,
      }));

      expect(ogzTpo.evaluate({
        priceHistory: candles,
        extras: { symbol: 'TSLA' },
      })).toBeNull();

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toEqual(expect.objectContaining({
        t: candles.length - 1,
      }));
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
        invalidationConditions: expect.any(Array),
      }));
      expect(Object.prototype.hasOwnProperty.call(
        tradingConfig.exitContracts[strategy],
        'maxHoldTimeMinutes'
      )).toBe(true);
    }

    expect(tradingConfig.strategies.RSI2MeanReversion).toEqual(expect.objectContaining({
      rsiPeriod: 2,
      rsiEntry: 10,
      rsiExitLong: 80,
    }));
    expect(tradingConfig.strategies.NoWickImbalance).toEqual(expect.objectContaining({
      maxCandleAge: 9,
      swingLookback: 20,
      minBodyPercent: 0.3,
      entrySideWickMaxPct: 5,
      entryMode: 'rejection',
      swingExtremeLookback: 20,
      almostTouchPct: 0.05,
      stopLookbackBars: 10,
      stopBufferAtr: 0.1,
      targetRR: 1,
      twinSplitEnabled: true,
      twinProximityBars: 1,
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
      });
    } finally {
      process.env = originalEnv;
    }
  });
});
