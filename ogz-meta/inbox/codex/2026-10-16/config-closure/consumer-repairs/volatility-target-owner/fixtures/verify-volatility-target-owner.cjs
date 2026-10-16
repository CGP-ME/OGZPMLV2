'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parser = require('@babel/parser');

const source = process.env.SOURCE || 'source-candidate';
const root = path.join(__dirname, source);
process.env.DOTENV_CONFIG_PATH = path.join(root, 'env.js');
const Loader = require(path.join(root, 'foundation/ConfigLoader.js'));
const PolicyBuilder = require(path.join(root, 'core/PolicyBuilder.js'));

const ecmText = fs.readFileSync(path.join(root, 'core/ExitContractManager.js'), 'utf8');
const ast = parser.parse(ecmText, { sourceType: 'script' });
const functionNames = [
  'normalizeTimeframeValue', 'cloneExitContract', 'resolveTimeframeContract',
  'readRuntimeContractValue', 'hasRuntimeContractOverride',
  'applyRuntimeExitContractOverrides', 'normalizeRuntimeContract',
  'buildStrategyContract', 'cloneScaleInPolicy', 'applyConcurrencyContractDefaults',
];
const functions = new Map();
for (const node of ast.program.body) {
  if (node.type === 'FunctionDeclaration') functions.set(node.id.name, node);
}
let managerMethod;
for (const node of ast.program.body) {
  if (node.type !== 'ClassDeclaration' || node.id.name !== 'ExitContractManager') continue;
  managerMethod = node.body.body.find((item) => item.type === 'ClassMethod' && item.key.name === 'getDefaultContract');
}
if (!managerMethod) throw new Error('actual ExitContractManager.getDefaultContract not found');
const missing = functionNames.filter((name) => !functions.has(name));
if (missing.length) throw new Error(`missing ECM helper source: ${missing.join(',')}`);
const constants = ['MISSING_EXIT_CONTRACT_VALUE', 'EXIT_CONTRACT_VALUE_FIELDS'];
const declarations = [];
for (const name of constants) {
  const node = ast.program.body.find((item) => item.type === 'VariableDeclaration' && item.declarations.some((decl) => decl.id.name === name));
  if (!node) throw new Error(`missing ECM constant source: ${name}`);
  declarations.push(ecmText.slice(node.start, node.end));
}
const definitions = [...declarations, ...functionNames.map((name) => ecmText.slice(functions.get(name).start, functions.get(name).end))].join('\n');
const methodBody = ecmText.slice(managerMethod.body.start, managerMethod.body.end);
const context = { ConfigLoader: Loader, PolicyBuilder, MISSING_EXIT_CONTRACT_VALUE: Symbol('missing'), console, structuredClone };
vm.runInNewContext(`${definitions}\nthis.getDefaultContract = function getDefaultContract(strategyName, context = {}) ${methodBody};`, context, { filename: path.join(root, 'core/ExitContractManager.js') });
const ecm = { getDefaultContract: context.getDefaultContract };

function policy(contract, volatility) {
  const policyContract = contract.timeframe ? contract : { ...contract, timeframe: '1m' };
  return PolicyBuilder.buildForTrade({
    strategyName: policyContract.strategyName || 'EMASMACrossover',
    exitContract: policyContract,
    nowMs: 1700000000000,
    volatility,
    confidence: 0.7,
    marketCondition: 'normal',
    entryDirection: 'long',
    mtfConfluenceSnapshot: null,
    configReader: Loader,
  });
}
function factor(contract, volatility, activate = true) {
  return policyFor(contract, volatility, activate).profitManagement.tieredExit.adjustment.volatilityTargetFactor;
}
function policyFor(contract, volatility, activate = true) {
  const input = activate ? { ...contract, profitManagement: { ...contract.profitManagement, volatilityAdjustment: { ...contract.profitManagement.volatilityAdjustment, enabled: true } } } : contract;
  return policy(input, volatility);
}
function tierTargets(contract, volatility) {
  const built = policyFor(contract, volatility);
  return {
    factor: built.profitManagement.tieredExit.adjustment.volatilityTargetFactor,
    tiers: built.profitManagement.tieredExit.tiers.map((tier) => ({ name: tier.name, targetProfitMove: tier.targetProfitMove, baseTargetProfitMove: tier.baseTargetProfitMove })),
  };
}

