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

  function addContract(TradingConfig, strategyName, overrides) {
    TradingConfig.BASE_CONFIG.exitContracts[strategyName] = {
      ...TradingConfig.BASE_CONFIG.exitContracts.default,
      ...overrides,
    };
  }

  function evaluateSingle(orchestrator, strategyName, confidence) {
    orchestrator.strategies = [{
      name: strategyName,
      evaluate: () => ({
        direction: 'buy',
        confidence,
        reason: `${strategyName} test signal`,
      }),
    }];

    return orchestrator.evaluate(
      { atr: 1, volatility: 1 },
      [],
      { currentRegime: 'ranging', confidence: 0.5, positionMultiplier: 1 },
      [{ o: 100, h: 101, l: 99, c: 100, t: 1 }],
      { price: 100, timeframe: '15m' }
    );
  }

  test('drops a strategy signal below its exit contract minConfidence before winner selection', () => {
    const TradingConfig = require('../core/TradingConfig');
    addContract(TradingConfig, 'ContractGateStrict', { minConfidence: 0.60 });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'ContractGateStrict', 0.59);

    expect(result.action).toBe('HOLD');
    expect(result.winnerStrategy).toBeNull();
    expect(result.exitContract).toBeNull();
  });

  test('honors runtime minConfidence overrides from TradingConfig.setOverrides', () => {
    const TradingConfig = require('../core/TradingConfig');
    TradingConfig.setOverrides({
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
    const TradingConfig = require('../core/TradingConfig');
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');
    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    TradingConfig.setOverrides({
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
    const TradingConfig = require('../core/TradingConfig');
    addContract(TradingConfig, 'ContractGateStrict', { minConfidence: 0.60 });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'ContractGateStrict', 0.60);

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('ContractGateStrict');
    expect(result.exitContract).not.toBeNull();
  });

  test('does not invent a confidence gate when exit contract minConfidence is null', () => {
    const TradingConfig = require('../core/TradingConfig');
    addContract(TradingConfig, 'ContractGateOpen', { minConfidence: null });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });
    const result = evaluateSingle(orchestrator, 'ContractGateOpen', 0.36);

    expect(result.action).toBe('BUY');
    expect(result.winnerStrategy).toBe('ContractGateOpen');
  });

  test('fails loudly when a known strategy contract omits minConfidence instead of declaring null', () => {
    const TradingConfig = require('../core/TradingConfig');
    TradingConfig.BASE_CONFIG.exitContracts.ContractGateMissingKey = {
      stopLossPercent: -2.0,
      takeProfitPercent: 2.5,
      trailingStopPercent: 0.6,
      trailingActivation: 0.8,
      maxHoldTimeMinutes: 240,
      atrMinPercent: null,
      invalidationConditions: [],
    };
    TradingConfig.setOverrides({
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
    const TradingConfig = require('../core/TradingConfig');
    TradingConfig.setOverrides({
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

  test('fails loudly when exit contract minConfidence is malformed', () => {
    const TradingConfig = require('../core/TradingConfig');
    addContract(TradingConfig, 'ContractGateBroken', { minConfidence: '0.60' });
    const { StrategyOrchestrator } = require('../core/StrategyOrchestrator');

    const orchestrator = new StrategyOrchestrator({ minConfluenceCount: 1 });

    expect(() => evaluateSingle(orchestrator, 'ContractGateBroken', 0.80))
      .toThrow(/ContractGateBroken\.minConfidence must be null or a finite 0\.\.1 number/);
  });

  test('fails loudly when runtime minConfidence override is malformed', () => {
    const TradingConfig = require('../core/TradingConfig');
    TradingConfig.setOverrides({
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
