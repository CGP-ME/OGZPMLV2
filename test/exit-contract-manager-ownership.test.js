'use strict';

const { ExitContractManager } = require('../core/ExitContractManager');

describe('ExitContractManager exit ownership contract', () => {
  test('rejects explicit trade exit contracts without structural ownership', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');
    const trade = {
      id: 'OWNERSHIP_1',
      entryPrice: 100,
      entryTime: now - 60000,
      direction: 'long',
      entryStrategy: 'EMASMACrossover',
      exitContract: {
        stopLossPercent: -0.5,
        takeProfitPercent: 1,
      },
    };

    expect(() => manager.checkExitConditions(trade, 100, { currentTime: now }))
      .toThrow(/ExitContractManager\.checkExitConditions: exitContract\.useStructuralExits missing\/invalid/);
  });

  test('default contracts selected by strategy carry explicit structural ownership', () => {
    const manager = new ExitContractManager();
    const now = Date.parse('2026-06-28T12:00:00.000Z');
    const trade = {
      id: 'OWNERSHIP_2',
      entryPrice: 100,
      entryTime: now - 60000,
      direction: 'long',
      entryStrategy: 'EMASMACrossover',
    };

    expect(() => manager.checkExitConditions(trade, 100, { currentTime: now })).not.toThrow();
    expect(trade.exitContract.useStructuralExits).toBe(false);
  });
});
