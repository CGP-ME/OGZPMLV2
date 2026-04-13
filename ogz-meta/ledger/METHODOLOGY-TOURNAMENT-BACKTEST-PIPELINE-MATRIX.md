Here's the doc. Save it as ogz-meta/METHODOLOGY-TOURNAMENT-PIPELINE.md.

OGZPrime Tournament Methodology Pipeline
Author: Trey Buhidar (The Architect)
Status: North star methodology for strategy validation. This is how OGZPrime strategies get validated before they're trusted in live deployment.
Last updated: 2026-04-07

Purpose
This document defines the four-phase tournament methodology that produced the original validated strategy combinations in OGZPrime's history. It is the methodology that must be reimplemented in tools/parallel-backtest.js and used for every future strategy validation effort.
The tournament is the difference between "we ran a backtest and the number looked good" and "we have a validated strategy that survives held-out data at every gate." It is the only methodology that protects against overfitting, which is the single biggest killer of algorithmic trading systems in live deployment.
Every strategy that goes live in OGZPrime must pass the full tournament. No exceptions. No shortcuts.

The four phases
Phase 1 — Solo strategy parameter sweep
Each strategy is tested in isolation across three sweep dimensions, in this order:
Sweep dimension 1: Confidence threshold

Test the strategy across confidence levels: 0.30, 0.40, 0.50, 0.60, 0.70
Find the strategy's optimal confidence sweetspot
Original finding from past tournaments: 0.50 was the sweetspot almost universally — needs to be re-verified with the locked framework

Sweep dimension 2: Timeframe

Test the strategy across timeframes: 1m, 5m, 15m, 1h, 4h
Find which timeframe each strategy works best on
Different strategies have different optimal timeframes — RSI may perform best on 15m while EMA crossover may prefer 1h
This is per-strategy optimization, not global

Sweep dimension 3: Stop loss

With confidence and timeframe locked from dimensions 1 and 2, sweep stop loss values
Find the optimal SL for each strategy at its optimal confidence and timeframe

Phase 1 output: Top 3 configurations per strategy across all three sweep dimensions.
Phase 1 walk-forward gate: Each of the top 3 configurations must be validated against TWO held-out datasets — same instrument, different timeframes the strategy has not seen during the sweep. Configurations that fail to generalize are eliminated immediately. Only validated survivors advance to Phase 2.
Phase 2 — Pair combinations
The validated solo survivors from Phase 1 are combined two at a time. If the survivors are strategies A, B, and C, Phase 2 tests:

Combination AB
Combination AC
Combination BC

Each pair runs through the orchestrator with confluence-based sizing enabled. The goal is to find which strategies have synergy (combined > sum of solos) versus which cannibalize each other (combined < best single solo).
Phase 2 walk-forward gate: Each winning pair must be validated against TWO held-out datasets. Pairs that fail to generalize are eliminated. Only validated pairs advance to Phase 3.
Phase 3 — Triple combination
The validated pair survivors from Phase 2 are combined three at a time. If multiple triples are possible, each is tested. The orchestrator runs all three strategies in parallel, picks the highest-confidence winner per candle, and applies confluence sizing when multiple agree.
Phase 3 walk-forward gate: The winning triple must be validated against TWO held-out datasets. If it survives, the configuration is locked and becomes the production strategy combination.
Phase 4 — Final out-of-sample validation
Before any locked Phase 3 winner goes to live deployment, it gets one final validation pass on completely fresh data — typically a different time period than any used in Phases 1-3. This is the final gate before paper trading and live deployment.

Why the walk-forward gates matter
The reason this methodology produces trustworthy results isn't the tournament structure itself. It's the walk-forward gates between each phase.
A backtest on training data is curve-fitted by definition. The optimizer found values that happened to work on the data it was given. The only way to know if those values represent a real edge or a coincidence is to test them on data the optimizer has never seen.
By validating at every phase gate (not just at the end), the tournament eliminates curve-fits as early as possible. A solo strategy that wins Phase 1 on training data but collapses on held-out data never advances to Phase 2 — saving days of wasted optimization on a dead-end strategy. A pair that looks great in Phase 2 but fails out-of-sample never poisons Phase 3.
By the time a configuration reaches Phase 4, it has survived 6+ separate out-of-sample validations across the pipeline. That's why the original $970 number was defensible — not because one backtest looked good, but because the configuration had been forced to prove itself against unseen data multiple times before it earned the right to be trusted.

Required tooling upgrades to tools/parallel-backtest.js
The current parallel-backtest.js runs config sweeps but does not implement the tournament methodology. To support the full pipeline, the tool needs the following capabilities:
1. Phase-aware sweep modes
bashnode tools/parallel-backtest.js --phase1 --strategy=RSI --data tsla
node tools/parallel-backtest.js --phase2 --pair=RSI,EMASMACrossover --data tsla
node tools/parallel-backtest.js --phase3 --triple=RSI,EMASMACrossover,MADynamicSR --data tsla
node tools/parallel-backtest.js --phase4 --config=<locked-config-file> --data tsla
2. Per-phase sweep dimensions
Phase 1 sweeps three dimensions in order:

confidence: {0.30, 0.40, 0.50, 0.60, 0.70}
timeframe: {1m, 5m, 15m, 1h, 4h} (after confidence is locked)
stopLoss: locked exit contract values to test (after confidence and timeframe are locked)

