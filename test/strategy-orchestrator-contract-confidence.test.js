'use strict';

describe('StrategyOrchestrator exit contract confidence gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ATR_FILTER_ENABLED: 'false',
      ENABLE_TRAI: 'false',
      MIN_STRATEGY_CONFIDENCE: '0.35',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function addContract(ConfigLoader, strategyName, overrides) {
    ConfigLoader.BASE_CONFIG.exitContracts[strategyName] = {
      ...ConfigLoader.BASE_CONFIG.exitContracts.default,
      ...overrides,
    };
  }

  function evaluateSingle(orchestrator, strategyName, confidence, options = {}) {
    const timeframe = options.timeframe || '15m';
    orchestrator.strategies = [{
      name: strategyName,
      evaluate: () => ({
        direction: 'buy',
        confidence,
        timeframe: options.signalTimeframe,
        reason: `${strategyName} test signal`,
      }),
    }];

    return orchestrator.evaluate(
      { atr: options.atr ?? 1, volatility: options.volatility ?? 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1, timeframe }],
      { price: options.price ?? 100, timeframe }
    );
  }

  test('drops a strategy signal below its exit contract minConfidence before winner selection', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'ContractGateStrict', { minConfidence: 0.60 });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'ContractGateStrict', 0.59);

    expect(result.action).toBe('HOLD');
    expect(result.winnerStrategy).toBeNull();
    expect(result.exitContract).toBeNull();
  });

  test('honors runtime minConfidence overrides from ConfigLoader.setOverrides', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.setOverrides({
      exitContracts: {
        RuntimeOverrideGate: {
          minConfidence: 0.80,
        },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'RuntimeOverrideGate', 0.75);

    expect(result.action).toBe('HOLD');
    expect(result.winnerStrategy).toBeNull();
    expect(result.exitContract).toBeNull();
  });

  test('honors runtime minConfidence overrides applied after orchestrator construction', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    ConfigLoader.setOverrides({
      exitContracts: {
        RuntimeLateOverrideGate: {
          minConfidence: 0.80,
        },
      },
    });
    const result = evaluateSingle(orchestrator, 'RuntimeLateOverrideGate', 0.75);

    expect(result.action).toBe('HOLD');
    expect(result.winnerStrategy).toBeNull();
    expect(result.exitContract).toBeNull();
  });

  test('allows a strategy signal at its exit contract minConfidence', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'ContractGateStrict', { minConfidence: 0.60 });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'ContractGateStrict', 0.60);

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('ContractGateStrict');
    expect(result.exitContract).not.toBeNull();
  });

  test('uses timeframe-specific minConfidence before flat strategy minConfidence', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'ContractGateTimeframe', {
      minConfidence: 0.30,
      timeframes: {
        '1h': { minConfidence: 0.80 },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const oneHour = evaluateSingle(new StrategyOrchestrator({ minConfluenceCount: 1 }), 'ContractGateTimeframe', 0.75, { timeframe: '1h' });
    const fifteenMinute = evaluateSingle(new StrategyOrchestrator({ minConfluenceCount: 1 }), 'ContractGateTimeframe', 0.75, { timeframe: '15m' });

    expect(oneHour.action).toBe('HOLD');
    expect(oneHour.filteredResults[0]).toEqual(expect.objectContaining({
      rejectedBy: 'exit_contract_confidence_gate',
      timeframe: '1h',
    }));
    expect(oneHour.filteredResults[0].decisionAttribution.contributors).toContainEqual(expect.objectContaining({
      name: 'exit_contract_confidence_gate',
      minConfidence: 0.80,
      timeframe: '1h',
      passed: false,
    }));
    expect(fifteenMinute.action).toBe('BUY');
    expect(fifteenMinute.winnerStrategy).toBe('ContractGateTimeframe');
    expect(fifteenMinute.timeframe).toBe('15m');
  });

  test('fails loudly when a strategy reports a malformed timeframe', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'ContractGateMalformedTimeframe', {
      minConfidence: 0.30,
      timeframes: {
        '5m': { minConfidence: 0.80 },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    orchestrator.strategies = [{
      name: 'ContractGateMalformedTimeframe',
      evaluate: () => ({
        direction: 'buy',
        confidence: 0.75,
        timeframe: 5,
        reason: 'malformed timeframe test signal',
      }),
    }];

    expect(() => orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1, timeframe: '15m' }],
      { price: 100, timeframe: '15m' }
    )).toThrow(/ContractGateMalformedTimeframe\.timeframe must be a non-empty string/);
  });

  test('does not invent a confidence gate when exit contract minConfidence is null', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'ContractGateOpen', { minConfidence: null });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'ContractGateOpen', 0.36);

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('ContractGateOpen');
  });

  test('fails loudly when a known strategy contract omits minConfidence instead of declaring null', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.BASE_CONFIG.exitContracts.ContractGateMissingKey = {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      atrMinPercent: null,
      invalidationConditions: [],
    };
    ConfigLoader.setOverrides({
      exitContracts: {
        default: {
          minConfidence: 0.80,
        },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    expect(() => evaluateSingle(orchestrator, 'ContractGateMissingKey', 0.75))
      .toThrow(/ContractGateMissingKey\.minConfidence must be explicit null or a finite number/);
  });

  test('honors runtime atrMinPercent overrides in the same contract reader path', () => {
    process.env.ATR_FILTER_ENABLED = 'true';
    process.env.ATR_MIN_PERCENT = '0.1';
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.setOverrides({
      exitContracts: {
        RuntimeAtrGate: {
          atrMinPercent: 2.0,
        },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'RuntimeAtrGate', 0.90);

    expect(result.action).toBe('HOLD');
    expect(result.winnerStrategy).toBeNull();
    expect(result.exitContract).toBeNull();
  });

  test('uses timeframe-specific atrMinPercent before flat strategy atrMinPercent', () => {
    process.env.ATR_FILTER_ENABLED = 'true';
    process.env.ATR_MIN_PERCENT = '0.1';
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'RuntimeAtrTimeframeGate', {
      minConfidence: null,
      atrMinPercent: null,
      timeframes: {
        '1h': { atrMinPercent: 2.0 },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const oneHour = evaluateSingle(new StrategyOrchestrator({ minConfluenceCount: 1 }), 'RuntimeAtrTimeframeGate', 0.90, { timeframe: '1h' });
    const fifteenMinute = evaluateSingle(new StrategyOrchestrator({ minConfluenceCount: 1 }), 'RuntimeAtrTimeframeGate', 0.90, { timeframe: '15m' });

    expect(oneHour.action).toBe('HOLD');
    expect(oneHour.filteredResults[0]).toEqual(expect.objectContaining({
      rejectedBy: 'atr_pre_entry_filter',
      timeframe: '1h',
    }));
    expect(oneHour.filteredResults[0].decisionAttribution.contributors).toContainEqual(expect.objectContaining({
      name: 'atr_pre_entry_filter',
      threshold: 2.0,
      thresholdSource: 'strategy_timeframe',
      timeframe: '1h',
      passed: false,
    }));
    expect(fifteenMinute.action).toBe('BUY');
    expect(fifteenMinute.winnerStrategy).toBe('RuntimeAtrTimeframeGate');
    expect(fifteenMinute.timeframe).toBe('15m');
  });

  test('births the exit contract from the winning signal timeframe, not the base runtime timeframe', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'ContractGateSignalTimeframe', {
      minConfidence: 0.30,
      stopLossPercent: -0.5,
      takeProfitPercent: 1.2,
      trailingStopPercent: 0.4,
      trailingActivation: 0.7,
      maxHoldTimeMinutes: 90,
      timeframes: {
        '1h': {
          minConfidence: 0.70,
          stopLossPercent: -2.0,
          takeProfitPercent: 4.5,
          trailingStopPercent: 1.5,
          trailingActivation: 2.0,
          maxHoldTimeMinutes: 480,
        },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const result = evaluateSingle(new StrategyOrchestrator({ minConfluenceCount: 1 }), 'ContractGateSignalTimeframe', 0.75, {
      timeframe: '15m',
      signalTimeframe: '1h',
    });

    expect(result.action).toBe('BUY');
    expect(result.timeframe).toBe('1h');
    expect(result.exitContract).toEqual(expect.objectContaining({
      timeframe: '1h',
      stopLossPercent: -2.0,
      takeProfitPercent: 4.5,
      trailingStopPercent: 1.5,
      trailingActivation: 2.0,
      maxHoldTimeMinutes: 480,
    }));
    expect(result.signalBreakdown).toEqual(expect.objectContaining({
      timeframe: '1h',
    }));
    expect(result.signalBreakdown.signals[0]).toEqual(expect.objectContaining({
      timeframe: '1h',
      decisionAttribution: expect.objectContaining({
        contributors: expect.arrayContaining([
          expect.objectContaining({
            name: 'exit_contract_confidence_gate',
            timeframe: '1h',
            passed: true,
          }),
        ]),
      }),
    }));
  });

  test('fails loudly when exit contract minConfidence is malformed', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    addContract(ConfigLoader, 'ContractGateBroken', { minConfidence: '0.60' });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    expect(() => evaluateSingle(orchestrator, 'ContractGateBroken', 0.80))
      .toThrow(/ContractGateBroken\.minConfidence must be null or a finite 0\.\.1 number/);
  });

  test('fails loudly when runtime minConfidence override is malformed', () => {
    const ConfigLoader = require('../foundation/ConfigLoader');
    ConfigLoader.setOverrides({
      exitContracts: {
        RuntimeBrokenGate: {
          minConfidence: '0.60',
        },
      },
    });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    expect(() => evaluateSingle(orchestrator, 'RuntimeBrokenGate', 0.80))
      .toThrow(/RuntimeBrokenGate\.minConfidence must be null or a finite 0\.\.1 number/);
  });
});
