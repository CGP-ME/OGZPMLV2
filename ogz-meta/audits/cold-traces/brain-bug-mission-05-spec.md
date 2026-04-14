# Brain Bug Mission 0.5 — Consolidated Refactor Spec

**Source:** Synthesis of 7 independent cold-trace audits + Mercury cross-verification (19/20 findings verified against current HEAD)
**Date:** 2026-04-14
**Status:** Canonical scope for brain bug refactor — supersedes Mission 0 spec (which covered Set A only)
**Branch:** broker/alpaca-integration
**Commit verified against:** 718169b

---

## 0) Background

The original Mission 0 spec (Codex, committed 2026-04-14) scoped the partial-close pipeline refactor to 8 files. Subsequent multi-AI cold-trace polling (GPT, GPT-product, Cursor, Cursor Premium, Codex×2, Grok-outlier) surfaced 14 additional findings beyond the original scope, including one live-trading killer (Alpaca quantity bug). Mercury cross-verification against actual source confirmed 19 of 20 findings match current code at cited file:line.

This spec consolidates all 19 verified findings into 6 atomic implementation sets with execution ordering. Set E (Alpaca quantity) is documented here for completeness but executed standalone after brain bug fix.

---

## 1) Verified findings — full inventory

Each finding is verified against current HEAD with file:line evidence from Mercury cross-verification.

### Partial close mechanics

**F1 — MaxProfitManager emits absolute exitSize, not fraction**
- File: `core/MaxProfitManager.js`
- Lines: 460 (`exitSize: scaleOutSize`), 504 (`exitSize: tierExit.exitSize`), 623 (`exitSize: this.state.originalSize * tier.exit`)
- Behavior: Emits absolute USD value (originalSize × tier.exit)
- Verified: YES

**F2 — OrderExecutor partial-close detection assumes exitSize is a fraction**
- File: `core/OrderExecutor.js`
- Line: 592 (`const isPartialClose = decision.exitSize && decision.exitSize > 0 && decision.exitSize < 1;`)
- Behavior: Treats exitSize as fraction. For any real position size (USD value > 1), evaluates false → silent full close
- Verified: YES

**F3 — StateManager.closePosition ignores size argument**
- File: `core/StateManager.js`
- Line: 465 (`const closeSize = Math.abs(tradeSizeUsd);`)
- Behavior: Computes close size from full stored trade, never uses passed `size` parameter
- Verified: YES

**F4 — StateManager.closePosition deletes trade unconditionally**
- File: `core/StateManager.js`
- Line: 490 (`this.state.activeTrades.delete(tradeId);`)
- Behavior: Removes trade from activeTrades on every close call regardless of partial flag or remainingSize
- Verified: YES

**F5 — Multi-leg lifecycle architecturally present but functionally broken**
- Files: `core/MaxProfitManager.js` (tier system, remainingSize, completedTiers), `core/StateManager.js` (full-close behavior), `core/OrderExecutor.js` (fraction-only partial check)
- Behavior: Tiered exits exist in MPM, but unit mismatch + closePosition behavior collapses every multi-leg intent into one-shot full close
- Verified: YES (confirmed by 5+ independent traces)

### Trade targeting and lifecycle guards

**F6 — SELL path picks oldest BUY trade, ignores decision.tradeId**
- File: `core/OrderExecutor.js`
- Lines: 514-517 (filter all BUYs by action, sort by entryTime, take buyTrades[0])
- Behavior: With multiple positions, exit always closes oldest BUY regardless of which trade triggered the exit
- Verified: YES

**F7 — OrderExecutor double-deletes trade after closePosition**
- File: `core/OrderExecutor.js`
- Line: 905 (`stateManager.removeActiveTrade(buyTrade.orderId);`) — after StateManager already deleted at line 490
- Behavior: Silent no-op (trade already gone), but indicates ownership confusion. No partial-close guard.
- Verified: YES

**F8 — MaxProfitManager.reset() called unconditionally after every SELL**
- File: `core/OrderExecutor.js`
- Lines: 910-912 (`if (this.ctx.maxProfitManager) { this.ctx.maxProfitManager.reset(); }`)
- Behavior: Even if partial close worked, MPM tier state is destroyed after first exit. Multi-leg progression impossible past tier 1.
- Verified: YES

### Per-trade isolation

**F9 — MaxProfitManager is a singleton, not per-trade**
- File: `run-empire-v2.js` line 610 (`this.maxProfitManager = new MaxProfitManager();`)
- File: `core/MaxProfitManager.js` lines 277-302 (single `this.state` object)
- Behavior: Bot supports maxPositions > 1, but only one MPM instance with one state object. Concurrent trades share state.
- Verified: YES (3 independent traces confirm)

### Journal and learning

