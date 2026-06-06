Mercury response: runtime profile stale switch guard

PASS - Within the examined slice the unsafe runtime-profile path is fully
blocked; the code no longer reaches the deleted `profileManager` and any
attempt to switch or query profiles is rejected or throws.

Evidence cited by Mercury:

1. `core/WebSocketManager.js:42-64` sends `command_rejected` and returns false.
2. `core/WebSocketManager.js:215-226` routes `switch_profile`, `get_profiles`,
   and `set_confidence` to the reject path.
3. `core/TradingConfig.js:960-970` normalizes profile names and throws on
   unknown profiles instead of falling back to `balanced`.
4. `core/PerformanceDashboardIntegration.js:31-35` throws when
   `enableProfileTracking` is true.
5. `core/PerformanceDashboardIntegration.js:167-174` reports disabled profile
   status with `runtime_profile_switch_not_wired`.
6. `core/PerformanceDashboardIntegration.js:262-269` throws on
   `switchProfile(profileName)` instead of calling the deleted manager.
7. `core/PerformanceDashboardIntegration.js:134` uses disabled profile status
   in live metrics.

Mercury conclusion:

All entry points that could have mutated runtime profile/confidence state are
now routed to explicit rejection or error-throwing paths, and the profile lookup
function no longer silently falls back. The unsafe mechanism is closed for the
code slice in question.

Residual risk noted by Mercury:

If production code outside this slice still imports or executes legacy files
under ledger copies that reference `ctx.profileManager`, those paths could
remain active. Within the current core implementation, the symptom is eliminated
rather than merely hidden.

Run details:

- Command: `node trai_brain/mercury-bridge/ask.js --agentic --max-iterations=60 --max-tokens=7750 "$(cat ogz-meta/cognition-history/mercury/runtime-profile-stale-switch-guard-2026-06-06.md)"`
- Iterations: 13
- Termination: answer_given
