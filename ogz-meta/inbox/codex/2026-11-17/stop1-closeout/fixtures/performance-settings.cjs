'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
process.env.PROFILE='paper';
for(const key of ['KRAKEN_API_KEY','KRAKEN_API_SECRET','ALPACA_API_KEY','ALPACA_API_SECRET','WEBSOCKET_AUTH_TOKEN'])process.env[key]='synthetic-stop1-fixture';
const loader=require(path.join(process.cwd(),'foundation/ConfigLoader'));
loader.load({role:'bot',loadDotenv:false,silent:true});
let sequence=0;
function save(changes){const {revisions}=loader.getCachedSnapshot();const result=loader.saveSettings({requestId:`performance-${++sequence}`,expectedRevision:revisions.settings,expectedSettingsHash:revisions.settingsHash,changes});assert.equal(result.success,true,result.reason);return result.configuration;}
const Analyzer=require(path.join(process.cwd(),'core/PerformanceAnalyzer'));
const analyzer=new Analyzer({...loader.get('performanceAnalysis'),...loader.get('internals.performanceAnalysis')});
const trade={entryPrice:100,exitPrice:102,profitable:true,pnl:2,holdTimeMin:15,direction:'buy',exitReason:'take_profit'};
const analysis={rsi:25,trend:'uptrend',patterns:[{confidence:0.8}]};
const before=analyzer.scoreTradeQuality(trade,analysis);
analyzer.state.tradeHistory.push({...trade,id:'retained-synthetic-trade'});
const history=analyzer.state.tradeHistory,historyBytes=JSON.stringify(history);
const configuration=save({'performanceAnalysis.entryQualityWeight':1,'performanceAnalysis.exitQualityWeight':0,
 'performanceAnalysis.patternAccuracyWeight':0,'performanceAnalysis.alertOnTradesBelow':0,
 'performanceAnalysis.minTradesForAnalysis':1,'performanceAnalysis.edgeDecayLookback':3,
 'performanceAnalysis.edgeDecayThreshold':0.1,'performanceAnalysis.recommendationInterval':2});
const after=analyzer.scoreTradeQuality(trade,analysis),expected=analyzer.scoreEntryQuality(trade,analysis)*100;
assert.equal(after,expected);
assert.equal(analyzer.state.tradeHistory,history);
assert.equal(JSON.stringify(history),historyBytes);
analyzer.state.totalTrades=1;
assert.notEqual(analyzer.detectEdgeDecay().message,'Not enough trades for edge decay analysis');
save({'performanceAnalysis.minTradesForAnalysis':2});
assert.equal(analyzer.detectEdgeDecay().message,'Not enough trades for edge decay analysis');
console.log('STOP1_PERFORMANCE_RECEIPT',JSON.stringify({configuration,before,after,expected,zeroWeightPreserved:true,historyIdentityPreserved:true,analysisMinimumAdopted:true}));
