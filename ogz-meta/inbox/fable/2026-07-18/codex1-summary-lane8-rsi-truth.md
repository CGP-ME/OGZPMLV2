# Codex-1 Summary: Lane 8 RSI Truth

Date: 2026-07-18
Branch: codex/multi-asset-symbol-state
Status: DIFF READY, HELD FOR TREY REVIEW

## Verdict

Lane 8 is implemented in the working tree and proofed locally. Code is not committed yet; this report is published first per inbox law.

## Shared RSI Export For Codex-2

Canonical export path:

- `core/IndicatorCalculator.js`
- `IndicatorCalculator.calculateWilderRSI(candles, period)`
- `IndicatorCalculator.calculateWilderRSIFromCloses(closes, period)`
- `IndicatorCalculator.calculateRSI(candles, period)` is the canonical alias and delegates to Wilder.

## What Changed

- Added shared Wilder RSI implementation in `core/IndicatorCalculator.js`.
- Routed `core/OptimizedIndicators.js`, `modules/RSI2MeanReversion.js`, `modules/MultiTimeframeAdapter.js`, and `tools/trade-validator.js` through the shared RSI math.
- Rebuilt inline RSI in `core/StrategyOrchestrator.js` around Trey's seeds: RSI period 5, buy below 35, exit above 50, long-only, required 200MA regime filter.
- Added explicit `strategies.RSI` config in `config/trading.config.json`; no absent-key posture remains for inline RSI.
- Removed old `RSI_OVERSOLD` / `RSI_OVERBOUGHT` worker env sweep surface and changed parallel RSI sweeps to caged config overrides: `strategies.RSI.buyBelow` and `strategies.RSI.exitAbove`.
- Updated `CHANGELOG.md` with the Lane 8 entry.

## Evidence

Code evidence:

- `core/IndicatorCalculator.js:79-92` makes `calculateRSI` delegate to `calculateWilderRSI`.
- `core/IndicatorCalculator.js:95-135` implements Wilder smoothing.
- `core/StrategyOrchestrator.js:1737-1781` is the new inline RSI path: RSI(5), buy-only, config-owned 35/50 thresholds, 200MA regime check, exit hint `rsiExitLong`.
- `modules/RSI2MeanReversion.js:110` consumes `IndicatorCalculator.calculateRSI`.
- `modules/MultiTimeframeAdapter.js:254` consumes `IndicatorCalculator.calculateRSI`.
- `core/OptimizedIndicators.js:132-137` delegates its cached RSI path to `IndicatorCalculator.calculateWilderRSI`.
- `foundation/ConfigLoader.js:97-130` validates the explicit `strategies.RSI` block.
- `foundation/ConfigLoader.js:1876-1882` reads `strategies.RSI` from `config/trading.config.json` before compatibility fallback.
- `tools/parallel-backtest.js:364-377` emits RSI sweep values through `BACKTEST_CONFIG_OVERRIDES_JSON`.
- `tools/backtest-worker-env.js:65-94` no longer allowlists old RSI threshold env keys.

Parent-red evidence:

- `git show HEAD:core/StrategyOrchestrator.js` still contains `oversoldLevel || 25` and `overboughtLevel || 75` at parent lines 1624-1625.
- `git show HEAD:core/IndicatorCalculator.js` has no `calculateWilderRSI` or `calculateWilderRSIFromCloses` export.

Focused tests:

- `npx jest test/indicator-calculator-rsi.test.js test/strategy-orchestrator-rsi-truth.test.js --runInBand --silent` PASS, 5 tests.
- `npx jest test/rsi2-mean-reversion.test.js --runInBand --silent` PASS, 6 tests.
- `npx jest test/rsi2-mean-reversion.test.js test/multi-timeframe-adapter-source-timeframe.test.js test/backtest-worker-env.test.js test/parallel-backtest-solo-env.test.js test/matrix-sweep-surface.test.js test/backtest-config-overrides.test.js test/strategy-orchestrator-pipeline-toggles.test.js test/indicator-calculator-rsi.test.js test/strategy-orchestrator-rsi-truth.test.js --runInBand --silent` PASS, 9 suites / 152 tests.

Mechanical scan:

- Active Lane 8 runtime files have zero hits for `oversoldLevel || 25`, `overboughtLevel || 75`, `RSI_OVERSOLD`, or `RSI_OVERBOUGHT`.
- Remaining global hits are non-blocking: `core/TradeIntelligenceEngine.js` uses `RSI_OVERBOUGHT` / `RSI_OVERSOLD` as scoring labels, and `core/TwoPoleOscillator.js` has unrelated `smaLength || 25`.

Mercury:

- Prompt: "Mercury, break my fix. Single question: does the current Lane 8 RSI truth diff implement shared Wilder RSI and remove old RSI 25/75 fallback behavior from the trade/backtest path?"
- Result: `pass`
- Telemetry: 22 tool calls, 22 succeeded, 0 failed; run ledger `ogz-meta/cognition-history/mercury-runs/2026-07-18.jsonl:8`.
- Mercury note: `core/OptimizedIndicators.js` still has `getRSIVotes` hard-coded threshold labels, but Mercury found no callers in trade/backtest flow.

P0:

- Command: `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`
- Result: PASS
- Exact anchor: `8338.146639366509 / 1551 trades / 52.2% WR / PF 0.64`
- Report: `ogz-meta/gates/runs/multi-runtime-latest.json`
- Worker report: `/opt/ogzprime/OGZPMLV2/backtest-results/worker-reports/backtest-report-1784352592789-47147-phase0-canonical-multi-runtime-gate-2026-07-18T05-27-59-875Z-56edd4e8-cb4e-4c16-9647-2d7b018864a1-phase0-canonical-multi-runtime-gate-2026-07-18T05-27-59-875Z-TSLA.json`

## Residual Notes

- `core/TradeIntelligenceEngine.js` has RSI label strings, not old config keys.
- `core/OptimizedIndicators.js#getRSIVotes` is still an uncalled helper with hard-coded RSI vote thresholds. It is not in the trade/backtest path per current Mercury/grep evidence; it can be deleted or converted in a later dead-helper cleanup lane if Trey wants no residue.
- The P0 run was executed against an uncommitted Lane 8 working tree. The gate artifact correctly records `trackedDirty: true`; the anchor numbers are exact.
