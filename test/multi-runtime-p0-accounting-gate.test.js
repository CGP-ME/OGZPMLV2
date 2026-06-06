const fs = require('fs');
const os = require('os');
const path = require('path');

const {
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
