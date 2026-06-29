'use strict';

const fs = require('fs');
const path = require('path');

const TEST_ROOT = path.join(__dirname, '..', 'data', 'test-decision-autopsy-logger');

function freshRunDir(name) {
  const dir = path.join(TEST_ROOT, `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

describe('DecisionAutopsyLogger', () => {
  const originalEnv = { ...process.env };
  const runDirs = [];

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    for (const dir of runDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    try {
      fs.rmdirSync(TEST_ROOT);
    } catch (_error) {
      // Keep unrelated files if another run wrote into this directory.
    }
  });

  test('persists original symbol alongside canonical symbol', () => {
    const runDir = freshRunDir('canonical');
    runDirs.push(runDir);
    process.env.BACKTEST_OUTPUT_DIR = runDir;
    delete process.env.DECISION_AUTOPSY_ENABLED;
    delete process.env.DECISION_AUTOPSY_FALLBACK_DIR;

    const logger = require('../core/DecisionAutopsyLogger');
    expect(logger.writeAutopsy({ traceId: 'trace_symbol', symbol: 'BTC/USD' })).toBe(true);

    const records = readJsonl(logger.fileForDate());
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(expect.objectContaining({
      traceId: 'trace_symbol',
      originalSymbol: 'BTC/USD',
      symbol: 'BTC-USD',
      _type: 'decision_autopsy',
    }));
  });

  test('writes a fallback autopsy record when primary ledger path fails', () => {
    const runDir = freshRunDir('fallback');
    runDirs.push(runDir);
    const blockedPrimaryRoot = path.join(runDir, 'primary-file');
    const fallbackDir = path.join(runDir, 'fallback-ledger');
    fs.writeFileSync(blockedPrimaryRoot, 'not a directory');
    process.env.BACKTEST_OUTPUT_DIR = blockedPrimaryRoot;
    process.env.DECISION_AUTOPSY_FALLBACK_DIR = fallbackDir;
    delete process.env.DECISION_AUTOPSY_ENABLED;

    const logger = require('../core/DecisionAutopsyLogger');
    expect(logger.writeAutopsy({ traceId: 'trace_fallback', symbol: 'TSLA' })).toBe(true);

    const records = readJsonl(logger.fallbackFileForDate());
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(expect.objectContaining({
      traceId: 'trace_fallback',
      originalSymbol: 'TSLA',
      symbol: 'TSLA',
      _type: 'decision_autopsy',
      _primaryAutopsyError: expect.any(String),
    }));
  });

  test('returns false when both primary and fallback autopsy paths fail', () => {
    const runDir = freshRunDir('double-fail');
    runDirs.push(runDir);
    const blockedPrimaryRoot = path.join(runDir, 'primary-file');
    const blockedFallbackRoot = path.join(runDir, 'fallback-file');
    fs.writeFileSync(blockedPrimaryRoot, 'not a directory');
    fs.writeFileSync(blockedFallbackRoot, 'not a directory');
    process.env.BACKTEST_OUTPUT_DIR = blockedPrimaryRoot;
    process.env.DECISION_AUTOPSY_FALLBACK_DIR = path.join(blockedFallbackRoot, 'nested');
    delete process.env.DECISION_AUTOPSY_ENABLED;

    const logger = require('../core/DecisionAutopsyLogger');
    expect(logger.writeAutopsy({ traceId: 'trace_double_fail', symbol: 'TSLA' })).toBe(false);
  });
});
