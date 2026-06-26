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
  test.each([
    'symbol',
    'timeframe',
    'executionMode',
    'strategySignals',
    'orchestratorDecision',
    'positionSizing',
    'exitContract',
  ])('rejects missing %s instead of fabricating ledger evidence', field => {
    expect(() => validLedger({ [field]: undefined })).toThrow(`Decision ledger skeleton missing required field(s): ${field}`);
  });

  test('does not substitute unknown symbol, default timeframe, or zero sizing', () => {
    const ledger = validLedger();

    expect(ledger.symbol).toBe('TSLA');
    expect(ledger.timeframe).toBe('15m');
    expect(ledger.executionMode).toBe('backtest');
    expect(ledger.orchestratorDecision.reason).toBe('test decision');
    expect(ledger.positionSizing.finalSizeUsd).toBe(10);
    expect(ledger.exitContract.strategyName).toBe('MADynamicSR');
    expect(JSON.stringify(ledger)).not.toContain('unknown');
    expect(JSON.stringify(ledger)).not.toContain('N/A');
  });

  test('throws validation issues for invalid explicit fields instead of coercing them', () => {
    expect(() => validLedger({ executionMode: 'simulated' })).toThrow('executionMode');
  });

  test('validates indicatorValues records without throwing under zod v4', () => {
    const result = validateLedgerSkeleton(validLedger());

    expect(result.success).toBe(true);
  });

  test('preserves shadow learning snapshots through decision ledger validation', () => {
    const learningSnapshot = {
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      candidateRole: 'winner',
      featureSource: 'patterns[0].features',
      source: 'learned_success',
      status: 'promoted',
      confidence: 0.72,
      wins: 8,
      losses: 3,
      sampleCount: 11,
      modifier: null,
    };
    const ledger = validLedger({
      strategySignals: [{
        name: 'MADynamicSR',
        direction: 'long',
        baseConfidence: 0.8,
        reason: 'test signal',
        learningSnapshot,
      }],
      orchestratorDecision: {
        winnerStrategy: 'MADynamicSR',
        finalConfidence: 0.8,
        winnerAttribution: {
          status: 'exact',
          winnerIndex: 0,
          matchCount: 1,
        },
        learningSnapshot,
        reason: 'test decision',
        competingStrategies: [{
          name: 'MADynamicSR',
          adjustedConfidence: 0.8,
          rejected: false,
          rejectReason: null,
          learningSnapshot,
        }],
      },
    });

    expect(ledger.strategySignals[0].learningSnapshot).toEqual(learningSnapshot);
    expect(ledger.orchestratorDecision.learningSnapshot).toEqual(learningSnapshot);
    expect(ledger.orchestratorDecision.competingStrategies[0].learningSnapshot).toEqual(learningSnapshot);
    expect(validateLedgerSkeleton(ledger).success).toBe(true);
  });

  test('preserves explicit null structural exit fields instead of blocking trade birth', () => {
    const ledger = validLedger({
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
    });

    expect(ledger.exitContract.strategyName).toBe('NoWickImbalance');
    expect(ledger.exitContract.trailingStopPercent).toBeNull();
    expect(ledger.exitContract.trailingActivation).toBeNull();
    expect(ledger.exitContract._validated).toBeNull();
  });

  test('reports malformed indicatorValues as validation issues instead of throwing', () => {
    const ledger = validLedger();
    ledger.strategySignals = [{
      name: 'MADynamicSR',
      direction: 'long',
      baseConfidence: 0.8,
      reason: 'test signal',
      indicatorValues: { rsi: { nested: 'not allowed' } },
    }];

    const result = validateLedgerSkeleton(ledger);

    expect(result.success).toBe(false);
    expect(result.error.issues.some(issue => issue.path.join('.') === 'strategySignals.0.indicatorValues.rsi')).toBe(true);
  });

  test('rejects non-object indicatorValues instead of treating them as missing', () => {
    const ledger = validLedger();
    ledger.strategySignals = [{
      name: 'MADynamicSR',
      direction: 'long',
      baseConfidence: 0.8,
      reason: 'test signal',
      indicatorValues: 'not-an-object',
    }];

    const result = validateLedgerSkeleton(ledger);

    expect(result.success).toBe(false);
    expect(result.error.issues.some(issue => issue.path.join('.') === 'strategySignals.0.indicatorValues')).toBe(true);
  });
});
