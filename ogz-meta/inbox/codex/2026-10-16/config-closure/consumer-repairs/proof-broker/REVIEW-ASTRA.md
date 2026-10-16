# Astra adversarial review: proof account broker ownership

Verdict: **GO for candidate `531e98801caec33c428b0e9b18588e4f83e3e8d9` against `227b2922dd9812799626b383d9bff3903d7a2bd1`.** No concrete introduced defect found. The change gives historical proof-account broker metadata its own explicit canonical owner; it does not populate that metadata or approve publication.

The exact two-file diff changes the logger input from the missing `broker.id` getter to `proofPublication.account.broker`, adds that field as an empty string, and increments canonical settings revision from 10 to 11. All code citations below refer to the candidate tree. This reviewer performed only read-only source/evidence inspection and wrote this report; no trading imports, tests, public writer, runtime publication, or PM2 action occurred.

## Actual producer and consumer behavior

`ogz-meta/claudito-logger.js:375-388` reads the canonical publication-account object and maps its broker into the legacy-shaped input DTO. The changed line 383 no longer looks up the active broker. A historical account can therefore retain its configured broker independently of whichever broker the running bot currently uses.

The canonical field is deliberately empty at `config/settings.json:3884`, while publication remains disabled at `:3878`. It is **not already a valid publication broker**. Existing `_resolveTrackRecordAccountConfig` requires a nonempty BROKER at `claudito-logger.js:418`; `_readRequiredString` rejects missing/null/blank values at `:293-298`. Those checks are unchanged. The existing enabled checks still prevent ordinary public publication while disabled (`:643-646,654,734`). No default broker, silent substitution, or new guard was added.

The independently reviewed failure cases are: a configured historical broker differing from the current broker; absence of the current-broker object; and an empty historical broker. The candidate resolves the first two from the historical account and preserves existing rejection for the third. No current broker value is used to manufacture missing historical metadata.

## Mercury adjudication

Mercury's recorded verdict is `no_break_found`, but its reasoning about validation is incorrect:

- `execution.broker` and `proofPublication.account.broker` are different fields. A nonempty current execution broker does not satisfy the historical proof-account requirement.
- Searching for `requiredConfiguredString('broker')` does not establish absence of validation. The actual validation is `_readRequiredString(env, 'BROKER')` at `claudito-logger.js:418`.
- The new mapping does not copy an already-validated nonempty broker in the shipped configuration. It copies an intentionally blank value when publication is disabled; if account resolution is attempted with that blank value, existing validation rejects it.

The GO is supported by explicit ownership and retained rejection behavior, not Mercury's mistaken claim that the empty historical field is populated or accepted. Nothing in this review establishes complete publication readiness or historical account correctness.

## Verification and source identity

Read `fixtures/verify-proof-broker.cjs` and `verification.log`. The isolated fixture AST-extracts the actual account-input mapper and resolver plus their validation helpers, without loading the logger module or calling a publication writer. It supplies synthetic account metadata, first with a different synthetic current broker, then removes the current broker entirely, then empties the historical broker and verifies the existing BROKER rejection. The saved result reports all three candidate checks passing. This reviewer did not rerun the probe.

Verified fixture blobs match the reviewed source exactly:

| Source | Git blob |
| --- | --- |
| Candidate logger | `58104b5b970fad6a25d270820a8786c53510e299` |
| Candidate settings | `54bd1e7a1d77b2b3589c9e26249bcc81c2d3d698` |
| Baseline logger | `606ab95747e083f01e3a19b3de9665c1f23ce700` |

The baseline fixture's synthetic `broker.id` demonstrates the old helper's dependency when that path exists; it does not prove that the actual baseline ConfigLoader supplied that path. The candidate removes that missing-path dependency. The fixture checks account metadata routing and rejection only; it does not execute journal selection, proof aggregation, public JSON writes, hosting, or any production-account acceptance.

No publication, runtime activation, or full configuration/Stop1 closure is certified.
