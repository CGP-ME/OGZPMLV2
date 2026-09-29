# Evidence

- `recorded-allegation.json`: exact sanitized shard 15 allegation with receipt provenance and historical source hash; no private full-review JSON is required to replay.
- `IMPLEMENTATION.json` and `head-plus-repair.patch`: exact candidate identity. Base: 6bcfad8a25f72cb9e1eb946e854695913b2133c4; patch SHA-256: 6f8031741e8a016305942917d344ae434c70beebeb66e0459b2f3e7660e8d514.
- `build-proof.json`: every source reconstructed in memory matches the reviewed implementation hash, with zero mutations.
- `replay-result.json`: matching AST at 98304 bytes, full accepted-source fallback when fitting, and explicit unresolved envelope failure when not fitting; no oversized candidate/final dispatch.
- `verification-proof.json`: literal source preservation through 16 reductions,149,542-byte overflow behavior, existing protocol checks, and identical 25 failed / 92 passed Jest results on baseline and repair.

`replay.cjs` reads the historical source from its explicit Git tree and regenerates only a scanner fixture inside this packet. `build-implementation.cjs` and `clean-loader.cjs` require the pinned Git history plus this packet's patch; they do not need a clean working tree or duplicate implementation files.

See IMPLEMENTATION-REVIEW.md for exact commands and limitations. Host citation/quote validation proves provenance, not semantic truth. No fresh provider review was performed by this worker.

## Portable historical source

The original candidate tree f93161d39f016be57591dfda72101c3ed5c8da59 is not reachable from origin/astra-era. Its evidence-ingestion.js blob is byte-identical to the file in reachable pushed commit6bcfad8a25f72cb9e1eb946e854695913b2133c4. Replay now loads that reachable commit while retaining the original historical tree as receipt metadata; the original24866675… source hash is still asserted. No reconstruction patch is necessary because the source bytes are identical. `source-reachability.json` records the remote-tracking ref checked, and the portable replay passed.

Final delivery:51redacted compressed tapes, zero missing, all compressed/redacted hashes verified. Decompressed scan found one apiKeySource metadata field with literal value none; normalizing only that scanner input leaves zero findings, stored bytes unchanged. Staged secret scan passed. Production whitespace check passes; unified-diff artifact blank context lines retain their required prefix.
