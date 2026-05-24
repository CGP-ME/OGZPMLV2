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

    const positions = await router.getAllPositions({ brokerNames: ['alpaca'], strict: true });

    expect(cryptoAdapter.getPositions).not.toHaveBeenCalled();
    expect(positions).toEqual([
      { symbol: 'TSLA', size: 1, broker: 'alpaca' },
      { symbol: 'MSFT', size: 2, broker: 'alpaca' },
    ]);
  });

  test('throws in strict mode when broker scope matches no adapters', async () => {
    const router = new OrderRouter();
    const stockAdapter = {
      getBrokerName: () => 'Alpaca',
      getAssetType: () => 'stocks',
      getPositions: jest.fn(async () => []),
    };
    router.registerBroker(stockAdapter, ['TSLA']);

    expect(router.getBrokerNamesByAssetType(['stocks'])).toEqual(['alpaca']);
    await expect(router.getAllPositions({ brokerNames: ['kraken'], strict: true }))
      .rejects.toThrow(/broker scope matched no adapters/);
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
