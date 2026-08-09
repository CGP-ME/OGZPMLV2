'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const FeeModel = require('../core/FeeModel');
const {
  positionEffectFromAction,
  exitPositionEffectForDirection,
  isPositionEffect,
} = require('../core/PositionEffect');
const { emitTrace } = require('../core/TraceSpine');
const BacktestRecorder = require('../core/BacktestRecorder');

describe('positionEffect trace contract', () => {
  test('maps broker verbs to unambiguous lifecycle effects', () => {
    expect(positionEffectFromAction('BUY')).toBe('open_long');
    expect(positionEffectFromAction('SELL')).toBe('close_long');
    expect(positionEffectFromAction('SELL_SHORT')).toBe('open_short');
    expect(positionEffectFromAction('COVER')).toBe('close_short');
    expect(exitPositionEffectForDirection('long')).toBe('close_long');
    expect(exitPositionEffectForDirection('short')).toBe('close_short');
    expect(positionEffectFromAction('HOLD')).toBe('hold');
    expect(exitPositionEffectForDirection('flat')).toBe('unknown_effect');
    expect(isPositionEffect('open_short')).toBe(true);
    expect(isPositionEffect('hold')).toBe(true);
    expect(isPositionEffect('unknown_effect')).toBe(true);
    expect(isPositionEffect('sell')).toBe(false);
  });

  test('TraceSpine exposes positionEffect at the top level and in fields', () => {
    const ws = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: {
        evalTraceEnabled: true,
        evalTraceBacktest: true,
        executionMode: 'backtest',
        traceEventMaxBufferedBytes: 1048576,
      },
      backtestMode: true,
      dashboardWs: ws,
    };

    emitTrace(ctx, 'ORDER_EXECUTE_START', {
      traceId: 'trace-position-effect-1',
      signalId: 'signal-1',
      symbol: 'TSLA',
      action: 'SELL',
      positionEffect: 'close_long',
    });

    const frame = JSON.parse(ws.send.mock.calls[0][0]);
    expect(frame).toEqual(expect.objectContaining({
      type: 'trace_event',
      event: 'ORDER_EXECUTE_START',
      action: 'SELL',
      positionEffect: 'close_long',
    }));
    expect(frame.fields.positionEffect).toBe('close_long');
  });

  test('BacktestRecorder keeps positionEffect while preserving long and short P&L math', () => {
    const recorder = new BacktestRecorder({
      startingBalance: 10000,
      feePerSide: 0,
      feeModel: FeeModel.percent({ makerFee: 0, takerFee: 0 }),
    });

    recorder.recordTrade({
      tradeId: 'LONG-1',
      direction: 'long',
      positionEffect: 'close_long',
      entryPrice: 100,
      exitPrice: 110,
      size: 1000,
      strategyName: 'Witness',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
      scopeKey: 'backtest:alpaca:paper-main:stocks:TSLA:15m',
      scopeKeyVersion: 2,
    });
    recorder.recordTrade({
      tradeId: 'SHORT-1',
      direction: 'short',
      entryPrice: 100,
      exitPrice: 90,
      size: 1000,
      strategyName: 'Witness',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
      scopeKey: 'backtest:alpaca:paper-main:stocks:TSLA:15m',
      scopeKeyVersion: 2,
    });
    recorder.recordTrade({
      tradeId: 'LONG-MALFORMED-1',
      direction: 'long',
      positionEffect: 'open_short',
      entryPrice: 100,
      exitPrice: 110,
      size: 1000,
      strategyName: 'Witness',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
      scopeKey: 'backtest:alpaca:paper-main:stocks:TSLA:15m',
      scopeKeyVersion: 2,
    });
    expect(recorder.trades[0]).toEqual(expect.objectContaining({
      positionEffect: 'close_long',
      rawPnlDollars: 100,
      netPnlDollars: 100,
    }));
    expect(recorder.trades[1]).toEqual(expect.objectContaining({
      positionEffect: 'close_short',
      rawPnlDollars: 100,
      netPnlDollars: 100,
    }));
    expect(recorder.trades[2]).toEqual(expect.objectContaining({
      positionEffect: 'close_long',
      rawPnlDollars: 100,
      netPnlDollars: 100,
    }));
    expect(() => recorder.recordTrade({
      tradeId: 'UNKNOWN-MALFORMED-1',
      positionEffect: 'open_long',
      entryPrice: 100,
      exitPrice: 90,
      size: 1000,
      strategyName: 'Witness',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
      scopeKey: 'backtest:alpaca:paper-main:stocks:TSLA:15m',
      scopeKeyVersion: 2,
    })).toThrow(/requires closed trade direction or close action/);
    expect(() => recorder.recordTrade({
      tradeId: 'ACTION-DIRECTION-MISMATCH-1',
      action: 'BUY',
      direction: 'short',
      positionEffect: 'open_long',
      entryPrice: 100,
      exitPrice: 90,
      size: 1000,
      strategyName: 'Witness',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'backtest',
      timeframe: '15m',
      scopeKey: 'backtest:alpaca:paper-main:stocks:TSLA:15m',
      scopeKeyVersion: 2,
    })).toThrow(/requires closed trade direction or close action/);
    expect(recorder.trades).toHaveLength(3);
  });
});

