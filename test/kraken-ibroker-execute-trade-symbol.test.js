const KrakenIBrokerAdapter = require('../brokers/KrakenIBrokerAdapter');

describe('KrakenIBrokerAdapter executeTrade symbol contract', () => {
  function buildAdapter() {
    const adapter = new KrakenIBrokerAdapter();
    adapter.kraken.placeOrder = jest.fn(async order => ({
      orderId: 'TEST-IBROKER-KRAKEN-ORDER',
      status: 'pending',
      ...order
    }));
    return adapter;
  }

  test('rejects missing marketData.symbol instead of defaulting execution', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'buy',
      positionSize: 0.002,
      confidence: 100,
      marketData: { price: 50000 },
      decisionId: 'DECISION-1'
    })).rejects.toThrow('[KrakenIBroker] executeTrade requires marketData.symbol');

    expect(adapter.kraken.placeOrder).not.toHaveBeenCalled();
  });

  test('rejects malformed marketData.symbol before order placement', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'buy',
      positionSize: 0.002,
      confidence: 100,
      marketData: { symbol: 'BTC--USD', price: 50000 },
      decisionId: 'DECISION-2'
    })).rejects.toThrow('[KrakenIBroker] executeTrade received invalid marketData.symbol: BTC--USD');

    expect(adapter.kraken.placeOrder).not.toHaveBeenCalled();
  });

  test('places orders and returns canonical symbols only after explicit normalization', async () => {
    const adapter = buildAdapter();

    const result = await adapter.executeTrade({
      direction: 'buy',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'XBT/USD', price: 50000 },
      decisionId: 'DECISION-3',
      meta: { traceId: 'TRACE-3' }
    });

    expect(adapter.kraken.placeOrder).toHaveBeenCalledWith({
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002
    });
    expect(result.symbol).toBe('BTC-USD');
    expect(result.decisionId).toBe('DECISION-3');
    expect(result.requestedQty).toBe(0.002);
    expect(result.requestedSizeUsd).toBe(100);
    expect(result.meta).toEqual({ traceId: 'TRACE-3' });
  });

  test('rejects invalid directions before order placement', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'hold',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'BTC-USD', price: 50000 },
      decisionId: 'DECISION-4'
    })).rejects.toThrow('[KrakenIBroker] executeTrade invalid direction: hold');

    expect(adapter.kraken.placeOrder).not.toHaveBeenCalled();
  });

  test('direct wrapper placeOrder uses the validated Kraken order boundary', async () => {
    const adapter = new KrakenIBrokerAdapter();
    adapter.kraken.assetPairs.set('XXBTZUSD', { ordermin: '0.0001', lot_decimals: 8 });
    adapter.kraken.makePrivateRequest = jest.fn(async () => ({
      result: { txid: ['TEST-DIRECT-WRAPPER-ORDER'] }
    }));

    await expect(adapter.placeOrder({
      symbol: 'BTC--USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002
    })).rejects.toThrow('Invalid order symbol: BTC--USD');

    expect(adapter.kraken.makePrivateRequest).not.toHaveBeenCalled();

    const result = await adapter.placeOrder({
      symbol: 'XBT/USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002
    });

    expect(adapter.kraken.makePrivateRequest).toHaveBeenCalledWith('/0/private/AddOrder', {
      pair: 'XXBTZUSD',
      type: 'buy',
      ordertype: 'market',
      volume: '0.002'
    });
    expect(result.symbol).toBe('BTC-USD');
  });
});
