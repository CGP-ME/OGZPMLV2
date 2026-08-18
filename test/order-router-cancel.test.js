'use strict';

const OrderRouter = require('../core/OrderRouter');
const { subscribeTrace } = require('../core/TraceSpine');

describe('OrderRouter cancelAllOpenOrders', () => {
  test('cancels every open order through each adapter', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'alpaca',
      getOpenOrders: jest.fn(async () => [
        { orderId: 'ORDER_1' },
        { id: 'ORDER_2' },
      ]),
      cancelOrder: jest.fn(async () => true),
    };
    router.registerBroker(adapter, ['TSLA']);

    const result = await router.cancelAllOpenOrders();

    expect(result).toEqual(expect.objectContaining({
      success: true,
      cancelled: 2,
      failed: 0,
    }));
    expect(adapter.cancelOrder).toHaveBeenCalledWith('ORDER_1');
    expect(adapter.cancelOrder).toHaveBeenCalledWith('ORDER_2');
  });

  test('fails when a matching adapter cannot cancel open orders', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'alpaca',
      getOpenOrders: jest.fn(async () => [{ orderId: 'ORDER_1', symbol: 'TSLA' }]),
    };
    router.registerBroker(adapter, ['TSLA']);

    const result = await router.cancelAllOpenOrders({ symbols: ['TSLA'] });

    expect(result.success).toBe(false);
    expect(result.results).toEqual([
      { broker: 'alpaca', success: false, reason: 'adapter_missing_order_cancel_api' },
    ]);
  });

  test('does not fail on nonmatching adapters when a symbol scope is supplied', async () => {
    const router = new OrderRouter();
    const cryptoAdapter = {
      getBrokerName: () => 'kraken',
      getOpenOrders: jest.fn(),
    };
    const stockAdapter = {
      getBrokerName: () => 'alpaca',
      getOpenOrders: jest.fn(async () => [{ orderId: 'ORDER_1', symbol: 'TSLA' }]),
      cancelOrder: jest.fn(async () => true),
    };
    router.registerBroker(cryptoAdapter, ['BTC-USD']);
    router.registerBroker(stockAdapter, ['TSLA']);

    const result = await router.cancelAllOpenOrders({ symbols: ['TSLA'] });

    expect(result.success).toBe(true);
    expect(cryptoAdapter.getOpenOrders).not.toHaveBeenCalled();
    expect(stockAdapter.cancelOrder).toHaveBeenCalledWith('ORDER_1');
  });

  test('cancels only the named broker when broker scope is supplied', async () => {
    const router = new OrderRouter();
    const cryptoAdapter = {
      getBrokerName: () => 'kraken',
      getOpenOrders: jest.fn(),
      cancelOrder: jest.fn(),
    };
    const stockAdapter = {
      getBrokerName: () => 'alpaca',
      getOpenOrders: jest.fn(async () => [
        { orderId: 'ORDER_1', symbol: 'TSLA' },
        { orderId: 'ORDER_2', symbol: 'MSFT' },
      ]),
      cancelOrder: jest.fn(async () => true),
    };
    router.registerBroker(cryptoAdapter, ['BTC-USD']);
    router.registerBroker(stockAdapter, ['TSLA']);

    const result = await router.cancelAllOpenOrders({ brokerNames: ['alpaca'] });

    expect(result.success).toBe(true);
    expect(cryptoAdapter.getOpenOrders).not.toHaveBeenCalled();
    expect(stockAdapter.cancelOrder).toHaveBeenCalledWith('ORDER_1');
    expect(stockAdapter.cancelOrder).toHaveBeenCalledWith('ORDER_2');
  });

  test('matches broker scope case-insensitively and fails loud when no broker matches', async () => {
    const router = new OrderRouter();
    const stockAdapter = {
      getBrokerName: () => 'Alpaca',
      getOpenOrders: jest.fn(async () => [{ orderId: 'ORDER_1', symbol: 'TSLA' }]),
      cancelOrder: jest.fn(async () => true),
    };
    router.registerBroker(stockAdapter, ['TSLA']);

    const matched = await router.cancelAllOpenOrders({ brokerNames: ['alpaca'] });
    const missing = await router.cancelAllOpenOrders({ brokerNames: ['kraken'] });

    expect(matched.success).toBe(true);
    expect(stockAdapter.cancelOrder).toHaveBeenCalledWith('ORDER_1');
    expect(missing.success).toBe(false);
    expect(missing.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ success: false, reason: 'broker_scope_matched_no_adapters' }),
    ]));
  });

  test('fails when no adapters are registered for cancellation', async () => {
    const router = new OrderRouter();

    const result = await router.cancelAllOpenOrders();

    expect(result).toEqual({
      success: false,
      results: [{ broker: 'none', success: false, reason: 'no_adapters_registered' }],
      cancelled: 0,
      failed: 1,
    });
  });

  test('fails when symbol scope matches no registered cancel adapter', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'kraken',
      getOpenOrders: jest.fn(),
      cancelOrder: jest.fn(),
    };
    router.registerBroker(adapter, ['BTC-USD']);

    const result = await router.cancelAllOpenOrders({ symbols: ['TSLA'] });

    expect(adapter.getOpenOrders).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      success: false,
      cancelled: 0,
      failed: 1,
    }));
    expect(result.results).toEqual(expect.arrayContaining([
      { broker: 'kraken', skipped: true, reason: 'no_matching_symbols' },
      { broker: 'none', success: false, reason: 'symbol_scope_matched_no_adapters' },
    ]));
  });

  test('cancels stock orders when the supplied scope includes broker and generic aliases', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'alpaca',
      getOpenOrders: jest.fn(async () => [
        { orderId: 'ORDER_1', symbol: 'AAPL' },
        { orderId: 'ORDER_2', symbol: 'AAPL/USD' },
      ]),
      cancelOrder: jest.fn(async () => true),
    };
    router.registerBroker(adapter, ['AAPL/USD']);

    const result = await router.cancelAllOpenOrders({ symbols: ['AAPL', 'AAPL-USD'] });

    expect(result.success).toBe(true);
    expect(adapter.cancelOrder).toHaveBeenCalledWith('ORDER_1');
    expect(adapter.cancelOrder).toHaveBeenCalledWith('ORDER_2');
  });

  test('cancels Kraken orders through the IBroker cancelOrder contract', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'kraken',
      getOpenOrders: jest.fn(async () => [
        { orderId: 'KRAKEN_ORDER_1', symbol: 'BTC-USD' },
        { orderId: 'KRAKEN_ORDER_2', symbol: 'XBT/USD' },
      ]),
      cancelOrder: jest.fn(async orderId => orderId === 'KRAKEN_ORDER_1'),
    };
    router.registerBroker(adapter, ['BTC-USD']);

    const result = await router.cancelAllOpenOrders({ symbols: ['BTC-USD'] });

    expect(adapter.cancelOrder).toHaveBeenCalledWith('KRAKEN_ORDER_1');
    expect(adapter.cancelOrder).toHaveBeenCalledWith('KRAKEN_ORDER_2');
    expect(result).toEqual(expect.objectContaining({
      success: false,
      cancelled: 1,
      failed: 1,
    }));
    expect(result.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ broker: 'kraken', orderId: 'KRAKEN_ORDER_1', success: true }),
      expect.objectContaining({ broker: 'kraken', orderId: 'KRAKEN_ORDER_2', success: false, reason: 'cancel_returned_false' }),
    ]));
  });

  test('treats non-literal-true cancel returns as failed cancellation results', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'kraken',
      getOpenOrders: jest.fn(async () => [
        { orderId: 'KRAKEN_OBJECT_RESULT', symbol: 'BTC-USD' },
        { orderId: 'KRAKEN_UNDEFINED_RESULT', symbol: 'BTC-USD' },
      ]),
      cancelOrder: jest
        .fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce(undefined),
    };
    router.registerBroker(adapter, ['BTC-USD']);

    const result = await router.cancelAllOpenOrders({ symbols: ['BTC-USD'] });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      cancelled: 0,
      failed: 2,
    }));
    expect(result.results).toEqual([
      {
        broker: 'kraken',
        orderId: 'KRAKEN_OBJECT_RESULT',
        success: false,
        reason: 'cancel_returned_non_true',
      },
      {
        broker: 'kraken',
        orderId: 'KRAKEN_UNDEFINED_RESULT',
        success: false,
        reason: 'cancel_returned_non_true',
      },
    ]);
  });

  test('normalizes Kraken aliases in the requested symbol scope before filtering open orders', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'kraken',
      getOpenOrders: jest.fn(async () => [
        { orderId: 'KRAKEN_XBT_ORDER', symbol: 'XBT/USD' },
      ]),
      cancelOrder: jest.fn(async () => true),
    };
    router.registerBroker(adapter, ['BTC-USD']);

    const result = await router.cancelAllOpenOrders({ symbols: ['XBT/USD'] });

    expect(result.success).toBe(true);
    expect(adapter.cancelOrder).toHaveBeenCalledWith('KRAKEN_XBT_ORDER');
  });
});

