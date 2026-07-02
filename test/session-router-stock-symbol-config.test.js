'use strict';

const fs = require('fs');
const path = require('path');
const SessionRouter = require('../core/SessionRouter');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('SessionRouter stock symbol config ownership', () => {
  let restoreRuntimeEnv;

  beforeEach(() => {
    restoreRuntimeEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'backtest',
      BACKTEST_MODE: 'true',
      CANDLE_SOURCE: 'file',
      // Backtest mode refuses the implicit $10000 reset by StateManager
      // guard; the fixture supplies its balance explicitly.
      INITIAL_BALANCE: '10000',
    });
  });

  afterEach(() => {
    restoreRuntimeEnv();
    jest.restoreAllMocks();
  });

  test('enabled SessionRouter requires explicit stockSymbols', () => {
    expect(() => new SessionRouter({
      enabled: true,
      cryptoSymbols: ['BTC-USD'],
    })).toThrow(/stockSymbols must be explicitly provided/);
  });

  test('enabled SessionRouter requires explicit cryptoSymbols', () => {
    expect(() => new SessionRouter({
      enabled: true,
      stockSymbols: ['TSLA'],
    })).toThrow(/cryptoSymbols must be explicitly provided/);
  });

  test('disabled SessionRouter does not fabricate stockSymbols or cryptoSymbols', () => {
    const router = new SessionRouter({
      enabled: false,
    });

    expect(router.stockSymbols).toEqual([]);
    expect(router.cryptoSymbols).toEqual([]);
  });

  test('runtime stock symbol routing has no sessions.stockSymbols fallback path', () => {
    const root = path.resolve(__dirname, '..');
    const runEmpire = fs.readFileSync(path.join(root, 'run-empire-v2.js'), 'utf8');
    const candleProcessor = fs.readFileSync(path.join(root, 'core', 'CandleProcessor.js'), 'utf8');

    expect(runEmpire).not.toContain('fallbackSymbols: sessionsCfg.stockSymbols');
    expect(runEmpire).not.toContain('options.fallbackSymbols');
    expect(runEmpire).toContain('allowTradingPairFallback: false');
    expect(runEmpire).toContain('allowTradingPairFallback: !sessionRouterEnabled');
    expect(candleProcessor).not.toContain("getConfigValue('sessions.stockSymbols')");
  });
});
