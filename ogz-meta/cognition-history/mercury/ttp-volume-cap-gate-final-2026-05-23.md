# Mercury final attack prompt - TTP 5% volume cap root check

Attack the final implementation of the Trade The Pool 5% previous-1m volume cap.

Current code under review:
- `core/EvalRuleEngine.js` lines 42-125:
  - Requires `timeframe === '1m'`.
  - Requires finite `percent` in `(0, 1]`.
  - Requires finite positive `maxReferenceAgeMs`.
  - Requires `entryPlan.quantityUnit === 'shares'`.
  - Requires finite positive `entryPlan.orderQuantity`.
  - Requires a candle source.
  - Fails closed on missing reference volume.
  - Calculates `maxAllowedShares = previousOneMinuteVolume * percent`.
  - Aggregates with `openingVolumeReservations` by symbol/reference candle key.
  - Always reserves allowed opening volume; there is no runtime reservation-disable branch.
- `core/EvalRuleEngine.js` lines 128-168:
  - Drops malformed/future candles.
  - Rejects stale latest 1m data.
  - If latest 1m volume is zero, falls back to the most recent earlier 1m candle with volume.
- `foundation/ConfigLoader.js` lines 173-185:
  - Configures eval/TTP volume-cap values.
  - `maxReferenceAgeMs` defaults to 180000.
  - `maxReferenceAgeLimitMs` is fixed at 300000.
- `foundation/ConfigLoader.js` lines 305-318:
  - Validates enabled TTP volume cap config and rejects loose reference-age config.
- `core/OrderExecutor.js` lines 166-181 and 337-345:
  - Runs `preOrderEntryGate || evalRuleEngine` before broker/webhook/state side effects.
- `test/order-executor-pause-gate.test.js` lines 303-347:
  - Proves `evalRuleEngine.check()` blocks before broker/webhook/state side effects.

Questions:
1. Can a single oversized live TSLA stock entry reach `orderRouter.sendOrder` when `EVAL_RULES_ENABLED=true`, `TTP_RULES_ENABLED=true`, `TTP_VOLUME_CAP_ENABLED=true`?
2. Can two smaller opening/add-on entries for the same symbol/reference 1m candle exceed 5% in aggregate?
3. Can missing, stale, future, malformed, zero-volume, wrong-timeframe, non-share, non-finite, or loose-config data produce an allow instead of a block?
4. Is this still a bandaid, or does it close the actual disqualification mechanism at the pre-order boundary? Be strict.
5. What residual risks remain, and are they code blockers or operational proof requirements?

Use exact file:line evidence. Classify each finding as real blocker, mitigated-by-code, false positive, or operational proof requirement.
