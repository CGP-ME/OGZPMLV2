'use strict';

const fs = require('fs');
const os = require('os');
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

  function tempVisibilityFailurePath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-visibility-'));
    return path.join(dir, 'trade-visibility-failures.jsonl');
  }

  function readJsonl(filepath) {
    return fs.readFileSync(filepath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
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

  test('resolves replay candles from active symbol context before bot-level history', () => {
    const { resolveReplayPriceHistory } = require('../core/TradeJournalBridge');
    const tslaHistory = [{ close: 400, timestamp: 1 }];
    const maraHistory = [{ close: 14.5, timestamp: 2 }];
    const result = resolveReplayPriceHistory({
      priceHistory: tslaHistory,
      symbolContexts: new Map([
        ['MARA', { priceHistory: maraHistory }],
      ]),
      config: { tradingPair: 'TSLA' },
    }, 'MARA');

    expect(result).toMatchObject({
      ok: true,
      source: 'symbol_context',
      symbol: 'MARA',
    });
    expect(result.priceHistory).toBe(maraHistory);
  });

  test('refuses bot-level replay history when symbol contexts are active but missing the trade symbol', () => {
    const { resolveReplayPriceHistory } = require('../core/TradeJournalBridge');
    const result = resolveReplayPriceHistory({
      priceHistory: [{ close: 400, timestamp: 1 }],
      symbolContexts: new Map([
        ['TSLA', { priceHistory: [{ close: 400, timestamp: 1 }] }],
      ]),
      config: { tradingPair: 'TSLA' },
    }, 'MARA');

    expect(result).toMatchObject({
      ok: false,
      reason: 'symbol_context_missing',
      source: 'symbol_context',
      symbol: 'MARA',
      availableSymbols: ['TSLA'],
    });
    expect(result.priceHistory).toBeNull();
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

  test('routes multi-asset active trades into their own symbol-scoped journal', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const journalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-journal-multi-symbol-'));
    const activeTrades = new Map();
    const maraTrade = {
      orderId: 'MARA-1',
      action: 'BUY',
      direction: 'long',
      symbol: 'MARA',
      traceId: 'trace-mara-1',
      signalId: 'signal-mara-1',
      decisionId: 'decision-mara-1',
      size: 500,
      sizeUsd: 500,
      entryPrice: 14.9,
      confidence: 87,
      entryFee: 0.75,
      timestamp: Date.parse('2026-06-22T17:45:00.000Z'),
      entryStrategy: 'MADynamicSR',
      regimeAtEntry: 'ranging',
      entryIndicators: { rsi: 46, macd: { macd: 0.11 }, trend: 'up', volatility: 0.22 },
      patterns: [{ name: 'wedge', confidence: 0.7 }],
    };
    const bot = {
      tradingPair: 'TSLA',
      candleTimeframe: '15m',
      config: {
        tradingPair: 'TSLA',
        brokerId: 'alpaca',
        accountId: 'acct-1',
        assetClass: 'stocks',
        executionMode: 'live',
        timeframe: '15m',
        journalDataDir: journalRoot,
      },
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'MARA-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
      },
      priceHistory: [],
    };

    const bridge = new TradeJournalBridge(bot, {
      dataDir: journalRoot,
      startingBalance: 5000,
      autoSaveInterval: 600000,
    });

    try {
      activeTrades.set('MARA-1', maraTrade);
      await bot.executeTrade({ action: 'BUY', confidence: 87 }, {}, 14.9, {}, []);

      const maraLedger = path.join(journalRoot, '4-live__6-alpaca__6-acct-1__6-stocks__4-MARA__3-15m', 'trade-ledger.jsonl');
      const tslaLedger = path.join(journalRoot, '4-live__6-alpaca__6-acct-1__6-stocks__4-TSLA__3-15m', 'trade-ledger.jsonl');
      const maraRows = readJsonl(maraLedger);

      expect(maraRows).toHaveLength(1);
      expect(maraRows[0]).toMatchObject({
        event: 'ENTRY',
        orderId: 'MARA-1',
        symbol: 'MARA',
        scopeKey: 'live:alpaca:acct-1:stocks:MARA:15m',
        entryStrategy: 'MADynamicSR',
      });
      if (fs.existsSync(tslaLedger)) {
        expect(readJsonl(tslaLedger).some(row => row.orderId === 'MARA-1')).toBe(false);
      }

      const oldMaraBundle = Array.from(bridge._journalBundles.values())
        .find(bundle => bundle.scope?.symbol === 'MARA');
      oldMaraBundle?.journal?.destroy?.();
      if (oldMaraBundle?.scope?.scopeKey) {
        bridge._journalBundles.delete(oldMaraBundle.scope.scopeKey);
      }
      const grossPnl = 500 * ((15.05 - 14.9) / 14.9);
      expect(bridge._recordTradeLogClose({
        type: 'EXIT',
        id: 'MARA-1',
        symbol: 'MARA',
        direction: 'BUY',
        entryPrice: 14.9,
        exitPrice: 15.05,
        pnl: grossPnl,
        holdTime: 900000,
        reason: 'test_exit',
        size: 500,
      }, 'test')).toBe(true);

      const snapshot = bridge._combinedJournalSnapshot();
      expect(snapshot.scopeMode).toBe('multi-symbol-aggregate');
      expect(snapshot.symbols).toEqual(expect.arrayContaining(['TSLA', 'MARA']));
      expect(snapshot.recentTrades[0]).toMatchObject({
        orderId: 'MARA-1',
        symbol: 'MARA',
        exitReason: 'test_exit',
      });
      const maraRowsAfterExit = readJsonl(maraLedger);
      expect(maraRowsAfterExit.map(row => row.event)).toEqual(['ENTRY', 'EXIT']);
      expect(maraRowsAfterExit[1]).toMatchObject({
        orderId: 'MARA-1',
        symbol: 'MARA',
        scopeKey: 'live:alpaca:acct-1:stocks:MARA:15m',
      });

      const symbolBreakdown = bridge._combinedPerformanceBreakdown('symbol');
      expect(symbolBreakdown.MARA).toMatchObject({
        trades: 1,
        wins: 1,
        losses: 0,
      });
      expect(symbolBreakdown.MARA.netPnl).toBeGreaterThan(0);
      expect(symbolBreakdown.TSLA).toBeUndefined();
      expect(symbolBreakdown.all).toBeUndefined();
    } finally {
      bridge.destroy();
      fs.rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  test('reconciles stale journal-open trades at startup when state and broker are flat', async () => {
    const {
      TradeJournalBridge,
      TradeJournal,
      resolveJournalScope,
      resolveJournalDataDir,
    } = require('../core/TradeJournalBridge');
    const journalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-journal-startup-reconcile-'));
    const activeTrades = new Map();
    const bot = {
      tradingPair: 'TSLA',
      candleTimeframe: '15m',
      config: {
        tradingPair: 'TSLA',
        brokerId: 'alpaca',
        accountId: 'acct-1',
        assetClass: 'stocks',
        executionMode: 'live',
        timeframe: '15m',
        journalDataDir: journalRoot,
      },
      ttpCutoffSymbols: ['TSLA'],
      sessionRouter: {
        activeBroker: {
          id: 'alpaca',
          getPositions: jest.fn(async () => []),
        },
      },
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'unused',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => {
          if (key === 'activeTrades') return activeTrades;
          if (key === 'positionCount') return 0;
          return null;
        }),
      },
      priceHistory: [],
    };
    const scope = resolveJournalScope(bot);
    const journalDir = resolveJournalDataDir(bot, { dataDir: journalRoot }, scope);
    const preexistingJournal = new TradeJournal({
      dataDir: journalDir,
      scope,
      startingBalance: 5000,
      autoSaveInterval: 600000,
    });
    preexistingJournal.recordEntry({
      orderId: 'STALE-JOURNAL-OPEN',
      direction: 'BUY',
      entryPrice: 400,
      size: 800,
      usdValue: 800,
      confidence: 72,
      fees: 1.5,
      timestamp: Date.parse('2026-06-29T16:50:00.000Z'),
      regime: 'ranging',
      indicators: { rsi: 48, macd: 0.1, trend: 'up', volatility: 0.2 },
      patterns: [],
      entryStrategy: 'EMASMACrossover',
    });
    preexistingJournal.destroy();

    const bridge = new TradeJournalBridge(bot, {
      dataDir: journalRoot,
      startingBalance: 5000,
      autoSaveInterval: 600000,
    });

    try {
      await bridge._startupJournalReconciliationPromise;

      expect(bot.sessionRouter.activeBroker.getPositions).toHaveBeenCalledTimes(1);
      expect(bridge._combinedJournalSnapshot().openPositions).toBe(0);
      expect(bridge.journal.openTrades.size).toBe(0);
      const rows = readJsonl(path.join(journalDir, 'trade-ledger.jsonl'));
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'OPEN_TRADE_RECONCILED',
          orderId: 'STALE-JOURNAL-OPEN',
          reason: 'state_manager_and_broker_flat',
          source: 'TradeJournalBridge.startup_authoritative_reconciliation',
          stateActiveTradeCount: 0,
          brokerPositionCount: 0,
          brokerSymbolPositionCount: 0,
        }),
      ]));
    } finally {
      bridge.destroy();
      fs.rmSync(journalRoot, { recursive: true, force: true });
    }
  });

  test('journal reconciliation refuses legacy kraken alias when active broker is absent', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const legacyBroker = { getPositions: jest.fn(async () => []) };
    const bridge = {
      bot: {
        kraken: legacyBroker,
      },
    };

    try {
      const positions = await TradeJournalBridge.prototype._brokerPositionsForJournalReconciliation.call(bridge);

      expect(positions).toBeNull();
      expect(legacyBroker.getPositions).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('refusing broker-ambiguous position read'));
    } finally {
      warnSpy.mockRestore();
    }
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
    expect(flat).toMatchObject({ outcome: 'flat', isWin: false, isLoss: false, isBreakEven: true, pnl: 0, pnlPercent: 0, replayAvailable: false, replayUrl: null });
    expect(flat.journalRecorded).toBeNull();
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
      replayAvailable: false,
      replayUrl: null,
      journalRecorded: null,
    });
  });

  test('closed replay notification advertises replay URL only when file exists', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const sent = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-replay-url-'));
    const replayPath = path.join(dir, 'ORDER-REPLAY.json');
    fs.writeFileSync(replayPath, '{}', 'utf8');
    const bridge = {
      _send: jest.fn((payload) => sent.push(payload)),
      _sendJournalSnapshot: jest.fn(),
    };

    TradeJournalBridge.prototype._pushTradeClosedNotification.call(bridge, 'ORDER-REPLAY', {
      direction: 'BUY',
      entryPrice: 100,
      exitPrice: 101,
      pnl: 1,
      pnlPercent: 1,
      reason: 'manual',
      holdTime: 1000,
    }, replayPath, { journalRecorded: false });

    expect(sent[0].data).toMatchObject({
      orderId: 'ORDER-REPLAY',
      journalRecorded: false,
      replayAvailable: true,
      replayUrl: '/replay?id=ORDER-REPLAY',
    });
  });

  test('records StateManager USD position size without multiplying by entry price', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['ORDER-1', {
        orderId: 'ORDER-1',
        symbol: 'TSLA',
        traceId: 'trace-order-1',
        signalId: 'sig-order-1',
        decisionId: 'decision-order-1',
        action: 'BUY',
        direction: 'long',
        size: 1250,
        sizeUsd: 1250,
        entryPrice: 50000,
        confidence: 84,
        entryFee: 3.125,
        timestamp: 1780000000000,
        entryStrategy: 'EMASMACrossover',
        decisionLedger: {
          signalId: 'sig-order-1',
          traceId: 'trace-order-1',
          strategySignals: [{ strategyName: 'EMASMACrossover', confidence: 84 }],
          orchestratorDecision: {
            winnerStrategy: 'EMASMACrossover',
            competingStrategies: [{ strategyName: 'RSI', adjustedConfidence: 62 }],
          },
          positionSizing: { finalSizeUsd: 1250 },
          exitContract: { strategyName: 'EMASMACrossover', stopLossPercent: -0.5 },
          riskGates: { ttp: { allowed: true } },
        },
        regimeAtEntry: 'state-regime',
        entryIndicators: { rsi: 52, macd: { macd: 0.12 }, trend: 'state-up', volatility: 0.19 },
        patterns: [],
      }],
    ]);
    const tslaReplayHistory = [{ open: 49900, high: 50100, low: 49800, close: 50000, volume: 10, timestamp: 1779999990000 }];
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
      symbolContexts: new Map([
        ['TSLA', { priceHistory: tslaReplayHistory }],
      ]),
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(() => ({ orderId: 'ORDER-1' })),
      },
      replay: {
        captureEntry: jest.fn(() => ({ orderId: 'ORDER-1' })),
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
      confidence: 84,
      regime: 'state-regime',
      fees: 3.125,
      timestamp: 1780000000000,
      entryStrategy: 'EMASMACrossover',
      winnerStrategy: 'EMASMACrossover',
      signalId: 'sig-order-1',
      traceId: 'trace-order-1',
      decisionId: 'decision-order-1',
      orchestratorDecision: expect.objectContaining({ winnerStrategy: 'EMASMACrossover' }),
      strategySignals: [{ strategyName: 'EMASMACrossover', confidence: 84 }],
      positionSizing: { finalSizeUsd: 1250 },
      exitContract: { strategyName: 'EMASMACrossover', stopLossPercent: -0.5 },
      riskGates: { ttp: { allowed: true } },
      indicators: { rsi: 52, macd: { macd: 0.12 }, trend: 'state-up', volatility: 0.19 },
    }));
    expect(bot.regimeDetector.detectRegime).not.toHaveBeenCalled();
    expect(bridge.replay.captureEntry).toHaveBeenCalledWith(
      'ORDER-1',
      expect.objectContaining({
        price: 50000,
        confidence: 84,
        regime: 'state-regime',
        entryStrategy: 'EMASMACrossover',
        winnerStrategy: 'EMASMACrossover',
        signalId: 'sig-order-1',
        traceId: 'trace-order-1',
        decisionId: 'decision-order-1',
        orchestratorDecision: expect.objectContaining({ winnerStrategy: 'EMASMACrossover' }),
      }),
      tslaReplayHistory
    );
  });

  test('records SELL_SHORT entries from StateManager into journal and replay', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['SHORT-1', {
        orderId: 'SHORT-1',
        symbol: 'TSLA',
        traceId: 'trace-short-1',
        signalId: 'signal-short-1',
        decisionId: 'decision-short-1',
        action: 'SELL_SHORT',
        direction: 'short',
        size: 875,
        sizeUsd: 875,
        entryPrice: 312.45,
        confidence: 77,
        entryFee: 2.1875,
        timestamp: 1780000100000,
        entryStrategy: 'LiquiditySweep',
        decisionLedger: {
          strategySignals: [{ strategyName: 'LiquiditySweep', confidence: 77 }],
          orchestratorDecision: {
            winnerStrategy: 'LiquiditySweep',
            competingStrategies: [{ strategyName: 'EMASMACrossover', adjustedConfidence: 70 }],
          },
        },
        regimeAtEntry: 'state-bearish',
        entryIndicators: { rsi: 39, macd: { macd: -0.3 }, trend: 'state-down', volatility: 0.41 },
        patterns: [{ name: 'ema_short', confidence: 0.82 }],
      }],
      ['OLD-LONG-1', {
        orderId: 'OLD-LONG-1',
        symbol: 'TSLA',
        traceId: 'trace-old-long-1',
        signalId: 'signal-old-long-1',
        decisionId: 'decision-old-long-1',
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
      confidence: 77,
      regime: 'state-bearish',
      fees: 2.1875,
      timestamp: 1780000100000,
      entryStrategy: 'LiquiditySweep',
      winnerStrategy: 'LiquiditySweep',
      orchestratorDecision: expect.objectContaining({ winnerStrategy: 'LiquiditySweep' }),
      indicators: { rsi: 39, macd: { macd: -0.3 }, trend: 'state-down', volatility: 0.41 },
    }));
    expect(bot.regimeDetector.detectRegime).not.toHaveBeenCalled();
    expect(bridge.replay.captureEntry).toHaveBeenCalledWith(
      'SHORT-1',
      expect.objectContaining({
        price: 312.45,
        direction: 'SELL_SHORT',
        confidence: 77,
        regime: 'state-bearish',
        entryStrategy: 'LiquiditySweep',
        winnerStrategy: 'LiquiditySweep',
        orchestratorDecision: expect.objectContaining({ winnerStrategy: 'LiquiditySweep' }),
      }),
      []
    );
  });

  test('records accepted entries from active trade source even when decision action is missing', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['SHORT-SOURCE-1', {
        orderId: 'SHORT-SOURCE-1',
        symbol: 'TSLA',
        traceId: 'trace-short-source-1',
        signalId: 'signal-short-source-1',
        decisionId: 'decision-short-source-1',
        action: 'SELL_SHORT',
        direction: 'short',
        size: 900,
        sizeUsd: 900,
        entryPrice: 300.25,
        confidence: 88,
        entryFee: 2.25,
        timestamp: 1780000200000,
        entryStrategy: 'LiquiditySweep',
        regimeAtEntry: 'source-bear',
        entryIndicators: { rsi: 36, trend: 'source-down' },
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'SHORT-SOURCE-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(() => ({ orderId: 'SHORT-SOURCE-1' })),
      },
      replay: {
        captureEntry: jest.fn(() => ({ orderId: 'SHORT-SOURCE-1' })),
      },
    };

    TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
    await bot.executeTrade({}, { totalConfidence: 1 }, 999, { rsi: 99 }, []);

    expect(bridge.journal.recordEntry).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'SHORT-SOURCE-1',
      direction: 'SELL_SHORT',
      entryPrice: 300.25,
      size: 900,
      usdValue: 900,
      confidence: 88,
      fees: 2.25,
      timestamp: 1780000200000,
      entryStrategy: 'LiquiditySweep',
      winnerStrategy: 'LiquiditySweep',
      traceId: 'trace-short-source-1',
      signalId: 'signal-short-source-1',
      decisionId: 'decision-short-source-1',
      regime: 'source-bear',
      indicators: { rsi: 36, trend: 'source-down' },
    }));
  });

  test('does not reinterpret explicit exits as entries when the active trade still exists', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['OPEN-LONG-1', {
        orderId: 'OPEN-LONG-1',
        action: 'BUY',
        direction: 'long',
        sizeUsd: 1000,
        entryPrice: 100,
        confidence: 82,
        entryFee: 2.5,
        timestamp: 1780000250000,
        regimeAtEntry: 'state-regime',
        entryIndicators: { rsi: 48 },
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'OPEN-LONG-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
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
    await bot.executeTrade({ action: 'SELL', confidence: 80, tradeId: 'OPEN-LONG-1' }, {}, 101, {}, []);

    expect(bridge.journal.recordEntry).not.toHaveBeenCalled();
    expect(bridge.replay.captureEntry).not.toHaveBeenCalled();
  });

  test('does not reinterpret explicit cover exits as entries when the active trade still exists', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['OPEN-SHORT-1', {
        orderId: 'OPEN-SHORT-1',
        action: 'SELL_SHORT',
        direction: 'short',
        sizeUsd: 1000,
        entryPrice: 100,
        confidence: 82,
        entryFee: 2.5,
        timestamp: 1780000260000,
        regimeAtEntry: 'state-regime',
        entryIndicators: { rsi: 48 },
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'OPEN-SHORT-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
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
    await bot.executeTrade({ action: 'COVER', confidence: 80, tradeId: 'OPEN-SHORT-1' }, {}, 99, {}, []);

    expect(bridge.journal.recordEntry).not.toHaveBeenCalled();
    expect(bridge.replay.captureEntry).not.toHaveBeenCalled();
  });

  test('refuses to infer journal USD value from ambiguous legacy size', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const visibilityFailurePath = tempVisibilityFailurePath();
    const activeTrades = new Map([
      ['LEGACY-1', {
        orderId: 'LEGACY-1',
        action: 'BUY',
        direction: 'long',
        size: 0.025,
        entryPrice: 50000,
        confidence: 71,
        entryFee: 0.01,
        timestamp: 1780000300000,
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
      visibilityFailurePath,
      _send: jest.fn(),
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
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('sizeUsd'));
      const [record] = readJsonl(visibilityFailurePath);
      expect(record).toMatchObject({
        eventType: 'trade_entry_source_incomplete',
        orderId: 'LEGACY-1',
        action: 'BUY',
        missing: expect.arrayContaining(['sizeUsd']),
        message: expect.stringContaining('sizeUsd'),
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('records visibility failure instead of hardcoding zero fees for source-backed entries', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const visibilityFailurePath = tempVisibilityFailurePath();
    const activeTrades = new Map([
      ['NO-FEE-1', {
        orderId: 'NO-FEE-1',
        action: 'BUY',
        direction: 'long',
        sizeUsd: 500,
        entryPrice: 250,
        confidence: 76,
        timestamp: 1780000500000,
        regimeAtEntry: 'state-regime',
        entryIndicators: { rsi: 51 },
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'NO-FEE-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
      },
      priceHistory: [],
    };
    const bridge = {
      bot,
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
        recordEntry: jest.fn(),
      },
      replay: {
        captureEntry: jest.fn(),
      },
      visibilityFailurePath,
      _send: jest.fn(),
    };

    try {
      TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
      await bot.executeTrade({ action: 'BUY', confidence: 76 }, { totalConfidence: 99 }, 250, {}, []);

      expect(bridge.journal.recordEntry).not.toHaveBeenCalled();
      expect(bridge.replay.captureEntry).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('entryFee'));
      const [record] = readJsonl(visibilityFailurePath);
      expect(record).toMatchObject({
        eventType: 'trade_entry_source_incomplete',
        orderId: 'NO-FEE-1',
        action: 'BUY',
        missing: expect.arrayContaining(['entryFee']),
        message: expect.stringContaining('entryFee'),
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('startup reconciliation journals open StateManager trades without creating replay captures', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const activeTrades = new Map([
      ['OPEN-STATE-1', {
        orderId: 'OPEN-STATE-1',
        symbol: 'TSLA',
        traceId: 'trace-open-state-1',
        signalId: 'signal-open-state-1',
        decisionId: 'decision-open-state-1',
        action: 'SELL_SHORT',
        direction: 'short',
        sizeUsd: 1200,
        entryPrice: 391.35,
        confidence: 100,
        entryFee: 3,
        timestamp: 1780687800220,
        entryStrategy: 'EMASMACrossover',
        regimeAtEntry: 'trending_down',
        entryIndicators: { rsi: 42, trend: 'down' },
        patterns: [{ name: 'ema_cross', confidence: 0.9 }],
      }],
    ]);
    const bridge = {
      bot: {
        stateManager: {
          get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
        },
      },
      journal: {
        entryOrderIds: new Set(),
        openTrades: new Map(),
        trades: [],
        recordEntry: jest.fn(() => ({ orderId: 'OPEN-STATE-1' })),
      },
      replay: {
        captureEntry: jest.fn(),
      },
    };

    TradeJournalBridge.prototype._reconcileOpenStateTrades.call(bridge);

    expect(bridge.journal.recordEntry).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'OPEN-STATE-1',
      direction: 'SELL_SHORT',
      entryPrice: 391.35,
      size: 1200,
      usdValue: 1200,
      confidence: 100,
      fees: 3,
      timestamp: 1780687800220,
      entryStrategy: 'EMASMACrossover',
      winnerStrategy: 'EMASMACrossover',
      traceId: 'trace-open-state-1',
      signalId: 'signal-open-state-1',
      decisionId: 'decision-open-state-1',
      regime: 'trending_down',
      indicators: { rsi: 42, trend: 'down' },
      source: 'StateManager.activeTrades',
    }));
    expect(bridge.replay.captureEntry).not.toHaveBeenCalled();
  });

  test('startup reconciliation refuses map-key orderId fallback for open StateManager trades', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const visibilityFailurePath = tempVisibilityFailurePath();
    const activeTrades = new Map([
      ['KEY-ONLY-1', {
        action: 'BUY',
        direction: 'long',
        sizeUsd: 1000,
        entryPrice: 100,
        confidence: 80,
        entryFee: 2.5,
        timestamp: 1780000600000,
        regimeAtEntry: 'state-regime',
        entryIndicators: { rsi: 50 },
        patterns: [],
      }],
    ]);
    const bridge = {
      bot: {
        stateManager: {
          get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
        },
      },
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
        entryOrderIds: new Set(),
        openTrades: new Map(),
        trades: [],
        recordEntry: jest.fn(),
      },
      replay: {
        captureEntry: jest.fn(),
      },
      visibilityFailurePath,
      _send: jest.fn(),
    };

    TradeJournalBridge.prototype._reconcileOpenStateTrades.call(bridge);

    expect(bridge.journal.recordEntry).not.toHaveBeenCalled();
    expect(bridge.replay.captureEntry).not.toHaveBeenCalled();
    const [record] = readJsonl(visibilityFailurePath);
    expect(record).toMatchObject({
      eventType: 'trade_entry_state_reconciliation_refused',
      orderId: null,
      missing: ['activeTrade.orderId'],
      context: expect.objectContaining({ activeTradeKey: 'KEY-ONLY-1' }),
    });
  });

  test('wraps OrderExecutor logTrade sink and records complete close records', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const originalLogTrade = jest.fn(async () => ({ logged: true }));
    const tslaReplayHistory = [{ open: 104, high: 106, low: 103, close: 105, volume: 10, timestamp: 1780000090000 }];
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
      symbolContexts: new Map([
        ['TSLA', { priceHistory: tslaReplayHistory }],
      ]),
    };
    const bridge = {
      bot,
      journal: {
        recordEntry: jest.fn(),
        recordExit: jest.fn(() => ({ orderId: 'ORDER-1' })),
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
      symbol: 'TSLA',
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
      tslaReplayHistory
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
      '/tmp/replay.json',
      { journalRecorded: true }
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
      visibilityFailurePath: tempVisibilityFailurePath(),
      _send: jest.fn(),
      _pushTradeClosedNotification: jest.fn(),
      _recordTradeLogClose: TradeJournalBridge.prototype._recordTradeLogClose,
    };

    try {
      TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
      await bot.orderExecutor.ctx.logTrade({
        type: 'SELL',
        orderId: 'ORDER-2',
        symbol: 'TSLA',
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
        recordExit: jest.fn(() => ({ orderId: 'ORDER-3' })),
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
      symbol: 'TSLA',
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
      symbol: 'TSLA',
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
        recordExit: jest.fn(() => ({ orderId: 'ORDER-4' })),
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

  test('does not dedupe distinct partial close legs that differ by size', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const bridge = {
      bot: {
        stateManager: {
          get: jest.fn((key) => key === 'balance' ? 10050 : null),
        },
        priceHistory: [],
      },
      journal: {
        recordExit: jest.fn(() => ({ orderId: 'ORDER-PARTIAL-KEY' })),
      },
      replay: {
        captureExit: jest.fn(() => '/tmp/replay.json'),
      },
      _pushTradeClosedNotification: jest.fn(),
      _closedTradeLogKeySet: new Set(),
      _closedTradeLogKeys: [],
    };
    const baseRecord = {
      type: 'SELL',
      orderId: 'ORDER-PARTIAL-KEY',
      symbol: 'TSLA',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 105,
      pnl: 5,
      pnlPercent: 5,
      reason: 'tier_exit',
      holdTime: 60000,
    };

    expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, {
      ...baseRecord,
      size: 100,
    }, 'bot.logTrade')).toBe(true);
    expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, {
      ...baseRecord,
      size: 50,
    }, 'bot.logTrade')).toBe(true);

    expect(bridge.journal.recordExit).toHaveBeenCalledTimes(2);
    expect(bridge.journal.recordExit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      orderId: 'ORDER-PARTIAL-KEY',
      size: 100,
    }));
    expect(bridge.journal.recordExit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      orderId: 'ORDER-PARTIAL-KEY',
      size: 50,
    }));
    expect(bridge.replay.captureExit).toHaveBeenCalledTimes(2);
    expect(bridge._pushTradeClosedNotification).toHaveBeenCalledTimes(2);
  });

  test('records durable visibility failure when entry journal refuses a trade', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const visibilityFailurePath = tempVisibilityFailurePath();
    const activeTrades = new Map([
      ['ORDER-VIS-1', {
        orderId: 'ORDER-VIS-1',
        symbol: 'BTC-USD',
        traceId: 'trace-order-vis-1',
        signalId: 'signal-order-vis-1',
        decisionId: 'decision-order-vis-1',
        action: 'BUY',
        direction: 'long',
        sizeUsd: 1250,
        usdValue: 1250,
        entryPrice: 100,
        confidence: 75,
        entryFee: 3.125,
        timestamp: 1780000400000,
        entryStrategy: 'RSI',
        regimeAtEntry: 'visibility-regime',
        entryIndicators: { rsi: 44 },
        patterns: [],
      }],
    ]);
    const bot = {
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'ORDER-VIS-1',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
        markActiveTradeJournalFailure: jest.fn(() => ({ success: true })),
      },
      regimeDetector: {
        detectRegime: jest.fn(() => ({ currentRegime: 'test-regime' })),
      },
      priceHistory: [{ open: 100, high: 101, low: 99, close: 100, volume: 1, timestamp: 1 }],
    };
    const bridge = {
      bot,
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
        recordEntry: jest.fn(() => null),
      },
      replay: {
        captureEntry: jest.fn(() => ({ orderId: 'ORDER-VIS-1' })),
      },
      visibilityFailurePath,
      _send: jest.fn(),
    };

    TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
    await bot.executeTrade(
      { action: 'BUY', confidence: 71 },
      { totalConfidence: 73 },
      100,
      {},
      []
    );

    const [record] = readJsonl(visibilityFailurePath);
    expect(record).toMatchObject({
      type: 'trade_visibility_failure',
      eventType: 'trade_entry_journal_refused',
      phase: 'entry',
      source: 'bot.executeTrade',
      orderId: 'ORDER-VIS-1',
      message: 'TradeJournal.recordEntry returned null',
      visibilityLedgerPersisted: true,
      journalStatus: 'unjournaled',
      trustStatus: 'untrusted',
      manualReconciliationRequired: true,
    });
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bridge._send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'trade_visibility_error',
      data: expect.objectContaining({ eventType: 'trade_entry_journal_refused', orderId: 'ORDER-VIS-1' }),
    }));
    expect(bot.stateManager.markActiveTradeJournalFailure).toHaveBeenCalledWith('ORDER-VIS-1', expect.objectContaining({
      eventType: 'trade_entry_journal_refused',
      phase: 'entry',
      source: 'bot.executeTrade',
      message: 'TradeJournal.recordEntry returned null',
    }));
  });

  test('entry journal write exception marks the active trade unjournaled without killing execution', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const visibilityFailurePath = tempVisibilityFailurePath();
    const activeTrades = new Map([
      ['ORDER-VIS-THROW', {
        orderId: 'ORDER-VIS-THROW',
        symbol: 'BTC-USD',
        traceId: 'trace-order-vis-throw',
        signalId: 'signal-order-vis-throw',
        decisionId: 'decision-order-vis-throw',
        action: 'BUY',
        direction: 'long',
        sizeUsd: 1250,
        usdValue: 1250,
        entryPrice: 100,
        confidence: 75,
        entryFee: 3.125,
        timestamp: 1780000400000,
        entryStrategy: 'RSI',
        regimeAtEntry: 'visibility-regime',
        entryIndicators: { rsi: 44 },
        patterns: [],
      }],
    ]);
    const pauseTrading = jest.fn(() => Promise.resolve({ success: true }));
    const bot = {
      executeTrade: jest.fn(async () => ({
        success: true,
        orderId: 'ORDER-VIS-THROW',
        orderAccepted: true,
        stateMutationSucceeded: true,
      })),
      stateManager: {
        get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
        markActiveTradeJournalFailure: jest.fn(() => ({ success: true })),
        pauseTrading,
      },
      regimeDetector: {
        detectRegime: jest.fn(() => ({ currentRegime: 'test-regime' })),
      },
      priceHistory: [{ open: 100, high: 101, low: 99, close: 100, volume: 1, timestamp: 1 }],
    };
    const err = Object.assign(new Error('append ledger failed'), { code: 'EIO' });
    const bridge = {
      bot,
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
        recordEntry: jest.fn(() => { throw err; }),
      },
      replay: {
        captureEntry: jest.fn(() => ({ orderId: 'ORDER-VIS-THROW' })),
      },
      visibilityFailurePath,
      _send: jest.fn(),
      _journalPersistenceFailureStreak: 0,
    };

    TradeJournalBridge.prototype._wireTradeEvents.call(bridge);
    const result = await bot.executeTrade(
      { action: 'BUY', confidence: 71 },
      { totalConfidence: 73 },
      100,
      {},
      []
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      orderId: 'ORDER-VIS-THROW',
    }));
    const [record] = readJsonl(visibilityFailurePath);
    expect(record).toMatchObject({
      type: 'trade_visibility_failure',
      eventType: 'trade_entry_recording_exception',
      phase: 'entry',
      source: 'bot.executeTrade',
      orderId: 'ORDER-VIS-THROW',
      message: 'append ledger failed',
      visibilityLedgerPersisted: true,
      journalStatus: 'unjournaled',
      trustStatus: 'untrusted',
      manualReconciliationRequired: true,
    });
    expect(bot.stateManager.markActiveTradeJournalFailure).toHaveBeenCalledWith('ORDER-VIS-THROW', expect.objectContaining({
      eventType: 'trade_entry_recording_exception',
      phase: 'entry',
      source: 'bot.executeTrade',
      message: 'append ledger failed',
    }));
    expect(bridge._journalPersistenceFailureStreak).toBe(1);
    expect(pauseTrading).not.toHaveBeenCalled();
  });

  test('open-state journal reconciliation write exception marks that trade and continues', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const visibilityFailurePath = tempVisibilityFailurePath();
    const activeTrades = new Map([
      ['ORDER-RECONCILE-THROW', {
        orderId: 'ORDER-RECONCILE-THROW',
        symbol: 'BTC-USD',
        traceId: 'trace-order-reconcile-throw',
        signalId: 'signal-order-reconcile-throw',
        decisionId: 'decision-order-reconcile-throw',
        action: 'BUY',
        direction: 'long',
        sizeUsd: 1250,
        usdValue: 1250,
        entryPrice: 100,
        confidence: 75,
        entryFee: 3.125,
        timestamp: 1780000400000,
        entryStrategy: 'RSI',
        regimeAtEntry: 'visibility-regime',
        entryIndicators: { rsi: 44 },
        patterns: [],
      }],
    ]);
    const pauseTrading = jest.fn(() => Promise.resolve({ success: true }));
    const bridge = {
      bot: {
        stateManager: {
          get: jest.fn((key) => key === 'activeTrades' ? activeTrades : null),
          markActiveTradeJournalFailure: jest.fn(() => ({ success: true })),
          pauseTrading,
        },
      },
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
        entryOrderIds: new Set(),
        openTrades: new Map(),
        trades: [],
        recordEntry: jest.fn(() => { throw Object.assign(new Error('append ledger failed'), { code: 'EIO' }); }),
      },
      visibilityFailurePath,
      _send: jest.fn(),
      _journalPersistenceFailureStreak: 0,
    };

    expect(() => TradeJournalBridge.prototype._reconcileOpenStateTrades.call(bridge)).not.toThrow();

    const [record] = readJsonl(visibilityFailurePath);
    expect(record).toMatchObject({
      type: 'trade_visibility_failure',
      eventType: 'trade_entry_recording_exception',
      phase: 'entry',
      source: 'StateManager.activeTrades',
      orderId: 'ORDER-RECONCILE-THROW',
      message: 'append ledger failed',
      visibilityLedgerPersisted: true,
      journalStatus: 'unjournaled',
      trustStatus: 'untrusted',
      manualReconciliationRequired: true,
    });
    expect(bridge.bot.stateManager.markActiveTradeJournalFailure).toHaveBeenCalledWith('ORDER-RECONCILE-THROW', expect.objectContaining({
      eventType: 'trade_entry_recording_exception',
      phase: 'entry',
      source: 'StateManager.activeTrades',
      message: 'append ledger failed',
    }));
    expect(pauseTrading).not.toHaveBeenCalled();
  });

  test('three journal persistence failures pause new entries and a later journal success resumes that source', async () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const pauseTrading = jest.fn(() => Promise.resolve({ success: true }));
    const resumeTradingIfPausedBy = jest.fn(() => Promise.resolve({ success: true, resumed: true }));
    const bridge = {
      bot: {
        config: {
          evalTraceEnabled: true,
          evalTraceBacktest: true,
          enableBacktestMode: true,
        },
        stateManager: {
          pauseTrading,
          resumeTradingIfPausedBy,
        },
      },
      _journalPersistenceFailureStreak: 0,
    };
    const record = (orderId) => ({
      orderId,
      action: 'BUY',
      phase: 'entry',
      source: 'bot.executeTrade',
      context: { entry: { symbol: 'BTC-USD' } },
    });
    const firstRecord = record('ORDER-JOURNAL-DOWN-1');
    const secondRecord = record('ORDER-JOURNAL-DOWN-2');
    const thirdRecord = {
      ...record('ORDER-JOURNAL-DOWN'),
      orderId: 'ORDER-JOURNAL-DOWN',
      action: 'BUY',
      phase: 'entry',
      source: 'bot.executeTrade',
      context: { entry: { symbol: 'BTC-USD' } },
    };
    const err = Object.assign(new Error('append ledger failed'), { code: 'EIO' });

    TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(bridge, firstRecord, err);
    TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(bridge, secondRecord, err);
    expect(pauseTrading).not.toHaveBeenCalled();

    TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(bridge, thirdRecord, err);
    await Promise.resolve();
    expect(pauseTrading).toHaveBeenCalledWith(
      expect.stringContaining('journal persistence failed 3 consecutive'),
      expect.objectContaining({
        source: 'journal_persistence_down',
        recoverable: true,
      })
    );

    TradeJournalBridge.prototype._recordJournalPersistenceSuccess.call(bridge, {
      phase: 'entry',
      source: 'bot.executeTrade',
      orderId: 'ORDER-JOURNAL-RECOVERED',
      action: 'BUY',
      symbol: 'BTC-USD',
    });
    await Promise.resolve();
    expect(bridge._journalPersistenceFailureStreak).toBe(0);
    expect(resumeTradingIfPausedBy).toHaveBeenCalledWith('journal_persistence_down', expect.objectContaining({
      resumeSource: 'journal_persistence_recovered',
    }));
  });

  test('records durable visibility failure when close record is incomplete', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const visibilityFailurePath = tempVisibilityFailurePath();
    const bridge = {
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
      },
      visibilityFailurePath,
      _send: jest.fn(),
    };

    try {
      expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, {
        type: 'SELL',
        orderId: 'ORDER-VIS-2',
        symbol: 'TSLA',
        direction: 'long',
        entryPrice: 100,
        pnl: 50,
        reason: 'take_profit',
        holdTime: 60000,
      }, 'test.logTrade')).toBe(false);

      const [record] = readJsonl(visibilityFailurePath);
      expect(record).toMatchObject({
        type: 'trade_visibility_failure',
        eventType: 'closed_trade_record_incomplete',
        phase: 'exit',
        source: 'test.logTrade',
        orderId: 'ORDER-VIS-2',
        action: 'SELL',
        missing: ['exitPrice', 'size'],
        visibilityLedgerPersisted: true,
      });
      expect(bridge._send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'trade_visibility_error',
        data: expect.objectContaining({ eventType: 'closed_trade_record_incomplete', orderId: 'ORDER-VIS-2' }),
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('records durable visibility failure when close record omits explicit size', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const visibilityFailurePath = tempVisibilityFailurePath();
    const bridge = {
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
      },
      visibilityFailurePath,
      _send: jest.fn(),
    };

    try {
      expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, {
        type: 'SELL',
        orderId: 'ORDER-VIS-MISSING-SIZE',
        symbol: 'TSLA',
        direction: 'long',
        entryPrice: 100,
        exitPrice: 105,
        pnl: 5,
        reason: 'tier_exit',
        holdTime: 60000,
      }, 'test.logTrade')).toBe(false);

      const [record] = readJsonl(visibilityFailurePath);
      expect(record).toMatchObject({
        type: 'trade_visibility_failure',
        eventType: 'closed_trade_record_incomplete',
        phase: 'exit',
        source: 'test.logTrade',
        orderId: 'ORDER-VIS-MISSING-SIZE',
        action: 'SELL',
        missing: ['size'],
        visibilityLedgerPersisted: true,
      });
      expect(bridge._send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'trade_visibility_error',
        data: expect.objectContaining({
          eventType: 'closed_trade_record_incomplete',
          orderId: 'ORDER-VIS-MISSING-SIZE',
        }),
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('maps plain sell direction to COVER in close visibility failures', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const visibilityFailurePath = tempVisibilityFailurePath();
    const bridge = {
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
      },
      visibilityFailurePath,
      _send: jest.fn(),
    };

    try {
      expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, {
        type: 'EXIT',
        orderId: 'ORDER-VIS-SELL-DIRECTION',
        symbol: 'BTC-USD',
        direction: 'sell',
        entryPrice: 100,
        exitPrice: 95,
        pnl: 5,
        reason: 'cover_exit',
        holdTime: 60000,
      }, 'test.logTrade')).toBe(false);

      const [record] = readJsonl(visibilityFailurePath);
      expect(record).toMatchObject({
        type: 'trade_visibility_failure',
        eventType: 'closed_trade_record_incomplete',
        orderId: 'ORDER-VIS-SELL-DIRECTION',
        action: 'COVER',
        missing: ['size'],
      });
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('records durable visibility failures when exit journal and replay refuse the close', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const visibilityFailurePath = tempVisibilityFailurePath();
    const bridge = {
      bot: {
        stateManager: {
          get: jest.fn((key) => key === 'balance' ? 10050 : null),
        },
        priceHistory: [{ open: 100, high: 105, low: 99, close: 105, volume: 1, timestamp: 2 }],
      },
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
        recordExit: jest.fn(() => null),
      },
      replay: {
        captureExit: jest.fn(() => null),
      },
      visibilityFailurePath,
      _send: jest.fn(),
      _pushTradeClosedNotification: jest.fn(),
      _closedTradeLogKeySet: new Set(),
      _closedTradeLogKeys: [],
    };

    expect(TradeJournalBridge.prototype._recordTradeLogClose.call(bridge, {
      type: 'SELL',
      orderId: 'ORDER-VIS-3',
      symbol: 'TSLA',
      direction: 'long',
      entryPrice: 100,
      exitPrice: 105,
      pnl: 50,
      pnlPercent: 5,
      reason: 'take_profit',
      holdTime: 60000,
      size: 1000,
    }, 'test.logTrade')).toBe(true);

    const records = readJsonl(visibilityFailurePath);
    expect(records.map(record => record.eventType)).toEqual([
      'trade_exit_journal_refused',
      'trade_exit_replay_missing',
    ]);
    expect(records.every(record => record.orderId === 'ORDER-VIS-3')).toBe(true);
    expect(records.every(record => record.action === 'SELL')).toBe(true);
    expect(bridge._send).toHaveBeenCalledTimes(2);
    expect(bridge._pushTradeClosedNotification).toHaveBeenCalledWith(
      'ORDER-VIS-3',
      expect.objectContaining({ orderId: 'ORDER-VIS-3', reason: 'take_profit' }),
      null,
      { journalRecorded: false }
    );
  });

  test('visibility failure writes runtime-audit fallback when scoped failure ledger cannot persist', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const stderrSpy = jest.spyOn(fs, 'writeSync').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const visibilityFailurePath = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-visibility-directory-'));
    const visibilityFailureFallbackPath = tempVisibilityFailurePath();
    const bridge = {
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
      },
      visibilityFailurePath,
      visibilityFailureFallbackPath,
      _send: jest.fn(),
      _journalPersistenceFailureStreak: 0,
    };

    try {
      const record = TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_journal_refused', {
        phase: 'entry',
        source: 'test',
        orderId: 'ORDER-VIS-4',
        message: 'forced append failure',
      });

      expect(record).toMatchObject({
        eventType: 'trade_entry_journal_refused',
        orderId: 'ORDER-VIS-4',
        visibilityLedgerPersisted: false,
        visibilityFallbackPersisted: true,
        visibilityAllPersistenceFailed: false,
        journalPersistenceFailureRecorded: true,
        journalPersistenceFailureStreak: 1,
      });
      expect(record.visibilityLedgerError).toEqual(expect.any(String));
      expect(bridge._journalPersistenceFailureStreak).toBe(1);
      TradeJournalBridge.prototype._recordJournalPersistenceFailure.call(
        bridge,
        record,
        Object.assign(new Error('same journal failure already counted'), { code: 'EIO' })
      );
      expect(bridge._journalPersistenceFailureStreak).toBe(1);
      expect(stderrSpy).not.toHaveBeenCalled();
      const [fallbackRecord] = readJsonl(visibilityFailureFallbackPath);
      expect(fallbackRecord).toMatchObject({
        eventType: 'trade_entry_journal_refused',
        orderId: 'ORDER-VIS-4',
        visibilityLedgerPersisted: false,
        visibilityFallbackPersisted: true,
        journalPersistenceFailureRecorded: true,
        journalPersistenceFailureStreak: 1,
      });
      expect(bridge._send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'trade_visibility_error',
        data: expect.objectContaining({
          orderId: 'ORDER-VIS-4',
          visibilityLedgerPersisted: false,
          visibilityFallbackPersisted: true,
          visibilityAllPersistenceFailed: false,
        }),
      }));
    } finally {
      stderrSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test('visibility failure stamps total persistence failure, alerts only, and still emits dashboard evidence', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const stderrSpy = jest.spyOn(fs, 'writeSync').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const visibilityFailurePath = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-visibility-directory-'));
    const visibilityFailureFallbackPath = fs.mkdtempSync(path.join(os.tmpdir(), 'trade-visibility-fallback-directory-'));
    const state = { isTrading: true };
    const bridge = {
      bot: {
        stateManager: {
          pauseTrading: jest.fn((reason) => {
            state.isTrading = false;
            state.pauseReason = reason;
            return Promise.resolve({ success: true });
          }),
          get: jest.fn((key) => state[key]),
        },
      },
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
      },
      visibilityFailurePath,
      visibilityFailureFallbackPath,
      _send: jest.fn(),
    };

    try {
      const record = TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_journal_refused', {
        phase: 'entry',
        source: 'test',
        orderId: 'ORDER-VIS-5',
        message: 'forced total append failure',
      });

      expect(record).toMatchObject({
        eventType: 'trade_entry_journal_refused',
        orderId: 'ORDER-VIS-5',
        visibilityLedgerPersisted: false,
        visibilityFallbackPersisted: false,
        visibilityAllPersistenceFailed: true,
        visibilityTradingPauseAttempted: false,
        visibilityTradingPauseConfirmed: false,
      });
      expect(record.visibilityTradingPauseReason).toContain('ORDER-VIS-5');
      expect(record.visibilityLedgerError).toEqual(expect.any(String));
      expect(record.visibilityFallbackError).toEqual(expect.any(String));
      expect(bridge.bot.stateManager.pauseTrading).not.toHaveBeenCalled();
      expect(state.isTrading).toBe(true);
      expect(stderrSpy).toHaveBeenCalledWith(
        2,
        expect.stringContaining('[TRADE_VISIBILITY_FAILURE_UNPERSISTED]')
      );
      expect(bridge._send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'trade_visibility_error',
        data: expect.objectContaining({
          orderId: 'ORDER-VIS-5',
          visibilityAllPersistenceFailed: true,
          visibilityTradingPauseConfirmed: false,
        }),
      }));
    } finally {
      stderrSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test('visibility failure queues dashboard error while socket is disconnected and flushes when open', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const visibilityFailurePath = tempVisibilityFailurePath();
    const dashboardWs = {
      readyState: 0,
      send: jest.fn(),
    };
    const bridge = {
      bot: {
        dashboardWs,
        dashboardWsConnected: false,
      },
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
      },
      visibilityFailurePath,
      _pendingVisibilityErrors: [],
      _maxPendingVisibilityErrors: 50,
    };

    const record = TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_journal_refused', {
      phase: 'entry',
      source: 'test',
      orderId: 'ORDER-VIS-6',
      action: 'BUY',
      message: 'forced disconnected dashboard',
    });

    expect(record).toMatchObject({
      orderId: 'ORDER-VIS-6',
      visibilityLedgerPersisted: true,
      visibilityDashboardDelivered: false,
      visibilityDashboardQueued: true,
    });
    expect(dashboardWs.send).not.toHaveBeenCalled();
    expect(bridge._pendingVisibilityErrors).toHaveLength(1);

    dashboardWs.readyState = 1;
    expect(TradeJournalBridge.prototype._flushPendingVisibilityErrors.call(bridge)).toBe(1);
    expect(bridge._pendingVisibilityErrors).toHaveLength(0);
    expect(dashboardWs.send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(dashboardWs.send.mock.calls[0][0])).toMatchObject({
      type: 'trade_visibility_error',
      data: {
        orderId: 'ORDER-VIS-6',
        visibilityDashboardDelivered: true,
        visibilityDashboardQueued: false,
      },
    });
  });

  test('visibility failure queue overflow reports omitted dashboard records instead of silently shifting them away', () => {
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const visibilityFailurePath = tempVisibilityFailurePath();
    const dashboardWs = {
      readyState: 0,
      send: jest.fn(),
    };
    const bridge = {
      bot: { dashboardWs },
      journal: {
        scope: { executionMode: 'paper', brokerId: 'kraken', accountId: 'default', assetClass: 'crypto', symbol: 'BTC-USD', timeframe: '1m' },
      },
      visibilityFailurePath,
      _pendingVisibilityErrors: [],
      _maxPendingVisibilityErrors: 3,
    };

    for (let i = 1; i <= 5; i += 1) {
      TradeJournalBridge.prototype._recordVisibilityFailure.call(bridge, 'trade_entry_journal_refused', {
        phase: 'entry',
        source: 'test',
        orderId: `ORDER-OVER-${i}`,
        action: 'BUY',
        message: `forced disconnected dashboard ${i}`,
      });
    }

    const ledgerRecords = readJsonl(visibilityFailurePath);
    const entryFailureRecords = ledgerRecords.filter(record => record.eventType === 'trade_entry_journal_refused');
    const overflowRecords = ledgerRecords.filter(record => record.eventType === 'trade_visibility_dashboard_queue_overflow');
    expect(entryFailureRecords).toHaveLength(5);
    expect(overflowRecords.length).toBeGreaterThanOrEqual(1);
    expect(overflowRecords[overflowRecords.length - 1]).toMatchObject({
      visibilityLedgerPersisted: true,
      context: {
        droppedCount: 3,
        droppedOrderIds: ['ORDER-OVER-1', 'ORDER-OVER-2', 'ORDER-OVER-3'],
      },
    });
    expect(bridge._pendingVisibilityErrors).toHaveLength(3);
    expect(bridge._pendingVisibilityErrors.map(payload => payload.data.orderId)).toEqual([
      'ORDER-OVER-4',
      'ORDER-OVER-5',
      null,
    ]);
    expect(bridge._pendingVisibilityErrors[2].data).toMatchObject({
      eventType: 'trade_visibility_dashboard_queue_overflow',
      visibilityDashboardDelivered: false,
      visibilityDashboardQueued: true,
      context: {
        droppedCount: 3,
        droppedOrderIds: ['ORDER-OVER-1', 'ORDER-OVER-2', 'ORDER-OVER-3'],
      },
    });

    dashboardWs.readyState = 1;
    expect(TradeJournalBridge.prototype._flushPendingVisibilityErrors.call(bridge)).toBe(3);
    expect(bridge._pendingVisibilityErrors).toHaveLength(0);
    expect(dashboardWs.send).toHaveBeenCalledTimes(3);
    expect(JSON.parse(dashboardWs.send.mock.calls[2][0])).toMatchObject({
      type: 'trade_visibility_error',
      data: {
        eventType: 'trade_visibility_dashboard_queue_overflow',
        visibilityDashboardDelivered: true,
        visibilityDashboardQueued: false,
      },
    });
  });

  test('broadcast cycle retries queued visibility errors even without other journal traffic', () => {
    jest.useFakeTimers();
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const dashboardWs = {
      readyState: 1,
      send: jest.fn(),
    };
    const payload = {
      type: 'trade_visibility_error',
      data: {
        orderId: 'ORDER-VIS-7',
        visibilityDashboardDelivered: false,
        visibilityDashboardQueued: true,
      },
    };
    const bridge = {
      bot: { dashboardWs },
      journal: { trades: [] },
      _pendingVisibilityErrors: [payload],
    };

    try {
      TradeJournalBridge.prototype._wireBroadcastCycle.call(bridge);
      jest.advanceTimersByTime(30000);

      expect(dashboardWs.send).toHaveBeenCalledTimes(1);
      expect(bridge._pendingVisibilityErrors).toHaveLength(0);
      expect(JSON.parse(dashboardWs.send.mock.calls[0][0])).toMatchObject({
        type: 'trade_visibility_error',
        data: {
          orderId: 'ORDER-VIS-7',
          visibilityDashboardDelivered: true,
          visibilityDashboardQueued: false,
        },
      });
    } finally {
      clearInterval(bridge._broadcastTimer);
      jest.useRealTimers();
    }
  });

  test('direct dashboard hook flushes queued visibility errors when socket opens', () => {
    jest.useFakeTimers();
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const dashboardWs = {
      readyState: 1,
      on: jest.fn(),
    };
    const bridge = {
      bot: { dashboardWs },
      _flushPendingVisibilityErrors: jest.fn(() => 1),
    };

    try {
      TradeJournalBridge.prototype._tryDirectWsHook.call(bridge);

      expect(() => jest.advanceTimersByTime(2000)).not.toThrow();
      expect(dashboardWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(bridge._flushPendingVisibilityErrors).toHaveBeenCalledTimes(1);
    } finally {
      clearInterval(bridge._dashboardHookTimer);
      jest.useRealTimers();
    }
  });

  test('direct dashboard hook keeps watching past thirty seconds and flushes late-open sockets', () => {
    jest.useFakeTimers();
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const dashboardWs = {
      readyState: 0,
      on: jest.fn(),
    };
    const bridge = {
      bot: { dashboardWs },
      _flushPendingVisibilityErrors: jest.fn(() => 1),
    };

    try {
      TradeJournalBridge.prototype._tryDirectWsHook.call(bridge);
      jest.advanceTimersByTime(32000);
      expect(dashboardWs.on).not.toHaveBeenCalled();

      dashboardWs.readyState = 1;
      expect(() => jest.advanceTimersByTime(2000)).not.toThrow();
      expect(dashboardWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(bridge._flushPendingVisibilityErrors).toHaveBeenCalledTimes(1);
    } finally {
      clearInterval(bridge._dashboardHookTimer);
      jest.useRealTimers();
    }
  });

  test('direct dashboard hook flushes visibility errors without crashing when socket cannot register message handlers', () => {
    jest.useFakeTimers();
    const { TradeJournalBridge } = require('../core/TradeJournalBridge');
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const dashboardWs = {
      readyState: 1,
      send: jest.fn(),
    };
    const bridge = {
      bot: { dashboardWs },
      _flushPendingVisibilityErrors: jest.fn(() => 1),
    };

    try {
      TradeJournalBridge.prototype._tryDirectWsHook.call(bridge);

      expect(() => jest.advanceTimersByTime(2000)).not.toThrow();
      expect(bridge._flushPendingVisibilityErrors).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cannot register journal message handler'));
    } finally {
      clearInterval(bridge._dashboardHookTimer);
      warnSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
