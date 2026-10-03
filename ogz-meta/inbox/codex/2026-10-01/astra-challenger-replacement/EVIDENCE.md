# Evidence

Source identity and complete scoped diff are in `delivery/candidate.json` and `delivery/candidate.patch`. The earlier broad-reviewed candidate is retained separately as `delivery/reviewed-candidate.json` and `.patch`. The final code and this accountability packet are intended as one containing commit; its Git identity is the delivery SHA reported to Trey, not an invented self-referential SHA inside these files.

## Actual execution

- `subscription-identity.json`, `http.stdout.txt`, `http.stderr.txt`: actual Codex ChatGPT-subscription invocation; provider SSE stamps `gpt-6-astra`. The requested CLI argument alone is not used as actual-model evidence.
- `adapter-smoke.json`, `adapter.stdout.txt`, `adapter.stderr.txt`: adapter invoked Astra, used source-reading tools and returned the Mercury/Astra/Kimi seat names. No Claude fallback or Sol substitution was used.
- `final-review.json`: complete Mercury broad review, request/source identities, before/after harness hashes, stage records and answer. Source under review and the dirty review harness are separately identified. The harness includes inherited transport changes that are excluded from this commit.
- `recheck-result.json`: Mercury's same-source caller recheck withdrew its unsupported Claude-alias allegation.
- `astra-review.json`: real verified Astra invocation failed on subscription usage; partial answer and exact provider failure are retained.
- `astra-review-after-reset.json`: actual verified Astra review completed after Trey reset usage. It rejected the old alias allegation and identified executable-trust policy and false-readiness behavior.
- `correction-review.json`: Mercury examined corrected readiness propagation. Its unsupported prose about inline answers/version mismatch is explicitly corrected in PROMPT-AUDIT.md.
- `astra-correction.json`: subsequent verified Astra attempt ended incomplete, preserving its partial parser finding. It is not a completed approval.
- `prompt-audit.json`: 73 raw-response hashes checked, complete continuation tool inventory, request sizes and named inspection limits. No claim that every historical Mercury review was audited.

All delivered files are under `delivery/`; `delivery/tape-manifest.json` maps original-on-box SHA-256 and redacted-as-committed SHA-256, sizes and source paths. Raw provider tapes accompany the structured receipts. Redaction removes secrets, not adverse findings. Private originals remain on the box and are excluded from staging.

The existing ledger redactor replaced some raw receipt filenames with `[REDACTED]`. `delivery/receipt-aliases.json` reconnects those recorded identities to delivered tapes by exact original SHA-256; no filename is guessed. Two nested already-redacted test-fixture assignments in displayed diffs receive an additional placeholder redaction, explicitly recorded in the tape manifest. Original patches and candidate Git objects remain intact; delivered patches are redacted review displays, not byte-identical application inputs.

## Behavior verification

The focused tests cover subscription credential routing, actual versus requested model identity, answer preservation through missing/wrong identity, timeout, incomplete output and malformed tapes, raw receipt persistence, tool events/catalogs, source snapshot routing, Kimi tool restriction, panel sequencing and exact-answer linkage. Added parser proofs cover null/non-object frames and malformed namespace entries retaining both tapes and the answer.

Working-source command:

```
npx jest --runInBand test/mercury-provider-preflight.test.js test/mercury-astra-challenger.test.js test/mercury-llm-config-contract.test.js
```

Exact-candidate command:

```
npx jest --runInBand --no-cache --config ogz-meta/inbox/codex/2026-10-01/astra-challenger-replacement/candidate-jest.json test/mercury-provider-preflight.test.js test/mercury-astra-challenger.test.js test/mercury-llm-config-contract.test.js
```

The transform reads the named Git tree for each mission file. Logs distinguish earlier candidate tests from the final parser candidate. Test fixtures use mocks and do not call paid reviewers. The baseline consumer-suite failures are retained in `baseline-consumer-tests.log`; retired authority-cap expectations are not restored merely to make those tests green.

Final exact-candidate log: `delivery/completion-candidate-tests.log`, 57 passed across three suites on tree `a9808f2f6216788eb0dcb67ae5a4791aeba6e2c1`. Final independent receipts: `delivery/completion-mercury.json`, `delivery/completion-astra.json`; Astra returned no_break_found, verified `gpt-6-astra`, termination stop. Earlier incomplete/incorrect answers remain separately delivered. These results precede commit/push and do not imply runtime activation.

## Named absences

No Kimi final adjudication, universal provider payload-bound proof, first-pass Mercury accuracy guarantee, production bot deployment, PM2 restart, exhaustive historical-receipt replay, or controlled prompt A/B experiment is claimed. Codex's configured token setting is recorded but not enforced as a CLI output-token cap. Tool-request counts are not invented execution-success counts. A reviewer answer, parser result or test count alone is not approval.
