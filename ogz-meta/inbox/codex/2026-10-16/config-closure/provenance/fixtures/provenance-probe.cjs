'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = process.cwd();
const fixtureDir = path.join(__dirname, 'pinned');
const actualRead = fs.readFileSync;
const canonical = new Map([
  [path.join(root, 'config/settings.json'), path.join(fixtureDir, 'config__settings.json.cjs')],
  [path.join(root, 'config/internals.json'), path.join(fixtureDir, 'config__internals.json.cjs')],
]);
fs.readFileSync = function (file, ...args) {
  return actualRead.call(this, canonical.get(path.resolve(String(file))) || file, ...args);
};
const loaderFilename = path.join(root, 'foundation/ConfigLoader.js');
const actualLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const resolved = Module._resolveFilename(request, parent, isMain);
  if (resolved !== loaderFilename) return actualLoad.apply(this, arguments);
  if (require.cache[resolved]) return require.cache[resolved].exports;
  const mod = new Module(resolved, parent);
  mod.filename = resolved;
  mod.paths = Module._nodeModulePaths(path.dirname(resolved));
  require.cache[resolved] = mod;
  mod._compile(actualRead(path.join(fixtureDir, 'foundation__ConfigLoader.js.cjs'), 'utf8'), resolved);
  return mod.exports;
};

for (const [key, value] of Object.entries({
  ALPACA_API_KEY: 'fixture-alpaca-key', ALPACA_API_SECRET: 'fixture-alpaca-secret',
  KRAKEN_API_KEY: 'fixture-kraken-key', KRAKEN_API_SECRET: 'fixture-kraken-secret',
  STRIPE_SECRET_KEY: 'fixture-stripe-secret',
  POLYGON_API_KEY: 'fixture-polygon-key',
  WEBSOCKET_AUTH_TOKEN: 'fixture-dashboard-token', SIGNALSTACK_WEBHOOK_URL: 'https://fixture.invalid/webhook',
})) process.env[key] = value;
process.env.DOTENV_CONFIG_PATH = path.join('/tmp', 'absent-provenance.env');

const ConfigLoader = require(path.join(root, 'foundation/ConfigLoader.js'));
const canonicalSettings = JSON.parse(actualRead(canonical.get(path.join(root, 'config/settings.json')), 'utf8'));
const canonicalInternals = JSON.parse(actualRead(canonical.get(path.join(root, 'config/internals.json')), 'utf8'));
const leaves = (value, prefix = '', result = []) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, result);
  } else result.push(prefix);
  return result;
};
const snapshot = (role, profile) => {
  ConfigLoader._resetForTest();
  process.env.PROFILE = profile;
  const loaded = ConfigLoader.load({ role, silent: true, loadDotenv: false });
  const config = loaded.config;
  const missingSources = leaves(config).filter(key => loaded.sources?.[key] === undefined);
  return {
    role, profile, fingerprint: loaded.fingerprint, revisions: loaded.revisions,
    leafCount: leaves(config).length, sourceCount: Object.keys(loaded.sources || {}).length,
    missingSources, config, sources: loaded.sources,
  };
};
const result = { candidate: process.env.CONFIG_PROOF_REF || 'unqualified-source', roles: [], checks: [], failures: [] };
for (const profile of ['paper', 'production']) {
  const first = snapshot('bot', profile);
  const second = snapshot('bot', profile);
  result.roles.push({ role: 'bot', profile, fingerprint: first.fingerprint, revisions: first.revisions,
    leafCount: first.leafCount, sourceCount: first.sourceCount, missingSources: first.missingSources });
  result.sourceMaps = result.sourceMaps || {};
  result.sourceMaps[`bot/${profile}`] = first.sources;
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.revisions, second.revisions);
  assert.equal(first.missingSources.length, 0);
  assert.equal(second.missingSources.length, 0);
  result.checks.push(`bot/${profile} deterministic fingerprint and revision receipt`);
}
ConfigLoader._resetForTest();
process.env.PROFILE = 'paper';
const loadedOnce = ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
const receiptOnce = JSON.parse(JSON.stringify(loadedOnce.revisions));
const cached = ConfigLoader.load({ role: 'bot', silent: true, loadDotenv: false });
assert.strictEqual(cached, loadedOnce);
assert.deepEqual(cached.revisions, receiptOnce);
const forced = ConfigLoader.load({ role: 'bot', force: true, silent: true, loadDotenv: false });
assert.equal(forced.fingerprint, loadedOnce.fingerprint);
assert.deepEqual(forced.revisions, receiptOnce);
assert.deepEqual(forced.config, loadedOnce.config);
result.checks.push('same-process cache reuse preserves object and forced reload preserves values and receipt');
const supervisor = snapshot('supervisor', 'paper');
result.roles.push({ role: 'supervisor', profile: 'paper', fingerprint: supervisor.fingerprint,
  revisions: supervisor.revisions, leafCount: supervisor.leafCount, sourceCount: supervisor.sourceCount,
  missingSources: supervisor.missingSources });
