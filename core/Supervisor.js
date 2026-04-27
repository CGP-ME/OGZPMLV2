/**
 * Supervisor.js — system-wide health overseer
 * ============================================
 *
 * The piece that watches everything else. Polls every registered subsystem's
 * getHealth() endpoint, runs a state machine per subsystem, takes graduated
 * action at each transition.
 *
 * State machine per subsystem:
 *
 *   HEALTHY ──[red gauge]──> DEGRADED ──[red >degradeMs]──> UNHEALTHY ──[heal fails N×]──> DEAD
 *      ▲           │              │                              │                              │
 *      └──[green]──┴──[green]─────┴──[green]─────────────────────┴──[restart succeeds]──────────┘
 *
 * Actions per transition:
 *
 *   HEALTHY → DEGRADED        log only
 *   DEGRADED → UNHEALTHY      log + try self-heal (subsystem-supplied healer)
 *   UNHEALTHY → DEAD          log + alert (SMS hook) + escalate (PM2 restart)
 *   any → HEALTHY (recovery)  log + clear alert
 *
 * Each transition writes a JSONL entry to data/supervisor-ledger.jsonl
 * for postmortem reconstruction.
 *
 * Spec: ogz-meta/specs/resilience-and-supervision.md (Layer 2)
 *
 * Subsystems implement a tiny contract:
 *
 *   {
 *     name: 'alpaca-ws',
 *     getHealth: async () => ({
 *       status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'DEAD',
 *       timestamp: 1777182718702,
 *       details: { ...subsystem-specific... },
 *       lastSuccessAt: 1777182700000,
 *       failureReason: null | string,
 *     }),
 *     selfHeal: async () => true | false,    // optional
 *     escalate: async () => true | false,    // optional (e.g., PM2 restart)
 *   }
 *
 * @date 2026-04-26
 */

'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const STATES = Object.freeze({
  HEALTHY:   'HEALTHY',
  DEGRADED:  'DEGRADED',
  UNHEALTHY: 'UNHEALTHY',
  DEAD:      'DEAD',
});

const DEFAULTS = Object.freeze({
  pollIntervalMs:        30_000,        // poll every 30s
  degradeThresholdMs:    120_000,       // red >2min → UNHEALTHY
  unhealthyHealAttempts: 3,             // heal tries before DEAD
  healCooldownMs:        30_000,        // min gap between heal attempts
  deadCooldownMs:        300_000,       // min gap between escalations (no restart loop)
  maxRestartsIn10min:    5,             // restart loop guard
  // Mercury Audit B1 fix (2026-04-27): per-subsystem getHealth() timeout.
  // A hung subsystem getHealth() previously could stall the entire polling
  // loop (audit Task 3, severity HIGH). Promise.race wraps each call.
  healthTimeoutMs:       5_000,
  ledgerPath:            'data/supervisor-ledger.jsonl',
  // Heartbeat to external deadman switch — Layer B of the watching-the-watcher
  // defense. URL set via env. If unset, deadman heartbeat is a no-op.
  deadmanHeartbeatUrl:   null,
  deadmanHeartbeatMs:    60_000,
});

/**
 * Valid status set, used by _pollOne to validate / normalize subsystem
 * payloads. Mercury Audit B1 (2026-04-27) found that the supervisor
 * blindly trusted any string returned in health.status — `'INVALID'`
 * was treated as red, `'healthy'` (lowercase) was treated as red,
 * and `{status:HEALTHY, failureReason:'broken'}` was trusted as healthy
 * despite the contradiction. This set + the validation in _pollOne
 * close all three holes.
 */
const VALID_STATES = new Set(['HEALTHY', 'DEGRADED', 'UNHEALTHY', 'DEAD']);

