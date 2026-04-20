# Doc Alignment Sweep — 2026-04-20

**Status:** DRAFT v2 — awaiting operator approval before any doc edits land
**Branch:** `config/consolidation`
**Purpose:** Catalog every drift between ogz-meta alignment docs and current code/reality. Every entry uses BEFORE/AFTER/REASON shape so future sessions can audit the diff.
**Rules:** (1) No doc edits until operator approves this list. (2) Batched commit acceptable for pure doc changes (no execution-path risk). (3) Item 5 skipped — 2026-03-06 strategy notepad is operator-local, not in repo.

**v2 changes from v1:**
- Item 1: softened unverifiable `-$7,700` dollar figure per Desktop audit
- Items 2/3/7: replaced placeholder line ranges with verified MaxProfitManager line citations from full grep
- Item 6: committed to Desktop's hybrid answer (Q1): extend schema + keep unfilled schema fields as roadmap
- Item 9: completed full BEFORE/AFTER for all 6 `$970` occurrences (actual count, not 8+)
- NEW Items 13, 14, 15 added per Desktop Q5 answer (changelog entry, TODO staleness, MASTER-ROLLOUT other-phase checkboxes)
- Operator answers to Q1-Q5 applied throughout

---

## DESKTOP'S 8 ITEMS

### Item 1 — `ogz-meta/BACKTEST-OPS.md:310-311` (drawdown bypass "fixed" claim)

**File:line:** `ogz-meta/BACKTEST-OPS.md:310-311`

**BEFORE (verbatim):**
```
### 2. ACCOUNT_DRAWDOWN_BYPASS
Drawdown calculation was fixed on 2026-03-14 (core/StateManager.js:99). Safe to run with `ACCOUNT_DRAWDOWN_BYPASS=false` now. Set to `true` only for isolated strategy testing where you want to skip drawdown checks entirely.
```

**AFTER (proposed, v2 softened per Desktop audit):**
```
### 2. ACCOUNT_DRAWDOWN_BYPASS
Drawdown calculation was fixed at core/StateManager.js:99 on 2026-03-14. Setting `ACCOUNT_DRAWDOWN_BYPASS=false` enables the halt — bot force-closes at `accountDrawdownPercent` threshold (default -10%, StopLossChecker.js:48-62).

STATUS 2026-04-20: operator's `.env` currently has `ACCOUNT_DRAWDOWN_BYPASS=true`, and Phase 0 baseline (ogz-meta/specs/baseline-phase0-2026-04-20.md) runs with bypass=true. Prior walkback runs exceeded -10% account drawdown but did not halt because bypass was true. Exact halt-point verification is deferred to a post-fix baseline re-run with bypass=false.

NOTE: This item CONTRADICTS `ogz-meta/BACKTESTING_GUIDE.md:48` which claims the bypass is "Currently REQUIRED in backtests because the drawdown calculation is broken" — that claim is stale (pre-2026-03-14 fix) and will be corrected in Item 3.
```

**REASON:** Phase-0 baseline at `ogz-meta/specs/baseline-phase0-2026-04-20.md:21` explicitly sets `ACCOUNT_DRAWDOWN_BYPASS=true`. Two alignment docs describe the state differently, one calls the bug "broken" (BACKTESTING_GUIDE) while the other calls it "fixed" (BACKTEST-OPS). Both need a consistent post-fix status line. Softened to remove the specific `-$7,700` number since that was a partial/sampled reading not a confirmed-complete walkback number.

---

### Item 2 — `ogz-meta/BACKTEST-PIPELINE-AUDIT.md:337` (EMA SL=-0.5 "authoritative" framing)

**File:line:** `ogz-meta/BACKTEST-PIPELINE-AUDIT.md:337`

**BEFORE (verbatim, within a code block listing locked contracts):**
```
EMASMACrossover: { stopLossPercent: -0.5, takeProfitPercent: 1.0 }  // LOCKED - validated
```

**AFTER (proposed, v2 with verified MPM line citations):**
```
EMASMACrossover: { stopLossPercent: -0.5, takeProfitPercent: 1.0 }  // LOCKED - walk-forward validated 2026-03-20
```
Plus a new note block appended to the section:
```
POST-DEC-013 STATE (2026-04-13 onward): Matrix sweeps probe STOP_LOSS_PERCENT values in the 0.5%-5.0% range (see tools/matrix-sweep.js grid). Those sweep values are GHOST for the primary strategy SL path — every worker runs with the locked -0.5% regardless of what the matrix grid says, because locked exit contracts in TradingConfig.exitContracts override env-supplied STOP_LOSS_PERCENT per ENV-VAR-AUDIT.md.

HOWEVER — MaxProfitManager has a SEPARATE SL path that IS env-swappable: at core/MaxProfitManager.js:118, `initialStopLossPercent: TradingConfig.get('exits.stopLossPercent', 1.5) / 100` reads the env-backed global default. This gives MPM's initial-stop mechanism a real tuning surface that the primary locked-contract path doesn't have. Other env-honored MPM paths (full 18-site enumeration):
- profit tiers at MPM:106,108,110,112 (TIER*_TARGET → exits.profitTiers.*)
- tier exit fractions at MPM:107,109,111 (TIER*_EXIT_FRACTION → exitLogic.tieredExit.tier*ExitFraction)
- min hold time at MPM:134 (holdTimes.minHoldTimeMinutes)
- market regime multipliers at MPM:156-157 (exitLogic.tieredExit.trendingTargetMultiplier / rangingTargetMultiplier)
- BE scaleout bundle at MPM:227 (exitLogic.beScaleOut → BE_SCALEOUT_*)
- trail bundle at MPM:228 (exitLogic.trail → TRAIL_*)
- confidence thresholds/multipliers at MPM:607-610 (exitLogic.tieredExit.high/lowConfidenceThreshold/Multiplier — scales tier targets by trade confidence)
- fee buffer for breakeven stop at MPM:808 (fees.takerFee — BE stop moves above entry by round-trip fee amount)
```

