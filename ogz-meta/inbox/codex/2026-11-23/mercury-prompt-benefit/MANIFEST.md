# Evidence manifest

Source: current checkout `c0f120f136a72af5dd0b1c9f20f0b6dd6ca57205`, the exact historical source refs in `protocol.json`, four real Mercury 3 dispatches, and fresh isolated execution of the existing native gap-recovery fixture. Captured November 23, 2026 UTC.

Why kept: Trey requested evidence that the new production-failure/loss question improves reviews before continuing Stop 2. The measured comparison did not establish that benefit; preserving the answers and grading prevents a prompt-delivery check from being presented as a quality improvement.

- `protocol.json`: comparison defined before dispatch, including known behavior and limitations; never supplied to the reviewer.
- `*-command.json`: exact one-question command, config identity, source ref and start/finish status.
- `*-answer.md`: complete model answers, including claims that were not substantiated.
- `*-receipt.json`: model/source identity, tool/read evidence, warnings, tokens, estimated cost and hashes of private complete ledgers.
- `behavior-commands.json`, `behavior-results.json`: fresh isolated execution and selected result traces; original fixture and full scenario definitions remain linked in the previous packet.
- `results.json`: counted outcomes, bounded interpretation, cost totals and preservation check.
- `RECEIPTS.md`: evidence-based claim assessment, official provider references and remaining live acceptance.

The `private/` directory is local evidence, excluded from this commit. It contains original stdout/stderr, full run-ledger copies, inherited/harness hashes and bounded raw runtime samples. No credentials, real account-scoped state, raw private provider tapes or production overrides are published.
