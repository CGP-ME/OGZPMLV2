# SessionRouter Final Sign-Off Addendum

**Date:** 2026-05-20
**Companion to:** `02-ARCHITECTURE-DESIGN.md`
**Status:** Draft for operator sign-off
**Scope:** Final reconciled SessionRouter architecture requirements from Codex addenda, Wolf verified findings, and platform switching research.

This document is the sign-off bridge between the architecture design and future SessionRouter implementation. It does not implement code. It records what must be true when SessionRouter Phase 1 and Phase 3 are implemented.

---

## Source Documents

This final addendum reconciles these inputs:

1. `02-ARCHITECTURE-DESIGN.md`
2. `02-ARCHITECTURE-DESIGN-ADDENDUM-LIQUIDATION-TIMING-2026-05-19.md`
3. `02-ARCHITECTURE-DESIGN-ADDENDUM-SESSIONROUTER-SAGA-INVARIANTS-2026-05-20.md`
4. Wolf `PLATFORM-VISION-VERIFIED-FINDINGS-2026-05-19.md`
5. Operator research on cross-broker crypto-stock switching platform architecture

Authoritative P0 anchor remains:

```text
$13,213.042341608163
```

The archived pre-Fix-2 number `$18,497.278595001146` is not a live regression gate.

---

## Final Adjudication

### Codex Addendum Is Canonical For SessionRouter Saga Design

Codex's `SESSIONROUTER-SAGA-INVARIANTS` addendum is canonical for the core SessionRouter transition architecture:

- transition is a saga, not an ACID transaction;
- durable local transition journal;
- transition epoch fencing;
- single writer during transition;
- broker intent map;
- REST reconciliation gate;
- UI projection contract;
- pattern-bank handle erasure at every swap;
- explicit `FAILED_SAFE_MODE` and `RECOVERY_REQUIRED` states;
- fake broker adversarial test matrix.

These requirements replace any looser SessionRouter language in earlier docs.

### Liquidation Timing Addendum Is Canonical For Session-Close Timing

The liquidation timing addendum is canonical for:

- broker-sourced market calendar;
- Alpaca `/v2/clock` and `/v2/calendar`;
- no hardcoded session close time inside SessionRouter;
- T-11min liquidation;
- T-6min warning;
- T-1min final warning;
- T-30sec force close;
- unlimited slippage only at T-30sec FORCE_CLOSE;
- zero-open-source-position gate at `next_close`;
- safe-mode if final flatness cannot be proven.

### Wolf Verified Findings Are Canonical For Cross-Cutting Hardening

Wolf findings remain canonical where they cover risks outside the SessionRouter saga core:

- KillSwitch is built but unwired;
- graceful shutdown does not force-flat;
- bracket order children must be cancelled before FORCE_CLOSE;
- FORCE_CLOSE must use current remaining position size, not original entry size;
- CandleProcessor inherits the calendar-source decision;
- Alpaca order lifecycle states need explicit handling;
- `trade_updates` stream has no consumer today;
- existing ExchangeReconciler is Kraken-only and must not be mistaken for complete Alpaca truth.

Items that overlap Codex are merged into the Codex implementation frame:

- A1 client order ID becomes Codex Fix D broker intent map;
- A4 broker reconciliation becomes Codex Fix E REST reconciliation gate plus a low-frequency active-session drift monitor;
- pattern bank isolation becomes Codex Fix G and happens at every swap, not later in Fort-Knox only;
- single-writer principle becomes Codex Invariant I2 and is enforceable during transition now.

---

## Final Non-Negotiable Invariants

### S1 - Broker Calendar Is Authoritative

SessionRouter uses broker-sourced calendar and clock data for stocks session open/close.

Minimum Phase 1 work:

- add `getClock()` to AlpacaAdapter;
- add `getCalendar(start, end)` to AlpacaAdapter;
- add optional interface methods to `IBrokerAdapter`;
- decide and document local `MarketCalendar.js` disposition.

`MarketCalendar.js` may remain only as a fallback cache or compatible provider. It must not remain the authoritative source for SessionRouter session boundaries.