const initial = Loader.load({ role: 'bot' });
const owners = Object.keys(Loader.get('exitContracts'));
if (owners.length !== 17 || !owners.includes('default')) throw new Error(`expected 17 canonical exit owners, got ${owners.length}`);
const editableOwners = owners.filter((name) => name !== 'default');
const oldContracts = Object.fromEntries(owners.map((name) => [name, ecm.getDefaultContract(name, { timeframe: '1m' })]));
const oldPolicies = Object.fromEntries(owners.map((name) => [name, policyFor(oldContracts[name], 0.001)]));
const oldPolicySnapshots = Object.fromEntries(owners.map((name) => [name, JSON.stringify(oldPolicies[name])]));
const oldFactors = Object.fromEntries(owners.map((name) => [name, { low: factor(oldContracts[name], 0.001), high: factor(oldContracts[name], 0.03) }]));
for (const [name, values] of Object.entries(oldFactors)) {
  if (values.low !== 0.8 || values.high !== 1.4) throw new Error(`baseline owner factor mismatch ${name}: ${JSON.stringify(values)}`);
}
const changes = {};
const expectedFresh = {};
editableOwners.forEach((name, index) => {
  const low = Number((0.6 + index * 0.01).toFixed(2));
  const high = Number((1.6 + index * 0.01).toFixed(2));
  expectedFresh[name] = { low, high };
  changes[`exitContracts.${name}.profitManagement.volatilityAdjustment.enabled`] = true;
  changes[`exitContracts.${name}.profitManagement.volatilityAdjustment.lowTargetMultiplier`] = low;
  changes[`exitContracts.${name}.profitManagement.volatilityAdjustment.highTargetMultiplier`] = high;
});
const save = Loader.saveSettings({
  requestId: 'volatility-target-owner-fixture',
  expectedRevision: initial.revisions.settings,
  expectedSettingsHash: initial.revisions.settingsHash,
  changes,
});
let freshFactors = null;
if (save.success) {
  Loader._resetForTest();
  Loader.load({ role: 'bot' });
  freshFactors = Object.fromEntries(editableOwners.map((name) => {
    const fresh = ecm.getDefaultContract(name, { timeframe: '1m' });
    const lowPolicy = tierTargets(fresh, 0.001);
    const neutralPolicy = tierTargets(fresh, 0.01);
    const highPolicy = tierTargets(fresh, 0.03);
    return [name, { low: lowPolicy.factor, neutral: neutralPolicy.factor, high: highPolicy.factor, lowTargets: lowPolicy.tiers, highTargets: highPolicy.tiers, lowTargetMultiplier: fresh.profitManagement.volatilityAdjustment.lowTargetMultiplier, highTargetMultiplier: fresh.profitManagement.volatilityAdjustment.highTargetMultiplier }];
  }));
}
const disabled = { ...oldContracts.EMASMACrossover, profitManagement: { ...oldContracts.EMASMACrossover.profitManagement, volatilityAdjustment: { ...oldContracts.EMASMACrossover.profitManagement.volatilityAdjustment, enabled: false, lowTargetMultiplier: 0.2, highTargetMultiplier: 2.2 } } };
const result = {
  source,
  ownerCount: owners.length,
  editableOwnerCount: editableOwners.length,
  save: { success: save.success, reason: save.reason || null },
  oldFrozenPolicyFactors: oldFactors,
  freshPolicyFactors: freshFactors,
  disabledFactor: factor(disabled, 0.001, false),
  retainedFrozenPolicies: Object.fromEntries(owners.map((name) => [name, JSON.stringify(oldPolicies[name]) === oldPolicySnapshots[name]])),
};
if (source === 'source-candidate') {
  if (!save.success || result.disabledFactor !== 1 || Object.values(result.retainedFrozenPolicies).some((same) => !same)) throw new Error(`candidate save/disabled/retained proof failed: ${JSON.stringify(result)}`);
  for (const name of editableOwners) {
    const got = freshFactors[name];
    const expected = expectedFresh[name];
    const expectedLowTarget = got.lowTargets[0].baseTargetProfitMove * expected.low;
    const expectedHighTarget = got.highTargets[0].baseTargetProfitMove * expected.high;
    if (got.low !== expected.low || got.high !== expected.high || got.neutral !== 1 || got.lowTargetMultiplier !== expected.low || got.highTargetMultiplier !== expected.high || got.lowTargets[0].targetProfitMove !== expectedLowTarget || got.highTargets[0].targetProfitMove !== expectedHighTarget || got.lowTargets[0].targetProfitMove === got.highTargets[0].targetProfitMove) {
      throw new Error(`candidate owner proof failed ${name}: ${JSON.stringify({ got, expected })}`);
    }
  }
} else if (save.success || Object.values(result.retainedFrozenPolicies).some((same) => !same)) {
  throw new Error(`baseline unexpectedly accepted new fields: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify(result));
