# Multi-Runtime Implementation Spec - 2026-05-25

## Purpose

This spec converts the recovered architecture docs into the build plan for the
platform Trey originally described: multi-broker, multi-symbol,
multi-position, multi-direction, and multi-timeframe trading without fake
dashboard truth or symbol/broker state bleed.

This is not a rewrite license. It is the ordered implementation contract that
keeps the current bot working while the runtime expands one proven slice at a
time.

## Source Inputs

- `ogz-meta/specs/therestofthearchitecture.md`
- `ogz-meta/specs/OPERATOR-DESIGN-GAPS.md`
- `ogz-meta/specs/thisiswhatimtalkingabout.md`
- `ogz-meta/specs/MULTI-RUNTIME-CAPABILITY-AUDIT-2026-05-25.md`
- `ogz-meta/specs/eval-go-no-go-checklist-2026-05-23.md`
- `ogz-meta/sessions/session-2026-05-24-eval-trace-and-ttp-rule-gates.md`
- `ogz-meta/codex-design/02-ARCHITECTURE-DESIGN-ADDENDUM-SESSIONROUTER-SAGA-INVARIANTS-2026-05-20.md`

The first three recover the original architecture intent and archive-code
inventory. The capability audit is the current-code bridge and supplies the
implementation ladder. The eval checklist, trace session, and SessionRouter
saga addendum preserve the visibility and transition-safety requirements that
must survive the architecture expansion.

## Non-Negotiable Invariants

1. No trading-critical object may rely on selected UI symbol, current boot
   config, or default broker as truth once it exists.
2. Every candle, strategy decision, order intent, trade, position, fill,
   broker callback, dashboard event, backtest row, and pattern-memory write
   carries the same immutable runtime scope.
3. Missing scope fails closed before execution or persistence.
4. One open long and one open short on the same symbol at the same time is
   forbidden. Sequential flips are allowed only after the prior opposite
   position is fully closed.
5. Backtests and live/paper runs use the same trading path. Sweep workers may
   be one symbol each, but the main runtime must not depend on a separate fake
   engine.
6. The dashboard renders backend projections. It must not infer position truth
   from the active chart.
7. Broker adapters are capability-gated. A command cannot route to a broker
   unless that broker has proven the required market-data, account, order, and
   reconciliation capabilities.
8. Every runtime expansion preserves the eval trace ladder: ingress,
   normalization, state-before, decision, gate checks, order boundary,
   state-after, dashboard/proof payload, and restart/retry status must remain
   joinable by trace, signal, trade, order, or transition identifiers.

## Scope Envelope

Every runtime object that can affect trading, reporting, persistence, or
learned state must carry:

```text
{
  executionMode,
  brokerId,
  accountId,
  assetClass,
  symbol,
  timeframe,
  sessionId or modeEpoch,
  scopeKey
}
```

`scopeKey` format:

```text
executionMode:brokerId:accountId:assetClass:symbol:timeframe
```

If `accountId` is unknown during the early local build, use an explicit
placeholder such as `default`, never an empty value. The placeholder must be
visible in logs and dashboard payloads so it cannot be confused with a real
broker account id.

## Visibility / Eval Transparency Contract

The multi-runtime build must carry forward the eval visibility work already
landed for Gate H and the signal-through-bot trace ladder. Adding symbols,
timeframes, directions, accounts, brokers, or SessionRouter transitions is not
complete unless the operator can still prove what happened without inferring
from UI selection, stale config, or disconnected logs.

Every trading, session, dashboard, or proof event that represents live runtime
truth must include the fields below when the field exists for that stage:

- join keys: `traceId`, `signalId`, `decisionId`, `tradeId`, `intentId`,
  `orderId`, or `transitionId`;
- immutable scope: `executionMode`, `brokerId`, `accountId`, `assetClass`,
  `symbol`, `timeframe`, `sessionId` or `modeEpoch`, and `scopeKey`;
- input source: candle source, session source, adapter source, webhook source,
  or broker callback source;
- state-before: active positions, open orders, pause/kill/halt status,
  balance/equity snapshot, and broker position snapshot when available;
- gate results: strategy, risk, eval, session-freeze, broker-capability, and
  reconciliation gates with pass/fail status and reason;
- order intent: side/action, quantity or notional, destination broker/webhook,
  `clientOrderId` or idempotency key, dry-run/live posture, and target account;
- order result: accepted, rejected, pending, unknown, terminal, external order
  id, broker status, and rejection/failure reason;
