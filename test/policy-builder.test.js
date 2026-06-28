'use strict';

const { buildPolicyHash } = require('../core/dto/FrozenExitPolicy');
const PolicyBuilder = require('../core/PolicyBuilder');

describe('PolicyBuilder frozen exit policy', () => {
  const fixedNowMs = Date.parse('2026-06-28T18:30:00.000Z');

  const exitContract = (overrides = {}) => ({
    stopLossPercent: -0.5,
    takeProfitPercent: 1.0,
    trailingStopPercent: 0.8,
    trailingActivation: 1.0,
    maxHoldTimeMinutes: 300,
    minConfidence: 0.68,
    atrMinPercent: null,
    useStructuralExits: false,
    invalidationConditions: ['ema_cross_reversal'],
    _validated: '2026-03-20',
    ...overrides,
  });

  const configValues = (overrides = {}) => ({
    'exitLogic.beScaleOut.enabled': true,
    'exitLogic.beScaleOut.triggerType': 'one_to_one_r',
    'exitLogic.beScaleOut.fixedPercentTrigger': 0.5,
    'exitLogic.beScaleOut.scaleOutFraction': 0.5,
    'exitLogic.beScaleOut.feeBufferPercent': 0.05,
    'exitLogic.breakEvenStop.enabled': false,
    'exitLogic.breakEvenStop.triggerPercent': 0.2,
    'exitLogic.tieredExit.enabled': true,
    'exitLogic.tieredExit.tier1ExitFraction': 0.30,
    'exitLogic.tieredExit.tier2ExitFraction': 0.30,
    'exitLogic.tieredExit.tier3ExitFraction': 0.20,
    'exitLogic.tieredExit.enableMarketAdaptation': true,
    'exitLogic.tieredExit.trendingTargetMultiplier': 1.3,
    'exitLogic.tieredExit.rangingTargetMultiplier': 0.8,
    'exitLogic.tieredExit.highConfidenceThreshold': 0.8,
    'exitLogic.tieredExit.highConfidenceMultiplier': 1.2,
    'exitLogic.tieredExit.lowConfidenceThreshold': 0.6,
    'exitLogic.tieredExit.lowConfidenceMultiplier': 0.8,
    'exits.profitTiers.tier1': 0.015,
    'exits.profitTiers.tier2': 0.020,
    'exits.profitTiers.tier3': 0.030,
    'exits.profitTiers.final': 0.050,
    'fees.model': 'percent',
    'fees.makerFee': 0.0025,
    'fees.takerFee': 0.004,
    'fees.slippage': 0.0005,
    'fees.totalRoundTrip': 0.0065,
    'fees.safetyBuffer': 0.001,
    'fees.perShare': 0,
    'fees.minOrderFee': 0,
    ...overrides,
  });

  const reader = (values = configValues()) => ({
    get: jest.fn((path) => values[path]),
  });

  test('freezes a stable per-trade policy from explicit contract and config values', () => {
    const configReader = reader();
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader,
    });

    expect(policy).toMatchObject({
      version: 1,
      source: 'PolicyBuilder.buildForTrade',
      strategyName: 'EMASMACrossover',
      builtAtMs: fixedNowMs,
      contract: {
        strategyName: 'EMASMACrossover',
        stopLossPercent: -0.5,
        takeProfitPercent: 1.0,
        trailingStopPercent: 0.8,
        trailingActivation: 1.0,
        maxHoldTimeMinutes: 300,
        invalidationConditions: ['ema_cross_reversal'],
      },
      profitManagement: {
        beScaleOut: {
          enabled: true,
          triggerType: 'one_to_one_r',
          scaleOutFraction: 0.5,
        },
        tieredExit: {
          allocationBasis: 'cumulative_original_quantity',
        },
      },
      fees: {
        model: 'percent',
        totalRoundTrip: 0.0065,
      },
    });
    expect(policy.policyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildPolicyHash(policy)).toBe(policy.policyHash);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.contract)).toBe(true);
    expect(Object.isFrozen(policy.profitManagement.beScaleOut)).toBe(true);
    expect(Object.isFrozen(policy.profitManagement.tieredExit.tiers[0])).toBe(true);
    expect(configReader.get).toHaveBeenCalledWith('exitLogic.beScaleOut.enabled');
    expect(configReader.get).toHaveBeenCalledWith('fees.minOrderFee');
  });

  test('returns the same hash for the same explicit inputs', () => {
    const first = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(),
    });
    const second = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(),
    });

    expect(first.policyHash).toBe(second.policyHash);
  });

  test('does not include runtime build timestamp in policy identity hash', () => {
    const first = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(),
    });
    const second = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs + 1000,
      configReader: reader(),
    });

    expect(first.builtAtMs).not.toBe(second.builtAtMs);
    expect(first.policyHash).toBe(second.policyHash);
    expect(buildPolicyHash(first)).toBe(first.policyHash);
    expect(buildPolicyHash(second)).toBe(second.policyHash);
  });

  test('does not include validation provenance in policy identity hash', () => {
    const first = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ _validated: '2026-03-20' }),
      nowMs: fixedNowMs,
      configReader: reader(),
    });
    const second = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ _validated: '2026-06-28T18:45:00.000Z' }),
      nowMs: fixedNowMs,
      configReader: reader(),
    });

    expect(first.contract.validatedAt).not.toBe(second.contract.validatedAt);
    expect(first.policyHash).toBe(second.policyHash);
  });

  test('does not retain mutable references to input contract objects', () => {
    const input = exitContract();
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: input,
      nowMs: fixedNowMs,
      configReader: reader(),
    });

    input.invalidationConditions.push('late_mutation');
    input.stopLossPercent = -99;

    expect(policy.contract.invalidationConditions).toEqual(['ema_cross_reversal']);
    expect(policy.contract.stopLossPercent).toBe(-0.5);
  });

  test('requires the actual strategy exit contract and does not fall back to default', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      nowMs: fixedNowMs,
      configReader: reader(),
    })).toThrow(/exitContract must be a plain object/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ stopLossPercent: undefined }),
      nowMs: fixedNowMs,
      configReader: reader(),
    })).toThrow(/exitContract.stopLossPercent must be a finite number/);

    const missingStructuralFlag = exitContract();
    delete missingStructuralFlag.useStructuralExits;

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: missingStructuralFlag,
      nowMs: fixedNowMs,
      configReader: reader(),
    })).toThrow(/exitContract.useStructuralExits is required/);
  });

  test('fails loudly when a required central config value is missing', () => {
    const values = configValues();
    delete values['exitLogic.beScaleOut.scaleOutFraction'];

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(values),
    })).toThrow(/missing TradingConfig value: exitLogic\.beScaleOut\.scaleOutFraction/);
  });

  test('preserves structural-exit contracts with null trailing fields', () => {
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'NoWickImbalance',
      exitContract: exitContract({
        trailingStopPercent: null,
        trailingActivation: null,
        useStructuralExits: true,
        _validated: null,
      }),
      nowMs: fixedNowMs,
      configReader: reader(),
    });

    expect(policy.contract.trailingStopPercent).toBeNull();
    expect(policy.contract.trailingActivation).toBeNull();
    expect(policy.contract.useStructuralExits).toBe(true);
  });

  test('rejects tier allocations that exceed confirmed position size', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(configValues({
        'exitLogic.tieredExit.tier1ExitFraction': 0.6,
        'exitLogic.tieredExit.tier2ExitFraction': 0.5,
        'exitLogic.tieredExit.tier3ExitFraction': 0.2,
      })),
    })).toThrow(/fractions cannot exceed 1\.0 total/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(configValues({
        'exitLogic.tieredExit.tier1ExitFraction': -0.1,
      })),
    })).toThrow(/tier1ExitFraction must be between 0 and 1/);
  });

  test('rejects invalid break-even scale-out fraction and percent-form buffers', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(configValues({
        'exitLogic.beScaleOut.scaleOutFraction': 1.2,
      })),
    })).toThrow(/scaleOutFraction must be between 0 and 1/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(configValues({
        'exitLogic.beScaleOut.feeBufferPercent': 101,
      })),
    })).toThrow(/feeBufferPercent must be between 0 and 100 percent-form/);

    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      configReader: reader(configValues({
        'exitLogic.beScaleOut.feeBufferPercent': 2,
      })),
    });

    expect(policy.profitManagement.beScaleOut.feeBufferPercent).toBe(2);
  });

  test('rejects invalid strategy contract numeric semantics', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ stopLossPercent: 0.5 }),
      nowMs: fixedNowMs,
      configReader: reader(),
    })).toThrow(/stopLossPercent must be negative percent-form/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ takeProfitPercent: -1 }),
      nowMs: fixedNowMs,
      configReader: reader(),
    })).toThrow(/takeProfitPercent must be greater than 0/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ maxHoldTimeMinutes: 0 }),
      nowMs: fixedNowMs,
      configReader: reader(),
    })).toThrow(/maxHoldTimeMinutes must be greater than 0/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ minConfidence: 1.2 }),
      nowMs: fixedNowMs,
      configReader: reader(),
    })).toThrow(/minConfidence must be between 0 and 1/);
  });

  test('requires explicit build time instead of hidden Date.now lifecycle state', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      configReader: reader(),
    })).toThrow(/nowMs must be a finite number/);
  });

  test('does not read process.env while building with an injected config reader', () => {
    const original = process.env.BE_SCALEOUT_FRACTION;
    process.env.BE_SCALEOUT_FRACTION = '0.99';
    try {
      const policy = PolicyBuilder.buildForTrade({
        strategyName: 'EMASMACrossover',
        exitContract: exitContract(),
        nowMs: fixedNowMs,
        configReader: reader(configValues({
          'exitLogic.beScaleOut.scaleOutFraction': 0.25,
        })),
      });

      expect(policy.profitManagement.beScaleOut.scaleOutFraction).toBe(0.25);
    } finally {
      if (original === undefined) {
        delete process.env.BE_SCALEOUT_FRACTION;
      } else {
        process.env.BE_SCALEOUT_FRACTION = original;
      }
    }
  });

  test('builds with the default TradingConfig class reader', () => {
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
    });

    expect(policy.strategyName).toBe('EMASMACrossover');
    expect(policy.profitManagement.beScaleOut).toHaveProperty('scaleOutFraction');
    expect(policy.fees).toHaveProperty('totalRoundTrip');
  });
});
