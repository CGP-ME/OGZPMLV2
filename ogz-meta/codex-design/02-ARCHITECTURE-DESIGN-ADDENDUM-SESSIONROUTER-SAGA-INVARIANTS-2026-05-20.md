# Codex Architecture Addendum - SessionRouter Saga Invariants

**Date:** 2026-05-20
**Companion to:** `02-ARCHITECTURE-DESIGN.md`
**Scope:** Highest-value SessionRouter hardening extracted from cross-broker switching research, without a full platform refactor.

This addendum translates the distributed-systems research into the current OGZPMLV2 Node/VPS architecture. It deliberately does not require PostgreSQL, Temporal, Kafka, etcd, Debezium, MLflow, or a new service mesh before SessionRouter can be made safer.

The long-term product architecture may eventually want those systems. The current bot needs the same invariants expressed locally: durable transition state, single-writer ownership, idempotent broker intents, append-only audit events, deterministic reconciliation, and strict pattern-bank isolation.

---

## Executive Decision

Session switching is a saga, not a transaction.

The bot cannot make Kraken, Alpaca, websocket streams, broker margin engines, order callbacks, pattern memory, and UI projections commit atomically. A safe implementation must assume:

- broker callbacks can duplicate, arrive late, or never arrive;
- cancel acknowledgements do not prove no fills will follow;
- websocket truth can lag REST truth;
- broker liquidation can happen outside bot intent;
- transition code can crash halfway through;
- model and pattern-memory writes can pollute future inference if promotion is not isolated.

Therefore the SessionRouter completion target is not "perfect atomic swap." The target is:

1. Freeze new source risk.
2. Record a durable transition epoch.
3. Submit idempotent close/cancel intents.
4. Reconcile against broker REST truth.
5. Activate target session only after source exposure and source open orders are proven flat.
6. Keep a journal that lets a restart resume or halt deterministically.

---

## Stack Translation For This Repo

| Research primitive | Full platform version | Current OGZ equivalent |
|---|---|---|
| Authoritative state database | PostgreSQL serializable transactions | `StateManager` plus atomic JSON write discipline and transition-state JSON |
| Workflow engine | Temporal saga workflow | `SessionTransitionCoordinator` state machine with durable transition journal |
| Leader election | etcd lease/election | single-process transition lock file with epoch fencing; future-replaceable by etcd |
| Event backbone | Kafka/Redpanda | append-only JSONL transition/order/reconciliation events |
| Transactional outbox | DB outbox + CDC | local intent queue persisted before broker side effects |
| CQRS projections | projection workers/read models | backend-owned status snapshots and dashboard events derived from journal/state only |
| Model registry | MLflow | explicit pattern-bank version and inference-log version fields |
| Formal verification | TLA+ and property tests | unit and integration state-machine tests first; TLA+ later if the product stack expands |

This mapping preserves the invariants without forcing the eval bot into a full distributed architecture.

---

## Non-Negotiable Invariants

### I1 - Single Transition Owner

Only one transition may be active for a given account/session scope.

Local implementation:

- create `data/session-router/transition-lock.json` using exclusive create semantics;
- include `transitionId`, `epoch`, `sourceSession`, `targetSession`, `ownerPid`, `startedAt`, `heartbeatAt`;
- update heartbeat while transition runs;
- if a lock exists and heartbeat is fresh, refuse to start another transition;
- if a lock exists and heartbeat is stale, enter `RECOVERY_REQUIRED`, do not auto-restart into a second transition without reconciliation.

Reasoning: this is the local equivalent of lease fencing. It prevents double swaps, double close orders, and target activation racing source cleanup.

### I2 - Single Writer For Session State

Only the transition coordinator mutates authoritative session state during a transition.

Required behavior:

- strategies may read `transitionState`;
- strategies may not open new trades while state is `FREEZE_SOURCE`, `LIQUIDATING`, `RECONCILING`, or `ACTIVATING_TARGET`;
- broker adapters may report events, but they do not decide session state;
- dashboard/UI never marks a session active from raw websocket status.

Reasoning: most current SessionRouter danger comes from shared mutable state. A single writer per transition epoch removes most races without needing a new database.

### I3 - Stable Idempotent Broker Intent IDs

