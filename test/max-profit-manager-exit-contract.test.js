'use strict';

const MaxProfitManager = require('../core/MaxProfitManager');
const TradingConfig = require('../core/TradingConfig');

describe('MaxProfitManager exit contract stop basis', () => {
  let logSpy;
  let warnSpy;

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
    const manager = new MaxProfitManager({
      initialStopLossPercent: 0.008,
      enableTieredExit: false,
      enableTrailingStop: false,
      breakevenThreshold: 0.05,
      ...config,
    });
    const result = manager.start(100, direction, 10, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract,
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
    const manager = startManager('buy', { stopLossPercent: -0.5 });
    manager.beScaleOutConfig = {
      enabled: true,
      triggerType: 'one_to_one_r',
      scaleOutFraction: 0.5,
      feeBufferPercent: 0,
    };

    const beforeTrigger = manager.update(100.49, { volatility: 0.01 });
    expect(beforeTrigger.action).not.toBe('exit_partial');

    const atContractR = manager.update(100.5, { volatility: 0.01 });
    expect(atContractR.action).toBe('exit_partial');
    expect(atContractR.reason).toBe('be_scaleout');
  });

  test('malformed trade exit contracts fail loudly instead of falling back to global stop config', () => {
    const manager = new MaxProfitManager({
      initialStopLossPercent: 0.008,
      enableTieredExit: false,
    });

    expect(() => manager.start(100, 'buy', 10, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: { takeProfitPercent: 1 },
    })).toThrow(/exitContract\.stopLossPercent missing\/invalid/);
  });

  test('wrong-sign trade stop contracts fail before replacing existing manager state', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 });
    const previousState = manager.state;

    expect(() => manager.start(100, 'buy', 10, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: { stopLossPercent: 0.5 },
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
    const manager = new MaxProfitManager({
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
      exitContract: { stopLossPercent: -0.5 },
    });
    expect(result.success).toBe(true);

    manager.state.currentPrice = 102;
    manager.updateBreakevenStop(0.1);

    expect(manager.state.currentStop).toBeCloseTo(101.5);
    expect(manager.state.breakevenActive).toBe(true);
  });

  test('unrealized PnL uses USD notional return without multiplying by entry price', () => {
    const manager = new MaxProfitManager({
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      initialStopLossPercent: 0.05,
      minHoldTimeMinutes: 0,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: { stopLossPercent: -5 },
    });
    expect(result.success).toBe(true);

    manager.update(101.5, { volatility: 0.01 });

    expect(manager.state.unrealizedPnL).toBeCloseTo(15, 10);
    expect(manager.getPositionState().totalPnL).toBeCloseTo(15, 10);
  });

  test('break-even scale-out realized PnL uses scale-out notional return', () => {
    const manager = startManager('buy', { stopLossPercent: -0.5 }, {
      minHoldTimeMinutes: 0,
    });
    manager.beScaleOutConfig = {
      enabled: true,
      triggerType: 'fixed_percent',
      fixedPercentTrigger: 0.015,
      scaleOutFraction: 0.5,
      feeBufferPercent: 0,
    };

    const update = manager.update(101.5, { volatility: 0.01 });

    expect(update.action).toBe('exit_partial');
    expect(update.reason).toBe('be_scaleout');
    expect(update.exitSize).toBeCloseTo(5, 10);
    expect(manager.state.realizedPnL).toBeCloseTo(0.075, 10);
  });

  test('tier partial exit realized and narrator PnL use exit notional return', () => {
    const manager = new MaxProfitManager({
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
      exitContract: { stopLossPercent: -5 },
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
    const manager = new MaxProfitManager({
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      initialStopLossPercent: 0.05,
      minHoldTimeMinutes: 0,
    });

    const result = manager.start(100, 'buy', 1000, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: { stopLossPercent: -5 },
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
    const manager = new MaxProfitManager({
      enableTieredExit: false,
      enableTrailingStop: false,
      enableBreakevenStop: false,
      initialStopLossPercent: 0.05,
      minHoldTimeMinutes: 0,
    });
    manager.beScaleOutConfig = {
      enabled: true,
      triggerType: 'fixed_percent',
      fixedPercentTrigger: 0.10,
      scaleOutFraction: 0.5,
      feeBufferPercent: 0,
    };

    const result = manager.start(100, 'buy', 10000, {
      volatility: 0.01,
      confidence: 0.7,
      exitContract: { stopLossPercent: -5 },
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
    const manager = new MaxProfitManager({
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
      exitContract: { stopLossPercent: -0.5, takeProfitPercent: 2 },
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

  test('break-even scale-out does not snap a short winner into a green stop-loss before tier development', () => {
    const manager = new MaxProfitManager({
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
      exitContract: { stopLossPercent: -0.5, takeProfitPercent: 2 },
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
});
