# Work

Executor: Codex in the active repo and branch named in `MANIFEST.md`.

The containing atomic commit is the implementation/packet cross-reference; this packet does not invent its own future SHA.

## Work performed

- Replaced unconditional report-heading authority requirements with existing telemetry and answer-quality receipts for no-diff audits.
- Kept diff-only candidate, inheritance, whole-file, AST scan, pre-scan, sandbox, testimony, and Fourth Shape checks in their ruled scopes.
- Carried pass-1 mechanically opened files and claimed citations into every Mercury recheck prompt through the live builder in `adversarial-review.js`, called from `ask.js`.
- Added a two-phase reading/decision state machine. Candidate receipts are refreshed after further tool reads and fixed into the decision prompt.
- Added additive `candidate_set` ledger evidence, including candidate/final citations and a mechanical subset result, without changing `schema_version`.
- Changed the base persona to evidence reader; attack framing is appended only for `break my fix` or explicit `--attack` runs.
- Preserved the global no-flag single-shot default pending Trey's explicitly reserved decision.

## Implementation, config, and test paths

1. `mercury.config.json`
2. `trai_brain/mercury-bridge/doctrine-review.js`
3. `trai_brain/mercury-bridge/react-loop.js`
4. `trai_brain/mercury-bridge/adversarial-review.js`
5. `trai_brain/mercury-bridge/ask.js`
6. `trai_brain/mercury-bridge/run-ledger.js`
7. `test/mercury-doctrine-extension.test.js`
8. `test/mercury-react-loop.test.js`
9. `test/mercury-consensus.test.js`
10. `test/mercury-run-ledger.test.js`

## No-flag single-shot dependency inventory

- `tools/run-audit.js:11` and `tools/run-audit-apex.js:11` invoke `ask.js` without `--agentic` and currently receive single-shot behavior.
- `trai_brain/mercury-bridge/ask.js:399-438,1464-1565` documents and implements the no-flag single-shot branch; its parser tests assert the existing default.
- `trai_brain/mercury-bridge/README.md:175-205,400-406` contains no-flag single-shot examples and explicit agentic review examples.
- `ogz-meta/slash-router.js:2616-2622` and `ogz-meta/cognition/mercury-bridge.js:62-72` call `runAgentic` directly, so they do not depend on the CLI default.
- `trai_brain/claude-bridge/pre-bash.js:123-129` permits the bridge command independently of its mode.
