'use strict';

const FeeModel = require('../core/FeeModel');
const PnLCalculator = require('../core/PnLCalculator');
const BacktestRecorder = require('../core/BacktestRecorder');
const BreakEvenManager = require('../core/exit/BreakEvenManager');
const DynamicTrailingStop = require('../core/exit/DynamicTrailingStop');
const MaxHoldChecker = require('../core/exit/MaxHoldChecker');
const ConfigLoader = require('../foundation/ConfigLoader');

describe('FeeModel', () => {
  afterEach(() => {
    if (typeof ConfigLoader.clearOverrides === 'function') {
      ConfigLoader.clearOverrides();
    }
  });

  test('preserves percent fee behavior for existing modes', () => {
    const model = new FeeModel({
      model: 'percent',
      makerFee: 0.001,
      takerFee: 0.002,
    });

    expect(model.calculateOrderFee({ notionalUsd: 1000, quantity: 1, side: 'entry' })).toBeCloseTo(1);
    expect(model.calculateOrderFee({ notionalUsd: 1000, quantity: 1, side: 'exit' })).toBeCloseTo(2);
    expect(model.calculateRoundTripFees({
      entryNotionalUsd: 1000,
      exitNotionalUsd: 1000,
      entryQuantity: 1,
      exitQuantity: 1,
    })).toBeCloseTo(3);
  });

  test('supports per-share fees with a minimum per filled order', () => {
    const model = new FeeModel({
      model: 'per_share_minimum',
      perShare: 0.005,
      minOrderFee: 0.75,
    });

    expect(model.calculateOrderFee({ notionalUsd: 409.95, quantity: 1, side: 'entry' })).toBeCloseTo(0.75);
    expect(model.calculateRoundTripFees({
      entryNotionalUsd: 409.95,
      exitNotionalUsd: 410.95,
      entryQuantity: 1,
      exitQuantity: 1,
    })).toBeCloseTo(1.5);
    expect(model.calculateOrderFee({ notionalUsd: 120000, quantity: 300, side: 'exit' })).toBeCloseTo(1.5);
  });

  test('PnLCalculator uses minimum fees instead of percentage approximations', () => {
    const model = new FeeModel({
      model: 'per_share_minimum',
      perShare: 0.005,
      minOrderFee: 0.75,
    });
    const pnl = new PnLCalculator({ feeModel: model }).calculateNetPnL(409.95, 410.95, 1, 'long');

    expect(pnl.grossPnL).toBeCloseTo(1);
    expect(pnl.fees).toBeCloseTo(1.5);
    expect(pnl.netPnL).toBeCloseTo(-0.5);
  });

  test('PnLCalculator helper gates require fee context for per-share minimum fees', () => {
    const calculator = new PnLCalculator({
      feeModel: new FeeModel({
        model: 'per_share_minimum',
        perShare: 0.005,
        minOrderFee: 0.75,
      }),
    });
    const feeContext = {
      entryNotionalUsd: 100,
      exitNotionalUsd: 100,
      entryQuantity: 1,
      exitQuantity: 1,
    };

    expect(() => calculator.isProfitableAfterFees(2)).toThrow(/fee context required/);
    expect(() => calculator.calculateBreakEven(100)).toThrow(/fee context required/);
    expect(calculator.isProfitableAfterFees(2, feeContext)).toBe(true);
    expect(calculator.calculateBreakEven(100, 'long', feeContext)).toBeCloseTo(101.5);
  });

  test('PnLCalculator preserves contextless helpers for percent fee model', () => {
    const calculator = new PnLCalculator({
      feeModel: new FeeModel({
        model: 'percent',
        makerFee: 0.001,
        takerFee: 0.002,
      }),
    });

    expect(calculator.isProfitableAfterFees(0.4)).toBe(true);
    expect(calculator.calculateBreakEven(100)).toBeCloseTo(100.3);
  });

  test('BacktestRecorder records minimum order fees for scoped stock trades', () => {
    const model = new FeeModel({
      model: 'per_share_minimum',
      perShare: 0.005,
      minOrderFee: 0.75,
    });
    const recorder = new BacktestRecorder({ startingBalance: 5000, feeModel: model });

    const record = recorder.recordTrade({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-eval',
      accountIdSource: 'env',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
      scopeKey: 'backtest:alpaca:acct-eval:stocks:TSLA:15m',
      direction: 'long',
      entryPrice: 409.95,
      exitPrice: 410.95,
      size: 409.95,
      strategyName: 'FeeModelProbe',
    });

    expect(record.rawPnlDollars).toBeCloseTo(1);
    expect(record.feesDollars).toBeCloseTo(1.5);
    expect(record.netPnlDollars).toBeCloseTo(-0.5);
    expect(recorder.balance).toBeCloseTo(4999.5);
  });

  test('converts per-share minimum fees into trade-specific percent buffers for exits', () => {
    ConfigLoader.setOverrides({
      'fees.model': 'per_share_minimum',
      'fees.perShare': 0.005,
      'fees.minOrderFee': 0.75,
      'fees.makerFee': 0,
      'fees.takerFee': 0,
      'fees.totalRoundTrip': 0,
    });
    const trade = {
      entryPrice: 100,
      sizeUsd: 100,
      entryOrderQuantity: 1,
      remainingOrderQuantity: 1,
      maxProfitPercent: 1.6,
      exitContract: {
        stopLossPercent: -1,
        maxHoldTimeMinutes: 30,
      },
    };

    const breakEven = new BreakEvenManager();
    expect(breakEven.evaluate(trade)).toEqual(expect.objectContaining({
      isBreakEven: true,
      effectiveStopPercent: -1.5,
    }));

    const maxHold = new MaxHoldChecker({ maxHoldTimeMinutes: 999 });
    expect(maxHold.check(trade, 31, 1.49).exitReason).toBe('max_hold_loser');
    expect(maxHold.check(trade, 31, 1.51).exitReason).toBe('max_hold_winner');

    const trailing = new DynamicTrailingStop({ minActivation: 1.5 });
    const trailResult = trailing.check(trade, 1.4, { atr: 0.1, price: 100 });
    expect(trailResult.shouldExit).toBe(true);
    expect(trailResult.meta.trailStopLevel).toBeCloseTo(1.5);
  });
});
