'use strict';
// Exact candidate modules and relay callback, disposable canonical files.
// No bot boot, broker/provider, production socket, or production config write.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Module = require('node:module'), crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const candidate = path.join(packet, 'private/candidate');
const output = fs.mkdtempSync(path.join(packet, 'private/observation-'));
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const source = p => fs.readFileSync(path.join(candidate, p), 'utf8');
const baseline = p => execFileSync('git', ['-C', clone, 'show', 'HEAD:' + p], { maxBuffer: 8e6 }).toString();
const environment = { PROFILE:'paper', WEBSOCKET_AUTH_TOKEN:'fixture-no-network',
  ALPACA_API_KEY:'fixture-no-network', ALPACA_API_SECRET:'fixture-no-network' };
const oldEnv = Object.fromEntries(Object.keys(environment).map(k => [k, process.env[k]]));
Object.assign(process.env, environment);
function compile(text, file, replacements = {}) {
  const m = new Module(file, module); m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file)).concat(Module._nodeModulePaths(root));
  const actualRequire = m.require.bind(m);
  m.require = name => Object.hasOwn(replacements, name) ? replacements[name] : actualRequire(name);
  m._compile(text, file); return m.exports;
}
function owner(name) {
  const dir = path.join(output, name);
  fs.mkdirSync(path.join(dir,'config'),{recursive:true}); fs.mkdirSync(path.join(dir,'foundation'));
  for(const file of ['settings.json','internals.json']) fs.writeFileSync(path.join(dir,'config',file),baseline('config/'+file),{flag:'wx'});
  const load = () => compile(source('foundation/ConfigLoader.js'),path.join(dir,'foundation/ConfigLoader.js'),
    {'../core/AtomicWrite':require(path.join(clone,'core/AtomicWrite'))});
  const loader=load(); const snapshot=loader.load({loadDotenv:false,silent:true});
  return {dir,loader,snapshot,load};
}
const one=owner('one'), two=owner('two');
const consoleEvents=[];
const quiet={log:(...x)=>consoleEvents.push(x.join(' ')),warn:(...x)=>consoleEvents.push(x.join(' ')),error:(...x)=>consoleEvents.push(x.join(' '))};
const WebSocket=require(path.join(root,'node_modules/ws'));
const auth=require(path.join(clone,'server/dashboard-session-auth')).createDashboardSessionAuth({
  sessionTtlMs:60000,ticketTtlMs:60000,secureCookies:true});
const wss=new EventEmitter(); wss.clients=new Set();
const acorn=require(path.join(root,'node_modules/acorn'));
const ast=acorn.parse(source('ogzprime-ssl-server.js'),{ecmaVersion:'latest',sourceType:'script'});
const connection=ast.body.find(n=>n.type==='ExpressionStatement' && n.expression.type==='CallExpression'
  && n.expression.callee.object?.name==='wss' && n.expression.callee.property?.name==='on'
  && n.expression.arguments[0]?.value==='connection').expression.arguments[1];
const context={WebSocket,wss,console:quiet,Date,Math,JSON,Boolean,String,clearTimeout(){},setTimeout(){return {};},
  dashboardRuntimeConfig:{dashboard:{websocketAuthTimeoutMs:5000}},
  dashboardAuthToken:'fixture-no-network',dashboardSessionAuth:auth,isSameOriginDashboardRequest:req=>req.headers.origin==='https://fixture.invalid',
  dashboardSnapshotCache:{},startDashboardStockPriceStream(){},
  broadcastDashboardStockPrices:async()=>{},broadcastDashboardCryptoPrices:async()=>{}};
