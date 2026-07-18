# Codex-1 Summary: Lane 7 MTF Demotion

Date: 2026-07-18
Branch: codex/multi-asset-symbol-state
Base HEAD during proof: 7c7d6ec524a46d129f12eb14aca899e2c63fa6a8
Status: diff ready for Trey review; not committed; not pushed; no PM2 restart.

## Verdict

Lane 7 is implemented as a review-ready diff: MultiTimeframe no longer behaves as a standalone strategy and now operates as a confluence-only service.

The lane is not live. Runtime PM2 was not restarted.

## Trey Law / Death Clause

MultiTimeframe is now trial-form confluence only. If Pass-1 confluence-boosted rows fail to beat their flat twins, the module deletes whole rather than being kept as dormant architecture.

This is written in the `modules/MultiTimeframeAdapter.js` header.

## What Changed

- `modules/MultiTimeframeAdapter.js`
  - Replaced standalone-strategy posture with `crossFrameScore(symbol)`.
  - Removed private RSI math and uses shared `IndicatorCalculator.calculateRSI`.
  - Requires explicit `weights` and `minReadyTimeframes`.
  - Below readiness returns `confluenceScore: null` and `confidence: null`.

- `core/StrategyOrchestrator.js`
  - Removed MultiTimeframe strategy registration, pipeline toggle, candidate path, standalone winner path, and trend-gate strategy treatment.
  - Consumes MTF only as optional per-strategy `confluenceBoost`.
  - Uses `crossFrameScore`, preserves null as absent, and skips missing/null/blank numeric fallbacks in `firstFiniteNumber`.

- `foundation/ConfigLoader.js`
  - Added required `confluence.mtfService` validation per launch profile.
  - Added required per-strategy `confluenceBoost` validation.
  - Removed old MTF strategy/toggle/config surfaces.
  - Added object-level active override overlay so caged nested overrides affect `ConfigLoader.get('orchestrator.mtfConfluenceService')`.

- `config/trading.config.json`
  - Added explicit `confluence.mtfService` blocks to launch profiles.
  - Added explicit `confluenceBoost: { enabled: false, weight: 0 }` to strategy blocks.
  - Removed MultiTimeframe exit contract and roster/toggle surfaces.

- `core/BacktestConfigOverrides.js` and `tools/matrix-sweep.js`
  - Extended the caged override path for `orchestrator.mtfConfluenceService.minReadyTimeframes`.
  - Added matrix global param support for minReady arms `{2,3}` without env leakage.

- `run-empire-v2.js`
  - Fixed the direct runtime `MultiTimeframeAdapter` constructor path to pass explicit ConfigLoader service config.

## Proofs

Syntax / config parse:

- `node --check run-empire-v2.js`
- `node --check core/BacktestConfigOverrides.js`
- `node --check core/StrategyOrchestrator.js`
- `node --check modules/MultiTimeframeAdapter.js`
- `node --check foundation/ConfigLoader.js`
- `node --check tools/matrix-sweep.js`
- `node -e "JSON.parse(fs.readFileSync('config/trading.config.json','utf8'))"`

Focused behavior tests:

```text
npx jest test/multi-timeframe-adapter-source-timeframe.test.js test/strategy-orchestrator-mtf-strategy-confluence.test.js test/strategy-orchestrator-mtf-source-timeframe.test.js test/policy-builder.test.js test/matrix-sweep-surface.test.js test/parallel-backtest-solo-env.test.js test/strategy-orchestrator-pipeline-toggles.test.js test/backtest-worker-env.test.js test/backtest-config-overrides.test.js test/mtf-runtime-base-timeframe-contract.test.js --runInBand --silent

PASS: 10 suites, 183 tests.
```

Mechanical residue scan:

```text
rg -n "exitContracts\.MultiTimeframe|strategies\.enableMultiTimeframe|pipeline\.enableMultiTimeframe|SOLO_STRATEGY.*MultiTimeframe|MTF-only|enableMultiTimeframe|ENABLE_MTF(?!_CONFLUENCE)|MTF_REQUIRE_HIGHER_TF_READY|multiTimeframeMtf|getConfluenceScore|shouldRegister\('MultiTimeframe'\)|name: 'MultiTimeframe'|\"MultiTimeframe\"|boostMtfCandidate|MTF_BOOSTER_BOOST_MTF_CANDIDATE" core foundation modules config tools test run-empire-v2.js --pcre2

No matches.
```

Constructor scan:

```text
rg -n "new MultiTimeframeAdapter\(" core modules run-empire-v2.js test
```

Runtime constructor paths are covered by explicit config:

- `core/StrategyOrchestrator.js` uses `_buildMtfAdapterConfig()`.
- `run-empire-v2.js` now reads `orchestrator.mtfConfluenceService` before constructing the adapter.
- Other hits are tests or examples.

P0 gate:

```text
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
```

Result: PASS.

Generated report: `ogz-meta/gates/runs/multi-runtime-latest.json`

Exact P0 actual:

- final balance: `8338.146639366509`
- trades: `1551`
- winners: `810`
- losers: `741`
- win rate: `52.2`
- profit factor: `0.64`

## Mercury

First Mercury attack:

- Ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-18.jsonl` row created at `2026-07-18T04:24:55.388Z`.
- Stored verdict: `found_break`.
- Findings were real enough to fix:
  - Direct adapter constructor paths could omit explicit weights/minReady.
  - Matrix/backtest override path could parse minReady without proving it reached object-level ConfigLoader readers.

Fixes after first attack:

- `MultiTimeframeAdapter` constructor now requires explicit weights and minReady.
- `run-empire-v2.js` passes ConfigLoader service config to the adapter.
- `BacktestConfigOverrides` supports the caged minReady path.
- `ConfigLoader.get()` overlays active child overrides onto object reads.
- Focused tests prove the caged override reaches `orchestrator.mtfConfluenceService`.

Mercury recheck:

- Ledger: `ogz-meta/cognition-history/mercury-runs/2026-07-18.jsonl` row created at `2026-07-18T04:38:00.140Z`.
- Tool calls: 16/16 succeeded, no failed calls.
- Answer excerpt says: `Verdict: pass - neither (a) nor (b) can still cause a Lane 7 MTF demotion failure.`
- Stored parsed verdict still says `found_break`; this is treated as degraded verifier metadata because the answer text contradicts the run-ledger classifier.
- Supporting evidence is therefore the full stack: Mercury answer text, focused tests, mechanical scans, constructor scan, and exact P0.

## Residual Risk

- The Mercury run-ledger classifier appears to misclassify the recheck as `found_break` despite pass text. This is a verifier metadata defect, not a Lane 7 runtime defect, but it should be handled in the Mercury residual queue.
- P0 output was noisy with existing compatibility/concurrency logs, but the gate report landed exact and passed.

## Files In Diff

- `CHANGELOG.md`
- `config/trading.config.json`
- `core/BacktestConfigOverrides.js`
- `core/ExitContractManager.js`
- `core/PolicyBuilder.js`
- `core/StrategyOrchestrator.js`
- `foundation/ConfigLoader.js`
- `modules/MultiTimeframeAdapter.js`
- `run-empire-v2.js`
- `test/backtest-config-overrides.test.js`
- `test/backtest-worker-env.test.js`
- `test/matrix-sweep-surface.test.js`
- `test/mtf-runtime-base-timeframe-contract.test.js`
- `test/multi-timeframe-adapter-source-timeframe.test.js`
- `test/parallel-backtest-solo-env.test.js`
- `test/policy-builder.test.js`
- `test/strategy-orchestrator-mtf-source-timeframe.test.js`
- `test/strategy-orchestrator-mtf-strategy-confluence.test.js`
- `test/strategy-orchestrator-pipeline-toggles.test.js`
- `tools/backtest-worker-env.js`
- `tools/config-audit.js`
- `tools/matrix-sweep.js`
- `tools/weekend-campaign-gauntlet.js`
- `ogz-meta/inbox/fable/2026-07-18/codex1-summary-lane7-mtf-demotion.md`