**F10 — TradeJournalBridge type check never matches actual payload**
- File: `core/TradeJournalBridge.js` line 132 (`if (exitRecord && exitRecord.type === 'exit') { ... }`)
- File: `core/OrderExecutor.js` line 795 (`type: completeTradeResult.action || 'BUY',`)
- Behavior: Bridge expects `type === 'exit'`, OrderExecutor sends `type: 'SELL'` (or 'COVER'). Bridge condition never fires. Journal records entries but never records exits. openTrades grows forever.
- Verified: YES (2 traces confirm exact mismatch, Mercury verified payload)

**F11 — Short COVER path does not mirror long SELL learning/journal flow**
- File: `core/OrderExecutor.js` lines 677-900 (long SELL: pattern outcomes, TRAI outcomes, logTrade)
- File: `core/OrderExecutor.js` lines 929-1089 (short COVER: missing the equivalent learning/journal blocks)
- Behavior: Short trades produce no learning data, no journal entries, no TRAI outcome recording. Half the strategy outcomes are invisible to learning.
- Verified: YES (GPT-product trace, Mercury confirmed at cited lines)

**F12 — Dual pattern memory systems both active**
- File: `core/OrderExecutor.js` line 731 (`getUnifiedPatternMemory().recordOutcome(...)`)
- File: `core/OrderExecutor.js` line 860 (`this.ctx.trai.recordTradeOutcome(...)` → eventually PatternMemoryBank)
- Behavior: Both UnifiedPatternMemory and PatternMemoryBank record outcomes on close. Different hashing algorithms. Same trade creates two separate learning entries. UnifiedPatternMemory header claims it replaces PatternMemorySystem but PatternMemoryBank still active.
- Verified: YES

**F13 — UnifiedPatternMemory call passes pnlPercent: pnl (same value, two field names)**
- File: `core/OrderExecutor.js` line 731 (`{pnl: pnl, pnlPercent: pnl}`)
- Behavior: Same dollar value passed for two semantically different fields. pnlPercent should be a percentage.
- Verified: YES

### Broker safety (BLOCKS APEX LIVE — Set E, executed standalone)

**F14 — Alpaca quantity sent as USD value instead of share count**
- File: `core/OrderExecutor.js` lines 131-140 (`amount: positionSize` where positionSize is USD)
- File: `core/OrderRouter.js` lines 123-141 (forwards amount to adapter)
- File: `brokers/AlpacaAdapter.js` lines 166-204 (`qty: qty.toString()` — uses amount as share quantity)
- Behavior: For Alpaca equities, sends USD dollar value as share count. $500 of TSLA at $400/share would send `qty: 500` = $200,000 trade instead of $500.
- Verified: YES
- **CRITICAL: Live-trading killer. Cannot ship to Apex live without fixing.**

### Cleanup and accuracy

**F15 — closePosition deletes from activeTrades before atomic updateState succeeds**
- File: `core/StateManager.js` lines 487-503 (delete) → lines 552-559 (updateState)
- Behavior: If updateState fails, trade is already removed from map. No rollback possible.
- Verified: YES

**F16 — MaxProfitManager.start uses positionSize, StateManager opens with adjustedPositionSize**
- File: `core/OrderExecutor.js` lines 302-309 (MPM.start with positionSize)
- File: `core/OrderExecutor.js` lines 247-286 (openPosition with adjustedPositionSize after sizingMultiplier)
- Behavior: When sizingMultiplier ≠ 1, MPM tracks wrong size from the start. All tier exit % calculations wrong.
- Verified: YES

**F17 — TradeJournalBridge double-multiplies USD by price**
- File: `core/TradeJournalBridge.js` lines 91-93 (`usdValue: (lastTrade.size || 0) * (lastTrade.entryPrice || price)`)
- File: `core/StateManager.js` lines 353-354 (lastTrade.size already in USD)
- Behavior: usdValue = USD × $/share = USD² inflated values. Journal data mathematically meaningless.
- Verified: YES

**F18 — StateManager.validateState contradicts short positions and totalBalance model**
- File: `core/StateManager.js` lines 391-392 (short open uses negative positionDelta)
- File: `core/StateManager.js` lines 618-619 (validation flags negative position as issue)
- File: `core/StateManager.js` lines 603-607 (validator expects totalBalance ≈ balance + inPosition)
- Behavior: Validation logic contradicts actual short-position model. totalBalance never updated by open/close.
- Verified: YES

**F19 — Backtest forced close calls closePosition without required tradeId**
- File: backtest end-of-run close call (location: BacktestRunner / forced close path)
- Behavior: StateManager requires tradeId. Backtest end-close passes only `{reason: ...}`. Close fails silently at backtest termination.
- Verified: YES (2 traces confirm)

---

## 2) Atomic implementation sets

Findings grouped by interdependency. Files within a set must land together.

