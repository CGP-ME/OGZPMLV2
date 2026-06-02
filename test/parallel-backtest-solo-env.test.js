'use strict';

const {
  STRATEGIES,
  parseSoloStrategies,
  buildDormantStrategyEnableEnv,
  assertDormantStrategyEnvCompatible,
} = require('../tools/parallel-backtest');

describe('parallel-backtest solo strategy env wiring', () => {
  test('strategy roster includes exploratory strategies that matrix-sweep can run', () => {
    expect(STRATEGIES).toEqual(expect.arrayContaining([
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'OpeningRangeBreakout',
      'SmartMoneySweep',
    ]));
  });

  test('comma-separated solo strategy list is normalized for orchestrator parity', () => {
    expect(parseSoloStrategies('NoWickImbalance, OpeningRangeBreakout, BreakRetest')).toEqual([
      'nowickimbalance',
      'openingrangebreakout',
      'breakretest',
    ]);
  });

  test('solo NoWick enables the dormant pipeline toggle for the child worker', () => {
    expect(buildDormantStrategyEnableEnv('NoWickImbalance')).toEqual({
      ENABLE_NOWICK: 'true',
    });
  });

  test('solo ORB and BreakRetest enable their dormant toggles for generated configs', () => {
    expect(buildDormantStrategyEnableEnv('OpeningRangeBreakout,BreakRetest')).toEqual({
      ENABLE_ORB: 'true',
      ENABLE_BREAKRETEST: 'true',
    });
  });

  test('non-solo runs do not silently override operator env flags', () => {
    expect(buildDormantStrategyEnableEnv('')).toEqual({});
    expect(buildDormantStrategyEnableEnv(null)).toEqual({});
  });

  test('contradictory solo config fails instead of silently disabling the selected strategy', () => {
    expect(() => assertDormantStrategyEnvCompatible('NoWickImbalance', {
      ENABLE_NOWICK: 'false',
    })).toThrow(/ENABLE_NOWICK=false conflicts with SOLO_STRATEGY=NoWickImbalance/);
  });
});
