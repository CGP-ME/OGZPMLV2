# Resilience and Supervision Architecture

**Status:** Spec — implementation pending greenlight per phase
**Date:** 2026-04-26
**Driver:** Multiple zombie-bot incidents this weekend traced to (1) AlpacaAdapter
WS having no reconnect logic and (2) no overseer to detect a process that's
"alive but hung." This spec defines the durable, broker-agnostic, system-wide
resilience pattern that prevents both classes going forward.

---

## What this fixes

Three structural gaps in the current architecture:

1. **Per-broker reconnect logic is duplicated and inconsistent.** Kraken has
   reconnect + heartbeat + data watchdog. Alpaca did not (until commit
   `f042021`, which patches Alpaca specifically — same logic, second copy).
   Future brokers (Coinbase, IBKR, etc.) would each need a third copy. **No
   shared abstraction.**

2. **Process-level supervision is PM2-only.** PM2 restarts crashed processes
   but does NOT detect zombies (process alive, work-loop hung, broker
   disconnected, no data flowing). Every "bot is dead but PM2 says online"
   incident this weekend hit this gap.

3. **No cross-subsystem health correlation.** Each subsystem reports its own
   state in isolation. "Bot heartbeat OK + broker disconnected + dashboard
   reading stale" is invisible to any single component but obvious to a
   human looking at the whole picture. We need a system that looks at the
   whole picture.

---

## Architecture (two layers)

### Layer 1 — Broker resilience: shared WebSocket lifecycle

**File:** `foundation/ResilientWebSocket.js`

A WebSocket wrapper that handles every lifecycle concern in one place.
Adapters know about their **protocol** (auth message format, subscribe
payload shape, message parsing). They know nothing about their **lifecycle**
(when to reconnect, how long to back off, when to declare a data outage).

```js
const rws = new ResilientWebSocket({
  url: 'wss://stream.data.alpaca.markets/v2/iex',
  authMessage: { action: 'auth', key, secret },
  authSuccessPredicate: (msg) => msg.T === 'success' && msg.msg === 'authenticated',
  onMessage: (msg) => { /* adapter parses */ },
  onAuthenticated: ({ isReconnect }) => {
    if (isReconnect) /* replay subscriptions */
    else             /* send initial subscribe */
  },
  options: {
    maxBackoffMs: 30000,        // exponential backoff cap (1, 2, 4, 8, 16, 30)
    heartbeatPingMs: 30000,     // periodic ping to detect half-open sockets
    pongTimeoutMs: 10000,       // pong overdue = force reconnect
    dataWatchdogMs: 60000,      // no message for 60s = force reconnect
    onErrorHook: (err) => { /* adapter side-effects */ }
  }
});

rws.on('reconnecting', ({ attempt, delayMs }) => {});
rws.on('reconnected',  () => {});
rws.on('data-stale',   () => {});  // data watchdog tripped
rws.start();
```

**Behaviour:**
- WS open → auth message → wait for auth-success → fire `onAuthenticated`
- WS close (unintentional) → exponential backoff → reconnect → re-auth → onAuthenticated({ isReconnect: true })
- WS close (intentional via `.stop()`) → no reconnect
- No message for `dataWatchdogMs` → declare dead, force-close, reconnect path
- Pong overdue for `pongTimeoutMs` → declare half-open, force-close, reconnect path
- Backoff math: `Math.min(1000 * 2 ** attempts, maxBackoffMs)` — infinite retries

### Layer 2 — System supervision: graduated response orchestrator

**File:** `core/Supervisor.js`
**Daemon:** `scripts/supervisor-daemon.js` (PM2 entry point)
**Process name:** `ogz-supervisor` (separate PM2 process, survives bot crash)

A polling supervisor that maintains a state machine per subsystem:

```
HEALTHY ──[red gauge]──> DEGRADED ──[red >2min]──> UNHEALTHY ──[self-heal fails]──> DEAD
   ▲           │              │                          │                              │
   └───[green]─┴──[green]─────┴───[green]────────────────┴───[restart succeeds]─────────┘
```

Each transition fires a graduated action:

| Transition | Action |
|---|---|
| HEALTHY → DEGRADED | Log to supervisor-ledger.jsonl |
| DEGRADED → UNHEALTHY | Log + first self-heal attempt (subsystem-specific: broker reconnect, etc.) |
| UNHEALTHY → DEAD | Log + PM2 restart of subsystem + SMS alert |
| DEAD → HEALTHY (recovery) | Log + clear alert |

**Subsystems monitored (MVP):**

| Subsystem | Check | Healthy when |
|---|---|---|
| Bot main loop | `/api/health` heartbeat timestamp | Updated within 30s |
| Alpaca WS | broker.isConnected() + lastTickAt | Connected + tick within 60s during RTH |
| Kraken WS | same | Connected + tick within 60s 24/7 |
| SSL server | `/api/health` 200 OK | Returns 200 within 5s |
| WS relay (`ogz-websocket`) | PM2 status + connection count | online + N≥0 connections |
| State persistence | `data/state.json` mtime | Updated within 5min when bot active |
| Pattern memory | file mtime + size delta | Growing or stable, not corrupt |

