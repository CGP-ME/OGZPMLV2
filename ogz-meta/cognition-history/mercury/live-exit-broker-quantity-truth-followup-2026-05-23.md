# Mercury follow-up attack prompt: live exit broker quantity truth

The prior Mercury answer assumed `ORDER_QUANTITY_UNIT=usd` and a platform `quantityUnit="usd"`. That assumption does not exist in current code.

Mechanical evidence:
- `core/OrderExecutor.js:61-69` `_orderQuantityUnit()` returns `shares` for stocks/equities/ETFs, `base` for crypto/forex/futures, and throws for anything else.
- `rg "ORDER_QUANTITY_UNIT|quantityUnit.*usd|return 'usd'" core foundation brokers test` has no production hits.
- `core/OrderRouter.js:123-140` passes the exact `amount` planned by OrderExecutor into the adapter.
- `brokers/AlpacaAdapter.js:218-253` submits that value as `qty` and returns `response.data.qty` as `amount`.
- `core/OrderExecutor.js:446-463` stores the broker response amount but keeps `quantityUnit` from the same broker order plan that was sent.

Re-run the attack under the real constraints: current `quantityUnit` can only be `shares` or `base`, and the active eval target is live stocks/Alpaca/TSLA using `shares`.

Question:
Find a real input sequence, if one exists, where the current patch still lets a live stock SELL/COVER place the wrong share count, corrupts `activeTrades.remainingOrderQuantity`, creates state/broker divergence after a partial exit, blocks a valid close unnecessarily, changes backtest/P0 behavior, or only papers over USD/current-price recalculation. If the prior unit-mismatch vector is not valid under current code, say that plainly and move to the next strongest real vector. Use exact file:line evidence.