- state-after: exact mutation, pending reconciliation state, or explicit
  no-mutation reason;
- dashboard/proof payload: backend event name and payload source used by the
  UI or proof report.

Existing trace events that must not disappear during the expansion:

- `CANDLE_INGRESS`
- `CANDLE_PROCESSOR_RECEIVED`
- `CANDLE_ACCEPTED`
- `ANALYSIS_START`
- `STRATEGY_DECISION`
- `DECISION_SKIP`
- `EXECUTE_HANDOFF`
- `ORDER_EXECUTE_START`
- `ORDER_PLAN`
- `EVAL_RULE_CHECK`
- `WEBHOOK_ORDER_DISPATCH`
- `WEBHOOK_ORDER_RESULT`
- `STATE_MUTATION`
- `EXECUTE_RETURN`
- `state_update`
- `trace_event`

SessionRouter work must add the same level of proof for boundary swaps:

- `SESSION_TRANSITION_PLANNED`
- `SESSION_FREEZE_SOURCE`
- `SESSION_ORDER_INTENT_RECORDED`
- `SESSION_RECONCILIATION_SNAPSHOT`
- `SESSION_TARGET_ACTIVATED`
- `SESSION_FAILED_SAFE`

No visibility regression rule:

- If code moves ownership of state, orders, session transitions, or dashboard
  truth, the commit must either preserve the same trace/proof fields or
  document the replacement mapping in the commit body or session note.
- A dashboard feature is not accepted unless it renders backend-owned
  `state_update`, `trace_event`, transition status, proof JSON, or another
  explicitly named backend projection. It must not infer exposure from the
  selected chart, raw websocket price frames, or local UI state.
- A SessionRouter feature is not accepted unless its transition journal,
  epoch/fencing status, broker-intent map, reconciliation snapshot, and
  safe-mode status are visible through backend status/proof surfaces.

## Current Verified Runtime Gap

The current runtime has real building blocks but is not the full platform yet:

- Broker registry and order router exist, but runtime uses one selected broker
  or SessionRouter's sequential switch model.
- CandleStore and SymbolTradingContext exist, but normal backtest still binds
  one symbol/timeframe into the runner closure.
- StateManager has scoped active trades, but still exposes scalar position
  fields as if they were authoritative truth.
- TradingLoop supports long and short actions, but same-symbol opposite
  exposure is intentionally blocked by flip-first behavior.
- MultiTimeframeAdapter and AdaptiveTimeframeSelector exist, but active runtime
  still uses one selected trading timeframe.
- Dashboard position views still depend on incomplete backend state payloads.
- Eval trace spine and Gate H surfaces exist, but this architecture ladder must
  keep them as acceptance gates instead of treating them as a separate frontend
  project.

## Build Order

### Phase 0 - Stop Misleading Surfaces

Goal: make UI and docs stop implying the system is broader than the backend can
prove.

Required changes:

- Dashboard position payloads must expose scoped positions from backend state.
- Open positions panel must render backend positions, not selected chart
  guesses.
- `state_update`, `trace_event`, and Gate H live report payloads must keep
  rendering backend-owned truth during the scoped-position migration.
- Broker registry/capability docs must distinguish scaffold, implemented, and
  verified adapters.

Acceptance gate:

- With two scoped active trades in state, changing the selected chart symbol
  does not change which positions are rendered.

### Phase 1 - Scope Contract Everywhere

Goal: make missing scope impossible to execute or persist.

Affected paths:

- Candle ingress
- Strategy decision output
- TradingLoop decision handling
- OrderExecutor entry and exit plans
- StateManager active trades
- PositionTracker helpers
- Broker adapter order intents
- Dashboard trade and state events
- Backtest report rows
- Pattern-memory writes
- Eval trace events and proof payload rows

Acceptance gate:

- A BUY or SELL_SHORT without `symbol`, `brokerId`, `assetClass`,
  `executionMode`, `timeframe`, and `scopeKey` fails before openPosition.
- A close path without trade id or exact scope fails before selecting a trade.
- The same rejected action emits enough trace/proof context to identify the
  missing field and the source that attempted to execute.

### Phase 2 - Replace Scalar Position Truth

Goal: scalar state becomes compatibility projection only, not authoritative
position truth.

Required changes:

- Authoritative positions indexed by scope and trade id.
- Close paths require trade id or exact scope.
- PositionTracker stops selecting the first global BUY.
- `state_update` exposes `positions: []` plus account-level aggregates.

Acceptance gate:

