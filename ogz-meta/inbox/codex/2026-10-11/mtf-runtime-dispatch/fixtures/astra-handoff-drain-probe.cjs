'use strict';
const cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict'),fs=require('node:fs'),acorn=require('acorn');
const ref=process.argv[2] || 'HEAD';
function methods(file,className,names,globals={}){const source=cp.execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'});const cls=acorn.parse(source,{ecmaVersion:'latest'}).body.find(n=>n.type==='ClassDeclaration'&&n.id.name===className);return vm.runInNewContext('({'+cls.body.body.filter(m=>names.includes(m.key.name)).map(m=>source.slice(m.start,m.end)).join(',')+'})',{console:{log(){},error(){}},...globals});}
const queues=methods('core/TradingLoop.js','TradingLoop',['_enqueueSymbolOperation','_drainSymbolOperations','analyzeAndTrade','waitForPendingOperations'],{createTraceId:()=>''});
const transitions=methods('core/SessionRouter.js','SessionRouter',['_transitionToStocks','_transitionToCrypto'],{getNYTimeParts:()=>({hour:9,minute:30})});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function barrier(){let release;const promise=new Promise(resolve=>release=resolve);return {promise,release};}
async function exercise(to){const from=to==='stocks'?'crypto':'stocks',first=barrier(),second=barrier(),events=[],observed=[],failure=new Error('scripted item failure');let late;
 const loop={...queues,symbolOperationQueues:new Map(),_setSymbolAnalyzing(){},_analyze:async(symbol,id)=>{if(id==='first')await first.promise;if(id==='second')await second.promise;if(id==='reject')throw failure;observed.push({id,session:router.activeSession});}};
 const broker={subscribeToCandles(){events.push('subscribe');},unsubscribeAll(){},removeAllListeners(){}};
 const router={...transitions,ctx:{tradingLoop:loop,evaluationTimeframes:['5m','15m']},activeSession:from,activeBroker:broker,stockSymbols:['TSLA'],cryptoSymbols:['BTC-USD'],krakenAdapter:broker,alpacaAdapter:broker,orderRouter:{registerBroker(){}},stateManager:{async pauseTrading(){events.push('pause');},async resumeTrading(){events.push('resume');}},_currentTimeframe:()=> '15m',_beginTransitionContext:()=>({}),_recordTransitionEvent(name){events.push(name);},_stateManagerReportsPaused:()=>true,async _forceCloseSourceTradesThroughExecution(){events.push('flatten');},async _reconcileBrokerRestBeforeActivation(){events.push('rest');late=loop.analyzeAndTrade('TSLA','second','15m');},_buildRuntimeScopeForSession:()=>({}),_handoffPatternMemory(){},_executeBrokerIntent:(_c,_b,_a,fn)=>fn(),_attachActiveOhlcCallback(){events.push('attach');},_syncDashboardRuntimeScopeForSession:(_s,scope)=>scope,_transitionEvent:()=>({}),_releaseTransitionLock(){},_releaseTransitionLockAfterFailure(){},emit(){},async _enterFailedSafe(_f,_t,error){throw error;}};
 const active=loop.analyzeAndTrade('TSLA','first','5m');
 const rejected=loop.analyzeAndTrade('TSLA','reject','15m');
 const rejectionCheck=assert.rejects(rejected,error=>error===failure);
 const queued=loop.analyzeAndTrade('TSLA','queued','15m');
 const transition=router[to==='stocks'?'_transitionToStocks':'_transitionToCrypto'](new Date());
 await tick();assert.ok(!events.includes('flatten'),'first wait must precede flatten');assert.equal(router.activeSession,from);
 first.release();await Promise.all([active,queued,rejectionCheck]);await tick();assert.ok(events.includes('rest'));assert.ok(events.includes('subscribe'));assert.equal(router.activeSession,from,'second wait must precede destination assignment');assert.ok(!events.includes('resume'));
 second.release();await Promise.all([transition,late]);assert.equal(router.activeSession,to);assert.equal(loop.symbolOperationQueues.size,0);assert.ok(observed.every(x=>x.session===from));return {from,to,observed,originalCallerErrorPreserved:true,sourceDrainBeforeFlatten:true,lateDrainBeforeDestination:true};
}
(async()=>{const results=[await exercise('stocks'),await exercise('crypto')];const receipt={ref,qualification:'Actual exact-tree TradingLoop queue/drain and complete SessionRouter transition methods in VM. Broker/state/persistence/strategy boundaries scripted; proves ordering and rejection ownership, not live execution.',results};fs.writeFileSync(__dirname+'/astra-handoff-drain-result.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));})().catch(error=>{console.error(error);process.exitCode=1;});
