'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('PipelineSnapshot runtime scope metadata', () => {
  let originalLog;

  beforeEach(() => {
    jest.useFakeTimers();
    originalLog = console.log;
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    jest.useRealTimers();
  });

  function createSnapshot(runtimeScope) {
    const PipelineSnapshot = require('../core/PipelineSnapshot');
    const outputFile = path.join(os.tmpdir(), `pipeline-snapshot-scope-${Date.now()}.jsonl`);
    const snapshot = new PipelineSnapshot({
      stateManager: {
        get: jest.fn(() => undefined),
        getDashboardRuntimeScope: () => runtimeScope
      },
      priceHistory: [],
      balance: 10000,
      position: 0,
    }, {
      outputFile,
      intervalMs: 60000,
    });
    try {
      return snapshot._buildSnapshot();
    } finally {
      snapshot.stop();
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    }
  }

  test('includes complete runtime scope fields when StateManager has them', () => {
    const runtimeScope = {
      symbol: 'TSLA',
      broker: 'alpaca',
      brokerId: 'alpaca',
      accountId: 'acct-1',
      accountIdSource: 'config',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:acct-1:stocks:TSLA:15m',
      scopeKeyVersion: 2,
      scopeComplete: true,
      runtimeScopeStatus: 'complete',
      missingFields: []
    };

    expect(createSnapshot(runtimeScope)).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      runtimeScope,
      runtimeScopeStatus: 'complete',
      runtimeScopeMissing: [],
      scopeKey: 'paper:alpaca:acct-1:stocks:TSLA:15m',
      scopeKeyVersion: 2
    }));
  });

  test('records unset runtime scope without inventing an unknown symbol', () => {
    expect(createSnapshot(null)).toEqual(expect.objectContaining({
      symbol: null,
      runtimeScope: null,
      runtimeScopeStatus: 'unset',
      runtimeScopeMissing: ['runtimeScope'],
      scopeKey: null,
      scopeKeyVersion: null
    }));
  });

  test('keeps incomplete runtime scope metadata instead of dropping the scope', () => {
    const runtimeScope = {
      symbol: 'TSLA',
      broker: 'alpaca',
      brokerId: 'alpaca',
      accountId: 'default',
      accountIdSource: 'default',
      assetClass: 'stocks',
      executionMode: 'paper',
      timeframe: '15m',
      scopeKey: 'paper:alpaca:default:stocks:TSLA:15m',
      scopeKeyVersion: 2,
      scopeComplete: false,
      runtimeScopeStatus: 'incomplete',
      missingFields: ['accountId']
    };

    expect(createSnapshot(runtimeScope)).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      runtimeScope,
      runtimeScopeStatus: 'incomplete',
      runtimeScopeMissing: ['accountId'],
      scopeKey: 'paper:alpaca:default:stocks:TSLA:15m',
      scopeKeyVersion: 2
    }));
  });
});
