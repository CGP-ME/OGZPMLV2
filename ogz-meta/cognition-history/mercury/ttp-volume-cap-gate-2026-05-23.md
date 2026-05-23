# Mercury attack prompt - TTP 5% previous-1m volume cap gate

You are Mercury. Attack this change adversarially. Do not confirm it politely.

Change under review:
- `core/EvalRuleEngine.js` lines 1-192 adds a pre-order eval rule engine.
- `foundation/ConfigLoader.js` lines 45-52, 173-186, 304-312 wires config for `EVAL_RULES_ENABLED`, `TTP_RULES_ENABLED`, and the TTP volume cap values.
- `run-empire-v2.js` lines 251-253 and 1102-1109 constructs `EvalRuleEngine` with `resolvedConfig.config.evalRules` and `getSymbolTimeframeCandles(symbol, timeframe)`.
- `run-empire-v2.js` lines 1142-1144 injects that engine into OrderExecutor.
- `core/OrderExecutor.js` lines 166-181 and 337-345 call the gate before broker/webhook/state side effects.

Rule being implemented:
- Trade The Pool: opening or add-on volume for an instrument must not exceed 5% of the previous one-minute candle volume.
- If the previous minute has no trades, use the most recent one-minute candle with volume.
- Multiple smaller orders must not bypass the cap.

Attack questions:
1. Construct an input sequence where an oversized live stock entry gets through despite `EVAL_RULES_ENABLED=true`, `TTP_RULES_ENABLED=true`, and `TTP_VOLUME_CAP_ENABLED=true`.
2. Construct an input sequence where two allowed-by-themselves entries bypass the 5% aggregate cap for the same symbol/reference candle.
3. Find any path where missing or stale 1m candle truth allows the order instead of failing closed.
4. Find any asset-class, symbol, timeframe, timestamp, volume, or config edge case where the rule lies about the broker reality or blocks the wrong target.
5. Did this close the underlying disqualification mechanism, or only the symptom? What new failure modes did it introduce?

Use exact file:line evidence. If a concern depends on a runtime assumption, state the assumption and cite the code that makes it plausible.
