Mercury, break my fix.

Repo-only attack. Do not use web_fetch. Do not open unrelated `ogz-meta/claudito-logger.js` ranges outside the listed lines.

Scope: track-record proof publisher config honesty after making the writer module-private.

Only inspect:
- `ogz-meta/claudito-logger.js:196-360`
- `ogz-meta/claudito-logger.js:545-556`
- `ogz-meta/claudito-logger.js:656-664`
- `ogz-meta/claudito-logger.js:696-707`
- `test/claudito-track-record-config.test.js:1-105`

Attack requirements:
1. Can fake default account identity, fake starting balance, fake zero profit target, or fake zero max drawdown still be written through exported logger APIs?
2. Is there a valid Trade The Pool eval env state that should be accepted but is rejected?
3. Do malformed numeric strings pass?
4. Does another repo writer/generator publish `public/proof/track-record/data/accounts/*.json` with fake zero values?
5. Do exports still expose `_writeTrackRecordNow` or `_resolveTrackRecordAccountConfig`?
6. Does this close the fake public proof-data mechanism or hide one symptom?

Use exact file:line evidence from this repo only. Break the fix.
