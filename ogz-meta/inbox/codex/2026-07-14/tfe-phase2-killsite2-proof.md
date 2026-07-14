# TFE Phase 2 Kill Site 2 Proof

Date: 2026-07-14
Branch: codex/multi-asset-symbol-state
Base commit: d33fae1f20c015e7e389cd4f87cb7f458c4a60ad

## Kill Site

`getCandleScopeEnvelope()` carried a four-source timeframe fallback chain:

```js
overrides.timeframe || this.timeframeSelector?.currentTimeframe || this.candleTimeframe || this.config.timeframe || null
```

Phase 2 replacement: the scope helper accepts only an explicit `overrides.timeframe`; missing timeframe increments `timeframeDiagnostics.missingScopeTimeframeDrops`, logs `[SCOPE][TIMEFRAME-MISSING]`, and lets the existing session-scope refusal throw when SessionRouter is active.

## Hidden Dependents Found

The first P0 after removing the fallback failed because hidden callers depended on the chain:

- `TradingLoop._dashboardScope`
- `TradingLoop._patternScope`
- `OrderExecutor._runtimeScope`
- `TraceSpine.readRunnerTraceScope`

Those callers now pass an explicit timeframe into `runner.getCandleScopeEnvelope(...)`.

`OrderExecutor` did not receive `ctx.candleTimeframe` in the runner construction path. The runner already owns the resolved `this.candleTimeframe`, so that same resolved value is now threaded into the OrderExecutor context at construction.

## Red Tests

Command:

```bash
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node /opt/ogzprime/OGZPMLV2/node_modules/jest/bin/jest.js --runInBand test/session-router-stock-symbol-config.test.js
```

Red 1: `static routed scope refuses implicit timeframe fallback chain loudly` failed before implementation because `getCandleScopeEnvelope()` recovered from `timeframeSelector` / `candleTimeframe` / `config.timeframe`.

Red 2: `runtime scope consumers pass explicit timeframe into runner envelope reads` failed before caller fixes because runtime files still contained bare `getCandleScopeEnvelope()` calls.

## Green Tests

Command:

```bash
node --check run-empire-v2.js && node --check core/OrderExecutor.js && node --check core/TradingLoop.js && node --check core/TraceSpine.js
```

Result: PASS.

Command:

```bash
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node /opt/ogzprime/OGZPMLV2/node_modules/jest/bin/jest.js --runInBand --runTestsByPath test/session-router-stock-symbol-config.test.js test/session-router-runtime-scope.test.js test/trace-spine.test.js
```

Result: PASS, 3 suites passed, 55 tests passed.

## Caller Sweep Proof

Command:

```bash
rg -n "getCandleScopeEnvelope\(\s*\)" core run-empire-v2.js test/session-router-stock-symbol-config.test.js
```

Result: only the intentional negative test remains:

```text
test/session-router-stock-symbol-config.test.js:160:    expect(() => bot.getCandleScopeEnvelope()).toThrow(/timeframe/);
```

## P0 Proof

Command:

```bash
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules node ogz-meta/gates/multi-runtime-gate-runner.js --p0 2>&1 | tee ogz-meta/inbox/codex/2026-07-14/tfe-phase2-killsite2-p0-final.log
```

Result: PASS.

Proof files:

- `ogz-meta/inbox/codex/2026-07-14/tfe-phase2-killsite2-p0.log`
- `ogz-meta/inbox/codex/2026-07-14/tfe-phase2-killsite2-p0-fixed.log`
- `ogz-meta/inbox/codex/2026-07-14/tfe-phase2-killsite2-p0-final.log`
- `ogz-meta/gates/runs/multi-runtime-latest.json`

Final anchor:

```json
{
  "finalBalance": 8338.146639366509,
  "totalTrades": 1551,
  "winRate": "52.2",
  "profitFactor": "0.64"
}
```

## Current Hold

No files staged. No commit made for kill site 2.
