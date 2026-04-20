# OGZPrime Strategy Validation Methodology

**Author:** Trey Buhidar (The Architect)
**Status:** Canonical methodology document. Describes historical linear methodology AND upgraded tournament methodology. SUPERSEDED REGRESSION ANCHOR: the prior $970.71 RSI+EMA combined-run reference is RETIRED per MASTER-ROLLOUT DEC-001. Each strategy ships solo with its own walk-forward-validated contract. No combined reference number exists.
**Last updated:** 2026-04-07

---

## Why this document exists

OGZPrime has two methodologies for strategy validation: one that has been used historically and produced real validated configurations, and one that has been designed but not yet implemented. Both are documented here so future sessions know exactly what was done, what is planned, and how to get from one to the other.

The historical methodology is the source of truth for how every currently-locked configuration in `core/TradingConfig.js` was produced. It is pragmatic, linear, and proven.

The upgraded methodology is more rigorous, more automated, and designed to scale across many strategies and instruments simultaneously. It is the target state once the per-strategy × per-timeframe × per-ticker matrix becomes the product.

Until the upgraded methodology is implemented, the historical methodology is the methodology. Don't skip steps. Don't invent shortcuts. Don't trust a configuration that hasn't passed it.

---

# PART 1 — The Historical Methodology (proven, in use today)

This is the methodology that HISTORICALLY produced a combined RSI+EMASMACrossover snapshot (prior anchor `$970.71`, now RETIRED per DEC-001) and the 7-of-8 multi-ticker validation result. It is linear, manual, and currently the only methodology that has been actually executed end-to-end. Future strategy validation uses this methodology per-strategy solo, not combined.

## Phase H1 — Strip the strategy

Every strategy module is reduced to its core job: detect setups and return `direction + confidence`. Internal filters, confirmation stacks, regime checks, ATR gates, pattern requirements — all of it gets removed from the strategy module.

The platform handles filtering at the orchestrator and execution layer. The strategy is a black box that does ONE thing.

**Why:** Stacked internal filters were the cause of "broken" strategies producing zero or near-zero trades. EMASMACrossover went from 2 trades in 2 years to 1,344 trades after stripping. MADynamicSR went from 48 trades to 1,012. LiquiditySweep went from 0 trades to 343. Every "broken" strategy was actually buried under 5-7 layers of internal gates that the platform should have been doing.

**How to know it's done:** Strategy generates hundreds or thousands of trades on a 2-year dataset. If it's still firing under 100 trades on TSLA 15m 2y data, it's still got internal filters that need stripping.

## Phase H2 — Solo exit sweep

Run the stripped strategy in isolation through an exit parameter sweep. Test multiple stop loss × take profit combinations. Identify the optimal exit configuration.

**Sweep dimensions:**
- Stop loss: 0.5%, 0.8%, 1.0%, 1.5%, 2.0%, 3.0%
- Take profit: 1.0%, 1.5%, 2.0%, 2.5%, 3.0%, 4.0%

That produces ~25 configurations per strategy.

**Tool:** `node tools/parallel-backtest.js --solo=<StrategyName> --exits --stocks --data=<dataset>`

**Output:** A leaderboard showing P&L per exit configuration. The pattern that emerged historically: tight take profits (1.0%) on TSLA 15m are dramatically more profitable than wide ones, regardless of stop loss width. Anything past TP 2.0% tends to bleed.

**How to know it's done:** Clear winner emerges. Top 3 configurations identified.

## Phase H3 — Walk-forward validation on year-2 holdout

Take the winning exit configuration from Phase H2 and run it on a held-out dataset the strategy has never seen during the sweep. Historically this was `tuning/tsla-15m-year2.json` — the second year of TSLA 15m data, never used in tuning.

**Tool:** `node tools/parallel-backtest.js --solo=<StrategyName> --data=tuning/tsla-15m-year2.json --stocks` with the locked exits from Phase H2.

**Pass criterion:** Test-set P&L is positive AND within the same order of magnitude as the training P&L. A configuration that produces +$700 on training and +$50 on test is overfit. A configuration that produces +$700 on training and +$300 on test is real.

**Historical results:**

