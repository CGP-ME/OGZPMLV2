# Mercury Attack Prompt - P0 Tiered Exit Accounting Gate Retry - 2026-06-04

Break only this invariant. Do not review unrelated files.

Target:

- `ogz-meta/gates/multi-runtime-gate-runner.js:12-24`
- `ogz-meta/gates/multi-runtime-gate-runner.js:231-295`

The gate now:

- Expects P0 summary `finalBalance=10000.26792578263`, `totalTrades=1410`, `winRate=60.6`, `profitFactor=1.00`.
- Groups report trades by `entryTime|entryPrice|strategyName|direction|symbol|brokerId|accountId|assetClass|executionMode|timeframe`.
- For grouped report trades, rejects `profit_tier_1 > 30%`, `profit_tier_2 > 30%`, `profit_tier_3 > 20%`, or `profit_tier_4 > 20%` of grouped closed size.

Find one concrete bypass where a report produced by this code can still over-credit tiered partial exits and pass this gate. Focus on grouping keys, missing exit reasons, duplicated tiers, report fields, or any arithmetic loophole in the gate itself.

Return file:line evidence and a minimal failing report shape. If no bypass exists, state what you tried and why it fails.
