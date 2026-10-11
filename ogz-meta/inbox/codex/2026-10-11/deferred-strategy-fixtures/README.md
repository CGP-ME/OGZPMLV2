# Deferred strategy fixture repair receipt

## Scope

Deferred item 3 identified partial existing fixtures in `test/nowick-imbalance-scope.test.js` and `test/exit-geometry-producers.test.js`. The repair changes only those existing test files. It adds the canonical settings owners required by the current constructors, supplies `mtfBaseTimeframe: '15m'` to each existing `StrategyOrchestrator` fixture, and puts the already-injected NoWick twin fixture into its required `registeredStrategies` evaluation list. No production source, production setting, test case, assertion, skip, or runtime process changed.

## Constructor evidence

- `modules/NoWickImbalance.js:28-112` requires the full numeric NoWick entry contract and `stopLookbackBars`, `stopBufferAtr`, and `targetRR` exit contract.
- `modules/LiquiditySweepDetector.js:62-96` requires the full LiquiditySweep config, including session time.
- `modules/SmartMoneySweep.js:70-137` requires the full SmartMoneySweep config, including cash/session settings.
- `modules/MultiTimeframeAdapter.js:74-104` requires a supported base timeframe, weights, and minimum-ready count; `core/StrategyOrchestrator.js:943-954` builds the remaining adapter configuration from its canonical owners.
- The targeted owners `strategies.NoWickImbalance`, `exitContracts.NoWickImbalance`, `strategies.LiquiditySweep`, `strategies.SmartMoneySweep`, and `strategies.OpeningRangeBreakout` are byte-for-byte equal between `HEAD` settings and the working settings. The working `config/settings.json` as a whole is dirty for unrelated fields, so this receipt does not treat the whole working configuration as `HEAD`.
- The relevant constructor source is unchanged from `HEAD`; the only working `core/StrategyOrchestrator.js` diff is an unrelated exit-hint normalization edit at lines 744-745, outside the constructor and evaluation-list contract used here.

## Baseline and final verification

Baseline command, using packet-local temporary and Jest cache locations:

```sh
TMPDIR=$PWD/ogz-meta/inbox/codex/2026-10-11/deferred-strategy-fixtures/private/tmp \
  ./node_modules/.bin/jest test/nowick-imbalance-scope.test.js test/exit-geometry-producers.test.js \
  --runInBand --roots test \
  --cacheDirectory="$PWD/ogz-meta/inbox/codex/2026-10-11/deferred-strategy-fixtures/jest-cache"
```

Baseline result: 19 failed, 1 passed. Failures were missing NoWick numeric fields, missing orchestrator MTF base timeframe, missing LiquiditySweep session fields, missing SmartMoneySweep cash/session fields, and a missing FVG constructor config.

Final result on both isolated committed production source and working source: 2 suites passed, 20 tests passed, 0 snapshots. The initial isolated run exposed reliance on production dotenv for loader credentials; NoWick setup now supplies explicit fake credentials/token and loads with loadDotenv:false. This corrected producer also passes all 20 cases. `git diff --check` for the two changed test files passed.

## Limitations

This is a nonproduction fixture repair. It does not certify broader configuration migration, live trading, a PM2 reload, broker behavior, or unrelated dirty production/configuration work.

[Exact source and final log hashes](source-receipt.json) · [Astra scoped review](astra-review.json).
