# Apex Shipping Boundary

**Date:** 2026-04-22
**Author:** Mercury-2 agentic draft from operator's (Trey's) 2026-04-22 decisions, written on `alpaca/stocks-paper-flip` branch at HEAD 8450954.
**Status:** Living doc. Ships when all PRE-APEX items below are verified green.

---

## Intro

The Apex evaluation targets a **15% profit** with **< 5% drawdown** as the first step toward the Houston vision. Passing Apex unlocks the payout → multi-account clone → Houston move sequence per `ogz-meta/GRAND-SCHEME.md`.

Current Apex eval path: Alpaca paper TSLA (stocks-only during RTH) on branch `alpaca/stocks-paper-flip`. SessionRouter is BUILT AND LIVE — `SESSION_ROUTER_ENABLED=true` flipped on in PM2 env at commit `bec08c3` (2026-04-27). Pairs with the Phase 9 AlpacaAdapter→ResilientWebSocket migration (`a5ee381`). Bot now runs dual-broker session orchestration: Kraken crypto 24/7 + Alpaca stocks RTH (sequential, not concurrent — SessionRouter swaps `activeBroker` at session boundaries). Apex eval still runs against the Alpaca-during-RTH window of that orchestration.

---

## PRE-APEX GATE (must ship before eval)

### Strategy infrastructure parity — all 11 strategies

Operator directive (2026-04-22): all 11 registered strategies need the same infrastructure the validated 4 (RSI, EMASMACrossover, MADynamicSR, LiquiditySweep) already have. Not just the validated four.

The 11 strategies registered in the main entry pipeline (`run-empire-v2.js`):
RSI, EMASMACrossover, MADynamicSR, LiquiditySweep, SmartMoneySweep, MarketRegime, MultiTimeframe, OGZTPO, OpeningRangeBreakout, CandlePattern, BreakRetest.

Per-strategy infrastructure checklist (all 5 required before ship):

1. Locked exit contract in `TradingConfig.BASE_CONFIG.exitContracts` with `_validated` date marker and concrete `stopLossPercent` + `takeProfitPercent` values (see `core/TradingConfig.js:252-258` for the contract map).
2. Minimum confidence threshold wired to the trade-gate.
3. ATR filter (`ATR_FILTER_ENABLED` + `ATR_MIN_PERCENT`) interaction correct.
4. Regime boost entry in `TradingConfig.BASE_CONFIG.regimeBoosts`.
5. Actual evaluation in `StrategyOrchestrator` (the orchestrator must route candles to the module).

**Status:** 4/11 known-validated (RSI, EMA, MASR, LiquiditySweep). 7/11 unknown — audit pending (see Audit 3 in the pattern-bank-spec session; not yet completed due to Mercury rate-limit split).

### PID controller wiring

Operator directive (2026-04-22): PID goes PRE-APEX. The PID's purpose is to dial position sizing toward the Apex profit mark.

**Current state (Audit 1 verified 2026-04-22 via Mercury):**
- Module exists: `core/PIDController.js`
- Instantiated as singleton inside module: `core/PIDController.js:367`
- Output getters defined: `getPositionMultiplier()` (`:291`), `getRegimeBoostAdjustment()` (`:301`), `getTrailMultiplier()` (`:311`)
- Repository-wide grep finds **zero call sites** for any of the three getters.
- Verdict: **DEAD**. Instance runs but nothing downstream reads its outputs.

**Pre-Apex work required:** wire `getPositionMultiplier` / `getTrailMultiplier` / `getRegimeBoostAdjustment` into `core/OrderExecutor.js` (position sizing path) and `core/StrategyOrchestrator.js` (trail multiplier path, regime boost read).

### Multi-tier stops verification — NEEDS AUDIT

Operator directive (2026-04-22): multi-tier stops (MaxProfitManager tier 1/2/3 profit-taking) go PRE-APEX. Operator was told this subsystem is already done but is not confident that's true.

**Current state (not yet audited; audit budget hit rate-limit mid-pass):**
- Module exists: `core/MaxProfitManager.js:103-111` shows tier profit-taking class scaffold.
- Known from prior work: per-trade MPM instances (Map pattern, Set A / commit 50eff2a landed).
- **NEEDS VERIFY:** is `checkTierExits()` (or equivalent) called on each candle during an active trade? Does it actually invoke `StateManager.reducePosition` (not `closePosition`)? Is the contract-sealing rule (DEC-013) respected at runtime?

Next step: a dedicated Mercury audit scoped only to MaxProfitManager wiring before the Apex doc claims anything else about this subsystem.

### L5 risk-gates logging

Operator directive (2026-04-22): L5 logging goes PRE-APEX. Pure observability — no new gates, no behavior change, just instruments the existing gates so the decision ledger records which gate fired pass/reject and why.

**Current state:** `riskGates` field exists in decision ledger schema (`core/dto/DecisionLedgerSchema.js:77-78`) as a roadmap field; no push sites yet.

**Pre-Apex work required:** add `riskGates.push({gate, threshold, value, passed, rejectReason})` calls at every gate's decision point in `core/RiskManager.js` and `core/StrategyOrchestrator.js`. Typical gates: `min_confidence`, `atr_filter`, `max_positions`, `daily_loss_limit`, `drawdown_circuit`, `same_direction_block`, `kill_switch`, `warmup`, `direction_filter`.

### Pattern bank Phase 1 — APPLIED 2026-04-22

Asset-aware storage path for pattern memory. Live/paper collapses to asset class bucket (`stocks` or `crypto`); backtest stays per-ticker. Fix committed at `52c0847`. Spec at `ogz-meta/specs/pattern-bank-separation-spec.md`.

