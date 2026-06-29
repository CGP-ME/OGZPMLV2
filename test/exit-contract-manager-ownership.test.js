'use strict';

const { ExitContractManager } = require('../core/ExitContractManager');
const { freezePolicy } = require('../core/dto/FrozenExitPolicy');

describe('ExitContractManager exit ownership contract', () => {
  const exitContract = (overrides = {}) => ({
    strategyName: 'EMASMACrossover',
    stopLossPercent: -1,
    takeProfitPercent: 3,
    trailingStopPercent: 0.5,
    trailingActivation: 1,
    maxHoldTimeMinutes: 300,
    useStructuralExits: false,
    invalidationConditions: [],
    ...overrides,
  });

  const frozenPolicy = () => freezePolicy({
    version: 1,
    source: 'test',
    strategyName: 'EMASMACrossover',
    builtAtMs: Date.parse('2026-06-28T12:00:00.000Z'),
    contract: exitContract(),
    profitManagement: {
      beScaleOut: {
        enabled: true,
        triggerType: 'one_to_one_r',
        fixedPercentTrigger: 0.5,
        scaleOutFraction: 0.5,
        feeBufferPercent: 0.05,
      },
      breakEvenStop: { enabled: false, triggerPercent: 0.2 },
      tieredExit: {
        enabled: true,
        enableMarketAdaptation: false,
        allocationBasis: 'cumulative_original_quantity',
        tiers: [
          { name: 'tier1', targetProfitMove: 0.015, exitFraction: 0.3 },
        ],
      },
    },
    fees: {
      model: 'percent',
      makerFee: 0.0025,
      takerFee: 0.004,
      slippage: 0.0005,
      totalRoundTrip: 0.0065,
      safetyBuffer: 0.001,
      perShare: 0,
      minOrderFee: 0,
    },
  });

  const profitTrade = (overrides = {}) => ({
    id: 'PROFIT_1',
    orderId: 'PROFIT_1',
    entryPrice: 100,
    entryTime: Date.parse('2026-06-28T11:45:00.000Z'),
    direction: 'long',
    entryStrategy: 'EMASMACrossover',
    exitContract: exitContract(),
    frozenExitPolicy: frozenPolicy(),
    entryOrderQuantity: 10,
    remainingOrderQuantity: 10,
    entryOrderQuantityUnit: 'shares',
    remainingOrderQuantityUnit: 'shares',
    tradeRevision: 0,
    pendingExitIntent: null,
    beScaleOutState: {
      status: 'idle',
      intentId: null,
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
    },
    tierStates: [{ tierIndex: 0, name: 'tier1', status: 'idle', filledQuantity: 0, brokerOrderIds: [] }],
    ...overrides,
  });

  test('rejects explicit trade exit contracts without structural ownership', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');
    const trade = {
      id: 'OWNERSHIP_1',
      entryPrice: 100,
      entryTime: now - 60000,
      direction: 'long',
      entryStrategy: 'EMASMACrossover',
      exitContract: {
        stopLossPercent: -0.5,
        takeProfitPercent: 1,
      },
    };

    expect(() => manager.checkExitConditions(trade, 100, { currentTime: now }))
      .toThrow(/ExitContractManager\.checkExitConditions: exitContract\.useStructuralExits missing\/invalid/);
  });

  test('default contracts selected by strategy carry explicit structural ownership', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');
    const trade = {
      id: 'OWNERSHIP_2',
      entryPrice: 100,
      entryTime: now - 60000,
      direction: 'long',
      entryStrategy: 'EMASMACrossover',
    };

    expect(() => manager.checkExitConditions(trade, 100, { currentTime: now })).not.toThrow();
    expect(trade.exitContract.useStructuralExits).toBe(false);
  });

  test('routes profit-side exits through the stateless planner after safety checks', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');

    const result = manager.checkExitConditions(profitTrade(), 101, {
      currentTime: now,
      accountBalance: 10000,
      initialBalance: 10000,
      intentId: 'intent-profit-1',
      priceSource: 'state_last_price',
    });

    expect(result).toMatchObject({
      shouldExit: true,
      exitReason: 'be_scaleout',
      confidence: 100,
      exitFraction: 0.5,
    });
    expect(result.exitIntent).toEqual(expect.objectContaining({
      action: 'exit_partial',
      reason: 'be_scaleout',
      stateKey: 'beScaleOutState',
      intentId: 'intent-profit-1',
    }));
  });

  test('keeps contract stop loss ahead of profit planner ownership', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');

    const result = manager.checkExitConditions(profitTrade(), 98, {
      currentTime: now,
      accountBalance: 10000,
      initialBalance: 10000,
      intentId: 'intent-profit-stop',
    });

    expect(result).toMatchObject({
      shouldExit: true,
      exitReason: 'stop_loss',
    });
    expect(result.exitIntent).toBeUndefined();
  });

  test('normalizes maxProfitPercent from trade percent-form before planner trailing checks', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');

    const result = manager.checkExitConditions(profitTrade({
      maxProfitPercent: 1.2,
    }), 100.8, {
      currentTime: now,
      accountBalance: 10000,
      initialBalance: 10000,
      intentId: 'intent-profit-trailing-unit',
    });

    expect(result).toMatchObject({
      shouldExit: false,
      exitReason: null,
    });
    expect(result.profitPlanner).toEqual(expect.objectContaining({
      action: 'none',
      reason: 'no_profit_exit',
    }));
  });
});