### S2 - Armed Timer Requires Fresh Clock Confidence

Neither Codex nor Wolf caught this initially.

If SessionRouter arms liquidation timers from `next_close`, it must keep proving the clock source is fresh while the timer remains armed.

Implementation requirement:

- store `next_close`, `clockFetchedAt`, and `clockSource`;
- refresh `/v2/clock` during active session;
- if clock refresh becomes stale inside the close window, enter degraded transition mode;
- if already inside the final liquidation window, prefer flattening source exposure over waiting for perfect clock confidence;
- do not activate target session unless final broker REST reconciliation proves source flat.

Recommended default:

- clock stale warning: no successful refresh for 2 polling intervals;
- close-window stale mode: no successful refresh inside the last 15 minutes;
- final hammer rule: if there is an open source position and the last known broker `next_close` is approaching, flatten rather than carry unmanaged exposure.

Reasoning: stale clock data can make timers wrong, but carrying an intraday position unmanaged past close is worse than force-flattening from the last broker-confirmed schedule.

### S3 - Single Transition Owner Per Account Scope

Only one transition may be active for a given account/session scope.

Local requirement:

- `transition-lock.json` or equivalent exclusive local lock;
- `transitionId`;
- monotonically increasing `epoch`;
- heartbeat;
- stale-lock handling;
- `RECOVERY_REQUIRED` state instead of blind second transition.

Future product architecture can replace local lock with etcd lease/election. The invariant stays the same.

### S4 - Account-Level Concurrency Must Be Fenced

Neither Codex nor Wolf caught this initially.

A local process lock prevents two bot processes on the same machine. It does not prevent the operator from running two bots against the same Alpaca account from different machines.

Implementation requirement:

- define `accountScopeKey = broker + accountId + environment`;
- every live/paper bot writes an account ownership heartbeat;
- if another owner heartbeat exists for the same account scope, bot starts in blocked/read-only mode unless explicitly overridden by operator;
- all broker intents include account scope and epoch;
- reconciliation status reports active owner identity.

Local minimum:

```text
data/account-locks/<broker>-<accountId>-<env>.json
```

This is not perfect cross-machine coordination unless the file lives on shared storage. If no shared coordination exists, SessionRouter must still detect the risk as a startup warning and require explicit operator acknowledgement for live/paper mode.

Future product architecture can replace this with DB/etcd account ownership. The current bot still needs the concept.

### S5 - Freeze New Entries During Transition

Strategy path must block new entries while transition state is not safe.

Allowed during transition:

- emergency close;
- liquidation;
- broker reconciliation;
- state snapshot;
- alerting.

Blocked during transition:

- new source-session entry;
- new target-session entry before `ACTIVE_TARGET`;
- pattern-bank promotion;
- UI-triggered discretionary order unless explicitly marked emergency and operator-approved.

Minimum check before opening a position:

```text
transitionState.freezeNewEntries === false
transitionState.state in [IDLE, ACTIVE_TARGET]
transitionState.epoch === activeRuntimeEpoch
killSwitch.isKillSwitchOn() === false
```

### S6 - Broker Intent IDs Are Mandatory

Every transition side effect needs a stable intent ID.

Applies to:

- cancel source open orders;
- normal liquidation;
- force close;
- subscribe/unsubscribe;
- active-broker switch;
- source snapshot;
- target warmup.

For Alpaca order submission, the intent maps to `client_order_id`. For other brokers, it maps to the closest native client order ID or local external-order map.

On retry:

- check local intent map first;
- query broker by client/native ID if supported;
- reconcile before resubmit;
- never submit duplicate orders from the same intent.

### S7 - Broker Order Lifecycle States Are Explicit

The implementation must model broker order lifecycle states instead of treating submit/cancel as binary success/failure.

Alpaca minimum states:

- `new`
- `accepted`
- `pending_new`
- `partially_filled`
- `filled`
- `done_for_day`
- `canceled`
- `expired`
- `replaced`
- `pending_cancel`
- `pending_replace`
- `accepted_for_bidding`
- `stopped`
- `rejected`
- `suspended`
- `calculated`
- broker liquidation / external close events where available from stream payloads

