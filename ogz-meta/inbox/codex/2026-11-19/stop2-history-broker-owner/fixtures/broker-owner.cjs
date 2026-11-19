'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
require(process.cwd() + '/test/helpers/require-isolation.cjs');
const prior = fs.readFileSync('ogz-meta/inbox/codex/2026-11-18/stop2-native-history-response/fixtures/native-history.cjs','utf8');
const {vm,runner,method,declaration,ConfigLoader,resolvedConfig,stockAdapter,resolveDashboardStockConfigFromRuntime,hashes,baseline} =
 new Function('require','__dirname',prior.slice(0,prior.indexOf('(async () => {'))+
 '\nreturn {vm,runner,method,declaration,ConfigLoader,resolvedConfig,stockAdapter,resolveDashboardStockConfigFromRuntime,hashes,baseline};')(require,__dirname);
(async()=>{
 const cases=[];
 for(const mode of ['stock_session','crypto_session','stock_only','standalone_kraken','standalone_alpaca'])
 for(const symbol of ['BTC-USD','ETH-USD','SOL-USD'])
 for(const timeframe of ['1m','5m','15m','30m','1h','4h','1d']){
  const sent=[],calls=[],logs=[];
  const broker=name=>({getBrokerName:()=>name,getCandles:async(s,t,l)=>{
   calls.push({broker:name,symbol:s,timeframe:t,limit:l});
   return [{t:1795098600000,o:name==='kraken'?63500:28,h:name==='kraken'?63600:29,l:name==='kraken'?63400:27,c:name==='kraken'?63550:28.1,v:2}];
  }});
  const kraken=broker('kraken'),alpaca=broker('alpaca');
  const bot={tradingPair:'TSLA',dashboardWs:{send:s=>sent.push(JSON.parse(s))},assetManager:{toSlashFormat:s=>s.replace('-','/')}};
  if(mode==='stock_session'){bot.sessionRouter={krakenAdapter:kraken,activeBroker:alpaca};bot.kraken=alpaca;}
  if(mode==='crypto_session'){bot.sessionRouter={krakenAdapter:kraken,activeBroker:kraken};bot.kraken=kraken;}
  if(mode==='stock_only'){bot.sessionRouter={krakenAdapter:null,activeBroker:alpaca};bot.kraken=alpaca;}
  if(mode==='standalone_kraken')bot.kraken=kraken;
  if(mode==='standalone_alpaca')bot.kraken=alpaca;
  const context=vm.createContext({ConfigLoader,resolvedConfig,resolveDashboardStockConfigFromRuntime,
    isDashboardStockSymbol:stockAdapter.isStock,fetchStockCandles:stockAdapter.fetchStockCandles,
    console:Object.fromEntries(['log','warn','error'].map(level=>[level,(...args)=>logs.push({level,message:args.join(' ')})]))});
  declaration(runner,'normalizeRuntimeSymbol',context);declaration(runner,'looksLikeEquityTicker',context);
  bot._stampDashboardHistoricalCandles=method(runner,'_stampDashboardHistoricalCandles',bot,context);
  await method(runner,'fetchAndSendHistoricalCandles',bot,context)(timeframe,2,symbol);
  const available=!['stock_only','standalone_alpaca'].includes(mode);
  const correct=sent.length===1&&sent[0].symbol===symbol&&sent[0].timeframe===timeframe&&
    (available?(calls.length===1&&calls[0].broker==='kraken'&&sent[0].candles[0].c===63550)
    :(calls.length===0&&sent[0].candles.length===0&&Boolean(sent[0].error)));
  cases.push({mode,symbol,timeframe,correct,calls,response:sent[0],logs});
  if(!baseline)assert.equal(correct,true,`${mode} ${symbol} ${timeframe}`);
 }
 console.log('HISTORY_BROKER_RECEIPT '+JSON.stringify({baseline,sourceHashes:hashes,cases,
  evidence:'Actual runner request method and symbol normalizer with distinct instrument responses from two synthetic broker boundaries',
  limitations:['No live broker call or PM2 activation in isolated probe','Stock symbol handling is unchanged and covered by existing native-history fixture']}));
})().catch(error=>{console.error(error);process.exitCode=1;});
