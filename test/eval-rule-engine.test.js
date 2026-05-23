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
      marketTime: {
        enabled: true,
        blockEntriesAfterCutoff: true,
        liquidationEnabled: true,
        cutoffMinutesBeforeClose: 10,
        ...overrides.marketTime,
      },
      accountLimits: {
        enabled: true,
        enforceDailyLossPause: true,
        enforceMaxLoss: true,
        accountStartOfDayDate: '2023-11-14',
        accountStartOfDayEquity: 50000,
        dailyLossDollars: 500,
        maxLossThresholdEquity: 47500,
        ...overrides.accountLimits,
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
    currentEquity: 50000,
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

function candleFor(nowMs, offsetMs, volume) {
  return {
    t: nowMs + offsetMs - 60000,
    etime: nowMs + offsetMs,
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

  test('carries trace identity through eval rule outputs', async () => {
    const engine = makeEngine({ candles: [candle(-60000, 10000)] });

    const result = await engine.check(entryPlan({
      traceId: 'trace_test_1',
      signalId: 'signal_test_1',
      orderQuantity: 501,
    }));

    expect(result.allowed).toBe(false);
    expect(result.traceId).toBe('trace_test_1');
    expect(result.signalId).toBe('signal_test_1');
    expect(result.symbol).toBe('TSLA');
    expect(result.inputs).toEqual(expect.objectContaining({
      traceId: 'trace_test_1',
      signalId: 'signal_test_1',
      symbol: 'TSLA',
    }));
  });

  test('blocks entries at the fixed start-of-day daily loss pause threshold', async () => {
    const engine = makeEngine({ candles: [candle(-60000, 10000)] });

    const result = await engine.check(entryPlan({
      currentEquity: 49500,
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_DAILY_LOSS_PAUSE',
      reason: 'daily_loss_pause_reached',
      accountStartOfDayEquity: 50000,
      dailyLossDollars: 500,
      dailyPauseThreshold: 49500,
      currentEquity: 49500,
    })]);
    expect(result.inputs).toEqual(expect.objectContaining({
      accountStartOfDayEquity: 50000,
      dailyLossDollars: 500,
      dailyPauseThreshold: 49500,
      currentEquity: 49500,
    }));
  });

  test('blocks stale start-of-day equity from a prior ET trading date', async () => {
    const engine = makeEngine({
      cfg: config({
        accountLimits: {
          accountStartOfDayDate: '2023-11-13',
        },
      }),
      candles: [candle(-60000, 10000)],
    });

    const result = await engine.check(entryPlan({
      currentEquity: 50000,
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_DAILY_LOSS_PAUSE',
      reason: 'stale_start_of_day_equity',
      accountStartOfDayDate: '2023-11-13',
      currentDateET: '2023-11-14',
      currentEquity: 50000,
    })]);
  });

  test('fails closed when current equity is missing from the entry plan', async () => {
    const engine = makeEngine({ candles: [candle(-60000, 10000)] });

    const result = await engine.check(entryPlan({
      currentEquity: null,
      accountEquity: undefined,
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_ACCOUNT_LIMITS',
      reason: 'missing_current_equity',
    })]);
  });

  test('blocks entries at the max-loss account disable boundary', async () => {
    const engine = makeEngine({ candles: [candle(-60000, 10000)] });

    const result = await engine.check(entryPlan({
      currentEquity: 47500,
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_MAX_LOSS',
      reason: 'max_loss_threshold_reached',
      maxLossThresholdEquity: 47500,
      currentEquity: 47500,
    })]);
  });

  test('passes account limits before applying the 5 percent volume rule', async () => {
    const engine = makeEngine({ candles: [candle(-60000, 10000)] });

    const result = await engine.check(entryPlan({
      currentEquity: 49999,
      orderQuantity: 500,
    }));

    expect(result.allowed).toBe(true);
    expect(result.passedRules).toEqual(expect.arrayContaining([
      'TTP_DAILY_LOSS_PAUSE',
      'TTP_MAX_LOSS',
      'TTP_VOLUME_5_PERCENT',
    ]));
  });

  test('blocks new openings during the TTP liquidation window', async () => {
    const cutoffTime = new Date('2026-05-22T19:50:00.000Z');
    const engine = makeEngine({
      candles: [candle(-60000, 100000)],
      now: () => cutoffTime.getTime(),
    });

    const result = await engine.check(entryPlan({ orderQuantity: 10 }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      ruleId: 'TTP_MARKET_TIME',
      reason: 'liquidation_window_no_openings',
      cutoffMinute: 950,
      rthCloseMinute: 960,
      action: 'BLOCK_ORDER',
    }));
  });

  test('allows new openings before the TTP liquidation window', async () => {
    const beforeCutoff = new Date('2026-05-22T19:49:00.000Z');
    const engine = makeEngine({
      cfg: config({
        accountLimits: {
          accountStartOfDayDate: '2026-05-22',
        },
      }),
      candles: [candleFor(beforeCutoff.getTime(), -60000, 100000)],
      now: () => beforeCutoff.getTime(),
    });

    const result = await engine.check(entryPlan({ orderQuantity: 10 }));

    expect(result.allowed).toBe(true);
    expect(result.passedRules).toEqual(expect.arrayContaining([
      'TTP_MARKET_TIME',
      'TTP_VOLUME_5_PERCENT',
    ]));
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
