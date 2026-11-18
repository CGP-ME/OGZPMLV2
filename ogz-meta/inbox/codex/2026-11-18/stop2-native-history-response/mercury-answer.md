I have completed my investigation. Here is my final review.

---

## VERDICT: no_break_found

## ADVERSARIAL_REVIEW_BLOCKING: no

---

### Answer to the question

A configured stock (a symbol present in `stockSymbols`) whose native data cannot be obtained is answered with a `historical_candles` frame containing an **empty `candles` array and an `error` field**: `"Native stock history unavailable for {symbol} {tf}"`. The request is **always answered** — this is the new behavior added by the diff, replacing the baseline behavior that silently dropped the request (only logged a warning, sent nothing).

### Symbol classification trace (server path)

1. Dashboard sends `request_historical` with `asset` (`public/js/websocket.js:433`, `public/js/panels/chart-panel.js:1612`).
2. Server enters the block for `data.type === 'request_historical'` — `ogzprime-ssl-server.js:2029`.
3. `isStock(asset, { config: DASHBOARD_STOCK_DATA_CONFIG })` — `ogzprime-ssl-server.js:2037`; defined at `server/stock-data-adapter.js:41-46`. **Key change:** it now returns `true` based solely on membership in `config.stockSymbols`, **independent of whether credentials are available** (the old `missingRequestConfigKeys(config).length > 0 → return false` guard was removed).
4. If `true`, `handled = true`, and `fetchStockCandles` is called — `ogzprime-ssl-server.js:2043`.
5. `fetchStockCandles` returns `null` on any failure (`server/stock-data-adapter.js:62-149`): missing credentials (65-68), unsupported symbol (69-72), unsupported timeframe (74-78), HTTP error (105-109), no bars (114-117), invalid bars (137-140), fetch error (145-148).
6. Server sends the error frame in the `.then()` path when candles are null/empty (`ogzprime-ssl-server.js:2044-2058`) and in the `.catch()` path (`ogzprime-ssl-server.js:2059-2070`). `attachDashboardMarketScope` is imported from `server/dashboard-market-scope.js` (`ogzprime-ssl-server.js:95`), so the frame construction is safe.

### Bot response path

If the server does not classify the symbol as a stock (`!handled`), it relays to the bot (`ogzprime-ssl-server.js:2078-2092`). `core/WebSocketManager.js:301-308` dispatches `request_historical` to `fetchAndSendHistoricalCandles` (`run-empire-v2.js:2432`). For a stock (`run-empire-v2.js:2463-2488`), if `fetchStockCandles` returns null/empty (→ `_stampDashboardHistoricalCandles` returns `[]`, line 2406), the bot sends the error frame (lines 2481-2487). The baseline bot only logged a warning and sent nothing (baseline `run-empire-v2.js:2481-2483`).

### Why no break in the configured-stock flow

- Both server and bot paths answer with an explicit error frame; **no configured-stock request goes unanswered**. The only non-response is when `ws.readyState !== WebSocket.OPEN` (socket closed) — not a routing issue.
- Classification is consistent: server and bot both use the same `isStock` (`run-empire-v2.js:242` aliases it as `isDashboardStockSymbol`), both using `cleanTicker` against `stockSymbols`.
- The `looksLikeEquityTicker` refusal (`run-empire-v2.js:2453-2456`) applies only to symbols **not** classified as stocks (unconfigured equity-like symbols) — not to configured stocks.

### CANDIDATE SET: examined 12 of 14

Enumerated candidates:
1. Server direct stock path (`ogzprime-ssl-server.js:2029-2075`) — **examined**; answers with error frame.
2. Server relay-to-bot fallback (`ogzprime-ssl-server.js:2078-2092`) — **examined**; only reached when server does not classify as stock.
3. `isStock` classification (`server/stock-data-adapter.js:41-46`) — **examined**; now credential-independent.
4. `fetchStockCandles` failure modes (`server/stock-data-adapter.js:62-149`) — **examined**; all return null → error frame.
5. Bot stock path (`run-empire-v2.js:2463-2488`) — **examined**; sends error frame.
6. Bot crypto/Kraken path (`run-empire-v2.js:2491-2522`) — **examined**; not relevant to stocks.
7. `core/WebSocketManager.js:301-308` dispatch — **examined**.
8. `looksLikeEquityTicker` guard (`run-empire-v2.js:2453-2456`) — **examined**; only blocks unconfigured equity-like symbols.
9. Config construction (`server/dashboard-stock-stream-config.js:13-66`) — **examined**; `stockSymbols` populated regardless of credentials.
10. `timeframe_change` removal — **examined**; active dashboard does not send it; legacy dashboard does.
11. Baseline server behavior (`git_show` c29f90c, ogzprime-ssl-server.js:2025-2065) — **examined**; baseline silently dropped no-data case.
12. Baseline bot behavior (`git_show` c29f90c, run-empire-v2.js:2400-2520) — **examined**; baseline bot sent nothing on no-data.

