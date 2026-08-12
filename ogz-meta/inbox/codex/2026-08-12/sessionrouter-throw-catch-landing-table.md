# SessionRouter Throw/Catch Landing Table

Date: 2026-08-12
Scope: Execution receipt for the SessionRouter catch-audit amendment.
Runtime files changed: `core/SessionRouter.js`, `run-empire-v2.js`, `core/OrderExecutor.js`.

## Catch Surgery

| Site | Before | After | Receipt |
| --- | --- | --- | --- |
| `core/SessionRouter.js:234-236` scheduled transition interval `.catch` | `console.error` only; recurring `_checkTransition()` rejection could continue every interval without containment. | Routes through `_routeScheduledTransitionFailure()`, enters failed-safe, pauses trading through StateManager, emits `SESSION_ROUTER_FAILED_SAFE_HALT`; routing failure emits `SESSION_ROUTER_TRANSITION_CHECK_ROUTE_HALT`. | `test/session-router-fail-safe.test.js` fault-injects rejected `_checkTransition()` and asserts failed-safe, pause, halt trace, no route failure. |
| `run-empire-v2.js:1001-1011` SessionRouter transition consumer catch | `console.error` plus optional dashboard broadcast, then normal transition log. | Calls `_routeSessionTransitionScopeSyncFailure()`, keeps last-good dashboard scope until replacement succeeds, emits `SESSION_ROUTER_TRANSITION_SCOPE_HALT`, broadcasts halt reason, pauses trading with source `session_router_transition_scope`; pause failure emits `SESSION_ROUTER_TRANSITION_SCOPE_PAUSE_HALT_FAILED`. | `test/single-broker-subscription-symbols.test.js` invokes the routing helper and asserts trace, broadcast, pause, and no `clearDashboardRuntimeScope()`. |
| `core/SessionRouter.js:414-425` nested transition-lock recovery mark catch | `console.error` only after recovery marking itself failed. | Emits max-priority `SESSION_ROUTER_TRANSITION_RECOVERY_HALT` trace and `transition_lock_recovery_mark_failed` event with transition id/epoch/from/to. | Source receipt: `core/SessionRouter.js:406-425`. |

## Mercury Break Closure

Mercury/Fable/Kimi found one real post-surgery break before final convergence:
`StateManager.pauseTrading()` could fail inside `_enterFailedSafe()`, leaving
`StateManager.isTrading` true while `failedSafeMode` stopped future transition
checks. That would keep entries live on stale session scope.

Closure:

| Layer | Fix | Receipt |
| --- | --- | --- |
| `core/SessionRouter.js:330-342`, `:958-965` | Failed-safe now records a local entry-block reason/at and exposes `getEntryBlockStatus()` whenever `failedSafeMode` is true, independent of StateManager pause success. | `test/session-router-fail-safe.test.js` asserts unconfirmed pause still returns blocked entry status. |
| `run-empire-v2.js:2836-2883` | Candle-close entry analysis checks SessionRouter local block before `analyzeAndTrade()` and returns `session_router_failed_safe_entry_block`; exits remain handled by the exit monitor and direct exit execution. | `test/single-broker-subscription-symbols.test.js` asserts analysis is not called under failed-safe entry block. |
| `run-empire-v2.js:2930-2955` | Runner `executeTrade()` blocks only `BUY`/`SELL_SHORT`; `SELL`/`COVER` bypass the entry block and forward to `OrderExecutor`. | `test/single-broker-subscription-symbols.test.js` asserts direct BUY is refused and direct SELL returns through the executor mock. |
| `core/OrderExecutor.js:48-50`, `:292-322`, `:2656-2678` | Direct OrderExecutor entry calls also consult runner-owned SessionRouter status before broker/state mutation; exit actions skip the entry block. | `test/order-executor-pause-gate.test.js` asserts direct `SELL_SHORT` is blocked and direct `SELL` reaches exit planning without consulting SessionRouter entry status. |

Final adversarial receipt: Mercury run
`ogz-meta/cognition-history/mercury-runs/2026-08-12.jsonl:5` ended with Kimi
`FINAL_VERDICT: pass`, `FINAL_BLOCKING: no`. The focused run-check artifact was
`ogz-meta/cognition-history/mercury-execution/2026-08-12T01-37-57-350Z-focused-tests.log:1-23`.

## Catch Landing Census

