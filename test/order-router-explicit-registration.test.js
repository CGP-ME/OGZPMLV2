'use strict';

const OrderRouter = require('../core/OrderRouter');

describe('OrderRouter explicit registration contract', () => {
  function buildAdapter(name) {
    return {
      getBrokerName: () => name,
      placeBuyOrder: jest.fn(async () => ({ orderId: `${name.toUpperCase()}_BUY_1` })),
      placeSellOrder: jest.fn(async () => ({ orderId: `${name.toUpperCase()}_SELL_1` })),
    };
  }

  test('does not route unknown symbols to the first registered broker', async () => {
    const router = new OrderRouter();
    const kraken = buildAdapter('kraken');

    router.registerBroker(kraken, ['BTC-USD']);

    expect(router.getBrokerForSymbol('TSLA')).toBeNull();
    await expect(router.sendOrder({
      symbol: 'TSLA',
      side: 'buy',
      amount: 1,
      type: 'market'
    })).rejects.toThrow('[OrderRouter] No adapter registered for symbol: TSLA');

    expect(kraken.placeBuyOrder).not.toHaveBeenCalled();
    expect(kraken.placeSellOrder).not.toHaveBeenCalled();
  });

  test('rejects missing order symbol before broker lookup', async () => {
    const router = new OrderRouter();
    const kraken = buildAdapter('kraken');

    router.registerBroker(kraken, ['BTC-USD']);

    await expect(router.sendOrder({
      side: 'buy',
      amount: 1,
      type: 'market'
    })).rejects.toThrow('[OrderRouter] Order symbol is required');

    expect(kraken.placeBuyOrder).not.toHaveBeenCalled();
  });

  test('still routes explicitly registered aliases to the registered broker', async () => {
    const router = new OrderRouter();
    const kraken = buildAdapter('kraken');

    router.registerBroker(kraken, ['BTC-USD']);

    const result = await router.sendOrder({
      symbol: 'XBT/USD',
      side: 'buy',
      amount: 0.002,
      type: 'market',
      traceId: 'TRACE-ROUTER-1'
    });

    expect(kraken.placeBuyOrder).toHaveBeenCalledWith('XBT/USD', 0.002, null, {});
    expect(result).toEqual(expect.objectContaining({
      orderId: 'KRAKEN_BUY_1',
      traceId: 'TRACE-ROUTER-1'
    }));
  });

  test('setDefaultAdapter fails loud instead of creating a fallback', async () => {
    const router = new OrderRouter();
    const kraken = buildAdapter('kraken');

    router.registerBroker(kraken, ['BTC-USD']);
    expect(() => router.setDefaultAdapter(kraken))
      .toThrow('[OrderRouter] Default adapter fallback disabled; register explicit symbols for kraken');

    await expect(router.sendOrder({
      symbol: 'AAPL',
      side: 'sell',
      amount: 1,
      type: 'market'
    })).rejects.toThrow('[OrderRouter] No adapter registered for symbol: AAPL');

    expect(kraken.placeSellOrder).not.toHaveBeenCalled();
  });

  test('rejects duplicate symbol registrations across brokers', () => {
    const router = new OrderRouter();
    const kraken = buildAdapter('kraken');
    const alpaca = buildAdapter('alpaca');

    router.registerBroker(kraken, ['BTC-USD']);

    expect(() => router.registerBroker(alpaca, ['XBT/USD']))
      .toThrow('[OrderRouter] Symbol BTC-USD already registered to kraken; refusing to reassign to alpaca');
  });

  test('allows same-adapter aliases that normalize to the same symbol', async () => {
    const router = new OrderRouter();
    const kraken = buildAdapter('kraken');

    router.registerBroker(kraken, ['BTC-USD', 'XBT/USD']);

    const result = await router.sendOrder({
      symbol: 'XBT/USD',
      side: 'buy',
      amount: 0.002,
      type: 'market'
    });

    expect(kraken.placeBuyOrder).toHaveBeenCalledWith('XBT/USD', 0.002, null, {});
    expect(result.orderId).toBe('KRAKEN_BUY_1');
  });

  test('rejects empty symbols during broker registration', () => {
    const router = new OrderRouter();
    const kraken = buildAdapter('kraken');

    expect(() => router.registerBroker(kraken, ['']))
      .toThrow('[OrderRouter] kraken attempted to register an empty symbol');
  });
});
