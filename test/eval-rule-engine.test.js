'use strict';

const EvalRuleEngine = require('../core/EvalRuleEngine');

const BASE_TIME = 1700000000000;

function config(overrides = {}) {
  return {
    enabled: true,
    ttp: {
      enabled: true,
      volumeCap: {
        enabled: true,
        percent: 0.05,
        timeframe: '1m',
        fallbackToMostRecentVolume: true,
        maxReferenceAgeMs: 180000,
        ...overrides.volumeCap,
      },
      ...overrides.ttp,
    },
    ...overrides,
  };
}

function entryPlan(overrides = {}) {
  return {
    action: 'BUY',
    side: 'buy',
    direction: 'long',
    symbol: 'TSLA',
    assetClass: 'stocks',
    brokerId: 'alpaca',
    executionMode: 'live',
    timeframe: '15m',
    price: 100,
    sizeUsd: 500,
    orderQuantity: 500,
    quantityUnit: 'shares',
    ...overrides,
  };
}

function candle(offsetMs, volume) {
  return {
    t: BASE_TIME + offsetMs - 60000,
    etime: BASE_TIME + offsetMs,
    o: 100,
    h: 101,
    l: 99,
    c: 100,
    v: volume,
  };
}

function makeEngine({ cfg = config(), candles = [candle(-60000, 10000)], getCandles, now = () => BASE_TIME } = {}) {
  return new EvalRuleEngine({
    config: cfg,
    getCandles: getCandles || jest.fn(() => candles),
    now,
  });
}

describe('EvalRuleEngine TTP volume cap', () => {
  test('does not touch candles when eval rules are disabled', async () => {
    const getCandles = jest.fn();
    const engine = makeEngine({ cfg: config({ enabled: false }), getCandles });

    const result = await engine.check(entryPlan());

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('eval_rules_disabled');
    expect(getCandles).not.toHaveBeenCalled();
  });

  test('blocks opening shares above 5 percent of previous one-minute volume', async () => {
    const engine = makeEngine({ candles: [candle(-60000, 10000)] });

    const result = await engine.check(entryPlan({ orderQuantity: 501 }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      ruleId: 'TTP_VOLUME_5_PERCENT',
      reason: 'volume_cap_exceeded',
      previousOneMinuteVolume: 10000,
      maxAllowedShares: 500,
      proposedShares: 501,
      action: 'BLOCK_ORDER',
    }));
  });

  test('aggregates repeated opening orders against the same reference candle', async () => {
    const engine = makeEngine({
      cfg: config({ volumeCap: { reserveOnAllow: false } }),
      candles: [candle(-60000, 10000)],
    });

    const first = await engine.check(entryPlan({ orderQuantity: 300 }));
    const second = await engine.check(entryPlan({ orderQuantity: 250 }));

    expect(first.allowed).toBe(true);
    expect(first.inputs.projectedShares).toBe(300);
    expect(second.allowed).toBe(false);
    expect(second.failedRules[0]).toEqual(expect.objectContaining({
      reason: 'volume_cap_exceeded',
      alreadyReservedShares: 300,
      projectedShares: 550,
      maxAllowedShares: 500,
    }));
  });

  test('uses most recent one-minute candle with volume when prior minute volume is zero', async () => {
    const engine = makeEngine({
      candles: [
        candle(-120000, 8000),
        candle(-60000, 0),
      ],
    });

    const result = await engine.check(entryPlan({ orderQuantity: 400 }));

    expect(result.allowed).toBe(true);
    expect(result.inputs.previousOneMinuteVolume).toBe(8000);
    expect(result.inputs.maxAllowedShares).toBe(400);
  });

  test('fails closed when no usable one-minute volume exists', async () => {
    const engine = makeEngine({ candles: [] });

    const result = await engine.check(entryPlan({ orderQuantity: 1 }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      ruleId: 'TTP_VOLUME_5_PERCENT',
      reason: 'missing_reference_volume',
      action: 'BLOCK_ORDER',
    }));
  });

  test('fails closed when TTP volume gate receives a non-share entry plan', async () => {
    const engine = makeEngine();

    const result = await engine.check(entryPlan({
      assetClass: 'crypto',
      orderQuantity: 0.01,
      quantityUnit: 'base',
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      reason: 'non_share_quantity',
      quantityUnit: 'base',
    }));
  });

  test('fails closed when the latest one-minute candle is stale', async () => {
    const engine = makeEngine({
      candles: [candle(-600000, 1000000)],
    });

    const result = await engine.check(entryPlan({ orderQuantity: 500 }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      reason: 'stale_reference_volume',
      latestCandleTimeMs: BASE_TIME - 600000,
      maxReferenceAgeMs: 180000,
    }));
  });

  test('ignores future candles and checks the latest completed one-minute candle', async () => {
    const engine = makeEngine({
      candles: [
        candle(-60000, 1000),
        candle(60000, 1000000),
      ],
    });

    const result = await engine.check(entryPlan({ orderQuantity: 51 }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      reason: 'volume_cap_exceeded',
      previousOneMinuteVolume: 1000,
      maxAllowedShares: 50,
      proposedShares: 51,
    }));
  });
});