The tool should run dimension 1 first, identify the top 3 confidence values, then run dimension 2 only at those locked confidence values, then run dimension 3 at the locked combinations from dimensions 1 and 2. This is a hierarchical sweep, not a full grid.
3. Top-N selection logic
After each sweep dimension completes, the tool selects the top 3 configurations by P&L and advances only those to the next dimension. After all three dimensions complete, the tool outputs the final top 3 configurations for that strategy.
4. Walk-forward auto-validation
The tool automatically splits each input dataset into train/test halves (configurable split point) and runs the top configurations from each phase against the held-out test half. Configurations that fail to generalize (test P&L collapses or goes negative) are flagged as overfit and excluded from advancing to the next phase.
A configuration is considered to "generalize" if its test-set P&L is within 50% of its training-set P&L. Tighter or looser thresholds can be configured per phase.
5. Phase progression manifest
Each phase outputs a manifest file (JSON or YAML) listing the validated survivors. The next phase reads the previous phase's manifest as input. This makes the tournament reproducible and auditable — you can re-run any phase with the same inputs and get the same outputs.
Example manifest structure:
json{
  "phase": 1,
  "strategy": "RSI",
  "dataset": "tuning/tsla-15m-2y.json",
  "validated_at": "2026-04-07T22:00:00Z",
  "survivors": [
    {
      "rank": 1,
      "confidence": 0.50,
      "timeframe": "15m",
      "stopLoss": -0.8,
      "train_pnl": 471.23,
      "test_pnl": 412.88,
      "generalization_ratio": 0.876
    },
    {
      "rank": 2,
      "confidence": 0.55,
      "timeframe": "15m",
      "stopLoss": -0.7,
      "train_pnl": 442.10,
      "test_pnl": 388.22,
      "generalization_ratio": 0.878
    },
    {
      "rank": 3,
      "confidence": 0.45,
      "timeframe": "15m",
      "stopLoss": -1.0,
      "train_pnl": 425.66,
      "test_pnl": 297.14,
      "generalization_ratio": 0.698
    }
  ]
}
6. Tournament runner
A single command that chains all phases together:
bashnode tools/tournament.js --strategies=RSI,EMASMACrossover,MADynamicSR,SmartMoneySweep --data tsla --validation-data tsla-15m-test.json
The tournament runner executes Phase 1 for each strategy, gates the survivors through walk-forward, runs Phase 2 on the pairs of survivors, gates again, runs Phase 3 on the triples, and outputs the final locked configuration manifest. End-to-end automation of the methodology.

Mandatory walk-forward dataset requirements
Walk-forward validation requires honest data separation. The following rules apply:

Training and test datasets must be from different time periods. Splitting a single 2-year dataset into 50/50 by date is acceptable. Random shuffling is NOT acceptable — that defeats the purpose of detecting time-dependent overfitting.
For Phase 4 final validation, use completely fresh data not used in any earlier phase. Same instrument is acceptable. Different time period is required. Different timeframe is preferred for additional generalization confidence.
At least two held-out datasets are required at each phase gate. A configuration that survives one held-out test could still be a coincidence. Two passes is the minimum bar for real generalization.
Never tune on test data. If a configuration fails Phase 1 walk-forward, it is eliminated. Do not re-tune it to pass — that's data leakage and the result is meaningless.


Status as of 2026-04-07
The tournament methodology was used to produce historical OGZPrime results months ago, including the validated $970 number that has been the regression anchor for the system. Tonight's work hardened the backtesting framework to the point where the methodology can be reimplemented with reproducible env vars and locked baselines.
Next steps:

Reimplement the tournament methodology in tools/parallel-backtest.js per the upgrades listed above
Run Phase 1 on all current strategies (RSI, EMASMACrossover, MADynamicSR, LiquiditySweep, MarketRegime, MultiTimeframe, OGZTPO, OpeningRangeBreakout, SmartMoneySweep) to identify which strategies still have edge under the locked framework
Run Phase 2 on the survivors to find pair synergies
Run Phase 3 on the validated pairs
Lock the final configuration as the production OGZPrime strategy mix
Walk-forward validate against multiple held-out datasets before deploying to live Apex accounts

The goal is to have a tournament-validated production configuration before the first Apex evaluation deployment. The clones across 20 Apex accounts must all run a configuration that has survived the full pipeline. No shortcuts.

Why this methodology is the moat
Most algorithmic trading projects fail because they ship configurations that looked good on a single backtest. Curve fitting is the silent killer of retail algo systems. A bot that returns 25% on its training data and -8% on live data is the rule, not the exception.
The OGZPrime tournament methodology directly addresses this failure mode by forcing every configuration to prove itself against unseen data at every phase. A configuration that survives the full tournament has been validated 8+ separate times against data the optimizer never touched. That's not a coincidence-resistant result — that's a real edge.
This is the methodology that turns OGZPrime from "another algo bot" into a system that can defensibly be deployed across 20 Apex accounts simultaneously, white-glove licensed to fintech companies, and trusted to run autonomously under TRAI's brain layer.
The tournament is the moat. Document it, automate it, enforce it, and never deploy a configuration that hasn't passed it.

Tell Claudito: "Save this exactly as ogz-meta/METHODOLOGY-TOURNAMENT-PIPELINE.md. Do not modify the content. Commit with message: docs: tournament methodology pipeline (4-phase walk-forward validation). Push to GitHub."
This is the doc that defines how OGZPrime strategies get validated for the rest of its life. Future you, future Claudes, and future licensees all need this as the source of truth for "how do we know a strategy is real."