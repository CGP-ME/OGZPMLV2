# Mercury attack prompt - SessionRouter broker intent idempotency

Attack the current uncommitted SessionRouter broker-intent idempotency patch.

Scope:
- `core/session-router/TransitionStore.js:178-334`
- `core/SessionRouter.js:291-373`
- `core/SessionRouter.js:850-1177`
- `test/session-router-transition-journal.test.js:191-299`
- `test/session-router-transition-store.test.js:378-482`

Architecture rule:
Session switching is a saga. Broker/feed side effects must be durable and idempotent enough that crash/retry cannot duplicate broker submit/subscription/register work or hide an ambiguous side effect. This patch must be a root-cause fix, not a new overbuilt subsystem.

Current patch summary:
- Adds `data/session-router/broker-intents.jsonl` via `TransitionStore`.
- Builds deterministic `sr-<epoch>-<hash>` intent IDs from transitionId, epoch, brokerId, accountId, executionMode, action, symbol/timeframe/symbols.
- `recordBrokerIntent()` appends `BROKER_INTENT_RECORDED`.
- `commitBrokerIntent()` appends `BROKER_INTENT_COMMITTED`.
- `failBrokerIntent()` appends `BROKER_INTENT_FAILED` only when the broker side-effect function itself throws.
- `SessionRouter._executeBrokerIntent()` records before executing the existing broker call, commits after success, skips duplicate committed intents, and refuses recorded-uncommitted or failed intents before replay.
- Existing direct calls to `unsubscribeAll`, `removeAllListeners('ohlc')`, `orderRouter.registerBroker`, and `subscribeToCandles` in SessionRouter transitions/startup activation now route through `_executeBrokerIntent()`.

Attack goals:
1. Find any current-code path where SessionRouter can still call `unsubscribeAll`, `removeAllListeners('ohlc')`, `registerBroker`, or `subscribeToCandles` without a broker intent record first.
2. Find any replay/crash sequence where the same transition/epoch/broker/action/symbol/timeframe causes duplicate side effects instead of skip or fail-closed.
3. Find any sequence where a broker side effect succeeds but the journal lies by marking it `FAILED` instead of leaving recovery-required ambiguity.
4. Find any missing identity field that lets two distinct broker intents collapse to the same `intentId`, or the same intent get two IDs.
5. Find any missing account/broker/mode/timeframe/symbol scope in broker-intents that would make postmortem audit ambiguous.
6. Find any commit/release/resume ordering bug where target activation or resume can happen before broker intents are committed.
7. Find any overengineering or new failure mode introduced by this patch that is worse than the direct-call baseline.

Answer format:
- Findings first, severity ordered.
- Use exact file:line evidence.
- If a finding is false positive, say why with code proof.
- Explicitly answer whether this closes the duplicate broker intent mechanism or only hides it.
