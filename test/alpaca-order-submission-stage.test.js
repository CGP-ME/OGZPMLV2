'use strict';
jest.mock('axios', () => ({ post: jest.fn() }));
const axios = require('axios');
const AlpacaAdapter = require('../brokers/AlpacaAdapter');
const OrderRouter = require('../core/OrderRouter');

describe('Alpaca submission stage through OrderRouter', () => {
  let adapter, router, log;
  beforeEach(() => {
    axios.post.mockReset();
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    adapter = new AlpacaAdapter({ apiKey: 'fixture-key', apiSecret: 'fixture-secret', mode: 'paper' });
    router = new OrderRouter();
    router.registerBroker(adapter, ['TSLA']);
  });
  afterEach(() => log.mockRestore());

  test.each(['buy', 'sell'])('%s construction failure preserves no-dispatch evidence and error message', async (side) => {
    let error;
    try { await router.sendOrder({ symbol: 'TSLA', side, amount: undefined }); }
    catch (caught) { error = caught; }
    expect(axios.post).not.toHaveBeenCalled();
    expect(error).toMatchObject({ brokerRequestAttempted: false, unknownBrokerReceipt: false, brokerName: 'alpaca' });
    expect(error.message).toMatch(/toString/);
  });

  test('header construction failure also precedes request dispatch', async () => {
    const cause = new Error('fixture header construction failure');
    adapter._authHeaders = () => { throw cause; };
    await expect(router.sendOrder({ symbol: 'TSLA', side: 'sell', amount: 2 })).rejects.toMatchObject({
      message: expect.stringContaining(cause.message), brokerRequestAttempted: false, unknownBrokerReceipt: false,
    });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('timeout after dispatch remains unknown, with its original evidence', async () => {
    const cause = Object.assign(new Error('fixture timeout'), { code: 'ETIMEDOUT' });
    axios.post.mockRejectedValue(cause);
    await expect(router.sendOrder({ symbol: 'TSLA', side: 'sell', amount: 2 })).rejects.toMatchObject({
      code: 'ETIMEDOUT', brokerRequestAttempted: true, unknownBrokerReceipt: true,
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('malformed response after dispatch is never reclassified as unsent', async () => {
    axios.post.mockResolvedValue({ data: null });
    await expect(router.sendOrder({ symbol: 'TSLA', side: 'buy', amount: 2 })).rejects.toMatchObject({
      brokerRequestAttempted: true, unknownBrokerReceipt: true,
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('successful submission retains the normal order receipt', async () => {
    axios.post.mockResolvedValue({ data: { id: 'fixture-order', status: 'accepted', symbol: 'TSLA', side: 'sell', qty: '2' } });
    await expect(router.sendOrder({ symbol: 'TSLA', side: 'sell', amount: 2 })).resolves.toMatchObject({
      orderId: 'fixture-order', amount: 2, brokerRequestAttempted: true, brokerName: 'alpaca',
    });
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
        symbol: 'TSLA', side: 'sell', traceId: 'fixture', signalId: 'fixture', decisionId: 'fixture',
        exitPlan: { tradeId: 'fixture' }, decision: { action: 'SELL' }, positionEffect: 'close_long',
        console: { error() {} }, emitTrace: (_ctx, event, receipt) => events.push({ event, receipt }),
        blockedReturn: (reason, fields) => ({ success: false, reason, ...fields }),
      }
    );
    let orderError;
    try { await router.sendOrder({ symbol: 'TSLA', side: 'sell', amount: undefined }); }
    catch (error) { orderError = error; }
    const result = await consume.call({ ctx: {}, _haltBrokerOrderReconciliationRequired: halt }, orderError);
    expect(result).toMatchObject({ success: false, reason: expect.stringContaining('toString') });
    expect(halt).not.toHaveBeenCalled();
    expect(events).toEqual([expect.objectContaining({ event: 'BROKER_ORDER_RESULT', receipt: expect.objectContaining({ orderAccepted: false }) })]);
    expect(axios.post).not.toHaveBeenCalled();
  });

});
