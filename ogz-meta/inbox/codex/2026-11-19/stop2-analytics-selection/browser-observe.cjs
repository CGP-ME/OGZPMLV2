'use strict';
// Read-only public dashboard observation; no trading modules or order requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/home/linuxuser/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const token=require('dotenv').parse(fs.readFileSync('.env')).WEBSOCKET_AUTH_TOKEN;
assert.ok(token,'Existing dashboard credential required');
const candidate=process.argv.includes('--candidate')?JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/candidate.json'))):null;
const receipt={startedAt:new Date().toISOString(),activation:'All four processes restarted from ddf62a14 with canonical environment',pages:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,env:{HOME:process.env.HOME,PATH:process.env.PATH,LD_LIBRARY_PATH:'/home/linuxuser/.cache/ogz-browser-libs/extracted/usr/lib/x86_64-linux-gnu'}});
 try {for(const name of ['unified-dashboard-v2.html','unified-dashboard.html']){
  const context=await browser.newContext({viewport:{width:1600,height:1050}}),page=await context.newPage();
  const r={page:name,pageErrors:[],observations:[]};receipt.pages.push(r);
  page.on('pageerror',e=>r.pageErrors.push(String(e.message).split(token).join('[redacted]')));
  await page.route('**/*',async route=>{const req=route.request();if(!['GET','HEAD','OPTIONS'].includes(req.method()))return route.abort();const body=candidate?.['public'+new URL(req.url()).pathname];if(body!==undefined)return route.fulfill({status:200,contentType:req.url().includes('.js')?'application/javascript':'text/html',body});return route.continue();});
  await page.addInitScript(()=>{
   window.__analytics={cvd:[],commands:[],blocked:[]};const Native=window.WebSocket;
   window.WebSocket=class extends Native{
    constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='cvd_update'){window.__analytics.cvd.push({asset:m.asset,symbol:m.symbol,source:m.source,unit:m.unit,status:m.status,value:m.cvdValue,buyVolume:m.buyVolume,sellVolume:m.sellVolume,windowStartedAt:m.windowStartedAt,timestamp:m.timestamp});if(window.__analytics.cvd.length>40)window.__analytics.cvd.shift();}});}
    send(s){const m=JSON.parse(s);window.__analytics.commands.push({type:m.type,asset:m.asset,timeframe:m.timeframe});if(!['auth','identify','asset_change','request_historical','ping','get_settings','get_state','get_trades','request_trace_history'].includes(m.type)){window.__analytics.blocked.push(m.type);return;}return super.send(s);}
   };
  });
  r.status=(await page.goto('https://www.ogzprime.com/'+name,{waitUntil:'domcontentloaded'})).status();
  await page.waitForFunction(()=>window.OGZ?.get('Socket')&&window.OGZ?.get('EdgeAnalyticsPanel'));
  await page.evaluate(t=>window.OGZ.get('Socket').setAuthToken(t),token);
  const v2=name.includes('-v2'),selector=v2?'#cp-assetSelector':'#assetSelector';
  for(const symbol of ['BTC-USD','TSLA','ETH-USD','TSLA']){
   await page.selectOption(selector,symbol);
   if(symbol.endsWith('-USD')) await page.waitForFunction(symbol=>window.__analytics.cvd.some(m=>m.asset===symbol&&m.status==='ok')&&document.getElementById('cvdValue').textContent!=='--',symbol,{timeout:30000});
   else await page.waitForTimeout(3000);
   const observation=await page.evaluate(selector=>({selected:document.querySelector(selector).value,
    panel:window.OGZ.get('EdgeAnalyticsPanel')._compute(),
    fields:Object.fromEntries(['cvdValue','cvdTrend','currentFunding','smartFlow','fgLabel','buySellRatio','bookImbalance'].map(id=>[id,document.getElementById(id)?.textContent])),
    scripts:[...document.scripts].map(s=>s.src).filter(s=>/edge-analytics|core\.js/.test(s))}),selector);
   r.observations.push(observation);assert.equal(observation.selected,symbol);assert.equal(observation.panel.currentSymbol,symbol);
   await page.locator(v2?'#edgeAnalyticsPanel':'#edgePanel').screenshot({path:path.join(__dirname,(v2?'edge-v2-':'edge-original-')+symbol+'.png')});
   if(symbol.endsWith('-USD'))assert.notEqual(observation.fields.cvdValue,'--');else assert.equal(observation.fields.cvdValue,'--');assert.equal(observation.fields.currentFunding,'Unavailable');assert.equal(observation.fields.smartFlow,'Unavailable');
  }
  r.wire=await page.evaluate(()=>window.__analytics);assert.equal(r.wire.blocked.length,0);assert.equal(r.pageErrors.length,0);
  await page.locator(v2?'#edgeAnalyticsPanel':'#edgePanel').screenshot({path:path.join(__dirname,v2?'served-v2.png':'served-original.png')});
  await context.close();
 }}finally{await browser.close();receipt.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,candidate?'candidate-browser.json':'served-browser.json'),JSON.stringify(receipt,null,2)+'\n');}
 console.log(JSON.stringify(receipt.pages.map(p=>({page:p.page,status:p.status,selections:p.observations.map(o=>o.selected),errors:p.pageErrors})),null,2));
})().catch(e=>{console.error(String(e.stack).split(token).join('[redacted]'));process.exitCode=1;});
