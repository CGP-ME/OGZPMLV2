# Evidence

## Trusted-path verification

Command:

```text
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules /opt/ogzprime/OGZPMLV2/node_modules/.bin/jest test/mercury-consensus.test.js test/mercury-reviewer-panel.test.js test/mercury-run-ledger.test.js --runInBand
```

Result before the final docs/packet review: `101 passed, 101 total`; all three suites passed. Syntax checks for the touched bridge files and `git diff --check` also passed. The final pre-commit replay is recorded in this packet's review log.

The property test runs 250 deterministic fuzz iterations over random seat arrays and injects an absence, evidence failure, or identity collision; every degraded ceiling is asserted less than or equal to its base ceiling. Ledger parity tests and emitted-packet tests assert artifact conclusions do not exceed panel authority.

The exact reviewed 12-logical-file code/governance diff, excluding this accountability packet to avoid a self-referential hash, is SHA-256 `88cb0215453d64b9fcc7a1c3c9191684de29f04adf54f982f5abc6139e139c7f` (`git diff --cached --binary` over the twelve logical files named in `WORK.md`, with both source and destination pathspecs for the ruling-file rename). The final staged diff hash is an external commit receipt because placing it inside this packet would change the hash it records.

## Provider preflight

- Run ID: `2026-09-01T03-16-50-773Z-1655434-a3735222d071`
- Ledger: source `ogz-meta/cognition-history/mercury-runs/2026-09-01.jsonl:1`; redacted committed copy under `tapes/ledger/`.
- Mercury: provider `mercury`, applied model `mercury-2`, HTTP 200.
- Fable: provider `claude-code`, applied model `claude-fable-5`, trusted executable.
- Kimi: provider `openai`, applied model `kimi-k3`, HTTP 200.

## Corrective adversarial run

- Run ID: `2026-09-01T03-19-29-531Z-65e01b9ceaca`
- Ledger: source `ogz-meta/cognition-history/mercury-runs/2026-09-01.jsonl:2`; redacted committed copy under `tapes/ledger/`.
- Selected/order: Mercury → Fable → Kimi.
- Applied identities: `mercury/mercury-2`, `claude-code/claude-fable-5`, `openai/kimi-k3`; all three effective fingerprints were present and distinct.
- Authority: `UNVERIFIED`.
- Named caps: `evidence_failure`, `reviewer_disagreement`; rerun required.
- Doctrine named absences: `coverage_insufficient`, `ast_evidence_absent`, `whole_file_read_absent`, `inherited_section_incomplete`, `sandbox_testimony_only`, `report_section_absent`.

Mechanical adjudication: Mercury alleged that the structured-only legacy fallback fell off the end and returned `undefined`. This allegation is false against the actual file: `classifyMercuryVerdict` ends with explicit `return 'cannot_verify'`, and the trusted-path focused suite directly exercised those cases successfully. Mercury's sandbox `npm test` exited 127 and has no authority. Fable correctly challenged the original claim's missing receipt; Mercury's recheck then omitted the actual final return while purporting to quote the full function. Kimi repeated that omission. No implementation change was made for this false allegation.

The run remains honestly UNVERIFIED. It is not represented as PASS.

## Docs-inclusive final review

- Run ID: `2026-09-01T10-20-30-447Z-f468e7b62b5c`
- Selected/order: Mercury → Fable → Kimi.
- Applied identities: `mercury/mercury-2`, `claude-code/claude-fable-5`, `openai/kimi-k3`; fingerprints were attested and distinct.
- Authority: `UNVERIFIED`; caps `evidence_failure`, `reviewer_disagreement`; rerun required.
- Named absences included `inherited_section_incomplete`, `allegation_basis_absent`, and `substantive_resolution_absent`. The requested host evidence descriptor was quarantined as absent because the packet was untracked at dispatch time; it supplied no authority.

Mechanical adjudication: the recheck alleged 18 newly added `throw` statements in `ask.js`. `git diff -U0 -- trai_brain/mercury-bridge/ask.js | rg '^\+.*throw'` produced no output: none of those throws were added by this diff. The recheck also treated the explicitly authorized `ogz-meta/Alignment/TREY-RULINGS.md` destination as an unresolved placement question; Trey's direct authorization resolves that question. Kimi's pass rested on the unsupported assumption that all grepped throws were new. No correction was warranted for these false allegations.

The emitted review packet correctly ended `Decision: unverified`, demonstrating ruling 13 against a Kimi `pass` that exceeded the panel receipt.

## Ruling 7a tapes and hashes

`TAPE-HASHES.tsv` records, for every committed tape, the source path, original-on-box SHA-256, committed redacted path, redacted-as-committed SHA-256, and byte counts. Redaction used the repository's `redactSensitiveText`. Ledger lines, console logs, and all provider raw outputs for the preflight, corrective review, and docs-inclusive review are committed under `tapes/`.

## Named absences / what was not proven

- The model panel did not attain FULL authority and did not supply full candidate/AST/whole-file/inherited coverage.
- The docs-inclusive panel also remained UNVERIFIED; neither review is clearance.
- The model-sandbox test attempt has no test/build authority; trusted-path Jest is the execution receipt.
- No live arbitrary-order provider combination was claimed; arbitrary orders/subsets were exercised at the production dispatch-loop boundary with deterministic focused tests.
- No Sol or Trey/Fable cold-pull has yet occurred for this corrective commit.
- No protected-path alarm receipt exists because that alarm is not yet shipped; Trey's explicit authorization is preserved in `MISSION.md`.
- No PM2/runtime/broker/live/paper behavior was exercised.
