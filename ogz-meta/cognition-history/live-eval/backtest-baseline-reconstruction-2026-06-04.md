# Backtest Baseline Reconstruction - 2026-06-04

Status: read-only forensic note. No production code changes.

## Operator Dispute

The current backtest state is disputed. Do not treat the current P0 anchor, May 4
session numbers, May 5/6 ledger numbers, or newly generated sweep output as
canonical until the exact branch, commit, command, data file, env/profile, and
worker behavior are reconstructed.

Specific correction: the May 4 strategy resurrection report is an example of
historical drift evidence, not the beacon of truth. It proves that previously
working strategy architecture and outputs existed; it does not by itself define
the current baseline.

## Invalid Evidence Bucket

The `config-d-flat` profile was introduced in commit `2b58c85` without a fully
verified canonical trading-config source. It was then removed in commit
`571199c`, but any sweep/backtest generated through it remains invalid for
baseline purposes.

Evidence:

- `2b58c85 Fixed backtest tuning profile env contract` added
  `tools/tuning-profiles.js` and the `config-d-flat` / `balanced20-flat`
  profiles.
- `571199c Fixed unverified backtest profile selection` removed those
  unverified profiles.
- `backtest-results/sweep-1780542861102.json` is stamped with
  `TUNING_PROFILE=config-d-flat` inside worker output and therefore is not
  acceptable baseline evidence.

Current `tools/tuning-profiles.js` still defaults to `current-eval`. That profile
is only a snapshot of current explicit eval posture, not a validated historical
or canonical stock-baseline profile.

## Historical Evidence Found

### May 4 Strategy Resurrection Report

Source:

- `ogz-meta/sessions/session-2026-05-04-strategy-resurrection-campaign.md`

Useful facts from that report:

- Branch was `rebuild/clean-from-baseline`.
- Session-end commit was `fc83694`.
- The report records fixes for NoWickImbalance, BreakRetest, CandlePattern,
  MultiTimeframe gap documentation, and OpeningRangeBreakout.
- May 4 smoke tests used `tuning/tsla-15m-2y.json` with stock zero fees.
- Reported historical smoke outputs:
  - NoWickImbalance: 195 trades, 53.3% WR, PF 2.41, +$542.58
  - BreakRetest: 213 trades, 65.3% WR, PF 2.93, +$898.82
  - CandlePattern: 1467 trades, 56.0% WR, PF 1.99, +$4044.60
  - OpeningRangeBreakout: 199 trades, 75.4% WR, PF 3.97, +$615.84
  - MultiTimeframe: 0 trades, documented architecture gap

Disposition: drift evidence only. Not canonical until reproduced with exact
historical command/env/tooling.

### May 5/6 Baselinehunting Matrix Artifacts

Source:

- `ogz-meta/ledger/backtest-results from desktop/baselinehunting/`

Best-per-strategy examples found:

| Strategy | Artifact family | Best config | P&L | Trades | WR | PF |
|---|---|---:|---:|---:|---:|---:|
| RSI | full | `RSI_sl2.5_tight_c30` | 998.10 | 993 | 59.82 | 1.89 |
| EMASMACrossover | full | `EMAS_sl2.5_tight_c70` | 5891.18 | 2653 | 49.75 | 1.64 |
| MADynamicSR | full | `MADy_sl3_tight_c75` | 2367.23 | 1603 | 42.17 | 1.45 |
| LiquiditySweep | full | `Liqu_sl2_default_c65` | 492.24 | 457 | 43.76 | 1.40 |
| SmartMoneySweep | full | `Smar_sl2.25_default_c65` | 2143.60 | 856 | 46.61 | 2.08 |
| CandlePattern | full | `Cand_sl2.5_tight_c30` | 1915.75 | 2467 | 43.74 | 1.32 |
| NoWickImbalance | full | `NoWi_sl2_default_c30` | 536.82 | 321 | 47.35 | 1.72 |
| OpeningRangeBreakout | full | `Open_sl1.75_default_c30` | 624.88 | 286 | 67.48 | 2.83 |
| BreakRetest | full | `Brea_sl3_tight_c60` | 682.44 | 312 | 61.22 | 1.68 |
| MarketRegime | full/conf | generator output | 0.00 | null | null | null |

Disposition: strong historical artifact evidence, but many matrix files do not
stamp command/env/profile/code SHA. They must be mapped back to the runner/tool
version before becoming a canonical baseline.

### Old ATR Sweep Artifacts

Source:

