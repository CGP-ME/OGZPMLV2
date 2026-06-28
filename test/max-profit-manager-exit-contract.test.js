'use strict';

const MaxProfitManager = require('../core/MaxProfitManager');
const TradingConfig = require('../core/TradingConfig');

describe('MaxProfitManager exit contract stop basis', () => {
  let logSpy;
  let warnSpy;

  const MPM_OVERRIDE_PATHS = {
    enableTieredExit: 'exitLogic.tieredExit.enabled',
    firstTierTarget: 'exits.profitTiers.tier1',
    firstTierExit: 'exitLogic.tieredExit.tier1ExitFraction',
    secondTierTarget: 'exits.profitTiers.tier2',
    secondTierExit: 'exitLogic.tieredExit.tier2ExitFraction',
    thirdTierTarget: 'exits.profitTiers.tier3',
    thirdTierExit: 'exitLogic.tieredExit.tier3ExitFraction',
    finalTarget: 'exits.profitTiers.final',
    enableTrailingStop: 'exitLogic.trail.enabled',
    enableBreakevenStop: 'exitLogic.breakEvenStop.enabled',
    enableTimeBasedAdjustments: 'holdTimes.enableTimeBasedAdjustments',
    maxHoldTimeMinutes: 'holdTimes.defaultMaxHold',
    minHoldTimeMinutes: 'holdTimes.minHoldTimeMinutes',
    timeAdjustmentIntervals: 'holdTimes.tighteningSchedule',
    enableVolatilityAdjustment: 'exitLogic.volatilityAdjustment.enabled',
    enableMarketAdaptation: 'exitLogic.tieredExit.enableMarketAdaptation',
    beScaleOutEnabled: 'exitLogic.beScaleOut.enabled',
    beScaleOutTriggerType: 'exitLogic.beScaleOut.triggerType',
    beScaleOutFixedPercentTrigger: 'exitLogic.beScaleOut.fixedPercentTrigger',
    beScaleOutScaleOutFraction: 'exitLogic.beScaleOut.scaleOutFraction',
    beScaleOutFeeBufferPercent: 'exitLogic.beScaleOut.feeBufferPercent',
  };

  function toTradingConfigOverrides(config = {}) {
    const overrides = {};
    for (const [key, value] of Object.entries(config)) {
      if (key === 'initialStopLossPercent') {
        overrides['exits.stopLossPercent'] = value * 100;
      } else if (key === 'breakevenThreshold') {
        overrides['exitLogic.breakEvenStop.triggerPercent'] = value * 100;
      } else if (key === 'minProfit') {
        overrides['exitLogic.trail.minActivationPercent'] = value * 100;
      } else if (key === 'trailDistance') {
        overrides['exits.normalTrailDistance'] = value;
      } else if (key === 'tightTrailThreshold') {
        overrides['exitLogic.trail.profitRatchetThreshold'] = value * 100;
      } else if (key === 'tightTrailDistance') {
        overrides['exits.tightTrailDistance'] = value;
      } else if (key === 'lowVolatilityThreshold') {
        overrides['exitLogic.volatilityAdjustment.lowThresholdPercent'] = value * 100;
      } else if (key === 'highVolatilityThreshold') {
        overrides['exitLogic.volatilityAdjustment.highThresholdPercent'] = value * 100;
      } else if (key === 'volatilityLookbackPeriods') {
        overrides['exitLogic.volatilityAdjustment.lookbackPeriods'] = value;
      } else if (MPM_OVERRIDE_PATHS[key]) {
        overrides[MPM_OVERRIDE_PATHS[key]] = value;
      } else {
        throw new Error(`Test attempted unsupported MaxProfitManager constructor override: ${key}`);
      }
    }
    return overrides;
  }

  function createManager(config = {}) {
    const overrides = toTradingConfigOverrides(config);
    if (Object.keys(overrides).length > 0) {
      TradingConfig.setOverrides(overrides);
    }
    return new MaxProfitManager();
  }

  function tradeExitContract(overrides = {}) {
    return {
      useStructuralExits: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    if (typeof TradingConfig.clearOverrides === 'function') {
      TradingConfig.clearOverrides();
    }
  });

  function startManager(direction, exitContract, config = {}) {
    const manager = createManager({
      initialStopLossPercent: 0.008,
      enableTieredExit: false,
      enableTrailingStop: false,
      breakevenThreshold: 0.05,
      ...config,
    });
    const result = manager.start(100, direction, 10, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: tradeExitContract(exitContract),
    });
    expect(result.success).toBe(true);
    return manager;
  }

  test('long positions use the trade exit contract stop, not the global stop config', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 });

    expect(manager.state.initialStopPercent).toBeCloseTo(0.005, 10);
    expect(manager.state.initialStop).toBeCloseTo(99.5, 10);
    expect(manager.state.currentStop).toBeCloseTo(99.5, 10);
  });

  test('short positions use the trade exit contract stop in the correct direction', () => {
    const manager = startManager('sell', { stopLossPercent: -0.5 });

    expect(manager.state.initialStopPercent).toBeCloseTo(0.005, 10);
    expect(manager.state.initialStop).toBeCloseTo(100.5, 10);
    expect(manager.state.currentStop).toBeCloseTo(100.5, 10);
  });

  test('one-to-one-R break-even scale-out uses the trade contract stop distance', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 }, {
      beScaleOutEnabled: true,
      beScaleOutTriggerType: 'one_to_one_r',
      beScaleOutScaleOutFraction: 0.5,
      beScaleOutFeeBufferPercent: 0,
    });

    const beforeTrigger = manager.update(100.49, { volatility: 0.01 });
    expect(beforeTrigger.action).not.toBe('exit_partial');

    const atContractR = manager.update(100.5, { volatility: 0.01 });
    expect(atContractR.action).toBe('exit_partial');
    expect(atContractR.reason).toBe('be_scaleout');
  });

  test('malformed trade exit contracts fail loudly instead of falling back to global stop config', () => {
    const manager = createManager({
      initialStopLossPercent: 0.008,
      enableTieredExit: false,
    });

    expect(() => manager.start(100, 'buy', 10, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: tradeExitContract({ takeProfitPercent: 1 }),
    })).toThrow(/exitContract\.stopLossPercent missing\/invalid/);
  });

  test('trade exit contracts require explicit structural-exit ownership', () => {
    const manager = createManager({
      initialStopLossPercent: 0.008,
      enableTieredExit: false,
    });

    expect(() => manager.start(100, 'buy', 10, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: { stopLossPercent: -0.5 },
    })).toThrow(/exitContract\.useStructuralExits missing\/invalid/);
  });

  test('wrong-sign trade stop contracts fail before replacing existing manager state', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 });
    const previousState = manager.state;

    expect(() => manager.start(100, 'buy', 10, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: tradeExitContract({ stopLossPercent: 0.5 }),
    })).toThrow(/must be negative risk distance/);
    expect(manager.state).toBe(previousState);
    expect(manager.state.initialStopPercent).toBeCloseTo(0.005, 10);
  });

  test('break-even stop uses per-share minimum fee model instead of taker percent', () => {
    TradingConfig.setOverrides({
      'fees.model': 'per_share_minimum',
      'fees.perShare': 0.005,
      'fees.minOrderFee': 0.75,
      'fees.makerFee': 0,
      'fees.takerFee': 0,
      'fees.totalRoundTrip': 0,
    });
    const manager = createManager({
      initialStopLossPercent: 0.008,
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: true,
      breakevenThreshold: 0.05,
    });

    const result = manager.start(100, 'buy', 100, {
      volatility: 0.01,
      confidence: 0.7,
      entryOrderQuantity: 1,
      entryOrderQuantityUnit: 'shares',
      exitContract: tradeExitContract({ stopLossPercent: -0.5 }),
    });
    expect(result.success).toBe(true);

    manager.state.currentPrice = 102;
    manager.updateBreakevenStop(0.1);

    expect(manager.state.currentStop).toBeCloseTo(101.5);
    expect(manager.state.breakevenActive).toBe(true);
  });

  test('unrealized PnL uses USD notional return without multiplying by entry price', () => {
    const manager = createManager({
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      initialStopLossPercent: 0.05,
      minHoldTimeMinutes: 0,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: tradeExitContract({ stopLossPercent: -5 }),
    });
    expect(result.success).toBe(true);

    manager.update(101.5, { volatility: 0.01 });

    expect(manager.state.unrealizedPnL).toBeCloseTo(15, 10);
    expect(manager.getPositionState().totalPnL).toBeCloseTo(15, 10);
  });

  test('break-even scale-out realized PnL uses scale-out notional return', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 }, {
      minHoldTimeMinutes: 0,
      beScaleOutEnabled: true,
      beScaleOutTriggerType: 'fixed_percent',
      beScaleOutFixedPercentTrigger: 1.5,
      beScaleOutScaleOutFraction: 0.5,
      beScaleOutFeeBufferPercent: 0,
    });

    const update = manager.update(101.5, { volatility: 0.01 });

    expect(update.action).toBe('exit_partial');
    expect(update.reason).toBe('be_scaleout');
    expect(update.exitSize).toBeCloseTo(5, 10);
    expect(manager.state.realizedPnL).toBeCloseTo(0.075, 10);
  });

  test('tier partial exit realized and narrator PnL use exit notional return', () => {
    const manager = createManager({
      enableTieredExit: true,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      initialStopLossPercent: 0.05,
      minHoldTimeMinutes: 0,
      firstTierTarget: 0.015,
      firstTierExit: 0.25,
      secondTierTarget: 0.05,
      secondTierExit: 0.25,
      thirdTierTarget: 0.10,
      thirdTierExit: 0.25,
      finalTarget: 0.15,
      enableMarketAdaptation: false,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: tradeExitContract({ stopLossPercent: -5 }),
    });
    expect(result.success).toBe(true);

    const update = manager.update(101.5, { volatility: 0.01 });

    expect(update.action).toBe('exit_partial');
    expect(update.reason).toBe('profit_tier_1');
    expect(update.exitSize).toBeCloseTo(250, 10);
    expect(manager.state.realizedPnL).toBeCloseTo(3.75, 10);
    expect(manager.getPositionState().realizedPnL).toBeCloseTo(3.75, 10);
  });

  test('close summary uses remaining USD notional return without multiplying by entry price', () => {
    const manager = createManager({
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      initialStopLossPercent: 0.05,
      minHoldTimeMinutes: 0,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: tradeExitContract({ stopLossPercent: -5 }),
    });
    expect(result.success).toBe(true);

    manager.state.realizedPnL = 3.75;
    manager.state.remainingSize = 750;

    const summary = manager.close(102, 'manual');

    expect(summary.success).toBe(true);
    expect(summary.remainingPnL).toBeCloseTo(15, 10);
    expect(summary.totalPnL).toBeCloseTo(18.75, 10);
  });

  test('scale-out then final close totals realized leg plus remaining notional PnL', () => {
    const manager = createManager({
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      initialStopLossPercent: 0.05,
      minHoldTimeMinutes: 0,
      beScaleOutEnabled: true,
      beScaleOutTriggerType: 'fixed_percent',
      beScaleOutFixedPercentTrigger: 10,
      beScaleOutScaleOutFraction: 0.5,
      beScaleOutFeeBufferPercent: 0,
    });

    const result = manager.start(100, 'buy', 10000, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: tradeExitContract({ stopLossPercent: -5 }),
    });
    expect(result.success).toBe(true);

    const scaleOut = manager.update(110, { volatility: 0.01 });
    expect(scaleOut.action).toBe('exit_partial');
    expect(scaleOut.exitSize).toBeCloseTo(5000, 10);
    expect(manager.state.remainingSize).toBeCloseTo(5000, 10);
    expect(manager.state.realizedPnL).toBeCloseTo(500, 10);

    const summary = manager.close(115, 'manual');

    expect(summary.remainingPnL).toBeCloseTo(750, 10);
    expect(summary.totalPnL).toBeCloseTo(1250, 10);
    expect(summary.totalPnL).not.toBeCloseTo(1500, 10);
  });

  test('break-even scale-out does not snap a long winner into a green stop-loss before tier development', () => {
    const manager = createManager({
      enableTieredExit: true,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      enableTimeBasedAdjustments: false,
      enableMarketAdaptation: false,
      minHoldTimeMinutes: 0,
      firstTierTarget: 0.015,
      firstTierExit: 0.25,
      secondTierTarget: 0.05,
      secondTierExit: 0.25,
      thirdTierTarget: 0.10,
      thirdTierExit: 0.25,
      finalTarget: 0.15,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.8,
      entryOrderQuantity: 10,
      entryOrderQuantityUnit: 'shares',
      exitContract: tradeExitContract({ stopLossPercent: -0.5, takeProfitPercent: 2 }),
    });
    expect(result.success).toBe(true);

    const scaleOut = manager.update(100.5, { volatility: 0.01 });
    expect(scaleOut.action).toBe('exit_partial');
    expect(scaleOut.reason).toBe('be_scaleout');
    expect(scaleOut.stopMoved).toBe(false);
    expect(manager.state.currentStop).toBeCloseTo(99.5, 10);

    const pullbackStillGreen = manager.update(100.04, { volatility: 0.01 });
    expect(pullbackStillGreen.action).toBe('update');
    expect(pullbackStillGreen.reason).toBeUndefined();

    const tier = manager.update(101.5, { volatility: 0.01 });
    expect(tier.action).toBe('exit_partial');
    expect(tier.reason).toBe('profit_tier_1');
  });

  test('tier exits rebalance against the live runner after break-even scale-out', () => {
    const manager = createManager({
      enableTieredExit: true,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      enableTimeBasedAdjustments: false,
      enableMarketAdaptation: false,
      minHoldTimeMinutes: 0,
      firstTierTarget: 0.015,
      firstTierExit: 0.30,
      secondTierTarget: 0.05,
      secondTierExit: 0.30,
      thirdTierTarget: 0.10,
      thirdTierExit: 0.20,
      finalTarget: 0.15,
      beScaleOutEnabled: true,
      beScaleOutTriggerType: 'fixed_percent',
      beScaleOutFixedPercentTrigger: 0.5,
      beScaleOutScaleOutFraction: 0.5,
      beScaleOutFeeBufferPercent: 0,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.8,
      exitContract: tradeExitContract({ stopLossPercent: -0.5, takeProfitPercent: 2 }),
    });
    expect(result.success).toBe(true);

    const scaleOut = manager.update(100.5, { volatility: 0.01 });
    expect(scaleOut.action).toBe('exit_partial');
    expect(scaleOut.reason).toBe('be_scaleout');
    expect(scaleOut.exitSize).toBeCloseTo(500, 10);
    expect(manager.state.remainingSize).toBeCloseTo(500, 10);
    const tierSizesAfterScaleOut = manager.state.tiers.map(tier => tier.exitSize);
    expect(tierSizesAfterScaleOut[0]).toBeCloseTo(150, 10);
    expect(tierSizesAfterScaleOut[1]).toBeCloseTo(150, 10);
    expect(tierSizesAfterScaleOut[2]).toBeCloseTo(100, 10);
    expect(tierSizesAfterScaleOut[3]).toBeCloseTo(100, 10);

    const tier1Price = manager.state.tiers.find(tier => tier.tier === 1).targetPrice;
    const tier1 = manager.update(tier1Price, { volatility: 0.01 });
    expect(tier1.action).toBe('exit_partial');
    expect(tier1.reason).toBe('profit_tier_1');
    expect(tier1.exitSize).toBeCloseTo(150, 10);
    expect(manager.state.remainingSize).toBeCloseTo(350, 10);
    expect(manager.state.tiers.find(tier => tier.tier === 2).exitSize).toBeCloseTo(150, 10);
    expect(manager.state.tiers.find(tier => tier.tier === 3).exitSize).toBeCloseTo(100, 10);
    expect(manager.state.tiers.find(tier => tier.tier === 4).exitSize).toBeCloseTo(100, 10);

    const tier2Price = manager.state.tiers.find(tier => tier.tier === 2).targetPrice;
    const tier2 = manager.update(tier2Price, { volatility: 0.01 });
    expect(tier2.action).toBe('exit_partial');
    expect(tier2.reason).toBe('profit_tier_2');
    expect(tier2.exitSize).toBeCloseTo(150, 10);
    expect(manager.state.remainingSize).toBeCloseTo(200, 10);

    const tier3Price = manager.state.tiers.find(tier => tier.tier === 3).targetPrice;
    const tier3 = manager.update(tier3Price, { volatility: 0.01 });
    expect(tier3.action).toBe('exit_partial');
    expect(tier3.reason).toBe('profit_tier_3');
    expect(tier3.exitSize).toBeCloseTo(100, 10);
    expect(manager.state.remainingSize).toBeCloseTo(100, 10);

    const tier4Price = manager.state.tiers.find(tier => tier.tier === 4).targetPrice;
    const tier4 = manager.update(tier4Price, { volatility: 0.01 });
    expect(tier4.action).toBe('exit_partial');
    expect(tier4.reason).toBe('profit_tier_4');
    expect(tier4.exitSize).toBeCloseTo(100, 10);
    expect(manager.state.remainingSize).toBeCloseTo(0, 10);
  });

  test('oversized tier exit fails before mutating tier completion state', () => {
    const manager = createManager({
      enableTieredExit: true,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      enableTimeBasedAdjustments: false,
      enableMarketAdaptation: false,
      minHoldTimeMinutes: 0,
      firstTierTarget: 0.015,
      firstTierExit: 0.30,
      secondTierTarget: 0.05,
      secondTierExit: 0.30,
      thirdTierTarget: 0.10,
      thirdTierExit: 0.20,
      finalTarget: 0.15,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.8,
      exitContract: tradeExitContract({ stopLossPercent: -0.5, takeProfitPercent: 2 }),
    });
    expect(result.success).toBe(true);
    manager.state.remainingSize = 100;

    expect(() => manager.executePartialExit({
      tier: 1,
      exitSize: 150,
      profitPercent: 0.015,
    })).toThrow(/over-allocated position/);

    expect(manager.state.remainingSize).toBeCloseTo(100, 10);
    expect(manager.state.tiers.find(tier => tier.tier === 1).completed).toBe(false);
    expect(manager.state.completedTiers).toHaveLength(0);
  });

  test('break-even scale-out does not snap a short winner into a green stop-loss before tier development', () => {
    const manager = createManager({
      enableTieredExit: true,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      enableTimeBasedAdjustments: false,
      enableMarketAdaptation: false,
      minHoldTimeMinutes: 0,
      firstTierTarget: 0.015,
      firstTierExit: 0.25,
      secondTierTarget: 0.05,
      secondTierExit: 0.25,
      thirdTierTarget: 0.10,
      thirdTierExit: 0.25,
      finalTarget: 0.15,
    });

    const result = manager.start(100, 'sell', 1000, {
      volatility: 0.01,
      confidence: 0.8,
      entryOrderQuantity: 10,
      entryOrderQuantityUnit: 'shares',
      exitContract: tradeExitContract({ stopLossPercent: -0.5, takeProfitPercent: 2 }),
    });
    expect(result.success).toBe(true);

    const scaleOut = manager.update(99.5, { volatility: 0.01 });
    expect(scaleOut.action).toBe('exit_partial');
    expect(scaleOut.reason).toBe('be_scaleout');
    expect(scaleOut.stopMoved).toBe(false);
    expect(manager.state.currentStop).toBeCloseTo(100.5, 10);

    const pullbackStillGreen = manager.update(99.96, { volatility: 0.01 });
    expect(pullbackStillGreen.action).toBe('update');
    expect(pullbackStillGreen.reason).toBeUndefined();

    const tier = manager.update(98.5, { volatility: 0.01 });
    expect(tier.action).toBe('exit_partial');
    expect(tier.reason).toBe('profit_tier_1');
  });

  test('getState reports active stop and trailing state from manager state', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 }, {
      minHoldTimeMinutes: 0,
    });

    manager.state.trailingActive = true;
    manager.state.currentStop = 101.25;

    expect(manager.getState()).toEqual({
      currentStop: 101.25,
      lastProfitTrigger: null,
      isTrailing: true,
    });
  });

  test('rejects constructor tunables so MPM cannot silently override TradingConfig', () => {
    expect(() => new MaxProfitManager({ enableTieredExit: false })).toThrow(/Constructor tunable overrides are disabled/);
  });

  test('fails loudly when required MPM config has the wrong type', () => {
    TradingConfig.setOverrides({
      'exitLogic.tieredExit.enabled': 'true',
    });

    expect(() => new MaxProfitManager()).toThrow(/exitLogic\.tieredExit\.enabled/);
  });

  test('loads MPM tunables from TradingConfig', () => {
    TradingConfig.setOverrides(toTradingConfigOverrides({
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: true,
      breakevenThreshold: 0.075,
      enableTimeBasedAdjustments: true,
      maxHoldTimeMinutes: 222,
      minHoldTimeMinutes: 3,
      enableVolatilityAdjustment: true,
      lowVolatilityThreshold: 0.007,
      highVolatilityThreshold: 0.025,
      volatilityLookbackPeriods: 33,
      enableMarketAdaptation: false,
    }));

    const manager = new MaxProfitManager();

    expect(manager.config.enableTieredExit).toBe(false);
    expect(manager.config.enableTrailingStop).toBe(false);
    expect(manager.config.enableBreakevenStop).toBe(true);
    expect(manager.config.breakevenThreshold).toBeCloseTo(0.075, 10);
    expect(manager.config.enableTimeBasedAdjustments).toBe(true);
    expect(manager.config.maxHoldTimeMinutes).toBe(222);
    expect(manager.config.minHoldTimeMinutes).toBe(3);
    expect(manager.config.enableVolatilityAdjustment).toBe(true);
    expect(manager.config.lowVolatilityThreshold).toBeCloseTo(0.007, 10);
    expect(manager.config.highVolatilityThreshold).toBeCloseTo(0.025, 10);
    expect(manager.config.volatilityLookbackPeriods).toBe(33);
    expect(manager.config.enableMarketAdaptation).toBe(false);
  });

  test('fixed-percent BE scale-out trigger is config percent-form, not runtime decimal-form', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 }, {
      minHoldTimeMinutes: 0,
      beScaleOutEnabled: true,
      beScaleOutTriggerType: 'fixed_percent',
      beScaleOutFixedPercentTrigger: 1.5,
      beScaleOutScaleOutFraction: 0.5,
      beScaleOutFeeBufferPercent: 0,
    });

    const beforeTrigger = manager.update(101.49, { volatility: 0.01 });
    expect(beforeTrigger.action).toBe('update');

    const atTrigger = manager.update(101.5, { volatility: 0.01 });
    expect(atTrigger.action).toBe('exit_partial');
    expect(atTrigger.reason).toBe('be_scaleout');
  });

  test('rejects invalid BE scale-out fractions instead of falling back to 50 percent', () => {
    TradingConfig.setOverrides({
      'exitLogic.beScaleOut.scaleOutFraction': 0,
    });

    expect(() => new MaxProfitManager()).toThrow(/exitLogic\.beScaleOut\.scaleOutFraction/);
  });
});
