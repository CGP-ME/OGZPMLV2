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
    if (manager && typeof manager._clearDashboardStateHeartbeat === 'function') {
      manager._clearDashboardStateHeartbeat();
    }
    jest.useRealTimers();
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

  test('projects runtime scope on flat state_update heartbeats', () => {
    const sent = [];
    manager.dashboardWs = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
    };
    manager.state.activeTrades = new Map();

    const runtimeScope = manager.setDashboardRuntimeScope({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-1',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    });

    manager.broadcastToDashboard({}, { reason: 'dashboard_heartbeat' });

    expect(runtimeScope).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      broker: 'alpaca',
      accountId: 'paper-1',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-1:stocks:TSLA:15m',
      scopeKeyVersion: 2,
      scopeComplete: true,
    }));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(expect.objectContaining({
      type: 'state_update',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      broker: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:paper-1:stocks:TSLA:15m',
      scopeComplete: true,
      runtimeScopeStatus: 'complete',
      runtimeScopeMissing: [],
    }));
    expect(sent[0].state.runtimeScope).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      scopeKey: 'paper:alpaca:paper-1:stocks:TSLA:15m',
    }));
    expect(sent[0].state.symbol).toBe('TSLA');
    expect(sent[0].state.positions).toEqual([]);
  });

  test('marks implicit account runtime scope incomplete without top-level stamping flat state', () => {
    const sent = [];
    manager.dashboardWs = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
    };
    manager.state.activeTrades = new Map();

    const runtimeScope = manager.setDashboardRuntimeScope({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    });

    manager.broadcastToDashboard({}, { reason: 'dashboard_heartbeat' });

    expect(runtimeScope).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'default',
      accountIdSource: 'default',
      scopeComplete: false,
      runtimeScopeStatus: 'incomplete',
      missingFields: ['accountId'],
    }));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(expect.objectContaining({
      type: 'state_update',
      runtimeScopeStatus: 'incomplete',
      runtimeScopeMissing: ['accountId'],
    }));
    expect(sent[0].symbol).toBeUndefined();
    expect(sent[0].state.symbol).toBeUndefined();
    expect(sent[0].state.runtimeScope).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      accountId: 'default',
      scopeComplete: false,
      runtimeScopeStatus: 'incomplete',
      missingFields: ['accountId'],
    }));
  });

  test('marks unset runtime scope explicitly instead of silently omitting it', () => {
    const sent = [];
    manager.dashboardWs = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
    };
    manager.state.activeTrades = new Map();

    manager.broadcastToDashboard({}, { reason: 'dashboard_heartbeat' });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(expect.objectContaining({
      type: 'state_update',
      runtimeScope: null,
      runtimeScopeStatus: 'unset',
      runtimeScopeMissing: ['runtimeScope'],
    }));
    expect(sent[0].symbol).toBeUndefined();
    expect(sent[0].state.runtimeScope).toBeNull();
    expect(sent[0].state.runtimeScopeStatus).toBe('unset');
  });

  test('does not let runtime scope overwrite active position scope', () => {
    const sent = [];
    manager.dashboardWs = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
    };
    manager.state.lastPrices = new Map([['BTC-USD', 101]]);
    manager.state.activeTrades = new Map([
      ['BTC-1', {
        id: 'BTC-1',
        orderId: 'BTC-1',
        symbol: 'BTC-USD',
        direction: 'long',
        entryPrice: 100,
        sizeUsd: 1000,
        brokerId: 'kraken',
        accountId: 'paper-1',
        accountIdSource: 'config',
        assetClass: 'crypto',
        executionMode: 'paper',
        timeframe: '1m',
        scopeKey: 'paper:kraken:paper-1:crypto:BTC-USD:1m',
      }],
    ]);

    manager.setDashboardRuntimeScope({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-1',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    });
    manager.broadcastToDashboard({}, { reason: 'dashboard_heartbeat' });

    expect(sent).toHaveLength(1);
    expect(sent[0].runtimeScopeStatus).toBe('complete');
    expect(sent[0].symbol).toBeUndefined();
    expect(sent[0].state.symbol).toBeUndefined();
    expect(sent[0].state.runtimeScope.symbol).toBe('TSLA');
    expect(sent[0].positions).toHaveLength(1);
    expect(sent[0].positions[0]).toEqual(expect.objectContaining({
      symbol: 'BTC-USD',
      brokerId: 'kraken',
      assetClass: 'crypto',
      scopeComplete: true,
    }));
  });

  test('rejects incomplete runtime scope instead of defaulting flat dashboard state', () => {
    expect(() => manager.setDashboardRuntimeScope({
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-1',
      assetClass: 'stocks',
      executionMode: 'paper',
    })).toThrow(/missing immutable trade scope field\(s\): timeframe/);
  });

  test('rejects placeholder runtime scope fields instead of publishing fake identity', () => {
    expect(() => manager.setDashboardRuntimeScope({
      symbol: 'unknown',
      brokerId: 'alpaca',
      accountId: 'paper-1',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    })).toThrow(/invalid immutable trade scope placeholder field\(s\): symbol/);
  });

  test('emits authoritative state_update heartbeat while dashboard socket stays open', () => {
    jest.useFakeTimers();
    const sent = [];
    let closeHandler = null;
    const ws = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
      once: jest.fn((event, handler) => {
        if (event === 'close') closeHandler = handler;
      }),
    };
    const heartbeatMs = require('../core/TradingConfig').get('dashboard.stateUpdateHeartbeatMs');

    manager.setDashboardWs(ws);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual(expect.objectContaining({
      type: 'state_update',
      context: { reason: 'dashboard_connect' },
    }));

    jest.advanceTimersByTime(heartbeatMs);

    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(expect.objectContaining({
      type: 'state_update',
      context: { reason: 'dashboard_heartbeat' },
    }));
    expect(sent[1].state).toEqual(expect.objectContaining({
      balance: manager.state.balance,
      tradeCount: manager.state.tradeCount,
    }));

    closeHandler();
    jest.advanceTimersByTime(heartbeatMs);

    expect(sent).toHaveLength(2);
    expect(manager.dashboardWs).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[StateManager] dashboard WebSocket closed; state_update broadcasts stopped'
    );
  });

  test('rejects invalid configured heartbeat before sending dashboard state', () => {
    const sent = [];
    const ws = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
      once: jest.fn(),
    };
    const TradingConfig = require('../core/TradingConfig');
    TradingConfig.setOverrides({ dashboard: { stateUpdateHeartbeatMs: 0 } });

    expect(() => manager.setDashboardWs(ws)).toThrow('dashboard.stateUpdateHeartbeatMs must be positive milliseconds');
    expect(sent).toHaveLength(0);
    expect(manager.dashboardWs).toBeUndefined();
  });

  test('clears dashboard heartbeat for sockets that expose on instead of once', () => {
    jest.useFakeTimers();
    const sent = [];
    let closeHandler = null;
    const ws = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
      on: jest.fn((event, handler) => {
        if (event === 'close') closeHandler = handler;
      }),
    };
    const heartbeatMs = require('../core/TradingConfig').get('dashboard.stateUpdateHeartbeatMs');

    manager.setDashboardWs(ws);
    expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));

    closeHandler();
    jest.advanceTimersByTime(heartbeatMs);

    expect(sent).toHaveLength(1);
    expect(manager.dashboardWs).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[StateManager] dashboard WebSocket closed; state_update broadcasts stopped'
    );
  });

  test('self-clears dashboard heartbeat when active socket is no longer open', () => {
    jest.useFakeTimers();
    const sent = [];
    const ws = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
      once: jest.fn(),
    };
    const heartbeatMs = require('../core/TradingConfig').get('dashboard.stateUpdateHeartbeatMs');

    manager.setDashboardWs(ws);
    ws.readyState = 3;
    jest.advanceTimersByTime(heartbeatMs);

    expect(sent).toHaveLength(1);
    expect(manager.dashboardHeartbeatInterval).toBeNull();
    expect(manager.dashboardWs).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      '[StateManager] dashboard_heartbeat stopped; socket not open:',
      3
    );
  });

  test('logs heartbeat broadcast failures without throwing out of the interval', () => {
    jest.useFakeTimers();
    const sent = [];
    const ws = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
      once: jest.fn(),
    };
    const heartbeatMs = require('../core/TradingConfig').get('dashboard.stateUpdateHeartbeatMs');
    const originalBroadcast = manager.broadcastToDashboard.bind(manager);
    manager.broadcastToDashboard = jest.fn((updates, context) => {
      if (context?.reason === 'dashboard_heartbeat') {
        throw new Error('forced heartbeat failure');
      }
      return originalBroadcast(updates, context);
    });

    manager.setDashboardWs(ws);

    expect(() => jest.advanceTimersByTime(heartbeatMs)).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(
      '[StateManager] dashboard_heartbeat state_update failed:',
      'forced heartbeat failure'
    );
    expect(sent).toHaveLength(1);
  });

  test('rejects sockets without a close binding before sending dashboard state', () => {
    const sent = [];
    const ws = {
      readyState: 1,
      send: payload => sent.push(JSON.parse(payload)),
    };

    expect(() => manager.setDashboardWs(ws)).toThrow('dashboard WebSocket must expose once, on, or addEventListener close binding');
    expect(sent).toHaveLength(0);
    expect(manager.dashboardWs).toBeUndefined();
  });

  test('rejects sockets without send before connecting heartbeat', () => {
    const ws = {
      readyState: 1,
      once: jest.fn(),
    };

    expect(() => manager.setDashboardWs(ws)).toThrow('dashboard WebSocket must expose send method');
    expect(manager.dashboardWs).toBeUndefined();
    expect(manager.dashboardHeartbeatInterval).toBeNull();
  });

  test('rejects closed sockets before connecting heartbeat', () => {
    const sent = [];
    const ws = {
      readyState: 3,
      send: payload => sent.push(JSON.parse(payload)),
      once: jest.fn(),
    };

    expect(() => manager.setDashboardWs(ws)).toThrow('dashboard WebSocket must be open; readyState=3');
    expect(sent).toHaveLength(0);
    expect(manager.dashboardWs).toBeUndefined();
    expect(manager.dashboardHeartbeatInterval).toBeNull();
  });

  test('logs skipped state_update when an assigned dashboard socket is no longer open', () => {
    const ws = {
      readyState: 3,
      send: jest.fn(),
    };
    manager.dashboardWs = ws;

    expect(manager.broadcastToDashboard({ balance: 1 }, { source: 'unit' })).toBe(false);

    expect(ws.send).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[StateManager] state_update skipped; dashboard socket not open:',
      3
    );
  });

  test('logs notify broadcast failures without blocking state listeners', () => {
    const listener = jest.fn();
    manager.addListener(listener);
    manager.broadcastToDashboard = jest.fn(() => {
      throw new Error('forced notify failure');
    });

    expect(() => manager.notifyListeners({ balance: 1 }, { source: 'unit' })).not.toThrow();

    expect(listener).toHaveBeenCalledWith(
      { balance: 1 },
      { source: 'unit' },
      expect.objectContaining({ balance: manager.state.balance })
    );
    expect(console.warn).toHaveBeenCalledWith(
      '[StateManager] state_update broadcast notification failed:',
      'forced notify failure'
    );
  });
});