Every broker side effect in a transition needs a stable intent ID.

Local implementation:

```text
intentId = session:{accountId}:{epoch}:{phase}:{broker}:{symbol}:{side}:{sequence}
clientOrderId = brokerSafeHash(intentId)
```

Persist mapping before or in the same local critical section as the broker call:

```json
{
  "intentId": "session:alpaca-paper:42:force-close:alpaca:TSLA:sell:1",
  "clientOrderId": "ogz-42-fc-tsla-1",
  "broker": "alpaca",
  "symbol": "TSLA",
  "side": "sell",
  "qty": 3,
  "phase": "FORCE_CLOSE",
  "externalOrderId": null,
  "status": "INTENT_RECORDED",
  "createdAt": "..."
}
```

On retry:

- if `intentId` exists with terminal external order state, do not resubmit;
- if `intentId` exists with external order ID but nonterminal status, reconcile first;
- if broker timed out after request send, query by `clientOrderId` before submitting a duplicate.

Reasoning: this is the practical substitute for exactly-once broker commands.

### I4 - Broker REST Truth Gates Activation

Websocket callbacks are evidence, not truth.

Before target session activation:

- query source broker open positions;
- query source broker open orders;
- query account/margin/buying power if adapter supports it;
- compare broker truth against local state and transition journal;
- target session activates only if source positions and source open orders are zero or within an explicit allowed tolerance.

For the current intraday-flat requirement, tolerance is zero.

Reasoning: broker callbacks can be missing or duplicate. REST reconciliation is the activation gate.

### I5 - UI Does Not Invent Exposure

Dashboard status must be derived from backend-owned transition state and broker reconciliation snapshots.

Do not let frontend code infer:

- active session;
- flatness;
- transition completion;
- order terminality;
- broker health.

Frontend may display:

- `transitionState`;
- `transitionId`;
- `epoch`;
- `sourceSession`;
- `targetSession`;
- `lastReconciledAt`;
- `sourcePositionsCount`;
- `sourceOpenOrdersCount`;
- `warnings`;
- `safeModeReason`.

Reasoning: raw websocket/UI state is not authoritative in a cross-broker transition.

### I6 - Pattern Bank Isolation During Transitions

No live transition path writes directly into canonical pattern banks.

Required behavior:

- live inference writes to an append-only inference log;
- training/promotion reads matured labeled outcomes later;
- source session and target session use explicit pattern-bank version handles;
- pattern-bank handle is erased and reloaded during `UNLOAD_SOURCE` / `LOAD_TARGET`;
- source-session pattern memory cannot remain in RAM for target-session inference.

Reasoning: a session swap is also a data-boundary swap. Pattern-bank pollution is state pollution.

---

## Minimal Local Data Files

Use a small set of local JSON/JSONL files first. These can later become database tables without changing the invariants.

```text
data/session-router/
  transition-lock.json
  transition-state.json
  transition-events.jsonl
  broker-intents.jsonl
  reconciliation-snapshots.jsonl
  emergency-reset-snapshots.jsonl
```

### `transition-state.json`

```json
{
  "transitionId": "stocks-to-crypto-2026-05-20T20:49:00Z",
  "epoch": 42,
  "state": "RECONCILING",
  "sourceSession": "stocks",
  "targetSession": "crypto",
  "sourceBroker": "alpaca",
  "targetBroker": "kraken",
  "freezeNewEntries": true,
  "startedAt": "...",
  "updatedAt": "...",
  "lastReconciledAt": "...",
  "sourcePositionsCount": 0,
  "sourceOpenOrdersCount": 1,
  "safeModeReason": null
}
```

### `transition-events.jsonl`

Append-only examples:

```jsonl
{"seq":1,"epoch":42,"event":"TRANSITION_PLANNED","source":"stocks","target":"crypto","at":"..."}
{"seq":2,"epoch":42,"event":"FREEZE_SOURCE","at":"..."}
{"seq":3,"epoch":42,"event":"ORDER_INTENT_RECORDED","intentId":"...","at":"..."}
{"seq":4,"epoch":42,"event":"BROKER_ORDER_ACK","intentId":"...","externalOrderId":"...","at":"..."}
{"seq":5,"epoch":42,"event":"RECONCILIATION_SNAPSHOT","positions":0,"openOrders":0,"at":"..."}
{"seq":6,"epoch":42,"event":"TARGET_ACTIVATED","target":"crypto","at":"..."}
```

