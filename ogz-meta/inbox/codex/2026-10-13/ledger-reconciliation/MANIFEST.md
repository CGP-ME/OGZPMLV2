> Historical October 13 candidate evidence. Superseded for delivery and current verification by [October 16 review](../../2026-10-16/ledger-delivery/REVIEW.md). Old review/approval wording below is historical, not an active instruction; old fixtures require isolated adaptation and are not current acceptance.

# Account reconciliation evidence

Date: 2026-10-13. Source: authorized item 3; branch astra-era, base 329ac1cf3f0a613b191319bec18b433e4e8f5e4b. Production candidate: a68b245cb9d38ace92ec30495529adc77e387766.

Kept to explain and reproduce the connection from confirmed close results through account-scoped reports to the existing SessionRouter transition journal. Fixture account names and balances are artificial and remain under fixtures. No real orders, production journals, settings, PM2 environment, or process state were changed by verification.

- `fixtures/exit-feed.cjs`: executes the two immutable OrderExecutor reporting calls with explicit confirmed-fill fixture inputs. It does not execute broker placement or StateManager.applyFill.
- `fixtures/reconcile.cjs`: isolated actual RiskManager, PnLTracker, SessionRouter and TransitionStore feed-through; fixture REST adapters, durable journal readback.
- `REVIEW.md`: Mercury allegations and Astra/source adjudication, preserving disagreements.
- `RESULTS.md`: commands, observed outcomes and limits.

## Accounting meaning

This is USD cash change since a verified flat account observation, not reconciliation of an inherited starting balance or all past history. A first observation is `baseline_only`. Later reports use only that broker/account's non-simulated confirmed closes after the observation. The existing gross P&L risk totals are unchanged; the comparison separately includes StateManager's net exit result less the proportional stored entry fee. Fee inputs retain their existing modeled-fee provenance.

Missing identity, missing USD cash, simulated execution, unresolved positions/orders, or unprovable post-baseline fill data produce explicit `non_comparable` receipts. They do not claim zero difference. Matching reports and threshold breaches enter the existing transition JSONL; breaches are report-only. Deposits, withdrawals, manual trades and fee differences are unexplained cash deltas, not automatically attributed to bot errors.

The observation and fill history are in memory. Restart/reset starts a new observation. Reports carry their original baseline while retained; after an account's entire report history ages out of the existing 100-report ring, its next receipt explicitly starts another baseline. Nothing overwrites StateManager balance or creates a second persisted ledger. Reports run at the existing router initial-activation and market-handoff snapshots; no periodic polling was added. Production receipt destination remains `data/session-router/transition-events.jsonl`. No dashboard UI was added; durable receipts satisfy the requested output route.