SessionRouter does not need every state to have complex behavior on day one, but it must classify them into:

- terminal success;
- terminal failure;
- nonterminal in flight;
- externally closed/liquidated;
- ambiguous requires REST reconciliation.

No transition gate may depend only on a single callback.

### S8 - `trade_updates` Consumer Is Live/Paper Only

Neither Codex nor Wolf caught this initially.

Alpaca account stream and `trade_updates` handling must not accidentally attach to backtest mode.

Requirement:

- consumer active only in live/paper broker runtime;
- disabled in backtest mode;
- disabled in deterministic P0 runs;
- no fake websocket required for backtest path unless a future test explicitly injects one;
- stream events must be tagged with account scope and transition epoch before mutating any local state.

Reasoning: a live broker event consumer in backtest mode can create nondeterminism and contaminate the regression path.

### S9 - Broker REST Truth Gates Target Activation

Target session activation requires REST reconciliation against source broker.

Before `ACTIVE_TARGET`:

- source open positions count is zero;
- source open orders count is zero;
- no pending source-session bracket children remain;
- source broker account/margin state is not degraded beyond configured threshold;
- local state agrees with broker truth or records a tolerated zero-risk mismatch.

For current intraday-flat behavior, tolerated source exposure is zero.

### S10 - Bracket Children Cancel Before FORCE_CLOSE

Before T-30sec FORCE_CLOSE:

1. Query open orders for source symbol/account.
2. Identify bracket child orders linked to the source position.
3. Cancel stop-loss and take-profit children.
4. Confirm cancel or mark pending cancel.
5. Submit no-slippage-cap market close using current remaining position size.
6. Reconcile.

Reasoning: force-closing a position while bracket children remain active can create double-close or unintended short exposure.

### S11 - FORCE_CLOSE Uses Current Remaining Size

FORCE_CLOSE must use broker REST position size or local remaining size confirmed by broker reconciliation.

It must not use original entry size.

If tiered exits reduced the position from 100 percent to 40 percent, FORCE_CLOSE sells 40 percent, not 100 percent.

If local remaining size and broker position size disagree, broker REST position size wins for force-close quantity, and the mismatch is recorded.

### S12 - Pattern-Bank Handles Are Erased And Reloaded At Every Swap

During `UNLOAD_SOURCE`:

- close source pattern-bank handle;
- clear feature cache;
- clear candle warmup buffers;
- clear strategy-local source session memory;
- record unloaded bank version.

During `LOAD_TARGET`:

- load target bank by `{assetClass, symbol, timeframe, mode, version}`;
- record loaded bank version;
- block target inference until load completes.

This is required even before full Fort-Knox implementation.

### S13 - UI Projection Contract

Frontend must use backend SessionRouter status, not raw websocket inference.

Minimum endpoint:

```text
GET /api/session-router/status
```

Minimum fields:

```json
{
  "transitionId": "...",
  "epoch": 42,
  "state": "RECONCILE_SOURCE",
  "sourceSession": "stocks",
  "targetSession": "crypto",
  "sourcePositionsCount": 0,
  "sourceOpenOrdersCount": 0,
  "lastReconciledAt": "...",
  "clockFresh": true,
  "safeModeReason": null,
  "warnings": []
}
```

UI may render this state. UI may not derive transition truth from broker websocket fragments.

### S14 - KillSwitch Is Wired Into Entry And Transition Paths

KillSwitch is a safety floor and must be live before SessionRouter activation.

Minimum checks:

- startup;
- each trading cycle before new entry;
- before target session activation;
- before non-emergency broker command;
- dashboard status.

Emergency close remains allowed when KillSwitch is on.

### S15 - Graceful Shutdown Force-Flats Or Records Emergency State

Shutdown cannot silently leave positions unmanaged.

On SIGINT/SIGTERM in live/paper mode:

