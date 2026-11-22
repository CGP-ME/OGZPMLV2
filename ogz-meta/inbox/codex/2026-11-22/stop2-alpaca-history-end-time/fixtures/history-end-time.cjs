'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require(process.cwd()+'/test/helpers/require-isolation.cjs')();
const override=process.argv.find(a=>a.startsWith('--source='));
if(override)for(const[file,contents]of Object.entries(JSON.parse(fs.readFileSync(override.slice(9)))))fs.writeFileSync(file,contents);
const baseline=process.argv.includes('--baseline'),logs=[];
for(const level of ['log','warn','error'])console[level]=(...args)=>logs.push({level,text:args.join(' ')});
const dotenv=path.join(__dirname,'synthetic.env');fs.writeFileSync(dotenv,'ALPACA_API_KEY=fixture-key\nALPACA_API_SECRET=fixture-secret\nKRAKEN_API_KEY=fixture-key\nKRAKEN_API_SECRET=fixture-secret\nWEBSOCKET_AUTH_TOKEN=fixture-token\n');
process.env.DOTENV_CONFIG_PATH=dotenv;process.env.PROFILE='paper';
const ConfigLoader=require(process.cwd()+'/foundation/ConfigLoader');const loaded=ConfigLoader.load({role:'bot',silent:true});
const Alpaca=require(process.cwd()+'/brokers/AlpacaAdapter'),CandleProcessor=require(process.cwd()+'/core/CandleProcessor');
const captured=JSON.parse(fs.readFileSync('ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/alpaca-native.json'));
const frames={'1m':60000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000};
const requests=[];require('axios').get=async(url,options)=>{
 const selected=Object.entries(captured.lanes.bot).find(([,v])=>v.parameters.timeframe===options.params.timeframe);assert.ok(selected,'Only a captured native frame may be requested');
 requests.push({symbol:'TSLA',timeframe:selected[0],providerTimeframe:options.params.timeframe});const data=structuredClone(selected[1].response);data.bars=data.bars.slice(0,options.params.limit);return {data};
};
const adapter=new Alpaca({apiKey:'fixture-key',apiSecret:'fixture-secret',mode:'paper'});
const processor=new CandleProcessor({config:loaded.config,candleTimeframe:'1m'});
(async()=>{
 const results=[],refreshes=[];adapter.on('ohlc',event=>refreshes.push(event));
 for(const[timeframe,ms]of Object.entries(frames)){
  const expected=captured.lanes.bot[timeframe].response.bars.map(b=>({t:Date.parse(b.t),o:Number(b.o),h:Number(b.h),l:Number(b.l),c:Number(b.c),v:Number(b.v)})).sort((a,b)=>a.t-b.t);
  const actual=await adapter.getCandles('TSLA',timeframe,60);
  assert.deepEqual(actual.map(({t,o,h,l,c,v})=>({t,o,h,l,c,v})),expected);
  const gap=await processor.attemptBackfill({gapStart:expected[0].t-ms,gapEnd:expected.at(-1).t+2*ms,broker:adapter,traceContext:{symbol:'TSLA',timeframe,brokerId:'alpaca',assetClass:'stocks',accountId:'fixture-account',accountIdSource:'fixture',executionMode:'paper'}});
  const receipt={timeframe,providerBars:expected.length,returnedBars:actual.length,missingNativeEndTimes:actual.filter(c=>c.etime===undefined).length,incorrectGapEndTimes:gap.filter(c=>c[1]!==c[0]+ms).length,gapBars:gap.length,originalTimestampAndOHLCVUnchanged:true,first:{start:actual[0].t,adapterEnd:actual[0].etime??null,gapEnd:gap[0]?.[1]??null,expectedEnd:actual[0].t+ms}};
  results.push(receipt);if(!baseline){assert.equal(receipt.missingNativeEndTimes,0);assert.equal(receipt.incorrectGapEndTimes,0);assert.equal(gap.length,expected.length);}
  if(timeframe!=='1m'){
   const state={timeframe,pendingRefresh:null,requestedBarFetch:null,lastCloseEventStartMs:null,emittedBars:new Map()};
   const subscription={streamTimeframe:'1m',requestedFrames:new Map([[timeframe,state]])};adapter.barSubscriptions.set('TSLA',subscription);
   const closedThroughMs=expected.at(-1).t+ms;adapter._emitRequestedClosedBar('TSLA',{closedThroughMs,newCloseThroughMs:closedThroughMs},subscription,state);await state.requestedBarFetch;
   const emitted=refreshes.filter(e=>e.timeframe===timeframe);assert.equal(emitted.length,2);assert.ok(emitted.every(e=>e.data.etime===e.data.t+ms));
  }
 }
 process.stdout.write(JSON.stringify({baseline,isolation:'test-isolated.py',results,requests,nativeRefreshEvents:refreshes.map(e=>({timeframe:e.timeframe,t:e.data.t,etime:e.data.etime,priceTimestamp:e.priceTimestamp})),sourceHashes:Object.fromEntries(['brokers/AlpacaAdapter.js','core/CandleProcessor.js','foundation/ohlc-normalize.js','config/settings.json','config/internals.json'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),logs,limitations:['Actual Alpaca REST producer, requested native refresh emitter and gap consumer execute against captured TSLA provider responses.','Transport uses captured read-only provider JSON and synthetic credentials inside isolation; no live order, PM2 activation or market-hours claim.','Adding the native interval end preserves bar start and OHLCV; no smaller candles are combined.']},null,2)+'\n');
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