class Supervisor extends EventEmitter {
  /**
   * @param {Object} [config]
   * @param {string} [config.label] — log prefix
   * @param {Object} [config.options] — overrides for DEFAULTS
   * @param {(subsys, transition) => void} [config.onAlert] — SMS/email hook.
   *   transition is { from, to, subsystem, reason, timestamp }.
   * @param {() => number} [config.clock] — time injection for tests
   */
  constructor(config = {}) {
    super();
    const opts = Object.assign({}, DEFAULTS, config.options || {});

    this.label = config.label || '[Supervisor]';
    this.clock = config.clock || (() => Date.now());
    this.onAlert = config.onAlert || null;

    this.pollIntervalMs        = opts.pollIntervalMs;
    this.degradeThresholdMs    = opts.degradeThresholdMs;
    this.unhealthyHealAttempts = opts.unhealthyHealAttempts;
    this.healCooldownMs        = opts.healCooldownMs;
    this.deadCooldownMs        = opts.deadCooldownMs;
    this.maxRestartsIn10min    = opts.maxRestartsIn10min;
    this.healthTimeoutMs       = opts.healthTimeoutMs;
    this.ledgerPath            = path.resolve(opts.ledgerPath);
    this.deadmanHeartbeatUrl   = opts.deadmanHeartbeatUrl;
    this.deadmanHeartbeatMs    = opts.deadmanHeartbeatMs;

    this.subsystems = new Map();   // name -> { def, state, lastRedAt, healAttempts, lastHealAt, lastEscalateAt, restartHistory }
    this.started = false;
    this.pollTimer = null;
    this.deadmanTimer = null;
    // Mercury Audit B1 fix: prevent overlapping _pollAll runs (severity
    // MEDIUM). setInterval doesn't await async callbacks, so a slow poll
    // could overlap with the next tick. Guard flag clears on poll
    // completion. Combined with parallel-polling fix, the worst case is
    // "a poll that takes longer than pollIntervalMs", in which case we
    // skip the overlapping tick rather than running two concurrently.
    this._pollInFlight = false;

    this._ensureLedgerDir();
  }

  /**
   * Register a subsystem to monitor.
   * @param {Object} def — subsystem definition (see file header)
   */
  register(def) {
    if (!def || !def.name || typeof def.getHealth !== 'function') {
      throw new Error('Supervisor.register: def must have {name, getHealth: async () => ...}');
    }
    this.subsystems.set(def.name, {
      def,
      state: STATES.HEALTHY,
      lastRedAt: 0,
      healAttempts: 0,
      lastHealAt: 0,
      lastEscalateAt: 0,
      restartHistory: [],   // array of timestamps; pruned to 10min window
    });
    console.log(`${this.label} registered subsystem: ${def.name}`);
  }

  /** Begin polling. Idempotent. */
  start() {
    if (this.started) return;
    this.started = true;
    console.log(`${this.label} starting | ${this.subsystems.size} subsystem(s) | poll=${this.pollIntervalMs}ms`);

    // First poll on next tick so caller can finish setup before we hammer
    setImmediate(() => this._pollAll());

    this.pollTimer = setInterval(() => this._pollAll(), this.pollIntervalMs);

    if (this.deadmanHeartbeatUrl && this.deadmanHeartbeatMs > 0) {
      this.deadmanTimer = setInterval(() => this._sendDeadmanHeartbeat(), this.deadmanHeartbeatMs);
    }

    this.emit('started');
  }

