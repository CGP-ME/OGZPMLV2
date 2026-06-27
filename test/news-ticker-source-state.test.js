'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeElement(tagName) {
  const element = {
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    className: '',
    id: '',
    parentNode: null,
    offsetWidth: 800,
    scrollWidth: 0,
    _textContent: '',
    _innerHTML: '',
    _listeners: {},
    appendChild(child) {
      child.parentNode = element;
      element.children.push(child);
      return child;
    },
    remove() {
      if (!element.parentNode) return;
      element.parentNode.children = element.parentNode.children.filter(child => child !== element);
      element.parentNode = null;
    },
    addEventListener(type, handler) {
      element._listeners[type] = handler;
    },
    removeEventListener(type) {
      delete element._listeners[type];
    },
    querySelector(selector) {
      if (selector.startsWith('.')) {
        const className = selector.slice(1);
        return findChild(element, child => String(child.className || '').split(/\s+/).includes(className));
      }
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return findChild(element, child => child.id === id);
      }
      return null;
    },
  };

  Object.defineProperty(element, 'textContent', {
    get() {
      return element._textContent + element.children.map(child => child.textContent || '').join('');
    },
    set(value) {
      element._textContent = String(value);
      element.children = [];
    },
  });

  Object.defineProperty(element, 'innerHTML', {
    get() {
      return element._innerHTML;
    },
    set(value) {
      element._innerHTML = String(value);
      element._textContent = '';
      element.children = [];
    },
  });

  return element;
}

function findChild(root, predicate) {
  for (const child of root.children || []) {
    if (predicate(child)) return child;
    const found = findChild(child, predicate);
    if (found) return found;
  }
  return null;
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

function loadNewsTicker(fetchImpl, selectedSymbol = 'TSLA') {
  const root = makeElement('div');
  root.id = 'newsTicker';
  const selector = { value: selectedSymbol };
  const head = makeElement('head');
  let registered = null;

  const document = {
    head,
    getElementById: jest.fn((id) => {
      if (id === 'newsTicker') return root;
      if (id === 'cp-assetSelector') return selector;
      return null;
    }),
    querySelector: jest.fn(() => null),
    createElement: jest.fn((tag) => makeElement(tag)),
    addEventListener: jest.fn(),
  };

  const context = {
    console,
    fetch: fetchImpl,
    setInterval: jest.fn(() => 1),
    clearInterval: jest.fn(),
    setTimeout: jest.fn(),
    clearTimeout: jest.fn(),
    requestAnimationFrame: jest.fn(() => 1),
    cancelAnimationFrame: jest.fn(),
    window: {
      OGZ: {
        register: jest.fn((name, module) => {
          if (name === 'NewsTicker') registered = module;
        }),
        get: jest.fn(() => null),
        bus: { on: jest.fn() },
      },
    },
    document,
  };
  context.window.window = context.window;
  context.window.document = document;
  context.window.fetch = fetchImpl;
  context.window.setInterval = context.setInterval;
  context.window.clearInterval = context.clearInterval;
  context.window.requestAnimationFrame = context.requestAnimationFrame;
  context.window.cancelAnimationFrame = context.cancelAnimationFrame;

  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../public/js/panels/news-ticker.js'), 'utf8');
  vm.runInContext(source, context);

  return { ticker: registered, root, selector, context };
}

describe('news ticker source state', () => {
  test('renders unconfigured TRAI news state instead of waiting forever', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        events: [],
        source: 'tavily',
        symbol: 'TSLA',
        configured: false,
        status: 'unconfigured',
        message: 'News search is not configured for this deployment.',
      }),
    }));
    const { ticker, root } = loadNewsTicker(fetchImpl);

    ticker.init();
    await flushPromises();

    expect(fetchImpl).toHaveBeenCalledWith('/api/trai/events?symbol=TSLA');
    expect(ticker._compute()).toMatchObject({
      realEventsCount: 0,
      feedStatus: 'unconfigured',
      feedSymbol: 'TSLA',
    });
    expect(root.textContent).toContain('News search is not configured for this deployment.');
  });

  test('renders unavailable TRAI news state from real source outage', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({
        events: [],
        source: 'tavily+trai',
        symbol: 'TSLA',
        configured: true,
        status: 'unavailable',
        message: 'News event source is temporarily unavailable.',
      }),
    }));
    const { ticker, root } = loadNewsTicker(fetchImpl);

    ticker.init();
    await flushPromises();

    expect(fetchImpl).toHaveBeenCalledWith('/api/trai/events?symbol=TSLA');
    expect(ticker._compute()).toMatchObject({
      realEventsCount: 0,
      feedStatus: 'unavailable',
      feedSymbol: 'TSLA',
    });
    expect(root.textContent).toContain('News event source is temporarily unavailable.');
  });

  test('renders empty TRAI news state as a sourced result', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        events: [],
        source: 'tavily',
        symbol: 'BTC-USD',
        configured: true,
        status: 'empty',
        message: 'No upcoming market events found for BTC-USD.',
      }),
    }));
    const { ticker, root } = loadNewsTicker(fetchImpl, 'BTC-USD');

    ticker.init();
    await flushPromises();

    expect(fetchImpl).toHaveBeenCalledWith('/api/trai/events?symbol=BTC-USD');
    expect(ticker._compute()).toMatchObject({
      realEventsCount: 0,
      feedStatus: 'empty',
      feedSymbol: 'BTC-USD',
    });
    expect(root.textContent).toContain('No upcoming market events found for BTC-USD.');
  });

  test('ignores a poll response after the selected asset changes', async () => {
    let resolveResponse;
    const responsePromise = new Promise(resolve => {
      resolveResponse = resolve;
    });
    const fetchImpl = jest.fn(() => responsePromise);
    const { ticker, selector } = loadNewsTicker(fetchImpl, 'TSLA');

    ticker.init();
    expect(fetchImpl).toHaveBeenCalledWith('/api/trai/events?symbol=TSLA');

    selector.value = 'BTC-USD';
    resolveResponse({
      ok: true,
      json: async () => ({
        events: [{ type: 'catalyst', title: 'TSLA event', summary: 'Old symbol event', source: 'test' }],
        source: 'tavily+trai',
        symbol: 'TSLA',
        configured: true,
        status: 'ready',
        fetchedAt: '2026-05-29T00:00:00.000Z',
      }),
    });
    await flushPromises();

    expect(ticker._compute()).toMatchObject({
      realEventsCount: 0,
      feedStatus: 'loading',
      feedSymbol: 'TSLA',
    });
  });

  test('labels cached event payloads instead of implying a fresh live source', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        events: [{ type: 'catalyst', title: 'BTC catalyst', summary: 'Cached event', source: 'test' }],
        source: 'tavily+trai',
        symbol: 'BTC-USD',
        configured: true,
        status: 'ready',
        fetchedAt: '2026-05-29T00:00:00.000Z',
        cached: true,
        cacheAgeMs: 60000,
      }),
    }));
    const { ticker, root } = loadNewsTicker(fetchImpl, 'BTC-USD');

    ticker.init();
    await flushPromises();

    expect(ticker._compute()).toMatchObject({
      realEventsCount: 1,
      feedStatus: 'ready',
      feedCached: true,
      feedSymbol: 'BTC-USD',
    });
    expect(root.textContent).toContain('News BTC-USD - cached');
    expect(root.textContent).toContain('BTC catalyst');
  });
});