describe('OrderRouter getAllPositions broker scope', () => {
  test('reads positions only from the named broker', async () => {
    const router = new OrderRouter();
    const cryptoAdapter = {
      getBrokerName: () => 'kraken',
      getPositions: jest.fn(),
    };
    const stockAdapter = {
      getBrokerName: () => 'alpaca',
      getPositions: jest.fn(async () => [
        { symbol: 'TSLA', size: 1 },
        { symbol: 'MSFT', size: 2 },
      ]),
    };
    router.registerBroker(cryptoAdapter, ['BTC-USD']);
    router.registerBroker(stockAdapter, ['TSLA']);

    const result = await router.getAllPositions({ brokerNames: ['alpaca'] });

    expect(cryptoAdapter.getPositions).not.toHaveBeenCalled();
    expect(result.positions).toEqual([
      { symbol: 'TSLA', size: 1, broker: 'alpaca' },
      { symbol: 'MSFT', size: 2, broker: 'alpaca' },
    ]);
    expect(result.complete).toBe(true);
    expect(result.brokerStatuses).toEqual([
      { broker: 'alpaca', status: 'complete', positionCount: 2 },
    ]);
  });

  test('marks position truth unavailable when broker scope matches no adapters', async () => {
    const router = new OrderRouter();
    const stockAdapter = {
      getBrokerName: () => 'Alpaca',
      getAssetType: () => 'stocks',
      getPositions: jest.fn(async () => []),
    };
    router.registerBroker(stockAdapter, ['TSLA']);

    expect(router.getBrokerNamesByAssetType(['stocks'])).toEqual(['alpaca']);
    const result = await router.getAllPositions({ brokerNames: ['kraken'] });

    expect(result.positions).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.unavailableBrokers).toEqual([
      expect.objectContaining({
        broker: 'kraken',
        status: 'unavailable',
        code: 'broker_position_truth_unavailable',
        reason: 'broker_scope_matched_no_adapters',
      }),
    ]);
  });

  test('keeps usable broker positions but marks aggregate incomplete when one broker read fails', async () => {
    const router = new OrderRouter();
    const traces = [];
    const unsubscribe = subscribeTrace((event) => traces.push(event));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const stockAdapter = {
      getBrokerName: () => 'alpaca',
      getPositions: jest.fn(async () => [{ symbol: 'TSLA', size: 1 }]),
    };
    const cryptoAdapter = {
      getBrokerName: () => 'kraken',
      getPositions: jest.fn(async () => {
        throw new Error('kraken offline');
      }),
    };
    router.registerBroker(stockAdapter, ['TSLA']);
    router.registerBroker(cryptoAdapter, ['BTC-USD']);

    const result = await router.getAllPositions();

    expect(result.positions).toEqual([{ symbol: 'TSLA', size: 1, broker: 'alpaca' }]);
    expect(result.complete).toBe(false);
    expect(result.brokerStatuses).toEqual([
      { broker: 'alpaca', status: 'complete', positionCount: 1 },
      expect.objectContaining({
        broker: 'kraken',
        status: 'unavailable',
        code: 'broker_position_truth_unavailable',
        reason: 'broker_position_read_failed',
        error: 'kraken offline',
      }),
    ]);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('POSITION_TRUTH_UNAVAILABLE'));
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'ORDER_ROUTER_POSITION_TRUTH_UNAVAILABLE',
        fields: expect.objectContaining({
          broker: 'kraken',
          reason: 'broker_position_read_failed',
        }),
      }),
    ]));
    unsubscribe();
    consoleError.mockRestore();
  });
});

describe('OrderRouter trace metadata', () => {
  test('preserves trace metadata on the router result without forwarding it to adapter options', async () => {
    const router = new OrderRouter();
    const adapter = {
      getBrokerName: () => 'mock',
      placeBuyOrder: jest.fn().mockResolvedValue({ orderId: 'ORDER_TRACE_1' }),
    };
    router.registerBroker(adapter, ['TSLA']);

    const result = await router.sendOrder({
      symbol: 'TSLA',
      side: 'buy',
      amount: 5,
      type: 'market',
      traceId: 'trace_router_1',
      signalId: 'signal_router_1',
      decisionId: 'decision_router_1',
      options: {
        sizeUsd: 500,
        quantityUnit: 'shares',
      },
    });

    expect(adapter.placeBuyOrder).toHaveBeenCalledWith(
      'TSLA',
      5,
      null,
      {
        sizeUsd: 500,
        quantityUnit: 'shares',
      }
    );
    expect(result).toEqual(expect.objectContaining({
      orderId: 'ORDER_TRACE_1',
      traceId: 'trace_router_1',
      signalId: 'signal_router_1',
      decisionId: 'decision_router_1',
    }));
  });
});
