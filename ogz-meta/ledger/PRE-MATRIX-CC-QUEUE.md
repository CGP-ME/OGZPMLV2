# PRE-MATRIX CC WORK QUEUE
**Created:** 2026-04-16
**Purpose:** Items to hand to Claude Code (CC) before pulling down the repo and running matrix backtests.
**Discipline:** One change per session. TSLA RSI+EMA baseline after each. Number matches or revert.

---

## STATUS LEGEND

- 🔴 **SPEC READY** — CC spec written this session, hand over verbatim
- 🟡 **DECISION NEEDED** — Trey must decide before spec can be finalized
- 🟢 **OPTIONAL** — Can skip pre-matrix if time-pressed

---

## 🔴 ITEM 1 — Ledger Scale Bug Fix

**Severity:** HIGH
**Confirmed by:** Claude audit + Mercury re-verification (both independently)
**Size:** 2 character changes, 2 lines
**Risk:** Near zero — ledger-only fix, no execution path change

### The Bug

`TradingLoop.js:293` and `:312` divide 0-1 confidence values by 100, producing 0.005-0.009 instead of 0.50-0.90.

Root cause: `allResults` from orchestrator carries raw 0-1 values. The `/100` assumes 0-100 input but gets 0-1 input.

### Impact

- `strategySignals[].baseConfidence` in ledger: 100x too small
- `orchestratorDecision.competingStrategies[].adjustedConfidence` in ledger: 100x too small
- Winner's `finalConfidence` at line 306: CORRECT (division matches the prior `*100`)
- Every post-matrix bucket analysis on losing/competing strategies would be nonsense

### The Fix

**EDIT 1** — `core/TradingLoop.js` line 293

old_str:
```
          baseConfidence: (s.confidence || 0) / 100,
```

new_str:
```
          baseConfidence: (s.confidence || 0),
```

**EDIT 2** — `core/TradingLoop.js` line 312

old_str:
```
            adjustedConfidence: (r.confidence || 0) / 100,
```

new_str:
```
            adjustedConfidence: (r.confidence || 0),
```

### Verification

1. Show diff
2. Run TSLA RSI baseline — number MUST match previous baseline exactly (this fix changes ledger write only, not trade behavior)
3. Inspect one ledger entry: strategySignals[].baseConfidence values should be 0.30–1.40 range, not 0.003–0.014

### Commit Message

```
fix(ledger): remove incorrect /100 division on confidence values

- TradingLoop.js:293, :312 were dividing 0-1 values by 100
- Confirmed by parallel audit (Claude + Mercury)
- strategySignals[].baseConfidence and competingStrategies[].adjustedConfidence
  were being written at 1/100th actual value
- Winner finalConfidence (line 306) was correct and unchanged
- Zero behavioral change; ledger-only fix
```

---

## 🔴 ITEM 2 — MPM Tier Exit Fraction + Market Multiplier Extraction

**Severity:** MATRIX BLOCKER
**Confirmed by:** Trace to execution sites at MaxProfitManager.js:589-592, :598-600, :605-608
**Size:** ~40 lines across 2 files
**Risk:** Low — zero behavioral change, pure extraction of hardcoded live values

### The Values Being Extracted

7 values currently hardcoded in MPM constructor that the matrix cannot sweep:

| File:Line | Variable | Current Value |
|---|---|---|
| MPM:106 | `firstTierExit` | 0.30 |
| MPM:108 | `secondTierExit` | 0.30 |
| MPM:110 | `thirdTierExit` | 0.20 |
| MPM:154 | `trendingMarketMultiplier` | 1.3 |
| MPM:155 | `rangeboundMarketMultiplier` | 0.8 |
| MPM:605 | high confidence threshold | 0.8 |
| MPM:606 | high confidence multiplier | 1.2 |
| MPM:607 | low confidence threshold | 0.6 |
| MPM:608 | low confidence multiplier | 0.8 |

### The Spec

