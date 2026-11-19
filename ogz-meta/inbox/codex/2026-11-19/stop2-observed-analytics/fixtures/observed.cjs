'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const acorn = require('acorn');
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const baseline = process.argv.includes('--baseline');
const override = process.argv.find(arg => arg.endsWith('.json'));
if (override) for (const [f, s] of Object.entries(JSON.parse(fs.readFileSync(override)))) fs.writeFileSync(f, s);
const hashes = {};
function source(f) {
  const s = fs.readFileSync(f, 'utf8');
  hashes[f] = crypto.createHash('sha256').update(s).digest('hex');
  return s;
}
function nodes(s) {
  const result = [];
  function visit(x) {
    if (!x || typeof x !== 'object') return;
    if (x.type) result.push(x);
    for (const value of Object.values(x)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(acorn.parse(s, {ecmaVersion:'latest'}));
  return result;
}
const output = {baseline, hashes, limits:['Transport/DOM boundaries are synthetic; production feed, broadcaster, caller expressions and browser handlers execute','No broker orders, host state, live credentials or network inside this helper']};
const envFile = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(envFile, 'WEBSOCKET_AUTH_TOKEN=fixture-only-dashboard-token\nALPACA_API_KEY=fixture-only-key\nALPACA_API_SECRET=fixture-only-secret\nINCEPTION_API_KEY=fixture-only-trai\n');
process.env.DOTENV_CONFIG_PATH = envFile;
process.env.PROFILE = 'paper';
source('foundation/ConfigLoader.js'); source('config/internals.json');
const cfg = require(process.cwd() + '/foundation/ConfigLoader').load({role:'dashboard',silent:true});
const feedConfig = cfg.config.dashboard.cryptoMarketFeed;
assert.equal(Object.hasOwn(feedConfig, 'buySellRatioWhenNoSells'), baseline);
output.configuration = {role:cfg.role, obsoleteRatioPresent:Object.hasOwn(feedConfig,'buySellRatioWhenNoSells'), feedSource:cfg.sources['dashboard.cryptoMarketFeed.publicWsUrl']};

// Execute the real feed with a controllable transport and time boundary.
let now = 1795100000000;
class Clock extends Date { static now() { return now; } }
const sockets = [], timers = [], logs = [], frames = {cvd:[],whales:[],internals:[],depth:[]};
class FakeSocket extends EventEmitter {
  static OPEN = 1;
  constructor(url) { super(); this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState=3; this.emit('close'); }
  terminate() { this.close(); }
}
const feedContext = {module:{exports:{}}, Date:Clock, console,
  require:name=>{ assert.equal(name,'ws');return FakeSocket; },
  setTimeout:fn=>{timers.push(fn);return {unref(){}};},
  setInterval:()=>({unref(){}}), clearInterval(){} };
vm.runInNewContext(source('core/CryptoMarketFeed.js'),feedContext);
const feed = feedContext.module.exports.createCryptoMarketFeed({symbols:['BTC-USD','ETH-USD'],feedConfig,
  onCvd:f=>frames.cvd.push({...f}),onWhaleTrade:f=>frames.whales.push({...f}),
  onInternals:f=>frames.internals.push({...f}),onDepth:f=>frames.depth.push({...f}),
  log:{error:s=>logs.push(s),warn:s=>logs.push(s),log:s=>logs.push(s)}});
feed.connect(); sockets[0].emit('open');
assert.ok(sockets[0].sent.every(x=>x.event==='subscribe'));
function msg(channel,data,pair='XBT/USD') { now+=1100; sockets.at(-1).emit('message',JSON.stringify([1,data,channel,pair])); }
const row=(p,q,side,at=now)=>[String(p),String(q),String(at/1000),side,'l',''];
msg('trade',[row(100,2,'b'),row(100,1,'s')]);
assert.equal(frames.cvd.at(-1).cvdValue,100);
const first={...frames.cvd.at(-1)};
msg('book-25',{bs:[['99','10']],as:[['101','10']]});
assert.equal(frames.internals.at(-1).buySellRatio,2);
if(!baseline) { assert.equal(first.unit,'USD');assert.equal(first.source,'kraken_trade');assert.equal(frames.internals.at(-1).spread,2); }
msg('trade',[row(200,1,'b')],'ETH/USD');
msg('book-25',{bs:[['199','10']],as:[['201','10']]},'ETH/USD');
const buyOnly={...frames.internals.at(-1)};
assert.equal(buyOnly.buySellRatio,baseline?99:null);
msg('trade',[row(10000,30,'b')]);
assert.equal(frames.whales.at(-1).amount*frames.whales.at(-1).price,300000);
const actualTrade={...frames.whales.at(-1)};
msg('trade',[row(100,1,'unknown')]);
const invalid={...frames.cvd.at(-1)};
if(!baseline) {assert.equal(invalid.status,'unavailable');assert.ok(logs.some(x=>x.includes('Invalid trade data')));}
msg('trade',[row(100,2,'buy')]);
if(!baseline) assert.equal(frames.cvd.at(-1).cvdValue,200);
const recovered={...frames.cvd.at(-1)};
sockets.at(-1).close();
if(!baseline) {assert.equal(frames.cvd.at(-1).status,'unavailable');assert.equal(frames.internals.at(-1).status,'unavailable');}
timers.shift()();now+=1100;sockets.at(-1).emit('open');
msg('trade',[row(100,2,'b')]);
const reconnect={...frames.cvd.at(-1)};
if(!baseline) {assert.equal(reconnect.cvdValue,200);assert.notEqual(reconnect.windowStartedAt,recovered.windowStartedAt);}
// An old snapshot print counts in the observed connection total but not the current rolling window.
msg('trade',[row(200,1,'b',now-feedConfig.tradeWindowMs-10000)],'ETH/USD');
msg('book-25',{bs:[['199','10']],as:[['201','10']]},'ETH/USD');
const expired={...frames.internals.at(-1)};
if(!baseline) {assert.equal(expired.buyVolume,0);assert.equal(expired.buySellRatio,null);assert.equal(expired.aggressor,null);}
if(!baseline) {msg('trade',[null]);assert.equal(frames.cvd.at(-1).status,'unavailable');}
feed.stop();
output.feed={first,buyOnly,actualTrade,invalid,recovered,reconnect,expired,subscriptions:sockets.map(s=>s.sent),invalidDataReported:logs.filter(x=>x.includes('Invalid trade data'))};

// Execute the actual candle producer, runner delegation and broadcaster body.
const Broadcast = require(process.cwd()+'/core/DashboardBroadcaster'); source('core/DashboardBroadcaster.js');
const emitted=[],reads=[];
const candle={symbol:'BTC-USD',timeframe:'1m',o:100,h:103,l:99,c:102,v:5,t:now,brokerId:'kraken',assetClass:'crypto',executionMode:'paper',source:'fixture_native'};
const history=Array.from({length:30},(_,i)=>({...candle,t:now-(29-i)*60000}));
const ctx={edgeAnalyticsMaxScopes:10,dashboardWs:{readyState:1,send:s=>emitted.push(JSON.parse(s))},
  candleStore:{getCandles:(s,t)=>{reads.push([s,t]);return history;}},
  getSymbolTimeframeContext:()=>({indicatorEngine:{getSnapshot:()=>({indicators:{rsi:50}})}})};
const broadcaster=new Broadcast(ctx);
const runnerSource=source('run-empire-v2.js');
const method=nodes(runnerSource).find(n=>n.type==='MethodDefinition'&&n.key.name==='broadcastEdgeAnalytics');
const delegate=vm.runInNewContext('('+runnerSource.slice(method.value.start,method.value.end).replace(/^\(/,'function(')+')');
const processorSource=source('core/CandleProcessor.js');
const call=nodes(processorSource).find(n=>n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&n.callee.property.name==='broadcastEdgeAnalytics');
const invoke=vm.runInNewContext('(function(candle,price,volume){return '+processorSource.slice(call.start,call.end)+';})');
const runner={dashboardWs:ctx.dashboardWs,dashboardBroadcaster:broadcaster,broadcastEdgeAnalytics:delegate};
for(const tf of ['1m','5m','15m','30m','1h','4h','1d']) for(const volume of [5,7,9]) invoke.call({ctx:runner},{...candle,timeframe:tf,v:volume},102,volume);
const emittedTypes=[...new Set(emitted.map(x=>x.type))];
if(baseline) assert.ok(emittedTypes.includes('cvd_update'));
else assert.ok(emittedTypes.every(x=>x==='divergence'));
assert.equal(reads.length,21);
output.candles={calls:reads.length,emittedTypes,candleCvd:emitted.filter(x=>x.type==='cvd_update').map(x=>x.cvdValue)};

// Execute both real browser modules against a small DOM/transport boundary.
const elements=new Map(),handlers=new Map(),modules={},intervals=[],browserErrors=[];
const canvas={clearCount:0,clearRect(){this.clearCount++;},beginPath(){},moveTo(){},lineTo(){},stroke(){},closePath(){},fill(){}};
function element(id='') {
  const e={id,textContent:'',innerHTML:'',style:{},children:[],listeners:{},width:300,height:100,value:'',
    classList:{toggle(){},contains(){return false;}},querySelector(){return null;},querySelectorAll(){return [];},
    appendChild(c){c.parent=this;this.children.push(c);},prepend(c){c.parent=this;this.children.unshift(c);},
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);},
    addEventListener(t,fn){this.listeners[t]=fn;},removeEventListener(t,fn){if(this.listeners[t]===fn)delete this.listeners[t];},
    getContext(){return canvas;}};
  Object.defineProperty(e,'lastChild',{get(){return this.children.at(-1);}});
  return e;
}
for(const id of ['edgePanel','cvdValue','cvdTrend','cvdChart','whaleAlerts','aggressorSide','buySellRatio','bookImbalance','spreadValue',
  'currentFunding','predictedFunding','fundingSignal','smartFlow','instActivity','dormancy','fgValue','fgFill','fgLabel',
  'divergences','assetSelector','timeframeSelector','longLiqPrice','longLiqVol','shortLiqPrice','shortLiqVol']) elements.set(id,element(id));
if(baseline) elements.set('edgeAnalyticsPanel',element('edgeAnalyticsPanel'));
elements.get('assetSelector').value='BTC-USD';elements.get('timeframeSelector').value='1m';
const socket={registerHandler:(t,fn)=>{if(!handlers.has(t))handlers.set(t,[]);handlers.get(t).push(fn);},
  unregisterHandler:(t,fn)=>handlers.set(t,(handlers.get(t)||[]).filter(x=>x!==fn))};
const browser={document:{getElementById:id=>elements.get(id)||null,querySelector:()=>null,createElement:()=>element(),addEventListener(){}},
  console:{error:(...x)=>browserErrors.push(x.map(String).join(' ')),log(){},warn(){}},
  setInterval:(fn,delay)=>{intervals.push({fn,delay});},setTimeout(){},Event:class{},Date:Clock};
browser.window={OGZ:{register:(n,m)=>modules[n]=m,get:n=>n==='Socket'?socket:modules[n],bus:{on(){},off(){}},state:{lastPrice:100}},dispatchEvent(){}};
vm.createContext(browser);
vm.runInContext(source('public/js/panels/edge-analytics.js'),browser);modules.Edge.init();
assert.equal(intervals.length>0,baseline);
vm.runInContext(source('public/js/panels/edge-analytics-panel.js'),browser);const panel=modules.EdgeAnalyticsPanel;panel.init();
const dispatch=(type,payload)=>(handlers.get(type)||[]).forEach(fn=>fn(payload));
const valid={asset:'BTC-USD',source:'kraken_trade',unit:'USD',status:'ok',cvdValue:100,cvdTrend:'rising',windowStartedAt:123};
dispatch('cvd_update',valid);assert.equal(elements.get('cvdValue').textContent,'100');
dispatch('cvd_update',{...valid,asset:'ETH-USD',cvdValue:999});assert.equal(elements.get('cvdValue').textContent,'100');
dispatch('cvd_update',{...valid,cvdValue:120});
if(!baseline){
  const cleared=canvas.clearCount;
  dispatch('cvd_update',{...valid,windowStartedAt:124,cvdValue:10});
  assert.equal(panel._compute().cvdHistoryLength,1);assert.ok(canvas.clearCount>cleared);
  dispatch('cvd_update',{asset:'BTC-USD',source:'candle_processor',timeframe:'1m',cvdValue:9999});
  assert.equal(elements.get('cvdValue').textContent,'--');assert.equal(panel._compute().cvdHistoryLength,0);
  dispatch('cvd_update',valid);
  dispatch('cvd_update',{asset:'BTC-USD',source:'kraken_trade',unit:'USD',status:'unavailable',reason:'Trade feed disconnected'});
  assert.equal(elements.get('cvdTrend').textContent,'Trade feed disconnected');
  dispatch('market_internals',{asset:'BTC-USD',source:'candle_processor',buySellRatio:99,spread:3});
  assert.equal(elements.get('buySellRatio').textContent,'Unavailable');
  dispatch('market_internals',{...buyOnly,asset:'BTC-USD'});
  assert.equal(elements.get('buySellRatio').textContent,'BUY ONLY');assert.equal(elements.get('aggressorSide').textContent,'BUYERS');
  dispatch('whale_trade',actualTrade);assert.equal(elements.get('whaleAlerts').children.length,1);
  dispatch('whale_trade',{...actualTrade,symbol:'ETH-USD'});assert.equal(elements.get('whaleAlerts').children.length,1);
  dispatch('whale_trade',{...actualTrade,source:'candle_processor'});assert.equal(elements.get('whaleAlerts').children.length,1);
  dispatch('funding_rate',{currentFunding:0.0001});assert.equal(elements.get('currentFunding').textContent,'Unavailable');
  dispatch('smart_money',{smartFlow:'ACCUMULATING'});assert.equal(elements.get('smartFlow').textContent,'Unavailable');
  elements.get('assetSelector').value='ETH-USD';elements.get('assetSelector').listeners.change({target:elements.get('assetSelector')});
  assert.equal(panel._compute().currentSymbol,'ETH-USD');assert.equal(elements.get('cvdValue').textContent,'--');
}
output.browser={simulationTimers:intervals.length,handlers:[...handlers.keys()],state:panel._compute(),errors:browserErrors};
if(!baseline){panel.teardown();assert.equal([...handlers.values()].flat().length,0);assert.equal(Object.keys(elements.get('assetSelector').listeners).length,0);assert.deepEqual(browserErrors,[]);}
const server=source('ogzprime-ssl-server.js');
const cache=nodes(server).find(n=>n.type==='VariableDeclarator'&&n.id.name==='dashboardSnapshotCache');
assert.ok(cache,'find real bot snapshot cache');
output.cacheKeys=cache.init.properties.map(p=>p.key.name||p.key.value);
if(!baseline) assert.ok(!output.cacheKeys.some(k=>['cvd_update','market_internals','funding_rate','smart_money','fear_greed','liquidation_data'].includes(k)));
source('public/js/core.js');
console.log('OBSERVED_ANALYTICS_RECEIPT '+JSON.stringify(output));
