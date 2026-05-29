'use strict';

const path = require('path');
const os = require('os');

describe('Pattern memory scope isolation', () => {
  let consoleSpies;
  let originalEnv;

  const features = [0.51, 0.02, 1, 0.03, 0.01, 0.5, 0.01, 0.02, 0];

  const scope = (overrides = {}) => ({
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'backtest',
    timeframe: '15m',
    scopeKey: 'backtest:alpaca:acct-main:stocks:TSLA:15m',
    ...overrides,
  });

  const bankTrade = (overrides = {}) => ({
    ...scope(),
    id: 'trade-1',
    profitLoss: 25,
    profitLossPercent: 2.5,
    holdDuration: 900000,
    indicators: {
      rsi: 55,
      macd: 0.2,
      macdHistogram: 0.03,
      primaryPattern: 'breakout',
    },
    trend: 'uptrend',
    timestamp: 1779802200000,
    volatility: 0.02,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    process.env.BACKTEST_MODE = 'true';
    process.env.CANDLE_DATA_FILE = 'tuning/tsla-15m-18mo.json';
    process.env.BACKTEST_NO_PATTERN_SAVE = 'true';
    consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
    ];
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    process.env = originalEnv;
  });

  test('UnifiedPatternMemory reads only from matching immutable scope', () => {
    const { UnifiedPatternMemory, computeSignature } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
    });

    expect(memory.recordOutcome(features, {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(true);

    const sameScope = memory.getConfidence(features, scope());
    expect(sameScope).toBeTruthy();
    expect(sameScope.source).toBe('learned_success');
    expect(sameScope.stats.scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');

    expect(memory.getConfidence(features)).toBeNull();
    expect(memory.getConfidence(features, scope({
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      assetClass: 'crypto',
      timeframe: '1m',
      scopeKey: 'backtest:kraken:acct-main:crypto:BTC-USD:1m',
    }))).toBeNull();

    const exportedPatterns = memory.patterns;
    const scopedSignature = Object.keys(exportedPatterns)[0];
    exportedPatterns[scopedSignature].wins = 999;
    exportedPatterns[computeSignature(features)] = {
      signature: computeSignature(features),
      features: [...features],
      status: 'promoted',
      timesSeen: 1,
      wins: 10,
      losses: 0,
      totalPnL: 10,
      winRate: 1,
      avgPnL: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      lastOutcome: Date.now(),
      outcomes: [{ timestamp: Date.now(), pnl: 1, isWin: true }],
    };

    const protectedScope = memory.getConfidence(features, scope());
    expect(protectedScope.stats.scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');
    expect(protectedScope.stats.wins).not.toBe(999);
    expect(Object.keys(memory.patterns)).toHaveLength(1);
  });

  test('UnifiedPatternMemory missing scope rejects before mutation', () => {
    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({ persistToDisk: false });

    expect(memory.recordOutcome(features, {
      ...scope({ brokerId: null }),
      pnl: 12,
    })).toBe(false);
    expect(Object.keys(memory.patterns)).toHaveLength(0);
    expect(memory.recordObservation(features, scope({ timeframe: null }))).toBeNull();
    expect(Object.keys(memory.patterns)).toHaveLength(0);
  });

  test('PatternMemoryBank hashes and records by immutable scope', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const dbPath = path.join(os.tmpdir(), `pattern-bank-scope-${Date.now()}.json`);
    const bank = new PatternMemoryBank({
      ...scope(),
      dbPath,
      minTradesSample: 1,
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: { backtestPersist: false },
        },
      },
    });

    const tslaPattern = bank.extractPattern(bankTrade());
    const btcPattern = bank.extractPattern(bankTrade(scope({
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      assetClass: 'crypto',
      timeframe: '1m',
      scopeKey: 'backtest:kraken:acct-main:crypto:BTC-USD:1m',
    })));

    expect(tslaPattern.hash).not.toBe(btcPattern.hash);
    expect(tslaPattern.scope.scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');

    bank.recordTradeOutcome(bankTrade());
    const records = Object.values(bank.exportMemory().patterns);
    expect(records).toHaveLength(1);
    expect(records[0].scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');
    expect(records[0].symbol).toBe('TSLA');

    bank.recordTradeOutcome(bankTrade({ brokerId: null }));
    expect(Object.values(bank.exportMemory().patterns)).toHaveLength(1);
  });

  test('PatternMemoryBank refuses unscoped learned-state paths', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');

    expect(() => new PatternMemoryBank({
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: { backtestPersist: false },
        },
      },
    })).toThrow(/PatternMemoryBank\.constructor missing immutable pattern scope field\(s\)/);
  });
});
