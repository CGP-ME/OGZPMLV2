# Stop 2: observed analytics ownership — 2026-11-19

The candle broadcaster used candle color and repeatedly added the entire candle volume to CVD, including revisions and multiple frames. It also manufactured funding, liquidation volumes, whale events and participant labels. The original dashboard independently started seven random-data timers. Those paths competed with the already-existing Kraken public trade/book feed.

## Changes

- `core/DashboardBroadcaster.js` retains its existing per-symbol/timeframe divergence observations and removes the fabricated analytics producers, their state and unused volatility/helpers. The `CandleProcessor` and runner calls pass the native candle directly; price/volume arguments are no longer an alternate input.
- `core/CryptoMarketFeed.js` owns observed USD CVD, real large trade prints and book/trade internals. Its frames identify source, units, availability, observation window and timestamp. Reconnects start a new window rather than adding a new subscription snapshot to an old counter. Invalid external trade rows clear that asset's CVD with an error and unavailable frame; valid later rows begin a fresh window. Disconnects clear CVD/internals availability. These are dashboard observations and have no order, flatten, bot-halt or supervisor authority.
- Buy-only flow is not a numeric ratio of 99. The feed reports observed buy/sell notionals, an unavailable division when there are no sells, and actual dominant side. The browser displays `BUY ONLY` where supported by those observations. Spread is measured from bid/ask; the rolling trade window uses trade timestamps.
- `public/js/panels/edge-analytics.js` loses its random generators and duplicate internals/wall renderers; `public/js/core.js` loses those callers. Both supported pages use the existing `EdgeAnalyticsPanel` renderer, which matches selected asset/frame, accepts source-attributed observations, clears CVD on window/symbol changes and marks unsupported fields unavailable. Touched display catches report errors. Teardown unregisters actual socket/selection handlers.
- `ogzprime-ssl-server.js` stops caching/replaying the fabricated analytics. `config/internals.json` revision 14 removes `buySellRatioWhenNoSells` and `ConfigLoader` removes its required-field entry. This is removal of an obsolete fabricated value, not a new config owner or silent override.

## Verification

`fixtures/observed.cjs` executes the actual public-feed module with a synthetic socket boundary, actual `ConfigLoader`, actual runner and candle-processor call expressions, actual broadcaster, and both browser analytics modules with a DOM boundary. It runs only through `scripts/test-isolated.py`; no real credentials, network, journals, state or PM2 are present in that helper.

- `baseline.json` reproduces candle CVD inflation, manufactured analytics, seven random timers and ratio 99.
- `candidate.json` verifies the working candidate with inherited edits preserved. `pinned.json` repeats against the exact staged source, excluding unrelated inherited edits.
- Two buys at $100 minus one sell at $100 produce $100 CVD; all seven candle frames and repeated revisions emit no CVD. The existing divergence observation still emits.
- Buy-only observations, expired rolling-window trades, invalid side/null trade rows, valid recovery, disconnect and reconnect are exercised. A real-shaped $300,000 print emits one whale event. Reconnect CVD restarts from its new observations.
- The selected-asset browser renderer rejects other assets and candle-proxy sources, resets chart history across windows, renders `BUY ONLY`, leaves unfed fields unavailable and unregisters handlers on teardown.
- `served-browser.json` and panel-only screenshots record fresh public pages, actual selected values and honest unavailable states before backend activation. This does not claim the old running backend emits the new source metadata. Live numeric CVD remains an activation check.

Fixture corrections: the first runner context omitted its dashboard socket, which the real delegation copies into the broadcaster; the initial cache assertion named the wrong variable. Both fixture mistakes were corrected before accepted receipts. No production failure was concealed, no Jest added or run.

## Independent review and source identity

Mercury reviewed one neutral question about displayed CVD ownership, with max-tokens 7750 and no iteration ceiling. Candidate tree `7a8f9f8c37271f6d1655401424433fe06fd7191b`, base commit `edd54eb574279460fae220b11890092cb1eea1a6`. Full answer in `mercury-answer.md`; command, staged/working hashes, inherited harness hash and manifest in the adjacent receipts. Result: no_break_found, nonblocking, 29 tool calls, 18 iterations, $0.060224. Metadata warnings remain recorded; this was one selected reviewer, not a three-seat consensus.

Mercury did not execute and named the selector-format gap. The served browser receipt verifies literal `BTC-USD` and `TSLA` selector values; the separate execution proof exercises the producer-to-consumer contract. The older inline legacy HTML is not the active `/unified-dashboard-legacy.html` implementation: the server already routes that URL to `serveDashboardV2` at `ogzprime-ssl-server.js:212`. No rewrite or deletion of that separate file was bundled here.

Kraken's [public v1 trade documentation](https://docs.kraken.com/exchange/api-reference/spot-websocket-v1/trade) describes an initial recent-trades snapshot. A read-only public socket observation also confirmed current rows carry price, quantity, broker timestamp and `b`/`s` side. The display is explicitly an observed window, not a complete daily trade history or data-gap reconstruction.

## Activation and limits

No PM2 process restarted. Fresh browser loads receive the static changes; server/feed and bot broadcaster changes await separately approved activation. After activation, verify live source-attributed CVD, no candle-proxy emissions, native Bitcoin history during an Alpaca session, all seven native chart frames, and canonical config provenance. Preserve current positions/journals.

Funding, liquidation positions, sentiment and participant identity have no connected real source; they remain unavailable. This repair does not invent integrations for them or certify the existing divergence heuristic. The old disabled Kraken socket stub in the server was traced during this pass and remains a separate orphan-removal change. RAG freshness is not claimed; Mercury reviewed the exact source snapshot.