### Pattern bank Phase 2 (premium companion) — pre-Apex useful, not blocking

Read-only per-ticker premium banks harvested from backtests. Augments confidence scoring at runtime without being mutated. Not strictly required for Apex pass, but valuable for tuning. Spec section in the same pattern-bank-separation-spec.

---

## POST-APEX (deferred until eval passes)

### SessionRouter — 24/7 crypto + stocks auto-switch (LIVE)

**Status update 2026-04-27:** SessionRouter is LIVE. `SESSION_ROUTER_ENABLED=true` flipped on in PM2 env at `bec08c3`. Module at `core/SessionRouter.js`. Foundation API at `foundation/MarketCalendar.js:457-503` ("SessionRouter API added 2026-04-25"). Wiring at `run-empire-v2.js:161, 598-635, 1092-1095`. Specs: `ogz-meta/ledger/SESSION-ROUTER-SPEC.md`, `ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL_1.md`, `ogz-meta/specs/resilience-and-supervision.md` (Phase 10 deferral conditions).

Behavior in production: creates Kraken + Alpaca adapters, owns the active feed, flips at market open/close, force-liquidates on transition (no swing across sessions), mirrors `activeBroker` back to `this.kraken` so legacy callers don't break.

Apex eval path: Alpaca during RTH within the dual-broker orchestration. Crypto 24/7 path (Kraken active outside RTH) is non-Apex behavior but runs alongside.

**Phase 10 (Kraken migration to ResilientWebSocket) DEFERRED pre-Apex.** `kraken_adapter_simple.js` (867 lines, battle-tested reconnect logic since 2026-01-21) stays untouched until Kraken-specific resilience gauntlet coverage exists. Phase 11 half-complete: Alpaca decommissioned at `a5ee381`, Kraken pending. Conditions for safe migration documented in `ogz-meta/specs/resilience-and-supervision.md`.

In flight (parallel CC): agnostic reconnect watcher — meta-monitor that observes SessionRouter's broker-swap path and validates each transition completes end-to-end. Builds on the broker resilience gauntlet at `d184376` (10/10 scenarios passing).

### Pattern bank Phase 3 + Phase 4-extended

Phase 3 (SessionRouter integration) — bank-swap at transition. Hooks into the SessionRouter `executeTransition` flow. SessionRouter itself is now built (see status update above); the remaining piece is the pattern-bank-swap hook into its transition path. Post-Apex by feature-flag default, not by missing host module.

Phase 4-extended — retention policy + scheduled backup timer beyond the current `forceBackup()` method (committed at `24dea89`). The method exists now as prep; retention/timer activate when SessionRouter's flag flips on for live multi-broker.

### Multi-account clone for payout aggregation

After passing Apex on one account, clone to 20+ accounts for payout stacking. This is scaling-layer work, intentionally post-Apex.

### Houston move

Physical relocation once payouts are flowing. End-state of the grand-scheme sequence.

---

## OPEN ARCHITECTURAL QUESTIONS (not blockers, but need design before corresponding pre-Apex item ships)

### PID coupling with existing dynamic sizing

The current entry pipeline already dial-sizes dynamically: `basePositionSize × confidenceMultiplier × confluenceMultiplier`. If PID's `getPositionMultiplier` is layered on top multiplicatively, PID fights its own signal — its adjustments can't be attributed because the baseline is also moving.

Design questions to resolve:
- Does PID replace the confidence/confluence multiplier chain, or multiply on top?
- What's PID's learning signal — realized P&L per decision? If so, over what window?
- How does PID handle warmup with an already-volatile baseline?

A separate design doc is required before PID can safely ship pre-Apex. Until that doc lands, the PID wiring item stays open.

### Asset-isolation bug in decision ledger & adjacent subsystems

Pattern memory was fixed today. But the same mode-only-ignores-asset bug lives in:
- `logs/decisions/decisions_{date}.jsonl` — keyed by date only
- `data/journal/journal-stats.json` — mode/asset aware unknown
- `data/pipeline-snapshots.jsonl` — same pattern
- `data/candle-history.json` — likely single-asset cache

If the bot ever re-enters a cross-asset mode (even in backtest multi-asset runs), these subsystems cross-contaminate. Audit required before SessionRouter goes live, since SessionRouter will trigger the exact conditions for this class of bug.

---

## What's verified vs what's still on trust

| Item | Status | Verified how |
|---|---|---|
| PID is DEAD (not wired downstream) | VERIFIED | Mercury Audit 1, 2026-04-22, zero call-sites for 3 output getters |
| Multi-tier stops wired | CLAIMED — NEEDS AUDIT | Trey was told it's done; audit queued, not yet executed |
| All 11 strategies registered in orchestrator | CLAIMED — partial | `run-empire-v2.js:266-269` references the set, per-strategy parity unverified |
| Pattern bank Phase 1 asset-aware paths | VERIFIED | Commit 52c0847, Mercury holistic review 2026-04-22 confirmed 7/7 claims |
| Alpaca paper TSLA live | VERIFIED | Bot currently running, `[Alpaca] Connected - account verified`, pattern writes to `unified-patterns.paper.stocks.json` |

---

## Next concrete steps

1. **Mercury Audit 2** — multi-tier stops wiring (resume from the rate-limit split)
2. **Mercury Audit 3** — per-strategy infrastructure parity for the 7 unvalidated strategies
3. **PID coupling design doc** — unblocks PID pre-Apex work
4. **L5 riskGates push-site PR** — direct code change once design is confirmed
5. **Asset-isolation audit on the 4 adjacent subsystems** (decision ledger, journal, pipeline snapshots, candle history)

---

*Cite file:line for any claim updating this doc. No "claimed" items without a verification path next to them.*