**REASON:** Current TradingConfig.js:258-259 still has `stopLossPercent: -0.5` for EMASMACrossover, so the doc's numeric claim is correct. The "authoritative SL" reading misleads post-matrix work because:
- Matrix workers pass STOP_LOSS_PERCENT=0.5-5.0 values that appear in the grid but never reach the strategy's primary SL path
- Per MASTER-ROLLOUT DEC-013 these values are replaced after home-rig matrix rerun
- MaxProfitManager IS a consumer of exits.stopLossPercent (verified MPM:118 direct citation) via the tier/trail path

---

### Item 3 — `ogz-meta/BACKTESTING_GUIDE.md:48, 52` (STOP_LOSS_PERCENT "IGNORED" claim + drawdown "broken" claim)

**File:line:** `ogz-meta/BACKTESTING_GUIDE.md:48` and `:52`

**BEFORE (verbatim, line 48 excerpt — within long HONORED/PARTIAL/IGNORED table):**
```
ACCOUNT_DRAWDOWN_BYPASSStopLossChecker.js:48true disables the drawdown circuit breaker. Currently REQUIRED in backtests because the drawdown calculation is broken and fires on every trade when enabled.
```

**BEFORE (verbatim, line 52 excerpt):**
```
IGNORED — read into config but never affects trading
Env VarWhy IgnoredSTOP_LOSS_PERCENTEvery strategy has a locked exit contract with its own SL. The global default is never consulted.TAKE_PROFIT_PERCENTSame — locked exit contracts override.TRAILING_STOP_PERCENTSame — locked exit contracts override.
```

**AFTER (proposed, line 48 excerpt):**
```
ACCOUNT_DRAWDOWN_BYPASSStopLossChecker.js:48true disables the drawdown circuit breaker. Drawdown calculation was fixed 2026-03-14 (core/StateManager.js:99). Set false to enable the halt; set true only for isolated strategy testing where you want to observe raw strategy drawdown.
```

**AFTER (proposed, line 52 excerpt — restructure "IGNORED" to "PARTIAL" with verified MPM citations):**
```
PARTIAL — read by some consumers, ignored by primary path
Env Var | Consumer Status
STOP_LOSS_PERCENT | IGNORED by locked exit contracts in TradingConfig.exitContracts (primary strategy SL path). HONORED by MaxProfitManager at core/MaxProfitManager.js:118 which reads exits.stopLossPercent as initialStopLossPercent / 100.
TAKE_PROFIT_PERCENT | IGNORED by locked contracts. NOT directly consumed by MPM — profit-side tuning goes through TIER1_TARGET/TIER2_TARGET/TIER3_TARGET/FINAL_TARGET which land at MPM:106,108,110,112 via exits.profitTiers.*.
TRAILING_STOP_PERCENT | IGNORED by locked contracts. Trail tuning via MPM bundle read at MPM:228 (exitLogic.trail) fed by TRAIL_* env vars.
```

**REASON:**
- Line 48's "drawdown calculation is broken" is stale (bug fixed 2026-03-14)
- Line 52's flat "IGNORED" classification misses that MaxProfitManager.js:118 reads exits.stopLossPercent via TradingConfig.get(), making STOP_LOSS_PERCENT a real consumer via the one-hop path. TAKE_PROFIT_PERCENT and TRAILING_STOP_PERCENT don't have the same direct path — those tune via tier/trail env var families instead.
- Full MPM TradingConfig.get() site list verified 2026-04-20: 18 total sites (MPM:106, 107, 108, 109, 110, 111, 112, 118, 134, 156, 157, 227, 228, 607, 608, 609, 610, 808).

---

### Item 4 — `ogz-meta/MASTER-ROLLOUT.md:52-57` (Phase 1 L5 bundle shipped claim)

**File:line:** `ogz-meta/MASTER-ROLLOUT.md:52-57`

