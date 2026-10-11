# Alpaca requested-timeframe delivery — deferred 27 prerequisite

SessionRouter requests its active timeframe, but Alpaca’s stream supplies native 1m bars. The runner previously stored then dropped these when active timeframe was 15m. The adapter now uses its existing broker candle reader after native bars to emit completed requested-frame OHLC with provider values and explicit end time. Native 1m events/callbacks remain unchanged. Overlapping reads coalesce, repeated returned candles do not emit twice, and old subscription responses/errors cannot enter a replacement subscription. No local aggregation, guessed OHLC, new configuration owner or trading gate.

The baseline reproduces no active-frame dispatch. Candidate and working proofs pass actual adapter delivery through the actual runner OHLC handler/normalizer/store method to analysis dispatch. Additional adapter proof covers forming-then-completed bars, duplicate suppression, overlapping reads, separate symbols, stale success/error suppression and existing broker-truth failure routing. All 25 existing Alpaca cases pass; one fixture constructor now receives its required canonical websocket config. The [source receipt](source-receipt.json) records limitations and exploratory failures; final fixtures use explicit fake credentials, disabled dotenv and controlled REST/socket data. No real trading or full scanner proof.

Mercury `2026-10-11T06-55-37-306Z-7cb7b23fbcdb`: [no_break_found](delivery-review-answer.txt) against production tree `70a43a6a7ea08890d245520f05c367934f11a195`; [Astra source review](astra-review.json) agrees. Supplemental fixture review accompanies this packet. No PM2 restart/resume or activation. Existing Mercury embedding credit exhaustion still prevents an index-freshness claim.

Reproduce adapter and route checks with explicit source paths:

```
node ogz-meta/inbox/codex/2026-10-11/mtf-alpaca-bars/fixtures/alpaca-15m-adapter-acceptance.cjs "$PWD/brokers/AlpacaAdapter.js"
node ogz-meta/inbox/codex/2026-10-11/mtf-alpaca-bars/fixtures/runner-route.cjs "$PWD"
```

The original local aggregation proposal and detached engine probe are preserved locally as exploratory history, not acceptance evidence. This change delivers only the requested active timeframe. Multi-frame dispatch remains open.