1. freeze new entries;
2. query open positions;
3. attempt force-flat with broker intents;
4. reconcile;
5. if flat, exit cleanly;
6. if not flat within timeout, write emergency shutdown state and alert operator.

Backtest mode must not invoke live broker force-flat.

### S16 - CandleProcessor Uses The Same Calendar Authority

When SessionRouter moves from local calendar to broker-backed calendar, CandleProcessor cannot keep using a divergent local calendar for expected-close/gap logic.

Acceptable paths:

- Path A: `MarketCalendar.js` becomes broker-fed fallback/cache and CandleProcessor consumes it transparently.
- Path B: CandleProcessor receives a `MarketCalendarProvider` dependency that can be broker-backed in live/paper and deterministic in backtest.

No future design may have SessionRouter and CandleProcessor disagreeing about half-days, holidays, or emergency closures.

### S17 - emergencyReset Writes A Pre-Reset Audit Snapshot

`emergencyReset` is not allowed to erase runtime state first and explain itself later.

Before any standalone operator reset, forced recovery reset, or transition-recovery reset clears SessionRouter state, it must write an append-only pre-reset audit snapshot.

Minimum snapshot contents:

- reset reason;
- operator or caller identity if available;
- current transition state;
- current epoch;
- active source/target session;
- broker account scope;
- known open orders;
- known positions;
- latest reconciliation summary;
- pattern-bank handle identifiers;
- KillSwitch state;
- timestamp.

The reset may then clear volatile runtime handles and move to `RECOVERY_REQUIRED` or a fresh `IDLE` state only after the snapshot write succeeds. If the snapshot write fails, `emergencyReset` must fail closed and alert the operator instead of silently erasing state.

This preserves Wolf A5 explicitly. Transition journal writes cover normal saga states; `emergencyReset` needs its own pre-reset audit rule because it may be invoked outside the normal transition path.

---

## Required Local Files

Initial local implementation can use files under:

```text
data/session-router/
  transition-lock.json
  transition-state.json
  transition-events.jsonl
  broker-intents.jsonl
  reconciliation-snapshots.jsonl
  emergency-reset-snapshots.jsonl
```

If account-level ownership is implemented locally:

```text
data/account-locks/
  <broker>-<accountId>-<env>.json
```

These are migration seams. They can become database tables later without changing the architecture.

---

## Final Phase Placement

### Phase 1 - Pre-Apex-Safe Additive Work

These can land before SessionRouter activation because they add methods, gates, or status plumbing without changing live trading behavior when disabled:

- AlpacaAdapter `getClock()`;
- AlpacaAdapter `getCalendar(start, end)`;
- optional `IBrokerAdapter` clock/calendar interface;
- KillSwitch read checks in entry path;
- local transition-state data structures;
- broker intent ID helper;
- account scope key helper;
- status endpoint shape;
- fake broker test harness;
- CandleProcessor calendar-provider seam if kept behavior-equivalent in P0.

Any trade-path touched by these changes requires P0 anchor reproduction.

### Phase 3 - SessionRouter Completion

These land when SessionTransitionCoordinator is implemented:

- transition lock and epoch fencing;
- transition journal writes;
- freeze gate;
- liquidation timing sequence;
- order intent persistence;
- explicit order lifecycle classification;
- trade_updates live/paper consumer;
- REST reconciliation gate;
- `emergencyReset` pre-reset audit snapshot;
- bracket children cancellation;
- remaining-size force-close;
- pattern-bank handle unload/load;
- target warm mode and active mode;
- failed safe mode;
- recovery required state;
- dashboard status endpoint integration.

### Cross-Cutting Hardening

These are not SessionRouter-only, but must be scheduled with or before SessionRouter activation:

- graceful shutdown force-flat;
- account-level concurrency detection;
- active-session low-frequency drift reconciliation;
- standalone operator reset audit path;
- UI projection discipline;
- model/pattern-bank version tagging.

---

## Final Test Matrix

### Unit Tests

