'use strict';

// Candidate-only proof for strategy-owned exit volatility return lookbacks.
// Every candidate source dependency is loaded from Git; the only settings read
// or write is a private fixture copy. No broker, PM2, network, or state-store
// operation is invoked.
//
// Usage:
// node ogz-meta/inbox/codex/2026-10-13/stop1-exit-consumers/behavior-proof.cjs --candidate-ref=<treeish>

const assert = require('assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '../../../../..');
const candidateRef = process.argv.find(value => value.startsWith('--candidate-ref='))?.slice('--candidate-ref='.length);
if (!candidateRef) throw new Error('Pass --candidate-ref=<treeish>; this fixture never treats the dirty worktree as candidate source.');

process.env.PROFILE = 'paper';
process.env.LIVE_TRADING = 'false';
process.env.CONFIRM_LIVE_TRADING = 'false';
process.env.EVAL_RULES_ENABLED = 'false';
process.env.TTP_RULES_ENABLED = 'false';
process.env.DOTENV_CONFIG_PATH = path.join(__dirname, 'private', 'nonexistent.env');
process.env.ALPACA_API_KEY = 'fixture-alpaca-key';
process.env.ALPACA_API_SECRET = 'fixture-alpaca-secret';
process.env.KRAKEN_API_KEY = 'fixture-kraken-key';
process.env.KRAKEN_API_SECRET = 'fixture-kraken-secret';
process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-dashboard-auth-token';

const privateRoot = path.join(__dirname, 'private');
fs.mkdirSync(privateRoot, { recursive: true });
const privateDir = fs.mkdtempSync(path.join(privateRoot, 'volatility-lookback-'));
const privateSettings = path.join(privateDir, 'settings.json');
const nativeLoad = Module._load;
const nativeReadFileSync = fs.readFileSync;
const sourceCache = new Map();
const candidateSettingsPath = path.join(root, 'config/settings.json');
const candidateInternalsPath = path.join(root, 'config/internals.json');
const candidateConfigLoaderPath = path.join(root, 'foundation/ConfigLoader.js');
const candidateAtomicWritePath = path.join(root, 'core/AtomicWrite.js');
let privateWriteCount = 0;

function candidateSource(relativePath) {
  if (sourceCache.has(relativePath)) return sourceCache.get(relativePath);
  const source = childProcess.execFileSync('git', ['show', `${candidateRef}:${relativePath}`], { cwd: root, encoding: 'utf8' });
  sourceCache.set(relativePath, source);
  return source;
}

const initialSettings = JSON.parse(candidateSource('config/settings.json'));
initialSettings.strategies.TimeSeriesMomentum.atrPeriod = 3;
Object.assign(initialSettings.exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment,{enabled:true,lookbackPeriods:3,lowThresholdPercent:0.01,highThresholdPercent:2});
fs.writeFileSync(privateSettings, `${JSON.stringify(initialSettings, null, 2)}\n`, 'utf8');

fs.readFileSync = function candidateSettingsRead(file, ...args) {
  const resolved = typeof file === 'string' ? path.resolve(file) : '';
  if (resolved === candidateSettingsPath) return nativeReadFileSync.call(this, privateSettings, ...args);
  if (resolved === candidateInternalsPath) {
    const value = Buffer.from(candidateSource('config/internals.json'));
    return typeof args[0] === 'string' || args[0]?.encoding ? value.toString() : value;
  }
  return nativeReadFileSync.call(this, file, ...args);
};

Module._load = function candidateTreeLoad(request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved === candidateAtomicWritePath && parent?.filename === candidateConfigLoaderPath) {
    return {
      writeJsonAtomic(targetPath, value) {
        assert.equal(targetPath, candidateSettingsPath, 'ConfigLoader may write only its canonical private settings target');
        fs.writeFileSync(privateSettings, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        privateWriteCount += 1;
      },
    };
  }
  const relative = typeof resolved === 'string' ? path.relative(root, resolved) : '';
  if (!relative || relative.startsWith('..') || relative.startsWith('node_modules/') || path.isAbsolute(relative)
    || (!relative.endsWith('.js') && !relative.endsWith('.cjs') && !relative.endsWith('.json'))) {
    return nativeLoad.apply(this, arguments);
  }
  if (require.cache[resolved]) return require.cache[resolved].exports;
  const candidate = new Module(resolved, parent);
  candidate.filename = resolved;
  candidate.paths = Module._nodeModulePaths(path.dirname(resolved));
  require.cache[resolved] = candidate;
  try {
    if (relative.endsWith('.json')) candidate.exports = JSON.parse(candidateSource(relative));
    else candidate._compile(candidateSource(relative), resolved);
    return candidate.exports;
  } catch (error) {
    delete require.cache[resolved];
    throw error;
  }
};

function candles() {
  return Array.from({ length: 205 }, (_, index) => {
    const close = 100 + (index * 0.2);
    const halfRange = index === 202 ? 2 : index === 203 ? 4 : index === 204 ? 8 : 0.5;
    return { open: close - 0.1, high: close + halfRange, low: close - halfRange, close, volume: 1000 + index };
  });
}

function approx(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${label}: expected ${expected}, got ${actual}`);
}

function saveRequest(view, changes) {
  return {
    requestId: 'volatility-lookback-next-entry',
    expectedRevision: view.configuration.settings,
    expectedSettingsHash: view.configuration.settingsHash,
    changes,
  };
}

function buildPolicy(PolicyBuilder, ConfigLoader, contract, confidence) {
  return PolicyBuilder.buildForTrade({
    strategyName: 'TimeSeriesMomentum',
    exitContract: contract,
    nowMs: Date.parse('2026-10-12T12:00:00.000Z'),
    volatility: 1,
    confidence,
    marketCondition: 'normal',
    entryDirection: 'long',
    configReader: ConfigLoader,
  });
}

try {
  const ConfigLoader=require(candidateConfigLoaderPath);
  ConfigLoader.load({role:'bot',silent:true,loadDotenv:false});
  const PolicyBuilder=require(path.join(root,'core/PolicyBuilder'));
  const {IndicatorCalculator}=require(path.join(root,'core/IndicatorCalculator'));
  const {assertExplicitExitOwnership}=require(path.join(root,'core/dto/ExitContractOwnership'));
  const {ExitContractManager}=require(path.join(root,'core/ExitContractManager'));
  const manager=new ExitContractManager();
  const history=candles();
  [100,120,80,100,101,102,103].forEach((close,i)=>{history[history.length-7+i]={open:close,high:close+1,low:close-1,close,volume:1000};});
  const source=candidateSource('core/OrderExecutor.js');
  const start=source.indexOf('    const entryStrategy = orchResult.winnerStrategy;',source.indexOf('  _buildEntryPlan('));
  const end=source.indexOf('    const scope = this._runtimeScope(',start);
  assert.ok(start>0 && end>start);
  const produce=new Function('orchResult','decision','tradeConfidence','entryVolatility','symbol','timeframe','PolicyBuilder','assertExplicitExitOwnership','IndicatorCalculator','getPIDController',source.slice(start,end)+'\nreturn {exitContract,frozenExitPolicy};');
  const queries=[];
  const receiver={ctx:{runner:{getSymbolTimeframeContext(symbol,timeframe){queries.push([symbol,timeframe]);assert.equal(symbol,'TSLA');assert.equal(timeframe,'15m');return {priceHistory:history};}}}};
  const build=()=>{
    const contract=manager.createExitContract('TimeSeriesMomentum',{atrPeriod:3,stopType:'atr',atrStopMult:2,trailType:'atr',trailAtrMult:2,stopLossPercent:-1},{timeframe:'15m',volatility:1});
    return produce.call(receiver,{winnerStrategy:'TimeSeriesMomentum',sizingMultiplier:1,exitContract:contract},{action:'BUY'},0.8,999,'TSLA','15m',PolicyBuilder,assertExplicitExitOwnership,IndicatorCalculator,require(path.join(root,'core/PIDController')).getPIDController);
  };
  const first=build();
  const factor=x=>x.frozenExitPolicy.profitManagement.tieredExit.adjustment.volatilityTargetFactor;
  const baseline=process.argv.includes('--baseline');
  if(baseline){assert.notEqual(factor(first),0.8,'baseline ignores selected return window and uses supplied ATR alias');}
  else {
    assert.equal(factor(first),0.8,'three recent returns have low volatility');
    let view=ConfigLoader.getSettingsView();
    const key='exitContracts.TimeSeriesMomentum.profitManagement.volatilityAdjustment.lookbackPeriods';
    assert.equal(view.fields[key].unit,'returns');
    let saved=ConfigLoader.saveSettings(saveRequest(view,{[key]:5}));assert.equal(saved.success,true);
    ConfigLoader._resetForTest();ConfigLoader.load({role:'bot',silent:true,loadDotenv:false});
    const second=build();assert.equal(factor(second),1.4,'five returns include older swings and change tier targets');
    assert.equal(factor(first),0.8,'existing frozen target factor is unchanged');
    view=ConfigLoader.getSettingsView();saved=ConfigLoader.saveSettings(saveRequest(view,{[key]:1}));assert.equal(saved.success,true);
    ConfigLoader._resetForTest();ConfigLoader.load({role:'bot',silent:true,loadDotenv:false});
    const one=build();assert.equal(factor(one),0.8,'one return has true zero variance and remains valid');
    assert.equal(IndicatorCalculator.calculateVolatility(history,2),0);
    history.forEach(c=>Object.assign(c,{open:100,high:101,low:99,close:100}));
    const flat=build();assert.equal(factor(flat),0.8,'flat prices yield true zero volatility');
    assert.equal(queries.length,4,'every new policy reads its selected symbol/timeframe owner');
  }
  const result={pass:true,candidateRef,baselineMismatchReproduced:baseline,checks:baseline?['ignored-lookback baseline reproduced']:['actual entry producer reads selected-frame owner','private save/reload 3 to 5 changes real frozen tier factor from 0.8 to 1.4','existing policy unchanged','one-return and flat zero variance accepted without fabricated 0.02'],limits:['entry producer excerpt executed; broker and remainder of sizing not invoked'],privateWriteCount,brokerRequests:0,productionWrites:0,runtimeActivation:false};
  console.log(JSON.stringify(result));fs.writeFileSync(path.join(privateDir,'result.json'),JSON.stringify(result,null,2));
} finally {Module._load=nativeLoad;fs.readFileSync=nativeReadFileSync;}
