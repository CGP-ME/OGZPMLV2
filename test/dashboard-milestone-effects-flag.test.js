const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'panels', 'milestone-effects.js'),
  'utf8'
);

function createHarness(entries = {}, flags = {}) {
  const localStorageMap = new Map(Object.entries(entries));
  const busHandlers = {};

  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.className = '';
      this.id = '';
      this.textContent = '';
      this.innerHTML = '';
      this.style = {};
      this.listeners = {};
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }

    addEventListener(event, handler) {
      this.listeners[event] = handler;
    }
  }

  const head = new FakeElement('head');
  const body = new FakeElement('body');
  const elementsById = new Map();

  const document = {
    head,
    body,
    createElement: jest.fn(tagName => new FakeElement(tagName)),
    getElementById: jest.fn(id => elementsById.get(id) || null),
    addEventListener: jest.fn()
  };

  const localStorage = {
    getItem: jest.fn(key => localStorageMap.get(key) || null),
    setItem: jest.fn((key, value) => {
      localStorageMap.set(key, String(value));
    }),
    removeItem: jest.fn(key => {
      localStorageMap.delete(key);
    })
  };

  const registered = {};
  const OGZ = {
    bus: {
      on: jest.fn((event, handler) => {
        busHandlers[event] = handler;
      }),
      emit: jest.fn()
    },
    register: jest.fn((name, api) => {
      registered[name] = api;
    })
  };

  const context = {
    window: { OGZ, OGZ_DASHBOARD_FLAGS: flags },
    OGZ,
    document,
    localStorage,
    setTimeout: jest.fn(),
    requestAnimationFrame: cb => cb(),
    console
  };

  context.window.document = document;
  context.window.localStorage = localStorage;
  context.window.setTimeout = context.setTimeout;
  context.window.requestAnimationFrame = context.requestAnimationFrame;

  vm.runInNewContext(source, context, { filename: 'public/js/panels/milestone-effects.js' });

  return {
    body,
    head,
    localStorage,
    registered,
    busHandlers
  };
}

describe('dashboard milestone effects feature gate', () => {
  test('stale localStorage flags cannot fire Houston milestone overlays', () => {
    const harness = createHarness({
      'ogz.profile': 'operator',
      'ogz.features.milestoneEffects': 'enabled'
    });
    const api = harness.registered.MilestoneEffects;

    api.init();
    api.check(10000);

    expect(api.isEnabled()).toBe(false);
    expect(harness.head.children).toHaveLength(0);
    expect(harness.body.children).toHaveLength(0);
    expect(harness.busHandlers['celebration:milestone']).toBeUndefined();
  });

  test('explicit operator feature flag still refuses seed-equity milestone fire', () => {
    const harness = createHarness({
      'ogz.profile': 'operator',
      'ogz.features.milestoneEffects': 'enabled'
    }, { personalMilestones: true });
    const api = harness.registered.MilestoneEffects;

    api.init();
    api.check(10000);

    expect(api.isEnabled()).toBe(true);
    expect(harness.head.children).toHaveLength(1);
    expect(harness.body.children.some(child => child.className === 'ogz-houston-ready-overlay')).toBe(false);
    expect(api._compute()).toEqual(expect.objectContaining({
      sessionOpenEquity: 10000,
      peakEquity: null,
      tradeCount: 0
    }));
    expect(harness.busHandlers['celebration:milestone']).toEqual(expect.any(Function));
  });

  test('stale persisted session equity cannot fire a new-session overlay', () => {
    const harness = createHarness({
      'ogz.profile': 'operator',
      'ogz.features.milestoneEffects': 'enabled',
      'ogz.milestones.fired': JSON.stringify({
        fired: {},
        firedWinEvents: {},
        sessionOpenEquity: 100,
        peakEquity: 15000,
        tradeCount: 8
      })
    }, { personalMilestones: true });
    const api = harness.registered.MilestoneEffects;

    api.init();
    api.check(10000);

    expect(harness.body.children.some(child => child.className === 'ogz-houston-ready-overlay')).toBe(false);
    expect(api._compute()).toEqual(expect.objectContaining({
      sessionOpenEquity: 10000,
      peakEquity: null,
      tradeCount: 0
    }));
  });

  test('explicit operator feature flag can fire after trade event and earned profit', () => {
    const harness = createHarness({
      'ogz.profile': 'operator',
      'ogz.features.milestoneEffects': 'enabled'
    }, { personalMilestones: true });
    const api = harness.registered.MilestoneEffects;

    api.init();
    api.check(10000);
    harness.busHandlers['celebration:win']({ pnl: 50 });
    api.check(20100);

    expect(harness.body.children.some(child => child.className === 'ogz-houston-ready-overlay')).toBe(true);
    expect(harness.busHandlers['celebration:milestone']).toEqual(expect.any(Function));
  });
});
