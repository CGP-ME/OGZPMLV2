Mercury break-this prompt: runtime profile stale switch guard

Scope only this slice:

- `core/WebSocketManager.js:42-65`
  - New `rejectDashboardProfileCommand(command, profile)` sends `command_rejected` and returns false.
- `core/WebSocketManager.js:213-226`
  - `switch_profile`, `get_profiles`, and `set_confidence` now call the reject path instead of `ctx.profileManager`.
- `core/TradingConfig.js:960-970`
  - `getProfile(profileName)` now throws on missing/unknown profile instead of falling back to `balanced`.
- `core/PerformanceDashboardIntegration.js:17-35`
  - Explicit `enableProfileTracking: true` now throws because runtime profile tracking has no live owner.
- `core/PerformanceDashboardIntegration.js:134-175`
  - Profile dashboard metrics now report disabled status instead of fake/default profile state.
- `core/PerformanceDashboardIntegration.js:240-269`
  - Detailed report uses disabled profile status and `switchProfile(profileName)` throws instead of calling deleted `profileManager`.
- `test/dashboard-profile-command-runtime-guard.test.js`
- `test/trading-config-profile.test.js`

Attack the fix. Find a concrete current-code state or input sequence where:

1. A dashboard `switch_profile`, `get_profiles`, or `set_confidence` command can still call the deleted/stale `profileManager` path, mutate runtime profile/confidence state, or send a fake success/list response.
2. `TradingConfig.getProfile` can still silently fall back to `balanced` for an unknown/missing profile.
3. `PerformanceDashboardIntegration` can still call the deleted/stale `profileManager`, silently track fake profile performance, or switch runtime profiles.
4. The new rejection path lies to the dashboard or introduces a worse failure mode than the old crash/silent-mutation surface.

Architecture question: does this close the current unsafe mechanism, or only hide the symptom? Be strict: return BREAK with file:line evidence for any remaining current-code bypass, otherwise return PASS with residual risks that are outside this exact slice.
