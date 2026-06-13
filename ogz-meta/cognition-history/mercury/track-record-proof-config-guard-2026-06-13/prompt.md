Mercury, break my fix.

Scope: track-record proof publisher config honesty only.

Bug class: `ogz-meta/claudito-logger.js` wrote public `/proof/track-record/data/accounts/default.json` with default account identity and fake zero `profit_target` / `max_drawdown` when proof env vars were missing. The fix adds `_resolveTrackRecordAccountConfig()` so `_writeTrackRecordNow()` requires explicit account identity, broker, starting balance, profit target, max drawdown, and minimum-day config. It may use explicit `OGZ_*` proof values or derive Trade The Pool max drawdown from `STARTING_BALANCE - TTP_MAX_LOSS_THRESHOLD_EQUITY`; it must not publish fake zeros.

Relevant code:
- `ogz-meta/claudito-logger.js:196-275`
- `ogz-meta/claudito-logger.js:432-448`
- `ogz-meta/claudito-logger.js:696-710`
- `test/claudito-track-record-config.test.js:1-73`

Attack requirements:
1. Find a concrete env state where `public/proof/track-record/data/accounts/*.json` can still be written with fake default account identity, fake starting balance, fake profit target, or fake max drawdown.
2. Find a concrete env state where valid Trade The Pool eval values are rejected even though the bot has the necessary truthful data.
3. Find a concrete env state where invalid values pass because numeric parsing accepts malformed strings, Infinity, whitespace, zero, negative values, or partial numeric strings.
4. Find whether another writer/generator bypasses this guard and can still publish the same fake-zero track-record file.
5. Find whether the `_test` export introduces a production mutation or bypass risk.
6. Decide whether this closes the fake public proof-data mechanism or only hides one symptom.

Use exact file:line evidence. Break the fix.