const connect=vm.runInNewContext('('+source('ogzprime-ssl-server.js').slice(connection.start,connection.end)+')',context);
class Socket extends EventEmitter {
  constructor(){super();this.readyState=WebSocket.OPEN;this.received=[];}
  send(text){const msg=JSON.parse(text);this.received.push(msg);if(this.onSend)this.onSend(msg);}
  close(code,reason){this.readyState=WebSocket.CLOSED;this.closed={code,reason};}
  message(msg){this.emit('message',Buffer.from(JSON.stringify(msg)));}
}
function socket(req){const s=new Socket();wss.clients.add(s);connect(s,req);return s;}
function browser(){const session=auth.issueSession(), ticket=auth.issueTicket();const s=socket({headers:{
  origin:'https://fixture.invalid',cookie:'ogz_dashboard_session='+session.token}});
  s.message({type:'auth',ticket:ticket.ticket});s.message({type:'identify',source:'dashboard'});return s;}
function bot(o) {
  const s=socket({headers:{}});s.message({type:'auth',token:'fixture-no-network'});s.message({type:'identify',source:'trading_bot'});
  const WS=compile(source('core/WebSocketManager.js'),path.join(clone,'core/WebSocketManager.js'),{
    '../foundation/ConfigLoader':o.loader,'./StateManager':{getInstance:()=>({})},
    './TradeNarrator':{getNarrator:()=>({})},'./BotStateFrame':{buildBotStateFrame:()=>({})}});
  const receiver={readyState:WebSocket.OPEN,send:text=>s.message(JSON.parse(text))};
  const applied=[];const manager=new WS({dashboardWs:receiver,onSettingsApplied:(snapshot,receipt)=>applied.push(receipt.configuration)});
  s.onSend=msg=>{if(['get_settings','save_settings'].includes(msg.type))manager.handleSettings(msg);};
  return {socket:s,manager,applied};
}
const first=bot(one),second=bot(two),client=browser();
client.message({type:'get_settings',requestId:'read'});
const reads=client.received.filter(x=>x.type==='settings_result');
assert.equal(reads.length,2);assert.notEqual(reads[0].ownerId,reads[1].ownerId);
assert.deepEqual(Object.keys(reads[0].fields).sort(),['confidence.minTradeConfidence','filters.atrEnabled','filters.atrMinPercent']);
const observations=[];
// Execute the runner's actual getter, not a hand-written replacement accessor.
const runnerAst=acorn.parse(source('run-empire-v2.js'),{ecmaVersion:'latest',sourceType:'script'});
let getter;
function walk(node) {
  if(!node || typeof node!=='object') return;
  if(node.type==='Property' && node.kind==='get' && node.key.name==='minTradeConfidence') getter=node;
  for(const value of Object.values(node)) {
    if(Array.isArray(value)) value.forEach(walk); else if(value && typeof value==='object') walk(value);
  }
}
walk(runnerAst);assert.ok(getter);
const runtimeConfig=vm.runInNewContext('({'+source('run-empire-v2.js').slice(getter.start,getter.end)+'})',{ConfigLoader:one.loader});
const beforeConsumer=runtimeConfig.minTradeConfidence;
function send(changes,extra={}) {
  const view=one.loader.getSettingsView();
  const request={type:'save_settings',requestId:'save-'+observations.length,ownerId:first.socket.connectionId,
    expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes,...extra};
  const before=client.received.length;client.message(request);
  const results=client.received.slice(before).filter(x=>x.type==='settings_result');
  assert.equal(results.length,1);
  observations.push({request,result:results[0]});return results[0];
}
const secondHash=hash(fs.readFileSync(path.join(two.dir,'config/settings.json')));
const oldView=one.loader.getSettingsView();
assert.equal(send({'confidence.minTradeConfidence':0.61,'filters.atrEnabled':true,'filters.atrMinPercent':0.3}).applied,true);
assert.equal(one.loader.get('confidence.minTradeConfidence'),0.61);
assert.equal(runtimeConfig.minTradeConfidence,0.61);
const loopSource=baseline('core/TradingLoop.js');
const gateStart=loopSource.indexOf('  _entryRiskGates('),gateEnd=loopSource.indexOf('\n  _writeDecisionAutopsy(',gateStart);
const gateOwner=vm.runInNewContext('({'+loopSource.slice(gateStart,gateEnd)+'})');
gateOwner._directionGateStatus=()=>({filterPassed:true});
gateOwner._oppositePositionStatus=()=>({passed:true,reason:null,tradeId:null});
const confidenceDecision=threshold=>gateOwner._entryRiskGates('long','both',Array(15),[],1,threshold,0.55).find(g=>g.gate==='min_confidence');
assert.equal(confidenceDecision(beforeConsumer).passed,true);
assert.equal(confidenceDecision(runtimeConfig.minTradeConfidence).passed,false);
// The real full orchestrator evaluator on recorded candles, narrowed to its
// actual RSI registration to isolate the global ATR consumer from other lanes.
const loaderPath=path.join(clone,'foundation/ConfigLoader.js');
const previousLoader=require.cache[loaderPath];
require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:one.loader};
const originalConsole={...console};Object.assign(console,quiet);
let atrConsumer;
try {
  const {StrategyOrchestrator}=require(path.join(clone,'core/StrategyOrchestrator'));
  const IndicatorEngine=require(path.join(clone,'core/indicators/IndicatorEngine'));
  const input=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json'));
  const candles=JSON.parse(input).candles;
  const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'});
  orch.strategies=orch.strategies.filter(s=>s.name==='RSI');assert.equal(orch.strategies.length,1);
  const passes=[];
  for(const [enabled,threshold]of [[true,100],[false,100],[true,0]]) {
    const engine=new IndicatorEngine({...one.loader.get('indicators.engine'),symbol:'TSLA',tf:'15m'});
    const view=one.loader.getSettingsView();
    const save=one.loader.saveSettings({requestId:'atr-'+passes.length,expectedRevision:view.configuration.settings,
      expectedSettingsHash:view.configuration.settingsHash,changes:{'filters.atrEnabled':enabled,'filters.atrMinPercent':threshold}});
    assert.equal(save.applied,true);
    const pass={enabled,threshold,signals:0,atrRejected:0,observedThresholds:[],errors:[]};
    for(let i=0;i<candles.length;i++) {
      const frame=engine.updateCandle(candles[i]);
      try {
        const result=orch.evaluate(frame.indicators,[],null,candles.slice(0,i+1),{symbol:'TSLA',timeframe:'15m',price:candles[i].c});
        pass.signals+=result.allResults.length;
        const rejected=result.filteredResults.filter(r=>r.rejectedBy==='atr_pre_entry_filter');
        pass.atrRejected+=rejected.length;
        for(const r of rejected)pass.observedThresholds.push({reason:r.rejectReason,strategy:r.strategyName});
      }catch(error){pass.errors.push({index:i,message:error.message});}
    }
    passes.push(pass);
  }
  atrConsumer={boundary:'actual StrategyOrchestrator.evaluate and registered RSI on 500 recorded TSLA bars; no bot/order/broker',
    inputSha256:hash(input),candles:candles.length,passes};
  fs.writeFileSync(path.join(output,'atr-consumer.json'),JSON.stringify(atrConsumer,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(output,'consumer-console.json'),JSON.stringify(consoleEvents,null,2)+'\n',{flag:'wx'});
  assert.ok(passes[0].atrRejected>0);
  assert.equal(passes[1].atrRejected,0);assert.equal(passes[2].atrRejected,0);
  // Preserve the observed pre-existing downstream defect. Passing the changed
  // filter is not a claim that the later exit-contract builder or bot works.
  for(const pass of passes.slice(1)) {
    assert.ok(pass.errors.length>0);
    assert.ok(pass.errors.every(e=>e.message==='[EXIT-HINT] RSI.exitContractHint.stopLossPercent must be a negative finite risk distance (got undefined)'));
  }
}finally {
  Object.assign(console,originalConsole);
  if(previousLoader)require.cache[loaderPath]=previousLoader;else delete require.cache[loaderPath];
}
const disk=JSON.parse(fs.readFileSync(path.join(one.dir,'config/settings.json')));
assert.equal(disk.launchProfiles.paper.confidence.minTradeConfidence,0.61);
assert.equal(disk.confidence.minTradeConfidence,undefined);
assert.equal(disk.launchProfiles.production.confidence.minTradeConfidence,JSON.parse(baseline('config/settings.json')).launchProfiles.production.confidence.minTradeConfidence);
assert.equal(hash(fs.readFileSync(path.join(two.dir,'config/settings.json'))),secondHash);
assert.equal(first.applied.length,1);assert.equal(second.applied.length,0);
const cold=one.load().load({loadDotenv:false,silent:true});
assert.equal(cold.fingerprint,one.loader.getSettingsView().configuration.fingerprint);
assert.equal(send({'confidence.minTradeConfidence':0.2},{expectedRevision:oldView.configuration.settings,expectedSettingsHash:oldView.configuration.settingsHash}).reason,'settings_revision_changed');
assert.equal(send({'confidence.minTradeConfidence':'0.2'}).reason,'invalid_setting_value');
assert.equal(send({'positionSizing.maxPositionSize':0.5}).reason,'setting_not_hot_editable');
assert.equal(send(JSON.parse('{"__proto__": {"polluted": true}}')).reason,'setting_not_hot_editable');
assert.equal({}.polluted,undefined);
assert.equal(send({'confidence.minTradeConfidence':0.2},{ownerId:'disconnected-owner'}).reason,'settings_owner_unavailable');
const beforeFailure=one.loader.getSettingsView().configuration.fingerprint;
fs.writeFileSync(path.join(one.dir,'config/settings.json.tmp'),'deliberate fixture collision',{flag:'wx'});
assert.equal(send({'confidence.minTradeConfidence':0.2}).reason,'settings_save_failed');
assert.equal(one.loader.getSettingsView().configuration.fingerprint,beforeFailure);
fs.renameSync(path.join(one.dir,'config/settings.json.tmp'),path.join(output,'preserved-collision.tmp'));
assert.equal(send({'confidence.minTradeConfidence':0,'filters.atrEnabled':false,'filters.atrMinPercent':0}).applied,true);
assert.equal(one.loader.get('confidence.minTradeConfidence'),0);assert.equal(one.loader.get('filters.atrEnabled'),false);
const rogue=browser();rogue.message({type:'identify',source:'trading_bot'});
const beforeSpoof=client.received.length;rogue.message({type:'settings_result',requestId:'spoof',success:true,ownerId:first.socket.connectionId});
assert.equal(client.received.length,beforeSpoof);
const unauth=socket({headers:{}});unauth.message({type:'save_settings',ownerId:first.socket.connectionId,changes:{'confidence.minTradeConfidence':1}});
assert.equal(unauth.closed.code,1008);
const result={at:new Date().toISOString(),boundary:'actual candidate loader/persistence/WS manager/relay callback and existing session-ticket helper; fixture sockets, no boot',
  sources:Object.fromEntries(['foundation/ConfigLoader.js','core/WebSocketManager.js','ogzprime-ssl-server.js','run-empire-v2.js'].map(p=>[p,hash(source(p))])),
  reads,observations,coldFingerprint: cold.fingerprint,secondOwnerUnchanged:true,spoofNotRelayed:true,
  atrConsumer,
  confidenceConsumer:{boundary:'actual runner getter and TradingLoop min-confidence diagnostic; other gate methods fixture-supplied, not a bot decision',
    before:confidenceDecision(beforeConsumer),after:confidenceDecision(0.61)},
  unauthenticatedCommandNotRouted:true,zeroAndFalseRetained:true,consoleEvents};
fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
for(const [k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
console.log(JSON.stringify({receipt:path.relative(root,path.join(output,'receipt.json')),observations:observations.length}));
