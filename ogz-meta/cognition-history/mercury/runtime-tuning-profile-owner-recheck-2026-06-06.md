Mercury break my fix recheck.

Single ask: after the final patch, find a concrete state or call sequence where `TradingConfig.applyTuningProfile()` or `TradingConfig.runWithTuningProfile()` can still silently overwrite profile-owned config, skip flat-state proof on a real profile replacement, leave stale active overrides after restoration, mutate `process.env`, or pretend to apply startup-snapshot keys during a runtime phase.

Read these exact ranges:
- `core/TradingConfig.js:48-138`
- `core/TradingConfig.js:918-980`
- `core/TradingConfig.js:1044-1438`
- `tools/tuning-profiles.js:1-24`
- `test/trading-config-profile.test.js:40-123`

Patch facts:
- profile values live under `core/TradingConfig.js:tuningProfiles`.
- `tools/tuning-profiles.js` is a compatibility adapter only.
- active override conflicts throw unless `replaceActiveProfile=true`.
- even with `replaceActiveProfile=true`, active conflicts now call `assertFlatProfileState(flatState)`.
- non-startup phases reject profiles containing `EXIT_SYSTEM` or `RISK_MANAGER_BYPASS`.

Attack requirements:
- Cite exact file:line evidence for any finding.
- Give a runnable call sequence if one exists.
- If no breaker exists in this slice, say PASS and list residual hardcoded/config snapshot work that should be separate follow-up slices.
