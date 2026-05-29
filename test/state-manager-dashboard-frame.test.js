'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('StateManager dashboard state_update frame', () => {
  let originalEnv;
  let tempDir;
  let manager;
  let consoleSpies;

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-state-dashboard-'));
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
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('mirrors authoritative nested account fields at top level for dashboard panels', () => {
    const sent = [];
    manager.dashboardWs = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
    };
    manager.state.initialBalance = 10000;
    manager.state.balance = 12345.67;
    manager.state.totalBalance = 12456.78;
    manager.state.realizedPnL = 111.11;
    manager.state.unrealizedPnL = 100;
    manager.state.totalPnL = 211.11;
    manager.state.tradeCount = 7;
    manager.state.dailyTradeCount = 2;
    manager.state.recoveryMode = false;
    manager.state.lastPrices = new Map([['TSLA', 110]]);
    manager.state.activeTrades = new Map([
      ['T1', {
        id: 'T1',
        orderId: 'ORD-1',
        symbol: 'TSLA',
        direction: 'long',
        entryPrice: 100,
        sizeUsd: 1000,
        brokerId: 'alpaca',
        accountId: 'paper-1',
        assetClass: 'stock',
        executionMode: 'paper',
        timeframe: '1m',
        scopeKey: 'paper:alpaca:paper-1:stock:TSLA:1m',
      }],
    ]);
    const expectedEquity = manager.getEquity();

    manager.broadcastToDashboard({ reason: 'test' }, { source: 'unit' });

    expect(sent).toHaveLength(1);
    const frame = sent[0];
    expect(frame.type).toBe('state_update');
    expect(frame.state.balance).toBe(12345.67);
    expect(frame.balance).toBe(frame.state.balance);
    expect(frame.totalBalance).toBe(frame.state.totalBalance);
    expect(frame.equity).toBeCloseTo(expectedEquity);
    expect(frame.state.equity).toBeCloseTo(expectedEquity);
    expect(frame.equity).not.toBe(frame.state.totalBalance);
    expect(frame.realizedPnL).toBe(frame.state.realizedPnL);
    expect(frame.unrealizedPnL).toBe(frame.state.unrealizedPnL);
    expect(frame.totalPnL).toBe(frame.state.totalPnL);
    expect(frame.tradeCount).toBe(frame.state.tradeCount);
    expect(frame.dailyTradeCount).toBe(frame.state.dailyTradeCount);
    expect(frame.positions).toEqual(frame.state.positions);
    expect(frame.scopedPositionCount).toBe(frame.state.scopedPositionCount);
  });
});
