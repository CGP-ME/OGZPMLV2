'use strict';

const path = require('path');
const Module = require('module');

function loadManager(sourcePath) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../foundation/ConfigLoader') return { get: () => ({}) };
    if (request === './dto/ExitContractOwnership') return { assertExplicitExitOwnership: () => {} };
    if (request === './IndicatorCalculator') return { IndicatorCalculator: { calculateATR: () => 100 } };
    if (request === './PolicyBuilder') return { normalizeContract: (_name, contract) => contract };
    if (request === './ProfitExitPlanner') return {};
    if (request === './TraceSpine') return { emitTrace: () => {} };
    if (request === './exit/StopLossChecker' || request === './exit/MaxHoldChecker') return class Checker {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(sourcePath)];
    return require(sourcePath);
  } finally {
    Module._load = originalLoad;
  }
}

function loadOracle(sourcePath) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../FeeModel') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(sourcePath)];
    return require(sourcePath);
  } finally {
    Module._load = originalLoad;
  }
}

const DynamicTrailingStop = loadOracle(path.resolve('ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/source-baseline/DynamicTrailingStop.js'));
const baseline = loadManager(path.resolve('ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/source-baseline/ExitContractManager.js'));
const candidate = loadManager(path.resolve('ogz-meta/inbox/codex/2026-10-16/config-closure/consumer-repairs/round-number/fixtures/source-candidate/ExitContractManager.js'));

const commonTrail = {
  enabled: true,
  minActivationPercent: 0.5,
  atrMultiplier: 2,
  trendWidenMultiplier: 1,
  structureTightenMultiplier: 1,
  structureDistanceThreshold: 1,
  profitRatchetThreshold: 3,
  profitRatchetRate: 0,
  profitRatchetFloor: 0.6,
  minTrailPercent: 0,
  maxTrailPercent: 100,
  feeBufferPercent: 0.65,
};

function trade(trail, direction, currentPrice, highestPrice, lowestPrice) {
  return {
    direction,
    entryPrice: 49000,
    highestPrice,
    lowestPrice,
    currentStop: null,
    exitContract: { trailType: 'atr', trailAtrMult: null },
    frozenExitPolicy: { contract: { atrPeriod: 14 }, profitManagement: { trail } },
  };
}

function run(Manager, trail, direction, price, high, low) {
  const manager = new Manager();
  return manager._updateTrailingStopState(trade(trail, direction, price, high, low), price, 1, {
    indicators: { atr: 100, trend: 'sideways' },
    priceHistory: [{ c: price }],
  });
}

function oracle(trail, price) {
  return new DynamicTrailingStop(trail).calculateTrailDistance({
    atr: 100,
    price,
    trend: 'sideways',
    rsi: 50,
    maxProfitPercent: 1,
  });
}

const trailA = { ...commonTrail, roundNumberProximity: 0.5, roundNumberTighten: 0.7 };
const trailB = { ...commonTrail, roundNumberProximity: 0.1, roundNumberTighten: 0.4 };
const near = 50000;
const away = 50300;

const baselineNearLong = run(baseline.ExitContractManager, trailA, 'long', near, near, 49000);
const baselineAwayLong = run(baseline.ExitContractManager, trailA, 'long', away, away, 49000);
const candidateNearLong = run(candidate.ExitContractManager, trailA, 'long', near, near, 49000);
const candidateAwayLong = run(candidate.ExitContractManager, trailA, 'long', away, away, 49000);
const candidateNearShort = run(candidate.ExitContractManager, trailA, 'short', near, 51000, near);
const candidateAwayShort = run(candidate.ExitContractManager, trailA, 'short', away, 51000, away);
const candidateNearStrategyB = run(candidate.ExitContractManager, trailB, 'long', near, near, 49000);
const disabled = { ...trailA, enabled: false };
const disabledResult = run(candidate.ExitContractManager, disabled, 'long', near, near, 49000);

function close(actual, expected, label) {
  if (Math.abs(actual - expected) > 1e-12) throw new Error(`${label}: ${actual} != ${expected}`);
}

close(baselineNearLong.trailDistance, 0.004, 'baseline preserves pre-fix distance');
close(baselineAwayLong.trailDistance, (100 / away) * 2, 'baseline away distance');
close(candidateNearLong.trailDistance, oracle(trailA, near) / 100, 'candidate long near matches oracle');
close(candidateAwayLong.trailDistance, oracle(trailA, away) / 100, 'candidate long away matches oracle');
close(candidateNearShort.trailDistance, oracle(trailA, near) / 100, 'candidate short near matches oracle');
close(candidateAwayShort.trailDistance, oracle(trailA, away) / 100, 'candidate short away matches oracle');
if (!(candidateNearLong.trailDistance < candidateAwayLong.trailDistance)) throw new Error('strategy A near-round tightening missing');
if (!(candidateNearStrategyB.trailDistance < candidateNearLong.trailDistance)) throw new Error('distinct frozen strategy trail policy ignored');
if (disabledResult.reason !== 'trailing_disabled' || disabledResult.updated !== false) throw new Error('disabled trailing policy changed');

console.log(JSON.stringify({
  pass: true,
  source: 'source-baseline/source-candidate pinned to HEAD 101399e1 plus one ECM round block',
  baseline: { nearLong: baselineNearLong.trailDistance, awayLong: baselineAwayLong.trailDistance },
  candidate: {
    nearLong: candidateNearLong.trailDistance,
    awayLong: candidateAwayLong.trailDistance,
    nearShort: candidateNearShort.trailDistance,
    awayShort: candidateAwayShort.trailDistance,
    strategyBNearLong: candidateNearStrategyB.trailDistance,
    disabledReason: disabledResult.reason,
  },
  oracle: { near: oracle(trailA, near), away: oracle(trailA, away) },
}));

const assert = require('node:assert/strict');
const manager = new candidate.ExitContractManager();
const percentTrade = trade(trailA, 'long', near, near, 49000);
percentTrade.exitContract = { trailType: 'percent', trailingActivation: 0.5, trailingStopPercent: 0.4 };
const percentResult = manager._updateTrailingStopState(percentTrade, near, 1, {indicators: {trend: 'sideways'}});
close(percentResult.trailDistance, 0.0028, 'percent trailing uses same round multiplier');
const channelTrade = trade(trailA, 'long', near, near, 49000);
channelTrade.exitContract.trailType = 'channel';
assert.equal(manager._updateTrailingStopState(channelTrade, near, 1).reason, 'channel_trail_owned_by_contract');
const floorTrail = Object.freeze({...trailA, roundNumberTighten: 0, minTrailPercent: 0.3});
close(run(candidate.ExitContractManager, floorTrail, 'long', near, near, 49000).trailDistance, 0.003, 'zero tightening honors existing minimum floor');
console.log(JSON.stringify({percentBranch:true,channelOwnership:true,zeroMultiplierMinimumClamp:true}));
