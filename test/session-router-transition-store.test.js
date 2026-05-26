'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TransitionStore = require('../core/session-router/TransitionStore');

describe('SessionRouter TransitionStore', () => {
  let tempDir;
  let now;

  function makeStore(options = {}) {
    return new TransitionStore({
      dir: tempDir,
      ownerId: 'test-owner',
      staleLockMs: 1000,
      clock: () => now,
      ...options
    });
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-transition-store-'));
    now = Date.parse('2026-05-26T12:00:00.000Z');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('missing files project an idle empty status', () => {
    const store = makeStore();

    expect(store.readStatus()).toEqual(expect.objectContaining({
      state: 'IDLE',
      recoveryRequired: false,
      transitionId: null,
      epoch: 0,
      freezeNewEntries: false,
      lock: null,
      eventsCount: 0
    }));
  });

  test('fresh lock refuses duplicate transition start', () => {
    const store = makeStore();
    const first = store.acquireLock({ transitionId: 'stocks-to-crypto' });
    const second = store.acquireLock({ transitionId: 'stocks-to-crypto-again' });

    expect(first.success).toBe(true);
    expect(first.lock).toEqual(expect.objectContaining({
      transitionId: 'stocks-to-crypto',
      epoch: 1,
      ownerId: 'test-owner'
    }));
    expect(second).toEqual(expect.objectContaining({
      success: false,
      recoveryRequired: false,
      error: 'fresh transition lock already held'
    }));
    expect(second.lock.transitionId).toBe('stocks-to-crypto');
  });

  test('stale lock enters recovery required and appends evidence', () => {
    const store = makeStore();
    const first = store.acquireLock({ transitionId: 'stocks-to-crypto' });
    expect(first.success).toBe(true);

    now += 1001;
    const second = store.acquireLock({ transitionId: 'crypto-to-stocks' });
    const status = store.readStatus();
    const events = store.readEvents();

    expect(second).toEqual(expect.objectContaining({
      success: false,
      recoveryRequired: true,
      staleLock: true,
      error: 'stale transition lock present'
    }));
    expect(status).toEqual(expect.objectContaining({
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true,
      safeModeReason: 'stale transition lock present'
    }));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      seq: 1,
      epoch: 1,
      event: 'RECOVERY_REQUIRED',
      reason: 'stale transition lock present'
    }));
    expect(store.nextEpoch()).toBe(2);

    store.releaseLock();
    const third = store.acquireLock({ transitionId: 'retry-without-recovery' });
    expect(third).toEqual(expect.objectContaining({
      success: false,
      recoveryRequired: true,
      error: 'stale transition lock present'
    }));
  });

  test('corrupt state fails closed without throwing', () => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'transition-state.json'), '{ broken json', 'utf8');

    const store = makeStore();
    const status = store.readStatus();

    expect(status.state).toBe('RECOVERY_REQUIRED');
    expect(status.recoveryRequired).toBe(true);
    expect(status.freezeNewEntries).toBe(true);
    expect(status.safeModeReason).toMatch(/corrupt transition-state\.json/);
  });

  test('recovery required state refuses a new lock even when lock file is absent', () => {
    const store = makeStore();
    store.writeState({
      transitionId: 'stale-transition',
      epoch: 4,
      state: 'RECOVERY_REQUIRED',
      freezeNewEntries: true,
      safeModeReason: 'operator recovery required'
    });

    const result = store.acquireLock({ transitionId: 'new-transition' });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      recoveryRequired: true,
      error: 'operator recovery required'
    }));
    expect(result.state.transitionId).toBe('stale-transition');
  });

  test('append-only events preserve ordered seq values', () => {
    const store = makeStore();
    const first = store.appendEvent({ epoch: 7, event: 'TRANSITION_PLANNED' });
    const second = store.appendEvent({ epoch: 7, event: 'FREEZE_SOURCE' });
    const events = store.readEvents();

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(events.map((event) => event.event)).toEqual([
      'TRANSITION_PLANNED',
      'FREEZE_SOURCE'
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2]);
  });

  test('epoch increments monotonically from state and lock files', () => {
    const store = makeStore();

    expect(store.nextEpoch()).toBe(1);
    expect(store.acquireLock({ transitionId: 'stocks-to-crypto' }).lock.epoch).toBe(1);
    expect(store.nextEpoch()).toBe(2);

    store.releaseLock();
    store.writeState({
      transitionId: 'stocks-to-crypto',
      epoch: 12,
      state: 'PLANNED',
      freezeNewEntries: true
    });

    expect(store.nextEpoch()).toBe(13);
  });
});
