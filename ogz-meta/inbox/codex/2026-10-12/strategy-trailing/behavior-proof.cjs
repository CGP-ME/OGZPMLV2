'use strict';

// Read-only behavior proof for the strategy trailing ownership change.
// Run from the repository root:
//   node ogz-meta/inbox/codex/2026-10-12/exit-take-profit/behavior-proof.cjs
// Or evaluate every repository dependency from an exact candidate Git tree:
//   node ogz-meta/inbox/codex/2026-10-12/exit-take-profit/behavior-proof.cjs --candidate-ref=<treeish>

const assert = require('assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');

process.env.BACKTEST_MODE = 'true';
process.env.EXECUTION_MODE = 'backtest';
process.env.INITIAL_BALANCE = '10000';
process.env.LIVE_TRADING = 'false';
process.env.CONFIRM_LIVE_TRADING = 'false';
process.env.EVAL_RULES_ENABLED = 'false';
process.env.TTP_RULES_ENABLED = 'false';
process.env.CANDLE_SOURCE = 'file';
process.env.BROKER = 'alpaca';
process.env.ALPACA_MODE = 'paper';
process.env.MAX_WEEKLY_LOSS = '5';
process.env.MAX_MONTHLY_LOSS = '5';
process.env.FRESH_START = 'false';
for (const key of ['WEBSOCKET_AUTH_TOKEN','ALPACA_API_KEY','ALPACA_API_SECRET','KRAKEN_API_KEY','KRAKEN_API_SECRET']) process.env[key] = 'isolated-fixture-not-a-credential';

const root = path.resolve(__dirname, '../../../../..');
const candidateRef = process.argv.find((value) => value.startsWith('--candidate-ref='))?.slice('--candidate-ref='.length);
const nativeLoad = Module._load;
const nativeReadFileSync = fs.readFileSync;
const candidateSourceCache = new Map();

function candidateSource(relativePath) {
  if (candidateSourceCache.has(relativePath)) return candidateSourceCache.get(relativePath);
  const source = childProcess.execFileSync('git', ['show', `${candidateRef}:${relativePath}`], {
    cwd: root,
    encoding: 'utf8',
  });
  candidateSourceCache.set(relativePath, source);
  return source;
}

function installCandidateTreeLoader() {
  if (!candidateRef) return;
  const candidateConfigFiles = new Set(['config/settings.json', 'config/internals.json']);
  fs.readFileSync = function candidateTreeRead(file, ...args) {
    const relative = typeof file === 'string' ? path.relative(root, path.resolve(file)) : '';
    if (candidateConfigFiles.has(relative)) {
      const value = Buffer.from(candidateSource(relative));
      return typeof args[0] === 'string' || args[0]?.encoding ? value.toString() : value;
    }
    return nativeReadFileSync.call(this, file, ...args);
  };
  Module._load = function candidateTreeLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    const relative = typeof resolved === 'string' ? path.relative(root, resolved) : '';
    if (!relative || relative.startsWith('..') || relative.startsWith('node_modules/') || path.isAbsolute(relative)) {
      return nativeLoad.apply(this, arguments);
    }
    if (!relative.endsWith('.js') && !relative.endsWith('.cjs') && !relative.endsWith('.json')) {
      return nativeLoad.apply(this, arguments);
    }
    if (require.cache[resolved]) return require.cache[resolved].exports;
    const candidate = new Module(resolved, parent);
    candidate.filename = resolved;
    candidate.paths = Module._nodeModulePaths(path.dirname(resolved));
    require.cache[resolved] = candidate;
    try {
      if (relative.endsWith('.json')) {
        candidate.exports = JSON.parse(candidateSource(relative));
      } else {
        candidate._compile(candidateSource(relative), resolved);
      }
      return candidate.exports;
    } catch (error) {
      delete require.cache[resolved];
      throw error;
    }
  };
}

installCandidateTreeLoader();
const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader'));
ConfigLoader.load({silent:true, loadDotenv:false});
const PolicyBuilder = require(path.join(root, 'core/PolicyBuilder'));
const {ExitContractManager} = require(path.join(root, 'core/ExitContractManager'));
const manager = new ExitContractManager();
function trade(direction) {
  const contract = structuredClone(ConfigLoader.get('exitContracts.EMATrendRetest'));
  contract.trailingActivation = 1.5;
  contract.trailingStopPercent = 1;
  const policy = PolicyBuilder.buildForTrade({strategyName:'EMATrendRetest',exitContract:contract,nowMs:1,
    volatility:1,confidence:.8,marketCondition:'normal',entryDirection:direction,configReader:ConfigLoader});
  return {id:'isolated-trail',entryPrice:100,direction,entryStrategy:'EMATrendRetest',
    currentStop: direction === 'long' ? 99 : 101, highestPrice:102,lowestPrice:98,
    exitContract:contract,frozenExitPolicy:policy};
}
const long=trade('long');
assert.equal(manager._updateTrailingStopState(long,101,1,{}).updated,false);
assert.equal(long.currentStop,99);
let r=manager._updateTrailingStopState(long,102,2,{});
assert.equal(r.updated,true);assert(Math.abs(long.currentStop-100.98)<1e-10);
const short=trade('short');
r=manager._updateTrailingStopState(short,98,2,{});
assert.equal(r.updated,true);assert(Math.abs(short.currentStop-98.98)<1e-10);
const stale=long.currentStop;
r=manager._updateTrailingStopState(long,101.8,1.8,{});
assert(long.currentStop>=stale);
const channel=trade('long');channel.exitContract.trailType='channel';
assert.equal(manager._updateTrailingStopState(channel,110,10,{}).reason,'channel_trail_owned_by_contract');
const report={pass:true,candidateRef,cases:['percent trail uses own activation','percent distance independent of missing ATR','long and short exact watermark stops','stop never loosened','channel remains separate'],runtimeActivation:false};
fs.writeFileSync(path.join(__dirname,'behavior-proof.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
