# config/snapshots/

Per-run snapshots of the resolved ConfigLoader — captured at trade-decision time so every decision ledger entry has an auditable config fingerprint.

## Status

**Phase 1 scaffold only.** No code writes here yet.

## What will live here (Phase 6+)

When Phase 6 of the config consolidation migration lands (`ogz-meta/ledger/CONFIG-CONSOLIDATION-SPEC.md §4.8`), every backtest run and every live trade will emit a snapshot JSON here — the fully resolved ConfigLoader after `.env` + CLI `--set` + `--profile` + `--override` layers are merged and frozen. Each snapshot is keyed by the config fingerprint (content hash), so identical configurations dedupe automatically.

The decision ledger (`ogz-meta/specs/decision-ledger-schema.json` `metadata.configFingerprint`) references snapshots by fingerprint — that pointer is what makes a trade decision reproducible months later.

## Gitignored

This directory is tracked (via `.gitkeep`) but its contents are not. Snapshots are runtime artifacts, not source.
