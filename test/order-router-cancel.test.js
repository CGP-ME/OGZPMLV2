'use strict';

const OrderRouter = require('../core/OrderRouter');

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
