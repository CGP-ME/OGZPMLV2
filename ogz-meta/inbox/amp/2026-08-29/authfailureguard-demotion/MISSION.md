# Part B — AuthFailureGuard Demotion

## Authority and dispatch

- Ruling authority: Trey.
- Dispatcher: Amp Puck thread `T-01a034e9-036f-70af-8009-eb719c05fc40`.
- Executor: Amp-managed trusted VPS runner thread `T-01a03911-80a5-7699-89b3-6971cf690836` on `ogzprime-prod-001`.
- Mission date assigned by Trey: 2026-08-29.

## Tasking verbatim

> PART B — AUTHFAILUREGUARD DEMOTION.
> Territory: `core/AuthFailureGuard.js` + its tests. Broker callers keep reporting failures unchanged. On threshold breach, replace `killSwitch.enableKillSwitch(reason)` with broker-session quarantine: halt entries for that broker's symbols, flatten that broker's open positions through the existing flatten path, mark the broker session quarantined (persists restart, operator-cleared only — same persistence discipline the KillSwitch flag uses), emit max-priority trace/ntfy with broker, kind, count, window, evidence. The other broker is untouched. Remove the KillSwitch import from this file; KillSwitch itself remains, manual-only. Tests both directions: breach quarantines-flattens-screams and does NOT kill; the healthy broker keeps trading through the other's quarantine.

> Standing laws: no PM2 start/restart; no broker orders; no live/paper activation; no stash/reset/checkout/destructive Git without Trey; deletion authority human; automation screams, never stops.

> TERRITORY RULING — PART B (Trey), apply exactly:
>
> Expansion granted, minimum honest surface. Territory is `core/AuthFailureGuard.js` + tests, PLUS:
> 1. `run-empire-v2.js` — wiring only: inject the existing live entry-gate, flatten path, and state/persistence handles into AuthFailureGuard at construction. No new capabilities or flow; connect what exists.
> 2. Exactly one entry-gate owner file: `core/OrderExecutor.js` or `core/OrderRouter.js`, whichever code proves is the single choke point for broker-quarantine check. State which and why in WORK.md. Only quarantine check + persisted-flag read there; nothing else in that file.
>
> Constraints unchanged/sharpened:
> - Reuse existing flatten path; never create a new one.
> - Quarantine persistence follows KillSwitch flag's exact file-based discipline, survives restart, operator-cleared only.
> - `core/TtpCutoffEnforcer.js` untouched.
> - Dependency-injection tests alone insufficient.
> - `EVIDENCE.md` must include a wired-path probe from a real constructed process on the VPS, with no orders, no PM2 service, no broker calls: boot far enough to construct the wired guard; inject synthetic threshold breach; show trace proving entry-gate refusal fires; prove quarantine flag persists to disk and is re-read on second construction.
> - Send max-priority ntfy through the proven existing topic and receipt it.
> - Full adversarial layer and ruling-7/7a accountability packet under `ogz-meta/inbox/amp/2026-08-29/<part-b-slug>/`, including redacted committed tapes and dual hashes.
> - One atomic Part B commit after valid review, fetch/rebase safely, push only to `codex/multi-asset-symbol-state`, then HOLD for cold-pull. Do not start Part C until Part B packet commit exists and Trey clears the hold.
> - No PM2 start/restart, broker orders/calls, live/paper activation, new env/config/default/framework, main, destructive Git, or unrelated changes.
>
> Proceed from clean `f3781847`; report chosen choke-point evidence, wired probe, adversarial runs, packet path, commit SHA/push receipt, or exact blocker.

> Priority update from Trey: hammer down on Part B now. Continue at full pace within the authorized territory and proof gates; do not pause for status narration unless there is a concrete blocker requiring a ruling. Finish implementation, wired-path proof, persistence/reconstruction proof, synthetic flatten and entry refusal, real max-priority ntfy receipt, full adversarial review, packet, atomic commit, push, and HOLD. Reply when pushed or when an exact ruling blocker exists.
