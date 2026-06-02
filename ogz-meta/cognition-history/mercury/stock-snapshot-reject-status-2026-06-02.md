Attack this change. Do not validate it softly. Find a concrete input sequence or runtime state where it lies, hides a real failure, emits stale/fake stock prices, keeps PM2 error spam, corrupts dashboard broker_status, or introduces a new failure mode.

Context: OGZPrime dashboard stock watchlist fanout was logging expected stale Alpaca snapshot rejections to PM2 error every polling cycle. The intended fix keeps stale prices suppressed, preserves loud console.error for credentials/HTTP/fetch failures, and sends structured reject reasons to the fanout caller so broker_status can report stale_snapshot instead of generic no_valid_tickers.

Changed files and exact ranges:

1. server/stock-data-adapter.js:146-250
- stockTickerReject(symbol, reason, details)
- fetchStockTickerResult(ticker)
- fetchStockTicker(ticker, options)

Current behavior in that range:
- non-stock symbols return { ok:false, reason:'not_stock_symbol' }
- missing credentials console.error and return missing_credentials
- HTTP non-ok console.error and return http_error
- invalid price returns invalid_price without console.warn
- invalid timestamp returns invalid_timestamp without console.warn
- stale timestamp returns stale_snapshot with ageMs/maxAgeMs/sourceTimestamp without console.warn
- valid snapshot returns { ok:true, ticker }
- legacy fetchStockTicker returns ticker or null, and calls options.onReject(result) if provided

2. ogzprime-ssl-server.js:1171-1190 and 1452-1515
- broker_status now allows staleCount
- broadcastDashboardStockPrices collects rejectCounts via fetchStockTicker(symbol, { onReject })
- if successCount === 0, broker_status reason becomes top reject reason such as stale_snapshot
- staleCount increments only for stale_snapshot

3. test/stock-data-adapter-ticker.test.js:74-131
- tests assert stale snapshots still return null
- tests assert no console.warn on stale snapshots
- tests assert structured stale_snapshot result and onReject callback

Attack questions:
1. Can any stale/invalid Alpaca snapshot still produce a price or ticker_price frame?
2. Can expected stale snapshots still spam stderr/PM2 error through this path?
3. Did the change mute a real operational failure that must stay loud?
4. Can onReject exceptions, malformed reasons, or mixed success/failure symbols corrupt broker_status or crash the fanout loop?
5. Did adding staleCount or top reject reason create a dashboard contract break or misleading state?
6. Did this close the underlying mechanism, or only one symptom?

Return file:line evidence and a PASS/FAIL verdict. If FAIL, provide the minimal root-cause patch shape.
