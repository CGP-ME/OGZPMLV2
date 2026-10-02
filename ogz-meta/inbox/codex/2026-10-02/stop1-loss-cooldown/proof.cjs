'use strict';
// Isolated behavior fixtures, not market evidence or a live broker rehearsal.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '../../../../..');
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'CANDIDATE.json')));
const lane = process.argv[2] || 'candidate';
const selectedTree = lane === 'source' ? identity.base : identity.candidate;
process.env.MERCURY_HARNESS_TREE = selectedTree;
require('../../2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs');
const readExact = file => require('node:child_process').execFileSync('git', ['show', selectedTree+':'+file], {cwd:root,encoding:'utf8',maxBuffer:20000000});
const output = path.join(__dirname, 'proof-data', lane);
fs.mkdirSync(output, { recursive: true });
let stateFile, writeFailure = false;
const traces = [], logs = [], ledgerWrites = [], configReads = [];
const config = {
  'mode.backtest': false, 'mode.liveTrading': false, 'backtest.freshStart': false,
  'backtest.initialBalance': 10000,
  'entryLogic.symbolLossCooldown': { enabled: true, consecutiveLosses: 2, cooldownMinutes: 120 },
  'entryLogic.symbolLossCooldown.enabled': true,
  'entryLogic.symbolLossCooldown.consecutiveLosses': 2,
  'entryLogic.symbolLossCooldown.cooldownMinutes': 120,
};
const cfg = { hasLoadedSnapshot: () => true, getSource: () => 'fixture', get(key) {
  configReads.push(key);
  if (key === 'paths.dataDir') return output;
  if (key === 'paths.stateFile') return stateFile;
  return config[key];
}};
const nativeRequire = createRequire(path.join(root, 'core/StateManager.js'));
const quiet = Object.fromEntries(['log','warn','error','debug'].map(level => [level, (...args) => logs.push({level, args: args.map(String)})]));
function loadModule(file) {
  const source = readExact(file);
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name === '../foundation/ConfigLoader') return cfg;
    if (name === './TradeNarrator') return {getNarrator: () => ({enabled:false})};
    if (name === './FeeModel') return {fromTradingConfig: () => ({calculateOrderFee: () => 0})};
    if (name === './TraceSpine') return {emitTrace: (...args) => traces.push(args)};
    if (name === './DecisionLedgerLogger') return {writeOnClose: x => ledgerWrites.push(x)};
    if (name === './AtomicWrite' && writeFailure) return {writeJsonAtomic() { const error = new Error('fixture disk unavailable'); throw error; }};
    return nativeRequire(name);
  };
  vm.runInThisContext('(function(require,module,exports,console){'+source+'\n})', {filename:file})(localRequire,module,module.exports,quiet);
  return module.exports;
}
const { StateManager } = loadModule('core/StateManager.js');
const has = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const flat = () => ({balance:10000,totalBalance:10000,position:0,inPosition:0,positionCount:0,entryPrice:0,entryTime:null,activeTrades:[],isTrading:false,pauseReason:'operator pause',pauseSource:'operator',pauseRecoverable:false,closedTrades:[],symbolEntryHalts:{}});
const halt = code => ({code, reason:'symbol_cooldown: historical note, preserve authorized owner', haltedAt:Date.now()-1000,expiresAt:null,authority:'financial_integrity',manualReconciliationRequired:true});
const scope = id => ({orderId:id,action:'BUY',direction:'long',entryStrategy:'Fixture',symbol:'MARA',brokerId:'alpaca',accountId:'fixture-account',accountIdSource:'config',assetClass:'stocks',executionMode:'paper',timeframe:'15m',exitContract:{stopLossPercent:-0.5,takeProfitPercent:1,useStructuralExits:false},entryOrderQuantity:5,entryOrderQuantityUnit:'shares',remainingOrderQuantity:5,remainingOrderQuantityUnit:'shares'});
const checks = [];
(async () => {
  stateFile = path.join(output,'close.json'); fs.writeFileSync(stateFile,JSON.stringify(flat()));
  const m = new StateManager();
  for (let i=0;i<6;i++) {
    const id='LOSS_'+i;
    assert.equal((await m.openPosition(500,100,scope(id))).success,true);
    assert.equal((await m.closePosition(i===5?101:99,false,null,{orderId:id,orderQuantity:5,quantityUnit:'shares',exitReason:'fixture'})).success,true);
  }
  if (lane==='source') {
    assert.equal(m.isSymbolHalted('MARA'),true);
    assert.equal(m.get('symbolLossStreaks').MARA.consecutiveLosses,0);
    checks.push('baseline reproduces timed halt surviving winning close');
  } else {
    assert.equal(m.isSymbolHalted('MARA'),false);
    assert.equal(has(m.state,'symbolLossStreaks'),false);
    checks.push('five losing closes then winning close create no cooldown or streak');
  }
  assert.equal(m.get('closedTrades').length,6);
  assert.equal(m.get('realizedPnL'),-20);
  assert.equal(m.get('activeTrades').size,0);
  assert.equal(m.get('pauseReason'),'operator pause');
  checks.push('close accounting, trade removal and operator pause preserved');
  if(lane==='source') { fs.writeFileSync(path.join(__dirname,'baseline-result.json'),JSON.stringify({checks},null,2)); return; }
  const codes=['broker_order_reconciliation_required','exit_rail_broker_desync','exit_monitor_reconciliation_required','exit_intent_reconciliation_required','direction_integrity_exit_refusal','broker_unverifiable','ttp_cutoff_unverified_broker_flatness'];
  for(const code of codes) {
    const result=await m.haltSymbol('KEEP', 'symbol_cooldown: note only',halt(code));
    assert.equal(result.success,true);assert.equal(m.getSymbolHaltCode('KEEP'),code);
    assert.equal((await m.resetSymbolHalt('KEEP')).success,true); assert.equal(m.isSymbolHalted('KEEP'),false);
  }
  assert.equal((await m.haltSymbol('MARA','retired',{code:'symbol_cooldown'})).success,false);
  assert.equal(m.isSymbolHalted('MARA'),false);
  await m.updateState({symbolEntryHalts:{MARA:halt('symbol_cooldown')}},{action:'fixture_unauthorized'});
  assert.equal(m.isSymbolHalted('MARA'),false);
  checks.push('all seven retained halt codes accept/block/reset; retired and unauthorized mutations rejected');
  stateFile=path.join(output,'open-trade.json'); fs.writeFileSync(stateFile,JSON.stringify(flat()));
  const liveTrade=new StateManager(); assert.equal((await liveTrade.openPosition(500,100,scope('SURVIVOR'))).success,true);
  const before=JSON.parse(fs.readFileSync(stateFile)); before.symbolLossStreaks={MARA:{consecutiveLosses:2}};before.symbolEntryHalts.OLD=halt('symbol_cooldown');
  fs.writeFileSync(stateFile,JSON.stringify(before));
  const after=new StateManager();
  assert.equal(after.get('activeTrades').size,1);
  const survivor=after.getActiveTrade('SURVIVOR');
  for(const field of ['symbol','direction','entryPrice','size','remainingOrderQuantity','accountId','brokerId','executionMode','timeframe','scopeKey']) assert.deepEqual(survivor[field],before.activeTrades[0][1][field]);
  assert.deepEqual(survivor.exitContract,before.activeTrades[0][1].exitContract);
  assert.equal(after.get('pauseReason'),'operator pause');
  assert.equal(after.isSymbolHalted('OLD'),false);
  checks.push('open trade identity, quantity and exit contract survive migration');
  const shapes=[{MARA:{consecutiveLosses:5,lastClosedAt:1,lastPnl:-5}},{},null,[],7,'bad'];
  for(let i=0;i<shapes.length;i++) {
    stateFile=path.join(output,'migration-'+i+'.json');
    const initial=flat(); initial.symbolLossStreaks=shapes[i];
    initial.symbolEntryHalts={OLD:halt('symbol_cooldown'),CASE:halt(' SYMBOL_COOLDOWN '),LEGACY:{reason:'symbol_cooldown : old',haltedAt:Date.now()},EXPIRED:{...halt('symbol_cooldown'),expiresAt:1}};
    codes.forEach((code,j)=>initial.symbolEntryHalts['KEEP'+j]=halt(code));
    initial.closedTrades=[{tradeId:'historical-receipt',pnl:-5}];
    fs.writeFileSync(stateFile,JSON.stringify(initial));
    for(let cycle=0;cycle<2;cycle++) {
      const restored=new StateManager();assert.equal(has(restored.state,'symbolLossStreaks'),false);
      const disk=JSON.parse(fs.readFileSync(stateFile));assert.equal(has(disk,'symbolLossStreaks'),false);
      assert.equal(Object.keys(disk.symbolEntryHalts).length,codes.length);
      codes.forEach((code,j)=>{assert.equal(restored.getSymbolHaltCode('KEEP'+j),code);assert.deepEqual(disk.symbolEntryHalts['KEEP'+j],initial.symbolEntryHalts['KEEP'+j]);});
      assert.equal(disk.pauseReason,initial.pauseReason);assert.equal(disk.isTrading,false);assert.deepEqual(disk.closedTrades,initial.closedTrades);
    }
  }
  checks.push('six legacy streak shapes and typed/case/legacy/expired halts migrate durably across two loads; seven other owners preserved');
  stateFile=path.join(output,'failure.json');const failure=flat();failure.symbolLossStreaks={};failure.symbolEntryHalts.OLD=halt('symbol_cooldown');fs.writeFileSync(stateFile,JSON.stringify(failure));
  writeFailure=true;const failed=new StateManager();writeFailure=false;
  assert.equal(failed.get('statePersistenceIntegrity').persistenceSucceeded,false);
  assert.equal(failed.get('statePersistenceIntegrity').manualReconciliationRequired,true);
  assert.equal(has(JSON.parse(fs.readFileSync(stateFile)),'symbolLossStreaks'),true);
  assert.equal(failed.isSymbolHalted('OLD'),false);
  const retry=new StateManager();assert.equal(has(JSON.parse(fs.readFileSync(stateFile)),'symbolLossStreaks'),false);
  checks.push('failed migration save retains old disk, reports existing reconciliation boundary, and retries on next load');
  const executorSource=readExact('core/OrderExecutor.js');
  assert.equal(executorSource.includes('_emitSymbolCooldownGateEvent'),false);
  assert.equal(executorSource.includes('symbol_cooldown'),false);
  const blockStart=executorSource.indexOf('      const globalHaltReason =');
  const blockEnd=executorSource.indexOf('      const hedgeBlock =',blockStart);
  // Execute the exact unmodified generic entry-block slice with the real candidate manager.
  const block= new Function('stateManager','symbol','decision','positionEffect','traceId','signalId','emitTrace','blockedReturn','console',executorSource.slice(blockStart,blockEnd));
  stateFile=path.join(output,'gate.json');fs.writeFileSync(stateFile,JSON.stringify(flat()));const gated=new StateManager();
  await gated.haltSymbol('MARA','financial reconciliation',halt('exit_monitor_reconciliation_required'));
  const events=[];
  const result=block.call({ctx:{}},gated,'MARA',{action:'BUY'},'open_long','fixture-trace','fixture-signal',(...args)=>events.push(args),(reason,detail)=>({reason,...detail}),quiet);
  assert.equal(result.reason,'exit_monitor_reconciliation_required');assert.equal(events[0][1],'ORDER_BLOCKED');
  await gated.resetSymbolHalt('MARA');
  assert.equal(block.call({ctx:{}},gated,'MARA',{action:'BUY'},'open_long',null,null,()=>{},()=>{},quiet),undefined);
  checks.push('exact executor generic halt slice still blocks and traces retained code; no dedicated cooldown telemetry remains');
  assert.equal(configReads.some(k=>k.includes('symbolLossCooldown')),false);
  assert.equal(logs.some(x=>x.args.some(s=>s.includes('SYMBOL COOLDOWN:'))),false);
  checks.push('obsolete enabled configuration has no reader or cooldown emission');
  fs.writeFileSync(path.join(__dirname,'proof-result.json'),JSON.stringify({checks,traces,configReads:[...new Set(configReads)]},null,2));
  fs.writeFileSync(path.join(__dirname,'proof-log.json'),JSON.stringify(logs,null,2));
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
