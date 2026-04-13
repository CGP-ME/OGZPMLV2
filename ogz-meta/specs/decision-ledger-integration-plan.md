# OGZPrime Decision Ledger — Integration Plan

**Date:** 2026-04-13
**Branch target:** `tradingloop-clean-rewrite` (rebase onto `broker-alpaca-integration` if needed)
**Schema:** `ogz-meta/specs/decision-ledger-schema.json`
**Author:** wolf via Trey
**Status:** Spec — for Claudito execution AFTER T1-T4 / C1-C5 operational verification passes

---

## Purpose

Make every force acting on every trade decision visible, structured, and queryable. No more guessing why a trade fired the way it did. No more inferring confidence boosts from log fragments scattered across files. Every input becomes a structured ledger entry that flows from signal generation through final close, persisted as JSONL for post-hoc analysis and surfaced live in the dashboard.

This is the foundation for: (1) trustworthy pattern packs (you can prove a pattern actually moved decisions), (2) sellable transparency (customer-facing "show your work" interface), (3) tournament parameter sensitivity analysis (which forces actually moved P&L), (4) PID envelope validation (PID adjustments visible as separate ledger entries).

Without this, the matrix run produces opaque P&L numbers that you can't decompose. With this, every backtest trade becomes a decomposable case study.

---

## Architecture decision: Option C (both)

Ledger lives on the trade object during lifecycle. Persisted as JSONL on full close. Dashboard reads from the live trade object for active trades, from JSONL for closed.

- **Live storage:** `trade.decisionLedger` on the trade object in `core/StateManager.js` activeTrades Map
- **Persistent storage:** `logs/decisions/decisions_YYYY-MM-DD.jsonl`, append-only, one line per closed trade
- **Schema enforcement:** Zod validator at write time, rejects malformed entries to claudito-activity log instead of corrupting the JSONL file

---

## Phase plan

Each phase is one commit, independently testable, leaves system in working-or-better state. Order chosen to make the ledger immediately useful even at Phase 1, then progressively richer.

### Phase L1 — Skeleton ledger creation at trade birth

**Goal:** Every new trade gets an empty ledger object with the entry-time fields populated. No exits, no outcome yet. Visible in StateManager but not yet persisted.

**Files touched:**
- `core/dto/DecisionLedgerSchema.js` (NEW) — Zod schema for runtime validation, mirrors `ogz-meta/specs/decision-ledger-schema.json`
- `core/StateManager.js` — `openPosition()` populates `trade.decisionLedger` skeleton (~5 lines added near line 346-348 where tradeId is built)
- `core/TradingLoop.js` — passes signal collection + orchestrator decision down to OrderExecutor as `decision.ledgerData` (~15 lines around line 217-256 where orchResult is built)

**Test:**
- Run T1 (single-trade backtest from operational verification) and inspect `state.activeTrades.get(tradeId).decisionLedger`. Confirms skeleton exists.
- Schema validation passes on the empty-but-typed ledger.

**Pass criteria:** Every entered trade has a `decisionLedger` object matching the schema's required fields except `exits` and `outcome` (which are populated later).

---

### Phase L2 — Strategy signals + orchestrator decision

**Goal:** Capture every strategy that fired (winner AND losers) with their base confidence and reasoning. Capture the orchestrator's selection logic.

**Files touched:**
- `core/StrategyOrchestrator.js` — `evaluate()` method (~lines 608-821 per audit). Currently returns winner only. Modify to also return `allResults` with full per-strategy breakdown including those that lost. Estimated ~30 lines.
- Each strategy file (`EMASMACrossoverSignal.js`, `MADynamicSR.js`, `LiquiditySweepDetector.js`, etc.) — ensure `evaluate()` returns standardized `{direction, baseConfidence, reason, indicatorValues}` shape. Most already do; this normalizes any that don't. ~5 lines per strategy.
- `core/TradingLoop.js` — receives `orchResult.allResults`, writes to `trade.decisionLedger.strategySignals` and `trade.decisionLedger.orchestratorDecision`. ~10 lines around where orchResult is consumed.

