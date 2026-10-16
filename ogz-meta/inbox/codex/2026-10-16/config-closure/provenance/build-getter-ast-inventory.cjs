#!/usr/bin/env node
'use strict';

// Static-only census. Source is read from the pinned git tree, never required.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const ROOT = path.resolve(__dirname, '../../../../../..');
const HERE = __dirname;
const HEAD = exec(['rev-parse', 'HEAD']).trim();
const APIs = new Set(['get', 'getSection', 'getConfigFileValue', 'getInternalsFileValue']);
const PUBLIC_ACCESSOR_APIS = new Set(['getMatrixSweepConfig', 'getParallelBacktestConfig', 'getTuningProfileStatus', 'listTuningProfileNames', 'resolveTuningProfile', 'buildTuningProfileOverrides', 'listFeeProfileNames', 'resolveFeeProfile', 'buildFeeProfileOverrides']);
// These are real ConfigLoader exports, but do not read a configuration path.
// Keep them visible so an alias is not misreported as an unsupported getter.
const NON_GETTER_APIS = new Set(['load', 'getSource']);
const COMPATIBILITY_EXPORTS = new Set(['authFailureGuard', 'confidence', 'entryLogic', 'execution', 'exitContracts', 'featureCatalog', 'features', 'featureExtraction', 'fees', 'fibonacci', 'filters', 'fundTarget', 'indicators', 'misc', 'orchestrator', 'patternMemory', 'patternRecognition', 'performanceAnalysis', 'pid', 'pipeline', 'positionSizing', 'proofPublication', 'regimeBoosts', 'risk', 'services', 'startingBalance', 'regimeDetection', 'strategies', 'strategyBehavior', 'tierPolicy', 'timeframeConfig', 'trai', 'volumeProfileBoosts', 'broker', 'backtest', 'paths', 'monitoring', 'observability', 'dataFeed', 'dashboard', 'webhookOrders', 'sessionRouter', 'evalRules', 'internals']);
const EXCLUDED = [
  /^(?:ogz-meta\/archive|ogz-meta\/inbox|ogz-meta\/specs|ogz-meta\/sessions|ogz-meta\/ledger|docs|test|tests|fixtures)\//,
  /(?:^|\/)node_modules\//,
  /(?:^|\/)\.pipeline-backup$/,
];

function exec(args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }); }
function trackedFiles() {
  return exec(['ls-tree', '-r', '--name-only', HEAD])
    .split('\n').filter(file => /\.(?:js|cjs|mjs)$/.test(file)).filter(file => !EXCLUDED.some(rule => rule.test(file)));
}
function source(file) { return exec(['show', `${HEAD}:${file}`]); }
function compatibilitySectionSpan() {
  const lines = source('foundation/ConfigLoader.js').split('\n');
  const start = lines.findIndex(line => line.includes('const compatibilitySections = ['));
  const end = lines.findIndex((line, index) => index > start && line === 'module.exports = exported;');
  return start >= 0 && end >= 0 ? `foundation/ConfigLoader.js:${start + 1}-${end}` : 'foundation/ConfigLoader.js:compatibilitySections';
}
function loc(node) { return { line: node.loc.start.line, column: node.loc.start.column + 1, endLine: node.loc.end.line, endColumn: node.loc.end.column + 1 }; }
function text(sourceText, node) { return sourceText.slice(node.start, node.end); }
function propertyName(node) {
  if (!node) return null;
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  return null;
}
function stringValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis.map(q => q.value.cooked).join('');
  return null;
}
function dottedLookup(value, dotted) {
  let cursor = value;
  for (const part of dotted.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) return false;
    cursor = cursor[part];
  }
  return true;
}
function roleSources(raw) { return raw && raw.sourceMaps && typeof raw.sourceMaps === 'object' ? raw.sourceMaps : {}; }
function isPathJoin(node) {
  return node && node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' && node.callee.object.name === 'path' &&
    ['join', 'resolve'].includes(propertyName(node.callee));
}
function isLoaderRequire(node, knownRoots = new Set()) {
  if (!(node && node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length === 1)) return false;
  const direct = stringValue(node.arguments[0]);
  if (typeof direct === 'string') return /(?:^|\/)ConfigLoader(?:\.js)?$/.test(direct);
  const target = node.arguments[0];
  if (!isPathJoin(target)) return false;
  // Resolve only local static path.join/path.resolve forms: literal segments,
  // __dirname, and variables proven to be a local __dirname-derived root.
  const pieces = target.arguments.map(arg => {
    const literal = stringValue(arg); if (literal !== null) return literal;
    if (arg.type === 'Identifier' && (arg.name === '__dirname' || knownRoots.has(arg.name))) return arg.name;
    return null;
  });
  return !pieces.includes(null) && pieces.some(piece => /(?:^|\/)foundation(?:\/|$)/.test(piece)) && pieces.some(piece => /(?:^|\/)ConfigLoader(?:\.js)?$/.test(piece));
}

