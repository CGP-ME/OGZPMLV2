Re-attack the updated watchlist ticker-price contract.

Scope:
- public/js/panels/watchlist-strip.js lines 87-99, 529-570, 611-645, 737-780
- test/watchlist-symbol-match.test.js lines 7-132

Current implementation:
- WatchlistStrip consumes both `price` and `ticker_price` frames through `onPriceEvent`.
- It records the actual Socket object in `state.socketHandlerSocket`.
- It registers handlers when `state.socketHandlerSocket !== socket`, so repeated init() with the same Socket does not duplicate handlers, but a replaced Socket gets the handlers.
- teardown() clears the temporary position-sync interval and DOM state, but does not reset socketHandlerSocket because the shared Socket has no unregister API.

Attack objectives:
1. Find a reachable sequence where repeated init(), teardown(), and init() duplicates handlers on the same Socket or misses handlers on a replaced Socket.
2. Find a reachable sequence where the position-sync interval leaks or fails to restart after teardown.
3. Find a concrete `ticker_price` frame produced by `server/dashboard-ticker-frame.js` that this handler ignores even though it should update a default watchlist card.
4. Find a concrete default-watchlist sequence where `price` or `ticker_price` updates the wrong symbol or broker card.
5. Find a concrete test blind spot that still gives false confidence after the new tests.

Rules:
- Do not validate the implementation. Break it.
- Use reachable code paths only.
- Cite exact file:line evidence.
- If a failure requires a producer frame shape, cite the producer code path and exact fields.
- Distinguish default dashboard watchlist failures from hypothetical custom duplicate-broker watchlists.
