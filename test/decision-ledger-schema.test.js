'use strict';

const {
  createLedgerSkeleton,
  validateLedgerSkeleton,
} = require('../core/dto/DecisionLedgerSchema');

function validLedger(overrides = {}) {
  return createLedgerSkeleton({
    tradeId: 'ledger-test-1',
    candleTimestamp: Date.parse('2026-05-29T18:45:00.000Z'),
    symbol: 'TSLA',
    timeframe: '15m',
    executionMode: 'backtest',
    entryPrice: 100,
    direction: 'long',
    strategySignals: [{
      name: 'MADynamicSR',
      direction: 'long',
      baseConfidence: 0.8,
      reason: 'test signal',
      indicatorValues: {
        rsi: 55,
        trend: 'ranging',
        atr: null,
      },
    }],
    orchestratorDecision: {
      winnerStrategy: 'MADynamicSR',
      finalConfidence: 0.8,
      reason: 'test decision',
      competingStrategies: [{
        name: 'MADynamicSR',
        adjustedConfidence: 0.8,
        rejected: false,
        rejectReason: null,
      }],
    },
    confluence: { count: 1, sizingMultiplier: 1 },
    positionSizing: {
      basePercent: 0.001,
      confidenceMultiplier: 1,
      confluenceMultiplier: 1,
      finalPercent: 0.001,
      finalSizeUsd: 10,
      formula: 'test',
    },
    exitContract: {
      strategyName: 'MADynamicSR',
      stopLossPercent: -0.5,
      takeProfitPercent: 1,
    },
    ...overrides,
  });
}

describe('DecisionLedgerSchema', () => {
  test('validates indicatorValues records without throwing under zod v4', () => {
    const result = validateLedgerSkeleton(validLedger());

    expect(result.success).toBe(true);
  });

  test('reports malformed indicatorValues as validation issues instead of throwing', () => {
    const ledger = validLedger({
      strategySignals: [{
        name: 'MADynamicSR',
        direction: 'long',
        baseConfidence: 0.8,
        reason: 'test signal',
        indicatorValues: { rsi: { nested: 'not allowed' } },
      }],
    });

    const result = validateLedgerSkeleton(ledger);

    expect(result.success).toBe(false);
    expect(result.error.issues.some(issue => issue.path.join('.') === 'strategySignals.0.indicatorValues.rsi')).toBe(true);
  });

  test('rejects non-object indicatorValues instead of treating them as missing', () => {
    const ledger = validLedger({
      strategySignals: [{
        name: 'MADynamicSR',
        direction: 'long',
        baseConfidence: 0.8,
        reason: 'test signal',
        indicatorValues: 'not-an-object',
      }],
    });

    const result = validateLedgerSkeleton(ledger);

    expect(result.success).toBe(false);
    expect(result.error.issues.some(issue => issue.path.join('.') === 'strategySignals.0.indicatorValues')).toBe(true);
  });
});