**Test:**
- Backtest one trade, inspect ledger. Should have entries for every strategy that produced a signal on that candle, with reasons.
- Confirm winner matches `orchestratorDecision.winnerStrategy`.

**Pass criteria:** Trade ledger shows all competing strategies and the orchestrator's selection logic verbatim.

---

### Phase L3 — Confidence modifiers as structured entries

**Goal:** Every confidence boost or penalty becomes a `confidenceModifiers[]` entry with source, adjustment, reason, pre/post values. This is the biggest refactor in the ledger work.

**Sources to wire:**

| Source | Currently lives at | Refactor to |
|---|---|---|
| `pattern_match` | UnifiedPatternMemory.findMatchingPatterns(), called from TradingLoop | Return `{adjustment, patternId, patternStats, reason}` instead of just confidence delta |
| `fib_proximity` | Various strategy files, inline boost | Extract to confidence modifier returned alongside signal |
| `regime_filter` | RegimeDetector + StrategyOrchestrator regime modifiers (note: regime affinities REVERTED per audit, but regime is still used as confidence input in some paths) | Each regime check returns structured modifier |
| `volatility_filter` | StrategyOrchestrator ATR filter | Restructure ATR check to emit modifier entry, not just pass/fail |
| `vp_confluence` | VolumeProfile checks where wired | Same pattern |
| `mtf_alignment` | MultiTimeframeAdapter | Structured modifier |
| `trai_overlay` | TRAIDecisionModule.processDecision (fire-and-forget today) | Captured as modifier when TRAI is in hot path |

**Files touched:**
- `core/UnifiedPatternMemory.js` — pattern match return shape (~10 lines)
- `core/StrategyOrchestrator.js` — modifier collection in evaluate() (~30 lines)
- `core/MarketRegimeDetector.js` — emit modifier shape (~10 lines)
- Each strategy file with inline confidence boosts — extract to returned modifier objects (~5-10 lines per file)
- `core/TradingLoop.js` — collect all modifiers into `trade.decisionLedger.confidenceModifiers` (~10 lines)

**Test:**
- Backtest one trade where pattern match fires. Inspect ledger. Confidence modifier entry should show patternId, stats, adjustment.
- Sum of modifier adjustments + base confidence should equal final confidence (within rounding).

**Pass criteria:** Every confidence delta in the system is traceable to a structured ledger entry with reason. No "mystery boosts."

---

### Phase L4 — Position sizing breakdown with formula

**Goal:** Position sizing math becomes fully traceable. The `formula` string is human-readable and the structured fields let analysis tools decompose sizing decisions.

**Files touched:**
- `core/OrderExecutor.js:55-81` — current sizing code already computes the math. Capture each step into `trade.decisionLedger.positionSizing` and build the formula string. ~20 lines added.
- `core/PIDController.js` — expose `getCurrentPositionMultiplier()` for snapshot at decision time (~5 lines)

**Test:**
- Backtest one high-confidence trade. Verify formula string matches actual sizing math.
- `finalSizeUsd / accountBalance === finalPercent` within rounding tolerance.

**Pass criteria:** Trade ledger sizing block lets you reconstruct the size from base × confidence × confluence × PID, and the formula string matches.

---

### Phase L5 — Risk gates

**Goal:** Every risk check that ran on the trade decision (whether it passed or failed) gets a structured entry. Trades that DIDN'T fire because a gate killed them also get logged (separate from main ledger — gate-rejection log).

**Files touched:**
- `core/RiskManager.js` — `isTradingAllowed()` and `assessTradeRisk()` return structured per-gate breakdown (~20 lines)
- `core/TradingLoop.js:393-514` — collect risk gate results into `trade.decisionLedger.riskGates` (~10 lines)
- NEW: `logs/decisions/rejections_YYYY-MM-DD.jsonl` for trades that were considered but killed by a gate (separate file from successful trades)

**Test:**
- Force a trade to fail max_positions gate. Verify rejection log captures it with full ledger context.
- Successful trade should show all gates passed.

**Pass criteria:** Every gate evaluation is logged. Killed trades have their reasoning preserved for analysis.

---

### Phase L6 — Exit ledger entries

