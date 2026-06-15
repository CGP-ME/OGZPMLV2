Mercury response summary for `alpaca-single-broker-boot-hydration-fanout-2026-06-15.md`.

Verdict: no accepted defect in the hydration patch.

Mercury proposed changing `resolveSingleBrokerSubscriptionSymbols` to use `ALPACA_SYMBOLS` whenever present, regardless of `brokerConfig.id`.

Rejected patch shape:
- A non-Alpaca broker must not hydrate or subscribe Alpaca symbols just because `ALPACA_SYMBOLS` exists in the environment.
- `test/single-broker-subscription-symbols.test.js` explicitly covers non-Alpaca single-symbol behavior, and this slice preserves that contract.
- Subscription and hydration now both call the same resolver, so they remain aligned for disabled-SessionRouter runtime.

Remaining load-bearing assumption:
- Multi-symbol stock fanout is owned by explicit `BROKER=alpaca` plus explicit `ALPACA_SYMBOLS`.
