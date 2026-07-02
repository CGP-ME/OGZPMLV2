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
    process.env.LIVE_TRADING = 'false';
    process.env.PAPER_TRADING = 'true';
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'false';
    process.env.INITIAL_BALANCE = '10000';
    process.env.MIN_TRADE_CONFIDENCE = '0.60';
    process.env.MAX_DRAWDOWN = '5';
    process.env.MAX_DAILY_LOSS = '1';
    process.env.MAX_WEEKLY_LOSS = '5';
    process.env.MAX_MONTHLY_LOSS = '5';
    process.env.RISK_MANAGER_BYPASS = 'true';
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
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(originalEnv, key)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
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

  test('preserves fee edge gate evidence on backtest trade rows', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });
    const feeEdgeGate = {
      gate: 'fee_edge',
      threshold: 3,
      value: 10,
      passed: true,
      expectedMoveDollars: 10,
      roundTripFeeDollars: 1.5,
      minEdgeMultiple: 2,
    };

    const record = recorder.recordTrade(scopedTrade({
      feeEdgeGate,
      riskGates: [feeEdgeGate],
    }));

    expect(record.feeEdgeGate).toEqual(feeEdgeGate);
    expect(record.riskGates).toEqual([feeEdgeGate]);
  });

  test('uses executed closed quantity as source of truth for stock notional and PnL', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });
    const entryPrice = 173.296605;
    const exitPrice = 172.21385;
    const closedOrderQuantity = 4.503204202990589;

    const record = recorder.recordTrade(scopedTrade({
      entryPrice,
      exitPrice,
      size: 780,
      entryOrderQuantity: closedOrderQuantity,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantityBeforeExit: closedOrderQuantity,
      remainingOrderQuantityUnit: 'shares',
      exitOrderQuantity: closedOrderQuantity,
      exitOrderQuantityUnit: 'shares',
      closedOrderQuantity,
      quantityUnit: 'shares',
      entryFeeQuantity: closedOrderQuantity,
      exitFeeQuantity: closedOrderQuantity,
    }));

    const executedNotional = entryPrice * closedOrderQuantity;
    const executedRawPnl = (exitPrice - entryPrice) * closedOrderQuantity;
    expect(record.size).toBeCloseTo(executedNotional, 8);
    expect(record.rawPnlDollars).toBeCloseTo(executedRawPnl, 8);
    expect(record.netPnlDollars).toBeCloseTo(executedRawPnl, 8);
    expect(record.balanceAfter - record.balanceBefore).toBeCloseTo(executedRawPnl, 8);
    expect(record.pnlPerShare).toBeCloseTo(executedRawPnl / closedOrderQuantity, 8);
  });

  test('preserves profit-tier exits as profit_tier instead of take_profit', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });

    const tierRecord = recorder.recordTrade(scopedTrade({ exitReason: 'profit_tier_1' }));
    const takeProfitRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'take_profit',
      entryTime: '2026-05-26T14:00:00.000Z',
      exitTime: '2026-05-26T14:15:00.000Z',
    }));
    const trailingRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'trailing_stop',
      entryTime: '2026-05-26T14:30:00.000Z',
      exitTime: '2026-05-26T14:45:00.000Z',
    }));
    const stopRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'stop_loss',
      entryTime: '2026-05-26T15:00:00.000Z',
      exitTime: '2026-05-26T15:15:00.000Z',
    }));
    const maxHoldRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'max_hold_winner',
      entryTime: '2026-05-26T15:30:00.000Z',
      exitTime: '2026-05-26T15:45:00.000Z',
    }));
    const breakEvenRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'break_even',
      entryTime: '2026-05-26T16:00:00.000Z',
      exitTime: '2026-05-26T16:15:00.000Z',
    }));
    const mixedTakeProfitRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'take_profit_tier',
      entryTime: '2026-05-26T16:30:00.000Z',
      exitTime: '2026-05-26T16:45:00.000Z',
    }));
    const compactTierRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'profit_Tier1',
      entryTime: '2026-05-26T16:45:00.000Z',
      exitTime: '2026-05-26T17:00:00.000Z',
    }));
    const malformedTierRecord = recorder.recordTrade(scopedTrade({
      exitReason: 'profit_tier_one',
      entryTime: '2026-05-26T17:00:00.000Z',
      exitTime: '2026-05-26T17:15:00.000Z',
    }));

    expect(tierRecord.exitType).toBe('profit_tier');
    expect(takeProfitRecord.exitType).toBe('take_profit');
    expect(trailingRecord.exitType).toBe('trailing_stop');
    expect(stopRecord.exitType).toBe('stop_loss');
    expect(maxHoldRecord.exitType).toBe('max_hold');
    expect(breakEvenRecord.exitType).toBe('break_even');
    expect(mixedTakeProfitRecord.exitType).toBe('take_profit');
    expect(compactTierRecord.exitType).toBe('profit_tier');
    expect(malformedTierRecord.exitType).toBe('profit_tier_one');
  });

  test('preserves trade-birth confidence attribution and MTF snapshot on backtest rows', () => {
    const recorder = new BacktestRecorder({ startingBalance: 10000, feePerSide: 0 });

    const signalBreakdown = {
      winnerStrategy: 'GateStrategy',
      signals: [{
        name: 'GateStrategy',
        decisionAttribution: {
          strategyName: 'GateStrategy',
          contributors: [
            { name: 'strategy_signal', type: 'base', confidence: 0.72 },
            { name: 'mtf_confluence_booster', type: 'multiplier', configuredMultiplier: 1.1 },
          ],
        },
      }],
    };
    const mtfConfluenceSnapshot = {
      direction: 'buy',
      confluenceScore: 0.42,
      confidence: 0.81,
      readyTimeframes: ['15m', '1h', '4h'],
    };
    const frozenExitPolicy = {
      policyHash: 'policy-hash-1',
      mtfConfluenceSnapshot,
    };

    const record = recorder.recordTrade(scopedTrade({
      signalBreakdown,
      frozenExitPolicy,
      isPartialClose: true,
      partialFraction: 0.3,
    }));

    expect(record.signalBreakdown).toEqual(signalBreakdown);
    expect(record.winnerDecisionAttribution).toEqual(signalBreakdown.signals[0].decisionAttribution);
    expect(record.confidenceContributors).toBe('strategy_signal|mtf_confluence_booster');
    expect(record.mtfConfluenceSnapshot).toEqual(mtfConfluenceSnapshot);
    expect(record.frozenExitPolicy).toEqual(frozenExitPolicy);
    expect(record.isPartialClose).toBe(true);
    expect(record.partialFraction).toBe(0.3);
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
