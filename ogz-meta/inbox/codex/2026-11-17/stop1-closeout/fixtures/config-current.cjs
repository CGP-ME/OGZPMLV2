'use strict';
require(process.cwd() + '/test/helpers/require-isolation.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const root = process.cwd();
const settingsPath = path.join(root, 'config/settings.json');
const internalsPath = path.join(root, 'config/internals.json');
const canonicalSettings = JSON.parse(fs.readFileSync(settingsPath));
const canonicalInternals = JSON.parse(fs.readFileSync(internalsPath));
const lookup = (object, key) => key ? key.split('.').reduce((v, k) => v?.[k], object) : object;
const leaves = (value, prefix = '', rows = []) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, rows);
  } else rows.push(prefix);
  return rows;
};
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN', 'STRIPE_SECRET_KEY', 'POLYGON_API_KEY']) process.env[key] = `synthetic-${key}`;
process.env.PROFILE = 'paper';
delete process.env.DOTENV_CONFIG_PATH;
const loader = require(path.join(root, 'foundation/ConfigLoader'));
if (process.argv[2] === 'snapshot') {
  process.env.PROFILE = process.argv[4];
  const loaded = loader.load({ role: process.argv[3], silent: true, loadDotenv: false });
  const sourceProblems = [];
  for (const key of leaves(loaded.config)) assert.ok(Object.hasOwn(loaded.sources, key), `Unowned runtime leaf: ${key}`);
  for (const [key, source] of Object.entries(loaded.sources)) {
    assert.notEqual(lookup(loaded.config, key), undefined, `Orphan source: ${key}`);
    if (!source.startsWith('config:')) continue;
    const [, owner, dotted] = source.split(':');
    assert.ok(['settings.json', 'internals.json'].includes(owner), source);
    const expected = lookup(owner === 'settings.json' ? canonicalSettings : canonicalInternals, dotted);
    if (expected === undefined) sourceProblems.push({ key, source, reason: 'canonical_source_path_absent' });
    const actual = lookup(loaded.config, key);
    if ((expected === null || typeof expected !== 'object') && (actual === null || typeof actual !== 'object')) assert.deepEqual(actual, expected, source);
  }
  console.log(JSON.stringify({ ...loaded, sourceProblems }));
} else if (process.argv[2] === 'provenance') {
  const archived = Object.fromEntries(require('./archived-env-names.json').map(key => [key, `archived-sentinel-${key}`]));
  assert.equal(Object.keys(archived).length, 184);
  const roles = [];
  for (const [role, profile] of [['bot', 'paper'], ['bot', 'production'], ['dashboard', 'paper'], ['supervisor', 'paper'], ['checkout', 'paper'], ['market-data-tool', 'paper']]) {
    const run = env => {
      const result = cp.spawnSync(process.execPath, [__filename, 'snapshot', role, profile], { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return JSON.parse(result.stdout);
    };
    const clean = run(process.env), injected = run({ ...process.env, ...archived });
    for (const key of ['config', 'sources', 'fingerprint', 'revisions']) assert.deepEqual(injected[key], clean[key], `${role}: archived environment changed ${key}`);
    const sourceKinds = {};
    for (const source of Object.values(clean.sources)) {
      const kind = source.startsWith('config:') ? source.split(':').slice(0, 2).join(':') : source.split(':')[0];
      sourceKinds[kind] = (sourceKinds[kind] || 0) + 1;
    }
    roles.push({ role, profile, fingerprint: clean.fingerprint, revisions: clean.revisions, configSha256: crypto.createHash('sha256').update(JSON.stringify(clean.config)).digest('hex'), leaves: leaves(clean.config).length, sources: Object.keys(clean.sources).length, sourceKinds, sourceProblems: clean.sourceProblems, allSourcesResolved: clean.sourceProblems.length === 0, archivedEnvironmentCannotOverride: true });
  }
  console.log('STOP1_CONFIG_PROVENANCE_RECEIPT', JSON.stringify({ roles, archivedEnvironmentNames: Object.keys(archived).length, freshProcessPerSnapshot: true, credentialValues: 'synthetic only', runtimeActivated: false }));
  assert.ok(roles.every(role => role.allSourcesResolved), 'Unresolved source paths');
} else if (process.argv[2] === 'editable') {
  loader.load({ role: 'bot', silent: true, loadDotenv: false });
  const definitions = loader.getSettingsView().fields;
  const originalBytes = fs.readFileSync(settingsPath);
  const rows = [], failures = [];
  const save = changes => {
    const before = loader.getSettingsView().configuration;
    return loader.saveSettings({ requestId: `proof-${rows.length}`, expectedRevision: before.settings, expectedSettingsHash: before.settingsHash, changes });
  };
  function choices(field) {
    const value = field.value;
    if (field.type === 'boolean') return [!value];
    if (field.values) return field.values.filter(x => x !== value);
    if (field.type === 'number') {
      const step = field.integer ? 1 : Math.max(0.001, Math.abs(value) * 0.01);
      return [value + step, value - step, (field.min + field.max) / 2].filter(x => Number.isFinite(x) && x !== value && x >= field.min && x <= field.max && (!field.integer || Number.isSafeInteger(x)) && (!field.exclusiveMin || x > field.min) && (!field.exclusiveMax || x < field.max));
    }
    if (field.format === 'integer_list') return [value.split(',').map(x => Number(x) + 1).join(',')];
    if (field.type === 'string' && /^\d\d:\d\d$/.test(value)) {
      const minute = Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
      return [minute + 1, minute - 1].filter(x => x >= 0 && x < 1440).map(x => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'));
    }
    if (field.type === 'string' && /time\s?zone/i.test(field.label)) return [value === 'UTC' ? 'America/New_York' : 'UTC'];
    if (field.type === 'string' && field.label.includes('system instruction')) return [value + ' Use the supplied data.'];
    if (field.type === 'array' && value.length > 1) return [[...value].reverse()];
    return [];
  }
  for (const [key, field] of Object.entries(definitions)) {
    if (!field.editable) continue;
    if (process.env.CONFIG_PROBE_KEYS && !process.env.CONFIG_PROBE_KEYS.split(',').includes(key)) continue;
    let proved = false;
    const attempts = [];
    for (const value of choices(field)) {
      if (JSON.stringify(value) === JSON.stringify(field.value)) continue;
      // The per-share model and its positive charge are one valid save, not
      // a model with every fee input still set to zero. Fixture values only.
      const changes = key === 'fees.model' && value === 'per_share_minimum'
        ? { [key]: value, 'fees.perShare': 0.005 } : { [key]: value };
      const originals = Object.fromEntries(Object.keys(changes).map(name => [name, loader.get(name)]));
      const result = save(changes);
      if (!result.success) { attempts.push(result.reason); continue; }
      assert.equal(result.changed, true, key);
      assert.deepEqual(loader.get(key), value, key);
      const canonicalPath = field.scope === 'active_launch_profile' ? `launchProfiles.paper.${key}` : key;
      assert.deepEqual(lookup(JSON.parse(fs.readFileSync(settingsPath)), canonicalPath), value, key);
      const loaded = loader.snapshot({ ...process.env, PROFILE: 'paper' }, { role: 'bot', silent: true, loadDotenv: false });
      assert.deepEqual(lookup(loaded.config, key), value, key);
      const stable = loader.getCachedSnapshot(), bytes = fs.readFileSync(settingsPath);
      const repeated = save(changes);
      assert.equal(repeated.changed, false, key);
      assert.strictEqual(loader.getCachedSnapshot(), stable, key);
      assert.deepEqual(fs.readFileSync(settingsPath), bytes, key);
      assert.equal(save(originals).success, true, key);
      rows.push({ key, source: field.source, effect: field.effect, canonicalPath, companionFields: Object.keys(changes).filter(name => name !== key) });
      proved = true;
      break;
    }
    if (!proved) failures.push({ key, attempts });
  }
  const finalSettings = JSON.parse(fs.readFileSync(settingsPath));
  const beforeSettings = JSON.parse(originalBytes);
  for (const key of ['revision', 'updatedAt', 'contentHash']) { delete finalSettings[key]; delete beforeSettings[key]; }
  assert.deepEqual(finalSettings, beforeSettings);
  console.log('STOP1_EDITABLE_TRANSPORT_RECEIPT', JSON.stringify({ total: Object.keys(definitions).length, selected: process.env.CONFIG_PROBE_KEYS || 'all', proved: rows.length, failures, changedSavePersistReloadUnchangedRepeatRestore: true, restartLabelled: rows.filter(r => /restart/.test(r.effect)).map(r => r.key), rows, limitation: 'Transport proof; downstream behavior has separate family fixtures.' }));
  assert.equal(failures.length, 0);
}
