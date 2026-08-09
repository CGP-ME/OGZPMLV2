# Fourth Shape Producer Census - Batches 0-3

Date: 2026-08-09
Head inspected: e63de41d
Spec inspected: ogz-meta/inbox/fable/2026-08-04/directional-fix-spec.md
Scope: Batches 0-3 directional refusal/quarantine sites, plus the correction-order quarantine/throw cleanup commits b5a9341c and e63de41d.

This is the owed producer census before Batch 4. It is a report-only commit: no runtime code is changed here, no gates were run, and no P0 was run per the operator order.

## Result

No live internal producer was found that can still create a corrupt active trade through the production write path.

The remaining producers fall into three buckets:

- True boundary: legacy `state.json`, broker/webhook responses, runtime market data, or external decision payloads can still arrive malformed. Ceiling is quarantine, trace, notification, and symbol halt where trading-critical.
- Dead producer: production references exist only in disabled code or an unimported adapter. The current refusal remains a tripwire.
- Sealed internal producer: current production callers write explicit direction/action/scope fields before the refusal site can observe them.

## Active Trade Identity Write Doors

| Site | Current behavior | Producers found | Classification |
| --- | --- | --- | --- |
| `core/StateManager.js:1012-1048` `openPosition()` immutable identity check | Returns `ENTRY_IDENTITY_REJECTED`, does not persist the trade | Long entry writer supplies `action: 'BUY'` and `direction: 'long'` at `core/OrderExecutor.js:3556-3560`; short entry writer supplies `direction: 'short'` and `action: 'SELL_SHORT'` at `core/OrderExecutor.js:3785-3790`; `core/PositionTracker.js:226-229` delegates caller metadata into `StateManager.openPosition()` | Sealed internal producers. The refusal is the entry boundary for a malformed caller payload, not a process kill. No producer fix required in this commit. |
| `core/StateManager.js:1198-1217` same-symbol unknown/opposite direction entry refusal | Returns a blocked entry result, no active trade write | Existing active trades come from `openPosition()` at `core/StateManager.js:1219-1247` after the identity check above; symbol reads use `getTradesBySymbol()` from exit/entry callers at `core/OrderExecutor.js:1374-1377`, `core/TradingLoop.js:997`, and `core/TradingLoop.js:1370` | Sealed active-trade producers. The same-symbol refusal is a symbol-level entry block, not a global halt. |
| `core/StateManager.js:1832-1860` `_normalizeActiveTradesInput()` container, identity, and quantity throws | Throws if a caller tries to set malformed activeTrades through the state mutation layer | Initial state uses `new Map()` at `core/StateManager.js:507`, `core/StateManager.js:610`, and `run-empire-v2.js:1221`; internal state writes pass `nextActiveTrades` at `core/StateManager.js:1231`, `1516`, `1620`, `1743`, `2609`, `2711`, `2802`, and `3191`; no production `set('activeTrades', ...)` caller was found by grep | Internal producers are sealed by the same identity/quantity checks before writing. Direct activeTrades replacement is an operator/test boundary and remains a tripwire. |
| `core/StateManager.js:2365-2444` `updateActiveTrade()` identity and quantity throws | Throws on malformed direct active-trade update; does not save | Production hit in `core/OrderExecutor.js:3473-3477` is inside `if (false && decision.action === 'BUY')`; `core/KrakenAdapterV2.js:152` is in an adapter file with no live import/new reference found outside its own comments/export; `core/PositionTracker.js:226-229` uses `openPosition()`, not `updateActiveTrade()` | Producers dead in the current runtime path. The throw is a tripwire behind a bypass API, not a live writer. |
| Trade-object in-place mutation bypass | Guarded by Batch 0c test and save/load quarantine | Grep for direct `.direction =` mutations in `core`, `modules`, and `run-empire-v2.js` found indicator/signal mutations only: `modules/MultiTimeframeAdapter.js:470`, `core/FibonacciDetector.js:107`, `core/FibonacciDetector.js:117`, and `core/TRAIPatternIntegration.js:152`; no active-trade record direction mutator was found | Producer not found in production active-trade code. Quarantine remains a tripwire against direct object mutation or legacy state. |