| Strategy | Train P&L | Test P&L | Status |
|---|---|---|---|
| RSI | +$334 | +$282 | Validated |
| EMASMACrossover | +$738 | +$275 | Validated |
| MADynamicSR | +$724 | +$429 | Validated |
| LiquiditySweep | +$221 | +$72 | Validated (uses structural exits) |

**How to know it's done:** Strategy passes walk-forward. Configuration is provisional-validated, ready for locking.

## Phase H4 — Lock the exits in TradingConfig

This is the step that gets missed most often. Validated exits get hardcoded into `core/TradingConfig.js` `exitContracts` block as locked values that override env vars:

```javascript
exitContracts: {
  RSI: {
    stopLossPercent: -0.8,    // LOCKED 2026-03-20
    takeProfitPercent: 1.0,   // LOCKED 2026-03-20
    // ...
  },
  EMASMACrossover: {
    stopLossPercent: -0.5,    // LOCKED 2026-03-20
    takeProfitPercent: 1.0,   // LOCKED 2026-03-20
    // ...
  },
  MADynamicSR: {
    stopLossPercent: -0.8,    // LOCKED 2026-03-20
    takeProfitPercent: 1.0,   // LOCKED 2026-03-20
    // ...
  },
  LiquiditySweep: {
    useStructuralExits: true, // LOCKED — uses internal state machine
    stopLossPercent: -2.0,    // fallback only
    takeProfitPercent: 2.5,   // fallback only
  },
}
```

**Why locking matters:** `STOP_LOSS_PERCENT` and `TAKE_PROFIT_PERCENT` env vars are GLOBAL. They apply to every strategy uniformly when set. Locking per-strategy exits in TradingConfig ensures that when strategies are combined, each one uses ITS OWN validated exit configuration regardless of what env vars get passed in. Without locking, the combined run uses one global SL/TP for all strategies, and the validated edges collapse.

**How to verify it's done:** `grep -A 5 "RSI:\|EMASMACrossover:" core/TradingConfig.js` shows the locked values inside the exitContracts block.

## Phase H5 — Stepwise combination testing

Take the locked individual configurations and combine them stepwise. Don't blind-stack. Add one strategy at a time and measure the interaction effect.

**Order:**
1. Start with the two strongest solo strategies (historically: RSI + EMASMACrossover)
2. Add the third (RSI + EMA + MASR)
3. Add the fourth (RSI + EMA + MASR + LiqSweep)
4. Test combinations that exclude weaker strategies (RSI + EMA + LiqSweep, skipping MASR)

**Tool:** `node tools/parallel-backtest.js --solo=RSI,EMASMACrossover --data=tsla --stocks` (no `--exits` flag — each strategy uses its locked TradingConfig exits)

**Historical results:**

| Stack | P&L | Trades |
|---|---|---|
| RSI + EMA (HISTORICAL, retired per DEC-001) | $970 | 1,416 |
| RSI + EMA + MASR | $656 | 1,525 |
| RSI + EMA + MASR + LiqSweep | $696 | 1,550 |
| RSI + EMA + LiqSweep | $956 | 1,440 |

**Critical insight:** Individually profitable strategies do NOT automatically combine into a better stack. MASR was profitable solo (+$724) but HURT the RSI+EMA combo by $314 when added because its signals competed with the stronger RSI/EMA signals. The orchestrator's signal-selection logic works best when fewer strategies compete for the same candles.

The production combo for TSLA 15m became RSI + EMASMACrossover. MASR ships as optional, available for different tickers or timeframes where it doesn't interfere.

## Phase H6 — Multi-ticker generalization

Take the winning combo with NO retuning and run it across multiple tickers. This is the proof step. If the edge is real, it generalizes. If it's overfit to TSLA, it collapses on other instruments.

**Tool:** `node tools/parallel-backtest.js --solo=RSI,EMASMACrossover --data=tuning/<ticker>-15m-2y.json --stocks` for each ticker in the watchlist.

**Historical results (TSLA-tuned config, zero retuning):**

| Ticker | P&L | Trades | WR | Status |
|---|---|---|---|---|
| TSLA (HISTORICAL combined RSI+EMA snapshot, no longer the production config) | +$970 | 1,416 | 47.5% | ✅ |
| NVDA | +$722 | 1,380 | 45.0% | ✅ |
| RIOT | +$557 | 2,656 | 42.2% | ✅ |
| QQQ | +$374 | 1,007 | 45.4% | ✅ |
| MARA | +$297 | 2,099 | 42.8% | ✅ |
| SPY | +$28 | 1,014 | 41.6% | ✅ (barely) |
| COIN | -$58 | 2,255 | 42.0% | needs own tuning |

