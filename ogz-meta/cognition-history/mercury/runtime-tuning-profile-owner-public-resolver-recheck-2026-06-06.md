Mercury break my fix public-resolver recheck.

Single ask: you found that public callers could use `TradingConfig.resolveTuningProfile()` or the adapter export to obtain and mutate profile definitions. After the patch, find a concrete state or call sequence where that is still possible, or where mutating the returned object can change the values later used by `applyTuningProfile()`.

Read these exact ranges:
- `core/TradingConfig.js:132-145`
- `core/TradingConfig.js:1055-1057`
- `core/TradingConfig.js:1232-1239`
- `core/TradingConfig.js:1256-1278`
- `tools/tuning-profiles.js:1-24`
- `test/trading-config-profile.test.js:27-50`

Patch facts:
- `TradingConfig.resolveTuningProfile()` now returns `deepFreezePlain(clonePlain(profile))`.
- `TradingConfig.getTuningProfileDefinitions()` returns `deepFreezePlain(clonePlain(getTuningProfileDefinitions()))`.
- `tools/tuning-profiles.js` exports `PROFILE_DEFINITIONS` from the frozen TradingConfig clone.
- tests assert both the adapter export and the public resolver return frozen profile/env objects, and that attempted mutation does not affect a later resolve.

Attack requirements:
- Cite exact file:line evidence for any finding.
- Give a runnable call sequence if one exists.
- If no breaker exists in this slice, say PASS and list only residual work outside this commit.
