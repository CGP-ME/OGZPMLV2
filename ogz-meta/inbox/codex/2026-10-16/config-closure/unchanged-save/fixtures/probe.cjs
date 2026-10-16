'use strict';

// Exercise pinned loader/handler source with private canonical files and the real
// atomic writer. No broker, socket, PM2, or production state is contacted.
const assert = require('assert/strict');
const cp = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = process.cwd();
const ref = "ce7de64803fbe3baf69170948ec2cf179330408a";
const packet = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(packet, 'private'), { recursive: true });
const dir = fs.mkdtempSync(path.join(packet, 'private/probe-'));
const source = file => {
  const pinned = path.join(__dirname, file.replaceAll('/', '__') + '.cjs');
  return file.endsWith('.json') ? JSON.stringify(require(pinned)) : fs.readFileSync(pinned, 'utf8');
};
const canonicalSettings = path.join(root, 'config/settings.json');
const canonicalInternals = path.join(root, 'config/internals.json');
const privateSettings = path.join(dir, 'settings.json');
fs.writeFileSync(privateSettings, source('config/settings.json'));
const internals = Buffer.from(source('config/internals.json'));
const actualRead = fs.readFileSync;
const actualLoad = Module._load;
const atomicWriter = require(path.join(root, 'core/AtomicWrite'));
let writes = 0;
fs.readFileSync = function (file, ...args) {
  if (file === canonicalSettings) return actualRead.call(this, privateSettings, ...args);
  if (file === canonicalInternals) return typeof args[0] === 'string' || args[0]?.encoding ? internals.toString() : internals;
  return actualRead.call(this, file, ...args);
};
Module._load = function (request, parent, isMain) {
  const filename = Module._resolveFilename(request, parent, isMain);
  const relative = typeof filename === 'string' ? path.relative(root, filename) : '';
  if (relative === 'core/AtomicWrite.js' && parent?.filename === path.join(root, 'foundation/ConfigLoader.js')) {
    return { writeJsonAtomic(target, value, options) {
      assert.equal(target, canonicalSettings);
      atomicWriter.writeJsonAtomic(privateSettings, value, options);
      writes += 1;
    } };
  }
  // These collaborators are irrelevant to handleSettings; constructing a real
  // StateManager would read/write unrelated runtime state.
  if (parent?.filename === path.join(root, 'core/WebSocketManager.js')) {
    if (relative === 'core/StateManager.js') return { getInstance: () => ({}) };
    if (relative === 'core/TradeNarrator.js') return { getNarrator: () => ({}) };
    if (relative === 'core/BotStateFrame.js') return { buildBotStateFrame: () => ({}) };
  }
  if (!relative || relative.startsWith('..') || relative.startsWith('node_modules/') || path.isAbsolute(relative)
      || !/\.(js|cjs|json)$/.test(relative)) return actualLoad.apply(this, arguments);
  if (!fs.existsSync(path.join(__dirname, relative.replaceAll('/', '__') + '.cjs'))) return actualLoad.apply(this, arguments);
  if (require.cache[filename]) return require.cache[filename].exports;
  const mod = new Module(filename, parent);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = mod;
  if (relative.endsWith('.json')) mod.exports = JSON.parse(source(relative));
  else mod._compile(source(relative), filename);
  return mod.exports;
};
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = path.join(dir, 'absent.env');
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) {
  process.env[key] = `fixture-${key}`;
}
const result = { candidate: ref, checks: [] };
try {
  const loader = require(path.join(root, 'foundation/ConfigLoader'));
  loader.load({ role: 'bot', silent: true, loadDotenv: false });
  const WebSocketManager = require(path.join(root, 'core/WebSocketManager'));
  let applications = 0;
  const sent = [];
  const handler = new WebSocketManager({
    onSettingsApplied: () => { applications += 1; },
    dashboardWs: { readyState: 1, send: value => sent.push(JSON.parse(value)) },
  });
  const request = changes => {
    const view = loader.getSettingsView();
    return { type: 'save_settings', requestId: `probe-${sent.length}`, changes,
      expectedRevision: view.configuration.settings, expectedSettingsHash: view.configuration.settingsHash };
  };
  const key = 'confidence.minTradeConfidence';
  const initial = loader.get(key);
  const snapshot = loader.getCachedSnapshot();
  const bytes = fs.readFileSync(privateSettings, 'utf8');
  const sameRequest = request({ [key]: initial });
  const same = handler.handleSettings(sameRequest);
  assert.equal(same.success, true);
  assert.equal(same.saved, true);
  assert.equal(same.applied, true);
  result.initialUnchangedSave = { writes, applications, previousRevision: snapshot.revisions.settings,
    resultingRevision: same.configuration.settings };
  assert.equal(writes, 0);
  assert.equal(applications, 0);
  assert.equal(same.changed, false);
  assert.strictEqual(loader.getCachedSnapshot(), snapshot);
  assert.equal(fs.readFileSync(privateSettings, 'utf8'), bytes);
  assert.equal(handler.handleSettings(sameRequest).changed, false);
  result.checks.push('unchanged and repeated identical request: no write, revision, snapshot or callback mutation');

  const currentFields = loader.getSettingsView().fields;
  const allValues = Object.fromEntries(Object.entries(currentFields).filter(([, field]) => field.editable)
    .map(([name, field]) => [name, structuredClone(field.value)]));
  const allUnchanged = handler.handleSettings(request(allValues));
  assert.equal(allUnchanged.success, true, JSON.stringify({ reason: allUnchanged.reason, path: allUnchanged.path }));
  assert.equal(allUnchanged.changed, false);
  assert.equal(writes, 0);
  assert.equal(applications, 0);
  assert.strictEqual(loader.getCachedSnapshot(), snapshot);
  result.editableFieldsExercised = Object.keys(allValues).length;
  result.checks.push('all editable current values in one save preserve the canonical file and cached snapshot');

  const changedValue = initial === 0.51 ? 0.52 : 0.51;
  const changeRequest = request({ [key]: changedValue });
  const changed = handler.handleSettings(changeRequest);
  assert.equal(changed.changed, true);
  assert.equal(changed.success, true);
  assert.equal(writes, 1);
  assert.equal(applications, 1);
  assert.equal(changed.configuration.settings, same.configuration.settings + 1);
  assert.equal(loader.get(key), changedValue);
  const stored = JSON.parse(fs.readFileSync(privateSettings, 'utf8'));
  assert.equal(stored.launchProfiles.paper.confidence.minTradeConfidence, changedValue);
  assert.equal(loader.snapshot({ ...process.env, PROFILE: 'paper' }, { role: 'bot', silent: true, loadDotenv: false }).config.confidence.minTradeConfidence, changedValue);
  result.checks.push('real edit: one actual atomic write, revision increment, active-profile persistence, reload and callback');

  const afterChange = loader.getCachedSnapshot();
  const stale = handler.handleSettings(changeRequest);
  assert.equal(stale.success, false);
  assert.equal(stale.reason, 'settings_revision_changed');
  const repeated = handler.handleSettings(request({ [key]: changedValue }));
  assert.equal(repeated.changed, false);
  assert.strictEqual(loader.getCachedSnapshot(), afterChange);
  assert.equal(writes, 1);
  assert.equal(applications, 1);
  result.checks.push('stale revision remains rejected; repeated current-value save has no side effects');

  // Also cover array equality and a mixed changed/unchanged request.
  const view = loader.getSettingsView();
  const arrayKey = Object.entries(view.fields).find(([, entry]) => Array.isArray(entry.value))?.[0];
  assert.ok(arrayKey, 'a real editable array descriptor must be present');
  assert.equal(handler.handleSettings(request({ [arrayKey]: [...loader.get(arrayKey)] })).changed, false);
  assert.equal(writes, 1);
  const mixed = handler.handleSettings(request({ [arrayKey]: [...loader.get(arrayKey)], [key]: initial }));
  assert.equal(mixed.changed, true);
  assert.equal(writes, 2);
  assert.equal(applications, 2);
  assert.equal(loader.get(key), initial);
  result.checks.push('equal array contents are unchanged; mixed request still applies its genuine change');
  assert.deepEqual(sent.at(-1), mixed);
  result.checks.push('existing settings_result receipt keeps success/saved/applied and reaches socket transport');
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.error = error.stack;
  process.exitCode = 1;
} finally {
  fs.readFileSync = actualRead;
  Module._load = actualLoad;
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, receipt: path.relative(root, path.join(dir, 'receipt.json')) }, null, 2));
}
