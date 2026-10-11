# Latest-candle indicator revisions

The active CandleProcessor already replaces a forming candle in its canonical history, but IndicatorEngine appended every revision as a new bar. This counted the same candle repeatedly in EMA, volume and other indicator calculations.

The engine now retains its complete mutable state immediately before the latest candle. A revision with the same timestamp restores that state and applies the revised candle once. A new timestamp captures the next checkpoint. Reset clears it. Configuration remains owned by the existing configuration system. CandleProcessor and indicator formulas are unchanged.

The earlier proposed CandleProcessor rebuild was rejected: its 250-candle history cannot reconstruct the engine's longer accumulated state. That proposal was withdrawn before this independent engine change.

## Source and review

Production review tree: `1b6ca9bf7ea84e5e98455ae395c583b5f7b7e797`.
Base commit: `822ddf021bd53b50917a3779335974f12f2c13d5`.
Only production path: `core/indicators/IndicatorEngine.js`.

Mercury's final decision is `found_break`, while its ledger records `no_claim`. It refutes its duplicate-method allegation and flags availability of `structuredClone` on older Node versions. The observed runtime is Node22.22.1; Docker uses18 and CI uses20. These support the API. The package's declared `>=14` range remains incompatible with this call on older runtimes; that limitation is preserved rather than adding an unrequested compatibility fallback. Astra independently reviews actual runtime behavior, state restoration and the host-run evidence. Raw Mercury output is not relabeled as a clean pass.

Actual baseline reproduces duplicate/latest-candle state corruption. Candidate full raw state, indicator DTO and render packet match the delivered baseline engine fed a corrected chronological history, including repeated latest revisions, a next new candle,2101 input bars beyond2000 retention, and computeBatch followed by a revision. Actual CandleProcessor300-bar proof covers root primary15m and non-primarySPY1m with the250-bar store. Correctly labelled candidate full-buffer timings are4.515ms NEW and3.565ms revision. The separate baseline timing uses305 retained candles and is not a matching-retention comparison; no speedup factor is claimed. See final-receipt.json and astra-review.json.

## Reproduce

Run the focused scripts against an isolated export of the delivered commit with node_modules available. The baseline export must be commit822ddf021bd53b50917a3779335974f12f2c13d5. Both scripts change cwd to that export and load configuration with `loadDotenv:false`; they use explicit fixture credentials. Do not pass the live production directory as the export. The CandleProcessor fixture can initialize StateManager, so its state writes must stay inside the export.

```bash
node fixtures/candle-processor-latest-revision.cjs /absolute/isolated/export
node fixtures/latest-checkpoint-fullstream.cjs /absolute/isolated/export /absolute/isolated/baseline-export
```

## Limits

This change handles updates to the current latest candle. Earlier historical corrections/backfill ordering are not implemented by a latest-state checkpoint. There is no full bot deployment, broker order or feed-throughput acceptance in these component checks. Session-target history hydration and full configured-frame operational acceptance remain under deferred item27. No PM2 restart/resume or runtime activation occurred. Mercury index freshness is not claimed; the prior embedding-credit failure remains unresolved, and this review used captured source trees.
