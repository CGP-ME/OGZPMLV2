'use strict';

const EMASMACrossoverSignal = require('../modules/EMASMACrossoverSignal');
const ConfigLoader = require('../foundation/ConfigLoader');

function candle(index, close) {
  return {
    t: Date.UTC(2026, 0, 1, 14, 30) + index * 900000,
    o: close,
    h: close + 0.2,
    l: close - 0.2,
    c: close,
    v: 1000 + index,
    timeframe: '15m',
  };
}

function alignedCandles(count = 220) {
  return Array.from({ length: count }, (_, index) => candle(index, 100 + index * 0.25));
}

function reversalCandles() {
  const candles = [];
  for (let index = 0; index < 260; index += 1) {
    const close = index < 210
      ? 200 - index * 0.25
      : 147.5 + (index - 210) * 1.5;
    candles.push(candle(index, close));
  }
  return candles;
}

describe('EMASMACrossover TREY SPEC 001 entry events', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      PROFILE: 'backtest-p0',
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
    };
    ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
  });

  afterEach(() => {
    process.env = originalEnv;
    ConfigLoader.clearOverrides();
    jest.resetModules();
  });

  test('standing MA alignment is neutral when entryEventsOnly is enabled', () => {
    const module = new EMASMACrossoverSignal({
      entryEventsOnly: true,
      confirmBars: 1,
      warmupBars: 200,
    });
    const history = alignedCandles();

    const signal = module.update(history[history.length - 1], history);

    expect(signal.direction).toBe('neutral');
    expect(signal.confidence).toBe(0);
    expect(signal.crossovers).toEqual([]);
    expect(signal.activeBullish).toBe(0);
    expect(signal.entryEventsOnly).toBe(true);
    expect(signal.warmupBars).toBe(200);
  });

  test('fresh crossover and one confirmation bar can signal when entryEventsOnly is enabled', () => {
    const module = new EMASMACrossoverSignal({
      entryEventsOnly: true,
      confirmBars: 1,
      warmupBars: 200,
    });
    const history = [];
    const signals = [];

    for (const nextCandle of reversalCandles()) {
      history.push(nextCandle);
      const signal = module.update(nextCandle, history);
      if (signal.direction !== 'neutral') signals.push(signal);
    }

    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].direction).toBe('buy');
    expect(signals[0].crossovers).toEqual([
      expect.objectContaining({ type: 'golden' }),
    ]);
    expect(signals[1].direction).toBe('buy');
    expect(signals[1].crossovers).toEqual([]);
    expect(signals[1].activeBullish).toBeGreaterThan(0);
  });

  test('backtest-all launch profile uses event entries so standing alignment does not churn trades', () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      PROFILE: 'backtest-all',
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      EMA_CROSSOVER_ENTRY_EVENTS_ONLY: 'false',
    };
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
    const ProfiledEMASMACrossoverSignal = require('../modules/EMASMACrossoverSignal');
    const module = new ProfiledEMASMACrossoverSignal();
    const history = alignedCandles();

    const signal = module.update(history[history.length - 1], history);

    expect(signal.entryEventsOnly).toBe(true);
    expect(signal.direction).toBe('neutral');
    expect(signal.crossovers).toEqual([]);
    expect(ConfigLoader.getSource('strategyBehavior.emaCrossover.entryEventsOnly'))
      .toBe('config:launchProfiles.backtest-all.strategyBehavior.emaCrossover.entryEventsOnly');
  });

  test('backtest-p0 launch profile keeps legacy alignment mode for the anchor', () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      PROFILE: 'backtest-p0',
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: 'true',
      EMA_CROSSOVER_ENTRY_EVENTS_ONLY: 'true',
    };
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.load({ force: true, silent: true, loadDotenv: false });
    const ProfiledEMASMACrossoverSignal = require('../modules/EMASMACrossoverSignal');
    const module = new ProfiledEMASMACrossoverSignal();
    const history = alignedCandles();

    const signal = module.update(history[history.length - 1], history);

    expect(signal.entryEventsOnly).toBe(false);
    expect(signal.direction).toBe('buy');
    expect(signal.confidenceMultipliers.composite).toBe(1);
    expect(ConfigLoader.getSource('strategyBehavior.emaCrossover.entryEventsOnly'))
      .toBe('config:launchProfiles.backtest-p0.strategyBehavior.emaCrossover.entryEventsOnly');
  });

  test('restored velocity, elasticity, and decay filters fire as confidence multipliers', () => {
    const module = new EMASMACrossoverSignal({
      entryEventsOnly: true,
      confirmBars: 3,
      warmupBars: 200,
    });
    const history = [];
    const signals = [];

    for (const nextCandle of reversalCandles()) {
      history.push(nextCandle);
      const signal = module.update(nextCandle, history);
      if (signal.direction !== 'neutral') signals.push(signal);
    }

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some(signal => signal.confidenceMultipliers.velocity.fired)).toBe(true);
    expect(signals.some(signal => signal.confidenceMultipliers.elasticity.fired)).toBe(true);
    expect(signals.some(signal => signal.confidenceMultipliers.decay.fired)).toBe(true);
    const diagnostics = module.getSnapshot().diagnostics;
    expect(diagnostics.crossesDetected).toBeGreaterThan(0);
    expect(diagnostics.eventsFresh).toBeGreaterThan(0);
    expect(diagnostics.filtersComputed).toBeGreaterThan(0);
    expect(diagnostics.votesEmitted).toBeGreaterThan(0);
    expect(module.getSnapshot().config).toEqual(expect.objectContaining({
      baseConfidence: 0.4,
      confluenceWeight: 0.4,
      velocityWindowBars: 5,
      elasticityBandAtr: [0.5, 2.5],
      decayBars: 10,
    }));
  });
});
