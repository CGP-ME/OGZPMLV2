# Codex-1 Summary: Phase C Lane 1 PropSafe Window Fix

Date: 2026-07-17
Lane: Phase C Lane 1 — PropSafeEMAPullback pullback window
Runtime diff status: HELD FOR TREY REVIEW, not committed

## Verdict

Lane 1 runtime/test diff is ready for review.

The original producer bug is fixed in the working tree: `modules/PropSafeEMAPullback.js` now passes the full candle window into `_pullbackDistance()` for both long and short paths. `pullbackLookbackBars` now affects the pullback search instead of being starved by `[latest]`.

P0 held exact:

| Metric | Actual |
| --- | ---: |
| finalBalance | 8338.146639366509 |
| totalTrades | 1551 |
| winRate | 52.2% |
| profitFactor | 0.64 |

Gate artifact: `ogz-meta/gates/runs/multi-runtime-latest.json` generated `2026-07-17T14:29:27.828Z`.

## Prior Art / Root Cause

`_pullbackDistance(candles, pullback, atr)` was already window-aware and slices `candles.slice(-this.cfg.pullbackLookbackBars)`.

The producer bug was both call sites passing `[latest]`, collapsing the configured window to one candle:

| Path | Before | After |
| --- | --- | --- |
| long | `_pullbackDistance([latest], pullback, atr)` | `_pullbackDistance(candles, pullback, atr)` |
| short | `_pullbackDistance([latest], pullback, atr)` | `_pullbackDistance(candles, pullback, atr)` |

## Runtime Diff

Touched files:

| File | Purpose |
| --- | --- |
| `modules/PropSafeEMAPullback.js` | Pass full candles to `_pullbackDistance()` in long and short paths |
| `tools/matrix-sweep.js` | Add caged strategy-param matrix dimension through `BACKTEST_CONFIG_OVERRIDES_JSON` |
| `foundation/ConfigLoader.js` | Seed PropSafe matrix grid: `pullbackLookbackBars` values `[3, 5, 8]` |
| `test/propsafe-ema-pullback.test.js` | Red/green window behavior tests for long and short, plus aged-out window assertion |
| `test/matrix-sweep-surface.test.js` | Prove PropSafe lookback sweep stays inside caged config overrides, not env |

## Red / Green Proof

Red proof captured by temporarily restoring the parent producer bug:

Command:

```bash
npx jest test/propsafe-ema-pullback.test.js --runInBand --testNamePattern="finds a valid pullback inside the configured lookback window"
```

Result:

```text
exit=1
Received has value: null
Test Suites: 1 failed, 1 total
Tests: 1 failed, 10 skipped, 11 total
```

Green focused proof:

```bash
npx jest test/propsafe-ema-pullback.test.js test/matrix-sweep-surface.test.js --runInBand
```

Result:

```text
Test Suites: 2 passed, 2 total
Tests: 39 passed, 39 total
```

Syntax / diff checks:

```bash
node --check modules/PropSafeEMAPullback.js
node --check tools/matrix-sweep.js
node --check foundation/ConfigLoader.js
git diff --check -- foundation/ConfigLoader.js modules/PropSafeEMAPullback.js test/matrix-sweep-surface.test.js test/propsafe-ema-pullback.test.js tools/matrix-sweep.js
```

Result: pass.

## Sweepability

`pullbackLookbackBars` remains seeded in `config/trading.config.json` at the current runtime value. The tournament sweep grid is added under the matrix config:

```json
"strategies.PropSafeEMAPullback.pullbackLookbackBars": [3, 5, 8]
```

The runner writes those values into `BACKTEST_CONFIG_OVERRIDES_JSON`. It does not emit `PROPSAFE_EMA_PULLBACK_LOOKBACK`, so this does not reopen ambient-env injection.

## Mercury

First Mercury attack: `needs_more_evidence`.

Challenges raised:

1. short-side symmetry not proven
2. matrix sweepability not inspected
3. oversized `pullbackLookbackBars` no-signal case needed classification

Action taken:

1. Added explicit short-side window behavior test.
2. Added matrix-sweep test proving `[3, 5, 8]` rides through `BACKTEST_CONFIG_OVERRIDES_JSON`.
3. Classified the oversized-lookback case as pre-existing warmup/selectivity behavior, not the latest-only producer bug. No code change made under campaign no-scope-creep law.

Mercury recheck content verdict: `pass`.

Reliability note: bridge reported `Fable consensus skipped: Mercury tool failure makes verdict inconclusive_toolfail`; therefore Mercury is degraded supporting evidence, not clean two-tier authority for this lane.

## Residual / Report-Only Finding

If future tuning sets `pullbackLookbackBars` larger than available warm history, `_emaSlope()` can return false because its previous EMA slice is not finite. Current seeded runtime value and matrix grid `[3, 5, 8]` do not hit this in P0. This is not fixed in Lane 1 because the dispatch limits this lane to the latest-only call-site producer bug and sweepability.

## Status

Runtime diff is ready for Trey review. No PM2 restart. No runtime commit yet.