7 of 8 tickers profitable. That is the validation that proves the edge exists in the strategy mix, not in coincidental fit to TSLA's price action.

**How to know it's done:** ≥75% of watchlist tickers profitable with the locked config and zero retuning. Failures get flagged for per-ticker tuning, not used as evidence the methodology is broken.

## Phase H7 — Status today

The historical methodology produced these validated results that should still be in `core/TradingConfig.js`:

- RSI exits: locked at SL -0.8% / TP 1.0% / MIN_TRADE_CONFIDENCE 0.60
- EMASMACrossover exits: locked at SL -0.5% / TP 1.0%
- MADynamicSR exits: locked at SL -0.8% / TP 1.0%
- LiquiditySweep: uses structural exits (overrideLevels true)

There is NO current combined-strategies regression anchor. Per DEC-001 each strategy is tested in isolation and ships with its own validated exit contract. The prior $970.71 / 1416 trades / 47.5% WR number was a combined RSI+EMA snapshot that cannot be reproduced under current orchestrator selection semantics (single winner per candle, not blended). Current reference baselines live at `ogz-meta/specs/baseline-phase0-*.md` per-run.

If the next session can reproduce this number with the current framework, the historical methodology is fully intact and the system is ready to build upward. If not, something has regressed since the historical work and bisection is required to find the cause.

---

# PART 2 — The Upgraded Methodology (designed, not yet implemented)

Tonight's session designed an upgraded methodology that addresses the limitations of the historical approach. The historical methodology works, but it has weaknesses:

1. It validates against ONE held-out dataset, not multiple. A single walk-forward test is not statistically robust against time-dependent overfitting.
2. It uses a single train/test split rather than rolling walk-forward windows, which means the validation period is the same one used for every strategy and configurations are implicitly tuned against it over time.
3. It does not sweep confidence thresholds or timeframes per strategy. Exits are tuned but entry conditions are left at defaults.
4. It is fully manual. Every step requires Trey running commands and reading leaderboards. There is no automated pipeline that runs end-to-end.
5. It has no concept of confidence intervals on the validated configurations, so the PID controller's bounded autonomy envelope has nothing to read.

The upgraded methodology addresses all five weaknesses while preserving the proven core of the historical approach.

## Phase U1 — Strip the strategy (unchanged)

Identical to Phase H1. Every strategy module is reduced to its core job. Internal filters live at the orchestrator level, not inside the strategy.

## Phase U2 — Per-strategy parameter sweep (full grid)

Each strategy is tested in isolation across three sweep dimensions, full Cartesian grid:

**Sweep dimension 1: Confidence threshold**
- Values: 0.30, 0.40, 0.50, 0.60, 0.70
- Historical finding: 0.50 was the sweetspot almost universally — needs to be re-verified per strategy

**Sweep dimension 2: Timeframe**
- Values: 1m, 5m, 15m, 1h, 4h
- Different strategies have different optimal timeframes — RSI may perform best on 15m while EMA crossover may prefer 1h

**Sweep dimension 3: Stop loss × Take profit**
- SL: 0.5%, 0.8%, 1.0%, 1.5%, 2.0%
- TP: 1.0%, 1.5%, 2.0%, 2.5%, 3.0%

**Total per strategy:** 5 × 5 × 5 × 5 = 625 configurations. Across 9 active strategies = 5,625 backtests for Phase U2 alone.

**Why full grid instead of hierarchical:** The optimal confidence at 1m timeframe might differ from the optimal confidence at 1h. A hierarchical sweep (confidence first, then timeframe at locked confidence) would miss those interactions. Full grid catches every combination.

**Compute requirement:** Approximately 4-6 hours on the planned Vultr bare metal server (4 cores / 8 threads parallel). Not feasible on the current single-worker VPS in a single session.

## Phase U3 — Top-N selection with auto walk-forward

After each strategy's full grid sweep completes, the tool automatically:

