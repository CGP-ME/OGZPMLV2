const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const repoRoot = process.cwd();
const candidateRoot = path.join(__dirname, 'candidate');
const actualReadFile = fs.readFileSync;
const canonicalFiles = new Map([
  [path.join(repoRoot, 'config/settings.json'), path.join(candidateRoot, 'config/settings.json')],
  [path.join(repoRoot, 'config/internals.json'), path.join(candidateRoot, 'config/internals.json')],
]);
fs.readFileSync = function (file, ...args) {
  const candidate = canonicalFiles.get(path.resolve(String(file)));
  return actualReadFile.call(this, candidate || file, ...args);
};
const candidateFiles = new Map([
  ['foundation/ConfigLoader.js', 'foundation/ConfigLoader.js'],
  ['core/PolicyBuilder.js', 'core/PolicyBuilder.js'],
  ['core/OrderExecutor.js', 'core/OrderExecutor.js'],
  ['core/StateManager.js', 'core/StateManager.js'],
  ['core/dto/DecisionLedgerSchema.js', 'core/dto/DecisionLedgerSchema.js'],
  ['core/TradingLoop.js', 'core/TradingLoop.js'],
]);
const actualLoad = Module._load;
const actualResolve = Module._resolveFilename;
Module._load = function (request, parent, isMain) {
  const filename = actualResolve.call(this, request, parent, isMain);
  const relative = path.relative(repoRoot, filename);
  const candidate = candidateFiles.get(relative);
  if (!candidate) return actualLoad.apply(this, arguments);
  if (require.cache[filename]) return require.cache[filename].exports;
  const mod = new Module(filename, parent);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = mod;
  mod._compile(fs.readFileSync(path.join(candidateRoot, candidate), 'utf8'), filename);
  return mod.exports;
};

