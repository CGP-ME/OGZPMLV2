'use strict';
require('../helpers/require-isolation.cjs')();
const mockSockets = [];
jest.mock('ws', () => {
  const { EventEmitter } = require('events');
  class Socket extends EventEmitter {
    constructor() { super(); this.readyState = Socket.CONNECTING; mockSockets.push(this); }
    send() {}
    ping() { this.emit('pong'); }
    close() { this.readyState = Socket.CLOSED; this.emit('close', 1000, 'closed'); }
    terminate() { this.close(); }
  }
  Socket.CONNECTING = 0; Socket.OPEN = 1; Socket.CLOSED = 3;
  return Socket;
});
for (const key of ['KRAKEN_API_KEY', 'KRAKEN_API_SECRET', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'WEBSOCKET_AUTH_TOKEN']) process.env[key] = 'synthetic-stream-test';
process.env.PROFILE = 'paper';
const ConfigLoader = require('../../foundation/ConfigLoader');
ConfigLoader.load({ role: 'bot', loadDotenv: false, silent: true });
const AlpacaAdapter = require('../../brokers/AlpacaAdapter');

function authenticate(socket) {
  socket.readyState = 1;
  socket.emit('open');
  socket.emit('message', JSON.stringify([{ T: 'success', msg: 'authenticated' }]));
}

test.each(['authenticated', 'connecting', 'reconnecting'])('session unsubscribe retires a %s stream and later subscriptions restore it', async (phase) => {
  jest.useFakeTimers();
  const spies = ['log', 'warn', 'error'].map(name => jest.spyOn(console, name).mockImplementation(() => {}));
  const adapter = new AlpacaAdapter({ apiKey: 'synthetic-key', apiSecret: 'synthetic-secret', mode: 'paper',
    webSocket: ConfigLoader.getInternalsFileValue('broker.alpacaWebSocket') });
  try {
    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    if (phase !== 'connecting') authenticate(mockSockets.at(-1));
    if (phase === 'reconnecting') mockSockets.at(-1).close();
    const accountSocket = { close: jest.fn() };
    adapter.accountWs = accountSocket;
    adapter.connected = true;
    const oldStream = adapter.rws;
    const stale = jest.fn(); oldStream.on('data-stale', stale);
    if (phase === 'authenticated') expect(oldStream.dataWatchdogTimer).not.toBeNull();
    if (phase === 'reconnecting') expect(oldStream.reconnectTimer).not.toBeNull();
    await adapter.unsubscribeAll();
    expect(oldStream.dataWatchdogTimer).toBeNull();
    expect(oldStream.reconnectTimer).toBeNull();
    expect(adapter.accountWs).toBe(accountSocket);
    expect(accountSocket.close).not.toHaveBeenCalled();
    expect(adapter.connected).toBe(true);
    adapter.accountWs = null;
    jest.advanceTimersByTime(oldStream.dataWatchdogMs * 3);
    expect(stale).not.toHaveBeenCalled();
    const bars = jest.fn();
    adapter.subscribeToCandles('RIOT', '1m', bars);
    authenticate(mockSockets.at(-1));
    expect(adapter.rws.isReady()).toBe(true);
    expect(adapter.rws.dataWatchdogTimer).not.toBeNull();
    expect(adapter.subscriptions.has('bars-RIOT')).toBe(true);
    expect(adapter.subscriptions.has('bars-TSLA')).toBe(false);
    const liveStale = jest.fn();
    adapter.rws.on('data-stale', liveStale);
    jest.setSystemTime(Date.now() + adapter.rws.dataWatchdogMs + 1);
    adapter.rws._tickDataWatchdog();
    expect(liveStale).toHaveBeenCalledTimes(1);
    expect(adapter.rws.reconnectTimer).not.toBeNull();
  } finally {
    adapter.accountWs = null;
    await adapter.disconnect();
    jest.useRealTimers(); spies.forEach(spy => spy.mockRestore());
  }
});


test('unsubscribe reports a socket close failure through the existing broker truth channel', async () => {
  jest.useFakeTimers();
  const spies = ['log', 'warn', 'error'].map(name => jest.spyOn(console, name).mockImplementation(() => {}));
  const adapter = new AlpacaAdapter({ apiKey: 'synthetic-key', apiSecret: 'synthetic-secret', mode: 'paper',
    webSocket: ConfigLoader.getInternalsFileValue('broker.alpacaWebSocket') });
  try {
    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const socket = mockSockets.at(-1);
    authenticate(socket);
    const oldStream = adapter.rws;
    const unavailable = jest.fn();
    adapter.on('broker_truth_unavailable', unavailable);
    socket.close = () => { throw new Error('synthetic transport close failure'); };
    const result = await adapter.unsubscribeAll();
    expect(result).toEqual({ success: false, code: 'RESILIENT_WS_CLOSE_FAILED', reason: 'synthetic transport close failure' });
    expect(unavailable).toHaveBeenCalledWith(expect.objectContaining({ reason: 'alpaca_data_stream_stop_failed', operation: 'unsubscribeAll' }));
    expect(oldStream.dataWatchdogTimer).toBeNull();
    expect(oldStream.reconnectTimer).toBeNull();
  } finally {
    await adapter.disconnect();
    jest.useRealTimers(); spies.forEach(spy => spy.mockRestore());
  }
});


test('a new subscription during delayed closure owns a fresh stream, including late old auth frames', async () => {
  jest.useFakeTimers();
  const spies = ['log', 'warn', 'error'].map(name => jest.spyOn(console, name).mockImplementation(() => {}));
  const adapter = new AlpacaAdapter({ apiKey: 'synthetic-key', apiSecret: 'synthetic-secret', mode: 'paper',
    webSocket: ConfigLoader.getInternalsFileValue('broker.alpacaWebSocket') });
  try {
    adapter.subscribeToCandles('TSLA', '1m', jest.fn());
    const oldSocket = mockSockets.at(-1); authenticate(oldSocket);
    const oldStream = adapter.rws;
    oldSocket.close = () => { oldSocket.readyState = 2; };
    let finished = false;
    const retiring = adapter.unsubscribeAll().then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    adapter.subscribeToCandles('RIOT', '1m', jest.fn());
    const replacement = adapter.rws;
    expect(replacement).not.toBe(oldStream);
    const replacementSocket = mockSockets.at(-1);
    oldSocket.emit('message', JSON.stringify([{ T: 'success', msg: 'authenticated' }]));
    expect(oldStream.dataWatchdogTimer).toBeNull();
    expect(adapter._pendingSubscribeCallbacks).toHaveLength(1);
    oldSocket.readyState = 3; oldSocket.emit('close', 1000, 'closed');
    await retiring;
    expect(adapter.rws).toBe(replacement);
    authenticate(replacementSocket);
    expect(adapter.rws.isReady()).toBe(true);
    expect(adapter.rws.dataWatchdogTimer).not.toBeNull();
    expect(adapter.subscriptions.has('bars-RIOT')).toBe(true);
    expect(adapter.subscriptions.has('bars-TSLA')).toBe(false);
    expect(adapter._pendingSubscribeCallbacks).toHaveLength(0);
  } finally {
    for (const socket of mockSockets) {
      if (socket.readyState === 2) { socket.readyState = 3; socket.emit('close', 1000, 'cleanup'); }
    }
    await adapter.disconnect();
    jest.useRealTimers(); spies.forEach(spy => spy.mockRestore());
  }
});
