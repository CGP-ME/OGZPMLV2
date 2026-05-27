'use strict';

const path = require('path');

describe('TradeJournalBridge scoped storage', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function scopedBot(overrides = {}) {
    return {
      tradingPair: 'BTC-USD',
      candleTimeframe: '1m',
      config: {
        tradingPair: 'BTC-USD',
        brokerId: 'kraken',
        accountId: 'default',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        journalDataDir: path.join(process.cwd(), 'data', 'journal'),
        ...overrides,
      },
    };
  }

  test('derives journal storage from immutable runtime scope', () => {
    const { resolveJournalDataDir } = require('../core/TradeJournalBridge');

    expect(resolveJournalDataDir(scopedBot(), {})).toBe(
      path.join(process.cwd(), 'data', 'journal', '5-paper__6-kraken__7-default__6-crypto__7-BTC-USD__2-1m')
    );
  });

  test('treats explicit dataDir as a root, not an unscoped bypass', () => {
    const { resolveJournalDataDir } = require('../core/TradeJournalBridge');
    const explicit = path.join(process.cwd(), 'data', 'journal-test');

    expect(resolveJournalDataDir(scopedBot(), { dataDir: explicit })).toBe(
      path.join(explicit, '5-paper__6-kraken__7-default__6-crypto__7-BTC-USD__2-1m')
    );
  });

  test('encodes path separators without collapsing distinct scopes', () => {
    const { resolveJournalDataDir } = require('../core/TradeJournalBridge');
    const root = path.join(process.cwd(), 'data', 'journal-test');

    expect(resolveJournalDataDir(scopedBot({ accountId: 'acct/main' }), { dataDir: root })).toBe(
      path.join(root, '5-paper__6-kraken__11-acct%2Fmain__6-crypto__7-BTC-USD__2-1m')
    );
  });

  test('keeps replay storage under the scoped journal directory', () => {
    const { resolveReplayDir } = require('../core/TradeJournalBridge');
    const journalDir = path.join(process.cwd(), 'data', 'journal', 'scope');

    expect(resolveReplayDir(journalDir, {})).toBe(path.join(journalDir, 'replays'));
    expect(resolveReplayDir(journalDir, { replayDir: path.join(journalDir, 'custom-replays') }))
      .toBe(path.join(journalDir, 'custom-replays'));
    expect(() => resolveReplayDir(journalDir, { replayDir: journalDir }))
      .toThrow(/replayDir must stay under scoped journal dataDir/);
    expect(() => resolveReplayDir(journalDir, { replayDir: path.join(process.cwd(), 'data', 'journal', 'replays') }))
      .toThrow(/replayDir must stay under scoped journal dataDir/);
  });

  test('refuses unscoped default journal storage when runtime scope is incomplete', () => {
    const { resolveJournalDataDir } = require('../core/TradeJournalBridge');

    expect(() => resolveJournalDataDir(scopedBot({ brokerId: null }), {}))
      .toThrow(/TradeJournalBridge\.dataDir missing immutable pattern scope field\(s\): brokerId/);
  });

  test('refuses implicit journal root fallback', () => {
    const { resolveJournalDataDir } = require('../core/TradeJournalBridge');

    expect(() => resolveJournalDataDir(scopedBot({ journalDataDir: '' }), {}))
      .toThrow(/requires configured journalDataDir root/);
  });
});
