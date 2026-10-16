# Astra role-source-truth review

**GO** for candidate `ee46b4a51723f1d712876de0bee883ec66461678` against `097ef8c3ff3fa2af3c7c90795e215d094003f206`, limited to this Loader provenance repair. Read-only review; no tests, trading imports, runtime operations, or production edits performed.

The exact diff changes only `foundation/ConfigLoader.js`. The optional runtime-path parameters at `:530-535` and `:1015-1028` alter source-map keys; they retain the same canonical reads, cloning, returned values, and pre-existing error behavior. Explicit paths correctly describe the existing projections:

- Supervisor schema/revision come from internals (`:614-620`).
- Market-data Alpaca configuration comes from `services.dashboard.stockData`; composed parents are marked derived (`:627-643`). Credentials retain their specific credential provenance after the clone.
- Bot webhook settings are recorded at runtime `webhookOrders` (`:1143`, `:1220-1225`), removing nonexistent `services.webhookOrders` source keys. Existing credential and internal-field assignments retain their own labels.
- Bot volume-cap limit and broker interval keep their canonical reads but identify the actual runtime destinations (`:1207`, `:1216`).

`fillSourceGaps` only fills absent labels (`:871-890`), so it preserves these explicit mappings. Inspected metadata consumers expose provenance through `getSource`/editable receipts (`:2492-2494`, `:4154`) and validation checks for other unchanged source paths. The change does not add trading values, validation rules, policy guards, or execution branches. **Affected fingerprints change intentionally**: the existing fingerprint includes active sources (`:2150-2160`). Config-value equality must not be described as fingerprint identity.

The supplied fixture compares complete baseline/candidate config objects for all six tested role/profile snapshots. It checks canonical-label resolution, source-key membership in the role config, scalar-to-scalar canonical value equality, and the explicit projections. Its market-data assertion separately compares the projected canonical group. This is not an assertion that every group-level source label identifies an individual leaf. `verification.txt` records PASS with 18 invalid baseline canonical labels and zero candidate invalid labels/unused keys. All eight copied source blobs were independently checked against the manifest and exact git refs and match. No credential values were inspected or emitted by this review.

Mercury's recorded verdict remains **no_break_found**, nonblocking. Its supplied rationale concerns the earlier three TRAI descriptors and `next_trai_confidence_blend`, rather than this runtime/source-path diff. It therefore does **not** establish a clean relevant Mercury review of this candidate. This GO is the independent Astra adjudication authorized for that mismatch; no harness repair or index claim is made.

Receipt correction requested: at review time `verification.json.sourceCommit` still names `9545c26a...`; the actual manifest and verified fixture blobs identify baseline `097ef8c3...` and candidate `ee46b4a5...`. Update that stale summary label rather than presenting it as the tested source. This does not invalidate the matching exact-source fixtures.

Scope excludes running-process state, activation, broker behavior, arbitrary role/profile combinations, and whole-bot configuration closure.
