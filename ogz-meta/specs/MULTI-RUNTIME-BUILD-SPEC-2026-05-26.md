# Multi-Runtime Build Spec - 2026-05-26

## Purpose

This is the build contract for the next implementation pass after the
Sourcegraph DeepSearch audit at `7f7cd6a`. It converts the full architecture
docs, the staged multi-runtime spec, and the DeepSearch findings into one
commit-by-commit execution ladder.

This document is not a rewrite license. Each item below is one logical change.
Runtime changes still require the normal gates: focused checks, Mercury
adversarial attack for hot paths, and P0 or the declared replacement gate.

## Current Evidence Snapshot

Source branch used for the audit:

```text
rebuild/clean-from-baseline @ 7f7cd6a47aeab883782f53c24bb7fa9a3f326893
```

Current canonical multi-runtime P0 gate:

```text
finalBalance: 13255.255799695915
totalTrades: 1410
winRate: 60.6
profitFactor: 1.71
```

Ground-truth files:

- `ogz-meta/specs/MULTI-RUNTIME-IMPLEMENTATION-SPEC-2026-05-25.md`
- `ogz-meta/specs/MULTI-RUNTIME-GATE-FRAMEWORK-2026-05-26.md`
- `ogz-meta/specs/MULTI-RUNTIME-CAPABILITY-AUDIT-2026-05-25.md`
- `ogz-meta/codex-design/01-GROUND-TRUTH-INVENTORY.md`
- `ogz-meta/codex-design/02-ARCHITECTURE-DESIGN.md`
- `ogz-meta/codex-design/03-IMPLEMENTATION-SEQUENCE.md`
- `ogz-meta/codex-design/02-ARCHITECTURE-DESIGN-ADDENDUM-SESSIONROUTER-SAGA-INVARIANTS-2026-05-20.md`
- `core/SessionRouter.js`
- `core/StateManager.js`
- `core/PositionTracker.js`
- `core/OrderExecutor.js`
- `core/CandleProcessor.js`
- `core/BacktestRunner.js`
- `core/PatternMemoryBank.js`
- `core/UnifiedPatternMemory.js`
- `ogz-meta/gates/multi-runtime-gate-runner.js`

## Already Landed And Gated

The first scoped visibility slice is already present in the current code:

- `StateManager.openPosition()` refuses null-symbol trades and stamps trade
  scope fields before writing active trades.
- `StateManager._buildScopedDashboardPositions()` projects active trades as
  scoped dashboard rows.
- `OrderExecutor._dashboardTradePayload()` carries scope from the trade record.
- `PositionTracker` close selection requires `tradeId` or exact scope.
- `open-positions.js` prefers backend `state.positions[]` before legacy scalar
  inference.
- `ogz-meta/gates/multi-runtime-gate-runner.js` contains P0 plus four scope
  gates.

Important remaining frontend gap:

- `public/js/panels/open-positions.js` still uses a legacy key of
  `symbol|broker|openedAt`. That is enough for current single-account display,
  but it is not enough for multi-account or multi-timeframe display.

## Red Blockers Before Expansion

These are not optional cleanup items. They block broader runtime activation.

1. `core/SessionRouter.js` resumes trading after transition failure.
   The catch blocks in `_transitionToStocks()` and `_transitionToCrypto()`
   call `resumeTrading()` after a failed transition. That is the inverse of
   the saga invariant. SessionRouter must fail closed.

2. `core/SessionRouter.js` has no durable transition state.
   `transitionInProgress` is an in-memory boolean. There is no transition
   journal, epoch, lock, broker intent map, or recovery-required state.

3. Candle ingress is not yet a scope contract boundary.
   The staged spec requires every candle that can create a decision to carry
   immutable runtime scope. That is not executable yet.

4. Pattern memory is not yet scope-isolated.
   The architecture requires learned state to be isolated by mode/source,
   asset class, broker/account where relevant, symbol, timeframe, and strategy.

5. P0 remains a single-lane regression gate.
   P0 proves the TSLA EMASMACrossover lane. It does not prove multi-symbol,
   multi-timeframe, broker reconciliation, pattern isolation, or SessionRouter
   transition safety.

## Build Ladder

### Commit 1 - Add dormant SessionRouter TransitionStore

Files:

- `core/session-router/TransitionStore.js` (new)
- `test` or `tests` file matching the repo's existing test convention

Behavior:

