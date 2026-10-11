'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getPIDController, resetPIDController } = require(path.resolve(__dirname, '../../../../../../core/PIDController'));
const root = path.resolve(__dirname, '../../../../../..');
const source = require('child_process').execFileSync('git', ['show', require('./source-receipt.json').candidate + ':core/StrategyOrchestrator.js'], {cwd: root, encoding: 'utf8'});
const start = source.indexOf('    if (Object.keys(boosts).length > 0 && results.length > 0) {');
const end = source.indexOf('\n    // ─── Step 2.6:', start);
assert.ok(start >= 0 && end > start, 'actual regime-boost block not found');
let block = source.slice(start, end);
const controller = getPIDController();
controller.enabled = true;
controller.warmupTrades = 0;
controller.updateInterval = 1;
controller.windowSize = 20;
controller.reset();
for (let i = 0; i < 5; i += 1) controller.onTradeClose({ strategyName: 'RSI', netPnlDollars: -10, exitReason: 'test' });
for (let i = 0; i < 5; i += 1) controller.onTradeClose({ strategyName: 'EMASMACrossover', netPnlDollars: -10, exitReason: 'test' });
const rsiPidMultiplier = controller.getRegimeBoostAdjustment('RSI');
const unmatchedPidMultiplier = controller.getRegimeBoostAdjustment('EMASMACrossover');
assert.notStrictEqual(rsiPidMultiplier, 1, 'RSI producer learning must be non-neutral');
assert.notStrictEqual(unmatchedPidMultiplier, 1, 'unmatched strategy producer learning must be non-neutral');
const executeBlock = (boosts, results) => {
  const contributions = [];
  const recordRankingScoreChange = (result, value, _label, detail) => { contributions.push({ strategyName: result.strategyName, name: detail.name }); result.rankingScore = value; };
  Function('boosts', 'results', 'getPIDController', 'recordRankingScoreChange', 'regimeType', 'rawRegime', 'regimeConfidence', 'regimePositionMultiplier', `${block}`)(boosts, results, () => controller, recordRankingScoreChange, 'trending', 'bull', 0.8, 1);
  return contributions;
};
const matchedResults = [{ strategyName: 'RSI', rankingScore: 0.8 }, { strategyName: 'EMASMACrossover', rankingScore: 0.79 }];
const matchedContributions = executeBlock({ RSI: 1.1 }, matchedResults);
assert.deepStrictEqual(matchedContributions, [
  { strategyName: 'RSI', name: 'regime_boost' },
  { strategyName: 'RSI', name: 'pid_regime_adjustment' },
]);
assert.strictEqual(matchedResults.find(result => result.strategyName === 'EMASMACrossover').rankingScore, 0.79, 'unmatched strategy must not receive its learned PID output');
const unknownResults = [{ strategyName: 'RSI', rankingScore: 0.8 }, { strategyName: 'EMASMACrossover', rankingScore: 0.79 }];
const unknownContributions = executeBlock({}, unknownResults);
assert.deepStrictEqual(unknownContributions, [], 'unknown regime must skip the established boost loop');
assert.deepStrictEqual(unknownResults, [{ strategyName: 'RSI', rankingScore: 0.8 }, { strategyName: 'EMASMACrossover', rankingScore: 0.79 }]);
console.log(JSON.stringify({ method: 'StrategyOrchestrator.evaluate static regime-boost block', pidProducer: 'PIDController.onTradeClose', pidMultipliers: { RSI: rsiPidMultiplier, EMASMACrossover: unmatchedPidMultiplier }, matched: { contributions: matchedContributions, scores: matchedResults }, unknownRegime: { contributions: unknownContributions, scores: unknownResults }, result: 'PID regime output only follows an existing static regime match' }));
