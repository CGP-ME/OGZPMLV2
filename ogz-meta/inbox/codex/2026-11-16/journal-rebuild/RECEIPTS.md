# Structured reporting journal rebuild receipts

The execution boundary is verified in isolated native paper execution and reviewed against the exact staged source. Live activation has not occurred. The accounting/history and replay/UI work are separate deliveries.

- `boundary-native-receipts.json`: actual persisted trade/fee/time values, failure behavior and source hashes.
- `boundary-review-receipt.json`: pinned source, independent votes, rejected first draft and explicit review limitations.
- `PLAN.md`: authorized scope and audit disposition.

Raw logs, provider transcripts, source overlays and generated specifications remain local supporting evidence; they are not part of the delivery. No real account data or credentials were used in the observations.

## Reproduce against a clean checkout of this delivery

Run from the repository root. Each command starts a disposable isolated snapshot. `--current` reads that snapshot; do not use it as proof of this commit if the shared source has other edits.

```bash
python3 scripts/test-isolated.py --fixture ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-boundary.cjs -- node ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-boundary.cjs --current --long --partial
python3 scripts/test-isolated.py --fixture ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-boundary.cjs -- node ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-boundary.cjs --current --fail-write
python3 scripts/test-isolated.py --fixture ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-boundary.cjs -- node ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-boundary.cjs --current --corrupt
python3 scripts/test-isolated.py --fixture ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-reporting.cjs -- node ogz-meta/inbox/codex/2026-11-16/journal-rebuild/fixtures/observe-reporting.cjs --current
```

The null/incomplete-input observation is preserved in `fixtures/observe-reporting-inputs.cjs`. It reproduces a draft defect; it does not establish production occurrence. No additional review cycle is justified by hypothetical inputs or stylistic preferences alone. Findings must show a reachable impact on execution, record preservation or reporting truth.
