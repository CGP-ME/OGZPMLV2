'use strict';

describe('Backtest report scope contract', () => {
  let consoleSpies;
  let BacktestRecorder;
  let originalEnv;

  const scopedTrade = (overrides = {}) => ({
    entryTime: '2026-05-26T13:30:00.000Z',
    exitTime: '2026-05-26T13:45:00.000Z',
    direction: 'long',
    entryPrice: 100,
    exitPrice: 105,
    size: 500,
    strategyName: 'GateStrategy',
    confidence: 0.72,
    exitReason: 'take_profit',
    holdTimeMinutes: 15,
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'backtest',
    timeframe: '15m',
    scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:15m',
    scopeKeyVersion: 2,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    process.env.EXECUTION_MODE = 'backtest';
    process.env.BACKTEST_MODE = 'true';
    process.env.INITIAL_BALANCE = '10000';
    consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    BacktestRecorder = require('../core/BacktestRecorder');
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    process.env = originalEnv;
  });

  test('records immutable scope on every backtest trade row', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });

    const record = recorder.recordTrade(scopedTrade());

    expect(record.symbol).toBe('TSLA');
    expect(record.brokerId).toBe('alpaca');
    expect(record.accountId).toBe('acct-main');
    expect(record.accountIdSource).toBe('config');
    expect(record.assetClass).toBe('stocks');
    expect(record.executionMode).toBe('backtest');
    expect(record.timeframe).toBe('15m');
    expect(record.scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');
    expect(record.scopeKeyVersion).toBe(2);
    expect(record.scopeComplete).toBe(true);
    expect(recorder.trades).toHaveLength(1);
  });

  test('records broker quantity fields on every backtest trade row', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });

    const record = recorder.recordTrade(scopedTrade({
      entryOrderQuantity: 7,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantityBeforeExit: 4,
      remainingOrderQuantityUnit: 'shares',
      exitOrderQuantity: 2,
      exitOrderQuantityUnit: 'shares',
      closedOrderQuantity: 2,
      quantityUnit: 'shares',
      entryFeeQuantity: 2,
      exitFeeQuantity: 2,
    }));

    expect(record.entryOrderQuantity).toBe(7);
    expect(record.entryOrderQuantityUnit).toBe('shares');
    expect(record.remainingOrderQuantityBeforeExit).toBe(4);
    expect(record.remainingOrderQuantityUnit).toBe('shares');
    expect(record.exitOrderQuantity).toBe(2);
    expect(record.exitOrderQuantityUnit).toBe('shares');
    expect(record.closedOrderQuantity).toBe(2);
    expect(record.quantityUnit).toBe('shares');
    expect(record.entryFeeQuantity).toBe(2);
    expect(record.exitFeeQuantity).toBe(2);
  });

  test('rejects missing scope before mutating backtest balance or rows', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });

    expect(() => recorder.recordTrade(scopedTrade({ brokerId: null })))
      .toThrow(/missing immutable backtest trade scope field\(s\): brokerId/);

    expect(recorder.trades).toHaveLength(0);
    expect(recorder.balance).toBe(10000);
  });

  test('rejects mismatched scopeKey before mutating backtest balance or rows', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });

    expect(() => recorder.recordTrade(scopedTrade({
      scopeKey: 'backtest:alpaca:acct-main:stocks:SPY:15m',
    }))).toThrow(/scopeKey mismatch/);

    expect(recorder.trades).toHaveLength(0);
    expect(recorder.balance).toBe(10000);
  });

  test('BacktestRunner refuses to write reports with unscoped trade rows', () => {
    const BacktestRunner = require('../core/BacktestRunner');
    const runner = new BacktestRunner({});

    expect(() => runner.assertScopedReportTrades([
      scopedTrade(),
      scopedTrade({ brokerId: null }),
    ])).toThrow(/BacktestRunner\.report trades\[1\] missing immutable backtest trade scope field\(s\): brokerId/);
  });
});