Reasoning: append-only events make postmortem, replay, and Mercury attacks much easier than opaque state mutation.

### `emergency-reset-snapshots.jsonl`

Append one record before any standalone `emergencyReset`, forced recovery reset, or transition-recovery reset clears runtime state.

Minimum fields:

- reset reason;
- caller or operator identity if available;
- current transition state;
- current epoch;
- source and target session;
- broker account scope;
- known open orders;
- known positions;
- latest reconciliation summary;
- pattern-bank handle identifiers;
- KillSwitch state;
- timestamp.

If the snapshot cannot be written, the reset fails closed and alerts the operator. The bot must not erase state first and reconstruct the audit trail after the fact.

---

## Session Transition State Machine

Use explicit states, not boolean flags.

```text
IDLE
PLANNED
FREEZE_SOURCE
LIQUIDATE_SOURCE
WARN_NOT_FLAT
FORCE_CLOSE
RECONCILE_SOURCE
SNAPSHOT_SOURCE
UNLOAD_SOURCE
LOAD_TARGET
WARM_TARGET
ACTIVE_TARGET
FAILED_SAFE_MODE
RECOVERY_REQUIRED
```

Allowed forward path:

```text
IDLE
-> PLANNED
-> FREEZE_SOURCE
-> LIQUIDATE_SOURCE
-> RECONCILE_SOURCE
-> SNAPSHOT_SOURCE
-> UNLOAD_SOURCE
-> LOAD_TARGET
-> WARM_TARGET
-> ACTIVE_TARGET
-> IDLE
```

Failure path:

```text
any nonterminal state
-> FAILED_SAFE_MODE
-> RECOVERY_REQUIRED
```

No direct jump from `LIQUIDATE_SOURCE` to `ACTIVE_TARGET`. Reconciliation is mandatory.

---

## Highest-Value Fixes To Add To The Phase 1/3 Design

### Fix A - Durable Transition Journal

Add `SessionTransitionCoordinator` with append-only journal and transition-state file.

Blast radius: local to SessionRouter implementation.

Why high value: makes crash recovery and audit possible without platform migration.

### Fix B - Transition Epoch Fencing

Add monotonically increasing `epoch` to all transition state, broker intents, pattern-bank handles, and dashboard status.

Any stale event from an older epoch is recorded but cannot activate target state.

Why high value: blocks late websocket/order callbacks from a prior session contaminating the current session.

### Fix C - Entry Freeze Gate In Strategy Path

Before any strategy opens a new position, check:

```text
transitionState.freezeNewEntries === false
transitionState.state in [IDLE, ACTIVE_TARGET]
transitionState.epoch === activeRuntimeEpoch
```

Emergency closes remain allowed.

Why high value: prevents the bot from opening fresh source-session risk while transition liquidation is already underway.

### Fix D - Broker Intent Map

Every cancel, liquidate, force-close, subscribe, unsubscribe, and active-broker switch gets an intent ID.

Start with order intents first:

- cancel source open orders;
- T-11min liquidation sells;
- T-30sec force-close sells;
- target warmup subscriptions.

Why high value: eliminates duplicate order submission during retries.

### Fix E - REST Reconciliation Gate

At every transition boundary:

- after cancel;
- after liquidation;
- after force close;
- before target activation;
- after target warmup.

Query broker REST truth and append a reconciliation snapshot.

Why high value: catches missing websocket callbacks and delayed fills.

### Fix F - UI Projection Contract

Dashboard reads transition state from backend endpoint only.

Minimum endpoint:

```text
GET /api/session-router/status
```

Response includes epoch, state, source/target, flatness, open orders, last reconciliation, safe mode reason.

Why high value: prevents frontend confidence theater during a dangerous transition.

### Fix G - Pattern-Bank Handle Erasure

During `UNLOAD_SOURCE`:

- close source pattern-bank handle;
- clear in-memory feature cache;
- clear candle warmup buffers;
- clear strategy-local source session memory;
- record `PATTERN_BANK_UNLOADED(epoch, sourceSession, bankVersion)`.

