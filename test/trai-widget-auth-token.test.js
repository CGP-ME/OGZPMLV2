'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'trai-widget.js'),
  'utf8'
);

function createHarness({ token = '', storedToken = '', windowToken = '' } = {}) {
  const instances = [];
  const storage = new Map();
  if (storedToken) storage.set('ogz.dashboard.wsToken', storedToken);

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.closeArgs = null;
      instances.push(this);
    }

    send(payload) {
      this.sent.push(JSON.parse(payload));
    }

    close(code, reason) {
      this.closeArgs = { code, reason };
    }

    open() {
      this.onopen();
    }
  }

  const document = {
    readyState: 'loading',
    addEventListener: jest.fn(),
    querySelector: jest.fn((selector) => {
      if (selector === 'meta[name="ws-token"]') return { content: token };
      return null;
    }),
    getElementById: jest.fn(() => ({
      classList: { toggle: jest.fn(), remove: jest.fn(), add: jest.fn() },
      value: '',
      disabled: false,
      focus: jest.fn(),
      addEventListener: jest.fn()
    })),
    createElement: jest.fn(() => ({ innerHTML: '', id: '' })),
    body: { appendChild: jest.fn() }
  };

  const context = {
    window: {
      location: { protocol: 'https:', host: 'dashboard.test', hostname: 'dashboard.test' },
      OGZ_DASHBOARD_TOKEN: windowToken,
      localStorage: {
        getItem: jest.fn(key => storage.get(key) || null),
        setItem: jest.fn((key, value) => storage.set(key, String(value))),
        removeItem: jest.fn(key => storage.delete(key))
      }
    },
    document,
    WebSocket: FakeWebSocket,
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    fetch: jest.fn(),
    setTimeout: jest.fn()
  };
  context.global = context;

  const testSource = source.replace(
    /\}\)\(\);\s*$/,
    'window.__traiWidgetTest = { dashboardAuthToken, connectWebSocket };\n})();'
  );

  vm.runInNewContext(testSource, context);

  return {
    api: context.window.__traiWidgetTest,
    instances,
    console: context.console
  };
}

describe('TRAI widget dashboard auth token', () => {
  test('uses stored operator token when public meta token is empty', () => {
    const harness = createHarness({ token: '', storedToken: 'placeholder-stored-token' });

    harness.api.connectWebSocket();
    const socket = harness.instances[0];
    socket.open();

    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-stored-token' });
  });

  test('treats whitespace meta token as missing and uses stored operator token', () => {
    const harness = createHarness({ token: '   ', storedToken: 'placeholder-stored-token' });

    harness.api.connectWebSocket();
    const socket = harness.instances[0];
    socket.open();

    expect(socket.sent[0]).toEqual({ type: 'auth', token: 'placeholder-stored-token' });
  });

  test('closes without sending auth when no operator token is configured', () => {
    const harness = createHarness({ token: '' });

    harness.api.connectWebSocket();

    expect(harness.instances).toEqual([]);
    expect(harness.console.warn).toHaveBeenCalledWith(expect.stringContaining('No dashboard token configured'));
  });
});
