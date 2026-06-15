Mercury, break my fix.

Target change:
- `run-empire-v2.js:_getBootHydrationSymbols` now returns `resolveSingleBrokerSubscriptionSymbols(resolvedConfig.config.broker)` when SessionRouter is disabled.
- The prior behavior returned only `this.tradingPair`, which meant `ALPACA_SYMBOLS=TSLA,NVDA` would subscribe both symbols but boot-hydrate only TSLA.
- `test/single-broker-subscription-symbols.test.js` adds coverage that disabled-SessionRouter boot hydration returns every explicit Alpaca symbol.

Attack request:
Find a state, config shape, broker mode, SessionRouter-disabled runtime condition, or existing sibling path where this hydration change still leaves an explicitly configured Alpaca symbol cold, hydrates the wrong symbols, breaks non-Alpaca boot hydration, silently invents symbols from tradingPair, or causes subscription and hydration symbol sets to diverge.

Use current code with exact file:line evidence. Do not answer by saying tests pass. If broken, give the smallest root-cause patch shape.
