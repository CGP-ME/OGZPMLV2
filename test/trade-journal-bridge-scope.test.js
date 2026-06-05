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

  test('closed replay notification exposes missing fields as null, not fabricated values', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const sent = [];
    const bridge = {
      _send: jest.fn((payload) => sent.push(payload)),
      _sendJournalSnapshot: jest.fn(),
    };

    TradeJournalBridge.prototype._pushTradeClosedNotification.call(bridge, 'missing-fields-1', {
      pnl: null,
      pnlPercent: null,
    }, null);

    expect(sent[0].data).toMatchObject({
      orderId: 'missing-fields-1',
      direction: null,
      entryPrice: null,
      exitPrice: null,
      pnl: null,
      pnlPercent: null,
      outcome: 'unverified',
      reason: null,
      holdTime: null,
      isWin: false,
      isLoss: false,
      isBreakEven: false,
    });
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
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'ORDER-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
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

  test('records SELL_SHORT entries from StateManager into journal and replay', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['SHORT-1', {
        orderId: 'SHORT-1',
        action: 'SELL_SHORT',
        direction: 'short',
        size: 875,
        sizeUsd: 875,
        entryPrice: 312.45,
        patterns: [{ name: 'ema_short', confidence: 0.82 }],
      }],
      ['OLD-LONG-1', {
        orderId: 'OLD-LONG-1',
        action: 'BUY',
        direction: 'long',
        size: 222,
        sizeUsd: 222,
        entryPrice: 111.11,
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'SHORT-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
      },
      regimeDetector: {
        detectRegime: jest.fn(() => ({ currentRegime: 'bearish' })),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(() => ({ orderId: 'SHORT-1' })),
      },
      replay: {
        captureEntry: jest.fn(() => ({ orderId: 'SHORT-1' })),
      },
    };

    TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
    await bot.executeTrade(
      { action: 'SELL_SHORT', confidence: 68 },
      { totalConfidence: 72 },
      312.45,
      { rsi: 41, trend: 'down', volatility: 0.3 },
      [{ name: 'signal_pattern', confidence: 0.7 }]
    );

    expect(bridge.journal.recordEntry).toHaveBeenCalledTimes(1);
    expect(bridge.journal.recordEntry).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'SHORT-1',
      direction: 'SELL_SHORT',
      size: 875,
      usdValue: 875,
      entryPrice: 312.45,
      confidence: 72,
      regime: 'bearish',
    }));
    expect(bridge.replay.captureEntry).toHaveBeenCalledWith(
      'SHORT-1',
      expect.objectContaining({
        price: 312.45,
        direction: 'SELL_SHORT',
        confidence: 72,
        regime: 'bearish',
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
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'LEGACY-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
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

  test('wraps OrderExecutor logTrade sink and records complete close records', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const originalLogTrade = jest.fn(async () => ({ logged: true }));
    const bot = {
      executeTrade: jest.fn(async () => ({ ok: true })),
      orderExecutor: {
        ctx: {
          logTrade: originalLogTrade,
        },
      },
      stateManager: {
        get: jest.fn((key) => {
          if (key === 'activeTrades') return new Map();
          if (key === 'balance') return 10050;
          return null;
        }),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(),
        recordExit: jest.fn(),
      },
      replay: {
        captureEntry: jest.fn(),
        captureExit: jest.fn(() => '/tmp/replay.json'),
      },
      _pushTradeClosedNotification: jest.fn(),
      _recordTradeLogClose: TradeJournalBridge.prototype._recordTradeLogClose,
    };

    TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
    const result = await bot.orderExecutor.ctx.logTrade({
      type: 'SELL',
      orderId: 'ORDER-1',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 105,
      pnl: 50,
      pnlPercent: 5,
      reason: 'take_profit',
      holdTime: 60000,
      size: 1000,
    });

    expect(result).toEqual({ logged: true });
    expect(originalLogTrade).toHaveBeenCalledTimes(1);
    expect(bridge.journal.recordExit).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ORDER-1',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 105,
      pnl: 50,
      reason: 'take_profit',
      holdTime: 60000,
      balance: 10050,
      size: 1000,
    }));
    expect(bridge.replay.captureExit).toHaveBeenCalledWith(
      'ORDER-1',
      expect.objectContaining({
        exitPrice: 105,
        reason: 'take_profit',
        pnl: 50,
        pnlPercent: 5,
        holdTime: 60000,
        direction: 'long',
      }),
      []
    );
    expect(bridge._pushTradeClosedNotification).toHaveBeenCalledWith(
      'ORDER-1',
      expect.objectContaining({
        direction: 'long',
        entryPrice: 100,
        exitPrice: 105,
        pnl: 50,
        reason: 'take_profit',
      }),
      '/tmp/replay.json'
    );
  });

  test('refuses incomplete close records after preserving original logTrade side effect', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalLogTrade = jest.fn(async () => ({ logged: true }));
    const bot = {
      executeTrade: jest.fn(async () => ({ ok: true })),
      orderExecutor: {
        ctx: {
          logTrade: originalLogTrade,
        },
      },
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? new Map() : 10000),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(),
        recordExit: jest.fn(),
      },
      replay: {
        captureEntry: jest.fn(),
        captureExit: jest.fn(),
      },
      _pushTradeClosedNotification: jest.fn(),
      _recordTradeLogClose: TradeJournalBridge.prototype._recordTradeLogClose,
    };

    try {
      TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
      await bot.orderExecutor.ctx.logTrade({
        type: 'SELL',
        orderId: 'ORDER-2',
        direction: 'long',
        entryPrice: 100,
        pnl: 50,
        reason: 'take_profit',
        holdTime: 60000,
      });

      expect(originalLogTrade).toHaveBeenCalledTimes(1);
      expect(bridge.journal.recordExit).not.toHaveBeenCalled();
      expect(bridge.replay.captureExit).not.toHaveBeenCalled();
      expect(bridge._pushTradeClosedNotification).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing field(s): exitPrice'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('records complete close records even when legacy logTrade throws', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const originalLogTrade = jest.fn(async () => {
      throw new Error('legacy logger failed');
    });
    const bot = {
      executeTrade: jest.fn(async () => ({ ok: true })),
      orderExecutor: {
        ctx: {
          logTrade: originalLogTrade,
        },
      },
      stateManager: {
        get: jest.fn((key) => {
          if (key === 'activeTrades') return new Map();
          if (key === 'balance') return 10050;
          return null;
        }),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(),
        recordExit: jest.fn(),
      },
      replay: {
        captureEntry: jest.fn(),
        captureExit: jest.fn(() => '/tmp/replay.json'),
      },
      _pushTradeClosedNotification: jest.fn(),
      _recordTradeLogClose: TradeJournalBridge.prototype._recordTradeLogClose,
    };

    TradeJournalBridge.prototype._wireTradeEvents.call(bridge);

    await expect(bot.orderExecutor.ctx.logTrade({
      type: 'SELL',
      orderId: 'ORDER-3',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 105,
      pnl: 50,
      pnlPercent: 5,
      reason: 'take_profit',
      holdTime: 60000,
      size: 1000,
    })).rejects.toThrow(/legacy logger failed/);

    expect(bridge.journal.recordExit).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'ORDER-3',
      exitPrice: 105,
      reason: 'take_profit',
      pnl: 50,
    }));
    expect(bridge._pushTradeClosedNotification).toHaveBeenCalledTimes(1);
  });

  test('dedupes exact close records when multiple log sinks see the same exit', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const exitRecord = {
      type: 'SELL',
      orderId: 'ORDER-4',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 105,
      pnl: 50,
      pnlPercent: 5,
      reason: 'take_profit',
      holdTime: 60000,
      size: 1000,
    };
    const bridge = {
      bot: {
        stateManager: {
          get: jest.fn((key) => key === 'balance' ? 10050 : null),
        },
        priceHistory: [],
      },
      journal: {
        recordExit: jest.fn(),
      },
      replay: {
        captureExit: jest.fn(() => '/tmp/replay.json'),
      },
      _pushTradeClosedNotification: jest.fn(),
      _closedTradeLogKeySet: new Set(),
      _closedTradeLogKeys: [],
    };

    try {
      const secondSinkRecord = {
        ...exitRecord,
        pnlPercent: null,
        reason: 'signal',
      };

      expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, exitRecord, 'bot.logTrade')).toBe(true);
      expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, secondSinkRecord, 'orderExecutor.ctx.logTrade')).toBe(false);

      expect(bridge.journal.recordExit).toHaveBeenCalledTimes(1);
      expect(bridge.replay.captureExit).toHaveBeenCalledTimes(1);
      expect(bridge._pushTradeClosedNotification).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate closed-trade log ignored'));
    } finally {
      warnSpy.mockRestore();
    }
  });
});
