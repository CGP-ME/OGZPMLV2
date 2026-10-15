# Trading-stop authorities: current findings

2026-10-15. Scope: current runner, TradingLoop, OrderExecutor, StateManager, SessionRouter, WebSocketManager, EvalRuleEngine and TtpCutoffEnforcer source. Line references are to the shared working tree inspected today, not a claim of runtime deployment or a complete repository-wide control census. Tests and runtime activation are separate.

## Delivered source removals

- `f0eff88f`: independent isTrading enable flag and its active consumers removed; actual pause record retained.
- `cced6986`: journal persistence failure/recovery no longer pauses/resumes trading; error evidence retained.
- `b75734e7`: auth-counter quarantine and automatic auth-triggered flatten authority removed; actual broker errors retained.
- `ea226fb4`: generic venue drawdown rail removed, including loader/settings/runtime callers. Actual prop rules retained.
- `e39129f0`: sticky broker-read outage map and Executor veto removed; outage observation and actual failed-request rejection retained.
- `5b6a3db7`: credential-prefix entry authority and saved diagnostic holds removed; active-trade evidence preserved.

These commits do not establish that PM2 loaded them. No restart or resume is authorized by this record.

## Remaining authorities and concrete gaps

| Authority | Current source evidence | Status / meaning |
| --- | --- | --- |
| Manual pause | StateManager.js:2486-2548 | Real pauseReason remains. resumeTrading unconditionally clears the pause record; ownership is not checked there. |
| Session transfer pause and wind-down | SessionRouter.js:48-50,445-472,629-655,1544,1613,1645,1717 | Entry blocking starts 30 minutes before a switch; warn phase at 15 minutes and force-flatten phase at 5. Flat-before-transfer was explicitly requested; this does not establish user approval for the entire 30-minute entry blackout. Transition resume calls are unowned and can clear another pause. |
| Prop evaluation rules | EvalRuleEngine.js:388-493 | Actual account max-loss floor and daily limit remain; these are separate from the requested generic 50% whole-account rule. Other evaluation constraints are not removed by this audit. |
| Unknown order receipt | OrderExecutor.js:138-191 | broker_order_reconciliation_required prevents another entry while an attempted order's outcome is unresolved. |
| Broker residual after close | OrderExecutor.js:1386-1432 | exit_rail_broker_desync follows attempted flatten/reconciliation when local closure and broker residual disagree. |
| Exit monitor failure | run-empire-v2.js:2577-2641 | exit_monitor_reconciliation_required. |
| Unresolved exit reservation/receipt | OrderExecutor.js:1148-1186 | exit_intent_reconciliation_required. |
| Corrupt direction / exit identity | StateManager.js:100; OrderExecutor.js:72-130 | direction_integrity_exit_refusal. |
| Prop cutoff flatness unknown | TtpCutoffEnforcer.js:746-899 | ttp_cutoff_unverified_broker_flatness; code-specific recovery exists, including resetSymbolHalt at :884. |
| Credential-prefix saved holds | 5b6a3db7 | Removed in source. Existing running process has not been reloaded; do not infer runtime removal. |

The other five reconciliation hold types have no wired operator reset/recovery demonstrated by this search. They are not generic drawdown rules. Removing an unresolved-order hold without resolving its producer could permit a duplicate real order; the user's Fourth Shape still requires detecting external failures, flattening, symbol halt and tracing. This record exposes those holds for resolution rather than silently clearing them.

## Phantom surfaces and operator UI

StateManager.js:3949-3958 still defines isHalted() returning false and getHaltReason() returning null. They are dead compatibility surfaces with active callers at run-empire-v2.js:1936, TradingLoop.js:1571 and OrderExecutor.js:2933. They do not currently stop trading, but cleanup is still pending.

WebSocketManager.js:75-103 calls async pause/resume without awaiting before confirmation. StateManager.js:4878-4905 omits pauseReason/source/pausedAt from its dashboard state object. A working owned v2 Resume prompt/receipt is not established. Session transfer recovery must not silently waive an account-loss or manual pause.

## Requested 50% rule — not implemented

Trey's ruling is 50% loss of whole account value within a New York calendar day, midnight-to-midnight America/New_York with DST. A breach prompts the operator to Resume if desired. Prop rules retain their separate clocks. Existing MarketCalendar.getNYTimeParts at foundation/MarketCalendar.js:381-398 provides the NY date.

Paper must use the same simulated StateManager equity ledger as simulated fills. Live must use broker whole-account equity with verified account identity, not USD cash or the bot's local closed PnL. No recurring sample, persisted per-account day baseline, breach acknowledgement or v2 Resume completion has been implemented by these removals. Alpaca exposes whole-account equity; the current Kraken balance path only sums USD cash and is not a complete portfolio-value producer. Do not describe the removed generic rail as replaced yet.

## Verification incident blocks a clean reload claim

Legacy tests wrote the actual paper-state file and a malformed decision record. The disk snapshot was subsequently restored at 16:04 UTC from two matching observations of the running StateManager, with its persistence format and loaded destination verified. This recovery and its limits are documented in ../verification-state-incident/INCIDENT.md. Legacy test isolation and diagnostic test records remain unresolved; no restart/resume occurred. Source commits are not runtime activation.