**BEFORE (verbatim):**
```
- [ ] **L1** — Skeleton ledger creation at trade birth (`core/StateManager.js` + `core/dto/DecisionLedgerSchema.js` new file)
- [ ] **L2** — Strategy signals + orchestrator decision capture (`StrategyOrchestrator.js` returns allResults including losers)
- [ ] **L4** — Position sizing breakdown with formula string (`OrderExecutor.js:55-81`)
- [ ] **L5** — Risk gates structured logging + rejections file (`RiskManager.js` + `TradingLoop.js:393-514`)
- [ ] **L8** — JSONL persistence on full close (`core/DecisionLedgerLogger.js` new file)
```

**AFTER (proposed — check boxes reflecting actual state):**
```
- [x] **L1** — Skeleton ledger creation at trade birth. SHIPPED. `core/dto/DecisionLedgerSchema.js:85-117` createLedgerSkeleton() called from StateManager/TradingLoop.
- [x] **L2** — Strategy signals + orchestrator decision capture. SHIPPED. `orchestratorDecision.competingStrategies[]` populated with losers, verified in live ledger sample.
- [x] **L4** — Position sizing breakdown. SHIPPED. `positionSizing` block populated with base/confidence/confluence multipliers.
- [ ] **L5** — Risk gates structured logging. NOT WIRED. Zero `riskGates.push()` sites in source (verified 2026-04-20). Skeleton initializes array empty, nothing writes to it.
- [x] **L8** — JSONL persistence on full close. SHIPPED. 720 MB/day `logs/decisions/decisions_*.jsonl` proves writer is live.

ADDITIONAL SHIPPED (not originally listed as part of Phase 1 bundle): **L6** — `core/StateManager.js:617` `trade.decisionLedger.exits.push(exitEntry)` populates multi-leg exits. 95,423 of 377,243 sample entries have non-empty exits[]. **L7** — outcome block populated on full close.

STILL NOT WIRED: L3 (confidenceModifiers — zero push-sites), L9 (lessonLearned), plus schema fields `pidState`, `traiInput`, `metadata` never populated.
```

**REASON:** MASTER-ROLLOUT checkboxes are all `[ ]` (unchecked) but the code state is mixed — L1/L2/L4/L6/L7/L8 shipped, L5 not. Without updated checkboxes the bundle-intent framing doesn't reflect reality. Mercury Q9/Q10 and direct grep 2026-04-20 verified zero push-sites for riskGates.

---

### Item 5 — 2026-03-06 strategy notepad (SKIPPED per operator)

Operator confirmed this notepad is local to their machine, not a repo file. Contents to be pasted inline in a comment on this summary doc for inclusion in the final audit. No scan needed. Skipping.

---

### Item 6 — Decision ledger schema vs live writer mismatch (RESOLVED: Desktop hybrid answer)

**File:line:**
- Schema: `ogz-meta/specs/decision-ledger-schema.json` top-level properties (18 keys)
- Writer: `core/dto/DecisionLedgerSchema.js:99-116` createLedgerSkeleton (15 keys)
- Live sample: first line of `logs/decisions/decisions_2026-04-19.jsonl` (17 keys)

**BEFORE (schema top-level, 18 properties):**
```
candleTimestamp, confidenceModifiers, confluence, executionMode, exitContract, exits, lessonLearned, metadata, orchestratorDecision, outcome, pidState, positionSizing, riskGates, strategySignals, symbol, timeframe, tradeId, traiInput
```

**AFTER (proposed — Desktop Q1 hybrid answer):**

Edit the schema (`ogz-meta/specs/decision-ledger-schema.json`):
- **ADD to top-level properties:** `entryPrice` (number), `direction` (enum long/short), `_persistedAt` (ISO string timestamp) — these are always emitted by the writer and are useful spec-level fields
- **KEEP unchanged:** `lessonLearned, pidState, traiInput, metadata` as optional roadmap fields — per DEC-001 L3/L5/L9 wiring is still pending. Don't retreat the spec to match implementation gaps; those fields are intentional roadmap targets.

Writer stays as-is this pass. When L3/L5/L9 wiring ships, the writer starts populating those schema fields naturally.

**REASON:** Operator answer Q1: "Hybrid per above: extend schema with entryPrice/direction/_persistedAt, keep lessonLearned/pidState/traiInput/metadata as unfilled schema roadmap (don't remove). Writer stays as-is for now, expands later when L3/L5/L9 wiring lands."

This preserves the spec authority (schema drives code, not vice versa) while acknowledging the three runtime-emitted fields that belong in the spec.

---

### Item 7 — `ogz-meta/ENV-VAR-AUDIT.md` STOP_LOSS_PERCENT consumer breakdown missing

**File:line:** `ogz-meta/ENV-VAR-AUDIT.md:48-49` (audit table IGNORED rows)

**BEFORE (verbatim, line 48-49 table rows):**
```
| `STOP_LOSS_PERCENT` | `TradingConfig.js:211` | NO — Every strategy has LOCKED `exitContract` that overrides this | **IGNORED** |
| `TAKE_PROFIT_PERCENT` | `TradingConfig.js:212` | NO — Every strategy has LOCKED `exitContract` that overrides this | **IGNORED** |
```

