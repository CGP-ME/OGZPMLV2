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

  test('releaseLock refuses to delete a different transition owner', () => {
    const store = makeStore();
    const first = store.acquireLock({ transitionId: 'stocks-to-crypto' });
    const wrongRelease = store.releaseLock({ transitionId: 'crypto-to-stocks', epoch: first.lock.epoch });

    expect(wrongRelease).toEqual(expect.objectContaining({
      released: false,
      error: 'transition lock owner mismatch: expected crypto-to-stocks, found stocks-to-crypto'
    }));
    expect(store.acquireLock({ transitionId: 'still-blocked' })).toEqual(expect.objectContaining({
      success: false,
      error: 'fresh transition lock already held'
    }));
    const correctRelease = store.releaseLock({ transitionId: 'stocks-to-crypto', epoch: first.lock.epoch });
    expect(correctRelease).toEqual(expect.objectContaining({
      released: true,
      lock: expect.objectContaining({
        transitionId: 'stocks-to-crypto',
        epoch: first.lock.epoch
      })
    }));
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

  test('recordTransitionEvent persists phase projection with ordered journal evidence', () => {
    const store = makeStore();

    const planned = store.recordTransitionEvent('SESSION_TRANSITION_PLANNED', {
      transitionId: 'crypto-to-stocks-1',
      epoch: 3,
      from: 'crypto',
      to: 'stocks',
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m'
    });
    const freeze = store.recordTransitionEvent('SESSION_FREEZE_SOURCE', {
      transitionId: 'crypto-to-stocks-1',
      epoch: 3,
      from: 'crypto',
      to: 'stocks',
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m',
      activeSession: 'crypto',
      pauseConfirmed: true
    });

    const events = store.readEvents();
    const status = store.readStatus();

    expect(planned).toEqual(expect.objectContaining({
      transitionId: 'crypto-to-stocks-1',
      epoch: 3,
      state: 'PLANNED',
      lastEvent: 'SESSION_TRANSITION_PLANNED',
      freezeNewEntries: true
    }));
    expect(freeze).toEqual(expect.objectContaining({
      transitionId: 'crypto-to-stocks-1',
      epoch: 3,
      state: 'FREEZING_SOURCE',
      lastEvent: 'SESSION_FREEZE_SOURCE',
      freezeNewEntries: true
    }));
    expect(events.map((event) => event.event)).toEqual([
      'SESSION_TRANSITION_PLANNED',
      'SESSION_FREEZE_SOURCE'
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2]);
    expect(status).toEqual(expect.objectContaining({
      transitionId: 'crypto-to-stocks-1',
      epoch: 3,
      state: 'FREEZING_SOURCE',
      brokerId: 'alpaca',
      symbols: ['TSLA'],
      timeframe: '15m',
      lastEvent: 'SESSION_FREEZE_SOURCE',
      lastEventSeq: 2,
      eventsCount: 2
    }));
  });

  test('status reconstructs latest phase from journal when state file is missing', () => {
    const store = makeStore();
    store.recordTransitionEvent('SESSION_TRANSITION_PLANNED', {
      transitionId: 'stocks-to-crypto-1',
      epoch: 9,
      from: 'stocks',
      to: 'crypto',
      brokerId: 'kraken',
      symbols: ['BTC-USD'],
      timeframe: '15m'
    });
    store.recordTransitionEvent('SESSION_TARGET_ACTIVATED', {
      transitionId: 'stocks-to-crypto-1',
      epoch: 9,
      from: 'stocks',
      to: 'crypto',
      activeSession: 'crypto',
      brokerId: 'kraken',
      symbols: ['BTC-USD'],
      timeframe: '15m'
    });
    fs.unlinkSync(path.join(tempDir, 'transition-state.json'));

    const restartedStore = makeStore();
    const status = restartedStore.readStatus();

    expect(status).toEqual(expect.objectContaining({
      transitionId: 'stocks-to-crypto-1',
      epoch: 9,
      state: 'TARGET_ACTIVATED',
      recoveryRequired: false,
      freezeNewEntries: false,
      from: 'stocks',
      to: 'crypto',
      activeSession: 'crypto',
      brokerId: 'kraken',
      symbols: ['BTC-USD'],
      timeframe: '15m',
      lastEvent: 'SESSION_TARGET_ACTIVATED',
      lastEventSeq: 2,
      eventsCount: 2
    }));
  });

  test('status uses newer journal event when state file is stale', () => {
    const store = makeStore();
    store.writeState({
      transitionId: 'crypto-to-stocks-1',
      epoch: 11,
      state: 'PLANNED',
      freezeNewEntries: true,
      lastEvent: 'SESSION_TRANSITION_PLANNED',
      lastEventSeq: 1
    });
    store.appendEvent({
      transitionId: 'crypto-to-stocks-1',
      epoch: 11,
      event: 'SESSION_FAILED_SAFE',
      from: 'crypto',
      to: 'stocks',
      reason: 'crash after planned state write'
    });
    store.appendEvent({
      transitionId: 'crypto-to-stocks-1',
      epoch: 11,
      event: 'SESSION_FAILED_SAFE',
      from: 'crypto',
      to: 'stocks',
      reason: 'journal after state'
    });

    const status = store.readStatus();

    expect(status).toEqual(expect.objectContaining({
      transitionId: 'crypto-to-stocks-1',
      epoch: 11,
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true,
      safeModeReason: 'journal after state',
      lastEvent: 'SESSION_FAILED_SAFE',
      lastEventSeq: 2
    }));
  });

  test('source flat failure projects recovery required if process crashes before failed-safe event', () => {
    const store = makeStore();
    store.recordTransitionEvent('SESSION_SOURCE_FLAT_FAILED', {
      transitionId: 'stocks-to-crypto-flat-failed',
      epoch: 12,
      from: 'stocks',
      to: 'crypto',
      activeSession: 'stocks',
      reason: 'source position still open'
    });

    const status = store.readStatus();

    expect(status).toEqual(expect.objectContaining({
      transitionId: 'stocks-to-crypto-flat-failed',
      epoch: 12,
      state: 'RECOVERY_REQUIRED',
      recoveryRequired: true,
      freezeNewEntries: true,
      from: 'stocks',
      to: 'crypto',
      activeSession: 'stocks',
      safeModeReason: 'source position still open',
      lastEvent: 'SESSION_SOURCE_FLAT_FAILED'
    }));
  });

  test('nextEpoch advances from journal-only epochs after append-before-state crash', () => {
    const store = makeStore();
    store.appendEvent({
      transitionId: 'journal-only-transition',
      epoch: 17,
      event: 'SESSION_FREEZE_SOURCE',
      from: 'crypto',
      to: 'stocks'
    });

    expect(store.nextEpoch()).toBe(18);
  });

  test('broker intent record and commit are durable and duplicate-safe', () => {
    const store = makeStore();
    const details = {
      transitionId: 'crypto-to-stocks-1',
      epoch: 22,
      from: 'crypto',
      to: 'stocks',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      accountIdSource: 'config',
      executionMode: 'paper',
      action: 'subscribe_candles',
      symbol: 'TSLA',
      timeframe: '15m'
    };

    const recorded = store.recordBrokerIntent(details);
    const committed = store.commitBrokerIntent(recorded.intentId, details);
    const replay = store.recordBrokerIntent(details);
    const records = store.readBrokerIntents();

    expect(recorded).toEqual(expect.objectContaining({
      duplicate: false,
      committed: false,
      pending: false,
      failed: false
    }));
    expect(committed).toEqual(expect.objectContaining({
      duplicate: false,
      intentId: recorded.intentId
    }));
    expect(replay).toEqual(expect.objectContaining({
      duplicate: true,
      committed: true,
      pending: false,
      failed: false,
      intentId: recorded.intentId
    }));
    expect(records.map((record) => record.event)).toEqual([
      'BROKER_INTENT_RECORDED',
      'BROKER_INTENT_COMMITTED'
    ]);
    expect(records[0]).toEqual(expect.objectContaining({
      seq: 1,
      intentId: recorded.intentId,
      status: 'RECORDED',
      brokerId: 'alpaca',
      accountId: 'acct-main',
      executionMode: 'paper',
      action: 'subscribe_candles',
      symbol: 'TSLA',
      timeframe: '15m'
    }));
    expect(records[1]).toEqual(expect.objectContaining({
      seq: 2,
      intentId: recorded.intentId,
      status: 'COMMITTED'
    }));
  });

  test('broker intent replay fails closed when prior record was not committed', () => {
    const store = makeStore();
    const details = {
      transitionId: 'stocks-to-crypto-1',
      epoch: 23,
      from: 'stocks',
      to: 'crypto',
      brokerId: 'kraken',
      accountId: 'acct-main',
      accountIdSource: 'config',
      executionMode: 'paper',
      action: 'register_order_router',
      symbols: ['ETH-USD', 'BTC-USD'],
      timeframe: '1m'
    };

    const recorded = store.recordBrokerIntent(details);
    const replay = store.recordBrokerIntent({
      ...details,
      symbols: ['BTC-USD', 'ETH-USD']
    });

    expect(replay).toEqual(expect.objectContaining({
      duplicate: true,
      committed: false,
      pending: true,
      failed: false,
      intentId: recorded.intentId
    }));
    expect(store.readBrokerIntents()).toHaveLength(1);
  });

  test('broker intent identity includes session direction', () => {
    const store = makeStore();
    const shared = {
      transitionId: 'operator-retry-1',
      epoch: 25,
      brokerId: 'kraken',
      accountId: 'acct-main',
      accountIdSource: 'config',
      executionMode: 'paper',
      action: 'subscribe_candles',
      symbol: 'BTC-USD',
      timeframe: '1m'
    };

    const stocksToCrypto = store.recordBrokerIntent({
      ...shared,
      from: 'stocks',
      to: 'crypto'
    });
    const cryptoToStocks = store.recordBrokerIntent({
      ...shared,
      from: 'crypto',
      to: 'stocks'
    });

    expect(cryptoToStocks.intentId).not.toBe(stocksToCrypto.intentId);
    expect(store.readBrokerIntents()).toHaveLength(2);
  });

  test('broker intent requires explicit account scope and execution mode', () => {
    const store = makeStore();

    expect(() => store.recordBrokerIntent({
      transitionId: 'crypto-to-stocks-1',
      epoch: 24,
      from: 'crypto',
      to: 'stocks',
      brokerId: 'alpaca',
      action: 'subscribe_candles',
      symbol: 'TSLA',
      timeframe: '15m'
    })).toThrow('broker intent missing required field(s): accountId, executionMode');
  });
});
