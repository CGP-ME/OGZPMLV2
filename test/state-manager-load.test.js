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
