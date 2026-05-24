# Eval Go/No-Go Checklist - 2026-05-23

**Repo:** `/opt/ogzprime/OGZPMLV2`
**Branch:** `codex/ttp-eval-gates`
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

## Progressive Signal Trace Ladder

Every pre-eval fix must move the same signal path farther forward or make an existing checkpoint more truthful. Component tests, P0, and Mercury are required gates for hot-path changes, but they are not a substitute for proving where a real signal currently stops.

For each fix, record the earliest checkpoint that is now proven and the earliest checkpoint that is still red/unproven:

| # | Checkpoint | Required proof | Current status |
|---|------------|----------------|----------------|
| 1 | Ingress | Real candle/webhook/signal enters with timestamp, source, symbol, timeframe, account, and trace ID. | Partial: Alpaca candles and hydration are wired; single joined trace ID is still missing. |
| 2 | Normalization | Symbol, broker, asset class, timeframe, and execution mode are canonical before strategy or order logic. | Partial: Alpaca/TSLA defaults and broker quantity planning landed; SessionRouter remains intentionally off. |
| 3 | State Before | Pre-decision state snapshot proves active trades, pauses, halts, balances, and broker positions before action. | Partial: state guards exist; broker reconciliation proof still required before eval. |
| 4 | Strategy Decision | StrategyOrchestrator logs winner, rejected strategies or no-signal reason, confidence, and candle basis. | Partial: smoke/no-signal logs exist; eval trace join key still missing. |
| 5 | Sizing And Intent | Position size, broker order quantity, quantity unit, and sizing config source are visible before gates. | Green for broker quantity mechanics after recent commits; sizing config consolidation remains a separate blocker. |
| 6 | Risk Gates | RiskManager, pause state, kill switch, and drawdown bypass guards produce explicit pass/fail records. | Partial: live bypass guard and paused-state entry enforcement landed; daily loss/max loss eval accounting still open. |
| 7 | Eval Gates | Every TTP rule check logs pass/fail with inputs before broker/webhook side effects. | Partial: 5 percent volume and 15:50 market-time gates landed; daily loss, max loss, earnings, and consistency remain open. |
| 8 | Order Boundary | Broker/webhook request and response are logged with order ID, status, quantity, side, and rejection reason. | Partial: broker quantity routing is fixed; full SignalStack/TTP response trace still needs live-path proof. |
| 9 | State After | State mutates only after broker/webhook outcome, or records a pending/unknown state with reconciliation path. | Partial: live exit quantity truth landed; restart/retry reconciliation still requires explicit proof. |
| 10 | Dashboard/Logs | Dashboard and logs show the same symbol, account, state, rule result, order result, and skip/exit reason. | Partial: dashboard visibility improved; eval trace joins are not complete, and the pretty live trade report/customer stimulation pass is now tracked below. |
| 11 | Restart/Retry | Restart replay cannot duplicate entries, lose broker positions, or claim flat while broker is not flat. | Partial: 15:50 enforcer rechecks broker flatness; global restart reconciliation remains open. |

Commit rule: the commit body or session note for every fix must include `Trace ladder advanced:` and `Next red checkpoint:`. If a fix only improves isolated mechanics without advancing the trace ladder, it can still land, but it does not reduce eval go/no-go risk until a trace checkpoint proves it.

Fix order rule: take the earliest red/unproven checkpoint that can disqualify the eval. Do not jump to later polish while an earlier checkpoint can still hide why a signal stopped or why an order was allowed.

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

## Gate H - Live Trade Report And Dashboard Stimulation

This gate is not a substitute for Gate C signal-path proof. It is the operator/customer presentation layer on top of the same trace data. It must make the live bot easier to understand without ever making the dashboard lie.

- [ ] Build an append-only live trade report feed from existing trace events instead of duplicating trade-path logic in the frontend.
- [ ] Assemble each trade story by trace ID: ingress, normalization, state before, strategy winner, rejected/no-signal reasons, sizing, risk gates, eval gates, broker/webhook boundary, state after, exit trigger, take-profit/stop details, and final PnL.
- [ ] Reuse the existing modular dashboard surfaces first: `confidence-heatbar.js`, `bot-intelligence.js`, `strategy-leaderboard.js`, `trade-replay.js`, `custom-alerts.js`, and `ambient-fx.js`.
- [ ] Feed the existing ensemble/winner UI from real backend payloads. Do not build a second fake strategy slider or duplicate winner display.
- [ ] Fix the `confidenceHeatbar` duplicate-mount landmine before relying on it for the customer report view. The HTML already has `#confidenceHeatbar`; the module must mount into that element instead of creating a second root with the same id.
- [ ] Add the customer psychological stimulation pass as a restrained event-driven visual layer: flashes, light-ups, blinks, glows, pulses, and ambient motion are allowed only when tied to real events.
- [ ] Allowed visual triggers: new signal, strategy winner change, eval gate pass, eval gate block, order sent, broker accepted, broker rejected, state mutation, forced cutoff close, earnings block, consistency cap exit, trade exit, and realized PnL update.
- [ ] Blocked visual triggers: fake profit, synthetic trades, placeholder wins, hydration defaults, stale account values, disconnected broker state, or any success animation not backed by a real trace event.
- [ ] Visual intensity must respect operator mode and reduced-motion settings. Effects must never cover critical price, state, broker, risk, or rule-failure information.
- [ ] The report view must be useful during quiet/no-trade periods: show the latest no-signal reason, data freshness, active symbol/timeframe/account, and last rule checks rather than pretending something happened.

## First Implementation Target

The first code change should be a runtime posture guard because it is small, high-value, and prevents the most dangerous accidental flip:

**Rule:** if `LIVE_TRADING=true`, then `ACCOUNT_DRAWDOWN_BYPASS=true` is illegal and startup must fail loudly before subscriptions, broker routing, or order execution begin.

Second target: implement the 5 percent previous one-minute volume rule as a pre-order eval gate.

Third target: implement the 15:50 ET liquidation/no-entry guard.

Do not combine these in one commit.

## Landed Implementation Sequence

The first three implementation targets have landed as separate commits on `codex/ttp-eval-gates`:

1. Runtime posture guard: `LIVE_TRADING=true` cannot run with `ACCOUNT_DRAWDOWN_BYPASS=true` or `RISK_MANAGER_BYPASS=true`.
2. TTP 5 percent previous one-minute volume rule: pre-order gate blocks oversized opening/add-on stock orders before broker/webhook/state side effects.
3. TTP 15:50 market-time cutoff: blocks late entries, cancels target stock pending orders, closes tracked and broker-orphan target stock positions, and verifies broker flatness before marking complete.

Next implementation target should advance the trace ladder before adding another silent rule. The next root fix is the structured trace spine: a single join key from signal ingress through strategy decision, sizing, risk/eval gates, order boundary, and state-after snapshot. After that, continue with TTP Daily Loss Pause and max-loss boundary using that trace spine.
