'use strict';

const TEST_ENV_DEFAULTS = Object.freeze({
  ALPACA_API_KEY: 'test-alpaca-key',
  ALPACA_API_SECRET: 'test-alpaca-secret',
  ALPACA_MODE: 'paper',
  BROKER: 'alpaca',
  EXECUTION_MODE: 'paper',
  PAPER_TRADING: 'true',
  LIVE_TRADING: 'false',
  CONFIRM_LIVE_TRADING: 'false',
});

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  process.env[key] = value;
}

const mockStateManager = {
  getTradesBySymbol: jest.fn(() => []),
  get: jest.fn((key) => {
    if (key === 'position') return 0;
    if (key === 'initialBalance') return 10000;
    return null;
  }),
  getEquity: jest.fn(() => 10000),
  getLastPrice: jest.fn(() => null),
  isHalted: jest.fn(() => false),
  getHaltReason: jest.fn(() => null),
  isSymbolHalted: jest.fn(() => false),
  getSymbolHaltReason: jest.fn(() => null),
};

const mockExitContractManager = {
  updateMaxProfit: jest.fn(),
  checkExitConditions: jest.fn(() => ({ shouldExit: false })),
};

const mockDecisionAutopsyLogger = {
  writeAutopsy: jest.fn(() => true),
};

jest.mock('../core/StateManager', () => ({
  getInstance: () => mockStateManager,
}));

jest.mock('../core/ExitContractManager', () => ({
  getInstance: () => mockExitContractManager,
}));

jest.mock('../core/DecisionAutopsyLogger', () => mockDecisionAutopsyLogger);

const TradingLoop = require('../core/TradingLoop');
const ConfigLoader = require('../foundation/ConfigLoader');
const { getNarrator } = require('../core/TradeNarrator');

function candles(count = 20) {
  return Array.from({ length: count }, (_, i) => ({
    time: 1700000000000 + i * 60000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  }));
}

function baseEntryContext(overrides = {}) {
  return {
    priceHistory: candles(),
    marketData: {
      symbol: 'TSLA',
      price: 100,
      timestamp: 1700000000000,
      volume: 1000,
    },
    config: {
      minTradeConfidence: 0.5,
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      timeframe: '15m',
      executionMode: 'paper',
      enableBacktestMode: false,
      evalTraceEnabled: false,
      traceEventMaxBufferedBytes: 1048576,
    },
    strategyOrchestrator: {
      strategies: [{ name: 'RSI' }],
      evaluate: jest.fn(() => ({
        direction: 'buy',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'buy', confidence: 0.8, reason: 'test signal' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      })),
    },
    executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'ORDER_TRACE_1' }),
    broadcastPatternAnalysis: jest.fn(),
    dashboardWs: { readyState: 1, bufferedAmount: 0, send: jest.fn() },
    ...overrides,
  };
}

function stubGatherData(loop) {
  loop._gatherData = jest.fn(() => ({
    indicators: {
      rsi: 55,
      macd: {},
      trend: 'sideways',
      atr: 1,
      ema20: 100,
      ema50: 100,
    },
    patterns: [],
    regime: { currentRegime: 'sideways' },
    tpoResult: null,
    fibLevels: null,
    nearestFibLevel: null,
    nearestStructure: null,
  }));
  loop._runTRAI = jest.fn();
}

function sentFrames(ctx) {
  return ctx.dashboardWs.send.mock.calls.map(call => JSON.parse(call[0]));
}

function mockDirectionConfig({ directionFilter = 'both' } = {}) {
  const originalGet = ConfigLoader.get.bind(ConfigLoader);
  return jest.spyOn(ConfigLoader, 'get').mockImplementation((key, defaultValue) => {
    if (key === 'pipeline.directionFilter') return directionFilter;
    return originalGet(key, defaultValue);
  });
}