result.sourceMaps = result.sourceMaps || {};
result.sourceMaps['supervisor/paper'] = supervisor.sources;
assert.equal(supervisor.missingSources.length, 0);
result.checks.push('supervisor source ownership complete');
ConfigLoader._resetForTest();
process.env.PROFILE = 'paper';
const dashboard = snapshot('dashboard', 'paper');
result.roles.push({ role: 'dashboard', profile: 'paper', fingerprint: dashboard.fingerprint,
  revisions: dashboard.revisions, leafCount: dashboard.leafCount, sourceCount: dashboard.sourceCount,
  missingSources: dashboard.missingSources });
result.sourceMaps['dashboard/paper'] = dashboard.sources;
assert.equal(dashboard.missingSources.length, 0);
result.checks.push('dashboard source ownership complete');
const checkout = snapshot('checkout', 'paper');
result.roles.push({ role: 'checkout', profile: 'paper', fingerprint: checkout.fingerprint,
  revisions: checkout.revisions, leafCount: checkout.leafCount, sourceCount: checkout.sourceCount,
  missingSources: checkout.missingSources });
result.sourceMaps['checkout/paper'] = checkout.sources;
assert.equal(checkout.missingSources.length, 0);
result.checks.push('checkout source ownership complete');
const marketData = snapshot('market-data-tool', 'paper');
result.roles.push({ role: 'market-data-tool', profile: 'paper', fingerprint: marketData.fingerprint,
  revisions: marketData.revisions, leafCount: marketData.leafCount, sourceCount: marketData.sourceCount,
  missingSources: marketData.missingSources });
result.sourceMaps['market-data-tool/paper'] = marketData.sources;
assert.equal(marketData.missingSources.length, 0);
assert.deepEqual(marketData.config.tooling.stockDownload, canonicalInternals.tooling.stockDownload);
assert.deepEqual(marketData.config.services.marketData.alpaca.baseUrl, canonicalSettings.services.dashboard.stockData.baseUrl);
assert.deepEqual(marketData.config.services.marketData.alpaca.symbols, canonicalSettings.services.dashboard.stockData.symbols);
result.marketDataConsumer = {
  source: 'scripts/fetch-stock-data.js:13-22',
  configPath: 'config.tooling.stockDownload',
  consumers: ['fetchBars:77-105', 'resolveDownloadRange:65-74', 'write output:162-180'],
  canonicalMatch: true,
};
result.checks.push('market-data-tool source ownership and stockDownload consumer route complete');

const legacyNames = {
  MAX_POSITION_SIZE_PCT: '0.777', TAKE_PROFIT_PERCENT: '77', STOP_LOSS_PERCENT: '-77',
  ATR_FILTER_ENABLED: 'false', ATR_MIN_PERCENT: '77', DIRECTION_FILTER: 'short_only',
  CANDLE_TIMEFRAME: '1d', ENABLE_RSI: 'false', FEE_MAKER: '0.77', INITIAL_BALANCE: '777777',
};
for (const [key, value] of Object.entries(legacyNames)) process.env[key] = value;
const clean = snapshot('bot', 'paper');
for (const key of Object.keys(legacyNames)) delete process.env[key];
const after = snapshot('bot', 'paper');
assert.equal(clean.fingerprint, after.fingerprint);
assert.deepEqual(clean.revisions, after.revisions);
result.checks.push('legacy environment sentinel names do not override canonical settings');

const tuning = ConfigLoader.listTuningProfileNames();
const tuningResolved = tuning.map(name => ConfigLoader.resolveTuningProfile(name));
const fees = ConfigLoader.listFeeProfileNames();
const feeResolved = fees.map(name => ConfigLoader.resolveFeeProfile(name));
const parallel = ConfigLoader.getParallelBacktestConfig();
const matrix = ConfigLoader.getMatrixSweepConfig();
assert.deepEqual(tuning, Object.keys(canonicalSettings.tuningProfiles.definitions));
assert.deepEqual(fees, Object.keys(canonicalSettings.feeProfiles.definitions));
for (const profile of tuning) assert.deepEqual(tuningResolved[tuning.indexOf(profile)], canonicalSettings.tuningProfiles.definitions[profile]);
for (const profile of fees) assert.deepEqual(feeResolved[fees.indexOf(profile)], canonicalSettings.feeProfiles.definitions[profile]);
assert.deepEqual(parallel, canonicalInternals.tooling.parallelBacktest);
assert.deepEqual(matrix, canonicalInternals.tooling.matrixSweep);
result.accessors = { tuningProfiles: tuning, feeProfiles: fees,
  parallelMatchesCanonical: true, matrixMatchesCanonical: true };
result.checks.push('parallel, matrix, tuning-profile and fee-profile accessors resolve canonical fixture values');
console.log(JSON.stringify(result));
