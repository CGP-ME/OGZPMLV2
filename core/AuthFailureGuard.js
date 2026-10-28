'use strict';

/**
 * AuthFailureGuard - Centralized broker auth-failure escalation.
 *
 * Tracks per-broker auth failures inside a sliding time window. A threshold
 * breach emits a max-priority trace alarm. The failed broker operation remains
 * responsible for returning its own error to its caller.
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
 *     resets to empty. The guard is observability only and never persists a
 *     trading control.
 *   - Per-broker isolation. Each broker has its own counter; failures
 *     across two brokers are not aggregated. If alpaca and kraken each stay
 *     below their threshold within the window, neither emits its threshold
 *     alarm even though both venues are degraded. A threshold alarm never
 *     changes trading state.
 */

const ConfigLoader = require('../foundation/ConfigLoader');
const { createTraceId, emitTrace } = require('./TraceSpine');

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
  constructor() {
    this.config = loadConfig();
    this.failuresByBroker = new Map();
  }

  /**
   * Record an auth failure for a broker. If the broker exceeds
   * thresholdCount failures within windowMs, emits a threshold alarm.
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
      : `: ${(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, ConfigLoader.getInternalsFileValue('broker.authDiagnostics.detailMaxChars'))}`;
    console.error(
      `[AuthFailureGuard] ${broker} ${kind} failure ${fresh.length}/${this.config.thresholdCount} within ${this.config.windowMs}ms${detailStr}`
    );

    if (fresh.length >= this.config.thresholdCount) {
      const reason = `${broker} auth-failure threshold breached (${fresh.length} failures of kind '${kind}' within ${this.config.windowMs}ms)`;
      emitTrace({}, 'BROKER_AUTH_FAILURE_THRESHOLD_ALARM', {
        traceId: createTraceId('broker_auth_failure'),
        broker,
        brokerId: broker,
        kind,
        count: fresh.length,
        windowMs: this.config.windowMs,
        evidence: detail.evidence,
        reason,
        manualReconciliationRequired: true,
        tradingAction: 'none',
      });
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