**AFTER (proposed, v2 with verified line citations):**
```
| `STOP_LOSS_PERCENT` | `TradingConfig.js:216` (global) + `MaxProfitManager.js:118` (MPM initialStopLossPercent) | **PARTIAL** — IGNORED by locked exit contracts (primary strategy SL). HONORED by MaxProfitManager's initialStopLossPercent at MPM:118 which reads `exits.stopLossPercent` via TradingConfig.get(). |
| `TAKE_PROFIT_PERCENT` | `TradingConfig.js:217` (global) — no direct MPM consumer found | **IGNORED by all verified consumers**. Profit-side tuning uses TIER1_TARGET/TIER2_TARGET/TIER3_TARGET/FINAL_TARGET via exits.profitTiers.* at MPM:106,108,110,112. |
| `TRAILING_STOP_PERCENT` | `TradingConfig.js:218` (global) — no direct MPM consumer found | **IGNORED by verified consumers**. Trail tuning via TRAIL_* env vars via exitLogic.trail bundle at MPM:228. |
```

**REASON:** Current TradingConfig.js line numbers verified 2026-04-20: `STOP_LOSS_PERCENT` at `:216`, `TAKE_PROFIT_PERCENT` at `:217`, `TRAILING_STOP_PERCENT` at `:218` (not `:211-213` as doc claimed). MPM grep confirmed only STOP_LOSS_PERCENT has a direct consumer (MPM:118); TAKE_PROFIT_PERCENT and TRAILING_STOP_PERCENT don't have direct consumers but tune via sibling env-var families. Audit's IGNORED classification is correct for primary path but needs the nuance for STOP_LOSS_PERCENT.

---

### Item 8 — `tools/matrix-sweep.js` header lacks `--phase atr` note

**File:line:** `tools/matrix-sweep.js:24-29` (documentation header — usage block)

**BEFORE (verbatim):**
```
 * Usage:
 *   node tools/matrix-sweep.js --data tsla              # Full matrix, all strategies
 *   node tools/matrix-sweep.js --data tsla --solo=RSI   # RSI only (200 configs)
 *   node tools/matrix-sweep.js --data tsla --phase exits # Just SL/TP sweep, locked conf
 *   node tools/matrix-sweep.js --data tsla --phase conf  # Just confidence, locked exits
 *   node tools/matrix-sweep.js --data tsla --quick       # Reduced grid (fast sanity check)
```

**AFTER (proposed — add a new line noting ATR phase status):**
```
 * Usage:
 *   node tools/matrix-sweep.js --data tsla              # Full matrix, all strategies
 *   node tools/matrix-sweep.js --data tsla --solo=RSI   # RSI only (200 configs)
 *   node tools/matrix-sweep.js --data tsla --phase exits # Just SL/TP sweep, locked conf
 *   node tools/matrix-sweep.js --data tsla --phase conf  # Just confidence, locked exits
 *   # --phase atr is NOT IMPLEMENTED. ATR dimension tuning is tracked in POST-MATRIX-BACKLOG. To add when U-methodology extends.
 *   node tools/matrix-sweep.js --data tsla --quick       # Reduced grid (fast sanity check)
```

