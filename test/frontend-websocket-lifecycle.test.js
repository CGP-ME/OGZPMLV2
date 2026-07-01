const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'websocket.js'),
  'utf8'
);

function createHarness({
  protocol = 'https:',
  host = 'dashboard.test',
  hash = '',
  token = '',
  windowToken = '',
  legacyStoredToken = '',
  cpAsset = 'BTC-USD',
  cpTimeframe = '1m',
  historyReplaceThrows = false,
  hashSetThrows = false,
  locationReplaceThrows = false,
  sessionTicket = '',
  enrollmentTicket = '',
  enrollmentOk = true,
} = {}) {
  const instances = [];
  const registered = {};
  const localStorageMap = new Map();
  const elementsById = new Map();
  if (legacyStoredToken) localStorageMap.set('ogz.dashboard.wsToken', legacyStoredToken);

  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.listeners = {};
      this.focus = jest.fn();
      this.textContent = '';
      this.className = '';
      this.type = '';
      this.name = '';
      this.autocomplete = '';
      this.placeholder = '';
      this.value = '';
      this._id = '';
    }

    set id(value) {
      this._id = value;
      if (value) elementsById.set(value, this);
    }

    get id() {
      return this._id;
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) elementsById.set(child.id, child);
      return child;
    }

    removeChild(child) {
      this.children = this.children.filter(item => item !== child);
      child.parentNode = null;
      if (child.id) elementsById.delete(child.id);
      return child;
    }

    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  }

  const body = new FakeElement('body');

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closeArgs = null;
      instances.push(this);
    }

    send(payload) {
      this.sent.push(JSON.parse(payload));
    }

    close(code, reason) {
      this.closeArgs = { code, reason };
      this.readyState = 3;
      if (typeof this.onclose === 'function') {
        this.onclose({ code, reason, wasClean: true });
      }
    }

    open() {
      this.readyState = 1;
      if (typeof this.onopen === 'function') {
        this.onopen({});
      }
    }

    receive(frame) {
      if (typeof this.onmessage === 'function') {
        this.onmessage({ data: JSON.stringify(frame) });
      }
    }
  }

  const OGZ = {
    state: { tier: 'ml' },
    register: jest.fn((name, module) => {
      registered[name] = module;
    })
  };

  const document = {
    querySelector: jest.fn((selector) => {
      if (selector === 'meta[name="ws-token"]') return { content: token };
      return null;
    }),
    getElementById: jest.fn((id) => {
      if (elementsById.has(id)) return elementsById.get(id);
      if (id === 'cp-assetSelector') return { value: cpAsset };
      if (id === 'cp-timeframeSelector') return { value: cpTimeframe };
      return null;
    }),
    createElement: jest.fn(tagName => new FakeElement(tagName)),
    body
  };

  let hashAssignmentThrows = hashSetThrows;
  let locationReplacementThrows = locationReplaceThrows;
  const location = { protocol, host, pathname: '/unified-dashboard-v2.html', search: '' };
  let hashValue = hash;
  Object.defineProperty(location, 'hash', {
    get: () => hashValue,
    set: (value) => {
      if (hashAssignmentThrows) throw new Error('hash assignment blocked');
      const next = String(value || '');
      hashValue = next && !next.startsWith('#') ? `#${next}` : next;
    }
  });
  location.replace = jest.fn((url) => {
    if (locationReplacementThrows) throw new Error('location replace blocked');
    const next = String(url || '');
    location.hash = next.includes('#') ? next.slice(next.indexOf('#')) : '';
  });
  location.__setHashSetThrows = (value) => {
    hashAssignmentThrows = Boolean(value);
  };
  location.__setLocationReplaceThrows = (value) => {
    locationReplacementThrows = Boolean(value);
  };

  const context = {
    window: {
      location,
      OGZ,
      OGZ_DASHBOARD_TOKEN: windowToken,
      history: {
        replaceState: jest.fn()
      },
      localStorage: {
        getItem: jest.fn(key => localStorageMap.get(key) || null),
        setItem: jest.fn((key, value) => {
          localStorageMap.set(key, String(value));
        }),
        removeItem: jest.fn((key) => {
          localStorageMap.delete(key);
        })
      },
    },
    document,
    WebSocket: FakeWebSocket,
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    fetch: jest.fn((url, options = {}) => {
      if (url === '/api/dashboard/session-ticket') {
        if (!sessionTicket) {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ ok: false }) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, ticket: sessionTicket })
        });
      }
      if (url === '/api/dashboard/session') {
        if (!enrollmentOk || !enrollmentTicket) {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ ok: false }) });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, ticket: enrollmentTicket })
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ ok: false }) });
    }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URLSearchParams,
    Date,
    JSON,
    Math
  };

  context.window.history.replaceState.mockImplementation((state, title, url) => {
    if (historyReplaceThrows) throw new Error('replaceState blocked');
    context.window.location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
  });

  vm.runInNewContext(source, context, { filename: 'public/js/websocket.js' });

  return {
    Socket: registered.Socket,
    instances,
    console: context.console,
    document,
    localStorageMap,
    localStorage: context.window.localStorage,
    history: context.window.history,
    location: context.window.location,
    fetch: context.fetch
  };
}

