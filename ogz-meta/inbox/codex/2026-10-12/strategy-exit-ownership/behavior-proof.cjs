'use strict';

// Candidate-only proof for independently owned strategy-exit settings.
// It deliberately routes ConfigLoader's canonical settings reads and atomic
// settings write into this fixture's private directory. No bot, broker, PM2,
// network client, or production settings file is opened for writing.
//
// Usage:
// node ogz-meta/inbox/codex/2026-10-12/strategy-exit-ownership/behavior-proof.cjs --candidate-ref=<treeish>

const assert = require('assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '../../../../..');
const candidateRef = process.argv.find((value) => value.startsWith('--candidate-ref='))?.slice('--candidate-ref='.length);
if (!candidateRef) throw new Error('Pass --candidate-ref=<treeish>; this fixture does not read the dirty worktree as a candidate.');

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
const privateDir = fs.mkdtempSync(path.join(privateRoot, 'strategy-exit-ownership-'));
const privateSettings = path.join(privateDir, 'settings.json');
const nativeLoad = Module._load;
const nativeReadFileSync = fs.readFileSync;
const sourceCache = new Map();
const candidateSettingsPath = path.join(root, 'config/settings.json');
const candidateInternalsPath = path.join(root, 'config/internals.json');
const candidateConfigLoaderPath = path.join(root, 'foundation/ConfigLoader.js');
const candidateAtomicWritePath = path.join(root, 'core/AtomicWrite.js');
const candidateOrderExecutorPath = path.join(root, 'core/OrderExecutor.js');
const candidateStateManagerPath = path.join(root, 'core/StateManager.js');
let privateWriteCount = 0;

function candidateSource(relativePath) {
  if (sourceCache.has(relativePath)) return sourceCache.get(relativePath);
  const source = childProcess.execFileSync('git', ['show', `${candidateRef}:${relativePath}`], {
    cwd: root,
    encoding: 'utf8',
  });
  sourceCache.set(relativePath, source);
  return source;
}

fs.writeFileSync(privateSettings, candidateSource('config/settings.json'), 'utf8');

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
  if (resolved === candidateStateManagerPath && parent?.filename === candidateOrderExecutorPath) {
    // The proof calls only OrderExecutor's pure entry-distance method. Prevent
    // its module-level StateManager singleton from reading a runtime state file.
    return { getInstance: () => ({}) };
  }
  if (resolved === candidateAtomicWritePath && parent?.filename === candidateConfigLoaderPath) {
    return {
      writeJsonAtomic(targetPath, value) {
        assert.equal(targetPath, candidateSettingsPath, 'ConfigLoader may write only its canonical settings target');
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

const ConfigLoader = require(candidateConfigLoaderPath);
const PolicyBuilder = require(path.join(root, 'core/PolicyBuilder'));
const ProfitExitPlanner = require(path.join(root, 'core/ProfitExitPlanner'));
const { ExitContractManager } = require(path.join(root, 'core/ExitContractManager'));
let OrderExecutor;
const nowMs = Date.parse('2026-10-12T12:00:00.000Z');
const rsi = 'RSI';
const marketRegime = 'MarketRegime';
const rsiKeys = [
  `exitContracts.${rsi}.takeProfitPercent`,
  `exitContracts.${rsi}.profitManagement.tieredExit.enabled`,
  `exitContracts.${rsi}.profitManagement.tieredExit.profitTiers.tier1`,
];
const marketRegimeKeys = [
  `exitContracts.${marketRegime}.takeProfitPercent`,
  `exitContracts.${marketRegime}.profitManagement.tieredExit.enabled`,
  `exitContracts.${marketRegime}.profitManagement.tieredExit.profitTiers.tier1`,
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function objectPathValue(object, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], object);
}

function nextEditableValue(field) {
  if (field.type === 'boolean') return !field.value;
  if (field.type !== 'number' || !Number.isFinite(field.value)) {
    throw new Error(`Fixture expected editable boolean or finite-number field; got ${field.type} at ${field.path || '<unknown>'}`);
  }
  const increment = Math.max(0.01, Math.min(0.1, Math.abs(field.value || 1) * 0.1));
  const upward = field.value + increment;
  if (field.max === undefined || upward < field.max || (!field.exclusiveMax && upward <= field.max)) return upward;
  const downward = field.value - increment;
  if (downward > field.min || (!field.exclusiveMin && downward >= field.min)) return downward;
  throw new Error(`Fixture cannot select a distinct in-range value for ${field.path || '<unknown>'}`);
}

function buildPolicy(contract, entryDirection = 'long') {
  return PolicyBuilder.buildForTrade({
    strategyName: contract.strategyName,
    exitContract: clone(contract),
    nowMs,
    volatility: 1,
    confidence: 0.8,
    marketCondition: 'normal',
    entryDirection,
    configReader: ConfigLoader,
  });
}

function plannerSnapshot(policy, tradeId) {
  const tiers = policy.profitManagement.tieredExit?.tiers || [];
  return {
    tradeId,
    intentId: `${tradeId}:intent`,
    tradeRevision: 0,
    executionMode: 'paper',
    brokerId: 'alpaca',
    accountId: 'paper',
    assetClass: 'stocks',
    symbol: 'TSLA',
    timeframe: '15m',
    scopeKey: 'paper:alpaca:paper:stocks:TSLA:15m',
    direction: 'long',
    entryPrice: 100,
    entryTimeMs: nowMs - 60_000,
    entryOrderQuantity: 10,
    remainingOrderQuantity: 10,
    quantityUnit: 'shares',
    currentPrice: 100,
    frozenExitPolicy: policy,
    pendingExitIntent: null,
    beScaleOutState: { status: 'idle', targetQuantity: null, filledQuantity: 0, brokerOrderIds: [], intentId: null },
    tierStates: tiers.map((tier, tierIndex) => ({ tierIndex, name: tier.name, status: 'idle', filledQuantity: 0 })),
  };
}

function contractFor(manager, strategyName) {
  return manager.createExitContract(strategyName, {}, { timeframe: '15m', volatility: 1 });
}

function requestFrom(view, requestId, changes) {
  return {
    requestId,
    expectedRevision: view.configuration.settings,
    expectedSettingsHash: view.configuration.settingsHash,
    changes,
  };
}

function assertEntryProfitDistanceOwnership() {
  const distance = OrderExecutor.prototype._entryProfitDistanceDecimal;
  const executor = {
    _positiveConfigNumber() {
      throw new Error('entry-profit distance must not read a shared global profit target');
    },
    _percentDistanceDecimal: OrderExecutor.prototype._percentDistanceDecimal,
  };
  const tieredContract = {
      tpMode: 'percent',
      takeProfitPercent: 2,
      profitManagement: {
      tieredExit: { enabled: true, profitTiers: { tier1: 0.01, tier2: 0.02, tier3: 0.03, final: 0.0375 } },
    },
  };
  assert.equal(
    distance.call(executor, tieredContract),
    0.0375,
    'enabled strategy tiers use that strategy\'s own final target without reading shared exits.profitTiers.final'
  );
  assert.equal(
    distance.call(executor, {
      tpMode: 'percent',
      takeProfitPercent: 2.5,
      profitManagement: { tieredExit: { enabled: false, profitTiers: { final: 0.9 } } },
    }),
    0.025,
    'disabled strategy tiers retain the explicit contract take-profit percent'
  );
  assert.equal(
    distance.call(executor, {
      tpMode: 'off',
      takeProfitPercent: null,
      profitManagement: { tieredExit: { enabled: false, profitTiers: { final: 0.9 } } },
    }),
    null,
    'off contract with disabled tiers has no invented consistency-cap profit distance'
  );
  assert.equal(
    distance.call(executor, {
      tpMode: 'atrMultiple',
      takeProfitPercent: null,
      profitManagement: { tieredExit: { enabled: false, profitTiers: { final: 0.9 } } },
    }),
    null,
    'null target with disabled tiers has no imaginary consistency-cap profit distance'
  );
}

function assertAllConfiguredExitOwners() {
  const configuredContracts = ConfigLoader.get('exitContracts');
  const manager = new ExitContractManager();
  const policies = new Map();
  for (const strategyName of Object.keys(configuredContracts)) {
    const defaultContract = manager.getDefaultContract(strategyName, { timeframe: '15m' });
    const createdContract = contractFor(manager, strategyName);
    assert.ok(defaultContract?.profitManagement, `${strategyName} default contract retains its owned profit-management tree`);
    assert.ok(createdContract?.profitManagement, `${strategyName} created contract retains its owned profit-management tree`);
    assert.ok(Object.isFrozen(createdContract.profitManagement), `${strategyName} contract references ConfigLoader's frozen settings tree`);
    const policy = buildPolicy(createdContract);
    assert.equal(policy.profitManagement.beScaleOut.enabled, false, `${strategyName} starts with its own scale-out disabled`);
    assert.equal(policy.profitManagement.breakEvenStop.enabled, false, `${strategyName} starts with its own break-even stop disabled`);
    assert.equal(policy.profitManagement.tieredExit.enabled, false, `${strategyName} starts with its own tiered exit disabled`);
    policies.set(strategyName, { contract: createdContract, policy, profitManagementAtBuild: clone(policy.profitManagement) });
  }
  assert.equal(policies.size, 17, 'all 17 configured strategy contracts, including default, build a frozen owner policy');
  assert.equal(policies.get('TimeSeriesMomentum').policy.profitManagement.trail.atrMultiplier, 2, 'TimeSeriesMomentum retains its 2 ATR trail');
  assert.equal(policies.get('EMATrendRetest').contract.atrStopMult, 1.5, 'EMATrendRetest retains its 1.5 ATR stop');
  assert.equal(policies.get('PropSafeEMAPullback').contract.atrStopMult, 1.5, 'PropSafeEMAPullback retains its 1.5 ATR stop');
  return { strategyNames: [...policies.keys()], policies };
}

try {
  ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
  OrderExecutor = require(path.join(root, 'core/OrderExecutor'));
  assertEntryProfitDistanceOwnership();
  const initialView = ConfigLoader.getSettingsView();
  for (const key of [...rsiKeys, ...marketRegimeKeys]) {
    assert.ok(initialView.fields[key], `candidate must expose strategy-owned editable field ${key}`);
    assert.equal(initialView.fields[key].editable, true, `candidate must permit paper-bot editing of ${key}`);
  }
  for (const key of rsiKeys) {
    const source = initialView.fields[key].source;
    if (source !== undefined) {
      assert.equal(typeof source, 'string', `${key} source is a string when exposed`);
      assert.equal(source, 'config:settings.json:exitContracts', `${key} source identifies the canonical exit-contract settings tree`);
    }
  }
  const ownerCoverage = assertAllConfiguredExitOwners();

  const initialManager = new ExitContractManager();
  const initialRsiContract = contractFor(initialManager, rsi);
  const initialMarketRegimeContract = contractFor(initialManager, marketRegime);
  assert.notStrictEqual(
    initialRsiContract.profitManagement,
    initialMarketRegimeContract.profitManagement,
    'ECM allocates independent profit-management objects even when two strategies start with the same values'
  );

  const changes = Object.fromEntries(rsiKeys.map((key) => {
    const field = initialView.fields[key];
    return [key, nextEditableValue({ ...field, path: key })];
  }));
  const saved = ConfigLoader.saveSettings(requestFrom(initialView, 'strategy-exit-ownership-rsi', changes));
  assert.equal(saved.success, true, `RSI strategy-only settings save: ${saved.reason || 'unknown failure'}`);
  assert.equal(privateWriteCount, 1, 'exactly one private canonical settings write');
  assert.equal(saved.configuration.settings, initialView.configuration.settings + 1, 'settings revision advances once');
  for (const [key, value] of Object.entries(changes)) assert.equal(ConfigLoader.getSettingsView().fields[key].value, value, `published value ${key}`);
  for (const key of marketRegimeKeys) assert.deepEqual(
    ConfigLoader.getSettingsView().fields[key].value,
    initialView.fields[key].value,
    `RSI edit must not alter ${key}`
  );

  const writtenSettings = JSON.parse(nativeReadFileSync(privateSettings, 'utf8'));
  assert.equal(writtenSettings.revision, saved.configuration.settings, 'private settings file contains saved revision');
  for (const [key, value] of Object.entries(changes)) {
    assert.equal(objectPathValue(writtenSettings, key), value, `private file stores RSI-only ${key}`);
  }
  for (const key of marketRegimeKeys) {
    assert.deepEqual(objectPathValue(writtenSettings, key), initialView.fields[key].value, `private file preserves MarketRegime ${key}`);
  }

  ConfigLoader._resetForTest();
  ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
  for (const [strategyName, entry] of ownerCoverage.policies) {
    assert.ok(Object.isFrozen(entry.policy.profitManagement), `${strategyName} original policy remains frozen across settings reload`);
    assert.deepEqual(entry.policy.profitManagement, entry.profitManagementAtBuild, `${strategyName} original policy retains its entry-owned profit-management values across settings reload`);
  }
  const reloadedManager = new ExitContractManager();
  const reloadedRsiContract = contractFor(reloadedManager, rsi);
  const reloadedMarketRegimeContract = contractFor(reloadedManager, marketRegime);
  assert.equal(reloadedRsiContract.takeProfitPercent, changes[rsiKeys[0]], 'ECM resolves saved RSI target after reload');
  assert.equal(reloadedMarketRegimeContract.takeProfitPercent, initialMarketRegimeContract.takeProfitPercent, 'ECM preserves MarketRegime target after RSI reload');
  assert.deepEqual(
    reloadedMarketRegimeContract.profitManagement,
    initialMarketRegimeContract.profitManagement,
    'ECM preserves MarketRegime profit-management contract after RSI reload'
  );

  const rsiPolicy = buildPolicy(reloadedRsiContract);
  const marketRegimePolicy = buildPolicy(reloadedMarketRegimeContract);
  assert.ok(Object.isFrozen(rsiPolicy.profitManagement), 'PolicyBuilder freezes RSI-owned profit management');
  assert.ok(Object.isFrozen(marketRegimePolicy.profitManagement), 'PolicyBuilder freezes MarketRegime-owned profit management');
  assert.notStrictEqual(rsiPolicy.profitManagement, marketRegimePolicy.profitManagement, 'PolicyBuilder allocates distinct strategy-owned profit-management policies');
  assert.notDeepEqual(rsiPolicy.profitManagement, marketRegimePolicy.profitManagement, 'RSI-only saved exit changes produce a different frozen strategy policy');
  assert.equal(
    rsiPolicy.profitManagement.tieredExit.tiers[0].baseTargetProfitMove,
    reloadedRsiContract.profitManagement.tieredExit.profitTiers.tier1,
    'RSI frozen tier policy uses its own contract target'
  );
  assert.equal(
    marketRegimePolicy.profitManagement.tieredExit.tiers[0].baseTargetProfitMove,
    reloadedMarketRegimeContract.profitManagement.tieredExit.profitTiers.tier1,
    'MarketRegime frozen tier policy uses its own contract target'
  );

  const rsiTargetPrice = 100 * (1 + rsiPolicy.contract.takeProfitPercent / 100) + 0.01;
  const rsiIntent = ProfitExitPlanner.plan(plannerSnapshot(rsiPolicy, 'RSI_POLICY'), { currentPrice: rsiTargetPrice });
  assert.equal(rsiIntent.reason, 'take_profit', 'planner uses the saved RSI contract target');
  assert.equal(rsiIntent.exitFraction, 1, 'planner takes the full remaining RSI position at its contract target');

  const receipt = {
    pass: true,
    candidateRef,
    privateSettings,
    privateWriteCount,
    profile: ConfigLoader.get('mode.launchProfile'),
    savedRsiChanges: changes,
    preservedMarketRegime: Object.fromEntries(marketRegimeKeys.map((key) => [key, initialView.fields[key].value])),
    ownerCoverage: ownerCoverage.strategyNames,
    checks: [
      'getSettingsView exposes independently editable RSI and MarketRegime exit fields',
      'all 17 configured contracts including default resolve, create, and build their owned frozen policies',
      'OrderExecutor derives consistency distance from the selected contract rather than a shared target',
      'saveSettings writes only the fixture-private canonical settings copy',
      'RSI edit leaves MarketRegime fields unchanged',
      'reload resolves saved RSI contract while preserving MarketRegime contract',
      'PolicyBuilder freezes distinct per-strategy profit-management trees',
      'ProfitExitPlanner takes the saved RSI contract target',
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
