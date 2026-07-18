# Codex-2 Pine Transpiler T2 Parity Harness Report

Date: 2026-07-18
Lane: T2 golden-parity harness
Territory: pine-transpiler/ plus this inbox report

## Result

Added a Pine parity harness that runs Pine source across a candle file, verifies fixture SHA-256 values, compares actual signals against expected signal lists, and reports divergent bar indexes with expected and actual directions.

SMS-v4 fixture #1 is present at `pine-transpiler/fixtures/parity/sms-v4.fixture.json` with:

- Pine source: `pinescript/SmartMoneySweep-v4.pine`
- Pine source sha256: `e6ba157b99e39e2701098bee227bc9396fbb0058f54f6066c9fc9909593a4a90`
- Candle file: `tuning/tsla-15m-18mo.json`
- Candle file sha256: `400610dca8a086238b6c9f5c0e3dac0d05b1824af476454ca42c43cbccf9c28f`

## Certification Status

Blocked for SMS-v4 signal-for-signal certification: the TradingView expected signal list is not present in the repo. Current repo docs only preserve aggregate parity evidence (`~397` target, approximately 5.5 percent delta), so the harness refuses to certify SMS-v4 instead of treating an empty or generated list as truth.

## Divergent Bars

No TradingView bar-level expected list is available, so divergent bar indexes cannot be named yet. Once the expected list is supplied, the harness reports each divergent bar with expected and actual directions.

## Verification

- `node --check pine-transpiler/core/PineParityHarness.js`
- `node --check pine-transpiler/__tests__/PineParityHarness.test.js`
- `npx jest pine-transpiler/__tests__/PineParityHarness.test.js pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js pine-transpiler/__tests__/PineTALib.golden.test.js --runInBand`

## Notes

- At T3 handoff, Jest collected archived tests under `ogz-meta/inbox/`; `testPathIgnorePatterns` should exclude `ogz-meta`, but that belongs to Codex-1 campaign-close housekeeping, not this Pine lane.
