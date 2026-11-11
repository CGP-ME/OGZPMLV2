# Backtest feature-warning attribution

## Scope and outcome

All 156 warning events in the reviewed TSLA replay are attributed: the original 151 `feature_input_unavailable` events plus five separate `indicator_feature_unavailable` events. This investigation found no indicator-field mapping defect causing these events. It did not make unavailable measurements available, suppress warnings, change feature semantics, change entry warmup, or enable/disable learning.

The 829 input bars are actual Alpaca SIP/raw TSLA 15-minute candles from January 2016, saved by the standalone downloader. SHA256: `13206860a1620e5f5328ae16a043e8cad238a3cb2bb0bbaebf7b1eca8add0d9f`. This is a bounded replay, not the requested future two-year harvest or evidence of profitability.

## Counted causes

| Events | Cause | Native producer and consequence |
|---:|---|---|
| 151 | Only `priceAction` unavailable on flat candles (`high == low`); body/range is undefined | `core/FeatureExtractor.js`, `_calculateWickRatio`, returns null for nonpositive range. `extract` names unavailable fields; `extractArray` returns null. |
| 5 | Only `bollingerWidth` unavailable at history lengths 15–19; configured Bollinger period is 20 | `core/OptimizedIndicators.js`, `calculateBollingerBands`, returns `insufficient_bollinger_candles` and null width. `core/EnhancedPatternRecognition.js`, feature extraction, reports `indicator_feature_unavailable`. |

The 151 events arise on 110 distinct flat-candle timestamps: 71 timestamps emit once, 37 twice, two three times. `TradingLoop._gatherData` extracts separately for each qualifying pattern without an existing feature vector. Pattern counts are wedge 102, inverse_head_shoulders 18, head_shoulders 11, ascending_triangle 10 and descending_triangle 10.

There are 125 flat bars in the actual dataset. Four are before entry warmup, and eleven have no qualifying featureless pattern at the configured confidence threshold. Those 15 bars do not reach this extraction seam; they are accounted for, not missing diagnostic rows. The private event ledger links every warning to its original input, detector, history length, timestamp and full-log line.

## Learning implications and named limits

- In `TradingLoop._gatherData`, pattern-memory observation/readback requires an array feature vector. These 151 pattern observations therefore must not be counted as successful feature-backed learning observations. Other memory patterns may exist on the same candle. This does not establish that all learning is disabled or healthy.
- The standalone extractor and the extractor inside EnhancedPatternRecognition produce different nine-element schemas. EnhancedPatternRecognition uses its existing configured flat-candle wick ratio; standalone extraction declares the ratio unavailable. Equal vector length does not make these schemas interchangeable. Reusing the configured neutral number or zero-filling the standalone result would be a semantic change, not a repaired measurement. **Schema/flat-candle policy reconciliation remains explicitly unresolved**, outside this attribution result; no new learning policy was adopted.
- The five Bollinger warmup events require more real history, not invented history. Raising the entire entry warmup would change strategy behavior and was not done.
- `ema9` is null because the configured engine periods are 20, 50 and 200; it is not a required field of the affected nine-vector and causes none of the warnings. Flat RSI/MACD/Bollinger snapshot mappings used here were accepted by the consumers. No EMA configuration was added.
- A separate static lead is the truncated historical-close cache key in OptimizedIndicators. Its correctness/impact was not tested here and it is not established as a cause of these warning events. It remains a named investigation lead, not a repaired defect.
- Offline isolation has no external TrAI service or deployed learned banks. Existing initialization failures remain visible. No claim of external-model or live learned-state parity follows from a successful replay.

## Actual verification and source identity

The diagnostic replay pinned commit `9f3530103e7fec15cf9bf45106953966c3ec6878`, verified 846 source hashes inside `scripts/test-isolated.py`, and used return-preserving instrumentation only inside the sandbox. It processed all 829 candles with 147 trades, fees 220.50, net P&L -353.7989401999937, and zero processing, execution and window-end errors. The result is loss-making and is not a strategy recommendation. All 151 + 5 warning causes were checked programmatically against original input bars and native observations. No live settings, credentials, learned store or process was accessed or changed.

A separate, uninstrumented exact-candidate replay at base `74b41efa1dfff7d62d36c81f1ad77ace5e3c4a02` plus the stock-identity repair verified 848 source hashes and reproduced the same coverage, trade count, fees, P&L and warning counts with no recorded matrix parameter mismatches. The repair source identities were:

- `core/DataFileInstrument.js`: `f0695f028b6a16ede82c2f91781da668141900a62688c35f7e00c7a49defe4b9`
- `core/BacktestRunner.js`: `e1e2ad3ab2f34fd955a0ac6507a5876c74fa9633c936e1875dc36e47f6e8e754`
- `test/fixtures/backtest-stock-identity.py`: `e347d27759ed15c10be5b1e5ffa4aceea0aef7fa8e39a3b9030cdb7d2e44d2f5`

Zero processing errors and unavailable feature inputs are separate evidence dimensions. Neither should be hidden behind the other.

## Supporting receipts

Private evidence is retained, not bulk-published:

- `/home/linuxuser/.hermes/attachments/BACKTEST-INTEGRATION-FIX/features-diagnosis.md`: full report and all event references.
- `ogz-meta/inbox/hermes/2026-11-11/backtest-integration-fix/fixtures/features-warning-rows.json` and `features-summary.json`: counted causal ledger and reconciliation.
- Same private fixture directory: `features-replay-final.log`, `features-replay.py`, `features-hook.cjs`, `features-reviewed-source.json`, `features-actual-tsla.json`, and `features-summarize.py`.
- `/home/linuxuser/.hermes/attachments/BACKTEST-INTEGRATION-FIX/combined-real-02.log` and `combined-verification-02.json`: uninstrumented combined-candidate result.

The reproduction commands and failed initial diagnostic attempts are preserved in the full report. No raw private receipts, source overlays or operator state are included in this documentation change. At the time of this diagnostic replay, crypto fee-profile work awaited venue/tier evidence. The operator subsequently supplied Kraken fee previews; fee-model integration remains separate and unfinished. No fee changes are part of this report.