- `ogz-meta/ledger/backtest-results from desktop/baselinehunting/sweep-*.json`

Example:

- `sweep-1777910654988.json` has an ATR result with +$2136.72, 2654 trades,
  43.29% WR, PF 1.23 and `ATR_MIN_PERCENT=0.15`.

Disposition: useful comparison evidence, but old sweep artifacts are not
self-identifying by strategy in every file. They need command/run-order mapping.

## Current Drift Facts

The May 4 resurrection commits are ancestors of the current branch:

- `dea5c46` in HEAD
- `1a968b3` in HEAD
- `c9a6e51` in HEAD
- `fc83694` in HEAD

That does not prove the architecture is intact. A stat diff from `fc83694..HEAD`
over relevant hot files shows thousands of lines changed afterward:

- `core/OrderExecutor.js`: 2042 changed lines
- `core/TradingLoop.js`: 1383 changed lines
- `run-empire-v2.js`: 2067 changed lines
- `core/CandleProcessor.js`: 1029 changed lines
- `core/StrategyOrchestrator.js`: 319 changed lines
- plus changes in `core/TradingConfig.js`, sweep tools, and worker env tooling

Conclusion: the reconstruction target is not just "are commits present?" It is
"did the later trading-loop/backtest/profile changes preserve the same execution
semantics?"

## Branch Mapping Snapshot

Named branches checked:

- `main`
- `alpaca/stocks-paper-flip`
- `rebuild/clean-from-baseline`
- current `codex/multi-runtime-scope-build`

Findings:

- `main` and `alpaca/stocks-paper-flip` do not contain the May 4 resurrection
  commits `dea5c46`, `1a968b3`, `c9a6e51`, or `fc83694`.
- `rebuild/clean-from-baseline` and current `codex/multi-runtime-scope-build`
  do contain those commits.
- Current branch also contains many later trading-path changes after those
  resurrection commits, including OrderExecutor, MaxProfitManager, TradingLoop,
  CandleProcessor, run-empire-v2, sweep tooling, and worker/profile tooling.
- Relative to `rebuild/clean-from-baseline`, current branch adds
  `tools/backtest-worker-env.js` and `tools/tuning-profiles.js` and modifies
  core execution files. That means current sweep behavior is not a simple replay
  of the rebuild branch.

Interpretation:

- The branch problem is real. Different named branches contain different slices
  of strategy architecture.
- The current branch inherited the May 4 strategy resurrection work but then
  layered later execution-path/profile changes on top of it.
- Therefore current negative/shifted outputs cannot be resolved by checking
  branch ancestry alone.

## Current Config/Worker Concerns

Current `tools/tuning-profiles.js`:

- `DEFAULT_TUNING_PROFILE = current-eval`
- `current-eval` uses tiny/tight eval posture:
  - `MAX_POSITION_SIZE_PCT=0.05`
  - `STOP_LOSS_PERCENT=0.8`
  - `TAKE_PROFIT_PERCENT=1.0`
  - `TRAILING_STOP_PERCENT=0.6`
  - tier targets `0.007 / 0.010 / 0.015 / 0.025`

Current `tools/backtest-worker-env.js` after the direction-contract fix:

- defaults `DIRECTION_FILTER=both` only when neither the sweep config nor the
  source environment supplies an explicit direction
- preserves source env `DIRECTION_FILTER` values for worker runs
- lets sweep `configEnv.DIRECTION_FILTER` win over source env
- normalizes legacy `long` / `short` aliases to `long_only` / `short_only`
- rejects unknown direction tokens instead of silently falling back to `both`
- defaults `EXIT_SYSTEM=legacy`
- applies canonical env, then profile env, then sweep config env, then
  instrument env

This is not the same as proving the historical stock baseline. It is a current
eval-profile worker contract with explicit direction semantics.

Historical ledger runner contrast:

- `ogz-meta/ledger/backtest.sh` baseline preset used
  `tuning/tsla-15m-2y.json`.
- It described the old combined RSI+EMA baseline as about `$970`, about `1416`
  trades, and about `47.5%` WR.
- It explicitly set `DIRECTION_FILTER=long` unless `--shorts` was passed.
- Pre-fix worker tooling defaulted every standard run to `DIRECTION_FILTER=both`.
- Post-fix mechanical probe: parent/source env `DIRECTION_FILTER=long_only`
  survives `buildBacktestWorkerEnv()`.
- Post-fix mechanical probe: `configEnv: { DIRECTION_FILTER: 'both' }` wins over
  source `DIRECTION_FILTER=long_only`, so explicit sweep config still has
  precedence.