**REASON:** Not strictly drift (docs don't CLAIM ATR exists) but Desktop flagged that future sessions may assume it based on the two-phase precedent. A not-implemented note prevents misinterpretation.

---

## ADDITIONAL DRIFT ITEMS FOUND BEYOND DESKTOP'S 8

### Item 9 — `$970.71` anchor retired per DEC-001, still referenced in METHODOLOGY doc (6 occurrences, all rewritten)

**File:line:** `ogz-meta/METHODOLOGY-VALIDATION-PIPELINE.md` — exactly 6 occurrences verified 2026-04-20

**All 6 BEFORE/AFTER pairs:**

#### Line 4:
**BEFORE:**
```
**Status:** Canonical methodology document. Captures both the historical methodology that produced the $970.71 regression anchor AND the upgraded tournament methodology designed for future strategy validation.
```
**AFTER:**
```
**Status:** Canonical methodology document. Describes historical linear methodology AND upgraded tournament methodology. SUPERSEDED REGRESSION ANCHOR: the prior $970.71 RSI+EMA combined-run reference is RETIRED per MASTER-ROLLOUT DEC-001. Each strategy ships solo with its own walk-forward-validated contract. No combined reference number exists.
```

#### Line 23:
**BEFORE:**
```
This is the methodology that produced the $970.71 RSI+EMASMACrossover regression anchor and the 7-of-8 multi-ticker validation result. It is linear, manual, and currently the only methodology that has been actually executed end-to-end.
```
**AFTER:**
```
This is the methodology that HISTORICALLY produced a combined RSI+EMASMACrossover snapshot (prior anchor `$970.71`, now RETIRED per DEC-001) and the 7-of-8 multi-ticker validation result. It is linear, manual, and currently the only methodology that has been actually executed end-to-end. Future strategy validation uses this methodology per-strategy solo, not combined.
```

#### Line 119 (inside combined-stack results table):
**BEFORE:**
```
| RSI + EMA | $970 | 1,416 |
```
**AFTER:**
```
| RSI + EMA (HISTORICAL, retired per DEC-001) | $970 | 1,416 |
```

#### Line 138 (inside multi-ticker generalization table):
**BEFORE:**
```
| TSLA | +$970 | 1,416 | 47.5% | ✅ |
```
**AFTER:**
```
| TSLA (HISTORICAL combined RSI+EMA snapshot, no longer the production config) | +$970 | 1,416 | 47.5% | ✅ |
```

#### Line 159 (current regression anchor claim — operationally critical):
**BEFORE:**
```
The current regression anchor is **$970.71 / 1416 trades / 47.5% WR** on `tuning/tsla-15m-2y.json` with `SOLO_STRATEGY=RSI,EMASMACrossover`.
```
**AFTER:**
```
There is NO current combined-strategies regression anchor. Per DEC-001 each strategy is tested in isolation and ships with its own validated exit contract. The prior $970.71 / 1416 trades / 47.5% WR number was a combined RSI+EMA snapshot that cannot be reproduced under current orchestrator selection semantics (single winner per candle, not blended). Current reference baselines live at `ogz-meta/specs/baseline-phase0-*.md` per-run.
```

#### Line 333 (session-gate instruction — operationally critical):
**BEFORE:**
```
Before changing anything, the next session must reproduce $970.71 with the current framework using the historical methodology. This confirms the locked TradingConfig values are still intact and the framework is honest end-to-end. If reproduction fails, bisect to find the regression before doing anything else.
```
**AFTER:**
```
Before changing anything, the next session must reproduce the most-recent baseline recorded at `ogz-meta/specs/baseline-phase0-*.md` with the current framework. This confirms the locked TradingConfig values are still intact and the framework is honest end-to-end. If reproduction fails, bisect to find the regression before doing anything else.

NOTE (2026-04-20): The prior gate of "reproduce $970.71" is RETIRED per DEC-001 — the $970.71 figure was a combined RSI+EMA snapshot that is not reproducible under current orchestrator winner-selection semantics.
```

**REASON:** `MASTER-ROLLOUT.md` DEC-001: *"Forget $970.71 number. Was combined RSI+EMA snapshot, not reproducible methodology baseline."* Operator confirmed 2026-04-20: "the $970 needs to be changed — strategies are independent to their own pipeline." All 6 occurrences need full rewrite, not just 2.

---

### Item 10 — "5% base position" framing misrepresents effective behavior

**File:line:** `ogz-meta/BACKTESTING_GUIDE.md:48` (in env var description for `MAX_POSITION_SIZE_PCT`)

**BEFORE (verbatim excerpt):**
```
MAX_POSITION_SIZE_PCTOrderExecutor.js:57,71Base position sizing as fraction of balance. Example: 0.05 for 5%. The orchestrator multiplies this by confidence (0.5x–2.5x) and confluence (1x–2.5x).
```

**AFTER (proposed):**
```
MAX_POSITION_SIZE_PCT | OrderExecutor.js:55-82 | Named as "Max" but USED AS BASE. OrderExecutor reads this value at line 57 and treats it as the base that gets multiplied by confidence (0.5x–2.5x) and confluence (1x–2.5x). Actual live position sizes run 7%–12.5% of account in practice, NOT 5%. There is a separate `BASE_POSITION_SIZE=0.01` env var that is NOT read by OrderExecutor — that's the known bug flagged in CONFIG-FINGERPRINT-REGISTRY.md issue #4. Operator intent was 1% base × multipliers; code behavior is 5% base × multipliers. Schema validation + config migration will resolve this.
```

**REASON:** Operator noted 2026-04-20: "the 5% position sizing isn't a thing." Per BACKTEST-PIPELINE-AUDIT + verbose trace the positions observed in backtest are 7.7%–12.5% of account. The "5% base" framing describes intent, not reality. Per CONFIG-FINGERPRINT-REGISTRY known-issue #4: OrderExecutor uses the wrong env var name.

---

### Item 11 — `ogz-meta/BACKTEST-OPS.md:37` EMA strategy marked "Active" without LOCKED marker

**File:line:** `ogz-meta/BACKTEST-OPS.md:37` (Strategy Registry table)

**BEFORE (verbatim):**
```
| `EMASMACrossover` | `ENABLE_EMA=true` | strategies.EMACrossover | ✅ Active | Decay 10 bars, snapback 2.5% |
```

Compare to RSI row `:35`:
```
| `RSI` | `ENABLE_RSI=true` | strategies.RSI | ✅ LOCKED | Walk-forward validated 2026-03-20. SL -0.8%, TP 1.0%, min conf 60% |
```

**AFTER (proposed):**
```
| `EMASMACrossover` | `ENABLE_EMA=true` | strategies.EMACrossover | ✅ LOCKED | Walk-forward validated 2026-03-20. SL -0.5%, TP 1.0% (per TradingConfig.exitContracts.EMASMACrossover). Decay 10 bars, snapback 2.5%. |
```

**REASON:** `core/TradingConfig.js:258-271` has a full locked contract for EMASMACrossover with `_validated: '2026-03-20'`. The BACKTEST-OPS registry reads like EMA is less-validated than RSI but both carry the same validation marker.

---

### Item 12 — `ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md` stale (no entries post-2026-03-17) (RESOLVED: Desktop Q3 answer — archive in place)

**File:line:** `ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md` (Active Fingerprints table at top)

**BEFORE (verbatim):**
```
| Fingerprint | Date | Description | Verified By |
|---|---|---|---|
| `4aef3ea0cf32e1bd` | 2026-03-17 | VPS production baseline — env var wiring confirmed working. Exit contracts reading from .env. | Claude Opus + config-audit.js |
| `a8eee8a7686d0b1e` | 2026-03-17 | VPS BEFORE exit contract env wiring — exit contracts were hardcoded, ignoring .env values. DO NOT USE. | Claude Opus + config-audit.js |
```

**AFTER (proposed — Desktop Q3 answer: archive-in-place + status note):**
```
**STATUS 2026-04-20:** This registry is SUPERSEDED by the Phase 6 snapshot manifest (`config/snapshots/manifest.jsonl`) defined in CONFIG-CONSOLIDATION-SPEC.md. No new fingerprints will be recorded here — Phase 6 writes every process-start snapshot automatically. The rows below are preserved as historical record of pre-migration state.

Phase 0 baseline (post-this-doc) recorded at `ogz-meta/specs/baseline-phase0-2026-04-20.md` uses git SHA `c49c9ab` on branch `config/consolidation`.

| Fingerprint | Date | Description | Verified By |
|---|---|---|---|
| `4aef3ea0cf32e1bd` | 2026-03-17 | VPS production baseline — env var wiring confirmed working. Exit contracts reading from .env. | Claude Opus + config-audit.js |
| `a8eee8a7686d0b1e` | 2026-03-17 | VPS BEFORE exit contract env wiring — exit contracts were hardcoded, ignoring .env values. DO NOT USE. | Claude Opus + config-audit.js |
```

**REASON:** No new fingerprints logged in 34+ days. Desktop Q3: "Archive-in-place with status note. Don't delete. Historical fingerprints have provenance value, and the status annotation tells future sessions what to use instead."

---

### Item 13 — `ogz-meta/BACKTESTING_GUIDE.md:151` changelog has only one entry (per Desktop Q5 addition)

**File:line:** `ogz-meta/BACKTESTING_GUIDE.md:149-154`

**BEFORE (verbatim):**
```
8. Change Log

2026-04-07 — Initial guide. Audited all env vars. Identified STOP_LOSS_PERCENT / TAKE_PROFIT_PERCENT / TRAILING_STOP_PERCENT as IGNORED due to locked exit contracts. Identified TRAILING_STOP_ENABLED and REGIME_* as ghost env vars. Rewrote SWEEP_PRESETS in parallel-backtest.js to remove decorative presets. Added --real sweep mode that only varies HONORED env vars. Documented the five-test playbook for the first time.
```

**AFTER (proposed — append 2026-04-20 entry):**
```
8. Change Log

2026-04-20 — Doc alignment sweep. Corrected ACCOUNT_DRAWDOWN_BYPASS "broken" claim (fixed 2026-03-14). Reclassified STOP_LOSS_PERCENT from flat IGNORED to PARTIAL (HONORED by MaxProfitManager:118). Flagged MAX_POSITION_SIZE_PCT 5% framing as describing intent not reality (actual observed 7%-12.5%). See `ogz-meta/specs/doc-alignment-sweep-2026-04-20.md` for full drift table.

2026-04-07 — Initial guide. Audited all env vars. Identified STOP_LOSS_PERCENT / TAKE_PROFIT_PERCENT / TRAILING_STOP_PERCENT as IGNORED due to locked exit contracts. Identified TRAILING_STOP_ENABLED and REGIME_* as ghost env vars. Rewrote SWEEP_PRESETS in parallel-backtest.js to remove decorative presets. Added --real sweep mode that only varies HONORED env vars. Documented the five-test playbook for the first time.
```

**REASON:** Desktop Q5 addition #1: changelog has only the initial entry, needs 2026-04-20 entry pointing at this drift sweep for future readers.

---

### Item 14 — `ogz-meta/TODO-NEXT-SESSION.md` + `ogz-meta/RUNNING-TODO.md` staleness (per Desktop Q5 addition)

**File:line:**
- `ogz-meta/TODO-NEXT-SESSION.md` — entire file
- `ogz-meta/RUNNING-TODO.md` — "IN PROGRESS" section top of file

**BEFORE (TODO-NEXT-SESSION.md full content summary):**
The doc still carries only the 2026-03-30 item ("Duplicate LLM Client - Maintenance Bomb"). Nothing recorded from 2026-04 work.

**BEFORE (RUNNING-TODO.md excerpt, top of IN PROGRESS section):**
```
## IN PROGRESS

### SmartMoneySweep Strategy (#5)
**Status:** VALIDATED on TradingView - ready for Node.js port

**TradingView Results (2026-03-24):**
- TSLA: 207 trades, 49.76% WR, 1.555 PF, +$202.71
...
**Combined: +$313 on $10K (3.1%) across 5 stocks, zero parameter tuning**
```

**AFTER (proposed for both):**

TODO-NEXT-SESSION.md gets a prepended entry:
```
## 2026-04-20: Config Consolidation Phase 0 — Baseline Recorded + Doc Alignment Pending

**Status:** Phase 0 of CONFIG-CONSOLIDATION-SPEC.md landed on branch `config/consolidation` (commit `2dbec67`). Baseline at `ogz-meta/specs/baseline-phase0-2026-04-20.md`: +79.5% / 1430 trades / 57.55% WR / 2.63% DD. Doc alignment sweep pending operator approval — full drift table at `ogz-meta/specs/doc-alignment-sweep-2026-04-20.md`.

**Next session pickup:** Phase 1 scaffold (JSON config + schema + snapshot dirs). Awaiting operator green-light on alignment sweep and Phase 1 approval.

---

(Historical entries below preserved)
```

RUNNING-TODO.md SMS section updated:
```
## IN PROGRESS

### SmartMoneySweep Strategy (#5)
**Status (updated 2026-04-20):** Node.js module exists at modules/SmartMoneySweep.js + registered in StrategyOrchestrator. Cross-ticker matrix sweeps ran 2026-04-17/18/19 producing $5.8K-$11K P&L across TSLA/COIN/MARA with zero parameter retuning — strategy generalizes. Pending: walkback/walkforward out-of-sample validation and locked exit contract finalization.

**Original TradingView Results (2026-03-24, kept for historical reference):**
- TSLA: 207 trades, 49.76% WR, 1.555 PF, +$202.71
...
**Combined: +$313 on $10K (3.1%) across 5 stocks, zero parameter tuning**
```

**REASON:** Desktop Q5 addition #2: "CC's file list showed these exist but not verified as current. Probably stale. Worth a scan pass." Verified 2026-04-20: TODO-NEXT-SESSION.md last updated with a 2026-03-30 item; RUNNING-TODO.md's "IN PROGRESS" section for SMS dated 2026-03-24 but SMS has since been ported and matrix-tested across tickers.

---

### Item 15 — `ogz-meta/MASTER-ROLLOUT.md` Phase 2-5 checkboxes unchecked despite partial shipping (per Desktop Q5 addition)

**File:line:** `ogz-meta/MASTER-ROLLOUT.md:63-108` (Phase 2, 3, 4, 5 checkbox blocks)

**BEFORE (verbatim excerpts):**

Phase 2:
```
- [ ] Run `node tools/parallel-backtest.js --real --stocks --data tsla --solo=RSI` with ledger writing active
- [ ] Confirm ledger files populate correctly during sweep
- [ ] Run full per-strategy sweep across all 9 active strategies
- [ ] Walk-forward validation against held-out datasets
- [ ] Multi-ticker generalization (TSLA-tuned configs against NVDA, RIOT, QQQ, MARA, SPY, COIN with zero retuning)
...
```

Phase 3 (all brain-bug fix items unchecked).

**AFTER (proposed — partial checkboxes reflecting actual shipped state):**

Phase 2:
```
- [x] Matrix sweeps ran on home rig via tools/matrix-sweep.js (evolved from parallel-backtest.js). SHIPPED.
- [x] Confirm ledger files populate correctly during sweep. VERIFIED 2026-04-20 — 720MB/day decision-ledger JSONL with schema-valid records.
- [~] Run full per-strategy sweep across all 9 active strategies. PARTIAL — EMA + RSI matrix-swept, SMS cross-ticker validated, MADynamicSR/LiquiditySweep/OGZTPO pending per-strategy runs.
- [~] Walk-forward validation against held-out datasets. PARTIAL — walkback (2023-03→2024-03) and walkforward (2026-02→2026-04) data pulled and committed on config/consolidation branch; actual walk-forward runs pending.
- [x] Multi-ticker generalization (TSLA, COIN, MARA verified 100% profitable across all configs 2026-04-17/18/19). NVDA/RIOT/QQQ/SPY pending.
- [ ] Lock new validated exit contracts in `TradingConfig.exitContracts` with new `_validated` dates
- [ ] Pick best single strategy for Apex eval account based on validated numbers
```

Phase 3 brain-bug items:
```
- [x] **TRAI multi-leg outcome aggregation** — SHIPPED in Set C brain-bug fix (commit `dcb8391`).
- [x] **TradeJournal multi-leg lifecycle** — SHIPPED in Set C.
- [x] **UnifiedPatternMemory parent-trade consolidation** — SHIPPED in Set C.
- [ ] **BreakEvenManager partial-aware** — status unverified, check before proceeding.
- [x] **MaxProfitManager state ownership** (Map-of-instances) — SHIPPED in Set A (commit `50eff2a`).
- [x] **StateManager.reducePosition** — SHIPPED in Set A. Verified at StateManager.js:574.
- [x] **OrderExecutor partial-close fraction handling** — SHIPPED in Set A. Fixed `exitFraction > 0 && < 1` check at OrderExecutor.js:611.
- [x] **BacktestRecorder leg accumulation** — SHIPPED in Set B (commit `cb04261`).
- [x] **L6** — Exit ledger entries. SHIPPED. StateManager.js:617.
- [x] **L7** — Outcome summary on full close. SHIPPED.
```

Phase 4, 5 — unchanged (still all unchecked, none have shipped).

**REASON:** Desktop Q5 addition #3: "MASTER-ROLLOUT.md beyond Item 4's Phase 1 block — the other phase bundles (Phase 2, 3, etc.) also have checkboxes that haven't been updated to reflect what's shipped." Brain-bug fix commits 50eff2a/cb04261/dcb8391 addressed most of Phase 3 per my memory + verified in session. Cross-ticker matrix results verified this session.

---

## ALREADY-CURRENT DOCS (no edit needed)

- `ogz-meta/recent-changes.md` — updated 2026-04-20 with Phase 0 baseline entry
- `ogz-meta/GRAND-SCHEME.md` — vision doc, not state-tracking, still accurate
- `ogz-meta/04_guardrails-and-rules.md` — principles, no drift
- `ogz-meta/05_landmines-and-gotchas.md` — historical catalog

---

## HELD FOR AFTER ALIGNMENT (not drift, parked code decisions)

- Fixes 1-6 (matrix reporter + BacktestRunner.summary + unlinkSync removal) — atomic single commit per Desktop + CC agreement
- Expectancy in matrix schema — calculated + included, not dropped

---

## RECOMMENDED COMMIT STRATEGY

Single batched commit, title `docs(alignment): consolidate post-brain-bug + post-config-migration state across alignment docs`.

Commit message body includes the full BEFORE/AFTER delta table from this summary doc, per Desktop's directive: *"the commit message and the summary doc both need the full per-doc line-by-line delta, not a bullet summary."*

Files modified (15 items spanning):
- `ogz-meta/BACKTEST-OPS.md` (Items 1, 11)
- `ogz-meta/BACKTEST-PIPELINE-AUDIT.md` (Item 2)
- `ogz-meta/BACKTESTING_GUIDE.md` (Items 3, 10, 13)
- `ogz-meta/MASTER-ROLLOUT.md` (Items 4, 15)
- `ogz-meta/ENV-VAR-AUDIT.md` (Item 7)
- `tools/matrix-sweep.js` (Item 8 — header comment only, no code)
- `ogz-meta/METHODOLOGY-VALIDATION-PIPELINE.md` (Item 9 — 6 BEFORE/AFTER pairs)
- `ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md` (Item 12)
- `ogz-meta/specs/decision-ledger-schema.json` (Item 6 — add entryPrice/direction/_persistedAt)
- `ogz-meta/TODO-NEXT-SESSION.md` (Item 14)
- `ogz-meta/RUNNING-TODO.md` (Item 14)

Plus this summary doc itself (`ogz-meta/specs/doc-alignment-sweep-2026-04-20.md`).

---

## OPERATOR ANSWERS TO QUESTIONS (Desktop Q1-Q5 APPLIED)

1. **Item 6 schema vs writer** → RESOLVED as hybrid. Schema gains `entryPrice, direction, _persistedAt`; keeps `lessonLearned, pidState, traiInput, metadata` as roadmap. Writer stays unchanged.
2. **Item 9 $970 scope** → METHODOLOGY doc only this pass (6 BEFORE/AFTER pairs in §9). Broader indirect-reference scan queued as follow-up.
3. **Item 12 registry disposition** → Archive-in-place + status note (don't delete).
4. **Item 5 notepad** → Operator will paste inline when ready; no scan needed.
5. **Q5 beyond-8 additions** → Items 13, 14, 15 added.

---

## AUDIT FEEDBACK ADDRESSED FROM v1 → v2

- Item 1: removed specific unverified `-$7,700` figure per Desktop audit
- Items 2/3/7: replaced placeholder line ranges with verified MPM line citations (18 sites total; primary SL env at MPM:118)
- Item 9: full BEFORE/AFTER for all 6 occurrences (Desktop said 8+, actual is 6; line 333 gate text rewritten properly)
- Item 6: committed to hybrid resolution (Desktop Q1 answer)
- Items 13/14/15 added (Desktop Q5 additions)

---

Once operator signs off on v2, I execute the batched edit + commit + push + /recorder + reindex Mercury.
