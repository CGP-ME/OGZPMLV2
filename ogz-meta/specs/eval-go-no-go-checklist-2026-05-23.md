# Eval Go/No-Go Checklist - 2026-05-23

**Repo:** `/opt/ogzprime/OGZPMLV2`
**Branch:** `rebuild/clean-from-baseline`
**Purpose:** Define the exact proof required before Trey clicks go on a Trade The Pool eval.

This checklist separates two different gates:

1. **Bot health:** the bot is online, receiving real market data, producing decisions, mutating state correctly, and logging the full signal path.
2. **Eval eligibility:** the bot is incapable of placing an eval-disqualifying trade without a logged rule failure being ignored.

Passing bot health is not enough to start the eval. The eval rule layer is a hard go/no-go gate.

## Current Verdict

**Status:** NO-GO for eval.

The current runtime is an approved dry-run/simulation posture, not an eval posture:

- `PAPER_TRADING=true`
- `LIVE_TRADING=false`
- `WEBHOOK_DRY_RUN=true`
- `ACCOUNT_DRAWDOWN_BYPASS=true`
- `BROKER=alpaca`
- `ASSET_CLASS=stocks`
- `ALPACA_SYMBOLS=TSLA`
- `SESSION_ROUTER_ENABLED=false`
- `ENABLE_TRAI=false`

This can be used for readiness tracing, but it must not be treated as eval-ready until the rule engine and runtime flag guards below are implemented and verified.

## Operating Doctrine

State is the bot's active world model. Broker data is external reality. Logs are the forensic record proving why the bot changed its belief.

Before eval, every test signal must answer these questions without guessing:

1. What entered the system?
2. What symbol, broker, asset class, timeframe, and account did it normalize to?
3. What state existed before the decision?
4. What strategy decision was made?
5. Why was that decision made?
6. What risk gates ran?
7. What eval rules ran?
8. What broker or webhook action was attempted?
9. What broker or webhook response came back?
10. What state changed after the response?
11. What log line joins each step by trace ID, signal ID, trade ID, or order ID?
12. What happens on retry or restart?

If any answer is missing, the path is not eval-ready.

## Gate A - Runtime Posture

These flags must be verified from the running PM2 process, not only from `.env`.

- [ ] `BROKER=alpaca`
- [ ] `ASSET_CLASS=stocks`
- [ ] `ALPACA_SYMBOLS=TSLA`
- [ ] `TRADING_PAIR=TSLA`
- [ ] `SESSION_ROUTER_ENABLED=false` unless the full SessionRouter/pattern-bank isolation spec is landed and verified.
- [ ] `ENABLE_TRAI=false` unless Fix 18/Fix 19 TRAI phantom defaults are fixed and verified.
- [ ] `PAPER_TRADING=false` or explicit eval destination mode is selected.
- [ ] `LIVE_TRADING=true`
- [ ] `WEBHOOK_DRY_RUN=false`
- [ ] `RISK_MANAGER_BYPASS=false`
- [ ] `ACCOUNT_DRAWDOWN_BYPASS=false`
- [ ] Startup hard-fails if `LIVE_TRADING=true` and `ACCOUNT_DRAWDOWN_BYPASS=true`.
- [ ] Startup hard-fails if `LIVE_TRADING=true` and `WEBHOOK_DRY_RUN=true`, unless the selected broker path is a verified direct live broker route and SignalStack is intentionally disabled.

## Gate B - State And Broker Truth

- [ ] `data/state.json` is flat before eval start: no active trades, no symbol halts, no stale recovery mode, no pause reason, no stored last error.
- [ ] Broker account reports no open position for the eval symbol before eval start.
- [ ] Local state and broker positions match before any eval order is allowed.
- [ ] State writes include immutable `brokerId`, `assetClass`, `executionMode`, `timeframe`, and `scopeKey`.
- [ ] State mutation happens only after the broker/webhook boundary outcome is known, or the code logs an explicit pending/unknown state with retry reconciliation.
- [ ] Restart reconciliation proves the bot does not duplicate entries or lose open positions.

## Gate C - Signal Path Proof

One live-market dry-run signal must be traced end-to-end during market hours.

- [ ] Real TSLA candles enter from Alpaca.
- [ ] Candle timestamps are fresh and aligned to the active timeframe.
- [ ] REST boot hydration and WebSocket stream agree on symbol/timeframe shape.
- [ ] StrategyOrchestrator receives the expected candle set.
- [ ] No-signal cycles log the exact reason: insufficient warmup, null strategies, threshold failure, direction filter, risk gate, eval rule, or adapter failure.
- [ ] Signal cycles emit a `traceId` or equivalent join key that can be followed through logs.
- [ ] The path proves either a trade intent or a specific skip reason.
- [ ] The dashboard reflects the same symbol, timeframe, and account state as the backend.