Full spec already written in session. Hand over verbatim:

#### EDIT 1 — Add `tieredExit` block to TradingConfig.exitLogic

`core/TradingConfig.js` — locate the `beScaleOut` block inside `exitLogic`. Add the new `tieredExit` block immediately after it.

old_str:
```
    // ─── Break-Even Scale-Out (PATCH 1: the 50% sell at BE) ───
    beScaleOut: {
      enabled: envBool('BE_SCALEOUT_ENABLED', true),
      triggerType: env('BE_SCALEOUT_TRIGGER', 'one_to_one_r'),  // 'one_to_one_r' | 'fixed_percent'
      fixedPercentTrigger: parseFloat(env('BE_SCALEOUT_TRIGGER_PCT', 0.5)),  // if triggerType=fixed_percent, fire at 0.5%
      scaleOutFraction: parseFloat(env('BE_SCALEOUT_FRACTION', 0.5)),  // sell 50% by default
      feeBufferPercent: parseFloat(env('BE_SCALEOUT_FEE_BUFFER', 0.05)),  // -0.05% below entry for fees
    },
```

new_str:
```
    // ─── Break-Even Scale-Out (PATCH 1: the 50% sell at BE) ───
    beScaleOut: {
      enabled: envBool('BE_SCALEOUT_ENABLED', true),
      triggerType: env('BE_SCALEOUT_TRIGGER', 'one_to_one_r'),  // 'one_to_one_r' | 'fixed_percent'
      fixedPercentTrigger: parseFloat(env('BE_SCALEOUT_TRIGGER_PCT', 0.5)),  // if triggerType=fixed_percent, fire at 0.5%
      scaleOutFraction: parseFloat(env('BE_SCALEOUT_FRACTION', 0.5)),  // sell 50% by default
      feeBufferPercent: parseFloat(env('BE_SCALEOUT_FEE_BUFFER', 0.05)),  // -0.05% below entry for fees
    },

    // ─── Tiered Exit Scale-Out (MPM multi-tier profit taking) ───
    // Lifted from MaxProfitManager constructor hardcodes 2026-04-16
    // All values env-backed for matrix sweep tuning
    tieredExit: {
      // Fraction of original position to sell at each tier
      tier1ExitFraction: parseFloat(env('TIER1_EXIT_FRACTION', 0.30)),
      tier2ExitFraction: parseFloat(env('TIER2_EXIT_FRACTION', 0.30)),
      tier3ExitFraction: parseFloat(env('TIER3_EXIT_FRACTION', 0.20)),
      // Tier 4 (final) fraction is computed: 1.0 - (tier1 + tier2 + tier3) = 0.20 default

      // Market regime target multipliers (applied when enableMarketAdaptation=true)
      trendingTargetMultiplier: parseFloat(env('TIER_TREND_MULT', 1.3)),
      rangingTargetMultiplier: parseFloat(env('TIER_RANGE_MULT', 0.8)),

      // Confidence-based target adjustment
      highConfidenceThreshold: parseFloat(env('TIER_HIGH_CONF_THRESHOLD', 0.8)),
      highConfidenceMultiplier: parseFloat(env('TIER_HIGH_CONF_MULT', 1.2)),
      lowConfidenceThreshold: parseFloat(env('TIER_LOW_CONF_THRESHOLD', 0.6)),
      lowConfidenceMultiplier: parseFloat(env('TIER_LOW_CONF_MULT', 0.8)),
    },
```

#### EDIT 2 — Replace tier exit hardcodes in MPM

`core/MaxProfitManager.js`

old_str:
```
      enableTieredExit: true,         // Enable multi-tier profit taking
      // FIX 2026-03-17: Read from TradingConfig for backtester env var support
      firstTierTarget: TradingConfig.get('exits.profitTiers.tier1') || 0.007,
      firstTierExit: 0.30,            // Exit 30% to lock in profit
      secondTierTarget: TradingConfig.get('exits.profitTiers.tier2') || 0.010,
      secondTierExit: 0.30,           // Exit another 30%
      thirdTierTarget: TradingConfig.get('exits.profitTiers.tier3') || 0.015,
      thirdTierExit: 0.20,            // Exit 20%
      finalTarget: TradingConfig.get('exits.profitTiers.final') || 0.025,
```

