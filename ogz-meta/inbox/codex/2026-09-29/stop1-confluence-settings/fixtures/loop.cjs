'use strict';
const assert = require('assert/strict');
// Exercise the actual staged loop and exit manager. Only data, stored positions,
// and the execution boundary are synthetic; no broker or running bot is used.
module.exports = async function ({root, compile, orch, plan, entry = null}) {
  let trades = [];
  const autopsies=[];
  const state = {
    getTradesBySymbol: () => trades,
    get: key => key === 'initialBalance' ? 10000 : key === 'position' ? trades.length : null,
    getEquity: () => 10000, getLastPrice: () => null,
    isHalted: () => false, isSymbolHalted: () => false,
    getHaltReason: () => null, getSymbolHaltReason: () => null,
  };
  const Loop = compile('core/TradingLoop.js', {
    './StateManager': {getInstance: () => state},
    './DecisionAutopsyLogger': {writeAutopsy: record => {autopsies.push(record);return {success:true,persisted:true};}},
  });
  const calls = [];
  const ctx = {
    candleTimeframe: '15m',
    priceHistory: Array.from({length:20}, (_,i) => ({time:1700000000000+i*900000,open:100,high:101,low:89,close:90,volume:1000,symbol:'TSLA',timeframe:'15m'})),
    marketData: {symbol:'TSLA',price:90,timestamp:1700018000000,volume:1000},
    config: {minTradeConfidence:0,brokerId:'alpaca',accountId:'fixture',accountIdSource:'fixture',assetClass:'stocks',timeframe:'15m',executionMode:'paper',enableBacktestMode:false,evalTraceEnabled:false,traceEventMaxBufferedBytes:1048576},
    strategyOrchestrator: orch,
    executeTrade: async (...args) => {calls.push(args);return {success:true,orderId:'fixture'};},
    broadcastPatternAnalysis: () => {},
    dashboardWs: {readyState:1,bufferedAmount:0,send:()=>{}},
  };
  const loop = new Loop(ctx);
  loop._gatherData = () => ({indicators:{rsi:55,macd:{},trend:'sideways',atr:1,ema20:100,ema50:100},patterns:[],regime:{currentRegime:'ranging',confidence:.5,positionMultiplier:1},tpoResult:{signal:{action:'BUY',highProbability:true,strength:1}},fibLevels:null,nearestFibLevel:null,nearestStructure:null});
  loop._runTRAI = () => {};
  if (entry) {
    const config = require(root+'/foundation/ConfigLoader');
    assert.equal(typeof config.get('confidence.minTradeConfidence'),'number');
    ctx.marketData.price = 100;
    ctx.strategyOrchestrator = {strategies:[],evaluate:()=>entry};
    await loop._analyze('TSLA','fixture-entry');
    const expected = entry.entryFanout.length ? entry.entryFanout : [entry];
    assert.equal(calls.length,expected.length,JSON.stringify(autopsies.map(x=>x.decision)));
    calls.forEach((args,index)=>{
      assert.equal(args[0].action,'BUY');
      assert.equal(args[0].ledgerData.confluence.sizingMultiplier,expected[index].sizingMultiplier);
      assert.equal(plan(args[6]).sizingMultiplier,expected[index].sizingMultiplier);
    });
    return;
  }
  await loop._analyze('TSLA','fixture-hold');
  assert.equal(calls.length,0,'raw TPO must not promote unavailable sizing to entry');
  // A real frozen policy produced by the same index entry-plan path is retained
  // by an already-open position while the external entry config is unavailable.
  const exitContract = require(root+'/core/ExitContractManager').getInstance().createExitContract('EMASMACrossover',{confidence:.9},{volatility:1,timeframe:'15m'});
  const prior = plan({winnerStrategy:'EMASMACrossover',sizingMultiplier:1,exitContract});
  trades = [{...prior,id:'fixture-position',symbol:'TSLA',entryPrice:100,entryTime:1700000000000,entryOrderQuantity:1,remainingOrderQuantity:1,maxProfitPercent:0}];
  await loop._analyze('TSLA','fixture-exit');
  assert.equal(calls.length,1,'existing position must reach execution');
  assert.equal(calls[0][0].action,'SELL');
  assert.match(calls[0][0].exitReason,/stop/i);
};
