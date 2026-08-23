# Broker-Proof Wind-Down Rung — HOLD receipt (2026-08-22, Fable lane)

Mandate: Trey's brief "BROKER-PROOF WIND-DOWN RUNG — boundary-flat is proven at the broker, never in the ledger." Prerequisite for live directionFilter=both. Trey Doctrine (Fable lane) applied.

## HOLD reason (one sentence)

The brief's flatten premise — "any standing leg -> flatten through the SAME `_closeSourceTradeThroughExecution` path (real executeTrade, no special order path)" — cannot flatten a broker leg that has no state record, because the real exit path refuses it by design; the proof half of the rung is built and probed, the flatten half is blocked on a ruling.

## Producer evidence (file:line, all read this session)

- `core/OrderExecutor.js:2492-2496` `_buildExitPlan` -> `_findExitTrade(decision, symbol)`; returns `null` when no open state trade matches.
- `core/OrderExecutor.js` `_findExitTrade`: filters `stateManager.getTradesBySymbol(symbol)` by opening action; tradeId miss -> `EXIT_TRADE_ID_MISS_REFUSAL` trace, returns `null`.
- `core/OrderExecutor.js:3259-3268` `if (isExitAction && !exitPlan)` -> `KILL-5: SELL with no matching BUY` / `COVER with no matching SELL_SHORT` -> `ORDER_BLOCKED` trace -> `blockedReturn(haltReason)` (`success:false`, no broker order).
- `core/SessionRouter.js:181-211` `_closeSourceTradeThroughExecution` (pre-change) ignored executeTrade's return and proved closure only by `activeTrades` no longer containing the id — vacuous for an orphan that was never in state.
- Scope/size for any exit come from the stored trade (`_buildExitPlan`: brokerId, accountId, assetClass, executionMode, timeframe, `remainingOrderQuantity`, quantity unit); none exist for a ghost leg.

Consequence: as first written, the rung would have journaled `SESSION_STALE_BROKER_ORPHAN_FLATTENED` for a leg still standing. Fixed this session (see WHAT I DID 4). The boundary was never at risk of a false flat because the post-flatten broker re-read governs `windDownFlattenComplete`.

## WHAT I DID

1. `core/SessionRouter.js` (+221/-24, uncommitted): `_proveSourceFlatAtBroker` runs after the existing state flatten in `_windDownForceFlatten`; reads the SOURCE broker via the pre-existing `_fetchBrokerRestSnapshot` (unmodified; diff hunks are at 473/496/517 only, the reader at 1302 is untouched); `windDownFlattenComplete = brokerProof.flat` where flat means the broker read returned `openPositions.length === 0 && openOrders.length === 0`; re-reads after any flatten attempt — a close call's success is never accepted as proof.
2. Broker read rejection at any stage -> `SESSION_WIND_DOWN_BROKER_FLAT_UNVERIFIABLE_HALT` (carries `err.reason` / `err.code`, e.g. `alpaca_positions_unavailable`) -> existing `_enterFailedSafe(... failureSource:'wind_down_broker_flat_proof')`. Boundary does not cross; process alive; no new throw.
3. `_readyForBoundarySwitch` no longer returns true on state count zero; it runs the rung and returns `windDownFlattenComplete` — both directions, every crossing.
4. Orphan handling: each standing leg becomes its own cell `STALE_BROKER_ORPHAN:<broker>:<symbol>`, traced `SESSION_WIND_DOWN_STALE_BROKER_ORPHAN_RECONCILIATION` (stages detected / flattened / flatten_failed; `RECONCILIATION` substring => ntfy priority max per `core/NtfyTraceNotifier.js:105-114`), routed through the same `_closeSourceTradeThroughExecution`. `_closeSourceTradeThroughExecution` now returns the executeTrade result as `execution`; the orphan path treats `execution.success === false` as flatten_failed (journal `SESSION_STALE_BROKER_ORPHAN_FLATTEN_FAILED`, never `_FLATTENED`). Tracked-trade behavior of that method is unchanged. `forceCloseOnSessionEnd=false` -> orphans traced, not closed.
5. `test/session-router-broker-proof-wind-down.test.js` (new, 6 probes): brief probe 1 (orphan through executeTrade with exact argv, proof from second read `[]`), probe 1 mirror (stocks->crypto, Alpaca short -> COVER), brief probe 2 (typed getPositions rejection -> ready=false, no transition, failedSafeMode=true, process alive, both halt traces), production-truth probe (executeTrade returns KILL-5 `success:false` -> flatten_failed journaled, `_FLATTENED` absent, boundary shut, no failed-safe), zero-state boundary still reads broker, post-flatten re-read still open keeps boundary shut.
6. Ran rechecks the reviewers demanded: pre-existing failure proven by path-limited stash at HEAD `343bb12c` (`test/session-router-stock-symbol-config.test.js:69` fails without my change: 1 failed / 9 passed); `_closeSourceTradeThroughExecution` body read and traced for an orphan id; NtfyTraceNotifier mapping read; `_fetchBrokerRestSnapshot` reuse confirmed by hunk ranges; null-adapter path traced (unknown session -> `_requireBrokerMethod` throw is caught inside `_readSourceBrokerSnapshot` -> unverifiable halt; unreachable by producers since `countdown.from` is always `crypto|stocks` from `_checkTransition`/`_handleWindDownCountdown`).

