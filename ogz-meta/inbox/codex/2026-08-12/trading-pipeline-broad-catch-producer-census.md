# Trading Pipeline Broad-Catch Producer Census

Date: 2026-08-12
Scope: Read-only subagent census ordered after the SessionRouter transition-handler wrapper challenge.
Runtime changes in this commit: only the SessionRouter transition runtime-scope producer fix.

## Ruling

The broad `run-empire-v2.js` transition-handler wrapper was a producer-smell:
the runner re-derived target symbol/scope after SessionRouter had already
declared transition success. Fixed in this wave by moving runtime-scope proof and
dashboard scope write into `SessionRouter` before `transition` is emitted.

Everything below is a named follow-on lane. It was not bundled into this commit.

## Run-Empire Findings

| Site | Wrapped Work | Classification | Upstream Fix Shape |
| --- | --- | --- | --- |
| `run-empire-v2.js:1827` | Startup branch covering backtest/live connect, persisted exit-intent reconciliation, broker identity sync, REST hydration, subscriptions, runtime module startup, and exit monitor start. | Internal producer masking; catch can call shutdown and exit 0. | Split startup phases. Let internal config/scope/reconciliation failures exit nonzero. Route external broker failures with trace and explicit fail-closed status. |
| `run-empire-v2.js:2526` | Exit monitor ctx handoff plus per-symbol `checkExitsOnly(symbol)`. | Exit-path masking; positions can remain open while interval keeps running. | Validate active-trade symbol/scope before handoff. External broker/order failures route as typed exit-degraded or symbol-halt events; internal invalid state pauses/halt affected scope. |
| `run-empire-v2.js:2501` | TTP cutoff enforcer inside exit-monitor timer. | Likely masking; cutoff enforcement is trading-path safety. | Preflight symbols, broker names, router, and execution route before interval. On enforce failure, block affected stock entries and trace degraded cutoff state. |
| `run-empire-v2.js:1113` | Per-symbol `new SymbolTradingContext(...)`; failed symbol logs and skips. | Internal producer masking; can run partial trading universe. | Normalize and validate full symbol set/timeframe first. Build temp context map; fail startup or disable route if any required context cannot be built. |
| `run-empire-v2.js:2804` | Liveness watchdog REST backfill. | Masking; internal scope/timeframe/broker defects are treated like recoverability noise. | Preflight liveness symbol/timeframe/broker/scope. Distinguish external REST outage from internal scope defect; block entries until fresh data is proven where needed. |
| `run-empire-v2.js:1817` | `this.trai.initialize()`. | Conditional masking. | Resolve TRAI posture before startup: optional shadow can degrade with trace/status; required decision/veto TRAI fails closed or blocks entries. |

## Core Findings

| Site | Wrapped Work | Classification | Upstream Fix Shape |
| --- | --- | --- | --- |
| `core/OrderExecutor.js:3176-5305` | Whole execution body after pre-order gates, including broker/webhook send, state mutation, proof/logger/performance side effects. | Internal producer masking with dangerous post-side-effect normalization. | Split phases. Prove internal plan/state/logger inputs before broker send. After order acceptance, preserve accepted/unknown truth and route state/log failures to reconciliation/halt, never generic unaccepted block. |
| `core/StateManager.js:912-971` | `_applyStateUpdatesLocked` validation, mutation, transaction log, listener notify, save. | Internal producer masking plus partial-mutation risk. | Build and validate next state before assignment. Commit state narrowly. Move listener/dashboard work after commit. Make persistence outcome explicit to callers. |
| `core/StateManager.js:2944-2988` | `applyFill` contract validation. | Internal producer masking when fed by `OrderExecutor._buildExecutionFill`. | Prove fill facts in OrderExecutor before acceptance when possible; after acceptance, malformed internal fill construction becomes reconciliation/halt with accepted-order truth preserved. |
| `core/StateManager.js:3782-3831` | `save`: config read, path resolution, active-trade quarantine/reconcile, snapshot, atomic disk write. | Mixed external boundary with unsafe landing. | Separate snapshot/quarantine validation from file I/O. Return persistence status so live state mutations can trace and fail closed appropriately. |
| `core/SessionRouter.js:1161-1237`, `core/SessionRouter.js:1248-1373` | Whole scheduled session transitions. | Mixed, not silent, but deterministic invariants can still be checked too late. | Pull deterministic config/symbol/session invariants before transition lock, pause, and broker side effects. Keep failed-safe wrapper only for true external transition failures. |

## Non-Findings

- `core/ExitContractManager.js`: no `try`/`catch` matches.
- `core/TradingLoop.js`: `analyzeAndTrade` and `checkExitsOnly` use `try/finally`, not broad catch masking.
- `core/SessionRouter.js:_executeBrokerIntent`: true adapter boundary pattern; catches side-effect failure, records failed intent, then rethrows; commit failure after side effect marks recovery required.

## Deferred

Deferred by scope: all findings except the transition-handler producer smell fixed
in this commit. Each remaining row needs its own producer-census/fix commit; none
should be quietly folded into unrelated batch work.
