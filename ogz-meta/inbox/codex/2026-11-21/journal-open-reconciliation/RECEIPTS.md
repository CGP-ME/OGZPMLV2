# Journal startup reconciliation selection

The November 21 `CHANGELOG.md` entry is the primary record. This is a correction to the rebuilt reporting journal's existing startup caller, not another module rebuild.

| Evidence | Artifact |
| --- | --- |
| Four-line production change | [source.diff](source.diff) |
| Prior caller and actual journal ledger behavior | [baseline.json](baseline.json) |
| Working candidate and actual journal ledger behavior | [candidate.json](candidate.json) |
| Exact staged production source behavior | [pinned.json](pinned.json) |
| Executed isolated helper | [reconcile.cjs](fixtures/reconcile.cjs) |
| Pinned source trees and inherited review harness identity | [source-identity.json](source-identity.json) |
| Single independent review question | [review-command.json](review-command.json) |
| Complete Mercury answer and outcome | [mercury-answer.md](mercury-answer.md), [review.json](review.json) |
| Read-only runtime and source preflight | [activation-preflight.json](activation-preflight.json) |

The helper instantiates the actual `TradeJournalBridge` and `TradeJournal`, writes confirmed synthetic entries to disposable ledgers, and invokes the actual startup reconciliation method. State and broker snapshots are synthetic. The reconciliation writer is instrumented to count calls while executing its real implementation; the outbound snapshot broadcast is observed at its boundary. No host journals, saved positions, credentials, orders, services or learned banks enter the helper.

Before the repair, an open order in StateManager, exposure at the broker, or both caused an unnecessary reconciliation call followed by the journal's refusal warning. Afterward those cases produce no cleanup call and preserve the open journal entry. A genuinely stale target still produces a persisted `OPEN_TRADE_RECONCILED` record, including when another symbol has exposure. Another account is untouched. Unavailable broker evidence preserves the entry and emits the existing reporting-failure evidence. No case writes an invented exit, changes execution state or acquires trading authority.

```sh
python3 scripts/test-isolated.py \
  --fixture ogz-meta/inbox/codex/2026-11-21/journal-open-reconciliation/fixtures/reconcile.cjs \
  -- node ogz-meta/inbox/codex/2026-11-21/journal-open-reconciliation/fixtures/reconcile.cjs
```

Baseline and exact staged runs additionally supplied private source-only override fixtures. The initial helper had an incorrect named-export import, corrected before the saved behavior runs; no production import or journal architecture was changed for that fixture error. No Jest was added or run.

The consumer's proof validation remains in place. This change only selects eligible input records before invoking it. The preflight observed four online canonical processes, paper mode, one saved position, 925 closed-trade rows, no pause and no symbol entry halts. Its source inventory includes the prior 53-file activation manifest plus the journal caller, compared with its previously activated commit. Preflight is not activation; no PM2 restart is claimed for this repair.
