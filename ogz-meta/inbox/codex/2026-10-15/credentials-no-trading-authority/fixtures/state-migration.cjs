'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const cp = require('child_process');
const tree = process.env.REVIEW_TREE || require('../candidate.json').candidate;
const assert = require('assert/strict');

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(__dirname, 'state-'));
const stateFile = path.join(temp, 'state.json');
const originalLoad = Module._load;
const loaderPath = path.join(root, 'foundation/ConfigLoader.js');
const narratorPath = path.join(root, 'core/TradeNarrator.js');

Module._load = function fixtureLoad(request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved === loaderPath) {
    return {
      hasLoadedSnapshot: () => true,
      load() {},
      getSource: () => 'fixture',
      get: (key) => ({
        'mode.backtest': false,
        'backtest.freshStart': false,
        'mode.liveTrading': false,
        'mode.execution': 'paper',
        'broker.alpacaApiKey': 'PKFIXTUREPAPERKEY',
        'paths.dataDir': temp,
        'paths.stateFile': stateFile,
        startingBalance: 10000,
      })[key],
    };
  }
  if (resolved === narratorPath) return { getNarrator: () => ({ enabled: false }) };
  return originalLoad.call(this, request, parent, isMain);
};

try {
  fs.writeFileSync(stateFile, JSON.stringify({
    balance: 10000,
    totalBalance: 10000,
    initialBalance: 10000,
    position: 500,
    inPosition: 500,
    activeTrades: [[
      'LIVE_ALPACA_1',
      {
        id: 'LIVE_ALPACA_1', orderId: 'LIVE_ALPACA_1', action: 'BUY', direction: 'long', status: 'open',
        symbol: 'TSLA', brokerId: 'alpaca', accountId: 'acct-live', accountIdSource: 'fixture',
        assetClass: 'stocks', executionMode: 'live', timeframe: '15m',
        scopeKey: 'live:alpaca:acct-live:stocks:TSLA:15m', sizeUsd: 500, size: 500,
        entryPrice: 100, entryOrderQuantity: 5, entryOrderQuantityUnit: 'shares',
        remainingOrderQuantity: 5, remainingOrderQuantityUnit: 'shares', entryStrategy: 'fixture',
      },
    ]],
    lastPrices: { TSLA: 100 },
    symbolEntryHalts: {
      TSLA: { code: 'broker_unverifiable', reason: 'legacy credential diagnostic hold', haltedAt: 1, expiresAt: null },
      MSFT: { code: 'exit_monitor_reconciliation_required', reason: 'independent receipt hold', haltedAt: 2, expiresAt: null },
    },
    brokerVerificationIntegrity: { status: 'untrusted', code: 'broker_unverifiable', entryBlocking: true },
  }));

  const sourcePath = path.join(root, 'core/StateManager.js');
  const compiled = new Module(sourcePath, module);
  compiled.filename = sourcePath;
  compiled.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  compiled._compile(cp.execFileSync('git', ['show', tree + ':core/StateManager.js'], {encoding: 'utf8'}), sourcePath);
  const { StateManager } = compiled.exports;
  const manager = new StateManager();

  assert.equal(manager.get('activeTrades').has('LIVE_ALPACA_1'), true, 'active evidence remains');
  assert.equal(manager.getSymbolHaltCode('TSLA'), null, 'exact legacy credential hold is retired');
  assert.equal(manager.getSymbolHaltCode('MSFT'), 'exit_monitor_reconciliation_required', 'independent hold remains');
  assert.equal(Object.hasOwn(manager.get('brokerVerificationIntegrity'), 'entryBlocking'), false, 'legacy entry flag is retired');
  assert.equal(typeof manager.getBrokerVerificationEntryBlock, 'undefined', 'no credential entry-block API remains');
  const preservation = manager.quarantineActiveTradesForSymbol('TSLA', ['fixture'], 'fixture');
  assert.equal(preservation.quarantined, 0, 'unverifiable active trade remains evidence');
  assert.equal(preservation.preservedEvidenceRecords.length, 1, 'preservation evidence remains observable');
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(saved.symbolEntryHalts.TSLA, undefined, 'retired hold remains absent after save');
  assert.equal(saved.symbolEntryHalts.MSFT.code, 'exit_monitor_reconciliation_required', 'other hold persists');
  assert.equal(Object.hasOwn(saved.brokerVerificationIntegrity, 'entryBlocking'), false, 'retired entry flag remains absent after save');
  console.log(JSON.stringify({ pass: true, activeEvidence: true, preservedEvidence: preservation.preservedEvidenceRecords.length, retainedHold: saved.symbolEntryHalts.MSFT.code }));
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
}
