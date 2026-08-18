'use strict';

const mockRwsInstances = [];

jest.mock('../foundation/ResilientWebSocket', () => {
  return jest.fn().mockImplementation(function MockResilientWebSocket(config) {
    this.config = config;
    this.ws = { readyState: 1, close: jest.fn() };
    this.ready = false;
    this.start = jest.fn();
	    this.stop = jest.fn(() => {
	      this.ready = false;
	      this.health = {
	        status: 'DEAD',
        failureReason: 'intentional stop',
        details: this.health.details,
        lastSuccessAt: 0,
      };
	    });
	    this.send = jest.fn();
	    this.isReady = jest.fn(() => this.ready);
	    this.handlers = {};
	    this.on = jest.fn((event, handler) => {
	      this.handlers[event] = handler;
	      return this;
	    });
	    this.health = {
      status: 'HEALTHY',
      failureReason: null,
      details: {
        url: config.url,
        readyState: 1,
        isAuthenticated: true,
        reconnectAttempts: 0,
        msSinceMessage: 10,
        msSincePong: null,
      },
      lastSuccessAt: 1770000000000,
    };
    this.getHealth = jest.fn(() => this.health);
    mockRwsInstances.push(this);
  });
});

const ResilientWebSocket = require('../foundation/ResilientWebSocket');
const AlpacaAdapter = require('../brokers/AlpacaAdapter');
const { subscribeTrace } = require('../core/TraceSpine');

function buildAdapter() {
  return new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });
}

