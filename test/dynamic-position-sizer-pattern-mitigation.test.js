'use strict';

describe('DynamicPositionSizer Fix 18 mitigation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.PATTERN_MULT_PROMOTED;
    delete process.env.PATTERN_MULT_NEUTRAL;
    delete process.env.PATTERN_MULT_LEARNING;
    delete process.env.PATTERN_MULT_QUARANTINED;
    delete process.env.PATTERN_MULT_UNKNOWN;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function calculateForStatus(status, configOverrides = {}) {
    const DynamicPositionSizer = require('../core/DynamicPositionSizer');
    const sizer = new DynamicPositionSizer({
      basePositionPercent: 0.01,
      maxPositionPercent: 1.0,
      confidenceCurve: [
        { confidence: 0.00, multiplier: 1.00 },
        { confidence: 1.00, multiplier: 1.00 },
      ],
      volatilityCurve: [
        { atrPercent: 0.00, multiplier: 1.00 },
        { atrPercent: 1.00, multiplier: 1.00 },
      ],
      ...configOverrides,
    });
    sizer.setPatternMemory({
      getConfidence: jest.fn(() => status ? {
        status,
        confidence: 0.9,
        stats: { wins: 30, losses: 5 },
      } : null),
    });

    return sizer.calculate({
      balance: 10000,
      confidence: 0.6,
      atrPercent: 0.3,
      features: [0.1, 0.2, 0.3],
      price: 100,
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'default',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
      scopeKey: 'backtest:alpaca:default:stocks:TSLA:15m',
    });
  }

  test('configured pattern status cannot boost or reduce dynamic sizing while Fix 18 is pending', () => {
    process.env.PATTERN_MULT_PROMOTED = '1.5';
    process.env.PATTERN_MULT_QUARANTINED = '0.25';
    jest.resetModules();

    const TradingConfig = require('../core/TradingConfig');
    expect(TradingConfig.get('entryLogic.sizing.patternMultipliers')).toEqual({
      promoted: 1,
      neutral: 1,
      learning: 1,
      quarantined: 1,
      unknown: 1,
    });

    const promoted = calculateForStatus('promoted');
    const quarantined = calculateForStatus('quarantined');
    const neutral = calculateForStatus('neutral');
    const unknown = calculateForStatus(null);
    const constructorOverride = calculateForStatus('promoted', {
      patternMultipliers: {
        promoted: 1.5,
        neutral: 1,
        learning: 1,
        quarantined: 0.25,
        unknown: 1,
      },
    });
    const halfKellyOverride = calculateForStatus('promoted', {
      useHalfKelly: true,
      kellyMinSamples: 1,
    });

    expect(promoted.sizeUSD).toBeCloseTo(100, 8);
    expect(quarantined.sizeUSD).toBeCloseTo(promoted.sizeUSD, 8);
    expect(neutral.sizeUSD).toBeCloseTo(promoted.sizeUSD, 8);
    expect(unknown.sizeUSD).toBeCloseTo(promoted.sizeUSD, 8);
    expect(constructorOverride.sizeUSD).toBeCloseTo(promoted.sizeUSD, 8);
    expect(halfKellyOverride.sizeUSD).toBeCloseTo(promoted.sizeUSD, 8);

    for (const result of [promoted, quarantined, neutral, unknown, constructorOverride, halfKellyOverride]) {
      expect(result.multipliers.pattern).toBe(1);
      expect(result.multipliers.combined).toBe(1);
    }
    expect(promoted.patternStatus).toBe('promoted');
    expect(quarantined.patternStatus).toBe('quarantined');
  });
});