(async () => {
process.env.ALPACA_API_KEY = 'fixture-alpaca-key';
process.env.ALPACA_API_SECRET = 'fixture-alpaca-secret';
process.env.KRAKEN_API_KEY = 'fixture-kraken-key';
process.env.KRAKEN_API_SECRET = 'fixture-kraken-secret';
process.env.WEBSOCKET_AUTH_TOKEN = 'fixture-dashboard-token';
const ConfigLoader = require('../../../../../../../foundation/ConfigLoader');
const PolicyBuilder = require('../../../../../../../core/PolicyBuilder');
const { createLedgerSkeleton, DecisionLedgerSkeletonSchema } = require('../../../../../../../core/dto/DecisionLedgerSchema');
ConfigLoader.load({ silent: true, loadDotenv: false });
const OrderExecutor = require('../../../../../../../core/OrderExecutor');
const StateManager = require('../../../../../../../core/StateManager');
const TradingLoop = require('../../../../../../../core/TradingLoop');
const DecisionAutopsyLogger = require('../../../../../../../core/DecisionAutopsyLogger');
const receipt = ConfigLoader.getReceipt();
assert.equal(typeof receipt.fingerprint, 'string');
assert.equal(typeof receipt.settings, 'number');
assert.equal(typeof receipt.internals, 'number');
assert.equal(typeof receipt.settingsHash, 'string');
assert.equal(typeof receipt.internalsHash, 'string');
assert(Object.isFrozen(receipt));

const policy = PolicyBuilder.buildForTrade({
  strategyName: 'EMATrendRetest',
  configuration: receipt,
  exitContract: ConfigLoader.get('exitContracts.EMATrendRetest'),
  volatility: 0.01,
  confidence: 0.8,
  marketCondition: 'ranging',
  entryDirection: 'long',
  nowMs: 1700000000000,
});
assert.deepEqual(policy.configuration, receipt);

const ledger = createLedgerSkeleton({
  tradeId: 'receipt-probe',
  decisionConfiguration: receipt,
  entryConfiguration: policy.configuration,
  entryPolicyHash: policy.policyHash,
  candleTimestamp: 1700000000000,
  symbol: 'TSLA',
  timeframe: '15m',
  executionMode: 'paper',
  entryPrice: 250,
  direction: 'long',
  positionEffect: 'open_long',
  strategySignals: [{ name: 'EMATrendRetest', direction: 'long', baseConfidence: 0.8, reason: 'fixture' }],
  orchestratorDecision: { winnerStrategy: 'EMATrendRetest', finalConfidence: 0.8, reason: 'fixture' },
  positionSizing: { basePercent: 0.01, confidenceMultiplier: 1, confluenceMultiplier: 1,
    finalPercent: 0.01, finalSizeUsd: 100, formula: 'fixture' },
  exitContract: policy.contract,
});
DecisionLedgerSkeletonSchema.parse(ledger);
assert.deepEqual(ledger.decisionConfiguration, receipt);
assert.deepEqual(ledger.entryConfiguration, receipt);
assert.equal(ledger.entryPolicyHash, policy.policyHash);

const runner = { getCandleScopeEnvelope: () => ({ brokerId: 'alpaca', accountId: 'fixture',
  accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper', timeframe: '15m' }),
  getSymbolTimeframeContext: () => ({ brokerId: 'alpaca', accountId: 'fixture',
    accountIdSource: 'fixture', assetClass: 'stocks', executionMode: 'paper', timeframe: '15m' }) };
const executor = new OrderExecutor({ config: ConfigLoader.getAll(), runner, candleTimeframe: '15m' });
const plan = executor._buildEntryPlan({
  decision: { action: 'BUY', confidence: 88 }, symbol: 'TSLA', timeframe: '15m', price: 250,
  positionSize: 100, currentBalance: 10000, currentEquity: 10000, tradeConfidence: 0.88,
  confidenceMultiplier: 1, entryVolatility: 0.01, orchResult: {
    winnerStrategy: 'EMATrendRetest', sizingMultiplier: 1,
    exitContract: ConfigLoader.get('exitContracts.EMATrendRetest'),
  },
});
assert.deepEqual(plan.frozenExitPolicy.configuration, receipt);

const manager = StateManager.getInstance();
const openResult = await manager.openPosition(100, 250, {
  orderId: 'receipt-flow-probe', action: 'BUY', direction: 'long', entryStrategy: 'EMATrendRetest',
    symbol: 'TSLA', brokerId: 'alpaca', accountId: 'fixture', accountIdSource: 'fixture',
  assetClass: 'stocks', executionMode: 'paper', timeframe: '15m', entryOrderQuantity: 1,
  remainingOrderQuantity: 1, entryOrderQuantityUnit: 'shares', remainingOrderQuantityUnit: 'shares',
  exitContract: plan.frozenExitPolicy.contract, frozenExitPolicy: plan.frozenExitPolicy,
  ledgerData: { ...ledger, tradeId: 'receipt-flow-probe', candleTimestamp: 1700000000000,
    symbol: 'TSLA', timeframe: '15m', executionMode: 'paper', entryPrice: 250,
    direction: 'long', positionEffect: 'open_long', exitContract: plan.frozenExitPolicy.contract,
    positionSizing: ledger.positionSizing, strategySignals: ledger.strategySignals,
    orchestratorDecision: ledger.orchestratorDecision },
});
assert.equal(openResult.success, true);
const openedTrade = manager.get('activeTrades').get('receipt-flow-probe');
assert.deepEqual(openedTrade.decisionLedger.decisionConfiguration, receipt);
assert.deepEqual(openedTrade.decisionLedger.entryConfiguration, receipt);
assert.equal(openedTrade.decisionLedger.entryPolicyHash, plan.frozenExitPolicy.policyHash);
const projected = manager._buildScopedDashboardPositions(manager.getState());
const projectedTrade = projected.find(item => item.tradeId === 'receipt-flow-probe');
assert.deepEqual(projectedTrade.entryConfiguration, receipt);
assert.equal(projectedTrade.entryPolicyHash, plan.frozenExitPolicy.policyHash);

let autopsyRecord = null;
const originalAutopsyWrite = DecisionAutopsyLogger.writeAutopsy;
DecisionAutopsyLogger.writeAutopsy = record => { autopsyRecord = record; return { success: true, persisted: false, skipped: true, reason: 'fixture_capture' }; };
const loop = new TradingLoop({ runner, config: ConfigLoader.getAll() });
loop._writeDecisionAutopsy({ traceId: 'receipt-autopsy-probe', symbol: 'TSLA', timeframe: '15m',
  price: 250, marketData: { timestamp: 1700000000000 }, decision: { action: 'HOLD' },
  activeTrades: [openedTrade], exitEvaluations: [{ tradeId: 'receipt-flow-probe', shouldExit: false }] });
DecisionAutopsyLogger.writeAutopsy = originalAutopsyWrite;
assert.deepEqual(autopsyRecord.configuration, receipt);
assert.deepEqual(autopsyRecord.exitEvaluations[0].entryConfiguration, receipt);
assert.equal(autopsyRecord.exitEvaluations[0].entryPolicyHash, plan.frozenExitPolicy.policyHash);

const beforeSavePolicy = plan.frozenExitPolicy.configuration;
const changedConfidence = ConfigLoader.get('confidence.minTradeConfidence') + 0.001;
const saveResult = ConfigLoader.saveSettings({ requestId: 'receipt-probe-save',
  expectedRevision: receipt.settings, expectedSettingsHash: receipt.settingsHash,
  changes: { 'confidence.minTradeConfidence': changedConfidence } });
assert.equal(saveResult.success, true);
assert.deepEqual(plan.frozenExitPolicy.configuration, beforeSavePolicy);
assert.notEqual(ConfigLoader.getReceipt().settings, receipt.settings);

console.log(JSON.stringify({
  fingerprint: receipt.fingerprint,
  settings: receipt.settings,
  internals: receipt.internals,
  settingsHash: receipt.settingsHash,
  internalsHash: receipt.internalsHash,
  policyHash: policy.policyHash,
  joined: receipt.fingerprint === policy.configuration.fingerprint
    && receipt.fingerprint === ledger.decisionConfiguration.fingerprint
    && receipt.fingerprint === ledger.entryConfiguration.fingerprint,
  actualFlow: true,
  saveDidNotMutateFrozenPolicy: plan.frozenExitPolicy.configuration.fingerprint === receipt.fingerprint,
}));
})().catch(error => { console.error(error); process.exitCode = 1; });
