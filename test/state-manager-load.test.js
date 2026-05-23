'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('StateManager load validation', () => {
  let originalEnv;
  let tempDir;
  let stateFile;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-state-load-'));
    stateFile = path.join(tempDir, 'state.json');
    process.env.STATE_FILE = stateFile;
    process.env.DATA_DIR = tempDir;
    process.env.BACKTEST_MODE = 'false';
    process.env.EXECUTION_MODE = 'paper';
    process.env.CANDLE_SOURCE = 'live';
    process.env.FRESH_START = 'false';
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('forces malformed persisted isTrading values into paused boolean state', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      lastPrices: { TSLA: 425.95 },
      isTrading: 'false',
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('isTrading')).toBe(false);
    expect(manager.get('pauseReason')).toContain('invalid persisted isTrading');
    expect(manager.get('lastError')).toContain('invalid persisted isTrading');

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(saved.isTrading).toBe(false);
    expect(saved.pauseReason).toContain('invalid persisted isTrading');
  });
});