## Receipts (raw outputs in scratchpad `router-suites-raw.txt`, packet JSON alongside this file)

- `node --check core/SessionRouter.js` OK.
- 8 suites (7 existing + new): **107 passed / 1 failed / 108** — the 1 failure is the pre-existing `routerMode === 'static'` string assertion (renamed to `sessionRouterMode` in `a0afdc81`, 2026-08-12). Counted: 6/6 new probes pass; 101/102 existing unchanged from pre-change.
- Adversarial packet (`broker-proof-wind-down-review-packet.json`): Mercury leg NOT run — Inception key returns 401 on `/v1/chat/completions` for both `INCEPTION_API_KEY` and `_DEV` (`/v1/models` is unauthenticated and misled my first check; correction recorded). Fable-reviewer leg (kimi-k3 with Fable system prompt): `VERDICT: needs_more_evidence`, `CONSENSUS_BLOCKING: yes`. Kimi final adjudication: `CONSENSUS_BLOCKING: yes`. Their single load-bearing objection — the real exit path was never exercised against an orphan — was correct and led to the producer evidence above. Rechecks 1–6 they listed are done; the objection resolves into this HOLD, not a pass.

## WHAT I DID NOT DO

- Did not commit or push. Consensus blocking + broken premise = HOLD. Working tree holds my two paths only.
- Did not make orphans actually flatten in production — impossible through the mandated path without a state record; see Ruling needed.
- Did not touch `test/session-router-stock-symbol-config.test.js:69` (stale string assertion, pre-existing, outside mandate).
- Did not register broker legs into state, add a broker-direct close, or add any gate/flag/config.
- Did not rebuild the Mercury knowledge index (0 chunks; embeddings key also dead).

## ASSUMED

- `openOrders.length > 0` counts as not-flat (matches the activation reconcile's UNSAFE definition at `SessionRouter.js:1349-1357`); open orders retry each tick rather than failed-safe.
- A broker that has not yet reflected a fill on the immediate re-read yields flat=false this tick and re-proves next tick (self-healing, no failed-safe).
- Source adapter for wind-down is by session (`_sourceAdapterForSession`), not `activeBroker`, because `activeBroker` is null before first activation.

## Ruling needed from Trey (one question)

A ghost leg cannot be closed by the ordinary exit path because that path's law is "exits by tradeId; a trade that cannot prove its identity never trades" (KILL-5). Which is the Fourth-Shape fix?
(a) Register the ghost INTO state from broker truth (symbol, side, qty, entry price from the raw position, scope from the session runtime scope) as a quarantined trade record, so the ordinary exit path plans and closes it with real `remainingOrderQuantity`; or
(b) Keep the rung as built: ghost legs are detected, traced max-loud, journaled as flatten_failed, boundary stays shut — flatten is manual; or
(c) Something else in your words.
Until ruled, (b) is what the tree holds.

## Sibling files seen in `git status`, untouched

- `ogz-meta/Alignment/TREY-DOCTRINE-FABLE-LANE.md` (untracked, sibling session)
- `data/supervisor-ledger.jsonl` (runtime data)
