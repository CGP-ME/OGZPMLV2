'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/home/linuxuser/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const token=require('dotenv').parse(fs.readFileSync('.env')).WEBSOCKET_AUTH_TOKEN;
const candidate=process.argv.includes('--candidate')?JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/final-candidate.json'))):null;
const expectBreak=process.argv.includes('--baseline');
const result={startedAt:new Date().toISOString(),mode:candidate?'candidate':'served',pageErrors:[],steps:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,env:{HOME:process.env.HOME,PATH:process.env.PATH,LD_LIBRARY_PATH:'/home/linuxuser/.cache/ogz-browser-libs/extracted/usr/lib/x86_64-linux-gnu'}});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1050}});
  page.on('pageerror',e=>result.pageErrors.push(e.message));
  await page.route('**/*',route=>{const req=route.request();if(!['GET','HEAD','OPTIONS'].includes(req.method()))return route.abort();const body=candidate?.['public'+new URL(req.url()).pathname];return body===undefined?route.continue():route.fulfill({status:200,contentType:req.url().includes('.js')?'application/javascript':'text/html',body});});
  await page.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native {send(s){const m=JSON.parse(s);if(!['auth','identify','asset_change','request_historical','ping','get_settings','get_state','get_trades','request_trace_history'].includes(m.type))throw Error('Observer blocked '+m.type);return super.send(s);}};});
  await page.goto('https://www.ogzprime.com/unified-dashboard-v2.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.OGZ?.get('Socket')&&window.OGZ?.get('WatchlistStrip')&&window.OGZ?.get('EdgeAnalyticsPanel'));
  await page.evaluate(t=>OGZ.get('Socket').setAuthToken(t),token);
  await page.waitForFunction(()=>OGZ.get('Socket').isConnected());
  await page.selectOption('#cp-assetSelector','BTC-USD');
  await page.waitForFunction(()=>document.getElementById('cvdValue').textContent!=='--',{}, {timeout:30000});
  result.beforeWatchlist=await page.evaluate(()=>({selected:document.getElementById('cp-assetSelector').value,panel:OGZ.get('EdgeAnalyticsPanel')._compute(),cvd:document.getElementById('cvdValue').textContent}));
  for(const item of [{symbol:'TSLA',broker:'ALP'},{symbol:'ETH',broker:'KRA'},{symbol:'TSLA',broker:'ALP'},{symbol:'BTC',broker:'KRA'}]){
   const immediate=await page.evaluate(item=>{OGZ.get('WatchlistStrip').setSelected(item);return {selected:document.getElementById('cp-assetSelector').value,panel:OGZ.get('EdgeAnalyticsPanel')._compute(),cvd:document.getElementById('cvdValue').textContent};},item);
   const row={request:item,immediate};result.steps.push(row);
   if(!expectBreak){assert.equal(immediate.selected,item.symbol+(item.broker==='KRA'?'-USD':''));assert.equal(immediate.panel.currentSymbol,immediate.selected);assert.equal(immediate.cvd,'--');}
   if(item.broker==='KRA')await page.waitForFunction(()=>document.getElementById('cvdValue').textContent!=='--',{}, {timeout:30000});
   row.observed=await page.evaluate(()=>({selected:document.getElementById('cp-assetSelector').value,panel:OGZ.get('EdgeAnalyticsPanel')._compute(),cvd:document.getElementById('cvdValue').textContent}));
  }
  assert.equal(result.pageErrors.length,0);
 } finally {await browser.close();result.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,expectBreak?'watchlist-baseline.json':candidate?'watchlist-candidate.json':'watchlist-served.json'),JSON.stringify(result,null,2)+'\n');}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(String(e.stack).split(token).join('[redacted]'));process.exitCode=1;});