- Two symbols can have independent positions and closing one cannot mutate,
  close, or report the other.

### Phase 3 - Multi-Symbol Single-Broker Slice

Goal: prove one broker can scan and manage multiple symbols in one process.

First slice:

- Broker: Alpaca paper
- Asset class: stocks
- Symbols: TSLA and SPY
- Timeframe: one configured timeframe
- Execution: paper only

Required changes:

- Subscribe to every configured `ALPACA_SYMBOLS` entry.
- Dispatch every candle by symbol.
- Analyze each symbol against its own SymbolTradingContext.
- Maintain per-symbol active trades.
- Dashboard displays both symbols and their positions from backend truth.

Acceptance gate:

- One process sees TSLA and SPY candles, can hold independent scoped positions,
  and dashboard state remains correct.
- Trace/proof output distinguishes TSLA and SPY ingress, decisions, state
  mutations, and dashboard rows without relying on the selected chart symbol.

### Phase 4 - Multi-Timeframe Per Symbol

Goal: make one symbol maintain multiple candle stores and explicit timeframe
strategy contexts without overwrites or inference.

Required changes:

- CandleStore stores multiple timeframes per symbol.
- Strategy context selects the intended timeframe explicitly.
- Backtest and sweep commands declare timeframe under test.
- Dashboard timeframe switch reads matching historical/live candles.

Acceptance gate:

- One symbol can maintain 1m and 15m candle stores, strategy decisions name the
  source timeframe, and neither timeframe overwrites or mislabels the other.

### Phase 5 - Multi-Direction Admission

Goal: admit MDT or equivalent long/short orchestration only after the no
same-symbol hedge rule is structural.

Required changes before MDT can be wired:

- Guard at position open: reject if the opposite-direction map has the same
  symbol open.
- Delete or hard-disable same-symbol hedge behavior.
- Keep cross-symbol pair trades possible.
- Add orchestrator invariant that scans all open positions before authorizing
  a new entry.
- Add boot validator that halts on a saved state containing simultaneous long
  and short exposure for the same symbol.

Acceptance gate:

- Long TSLA open plus short TSLA signal rejects.
- Long TSLA closed plus short TSLA signal on a later candle may enter.
- Long TSLA plus short NVDA may enter if the pair-trade rules allow it.

### Phase 6 - Broker Capability Matrix

Goal: prevent generic broker abstraction from lying about venue semantics.

Capabilities:

- Market data
- Historical candles
- Account balance
- Positions
- Open orders
- Place order
- Cancel order
- Replace or modify order
- Order status
- Fill stream
- REST reconciliation
- Client order id or idempotency support
- Bracket or OCO semantics
- Short availability and borrow constraints

Acceptance gate:

- Router refuses a command if the selected broker has not proven the required
  capability for that command and asset class.

### Phase 7 - Multi-Broker Runtime

Goal: run multiple brokers without sharing state, order ids, pattern memory, or
dashboard labels.

Required changes:

- Account-specific scope keys.
- Broker-specific reconciliation.
- No shared scalar active state.
- No global candle history.
- No UI inference.
- Pattern memory keyed by mode, broker/account where relevant, asset class,
  symbol, timeframe, and strategy/source.
- Session transition journal, epoch/fencing status, broker-intent map,
  reconciliation snapshots, and failed-safe state are exposed through backend
  status/proof surfaces.

Acceptance gate:

- One crypto broker and one stock broker can be active in one process without
  sharing positions, order ids, candle history, learned state, or dashboard
  labels.
- The operator can follow one transition or order across trace/proof output from
  ingress or transition planning through final state/reconciliation result.

## First Build Slice

The first build slice is deliberately narrow:

1. Add scoped active positions array to `StateManager` dashboard `state_update`.
2. Include full scope on dashboard trade broadcasts from `OrderExecutor`.
3. Update `open-positions.js` to render backend scoped positions first.
4. Fix `PositionTracker` close/snapshot helpers so they require trade id or
   exact scope instead of selecting the first global BUY.

This slice does not enable multi-symbol trading yet. It makes the current
single-lane bot tell the truth in a format that can safely support multiple
lanes.

## Verification Gates

Docs-only changes:

- No Mercury required.
- Git diff must show only docs.

Runtime or dashboard changes:

- `node --check` on changed JavaScript files.
- Focused smoke for the changed path.
- Mercury adversarial attack for hot-path runtime changes.
- P0 TSLA anchor if the trading/backtest execution path changes.

Branch rule:

- Work lands as small commits in dependency order.
- No push until operator approves.
