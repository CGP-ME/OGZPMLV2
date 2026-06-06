Mercury break my fix.

Single ask: find a concrete state or call sequence where this profile-owner change still violates one of these rules:
- profile tunable values live outside `core/TradingConfig.js`
- applying a tuning profile silently overwrites active config
- a runtime profile apply pretends to update post-construction objects that already snapshotted settings
- profile swap/run/restore mutates `process.env` or leaves stale active overrides behind
- backtest tools still own a separate copy of profile tunables instead of reading TradingConfig

Read these exact ranges:
- `core/TradingConfig.js:48-138`
- `core/TradingConfig.js:165-184`
- `core/TradingConfig.js:325-330`
- `core/TradingConfig.js:918-980`
- `core/TradingConfig.js:1044-1436`
- `core/TradingConfig.js:1568-1574`
- `tools/tuning-profiles.js:1-24`
- `test/trading-config-profile.test.js:1-113`

Patch intent:
- `core/TradingConfig.js` is now the single owner for `current-eval` and `legacy-wide` profile values.
- `tools/tuning-profiles.js` is only a compatibility adapter around TradingConfig APIs and should not contain profile literal values.
- `TradingConfig.applyTuningProfile()` builds typed overrides from the profile env keys, verifies the applied values, rejects missing flat-state proof when required, rejects post-construction runtime phase when profile contains startup-snapshot keys, and refuses active override collisions unless replacement is explicit.
- `TradingConfig.runWithTuningProfile()` applies a profile, runs a callback, and restores the previous profile override snapshot.

Attack requirements:
- Cite file:line evidence for any finding.
- Prefer a runnable sequence or exact input object over general concern.
- If you find no breaker in this slice, say PASS and list residual risks that belong to later slices, especially hardcoded values or constructor snapshots outside this change.
