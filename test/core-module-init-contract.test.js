const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadCore() {
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
});
