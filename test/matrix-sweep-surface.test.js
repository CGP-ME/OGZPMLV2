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
const {
  CONFIG_ENV_OVERRIDE_ALLOWLIST,
} = require('../tools/backtest-worker-env');
const {
  PROFILE_FORBIDDEN_ENV_KEYS,
} = require('../tools/tuning-profiles');
const { BASE_CONFIG } = require('../core/TradingConfig');

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

  test('all generated matrix env keys are explicit worker override keys', () => {
    const keys = new Set();

    for (const phase of Object.keys(GRID)) {
      const configs = generateMatrix(ALL_STRATEGIES, GRID[phase], phase);
      for (const config of configs || []) {
        for (const key of Object.keys(config.env || {})) keys.add(key);
      }
    }

    expect([...keys].sort()).toEqual([...keys].filter(key => CONFIG_ENV_OVERRIDE_ALLOWLIST.has(key)).sort());
  });

  test('matrix sweeps never generate locked-exit env overrides', () => {
    const forbidden = new Set(PROFILE_FORBIDDEN_ENV_KEYS);

    for (const phase of Object.keys(GRID)) {
      const configs = generateMatrix(ALL_STRATEGIES, GRID[phase], phase);
      for (const config of configs || []) {
        expect(Object.keys(config.env || {}).filter(key => forbidden.has(key))).toEqual([]);
      }
    }
  });

  test('exit phase sweeps only honored tier targets with locked SL metadata', () => {
    const configs = generateMatrix(['RSI'], GRID.exits, 'exits');
    const lockedRsiStop = Math.abs(BASE_CONFIG.exitContracts.RSI.stopLossPercent);

    expect(configs).toHaveLength(GRID.exits.tierPresets.length * GRID.exits.confidence.length);
    expect(configs.every(config => config.lockedSL === lockedRsiStop)).toBe(true);
    expect(configs.every(config => config.env.STOP_LOSS_PERCENT === undefined)).toBe(true);
    expect(configs.every(config => config.env.TAKE_PROFIT_PERCENT === undefined)).toBe(true);
    expect(new Set(configs.map(config => config.env.TIER1_TARGET)).size).toBeGreaterThan(1);
  });
});
