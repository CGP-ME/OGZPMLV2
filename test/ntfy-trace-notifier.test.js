'use strict';

const {
  createNtfyTraceNotifier,
  notificationForTrace,
  resolveNtfyEndpoint,
} = require('../core/NtfyTraceNotifier');

function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('NtfyTraceNotifier', () => {
  test('does not install without NTFY_TOPIC', () => {
    expect(createNtfyTraceNotifier({ env: {}, logger: console })).toBeNull();
    expect(createNtfyTraceNotifier({ env: { NTFY_TOPIC: '   ' }, logger: console })).toBeNull();
  });

  test('resolves topic names without exposing runtime secrets', () => {
    expect(resolveNtfyEndpoint('ogz-alerts')).toBe('https://ntfy.sh/ogz-alerts');
    expect(resolveNtfyEndpoint('https://ntfy.example.com/operator')).toBe('https://ntfy.example.com/operator');
  });

  test('forwards position-open trace events at normal priority', async () => {
    const requestImpl = jest.fn(() => Promise.resolve());
    const logger = { error: jest.fn() };
    const notifier = createNtfyTraceNotifier({
      env: { NTFY_TOPIC: 'ogz-alerts' },
      logger,
      requestImpl,
    });

    const handled = notifier.handleTraceEvent({
      event: 'STATE_MUTATION',
      symbol: 'TSLA',
      positionEffect: 'open_long',
      fields: {
        success: true,
        operation: 'openPosition',
        sizeUsd: 250,
        price: 411.5,
      },
    });

    await flushPromises();

    expect(handled).toBe(true);
    expect(requestImpl).toHaveBeenCalledWith('https://ntfy.sh/ogz-alerts', {
      priority: 'default',
      title: 'OGZ position opened',
      message: 'TSLA open_long size=250 price=$411.50',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('keeps open notifications loud when positionEffect is missing', () => {
    expect(notificationForTrace({
      event: 'STATE_MUTATION',
      symbol: 'TSLA',
      fields: {
        success: true,
        operation: 'openPosition',
        sizeUsd: 250,
        price: 411.5,
      },
    })).toEqual({
      priority: 'default',
      title: 'OGZ position opened',
      message: 'TSLA unknown_effect size=250 price=$411.50',
    });
  });

  test('does not report unconfirmed state mutations as open or closed', () => {
    expect(notificationForTrace({
      event: 'STATE_MUTATION',
      symbol: 'TSLA',
      fields: {
        operation: 'openPosition',
        sizeUsd: 250,
        price: 411.5,
      },
    })).toBeNull();
  });

  test('forwards fully closed position fills at normal priority with PnL and reason', async () => {
    const requestImpl = jest.fn(() => Promise.resolve());
    const logger = { error: jest.fn() };
    const notifier = createNtfyTraceNotifier({
      env: { NTFY_TOPIC: 'ogz-alerts' },
      logger,
      requestImpl,
    });

    const handled = notifier.handleTraceEvent({
      event: 'STATE_MUTATION',
      symbol: 'NVDA',
      positionEffect: 'close_short',
      fields: {
        success: true,
        operation: 'applyFill',
        remainingOrderQuantity: 0,
        pnlDollars: 10.25,
        exitReason: 'structural_stop',
      },
    });

    await flushPromises();

    expect(handled).toBe(true);
    expect(requestImpl).toHaveBeenCalledWith('https://ntfy.sh/ogz-alerts', {
      priority: 'default',
      title: 'OGZ position closed',
      message: 'NVDA close_short pnl=$10.25 reason=structural_stop',
    });
  });

  test('keeps closed-fill notifications loud when positionEffect is missing', () => {
    expect(notificationForTrace({
      event: 'STATE_MUTATION',
      symbol: 'NVDA',
      fields: {
        success: true,
        operation: 'applyFill',
        remainingOrderQuantity: 0,
        pnlDollars: 10.25,
        exitReason: 'structural_stop',
      },
    })).toEqual({
      priority: 'default',
      title: 'OGZ position closed',
      message: 'NVDA unknown_effect pnl=$10.25 reason=structural_stop',
    });
  });

  test('keeps applyFill notifications loud when both positionEffect and remaining quantity are missing', () => {
    expect(notificationForTrace({
      event: 'STATE_MUTATION',
      symbol: 'MARA',
      fields: {
        success: true,
        operation: 'applyFill',
        pnlDollars: 5,
        exitReason: 'exit_contract',
      },
    })).toEqual({
      priority: 'default',
      title: 'OGZ position closed',
      message: 'MARA unknown_effect pnl=$5.00 reason=exit_contract',
    });
  });

  test('does not report partial unknown-effect fills as fully closed when remaining quantity is positive', () => {
    expect(notificationForTrace({
      event: 'STATE_MUTATION',
      symbol: 'MARA',
      fields: {
        success: true,
        operation: 'applyFill',
        remainingOrderQuantity: 0.25,
        pnlDollars: 5,
        exitReason: 'partial_close',
      },
    })).toBeNull();
  });

  test('routes blocked execution events to high priority', () => {
    expect(notificationForTrace({
      event: 'ORDER_BLOCKED',
      symbol: 'MARA',
      positionEffect: 'open_long',
      fields: { reason: 'insufficient_capital' },
    })).toEqual({
      priority: 'high',
      title: 'OGZ ORDER_BLOCKED',
      message: 'MARA open_long reason=insufficient_capital',
    });
  });

  test('routes alarms and reconciliation events to max priority', () => {
    expect(notificationForTrace({
      event: 'TRADE_JOURNAL_RECONCILIATION_REQUIRED',
      symbol: 'RIOT',
      positionEffect: 'close_short',
      fields: { manualReconciliationRequired: true, reason: 'journal_write_failed' },
    })).toEqual({
      priority: 'max',
      title: 'OGZ TRADE_JOURNAL_RECONCILIATION_REQUIRED',
      message: 'RIOT close_short reason=journal_write_failed',
    });
  });

  test('ignores unrelated trace events', async () => {
    const requestImpl = jest.fn(() => Promise.resolve());
    const notifier = createNtfyTraceNotifier({
      env: { NTFY_TOPIC: 'ogz-alerts' },
      logger: { error: jest.fn() },
      requestImpl,
    });

    expect(notifier.handleTraceEvent({
      event: 'ORDER_PLAN',
      symbol: 'TSLA',
      fields: { action: 'BUY' },
    })).toBe(false);

    await flushPromises();

    expect(requestImpl).not.toHaveBeenCalled();
  });

  test('logs failed pushes without throwing into trace callers', async () => {
    const requestImpl = jest.fn(() => Promise.reject(new Error('network down')));
    const logger = { error: jest.fn() };
    const notifier = createNtfyTraceNotifier({
      env: { NTFY_TOPIC: 'ogz-alerts' },
      logger,
      requestImpl,
    });

    expect(() => notifier.handleTraceEvent({
      event: 'ORDER_BLOCKED',
      symbol: 'TSLA',
      positionEffect: 'close_long',
      fields: { reason: 'broker_reject' },
    })).not.toThrow();

    await flushPromises();

    expect(logger.error).toHaveBeenCalledWith('[NTFY] trace push failed: network down');
  });
});
