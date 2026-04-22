# Apex Shipping Boundary

**Date:** 2026-04-22
**Author:** Mercury-2 agentic draft from operator's (Trey's) 2026-04-22 decisions, written on `alpaca/stocks-paper-flip` branch at HEAD 8450954.
**Status:** Living doc. Ships when all PRE-APEX items below are verified green.

---

## Intro

The Apex evaluation targets a **15% profit** with **< 5% drawdown** as the first step toward the Houston vision. Passing Apex unlocks the payout → multi-account clone → Houston move sequence per `ogz-meta/GRAND-SCHEME.md`.

Current Apex eval path: Alpaca paper TSLA (stocks-only during RTH) on branch `alpaca/stocks-paper-flip`. No crypto during eval. SessionRouter 24/7 is explicitly post-Apex.

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

### SessionRouter — 24/7 crypto + stocks auto-switch

Full spec at `ogz-meta/ledger/SESSION-ROUTER-SPEC.md` (Wolf). Bot flips Alpaca ↔ Kraken at market open/close, force-liquidates positions on transition (no swing across sessions), swaps active pattern bank. Explicitly post-Apex because Apex eval runs stocks-only during RTH.

### Pattern bank Phase 3 + Phase 4-extended

Phase 3 (SessionRouter integration) — bank-swap at transition. Hooks into the SessionRouter `executeTransition` flow. Post-Apex because SessionRouter itself is post-Apex.

Phase 4-extended — retention policy + scheduled backup timer beyond the current `forceBackup()` method (committed today at `24dea89`). The method exists now as prep; retention/timer come with SessionRouter.

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
