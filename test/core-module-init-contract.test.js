const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCoreContext() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/core.js'), 'utf8');
  const context = {
    window: {},
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    document: { getElementById: jest.fn(() => null), body: { classList: { add: jest.fn(), remove: jest.fn() } } },
    fetch: jest.fn(() => Promise.resolve({ ok: false })),
    setInterval: jest.fn(() => 1),
    Date,
    Promise,
    Set,
    Map,
    Object,
    Array,
    String,
    Number,
    parseFloat,
    isFinite,
  };
  vm.createContext(context);
  return { context, source };
}

function loadCore() {
  const { context, source } = makeCoreContext();
  vm.runInContext(source, context);
  return context.window.OGZ;
}

describe('OGZ core module init contract', () => {
  test('init is idempotent for modules registered before boot', async () => {
    const ogz = loadCore();
    const panel = { init: jest.fn() };

    ogz.register('Panel', panel);
    await ogz.init();
    await ogz.init();

    expect(panel.init).toHaveBeenCalledTimes(1);
  });

  test('late-registered panel modules initialize after the shell has booted', async () => {
    const ogz = loadCore();
    const panel = { init: jest.fn() };

    await ogz.init();
    ogz.register('LatePanel', panel);

    expect(panel.init).toHaveBeenCalledTimes(1);
  });

  test('late-registered special modules do not bypass their explicit boot paths', async () => {
    const ogz = loadCore();
    const chart = { init: jest.fn() };

    await ogz.init();
    ogz.register('Chart', chart);

    expect(chart.init).not.toHaveBeenCalled();
  });

  test('duplicate core script evaluation preserves the existing booted registry', async () => {
    const { context, source } = makeCoreContext();
    vm.runInContext(source, context);
    const first = context.window.OGZ;
    const panel = { init: jest.fn() };

    first.register('Panel', panel);
    await first.init();
    vm.runInContext(source, context);

    expect(context.window.OGZ).toBe(first);
    expect(context.window.OGZ.state.initialized).toBe(true);
    expect(context.window.OGZ.get('Panel')).toBe(panel);
    expect(panel.init).toHaveBeenCalledTimes(1);
  });

  test('duplicate registration before boot cannot replace a module', async () => {
    const ogz = loadCore();
    const firstPanel = { init: jest.fn() };
    const duplicatePanel = { init: jest.fn() };

    ogz.register('Panel', firstPanel);
    ogz.register('Panel', duplicatePanel);
    await ogz.init();

    expect(ogz.get('Panel')).toBe(firstPanel);
    expect(firstPanel.init).toHaveBeenCalledTimes(1);
    expect(duplicatePanel.init).not.toHaveBeenCalled();
  });

  test('duplicate late registration after boot cannot replace an initialized module', async () => {
    const ogz = loadCore();
    const firstPanel = { init: jest.fn() };
    const duplicatePanel = { init: jest.fn() };

    ogz.register('Panel', firstPanel);
    await ogz.init();
    ogz.register('Panel', duplicatePanel);

    expect(ogz.get('Panel')).toBe(firstPanel);
    expect(firstPanel.init).toHaveBeenCalledTimes(1);
    expect(duplicatePanel.init).not.toHaveBeenCalled();
  });
});
