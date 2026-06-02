'use strict';

const MaxProfitManager = require('../core/MaxProfitManager');

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
});