describe('AlpacaAdapter data stream resilience', () => {
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    mockRwsInstances.length = 0;
    ResilientWebSocket.mockClear();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('builds one resilient socket and drains every pending subscribe after array auth success', () => {
    const adapter = buildAdapter();
    const tslaCb = jest.fn();
    const spyCb = jest.fn();

    adapter.subscribeToCandles('TSLA', '1m', tslaCb);
    adapter.subscribeToCandles('SPY', '1m', spyCb);

    expect(ResilientWebSocket).toHaveBeenCalledTimes(1);
    const rws = mockRwsInstances[0];
    expect(rws.start).toHaveBeenCalledTimes(1);
    expect(rws.send).not.toHaveBeenCalled();
    expect(rws.config.authSuccessPredicate([{ T: 'success', msg: 'authenticated' }])).toBe(true);

    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });

    expect(rws.send).toHaveBeenCalledWith({ action: 'subscribe', bars: ['TSLA'] });
    expect(rws.send).toHaveBeenCalledWith({ action: 'subscribe', bars: ['SPY'] });
    expect(adapter.subscriptions.has('bars-TSLA')).toBe(true);
    expect(adapter.subscriptions.has('bars-SPY')).toBe(true);
  });

  test('initial subscription send failure is traced and does not mark symbol subscribed', () => {
    const adapter = buildAdapter();
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

    try {
      adapter.subscribeToCandles('TSLA', '1m', jest.fn());
      const rws = mockRwsInstances[0];
      rws.ready = true;
      rws.send.mockImplementationOnce(() => {
        throw new Error('socket send failed');
      });

      expect(() => rws.config.onAuthenticated({ isReconnect: false })).not.toThrow();
      expect(adapter.subscriptions.has('bars-TSLA')).toBe(false);
      expect(adapter.barSubscriptions.has('TSLA')).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ALPACA_INITIAL_SUBSCRIBE_FAILED'));
      expect(traces).toEqual(expect.arrayContaining([
        expect.objectContaining({
          event: 'ALPACA_INITIAL_SUBSCRIBE_FAILED',
          fields: expect.objectContaining({
            reason: 'alpaca_initial_subscribe_failed',
            subscriptionKey: 'bars-TSLA',
            error: 'socket send failed',
          }),
        }),
      ]));
    } finally {
      unsubscribe();
    }
  });

  test('replays active subscriptions on reconnect without creating another socket', () => {
    const adapter = buildAdapter();

    adapter.subscribeToTicker('TSLA', jest.fn());
    adapter.subscribeToCandles('SPY', '1m', jest.fn());
    adapter.subscribeToOrderBook('QQQ', jest.fn());

    const rws = mockRwsInstances[0];
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });
    rws.send.mockClear();

    rws.config.onAuthenticated({ isReconnect: true });

    expect(ResilientWebSocket).toHaveBeenCalledTimes(1);
    expect(rws.send).toHaveBeenCalledWith({
      action: 'subscribe',
      trades: ['TSLA'],
      quotes: ['QQQ'],
      bars: ['SPY'],
    });
  });

  test('dispatches bar messages to callback and ohlc event with symbol intact', () => {
    const adapter = buildAdapter();
    const barCb = jest.fn();
    const ohlcCb = jest.fn();

    adapter.subscribeToCandles('TSLA', '1m', barCb);
    const rws = mockRwsInstances[0];
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });
    adapter.on('ohlc', ohlcCb);

    rws.config.onMessage([{ T: 'b', S: 'TSLA', o: 397, h: 398, l: 396, c: 397.5, v: 1000, t: '2026-06-12T14:30:00Z' }]);

    const expectedBar = {
      o: 397,
      h: 398,
      l: 396,
      c: 397.5,
      v: 1000,
      t: '2026-06-12T14:30:00Z',
      etime: Date.parse('2026-06-12T14:31:00Z'),
      symbol: 'TSLA',
    };
    expect(barCb).toHaveBeenCalledWith(expectedBar);
    expect(ohlcCb).toHaveBeenCalledWith({ timeframe: '1m', data: expectedBar, symbol: 'TSLA' });
  });

  test('rejects stream bars for symbols without an active bar subscription contract', () => {
    const adapter = buildAdapter();
    const ohlcCb = jest.fn();
    adapter.on('ohlc', ohlcCb);

    adapter._handleOneStreamMessage({ T: 'b', S: 'TSLA', o: 397, h: 398, l: 396, c: 397.5, v: 1000, t: '2026-06-12T14:30:00Z' });

    expect(ohlcCb).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[Alpaca] Received bar for unsubscribed symbol TSLA');
  });

  test('rejects unaligned stream bar timestamps before emitting OHLC', () => {
    const adapter = buildAdapter();
    const barCb = jest.fn();
    const ohlcCb = jest.fn();

    adapter.subscribeToCandles('TSLA', '1m', barCb);
    const rws = mockRwsInstances[0];
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });
    adapter.on('ohlc', ohlcCb);

    rws.config.onMessage([{ T: 'b', S: 'TSLA', o: 397, h: 398, l: 396, c: 397.5, v: 1000, t: '2026-06-12T14:30:45Z' }]);

    expect(barCb).not.toHaveBeenCalled();
    expect(ohlcCb).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[Alpaca] Received unaligned 1m bar timestamp for TSLA: 2026-06-12T14:30:45Z');
  });

	  test('closes unauthenticated stream on auth-class error so resilient owner can reconnect', () => {
    const adapter = buildAdapter();

    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const rws = mockRwsInstances[0];

    rws.config.onMessage([{ T: 'error', code: 'auth_failed', msg: 'authentication failed' }]);

    expect(rws.ws.close).toHaveBeenCalledTimes(1);

    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: true });

    expect(rws.send).toHaveBeenCalledWith({ action: 'subscribe', bars: ['TSLA'] });
    expect(adapter.subscriptions.has('bars-TSLA')).toBe(true);
	  });

	  test('routes non-auth stream failures through broker-truth trace instead of log-only', () => {
	    const adapter = buildAdapter();
	    const traces = [];
	    const unsubscribe = subscribeTrace((payload) => traces.push(payload));

	    try {
	      adapter.subscribeToCandles('TSLA', '1m', jest.fn());
	      const rws = mockRwsInstances[0];

	      rws.handlers.error(new Error('socket transport reset'));
	      rws.handlers['data-stale']({ silentForMs: 61000 });
	      rws.config.onMessage([{ T: 'error', code: 500, msg: 'feed unavailable' }]);
	      rws.config.onMessage([{}]);

	      expect(traces).toEqual(expect.arrayContaining([
	        expect.objectContaining({
	          event: 'ALPACA_WS_TRANSPORT_UNAVAILABLE',
	          fields: expect.objectContaining({
	            reason: 'alpaca_ws_transport_unavailable',
	            operation: 'ws-data-upgrade-auth',
	            error: 'socket transport reset',
	          }),
	        }),
	        expect.objectContaining({
	          event: 'ALPACA_DATA_STREAM_STALE',
	          fields: expect.objectContaining({
	            reason: 'alpaca_data_stream_stale',
	            operation: 'dataStreamWatchdog',
	            silentForMs: 61000,
	          }),
	        }),
	        expect.objectContaining({
	          event: 'ALPACA_DATA_STREAM_ERROR',
	          fields: expect.objectContaining({
	            reason: 'alpaca_data_stream_error',
	            operation: 'dataStreamError',
	            streamCode: 500,
	            error: 'feed unavailable',
	          }),
	        }),
	        expect.objectContaining({
	          event: 'ALPACA_DATA_STREAM_MESSAGE_UNAVAILABLE',
	          fields: expect.objectContaining({
	            reason: 'alpaca_data_stream_message_unavailable',
	            operation: 'dataStreamMessage',
	          }),
	        }),
	      ]));
	    } finally {
	      unsubscribe();
	    }
	  });

	  test('does not replay newly drained pending callbacks as duplicate reconnect subscriptions', () => {
    const adapter = buildAdapter();

    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const rws = mockRwsInstances[0];
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });
    rws.send.mockClear();

    rws.ready = false;
    adapter.subscribeToCandles('SPY', '1m', jest.fn());
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: true });

    expect(rws.send).toHaveBeenCalledWith({ action: 'subscribe', bars: ['SPY'] });
    expect(rws.send).toHaveBeenCalledWith({
      action: 'subscribe',
      trades: [],
      quotes: [],
      bars: ['TSLA'],
    });
    expect(rws.send).not.toHaveBeenCalledWith({
      action: 'subscribe',
      trades: [],
      quotes: [],
      bars: ['TSLA', 'SPY'],
    });
  });

  test('dedupes same-key subscription queued during reconnect against replay snapshot', () => {
    const adapter = buildAdapter();

    adapter.subscribeToTicker('AAPL', jest.fn());
    const rws = mockRwsInstances[0];
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });
    rws.send.mockClear();

    rws.ready = false;
    adapter.subscribeToTicker('AAPL', jest.fn());
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: true });

    expect(rws.send).toHaveBeenCalledTimes(1);
    expect(rws.send).toHaveBeenCalledWith({ action: 'subscribe', trades: ['AAPL'] });
  });

  test('unsubscribeAll clears pending subscriptions before auth so they cannot resurrect', () => {
    const adapter = buildAdapter();

    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const rws = mockRwsInstances[0];

    adapter.unsubscribeAll();
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });

    expect(rws.send).not.toHaveBeenCalled();
    expect(adapter.subscriptions.size).toBe(0);
    expect(adapter.barSubscriptions.size).toBe(0);
    expect(adapter._pendingSubscribeCallbacks).toEqual([]);
  });

  test('refuses unkeyed data stream pending callbacks', () => {
    const adapter = buildAdapter();

    expect(() => adapter._ensureDataStream(() => {})).toThrow(/stable subscription key/);
  });

  test('returns stable health shape before stream start and during disconnect race', () => {
    const adapter = buildAdapter();
    adapter.connected = true;

    const coldHealth = adapter.getHealth();
    expect(coldHealth.status).toBe('DEGRADED');
    expect(coldHealth.details.ws).toEqual(expect.objectContaining({
      url: 'wss://stream.data.alpaca.markets/v2/iex',
      readyState: -1,
      isAuthenticated: false,
      reconnectAttempts: 0,
    }));

    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const rws = mockRwsInstances[0];
    rws.ready = true;
    adapter.intentionalDisconnect = true;

    const raceHealth = adapter.getHealth();
    expect(raceHealth.status).toBe('DEGRADED');
    expect(raceHealth.failureReason).toMatch(/disconnect in progress/);
    expect(raceHealth.details.ws).toEqual(rws.health.details);
  });

  test('disconnect stops the resilient socket and prevents reconnect ownership from leaking', async () => {
    const adapter = buildAdapter();
    adapter.connected = true;
    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const rws = mockRwsInstances[0];

    await adapter.disconnect();

    expect(rws.stop).toHaveBeenCalledTimes(1);
    expect(adapter.rws).toBeNull();
    expect(adapter.connected).toBe(false);
    expect(adapter.getHealth().status).toBe('DEAD');
  });

  test('unsubscribeAll sends through resilient socket only when authenticated', () => {
    const adapter = buildAdapter();

    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const rws = mockRwsInstances[0];
    rws.ready = true;
    rws.config.onAuthenticated({ isReconnect: false });
    rws.send.mockClear();

    adapter.unsubscribeAll();

    expect(rws.send).toHaveBeenCalledWith({
      action: 'unsubscribe',
      trades: [],
      quotes: [],
      bars: ['TSLA'],
    });
    expect(adapter.subscriptions.size).toBe(0);
    expect(adapter.barSubscriptions.size).toBe(0);
  });
});