- Post-fix mechanical probe: source alias `DIRECTION_FILTER=long` normalizes to
  `long_only`.

Disposition: direction semantics are part of the reconstruction surface. Do not
compare old long-only baseline outputs to current both-direction worker outputs
without explicitly accounting for that difference.

Additional config-reader bug:

- `ABSOLUTE_POSITION_CAP` is stored by `core/TradingConfig.js` at
  `entryLogic.sizing.absoluteCapPercent`.
- `core/OrderExecutor.js` reads `TradingConfig.get('positionSizing.absoluteCapPercent')`.
- That current read returns `undefined`; the real configured cap is readable at
  `TradingConfig.get('entryLogic.sizing.absoluteCapPercent')`.
- Commit `e23ebe7` claimed to wire the cap, but added the wrong reader path.

Disposition: real bug, but not yet proven to be the cause of the negative stock
baselines. With current `current-eval` values, `MAX_POSITION_SIZE_PCT=0.05`
and dynamic max multiplier `2.5` cap at 12.5%, while
`ABSOLUTE_POSITION_CAP=0.15`. Therefore the wrong reader is a safety/config
integrity bug, not automatically the baseline-collapse root cause.

Partial-exit state:

- Rebuild and current both contain MaxProfitManager tiered/partial exit logic.
- Rebuild and current both route partial exits through `StateManager.reducePosition`.
- Current `OrderExecutor` adds accepted-order quantity normalization and adjusts
  state partial-close fraction from executed quantity.

Disposition: partial exits were not wholly stripped from current. The open risk
is semantic drift in quantity units, executed fraction, recorder/state accounting,
and backtest/live parity around partial exits.

## Required Reconstruction Before Fixing

1. Build an artifact manifest for every candidate baseline family:
   - May 4 session report
   - May 5/6 baselinehunting matrix artifacts
   - old ATR sweep artifacts
   - current `backtest-results/` artifacts
2. For each artifact, record:
   - branch
   - commit
   - command
   - data file
   - strategy
   - env/profile
   - direction filter
   - exit system
   - position sizing semantics
   - fees/slippage
   - worker/tool version
3. Mark artifacts invalid if any of those cannot be proven.
4. Diff execution semantics, not only files:
   - OrderExecutor sizing path
   - MaxProfitManager partial/tier exits
   - StateManager partial-close accounting
   - BacktestRecorder trade accounting
   - StrategyOrchestrator registration and ctx shape
   - sweep/worker env construction
5. Only after that, propose the first root-cause fix.

## Current Decision

No strategy, exit, sizing, or profile tuning fixes should be applied until the
baseline manifest and semantic diff are complete. The immediate bug class is not
one strategy. It is ungoverned baseline/profile/tooling drift across the
backtest execution path.

The one atomic exception now applied is the worker direction contract: future
comparisons must be able to preserve and stamp the requested direction before
they can be trusted.

## First Defensible Fix Applied

Target: `tools/backtest-worker-env.js` plus focused tests.

Problem fixed in the current working tree:

- Pre-fix worker env silently forced `DIRECTION_FILTER=both`.
- Old ledger baseline runner explicitly used long-only unless `--shorts` was
  passed.
- Parent/source env `DIRECTION_FILTER=long_only` was ignored by worker assembly.
- This makes current stock sweep commands non-comparable with old stock
  baselines.

Non-goal:

- Do not declare long-only canonical for every future eval.
- Do not restore May 4 or May 5/6 numbers as canon by code fiat.
- Do not change strategy modules.
- Do not change exits, sizing, or profile values in the same commit.

Applied fix shape:

- Make direction selection explicit and stamped in every worker result.
- Preserve an explicit parent/source `DIRECTION_FILTER` unless sweep config
  provides its own explicit direction.
- Normalize legacy aliases `long` and `short`.
- Throw on invalid direction tokens.
- Add tests proving:
  - parent/source `DIRECTION_FILTER=long_only` is not overwritten silently
  - explicit configEnv direction still wins
  - output summary includes the effective direction

Verification:

- `npm test -- --runInBand test/backtest-worker-env.test.js`
- `npm test -- --runInBand test/anchor-runner-env.test.js test/parallel-backtest-solo-env.test.js`
- mechanical probe for default/source/config/alias direction behavior
- Mercury attack:
  `ogz-meta/cognition-history/mercury/backtest-worker-direction-contract-2026-06-04.response.md`
