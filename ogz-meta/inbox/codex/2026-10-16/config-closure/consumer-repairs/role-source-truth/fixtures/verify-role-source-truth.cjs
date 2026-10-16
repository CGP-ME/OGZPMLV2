'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const packet = path.resolve(__dirname, '..');
const root = process.cwd();
const actualRead = fs.readFileSync;
const actualLoad = Module._load;
const loaderFilename = path.join(root, 'foundation/ConfigLoader.js');
const atomicFilename = path.join(root, 'core/AtomicWrite.js');
const settingsFilename = path.join(root, 'config/settings.json');
const internalsFilename = path.join(root, 'config/internals.json');

for (const [key, value] of Object.entries({
  ALPACA_API_KEY: 'fixture-alpaca-key',
  ALPACA_API_SECRET: 'fixture-alpaca-secret',
  KRAKEN_API_KEY: 'fixture-kraken-key',
  KRAKEN_API_SECRET: 'fixture-kraken-secret',
  POLYGON_API_KEY: 'fixture-polygon-key',
  STRIPE_SECRET_KEY: 'fixture-stripe-secret',
  WEBSOCKET_AUTH_TOKEN: 'fixture-dashboard-token',
})) process.env[key] = value;
process.env.DOTENV_CONFIG_PATH = '/tmp/absent-role-source-truth.env';

function pathsOf(value, prefix = '', output = new Set()) {
  output.add(prefix);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) pathsOf(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function getPath(value, dotted) {
  if (dotted === '') return value;
  return dotted.split('.').reduce((current, part) => (
    current && Object.prototype.hasOwnProperty.call(current, part) ? current[part] : undefined
  ), value);
}

function configLabel(label) {
  const match = /^config:(settings|internals)\.json:(.*)$/.exec(label);
  return match ? { owner: match[1], path: match[2] } : null;
}

function runVariant(variant) {
  const fixtureDir = path.join(packet, 'fixtures', variant);
  const settings = JSON.parse(actualRead(path.join(fixtureDir, 'config__settings.json.cjs'), 'utf8'));
  const internals = JSON.parse(actualRead(path.join(fixtureDir, 'config__internals.json.cjs'), 'utf8'));
  const sourceFor = filename => actualRead(path.join(fixtureDir, filename), 'utf8');
  fs.readFileSync = function (filename, ...args) {
    const resolved = path.resolve(String(filename));
    if (resolved === settingsFilename) return sourceFor('config__settings.json.cjs');
    if (resolved === internalsFilename) return sourceFor('config__internals.json.cjs');
    return actualRead.call(this, filename, ...args);
  };
  Module._load = function (request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved !== loaderFilename && resolved !== atomicFilename) return actualLoad.apply(this, arguments);
    if (require.cache[resolved]) return require.cache[resolved].exports;
    const mod = new Module(resolved, parent);
    mod.filename = resolved;
    mod.paths = Module._nodeModulePaths(path.dirname(resolved));
    require.cache[resolved] = mod;
    mod._compile(sourceFor(resolved === loaderFilename ? 'foundation__ConfigLoader.js.cjs' : 'core__AtomicWrite.js.cjs'), resolved);
    return mod.exports;
  };
  try {
    delete require.cache[loaderFilename];
    delete require.cache[atomicFilename];
    const ConfigLoader = require(loaderFilename);
    const snapshots = {};
    for (const [role, profile] of [
      ['bot', 'paper'], ['bot', 'production'], ['supervisor', 'paper'],
      ['dashboard', 'paper'], ['checkout', 'paper'], ['market-data-tool', 'paper'],
    ]) {
      ConfigLoader._resetForTest();
      process.env.PROFILE = profile;
      const loaded = ConfigLoader.load({ role, silent: true, loadDotenv: false });
      snapshots[`${role}/${profile}`] = { config: loaded.config, sources: loaded.sources };
    }
    return { settings, internals, snapshots };
  } finally {
    delete require.cache[loaderFilename];
    delete require.cache[atomicFilename];
    fs.readFileSync = actualRead;
    Module._load = actualLoad;
  }
}

function invalidCanonicalLabels(snapshot, settings, internals) {
  const invalid = [];
  for (const [runtimePath, label] of Object.entries(snapshot.sources)) {
    const parsed = configLabel(label);
    if (!parsed) continue;
    const owner = parsed.owner === 'settings' ? settings : internals;
    if (getPath(owner, parsed.path) === undefined) invalid.push({ runtimePath, label });
  }
  return invalid;
}

function unusedSourceKeys(snapshot) {
  const configPaths = pathsOf(snapshot.config);
  return Object.keys(snapshot.sources).filter((runtimePath) => !configPaths.has(runtimePath));
}