function analyzeFile(file, sourceText, settings, internals, sourcesByRole) {
  let ast;
  try { ast = acorn.parse(sourceText, { ecmaVersion: 'latest', sourceType: 'script', locations: true, ranges: true, allowHashBang: true, allowReturnOutsideFunction: true }); }
  catch (scriptError) {
    try { ast = acorn.parse(sourceText, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true, allowHashBang: true, allowReturnOutsideFunction: true }); }
    catch (moduleError) { return { records: [], propertyReads: [], publicAccessorCalls: [], nonGetterApiBindings: [], unsupported: [], parseError: `${scriptError.message}; module retry: ${moduleError.message}` }; }
  }
  const loaderObjects = new Set();
  // The loader implementation calls its own exported methods while building
  // compatibility properties; there is no require binding in that file.
  if (file === 'foundation/ConfigLoader.js') loaderObjects.add('ConfigLoader');
  const getterAliases = new Map();
  const compatibilityAliases = new Map();
  const unsupported = [];
  const nonGetterApiBindings = [];
  const publicAccessorCalls = [];
  const records = [];
  const propertyReads = [];
  const functionStack = [];
  const wrappers = new Map();
  const staticStrings = new Map();
  const knownRoots = new Set();

  walk.simple(ast, { VariableDeclarator(node) { if (node.id.type === 'Identifier') { const value = stringValue(node.init); if (value !== null) staticStrings.set(node.id.name, value); if (isPathJoin(node.init) && node.init.arguments.every(arg => stringValue(arg) !== null || (arg.type === 'Identifier' && arg.name === '__dirname'))) knownRoots.add(node.id.name); } } });
  function resolvedString(node) {
    const direct = stringValue(node); if (direct !== null) return direct;
    if (node && node.type === 'TemplateLiteral' && node.expressions.every(expr => expr.type === 'Identifier' && staticStrings.has(expr.name))) {
      let output = node.quasis[0].value.cooked;
      node.expressions.forEach((expr, index) => { output += staticStrings.get(expr.name) + node.quasis[index + 1].value.cooked; });
      return output;
    }
    return null;
  }

  function bind(pattern, api, node) {
    if (pattern.type === 'Identifier') getterAliases.set(pattern.name, api);
    else unsupported.push({ file, ...loc(node), kind: 'unsupported_loader_binding_pattern', expression: text(sourceText, pattern) });
  }
  walk.simple(ast, {
    VariableDeclarator(node) {
      if (!isLoaderRequire(node.init, knownRoots)) return;
      if (node.id.type === 'Identifier') loaderObjects.add(node.id.name);
      else if (node.id.type === 'ObjectPattern') for (const prop of node.id.properties) {
        const api = prop.key && (prop.key.name || prop.key.value);
        if (APIs.has(api)) bind(prop.value, api, node);
        else if (NON_GETTER_APIS.has(api) && prop.value.type === 'Identifier') {
          nonGetterApiBindings.push({ file, ...loc(prop), api, binding: `destructured:${prop.value.name}`, classification: 'valid_non_getter_api', expression: text(sourceText, prop) });
        }
        else if (COMPATIBILITY_EXPORTS.has(api) && prop.value.type === 'Identifier') {
          compatibilityAliases.set(prop.value.name, api);
          propertyReads.push({ file, ...loc(prop), api: 'compatibilityProperty', compatibilitySection: api, binding: `destructured:${prop.value.name}`, expression: text(sourceText, prop) });
        }
        else unsupported.push({ file, ...loc(prop), kind: 'unsupported_loader_export', expression: text(sourceText, prop) });
      } else unsupported.push({ file, ...loc(node), kind: 'unsupported_loader_binding_pattern', expression: text(sourceText, node.id) });
    },
  });
  // Alias `const localGet = Loader.get` is common in operational tools.
  walk.simple(ast, {
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || !node.init || node.init.type !== 'MemberExpression' || node.init.object.type !== 'Identifier' || !loaderObjects.has(node.init.object.name)) return;
      const api = propertyName(node.init); if (APIs.has(api)) getterAliases.set(node.id.name, api);
    },
  });
  function addCall(node, api, binding, wrapper) {
    const arg = node.arguments[0];
    const literal = resolvedString(arg);
    const base = { file, ...loc(node), api, binding, expression: arg ? text(sourceText, arg) : null, wrapper: wrapper || null };
    if (!arg) { unsupported.push({ ...base, kind: 'missing_getter_argument' }); return; }
    // ConfigLoader itself manufactures property getters from this literal
    // section list.  The loop variable is deliberately computed, not an
    // unresolved caller path.
    if (file === 'foundation/ConfigLoader.js' && api === 'getSection' && arg.type === 'Identifier' && arg.name === 'section') {
      records.push({ ...base, kind: 'loader_compatibility_section_generator', compatibilitySections: compatibilitySectionSpan(), pathExpression: 'section' });
      return;
    }
    if (literal !== null) {
      const row = { ...base, kind: 'literal', path: literal };
      if (api === 'getConfigFileValue' || api === 'getInternalsFileValue') {
        const owner = api === 'getConfigFileValue' ? 'config/settings.json' : 'config/internals.json';
        row.canonicalOwner = owner; row.canonicalExists = dottedLookup(owner === 'config/settings.json' ? settings : internals, literal);
      } else {
        row.sourceByRole = Object.fromEntries(Object.entries(sourcesByRole).map(([role, map]) => [role, map[literal] || null]));
        row.missingRoleSources = Object.keys(row.sourceByRole).filter(role => row.sourceByRole[role] === null);
      }
      records.push(row); return;
    }
    records.push({ ...base, kind: 'computed', computedExpression: text(sourceText, arg), callers: wrapper ? wrappers.get(wrapper.name) || [] : [] });
  }
  function visit(node, parent, wrapper, injectedLoaders = new Set()) {
    let nextWrapper = wrapper;
    let nextInjectedLoaders = injectedLoaders;
    if (node.type === 'MethodDefinition') {
      const methodName = node.key.type === 'Identifier' ? node.key.name : stringValue(node.key);
      nextWrapper = methodName ? { name: methodName, ...loc(node) } : wrapper;
    } else if (/Function(?:Declaration|Expression)$/.test(node.type) || node.type === 'ArrowFunctionExpression') {
      const name = node.id?.name || (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : null);
      nextWrapper = name ? { name, ...loc(node) } : wrapper;
      const injected = node.params
        .filter(param => param.type === 'Identifier' && /^ConfigLoader$/i.test(param.name))
        .map(param => param.name);
      if (injected.length > 0) nextInjectedLoaders = new Set([...injectedLoaders, ...injected]);
    }
    if (node.type === 'CallExpression') {
      let api = null; let binding = null;
      if (node.callee.type === 'Identifier' && getterAliases.has(node.callee.name)) { api = getterAliases.get(node.callee.name); binding = `alias:${node.callee.name}`; }
      if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && (loaderObjects.has(node.callee.object.name) || nextInjectedLoaders.has(node.callee.object.name))) {
        api = propertyName(node.callee);
        binding = loaderObjects.has(node.callee.object.name) ? `object:${node.callee.object.name}` : `injected-param:${node.callee.object.name}`;
      }
      if (api && APIs.has(api)) addCall(node, api, binding, nextWrapper);
      if (api && PUBLIC_ACCESSOR_APIS.has(api)) publicAccessorCalls.push({ file, ...loc(node), api, binding, expression: text(sourceText, node), wrapper: nextWrapper || null, classification: 'valid_configloader_public_accessor' });
      if (node.callee.type === 'Identifier' && wrappers.has(node.callee.name)) wrappers.get(node.callee.name).push({ file, ...loc(node), expression: text(sourceText, node) });
      if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'ThisExpression') {
        const name = propertyName(node.callee);
        if (name && wrappers.has(name)) wrappers.get(name).push({ file, ...loc(node), expression: text(sourceText, node) });
      }
    }
    if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && loaderObjects.has(node.object.name)) {
      const api = propertyName(node);
      if (APIs.has(api) && (!parent || parent.type !== 'CallExpression' || parent.callee !== node)) propertyReads.push({ file, ...loc(node), api, binding: `object:${node.object.name}`, expression: text(sourceText, node) });
      if (COMPATIBILITY_EXPORTS.has(api)) propertyReads.push({ file, ...loc(node), api: 'compatibilityProperty', compatibilitySection: api, binding: `object:${node.object.name}`, expression: text(sourceText, node) });
      if (!api && node.computed) unsupported.push({ file, ...loc(node), kind: 'computed_loader_property', expression: text(sourceText, node) });
    }
    for (const key of Object.keys(node)) {
      if (['loc','start','end','range'].includes(key)) continue;
      const child=node[key]; if (child && typeof child.type === 'string') visit(child,node,nextWrapper,nextInjectedLoaders);
      else if (Array.isArray(child)) for(const item of child) if(item && typeof item.type==='string') visit(item,node,nextWrapper,nextInjectedLoaders);
    }
  }
  // Seed wrapper call arrays before traversal so computed calls get every local caller after a second pass.
  walk.simple(ast, { FunctionDeclaration(n) { if (n.id) wrappers.set(n.id.name, []); }, VariableDeclarator(n) { if (n.id.type === 'Identifier' && n.init && /FunctionExpression|ArrowFunctionExpression/.test(n.init.type)) wrappers.set(n.id.name, []); }, MethodDefinition(n) { const name = n.key.type === 'Identifier' ? n.key.name : stringValue(n.key); if (name) wrappers.set(name, []); } });
  visit(ast, null, null);
  for (const row of records) if (row.kind === 'computed' && row.wrapper) row.callers = wrappers.get(row.wrapper.name) || [];
  return { records, propertyReads, publicAccessorCalls, nonGetterApiBindings, unsupported, parseError: null };
}

