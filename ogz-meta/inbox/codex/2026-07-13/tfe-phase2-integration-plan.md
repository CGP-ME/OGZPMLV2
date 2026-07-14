# Lane TFE Phase 2 Integration Plan

Status: blocked until Trey explicitly unlocks Phase 2 after R1/R2 land.

Phase 2 rule: execute against fresh HEAD, inspect dirty work first, show diff to Trey before commit, then run required tests including P0 exact `8338.146639366509 / 1551 trades / 52.2% WR / PF 0.64`.

## Sequence

1. Refresh worktree from fresh HEAD after R1/R2 land.
   - Run `git status --short --branch`.
   - Re-read `run-empire-v2.js`, `foundation/ConfigLoader.js`, `core/StrategyOrchestrator.js`, `modules/MultiTimeframeAdapter.js`, `core/CandleStore.js`, `core/CandleProcessor.js`, `core/BacktestRunner.js`, and current tests.
   - Do not reuse Phase 1 line numbers blindly if files moved.

2. Add red tests before kill-site edits.
   - Runtime source: missing timeframe on adapter OHLC event refuses instead of defaulting to `1m`.
   - Scope: `getCandleScopeEnvelope` has one explicit timeframe source and does not fall through the four-source chain.
   - MTF: `MultiTimeframeAdapter` cannot aggregate privately; it consumes TFE-delivered bars only.
   - Disk shape: CandleStore/load path returns stamped candles, not slot-only unstamped bars.
   - Backtest: file candles enter through TFE and keep dataset timeframe identity.

3. Wire TimeframeEngine construction in `run-empire-v2.js`.
   - Replace local `this.candleTimeframe` ownership with explicit resolved config passed into TFE.
   - Configure all platform timeframes through the canonical config pipe.
   - Add `maxCandles` values to the existing canonical config only if the fresh config does not already carry them.
   - No env fallback, no `||` defaults.

4. Replace SessionRouter OHLC local storage with TFE ingestion.
   - Remove `eventData.timeframe || '1m'`.
   - Normalize adapter output, require explicit source timeframe, ingest into TFE.
   - Strategy entry becomes a TFE subscription callback for the active native timeframe.

5. Delete private active-aggregate repair path from `run-empire-v2.js`.
   - Remove `_feedAggregatedActiveCandle`.
   - Remove `_requestAggregateSourceBackfill` if no longer needed; if repair remains, move it to source-feed/TFE ownership with explicit config.
   - Remove `_emittedAggregatedActiveCandles`, `_settledAggregatedActiveCandles`, `_aggregateSourceBackfills`, and `_trimAggregateTrackingSets` if no longer referenced.

6. Replace local dashboard history stores.
   - Replace `storeTimeframeCandle`, `storeSymbolTimeframeCandle`, `getSymbolTimeframeCandles`, and `getCandlesForTimeframe` call sites with TFE/CandleStore-backed stamped bar reads.
   - Remove invalid-timeframe fallback to `1m` and use honest empty/refusal state.
   - Keep dashboard REST historical fetch honest: external REST responses may be normalized, but runtime cache comes from born bars.

7. Convert BacktestRunner to the same TFE path.
   - Inject TFE into `BacktestRunner` context.
   - Replace `ctx.storeTimeframeCandle` and direct trading-cycle call with engine ingestion/subscription.
   - Preserve `_assertDataFileMatchesRuntimeScope`.
   - Add an assertion that each file candle's runtime envelope contains the configured timeframe.

8. Thin `MultiTimeframeAdapter`.
   - Remove private `TIMEFRAME_CONFIG`, `pendingCandles`, `_aggregateInto`, and `_addCandle` candle-production ownership.
   - Replace `ingestCandle` with a consumer method fed by TFE bars or snapshots.
   - Keep indicator/confluence math if still valid; do not let it own bar birth or aggregation.

9. Convert strategy timeframe declarations.
   - Add a strategy declaration surface that returns native timeframes per strategy.
   - Start with current effective behavior: all entry strategies subscribe to configured active timeframe; MTF consumes configured higher timeframe bars.
   - Replace timestamp-diff inference in `SmartMoneySweep` with supplied timeframe metadata.
   - Preserve `NoWickImbalance` symbol/timeframe scoped state.

10. Collapse the `run-empire-v2.js:2278` fallback chain.
    - Replace with the one timeframe from the current bar delivery envelope or explicit engine scope.
    - Remove fallback to `timeframeSelector`, `candleTimeframe`, and `config.timeframe`.
    - Keep fail-closed missing-scope behavior.

11. Disk candle shape cleanup.
    - Update `CandleStore.addCandle` to require `candle.timeframe === timeframe`.
    - Update `loadFromDisk` to stamp or reject legacy unstamped slot candles per Trey ruling; preferred Phase 2 behavior is reject and start fresh unless migration is explicitly approved.
    - Update tests to prove disk and in-flight candles have one shape.

12. Verification order.
    - Focused red/green suites for each kill site.
    - `node --check core/TimeframeEngine.js`.
    - `npx jest test/timeframe-engine.test.js --runInBand`.
    - Existing focused suites: `test/multi-timeframe-adapter-source-timeframe.test.js`, `test/strategy-orchestrator-mtf-source-timeframe.test.js`, `test/candle-history-runtime-timeframe.test.js`, `test/aggregate-source-backfill.test.js`, `test/backtest-runner-runtime-path.test.js`.
    - Mercury attack for trading-path integration using the visible frame `Mercury, break my fix.` after implementation and before commit.
    - `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`; anchor must remain exact unless Trey explicitly rules a new baseline.

## Expected Deletions Or Replacements By File

- `run-empire-v2.js`: remove private CandleAggregator construction, MTF producer construction, active aggregate repair stack, four-source timeframe fallback, dashboard invalid-timeframe fallback, hardwired 15m entry naming where behavior is timeframe-neutral.
- `core/CandleAggregator.js`: either delete after all references move to TFE, or leave as compatibility only if no runtime path imports it. Do not keep two active engines.
- `modules/MultiTimeframeAdapter.js`: remove private aggregation and candle-memory ownership; keep confluence consumer math only.
- `core/StrategyOrchestrator.js`: remove MTF adapter construction/import and replace with TFE-provided MTF snapshot/history.
- `core/BacktestRunner.js`: remove CandleAggregator interval fallback and direct store/trading-cycle coupling.
- `core/CandleStore.js`: reject unstamped or mismatched timeframe candles.
- `modules/SmartMoneySweep.js`: remove timestamp-diff timeframe inference after declarations are wired.

## Phase 2 Hold Conditions

- Fresh HEAD still dirty in R1/R2 territory.
- Existing P0 expected anchor in `ogz-meta/gates/multi-runtime-gate-runner.js` differs from mission-stated `8338.146639366509` without Trey ruling.
- No real source timeframe from adapter/backtest file can be proven.
- Any strategy would receive mixed-symbol or mixed-timeframe history after the TFE swap.
