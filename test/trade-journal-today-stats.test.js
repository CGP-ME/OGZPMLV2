'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('TradeJournal today stats', () => {
  let tempDir;
  let consoleSpies;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-27T12:00:00.000Z'));
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-trade-journal-'));
    consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
    ];
  });

  afterEach(() => {
    jest.useRealTimers();
    for (const spy of consoleSpies) spy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeLedger(records) {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'trade-ledger.jsonl'),
      records.map(record => JSON.stringify(record)).join('\n') + '\n',
      'utf8'
    );
  }

  function scopeFields(overrides = {}) {
    return {
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      accountId: 'default',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '1m',
      scopeKey: 'paper:kraken:default:crypto:BTC-USD:1m',
      scopeKeyVersion: 2,
      scopeComplete: false,
      ...overrides,
    };
  }

  function journalConfig(overrides = {}) {
    return {
      dataDir: tempDir,
      startingBalance: 10000,
      scope: scopeFields(),
      ...overrides,
    };
  }

  function oldExit(overrides = {}) {
    return {
      event: 'EXIT',
      timestamp: Date.parse('2026-02-12T06:14:54.519Z'),
      orderId: 'TEST-001',
      direction: 'BUY',
      entryPrice: 50000,
      exitPrice: 51000,
      size: 0.01,
      usdValue: 500,
      grossPnl: 10,
      fees: 0,
      netPnl: 10,
      pnlPercent: 2,
      holdTimeMs: 0,
      holdTimeFormatted: '0s',
      exitReason: 'tp',
      confidence: 75,
      regime: 'unknown',
      patterns: [],
      indicators: {},
      entryTime: Date.parse('2026-02-12T06:14:54.519Z'),
      balanceAfter: 10010,
      ...scopeFields(),
      ...overrides,
    };
  }

  function validEntry(overrides = {}) {
    return {
      orderId: 'ENTRY-001',
      direction: 'BUY',
      entryPrice: 50000,
      size: 500,
      usdValue: 500,
      confidence: 75,
      regime: 'ranging',
      patterns: [{ name: 'test_pattern', confidence: 0.7 }],
      indicators: { rsi: 55, macd: 0.1, trend: 'up', volatility: 0.2 },
      fees: 0,
      ...overrides,
    };
  }

  function oldEntry(overrides = {}) {
    return {
      event: 'ENTRY',
      timestamp: Date.parse('2026-05-27T11:58:00.000Z'),
      orderId: 'ENTRY-LEDGER-001',
      direction: 'BUY',
      entryPrice: 50000,
      size: 500,
      usdValue: 500,
      confidence: 75,
      regime: 'ranging',
      patterns: [],
      indicators: {},
      fees: 0,
      ...scopeFields(),
      ...overrides,
    };
  }

  test('does not classify historical rebuilt trades as today', () => {
    writeLedger([
      oldEntry({ orderId: 'TEST-001', timestamp: Date.parse('2026-02-12T06:13:54.519Z') }),
      oldExit(),
    ]);

    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    const snapshot = journal.getSnapshot();

    expect(snapshot.totalTrades).toBe(1);
    expect(snapshot.netPnl).toBe(10);
    expect(snapshot.todayTrades).toBe(0);
    expect(snapshot.todayPnl).toBe(0);
    expect(snapshot.todayWinRate).toBe(0);

    journal.destroy();
  });

  test('refuses to construct against the unscoped default journal path', () => {
    const TradeJournal = require('../core/TradeJournal');

    expect(() => new TradeJournal({ startingBalance: 10000 }))
      .toThrow(/requires an explicit scoped dataDir/);
  });

  test('refuses to rebuild unscoped legacy ledger records', () => {
    writeLedger([oldExit({
      symbol: undefined,
      brokerId: undefined,
      accountId: undefined,
      assetClass: undefined,
      executionMode: undefined,
      timeframe: undefined,
      scopeKey: undefined,
      scopeKeyVersion: undefined,
    })]);

    const TradeJournal = require('../core/TradeJournal');

    expect(() => new TradeJournal(journalConfig()))
      .toThrow(/scopeKey mismatch/);
  });

  test('refuses scoped ledger records without explicit v2 scope metadata', () => {
    writeLedger([oldExit({ scopeKeyVersion: undefined })]);

    const TradeJournal = require('../core/TradeJournal');

    expect(() => new TradeJournal(journalConfig()))
      .toThrow(/scopeKeyVersion must be 2/);
  });

  test('refuses malformed ledger lines instead of silently skipping them', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'trade-ledger.jsonl'), '{bad-json}\n', 'utf8');

    const TradeJournal = require('../core/TradeJournal');

    expect(() => new TradeJournal(journalConfig()))
      .toThrow(/malformed JSON/);
  });

  test('keeps same-day rebuilt trades in today stats', () => {
    writeLedger([
      oldEntry({
        orderId: 'LIVE-001',
        timestamp: Date.parse('2026-05-27T11:58:00.000Z'),
      }),
      oldExit({
      orderId: 'LIVE-001',
      timestamp: Date.parse('2026-05-27T11:59:00.000Z'),
      entryTime: Date.parse('2026-05-27T11:58:00.000Z'),
      }),
    ]);

    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    const snapshot = journal.getSnapshot();

    expect(snapshot.totalTrades).toBe(1);
    expect(snapshot.todayTrades).toBe(1);
    expect(snapshot.todayPnl).toBe(10);
    expect(snapshot.todayWinRate).toBe(100);

    journal.destroy();
  });

  test('tracks break-even trades without creating a win or loss streak', () => {
    writeLedger([
      oldEntry({
        orderId: 'FLAT-001',
        timestamp: Date.parse('2026-05-27T11:58:00.000Z'),
      }),
      oldExit({
      orderId: 'FLAT-001',
      timestamp: Date.parse('2026-05-27T11:59:00.000Z'),
      entryTime: Date.parse('2026-05-27T11:58:00.000Z'),
      grossPnl: 0,
      netPnl: 0,
      pnlPercent: 0,
      balanceAfter: 10000,
      }),
    ]);

    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    const snapshot = journal.getSnapshot();
    const stats = journal.getStats();

    expect(stats.breakEvens).toBe(1);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(snapshot.currentStreak).toBe(0);
    expect(snapshot.currentStreakType).toBe('flat');
    expect(snapshot.recentWL).toEqual(['F']);
    expect(snapshot.recentTrades[0].outcome).toBe('flat');
    expect(snapshot.todayTrades).toBe(1);
    expect(snapshot.todayPnl).toBe(0);
    expect(snapshot.todayWinRate).toBe(0);

    journal.destroy();
  });

  test('refuses incomplete direct entry records instead of fabricating defaults', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());

    const result = journal.recordEntry({
      orderId: 'BAD-ENTRY',
      entryPrice: 50000,
      fees: 0,
    });

    expect(result).toBeNull();
    expect(journal.openTrades.size).toBe(0);
    expect(fs.existsSync(path.join(tempDir, 'trade-ledger.jsonl'))).toBe(false);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('missing field(s): direction, size, usdValue, confidence'));

    journal.destroy();
  });

  test('refuses direct entries whose size and usdValue disagree', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());

    const result = journal.recordEntry(validEntry({
      orderId: 'BAD-NOTIONAL',
      size: 100,
      usdValue: 1000000,
    }));

    expect(result).toBeNull();
    expect(journal.openTrades.size).toBe(0);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('size and usdValue must both represent the same USD notional'));

    journal.destroy();
  });

  test('records supplied entry timestamp and refuses malformed supplied timestamp', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());

    const entry = journal.recordEntry(validEntry({
      orderId: 'TIMESTAMPED-ENTRY',
      timestamp: Date.parse('2026-05-26T11:00:00.000Z'),
    }));
    const bad = journal.recordEntry(validEntry({
      orderId: 'BAD-TIMESTAMP-ENTRY',
      timestamp: 'not-a-timestamp',
    }));

    expect(entry).toEqual(expect.objectContaining({
      orderId: 'TIMESTAMPED-ENTRY',
      timestamp: Date.parse('2026-05-26T11:00:00.000Z'),
    }));
    expect(bad).toBeNull();
    expect(journal.openTrades.has('BAD-TIMESTAMP-ENTRY')).toBe(false);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('missing field(s): timestamp'));

    journal.destroy();
  });

  test('throws on entry ledger append failure before mutating open state', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    journal.paths.ledger = path.join(tempDir, 'missing-dir', 'trade-ledger.jsonl');

    try {
      expect(() => journal.recordEntry(validEntry({ orderId: 'ENTRY-APPEND-FAIL' })))
        .toThrow(/ENOENT|no such file or directory/i);
      expect(journal.openTrades.has('ENTRY-APPEND-FAIL')).toBe(false);
      expect(journal.openTrades.size).toBe(0);
      expect(consoleSpies[2]).toHaveBeenCalledWith(expect.stringContaining('Failed to append'));
    } finally {
      journal.destroy();
    }
  });

  test('refuses incomplete direct exit records without removing open state', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    const entry = journal.recordEntry(validEntry({ orderId: 'ORDER-INCOMPLETE-EXIT' }));

    const result = journal.recordExit({
      orderId: 'ORDER-INCOMPLETE-EXIT',
      pnl: 10,
      fees: 0,
      reason: 'take_profit',
    });

    expect(entry).toEqual(expect.objectContaining({ orderId: 'ORDER-INCOMPLETE-EXIT' }));
    expect(result).toBeNull();
    expect(journal.openTrades.has('ORDER-INCOMPLETE-EXIT')).toBe(true);
    expect(journal.getStats().totalTrades).toBe(0);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('missing field(s): exitPrice'));

    journal.destroy();
  });

  test('refuses direct exits without explicit exit size instead of assuming full close', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    journal.recordEntry(validEntry({
      orderId: 'ORDER-MISSING-EXIT-SIZE',
      direction: 'BUY',
      entryPrice: 100,
      size: 500,
      usdValue: 500,
      fees: 0,
    }));

    const result = journal.recordExit({
      orderId: 'ORDER-MISSING-EXIT-SIZE',
      exitPrice: 110,
      pnl: 20,
      fees: 0,
      reason: 'tier_1',
    });

    expect(result).toBeNull();
    expect(journal.openTrades.get('ORDER-MISSING-EXIT-SIZE')).toEqual(expect.objectContaining({
      size: 500,
      usdValue: 500,
    }));
    expect(journal.trades).toHaveLength(0);
    expect(journal.getStats().totalTrades).toBe(0);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('missing field(s): exitSize'));

    journal.destroy();
  });

  test('refuses direct exits with conflicting notional aliases', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    journal.recordEntry(validEntry({
      orderId: 'ORDER-CONFLICTING-EXIT-SIZE',
      direction: 'BUY',
      entryPrice: 100,
      size: 500,
      usdValue: 500,
      fees: 0,
    }));

    const result = journal.recordExit({
      orderId: 'ORDER-CONFLICTING-EXIT-SIZE',
      exitPrice: 110,
      sizeUsd: 200,
      usdValue: 210,
      pnl: 20,
      fees: 0,
      reason: 'tier_1',
    });

    expect(result).toBeNull();
    expect(journal.openTrades.get('ORDER-CONFLICTING-EXIT-SIZE')).toEqual(expect.objectContaining({
      size: 500,
      usdValue: 500,
    }));
    expect(journal.trades).toHaveLength(0);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('exit notional field usdValue=210.000000 conflicts'));

    journal.destroy();
  });

  test('throws on exit ledger append failure before mutating closed state', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    journal.recordEntry(validEntry({
      orderId: 'EXIT-APPEND-FAIL',
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      confidence: 75,
      fees: 0,
    }));
    journal.paths.ledger = path.join(tempDir, 'missing-dir', 'trade-ledger.jsonl');

    try {
      expect(() => journal.recordExit({
        orderId: 'EXIT-APPEND-FAIL',
        exitPrice: 110,
        size: 100,
        pnl: 10,
        fees: 0,
        reason: 'manual',
      })).toThrow(/ENOENT|no such file or directory/i);
      expect(journal.openTrades.has('EXIT-APPEND-FAIL')).toBe(true);
      expect(journal.trades).toHaveLength(0);
      expect(journal.getStats().totalTrades).toBe(0);
      expect(consoleSpies[2]).toHaveBeenCalledWith(expect.stringContaining('Failed to append'));
    } finally {
      journal.destroy();
    }
  });

  test('refuses complete-looking exit-only records without a matching journal entry', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());

    const result = journal.recordExit({
      orderId: 'EXIT-ONLY-FAKE',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 100,
      size: 25,
      pnl: 0,
      fees: 0,
      reason: 'manual',
      holdTime: 0,
    });

    expect(result).toBeNull();
    expect(journal.getStats().totalTrades).toBe(0);
    expect(journal.trades).toHaveLength(0);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('no matching open entry'));

    journal.destroy();
  });

  test('refuses duplicate direct entry orderIds without overwriting the original open trade', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());

    const first = journal.recordEntry(validEntry({
      orderId: 'DUP-ENTRY',
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      confidence: 75,
      regime: 'original',
      fees: 0,
    }));
    const duplicate = journal.recordEntry(validEntry({
      orderId: 'DUP-ENTRY',
      direction: 'SELL',
      entryPrice: 200,
      size: 100,
      usdValue: 100,
      confidence: 95,
      regime: 'fabricated',
      fees: 0,
    }));
    const closed = journal.recordExit({
      orderId: 'DUP-ENTRY',
      exitPrice: 110,
      size: 100,
      pnl: 10,
      fees: 0,
      reason: 'manual',
    });

    expect(first).toEqual(expect.objectContaining({ orderId: 'DUP-ENTRY', entryPrice: 100 }));
    expect(duplicate).toBeNull();
    expect(closed).toEqual(expect.objectContaining({
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      regime: 'original',
      netPnl: 10,
    }));
    expect(journal.openTrades.has('DUP-ENTRY')).toBe(false);
    expect(journal.getStats().totalTrades).toBe(1);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('Refusing duplicate entry orderId'));

    journal.destroy();
  });

  test('refuses exits whose supplied pnl does not match journal entry price movement', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    journal.recordEntry(validEntry({
      orderId: 'BAD-PNL',
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      fees: 0,
    }));

    const result = journal.recordExit({
      orderId: 'BAD-PNL',
      exitPrice: 100,
      size: 100,
      pnl: 1000,
      fees: 0,
      reason: 'manual',
    });

    expect(result).toBeNull();
    expect(journal.openTrades.has('BAD-PNL')).toBe(true);
    expect(journal.getStats().totalTrades).toBe(0);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('does not match long price movement'));

    journal.destroy();
  });

  test('records partial exit legs without deleting the open journal entry before final close', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig({ startingBalance: 1000 }));
    journal.recordEntry(validEntry({
      orderId: 'PARTIAL-LONG',
      direction: 'BUY',
      entryPrice: 100,
      size: 500,
      usdValue: 500,
      fees: 0,
    }));

    const firstLeg = journal.recordExit({
      orderId: 'PARTIAL-LONG',
      exitPrice: 110,
      size: 200,
      pnl: 20,
      fees: 0,
      reason: 'tier_1',
    });
    const secondLeg = journal.recordExit({
      orderId: 'PARTIAL-LONG',
      exitPrice: 90,
      size: 150,
      pnl: -15,
      fees: 0,
      reason: 'tier_2',
    });
    const finalLeg = journal.recordExit({
      orderId: 'PARTIAL-LONG',
      exitPrice: 120,
      size: 150,
      pnl: 30,
      fees: 0,
      reason: 'final_exit',
    });

    expect(firstLeg).toEqual(expect.objectContaining({
      orderId: 'PARTIAL-LONG',
      size: 200,
      usdValue: 200,
      exitFraction: 0.4,
      partialExit: true,
      remainingUsdValue: 300,
      netPnl: 20,
    }));
    expect(secondLeg).toEqual(expect.objectContaining({
      size: 150,
      usdValue: 150,
      exitFraction: 0.5,
      partialExit: true,
      remainingUsdValue: 150,
      netPnl: -15,
    }));
    expect(finalLeg).toEqual(expect.objectContaining({
      size: 150,
      usdValue: 150,
      exitFraction: 1,
      partialExit: false,
      remainingUsdValue: 0,
      netPnl: 30,
    }));
    expect(journal.openTrades.has('PARTIAL-LONG')).toBe(false);
    expect(journal.trades).toHaveLength(3);
    expect(journal.getSnapshot()).toEqual(expect.objectContaining({
      totalTrades: 3,
      openPositions: 0,
      netPnl: 35,
      currentBalance: 1035,
    }));

    journal.destroy();
  });

  test('rebuilds partial exit journal state from ledger without flattening remaining exposure', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig({ startingBalance: 1000 }));
    journal.recordEntry(validEntry({
      orderId: 'PARTIAL-REBUILD',
      direction: 'BUY',
      entryPrice: 100,
      size: 500,
      usdValue: 500,
      fees: 0,
    }));
    const leg = journal.recordExit({
      orderId: 'PARTIAL-REBUILD',
      exitPrice: 110,
      size: 200,
      pnl: 20,
      fees: 0,
      reason: 'tier_1',
    });
    expect(leg).toEqual(expect.objectContaining({
      partialExit: true,
      remainingUsdValue: 300,
    }));
    expect(journal.openTrades.get('PARTIAL-REBUILD')).toEqual(expect.objectContaining({
      size: 300,
      usdValue: 300,
    }));
    journal.destroy();

    const rebuilt = new TradeJournal(journalConfig({ startingBalance: 1000 }));
    expect(rebuilt.trades).toHaveLength(1);
    expect(rebuilt.openTrades.get('PARTIAL-REBUILD')).toEqual(expect.objectContaining({
      size: 300,
      usdValue: 300,
    }));
    expect(rebuilt.getSnapshot()).toEqual(expect.objectContaining({
      totalTrades: 1,
      openPositions: 1,
      netPnl: 20,
      currentBalance: 1020,
    }));

    rebuilt.destroy();
  });

  test('keeps explicit sizeUsd-only sub-cent remaining notional instead of treating it as fully closed', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig({ startingBalance: 1000 }));
    journal.recordEntry(validEntry({
      orderId: 'TINY-REMAINDER',
      direction: 'BUY',
      entryPrice: 100,
      size: 0.5,
      usdValue: 0.5,
      fees: 0,
    }));

    const leg = journal.recordExit({
      orderId: 'TINY-REMAINDER',
      exitPrice: 110,
      sizeUsd: 0.491,
      pnl: 0.0491,
      fees: 0,
      reason: 'tiny_partial',
    });

    expect(leg).toEqual(expect.objectContaining({
      partialExit: true,
    }));
    expect(leg.remainingUsdValue).toBeCloseTo(0.009);
    expect(journal.openTrades.get('TINY-REMAINDER').size).toBeCloseTo(0.009);
    expect(journal.openTrades.get('TINY-REMAINDER').usdValue).toBeCloseTo(0.009);

    journal.destroy();

    const rebuilt = new TradeJournal(journalConfig({ startingBalance: 1000 }));
    expect(rebuilt.openTrades.get('TINY-REMAINDER').size).toBeCloseTo(0.009);
    expect(rebuilt.openTrades.get('TINY-REMAINDER').usdValue).toBeCloseTo(0.009);

    rebuilt.destroy();
  });

  test('rebuilds sizeUsd-only partial exit ledger records into canonical size and remaining exposure', () => {
    writeLedger([
      oldEntry({
        orderId: 'PARTIAL-SIZEUSD-REBUILD',
        direction: 'BUY',
        entryPrice: 100,
        size: 500,
        usdValue: 500,
        fees: 0,
        timestamp: Date.parse('2026-05-27T11:58:00.000Z'),
      }),
      oldExit({
        orderId: 'PARTIAL-SIZEUSD-REBUILD',
        entryPrice: 100,
        exitPrice: 110,
        size: undefined,
        usdValue: undefined,
        sizeUsd: 200,
        grossPnl: 20,
        netPnl: 20,
        pnlPercent: 10,
        remainingUsdValue: 300,
        remainingSize: 300,
        remainingEntryFees: 0,
        balanceAfter: 1020,
        timestamp: Date.parse('2026-05-27T11:59:00.000Z'),
        entryTime: Date.parse('2026-05-27T11:58:00.000Z'),
      }),
    ]);

    const TradeJournal = require('../core/TradeJournal');
    const rebuilt = new TradeJournal(journalConfig({ startingBalance: 1000 }));

    expect(rebuilt.trades).toHaveLength(1);
    expect(rebuilt.trades[0]).toEqual(expect.objectContaining({
      orderId: 'PARTIAL-SIZEUSD-REBUILD',
      size: 200,
      usdValue: 200,
      sizeUsd: 200,
    }));
    expect(rebuilt.openTrades.get('PARTIAL-SIZEUSD-REBUILD')).toEqual(expect.objectContaining({
      size: 300,
      usdValue: 300,
    }));
    expect(rebuilt.getSnapshot()).toEqual(expect.objectContaining({
      totalTrades: 1,
      openPositions: 1,
      netPnl: 20,
      currentBalance: 1020,
    }));

    rebuilt.destroy();
  });

  test('refuses to rebuild ledger exits with conflicting notional aliases', () => {
    writeLedger([
      oldEntry({
        orderId: 'PARTIAL-CONFLICT-REBUILD',
        direction: 'BUY',
        entryPrice: 100,
        size: 500,
        usdValue: 500,
        fees: 0,
      }),
      oldExit({
        orderId: 'PARTIAL-CONFLICT-REBUILD',
        entryPrice: 100,
        exitPrice: 110,
        sizeUsd: 200,
        usdValue: 210,
        grossPnl: 20,
        netPnl: 20,
        pnlPercent: 10,
        remainingUsdValue: 300,
        remainingSize: 300,
        remainingEntryFees: 0,
      }),
    ]);

    const TradeJournal = require('../core/TradeJournal');

    expect(() => new TradeJournal(journalConfig({ startingBalance: 1000 })))
      .toThrow(/EXIT notional field sizeUsd conflicts with selected exit size/);
  });

  test('refuses duplicate ledger entries and exit-only ledger records on rebuild', () => {
    const TradeJournal = require('../core/TradeJournal');

    writeLedger([
      oldEntry({ orderId: 'LEDGER-DUP', timestamp: Date.parse('2026-05-27T11:58:00.000Z') }),
      oldEntry({ orderId: 'LEDGER-DUP', timestamp: Date.parse('2026-05-27T11:59:00.000Z') }),
    ]);
    expect(() => new TradeJournal(journalConfig()))
      .toThrow(/duplicates ENTRY orderId LEDGER-DUP/);

    fs.rmSync(path.join(tempDir, 'trade-ledger.jsonl'), { force: true });
    writeLedger([oldExit({ orderId: 'LEDGER-EXIT-ONLY' })]);
    expect(() => new TradeJournal(journalConfig()))
      .toThrow(/EXIT has no matching open ENTRY/);
  });

  test('records a flat close with zero pnl and zero fees when the entry exists', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig());
    journal.recordEntry(validEntry({
      orderId: 'FLAT-DIRECT',
      entryPrice: 100,
      size: 25,
      usdValue: 25,
      fees: 0,
    }));

    const accepted = journal.recordExit({
      orderId: 'FLAT-DIRECT',
      exitPrice: 100,
      size: 25,
      pnl: 0,
      fees: 0,
      reason: 'manual',
    });

    const snapshot = journal.getSnapshot();

    expect(accepted).toEqual(expect.objectContaining({
      orderId: 'FLAT-DIRECT',
      direction: 'BUY',
      entryPrice: 100,
      exitPrice: 100,
      netPnl: 0,
      pnlPercent: 0,
      exitReason: 'manual',
    }));
    expect(snapshot.totalTrades).toBe(1);
    expect(snapshot.recentTrades[0]).toEqual(expect.objectContaining({
      orderId: 'FLAT-DIRECT',
      outcome: 'flat',
      pnlPercent: 0,
    }));

    journal.destroy();
  });

  test('derives zero balance from journal state after a valid full loss', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig({ startingBalance: 100 }));
    journal.recordEntry(validEntry({
      orderId: 'ZERO-BALANCE',
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      fees: 0,
    }));

    const accepted = journal.recordExit({
      orderId: 'ZERO-BALANCE',
      exitPrice: 1,
      size: 100,
      pnl: -99,
      fees: 1,
      reason: 'manual',
      balance: 1000000,
    });

    const snapshot = journal.getSnapshot();

    expect(accepted).toEqual(expect.objectContaining({
      orderId: 'ZERO-BALANCE',
      balanceAfter: 0,
      netPnl: -100,
    }));
    expect(snapshot.currentBalance).toBe(0);
    expect(journal.getStats().currentBalance).toBe(0);

    journal.destroy();
  });

  test('derives balance from journal state instead of caller supplied balance', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig({ startingBalance: 1000 }));
    journal.recordEntry(validEntry({
      orderId: 'BALANCE-INJECTION',
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      fees: 0,
    }));

    const accepted = journal.recordExit({
      orderId: 'BALANCE-INJECTION',
      exitPrice: 100,
      size: 100,
      pnl: 0,
      fees: 0,
      reason: 'manual',
      balance: 1000000,
    });

    expect(accepted).toEqual(expect.objectContaining({
      orderId: 'BALANCE-INJECTION',
      balanceAfter: 1000,
      netPnl: 0,
    }));
    expect(journal.getSnapshot().currentBalance).toBe(1000);

    journal.destroy();
  });

  test('reconciles orphaned open journal entries without fabricating completed trade stats', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig({ startingBalance: 1000 }));

    journal.recordEntry(validEntry({
      orderId: 'ORPHAN-JOURNAL-ENTRY',
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      confidence: 75,
      fees: 0,
    }));

    const reconciliation = journal.recordOpenTradeReconciliation({
      orderId: 'ORPHAN-JOURNAL-ENTRY',
      reason: 'state_manager_and_broker_flat',
      source: 'test.flat_authoritative_reconciliation',
      statePositionCount: 1,
      stateActiveTradeCount: 1,
      stateOpenOrderIds: ['OTHER-ACTIVE-ORDER'],
      brokerPositionCount: 1,
      brokerSymbolPositionCount: 0,
      brokerPositions: [{ symbol: 'ETH-USD', qty: '0.1' }],
    });

    expect(reconciliation).toEqual(expect.objectContaining({
      event: 'OPEN_TRADE_RECONCILED',
      orderId: 'ORPHAN-JOURNAL-ENTRY',
      reason: 'state_manager_and_broker_flat',
    }));
    expect(journal.openTrades.size).toBe(0);
    expect(journal.trades).toHaveLength(0);
    expect(journal.getSnapshot()).toEqual(expect.objectContaining({
      openPositions: 0,
      totalTrades: 0,
      netPnl: 0,
      currentBalance: 1000,
    }));
    expect(journal.recordEntry(validEntry({ orderId: 'ORPHAN-JOURNAL-ENTRY' }))).toBeNull();

    journal.destroy();

    const rebuilt = new TradeJournal(journalConfig({ startingBalance: 1000 }));
    expect(rebuilt.openTrades.size).toBe(0);
    expect(rebuilt.trades).toHaveLength(0);
    expect(rebuilt.getStats()).toEqual(expect.objectContaining({
      totalTrades: 0,
      netPnl: 0,
      currentBalance: 1000,
    }));
    expect(rebuilt.recordEntry(validEntry({ orderId: 'ORPHAN-JOURNAL-ENTRY' }))).toBeNull();

    rebuilt.destroy();
  });

  test('refuses open journal reconciliation when broker or state proof is not flat', () => {
    const TradeJournal = require('../core/TradeJournal');
    const journal = new TradeJournal(journalConfig({ startingBalance: 1000 }));

    journal.recordEntry(validEntry({
      orderId: 'REAL-OPEN-JOURNAL-ENTRY',
      direction: 'BUY',
      entryPrice: 100,
      size: 100,
      usdValue: 100,
      confidence: 75,
      fees: 0,
    }));

    const reconciliation = journal.recordOpenTradeReconciliation({
      orderId: 'REAL-OPEN-JOURNAL-ENTRY',
      reason: 'state_manager_and_broker_flat',
      source: 'test.non_flat_authoritative_reconciliation',
      statePositionCount: 1,
      stateActiveTradeCount: 1,
      stateOpenOrderIds: ['REAL-OPEN-JOURNAL-ENTRY'],
      brokerPositionCount: 1,
      brokerSymbolPositionCount: 1,
      brokerPositions: [{ symbol: 'btc-usd', qty: '0.1' }],
    });

    expect(reconciliation).toBeNull();
    expect(journal.openTrades.has('REAL-OPEN-JOURNAL-ENTRY')).toBe(true);
    expect(journal.getStats().totalTrades).toBe(0);

    journal.destroy();
  });
});