| Site | Landing behavior after this commit | Classification |
| --- | --- | --- |
| `core/SessionRouter.js:227-232` initial activation catch | Logs, enters failed-safe, emits halt trace, then rethrows startup failure. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:237-248` scheduled interval catch | Routes unexpected `_checkTransition()` rejection to failed-safe halt; route failure emits a second halt trace. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:280-284` transition-check phase catch | Enters failed-safe and emits halt trace. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:406-425` transition lock release failure catch | Logs, marks recovery required; if marking fails, emits halt trace/event. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:516-523` broker side-effect catch | Records broker intent failure; if record fails, throws compound error to transition failed-safe; otherwise rethrows to failed-safe. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:528-541` broker intent commit catch | Marks recovery required; throws compound completed-but-uncommitted error to transition failed-safe. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:944-951` broker REST reconciliation catch | Records `SESSION_BROKER_RECONCILE_FAILED`, then rethrows to transition failed-safe. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:976-980` failed-safe journal catch | Failed-safe continues with halt trace/event/pause after journal failure. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:1005-1009` failed-safe pause catch | Captures pause failure, checks actual pause state, emits fallback event; if still unconfirmed, emits unconfirmed halt trace. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:1122-1125` transition-to-stocks catch | Logs and enters failed-safe with transition context. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:1183-1197` per-trade force-close catch | Accumulates per-trade failures; aggregate failure records `SESSION_SOURCE_FLAT_FAILED` and lands in transition failed-safe. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:1257-1260` transition-to-crypto catch | Logs and enters failed-safe with transition context. | `SCREAM-AND-ROUTE` |
| `core/SessionRouter.js:1389-1399` transition-store status catch | Projects status as `RECOVERY_REQUIRED`, `freezeNewEntries: true`, with safe-mode reason. | `SCREAM-AND-ROUTE` |
| `run-empire-v2.js:1001-1004` transition consumer catch | Emits halt trace, broadcasts halt, pauses trading; no success log. | `SCREAM-AND-ROUTE` |

## 54 Throw Rows

| # | Throw site | Producer | Throw reason | Landing catch | Landing behavior | Classification | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `core/SessionRouter.js:54` | constructor config | invalid routing mode | none inside SessionRouter | constructor rejects; runner startup fatal if misconfigured | boundary fatal | keep |
| 2 | `core/SessionRouter.js:57` | constructor config | invalid static session | none inside SessionRouter | constructor rejects; runner startup fatal if misconfigured | boundary fatal | keep |
| 3 | `core/SessionRouter.js:106` | constructor config | missing stock symbols | none inside SessionRouter | constructor rejects; runner startup fatal if misconfigured | boundary fatal | keep |
| 4 | `core/SessionRouter.js:114` | constructor config | missing crypto symbols | none inside SessionRouter | constructor rejects; runner startup fatal if misconfigured | boundary fatal | keep |
| 5 | `core/SessionRouter.js:162` | `_sourceTradeCloseAction()` from source force-close | action/direction mismatch | `core/SessionRouter.js:1183-1197` then `:1257-1260` | per-trade failure aggregated, `SESSION_SOURCE_FLAT_FAILED`, failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 6 | `core/SessionRouter.js:167` | `_sourceTradeCloseAction()` from source force-close | unprovable source close direction | `core/SessionRouter.js:1183-1197` then `:1257-1260` | per-trade failure aggregated, `SESSION_SOURCE_FLAT_FAILED`, failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 7 | `core/SessionRouter.js:172` | `_closeSourceTradeThroughExecution()` | missing executeTrade | `core/SessionRouter.js:1183-1197` then `:1257-1260` | per-trade failure aggregated, `SESSION_SOURCE_FLAT_FAILED`, failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 8 | `core/SessionRouter.js:178` | `_closeSourceTradeThroughExecution()` | no last-known price | `core/SessionRouter.js:1183-1197` then `:1257-1260` | per-trade failure aggregated, `SESSION_SOURCE_FLAT_FAILED`, failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 9 | `core/SessionRouter.js:196` | `_closeSourceTradeThroughExecution()` after executeTrade | execution did not remove active source position | `core/SessionRouter.js:1183-1197` then `:1257-1260` | per-trade failure aggregated, `SESSION_SOURCE_FLAT_FAILED`, failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 10 | `core/SessionRouter.js:211` | `start()` preflight | missing broker adapters | none inside SessionRouter | `start()` rejects before interval; runner startup fatal path owns boot failure | boundary fatal | keep |
| 11 | `core/SessionRouter.js:260` | `_targetSessionFromPhase()` | missing `isRTH` | `core/SessionRouter.js:227-232` on startup or `:280-284` on transition check | failed-safe halt then startup rethrow or transition containment | `SCREAM-AND-ROUTE` | keep |
| 12 | `core/SessionRouter.js:263` | `_targetSessionFromPhase()` | phase contradicts `isRTH=true` | `core/SessionRouter.js:227-232` or `:280-284` | failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 13 | `core/SessionRouter.js:266` | `_targetSessionFromPhase()` | RTH phase contradicts `isRTH` | `core/SessionRouter.js:227-232` or `:280-284` | failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 14 | `core/SessionRouter.js:365` | `_beginTransitionContext()` | transition lock API unavailable | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 15 | `core/SessionRouter.js:372` | `_beginTransitionContext()` | transition lock refused | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 16 | `core/SessionRouter.js:387` | `_releaseTransitionLock()` | release API unavailable | transition try catch or `core/SessionRouter.js:406-425` | transition failed-safe, or recovery-required halt if failure happens during final cleanup | `SCREAM-AND-ROUTE` | keep |
| 17 | `core/SessionRouter.js:396` | `_releaseTransitionLock()` | release failed | transition try catch or `core/SessionRouter.js:406-425` | transition failed-safe, or recovery-required halt if failure happens during final cleanup | `SCREAM-AND-ROUTE` | keep |
| 18 | `core/SessionRouter.js:441` | `_recordTransitionEvent()` | transition journal unavailable | transition try catch or `core/SessionRouter.js:976-980` | transition failed-safe, or failed-safe continues with degraded journal and halt trace | `SCREAM-AND-ROUTE` | keep |
| 19 | `core/SessionRouter.js:444` | `_recordTransitionEvent()` | transition context missing id/epoch | transition try catch or `core/SessionRouter.js:976-980` | transition failed-safe, or failed-safe continues with degraded journal and halt trace | `SCREAM-AND-ROUTE` | keep |
| 20 | `core/SessionRouter.js:455` | `_brokerIntentDetails()` | broker intent missing id/epoch | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 21 | `core/SessionRouter.js:469` | `_brokerIntentDetails()` | broker intent missing required fields | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 22 | `core/SessionRouter.js:491` | `_executeBrokerIntent()` | intent store unavailable | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 23 | `core/SessionRouter.js:494` | `_executeBrokerIntent()` | missing broker execution function | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 24 | `core/SessionRouter.js:507` | transition store replay guard | pending broker intent exists | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 25 | `core/SessionRouter.js:510` | transition store replay guard | failed broker intent exists | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 26 | `core/SessionRouter.js:521` | broker side-effect catch | broker failed and failure journal failed | `core/SessionRouter.js:1122-1125` or `:1257-1260` | compound error enters transition failed-safe | `SCREAM-AND-ROUTE` | keep |
| 27 | `core/SessionRouter.js:539` | broker intent commit catch | side effect completed, commit failed, recovery mark failed | `core/SessionRouter.js:1122-1125` or `:1257-1260` | compound recovery error enters transition failed-safe | `SCREAM-AND-ROUTE` | keep |
| 28 | `core/SessionRouter.js:541` | broker intent commit catch | side effect completed, commit failed | `core/SessionRouter.js:1122-1125` or `:1257-1260` | completed-but-uncommitted error enters transition failed-safe | `SCREAM-AND-ROUTE` | keep |
| 29 | `core/SessionRouter.js:555` | `_assertTransitionStoreStartSafe()` | transition store requires recovery before start | none inside SessionRouter | startup rejects before activation; recovery status blocks boot | boundary/recovery fatal | keep |
| 30 | `core/SessionRouter.js:568` | `_currentTimeframe()` | missing runtime timeframe | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt before broker mutation continues | `SCREAM-AND-ROUTE` | keep |
| 31 | `core/SessionRouter.js:575` | `_candidatePatternMemories()` | pattern memory unavailable | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 32 | `core/SessionRouter.js:588` | `_patternMemoryOwner()` | multiple switchable memory owners | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 33 | `core/SessionRouter.js:598` | `_patternMemoryOwner()` | owner lacks handoff API | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 34 | `core/SessionRouter.js:606` | `_sessionPatternScope()` | missing target symbol list | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 35 | `core/SessionRouter.js:630` | `_handoffPatternMemory()` | pattern memory unavailable | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt before target broker mutation | `SCREAM-AND-ROUTE` | keep |
| 36 | `core/SessionRouter.js:647` | `_handoffPatternMemory()` | handoff missing storage path confirmation | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 37 | `core/SessionRouter.js:650` | `_handoffPatternMemory()` | handoff refused switch | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 38 | `core/SessionRouter.js:654` | `_handoffPatternMemory()` | handoff target mismatch | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 39 | `core/SessionRouter.js:770` | `_attachActiveOhlcCallback()` | OHLC callback missing | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 40 | `core/SessionRouter.js:773` | `_attachActiveOhlcCallback()` | adapter cannot attach callback | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 41 | `core/SessionRouter.js:776` | `_attachActiveOhlcCallback()` | missing transition epoch | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 42 | `core/SessionRouter.js:781` | `_attachActiveOhlcCallback()` | adapter missing broker identity for OHLC fence | `core/SessionRouter.js:1122-1125` or `:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 43 | `core/SessionRouter.js:803` | `_fetchBrokerRestSnapshot()` | broker REST method unavailable | `core/SessionRouter.js:944-951` then transition catch | records reconcile failure, rethrows to failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 44 | `core/SessionRouter.js:879` | `_fetchBrokerRestSnapshot()` | `getPositions()` returned non-array | `core/SessionRouter.js:944-951` then transition catch | records reconcile failure, rethrows to failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 45 | `core/SessionRouter.js:884` | `_fetchBrokerRestSnapshot()` | `getOpenOrders()` returned non-array | `core/SessionRouter.js:944-951` then transition catch | records reconcile failure, rethrows to failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 46 | `core/SessionRouter.js:889` | `_fetchBrokerRestSnapshot()` | `getBalance()` returned non-object | `core/SessionRouter.js:944-951` then transition catch | records reconcile failure, rethrows to failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 47 | `core/SessionRouter.js:892` | `_fetchBrokerRestSnapshot()` | `getBalance()` empty object | `core/SessionRouter.js:944-951` then transition catch | records reconcile failure, rethrows to failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 48 | `core/SessionRouter.js:928` | `_reconcileBrokerRestBeforeActivation()` | unsafe broker positions/orders | `core/SessionRouter.js:944-951` then transition catch | records reconcile failure, rethrows to failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 49 | `core/SessionRouter.js:1066` | `_transitionToStocks()` pause verification | pauseTrading did not pause | `core/SessionRouter.js:1122-1125` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 50 | `core/SessionRouter.js:1152` | `_transitionToCrypto()` pause verification | pauseTrading did not pause | `core/SessionRouter.js:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 51 | `core/SessionRouter.js:1174` | `_transitionToCrypto()` source flat guard | force close disabled with active source positions | `core/SessionRouter.js:1257-1260` | records source-flat context before failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 52 | `core/SessionRouter.js:1197` | `_transitionToCrypto()` source close aggregate | one or more source closes failed | `core/SessionRouter.js:1257-1260` | records `SESSION_SOURCE_FLAT_FAILED`, failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 53 | `core/SessionRouter.js:1234` | `_transitionToCrypto()` crypto subscribe guard | cryptoSymbols empty | `core/SessionRouter.js:1257-1260` | transition failed-safe halt | `SCREAM-AND-ROUTE` | keep |
| 54 | `core/SessionRouter.js:1275` | `_activateCrypto()` crypto activation guard | cryptoSymbols empty | `core/SessionRouter.js:227-232` during startup/static activation | initial activation failed-safe halt, then startup rethrow | `SCREAM-AND-ROUTE` | keep |

## Rethrow Rows

These are not counted in the 54 `throw new Error` rows, but their landings were checked:

| Rethrow site | Landing | Behavior |
| --- | --- | --- |
| `core/SessionRouter.js:232` | runner startup fatal path | initial activation already entered failed-safe before rethrow |
| `core/SessionRouter.js:523` | transition catch | broker intent failure was recorded or compound-thrown before rethrow |
| `core/SessionRouter.js:951` | transition catch | broker reconcile failure was recorded before rethrow |

## Receipts

- `rg -n "throw new Error" core/SessionRouter.js` -> 54 rows.
- `rg -n "catch \\(|catch\\(" core/SessionRouter.js run-empire-v2.js` -> catch census after surgery.
- `npm test -- --runTestsByPath test/session-router-fail-safe.test.js test/single-broker-subscription-symbols.test.js test/order-executor-pause-gate.test.js --runInBand` -> pass, 126 tests.
