'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const KrakenAdapterSimple = require('../kraken_adapter_simple');

const FLAG_PATH = path.join(__dirname, '..', 'killswitch.flag');
let quarantineDir;

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

function isolatedGuard(runtime = {}) {
  const { AuthFailureGuard } = require('../core/AuthFailureGuard');
  const guard = new AuthFailureGuard({ quarantineDir });
  guard.wireRuntime(runtime);
  return guard;
}

describe('AuthFailureGuard', () => {
  beforeEach(() => {
    cleanFlag();
    quarantineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-auth-quarantine-'));
  });
  afterEach(() => {
    cleanFlag();
    fs.rmSync(quarantineDir, { recursive: true, force: true });
  });

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

  test('does not quarantine or kill before threshold', () => {
    const guard = isolatedGuard();
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(fs.readdirSync(quarantineDir)).toEqual([]);
    expect(fs.existsSync(FLAG_PATH)).toBe(false);
    expect(guard.getState('alpaca').failures.length).toBe(2);
  });

  test('threshold breach persists broker quarantine, flattens only that broker, screams, and never kills', async () => {
    const activeTrades = new Map([
      ['alpaca-long', {
        id: 'alpaca-long', orderId: 'alpaca-long', symbol: 'TSLA', brokerId: 'alpaca', action: 'BUY', direction: 'long',
      }],
      ['kraken-long', {
        id: 'kraken-long', orderId: 'kraken-long', symbol: 'BTC-USD', brokerId: 'kraken', action: 'BUY', direction: 'long',
      }],
    ]);
    const stateManager = {
      state: { activeTrades },
      getLastPrice: jest.fn((symbol) => symbol === 'TSLA' ? 425 : 64000),
    };
    const executeTrade = jest.fn(async (decision, _confidence, _price, _indicators, _patterns, _trai, _orch, symbol) => {
      activeTrades.delete(decision.tradeId);
      return { success: true, symbol };
    });
    const { subscribeTrace } = require('../core/TraceSpine');
    const traces = [];
    const unsubscribe = subscribeTrace((event) => traces.push(event));
    const guard = isolatedGuard({ stateManager, executeTrade });

    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    await guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));

    expect(fs.existsSync(FLAG_PATH)).toBe(false);
    expect(fs.readdirSync(quarantineDir)).toHaveLength(1);
    expect(executeTrade).toHaveBeenCalledTimes(1);
    expect(executeTrade.mock.calls[0][0]).toEqual(expect.objectContaining({
      action: 'SELL',
      tradeId: 'alpaca-long',
      exitReason: 'broker_auth_quarantine',
    }));
    expect(executeTrade.mock.calls[0][7]).toBe('TSLA');
    expect(activeTrades.has('alpaca-long')).toBe(false);
    expect(activeTrades.has('kraken-long')).toBe(true);
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'BROKER_AUTH_QUARANTINE_ALARM',
        fields: expect.objectContaining({
          broker: 'alpaca',
          kind: 'rest-auth',
          count: 3,
          windowMs: guard.getState('alpaca').windowMs,
          evidence: 'test-auth-classifier',
          entryBlocking: true,
        }),
      }),
    ]));
    unsubscribe();
  });

  test('quarantine is re-read from disk on reconstruction and does not block the healthy broker', async () => {
    const guard = isolatedGuard({
      stateManager: { state: { activeTrades: new Map() } },
      executeTrade: jest.fn(),
    });
    guard.recordFailure('alpaca', 'rest-auth', authDetail());
    guard.recordFailure('alpaca', 'rest-auth', authDetail());
    await guard.recordFailure('alpaca', 'rest-auth', authDetail());

    const reconstructed = isolatedGuard();
    expect(reconstructed.getEntryBlock('alpaca')).toEqual(expect.objectContaining({
      blocked: true,
      code: 'broker_auth_quarantined',
      brokerId: 'alpaca',
      entryBlockScope: 'broker',
    }));
    expect(reconstructed.getEntryBlock('kraken')).toEqual({ blocked: false });
  });

  test('OrderExecutor refuses quarantined broker entry before order side effects', async () => {
    jest.resetModules();
    const authFailureGuard = {
      getEntryBlock: jest.fn((broker) => broker === 'alpaca'
        ? {
            blocked: true,
            code: 'broker_auth_quarantined',
            reason: '[BROKER_AUTH_QUARANTINED] alpaca operator clear required',
            brokerId: 'alpaca',
            entryBlockScope: 'broker',
            quarantinedAt: '2026-08-30T00:00:00.000Z',
          }
        : { blocked: false }),
    };
    const stateManager = {
      get: jest.fn((key) => key === 'isTrading' ? true : (key === 'balance' ? 10000 : 0)),
      getEquity: jest.fn(() => 10000),
      getAvailableCapital: jest.fn(() => 10000),
      isHalted: jest.fn(() => false),
      getHaltReason: jest.fn(() => null),
      isSymbolHalted: jest.fn(() => false),
      getSymbolHaltReason: jest.fn(() => null),
      getSymbolHaltCode: jest.fn(() => null),
      getBrokerVerificationEntryBlock: jest.fn(() => null),
      getState: jest.fn(() => ({ activeTrades: new Map() })),
      haltSymbol: jest.fn(),
      openPosition: jest.fn(() => ({ success: true, trade: { id: 'healthy-entry' } })),
    };
    jest.doMock('../core/AuthFailureGuard', () => authFailureGuard);
    jest.doMock('../core/StateManager', () => ({ getInstance: () => stateManager }));
    jest.doMock('../ogz-meta/claudito-logger', () => ({
      TradingProofLogger: { trade: jest.fn(), explanation: jest.fn() },
    }));
    const OrderExecutor = require('../core/OrderExecutor');
    const { subscribeTrace } = require('../core/TraceSpine');
    const traces = [];
    const unsubscribe = subscribeTrace((event) => traces.push(event));
    const orderRouter = { sendOrder: jest.fn(), getBrokerTruthEntryBlock: jest.fn(() => null) };
    const executor = new OrderExecutor({
      config: {
        brokerId: 'alpaca', assetClass: 'stocks', timeframe: '1m', executionMode: 'paper', enableBacktestMode: false,
      },
      backtestMode: false,
      paperTrading: true,
      backtestFast: true,
      orderRouter,
      notifyTrade: jest.fn(),
      discordNotifier: { notifyTrade: jest.fn() },
      performanceAnalyzer: { processTrade: jest.fn() },
    });

    const result = await executor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {}, 425, {}, [], null,
      { winnerStrategy: 'RSI', sizingMultiplier: 1 },
      'TSLA'
    );

    expect(result).toEqual(expect.objectContaining({
      success: false,
      reason: 'broker_auth_quarantined',
      brokerId: 'alpaca',
      entryBlockScope: 'broker',
      orderAccepted: false,
    }));
    expect(authFailureGuard.getEntryBlock).toHaveBeenCalledWith('alpaca');
    expect(orderRouter.sendOrder).not.toHaveBeenCalled();
    expect(stateManager.getAvailableCapital).not.toHaveBeenCalled();
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'BROKER_AUTH_QUARANTINE_ENTRY_ALARM',
        fields: expect.objectContaining({
          brokerId: 'alpaca',
          reason: 'broker_auth_quarantined',
          route: 'order_executor_entry_block_exits_still_allowed',
        }),
      }),
    ]));

    stateManager.get.mockImplementation((key) => {
      if (key === 'isTrading') return true;
      if (key === 'balance') return 10000;
      if (key === 'position') return 0;
      return null;
    });
    stateManager.getAvailableCapital.mockReturnValue(1000);
    stateManager.getEquity.mockReturnValue(1000);
    const healthyRouter = {
      sendOrder: jest.fn().mockResolvedValue({ orderId: 'healthy-kraken-entry', price: 64000 }),
      getBrokerTruthEntryBlock: jest.fn(() => null),
    };
    const healthyExecutor = new OrderExecutor({
      config: {
        brokerId: 'kraken', assetClass: 'crypto', timeframe: '1m', executionMode: 'live', enableBacktestMode: false,
      },
      backtestMode: false,
      paperTrading: false,
      backtestFast: true,
      orderRouter: healthyRouter,
      notifyTrade: jest.fn(),
      discordNotifier: { notifyTrade: jest.fn() },
      performanceAnalyzer: { processTrade: jest.fn() },
    });
    const healthyResult = await healthyExecutor.executeTrade(
      { action: 'BUY', confidence: 75 },
      {}, 64000, { volatility: 0.01 }, [], null,
      {
        winnerStrategy: 'RSI',
        sizingMultiplier: 1,
        exitContract: {
          stopLossPercent: -0.5,
          takeProfitPercent: 2,
          trailingStopPercent: 0.6,
          trailingActivation: 0.8,
          maxHoldTimeMinutes: 240,
          minConfidence: 0.6,
          atrMinPercent: null,
          useStructuralExits: false,
          maxConcurrentEntries: 1,
          scaleIn: { enabled: false, maxAdds: 0, addTriggerClass: 'none', requireProfitConfirmation: true, aggregateRiskCap: 1, addSizingLadder: [] },
          invalidationConditions: [],
        },
      },
      'BTC-USD'
    );

    expect(authFailureGuard.getEntryBlock).toHaveBeenCalledWith('kraken');
    expect(healthyResult).toEqual(expect.objectContaining({ success: true, symbol: 'BTC-USD', action: 'BUY' }));
    expect(healthyRouter.sendOrder).toHaveBeenCalled();
    unsubscribe();
    jest.dontMock('../core/AuthFailureGuard');
    jest.dontMock('../core/StateManager');
    jest.dontMock('../ogz-meta/claudito-logger');
  });

  test('per-broker isolation: alpaca failures do not affect kraken counter', () => {
    const guard = isolatedGuard();
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('kraken', 'rest-token', authDetail({ message: 'EAPI:Invalid key' }));
    expect(fs.existsSync(FLAG_PATH)).toBe(false);
    expect(guard.getState('alpaca').failures.length).toBe(2);
    expect(guard.getState('kraken').failures.length).toBe(1);
  });

  test('expired failures drop out of the window', () => {
    const guard = isolatedGuard();
    const cfg = guard.getState('alpaca');
    const realNow = Date.now();
    const spy = jest.spyOn(Date, 'now');

    // Two failures at t0
    spy.mockReturnValue(realNow);
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(fs.readdirSync(quarantineDir)).toEqual([]);

    // Third failure 1 ms past the window - prior two should expire
    spy.mockReturnValue(realNow + cfg.windowMs + 1);
    guard.recordFailure('alpaca', 'rest-auth', authDetail({ status: 401 }));
    expect(fs.readdirSync(quarantineDir)).toEqual([]);
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
    jest.doMock('../foundation/ConfigLoader', () => ({
      hasLoadedSnapshot: jest.fn(() => true),
      load: jest.fn(),
      get: jest.fn((pathLabel) => {
        if (pathLabel === 'authFailureGuard') {
          return {
            thresholdCount: 3,
            windowMs: 300000,
            extra: true,
          };
        }
        return undefined;
      }),
    }));

    expect(() => require('../core/AuthFailureGuard')).toThrow(/unexpected authFailureGuard config key/);
    jest.dontMock('../foundation/ConfigLoader');
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
      message: 'Unauthorized - token expired',
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

  test('Kraken private REST auth failures record in credentials, balance, and open-orders paths', async () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});
    const KrakenAdapter = require('../kraken_adapter_simple');
    const adapter = new KrakenAdapter();
    adapter.makePrivateRequest = jest
      .fn()
      .mockResolvedValueOnce({ error: ['Unauthorized - token expired'] })
      .mockResolvedValueOnce({ error: ['EAPI:Invalid signature'] })
      .mockResolvedValueOnce({ error: ['EGeneral:Permission denied'] })
      .mockResolvedValueOnce({ error: ['EAPI:Rate limit exceeded'] });

    await expect(adapter.testCredentials()).rejects.toThrow('API Error: Unauthorized - token expired');
    await expect(adapter.getAccountBalance()).rejects.toThrow('Balance error: EAPI:Invalid signature');
    await expect(adapter.getOpenOrders()).rejects.toThrow('OpenOrders error: EGeneral:Permission denied');
    await expect(adapter.getOpenOrders()).rejects.toThrow('OpenOrders error: EAPI:Rate limit exceeded');

    expect(recordSpy).toHaveBeenCalledTimes(3);
    expect(recordSpy).toHaveBeenNthCalledWith(1, 'kraken', 'rest-credentials', {
      message: 'API Error: Unauthorized - token expired',
      authFailure: true,
      evidence: 'kraken-auth-classifier',
    });
    expect(recordSpy).toHaveBeenNthCalledWith(2, 'kraken', 'rest-balance', {
      message: 'Balance error: EAPI:Invalid signature',
      authFailure: true,
      evidence: 'kraken-auth-classifier',
    });
    expect(recordSpy).toHaveBeenNthCalledWith(3, 'kraken', 'rest-open-orders', {
      message: 'OpenOrders error: EGeneral:Permission denied',
      authFailure: true,
      evidence: 'kraken-auth-classifier',
    });

    recordSpy.mockRestore();
  });

  test('Kraken private order auth failures record before preserving placeOrder failure', async () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});
    const KrakenAdapter = require('../kraken_adapter_simple');
    const adapter = new KrakenAdapter();
    adapter.assetPairs.set('XXBTZUSD', { ordermin: '0.0001', lot_decimals: 8 });
    adapter.makePrivateRequest = jest
      .fn()
      .mockResolvedValueOnce({ error: ['EAPI:Invalid key'] })
      .mockResolvedValueOnce({ error: ['EOrder:Insufficient funds'] });

    await expect(adapter.placeOrder({
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002,
    })).rejects.toThrow('Failed to place order: Order error: EAPI:Invalid key');

    await expect(adapter.placeOrder({
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'market',
      quantity: 0.002,
    })).rejects.toThrow('Failed to place order: Order error: EOrder:Insufficient funds');

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith('kraken', 'rest-place-order', {
      message: 'Order error: EAPI:Invalid key',
      authFailure: true,
      evidence: 'kraken-auth-classifier',
    });

    recordSpy.mockRestore();
  });

  test('Kraken websocket setup auth failures record before returning false', async () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});

    jest.doMock('ws', () => {
      return jest.fn(() => {
        throw new Error('EGeneral:Permission denied');
      });
    });

    const KrakenAdapter = require('../kraken_adapter_simple');
    const adapter = new KrakenAdapter({ tradingPair: 'BTC-USD' });

    await expect(adapter.connectWebSocketStream(() => {})).resolves.toBe(false);

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith('kraken', 'ws-auth-connect', {
      message: 'EGeneral:Permission denied',
      authFailure: true,
      evidence: 'kraken-auth-classifier',
    });

    recordSpy.mockRestore();
    jest.dontMock('ws');
  });

  test('Kraken websocket setup non-auth failures do not record auth failures', async () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});

    jest.doMock('ws', () => {
      return jest.fn(() => {
        throw new Error('ECONNRESET socket hang up');
      });
    });

    const KrakenAdapter = require('../kraken_adapter_simple');
    const adapter = new KrakenAdapter({ tradingPair: 'BTC-USD' });

    await expect(adapter.connectWebSocketStream(() => {})).resolves.toBe(false);

    expect(recordSpy).not.toHaveBeenCalled();

    recordSpy.mockRestore();
    jest.dontMock('ws');
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
    const { subscribeTrace } = require('../core/TraceSpine');
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));
    const AlpacaAdapter = require('../brokers/AlpacaAdapter');
    const adapter = new AlpacaAdapter({ apiKey: 'key', apiSecret: 'secret', mode: 'paper' });

    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 402, msg: 'auth failed' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 403, msg: 'Forbidden' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 400, msg: 'Invalid API key' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 'auth_failed', msg: 'authentication failed' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 405, msg: 'symbol limit exceeded' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'error', code: 400, msg: 'invalid symbol' });
    adapter._recordDataStreamAuthErrorIfRelevant({ T: 'success', code: 402, msg: 'authenticated' });

    expect(recordSpy).toHaveBeenCalledTimes(4);
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
    expect(recordSpy).toHaveBeenNthCalledWith(4, 'alpaca', 'ws-data-stream-auth', {
      code: 'auth_failed',
      message: 'authentication failed',
      authFailure: true,
      evidence: 'alpaca-ws-data-auth-body',
    });
    expect(traces.filter((payload) => payload.event === 'ALPACA_DATA_STREAM_AUTH_UNAVAILABLE')).toHaveLength(4);
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'ALPACA_DATA_STREAM_AUTH_UNAVAILABLE',
        fields: expect.objectContaining({
          code: 'alpaca_broker_truth_unavailable',
          reason: 'alpaca_data_stream_auth_unavailable',
          operation: 'dataStreamAuth',
        }),
      }),
    ]));

    unsubscribe();
    recordSpy.mockRestore();
  });

  test('Alpaca websocket transport auth errors record failures but ignore ordinary transport errors', () => {
    jest.resetModules();
    cleanFlag();
    const authFailureGuard = require('../core/AuthFailureGuard');
    const recordSpy = jest.spyOn(authFailureGuard, 'recordFailure').mockImplementation(() => {});
    const { subscribeTrace } = require('../core/TraceSpine');
    const traces = [];
    const unsubscribe = subscribeTrace((payload) => traces.push(payload));
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
    expect(traces.filter((payload) => payload.event === 'ALPACA_WS_TRANSPORT_AUTH_UNAVAILABLE')).toHaveLength(2);
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'ALPACA_WS_TRANSPORT_AUTH_UNAVAILABLE',
        fields: expect.objectContaining({
          code: 'alpaca_broker_truth_unavailable',
          reason: 'alpaca_ws_transport_auth_unavailable',
          operation: 'ws-account-upgrade-auth',
        }),
      }),
      expect.objectContaining({
        event: 'ALPACA_WS_TRANSPORT_AUTH_UNAVAILABLE',
        fields: expect.objectContaining({
          operation: 'ws-data-upgrade-auth',
        }),
      }),
    ]));

    unsubscribe();
    recordSpy.mockRestore();
  });

  test('Alpaca connect records account auth failures through getBalance before typed rejection', async () => {
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

    await expect(adapter.connect()).rejects.toMatchObject({
      code: 'alpaca_broker_truth_unavailable',
      reason: 'alpaca_connect_failed',
      broker: 'alpaca',
      operation: 'connect',
    });
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
