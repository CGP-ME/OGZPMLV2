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

  test('does not classify historical rebuilt trades as today', () => {
    writeLedger([oldExit()]);

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
    writeLedger([oldExit({
      orderId: 'LIVE-001',
      timestamp: Date.parse('2026-05-27T11:59:00.000Z'),
      entryTime: Date.parse('2026-05-27T11:58:00.000Z'),
    })]);

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
    writeLedger([oldExit({
      orderId: 'FLAT-001',
      timestamp: Date.parse('2026-05-27T11:59:00.000Z'),
      entryTime: Date.parse('2026-05-27T11:58:00.000Z'),
      grossPnl: 0,
      netPnl: 0,
      pnlPercent: 0,
      balanceAfter: 10000,
    })]);

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
});
