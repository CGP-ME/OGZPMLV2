Break this absolute position cap fix.

Scope:
- `core/OrderExecutor.js:418-475`
- `core/OrderExecutor.js:832-902`
- `test/order-executor-pause-gate.test.js:469-517`
- `test/session-router-runtime-scope.test.js:155-189`

Claim under attack:
1. `OrderExecutor` now reads `ABSOLUTE_POSITION_CAP` from the actual config path, `entryLogic.sizing.absoluteCapPercent`, not the stale `positionSizing.absoluteCapPercent` path.
2. Invalid or non-positive cap values fail loudly before entry planning instead of silently disabling the cap.
3. The cap is enforced on final entry `sizeUsd` after confidence sizing and confluence sizing.
4. The pre-order gate, order quantity, broker route, state open, MPM start, and ledger/trade receipt paths all consume the capped `entryPlan.sizeUsd` / executed entry plan size.
5. Direct `_buildEntryPlan()` callers cannot bypass the cap because it resolves the cap internally when `absoluteCapPercent` is not supplied.
6. Sibling scan found no other active source reader of `positionSizing.absoluteCapPercent`; remaining active cap config is `TradingConfig.entryLogic.sizing.absoluteCapPercent`, worker env propagation, and tests.

Use file:line evidence only. Find any state or input sequence where an entry can still exceed `entryLogic.sizing.absoluteCapPercent` after confidence and confluence multipliers, or where an old/stale cap path still controls active execution. Also identify whether this closes the underlying mechanism or only the symptom, and what new failure modes this fix introduces.
