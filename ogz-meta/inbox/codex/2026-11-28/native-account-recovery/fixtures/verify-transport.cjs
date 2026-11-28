'use strict';
require(process.cwd() + '/test/helpers/require-isolation.cjs')();
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { getEventListeners } = require('node:events');
const logs = [];
for (const level of ['log', 'warn', 'error']) console[level] = (...args) => logs.push({ level, message: args.join(' ') });
const env = path.join(__dirname, 'synthetic.env');
fs.writeFileSync(env, 'ALPACA_API_KEY=fixture\nALPACA_API_SECRET=fixture\nKRAKEN_API_KEY=fixture\nKRAKEN_API_SECRET=fixture\nWEBSOCKET_AUTH_TOKEN=fixture\n');
process.env.PROFILE = 'paper';
process.env.DOTENV_CONFIG_PATH = env;
const ConfigLoader = require(process.cwd() + '/foundation/ConfigLoader');
ConfigLoader.load({ role: 'bot', silent: true });
const AlpacaAdapter = require(process.cwd() + '/brokers/AlpacaAdapter');
const KrakenAdapter = require(process.cwd() + '/brokers/KrakenIBrokerAdapter');
const SessionRouter = require(process.cwd() + '/core/SessionRouter');
const router = Object.create(SessionRouter.prototype);
const adapters = [];
let baseUrl, plan;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const resultOf = promise => promise.then(value => ({ fulfilled: true, value }), error => ({ fulfilled: false, error }));
function makePlan(holdAt = null, rateLimitAt = null) {
  let entered, closed;
  plan = { holdAt, rateLimitAt, paths: [], bodies: [], held: new Promise(resolve => { entered = resolve; }), closed: new Promise(resolve => { closed = resolve; }), entered, close: closed };
  return plan;
}
function bodyFor(url) {
  if (url === '/v2/account') return { id: 'fixture-account', cash: '100000', equity: '100000', buying_power: '100000', portfolio_value: '100000', status: 'ACTIVE' };
  if (url.startsWith('/v2/')) return [];
  if (url.endsWith('/Balance')) return { error: [], result: { ZUSD: '100000' } };
  if (url.endsWith('/OpenOrders')) return { error: [], result: { open: {} } };
  if (url.endsWith('/GetApiKeyInfo')) return { error: [], result: { iban: 'fixture-kraken-account' } };
  if (url.endsWith('/AddOrder')) return { error: [], result: { txid: ['fixture-local-only-order'] } };
  assert.fail('Unexpected local endpoint: ' + url);
}
const server = http.createServer((request, response) => {
  const active = plan;
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    active.paths.push(request.url);
    active.bodies.push(Buffer.concat(chunks).toString());
    if (active.paths.length === active.holdAt) {
      response.on('close', active.close);
      active.entered();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (active.paths.length === active.rateLimitAt) {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: ['fixture rate limit'] }));
    } else response.end(JSON.stringify(bodyFor(request.url)));
  });
});
function adapterFor(broker) {
  const adapter = broker === 'alpaca'
    ? new AlpacaAdapter({ mode: 'paper', apiKey: 'fixture', apiSecret: 'fixture' })
    : new KrakenAdapter({ apiKey: 'fixture', apiSecret: Buffer.from('fixture').toString('base64'), symbols: ['BTC-USD'] });
  if (broker === 'alpaca') adapter.baseUrl = baseUrl;
  else { adapter.kraken.baseUrl = baseUrl; adapters.push(adapter); }
  return adapter;
}
async function main() {
  const deadline = setTimeout(() => { process.stderr.write('Isolated transport observation did not settle in 20 seconds\n'); process.exit(2); }, 20000);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = 'http://127.0.0.1:' + server.address().port;
    const cancelledSnapshots = [];
    for (const [broker, stages] of [['alpaca', 3], ['kraken', 4]]) {
      for (let stage = 1; stage <= stages; stage++) {
        const active = makePlan(stage);
        const adapter = adapterFor(broker);
        const controller = new AbortController();
        const pending = resultOf(router._fetchBrokerRestSnapshot(adapter, broker, { signal: controller.signal }));
        await active.held;
        controller.abort();
        const settled = await pending;
        await active.closed;
        assert.equal(settled.fulfilled, false);
        assert.equal(active.paths.length, stage);
        assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
        if (adapter.kraken) {
          assert.equal(adapter.kraken.pendingPrivateRequests.size, 0);
          assert.equal(adapter.kraken.requestQueue.length, 0);
          await adapter.disconnect();
        }
        cancelledSnapshots.push({ broker, stage, requests: active.paths, rejected: true, errorCode: settled.error.code,
          heldHttpClosed: true, furtherSnapshotRequests: 0, abortListenersRemaining: 0 });
      }
    }

    const nominalSnapshots = [];
    for (const broker of ['alpaca', 'kraken']) {
      const active = makePlan();
      const adapter = adapterFor(broker);
      const snapshot = await router._fetchBrokerRestSnapshot(adapter, broker);
      assert.equal(snapshot.balance, 100000);
      assert.equal(snapshot.openOrders.length, 0);
      assert.equal(snapshot.openPositions.length, 0);
      assert.equal(snapshot.accountId, broker === 'alpaca' ? 'fixture-account' : 'fixture-kraken-account');
      if (adapter.kraken) await adapter.disconnect();
      nominalSnapshots.push({ broker, requests: active.paths, balance: snapshot.balance, identityConfirmed: true, balanceChecked: snapshot.balanceChecked });
    }

    // Already-expired and waiting queue entries never reach HTTP; an unrelated
    // entry in the same queue still completes through the real queue processor.
    const queuedPlan = makePlan();
    const queueAdapter = adapterFor('kraken');
    const expired = new AbortController(); expired.abort();
    const expiredResult = await resultOf(queueAdapter.getPositions({ signal: expired.signal }));
    assert.equal(expiredResult.fulfilled, false);
    assert.equal(expiredResult.error.brokerRequestAttempted, false);
    const waiting = new AbortController();
    const waitingResult = resultOf(queueAdapter.getPositions({ signal: waiting.signal }));
    const other = queueAdapter.getOpenOrders();
    waiting.abort();
    const waitingSettled = await waitingResult;
    assert.equal(waitingSettled.fulfilled, false);
    assert.equal(waitingSettled.error.brokerRequestAttempted, false);
    assert.deepEqual(await other, []);
    assert.deepEqual(queuedPlan.paths, ['/0/private/OpenOrders']);
    assert.equal(queueAdapter.kraken.pendingPrivateRequests.size, 0);
    assert.equal(queueAdapter.kraken.requestQueue.length, 0);
    assert.equal(getEventListeners(waiting.signal, 'abort').length, 0);

    const retryPlan = makePlan(null, 1);
    const retryAdapter = adapterFor('kraken');
    const retryController = new AbortController();
    const retryResult = resultOf(retryAdapter.getPositions({ signal: retryController.signal }));
    while (!retryAdapter.kraken.queueBackoffTimeout) await delay(5);
    assert.equal(retryAdapter.kraken.requestQueue.length, 1);
    retryController.abort();
    const retrySettled = await retryResult;
    assert.equal(retrySettled.fulfilled, false);
    assert.equal(retrySettled.error.brokerRequestAttempted, true);
    assert.equal(retrySettled.error.unknownBrokerReceipt, true);
    await delay(ConfigLoader.getInternalsFileValue('broker.krakenTransport.initialRateLimitBackoffMs') + 200);
    assert.equal(retryPlan.paths.length, 1);
    assert.equal(retryAdapter.kraken.requestQueue.length, 0);
    assert.equal(retryAdapter.kraken.pendingPrivateRequests.size, 0);
    assert.equal(getEventListeners(retryController.signal, 'abort').length, 0);
    await retryAdapter.disconnect();

    // An existing write without a read signal retains the same queue semantics.
    // This reaches only the synthetic local server in the isolated namespace.
    const writePlan = makePlan();
    const write = await queueAdapter.kraken.makePrivateRequest('/0/private/AddOrder', { pair: 'XBTUSD', type: 'sell', ordertype: 'market', volume: '0.01' });
    assert.deepEqual(write.result.txid, ['fixture-local-only-order']);
    const body = new URLSearchParams(writePlan.bodies[0]);
    assert.equal(body.get('pair'), 'XBTUSD');
    assert.equal(body.get('type'), 'sell');
    assert.equal(body.get('volume'), '0.01');
    await queueAdapter.disconnect();
    const files = ['core/SessionRouter.js', 'brokers/AlpacaAdapter.js', 'brokers/KrakenIBrokerAdapter.js', 'kraken_adapter_simple.js', 'foundation/IBrokerAdapter.js', 'brokers/IBrokerAdapter.js', 'foundation/ConfigLoader.js', 'config/settings.json', 'config/internals.json'];
    process.stdout.write(JSON.stringify({ sourceHashes: Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
      fixtureSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), axiosVersion: require('axios/package.json').version,
      cancelledSnapshots, nominalSnapshots,
      queuedCancellation: { alreadyAbortedRequestsSent: 0, waitingRequestsSent: 0, otherRequestCompleted: true, pendingRequests: 0, listeners: 0 },
      rateLimitCancellation: { requestsSent: 1, retryAfterAbort: false, pendingRequests: 0, listeners: 0, brokerRequestAttempted: true, unknownBrokerReceipt: true },
      unsignalledWrite: { syntheticLocalOnly: true, requestAndReceiptPreserved: true },
      limits: ['Actual adapters, queue, SessionRouter snapshot and installed Axios against a synthetic local HTTP server inside helper isolation.', 'Cancellation is explicitly triggered after HTTP arrival or while queued, not a timed external broker outage.', 'Successful snapshots use synthetic empty orders/positions and explicit balance/identity; cancelled snapshots reject instead of manufacturing those values.', 'No production broker call, credentials, real order, live position or host state is used.'] }, null, 2) + '\n');
  } finally {
    clearTimeout(deadline);
    server.closeAllConnections();
    for (const adapter of adapters) {
      clearInterval(adapter.kraken.processQueueInterval);
      clearTimeout(adapter.kraken.queueBackoffTimeout);
    }
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
