I have now traced the complete request path. Let me compile the final report.

## VERDICT: no_break_found

## Direct Answer

During the scheduled runtime's stock session, a BTC-USD dashboard history request reaches the **Kraken** broker (via `this.sessionRouter.krakenAdapter`, the dedicated Kraken adapter), with the instrument passed as **BTC/USD** (slash form), which the adapter resolves to the native Kraken REST pair **XXBTZUSD**. This is the behavior the diff fix intends; no misrouting to the stock-session Alpaca adapter occurs.

## Request Trace (with source citations)

1. **Entry point** — Dashboard sends `{type:'request_historical', asset:'BTC-USD', timeframe, limit}`. `core/WebSocketManager.js:300-308` calls `this.ctx.fetchAndSendHistoricalCandles(timeframe, limit, msg.asset)`.
2. **Symbol resolution** — `run-empire-v2.js:2433-2437`: `requestedDashboardSymbol = normalizeRuntimeSymbol('BTC-USD')` → `dashboardSymbol = 'BTC-USD'`.
3. **Stock/equity classification** — `run-empire-v2.js:2449-2456`: `isStockDashboardSymbol` is false for BTC-USD, and `looksLikeEquityTicker('BTC-USD')` is false because the regex `/^[A-Z]{1,5}$/` (`run-empire-v2.js:576-578`) does not match a symbol containing a dash. So the crypto path is taken.
4. **Broker selection** — `run-empire-v2.js:2460-2462`:
   ```js
   const cryptoHistoryBroker = this.sessionRouter
     ? this.sessionRouter.krakenAdapter
     : (this.kraken?.getBrokerName() === 'kraken' ? this.kraken : null);
   ```
   In scheduled mode `this.sessionRouter` is non-null (created unconditionally at `run-empire-v2.js:846`; `core/SessionRouter.js:59-60` throws unless mode is `static`/`scheduled`). `this.sessionRouter.krakenAdapter` is set once in `wire()` (`core/SessionRouter.js:145-146`) and never reassigned (grep shows only line 72 init `null` and line 146 assignment). Hence `cryptoHistoryBroker` is the Kraken adapter regardless of the active session.
5. **Instrument format** — `run-empire-v2.js:2504-2506`: `const symbol = this.assetManager ? this.assetManager.toSlashFormat(dashboardSymbol) : dashboardSymbol;`. `toSlashFormat('BTC-USD')` returns `'BTC/USD'` (`core/MultiAssetManager.js:106-112`). `this.assetManager` is initialized at boot (`run-empire-v2.js:2103`).
6. **Broker call** — `run-empire-v2.js:2508`: `await cryptoHistoryBroker.getCandles('BTC/USD', timeframe, limit)`. This lands on `brokers/KrakenIBrokerAdapter.js:317` (`getCandles`), which calls `this.toKrakenRestPair(symbol)` (line 319). `toKrakenRestPair` (`brokers/KrakenIBrokerAdapter.js:543-568`) resolves `BTC/USD` → canonical `BTC-USD` → `ASSET_REGISTRY['BTC-USD'].krakenRest` = `'XXBTZUSD'` (per `core/AssetRegistry.js:5`), then calls `getHistoricalOHLC('XXBTZUSD', interval, limit)`.

**Result:** the request reaches the **Kraken** broker with instrument **BTC/USD** (→ native pair **XXBTZUSD**).

## Candidate Set (examined 6 of 6 paths)

| Candidate broker/instrument | Verdict | Deciding evidence |
|---|---|---|
| Kraken via `this.sessionRouter.krakenAdapter` | **Supported** | run-empire-v2.js:2460-2462; SessionRouter.js:145-146 |
| Alpaca via `this.kraken` (stock-session value) | **Refuted** | the new code avoids `this.kraken` when sessionRouter exists; `this.kraken` is re-synced to `activeBroker` (run-empire-v2.js:1051,1996) so it is Alpaca during stock session, but is not used for crypto history |
| No broker / error path (`candles: []` + error) | **Refuted for scheduled mode** | would require `sessionRouter` null AND `this.kraken` not Kraken; in scheduled mode sessionRouter is non-null (run-empire-v2.js:846) |
| Instrument BTC-USD (dash) | **Refuted** | `toSlashFormat` converts to BTC/USD (MultiAssetManager.js:111); assetManager is set at boot (run-empire-v2.js:2103) |
| Instrument BTC/USD (slash) | **Supported** | run-empire-v2.js:2504-2506 |
| Native pair XXBTZUSD | **Supported** (what Kraken actually receives) | KrakenIBrokerAdapter.js:543-568; AssetRegistry.js:5 |

## Verification Gaps
- **No execution receipt:** this is a source-derived routing trace; the actual network-level success of the Kraken REST call is not observed. The question concerns routing, which is fully determined by source.
- I did not verify `this.assetManager` non-nullness at the precise runtime instant in every code path, though it is assigned during boot (run-empire-v2.js:2103) and is the only dependency that could change `BTC/USD` vs `BTC-USD`.
- `this.sessionRouter.krakenAdapter` connectivity during the stock session (whether the Kraken adapter is connected/authenticated while Alpaca is active) is not verified; this affects whether the REST call succeeds, not which broker/instrument it reaches.

## ADVERSARIAL_REVIEW_BLOCKING: no

The fix routes BTC-USD history to the dedicated Kraken adapter as intended; no defect found. Blocking is not warranted.

## SUBSTANTIVE RESOLUTION: none
(No substantive dispute; this is a single-reviewer independent collection with no prior findings.)

## WHAT I DID
Read `run-empire-v2.js:780-977` (session boot), `2426-2512` (fetchAndSendHistoricalCandles), `570-600` (looksLikeEquityTicker), `2103` (assetManager init); `core/SessionRouter.js:53-152` (constructor + wire); `core/MultiAssetManager.js:40-130` (toSlashFormat); `brokers/BrokerFactory.js:1-65`; `brokers/BrokerRegistry.js:1-40`; `brokers/KrakenIBrokerAdapter.js:300-360,540-583`; `core/WebSocketManager.js:290-320`; `core/AssetRegistry.js:5`. Ran git_diff, greps, find_definition, find_references.

## WHAT I DID NOT DO
Did not execute the program or run tests; no host-attested execution receipt was available. Did not verify live Kraken connectivity during the stock session.

## WHAT I ASSUMED
That the bot boots successfully in scheduled mode with a valid sessionRouter config (mode `scheduled`), so `this.sessionRouter` is non-null — supported by SessionRouter constructor validation (SessionRouter.js:59-60) and unconditional creation (run-empire-v2.js:846).

## WHY THIS VERDICT
The full control flow from dashboard message to `getCandles` shows the request reaches the Kraken adapter with BTC/USD (→XXBTZUSD). The diff's premise — that `this.kraken` can be Alpaca during a stock session and must not be used for crypto history — is confirmed by lines 1051/1996; the new code correctly bypasses it via `this.sessionRouter.krakenAdapter`. No misrouting exists.

## IF INCOMPLETE, WHY
Not incomplete for the routing question. The only unobserved aspect (live broker connectivity) is outside the question's scope.
