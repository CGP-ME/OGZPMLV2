'use strict';

/**
 * AuthFailureGuard - Centralized broker auth-failure escalation.
 *
 * Tracks per-broker auth failures inside a sliding time window and trips
 * core/KillSwitch when a broker exceeds the configured failure threshold.
 *
 * Why: prior to 2026-06-09, the active Alpaca/Kraken broker route could
 * catch auth-related errors and either log-and-continue or return false.
 * core/KillSwitch was fully implemented but had zero broker auth callers,
 * so dead credentials caused the bot to retry indefinitely without
 * escalation.
 *
 * No defaults: config/trading.config.json must provide an authFailureGuard
 * block with thresholdCount and windowMs. Missing/invalid config throws
 * at module load. Per AGENTS.md "no silent failures / no defaults" rule.
 *
 * Known limitations (documented, not silent):
 *   - Wall-clock based window. A system-time jump >windowMs forward will
 *     drop all prior timestamps; a backward jump can make old timestamps
 *     look recent. Acceptable because (a) NTP-managed servers don't jump
 *     by 5+ minutes in normal operation and (b) the kill is recoverable
 *     by deleting the flag file. Monotonic-clock migration is separate
 *     scope.
 *   - In-memory failure map. On process restart, the per-broker counter
 *     resets to empty. KillSwitch.flag persists on disk, so a prior kill
 *     state survives the restart. The post-restart counter starting fresh
 *     means a broker that was at threshold-1 pre-restart starts at 1 post-
 *     restart - at worst, one extra failure cycle of grace before re-kill.
 *     Acceptable because dead credentials produce continuous failures
 *     anyway and the kill state itself survives.
 *   - Per-broker isolation. Each broker has its own counter; failures
 *     across two brokers are not aggregated. Intentional - one broker
 *     dying should not necessarily kill the other. Edge case: if alpaca
 *     and kraken each take 2 failures within the window (4 total, neither
 *     hits threshold individually), no kill fires even though the bot is
 *     degraded on both venues. In practice each broker's recurring
 *     credential failure hits its own threshold within seconds, so the
 *     gap is transient.
 */

const fs = require('fs');
const path = require('path');
const killSwitch = require('./KillSwitch');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'trading.config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`AuthFailureGuard: missing config file at ${CONFIG_PATH}`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`AuthFailureGuard: invalid JSON at ${CONFIG_PATH}: ${err.message}`);
  }
  const block = raw.authFailureGuard;
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    throw new Error(`AuthFailureGuard: missing authFailureGuard block in ${CONFIG_PATH}`);
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
   * thresholdCount failures within windowMs, trips core/KillSwitch.
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
      killSwitch.enableKillSwitch(reason);
    }
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
