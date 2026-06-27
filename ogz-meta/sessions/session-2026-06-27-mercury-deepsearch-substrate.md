# Session Handoff: Mercury DeepSearch Substrate

Date: 2026-06-27 UTC
Branch: `codex/multi-asset-symbol-state`
Repo: `/opt/ogzprime/OGZPMLV2`

## Operator Prompt

Trey linked the Sourcegraph/DeepSearch enterprise-agent brief and asked to apply
its philosophies to Mercury. The implementation followed the current
`ogz-meta/Alignment/` startup rules first, then kept the work scoped to Mercury
substrate code and docs.

## What Changed

- Added `ogz-meta/specs/mercury-deepsearch-substrate-spec.md`.
- Added durable Mercury run ledger support in
  `trai_brain/mercury-bridge/run-ledger.js` and wired agentic runs in
  `trai_brain/mercury-bridge/ask.js`.
- Added intent-shaped tool descriptions in
  `trai_brain/mercury-bridge/tool-adapter.js`.
- Added read-only code-intelligence primitives:
  `find_definition` and `find_references`.
- Added read-only rules-as-greps primitive: `rule_scan`.
- Implemented the first concrete Serena Tree-sitter symbol scanner slice:
  `tools/serena-symbol-scanner.js`, exported through `tools/dep-scanner.js` and
  `tools/serena-bridge.js`.
- Added Mercury ReAct tools for AST-backed symbol evidence:
  `serena_property_refs`, `serena_method_callers`, and `serena_class_fields`.
  These report property reads/writes/destructures/mutations, method calls and
  call-result mutation/read sites, and class fields/methods/getters/setters.
- Added a Babel AST fallback inside the scanner for the observed Jest/native
  Tree-sitter zero-node state after module-reset mocks. Tree-sitter remains the
  primary parser; fallback prevents Mercury from silently receiving an empty
  graph when the native binding degrades inside the same worker.
- Added compasses:
  - `ogz-meta/cognition/mercury-compasses/mercury-bridge.md`
  - `ogz-meta/cognition/mercury-compasses/trading-path.md`
- Added initial rules:
  - `no-public-dashboard-websocket-token`
  - `no-proof-partial-as-full-close`
  - `no-swallowed-trading-path-fallback`
- Added canary definitions in `ogz-meta/cognition/mercury-canaries.json`.
- Added offline digest support:
  - `trai_brain/mercury-bridge/substrate-digest.js`
  - `scripts/mercury-substrate-digest.js`
- Added `ConfigLoader._resetForTest()` and updated
  `test/eval-live-posture-gate.test.js` cleanup after Mercury found that the
  test restored `process.env` without clearing ConfigLoader's cached runtime
  snapshot.

## Verification

Focused checks passed:

```text
node --check trai_brain/mercury-bridge/run-ledger.js
node --check trai_brain/mercury-bridge/ask.js
node --check trai_brain/mercury-bridge/tool-adapter.js
node --check trai_brain/mercury-bridge/substrate-digest.js
node --check scripts/mercury-substrate-digest.js
node --check test/mercury-run-ledger.test.js
node --check test/mercury-tool-descriptions.test.js
node --check test/mercury-substrate-digest.test.js
node --check test/mercury-index-scope.test.js
node --check test/mercury-llm-config-contract.test.js
node --check foundation/ConfigLoader.js
node --check test/eval-live-posture-gate.test.js
node --check tools/serena-symbol-scanner.js
node --check tools/dep-scanner.js
node --check tools/serena-bridge.js
node --check test/serena-symbol-scanner.test.js
node --check test/mercury-serena-ast-tools.test.js
npx jest test/mercury-run-ledger.test.js test/mercury-tool-descriptions.test.js test/mercury-substrate-digest.test.js test/mercury-index-scope.test.js test/mercury-llm-config-contract.test.js --runInBand
npx jest test/eval-live-posture-gate.test.js test/mercury-run-ledger.test.js test/mercury-tool-descriptions.test.js test/mercury-substrate-digest.test.js test/mercury-index-scope.test.js test/mercury-llm-config-contract.test.js --runInBand
npx jest test/serena-symbol-scanner.test.js test/mercury-serena-ast-tools.test.js test/mercury-tool-descriptions.test.js test/mercury-index-scope.test.js --runInBand
node scripts/mercury-substrate-digest.js
```