**Future (Phase 3):**
- Memory growth detection (heap leak)
- Disk space (state/logs)
- Decision ledger growth rate
- Cross-correlation rules ("bot says HEALTHY but no trades for 6h on weekday RTH = something's wrong")

### Layer 1.5 — Health protocol

Every subsystem exposes a standardized `getHealth()` returning:

```js
{
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'DEAD',
  timestamp: 1777182718702,
  details: { /* subsystem-specific */ },
  lastSuccessAt: 1777182700000,        // last known-good timestamp
  failureReason: null | string,        // if not HEALTHY
}
```

Supervisor consumes this shape from every subsystem. Single contract.

---

## Test gauntlets

### `tests/broker-resilience-gauntlet.js`

Mock WS server using the `ws` library. Runs every adapter through:

1. Server-initiated close → reconnects within `maxBackoffMs`
2. Network drop (TCP RST) → reconnects when network restores
3. Auth failure on reconnect → does NOT spin (stops, surfaces error)
4. Pong timeout → declares dead, reconnects
5. No-data watchdog → forces reconnect even if socket appears OPEN
6. Subscribe → drop → reconnect → subscribe replays correctly
7. Multiple subscribe calls before first WS open → all land, no leak
8. Graceful `.stop()` → does NOT trigger reconnect
9. Malformed/unknown message → adapter doesn't crash
10. Backoff math correct (1s, 2s, 4s, 8s, 16s, 30s cap)

Output: PASS/FAIL per scenario per adapter. CI-runnable.

### `tests/supervisor-scenarios.js`

Mock subsystems with controllable health states. Verifies:

1. HEALTHY → DEGRADED on first red gauge
2. DEGRADED stays DEGRADED if it goes green within 2min
3. DEGRADED → UNHEALTHY after 2min red
4. UNHEALTHY triggers self-heal action
5. Self-heal failure → UNHEALTHY → DEAD after 3 attempts
6. DEAD triggers SMS alert + PM2 restart
7. Recovery path (DEAD → HEALTHY) clears alert
8. Multiple subsystems red simultaneously → correct precedence
9. Supervisor doesn't restart-loop (max 5 restarts in 10min before backing off)

---

## Implementation phases

| # | Deliverable | Files | Commit |
|---|---|---|---|
| 1 | This spec | `ogz-meta/specs/resilience-and-supervision.md` | spec(resilience): design doc for broker-agnostic + system supervisor |
| 2 | `ResilientWebSocket` library | `foundation/ResilientWebSocket.js` | feat(foundation): shared WS lifecycle library |
| 3 | Broker resilience gauntlet | `tests/broker-resilience-gauntlet.js` | test(brokers): resilience gauntlet |
| 4 | Supervisor module | `core/Supervisor.js` | feat(core): supervisor module + state machine |
| 5 | Supervisor daemon entry point | `scripts/supervisor-daemon.js` | feat(scripts): supervisor PM2 daemon |
| 6 | PM2 ecosystem update | `ecosystem.config.js` | feat(pm2): add ogz-supervisor ecosystem entry |
| 7 | Supervisor scenarios test | `tests/supervisor-scenarios.js` | test(core): supervisor scenarios |
| 8 | Health protocol on subsystems | various | feat(health): standardized getHealth() across subsystems |
| 9 | Adapter migration: Alpaca | `brokers/AlpacaAdapter.js` | refactor(alpaca): migrate to ResilientWebSocket |
| 10 | Adapter migration: Kraken | `kraken_adapter_simple.js` | **DEFERRED 2026-04-26** — see deferral note below |
| 11 | Decommission per-adapter reconnect | both files | **PARTIAL** — Alpaca decommissioned in Phase 9 (`a5ee381`); Kraken remains pending Phase 10 |

### Phase 10 deferral note (2026-04-26)

Decision: **DO NOT migrate kraken_adapter_simple.js to ResilientWebSocket pre-Apex.**

Rationale:
- The existing reconnect logic in `kraken_adapter_simple.js:769-797` has been
  battle-tested in production live crypto trading since 2026-01-21 (3+ months,
  no incidents).
- The broker resilience gauntlet (`tests/broker-resilience-gauntlet.js`)
  exercises ResilientWebSocket against a generic JSON-WS mock server — it
  does NOT cover Kraken's specific protocol quirks (auth flow, subscribe
  payload shape, ping/pong cadence, server-side close codes).
- Migrating live crypto trading code without Kraken-specific test coverage
  is "fixing what isn't broken with code that hasn't been Kraken-tested."
- Apex eval clock is the binding constraint. Regressing live crypto trading
  for "consistency" is the wrong tradeoff right now.

Conditions under which Phase 10 becomes safe to ship:
- Kraken-protocol scenarios added to the gauntlet (auth flow, subs format,
  pong cadence, message-shape parsing), OR
- A monitored canary deployment with rollback plan, OR
- Post-Apex-pass when production crypto trading isn't on the critical path.

