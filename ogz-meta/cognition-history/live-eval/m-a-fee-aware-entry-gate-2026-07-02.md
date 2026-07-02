# M-A Fee-Aware Entry Gate Proof - 2026-07-02

## Scope

- Implemented config-owned `risk.feeGate.minEdgeMultiple`.
- Added `fee_edge` risk gate at entry-plan birth in `core/OrderExecutor.js`, after actual notional/share planning.
- Gate math uses `FeeModel.calculateRoundTripFees()`; no ad hoc fee approximation.
- Dashboard gets pass/block `gate_event` rows.
- Successful entries persist `feeEdgeGate` and `riskGates` into state metadata and backtest report rows.
- Entry ledger annotations are copied into the `openPosition` handoff through `_ledgerDataWithEntryAnnotations`; the new fee-gate lane does not mutate incoming `decision.ledgerData.riskGates` or `decision.ledgerData.positionSizing`.

## Verification

- `node --check core/OrderExecutor.js`
- `node --check core/TradingConfig.js`
- `node --check core/BacktestRecorder.js`
- `npx jest test/backtest-recorder-scope.test.js test/order-executor-pause-gate.test.js test/trading-config-profile.test.js test/backtest-worker-env.test.js test/parallel-backtest-solo-env.test.js test/matrix-sweep-surface.test.js test/order-executor-no-emoji.test.js --runInBand`
  - 7 suites passed
  - 203 tests passed
- `npx jest test/order-executor-pause-gate.test.js --runInBand`
  - 1 suite passed
  - 76 tests passed
- `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`
  - PASS
  - finalBalance: `8338.146639366509`
  - totalTrades: `1551`
  - winRate: `52.2`
  - profitFactor: `0.64`
  - totalFeesPaid: `2326.5`
  - report: `/opt/ogzprime/OGZPMLV2/backtest-results/worker-reports/backtest-report-1783007023822-3215696-c3985ff0-2e8d-4195-8663-f148fe2f2486-phase0-canonical-multi-runtime-gate-2026-07-02T15-41-53-301Z-TSLA.json`
  - log: `/opt/ogzprime/OGZPMLV2/ogz-meta/ledger/phase0-canonical-multi-runtime-gate-2026-07-02T15-41-53-301Z.log`
- Mercury/Fable adversarial review:
  - `ogz-meta/cognition-history/mercury-runs/2026-07-02.jsonl:43` found the zero-fee-profile limitation. This is not a fee-negative bypass when configured fees are truly zero, but it proves the gate is only as honest as the active fee profile.
  - `ogz-meta/cognition-history/mercury-runs/2026-07-02.jsonl:44` plus recheck proved failed `fee_edge` returns before `ORDER_PLAN`, pre-order gate, broker/webhook/router, or `StateManager.openPosition`.
  - `ogz-meta/cognition-history/mercury-runs/2026-07-02.jsonl:45` plus recheck proved BUY and SELL_SHORT carry fee gate evidence through open state and backtest rows.
  - `ogz-meta/cognition-history/mercury-runs/2026-07-02.jsonl:47` plus Fable recheck proved the final ledger handoff uses copied annotations at the BUY and SELL_SHORT `openPosition` call sites and that the focused Jest test asserts caller ledger `riskGates` unchanged and `positionSizing` undefined.

## Finding

The initial `2x` threshold does not filter canonical EMA P0. All `1551` P0 report rows carry `feeEdgeGate` and pass:

```json
{
  "gate": "fee_edge",
  "threshold": 3,
  "value": 7.8,
  "passed": true,
  "minEdgeMultiple": 2,
  "expectedMoveDollars": 7.8,
  "roundTripFeeDollars": 1.5,
  "requiredMoveDollars": 3,
  "edgeMultiple": 5.2,
  "takeProfitPercent": 1,
  "positionNotionalDollars": 780,
  "orderQuantity": 4.503204202990589,
  "quantityUnit": "shares"
}
```

This means M-A now gives visibility and blocks mathematically fee-negative tiny entries, but it does not improve the canonical EMA P0 economics at the initial threshold. The next improvement must come from exit geometry / scale-out economics, not from claiming this gate filtered the current P0 loss cluster.
