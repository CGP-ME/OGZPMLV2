# Packet provenance

Date: 2026-10-01. Sources: exact root-selected staged tree and actual behavior receipt; September29 liquidity-confidence lane patches/fixtures; current MA packet tape redaction and validation implementation. Kept as the accountability packet for one Liquidity confidence migration.

Copy identities: delivery/fixture-provenance.json. fixtures/verify.cjs and review-source.cjs are byte-identical copies and work in exact-tree mode at this same directory depth. module.patch, loader.patch and producers.patch document only the lane delta; do not apply them again to the selected candidate. Portable-builder mode is not provided by these copies.

Curated contents: MISSION.md, WORK.md, EVIDENCE.md, REVIEW.md, INHERITED.md, this manifest, CANDIDATE.json, root's run-review.cjs, focused fixtures/patches, delivery/behavior.json, fixture-provenance.json, package-tapes.cjs, validate-tapes.cjs, and completed validated TAPES.json/TAPE-VALIDATION.json/tapes payloads when generated.

Exclude private/ and generated source/config copies from staging. Root owns final scoped manifest, review verdict and commit/push references.
