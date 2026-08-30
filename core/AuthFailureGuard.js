'use strict';

/**
 * AuthFailureGuard - Centralized broker auth-failure escalation.
 *
 * Tracks per-broker auth failures inside a sliding time window. A threshold
 * breach quarantines that broker session, flattens its tracked positions
 * through the live execution path, and emits a max-priority trace alarm.
 *
 * Why: prior to 2026-06-09, the active Alpaca/Kraken broker route could
 * catch auth-related errors and either log-and-continue or return false.
 * dead credentials otherwise caused the bot to retry indefinitely without
 * broker-scoped escalation.
 *
 * No defaults: ConfigLoader must provide an authFailureGuard block with
 * thresholdCount and windowMs. Missing/invalid config throws at module load.
 * Per AGENTS.md "no silent failures / no defaults" rule.
 *
 * Known limitations (documented, not silent):
 *   - Wall-clock based window. A system-time jump >windowMs forward will
 *     drop all prior timestamps; a backward jump can make old timestamps
 *     look recent. Acceptable because NTP-managed servers do not normally
 *     jump by 5+ minutes. Monotonic-clock migration is separate scope.
 *   - In-memory failure map. On process restart, the per-broker counter
 *     resets to empty. Broker quarantine flags persist on disk and are read
 *     by the entry choke point, so an existing quarantine survives restart.
 *   - Per-broker isolation. Each broker has its own counter; failures
 *     across two brokers are not aggregated. Intentional - one broker
 *     dying must not quarantine the other. Edge case: if alpaca
 *     and kraken each take 2 failures within the window (4 total, neither
 *     hits threshold individually), no quarantine fires even though the bot is
 *     degraded on both venues. In practice each broker's recurring
 *     credential failure hits its own threshold within seconds, so the
 *     gap is transient.
 */

const fs = require('fs');
const path = require('path');
const ConfigLoader = require('../foundation/ConfigLoader');
const { writeJsonCompactAtomic } = require('./AtomicWrite');
const { createTraceId, emitTrace } = require('./TraceSpine');

const DEFAULT_QUARANTINE_DIR = path.join(__dirname, '..');
const QUARANTINE_CODE = 'broker_auth_quarantined';

function loadConfig() {
  const block = ConfigLoader.get('authFailureGuard');
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new Error('AuthFailureGuard: missing authFailureGuard block in ConfigLoader');
  }
  const allowedKeys = new Set(['thresholdCount', 'windowMs']);
  const unexpectedKeys = Object.keys(block).filter((key) => !allowedKeys.has(key));
  if (unexpectedKeys.length > 0) {
    throw new Error(`AuthFailureGuard: unexpected authFailureGuard config key(s): ${unexpectedKeys.join(', ')}`);
  }
  const { thresholdCount, windowMs } = block;
  if (!Number.isInteger(thresholdCount) || thresholdCount < 1) {
    throw new Error(`AuthFailureGuard: authFailureGuard.thresholdCount must be a positive integer (got ${thresholdCount})`);
  }
  if (!Number.isInteger(windowMs) || windowMs < 1000) {
    throw new Error(`AuthFailureGuard: authFailureGuard.windowMs must be an integer >= 1000 ms (got ${windowMs})`);
  }
  return { thresholdCount, windowMs };
}

class AuthFailureGuard {
  constructor({ quarantineDir = DEFAULT_QUARANTINE_DIR } = {}) {
    this.config = loadConfig();
    this.failuresByBroker = new Map();
    this.quarantineDir = quarantineDir;
    this.stateManager = null;
    this.executeTrade = null;
  }

  wireRuntime({ stateManager = null, executeTrade = null } = {}) {
    this.stateManager = stateManager;
    this.executeTrade = typeof executeTrade === 'function' ? executeTrade : null;
    return this;
  }

  _quarantinePath(broker) {
    const safeBroker = broker.replace(/[^a-z0-9_-]/g, '_');
    return path.join(this.quarantineDir, `.broker-auth-quarantine-${safeBroker}.flag`);
  }

  _readQuarantine(broker) {
    const flagPath = this._quarantinePath(broker);
    if (!fs.existsSync(flagPath)) return null;
    try {
      const record = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
      if (record && record.broker === broker && record.code === QUARANTINE_CODE) {
        return record;
      }
    } catch (_error) {
      // An unreadable standing flag remains entry-blocking until the operator
      // clears or repairs it; persistence damage must not reopen the venue.
    }
    return {
      broker,
      code: QUARANTINE_CODE,
      quarantinedAt: null,
      reason: 'broker auth quarantine flag unreadable; operator clear required',
      persistenceUnreadable: true,
    };
  }

  getEntryBlock(broker) {
    const key = typeof broker === 'string' ? broker.trim().toLowerCase() : '';
    if (!key) return { blocked: false };
    const quarantine = this._readQuarantine(key);
    if (!quarantine) return { blocked: false };
    return {
      blocked: true,
      code: QUARANTINE_CODE,
      reason: `[BROKER_AUTH_QUARANTINED] ${key}: ${quarantine.reason || 'operator clear required'}`,
      brokerId: key,
      entryBlockScope: 'broker',
      quarantinedAt: quarantine.quarantinedAt || null,
      persistenceUnreadable: quarantine.persistenceUnreadable === true,
    };
  }

  _persistQuarantine(broker, kind, fresh, detail) {
    const existing = this._readQuarantine(broker);
    if (existing) return { record: existing, created: false };
    const record = {
      broker,
      code: QUARANTINE_CODE,
      quarantinedAt: new Date().toISOString(),
      reason: `${broker} auth-failure threshold breached`,
      kind,
      count: fresh.length,
      windowMs: this.config.windowMs,
      evidence: detail.evidence,
      operatorClearRequired: true,
    };
    writeJsonCompactAtomic(this._quarantinePath(broker), record);
    return { record, created: true };
  }

