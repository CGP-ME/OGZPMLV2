# Host behavior observations

Command: node ogz-meta/inbox/codex/2026-09-29/stop1-share-budget/fixtures/observe.cjs baseline; repeat with candidate. Both completed successfully.
Boundary: actual OrderExecutor entry-plan and quantity methods from Git; synthetic settings, prices, broker scope. PolicyBuilder, exit ownership and other collaborators stubbed. No broker submission, fill, deployment or profit proof.

| Case | Baseline quantity | Candidate quantity | Candidate dollars | Absolute ceiling | Outcome |
|---|---:|---:|---:|---:|---|
| BUY-minimum-exceeds-cap | 2 | 0 | 0 | 150 | stock_share_range_impossible:min=2:max=1 |
| BUY-minimum-equals-cap | 2 | 2 | 200 | 200 | plan |
| BUY-minimum-within-cap | 2 | 2 | 200 | 250 | plan |
| BUY-large-request | 2 | 2 | 200 | 250 | plan |
| SELL_SHORT-minimum-exceeds-cap | 2 | 0 | 0 | 150 | stock_share_range_impossible:min=2:max=1 |
| SELL_SHORT-minimum-equals-cap | 2 | 2 | 200 | 200 | plan |
| SELL_SHORT-minimum-within-cap | 2 | 2 | 200 | 250 | plan |
| SELL_SHORT-large-request | 2 | 2 | 200 | 250 | plan |
| existing-max-shares-conflict | 0 | 0 | 0 | 5000 | stock_share_range_impossible:min=2:max=1 |
| existing-notional-conflict | 0 | 0 | 0 | 5000 | stock_share_range_impossible:min=2:max=1 |
| existing-consistency-conflict | 0 | 0 | 0 | 5000 | stock_share_range_impossible:min=2:max=1 |
| existing-daily-loss-conflict | 0 | 0 | 0 | 5000 | stock_share_range_impossible:min=2:max=1 |
| division-rounds-up | 9 | 8 | 40.48 | 45.53999999999999 | plan |
| fractional-range-disabled | 1.25 | 1.25 | 125 | 150 | plan |
| whole-range-disabled | 1 | 1 | 100 | 150 | plan |
| crypto-range-inapplicable | 1.25 | 1.25 | 125 | 150 | plan |

SELL and COVER return null from entry-plan builder in both runs; actual exit execution was not exercised.
AST host scan: 390 JS files, one _applyStockShareRange call in _buildEntryPlan; untruncated. Parse failure ogz-meta/ogz-run.js (top-level return) remains a named coverage absence. Working-tree AST is routing evidence; candidate source above defines reviewed behavior.
Planning Mercury read the working-tree stricter entryBudgetUsd approach and assumed it was intended. That recommendation is rejected: this candidate preserves existing minimum raises within the absolute ceiling. No cap percentages, denominator, aggregate policy or boosted sizing changed.
