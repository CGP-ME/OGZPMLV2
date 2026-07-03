'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('StateManager applyFill decision ledger persistence', () => {
  let originalEnv;
  let tempDir;
  let manager;
  let consoleSpies;

  const expectedScopeKey = 'backtest:alpaca:acct-main:stocks:TSLA:15m';

  const fullScope = (overrides = {}) => ({
    orderId: 'OPEN_FILL_LEDGER_1',
    action: 'BUY',
    direction: 'long',
    entryStrategy: 'ScopeTestStrategy',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'backtest',
    timeframe: '15m',
    scopeKey: expectedScopeKey,
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

  const fullLedgerData = () => ({
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
  });

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-apply-fill-ledger-'));
    process.env.STATE_FILE = path.join(tempDir, 'state.json');
    process.env.DATA_DIR = tempDir;
    process.env.BACKTEST_OUTPUT_DIR = path.join(tempDir, 'backtest-output');
    process.env.BACKTEST_MODE = 'true';
    process.env.EXECUTION_MODE = 'backtest';
    process.env.INITIAL_BALANCE = '10000';
    process.env.LIVE_TRADING = 'false';
    process.env.CONFIRM_LIVE_TRADING = 'false';
    process.env.EVAL_RULES_ENABLED = 'false';
    process.env.TTP_RULES_ENABLED = 'false';
    process.env.CANDLE_SOURCE = 'file';
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

  test('appends partial exits and writes decision ledger on final fill', async () => {
    const openResult = await manager.openPosition(500, 100, fullScope({
      ledgerData: fullLedgerData(),
    }));
    expect(openResult.success).toBe(true);

    const firstReserve = await manager.reserveExitSlot('OPEN_FILL_LEDGER_1', 'intent-fill-ledger-1', {
      submittedAtMs: 1000,
      sourceEventId: 'source-fill-ledger-1',
      exitFraction: 0.4,
      expectedRemainingQuantity: 3,
    });
    expect(firstReserve.success).toBe(true);

    const partialFill = await manager.applyFill({
      fillId: 'fill-ledger-1',
      brokerOrderId: 'broker-fill-ledger-1',
      tradeId: 'OPEN_FILL_LEDGER_1',
      intentId: 'intent-fill-ledger-1',
      sourceEventId: 'source-fill-ledger-1',
      lifecycleState: 'partial_fill',
      exitReason: 'profit_tier_1',
      triggeredBy: 'test.partialExit',
      filledQuantity: 2,
      filledQuantityUnit: 'shares',
      filledSizeUsd: 220,
      fillPrice: 110,
      fee: 1,
      expectedQuantity: 2,
      remainingQuantity: 3,
      submittedAtMs: 1000,
      confirmedAtMs: 2000,
      eventTimeMs: 2000,
      expectedTradeRevision: 0,
      executionMode: 'backtest',
      simulated: true,
    });
    expect(partialFill.success).toBe(true);
    const trade = manager.get('activeTrades').get('OPEN_FILL_LEDGER_1');
    expect(trade.decisionLedger.exits).toHaveLength(1);
    expect(trade.decisionLedger.exits[0]).toEqual(expect.objectContaining({
      exitOrderQuantity: 2,
      remainingOrderQuantity: 3,
      exitPrice: 110,
      exitReason: 'profit_tier_1',
      rawExitReason: 'profit_tier_1',
      legNumber: 1,
      realizedPnL: 19,
      triggeredBy: 'test.partialExit',
    }));

    const finalFill = await manager.applyFill({
      fillId: 'fill-ledger-2',
      brokerOrderId: 'broker-fill-ledger-2',
      tradeId: 'OPEN_FILL_LEDGER_1',
      intentId: 'intent-fill-ledger-1',
      sourceEventId: 'source-fill-ledger-1',
      lifecycleState: 'full_fill',
      exitReason: 'max_hold_winner',
      triggeredBy: 'test.finalExit',
      filledQuantity: 3,
      filledQuantityUnit: 'shares',
      filledSizeUsd: 345,
      fillPrice: 115,
      fee: 1.5,
      expectedQuantity: 3,
      remainingQuantity: 0,
      submittedAtMs: 1000,
      confirmedAtMs: 3000,
      eventTimeMs: 3000,
      expectedTradeRevision: 2,
      executionMode: 'backtest',
      simulated: true,
    });
    expect(finalFill.success).toBe(true);
    expect(manager.get('activeTrades').has('OPEN_FILL_LEDGER_1')).toBe(false);

    const ledgerDir = path.join(process.env.BACKTEST_OUTPUT_DIR, 'ledger');
    const decisionFile = fs.readdirSync(ledgerDir).find(file => /^decisions_.*\.jsonl$/.test(file));
    expect(decisionFile).toBeTruthy();
    const rows = fs.readFileSync(path.join(ledgerDir, decisionFile), 'utf8').trim().split(/\n/).map(line => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      tradeId: 'OPEN_FILL_LEDGER_1',
      outcome: expect.objectContaining({
        exitPrice: 115,
        netPnlDollars: 43.5,
      }),
    }));
    expect(rows[0].exits).toHaveLength(2);
    expect(rows[0].exits[1]).toEqual(expect.objectContaining({
      exitOrderQuantity: 3,
      remainingOrderQuantity: 0,
      exitPrice: 115,
      exitReason: 'max_hold',
      rawExitReason: 'max_hold_winner',
      legNumber: 2,
      realizedPnL: 43.5,
      triggeredBy: 'test.finalExit',
    }));
  });
});