new_str:
```
      enableTieredExit: true,         // Enable multi-tier profit taking
      // FIX 2026-03-17: Read from TradingConfig for backtester env var support
      // FIX 2026-04-16: Tier exit fractions extracted to exitLogic.tieredExit
      firstTierTarget: TradingConfig.get('exits.profitTiers.tier1') || 0.007,
      firstTierExit: TradingConfig.get('exitLogic.tieredExit.tier1ExitFraction', 0.30),
      secondTierTarget: TradingConfig.get('exits.profitTiers.tier2') || 0.010,
      secondTierExit: TradingConfig.get('exitLogic.tieredExit.tier2ExitFraction', 0.30),
      thirdTierTarget: TradingConfig.get('exits.profitTiers.tier3') || 0.015,
      thirdTierExit: TradingConfig.get('exitLogic.tieredExit.tier3ExitFraction', 0.20),
      finalTarget: TradingConfig.get('exits.profitTiers.final') || 0.025,
```

#### EDIT 3 — Replace market multipliers in MPM

`core/MaxProfitManager.js`

old_str:
```
      enableMarketAdaptation: true,         // Adapt to market conditions
      trendingMarketMultiplier: 1.3,        // 30% larger targets in trending markets
      rangeboundMarketMultiplier: 0.8,      // 20% smaller targets in range-bound
```

new_str:
```
      enableMarketAdaptation: true,         // Adapt to market conditions
      // FIX 2026-04-16: Market multipliers extracted to exitLogic.tieredExit
      trendingMarketMultiplier: TradingConfig.get('exitLogic.tieredExit.trendingTargetMultiplier', 1.3),
      rangeboundMarketMultiplier: TradingConfig.get('exitLogic.tieredExit.rangingTargetMultiplier', 0.8),
```

#### EDIT 4 — Replace confidence thresholds in setupProfitTiers

`core/MaxProfitManager.js` — inside `setupProfitTiers` method

old_str:
```
    // Adjust targets based on confidence
    let confidenceMultiplier = 1.0;
    if (confidence > 0.8) {
      confidenceMultiplier = 1.2; // 20% higher targets for high confidence
    } else if (confidence < 0.6) {
      confidenceMultiplier = 0.8; // 20% lower targets for low confidence
    }
```

new_str:
```
    // Adjust targets based on confidence
    // FIX 2026-04-16: Thresholds + multipliers extracted to exitLogic.tieredExit
    const highConfThreshold = TradingConfig.get('exitLogic.tieredExit.highConfidenceThreshold', 0.8);
    const highConfMult = TradingConfig.get('exitLogic.tieredExit.highConfidenceMultiplier', 1.2);
    const lowConfThreshold = TradingConfig.get('exitLogic.tieredExit.lowConfidenceThreshold', 0.6);
    const lowConfMult = TradingConfig.get('exitLogic.tieredExit.lowConfidenceMultiplier', 0.8);
    let confidenceMultiplier = 1.0;
    if (confidence > highConfThreshold) {
      confidenceMultiplier = highConfMult;
    } else if (confidence < lowConfThreshold) {
      confidenceMultiplier = lowConfMult;
    }
```

### Verification

1. Show diff: `git diff core/TradingConfig.js core/MaxProfitManager.js`
2. Confirm no live hardcoded tier fractions remain:
   ```
   grep -nE "firstTierExit:\s*0\.|secondTierExit:\s*0\.|thirdTierExit:\s*0\." core/MaxProfitManager.js
   ```
   Expected: zero matches (fallbacks inside `TradingConfig.get(..., 0.30)` are acceptable)
