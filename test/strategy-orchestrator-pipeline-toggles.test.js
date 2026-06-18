'use strict';

const fs = require('fs');
const path = require('path');

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
});
