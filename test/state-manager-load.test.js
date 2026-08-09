'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('StateManager load validation', () => {
  let originalEnv;
  let tempDir;
  let stateFile;

  const exitContract = {
    stopLossPercent: -0.5,
    takeProfitPercent: 1,
    useStructuralExits: false,
  };

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-state-load-'));
    stateFile = path.join(tempDir, 'state.json');
    process.env.STATE_FILE = stateFile;
    process.env.DATA_DIR = tempDir;
    process.env.BACKTEST_MODE = 'false';
    process.env.EXECUTION_MODE = 'paper';
    process.env.LIVE_TRADING = 'false';
    process.env.PAPER_TRADING = 'true';
    process.env.CANDLE_SOURCE = 'live';
    process.env.FRESH_START = 'false';
    process.env.BROKER = 'alpaca';
    process.env.ALPACA_MODE = 'paper';
    process.env.MIN_TRADE_CONFIDENCE = '0.5';
    process.env.MAX_WEEKLY_LOSS = '10';
    process.env.MAX_MONTHLY_LOSS = '20';
    process.env.TTP_ACCOUNT_START_OF_DAY_DATE = '2026-06-26';
    process.env.TTP_ACCOUNT_START_OF_DAY_EQUITY = '50000';
    process.env.TTP_DAILY_LOSS_LIMIT_DOLLARS = '500';
    process.env.TTP_MAX_LOSS_THRESHOLD_EQUITY = '47500';
    process.env.TTP_PROFIT_TARGET_DOLLARS = '100';
  });

  afterEach(() => {
    try {
      require('../foundation/ConfigLoader').clearOverrides();
      require('../foundation/ConfigLoader')._resetForTest();
    } catch (_) {}
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

  test('load clears persisted data-feed liveness pause with stale missing scope', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      isTrading: false,
      pauseReason: 'Liveness watchdog: missing symbol/timeframe',
      lastError: 'Liveness watchdog: missing symbol/timeframe',
      pauseSource: 'data_feed_liveness',
      pauseRecoverable: true,
      pauseScope: {
        symbol: null,
        timeframe: '1m',
        brokerId: 'kraken',
        accountId: null,
        assetClass: null,
        executionMode: null,
      },
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('isTrading')).toBe(true);
    expect(manager.get('pauseReason')).toBeNull();
    expect(manager.get('lastError')).toBeNull();
    expect(manager.get('pauseSource')).toBeNull();
    expect(manager.get('pauseScope')).toBeNull();
  });

  test('load drops persisted symbol cooldown halt and streak when cooldown is disabled', () => {
    process.env.SYMBOL_LOSS_COOLDOWN_ENABLED = 'false';
    const now = Date.now();
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      isTrading: true,
      symbolEntryHalts: {
        TSLA: {
          reason: 'symbol_cooldown: TSLA 2 consecutive losses',
          code: 'symbol_cooldown',
          haltedAt: now - 1000,
          expiresAt: now + 3600000,
          consecutiveLosses: 2,
        },
      },
      symbolLossStreaks: {
        TSLA: {
          consecutiveLosses: 2,
          lastClosedAt: now - 1000,
          lastPnl: -5,
        },
      },
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.isSymbolHalted('TSLA')).toBe(false);
    expect(manager.get('symbolEntryHalts')).toEqual({});
    expect(manager.get('symbolLossStreaks')).toEqual({});

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(saved.symbolEntryHalts).toEqual({});
    expect(saved.symbolLossStreaks).toEqual({});
  });

  test('load drops legacy symbol cooldown halt without code when cooldown is disabled', () => {
    process.env.SYMBOL_LOSS_COOLDOWN_ENABLED = 'false';
    const now = Date.now();
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      isTrading: true,
      symbolEntryHalts: {
        TSLA: {
          reason: 'symbol_cooldown: TSLA 2 consecutive losses',
          haltedAt: now - 1000,
          expiresAt: now + 3600000,
          consecutiveLosses: 2,
        },
      },
      symbolLossStreaks: {},
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.isSymbolHalted('TSLA')).toBe(false);
    expect(manager.get('symbolEntryHalts')).toEqual({});

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(saved.symbolEntryHalts).toEqual({});
  });

  test('load drops legacy symbol cooldown halt with mixed-case marker when cooldown is disabled', () => {
    process.env.SYMBOL_LOSS_COOLDOWN_ENABLED = 'false';
    const now = Date.now();
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      isTrading: true,
      symbolEntryHalts: {
        TSLA: {
          reason: 'Symbol_Cooldown: TSLA 2 consecutive losses',
          code: 'SYMBOL_COOLDOWN',
          haltedAt: now - 1000,
          expiresAt: now + 3600000,
          consecutiveLosses: 2,
        },
      },
      symbolLossStreaks: {},
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.isSymbolHalted('TSLA')).toBe(false);
    expect(manager.get('symbolEntryHalts')).toEqual({});
  });

  test('load drops legacy symbol cooldown halt with spaced reason marker when cooldown is disabled', () => {
    process.env.SYMBOL_LOSS_COOLDOWN_ENABLED = 'false';
    const now = Date.now();
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      isTrading: true,
      symbolEntryHalts: {
        TSLA: {
          reason: 'symbol_cooldown : TSLA 2 consecutive losses',
          haltedAt: now - 1000,
          expiresAt: now + 3600000,
          consecutiveLosses: 2,
        },
      },
      symbolLossStreaks: {},
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.isSymbolHalted('TSLA')).toBe(false);
    expect(manager.get('symbolEntryHalts')).toEqual({});
  });

  test('load honors ConfigLoader override disabling cooldown over cached enabled snapshot', () => {
    process.env.SYMBOL_LOSS_COOLDOWN_ENABLED = 'true';
    process.env.SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES = '2';
    process.env.SYMBOL_LOSS_COOLDOWN_MINUTES = '120';
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.load({ force: true, silent: true });
    ConfigLoader.setOverrides({
      entryLogic: {
        symbolLossCooldown: {
          enabled: false,
          consecutiveLosses: 2,
          cooldownMinutes: 120,
        },
      },
    });

    const now = Date.now();
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      isTrading: true,
      symbolEntryHalts: {
        TSLA: {
          reason: 'symbol_cooldown: TSLA 2 consecutive losses',
          code: 'symbol_cooldown',
          haltedAt: now - 1000,
          expiresAt: now + 3600000,
          consecutiveLosses: 2,
        },
      },
      symbolLossStreaks: {
        TSLA: {
          consecutiveLosses: 2,
          lastClosedAt: now - 1000,
          lastPnl: -5,
        },
      },
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.isSymbolHalted('TSLA')).toBe(false);
    expect(manager.get('symbolEntryHalts')).toEqual({});
    expect(manager.get('symbolLossStreaks')).toEqual({});
  });

  test('load drops unauthorized symbol halt codes from persisted state', () => {
    const now = Date.now();
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      isTrading: true,
      symbolEntryHalts: {
        TSLA: {
          reason: 'unauthorized stale halt from disk',
          code: 'legacy_hidden_block',
          haltedAt: now - 1000,
          expiresAt: now + 3600000,
        },
      },
      symbolLossStreaks: {},
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.isSymbolHalted('TSLA')).toBe(false);
    expect(manager.get('symbolEntryHalts')).toEqual({});
  });

  test('load preserves exit-rail broker desync halt authority metadata', () => {
    const now = Date.now();
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      activeTrades: [],
      position: 0,
      inPosition: 0,
      isTrading: true,
      symbolEntryHalts: {
        NVDA: {
          reason: 'EXIT-RAIL: broker position still open after confirmed full exit for NVDA',
          code: 'exit_rail_broker_desync',
          authority: 'financial_integrity',
          financialIntegrityCritical: true,
          entryBlockScope: 'symbol',
          operatorActionRequired: true,
          tradeId: 'NVDA_EXIT_DESYNC_1',
          brokerPositionSize: 2,
          flattenAttempted: true,
          flattenOrderId: 'FLATTEN_NVDA_1',
          haltedAt: String(now - 2000),
          expiresAt: null,
        },
      },
      symbolLossStreaks: {},
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.isSymbolHalted('NVDA')).toBe(true);
    expect(manager.get('symbolEntryHalts').NVDA).toEqual(expect.objectContaining({
      code: 'exit_rail_broker_desync',
      authority: 'financial_integrity',
      financialIntegrityCritical: true,
      entryBlockScope: 'symbol',
      operatorActionRequired: true,
      tradeId: 'NVDA_EXIT_DESYNC_1',
      brokerPositionSize: 2,
      flattenAttempted: true,
      flattenOrderId: 'FLATTEN_NVDA_1',
    }));
  });

  test('fresh state initializer applies explicit starting balance and clears exposure', () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    manager.set('balance', 10000);
    manager.set('totalBalance', 10000);
    manager.set('initialBalance', 10000);
    manager.set('position', 500);
    manager.set('inPosition', 500);
    manager.set('activeTrades', new Map([[
      'OPEN_1',
      {
        id: 'OPEN_1',
        orderId: 'OPEN_1',
        action: 'BUY',
        direction: 'long',
        symbol: 'TSLA',
        brokerId: 'alpaca',
        accountId: 'acct-main',
        assetClass: 'stocks',
        executionMode: 'backtest',
        timeframe: '15m',
        sizeUsd: 500,
        size: 500,
        entryOrderQuantity: 1,
        entryOrderQuantityUnit: 'shares',
        remainingOrderQuantity: 1,
        remainingOrderQuantityUnit: 'shares',
      },
    ]]));

    const result = manager.initializeFreshState(5000, { source: 'test' });

    expect(result.success).toBe(true);
    expect(manager.get('balance')).toBe(5000);
    expect(manager.get('totalBalance')).toBe(5000);
    expect(manager.get('initialBalance')).toBe(5000);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('activeTrades')).toBeInstanceOf(Map);
    expect(manager.get('activeTrades').size).toBe(0);
  });

  test('save identity refusal persists last-good state with direction halt instead of throwing', async () => {
    const goodTrade = {
      id: 'GOOD_LONG',
      orderId: 'GOOD_LONG',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      sizeUsd: 500,
      size: 500,
      entryPrice: 100,
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
      entryTime: Date.now() - 60000,
      exitContract,
    };
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      initialBalance: 10000,
      position: 500,
      inPosition: 500,
      activeTrades: [['GOOD_LONG', goodTrade]],
      lastPrices: { TSLA: 100 },
      lastPriceTimes: { TSLA: 1000 },
      isTrading: true,
      symbolEntryHalts: {},
      symbolLossStreaks: {},
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();
    manager.state.activeTrades.set('BAD_DIRECTION', {
      ...goodTrade,
      id: 'BAD_DIRECTION',
      orderId: 'BAD_DIRECTION',
      direction: 'short',
    });

    expect(() => manager.save()).not.toThrow();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(saved.activeTrades.map(([tradeId]) => tradeId)).toEqual(['GOOD_LONG']);
    expect(saved.quarantinedTrades).toEqual([
      expect.objectContaining({
        tradeId: 'BAD_DIRECTION',
        symbol: 'TSLA',
        code: 'direction_integrity_exit_refusal',
        status: 'quarantined',
        source: 'StateManager.save',
      }),
    ]);
    expect(saved.symbolEntryHalts.TSLA).toEqual(expect.objectContaining({
      code: 'direction_integrity_exit_refusal',
      authority: 'financial_integrity',
      operatorActionRequired: true,
      tradeId: 'BAD_DIRECTION',
    }));
    expect(manager.getSymbolHaltCode('TSLA')).toBe('direction_integrity_exit_refusal');
  });

  test('last price updates reject older event timestamps', () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.updateLastPrice('TSLA', 101, 2000)).toBe(true);
    expect(manager.getLastPrice('TSLA')).toBe(101);

    expect(manager.updateLastPrice('TSLA', 95, 1500)).toBe(false);
    expect(manager.getLastPrice('TSLA')).toBe(101);

    expect(manager.updateLastPrice('TSLA', 102, 2500)).toBe(true);
    expect(manager.getLastPrice('TSLA')).toBe(102);
    expect(manager.get('lastPriceTimes').get('TSLA')).toBe(2500);
  });

  test('fresh state initializer refuses missing or invalid starting balance', () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(() => manager.initializeFreshState(0)).toThrow(/positive finite initialBalance/);
    expect(() => manager.initializeFreshState(Number.NaN)).toThrow(/positive finite initialBalance/);
  });

  test('FRESH_START uses explicit INITIAL_BALANCE instead of hardcoded 10000', () => {
    jest.resetModules();
    process.env.FRESH_START = 'true';
    process.env.INITIAL_BALANCE = '5000';

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('balance')).toBe(5000);
    expect(manager.get('totalBalance')).toBe(5000);
    expect(manager.get('initialBalance')).toBe(5000);

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(saved.balance).toBe(5000);
    expect(saved.totalBalance).toBe(5000);
    expect(saved.initialBalance).toBe(5000);
  });

  test('FRESH_START refuses default initial balance', () => {
    jest.resetModules();
    process.env.FRESH_START = 'true';
    delete process.env.INITIAL_BALANCE;

    const { StateManager } = require('../core/StateManager');

    expect(() => new StateManager()).toThrow(/FRESH_START=true requires explicit INITIAL_BALANCE/);
  });

  test('BACKTEST_MODE uses explicit INITIAL_BALANCE instead of constructor bootstrap', () => {
    jest.resetModules();
    process.env.PROFILE = 'backtest-all';
    process.env.BACKTEST_MODE = 'true';
    process.env.EXECUTION_MODE = 'backtest';
    process.env.INITIAL_BALANCE = '5000';

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('balance')).toBe(5000);
    expect(manager.get('totalBalance')).toBe(5000);
    expect(manager.get('initialBalance')).toBe(5000);
    expect(manager.get('activeTrades')).toBeInstanceOf(Map);
    expect(manager.get('activeTrades').size).toBe(0);
  });

  test('BACKTEST_MODE refuses default initial balance', () => {
    jest.resetModules();
    process.env.PROFILE = 'backtest-all';
    process.env.BACKTEST_MODE = 'true';
    process.env.EXECUTION_MODE = 'backtest';
    delete process.env.INITIAL_BALANCE;

    const { StateManager } = require('../core/StateManager');

    expect(() => new StateManager()).toThrow(/BACKTEST_MODE=true requires explicit INITIAL_BALANCE/);
  });

  test('quarantines persisted active trades with positive USD exposure but zero broker quantity', () => {
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

    const manager = new StateManager();

    expect(manager.get('activeTrades').has('SIM_ZERO_QTY')).toBe(false);
    expect(manager.get('quarantinedTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'SIM_ZERO_QTY',
        symbol: 'TSLA',
        code: 'direction_integrity_exit_refusal',
        status: 'quarantined',
        source: 'StateManager.load',
        issues: expect.arrayContaining([
          expect.stringContaining('invalid remainingOrderQuantity=0'),
        ]),
      }),
    ]);
    expect(manager.getSymbolHaltCode('TSLA')).toBe('direction_integrity_exit_refusal');
  });

  test('quarantines persisted activeTrades with unsupported record shape', () => {
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

    const manager = new StateManager();

    expect(manager.get('activeTrades').has('BAD_CONTAINER_TRADE')).toBe(false);
    expect(manager.get('quarantinedTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'BAD_CONTAINER_TRADE',
        symbol: 'TSLA',
        code: 'direction_integrity_exit_refusal',
        status: 'quarantined',
        source: 'StateManager.load',
        issues: expect.arrayContaining([
          expect.stringContaining('missing direction'),
        ]),
      }),
    ]);
    expect(manager.getSymbolHaltCode('TSLA')).toBe('direction_integrity_exit_refusal');
  });

  test('quarantines persisted active trades with malformed immutable identity while clean trades boot', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 500,
      inPosition: 500,
      activeTrades: [
        [
          'BAD_IDENTITY_1',
          {
          id: 'BAD_IDENTITY_1',
          orderId: 'BAD_IDENTITY_1',
          action: 'BUY',
          direction: ' short ',
          status: 'open',
          symbol: 'TSLA',
          brokerId: 'alpaca',
          accountId: 'acct-main',
          accountIdSource: 'config',
          assetClass: 'stocks',
          executionMode: 'paper',
          timeframe: '15m',
          scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
          sizeUsd: 500,
          size: 500,
          entryPrice: 100,
          entryOrderQuantity: 5,
          entryOrderQuantityUnit: 'shares',
          remainingOrderQuantity: 5,
          remainingOrderQuantityUnit: 'shares',
          entryStrategy: 'LoadIdentityStrategy',
          },
        ],
        [
          'CLEAN_IDENTITY_1',
          {
            id: 'CLEAN_IDENTITY_1',
            orderId: 'CLEAN_IDENTITY_1',
            action: 'BUY',
            direction: 'long',
            status: 'open',
            symbol: 'MSFT',
            brokerId: 'alpaca',
            accountId: 'acct-main',
            accountIdSource: 'config',
            assetClass: 'stocks',
            executionMode: 'paper',
            timeframe: '15m',
            scopeKey: 'paper:alpaca:acct-main:stocks:MSFT:15m',
            sizeUsd: 300,
            size: 300,
            entryPrice: 100,
            entryOrderQuantity: 3,
            entryOrderQuantityUnit: 'shares',
            remainingOrderQuantity: 3,
            remainingOrderQuantityUnit: 'shares',
            entryStrategy: 'LoadIdentityStrategy',
          },
        ],
      ],
      lastPrices: { TSLA: 100, MSFT: 110 },
      isTrading: false,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('activeTrades').has('BAD_IDENTITY_1')).toBe(false);
    expect(manager.get('activeTrades').has('CLEAN_IDENTITY_1')).toBe(true);
    expect(manager.getSymbolHaltCode('TSLA')).toBe('direction_integrity_exit_refusal');
    expect(manager.getSymbolHaltCode('MSFT')).toBeNull();
    expect(manager.get('quarantinedTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'BAD_IDENTITY_1',
        symbol: 'TSLA',
        code: 'direction_integrity_exit_refusal',
        status: 'quarantined',
        source: 'StateManager.load',
        issues: expect.arrayContaining([
          expect.stringContaining('invalid direction= short '),
        ]),
      }),
    ]);
    expect(manager.getEquity(110)).toBe(10000 + 300 * 0.1);
  });

  test('loads legacy active trades with explicit unknown lifecycle state', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 500,
      inPosition: 500,
      activeTrades: [[
        'LEGACY_LIFECYCLE_1',
        {
          id: 'LEGACY_LIFECYCLE_1',
          orderId: 'LEGACY_LIFECYCLE_1',
          action: 'BUY',
          direction: 'long',
          status: 'open',
          symbol: 'TSLA',
          brokerId: 'alpaca',
          accountId: 'acct-main',
          assetClass: 'stocks',
          executionMode: 'paper',
          timeframe: '15m',
          scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
          sizeUsd: 500,
          size: 500,
          entryPrice: 100,
          entryOrderQuantity: 5,
          entryOrderQuantityUnit: 'shares',
          remainingOrderQuantity: 5,
          remainingOrderQuantityUnit: 'shares',
          entryStrategy: 'LegacyLifecycleStrategy',
        },
      ]],
      lastPrices: { TSLA: 100 },
      isTrading: false,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();
    const trade = manager.get('activeTrades').get('LEGACY_LIFECYCLE_1');

    expect(trade.tradeRevision).toBe(0);
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.beScaleOutState).toEqual({
      status: 'unknown_legacy',
      intentId: null,
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
    });
    expect(trade.tierStates).toEqual([]);
  });

  test('preserves persisted active trade lifecycle state on load', () => {
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 500,
      inPosition: 500,
      activeTrades: [[
        'PERSISTED_LIFECYCLE_1',
        {
          id: 'PERSISTED_LIFECYCLE_1',
          orderId: 'PERSISTED_LIFECYCLE_1',
          action: 'BUY',
          direction: 'long',
          status: 'open',
          symbol: 'TSLA',
          brokerId: 'alpaca',
          accountId: 'acct-main',
          assetClass: 'stocks',
          executionMode: 'paper',
          timeframe: '15m',
          scopeKey: 'paper:alpaca:acct-main:stocks:TSLA:15m',
          sizeUsd: 500,
          size: 500,
          entryPrice: 100,
          entryOrderQuantity: 5,
          entryOrderQuantityUnit: 'shares',
          remainingOrderQuantity: 3,
          remainingOrderQuantityUnit: 'shares',
          entryStrategy: 'PersistedLifecycleStrategy',
          tradeRevision: 4,
          pendingExitIntent: { intentId: 'intent-1', expectedRemainingQuantity: 3 },
          beScaleOutState: {
            status: 'partial',
            intentId: 'be-intent-1',
            targetQuantity: 2,
            filledQuantity: 1,
            brokerOrderIds: ['broker-1'],
          },
          tierStates: [{
            tierIndex: 0,
            status: 'pending',
            targetQuantity: 1,
            filledQuantity: 0,
          }],
        },
      ]],
      lastPrices: { TSLA: 100 },
      isTrading: false,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();
    const trade = manager.get('activeTrades').get('PERSISTED_LIFECYCLE_1');

    expect(trade.tradeRevision).toBe(4);
    expect(trade.pendingExitIntent).toEqual({ intentId: 'intent-1', expectedRemainingQuantity: 3 });
    expect(trade.beScaleOutState).toEqual({
      status: 'partial',
      intentId: 'be-intent-1',
      targetQuantity: 2,
      filledQuantity: 1,
      brokerOrderIds: ['broker-1'],
    });
    expect(trade.tierStates).toEqual([{
      tierIndex: 0,
      status: 'pending',
      targetQuantity: 1,
      filledQuantity: 0,
    }]);
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
      exitContract,
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
      exitContract,
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
      exitContract,
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
      exitContract,
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
      exitContract,
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);

    const trade = manager.state.activeTrades.get('CLOSE_NULL_META');
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

  test('state exit math refuses active trades with missing direction instead of defaulting long', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const opened = await manager.openPosition(500, 100, {
      orderId: 'BAD_DIRECTION_EXIT',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      exitContract,
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);

    const trade = manager.state.activeTrades.get('BAD_DIRECTION_EXIT');
    trade.direction = 'BUY';
    const equity = manager.getEquity(110);

    expect(equity).toBe(manager.get('initialBalance') + manager.get('realizedPnL'));
    expect(manager.get('activeTrades').has('BAD_DIRECTION_EXIT')).toBe(false);
    expect(manager.get('quarantinedTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'BAD_DIRECTION_EXIT',
        symbol: 'TSLA',
        code: 'direction_integrity_exit_refusal',
        status: 'quarantined',
        source: 'StateManager.getEquity',
      }),
    ]);
    expect(manager.get('equityIntegrity')).toEqual(expect.objectContaining({
      status: 'untrusted',
      code: 'direction_integrity_exit_refusal',
      reason: 'active_trade_direction_unknown',
      excludedTrades: [expect.objectContaining({
        tradeId: 'BAD_DIRECTION_EXIT',
        symbol: 'TSLA',
      })],
    }));
    expect(manager.getSymbolHaltCode('TSLA')).toBe('direction_integrity_exit_refusal');

    const closed = await manager.closePosition(110, false, null, {
      tradeId: 'BAD_DIRECTION_EXIT',
      orderId: 'BAD_DIRECTION_EXIT',
    });
    expect(closed).toEqual(expect.objectContaining({
      success: false,
      error: 'No position to close',
    }));
    expect(manager.get('activeTrades').has('BAD_DIRECTION_EXIT')).toBe(false);

    const reduced = await manager.reducePosition('BAD_DIRECTION_EXIT', 0.4, 110, {
      orderId: 'BAD_DIRECTION_EXIT',
      orderQuantity: 2,
      quantityUnit: 'shares',
    });
    expect(reduced).toEqual(expect.objectContaining({
      success: false,
      error: 'Trade BAD_DIRECTION_EXIT not found',
    }));
    expect(manager.get('quarantinedTrades')).toHaveLength(1);
  });

  test('getEquity marks missing initialBalance untrusted instead of throwing through callers', () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();
    manager.state.initialBalance = null;
    manager.state.balance = 7500;
    manager.state.totalBalance = 7600;
    manager.state.realizedPnL = -25;

    expect(() => manager.getEquity(100)).not.toThrow();
    expect(manager.getEquity(100)).toBe(7500);
    expect(manager.get('equityIntegrity')).toEqual(expect.objectContaining({
      status: 'untrusted',
      code: 'equity_initial_balance_missing',
      excludedTrades: [],
      issues: [expect.objectContaining({
        code: 'equity_initial_balance_missing',
        fallbackEquity: 7500,
      })],
    }));
  });

  test('close math quarantines corrupt sibling active trade instead of throwing exposure invariant', async () => {
    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    const openedClean = await manager.openPosition(500, 100, {
      orderId: 'CLOSE_CLEAN_WITH_CORRUPT_SIBLING',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      exitContract,
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(openedClean.success).toBe(true);

    const openedCorrupt = await manager.openPosition(300, 50, {
      orderId: 'CORRUPT_SIBLING_EXPOSURE',
      action: 'BUY',
      direction: 'long',
      entryStrategy: 'LoadTestStrategy',
      symbol: 'MSFT',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      exitContract,
      entryOrderQuantity: 6,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 6,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(openedCorrupt.success).toBe(true);
    manager.state.activeTrades.get('CORRUPT_SIBLING_EXPOSURE').direction = 'BUY';

    await expect(manager.closePosition(110, false, null, {
      tradeId: 'CLOSE_CLEAN_WITH_CORRUPT_SIBLING',
      orderId: 'CLOSE_CLEAN_WITH_CORRUPT_SIBLING',
      orderQuantity: 5,
      quantityUnit: 'shares',
      exitReason: 'clean_close_with_corrupt_sibling',
    })).resolves.toEqual(expect.objectContaining({ success: true }));

    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('quarantinedTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'CORRUPT_SIBLING_EXPOSURE',
        symbol: 'MSFT',
        code: 'direction_integrity_exit_refusal',
        status: 'quarantined',
        source: 'StateManager._getActiveTradeExposureUsd',
      }),
    ]);
    expect(manager.getSymbolHaltCode('MSFT')).toBe('direction_integrity_exit_refusal');
    expect(manager.getSymbolHaltCode('TSLA')).toBeNull();
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
      exitContract,
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
      exitContract,
      entryOrderQuantity: 5,
      entryOrderQuantityUnit: 'shares',
      remainingOrderQuantity: 5,
      remainingOrderQuantityUnit: 'shares',
    });
    expect(opened.success).toBe(true);

    const trade = manager.state.activeTrades.get('REDUCE_NULL_REASON');
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
      exitContract,
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

  test('load quarantines source-less scalar exposure when active trades are empty', () => {
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
    const manager = new StateManager();

    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('positionCount')).toBe(0);
    expect(manager.get('quarantinedTrades')).toEqual([
      expect.objectContaining({
        tradeId: '<source_less_position>',
        symbol: null,
        code: 'direction_integrity_exit_refusal',
        status: 'quarantined',
        source: 'StateManager.load',
        issues: expect.arrayContaining([
          expect.stringContaining('Source-less position exposure quarantined'),
        ]),
      }),
    ]);
  });

  test('load migrates legacy TTP flatness pause to non-blocking quarantine when flat', () => {
    const legacyReason = '[TTP_MARKET_TIME] broker flatness unverified after cutoff date=2026-06-26; manual account reconciliation required before entries resume';
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      inPosition: 0,
      activeTrades: [],
      symbolEntryHalts: {},
      lastPrices: { TSLA: 425.95 },
      isTrading: false,
      pauseReason: legacyReason,
      pauseSource: 'ttp_cutoff_unverified_broker_flatness',
      pauseRecoverable: false,
      pausedAt: Date.parse('2026-06-26T20:00:02.050Z'),
      lastError: legacyReason,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('isTrading')).toBe(true);
    expect(manager.get('pauseReason')).toBeNull();
    expect(manager.get('pauseSource')).toBeNull();
    expect(manager.get('lastError')).toBeNull();
    expect(manager.get('pausedAt')).toBeNull();
    expect(manager.get('ttpCutoffQuarantine')).toEqual(expect.objectContaining({
      source: 'ttp_cutoff_unverified_broker_flatness',
      status: 'quarantined',
      entryBlocking: true,
      manualReconciliationRequired: true,
      requiresManualReconciliation: true,
      brokerFlatVerified: false,
      migratedFromLegacyPause: true,
      legacyPauseRecoverable: false,
      currentDateET: '2026-06-26',
      legacyPauseReason: legacyReason,
      manualReconciliationMessage: legacyReason,
      operatorMessage: legacyReason,
    }));

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    expect(saved.isTrading).toBe(true);
    expect(saved.pauseReason).toBeNull();
    expect(saved.pauseSource).toBeNull();
    expect(saved.ttpCutoffQuarantine.entryBlocking).toBe(true);
    expect(saved.ttpCutoffQuarantine.manualReconciliationMessage).toBe(legacyReason);
  });

  test('load keeps legacy TTP flatness pause blocking when tracked exposure exists', () => {
    const legacyReason = '[TTP_MARKET_TIME] broker flatness unverified after cutoff date=2026-06-26; manual account reconciliation required before entries resume';
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 9500,
      totalBalance: 10000,
      position: 500,
      positionCount: 1,
      entryPrice: 100,
      entryTime: Date.parse('2026-06-26T15:00:00.000Z'),
      inPosition: 500,
      activeTrades: [[
        'OPEN_TTP_1',
        {
          id: 'OPEN_TTP_1',
          orderId: 'OPEN_TTP_1',
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
          sizeUsd: 500,
          size: 500,
          entryPrice: 100,
          entryOrderQuantity: 5,
          entryOrderQuantityUnit: 'shares',
          remainingOrderQuantity: 5,
          remainingOrderQuantityUnit: 'shares',
          entryStrategy: 'LoadTestStrategy',
        },
      ]],
      symbolEntryHalts: {},
      lastPrices: { TSLA: 100 },
      isTrading: false,
      pauseReason: legacyReason,
      pauseSource: 'ttp_cutoff_unverified_broker_flatness',
      pauseRecoverable: false,
      pausedAt: Date.parse('2026-06-26T20:00:02.050Z'),
      lastError: legacyReason,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('isTrading')).toBe(false);
    expect(manager.get('pauseSource')).toBe('ttp_cutoff_unverified_broker_flatness');
    expect(manager.get('ttpCutoffQuarantine')).toBeNull();
    expect(manager.get('activeTrades').size).toBe(1);
  });

  test('load does not migrate recoverable TTP flatness pause variants', () => {
    const legacyReason = '[TTP_MARKET_TIME] broker flatness unverified after cutoff date=2026-06-26; manual account reconciliation required before entries resume';
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      inPosition: 0,
      activeTrades: [],
      symbolEntryHalts: {},
      lastPrices: { TSLA: 425.95 },
      isTrading: false,
      pauseReason: legacyReason,
      pauseSource: 'ttp_cutoff_unverified_broker_flatness',
      pauseRecoverable: true,
      pausedAt: Date.parse('2026-06-26T20:00:02.050Z'),
      lastError: legacyReason,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('isTrading')).toBe(false);
    expect(manager.get('pauseSource')).toBe('ttp_cutoff_unverified_broker_flatness');
    expect(manager.get('pauseRecoverable')).toBe(true);
    expect(manager.get('ttpCutoffQuarantine')).toBeNull();
  });

  test('load migrates legacy TTP flatness pause with persisted whitespace', () => {
    const legacyReason = '[TTP_MARKET_TIME] broker flatness unverified after cutoff date=2026-06-26; manual account reconciliation required before entries resume';
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      inPosition: 0,
      activeTrades: [],
      symbolEntryHalts: {},
      lastPrices: { TSLA: 425.95 },
      isTrading: false,
      pauseReason: ` ${legacyReason} `,
      pauseSource: ' ttp_cutoff_unverified_broker_flatness ',
      pauseRecoverable: false,
      pausedAt: Date.parse('2026-06-26T20:00:02.050Z'),
      lastError: ` ${legacyReason} `,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('isTrading')).toBe(true);
    expect(manager.get('pauseReason')).toBeNull();
    expect(manager.get('pauseSource')).toBeNull();
    expect(manager.get('ttpCutoffQuarantine')).toEqual(expect.objectContaining({
      source: 'ttp_cutoff_unverified_broker_flatness',
      entryBlocking: true,
      manualReconciliationRequired: true,
      legacyPauseReason: ` ${legacyReason} `,
      manualReconciliationMessage: ` ${legacyReason} `,
    }));
  });

  test('load migrates legacy TTP flatness pause when lastError carries the reason', () => {
    const legacyReason = '[TTP_MARKET_TIME] broker flatness unverified after cutoff date=2026-06-26; manual account reconciliation required before entries resume';
    fs.writeFileSync(stateFile, JSON.stringify({
      balance: 10000,
      totalBalance: 10000,
      position: 0,
      positionCount: 0,
      entryPrice: 0,
      entryTime: null,
      inPosition: 0,
      activeTrades: [],
      symbolEntryHalts: {},
      lastPrices: { TSLA: 425.95 },
      isTrading: false,
      pauseReason: null,
      pauseSource: 'ttp_cutoff_unverified_broker_flatness',
      pauseRecoverable: false,
      pausedAt: Date.parse('2026-06-26T20:00:02.050Z'),
      lastError: legacyReason,
      recoveryMode: false,
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const manager = new StateManager();

    expect(manager.get('isTrading')).toBe(true);
    expect(manager.get('pauseReason')).toBeNull();
    expect(manager.get('lastError')).toBeNull();
    expect(manager.get('ttpCutoffQuarantine')).toEqual(expect.objectContaining({
      source: 'ttp_cutoff_unverified_broker_flatness',
      entryBlocking: true,
      manualReconciliationRequired: true,
      legacyPauseReason: legacyReason,
      manualReconciliationMessage: legacyReason,
    }));
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
