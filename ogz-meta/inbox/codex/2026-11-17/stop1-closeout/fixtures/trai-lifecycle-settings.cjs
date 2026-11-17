'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
process.env.PROFILE = 'paper';
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) process.env[key] = 'synthetic-stop1-fixture';
const loader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
loader.load({ role: 'bot', loadDotenv: false, silent: true });
let sequence = 0;
function save(changes, bot) {
  const { revisions } = loader.getCachedSnapshot();
  const receipt = loader.saveSettings({ requestId: `trai-lifecycle-${++sequence}`, expectedRevision: revisions.settings, expectedSettingsHash: revisions.settingsHash, changes });
  assert.equal(receipt.success, true, receipt.reason);
  if (receipt.changed && bot) bot.onSettingsApplied(loader.getCachedSnapshot(), receipt);
  return receipt;
}
save({ 'trai.enabled': false });
const pack = loader.get('trai.patternPackPath');
fs.mkdirSync(path.dirname(pack), { recursive: true });
fs.writeFileSync(pack, JSON.stringify({ patterns: [], antiPatterns: [], version: 'synthetic', source: 'fixture' }));
let providerAttempts = 0, providerFailure = false, releaseProvider;
const providerPending = new Promise(resolve => { releaseProvider = resolve; });
class ProviderCoreFixture {
  async initialize() {
    providerAttempts++;
    if (providerFailure) throw new Error('synthetic provider outage');
    await providerPending;
  }
}
const corePath = require.resolve(path.join(process.cwd(), 'core/trai_core'));
require.cache[corePath] = { id: corePath, filename: corePath, loaded: true, exports: ProviderCoreFixture };
const Advisor = require(path.join(process.cwd(), 'core/TRAIDecisionModule'));
const source = fs.readFileSync('run-empire-v2.js', 'utf8');
const ast = require('@babel/parser').parse(source, { sourceType: 'unambiguous' });
let getter, callback, query;
const contextGetters = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ClassMethod' && node.key?.name === 'trai' && node.kind === 'get') getter = source.slice(node.start, node.end);
  if (node.type === 'ClassMethod' && node.key?.name === 'handleTraiQuery') query = source.slice(node.start, node.end);
  if (node.type === 'AssignmentExpression' && node.left?.object?.type === 'ThisExpression' && node.left?.property?.name === 'onSettingsApplied') callback = source.slice(node.right.start, node.right.end);
  if (node.type === 'NewExpression' && ['OrderExecutor', 'TradingLoop', 'BacktestRunner'].includes(node.callee?.name)) {
    const property = node.arguments[0]?.properties.find(p => p.key?.name === 'trai');
    assert.equal(property?.kind, 'get');
    contextGetters.push(source.slice(property.start, property.end));
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);
assert.ok(getter && callback && query);
assert.equal(contextGetters.length, 3);
let backtestMode = false;
const failures = [], operations = [], messages = [];
const runtime = vm.createContext({
  ConfigLoader: { get: key => key === 'mode.backtest' ? backtestMode : loader.get(key), getCachedSnapshot: () => loader.getCachedSnapshot() },
  TRAIDecisionModule: Advisor, resolveTraiLlmConfig: ({ config }) => ({ ...config.trai.llm, apiKey: 'synthetic' }),
  resolvedConfig: loader.getCachedSnapshot(), console,
  runtimeAuditSink: { bindConfiguration() {}, setSourceReceiptId() {} }, logRuntimeConfigProof() {},
  captureRuntimeFatal: (...args) => failures.push(args),
});
function owner() {
  const bot = vm.runInContext(`({ ${getter}, ${query} })`, runtime);
  Object.assign(bot, { _trai: null, dashboardWs: { readyState: 1, send: raw => messages.push(JSON.parse(raw)) }, patternChecker: { memory: { refreshPersistenceSchedule() {} } },
    _trackRuntimeOperation(label, operation) { const promise = Promise.resolve().then(operation); operations.push(promise); return promise; } });
  bot.onSettingsApplied = vm.runInContext(`(function() { return ${callback}; })`, runtime).call(bot);
  return bot;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const bot = owner();
  assert.equal(bot.trai, null);
  assert.equal(bot._trai, null);
  const contexts = contextGetters.map(text => vm.runInNewContext(`({ ${text} })`, { traiOwner: bot }));
  const enabled = save({ 'trai.enabled': true }, bot);
  const advisor = bot.trai;
  assert.ok(advisor instanceof Advisor);
  for (const context of contexts) assert.equal(context.trai, advisor);
  const first = advisor.initialize(), concurrent = advisor.initialize();
  assert.equal(first, concurrent);
  await flush();
  assert.equal(providerAttempts, 1);
  releaseProvider();
  await first;
  await flush();
  const bank = advisor.patternMemory;
  bank.set('fixture', { samples: 1 });
  save({ 'trai.enabled': false }, bot);
  for (const context of contexts) assert.equal(context.trai, null);
  assert.equal(bot._trai, advisor);
  await bot.handleTraiQuery({ query: 'fixture', queryId: 'disabled', sessionId: 'fixture' });
  assert.equal(messages.at(-1).error, 'trai_disabled');
  bot.dashboardWs = { readyState: 1, send: raw => messages.push(JSON.parse(raw)) };
  save({ 'trai.enabled': true }, bot);
  await flush();
  assert.equal(bot.trai, advisor);
  assert.equal(advisor.wsClient, bot.dashboardWs);
  assert.equal(advisor.patternMemory, bank);
  assert.equal(bank.get('fixture').samples, 1);
  assert.equal(providerAttempts, 1, 'ready re-enable must not create another provider request');
  backtestMode = true;
  save({ 'trai.enableBacktest': false }, bot);
  for (const context of contexts) assert.equal(context.trai, null);
  save({ 'trai.enableBacktest': true }, bot);
  assert.equal(bot.trai, advisor);
  backtestMode = false;
  save({ 'trai.enabled': false }, bot);
  const failing = owner();
  providerFailure = true;
  save({ 'trai.enabled': true }, failing);
  await flush();
  assert.equal(failures.length, 1);
  assert.equal(failures[0][0], 'optionalServiceInitializationFailed');
  assert.equal(failures[0][3].continued, true);
  assert.equal(providerAttempts, 2);
  const failedAdvisor = failing.trai;
  await assert.rejects(failedAdvisor.initialize(), /synthetic provider outage/);
  assert.equal(providerAttempts, 2, 'subsequent observations must not retry a failed provider automatically');
  save({ 'trai.enabled': false }, failing);
  providerFailure = false;
  save({ 'trai.enabled': true }, failing);
  await flush();
  assert.equal(failing.trai, failedAdvisor);
  assert.equal(failedAdvisor.state.isInitialized, true);
  assert.equal(providerAttempts, 3);
  assert.equal(failures.length, 1);
  console.log('STOP1_TRAI_LIFECYCLE_RECEIPT', JSON.stringify({ configuration: enabled.configuration, realSettingsSaves: sequence, retainedConsumerContexts: contexts.length, disabledBootDoesNotConstructAdvisor: true, initializeSharedAcrossConcurrentCalls: true, enabledReusesBank: true, reconnectedSocketRebound: true, disabledChatNamed: true, backtestParticipationReadsSavedValue: true, failedInitializationRecorded: true, noAutomaticPaidRetryLoop: true, explicitReenableRetriesOnce: true, providerAttempts, seams: ['provider Core only', 'runner getter/callback/query and context getters extracted from current source', 'operation tracking and audit sinks', 'backtest mode predicate'], runtimeActivated: false }));
})().catch(error => { console.error(error); process.exitCode = 1; });
