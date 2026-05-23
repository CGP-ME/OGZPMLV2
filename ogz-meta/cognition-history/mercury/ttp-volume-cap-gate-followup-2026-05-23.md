# Mercury follow-up attack prompt - TTP 5% volume cap after hardening

You previously found two blocking concerns in `core/EvalRuleEngine.js`:
- Aggregate bypass if `reserveOnAllow=false`.
- Stale 1m candles could be treated as valid reference volume.

Those were changed:
- `core/EvalRuleEngine.js` lines 50-67 now validates timeframe, percent, and max reference age.
- `core/EvalRuleEngine.js` lines 85-94 now fails closed on missing/stale reference volume.
- `core/EvalRuleEngine.js` lines 117-118 now always reserves allowed opening volume; there is no runtime reservation-disable branch.
- `core/EvalRuleEngine.js` lines 127-162 now rejects stale latest 1m candles before applying zero-volume fallback.
- `foundation/ConfigLoader.js` lines 173-184 now exposes only `percent`, `timeframe`, `fallbackToMostRecentVolume`, and `maxReferenceAgeMs`; no reservation-disable env exists.
- `foundation/ConfigLoader.js` lines 304-315 validates percent/timeframe/maxReferenceAgeMs when eval/TTP volume cap is enabled.
- `core/OrderExecutor.js` lines 166-181 and 337-345 still run the gate before broker/webhook/state side effects.

Attack this hardened version.

Questions:
1. Can a single oversized live stock entry still reach `orderRouter.sendOrder` when `EVAL_RULES_ENABLED=true`, `TTP_RULES_ENABLED=true`, `TTP_VOLUME_CAP_ENABLED=true`?
2. Can multiple small entries for the same symbol/reference candle still exceed 5% in aggregate?
3. Can missing, stale, zero-volume, future, malformed, or wrong-timeframe 1m candle data produce an allow instead of a block?
4. Is there any live order path in current code that bypasses `OrderExecutor._runPreOrderEntryGate`?
5. Did this hardening close the root disqualification mechanism, and what residual risks remain?

Use exact file:line evidence and classify findings as real blocker, mitigated-by-code, or residual operational risk.
