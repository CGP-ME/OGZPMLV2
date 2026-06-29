'use strict';

const ProfitExitPlanner = require('../core/ProfitExitPlanner');
const { freezePolicy } = require('../core/dto/FrozenExitPolicy');

describe('ProfitExitPlanner', () => {
  const policy = (overrides = {}) => freezePolicy({
    version: 1,
    source: 'test',
    strategyName: 'EMASMACrossover',
    builtAtMs: Date.parse('2026-06-28T19:00:00.000Z'),
    contract: {
      strategyName: 'EMASMACrossover',
      stopLossPercent: -1,
      takeProfitPercent: 3,
      trailingStopPercent: 0.5,
      trailingActivation: 1,
      maxHoldTimeMinutes: 300,
      minConfidence: 0.7,
      atrMinPercent: null,
      useStructuralExits: false,
      invalidationConditions: [],
      validatedAt: 'test',
    },
    profitManagement: {
      beScaleOut: {
        enabled: true,
        triggerType: 'one_to_one_r',
        fixedPercentTrigger: 0.5,
        scaleOutFraction: 0.5,
        feeBufferPercent: 0.05,
      },
      breakEvenStop: {
        enabled: false,
        triggerPercent: 0.2,
      },
      tieredExit: {
        enabled: true,
        enableMarketAdaptation: false,
        allocationBasis: 'cumulative_original_quantity',
        tiers: [
          { name: 'tier1', targetProfitMove: 0.015, exitFraction: 0.3 },
          { name: 'tier2', targetProfitMove: 0.02, exitFraction: 0.3 },
          { name: 'tier3', targetProfitMove: 0.03, exitFraction: 0.2 },
          { name: 'final', targetProfitMove: 0.05, exitFraction: 0.2 },
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
    ...overrides,
  });

  const snapshot = (overrides = {}) => ({
    tradeId: 'trade-1',
    intentId: 'intent-1',
    tradeRevision: 0,
    executionMode: 'backtest',
    brokerId: 'alpaca',
    accountId: 'acct-1',
    assetClass: 'stocks',
    symbol: 'TSLA',
    timeframe: '15m',
    sessionId: 'session-1',
    scopeKey: 'scope-1',
    direction: 'long',
    entryPrice: 100,
    entryTimeMs: Date.parse('2026-06-28T18:00:00.000Z'),
    entryOrderQuantity: 10,
    remainingOrderQuantity: 10,
    quantityUnit: 'shares',
    currentPrice: 100.5,
    maxProfitPercent: 0.005,
    frozenExitPolicy: policy(),
    pendingExitIntent: null,
    beScaleOutState: {
      status: 'idle',
      targetQuantity: null,
      filledQuantity: 0,
      brokerOrderIds: [],
      intentId: null,
    },
    tierStates: [
      { tierIndex: 0, status: 'idle', filledQuantity: 0 },
      { tierIndex: 1, status: 'idle', filledQuantity: 0 },
      { tierIndex: 2, status: 'idle', filledQuantity: 0 },
      { tierIndex: 3, status: 'idle', filledQuantity: 0 },
    ],
    priceSource: 'candle_close',
    eventTimeMs: Date.parse('2026-06-28T18:15:00.000Z'),
    receivedAtMs: Date.parse('2026-06-28T18:15:01.000Z'),
    nowMs: Date.parse('2026-06-28T18:15:00.000Z'),
    ...overrides,
  });

  test('does not own the original contract hard stop', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 98,
      maxProfitPercent: 0,
      frozenExitPolicy: policy({
        profitManagement: {
          beScaleOut: {
            enabled: false,
            triggerType: 'one_to_one_r',
            fixedPercentTrigger: 0.5,
            scaleOutFraction: 0.5,
            feeBufferPercent: 0.05,
          },
          breakEvenStop: { enabled: false, triggerPercent: 0.2 },
          tieredExit: { enabled: false, allocationBasis: 'cumulative_original_quantity', tiers: [] },
        },
      }),
    }));

    expect(result).toMatchObject({
      action: 'none',
      reason: 'no_profit_exit',
      exitFraction: null,
    });
  });

  test('emits break-even scaleout intent without broker or state fields', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 101,
      maxProfitPercent: 0.01,
    }));

    expect(result).toMatchObject({
      action: 'exit_partial',
      reason: 'be_scaleout',
      exitRole: 'profit',
      stateKey: 'beScaleOutState',
      exitFraction: 0.5,
      intentId: 'intent-1',
      expectedTradeRevision: 0,
      expectedRemainingQuantity: 5,
    });
    expect(result).not.toHaveProperty('exitSize');
    expect(result).not.toHaveProperty('remainingSize');
    expect(result).not.toHaveProperty('filledQuantity');
    expect(result).not.toHaveProperty('brokerOrderId');
  });

  test('does not re-fire scaleout while the scaleout state is pending', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 101,
      maxProfitPercent: 0.01,
      beScaleOutState: {
        status: 'pending',
        targetQuantity: 5,
        filledQuantity: 0,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
    }));

    expect(result.action).toBe('none');
    expect(result.reason).toBe('no_profit_exit');
  });

  test('fails loudly on malformed break-even scaleout trigger config', () => {
    expect(() => ProfitExitPlanner.plan(snapshot({
      currentPrice: 101,
      maxProfitPercent: 0.01,
      frozenExitPolicy: policy({
        profitManagement: {
          beScaleOut: {
            enabled: true,
            triggerType: 'unsupported',
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
      }),
    }))).toThrow(/unsupported beScaleOut triggerType/);

    expect(() => ProfitExitPlanner.plan(snapshot({
      currentPrice: 101,
      maxProfitPercent: 0.01,
      frozenExitPolicy: policy({
        profitManagement: {
          beScaleOut: {
            enabled: true,
            triggerType: 'fixed_percent',
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
      }),
    }))).toThrow(/fixedPercentTrigger must be a finite number/);
  });

  test('emits only the first eligible idle tier intent', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 102.5,
      maxProfitPercent: 0.025,
      beScaleOutState: {
        status: 'complete',
        targetQuantity: 5,
        filledQuantity: 5,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
    }));

    expect(result).toMatchObject({
      action: 'exit_partial',
      reason: 'profit_tier_1',
      stateKey: 'tierStates',
      tierIndex: 0,
      exitFraction: 0.3,
      expectedRemainingQuantity: 7,
    });
  });

  test('allocates open tiers by remaining open-tier weight after prior exits', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 102.5,
      maxProfitPercent: 0.025,
      remainingOrderQuantity: 1.1024260557099392,
      beScaleOutState: {
        status: 'complete',
        targetQuantity: 1.5748943652999132,
        filledQuantity: 1.5748943652999132,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
      tierStates: [
        { tierIndex: 0, status: 'complete', targetQuantity: 0.47246830958997393, filledQuantity: 0.47246830958997393 },
        { tierIndex: 1, status: 'idle', filledQuantity: 0 },
        { tierIndex: 2, status: 'idle', filledQuantity: 0 },
        { tierIndex: 3, status: 'idle', filledQuantity: 0 },
      ],
      frozenExitPolicy: policy({
        profitManagement: {
          ...policy().profitManagement,
          tieredExit: {
            ...policy().profitManagement.tieredExit,
            allocationBasis: 'open_tier_weight',
          },
        },
      }),
    }));

    expect(result).toMatchObject({
      action: 'exit_partial',
      reason: 'profit_tier_2',
      tierIndex: 1,
    });
    expect(result.exitFraction).toBeCloseTo(0.3 / 0.7, 12);
    expect(result.expectedRemainingQuantity).toBeCloseTo(0.6299577461199652, 12);
  });

  test('caps cumulative-original tier quantity against confirmed remaining quantity', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 102.5,
      maxProfitPercent: 0.025,
      remainingOrderQuantity: 2,
      beScaleOutState: {
        status: 'complete',
        targetQuantity: 5,
        filledQuantity: 5,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
    }));

    expect(result).toMatchObject({
      action: 'exit_full',
      reason: 'profit_tier_1',
      exitFraction: 1,
      expectedRemainingQuantity: 0,
    });
  });

  test('does not emit a new exit while another exit intent is pending', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 102.5,
      pendingExitIntent: {
        intentId: 'intent-open',
        lifecycleState: 'submitted',
      },
    }));

    expect(result).toMatchObject({
      action: 'none',
      reason: 'exit_already_pending',
      exitFraction: null,
    });
  });

  test('fails loudly on malformed pending exit intent instead of treating it as pending', () => {
    expect(() => ProfitExitPlanner.plan(snapshot({
      currentPrice: 102.5,
      pendingExitIntent: {},
    }))).toThrow(/pendingExitIntent\.lifecycleState must be a non-empty string/);
  });

  test('does not emit trailing-stop intents because ECM owns dynamic trailing', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 101.1,
      maxProfitPercent: 0.02,
      beScaleOutState: {
        status: 'complete',
        targetQuantity: 5,
        filledQuantity: 5,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
      tierStates: [
        { tierIndex: 0, status: 'complete', filledQuantity: 3 },
        { tierIndex: 1, status: 'idle', filledQuantity: 0 },
        { tierIndex: 2, status: 'idle', filledQuantity: 0 },
        { tierIndex: 3, status: 'idle', filledQuantity: 0 },
      ],
    }));

    expect(result).toMatchObject({
      action: 'none',
      reason: 'no_profit_exit',
      exitFraction: null,
      exitRole: null,
    });
  });

  test('supports short direction profit math', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      direction: 'short',
      currentPrice: 99,
      maxProfitPercent: 0.01,
    }));

    expect(result).toMatchObject({
      action: 'exit_partial',
      reason: 'be_scaleout',
      exitFraction: 0.5,
    });
  });

  test('supports legacy SELL direction token as short-side exposure', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      direction: 'SELL',
      currentPrice: 99,
      maxProfitPercent: 0.01,
    }));

    expect(result).toMatchObject({
      action: 'exit_partial',
      reason: 'be_scaleout',
      exitFraction: 0.5,
    });
  });

  test('does not mutate the supplied snapshot or frozen policy', () => {
    const input = snapshot({
      currentPrice: 102.5,
      maxProfitPercent: 0.025,
      beScaleOutState: {
        status: 'complete',
        targetQuantity: 5,
        filledQuantity: 5,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
    });
    const before = JSON.stringify(input);

    ProfitExitPlanner.plan(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input.frozenExitPolicy)).toBe(true);
  });

  test('fails loudly on invalid snapshot and policy shape', () => {
    expect(() => ProfitExitPlanner.plan(snapshot({
      frozenExitPolicy: null,
    }))).toThrow(/snapshot\.frozenExitPolicy must be a plain object/);

    expect(() => ProfitExitPlanner.plan(snapshot({
      remainingOrderQuantity: 0,
    }))).toThrow(/snapshot\.remainingOrderQuantity must be greater than 0/);

    expect(() => ProfitExitPlanner.plan(snapshot({
      intentId: '',
    }))).toThrow(/snapshot\.intentId must be a non-empty string/);
  });

  test('ignores trailing stop contract fields because ECM owns dynamic trailing', () => {
    const result = ProfitExitPlanner.plan(snapshot({
      currentPrice: 101.1,
      maxProfitPercent: 0.02,
      beScaleOutState: {
        status: 'complete',
        targetQuantity: 5,
        filledQuantity: 5,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
      tierStates: [
        { tierIndex: 0, status: 'complete', filledQuantity: 3 },
        { tierIndex: 1, status: 'idle', filledQuantity: 0 },
        { tierIndex: 2, status: 'idle', filledQuantity: 0 },
        { tierIndex: 3, status: 'idle', filledQuantity: 0 },
      ],
      frozenExitPolicy: policy({
        contract: {
          strategyName: 'EMASMACrossover',
          stopLossPercent: -1,
          takeProfitPercent: 3,
          trailingActivation: 1,
          maxHoldTimeMinutes: 300,
          minConfidence: 0.7,
          atrMinPercent: null,
          useStructuralExits: false,
          invalidationConditions: [],
          validatedAt: 'test',
        },
      }),
    }));

    expect(result).toMatchObject({
      action: 'none',
      reason: 'no_profit_exit',
    });
  });

  test('requires lifecycle state objects instead of assuming idle state', () => {
    expect(() => ProfitExitPlanner.plan(snapshot({
      beScaleOutState: null,
    }))).toThrow(/snapshot\.beScaleOutState must be a plain object/);

    expect(() => ProfitExitPlanner.plan(snapshot({
      currentPrice: 102.5,
      maxProfitPercent: 0.025,
      beScaleOutState: {
        status: 'complete',
        targetQuantity: 5,
        filledQuantity: 5,
        brokerOrderIds: ['order-1'],
        intentId: 'intent-old',
      },
      tierStates: [],
    }))).toThrow(/snapshot\.tierStates\[0\] is required/);
  });
});