describe('StateManager positionEffect lifecycle', () => {
  let originalEnv;
  let tempDir;
  let manager;
  let consoleSpies;

  const fullScope = (overrides = {}) => ({
    orderId: 'SHORT-LIFE-1',
    action: 'SELL_SHORT',
    direction: 'short',
    entryStrategy: 'Witness',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'paper-main',
    accountIdSource: 'config',
    assetClass: 'stocks',
    executionMode: 'paper',
    timeframe: '15m',
    exitContract: {
      strategyName: 'Witness',
      stopLossPercent: -1,
      takeProfitPercent: 2,
      useStructuralExits: false,
    },
    entryOrderQuantity: 10,
    entryOrderQuantityUnit: 'shares',
    remainingOrderQuantity: 10,
    remainingOrderQuantityUnit: 'shares',
    ...overrides,
  });

  const ledgerData = (overrides = {}) => {
    const direction = overrides.direction || 'short';
    return {
    candleTimestamp: Date.parse('2026-07-27T12:00:00.000Z'),
    strategySignals: [{
      name: 'Witness',
      direction,
      baseConfidence: 0.8,
      reason: `synthetic ${direction} witness`,
    }],
    orchestratorDecision: {
      winnerStrategy: 'Witness',
      finalConfidence: 0.8,
      reason: 'synthetic decision',
    },
    confluence: { count: 1, sizingMultiplier: 1 },
    positionSizing: {
      basePercent: 0.1,
      confidenceMultiplier: 1,
      confluenceMultiplier: 1,
      finalPercent: 0.1,
      finalSizeUsd: 1000,
      formula: 'test',
    },
    exitContract: {
      strategyName: 'Witness',
      stopLossPercent: -1,
      takeProfitPercent: 2,
      useStructuralExits: false,
    },
    riskGates: [],
    ...overrides,
    };
  };

  beforeEach(() => {
    jest.resetModules();
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-position-effect-'));
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
      require('../foundation/ConfigLoader').clearOverrides();
    } catch (_) {}
    for (const spy of consoleSpies) {
      spy.mockRestore();
    }
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('short lifecycle stamps open_short at birth and derives close_short on confirmed fill', async () => {
    const opened = await manager.openPosition(1000, 100, fullScope({ ledgerData: ledgerData() }));
    expect(opened.success).toBe(true);

    const trade = manager.getActiveTrade('SHORT-LIFE-1');
    expect(trade.positionEffect).toBe('open_short');
    expect(trade.decisionLedger.positionEffect).toBe('open_short');
    expect(trade.decisionLedger.direction).toBe('short');

    const reserved = await manager.reserveExitSlot('SHORT-LIFE-1', 'intent-short-1', {
      submittedAtMs: Date.parse('2026-07-27T12:15:00.000Z'),
      sourceEventId: 'decision-short-1',
      exitFraction: 1,
      expectedRemainingQuantity: 0,
      targetQuantity: 10,
    });
    expect(reserved.success).toBe(true);

    const applied = await manager.applyFill({
      fillId: 'fill-short-1',
      brokerOrderId: 'broker-cover-1',
      tradeId: 'SHORT-LIFE-1',
      intentId: 'intent-short-1',
      sourceEventId: 'decision-short-1',
      lifecycleState: 'full_fill',
      positionEffect: 'open_long',
      exitReason: 'stop_loss',
      triggeredBy: 'test',
      filledQuantity: 10,
      filledQuantityUnit: 'shares',
      filledSizeUsd: 900,
      fillPrice: 90,
      fee: 0,
      expectedQuantity: 10,
      remainingQuantity: 0,
      submittedAtMs: Date.parse('2026-07-27T12:15:00.000Z'),
      confirmedAtMs: Date.parse('2026-07-27T12:16:00.000Z'),
      eventTimeMs: Date.parse('2026-07-27T12:16:00.000Z'),
      executionMode: 'paper',
      simulated: true,
      expectedTradeRevision: trade.tradeRevision,
    });

    expect(applied.success).toBe(true);
    expect(applied.positionEffect).toBe('close_short');
    expect(applied.pnl).toBe(100);
    const closed = manager.get('closedTrades')[0];
    expect(closed).toEqual(expect.objectContaining({
      tradeId: 'SHORT-LIFE-1',
      direction: 'short',
      positionEffect: 'close_short',
      pnl: 100,
    }));
  });

  test('openPosition derives ledger positionEffect instead of trusting caller ledgerData', async () => {
    const openedNull = await manager.openPosition(1000, 100, fullScope({
      orderId: 'OPEN-DERIVED-NULL',
      action: 'SELL_SHORT',
      direction: 'short',
      ledgerData: ledgerData({ positionEffect: null }),
    }));
    expect(openedNull.success).toBe(true);
    expect(manager.getActiveTrade('OPEN-DERIVED-NULL').decisionLedger.positionEffect).toBe('open_short');

    const openedSpoof = await manager.openPosition(1000, 100, fullScope({
      orderId: 'OPEN-DERIVED-SPOOF',
      action: 'BUY',
      direction: 'long',
      symbol: 'NVDA',
      ledgerData: ledgerData({ direction: 'long', positionEffect: 'close_short' }),
    }));
    expect(openedSpoof.success).toBe(true);
    expect(manager.getActiveTrade('OPEN-DERIVED-SPOOF').decisionLedger.positionEffect).toBe('open_long');
  });

  test('closePosition derives close_long from trade direction instead of caller context', async () => {
    const opened = await manager.openPosition(1000, 100, fullScope({
      orderId: 'LONG-LIFE-1',
      action: 'BUY',
      direction: 'long',
      ledgerData: ledgerData({ direction: 'long' }),
    }));
    expect(opened.success).toBe(true);

    const closed = await manager.closePosition(110, false, null, {
      tradeId: 'LONG-LIFE-1',
      positionEffect: 'open_short',
      exitReason: 'manual',
    });
    expect(closed.success).toBe(true);

    const closedTrade = manager.get('closedTrades')[0];
    expect(closedTrade).toEqual(expect.objectContaining({
      tradeId: 'LONG-LIFE-1',
      direction: 'long',
      positionEffect: 'close_long',
      pnl: 100,
    }));
  });
});
