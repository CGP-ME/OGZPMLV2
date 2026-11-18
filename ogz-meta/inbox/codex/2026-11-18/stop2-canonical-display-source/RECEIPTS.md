# Canonical candle display-source repair — 2026-11-18

This is the next Stop 2 source dependency after `70b98f9c`. The native candle store, frame indicator engines and completed-candle boundary already exist. This change removes competing history copies and connects their consumers to those owners.

| Behavior captured | Before | First candidate | Delivered candidate |
| --- | ---: | ---: | ---: |
| Symbol/frame mismatches in 42 dashboard packets | 39 | 0 | 0 |
| History mismatch against the owning canonical series | 42 | 0 | 0 |
| Overlay mismatch against the owning frame engine | 39 | 0 | 0 |
| Numeric indicator mismatch against the owning frame snapshot | 39 | 39 | 0 |
| Candle-derived wall-clock delta messages | 42 | 0 | 0 |
| Backtest pump rows/errors/decisions | 4 / 0 / 2 | 4 / 0 / 2 | 4 / 0 / 2 |

The first capture checked history/overlays but missed the numeric snapshot helper's global reader. Mercury's first review found it. The fixture was strengthened with distinct price paths per symbol/frame and independent comparisons of RSI, ATR, MACD, signal, histogram and volume against the actual frame engine. That stronger capture reproduces the first candidate's 39 scalar mismatches; the correction removes all of them. This history is retained rather than describing the first run as complete proof.

[Before](before-receipt.json), [first candidate reproduced with the stronger fixture](initial-receipt.json), [final candidate](candidate-receipt.json) and [inherited working dependencies](working-tree-receipt.json) preserve actual values and source hashes. Their corresponding `*-run.json` files record exact commands, fixture hash, elapsed time and zero exit. The initial diagnostic explicitly allows the expected scalar mismatch; only the final candidate and working-tree runs require all fields to match.

## What actually executed

[Native fixture](fixtures/canonical-display.cjs): ConfigLoader, actual runner registration/hydration/OHLC methods, both SessionRouter stock subscription blocks, Alpaca stream processing, CandleProcessor, CandleStore, frame indicator engines, MTF snapshot capture, dashboard serialization/broadcaster, historical request method, evaluation-history callback, TTP candle-price reader, and the actual BacktestRunner pump loop. Broker REST and stream responses, account state, persistence, order dispatch and WebSocket transport are synthetic seams. Unrelated edge-analytics timer calculations are held by their existing timestamps; they are not certified.

Two symbols × seven frames receive 60 history bars, a new stream bar, a latest-bar correction and an older zero-volume correction. Each canonical series remains 61 unique chronologically ordered native bars; the correction never appends another copy or rewrites a captured entry decision. All seven completed native frames reach MTF; entries remain the original five frames per symbol. A separate forming-feed sequence captures one decision for the prior completed close 305, leaves the new forming close 309 outside that decision and ignores a later correction as an entry trigger. The backtest pump's two repeated/revised rows update canonical history without extra decisions.

Selecting 1d for a viewer still requests that history, but no longer changes a global candle-producer timeframe. Historical stock/crypto success requests retain their requested identity without writing into live history. The bot's crypto empty/failure path sends an explicit empty/error response rather than another cached series. Browser handling and the server's independent stock request handler remain pending.

Reproduce delivered code:

```bash
python3 scripts/test-isolated.py --fixture ogz-meta/inbox/codex/2026-11-18/stop2-canonical-display-source/fixtures/canonical-display.cjs -- node ogz-meta/inbox/codex/2026-11-18/stop2-canonical-display-source/fixtures/canonical-display.cjs
```

Comparison runs use source-override JSON only inside the disposable helper; those local source copies are not published. Baseline dependencies come from `70b98f9c`; the candidate excludes inherited dirty work while retaining only this repair's three config-key deletions. The working-tree run separately exercises inherited dependencies. No real state, credentials, journals or learned banks were copied into the helper. No Jest was added or run.

## Review evidence and resolution

[Initial review](initial-mercury-answer.md), [receipt](initial-mercury-receipt.json), [command](initial-review-run.json) and [source identity](initial-review-identity.json): tree `27f04847862e4600465f49cf43921074c324d3a6`, verdict `found_break`. The actionable finding was `_buildDashboardIndicators` reading the root snapshot while its render packet came from the frame engine. Its sole caller now supplies that frame's snapshot directly; no extra guard or substitute engine was added.

[Follow-up review](mercury-answer.md), [receipt](mercury-receipt.json), [command](review-run.json) and [source identity](review-identity.json): tree `fb8ebbe25f3f4f13d7e9c17880b09af1170b3b91`, verdict `no_break_found`, 24 successful read-only calls. The follow-up asks one specific provenance question about numeric indicators; other source changes are unchanged from the initial six-file review. Relevant manifest excerpts link and hash the complete local manifests. The executed final source hashes match the staged tree. Review harness hashes qualify the inherited dirty implementation.

One selected Mercury vote completed for each distinct code version. No other model was selected, no multi-model consensus is claimed, and no review output is called executable proof. Coverage/whole-file/inherited-section warnings remain in the receipts. Registration completeness and frontend behavior were named unread limits; actual registration/ingestion of all seven frames is in the native proof, and frontend work remains separate.

One follow-up explanation needs qualification: corrected candle volume and latest indicator volume do not always coincide. For an older zero-volume correction, the packet's candle/envelope volume is zero while `indicators.volume` remains the newest retained candle's volume. Both are from the same symbol/frame but different times; the captured values make that explicit. The review's blanket volume-equality wording is not used as evidence.

Total estimated review cost including Decide: USD 0.13203965. The second dispatch follows an actual producer repair, not a retry for cosmetic review metadata.

## Removed paths and remaining limits

[Caller census](orphan-census.json) finds no production source/config references to either removed history map, its writers/getters, conversion helper or three deleted size keys. The backtester, hydration, liveness ingestion, evaluation-history callback and TTP price reader were included in the migration. Two uncalled runner analytics forwarding methods and unused broadcaster context copies were removed. The primary trading history mirror used by other existing modules is outside these removed dashboard caches; this is not a claim that every legacy path in the repository has been audited.

No live broker request, actual browser render, full backtest report, actual trade, PM2 restart, environment reload, frontend application or RAG rebuild is proven here. The frontend must still stop constructing/rebucketing candles, filter symbols/frames before state mutation, replace historical corrections correctly and stop its duplicate broker fetch. Existing CVD accumulates whole candle volume on repeated updates and estimates direction from candle color; that remains an explicit analytics finding. Source snapshots supplied Mercury, so RAG freshness is not claimed. Stop 2 remains open.
