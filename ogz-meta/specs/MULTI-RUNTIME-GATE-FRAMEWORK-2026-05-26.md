# Multi-Runtime Gate Framework

**Date:** 2026-05-26
**Branch:** `codex/multi-runtime-scope-build`
**Purpose:** establish regression gates for the move from one-symbol operation toward multi-symbol, multi-timeframe, multi-direction, multi-account, and multi-broker execution.

## Why This Exists

The canonical TSLA P0 anchor is still valuable, but it only proves that the historical single-lane EMASMACrossover path did not drift. It does not prove that the bot is safe when more than one symbol, account, timeframe, direction, or broker exists at the same time.

Multi-runtime work therefore needs two gate families:

1. **P0 single-lane regression:** proves the existing TSLA path stayed intact.
2. **Scope integrity gates:** prove new runtime dimensions do not leak, infer, overwrite, or close the wrong position.

The gate runner is:

```bash
node ogz-meta/gates/multi-runtime-gate-runner.js --list
node ogz-meta/gates/multi-runtime-gate-runner.js --scope
node ogz-meta/gates/multi-runtime-gate-runner.js --p0
node ogz-meta/gates/multi-runtime-gate-runner.js --all
```

Use `--write-report` when an auditable JSON result is needed:

```bash
node ogz-meta/gates/multi-runtime-gate-runner.js --scope --write-report
```

Generated reports write to `ogz-meta/gates/runs/multi-runtime-latest.json`.

The scope gates are focused invariant smokes. They do not replace a full live,
paper, or backtest execution path. They exist to catch identity leaks that a
single-symbol P0 cannot see before a broader scenario gate exists.

## Current Gates

| Gate | Type | What It Proves |
|---|---|---|
| `p0.single_lane.tsla_ema_anchor` | P0 | Full canonical TSLA 2-year EMASMACrossover anchor still matches `$13255.255799695915 / 1410 trades / 60.6% WR / PF 1.71`. |
| `scope.state_manager.dashboard_positions` | Scope | `StateManager` projects every active trade as its own scoped dashboard position and marks default-account scope incomplete. |
| `scope.order_executor.dashboard_trade_payload` | Scope | `OrderExecutor` dashboard `trade` frames carry trade identity from the actual trade record, not loose payload fields. |
| `scope.position_tracker.close_selection` | Scope | `PositionTracker` closes by trade id or exact full scope, distinguishes same-symbol different-broker/account trades, rejects scopeKey-only requests, and refuses ambiguous same-scope closes. |
| `scope.position_tracker.scoped_snapshots` | Scope | scoped reads return the requested trade instead of inventing a global first position. |

## Drift Rules

For non-expansion fixes, the P0 anchor must hold exactly.

For intentional expansion work, a moved P0 is still blocked until the commit includes:

1. the old P0 result,
2. the new P0 result,
3. a code-level explanation for why the change is expected,
4. the relevant scope gates proving the new runtime dimension is isolated,
5. Mercury adversarial review or an explicit recorded Mercury outage plus local adversarial review.

Do not update the canonical P0 number inside the same commit as an unrelated runtime fix. Rebaseline is its own explicit commit after the drift is explained and approved.

## Expansion Gate Ladder

These gates are not all implemented yet. They are the acceptance ladder for the rest of the architecture build.

1. **Phase 1 scope contract:** all trade/state/dashboard surfaces carry `executionMode:brokerId:accountId:assetClass:symbol:timeframe`.
2. **Phase 2 scoped scalar compatibility:** existing scalar state can coexist with scoped projections without lying.
3. **Phase 3 multi-symbol single-broker:** TSLA and SPY can hold independent state, exits, dashboard rows, and pattern paths.
4. **Phase 4 multi-timeframe:** one symbol can run multiple timeframes without shared candle-history or indicator leakage.
5. **Phase 5 multi-direction:** long and short positions on the same symbol cannot close or report as each other.
6. **Phase 6 broker capability matrix:** broker order semantics are explicit before routing.
7. **Phase 7 multi-broker runtime:** broker/account scoped state prevents cross-broker reconciliation and execution bleed.

## Mercury Requirement

This runner does not replace Mercury. For hot-path runtime changes, Mercury still attacks the actual patch before commit. The runner gives Mercury and the operator concrete invariants to attack instead of relying on one TSLA backtest number as universal proof.