**Goal:** Every exit event (full or partial) appends a structured entry to `trade.decisionLedger.exits[]`. Multi-leg trades show the full lifecycle.

**Files touched:**
- `core/MaxProfitManager.js` — `update()` returns include `ledgerEntry` field with structured exit data (~15 lines, one per return path: BE scaleout, tier exits, trailing)
- `core/exit/StopLossChecker.js` — same pattern (~10 lines)
- `core/exit/TrailingStopChecker.js` — same pattern (~10 lines)
- `core/ExitContractManager.js` — same pattern for invalidation conditions (~10 lines)
- `core/StateManager.js` `closePosition()` and (future) `reducePosition()` — append exit ledger entry to trade before close (~15 lines)

**NOTE:** This phase depends on the partial-close pipeline fix being in place, OR ledger captures the current full-close-labeled-as-partial behavior accurately (which is also valuable — proves the bug fired N times in matrix data).

**Test:**
- Backtest trade that hits BE scaleout + trailing stop. Inspect `trade.decisionLedger.exits[]`. Should have 2 entries with full reasoning and indicator state at each exit.

**Pass criteria:** Every exit, partial or full, has a corresponding ledger entry. Sum of `realizedPnL` across legs reconciles with trade total.

---

### Phase L7 — Outcome summary on full close

**Goal:** When trade hits `remainingSize === 0`, populate the `outcome` block with aggregates.

**Files touched:**
- `core/StateManager.js` `closePosition()` final-close branch — compute outcome aggregates, attach to ledger (~15 lines)
- `core/MaxProfitManager.js` — expose `maxProfitPercent` for MFE ratio (already tracked, just needs accessor)

**Test:**
- Multi-leg trade closes fully. Verify outcome.totalRealizedPnL = sum of leg P&L. MFE ratio = realized / peak.

**Pass criteria:** Outcome block accurately summarizes the trade.

---

### Phase L8 — JSONL persistence on full close

**Goal:** Every closed trade's complete ledger gets appended to `logs/decisions/decisions_YYYY-MM-DD.jsonl` as a single line. Schema validation runs before write; failures go to claudito-activity.jsonl with the offending ledger.

**Files touched:**
- NEW: `core/DecisionLedgerLogger.js` — write/validate logic, daily file rotation (~80 lines)
- `core/StateManager.js` — call `DecisionLedgerLogger.writeOnClose(trade.decisionLedger)` from final close branch (~5 lines)
- `core/dto/DecisionLedgerSchema.js` — Zod validator with `safeParse` + error capture (~30 lines)

**Test:**
- Run a backtest. Inspect `logs/decisions/decisions_YYYY-MM-DD.jsonl`. Each line should be a valid JSON object matching the schema.
- Force a malformed ledger (delete required field). Confirm it's NOT written to decisions file but IS written to claudito-activity with error.

**Pass criteria:** Every closed trade in backtest produces exactly one valid JSONL line. No silent ledger corruption.

---

### Phase L9 — Lessons learned post-hoc

**Goal:** After trade closes, TRAI or pattern engine writes back to the ledger with what was learned (pattern stats before/after this trade contributed, premium pack eligibility, anomaly flags).

**Files touched:**
- `core/UnifiedPatternMemory.js` `recordOutcome()` — return `{patternId, statsBefore, statsAfter}` (~10 lines)
- `core/StateManager.js` final close branch — populate `lessonLearned` block before persistence (~20 lines)
- NEW: `core/AnomalyDetector.js` — checks for unusual_drawdown, unexpected_reversal, modifier_mismatch (e.g., +12% pattern boost but trade lost) (~50 lines)

**Test:**
- Run 100 backtest trades. Inspect ledger lines. Pattern stats should evolve trade-to-trade. Anomaly flags should appear on visibly-anomalous trades.

**Pass criteria:** Closed trade ledgers have meaningful post-hoc analysis attached.

---

### Phase L10 — Dashboard live ledger card

**Goal:** Active trades on the dashboard show their full reasoning live. Customer-facing "show your work" view.