During `LOAD_TARGET`:

- load target pattern-bank handle by `{assetClass, symbol, timeframe, mode, version}`;
- record `PATTERN_BANK_LOADED(epoch, targetSession, bankVersion)`.

Why high value: this directly prevents the known BTC/TSLA pattern-bank contamination class.

### Fix H - emergencyReset Pre-Reset Audit Snapshot

Before `emergencyReset` clears SessionRouter runtime state, it writes an append-only snapshot of the current transition state, epoch, broker scope, orders, positions, reconciliation summary, pattern-bank handles, KillSwitch state, caller, reason, and timestamp.

Why high value: preserves Wolf A5 and makes standalone operator resets auditable instead of relying on the normal transition journal path.

---

## What Not To Build Yet

Do not introduce these as prerequisites for the current bot hardening:

- PostgreSQL event store;
- Temporal;
- Kafka or Redpanda;
- Debezium;
- etcd;
- MLflow;
- Kubernetes;
- multi-service deployment;
- full CQRS projection service.

These are valid future product architecture choices. They are not required to close the current SessionRouter corruption risk.

The local design should preserve migration seams:

- JSONL events can become database events;
- transition-state file can become transition table;
- broker-intent map can become idempotency table;
- lock file can become etcd lease;
- status endpoint can become CQRS projection.

---

## Test Matrix For Current Repo

### Unit Tests

| Test | Expected |
|---|---|
| duplicate transition start with fresh lock | second start refused |
| stale lock present | enters `RECOVERY_REQUIRED`, no auto second transition |
| stale epoch broker callback arrives | recorded, ignored for activation |
| duplicate broker intent replay | no duplicate broker submit |
| entry signal during `FREEZE_SOURCE` | open blocked, emergency close allowed |
| target activation with source open order count > 0 | activation refused |
| target activation with source position count > 0 | activation refused |
| emergencyReset invoked with live transition state | pre-reset audit snapshot written before state erasure |
| emergencyReset snapshot write fails | reset blocked, operator alert required |

### Integration Tests With Fake Broker

The fake broker should intentionally violate happy-path assumptions:

| Injected broker behavior | Expected |
|---|---|
| order submit times out but broker accepted it | retry queries by client order ID, no duplicate |
| cancel ack arrives, then partial fill arrives | remaining qty updates, reconciliation continues |
| duplicate filled callback | final filled qty unchanged |
| no websocket callback for market sell | REST reconciliation still marks flat |
| force-close reject at T-30sec | transition goes `FAILED_SAFE_MODE`, SMS/operator alert |
| one source position remains at T-0 | target session does not activate |
| websocket stream gap during transition | stream marked degraded, REST reconciliation required |

### P0 Anchor

SessionRouter hardening that does not touch trade-path execution may skip automatic anchor in pipeline, but any change to `run-empire-v2.js`, `StateManager`, `StrategyOrchestrator`, `OrderExecutor`, broker adapters, pattern memory, or candle warmup requires:

```text
$13,213.042341608163
```

Exact reproduction or halt.

---

## Engineering Decisions Codex Should Make Later

Codex should decide these during implementation, not ask the operator:

- lock stale threshold;
- event file rotation cadence;
- broker intent ID formatting per broker length limits;
- REST reconciliation polling cadence;
- fake broker failure scenario coverage;
- exact status endpoint shape;
- whether local transition files live under `data/session-router/` or `data/accounts/<account>/session-router/`;
- whether lock recovery requires manual operator ack or can auto-resume after flatness proof.

Recommended defaults:

- lock stale threshold: 2x heartbeat interval, heartbeat every 5 seconds during transition;
- reconciliation polling: every 2 seconds during active transition, backoff after safe mode;
- lock recovery: manual ack unless broker REST proves source flat and no open orders;
- event files: JSONL, one file per day plus transition ID in each record;
- broker intent IDs: deterministic, short, broker-safe hash suffix, full intent stored locally.

---

## Final Implementation Rule

Never activate the target session because the transition code "finished."

Activate the target session only because broker reconciliation proved the source session is flat, source open orders are gone, the transition epoch is current, and the target session has been loaded with fresh state and correct pattern-bank handles.

That is the safety line.
