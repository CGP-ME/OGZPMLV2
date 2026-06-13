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
    process.env.BROKER = 'alpaca';
    process.env.ALPACA_MODE = 'paper';
    process.env.MAX_WEEKLY_LOSS = '10';
    process.env.MAX_MONTHLY_LOSS = '20';
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

  test('refuses persisted active trades with positive USD exposure but zero broker quantity', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 287.742144686715,
      inPosition: 287.742144686715,
      activeTrades: [[
        'SIM_ZERO_QTY',
        {
          id: 'SIM_ZERO_QTY',
          orderId: 'SIM_ZERO_QTY',
          action: 'BUY',
          direction: 'long',
          status: 'open',
          symbol: 'TSLA',
          brokerId: 'alpaca',
          accountId: 'acct-main',
          accountIdSource: 'config',
          assetClass: 'stocks',
          executionMode: 'paper',
          timeframe: '15m',
          scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
          sizeUsd: 287.742144686715,
          size: 287.742144686715,
          entryPrice: 420.93036,
          entryOrderQuantity: 0,
          entryOrderQuantityUnit: 'shares',
          remainingOrderQuantity: 0,
          remainingOrderQuantityUnit: 'shares',
          entryStrategy: 'EMASMACrossover',
        },
      ]],
      lastPrices: { TSLA: 417.36 },
      isTrading: false,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');

    expect(() => new StateManager()).toThrow('Active trade quantity invariant failed');
  });

  test('refuses persisted activeTrades with unsupported container shape', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: {
        BAD_CONTAINER_TRADE: {
          id: 'BAD_CONTAINER_TRADE',
          orderId: 'BAD_CONTAINER_TRADE',
          action: 'BUY',
          symbol: 'TSLA',
          brokerId: 'alpaca',
          accountId: 'acct-main',
          assetClass: 'stocks',
          executionMode: 'paper',
          timeframe: '15m',
          sizeUsd: 500,
          size: 500,
          entryOrderQuantity: 5,
          entryOrderQuantityUnit: 'shares',
          remainingOrderQuantity: 5,
          remainingOrderQuantityUnit: 'shares',
        },
      },
      isTrading: false,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');

    expect(() => new StateManager()).toThrow('activeTrades container invariant failed');
  });

  test('partial reduction keeps remaining broker order quantity in sync', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    await manager.openPosition(500, 100, {
      orderId: 'BUY_1',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'live',
      timeframe: '15m',
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
    });

    const result = await manager.reducePosition('BUY_1', 0.4, 125, {
      orderId: 'BUY_1',
      exitReason: 'tier_exit',
      orderQuantity: 2,
      quantityUnit: 'shares',
    });

    expect(result.success).toBe(true);
    const trade = manager.get('activeTrades').get('BUY_1');
    expect(trade.sizeUsd).toBeCloseTo(300);
    expect(trade.size).toBeCloseTo(300);
    expect(trade.remainingOrderQuantity).toBe(3);
    expect(trade.remainingOrderQuantityUnit).toBe('shares');
  });

  test('short partial reduction lowers locked USD exposure', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const opened = await manager.openPosition(1200, 400, {
      orderId: 'SHORT_1',
      action: 'SELL_SHORT',
      direction: 'short',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 3,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 3,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);
    expect(manager.get('position')).toBeCloseTo(-1200);
    expect(manager.get('inPosition')).toBeCloseTo(1200);

    const reduced = await manager.reducePosition('SHORT_1', 0.25, 390, {
      orderId: 'SHORT_1',
      exitReason: 'tier_exit',
      orderQuantity: 0.75,
      quantityUnit: 'shares',
    });

    expect(reduced.success).toBe(true);
    expect(manager.get('position')).toBeCloseTo(-900);
    expect(manager.get('inPosition')).toBeCloseTo(900);
    const trade = manager.get('activeTrades').get('SHORT_1');
    expect(trade.sizeUsd).toBeCloseTo(900);
    expect(trade.remainingOrderQuantity).toBeCloseTo(2.25);
  });

  test('failed open does not add active trade before locked state update succeeds', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    manager.validateUpdates = jest.fn(() => {
      throw new Error('forced open validation failure');
    });

    const opened = await manager.openPosition(1200, 400, {
      orderId: 'OPEN_ATOMIC_1',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 3,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 3,
      remainingOrderQuantityUnit: 'shares',
    });

    expect(opened.success).toBe(false);
    expect(opened.error).toContain('forced open validation failure');
    expect(manager.get('activeTrades').has('OPEN_ATOMIC_1')).toBe(false);
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('tradeCount')).toBe(0);
    expect(manager.get('dailyTradeCount')).toBe(0);
  });

  test('failed full close does not delete active trade before locked state update succeeds', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const opened = await manager.openPosition(1200, 400, {
      orderId: 'CLOSE_ATOMIC_1',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 3,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 3,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);

    manager.validateUpdates = jest.fn(() => {
      throw new Error('forced close validation failure');
    });

    const closed = await manager.closePosition(410, false, null, {
      tradeId: 'CLOSE_ATOMIC_1',
      orderId: 'CLOSE_ATOMIC_1',
      exitReason: 'forced_failure',
    });

    expect(closed.success).toBe(false);
    expect(closed.error).toContain('forced close validation failure');
    expect(manager.get('activeTrades').has('CLOSE_ATOMIC_1')).toBe(true);
    expect(manager.get('activeTrades').size).toBe(1);
    expect(manager.get('position')).toBeCloseTo(1200);
    expect(manager.get('inPosition')).toBeCloseTo(1200);
    expect(manager.get('closedTrades')).toHaveLength(0);
  });

  test('full close preserves missing exit metadata as null instead of fabricated labels', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const opened = await manager.openPosition(500, 100, {
      orderId: 'CLOSE_NULL_META',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);

    const trade = manager.get('activeTrades').get('CLOSE_NULL_META');
    delete trade.entryStrategy;
    delete trade.strategy;
    trade.entryTime = 0;
    delete trade.timestamp;
    trade.decisionLedger = { tradeId: 'CLOSE_NULL_META', exits: [] };

    const closed = await manager.closePosition(110, false, null, {
      tradeId: 'CLOSE_NULL_META',
      orderId: 'CLOSE_NULL_META',
    });

    expect(closed.success).toBe(true);
    const [closedTrade] = manager.get('closedTrades');
    expect(closedTrade.strategy).toBeNull();
    expect(closedTrade.holdMs).toBeNull();
  });

  test('failed partial reduce does not shrink active trade before locked state update succeeds', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const opened = await manager.openPosition(1000, 100, {
      orderId: 'REDUCE_ATOMIC_1',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 10,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 10,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);

    manager.validateUpdates = jest.fn(() => {
      throw new Error('forced reduce validation failure');
    });

    const reduced = await manager.reducePosition('REDUCE_ATOMIC_1', 0.4, 110, {
      orderId: 'REDUCE_ATOMIC_1',
      exitReason: 'forced_failure',
      orderQuantity: 4,
      quantityUnit: 'shares',
    });

    expect(reduced.success).toBe(false);
    expect(reduced.error).toContain('forced reduce validation failure');
    const trade = manager.get('activeTrades').get('REDUCE_ATOMIC_1');
    expect(trade.sizeUsd).toBeCloseTo(1000);
    expect(trade.size).toBeCloseTo(1000);
    expect(trade.remainingOrderQuantity).toBeCloseTo(10);
    expect(trade.decisionLedger?.exits || []).toHaveLength(0);
    expect(manager.get('position')).toBeCloseTo(1000);
    expect(manager.get('inPosition')).toBeCloseTo(1000);
  });

  test('partial reduce preserves missing exit reason as null in decision ledger', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const opened = await manager.openPosition(500, 100, {
      orderId: 'REDUCE_NULL_REASON',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);

    const trade = manager.get('activeTrades').get('REDUCE_NULL_REASON');
    trade.decisionLedger = { tradeId: 'REDUCE_NULL_REASON', exits: [] };

    const reduced = await manager.reducePosition('REDUCE_NULL_REASON', 0.4, 110, {
      orderId: 'REDUCE_NULL_REASON',
      orderQuantity: 2,
      quantityUnit: 'shares',
    });

    expect(reduced.success).toBe(true);
    const reducedTrade = manager.get('activeTrades').get('REDUCE_NULL_REASON');
    expect(reducedTrade.decisionLedger.exits).toHaveLength(1);
    expect(reducedTrade.decisionLedger.exits[0].exitReason).toBeNull();
  });

  test('full close clears stale locked USD exposure when no active trades remain', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const opened = await manager.openPosition(1200, 400, {
      orderId: 'SHORT_STALE',
      action: 'SELL_SHORT',
      direction: 'short',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      entryOrderQuantity: 3,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 3,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);
    manager.set('inPosition', 1918.7714832796617);

    const closed = await manager.closePosition(390, false, null, {
      tradeId: 'SHORT_STALE',
      orderId: 'SHORT_STALE',
      exitReason: 'full_exit',
    });

    expect(closed.success).toBe(true);
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('positionCount')).toBe(0);
    expect(manager.get('entryPrice')).toBe(0);
    expect(manager.get('entryTime')).toBeNull();
  });

  test('load clears flat-state stale locked USD exposure and persists the repair', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 0,
      positionCount: 3,
      entryPrice: 391.35,
      entryTime: Date.parse('2026-06-05T14:10:00.000Z'),
      inPosition: 1918.7714832796617,
      activeTrades: [],
      lastPrices: { TSLA: 390.09 },
      isTrading: true,
      recoveryMode: false,
      pauseReason: null,
      lastError: null,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.validateState().valid).toBe(true);

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(saved.inPosition).toBe(0);
    expect(saved.position).toBe(0);
    expect(saved.positionCount).toBe(0);
    expect(saved.entryPrice).toBe(0);
    expect(saved.entryTime).toBeNull();
    expect(saved.activeTrades).toEqual([]);
  });

  test('load refuses source-less scalar exposure when active trades are empty', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 0.001,
      positionCount: 1,
      entryPrice: 391.35,
      entryTime: Date.parse('2026-06-05T14:10:00.000Z'),
      inPosition: 1234.56,
      activeTrades: [],
      lastPrices: { TSLA: 390.09 },
      isTrading: true,
      recoveryMode: false,
      pauseReason: null,
      lastError: null,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');

    expect(() => new StateManager()).toThrow('Source-less position exposure');
  });

  test('recoverable data-feed pause resumes only from the matching owner', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    await manager.pauseTrading('Liveness watchdog: brokerSilent=true activeTimeframeSilent=false, backfill failed', {
      source: 'data_feed_liveness',
      recoverable: true,
      scope: {
        symbol: 'BTC-USD',
        timeframe: '1m',
        brokerId: 'kraken',
        accountId: 'default',
        assetClass: 'crypto',
        executionMode: 'paper',
      },
    });

    const wrongScope = await manager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope: {
        symbol: 'TSLA',
        timeframe: '1m',
        brokerId: 'kraken',
        accountId: 'default',
        assetClass: 'crypto',
        executionMode: 'paper',
      },
    });
    expect(wrongScope.resumed).toBe(false);
    expect(wrongScope.reason).toBe('pause_scope_mismatch');
    expect(manager.get('isTrading')).toBe(false);

    const recovered = await manager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope: {
        symbol: 'XBT/USD',
        timeframe: '1m',
        brokerId: 'kraken',
        accountId: 'default',
        assetClass: 'crypto',
        executionMode: 'paper',
      },
      reason: 'fresh candle restored data feed',
      resumeSource: 'data_feed_liveness',
    });

    expect(recovered).toEqual(expect.objectContaining({ success: true, resumed: true }));
    expect(manager.get('isTrading')).toBe(true);
    expect(manager.get('pauseReason')).toBeNull();
    expect(manager.get('pauseSource')).toBeNull();
  });

  test('manual pause is not resumed by data-feed recovery', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    await manager.pauseTrading('operator manual pause');

    const result = await manager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope: { symbol: 'BTC-USD', timeframe: '1m' },
      legacyReasonPrefixes: ['Liveness watchdog:'],
    });

    expect(result.resumed).toBe(false);
    expect(result.reason).toBe('pause_source_mismatch');
    expect(manager.get('isTrading')).toBe(false);
    expect(manager.get('pauseReason')).toBe('operator manual pause');
  });

  test('matching pause source still requires recoverable flag', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    await manager.pauseTrading('operator supplied data-feed source but did not mark recoverable', {
      source: 'data_feed_liveness',
      recoverable: false,
      scope: { symbol: 'BTC-USD', timeframe: '1m' },
    });

    const result = await manager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope: { symbol: 'BTC-USD', timeframe: '1m' },
    });

    expect(result.resumed).toBe(false);
    expect(result.reason).toBe('pause_not_recoverable');
    expect(manager.get('isTrading')).toBe(false);
  });

  test('recoverable pause with incomplete stored scope does not resume from arbitrary candle', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    await manager.pauseTrading('Liveness watchdog: missing symbol/timeframe', {
      source: 'data_feed_liveness',
      recoverable: true,
      scope: { symbol: null, timeframe: '1m', brokerId: 'kraken' },
    });

    const result = await manager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope: { symbol: 'BTC-USD', timeframe: '1m', brokerId: 'kraken' },
    });

    expect(result.resumed).toBe(false);
    expect(result.reason).toBe('pause_scope_mismatch');
    expect(manager.get('isTrading')).toBe(false);
  });

  test('legacy liveness pause without metadata requires explicit recovery opt-in', async () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      isTrading: false,
      pauseReason: 'Liveness watchdog: brokerSilent=true activeTimeframeSilent=false, backfill failed',
      lastError: 'Liveness watchdog: brokerSilent=true activeTimeframeSilent=false, backfill failed',
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const blocked = await manager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope: { symbol: 'BTC-USD', timeframe: '1m' },
      legacyReasonPrefixes: ['Liveness watchdog:'],
      reason: 'fresh candle restored legacy liveness pause',
    });
    expect(blocked.resumed).toBe(false);
    expect(blocked.reason).toBe('pause_source_mismatch');
    expect(manager.get('isTrading')).toBe(false);

    const result = await manager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope: { symbol: 'BTC-USD', timeframe: '1m' },
      legacyReasonPrefixes: ['Liveness watchdog:'],
      allowLegacyUnscoped: true,
      reason: 'fresh candle restored legacy liveness pause',
    });

    expect(result).toEqual(expect.objectContaining({ success: true, resumed: true }));
    expect(manager.get('isTrading')).toBe(true);
    expect(manager.get('pauseReason')).toBeNull();
  });
});
