# TFE Phase 2 Kill Site 1 Proof

Date: 2026-07-14
Branch: codex/multi-asset-symbol-state
Head checked before work: 6edd3ae556aa64990f4cccaff0bac14f77463a04

## Kill Site

SessionRouter OHLC ingestion used a silent fallback:

```js
const tf = eventData.timeframe || '1m';
```

Phase 2 replacement: missing timeframe is refused loudly with a diagnostic counter and log line. No silent fallback remains at this site.

## Diff Summary

- `run-empire-v2.js`
  - Removed `eventData.timeframe || '1m'`.
  - Added missing-timeframe drop before candle processing.
  - Added `timeframeDiagnostics.missingSessionRouterTimeframeDrops`.
  - Added `[OHLC][TIMEFRAME-MISSING]` error log with current drop count.
- `test/single-broker-subscription-symbols.test.js`
  - Added focused regression assertion for fallback removal and loud-drop instrumentation.

## Red Test

Command:

```bash
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node /opt/ogzprime/OGZPMLV2/node_modules/jest/bin/jest.js --runInBand test/single-broker-subscription-symbols.test.js
```

Result before implementation: FAIL as expected. The new regression test caught the existing `eventData.timeframe || '1m'` fallback.

## Green Tests

Command:

```bash
node --check run-empire-v2.js && node --check core/TimeframeEngine.js
```

Result: PASS.

Command:

```bash
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node /opt/ogzprime/OGZPMLV2/node_modules/jest/bin/jest.js --runInBand --runTestsByPath test/timeframe-engine.test.js test/single-broker-subscription-symbols.test.js
```

Result: PASS, 2 suites passed, 11 tests passed.

## Loud-Drop Proof

Command:

```bash
rg -n "eventData\.timeframe\s*\|\|\s*['\"]1m['\"]|missingSessionRouterTimeframeDrops|\[OHLC\]\[TIMEFRAME-MISSING\]" run-empire-v2.js test/single-broker-subscription-symbols.test.js
```

Result: no fallback match; only the diagnostic counter, loud log line, and regression assertions remain.

## P0 Proof

Command:

```bash
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/gates/multi-runtime-gate-runner.js --p0 2>&1 | tee ogz-meta/inbox/codex/2026-07-14/tfe-phase2-killsite1-p0.log
```

Result: PASS.

Proof files:

- `ogz-meta/inbox/codex/2026-07-14/tfe-phase2-killsite1-p0.log`
- `ogz-meta/gates/runs/multi-runtime-latest.json`

Anchor:

```json
{
  "finalBalance": 8338.146639366509,
  "totalTrades": 1551,
  "winRate": "52.2",
  "profitFactor": "0.64"
}
```

## Current Hold

No files staged. No commit made.
