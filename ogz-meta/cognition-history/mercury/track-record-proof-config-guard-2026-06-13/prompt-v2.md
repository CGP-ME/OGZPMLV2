Mercury, break my fix.

Scope: track-record proof publisher config honesty after removing the `_test` export.

The fix now:
- Requires track-record proof config in `ogz-meta/claudito-logger.js:196-275`.
- Calls the resolver before account/index writes in `ogz-meta/claudito-logger.js:432-448`.
- Exports no `_test` resolver in `ogz-meta/claudito-logger.js:696-707`.
- Tests the real writer by mocking `writeJsonAtomic` in `test/claudito-track-record-config.test.js:1-96`.

Attack requirements:
1. Find a concrete env state where fake default account identity, fake starting balance, fake zero profit target, or fake zero max drawdown can still be written.
2. Find a concrete valid Trade The Pool eval env state that should be accepted but is rejected.
3. Find malformed numeric strings that still pass.
4. Find another writer/generator that can still publish `public/proof/track-record/data/accounts/*.json` with fake zero values.
5. Find whether the revised exports still expose a production bypass.
6. Decide whether this closes the fake public proof-data mechanism or only hides one symptom.

Use exact file:line evidence. Break the fix.
