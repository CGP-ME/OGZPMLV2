'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),acorn=require('acorn');
const {EventEmitter}=require('events');
require(process.cwd()+'/test/helpers/require-isolation.cjs')();
const baseline=process.argv.includes('--baseline'),override=process.argv.find(x=>x.endsWith('.json'));
if(override)for(const[f,s]of Object.entries(JSON.parse(fs.readFileSync(override))))fs.writeFileSync(f,s);
const text=fs.readFileSync('ogzprime-ssl-server.js','utf8'),nodes=[];
function visit(n){if(!n||typeof n!=='object')return;if(n.type)nodes.push(n);for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}}
visit(acorn.parse(text,{ecmaVersion:'latest'}));
const expression=n=>text.slice(n.start,n.end);
const declarations=nodes.filter(n=>n.type==='VariableDeclarator'&&['cryptoFeed','krakenSocket'].includes(n.id.name));
const start=nodes.filter(n=>n.type==='CallExpression'&&n.callee.object?.name==='cryptoFeed'&&n.callee.property?.name==='connect');
const stop=nodes.find(n=>n.type==='CallExpression'&&n.callee.object?.name==='process'&&n.callee.property?.name==='on'&&n.arguments[0].value==='SIGINT');
assert.equal(start.length,1);assert.ok(stop);
const sockets=[],calls=[],timers=[];
class WS extends EventEmitter {static OPEN=1;constructor(url){super();this.url=url;this.readyState=1;sockets.push(this);}send(s){calls.push(JSON.parse(s));}close(){this.readyState=3;this.emit('close');}terminate(){this.close();}}
const quiet={log(){},warn(){},error(){}};
const feedContext={module:{exports:{}},require:n=>{assert.equal(n,'ws');return WS;},console:quiet,
 setInterval:()=>({unref(){}}),clearInterval:()=>calls.push('watchdog cleared'),setTimeout:fn=>{timers.push(fn);return{unref(){}};}};
vm.runInNewContext(fs.readFileSync('core/CryptoMarketFeed.js','utf8'),feedContext);
let signalHandler;const client={readyState:1,close(){calls.push('dashboard client closed');this.readyState=3;}};
const context={createCryptoMarketFeed:feedContext.module.exports.createCryptoMarketFeed,
 dashboardRuntimeConfig:{dashboard:{cryptoMarketFeed:JSON.parse(fs.readFileSync('config/internals.json')).dashboard.cryptoMarketFeed}},
 DASHBOARD_CRYPTO_PRICE_SYMBOLS:['BTC-USD'],broadcastCryptoFrame:f=>calls.push({type:f.type,status:f.status}),
 process:{on:(s,h)=>{assert.equal(s,'SIGINT');signalHandler=h;},exit:code=>calls.push({exit:code})},
 wss:{clients:new Set([client])},WebSocket:WS,console:quiet,httpServer:{close:cb=>{calls.push('HTTP closed');cb();}}};
vm.createContext(context);
for(const n of declarations)vm.runInContext('const '+expression(n)+';',context);
vm.runInContext(expression(start[0]),context);sockets[0].emit('open');assert.equal(sockets.length,1);assert.equal(calls.filter(x=>x.event==='subscribe').length,3);
vm.runInContext(expression(stop),context);signalHandler();
const afterStop=vm.runInContext('cryptoFeed.isConnected()',context);
assert.equal(afterStop,baseline);
if(!baseline){assert.equal(timers.length,0);assert.ok(calls.includes('watchdog cleared'));assert.equal(text.includes('krakenSocket'),false);}
assert.ok(calls.includes('dashboard client closed'));assert.ok(calls.includes('HTTP closed'));
assert.deepEqual(calls.filter(x=>x.exit!==undefined),[{exit:0}]);
const closeErrors=[];
const failingFeed=feedContext.module.exports.createCryptoMarketFeed({symbols:['BTC-USD'],feedConfig:context.dashboardRuntimeConfig.dashboard.cryptoMarketFeed,log:{...quiet,error:s=>closeErrors.push(s)}});
failingFeed.connect();sockets.at(-1).close=()=>{throw Error('fixture transport close error');};failingFeed.stop();
assert.equal(closeErrors.length,baseline?0:1);
console.log('FEED_LIFECYCLE_RECEIPT '+JSON.stringify({baseline,sourceHash:crypto.createHash('sha256').update(text).digest('hex'),feedHash:crypto.createHash('sha256').update(fs.readFileSync('core/CryptoMarketFeed.js')).digest('hex'),ghostSocketReferences:nodes.filter(n=>n.type==='Identifier'&&n.name==='krakenSocket').length,subscriptions:calls.filter(x=>x.event==='subscribe'),feedConnectedAfterServerSignal:afterStop,reconnectsScheduled:timers.length,sequence:calls,closeErrors,limits:['Actual feed and actual server startup/shutdown expressions; synthetic transport and process exit','No host signals, PM2 changes or bot orders']}));
