'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
process.env.PROFILE = 'paper';
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) process.env[key] = 'synthetic-stop1-fixture';
const loader = require(path.join(process.cwd(), 'foundation/ConfigLoader'));
loader.load({ role: 'bot', loadDotenv: false, silent: true });
const requests = [];
const originalRequest = http.request;
http.request = (options, callback) => {
  const req = new EventEmitter();
  const record = { options };
  requests.push(record);
  req.write = data => { record.body = JSON.parse(data); };
  req.end = () => queueMicrotask(() => {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = { 'content-type': 'application/json' };
    callback(res);
    res.emit('data', Buffer.from(JSON.stringify({ model: 'fixture-model', choices: [{ message: { content: 'fixture response' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } })));
    res.emit('end');
  });
  req.destroy = () => {};
  return req;
};
const Client = require(path.join(process.cwd(), 'core/persistent_llm_client'));
const Core = require(path.join(process.cwd(), 'core/trai_core'));
const resolved = { ...loader.get('trai.llm'), provider: 'mercury', model: 'fixture-model', baseUrl: 'http://fixture.invalid/v1', apiKey: 'synthetic-bot-key', skipWarmup: true };
require('node:fs').mkdirSync('data/fixture-trai', { recursive: true });
const core = new Core({ llmConfig: resolved, staticBrainPath: 'data/fixture-trai', memoryTopK: 2, memoryMaxJournalEntries: 10 });
const bot = core.persistentLLM;
const review = new Client({ ...resolved, apiKey: 'synthetic-review-key', maxTokens: 111, minimumTokens: 0, systemPrompt: 'Independent reviewer fixture', temperature: .1, requestTimeoutMs: 1500 });
// Execute the actual relay receipt branch and client owner without starting its server.
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('ogzprime-ssl-server.js', 'utf8');
const ast = require('@babel/parser').parse(source, { sourceType: 'unambiguous', allowReturnOutsideFunction: true });
let getClient, receiptBranch;
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'getTraiClient') getClient = source.slice(node.start, node.end);
  if (node.type === 'IfStatement' && source.slice(node.test.start, node.test.end) === "data.type === 'settings_result'") receiptBranch = source.slice(node.start, node.end);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);
assert.ok(getClient && receiptBranch);
const relay = vm.createContext({ PersistentLLMClient: Client, resolveTraiLlmConfig: () => resolved, dashboardRuntimeConfig: {}, traiClient: null, traiRequestSettings: resolved, ws: { clientType: 'bot', botAuthenticated: true, connectionId: 'fixture-owner' }, wss: { clients: [] }, WebSocket: { OPEN: 1 }, console });
vm.runInContext(`${getClient}; function acceptReceipt(data) { ${receiptBranch} }`, relay);
(async () => {
  try {
    await bot.initialize();
    await review.initialize();
    const dashboard = await relay.getTraiClient();
    const inFlight = bot.generateResponseWithMetadata('before save');
    const oldBody = JSON.stringify(requests[0].body);
    const { revisions } = loader.getCachedSnapshot();
    const saved = loader.saveSettings({ requestId: 'trai-request-1', expectedRevision: revisions.settings, expectedSettingsHash: revisions.settingsHash, changes: {
      'trai.llm.maxTokens': 64, 'trai.llm.minimumTokens': 20, 'trai.llm.temperature': .25,
      'trai.llm.requestTimeoutMs': 3000, 'trai.llm.systemPrompt': 'Saved bot fixture instruction',
    } });
    assert.equal(saved.success, true, saved.reason);
    relay.ws.clientType = 'dashboard';
    relay.acceptReceipt({ type: 'settings_result', ...saved });
    assert.equal(dashboard.systemPrompt, resolved.systemPrompt, 'dashboard cannot publish bot policy');
    relay.ws.clientType = 'bot';
    relay.acceptReceipt({ type: 'settings_result', ...saved });
    await inFlight;
    assert.equal(JSON.stringify(requests[0].body), oldBody);
    await bot.generateResponseWithMetadata('after save');
    await bot.generateRawResponse('minimum check', 1);
    await review.generateResponseWithMetadata('independent review');
    await dashboard.generateResponseWithMetadata('dashboard after save');
    assert.equal(requests[1].body.max_tokens, 64);
    assert.equal(requests[1].body.temperature, .25);
    assert.equal(requests[1].body.messages[0].content, 'Saved bot fixture instruction');
    assert.equal(requests[1].options.timeout, 3000);
    assert.equal(requests[2].body.max_tokens, 20);
    assert.equal(requests[3].body.max_tokens, 111);
    assert.equal(requests[3].body.messages[0].content, 'Independent reviewer fixture');
    assert.equal(requests[3].body.temperature, .1);
    assert.equal(requests[3].options.timeout, 1500);
    assert.equal(requests[1].options.headers.Authorization, 'Bearer synthetic-bot-key');
    assert.equal(requests[3].options.headers.Authorization, 'Bearer synthetic-review-key');
    assert.equal(requests[4].body.messages[0].content, 'Saved bot fixture instruction');
    assert.equal(requests[4].body.max_tokens, 64);
    assert.equal(requests[4].options.timeout, 3000);
    assert.equal(await relay.getTraiClient(), dashboard, 'same dashboard client adopts the receipt');
    relay.traiRequestSettings = resolved;
    relay.acceptReceipt({ type: 'settings_result', success: true, ...loader.getSettingsView() });
    assert.equal(dashboard.systemPrompt, 'Saved bot fixture instruction', 'reconnect read restores the published policy');
    assert.equal(bot.model, 'fixture-model');
    console.log('STOP1_TRAI_REQUEST_RECEIPT', JSON.stringify({ configuration: saved.configuration, actualClientRequests: requests.length, savedControlsUsedByNextRequest: 5, minimumApplied: true, inFlightRequestUnchanged: true, independentReviewPromptAndPolicyUnchanged: true, providerAndCredentialIdentityUnchanged: true, existingDashboardClientAdoptsAuthenticatedBotReceipt: true, dashboardCannotPublishPolicy: true, transport: 'Node HTTP seam; actual relay branch/client owner extracted with Babel; no provider calls', runtimeActivated: false }));
  } finally {
    http.request = originalRequest;
    core.shutdown();
    review.shutdown();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
