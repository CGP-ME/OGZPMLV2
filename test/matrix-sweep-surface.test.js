'use strict';

const {
  DATA_SHORTCUTS,
  ALL_STRATEGIES,
  GRID,
  usesStructuralExits,
  filterStrategiesForPhase,
  generateMatrix,
  getDataLabel,
} = require('../tools/matrix-sweep');

describe('matrix-sweep runnable surface', () => {
  test('tsla shortcut uses the current stock eval baseline', () => {
    expect(DATA_SHORTCUTS.tsla).toBe('tuning/tsla-15m-2y.json');
    expect(getDataLabel(DATA_SHORTCUTS.tsla)).toBe('tsla-2y');
  });

  test('exploratory roster excludes MarketRegime because it is a regime filter, not a solo strategy', () => {
    expect(ALL_STRATEGIES).toEqual(expect.arrayContaining([
      'CandlePattern',
      'NoWickImbalance',
      'BreakRetest',
      'OpeningRangeBreakout',
      'SmartMoneySweep',
    ]));
    expect(ALL_STRATEGIES).not.toContain('MarketRegime');
  });

  test('structural-exit strategies are excluded from exit-geometry phases', () => {
    expect(usesStructuralExits('LiquiditySweep')).toBe(true);
    expect(usesStructuralExits('SmartMoneySweep')).toBe(true);
    expect(usesStructuralExits('NoWickImbalance')).toBe(true);

    expect(filterStrategiesForPhase([
      'RSI',
      'LiquiditySweep',
      'SmartMoneySweep',
      'NoWickImbalance',
    ], 'exits')).toEqual({
      runnable: ['RSI'],
      skipped: ['LiquiditySweep', 'SmartMoneySweep', 'NoWickImbalance'],
    });
  });

  test('structural-exit strategies can still run confidence sweeps', () => {
    const configs = generateMatrix(['NoWickImbalance'], GRID.conf, 'conf');

    expect(configs).toHaveLength(GRID.conf.confidence.length);
    expect(configs.every(config => config.strategy === 'NoWickImbalance')).toBe(true);
    expect(configs.every(config => config.env.ENABLE_NOWICK === 'true')).toBe(true);
  });

  test('structural-exit strategies generate no false full or exit matrices', () => {
    expect(generateMatrix(['NoWickImbalance'], GRID.exits, 'exits')).toHaveLength(0);
    expect(generateMatrix(['LiquiditySweep'], GRID.full, 'full')).toHaveLength(0);
    expect(generateMatrix(['SmartMoneySweep'], GRID.quick, 'quick')).toHaveLength(0);
  });
});
