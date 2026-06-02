'use strict';

const {
  DashboardDepthCoalescer,
  resolveDashboardDepthMinIntervalMs,
} = require('../core/DashboardDepthCoalescer');

describe('DashboardDepthCoalescer', () => {
  test('rejects non-integer or sub-millisecond depth intervals instead of silently flooring', () => {
    expect(resolveDashboardDepthMinIntervalMs()).toBe(1000);
    expect(resolveDashboardDepthMinIntervalMs('250')).toBe(250);

    for (const value of ['0', '0.5', '1000.5', '-1', 'not-a-number']) {
      expect(() => resolveDashboardDepthMinIntervalMs(value)).toThrow(
        'DASHBOARD_DEPTH_MIN_INTERVAL_MS must be a positive integer millisecond value'
      );
    }
    expect(() => new DashboardDepthCoalescer({
      minIntervalMs: '500',
      sendFrame: jest.fn(),
    })).toThrow('minIntervalMs must be a positive integer');
  });

  test('sends the first eligible frame immediately and coalesces cooldown frames to the latest per symbol', () => {
    let now = 1000;
    const timers = [];
    const sendFrame = jest.fn(() => true);
    const coalescer = new DashboardDepthCoalescer({
      minIntervalMs: 1000,
      sendFrame,
      now: () => now,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref: jest.fn() };
        timers.push(timer);
        return timer;
      },
    });

    expect(coalescer.queue('BTC-USD', { type: 'depth_update', seq: 1 })).toBe(true);
    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenLastCalledWith('BTC-USD', { type: 'depth_update', seq: 1 }, 1000);

    now = 1100;
    expect(coalescer.queue('BTC-USD', { type: 'depth_update', seq: 2 })).toBe(false);
    expect(coalescer.queue('BTC-USD', { type: 'depth_update', seq: 3 })).toBe(false);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(900);
    expect(timers[0].unref).toHaveBeenCalledTimes(1);

    now = 2000;
    timers[0].fn();

    expect(sendFrame).toHaveBeenCalledTimes(2);
    expect(sendFrame).toHaveBeenLastCalledWith('BTC-USD', { type: 'depth_update', seq: 3 }, 2000);
  });

  test('does not flush a queued frame after its active-session guard turns false', () => {
    let now = 1000;
    let active = true;
    const timers = [];
    const sendFrame = jest.fn(() => true);
    const coalescer = new DashboardDepthCoalescer({
      minIntervalMs: 1000,
      sendFrame,
      now: () => now,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref: jest.fn() };
        timers.push(timer);
        return timer;
      },
    });

    coalescer.queue('BTC-USD', { type: 'depth_update', seq: 1 }, () => active);
    now = 1100;
    coalescer.queue('BTC-USD', { type: 'depth_update', seq: 2 }, () => active);

    active = false;
    now = 2000;
    timers[0].fn();

    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(sendFrame).toHaveBeenLastCalledWith('BTC-USD', { type: 'depth_update', seq: 1 }, 1000);
  });

  test('clears an existing timer and pending frame when a newer frame becomes immediately eligible', () => {
    let now = 1000;
    const timers = [];
    const clearTimer = jest.fn();
    const sendFrame = jest.fn(() => true);
    const coalescer = new DashboardDepthCoalescer({
      minIntervalMs: 1000,
      sendFrame,
      now: () => now,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref: jest.fn() };
        timers.push(timer);
        return timer;
      },
      clearTimer,
    });

    coalescer.queue('BTC-USD', { type: 'depth_update', seq: 1 });
    now = 1100;
    coalescer.queue('BTC-USD', { type: 'depth_update', seq: 2 });
    now = 2000;
    coalescer.queue('BTC-USD', { type: 'depth_update', seq: 3 });
    timers[0].fn();

    expect(clearTimer).toHaveBeenCalledWith(timers[0]);
    expect(sendFrame).toHaveBeenCalledTimes(2);
    expect(sendFrame).toHaveBeenLastCalledWith('BTC-USD', { type: 'depth_update', seq: 3 }, 2000);
  });

  test('applies the interval globally so many symbols cannot flood the dashboard together', () => {
    let now = 1000;
    const timers = [];
    const sendFrame = jest.fn(() => true);
    const coalescer = new DashboardDepthCoalescer({
      minIntervalMs: 1000,
      sendFrame,
      now: () => now,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref: jest.fn(), symbol: null };
        timers.push(timer);
        return timer;
      },
    });

    expect(coalescer.queue('BTC-USD', { type: 'depth_update', seq: 'btc-1' })).toBe(true);
    expect(coalescer.queue('ETH-USD', { type: 'depth_update', seq: 'eth-1' })).toBe(false);
    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(1000);

    now = 2000;
    timers[0].fn();

    expect(sendFrame).toHaveBeenCalledTimes(2);
    expect(sendFrame).toHaveBeenLastCalledWith('ETH-USD', { type: 'depth_update', seq: 'eth-1' }, 2000);
  });

  test('applies the interval to back-to-back same-symbol frames with the same timestamp', () => {
    let now = 1000;
    const timers = [];
    const sendFrame = jest.fn(() => true);
    const coalescer = new DashboardDepthCoalescer({
      minIntervalMs: 1000,
      sendFrame,
      now: () => now,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref: jest.fn() };
        timers.push(timer);
        return timer;
      },
    });

    expect(coalescer.queue('BTC-USD', { type: 'depth_update', seq: 1 })).toBe(true);
    expect(coalescer.queue('BTC-USD', { type: 'depth_update', seq: 2 })).toBe(false);
    expect(sendFrame).toHaveBeenCalledTimes(1);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(1000);

    now = 2000;
    timers[0].fn();

    expect(sendFrame).toHaveBeenCalledTimes(2);
    expect(sendFrame).toHaveBeenLastCalledWith('BTC-USD', { type: 'depth_update', seq: 2 }, 2000);
  });

  test('clear cancels timers and removes queued depth frames', () => {
    let now = 1000;
    const timers = [];
    const clearTimer = jest.fn();
    const sendFrame = jest.fn(() => true);
    const coalescer = new DashboardDepthCoalescer({
      minIntervalMs: 1000,
      sendFrame,
      now: () => now,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref: jest.fn() };
        timers.push(timer);
        return timer;
      },
      clearTimer,
    });

    coalescer.queue('BTC-USD', { type: 'depth_update', seq: 1 });
    now = 1100;
    coalescer.queue('BTC-USD', { type: 'depth_update', seq: 2 });

    coalescer.clear();
    now = 2000;
    timers[0].fn();

    expect(clearTimer).toHaveBeenCalledWith(timers[0]);
    expect(sendFrame).toHaveBeenCalledTimes(1);
  });
});
