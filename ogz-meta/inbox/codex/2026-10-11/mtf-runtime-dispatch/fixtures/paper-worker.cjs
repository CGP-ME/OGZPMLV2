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

const {StrategyOrchestrator} = require(root + '/core/StrategyOrchestrator');
const SmartMoneySweep = require(root + '/modules/SmartMoneySweep');
(async () => {
  await state.resumeTrading();
  const orchestrator = new StrategyOrchestrator({mtfBaseTimeframe:'15m'});
  const makeSms = () => new SmartMoneySweep(() => C.get('strategies.SmartMoneySweep'));
  const scoped = (symbol, timeframe) => orchestrator._getSymbolStrategyModule('SmartMoneySweep',symbol,timeframe,orchestrator.smartMoneySweepModule,makeSms);
  const longModule = scoped('TSLA','15m');
  const otherSymbol = scoped('NVDA','15m');
  const sessionCandle = {t:Date.parse('2026-10-09T14:30:00Z'),o:100,h:101,l:99,c:100,v:1000};
  longModule._updateIVB(sessionCandle,15);
  const records = [];
  const record = orchestrator.recordTradeResult.bind(orchestrator);
  orchestrator.recordTradeResult = (...args) => { records.push(args); return record(...args); };
  const completed = [];
  for (const [timeframe,action,closeAction,exitPrice] of [['15m','BUY','SELL',49.5],['1h','SELL_SHORT','COVER',50.5]]) {
    const module = scoped('TSLA',timeframe);
    if (timeframe === '1h') {
      assert.notEqual(module,longModule);
      assert.equal(module.dailyRiskState,longModule.dailyRiskState);
      assert.equal(module.dailyRiskState.dailyLosses,1);
      module._updateIVB(sessionCandle,60);
      assert.equal(module.dailyRiskState.dailyLosses,1,'first same-day frame must preserve symbol loss count');
      assert.equal(longModule.ivbBarCount,1,'other frame must retain local IVB state');
    }
    const {ctx,signal} = helper.makeExecutorContext({root,state,config:{symbol:'TSLA',assetClass:'stocks',brokerId:'alpaca',timeframe:'15m',entryPrice:50,exitPrice,timestamp:sessionCandle.t}});
    ctx.strategyOrchestrator=orchestrator;
    signal.orchResult.winnerStrategy='SmartMoneySweep';
    signal.orchResult.exitContract.strategyName='SmartMoneySweep';
    const executor=new OrderExecutor(ctx);
    const decision={...(action==='BUY'?signal.buy:signal.sellShort),ledgerData:{
      candleTimestamp:ctx.marketData.timestamp,
      strategySignals:[{name:'SmartMoneySweep',direction:action==='BUY'?'long':'short',baseConfidence:0.75,reason:'scripted state-ownership proof'}],
      orchestratorDecision:{winnerStrategy:'SmartMoneySweep',finalConfidence:0.75,reason:'scripted state-ownership proof'},
      confluence:{count:1,sizingMultiplier:1},
      positionSizing:{basePercent:0.01,confidenceMultiplier:1.5,confluenceMultiplier:1,finalPercent:0.015,finalSizeUsd:150,formula:'actual executor'},
      exitContract:signal.orchResult.exitContract,riskGates:[]
    }};
    await executor.executeTrade(decision,signal.confidenceData,50,signal.indicators,signal.patterns,null,signal.orchResult,'TSLA',timeframe);
    const active=[...state.get('activeTrades').values()];assert.equal(active.length,1);
    const trade=active[0];assert.equal(trade.timeframe,timeframe);
    const closing=closeAction==='SELL'?signal.sell(trade.id):signal.cover(trade.id);
    await executor.executeTrade(closing,signal.confidenceData,exitPrice,signal.indicators,signal.patterns,null,signal.orchResult,'TSLA',timeframe);
    assert.equal(state.get('activeTrades').size,0,'actual paper close must finish with entry frame retained');
    const last=records[records.length-1];assert.equal(last[0],'SmartMoneySweep');assert.equal(last[2],'TSLA');assert.equal(last[3],timeframe);assert(last[1]<0);
    completed.push({action,timeframe,pnl:last[1],dailyLosses:module.dailyRiskState.dailyLosses});
  }
  assert.equal(longModule.dailyRiskState.dailyLosses,2);
  assert.equal(otherSymbol.dailyRiskState.dailyLosses,0);
  const nextSession={...sessionCandle,t:Date.parse('2026-10-12T14:30:00Z')};
  scoped('TSLA','1h')._updateIVB(nextSession,60);
  assert.equal(longModule.dailyRiskState.dailyLosses,0);
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({status:'pass',completed,otherSymbolLosses:otherSymbol.dailyRiskState.dailyLosses,nextSessionLosses:longModule.dailyRiskState.dailyLosses,actualRecordCalls:records},null,2));
  console.log('PASS explicit entry timeframe survives base15m context through actual paper long/short and close feedback');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
