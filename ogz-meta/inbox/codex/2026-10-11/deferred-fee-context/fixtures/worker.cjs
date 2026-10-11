'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const Module = require('module');
const { EventEmitter } = require('events');
const root = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const run = path.dirname(root);
assert(root.startsWith(path.resolve(__dirname, '../runs') + path.sep));
assert.equal(process.cwd(), root);
function inside(p) { if (typeof p === 'number') return; assert(path.resolve(String(p)).startsWith(run + path.sep), 'write outside isolated rehearsal: ' + p); }
for (const method of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'unlinkSync', 'rmSync']) {
  const original = fs[method]; fs[method] = function(p, ...args) { inside(p); return original.call(fs, p, ...args); };
}
for (const method of ['renameSync', 'copyFileSync']) {
  const original = fs[method]; fs[method] = function(a, b, ...args) { inside(a); inside(b); return original.call(fs, a, b, ...args); };
}
const noNetwork = () => assert.fail('external network attempted by isolated rehearsal');
for (const name of ['http', 'https']) { const mod = require(name); mod.request = noNetwork; mod.get = noNetwork; }
require('net').connect = noNetwork; require('net').createConnection = noNetwork; global.fetch = noNetwork;
class OfflineSocket extends EventEmitter { constructor() { super(); this.readyState = 3; } close() {} terminate() {} }
OfflineSocket.OPEN = 1; OfflineSocket.CLOSED = 3;
const load = Module._load;
Module._load = function(name, parent, main) { if (name === 'ws') return OfflineSocket; return load.call(this, name, parent, main); };
const C = require(root + '/foundation/ConfigLoader');
const config = C.load({ silent: true, loadDotenv: false }).config;
assert.equal(config.mode.execution, 'paper');
const { getInstance, StateManager } = require(root + '/core/StateManager');
const state = getInstance();
const OrderExecutor = require(root + '/core/OrderExecutor');
const helper = require('../../../../../../scripts/session-handoff-rehearsal/executor-context');
const proof = require('./deferred-fee-proof.cjs');
(async () => {
  const sourceIdentity = JSON.parse(fs.readFileSync(path.join(run, 'source.json')));
  if (sourceIdentity.source === '604342778287175882c328858773825ada4988e0') {
    assert.throws(() => proof.proveSelectorHasNoSizingFeeDependency({root}), /requires feeContext/);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({status:'baseline-reproduced',source:sourceIdentity.source,reason:'per-share selector throws before proposed size exists'},null,2));
    return;
  }
  await state.resumeTrading();
  const selector = proof.proveSelectorHasNoSizingFeeDependency({ root });
  const entries = [];
  for (const [symbol, assetClass, brokerId, action, entryPrice] of [
    ['BTC-USD', 'crypto', 'kraken', 'BUY', 200],
    ['TSLA', 'stocks', 'alpaca', 'SELL_SHORT', 50]
  ]) {
    const { ctx, signal } = helper.makeExecutorContext({ root, state, config: {symbol, assetClass, brokerId, entryPrice, timestamp:Date.now()} });
    const executor = new OrderExecutor(ctx);
    const result = await proof.provePaperEntryPlanFee({root, executor, state, ctx, signal, decision: action === 'BUY' ? signal.buy : signal.sellShort});
    entries.push({symbol,action,plan:result.plan,expectedEntryFee:result.expectedEntryFee,actualEntryFee:result.openedTrade.entryFee});
  }
  if (config.fees.model === 'per_share_minimum') {
    assert(entries[0].plan.orderQuantity * 0.5 < 0.75, 'long entry exercises the order minimum');
    assert(entries[1].plan.orderQuantity * 0.5 > 0.75, 'short entry exercises the per-share charge');
  }
  if (config.fees.model === 'percent') {
    for (const entry of entries) {
      assert(entry.plan.estimatedEntryFee > 0, 'percentage scenario must exercise a nonzero charge');
      assert(Math.abs(entry.plan.estimatedEntryFee - entry.plan.sizeUsd * 0.001) < 1e-9);
      assert(entry.actualEntryFee > 0);
    }
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({status:'pass',feeModel:config.fees.model,timeframes:selector.timeframes,scores:selector.percent.scores,entries},null,2));
  console.log('PASS selector discovery and actual sized paper entry fees');
})().catch(e => { console.error(e.stack); process.exitCode=1; });
