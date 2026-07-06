'use strict';

const { buildPolicyHash } = require('../core/dto/FrozenExitPolicy');
const PolicyBuilder = require('../core/PolicyBuilder');
const ConfigLoader = require('../foundation/ConfigLoader');

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
    'exitLogic.volatilityAdjustment.enabled': false,
    'exitLogic.volatilityAdjustment.lowThresholdPercent': 0.5,
    'exitLogic.volatilityAdjustment.highThresholdPercent': 2.0,
    'exitLogic.volatilityAdjustment.lookbackPeriods': 20,
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
  const policyContext = Object.freeze({
    volatility: 0.01,
    confidence: 0.75,
    marketCondition: 'normal',
  });

  test('freezes a stable per-trade policy from explicit contract and config values', () => {
    const configReader = reader();
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
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
      mtfConfluenceSnapshot: {
        available: false,
        source: 'none',
        entryDirection: 'unknown',
        direction: 'neutral',
        alignment: 'unknown',
        score: 0,
        magnitude: 0,
        confidence: 0,
        readyTimeframes: [],
      },
      profitManagement: {
        beScaleOut: {
          enabled: true,
          triggerType: 'one_to_one_r',
          scaleOutFraction: 0.5,
        },
        tieredExit: {
          allocationBasis: 'open_tier_weight',
          adjustment: {
            volatilityTargetFactor: 1,
            marketCondition: 'normal',
            confidenceMultiplier: 1,
            combinedTargetMultiplier: 1,
          },
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
    expect(Object.isFrozen(policy.mtfConfluenceSnapshot)).toBe(true);
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
      ...policyContext,
      configReader: reader(),
    });
    const second = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    });

    expect(first.policyHash).toBe(second.policyHash);
  });

  test('does not include runtime build timestamp in policy identity hash', () => {
    const first = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    });
    const second = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs + 1000,
      ...policyContext,
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
      ...policyContext,
      configReader: reader(),
    });
    const second = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ _validated: '2026-06-28T18:45:00.000Z' }),
      nowMs: fixedNowMs,
      ...policyContext,
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
      ...policyContext,
      configReader: reader(),
    });

    input.invalidationConditions.push('late_mutation');
    input.stopLossPercent = -99;

    expect(policy.contract.invalidationConditions).toEqual(['ema_cross_reversal']);
    expect(policy.contract.stopLossPercent).toBe(-0.5);
  });

  test('preserves the selected exit contract timeframe in the frozen policy', () => {
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ timeframe: '1h' }),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    });

    expect(policy.contract.timeframe).toBe('1h');
  });

  test('freezes an aligned MTF confluence snapshot at trade birth', () => {
    const mtfConfluenceSnapshot = {
      direction: 'buy',
      confluenceScore: 0.42,
      confidence: 0.7,
      readyTimeframes: ['15m', '1h'],
      totalTimeframes: 4,
      shouldTrade: true,
      overallBias: 'bullish',
    };

    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
      entryDirection: 'long',
      mtfConfluenceSnapshot,
      configReader: reader(),
    });

    mtfConfluenceSnapshot.readyTimeframes.push('4h');
    mtfConfluenceSnapshot.confluenceScore = -0.99;

    expect(policy.mtfConfluenceSnapshot).toEqual({
      available: true,
      source: 'StrategyOrchestrator.mtfConfluence',
      entryDirection: 'long',
      direction: 'buy',
      alignment: 'aligned',
      score: 0.42,
      magnitude: 0.42,
      confidence: 0.7,
      readyTimeframes: ['15m', '1h'],
      totalTimeframes: 4,
      shouldTrade: true,
      overallBias: 'bullish',
    });
    expect(Object.isFrozen(policy.mtfConfluenceSnapshot.readyTimeframes)).toBe(true);
  });

  test('marks MTF snapshot conflicts against short entries', () => {
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
      entryDirection: 'short',
      mtfConfluenceSnapshot: {
        direction: 'buy',
        confluenceScore: 0.25,
        confidence: 0.6,
        readyTimeframes: ['1h'],
      },
      configReader: reader(),
    });

    expect(policy.mtfConfluenceSnapshot).toMatchObject({
      entryDirection: 'short',
      direction: 'buy',
      alignment: 'conflicted',
    });
  });

  test('requires the actual strategy exit contract and does not fall back to default', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    })).toThrow(/exitContract must be a plain object/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ stopLossPercent: undefined }),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    })).toThrow(/exitContract.stopLossPercent must be a finite number/);

    const missingStructuralFlag = exitContract();
    delete missingStructuralFlag.useStructuralExits;

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: missingStructuralFlag,
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    })).toThrow(/exitContract.useStructuralExits is required/);
  });

  test('fails loudly when MTF snapshot fields are malformed', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
      entryDirection: 'long',
      mtfConfluenceSnapshot: {
        direction: 'buy',
        confluenceScore: 0.25,
        confidence: 1.2,
        readyTimeframes: ['15m'],
      },
      configReader: reader(),
    })).toThrow(/mtfConfluenceSnapshot\.confidence must be between 0 and 1/);
  });

  test('all base exit contracts declare structural-exit ownership explicitly', () => {
    const contracts = ConfigLoader.BASE_CONFIG.exitContracts;

    for (const [strategyName, contract] of Object.entries(contracts)) {
      expect(contract).toHaveProperty('useStructuralExits');
      expect(typeof contract.useStructuralExits).toBe('boolean');
      expect(() => PolicyBuilder.buildForTrade({
        strategyName,
        exitContract: contract,
        nowMs: fixedNowMs,
        ...policyContext,
        configReader: ConfigLoader,
      })).not.toThrow();
    }
  });

  test('fails loudly when a required central config value is missing', () => {
    const values = configValues();
    delete values['exitLogic.beScaleOut.scaleOutFraction'];

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(values),
    })).toThrow(/missing ConfigLoader value: exitLogic\.beScaleOut\.scaleOutFraction/);
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
      ...policyContext,
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
      ...policyContext,
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
      ...policyContext,
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
      ...policyContext,
      configReader: reader(configValues({
        'exitLogic.beScaleOut.scaleOutFraction': 1.2,
      })),
    })).toThrow(/scaleOutFraction must be between 0 and 1/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(configValues({
        'exitLogic.beScaleOut.feeBufferPercent': 101,
      })),
    })).toThrow(/feeBufferPercent must be between 0 and 100 percent-form/);

    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
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
      ...policyContext,
      configReader: reader(),
    })).toThrow(/stopLossPercent must be negative percent-form/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ takeProfitPercent: -1 }),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    })).toThrow(/takeProfitPercent must be greater than 0/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ maxHoldTimeMinutes: 0 }),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    })).toThrow(/maxHoldTimeMinutes must be greater than 0/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract({ minConfidence: 1.2 }),
      nowMs: fixedNowMs,
      ...policyContext,
      configReader: reader(),
    })).toThrow(/minConfidence must be between 0 and 1/);
  });

  test('requires explicit build time instead of hidden Date.now lifecycle state', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      ...policyContext,
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
        ...policyContext,
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

  test('builds with the default ConfigLoader class reader', () => {
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      ...policyContext,
    });

    expect(policy.strategyName).toBe('EMASMACrossover');
    expect(policy.profitManagement.beScaleOut).toHaveProperty('scaleOutFraction');
    expect(policy.fees).toHaveProperty('totalRoundTrip');
  });

  test('freezes MPM-equivalent adjusted tier targets at trade birth', () => {
    const policy = PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      volatility: 0.03,
      confidence: 0.85,
      marketCondition: 'trending',
      configReader: reader(configValues({
        'exitLogic.volatilityAdjustment.enabled': true,
      })),
    });

    const adjustment = policy.profitManagement.tieredExit.adjustment;
    expect(adjustment).toMatchObject({
      volatilityTargetFactor: 1.4,
      marketCondition: 'trending',
      marketMultiplier: 1.3,
      confidence: 0.85,
      confidenceMultiplier: 1.2,
    });
    expect(adjustment.combinedTargetMultiplier).toBeCloseTo(2.184);
    expect(policy.profitManagement.tieredExit.tiers[0].baseTargetProfitMove).toBe(0.015);
    expect(policy.profitManagement.tieredExit.tiers[0].targetProfitMove).toBeCloseTo(0.03276);
  });

  test('fails loudly when entry volatility or confidence is missing', () => {
    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      confidence: 0.75,
      marketCondition: 'normal',
      configReader: reader(),
    })).toThrow(/volatility must be a finite number/);

    expect(() => PolicyBuilder.buildForTrade({
      strategyName: 'EMASMACrossover',
      exitContract: exitContract(),
      nowMs: fixedNowMs,
      volatility: 0.01,
      marketCondition: 'normal',
      configReader: reader(),
    })).toThrow(/confidence must be a finite number/);
  });
});
