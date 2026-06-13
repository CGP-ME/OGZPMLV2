Mercury, break my fix.

Repo-only attack. Do not use web_fetch or external sources.

Scope: track-record proof publisher config honesty after making `_writeTrackRecordNow` module-private.

Relevant code:
- `ogz-meta/claudito-logger.js:196-360`
- `ogz-meta/claudito-logger.js:545-556`
- `ogz-meta/claudito-logger.js:656-664`
- `ogz-meta/claudito-logger.js:696-707`
- `test/claudito-track-record-config.test.js:1-105`

Attack requirements:
1. Find a concrete env state where fake default account identity, fake starting balance, fake zero profit target, or fake zero max drawdown can still be written through the exported/public logger API.
2. Find a concrete valid Trade The Pool eval env state that should be accepted but is rejected.
3. Find malformed numeric strings that still pass based on the code as written.
4. Find another repo writer/generator that can still publish `public/proof/track-record/data/accounts/*.json` with fake zero values.
5. Find whether the revised exports still expose `_writeTrackRecordNow` or the resolver as a production bypass.
6. Decide whether this closes the fake public proof-data mechanism or only hides one symptom.

Use exact file:line evidence from this repo only. Break the fix.