- Owns `data/session-router/transition-state.json`.
- Writes state atomically using temp file plus rename.
- Appends immutable events to `data/session-router/transition-events.jsonl`.
- Maintains monotonic `epoch`.
- Exposes `readStatus()` for a backend status projection.
- Does not import into `core/SessionRouter.js`.
- Does not change broker, state, order, dashboard, or PM2 behavior.

Required tests:

- Missing files return an idle/empty status projection.
- Fresh lock refusal works.
- Stale lock returns `RECOVERY_REQUIRED`.
- Corrupt state fails closed.
- Append-only event ordering is preserved.
- Epoch increments monotonically.

Gates:

- `node --check core/session-router/TransitionStore.js`
- focused TransitionStore tests
- no P0 required
- no Mercury required unless the test harness touches hot-path runtime code

Deploy risk:

- none

Rollback:

- delete the unused file in a later commit if rejected

### Commit 2 - Add SessionRouter fail-safe behavior

Files:

- `core/SessionRouter.js`
- `core/SessionRouter` focused tests

Behavior:

- On transition failure, do not call `resumeTrading()`.
- Enter an explicit failed-safe state.
- Preserve enough status for operator review.
- Block subsequent automatic transition attempts while failed-safe is active.
- Keep `SESSION_ROUTER_ENABLED=false` dormant behavior unchanged.

Required tests:

- `_transitionToStocks()` injected failure leaves trading paused.
- `_transitionToCrypto()` injected failure leaves trading paused.
- `getStatus()` exposes failed-safe state.
- Disabled router remains no-op.

Gates:

- `node --check core/SessionRouter.js`
- `session_router.fail_safe.no_resume_on_error` focused gate or test
- Mercury attack: failure-path recovery, stale state, accidental resume
- P0 only if a verified import path touches backtest runtime

Deploy risk:

- low when `SESSION_ROUTER_ENABLED=false`
- medium if SessionRouter is enabled because failure behavior intentionally
  changes from resume to halt

Rollback:

- revert this commit only; no data migration

### Commit 3 - Wire TransitionStore into SessionRouter status only

Files:

- `core/SessionRouter.js`
- `core/session-router/TransitionStore.js`
- focused SessionRouter tests

Behavior:

- Construct a TransitionStore when SessionRouter is constructed.
- `getStatus()` includes transition store projection.
- Do not yet write transition phases from `_transitionToStocks()` or
  `_transitionToCrypto()`.
- Do not change transition behavior, broker calls, force-close, or activation.

Why this is separate:

- It makes the backend status surface real before it becomes operational
  authority.
- It keeps the first integration dormant and testable.

Required tests:

- Disabled router returns store-backed `disabled`/`idle` status.
- Missing store files do not crash status reads.
- Corrupt store state reports recovery-required, not an invented healthy state.

Gates:

- `node --check core/SessionRouter.js`
- focused status tests
- visibility/session router status gate if available
- no P0 unless import analysis proves backtest path is touched

Deploy risk:

- low

Rollback:

- revert this commit; TransitionStore substrate can remain unused

### Commit 4 - Add transition journal writes for SessionRouter phases

Files:

- `core/SessionRouter.js`
- `core/session-router/TransitionStore.js`
- focused SessionRouter tests

Behavior:

- Each transition writes epoch-stamped journal events:
  - `SESSION_TRANSITION_PLANNED`
  - `SESSION_FREEZE_SOURCE`
  - `SESSION_ORDER_INTENT_RECORDED` when a broker/session intent exists
  - `SESSION_TARGET_ACTIVATED`
  - `SESSION_FAILED_SAFE`
- No broker reconciliation gate yet.
- No activation behavior change except failed-safe behavior already added.

Required tests:

- Transition success appends ordered planned/freeze/activated events.
- Transition failure appends failed-safe event.
- Restart projection can reconstruct latest status from journal and state file.

Gates:

- `session_router.transition_journal.state_machine`
- Mercury attack: duplicate writes, stale epoch, crash between state and event
- P0 only if import analysis proves backtest path is touched

Deploy risk:

- medium if SessionRouter is enabled

Rollback:

- revert this commit; journal files may remain as audit artifacts

### Commit 5 - Add candle ingress scope stamping

Files:

- `core/CandleProcessor.js`
- focused CandleProcessor tests
- gate runner update only if the gate is included in the same logical change

Behavior:

- Every candle accepted for trading carries:
  - `executionMode`
  - `brokerId`
  - `accountId`
  - `assetClass`
  - `symbol`
  - `timeframe`
  - `scopeKey`
