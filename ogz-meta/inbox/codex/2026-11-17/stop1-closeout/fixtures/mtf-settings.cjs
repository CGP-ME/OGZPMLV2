'use strict';
// Native reproduction in scripts/test-isolated.py; no host data or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
process.env.PROFILE = 'paper';
for (const name of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) {
  process.env[name] = 'synthetic-stop1-fixture';
}
const loader = require(path.join(root, 'foundation/ConfigLoader'));
loader.load({role: 'bot', loadDotenv: false, silent: true});
const {StrategyOrchestrator} = require(path.join(root, 'core/StrategyOrchestrator'));
const bot = new StrategyOrchestrator({mtfBaseTimeframe: loader.get('execution.candleTimeframe')});
let request = 0;
function save(changes) {
  const {revisions} = loader.getCachedSnapshot();
  const result = loader.saveSettings({requestId: `stop1-mtf-${++request}`, expectedRevision: revisions.settings,
    expectedSettingsHash: revisions.settingsHash, changes});
  assert.equal(result.success, true, JSON.stringify({reason: result.reason, path: result.path}));
  return result;
}
const fields = loader.getSettingsView().fields;
const restartGroups = {};
for (const [key, field] of Object.entries(fields)) {
  if (/restart/.test(field.effect)) (restartGroups[field.effect] ??= []).push(key);
}
const scope = {brokerId:'synthetic', accountId:'fixture', accountIdSource:'fixture', assetClass:'crypto', executionMode:'paper'};
const count = Math.max(70, loader.get('orchestrator.mtfAdapter.minCandlesForAnalysis') + 5);
const closed = {...scope, etime: 1800000000000};
for (const symbol of ['BTC-USD', 'ETH-USD']) {
  for (const timeframe of bot.mtfAdapter.config.activeTimeframes) {
    for (let i=0; i<count; i++) {
      const close = 100 + i + Math.sin(i)*3;
      bot.ingestMarketCandle(symbol, {...scope, symbol, timeframe, t: closed.etime-(count-i)*60000,
        etime: closed.etime-(count-i-1)*60000, o:close-0.5, h:close+1, l:close-1, c:close, v:100+i});
    }
  }
}
const timeframe = bot.mtfAdapter.config.activeTimeframes[0];
const old = bot.captureDecisionMtf('BTC-USD', closed);
const oldPeriod = loader.get('orchestrator.mtfAdapter.indicatorPeriods.smaFast');
const saved = save({'orchestrator.mtfAdapter.indicatorPeriods.smaFast': oldPeriod+3});
const after = bot.captureDecisionMtf('BTC-USD', closed);
const other = bot.captureDecisionMtf('ETH-USD', closed);
const history = after.candles[timeframe];
const expected = history.slice(-(oldPeriod+3)).reduce((sum, c) => sum+c.c, 0)/(oldPeriod+3);
const receipt = {scope:'existing symbol MTF adapters after actual ConfigLoader.saveSettings',
  configuration: saved.configuration, oldPeriod, newPeriod:loader.get('orchestrator.mtfAdapter.indicatorPeriods.smaFast'),
  before:old.indicators[timeframe].smaFast, after:after.indicators[timeframe].smaFast,
  otherSymbol:other.indicators[timeframe].smaFast, expected,
  candlesPreserved: JSON.stringify(old.candles)===JSON.stringify(after.candles),
  snapshotFrozen: old.indicators[timeframe].smaFast !== expected,
  remainingRestartGroups:Object.fromEntries(Object.entries(restartGroups).map(([group, keys])=>[group,keys.length]))};
console.log('STOP1_MTF_RECEIPT', JSON.stringify(receipt));
if (!process.argv.includes('--observe')) {
  assert.equal(after.indicators[timeframe].smaFast,expected);
  assert.equal(other.indicators[timeframe].smaFast,expected);
  assert.equal(receipt.candlesPreserved,true);
  assert.equal(receipt.snapshotFrozen,true);
  const periods = loader.get('orchestrator.mtfAdapter.indicatorPeriods');
  const replacements = {rsi:7, smaFast:5, smaSlow:20, ema:8, macdFast:6, macdSlow:18, atr:7, bollingerPeriod:10, bollingerStd:1.5};
  save(Object.fromEntries(Object.entries(replacements).map(([key,value])=>[`orchestrator.mtfAdapter.indicatorPeriods.${key}`,value])));
  const changed = bot.captureDecisionMtf('BTC-USD',closed);
  assert.notEqual(changed.indicators[timeframe].smaFast,after.indicators[timeframe].smaFast);
  const fresh = new StrategyOrchestrator({mtfBaseTimeframe:loader.get('execution.candleTimeframe')});
  for (const [frame, bars] of Object.entries(changed.candles)) for (const bar of bars) fresh.ingestMarketCandle('BTC-USD',bar);
  const recalculated = fresh.captureDecisionMtf('BTC-USD',closed);
  const withoutClock = snapshot => Object.fromEntries(Object.entries(snapshot.indicators).map(([frame,values])=> {
    const {timestamp,...indicators}=values; return [frame,indicators];
  }));
  assert.deepEqual(withoutClock(changed),withoutClock(recalculated));
  assert.deepEqual(old.candles,changed.candles);
  save(Object.fromEntries(Object.entries(periods).map(([key,value])=>[`orchestrator.mtfAdapter.indicatorPeriods.${key}`,value])));
  save({'orchestrator.mtfAdapter.minCandlesForAnalysis':count+1});
  assert.deepEqual(bot.captureDecisionMtf('BTC-USD',closed).indicators,{});
  bot.ingestMarketCandle('BTC-USD',history[history.length-1]);
  const retainedAdapter=bot._getMtfConfluenceAdapter('BTC-USD');
  assert.equal(retainedAdapter.readyTimeframes.size,0);
  assert.ok([...retainedAdapter.indicators.values()].every(value=>value===null));
  save({'orchestrator.mtfAdapter.minCandlesForAnalysis':count});
  assert.equal(bot.captureDecisionMtf('BTC-USD',closed).indicators[timeframe].smaFast,expected);
  bot.ingestMarketCandle('BTC-USD',history[history.length-1]);
  assert.equal(retainedAdapter.readyTimeframes.size,retainedAdapter.candles.size);
  const persisted = JSON.parse(fs.readFileSync(path.join(root,'config/settings.json'),'utf8'));
  assert.equal(persisted.orchestrator.mtfAdapter.indicatorPeriods.smaFast,oldPeriod+3);
  console.log('STOP1_MTF_RESULT',JSON.stringify({savedAdopted:true,existingSymbols:2,allNineIndicatorControls:true,readinessIncreaseAndDecrease:true,persisted:true}));
}
