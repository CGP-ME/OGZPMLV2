'use strict';

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function loadFreshFeatureFlagManager() {
  jest.resetModules();
  return require('../core/FeatureFlagManager');
}

describe('FeatureFlagManager logging', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('constructor and reload logs stay emoji-free', () => {
    const FeatureFlagManager = loadFreshFeatureFlagManager();
    const flags = FeatureFlagManager.getInstance();

    flags.reload();

    const output = logSpy.mock.calls.flat().map(value => String(value)).join('\n');
    expect(output).not.toMatch(EMOJI_PATTERN);
    expect(output).toContain('[FeatureFlagManager] Initialized:');
    expect(output).toContain('[FeatureFlagManager] Enabled features:');
    expect(output).toContain('[FeatureFlagManager] Reloaded features');
  });

  test('load failure log stays emoji-free', () => {
    jest.resetModules();
    const fs = require('fs');
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('missing features fixture');
    });
    const FeatureFlagManager = require('../core/FeatureFlagManager');

    FeatureFlagManager.getInstance();

    const output = errorSpy.mock.calls.flat().map(value => String(value)).join('\n');
    expect(output).not.toMatch(EMOJI_PATTERN);
    expect(output).toContain('[FeatureFlagManager] Failed to load features.json:');
  });
});
