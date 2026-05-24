'use strict';

const { emitTrace, sanitizeTracePayload } = require('../core/TraceSpine');

describe('TraceSpine dashboard trace_event feed', () => {
  let logSpy;
  let warnSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  test('does not log or send when eval trace is disabled', () => {
    const dashboardWs = { readyState: 1, send: jest.fn() };
    const ctx = {
      config: { evalTraceEnabled: false, executionMode: 'paper' },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_disabled', symbol: 'TSLA' });

    expect(logSpy).not.toHaveBeenCalled();
    expect(dashboardWs.send).not.toHaveBeenCalled();
  });

  test('logs and sends a structured trace_event when dashboard websocket is open', () => {
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', {
      traceId: 'trace_1',
      signalId: 'trace_1:signal',
      decisionId: 'dec_1',
      symbol: 'TSLA',
      action: 'BUY',
      inputs: { orderQuantity: 3, allowed: true },
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EVAL-TRACE][ORDER_PLAN]'));
    expect(dashboardWs.send).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(dashboardWs.send.mock.calls[0][0]);
    expect(payload).toEqual(expect.objectContaining({
      type: 'trace_event',
      event: 'ORDER_PLAN',
      traceId: 'trace_1',
      signalId: 'trace_1:signal',
      decisionId: 'dec_1',
      symbol: 'TSLA',
      action: 'BUY',
    }));
    expect(payload.fields).toEqual(expect.objectContaining({
      traceId: 'trace_1',
      symbol: 'TSLA',
      inputs: { orderQuantity: 3, allowed: true },
    }));
  });

  test('does not send backtest trace events unless backtest trace is enabled', () => {
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      backtestMode: true,
      config: {
        evalTraceEnabled: true,
        evalTraceBacktest: false,
        executionMode: 'backtest',
      },
      dashboardWs,
    };

    emitTrace(ctx, 'CANDLE_INGRESS', { traceId: 'trace_backtest', symbol: 'TSLA' });

    expect(logSpy).not.toHaveBeenCalled();
    expect(dashboardWs.send).not.toHaveBeenCalled();
  });

  test('sanitizes circular and non-json field values before websocket send', () => {
    const circular = { symbol: 'TSLA' };
    circular.self = circular;
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
      dashboardWs,
    };

    emitTrace(ctx, 'STATE_MUTATION', {
      traceId: 'trace_circular',
      symbol: 'TSLA',
      nested: circular,
      amount: 1n,
      callback: () => 'ignored',
    });

    expect(dashboardWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(dashboardWs.send.mock.calls[0][0]);
    expect(payload.fields.nested.self).toBe('[circular]');
    expect(payload.fields.amount).toBe('1');
    expect(payload.fields.callback).toContain('ignored');
  });

  test('warns once if dashboard trace_event send fails', () => {
    const dashboardWs = {
      readyState: 1,
      bufferedAmount: 0,
      send: jest.fn(() => { throw new Error('socket closed'); }),
    };
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_warn_1' });
    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_warn_2' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[EVAL-TRACE] trace_event dashboard send failed: socket closed');
  });

  test('does not throw when trace fields cannot be enumerated', () => {
    const badFields = new Proxy({}, {
      ownKeys() {
        throw new Error('bad proxy');
      },
    });
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
      dashboardWs,
    };

    expect(() => emitTrace(ctx, 'ORDER_PLAN', badFields)).not.toThrow();

    expect(logSpy).toHaveBeenCalledWith('[EVAL-TRACE][ORDER_PLAN] ');
    expect(dashboardWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(dashboardWs.send.mock.calls[0][0]);
    expect(payload.fields).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith('[EVAL-TRACE] trace_event payload sanitize failed: fields were not object-serializable');
  });

  test('does not invoke accessor getters while rendering or sending trace fields', () => {
    const fields = { traceId: 'trace_accessor', symbol: 'TSLA' };
    const getterSpy = jest.fn(() => {
      throw new Error('getter executed');
    });
    Object.defineProperty(fields, 'danger', {
      enumerable: true,
      get: getterSpy,
    });
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
      dashboardWs,
    };

    expect(() => emitTrace(ctx, 'ORDER_PLAN', fields)).not.toThrow();

    expect(getterSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('danger="[accessor]"'));
    expect(dashboardWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(dashboardWs.send.mock.calls[0][0]);
    expect(payload.fields.danger).toBe('[accessor]');
  });

  test('skips dashboard trace_event send when websocket backpressure is over the configured cap', () => {
    const dashboardWs = {
      readyState: 1,
      bufferedAmount: 2048,
      send: jest.fn(),
    };
    const ctx = {
      config: {
        evalTraceEnabled: true,
        executionMode: 'paper',
        traceEventMaxBufferedBytes: 1024,
      },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_backpressure', symbol: 'TSLA' });
    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_backpressure_2', symbol: 'TSLA' });

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(dashboardWs.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[EVAL-TRACE] trace_event dashboard send skipped: bufferedAmount 2048 > 1024');
  });

  test('skips dashboard trace_event send when configured backpressure cap is invalid at runtime', () => {
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: {
        evalTraceEnabled: true,
        executionMode: 'paper',
        traceEventMaxBufferedBytes: Infinity,
      },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_invalid_cap', symbol: 'TSLA' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(dashboardWs.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[EVAL-TRACE] trace_event dashboard send skipped: invalid traceEventMaxBufferedBytes Infinity');
  });

  test('skips dashboard trace_event send when websocket bufferedAmount is not numeric', () => {
    const dashboardWs = { readyState: 1, send: jest.fn() };
    const ctx = {
      config: {
        evalTraceEnabled: true,
        executionMode: 'paper',
        traceEventMaxBufferedBytes: 1048576,
      },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_missing_buffer', symbol: 'TSLA' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(dashboardWs.send).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[EVAL-TRACE] trace_event dashboard send skipped: invalid bufferedAmount null');
  });

  test('does not throw when dashboard websocket access fails', () => {
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
    };
    Object.defineProperty(ctx, 'dashboardWs', {
      get() {
        throw new Error('ws getter failed');
      },
    });

    expect(() => emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_ws_fail' })).not.toThrow();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[EVAL-TRACE][ORDER_PLAN]'));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[EVAL-TRACE] trace_event dashboard emit failed: ws getter failed');
  });

  test('renders invalid dates consistently in console trace and trace_event payload', () => {
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', { traceId: 'trace_bad_date', seenAt: new Date('invalid') });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('seenAt="[invalid-date]"'));
    expect(dashboardWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(dashboardWs.send.mock.calls[0][0]);
    expect(payload.fields.seenAt).toBe('[invalid-date]');
  });

  test('does not invoke toJSON while rendering sanitized trace fields', () => {
    const toJsonSpy = jest.fn(() => {
      throw new Error('toJSON executed');
    });
    const dashboardWs = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const ctx = {
      config: { evalTraceEnabled: true, executionMode: 'paper', traceEventMaxBufferedBytes: 1048576 },
      dashboardWs,
    };

    emitTrace(ctx, 'ORDER_PLAN', {
      traceId: 'trace_tojson',
      nested: { toJSON: toJsonSpy, value: 7 },
    });

    expect(toJsonSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('value'));
    expect(dashboardWs.send).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(dashboardWs.send.mock.calls[0][0]);
    expect(payload.fields.nested.value).toBe(7);
    expect(payload.fields.nested.toJSON).toContain('function');
  });
});

describe('sanitizeTracePayload', () => {
  test('returns a payload-safe object without mutating source fields', () => {
    const source = { ok: true, missing: undefined, nan: Number.NaN };
    const sanitized = sanitizeTracePayload(source);

    expect(sanitized).toEqual({ ok: true, nan: 'NaN' });
    expect(Object.prototype.hasOwnProperty.call(source, 'missing')).toBe(true);
  });
});
