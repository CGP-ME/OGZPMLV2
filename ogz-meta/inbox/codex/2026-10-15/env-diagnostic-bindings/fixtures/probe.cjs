'use strict';
// Isolated function probes only: no candle loop, bot, broker or backtest is run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'tuning/pipeline-diagnostic.js'), 'utf8');
const parser = require(path.join(root, 'node_modules/@babel/parser'));
const ast = parser.parse(source, {sourceType:'script'});
const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader'));
const FeeModel = require(path.join(root, 'core/FeeModel'));
const snapshot = ConfigLoader.load({silent:true});
const bindings = source.slice(source.indexOf('const CANDLE_FILE ='), source.indexOf("console.log('='.repeat(70));"));
const capture = () => vm.runInNewContext(bindings + '\n({CANDLE_FILE,MIN_CONFIDENCE,INITIAL_BALANCE,POSITION_SIZE_PCT,CANDLE_TIMEFRAME,feeModel});', {
  ConfigLoader, require, path, projectRoot:root,
  process:{env:{CANDLE_FILE:'poison',MIN_CONFIDENCE:'99',INITIAL_BALANCE:'7',POSITION_SIZE_PCT:'90',CANDLE_TIMEFRAME:'poison',STOP_LOSS_PERCENT:'90',TAKE_PROFIT_PERCENT:'90',TIER1_TARGET:'90',FEES_PCT:'90'}}
});
const captured = capture();
assert.equal(captured.CANDLE_FILE, snapshot.config.backtest.candleDataFile);
assert.equal(captured.MIN_CONFIDENCE, snapshot.config.confidence.minTradeConfidence * 100);
assert.equal(captured.INITIAL_BALANCE, snapshot.config.startingBalance);
assert.equal(captured.POSITION_SIZE_PCT, snapshot.config.positionSizing.basePositionSize * 100);
assert.equal(captured.CANDLE_TIMEFRAME, snapshot.config.execution.candleTimeframe);
assert.equal(captured.feeModel.model, snapshot.config.fees.model);
assert.equal(capture().MIN_CONFIDENCE, captured.MIN_CONFIDENCE);
assert(!/process\.env\./.test(source), 'diagnostic must not read retired env inputs');
assert(!source.includes("ConfigLoader.get('exits"), 'retired global exit owner removed');
const functions = ast.program.body.filter(n=>n.type==='FunctionDeclaration' && ['executeEntry','executeExit','checkExit'].includes(n.id.name)).map(n=>source.slice(n.start,n.end)).join('\n');
const contracts = Object.values(snapshot.config.exitContracts);
const selected = contracts[0];
const context = vm.createContext({feeModel:null,selected,POSITION_SIZE_PCT:1});
vm.runInContext('let balance=10000, position=null, peakBalance=10000; const strategyStats={},entryReasons={},exitReasons={},trades=[];\n'+functions,context);
context.feeModel = new FeeModel({model:'percent',makerFee:0.001,takerFee:0.002,totalRoundTrip:0.003,perShare:0,minOrderFee:0});
vm.runInContext("executeEntry(100,70,0,'buy','SelectedStrategy',selected);",context);
assert(vm.runInContext('position.exitContract===selected',context), 'exact selected contract retained');
assert.equal(vm.runInContext('position.strategyName',context),'SelectedStrategy');
vm.runInContext("executeExit(110,'take_profit',10,1000);",context);
assert(Math.abs(vm.runInContext('trades[0].feeDollars',context)-0.32)<1e-10, 'percent model charges actual entry and exit notionals');
assert(Math.abs(vm.runInContext('trades[0].pnlPercent',context)-9.68)<1e-10);
context.feeModel = new FeeModel({model:'per_share_minimum',makerFee:0,takerFee:0,totalRoundTrip:0,perShare:0.01,minOrderFee:1});
vm.runInContext("executeEntry(100,70,2000,'sell','SelectedStrategy',selected); executeExit(90,'take_profit',10,3000);",context);
assert.equal(vm.runInContext('trades[1].feeDollars',context),2,'per-share minimum applies on both sides');
context.probeContract = {stopLossPercent:-2,takeProfitPercent:5,maxHoldTimeMinutes:300};
vm.runInContext("executeEntry(100,70,4000,'buy','ContractProbe',probeContract);",context);
assert.equal(vm.runInContext('checkExit(position,101,5000).shouldExit',context),false,'retired global tier must not force an exit');
assert.equal(vm.runInContext('checkExit(position,105,5000).reason',context),'take_profit');
assert.equal(vm.runInContext('checkExit(position,98,5000).reason',context),'stop_loss');
assert.equal(vm.runInContext('checkExit(position,100,4000+300*60000).reason',context),'max_hold');
for (const name of ['DonchianBreakout', 'TimeSeriesMomentum']) {
  context.probeContract = snapshot.config.exitContracts[name];
  vm.runInContext("executeEntry(100,70,4000,'buy','ContractProbe',probeContract);",context);
  assert.equal(vm.runInContext('checkExit(position,101,4000+10000*60000).shouldExit',context),false,name+' disabled target/hold must not exit');
}
assert(source.includes('orchResult.winnerStrategy, orchResult.exitContract'), 'entry uses actual orchestrator producer fields');
assert(source.includes('orchestrator.evaluate(indicators, [], null, priceHistory, extras)'), 'extras is fifth orchestrator argument');
const result = {pass:true,scope:'isolated config and consumer function probes; no historical candle loop executed',checks:['canonical configuration bindings ignore retired env','repeat bindings stable','exact selected strategy contract retained','percent fees on both notionals','per-share minimum on both orders','no global tier override','strategy stop/target/hold consumption','actual orchestrator output field and argument positions'],limitations:['Full standalone simulator execution not accepted by these probes','Backtesting remains outside this task']};
fs.writeFileSync(path.join(__dirname,'../verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