- Missing trading-critical scope fails closed before strategy dispatch.
- Rejection emits enough trace/proof context to name the missing field and
  source.

Required tests:

- scoped candle passes through with all fields.
- missing symbol rejects.
- missing timeframe rejects.
- rejection records missing field.
- existing valid backtest candle path still reaches strategy.

Gates:

- `node --check core/CandleProcessor.js`
- P0 anchor must hold unless the rejection intentionally reveals a current
  incomplete caller. If it reveals one, fix the caller in a separate commit.
- Mercury attack: malformed candles, stale symbol, wrong timeframe,
  fallback/default leakage

Deploy risk:

- medium. Incomplete live callers will fail loudly.

Rollback:

- revert this commit only; no persistent migration

### Commit 6 - Add candle ingress scope gate

Files:

- `ogz-meta/gates/multi-runtime-gate-runner.js`
- `ogz-meta/specs/MULTI-RUNTIME-GATE-FRAMEWORK-2026-05-26.md`

Behavior:

- Adds executable `scope.candle_ingress.scope_contract`.
- Marks the planned candle scope gate as executable.
- Does not change runtime behavior.

Required tests:

- `node --check ogz-meta/gates/multi-runtime-gate-runner.js`
- `node ogz-meta/gates/multi-runtime-gate-runner.js --scope`

Gates:

- the new gate itself
- no P0 required unless the runner invocation includes P0
- no Mercury required for docs/tooling unless the gate uses hot-path modules in
  a way that changes them

Deploy risk:

- none

Rollback:

- revert this commit

### Commit 7 - Enforce openPosition scope contract

Files:

- `core/StateManager.js`
- focused StateManager tests
- optional gate runner update if the open-position gate is added here

Behavior:

- `openPosition()` refuses any BUY or SELL_SHORT missing:
  - `symbol`
  - `brokerId`
  - `assetClass`
  - `executionMode`
  - `timeframe`
  - `scopeKey`
- Rejection happens before active trade mutation.
- Rejection records a trace/proof event or returns enough structured context
  for the caller to trace the missing field.

Required tests:

- missing each required field rejects.
- full scope opens.
- rejection does not mutate `activeTrades`.
- dashboard projection remains unchanged after rejection.

Gates:

- `scope.state_manager.dashboard_positions`
- new `scope.state_manager.open_position_scope_contract`
- P0 anchor
- Mercury attack: incomplete callers, default account leakage, fallback symbol,
  mutation-before-reject

Deploy risk:

- medium. Any incomplete caller will fail loudly.

Rollback:

- revert this commit, but do not proceed to multi-symbol until it is replaced by
  an equivalent root-cause guard

### Commit 8 - Add backtest report scope stamping

Files:

- `core/BacktestRunner.js`
- focused BacktestRunner tests

Behavior:

- Every backtest report row carries:
  - `scopeKey`
  - `symbol`
  - `timeframe`
  - `assetClass`
  - `executionMode`
  - `brokerId`
  - `accountId`
- A report row missing scope fails the report build instead of silently
  emitting an ambiguous row.

Required tests:

- canonical TSLA report rows all include scope.
- missing scope fails report build with field name.

Gates:

- P0 anchor
- new report-row scope gate
- Mercury attack if report fields can influence runtime state or learned state

Deploy risk:

- none for PM2/live runtime

Rollback:

- revert this commit

### Commit 9 - Scope-isolate pattern memory

Files:

- `core/PatternMemoryBank.js`
- `core/UnifiedPatternMemory.js`
- focused pattern memory tests

Behavior:

- Pattern writes include scope fields and `scopeKey`.
- Pattern reads require compatible scope.
- A TSLA 15m paper pattern cannot satisfy a BTC-USD 1m live read.
- Legacy unscoped patterns are not silently promoted to current scope.

Operator decision before implementation:

- Decide whether legacy unscoped patterns are quarantined, migrated under a
  visible `legacy` namespace, or ignored for live decisions.

Required tests:

- TSLA 15m write cannot be read by BTC-USD 1m.
- paper write cannot be read by live mode.
- missing scope read returns empty or explicit reject, never global fallback.
- legacy unscoped data follows the operator-approved migration policy.

Gates:

- P0 anchor
- new pattern isolation gate
- Mercury attack: cross-asset, cross-mode, cross-timeframe leakage

Deploy risk:

- medium to high depending on legacy pattern migration

Rollback:

- route reads back to old memory only if that route is explicitly marked
  unsafe-for-multi-runtime and blocked before expansion

