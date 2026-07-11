'use strict';

const {
  parseBacktestConfigOverrides,
  applyBacktestConfigOverrides,
} = require('../core/BacktestConfigOverrides');

function backtestIdentity(extra = {}) {
  return {
    isBacktest: true,
    executionMode: 'backtest',
    candleSource: 'file',
    liveTrading: false,
    ...extra,
  };
}

describe('BacktestConfigOverrides', () => {
  test('parses strategy exit contract overrides for backtest workers', () => {
    const raw = JSON.stringify({
      'exitContracts.EMASMACrossover.stopLossPercent': -2.5,
      'exitContracts.EMASMACrossover.takeProfitPercent': 1.25,
      'exitContracts.EMASMACrossover.trailingActivation': 0,
      'exitContracts.EMASMACrossover.maxHoldTimeMinutes': 300,
    });

    expect(parseBacktestConfigOverrides(raw, backtestIdentity())).toEqual({
      'exitContracts.EMASMACrossover.stopLossPercent': -2.5,
      'exitContracts.EMASMACrossover.takeProfitPercent': 1.25,
      'exitContracts.EMASMACrossover.trailingActivation': 0,
      'exitContracts.EMASMACrossover.maxHoldTimeMinutes': 300,
    });
  });

  test('refuses override payload outside backtest mode', () => {
    expect(() => parseBacktestConfigOverrides(
      JSON.stringify({ 'exitContracts.EMASMACrossover.stopLossPercent': -2.5 }),
      { isBacktest: false }
    )).toThrow(/outside file-backed EXECUTION_MODE=backtest/);
  });

  test('refuses poisoned backtest boolean without full backtest identity', () => {
    expect(() => parseBacktestConfigOverrides(
      JSON.stringify({ 'exitContracts.EMASMACrossover.stopLossPercent': -2.5 }),
      backtestIdentity({ executionMode: 'live' })
    )).toThrow(/outside file-backed EXECUTION_MODE=backtest/);

    expect(() => parseBacktestConfigOverrides(
      JSON.stringify({ 'exitContracts.EMASMACrossover.stopLossPercent': -2.5 }),
      backtestIdentity({ candleSource: 'websocket' })
    )).toThrow(/outside file-backed EXECUTION_MODE=backtest/);

    expect(() => parseBacktestConfigOverrides(
      JSON.stringify({ 'exitContracts.EMASMACrossover.stopLossPercent': -2.5 }),
      backtestIdentity({ liveTrading: true })
    )).toThrow(/outside file-backed EXECUTION_MODE=backtest/);
  });

  test('refuses unsupported config paths', () => {
    expect(() => parseBacktestConfigOverrides(
      JSON.stringify({ 'confidence.minTradeConfidence': 0.2 }),
      backtestIdentity()
    )).toThrow(/Unsupported path 'confidence\.minTradeConfidence'/);
  });

  test('refuses invalid stop loss sign', () => {
    expect(() => parseBacktestConfigOverrides(
      JSON.stringify({ 'exitContracts.EMASMACrossover.stopLossPercent': 2.5 }),
      backtestIdentity()
    )).toThrow(/must be negative percent-form/);
  });

  test('applies parsed overrides through ConfigLoader backtest surface', () => {
    const calls = [];
    const raw = JSON.stringify({ 'exitContracts.EMASMACrossover.stopLossPercent': -2.5 });
    const applied = applyBacktestConfigOverrides(raw, {
      ...backtestIdentity(),
      tradingConfig: {
        applyBacktestConfigOverrides(overrides, context) {
          calls.push({ overrides, context });
        },
      },
    });

    expect(applied).toEqual({ 'exitContracts.EMASMACrossover.stopLossPercent': -2.5 });
    expect(calls).toEqual([{
      overrides: applied,
      context: expect.objectContaining({
        source: 'BacktestConfigOverrides',
        isBacktest: true,
        executionMode: 'backtest',
        candleSource: 'file',
        liveTrading: false,
      }),
    }]);
  });

  test('ConfigLoader setOverrides refuses direct non-test mutation', () => {
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    jest.resetModules();

    try {
      const ConfigLoader = require('../foundation/ConfigLoader');
      expect(() => ConfigLoader.setOverrides({
        'exitContracts.EMASMACrossover.stopLossPercent': -2.5,
      })).toThrow(/setOverrides\(\) is test-only/);
    } finally {
      if (originalJestWorkerId === undefined) {
        delete process.env.JEST_WORKER_ID;
      } else {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      }
      jest.resetModules();
    }
  });

  test('ConfigLoader backtest override sink refuses spoofed identity', () => {
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    jest.resetModules();

    try {
      const ConfigLoader = require('../foundation/ConfigLoader');
      expect(() => ConfigLoader.applyBacktestConfigOverrides({
        'exitContracts.EMASMACrossover.stopLossPercent': -2.5,
      }, {
        source: 'BacktestConfigOverrides',
        isBacktest: true,
        executionMode: 'paper',
        candleSource: 'file',
        liveTrading: false,
      })).toThrow(/requires validated file-backed EXECUTION_MODE=backtest identity/);
    } finally {
      if (originalJestWorkerId === undefined) {
        delete process.env.JEST_WORKER_ID;
      } else {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      }
      jest.resetModules();
    }
  });

  test('ConfigLoader tuning profile apply refuses direct non-backtest runtime mutation', () => {
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    jest.resetModules();

    try {
      const ConfigLoader = require('../foundation/ConfigLoader');
      expect(() => ConfigLoader.applyTuningProfile('current-eval', {
        phase: 'startup',
        source: 'unit-test',
      })).toThrow(/applyTuningProfile\(\) requires file-backed EXECUTION_MODE=backtest identity/);
    } finally {
      if (originalJestWorkerId === undefined) {
        delete process.env.JEST_WORKER_ID;
      } else {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      }
      jest.resetModules();
    }
  });
});
