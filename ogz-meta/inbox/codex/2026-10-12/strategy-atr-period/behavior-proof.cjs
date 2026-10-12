'use strict';

// Candidate-only proof for entry-owned ATR periods in the TSM trailing path.
// Every candidate source dependency is loaded from Git; the only settings read
// or write is a private fixture copy. No broker, PM2, network, or state-store
// operation is invoked.
//
// Usage:
// node ogz-meta/inbox/codex/2026-10-12/strategy-atr-period/behavior-proof.cjs --candidate-ref=<treeish>

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
const privateDir = fs.mkdtempSync(path.join(privateRoot, 'strategy-atr-period-'));
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
    requestId: 'strategy-atr-period-next-entry',
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
  const ConfigLoader = require(candidateConfigLoaderPath);
  const TimeSeriesMomentum = require(path.join(root, 'modules/TimeSeriesMomentum'));
  const { ExitContractManager } = require(path.join(root, 'core/ExitContractManager'));
  const PolicyBuilder = require(path.join(root, 'core/PolicyBuilder'));
  const { IndicatorCalculator } = require(path.join(root, 'core/IndicatorCalculator'));

  ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
  const history = candles();
  const price = history.at(-1).close;
  const entryConfig = ConfigLoader.get('strategies.TimeSeriesMomentum');
  const exitConfig = ConfigLoader.get('exitContracts.TimeSeriesMomentum');
  assert.equal(entryConfig.atrPeriod, 3, 'fixture-private entry setting supplies ATR period 3');

  const strategy = new TimeSeriesMomentum(entryConfig, exitConfig);
  const signal = strategy.evaluate({ priceHistory: history, indicators: { sma200: 100 } });
  assert.ok(signal, 'actual TSM evaluation yields a long trend signal from sufficient candles');
  assert.equal(signal.direction, 'buy', 'actual TSM signal is long');
  assert.equal(signal.exitContractHint.atrPeriod, 3, 'TSM producer emits its entry ATR period in exitContractHint');

  const manager = new ExitContractManager();
  const contract = manager.createExitContract(signal.strategy, signal.exitContractHint, { timeframe: '15m', volatility: 1 });
  assert.equal(contract.atrPeriod, 3, 'ECM carries the actual TSM entry hint into the contract');
  const policy = buildPolicy(PolicyBuilder, ConfigLoader, contract, signal.confidence);
  assert.equal(policy.contract.atrPeriod, 3, 'PolicyBuilder freezes the entry ATR period');
  assert.ok(Object.isFrozen(policy), 'entry policy is frozen');

  const expectedAtr3 = IndicatorCalculator.calculateATR(history, 3);
  const misleadingAtr = expectedAtr3 * 100;
  const trade = {
    direction: 'long',
    entryPrice: price * 0.9,
    highestPrice: price,
    currentStop: price * 0.1,
    exitContract: contract,
    frozenExitPolicy: policy,
  };
  const trailing = manager._updateTrailingStopState(trade, price, 10, {
    priceHistory: history,
    indicators: { atr: misleadingAtr, volatility: misleadingAtr, trend: 'neutral' },
  });
  assert.equal(trailing.updated, true, 'ATR trailing stop updates from entry-timeframe candles');
  const expectedDistance = (expectedAtr3 / price) * contract.trailAtrMult;
  approx(trailing.trailDistance, expectedDistance, 'trailing distance uses period-3 ATR times the contract trail multiplier');
  const impliedTrailingAtr = (trailing.trailDistance * price) / contract.trailAtrMult;
  approx(impliedTrailingAtr, expectedAtr3, 'computed trail distance implies ATR period 3 rather than the runtime indicator');
  assert.ok(Math.abs(impliedTrailingAtr - misleadingAtr) > 1, 'computed trailing distance disagrees with the misleading shared ATR indicator');
  approx(trailing.newStop, price * (1 - expectedDistance), 'long trailing stop uses entry-period ATR distance');

  const channelTrade = { ...trade, exitContract: { ...contract, trailType: 'channel' }, currentStop: 7 };
  const channel = manager._updateTrailingStopState(channelTrade, price, 10, { priceHistory: history, indicators: { atr: misleadingAtr } });
  assert.deepEqual(channel, { updated: false, reason: 'channel_trail_owned_by_contract' }, 'Donchian-style channel trailing remains outside ATR-period calculation');
  assert.equal(channelTrade.currentStop, 7, 'channel trailing leaves its stop untouched');

  const initialView = ConfigLoader.getSettingsView();
  const atrPath = 'strategies.TimeSeriesMomentum.atrPeriod';
  assert.ok(initialView.fields[atrPath]?.editable, 'TSM ATR period remains editable for the next entry');
  const saved = ConfigLoader.saveSettings(saveRequest(initialView, { [atrPath]: 5 }));
  assert.equal(saved.success, true, `private TSM ATR-period save: ${saved.reason || 'unknown failure'}`);
  assert.equal(privateWriteCount, 1, 'only one private canonical settings write occurs');

  ConfigLoader._resetForTest();
  ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
  assert.equal(policy.contract.atrPeriod, 3, 'existing frozen policy retains entry ATR period after later settings reload');
  const nextStrategy = new TimeSeriesMomentum(
    ConfigLoader.get('strategies.TimeSeriesMomentum'),
    ConfigLoader.get('exitContracts.TimeSeriesMomentum')
  );
  const nextSignal = nextStrategy.evaluate({ priceHistory: history, indicators: { sma200: 100 } });
  assert.ok(nextSignal, 'next TSM evaluation remains producible after private period change');
  assert.equal(nextSignal.exitContractHint.atrPeriod, 5, 'next signal emits the changed ATR period');
  const nextContract = manager.createExitContract(nextSignal.strategy, nextSignal.exitContractHint, { timeframe: '15m', volatility: 1 });
  const nextPolicy = buildPolicy(PolicyBuilder, ConfigLoader, nextContract, nextSignal.confidence);
  assert.equal(nextPolicy.contract.atrPeriod, 5, 'next entry policy uses the later ATR period');

  const receipt = {
    pass: true,
    candidateRef,
    privateSettings,
    privateWriteCount,
    initialEntryAtrPeriod: policy.contract.atrPeriod,
    nextEntryAtrPeriod: nextPolicy.contract.atrPeriod,
    expectedAtr3,
    impliedTrailingAtr,
    checks: [
      'actual TSM signal emits atrPeriod 3 in exitContractHint',
      'ECM and PolicyBuilder preserve atrPeriod 3 into the frozen entry policy',
      'ATR trailing uses entry-period candles and ignores misleading runtime ATR values',
      'channel trailing remains separately owned',
      'private later setting changes affect only the next TSM signal and policy',
    ],
    productionWrites: 0,
    brokerRequests: 0,
    runtimeActivation: false,
  };
  fs.writeFileSync(path.join(privateDir, 'behavior-proof.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt));
} finally {
  Module._load = nativeLoad;
  fs.readFileSync = nativeReadFileSync;
}
