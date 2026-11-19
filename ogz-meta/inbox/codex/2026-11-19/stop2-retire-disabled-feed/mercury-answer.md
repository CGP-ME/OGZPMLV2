## Answer

The server manages the **CryptoMarketFeed** connection (`cryptoFeed`) — the direct public Kraken WebSocket feed — from startup through its SIGINT handler. It is created and connected at startup and explicitly stopped in the SIGINT handler. The legacy `krakenSocket` stub and its handlers were removed by this diff.

### Lifecycle trace

**Startup — creation and connect**
- `ogzprime-ssl-server.js:2268` — `const cryptoFeed = createCryptoMarketFeed({...})` with `symbols: DASHBOARD_CRYPTO_PRICE_SYMBOLS` (line 2269) and `feedConfig: dashboardRuntimeConfig.dashboard.cryptoMarketFeed` (line 2270).
- `ogzprime-ssl-server.js:2328` — `cryptoFeed.connect()` establishes the WebSocket.

**connect() internals — `core/CryptoMarketFeed.js:253-298`**
- Line 256: `ws = new WebSocket(feedConfig.publicWsUrl)`; `publicWsUrl` resolves to `"wss://ws.kraken.com"` (`config/internals.json:1131`), validated by `foundation/ConfigLoader.js:1507` (requires `ws:`/`wss:`).
- Lines 263-276: on `'open'`, clears state and subscribes to `ticker`, `trade`, and `book` channels (line 269-275).
- Line 277: `'message'` → `handleMessage` (lines 216-251) parses Kraken ticker/trade/book payloads.
- Lines 279-286: on `'close'`, clears books, emits `unavailable` CVD/internals status, and `scheduleReconnect()` only if `!stopped` (line 285).
- Lines 288-297: watchdog interval recycles a silent connection (`ws.terminate()`, line 293).

**SIGINT handler — `ogzprime-ssl-server.js:2351-2365`**
- Line 2361: `cryptoFeed.stop()` — this is the diff's replacement for the old `krakenSocket.close()`.

**stop() internals — `core/CryptoMarketFeed.js:314-318`**
- Sets `stopped = true` → blocks reconnect (guard at line 301 in `scheduleReconnect` and line 285 in the close handler).
- Clears the watchdog timer; closes `ws`.

Symbols are consistent: dashboard `cryptoSymbols` = `BTC-USD, ETH-USD, SOL-USD` (`config/settings.json:3871-3875`) exactly match `pairBySymbol` keys in `config/internals.json:1133-1135`, so `krakenPairForSymbol` (`CryptoMarketFeed.js:38-44`) does not throw for the configured set.

### Candidate inventory
- **Candidate A — CryptoMarketFeed/cryptoFeed (WebSocket):** the connection managed from startup (create/connect) through SIGINT (stop). **Supported** by the evidence above.
- **Candidate B — Kraken REST ticker** (`fetchKrakenCryptoTickers` via `KRAKEN_REST_TICKER_URL`, `ogzprime-ssl-server.js:1263,1770-1812`): a stateless per-interval HTTP fetch driven by `setInterval` at lines 1858-1862. It is a separate Kraken public-data source but is **not** managed through the SIGINT handler (its interval is not cleared there; only `process.exit(0)` at line 2366 ends it). Rejected as "the connection managed through SIGINT."
- **Candidate C — legacy `krakenSocket` stub:** removed by this diff (the deleted blocks); no longer present in current source. Rejected.

### Verification gaps
- No execution/test receipts: actual connectivity to `wss://ws.kraken.com`, successful subscription, and message flow are not observed — the lifecycle above is source-derived only.
- I did not fully trace the settings/internals profile-merge path into `dashboardRuntimeConfig` beyond confirming the values exist and are ConfigLoader-validated; the effective `cryptoMarketFeed` object is assumed to be the internals.json block.

---

VERDICT: no_break_found
ADVERSARIAL_REVIEW_BLOCKING: no

CANDIDATE SET: examined 3 of 3 (cryptoFeed WebSocket; Kraken REST ticker; removed krakenSocket stub).

AST EVIDENCE: I used grep/open_file on source; no AST/Serena structure claims are made, so no AST-tool receipt is required for this trace.

INHERITED: `cryptoFeed` inherits its config from `dashboardRuntimeConfig.dashboard.cryptoMarketFeed`; on connect failure it falls back to `scheduleReconnect()` with capped backoff (CryptoMarketFeed.js:300-309), and on close it emits `unavailable` status frames before reconnecting. `stop()` swallows close errors (`try/catch` at line 317) — a deliberate shutdown fallback.

FOURTH SHAPE CLASSIFIER: N/A — no new throws/guards/gates were added by this diff beyond `cryptoFeed.stop()` replacing `krakenSocket.close()` in SIGINT.

ALLEGATIONS: none from prior reviewers (prior-receipt entries = 0). The only substantive change is the SIGINT handler's target connection (diff hunk at old line 2573 → new line 2361).

SUBSTANTIVE RESOLUTION: none (no dispute exists).

WHAT I DID: read the current diff (git_diff), current source windows (ogzprime-ssl-server.js 2235-2365, 1246-1275, 1700-1845, 1846-2005, 78-90; core/CryptoMarketFeed.js 1-323; config/internals.json 1125-1160; foundation/ConfigLoader.js 1495-1520; config/settings.json 185-200, 3865-3895), and grepped `kraken`, `broadcastDashboardCryptoPrices`, `cryptoPriceIntervalMs`, `cryptoMarketFeed`, `publicWsUrl`, `dashboardRuntimeConfig`, `DASHBOARD_CRYPTO_PRICE_SYMBOLS`, `cryptoSymbols`.
WHAT I DID NOT DO: did not execute the server or the feed; did not trace the full profile-merge of settings.json+internals.json into `dashboardRuntimeConfig`; did not read the full 2389-line server file (only the windows relevant to the two Kraken connections and SIGINT).
WHAT I ASSUMED: that `dashboardRuntimeConfig.dashboard.cryptoMarketFeed` equals the internals.json block after ConfigLoader validation; that no other Kraken public socket exists elsewhere in the server (grep for `publicWsUrl`/`kraken` found only the REST URL, the feed, and the separate `kraken_adapter_simple.js` which is not part of this server file's lifecycle).
WHY THIS VERDICT: the question is a descriptive lifecycle trace, and the current source shows a complete, consistent startup→SIGINT lifecycle for the CryptoMarketFeed WebSocket connection, with config present and validated; no defect is evident, and the only gap is unobserved runtime connectivity.
IF INCOMPLETE, WHY: not incomplete for the source-derived lifecycle; runtime connectivity is unobserved because no host-attested execution receipt exists.
