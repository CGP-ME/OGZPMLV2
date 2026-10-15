'use strict';

// Read-only historical route extractor. It intentionally traces only the
// specified historical ConfigLoader and joins only identical runtime paths to
// the captured pre-archive source map. It reads neither .env nor private files.
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

const root = path.resolve(__dirname, '../../../../..');
const archive = path.join(root, 'ogz-meta/inbox/codex/2026-10-15/env-archive');
const baseline = '98c84304^';
const historicalPath = 'foundation/ConfigLoader.js';
const outputPath = path.join(__dirname, 'HISTORICAL-SAME-PATH-PROVENANCE.json');
const source = cp.execFileSync('git', ['show', `${baseline}:${historicalPath}`], { cwd: root, encoding: 'utf8' });
const reconciliation = JSON.parse(fs.readFileSync(path.join(archive, 'archived-key-reconciliation.json'), 'utf8'));
const effectiveBefore = JSON.parse(fs.readFileSync(path.join(archive, 'effective-sources-before.json'), 'utf8'));
const archivedKeys = new Set(reconciliation.rows.map(row => row.key));
const ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['optionalChaining'] });
const routeByKey = new Map();

function stringValue(node) {
  return t.isStringLiteral(node) ? node.value : null;
}

function propertyName(member) {
  if (!member.computed && t.isIdentifier(member.property)) return member.property.name;
  if (member.computed && t.isStringLiteral(member.property)) return member.property.value;
  return null;
}

function envCall(node) {
  if (!t.isCallExpression(node) || !t.isIdentifier(node.callee)) return null;
  if (!/^(?:env|envNumber|env(?:Str|Float|StrictFloat|Int|Bool|JsonObject|StringList))$/.test(node.callee.name)) return null;
  const key = stringValue(node.arguments[0]);
  return key ? { key, helper: node.callee.name, line: node.loc.start.line } : null;
}

function objectPropertyPath(objectPath, property) {
  if (!objectPath || !objectPath.isObjectExpression()) return null;
  for (const item of objectPath.get('properties')) {
    if (!item.isObjectProperty()) continue;
    const key = item.node.key;
    const name = t.isIdentifier(key) && !item.node.computed ? key.name : stringValue(key);
    if (name === property) return item.get('value');
  }
  return null;
}

function boundInitializerPath(identifierPath) {
  if (!identifierPath.isIdentifier()) return null;
  const binding = identifierPath.scope.getBinding(identifierPath.node.name);
  if (!binding || !binding.path.isVariableDeclarator()) return null;
  const init = binding.path.get('init');
  return init && init.node ? init : null;
}

// Resolve `BASE_CONFIG.foo.bar`-style static ancestry through the actual Babel
// binding. Do not resolve same-named bindings from another scope.
function staticMemberValuePath(memberPath) {
  const properties = [];
  let cursor = memberPath;
  while (cursor && cursor.isMemberExpression()) {
    const name = propertyName(cursor.node);
    if (!name) return null;
    properties.unshift(name);
    cursor = cursor.get('object');
  }
  let value = boundInitializerPath(cursor);
  for (const property of properties) {
    value = objectPropertyPath(value, property);
    if (!value) return null;
  }
  return value;
}

function envDependencies(expressionPath, seen = new Set()) {
  if (!expressionPath || !expressionPath.node || seen.has(expressionPath.node)) return [];
  seen.add(expressionPath.node);
  const node = expressionPath.node;
  const direct = envCall(node);
  if (direct) return [direct];
  if (expressionPath.isIdentifier()) return envDependencies(boundInitializerPath(expressionPath), seen);
  if (expressionPath.isMemberExpression()) return envDependencies(staticMemberValuePath(expressionPath), seen);
  const found = [];
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const children = expressionPath.get(key);
    for (const child of (Array.isArray(children) ? children : [children])) {
      if (child && child.node) found.push(...envDependencies(child, seen));
    }
  }
  return found;
}

