'use strict';

const OrderRouter = require('../core/OrderRouter');
const { subscribeTrace } = require('../core/TraceSpine');

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
      brokerName: 'kraken',
      brokerRequestAttempted: true,
      traceId: 'TRACE-ROUTER-1'
    }));
  });

  test('preserves unknown broker receipt when adapter returns no order result', async () => {
    const router = new OrderRouter();
    const alpaca = {
      getBrokerName: () => 'alpaca',
      placeBuyOrder: jest.fn(async () => null),
      placeSellOrder: jest.fn(),
    };

    router.registerBroker(alpaca, ['TSLA']);

    const result = await router.sendOrder({
      symbol: 'TSLA',
      side: 'buy',
      amount: 1,
      type: 'market',
      traceId: 'TRACE-MISSING-RESULT',
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'broker_order_result_missing',
      brokerName: 'alpaca',
      brokerRequestAttempted: true,
      unknownBrokerReceipt: true,
      traceId: 'TRACE-MISSING-RESULT',
    }));
  });

  test('preserves known broker rejection without unknown receipt annotation', async () => {
    const router = new OrderRouter();
    const alpaca = {
      getBrokerName: () => 'alpaca',
      placeBuyOrder: jest.fn(async () => ({ success: false, reason: 'insufficient buying power' })),
      placeSellOrder: jest.fn(),
    };

    router.registerBroker(alpaca, ['TSLA']);

    const result = await router.sendOrder({
      symbol: 'TSLA',
      side: 'buy',
      amount: 1,
      type: 'market',
      traceId: 'TRACE-KNOWN-REJECT',
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'insufficient buying power',
      brokerName: 'alpaca',
      brokerRequestAttempted: true,
      traceId: 'TRACE-KNOWN-REJECT',
    }));
    expect(result).not.toHaveProperty('unknownBrokerReceipt');
  });

  test('annotates adapter dispatch throws as unknown broker receipt', async () => {
    const router = new OrderRouter();
    const alpaca = {
      getBrokerName: () => 'alpaca',
      placeBuyOrder: jest.fn(async () => {
        throw new Error('adapter network timeout');
      }),
      placeSellOrder: jest.fn(),
    };

    router.registerBroker(alpaca, ['TSLA']);

    await expect(router.sendOrder({
      symbol: 'TSLA',
      side: 'buy',
      amount: 1,
      type: 'market',
    })).rejects.toEqual(expect.objectContaining({
      message: 'adapter network timeout',
      brokerName: 'alpaca',
      brokerRequestAttempted: true,
      unknownBrokerReceipt: true,
    }));
  });

  test('rejects invalid side before broker dispatch annotation', async () => {
    const router = new OrderRouter();
    const alpaca = buildAdapter('alpaca');

    router.registerBroker(alpaca, ['TSLA']);

    let caughtError;
    try {
      await router.sendOrder({
        symbol: 'TSLA',
        side: 'hold',
        amount: 1,
        type: 'market',
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toEqual(expect.objectContaining({
      message: '[OrderRouter] Invalid side: hold',
    }));
    expect(caughtError).not.toHaveProperty('brokerRequestAttempted');
    expect(caughtError).not.toHaveProperty('unknownBrokerReceipt');
    expect(alpaca.placeBuyOrder).not.toHaveBeenCalled();
    expect(alpaca.placeSellOrder).not.toHaveBeenCalled();
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

  test('getAllBalances records balance truth unavailable instead of returning a quiet error object', async () => {
    const router = new OrderRouter();
    const traces = [];
    const unsubscribe = subscribeTrace((event) => traces.push(event));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const alpaca = {
      getBrokerName: () => 'alpaca',
      getBalance: jest.fn(async () => {
        const err = new Error('[Alpaca] alpaca_balance_unavailable: account read failed');
        err.code = 'broker_balance_truth_unavailable';
        throw err;
      }),
    };
    router.registerBroker(alpaca, ['TSLA']);

    try {
      const balances = await router.getAllBalances();

      expect(balances.alpaca).toEqual({
        error: '[Alpaca] alpaca_balance_unavailable: account read failed',
        code: 'broker_balance_truth_unavailable',
        reason: 'broker_balance_truth_unavailable',
        status: 'unavailable',
      });
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('BALANCE_TRUTH_UNAVAILABLE'));
      expect(traces).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'ORDER_ROUTER_BALANCE_TRUTH_UNAVAILABLE',
          fields: expect.objectContaining({
            broker: 'alpaca',
            reason: 'broker_balance_truth_unavailable',
          }),
        }),
      ]));
    } finally {
      unsubscribe();
      consoleError.mockRestore();
    }
  });
});