### Set A — Partial close core mechanics

**Findings:** F1, F2, F3, F4, F5
**Files:** core/MaxProfitManager.js, core/OrderExecutor.js, core/StateManager.js, core/dto/DecisionLedgerSchema.js
**Why atomic:** Unit semantics, partial-close detection, size handling, and trade lifecycle all interlock. Fixing one without the others produces worse behavior than the bug itself.

**Approach:**
- MaxProfitManager continues to emit `exitSize` as absolute USD (legacy compat) AND adds `exitFraction` as fraction-of-remaining
- OrderExecutor partial-close detection uses `exitFraction` if present, else converts `exitSize` to fraction by dividing by remainingSize
- StateManager.closePosition signature gains explicit `reducePosition(tradeId, fraction, price, context)` that owns per-trade accounting
- closePosition path becomes full-close-only; reducePosition handles partials
- Trade deletion happens only when `remainingSize === 0` (or ≤ epsilon)
- DecisionLedgerSchema exits[] entries become typed (include exitSize, exitFraction, remainingSize)

### Set B — Trade targeting and lifecycle guards

**Findings:** F6, F7, F8
**Files:** core/OrderExecutor.js
**Why atomic:** All three live in OrderExecutor SELL/COVER paths and affect which trade closes and how its state survives.

**Approach:**
- SELL path resolves trade by `decision.tradeId` first; falls back to oldest-BUY only if tradeId not provided
- removeActiveTrade call at line 905 guarded by `remainingSize === 0`
- maxProfitManager.reset() guarded by full-close (remainingSize === 0)

### Set C — Journal and learning consolidation

**Findings:** F10, F11, F12, F13
**Files:** core/TradeJournalBridge.js, core/OrderExecutor.js (short COVER path), pattern memory consolidation TBD
**Why atomic:** All four affect what data flows into learning systems. Mismatched payloads + dual systems + missing short path produce inconsistent training data.

**Approach:**
- TradeJournalBridge type check accepts `exitRecord.type === 'SELL' || exitRecord.type === 'COVER' || exitRecord.type === 'exit'` (defensive) or OrderExecutor logTrade payload sets `type: 'exit'` explicitly (preferred)
- Short COVER path mirrors long SELL learning/journal blocks (pattern outcomes, TRAI, logTrade)
- Pattern memory: PatternMemoryBank vs UnifiedPatternMemory consolidation strategy decided in implementation (one wins, other deprecated)
- UnifiedPatternMemory call: pnlPercent computed from pnl / entrySize, not aliased to pnl

### Set D — Per-trade MaxProfitManager isolation

**Findings:** F9
**Files:** run-empire-v2.js, core/MaxProfitManager.js, core/OrderExecutor.js (start/update/reset call sites)
**Why atomic with itself:** Single architectural decision, but touches multiple files.

**Approach:**
- Decision deferred to implementation review: either Map<tradeId, MaxProfitManager> instance OR refactor to stateless with explicit per-call (tradeId, state) context
- Acceptance criteria identical either way: concurrent trades cannot share mutable MPM state

### Set E — Broker safety (STANDALONE, after brain bug)

**Findings:** F14
**Files:** core/OrderExecutor.js, core/OrderRouter.js, brokers/AlpacaAdapter.js
**Why standalone:** Different blast radius, different testing requirements (live broker simulation), no overlap with brain bug code paths. Executed immediately after brain bug fix completes.

**Approach:**
- For Alpaca equities, OrderExecutor converts USD positionSize to share quantity via `qty = positionSize / price` before passing to adapter
- AlpacaAdapter.buy/sell methods accept `qty` semantically (no change there)
- For crypto adapters that historically used USD, preserve existing behavior via adapter type detection
- Add explicit unit annotation in IBrokerAdapter interface: `placeOrder({ symbol, side, qty, ... })` where qty is instrument units (shares for equities, base asset for crypto)

### Set F — Cleanup and accuracy

**Findings:** F15, F16, F17, F18, F19
**Files:** core/StateManager.js, core/OrderExecutor.js, core/TradeJournalBridge.js, core/BacktestRunner.js (or wherever forced close lives)
**Why batch:** Independent fixes, lower interdependency, can land piecemeal but grouped for cleanup PR.

**Approach:**
- closePosition delete-after-update ordering reversed
- MaxProfitManager.start uses adjustedPositionSize
- TradeJournalBridge usdValue uses lastTrade.size directly (already USD)
- validateState skips negative-position check for short positions (or rebuilds totalBalance invariant honestly)
- Backtest forced close passes tradeId explicitly

---

## 3) Acceptance criteria

A set is accepted only when ALL of the following pass:

