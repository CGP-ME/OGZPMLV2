# Trade Journal Multi-Symbol Attribution Mercury Evidence

Date: 2026-06-22
Branch: codex/multi-asset-symbol-state

## Prompt

Mercury, break my fix. The current uncommitted diff is saved at ogz-meta/cognition-history/mercury/trade-journal-multi-symbol-2026-06-22/diff.patch because the bridge cannot inspect git diff directly. Attack that diff and the current repo behavior. Do not verify it. If you find a concrete break, start with CONCRETE_BREAK_FOUND and cite the exact non-artifact repo file:line that causes it. If you cannot cite a non-artifact repo file:line that causes the break, start with NO_CONCRETE_BREAK_FOUND and cite the repo file:lines you inspected.

## Result

NO_CONCRETE_BREAK_FOUND

Mercury inspected the diff artifact, `test/trade-journal-bridge-scope.test.js`, and `core/TradeJournalBridge.js`. The accepted final answer did not identify a concrete break in multi-symbol journal directories, combined snapshots, replay lookup/list, stats, or breakdown aggregation.

## Focused Tests

Command:

```bash
npx jest test/trade-journal-bridge-scope.test.js test/trade-journal-today-stats.test.js test/eval-signal-path-proof.test.js --runInBand
```

Result: 3 suites passed, 69 tests passed.

## P0 Anchor

Command:

```bash
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
```

Result: PASS.

Report: `ogz-meta/gates/runs/multi-runtime-latest.json`

Anchor summary:

- finalBalance: 10710.667785934895
- totalTrades: 1692
- winRate: 62.8
- profitFactor: 1.15
- maxDrawdownPercent: 3.87