**Files touched:**
- `public/unified-dashboard.html` — new trade card component (~150 lines HTML/CSS)
- `core/WebSocketManager.js` — broadcast `trade.decisionLedger` updates on every modification (~15 lines)
- NEW: `public/js/decision-ledger-renderer.js` — formats ledger into the tree-style display (~100 lines)

**Test:**
- Open dashboard during a paper trade. Active trade card should show full reasoning tree updating live as exits fire.

**Pass criteria:** Live trade reasoning is visible without grep'ing logs.

---

## Sequencing within Apex critical path

Recommended order with Apex pressure:

1. **Operational verification (T1-T4, C1-C5)** — first, ~2 hours
2. **Phase L1 + L2 + L4 + L5** as a single combined commit (skeleton + signals + sizing + gates) — ~1 session, gives immediate ledger value for the matrix run
3. **Phase L8 (JSONL persistence)** — ~30 min, makes matrix run produce queryable output
4. **Matrix run on home rig** with ledger writing active — every backtest trade now decomposable
5. **Phase L3 (confidence modifiers)** — ~1 session, requires care since modifiers touch many files. Can be done after matrix using matrix data to verify correctness.
6. **Phase L6 + L7 (exits + outcome)** — bundled with the partial-close pipeline fix work. ~1 session combined with the partial fix.
7. **Phase L9 (lessons learned)** — pre-Apex polish if time permits
8. **Phase L10 (dashboard)** — post-Apex. Customer-facing layer for SaaS launch.

**Critical path for Apex:** L1, L2, L4, L5, L8 (5 phases bundled into ~2 commits). Matrix run produces ledger data. Partial-close fix landing brings L6, L7 along. That's enough to ship a single-strategy single-account Apex run with full transparency.

**Post-Apex:** L3 polish, L9 anomaly detection, L10 dashboard card. These make the platform sellable but don't gate Apex pass.

---

## Schema versioning

Ledger format is `ledgerVersion: "1.0.0"` in metadata block. Any schema change = new minor version. Backwards compatibility maintained by readers (e.g., dashboard, analysis tools) via version check. Old JSONL files remain readable forever — no destructive migrations.

---

## What this unlocks

Once L1-L8 are in:

- **Matrix sweep produces ledger-rich output.** Every config tested in the matrix has full per-trade reasoning. Tournament results decomposable: "config A won because pattern boosts averaged +14% on its winners; config B lost because regime filter was rejecting valid trades."
- **Pattern pack quality scoring.** Per-pattern win rate from the ledger, weighted by how often the pattern was the *deciding* modifier vs noise.
- **PID envelope validation.** PID adjustments are visible per trade. You can see whether PID actually moved sizing in the right direction.
- **Reviewer audit cycles get easier.** Mercury can audit "show me the ledger for the worst 10 trades in the last backtest" instead of grep-and-guess.
- **Customer trust.** Dashboard card showing why a trade fired beats every "AI-powered trading bot" landing page on the market.
- **Debugging the 4-layer partial bug.** Once fixed, the ledger proves it's fixed. Multi-leg ledger entries should add up; if they don't, the bug is back.

---

## What this does NOT do

- Doesn't fix the partial-close pipeline (separate work, but ledger documents it)
- Doesn't add asset namespacing to pattern memory (separate, post-Apex)
- Doesn't replace Sentry / TradingProofLogger / ClauditoLogger (different concerns: Sentry = errors, TradingProofLogger = simple trade audit, ClauditoLogger = AI agent activity, DecisionLedger = trade reasoning)
- Doesn't implement multi-tenant or SaaS layer (post-Apex)

---

## Pre-execution checklist

Before Claudito starts L1:

- [ ] T1-T4 (TRAI safety) all pass
- [ ] C1-C5 (Claudito pipeline) all pass
- [ ] Mercury bridge functional (T4)
- [ ] Backup current `tradingloop-clean-rewrite` branch
- [ ] Schema file committed at `ogz-meta/specs/decision-ledger-schema.json`
- [ ] This integration plan committed at `ogz-meta/specs/decision-ledger-integration-plan.md`

If any precondition fails, do not start ledger work. Fix the failed precondition first.

---

**End of integration plan.**
