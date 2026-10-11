'use strict';
// Extract only exact _analyze method; all external dependencies are scripted.
const cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict'),fs=require('node:fs');
async function probe(ref) {
 const source=cp.execFileSync('git',['show',`${ref}:core/TradingLoop.js`],{encoding:'utf8'});
 const start=source.indexOf('  async _analyze('),end=source.indexOf('\n  /**',start);
 let checked,executed;
 const activeTrade={id:'owned-trade',symbol:'TSLA',timeframe:'5m',action:'BUY',direction:'long'};
 const ctx={config:{minTradeConfidence:.5},getSymbolTimeframeContext:()=>({timeframe:'1h',priceHistory:Array(16).fill({}),marketData:{price:100}}),strategyOrchestrator:{evaluate:()=>({direction:'hold',confidence:0,allResults:[]})},executeTrade:async(...args)=>{executed={price:args[2],timeframe:args[8],action:args[0].action};return {success:true};}};
 const sandbox={EXECUTION_ACTIONS:new Set(['BUY','SELL','SELL_SHORT','COVER']),stateManager:{getTradesBySymbol:()=>[activeTrade],get:()=>0},ConfigLoader:{get:()=>10},emitTrace:()=>{},createTraceId:()=>'',positionEffectFromAction:()=>'',console:{log:()=>{}},exitContractManager:{updateMaxProfit:()=>{},checkExitConditions:(_trade,p)=>{checked=p;return {shouldExit:true,confidence:100,exitReason:'stop_loss'};}}};
 vm.createContext(sandbox);const method=vm.runInContext('({'+source.slice(start,end)+'})._analyze',sandbox);
 const receiver=new Proxy({ctx,_firstAnalyzedSymbols:new Set(),_dashboardScope:()=>({}),_resolveSymbolMarketData:()=>({price:100,timestamp:1000}),_gatherData:()=>({indicators:{},patterns:[],regime:{}}),_directionGateStatus:()=>({allowed:true}),_getTradeExitContext:()=>({price:90,exitTimeframe:'5m',marketData:{timestamp:2000},indicators:{},priceHistory:[]}),_buildTtpConsistencyExitDecision:()=>null,_exitConfidenceOrNull:()=>100}, {get:(o,k)=>k in o?o[k]:()=>{}});
 await method.call(receiver,'TSLA','probe','1h');
 return {ref,checked,executed};
}
(async()=>{
 const ref=process.argv[2] || 'HEAD';
 const after=await probe(ref);
 assert.equal(after.checked,90);assert.equal(after.executed.price,90);assert.equal(after.executed.timeframe,'5m');
 const out={proof:'Exact _analyze in VM; scripted dependencies. Proves exit context forwarding only, not full broker execution.',after};
 fs.writeFileSync(__dirname+'/astra-exit-price-final.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1;});
