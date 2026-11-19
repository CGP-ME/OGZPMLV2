'use strict';
// Authorized, read-only live dashboard observation. No trading modules imported.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {chromium} = require('/home/linuxuser/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const dotenv = require('dotenv');
const packet = __dirname;
const candidate = process.argv.includes('--candidate') ? JSON.parse(fs.readFileSync(path.join(packet,'fixtures/candidate.json'),'utf8')) : null;
const token = dotenv.parse(fs.readFileSync('.env')).WEBSOCKET_AUTH_TOKEN;
if (!token) throw Error('Existing dashboard access credential is unavailable');
const output = {startedAt:new Date().toISOString(),mode:candidate?'candidate browser responses':'served production files',pages:[]};
const clean = text => String(text).split(token).join('[redacted]');
(async()=>{
 const browser = await chromium.launch({headless:true,env:{PATH:process.env.PATH,HOME:process.env.HOME,
   LD_LIBRARY_PATH:'/home/linuxuser/.cache/ogz-browser-libs/extracted/usr/lib/x86_64-linux-gnu'}});
 output.browserVersion=browser.version();
 try {
  for (const name of ['unified-dashboard-v2.html','unified-dashboard.html']) {
   const context = await browser.newContext({viewport:{width:1600,height:1050}});
   const page = await context.newPage();
   const row={page:name,consoleErrors:[],pageErrors:[],frames:[],scripts:[]}; output.pages.push(row);
   page.on('pageerror',error=>row.pageErrors.push(clean(error.message)));
   page.on('console',message=>{if(message.type()==='error')row.consoleErrors.push(clean(message.text()));});
   await page.route('**/*',async route=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    if(!['GET','HEAD','OPTIONS'].includes(request.method())){row.blockedHttpMethods=(row.blockedHttpMethods||[]).concat(request.method()+' '+pathname);await route.abort();return;}
    const source=candidate?.['public'+pathname];
    if(source!==undefined){await route.fulfill({status:200,contentType:pathname.endsWith('.js')?'application/javascript':'text/html',body:source});return;}
    await route.continue();
   });
   await page.addInitScript(()=>{
    window.__walk={series:[],incoming:{},histories:[],commands:[],blocked:[],native:[],overlays:[],cvd:[]};
    const NativeSocket=window.WebSocket;
    window.WebSocket=class extends NativeSocket {
     constructor(...args){super(...args);this.addEventListener('message',event=>{
      const m=JSON.parse(event.data),s=window.__walk;s.incoming[m.type]=(s.incoming[m.type]||0)+1;
      if(m.type==='historical_candles')s.histories.push({symbol:m.symbol,timeframe:m.timeframe,count:m.candles?.length,error:m.error||null});
      if(m.type==='price'&&(m.data||m).candle){const d=m.data||m;s.native.push({symbol:d.symbol,timeframe:d.timeframe,candle:d.candle});if(s.native.length>2000)s.native.shift();}
      if(m.type==='cvd_update'){s.cvd.push({asset:m.asset,symbol:m.symbol,timeframe:m.timeframe,source:m.source,value:m.cvdValue});if(s.cvd.length>100)s.cvd.shift();}
     });}
     send(value){const m=JSON.parse(value),safe=['auth','identify','asset_change','request_historical','ping','get_settings','get_state','get_trades','request_trace_history'];
      window.__walk.commands.push({type:m.type,asset:m.asset,timeframe:m.timeframe});
      if(!safe.includes(m.type)){window.__walk.blocked.push(m.type);return;}
      return super.send(value);
     }
    };
    let library;
    Object.defineProperty(window,'LightweightCharts',{configurable:true,get:()=>library,set(value){
     library={...value,createChart(...args){const chart=value.createChart(...args);
      for(const method of ['addLineSeries','addCandlestickSeries','addHistogramSeries','addAreaSeries','addBarSeries']){
       if(!chart[method])continue;const original=chart[method].bind(chart);
       chart[method]=(...a)=>{const series=original(...a),record={method,options:a[0],writes:0,last:null,api:series};window.__walk.series.push(record);
        for(const op of ['setData','update']){const fn=series[op].bind(series);series[op]=(...b)=>{const result=fn(...b);record.writes++;record.last=op==='setData'?b[0].at(-1)||null:b[0];return result;};}
        return series;};
      }return chart;}};
    }});
   });
   const response=await page.goto('https://www.ogzprime.com/'+name,{waitUntil:'domcontentloaded',timeout:45000});
   row.httpStatus=response.status();
   await page.waitForFunction(()=>window.OGZ?.get('Socket')&&window.OGZ?.get('Chart')?.getSeries()?.candle,{},{timeout:30000});
   await page.evaluate(t=>window.OGZ.get('Socket').setAuthToken(t),token);
   await page.waitForFunction(()=>window.OGZ.get('Socket').isConnected(),{},{timeout:30000});
   const panel=name.includes('-v2');const prefix=panel?'cp-':'';
   await page.selectOption('#'+prefix+'assetSelector','TSLA');
   await page.locator('#'+prefix+'indicatorCheckboxes input[value="ema"]').check();
   await page.locator('#'+prefix+'indicatorCheckboxes input[value="rsi"]').check();
   await page.locator('#'+prefix+'indicatorCheckboxes input[value="bollinger"]').check();
   for(const frame of ['1m']){
    const count=await page.evaluate(()=>window.__walk.histories.length);
    await page.selectOption('#'+prefix+'timeframeSelector',frame);
    await page.waitForFunction(({count,frame})=>window.__walk.histories.slice(count).some(h=>h.symbol==='TSLA'&&h.timeframe===frame),{count,frame},{timeout:30000});
    row.frames.push(await page.evaluate(({frame,prefix})=>{
     const chart=window.OGZ.get('Chart'),data=chart.getSeries().candle.data();
     const history=window.__walk.histories.filter(h=>h.symbol==='TSLA'&&h.timeframe===frame).at(-1);
     const canvas=[...document.querySelectorAll('canvas')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0);
     return {frame,selected:document.getElementById(prefix+'timeframeSelector').value,history,renderedCandles:data.length,first:data[0],last:data.at(-1),visibleCanvases:canvas.length};
    },{frame,prefix}));
   }
   await page.selectOption('#'+prefix+'assetSelector','TSLA');
   await page.selectOption('#'+prefix+'timeframeSelector','1m');
   await page.waitForFunction(()=>window.OGZ.get('Chart').getSeries().candle.data().length>0,{},{timeout:30000});
   row.beforeLive=await page.evaluate(()=>window.__walk.series.filter(s=>s.method==='addLineSeries').map(s=>({options:s.options,writes:s.writes,last:s.last})));
   await page.waitForTimeout(75000);
   row.afterLive=await page.evaluate(()=>window.__walk.series.filter(s=>s.method==='addLineSeries').map(s=>({options:s.options,writes:s.writes,last:s.last})));
   row.lastNativeCandle=await page.evaluate(()=>window.OGZ.get('Chart').getSeries().candle.data().at(-1));
   row.wire=await page.evaluate(()=>({counts:window.__walk.incoming,histories:window.__walk.histories,commands:window.__walk.commands,blocked:window.__walk.blocked,cvd:window.__walk.cvd,nativeCount:window.__walk.native.length}));
   row.scripts=await page.evaluate(()=>[...document.scripts].map(s=>s.src).filter(Boolean));
   const screenshot=(candidate?'candidate-':'served-')+(panel?'v2':'legacy')+'.png';
   await page.locator(panel ? '#chartPanel' : '#tvChartContainer').screenshot({path:path.join(packet,screenshot)});row.screenshot=screenshot;
   await context.close();
  }
 } finally {await browser.close();output.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(packet,(candidate?'candidate-browser':'served-browser')+'.json'),JSON.stringify(output,null,2)+'\n');}
 console.log(JSON.stringify(output.pages.map(p=>({page:p.page,status:p.httpStatus,frames:p.frames.map(f=>({frame:f.frame,candles:f.renderedCandles,canvases:f.visibleCanvases})),errors:p.pageErrors,blocked:p.wire?.blocked})),null,2));
})().catch(error=>{console.error(clean(error.stack));process.exitCode=1;});
