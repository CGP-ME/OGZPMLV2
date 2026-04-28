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
const crypto = require('crypto');

// Mercury Audit B1 Finding 3 fix (2026-04-27): bound pid values during replay
// to reject fabricated high-pid entries (e.g. pid=999999999) that would slip
// past process.kill(pid, 0) ESRCH check. Read kernel pid_max once at module
// load; default to 2^22 (the historical Linux ceiling) if /proc unreadable.
const PID_MAX = (() => {
  try { return parseInt(fs.readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim(), 10) || (1 << 22); }
  catch (_) { return 1 << 22; }
})();

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

    // Mercury Audit B1 Finding 1+2 fix (2026-04-27): capture our own pid +
    // start_time at boot. start_time is jiffies-since-system-boot and is
    // unique per process — survives PID rollover (Finding 1) and EPERM
    // foreign-uid probes (Finding 2). Read once; never changes for our process.
    this.bootPidStartTime = this._readPidStartTime(process.pid);

    // Mercury Audit B1 Finding 3+5 fix (2026-04-27): HMAC-SHA256 sign every
    // ledger entry. Closes the fabricated-pid bypass (attacker cannot forge a
    // valid signature without the key) and torn-write false-acceptance (any
    // mid-write splice produces a signature mismatch). Key is generated at
    // first boot, stored 0600 next to the ledger, persists across restarts.
    this.hmacKey = this._loadOrCreateHmacKey();
    this._loggedLegacyWarn = false;

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
    // Mercury re-attack-4 Breakage 3 fix (2026-04-27): re-register with the
    // same name preserves state (and the per-entry mutex). Without this,
    // two register() calls in quick succession produced two different entry
    // objects (because subsystems.set() overwrites the map but in-flight
    // _pollOne calls hold the OLD entry via closure), bypassing the mutex.
    const existing = this.subsystems.get(def.name);
    if (existing) {
      existing.def = def;  // pick up new getHealth/selfHeal/escalate refs
      // Mercury re-attack-5 Breakage 3 fix (2026-04-27): bump def generation
      // so any currently in-flight _pollOne can detect that its captured
      // `entry.def` is now stale and discard its result rather than
      // overwriting the new-def's first-poll outcome.
      existing._defGeneration = (existing._defGeneration || 0) + 1;
      console.log(`${this.label} re-registered subsystem: ${def.name} (state preserved)`);
      return;  // no immediate poll on re-register; existing state continues
    }

    const entry = {
      def,
      state: STATES.HEALTHY,
      lastRedAt: 0,
      // Mercury re-attack-4 Breakage 1 fix (2026-04-27): stability tracker.
      // Records when subsystem first reported HEALTHY after being red. Full
      // reset (lastRedAt=0, healAttempts=0) only happens after sustained
      // HEALTHY for degradeThresholdMs. Defeats the oscillation attack
      // where DEGRADED→HEALTHY→DEGRADED rapidly resets the red-duration timer
      // and avoids escalation forever.
      firstHealthyAfterRedAt: 0,
      healAttempts: 0,
      lastHealAt: 0,
      lastEscalateAt: 0,
      restartHistory: [],   // array of timestamps; pruned to 10min window
      _pollInFlight: false,  // per-entry mutex, see _pollOne wrapper
      _mutexSkipCount: 0,
      _defGeneration: 0,     // bumped on re-register; in-flight polls compare
    };
    this.subsystems.set(def.name, entry);
    console.log(`${this.label} registered subsystem: ${def.name}`);

    // Mercury Audit B1 Finding 3 re-attack Finding 4 fix (2026-04-27):
    // if start() has already been called, register-during-an-in-flight-poll
    // would cause the new subsystem to miss the current tick (Map iteration
    // doesn't include entries added mid-iteration). Without this, the
    // "no-first-poll-lag" guarantee from the Finding 3 fix is broken for
    // late registrations. Trigger an immediate single-subsystem poll so
    // late-registered already-broken subsystems still escalate without lag.
    if (this.started) {
      this._pollOne(def.name, entry).catch(err => {
        console.error(`${this.label} register-time poll failed for ${def.name}:`, err.message);
      });
    }
  }

  /** Begin polling. Idempotent. */
  start() {
    if (this.started) return;
    this.started = true;
    console.log(`${this.label} starting | ${this.subsystems.size} subsystem(s) | poll=${this.pollIntervalMs}ms`);

    // Mercury Audit B2 fix (2026-04-27): replay restart-history from the
    // ledger BEFORE polling begins. Without this, a supervisor process
    // restart (e.g. PM2 auto-restart of ogz-supervisor itself — Layer A
    // defense firing) would empty restartHistory in memory, defeating the
    // maxRestartsIn10min guard. A flapping subsystem could trigger
    // unbounded restarts because each new supervisor sees "first restart,
    // no history."
    //
    // Implementation: scan ledger for event:escalate entries within the
    // last 10min by WALL-CLOCK age. Convert each entry's age to a
    // monotonic-equivalent timestamp (monoNow - ageMs) so the in-memory
    // restartHistory remains in monotonic-ms units (post-B1 fix).
    this._replayRestartHistory();

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
    // Mercury re-attack-2 Breakage 2 fix (2026-04-27): per-entry mutex.
    // Without this guard, the register-time immediate-poll (added for
    // Finding 4) can run concurrently with the periodic _pollAll on the
    // same entry. Both calls await getHealth() and selfHeal(), so JS event
    // loop can interleave their writes to entry.lastRedAt / healAttempts /
    // lastHealAt around the await boundaries, producing inconsistent state.
    // Skip the new poll if one is already in flight for this entry.
    //
    // Mercury re-attack-3 Breakage 3 disposition: when the mutex causes
    // skips, log it so a permanently-hung subsystem is observable. Without
    // this log, a subsystem with a stuck-forever getHealth would silently
    // miss every subsequent poll — masking what should be loud failure.
    if (entry._pollInFlight) {
      entry._mutexSkipCount = (entry._mutexSkipCount || 0) + 1;
      // Mercury re-attack-4 Breakage 2 fix (2026-04-27): exponential throttle.
      // Log at skip counts 1, 2, 4, 8, 16, ... — bounds log volume to
      // O(log N) for hangs of N polls. (Linear "every 10th" was 3600 lines
      // for a 1-hour hang at 100ms intervals; exponential is ~15.)
      // Bitwise: x & (x-1) === 0 iff x is a power of 2.
      if ((entry._mutexSkipCount & (entry._mutexSkipCount - 1)) === 0) {
        console.warn(`${this.label} ${name}: poll skipped (previous poll still in flight, ${entry._mutexSkipCount} consecutive skip${entry._mutexSkipCount === 1 ? '' : 's'} — getHealth may be hung)`);
      }
      return;
    }
    entry._mutexSkipCount = 0;
    entry._pollInFlight = true;
    try {
      await this._pollOneInner(name, entry);
    } finally {
      entry._pollInFlight = false;
    }
  }

  async _pollOneInner(name, entry) {
    // Mercury re-attack-5 Breakage 3 fix (2026-04-27): capture def-generation
    // BEFORE the await on getHealth(). If a re-register fires during the
    // await, the captured generation is now stale and we discard the result
    // — the next poll will use the new def and produce a fresh result.
    const defGenAtStart = entry._defGeneration || 0;
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

    // Mercury re-attack-5 Breakage 3 fix (2026-04-27): if def changed under
    // us during the getHealth await, our captured result is stale. Discard
    // — the next poll will run against the new def and produce fresh state.
    if ((entry._defGeneration || 0) !== defGenAtStart) {
      console.log(`${this.label} ${name}: discarding poll result — def was re-registered during getHealth (gen ${defGenAtStart} -> ${entry._defGeneration})`);
      return;
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

    // Track when the subsystem first went red (for degrade-threshold timing).
    const isFirstRedPoll = (reportedRed && entry.lastRedAt === 0);
    if (isFirstRedPoll) {
      entry.lastRedAt = now;
    }

    // Mercury re-attack-4 Breakage 1 fix (2026-04-27): stability gate on
    // HEALTHY recovery. Only fully clear red state (lastRedAt, healAttempts)
    // after sustained HEALTHY for degradeThresholdMs. Defeats the
    // oscillation attack where DEGRADED→HEALTHY→DEGRADED at sub-threshold
    // intervals would otherwise reset the timer every cycle, allowing a
    // flapping subsystem to evade escalation indefinitely.
    if (!reportedRed) {
      if (entry.lastRedAt !== 0) {
        // Was red, now reporting healthy — start (or continue) stability watch
        if (entry.firstHealthyAfterRedAt === 0) {
          entry.firstHealthyAfterRedAt = now;
        }
        if (now - entry.firstHealthyAfterRedAt >= this.degradeThresholdMs) {
          // Sustained HEALTHY long enough — full reset
          entry.lastRedAt = 0;
          entry.firstHealthyAfterRedAt = 0;
          entry.healAttempts = 0;
        }
      } else {
        // Was already cleanly HEALTHY — nothing to track
        entry.firstHealthyAfterRedAt = 0;
      }
    } else if (entry.firstHealthyAfterRedAt > 0) {
      // Re-degraded during the stability window — clear stability tracker.
      // lastRedAt continues to point at the cumulative-red origin so
      // redDuration accumulates across the oscillation.
      entry.firstHealthyAfterRedAt = 0;
    }

    // Decide target state.
    //
    // Mercury Audit B1 Finding 3 fix (2026-04-27, revised after re-attack):
    // a subsystem registered while ALREADY broken would otherwise spend one
    // poll cycle in DEGRADED (lastRedAt=0 → set to now → redDuration=0 →
    // DEGRADED) before escalating. The original fix backdated lastRedAt by
    // degradeThresholdMs+1, which Mercury found unsafe — it could trigger
    // immediate DEAD (when unhealthyHealAttempts is 0) or produce negative
    // timestamps (early process start). Revised fix: explicit fast-path
    // branch for UNHEALTHY-on-first-red-poll. DEGRADED-with-failureReason
    // intentionally does NOT fast-path because DEGRADED is a stable end-state
    // for soft issues, not a transition step toward UNHEALTHY.
    let nextState;
    if (!reportedRed) {
      nextState = STATES.HEALTHY;
    } else if (health.status === STATES.DEAD) {
      // Subsystem itself is reporting DEAD — escalate immediately
      nextState = STATES.DEAD;
    } else if (isFirstRedPoll && health.status === STATES.UNHEALTHY) {
      // Already-broken-on-arrival fast-path: skip the DEGRADED grace period.
      // Go directly to UNHEALTHY (NOT DEAD — we have not yet attempted a
      // single heal; jumping straight to DEAD would skip the heal contract).
      nextState = STATES.UNHEALTHY;
    } else {
      const redDuration = now - entry.lastRedAt;
      const alreadyEscalated = (previousState === STATES.UNHEALTHY || previousState === STATES.DEAD);

      // Mercury re-attack-2 Breakages 1+4 + re-attack-3 Breakage 1 fix (2026-04-27):
      // honor DEGRADED self-report ONLY during the grace period
      // (redDuration < degradeThresholdMs). After the grace period,
      // supervisor's escalation logic overrides any self-report — a
      // subsystem stuck claiming DEGRADED forever still escalates to
      // UNHEALTHY/DEAD. This preserves both:
      //   - Partial-recovery transition: UNHEALTHY → DEGRADED is allowed
      //     when subsystem partially heals during the grace window.
      //   - Escalation safety: DEGRADED for too long still escalates.
      if (health.status === STATES.DEGRADED && redDuration < this.degradeThresholdMs) {
        nextState = STATES.DEGRADED;
      }
      // Subsystem reports UNHEALTHY/DEGRADED past grace, OR previously escalated:
      // escalate to UNHEALTHY (or DEAD if heal exhausted).
      else if (redDuration >= this.degradeThresholdMs || alreadyEscalated) {
        nextState = entry.healAttempts >= this.unhealthyHealAttempts
          ? STATES.DEAD
          : STATES.UNHEALTHY;
      } else {
        nextState = STATES.DEGRADED;
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
    //
    // Mercury Audit B3 review (2026-04-27):
    //
    // (a) Alert-hook reject does NOT revert state. State transitions are
    //     authoritative; the alert is best-effort notification. If we
    //     rolled back state on alert failure, a flaky alert provider
    //     (Twilio rate limit, Slack 5xx) could trap the supervisor in
    //     a transition loop, paging operators and never reaching the
    //     DEAD state where escalate() would actually run. By-design.
    //
    // (b) onAlert is a function reference captured at construction.
    //     Module-level changes (e.g. operator updates the hook code)
    //     do NOT pick up via require-cache busting — operator restart
    //     of ogz-supervisor is the only path. By-design — hot-reload
    //     of alert behavior is a security-surface concern (surprise
    //     code execution in the supervisor process).
    if (to === STATES.DEAD && this.onAlert) {
      // Mercury Audit D Finding 1 fix (2026-04-28): fire-and-forget the
      // alert. The PRIOR `await this.onAlert(...)` blocked _transition →
      // _reconcileState → _pollOneInner → _pollAll's Promise.allSettled().
      // If the alert hook hung (Discord 5xx retry without timeout, Twilio
      // rate-limit backoff, Slack webhook hang), allSettled never resolved,
      // _pollInFlight stayed true, and the entire supervisor froze — every
      // subsystem stopped being polled, not just the one that triggered.
      //
      // Fire-and-forget aligns implementation with the documented (B3)
      // intent: "alert is best-effort notification." Rejection / hang
      // never blocks the state machine.
      Promise.resolve()
        .then(() => this.onAlert(name, event))
        .catch(err => console.error(`${this.label} onAlert threw:`, err.message));
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

  /**
   * Mercury Audit B3 review (2026-04-27): no-retry-on-5xx is by-design.
   *
   * Healthchecks.io semantics: services interpret missing pings as outages
   * after a configured grace period (typically 1.5x the expected interval).
   * Our default heartbeat cadence is 60s. A single 5xx response is recovered
   * on the next 60s tick automatically — that IS the implicit retry. Adding
   * code-side retry-with-backoff would risk thundering-herd on a flaky
   * health endpoint without improving the actual outage-detection signal.
   *
   * req.setTimeout(5000) calls req.destroy on timeout, which aborts the
   * request and frees the underlying socket — NOT just a timeout event.
   * No socket leak. No keep-alive agent (default global agent suffices for
   * a once-per-60s outbound ping).
   */
  _sendDeadmanHeartbeat() {
    const url = this.deadmanHeartbeatUrl;
    if (!url) return;
    // Lazy require to keep https/http out of the hot path when unused
    const lib = url.startsWith('https') ? require('https') : require('http');
    const req = lib.get(url, (res) => {
      // 200 expected; anything else is logged but not actionable here.
      // Next tick (60s default) is the implicit retry per design above.
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
    // req.destroy aborts the connection AND frees the socket — no leak.
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

  /**
   * Mercury Audit B3 review (2026-04-27):
   *
   * (1) Partial-write on ENOSPC: fs.appendFileSync is non-atomic at line
   *     granularity in POSIX — if disk fills mid-write, a malformed JSONL
   *     line can land in the file. Tolerated by-design: downstream parsers
   *     (jq with `?`, `JSON.parse` in try/catch, our own _replayRestartHistory)
   *     all handle malformed lines gracefully. Stronger atomicity (write+rename
   *     per line) would be too expensive for a high-frequency log. The trade
   *     is documented; the err.code logging below makes ENOSPC events
   *     grep-able for operator monitoring.
   *
   * (2) Ledger directory removed between _ensureLedgerDir (constructor)
   *     and first append: append throws ENOENT. Caught here; supervisor
   *     continues without crash. Failure is logged and operator can act.
   *     Recreating the directory mid-flight is intentionally NOT done —
   *     if someone manually deleted the dir, they may have a reason.
   */
  /**
   * Mercury Audit B1 Finding 1+2 fix (2026-04-27): read PID start_time from
   * /proc/[pid]/stat field 22 (jiffies-since-boot at process start). This is
   * unique-per-process even across PID rollover and is world-readable on
   * standard Linux (no EPERM for foreign-uid probes). Returns null if /proc
   * is unavailable (non-Linux) or pid does not exist.
   *
   * /proc/[pid]/stat format: "pid (comm) state ppid ... start_time ..."
   * The comm field can contain spaces and parens, so we find the LAST ')'
   * and split fields after it. After-comm field 19 (0-indexed) corresponds
   * to start_time (field 22 in the original 1-indexed spec).
   */
  _readPidStartTime(pid) {
    try {
      if (!fs.existsSync('/proc')) return null;
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const lastParen = stat.lastIndexOf(')');
      if (lastParen === -1) return null;
      const fields = stat.slice(lastParen + 2).split(/\s+/);
      return parseInt(fields[19], 10) || null;
    } catch (_) { return null; }
  }

  /**
   * Mercury Audit B1 Finding 3+5 fix (2026-04-27): load or create the HMAC
   * key. Lives at <ledger-dir>/supervisor-hmac.key with mode 0600 (owner-only
   * read/write). 32 random bytes from crypto.randomBytes. Persists across
   * supervisor restarts so prior-incarnation entries remain verifiable.
   *
   * Failure modes:
   *   - Key file unreadable but exists: regenerate (one-time replay loss).
   *   - Key file write fails: log error, return null (entries unsigned, replay
   *     rejects everything — fail-closed restart-history rather than fail-open).
   */
  _loadOrCreateHmacKey() {
    const keyPath = path.resolve(path.dirname(this.ledgerPath), 'supervisor-hmac.key');
    try {
      if (fs.existsSync(keyPath)) {
        const key = fs.readFileSync(keyPath);
        if (key.length === 32) return key;
        console.warn(`${this.label} hmac key at ${keyPath} malformed (got ${key.length} bytes, expected 32); regenerating`);
      }
    } catch (e) {
      console.warn(`${this.label} hmac key read failed [${e.code || 'unknown'}]: ${e.message}; regenerating`);
    }
    const newKey = crypto.randomBytes(32);
    try {
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
      console.log(`${this.label} hmac key created at ${keyPath}`);
    } catch (e) {
      console.error(`${this.label} hmac key write failed [${e.code || 'unknown'}]: ${e.message} — entries will be unsigned and replay will reject all entries`);
      return null;
    }
    return newKey;
  }

  /** Compute HMAC-SHA256 over canonical JSON of the entry (pre-hmac field). */
  _signEntry(entryWithoutHmac) {
    if (!this.hmacKey) return null;
    return crypto.createHmac('sha256', this.hmacKey)
      .update(JSON.stringify(entryWithoutHmac))
      .digest('hex');
  }

  /**
   * Verify an entry's HMAC signature. Returns true if signed and valid.
   * Constant-time comparison via timingSafeEqual (defense vs timing oracles
   * — though our threat model doesn't really include timing attacks, the
   * pattern is cheap and standard).
   */
  _verifyEntry(entry) {
    if (!this.hmacKey) return false;
    if (typeof entry.hmac !== 'string') return false;
    const { hmac, ...rest } = entry;
    const expected = this._signEntry(rest);
    if (!expected) return false;
    let expectedBuf, actualBuf;
    try {
      expectedBuf = Buffer.from(expected, 'hex');
      actualBuf = Buffer.from(hmac, 'hex');
    } catch (_) { return false; }
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  _writeLedger(eventType, payload) {
    // Mercury Audit B1 Finding 1-5 fix (2026-04-27): every entry carries
    //   - pid + pidStartTime: process identity that survives PID rollover
    //   - hmac: HMAC-SHA256 over the rest of the entry
    // Replay rejects entries that fail any of these checks.
    //
    // Finding 5 (torn writes): mitigated by HMAC verification — even if a
    // mid-write splice produces JSON-parseable bytes, the resulting entry
    // will not match its own signature. Linux POSIX guarantees appendFileSync
    // atomicity for line writes < PIPE_BUF (4096 B); our entries are well
    // under that, so torn writes should not occur in practice anyway.
    // Mercury Audit B1 Finding 2 fix (2026-04-27): dual-timestamp ledger.
    // wallMs (existing `timestamp` from caller) for human-readable display,
    // monoMs for same-process timeline reconstruction. monoMs is meaningful
    // only when read in the same process lifetime (different processes have
    // different monotonic origins). Combined with pid + pidStartTime, post-
    // mortem analysis can correctly interleave events without relying on
    // wall-clock that may have been NTP-corrected mid-session.
    //
    // Disclosure note: monoMs reveals supervisor process uptime to anyone
    // who can read the ledger. Same information is already visible via
    // standard OS tools (ps/proc) — bounded leak.
    const entry = Object.assign({
      event: eventType,
      pid: process.pid,
      pidStartTime: this.bootPidStartTime,
      monoMs: this._monoMs(),
    }, payload);
    const hmac = this._signEntry(entry);
    if (hmac) entry.hmac = hmac;
    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(this.ledgerPath, line);
    } catch (err) {
      // Surface err.code (ENOSPC/EACCES/ENOENT) so operator monitors can
      // route alerts. Don't let ledger failure crash the supervisor —
      // its core duty (watching subsystems) takes precedence over its
      // own postmortem trail.
      console.error(`${this.label} ledger append failed [${err.code || 'unknown'}]:`, err.message, '(path:', this.ledgerPath + ')');
    }
  }

  /**
   * Mercury Audit B2 fix (2026-04-27): replay restartHistory from ledger
   * on supervisor startup. Without this, the in-memory restart counter
   * is wiped every time the supervisor process itself restarts — and a
   * flapping subsystem can defeat maxRestartsIn10min by triggering enough
   * supervisor crashes to keep emptying the history.
   *
   * Cross-clock conversion: ledger entries store WALL-CLOCK timestamps
   * (this.clock()). The in-memory restartHistory uses MONOTONIC-MS
   * (post-B1 fix). For each ledger entry within the 10min window:
   *   monoEquivalent = currentMonoMs - (currentWallMs - entry.timestamp)
   * Distance to "now" preserved across the clock boundary; the
   * existing prune logic in _tryEscalate filters by `monoNow - 600_000`
   * which now correctly includes the back-shifted entries.
   *
   * Defensive: malformed lines / missing fields / parse errors are
   * silently skipped per line. Whole-file read failures (no ledger
   * yet, permissions) log a warning and return — supervisor continues
   * with empty history (worst case = same as today, no regression).
   */
  _replayRestartHistory() {
    if (!fs.existsSync(this.ledgerPath)) {
      console.log(`${this.label} no ledger yet at ${this.ledgerPath}; restartHistory empty`);
      return;
    }
    let raw;
    try {
      raw = fs.readFileSync(this.ledgerPath, 'utf8');
    } catch (err) {
      console.warn(`${this.label} could not read ledger for replay:`, err.message);
      return;
    }

    const wallNow = this.clock();
    const monoNow = this._monoMs();
    const windowMs = 600_000;  // 10min window matches maxRestartsIn10min prune
    let replayed = 0;

    for (const line of raw.split('\n')) {
      if (!line) continue;
      let entry;
      try { entry = JSON.parse(line); }
      catch (_) { continue; }
      if (!entry || entry.event !== 'escalate') continue;
      if (typeof entry.timestamp !== 'number' || typeof entry.subsystem !== 'string') continue;

      // Mercury Audit B1 Findings 1-5 fix (2026-04-27): full identity check.
      //
      // 1. HMAC signature must verify (closes Finding 3 forgery + Finding 5
      //    torn-write false-acceptance). Legacy entries without hmac are
      //    rejected with a one-time warning; the supervisor falls back to
      //    empty restart-history on first-run after upgrade (acceptable —
      //    restart-history is a soft cap, not a hard safety boundary).
      if (!this._verifyEntry(entry)) {
        if (typeof entry.hmac !== 'string' && !this._loggedLegacyWarn) {
          console.warn(`${this.label} replay: skipping legacy unsigned entries (one-time warning, normal on first boot after fix)`);
          this._loggedLegacyWarn = true;
        }
        continue;
      }

      // 2. PID range bounds (closes Finding 3 fabricated high-pid bypass).
      if (typeof entry.pid !== 'number' || entry.pid <= 0 || entry.pid > PID_MAX) continue;

      // 3. PID + start_time identity check (closes Findings 1+2: PID rollover
      //    and EPERM foreign-uid probes). If /proc/[pid]/stat exists AND
      //    start_time matches, the original writer is still alive. Same-pid
      //    + same-start_time = us, accept. Different pid + still-alive = a
      //    foreign live writer (multi-instance contamination), skip.
      //    Mismatched start_time OR /proc missing = original writer is gone
      //    (recycled or dead), accept.
      if (typeof entry.pidStartTime !== 'number') continue;
      const writerStartTime = this._readPidStartTime(entry.pid);
      const writerStillAlive = (writerStartTime !== null && writerStartTime === entry.pidStartTime);
      if (writerStillAlive && entry.pid !== process.pid) continue;

      const ageMs = wallNow - entry.timestamp;
      if (ageMs < 0 || ageMs > windowMs) continue;  // outside window

      const sub = this.subsystems.get(entry.subsystem);
      if (!sub) continue;  // subsystem not registered in this supervisor instance

      // Back-shift into monotonic time so the existing prune logic
      // (`now - 600_000`) treats it identically to a freshly-pushed entry.
      sub.restartHistory.push(monoNow - ageMs);
      replayed++;
    }

    if (replayed > 0) {
      console.log(`${this.label} replayed ${replayed} escalation event(s) from ledger into restartHistory`);
    }
  }
}

module.exports = { Supervisor, STATES };
