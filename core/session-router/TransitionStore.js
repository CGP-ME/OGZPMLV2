'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeJsonAtomic } = require('../AtomicWrite');

const DEFAULT_STALE_LOCK_MS = 120000;
const TRANSITION_EVENT_STATES = {
  SESSION_TRANSITION_PLANNED: { state: 'PLANNED', freezeNewEntries: true },
  SESSION_FREEZE_SOURCE: { state: 'FREEZING_SOURCE', freezeNewEntries: true },
  SESSION_BROKER_RECONCILED: { state: 'BROKER_RECONCILED', freezeNewEntries: true },
  SESSION_BROKER_RECONCILE_FAILED: { state: 'RECOVERY_REQUIRED', freezeNewEntries: true },
  SESSION_PATTERN_MEMORY_HANDOFF: { state: 'PATTERN_MEMORY_HANDOFF', freezeNewEntries: true },
  SESSION_ORDER_INTENT_RECORDED: { state: 'ORDER_INTENT_RECORDED', freezeNewEntries: true },
  SESSION_SOURCE_FLAT_FAILED: { state: 'RECOVERY_REQUIRED', freezeNewEntries: true },
  SESSION_TARGET_ACTIVATED: { state: 'TARGET_ACTIVATED', freezeNewEntries: false },
  SESSION_FAILED_SAFE: { state: 'RECOVERY_REQUIRED', freezeNewEntries: true },
  RECOVERY_REQUIRED: { state: 'RECOVERY_REQUIRED', freezeNewEntries: true }
};

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, data: null, error: null };
  }

  try {
    return {
      exists: true,
      data: JSON.parse(fs.readFileSync(filePath, 'utf8')),
      error: null
    };
  } catch (err) {
    return { exists: true, data: null, error: err };
  }
}

