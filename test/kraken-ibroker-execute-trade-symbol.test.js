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

  test('cancelOrder delegates to the validated Kraken cancel boundary', async () => {
    const adapter = new KrakenIBrokerAdapter();
    adapter.kraken.cancelOrder = jest.fn(async () => true);

    await expect(adapter.cancelOrder('ORDER-123')).resolves.toBe(true);

    expect(adapter.kraken.cancelOrder).toHaveBeenCalledWith('ORDER-123');
  });

  test('historical candles use asset-registry Kraken REST pair for BTC', async () => {
    const adapter = new KrakenIBrokerAdapter();
    adapter.kraken.getHistoricalOHLC = jest.fn(async () => []);

    await adapter.getCandles('BTC-USD', '1m', 60);
    await adapter.getCandles('XBT/USD', '5m', 25);
    await adapter.getCandles('XBTUSD', '15m', 10);
    await adapter.getCandles('DOGE-USD', '1m', 30);
    await adapter.getCandles('XDG/USD', '1m', 20);

    expect(adapter.kraken.getHistoricalOHLC).toHaveBeenNthCalledWith(1, 'XXBTZUSD', 1, 60);
    expect(adapter.kraken.getHistoricalOHLC).toHaveBeenNthCalledWith(2, 'XXBTZUSD', 5, 25);
    expect(adapter.kraken.getHistoricalOHLC).toHaveBeenNthCalledWith(3, 'XXBTZUSD', 15, 10);
    expect(adapter.kraken.getHistoricalOHLC).toHaveBeenNthCalledWith(4, 'XDGUSD', 1, 30);
    expect(adapter.kraken.getHistoricalOHLC).toHaveBeenNthCalledWith(5, 'XDGUSD', 1, 20);
  });

  test('historical candles reject non-Kraken symbols instead of guessing a pair', async () => {
    const adapter = new KrakenIBrokerAdapter();
    adapter.kraken.getHistoricalOHLC = jest.fn(async () => []);

    await expect(adapter.getCandles('TSLA', '1m', 60))
      .rejects
      .toThrow('[KrakenIBroker] TSLA has no Kraken REST OHLC pair; broker=alpaca');
    await expect(adapter.getCandles('XETCZUSD', '1m', 60))
      .rejects
      .toThrow('[KrakenIBroker] no asset registry entry for XETCZUSD; refusing Kraken REST OHLC request');

    expect(adapter.kraken.getHistoricalOHLC).not.toHaveBeenCalled();
  });

  test('ticker requests reject non-Kraken symbols before lower adapter delegation', async () => {
    const adapter = new KrakenIBrokerAdapter();
    adapter.kraken.getMarketData = jest.fn(async () => ({
      bid: 49999,
      ask: 50001,
      price: 50000,
      volume: 12
    }));

    await expect(adapter.getTicker('TSLAUSD'))
      .rejects
      .toThrow('[KrakenIBroker] getTicker received invalid Kraken symbol: TSLAUSD');
    expect(adapter.kraken.getMarketData).not.toHaveBeenCalled();

    const ticker = await adapter.getTicker('XBT/USD');
    expect(adapter.kraken.getMarketData).toHaveBeenCalledWith('BTC-USD');
    expect(ticker).toMatchObject({
      symbol: 'BTC-USD',
      bid: 49999,
      ask: 50001,
      last: 50000,
      volume: 12
    });
  });

  test('ticker subscription normalizes Kraken aliases before filtering callback frames', () => {
    const adapter = new KrakenIBrokerAdapter();
    const callback = jest.fn();
    adapter.kraken.connectWebSocketStream = jest.fn((handler) => {
      handler({ symbol: 'BTC-USD', bid: 49999, ask: 50001, price: 50000, volume: 12, timestamp: 1770000000000 });
      handler({ symbol: 'ETH-USD', bid: 3999, ask: 4001, price: 4000, volume: 8, timestamp: 1770000001000 });
    });

    adapter.subscribeToTicker('XBT/USD', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      symbol: 'BTC-USD',
      bid: 49999,
      ask: 50001,
      last: 50000,
      volume: 12,
      timestamp: 1770000000000
    });
  });

  test('order book subscription normalizes incoming depth symbols before filtering callback frames', () => {
    const adapter = new KrakenIBrokerAdapter();
    const callback = jest.fn();
    adapter.kraken.connectWebSocketStream = jest.fn();

    adapter.subscribeToOrderBook('BTC-USD', callback);
    adapter.emit('depth_update', { type: 'depth_update', symbol: 'XBT/USD', depth: { bids: [] } });
    adapter.emit('depth_update', { type: 'depth_update', symbol: 'ETH/USD', depth: { bids: [] } });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      type: 'depth_update',
      symbol: 'BTC-USD',
      depth: { bids: [] }
    });
  });

  test('broker symbol conversion refuses unknown pairs instead of guessing', () => {
    const adapter = new KrakenIBrokerAdapter();

    expect(adapter.toBrokerSymbol('BTC-USD')).toBe('XBT/USD');
    expect(adapter.toBrokerSymbol('XBT/USD')).toBe('XBT/USD');
    expect(adapter.toBrokerSymbol('DOGE-USD')).toBe('XDG/USD');
    expect(adapter.fromBrokerSymbol('XBT/USD')).toBe('BTC-USD');
    expect(adapter.fromBrokerSymbol('XXBTZUSD')).toBe('BTC-USD');
    expect(adapter.fromBrokerSymbol('XDG/USD')).toBe('DOGE-USD');
    expect(adapter.fromBrokerSymbol('XDGUSD')).toBe('DOGE-USD');
    expect(adapter.fromBrokerSymbol('UNKNOWN/PAIR')).toBeNull();
    expect(() => adapter.toBrokerSymbol('FAKE-USD')).toThrow(
      '[KrakenIBroker] no Kraken WebSocket mapping for FAKE-USD'
    );
    expect(() => adapter.subscribeToTicker('FAKE-USD', jest.fn())).toThrow(
      '[KrakenIBroker] subscribeToTicker received invalid Kraken symbol: FAKE-USD'
    );
  });
});
