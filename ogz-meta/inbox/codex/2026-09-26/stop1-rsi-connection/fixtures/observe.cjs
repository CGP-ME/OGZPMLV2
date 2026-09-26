'use strict';
// Execute the real strategy/contract owners on recorded candles in disposable
// configuration fixtures. No bot boot, sockets, broker, or production writes.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../../../..'),packet=path.resolve(__dirname,'..');
const clone=path.join(root,'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const label=process.argv[2];assert.match(label,/^(baseline|candidate|final|cold)$/);
const out=fs.mkdtempSync(path.join(packet,'private/'+label+'-'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const paths=['config/settings.json','foundation/ConfigLoader.js','core/StrategyOrchestrator.js','core/ExitContractManager.js','core/PolicyBuilder.js'];
const sources=Object.fromEntries(paths.map(p=>[p,hash(fs.readFileSync(path.join(clone,p)))]));
const env={PROFILE:'paper',WEBSOCKET_AUTH_TOKEN:'fixture-no-network',ALPACA_API_KEY:'fixture-no-network',ALPACA_API_SECRET:'fixture-no-network'};
Object.assign(process.env,env);
const rawInput=fs.readFileSync(path.join(root,'tuning/tsla-15m-tiny.json'));
const candles=JSON.parse(rawInput).candles,consoleEvents=[],original={...console};
for(const key of ['log','warn','error'])console[key]=(...x)=>consoleEvents.push({level:key,text:x.join(' ')});
const variants=[{name:'canonical',period:5,threshold:50},{name:'changed',period:7,threshold:60,timeframeRisk:true}];
const receipts=[];
try {
  for(const variant of variants){
    const dir=path.join(out,variant.name);fs.mkdirSync(path.join(dir,'config'),{recursive:true});fs.mkdirSync(path.join(dir,'foundation'));
    const settings=JSON.parse(fs.readFileSync(path.join(clone,'config/settings.json')));
    settings.filters.atrEnabled=false;
    settings.strategies.RSI.period=variant.period;settings.strategies.RSI.exitAbove=variant.threshold;
    if(variant.timeframeRisk)settings.exitContracts.RSI.timeframes={'15m':{stopLossPercent:-1.2,takeProfitPercent:1.4}};
    fs.writeFileSync(path.join(dir,'config/settings.json'),JSON.stringify(settings,null,2)+'\n',{flag:'wx'});
    fs.writeFileSync(path.join(dir,'config/internals.json'),fs.readFileSync(path.join(clone,'config/internals.json')),{flag:'wx'});
    // Each variant is its own isolated process-local module graph.
    for(const key of Object.keys(require.cache))if(key.startsWith(clone+path.sep))delete require.cache[key];
    const filename=path.join(dir,'foundation/ConfigLoader.js'),m=new Module(filename,module);
    m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename)).concat(Module._nodeModulePaths(root));
    const requireActual=m.require.bind(m);m.require=name=>name==='../core/AtomicWrite'?require(path.join(clone,'core/AtomicWrite')):requireActual(name);
    m._compile(fs.readFileSync(path.join(clone,'foundation/ConfigLoader.js'),'utf8'),filename);
    const loader=m.exports;loader.load({loadDotenv:false,silent:true});
    const loaderPath=path.join(clone,'foundation/ConfigLoader.js');
    require.cache[loaderPath]={id:loaderPath,filename:loaderPath,loaded:true,exports:loader};
    const {StrategyOrchestrator}=require(path.join(clone,'core/StrategyOrchestrator'));
    const {getInstance}=require(path.join(clone,'core/ExitContractManager'));
    const ecm=getInstance(),engine=new (require(path.join(clone,'core/indicators/IndicatorEngine')))({...loader.get('indicators.engine'),symbol:'TSLA',tf:'15m'});
    const orch=new StrategyOrchestrator({mtfBaseTimeframe:'15m'});
    orch.strategies=orch.strategies.filter(s=>s.name==='RSI');assert.equal(orch.strategies.length,1);
    const entries=[],errors=[],exits=[];
    for(let i=0;i<candles.length;i++){
      const frame=engine.updateCandle(candles[i]);
      try{
        const result=orch.evaluate(frame.indicators,[],null,candles.slice(0,i+1),{symbol:'TSLA',timeframe:'15m',price:candles[i].c});
        if(result.action==='BUY')entries.push({index:i,action:result.action,contract:result.exitContract});
      }catch(error){errors.push({index:i,message:error.message});}
    }
    if(label!=='baseline'){
      assert.equal(errors.length,0,JSON.stringify(errors));assert.ok(entries.length>0);
      for(const entry of entries){
        assert.equal(entry.contract.rsiPeriod,variant.period);assert.equal(entry.contract.rsiExitLong,variant.threshold);
        assert.equal(entry.contract.stopLossPercent,variant.timeframeRisk?-1.2:-0.8);
        assert.equal(entry.contract.takeProfitPercent,variant.timeframeRisk?1.4:1);
        const trade={direction:'long',action:'BUY',entryStrategy:'RSI',exitContract:entry.contract};
        for(const delta of [-1,0,1]){
          const result=ecm.checkInvalidationConditions(entry.contract.invalidationConditions,trade,{['rsi'+variant.period]:variant.threshold+delta});
          assert.equal(result.triggered,delta>0);exits.push({entryIndex:entry.index,rsi:variant.threshold+delta,result});
        }
      }
      const rsi2=ecm.createExitContract('RSI2MeanReversion',{rsiPeriod:2,rsiExitLong:80},{timeframe:'15m',volatility:0});
      assert.equal(ecm.checkInvalidationConditions(['rsi2_exit_long'],{direction:'long',exitContract:rsi2},{rsi2:80}).triggered,true);
    }
    const policies=entries.map(entry=>({index:entry.index,policy:require(path.join(clone,'core/PolicyBuilder')).buildForTrade({
      strategyName:'RSI',exitContract:entry.contract,nowMs:0,volatility:0.5,confidence:0.7,marketCondition:'normal',entryDirection:'long',mtfConfluenceSnapshot:null
    })}));
    const prematureEntries=entries.filter(entry=>entry.index<settings.strategies.RSI.regimeMaFilter.period-1).map(entry=>entry.index);
    let hot=null;
    if(label==='final'||label==='cold'){
      const beforeContracts=JSON.stringify(entries),saves=[];
      const save=changes=>{
        const view=loader.getSettingsView(),result=loader.saveSettings({requestId:'rsi-'+saves.length,
          expectedRevision:view.configuration.settings,expectedSettingsHash:view.configuration.settingsHash,changes});
        saves.push({changes,result});return result;
      };
      const newPeriod=variant.period+2,newThreshold=variant.threshold+5;
      const changes={'strategies.RSI.period':newPeriod,'strategies.RSI.buyBelow':40,'strategies.RSI.exitAbove':newThreshold,
        'strategies.RSI.regimeMaFilter.enabled':false,'strategies.RSI.regimeMaFilter.period':50,'strategies.RSI.regimeMaFilter.timeframe':'trading'};
      assert.equal(save(changes).applied,true);
      const hotEntries=[],hotEngine=new (require(path.join(clone,'core/indicators/IndicatorEngine')))({...loader.get('indicators.engine'),symbol:'TSLA',tf:'15m'});
      for(let i=0;i<candles.length;i++){
        const frame=hotEngine.updateCandle(candles[i]);
        const result=orch.evaluate(frame.indicators,[],null,candles.slice(0,i+1),{symbol:'TSLA',timeframe:'15m',price:candles[i].c});
        if(result.action==='BUY'){
          assert.equal(result.exitContract.rsiPeriod,newPeriod);assert.equal(result.exitContract.rsiExitLong,newThreshold);
          hotEntries.push({index:i,contract:result.exitContract});
        }
      }
      assert.ok(hotEntries.length>0);assert.equal(JSON.stringify(entries),beforeContracts);
      const identity=loader.getSettingsView().configuration.fingerprint;
      assert.equal(save({'strategies.RSI.period':2.5}).reason,'invalid_setting_value');
      assert.equal(save({'strategies.RSI.buyBelow':90}).reason,'rsi_buy_must_be_below_exit');
      assert.equal(save({'strategies.RSI.exitAbove':0}).reason,'invalid_setting_value');
      assert.equal(save({'strategies.RSI.regimeMaFilter.timeframe':'5m'}).reason,'invalid_setting_value');
      assert.equal(loader.getSettingsView().configuration.fingerprint,identity);
      // Real 1h recorded bars through the existing per-symbol MTF adapter.
      // This checks consumption of delivered bars, not production acquisition.
      const hourRaw=fs.readFileSync(path.join(root,'tuning/tsla-1h-2y.json')),hourBars=JSON.parse(hourRaw).slice(0,220);
      const adapter=orch._getSymbolStrategyModule('MtfConfluenceService','TSLA',orch.mtfAdapter,
        ()=>new (require(path.join(clone,'modules/MultiTimeframeAdapter')))(orch._buildMtfAdapterConfig()));
      for(const bar of hourBars)adapter.ingestCandle(bar,'1h');
      const IndicatorCalculator=require(path.join(clone,'core/IndicatorCalculator')).IndicatorCalculator;
      const frameObservations=[];
      for(const tf of ['trading','1h','4h']){
        assert.equal(save({'strategies.RSI.regimeMaFilter.enabled':true,'strategies.RSI.regimeMaFilter.timeframe':tf}).applied,true);
        orch.evalCount++;orch.mtfEvaluationCache=null;
        const ctx={indicators:{},priceHistory:candles.map(bar=>({...bar,timeframe:'15m'})),extras:{symbol:'TSLA',timeframe:'15m'}};
        const result=orch._resolveRsiRegimeMa(ctx,loader.get('strategies.RSI.regimeMaFilter'));
        if(tf==='4h'){assert.equal(result.allowed,false);assert.equal(result.reason,'regime_ma_unavailable');}
        else assert.equal(result.ma,IndicatorCalculator.calculateSMA(tf==='1h'?adapter.getCandles('1h'):ctx.priceHistory,50));
        frameObservations.push({timeframe:tf,result});
      }
      // Exact full exit coordinator, using real later price/history where the
      // RSI crossing precedes stop/hold. No order placement or state mutation.
      const coordinatorExits=[];
      for(const entry of entries){
        for(let i=entry.index+1;i<candles.length;i++){
          const history=candles.slice(0,i+1),rsi=IndicatorCalculator.calculateRSI(history,entry.contract.rsiPeriod);
          const entryPrice=candles[entry.index].c,currentPrice=candles[i].c;
          const pnl=(currentPrice-entryPrice)/entryPrice*100,held=(candles[i].t-candles[entry.index].t)/60000;
          if(held>=entry.contract.maxHoldTimeMinutes||pnl<=entry.contract.stopLossPercent)break;
          if(rsi>entry.contract.rsiExitLong){
            const result=ecm.checkExitConditions({id:'fixture-'+entry.index,direction:'long',entryStrategy:'RSI',entryPrice,
              entryTime:candles[entry.index].t,exitContract:entry.contract},currentPrice,{currentTime:candles[i].t,indicators:{},priceHistory:history});
            assert.equal(result.exitReason,'invalidation');assert.equal(result.shouldExit,true);
            coordinatorExits.push({entryIndex:entry.index,exitIndex:i,rsi,result});break;
          }
        }
      }
      assert.ok(coordinatorExits.length>0);
      assert.equal(JSON.stringify(entries),beforeContracts);
      // Explicit non-market fixture tests the 4h delivery boundary. It is not
      // aggregated from 1h bars and is not claimed to be provider data.
      const fourHourBars=Array.from({length:60},(_,i)=>({t:Date.UTC(2020,0,1)+i*4*3600000,o:100+i,h:102+i,l:99+i,c:101+i,v:1000}));
      for(const bar of fourHourBars)adapter.ingestCandle(bar,'4h');
      orch.evalCount++;orch.mtfEvaluationCache=null;
      const fourHourContext={indicators:{},priceHistory:fourHourBars.map(bar=>({...bar,timeframe:'4h'})),extras:{symbol:'TSLA',timeframe:'4h'}};
      const fourHourResult=orch._resolveRsiRegimeMa(fourHourContext,loader.get('strategies.RSI.regimeMaFilter'));
      assert.equal(fourHourResult.allowed,true);
      assert.equal(fourHourResult.ma,IndicatorCalculator.calculateSMA(adapter.getCandles('4h'),50));
      const legacyEntry=entries[0];
      const legacyTrade={id:'fixture-legacy',entryStrategy:'RSI',direction:'long',entryPrice:candles[legacyEntry.index].c,
        entryTime:0,entryOrderQuantity:1,remainingOrderQuantity:1};
      const legacyResult=ecm.checkExitConditions(legacyTrade,legacyTrade.entryPrice,{currentTime:241*60000,indicators:{},priceHistory:candles});
      assert.equal(legacyResult.shouldExit,true);assert.match(legacyResult.exitReason,/^max_hold_/);
      const coldModule=new Module(filename,module);coldModule.filename=filename;coldModule.paths=m.paths;
      const coldRequire=coldModule.require.bind(coldModule);
      coldModule.require=name=>name==='../core/AtomicWrite'?require(path.join(clone,'core/AtomicWrite')):coldRequire(name);
      coldModule._compile(fs.readFileSync(path.join(clone,'foundation/ConfigLoader.js'),'utf8'),filename);
      const coldSnapshot=coldModule.exports.load({loadDotenv:false,silent:true});
      assert.equal(coldSnapshot.fingerprint,loader.getSettingsView().configuration.fingerprint);
      hot={saves,entries:hotEntries,oldContractsUnchanged:true,coordinatorExits,frameObservations,
        coldFingerprint:coldSnapshot.fingerprint,
        fourHourDelivered:{boundary:'synthetic delivered 4h bars in isolated adapter, not broker data or aggregation',bars:fourHourBars.length,result:fourHourResult},
        legacyMissingContract:{boundary:'isolated explicit missing-contract input; inherited current-default adoption, not certified restore behavior',result:legacyResult,
          adoptedRsiPeriod:legacyTrade.exitContract.rsiPeriod??null,adoptedRsiThreshold:legacyTrade.exitContract.rsiExitLong??null},
        hourlyInput:{path:'tuning/tsla-1h-2y.json',sha256:hash(hourRaw),deliveredBars:hourBars.length}};
    }
    receipts.push({variant,configuration:loader.getSettingsView().configuration,settingsSha256:hash(fs.readFileSync(path.join(dir,'config/settings.json'))),entries,errors,exits,policies,prematureEntries,hot});
  }
}finally{Object.assign(console,original);}
const receipt={at:new Date().toISOString(),boundary:'Actual full StrategyOrchestrator.evaluate, IndicatorEngine and ExitContractManager creation/invalidation; real recorded candles, isolated RSI registration; no order, running bot, live UI or broker acceptance',
  sources,input:{path:'tuning/tsla-15m-tiny.json',sha256:hash(rawInput),candles:candles.length},receipts};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(consoleEvents,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({receipt:path.relative(root,path.join(out,'receipt.json')),variants:receipts.map(r=>({name:r.variant.name,entries:r.entries.length,errors:r.errors.length,exitObservations:r.exits.length,firstError:r.errors[0]}))}));
if(label==='final'||label==='cold')for(const result of receipts){
  assert.equal(result.prematureEntries.length,0);
  for(const record of result.policies){
    assert.equal(record.policy.contract.rsiPeriod,result.variant.period);
    assert.equal(record.policy.contract.rsiExitLong,result.variant.threshold);
    assert.equal(Object.isFrozen(record.policy.contract),true);
  }
}