## State Load, Save, Equity, And Exposure

| Site | Current behavior | Producers found | Classification |
| --- | --- | --- | --- |
| `core/StateManager.js:3688-3711` `save()` active-trade integrity sweep | Quarantines malformed active trades before persistence, then persists last-good state | Producer would be direct in-memory active trade mutation after the sealed write doors; no active-trade direction mutator found in production grep; `updateActiveTrade()` producers are dead or disabled as listed above | Dead/sealed internal producers. Quarantine stands as tripwire before persistence corruption. |
| `core/StateManager.js:3767-3788` `load()` activeTrades container repair | Converts arrays/objects to Map; unsupported containers are quarantined and replaced with empty Map | Producer is legacy or externally edited `state.json` from before the sealed write doors, or operator/manual file corruption | True boundary. Quarantine is the ceiling; boot continues. |
| `core/StateManager.js:3889-3945` `load()` per-trade identity/scope/quantity quarantine | Quarantines corrupt active trades, removes them from tradeable state, and reconciles position scalars | Producer is legacy persisted state or external/manual state-file mutation; clean current writers are sealed by `openPosition()` and `_normalizeActiveTradesInput()` | True boundary for old disk state. Quarantine stands. |
| `core/StateManager.js:3951-4003` `load()` source-less exposure quarantine | Quarantines nonzero/invalid scalar position state when no active trade exists, then zeroes scalars | Producer is legacy scalar-only state or manual file mutation, not the current activeTrades-first writer | True boundary. Quarantine stands; clean symbols boot. |
| `core/StateManager.js:4004-4017` `load()` stale flat metadata cleanup | Clears stale flat metadata after source-less exposure checks | Producer is legacy flat-state residue | True boundary cleanup. No refusal escalation. |
| `core/StateManager.js:657-744` `getEquity()` corrupt active trade handling | Excludes corrupt trade from equity, marks equity untrusted, records direction-integrity halt once | Producers are legacy loaded state not yet quarantined, direct in-memory mutation, or direct activeTrades replacement; current write doors are sealed | True boundary/tripwire. No full-stop remains. |
| `core/StateManager.js:766-850` exposure helpers | Invalid container traces and returns zero exposure; corrupt trade is quarantined and excluded | Same producers as `getEquity()` | True boundary/tripwire. No process kill. |
| `core/StateManager.js:1899-1938` direction-integrity symbol halt | Dedupes standing halt and records symbol-only entry halt | Called by quarantine paths, not an independent producer | Escalation ceiling is symbol halt. No global kill. |
| `core/StateManager.js:1975-2035` `_quarantineActiveTrade()` | Moves corrupt trade to `quarantinedTrades`, deletes active trade, emits trace, halts symbol | Called by `save()`, `load()`, equity/exposure helpers | Quarantine sink, not producer. |

## Exit And Broker Boundary Refusals