Net effect: Phase 11 (decommission) is half-complete — Alpaca's per-adapter
reconnect was already removed in Phase 9. Kraken's stays as-is. Single source
of truth for resilience exists for new brokers; Kraken keeps its own.

Each phase = one commit = one push (per commit-hygiene rule). Each phase
verified before proceeding to the next.

---

## Watching the watcher (quis custodiet ipsos custodes)

The supervisor is itself a process. It can crash. It can hang. **Three
defense layers ensure no single failure mode goes undetected:**

### Layer A — PM2 watches the supervisor

`ogz-supervisor` is a PM2-managed process with `Restart=on-failure` semantics.
If the supervisor crashes outright, PM2 restarts it within seconds. Same
mechanism that watches `ogz-prime-v2` today.

**Catches:** uncaught exceptions, OOM crashes, explicit `process.exit(1)`.
**Misses:** a hung supervisor where the event loop is alive but the polling
interval has stopped firing (the same zombie pattern PM2 misses for the bot).

### Layer B — External deadman switch

Supervisor sends a periodic heartbeat (every 60s) to an EXTERNAL service:
- Healthchecks.io free tier (recommended — purpose-built dead-man's-switch)
- OR a second VPS running a tiny watcher
- OR a third-party uptime service (UptimeRobot, Better Uptime, etc.)

If heartbeats stop arriving for >5 minutes, the external service fires an
SMS alert directly to Trey. **The external service is OUTSIDE our infra**
— if our entire VPS goes down (network, power, cloud provider outage),
the deadman still fires.

**Catches:** hung supervisor, total VPS failure, network partition.

### Layer C — Supervisor ledger gap detection

Every supervisor poll writes a heartbeat entry to `data/supervisor-ledger.jsonl`.
A separate periodic check (cron or follow-up audit) scans the ledger for
gaps >2 minutes. Gaps mean the supervisor stopped polling — postmortem
reconstruction can prove exactly when the supervisor went dark.

**Catches:** retrospective evidence of any supervisor outage that Layers
A and B didn't fully resolve. Used for blast-radius analysis.

### Why three layers and not just one

Each layer fails in different ways:
- Layer A (PM2) fails when the supervisor process is alive but idle (zombie).
- Layer B (external) fails when the external service itself has an outage,
  OR when our VPS-to-internet connectivity is down.
- Layer C (ledger gap detection) is retrospective only — it tells us about
  past outages, not active ones.

Combined, they form a complete watch: **no single point of failure can hide
a supervisor outage from us.** This is the "watch the watchers" answer.
Mirrors the supervision-tree pattern from Erlang/OTP, adapted to a Node.js
+ PM2 + external-service stack.

---

## What's explicitly out of scope (for now)

- **Auto-recovery actions for state corruption** (e.g., restoring state.json
  from backup if it goes invalid). Detection yes, action no — operator decides.
- **Cross-region failover** — single VPS deployment, no DR yet.
- **Distributed tracing** (OpenTelemetry) — observability is sufficient via
  the supervisor ledger + proof page.
- **Replacing PM2** — supervisor sits ABOVE PM2, doesn't replace it. PM2
  still handles process-crash restarts. Supervisor handles zombie detection
  and graduated escalation.

---

## Why not just use [established tool X]?

- **Kubernetes liveness/readiness probes** — overkill for a single-VPS bot;
  k8s has its own ops surface that doubles complexity.
- **systemd watchdog** — works only for crash detection, not zombie detection.
- **PM2 alone** — already in use; doesn't catch zombies (the actual problem).
- **Erlang/OTP** — would require rewriting the bot in Erlang. Not happening.
- **Pingdom / Healthchecks.io** — external service, latency-sensitive, costs
  money, requires public health endpoints. Internal supervisor is faster +
  cheaper + has full repair-action capability.

The custom supervisor is right-sized for OGZPrime: simple enough to maintain,
sophisticated enough to catch the zombies PM2 misses.

---

## Acceptance criteria

- [ ] Broker resilience gauntlet passes 10/10 for both Alpaca and Kraken
- [ ] Supervisor scenarios test passes 9/9
- [ ] Supervisor running in PM2 as `ogz-supervisor` survives `pm2 restart ogz-prime-v2`
- [ ] Forced-zombie test (kill bot's WS but keep process alive) → supervisor detects within 60s → restarts bot via PM2
- [ ] Phase 0 baseline reproduces byte-exact ($17,950.589592711076) with supervisor enabled (it shouldn't touch the backtest path)
- [ ] Supervisor ledger JSONL contains a complete event trace for every state transition
- [ ] SMS alert fires once on DEAD, not repeatedly (rate-limited)

---

## Postmortem hook

When something goes wrong, the supervisor ledger answers:
- WHEN did the subsystem first go red?
- WHAT was the failure reason?
- WHAT actions did supervisor take?
- DID the action work? (recovery time)
- HOW MANY times has this happened recently?

Single source of truth for postmortems. Replaces the current "log + grep +
guess" workflow.
