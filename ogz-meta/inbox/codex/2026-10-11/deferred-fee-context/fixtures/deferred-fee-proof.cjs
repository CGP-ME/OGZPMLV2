'use strict';

// Fixture-only proof hooks for the deferred-fee repair.  The caller supplies an
// isolated candidate source root plus its already-constructed paper context.
// This file never requires modules from the checkout that contains this fixture.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const PRODUCTION_ROOT = path.resolve(__dirname, '../../../../../..');
const READY_TIMEFRAMES = Object.freeze(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

function isolatedRequire(root) {
  const sourceRoot = path.resolve(root);
  assert.notEqual(sourceRoot, PRODUCTION_ROOT,
    'fixture must be given an isolated candidate source root, never the production checkout');
  assert.ok(fs.existsSync(path.join(sourceRoot, 'package.json')),
    `isolated source root has no package.json: ${sourceRoot}`);
  return createRequire(path.join(sourceRoot, 'package.json'));
}

function readyMtfAdapter() {
  return {
    getTimeframeIndicators(timeframe) {
      if (!READY_TIMEFRAMES.includes(timeframe)) return null;
      return {
        price: 100,
        atr: 2,
        trend: 'bullish',
        trendStrength: 0.8,
        rsi: 72,
        macd: { crossover: true, bullish: true },
        ema: 98,
        volatility: 0.01,
      };
    },
  };
}

function selectorResultForFeeModel(AdaptiveTimeframeSelector, feeModel) {
  return new AdaptiveTimeframeSelector({
    mtfAdapter: readyMtfAdapter(),
    allowedTimeframes: READY_TIMEFRAMES,
    defaultTimeframe: '15m',
    feeModel,
    // Deliberately omitted: feeContext.  The selector has no trade quantity or
    // notional, so this is the condition the repair must support.
  }).evaluate();
}

/**
 * Proves every ready timeframe remains selectable without invented fee context.
 * The two fee models must produce identical selector output once fee scoring is
 * removed; sizing remains the sole owner of fee calculation.
 */
function proveSelectorHasNoSizingFeeDependency({ root }) {
  const requireFromCandidate = isolatedRequire(root);
  const { AdaptiveTimeframeSelector } = requireFromCandidate('./core/AdaptiveTimeframeSelector');
  const FeeModel = requireFromCandidate('./core/FeeModel');

  const percent = selectorResultForFeeModel(
    AdaptiveTimeframeSelector,
    FeeModel.percent({ makerFee: 0.001, takerFee: 0.002 })
  );
  const perShare = selectorResultForFeeModel(
    AdaptiveTimeframeSelector,
    new FeeModel({ model: 'per_share_minimum', perShare: 0.005, minOrderFee: 0.75 })
  );

  for (const timeframe of READY_TIMEFRAMES) {
    assert.ok(Number.isFinite(percent.scores[timeframe]), `percent result missing ${timeframe}`);
    assert.ok(Number.isFinite(perShare.scores[timeframe]), `per-share result missing ${timeframe}`);
    assert.ok(percent.details[timeframe], `percent details missing ${timeframe}`);
    assert.ok(perShare.details[timeframe], `per-share details missing ${timeframe}`);
  }
  assert.deepEqual(perShare.scores, percent.scores,
    'selector score must not vary with a fee model before a trade has a real size');
  assert.deepEqual(perShare.details, percent.details,
    'selector factors must not depend on a fee model before a trade has a real size');

  return { percent, perShare, timeframes: READY_TIMEFRAMES.slice() };
}

function latestEntryTrade(state, symbol, action) {
  const activeTrades = state.get('activeTrades');
  assert.ok(activeTrades instanceof Map, 'StateManager activeTrades must remain a Map');
  const matches = [...activeTrades.values()]
    .filter(trade => trade.symbol === symbol && trade.action === action)
    .sort((left, right) => right.entryTime - left.entryTime);
  assert.ok(matches.length > 0, `no active ${action} trade for ${symbol}`);
  return matches[0];
}

/**
 * Executes the normal paper entry path supplied by the rehearsal harness and
 * compares the ORDER_PLAN estimate with the FeeModel and StateManager's actual
 * entry fee.  No broker is called; executor/state are the real isolated modules.
 *
 * Required fixture boundaries supplied by the caller:
 * - executor: actual isolated OrderExecutor instance in paper mode
 * - state: actual isolated StateManager singleton used by that executor
 * - signal: explicit normal-entry recipe with confidenceData, entryPrice,
 *   indicators, patterns, orchResult, symbol (from executor-context.cjs)
 * - decision: signal.buy or signal.sellShort (or signal.decision for callers
 *   that package the decision into the recipe)
 * - ctx: the same context held by executor; trace must be enabled for capture
 */
async function provePaperEntryPlanFee({ root, executor, state, ctx, signal, decision: suppliedDecision }) {
  assert.ok(executor && typeof executor.executeTrade === 'function', 'actual executor is required');
  assert.ok(state && typeof state.get === 'function', 'actual StateManager is required');
  assert.ok(ctx && ctx.config, 'actual executor context is required');
  assert.equal(ctx.paperTrading, true, 'proof only permits paper execution');
  const decision = suppliedDecision || signal?.decision;
  const price = signal?.price ?? signal?.entryPrice;
  assert.ok(signal && decision && signal.symbol, 'explicit normal entry signal is required');
  assert.ok(Number.isFinite(price) && price > 0, 'explicit positive entry price is required');
  assert.ok(decision.action === 'BUY' || decision.action === 'SELL_SHORT',
    'proof only accepts a normal BUY or SELL_SHORT entry');

  const requireFromCandidate = isolatedRequire(root);
  const FeeModel = requireFromCandidate('./core/FeeModel');
  const { subscribeTrace } = requireFromCandidate('./core/TraceSpine');
  const events = [];
  const unsubscribe = subscribeTrace(event => events.push(event));
  try {
    // Trace is fixture telemetry only.  It does not influence sizing, routing,
    // gates, or any external broker behavior.
    ctx.config.evalTraceEnabled = true;
    const result = await executor.executeTrade(
      { ...decision },
      signal.confidenceData,
      price,
      signal.indicators,
      signal.patterns,
      null,
      signal.orchResult,
      signal.symbol
    );
    assert.equal(result?.success, true, `paper ${decision.action} must open normally`);

    const planEvent = events.filter(event =>
      event.event === 'ORDER_PLAN'
      && event.symbol === signal.symbol
      && event.action === decision.action
    ).at(-1);
    assert.ok(planEvent, 'normal entry must emit ORDER_PLAN before execution');
    const plan = planEvent.fields;
    assert.ok(Number.isFinite(plan.sizeUsd) && plan.sizeUsd > 0, 'ORDER_PLAN must carry proposed sizeUsd');
    assert.ok(Number.isFinite(plan.orderQuantity) && plan.orderQuantity > 0,
      'ORDER_PLAN must carry proposed orderQuantity');
    assert.ok(Number.isFinite(plan.estimatedEntryFee) && plan.estimatedEntryFee >= 0,
      'ORDER_PLAN must carry an entry-only fee computed from that proposed size');

    const expectedEntryFee = FeeModel.fromTradingConfig().calculateOrderFee({
      notionalUsd: plan.sizeUsd,
      quantity: plan.orderQuantity,
      side: 'entry',
    });
    assert.equal(plan.estimatedEntryFee, expectedEntryFee,
      'ORDER_PLAN estimate must use the FeeModel with its actual proposed notional and quantity');

    const openedTrade = latestEntryTrade(state, signal.symbol, decision.action);
    assert.equal(openedTrade.entryFee, expectedEntryFee,
      'StateManager actual paper fill fee must equal the pre-execution entry estimate');

    return { result, plan, expectedEntryFee, openedTrade };
  } finally {
    unsubscribe();
  }
}

async function runDeferredFeeProof({ root, entries }) {
  const selector = proveSelectorHasNoSizingFeeDependency({ root });
  const entryProofs = [];
  for (const entry of entries) {
    entryProofs.push(await provePaperEntryPlanFee({ root, ...entry }));
  }
  return { selector, entryProofs };
}

module.exports = {
  READY_TIMEFRAMES,
  readyMtfAdapter,
  proveSelectorHasNoSizingFeeDependency,
  provePaperEntryPlanFee,
  runDeferredFeeProof,
};
