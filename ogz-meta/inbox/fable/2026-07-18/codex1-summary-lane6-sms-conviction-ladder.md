# Codex-1 Summary — Lane 6 SMS Conviction Ladder

Date: 2026-07-18
Branch: codex/multi-asset-symbol-state
Base HEAD before lane: 469e2c26
Status: REVIEW-READY, not committed as code

## Scope

Lane 6 only: SmartMoneySweep conviction ladder.

Implemented:
- `minConditionsGate` explicit required config key, seed `0`.
- `tierHigh`, `tierMid`, `tierFloor`, `breakHigh`, `breakMid`, and `confidenceMode` explicit required config keys.
- `confidenceMode: "tiered"` preserves current behavior from config-owned breakpoints and tier values.
- `confidenceMode: "continuous"` uses `rawConfidence` as the sweepable arm.
- Matrix sweep arms added through the existing caged `BACKTEST_CONFIG_OVERRIDES_JSON` strategy-param path:
  - `strategies.SmartMoneySweep.minConditionsGate`: `[0, 1, 2, 3]`
  - `strategies.SmartMoneySweep.confidenceMode`: `["tiered", "continuous"]`
- `tools/strategy-parity.js` now constructs SmartMoneySweep with `ConfigLoader.get('strategies.SmartMoneySweep')` instead of `new SmartMoneySweep()` so required SMS config has one source.

Not changed:
- CVD reset.
- DST/session behavior.
- Volume profile consolidation.
- SMS exit geometry.

## Files in Lane Diff

- `config/trading.config.json`
- `foundation/ConfigLoader.js`
- `modules/SmartMoneySweep.js`
- `test/exit-geometry-producers.test.js`
- `test/matrix-sweep-surface.test.js`
- `test/smart-money-sweep-conviction-ladder.test.js`
- `tools/strategy-parity.js`

Unrelated dirty files present and excluded from this lane:
- `pine-transpiler/core/PineFeatureScanner.js`
- `pine-transpiler/tools/pine-import.js`
- `pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js`

## Red Proof

Parent-source proof loaded `HEAD^:modules/SmartMoneySweep.js` directly and replayed the zero-condition SMS scenario with `minConditionsGate=1`.

Parent emitted:

```json
{"parentEmits":true,"confidence":0.625,"conditionsMet":0,"rawConfidence":0}
```

HEAD behavior is covered by `test/smart-money-sweep-conviction-ladder.test.js`:
- `minConditionsGate blocks zero-condition sweeps before consuming the signal`

## Verification

Syntax:

```text
node --check foundation/ConfigLoader.js
node --check modules/SmartMoneySweep.js
node --check tools/matrix-sweep.js
node --check tools/strategy-parity.js
```

Focused tests:

```text
npx jest test/smart-money-sweep-conviction-ladder.test.js test/exit-geometry-producers.test.js test/matrix-sweep-surface.test.js test/parallel-backtest-solo-env.test.js test/strategy-orchestrator-symbol-state.test.js --runInBand

Test Suites: 5 passed, 5 total
Tests:       79 passed, 79 total
```

Diff hygiene:

```text
git diff --check -- config/trading.config.json foundation/ConfigLoader.js modules/SmartMoneySweep.js test/exit-geometry-producers.test.js test/matrix-sweep-surface.test.js tools/strategy-parity.js

exit 0
```

P0:

```text
node ogz-meta/gates/multi-runtime-gate-runner.js --p0

status: PASS
finalBalance: 8338.146639366509
totalTrades: 1551
winRate: 52.2
profitFactor: 0.64
reportPath: /opt/ogzprime/OGZPMLV2/backtest-results/worker-reports/backtest-report-1784343211299-36476-phase0-canonical-multi-runtime-gate-2026-07-18T02-51-30-372Z-7127e1f3-4d33-48b7-86f0-e381aa26c7c7-phase0-canonical-multi-runtime-gate-2026-07-18T02-51-30-372Z-TSLA.json
```

Mercury:

```text
Prompt: Mercury, break my fix. Attack Lane 6 SmartMoneySweep conviction ladder only...
Result: pass
Tool telemetry: 18 calls, 18 succeeded, 0 failed
Run ledger: ogz-meta/cognition-history/mercury-runs/2026-07-18.jsonl:5
```

Mercury checked:
- zero-condition signal cannot emit when `minConditionsGate=1`
- blocked sweep is not consumed
- tier values and breakpoints are no longer hardcoded in production SMS confidence
- continuous mode uses `rawConfidence`
- matrix sweep stays on caged `BACKTEST_CONFIG_OVERRIDES_JSON`
- CVD/session/VP behavior was not touched

## Residual Risk

P0 does not exercise SMS because the P0 lane is the frozen EMA anchor. P0 proves no shared-path drift; SMS behavior is proven by focused unit tests and Mercury's file-level attack.
