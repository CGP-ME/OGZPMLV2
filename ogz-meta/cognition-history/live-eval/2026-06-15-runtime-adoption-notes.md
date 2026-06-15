# 2026-06-15 Live Eval Runtime Adoption Notes

## Scope

Runtime-only adoption notes for `ogz-prime-v2` on `claude/new_beginnings`.
Runtime adoption and the subsequent EMA trace-contract code fix are both noted
here so the live capture and code proof do not drift apart.

## PM2 Runtime Changes

At approximately `2026-06-15T15:22Z`, `ogz-prime-v2` was restarted with the
existing PM2 environment preserved and the following non-secret eval values
overlaid:

- `MIN_TRADE_CONFIDENCE=0.90`
- `TTP_ACCOUNT_START_OF_DAY_DATE=2026-06-15`
- `TTP_EARNINGS_STATUS_JSON={"date":"2026-06-15","symbols":{"TSLA":false}}`
- `TTP_ACCOUNT_START_OF_DAY_EQUITY=5000`
- `TTP_DAILY_LOSS_LIMIT_DOLLARS=50`
- `TTP_MAX_LOSS_THRESHOLD_EQUITY=4850`
- `TTP_PROFIT_TARGET_DOLLARS=300`

At approximately `2026-06-15T15:25Z`, `ogz-prime-v2` was restarted again with
the existing PM2 environment preserved and the following ATR values overlaid:

- `ATR_FILTER_ENABLED=true`
- `ATR_MIN_PERCENT=0.15`

Secrets were not printed or copied into this note.

## Verified After Restart

Post-restart PM2 environment showed:

- `EXECUTION_MODE=live`
- `LIVE_TRADING=true`
- `PAPER_TRADING=false`
- `WEBHOOK_DRY_RUN=false`
- `ALPACA_SYMBOLS=TSLA`
- `TRADING_PAIR=TSLA`
- `CANDLE_TIMEFRAME=15m`
- `MIN_TRADE_CONFIDENCE=0.90`
- `ATR_FILTER_ENABLED=true`
- `ATR_MIN_PERCENT=0.15`
- `EVAL_RULES_ENABLED=true`
- `TTP_RULES_ENABLED=true`
- `TTP_ACCOUNT_START_OF_DAY_DATE=2026-06-15`
- `TTP_EARNINGS_STATUS_JSON={"date":"2026-06-15","symbols":{"TSLA":false}}`

`node ogz-meta/gates/eval-live-posture-gate.js --pm2 ogz-prime-v2` returned
`PASS` after the confidence/TTP restart and again after the ATR restart.

## Live Data Proof

After the ATR restart, the log showed Alpaca authenticated, subscribed to TSLA
bars, and received a live TSLA bar:

- `First bar RX for TSLA @ 2026-06-15T15:25:00Z`
- `CANDLE_INGRESS` with `executionMode="live"`, `assetClass="stocks"`,
  `brokerId="alpaca"`, `symbol="TSLA"`, `timeframe="1m"`
- `CANDLE_NORMALIZED` with the same live/stocks/TSLA scope

The runtime remains configured for `15m`; Alpaca stream input is `1m` and is
routed into the active `15m` context.

Follow-up monitor at `2026-06-15T15:32Z` showed:

- `CANDLE_INGRESS=7`
- `CANDLE_NORMALIZED=7`
- `OHLC][Aggregate=0` in the post-restart output slice
- `TRADING_CYCLE_TRIGGER=0`
- `ANALYSIS_START=0`
- `STRATEGY_DECISION=0`
- `EVAL_RULE_CHECK=0`
- `ORDER_EXECUTE_START=0`

The error log mtime advanced at `2026-06-15T15:32Z` because the runtime refused
an incomplete `1m->15m` aggregate for the `2026-06-15T15:15:00Z` period. That
period was already in progress when the process restarted at `15:25Z`, so only
5 of 15 one-minute bars were available. This is a current warning, but it is
not an earnings or entry-gate block.

Follow-up monitor at `2026-06-15T15:48Z`, after the first complete post-restart
`15m` period, showed the full live path:

- `CANDLE_INGRESS=23`
- `CANDLE_NORMALIZED=23`
- `ACTIVE_CANDLE_AGGREGATED=1`
- `CANDLE_ACCEPTED=1`
- `TRADING_CYCLE_TRIGGER=1`
- `ANALYSIS_START=1`
- `STRATEGY_DECISION=1`
- `EVAL_RULE_CHECK=1`
- `ORDER_EXECUTE_START=1`

The trace `candle_1781538300214_sotm3b` reached:

- `ACTIVE_CANDLE_AGGREGATED`: `sourceTimeframe="1m"`,
  `activeTimeframe="15m"`, `executionMode="live"`
- `STRATEGY_DECISION`: `winnerStrategy="EMASMACrossover"`,
  `direction="buy"`, `confidencePct=100`
