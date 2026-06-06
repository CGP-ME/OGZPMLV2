Mercury break my fix export-freeze recheck.

Single ask: after adding `deepFreezePlain()` and exporting `PROFILE_DEFINITIONS` from `tools/tuning-profiles.js` as a frozen TradingConfig-derived copy, find a concrete state or call sequence where callers can mutate profile tunables outside `core/TradingConfig.js`, cause stale exported values to be treated as the owner, or bypass the profile apply guards.

Read these exact ranges:
- `core/TradingConfig.js:132-145`
- `core/TradingConfig.js:1256-1258`
- `tools/tuning-profiles.js:1-24`
- `test/trading-config-profile.test.js:1-40`

Attack requirements:
- Cite file:line evidence for any finding.
- Give a runnable call sequence if one exists.
- If no breaker exists in this slice, say PASS and list only residual work outside this commit.
