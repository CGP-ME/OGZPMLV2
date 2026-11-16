# Structured journal rebuild

Authorization: Trey, November 16, 2026: "okay then lets do that the structured rebuild". This follows the proposed explicit execution-to-reporting connection, reporting-only authority, visible contained failures, preserved history, native behavior receipts, independent review and atomic delivery. Runtime activation is separate.

Baseline: `0f3227a8cb1661a9245227ae4a17006f89773854` on `codex/archive-legacy-env`. The shared tree contains unrelated changes; preserve them. The reporting audit was delivered in `3517c60943235955d8f7fb87d160dff1843593cd`, confirmed as an ancestor of the actual remote head. All three principal reporting implementations match the November 11 audit source hashes.

## Delivery sequence

1. Replace execution/log-function interception with explicit confirmed-entry and confirmed-exit handoffs. Remove the reporting bridge's access to trading-control objects. Contain unavailable journal storage/history to the affected reporting scope, preserve the original files, and send loud failure receipts through the existing alert path. Prove normal capture and continued valid execution under reporting failure before an independent, pinned-source review and atomic push.
2. Repair the journal's record contract and calculations from authoritative fill facts: scope, partial/full close, exit fees, event time, equity and retention/restart behavior. Preserve the existing append-only history format. Prove actual persisted values, not a test-pass count.
3. Complete replay persistence and the existing reporting consumers: restart capture, scoped lookup/listing, honest unavailable values, matching account/symbol/frame, and correct displayed timing/signs. Use the established dashboard authentication path. Preserve existing records and review/deliver independent changes separately.

## Audit disposition

- J01: the REST history failure producer/recovery repair was already delivered in `6391763513d725ba866d88fe1f7f6e7e58313348`; do not redo or roll it into this rebuild.
- J02: reporting startup authority belongs to step 1.
- J06: qualified reporting reconciliation belongs to the explicit data contract; an empty result from a different broker/account cannot clear a reporting entry.
- J07-J11: reporting accounting/scope/units belong to step 2 and its consumers.
- J12-J16: replay persistence, path ownership, protocol and rendering belong to step 3.
- J03-J05: SessionRouter/TransitionStore execution bookkeeping and lock defects are separate from TradeJournal/TradeJournalBridge/TradeReplayCapture. Preserve their audit findings; this rebuild does not grant blanket removal of order identity, reconciliation or locking.
- J17: inspect the reporting writer and replay persistence within this scope. Transition-store history scanning/locking remains a separate finding. Do not claim power-loss durability from ordinary append/rename receipts.

## Acceptance and boundaries

- No reporting component may replace executeTrade/logTrade, decide entry eligibility, mutate positions, route orders, pause/resume trading or stop the bot.
- Malformed persisted input and filesystem failures must produce named evidence; they must not become successful empty history or fabricated statistics.
- Existing confirmed fills and broker identity remain authoritative. Reporting failure does not remove execution reconciliation requirements.
- No new configuration knobs, processes, dependencies, Jest suites or broad cosmetic changes.
- Native observations run only through scripts/test-isolated.py with synthetic accounts/data and explicit fixtures. No real-state corruption or forced live trades.
- No production edit has been made when this plan is first written. Source work, verification, reviews, commit/push and activation will be recorded distinctly in CHANGELOG.md and linked receipts.
