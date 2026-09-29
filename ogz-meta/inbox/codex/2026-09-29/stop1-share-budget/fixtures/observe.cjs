'use strict';
// Synthetic inputs; actual Git source entry-plan and quantity methods. No broker.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const phase = process.argv[2];
assert.ok(['baseline', 'candidate'].includes(phase));
const ref = phase === 'baseline' ? 'aa91945575b22b076273d2c829a35c7a6b5cc9ef:' : ':';
const source = cp.execFileSync('git', ['show', ref + 'core/OrderExecutor.js'], {cwd: root, encoding: 'utf8'});
const settings = {
  'entryLogic.sizing.absoluteCapPercent': 0.015,
  'entryLogic.sizing.stockShareRange.enabled': true,
  'entryLogic.sizing.stockShareRange.minShares': 2,
  'entryLogic.sizing.stockShareRange.maxShares': 100,
  'entryLogic.sizing.stockShareRange.maxNotionalUsd': 100000,
  'entryLogic.sizing.stockShareRange.consistencyCapBuffer': 1,
  'entryLogic.sizing.stockShareRange.dailyLossRiskFraction': 1,
  'evalRules.ttp.consistency.profitTargetDollars': 0,
  'evalRules.ttp.consistency.maxPositionProfitRatio': 0,
  'evalRules.ttp.accountLimits.dailyLossDollars': 0,
};
const target = path.join(root, 'core/OrderExecutor.js');
const mod = new Module(target, module);
mod.filename = target;
// Only collaborator boundaries are stubbed; every sizing method is actual source.
mod.require = name => ({
  './StateManager': {getInstance: () => ({})},
  '../foundation/ConfigLoader': {get: key => settings[key]},
  '../brokers/BrokerRegistry': {getBrokerInfo: () => ({features: ['fractional']})},
  './dto/ExitContractOwnership': {assertExplicitExitOwnership: () => {}},
  './PolicyBuilder': {buildForTrade: input => Object.freeze(input)},
  './PositionEffect': {positionEffectFromAction: action => ['BUY', 'SELL_SHORT'].includes(action) ? 'open' : 'close'},
}[name] || {});
mod._compile(source, target);
const executor = Object.create(mod.exports.prototype);
executor.ctx = {};
let scope = {brokerId: 'alpaca', accountId: 'synthetic', assetClass: 'stocks', executionMode: 'paper', timeframe: '1m'};
executor._runtimeScope = () => scope;
const results = [];
function plan(label, overrides = {}) {
  const result = executor._buildEntryPlan({
    decision: {action: 'BUY', confidence: 90}, symbol: 'TSLA', price: 100,
    positionSize: 100, currentBalance: 10000, currentEquity: 10000,
    tradeConfidence: .9, confidenceMultiplier: 1, entryVolatility: 1,
    orchResult: {winnerStrategy: 'Synthetic', sizingMultiplier: 1, exitContract: {stopLossPercent: -1}},
    ...overrides,
  });
  results.push({label, result});
  return result;
}
for (const action of ['BUY', 'SELL_SHORT']) {
  const impossible = plan(action + '-minimum-exceeds-cap', {decision: {action, confidence: 90}});
  assert.equal(impossible.orderQuantity, phase === 'baseline' ? 2 : 0);
  if (phase === 'candidate') assert.match(impossible.stockShareRangeBlockReason, /^stock_share_range_impossible/);
  const exact = plan(action + '-minimum-equals-cap', {decision: {action}, absoluteCapPercent: .02});
  assert.equal(exact.orderQuantity, 2);
  assert.equal(exact.sizeUsd, 200);
  const within = plan(action + '-minimum-within-cap', {decision: {action}, absoluteCapPercent: .025});
  assert.equal(within.orderQuantity, 2);
  const capped = plan(action + '-large-request', {decision: {action}, positionSize: 1000, absoluteCapPercent: .025});
  assert.equal(capped.orderQuantity, 2);
}
settings['entryLogic.sizing.stockShareRange.maxShares'] = 1;
assert.equal(plan('existing-max-shares-conflict', {absoluteCapPercent: .5}).orderQuantity, 0);
settings['entryLogic.sizing.stockShareRange.maxShares'] = 100;
settings['entryLogic.sizing.stockShareRange.maxNotionalUsd'] = 150;
assert.equal(plan('existing-notional-conflict', {absoluteCapPercent: .5}).orderQuantity, 0);
settings['entryLogic.sizing.stockShareRange.maxNotionalUsd'] = 100000;
settings['evalRules.ttp.consistency.profitTargetDollars'] = 100;
settings['evalRules.ttp.consistency.maxPositionProfitRatio'] = .01;
assert.equal(plan('existing-consistency-conflict', {absoluteCapPercent: .5,
  orchResult: {winnerStrategy: 'Synthetic', sizingMultiplier: 1, exitContract: {stopLossPercent: -1, takeProfitPercent: 1}}}).orderQuantity, 0);
settings['evalRules.ttp.consistency.profitTargetDollars'] = 0;
settings['evalRules.ttp.consistency.maxPositionProfitRatio'] = 0;
settings['evalRules.ttp.accountLimits.dailyLossDollars'] = 1;
assert.equal(plan('existing-daily-loss-conflict', {absoluteCapPercent: .5}).orderQuantity, 0);
settings['evalRules.ttp.accountLimits.dailyLossDollars'] = 0;
const precision = plan('division-rounds-up', {price: 5.06, positionSize: 100, currentBalance: 45.53999999999999, absoluteCapPercent: 1});
assert.equal(precision.orderQuantity, phase === 'baseline' ? 9 : 8);
if (phase === 'candidate') assert.ok(precision.sizeUsd <= precision.absoluteCapSizeUsd);
settings['entryLogic.sizing.stockShareRange.enabled'] = false;
assert.equal(plan('fractional-range-disabled', {positionSize: 125}).orderQuantity, 1.25);
assert.equal(plan('whole-range-disabled', {positionSize: 125, forceWholeShares: true}).orderQuantity, 1);
scope = {...scope, assetClass: 'crypto', brokerId: 'kraken'};
settings['entryLogic.sizing.stockShareRange.enabled'] = true;
assert.equal(plan('crypto-range-inapplicable', {positionSize: 125}).orderQuantity, 1.25);
assert.equal(executor._buildEntryPlan({decision: {action: 'SELL'}}), null);
assert.equal(executor._buildEntryPlan({decision: {action: 'COVER'}}), null);
const receipt = {phase, sourceRef: ref, sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  boundary: 'Actual entry-plan and quantity methods; synthetic settings/scope/price; policy and ownership collaborators stubbed; no submission, fill, or deployment proof', results};
fs.writeFileSync(path.join(packet, 'private', phase + '.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({phase, scenarios: results.length, passed: true}));
