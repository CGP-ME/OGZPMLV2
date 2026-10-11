'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../../../../..');
const source = require('child_process').execFileSync('git', ['show', require('./source-receipt.json').candidate + ':core/OrderExecutor.js'], {cwd: root, encoding: 'utf8'});
const { PIDController } = require(path.join(root, 'core/PIDController'));
const sizingStart = source.indexOf('    const dynamicSizingEnabled = ConfigLoader.get(\'features.enableDynamicSizing\') === true;');
const sizingEnd = source.indexOf('\n    // CHECKPOINT 2: Position sizing', sizingStart);
assert.ok(sizingStart >= 0 && sizingEnd > sizingStart, 'actual executeTrade sizing segment not found');
const sizingSegment = source.slice(sizingStart, sizingEnd);
const controller = new PIDController({ enabled: true, warmupTrades: 0, updateInterval: 1, windowSize: 20 });
for (let i = 0; i < 5; i += 1) controller.onTradeClose({ strategyName: 'RSI', netPnlDollars: -10, exitReason: 'fixture' });
const learnedPidMultiplier = controller.getPositionMultiplier();
assert.notStrictEqual(learnedPidMultiplier, 1, 'close-event producer must change PID output');
const runSizing = (segment, base, cap) => Function('ConfigLoader', 'getPIDController', `return function(isEntryAction, tradeConfidence) { let basePositionPercent = 0; const currentEquity = 10000; const currentBalance = 10000; ${segment}; return { basePositionPercent, baseSizeUSD, positionSize }; }`)({ get: key => ({ 'features.enableDynamicSizing': false, 'positionSizing.basePositionSize': base, 'positionSizing.maxPositionSize': cap }[key]) }, () => controller).call({ _resolveAbsolutePositionCap: () => cap }, true, 0.8);
const baselineSegment = sizingSegment.replace(/\n    const pidPositionMultiplier[\s\S]*?basePositionPercent \*= pidPositionMultiplier;\n/, '\n');
const uncappedBefore = runSizing(baselineSegment, 0.01, 0.05);
const uncappedAfter = runSizing(sizingSegment, 0.01, 0.05);
const cappedBefore = runSizing(baselineSegment, 0.04, 0.02);
const cappedAfter = runSizing(sizingSegment, 0.04, 0.02);
const approximately = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: got ${actual}, expected ${expected}`);
approximately(uncappedBefore.baseSizeUSD, 100, 'baseline uncapped size');
approximately(uncappedAfter.baseSizeUSD, 90, 'learned PID uncapped size');
approximately(cappedBefore.baseSizeUSD, 200, 'baseline capped size');
approximately(cappedAfter.baseSizeUSD, 200, 'learned PID capped size');
const start = source.indexOf('  _buildEntryPlan({');
const end = source.indexOf('\n  _', start + 3);
assert.ok(start >= 0 && end > start, 'actual _buildEntryPlan method not found');
let method = source.slice(start, end);
method = method.replace('  _buildEntryPlan(', 'function candidateBuildEntryPlan(');
const candidate = Function('ConfigLoader', 'PolicyBuilder', 'stateManager', 'assertExplicitExitOwnership', 'positionEffectFromAction', `return (${method});`)(
  { get: key => ({ 'positionSizing.maxPositionSize': 0.02, 'positionSizing.maxTotalExposure': 1, 'positionSizing.basePositionSize': 0.02, 'fees.slippage': 0 }[key]), getReceipt: () => ({}) },
  { buildForTrade: () => ({}) },
  { getTradesBySymbol: () => [] },
  () => {}, action => action === 'BUY' ? 'open_long' : 'open_short'
);
const ctx = { ctx: { backtestMode: false, paperTrading: false }, pendingEntries: new Map(), _isEntryAction: () => true, _entrySide: () => 'buy', _runtimeScope: () => ({ brokerId: 'test', accountId: 'test', accountIdSource: 'test', assetClass: 'crypto', executionMode: 'paper', timeframe: '1m' }), _resolveAbsolutePositionCap: () => 0.02, _orderQuantityUnit: () => 'base', _orderQuantityFromSizeUsd: value => value };
const plan = candidate.call(ctx, { decision: { action: 'BUY' }, symbol: 'BTC-USD', timeframe: '1m', price: 1, positionSize: uncappedAfter.positionSize, currentBalance: 10000, currentEquity: 10000, tradeConfidence: 0.8, confidenceMultiplier: 1, orchResult: { winnerStrategy: 'RSI', sizingMultiplier: 1, exitContract: {} }, entryVolatility: 0 });
approximately(plan.requestedSizeUsd, 90, 'actual entry-plan method must receive the learned, uncapped sizing output');
approximately(plan.sizeUsd, 90, 'actual entry-plan size');
console.log(JSON.stringify({ method: ['executeTrade sizing segment', '_buildEntryPlan'], learnedPidMultiplier, uncapped: { before: uncappedBefore.baseSizeUSD, after: uncappedAfter.baseSizeUSD }, capped: { before: cappedBefore.baseSizeUSD, after: cappedAfter.baseSizeUSD }, entryPlan: { requestedSizeUsd: plan.requestedSizeUsd, sizeUsd: plan.sizeUsd }, result: 'actual sizing segment changes uncapped future size and preserves existing caps' }));
