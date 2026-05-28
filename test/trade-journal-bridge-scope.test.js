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

  test('does not mark flat or malformed replay notifications as wins', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const sent = [];
    const bridge = {
      _send: jest.fn((payload) => sent.push(payload)),
      _sendJournalSnapshot: jest.fn(),
    };

    TradeJournalBridge.prototype._pushTradeClosedNotification.call(bridge, 'flat-1', {
      direction: 'BUY',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 0,
      pnlPercent: 0,
      reason: 'manual',
      holdTime: 0,
    }, null);

    TradeJournalBridge.prototype._pushTradeClosedNotification.call(bridge, 'rounded-flat-1', {
      direction: 'BUY',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 0.004,
      pnlPercent: 0.004,
      reason: 'manual',
      holdTime: 0,
    }, null);

    TradeJournalBridge.prototype._pushTradeClosedNotification.call(bridge, 'bad-pnl-1', {
      direction: 'BUY',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 'not-a-number',
      pnlPercent: null,
      reason: 'manual',
      holdTime: 0,
    }, null);

    TradeJournalBridge.prototype._pushTradeClosedNotification.call(bridge, 'conflicting-pnl-1', {
      direction: 'BUY',
      entryPrice: 100,
      exitPrice: 100,
      pnl: 0,
      pnlPercent: 0.01,
      reason: 'manual',
      holdTime: 0,
    }, null);

    const [flat, roundedFlat, badPnl, conflictingPnl] = sent.map((payload) => payload.data);
    expect(flat).toMatchObject({ outcome: 'flat', isWin: false, isLoss: false, isBreakEven: true, pnl: 0, pnlPercent: 0 });
    expect(roundedFlat).toMatchObject({ outcome: 'flat', isWin: false, isLoss: false, isBreakEven: true, pnl: 0.004, pnlPercent: 0.004 });
    expect(badPnl).toMatchObject({ outcome: 'unverified', isWin: false, isLoss: false, isBreakEven: false, pnl: null, pnlPercent: null });
    expect(conflictingPnl).toMatchObject({ outcome: 'unverified', isWin: false, isLoss: false, isBreakEven: false, pnl: 0, pnlPercent: 0.01 });
    expect(bridge._sendJournalSnapshot).toHaveBeenCalledTimes(4);
  });

  test('records StateManager USD position size without multiplying by entry price', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['ORDER-1', {
        orderId: 'ORDER-1',
        size: 1250,
        sizeUsd: 1250,
        entryPrice: 50000,
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({ ok: true })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
      },
      regimeDetector: {
        detectRegime: jest.fn(() => ({ currentRegime: 'test-regime' })),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(),
      },
      replay: {
        captureEntry: jest.fn(),
      },
    };

    TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
    await bot.executeTrade(
      { action: 'BUY', confidence: 71 },
      { totalConfidence: 73 },
      50000,
      {},
      []
    );

    expect(bridge.journal.recordEntry).toHaveBeenCalledTimes(1);
    expect(bridge.journal.recordEntry).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ORDER-1',
      size: 1250,
      usdValue: 1250,
      entryPrice: 50000,
      confidence: 73,
      regime: 'test-regime',
    }));
    expect(bridge.replay.captureEntry).toHaveBeenCalledWith(
      'ORDER-1',
      expect.objectContaining({
        price: 50000,
        confidence: 73,
        regime: 'test-regime',
      }),
      []
    );
  });

  test('refuses to infer journal USD value from ambiguous legacy size', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const activeTrades = new Map([
      ['LEGACY-1', {
        orderId: 'LEGACY-1',
        size: 0.025,
        entryPrice: 50000,
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({ ok: true })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
      },
      regimeDetector: {
        detectRegime: jest.fn(() => ({ currentRegime: 'test-regime' })),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(),
      },
      replay: {
        captureEntry: jest.fn(),
      },
    };

    try {
      TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
      await bot.executeTrade(
        { action: 'BUY', confidence: 71 },
        { totalConfidence: 73 },
        50000,
        {},
        []
      );

      expect(bridge.journal.recordEntry).not.toHaveBeenCalled();
      expect(bridge.replay.captureEntry).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing explicit USD size'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
