# Codex-1 Summary: Lane 3 LiquiditySweep Honesty

Date: 2026-07-17
Branch: codex/multi-asset-symbol-state
Lane: Phase C Lane 3, LiquiditySweep honesty
Status: diff ready for Trey review; report committed separately per inbox rule

## Scope

Implemented the Lane 3 ruling for `LiquiditySweepDetector`:

- The old 1-of-2 validation path is gone. A manipulation candle must now satisfy both:
  - sweep of a prior high/low
  - close back inside the swept level
- `validationsRequired` was not added as a config knob.
- `sweepExtensionBandMult` is now an explicit required config key.
- `sweepMinExtensionPct` keeps its literal meaning; the previous hardcoded `* 5` moved to `sweepExtensionBandMult`.
- `disableSessionCheck` is deleted from active code paths.
- The confidence weight cluster is explicit config, not `weights?.x || default`.
- Active sibling constructors in tools/scripts/tuning now use the same canonical `ConfigLoader.get('strategies.LiquiditySweep')` path instead of partial/default constructor objects.

## Runtime Files In Diff

- `config/trading.config.json`
- `core/StrategyOrchestrator.js`
- `foundation/ConfigLoader.js`
- `modules/LiquiditySweepDetector.js`
- `run-empire-v2.js`
- `scripts/smoke-test.js`
- `tools/trade-validator.js`
- `tuning/pipeline-diagnostic.js`
- `test/exit-geometry-producers.test.js`
- `test/liquidity-sweep-interval.test.js`

## Key Code Evidence

- Required weights: `modules/LiquiditySweepDetector.js:67-74`
- Required `sweepMinExtensionPct` and `sweepExtensionBandMult`: `modules/LiquiditySweepDetector.js:85-86`
- Sweep and close-back-inside validation: `modules/LiquiditySweepDetector.js:323-341`
- Weight consumption: `modules/LiquiditySweepDetector.js:438-442`
- Root runner constructor uses canonical config: `run-empire-v2.js:731-732`
- Orchestrator root constructor uses canonical config: `core/StrategyOrchestrator.js:709-710`
- Orchestrator per-symbol constructor uses canonical config: `core/StrategyOrchestrator.js:1442-1448`
- ConfigLoader ownership: `foundation/ConfigLoader.js:2781`
- Explicit JSON config: `config/trading.config.json:1837-1855`

## Red Proof

Parent behavior accepted a swept opening candle that did not close back inside the swept level.

Red output from the new focused test before the fix:

```text
Expected: "done"
Received: "watching_for_exit"
```

After the fix, both high-side and low-side cases are covered:

- high sweep, close still outside swept high -> `phase: done`, `manipCandlesValidated: 0`
- low sweep, close still outside swept low -> `phase: done`, `manipCandlesValidated: 0`
- low sweep, close back above swept low -> `phase: watching_for_exit`, `manipCandlesValidated: 1`

Mechanical probe output:

```text
high-close-outside {"phase":"done","validations":{"passesATR":true,"sweepsHighs":true,"sweepsLows":false,"closesInsideRange":false},"validated":0}
low-close-outside {"phase":"done","validations":{"passesATR":true,"sweepsHighs":false,"sweepsLows":true,"closesInsideRange":false},"validated":0}
low-close-inside {"phase":"watching_for_exit","validations":{"passesATR":true,"sweepsHighs":false,"sweepsLows":true,"closesInsideRange":true},"validated":1}
```

## Verification

Focused tests:

```text
npx --no-install jest test/liquidity-sweep-interval.test.js test/exit-geometry-producers.test.js test/strategy-orchestrator-pipeline-toggles.test.js test/matrix-sweep-surface.test.js --runInBand --silent

Test Suites: 4 passed, 4 total
Tests:       57 passed, 57 total
```

Syntax:

```text
node --check run-empire-v2.js
node --check foundation/ConfigLoader.js
node --check modules/LiquiditySweepDetector.js
node --check core/StrategyOrchestrator.js
node --check tools/trade-validator.js
node --check scripts/smoke-test.js
node --check tuning/pipeline-diagnostic.js
```

Active-path stale pattern scan:

```text
rg -n "disableSessionCheck|LIQSWEEP_|sweepExt \\* 5|validationsPassed > 0|weights\\?\\.|closeFromExtreme|bodyMid|new LiquiditySweepDetector\\(\\s*\\{|new LiquiditySweepDetector\\(\\s*\\)" run-empire-v2.js core foundation modules tools scripts tuning config --glob '*.js' --glob '*.json'

exit 1, no matches
```

P0:

```text
node ogz-meta/gates/multi-runtime-gate-runner.js --p0

status: PASS
finalBalance: 8338.146639366509
totalTrades: 1551
winRate: 52.2
profitFactor: 0.64
generatedAt: 2026-07-17T21:12:56.621Z
dirtyHash: 215ddb3334f4a808ab5f8f9f6c5289ae840c8b0e86f43ca1c3010673f2f1b5df
```

## Mercury

Kimi was not run. Operator ruled the Kimi call waits until campaign end.

Mercury runs:

- `ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:18`
- `ogz-meta/cognition-history/mercury-runs/2026-07-17.jsonl:19`

Mercury found real stale constructor producers in active tool/script paths:

- `tools/trade-validator.js`
- `scripts/smoke-test.js`
- `tuning/pipeline-diagnostic.js`

Those were fixed into the same canonical config constructor path and locked by test.

Mercury also challenged the close-back-inside implementation. That challenge was valid against the old body-midpoint proxy, so the runtime code was tightened to true swept-level rejection:

- high sweep requires close below the swept high
- low sweep requires close above the swept low

Mercury's final low-side objection claimed a close far above a swept low should be bounded by the sweep-extension band. That is not the current Lane 3 law: closing above the swept low is back inside the swept level. The new low-side tests prove both the refusing and accepting cases mechanically.

Mercury final telemetry:

- iterations: 14
- termination: answer_given
- failed tool calls: 0
- reliability note: verdict was useful for finding missing low-side coverage, but the final low-side "band upper bound" claim was adjudicated as a doctrine mismatch rather than a code break.

## Remaining Question

The lane is ready for Trey diff review. The only residual semantic question is whether Trey wants a stricter future doctrine where a low-sweep rejection close must stay inside a bounded band, not merely back above the swept low. That is not implemented in this lane.
