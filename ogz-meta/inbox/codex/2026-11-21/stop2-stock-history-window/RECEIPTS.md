# Stock history across market closures

The detailed November 21 entry in `CHANGELOG.md` is the change record. The scope is the locally imposed stock-history date window in the existing dashboard and bot request producers.

| Evidence | Artifact |
| --- | --- |
| Scoped production diff | [source.diff](source.diff) |
| Real, authenticated Alpaca market-data GET results, credentials excluded | [alpaca-native.json](fixtures/alpaca-native.json) |
| Actual old-source behavior | [baseline.json](baseline.json) |
| Actual working-source behavior | [candidate.json](candidate.json) |
| Exact staged production source behavior | [pinned.json](pinned.json) |
| Executed isolated protocol replay | [history-window.cjs](fixtures/history-window.cjs) |
| Pinned trees, source hashes, inherited Mercury harness identity | [source-identity.json](source-identity.json) |
| One neutral review question and arguments | [review-command.json](review-command.json) |
| Complete independent Mercury answer | [mercury-answer.md](mercury-answer.md) |
| Review outcome, gaps and checked corrections | [review.json](review.json) |

The provider capture returned 60 native TSLA bars for each of seven frames in both current feed/adjustment lanes. The helper runs the actual request and conversion functions, substitutes only the external HTTP transport, and filters the captured bars by each emitted request. Separate fresh processes load the bot and dashboard canonical configurations with disposable synthetic credentials. The fourteen-day gap is a simulated absence of new bars, not a claim that the stock market closed for fourteen days. Native timestamps and OHLCV are compared exactly. Short history, genuinely empty responses and provider errors do not produce fabricated candles. No Jest or bot restart was used.

Run the current-source helper:

```sh
python3 scripts/test-isolated.py \
  --fixture ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/history-window.cjs \
  --fixture ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/alpaca-native.json \
  -- node ogz-meta/inbox/codex/2026-11-21/stop2-stock-history-window/fixtures/history-window.cjs
```

Baseline and pinned executions additionally supplied private source-only override fixtures. No runtime state, real credentials or learned banks entered the helper. Published provider data includes only native OHLCV and non-secret request metadata; original response hashes identify the wire bodies but those full bodies and opaque pagination tokens are not published.

Alpaca documents [stock history since 2016](https://docs.alpaca.markets/us/docs/about-market-data-api) and the [single-symbol bars request contract](https://docs.alpaca.markets/us/reference/stockbarsingle-1). Omitting `start` selects the current day, so it would not correct the closure problem. Both adapters retain their existing descending request order and ascending output order. The replacement provider-history boundary is owned once by `config/internals.json`; the dashboard and bot both read that owner.

Limits: both existing request paths still consume one response page. Alpaca may return fewer bars than the requested limit even when a pagination token exists. This repair removes the incorrect local calendar cutoff; it does not certify complete provider history, every symbol/feed, or pagination. The capture proves the requested count for the current TSLA examples. Existing error routing, candle completion checks, stale-data checks and trading policies are unchanged. Mercury's full-count wording is therefore qualified in `review.json`; its invalid-limit note does not describe a new regression. No PM2 activation or fresh RAG index is claimed.
