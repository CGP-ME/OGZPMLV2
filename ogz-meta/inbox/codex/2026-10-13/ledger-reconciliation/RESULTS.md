> Historical October 13 candidate evidence. Superseded for delivery and current verification by [October 16 review](../../2026-10-16/ledger-delivery/REVIEW.md). Old review/approval wording below is historical, not an active instruction; old fixtures require isolated adaptation and are not current acceptance.

# Item 3 verification

Production candidate: `a68b245cb9d38ace92ec30495529adc77e387766`; base `329ac1cf3f0a613b191319bec18b433e4e8f5e4b`. Exact production blob identities and review harness identity are in source-manifest.json.

## Observed behavior

Command: `MERCURY_HARNESS_TREE=a68b245cb9d38ace92ec30495529adc77e387766 node ogz-meta/inbox/codex/2026-10-13/ledger-reconciliation/fixtures/reconcile.cjs`

PASS: seven fresh durable journal events read back from a uniquely isolated fixture directory. The test executes actual immutable OrderExecutor reporting statements, RiskManager, PnLTracker, SessionRouter reconciliation, and TransitionStore serialization/readback. REST adapters and post-applyFill confirmed results are explicit fixture inputs. It does not claim a complete broker order/StateManager execution or PM2 rehearsal.

- First flat observations: Kraken USD cash 1000; Alpaca USD cash 2000. Both report baseline_only, without claiming historical reconciliation.
- Kraken long partial closes: net 95 + 45 = 140 after proportional entry-fee allocation. Expected 1140; broker 1140; delta 0.
- Alpaca short partial closes: net -14.4 - 26.6 = -41. Expected 1959; broker 1959; delta 0.
- A different account and a simulated trade are excluded from both comparisons.
- Deliberate later broker balances 1139 / 1961 produce -1 / +2 discrepancies and retain original baselines. Journal and emitted payload match exactly.
- Enabled threshold produces an alert; disabled reporting alerts remain off. Neither changes own P&L state or trading permission.
- Missing identity, missing USD cash, non-flat positions, paper mode, and unproven fill scope are explicitly non-comparable. The existing non-flat transition refusal remains unchanged and its failure journal also contains the report.
- One hundred successive retained reports keep the original baseline; reset starts a new baseline.

The retained fixture receipt is fixtures/receipt.json. Generated reruns remain separate so older evidence is not overwritten or mixed into the current readback.

## Other checks

All four changed production files passed node syntax checks. The existing risk-manager-config suite ran: eight checks passed, including the updated unscoped-input expectation; one existing census check failed because it reads the retired config/trading.config.json. That stale path exists in the base test and the file is absent in the base tree. No replacement config or unrelated test overhaul was introduced.

## Review and delivery

Astra found no introduced break, then independently adjudicated Mercury's six allegations (REVIEW.md). Mercury's second run `2026-10-13T20-24-15-024Z-fc0cdb31457a` correctly separated three unchanged OrderExecutor findings, but still returned found_break for removing the equity fallback and requiring the existing RiskManager producer. Neither finding supplied a reachable invalid runtime producer. Both verdicts are preserved; neither is called clean. Delivery requires Trey's explicit exception to the clean-Mercury rule, or a genuinely clean review.

No PM2 restart, environment change, real order, or production journal write occurred. Item 5 remains the joint controlled paper walkthrough. Item 2 is deferred. Item 4 remains a ruling, not activated behavior.
