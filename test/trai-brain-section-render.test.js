'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createElementStub(tagName = 'div') {
  const el = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    parentNode: null,
    className: '',
    dataset: {},
    style: {},
    value: '',
    _textContent: '',
    _innerHTML: '',
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    remove() {
      if (!el.parentNode) return;
      el.parentNode.children = el.parentNode.children.filter(child => child !== el);
      el.parentNode = null;
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    classList: { add: jest.fn(), remove: jest.fn(), toggle: jest.fn() },
    querySelector(selector) {
      return el.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const out = [];
      const wantedClass = selector.startsWith('.') ? selector.slice(1) : null;
      const visit = (node) => {
        if (wantedClass && String(node.className || '').split(/\s+/).includes(wantedClass)) {
          out.push(node);
        }
        for (const child of node.children || []) visit(child);
      };
      visit(el);
      return out;
    },
  };

  Object.defineProperty(el, 'textContent', {
    get() {
      return el._textContent;
    },
    set(value) {
      el._textContent = String(value == null ? '' : value);
      el.children = [];
    },
  });

  Object.defineProperty(el, 'innerHTML', {
    get() {
      return el._innerHTML;
    },
    set(value) {
      el._innerHTML = String(value == null ? '' : value);
      el._textContent = '';
      el.children = [];
      const classRe = /class="([^"]+)"/g;
      let match;
      while ((match = classRe.exec(el._innerHTML))) {
        const child = createElementStub('div');
        child.className = match[1];
        el.appendChild(child);
      }
    },
  });

  return el;
}

function collectText(node) {
  const own = node._textContent || '';
  return [own, ...(node.children || []).map(collectText)].join(' ');
}

function countText(node, needle) {
  return (collectText(node).match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
}

function loadTraiBrain() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'panels', 'trai-brain.js'),
    'utf8'
  );
  const root = createElementStub('div');
  const handlers = {};
  const socket = {
    registerHandler: jest.fn((type, cb) => {
      handlers[type] = cb;
    }),
  };
  let registered = null;
  const context = {
    console,
    fetch: jest.fn(() => Promise.reject(new Error('offline'))),
    setInterval: jest.fn(() => 19),
    clearInterval: jest.fn(),
    setTimeout: jest.fn(),
    document: {
      getElementById: jest.fn(id => (id === 'traiBrain' ? root : null)),
      createElement: jest.fn(tagName => createElementStub(tagName)),
      addEventListener: jest.fn(),
      querySelector: jest.fn(() => null),
      head: { appendChild: jest.fn() },
    },
    window: {
      OGZ: {
        bus: { on: jest.fn() },
        get: jest.fn(name => (name === 'Socket' ? socket : null)),
        register: jest.fn((name, module) => {
          if (name === 'TRAIBrain') registered = module;
        }),
      },
    },
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { traiBrain: registered, root, handlers };
}

describe('TRAIBrain section rendering', () => {
  test('replaces empty-state placeholders instead of appending duplicates', () => {
    const { traiBrain, root } = loadTraiBrain();

    traiBrain.init();
    traiBrain.clearAll();
    traiBrain.clearAll();

    expect(countText(root, 'Awaiting market events...')).toBe(1);
    expect(countText(root, 'Watching for whales...')).toBe(1);
    expect(countText(root, 'Awaiting narrator updates...')).toBe(1);
    expect(countText(root, '0 items requiring operator attention')).toBe(1);
  });

  test('replaces narrator placeholder when real narrator text arrives', () => {
    const { traiBrain, root } = loadTraiBrain();

    traiBrain.init();
    traiBrain.addNarratorLine('BTC momentum read accepted');

    expect(countText(root, 'Awaiting narrator updates...')).toBe(0);
    expect(countText(root, 'BTC momentum read accepted')).toBe(1);
  });
});