| Site | Current behavior | Producers found | Classification |
| --- | --- | --- | --- |
| `core/OrderExecutor.js:69-132` `_haltDirectionIntegrityExitRefusal()` | Symbol-only halt with standing-halt dedupe and direction-integrity trace | Called from exit-intent reconciliation at `core/OrderExecutor.js:1135-1160` and post-send reconciliation failure at `core/OrderExecutor.js:3372-3395` | True boundary around corrupt pending exit intent or broker/order-router failure. No global kill in this helper. |
| `core/OrderExecutor.js:2228-2255` `_findExitTrade()` tradeId miss refusal | Emits `EXIT_TRADE_ID_MISS_REFUSAL`, returns null, and refuses fallback to a different active trade | Producer is external/strategy decision `tradeId` that does not match the current symbol's active trades | True decision boundary. Refusal prevents closing the wrong trade. |
| `core/OrderExecutor.js:2258-2338` `_buildExitPlan()` order-plan invariant throws | Throws on missing immutable scope, invalid fraction, missing remaining quantity, missing stored unit, unit mismatch, or nonpositive order quantity | Producers are active-trade records from legacy state or direct mutation, plus external decision exit fraction; current active-trade writers stamp scope/unit fields at `core/OrderExecutor.js:3556-3607` and `core/OrderExecutor.js:3785-3790` plus following scope/unit fields | Active-trade producers sealed; decision/broker inputs are boundaries. Existing throw remains an audit tripwire inside the execution contract, not a new global kill switch. |
| `core/OrderExecutor.js:1188-1213` broker position read failure/unparseable size | Returns pending broker-flat confirmation with `broker_position_size_unparseable` or read error | Producer is broker/router `getAllPositions()` response | True broker boundary. Quarantine/full-stop is not appropriate; confirmation stays pending. |
| `core/OrderExecutor.js:1216-1292` broker-desync flatten/halt | Attempts flatten via order router, catches flatten error, then halts symbol | Producer is broker state proving a full exit did not actually flatten | True broker boundary. Escalation ceiling is symbol halt plus trace. |
| `core/OrderExecutor.js:1294-1343` webhook full-exit flat verification | If broker state unavailable, emits pending confirmation; if broker still has position, routes to flatten/halt | Producers are webhook fill proof and broker REST position snapshot | True broker/webhook boundary. No process kill. |
| `core/OrderExecutor.js:3415-3419` successful order result missing order id | Throws `[EXECUTION-FILL] successful_trade_result_missing_order_id` before recording state | Producer is broker/webhook result claiming success without a durable order id | True broker boundary. No state mutation occurs before the throw. |
| `core/OrderExecutor.js:3988-4005` SELL without matching BUY | Returns blocked order and trace; no persisted symbol halt | Producer is exit signal when no long active trade exists for the symbol | True decision/state boundary. Refusal prevents phantom close. |
| `core/OrderExecutor.js:4579-4587` COVER without matching SELL_SHORT | Returns blocked order and trace; no persisted symbol halt | Producer is exit signal when no short active trade exists for the symbol | True decision/state boundary. Refusal prevents phantom close. |
| `core/OrderExecutor.js:5148-5165` audit-prefixed execution throw rethrow | Re-throws audit-prefixed errors after trace | Producers are the audit-prefixed sites above | This remains the only broad throw behavior inside `executeTrade()` for audit-prefixed failures. It is not a newly added gate, but it is the place to revisit if operator doctrine later requires all audit-prefixed execution refusals to become symbol-only halts. |

## Session Router Close Boundary

| Site | Current behavior | Producers found | Classification |
| --- | --- | --- | --- |
| `core/SessionRouter.js:149-165` `_sourceTradeCloseAction()` | Throws on active-trade action/direction mismatch or unprovable close action | Source trade comes from activeTrades; current active-trade writers are sealed, and legacy corrupt active trades are quarantined by `StateManager.load()` | Internal producers sealed; direct corrupted in-memory active trade remains tripwire. |
| `core/SessionRouter.js:167-182` `_closeSourceTradeThroughExecution()` price/executeTrade requirements | Throws if `executeTrade` is missing or close price is unavailable | Producers are runtime wiring and market-data snapshots, outside active-trade identity writers | True runtime boundary. No Batch 4 change landed here. |

## Exit Contract Manager Refusals

| Site | Current behavior | Producers found | Classification |
| --- | --- | --- | --- |
| `core/ExitContractManager.js:57-84` active-trade direction refusal helpers | Emit error/refusal payloads for direction-dependent exit math | All callers receive `trade` from StateManager activeTrades or test fixtures | Producers sealed by StateManager write/load doors; helper remains a tripwire. |
| `core/ExitContractManager.js:335-344` `checkExitConditions()` | Returns `active_trade_direction_unknown` result, no guessed long math | Producer is corrupt active trade object | Sealed/tripwire. |
| `core/ExitContractManager.js:448-477` Donchian/TSM invalidation checks | Returns refused invalidation result instead of defaulting long | Producer is corrupt active trade object | Sealed/tripwire. |
| `core/ExitContractManager.js:580-582` channel-trail check | Returns direction refusal exit result | Producer is corrupt active trade object | Sealed/tripwire. |
| `core/ExitContractManager.js:621-624` max-profit update | Logs refusal and preserves prior max profit | Producer is corrupt active trade object | Sealed/tripwire. |
| `core/ExitContractManager.js:666-668` profit-stop state | Returns direction refusal exit result | Producer is corrupt active trade object | Sealed/tripwire. |
| `core/ExitContractManager.js:736-739` trailing-stop state | Logs refusal and returns not-updated | Producer is corrupt active trade object | Sealed/tripwire. |
| `core/ExitContractManager.js:821-824` breakeven-stop state | Logs refusal and returns not-updated | Producer is corrupt active trade object | Sealed/tripwire. |

