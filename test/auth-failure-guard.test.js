'use strict';

const fs = require('fs');
const path = require('path');
const KrakenAdapterSimple = require('../kraken_adapter_simple');

const FLAG_PATH = path.join(__dirname, '..', 'killswitch.flag');

function cleanFlag() {
  if (fs.existsSync(FLAG_PATH)) fs.unlinkSync(FLAG_PATH);
}

function freshGuard() {
  jest.resetModules();
  cleanFlag();
  return {
    guard: require('../core/AuthFailureGuard'),
    killSwitch: require('../core/KillSwitch'),
  };
}

function authDetail(detail = {}) {
  return {
    authFailure: true,
    evidence: 'test-auth-classifier',
    ...detail,
  };
}

describe('AuthFailureGuard', () => {
  beforeEach(cleanFlag);
  afterEach(cleanFlag);

  test('rejects empty broker', () => {
    const { guard } = freshGuard();
    expect(() => guard.recordFailure('', 'ws-auth')).toThrow(/broker/);
  });

  test('rejects empty kind', () => {
    const { guard } = freshGuard();
    expect(() => guard.recordFailure('alpaca', '')).toThrow(/kind/);
  });

  test('rejects unclassified failures before incrementing broker counter', () => {
    const { guard } = freshGuard();
    expect(() => guard.recordFailure('alpaca', 'rest-order', { status: 500 })).toThrow(/authFailure=true/);
    expect(guard.getState('alpaca').failures.length).toBe(0);
  });

  test('does not fire killSwitch before threshold', () => {
    const { guard, killSwitch } = freshGuard();
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(killSwitch.isKillSwitchOn()).toBe(false);
    expect(guard.getState('alpaca').failures.length).toBe(2);
  });

  test('fires killSwitch exactly on the threshold breach call', () => {
    const { guard, killSwitch } = freshGuard();
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(killSwitch.isKillSwitchOn()).toBe(false);
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(killSwitch.isKillSwitchOn()).toBe(true);
  });

  test('per-broker isolation: alpaca failures do not affect kraken counter', () => {
    const { guard, killSwitch } = freshGuard();
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('kraken', 'rest-token', authDetail({ message: 'EAPI:Invalid key' }));
    expect(killSwitch.isKillSwitchOn()).toBe(false);
    expect(guard.getState('alpaca').failures.length).toBe(2);
    expect(guard.getState('kraken').failures.length).toBe(1);
  });

  test('expired failures drop out of the window', () => {
    const { guard, killSwitch } = freshGuard();
    const cfg = guard.getState('alpaca');
    const realNow = Date.now();
    const spy = jest.spyOn(Date, 'now');

    // Two failures at t0
    spy.mockReturnValue(realNow);
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(killSwitch.isKillSwitchOn()).toBe(false);

    // Third failure 1 ms past the window - prior two should expire
    spy.mockReturnValue(realNow + cfg.windowMs + 1);
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(killSwitch.isKillSwitchOn()).toBe(false);
    expect(guard.getState('alpaca').failures.length).toBe(1);

    spy.mockRestore();
  });

  test('reads thresholdCount and windowMs from config (no defaults)', () => {
    const { guard } = freshGuard();
    const state = guard.getState('alpaca');
    expect(Number.isInteger(state.thresholdCount)).toBe(true);
    expect(state.thresholdCount).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(state.windowMs)).toBe(true);
    expect(state.windowMs).toBeGreaterThanOrEqual(1000);
  });

  test('rejects unknown authFailureGuard config keys at module load', () => {
    jest.resetModules();
    cleanFlag();
    const actualFs = jest.requireActual('fs');
    jest.doMock('fs', () => ({
      ...actualFs,
      existsSync: (filePath) => String(filePath).endsWith('/config/trading.config.json')
        ? true
        : actualFs.existsSync(filePath),
      readFileSync: (filePath, encoding) => {
        if (String(filePath).endsWith('/config/trading.config.json')) {
          return JSON.stringify({
            authFailureGuard: {
              thresholdCount: 3,
              windowMs: 300000,
              extra: true,
            },
          });
        }
        return actualFs.readFileSync(filePath, encoding);
      },
    }));

    expect(() => require('../core/AuthFailureGuard')).toThrow(/unexpected authFailureGuard config key/);
    jest.dontMock('fs');
  });

  test('Kraken auth classifier trips only on credential-style failures', () => {
    expect(KrakenAdapterSimple.isKrakenAuthFailure({
      response: { status: 401, data: { error: [] } },
      message: 'Unauthorized',
    })).toBe(true);
    expect(KrakenAdapterSimple.isKrakenAuthFailure({
      message: 'API Error: EAPI:Invalid key',
    })).toBe(true);
    expect(KrakenAdapterSimple.isKrakenAuthFailure({
      response: { data: { error: ['EGeneral:Permission denied'] } },
      message: 'Token error',
    })).toBe(true);

    expect(KrakenAdapterSimple.isKrakenAuthFailure({
      code: 'ECONNRESET',
      message: 'socket hang up',
    })).toBe(false);
    expect(KrakenAdapterSimple.isKrakenAuthFailure({
      response: { status: 429, data: { error: ['EAPI:Rate limit exceeded'] } },
      message: 'Rate limit',
    })).toBe(false);
    expect(KrakenAdapterSimple.isKrakenAuthFailure({
      message: 'Order error: EOrder:Insufficient funds',
    })).toBe(false);
  });

  test('Alpaca detector records auth failures but ignores non-auth HTTP errors', () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});
    const AlpacaAdapter = require('../brokers/AlpacaAdapter');
    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });

    adapter._recordAuthFailureIfRelevant({ response: { status: 401, data: { message: 'Unauthorized' } } }, 'rest-balance');
    adapter._recordAuthFailureIfRelevant({ response: { status: 400, data: { error: ['Invalid API key'] } } }, 'rest-balance');
    adapter._recordAuthFailureIfRelevant({ response: { status: 400, data: { message: 'invalid symbol' } } }, 'rest-balance');
    adapter._recordAuthFailureIfRelevant({ response: { status: 400, data: { message: 'bad credentials format in order note' } } }, 'rest-balance');
    adapter._recordAuthFailureIfRelevant({ response: { status: 422, data: { message: 'unprocessable' } } }, 'rest-balance');

    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy).toHaveBeenNthCalledWith(1, 'alpaca', 'rest-balance', {
      status: 401,
      message: 'Unauthorized',
      authFailure: true,
      evidence: 'alpaca-http-auth-status',
    });
    expect(recordSpy).toHaveBeenNthCalledWith(2, 'alpaca', 'rest-balance', {
      status: 400,
      message: 'Invalid API key',
      authFailure: true,
      evidence: 'alpaca-auth-body',
    });

    recordSpy.mockRestore();
  });

  test('Alpaca data-stream auth error codes record auth failures but ignore non-auth stream errors', () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});
    const AlpacaAdapter = require('../brokers/AlpacaAdapter');
    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });

    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 402, msg: 'auth failed' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 403, msg: 'Forbidden' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 400, msg: 'Invalid API key' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 405, msg: 'symbol limit exceeded' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 400, msg: 'invalid symbol' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'success', code: 402, msg: 'authenticated' });

    expect(recordSpy).toHaveBeenCalledTimes(3);
    expect(recordSpy).toHaveBeenNthCalledWith(1, 'alpaca', 'ws-data-stream-auth', {
      code: 402,
      message: 'auth failed',
      authFailure: true,
      evidence: 'alpaca-ws-data-error-code',
    });
    expect(recordSpy).toHaveBeenNthCalledWith(2, 'alpaca', 'ws-data-stream-auth', {
      code: 403,
      message: 'Forbidden',
      authFailure: true,
      evidence: 'alpaca-ws-data-error-code',
    });
    expect(recordSpy).toHaveBeenNthCalledWith(3, 'alpaca', 'ws-data-stream-auth', {
      code: 400,
      message: 'Invalid API key',
      authFailure: true,
      evidence: 'alpaca-ws-data-auth-body',
    });

    recordSpy.mockRestore();
  });

  test('Alpaca websocket transport auth errors record failures but ignore ordinary transport errors', () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});
    const AlpacaAdapter = require('../brokers/AlpacaAdapter');
    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });

    adapter._recordWsTransportAuthFailureIfRelevant(
      new Error('Unexpected server response: 401'),
      'ws-account-upgrade-auth',
      'alpaca-ws-upgrade-error'
    );
    adapter._recordWsTransportAuthFailureIfRelevant(
      new Error('socket hang up ECONNRESET'),
      'ws-account-upgrade-auth',
      'alpaca-ws-upgrade-error'
    );
    adapter._recordWsTransportAuthFailureIfRelevant(
      new Error('forbidden by firewall policy'),
      'ws-data-upgrade-auth',
      'alpaca-ws-upgrade-error'
    );
    adapter._recordWsTransportAuthFailureIfRelevant(
      new Error('Unexpected server response: 403'),
      'ws-data-upgrade-auth',
      'alpaca-ws-upgrade-error'
    );

    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(recordSpy).toHaveBeenNthCalledWith(1, 'alpaca', 'ws-account-upgrade-auth', {
      message: 'Unexpected server response: 401',
      authFailure: true,
      evidence: 'alpaca-ws-upgrade-error',
    });
    expect(recordSpy).toHaveBeenNthCalledWith(2, 'alpaca', 'ws-data-upgrade-auth', {
      message: 'Unexpected server response: 403',
      authFailure: true,
      evidence: 'alpaca-ws-upgrade-error',
    });

    recordSpy.mockRestore();
  });

  test('Alpaca connect records account auth failures through getBalance before returning false', async () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});
    jest.doMock('axios', () => ({
      get: jest.fn().mockRejectedValue({
        message: 'Unauthorized',
        response: { status: 401, data: { message: 'Unauthorized' } },
      }),
    }));
    const AlpacaAdapter = require('../brokers/AlpacaAdapter');
    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });

    await expect(adapter.connect()).resolves.toBe(false);
    expect(recordSpy).toHaveBeenCalledWith('alpaca', 'rest-balance', {
      status: 401,
      message: 'Unauthorized',
      authFailure: true,
      evidence: 'alpaca-http-auth-status',
    });

    recordSpy.mockRestore();
    jest.dontMock('axios');
  });
});