3. Run TSLA RSI+EMA baseline — **number MUST match previous baseline** (pure extraction, zero behavioral change)

### Commit Message

```
refactor(MPM): extract tier exit fractions + market multipliers to TradingConfig

- Tier scale-out fractions (30/30/20/20) now in exitLogic.tieredExit
- Market regime multipliers (trending 1.3x, ranging 0.8x) now in exitLogic.tieredExit
- Confidence thresholds (0.8/0.6) and multipliers (1.2/0.8) now in exitLogic.tieredExit
- All values env-backed for matrix sweep tuning
- Zero behavioral change: defaults preserved exactly
- Completes MPM hardcode extraction started 2026-03-17
```

---

## 🟡 ITEM 3 — Regime Boost Behavior Decision

**Severity:** HIGH
**Confirmed by:** Claude audit + Mercury re-verification
**Status:** DECISION REQUIRED — no code until Trey picks

### The Finding

`StrategyOrchestrator.js:772` and `:821` do `result.confidence *= boost` (mutative). This means regime boosts and VP boosts affect winner selection AND gate filtering. Docstring at TradingConfig.js:100-102 claims otherwise ("losers still fire, just sized smaller").

Reproduced: EMA raw 0.55 × trending boost 1.15 = 0.6325. RSI raw 0.60 (no boost) = 0.60. Winner becomes EMA (was RSI). Gate comparison at 0.60 threshold filters on post-boost value.

### Decision Required

- **Option 1** — Update docstring only. Accept current behavior. **Size: 3 lines of comments.**
- **Option 2** — Refactor. Pull per-strategy boosts out of confidence mutation. Apply downstream as sizing-only. **Size: ~40-60 lines of refactor across StrategyOrchestrator.**

### Why It Matters For Matrix

Whichever option is chosen affects how matrix results are interpreted. `MIN_TRADE_CONFIDENCE=0.60` means different things under each option:
- Option 1: threshold applies to signal × regime × VP (post-boost)
- Option 2: threshold applies to raw signal quality only

Decide BEFORE matrix runs so interpretation is clean.

### Claude's Recommendation

Option 2 — cleaner signal/context separation. But it's a real refactor. Option 1 is defensible if time-constrained.

### If Option 1 chosen

Simple docstring update. Spec:

old_str:
```
  // FIX 2026-04-05: Multipliers applied after confidence sort
  // Trend strategies boosted in trending markets, suppressed in ranging
  // Losers still fire, just sized smaller. Winners get sized bigger.
  regimeBoosts: {
```

new_str:
```
  // FIX 2026-04-05: Multipliers applied during confidence evaluation
  // Trend strategies boosted in trending markets, suppressed in ranging
  // IMPORTANT 2026-04-16: Multipliers MUTATE result.confidence in-place
  // (StrategyOrchestrator.js:772). This affects winner selection AND
  // the MIN_TRADE_CONFIDENCE gate — not only position sizing.
  // A strategy whose raw confidence is below threshold can pass the gate
  // after regime boost. A raw-higher strategy can lose winner selection
  // to a raw-lower strategy with more favorable regime boost.
  regimeBoosts: {
```

### If Option 2 chosen

Spec needed — not written yet. Would require:
- Separating per-strategy boost values from `_positionSizeMultiplier`
- Storing per-strategy boost on each result WITHOUT mutating confidence
- Passing boost as `sizingMultiplier` component to OrderExecutor
- Keeping sort/winner selection/gate filtering on raw confidence

Estimated 1-2 focused sessions of work + baseline verification.

---

## 🟢 ITEM 4 — Multi-Position Gate Removal (OPTIONAL PRE-MATRIX)

**Severity:** DESIGN REQUIREMENT (Trey stated since day one)
**Status:** Spec written this session, decision to ship pre-matrix pending
**Size:** ~35 lines deletion + 1 config default change

### Two Sequencing Choices

