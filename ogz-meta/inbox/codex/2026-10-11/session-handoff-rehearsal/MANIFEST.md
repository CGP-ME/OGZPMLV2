# Evidence manifest

- Date: 2026-10-11 UTC.
- Source: repository `astra-era`, base `6de3673e19a0a2f986f9e52de1b4c5b6b4f416b2`; separately qualified tracked working source.
- Why kept: repeatable evidence requested by Trey for paper flattening, ledger/state persistence, destination scope and incomplete-close transfer blocking.
- Authored fixtures: `scripts/session-handoff-rehearsal/run.js`, `scripts/session-handoff-rehearsal/worker.js`, `scripts/session-handoff-rehearsal/executor-context.js`.
- Final successful runs: `runs/HEAD-zZwpZZ` and `runs/working-hG1mcb`; curated outcomes in `committed-result.json` and `working-result.json`. Source and result hashes are bound in `review.json`.
- Adversarial fixture candidate: `750ab287eecefe13be5113edfe5b493e62a37f46` against the base above. Documentation/results added afterward do not change the reviewed fixture code.
- Excluded from delivery: raw logs, exported source trees, generated state/journals/pattern banks, private Mercury ledger and local scratch files. They remain local for inspection.
- Runtime status: no production activation associated with this fixture-only change. Earlier runtime activation evidence lives in the adjacent `session-market-routing` packet.