  _activeTradesForBroker(broker) {
    const activeTrades = this.stateManager?.state?.activeTrades;
    if (!(activeTrades instanceof Map)) return [];
    return Array.from(activeTrades.entries()).filter(([, trade]) => {
      const tradeBroker = String(trade?.brokerId || trade?.broker || trade?.brokerName || '').trim().toLowerCase();
      return tradeBroker === broker;
    });
  }

  _closeAction(trade) {
    const action = String(trade?.action || '').trim().toUpperCase();
    const direction = String(trade?.direction || '').trim().toLowerCase();
    if ((action === 'BUY' || !action) && direction === 'long') return 'SELL';
    if ((action === 'SELL_SHORT' || !action) && direction === 'short') return 'COVER';
    if (action === 'BUY' && !direction) return 'SELL';
    if (action === 'SELL_SHORT' && !direction) return 'COVER';
    return null;
  }

  async _flattenBrokerTrades(broker, alarm) {
    const trades = this._activeTradesForBroker(broker);
    const results = [];
    for (const [mapId, trade] of trades) {
      const tradeId = trade?.tradeId || trade?.orderId || trade?.id || mapId;
      const symbol = trade?.symbol;
      const action = this._closeAction(trade);
      const price = Number(symbol && this.stateManager?.getLastPrice?.(symbol));
      if (!this.executeTrade || !symbol || !action || !Number.isFinite(price) || price <= 0) {
        results.push({ tradeId, symbol: symbol || null, success: false, reason: 'tracked_position_not_flattenable' });
        continue;
      }
      try {
        const result = await this.executeTrade(
          { action, confidence: 100, tradeId, exitReason: 'broker_auth_quarantine' },
          { totalConfidence: 100 },
          price,
          {},
          [],
          null,
          null,
          symbol
        );
        results.push({ tradeId, symbol, success: result?.success === true, reason: result?.reason || null });
      } catch (error) {
        results.push({ tradeId, symbol, success: false, reason: error?.message || String(error) });
      }
    }
    const failures = results.filter((result) => result.success !== true);
    emitTrace({}, 'BROKER_AUTH_QUARANTINE_FLATTEN_ALARM', {
      ...alarm,
      reason: failures.length === 0
        ? `${broker} tracked positions flattened after auth quarantine`
        : `${broker} auth quarantine flatten incomplete; operator reconciliation required`,
      attempted: results.length,
      flattened: results.length - failures.length,
      failed: failures.length,
      failures,
      manualReconciliationRequired: failures.length > 0,
    });
    return { results, failures };
  }

  /**
   * Record an auth failure for a broker. If the broker exceeds
   * thresholdCount failures within windowMs, quarantines that broker.
   *
   * @param {string} broker - e.g. 'alpaca', 'kraken'
   * @param {string} kind   - e.g. 'rest-auth', 'ws-auth', 'rest-token'
   * @param {*}      detail - optional context (object or string)
   */
  recordFailure(broker, kind, detail = null) {
    if (typeof broker !== 'string' || broker.trim() === '') {
      throw new Error('AuthFailureGuard.recordFailure: broker must be a non-empty string');
    }
    if (typeof kind !== 'string' || kind.trim() === '') {
      throw new Error('AuthFailureGuard.recordFailure: kind must be a non-empty string');
    }
    if (!detail || typeof detail !== 'object' || Array.isArray(detail) || detail.authFailure !== true || typeof detail.evidence !== 'string' || detail.evidence.trim() === '') {
      throw new Error('AuthFailureGuard.recordFailure: detail must include authFailure=true and non-empty evidence');
    }

    // Normalize broker key to lowercase so callers can't fragment the
    // counter by passing different cases (e.g. 'alpaca' vs 'Alpaca').
    broker = broker.trim().toLowerCase();

    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const prior = this.failuresByBroker.get(broker) || [];
    const fresh = prior.filter((t) => t >= cutoff);
    fresh.push(now);
    this.failuresByBroker.set(broker, fresh);

    const detailStr = detail == null
      ? ''
      : `: ${(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 200)}`;
    console.error(
      `[AuthFailureGuard] ${broker} ${kind} failure ${fresh.length}/${this.config.thresholdCount} within ${this.config.windowMs}ms${detailStr}`
    );

    if (fresh.length >= this.config.thresholdCount) {
      const reason = `${broker} auth-failure threshold breached (${fresh.length} failures of kind '${kind}' within ${this.config.windowMs}ms)`;
      const persistence = this._persistQuarantine(broker, kind, fresh, detail);
      const alarm = {
        traceId: createTraceId('broker_auth_quarantine'),
        broker,
        brokerId: broker,
        kind,
        count: fresh.length,
        windowMs: this.config.windowMs,
        evidence: detail.evidence,
        reason,
        code: QUARANTINE_CODE,
        entryBlocking: true,
        operatorClearRequired: true,
        quarantinedAt: persistence.record.quarantinedAt || null,
      };
      emitTrace({}, 'BROKER_AUTH_QUARANTINE_ALARM', alarm);
      if (persistence.created) {
        return this._flattenBrokerTrades(broker, alarm);
      }
    }
    return undefined;
  }

  /**
   * Return current state for a broker. Used by tests and observability.
   */
  getState(broker) {
    const key = typeof broker === 'string' ? broker.trim().toLowerCase() : broker;
    return {
      failures: (this.failuresByBroker.get(key) || []).slice(),
      thresholdCount: this.config.thresholdCount,
      windowMs: this.config.windowMs,
    };
  }
}

const authFailureGuard = new AuthFailureGuard();
module.exports = authFailureGuard;
module.exports.AuthFailureGuard = AuthFailureGuard;
