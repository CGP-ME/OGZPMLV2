# Mercury breach prompt - SessionRouter broker intent idempotency

Break this patch. Do not validate it. Find a breach, bypass, duplicate side effect, false audit claim, unsafe recovery state, or unnecessary machinery. If you cannot breach it, list the exact attack sequences you attempted and why each failed against current code.

Changed code under attack:
- `core/session-router/TransitionStore.js:178-334`
- `core/SessionRouter.js:291-383`
- `core/SessionRouter.js:850-1177`
- `test/session-router-transition-journal.test.js:191-304`
- `test/session-router-transition-store.test.js:378-510`

Patch behavior:
- SessionRouter-controlled broker/feed side effects are now wrapped by `_executeBrokerIntent()`.
- Wrapped calls: `unsubscribeAll`, `removeAllListeners('ohlc')`, `orderRouter.registerBroker`, `subscribeToCandles`.
- `TransitionStore` appends `BROKER_INTENT_RECORDED` before the side effect.
- It appends `BROKER_INTENT_COMMITTED` after a successful side effect.
- If side effect throws, it appends `BROKER_INTENT_FAILED`.
- If side effect succeeds but commit fails, `SessionRouter` marks transition recovery required and leaves the broker intent uncommitted.
- If a replay sees an already committed intent, it skips the duplicate side effect.
- If a replay sees a recorded-uncommitted or failed intent, it throws before side effect.
- Intent ID identity includes transitionId, epoch, from, to, brokerId, accountId, executionMode, action, symbol, timeframe, and sorted symbols.

Attack objectives:
1. Produce a path where any wrapped broker/feed side effect occurs before `BROKER_INTENT_RECORDED`.
2. Produce a path where a committed replay performs the broker/feed side effect a second time.
3. Produce a path where recorded-uncommitted replay performs the broker/feed side effect instead of failing closed.
4. Produce a path where failed intent replay performs the broker/feed side effect instead of failing closed.
5. Produce two distinct intents that collide to the same intentId, or the same intent that gets two different IDs.
6. Produce a path where target activation, OHLC attachment, lock release, or trading resume happens before required broker intents are committed.
7. Produce a path where the audit trail lies about a completed broker side effect.
8. Identify any added machinery that is unnecessary for this root cause and should be removed.

Rules:
- Use exact current file:line evidence.
- Treat stale specs and comments as non-evidence unless current code supports them.
- Do not assume broker adapter behavior not visible in this patch.
- Do not praise. Attack.
