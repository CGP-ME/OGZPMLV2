# Evidence

## Baseline and scope

- `git branch --show-current`: `fix/stop1-config`.
- Starting HEAD: `079f91ab34e912b53830406ed16eb571411fb19d`.
- `git log -1 -- trai_brain/mercury-bridge/...`: bridge sources last changed in `3727b75d` before this mission.
- Operator-owned `.claude/settings.json` and all unrelated untracked files were preserved and excluded.

## Trusted-path verification completed before proof replays

Command:

```text
npx --no-install jest test/mercury-doctrine-extension.test.js test/mercury-consensus.test.js test/mercury-react-loop.test.js test/mercury-run-ledger.test.js --runInBand
```

Result: four suites passed; 115 tests passed; zero failed.

Command:

```text
npx --no-install jest test/mercury-consensus.test.js test/mercury-doctrine-extension.test.js test/mercury-embed-index-identity.test.js test/mercury-llm-config-contract.test.js test/mercury-provider-preflight.test.js test/mercury-react-loop.test.js test/mercury-reviewer-panel.test.js test/mercury-run-ledger.test.js test/mercury-serena-ast-tools.test.js test/mercury-substrate-digest.test.js test/mercury-tool-descriptions.test.js test/mercury-trace-memory.test.js --runInBand
```

Result: twelve suites passed; 198 tests passed; zero failed.

Syntax checks for all five touched production JavaScript files and JSON parsing for `mercury.config.json` exited 0. `git diff --check` exited 0.

## Pre-existing suite failures, not represented as green

The unscoped `npx --no-install jest test/mercury-*.test.js --runInBand` result was 12 suites passed and one suite failed; 250 tests passed and seven failed. Re-running `test/mercury-index-scope.test.js` alone reproduced the same seven failures. No file exercised by those failures is modified in this mission (`git diff --exit-code HEAD -- test/mercury-index-scope.test.js trai_brain/mercury-bridge/indexer.js trai_brain/mercury-bridge/tool-adapter.js trai_brain/read_only_tools.js core/trai_core.js mercury.ignore` exited 0).

Two failures are a committed source/test contract mismatch: the test expects all `ogz-meta/Alignment` files and metadata key `ogz_meta_eligible_dirs`, while `indexer.js:30-33,62-78,110-113` permits only `ogz-meta/Alignment/TheDoctrine.md` plus `ogz-meta/specs` and emits `ogz_meta_eligible_targets`. Five failures concern pre-existing isolated-snapshot/search behavior in that same untouched suite. These are named absences, not mission clearance and not silently fixed outside scope.

## Mission proof runs

Pending clean-tree live replays after the provisional atomic commit. Final run IDs, ledger citations, authority receipts, candidate-set subset receipt, recheck carry-forward, raw tape paths, and adjudication will be inserted before the commit is finalized.

## Ruling 7a tapes

Pending proof runs. `TAPE-HASHES.tsv` and redacted committed copies will be populated before finalization.
