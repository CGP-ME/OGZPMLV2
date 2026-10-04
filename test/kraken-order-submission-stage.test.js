'use strict';
jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const KrakenIBrokerAdapter = require('../brokers/KrakenIBrokerAdapter');
const OrderRouter = require('../core/OrderRouter');

describe('Kraken submission receipts through the real queue and router', () => {
  let adapter, router, log;
  beforeEach(() => {
    axios.post.mockReset();
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    adapter = new KrakenIBrokerAdapter({ apiKey: 'fixture-key', apiSecret: Buffer.from('fixture-secret').toString('base64') });
    adapter.kraken.assetPairs.set('XXBTZUSD', { ordermin: '0.0001', lot_decimals: 8 });
    // Drive the existing queue manually, without timers or network access.
    adapter.kraken.startQueueProcessor = jest.fn();
    router = new OrderRouter();
    router.registerBroker(adapter, ['BTC-USD']);
  });
  afterEach(() => {
    clearTimeout(adapter.kraken.queueBackoffTimeout);
    log.mockRestore();
  });
  const order = side => ({ symbol: 'BTC-USD', side, amount: 0.002 });
  async function send(side = 'sell') {
    const result = router.sendOrder(order(side)).catch(error => error);
    await adapter.kraken.processQueue();
    return result;
  }

  test.each(['buy', 'sell'])('%s validation failure is unsent', async side => {
    const error = await router.sendOrder({ ...order(side), amount: undefined }).catch(e => e);
    expect(error).toMatchObject({ brokerName: 'kraken', brokerRequestAttempted: false, unknownBrokerReceipt: false });
    expect(error.message).toMatch(/Quantity must be greater than 0/);
    expect(adapter.kraken.requestQueue).toHaveLength(0);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('request signing failure stays unsent through both adapter layers', async () => {
    adapter.kraken.apiSecret = undefined;
    const error = await send();
    expect(error).toMatchObject({ brokerName: 'kraken', brokerRequestAttempted: false, unknownBrokerReceipt: false, code: 'ERR_INVALID_ARG_TYPE' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('post-dispatch timeout remains unknown without retaining credentials', async () => {
    axios.post.mockRejectedValue(Object.assign(new Error('fixture timeout'), {
      code: 'ETIMEDOUT', config: { headers: { 'API-Key': 'placeholder-private' } },
    }));
    const error = await send();
    expect(error).toMatchObject({ brokerRequestAttempted: true, unknownBrokerReceipt: true, code: 'ETIMEDOUT' });
    expect(error.config).toBeUndefined();
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain('placeholder-private');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('response parsing failure cannot be labeled unsent', async () => {
    axios.post.mockResolvedValue({ data: { result: null } });
    expect(await send()).toMatchObject({ brokerRequestAttempted: true, unknownBrokerReceipt: true });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('a prior queued attempt stays attempted when retry signing fails', async () => {
    axios.post.mockRejectedValue(Object.assign(new Error('fixture rate limit'), { response: { status: 429 } }));
    const result = router.sendOrder(order('sell')).catch(error => error);
    await adapter.kraken.processQueue();
    clearTimeout(adapter.kraken.queueBackoffTimeout);
    adapter.kraken.apiSecret = undefined;
    await adapter.kraken.processQueue();
    expect(await result).toMatchObject({ brokerRequestAttempted: true, unknownBrokerReceipt: true });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('successful order retains identity, direction and quantity', async () => {
    axios.post.mockResolvedValue({ data: { error: [], result: { txid: ['fixture-order'] } } });
    expect(await send('buy')).toMatchObject({ orderId: 'fixture-order', brokerName: 'kraken', symbol: 'BTC-USD', side: 'buy', quantity: 0.002, brokerRequestAttempted: true });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('executor preserves pre-dispatch failure without requesting broker reconciliation halt', async () => {
    const fs = require('fs');
    const acorn = require('acorn');
    const vm = require('vm');
    const source = fs.readFileSync(require.resolve('../core/OrderExecutor'), 'utf8');
    const ast = acorn.parse(source, { ecmaVersion: 'latest' });
    const catches = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'CatchClause' && node.param?.name === 'orderErr') catches.push(node);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') visit(value);
      }
    }
    visit(ast);
    expect(catches).toHaveLength(1);
    const events = [];
    const halt = jest.fn(async () => ({ success: true }));
    const consume = vm.runInNewContext(
      '(async function(orderErr) { let tradeResult; ' + source.slice(catches[0].body.start, catches[0].body.end) + '; return tradeResult; })',
      {
        liveBrokerOrderAccepted: false, liveBrokerName: null, liveBrokerOrderId: null,
        symbol: 'BTC-USD', side: 'sell', traceId: 'fixture', signalId: 'fixture', decisionId: 'fixture',
        exitPlan: { tradeId: 'fixture' }, decision: { action: 'SELL' }, positionEffect: 'close_long',
        console: { error() {} }, emitTrace: (_ctx, event, receipt) => events.push({ event, receipt }),
        blockedReturn: (reason, fields) => ({ success: false, reason, ...fields }),
      }
    );
    let orderError;
    try { await router.sendOrder({ symbol: 'BTC-USD', side: 'sell', amount: undefined }); }
    catch (error) { orderError = error; }
    const result = await consume.call({ ctx: {}, _haltBrokerOrderReconciliationRequired: halt }, orderError);
    expect(result).toMatchObject({ success: false, reason: expect.stringContaining('Quantity must be greater than 0') });
    expect(halt).not.toHaveBeenCalled();
    expect(events).toEqual([expect.objectContaining({ event: 'BROKER_ORDER_RESULT', receipt: expect.objectContaining({ orderAccepted: false }) })]);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