**Per-set criteria:**
- All findings in the set verified as fixed (file:line evidence)
- Smoke test passes (backtest runs to completion without crash)
- No regression on TSLA RSI+EMA baseline (~$970 profit on 2-year 15m, walk-forward validated)

**Set A specific:**
- Multi-leg trade in JSONL: `trade.decisionLedger.exits[].length > 1`
- Sum of leg netPnlDollars ≈ outcome.netPnlDollars (within tolerance)
- activeTrades retains parent trade until final leg
- Single TRAI + single UnifiedPatternMemory outcome per parent tradeId
- Legacy single-close trades unchanged in behavior

**Set B specific:**
- With 2+ active trades, SELL closes the trade matching decision.tradeId
- removeActiveTrade not called on partials
- MaxProfitManager state preserved across partials, reset only on full close

**Set C specific:**
- TradeJournal records exits (openTrades shrinks back to 0 after trades complete)
- Short COVER trades produce learning entries
- One pattern memory entry per parent trade (not two)

**Set D specific:**
- 2+ concurrent trades each have isolated MPM tier tracking
- Closing trade A does not affect trade B's MPM state

**Set E specific:**
- Alpaca equity order with $500 positionSize on $400 stock sends qty=1 (or whatever fractional) not qty=500
- Adapter unit semantics documented in IBrokerAdapter interface

**Set F specific:**
- closePosition rolls back trade deletion if updateState fails
- MPM tracks adjustedPositionSize from start
- TradeJournal usdValue mathematically correct
- validateState passes for both long and short positions
- Backtest end-of-run close completes successfully with tradeId

---

## 4) E2E integration test

**Test name:** `partial_close_lifecycle_e2e`
**Location:** Add to backtest harness or dedicated test runner

**Scenario:**
```
1. Open trade T1: BUY 1000 @ entry=100
2. Open trade T2: BUY 500 @ entry=100 (concurrent, tests Set D isolation)
3. Tier 1 exit on T1: 30% partial @ 105
4. Tier 2 exit on T1: 30% partial @ 110  
5. Tier 1 exit on T2: 30% partial @ 105
6. Trailing stop full close on T1 @ 108 (remaining ~40%)
7. Final exit on T2 @ 102 (remaining)
```

**Assertions:**
- T1 has 3 exits in decisionLedger, T2 has 2 exits
- T1 outcome.netPnlDollars equals sum of its 3 leg netPnlDollars
- T2 outcome.netPnlDollars equals sum of its 2 leg netPnlDollars
- activeTrades empty at end
- TradeJournal records 2 completed trades (not 5 leg events)
- UnifiedPatternMemory has exactly 2 outcome entries (one per parent)
- T1's MPM state never affected T2's tier tracking

---

## 5) Execution order

1. **Set A** (partial close core) — fire first, smoke test, verify acceptance criteria
2. **Set B** (trade targeting + guards) — depends on Set A landing cleanly
3. **Set C** (journal + learning) — depends on Set A+B for correct lifecycle data
4. **Set D** (MPM per-trade isolation) — can go in parallel with B/C, or after, architectural review needed
5. **Set F** (cleanup) — batched after Sets A-D, lower priority
6. **E2E test** — runs after Sets A-D, validates full pipeline
7. **Backtest reconciliation** — TSLA RSI+EMA baseline, expect P&L different from current $9,717.65 baseline (likely higher because winners no longer truncated at tier 1)
8. **STANDALONE: Set E** (Alpaca quantity) — fires immediately after brain bug fix completes
9. **Then:** Full pipeline audit in sections (post brain-bug, separate workstream)

---

## 6) Out of scope for this mission

The following items came up in cold-trace polling but are NOT part of brain bug fix scope:

- Mercury cognition pipeline tuning (separate workstream)
- ExitContractManager and MaxProfitManager dual exit-system coordination (architectural decision deferred)
- BacktestRecorder fee model accuracy vs live (deferred to post-Apex)
- TradeReplayCapture overwrites per orderId (note for future, low priority for current eval)
- value_usd USD² in proof logger (cosmetic, defer)
- StateManager lock reentrance under high concurrency (medium severity, defer pending live observation)
- TRAI fire-and-forget cross-trade attribution race (defer pending live observation)
- ExitContractManager BTC/USD unit comments (cosmetic, defer)

These get addressed in the post-brain-bug pipeline audit phase.

---

## 7) References

- Mission 0 spec: `ogz-meta/specs/brain-bug-mission-0-integration-spec.md` (Codex, 2026-04-14)
- Cold traces: `ogz-meta/audits/cold-traces/` (7 files, GPT/Cursor/Codex/Grok-outlier)
- Mercury cross-verification: `ogz-meta/ledger/codex-verification-2026-04-14.md` and most recent Mercury verification output
- Decision ledger schema: `core/dto/DecisionLedgerSchema.js`
- Verified against commit: 718165c