- `ORDER_PLAN`: `side="buy"`, `orderQuantity=1`,
  `entryStrategy="EMASMACrossover"`
- `EVAL_RULE_CHECK`: `allowed=true`, `failedRules=[]`,
  `passedRules=["TTP_MARKET_TIME","TTP_EARNINGS_RESTRICTION","TTP_MAX_LOSS","TTP_DAILY_LOSS_PAUSE","TTP_VOLUME_5_PERCENT"]`
- `WEBHOOK_ORDER_DISPATCH`: `quantity=1`, `quantityUnit="shares"`
- `WEBHOOK_ORDER_RESULT`: `success=true`, `sent=true`, `httpStatus=201`,
  `dryRun=false`
- `STATE_MUTATION`: `success=true`, `operation="openPosition"`
- `EXECUTE_RETURN`: `success=true`, `orderAccepted=true`,
  `stateMutationSucceeded=true`

This proves the live TSLA 15m capture path from Alpaca 1m stream through
aggregation, strategy decision, eval rule gate, SignalStack webhook dispatch, and
local state mutation. It does not prove broker REST reconciliation because the
eval posture gate reports no Alpaca broker position while local state now has the
SignalStack-opened trade.

## Flatness Proof

After restart:

- `data/state.json` had `inPosition=0`, `position=0`, and no active trade keys.
- The eval posture gate reported `localActiveTrades=[]` and `brokerPositions=[]`.
- `TradeJournal` rebuilt from ledger with 6 completed trades and 0 open
  positions.

After the `15:45Z` live order:

- Local `data/state.json` has one active long TSLA trade, order `43118487`,
  entry price `409.945`, size `$409.945`, quantity `1`.
- `node ogz-meta/gates/eval-live-posture-gate.js --pm2 ogz-prime-v2` now
  returns `FAIL` because eval-live readiness requires a flat local state and the
  local state is no longer flat.
- The same gate reports `brokerPositions=[]`; treat this as an open
  reconciliation visibility gap for SignalStack-routed eval execution, not as
  proof that the local trade did not occur.

## EMA Trace-Contract Fix

The live trade still came from the old running code and recorded:

- `reason="EMA/SMA Crossover buy (0 crosses)"`
- no structured signal-basis or crossover-count fields in the persisted
  `signalBreakdown`, `strategySignals`, or `orchestratorDecision`

That ambiguity was fixed in source after the live trace:

- `core/StrategyOrchestrator.js` now labels EMA output as
  `fresh_crossover` only when `sig.crossovers.length > 0`; zero fresh crosses
  are labelled `ma_alignment` and rendered as `EMA/SMA Alignment ... (no fresh
  crosses)`.
- `signalData`, `signalBreakdown.signals`, `TradingLoop` ledger strategy
  signals, competing-strategy records, execution handoff traces, and dashboard
  strategy-stack frames now carry structured `signalBasis` and `crossoverCount`
  where the strategy provides them.

Proof run:

- `npx jest test/strategy-orchestrator-ema-crossover-validity.test.js test/strategy-orchestrator-contract-confidence.test.js --runInBand`:
  pass, 2 suites / 10 tests.
- Mercury adversarial pass:
  `ogz-meta/cognition-history/mercury/ema-zero-cross-candidate-guard-2026-06-15.md`.
  First Mercury pass rejected a blunt zero-cross block as too aggressive; final
  pass confirmed the orchestrator cannot produce a crossover label when
  `crossoverCount=0` and identified downstream projection as the correct
  hardening target.
- `node ogz-meta/gates/multi-runtime-gate-runner.js --p0`: pass.

This source fix has not been adopted by the running PM2 process yet. Restarting
while order `43118487` is open is an operator decision.

## Stale Error Tail Clarification

`pm2 logs --lines` still prints old error-log lines for:

- `TTP_MARKET_TIME liquidation incomplete`
- `TTP_EARNINGS_RESTRICTION`
- old incomplete `1m->15m` aggregation warnings

Those lines are stale tail output. The PM2 error log mtime stayed at
`2026-06-15 15:15:00 +0000` while the adopted runtime restarted at
`2026-06-15T15:25:12Z`. No new error-log writes were observed after the ATR
restart during this check.

## Still Open

- A fresh post-ATR `TRADING_CYCLE_TRIGGER -> ANALYSIS_START ->
  STRATEGY_DECISION -> EVAL_RULE_CHECK -> WEBHOOK_ORDER_RESULT ->
  STATE_MUTATION -> EXECUTE_RETURN` sequence has now been observed for trace
  `candle_1781538300214_sotm3b`.
- Profile ownership is still not fully adopted: the eval posture gate reports
  `selectedRuntimeProfile=null`.
- Runtime is still TSLA-only and single active timeframe. Multi-symbol and
  multi-timeframe are architecture work, not proven live eval posture.
- The running PM2 process has not adopted the EMA trace-contract source fix yet.
- Local state is not flat after the live order. Eval-live readiness gate will
  intentionally fail until the position is closed/reconciled.