// A direct env call under the historical BASE_CONFIG literal was a distinct
// compatibility route even when it was never passed through track(). Capture
// only its static object-property ancestry; array positions and dynamic keys
// intentionally remain unresolved rather than being guessed.
function baseConfigPropertyRoute(callPath) {
  const parts = [];
  let cursor = callPath;
  while (cursor && cursor.parentPath) {
    const parent = cursor.parentPath;
    if (parent.isArrayExpression()) return null;
    if (parent.isObjectProperty()) {
      const key = parent.node.key;
      const name = t.isIdentifier(key) && !parent.node.computed ? key.name : stringValue(key);
      if (!name) return null;
      parts.unshift(name);
    }
    if (parent.isVariableDeclarator()) {
      if (!t.isIdentifier(parent.node.id, { name: 'BASE_CONFIG' }) || parts.length === 0) return null;
      return {
        runtimePath: parts.join('.'),
        baseConfigLine: parent.node.loc.start.line,
      };
    }
    cursor = parent;
  }
  return null;
}

function pushRoute(key, route) {
  if (!archivedKeys.has(key)) return;
  const rows = routeByKey.get(key) || [];
  const identity = `${route.runtimePath}|${route.envHelper}|${route.envLine}|${route.trackLine}|${route.routeKind}`;
  if (!rows.some(row => `${row.runtimePath}|${row.envHelper}|${row.envLine}|${row.trackLine}|${row.routeKind}` === identity)) rows.push(route);
  routeByKey.set(key, rows);
}

traverse(ast, {
  CallExpression(p) {
    const node = p.node;
    if (!t.isIdentifier(node.callee, { name: 'track' })) return;
    const runtimePath = stringValue(node.arguments[0]);
    const valuePath = p.get('arguments')[1];
    if (!runtimePath || !valuePath || !valuePath.node) return;
    for (const dependency of envDependencies(valuePath)) {
      pushRoute(dependency.key, {
        runtimePath,
        trackLine: node.loc.start.line,
        envHelper: dependency.helper,
        envLine: dependency.line,
        routeKind: 'track_runtime_path',
      });
    }
  },
});

traverse(ast, {
  CallExpression(p) {
    const dependency = envCall(p.node);
    if (!dependency) return;
    const baseRoute = baseConfigPropertyRoute(p);
    if (!baseRoute) return;
    pushRoute(dependency.key, {
      ...baseRoute,
      trackLine: null,
      envHelper: dependency.helper,
      envLine: dependency.line,
      routeKind: 'legacy_base_config_property',
    });
  },
});

const sourceMap = effectiveBefore.sourceMap || {};
const rows = reconciliation.rows.map(row => {
  const routes = (routeByKey.get(row.key) || []).sort((a, b) => a.runtimePath.localeCompare(b.runtimePath) || a.envLine - b.envLine);
  return {
    key: row.key,
    historicalRoutes: routes.map(route => ({
      ...route,
      samePathOwnerBefore: Object.prototype.hasOwnProperty.call(sourceMap, route.runtimePath)
        ? sourceMap[route.runtimePath]
        : null,
      evidenceKind: Object.prototype.hasOwnProperty.call(sourceMap, route.runtimePath)
        ? `${route.routeKind}_same_path_owner_evidence_only`
        : `${route.routeKind}_no_exact_current_source_path`,
    })),
    unresolved: routes.length === 0 || routes.some(route => !Object.prototype.hasOwnProperty.call(sourceMap, route.runtimePath)),
    provenanceStatus: routes.length === 0
      ? 'unknown_no_route_in_scoped_historical_source'
      : 'historical_route_evidence_only',
    historicalValueMigrationAccepted: false,
  };
});
const routed = rows.filter(row => row.historicalRoutes.length > 0);
const samePath = routed.filter(row => row.historicalRoutes.some(route => route.samePathOwnerBefore !== null));
const result = {
  scope: 'Historical ConfigLoader route evidence only. Exact baseline and exact runtime-path source-map joins; no values, secrets, semantic replacement claims, or migration acceptance.',
  baseline: `${baseline}:${historicalPath}`,
  inputs: {
    archivedKeyInventory: 'ogz-meta/inbox/codex/2026-10-15/env-archive/archived-key-reconciliation.json',
    effectiveSourcesBefore: 'ogz-meta/inbox/codex/2026-10-15/env-archive/effective-sources-before.json',
  },
  counts: {
    archivedKeys: rows.length,
    keysWithHistoricalRoutes: routed.length,
    keysWithAtLeastOneSamePathOwner: samePath.length,
    unresolvedOrPartial: rows.filter(row => row.unresolved).length,
  },
  rows,
};
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: path.relative(root, outputPath), counts: result.counts }, null, 2));
