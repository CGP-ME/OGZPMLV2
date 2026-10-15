'use strict';

const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const Module = require('module');
const root = cp.execFileSync('git', ['rev-parse','--show-toplevel'], {encoding:'utf8'}).trim();
const tree = process.env.REVIEW_TREE || require('../candidate.json').candidate;
const read = file => cp.execFileSync('git', ['show', tree + ':' + file], {encoding:'utf8'});
const filename=path.join(root,'core/OrderRouter.js');
const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=Module._nodeModulePaths(path.dirname(filename));
compiled._compile(read('core/OrderRouter.js'),filename);
const OrderRouter=compiled.exports;

const router = new OrderRouter();
const adapter = new EventEmitter();
adapter.getBrokerName = () => 'alpaca';
const records = [];
router.on('brokerTruthUnavailable', (record) => records.push(record));
router.registerBroker(adapter, ['TSLA']);
adapter.emit('broker_truth_unavailable', {
  broker: 'alpaca',
  code: 'alpaca_balance_unavailable',
  reason: 'fixture failed balance read',
  operation: 'getBalance',
  event: 'ALPACA_BALANCE_TRUTH_UNAVAILABLE',
});

assert.strictEqual(records.length, 1, 'broker truth outage remains observable');
assert.strictEqual(records[0].broker, 'alpaca');
assert.strictEqual(records[0].code, 'alpaca_balance_unavailable');
assert.strictEqual(typeof router.getBrokerTruthEntryBlock, 'undefined', 'outage has no OrderRouter entry authority');
assert.strictEqual(Object.prototype.hasOwnProperty.call(router, 'brokerTruthUnavailable'), false, 'no sticky outage map remains');
const routerSource = read('core/OrderRouter.js');
const executorSource = read('core/OrderExecutor.js');
assert.match(routerSource, /emitTrace\(\{\}, 'ORDER_ROUTER_BROKER_TRUTH_UNAVAILABLE'/, 'outage trace remains');
assert.doesNotMatch(executorSource, /getBrokerTruthEntryBlock|BROKER_TRUTH_ENTRY_BLOCKED/, 'Executor has no broker-read entry block');
console.log(JSON.stringify({ pass: true, records: records.length, broker: records[0].broker, code: records[0].code }));

(async () => {
  adapter.placeBuyOrder = async () => ({success:true,orderId:'fixture-recovered'});
  const result=await router.sendOrder({symbol:'TSLA',side:'buy',amount:1});
  assert.strictEqual(result.orderId,'fixture-recovered');
  adapter.placeBuyOrder = async () => { const error=new Error('fixture auth rejection');error.brokerRequestAttempted=false;throw error; };
  await assert.rejects(router.sendOrder({symbol:'TSLA',side:'buy',amount:1}), error=>error.message==='fixture auth rejection' && error.brokerRequestAttempted===false);
  console.log('PASS outage observer preserved; recovered adapter remains callable; actual failed request still rejects');
})().catch(error=>{console.error(error);process.exitCode=1;});
