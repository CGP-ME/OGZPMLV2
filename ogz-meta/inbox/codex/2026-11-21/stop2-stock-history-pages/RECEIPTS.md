# Stop 2 — consume native stock history across provider pages

The dashboard's configured 500-bar TSLA hourly request returned only **216 bars** on the first real Alpaca response, with a continuation cursor. Successive native responses returned **203 and 81**, totaling **500**. Both existing readers previously stopped after the first page.

The source repair follows that cursor in `brokers/AlpacaAdapter.js:getCandles` and `server/stock-data-adapter.js:fetchStockCandles`, requesting only the outstanding count. It keeps the native symbol/timeframe/OHLCV, date bounds, feed, adjustment and chronological output intact. No candle construction or timeframe aggregation is added.

## Inspectable evidence

| Evidence | What it establishes |
| --- | --- |
| [Dashboard native pages](fixtures/native-pages.json) | Authenticated read-only GETs; split adjustment; three actual pages totaling 500 |
| [Bot native pages](fixtures/native-pages-bot.json) | Independent raw-adjustment GETs; same 216/203/81 counts and OHLCV in this window |
| [Baseline](baseline.json) | Actual old readers stop at 216 bars |
| [Working candidate](candidate.json) | Both readers return 500 native bars; small requests remain one call; failed continuation publishes no partial result |
| [Pinned candidate](pinned.json) | Same behavior with every tracked dirty source/config replaced by its exact candidate-tree bytes inside isolation |
| [Behavior fixture](fixtures/history-pages.cjs) | Calls the actual ConfigLoader/reader functions with captured broker bars; HTTP faults and terminal short histories are explicitly simulated |
| [Seven-frame replay](seven-frame-regression.json) | Existing native conversions, market-closure windows, small refreshes, terminal short histories and failure results retained across 1m/5m/15m/30m/1h/4h/1d |
| [Source diff](source.diff) | The complete two-function production change |
| [Source identity](source-identity.json) | Candidate/base tree identity, isolated overrides and actual inherited review-harness fingerprint |
| [Review command](review-command.json), [answer](mercury-answer.md), [receipt/correction](review.json), [source manifest](review-source-manifest.json) | One neutral Mercury review; source pinning; original answer preserved with its API misunderstanding explicitly corrected |
| [Activation preflight](activation-preflight.json) | Existing four processes still online; paper mode and one saved position; only these two source paths differ from the preceding activation |

All executable module verification ran through `python3 scripts/test-isolated.py` with the fixture files explicitly included. Helpers had no operator credentials, live state or network. Provider capture was a separate authorized read-only observation that imported no bot modules and submitted no orders. No Jest suite or Jest test was added.

The fixture's HTTP 503 on page two is a deliberate transport fault. Dashboard failure remains an unavailable result; the broker reader retains its existing error propagation. Terminal short histories are returned honestly, without filling missing bars. This repair does not redesign pre-existing invalid-input, malformed-bar or transport-failure policy.

## Review qualification

Mercury reported `no_break_found` and no blocking finding. Its assertion that requests below 10,000 bars cannot paginate is wrong: the linked captures request 500 and require three pages. [The provider reference](https://docs.alpaca.markets/us/reference/stockbarsingle-1) also explicitly allows short pages. The reference caps each request at 10,000; an over-limit dashboard request is not a supported way to exercise pagination. The native replay, rather than those assertions, establishes the repair's behavior. No source change was needed after review, and no additional peer review of this explanatory correction is claimed.

Mercury alone was selected; Astra and Opus were unselected. Metadata coverage warnings remain in the receipt. Its regex-backed reference tools are not treated as AST proof, and its code verdict is not execution proof.

## Runtime and remaining Stop 2 work

**Not activated by this source delivery.** The next step requires explicit approval to restart only `ogz-websocket` and `ogz-prime-v2` through the canonical ecosystem with `--update-env`, then capture the public 500-bar result and saved-position/journal preservation. Current processes still run the preceding repairs.

Remaining Stop 2 acceptance includes fault/recovery and complete session/order fencing and handoff coverage, plus stock market-hours evidence. The stock sizing conflict belongs to the subsequent trade-path station. This packet does not close Stop 2 or claim ML/TRAI work, live brokerage fills, strategy correctness or fresh RAG indexing.

Full narrative and setup-error corrections are recorded once in the accompanying CHANGELOG entry. Raw helper/provider logs, source overrides and inherited-work fingerprints remain private. Existing unrelated work is preserved.
