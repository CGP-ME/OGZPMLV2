'use strict';
const { EventEmitter } = require('events');
const OrderRouter = require('../core/OrderRouter');

function adapter(name, account) {
  return Object.assign(new EventEmitter(), {
    getBrokerName: () => name,
    placeSellOrder: jest.fn(async () => ({ orderId: `order-${account}` })),
    getPositions: jest.fn(async () => [{ symbol: name === 'kraken' ? 'BTC-USD' : 'TSLA', size: 2, accountId: account }]),
  });
}

describe('rejected registrations preserve execution-account ownership', () => {
  let log;
  beforeEach(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => log.mockRestore());

  test.each([['alpaca', 'TSLA'], ['kraken', 'BTC-USD']])('%s duplicate keeps orders and position reads on the original connection', async (name, symbol) => {
    const router = new OrderRouter();
    const original = adapter(name, 'original');
    const replacement = adapter(name, 'replacement');
    router.registerBroker(original, [symbol]);
    expect(() => router.registerBroker(replacement, [symbol])).toThrow(/already registered/);

    const order = await router.sendOrder({ symbol, side: 'sell', amount: 1 });
    const read = await router.getAllPositions({ symbols: [symbol], brokerNames: [name] });
    expect(order.orderId).toBe('order-original');
    expect(read).toMatchObject({ complete: true, positions: [{ accountId: 'original' }] });
    expect(replacement.placeSellOrder).not.toHaveBeenCalled();
    expect(replacement.getPositions).not.toHaveBeenCalled();
    expect(replacement.listenerCount('broker_truth_unavailable')).toBe(0);
    replacement.emit('broker_truth_unavailable', { reason: 'rejected connection' });
    expect(router.brokerTruthUnavailable.size).toBe(0);
  });

  test('late collision creates neither a partial symbol route nor a rejected broker reader', async () => {
    const router = new OrderRouter();
    const kraken = adapter('kraken', 'crypto');
    const alpaca = adapter('alpaca', 'stocks');
    router.registerBroker(kraken, ['BTC-USD']);
    const registered = jest.fn();
    router.on('brokerRegistered', registered);
    expect(() => router.registerBroker(alpaca, ['TSLA', 'XBT/USD'])).toThrow(/already registered/);
    expect(router.getBrokerForSymbol('TSLA')).toBeNull();
    expect(router.adapters.has('alpaca')).toBe(false);
    expect(router.adapterSymbols.has('alpaca')).toBe(false);
    expect(alpaca.listenerCount('broker_truth_unavailable')).toBe(0);
    expect(registered).not.toHaveBeenCalled();
    await router.getAllPositions();
    expect(kraken.getPositions).toHaveBeenCalledTimes(1);
    expect(alpaca.getPositions).not.toHaveBeenCalled();
  });

  test('late empty symbol preserves an existing registration without adding earlier symbols', () => {
    const router = new OrderRouter();
    const alpaca = adapter('alpaca', 'stocks');
    router.registerBroker(alpaca, ['TSLA']);
    expect(() => router.registerBroker(alpaca, ['AAPL', ''])).toThrow(/empty symbol/);
    expect(router.getBrokerForSymbol('TSLA')).toBe(alpaca);
    expect(router.getBrokerForSymbol('AAPL')).toBeNull();
    expect([...router.adapterSymbols.get('alpaca')]).toEqual(['TSLA']);
    expect(alpaca.listenerCount('broker_truth_unavailable')).toBe(1);
  });

  test('successful repeated SessionRouter registration retains aliases and one subscription', async () => {
    const router = new OrderRouter();
    const kraken = adapter('kraken', 'crypto');
    const alpaca = adapter('alpaca', 'stocks');
    router.registerBroker(kraken, ['BTC-USD', 'XBT/USD']);
    router.registerBroker(alpaca, ['TSLA']);
    router.registerBroker(kraken, ['XBT/USD', 'ETH-USD']);
    expect(router.getBrokerForSymbol('BTCUSD')).toBe(kraken);
    expect(router.getBrokerForSymbol('ETH-USD')).toBe(kraken);
    expect(router.getBrokerForSymbol('TSLA')).toBe(alpaca);
    expect([...router.adapterSymbols.get('kraken')]).toEqual(['BTC-USD', 'ETH-USD']);
    expect(kraken.listenerCount('broker_truth_unavailable')).toBe(1);
    const read = await router.getAllPositions({ brokerNames: ['alpaca'] });
    expect(read.positions[0].accountId).toBe('stocks');
    expect(kraken.getPositions).not.toHaveBeenCalled();
  });
});
