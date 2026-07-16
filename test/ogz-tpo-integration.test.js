'use strict';

const tradingConfig = require('../config/trading.config.json');
const OgzTpoIntegration = require('../core/OgzTpoIntegration');

function cloneOgzTpoConfig(overrides = {}) {
  return {
    ...JSON.parse(JSON.stringify(tradingConfig.strategies.OGZTPO)),
    ...overrides,
  };
}

describe('OgzTpoIntegration restored filters and config ownership', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('constructor consumes explicit OGZTPO config values without hidden defaults', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      mode: 'aggressive',
      voteWeight: 0.42,
      lastSignalTtlBars: 2,
      strengthConfidenceMultiplier: 8,
      tradingLoopOverrideMinStrength: 0.07,
      dynamicLevelMultipliers: {
        conservative: 2.5,
        standard: 1.75,
        aggressive: 1.25,
      },
    }));

    expect(strategy.config.mode).toBe('aggressive');
    expect(strategy.config.voteWeight).toBe(0.42);
    expect(strategy.config.lastSignalTtlBars).toBe(2);
    expect(strategy.config.strengthConfidenceMultiplier).toBe(8);
    expect(strategy.config.tradingLoopOverrideMinStrength).toBe(0.07);
    expect(strategy._dynamicLevelMultiplier()).toBe(1.25);
  });

  test('constructor refuses an incomplete OGZTPO config block', () => {
    const incomplete = cloneOgzTpoConfig();
    delete incomplete.lastSignalTtlBars;

    expect(() => new OgzTpoIntegration(incomplete))
      .toThrow(/strategies\.OGZTPO\.lastSignalTtlBars must be a finite number/);
  });

  test('restored filters reject weak, off-zone, or unconfluent crossovers', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      mode: 'conservative',
      confluence: true,
    }));

    const weakSignal = {
      type: 'BULLISH_CROSS',
      action: 'BUY',
      strength: 0.02,
      highProbability: true,
    };
    expect(strategy._evaluateSignalFilters(weakSignal, true)).toEqual(expect.objectContaining({
      validCrossover: true,
      meetsStrength: false,
      meetsZone: true,
      meetsConfluence: true,
      passed: false,
    }));

    const neutralSignal = {
      ...weakSignal,
      strength: 0.04,
      highProbability: false,
    };
    expect(strategy._evaluateSignalFilters(neutralSignal, true)).toEqual(expect.objectContaining({
      meetsStrength: true,
      meetsZone: false,
      meetsConfluence: true,
      passed: false,
    }));

    const missingConfluence = {
      ...neutralSignal,
      highProbability: true,
    };
    expect(strategy._evaluateSignalFilters(missingConfluence, false)).toEqual(expect.objectContaining({
      meetsStrength: true,
      meetsZone: true,
      meetsConfluence: false,
      passed: false,
    }));

    expect(strategy._evaluateSignalFilters(missingConfluence, true)).toEqual(expect.objectContaining({
      meetsStrength: true,
      meetsZone: true,
      meetsConfluence: true,
      passed: true,
    }));
  });

  test('dynamic levels use the configured mode multiplier', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      mode: 'conservative',
      dynamicLevelMultipliers: {
        conservative: 2,
        standard: 1.5,
        aggressive: 1,
      },
    }));
    strategy.candleHistory.closes = [100];
    strategy.lastResult = { vol: [2] };

    expect(strategy.getDynamicLevels(100, 'LONG')).toEqual(expect.objectContaining({
      stopLoss: 96,
      takeProfit: 106,
    }));
  });

  test('confluence compares matching BUY/SELL actions from both oscillator implementations', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({ confluence: true }));
    const newSignal = {
      type: 'BULLISH_CROSS',
      action: 'BUY',
      strength: 0.04,
      highProbability: true,
    };
    const existingSignal = {
      type: 'BULLISH_CROSS',
      action: 'BUY',
      strength: 0.04,
      highProbability: true,
    };

    const confluenceMatch = newSignal.action === existingSignal.action;
    expect(strategy._evaluateSignalFilters(newSignal, confluenceMatch)).toEqual(expect.objectContaining({
      meetsConfluence: true,
    }));
  });

  test('stale lastSignal past configured TTL contributes no votes', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      lastSignalTtlBars: 0,
    }));
    strategy.lastSignal = {
      action: 'BUY',
      zone: 'bullish_cross',
      highProbability: true,
      confluenceConfirmed: true,
    };
    strategy.barCounter = 1;
    strategy.lastSignalBarIndex = 1;
    strategy.candleHistory.closes = [100];

    expect(strategy.getVotes()).toHaveLength(2);

    strategy.barCounter = 2;
    strategy.candleHistory.closes = [100, 101];
    expect(strategy.getVotes()).toEqual([]);
    expect(strategy.lastSignal).toBeNull();
    expect(strategy.lastSignalBarIndex).toBeNull();
  });

  test('stale lastSignal still expires when candle buffer length is capped', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      maxHistory: 1,
      lastSignalTtlBars: 0,
    }));
    strategy.lastSignal = {
      action: 'SELL',
      zone: 'bearish_cross',
      highProbability: false,
      confluenceConfirmed: false,
    };
    strategy.barCounter = 10;
    strategy.lastSignalBarIndex = 10;
    strategy.candleHistory.closes = [100];

    expect(strategy.getVotes()).toHaveLength(1);

    strategy.barCounter = 11;
    strategy.candleHistory.closes = [101];
    expect(strategy.getVotes()).toEqual([]);
    expect(strategy.lastSignal).toBeNull();
    expect(strategy.lastSignalBarIndex).toBeNull();
  });

  test('same-timestamp candle update does not age a fresh same-bar signal', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      lastSignalTtlBars: 0,
    }));
    strategy.lastSignal = {
      action: 'BUY',
      zone: 'bullish_cross',
      highProbability: false,
      confluenceConfirmed: false,
    };
    strategy.barCounter = 10;
    strategy.lastSignalBarIndex = 10;
    strategy.lastBarTimestamp = 1700000000000;
    strategy.candleHistory.closes = [100];
    strategy.candleHistory.highs = [101];
    strategy.candleHistory.lows = [99];
    strategy.candleHistory.timestamps = [1700000000000];

    strategy.update({
      open: 100,
      high: 102,
      low: 98,
      close: 101,
      timestamp: 1700000000000,
    });

    expect(strategy.barCounter).toBe(10);
    expect(strategy.candleHistory.closes).toEqual([101]);
    expect(strategy.getVotes()).toHaveLength(1);
    expect(strategy.lastSignal).not.toBeNull();
    expect(strategy.lastSignalBarIndex).toBe(10);
  });

  test('numeric string timestamp update does not age a fresh same-bar signal', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      lastSignalTtlBars: 0,
    }));
    strategy.lastSignal = {
      action: 'SELL',
      zone: 'bearish_cross',
      highProbability: false,
      confluenceConfirmed: false,
    };
    strategy.barCounter = 3;
    strategy.lastSignalBarIndex = 3;
    strategy.lastBarTimestamp = 1700000000000;
    strategy.candleHistory.closes = [100];
    strategy.candleHistory.highs = [101];
    strategy.candleHistory.lows = [99];
    strategy.candleHistory.timestamps = [1700000000000];

    strategy.update({
      open: 100,
      high: 101,
      low: 98,
      close: 99,
      timestamp: '1700000000000',
    });

    expect(strategy.barCounter).toBe(3);
    expect(strategy.candleHistory.closes).toEqual([99]);
    expect(strategy.getVotes()).toHaveLength(1);
    expect(strategy.lastSignal).not.toBeNull();
    expect(strategy.lastSignalBarIndex).toBe(3);
  });

  test('missing timestamp update does not invent a new bar while a signal is fresh', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      lastSignalTtlBars: 0,
    }));
    strategy.lastSignal = {
      action: 'BUY',
      zone: 'bullish_cross',
      highProbability: false,
      confluenceConfirmed: false,
    };
    strategy.barCounter = 7;
    strategy.lastSignalBarIndex = 7;
    strategy.lastBarTimestamp = 1700000000000;
    strategy.candleHistory.closes = [100];
    strategy.candleHistory.highs = [101];
    strategy.candleHistory.lows = [99];
    strategy.candleHistory.timestamps = [1700000000000];

    strategy.update({
      open: 100,
      high: 103,
      low: 97,
      close: 102,
    });

    expect(strategy.barCounter).toBe(7);
    expect(strategy.candleHistory.closes).toEqual([102]);
    expect(strategy.getVotes()).toHaveLength(1);
    expect(strategy.lastSignal).not.toBeNull();
    expect(strategy.lastSignalBarIndex).toBe(7);
  });

  test('same start timestamp with changed etime does not age a fresh same-bar signal', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      lastSignalTtlBars: 0,
    }));
    strategy.lastSignal = {
      action: 'BUY',
      zone: 'bullish_cross',
      highProbability: false,
      confluenceConfirmed: false,
    };
    strategy.barCounter = 12;
    strategy.lastSignalBarIndex = 12;
    strategy.lastBarTimestamp = 1700000000000;
    strategy.candleHistory.closes = [100];
    strategy.candleHistory.highs = [101];
    strategy.candleHistory.lows = [99];
    strategy.candleHistory.timestamps = [1700000000000];

    strategy.update({
      open: 100,
      high: 104,
      low: 96,
      close: 103,
      t: 1700000000000,
      etime: 1700000000100,
    });

    expect(strategy.barCounter).toBe(12);
    expect(strategy.candleHistory.closes).toEqual([103]);
    expect(strategy.getVotes()).toHaveLength(1);
    expect(strategy.lastSignal).not.toBeNull();
    expect(strategy.lastSignalBarIndex).toBe(12);
  });

  test('non-parseable timestamp string does not invent a new bar while a signal is fresh', () => {
    const strategy = new OgzTpoIntegration(cloneOgzTpoConfig({
      lastSignalTtlBars: 0,
    }));
    strategy.lastSignal = {
      action: 'SELL',
      zone: 'bearish_cross',
      highProbability: false,
      confluenceConfirmed: false,
    };
    strategy.barCounter = 15;
    strategy.lastSignalBarIndex = 15;
    strategy.lastBarTimestamp = 1700000000000;
    strategy.candleHistory.closes = [100];
    strategy.candleHistory.highs = [101];
    strategy.candleHistory.lows = [99];
    strategy.candleHistory.timestamps = [1700000000000];

    strategy.update({
      open: 100,
      high: 101,
      low: 95,
      close: 96,
      timestamp: 'not-a-number',
    });

    expect(strategy.barCounter).toBe(15);
    expect(strategy.candleHistory.closes).toEqual([96]);
    expect(strategy.getVotes()).toHaveLength(1);
    expect(strategy.lastSignal).not.toBeNull();
    expect(strategy.lastSignalBarIndex).toBe(15);
  });
});
