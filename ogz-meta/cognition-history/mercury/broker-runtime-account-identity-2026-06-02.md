Mercury attack request: break the broker runtime account identity fix.

Question:
Find an input sequence or runtime state where this change still lets dashboard/runtime scope lie about the owning account, leaks one broker account identity into another broker's scope, treats the `default` sentinel as a real account, or silently drops account identity even though Alpaca proved it. Also answer the architecture question: did this close the underlying mechanism, or only the symptom, and what new failure modes did it introduce?

Scope to inspect:
- `foundation/IBrokerAdapter.js:268-275`
  - New optional `getAccountIdentity()` hook. It must be non-breaking for adapters that cannot prove identity.
- `brokers/AlpacaAdapter.js:48-80`
  - Constructor account-id cleaning and `_captureAccountIdentity()`.
- `brokers/AlpacaAdapter.js:170-185`
  - `/v2/account` balance call now captures identity from the verified response.
- `brokers/AlpacaAdapter.js:558-568`
  - `getAccountIdentity()` return shape.
- `run-empire-v2.js:923-944`
  - SessionRouter transition promotes active broker account identity before dashboard runtime scope sync.
- `run-empire-v2.js:1246-1253`
  - Runner config now carries `accountIdSource`.
- `run-empire-v2.js:1704-1712`
  - Initial SessionRouter active broker promotion after router start.
- `run-empire-v2.js:1735-1749`
  - Single-broker connect promotion before REST hydrate/subscription.
- `run-empire-v2.js:2175-2269`
  - `getCandleScopeEnvelope()`, broker-keyed account identity registry, promotion, and resolution.
- `test/alpaca-adapter-candles.test.js:73-129`
  - Regression coverage for captured and missing Alpaca account identity.

Known context:
- Before this fix, live TSLA/Alpaca `state_update` showed `runtimeScopeStatus:"incomplete"` and `runtimeScopeMissing:["accountId"]` because ConfigLoader defaulted `BROKER_ACCOUNT_ID` to `default`.
- Setting a fake env account value is banned. The intended source is the broker account endpoint when available.
- SessionRouter can switch between Alpaca and Kraken. The fix must not carry Alpaca account identity into Kraken scope.
- If a broker cannot prove account identity, the correct behavior is honest incomplete scope, not a guessed account.

Attack constraints:
- Do not validate by agreement. Construct a failing state if one exists.
- Treat stale broker identity, SessionRouter flips, adapter methods returning null, account payloads with only `account_number`, and configured `BROKER_ACCOUNT_ID=default` as adversarial cases.
- If you call a finding false positive, cite exact code behavior that blocks it.