The seven configured-condition reconcile is parked by operator order. Its implement-vs-delete proposal table is still owed before any ECM reconcile commit.

## Read/Display Refusals

| Site | Current behavior | Producers found | Classification |
| --- | --- | --- | --- |
| `core/BacktestRunner.js:101-128` and `core/BacktestRunner.js:272-284` window-end active-trade refusal | Records `refused_at_window_end` with `directionIntegrityRefusal`; does not force-close with guessed direction | Producer is activeTrades from `stateManager.getAllTrades()` | Active-trade producers sealed; legacy/test boundary remains tripwire. |
| `core/PipelineSnapshot.js:300-326` active-trade projection | Projects corrupt active trade with `direction: null` and refusal code | Producer is `stateManager.getAllTrades()` at `core/PipelineSnapshot.js:447-452` | Active-trade producers sealed; display refuses to lie. |
| `core/TradeNarrator.js:705-714` closed-trade direction refusal fields | Emits closed payload with `directionIntegrityRefusal` and refusal code | Closed-trade producers are StateManager close records at `core/StateManager.js:1500-1525`, confirmed close records at `core/StateManager.js:3188-3200`, and OrderExecutor recorder calls with explicit `direction: 'long'`/`'short'` at `core/OrderExecutor.js:4079-4085` and `core/OrderExecutor.js:4660-4666` | Internal producers are sealed for current writes; legacy closed records remain display boundary. |
| `core/TradingLoop.js:154-166` dashboard strategy direction refusal | Strategy telemetry direction becomes null/refusal when not `buy`, `sell`, or `hold` | Producers are strategy outputs in `core/StrategyOrchestrator.js:2826` and `core/StrategyOrchestrator.js:2867`, plus strategy/module signal objects | Signal vocabulary is a telemetry boundary, not activeTrades. Broader signal-vocab policy items remain parked where ordered. |
| `utils/telegramNotifier.js:137-142` entry notification action fallback | Uses explicit action when present; only displays `UNKNOWN` when both action/direction are missing | Producers are OrderExecutor entry notifications with explicit `BUY`/`long` at `core/OrderExecutor.js:3666-3673` and `SELL_SHORT`/`short` at `core/OrderExecutor.js:3889-3896` | Internal notification producers sealed. |

## Correction-Order Addendum

| Site | Current behavior | Producers found | Classification |
| --- | --- | --- | --- |
| `core/TtpCutoffEnforcer.js:316-324` activeTrades invalid container handling from b5a9341c/e63de41d | No full-stop persistence throw remains after e63de41d; refusal routes through state quarantine/halt behavior | Producer is StateManager activeTrades state or legacy persisted state | True boundary/tripwire; correction landed before this census. |
| `core/TtpCutoffEnforcer.js:120-140`, `190-214`, `253-303`, `494-504`, `520-532`, and `580-676` cancellation/liquidation failures from b5a9341c/e63de41d | Failure reports through symbol-level direction-integrity refusal/quarantine path | Producer is broker/order-router cancellation, broker position read, liquidation send, or unverified broker-flatness response | True broker boundary. |

## Deferred

- Batch 4 implementation is not in this report commit by ordering law.
- T1-10 loud-adopt remains parked until operator word #4.
- T1-29 pattern lane remains parked until operator word #5.
- ECM seven-condition reconcile remains parked; only the proposal table is authorized before approval.
- P0/gates were not run because the operator explicitly ordered "No gates, no P0."