### Commit 10 - Add broker capability matrix scaffold

Files:

- broker capability schema/doc path to be chosen before edit
- `brokers/BrokerRegistry.js` only if schema needs runtime surfacing
- gate framework update

Behavior:

- Distinguishes scaffolded adapter, implemented adapter, and verified adapter.
- Lists required capabilities:
  - market data
  - historical candles
  - account balance
  - positions
  - open orders
  - place order
  - cancel order
  - replace or modify order
  - order status
  - fill stream
  - REST reconciliation
  - client order id/idempotency support
  - bracket/OCO semantics
  - short availability/borrow constraints

Required tests:

- registry can report missing capability.
- router can refuse an unverified capability in a focused non-live test.

Gates:

- capability matrix gate
- no P0 if docs/schema only
- P0/Mercury if order routing behavior changes

Deploy risk:

- low for scaffold, medium when enforcement is wired

Rollback:

- revert scaffold or keep as docs-only with no enforcement

### Commit 11 - Broker REST reconciliation gate before SessionRouter activation

Files:

- `core/SessionRouter.js`
- relevant broker adapter interfaces only if missing methods are found
- focused SessionRouter tests

Behavior:

- Before target activation, query broker truth for source flatness and target
  readiness.
- If REST truth is unavailable or source is not flat, enter failed-safe state.
- Record reconciliation snapshot in the transition journal.
- Do not rely on local StateManager truth as broker truth.

Required tests:

- activation blocked when REST positions remain open.
- activation blocked when REST query fails.
- activation proceeds only when source is broker-confirmed flat.
- failed activation leaves trading paused and journaled.

Gates:

- `session_router.broker_reconciliation.pre_activation`
- Mercury attack: late fills, REST stale data, websocket/REST disagreement,
  false local-flat state
- no P0 unless import analysis proves backtest path is touched

Deploy risk:

- medium. Active only when SessionRouter is enabled.

Rollback:

- revert this commit; keep fail-safe and journal substrate

### Commit 12 - Multi-symbol single-broker paper slice

Files:

- `run-empire-v2.js`
- `core/SymbolTradingContext.js`
- `core/CandleStore.js`
- dashboard status/proof path as required by the visibility gate
- focused tests/gates

Behavior:

- Alpaca paper subscribes to every configured `ALPACA_SYMBOLS` entry.
- Candles dispatch by symbol into isolated context.
- Each symbol can hold independent scoped positions.
- Dashboard renders backend scoped positions, not chart-selected inference.
- Trace/proof output distinguishes TSLA and SPY ingress, decisions, state
  mutations, and dashboard rows.

Prerequisites:

- candle scope stamping landed
- openPosition scope enforcement landed
- pattern memory isolation policy landed
- current scope gates green
- visibility trace ladder checkpoint documented or executable

Required tests:

- TSLA and SPY candle streams do not share context.
- TSLA close cannot close SPY.
- dashboard shows both positions from backend payload.
- selected chart change does not rewrite positions.

Gates:

- P0 anchor or approved drift protocol
- `scope.multi_symbol.tsla_spy_isolation`
- `visibility.trace_ladder.field_contract`
- Mercury attack: cross-symbol state bleed, chart inference, stale fallback,
  close wrong symbol

Deploy risk:

- high. Requires PM2 restart and paper soak. Do not deploy to live directly.

Rollback:

- feature flag back to single-symbol paper path

## Deferred Work After This Ladder

These remain required for the full architecture but should not be bundled into
the first build pass:

- full `SessionAccountContext`
- `StateManager.forSession()`
- `TradingFanoutEngine`
- `MarketDataRouter`
- global 10/15/18 position tier gate
- same-symbol multi-timeframe opposite-direction support
- Fort-Knox Pattern Service
- DynamicPositionSizer wire-up
- full backtest/live unified replay adapter

## Commit Discipline

- One commit per numbered item above.
- No runtime expansion before the prerequisite scope gates are green.
- No PM2 restart from this branch until the live state/restart blocker is
  explicitly reconciled.
- No P0 rebaseline inside an unrelated runtime fix.
- If P0 moves during intended expansion, record old result, new result,
  explanation, scope gate, visibility gate, and Mercury/local adversarial
  review before committing.
- If Mercury is unavailable, record the outage and perform local adversarial
  review. Do not label that a Mercury pass.

## Current Next Action

Start with Commit 1:

```text
Add dormant core/session-router/TransitionStore.js and focused tests.
```

Do not wire it into `SessionRouter.js` in the same commit.

