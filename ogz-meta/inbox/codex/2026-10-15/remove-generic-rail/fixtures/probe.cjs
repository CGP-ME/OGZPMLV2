'use strict';
const assert = require('assert');
const cp = require('child_process');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const acorn = require('acorn');
const root = cp.execFileSync('git', ['rev-parse','--show-toplevel'], {encoding:'utf8'}).trim();
const candidate = process.env.REVIEW_TREE || require('../candidate.json').candidate;
const read = f => cp.execFileSync('git',['show',`${candidate}:${f}`],{encoding:'utf8'});
const cache = new Map();
function compile(file) {
  if (cache.has(file)) return cache.get(file);
  const filename = path.join(root,file);
  const m = new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
  m.require = name => {
    if (name === 'fs') return {readFileSync(filePath) {
      const relative=path.relative(root,filePath);
      if (relative === 'fixtures/probe.env') return ['WEBSOCKET_AUTH_TOKEN=fixture-not-a-real-token', 'ALPACA_API_KEY=fixture', 'ALPACA_API_SECRET=fixture', 'KRAKEN_API_KEY=fixture', 'KRAKEN_API_SECRET=fixture'].join('\n');
      assert(['config/settings.json','config/internals.json'].includes(relative), `Unexpected filesystem read: ${relative}`);
      return read(relative);
    }};
    if (name === '../core/AtomicWrite') return {writeJsonAtomic() {assert.fail('Fixture must not write state or configuration');}};
    if (name.startsWith('.')) {
      const relative=path.relative(root,path.resolve(path.dirname(filename),name+'.js'));
      assert(['core/PnLTracker.js','core/DrawdownTracker.js'].includes(relative),`Unexpected production dependency: ${relative}`);
      return compile(relative);
    }
    assert(['crypto','dotenv','path'].includes(name),`Unexpected dependency: ${name}`);
    return require(name);
  };
  m._compile(read(file),filename);cache.set(file,m.exports);return m.exports;
}
const ConfigLoader=compile('foundation/ConfigLoader.js');
for (const profile of ['paper','production']) {
  const result=ConfigLoader.snapshot({PROFILE:profile,DOTENV_CONFIG_PATH:'fixtures/probe.env'});
  assert(!Object.hasOwn(result.config.risk,'guardMode'));
  assert(!Object.hasOwn(result.config.risk,'venueRailBuffer'));
  assert(Object.hasOwn(result.config.risk,'reconciliationReporter'));
  assert(!Object.keys(result.sources).some(k=>k.includes('venueRailBuffer')||k==='risk.guardMode'));
}
const before=JSON.parse(cp.execFileSync('git',['show',`${require('../candidate.json').base}:config/settings.json`],{encoding:'utf8'}));
const after=JSON.parse(read('config/settings.json'));
for(const [name,profile] of Object.entries(after.launchProfiles)) {
  if (!profile || typeof profile!=='object' || !profile.risk) continue;
  assert(!Object.hasOwn(profile.risk,'guardMode'));
  assert(!Object.hasOwn(profile.risk,'venueRailBuffer'));
  assert.deepStrictEqual(profile.venueGuards,before.launchProfiles[name].venueGuards);
}
const RiskManager=compile('core/RiskManager.js');
const manager=new RiskManager({enabled:true,alertDeltaDollars:1,alertDeltaPercent:null});
manager.initializeBalance(10000);manager.recordTradeResult({pnl:-300});
assert.strictEqual(typeof manager.isTradingAllowed,'undefined');
assert.strictEqual(typeof manager.assessTradeRisk,'undefined');
assert(!Object.hasOwn(manager.getRiskSummary(),'tradingAllowed'));
const report=manager.reportExternalLedgerDelta({balance:9695,source:'fixture'});
assert.strictEqual(report.deltaDollars,-5);assert.strictEqual(report.authority,'report_only');
// Extract only the actual method AST. Never import TradingLoop or its singleton dependencies.
const source=read('core/TradingLoop.js');
const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script'});
const cls=ast.body.find(n=>n.type==='ClassDeclaration'&&n.id.name==='TradingLoop');
const method=cls.body.body.find(n=>n.key.name==='_checkRiskAndBuildDecision');
const fn=vm.runInNewContext('('+source.slice(method.start,method.end).replace('_checkRiskAndBuildDecision','function')+')',{
 console, positionEffectFromAction:action=>({BUY:'open_long',SELL_SHORT:'open_short'})[action]
});
const context={_diag(){},ctx:{riskManager:manager}};
for(const [direction,action] of [['buy','BUY'],['sell','SELL_SHORT']]) {
  const result=fn.call(context,direction,{confidence:80,winnerStrategy:'fixture'},.5,.8);
  assert.strictEqual(result.action,action);
}
assert.strictEqual(fn.call(context,'buy',{confidence:NaN,winnerStrategy:'fixture'},.5,NaN).action,'HOLD');
manager.shutdown();
console.log('PASS pinned profiles/provenance, prop fields unchanged, loss reporting without rail latch, extracted actual buy/short decision method; no singleton imports or filesystem writes');
