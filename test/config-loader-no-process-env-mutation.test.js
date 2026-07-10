'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('ConfigLoader process.env immutability', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  test('resolves config-owned paper launch profile when PROFILE is absent', () => {
    process.env = {
      ...originalEnv,
      DOTENV_CONFIG_PATH: path.join(os.tmpdir(), 'missing-ogz-profile.env'),
      EXECUTION_MODE: 'live',
      LIVE_TRADING: 'true',
      CONFIRM_LIVE_TRADING: 'true',
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      ALPACA_MODE: 'paper',
      ALPACA_SYMBOLS: 'TSLA',
      RISK_MANAGER_BYPASS: 'true',
      ACCOUNT_DRAWDOWN_BYPASS: 'true',
      MAX_DRAWDOWN: '5',
      MAX_DAILY_LOSS: '1',
      MAX_WEEKLY_LOSS: '5',
      MAX_MONTHLY_LOSS: '5',
    };
    delete process.env.PROFILE;

    const ConfigLoader = require('../foundation/ConfigLoader');
    const result = ConfigLoader.load({ force: true, silent: true });

    expect(result.config.mode.launchProfile).toBe('paper');
    expect(result.config.mode.execution).toBe('paper');
    expect(result.config.mode.paperTrading).toBe(true);
    expect(result.config.mode.liveTrading).toBe(false);
    expect(result.config.mode.backtest).toBe(false);
    expect(result.sources['mode.launchProfile']).toBe('config:launchProfiles.defaultProfile');
    expect(result.sources['mode.execution']).toBe('config:launchProfiles.paper.mode');

    expect(process.env.PROFILE).toBeUndefined();
    expect(process.env.EXECUTION_MODE).toBe('live');
    expect(process.env.LIVE_TRADING).toBe('true');
  });

  test('derives backtest mode and isolated paths without mutating process.env', () => {
    process.env = {
      ...originalEnv,
      PROFILE: 'backtest-all',
      EXECUTION_MODE: 'backtest',
      CANDLE_SOURCE: 'file',
      BACKTEST_MODE: '',
      STATE_FILE: '',
      DATA_DIR: '',
      LIVE_TRADING: 'false',
      RISK_MANAGER_BYPASS: 'true',
      ACCOUNT_DRAWDOWN_BYPASS: 'true',
      MAX_DRAWDOWN: '5',
      MAX_DAILY_LOSS: '1',
      MAX_WEEKLY_LOSS: '5',
      MAX_MONTHLY_LOSS: '5',
    };

    const ConfigLoader = require('../foundation/ConfigLoader');
    const result = ConfigLoader.load({ force: true, silent: true });

    expect(result.config.mode.backtest).toBe(true);
    expect(result.config.paths.stateFile).toBe(path.join(process.cwd(), 'data', 'state-backtest.json'));
    expect(result.config.paths.dataDir).toBe(path.join(process.cwd(), 'data', 'backtest'));
    expect(result.config.mode.launchProfile).toBe('backtest-all');
    expect(result.sources['mode.execution']).toBe('config:launchProfiles.backtest-all.mode');
    expect(result.sources['mode.backtest']).toBe('config:launchProfiles.backtest-all.mode');
    expect(result.sources['paths.stateFile']).toBe('derived:backtest-state-isolation');
    expect(result.sources['paths.dataDir']).toBe('derived:backtest-state-isolation');

    expect(process.env.BACKTEST_MODE).toBe('');
    expect(process.env.STATE_FILE).toBe('');
    expect(process.env.DATA_DIR).toBe('');
  });

  test('loads dotenv values into resolved config without mutating process.env', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-loader-env-'));
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, [
      'PROFILE=backtest-all',
      'BACKTEST_MODE=true',
      'STATE_FILE=data/custom-state.json',
      'DATA_DIR=data/custom-backtest',
      '',
    ].join('\n'));

    try {
      process.env = {
        ...originalEnv,
        DOTENV_CONFIG_PATH: envPath,
        LIVE_TRADING: 'false',
        RISK_MANAGER_BYPASS: 'true',
        ACCOUNT_DRAWDOWN_BYPASS: 'true',
        MAX_DRAWDOWN: '5',
        MAX_DAILY_LOSS: '1',
        MAX_WEEKLY_LOSS: '5',
        MAX_MONTHLY_LOSS: '5',
      };
      delete process.env.PROFILE;
      delete process.env.BACKTEST_MODE;
      delete process.env.STATE_FILE;
      delete process.env.DATA_DIR;

      const ConfigLoader = require('../foundation/ConfigLoader');
      const result = ConfigLoader.load({ force: true, silent: true });

      expect(result.config.mode.backtest).toBe(true);
      expect(result.config.paths.stateFile).toBe('data/custom-state.json');
      expect(result.config.paths.dataDir).toBe('data/custom-backtest');
      expect(result.config.mode.launchProfile).toBe('backtest-all');
      expect(result.sources['mode.execution']).toBe('config:launchProfiles.backtest-all.mode');
      expect(result.sources['mode.backtest']).toBe('config:launchProfiles.backtest-all.mode');
      expect(result.sources['paths.stateFile']).toBe('dotenv:STATE_FILE');
      expect(result.sources['paths.dataDir']).toBe('dotenv:DATA_DIR');

      expect(process.env.BACKTEST_MODE).toBeUndefined();
      expect(process.env.PROFILE).toBeUndefined();
      expect(process.env.STATE_FILE).toBeUndefined();
      expect(process.env.DATA_DIR).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
