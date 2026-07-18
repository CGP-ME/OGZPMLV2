# Codex-1 Summary: Lane 4 ORB Rebuild

Date: 2026-07-18
Branch: codex/multi-asset-symbol-state
Lane status: diff ready for Trey review; code is not committed

## Verdict

Lane 4 is implemented and held at review. The code diff restores OpeningRangeBreakout to a true accumulated opening-window strategy, keeps FVG confirmation hard, exposes OR duration and OR-width filter through the caged sweep surface, and preserves P0 exactly.

## Prior Failure

OpeningRangeBreakout previously allowed breakout/FVG behavior before the full configured opening window completed. The red test proved the pre-fix behavior:

- Command: `npx --no-install jest test/opening-range-breakout.test.js --runInBand --silent`
- Parent/pre-fix failure: `Expected: "COLLECTING_OR"; Received: "WATCHING_FOR_FVG"` at `test/opening-range-breakout.test.js:70`

## Runtime Changes

`modules/OpeningRangeBreakout.js`

- Required config keys are explicit at `modules/OpeningRangeBreakout.js:36-48`.
- Constructor validates and consumes the ORB config at `modules/OpeningRangeBreakout.js:98-158`.
- State machine now includes `COLLECTING_OR` before `WATCHING_FOR_BREAK` at `modules/OpeningRangeBreakout.js:27-34` and `modules/OpeningRangeBreakout.js:201-225`.
- Opening range collection accumulates high/low across the configured window at `modules/OpeningRangeBreakout.js:244-297`.
- OR-width filter is present and off when `orMinWidthAtr` is `0` at `modules/OpeningRangeBreakout.js:300-310`.
- Breakout/FVG scanning starts only after finalization and uses post-breakout scan candles at `modules/OpeningRangeBreakout.js:338-405`.
- Structural exit hints still include `fvg_filled` and `or_break_reversal` at `modules/OpeningRangeBreakout.js:451-459`.

`config/trading.config.json`

- `strategies.OpeningRangeBreakout` is explicit at `config/trading.config.json:1901-1913`.
- Seed values: `orDurationMinutes=15`, `orMinWidthAtr=0`, `minFVGPercent=0.05`, `maxFVGPercent=2`.

`foundation/ConfigLoader.js`

- ORB config is tracked through the config loader at `foundation/ConfigLoader.js:950-952`.
- ORB no longer has an env/default object in BASE_CONFIG; it resolves from `requiredConfiguredPlainObject('strategies.OpeningRangeBreakout')` at `foundation/ConfigLoader.js:2931`.
- Sweep arms are caged strategy params at `foundation/ConfigLoader.js:3385-3388`:
  - `strategies.OpeningRangeBreakout.orDurationMinutes`: `[5, 15, 30]`
  - `strategies.OpeningRangeBreakout.orMinWidthAtr`: `[0, 0.5, 1.0]`

`core/StrategyOrchestrator.js`

- ORB gets resolved config once at construction at `core/StrategyOrchestrator.js:696-699`.
- ORB symbol scope now resolves from `ctx.extras.symbol`, `ctx.symbol`, then `latestCandle.symbol|asset|ticker` at `core/StrategyOrchestrator.js:803-818`.
- ORB evaluation uses the resolved symbol before `_getSymbolStrategyModule` at `core/StrategyOrchestrator.js:1749-1756`.

## Test Evidence

Focused suites:

- Command:
  `npx --no-install jest --runTestsByPath test/opening-range-breakout.test.js test/matrix-sweep-surface.test.js test/strategy-orchestrator-orb-exit-hint.test.js test/config-loader-live-guard.test.js test/strategy-orchestrator-pipeline-toggles.test.js test/parallel-backtest-solo-env.test.js test/backtest-worker-env.test.js test/strategy-orchestrator-symbol-state.test.js --runInBand --silent`
- Result: 8 suites passed, 183 tests passed.

Syntax:

- `node --check modules/OpeningRangeBreakout.js`
- `node --check core/StrategyOrchestrator.js`
- `node --check foundation/ConfigLoader.js`
- `node --check tools/matrix-sweep.js`

Runtime default/env scan:

- Command scanned runtime files for old ORB env/default paths and silent default patterns.
- Result: no runtime matches for `ORB_SESSION_OPEN*`, `ORB_FVG_SCAN_BARS`, `ORB_MIN_FVG_PCT`, `ORB_MAX_FVG_PCT`, `ORB_ENTRY_LEVEL`, `ORB_STOP_BUFFER_PCT`, `ORB_TARGET_RR`, `new OpeningRangeBreakout()`, `orDurationMinutes ??`, `minFVGPercent ??`, `maxFVGPercent ??`, or `orMinWidthAtr ??`.

New behavior tests:

- Accumulated OR window: `test/opening-range-breakout.test.js:55-75`.
- OR-width filter and required key: `test/opening-range-breakout.test.js:86-104`.
- Sweep surface through caged overrides: `test/matrix-sweep-surface.test.js:238-253`.
- Symbol-scope fallback closure: `test/strategy-orchestrator-symbol-state.test.js:57-90`.

## Mercury

Initial Lane 4 attack:

- Run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl`
- Run id: `2026-07-17T21-48-06-470Z-dc78329c6826`
- Result: Mercury found a real symbol-scope gap. If `ctx.extras.symbol` was missing, ORB could fall back to the shared `this.orbStrategy`.
- Tooling note: one failed call to nonexistent `greps`; the useful file reads succeeded.

Fix applied:

- Added `_resolveStrategyStateSymbol()` and routed ORB through it before `_getSymbolStrategyModule`.
- Added regression proving candle-level symbol fallback creates separate ORB modules for TSLA and NVDA.

Mercury recheck:

- Run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-18.jsonl`
- Run id: `2026-07-18T01-02-37-985Z-6aea2eed63d3`
- Tools: 9/9 calls succeeded; `run_check` passed and wrote `ogz-meta/cognition-history/mercury-execution/2026-07-18T01-02-28-858Z-symbol-test.log`.
- Answer: Mercury stated the previous ORB symbol-scope finding is closed.
- Reliability note: the run ledger verdict is `cannot_verify` due answer-quality flags (`missing_file_line_citation`, `uncited_run_check_claim`). I am treating Mercury as degraded supporting evidence and relying on the focused regression plus cited code path for closure.

## P0

Command:

`node ogz-meta/gates/multi-runtime-gate-runner.js --p0`

Result from `ogz-meta/gates/runs/multi-runtime-latest.json` generated `2026-07-18T01:04:44.870Z`:

- Status: PASS
- Final balance: `8338.146639366509`
- Trades: `1551`
- Win rate: `52.2`
- Profit factor: `0.64`
- Fees: `2326.5`
- Tracked dirty hash: `94a826e19627799f618fd20ef7784a9b42775bb50f4c27bd37ea9d67e5c5a08a`

## Residual / Out Of Scope

- No PM2 restart was performed.
- No tournament run was performed.
- This lane did not change TFE subscription or candle-feed routing. The ORB module now accumulates whatever candle feed it receives.
- Mercury recheck evidence is degraded by verdict classification, but the concrete symbol-scope regression is green and the code path is direct.

## Files In Code Diff

- `config/trading.config.json`
- `core/StrategyOrchestrator.js`
- `foundation/ConfigLoader.js`
- `modules/OpeningRangeBreakout.js`
- `test/matrix-sweep-surface.test.js`
- `test/opening-range-breakout.test.js`
- `test/strategy-orchestrator-symbol-state.test.js`
