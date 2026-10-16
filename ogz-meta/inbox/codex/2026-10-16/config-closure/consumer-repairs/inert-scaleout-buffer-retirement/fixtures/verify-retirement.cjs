'use strict';

const assert = require('assert/strict');
const Module = require('module');
const path = require('path');

const ROOT = __dirname;
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../foundation/ConfigLoader') return { get() { throw new Error('unexpected default ConfigLoader read'); } };
  return originalLoad.call(this, request, parent, isMain);
};

function loadVariant(name) {
  const root = path.join(ROOT, name);
  const settings = require(path.join(root, 'settings.json'));
  const PolicyBuilder = require(path.join(root, 'core/PolicyBuilder.js'));
  const ProfitExitPlanner = require(path.join(root, 'core/ProfitExitPlanner.js'));
  return { settings, PolicyBuilder, ProfitExitPlanner };
}

function reader() {
  const values = {
    'fees.model': 'percent', makerFee: undefined,
    'fees.makerFee': 0.0025, 'fees.takerFee': 0.004, 'fees.slippage': 0.0005,
    'fees.totalRoundTrip': 0.0065, 'fees.safetyBuffer': 0.001,
    'fees.perShare': 0, 'fees.minOrderFee': 0,
  };
  return { get(key) { return values[key]; } };
}

function build(variant) {
  const configured = variant.settings.exitContracts.EMASMACrossover;
  const contract = {
    ...configured,
    tpMode: 'off',
    takeProfitPercent: null,
    profitManagement: {
      ...configured.profitManagement,
      beScaleOut: { ...configured.profitManagement.beScaleOut, enabled: true },
    },
  };
  return variant.PolicyBuilder.buildForTrade({
    strategyName: 'EMASMACrossover', exitContract: contract,
    nowMs: Date.parse('2026-10-16T00:00:00.000Z'), volatility: 0.01,
    confidence: 0.75, marketCondition: 'normal', configReader: reader(),
  });
}

function snapshot(policy) {
  return {
    tradeId: 'retirement-proof', intentId: 'intent-proof', tradeRevision: 0,
    executionMode: 'backtest', brokerId: 'fixture', accountId: 'fixture', assetClass: 'stocks',
    symbol: 'PROOF', timeframe: '15m', sessionId: 'fixture', scopeKey: 'fixture',
    direction: 'long', entryPrice: 100, entryTimeMs: 0, entryOrderQuantity: 10,
    remainingOrderQuantity: 10, quantityUnit: 'shares', currentPrice: 101.1,
    maxProfitPercent: 0.01, frozenExitPolicy: policy, pendingExitIntent: null,
    beScaleOutState: { status: 'idle', targetQuantity: null, filledQuantity: 0, brokerOrderIds: [], intentId: null },
    tierStates: [], priceSource: 'candle_close', eventTimeMs: 1, receivedAtMs: 1, nowMs: 1,
  };
}

function comparable(value) {
  const copy = JSON.parse(JSON.stringify(value));
  if (copy.evidence) delete copy.evidence.policyHash;
  return copy;
}

const baseline = loadVariant('baseline');
const candidate = loadVariant('candidate');
const baselinePolicy = build(baseline);
const candidatePolicy = build(candidate);

assert.equal(baseline.settings.revision, 14);
assert.equal(candidate.settings.revision, 15);
for (const [owner, contract] of Object.entries(baseline.settings.exitContracts)) {
  assert.equal(contract.profitManagement.beScaleOut.feeBufferPercent, 0.05, owner);
  assert.equal(candidate.settings.exitContracts[owner].profitManagement.beScaleOut.feeBufferPercent, undefined, owner);
  assert.equal(contract.profitManagement.trail.feeBufferPercent, 0.65, owner);
  assert.equal(candidate.settings.exitContracts[owner].profitManagement.trail.feeBufferPercent, 0.65, owner);
}
const expectedCandidatePolicy = JSON.parse(JSON.stringify(baselinePolicy));
delete expectedCandidatePolicy.profitManagement.beScaleOut.feeBufferPercent;
delete expectedCandidatePolicy.policyHash;
const actualCandidatePolicy = JSON.parse(JSON.stringify(candidatePolicy));
delete actualCandidatePolicy.policyHash;
assert.deepEqual(actualCandidatePolicy, expectedCandidatePolicy);

const baselineDecision = baseline.ProfitExitPlanner.plan(snapshot(baselinePolicy));
const candidateDecision = candidate.ProfitExitPlanner.plan(snapshot(candidatePolicy));
assert.equal(baselineDecision.action, 'exit_partial');
assert.equal(baselineDecision.reason, 'be_scaleout');
assert.deepEqual(comparable(candidateDecision), comparable(baselineDecision));
console.log(JSON.stringify({ result: 'PASS', owners: 17, baselineDecision: comparable(baselineDecision), candidateDecision: comparable(candidateDecision) }));
