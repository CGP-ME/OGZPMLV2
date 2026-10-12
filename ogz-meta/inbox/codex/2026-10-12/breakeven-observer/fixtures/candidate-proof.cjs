'use strict';

// Usage: node candidate-proof.cjs --candidate-ref=<treeish>
const assert = require('assert/strict');
const childProcess = require('child_process');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const candidateRef = process.argv.find(value => value.startsWith('--candidate-ref='))?.slice('--candidate-ref='.length);
if (!candidateRef) throw new Error('Pass --candidate-ref=<treeish>');

const nativeLoad = Module._load;
const sourceCache = new Map();
function candidateSource(relative) {
  if (!sourceCache.has(relative)) {
    sourceCache.set(relative, childProcess.execFileSync('git', ['show', candidateRef + ':' + relative], {
      cwd: root,
      encoding: 'utf8',
    }));
  }
  return sourceCache.get(relative);
}

Module._load = function loadCandidate(request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  const relative = typeof resolved === 'string' ? path.relative(root, resolved) : '';
  if (!relative || relative.startsWith('..') || relative.startsWith('node_modules/') || !relative.endsWith('.js')) {
    return nativeLoad.apply(this, arguments);
  }
  if (require.cache[resolved]) return require.cache[resolved].exports;
  const candidate = new Module(resolved, parent);
  candidate.filename = resolved;
  candidate.paths = Module._nodeModulePaths(path.dirname(resolved));
  require.cache[resolved] = candidate;
  try {
    candidate._compile(candidateSource(relative), resolved);
    return candidate.exports;
  } catch (error) {
    delete require.cache[resolved];
    throw error;
  }
};

const BreakEvenManager = require(path.join(root, 'core/exit/BreakEvenManager'));
const StopLossChecker = require(path.join(root, 'core/exit/StopLossChecker'));
const TrailingStopChecker = require(path.join(root, 'core/exit/TrailingStopChecker'));
const { ExitContractManager } = require(path.join(root, 'core/ExitContractManager'));

function policy(enabled, triggerPercent, feeBufferPercent) {
  return { profitManagement: { breakEvenStop: { enabled, triggerPercent }, trail: { feeBufferPercent } } };
}
function trade(direction, enabled, triggerPercent, feeBufferPercent) {
  return {
    entryPrice: 100,
    direction,
    entryStrategy: 'fixture',
    entryTime: 0,
    currentStop: direction === 'short' ? 102 : 98,
    breakevenActive: false,
    frozenExitPolicy: policy(enabled, triggerPercent, feeBufferPercent),
    exitContract: { stopLossPercent: -2, stopType: 'percent', trailingStopPercent: 1, trailingActivation: 0.5 },
  };
}

const observer = new BreakEvenManager();
const stopChecker = new StopLossChecker();
const trailingChecker = new TrailingStopChecker();
const ecm = new ExitContractManager();

const disabled = trade('long', false, 0.5, 0.25);
disabled.maxProfitPercent = 3;
assert.equal(observer.evaluate(disabled).isBreakEven, false);
assert.equal(observer.isTriggered(disabled), false);
assert.equal(stopChecker.check(disabled, 98.5, -1.5).shouldExit, false, 'disabled policy retains fixed -2% stop after a >1R peak');

const longTrade = trade('long', true, 0.5, 0.25);
assert.equal(ecm._updateBreakevenStopState(longTrade, 100.4, 0.4).updated, false, 'configured trigger controls authorization');
assert.equal(ecm._updateBreakevenStopState(longTrade, 100.5, 0.5).updated, true);
assert.equal(longTrade.currentStop, 100.25);
assert.equal(observer.evaluate(longTrade).effectiveStopPercent, 0.25);
assert.equal(stopChecker.check(longTrade, 100.2, 0.2).exitReason, 'break_even');

const shortTrade = trade('short', true, 0.5, 0.25);
assert.equal(ecm._updateBreakevenStopState(shortTrade, 99.5, 0.5).updated, true);
assert.equal(shortTrade.currentStop, 99.75);
assert.equal(observer.evaluate(shortTrade).effectiveStopPercent, 0.25);
assert.equal(stopChecker.check(shortTrade, 99.8, 0.2).exitReason, 'break_even');

longTrade.currentStop = 101;
longTrade.trailingActive = true;
longTrade.maxProfitPercent = 2;
assert.equal(observer.evaluate(longTrade).effectiveStopPercent, 0.25, 'ratcheted price stop is not relabeled as the BE floor');
assert.equal(trailingChecker.check(longTrade, 0.5).exitReason, 'trailing_stop');

console.log(JSON.stringify({ pass: true, candidateRef }));