const settings = JSON.parse(exec(['show', `${HEAD}:config/settings.json`]));
const internals = JSON.parse(exec(['show', `${HEAD}:config/internals.json`]));
const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'current-result.json'), 'utf8'));
const sourceMaps = roleSources(raw);
function lineOf(file, needle) {
  const lines = source(file).split('\n');
  const index = lines.findIndex(line => line.includes(needle));
  return index >= 0 ? index + 1 : null;
}
const runtimeConfigProofInjection = {
  file: 'core/RuntimeConfigProof.js',
  function: 'tradingConfigValue',
  parameter: 'ConfigLoader',
  getterCall: { line: lineOf('core/RuntimeConfigProof.js', 'const value = ConfigLoader.get(path);'), expression: 'ConfigLoader.get(path)' },
  forwardingFunction: { line: lineOf('core/RuntimeConfigProof.js', 'function logRuntimeConfigProof(snapshot, ConfigLoader'), expression: 'logRuntimeConfigProof(snapshot, ConfigLoader)' },
  verifiedModuleCallers: [
    { file: 'run-empire-v2.js', line: lineOf('run-empire-v2.js', 'logRuntimeConfigProof(resolvedConfig, ConfigLoader);'), expression: 'logRuntimeConfigProof(resolvedConfig, ConfigLoader)' },
    { file: 'run-empire-v2.js', line: lineOf('run-empire-v2.js', 'logRuntimeConfigProof(snapshot, ConfigLoader);'), expression: 'logRuntimeConfigProof(snapshot, ConfigLoader)' },
  ],
};
const all = { records: [], propertyReads: [], publicAccessorCalls: [], nonGetterApiBindings: [], unsupported: [], parseErrors: [], files: [] };
for (const file of trackedFiles()) {
  const result = analyzeFile(file, source(file), settings, internals, sourceMaps);
  all.files.push(file); all.records.push(...result.records); all.propertyReads.push(...result.propertyReads); all.publicAccessorCalls.push(...result.publicAccessorCalls); all.nonGetterApiBindings.push(...result.nonGetterApiBindings); all.unsupported.push(...result.unsupported);
  if (result.parseError) all.parseErrors.push({ file, error: result.parseError });
}
const literal = all.records.filter(row => row.kind === 'literal');
const computed = all.records.filter(row => row.kind === 'computed');
const loaderCompatibilityGenerators = all.records.filter(row => row.kind === 'loader_compatibility_section_generator');
const report = {
  schemaVersion: 1, candidate: HEAD,
  scope: {
    includedTrackedJsFiles: all.files.length,
    excluded: EXCLUDED.map(String),
    source: 'git show HEAD:<path>; no module import or execution',
    limitations: 'Static syntax/binding census only: dynamic require, reflective invocation, values built outside locally enumerable wrapper callers, and the three parse-error files remain explicitly unresolved.'
  },
  roleSourceMapReceipt: raw ? { candidate: raw.candidate || null, roles: Object.keys(sourceMaps) } : { candidate: null, roles: [], warning: 'current-result.json unavailable' },
  literalCalls: literal, computedCalls: computed, loaderCompatibilitySectionGenerators: loaderCompatibilityGenerators,
  injectedConfigLoaderParameters: [runtimeConfigProofInjection], publicAccessorCalls: all.publicAccessorCalls,
  compatibilityPropertyReads: all.propertyReads, validNonGetterApiBindings: all.nonGetterApiBindings, unsupportedApisOrBindings: all.unsupported, parseErrors: all.parseErrors,
  summary: {
    literalCallCount: literal.length, computedCallCount: computed.length, loaderCompatibilitySectionGeneratorCount: loaderCompatibilityGenerators.length,
    compatibilityPropertyReadCount: all.propertyReads.length, validNonGetterApiBindingCount: all.nonGetterApiBindings.length,
    publicAccessorCallCount: all.publicAccessorCalls.length,
    missingCanonicalPaths: literal.filter(row => row.canonicalExists === false),
    missingRoleSourcePaths: literal.filter(row => row.sourceByRole && Object.values(row.sourceByRole).every(value => value === null)),
    computedWithoutEnumeratedLocalCaller: computed.filter(row => !row.wrapper || row.callers.length === 0),
    unsupportedCount: all.unsupported.length, parseErrorCount: all.parseErrors.length,
  },
};
fs.writeFileSync(path.join(HERE, 'getter-ast-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ candidate: HEAD, ...report.summary }, null, 2));