| Test | Expected |
|---|---|
| duplicate transition start with fresh lock | second start refused |
| stale lock exists | enters `RECOVERY_REQUIRED`, no blind second transition |
| stale epoch callback arrives | recorded, ignored for activation |
| duplicate broker intent replay | no duplicate broker submit |
| entry signal during freeze | open blocked, emergency close allowed |
| KillSwitch on | new entries blocked, emergency close allowed |
| target activation with source open orders | refused |
| target activation with source position | refused |
| bracket children exist before force close | children cancel attempted before market close |
| remaining size lower than entry size | force close uses remaining/broker size |
| emergencyReset invoked with live state | pre-reset audit snapshot written before state erasure |
| emergencyReset snapshot write fails | reset blocked, operator alert required |
| trade_updates in backtest mode | consumer disabled |
| CandleProcessor half-day provider mismatch | test fails; shared provider required |

### Integration Tests With Fake Broker

Fake broker must intentionally violate happy-path assumptions.

| Injected behavior | Expected |
|---|---|
| order submit times out but broker accepted it | retry queries by client ID, no duplicate |
| cancel ack arrives, then partial fill arrives | remaining qty updates, transition stays blocked until reconciliation |
| duplicate fill event | final filled qty unchanged |
| no websocket callback for market sell | REST reconciliation still marks flat |
| force-close reject at T-30sec | `FAILED_SAFE_MODE`, operator alert |
| source position still open at T-0 | target does not activate |
| websocket gap during transition | stream degraded, REST reconciliation required |
| broker clock stale inside close window | degraded mode, no target activation without flatness proof |
| two owners for same account scope | live/paper mode blocks or requires explicit operator override |
| Alpaca liquidation event arrives externally | local state marks externally closed/liquidated and reconciles |

### Anchor Tests

Any change touching trade-path behavior requires exact P0 reproduction:

```text
$13,213.042341608163
```

Files that should trigger P0 by default:

- `run-empire-v2.js`
- `core/StateManager.js`
- `core/StrategyOrchestrator.js`
- `core/OrderExecutor.js`
- `core/CandleProcessor.js`
- broker adapters
- pattern memory files
- candle warmup/backfill logic
- SessionRouter activation paths

---

## What Not To Build For This Campaign

Do not make these prerequisites for the current SessionRouter hardening:

- PostgreSQL migration;
- Temporal;
- Kafka/Redpanda;
- Debezium;
- etcd;
- MLflow;
- Kubernetes;
- service mesh;
- full CQRS projection service.

These are valid future product-stack directions. The current campaign uses local equivalents that preserve the invariants and migration seams.

---

## Operator Sign-Off Items

The operator is signing off on these WHAT decisions:

- SessionRouter transition is treated as a saga.
- Broker calendar/clock is authoritative for stocks session timing.
- T-30sec FORCE_CLOSE has unlimited slippage.
- Target session activation requires source flatness and zero source open orders.
- Pattern-bank handle erasure happens at every swap.
- UI must read backend SessionRouter status rather than infer transition truth.
- Local equivalents are acceptable now; full platform stack is not required before Apex eval.
- KillSwitch and shutdown flatness are required safety floors before SessionRouter activation.
- Account-level same-broker-account concurrency must be detected or operator-acknowledged.

Codex owns these HOW decisions during implementation:

- exact local file shapes;
- lock heartbeat cadence;
- stale-clock thresholds;
- broker intent ID formatting;
- order lifecycle classification implementation;
- emergency-reset snapshot schema;
- fake broker test harness structure;
- reconciliation cadence;
- alert payload formatting;
- whether `MarketCalendar.js` becomes fallback cache or is replaced by provider injection.

---

## Sign-Off Block

Operator review:

```text
APPROVED / REVISE / REJECT

Decision notes:


Signed:
Date:
```

---

## Final Safety Line

Never activate the target session because the transition code reached the end of a function.

Activate the target session only because broker reconciliation proved source positions are flat, source open orders are gone, bracket children are gone, the transition epoch is current, the clock/calendar gate is acceptable, KillSwitch allows activation, and target state/pattern-bank handles were loaded fresh.
