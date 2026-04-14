# Codex Finding Verification — Mercury
**Date:** 2026-04-14
**Purpose:** Verify Codex second-opinion findings against actual source

---

## Findings 1-5 (31 iterations, 27.8s)

**FINDING 1 – MPM Fraction Timing**  
- The `executePartialExit` method reduces `this.state.remainingSize` at **line 691** of `core/MaxProfitManager.js`.  
- The tier‑exit return that reports `remainingSize` is at **line 505** of the same file.  
- Because the mutation occurs in `executePartialExit` (called on line 499) **before** the return statement, `remainingSize` is already reduced when line 505 is evaluated.  

**Result:** **CONFIRMED** – remainingSize is mutated **before** the exit‑fraction/return computation.  

*Evidence:* `core/MaxProfitManager.js:505` (return) & `core/MaxProfitManager.js:691` (mutation).  

---

**FINDING 2 – OrderExecutor removeActiveTrade**  
- Calls to `stateManager.removeActiveTrade` appear at **line 292**, **line 432**, and **line 905** of `core/OrderExecutor.js`.  
- **Line 905** is inside the `SELL` (close‑long) block (see lines 506‑508) and is executed after a successful sell, regardless of whether the sell is a full or partial close. No check of `remainingSize` or `partial` is performed before this call.  

**Result:** **CONFIRMED** – a `removeActiveTrade` call exists in the SELL/close path (line 905) and it does **not** guard against partial closes, so it would delete the trade even when only a portion was closed.  

*Evidence:* `core/OrderExecutor.js:506‑508` (SELL block) & `core/OrderExecutor.js:905` (removeActiveTrade).  

---

**FINDING 3 – StateManager closePosition size handling**  
- `closePosition` reads the trade’s size from `trade.sizeUsd` (or `trade.size`) at **line 462** and computes `closeSize` at **line 466**.  
- The P&L calculation on **line 480** uses `closeSize` (derived from the stored trade) and **ignores** the `size` argument passed to the method.  

**Result:** **CONFIRMED** – the `size` parameter is never used for P&L; the method always relies on the stored trade’s size.  

*Evidence:* `core/StateManager.js:460‑466` (size extraction) & `core/StateManager.js:480` (PnL).  

---

**FINDING 4 – BacktestRecorder P&L overwrite (Mission 5 proposal)**  
- The proposal’s **Edit 3** (lines 101‑105) shows that when a duplicate `tradeId` is found, the existing record’s `netPnlDollars` and `netPnlPercent` are **overwritten** with the latest leg’s values, not accumulated with `+=`.  

**Result:** **OVERWRITE** – Edit 3 replaces the P&L fields (`=`) rather than summing them.  

*Evidence:* `ogz-meta/proposals/MISSION-1776134965126-REFACTOR-PROPOSAL.md:101‑105`.  

---

**FINDING 5 – TRAI profit‑loss percent math (Mission 6 proposal)**  
- In **Edit 2** of the same proposal, the aggregation logic adds `tradeData.profitLossPercent` to `existing.profitLossPercent` using `+=` on **line 82**.  
- Summing percentages arithmetically across legs is **not mathematically correct** for sub‑position percentages; the proper approach would weight each leg’s percent by its size before summing.  

**Result:** **PARTIAL** – the code does sum the percentages (`+=`), but this method is mathematically inaccurate for partial‑position percentages.  

*Evidence:* `ogz-meta/proposals/MISSION-1776135008383-REFACTOR-PROPOSAL.md:81‑82`.


---

## Findings 6-10 (retry)

(max iterations reached without a final answer)

---

## Findings 6-10 (individual queries + manual verification)

**FINDING 6 — TRAI remainingSize default to 0:** **CONFIRMED**
Mission 6 proposal defaults `remainingSize: tradeData.remainingSize || 0`. This causes premature learning sample fire when caller forgets remainingSize.
Evidence: MISSION-1776135008383-REFACTOR-PROPOSAL.md lines 70-78.

**FINDING 7 — UPM holdTimeMs sum:** **CONFIRMED**
Mission 7 proposal sums holdTimeMs with `+=` across legs. Should be clock time entry-to-close, not sum of per-leg durations.
Evidence: MISSION-1776135236247-REFACTOR-PROPOSAL.md line 146.

**FINDING 8 — Map-of-MPM not implemented:** **CONFIRMED**
MPM is singleton at run-empire-v2.js:610 (`this.maxProfitManager = new MaxProfitManager()`). No profitManagers Map in StateManager. Concurrent trades share state.
Evidence: grep of run-empire-v2.js and core/StateManager.js.

**FINDING 9 — Missing files:**
- core/PositionTracker.js: **NEEDS UPDATE** — has closePosition method (line 265-267) that delegates
- core/TradeJournalBridge.js: **NEEDS UPDATE** — doesn't propagate remainingSize (lines 138-150 missing field)
- core/TradeReplayCapture.js: **NEEDS UPDATE** — overwrites per orderId (line 147-149), multi-exit loses prior replays

**FINDING 10 — Mission 0 spec ownership model:** **CONFIRMED SOUND**
StateManager owns state, exitSize/exitFraction/remainingSize semantics defined, invariants specified. Consistent with current codebase architecture.

---

## FULL SCORECARD

| Finding | Codex Claim | Mercury Verdict |
|---------|-------------|-----------------|
| 1. MPM fraction timing | remainingSize mutated before exitFraction | **CONFIRMED** |
| 2. OrderExecutor removeActiveTrade | Kills trade on partial close | **CONFIRMED** |
| 3. StateManager ignores size param | PnL uses full trade.sizeUsd | **CONFIRMED** |
| 4. BacktestRecorder P&L overwrite | Overwrites not accumulates | **CONFIRMED** |
| 5. TRAI percent math | Sums percentages incorrectly | **PARTIAL** (sums with +=, wrong math) |
| 6. TRAI remainingSize default | Defaults to 0, premature fire | **CONFIRMED** |
| 7. UPM holdTimeMs sum | Sums durations, should be clock time | **CONFIRMED** |
| 8. Map-of-MPM not implemented | Still singleton | **CONFIRMED** |
| 9. Missing files | 3 files need partial awareness | **CONFIRMED** (PositionTracker, TradeJournalBridge, TradeReplayCapture) |
| 10. Mission 0 spec quality | Ownership model sound | **CONFIRMED** |

**Result: 9 CONFIRMED, 1 PARTIAL. Codex was right on all 10 findings.**