function parseTimestamp(value) {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

class TransitionStore {
  constructor(options = {}) {
    this.dir = options.dir || path.join(process.cwd(), 'data', 'session-router');
    this.clock = options.clock || (() => Date.now());
    this.ownerId = options.ownerId || `pid:${process.pid}`;
    this.staleLockMs = Number.isFinite(options.staleLockMs)
      ? options.staleLockMs
      : DEFAULT_STALE_LOCK_MS;

    this.statePath = path.join(this.dir, 'transition-state.json');
    this.lockPath = path.join(this.dir, 'transition-lock.json');
    this.eventsPath = path.join(this.dir, 'transition-events.jsonl');
    this.brokerIntentsPath = path.join(this.dir, 'broker-intents.jsonl');
  }

  _nowMs() {
    const value = this.clock();
    if (value instanceof Date) return value.getTime();
    return Number(value);
  }

  _nowIso() {
    return new Date(this._nowMs()).toISOString();
  }

  _ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  _readStateRaw() {
    return readJsonIfPresent(this.statePath);
  }

  _readLockRaw() {
    return readJsonIfPresent(this.lockPath);
  }

  _isLockStale(lock) {
    if (!lock || !lock.heartbeatAt) return true;
    const heartbeatMs = parseTimestamp(lock.heartbeatAt);
    if (heartbeatMs === null) return true;
    return this._nowMs() - heartbeatMs > this.staleLockMs;
  }

  _maxEpochFromFiles() {
    const epochs = [0];
    const state = this._readStateRaw();
    const lock = this._readLockRaw();
    const events = this.readEvents();

    if (state.data && Number.isFinite(Number(state.data.epoch))) {
      epochs.push(Number(state.data.epoch));
    }
    if (lock.data && Number.isFinite(Number(lock.data.epoch))) {
      epochs.push(Number(lock.data.epoch));
    }
    for (const event of events) {
      if (!event.corrupt && Number.isFinite(Number(event.epoch))) {
        epochs.push(Number(event.epoch));
      }
    }

    return Math.max(...epochs);
  }

  nextEpoch() {
    return this._maxEpochFromFiles() + 1;
  }

  writeState(update = {}) {
    this._ensureDir();
    const prior = this._readStateRaw();
    const priorState = prior.data && typeof prior.data === 'object' ? prior.data : {};
    const state = {
      ...priorState,
      ...update,
      epoch: Number.isFinite(Number(update.epoch))
        ? Number(update.epoch)
        : Number(priorState.epoch || 0),
      updatedAt: update.updatedAt || this._nowIso()
    };

    writeJsonAtomic(this.statePath, state);
    return state;
  }

  readEvents() {
    if (!fs.existsSync(this.eventsPath)) return [];
    const text = fs.readFileSync(this.eventsPath, 'utf8').trim();
    if (!text) return [];

    return text.split('\n').map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return {
          seq: index + 1,
          event: 'CORRUPT_EVENT_LINE',
          corrupt: true,
          error: err.message,
          raw: line
        };
      }
    });
  }

  appendEvent(event = {}) {
    this._ensureDir();
    const events = this.readEvents();
    const seq = events.length + 1;
    const record = {
      seq,
      epoch: Number.isFinite(Number(event.epoch)) ? Number(event.epoch) : this._maxEpochFromFiles(),
      event: event.event || 'TRANSITION_EVENT',
      at: event.at || this._nowIso(),
      ...event,
      seq
    };

    fs.appendFileSync(this.eventsPath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  readBrokerIntents() {
    if (!fs.existsSync(this.brokerIntentsPath)) return [];
    const text = fs.readFileSync(this.brokerIntentsPath, 'utf8').trim();
    if (!text) return [];

    return text.split('\n').map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return {
          seq: index + 1,
          event: 'CORRUPT_BROKER_INTENT_LINE',
          corrupt: true,
          error: err.message,
          raw: line
        };
      }
    });
  }

  _assertBrokerIntentsReadable(records) {
    const corrupt = records.find((record) => record.corrupt);
    if (corrupt) {
      throw new Error(`corrupt broker-intents.jsonl line ${corrupt.seq}: ${corrupt.error}`);
    }
  }

  _brokerIntentIdentity(details = {}) {
    return {
      transitionId: details.transitionId || null,
      epoch: Number.isFinite(Number(details.epoch)) ? Number(details.epoch) : null,
      from: details.from || null,
      to: details.to || null,
      brokerId: details.brokerId || null,
      accountId: details.accountId || null,
      executionMode: details.executionMode || null,
      action: details.action || null,
      symbol: details.symbol || null,
      timeframe: details.timeframe || null,
      symbols: Array.isArray(details.symbols) ? [...details.symbols].sort() : null
    };
  }

  buildBrokerIntentId(details = {}) {
    const identity = this._brokerIntentIdentity(details);
    const missing = [];
    for (const field of ['transitionId', 'epoch', 'from', 'to', 'brokerId', 'accountId', 'executionMode', 'action']) {
      if (identity[field] === null || identity[field] === '') missing.push(field);
    }
    if (missing.length > 0) {
      throw new Error(`broker intent missing required field(s): ${missing.join(', ')}`);
    }

    const hash = crypto
      .createHash('sha256')
      .update(stableStringify(identity))
      .digest('hex')
      .slice(0, 16);
    return `sr-${identity.epoch}-${hash}`;
  }

  _appendBrokerIntentRecord(record = {}) {
    this._ensureDir();
    const records = this.readBrokerIntents();
    this._assertBrokerIntentsReadable(records);
    const seq = records.length + 1;
    const persisted = {
      seq,
      at: record.at || this._nowIso(),
      ...record,
      seq
    };

    fs.appendFileSync(this.brokerIntentsPath, `${JSON.stringify(persisted)}\n`, 'utf8');
    return persisted;
  }

  _latestBrokerIntent(intentId) {
    const records = this.readBrokerIntents();
    this._assertBrokerIntentsReadable(records);
    return records.filter((record) => record.intentId === intentId).pop() || null;
  }

  recordBrokerIntent(details = {}) {
    const intentId = details.intentId || this.buildBrokerIntentId(details);
    const latest = this._latestBrokerIntent(intentId);
    if (latest) {
      return {
        intentId,
        duplicate: true,
        latest,
        committed: latest.status === 'COMMITTED',
        pending: latest.status === 'RECORDED',
        failed: latest.status === 'FAILED'
      };
    }

    const record = this._appendBrokerIntentRecord({
      ...details,
      intentId,
      event: 'BROKER_INTENT_RECORDED',
      status: 'RECORDED'
    });

    return {
      intentId,
      duplicate: false,
      record,
      committed: false,
      pending: false,
      failed: false
    };
  }

  commitBrokerIntent(intentId, details = {}) {
    if (!intentId) {
      throw new Error('broker intent commit missing intentId');
    }
    const latest = this._latestBrokerIntent(intentId);
    if (!latest) {
      throw new Error(`broker intent ${intentId} cannot commit before record`);
    }
    if (latest.status === 'COMMITTED') {
      return {
        intentId,
        duplicate: true,
        record: latest
      };
    }
    if (latest.status !== 'RECORDED') {
      throw new Error(`broker intent ${intentId} cannot commit from status ${latest.status || '(missing)'}`);
    }

    const record = this._appendBrokerIntentRecord({
      ...details,
      intentId,
      event: 'BROKER_INTENT_COMMITTED',
      status: 'COMMITTED'
    });

    return {
      intentId,
      duplicate: false,
      record
    };
  }

  failBrokerIntent(intentId, reason, details = {}) {
    if (!intentId) {
      throw new Error('broker intent failure missing intentId');
    }
    return this._appendBrokerIntentRecord({
      ...details,
      intentId,
      event: 'BROKER_INTENT_FAILED',
      status: 'FAILED',
      reason: reason || 'unknown broker intent failure'
    });
  }

  _eventState(eventName) {
    return TRANSITION_EVENT_STATES[eventName] || {
      state: 'TRANSITION_EVENT',
      freezeNewEntries: true
    };
  }

  _statusFromEvent(event, eventsCount, lock = null) {
    const eventState = this._eventState(event.event);
    const epoch = Number.isFinite(Number(event.epoch)) ? Number(event.epoch) : 0;
    const state = {
      transitionId: event.transitionId || null,
      epoch,
      state: eventState.state,
      recoveryRequired: eventState.state === 'RECOVERY_REQUIRED',
      freezeNewEntries: eventState.freezeNewEntries,
      from: event.from || null,
      to: event.to || null,
      activeSession: event.activeSession || null,
      brokerId: event.brokerId || null,
      symbols: Array.isArray(event.symbols) ? event.symbols : [],
      timeframe: event.timeframe || null,
      runtimeScope: event.runtimeScope && typeof event.runtimeScope === 'object'
        ? { ...event.runtimeScope }
        : null,
      runtimeScopeStatus: event.runtimeScopeStatus || event.runtimeScope?.runtimeScopeStatus || null,
      scopeComplete: event.scopeComplete === true || event.runtimeScope?.scopeComplete === true,
      safeModeReason: event.reason || event.safeModeReason || null,
      lastEvent: event.event,
      lastEventAt: event.at || null,
      lastEventSeq: event.seq || null,
      lock,
      eventsCount
    };

    return state;
  }

  _projectFromEvents(events, lock = null) {
    if (!events.length) return null;
    const corrupt = events.find((event) => event.corrupt);
    if (corrupt) {
      return {
        state: 'RECOVERY_REQUIRED',
        recoveryRequired: true,
        transitionId: null,
        epoch: this._maxEpochFromFiles(),
        freezeNewEntries: true,
        safeModeReason: `corrupt transition event line ${corrupt.seq}: ${corrupt.error}`,
        lock,
        eventsCount: events.length
      };
    }

    return this._statusFromEvent(events[events.length - 1], events.length, lock);
  }

  recordTransitionEvent(eventName, details = {}) {
    const at = details.at || this._nowIso();
    const epoch = Number.isFinite(Number(details.epoch))
      ? Number(details.epoch)
      : this.nextEpoch();
    const transitionId = details.transitionId || `transition-${at}`;
    const record = this.appendEvent({
      ...details,
      event: eventName,
      transitionId,
      epoch,
      at
    });
    const projected = this._statusFromEvent(record, this.readEvents().length);

    return this.writeState({
      ...projected,
      recoveryRequired: undefined,
      lock: undefined,
      eventsCount: undefined
    });
  }

  markRecoveryRequired(reason, details = {}) {
    const epoch = Number.isFinite(Number(details.epoch))
      ? Number(details.epoch)
      : this._maxEpochFromFiles();
    const state = this.writeState({
      transitionId: details.transitionId || null,
      epoch,
      state: 'RECOVERY_REQUIRED',
      freezeNewEntries: true,
      safeModeReason: reason
    });

    this.appendEvent({
      epoch,
      event: 'RECOVERY_REQUIRED',
      reason,
      transitionId: state.transitionId
    });

    return state;
  }

  acquireLock(details = {}) {
    this._ensureDir();
    const state = this._readStateRaw();
    if (state.error) {
      const recoveryState = this.markRecoveryRequired(
        `corrupt transition-state.json: ${state.error.message}`,
        details
      );
      return {
        success: false,
        recoveryRequired: true,
        state: recoveryState,
        error: recoveryState.safeModeReason
      };
    }
    if (state.data && state.data.state === 'RECOVERY_REQUIRED') {
      return {
        success: false,
        recoveryRequired: true,
        state: state.data,
        error: state.data.safeModeReason || 'transition recovery required'
      };
    }

    const lock = this._readLockRaw();
    if (lock.error) {
      const recoveryState = this.markRecoveryRequired(
        `corrupt transition-lock.json: ${lock.error.message}`,
        details
      );
      return {
        success: false,
        recoveryRequired: true,
        state: recoveryState,
        error: recoveryState.safeModeReason
      };
    }

    if (lock.data) {
      if (this._isLockStale(lock.data)) {
        const recoveryState = this.markRecoveryRequired('stale transition lock present', {
          ...details,
          epoch: lock.data.epoch
        });
        return {
          success: false,
          recoveryRequired: true,
          staleLock: true,
          lock: lock.data,
          state: recoveryState,
          error: recoveryState.safeModeReason
        };
      }

      return {
        success: false,
        recoveryRequired: false,
        lock: lock.data,
        error: 'fresh transition lock already held'
      };
    }

    const epoch = Number.isFinite(Number(details.epoch)) ? Number(details.epoch) : this.nextEpoch();
    const transitionId = details.transitionId || `transition-${this._nowIso()}`;
    const record = {
      transitionId,
      epoch,
      ownerId: details.ownerId || this.ownerId,
      acquiredAt: this._nowIso(),
      heartbeatAt: this._nowIso()
    };

    writeJsonAtomic(this.lockPath, record);
    return { success: true, lock: record };
  }

  releaseLock(expected = {}) {
    const lock = this._readLockRaw();
    if (lock.error) {
      const recoveryState = this.markRecoveryRequired(
        `corrupt transition-lock.json: ${lock.error.message}`,
        expected
      );
      return {
        released: false,
        recoveryRequired: true,
        state: recoveryState,
        error: recoveryState.safeModeReason
      };
    }
    if (!lock.data) {
      return {
        released: false,
        notFound: true,
        error: 'transition lock not found'
      };
    }

    if (expected.transitionId && lock.data.transitionId !== expected.transitionId) {
      return {
        released: false,
        lock: lock.data,
        error: `transition lock owner mismatch: expected ${expected.transitionId}, found ${lock.data.transitionId || '(missing)'}`
      };
    }
    if (Number.isFinite(Number(expected.epoch)) && Number(lock.data.epoch) !== Number(expected.epoch)) {
      return {
        released: false,
        lock: lock.data,
        error: `transition lock epoch mismatch: expected ${Number(expected.epoch)}, found ${Number(lock.data.epoch)}`
      };
    }

    fs.unlinkSync(this.lockPath);
    return {
      released: true,
      lock: lock.data
    };
  }

  readStatus() {
    const events = this.readEvents();
    const state = this._readStateRaw();
    if (state.error) {
      return {
        state: 'RECOVERY_REQUIRED',
        recoveryRequired: true,
        transitionId: null,
        epoch: this._maxEpochFromFiles(),
        freezeNewEntries: true,
        safeModeReason: `corrupt transition-state.json: ${state.error.message}`,
        eventsCount: events.length
      };
    }

    const lock = this._readLockRaw();
    if (lock.error) {
      return {
        state: 'RECOVERY_REQUIRED',
        recoveryRequired: true,
        transitionId: state.data?.transitionId || null,
        epoch: this._maxEpochFromFiles(),
        freezeNewEntries: true,
        safeModeReason: `corrupt transition-lock.json: ${lock.error.message}`,
        eventsCount: events.length
      };
    }

    const eventProjection = this._projectFromEvents(events, lock.data || null);
    if (eventProjection && eventProjection.recoveryRequired && eventProjection.safeModeReason?.startsWith('corrupt transition event')) {
      return eventProjection;
    }

    if (lock.data && this._isLockStale(lock.data)) {
      return {
        ...(state.data || {}),
        state: 'RECOVERY_REQUIRED',
        recoveryRequired: true,
        transitionId: state.data?.transitionId || lock.data.transitionId || null,
        epoch: this._maxEpochFromFiles(),
        freezeNewEntries: true,
        lock: lock.data,
        safeModeReason: 'stale transition lock present',
        eventsCount: events.length
      };
    }

    if (!state.data) {
      return eventProjection || {
        state: 'IDLE',
        recoveryRequired: false,
        transitionId: null,
        epoch: this._maxEpochFromFiles(),
        freezeNewEntries: false,
        lock: lock.data || null,
        eventsCount: events.length
      };
    }

    if (eventProjection && Number(eventProjection.lastEventSeq || 0) > Number(state.data.lastEventSeq || 0)) {
      return eventProjection;
    }

    return {
      ...state.data,
      recoveryRequired: state.data.state === 'RECOVERY_REQUIRED',
      lock: lock.data || null,
      eventsCount: events.length
    };
  }
}

module.exports = TransitionStore;
module.exports.DEFAULT_STALE_LOCK_MS = DEFAULT_STALE_LOCK_MS;
