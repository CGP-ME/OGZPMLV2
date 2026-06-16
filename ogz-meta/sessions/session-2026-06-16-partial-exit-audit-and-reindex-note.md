# Session Form - 2026-06-16 Partial Exit Audit And Mercury Reindex Note

## Session Identity

- Date: 2026-06-16
- Branch: `claude/new_beginnings`
- Scope: current-code verification of external partial-exit / MPM / Alpaca quantity / drawdown claims, implementation of the confirmed TradeJournal partial-exit lifecycle fix, plus next-push Mercury reindex reminder.
- Runtime code changed: yes.
- Coverage note: this is a narrow proof packet for the partial-exit slice only. Broader recent-workstream catch-up is recorded in `ogz-meta/sessions/session-2026-06-16-catchup-handoff-and-gap-register.md`.

## What Was Verified

An external critique claimed the current repo still had several critical live-path defects. The claims were treated as adversarial leads, then checked against current code and focused tests.

### Stale Or Refuted Claims

1. Partial exits double-delete active trades.
   - Current code rejects partials in `StateManager.closePosition()`.
   - Current code routes partial exits through `StateManager.reducePosition()`.
   - `OrderExecutor` only calls active-trade cleanup and MPM reset when `!isPartialClose`.

2. Alpaca receives USD notional as share quantity.
   - Current code converts USD size to broker quantity before dispatch.
   - Live route sends `orderQuantity`, not `sizeUsd`, to the broker route.
   - Alpaca adapter maps the already-planned quantity to `qty`.

3. Drawdown bypass is required because drawdown halts every trade.
   - Current live runtime has `ACCOUNT_DRAWDOWN_BYPASS=false`.
   - Current live runtime has `RISK_MANAGER_BYPASS=false`.
   - Live startup guards reject risk/drawdown bypass posture.
   - RiskManager is initialized from StateManager balance before trading loop use.

### Current Real Defect

`TradeJournal` is not partial-exit lifecycle safe.

Observed current-code risk:

- `TradeJournal.recordExit()` reads the full open entry size/value.
- It validates supplied PnL against the full-position expected PnL.
- It deletes the open trade on any accepted exit.
- `TradeJournalBridge` routes close records into that method.

Current conclusion:

- Execution/state/broker quantity paths are not in the stale-broken shape described by the external critique.
- Journal, replay, visibility, and downstream attribution still need a leg-aware partial-exit lifecycle fix before tiered exits can be considered fully trustworthy.

## Tests Run

- `npx jest test/risk-manager-config.test.js test/state-manager-load.test.js test/trade-journal-today-stats.test.js --runInBand`
  - Result: pass, 3 suites / 48 tests.
- `npx jest test/order-executor-pause-gate.test.js test/max-profit-manager-exit-contract.test.js --runInBand`
  - Result: pass, 2 suites / 56 tests.

## Important Code Evidence Checked

- `core/StateManager.js`
  - `closePosition()` rejects partial closes.
  - `reducePosition()` updates remaining size/quantity and only removes active trade at zero remainder.
- `core/OrderExecutor.js`
  - `_buildExitPlan()` uses `exitFraction` and remaining broker quantity for partial exit planning.
  - Partial exits route through `reducePosition()`.
  - Cleanup/reset logic is gated by `!isPartialClose`.
- `core/MaxProfitManager.js`
  - MPM emits both `exitSize` and `exitFraction`.
  - MPM internal narrator/telemetry math still has unit-suspicious calculations and needs a separate follow-up if those values feed learning or reporting.
- `brokers/AlpacaAdapter.js`
  - Alpaca order `qty` receives planned broker quantity, not raw USD notional.
- `core/TradeJournal.js`
  - Exit lifecycle is full-position oriented and deletes the journal open trade on accepted exit.
- `core/TradeJournalBridge.js`
  - Close replay currently calls `TradeJournal.recordExit()`.

## Open Follow-Ups

1. Audit MPM telemetry unit math separately.
   - Current concern is reporting/learning correctness, not broker sizing.

2. Fix stale P0 latest-pointer behavior.
   - `node ogz-meta/gates/multi-runtime-gate-runner.js --p0` returned `PASS` during this session and wrote a fresh worker report, but `ogz-meta/gates/runs/multi-runtime-latest.json` still pointed at an older run.
   - Do not rely on the latest-pointer file until that gate-runner/report pointer bug is fixed.

3. Reindex Mercury on the next approved GitHub push.
   - Required command: `node trai_brain/mercury-bridge/indexer.js`
   - Do not claim Mercury has fresh repo context until this has run successfully after the relevant committed changes.

## Fix Implemented

Files changed:

- `core/TradeJournal.js`
- `core/TradeJournalBridge.js`
- `test/trade-journal-today-stats.test.js`
- `test/trade-journal-bridge-scope.test.js`

Behavior changed:

- `TradeJournal.recordExit()` now requires an explicit exit notional from `size`, `sizeUsd`, `usdValue`, or `exitSize`.
- Missing exit size no longer falls back to the full open journal notional.
- Partial exits write an exit leg, allocate entry fees proportionally, reduce the remaining open journal notional, and keep the journal entry open until the final close.
- Ledger rebuild preserves partial-exit remaining exposure after restart.
- Ledger rebuild canonicalizes `sizeUsd` and `exitSize` into `size` and `usdValue` for stats/report consumers.
- Contradictory notional aliases fail loud instead of silently choosing one.
- `TradeJournalBridge` now treats missing close-record size as incomplete and includes size in its duplicate close key, so distinct partial legs are not collapsed.

Mercury findings during this fix:

1. Missing exit size could still become a full close.
   - Fixed by removing the fallback and making exit size explicit.
2. `sizeUsd`-only ledger exits were accepted live but not rebuilt.
   - Fixed by canonicalizing rebuild notional aliases.
3. Mismatched notional aliases could differ between live recording and rebuild.
   - Fixed by rejecting contradictory notional fields.
4. Tiny remaining exposure could be confused with math tolerance.
   - Fixed by separating lifecycle tolerance from PnL/notional comparison tolerance.
   - The final Mercury report repeated a stale version of this claim; focused tests now prove a `sizeUsd`-only exit with `0.009` remaining survives live state and restart rebuild.

## Verification After Fix

- `node --check core/TradeJournal.js`
- `node --check core/TradeJournalBridge.js`
- `node --check test/trade-journal-today-stats.test.js`
- `node --check test/trade-journal-bridge-scope.test.js`
- `npx jest test/trade-journal-today-stats.test.js test/trade-journal-bridge-scope.test.js test/trade-replay-capture-contract.test.js test/state-manager-load.test.js test/order-executor-pause-gate.test.js test/max-profit-manager-exit-contract.test.js --runInBand`
  - Result: pass, 6 suites / 143 tests.
- `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`
  - Result: terminal `PASS`.
  - Fresh worker report: `backtest-results/worker-reports/backtest-report-1781576403610-2673324-15787b92-9a0f-4ef6-b9b3-9aff1c483a1d-phase0-canonical-multi-runtime-gate-2026-06-16T02-18-51-467Z-TSLA.json`
  - Fresh worker report summary: final balance `10710.667785934895`, trades `1692`, winners `1063`, losers `629`, win rate `62.8`, profit factor `1.15`, net PnL `710.6677859348954`, max drawdown `3.87`.
  - Warning: `ogz-meta/gates/runs/multi-runtime-latest.json` remained stale and pointed at a 2026-06-13 run.

## Commit / Push Status

- Code changes are currently local and uncommitted at this note.
- No Mercury reindex was run during this note.
- No GitHub push was performed during this note.