Unread/unresolved:
13. Baseline bot/WebSocketManager `timeframe_change` handling — **unverified** (I confirmed the baseline bot's `fetchAndSendHistoricalCandles` had no timeframe_change handler, but did not exhaustively read the entire baseline bot message dispatcher).
14. Server vs bot config source equality (`dashboardRuntimeConfig` vs `resolvedConfig.config`) — **assumed consistent** (same resolver, same shape); not proven identical at file level.

### INHERITED

- `server/stock-data-adapter.js:41-46` (`isStock`): the diff removed the `missingRequestConfigKeys(config).length > 0 → return false` early-return. Inherited behavior is now "symbol ownership is independent of data credentials" — a configured stock routes to Alpaca even when credentials are absent; `fetchStockCandles` then returns null and the server sends the error frame.
- `ogzprime-ssl-server.js:2029`: the diff removed `timeframe_change` from the relay condition. The legacy dashboard (`public/unified-dashboard-legacy.html:4657`) still sends `timeframe_change`; no current server/bot/WebSocketManager handler exists for it. The active dashboard (`public/unified-dashboard.html`) does not send it. This appears to be a dead-relay cleanup rather than a live regression, but the legacy-dashboard path is a named unread area.

### ALLEGATIONS / findings

- **No incorrect routing found** for the configured-stock history request. The server handles configured stocks directly; the bot fallback also handles them correctly.
- **No missing response found** for the configured-stock history request. Both paths send an explicit error frame when native data is unobtainable.
- **Observed change:** `timeframe_change` relay removed (legacy dashboard still sends it; no handler remains). Not part of the history-request flow that the question targets.

### SUBSTANTIVE RESOLUTION: none (no substantive dispute; this is an independent first-pass review)

### WHAT I DID
Read the three captured diffs; read current `server/stock-data-adapter.js` (1-249), `ogzprime-ssl-server.js` (1980-2110, 120-160, 1240-1275, 90-100, 1421-1450), `run-empire-v2.js` (2400-2560, 570-600), `core/WebSocketManager.js` (270-330), `server/dashboard-stock-stream-config.js` (1-71), `public/unified-dashboard-legacy.html` (4640-4675); grep'd `isStock`, `isDashboardStockSymbol`, `fetchStockCandles`, `request_historical`, `timeframe_change`, `attachDashboardMarketScope`, `DASHBOARD_STOCK_DATA_CONFIG`, `resolveDashboardStockConfigFromRuntime`, `looksLikeEquityTicker`; git_show baseline `ogzprime-ssl-server.js` and `run-empire-v2.js`.

### WHAT I DID NOT DO
Did not run any tests or execute code (read-only review). Did not exhaustively verify baseline bot/WebSocketManager `timeframe_change` handling. Did not verify server and bot config objects are byte-identical (assumed consistent from the same resolver).

### WHAT I ASSUMED
Server `dashboardRuntimeConfig` and bot `resolvedConfig.config` resolve to the same `services.dashboard.stockData` config (both use `resolveDashboardStockConfigFromRuntime`).

### WHY THIS VERDICT
The configured-stock history-request flow answers correctly: classification is credential-independent (`server/stock-data-adapter.js:41-46`), and both server (`ogzprime-ssl-server.js:2044-2070`) and bot (`run-empire-v2.js:2481-2487`) send an explicit error frame when native data cannot be obtained. This is the intended fix; no break in the targeted flow. The `timeframe_change` removal is an observed side-effect outside the question scope, affecting only the legacy dashboard, and is not a history-request break.

### IF INCOMPLETE, WHY
Not incomplete for the core question. Named unread areas (baseline timeframe_change handling; server/bot config identity) do not affect the configured-stock history-request conclusion.