1. Selects the top 10 configurations by P&L
2. Runs each top-10 configuration against TWO held-out datasets (different time periods, same instrument)
3. Calculates a generalization ratio per configuration: `test_pnl / train_pnl`
4. Eliminates configurations with generalization ratio below 0.50 as overfit
5. Outputs the top 3 surviving configurations with mean P&L, variance, and confidence intervals

**Confidence intervals are critical** because they become the operating envelope for the PID controller in Phase 2 of the autonomous architecture. A configuration that produces "tier1 = 1.0% ± 0.2% based on walk-forward variance" gives the PID a bounded range to operate within at runtime. Hardcoded clamps go away.

## Phase U4 — Pair combinations from validated survivors

Validated solo survivors from Phase U3 are combined two at a time. If survivors are strategies A, B, C, and D:

- AB, AC, AD, BC, BD, CD = 6 pair combinations

Each pair runs through the orchestrator with confluence-based sizing enabled. Goal: identify pairs with synergy (combined > sum of solos) versus pairs that cannibalize each other.

**Walk-forward gate:** Each winning pair must pass the same dual-holdout validation as Phase U3. Pairs that fail to generalize are eliminated.

## Phase U5 — Triple combinations from validated pairs

Validated pair survivors are combined three at a time. Walk-forward validation again. The historical lesson from Phase H5 still applies: more strategies is not automatically better. Some triples will perform worse than the best pairs because of signal interference.

## Phase U6 — Final out-of-sample validation

Before the locked Phase U5 winner is deployed to live trading, it gets one final validation pass on completely fresh data — typically a different time period than any used in U2-U5. Same instrument is acceptable, different time period is required, different timeframe is preferred.

## Phase U7 — Lock and ship

The final validated configuration gets locked into `TradingConfig.exitContracts` AND its variance bounds get written to a new `pid.envelopes` block:

```javascript
pid: {
  envelopes: {
    RSI: {
      tier1: { center: 0.010, min: 0.008, max: 0.012 },  // from walk-forward variance
      // ...
    },
    // ...
  },
}
```

The PID controller reads these envelopes at runtime as its hard clamp ranges. The system never operates outside the validated envelope.

## Phase U8 — Multi-ticker generalization (unchanged from H6)

Identical to Phase H6 in the historical methodology. Locked configuration runs across the watchlist with zero retuning. ≥75% profitability is the bar.

---

# PART 3 — Required tooling upgrades to implement Part 2

The upgraded methodology requires `tools/parallel-backtest.js` to gain capabilities it does not currently have. None of these are hard to build, but they need to be built before Part 2 can run end-to-end.

## 1. Phase-aware sweep modes

```bash
node tools/parallel-backtest.js --phase=U2 --strategy=RSI --data=tsla
node tools/parallel-backtest.js --phase=U4 --pair=RSI,EMASMACrossover --data=tsla
node tools/parallel-backtest.js --phase=U5 --triple=RSI,EMASMACrossover,MADynamicSR --data=tsla
node tools/parallel-backtest.js --phase=U6 --config=<locked-manifest> --data=tsla
```

## 2. Full Cartesian grid sweep generator

Currently the tool runs predefined SWEEP_PRESETS. The phase-aware modes need to generate full Cartesian grids on the fly from sweep dimension definitions.

## 3. Top-N selection with auto walk-forward

After each phase, automatically identify top N configurations, run them against held-out datasets, calculate generalization ratios, output validated survivors.

## 4. Phase progression manifest files

Each phase outputs a manifest (JSON or YAML) listing validated survivors, their configurations, train/test P&L, generalization ratios, and confidence intervals. Next phase reads previous phase's manifest as input.

Example structure:

```json
{
  "phase": "U3",
  "strategy": "RSI",
  "training_dataset": "tuning/tsla-15m-train.json",
  "validation_datasets": ["tuning/tsla-15m-val1.json", "tuning/tsla-15m-val2.json"],
  "validated_at": "2026-04-15T22:00:00Z",
  "survivors": [
    {
      "rank": 1,
      "confidence": 0.50,
      "timeframe": "15m",
      "stopLoss": -0.8,
      "takeProfit": 1.0,
      "train_pnl": 471.23,
      "val1_pnl": 412.88,
      "val2_pnl": 388.22,
      "generalization_ratio": 0.851,
      "confidence_interval_95": [350.10, 450.30]
    }
  ]
}
```

