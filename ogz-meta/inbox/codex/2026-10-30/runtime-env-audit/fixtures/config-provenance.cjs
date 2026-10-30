'use strict';
require('../../../../../../test/helpers/require-isolation.cjs')();
const fs = require('fs');
const presence = require('./environment-presence.json');
// This disposable fixture contains key names/presence only, never operator secrets.
fs.writeFileSync('.env', presence.dotenvKeys.map(key => `${key}=${presence.blankKeys.includes(key) ? '' : 'synthetic-audit-present'}`).join('\n'));
const Loader = require('../../../../../../foundation/ConfigLoader');
const snapshot = Loader.snapshot({ PROFILE: presence.profile }, { role: 'bot', silent: true });
const sources = snapshot.sources;
const rows = [];
const canonical = Object.fromEntries(['config/settings.json', 'config/internals.json'].map(file => [file, JSON.parse(fs.readFileSync(file, 'utf8'))]));
function visit(value, runtimePath) {
  if (value && typeof value === 'object' && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) visit(child, runtimePath ? `${runtimePath}.${key}` : key);
    return;
  }
  const source = sources[runtimePath] || null;
  const match = /^config:(settings\.json|internals\.json):(.+)$/.exec(source || '');
  let sourceFile = null, sourcePath = null;
  if (match) {
    sourceFile = 'config/' + match[1];
    let root = runtimePath;
    while (root.includes('.') && sources[root.slice(0, root.lastIndexOf('.'))] === source) root = root.slice(0, root.lastIndexOf('.'));
    sourcePath = match[2] + runtimePath.slice(root.length);
    // Object spreads may replace the parent's source label while preserving
    // its settings-owned children. Resolve those children beneath that owner.
    const baseValue = match[2].split('.').reduce((v, k) => v?.[k], canonical[sourceFile]);
    if (baseValue && typeof baseValue === 'object' && runtimePath.startsWith(match[2] + '.')) sourcePath = runtimePath;
  } else if (source?.startsWith('config:launchProfiles.')) {
    sourceFile = 'config/settings.json'; sourcePath = source.slice('config:'.length);
  }
  const ownerValue = sourceFile ? sourcePath.split('.').reduce((v, k) => v?.[k], canonical[sourceFile]) : undefined;
  rows.push({ runtimePath, source, sourceFile, sourcePath,
    sourceValueMatchesSnapshot: sourceFile ? JSON.stringify(ownerValue) === JSON.stringify(value) : null,
    type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    credential: /^(dotenv|explicit):/.test(source || ''),
    presence: /^(dotenv|explicit):/.test(source || '') ? Boolean(value) : undefined,
    definitionCatalog: ['launchProfiles', 'tuningProfiles', 'feeProfiles', 'internals.tooling', 'services.checkout', 'services.supervisor'].some(p => runtimePath === p || runtimePath.startsWith(p + '.')) });
}
visit(snapshot.config, '');
// Parse JSON source locations as data; never execute the bot or broker modules.
const acorn = require('acorn');
const locations = {};
for (const file of ['config/settings.json', 'config/internals.json']) {
  const ast = acorn.parseExpressionAt(fs.readFileSync(file, 'utf8'), 0, { ecmaVersion: 'latest', locations: true });
  const map = {};
  function walk(node, prefix) {
    map[prefix] = node.loc.start.line;
    if (node.type === 'ObjectExpression') for (const prop of node.properties) walk(prop.value, prefix ? `${prefix}.${prop.key.value}` : String(prop.key.value));
    if (node.type === 'ArrayExpression') node.elements.forEach((child, i) => walk(child, `${prefix}.${i}`));
  }
  walk(ast, ''); locations[file] = map;
}
for (const row of rows) row.sourceLine = locations[row.sourceFile]?.[row.sourcePath] || null;
process.stdout.write(JSON.stringify({ role: snapshot.role, fingerprint: snapshot.fingerprint,
  revisions: snapshot.revisions, sourceCount: Object.keys(sources).length, rows }) + '\n');
