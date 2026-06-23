const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  assertP0LedgerConservation,
  assertP0TieredExitAccounting,
  assertP0LongOnlyNoShortArtifacts
} = require('../ogz-meta/gates/multi-runtime-gate-runner');

function reportPathFor(trades) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-p0-accounting-'));
  const reportPath = path.join(dir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ trades }, null, 2), 'utf8');
  return reportPath;
}

function trade(overrides = {}) {
  return {
    entryTime: '2024-03-20T16:15:00.000Z',
    entryPrice: 171.98595,
    strategyName: 'EMASMACrossover',
    direction: 'long',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'default',
    assetClass: 'stocks',
    executionMode: 'backtest',
    timeframe: '15m',
    size: 100,
    exitReason: 'max_hold_winner',
    ...overrides
  };
}

function ledgerTrade(overrides = {}) {
  const entryPrice = overrides.entryPrice ?? 100;
  const exitPrice = overrides.exitPrice ?? 105;
  const closedOrderQuantity = overrides.closedOrderQuantity ?? overrides.exitOrderQuantity ?? 5;
  const rawPnlDollars = overrides.rawPnlDollars ?? ((exitPrice - entryPrice) * closedOrderQuantity);
  const feesDollars = overrides.feesDollars ?? 0.5;
  const netPnlDollars = overrides.netPnlDollars ?? (rawPnlDollars - feesDollars);
  const balanceBefore = overrides.balanceBefore ?? 10000;
  return trade({
    tradeNumber: overrides.tradeNumber ?? 1,
    exitTime: overrides.exitTime ?? '2024-03-20T16:30:00.000Z',
    entryPrice,
    exitPrice,
    entryOrderQuantity: overrides.entryOrderQuantity ?? 10,
    remainingOrderQuantityBeforeExit: overrides.remainingOrderQuantityBeforeExit ?? 10,
    exitOrderQuantity: overrides.exitOrderQuantity ?? closedOrderQuantity,
    closedOrderQuantity,
    size: overrides.size ?? entryPrice * closedOrderQuantity,
    rawPnlDollars,
    feesDollars,
    netPnlDollars,
    pnlPerShare: overrides.pnlPerShare ?? (netPnlDollars / closedOrderQuantity),
    balanceBefore,
    balanceAfter: overrides.balanceAfter ?? balanceBefore + netPnlDollars,
    exitReason: overrides.exitReason ?? 'be_scaleout',
    ...overrides
  });
}

describe('P0 ledger conservation gate', () => {
  test('accepts a clean multi-leg trade that closes exactly the original quantity', () => {
    const leg1 = ledgerTrade({
      tradeNumber: 1,
      exitTime: '2024-03-20T16:30:00.000Z',
      exitPrice: 101,
      closedOrderQuantity: 5,
      remainingOrderQuantityBeforeExit: 10,
      feesDollars: 0.25,
      balanceBefore: 10000,
      exitReason: 'be_scaleout'
    });
    const leg2 = ledgerTrade({
      tradeNumber: 2,
      exitTime: '2024-03-20T16:45:00.000Z',
      exitPrice: 103,
      closedOrderQuantity: 3,
      remainingOrderQuantityBeforeExit: 5,
      feesDollars: 0.15,
      balanceBefore: leg1.balanceAfter,
      exitReason: 'profit_tier_1'
    });
    const leg3 = ledgerTrade({
      tradeNumber: 3,
      exitTime: '2024-03-20T17:00:00.000Z',
      exitPrice: 104,
      closedOrderQuantity: 2,
      remainingOrderQuantityBeforeExit: 2,
      feesDollars: 0.1,
      balanceBefore: leg2.balanceAfter,
      exitReason: 'max_hold_winner'
    });

    expect(() => assertP0LedgerConservation(reportPathFor([leg1, leg2, leg3]))).not.toThrow();
  });

  test('rejects an exit leg that closes more quantity than remains', () => {
    const reportPath = reportPathFor([
      ledgerTrade({ tradeNumber: 1, closedOrderQuantity: 5, remainingOrderQuantityBeforeExit: 10 }),
      ledgerTrade({ tradeNumber: 2, closedOrderQuantity: 6, remainingOrderQuantityBeforeExit: 5, balanceBefore: 10004.5 })
    ]);

    expect(() => assertP0LedgerConservation(reportPath)).toThrow(/closes more quantity than remains/);
  });

  test('rejects closed notional that does not match entry price times closed quantity', () => {
    const reportPath = reportPathFor([
      ledgerTrade({ size: 600, closedOrderQuantity: 5 })
    ]);

    expect(() => assertP0LedgerConservation(reportPath)).toThrow(/closed notional/);
  });

  test('rejects raw PnL that does not match price move times closed quantity', () => {
    const reportPath = reportPathFor([
      ledgerTrade({ rawPnlDollars: 999 })
    ]);

    expect(() => assertP0LedgerConservation(reportPath)).toThrow(/raw PnL/);
  });

  test('rejects net PnL that does not equal raw PnL minus fees', () => {
    const reportPath = reportPathFor([
      ledgerTrade({ netPnlDollars: 999 })
    ]);

    expect(() => assertP0LedgerConservation(reportPath)).toThrow(/net PnL/);
  });

  test('rejects balance deltas that do not equal net PnL', () => {
    const reportPath = reportPathFor([
      ledgerTrade({ balanceAfter: 10000 })
    ]);

    expect(() => assertP0LedgerConservation(reportPath)).toThrow(/balance delta/);
  });

  test('rejects PnL per share that is divided by notional instead of closed quantity', () => {
    const reportPath = reportPathFor([
      ledgerTrade({ pnlPerShare: 0.01 })
    ]);

    expect(() => assertP0LedgerConservation(reportPath)).toThrow(/PnL per share/);
  });

  test('rejects a completed report group that leaves phantom remaining quantity', () => {
    const reportPath = reportPathFor([
      ledgerTrade({ closedOrderQuantity: 5, remainingOrderQuantityBeforeExit: 10 })
    ]);

    expect(() => assertP0LedgerConservation(reportPath)).toThrow(/final remaining quantity/);
  });
});

