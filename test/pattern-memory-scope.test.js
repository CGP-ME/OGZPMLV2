'use strict';

const fs = require('fs');
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
    exitReason: 'take_profit',
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
    process.env.PROFILE = 'backtest-all';
    process.env.BACKTEST_MODE = 'true';
    process.env.CANDLE_DATA_FILE = 'tuning/tsla-15m-18mo.json';
    process.env.BACKTEST_NO_PATTERN_SAVE = 'true';
    process.env.DATA_DIR = path.join(os.tmpdir(), `pattern-memory-scope-${Date.now()}`);
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

    expect(memory.storagePath).toBe(path.join(process.env.DATA_DIR, 'unified-patterns.backtest.TSLA.json'));

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

  test('UnifiedPatternMemory rejects non-finite feature vectors before outcome storage', () => {
    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
    });

    expect(memory.recordOutcome([0.5, Number.NaN, 0.3], {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(false);
    expect(memory.recordOutcome([0.5, Infinity, 0.3], {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(false);
    expect(memory.recordOutcome([0.5, null, 0.3], {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(false);
    expect(memory.recordOutcome([0.5, undefined, 0.3], {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(false);
    expect(memory.recordObservation([0.5, Number.NaN, 0.3], {
      ...scope(),
      timestamp: 1779802200000,
      strategy: 'GateStrategy',
    })).toBeNull();
    expect(memory.patterns).toEqual({});
  });

  test('UnifiedPatternMemory treats explicit config executionMode as the mode owner', () => {
    delete process.env.BACKTEST_MODE;
    delete process.env.PAPER_TRADING;
    process.env.EXECUTION_MODE = 'paper';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      executionMode: 'backtest',
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
    });

    expect(memory.storageMode).toBe('backtest');
    expect(memory.storagePath).toBe(path.join(process.env.DATA_DIR, 'unified-patterns.backtest.TSLA.json'));
  });

  test('pattern stores honor explicit test mode scope without TEST_MODE env', () => {
    delete process.env.BACKTEST_MODE;
    delete process.env.PAPER_TRADING;
    delete process.env.TRADING_MODE;
    delete process.env.ENABLE_LIVE_TRADING;
    delete process.env.EXECUTION_MODE;
    delete process.env.TEST_MODE;
    process.env.ASSET_CLASS = 'stocks';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      mode: 'test',
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
    });

    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const bank = new PatternMemoryBank({
      ...scope({ executionMode: 'test', scopeKey: 'test:alpaca:acct-main:stocks:TSLA:15m' }),
      minTradesSample: 1,
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: { testPersist: false },
        },
      },
    });

    expect(memory.storageMode).toBe('test');
    expect(memory.storagePath).toBe(path.join(process.env.DATA_DIR, 'unified-patterns.test.stocks.json'));
    expect(bank.dbPath).toContain('.test.');
  });

  test('UnifiedPatternMemory compatibility recordPattern requires canonical live close outcome fields', () => {
    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
    });

    expect(memory.recordPattern(features, {
      ...scope(),
      pnl: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
      timestamp: 1779802200000,
    })).toBe(true);

    const learned = memory.getConfidence(features, scope());
    expect(learned).toBeTruthy();
    expect(learned.source).toBe('learned_success');
    expect(learned.stats.totalTrades).toBe(1);
    expect(learned.stats.scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');
  });

  test('UnifiedPatternMemory compatibility recordPattern rejects legacy duration alias before mutation', () => {
    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
    });

    expect(memory.recordPattern(features, {
      ...scope(),
      pnl: 2.4,
      holdDurationMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
      timestamp: 1779802200000,
    })).toBe(false);

    expect(Object.keys(memory.patterns)).toHaveLength(0);
    expect(memory.getConfidence(features, scope())).toBeNull();
  });

  test('UnifiedPatternMemory rejects unknown backtest candle files instead of guessing an asset bucket', () => {
    process.env.CANDLE_DATA_FILE = 'tuning/full-45k.json';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    expect(() => new UnifiedPatternMemory({
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
    })).toThrow(/Cannot derive asset class/);
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

  test('UnifiedPatternMemory rejects incomplete outcome metadata before mutation', () => {
    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({ persistToDisk: false });

    expect(memory.recordOutcome(features, {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(false);
    expect(Object.keys(memory.patterns)).toHaveLength(0);

    expect(memory.recordOutcome(features, {
      ...scope(),
      pnl: Number.NaN,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(false);
    expect(Object.keys(memory.patterns)).toHaveLength(0);
  });

  test('UnifiedPatternMemory ignores PATTERN env vars and uses ConfigLoader-owned tunables', () => {
    process.env.PATTERN_MIN_SAMPLES = '1';
    process.env.PATTERN_SUCCESS_THRESHOLD = '0.01';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({ persistToDisk: false });

    expect(memory.config.minSamples).toBe(10);
    expect(memory.config.successThreshold).toBe(0.65);
    expect(memory.recordOutcome(features, {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(true);
    expect(memory.getConfidence(features, scope())).toEqual(expect.objectContaining({
      source: 'insufficient_data',
      confidence: 0.5,
    }));
  });

  test('UnifiedPatternMemory refuses invalid local overrides instead of falling back to config', () => {
    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');

    expect(() => new UnifiedPatternMemory({
      persistToDisk: false,
      minSamples: 0,
    })).toThrow(/patternMemory\.minSamples must be >= 1/);
    expect(() => new UnifiedPatternMemory({
      persistToDisk: 'false',
    })).toThrow(/patternMemory\.persistToDisk must be boolean/);
    expect(() => new UnifiedPatternMemory({
      persistToDisk: false,
      featureWeights: [0.2, Number.NaN],
    })).toThrow(/patternMemory\.featureWeights\[1\] must be finite/);
  });

  test('UnifiedPatternMemory switches paper asset banks without carrying patterns across assets', async () => {
    delete process.env.BACKTEST_MODE;
    delete process.env.BACKTEST_NO_PATTERN_SAVE;
    process.env.PROFILE = 'paper';
    process.env.PAPER_TRADING = 'true';
    process.env.ASSET_CLASS = 'crypto';
    process.env.BROKER = 'kraken';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      dataDir: process.env.DATA_DIR,
      minSamples: 1,
      successThreshold: 0.6,
      saveIntervalMs: 60000,
    });
    const cryptoScope = {
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '1m',
      scopeKey: 'paper:kraken:acct-main:crypto:BTC-USD:1m',
    };
    const stockScope = {
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:1m',
    };

    try {
      expect(memory.storagePath).toBe(path.join(process.env.DATA_DIR, 'unified-patterns.paper.crypto.json'));
      expect(memory.recordOutcome(features, {
        ...cryptoScope,
        pnl: 8,
        pnlPercent: 1.1,
        holdTimeMs: 600000,
        exitReason: 'take_profit',
        strategy: 'CryptoStrategy',
      })).toBe(true);
      expect(memory.getConfidence(features, cryptoScope)).toEqual(expect.objectContaining({
        source: 'learned_success',
      }));

      const switchResult = memory.switchSessionScope(stockScope, { reason: 'test_switch_to_stocks' });
      expect(switchResult).toEqual(expect.objectContaining({
        switched: true,
        previousPath: path.join(process.env.DATA_DIR, 'unified-patterns.paper.crypto.json'),
        storagePath: path.join(process.env.DATA_DIR, 'unified-patterns.paper.stocks.json'),
        assetBucket: 'stocks',
        loaded: false,
        targetExists: false,
      }));
      expect(fs.existsSync(path.join(process.env.DATA_DIR, 'unified-patterns.paper.crypto.json'))).toBe(true);
      expect(memory.getConfidence(features, cryptoScope)).toBeNull();
      expect(memory.getConfidence(features, stockScope)).toBeNull();

      expect(memory.recordOutcome(features, {
        ...stockScope,
        pnl: 11,
        pnlPercent: 1.4,
        holdTimeMs: 600000,
        exitReason: 'take_profit',
        strategy: 'StockStrategy',
      })).toBe(true);
      expect(memory.getConfidence(features, stockScope)).toEqual(expect.objectContaining({
        source: 'learned_success',
      }));

      memory.switchSessionScope(cryptoScope, { reason: 'test_switch_back_to_crypto' });
      expect(memory.storagePath).toBe(path.join(process.env.DATA_DIR, 'unified-patterns.paper.crypto.json'));
      expect(memory.getConfidence(features, cryptoScope)).toEqual(expect.objectContaining({
        source: 'learned_success',
      }));
      expect(memory.getConfidence(features, stockScope)).toBeNull();
    } finally {
      await memory.cleanup();
    }
  });

  test('UnifiedPatternMemory restores prior bank when target load fails', async () => {
    delete process.env.BACKTEST_MODE;
    delete process.env.BACKTEST_NO_PATTERN_SAVE;
    process.env.PAPER_TRADING = 'true';
    process.env.ASSET_CLASS = 'crypto';
    process.env.BROKER = 'kraken';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      dataDir: process.env.DATA_DIR,
      minSamples: 1,
      successThreshold: 0.6,
      saveIntervalMs: 60000,
    });
    const cryptoScope = {
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'crypto',
      executionMode: 'paper',
      timeframe: '1m',
      scopeKey: 'paper:kraken:acct-main:crypto:BTC-USD:1m',
    };
    const stockScope = {
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '1m',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:1m',
    };

    try {
      expect(memory.recordOutcome(features, {
        ...cryptoScope,
        pnl: 8,
        pnlPercent: 1.1,
        holdTimeMs: 600000,
        exitReason: 'take_profit',
        strategy: 'CryptoStrategy',
      })).toBe(true);
      const priorPath = memory.storagePath;
      fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.DATA_DIR, 'unified-patterns.paper.stocks.json'), '{not-json', 'utf8');

      expect(() => memory.switchSessionScope(stockScope, { reason: 'test_corrupt_target' })).toThrow();
      expect(memory.storagePath).toBe(priorPath);
      expect(memory.getConfidence(features, cryptoScope)).toEqual(expect.objectContaining({
        source: 'learned_success',
      }));
      expect(memory.getConfidence(features, stockScope)).toBeNull();
    } finally {
      await memory.cleanup();
    }
  });

  test('UnifiedPatternMemory recovers a corrupt primary bank from the last-good backup', async () => {
    delete process.env.BACKTEST_NO_PATTERN_SAVE;

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      minSamples: 1,
      successThreshold: 0.6,
      saveIntervalMs: 60000,
    });

    expect(memory.recordOutcome(features, {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(true);
    memory.saveOrThrow();
    await memory.cleanup();

    const backupPath = memory.storagePath.replace(/\.json$/, '.backup.json');
    fs.copyFileSync(memory.storagePath, backupPath);
    fs.writeFileSync(memory.storagePath, '{not-json', 'utf8');

    const recovered = new UnifiedPatternMemory({
      minSamples: 1,
      successThreshold: 0.6,
      saveIntervalMs: 60000,
    });
    try {
      expect(recovered.getConfidence(features, scope())).toEqual(expect.objectContaining({
        source: 'learned_success',
      }));
      expect(JSON.parse(fs.readFileSync(recovered.storagePath, 'utf8')).version).toBe(2);
    } finally {
      await recovered.cleanup();
    }
  });

  test('UnifiedPatternMemory restores a missing primary bank from backup', async () => {
    delete process.env.BACKTEST_NO_PATTERN_SAVE;

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      minSamples: 1,
      successThreshold: 0.6,
      saveIntervalMs: 60000,
    });

    expect(memory.recordOutcome(features, {
      ...scope(),
      pnl: 12,
      pnlPercent: 2.4,
      holdTimeMs: 900000,
      exitReason: 'take_profit',
      strategy: 'GateStrategy',
    })).toBe(true);
    memory.saveOrThrow();
    await memory.cleanup();

    const backupPath = memory.storagePath.replace(/\.json$/, '.backup.json');
    fs.copyFileSync(memory.storagePath, backupPath);
    fs.unlinkSync(memory.storagePath);

    const recovered = new UnifiedPatternMemory({
      minSamples: 1,
      successThreshold: 0.6,
      saveIntervalMs: 60000,
    });
    try {
      expect(recovered.getConfidence(features, scope())).toEqual(expect.objectContaining({
        source: 'learned_success',
      }));
      expect(JSON.parse(fs.readFileSync(recovered.storagePath, 'utf8')).version).toBe(2);
    } finally {
      await recovered.cleanup();
    }
  });

  test('UnifiedPatternMemory preserves last-good backup when primary is corrupt before save', async () => {
    delete process.env.BACKTEST_NO_PATTERN_SAVE;

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({
      minSamples: 1,
      successThreshold: 0.6,
      saveIntervalMs: 60000,
    });

    try {
      expect(memory.recordOutcome(features, {
        ...scope(),
        pnl: 12,
        pnlPercent: 2.4,
        holdTimeMs: 900000,
        exitReason: 'take_profit',
        strategy: 'GateStrategy',
      })).toBe(true);
      memory.saveOrThrow();

      const backupPath = memory.storagePath.replace(/\.json$/, '.backup.json');
      fs.copyFileSync(memory.storagePath, backupPath);
      const backupBefore = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(memory.storagePath, '{not-json', 'utf8');

      expect(memory.recordOutcome(features, {
        ...scope(),
        pnl: 9,
        pnlPercent: 1.8,
        holdTimeMs: 600000,
        exitReason: 'take_profit',
        strategy: 'GateStrategy',
      })).toBe(true);
      memory.saveOrThrow();

      expect(fs.readFileSync(backupPath, 'utf8')).toBe(backupBefore);
      expect(JSON.parse(fs.readFileSync(memory.storagePath, 'utf8')).version).toBe(2);
    } finally {
      await memory.cleanup();
    }
  });

  test('UnifiedPatternMemory fails loud when primary and backup banks are both corrupt', async () => {
    delete process.env.BACKTEST_NO_PATTERN_SAVE;

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({ saveIntervalMs: 60000 });
    const storagePath = memory.storagePath;
    const backupPath = storagePath.replace(/\.json$/, '.backup.json');
    await memory.cleanup();

    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, '{not-json', 'utf8');
    fs.writeFileSync(backupPath, '{also-not-json', 'utf8');

    expect(() => new UnifiedPatternMemory({ saveIntervalMs: 60000 }))
      .toThrow(/primary and backup pattern banks both failed/);
  });

  test('UnifiedPatternMemory logs explicit empty initialization when no primary or backup exists', async () => {
    delete process.env.BACKTEST_NO_PATTERN_SAVE;

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({ saveIntervalMs: 60000 });
    try {
      expect(Object.keys(memory.patterns)).toHaveLength(0);
      expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('No primary or backup pattern bank found; initializing empty bank'));
    } finally {
      await memory.cleanup();
    }
  });

  test('PatternMemoryBank hashes and records by immutable scope', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-scope-${Date.now()}.json`);
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

    expect(bank.recordTradeOutcome(bankTrade())).toBe(true);
    const records = Object.values(bank.exportMemory().patterns);
    expect(records).toHaveLength(1);
    expect(records[0].scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');
    expect(records[0].symbol).toBe('TSLA');

    expect(bank.recordTradeOutcome(bankTrade({ brokerId: null }))).toBe(false);
    expect(Object.values(bank.exportMemory().patterns)).toHaveLength(1);

    expect(bank.recordTradeOutcome(bankTrade({ indicators: null }))).toBe(false);
    expect(Object.values(bank.exportMemory().patterns)).toHaveLength(1);
  });

  test('PatternMemoryBank treats explicit scope executionMode as the mode owner', () => {
    delete process.env.BACKTEST_MODE;
    delete process.env.PAPER_TRADING;
    process.env.EXECUTION_MODE = 'paper';

    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-execution-mode-${Date.now()}.json`);
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

    expect(bank.dbPath).toContain('.backtest.');
    expect(bank.persistenceEnabled).toBe(false);
  });

  test('UnifiedPatternMemory follows ConfigLoader PROFILE when no explicit config mode exists', () => {
    delete process.env.BACKTEST_MODE;
    delete process.env.TEST_MODE;
    delete process.env.EXECUTION_MODE;
    delete process.env.PAPER_TRADING;
    process.env.ASSET_CLASS = 'stocks';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const ConfigLoader = require('../foundation/ConfigLoader');

    process.env.PROFILE = 'paper';
    ConfigLoader.load({ force: true, silent: true });
    let memory = new UnifiedPatternMemory({ persistToDisk: false });
    expect(memory.storageMode).toBe('paper');

    process.env.PROFILE = 'backtest-all';
    ConfigLoader.load({ force: true, silent: true });
    memory = new UnifiedPatternMemory({ persistToDisk: false });
    expect(memory.storageMode).toBe('backtest');
  });

  test('UnifiedPatternMemory defaults to ConfigLoader paper launch profile when PROFILE is absent', () => {
    delete process.env.BACKTEST_MODE;
    delete process.env.TEST_MODE;
    delete process.env.EXECUTION_MODE;
    delete process.env.PAPER_TRADING;
    delete process.env.TRADING_MODE;
    delete process.env.ENABLE_LIVE_TRADING;
    delete process.env.PROFILE;
    process.env.ASSET_CLASS = 'stocks';

    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');
    const memory = new UnifiedPatternMemory({ persistToDisk: false });
    expect(memory.storageMode).toBe('paper');
  });

  test('PatternMemoryBank uses ConfigLoader-owned bank tunables and rejects invalid overrides', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const ConfigLoader = require('../foundation/ConfigLoader');
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-config-${Date.now()}.json`);
    const bank = new PatternMemoryBank({
      ...scope(),
      dbPath,
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: { backtestPersist: false },
        },
      },
    });

    expect(bank.minTradesSample).toBe(ConfigLoader.get('patternMemory.bank.minTradesSample'));
    expect(bank.patternBankConfig.maxPatterns).toBe(ConfigLoader.get('patternMemory.bank.maxPatterns'));
    expect(() => new PatternMemoryBank({
      ...scope(),
      dbPath,
      minTradesSample: 0,
    })).toThrow(/patternMemory\.bank\.minTradesSample must be >= 1/);
    expect(() => new PatternMemoryBank({
      ...scope(),
      dbPath,
      maxPatterns: '10000',
    })).toThrow(/patternMemory\.bank\.maxPatterns must be a finite number/);
  });

  test('PatternMemoryBank recovers a corrupt primary bank from the last-good backup', () => {
    delete process.env.BACKTEST_MODE;
    process.env.PAPER_TRADING = 'true';

    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const paperScope = scope({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    });
    const bankConfig = {
      ...paperScope,
      dbPath: path.join(process.env.DATA_DIR, `pattern-bank-recover-${Date.now()}.json`),
      minTradesSample: 1,
    };
    const bank = new PatternMemoryBank(bankConfig);
    fs.mkdirSync(path.dirname(bank.dbPath), { recursive: true });

    expect(bank.recordTradeOutcome(bankTrade({
      ...paperScope,
      id: 'paper-trade-1',
    }))).toBe(true);
    fs.copyFileSync(bank.dbPath, bank.backupPath);
    fs.writeFileSync(bank.dbPath, '{not-json', 'utf8');

    const recovered = new PatternMemoryBank(bankConfig);
    expect(Object.keys(recovered.exportMemory().patterns)).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(recovered.dbPath, 'utf8')).metadata.version).toBe('2.0.0');
  });

  test('PatternMemoryBank logs explicit empty initialization when no primary or backup exists', () => {
    delete process.env.BACKTEST_MODE;
    process.env.PAPER_TRADING = 'true';

    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const paperScope = scope({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    });
    const bank = new PatternMemoryBank({
      ...paperScope,
      dbPath: path.join(process.env.DATA_DIR, `pattern-bank-empty-${Date.now()}.json`),
      minTradesSample: 1,
    });

    expect(Object.keys(bank.exportMemory().patterns)).toHaveLength(0);
    expect(consoleSpies[1]).toHaveBeenCalledWith(expect.stringContaining('No primary or backup pattern bank found; initializing empty bank'));
  });

  test('PatternMemoryBank preserves last-good backup when primary is corrupt before save', () => {
    delete process.env.BACKTEST_MODE;
    process.env.PAPER_TRADING = 'true';

    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const paperScope = scope({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    });
    const bankConfig = {
      ...paperScope,
      dbPath: path.join(process.env.DATA_DIR, `pattern-bank-preserve-${Date.now()}.json`),
      minTradesSample: 1,
    };
    const bank = new PatternMemoryBank(bankConfig);
    fs.mkdirSync(path.dirname(bank.dbPath), { recursive: true });

    expect(bank.recordTradeOutcome(bankTrade({
      ...paperScope,
      id: 'paper-trade-1',
    }))).toBe(true);
    fs.copyFileSync(bank.dbPath, bank.backupPath);
    const backupBefore = fs.readFileSync(bank.backupPath, 'utf8');
    fs.writeFileSync(bank.dbPath, '{not-json', 'utf8');

    expect(bank.recordTradeOutcome(bankTrade({
      ...paperScope,
      id: 'paper-trade-2',
    }))).toBe(true);

    expect(fs.readFileSync(bank.backupPath, 'utf8')).toBe(backupBefore);
    expect(JSON.parse(fs.readFileSync(bank.dbPath, 'utf8')).metadata.version).toBe('2.0.0');
  });

  test('PatternMemoryBank fails loud when primary and backup banks are both corrupt', () => {
    delete process.env.BACKTEST_MODE;
    process.env.PAPER_TRADING = 'true';

    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const paperScope = scope({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    });
    const bankConfig = {
      ...paperScope,
      dbPath: path.join(process.env.DATA_DIR, `pattern-bank-corrupt-${Date.now()}.json`),
      minTradesSample: 1,
    };
    const bank = new PatternMemoryBank(bankConfig);
    fs.mkdirSync(path.dirname(bank.dbPath), { recursive: true });
    fs.writeFileSync(bank.dbPath, '{not-json', 'utf8');
    fs.writeFileSync(bank.backupPath, '{also-not-json', 'utf8');

    expect(() => new PatternMemoryBank(bankConfig))
      .toThrow(/Primary and backup pattern banks both failed/);
  });

  test('PatternMemoryBank exposes read-only memory snapshots', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-readonly-${Date.now()}.json`);
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

    expect(bank.recordTradeOutcome(bankTrade())).toBe(true);
    const patternHash = Object.keys(bank.exportMemory().patterns)[0];
    const snapshot = bank.memory;
    snapshot.patterns[patternHash].scopeKey = 'corrupted';
    snapshot.patterns.injected = { scopeKey: 'unscoped' };
    expect(bank.exportMemory().patterns[patternHash].scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');
    expect(bank.exportMemory().patterns.injected).toBeUndefined();
    expect(() => bank.importMemory(snapshot)).toThrow(/PatternMemoryBank\.validateMemoryStructure pattern .* immutable scope field/);
    expect(bank.exportMemory().patterns[patternHash].scopeKey).toBe('backtest:alpaca:acct-main:stocks:TSLA:15m');
    expect(bank.exportMemory().patterns.injected).toBeUndefined();
    const forged = bank.exportMemory();
    forged.patterns[patternHash].sampleCount = 99;
    expect(() => bank.importMemory(forged)).toThrow(/inconsistent outcome counters/);
    expect(bank.exportMemory().patterns[patternHash].sampleCount).toBe(1);
    expect(() => {
      bank.memory = bank.createEmptyMemory();
    }).toThrow(/PatternMemoryBank\.memory is read-only/);
  });

  test('PatternMemoryBank reports failed outcome durability', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    delete process.env.BACKTEST_MODE;
    process.env.PAPER_TRADING = 'true';
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-save-fail-${Date.now()}.json`);
    const bank = new PatternMemoryBank({
      ...scope(),
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
      dbPath,
      minTradesSample: 1,
    });

    bank.saveMemory = () => false;
    expect(bank.recordTradeOutcome(bankTrade({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    }))).toBe(false);
    expect(Object.values(bank.exportMemory().patterns)).toHaveLength(0);
  });

  test('PatternMemoryBank separates telemetry failure from memory durability', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    delete process.env.BACKTEST_MODE;
    process.env.PAPER_TRADING = 'true';
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-telemetry-fail-${Date.now()}.json`);
    const bank = new PatternMemoryBank({
      ...scope(),
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
      dbPath,
      minTradesSample: 1,
    });

    bank.writeOutcomeTelemetry = () => false;
    bank.saveMemory = () => true;
    expect(bank.recordTradeOutcome(bankTrade({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    }))).toBe(true);
    expect(Object.values(bank.exportMemory().patterns)).toHaveLength(1);
  });

  test('PatternMemoryBank rolls back durable mutators when save fails', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    delete process.env.BACKTEST_MODE;
    process.env.PAPER_TRADING = 'true';
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-mutator-fail-${Date.now()}.json`);
    const paperTrade = bankTrade({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    });
    const bank = new PatternMemoryBank({
      ...scope(),
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
      dbPath,
      minTradesSample: 1,
    });

    bank.saveMemory = () => true;
    expect(bank.recordTradeOutcome(paperTrade)).toBe(true);
    const original = bank.exportMemory();
    const patternHash = Object.keys(original.patterns)[0];

    bank.saveMemory = () => false;
    const imported = bank.createEmptyMemory();
    imported.patterns.imported = {
      ...original.patterns[patternHash],
      name: 'imported-pattern',
    };

    expect(bank.importMemory(imported)).toBe(false);
    expect(bank.exportMemory()).toEqual(original);

    bank.saveMemory = () => true;
    const pruneSetup = bank.exportMemory();
    pruneSetup.patterns[patternHash].status = 'DEAD';
    expect(bank.importMemory(pruneSetup)).toBe(true);
    bank.saveMemory = () => false;
    const beforePrune = bank.exportMemory();
    expect(bank.pruneOldPatterns()).toBe(0);
    expect(bank.exportMemory()).toEqual(beforePrune);

    expect(bank.reset()).toBe(false);
    expect(bank.exportMemory()).toEqual(beforePrune);
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

  test('PatternMemoryBank rejects dbPath outside learned-state root', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const outsidePath = path.join(os.tmpdir(), `pattern-bank-outside-${Date.now()}.json`);

    expect(() => new PatternMemoryBank({
      ...scope(),
      dbPath: outsidePath,
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: { backtestPersist: false },
        },
      },
    })).toThrow(/PatternMemoryBank\.dbPath resolves outside learned-state root/);
  });

  test('PatternMemoryBank rejects dbPath traversal through learned-state root', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const traversalPath = path.join(process.env.DATA_DIR, '..', `pattern-bank-escaped-${Date.now()}.json`);

    expect(() => new PatternMemoryBank({
      ...scope(),
      dbPath: traversalPath,
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: { backtestPersist: false },
        },
      },
    })).toThrow(/PatternMemoryBank\.dbPath resolves outside learned-state root/);
  });

  test('PatternMemoryBank rejects partition filenames outside learned-state root', () => {
    const PatternMemoryBank = require('../core/PatternMemoryBank');

    expect(() => new PatternMemoryBank({
      ...scope(),
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: {
            backtest: '../escaped-patterns.json',
            backtestPersist: false,
          },
        },
      },
    })).toThrow(/PatternMemoryBank\.memoryFile resolves outside learned-state root/);
  });
});
