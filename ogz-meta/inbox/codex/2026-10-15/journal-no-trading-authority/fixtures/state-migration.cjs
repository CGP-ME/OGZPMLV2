'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict'),cp=require('child_process');
const root=process.cwd(),temp=fs.mkdtempSync(path.join(__dirname,'state-'));let stateFile;
const original=Module._load,loader=path.join(root,'foundation/ConfigLoader.js'),narrator=path.join(root,'core/TradeNarrator.js');
Module._load=function(req,parent,main){const resolved=Module._resolveFilename(req,parent,main);if(resolved===loader)return{hasLoadedSnapshot:()=>true,load(){},getSource:()=> 'fixture',get:k=>({'mode.backtest':false,'backtest.freshStart':false,'mode.liveTrading':false,'mode.execution':'paper','paths.dataDir':temp,'paths.stateFile':stateFile,startingBalance:10000})[k]};if(resolved===narrator)return{getNarrator:()=>({enabled:false})};return original.call(this,req,parent,main)};
try{
 const file=path.join(root,'core/StateManager.js'),compiled=new Module(file,module);compiled.filename=file;compiled.paths=Module._nodeModulePaths(path.dirname(file));compiled._compile(process.env.REVIEW_TREE?cp.execFileSync('git',['show',process.env.REVIEW_TREE+':core/StateManager.js'],{encoding:'utf8'}):fs.readFileSync(file,'utf8'),file);const SM=compiled.exports.StateManager;
 for(const source of ['journal_persistence_down','dashboard_manual','session_router_wind_down']){
  stateFile=path.join(temp,source+'.json');const reason=source==='journal_persistence_down'?'[TradeJournalBridge] journal persistence failed 3 consecutive time(s); new entries halted until a journal write succeeds':'Deliberate '+source;
  fs.writeFileSync(stateFile,JSON.stringify({balance:10000,totalBalance:10000,activeTrades:[],lastPrices:{},pauseReason:reason,pauseSource:source,pausedAt:123,pauseRecoverable:true,lastError:reason,journalEvidence:{status:'failed',error:'ENOSPC'}}));
  const manager=new SM();assert.equal(manager.isPaused(),source!=='journal_persistence_down');assert.deepEqual(manager.get('journalEvidence'),{status:'failed',error:'ENOSPC'});
  if(source==='journal_persistence_down'){assert.equal(manager.get('pauseSource'),null);assert.equal(JSON.parse(fs.readFileSync(stateFile)).pauseReason,null);assert.equal(manager.get('lastError'),null)}
 }
 const result={pass:true,checks:['stored journal pause cleared without a journal write or resume call','manual and session pauses preserved','failure evidence preserved'],source:process.env.REVIEW_TREE||'working tree'};fs.writeFileSync(path.join(__dirname,'../migration-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{Module._load=original;fs.rmSync(temp,{recursive:true,force:true})}
