
---

## 2026-04-20: Doc Alignment Sweep — 15 items across 11 alignment files

**Impact:** DOCS ONLY — zero execution-path code changes

**Summary:** Batched doc commit consolidating alignment state after brain-bug fixes + config consolidation Phase 0 + DEC-001 $970.71 anchor retirement. Full BEFORE/AFTER delta table at `ogz-meta/specs/doc-alignment-sweep-2026-04-20.md`.

**Files Changed:**
- ogz-meta/BACKTEST-OPS.md (Items 1, 11)
- ogz-meta/BACKTEST-PIPELINE-AUDIT.md (Item 2)
- ogz-meta/BACKTESTING_GUIDE.md (Items 3, 10, 13)
- ogz-meta/MASTER-ROLLOUT.md (Items 4, 15)
- ogz-meta/ENV-VAR-AUDIT.md (Item 7)
- tools/matrix-sweep.js (Item 8 — header comment only)
- ogz-meta/METHODOLOGY-VALIDATION-PIPELINE.md (Item 9 — 6 edits)
- ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md (Item 12)
- ogz-meta/specs/decision-ledger-schema.json (Item 6)
- ogz-meta/TODO-NEXT-SESSION.md (Item 14a)
- ogz-meta/RUNNING-TODO.md (Item 14b)
- ogz-meta/specs/doc-alignment-sweep-2026-04-20.md (new summary doc)

**Status:** Committed `70d0566` + pushed. Desktop v1+v2 audit rounds applied before commit. Mercury reindex + fixes.jsonl entry follow-up commit.

---

## 2026-04-20: Config Consolidation Migration — Phase 0 Baseline

**Impact:** BASELINE — reference numbers for 14-phase config migration

**Summary:** Recorded pre-migration backtest numbers on `config/consolidation` branch. Every subsequent phase (1-14) must reproduce these to the cent before advancing per CONFIG-CONSOLIDATION-SPEC.md §4.2.

**Numbers:**
- Final $17,950.59 (+79.5% / +$7,950.59) on $10K
- 1,430 trades, 57.55% WR (823W/607L)
- 2.63% max drawdown (well under Apex 5%)
- $15.37 avg win / -$7.75 avg loss (2:1 asymmetric)
- 44.4s wall-clock on 15,889 TSLA 15m candles

**Files Changed:**
- ogz-meta/specs/baseline-phase0-2026-04-20.md (new)

**Status:** Pushed as 2dbec67. Awaiting Phase 1 approval gate (scaffold JSON config + schema).

**Gotcha:** Initial run hung at 27min CPU. Re-ran with `timeout 300` wrapper. Every phase re-verify must include timeout + BACKTEST COMPLETE marker check.

---

## 2026-03-26: Long-Only Pipeline Fix (17 Bugs)

**Impact:** CRITICAL - Shorts were completely broken

**Summary:** Complete audit of pipeline revealed 17 locations where code assumed long-only trading. All fixed:

- TradingLoop: Added SELL_SHORT decision branch
- OrderExecutor: Added SELL_SHORT entry + COVER exit handlers
- StateManager: Direction storage, negative position support, balance accounting
- Exit system: Direction-aware PnL in all checkers
- RiskManager: Bypass now defaults to false

**Files Changed:**
- core/TradingLoop.js
- core/OrderExecutor.js
- core/StateManager.js
- core/ExitContractManager.js
- core/exit/DynamicTrailingStop.js
- core/exit/TrailingStopChecker.js
- core/RiskManager.js

**Status:** Pushed, awaiting backtest verification

