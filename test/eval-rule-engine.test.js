'use strict';

const EvalRuleEngine = require('../core/EvalRuleEngine');

const BASE_TIME = Date.parse('2023-11-14T15:00:00.000Z');

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
      earningsRestriction: {
        enabled: true,
        blockEntries: true,
        requireKnownStatus: true,
        manualStatus: {
          date: '2023-11-14',
          symbols: { TSLA: false },
        },
        ...overrides.earningsRestriction,
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
    hasEarningsTonight: false,
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
      'TTP_EARNINGS_RESTRICTION',
      'TTP_VOLUME_5_PERCENT',
    ]));
  });

  test('blocks entries when earnings are scheduled tonight', async () => {
    const engine = makeEngine({
      cfg: config({
        earningsRestriction: {
          manualStatus: {
            date: '2023-11-14',
            symbols: { TSLA: true },
          },
        },
      }),
      candles: [candle(-60000, 100000)],
    });

    const result = await engine.check(entryPlan({
      orderQuantity: 10,
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'earnings_tonight_no_openings',
      hasEarningsTonight: true,
      statusSource: 'config.ttp.earningsRestriction.manualStatus.TSLA',
      action: 'BLOCK_ORDER',
    })]);
  });

  test('fails closed when manual earnings status is missing', async () => {
    const engine = makeEngine({
      cfg: config({
        earningsRestriction: {
          manualStatus: null,
        },
      }),
      candles: [candle(-60000, 100000)],
    });

    const plan = entryPlan({ orderQuantity: 10 });
    delete plan.hasEarningsTonight;
    const result = await engine.check(plan);

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'missing_manual_earnings_status',
      statusSource: 'config.ttp.earningsRestriction.manualStatus',
      action: 'BLOCK_ORDER',
    })]);
  });

  test('fails closed when TTP config omits the earnings restriction block', async () => {
    const cfg = config();
    delete cfg.ttp.earningsRestriction;
    const engine = makeEngine({ cfg, candles: [candle(-60000, 100000)] });

    const plan = entryPlan({ orderQuantity: 10 });
    delete plan.hasEarningsTonight;
    const result = await engine.check(plan);

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'missing_manual_earnings_status',
      action: 'BLOCK_ORDER',
    })]);
  });

  test('refuses external earnings provider when manual eval status is missing', async () => {
    const getEarningsStatus = jest.fn(() => ({ hasEarningsTonight: false, source: 'test-provider' }));
    const engine = new EvalRuleEngine({
      config: config({
        earningsRestriction: {
          manualStatus: null,
        },
      }),
      getCandles: jest.fn(() => [candle(-60000, 100000)]),
      getEarningsStatus,
      now: () => BASE_TIME,
    });

    const plan = entryPlan({ orderQuantity: 10 });
    delete plan.hasEarningsTonight;
    const result = await engine.check(plan);

    expect(result.allowed).toBe(false);
    expect(getEarningsStatus).not.toHaveBeenCalled();
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'missing_manual_earnings_status',
      statusSource: 'config.ttp.earningsRestriction.manualStatus',
    })]);
  });

  test('uses manual earnings status config before external provider lookup', async () => {
    const getEarningsStatus = jest.fn(() => ({ hasEarningsTonight: true, source: 'wrong-provider' }));
    const engine = new EvalRuleEngine({
      config: config({
        earningsRestriction: {
          manualStatus: {
            date: '2023-11-14',
            symbols: { TSLA: false },
          },
        },
      }),
      getCandles: jest.fn(() => [candle(-60000, 100000)]),
      getEarningsStatus,
      now: () => BASE_TIME,
    });

    const plan = entryPlan({ orderQuantity: 10 });
    delete plan.hasEarningsTonight;
    const result = await engine.check(plan);

    expect(result.allowed).toBe(true);
    expect(getEarningsStatus).not.toHaveBeenCalled();
    expect(result.passedRules).toContain('TTP_EARNINGS_RESTRICTION');
    expect(result.inputs).toEqual(expect.objectContaining({
      statusSource: 'config.ttp.earningsRestriction.manualStatus.TSLA',
      hasEarningsTonight: false,
    }));
  });

  test('blocks entries when manual earnings status says the symbol has earnings tonight', async () => {
    const engine = new EvalRuleEngine({
      config: config({
        earningsRestriction: {
          manualStatus: {
            date: '2023-11-14',
            symbols: { TSLA: true },
          },
        },
      }),
      getCandles: jest.fn(() => [candle(-60000, 100000)]),
      now: () => BASE_TIME,
    });

    const plan = entryPlan({ orderQuantity: 10 });
    delete plan.hasEarningsTonight;
    const result = await engine.check(plan);

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'earnings_tonight_no_openings',
      statusSource: 'config.ttp.earningsRestriction.manualStatus.TSLA',
      hasEarningsTonight: true,
    })]);
  });

  test('manual earnings status overrides contradictory entry-plan fields', async () => {
    const engine = new EvalRuleEngine({
      config: config({
        earningsRestriction: {
          manualStatus: {
            date: '2023-11-14',
            symbols: { TSLA: true },
          },
        },
      }),
      getCandles: jest.fn(() => [candle(-60000, 100000)]),
      now: () => BASE_TIME,
    });

    const result = await engine.check(entryPlan({
      hasEarningsTonight: false,
      earningsTonight: false,
      earnings: { hasEarningsTonight: false },
      orderQuantity: 10,
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'earnings_tonight_no_openings',
      statusSource: 'config.ttp.earningsRestriction.manualStatus.TSLA',
      hasEarningsTonight: true,
    })]);
  });

  test('fails closed when manual earnings status is for a different ET date', async () => {
    const engine = new EvalRuleEngine({
      config: config({
        earningsRestriction: {
          manualStatus: {
            date: '2023-11-13',
            symbols: { TSLA: false },
          },
        },
      }),
      getCandles: jest.fn(() => [candle(-60000, 100000)]),
      now: () => BASE_TIME,
    });

    const plan = entryPlan({ orderQuantity: 10 });
    delete plan.hasEarningsTonight;
    const result = await engine.check(plan);

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'missing_earnings_status',
      statusSource: 'config.ttp.earningsRestriction.manualStatus',
      hasEarningsTonight: null,
    })]);
  });

  test('stale manual earnings status cannot fall through to entry-plan false fields', async () => {
    const engine = new EvalRuleEngine({
      config: config({
        earningsRestriction: {
          manualStatus: {
            date: '2023-11-13',
            symbols: { TSLA: true },
          },
        },
      }),
      getCandles: jest.fn(() => [candle(-60000, 100000)]),
      now: () => BASE_TIME,
    });

    const result = await engine.check(entryPlan({
      hasEarningsTonight: false,
      earningsTonight: false,
      earnings: { hasEarningsTonight: false },
      orderQuantity: 10,
    }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules).toEqual([expect.objectContaining({
      ruleId: 'TTP_EARNINGS_RESTRICTION',
      reason: 'missing_earnings_status',
      statusSource: 'config.ttp.earningsRestriction.manualStatus',
      hasEarningsTonight: null,
    })]);
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

  test('blocks new openings after regular market close when TTP cutoff blocking is enabled', async () => {
    const afterClose = new Date('2026-05-22T20:00:00.000Z');
    const engine = makeEngine({
      candles: [candleFor(afterClose.getTime(), -60000, 100000)],
      now: () => afterClose.getTime(),
    });

    const result = await engine.check(entryPlan({ orderQuantity: 10 }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      ruleId: 'TTP_MARKET_TIME',
      reason: 'outside_regular_session_no_openings',
      cutoffMinute: 950,
      rthCloseMinute: 960,
      phase: 'ah',
      action: 'BLOCK_ORDER',
    }));
  });

  test('blocks new openings before regular market open when TTP cutoff blocking is enabled', async () => {
    const premarket = new Date('2026-05-22T13:29:00.000Z');
    const engine = makeEngine({
      candles: [candleFor(premarket.getTime(), -60000, 100000)],
      now: () => premarket.getTime(),
    });

    const result = await engine.check(entryPlan({ orderQuantity: 10 }));

    expect(result.allowed).toBe(false);
    expect(result.failedRules[0]).toEqual(expect.objectContaining({
      ruleId: 'TTP_MARKET_TIME',
      reason: 'outside_regular_session_no_openings',
      cutoffMinute: 950,
      rthCloseMinute: 960,
      phase: 'pre',
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
          earningsRestriction: {
            manualStatus: {
              date: '2026-05-22',
              symbols: { TSLA: false },
            },
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
