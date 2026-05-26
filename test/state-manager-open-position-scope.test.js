'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('StateManager openPosition scope contract', () => {
  let originalEnv;
  let tempDir;
  let manager;
  let consoleSpies;

  const fullScope = (overrides = {}) => ({
    orderId: 'OPEN_SCOPE_1',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'paper',
    timeframe: '15m',
    ...overrides,
  });

  const expectedScopeKey = 'paper:alpaca:acct-main:stocks:TSLA:15m';

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-open-scope-'));
    process.env.STATE_FILE = path.join(tempDir, 'state.json');
    process.env.DATA_DIR = tempDir;
    process.env.BACKTEST_MODE = 'false';
    process.env.EXECUTION_MODE = 'paper';
    process.env.CANDLE_SOURCE = 'live';
    process.env.FRESH_START = 'false';

    consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(() => {}),
      jest.spyOn(console, 'warn').mockImplementation(() => {}),
      jest.spyOn(console, 'error').mockImplementation(() => {}),
    ];

    const { StateManager } = require('../core/StateManager');
    manager = new StateManager();
    manager.save = jest.fn();
    manager.notifyListeners = jest.fn();
    manager.dashboardWs = null;
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test.each([
    ['symbol', { symbol: null }],
    ['brokerId', { brokerId: null }],
    ['assetClass', { assetClass: null }],
    ['executionMode', { executionMode: null }],
    ['timeframe', { timeframe: null }],
  ])('rejects missing %s before mutating active trades', async (field, override) => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    const result = await manager.openPosition(500, 100, fullScope(override));

    expect(result.success).toBe(false);
    expect(result.scopeRejected).toBe(true);
    expect(result.code).toBe('SCOPE_REJECTED');
    expect(result.missingFields).toContain(field);
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager._buildScopedDashboardPositions(manager.state)).toEqual(beforePositions);
  });

  test('rejects a caller-supplied scopeKey that does not match derived scope', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: 'paper:alpaca:acct-main:stocks:SPY:15m',
    }));

    expect(result.success).toBe(false);
    expect(result.scopeRejected).toBe(true);
    expect(result.error).toContain('scopeKey mismatch');
    expect(result.suppliedScopeKey).toBe('paper:alpaca:acct-main:stocks:SPY:15m');
    expect(result.expectedScopeKey).toBe(expectedScopeKey);
    expect(manager.get('activeTrades').size).toBe(0);
  });

  test('opens a fully scoped trade and stores the derived immutable scope key', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
    }));

    expect(result.success).toBe(true);
    expect(manager.get('activeTrades').size).toBe(1);

    const trade = manager.get('activeTrades').get('OPEN_SCOPE_1');
    expect(trade.symbol).toBe('TSLA');
    expect(trade.brokerId).toBe('alpaca');
    expect(trade.accountId).toBe('acct-main');
    expect(trade.assetClass).toBe('stocks');
    expect(trade.executionMode).toBe('paper');
    expect(trade.timeframe).toBe('15m');
    expect(trade.scopeKey).toBe(expectedScopeKey);
    expect(trade.scopeKeyVersion).toBe(2);
  });
});
