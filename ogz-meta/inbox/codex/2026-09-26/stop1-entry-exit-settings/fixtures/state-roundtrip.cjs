'use strict';
// Actual StateManager constructor/save/load and ECM, confined to disposable
// settings and state. No broker, dashboard socket, bot boot or real positions.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../../../..'), packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const out = fs.mkdtempSync(path.join(packet, 'private/state-roundtrip-'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sourcePaths = ['foundation/ConfigLoader.js', 'core/StateManager.js', 'core/ExitContractManager.js', 'core/PolicyBuilder.js', 'core/AtomicWrite.js'];
const sources = Object.fromEntries(sourcePaths.map(file => [file, hash(fs.readFileSync(path.join(clone, file)))]));
const logs = [], original = { ...console };
for (const key of ['log', 'warn', 'error']) console[key] = (...args) => logs.push({ level: key, text: args.join(' ') });
const inputPath = process.argv[2] || path.join(packet, 'private/candidate-3iRKCC/receipt.json');
const input = JSON.parse(fs.readFileSync(inputPath));
let result;
try {
  fs.mkdirSync(path.join(out, 'config')); fs.mkdirSync(path.join(out, 'foundation'));
  const settings = JSON.parse(fs.readFileSync(path.join(clone, 'config/settings.json')));
  const internals = JSON.parse(fs.readFileSync(path.join(clone, 'config/internals.json')));
  internals.paths.dataDir = out; internals.paths.stateFile = path.join(out, 'state.json');
  internals.paths.journalDataDir = path.join(out, 'journal'); internals.paths.logDirectory = path.join(out, 'logs');
  fs.writeFileSync(path.join(out, 'config/settings.json'), JSON.stringify(settings), { flag: 'wx' });
  fs.writeFileSync(path.join(out, 'config/internals.json'), JSON.stringify(internals), { flag: 'wx' });
  Object.assign(process.env, { PROFILE: 'paper', WEBSOCKET_AUTH_TOKEN: 'fixture-no-network', ALPACA_API_KEY: 'PKfixture-no-network', ALPACA_API_SECRET: 'fixture-no-network' });
  function compile(file, target, replacements) {
    const m = new Module(target, module); m.filename = target;
    m.paths = Module._nodeModulePaths(path.dirname(file)).concat(Module._nodeModulePaths(root));
    const actual = m.require.bind(m); m.require = name => Object.hasOwn(replacements, name) ? replacements[name] : actual(name);
    m._compile(fs.readFileSync(file, 'utf8'), target); return m.exports;
  }
  const loader = compile(path.join(clone, 'foundation/ConfigLoader.js'), path.join(out, 'foundation/ConfigLoader.js'), {
    '../core/AtomicWrite': require(path.join(clone, 'core/AtomicWrite')),
  });
  loader.load({ loadDotenv: false, silent: true });
  assert.equal(loader.get('paths.stateFile'), internals.paths.stateFile);
  assert.equal(loader.get('paths.dataDir'), out);
  assert.equal(loader.get('mode.backtest'), false);
  assert.equal(loader.get('backtest.freshStart'), false);
  const loaderPath = path.join(clone, 'foundation/ConfigLoader.js');
  require.cache[loaderPath] = { id: loaderPath, filename: loaderPath, loaded: true, exports: loader };
  const { StateManager } = compile(path.join(clone, 'core/StateManager.js'), path.join(clone, 'core/StateManager.js'), {
    './TradeNarrator': { getNarrator: () => ({ enabled: false }) },
  });
  const manager = new StateManager();
  const ecm = require(path.join(clone, 'core/ExitContractManager')).getInstance();
  const { buildPolicyHash } = require(path.join(clone, 'core/dto/FrozenExitPolicy'));
  const trades = [];
  for (const legacy of [false, true]) for (const direction of ['long', 'short']) {
    const policy = JSON.parse(JSON.stringify(input.oldPolicy));
    if (legacy) { delete policy.profitManagement.trail; policy.policyHash = buildPolicyHash(policy); }
    const id = `fixture-${legacy ? 'legacy' : 'current'}-${direction}`;
    const trade = { id, orderId: id, symbol: 'TSLA', brokerId: 'alpaca', accountId: 'fixture-account', accountIdSource: 'fixture',
      assetClass: 'stocks', executionMode: 'paper', timeframe: '15m', action: direction === 'long' ? 'BUY' : 'SELL_SHORT', direction,
      entryPrice: 100, entryTime: 1000000, sizeUsd: 100, size: 100, entryOrderQuantity: 1, remainingOrderQuantity: 1,
      entryOrderQuantityUnit: 'shares', remainingOrderQuantityUnit: 'shares', entryStrategy: 'TimeSeriesMomentum',
      exitContract: input.oldPolicy.contract, frozenExitPolicy: policy, tradeRevision: 0,
      beScaleOutState: { status: 'idle', intentId: null, targetQuantity: null, filledQuantity: 0, brokerOrderIds: [] }, tierStates: [] };
    assert.deepEqual(manager._activeTradeIdentityIssuesForTrade(trade, id), []);
    assert.deepEqual(manager._activeTradeQuantityIssuesForTrade(trade, id), []);
    trades.push([id, trade]);
  }
  manager.state.activeTrades = new Map(trades); manager.state.isTrading = true;
  const saveResult = manager.save(); assert.equal(saveResult.success, true);
  const diskBefore = fs.readFileSync(internals.paths.stateFile);
  const configuration = loader.getSettingsView().configuration;
  const change = loader.saveSettings({ requestId: 'state-roundtrip-config', expectedRevision: configuration.settings, expectedSettingsHash: configuration.settingsHash,
    changes: { 'exitLogic.trail.atrMultiplier': 4, 'exitLogic.breakEvenStop.triggerPercent': 0.1 } });
  assert.equal(change.applied, true);
  const restored = new StateManager(); assert.equal(restored.state.activeTrades.size, 4);
  assert.equal(restored.state.quarantinedTrades.length, 0); assert.equal(restored.state.isTrading, true);
  const rows = [];
  for (const [id, before] of trades) {
    const after = restored.state.activeTrades.get(id);
    assert.deepEqual(after.frozenExitPolicy, before.frozenExitPolicy);
    const price = before.direction === 'long' ? 102 : 98, context = { currentTime: 1060000, intentId: id + '-exit', symbol: 'TSLA', indicators: { atr: 1 } };
    const oldResult = ecm.checkExitConditions(structuredClone(before), price, context);
    const newResult = ecm.checkExitConditions(structuredClone(after), price, context);
    assert.deepEqual(newResult, oldResult);
    if (id.includes('legacy')) assert.equal(newResult.profitStopUpdate?.trailing.reason, 'missing_entry_trail_policy', JSON.stringify(newResult));
    rows.push({ id, policyHash: after.frozenExitPolicy.policyHash, before: oldResult, after: newResult,
      restoredPolicyFrozen: Object.isFrozen(after.frozenExitPolicy), trailPresent: Object.hasOwn(after.frozenExitPolicy.profitManagement, 'trail') });
  }
  const saveAgain = restored.save(); assert.equal(saveAgain.success, true);
  result = { at: new Date().toISOString(), boundary: 'Actual StateManager save/load on disposable fixture state; four synthetic independent records, not real trades or bot boot. Narrator inert. Existing load does not re-freeze policy objects; values and hash retention checked, not mutation-proof restoration.',
    sources, input: { path: path.relative(root, inputPath), sha256: hash(fs.readFileSync(inputPath)) }, saveResult, saveAgain,
    stateBeforeSha256: hash(diskBefore), stateAfterSha256: hash(fs.readFileSync(internals.paths.stateFile)), rows, settingsChange: change };
} catch (error) {
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, sources }, null, 2), { flag: 'wx' });
  throw error;
} finally {
  Object.assign(console, original); fs.writeFileSync(path.join(out, 'console.json'), JSON.stringify(logs, null, 2), { flag: 'wx' });
}
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ receipt: path.relative(root, path.join(out, 'receipt.json')), restoredRecords: result.rows.length, identicalExitResults: true, runningBot: false }));
