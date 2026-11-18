# Stop 2 continuation: history selection and current-price ownership

Recorded 2026-11-18 UTC against source HEAD
`d1de6b7ba7e0568d72d8117b8edcb73ed49d4c49`. Trey explicitly answered the repair
proposal **Keep investigating before production edits**, then said to make sure.
That is investigation authority only. No production source/config edit or restart
occurred.

The [native receipt](client-receipt.json), [execution record](client-run.json), and
[fixture](fixtures/client-ownership.cjs) extend the previous source trace. They
execute actual frontend functions and handlers in an isolated synthetic DOM and
transport, with chart-library calls captured. They do not constitute a connected
browser rendering, observed live mispricing, or a trading result.

## Confirmed behavior

| Path | Exact replay result | Current source |
| --- | --- | --- |
| Panel history loader | Server history ends at close 120. A successful second browser request ends at 1020, and the chart receives 1020. If that synthetic browser request fails, the same valid server history is rendered at 120. | `public/js/panels/chart-panel.js:2312-2333`; native fetch/normalization at `:215-234,253-267`. |
| Older dashboard history dispatcher | The real `historical_candles` handler passes the whole envelope. The older chart calls `.map` on it, records a load error, and makes zero series writes. Passing the envelope's array directly is a positive control and produces one valid series write. | `public/js/core.js:297-299`; `public/js/chart.js:1048-1053,1109-1111`. |
| Other-symbol price frame | BTC is selected and shared price starts at 108. A TSLA price 500 / RSI 22 frame produces no candle-series write because the panel rejects its asset, but shared price becomes 500 and the indicator bar shows RSI 22. | `public/js/core.js:175-193` mutates before `public/js/panels/chart-panel.js:2127-2129` filters the chart. |
| Other-symbol delta frame | BTC is selected and shared price starts at 108. A TSLA delta 105 changes shared price to 105 before dispatch; the panel correctly keeps the visible BTC header at 108. | `public/js/websocket.js:413-416,449-451`; panel selection at `public/js/panels/chart-panel.js:1386-1406`. |
| Historical correction emitted as a current delta | An incoming older candle's close 105 becomes a delta stamped at the fixed current clock, 90 seconds after that candle's start. With BTC selected, shared price and the visible header move from 108 to 105. | Incoming candle passed onward at `core/CandleProcessor.js:1195`; delta construction at `core/DashboardBroadcaster.js:211-216`; the socket and panel consumers above. |

The two synthetic history sources deliberately use clearly different prices to
identify which source wins; those values do not describe a real exchange response.
The history case starts without a displayed live price so the separate price-ratio
guard does not confound source selection. The delta case executes the actual send
expression and complete client socket/handler path; the surrounding broadcaster
admission and server relay were inspected separately, not executed as a live bot.

## Why these paths are reachable

- Both HTML routes exist at `ogzprime-ssl-server.js:184,196`. The older page loads
  `public/js/chart.js` at `public/unified-dashboard.html:3361`; V2 loads the panel
  at `public/unified-dashboard-v2.html:1171`. This establishes served source paths,
  not which page an operator currently has open.
- Bot messages fan out to authenticated dashboard clients without symbol filtering
  at `ogzprime-ssl-server.js:2181-2208`. The direct crypto frame broadcaster also
  filters connection/client type, not selected asset, at `:2272-2285`. View ownership
  cannot therefore be assumed to have been enforced before the browser handlers.
- Broker history already has a server route. Kraken's native rows become
  `{t,etime,o,h,l,c,v}` at `kraken_adapter_simple.js:333-370`, and the runner sends
  a symbol/timeframe/candles envelope at `run-empire-v2.js:2637-2657`. Stock REST
  mapping is at `server/stock-data-adapter.js:62-143`, with the server's direct
  historical envelope at `ogzprime-ssl-server.js:2034-2056`. The replay proves a
  valid supplied envelope is sufficient for the V2 loader when its duplicate fetch
  is unavailable; it does not certify every live REST response, requested span,
  error path or feed entitlement.

## Consequences for the proposed repair

The earlier proposal's frontend file list was incomplete: it must include
`public/js/websocket.js` because that producer of shared state acts before the
chart's asset check. Correct ownership must precede changes to shared price,
indicator readouts and chart state. A filter only inside the chart cannot correct
state that was already overwritten upstream.

Historical candle updates and current-price observations also need distinct source
identity and time semantics. Stamping an old correction with `Date.now()` makes
recency checks unable to distinguish it from a new observation. The narrow
timestamp/volume regression repair described in the earlier proposal does not
resolve this older delta path; both remain unapplied.

The history repair must align the envelope contract at both actual chart consumers.
Removing the browser fetch alone would leave the older chart unable to accept the
server envelope. The original asset/timeframe/OHLCV must survive delivery, and a
failed fetch must remain a visible unavailable condition rather than being replaced
with another frame or fabricated candle.

**Activation correction to the earlier plan:** the server uses
`express.static(path.join(__dirname, 'public'))` at `ogzprime-ssl-server.js:320` and
reads dashboard HTML on request at `:149-172`. Public JavaScript edits can therefore
be served on a subsequent request without a PM2 restart; browser caching affects
when an individual client refreshes. Keeping PM2 untouched does not keep an edited
frontend inactive. Any future approval/verification sequence must explicitly cover
the point at which reviewed frontend bytes are written to that served directory.
No frontend file has been edited in this investigation.

## Verification, review and limits

The final helper exited 0 with all compared source behaviors reproduced. Two
earlier invocations stopped on fixture setup errors: ambiguous unused volume-style
constant extraction, then a missing synthetic binding for the delta expression.
Their logs/command identities are retained locally; neither is counted as evidence
of bot behavior. The final fixture removes the unnecessary extraction and supplies
the actual expression's surrounding symbol/timeframe values. No production change
was made to get the replay to run.

Author review checked the full handlers, exact source hashes, final receipt values,
positive control, server fanout and served-file paths. No Jest, paid Mercury
dispatch, external panel vote, real WebSocket client, broker request, credential
read, RAG rebuild or PM2 action occurred. The inherited dirty files and previous
changelog suffix remain byte-identical; the
[source and preservation receipt](client-source-and-preservation.json) records the
comparison. Stop 2, live browser proof, broker-native
seven-frame coverage and the known timestamp/volume regression remain open.