  /** Stop polling. Idempotent. */
  stop() {
    if (!this.started) return;
    this.started = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.deadmanTimer) { clearInterval(this.deadmanTimer); this.deadmanTimer = null; }
    console.log(`${this.label} stopped`);
    this.emit('stopped');
  }

  /** Snapshot of current state — consumed by /api/supervisor/status etc. */
  getStatus() {
    const out = {
      started: this.started,
      timestamp: this.clock(),
      subsystems: {},
    };
    for (const [name, entry] of this.subsystems) {
      out.subsystems[name] = {
        state: entry.state,
        lastRedAt: entry.lastRedAt,
        healAttempts: entry.healAttempts,
        lastHealAt: entry.lastHealAt,
        lastEscalateAt: entry.lastEscalateAt,
        recentRestarts: entry.restartHistory.length,
      };
    }
    return out;
  }

  // =========================================================================
  // Internal — poll + state machine
  // =========================================================================

  /**
   * Mercury Audit B1 fix (2026-04-27): poll all subsystems in PARALLEL
   * (not sequential), and skip if a previous poll is still in flight.
   *
   * Pre-fix: sequential `for await (...)` meant one slow subsystem blocked
   *   every later subsystem from being polled until it returned. A 30s
   *   network hang could starve the whole monitor for 30s.
   * Post-fix: Promise.allSettled fans out, each subsystem independent.
   *   _pollInFlight guard prevents the next setInterval tick from starting
   *   a second concurrent _pollAll while the previous is still resolving.
   */
  async _pollAll() {
    if (!this.started) return;
    if (this._pollInFlight) {
      // The previous _pollAll hasn't finished yet — skip this tick rather
      // than run two concurrently (which could double-write ledger entries
      // or fire conflicting heal/escalate calls).
      return;
    }
    this._pollInFlight = true;
    try {
      const tasks = [];
      for (const [name, entry] of this.subsystems) {
        tasks.push(
          this._pollOne(name, entry).catch(err => {
            console.error(`${this.label} poll(${name}) threw:`, err.message);
          })
        );
      }
      await Promise.allSettled(tasks);
    } finally {
      this._pollInFlight = false;
    }
  }

  /**
   * Mercury Audit B1 fix (2026-04-27): wrap getHealth in a timeout.
   * Pre-fix: a hung getHealth() could hold _pollOne indefinitely.
   * Post-fix: `Promise.race([getHealth(), timeout])` enforces healthTimeoutMs.
   * On timeout, the subsystem is treated as if it returned DEAD with a
   * "getHealth timed out" failureReason — same path as if it threw.
   */
  async _pollOne(name, entry) {
    let health;
    try {
      health = await this._withTimeout(
        entry.def.getHealth(),  // method call preserves `this` for class subsystems
        this.healthTimeoutMs,
        `${name}.getHealth`
      );
    } catch (err) {
      // getHealth blew up OR timed out — treat as DEAD signal
      health = {
        status: STATES.DEAD,
        timestamp: this.clock(),
        details: { getHealthError: err.message },
        lastSuccessAt: 0,
        failureReason: `getHealth: ${err.message}`,
      };
    }

    // Mercury Audit B1 fix: shape validation (audit tasks 1, 5, 6, 7).
    // Pre-fix: any non-HEALTHY string was trusted as red, including
    //   typos / unknown enum members / lowercase 'healthy'.
    // Post-fix: normalize case, validate against VALID_STATES, detect
    //   contradiction (HEALTHY + failureReason), reject malformed shapes.
    if (!health) {
      console.warn(`${this.label} ${name} returned null/undefined health; treating as DEAD`);
      health = {
        status: STATES.DEAD,
        timestamp: this.clock(),
        details: {},
        lastSuccessAt: 0,
        failureReason: 'subsystem returned null/undefined health',
      };
    }
    if (typeof health.status === 'string') {
      health.status = health.status.toUpperCase();
    }
    if (!VALID_STATES.has(health.status)) {
      console.warn(`${this.label} ${name} returned invalid status='${health.status}'; treating as UNHEALTHY`);
      health.failureReason = `invalid status: ${JSON.stringify(health.status)}`;
      health.status = STATES.UNHEALTHY;
    }
    if (health.status === STATES.HEALTHY && health.failureReason) {
      console.warn(`${this.label} ${name} returned HEALTHY but failureReason="${health.failureReason}" — treating as DEGRADED (lying-subsystem detection)`);
      health.status = STATES.DEGRADED;
    }

    await this._reconcileState(name, entry, health);
  }

  /**
   * Mercury Audit B1 fix (2026-04-27): bounded promise wrapper.
   * Returns a Promise that resolves with the original promise's value OR
   * rejects with a TimeoutError after `ms`. Always clears the timer on
   * settle to avoid leaks.
   */
  _withTimeout(promise, ms, label) {
    if (!ms || ms <= 0) return promise;  // 0 disables timeout
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /**
   * Mercury Audit B1 fix (2026-04-27): monotonic clock for redDuration math.
   * Pre-fix: redDuration = wallClock() - entry.lastRedAt. NTP correction
   *   forward 1h made every red subsystem appear to have been red for 1h+,
   *   cascading the whole fleet to UNHEALTHY/DEAD. Backward jumps gave
   *   negative redDuration that bypassed the threshold check.
   * Post-fix: lastRedAt and lastHealAt and lastEscalateAt and
   *   restartHistory all use monotonic ms (ms since process start).
   *   Wall-clock is preserved separately for ledger timestamps and
   *   getStatus() display via this.clock().
   */
  _monoMs() {
    return Number(process.hrtime.bigint() / 1_000_000n);
  }

  async _reconcileState(name, entry, health) {
    // Mercury Audit B1 fix: redDuration uses monotonic clock, NOT wall-clock.
    // NTP corrections / clock skew don't cascade false escalations.
    const now = this._monoMs();
    const reportedRed = (health.status !== STATES.HEALTHY);
    const previousState = entry.state;

    // Track when the subsystem first went red (for degrade-threshold timing)
    if (reportedRed && entry.lastRedAt === 0) {
      entry.lastRedAt = now;
    }
    if (!reportedRed) {
      entry.lastRedAt = 0;
      entry.healAttempts = 0;
    }

    // Decide target state
    let nextState;
    if (!reportedRed) {
      nextState = STATES.HEALTHY;
    } else if (health.status === STATES.DEAD) {
      // Subsystem itself is reporting DEAD — escalate immediately
      nextState = STATES.DEAD;
    } else {
      const redDuration = now - entry.lastRedAt;
      if (redDuration < this.degradeThresholdMs) {
        nextState = STATES.DEGRADED;
      } else {
        // Red for too long — escalate to UNHEALTHY (or further if heal already failed)
        nextState = entry.healAttempts >= this.unhealthyHealAttempts
          ? STATES.DEAD
          : STATES.UNHEALTHY;
      }
    }

    if (nextState !== previousState) {
      await this._transition(name, entry, previousState, nextState, health);
    }

    // Run actions APPROPRIATE TO THE CURRENT (post-transition) STATE.
    // Even if there was no transition this tick, UNHEALTHY tries to heal,
    // DEAD considers escalation (rate-limited).
    if (nextState === STATES.UNHEALTHY) {
      await this._tryHeal(name, entry, health);
    } else if (nextState === STATES.DEAD) {
      await this._tryEscalate(name, entry, health);
    }
  }

  async _transition(name, entry, from, to, health) {
    entry.state = to;
    const event = {
      timestamp: this.clock(),
      subsystem: name,
      from,
      to,
      reason: health.failureReason || null,
      details: health.details || null,
    };
    this._writeLedger('transition', event);
    console.log(`${this.label} ${name}: ${from} -> ${to}${event.reason ? ' | ' + event.reason : ''}`);
    this.emit('transition', event);

    // Alert hook fires on UNHEALTHY → DEAD only (avoid noise on every tick).
    if (to === STATES.DEAD && this.onAlert) {
      try { await this.onAlert(name, event); }
      catch (err) { console.error(`${this.label} onAlert threw:`, err.message); }
    }
  }

  async _tryHeal(name, entry, health) {
    // Mercury Audit B1: monotonic clock for cooldown math (clock-skew safe).
    const now = this._monoMs();
    if (now - entry.lastHealAt < this.healCooldownMs) return;  // cooldown
    if (entry.healAttempts >= this.unhealthyHealAttempts) return;  // exhausted

    if (typeof entry.def.selfHeal !== 'function') {
      // No healer wired — bump attempts so we eventually hit DEAD
      entry.healAttempts++;
      entry.lastHealAt = now;
      return;
    }

    entry.healAttempts++;
    entry.lastHealAt = now;
    let ok = false;
    try {
      // Call as method (entry.def.selfHeal()) NOT as captured local —
      // the captured-local form loses `this` when the subsystem uses
      // class methods relying on instance state.
      ok = !!(await entry.def.selfHeal());
    } catch (err) {
      console.error(`${this.label} ${name}.selfHeal threw:`, err.message);
      ok = false;
    }
    this._writeLedger('heal_attempt', {
      // Wall-clock for human-readable ledger; `now` is monotonic-ms for math.
      timestamp: this.clock(),
      subsystem: name,
      attempt: entry.healAttempts,
      success: ok,
    });
    console.log(`${this.label} ${name}: heal attempt #${entry.healAttempts} -> ${ok ? 'OK' : 'FAIL'}`);
  }

  async _tryEscalate(name, entry, health) {
    // Mercury Audit B1: monotonic clock for cooldown + restart-history math.
    const now = this._monoMs();

    // Restart-loop guard — prune restart history older than 10min
    const tenMinAgo = now - 600_000;
    entry.restartHistory = entry.restartHistory.filter(t => t > tenMinAgo);
    if (entry.restartHistory.length >= this.maxRestartsIn10min) {
      // Too many restarts in window — back off, don't escalate. Already alerted on DEAD transition.
      return;
    }

    if (now - entry.lastEscalateAt < this.deadCooldownMs) return;  // cooldown

    if (typeof entry.def.escalate !== 'function') {
      // No escalator wired — log only. The DEAD-transition alert already fired.
      return;
    }

    entry.lastEscalateAt = now;
    entry.restartHistory.push(now);
    let ok = false;
    try {
      // Call as method to preserve `this` for class-method escalate impls.
      ok = !!(await entry.def.escalate());
    } catch (err) {
      console.error(`${this.label} ${name}.escalate threw:`, err.message);
      ok = false;
    }
    this._writeLedger('escalate', {
      // Wall-clock for ledger; `now` is monotonic-ms for restart-window math.
      timestamp: this.clock(),
      subsystem: name,
      success: ok,
      recentRestarts: entry.restartHistory.length,
    });
    console.log(`${this.label} ${name}: escalate -> ${ok ? 'OK' : 'FAIL'} (restart #${entry.restartHistory.length} in 10min window)`);
  }

  // =========================================================================
  // Watching-the-watcher: external deadman heartbeat (Layer B)
  // =========================================================================

  _sendDeadmanHeartbeat() {
    const url = this.deadmanHeartbeatUrl;
    if (!url) return;
    // Lazy require to keep https/http out of the hot path when unused
    const lib = url.startsWith('https') ? require('https') : require('http');
    const req = lib.get(url, (res) => {
      // 200 expected; anything else is logged but not actionable here.
      if (res.statusCode >= 400) {
        console.warn(`${this.label} deadman heartbeat returned ${res.statusCode}`);
      }
      // Drain to free socket
      res.resume();
    });
    req.on('error', (err) => {
      // Don't crash on deadman failure — Layer B failing is the precise reason
      // we have Layers A and C as backup.
      console.warn(`${this.label} deadman heartbeat failed:`, err.message);
    });
    req.setTimeout(5000, () => req.destroy(new Error('deadman heartbeat timeout')));
  }

  // =========================================================================
  // Ledger
  // =========================================================================

  _ensureLedgerDir() {
    const dir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  _writeLedger(eventType, payload) {
    const line = JSON.stringify(Object.assign({ event: eventType }, payload)) + '\n';
    try {
      fs.appendFileSync(this.ledgerPath, line);
    } catch (err) {
      // Don't let ledger failure crash the supervisor — logging fallback only.
      console.error(`${this.label} ledger append failed:`, err.message);
    }
  }
}

module.exports = { Supervisor, STATES };