## 5. PID envelope output

Phase U7 writes validated confidence intervals to a new `pid.envelopes` block in TradingConfig. The PID controller reads these as its hard clamp ranges instead of using hardcoded values in its constructor.

## 6. End-to-end tournament runner

A single command that chains all phases together:

```bash
node tools/tournament.js \
  --strategies=RSI,EMASMACrossover,MADynamicSR,SmartMoneySweep \
  --data=tsla \
  --validation-data=tsla-15m-val1.json,tsla-15m-val2.json
```

The tournament runner executes Phase U2 for each strategy, gates survivors through walk-forward, runs Phase U4 on pairs of survivors, gates again, runs Phase U5 on triples, runs Phase U6 final validation, and outputs the final locked configuration manifest. End-to-end automation.

---

# PART 4 — Migration path from historical to upgraded

The historical methodology is in use today. The upgraded methodology is the target. Here is how to get from one to the other without breaking anything:

## Step 1: Reproduce the historical baseline first

Before changing anything, the next session must reproduce the most-recent baseline recorded at `ogz-meta/specs/baseline-phase0-*.md` with the current framework. This confirms the locked TradingConfig values are still intact and the framework is honest end-to-end. If reproduction fails, bisect to find the regression before doing anything else.

NOTE (2026-04-20): The prior gate of "reproduce $970.71" is RETIRED per DEC-001 — the $970.71 figure was a combined RSI+EMA snapshot that is not reproducible under current orchestrator winner-selection semantics.

## Step 2: Build the tooling upgrades on a side branch

The 6 tooling upgrades in Part 3 should be built on a feature branch, not on `tradingloop-clean-rewrite`. Each upgrade gets its own commit and gets unit-tested against synthetic data before being trusted with real backtests.

## Step 3: Run Phase U2 on RSI alone as the proof case

Once the tooling can run a full grid sweep with auto walk-forward, run it on RSI first. Compare the result to the historical RSI configuration (SL -0.8% / TP 1.0% / conf 0.60). The upgraded methodology should either confirm the historical config or surface a meaningfully better one. If it surfaces a worse config, the upgraded tooling has a bug.

## Step 4: Run Phase U2 on every active strategy

Once RSI validates the upgraded pipeline, run U2 on EMASMACrossover, MADynamicSR, LiquiditySweep, SmartMoneySweep, and any other active strategy. This produces validated solo survivors per strategy.

## Step 5: Run Phases U4, U5, U6 to produce a fully validated production config

Phase U4 generates pair combinations from all validated solo survivors. Phase U5 generates triples from validated pairs. Phase U6 final-validates the winning combination on completely fresh data. Output: a locked TradingConfig with validated exits AND validated PID envelopes.

## Step 6: Lock the new validated config and ship

Replace the historical hardcoded exits with the upgraded validated exits. Add the PID envelope block. Update BACKTESTING-GUIDE to reference the new methodology. Document the diff between historical and upgraded results in a session log.

## Step 7: Build the PID controller against the validated envelopes

The PID controller spec already exists. Build it. Wire its hard clamp ranges to read from `pid.envelopes` in TradingConfig. The system now has bounded autonomous tuning around a tournament-validated envelope. Phase 1 of the autonomous architecture is complete.

---

# PART 5 — Why this matters

Most algorithmic trading projects fail because they ship configurations that looked good on a single backtest. Curve fitting is the silent killer of retail algo systems. A bot that returns 25% on its training data and -8% on live data is the rule, not the exception.

OGZPrime's methodology directly addresses this failure mode at every step. The historical methodology validates against held-out data once and proves generalization across multiple instruments. The upgraded methodology validates at every phase, against multiple held-out datasets, with statistical confidence intervals on every locked parameter, then feeds those intervals into a bounded autonomous tuning layer that operates within validated limits at runtime.

This is the methodology that turns OGZPrime from "another algo bot" into a system that can defensibly be deployed across 20 Apex evaluation accounts simultaneously, white-glove licensed to fintech companies, and trusted to run autonomously under TRAI's brain layer.

The methodology is the moat. The historical version is in use. The upgraded version is designed. The path between them is documented above. Future sessions follow it without inventing shortcuts.

---

**End of methodology document.**
