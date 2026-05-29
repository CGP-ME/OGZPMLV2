const KrakenAdapterSimple = require('../kraken_adapter_simple');

describe('KrakenAdapterSimple executeTrade symbol contract', () => {
  function buildAdapter() {
    const adapter = new KrakenAdapterSimple();
    adapter.assetPairs.set('XXBTZUSD', { ordermin: '0.0001', lot_decimals: 8 });
    adapter.makePrivateRequest = jest.fn(async () => ({
      result: { txid: ['TEST-KRAKEN-ORDER'] }
    }));
    adapter.placeOrder = jest.fn(async order => ({
      orderId: 'TEST-KRAKEN-ORDER',
      status: 'pending',
      ...order
    }));
    return adapter;
  }

  test('rejects missing marketData.symbol instead of defaulting to BTC-USD', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'buy',
      positionSize: 100,
      confidence: 100,
      marketData: { price: 50000 }
    })).rejects.toThrow('Kraken executeTrade requires marketData.symbol');

    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  test('rejects malformed marketData.symbol before order placement', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'buy',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'BTC--USD', price: 50000 }
    })).rejects.toThrow('Kraken executeTrade received invalid marketData.symbol: BTC--USD');

    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  test('normalizes explicit symbols and places the order on that symbol', async () => {
    const adapter = buildAdapter();

    const result = await adapter.executeTrade({
      direction: 'buy',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'XBT/USD', price: 50000 }
    });

    expect(adapter.placeOrder).toHaveBeenCalledWith({
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002
    });
    expect(result.symbol).toBe('BTC-USD');
  });

  test('rejects missing execution price instead of sizing from cached adapter state', async () => {
    const adapter = buildAdapter();
    adapter.currentPrices.set('ETH-USD', {
      price: 2500,
      timestamp: Date.now(),
      volume: 42,
      source: 'kraken'
    });

    await expect(adapter.executeTrade({
      direction: 'sell',
      positionSize: 125,
      confidence: 100,
      marketData: { symbol: 'ETH-USD' }
    })).rejects.toThrow('Kraken executeTrade requires positive marketData.price for ETH-USD');

    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  test('accepts object-wrapped marketData.price without falling back to cache', async () => {
    const adapter = buildAdapter();

    await adapter.executeTrade({
      direction: 'buy',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'BTC-USD', price: { price: 50000 } }
    });

    expect(adapter.placeOrder).toHaveBeenCalledWith({
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002
    });
  });

  test('rejects malformed object-wrapped marketData.price', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'buy',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'BTC-USD', price: { last: 50000 } }
    })).rejects.toThrow('Kraken executeTrade requires positive marketData.price for BTC-USD');

    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  test('rejects marketData.close as an execution sizing fallback', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'buy',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'BTC-USD', close: 50000 }
    })).rejects.toThrow('Kraken executeTrade requires positive marketData.price for BTC-USD');

    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  test('rejects invalid position size before quantity calculation', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'buy',
      positionSize: 'not-a-number',
      confidence: 100,
      marketData: { symbol: 'BTC-USD', price: 50000 }
    })).rejects.toThrow('Invalid position size for BTC-USD: not-a-number');

    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  test('rejects invalid direction before order placement', async () => {
    const adapter = buildAdapter();

    await expect(adapter.executeTrade({
      direction: 'hold',
      positionSize: 100,
      confidence: 100,
      marketData: { symbol: 'BTC-USD', price: 50000 }
    })).rejects.toThrow('Kraken executeTrade invalid direction: hold');

    expect(adapter.placeOrder).not.toHaveBeenCalled();
  });

  test('direct placeOrder rejects malformed symbols before Kraken AddOrder', async () => {
    const adapter = new KrakenAdapterSimple();
    adapter.assetPairs.set('XXBTZUSD', { ordermin: '0.0001', lot_decimals: 8 });
    adapter.makePrivateRequest = jest.fn();

    await expect(adapter.placeOrder({
      symbol: 'BTC--USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002
    })).rejects.toThrow('Invalid order symbol: BTC--USD');

    expect(adapter.makePrivateRequest).not.toHaveBeenCalled();
  });

  test('direct placeOrder normalizes explicit Kraken pair aliases before AddOrder', async () => {
    const adapter = new KrakenAdapterSimple();
    adapter.assetPairs.set('XXBTZUSD', { ordermin: '0.0001', lot_decimals: 8 });
    adapter.makePrivateRequest = jest.fn(async () => ({
      result: { txid: ['TEST-DIRECT-KRAKEN-ORDER'] }
    }));

    const result = await adapter.placeOrder({
      symbol: 'XBT/USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002
    });

    expect(adapter.makePrivateRequest).toHaveBeenCalledWith('/0/private/AddOrder', {
      pair: 'XXBTZUSD',
      type: 'buy',
      ordertype: 'market',
      volume: '0.002'
    });
    expect(result.symbol).toBe('BTC-USD');
  });

  test('direct placeOrder floors quantity to Kraken lot precision before AddOrder', async () => {
    const adapter = new KrakenAdapterSimple();
    adapter.assetPairs.set('XXBTZUSD', { ordermin: '0.0001', lot_decimals: 8 });
    adapter.makePrivateRequest = jest.fn(async () => ({
      result: { txid: ['TEST-PRECISION-KRAKEN-ORDER'] }
    }));

    const result = await adapter.placeOrder({
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 0.123456789
    });

    expect(adapter.makePrivateRequest).toHaveBeenCalledWith('/0/private/AddOrder', {
      pair: 'XXBTZUSD',
      type: 'buy',
      ordertype: 'market',
      volume: '0.12345678'
    });
    expect(result.quantity).toBe(0.12345678);
  });

  test('direct placeOrder rejects quantities that round below Kraken lot precision', async () => {
    const adapter = new KrakenAdapterSimple();
    adapter.assetPairs.set('XXBTZUSD', { ordermin: '0.00000001', lot_decimals: 8 });
    adapter.makePrivateRequest = jest.fn();

    await expect(adapter.placeOrder({
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 0.000000001
    })).rejects.toThrow('Order quantity 1e-9 rounds below precision for BTC-USD');

    expect(adapter.makePrivateRequest).not.toHaveBeenCalled();
  });
});
