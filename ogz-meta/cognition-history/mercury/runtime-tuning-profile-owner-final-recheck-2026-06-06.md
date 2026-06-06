Mercury break my fix final recheck.

Single ask: after the final tightening, find a concrete state or call sequence where profile replacement can still happen without flat-state proof, temporary profile restore can leave stale override state, profile application can mutate `process.env`, or a non-startup phase can apply `EXIT_SYSTEM` / `RISK_MANAGER_BYPASS` and pretend constructed objects changed.

Read these exact ranges:
- `core/TradingConfig.js:1044-1438`
- `tools/tuning-profiles.js:1-24`
- `test/trading-config-profile.test.js:40-151`

Patch facts:
- `replaceActiveProfile=true` now requires `assertFlatProfileState(flatState)` even when there are no conflicting values.
- `runWithTuningProfile()` uses `replaceActiveProfile=true`, so every temporary profile run now requires an explicit flat-state proof.
- tests cover same-value replacement requiring flat proof and restoration when profile-owned override paths were missing before the temporary profile.

Attack requirements:
- Cite file:line evidence for any finding.
- Give a runnable call sequence if one exists.
- If no breaker exists in this slice, say PASS and list only residual work that is truly outside this commit.
