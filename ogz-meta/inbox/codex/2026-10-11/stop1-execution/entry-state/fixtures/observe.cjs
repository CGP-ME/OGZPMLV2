'use strict';

/*
 * Actual-module isolated lifecycle observation.
 *
 * The loader replaces ConfigLoader and TradeNarrator before StateManager is
 * imported. Every state file belongs to this fixture's disposable directory;
 * the runner, production state, network adapters, WebSocketManager, and
 * SessionRouter are never imported.
 *
 * Exit 1 before the proposed patch is the expected defect proof. Exit 0 after
 * it is the expected fix proof.
 */

const assert = require('assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../../../../..');
const configLoaderPath = path.join(repoRoot, 'foundation', 'ConfigLoader.js');
const tradeNarratorPath = path.join(repoRoot, 'core', 'TradeNarrator.js');
const tempDir = fs.mkdtempSync(path.join(__dirname, 'runtime-'));
let stateFile = path.join(tempDir, 'state.json');
let executionMode = 'paper';

const fixtureConfig = {
  hasLoadedSnapshot: () => true,
  load: () => undefined,
  getSource: () => 'fixture',
  get: (key) => ({
    'mode.backtest': false,
    'backtest.freshStart': false,
    'mode.liveTrading': false,
    'mode.execution': executionMode,
    'paths.dataDir': tempDir,
    'paths.stateFile': stateFile,
    startingBalance: 10000,
  })[key],
};

const originalLoad = Module._load;
Module._load = function isolatedLoad(request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved === configLoaderPath) return fixtureConfig;
  if (resolved === tradeNarratorPath) return { getNarrator: () => ({ enabled: false }) };
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const stateManagerPath = path.join(repoRoot, 'core', 'StateManager.js');
  const baselineSource = childProcess.execFileSync('git', ['show', require('../source-receipt.json').base + ':core/StateManager.js'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const appliedSource = childProcess.execFileSync('git', ['show', require('../source-receipt.json').candidate + ':core/StateManager.js'], { cwd: repoRoot, encoding: 'utf8' });
  assert.match(baselineSource, /isTrading: false,/);
  assert.match(appliedSource, /isTrading: getConfigValue\('mode\.execution'\) === 'paper'/);
  const compileStateManager = (source) => {
    const compiled = new Module(stateManagerPath, module);
    compiled.filename = stateManagerPath;
    compiled.paths = Module._nodeModulePaths(path.dirname(stateManagerPath));
    compiled._compile(source, stateManagerPath);
    return compiled.exports.StateManager;
  };
  const BaselineStateManager = compileStateManager(baselineSource);
  const AppliedStateManager = compileStateManager(appliedSource);

  const fresh = new BaselineStateManager();
  const freshState = {
    isTrading: fresh.get('isTrading'),
    pauseReason: fresh.get('pauseReason'),
    pauseSource: fresh.get('pauseSource'),
  };

  fs.rmSync(stateFile, { force: true });
  const patchedFresh = new AppliedStateManager();
  const patchedFreshState = {
    isTrading: patchedFresh.get('isTrading'),
    pauseReason: patchedFresh.get('pauseReason'),
    pauseSource: patchedFresh.get('pauseSource'),
  };

  fs.rmSync(stateFile, { force: true });
  executionMode = 'backtest';
  const patchedBacktest = new AppliedStateManager();
  const patchedBacktestState = { isTrading: patchedBacktest.get('isTrading') };
  executionMode = 'paper';

  fs.writeFileSync(stateFile, JSON.stringify({
    balance: 10000,
    totalBalance: 10000,
    activeTrades: [],
    lastPrices: {},
    isTrading: false,
    pauseReason: 'Manual pause from dashboard',
    pauseSource: 'dashboard_manual',
    pauseRecoverable: false,
    pauseScope: null,
  }), 'utf8');
  const manualPause = new AppliedStateManager();
  const manualPauseState = {
    isTrading: manualPause.get('isTrading'),
    pauseReason: manualPause.get('pauseReason'),
    pauseSource: manualPause.get('pauseSource'),
  };

  fs.writeFileSync(stateFile, JSON.stringify({
    balance: 10000,
    totalBalance: 10000,
    activeTrades: [],
    lastPrices: {},
    isTrading: false,
    pauseReason: 'SessionRouter wind-down soft_stop: 5 min until stocks',
    pauseSource: 'session_router_wind_down',
    pauseRecoverable: true,
    pauseScope: {
      symbol: 'BTC-USD',
      timeframe: '1m',
      brokerId: 'kraken',
      accountId: 'paper',
      assetClass: 'crypto',
      executionMode: 'paper',
    },
  }), 'utf8');
  const sessionRouterPause = new AppliedStateManager();
  const sessionRouterPauseState = {
    isTrading: sessionRouterPause.get('isTrading'),
    pauseSource: sessionRouterPause.get('pauseSource'),
    pauseRecoverable: sessionRouterPause.get('pauseRecoverable'),
  };

  assert.deepEqual(manualPauseState, {
    isTrading: false,
    pauseReason: 'Manual pause from dashboard',
    pauseSource: 'dashboard_manual',
  });
  assert.deepEqual(sessionRouterPauseState, {
    isTrading: false,
    pauseSource: 'session_router_wind_down',
    pauseRecoverable: true,
  });

  const result = {
    fixture: 'StateManager only; fixture-owned state path; no runner/network/runtime state',
    freshPaperState: freshState,
    patchedFreshPaperState: patchedFreshState,
    patchedBacktestState,
    manualPauseState,
    sessionRouterPauseState,
    expectedAfterPatch: {
      freshPaperIsTrading: true,
      persistedManualPauseIsTrading: false,
      persistedSessionRouterPauseIsTrading: false,
    },
    passesProposedContract: patchedFreshState.isTrading === true
      && patchedBacktestState.isTrading === false,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passesProposedContract && freshState.isTrading === false ? 0 : 1;
} finally {
  Module._load = originalLoad;
  fs.rmSync(tempDir, { recursive: true, force: true });
}
