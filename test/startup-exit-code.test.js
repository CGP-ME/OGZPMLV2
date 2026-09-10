'use strict';

const fs = require('fs');
const path = require('path');
const { applyExplicitRuntimeTestEnv } = require('./fixtures/explicit-runtime-env');

describe('runner startup and operator shutdown exit codes', () => {
  let OGZPrimeV14Bot;
  let restoreEnv;
  let logSpy;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    jest.resetModules();
    restoreEnv = applyExplicitRuntimeTestEnv({
      DOTENV_CONFIG_PATH: '/tmp/ogzprime-test-missing.env',
      EXECUTION_MODE: 'backtest',
      BACKTEST_MODE: 'true',
      CANDLE_SOURCE: 'file',
      INITIAL_BALANCE: '10000',
    });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.doMock('../instrument.js', () => ({
      captureException: jest.fn(),
      captureMessage: jest.fn(),
    }));
    jest.doMock('../core/SingletonLock', () => ({
      OGZSingletonLock: jest.fn().mockImplementation(() => ({
        acquireLock: jest.fn(),
        releaseLock: jest.fn(),
      })),
      checkCriticalPorts: jest.fn(),
    }));
    OGZPrimeV14Bot = require('../run-empire-v2');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv();
    jest.resetModules();
  });

  const makeShutdownBot = () => Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
    isRunning: true,
    startTime: Date.now(),
  });

  test('startup failure requests shutdown with exit code 1', async () => {
    const startupError = new Error('forced startup failure');
    const bot = Object.assign(Object.create(OGZPrimeV14Bot.prototype), {
      config: { enableBacktestMode: true },
      sessionRouter: null,
      trai: null,
      loadHistoricalDataAndBacktest: jest.fn().mockRejectedValue(startupError),
      shutdown: jest.fn().mockResolvedValue(),
    });

    await bot.start();

    expect(bot.shutdown).toHaveBeenCalledTimes(1);
    expect(bot.shutdown).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith('[BOOT] Startup failed:', startupError.message);
  });

  test('shutdown forwards an explicit startup-failure exit code', async () => {
    const exitError = new Error('process.exit intercepted');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(code => {
      exitError.exitCode = code;
      throw exitError;
    });

    await expect(makeShutdownBot().shutdown(1)).rejects.toBe(exitError);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('operator signal handlers retain the default zero exit code', async () => {
    const exitError = new Error('process.exit intercepted');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(code => {
      exitError.exitCode = code;
      throw exitError;
    });

    await expect(makeShutdownBot().shutdown()).rejects.toBe(exitError);
    expect(exitSpy).toHaveBeenCalledWith(0);

    const source = fs.readFileSync(path.join(__dirname, '..', 'run-empire-v2.js'), 'utf8');
    expect(source).toContain("process.on('SIGINT', () => bot.shutdown());");
    expect(source).toContain("process.on('SIGTERM', () => bot.shutdown());");
  });
});