function openAndAuthenticate(harness) {
  harness.Socket.setAuthToken('placeholder-dashboard-token');
  jest.advanceTimersByTime(1000);
  const socket = harness.instances[harness.instances.length - 1];
  socket.open();
  socket.receive({ type: 'auth_success' });
  return socket;
}

async function flushSessionBootstrap() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe('frontend websocket lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('connects to /ws, waits for auth_success, and starts heartbeat pings', () => {
    const harness = createHarness();

    harness.Socket.setAuthToken('placeholder-dashboard-token');
    jest.advanceTimersByTime(1000);
    const socket = harness.instances[0];

    expect(socket.url).toBe('wss://dashboard.test/ws');
    socket.open();

    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-dashboard-token' });
    expect(harness.Socket.isConnected()).toBe(false);

    socket.receive({ type: 'auth_success' });

    expect(harness.Socket.isConnected()).toBe(true);
    expect(socket.sent.slice(1, 4).map(frame => frame.type)).toEqual([
      'identify',
      'asset_change',
      'request_historical'
    ]);
    expect(socket.sent[2]).toEqual({ type: 'asset_change', asset: 'BTC-USD' });
    expect(socket.sent[3]).toEqual({
      type: 'request_historical',
      timeframe: '1m',
      asset: 'BTC-USD',
      limit: 500
    });

    jest.advanceTimersByTime(15000);
    expect(socket.sent[socket.sent.length - 1].type).toBe('ping');
    socket.receive({ type: 'pong' });
  });

  test('does not send literal none as the startup asset after auth', () => {
    const harness = createHarness({ cpAsset: 'none', cpTimeframe: 'none' });

    const socket = openAndAuthenticate(harness);

    expect(socket.sent[2]).toEqual({ type: 'asset_change', asset: 'TSLA' });
    expect(socket.sent[3]).toEqual({
      type: 'request_historical',
      timeframe: '15m',
      asset: 'TSLA',
      limit: 500
    });
  });

  test('bot_state counts as dashboard data for the stale-data watchdog', () => {
    const harness = createHarness();
    const socket = openAndAuthenticate(harness);

    jest.advanceTimersByTime(15000);
    socket.receive({ type: 'pong' });
    jest.advanceTimersByTime(15000);
    socket.receive({ type: 'pong' });
    jest.advanceTimersByTime(15000);
    socket.receive({
      type: 'bot_state',
      mode: 'weekend_idle',
      reason: 'stocks_closed',
      next_active_at: '2026-06-29T13:30:00.000Z',
    });
    socket.receive({ type: 'pong' });
    jest.advanceTimersByTime(15000);
    socket.receive({ type: 'pong' });
    jest.advanceTimersByTime(15000);
    socket.receive({ type: 'pong' });
    jest.advanceTimersByTime(15000);
    socket.receive({ type: 'pong' });

    expect(socket.closeArgs).toBeNull();
    expect(harness.instances).toHaveLength(1);
  });

  test('uses in-memory operator token when public meta token is empty', () => {
    const harness = createHarness({ token: '' });

    harness.Socket.setAuthToken('placeholder-memory-token');
    jest.advanceTimersByTime(1000);
    const socket = harness.instances[0];
    socket.open();

    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-memory-token' });
    expect(harness.console.warn).not.toHaveBeenCalledWith(expect.stringContaining('Dashboard access session is not configured'));
  });

  test('treats whitespace meta token as missing and uses in-memory operator token', () => {
    const harness = createHarness({ token: '   ' });

    harness.Socket.setAuthToken('placeholder-memory-token');
    jest.advanceTimersByTime(1000);
    const socket = harness.instances[0];
    socket.open();

    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-memory-token' });
  });

  test('uses persisted operator token without requiring public HTML token injection', () => {
    const harness = createHarness({ token: '', legacyStoredToken: 'placeholder-persisted-token' });

    harness.Socket.connect();
    const socket = harness.instances[0];
    socket.open();

    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-persisted-token' });
    expect(harness.localStorage.removeItem).not.toHaveBeenCalledWith('ogz.dashboard.wsToken');
    expect(harness.document.getElementById('ogz-dashboard-token-gate')).toBeNull();
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).toBeNull();
  });

  test('closes without sending auth when no operator token is configured', async () => {
    const harness = createHarness({ token: '' });

    expect(harness.Socket.connect()).toBe(false);
    await flushSessionBootstrap();

    expect(harness.instances).toEqual([]);
    expect(harness.console.warn).toHaveBeenCalledWith(expect.stringContaining('Dashboard access session is not configured'));
    expect(harness.document.getElementById('ogz-dashboard-token-gate')).toBeNull();
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).not.toBeNull();
  });

  test('closes without sending auth when public meta token is only whitespace', async () => {
    const harness = createHarness({ token: '   ' });

    expect(harness.Socket.connect()).toBe(false);
    await flushSessionBootstrap();

    expect(harness.instances).toEqual([]);
    expect(harness.document.getElementById('ogz-dashboard-token-gate')).toBeNull();
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).not.toBeNull();
  });

  test('uses operator token in memory and reconnects without persisting the raw key', () => {
    const harness = createHarness({ token: '' });
    const firstSocket = openAndAuthenticate(harness);

    expect(harness.Socket.setAuthToken(' placeholder-operator-token ')).toBe(true);

    expect(harness.Socket.getAuthToken()).toBe('placeholder-operator-token');
    expect(harness.localStorage.setItem).not.toHaveBeenCalledWith('ogz.dashboard.wsToken', 'placeholder-operator-token');
    expect(firstSocket.closeArgs).toEqual({
      code: 4000,
      reason: 'dashboard token updated'
    });

    jest.advanceTimersByTime(1000);
    const secondSocket = harness.instances[1];
    secondSocket.open();

    expect(secondSocket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-operator-token' });
    secondSocket.receive({ type: 'auth_success' });
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).toBeNull();
  });

  test('missing operator token renders an operator prompt without opening a socket', async () => {
    const harness = createHarness({ token: '' });

    expect(harness.Socket.connect()).toBe(false);
    await flushSessionBootstrap();
    expect(harness.document.getElementById('ogz-dashboard-token-gate')).toBeNull();
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).not.toBeNull();
    expect(harness.document.getElementById('ogz-dashboard-token-form').style.cssText).toContain('grid-template-columns:1fr');
    expect(harness.document.getElementById('ogz-dashboard-token-submit').style.cssText).toContain('width:100%');
    expect(harness.instances).toEqual([]);
  });

  test('existing dashboard session cookie connects with a one-use ticket without storing a raw token', async () => {
    const harness = createHarness({ token: '', sessionTicket: 'placeholder-cookie-ticket' });

    expect(harness.Socket.connect()).toBe(false);
    await flushSessionBootstrap();

    expect(harness.localStorage.setItem).not.toHaveBeenCalled();
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).toBeNull();
    const socket = harness.instances[0];
    socket.open();
    expect(socket.sent[0].type).toBe('auth');
    expect(socket.sent[0].token).toBe('__OGZ_DASHBOARD_SESSION__');
    expect(socket.sent[0].ticket).toBe('placeholder-cookie-ticket');
  });

  test('operator prompt enrolls a dashboard session and connects with a ticket', async () => {
    const harness = createHarness({ token: '', enrollmentTicket: 'placeholder-session-ticket' });

    expect(harness.Socket.connect()).toBe(false);
    await flushSessionBootstrap();
    const input = harness.document.getElementById('ogz-dashboard-token-input');
    const form = harness.document.getElementById('ogz-dashboard-token-form');
    const preventDefault = jest.fn();
    input.value = ' placeholder-prompt-token ';
    await form.listeners.submit({ preventDefault });

    expect(preventDefault).toHaveBeenCalled();
    expect(harness.Socket.getAuthToken()).toBe('__OGZ_DASHBOARD_SESSION__');
    expect(harness.localStorage.setItem).not.toHaveBeenCalledWith('ogz.dashboard.wsToken', 'placeholder-prompt-token');
    expect(harness.localStorage.removeItem).toHaveBeenCalledWith('ogz.dashboard.wsToken');
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).toBeNull();

    const socket = harness.instances[0];
    socket.open();
    expect(socket.sent[0].type).toBe('auth');
    expect(socket.sent[0].token).toBe('__OGZ_DASHBOARD_SESSION__');
    expect(socket.sent[0].ticket).toBe('placeholder-session-ticket');
  });

  test('operator prompt session strips stale fragment before reconnecting', async () => {
    const harness = createHarness({ token: '', enrollmentTicket: 'placeholder-session-ticket' });

    expect(harness.Socket.connect()).toBe(false);
    await flushSessionBootstrap();
    harness.location.hash = '#dashboardToken=placeholder-stale-fragment-token';
    const input = harness.document.getElementById('ogz-dashboard-token-input');
    const form = harness.document.getElementById('ogz-dashboard-token-form');
    input.value = 'placeholder-fresh-prompt-token';
    await form.listeners.submit({ preventDefault: jest.fn() });

    expect(harness.Socket.getAuthToken()).toBe('__OGZ_DASHBOARD_SESSION__');
    expect(harness.localStorage.setItem).not.toHaveBeenCalledWith('ogz.dashboard.wsToken', 'placeholder-fresh-prompt-token');
    expect(harness.history.replaceState).toHaveBeenCalledWith(null, undefined, '/unified-dashboard-v2.html');

    const socket = harness.instances[0];
    socket.open();
    expect(socket.sent[0].type).toBe('auth');
    expect(socket.sent[0].token).toBe('__OGZ_DASHBOARD_SESSION__');
    expect(socket.sent[0].ticket).toBe('placeholder-session-ticket');
  });

  test('fragment dashboard token stores the key, strips it from the URL, and connects', () => {
    const harness = createHarness({ token: '', hash: '#dashboardToken=placeholder-fragment-token&view=live' });

    harness.Socket.connect();

    expect(harness.Socket.getAuthToken()).toBe('placeholder-fragment-token');
    expect(harness.localStorage.setItem).not.toHaveBeenCalledWith('ogz.dashboard.wsToken', 'placeholder-fragment-token');
    expect(harness.history.replaceState).toHaveBeenCalledWith(null, undefined, '/unified-dashboard-v2.html#view=live');
    expect(harness.document.getElementById('ogz-dashboard-token-gate')).toBeNull();
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).toBeNull();

    const socket = harness.instances[0];
    socket.open();
    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-fragment-token' });
  });

  test('fragment stripping falls back to location hash when history replace is blocked', () => {
    const harness = createHarness({
      token: '',
      hash: '#dashboardToken=placeholder-fragment-token',
      historyReplaceThrows: true,
    });

    harness.Socket.connect();

    expect(harness.Socket.getAuthToken()).toBe('placeholder-fragment-token');
    expect(harness.history.replaceState).toHaveBeenCalled();
    expect(harness.location.hash).toBe('');
    const socket = harness.instances[0];
    socket.open();
    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-fragment-token' });
  });

  test('fragment token is refused when the URL cannot be scrubbed', async () => {
    const harness = createHarness({
      token: '',
      hash: '#dashboardToken=placeholder-fragment-token',
      historyReplaceThrows: true,
      hashSetThrows: true,
      locationReplaceThrows: true,
    });

    expect(harness.Socket.connect()).toBe(false);
    await flushSessionBootstrap();

    expect(harness.Socket.getAuthToken()).toBe('');
    expect(harness.localStorage.removeItem).toHaveBeenCalledWith('ogz.dashboard.wsToken');
    expect(harness.instances).toEqual([]);
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).not.toBeNull();
    expect(harness.console.warn).toHaveBeenCalledWith(expect.stringContaining('fragment could not be stripped'));
  });

  test('fragment dashboard token overrides existing stored token and is still stripped', () => {
    const harness = createHarness({
      token: '',
      legacyStoredToken: 'placeholder-old-token',
      hash: '#dashboardToken=placeholder-new-token'
    });

    harness.Socket.connect();

    expect(harness.Socket.getAuthToken()).toBe('placeholder-new-token');
    expect(harness.localStorage.setItem).not.toHaveBeenCalledWith('ogz.dashboard.wsToken', 'placeholder-new-token');
    expect(harness.history.replaceState).toHaveBeenCalledWith(null, undefined, '/unified-dashboard-v2.html');
    const socket = harness.instances[0];
    socket.open();
    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-new-token' });
  });

  test('clearAuthToken strips dashboard token fragment before any connection uses it', () => {
    const harness = createHarness({
      token: '',
      hash: '#dashboardToken=placeholder-fragment-token'
    });

    expect(harness.Socket.clearAuthToken()).toBe(true);

    expect(harness.Socket.getAuthToken()).toBe('');
    expect(harness.localStorage.removeItem).toHaveBeenCalledWith('ogz.dashboard.wsToken');
    expect(harness.history.replaceState).toHaveBeenCalledWith(null, undefined, '/unified-dashboard-v2.html');
    jest.advanceTimersByTime(1000);
    expect(harness.instances).toEqual([]);
  });

  test('rejected auth clears stored token without blocking the dashboard shell', () => {
    const harness = createHarness({ token: '' });

    harness.Socket.setAuthToken('placeholder-bad-token');
    jest.advanceTimersByTime(1000);
    const socket = harness.instances[0];
    socket.open();
    socket.receive({ type: 'auth_failure' });

    expect(harness.Socket.getAuthToken()).toBe('');
    expect(harness.localStorage.removeItem).toHaveBeenCalledWith('ogz.dashboard.wsToken');
    expect(harness.document.getElementById('ogz-dashboard-token-gate')).toBeNull();
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).not.toBeNull();
  });

  test('rejected fragment token is stripped and does not reconnect with the same value', () => {
    const harness = createHarness({ token: '', hash: '#dashboardToken=placeholder-bad-fragment-token' });

    harness.Socket.connect();
    const socket = harness.instances[0];
    socket.open();
    socket.receive({ type: 'auth_failure' });

    expect(harness.Socket.getAuthToken()).toBe('');
    expect(harness.localStorage.removeItem).toHaveBeenCalledWith('ogz.dashboard.wsToken');
    expect(harness.history.replaceState).toHaveBeenCalledWith(null, undefined, '/unified-dashboard-v2.html');
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).not.toBeNull();

    jest.advanceTimersByTime(1000);
    expect(harness.instances).toHaveLength(1);
  });

  test('rejected token does not reconnect even when fragment cleanup fails', () => {
    const harness = createHarness({ token: '', legacyStoredToken: 'placeholder-bad-token' });

    harness.Socket.connect();
    const socket = harness.instances[0];
    socket.open();
    harness.location.hash = '#dashboardToken=placeholder-bad-token';
    harness.history.replaceState.mockImplementation(() => {
      throw new Error('replaceState blocked');
    });
    harness.location.__setHashSetThrows(true);
    harness.location.__setLocationReplaceThrows(true);
    socket.receive({ type: 'auth_failure' });

    expect(harness.Socket.getAuthToken()).toBe('');
    expect(harness.document.getElementById('ogz-dashboard-token-prompt')).not.toBeNull();
    expect(harness.console.warn).toHaveBeenCalledWith(expect.stringContaining('could not be stripped during token clear'));

    jest.advanceTimersByTime(1000);
    expect(harness.instances).toHaveLength(1);
  });

  test('reconnects when pong heartbeat stops', () => {
    const harness = createHarness();
    const socket = openAndAuthenticate(harness);

    jest.advanceTimersByTime(45000);

    expect(socket.closeArgs).toEqual({
      code: 4000,
      reason: 'heartbeat timeout'
    });
    expect(harness.Socket.isConnected()).toBe(false);

    jest.advanceTimersByTime(1000);

    expect(harness.instances).toHaveLength(2);
    expect(harness.instances[1].url).toBe('wss://dashboard.test/ws');
  });

  test('reconnects when only heartbeat or status frames arrive and dashboard data goes stale', () => {
    const harness = createHarness();
    const socket = openAndAuthenticate(harness);

    for (let i = 0; i < 6; i++) {
      jest.advanceTimersByTime(15000);
      if (socket.readyState === 1) {
        socket.receive({ type: 'pong' });
        socket.receive({ type: 'status', ok: true });
        socket.receive({ type: 'feed_status', ok: true });
        socket.receive({ type: 'broker_status', ok: true });
      }
    }

    expect(socket.closeArgs).toEqual({
      code: 4000,
      reason: 'data watchdog stale'
    });
    expect(harness.Socket.isConnected()).toBe(false);

    jest.advanceTimersByTime(1000);

    expect(harness.instances).toHaveLength(2);
    expect(harness.instances[1].url).toBe('wss://dashboard.test/ws');
  });

  test('keeps a socket alive when depth_update dashboard data is flowing', () => {
    const harness = createHarness();
    const socket = openAndAuthenticate(harness);

    for (let i = 0; i < 6; i++) {
      jest.advanceTimersByTime(15000);
      if (socket.readyState === 1) {
        socket.receive({ type: 'pong' });
        socket.receive({ type: 'depth_update', symbol: 'BTC-USD', bids: [], asks: [] });
      }
    }

    expect(socket.closeArgs).toBeNull();
    expect(harness.Socket.isConnected()).toBe(true);
    expect(harness.instances).toHaveLength(1);
  });

  test('keeps handlers bound to the current socket and ignores stale socket messages', () => {
    const harness = createHarness();
    const onPrice = jest.fn();
    harness.Socket.registerHandler('price', onPrice);

    const firstSocket = openAndAuthenticate(harness);
    firstSocket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71000 } });
    expect(onPrice).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(45000);
    jest.advanceTimersByTime(1000);

    const secondSocket = harness.instances[1];
    firstSocket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 1 } });
    expect(onPrice).toHaveBeenCalledTimes(1);

    secondSocket.open();
    secondSocket.receive({ type: 'auth_success' });
    secondSocket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71001 } });

    expect(onPrice).toHaveBeenCalledTimes(2);
  });

  test('dedupes handler registration and unregisters by callback', () => {
    const harness = createHarness();
    const onPrice = jest.fn();
    const onTrade = jest.fn();
    const socket = openAndAuthenticate(harness);

    expect(harness.Socket.registerHandler('price', onPrice)).toBe(true);
    expect(harness.Socket.registerHandler('price', onPrice)).toBe(true);
    expect(harness.Socket.registerHandler('price', onTrade)).toBe(true);

    socket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71000 } });
    expect(onPrice).toHaveBeenCalledTimes(1);
    expect(onTrade).toHaveBeenCalledTimes(1);

    expect(harness.Socket.unregisterHandler('price', onPrice)).toBe(true);
    socket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71001 } });
    expect(onPrice).toHaveBeenCalledTimes(1);
    expect(onTrade).toHaveBeenCalledTimes(2);
    expect(harness.Socket.unregisterHandler('price', onPrice)).toBe(false);
  });

  test('does not duplicate a re-registered handler after reconnect', () => {
    const harness = createHarness();
    const onPrice = jest.fn();
    harness.Socket.registerHandler('price', onPrice);

    const firstSocket = openAndAuthenticate(harness);
    firstSocket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71000 } });

    jest.advanceTimersByTime(45000);
    jest.advanceTimersByTime(1000);

    harness.Socket.registerHandler('price', onPrice);

    const secondSocket = harness.instances[1];
    secondSocket.open();
    secondSocket.receive({ type: 'auth_success' });
    secondSocket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71001 } });

    expect(onPrice).toHaveBeenCalledTimes(2);
  });

  test('dispatches over a handler snapshot when callbacks unregister during a frame', () => {
    const harness = createHarness();
    const socket = openAndAuthenticate(harness);
    const second = jest.fn();
    const first = jest.fn(() => {
      harness.Socket.unregisterHandler('price', first);
    });

    harness.Socket.registerHandler('price', first);
    harness.Socket.registerHandler('price', second);

    socket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71000 } });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    socket.receive({ type: 'price', data: { symbol: 'BTC-USD', price: 71001 } });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
