# Evidence

## Scope

- Branch: `codex/multi-asset-symbol-state`
- Predecessor: `bc536d4059fb929114355225a1f0cd05a11b9621`
- Implementation/config/test paths: 10, enumerated in `WORK.md`
- Packet tapes and dual hashes: `TAPE-HASHES.tsv`

## Provider preflight

Ledger `ogz-meta/cognition-history/mercury-runs/2026-09-01.jsonl:6`, run `2026-09-01T01-20-14-081Z-1640853-128fc953d195`: Mercury `mercury-2` ready; Fable `claude-fable-5` ready from the trusted executable; Kimi returned no applied identity in preflight and was stamped `identity_conflict`. The unattested-executable hard stop did not fire.

## Same-artifact before/after comparison

Artifact: `test/fixtures/mercury-serena-canary/final-close-proof-canary.js`, 44 lines, SHA-256 `38b751bcfa78559b4e26b9f9fdb3759b2a550cd318ba88b27f618bc5950e1a84`.

Before run: `2026-09-01T01-22-17-613Z-fc4db0a558b2`, ledger line 7. Mercury tool calls: `open_file=5`, `search=8`, total 13; Serena calls 0; automatic changed-file candidate count 0. Candidate-set and the nine new required report sections were absent because the old schema did not require or record them. Mercury initially missed the planted partial/final-close contradiction; Fable found it; Mercury rechecked and conceded; Kimi reported pass. Aggregate authority was `UNVERIFIED` due seat disagreement.

After run: `2026-09-01T01-52-34-581Z-b858dff42604`, ledger line 8. Mercury tool calls: `find_references=2`, `grep=1`, `open_file=1`, `search=1`, `serena_method_callers=1`, total 6; automatic pre-answer Serena scans covered 8 changed JavaScript files; seven touched env/config names received `find_references` scans; changed-file candidate count was 10. Mercury omitted all nine required sections and was mechanically capped. Fable and Kimi emitted all nine sections but each reported `5 of 5`, below the host's 10-file floor, so `coverage_insufficient` remained. The canary contradiction was found and converged after recheck. Aggregate authority remained `UNVERIFIED`, as required by the new machine checks.

Comparison: tool calls changed from 13 to 6 by type as listed above; Serena evidence changed from 0 calls to 1 model call plus 8 automatic scans; host candidate coverage changed from unrecorded/0 to 10; required-section presence changed from unrecorded/absent to machine-recorded per seat (Mercury 0/9, Fable 9/9, Kimi 9/9). The after run did not manufacture authority from section presence: its insufficient counts remained capped.

## Full self-review

Run `2026-09-01T01-56-55-777Z-5181c8bf4b98`, ledger line 9, used the unmodified broad frame `Mercury, break my fix.`, explicit `mercury,fable,kimi`, 60 iterations, and 7750 tokens.

Applied identities: Mercury `mercury-2`; Fable `claude-fable-5`; Kimi requested/applied `kimi-k3` but terminated before a complete answer. Kimi is a named `reviewer_answer_absent`, not a dead run. All eleven doctrine/provider quarantines in the ledger carry max-priority ntfy receipts with HTTP 200.

Mercury tool calls: `find_regex=1` failed, `git_diff=1`, `grep=1`, `open_file=5`, `run_check=1` failed, total 9. The host pre-answer scan recorded all 10 touched files, 8 JavaScript Serena scans, and all seven extracted env/config reference scans. Mercury omitted the required schema and was capped. Fable reported `12 of 12` candidates and all required sections, but whole-file/inheritance and sandbox-testimony checks remained absent. Kimi's incomplete response was quarantined. Aggregate verdict: `UNVERIFIED`.

Mercury's only concrete code-break allegation claimed the incomplete-doctrine test expected `fourth_shape_unclassified` with zero Fourth Shape additions. Fable required a focused recheck. Mercury then opened the fixture and implementation, confirmed the fixture contains an added `throw`, confirmed the assertion is correct, and retracted the allegation. No code change was required. The sandbox's exit-127 Jest claim has no authority and was stamped `sandbox_testimony_only`.

## Trusted-path verification

```sh
NODE_PATH=/opt/ogzprime/OGZPMLV2/node_modules \
  /opt/ogzprime/OGZPMLV2/node_modules/.bin/jest \
  test/mercury-doctrine-extension.test.js \
  test/mercury-react-loop.test.js \
  test/mercury-consensus.test.js \
  test/mercury-run-ledger.test.js --runInBand
```

Result: 4 suites passed, 96 tests passed, 0 failed. This trusted VPS result, not model-sandbox `run_check`, is the test receipt.

`git diff --check` scoped to exclude immutable raw tape copies, and `node --check` for every touched production JavaScript file, completed with exit 0. The unscoped whitespace check reports provider-authored Markdown hard-break whitespace in the raw `.log` tape copies; those copies remain byte-for-byte unchanged so their recorded receipt hashes stay valid.

Ruling-7a validation checked 65 committed tape copies against their original-on-box and redacted-as-committed SHA-256 values in `TAPE-HASHES.tsv`; 65 of 65 matched, redaction was idempotent, and no raw provider source directory or source ledger file is staged.

`test/mercury-index-scope.test.js` completed 57 passing and 2 failing tests. Both failures are inherited expectation drift: the test expects `ogz-meta/Alignment` while HEAD indexes `ogz-meta/TheDoctrine`, and expects `ogz_meta_eligible_dirs` while HEAD emits `ogz_meta_eligible_targets`. They are named in `INHERITED.md` and were not misrepresented as a green suite.

## Named absences / NOT proven

- The full self-review is `UNVERIFIED`; no provider PASS is claimed.
- Kimi produced no complete self-review answer.
- No reviewer demonstrated whole-file coverage for all 10 touched implementation/test/config files in the live self-review.
- The model sandbox could not run Jest; only the trusted VPS result has test authority.
- No PM2 action, runtime/broker call, order, activation, env/config change, or bot-code execution occurred.
- No Part C reconciliation, Part D, or Part E work was started.