**Option A — Ship pre-matrix.** Matrix 1 measures multi-position behavior. Baseline shifts dramatically from current single-position baseline.

**Option B — Ship post-matrix (as Matrix 3).** Matrix 1 runs single-position. Matrix 2 adds HTF confirmation. Matrix 3 adds multi-position. Each change isolated for measurement.

**Methodology cleanness says Option B.** Trey's statement "this needs to happen eventually" suggests Option B is acceptable.

### If Trey decides Option A — Spec

See session transcript for full spec. Summary:

- `core/TradingLoop.js` — remove same-direction block (lines 206-210, 220-221), remove flip logic (lines 214-241), keep max_positions check (lines 242-243)
- `core/TradingConfig.js` — raise `MAX_POSITIONS` default from 3 to 10

### Risks

- TSLA baseline will NOT match previous baseline (intentional — bot behavior fundamentally changes)
- Verify no orphaned activeTrades at end of backtest
- Verify no "position=0 but close attempted" errors
- Portfolio-aware sizing is still independent-per-position (9% gross exposure possible if 3 longs @ 2% + 2 shorts @ 1.5%). Not fixed in this change.

---

## 🟢 ITEM 5 — Matrix Sweep Enhancements

**Severity:** MATRIX QUALITY
**Status:** Spec drafted earlier in session
**Size:** ~30 lines in tools/matrix-sweep.js

### Changes

1. **SL granularity** — expand `full.stopLoss` from `[0.5, 0.8, 1.0, 1.5, 2.0, 3.0]` (6 values) to `[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.75, 3.0]` (10 values)

2. **LOCKED_EXITS update** — change `0.8 → 0.75` for RSI, MADynamicSR, MarketRegime, MultiTimeframe, OGZTPO, CandlePattern

3. **Add `tierLabel` column to CSV output** — preset name (tight/default/wide/ultra-wide) for post-matrix filtering

4. **Add `MAX_POSITIONS` to worker env vars** — Trey's decision pending on value (1 for clean isolation vs 3 for production realism; if Item 4 ships pre-matrix, set to 10)

### Matrix Size After SL Expansion

Current: 4 presets × 6 SL × 8 confidence = 192/strategy
New: 4 presets × 10 SL × 8 confidence = 320/strategy

For 3-strategy sweep: ~960 configs total. For 5-strategy: ~1600. Wall time ~57 min on 7800X3D @ 14 workers.

### File

`tools/matrix-sweep.js` (canonical, 657 lines) — NOT `ogz-meta/ledger/matrix-sweep.js` (stale duplicate)

---

## ORDERING RECOMMENDATION

CC should apply in this order, baseline verify after each:

1. **Item 1** (Ledger scale fix) — 5 min, TSLA baseline must match exactly
2. **Item 2** (MPM extraction) — 20 min, TSLA baseline must match exactly
3. **Item 3** (Regime boost) — depends on Trey's Option 1 vs Option 2 choice
   - Option 1: 3-line docstring, 2 min, baseline unchanged
   - Option 2: 1-2 sessions of refactor, baseline will shift — requires separate validation
4. **Item 4 (if Option A)** — 10 min, baseline will shift (expected)
5. **Item 5** (Matrix sweep tooling) — 15 min, doesn't affect trading code

If Option 2 on Item 3 is chosen, recommend splitting into its own session (big change, needs careful review).

If Option A on Item 4 is chosen, recommend it goes LAST before matrix runs so all other changes are validated on single-position baseline before multi-position shifts the numbers.

---

## WHAT TREY NEEDS TO DECIDE

Before handing to CC:

1. **Item 3** — Option 1 (docstring update) or Option 2 (refactor)?
2. **Item 4** — Ship pre-matrix (Option A) or defer to post-matrix (Option B)?
3. **Item 5 MAX_POSITIONS** — 1, 3, or 10 for matrix workers?

Once those three decisions are made, the queue is ready to go.

---

**End of pre-matrix queue.**
