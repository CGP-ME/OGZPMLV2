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
    exitContract: {
      stopLossPercent: -0.5,
      takeProfitPercent: 1,
      useStructuralExits: false,
    },
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
      useStructuralExits: false,
    },
    riskGates: [],
    ...overrides,
  });

  const frozenExitPolicy = (overrides = {}) => ({
    source: 'PolicyBuilder.buildForTrade',
    strategyName: 'ScopeTestStrategy',
    contract: {
      strategyName: 'ScopeTestStrategy',
      stopLossPercent: -0.5,
      takeProfitPercent: 1,
      useStructuralExits: false,
    },
    profitManagement: {
      beScaleOut: { enabled: true },
      tieredExit: {
        enabled: true,
        tiers: [
          { name: 'tier1', targetProfitMove: 0.015, exitFraction: 0.3 },
          { name: 'final', targetProfitMove: 0.03, exitFraction: 0.7 },
        ],
      },
    },
    fees: { model: 'percent' },
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
    process.env.SYMBOL_LOSS_COOLDOWN_ENABLED = 'true';
    process.env.SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES = '2';
    process.env.SYMBOL_LOSS_COOLDOWN_MINUTES = '120';

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
      require('../foundation/ConfigLoader').clearOverrides();
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

  test('rejects missing exit-contract ownership before mutating active trades', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      exitContract: undefined,
    }));

    expect(result.success).toBe(false);
    expect(result.exitContractRejected).toBe(true);
    expect(result.code).toBe('ENTRY_EXIT_CONTRACT_REJECTED');
    expect(result.error).toContain('exitContract invalid');
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
  });

  test('rejects ambiguous exit-contract ownership before mutating active trades', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      exitContract: {
        stopLossPercent: -0.5,
        takeProfitPercent: 1,
      },
    }));

    expect(result.success).toBe(false);
    expect(result.exitContractRejected).toBe(true);
    expect(result.code).toBe('ENTRY_EXIT_CONTRACT_REJECTED');
    expect(result.error).toContain('exitContract.useStructuralExits missing/invalid');
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

  test('persists immutable frozen exit policy from entry context onto the active trade', async () => {
    const policy = frozenExitPolicy();

    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      frozenExitPolicy: policy,
    }));

    expect(result.success).toBe(true);
    const trade = manager.get('activeTrades').get('OPEN_SCOPE_1');
    expect(trade.frozenExitPolicy).not.toBe(policy);
    expect(trade.frozenExitPolicy.policyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(trade.frozenExitPolicy)).toBe(true);
    expect(Object.isFrozen(trade.frozenExitPolicy.contract)).toBe(true);
    expect(manager.getActiveTrade('OPEN_SCOPE_1').frozenExitPolicy).toEqual(trade.frozenExitPolicy);

    expect(() => {
      trade.frozenExitPolicy.contract.stopLossPercent = -99;
    }).toThrow(TypeError);
    expect(manager.get('activeTrades').get('OPEN_SCOPE_1').frozenExitPolicy.contract.stopLossPercent).toBe(-0.5);
  });

  test('updateActiveTrade preserves existing frozen exit policy when update payload omits it', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      frozenExitPolicy: frozenExitPolicy(),
    }));

    expect(result.success).toBe(true);
    const originalPolicy = manager.get('activeTrades').get('OPEN_SCOPE_1').frozenExitPolicy;

    manager.updateActiveTrade('OPEN_SCOPE_1', fullScope({
      id: 'OPEN_SCOPE_1',
      scopeKey: expectedScopeKey,
      sizeUsd: 500,
      size: 500,
      entryPrice: 100,
      status: 'open',
    }));

    const trade = manager.get('activeTrades').get('OPEN_SCOPE_1');
    expect(trade.frozenExitPolicy).toBe(originalPolicy);
    expect(Object.isFrozen(trade.frozenExitPolicy)).toBe(true);
    expect(trade.frozenExitPolicy.contract.stopLossPercent).toBe(-0.5);
  });

  test('updateActiveTrade rejects replacement of an existing frozen exit policy', async () => {
    const result = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      frozenExitPolicy: frozenExitPolicy(),
    }));

    expect(result.success).toBe(true);

    expect(() => manager.updateActiveTrade('OPEN_SCOPE_1', fullScope({
      id: 'OPEN_SCOPE_1',
      scopeKey: expectedScopeKey,
      sizeUsd: 500,
      size: 500,
      entryPrice: 100,
      status: 'open',
      frozenExitPolicy: frozenExitPolicy({
        contract: {
          strategyName: 'ScopeTestStrategy',
          stopLossPercent: -1,
          takeProfitPercent: 1,
          useStructuralExits: false,
        },
      }),
    }))).toThrow(/frozenExitPolicy is immutable/);

    const trade = manager.get('activeTrades').get('OPEN_SCOPE_1');
    expect(trade.frozenExitPolicy.contract.stopLossPercent).toBe(-0.5);
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

  test('reserveExitSlot records one pending exit intent without mutating position truth', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforePosition = manager.get('position');
    const beforeRealizedPnL = manager.get('realizedPnL');

    const reserved = await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
    });

    expect(reserved.success).toBe(true);
    expect(reserved.reserved).toBe(true);
    expect(reserved.reason).toBe('reserved');
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.tradeRevision).toBe(beforeTrade.tradeRevision + 1);
    expect(trade.pendingExitIntent).toEqual({
      intentId: 'intent-1',
      sourceEventId: 'trace-1',
      brokerOrderId: null,
      lifecycleState: 'submitted',
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      exitFraction: 0.5,
      expectedRemainingQuantity: 2.5,
      tradeRevision: beforeTrade.tradeRevision,
    });
    expect(trade.remainingOrderQuantity).toBe(beforeTrade.remainingOrderQuantity);
    expect(trade.sizeUsd).toBe(beforeTrade.sizeUsd);
    expect(manager.get('position')).toBe(beforePosition);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL);
  });

  test('reserveExitSlot marks and releases profit planner lifecycle state without mutating position truth', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      frozenExitPolicy: frozenExitPolicy(),
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);
    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(beforeTrade.tierStates).toHaveLength(2);

    const reserved = await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-tier-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-tier',
      exitFraction: 0.3,
      stateKey: 'tierStates',
      tierIndex: 0,
      targetQuantity: 1.5,
    });

    expect(reserved.success).toBe(true);
    const reservedTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(reservedTrade.remainingOrderQuantity).toBe(beforeTrade.remainingOrderQuantity);
    expect(reservedTrade.tierStates[0]).toEqual(expect.objectContaining({
      status: 'pending',
      intentId: 'intent-tier-1',
      targetQuantity: 1.5,
    }));

    const released = await manager.releaseExitSlot('OPEN_SCOPE_1', 'intent-tier-1', {
      reason: 'broker_rejected',
    });

    expect(released.success).toBe(true);
    const releasedTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(releasedTrade.pendingExitIntent).toBeNull();
    expect(releasedTrade.remainingOrderQuantity).toBe(beforeTrade.remainingOrderQuantity);
    expect(releasedTrade.tierStates[0]).toEqual(expect.objectContaining({
      status: 'idle',
      intentId: null,
      targetQuantity: null,
    }));
  });

  test('reserveExitSlot rejects duplicate pending exit intent without overwriting the original', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      exitFraction: 0.5,
    });

    const duplicate = await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-2', {
      submittedAtMs: Date.parse('2026-06-28T07:01:00.000Z'),
      exitFraction: 0.25,
    });

    expect(duplicate.success).toBe(true);
    expect(duplicate.reserved).toBe(false);
    expect(duplicate.reason).toBe('exit_already_pending');
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.pendingExitIntent.intentId).toBe('intent-1');
    expect(trade.pendingExitIntent.exitFraction).toBe(0.5);
  });

  test('releaseExitSlot refuses to clear a mismatched pending intent', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      exitFraction: 0.5,
    });

    const released = await manager.releaseExitSlot('OPEN_SCOPE_1', 'intent-2');

    expect(released.success).toBe(true);
    expect(released.released).toBe(false);
    expect(released.reason).toBe('intent_mismatch');
    expect(manager.getActiveTrade('OPEN_SCOPE_1').pendingExitIntent.intentId).toBe('intent-1');
  });

  test('releaseExitSlot clears matching pending intent and increments revision', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      exitFraction: 0.5,
    });
    const reservedTrade = manager.getActiveTrade('OPEN_SCOPE_1');

    const released = await manager.releaseExitSlot('OPEN_SCOPE_1', 'intent-1', {
      reason: 'broker_rejected',
    });

    expect(released.success).toBe(true);
    expect(released.released).toBe(true);
    expect(released.reason).toBe('released');
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.tradeRevision).toBe(reservedTrade.tradeRevision + 1);
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.remainingOrderQuantity).toBe(reservedTrade.remainingOrderQuantity);
    expect(trade.sizeUsd).toBe(reservedTrade.sizeUsd);
  });

  const executionFill = (overrides = {}) => ({
    fillId: 'fill-1',
    brokerOrderId: 'broker-order-1',
    tradeId: 'OPEN_SCOPE_1',
    intentId: 'intent-1',
    sourceEventId: 'trace-1',
    lifecycleState: 'partial_fill',
    filledQuantity: 2,
    filledQuantityUnit: 'shares',
    filledSizeUsd: 220,
    fillPrice: 110,
    fee: 1,
    remainingQuantity: 3,
    expectedQuantity: 4,
    submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
    confirmedAtMs: Date.parse('2026-06-28T07:01:00.000Z'),
    eventTimeMs: Date.parse('2026-06-28T07:00:00.000Z'),
    rejectionReason: null,
    executionMode: 'paper',
    simulated: true,
    expectedTradeRevision: 0,
    ...overrides,
  });

  test('applyFill mutates position truth from confirmed fill quantity only', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    const reserved = await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.8,
      expectedRemainingQuantity: 1,
    });
    expect(reserved.success).toBe(true);

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
    }));

    expect(applied.success).toBe(true);
    expect(applied.applied).toBe(true);
    expect(applied.code).toBe('FILL_APPLIED');
    expect(applied.remainingOrderQuantity).toBe(3);
    expect(applied.pnl).toBe(20);
    expect(applied.netRealizedResult).toBe(19);

    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.pendingExitIntent).toEqual(expect.objectContaining({
      intentId: 'intent-1',
      status: 'partial_fill',
      filledQuantity: 2,
      remainingQuantity: 3,
      brokerOrderIds: ['broker-order-1'],
      lastFillId: 'fill-1',
    }));
    expect(trade.tradeRevision).toBe(beforeTrade.tradeRevision + 2);
    expect(trade.remainingOrderQuantity).toBe(3);
    expect(trade.sizeUsd).toBe(300);
    expect(trade.size).toBe(300);
    expect(manager.get('position')).toBe(300);
    expect(manager.get('inPosition')).toBe(300);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL + 19);
    expect(manager.get('totalPnL')).toBe(20);
  });

  test('applyFill derives entry basis from confirmed quantity and entry price when requested size differs', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      entryOrderQuantity: 4,
      remainingOrderQuantity: 4,
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    const reserved = await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
      expectedRemainingQuantity: 2,
    });
    expect(reserved.success).toBe(true);

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      lifecycleState: 'full_fill',
      filledQuantity: 2,
      filledSizeUsd: 220,
      fillPrice: 110,
      fee: 0,
      remainingQuantity: 2,
      expectedQuantity: 2,
    }));

    expect(applied.success).toBe(true);
    expect(applied.pnl).toBe(20);
    expect(applied.netRealizedResult).toBe(20);
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.remainingOrderQuantity).toBe(2);
    expect(trade.sizeUsd).toBe(200);
    expect(trade.size).toBe(200);
    expect(manager.get('position')).toBe(200);
    expect(manager.get('inPosition')).toBe(200);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL + 20);
    expect(manager.get('totalPnL')).toBe(20);
  });

  test('applyFill keeps partial fill intent open for later fills from the same order', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.8,
      expectedRemainingQuantity: 1,
    });

    const firstFill = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      lifecycleState: 'partial_fill',
      filledQuantity: 2,
      filledSizeUsd: 220,
      fillPrice: 110,
      remainingQuantity: 3,
      expectedQuantity: 4,
    }));
    expect(firstFill.success).toBe(true);

    const afterFirstTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(afterFirstTrade.pendingExitIntent).toEqual(expect.objectContaining({
      intentId: 'intent-1',
      status: 'partial_fill',
      tradeRevision: afterFirstTrade.tradeRevision,
      filledQuantity: 2,
      remainingQuantity: 3,
    }));

    const secondFill = await manager.applyFill(executionFill({
      fillId: 'fill-2',
      brokerOrderId: 'broker-order-1',
      expectedTradeRevision: afterFirstTrade.pendingExitIntent.tradeRevision,
      lifecycleState: 'full_fill',
      filledQuantity: 2,
      filledSizeUsd: 240,
      fillPrice: 120,
      remainingQuantity: 1,
      expectedQuantity: 4,
    }));

    expect(secondFill.success).toBe(true);
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.pendingExitIntent).toBeNull();
    expect(trade.tradeRevision).toBe(afterFirstTrade.tradeRevision + 1);
    expect(trade.remainingOrderQuantity).toBe(1);
    expect(trade.sizeUsd).toBe(100);
    expect(manager.get('position')).toBe(100);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL + 58);
    expect(manager.get('totalPnL')).toBe(60);
  });

  test('applyFill rejects duplicate fill replay without mutating active trade truth again', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.8,
      expectedRemainingQuantity: 1,
    });

    const firstFill = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      lifecycleState: 'partial_fill',
      filledQuantity: 2,
      filledSizeUsd: 220,
      fillPrice: 110,
      remainingQuantity: 3,
      expectedQuantity: 4,
    }));
    expect(firstFill.success).toBe(true);

    const afterFirstTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const duplicate = await manager.applyFill(executionFill({
      expectedTradeRevision: afterFirstTrade.pendingExitIntent.tradeRevision,
      lifecycleState: 'partial_fill',
      filledQuantity: 2,
      filledSizeUsd: 220,
      fillPrice: 110,
      remainingQuantity: 1,
      expectedQuantity: 4,
    }));

    expect(duplicate.success).toBe(false);
    expect(duplicate.applied).toBe(false);
    expect(duplicate.code).toBe('FILL_DUPLICATE_FILL');
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(3);
    expect(trade.sizeUsd).toBe(300);
    expect(trade.pendingExitIntent).toEqual(expect.objectContaining({
      filledQuantity: 2,
      remainingQuantity: 3,
      lastFillId: 'fill-1',
    }));
    expect(manager.get('position')).toBe(300);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL + 19);
    expect(manager.get('totalPnL')).toBe(20);
  });

  test('applyFill preserves aggregate position truth with mixed active long and short trades', async () => {
    const openedLong = await manager.openPosition(500, 100, fullScope({
      orderId: 'LONG_SCOPE_1',
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(openedLong.success).toBe(true);

    const openedShort = await manager.openPosition(300, 30, fullScope({
      orderId: 'SHORT_SCOPE_1',
      action: 'SELL_SHORT',
      direction: 'short',
      symbol: 'MARA',
      timeframe: '15m',
      entryOrderQuantity: 10,
      remainingOrderQuantity: 10,
      ledgerData: fullLedgerData({
        strategySignals: [{
          name: 'ScopeTestStrategy',
          direction: 'short',
          baseConfidence: 0.75,
          reason: 'scoped short ledger test signal',
        }],
      }),
    }));
    expect(openedShort.success).toBe(true);
    expect(manager.get('position')).toBe(200);
    expect(manager.get('inPosition')).toBe(800);

    const beforeShort = manager.getActiveTrade('SHORT_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('SHORT_SCOPE_1', 'short-intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-short-1',
      exitFraction: 0.4,
      expectedRemainingQuantity: 6,
    });

    const applied = await manager.applyFill(executionFill({
      fillId: 'short-fill-1',
      brokerOrderId: 'short-broker-order-1',
      tradeId: 'SHORT_SCOPE_1',
      intentId: 'short-intent-1',
      sourceEventId: 'trace-short-1',
      expectedTradeRevision: beforeShort.tradeRevision,
      lifecycleState: 'partial_fill',
      filledQuantity: 4,
      filledSizeUsd: 100,
      fillPrice: 25,
      remainingQuantity: 6,
      expectedQuantity: 4,
    }));

    expect(applied.success).toBe(true);
    expect(applied.pnl).toBe(20);
    expect(manager.getActiveTrade('LONG_SCOPE_1')).toEqual(expect.objectContaining({
      sizeUsd: 500,
      remainingOrderQuantity: 5,
    }));
    expect(manager.getActiveTrade('SHORT_SCOPE_1')).toEqual(expect.objectContaining({
      sizeUsd: 180,
      remainingOrderQuantity: 6,
    }));
    expect(manager.get('position')).toBe(320);
    expect(manager.get('inPosition')).toBe(680);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL + 19);
  });

  test('openPosition blocks same-symbol opposite-direction hedges', async () => {
    const openedLong = await manager.openPosition(500, 100, fullScope({
      orderId: 'LONG_SCOPE_1',
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(openedLong.success).toBe(true);

    const openedShort = await manager.openPosition(300, 30, fullScope({
      orderId: 'SHORT_SCOPE_1',
      action: 'SELL_SHORT',
      direction: 'short',
      symbol: 'TSLA',
      entryOrderQuantity: 10,
      remainingOrderQuantity: 10,
      ledgerData: fullLedgerData({
        strategySignals: [{
          name: 'ScopeTestStrategy',
          direction: 'short',
          baseConfidence: 0.75,
          reason: 'same-symbol hedge test signal',
        }],
      }),
    }));

    expect(openedShort.success).toBe(false);
    expect(openedShort.blockedReason).toBe('same_symbol_hedge_blocked');
    expect(openedShort.existingTradeId).toBe('LONG_SCOPE_1');
    expect(openedShort.existingDirection).toBe('long');
    expect(openedShort.nextDirection).toBe('short');
    expect(manager.get('activeTrades').size).toBe(1);
    expect(manager.get('activeTrades').has('LONG_SCOPE_1')).toBe(true);
    expect(manager.get('activeTrades').has('SHORT_SCOPE_1')).toBe(false);
    expect(manager.get('position')).toBe(500);
  });

  test('openPosition blocks same-symbol duplicate entries', async () => {
    const openedLong = await manager.openPosition(500, 100, fullScope({
      orderId: 'LONG_SCOPE_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      ledgerData: fullLedgerData(),
    }));
    expect(openedLong.success).toBe(true);

    const duplicateLong = await manager.openPosition(300, 30, fullScope({
      orderId: 'LONG_SCOPE_2',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryOrderQuantity: 10,
      remainingOrderQuantity: 10,
      ledgerData: fullLedgerData(),
    }));

    expect(duplicateLong.success).toBe(false);
    expect(duplicateLong.blockedReason).toBe('same_symbol_duplicate_blocked');
    expect(duplicateLong.existingTradeId).toBe('LONG_SCOPE_1');
    expect(duplicateLong.existingDirection).toBe('long');
    expect(duplicateLong.nextDirection).toBe('long');
    expect(manager.get('activeTrades').size).toBe(1);
    expect(manager.get('activeTrades').has('LONG_SCOPE_1')).toBe(true);
    expect(manager.get('activeTrades').has('LONG_SCOPE_2')).toBe(false);
    expect(manager.get('position')).toBe(500);
  });

  test('reconcileBrokerFlat removes stale active trade without recording verified PnL', async () => {
    const openedLong = await manager.openPosition(500, 100, fullScope({
      orderId: 'LONG_SCOPE_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      ledgerData: fullLedgerData(),
    }));
    expect(openedLong.success).toBe(true);

    const reconciled = await manager.reconcileBrokerFlat('LONG_SCOPE_1', {
      symbol: 'TSLA',
      action: 'SELL',
      reason: 'broker_flat_no_open_position',
      responseBody: '{"status_description":"No open positions for the asset"}',
      traceId: 'trace-flat',
    });

    expect(reconciled.success).toBe(true);
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('closedTrades')).toEqual([]);
    expect(manager.get('reconciledTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'LONG_SCOPE_1',
        symbol: 'TSLA',
        action: 'SELL',
        reason: 'broker_flat_no_open_position',
        verifiedFill: false,
        traceId: 'trace-flat',
      }),
    ]);
  });

  test('reconcileBrokerFlat normalizes serialized active trades before removing stale trade', async () => {
    const openedLong = await manager.openPosition(500, 100, fullScope({
      orderId: 'SERIALIZED_SCOPE_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      ledgerData: fullLedgerData(),
    }));
    expect(openedLong.success).toBe(true);

    manager.state.activeTrades = Array.from(manager.state.activeTrades.entries());

    const reconciled = await manager.reconcileBrokerFlat('SERIALIZED_SCOPE_1', {
      symbol: 'TSLA',
      action: 'SELL',
      reason: 'broker_flat_no_open_position',
      responseBody: '{"status_description":"No open positions for the asset"}',
      traceId: 'trace-flat-serialized',
    });

    expect(reconciled.success).toBe(true);
    expect(manager.get('activeTrades')).toBeInstanceOf(Map);
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('closedTrades')).toEqual([]);
    expect(manager.get('reconciledTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'SERIALIZED_SCOPE_1',
        symbol: 'TSLA',
        action: 'SELL',
        reason: 'broker_flat_no_open_position',
        verifiedFill: false,
        traceId: 'trace-flat-serialized',
      }),
    ]);
  });

  test('reconcileBrokerFlat removes pending exit intent with stale active trade', async () => {
    const openedLong = await manager.openPosition(500, 100, fullScope({
      orderId: 'PENDING_EXIT_SCOPE_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryOrderQuantity: 5,
      remainingOrderQuantity: 5,
      ledgerData: fullLedgerData(),
    }));
    expect(openedLong.success).toBe(true);

    const reserved = await manager.reserveExitSlot('PENDING_EXIT_SCOPE_1', 'intent-flat-1', {
      submittedAtMs: Date.parse('2026-06-30T12:50:00.000Z'),
      exitFraction: 1,
    });
    expect(reserved.success).toBe(true);
    expect(manager.getActiveTrade('PENDING_EXIT_SCOPE_1').pendingExitIntent.intentId).toBe('intent-flat-1');

    const reconciled = await manager.reconcileBrokerFlat('PENDING_EXIT_SCOPE_1', {
      symbol: 'TSLA',
      action: 'SELL',
      reason: 'broker_flat_no_open_position',
      responseBody: '{"status_description":"No open positions for the asset"}',
      traceId: 'trace-flat-pending',
    });

    expect(reconciled.success).toBe(true);
    expect(manager.getActiveTrade('PENDING_EXIT_SCOPE_1')).toBeNull();
    expect(manager.get('activeTrades').size).toBe(0);
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('closedTrades')).toEqual([]);
    expect(manager.get('reconciledTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'PENDING_EXIT_SCOPE_1',
        reason: 'broker_flat_no_open_position',
        verifiedFill: false,
      }),
    ]);
  });

  test('symbol loss cooldown halts entries after configured consecutive closed losses', async () => {
    const firstOpen = await manager.openPosition(500, 100, fullScope({
      orderId: 'MARA_LOSS_1',
      symbol: 'MARA',
      ledgerData: fullLedgerData(),
    }));
    expect(firstOpen.success).toBe(true);
    const firstClose = await manager.closePosition(99, false, null, {
      orderId: 'MARA_LOSS_1',
      orderQuantity: 5,
      quantityUnit: 'shares',
      exitReason: 'cooldown_probe_loss_1',
    });
    expect(firstClose.success).toBe(true);
    expect(manager.isSymbolHalted('MARA')).toBe(false);

    const secondOpen = await manager.openPosition(500, 100, fullScope({
      orderId: 'MARA_LOSS_2',
      symbol: 'MARA',
      ledgerData: fullLedgerData(),
    }));
    expect(secondOpen.success).toBe(true);
    const secondClose = await manager.closePosition(99, false, null, {
      orderId: 'MARA_LOSS_2',
      orderQuantity: 5,
      quantityUnit: 'shares',
      exitReason: 'cooldown_probe_loss_2',
    });
    expect(secondClose.success).toBe(true);

    expect(manager.isSymbolHalted('MARA')).toBe(true);
    expect(manager.getSymbolHaltCode('MARA')).toBe('symbol_cooldown');
    expect(manager.getSymbolHaltReason('MARA')).toMatch(/symbol_cooldown: MARA 2 consecutive losses/);
    expect(manager.get('symbolLossStreaks').MARA.consecutiveLosses).toBe(2);
  });

  test('symbol loss cooldown resets streak on a winning close and can be cleared manually', async () => {
    const lossOpen = await manager.openPosition(500, 100, fullScope({
      orderId: 'TSLA_LOSS_1',
      symbol: 'TSLA',
      ledgerData: fullLedgerData(),
    }));
    expect(lossOpen.success).toBe(true);
    await manager.closePosition(99, false, null, {
      orderId: 'TSLA_LOSS_1',
      orderQuantity: 5,
      quantityUnit: 'shares',
      exitReason: 'cooldown_probe_loss',
    });

    const winOpen = await manager.openPosition(500, 100, fullScope({
      orderId: 'TSLA_WIN_1',
      symbol: 'TSLA',
      ledgerData: fullLedgerData(),
    }));
    expect(winOpen.success).toBe(true);
    await manager.closePosition(101, false, null, {
      orderId: 'TSLA_WIN_1',
      orderQuantity: 5,
      quantityUnit: 'shares',
      exitReason: 'cooldown_probe_win',
    });

    expect(manager.get('symbolLossStreaks').TSLA.consecutiveLosses).toBe(0);
    expect(manager.isSymbolHalted('TSLA')).toBe(false);

    await manager.haltSymbol('TSLA', 'manual cooldown clear probe', { code: 'symbol_cooldown' });
    expect(manager.isSymbolHalted('TSLA')).toBe(true);
    const reset = await manager.resetSymbolHalt('TSLA');
    expect(reset.success).toBe(true);
    expect(manager.isSymbolHalted('TSLA')).toBe(false);
  });

  test('symbol loss cooldown expiry does not keep entries halted', async () => {
    await manager.haltSymbol('COIN', 'expired cooldown probe', {
      code: 'symbol_cooldown',
      expiresAt: Date.now() - 1000,
    });

    expect(manager.isSymbolHalted('COIN')).toBe(false);
    expect(manager.getSymbolHaltCode('COIN')).toBeNull();
    expect(manager.getSymbolHaltReason('COIN')).toBeNull();
  });

  test('load normalizes persisted symbol cooldown state without resurrecting corrupt halts', () => {
    const now = Date.now();
    const stateFile = process.env.STATE_FILE;
    fs.writeFileSync(stateFile, JSON.stringify({
      position: 0,
      inPosition: 0,
      activeTrades: [],
      isTrading: true,
      symbolEntryHalts: {
        mara: {
          reason: 'symbol_cooldown: MARA 2 consecutive losses',
          code: 'symbol_cooldown',
          haltedAt: String(now - 1000),
          expiresAt: String(now + 60000),
          consecutiveLosses: 2,
        },
        COIN: {
          reason: 'expired cooldown',
          code: 'symbol_cooldown',
          haltedAt: now - 120000,
          expiresAt: now - 60000,
        },
        BAD: [],
      },
      symbolLossStreaks: {
        mara: {
          consecutiveLosses: '2',
          lastClosedAt: String(now - 1000),
          lastPnl: '-5',
        },
        TSLA: {
          consecutiveLosses: 'not-a-number',
          lastClosedAt: now,
          lastPnl: -1,
        },
        NVDA: [],
      },
    }), 'utf8');

    const { StateManager } = require('../core/StateManager');
    const loaded = new StateManager();
    loaded.save = jest.fn();
    loaded.notifyListeners = jest.fn();

    expect(loaded.isSymbolHalted('MARA')).toBe(true);
    expect(loaded.getSymbolHaltCode('MARA')).toBe('symbol_cooldown');
    expect(loaded.isSymbolHalted('COIN')).toBe(false);
    expect(loaded.get('symbolEntryHalts')).not.toHaveProperty('COIN');
    expect(loaded.get('symbolEntryHalts')).not.toHaveProperty('BAD');
    expect(loaded.get('symbolLossStreaks')).toEqual({
      MARA: {
        consecutiveLosses: 2,
        lastClosedAt: now - 1000,
        lastPnl: -5,
      },
    });
  });

  test('openPosition blocks same-symbol entries when existing trade direction is unknown', async () => {
    manager.state.activeTrades = new Map([[
      'AMBIGUOUS_SCOPE_1',
      {
        ...fullScope({
          orderId: 'AMBIGUOUS_SCOPE_1',
          action: undefined,
          direction: undefined,
        }),
        id: 'AMBIGUOUS_SCOPE_1',
        sizeUsd: 500,
        size: 500,
        entryPrice: 100,
        status: 'open',
      },
    ]]);

    const openedLong = await manager.openPosition(300, 30, fullScope({
      orderId: 'LONG_SCOPE_2',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryOrderQuantity: 10,
      remainingOrderQuantity: 10,
      ledgerData: fullLedgerData(),
    }));

    expect(openedLong.success).toBe(false);
    expect(openedLong.blockedReason).toBe('same_symbol_trade_direction_unknown');
    expect(openedLong.existingTradeId).toBe('AMBIGUOUS_SCOPE_1');
    expect(openedLong.existingDirection).toBeNull();
    expect(openedLong.nextDirection).toBe('long');
    expect(manager.get('activeTrades').size).toBe(1);
    expect(manager.get('activeTrades').has('AMBIGUOUS_SCOPE_1')).toBe(true);
    expect(manager.get('activeTrades').has('LONG_SCOPE_2')).toBe(false);
  });

  test('applyFill rejects stale trade revision without mutating reserved trade', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
    });
    const reservedTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: reservedTrade.tradeRevision,
    }));

    expect(applied.success).toBe(false);
    expect(applied.code).toBe('FILL_STALE_REVISION');
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.pendingExitIntent.intentId).toBe('intent-1');
    expect(trade.remainingOrderQuantity).toBe(5);
    expect(trade.sizeUsd).toBe(500);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL);
  });

  test('applyFill rejects overfilled quantity without mutating active trade truth', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 1,
    });

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      lifecycleState: 'full_fill',
      filledQuantity: 6,
      filledSizeUsd: 660,
      remainingQuantity: 0,
      expectedQuantity: 6,
    }));

    expect(applied.success).toBe(false);
    expect(applied.code).toBe('FILL_EXCEEDS_REMAINING_QUANTITY');
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(5);
    expect(trade.sizeUsd).toBe(500);
    expect(manager.get('position')).toBe(500);
  });

  test('applyFill rejects broker remaining quantity mismatch without mutating active trade truth', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
    });

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      remainingQuantity: 2,
    }));

    expect(applied.success).toBe(false);
    expect(applied.code).toBe('FILL_REMAINING_QUANTITY_MISMATCH');
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(5);
    expect(trade.sizeUsd).toBe(500);
    expect(manager.get('position')).toBe(500);
  });

  test('applyFill refuses missing broker remaining quantity without inferring silently', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
    });

    const fill = executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
    });
    delete fill.remainingQuantity;
    const applied = await manager.applyFill(fill);

    expect(applied.success).toBe(false);
    expect(applied.code).toBe('FILL_INVALID_DTO');
    expect(applied.error).toMatch(/remainingQuantity is required/);
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(5);
    expect(trade.sizeUsd).toBe(500);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL);
  });

  test('applyFill rejects fill notional that disagrees with quantity and price', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
    });

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      filledQuantity: 2,
      fillPrice: 110,
      filledSizeUsd: 200,
      remainingQuantity: 3,
    }));

    expect(applied.success).toBe(false);
    expect(applied.code).toBe('FILL_INVALID_DTO');
    expect(applied.error).toMatch(/does not match filledQuantity \* fillPrice/);
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(5);
    expect(trade.sizeUsd).toBe(500);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL);
  });

  test('applyFill refuses caller-supplied fractions without throwing through caller', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
    });

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      exitFraction: 0.5,
    }));

    expect(applied.success).toBe(false);
    expect(applied.code).toBe('FILL_INVALID_DTO');
    expect(applied.error).toMatch(/must not contain fraction or exitFraction/);
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(5);
    expect(trade.sizeUsd).toBe(500);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL);
  });

  test('applyFill refuses missing fee without defaulting to zero or throwing', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 0.5,
    });

    const fill = executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
    });
    delete fill.fee;
    const applied = await manager.applyFill(fill);

    expect(applied.success).toBe(false);
    expect(applied.code).toBe('FILL_INVALID_DTO');
    expect(applied.error).toMatch(/fee is required/);
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(5);
    expect(trade.sizeUsd).toBe(500);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL);
  });

  test('applyFill removes active trade and records close when confirmed fill exhausts quantity', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData(),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 1,
      expectedRemainingQuantity: 0,
    });

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      lifecycleState: 'full_fill',
      filledQuantity: 5,
      filledSizeUsd: 550,
      fillPrice: 110,
      fee: 2,
      remainingQuantity: 0,
      expectedQuantity: 5,
    }));

    expect(applied.success).toBe(true);
    expect(manager.getActiveTrade('OPEN_SCOPE_1')).toBeNull();
    expect(manager.get('position')).toBe(0);
    expect(manager.get('inPosition')).toBe(0);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL + 48);
    expect(manager.get('totalPnL')).toBe(50);
    expect(manager.get('closedTrades')).toEqual([
      expect.objectContaining({
        tradeId: 'OPEN_SCOPE_1',
        fillId: 'fill-1',
        brokerOrderId: 'broker-order-1',
        intentId: 'intent-1',
        sourceEventId: 'trace-1',
        pnl: 50,
        pnlPercent: 10,
        exitPrice: 110,
      }),
    ]);
  });

  test('applyFill accounts confirmed short fills without using caller fractions', async () => {
    const opened = await manager.openPosition(500, 100, fullScope({
      action: 'SELL_SHORT',
      direction: 'short',
      scopeKey: expectedScopeKey,
      ledgerData: fullLedgerData({
        strategySignals: [{
          name: 'ScopeTestStrategy',
          direction: 'short',
          baseConfidence: 0.75,
          reason: 'scoped short ledger test signal',
        }],
      }),
    }));
    expect(opened.success).toBe(true);

    const beforeTrade = manager.getActiveTrade('OPEN_SCOPE_1');
    const beforeRealizedPnL = manager.get('realizedPnL');
    await manager.reserveExitSlot('OPEN_SCOPE_1', 'intent-1', {
      submittedAtMs: Date.parse('2026-06-28T07:00:00.000Z'),
      sourceEventId: 'trace-1',
      exitFraction: 1,
    });

    const applied = await manager.applyFill(executionFill({
      expectedTradeRevision: beforeTrade.tradeRevision,
      filledQuantity: 2,
      filledSizeUsd: 180,
      fillPrice: 90,
      remainingQuantity: 3,
      expectedQuantity: 2,
    }));

    expect(applied.success).toBe(true);
    expect(applied.pnl).toBe(20);
    expect(applied.netRealizedResult).toBe(19);
    const trade = manager.getActiveTrade('OPEN_SCOPE_1');
    expect(trade.remainingOrderQuantity).toBe(3);
    expect(trade.sizeUsd).toBe(300);
    expect(manager.get('position')).toBe(-300);
    expect(manager.get('inPosition')).toBe(300);
    expect(manager.get('realizedPnL')).toBe(beforeRealizedPnL + 19);
  });

  test('uses per-share minimum fee model for entry and exit accounting', async () => {
    process.env.FEE_MODEL = 'per_share_minimum';
    process.env.FEE_PER_SHARE = '0.005';
    process.env.FEE_MIN_ORDER = '0.75';
    process.env.FEE_MAKER = '0';
    process.env.FEE_TAKER = '0';
    process.env.FEE_ROUND_TRIP = '0';
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.load({ force: true, silent: true });

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
