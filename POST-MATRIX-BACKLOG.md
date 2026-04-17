# POST-MATRIX BACKLOG
**Created:** 2026-04-16
**Source:** Confidence/confluence audit session + architectural review
**Purpose:** Items deferred to post-matrix/post-Apex. Do NOT touch these pre-matrix.

---

## Guiding Rule

**Matrix is the gate to Apex. Apex is the gate to Houston.**
Pre-matrix changes are limited to audit-confirmed bug fixes and values that must be sweepable. Everything below waits.

---

## HIGH PRIORITY — Architectural Decisions Needed

### 1. Regime/VP Boost Behavior — Decision Required

**The finding (confirmed by Claude + Mercury independently):**
`StrategyOrchestrator.js:772` mutates `result.confidence *= boost` in-place, then re-sorts at line 776. This means regime boosts and VP boosts BOTH affect winner selection AND gate filtering — not just position sizing.

**The docstring claims otherwise** (TradingConfig.js:100-102):
> "Multipliers applied after confidence sort. Losers still fire, just sized smaller. Winners get sized bigger."

Reality: multipliers ARE the sort. Losers don't necessarily fire. Winner can change based on boost.

**Decision required, two options:**

- **Option 1:** Update docstring to match reality. Accept that boosts affect selection+gate. Simple, no code change.
- **Option 2:** Refactor. Pull per-strategy boosts out of confidence mutation. Apply downstream as sizing-only channel. Confidence becomes pure signal quality, boosts become pure context weighting. ~40-60 lines of refactor.

**Claude's recommendation:** Option 2 for cleaner signal/context separation. But this is an architectural call, Trey decides.

**Impact on matrix:** Whichever option is chosen affects how `MIN_TRADE_CONFIDENCE` sweep results should be interpreted. Decision should be made before matrix results are analyzed, ideally before matrix runs.

---

### 2. Multi-Position, Multi-Direction Trading

**Standing requirement (stated by Trey since day one):**
> "The bot should be able to open multiple positions at any given time in any direction."

**Current blockers in code (TradingLoop.js):**
- Line 206-210, 220-221: Same-direction entry block (cannot stack longs or shorts)
- Line 214-241: Opposite-direction flip (forces close instead of hedge)
- Line 242-243: MAX_POSITIONS hard cap (default 3)

**Infrastructure already ready (built in earlier sessions):**
- StateManager.js:446 supports hedged positions (FIX 2026-03-29)
- Per-trade MaxProfitManager (Set A commit 50eff2a)
- Per-trade exit contracts
- Per-trade tradeId routing (backtest-critical commit cb04261)

