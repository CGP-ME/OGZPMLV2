'use strict';

// Read-only behavior proof for the take-profit planner ownership change.
// Run from the repository root:
//   node ogz-meta/inbox/codex/2026-10-12/exit-take-profit/behavior-proof.cjs
// Or evaluate every repository dependency from an exact candidate Git tree:
//   node ogz-meta/inbox/codex/2026-10-12/exit-take-profit/behavior-proof.cjs --candidate-ref=<treeish>

const assert = require('assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');

process.env.BACKTEST_MODE = 'true';
process.env.EXECUTION_MODE = 'backtest';
process.env.INITIAL_BALANCE = '10000';
process.env.LIVE_TRADING = 'false';
process.env.CONFIRM_LIVE_TRADING = 'false';
process.env.EVAL_RULES_ENABLED = 'false';
process.env.TTP_RULES_ENABLED = 'false';
process.env.CANDLE_SOURCE = 'file';
process.env.BROKER = 'alpaca';
process.env.ALPACA_MODE = 'paper';
process.env.MAX_WEEKLY_LOSS = '5';
process.env.MAX_MONTHLY_LOSS = '5';
process.env.FRESH_START = 'false';

const root = path.resolve(__dirname, '../../../../..');
const candidateRef = process.argv.find((value) => value.startsWith('--candidate-ref='))?.slice('--candidate-ref='.length);
const nativeLoad = Module._load;
const nativeReadFileSync = fs.readFileSync;
const candidateSourceCache = new Map();

function candidateSource(relativePath) {
  if (candidateSourceCache.has(relativePath)) return candidateSourceCache.get(relativePath);
  const source = childProcess.execFileSync('git', ['show', `${candidateRef}:${relativePath}`], {
    cwd: root,
    encoding: 'utf8',
  });
  candidateSourceCache.set(relativePath, source);
  return source;
}

function installCandidateTreeLoader() {
  if (!candidateRef) return;
  const candidateConfigFiles = new Set(['config/settings.json', 'config/internals.json']);
  fs.readFileSync = function candidateTreeRead(file, ...args) {
    const relative = typeof file === 'string' ? path.relative(root, path.resolve(file)) : '';
    if (candidateConfigFiles.has(relative)) {
      const value = Buffer.from(candidateSource(relative));
      return typeof args[0] === 'string' || args[0]?.encoding ? value.toString() : value;
    }
    return nativeReadFileSync.call(this, file, ...args);
  };
  Module._load = function candidateTreeLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    const relative = typeof resolved === 'string' ? path.relative(root, resolved) : '';
    if (!relative || relative.startsWith('..') || relative.startsWith('node_modules/') || path.isAbsolute(relative)) {
      return nativeLoad.apply(this, arguments);
    }
    if (!relative.endsWith('.js') && !relative.endsWith('.cjs') && !relative.endsWith('.json')) {
      return nativeLoad.apply(this, arguments);
    }
    if (require.cache[resolved]) return require.cache[resolved].exports;
    const candidate = new Module(resolved, parent);
    candidate.filename = resolved;
    candidate.paths = Module._nodeModulePaths(path.dirname(resolved));
    require.cache[resolved] = candidate;
    try {
      if (relative.endsWith('.json')) {
        candidate.exports = JSON.parse(candidateSource(relative));
      } else {
        candidate._compile(candidateSource(relative), resolved);
      }
      return candidate.exports;
    } catch (error) {
      delete require.cache[resolved];
      throw error;
    }
  };
}

installCandidateTreeLoader();
const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader'));
ConfigLoader.load({ silent: true });
const PolicyBuilder = require(path.join(root, 'core/PolicyBuilder'));
const ProfitExitPlanner = require(path.join(root, 'core/ProfitExitPlanner'));
const { ExitContractManager } = require(path.join(root, 'core/ExitContractManager'));
const { StateManager } = require(path.join(root, 'core/StateManager'));

const nowMs = Date.parse('2026-10-12T12:00:00.000Z');

