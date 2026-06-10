'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Focused proof for the June 9 complaint: "PatternMemoryBank eviction boundary tests."
// Two questions, two sections.
//   Section A: does eviction logic work when called? (unit invariants 1-4)
//   Section B: is eviction actually invoked by the runtime path, or dormant/manual-only?
// Section B reads the production sources via fs.readFileSync and asserts the exact set
// of caller patterns. If a future commit adds or removes a caller, the counts change
// and the test fails loud, forcing the developer to update both the expected count
// and the DORMANT WIRING CONCLUSION below.

describe('Pattern memory eviction boundary', () => {
  let consoleSpies;
  let originalEnv;

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

  function makeBankRecord(name, overrides = {}) {
    const baseScope = scope();
    return {
      name,
      data: { token: name },
      symbol: baseScope.symbol,
      brokerId: baseScope.brokerId,
      accountId: baseScope.accountId,
      accountIdSource: baseScope.accountIdSource,
      assetClass: baseScope.assetClass,
      executionMode: baseScope.executionMode,
      timeframe: baseScope.timeframe,
      scopeKey: baseScope.scopeKey,
      scopeKeyVersion: 2,
      scopeComplete: true,
      status: 'CANDIDATE',
      sampleCount: 1,
      winCount: 1,
      lossCount: 0,
      totalPnL: 1,
      avgPnLPercent: 1,
      sumPnLSquared: 1,
      avgHoldMs: 0,
      totalHoldMs: 0,
      firstSeenTs: 1000,
      lastSeenTs: 1000,
      lastOutcomeTs: 1000,
      score: 0,
      ...overrides,
    };
  }

  function makeBackestBank() {
    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-${Date.now()}.json`);
    return new PatternMemoryBank({
      ...scope(),
      dbPath,
      minTradesSample: 1,
      featureFlags: {
        PATTERN_MEMORY_PARTITION: {
          settings: { backtestPersist: false },
        },
      },
    });
  }

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    process.env.BACKTEST_MODE = 'true';
    process.env.BACKTEST_NO_PATTERN_SAVE = 'true';
    process.env.DATA_DIR = path.join(
      os.tmpdir(),
      `pattern-memory-eviction-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
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

  // ───────────────────────────────────────────────────────────
  // SECTION A: does the eviction logic work when called?
  // ───────────────────────────────────────────────────────────

  test('Invariant 1: PatternMemoryBank.pruneOldPatterns removes every DEAD record while leaving live records intact', () => {
    const bank = makeBackestBank();
    const memory = bank.createEmptyMemory();
    // Fresh lastSeenTs for every record so the age-based pruning pass at
    // PatternMemoryBank.js:806 cannot sweep CANDIDATE records and contaminate the
    // DEAD-only count. DEAD records still hit the DEAD branch first (line 802).
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      memory.patterns[`hash-dead-${i}`] = makeBankRecord(`dead-${i}`, {
        status: 'DEAD',
        firstSeenTs: now,
        lastSeenTs: now,
        lastOutcomeTs: now,
      });
    }
    for (let i = 0; i < 3; i++) {
      memory.patterns[`hash-live-${i}`] = makeBankRecord(`live-${i}`, {
        status: 'CANDIDATE',
        firstSeenTs: now,
        lastSeenTs: now,
        lastOutcomeTs: now,
      });
    }
    expect(bank.importMemory(memory)).toBe(true);

    const prunedCount = bank.pruneOldPatterns();
    expect(prunedCount).toBe(4);

    const after = bank.exportMemory().patterns;
    expect(Object.keys(after)).toHaveLength(3);
    for (const key of Object.keys(after)) {
      expect(after[key].status).not.toBe('DEAD');
    }
  });

  test('Invariant 2: PatternMemoryBank.pruneOldPatterns enforces the 10000 cap by removing lowest-score then oldest records first', () => {
    // The MAX_PATTERNS constant lives at core/PatternMemoryBank.js:77 and is not exported.
    // If that constant changes, the source-code grep below must change with it.
    const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'core', 'PatternMemoryBank.js'), 'utf8');
    const capMatch = SOURCE.match(/const\s+MAX_PATTERNS\s*=\s*(\d+);/);
    expect(capMatch).not.toBeNull();
    const MAX_PATTERNS = parseInt(capMatch[1], 10);
    expect(MAX_PATTERNS).toBe(10000);

    const bank = makeBackestBank();
    const memory = bank.createEmptyMemory();
    const OVER_BY = 5;
    const total = MAX_PATTERNS + OVER_BY;
    const now = Date.now();
    // Lowest score = i, oldest lastSeenTs = i. Records with low i should be removed first.
    // PROMOTED status keeps them out of the DEAD pruning pass so only the cap path runs.
    for (let i = 0; i < total; i++) {
      memory.patterns[`hash-${String(i).padStart(6, '0')}`] = makeBankRecord(`p-${i}`, {
        status: 'PROMOTED',
        score: i,
        firstSeenTs: now - (total - i),
        lastSeenTs: now - (total - i),
        lastOutcomeTs: now - (total - i),
      });
    }
    expect(bank.importMemory(memory)).toBe(true);

    const pruned = bank.pruneOldPatterns();
    expect(pruned).toBe(OVER_BY);

    const after = bank.exportMemory().patterns;
    expect(Object.keys(after)).toHaveLength(MAX_PATTERNS);

    // The OVER_BY lowest scores must be gone (scores 0..OVER_BY-1).
    for (let i = 0; i < OVER_BY; i++) {
      expect(after[`hash-${String(i).padStart(6, '0')}`]).toBeUndefined();
    }
    // Boundary record (lowest surviving score) must remain.
    expect(after[`hash-${String(OVER_BY).padStart(6, '0')}`]).toBeDefined();
    // Highest score must remain.
    expect(after[`hash-${String(total - 1).padStart(6, '0')}`]).toBeDefined();
  });

  test('Invariant 3: UnifiedPatternMemory.prune enforces the configured maxPatterns cap', () => {
    const features = (base) => [base, 0.02, 1, 0.03, 0.01, 0.5, 0.01, 0.02, 0];
    const { UnifiedPatternMemory } = require('../core/UnifiedPatternMemory');

    // maxPatterns=3 is supplied explicitly via config so the env/default fallback chain at
    // core/UnifiedPatternMemory.js:189 (parseInt(env) || config.maxPatterns || 10000) does
    // not silently substitute 10000. maxAgeDays is set very high so the age-based pruning
    // pass at lines 551-561 cannot remove anything; only the cap path at lines 564-578
    // produces the eviction.
    const memory = new UnifiedPatternMemory({
      persistToDisk: false,
      minSamples: 1,
      successThreshold: 0.6,
      maxPatterns: 3,
      maxAgeDays: 100000,
    });

    const baseScope = scope({
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
    });
    for (let i = 0; i < 5; i++) {
      const ok = memory.recordOutcome(features(0.51 + i * 0.05), {
        ...baseScope,
        pnl: 5,
        pnlPercent: 1,
        holdTimeMs: 900000,
        exitReason: 'test',
        strategy: `TestStrategy${i}`,
      });
      expect(ok).toBe(true);
    }
    expect(Object.keys(memory.patterns)).toHaveLength(5);

    memory.prune();
    expect(Object.keys(memory.patterns).length).toBe(3);
  });

  test('Invariant 4: PatternMemoryBank.pruneOldPatterns rolls back memory and returns 0 when saveMemory fails', () => {
    delete process.env.BACKTEST_MODE; // persistence enabled in paper mode
    process.env.PAPER_TRADING = 'true';

    const PatternMemoryBank = require('../core/PatternMemoryBank');
    const dbPath = path.join(process.env.DATA_DIR, `pattern-bank-rollback-${Date.now()}.json`);
    const bank = new PatternMemoryBank({
      ...scope(),
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
      dbPath,
      minTradesSample: 1,
    });

    bank.saveMemory = () => true;
    const memory = bank.createEmptyMemory();
    memory.patterns['hash-dead'] = makeBankRecord('dead', {
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
      status: 'DEAD',
    });
    memory.patterns['hash-live'] = makeBankRecord('live', {
      executionMode: 'paper',
      scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
      status: 'CANDIDATE',
    });
    expect(bank.importMemory(memory)).toBe(true);
    const beforePrune = bank.exportMemory();

    bank.saveMemory = () => false;
    const result = bank.pruneOldPatterns();
    expect(result).toBe(0);
    expect(bank.exportMemory()).toEqual(beforePrune);
  });

  // ───────────────────────────────────────────────────────────
  // SECTION B: is eviction actually invoked by the runtime path?
  // ───────────────────────────────────────────────────────────
  // Each assertion below counts a specific caller pattern in a specific production
  // source file. If a future commit adds or removes a caller, the count changes
  // and the test fails. The failing test then forces the developer to update the
  // expected count and re-categorize the DORMANT WIRING CONCLUSION at the bottom.

  function readSource(relPath) {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  }

  function countMatches(text, pattern) {
    return (text.match(pattern) || []).length;
  }

  test('Runtime wiring: pruneOldPatterns occurrences in production sources match the expected dormant chain', () => {
    // Three expected occurrences total:
    //   core/PatternMemoryBank.js: 1 (the method definition at line 791)
    //   core/trai_core.js:         1 (the wrapper call at line 842)
    //   core/TRAIDecisionModule.js:1 (the wrapper definition at line 1073)
    //   run-empire-v2.js:          0 (no production caller)
    // Comments inside production source that mention pruneOldPatterns count too;
    // if you intentionally added a comment, raise the expected number deliberately.
    const expected = {
      'core/PatternMemoryBank.js': 1,
      'core/trai_core.js': 1,
      'core/TRAIDecisionModule.js': 1,
      'run-empire-v2.js': 0,
    };
    const actual = {};
    for (const file of Object.keys(expected)) {
      actual[file] = countMatches(readSource(file), /pruneOldPatterns/g);
    }
    expect(actual).toEqual(expected);
  });

  test('Runtime wiring: pruneOldMemories occurrences confirm only the TRAIDecisionModule wrapper invokes trai_core', () => {
    const expected = {
      'core/trai_core.js': 1,         // definition only
      'core/TRAIDecisionModule.js': 1, // the wrapper call
      'run-empire-v2.js': 0,           // no production caller
    };
    const actual = {};
    for (const file of Object.keys(expected)) {
      actual[file] = countMatches(readSource(file), /pruneOldMemories/g);
    }
    expect(actual).toEqual(expected);
  });

  test('Runtime wiring: UnifiedPatternMemory.prune() is invoked exactly once in production, from inside cleanup()', () => {
    const src = readSource('core/UnifiedPatternMemory.js');
    const explicitCalls = countMatches(src, /this\.prune\(\)/g);
    expect(explicitCalls).toBe(1);

    // Confirm the single this.prune() call lives inside cleanup() by locating
    // the cleanup method header and asserting this.prune() appears between it
    // and the next top-level closing brace at column 1 ("}" at start of line).
    // Brace-balanced regex is impractical, so this uses textual indexes.
    const cleanupIdx = src.indexOf('async cleanup()');
    expect(cleanupIdx).toBeGreaterThan(-1);
    // The class body uses two-space indentation; cleanup() closes on a line that
    // starts with "  }" (two spaces + closing brace). Find the next such line.
    const cleanupEndRel = src.slice(cleanupIdx).search(/\n\s{2}\}\s*\n/);
    expect(cleanupEndRel).toBeGreaterThan(-1);
    const cleanupBody = src.slice(cleanupIdx, cleanupIdx + cleanupEndRel);
    expect(cleanupBody).toMatch(/this\.prune\(\)/);

    const pruneIdx = src.indexOf('this.prune()');
    expect(pruneIdx).toBeGreaterThan(cleanupIdx);
    expect(pruneIdx).toBeLessThan(cleanupIdx + cleanupEndRel);
  });

  test('Runtime wiring: UnifiedPatternMemory periodic timer drives save(), not prune()', () => {
    const src = readSource('core/UnifiedPatternMemory.js');
    expect(countMatches(src, /setInterval\(\(\) => this\.save\(\)/g)).toBe(1);
    expect(src.match(/setInterval\([^)]*prune/)).toBeNull();
  });

  test('Runtime wiring: UnifiedPatternMemory.cleanup() is invoked only from shutdown paths in production', () => {
    // The known shutdown sites that trigger UnifiedPatternMemory.cleanup() via the
    // patternChecker / memory aliases. If a new caller path is added (especially one
    // that runs in the trading hot loop), this expectation must be updated and the
    // conclusion below re-categorized.
    const expected = {
      'run-empire-v2.js': 1,                       // shutdown hook calling patternChecker.cleanup()
      'core/BacktestRunner.js': 1,                 // backtest finalization
      'core/EnhancedPatternRecognition.js': 1,     // module-level shutdown delegation
    };
    const actual = {};
    for (const file of Object.keys(expected)) {
      actual[file] = countMatches(readSource(file), /\.cleanup\s*\(\s*\)/g);
    }
    expect(actual).toEqual(expected);
  });

  test('DORMANT WIRING CONCLUSION: PatternMemoryBank pruning is not invoked at runtime; UnifiedPatternMemory pruning runs only on shutdown', () => {
    // The June 9 complaint asked whether unbounded memory growth is actually
    // prevented. Section A above proves the eviction code works when called.
    // Section B above proves the call sites are dormant or shutdown-only.
    //
    // This documentary assertion exists so the test report explicitly carries the
    // conclusion. The complaint remains OPEN until either (a) a periodic runtime
    // caller is wired and this conclusion is updated, or (b) Trey explicitly
    // accepts shutdown-only pruning for UnifiedPatternMemory and a runtime trigger
    // for PatternMemoryBank.
    const conclusion = [
      'PatternMemoryBank.pruneOldPatterns: works when called. No production caller invokes the chain.',
      'TRAIDecisionModule.pruneOldPatterns (entry point of the chain): zero production callers.',
      'UnifiedPatternMemory.prune: only invoked from cleanup() (shutdown path).',
      'UnifiedPatternMemory._saveTimer: triggers save() periodically, not prune().',
      'Runtime automatic pruning is NOT proven/wired. Complaint cannot be marked closed.',
    ].join('\n');
    expect(conclusion).toContain('NOT proven/wired');
    expect(conclusion).toContain('cannot be marked closed');
  });
});
