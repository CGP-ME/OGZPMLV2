'use strict';

// Fourth Shape: prove reasons at their producers, rather than adding a
// TradingLoop throw for a state these producers cannot return.
// Contracts and market data below are synthetic; fees are controlled.
jest.mock('../foundation/ConfigLoader', () => ({ get: () => ({}) }));
jest.mock('../core/FeeModel', () => ({ roundTripFeePercentForTrade: () => 0.1 }));

const { ExitContractManager } = require('../core/ExitContractManager');

function trade() {
  const contract = {
    useStructuralExits: false, stopType: 'percent', stopLossPercent: -2,
    maxHoldMode: 'off', invalidationConditions: [],
  };
  return {
    id: 'reason-fixture', direction: 'long', action: 'BUY', symbol: 'TSLA',
    entryPrice: 100, entryTime: 1, entryOrderQuantity: 10,
    remainingOrderQuantity: 10, tradeRevision: 0, maxProfitPercent: 0,
    exitContract: contract,
    frozenExitPolicy: {
      contract: { ...contract },
      profitManagement: {
        beScaleOut: { enabled: false }, tieredExit: { enabled: false },
        trail: { enabled: false }, breakEvenStop: { enabled: false },
      },
    },
    pendingExitIntent: null,
    beScaleOutState: { status: 'idle', filledQuantity: 0 }, tierStates: [],
  };
}

const cases = [
  ['strategy stop', 'stop_loss', 97, () => {}],
  ['break-even stop', 'break_even', 99, t => { t.maxProfitPercent = 3; }],
  ['maximum hold winner', 'max_hold_winner', 101, t => {
    Object.assign(t.exitContract, { maxHoldMode: 'minutes', maxHoldTimeMinutes: 1 });
  }],
  ['maximum hold loser', 'max_hold_loser', 100, t => {
    Object.assign(t.exitContract, { maxHoldMode: 'minutes', maxHoldTimeMinutes: 1 });
  }],
  ['invalidation', 'invalidation', 100, t => {
    t.exitContract.invalidationConditions = ['ema_cross_reversal'];
    t.entryIndicators = { ema9: 3, ema20: 2 };
  }],
  ['channel stop', 'channel_trail', 97, t => {
    Object.assign(t.exitContract, { stopType: 'structural', trailType: 'channel', trailChannelBars: 1 });
  }],
  ['managed trailing stop', 'trailing_stop', 100, t => {
    t.currentStop = 101; t.trailingActive = true;
  }],
  ['managed break-even stop', 'break_even', 100, t => {
    t.currentStop = 101; t.breakevenActive = true;
  }],
  ['scale-out', 'be_scaleout', 103, t => {
    t.frozenExitPolicy.profitManagement.beScaleOut = {
      enabled: true, triggerType: 'one_to_one_r', scaleOutFraction: 0.5,
    };
  }],
  ['contract partial', 'partial_exit_1r', 103, t => {
    t.frozenExitPolicy.contract.partialExit = { enabled: true, triggerR: 1, fraction: 0.5 };
  }],
  ...['tier7', 'final', '', null].map(name => [
    `profit tier named ${JSON.stringify(name)}`,
    name === 'tier7' ? 'profit_tier_7' : 'profit_tier_1', 103, t => {
      t.frozenExitPolicy.profitManagement.tieredExit = {
        enabled: true, allocationBasis: 'remaining_quantity',
        tiers: [{ name, targetProfitMove: 0.01, exitFraction: name === 'final' ? 1 : 0.5 }],
      };
      t.tierStates = [{ status: 'idle', filledQuantity: 0 }];
    },
  ]),
];

describe('exit reason producer contract', () => {
  test.each(cases)('%s supplies its reason through the real coordinator', (_label, reason, price, prepare) => {
    const active = trade();
    prepare(active);
    const result = new ExitContractManager().checkExitConditions(active, price, {
      currentTime: 120001, intentId: 'reason-intent',
      indicators: { ema9: 1, ema20: 2 },
      priceHistory: [{ h: 102, l: 99, c: 100 }, { h: 101, l: 97, c: 97 }],
    });
    expect(result).toMatchObject({ shouldExit: true, exitReason: reason });
    if (result.exitIntent) expect(result.exitReason).toBe(result.exitIntent.reason);
  });

  test('no exit produces no exit reason', () => {
    expect(new ExitContractManager().checkExitConditions(trade(), 100, {
      currentTime: 120001, intentId: 'reason-intent',
    })).toMatchObject({ shouldExit: false, exitReason: null });
  });
});
