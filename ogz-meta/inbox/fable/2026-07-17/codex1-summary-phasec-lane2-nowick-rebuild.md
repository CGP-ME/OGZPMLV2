# Codex-1 Summary: Phase C Lane 2 NoWick Rebuild

Date: 2026-07-17
Branch: codex/multi-asset-symbol-state
Runtime restart: none
Runtime diff status: held for Trey review, not committed

## Verdict

Lane 2 implementation is ready for review, not committed.

The old NoWick implementation traded simple taps only. The new implementation adds the source/Trey shape:

- side-specific wick signature through required `entrySideWickMaxPct`
- required `entryMode` with `tap` and `rejection`
- rejection requires close back on the thesis side
- same-candle formation cannot immediately enter
- swing-extreme formation avoidance
- first-touch almost-touch invalidation
- structural stop from `stopLookbackBars` extreme plus `stopBufferAtr`
- `targetRR` structural target
- caged matrix sweep surface for `entryMode` and `targetRR`
- twin-split marker and 0.5 strategy sizing consumed by the existing orchestrator sizing pipe

## Files In Runtime Diff

- `modules/NoWickImbalance.js`
- `core/StrategyOrchestrator.js`
- `config/trading.config.json`
- `foundation/ConfigLoader.js`
- `test/nowick-imbalance-scope.test.js`
- `test/exit-geometry-producers.test.js`
- `test/matrix-sweep-surface.test.js`
- `test/strategy-orchestrator-pipeline-toggles.test.js`

## Evidence

Code evidence:

- `modules/NoWickImbalance.js:30-42` required numeric keys include `entrySideWickMaxPct`, `swingExtremeLookback`, `almostTouchPct`, `stopLookbackBars`, `stopBufferAtr`, `targetRR`, and `twinProximityBars`.
- `modules/NoWickImbalance.js:64-68` validates `entryMode` and `twinSplitEnabled`.
- `modules/NoWickImbalance.js:157-180` computes entry-side wick percentages and only accepts the thesis-side wick.
- `modules/NoWickImbalance.js:275-288` refuses swing-extreme formations before adding pending levels.
- `modules/NoWickImbalance.js:299-312` blocks same-candle entry and refuses slice-through candles in rejection mode.
- `modules/NoWickImbalance.js:448-467` invalidates almost-touch reversals.
- `modules/NoWickImbalance.js:474-506` calculates structural stop/target from the last `stopLookbackBars` candles.
- `modules/NoWickImbalance.js:356-394` marks twin-split signals and emits `positionSizeMultiplier: 0.5`.
- `core/StrategyOrchestrator.js:2490-2493` consumes a strategy signal `positionSizeMultiplier`, defaulting absent/invalid values to `1.0`.
- `foundation/ConfigLoader.js:3396-3403` adds caged strategy-param sweep dimensions for NoWick `entryMode` and `targetRR`.
- `config/trading.config.json:1939-1954` owns the explicit NoWick config block.

Proof artifacts:

- Parent red proof: `ogz-meta/cognition-history/phase-c-lane2-nowick/red-parent-slice-through.log`
  - Parent emitted a buy on a slice-through candle even with `entryMode=rejection` override.
- Focused tests: `ogz-meta/cognition-history/phase-c-lane2-nowick/focused-jest.log`
  - `4 passed, 57 tests passed`
- P0: `ogz-meta/cognition-history/phase-c-lane2-nowick/p0-proof.log`
  - `8338.146639366509 / 1551 / 52.2% / PF 0.64`
- Gate report: `ogz-meta/gates/runs/multi-runtime-latest.json`
- Mercury run ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:14`

## Mercury / Fable Review

Mercury Pass 1 returned `pass-with-risk`, but Fable correctly marked it `needs_more_evidence` because Mercury under-read the cross-file paths.

Fable forced a targeted Mercury recheck for `positionSizeMultiplier`/`sizingMultiplier`. Recheck cited:

- `core/StrategyOrchestrator.js:2490-2493`
- `core/OrderExecutor.js:1833,1848`

Local focused tests were rerun after the Mercury packet and saved in `focused-jest.log`.

## Residual Risk / Honest Scope

Twin split is not a full two-order fanout implementation in this lane.

What landed in the diff:

- NoWick can detect touched twin sibling levels.
- The emitted signal carries `positionSizeMultiplier: 0.5`.
- `StrategyOrchestrator` multiplies the existing `sizingMultiplier` by that strategy-local multiplier.

What did not land:

- No new multi-order fanout engine.
- No second same-candle order from one strategy evaluation.

Reason: current orchestrator/execution architecture is winner-takes-one-signal per evaluation. Adding order fanout would touch execution semantics, journaling, state, partial sizing, and reconciliation. This report names that limitation instead of hiding it.

## Review Request

Review the eight-file runtime diff. If approved, commit message should be:

`Fixed NoWick rebuild — Phase C lane 2`

Suggested body note:

`Twin-split implemented through existing single-signal sizing pipe; multi-order fanout remains explicit future execution architecture, not silently claimed here.`
