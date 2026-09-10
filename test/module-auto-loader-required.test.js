'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { ModuleAutoLoader } = require('../core/ModuleAutoLoader');

describe('ModuleAutoLoader required modules', () => {
  let loader;
  let tempRoot;
  let logSpy;
  let errorSpy;
  let warnSpy;

  const writeModule = (directory, name, source = 'module.exports = { loaded: true };\n') => {
    fs.writeFileSync(path.join(directory, `${name}.js`), source);
  };

  const writeRequiredFixtures = () => {
    writeModule(loader.paths.utils, 'discordNotifier');
    writeModule(loader.paths.utils, 'tradeLogger');
    writeModule(loader.paths.core, 'RiskManager');
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'module-auto-loader-'));
    fs.mkdirSync(path.join(tempRoot, 'core'));
    fs.mkdirSync(path.join(tempRoot, 'utils'));

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    loader = new ModuleAutoLoader();
    loader.basePath = tempRoot;
    loader.paths = {
      ...loader.paths,
      core: path.join(tempRoot, 'core'),
      utils: path.join(tempRoot, 'utils'),
    };
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('prints the enumerated validated required-module list', () => {
    writeRequiredFixtures();

    loader.loadAll();

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).toContain('ALL REQUIRED MODULES VALIDATED:');
    expect(output).toContain('utils/discordNotifier');
    expect(output).toContain('utils/tradeLogger');
    expect(output).toContain('core/RiskManager');
    expect(output).not.toContain('OptimizedTradingBrain');
    expect(output).not.toContain('ALL MODULES LOADED');
  });

  test('refuses startup and names a required module removed from disk', () => {
    writeRequiredFixtures();
    fs.rmSync(path.join(loader.paths.core, 'RiskManager.js'));

    expect(() => loader.loadAll()).toThrow('Missing required modules: core/RiskManager');
  });

  test('propagates a required module evaluation failure', () => {
    writeRequiredFixtures();
    writeModule(loader.paths.core, 'RiskManager', "throw new Error('fixture load failure');\n");

    expect(() => loader.loadAll()).toThrow('Required module failed to load: RiskManager');
  });
});