## Gate D - Eval Rule Engine

The eval rule engine must run after strategy/risk sizing and before any broker or webhook order intent.

Required output shape for every candidate:

```json
{
  "event": "EVAL_RULE_CHECK",
  "traceId": "...",
  "signalId": "...",
  "symbol": "TSLA",
  "accountId": "...",
  "allowed": true,
  "failedRules": [],
  "passedRules": [
    "TTP_VOLUME_5_PERCENT",
    "TTP_MARKET_TIME",
    "TTP_DAILY_LOSS_PAUSE",
    "TTP_MAX_LOSS",
    "TTP_EARNINGS_RESTRICTION",
    "TTP_CONSISTENCY_GUARD"
  ],
  "inputs": {
    "accountStartOfDayEquity": 50000,
    "currentEquity": 50000,
    "maxLossThreshold": 0,
    "dailyPauseThreshold": 0,
    "previousOneMinuteVolume": 0,
    "proposedOrderShares": 0,
    "proposedOrderNotional": 0,
    "currentTimeET": "2026-05-23T00:00:00-04:00",
    "hasEarningsTonight": false
  }
}
```

Failure shape:

```json
{
  "event": "EVAL_RULE_CHECK",
  "traceId": "...",
  "signalId": "...",
  "symbol": "TSLA",
  "allowed": false,
  "failedRules": [
    {
      "ruleId": "TTP_VOLUME_5_PERCENT",
      "previousOneMinuteVolume": 10000,
      "maxAllowedShares": 500,
      "proposedShares": 650,
      "action": "BLOCK_ORDER"
    }
  ]
}
```

An order intent must not exist when `allowed=false`.

## Gate E - Trade The Pool Rule Coverage

These rules must be implemented or explicitly handled before eval:

- [ ] 5 percent previous one-minute volume rule blocks oversized opening and add-on trades.
- [ ] Previous one-minute candle with zero volume falls back to the most recent one-minute candle with volume.
- [ ] Multiple same-instrument add-on orders cannot aggregate past the 5 percent volume cap.
- [ ] 15:50 ET day-trading liquidation behavior is enforced or reconciled with broker-side auto-liquidation.
- [ ] New entries are blocked inside the configured pre-liquidation window.
- [ ] Scheduled earnings-night restriction is enforced from a verified earnings source or a manual no-trade calendar gate.
- [ ] Daily Loss Pause is calculated from start-of-day balance and does not recalculate intraday.
- [ ] Max-loss/account-disable boundary is enforced and logged.
- [ ] Consistency/profit-concentration guard is tracked and visible, even if it starts as advisory until the exact program threshold is confirmed.
- [ ] Copy-trading rules are documented as not applicable unless multi-account execution is enabled.

## Gate F - Regression Tests

Each eval rule must have focused test coverage:

- [ ] 5 percent volume pass.
- [ ] 5 percent volume fail.
- [ ] Zero previous-minute volume fallback.
- [ ] Multi-order aggregate cap fail.
- [ ] 15:49:59 ET entry behavior.
- [ ] 15:50:00 ET liquidation/no-entry behavior.
- [ ] Earnings-night block.
- [ ] Daily loss pause from start-of-day balance.
- [ ] Max loss boundary.
- [ ] Illegal runtime flag combination hard-fails startup.

## Gate G - Verification And Commit Discipline

- [ ] One logical code change per commit.
- [ ] Mercury attack for hot-path rule-engine changes.
- [ ] Focused tests for the changed rule.
- [ ] P0 anchor run if the trading/backtest execution path changed.
- [ ] PM2 restart only after the specific change is committed and approved.
- [ ] Verify `ogz-prime-v2` runtime env after restart.
- [ ] Verify state file and broker account after restart.
- [ ] Verify logs contain the rule check and the broker/order boundary outcome.
- [ ] Push the passing commit before cowork/GitHub ZIP verification.

## First Implementation Target

The first code change should be a runtime posture guard because it is small, high-value, and prevents the most dangerous accidental flip:

**Rule:** if `LIVE_TRADING=true`, then `ACCOUNT_DRAWDOWN_BYPASS=true` is illegal and startup must fail loudly before subscriptions, broker routing, or order execution begin.

Second target: implement the 5 percent previous one-minute volume rule as a pre-order eval gate.

Third target: implement the 15:50 ET liquidation/no-entry guard.

Do not combine these in one commit.