Focused Jest result before the Mercury-found adjacent test cleanup fix:

```text
Test Suites: 5 passed, 5 total
Tests: 68 passed, 68 total
```

Focused Jest result after the ConfigLoader cleanup fix:

```text
Test Suites: 6 passed, 6 total
Tests: 103 passed, 103 total
```

Focused Serena AST result:

```text
Test Suites: 4 passed, 4 total
Tests: 59 passed, 59 total
```

Digest smoke result:

```text
total_runs: 0
canaries.defined: 5
```

`total_runs: 0` is expected until the first real agentic Mercury run writes a
ledger row.

## Guardrails Preserved

- Mercury remains read-only against repo files.
- `run_check` remains behind the existing no-shell and mutation-guarded
  execution path.
- Broad `Mercury, break my fix.` reviews were not re-caged with hidden file
  targets.
- RAG, trace memory, compasses, and rules are routing context and evidence
  surfaces, not replacements for current file:line proof.
- Runtime trading behavior, PM2, broker config, dashboard runtime, and P0
anchors were not changed.

## Mercury Gate Notes

- First broad Mercury pass hit provider `HTTP 503` during client
  initialization; the new run ledger captured it at
  `ogz-meta/cognition-history/mercury-runs/2026-06-27.jsonl:1`.
- Second broad Mercury pass found a real adjacent test hygiene issue:
  `test/eval-live-posture-gate.test.js` restored `process.env` after forcing a
  temporary eval env into `ConfigLoader` cache.
- The cleanup now restores `process.env` and calls `ConfigLoader._resetForTest()`.
  `_resetForTest()` clears `_cached`, `activeEnv`, and `activeEnvSources`.
- Later broad Mercury passes used repo-wide `npm test` / `npm test --silent`
  failures as the remaining objection. Those failures are real in the ambient
  repo test environment, but they fan out across broader ConfigLoader/TTP env
  posture suites. The focused touched suites above pass.
- After the Serena AST tool slice, broad Mercury run
  `ogz-meta/cognition-history/mercury-runs/2026-06-27.jsonl:5` saw the new tool
  registry entries (`serena_property_refs`, `serena_method_callers`,
  `serena_class_fields`) and again blocked on broad `npm test` /
  `ConfigLoader._resetForTest()` env-posture failures. It did not identify a
  Serena AST scanner-specific break. Focused Serena AST tests still passed after
  that run.
- Added a synthetic canary fixture at
  `test/fixtures/mercury-serena-canary/final-close-proof-canary.js` with
  string/comment decoys and one real executable `finalClose` write. First
  Mercury run `...jsonl:6` found the line by opening the file but did not use
  the AST tool. The second run `...jsonl:7` was required to call
  `serena_property_refs` first; it correctly isolated the executable write at
  `test/fixtures/mercury-serena-canary/final-close-proof-canary.js:32` and then
  verified the decoys with `open_file`.
- Harder Mercury audits exposed Serena wildcard scope bugs: repo-wide scopes
  `**/*.js`, `**/*`, and bare `*` were treated as matching no files. Fixed
  `tools/serena-symbol-scanner.js` so those scopes scan repo-wide, added
  regression coverage in `test/serena-symbol-scanner.test.js`, and verified the
  canary query now scans 652 JS files and returns the single executable
  `finalClose` write. A later Mercury rerun used `serena_property_refs` with
  `**/*.js` for multiple close-state fields; the outer shell timed out before a
  final answer, but the tool calls no longer returned false zeroes.

## Open Follow-Ups

- Decide whether repo-wide `npm test` should be made hermetic against the
  current live `.env` posture or documented as non-canonical for this branch.
- Decide whether run-ledger JSONL files stay local/gitignored or curated into
  git after review.
- Promote `find_definition`/`find_references` from regex-backed primitives to
  AST/tree-sitter where recall gaps are proven by canaries.
- Finish the deferred pieces of `ogz-meta/specs/serena-tree-sitter-migration.md`:
  CLI flags, deeper receiver/alias resolution, constructor-assigned class
  fields, and cross-function points-to analysis only where a real audit blocks
  on them.
- Add canary result recording after the first live canary run shape is approved.
