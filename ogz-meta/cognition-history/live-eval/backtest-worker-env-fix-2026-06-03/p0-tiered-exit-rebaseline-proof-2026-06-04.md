# P0 Tiered Exit Rebaseline Proof - 2026-06-04

## Decision

The P0 anchor was rebaselined from the historical over-credited report to the
closed-cost-basis report.

Current executable P0:

- finalBalance: `10000.26792578263`
- totalTrades: `1410`
- winRate: `60.6`
- profitFactor: `1.00`
- report: `backtest-report-v14MERGED-1780535702346.json`
- gate report: `ogz-meta/gates/runs/multi-runtime-latest.json`
- log: `ogz-meta/ledger/phase0-canonical-multi-runtime-gate-2026-06-04.log`

Retired anchor:

- finalBalance: `13255.255799695915`
- totalTrades: `1410`
- winRate: `60.6`
- profitFactor: `1.71`
- report: `backtest-report-v14MERGED-1780390184948.json`

## Root Cause

The retired anchor preserved trade count and win rate, but over-credited tiered
partial exits by recording more closed cost basis than the original entry.

Mechanical comparison:

- Corrected report tier-fraction violations: `0`
- Retired report tier-fraction violations: `350`
- First retired-report violation:
  - group: `2024-03-20T16:15:00.000Z|171.98595|EMASMACrossover|long|TSLA|alpaca|default|stocks|backtest|15m`
  - `profit_tier_1` size: `541.3438261781461`
  - grouped closed size: `1245.090800209736`
  - fraction: `0.43478260869565216`
  - configured cap: `0.30`

## Gate Hardening

`ogz-meta/gates/multi-runtime-gate-runner.js` now validates both summary and
report-shape accounting:

- P0 summary must match `10000.26792578263 / 1410 / 60.6 / 1.00`.
- Tiered exits are grouped by entry identity plus runtime scope.
- `exitReason` is required and normalized by trim/lowercase.
- Unknown tier-like labels are rejected.
- One entry identity may not split across runtime scopes.
- Tier fraction caps are enforced:
  - `profit_tier_1 <= 0.30`
  - `profit_tier_2 <= 0.30`
  - `profit_tier_3 <= 0.20`
  - `profit_tier_4 <= 0.20`

## Verification

Commands run:

```bash
node -c ogz-meta/gates/multi-runtime-gate-runner.js
npm test -- --runInBand test/multi-runtime-p0-accounting-gate.test.js test/order-executor-pause-gate.test.js
git diff --check -- AGENTS.md ogz-meta/BACKTEST-OPS.md ogz-meta/specs/baseline-phase0-2026-05-06.md ogz-meta/gates/multi-runtime-gate-runner.js test/multi-runtime-p0-accounting-gate.test.js core/OrderExecutor.js brokers/AlpacaAdapter.js test/order-executor-pause-gate.test.js trai_brain/mercury-bridge/config.js trai_brain/mercury-bridge/ask.js
node ogz-meta/gates/multi-runtime-gate-runner.js --p0 --write-report
```

Results:

- focused Jest: `2 passed, 44 tests passed`
- P0 write-report: `PASS`
- generated gate report: `ogz-meta/gates/runs/multi-runtime-latest.json`

## Mercury

Mercury prompts/responses:

- First prompt: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-2026-06-04.md`
- First response: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-2026-06-04.response.md`
  - result: HTTP 500 before verdict; not counted.
- Retry prompt: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-retry-2026-06-04.md`
- Retry response: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-retry-2026-06-04.response.md`
  - finding: string-exact `exitReason` bypass.
  - action: normalized/rejected malformed tier labels.
- Final recheck prompt: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-final-recheck-2026-06-04.md`
- Final recheck response: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-final-recheck-2026-06-04.response.md`
  - finding: possible entry identity split across scopes.
  - action: added entry-identity runtime-scope split rejection.
- Final scope recheck prompt: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-final2-recheck-2026-06-04.md`
- Final scope recheck response: `ogz-meta/cognition-history/mercury/p0-tiered-exit-accounting-gate-final2-recheck-2026-06-04.response.md`
  - result: no practical bypass found.
