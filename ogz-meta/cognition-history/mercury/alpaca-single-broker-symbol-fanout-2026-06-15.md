Mercury, break my fix.

Target change:
- `run-empire-v2.js:174-192` adds `resolveSingleBrokerSubscriptionSymbols`.
- `run-empire-v2.js:2006-2028` changes disabled-SessionRouter single-broker market-data subscription from one `broker.tradingPair` subscription to all explicit `ALPACA_SYMBOLS`, and drops multi-symbol OHLC payloads that do not carry a symbol instead of assigning them to the first symbol.
- `test/single-broker-subscription-symbols.test.js:42-202` covers explicit Alpaca symbol fanout, refusal to invent Alpaca subscriptions from `TRADING_PAIR`, non-Alpaca single-symbol behavior, runtime subscription fanout, and symbol-less OHLC drop.

Attack request:
Find a state, input sequence, config shape, broker payload, or existing sibling path where this fix still routes Alpaca bars to the wrong symbol, drops valid bars, subscribes to the wrong symbol set, corrupts per-symbol CandleStore / SymbolTradingContext data, breaks non-Alpaca single-broker runtime, or creates a live eval path where configured `ALPACA_SYMBOLS` are not actually all observed.

Rules:
- Use the current code, not old docs.
- Cite exact file:line evidence.
- Do not answer by saying the tests pass.
- If the fix closes the mechanism, say what assumptions remain load-bearing.
- If you find a real issue, give the smallest root-cause patch shape.
