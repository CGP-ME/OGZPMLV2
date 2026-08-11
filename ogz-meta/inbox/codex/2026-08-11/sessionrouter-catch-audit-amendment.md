# SessionRouter Catch Audit Amendment

Date: 2026-08-11
Scope: SessionRouter sweep amendment, read-only audit note.
Runtime files changed: none.

## Ruling

Catch blocks carry equal weight to throws in the SessionRouter sweep.

Every catch block in `core/SessionRouter.js` and direct SessionRouter consumers
must be classified:

- `SCREAM-AND-ROUTE`: trace/journal/ntfy/halt/quarantine/failed-safe route as
  severity demands, then either rethrow or make the routed containment explicit.
- `SWALLOW`: log-only, log-and-default, empty catch, dashboard-only broadcast,
  or any catch that lets a session-boundary failure continue without containment.

Every `SWALLOW` is a violation unless the sweep includes a receipt proving the
specific failure is genuinely trivial.

## Throw Table Amendment

The existing 54-row throw table gains a required catch column:

| Throw site | Producer | Throw reason | Landing catch | Landing behavior | Classification | Required action |
| --- | --- | --- | --- | --- | --- | --- |
| `file:line` | `file:line` | coded reason | `file:line` or uncaught fatal | trace/journal/ntfy/halt/quarantine/rethrow/log-only | `SCREAM-AND-ROUTE` or `SWALLOW` | keep, rewire, or justify with receipt |

Rule: a throw is not fully audited until its landing is named and the landing's
behavior is classified.

## Verified Direct Consumer Violation

| Site | Landing behavior | Classification | Required action |
| --- | --- | --- | --- |
| `run-empire-v2.js:979-1011` transition listener catch | Catches transition dashboard runtime scope sync failure, `console.error`s, optionally broadcasts `session_transition_scope_unset`, then continues to `Session transition` log. No trace, no ntfy, no SessionRouter failed-safe/halt/quarantine route. | `SWALLOW` | Rewire to scream-and-route. At minimum emit trace with transition ids/scope, route to operator notification, and block or failed-safe if the session transition cannot establish truthful runtime scope. |

Receipt: `run-empire-v2.js:979-985` throws on missing transition symbol;
`run-empire-v2.js:1001-1011` catches, logs/broadcasts, and continues.

## SessionRouter Catch Landing Census

| Site | Landing behavior | Classification | Required action |
| --- | --- | --- | --- |
| `core/SessionRouter.js:224-229` `start()` initial activation | Logs, enters failed-safe with `_enterFailedSafe(...)`, then rethrows. | `SCREAM-AND-ROUTE` | Keep in throw table as routed landing. |
| `core/SessionRouter.js:234-236` scheduled interval `.catch` | Logs `[SessionRouter] Check failed` and continues. Most known `_checkTransition()` failures route internally, but any unexpected rejection from failed-safe/journal/transition code lands here as log-only. | `SWALLOW` unless proven unreachable | Rewire interval landing to failed-safe/notification or prove every rejection path is already routed before it reaches this catch. |
| `core/SessionRouter.js:264-270` `_checkTransition()` phase validation | Enters failed-safe and returns. | `SCREAM-AND-ROUTE` | Keep. |
| `core/SessionRouter.js:356-370` transition lock release failure | Logs release failure, tries `markRecoveryRequired(...)`; nested mark failure logs only. | mixed: outer `SCREAM-AND-ROUTE`, nested `SWALLOW` | Keep outer recovery mark; reclassify or rewire nested `markRecoveryRequired` failure because `:366-368` is log-only after recovery marking itself failed. |
| `core/SessionRouter.js:448-457` broker side-effect failure | Fails broker intent in transition store; if failure journal write fails, throws compound error; otherwise rethrows original. | `SCREAM-AND-ROUTE` | Keep. |
| `core/SessionRouter.js:460-475` broker intent commit failure after side effect | Marks recovery required; if recovery mark fails, throws compound error; otherwise throws completed-but-commit-failed. | `SCREAM-AND-ROUTE` | Keep. |
| `core/SessionRouter.js:844-886` broker REST reconciliation failure | Records `SESSION_BROKER_RECONCILE_FAILED`, then rethrows to activation/transition catch. | `SCREAM-AND-ROUTE` | Keep. |
| `core/SessionRouter.js:902-911` failed-safe journal failure | Logs failed-safe journal failure but continues failed-safe emit and pause route. | `SCREAM-AND-ROUTE` with degraded journal | Keep only if sweep records that failed-safe continues after journal failure. |
| `core/SessionRouter.js:928-932` failed-safe `pauseTrading` failure | Captures pause error, then checks pause state, refuses direct fallback, emits `session_failed_safe_pause_fallback`, and logs unconfirmed pause. | `SCREAM-AND-ROUTE` | Keep, but note direct pause fallback is deliberately refused at `:291-293`. |
| `core/SessionRouter.js:1034-1037` transition to stocks failure | Logs and enters failed-safe with transition context. | `SCREAM-AND-ROUTE` | Keep. |
| `core/SessionRouter.js:1092-1109` per-trade source force-close failure | Per-trade catch accumulates close failure; any accumulated failure records `SESSION_SOURCE_FLAT_FAILED` and throws. | `SCREAM-AND-ROUTE` | Keep. |
| `core/SessionRouter.js:1169-1172` transition to crypto failure | Logs and enters failed-safe with transition context. | `SCREAM-AND-ROUTE` | Keep. |
| `core/SessionRouter.js:1299-1310` transition store status read failure | Returns explicit `RECOVERY_REQUIRED`, `freezeNewEntries: true`, with safe-mode reason. | `SCREAM-AND-ROUTE` | Keep if the sweep verifies every caller treats `recoveryRequired` as blocking. |

## Direct Runtime Consumer Scope Found In This Pass

Runtime SessionRouter construction and event consumption is in `run-empire-v2.js`:

- `run-empire-v2.js:828-839`: constructs `SessionRouter`.
- `run-empire-v2.js:842-958`: provides the OHLC consumer callback.
- `run-empire-v2.js:960`: wires SessionRouter.
- `run-empire-v2.js:971-1013`: consumes the `transition` event; convicted catch at `:1001`.
- `run-empire-v2.js:1803-1814`: starts SessionRouter and syncs active broker; no local catch, so failures propagate to startup fatal path.

Non-runtime hits in this pass were tests, config validation, gates, and passive
state/status readers. They should not be used to waive the runtime consumer
catch audit.

## Open Sweep Work

1. Re-run the full 54-row throw table and add the catch column above.
2. For every throw, name the landing catch or prove it is uncaught/fatal by
   call path.
3. Rewire every `SWALLOW`, starting with `run-empire-v2.js:1001` and
   `core/SessionRouter.js:234`, or attach a receipt proving the failure is
   genuinely trivial.
4. Treat dashboard-only broadcasts as absorption unless paired with trace,
   operator notification, and containment.

## Receipts

- `rg -n "new SessionRouter|sessionRouter\\.|SessionRouter\\(" --glob '!ogz-meta/cognition-history/**' --glob '!ogz-meta/ledger/**' --glob '!node_modules/**' .`
- `nl -ba run-empire-v2.js | sed -n '780,1020p'`
- `nl -ba run-empire-v2.js | sed -n '1788,1832p'`
- `nl -ba core/SessionRouter.js | sed -n '1,260p'`
- `nl -ba core/SessionRouter.js | sed -n '260,520p'`
- `nl -ba core/SessionRouter.js | sed -n '520,940p'`
- `nl -ba core/SessionRouter.js | sed -n '940,1360p'`