describe('P0 tiered exit accounting gate', () => {
  test('accepts corrected original-position tier fractions', () => {
    const reportPath = reportPathFor([
      trade({ size: 150, exitReason: 'profit_tier_1' }),
      trade({ size: 150, exitReason: 'profit_tier_2' }),
      trade({ size: 100, exitReason: 'profit_tier_3' }),
      trade({ size: 100, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0TieredExitAccounting(reportPath)).not.toThrow();
  });

  test('rejects old over-credited tiered exits', () => {
    const reportPath = reportPathFor([
      trade({ size: 541.3438261781461, exitReason: 'profit_tier_1' }),
      trade({ size: 378.9406783247023, exitReason: 'profit_tier_2' }),
      trade({ size: 216.53753047125846, exitReason: 'profit_tier_3' }),
      trade({ size: 108.26876523562925, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0TieredExitAccounting(reportPath)).toThrow(/profit_tier_1/);
  });

  test('normalizes tier labels before enforcing fraction caps', () => {
    const reportPath = reportPathFor([
      trade({ size: 400, exitReason: ' Profit_Tier_1 ' }),
      trade({ size: 600, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0TieredExitAccounting(reportPath)).toThrow(/profit_tier_1/);
  });

  test('rejects missing tier exit reasons instead of skipping the group', () => {
    const reportPath = reportPathFor([
      trade({ size: 500, exitReason: null }),
      trade({ size: 500, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0TieredExitAccounting(reportPath)).toThrow(/missing exitReason/);
  });

  test('rejects unrecognized tier-like exit reasons', () => {
    const reportPath = reportPathFor([
      trade({ size: 300, exitReason: 'profit_tier_one' }),
      trade({ size: 700, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0TieredExitAccounting(reportPath)).toThrow(/unrecognized tier exitReason/);
  });

  test('rejects one entry identity split across runtime scopes', () => {
    const reportPath = reportPathFor([
      trade({ size: 150, exitReason: 'profit_tier_1', brokerId: 'alpaca' }),
      trade({ size: 350, exitReason: 'max_hold_winner', brokerId: 'alpaca' }),
      trade({ size: 150, exitReason: 'profit_tier_1', brokerId: 'ibkr' }),
      trade({ size: 350, exitReason: 'max_hold_winner', brokerId: 'ibkr' })
    ]);

    expect(() => assertP0TieredExitAccounting(reportPath)).toThrow(/split across runtime scopes/);
  });
});

describe('P0 long-only direction gate', () => {
  test('accepts all-long reports without flip exits', () => {
    const reportPath = reportPathFor([
      trade({ size: 150, exitReason: 'profit_tier_1' }),
      trade({ size: 350, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0LongOnlyNoShortArtifacts(reportPath)).not.toThrow();
  });

  test('rejects sell direction artifacts, not only short direction labels', () => {
    const reportPath = reportPathFor([
      trade({ direction: 'sell', size: 100, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0LongOnlyNoShortArtifacts(reportPath)).toThrow(/non-long trade direction/);
  });

  test('rejects explicit short action and side markers', () => {
    const actionReportPath = reportPathFor([
      trade({ action: 'SELL_SHORT', size: 100, exitReason: 'max_hold_winner' })
    ]);
    const sideReportPath = reportPathFor([
      trade({ side: 'short', size: 100, exitReason: 'max_hold_winner' })
    ]);

    expect(() => assertP0LongOnlyNoShortArtifacts(actionReportPath)).toThrow(/short action\/side marker/);
    expect(() => assertP0LongOnlyNoShortArtifacts(sideReportPath)).toThrow(/short action\/side marker/);
  });

  test('rejects any flip-style exit reason under long-only P0', () => {
    const reportPath = reportPathFor([
      trade({ size: 100, exitReason: 'flip_to_short' })
    ]);

    expect(() => assertP0LongOnlyNoShortArtifacts(reportPath)).toThrow(/flip exit/);
  });
});