describe('TradingLoop trace spine', () => {
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateManager.getTradesBySymbol.mockReturnValue([]);
    mockStateManager.getLastPrice.mockReturnValue(null);
    mockExitContractManager.checkExitConditions.mockReturnValue({ shouldExit: false });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('records ambiguous winner proof attribution without throwing', () => {
    const loop = new TradingLoop(baseEntryContext());

    expect(loop._ledgerWinnerAttribution([
      { name: 'RSI', direction: 'buy', confidence: 0.8, reason: 'first' },
      { strategyName: 'RSI', direction: 'buy', confidence: 0.7, reason: 'second' },
    ], 'RSI')).toEqual({
      status: 'ambiguous',
      winnerIndex: null,
      matchCount: 2,
      matchedIndexes: [0, 1],
      reason: 'orchResult.winnerStrategy "RSI" matched 2 strategy result(s); winner-only proof not attributed',
    });
  });

  test('records missing winner proof attribution without throwing', () => {
    const loop = new TradingLoop(baseEntryContext());

    expect(loop._ledgerWinnerAttribution([
      { name: 'RSI', direction: 'buy', confidence: 0.8, reason: 'first' },
    ], 'EMASMACrossover')).toEqual({
      status: 'missing',
      winnerIndex: null,
      matchCount: 0,
      matchedIndexes: [],
      reason: 'orchResult.winnerStrategy "EMASMACrossover" matched 0 strategy result(s); winner-only proof not attributed',
    });
  });

  test('preserves the analysis trace id on the execution decision and ledger data', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'ORDER_TRACE_1' });
    const ctx = {
      priceHistory: candles(),
      marketData: {
        symbol: 'TSLA',
        price: 100,
        timestamp: 1700000000000,
        volume: 1000,
      },
      config: {
        minTradeConfidence: 0.5,
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      strategyOrchestrator: {
        evaluate: jest.fn(() => ({
          direction: 'buy',
          confidence: 80,
          winnerStrategy: 'RSI',
          allResults: [{
            name: 'RSI',
            direction: 'buy',
            confidence: 0.8,
            reason: 'test signal',
            decisionAttribution: {
              strategyName: 'RSI',
              baseConfidence: 0.7,
              selectionScore: {
                scale: 'nonnegative_selector',
                initial: 0.7,
                final: 0.8,
              },
              publicConfidence: 0.8,
              contributors: [
                { name: 'strategy_signal', type: 'base', confidence: 0.7, score: 0.7 },
                { name: 'regime_boost', type: 'multiplier', selectionMultiplier: 1.142857142857143, previousSelectionScore: 0.7, nextSelectionScore: 0.8 },
              ],
            },
            learningSnapshot: {
              mode: 'shadow',
              applied: false,
              decisionImpact: 'none_shadow_only',
              featureSource: 'patterns[0].features',
              source: 'learned_success',
              status: 'promoted',
              confidence: 0.72,
              wins: 8,
              losses: 3,
              sampleCount: 11,
              modifier: null,
            },
          }],
          filteredResults: [{
            strategyName: 'HighAtrProbe',
            direction: 'buy',
            confidence: 0.9,
            reason: 'higher confidence but filtered',
            rejectedBy: 'atr_pre_entry_filter',
            rejectReason: 'ATR 1.000% below 2%',
            decisionAttribution: {
              strategyName: 'HighAtrProbe',
              baseConfidence: 0.9,
              selectionScore: {
                scale: 'nonnegative_selector',
                initial: 0.9,
                final: 0.9,
              },
              publicConfidence: 0.9,
              contributors: [
                { name: 'strategy_signal', type: 'base', confidence: 0.9, score: 0.9 },
                { name: 'atr_pre_entry_filter', type: 'gate', passed: false, atrPercent: 1, threshold: 2 },
              ],
            },
          }],
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
        })),
      },
      executeTrade,
      broadcastPatternAnalysis: jest.fn(),
    };
    const loop = new TradingLoop(ctx);
    loop._gatherData = jest.fn(() => ({
      indicators: {
        rsi: 55,
        macd: {},
        trend: 'sideways',
        atr: 1,
        ema20: 100,
        ema50: 100,
      },
      patterns: [],
      regime: { currentRegime: 'sideways' },
      tpoResult: null,
      fibLevels: null,
      nearestFibLevel: null,
      nearestStructure: null,
    }));
    loop._runTRAI = jest.fn();
    loop._broadcastDecision = jest.fn();

    await loop._analyze('TSLA', 'trace_fixed_1');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    const decision = executeTrade.mock.calls[0][0];
    expect(decision).toEqual(expect.objectContaining({
      action: 'BUY',
      traceId: 'trace_fixed_1',
      signalId: 'trace_fixed_1:signal',
    }));
    expect(decision.ledgerData).toEqual(expect.objectContaining({
      traceId: 'trace_fixed_1',
      signalId: 'trace_fixed_1:signal',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      assetClass: 'stocks',
      timeframe: '15m',
      executionMode: 'paper',
    }));
    expect(decision.ledgerData.strategySignals[0].baseConfidence).toBe(0.8);
    expect(decision.ledgerData.strategySignals[0].decisionAttribution).toEqual(expect.objectContaining({
      strategyName: 'RSI',
      baseConfidence: 0.7,
      selectionScore: {
        scale: 'nonnegative_selector',
        initial: 0.7,
        final: 0.8,
      },
      publicConfidence: 0.8,
    }));
    expect(decision.ledgerData.strategySignals[0].decisionAttribution.contributors.map((item) => item.name))
      .toEqual(['strategy_signal', 'regime_boost']);
    expect(decision.ledgerData.strategySignals[0].learningSnapshot).toEqual(expect.objectContaining({
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      candidateRole: 'candidate',
      source: 'learned_success',
      status: 'promoted',
    }));
    expect(decision.ledgerData.orchestratorDecision.finalConfidence).toBe(0.8);
    expect(decision.ledgerData.orchestratorDecision.winnerAttribution).toEqual({
      status: 'exact',
      winnerIndex: 0,
      matchCount: 1,
    });
    expect(decision.ledgerData.orchestratorDecision.learningSnapshot).toEqual(expect.objectContaining({
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      candidateRole: 'winner',
      source: 'learned_success',
      status: 'promoted',
    }));
    expect(decision.ledgerData.orchestratorDecision.competingStrategies[0].adjustedConfidence).toBe(0.8);
    expect(decision.ledgerData.orchestratorDecision.decisionAttribution).toEqual(expect.objectContaining({
      strategyName: 'RSI',
      baseConfidence: 0.7,
      selectionScore: {
        scale: 'nonnegative_selector',
        initial: 0.7,
        final: 0.8,
      },
    }));
    expect(decision.ledgerData.orchestratorDecision.competingStrategies[0].decisionAttribution).toEqual(expect.objectContaining({
      strategyName: 'RSI',
      publicConfidence: 0.8,
    }));
    expect(decision.ledgerData.orchestratorDecision.filteredStrategies[0]).toEqual(expect.objectContaining({
      name: 'HighAtrProbe',
      rejected: true,
      rejectedBy: 'atr_pre_entry_filter',
      rejectReason: 'ATR 1.000% below 2%',
    }));
    expect(decision.ledgerData.orchestratorDecision.filteredStrategies[0].decisionAttribution.contributors.map((item) => item.name))
      .toEqual(['strategy_signal', 'atr_pre_entry_filter']);
    expect(decision.ledgerData.orchestratorDecision.competingStrategies[0].learningSnapshot).toEqual(expect.objectContaining({
      mode: 'shadow',
      applied: false,
      decisionImpact: 'none_shadow_only',
      candidateRole: 'winner',
      source: 'learned_success',
      status: 'promoted',
    }));
  });

  test('writes a full decision autopsy for skipped entry candidates', async () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }],
        evaluate: jest.fn(() => ({
          action: 'BUY',
          direction: 'buy',
          confidence: 40,
          winnerStrategy: 'RSI',
          allResults: [{
            strategyName: 'RSI',
            direction: 'buy',
            confidence: 0.4,
            reason: 'weak signal',
            decisionAttribution: {
              strategyName: 'RSI',
              baseConfidence: 0.4,
              selectionScore: { scale: 'nonnegative_selector', initial: 0.4, final: 0.4 },
              publicConfidence: 0.4,
              contributors: [{ name: 'strategy_signal', type: 'base', confidence: 0.4, score: 0.4 }],
            },
          }],
          filteredResults: [],
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
          reasons: ['Winner: RSI 15m (40%) - weak signal'],
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);
    const configSpy = mockDirectionConfig();

    try {
      await loop.analyzeAndTrade('TSLA', 'trace_autopsy_skip');
    } finally {
      configSpy.mockRestore();
    }

    const autopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
    expect(autopsy).toEqual(expect.objectContaining({
      traceId: 'trace_autopsy_skip',
      symbol: 'TSLA',
      status: 'skip',
      skipReason: 'below_min_confidence',
    }));
    expect(autopsy.orchestratorDecision).toEqual(expect.objectContaining({
      winnerStrategy: 'RSI',
      finalConfidence: 0.4,
    }));
    expect(autopsy.strategySignals[0]).toEqual(expect.objectContaining({
      name: 'RSI',
      direction: 'long',
      baseConfidence: 0.4,
      reason: 'weak signal',
    }));
    expect(autopsy.gates.minConfidence).toEqual({
      threshold: 0.5,
      value: 0.4,
      passed: false,
    });
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test('writes scoped decision autopsy for concurrency skips', async () => {
    const ctx = baseEntryContext();
    const loop = new TradingLoop(ctx);
    loop._setSymbolAnalyzing('TSLA', true);

    await loop.analyzeAndTrade('TSLA', 'trace_autopsy_concurrency');

    const autopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
    expect(autopsy).toEqual(expect.objectContaining({
      traceId: 'trace_autopsy_concurrency',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      accountIdSource: 'config',
      assetClass: 'stocks',
      timeframe: '15m',
      executionMode: 'paper',
      status: 'skip',
      skipReason: 'concurrency_guard',
    }));
    expect(ctx.strategyOrchestrator.evaluate).not.toHaveBeenCalled();
  });

  test('allows different symbols to analyze while preserving same-symbol serialization', async () => {
    const ctx = baseEntryContext();
    const loop = new TradingLoop(ctx);
    const releases = new Map();
    loop._analyze = jest.fn(symbol => new Promise(resolve => {
      releases.set(symbol, resolve);
    }));

    const tslaAnalysis = loop.analyzeAndTrade('TSLA', 'trace_tsla_parallel');
    await Promise.resolve();

    const nvdaAnalysis = loop.analyzeAndTrade('NVDA', 'trace_nvda_parallel');
    await Promise.resolve();

    await loop.analyzeAndTrade('TSLA', 'trace_tsla_duplicate');

    expect(loop._analyze).toHaveBeenCalledTimes(2);
    expect(loop._analyze.mock.calls.map(call => call[0])).toEqual(['TSLA', 'NVDA']);
    const duplicateAutopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
    expect(duplicateAutopsy).toEqual(expect.objectContaining({
      traceId: 'trace_tsla_duplicate',
      symbol: 'TSLA',
      status: 'skip',
      skipReason: 'concurrency_guard',
    }));

    releases.get('TSLA')();
    releases.get('NVDA')();
    await Promise.all([tslaAnalysis, nvdaAnalysis]);
  });

  test('drains same-symbol exit-only work after analysis releases', async () => {
    const ctx = baseEntryContext();
    ctx.config.evalTraceEnabled = true;
    const loop = new TradingLoop(ctx);
    let releaseAnalysis;
    loop._analyze = jest.fn(() => new Promise(resolve => {
      releaseAnalysis = resolve;
    }));
    loop._checkExitsOnly = jest.fn().mockResolvedValue(undefined);

    const analysis = loop.analyzeAndTrade('TSLA', 'trace_tsla_analysis');
    await Promise.resolve();

    await loop.checkExitsOnly('TSLA');

    expect(loop.pendingExitSymbols.has('TSLA')).toBe(true);
    expect(loop._checkExitsOnly).not.toHaveBeenCalled();
    expect(sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'EXIT_ONLY_QUEUED')).toEqual(
      expect.objectContaining({
        fields: expect.objectContaining({ symbol: 'TSLA' }),
      })
    );

    releaseAnalysis();
    await analysis;

    expect(loop.pendingExitSymbols.has('TSLA')).toBe(false);
    expect(loop._checkExitsOnly).toHaveBeenCalledTimes(1);
    expect(loop._checkExitsOnly).toHaveBeenCalledWith('TSLA');
  });

  test('fails closed after decision autopsy primary and fallback persistence fail', () => {
    const ctx = baseEntryContext();
    ctx.config.evalTraceEnabled = true;
    const loop = new TradingLoop(ctx);
    mockDecisionAutopsyLogger.writeAutopsy.mockReturnValueOnce(false);

    expect(() => loop._writeDecisionAutopsy({
      traceId: 'trace_autopsy_write_fail',
      symbol: 'TSLA',
      decision: { action: 'HOLD' },
      skipReason: 'test_write_failure',
    })).toThrow('failed to persist decision autopsy');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EVAL-TRACE][DECISION_AUTOPSY_WRITE_FAILED]'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EVAL-TRACE][DECISION_AUTOPSY_FAILED]'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('traceId="trace_autopsy_write_fail"'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('skipReason="test_write_failure"'));
  });

  test('writes decision autopsy for accepted entries with complete pre-trade gates', async () => {
    const ctx = baseEntryContext();
    ctx.strategyOrchestrator.evaluate.mockReturnValue({
      action: 'BUY',
      direction: 'buy',
      confidence: 80,
      winnerStrategy: 'RSI',
      allResults: [{
        strategyName: 'RSI',
        direction: 'buy',
        confidence: 0.8,
        reason: 'test signal',
        decisionAttribution: {
          strategyName: 'RSI',
          baseConfidence: 0.7,
          selectionScore: { scale: 'nonnegative_selector', initial: 0.7, final: 0.8 },
          publicConfidence: 0.8,
          contributors: [
            { name: 'strategy_signal', type: 'base', confidence: 0.7, score: 0.7 },
            { name: 'regime_boost', type: 'multiplier', selectionMultiplier: 1.142857142857143 },
          ],
        },
      }],
      filteredResults: [],
      exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
      confluence: { count: 1, strategies: ['RSI'] },
      sizingMultiplier: 1,
      mtfConfluenceSnapshot: {
        source: 'StrategyOrchestrator.mtfConfluence',
        direction: 'buy',
        confluenceScore: 0.5,
        confidence: 0.5,
        readyTimeframes: ['15m', '1h'],
      },
      reasons: ['Winner: RSI 15m (80%) - test signal'],
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);
    const configSpy = mockDirectionConfig();

    try {
      await loop.analyzeAndTrade('TSLA', 'trace_autopsy_entry');
    } finally {
      configSpy.mockRestore();
    }

    const autopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
    expect(autopsy.status).toBe('execute');
    expect(autopsy.orchestratorDecision).toEqual(expect.objectContaining({
      finalConfidence: 0.8,
      winnerStrategy: 'RSI',
    }));
    expect(autopsy.gates.minConfidence).toEqual({
      threshold: 0.5,
      value: 0.8,
      passed: true,
    });
    expect(autopsy.decision).toEqual(expect.objectContaining({
      action: 'BUY',
      direction: 'long',
      confidence: 80,
    }));
    expect(autopsy.mtfConfluenceSnapshot).toEqual(expect.objectContaining({
      direction: 'buy',
      readyTimeframes: ['15m', '1h'],
    }));
    expect(autopsy.gates.riskGates.map(gate => gate.gate)).toEqual(expect.arrayContaining([
      'warmup',
      'min_confidence',
      'direction_filter',
      'opposite_position_block',
      'max_positions',
    ]));
    expect(autopsy.strategySignals[0].decisionAttribution.contributors.map(c => c.name)).toEqual([
      'strategy_signal',
      'regime_boost',
    ]);
    expect(ctx.executeTrade).toHaveBeenCalled();
  });

  test('rejects 0-100 strategy confidences before writing decision ledger evidence', async () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }],
        evaluate: jest.fn(() => ({
          direction: 'buy',
          confidence: 80,
          winnerStrategy: 'RSI',
          allResults: [{ strategyName: 'RSI', direction: 'buy', confidence: 80, reason: 'test signal' }],
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await expect(loop._analyze('TSLA', 'trace_bad_ledger_conf')).rejects.toThrow('allResults[0].confidence must be explicit 0..1');
    const autopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
    expect(autopsy.traceId).toBe('trace_bad_ledger_conf');
    expect(autopsy.strategySignals[0]).toEqual(expect.objectContaining({
      name: 'RSI',
      baseConfidence: null,
      baseConfidenceRaw: 80,
      normalizationError: expect.stringContaining('allResults[0].confidence must be explicit 0..1'),
    }));
    expect(autopsy.orchestratorDecision.competingStrategies[0]).toEqual(expect.objectContaining({
      adjustedConfidence: null,
      adjustedConfidenceRaw: 80,
      normalizationError: expect.stringContaining('allResults[0].confidence must be explicit 0..1'),
    }));
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test('rejects out-of-range confidence attribution before ledger persistence', () => {
    const loop = new TradingLoop(baseEntryContext());

    expect(() => loop._ledgerDecisionAttribution({
      decisionAttribution: {
        strategyName: 'RSI',
        baseConfidence: 1.2,
        publicConfidence: 1,
        contributors: [],
      },
    }, 0)).toThrow('allResults[0].decisionAttribution.baseConfidence must be explicit 0..1');

    expect(() => loop._ledgerDecisionAttribution({
      decisionAttribution: {
        strategyName: 'RSI',
        baseConfidence: 0.8,
        publicConfidence: 1.2,
        contributors: [],
      },
    }, 0)).toThrow('allResults[0].decisionAttribution.publicConfidence must be explicit 0..1');

    expect(() => loop._ledgerDecisionAttribution({
      decisionAttribution: {
        strategyName: 'RSI',
        baseConfidence: 0.8,
        publicConfidence: 1,
        finalConfidence: 1.2,
        contributors: [],
      },
    }, 0)).toThrow('allResults[0].decisionAttribution.finalConfidence must be explicit 0..1');

    expect(() => loop._ledgerDecisionAttribution({
      decisionAttribution: {
        strategyName: 'RSI',
        baseConfidence: 0.8,
        publicConfidence: 1,
        selectionScore: {
          scale: 'nonnegative_selector',
          initial: 0.8,
          final: -0.1,
        },
        contributors: [],
      },
    }, 0)).toThrow('allResults[0].decisionAttribution.selectionScore.final must be finite and nonnegative');

    expect(() => loop._ledgerDecisionAttribution({
      decisionAttribution: {
        strategyName: 'RSI',
        baseConfidence: 0.8,
        publicConfidence: 1,
        contributors: [
          { name: 'mtf_confluence_booster', type: 'multiplier', confidence: 1.2 },
        ],
      },
    }, 0)).toThrow('allResults[0].decisionAttribution.contributors[0].confidence must be explicit 0..1');
  });

  test('rejects executable decisions without strategy-result evidence', async () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }],
        evaluate: jest.fn(() => ({
          direction: 'buy',
          confidence: 80,
          winnerStrategy: 'RSI',
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await expect(loop._analyze('TSLA', 'trace_missing_all_results')).rejects.toThrow('orchResult.allResults missing or not an array');
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test('rejects executable decisions without winner strategy attribution', async () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }],
        evaluate: jest.fn(() => ({
          direction: 'buy',
          confidence: 80,
          allResults: [{ strategyName: 'RSI', direction: 'buy', confidence: 0.8, reason: 'test signal' }],
          exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
          confluence: { count: 1, strategies: ['RSI'] },
          sizingMultiplier: 1,
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await expect(loop._analyze('TSLA', 'trace_missing_winner')).rejects.toThrow('orchResult.winnerStrategy missing or blank');
    expect(ctx.executeTrade).not.toHaveBeenCalled();
  });

  test('emits a scoped gate_event before approved trade execution', async () => {
    const ctx = baseEntryContext({
      executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'ORDER_GATE_PASS_1' }),
      riskManager: {
        isTradingAllowed: jest.fn(() => ({
          allowed: true,
          riskGates: [{ gate: 'daily_loss_limit', threshold: 500, value: 0, passed: true }],
        })),
        assessTradeRisk: jest.fn(() => ({
          approved: true,
          riskLevel: 'LOW',
          recommendation: 'standard',
          riskGates: [{ gate: 'max_drawdown', threshold: 1000, value: 0, passed: true }],
        })),
      },
    });
    const loop = new TradingLoop(ctx);
    const gateNarratorSpy = jest.spyOn(getNarrator(), 'gateDecision').mockImplementation(() => {});
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_gate_pass_1');

    expect(ctx.executeTrade).toHaveBeenCalledTimes(1);
    const gateEvent = sentFrames(ctx).find(frame => frame.type === 'gate_event');
    expect(gateEvent).toEqual(expect.objectContaining({
      traceId: 'trace_gate_pass_1',
      signalId: 'trace_gate_pass_1:signal',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      action: 'BUY',
      kind: 'eval_pass',
      passed: true,
    }));
    expect(gateEvent.riskGates.map(g => g.gate)).toEqual(expect.arrayContaining([
      'warmup',
      'min_confidence',
      'direction_filter',
      'opposite_position_block',
      'max_positions',
      'daily_loss_limit',
      'max_drawdown',
    ]));
    expect(gateNarratorSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'gate_event',
      symbol: 'TSLA',
      kind: 'eval_pass',
      passed: true,
    }));
    gateNarratorSpy.mockRestore();
  });

  test('allows short entries when DIRECTION_FILTER is both', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext();
      ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
        direction: 'sell',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'sell', confidence: 0.8, reason: 'test short signal' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      }));
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await loop._analyze('TSLA', 'trace_direction_both_short_1');

      expect(ctx.executeTrade).toHaveBeenCalledTimes(1);
      const decision = ctx.executeTrade.mock.calls[0][0];
      expect(decision).toEqual(expect.objectContaining({
        action: 'SELL_SHORT',
        direction: 'short',
        positionEffect: 'open_short',
        traceId: 'trace_direction_both_short_1',
      }));
      expect(decision.ledgerData.positionEffect).toBe('open_short');
      const directionGate = decision.ledgerData.riskGates.find(g => g.gate === 'direction_filter');
      expect(directionGate).toEqual({
        gate: 'direction_filter',
        threshold: 'both',
        value: 'sell',
        passed: true,
      });
    } finally {
      configSpy.mockRestore();
    }
  });

  test('blocks opposite-side entry signals in the same decision instant', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext();
      ctx.config.evalTraceEnabled = true;
      ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
        direction: 'sell',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'sell', confidence: 0.8, reason: 'test short signal' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      }));
      mockStateManager.getTradesBySymbol.mockReturnValue([{
        id: 'BUY_OPEN_1',
        orderId: 'BUY_OPEN_1',
        symbol: 'TSLA',
        action: 'BUY',
        direction: 'long',
        entryPrice: 100,
        entryTime: Date.now() - 60000,
        ledgerData: { candleTimestamp: 1700000000000 },
      }]);
      mockExitContractManager.checkExitConditions.mockReturnValue({ shouldExit: false, details: 'Holding' });
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await loop._analyze('TSLA', 'trace_same_instant_opposite_1');

      expect(ctx.executeTrade).not.toHaveBeenCalled();
      const skipEvent = sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP');
      expect(skipEvent).toEqual(expect.objectContaining({
        traceId: 'trace_same_instant_opposite_1',
        symbol: 'TSLA',
      }));
      expect(skipEvent.fields).toEqual(expect.objectContaining({
        reason: 'opposite_entry_same_instant',
        finalDirection: 'sell',
      }));
      expect(mockDecisionAutopsyLogger.writeAutopsy).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'TSLA',
        decision: expect.objectContaining({
          action: 'HOLD',
          blockReason: 'opposite_entry_same_instant',
        }),
        skipReason: 'opposite_entry_same_instant',
      }));
    } finally {
      configSpy.mockRestore();
    }
  });

  test('allows opposite-side entry signals from earlier decision instants', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext();
      ctx.config.evalTraceEnabled = true;
      ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
        direction: 'sell',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'sell', confidence: 0.8, reason: 'later short signal' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      }));
      mockStateManager.getTradesBySymbol.mockReturnValue([{
        id: 'BUY_OPEN_EARLIER_1',
        orderId: 'BUY_OPEN_EARLIER_1',
        symbol: 'TSLA',
        action: 'BUY',
        direction: 'long',
        entryPrice: 100,
        entryTime: Date.now() - 60000,
        ledgerData: { candleTimestamp: 1699999100000 },
      }]);
      mockExitContractManager.checkExitConditions.mockReturnValue({ shouldExit: false, details: 'Holding' });
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await loop._analyze('TSLA', 'trace_later_opposite_allowed_1');

      expect(ctx.executeTrade).toHaveBeenCalledTimes(1);
      expect(ctx.executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
        action: 'SELL_SHORT',
        direction: 'short',
        positionEffect: 'open_short',
        traceId: 'trace_later_opposite_allowed_1',
      }));
      expect(sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP')).toBeUndefined();
      const autopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
      const oppositeGate = autopsy.gates.riskGates.find(gate => gate.gate === 'opposite_position_block');
      expect(oppositeGate).toEqual(expect.objectContaining({
        passed: true,
        rejectReason: null,
      }));
    } finally {
      configSpy.mockRestore();
    }
  });

  test.each([
    {
      label: 'later opposite entry allowed',
      finalDirection: 'sell',
      activeTrades: [{ id: 'LONG_EARLIER', action: 'BUY', direction: 'long', ledgerData: { candleTimestamp: 1699999100000 } }],
      maxPositions: 3,
      expectedOpposite: { passed: true, rejectReason: null },
      expectedMaxPassed: true,
    },
    {
      label: 'same-instant opposite entry refused loudly',
      finalDirection: 'sell',
      activeTrades: [{ id: 'LONG_SAME_INSTANT', action: 'BUY', direction: 'long', entryTime: 1700000000000 }],
      maxPositions: 3,
      expectedOpposite: { passed: false, rejectReason: 'opposite_entry_same_instant', tradeId: 'LONG_SAME_INSTANT' },
      expectedMaxPassed: true,
    },
    {
      label: 'position cap still enforced',
      finalDirection: 'buy',
      activeTrades: [{ id: 'LONG_CAP_1', action: 'BUY', direction: 'long', ledgerData: { candleTimestamp: 1699999100000 } }],
      maxPositions: 1,
      expectedOpposite: { passed: true, rejectReason: null },
      expectedMaxPassed: false,
    },
    {
      label: 'unkeyed legacy leg treated as earlier standing state',
      finalDirection: 'sell',
      activeTrades: [{ id: 'LONG_LEGACY_UNKEYED', action: 'BUY', direction: 'long' }],
      maxPositions: 3,
      expectedOpposite: { passed: true, rejectReason: null },
      expectedMaxPassed: true,
    },
  ])('opposite-position gate table: $label', ({ finalDirection, activeTrades, maxPositions, expectedOpposite, expectedMaxPassed }) => {
    const loop = new TradingLoop(baseEntryContext());

    const gates = loop._entryRiskGates(
      finalDirection,
      'both',
      candles(),
      activeTrades,
      maxPositions,
      0.5,
      0.8,
      [],
      1700000000000
    );

    expect(gates.find(gate => gate.gate === 'opposite_position_block')).toEqual(expect.objectContaining(expectedOpposite));
    expect(gates.find(gate => gate.gate === 'max_positions')).toEqual(expect.objectContaining({
      passed: expectedMaxPassed,
    }));
  });

  test('blocks entries when same-instant active trade direction is unknown', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext();
      ctx.config.evalTraceEnabled = true;
      mockStateManager.getTradesBySymbol.mockReturnValue([{
        id: 'MALFORMED_ACTIVE_1',
        orderId: 'MALFORMED_ACTIVE_1',
        symbol: 'TSLA',
        action: 'SELL',
        direction: null,
        entryPrice: 100,
        entryTime: Date.now() - 60000,
        ledgerData: { candleTimestamp: 1700000000000 },
      }]);
      mockExitContractManager.checkExitConditions.mockReturnValue({ shouldExit: false, details: 'Holding' });
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await loop._analyze('TSLA', 'trace_unknown_active_direction_1');

      expect(ctx.executeTrade).not.toHaveBeenCalled();
      const skipEvent = sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP');
      expect(skipEvent).toEqual(expect.objectContaining({
        traceId: 'trace_unknown_active_direction_1',
        symbol: 'TSLA',
      }));
      expect(skipEvent.fields).toEqual(expect.objectContaining({
        reason: 'active_trade_direction_unknown',
        finalDirection: 'buy',
      }));
      expect(mockDecisionAutopsyLogger.writeAutopsy).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'TSLA',
        decision: expect.objectContaining({
          action: 'HOLD',
          blockReason: 'active_trade_direction_unknown',
        }),
        skipReason: 'active_trade_direction_unknown',
      }));
    } finally {
      configSpy.mockRestore();
    }
  });

  test('refuses unmapped execution actions before OrderExecutor handoff', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext();
      ctx.config.evalTraceEnabled = true;
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);
      loop._checkRiskAndBuildDecision = jest.fn(() => ({
        action: 'REVERSE',
        direction: 'long',
        confidence: 80,
      }));

      await loop._analyze('TSLA', 'trace_unknown_action_1');

      expect(ctx.executeTrade).not.toHaveBeenCalled();
      const skipEvent = sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP');
      expect(skipEvent.fields).toEqual(expect.objectContaining({
        reason: 'position_effect_unknown_action',
        finalDirection: 'buy',
      }));
      expect(mockDecisionAutopsyLogger.writeAutopsy).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'TSLA',
        decision: expect.objectContaining({
          action: 'HOLD',
          blockReason: 'position_effect_unknown_action',
        }),
        skipReason: 'position_effect_unknown_action',
      }));
    } finally {
      configSpy.mockRestore();
    }
  });

  test('refuses non-BUY TPO overrides before they become shorts', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext();
      ctx.config.evalTraceEnabled = true;
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);
      loop._gatherData.mockReturnValue({
        indicators: {
          rsi: 55,
          macd: {},
          trend: 'sideways',
          atr: 1,
          ema20: 100,
          ema50: 100,
        },
        patterns: [],
        regime: { currentRegime: 'sideways' },
        tpoResult: {
          signal: {
            highProbability: true,
            strength: 999,
            action: 'SELL',
          },
        },
        fibLevels: null,
        nearestFibLevel: null,
        nearestStructure: null,
      });

      await loop._analyze('TSLA', 'trace_tpo_short_block_1');

      expect(ctx.executeTrade).not.toHaveBeenCalled();
      expect(loop._runTRAI).not.toHaveBeenCalled();
      const skipEvent = sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP');
      expect(skipEvent.fields).toEqual(expect.objectContaining({
        reason: 'tpo_override_non_buy_action',
        source: 'TPO',
        overrideAction: 'SELL',
        finalDirection: null,
        confidencePct: 80,
        minConfidencePct: 50,
      }));
      expect(mockDecisionAutopsyLogger.writeAutopsy).toHaveBeenCalledWith(expect.objectContaining({
        source: 'tpo_override',
        decision: expect.objectContaining({
          action: 'HOLD',
          blockReason: 'tpo_override_non_buy_action',
        }),
        skipReason: 'tpo_override_non_buy_action',
      }));
    } finally {
      configSpy.mockRestore();
    }
  });

  test('rejects invalid direction filter tokens instead of treating them as both', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'sideways' });
    try {
      const ctx = baseEntryContext();
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await expect(loop._analyze('TSLA', 'trace_bad_direction_filter_1')).rejects.toThrow(
        'pipeline.directionFilter expected one of both,long_only,short_only'
      );
      expect(ctx.executeTrade).not.toHaveBeenCalled();
      expect(loop._runTRAI).not.toHaveBeenCalled();
    } finally {
      configSpy.mockRestore();
    }
  });

  test('emits a scoped risk_block gate_event without executing when RiskManager blocks', async () => {
    const ctx = baseEntryContext({
      executeTrade: jest.fn(),
      riskManager: {
        isTradingAllowed: jest.fn(() => ({
          allowed: false,
          reason: 'Daily loss limit',
          riskGates: [{ gate: 'daily_loss_limit', threshold: 500, value: 750, passed: false, rejectReason: 'Daily loss limit' }],
        })),
        assessTradeRisk: jest.fn(),
      },
    });
    ctx.config.evalTraceEnabled = true;
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_gate_block_1');

    expect(ctx.executeTrade).not.toHaveBeenCalled();
    expect(ctx.riskManager.assessTradeRisk).not.toHaveBeenCalled();
    const frames = sentFrames(ctx);
    const gateEvent = frames.find(frame => frame.type === 'gate_event');
    expect(gateEvent).toEqual(expect.objectContaining({
      traceId: 'trace_gate_block_1',
      signalId: 'trace_gate_block_1:signal',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      action: 'HOLD',
      kind: 'risk_block',
      passed: false,
      reason: 'Daily loss limit',
    }));
    expect(gateEvent.riskGates).toEqual([
      { gate: 'daily_loss_limit', threshold: 500, value: 750, passed: false, rejectReason: 'Daily loss limit' },
    ]);
    const skipEvent = frames.find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP');
    expect(skipEvent).toEqual(expect.objectContaining({
      traceId: 'trace_gate_block_1',
      symbol: 'TSLA',
      brokerId: 'alpaca',
      accountId: 'paper-main',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
    }));
    expect(skipEvent.fields).toEqual(expect.objectContaining({
      reason: 'Daily loss limit',
      finalDirection: 'buy',
      confidencePct: 80,
      minConfidencePct: 50,
    }));
    expect(frames.find(frame => frame.type === 'bot_thinking')).toEqual(expect.objectContaining({
      message: 'Blocked: Daily loss limit',
      asset: 'TSLA',
      data: expect.objectContaining({
        indicators: {
          rsi: 55,
          atr: 1,
          macd: null,
          macdSignal: null,
          macdHistogram: null,
          volume: 1000,
        }
      })
    }));
  });

  test('allows same-direction entries to reach contract-owned execution checks', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_OPEN_SAME_DIRECTION_1',
      orderId: 'BUY_OPEN_SAME_DIRECTION_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);
    const ctx = baseEntryContext({
      executeTrade: jest.fn(),
    });
    ctx.config.evalTraceEnabled = true;
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_same_direction_block_1');

    expect(ctx.executeTrade).toHaveBeenCalledTimes(1);
    const decision = ctx.executeTrade.mock.calls[0][0];
    expect(decision).toEqual(expect.objectContaining({
      action: 'BUY',
      traceId: 'trace_same_direction_block_1',
      signalId: 'trace_same_direction_block_1:signal',
    }));
    const frames = sentFrames(ctx);
    expect(frames.find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP')).toBeUndefined();
    const gateEvent = frames.find(frame => frame.type === 'gate_event');
    expect(gateEvent.riskGates.map(gate => gate.gate)).toEqual(expect.arrayContaining([
      'opposite_position_block',
      'max_positions',
    ]));
  });

  test('allows same-direction short entries when an active short has matching side fields', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      mockStateManager.getTradesBySymbol.mockReturnValue([{
        id: 'SHORT_OPEN_SAME_DIRECTION_1',
        orderId: 'SHORT_OPEN_SAME_DIRECTION_1',
        action: 'SELL_SHORT',
        direction: 'short',
        symbol: 'TSLA',
        assetClass: 'stocks',
        entryPrice: 100,
        sizeUsd: 1000,
      }]);
      const ctx = baseEntryContext({
        executeTrade: jest.fn(),
      });
      ctx.config.evalTraceEnabled = true;
      ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
        direction: 'sell',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'sell', confidence: 0.8, reason: 'test short signal' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1 },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      }));
      mockExitContractManager.checkExitConditions.mockReturnValue({ shouldExit: false, details: 'Holding' });
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await loop._analyze('TSLA', 'trace_same_short_direction_1');

      expect(ctx.executeTrade).toHaveBeenCalledTimes(1);
      expect(ctx.executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
        action: 'SELL_SHORT',
        direction: 'short',
        traceId: 'trace_same_short_direction_1',
      }));
      expect(sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'DECISION_SKIP')).toBeUndefined();
    } finally {
      configSpy.mockRestore();
    }
  });

  test('allows same-direction entries from different strategies on one ticker', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'RSI_LONG_1',
      orderId: 'RSI_LONG_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryStrategy: 'RSI',
      entryPrice: 100,
      sizeUsd: 500,
    }]);
    const ctx = baseEntryContext({
      executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'EMA_LONG_1' }),
    });
    ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
      direction: 'buy',
      confidence: 80,
      winnerStrategy: 'EMASMACrossover',
      allResults: [{ strategyName: 'EMASMACrossover', direction: 'buy', confidence: 0.8, reason: 'fresh cross' }],
      exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1, useStructuralExits: false, maxConcurrentEntries: 1, scaleIn: { enabled: false } },
      confluence: { count: 1, strategies: ['EMASMACrossover'] },
      sizingMultiplier: 1,
    }));
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_two_strategy_same_direction_1');

    expect(ctx.executeTrade).toHaveBeenCalledTimes(1);
    expect(ctx.executeTrade.mock.calls[0][6]).toEqual(expect.objectContaining({
      winnerStrategy: 'EMASMACrossover',
    }));
  });

  test('executes NoWick twin fanout as two entry handoffs', async () => {
    const ctx = baseEntryContext({
      executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'NOWICK_TWIN' }),
    });
    const firstContract = { stopLossPercent: -1, takeProfitPercent: 1, useStructuralExits: true, maxConcurrentEntries: 2, scaleIn: { enabled: false } };
    const secondContract = { stopLossPercent: -1.5, takeProfitPercent: 1.5, useStructuralExits: true, maxConcurrentEntries: 2, scaleIn: { enabled: false } };
    ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
      direction: 'buy',
      confidence: 80,
      winnerStrategy: 'NoWickImbalance',
      allResults: [{ strategyName: 'NoWickImbalance', direction: 'buy', confidence: 0.8, reason: 'twin proof' }],
      exitContract: firstContract,
      confluence: { count: 1, strategies: ['NoWickImbalance'] },
      sizingMultiplier: 1,
      entryFanout: [{
        fanoutIndex: 0,
        fanoutCount: 2,
        entryGroupType: 'twin',
        entryGroupId: 'bullish:1:2',
        entryTriggerClass: 'nowick_retrace',
        sizingMultiplier: 0.5,
        exitContract: firstContract,
      }, {
        fanoutIndex: 1,
        fanoutCount: 2,
        entryGroupType: 'twin',
        entryGroupId: 'bullish:1:2',
        entryTriggerClass: 'nowick_retrace',
        sizingMultiplier: 0.5,
        exitContract: secondContract,
      }],
    }));
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_nowick_twin_fanout_1');

    expect(ctx.executeTrade).toHaveBeenCalledTimes(2);
    expect(ctx.executeTrade.mock.calls.map(call => call[0].signalId)).toEqual([
      'trace_nowick_twin_fanout_1:signal:fanout:1',
      'trace_nowick_twin_fanout_1:signal:fanout:2',
    ]);
    expect(ctx.executeTrade.mock.calls.map(call => call[6].sizingMultiplier)).toEqual([0.5, 0.5]);
    expect(ctx.executeTrade.mock.calls.map(call => call[6].exitContract.stopLossPercent)).toEqual([-1, -1.5]);
  });

  test('allows short entry on the next evaluation after the long exit contract closes', async () => {
    const configSpy = mockDirectionConfig({ directionFilter: 'both' });
    try {
      const ctx = baseEntryContext({
        executeTrade: jest.fn().mockResolvedValue({ success: true, orderId: 'SEQ_REVERSAL' }),
      });
      ctx.strategyOrchestrator.evaluate = jest.fn(() => ({
        direction: 'sell',
        confidence: 80,
        winnerStrategy: 'RSI',
        allResults: [{ strategyName: 'RSI', direction: 'sell', confidence: 0.8, reason: 'short setup' }],
        exitContract: { stopLossPercent: -0.5, takeProfitPercent: 1, useStructuralExits: false, maxConcurrentEntries: 1, scaleIn: { enabled: false } },
        confluence: { count: 1, strategies: ['RSI'] },
        sizingMultiplier: 1,
      }));
      const openLong = {
        id: 'LONG_TO_EXIT_1',
        orderId: 'LONG_TO_EXIT_1',
        action: 'BUY',
        direction: 'long',
        symbol: 'TSLA',
        entryPrice: 100,
        entryTime: Date.now() - 60000,
      };
      mockStateManager.getTradesBySymbol.mockReturnValueOnce([openLong]);
      mockExitContractManager.checkExitConditions.mockReturnValueOnce({
        shouldExit: true,
        exitReason: 'stop_loss',
        confidence: 100,
        details: 'contract closed long',
      });
      const loop = new TradingLoop(ctx);
      stubGatherData(loop);

      await loop._analyze('TSLA', 'trace_sequence_exit_1');
      expect(ctx.executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
        action: 'SELL',
        tradeId: 'LONG_TO_EXIT_1',
      }));

      mockStateManager.getTradesBySymbol.mockReturnValue([]);
      mockExitContractManager.checkExitConditions.mockReturnValue({ shouldExit: false, details: 'flat' });
      await loop._analyze('TSLA', 'trace_sequence_short_1');

      expect(ctx.executeTrade.mock.calls[1][0]).toEqual(expect.objectContaining({
        action: 'SELL_SHORT',
        direction: 'short',
        traceId: 'trace_sequence_short_1',
      }));
    } finally {
      configSpy.mockRestore();
    }
  });

  test('renders minimum confidence in percent on HOLD thinking frames', () => {
    const ctx = baseEntryContext();
    const loop = new TradingLoop(ctx);

    loop._broadcastDecision(
      'TSLA',
      100,
      { rsi: 55, atr: 1, volume: 1000 },
      [],
      { currentRegime: 'trend', confidence: 0.75 },
      { confidence: 40, direction: 'buy', winnerStrategy: 'RSI', reasons: ['below_min_confidence'] },
      { action: 'HOLD', confidence: 40 },
      { totalConfidence: 40 },
      0.5
    );

    expect(sentFrames(ctx).find(frame => frame.type === 'bot_thinking')).toEqual(expect.objectContaining({
      message: 'Waiting: Confidence 40.0% < 50% minimum',
      asset: 'TSLA',
    }));
  });

  test('does not render a fired strategy with missing direction as hold', () => {
    const ctx = baseEntryContext({
      strategyOrchestrator: {
        strategies: [{ name: 'RSI' }, { name: 'EMASMACrossover' }],
      },
    });
    const loop = new TradingLoop(ctx);

    loop._broadcastDecision(
      'TSLA',
      100,
      { rsi: 55, atr: 1, volume: 1000 },
      [],
      { currentRegime: 'trend', confidence: 0.75 },
      {
        direction: 'hold',
        confidence: 40,
        winnerStrategy: null,
        allResults: [{ strategyName: 'RSI', confidence: 0.6, reason: 'missing direction' }],
        reasons: ['below_min_confidence'],
      },
      { action: 'HOLD', confidence: 40 },
      { totalConfidence: 40 },
      0.5
    );

    const thinking = sentFrames(ctx).find(frame => frame.type === 'bot_thinking');
    expect(thinking.strategy_stack).toEqual([
      expect.objectContaining({
        id: 'RSI',
        confidence: 0.6,
        direction: null,
        directionIntegrityRefusal: true,
        refusalCode: 'strategy_direction_unknown',
      }),
      expect.objectContaining({
        id: 'EMASMACrossover',
        confidence: 0,
        direction: 'hold',
        directionIntegrityRefusal: false,
        refusalCode: null,
      }),
    ]);
  });

  test('does not emit entry gate_event frames for exit decisions', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_GATE_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_GATE_EXIT_1',
      orderId: 'BUY_GATE_EXIT_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = baseEntryContext({
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 190,
        timestamp: 1700000000000,
        volume: 1000,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      strategyOrchestrator: {
        strategies: [],
        evaluate: jest.fn(() => ({
          direction: 'hold',
          confidence: 0,
          winnerStrategy: null,
          allResults: [],
          confluence: { count: 0, strategies: [] },
          sizingMultiplier: 1,
        })),
      },
      executeTrade,
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);

    await loop._analyze('TSLA', 'trace_gate_exit_1');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_GATE_EXIT_1',
    }));
    expect(executeTrade.mock.calls[0][0].ledgerData).toBeUndefined();
    expect(sentFrames(ctx).filter(frame => frame.type === 'gate_event')).toEqual([]);
  });

  test('applies the TTP consistency cap on the main candle exit path', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_MAIN_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_MAIN_1',
      orderId: 'BUY_MAIN_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = {
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 190,
        timestamp: 1700000000000,
        volume: 1000,
      },
      config: {
        minTradeConfidence: 0.5,
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      strategyOrchestrator: {
        evaluate: jest.fn(() => ({
          direction: 'hold',
          confidence: 0,
          winnerStrategy: null,
          allResults: [],
          confluence: { count: 0, strategies: [] },
          sizingMultiplier: 1,
        })),
      },
      executeTrade,
      broadcastPatternAnalysis: jest.fn(),
    };
    const loop = new TradingLoop(ctx);
    loop._gatherData = jest.fn(() => ({
      indicators: {
        rsi: 55,
        macd: {},
        trend: 'sideways',
        atr: 1,
        ema20: 100,
        ema50: 100,
      },
      patterns: [],
      regime: { currentRegime: 'sideways' },
      tpoResult: null,
      fibLevels: null,
      nearestFibLevel: null,
      nearestStructure: null,
    }));
    loop._runTRAI = jest.fn();
    loop._broadcastDecision = jest.fn();

    await loop._analyze('TSLA', 'trace_consistency_main');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      positionEffect: 'close_long',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_MAIN_1',
      traceId: 'trace_consistency_main',
      signalId: 'trace_consistency_main:exit',
    }));
    expect(executeTrade.mock.calls[0][0]).not.toHaveProperty('direction');
    expect(executeTrade.mock.calls[0][0].ledgerData).toBeUndefined();
    expect(mockExitContractManager.checkExitConditions).not.toHaveBeenCalled();
  });

  test('main candle profit planner exits flow through ExitContractManager and do not inherit zero hold confidence', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_PROFIT_MAIN_1' });
    mockExitContractManager.checkExitConditions.mockReturnValue({
      shouldExit: true,
      exitReason: 'profit_tier_1',
      confidence: 100,
      exitFraction: 0.3,
      exitIntent: {
        action: 'exit_partial',
        reason: 'profit_tier_1',
        exitRole: 'profit',
        stateKey: 'tierStates',
        tierIndex: 0,
        exitFraction: 0.3,
        intentId: 'trace_profit_exit_zero_hold_conf:profit:BUY_MPM_1',
        expectedTradeRevision: 0,
        expectedRemainingQuantity: 7,
        evidence: {},
      },
    });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_MPM_1',
      orderId: 'BUY_MPM_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = baseEntryContext({
      marketData: {
        symbol: 'TSLA',
        price: 101,
        timestamp: 1700000000000,
        volume: 1000,
      },
      strategyOrchestrator: {
        evaluate: jest.fn(() => ({
          direction: 'hold',
          confidence: 0,
          winnerStrategy: null,
          allResults: [],
          confluence: { count: 0, strategies: [] },
          sizingMultiplier: 1,
        })),
      },
      executeTrade,
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);
    loop._broadcastDecision = jest.fn();

    await loop._analyze('TSLA', 'trace_profit_exit_zero_hold_conf');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      positionEffect: 'close_long',
      confidence: 100,
      exitReason: 'profit_tier_1',
      exitFraction: 0.3,
      tradeId: 'BUY_MPM_1',
      traceId: 'trace_profit_exit_zero_hold_conf',
      signalId: 'trace_profit_exit_zero_hold_conf:exit',
    }));
    expect(executeTrade.mock.calls[0][0]).not.toHaveProperty('direction');
    expect(executeTrade.mock.calls[0][0].exitIntent).toEqual(expect.objectContaining({
      reason: 'profit_tier_1',
      stateKey: 'tierStates',
      tierIndex: 0,
    }));
    expect(executeTrade.mock.calls[0][0].ledgerData).toBeUndefined();
  });

  test('main candle exit records missing checker confidence as null', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_PROFIT_MAIN_NULL_CONF' });
    mockExitContractManager.checkExitConditions.mockReturnValue({
      shouldExit: true,
      exitReason: 'profit_tier_1',
      exitFraction: 0.3,
      details: 'profit target without confidence',
    });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_MAIN_NULL_CONF',
      orderId: 'BUY_MAIN_NULL_CONF',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = baseEntryContext({
      marketData: {
        symbol: 'TSLA',
        price: 101,
        timestamp: 1700000000000,
        volume: 1000,
      },
      strategyOrchestrator: {
        evaluate: jest.fn(() => ({
          direction: 'hold',
          confidence: 0,
          winnerStrategy: null,
          allResults: [],
          confluence: { count: 0, strategies: [] },
          sizingMultiplier: 1,
        })),
      },
      executeTrade,
    });
    const loop = new TradingLoop(ctx);
    stubGatherData(loop);
    loop._broadcastDecision = jest.fn();

    await loop._analyze('TSLA', 'trace_profit_exit_null_conf');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      positionEffect: 'close_long',
      confidence: null,
      exitReason: 'profit_tier_1',
      tradeId: 'BUY_MAIN_NULL_CONF',
    }));
    expect(executeTrade.mock.calls[0][0]).not.toHaveProperty('direction');
    expect(mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0].exitEvaluations[0]).toEqual(
      expect.objectContaining({ confidence: null })
    );
  });

  test('forces a TTP consistency exit when an open stock position reaches the configured profit cap', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_1',
      orderId: 'BUY_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = {
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 190,
        timestamp: 1700000000000,
        volume: 1000,
      },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: {
            enabled: true,
            maxPositionProfitRatio: 0.30,
            profitTargetDollars: 3000,
          },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await loop._checkExitsOnly('TSLA');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      positionEffect: 'close_long',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_1',
    }));
    expect(executeTrade.mock.calls[0][0]).not.toHaveProperty('direction');
    expect(mockExitContractManager.checkExitConditions).not.toHaveBeenCalled();
    const autopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
    expect(autopsy).toEqual(expect.objectContaining({
      source: 'exit_only',
      status: 'execute',
      symbol: 'TSLA',
    }));
    expect(autopsy.decision).toEqual(expect.objectContaining({
      action: 'SELL',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_1',
    }));
    expect(autopsy.exitEvaluations).toEqual([
      expect.objectContaining({
        checker: 'ttp_consistency_profit_cap',
        shouldExit: true,
        exitReason: 'ttp_consistency_profit_cap',
      }),
    ]);
  });

  test('writes trace and autopsy when exit-only has no scoped price', async () => {
    for (const price of [NaN, undefined, null, '0', -1, {}]) {
      jest.clearAllMocks();
      mockStateManager.getTradesBySymbol.mockReturnValue([]);
      mockStateManager.getLastPrice.mockReturnValue(null);
      const executeTrade = jest.fn();
      const ctx = {
        priceHistory: candles(30),
        marketData: {
          symbol: 'TSLA',
          price,
          timestamp: 1700000000000,
          volume: 1000,
        },
        config: {
          brokerId: 'alpaca',
          accountId: 'paper-main',
          accountIdSource: 'config',
          assetClass: 'stocks',
          timeframe: '15m',
          executionMode: 'paper',
          enableBacktestMode: false,
          evalTraceEnabled: true,
          traceEventMaxBufferedBytes: 1048576,
        },
        indicatorEngine: {
          getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
          getRawState: jest.fn(() => null),
        },
        dashboardWs: { readyState: 1, bufferedAmount: 0, send: jest.fn() },
        executeTrade,
      };
      const loop = new TradingLoop(ctx);

      await loop._checkExitsOnly('TSLA');

      expect(executeTrade).not.toHaveBeenCalled();
      expect(mockStateManager.getTradesBySymbol).not.toHaveBeenCalled();
      const skipEvent = sentFrames(ctx).find(frame => frame.type === 'trace_event' && frame.event === 'ANALYSIS_SKIP');
      expect(skipEvent.fields).toEqual(expect.objectContaining({
        symbol: 'TSLA',
        reason: 'no_scoped_price',
        source: 'exit_only',
        route: 'global',
        marketSymbol: 'TSLA',
      }));
      const autopsy = mockDecisionAutopsyLogger.writeAutopsy.mock.calls.at(-1)[0];
      expect(autopsy).toEqual(expect.objectContaining({
        source: 'exit_only',
        symbol: 'TSLA',
        skipReason: 'no_scoped_price',
        decision: expect.objectContaining({ action: 'HOLD' }),
      }));
    }
  });

  test('contains exit-only no-price autopsy persistence failure', async () => {
    const executeTrade = jest.fn();
    mockDecisionAutopsyLogger.writeAutopsy.mockReturnValueOnce(false);
    const ctx = {
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: null,
        timestamp: 1700000000000,
        volume: 1000,
      },
      config: {
        brokerId: 'alpaca',
        accountId: 'paper-main',
        accountIdSource: 'config',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: true,
        traceEventMaxBufferedBytes: 1048576,
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      dashboardWs: { readyState: 1, bufferedAmount: 0, send: jest.fn() },
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await expect(loop._checkExitsOnly('TSLA')).resolves.toBeUndefined();

    expect(executeTrade).not.toHaveBeenCalled();
    expect(mockStateManager.getTradesBySymbol).not.toHaveBeenCalled();
    const events = sentFrames(ctx).map(frame => frame.event);
    expect(events).toContain('ANALYSIS_SKIP');
    expect(events).toContain('DECISION_AUTOPSY_WRITE_FAILED');
    expect(events).toContain('DECISION_AUTOPSY_FAILED');
  });

  test('uses the fresh per-symbol last price for exit-only checks instead of stale active-timeframe marketData', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_FRESH_PRICE_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_STOP_1',
      orderId: 'BUY_STOP_1',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);
    mockStateManager.getLastPrice.mockReturnValue(98.9);
    mockExitContractManager.checkExitConditions.mockImplementation((_trade, currentPrice, context) => ({
      shouldExit: currentPrice <= 99,
      exitReason: currentPrice <= 99 ? 'stop_loss' : undefined,
      confidence: 100,
      details: `fresh price ${currentPrice}`,
      contextPriceSource: context.priceSource,
    }));

    const ctx = {
      priceHistory: candles(30),
      marketData: {
        symbol: 'TSLA',
        price: 100.2,
        timestamp: 1700000000000,
        volume: 1000,
        timeframe: '15m',
        priceSource: 'active_timeframe',
      },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: {
            enabled: true,
            maxPositionProfitRatio: 0.30,
            profitTargetDollars: 3000,
          },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await loop._checkExitsOnly('TSLA');

    expect(mockExitContractManager.checkExitConditions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'BUY_STOP_1' }),
      98.9,
      expect.objectContaining({
        currentPrice: 98.9,
        priceSource: 'state_last_price',
      })
    );
    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      positionEffect: 'close_long',
      exitReason: 'stop_loss',
      tradeId: 'BUY_STOP_1',
    }));
    expect(executeTrade.mock.calls[0][0]).not.toHaveProperty('direction');
    expect(executeTrade.mock.calls[0][2]).toBe(98.9);
  });

  test('exit-only records missing checker confidence as null', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_FRESH_PRICE_NULL_CONF' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_STOP_NULL_CONF',
      orderId: 'BUY_STOP_NULL_CONF',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);
    mockStateManager.getLastPrice.mockReturnValue(98.9);
    mockExitContractManager.checkExitConditions.mockReturnValue({
      shouldExit: true,
      exitReason: 'stop_loss',
      details: 'fresh price without confidence',
    });

    const ctx = {
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 100.2, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await loop._checkExitsOnly('TSLA');

    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      positionEffect: 'close_long',
      confidence: null,
      exitReason: 'stop_loss',
      tradeId: 'BUY_STOP_NULL_CONF',
    }));
    expect(executeTrade.mock.calls[0][0]).not.toHaveProperty('direction');
    expect(executeTrade.mock.calls[0][1]).toEqual({ totalConfidence: null });
  });

  test('does not let a missing active-trade asset class bypass the TTP consistency cap in stock runtime', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_2' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_2',
      orderId: 'BUY_2',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const ctx = {
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade,
    };
    const loop = new TradingLoop(ctx);

    await loop._checkExitsOnly('TSLA');

    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'BUY_2',
    }));
  });

  test('forces a TTP consistency cover when a short position reaches the configured profit cap', async () => {
    const executeTrade = jest.fn().mockResolvedValue({ success: true, orderId: 'EXIT_CONSISTENCY_SHORT_1' });
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'SHORT_1',
      orderId: 'SHORT_1',
      direction: 'SHORT',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 10, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade,
    });

    await loop._checkExitsOnly('TSLA');

    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'COVER',
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: 'SHORT_1',
    }));
  });

  test('skips pattern observation when runtime feature extraction is unavailable', () => {
    const recordObservation = jest.fn();
    const getPatternStats = jest.fn(() => null);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const priorPatternSave = process.env.BACKTEST_NO_PATTERN_SAVE;
    process.env.BACKTEST_NO_PATTERN_SAVE = 'false';

    try {
      const loop = new TradingLoop(baseEntryContext({
        priceHistory: candles(10),
        indicatorEngine: {
          getSnapshot: jest.fn(() => ({
            indicators: {
              rsi: null,
              superTrendDirection: 'sideways',
              atrPercent: null,
              bbPercentB: null,
              macd: null,
              macdSignal: null,
            },
          })),
          getRawState: jest.fn(() => null),
        },
        fibonacciDetector: { detect: jest.fn(() => ({ levels: [] })) },
        patternChecker: {
          analyzePatterns: jest.fn(() => [{ name: 'Null Feature Pattern', confidence: 0.9 }]),
          memory: { recordObservation, getPatternStats },
        },
        broadcastPatternAnalysis: jest.fn(),
        backtestFast: false,
      }));

      const data = loop._gatherData(109, null, 'TSLA', { volume: 1000, timestamp: 1700000000009 });
      const pattern = data.patterns.find((candidate) => candidate.name === 'Null Feature Pattern');

      expect(pattern.features).toBeNull();
      expect(recordObservation).not.toHaveBeenCalled();
      expect(getPatternStats).not.toHaveBeenCalled();
      expect(loop._patternObservationCount).toBeUndefined();
    } finally {
      if (priorPatternSave === undefined) {
        delete process.env.BACKTEST_NO_PATTERN_SAVE;
      } else {
        process.env.BACKTEST_NO_PATTERN_SAVE = priorPatternSave;
      }
      errorSpy.mockRestore();
    }
  });

  test('fails loud when runtime asset class is missing while TTP consistency rules are enabled', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_4',
      orderId: 'BUY_4',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade: jest.fn(),
    });

    await expect(loop._checkExitsOnly('TSLA')).rejects.toThrow(/runtime assetClass missing/);
  });

  test('fails loud instead of filtering out a malformed active trade before TTP consistency evaluation', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'MALFORMED_1',
      orderId: 'MALFORMED_1',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: {
        enabled: true,
        ttp: {
          enabled: true,
          consistency: { enabled: true, maxPositionProfitRatio: 0.30, profitTargetDollars: 3000 },
        },
      },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade: jest.fn(),
    });

    await expect(loop._checkExitsOnly('TSLA')).rejects.toThrow(/missing close side/);
  });

  test('fails loud when TTP consistency config is missing while TTP eval rules are enabled', async () => {
    mockStateManager.getTradesBySymbol.mockReturnValue([{
      id: 'BUY_3',
      orderId: 'BUY_3',
      action: 'BUY',
      direction: 'long',
      symbol: 'TSLA',
      assetClass: 'stocks',
      entryPrice: 100,
      sizeUsd: 1000,
    }]);

    const loop = new TradingLoop({
      priceHistory: candles(30),
      marketData: { symbol: 'TSLA', price: 190, timestamp: 1700000000000, volume: 1000 },
      config: {
        brokerId: 'alpaca',
        assetClass: 'stocks',
        timeframe: '15m',
        executionMode: 'paper',
        enableBacktestMode: false,
        evalTraceEnabled: false,
      },
      evalRules: { enabled: true, ttp: { enabled: true } },
      indicatorEngine: {
        getSnapshot: jest.fn(() => ({ indicators: { atr: 1, rsi: 55, superTrendDirection: 'sideways' } })),
        getRawState: jest.fn(() => null),
      },
      executeTrade: jest.fn(),
    });

    await expect(loop._checkExitsOnly('TSLA')).rejects.toThrow(/consistency rule disabled or missing/);
  });
});
