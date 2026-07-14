'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');
const MADynamicSR = require('../modules/MADynamicSR');

function candle(close, overrides = {}) {
  const open = overrides.open ?? close;
  return {
    t: overrides.t ?? Date.now(),
    o: open,
    h: overrides.high ?? Math.max(open, close) + 0.25,
    l: overrides.low ?? Math.min(open, close) - 0.25,
    c: close,
    v: overrides.volume ?? 1000,
  };
}

function masrConfig(overrides = {}) {
  const base = ConfigLoader.BASE_CONFIG.strategies.MADynamicSR;
  return {
    ...base,
    ...overrides,
    conditionFlags: {
      ...base.conditionFlags,
      ...(overrides.conditionFlags || {}),
    },
    multipliers: {
      ...base.multipliers,
      ...(overrides.multipliers || {}),
    },
    structural: {
      ...base.structural,
      ...(overrides.structural || {}),
    },
  };
}

function fallingMaTouchCandles() {
  const history = [];
  for (let i = 0; i < 229; i += 1) {
    const close = 120 - (i * 0.08);
    history.push(candle(close, { open: close + 0.05, high: close + 0.25, low: close - 0.25, t: i }));
  }

  const probe = new MADynamicSR(masrConfig());
  const ma20 = probe._ema(history.map(item => item.c), 20);
  const finalClose = ma20 * 1.001;
  history.push(candle(finalClose, {
    open: finalClose + 1.0,
    high: finalClose + 1.1,
    low: finalClose - 0.2,
    t: 230,
  }));
  return history;
}

describe('MADynamicSR Trader DNA restoration', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('uses falling 20MA slope to reject the parent buy-on-above-MA touch', () => {
    const strategy = new MADynamicSR(masrConfig({
      conditionFlags: {
        extension: false,
        firstTouchAfterParabolic: false,
        pullbackCooldown: false,
        confirmationCandle: false,
        srAlignment: false,
        structuralValidity: false,
      },
    }));
    const candles = fallingMaTouchCandles();

    const signal = strategy.update(candles[candles.length - 1], candles);

    expect(signal.touchingMA).toBe(true);
    expect(signal.maSlope).toBe('falling');
    expect(signal.direction).toBe('sell');
    expect(signal.reason).toContain('falling 20 EMA');
    expect(strategy.getSnapshot().diagnostics.trendBearish).toBe(1);
  });

  test('keeps direction slope-owned even when trendGate is disabled for ablation', () => {
    const strategy = new MADynamicSR(masrConfig({
      conditionFlags: {
        trendGate: false,
        extension: false,
        firstTouchAfterParabolic: false,
        pullbackCooldown: false,
        confirmationCandle: false,
        srAlignment: false,
        structuralValidity: false,
      },
    }));
    const candles = fallingMaTouchCandles();

    const signal = strategy.update(candles[candles.length - 1], candles);

    expect(signal.maSlope).toBe('falling');
    expect(signal.direction).toBe('sell');
    expect(signal.reason).toContain('falling 20 EMA');
    expect(signal.confidenceProfile.components.trendGate.enabled).toBe(false);
  });

  test('rejects slope config that can turn a one-candle bounce into trend direction', () => {
    expect(() => new MADynamicSR(masrConfig({ minSlopePct: 0 })))
      .toThrow(/minSlopePct must be greater than 0/);
    expect(() => new MADynamicSR(masrConfig({ slopeLookback: 1 })))
      .toThrow(/slopeLookback must be at least 2 bars/);
  });

  test('emits evidence for every restored confidence condition', () => {
    const strategy = new MADynamicSR(masrConfig({ maxExtensionAtr: 0.01 }));
    const candles = fallingMaTouchCandles();
    const closes = candles.map(item => item.c);
    const ma20 = strategy._ema(closes, strategy.entryMaPeriod);

    strategy._wasExtended = true;
    strategy.inPullbackTaken = true;
    strategy.srLevels = [{
      price: ma20,
      tests: strategy.srTestCount,
      lastTest: strategy.barCount + 1,
      type: 'resistance',
    }];

    const signal = strategy.update(candles[candles.length - 1], candles);
    const components = signal.confidenceProfile.components;

    expect(signal.direction).toBe('sell');
    expect(components.trendGate.hardCondition).toBe(true);
    expect(components.trendGate.passed).toBe(true);
    expect(components.extension.fired).toBe(true);
    expect(components.firstTouchAfterParabolic.fired).toBe(true);
    expect(components.pullbackCooldown.fired).toBe(true);
    expect(components.confirmationCandle.state).toBe('aligned');
    expect(components.srAlignment.state).toBe('aligned');
    expect(components.structuralValidity.state).toBe('valid');
    expect(signal.confidenceProfile.composite).toBeLessThan(1);
  });
});
