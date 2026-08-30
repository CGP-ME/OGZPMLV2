# Work

## Commit linkage

- Predecessor SHA: `f378184761dcb46daa9fce3973c8c837065da150`.
- This packet uses the repository's predecessor-SHA mechanism for a same-commit accountability packet. The final commit SHA cannot truthfully self-reference from within its own content.
- Intended atomic subject: `Demoted AuthFailureGuard to broker quarantine`.

## Implementation

- `core/AuthFailureGuard.js`: removed its KillSwitch dependency. Threshold breach now atomically persists a broker-scoped quarantine flag, emits max-priority alarm traces, and flattens only StateManager-tracked trades owned by that broker through the injected existing `executeTrade` path. The flag has no automatic clear path.
- `core/OrderExecutor.js`: selected as the one entry-gate owner. Every broker-routed entry reaches `OrderExecutor.executeTrade`; the check is before broker, capital, and state side effects, while SELL/COVER exits do not enter this branch. `OrderRouter` was not touched because routing-level enforcement would duplicate the existing entry choke and risk obstructing exits.
- `run-empire-v2.js`: wiring only. The constructed singleton guard receives the existing StateManager and the runner's existing `executeTrade` path immediately after OrderExecutor construction.
- `test/auth-failure-guard.test.js`: covers broker-only quarantine/flatten/alarm/no-kill, restart persistence, healthy-broker entry routing, and real OrderExecutor refusal before side effects.

## Files touched

Production and tests:

1. `core/AuthFailureGuard.js`
2. `core/OrderExecutor.js`
3. `run-empire-v2.js`
4. `test/auth-failure-guard.test.js`

Accountability packet:

5. `ogz-meta/inbox/amp/2026-08-29/authfailureguard-demotion/MISSION.md`
6. `ogz-meta/inbox/amp/2026-08-29/authfailureguard-demotion/WORK.md`
7. `ogz-meta/inbox/amp/2026-08-29/authfailureguard-demotion/EVIDENCE.md`
8. `ogz-meta/inbox/amp/2026-08-29/authfailureguard-demotion/REVIEW.md`
9. `ogz-meta/inbox/amp/2026-08-29/authfailureguard-demotion/INHERITED.md`

Explicitly untouched: `core/TtpCutoffEnforcer.js`, broker callers, KillSwitch implementation, config/env, PM2/runtime state, main, and all unrelated work.
