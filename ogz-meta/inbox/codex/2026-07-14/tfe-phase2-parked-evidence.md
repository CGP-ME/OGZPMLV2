# TFE Phase 2 Parked Evidence

Date: 2026-07-14

## Source

- Worktree: `/opt/ogzprime/OGZPMLV2-tfe-phase2`
- Branch: `codex/tfe-phase2`
- Base at salvage time: `5b185695c86e6b3514c6cf6a6e9036dc9745f635`

## What Was Preserved

- `tfe-phase2-killsite1-diff.patch`
  - Dirty tracked diff from the parked worktree.
  - Runtime file: `run-empire-v2.js`
  - Test file: `test/single-broker-subscription-symbols.test.js`
- `tfe-phase2-killsite1-p0.log`
  - Failed P0 attempt from the parked worktree.

## What Was Not Merged

The Phase 2 dirty code was not merged into the active branch. The collapse only
merged the approved TFE Phase 1 commit from `codex/tfe-phase1`.

## Failure Captured

The parked P0 attempt failed before producing anchor stats:

```text
[FATAL] Fatal error: Error: [Alpaca] ALPACA_SYMBOLS must provide at least one symbol
```

The parked diff addresses a SessionRouter OHLC payload with missing timeframe by
dropping the payload instead of defaulting it to `1m`. That behavior remains a
future Phase 2 review item.
