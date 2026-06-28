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
    action: 'BUY',
    direction: 'long',
    entryStrategy: 'ScopeTestStrategy',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'paper',
    timeframe: '15m',
    entryOrderQuantity: 5,
    entryOrderQuantityUnit: 'shares',
    remainingOrderQuantity: 5,
    remainingOrderQuantityUnit: 'shares',
    ...overrides,
  });

  const fullLedgerData = (overrides = {}) => ({
    candleTimestamp: Date.parse('2026-05-29T12:00:00.000Z'),
    strategySignals: [{
      name: 'ScopeTestStrategy',
      direction: 'long',
      baseConfidence: 0.75,
      reason: 'scoped ledger test signal',
    }],
    orchestratorDecision: {
      winnerStrategy: 'ScopeTestStrategy',
      finalConfidence: 0.75,
      reason: 'scoped ledger test decision',
    },
    confluence: {
      count: 1,
      sizingMultiplier: 1,
    },
    positionSizing: {
      basePercent: 0.001,
      confidenceMultiplier: 1,
      confluenceMultiplier: 1,
      finalPercent: 0.001,
      finalSizeUsd: 500,
      formula: 'test',
    },
    exitContract: {
      strategyName: 'ScopeTestStrategy',
      stopLossPercent: -0.5,
      takeProfitPercent: 1,
    },
    riskGates: [],
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
    process.env.LIVE_TRADING = 'false';
    process.env.CONFIRM_LIVE_TRADING = 'false';
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'false';
    process.env.CANDLE_SOURCE = 'live';
    process.env.BROKER = 'alpaca';
    process.env.ALPACA_MODE = 'paper';
    process.env.MAX_WEEKLY_LOSS = '5';
    process.env.MAX_MONTHLY_LOSS = '5';
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
    try {
      require('../core/TradingConfig').clearOverrides();
    } catch (_) {}
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

  test.each([
    ['symbol', { symbol: 'unknown' }],
    ['brokerId', { brokerId: 'undefined' }],
    ['assetClass', { assetClass: 'n/a' }],
    ['executionMode', { executionMode: 'none' }],
    ['timeframe', { timeframe: 'null' }],
  ])('rejects placeholder immutable trade scope field %s before mutating active trades', async (field, override) => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    const result = await manager.openPosition(500, 100, fullScope(override));

    expect(result.success).toBe(false);
    expect(result.scopeRejected).toBe(true);
    expect(result.code).toBe('SCOPE_REJECTED');
    expect(result.invalidFields).toContain(field);
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager._buildScopedDashboardPositions(manager.state)).toEqual(beforePositions);
  });

  test.each([
    ['orderId', { orderId: null }],
    ['action', { action: null }],
    ['direction', { direction: null }],
    ['entryStrategy', { entryStrategy: null }],
  ])('rejects missing immutable entry identity field %s before mutating active trades', async (field, override) => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    const result = await manager.openPosition(500, 100, fullScope(override));

    expect(result.success).toBe(false);
    expect(result.identityRejected).toBe(true);
    expect(result.code).toBe('ENTRY_IDENTITY_REJECTED');
    expect(result.missingFields).toContain(field);
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager._buildScopedDashboardPositions(manager.state)).toEqual(beforePositions);
  });

  test('rejects action and direction mismatch before mutating active trades', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      action: 'BUY',
      direction: 'short',
    }));

    expect(result.success).toBe(false);
    expect(result.identityRejected).toBe(true);
    expect(result.error).toContain('action/direction mismatch');
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
  });

  test('rejects non-positive active trade quantity before mutating active trades', async () => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    const result = await manager.openPosition(500, 100, fullScope({
      entryOrderQuantity: 0,
      remainingOrderQuantity: 0,
    }));

    expect(result.success).toBe(false);
    expect(result.quantityRejected).toBe(true);
    expect(result.code).toBe('ENTRY_QUANTITY_REJECTED');
    expect(result.quantityIssues).toEqual(expect.arrayContaining([
      expect.stringContaining('invalid entryOrderQuantity=0'),
      expect.stringContaining('invalid remainingOrderQuantity=0'),
    ]));
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager._buildScopedDashboardPositions(manager.state)).toEqual(beforePositions);
  });

  test('updateActiveTrade rejects non-positive active trade quantity before mutating active trades', () => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    expect(() => manager.updateActiveTrade('BYPASS_ZERO_QTY', {
      ...fullScope({
        orderId: 'BYPASS_ZERO_QTY',
        entryOrderQuantity: 0,
        remainingOrderQuantity: 0,
      }),
      id: 'BYPASS_ZERO_QTY',
      sizeUsd: 500,
      size: 500,
      entryPrice: 100,
      status: 'open',
    })).toThrow('active trade quantity invariant failed');

    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager._buildScopedDashboardPositions(manager.state)).toEqual(beforePositions);
  });

  test('set rejects malformed activeTrades maps before mutating active trades', () => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    expect(() => manager.set('activeTrades', new Map([[
      'SET_ZERO_QTY',
      {
        ...fullScope({
          orderId: 'SET_ZERO_QTY',
          entryOrderQuantity: 0,
          remainingOrderQuantity: 0,
        }),
        id: 'SET_ZERO_QTY',
        sizeUsd: 500,
        size: 500,
        entryPrice: 100,
        status: 'open',
      },
    ]]))).toThrow('active trade quantity invariant failed');

    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager._buildScopedDashboardPositions(manager.state)).toEqual(beforePositions);
  });

  test('set fills missing active trade lifecycle fields through StateManager normalization', () => {
    manager.set('activeTrades', new Map([[
      'SET_LIFECYCLE_1',
      {
        ...fullScope({
          orderId: 'SET_LIFECYCLE_1',
          scopeKey: expectedScopeKey,
        }),
        id: 'SET_LIFECYCLE_1',
        sizeUsd: 500,
        size: 500,
        entryPrice: 100,
        status: 'open',
      },
    ]]));

    const trade = manager.get('activeTrades').get('SET_LIFECYCLE_1');
    expect(trade.tradeRevision).toBe(0);
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.beScaleOutState).toEqual({
      status: 'idle',
      intentId: null,
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
    });
    expect(trade.tierStates).toEqual([]);
  });

  test('set resets caller-supplied active trade lifecycle fields', () => {
    manager.set('activeTrades', new Map([[
      'SET_LIFECYCLE_OVERRIDE',
      {
        ...fullScope({
          orderId: 'SET_LIFECYCLE_OVERRIDE',
          scopeKey: expectedScopeKey,
        }),
        id: 'SET_LIFECYCLE_OVERRIDE',
        sizeUsd: 500,
        size: 500,
        entryPrice: 100,
        status: 'open',
        tradeRevision: 13,
        pendingExitIntent: { intentId: 'caller-owned' },
        beScaleOutState: {
          status: 'complete',
          intentId: 'caller-owned',
          targetQuantity: 5,
          filledQuantity: 5,
          brokerOrderIds: ['caller-order'],
        },
        tierStates: [{ status: 'complete' }],
      },
    ]]));

    const trade = manager.get('activeTrades').get('SET_LIFECYCLE_OVERRIDE');
    expect(trade.tradeRevision).toBe(0);
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.beScaleOutState).toEqual({
      status: 'idle',
      intentId: null,
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
    });
    expect(trade.tierStates).toEqual([]);
  });

  test('updateActiveTrade resets caller-supplied exit lifecycle fields', () => {
    manager.updateActiveTrade('UPDATE_LIFECYCLE_1', {
      ...fullScope({
        orderId: 'UPDATE_LIFECYCLE_1',
        scopeKey: expectedScopeKey,
      }),
      id: 'UPDATE_LIFECYCLE_1',
      sizeUsd: 500,
      size: 500,
      entryPrice: 100,
      status: 'open',
      tradeRevision: 22,
      pendingExitIntent: { intentId: 'caller-owned' },
      beScaleOutState: {
        status: 'complete',
        intentId: 'caller-owned',
        targetQuantity: 5,
        filledQuantity: 5,
        brokerOrderIds: ['caller-order'],
      },
      tierStates: [{ status: 'complete' }],
    });

    const trade = manager.get('activeTrades').get('UPDATE_LIFECYCLE_1');
    expect(trade.tradeRevision).toBe(0);
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.beScaleOutState).toEqual({
      status: 'idle',
      intentId: null,
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
    });
    expect(trade.tierStates).toEqual([]);
  });

  test('updateActiveTrade preserves existing StateManager-owned lifecycle fields on other trades', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const existingTrade = manager.state.activeTrades.get('OPEN_SCOPE_1');
    existingTrade.tradeRevision = 3;
    existingTrade.pendingExitIntent = { intentId: 'existing-intent' };
    existingTrade.beScaleOutState = {
      status: 'pending',
      intentId: 'existing-be',
      targetQuantity: 2,
      filledQuantity: 1,
      brokerOrderIds: ['existing-order'],
    };
    existingTrade.tierStates = [{ tierIndex: 0, status: 'pending' }];

    manager.updateActiveTrade('UPDATE_LIFECYCLE_2', {
      ...fullScope({
        orderId: 'UPDATE_LIFECYCLE_2',
        scopeKey: expectedScopeKey,
      }),
      id: 'UPDATE_LIFECYCLE_2',
      sizeUsd: 250,
      size: 250,
      entryPrice: 100,
      status: 'open',
    });

    const preservedTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(preservedTrade.tradeRevision).toBe(3);
    expect(preservedTrade.pendingExitIntent).toEqual({ intentId: 'existing-intent' });
    expect(preservedTrade.beScaleOutState).toEqual({
      status: 'pending',
      intentId: 'existing-be',
      targetQuantity: 2,
      filledQuantity: 1,
      brokerOrderIds: ['existing-order'],
    });
    expect(preservedTrade.tierStates).toEqual([{ tierIndex: 0, status: 'pending' }]);
  });

  test('removeActiveTrade preserves StateManager-owned lifecycle fields on remaining trades', () => {
    const keptTrade = {
      ...fullScope({
        orderId: 'KEEP_LIFECYCLE_1',
        scopeKey: expectedScopeKey,
      }),
      id: 'KEEP_LIFECYCLE_1',
      sizeUsd: 500,
      size: 500,
      entryPrice: 100,
      status: 'open',
      tradeRevision: 7,
      pendingExitIntent: { intentId: 'kept-intent' },
      beScaleOutState: {
        status: 'partial',
        intentId: 'kept-be',
        targetQuantity: 3,
        filledQuantity: 1,
        brokerOrderIds: ['kept-order'],
      },
      tierStates: [{ tierIndex: 1, status: 'partial' }],
    };
    const removedTrade = {
      ...fullScope({
        orderId: 'REMOVE_LIFECYCLE_1',
        scopeKey: expectedScopeKey,
      }),
      id: 'REMOVE_LIFECYCLE_1',
      sizeUsd: 250,
      size: 250,
      entryPrice: 100,
      status: 'open',
    };
    manager.state.activeTrades = new Map([
      ['KEEP_LIFECYCLE_1', keptTrade],
      ['REMOVE_LIFECYCLE_1', removedTrade],
    ]);

    manager.removeActiveTrade('REMOVE_LIFECYCLE_1');

    const preservedTrade = manager.getActiveTrade('KEEP_LIFECYCLE_1');
    expect(preservedTrade.tradeRevision).toBe(7);
    expect(preservedTrade.pendingExitIntent).toEqual({ intentId: 'kept-intent' });
    expect(preservedTrade.beScaleOutState).toEqual({
      status: 'partial',
      intentId: 'kept-be',
      targetQuantity: 3,
      filledQuantity: 1,
      brokerOrderIds: ['kept-order'],
    });
    expect(preservedTrade.tierStates).toEqual([{ tierIndex: 1, status: 'partial' }]);
    expect(manager.getActiveTrade('REMOVE_LIFECYCLE_1')).toBeNull();
  });

  test('updateState resets caller-supplied active trade lifecycle fields', async () => {
    await manager.updateState({
      activeTrades: new Map([[
        'UPDATE_LIFECYCLE_OVERRIDE',
        {
          ...fullScope({
            orderId: 'UPDATE_LIFECYCLE_OVERRIDE',
            scopeKey: expectedScopeKey,
          }),
          id: 'UPDATE_LIFECYCLE_OVERRIDE',
          sizeUsd: 500,
          size: 500,
          entryPrice: 100,
          status: 'open',
          tradeRevision: 17,
          pendingExitIntent: { intentId: 'caller-owned' },
          beScaleOutState: {
            status: 'pending',
            intentId: 'caller-owned',
            targetQuantity: 2,
            filledQuantity: 1,
            brokerOrderIds: ['caller-order'],
          },
          tierStates: [{ status: 'pending' }],
        },
      ]]),
    }, { action: 'TEST_LIFECYCLE_OVERRIDE' });

    const trade = manager.get('activeTrades').get('UPDATE_LIFECYCLE_OVERRIDE');
    expect(trade.tradeRevision).toBe(0);
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.beScaleOutState).toEqual({
      status: 'idle',
      intentId: null,
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
    });
    expect(trade.tierStates).toEqual([]);
  });

  test('updateState preserves active trade lifecycle fields when activeTrades is not updated', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const existingTrade = manager.state.activeTrades.get('OPEN_SCOPE_1');
    existingTrade.tradeRevision = 9;
    existingTrade.pendingExitIntent = { intentId: 'preserve-intent' };
    existingTrade.beScaleOutState = {
      status: 'pending',
      intentId: 'preserve-be',
      targetQuantity: 2,
      filledQuantity: 1,
      brokerOrderIds: ['preserve-order'],
    };
    existingTrade.tierStates = [{ tierIndex: 0, status: 'pending' }];

    await manager.updateState({ balance: 9500 }, { action: 'BALANCE_ONLY_UPDATE' });

    const preservedTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(preservedTrade.tradeRevision).toBe(9);
    expect(preservedTrade.pendingExitIntent).toEqual({ intentId: 'preserve-intent' });
    expect(preservedTrade.beScaleOutState).toEqual({
      status: 'pending',
      intentId: 'preserve-be',
      targetQuantity: 2,
      filledQuantity: 1,
      brokerOrderIds: ['preserve-order'],
    });
    expect(preservedTrade.tierStates).toEqual([{ tierIndex: 0, status: 'pending' }]);
  });

  test('updateState rejects malformed activeTrades maps before mutating active trades', async () => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    const result = await manager.updateState({
      activeTrades: new Map([[
        'UPDATE_ZERO_QTY',
        {
          ...fullScope({
            orderId: 'UPDATE_ZERO_QTY',
            entryOrderQuantity: 0,
            remainingOrderQuantity: 0,
          }),
          id: 'UPDATE_ZERO_QTY',
          sizeUsd: 500,
          size: 500,
          entryPrice: 100,
          status: 'open',
        },
      ]]),
    }, { action: 'TEST_BAD_ACTIVE_TRADES' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('active trade quantity invariant failed');
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
      ledgerData: fullLedgerData(),
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
    expect(trade.decisionLedger.symbol).toBe('TSLA');
    expect(trade.decisionLedger.timeframe).toBe('15m');
    expect(trade.decisionLedger.executionMode).toBe('paper');
    expect(trade.decisionLedger.positionSizing.finalSizeUsd).toBe(500);
    expect(trade.decisionLedger.exitContract.strategyName).toBe('ScopeTestStrategy');
  });

  test('initializes StateManager-owned exit lifecycle fields at trade birth', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      tradeRevision: 99,
      pendingExitIntent: { intentId: 'caller-owned' },
      beScaleOutState: { status: 'complete' },
      tierStates: [{ status: 'complete' }],
    }));

    expect(result.success).toBe(true);
    const trade = manager.get('activeTrades').get('OPEN_SCOPE_1');
    expect(trade.tradeRevision).toBe(0);
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.beScaleOutState).toEqual({
      status: 'idle',
      intentId: null,
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
    });
    expect(trade.tierStates).toEqual([]);
  });

  test('getActiveTrade returns a frozen clone and does not expose live trade mutation', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));

    expect(result.success).toBe(true);
    const snapshot = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(snapshot).toBeTruthy();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.beScaleOutState)).toBe(true);
    expect(Object.isFrozen(snapshot.beScaleOutState.brokerOrderIds)).toBe(true);

    expect(() => {
      snapshot.beScaleOutState.status = 'pending';
    }).toThrow(TypeError);

    const liveTrade = manager.get('activeTrades').get('OPEN_SCOPE_1');
    expect(liveTrade.beScaleOutState.status).toBe('idle');
  });

  test('getState does not expose live activeTrades mutation', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));

    expect(result.success).toBe(true);
    const snapshot = manager.getState();
    expect(snapshot.activeTrades).toBeInstanceOf(Map);

    const snapshotTrade = snapshot.activeTrades.get('OPEN_SCOPE_1');
    expect(Object.isFrozen(snapshotTrade)).toBe(true);
    expect(() => {
      snapshotTrade.sizeUsd = 9999;
    }).toThrow(TypeError);

    expect(() => {
      snapshot.activeTrades.delete('OPEN_SCOPE_1');
    }).toThrow(TypeError);
    expect(() => {
      snapshot.activeTrades.set('FORGED_TRADE', {});
    }).toThrow(TypeError);
    expect(() => {
      snapshot.activeTrades.clear();
    }).toThrow(TypeError);
    expect(manager.get('activeTrades').has('OPEN_SCOPE_1')).toBe(true);
    expect(manager.get('activeTrades').get('OPEN_SCOPE_1').sizeUsd).toBe(500);
  });

  test('getActiveTrade rejects ambiguous trade id and returns null for missing trade', async () => {
    expect(() => manager.getActiveTrade('')).toThrow('requires explicit non-empty tradeId');
    expect(manager.getActiveTrade('MISSING_TRADE')).toBeNull();
  });

  test('uses per-share minimum fee model for entry and exit accounting', async () => {
    const TradingConfig = require('../core/TradingConfig');
    TradingConfig.setOverrides({
      'fees.model': 'per_share_minimum',
      'fees.perShare': 0.005,
      'fees.minOrderFee': 0.75,
      'fees.makerFee': 0,
      'fees.takerFee': 0,
      'fees.totalRoundTrip': 0,
    });

    const opened = await manager.openPosition(100, 100, fullScope({
      orderId: 'FEE_MODEL_1',
      entryOrderQuantity: 1,
      remainingOrderQuantity: 1,
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);
    expect(manager.get('activeTrades').get('FEE_MODEL_1').entryFee).toBeCloseTo(0.75);
    expect(manager.get('realizedPnL')).toBeCloseTo(-0.75);

    const closed = await manager.closePosition(101, false, null, {
      orderId: 'FEE_MODEL_1',
      orderQuantity: 1,
      quantityUnit: 'shares',
      exitReason: 'fee_model_probe',
    });

    expect(closed.success).toBe(true);
    expect(manager.get('realizedPnL')).toBeCloseTo(-0.5);
    expect(manager.get('closedTrades')[0].pnl).toBeCloseTo(1);
  });

  test('opens a scoped structural-exit trade with explicit null trailing fields', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      orderId: 'OPEN_NOWICK_1',
      entryStrategy: 'NoWickImbalance',
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData({
        strategySignals: [{
          name: 'NoWickImbalance',
          direction: 'long',
          baseConfidence: 0.7,
          reason: 'NoWick structural exit signal',
        }],
        orchestratorDecision: {
          winnerStrategy: 'NoWickImbalance',
          finalConfidence: 0.7,
          reason: 'NoWickImbalance selected',
        },
        exitContract: {
          strategyName: 'NoWickImbalance',
          stopLossPercent: -1.5,
          takeProfitPercent: 1.5,
          trailingStopPercent: null,
          trailingActivation: null,
          maxHoldTimeMinutes: 240,
          minConfidence: null,
          useStructuralExits: true,
          atrMinPercent: null,
          invalidationConditions: [],
          _validated: null,
        },
      }),
    }));

    expect(result.success).toBe(true);
    expect(manager.get('activeTrades').size).toBe(1);
    const trade = manager.get('activeTrades').get('OPEN_NOWICK_1');
    expect(trade.decisionLedger.exitContract.strategyName).toBe('NoWickImbalance');
    expect(trade.decisionLedger.exitContract.trailingStopPercent).toBeNull();
    expect(trade.decisionLedger.exitContract.trailingActivation).toBeNull();
    expect(trade.decisionLedger.exitContract._validated).toBeNull();
  });

  test('rejects incomplete decision ledger evidence before mutating active trades', async () => {
    const beforePositions = manager._buildScopedDashboardPositions(manager.state);

    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: {
        candleTimestamp: Date.parse('2026-05-29T12:00:00.000Z'),
      },
    }));

    expect(result.success).toBe(false);
    expect(result.ledgerRejected).toBe(true);
    expect(result.code).toBe('LEDGER_SKELETON_REJECTED');
    expect(result.missingFields).toEqual(expect.arrayContaining([
      'strategySignals',
      'orchestratorDecision',
      'positionSizing',
      'exitContract',
    ]));
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager._buildScopedDashboardPositions(manager.state)).toEqual(beforePositions);
  });
});
