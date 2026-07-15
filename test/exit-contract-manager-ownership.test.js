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

  test('births strategy exit geometry from the selected timeframe contract', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.BASE_CONFIG.exitContracts.TimeframeExitProbe = {
      ...ConfigLoader.BASE_CONFIG.exitContracts.default,
      strategyName: 'TimeframeExitProbe',
      stopLossPercent: -0.5,
      takeProfitPercent: 1.2,
      trailingStopPercent: 0.4,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 90,
      minConfidence: null,
      atrMinPercent: null,
      timeframes: {
        '1h': {
          stopLossPercent: -2.0,
          takeProfitPercent: 4.5,
          trailingStopPercent: 1.5,
          trailingActivation: 2.0,
          maxHoldTimeMinutes: 480,
        },
      },
    };

    const manager = new ExitContractManager();
    const oneHour = manager.createExitContract('TimeframeExitProbe', {}, { timeframe: '1h', volatility: 1 });
    const fifteenMinute = manager.createExitContract('TimeframeExitProbe', {}, { timeframe: '15m', volatility: 1 });

    expect(oneHour).toEqual(expect.objectContaining({
      strategyName: 'TimeframeExitProbe',
      stopLossPercent: -2.0,
      takeProfitPercent: 4.5,
      trailingStopPercent: 1.5,
      trailingActivation: 2.0,
      maxHoldTimeMinutes: 480,
      timeframe: '1h',
    }));
    expect(oneHour.timeframes).toBeUndefined();
    expect(fifteenMinute).toEqual(expect.objectContaining({
      strategyName: 'TimeframeExitProbe',
      stopLossPercent: -0.5,
      takeProfitPercent: 1.2,
      trailingStopPercent: 0.4,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 90,
      timeframe: '15m',
    }));

    delete ConfigLoader.BASE_CONFIG.exitContracts.TimeframeExitProbe;
  });

  test('does not let generic timeframe defaults clobber a locked strategy contract', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    const manager = new ExitContractManager();
    const baseContract = ConfigLoader.BASE_CONFIG.exitContracts.EMASMACrossover;

    const contract = manager.createExitContract('EMASMACrossover', {}, { timeframe: '1h', volatility: 1 });

    expect(contract).toEqual(expect.objectContaining({
      strategyName: 'EMASMACrossover',
      stopLossPercent: baseContract.stopLossPercent,
      takeProfitPercent: baseContract.takeProfitPercent,
      trailingStopPercent: baseContract.trailingStopPercent,
      trailingActivation: baseContract.trailingActivation,
      maxHoldTimeMinutes: baseContract.maxHoldTimeMinutes,
      timeframe: '1h',
    }));
    expect(contract.stopLossPercent).not.toBe(-2.5);
  });

  test('honors runtime per-timeframe exit geometry overrides at trade birth', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.setOverrides({
      exitContracts: {
        RuntimeTimeframeExitProbe: {
          strategyName: 'RuntimeTimeframeExitProbe',
          timeframes: {
            '1h': {
              stopLossPercent: -3.0,
              takeProfitPercent: 6.0,
              trailingStopPercent: 2.0,
              trailingActivation: 2.5,
              maxHoldTimeMinutes: 720,
            },
          },
        },
      },
    });

    try {
      const manager = new ExitContractManager();
      const contract = manager.createExitContract('RuntimeTimeframeExitProbe', {}, { timeframe: '1h', volatility: 1 });

      expect(contract).toEqual(expect.objectContaining({
        strategyName: 'RuntimeTimeframeExitProbe',
        stopLossPercent: -3.0,
        takeProfitPercent: 6.0,
        trailingStopPercent: 2.0,
        trailingActivation: 2.5,
        maxHoldTimeMinutes: 720,
        timeframe: '1h',
      }));
    } finally {
      ConfigLoader.clearOverrides();
    }
  });

  test('honors runtime timeframeConfig overrides for generic strategy contracts', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.setOverrides({
      timeframeConfig: {
        '1h': {
          slPct: 0.031,
          tpPct: 0.062,
          trailPct: 0.021,
          maxHoldMin: 777,
        },
      },
    });

    try {
      const manager = new ExitContractManager();
      const contract = manager.createExitContract('RuntimeGenericTimeframeProbe', {}, { timeframe: '1h', volatility: 1 });

      expect(contract).toEqual(expect.objectContaining({
        strategyName: 'RuntimeGenericTimeframeProbe',
        stopLossPercent: -3.1,
        takeProfitPercent: 6.2,
        trailingStopPercent: 2.1,
        maxHoldTimeMinutes: 777,
        timeframe: '1h',
      }));
    } finally {
      ConfigLoader.clearOverrides();
    }
  });

  test('unknown timeframeConfig fails loudly instead of inheriting 15m exits', () => {
    const manager = new ExitContractManager();

    expect(() => manager.createExitContract('RuntimeGenericTimeframeProbe', {}, { timeframe: '2h', volatility: 1 }))
      .toThrow(/Unknown timeframeConfig '2h'; refusing 15m fallback/);
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

  test('honors RSI2 long exit threshold as a frozen contract invalidation', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');
    const defaultContract = manager.createExitContract('RSI2MeanReversion', {}, {
      timeframe: '15m',
      volatility: 1,
    });
    expect(defaultContract).toEqual(expect.objectContaining({
      strategyName: 'RSI2MeanReversion',
      rsiPeriod: 2,
      rsiExitLong: 80,
      invalidationConditions: expect.arrayContaining(['rsi2_exit_long']),
    }));

    const trade = profitTrade({
      entryStrategy: 'RSI2MeanReversion',
      exitContract: defaultContract,
    });

    const hold = manager.checkExitConditions({ ...trade }, 100, {
      currentTime: now,
      indicators: { rsi: 80 },
      accountBalance: 10000,
      initialBalance: 10000,
      intentId: 'intent-rsi2-hold',
    });
    expect(hold.shouldExit).toBe(false);

    const exit = manager.checkExitConditions(trade, 100, {
      currentTime: now,
      indicators: { rsi2: 80 },
      accountBalance: 10000,
      initialBalance: 10000,
      intentId: 'intent-rsi2-exit',
    });
    expect(exit).toMatchObject({
      shouldExit: true,
      exitReason: 'invalidation',
    });
    expect(exit.details).toContain('RSI2 long exit threshold reached');
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

  test('tracks favorable and adverse excursions while updating active trade profit', () => {
    const manager = new ExitContractManager();
    const trade = profitTrade({
      entryPrice: 100,
      maxProfitPercent: 0,
      maxAdverseExcursionPercent: 0,
    });

    expect(manager.updateMaxProfit(trade, 102)).toBeCloseTo(2);
    expect(trade.maxFavorableExcursionPercent).toBeCloseTo(2);
    expect(trade.maxAdverseExcursionPercent).toBeCloseTo(0);

    expect(manager.updateMaxProfit(trade, 98.5)).toBeCloseTo(2);
    expect(trade.maxFavorableExcursionPercent).toBeCloseTo(2);
    expect(trade.maxAdverseExcursionPercent).toBeCloseTo(-1.5);
  });
});