function cloned(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildPolicy(strategyName, entryDirection = 'long') {
  return PolicyBuilder.buildForTrade({
    strategyName,
    exitContract: cloned(ConfigLoader.get(`exitContracts.${strategyName}`)),
    nowMs,
    volatility: 1,
    confidence: 0.8,
    marketCondition: 'normal',
    entryDirection,
    configReader: ConfigLoader,
  });
}

function snapshot(policy, overrides = {}) {
  const tiers = policy.profitManagement.tieredExit?.tiers || [];
  return {
    tradeId: 'TP_PROOF_1',
    intentId: 'tp-proof-intent',
    tradeRevision: 0,
    executionMode: 'backtest',
    brokerId: 'alpaca',
    accountId: 'acct-proof',
    assetClass: 'stocks',
    symbol: 'TSLA',
    timeframe: '15m',
    sessionId: 'tp-proof-session',
    scopeKey: 'backtest:alpaca:acct-proof:stocks:TSLA:15m',
    direction: 'long',
    entryPrice: 100,
    entryTimeMs: nowMs - 60_000,
    entryOrderQuantity: 5,
    remainingOrderQuantity: 5,
    quantityUnit: 'shares',
    currentPrice: 100,
    frozenExitPolicy: policy,
    pendingExitIntent: null,
    beScaleOutState: { status: 'idle', targetQuantity: null, filledQuantity: 0, brokerOrderIds: [], intentId: null },
    tierStates: tiers.map((tier, tierIndex) => ({ tierIndex, name: tier.name, status: 'idle', filledQuantity: 0 })),
    priceSource: 'fixture',
    eventTimeMs: nowMs,
    receivedAtMs: nowMs,
    nowMs,
    ...overrides,
  };
}

function assertTakeProfit(intent, message) {
  assert.equal(intent.action, 'exit_full', `${message}: full exit action`);
  assert.equal(intent.reason, 'take_profit', `${message}: take-profit reason`);
  assert.equal(intent.exitFraction, 1, `${message}: full remaining quantity`);
  assert.equal(intent.stateKey, null, `${message}: no tier/scale-out ownership`);
  assert.equal(intent.expectedRemainingQuantity, 0, `${message}: no remaining quantity`);
}

function plannerAssertions() {
  const targetPolicy = buildPolicy('EMATrendRetest');
  assert.equal(targetPolicy.contract.takeProfitPercent, 3, 'actual EMA retest contract keeps its 3R percentage target');

  const below = ProfitExitPlanner.plan(snapshot(targetPolicy, { currentPrice: 102.99 }));
  assert.notEqual(below.reason, 'take_profit', 'below long target must not take profit');

  const at = ProfitExitPlanner.plan(snapshot(targetPolicy, { currentPrice: 103 }));
  assertTakeProfit(at, 'at long target');

  const above = ProfitExitPlanner.plan(snapshot(targetPolicy, { currentPrice: 104 }));
  assertTakeProfit(above, 'above long target');

  const shortBelow = ProfitExitPlanner.plan(snapshot(targetPolicy, {
    direction: 'short',
    currentPrice: 97.01,
  }));
  assert.notEqual(shortBelow.reason, 'take_profit', 'below short target must not take profit');

  const shortAt = ProfitExitPlanner.plan(snapshot(targetPolicy, {
    direction: 'short',
    currentPrice: 97,
  }));
  assertTakeProfit(shortAt, 'at short target');

  const shortAbove = ProfitExitPlanner.plan(snapshot(targetPolicy, {
    direction: 'short',
    currentPrice: 96,
  }));
  assertTakeProfit(shortAbove, 'above short target');

  const staleOffPolicy = {
    ...targetPolicy,
    contract: { ...targetPolicy.contract, tpMode: 'off', takeProfitPercent: 1 },
  };
  const staleOff = ProfitExitPlanner.plan(snapshot(staleOffPolicy, { currentPrice: 110 }));
  assert.notEqual(staleOff.reason, 'take_profit', 'tpMode off must suppress stale numeric target');

  const nullTargetPolicy = buildPolicy('TimeSeriesMomentum');
  assert.equal(nullTargetPolicy.contract.takeProfitPercent, null, 'actual TSM no-target policy normalizes target to null');
  const nullTarget = ProfitExitPlanner.plan(snapshot(nullTargetPolicy, { currentPrice: 100.1 }));
  assert.notEqual(nullTarget.reason, 'take_profit', 'null target must not coerce to a zero-percent target');

  const atrMultiplePolicy = {
    ...targetPolicy,
    contract: { ...targetPolicy.contract, tpMode: 'atrMultiple', tpAtrMultiple: 3, takeProfitPercent: null },
  };
  const atrMultiple = ProfitExitPlanner.plan(snapshot(atrMultiplePolicy, { currentPrice: 100.1 }));
  assert.notEqual(atrMultiple.reason, 'take_profit', 'atrMultiple with no computed target must not coerce null to zero');

  return targetPolicy;
}

function ecmAssertion(targetPolicy) {
  const manager = new ExitContractManager();
  const result = manager.checkExitConditions({
    id: 'TP_ECM_1',
    orderId: 'TP_ECM_1',
    direction: 'long',
    action: 'BUY',
    entryStrategy: 'EMATrendRetest',
    entryPrice: 100,
    entryTime: nowMs - 60_000,
    entryOrderQuantity: 5,
    entryOrderQuantityUnit: 'shares',
    remainingOrderQuantity: 5,
    remainingOrderQuantityUnit: 'shares',
    tradeRevision: 0,
    exitContract: targetPolicy.contract,
    frozenExitPolicy: targetPolicy,
    pendingExitIntent: null,
    beScaleOutState: { status: 'idle', targetQuantity: null, filledQuantity: 0, brokerOrderIds: [], intentId: null },
    tierStates: targetPolicy.profitManagement.tieredExit.tiers.map((tier, tierIndex) => ({
      tierIndex,
      name: tier.name,
      status: 'idle',
      filledQuantity: 0,
    })),
  }, 103, {
    currentTime: nowMs,
    intentId: 'tp-ecm-intent',
    priceSource: 'fixture',
    indicators: {},
  });
  assert.equal(result.shouldExit, true, 'ECM must surface planner take-profit intent');
  assert.equal(result.exitReason, 'take_profit', 'ECM must not substitute a global partial at the strategy target');
  assertTakeProfit(result.exitIntent, 'ECM planner intent');
}

function fillPayload(overrides) {
  return {
    brokerOrderId: 'tp-proof-broker',
    tradeId: 'TP_FILL_1',
    sourceEventId: 'tp-proof-source',
    exitReason: 'take_profit',
    triggeredBy: 'exit-take-profit-behavior-proof',
    filledQuantityUnit: 'shares',
    submittedAtMs: nowMs,
    confirmedAtMs: nowMs + 1_000,
    eventTimeMs: nowMs + 1_000,
    executionMode: 'backtest',
    simulated: true,
    ...overrides,
  };
}

async function stateManagerAssertion(targetPolicy) {
  // StateManager's constructor normally loads the configured persistent state.
  // Suppress only that constructor read for this disposable in-memory proof;
  // every transition below still uses the real StateManager implementation.
  const load = StateManager.prototype.load;
  StateManager.prototype.load = function fixtureNoPersistentStateLoad() {};
  let manager;
  try {
    manager = new StateManager();
  } finally {
    StateManager.prototype.load = load;
  }
  manager.save = () => ({ success: true, skipped: true, reason: 'fixture_no_persistence' });
  manager.notifyListeners = () => {};
  manager.dashboardWs = null;

  const opened = await manager.openPosition(500, 100, {
    orderId: 'TP_FILL_1',
    action: 'BUY',
    direction: 'long',
    entryStrategy: 'EMATrendRetest',
    symbol: 'TSLA',
    brokerId: 'alpaca',
    accountId: 'acct-proof',
    accountIdSource: 'fixture',
    assetClass: 'stocks',
    executionMode: 'backtest',
    timeframe: '15m',
    scopeKey: 'backtest:alpaca:acct-proof:stocks:TSLA:15m',
    exitContract: targetPolicy.contract,
    frozenExitPolicy: targetPolicy,
    entryOrderQuantity: 5,
    entryOrderQuantityUnit: 'shares',
    remainingOrderQuantity: 5,
    remainingOrderQuantityUnit: 'shares',
  });
  assert.equal(opened.success, true, 'open fixture trade');

  const partialReserve = await manager.reserveExitSlot('TP_FILL_1', 'prior-partial', {
    submittedAtMs: nowMs,
    sourceEventId: 'prior-partial-source',
    exitFraction: 0.4,
    expectedRemainingQuantity: 3,
  });
  assert.equal(partialReserve.reserved, true, 'reserve earlier partial exit');
  const partial = await manager.applyFill(fillPayload({
    fillId: 'prior-partial-fill',
    brokerOrderId: 'prior-partial-broker',
    intentId: 'prior-partial',
    sourceEventId: 'prior-partial-source',
    lifecycleState: 'full_fill',
    filledQuantity: 2,
    filledSizeUsd: 206,
    fillPrice: 103,
    fee: 0,
    expectedQuantity: 2,
    remainingQuantity: 3,
    expectedTradeRevision: 0,
  }));
  assert.equal(partial.applied, true, 'apply earlier partial fill');
  const remainingTrade = manager.get('activeTrades').get('TP_FILL_1');
  assert.equal(remainingTrade.remainingOrderQuantity, 3, 'earlier partial leaves only the remainder');
  assert.equal(remainingTrade.pendingExitIntent, null, 'completed earlier partial releases its slot');

  const targetIntent = ProfitExitPlanner.plan(snapshot(targetPolicy, {
    tradeId: 'TP_FILL_1',
    intentId: 'target-full',
    tradeRevision: remainingTrade.tradeRevision,
    remainingOrderQuantity: remainingTrade.remainingOrderQuantity,
    currentPrice: 103,
  }));
  assertTakeProfit(targetIntent, 'remaining quantity target');
  const targetReserve = await manager.reserveExitSlot('TP_FILL_1', 'target-full', {
    submittedAtMs: nowMs + 2_000,
    sourceEventId: 'target-full-source',
    exitFraction: targetIntent.exitFraction,
    expectedRemainingQuantity: targetIntent.expectedRemainingQuantity,
    stateKey: targetIntent.stateKey,
    targetQuantity: remainingTrade.remainingOrderQuantity,
  });
  assert.equal(targetReserve.reserved, true, 'reserve planner full target');
  const pendingBlock = await manager.reserveExitSlot('TP_FILL_1', 'duplicate-target', {
    submittedAtMs: nowMs + 2_001,
    sourceEventId: 'duplicate-target-source',
    exitFraction: 1,
    expectedRemainingQuantity: 0,
  });
  assert.equal(pendingBlock.reason, 'exit_already_pending', 'second target cannot bypass pending exit intent');

  const full = await manager.applyFill(fillPayload({
    fillId: 'target-full-fill',
    brokerOrderId: 'target-full-broker',
    intentId: 'target-full',
    sourceEventId: 'target-full-source',
    lifecycleState: 'full_fill',
    filledQuantity: 3,
    filledSizeUsd: 309,
    fillPrice: 103,
    fee: 0,
    expectedQuantity: 3,
    remainingQuantity: 0,
    submittedAtMs: nowMs + 2_000,
    confirmedAtMs: nowMs + 3_000,
    eventTimeMs: nowMs + 3_000,
    expectedTradeRevision: remainingTrade.tradeRevision,
  }));
  assert.equal(full.applied, true, 'apply full take-profit fill');
  assert.equal(manager.get('activeTrades').has('TP_FILL_1'), false, 'full target closes only the post-partial remainder');
}

(async () => {
  const targetPolicy = plannerAssertions();
  ecmAssertion(targetPolicy);
  await stateManagerAssertion(targetPolicy);
  console.log(JSON.stringify({
    pass: true,
    candidateRef: candidateRef || 'worktree',
    cases: [
      'long_below_at_above_target',
      'short_below_at_above_target',
      'target_precedes_global_scaleout_and_tier',
      'tp_mode_off_stale_numeric',
      'null_target_no_zero_percent_coercion',
      'atr_multiple_null_target_no_zero_percent_coercion',
      'ecm_surfaces_planner_intent',
      'partial_then_target_full_fill_and_pending_block',
    ],
  }));
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = nativeLoad;
  fs.readFileSync = nativeReadFileSync;
});
