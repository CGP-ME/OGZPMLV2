Mercury recheck request: break the tightened broker runtime account identity fix after the first attack.

Question:
The first attack found that the runner still returned `{accountId:"default", accountIdSource:"default"}` and that SessionRouter/OrderExecutor could treat the default sentinel as present. Recheck the patched code and find any remaining sequence where SessionRouter, OrderExecutor, candle scope, or dashboard scope can use a missing/default account ID as if it were a verified account, leak Alpaca identity into Kraken scope, or silently drop a proven Alpaca identity.

Recheck scope:
- `brokers/AlpacaAdapter.js:48-80`
- `brokers/AlpacaAdapter.js:170-185`
- `brokers/AlpacaAdapter.js:558-568`
- `run-empire-v2.js:923-944`
- `run-empire-v2.js:1704-1749`
- `run-empire-v2.js:2175-2269`
- `core/OrderExecutor.js:63-95`
- `test/session-router-runtime-scope.test.js:66-86`
- `test/session-router-runtime-scope.test.js:176-205`
- `test/alpaca-adapter-candles.test.js:73-129`

Patch intent:
- Alpaca captures account identity only from verified `/v2/account` fields.
- Runner stores account identities per broker ID.
- `resolveBrokerAccountScope()` now returns null account fields when no verified/config identity is available, not the `default` sentinel.
- SessionRouter runtime scope now rejects missing/default account identity.
- OrderExecutor no longer falls back to static config account ID when SessionRouter is enabled and runner scope lacks account identity.

Attack constraints:
- Construct a failing state if one exists.
- Use broker switches, null adapter identity, stale config, `BROKER_ACCOUNT_ID=default`, and adapters without `getAccountIdentity()` as adversarial inputs.
- If the mechanism is closed, say exactly which code paths block the earlier attack.