const baseline = runVariant('baseline');
const candidate = runVariant('candidate');
for (const role of Object.keys(candidate.snapshots)) assert.deepEqual(candidate.snapshots[role].config, baseline.snapshots[role].config, role + ' config values changed');
const baselineInvalid = Object.fromEntries(Object.entries(baseline.snapshots).map(([role, snapshot]) => [
  role, invalidCanonicalLabels(snapshot, baseline.settings, baseline.internals),
]));
const candidateInvalid = Object.fromEntries(Object.entries(candidate.snapshots).map(([role, snapshot]) => [
  role, invalidCanonicalLabels(snapshot, candidate.settings, candidate.internals),
]));

assert.equal(baselineInvalid['bot/paper'].length, 1);
assert.equal(baselineInvalid['bot/production'].length, 1);
assert.equal(baselineInvalid['market-data-tool/paper'].length, 16);
assert.equal(Object.values(baselineInvalid).flat().length, 18);
for (const [role, invalid] of Object.entries(candidateInvalid)) assert.equal(invalid.length, 0, role);
for (const [role, snapshot] of Object.entries(candidate.snapshots)) {
  for (const [runtimePath, label] of Object.entries(snapshot.sources)) {
    const parsed = configLabel(label);
    if (!parsed) continue;
    const canonicalValue = getPath(parsed.owner === 'settings' ? candidate.settings : candidate.internals, parsed.path);
    const runtimeValue = getPath(snapshot.config, runtimePath);
    if ((canonicalValue === null || typeof canonicalValue !== 'object') &&
        (runtimeValue === null || typeof runtimeValue !== 'object')) {
      assert.deepEqual(runtimeValue, canonicalValue, role + ':' + runtimePath + ' scalar source value mismatch');
    }
  }
}
const candidateUnused = Object.fromEntries(Object.entries(candidate.snapshots).map(([role, snapshot]) => [role, unusedSourceKeys(snapshot)]));
for (const [role, keys] of Object.entries(candidateUnused)) assert.equal(keys.length, 0, role);

for (const role of ['bot/paper', 'bot/production']) {
  const snapshot = candidate.snapshots[role];
  assert.equal(snapshot.sources['broker.tradingInterval'], 'config:internals.json:broker.tradingIntervalMs');
  assert.equal(snapshot.config.broker.tradingInterval, candidate.internals.broker.tradingIntervalMs);
  assert.equal(snapshot.sources['evalRules.ttp.volumeCap.maxReferenceAgeLimitMs'], 'config:internals.json:dataFeed.volumeCapMaxReferenceAgeLimitMs');
  assert.equal(snapshot.config.evalRules.ttp.volumeCap.maxReferenceAgeLimitMs, candidate.internals.dataFeed.volumeCapMaxReferenceAgeLimitMs);
}

const supervisor = candidate.snapshots['supervisor/paper'];
assert.equal(supervisor.sources.schemaVersion, 'config:internals.json:schemaVersion');
assert.equal(supervisor.sources.revision, 'config:internals.json:revision');
assert.equal(supervisor.config.schemaVersion, candidate.internals.schemaVersion);
assert.equal(supervisor.config.revision, candidate.internals.revision);

const market = candidate.snapshots['market-data-tool/paper'];
assert.equal(market.sources.services, 'derived:market-data-tool-role-projection');
assert.equal(market.sources['services.marketData'], 'derived:market-data-tool-role-projection');
assert.equal(market.sources['services.marketData.polygon'], 'derived:market-data-tool-role-projection');
assert.equal(market.sources['services.marketData.alpaca'], 'config:settings.json:services.dashboard.stockData');
assert.deepEqual(
  Object.fromEntries(Object.keys(candidate.settings.services.dashboard.stockData).map((key) => [key, market.config.services.marketData.alpaca[key]])),
  candidate.settings.services.dashboard.stockData
);
for (const runtimePath of pathsOf(candidate.settings.services.dashboard.stockData, 'services.marketData.alpaca')) {
  if (runtimePath === 'services.marketData.alpaca') continue;
  assert.equal(market.sources[runtimePath], 'config:settings.json:services.dashboard.stockData', runtimePath);
}

process.stdout.write(`${JSON.stringify({
  result: 'pass',
  baselineInvalidCanonicalLabels: Object.fromEntries(Object.entries(baselineInvalid).filter(([, rows]) => rows.length).map(([role, rows]) => [role, rows.length])),
  candidateInvalidCanonicalLabels: 0,
  candidateSourceKeysAllReachRoleConfig: true,
  candidateUnusedSourceKeys: 0,
  supervisorRevisionSource: supervisor.sources.revision,
  marketDataCanonicalSource: market.sources['services.marketData.alpaca'],
  botProjectionSources: {
    tradingInterval: candidate.snapshots['bot/paper'].sources['broker.tradingInterval'],
    volumeCap: candidate.snapshots['bot/paper'].sources['evalRules.ttp.volumeCap.maxReferenceAgeLimitMs'],
  },
  limitation: 'Isolated copied-loader proof only; no process, broker, or runtime activation was exercised.'
}, null, 2)}\n`);