**Work required:**
- Remove Gate 1 (same-direction block) — ~5 lines deletion
- Remove Gate 2 (flip logic) — ~27 lines deletion
- Raise Gate 3 MAX_POSITIONS default from 3 to 10+
- Portfolio-aware position sizing (currently each position sizes independently; need to check aggregate exposure)
- Broker hedging config verification (Alpaca default accounts don't hedge natively)
- Decision ledger: currently one entry per candle, needs to support multi-strategy-entries per candle
- Dashboard rework: "position: long/short" becomes "positions: N long, M short, net exposure X%"

**Matrix sequencing implication:**
Matrix 1 runs without multi-position (isolates baseline). Matrix for multi-position would be Matrix 3 after HTF confirmation (Matrix 2) so each change is isolated variable.

**Trey's choice between speed-to-Apex and architectural completeness is pending.**

---

### 3. HTF (Higher Timeframe) Confirmation for Strategies

**The gap:**
Bot has MultiTimeframeAdapter with 6 active TFs (1m, 5m, 15m, 1h, 4h, 1d) fully populated with live candles + per-TF indicators. NO strategy currently reads HTF data before firing. Each strategy sees only its primary TF.

**What Trey's charts actually trade:**
HTF structure defines the level (1D support, 1D swing high). LTF provides the entry (4H retest, 15m trigger). Target external liquidity on HTF. Current bot approximates this via fib boosts and confluence but does not sequence HTF→LTF structurally.

**Post-Matrix 1 research phase:**
Trey to research HTF confirmation rules for different strategy types:
- Mean-reversion (RSI): HTF should be ranging or sideways, NOT trending against the trade
- Trend-following (EMA): HTF must be trending, same direction as LTF signal
- Breakout (ORB, liquidity sweep): HTF should be at or near the breakout level, not retracing deep
- Structural (MADynamicSR, sweep strategies): HTF level should confirm the LTF level

**Suggested first implementation (after research):**
Pick 1-2 strategies with strongest theoretical case for HTF confirmation. Candidates worth evaluating:
- **RSI:** HTF trend gate — only fire oversold longs when 1h trend is not bearish (and vice versa). High-volume strategy, most likely to show measurable improvement.
- **LiquiditySweep:** verify swept level is significant on HTF, not just LTF noise.

**Implementation form options (Trey decides after research):**
- **Option 1 (simplest):** HTF trend agreement gate. Binary.
- **Option 2:** HTF indicator confirmation (RSI not overbought on HTF, MACD agrees, etc).
- **Option 3 (most sophisticated):** HTF structural level confirmation. Closer to chart analysis.

**Sequencing:** Matrix 2 = Matrix 1 but with HTF confirmation on the chosen 1-2 strategies. Compare directly to isolate HTF effect.

---

## MEDIUM PRIORITY — Feature Work

### 4. Structural Trailing Stop — Restore Wiring

**The finding:**
`core/exit/DynamicTrailingStop.js` (244 lines) is a real, complete, structure-aware trailing stop module. WIDENS in trends, TIGHTENS near fib levels / S&R / round numbers, scales with ATR, ratchets, respects fee floors. Built March 17, 2026.

**Current state — ORPHANED:**
- Instantiated at `ExitContractManager.js:46`: `this.trailingStopChecker = new DynamicTrailingStop()`
- **Never called.** The invocation was deleted in "PATCH 2: TrailingStop removed — MaxProfitManager owns profit-side exits."
- MaxProfitManager took over trailing but ported only ~60% of the intelligence
- `MaxProfitManager.updateTrailingStop()` is missing: structure proximity tightening, round number tightening, continuous trend strength scaling via RSI distance from midpoint

**Additional blocker:**
`TradingLoop.js:182` has `nearestStructure: null // TODO: wire in structure levels later`. Even if DynamicTrailingStop was called, it would receive null for the structure field. The `fibLevels`/`nearestFibLevel` data IS computed (for confidence boost) but never passed into MPM exit context.

**Work required:**
1. Populate `nearestStructure` in exit context at TradingLoop.js:182 by feeding the existing `fibLevels`/`nearestFibLevel` data through
2. Either (A) restore `DynamicTrailingStop.check()` call in ExitContractManager.checkExitConditions() and gut MPM's trailing logic, or (B) port structural awareness into MPM.updateTrailingStop()

**Claude's recommendation:** Path B (port logic into MPM). Less risk to working Set A/per-trade-MPM infrastructure. Clean separation can be architectural cleanup later. DynamicTrailingStop.js stays on disk as reference.

---

### 5. Golden Pocket / SFP Structural Entry System

**What Trey actually wants to trade (per charts shared):**
- BOS (Break of Structure) or CHoCH (Change of Character) detection
- Valid SFP (Swing Failure Pattern) / sweep-and-reclaim at HTF support/resistance
- Retrace to 0.618–0.65 golden pocket of the reclaim impulse
- Bullish/bearish divergence confirmation on oscillator
- Current position in "discount" zone (lower half of range for longs)
- Entry at golden pocket retest
- Stop structurally below the level that formed the golden pocket
- Target external liquidity (prior HTF swing high for longs)

**Current bot capabilities (partial/missing):**
- ✅ Golden ratio defined correctly (FibonacciDetector: 0.618, 0.65)
- ✅ `isGoldenZone` flag computed every candle
- ✅ +0.05 extra confidence boost at golden vs regular fib (via fibBoostGolden)
- ❌ No BOS detection
- ❌ No CHoCH detection
- ❌ No multi-candle sweep-and-reclaim sequencing (LiquiditySweepDetector is single-candle pattern based)
- ❌ No displacement requirement before retrace
- ❌ No oscillator divergence detection (price LL + indicator HL)
- ❌ No discount/premium range bisection concept
- ❌ No external liquidity targeting (TP is exit contract %, not dynamic HTF swing)
- ❌ `FibonacciDetector.getSuggestion()` has trend-aware fib logic (0.8 conf at golden in uptrend, 0.7 in downtrend) but is ORPHANED — TradingLoop.js:441 calls `getNearestLevel()` instead
- ❌ No regime gating on fib boost (applies in ranging markets when it shouldn't)

**Build scope:**
New strategy module: `modules/SFPGoldenPocketEntry.js` or similar. 300-500+ lines. Would register alongside existing 10 strategies in orchestrator. Multi-candle state machine.

Or: upgrade existing LiquiditySweep + MADynamicSR to full structural setup detectors.

**Preliminary quick-wins before full build (Path B from session):**
1. Wire `getSuggestion()` instead of `getNearestLevel()` at TradingLoop.js:441 — gets trend-aware fib suggestions. 5 lines.
2. Add regime gate on golden pocket boost in 4 fib-using strategies — if regime is 'ranging', skip golden pocket boost. Matches Trey's rule "NEVER USE when ranging." ~20 lines.

Quick-wins could land post-matrix as incremental improvements before full structural module.

---

### 6. Fibonacci Boost — Expand to All Indicator Strategies (Option B)

**Decision already made in session:** Option B — per-strategy fib config, all indicator-based strategies get fib boost.

**Current state:**
Only 4 of 10 active strategies apply fib boost: EMASMACrossover, MADynamicSR, LiquiditySweep, SmartMoneySweep.

**Missing (indicator-only strategies):**
- RSI — no fib boost (RSI oversold at 0.618 is textbook setup)
- CandlePattern — no fib boost (candle pattern AT fib is textbook setup)
- MarketRegime — no fib boost
- MultiTimeframe — no fib boost

**Correctly excluded (strategies with own structural analysis):**
- OGZTPO — uses TPO zones
- OpeningRangeBreakout — uses FVG levels
- BreakRetest — disabled

**SMS hardcoded values bug (MEDIUM finding from audit):**
`StrategyOrchestrator.js:602-603` uses literal `0.5`, `0.15`, `0.10` for fib distance/boost. Other strategies read from config (`this.fibDistanceSweep`, `this.fibBoostNormal`, `this.fibBoostGolden`). SMS ignores config tuning. Rolls into this work item.

**Option B.1 (chosen methodology):** All strategies start with identical defaults. Matrix discovers what each actually wants.

**Config pattern:** 8 strategies × 3 knobs (distance, boost_normal, boost_golden) = 24 config values.
Example: `fibDistanceRSI`, `fibBoostRSI_normal`, `fibBoostRSI_golden` etc.

**Scope:** ~80-120 lines across StrategyOrchestrator + TradingConfig. 1 focused session.

**Why post-matrix:** Matrix 1 measures baseline with current 4-strategy fib implementation. Expansion becomes part of a later matrix pass to isolate effect.

---

### 7. Decision Ledger Ledger-Bucketed Confidence Analyzer

**The missing instrumentation (from session Q&A):**
Matrix gives one row per config combination (flat metrics). What's invisible: the distribution of confidence values WITHIN each config — trade count, win rate, expectancy per confidence bucket.

**Three possible patterns the analyzer would reveal:**
- **Pattern A:** Flat response curve — confidence is noise above the gate. Threshold is all that matters.
- **Pattern B:** Monotonic response curve — win rate climbs with confidence. Confidence is real quality signal.
- **Pattern C:** Peak-then-decline — high-confidence signals are overfit/mean-revert. You'd actively cap confidence.

**Cannot be determined from matrix output today. Only from bucketed analysis of decision ledger.**

**Build (Level 1 from session):**
Standalone tool: `tools/confidence-bucket-analyzer.js`
- Reads `logs/decisions/trade_*.jsonl` files (date range filter optional)
- Configurable bucket boundaries (default: 0.10 steps from 0.30 to 1.40)
- Primary grouping: by confidence bucket
- Secondary grouping (flag): by winner strategy + confidence bucket
- Outputs: trade count, win rate, avg win $, avg loss $, expectancy, profit factor per bucket
- CSV output to `reports/confidence-distribution-{timestamp}.csv`
- Markdown table output to stdout

**Critical note:** Analyzer MUST use `orchestratorDecision.finalConfidence` (correctly scaled). MUST avoid `strategySignals[].baseConfidence` and `competingStrategies[].adjustedConfidence` which have the 100x scale bug until ledger scale fix ships.

**Scope:** 2-3 hours of standalone tool work. Zero risk (read-only).

**When to run:** Post-matrix on matrix-generated ledger files. Results directly inform what to change for matrix 2.

**Why it's valuable for Apex specifically:** If distribution is Pattern B, raising the gate improves expectancy and shrinks drawdown. Direct path to Apex-ready configuration.

---

## LOW PRIORITY — Technical Debt / Hygiene

### 8. MPM Dead Constructor Values Cleanup

**Context:** The March extraction pulled `exitLogic` config into TradingConfig (trail, beScaleOut, profitFloor, reversalDetection, safety). MPM loads `this.trailConfig` and `this.beScaleOutConfig` at constructor lines 225-226. The actual exit logic reads from these runtime-loaded configs.

**The legacy values in `this.config = {...}` constructor block that are NO LONGER READ:**
- `minProfit: 0.003` (line 119)
- `trailDistance: 0.002` (line 120)
- `tightTrailThreshold: 0.01` (line 121)
- `tightTrailDistance: 0.001` (line 122)
- `breakevenThreshold: 0.002` (line 123)
- `timeAdjustmentIntervals` (lines 135-140) — entire array
- `lowVolatilityThreshold: 0.005` (line 146)
- `highVolatilityThreshold: 0.02` (line 147)
- `volatilityLookbackPeriods: 20` (line 148)

These are dead — the real config lives in TradingConfig.exitLogic.*. But they confuse future readers (including Claude in a later session) who will think they're live.

**Work:** Strip the dead values from MPM constructor. Add comment pointing to TradingConfig.exitLogic.* as the real source. ~30 lines of deletion.

**Why it's low priority:** Doesn't affect execution. Purely documentation/clarity improvement.

---

### 9. Confidence Clamp on Passthrough Strategies (MEDIUM finding from audit)

**The finding:**
Three strategies trust upstream modules without validation:
- CandlePattern (StrategyOrchestrator.js:383): `conf: best.confidence || 0` — passthrough
- MultiTimeframe (line 477): `confidence: confluence.score || 0` — passthrough
- OpeningRangeBreakout (line 558): `signal.confidence` — passthrough

**Risk:** If any upstream module ever returns confidence >1.0 (due to a bug), it would silently pass through. With the regime/VP boost multiplication on top, you could end up with confidence values well above the ~1.38 current ceiling.

**Fix:** Add defensive `Math.min(1.0, ...)` clamp on all three passthrough points.

**Scope:** 3 lines.

**Why post-matrix:** Upstream modules don't currently produce >1.0. This is hardening, not bug fix.

---

### 10. Regime Boost Ceiling / Confidence Clamp at Orchestrator Level

**Related to item 1 above.** If Option 1 is chosen (keep current boost behavior, update docstring), a separate improvement is worth considering: cap the post-boost confidence at 1.0 so the matrix `MIN_TRADE_CONFIDENCE` sweep values (max 0.75) actually bind.

Currently ceiling is 1.38. Threshold of 0.75 is trivially beatable. A 1.0 clamp after boost mutation would restore meaningful threshold scanning.

**Scope:** 2 lines added after line 776 and line 825. Applies `result.confidence = Math.min(1.0, result.confidence)` to each.

**Caveat:** If Option 2 is chosen instead (refactor boosts out of confidence), this item is moot — boosts wouldn't be affecting confidence in the first place.

---

## RESEARCH ITEMS (Not Code Work)

### 11. HTF Confirmation Methodology Research

**Trey to research during Matrix 1 runtime or during downtime:**

Questions to answer per strategy type:
- What's the HTF rule for RSI mean-reversion trades?
- What's the HTF rule for EMA-crossover trend trades?
- What's the HTF rule for breakout trades (ORB, LiquiditySweep)?
- What's the HTF rule for structural trades (MADynamicSR, SFP)?

Recommended grounding:
- ICT / Smart Money Concepts (aligns with Trey's existing framework)
- Al Brooks price action material (more trend-focused, less cultish)

Avoid:
- YouTube "secret confluence" content
- Reddit forum anecdotal arguments
- Holy grail HTF system books

**Output of research should be:** For each of the 10 strategies, a specific rule that can be encoded as a simple check. Example for RSI: "only fire long if 1h trend direction is NOT bearish."

---

### 12. Multi-Timeframe Architecture Decision

**Question to resolve post-Apex:**
Should the bot move from "single primary TF with optional HTF check" to "full multi-TF structural analysis engine"?

Options:
- **Incremental:** Keep primary TF execution, add HTF confirmation filters (Item 3). Lower complexity.
- **Full rebuild:** Multi-TF structural analysis as first-class citizen. Strategies consume HTF structure directly. High complexity. 6-10 focused sessions. Would enable Item 5 (SFP Golden Pocket Entry) as a natural feature.

Decision factors:
- How much has the incremental approach improved Matrix 2 numbers over Matrix 1?
- Is Apex funding available to support the longer timeline?
- Is the V2 bot a better financial path than iterating the current one?

---

## HANDLING THESE POST-MATRIX

**The discipline that has worked this session:**
- One change per session to execution path
- TSLA RSI+EMA baseline backtest after every change
- Number must match or revert immediately
- No batching features

**Suggested post-matrix ordering:**

1. Run confidence-bucket analyzer on Matrix 1 ledger (Item 7) — research first, no code
2. HTF research (Item 11) — no code
3. Decide Option 1 vs Option 2 for regime boost (Item 1)
4. Restore structural trailing stop (Item 4)
5. Expand fib boost to all indicator strategies (Item 6)
6. Implement HTF confirmation on chosen 1-2 strategies (Item 3)
7. Run Matrix 2 — isolate HTF effect
8. If multi-position decision is yes: implement (Item 2), run Matrix 3 — isolate multi-position effect
9. Post-Apex: structural SFP entry module (Item 5)
10. Hygiene cleanup as time permits (Items 8, 9, 10)

**Critical rule (restating):** Each numbered item is one commit. TSLA baseline after each. Numbers match or revert.

---

## WHAT'S NOT IN THIS DOC (intentionally)

Pre-matrix work items — those are tracked separately as "ship before matrix runs":
- Ledger scale bug fix (TradingLoop.js:293, :312)
- MPM tier exit fraction extraction (5 hardcoded values)
- Matrix sweep SL granularity enhancement
- CSV tierLabel column
- Whatever regime boost decision (Option 1 or 2)
- Multi-position gate decision (if deciding to land pre-matrix)

Those are the matrix-blocker items. This doc is exclusively post-matrix.

---

**End of backlog.**
