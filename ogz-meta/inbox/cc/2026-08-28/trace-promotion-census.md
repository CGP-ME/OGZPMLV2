# TRACE-BUS PROMOTION CENSUS — Phase 1 (read-only)

## STANDING LAW (effective this mission, propagates forward)

**New code on the trade path emits trace events for failures, never bare
`console.error`. Bare logs on the trade path are inherited violations from
this mission onward.**

---

## Context

- Mission: TRACE-BUS PROMOTION — important-path failures scream, not log. Mandate: HYGIENE. Executor: CC on the box. Trey's word.
- Date: 2026-08-28 · Branch: `codex/multi-asset-symbol-state` · HEAD at census: `2d6eed44`
- Territory: emission sites in `core/`, `brokers/`, `run-empire-v2.js` only.
- Excluded as bus infrastructure (do-not-touch per mandate): `core/TraceSpine.js`, `core/NtfyTraceNotifier.js`. Their own console lines are not census rows.
- Phase 1 is read-only. No emission changes. HOLD for Trey ruling on rows.

## Bus facts (verified against source)

- Emission API: `emitTrace(ctx, event, fields)` from `core/TraceSpine.js`. Scope (symbol/timeframe/brokerId/accountId/assetClass/executionMode) is stamped by the spine.
- Notifier wiring: `run-empire-v2.js:1052-1054` subscribes `NtfyTraceNotifier` via `subscribeTrace`. Subscribers receive events even when `evalTraceEnabled` is off — promoted emissions reach the phone decision with no config change.
- Existing priority semantics (name/field-based, unchanged by this mission):
  - **max**: event name contains `ALARM`/`HALT`/`KILL`/`DESYNC`/`RECONCILIATION`, or `fields.manualReconciliationRequired === true`
  - **high**: event name is `ORDER_BLOCKED`/`ORDER_EXCEPTION` or contains `ERROR`
  - **default**: successful `STATE_MUTATION` open/close
  - Anything else: notifier returns null → **filtered (no phone)**.
- Live brokers: `run-empire-v2.js:845,857` instantiates exactly **kraken** and **alpaca**. `BrokerRegistry.js` is a 16-entry catalog, not live wiring.

## Method

12 read-only census agents (Sonnet) swept 74 files: every `console.error`, `console.warn`, and swallowed catch (no log, no rethrow, no trace). Executor (Fable) verified: bus API and notifier tiers by direct read; live-broker ground truth; AlpacaAdapter funnel event naming. Total: **~747 rows**.

**Corrections applied by executor:**
1. Agent-proposed PROMOTEs on SchwabAdapter (9), GeminiAdapter (6), BinanceAdapter (2) downgraded to **LOG-ONLY†** — those adapters are catalog-registered but never instantiated by the live entrypoint; no money flows through them today. † = re-rule PROMOTE if that broker is ever activated.
2. A third de-facto category exists and is marked in the `trace` column: **y\*** = site already emits to the bus but the event name matches no notifier keyword, so the phone filters it. Proposal for these is PROMOTE via an additive keyword-visible emission alongside (no rename, no removal).
3. Companion lines (stack-trace/detail echoes of the same failure) are marked "fold into :NNN" — one failure, one emission; they are not independent promotion sites.

## Row format

`file:line | what failed when it fires | class | trace y/n | proposal | why`
Classes: broker-reject / position-state / feed-death / order-lifecycle / risk-guard / data-integrity / housekeeping.
Default under doubt: LOG-ONLY. The phone is for money and truth, not noise.

## Summary for ruling

| Disposition | Rows |
|---|---|
| PROMOTE proposed (new emission, trace=n) | ~86 |
| PROMOTE proposed (bus-emitting but phone-invisible, trace=y\*) | ~12 |
| Already covered (trace=y, reconciliation/HALT-class visible) | ~50 |
| LOG-ONLY | remainder (~600) |

### PROMOTE shortlist by class (trace=n unless marked y\*)

**position-state / truth of open positions**
- StateManager.js: 306, 1440, 1453, 1466, 1480, 1497, 1545, 1557, 1565, 1571, 1817, 1825, 2822-2824, 3401 [SWALLOWED], 4088, 4120, 4377, 4528, 4553 — silent entry/exit refusals, swallowed applyFill validation, boot-time truth rewrites, bypass detection
- OrderExecutor.js: 4446, 5080 — exit attributed to wrong trade via oldest-fallback, untraced
- CandleProcessor.js: 375 — live candle for unregistered symbol context blinds open-position tracking
- TradeJournalBridge.js: 564, 607, 944, 1059, 1257, 1266, 1294, 1410, 1593, 1596 [SWALLOWED] — journal-of-truth losses incl. total loss of failure records
- TradeJournal.js: 1529 — ledger rebuild abort at boot
- PositionTracker.js: 92, 365 [SWALLOWED] — write-once identity violation; close-scope resolution failure leaves position stuck
- TradingLoop.js: 1693, 1695, 1756 — wrong-side conflict block, ambiguous-direction reconciliation, decision silently converted to no-op
- ExitContractManager.js: 65 — exit math refused for live trade mid-flight
- PnLCalculator.js: 51 — corrupt entry price masked as 0% P&L

**order-lifecycle / broker-reject on the live path**
- KrakenIBrokerAdapter.js: 44 — sole-live-crypto-broker connect failure
- KrakenAdapterV2.js: 86, 109, 165, 195, 204 — connect/balance/buy/sell/cancel failures
- WebhookOrderAdapter.js: 102, 106, 173, 181 — live order signal dropped pre-POST or rejected/unconfirmed by TTP
- AlpacaAdapter.js (y\*): 233-funnel, 744, 770, 779, 784 — broker-truth/account-WS failures emit but phone-invisible
- OrderRouter.js (y\*): 438, 474, 525, 541, 556 — broker/position/cancel/balance truth unavailable, emits but phone-invisible
- StrategyOrchestrator.js: 2896 — winner's stop/TP geometry silently swapped for generic defaults

**risk-guard**
- run-empire-v2.js: 582 — pipeline risk gates silently default off
- AuthFailureGuard.js: 105 — broker-auth escalation engages global KillSwitch with zero bus visibility
- RiskManager.js: 250 — reconciliation-delta / rail-buffer order-block alerts never reach bus
- DrawdownTracker.js: 10, 21 — drawdown-halt baseline never set / P&L excluded, kill-switch silently defeated
- PnLTracker.js: 10, 23 — P&L baseline/trade-outcome exclusions corrupt risk truth
- PositionSizer.js: 57 — corrupt balance reaching live sizing math
- SingletonLock.js: 55, 83, 158, 164, 178, 184, 188, 273 — duplicate-instance detections and process-death handlers
- Supervisor.js: 611, 659 — operator paging on DEAD transition silently failed
- TtpCutoffEnforcer.js: 383, 423, 785, 804, 828 — cutoff enforcement failure, corrupted container, quarantine truth not persisted, halt not applied
- PerformanceValidator.js: 197 — strategy component silently disabled

**feed-death / data-integrity**
- run-empire-v2.js: 317, 318 (fold into 317), 326, 881, 906, 911, 919, 1900, 2102, 2158, 3609, 3618, 3619 (fold into 3618), 3621, 3631 — process death + silent candle-flow gating + scope contamination
- CandleProcessor.js: 511, 1041, 1043 (fold into 1041), 1129 — corrupt timestamp; trading continues on confirmed-stale data and unfilled gaps
- CandleStore.js: 344 [SWALLOWED] — one bad read silently discards ALL symbols' persisted candle history on next write
- SessionRouter.js: 703, 1151 — stuck durable transition lock; wrong-session candle callbacks
- Supervisor.js: 866, 939 — HMAC key write failure unsigns all future ledger entries; ledger append loss
- tradeLogger.js: 133, 152, 387 — corrupt day-file triggers permanent journal erasure; write failures
- DecisionAutopsyLogger.js: 60 — both autopsy write paths failed
- DecisionLedgerLogger.js: 45, 56, 129 — completed live trade lost from canonical journal
- StrategyOrchestrator.js: 2497 — ATR fail-loud clears all candidates on unusable price, silently stops trading
- ContractValidator.js: 337 — non-strict contract violation lets invalid data keep flowing
- AssetConfigManager.js: 366 — wrong asset class's risk config silently substituted
- RuntimeAuditSink.js: 202 [SWALLOWED] — fatal-event truth trail totally lost

Everything not listed above is LOG-ONLY (housekeeping, dashboard cosmetics, dormant adapters, advisory TRAI layer, backtest-only paths, self-healing feed blips, already-covered reconciliation-traced sites). Full rows follow.

---

## Full census rows

### run-empire-v2.js (56 sites, no swallowed catches)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| run-empire-v2.js:200 | captureRuntimeFatal failed to persist fatal-crash audit record | data-integrity | n | LOG-ONLY | meta-failure of crash forensics, not an order/position action |
| run-empire-v2.js:317 | uncaught exception, bot exits immediately | data-integrity | n | PROMOTE | process death can strand open broker positions unwatched |
| run-empire-v2.js:318 | stack-trace companion to 317 | data-integrity | n | fold into :317 | same fatal event |
| run-empire-v2.js:326 | unhandled rejection, bot exits immediately | data-integrity | n | PROMOTE | process death can strand open broker positions |
| run-empire-v2.js:582 | ConfigLoader.pipeline missing, all pipeline risk gates default off | risk-guard | n | PROMOTE | silently disables trading risk filters, no operator alert |
| run-empire-v2.js:596 | EnhancedPatternChecker failed to load, process exits | housekeeping | n | LOG-ONLY | earliest boot dependency check, pre-broker |
| run-empire-v2.js:881 | SessionRouter OHLC payload dropped, missing timeframe | feed-death | n | PROMOTE | silently gates live candle flow to exit monitor |
| run-empire-v2.js:906 | OHLC payload dropped, failed normalization | feed-death | n | PROMOTE | silent candle-flow gate if feed corrupts |
| run-empire-v2.js:911 | OHLC payload dropped, invalid timestamp | feed-death | n | PROMOTE | silent candle-flow gate if feed corrupts |
| run-empire-v2.js:919 | normalized candle dropped, missing symbol | feed-death | n | PROMOTE | silently stalls symbol's price/exit tracking |
| run-empire-v2.js:966 | non-active-timeframe candle dropped (TFE owns bars) | housekeeping | y | LOG-ONLY | expected drop, already traced NON_ACTIVE_TIMEFRAME_DROPPED |
| run-empire-v2.js:1220 | MessageQueue onError for a queued market-data message | feed-death | n | LOG-ONLY | generic queue diagnostic |
| run-empire-v2.js:1277 | dashboard scope sync deferred pending broker identity | housekeeping | n | LOG-ONLY | self-resolving boot sequencing note |
| run-empire-v2.js:1454 | broker API key/secret env missing, then throws | housekeeping | n | LOG-ONLY | fails fast at boot, loud and immediate |
| run-empire-v2.js:1641 | boot REST hydration skipped, broker lacks getCandles() | housekeeping | n | LOG-ONLY | warmup skip, WS data follows |
| run-empire-v2.js:1670 | boot REST hydration got no usable candles | feed-death | n | LOG-ONLY | boot warmup only, non-fatal |
| run-empire-v2.js:1805 | startup failed-safe hold, broker connect skipped, entries blocked | order-lifecycle | y | LOG-ONLY | already max-visible: manualReconciliationRequired set |
| run-empire-v2.js:1808 | recurring failed-safe-hold reminder | order-lifecycle | y | LOG-ONLY | same held state as 1805, already traced |
| run-empire-v2.js:1821 | TRAI init failed at boot, continues without TRAI | housekeeping | n | LOG-ONLY | documented graceful degradation |
| run-empire-v2.js:1894 | bot online but entries blocked (summary readout) | order-lifecycle | n | LOG-ONLY | summary only, sources alert individually |
| run-empire-v2.js:1900 | startup threw after broker connect began, shutdown() invoked | data-integrity | n | PROMOTE | crash mid-startup with position risk unmanaged |
| run-empire-v2.js:2102 | scope envelope built with missing explicit timeframe | data-integrity | n | PROMOTE | mislabels scope tagging persisted candle/journal records |
| run-empire-v2.js:2158 | broker account identity unverified, scope incomplete | data-integrity | n | PROMOTE | risks cross-account scope/journal contamination |
| run-empire-v2.js:2323 | dashboard historical request, WS not connected | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:2333 | dashboard equity symbol refused routing to Kraken | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:2338 | dashboard crypto request, Kraken not connected | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:2359 | Alpaca returned no historical candles for dashboard | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:2394 | Kraken returned no historical candles for dashboard | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:2408 | fetchAndSendHistoricalCandles threw | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:2475 | activeTrades container is not a Map | position-state | y | LOG-ONLY | already traced with manual-reconciliation flag |
| run-empire-v2.js:2507 | per-symbol exit check threw in exit monitor | position-state | y | LOG-ONLY | financialIntegrityCritical trace already emitted |
| run-empire-v2.js:2508 | stack companion to 2507 | position-state | y | fold into :2507 | same failure |
| run-empire-v2.js:2575 | halt-after-exit-check-failure itself failed | position-state | y | LOG-ONLY | already on traced financial-integrity path |
| run-empire-v2.js:2586 | TTP cutoff enforcement escaped quarantine wrapper | risk-guard | y | LOG-ONLY | financialIntegrityCritical trace already emitted |
| run-empire-v2.js:2587 | stack companion to 2586 | risk-guard | y | fold into :2586 | same failure |
| run-empire-v2.js:2656 | halt-after-TTP-failure itself failed | risk-guard | y | LOG-ONLY | already on traced path |
| run-empire-v2.js:2729 | feed-pause auto-recovery check threw | feed-death | n | LOG-ONLY | secondary recovery path |
| run-empire-v2.js:2776 | market phase vs isRTH contradiction (case 1) | feed-death | n | LOG-ONLY | conservative fallback on calendar mismatch |
| run-empire-v2.js:2780 | market phase vs isRTH contradiction (case 2) | feed-death | n | LOG-ONLY | conservative fallback |
| run-empire-v2.js:2785 | market phase missing isRTH boolean | feed-death | n | LOG-ONLY | conservative fallback |
| run-empire-v2.js:2911 | liveness watchdog silence, symbol/timeframe unknown | feed-death | n | LOG-ONLY | watchdog never pauses trading by design |
| run-empire-v2.js:2915 | broker/timeframe silence, attempting REST backfill | feed-death | n | LOG-ONLY | diagnostic of in-progress recovery |
| run-empire-v2.js:2929 | liveness REST backfill threw | feed-death | n | LOG-ONLY | recovery-attempt failure only |
| run-empire-v2.js:2932 | liveness REST backfill returned nothing | feed-death | n | LOG-ONLY | recovery-attempt failure only |
| run-empire-v2.js:2972 | SessionRouter refuses new entry, failed-safe active | order-lifecycle | y | LOG-ONLY | manualReconciliationRequired already set on trace |
| run-empire-v2.js:3033 | symbol context registration failed, symbol quarantined | position-state | y | LOG-ONLY | financialIntegrityCritical trace already emitted |
| run-empire-v2.js:3248 | dashboard pattern-analysis broadcast threw | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:3260 | indicator raw-state read for dashboard threw | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| run-empire-v2.js:3292 | dashboard error_event broadcaster itself failed | housekeeping | n | LOG-ONLY | secondary cosmetic channel |
| run-empire-v2.js:3383 | TRAI chat web market context fetch failed | housekeeping | n | LOG-ONLY | chat feature, falls back local |
| run-empire-v2.js:3474 | TRAI dashboard chat query threw | housekeeping | n | LOG-ONLY | chat/support feature |
| run-empire-v2.js:3609 | uncaught exception during live runtime, shutdown attempted | data-integrity | n | PROMOTE | can fire mid-trading with open positions unmanaged |
| run-empire-v2.js:3618 | unhandled rejection during live runtime | data-integrity | n | PROMOTE | rejection may originate from an order/broker call |
| run-empire-v2.js:3619 | promise-object companion to 3618 | data-integrity | n | fold into :3618 | same event |
| run-empire-v2.js:3621 | notice bot continues despite rejection | data-integrity | n | fold into :3618 | same event |
| run-empire-v2.js:3631 | main() promise chain rejected, process exits | data-integrity | n | PROMOTE | fatal catch can fire post-broker-connect with open-position risk |

### core/OrderExecutor.js (84 sites)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| OrderExecutor.js:80 | exit-refusal halt can't apply, symbol missing | position-state | y | LOG-ONLY | already trace-emitting on this path |
| OrderExecutor.js:131 | direction-integrity exit-refusal halt applied | position-state | y | LOG-ONLY | reconciliation-class trace already fires |
| OrderExecutor.js:146 | broker-order-reconciliation halt can't apply, symbol missing | order-lifecycle | y | LOG-ONLY | already traced |
| OrderExecutor.js:189 | broker order receipt uncertain, symbol halted | order-lifecycle | y | LOG-ONLY | reconciliation trace already fires |
| OrderExecutor.js:246 | BacktestRecorder.recordTrade threw, journal write failed | data-integrity | y | LOG-ONLY | already traced (unjournaled/untrusted) |
| OrderExecutor.js:375 | SessionRouter failed-safe entry block firing | risk-guard | y | LOG-ONLY | already traced |
| OrderExecutor.js:773 [SWALLOWED] | webhook order-id fallback JSON.parse fails | data-integrity | n | LOG-ONLY | true failure (no id) throws later |
| OrderExecutor.js:798 [SWALLOWED] | webhook response body JSON.parse fails | data-integrity | n | LOG-ONLY | generic helper, callers handle null |
| OrderExecutor.js:1142 | broker getOpenOrders threw during exit reconciliation | data-integrity | y | LOG-ONLY | already traced on reconciliation path |
| OrderExecutor.js:1180 | stale exit intent released (informational) | order-lifecycle | y | LOG-ONLY | success-path log |
| OrderExecutor.js:1182 | stale exit intent failed to release | order-lifecycle | y | LOG-ONLY | already traced |
| OrderExecutor.js:1226 | pending exit intent unreconcilable, symbol halted | position-state | y | LOG-ONLY | reconciliation trace fires |
| OrderExecutor.js:1383 | startup exit-intent reconciliation summary | housekeeping | n | LOG-ONLY | aggregate diagnostic |
| OrderExecutor.js:1854 | dashboard WS missing, broadcast skipped | housekeeping | n | LOG-ONLY | cosmetics |
| OrderExecutor.js:1859 | dashboard WS not open, broadcast skipped | housekeeping | n | LOG-ONLY | cosmetics |
| OrderExecutor.js:1867 | dashboard WS send threw | housekeeping | n | LOG-ONLY | cosmetics |
| OrderExecutor.js:1917 | pattern-outcome recording skipped, fields missing | housekeeping | n | LOG-ONLY | learning data quality only |
| OrderExecutor.js:1939 | recordPatternResult rejected outcome | housekeeping | n | LOG-ONLY | learning subsystem |
| OrderExecutor.js:1954 | pattern health-check fn missing | housekeeping | n | LOG-ONLY | diagnostic capability gap |
| OrderExecutor.js:1976 | pattern system health unhealthy | housekeeping | n | LOG-ONLY | learning diagnostic |
| OrderExecutor.js:1985 | dashboard trade-frame build threw | housekeeping | n | LOG-ONLY | cosmetics |
| OrderExecutor.js:2058 [SWALLOWED] | narrator.brokerResult threw | housekeeping | n | LOG-ONLY | documented non-critical narrator |
| OrderExecutor.js:2356 | fill accepted outside configured share-range bounds | risk-guard | y | LOG-ONLY | already traced; money committed outside bounds is on bus |
| OrderExecutor.js:2486 | exit refused, tradeId matched no open trade | order-lifecycle | y | LOG-ONLY | already traced |
| OrderExecutor.js:2562 | exit quantity promoted to broker minimum 1 share | housekeeping | y | LOG-ONLY | expected rounding |
| OrderExecutor.js:2703 | webhook order blocked, action/side mismatch | order-lifecycle | y | LOG-ONLY | already traced (blocked-class) |
| OrderExecutor.js:2725 | webhookAdapter.emit threw synchronously | order-lifecycle | y | LOG-ONLY | already traced |
| OrderExecutor.js:2761 | webhookAdapter.emit promise rejected | order-lifecycle | y | LOG-ONLY | already traced |
| OrderExecutor.js:2908 | entry refused, trading paused | risk-guard | y | LOG-ONLY | redundant with pause source alert |
| OrderExecutor.js:2920 | entry refused, broker verification block active | broker-reject | y | LOG-ONLY | already traced |
| OrderExecutor.js:2947 | entry refused, broker truth block active | broker-reject | y | LOG-ONLY | already traced |
| OrderExecutor.js:2975 | entry refused, existing halt | risk-guard | y | LOG-ONLY | redundant with halt source |
| OrderExecutor.js:2993 | entry refused, same-symbol hedge block | risk-guard | y | LOG-ONLY | by-design gate |
| OrderExecutor.js:3027 | entry refused, no available capital | risk-guard | y | LOG-ONLY | already traced (CRIT-01 lineage visible on bus) |
| OrderExecutor.js:3044 | entry refused, non-finite confidence | risk-guard | y | LOG-ONLY | safe rejection of malformed input |
| OrderExecutor.js:3061 | entry refused, confidence below minimum | risk-guard | y | LOG-ONLY | routine threshold gate |
| OrderExecutor.js:3125 | BUY halted, orchResult absent | order-lifecycle | y | LOG-ONLY | already traced upstream-pipeline failure |
| OrderExecutor.js:3138 | SELL_SHORT halted, orchResult absent | order-lifecycle | y | LOG-ONLY | same as 3125 |
| OrderExecutor.js:3169 | entry refused, quantity non-positive/out of range | risk-guard | y | LOG-ONLY | pre-send gate, no money committed |
| OrderExecutor.js:3192 | entry refused, duplicate-entry concurrency block | risk-guard | y | LOG-ONLY | by-design de-dup |
| OrderExecutor.js:3250 | entry refused, pre-order eval-rule gate denied | risk-guard | y | LOG-ONLY | by-design risk gate |
| OrderExecutor.js:3264 | exit refused pre-routing, no resolvable plan (KILL-5) | order-lifecycle | y | LOG-ONLY | KILL-named trace already max-visible |
| OrderExecutor.js:3265 | companion note to 3264 | order-lifecycle | y | fold into :3264 | same condition |
| OrderExecutor.js:3273 | webhook route blocked pre-execution (dry-run/shape) | order-lifecycle | y | LOG-ONLY | expected gate |
| OrderExecutor.js:3342 | exit intent could not be reserved pre-submit | position-state | y | LOG-ONLY | already traced |
| OrderExecutor.js:3748 | live broker order threw (non-reconciliation case) | broker-reject | y | LOG-ONLY | already traced on live money path |
| OrderExecutor.js:3831 | updateActiveTrade threw inside dead code | housekeeping | n | LOG-ONLY | unreachable (`if (false && …)`) |
| OrderExecutor.js:3832 | dead-code companion to 3831 | housekeeping | n | fold into :3831 | unreachable |
| OrderExecutor.js:3856 | TRAI decision-learning correlation skipped | housekeeping | n | LOG-ONLY | learning feedback only |
| OrderExecutor.js:3963 | StateManager.openPosition failed (BUY) | position-state | y | LOG-ONLY | already traced; state truth failure on bus |
| OrderExecutor.js:4064 | Telegram BUY notification failed | housekeeping | n | LOG-ONLY | cosmetic external notify |
| OrderExecutor.js:4230 | StateManager.openPosition failed (SHORT) | position-state | y | LOG-ONLY | same as 3963 |
| OrderExecutor.js:4326 | Telegram SELL_SHORT notification failed | housekeeping | n | LOG-ONLY | cosmetic |
| OrderExecutor.js:4419 | SELL signal, no matching BUY trade | position-state | y | LOG-ONLY | KILL-5-MITIGATION trace fires |
| OrderExecutor.js:4433 | companion halt message to 4419 | position-state | y | fold into :4419 | same condition |
| OrderExecutor.js:4446 | tradeId not found, falls back to OLDEST BUY trade | position-state | n | **PROMOTE** | may attribute exit/PnL to wrong position, zero trace today |
| OrderExecutor.js:4615 | StateManager.applyFill failed (SELL close) | position-state | y | LOG-ONLY | already traced |
| OrderExecutor.js:4745 | Telegram SELL-close notify failed | housekeeping | n | LOG-ONLY | cosmetic |
| OrderExecutor.js:4850 | RiskManager update skipped, missing finite P&L | housekeeping | n | LOG-ONLY | post-close analytics |
| OrderExecutor.js:4862 | orchestrator daily-loss update skipped | housekeeping | n | LOG-ONLY | post-close analytics |
| OrderExecutor.js:4886 | PID onTradeClose skipped, missing inputs | housekeeping | n | LOG-ONLY | adaptive tuning only |
| OrderExecutor.js:4890 | PID onTradeClose threw | housekeeping | n | LOG-ONLY | optional by design |
| OrderExecutor.js:4979 | TradeLogger proof write failed | housekeeping | n | LOG-ONLY | state already closed; journal-of-record is StateManager |
| OrderExecutor.js:5034 | TRAI learning outcome not recorded | housekeeping | n | LOG-ONLY | learning only |
| OrderExecutor.js:5064 | COVER signal, no matching SHORT trade | position-state | y | LOG-ONLY | KILL-5-MITIGATION trace fires |
| OrderExecutor.js:5069 | companion halt message to 5064 | position-state | y | fold into :5064 | same condition |
| OrderExecutor.js:5080 | tradeId not found, falls back to OLDEST short trade | position-state | n | **PROMOTE** | wrong-position exit attribution, zero trace today |
| OrderExecutor.js:5242 | StateManager.applyFill failed (COVER close) | position-state | y | LOG-ONLY | already traced |
| OrderExecutor.js:5356 | Telegram COVER-close notify failed | housekeeping | n | LOG-ONLY | cosmetic |
| OrderExecutor.js:5431 | TradeLogger write failed (COVER) | housekeeping | n | LOG-ONLY | state already closed |
| OrderExecutor.js:5481 | RiskManager short update skipped | housekeeping | n | LOG-ONLY | analytics |
| OrderExecutor.js:5492 | orchestrator short update skipped | housekeeping | n | LOG-ONLY | analytics |
| OrderExecutor.js:5515 | PID short skipped | housekeeping | n | LOG-ONLY | tuning only |
| OrderExecutor.js:5518 | PID short threw | housekeeping | n | LOG-ONLY | optional |
| OrderExecutor.js:5577 | TRAI short outcome not recorded | housekeeping | n | LOG-ONLY | learning only |
| OrderExecutor.js:5631 | exit-intent slot failed to release after unaccepted order | order-lifecycle | y | LOG-ONLY | already traced |
| OrderExecutor.js:5719 | audit "fail-loud" error rethrown | order-lifecycle | y | LOG-ONLY | intentional loud halt, on bus |
| OrderExecutor.js:5732 | unhandled exception during trade execution (CP3→CP4) | order-lifecycle | y | LOG-ONLY | already traced |
| OrderExecutor.js:5733 | error-message companion | order-lifecycle | y | fold into :5732 | same event |
| OrderExecutor.js:5734 | stack companion | order-lifecycle | y | fold into :5732 | same event |
| OrderExecutor.js:5735 | decision/confidence companion | order-lifecycle | y | fold into :5732 | same event |
| OrderExecutor.js:5736 | position-size companion | order-lifecycle | y | fold into :5732 | same event |

### core/StateManager.js (65 sites)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| StateManager.js:127 [SWALLOWED] | ConfigLoader.load throws during lazy preload | housekeeping | n | LOG-ONLY | best-effort startup preload |
| StateManager.js:306 | trade has no valid direction, direction math refused | position-state | n | **PROMOTE** | live exit/fill computation blocked, position may be stuck un-exitable |
| StateManager.js:700 | initialBalance invalid, equity falls back to derived | data-integrity | y | LOG-ONLY | EQUITY_INTEGRITY_UNTRUSTED trace fires |
| StateManager.js:809 | activeTrades not a Map (exposure calc) | data-integrity | y | LOG-ONLY | container-refusal trace fires |
| StateManager.js:853 | activeTrades not a Map (signed exposure) | data-integrity | y | LOG-ONLY | container-refusal trace fires |
| StateManager.js:980 | disk persistence failed in locked update | data-integrity | y | LOG-ONLY | STATE_PERSISTENCE_RECONCILIATION_REQUIRED fires |
| StateManager.js:1011 | disk persistence failed at boundary | data-integrity | y | LOG-ONLY | reconciliation trace fires |
| StateManager.js:1079 | state update threw, rolled back to snapshot | data-integrity | y | LOG-ONLY | STATE_UPDATE_FAILED fires |
| StateManager.js:1313 | openPosition while already holding position | housekeeping | n | LOG-ONLY | allowed add-to-position |
| StateManager.js:1414 [SWALLOWED] | narrator.entered threw | housekeeping | n | LOG-ONLY | cosmetic, must-never-throw |
| StateManager.js:1440 | openPosition rejected: trade scope build failed | order-lifecycle | n | **PROMOTE** | live entry silently blocked, no trace |
| StateManager.js:1453 | openPosition rejected: missing identity fields | order-lifecycle | n | **PROMOTE** | live entry silently blocked |
| StateManager.js:1466 | openPosition rejected: exit-contract assertion failed | order-lifecycle | n | **PROMOTE** | live entry silently blocked |
| StateManager.js:1480 | openPosition rejected: quantity invariant failed | order-lifecycle | n | **PROMOTE** | live entry silently blocked |
| StateManager.js:1497 | openPosition rejected: ledger skeleton build failed | order-lifecycle | n | **PROMOTE** | live entry silently blocked |
| StateManager.js:1506 | decision ledger failed to persist after entry/exit | data-integrity | y | LOG-ONLY | DECISION_LEDGER_RECONCILIATION_REQUIRED fires |
| StateManager.js:1545 | closePosition partial=true unsupported | order-lifecycle | n | **PROMOTE** | live exit refused, caller bug could strand a position |
| StateManager.js:1557 | closePosition with no open position | order-lifecycle | n | **PROMOTE** | silent exit failure may mask caller/state desync |
| StateManager.js:1565 | closePosition without tradeId | order-lifecycle | n | **PROMOTE** | exit refused with no alert |
| StateManager.js:1571 | closePosition tradeId not in activeTrades | order-lifecycle | n | **PROMOTE** | possible stuck/orphaned position |
| StateManager.js:1737 [SWALLOWED] | narrator.closed threw | housekeeping | n | LOG-ONLY | cosmetic |
| StateManager.js:1817 | reducePosition invalid fraction | order-lifecycle | n | **PROMOTE** | live partial-exit refused with no trace |
| StateManager.js:1825 | reducePosition tradeId not found | order-lifecycle | n | **PROMOTE** | partial-exit fails silently |
| StateManager.js:2102 | direction-integrity symbol entry halt recorded | risk-guard | y | LOG-ONLY | DIRECTION_INTEGRITY_SYMBOL_HALT fires |
| StateManager.js:2147 [SWALLOWED] | normalizeSymbol fails labeling quarantine record | data-integrity | n | LOG-ONLY | degrades to raw symbol, caller traces record |
| StateManager.js:2198 | active trade quarantined for direction integrity | position-state | y | LOG-ONLY | TRADE_QUARANTINED trace fires |
| StateManager.js:2206 [SWALLOWED] | normalizeSymbol fails, quarantine call aborts | data-integrity | y | LOG-ONLY | caller folds into SYMBOL_CONTEXT_QUARANTINED |
| StateManager.js:2220 [SWALLOWED] | normalizeSymbol fails matching trade in sweep | data-integrity | n | LOG-ONLY | degrades to raw match |
| StateManager.js:2242 | broker-unverifiable trade preserved not quarantined | position-state | y | LOG-ONLY | EVIDENCE_PRESERVED trace fires |
| StateManager.js:2443 | restored trades reference unverifiable broker lane | broker-reject | y | LOG-ONLY | BROKER_UNVERIFIABLE fires |
| StateManager.js:2534 | emergencyReset invoked, wiping state | housekeeping | n | LOG-ONLY | no live call sites |
| StateManager.js:2679 | persisted liveness pause cleared on load | housekeeping | n | LOG-ONLY | startup self-heal |
| StateManager.js:2725 | legacy TTP pause migrated to quarantine | housekeeping | n | LOG-ONLY | one-time migration |
| StateManager.js:2822 | updateActiveTrade called outside PositionTracker | position-state | n | **PROMOTE** | unauthorized mutation of trade truth, no trace |
| StateManager.js:2823 | bypass companion: caller identity | position-state | n | fold into :2822 | same violation |
| StateManager.js:2824 | bypass companion: orderId | position-state | n | fold into :2822 | same violation |
| StateManager.js:2835 [SWALLOWED] | bypass-alert listener threw | housekeeping | n | LOG-ONLY | listener isolation, halt already set |
| StateManager.js:3401 [SWALLOWED] | applyFill DTO validation throws on malformed fill | broker-reject | n | **PROMOTE** | confirmed fill can silently fail to apply to state — zero log/trace |
| StateManager.js:3936 | validateState invariant violations | data-integrity | n | LOG-ONLY | isInSync has no call sites (dead) |
| StateManager.js:3984 [SWALLOWED] | ConfigLoader.get throws reading cooldown config | housekeeping | n | LOG-ONLY | immediate fallback |
| StateManager.js:4049 | symbol cooldown halt after consecutive losses | risk-guard | n | LOG-ONLY | guardrail firing as designed |
| StateManager.js:4088 | unauthorized symbolEntryHalts mutation silently discarded | position-state | n | **PROMOTE** | caller believes halt update succeeded; dropped without trace |
| StateManager.js:4120 | haltSymbol refused: unknown halt code | risk-guard | n | **PROMOTE** | requested halt refused, unsafe symbol may stay tradeable |
| StateManager.js:4138 | symbol entry halt recorded via haltSymbol | risk-guard | y | LOG-ONLY | production callers trace around this call |
| StateManager.js:4166 | symbol entry halt reset | risk-guard | n | LOG-ONLY | informational |
| StateManager.js:4249 | writeJsonAtomic threw saving state | data-integrity | y | LOG-ONLY | reconciliation trace fires here or in caller |
| StateManager.js:4357 | legacy recoveryMode dropped on load | housekeeping | n | LOG-ONLY | migration notice |
| StateManager.js:4377 | activeTrades invariant failed after restore, container reset | data-integrity | n | **PROMOTE** | open-position knowledge wiped at boot, quarantine record built WITHOUT emitTrace |
| StateManager.js:4392 | persisted isTrading non-boolean, forcing paused | risk-guard | n | LOG-ONLY | fail-safe direction |
| StateManager.js:4495 | trade symbols normalized on load | housekeeping | n | LOG-ONLY | cosmetic migration |
| StateManager.js:4528 | source-less exposure quarantined, position forced 0 | position-state | n | **PROMOTE** | persisted money truth rewritten at boot, no trace |
| StateManager.js:4553 | invalid flat-state inPosition quarantined on load | position-state | n | **PROMOTE** | exposure truth rewritten at boot, no trace |
| StateManager.js:4567 | stale flat-position metadata cleared | housekeeping | n | LOG-ONLY | metadata-only |
| StateManager.js:4593 | state load from disk failed | data-integrity | n | LOG-ONLY | rethrown, boot crash is maximally visible |
| StateManager.js:4683 | state-change listener threw | housekeeping | n | LOG-ONLY | listener isolation |
| StateManager.js:4692 | dashboard broadcast after update failed | housekeeping | n | LOG-ONLY | cosmetics |
| StateManager.js:4710 | dashboard_connect initial broadcast failed | housekeeping | n | LOG-ONLY | cosmetics |
| StateManager.js:4728 | heartbeat stopped, socket not open | housekeeping | n | LOG-ONLY | cosmetics |
| StateManager.js:4736 | heartbeat broadcast failed | housekeeping | n | LOG-ONLY | cosmetics |
| StateManager.js:4776 | dashboard WS closed, broadcasts stopped | housekeeping | n | LOG-ONLY | cosmetics |
| StateManager.js:4816 [SWALLOWED] | normalizeSymbol fails in dashboard projection | housekeeping | n | LOG-ONLY | display only |
| StateManager.js:4896 [SWALLOWED] | normalizeSymbol fails in pricing status | housekeeping | n | LOG-ONLY | display only |
| StateManager.js:4919 | state_update skipped, socket not open | housekeeping | n | LOG-ONLY | cosmetics |
| StateManager.js:5011 | state_update broadcast threw | housekeeping | n | LOG-ONLY | cosmetics |

### core/CandleProcessor.js, TradeJournalBridge.js, TradeJournal.js, CandleStore.js (79 sites)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| CandleProcessor.js:261 | broker_status frame broadcast threw | housekeeping | n | LOG-ONLY | cosmetics |
| CandleProcessor.js:307 | error_event frame broadcast threw | housekeeping | n | LOG-ONLY | cosmetics |
| CandleProcessor.js:337 | resumeTradingIfPausedBy rejects after fresh data | risk-guard | n | LOG-ONLY | fails safe (stays paused) |
| CandleProcessor.js:375 | live candle for symbol with no SymbolTradingContext | position-state | n | **PROMOTE** | silently blinds indicators/marketData for that symbol's open positions |
| CandleProcessor.js:511 | non-integer ms timestamp rejected pre-math | data-integrity | n | **PROMOTE** | corrupt broker timestamp reached live pricing pipeline |
| CandleProcessor.js:731 | calendar says non-RTH but isRTH=true | feed-death | n | LOG-ONLY | defensive fallback |
| CandleProcessor.js:735 | calendar says RTH but isRTH=false | feed-death | n | LOG-ONLY | defensive fallback |
| CandleProcessor.js:740 | market-phase missing isRTH | feed-death | n | LOG-ONLY | defensive fallback |
| CandleProcessor.js:766 | backfill: adapter lacks getCandles | feed-death | n | LOG-ONLY | terminal outcome surfaced at 1129 |
| CandleProcessor.js:773 | backfill: no resolvable symbol | feed-death | n | LOG-ONLY | detail feeding 1129 |
| CandleProcessor.js:779 | backfill: invalid timeframe | feed-death | n | LOG-ONLY | detail |
| CandleProcessor.js:787 | backfill: broker identity unresolved | feed-death | n | LOG-ONLY | detail |
| CandleProcessor.js:798 | backfill: stock-through-Kraken refused | feed-death | n | LOG-ONLY | cross-broker guard detail |
| CandleProcessor.js:802 | backfill: crypto-through-Alpaca refused | feed-death | n | LOG-ONLY | cross-broker guard detail |
| CandleProcessor.js:815 | backfill: REST returned zero candles | feed-death | n | LOG-ONLY | detail |
| CandleProcessor.js:827 | backfill: all candles failed normalization | feed-death | n | LOG-ONLY | detail |
| CandleProcessor.js:845 | backfill: getCandles threw | feed-death | n | LOG-ONLY | folded into terminal failure |
| CandleProcessor.js:997 | OHLC payload not valid ≥8-element array, dropped | data-integrity | n | LOG-ONLY | liveness watchdog self-heals |
| CandleProcessor.js:1005 | OHLC time fields invalid, dropped | data-integrity | n | LOG-ONLY | same watchdog path |
| CandleProcessor.js:1041 | candle age exceeds staleDataMaxAgeMs (confirmed stale) | feed-death | n | **PROMOTE** | trading explicitly continues on stale price data |
| CandleProcessor.js:1043 | stale-data "not pausing" notice | feed-death | n | fold into :1041 | same event |
| CandleProcessor.js:1106 | gap detected between live candles | feed-death | n | LOG-ONLY | informational trigger |
| CandleProcessor.js:1129 | gap backfill failed, trading not paused, retry scheduled | feed-death | n | **PROMOTE** | live trading through a known unfilled data gap |
| CandleProcessor.js:1284 | dashboard broadcast threw post-candle | housekeeping | n | LOG-ONLY | cosmetics |
| TradeJournalBridge.js:204 [SWALLOWED] | JSON round-trip of provenance object threw | housekeeping | n | LOG-ONLY | drops one optional field |
| TradeJournalBridge.js:387 [SWALLOWED] | JSON.stringify of non-Error threw | housekeeping | n | LOG-ONLY | falls back to String(err) |
| TradeJournalBridge.js:564 | startup journal-open reconciliation threw | position-state | n | **PROMOTE** | truth reconciliation vs broker silently abandoned |
| TradeJournalBridge.js:607 | journal bundle preload failed for one symbol | data-integrity | n | **PROMOTE** | that symbol's live entries/exits will fail journaling later |
| TradeJournalBridge.js:812 | entry journaling threw wrapping executeTrade | position-state | y | LOG-ONLY | TRADE_JOURNAL_RECONCILIATION_REQUIRED fires |
| TradeJournalBridge.js:944 | broker lacks getPositions, reconciliation skipped | position-state | n | **PROMOTE** | open trades never verified vs broker truth, no trace on this skip |
| TradeJournalBridge.js:1048 | N stale journal-opens reconciled (success) | housekeeping | n | LOG-ONLY | informational |
| TradeJournalBridge.js:1059 | closed-trade record missing fields, refused | data-integrity | n | **PROMOTE** | real closed trade fails to enter journal of truth |
| TradeJournalBridge.js:1079 | duplicate closed-trade ignored | housekeeping | n | LOG-ONLY | correct de-dup |
| TradeJournalBridge.js:1189 | exit journaling threw | position-state | y | LOG-ONLY | reconciliation trace fires |
| TradeJournalBridge.js:1257 | visibility-failure append to scoped ledger threw | data-integrity | n | **PROMOTE** | record of a failed journal write itself lost |
| TradeJournalBridge.js:1266 | visibility failure has no ledger path at all | data-integrity | n | **PROMOTE** | same loss, no write even attempted |
| TradeJournalBridge.js:1294 | marking trade "unjournaled" in StateManager threw | position-state | n | **PROMOTE** | journaled-state truth fails to update |
| TradeJournalBridge.js:1353 | persistence-failure streak hit threshold, pauseTrading unavailable | risk-guard | y | LOG-ONLY | INFRASTRUCTURE_HALTED already emitted |
| TradeJournalBridge.js:1361 | pauseTrading promise rejected post-journal-failures | risk-guard | y | LOG-ONLY | on already-traced path |
| TradeJournalBridge.js:1398 | resumeTradingIfPausedBy rejected after recovery | risk-guard | n | LOG-ONLY | fails safe (stays paused) |
| TradeJournalBridge.js:1410 | visibility failure persisted nowhere (ledger+fallback dead) | data-integrity | n | **PROMOTE** | "alert only, trading not paused" despite total record loss |
| TradeJournalBridge.js:1524 | overflow summary persist threw | housekeeping | n | LOG-ONLY | dashboard bookkeeping |
| TradeJournalBridge.js:1538 | overflow summary fallback persist threw | housekeeping | n | LOG-ONLY | bookkeeping |
| TradeJournalBridge.js:1541 [SWALLOWED] | stderr write of overflow summary threw | housekeeping | n | LOG-ONLY | bookkeeping, deliberately non-throwing |
| TradeJournalBridge.js:1593 | fallback persist of real visibility-failure record threw | data-integrity | n | **PROMOTE** | primary and fallback both failed for a live trade failure record |
| TradeJournalBridge.js:1596 [SWALLOWED] | last-resort stderr write also threw | data-integrity | n | **PROMOTE** | audit trail completely and silently lost |
| TradeJournalBridge.js:1661 | dashboard journal/replay handler threw | housekeeping | n | LOG-ONLY | dashboard feature |
| TradeJournalBridge.js:1681 | dashboard WS lacks .on() | housekeeping | n | LOG-ONLY | degrades gracefully |
| TradeJournalBridge.js:1703 [SWALLOWED] | dashboard WS message JSON.parse failed | housekeeping | n | LOG-ONLY | malformed control message |
| TradeJournalBridge.js:1735 | dashboardWs.send threw | housekeeping | n | LOG-ONLY | queued/retried |
| TradeJournalBridge.js:1990 | CSV export failed | housekeeping | n | LOG-ONLY | export feature |
| TradeJournalBridge.js:2002 | JSON report export failed | housekeeping | n | LOG-ONLY | export feature |
| TradeJournal.js:94 [SWALLOWED] | jsonCloneOrNull round-trip threw | housekeeping | n | LOG-ONLY | drops optional metadata |
| TradeJournal.js:273 | recordEntry refused: missing fields | data-integrity | y | LOG-ONLY | bridge maps to reconciliation trace |
| TradeJournal.js:278 | recordEntry refused: notional mismatch | data-integrity | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:283 | recordEntry refused: duplicate orderId | data-integrity | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:358 | recordExit refused: missing orderId | data-integrity | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:365 | recordExit refused: no matching open entry | position-state | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:396 | recordExit refused: missing fields | data-integrity | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:403 | recordExit refused: notional conflicts with size | data-integrity | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:407 | recordExit refused: exit exceeds open size | position-state | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:421 | recordExit refused: pnl mismatch vs price-implied | data-integrity | y | LOG-ONLY | reconciliation-trace path |
| TradeJournal.js:546 | reconciliation refused: missing proof fields | position-state | n | LOG-ONLY | fails safe, trade stays open |
| TradeJournal.js:552 | reconciliation refused: no matching entry | position-state | n | LOG-ONLY | fails safe |
| TradeJournal.js:566 | reconciliation refused: proof inconsistent | position-state | n | LOG-ONLY | fails safe |
| TradeJournal.js:571 | reconciliation refused: exposure still authoritative | position-state | n | LOG-ONLY | fails safe |
| TradeJournal.js:603 | OPEN_TRADE_RECONCILED logged (success) | housekeeping | n | LOG-ONLY | informational |
| TradeJournal.js:622 | brokerUnverified refused: missing fields | position-state | y | LOG-ONLY | incident already active/traced |
| TradeJournal.js:628 | brokerUnverified refused: no matching entry | position-state | y | LOG-ONLY | incident already traced |
| TradeJournal.js:661 | OPEN_TRADE_BROKER_UNVERIFIED logged (success) | housekeeping | n | LOG-ONLY | informational |
| TradeJournal.js:1319 | appendFileSync to ledger/equity/stats threw | data-integrity | y | LOG-ONLY | rethrows into bridge's halt path |
| TradeJournal.js:1335 | stats cache write failed | housekeeping | n | LOG-ONLY | display cache |
| TradeJournal.js:1516 [SWALLOWED] | one equity-snapshot line parse failed in rebuild | data-integrity | n | LOG-ONLY | single display point dropped |
| TradeJournal.js:1529 | ledger corrupt, startup rebuild fails, rethrown | data-integrity | n | **PROMOTE** | bot cannot establish trusted trade history at boot |
| CandleStore.js:286 | v1 flat-array cache rejected at startup | data-integrity | n | LOG-ONLY | cold-cache, self-heals |
| CandleStore.js:292 | unrecognized cache shape rejected | data-integrity | n | LOG-ONLY | cold-cache |
| CandleStore.js:310 | cache read/parse threw | data-integrity | n | LOG-ONLY | falls back to cold start |
| CandleStore.js:344 [SWALLOWED] | on-disk v2 container read invalid during save merge | data-integrity | n | **PROMOTE** | silently discards ALL other symbols' persisted candle history on next write |
| CandleStore.js:363 | writeJsonCompactAtomic threw persisting candles | housekeeping | n | LOG-ONLY | one save cycle skipped, memory unaffected |

### core/Supervisor.js, PatternMemoryBank.js, KrakenAdapterV2.js, SingletonLock.js (74 sites)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| Supervisor.js:58 [SWALLOWED] | /proc pid_max read fails, falls back 2^22 | housekeeping | n | LOG-ONLY | benign one-time fallback |
| Supervisor.js:217 | register-time poll threw | housekeeping | n | LOG-ONLY | defense-in-depth catch-all |
| Supervisor.js:313 | periodic poll threw | housekeeping | n | LOG-ONLY | same redundancy |
| Supervisor.js:351 | getHealth still in flight, tick skipped | feed-death | n | LOG-ONLY | self-throttled warning |
| Supervisor.js:377 [SWALLOWED] | getHealth threw/timed out | feed-death | n | LOG-ONLY | captured into failureReason, surfaces via state machine |
| Supervisor.js:394 | subsystem returned null health | data-integrity | n | LOG-ONLY | contract normalization |
| Supervisor.js:407 | invalid status enum | data-integrity | n | LOG-ONLY | normalization |
| Supervisor.js:412 | HEALTHY with failureReason (lying subsystem) | data-integrity | n | LOG-ONLY | handled by DEGRADED transition |
| Supervisor.js:611 | _dispatchAlert threw synchronously | risk-guard | n | **PROMOTE** | DEAD-transition operator page silently failed, no remaining channel |
| Supervisor.js:659 | onAlert hook failed/timed out on DEAD transition | risk-guard | n | **PROMOTE** | operator paging on subsystem death is the last line of defense |
| Supervisor.js:691 | selfHeal threw during auto-heal | housekeeping | n | LOG-ONLY | durably recorded in heal_attempt ledger |
| Supervisor.js:730 | escalate (PM2 restart) threw | housekeeping | n | LOG-ONLY | recorded, operator already paged on DEAD |
| Supervisor.js:771 | deadman heartbeat non-2xx | housekeeping | n | LOG-ONLY | no-retry Layer B, next tick retries |
| Supervisor.js:779 | deadman heartbeat network error | housekeeping | n | LOG-ONLY | documented non-critical |
| Supervisor.js:834 [SWALLOWED] | /proc pid stat read failed | housekeeping | n | LOG-ONLY | benign fallback |
| Supervisor.js:854 | HMAC key wrong length, regenerating | data-integrity | n | LOG-ONLY | startup one-time recovery |
| Supervisor.js:857 | HMAC key unreadable, regenerating | data-integrity | n | LOG-ONLY | startup recovery |
| Supervisor.js:866 | HMAC signing key write failed | data-integrity | n | **PROMOTE** | all future ledger entries unsigned/rejected on replay for process lifetime |
| Supervisor.js:896 [SWALLOWED] | hex-decode of entry HMAC failed | data-integrity | n | LOG-ONLY | fails closed |
| Supervisor.js:939 | appendFileSync of ledger entry failed | data-integrity | n | **PROMOTE** | silently loses the durable audit trail for restart-loop replay |
| Supervisor.js:972 | ledger unreadable during replay | housekeeping | n | LOG-ONLY | startup-only, documented |
| Supervisor.js:985 [SWALLOWED] | malformed JSON line in replay | housekeeping | n | LOG-ONLY | per-line skip |
| Supervisor.js:998 | legacy unsigned entries skipped | housekeeping | n | LOG-ONLY | expected one-time |
| PatternMemoryBank.js:254 | primary bank JSON failed load/parse | data-integrity | n | LOG-ONLY | falls back to backup |
| PatternMemoryBank.js:263 | primary missing, restored from backup | housekeeping | n | LOG-ONLY | recovery notice |
| PatternMemoryBank.js:271 | no primary or backup exists | housekeeping | n | LOG-ONLY | empty bank is safe default |
| PatternMemoryBank.js:295 | parse failed, recovered from backup | housekeeping | n | LOG-ONLY | recovery notice |
| PatternMemoryBank.js:329 | outcome telemetry append failed | housekeeping | n | LOG-ONLY | diagnostic JSONL only |
| PatternMemoryBank.js:451 | recordTradeOutcome refused, earlier prune failed | data-integrity | n | LOG-ONLY | echo of 607 |
| PatternMemoryBank.js:458 | extractPattern returned nothing, skipped | data-integrity | n | LOG-ONLY | safe skip |
| PatternMemoryBank.js:472 | outcome missing required fields, skipped | data-integrity | n | LOG-ONLY | guards malformed writes |
| PatternMemoryBank.js:607 | required prune removed nothing, rolled back | data-integrity | n | LOG-ONLY | learning cache only |
| PatternMemoryBank.js:625 | unexpected exception in recordTradeOutcome | data-integrity | n | LOG-ONLY | learning cache safety net |
| PatternMemoryBank.js:763 | getPatternConfidence threw | housekeeping | n | LOG-ONLY | fails safe to null |
| PatternMemoryBank.js:851 | extractPattern threw | housekeeping | n | LOG-ONLY | fails safe |
| PatternMemoryBank.js:970 | prune save failed, rolled back | data-integrity | n | LOG-ONLY | cache consistency |
| PatternMemoryBank.js:1060 | saveMemory write failed | data-integrity | n | LOG-ONLY | derived cache, backup-recoverable |
| PatternMemoryBank.js:1075 | backup skipped, primary failed validation | housekeeping | n | LOG-ONLY | preserves last-known-good |
| PatternMemoryBank.js:1098 | importMemory save failed, rolled back | housekeeping | n | LOG-ONLY | admin path |
| PatternMemoryBank.js:1155 | reset() wiping patterns | housekeeping | n | LOG-ONLY | operator-triggered notice |
| PatternMemoryBank.js:1160 | reset save failed, rolled back | data-integrity | n | LOG-ONLY | cache consistency |
| KrakenAdapterV2.js:65 | wrapped/legacy adapter notice | housekeeping | n | LOG-ONLY | informational |
| KrakenAdapterV2.js:86 | connect (REST+WS) failed | feed-death | n | **PROMOTE** | exchange connectivity loss blocks orders/balance/data |
| KrakenAdapterV2.js:109 | getBalance failed, `{}` returned | position-state | n | **PROMOTE** | empty {} readable as real zero balance downstream |
| KrakenAdapterV2.js:129 | getOpenOrders stub | housekeeping | n | LOG-ONLY | permanent limitation notice |
| KrakenAdapterV2.js:165 | placeBuyOrder failed | order-lifecycle | n | **PROMOTE** | failed open on live money path |
| KrakenAdapterV2.js:195 | placeSellOrder failed | order-lifecycle | n | **PROMOTE** | failed exit can leave exposure open |
| KrakenAdapterV2.js:204 | cancelOrder failed | order-lifecycle | n | **PROMOTE** | stale order may fill later |
| KrakenAdapterV2.js:211 | modifyOrder stub | housekeeping | n | LOG-ONLY | limitation notice |
| KrakenAdapterV2.js:218 | getOrderStatus stub | housekeeping | n | LOG-ONLY | limitation notice |
| KrakenAdapterV2.js:230 | getTicker failed, null | feed-death | n | LOG-ONLY | self-heals next poll, would spam |
| KrakenAdapterV2.js:237 | getCandles stub | housekeeping | n | LOG-ONLY | limitation |
| KrakenAdapterV2.js:243 | getOrderBook stub | housekeeping | n | LOG-ONLY | limitation |
| KrakenAdapterV2.js:266 | subscribeToOrderBook stub | housekeeping | n | LOG-ONLY | limitation |
| KrakenAdapterV2.js:272 | subscribeToAccount polls instead of WS | housekeeping | n | LOG-ONLY | informational |
| KrakenAdapterV2.js:281 | 5s account-poll tick failed | feed-death | n | LOG-ONLY | transient, self-heals |
| KrakenAdapterV2.js:312 | getSupportedSymbols failed, fallback | feed-death | n | LOG-ONLY | sane fallback |
| SingletonLock.js:55 | another live instance detected | risk-guard | n | **PROMOTE** | the exact duplicate-trading condition the lock exists for |
| SingletonLock.js:83 | lock file corrupt, deleted and overwritten | risk-guard | n | **PROMOTE** | corrupt lock could mask a live second instance |
| SingletonLock.js:88 | unlink of corrupt lock failed | housekeeping | n | LOG-ONLY | best-effort cleanup |
| SingletonLock.js:113 | atomic lock write failed, process exits | housekeeping | n | LOG-ONLY | fails closed, bot never starts |
| SingletonLock.js:135 [SWALLOWED] | process.kill(pid,0) probe threw | housekeeping | n | LOG-ONLY | idiomatic existence check |
| SingletonLock.js:158 | uncaughtException handler firing | risk-guard | n | **PROMOTE** | process crashing possibly mid-order |
| SingletonLock.js:164 | unhandledRejection handler firing | risk-guard | n | **PROMOTE** | same |
| SingletonLock.js:178 | lock monitor: file disappeared, exiting | risk-guard | n | **PROMOTE** | tampering or second-instance evidence |
| SingletonLock.js:184 | lock monitor: pid/token mismatch, exiting | risk-guard | n | **PROMOTE** | direct double-instance takeover evidence |
| SingletonLock.js:188 | lock monitor loop threw (does NOT exit) | risk-guard | n | **PROMOTE** | transient error silently skips an integrity check instead of failing safe |
| SingletonLock.js:212 | releaseLock found other-owned lock, left alone | housekeeping | n | LOG-ONLY | benign shutdown branch |
| SingletonLock.js:216 | releaseLock failed to remove own lock | housekeeping | n | LOG-ONLY | self-heals next startup |
| SingletonLock.js:229 [SWALLOWED] | hasLock threw, treated not-holding | housekeeping | n | LOG-ONLY | conservative default |
| SingletonLock.js:252 [SWALLOWED] | getLockStatus threw, error in payload | housekeeping | n | LOG-ONLY | diagnostic endpoint |
| SingletonLock.js:273 | critical port already bound | risk-guard | n | **PROMOTE** | duplicate-instance/port-conflict risk class |

### Brokers — live adapters + registry (KrakenIBrokerAdapter, AlpacaAdapter, BrokerFactory, BrokerRegistry)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| KrakenIBrokerAdapter.js:44 | connect to kraken_adapter_simple failed, false returned | feed-death | n | **PROMOTE** | sole live crypto broker; connection loss silently blocks all order/position/balance ops |
| AlpacaAdapter.js:233 | broker-truth funnel (connect/balance/positions/orders/ws-auth/cancel) | broker-reject | y\* | **PROMOTE** | emits `*_UNAVAILABLE` events the notifier filters (no keyword match) — additive keyword-visible emission |
| AlpacaAdapter.js:744 | account WS authorization rejected | position-state | y\* | **PROMOTE** | real-time fill/account truth lost, phone-invisible event name |
| AlpacaAdapter.js:770 | account WS message parse failed | position-state | y\* | **PROMOTE** | dropped message can miss a fill, phone-invisible |
| AlpacaAdapter.js:779 | account WS transport error | position-state | y\* | **PROMOTE** | account channel break, phone-invisible |
| AlpacaAdapter.js:784 | account WS disconnected | position-state | y\* | **PROMOTE** | fill-truth loss, phone-invisible |
| AlpacaAdapter.js:842 | getSupportedSymbols failed | housekeeping | n | LOG-ONLY | metadata |
| AlpacaAdapter.js:1015 | market-data WS error | feed-death | y | LOG-ONLY | price-stream noise, already traced |
| AlpacaAdapter.js:1022 | market-data silent, forcing reconnect | feed-death | y | LOG-ONLY | watchdog path |
| AlpacaAdapter.js:1052 | data stream error frame | feed-death | y | LOG-ONLY | stream noise |
| AlpacaAdapter.js:1063 | closing auth-failed socket threw | housekeeping | n | LOG-ONLY | secondary cleanup |
| AlpacaAdapter.js:1080 | bar for unsubscribed symbol | data-integrity | n | LOG-ONLY | discarded, non-blocking |
| AlpacaAdapter.js:1085 | bar with unparsable timestamp | data-integrity | n | LOG-ONLY | discarded |
| AlpacaAdapter.js:1089 | bar timestamp misaligned to interval | data-integrity | n | LOG-ONLY | discarded |
| BrokerFactory.js:60 | createBrokerAdapter failed, logged then rethrown | housekeeping | n | LOG-ONLY | init failure surfaced via rethrow |
| BrokerRegistry.js:264 [SWALLOWED] | isImplemented require threw, false returned | housekeeping | n | LOG-ONLY | introspection helper |

### Brokers — dormant adapters (not instantiated by run-empire-v2.js; † = re-rule if activated)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| SchwabAdapter.js:83 | OAuth2 token refresh fails | broker-reject | n | LOG-ONLY† | dormant; auth failure would halt all trading if activated |
| SchwabAdapter.js:111 | shared authenticated REST call fails | broker-reject | n | LOG-ONLY† | dormant; funnels order/balance truth failures |
| SchwabAdapter.js:136 | connect fails | broker-reject | n | LOG-ONLY† | dormant |
| SchwabAdapter.js:166 | streaming quote WS errors | feed-death | n | LOG-ONLY | price-stream noise |
| SchwabAdapter.js:232 | getBalance fails, null | position-state | n | LOG-ONLY† | dormant; balance truth if activated |
| SchwabAdapter.js:255 | getPositions fails, [] | position-state | n | LOG-ONLY† | dormant; zero-positions masking if activated |
| SchwabAdapter.js:281 | getOpenOrders fails, [] | order-lifecycle | n | LOG-ONLY† | dormant |
| SchwabAdapter.js:338 | place order fails, null | order-lifecycle | n | LOG-ONLY† | dormant |
| SchwabAdapter.js:351 | cancelOrder fails, false | order-lifecycle | n | LOG-ONLY† | dormant |
| SchwabAdapter.js:371 | getOrderStatus fails, null | order-lifecycle | n | LOG-ONLY† | dormant |
| SchwabAdapter.js:393 | getTicker fails | feed-death | n | LOG-ONLY | price lookup |
| SchwabAdapter.js:420 | getCandles fails | feed-death | n | LOG-ONLY | historical fetch |
| SchwabAdapter.js:427 | getOrderBook unsupported stub | housekeeping | n | LOG-ONLY | capability gap |
| GeminiAdapter.js:88 | shared authenticated REST fails | broker-reject | n | LOG-ONLY† | dormant |
| GeminiAdapter.js:101 | public REST fails | feed-death | n | LOG-ONLY | market data |
| GeminiAdapter.js:119 | connect fails | broker-reject | n | LOG-ONLY† | dormant |
| GeminiAdapter.js:138 | market WS errors | feed-death | n | LOG-ONLY | stream noise |
| GeminiAdapter.js:223 | getBalance fails | position-state | n | LOG-ONLY† | dormant |
| GeminiAdapter.js:269 | getOpenOrders fails | order-lifecycle | n | LOG-ONLY† | dormant |
| GeminiAdapter.js:312 | place order fails | order-lifecycle | n | LOG-ONLY† | dormant |
| GeminiAdapter.js:324 | cancelOrder fails | order-lifecycle | n | LOG-ONLY† | dormant |
| GeminiAdapter.js:344 | getOrderStatus fails | order-lifecycle | n | LOG-ONLY† | dormant |
| GeminiAdapter.js:362 | getTicker fails | feed-death | n | LOG-ONLY | price lookup |
| GeminiAdapter.js:370 | getCandles unsupported stub | housekeeping | n | LOG-ONLY | capability gap |
| GeminiAdapter.js:390 | getOrderBook fails | feed-death | n | LOG-ONLY | depth read |
| GeminiAdapter.js:440 | getSupportedSymbols fails | housekeeping | n | LOG-ONLY | metadata |
| BinanceAdapter.js:49 | connect fails | broker-reject | n | LOG-ONLY† | dormant |
| BinanceAdapter.js:62 [SWALLOWED] | listen-key delete in disconnect swallowed | housekeeping | n | LOG-ONLY | discard-path cleanup |
| BinanceAdapter.js:97 | listen-key generation fails | position-state | n | LOG-ONLY | REST fallback truth remains |
| BinanceAdapter.js:113 | listen-key delete fails (non-fatal) | housekeeping | n | LOG-ONLY | best-effort |
| BinanceAdapter.js:279 | cancelOrder fails | order-lifecycle | n | LOG-ONLY† | dormant |
| BinanceAdapter.js:429 | subscribeToAccount without listen key | position-state | n | LOG-ONLY | preventive guard |
| BinanceAdapter.js:481 | getSupportedSymbols fails | housekeeping | n | LOG-ONLY | metadata |
| BinanceAdapter.js:546 | asset price fetch fails, {} | feed-death | n | LOG-ONLY | display pricing |
| BinanceAdapter.js:563 [SWALLOWED] | WS frame parse dropped | data-integrity | n | LOG-ONLY | non-blocking |
| BinanceAdapter.js:569 | market WS transport errors | feed-death | n | LOG-ONLY | stream noise |
| UpholdAdapter.js:67, 80, 100, 155, 234, 257, 276, 283, 289, 300, 356, 434 | REST/connect/balance/tx/status/ticker/stubs/wallet failures | mixed | n | LOG-ONLY | unregistered adapter, absent from catalog, no live money possible |
| InteractiveBrokersAdapter.js:52, 88, 199, 223, 379 | connect/REST/bracket-stub/cancel/poll failures | mixed | n | LOG-ONLY | dormant, never instantiated |
| CoinbaseAdapter.js:48, 231, 379, 421, 485 [SWALLOWED], 491 | connect/cancel/config/symbols/WS-parse/WS-error | mixed | n | LOG-ONLY | dormant |
| TastyworksAdapter.js:47, 62, 231, 345 [SWALLOWED], 401 | connect/teardown/cancel/IV-null/poll failures | mixed | n | LOG-ONLY | dormant |
| OandaAdapter.js:48, 213, 389 [SWALLOWED], 395, 431, 463 [SWALLOWED] | connect/cancel/WS-parse/WS-error/poll/symbol-fallback | mixed | n | LOG-ONLY | dormant |
| CMEAdapter.js:42, 170, 253, 384 [SWALLOWED] | connect/zeroed-ticker/poll/contango-null | mixed | n | LOG-ONLY | dormant |

### core/SessionRouter.js, WebSocketManager.js, TradingLoop.js, StrategyOrchestrator.js, BacktestRunner.js, session-router/TransitionStore.js (71 sites)

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| SessionRouter.js:261 | force-close fails during transition flatten | position-state | y | LOG-ONLY | propagates into FAILED_SAFE_HALT trace |
| SessionRouter.js:301 | initial session activation throws | broker-reject | y | LOG-ONLY | _enterFailedSafe HALT trace follows |
| SessionRouter.js:318 | transition-failure router itself throws | risk-guard | y | LOG-ONLY | ROUTE_HALT trace on same path |
| SessionRouter.js:587 | local pause-fallback refuses local pause | risk-guard | y | LOG-ONLY | ends in PAUSE_HALT_UNCONFIRMED trace |
| SessionRouter.js:604 | scheduled phase-transition check throws | broker-reject | y | LOG-ONLY | leads to HALT trace |
| SessionRouter.js:703 | releasing durable transition lock after failure throws | data-integrity | n | **PROMOTE** | durable lock/journal left in unrecorded stuck state |
| SessionRouter.js:711 | recovery-mark also fails after lock-release failure | data-integrity | y | LOG-ONLY | RECOVERY_HALT trace fires |
| SessionRouter.js:1151 | OHLC callback rejected: wrong session/broker/epoch | feed-death | n | **PROMOTE** | can mask broken broker/session wiring post-transition |
| SessionRouter.js:1408 | SESSION_FAILED_SAFE journal write fails | data-integrity | y | LOG-ONLY | HALT trace carries journalError |
| SessionRouter.js:1413 | failed-safe mode entered | risk-guard | y | LOG-ONLY | HALT trace next line |
| SessionRouter.js:1466 | failed-safe pause block entered (fires even on success) | risk-guard | n | LOG-ONLY | not a reliable failure signal; real case HALT-traced below |
| SessionRouter.js:1568 | crypto-to-stocks transition throws | broker-reject | y | LOG-ONLY | HALT trace |
| SessionRouter.js:1669 | stocks-to-crypto transition throws | broker-reject | y | LOG-ONLY | HALT trace |
| SessionRouter.js:1679 | crypto activation attempted in failed-safe | risk-guard | n | LOG-ONLY | repeat of already-alarmed state |
| SessionRouter.js:1748 | stocks activation attempted in failed-safe | risk-guard | n | LOG-ONLY | repeat |
| SessionRouter.js:1802 [SWALLOWED] | transition-store status read throws | data-integrity | n | LOG-ONLY | start-safety path throws separately when it matters |
| WebSocketManager.js:30, 52, 124, 142, 183, 219, 231, 308, 313, 363, 372, 375 [SWALLOWED], 391, 422, 428 | dashboard socket auth/parse/heartbeat/broadcast failures | housekeeping | n | LOG-ONLY | dashboard-only connection, not broker/order path |
| TradingLoop.js:113 | symbol-scoped market data missing, global fallback | data-integrity | y | LOG-ONLY | MARKET_SCOPE_FALLBACK fires with traceId |
| TradingLoop.js:217, 363, 388, 406, 425 [all SWALLOWED] | autopsy snapshot normalization throws | housekeeping | n | LOG-ONLY | diagnostic autopsy fallbacks |
| TradingLoop.js:669 | decision-autopsy build/persist fails | housekeeping | y | LOG-ONLY | DECISION_AUTOPSY_FAILED fires |
| TradingLoop.js:796 | dashboard frame refused, missing scope | housekeeping | n | LOG-ONLY | cosmetics |
| TradingLoop.js:804 | dashboard send throws | housekeeping | n | LOG-ONLY | cosmetics |
| TradingLoop.js:846 [SWALLOWED] | narrator.gateDecision throws | housekeeping | n | LOG-ONLY | documented non-critical |
| TradingLoop.js:1074 | autopsy write fails in exit-only skip | housekeeping | y | LOG-ONLY | already emitted before catch |
| TradingLoop.js:1674 | entries blocked, global halt | risk-guard | n | LOG-ONLY | per-candle repeat of alarmed halt |
| TradingLoop.js:1682 | entries blocked, symbol halt | risk-guard | n | LOG-ONLY | repeat |
| TradingLoop.js:1693 | opposite-direction signal vs active trade blocked | order-lifecycle | n | **PROMOTE** | wrong-side double-position guard, no bus visibility |
| TradingLoop.js:1695 | active trade direction unknown, entry refused | position-state | n | **PROMOTE** | explicit reconciliation-needed condition |
| TradingLoop.js:1756 | decision has no position-effect mapping, forced HOLD | order-lifecycle | n | **PROMOTE** | pipeline defect silently converts an order into a no-op |
| TradingLoop.js:2305 | async TRAI promise rejects | housekeeping | n | LOG-ONLY | non-blocking observer |
| TradingLoop.js:2307 | sync TRAI processDecision throws | housekeeping | n | LOG-ONLY | observer |
| StrategyOrchestrator.js:604 [SWALLOWED] | pattern shadow-mode lookup throws | housekeeping | n | LOG-ONLY | shadow-only, decisionImpact none |
| StrategyOrchestrator.js:1255 | strategy/service unavailable or throws | data-integrity | y | LOG-ONLY | STRATEGY_UNAVAILABLE fires |
| StrategyOrchestrator.js:2293 | narrator.patternSpotted throws | housekeeping | n | LOG-ONLY | cosmetic |
| StrategyOrchestrator.js:2400 | candidate rejected by exit-geometry gate | risk-guard | n | LOG-ONLY | routine filtering |
| StrategyOrchestrator.js:2431 | candidate rejected by entry-fanout gate | risk-guard | n | LOG-ONLY | routine filtering |
| StrategyOrchestrator.js:2497 | ATR filter halts ALL candidates, price unusable | feed-death | n | **PROMOTE** | persistent bad price silently stops trading (CRIT-09) |
| StrategyOrchestrator.js:2523 | ATR unavailable, gate skipped | data-integrity | n | LOG-ONLY | benign warmup edge |
| StrategyOrchestrator.js:2701 | price non-positive, zone boost skipped | housekeeping | n | LOG-ONLY | cosmetic boost |
| StrategyOrchestrator.js:2796 | narrator.strategyEval throws | housekeeping | n | LOG-ONLY | cosmetic |
| StrategyOrchestrator.js:2896 | winner's overrideLevels ignored, no exitContractHint | order-lifecycle | n | **PROMOTE** | intended stop/TP geometry silently swapped for generic defaults on a real order |
| BacktestRunner.js:263, 265, 282, 331, 366 [SWALLOWED], 481, 495, 523, 550, 551 | backtest-path errors | mixed | n | LOG-ONLY | backtest-only per rubric |
| TransitionStore.js:33 [SWALLOWED] | transition-state/lock JSON parse fails | data-integrity | y | LOG-ONLY | RECOVERY_REQUIRED → SessionRouter HALT trace |
| TransitionStore.js:149 [SWALLOWED] | transition-events line parse fails | data-integrity | y | LOG-ONLY | flows into RECOVERY_REQUIRED |
| TransitionStore.js:186 [SWALLOWED] | broker-intents line parse fails | data-integrity | y | LOG-ONLY | throws into fail-safe HALT path |

### TRAI advisory layer (trai_core, TradeIntelligenceEngine, TRAIDecisionModule, persistent_llm_client, TRAIWebContext, TRAIPatternIntegration) — 58 sites

All 58 rows: **LOG-ONLY**. The TRAI layer is opinion-only (veto power disabled; RiskManager owns entry authority). Notable structural facts recorded for the inheritance ledger, not promotion: `TradeIntelligenceEngine.evaluate()` has **zero callers** (dead advisory scoring, 15 catch sites); `trai_core` optional-require swallows at 65/69/73; `TRAIDecisionModule:36` swallows logs-dir mkdir at module load. Full per-line rows retained by the census agents' sweep: trai_core.js 65,69,73 [SWALLOWED], 172, 181, 235, 285, 324, 497, 502, 516, 809, 855, 911, 915, 921, 979, 1010, 1033 [SWALLOWED]; TradeIntelligenceEngine.js 189, 259, 343, 418, 497, 535, 604, 676, 746, 797, 852, 912, 965, 1005, 1086; TRAIDecisionModule.js 36 [SWALLOWED], 148, 161, 292, 314, 363, 419, 514, 826, 841, 1024, 1141, 1158, 1162; persistent_llm_client.js 145, 192, 206; TRAIWebContext.js 135, 156, 179, 202; TRAIPatternIntegration.js 41, 61.

### Misc core A (WebhookOrderAdapter, DashboardBroadcaster, UnifiedPatternMemory, TtpCutoffEnforcer, EventLoopMonitor, ErrorHandler, tradeLogger, PositionTracker, OrderRouter, EnhancedPatternRecognition) — 68 sites

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| WebhookOrderAdapter.js:30 [SWALLOWED] | placeholder-URL decode fails at construction | housekeeping | n | LOG-ONLY | init helper |
| WebhookOrderAdapter.js:35 [SWALLOWED] | URL parse fails in dead defensive branch | housekeeping | n | LOG-ONLY | already-validated URL |
| WebhookOrderAdapter.js:59 | enabled with no URL, forced disabled (non-live) | order-lifecycle | n | LOG-ONLY | live path throws instead |
| WebhookOrderAdapter.js:76 | non-https URL, forced disabled (non-live) | order-lifecycle | n | LOG-ONLY | config noise |
| WebhookOrderAdapter.js:83 | vendor-placeholder URL, forced disabled (non-live) | order-lifecycle | n | LOG-ONLY | config noise |
| WebhookOrderAdapter.js:90 | URL parse fails at construction (non-live) | order-lifecycle | n | LOG-ONLY | config noise |
| WebhookOrderAdapter.js:102 | outbound signal rejected pre-POST, missing/invalid fields | order-lifecycle | n | **PROMOTE** | dropped live order → bot/TTP position divergence, console-only evidence |
| WebhookOrderAdapter.js:106 | unsupported action blocked pre-POST | order-lifecycle | n | **PROMOTE** | same divergence risk |
| WebhookOrderAdapter.js:126 | entry throttled within 30s window | order-lifecycle | n | LOG-ONLY | designed risk control |
| WebhookOrderAdapter.js:173 | webhook POST non-2xx, TTP rejected order | broker-reject | n | **PROMOTE** | live order failed to route |
| WebhookOrderAdapter.js:181 | webhook POST threw, delivery unconfirmed | broker-reject | n | **PROMOTE** | delivery unknown, desync risk |
| DashboardBroadcaster.js:164, 169, 174, 179, 186, 199, 206, 437 | edge-analytics guards/compute failures | housekeeping | n | LOG-ONLY | dashboard cosmetics |
| UnifiedPatternMemory.js:658, 703, 726, 739, 754, 770, 900 | pattern-bank save/backup/load lifecycle | data-integrity/housekeeping | n | LOG-ONLY | learning cache, not trade ledger; 726 rethrows loudly |
| TtpCutoffEnforcer.js:383 | cutoff enforcement pass threw, quarantined | risk-guard | n | **PROMOTE** | market-close liquidation enforcement failed, RECONCILIATION-class with no trace |
| TtpCutoffEnforcer.js:423 | activeTrades not Map/array | data-integrity | n | **PROMOTE** | structurally corrupt bookkeeping, silent empty-Map fallback |
| TtpCutoffEnforcer.js:785 | flatness quarantine record could not persist | data-integrity | n | **PROMOTE** | manual-reconciliation audit trail lost |
| TtpCutoffEnforcer.js:804 | quarantine record write returned success:false | data-integrity | n | **PROMOTE** | quarantine truth not persisted |
| TtpCutoffEnforcer.js:828 | haltSymbol threw post-cutoff | risk-guard | n | **PROMOTE** | intended halt may not be in effect |
| TtpCutoffEnforcer.js:873 | clearing verified quarantine failed | risk-guard | n | LOG-ONLY | fails toward staying halted |
| TtpCutoffEnforcer.js:890 | resetSymbolHalt failed clearing quarantine | risk-guard | n | LOG-ONLY | safe direction |
| EventLoopMonitor.js:147, 161, 162, 163, 183, 184, 185, 260 [SWALLOWED] | lag warnings/dashboard send | housekeeping | n | LOG-ONLY | perf diagnostics, alert-only by design |
| ErrorHandler.js:65, 66, 67, 68, 77, 99, 113 | critical/warn/circuit-breaker logs | housekeeping | n | LOG-ONLY | dead code, no callers |
| tradeLogger.js:107 | mkdir of logs dir failed | housekeeping | n | LOG-ONLY | recurs at write step |
| tradeLogger.js:133 | day-file unreadable, loadTodaysTrades returns [] | data-integrity | n | **PROMOTE** | next save atomically overwrites file, permanently erasing the day's journal |
| tradeLogger.js:152 | atomic day-array write failed | data-integrity | n | **PROMOTE** | journal write failure on live path |
| tradeLogger.js:387 | logTrade threw building/saving record | data-integrity | n | **PROMOTE** | completed live trade not journaled |
| tradeLogger.js:514 | readdir of logs dir failed | housekeeping | n | LOG-ONLY | cleanup enumeration |
| tradeLogger.js:541 | cleanOldLogs delete failed | housekeeping | n | LOG-ONLY | disk housekeeping |
| PositionTracker.js:92 | WRITE-ONCE identity field mutation attempted | position-state | n | **PROMOTE** | trade identity corruption; triggers global halt but violation untraced |
| PositionTracker.js:97 | onAlert listener threw | housekeeping | n | LOG-ONLY | halt already set |
| PositionTracker.js:126 | openPosition rejected, haltNewEntries true | risk-guard | n | LOG-ONLY | echo of promoted 92 |
| PositionTracker.js:159 [SWALLOWED] | exit-ownership assertion rejected openPosition | order-lifecycle | n | LOG-ONLY | fails closed, structured error returned |
| PositionTracker.js:174 [SWALLOWED] | buildTradeScope threw opening position | data-integrity | n | LOG-ONLY | fails closed |
| PositionTracker.js:275 | patchTrade rejected non-allowlisted field | data-integrity | n | LOG-ONLY | fails closed |
| PositionTracker.js:365 [SWALLOWED] | close-scope resolution mismatch | position-state | n | **PROMOTE** | can leave a live position stuck open with zero log/trace |
| PositionTracker.js:509 | resetHalt re-enables entries | housekeeping | n | LOG-ONLY | operator action notice |
| OrderRouter.js:438 | broker_truth_unavailable event from adapter | broker-reject | y\* | **PROMOTE** | emits but event name invisible to notifier keywords |
| OrderRouter.js:474 | getAllPositions failed for adapter | position-state | y\* | **PROMOTE** | position truth unavailable, phone-invisible |
| OrderRouter.js:525 | cancelOrder outcome unknown/ambiguous | order-lifecycle | y\* | **PROMOTE** | cancel truth unknown, phone-invisible |
| OrderRouter.js:541 | cancelAllOpenOrders could not read open orders | order-lifecycle | y\* | **PROMOTE** | pre-sweep truth unavailable, phone-invisible |
| OrderRouter.js:556 | getAllBalances failed for adapter | data-integrity | y\* | **PROMOTE** | balance truth unavailable, phone-invisible |
| EnhancedPatternRecognition.js:429 | feature build failed from market data | feed-death | y | LOG-ONLY | fails safe, already traced |
| EnhancedPatternRecognition.js:536, 537, 538 (companions), 544 | recordPatternResult input malformed/empty | data-integrity | n | LOG-ONLY | learning feedback only |

### Misc core B (TradeReplayCapture, Telemetry, PerformanceDashboardIntegration, MultiAssetManager, ModuleAutoLoader, MessageQueue, TimeFrameManager, PositionSizer, PnLTracker, FeatureExtractor, DrawdownTracker, DecisionAutopsyLogger, DecisionLedgerLogger) — 39 sites

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| TradeReplayCapture.js:62, 170, 179, 233, 253, 284, 288 (4 SWALLOWED) | replay-card build/write/read failures | housekeeping | n | LOG-ONLY | visual diagnostic artifact, not ledger |
| Telemetry.js:67, 168, 184 | telemetry append/snapshot/parse failures | housekeeping | n | LOG-ONLY | rebuildable diagnostics |
| PerformanceDashboardIntegration.js:76, 126, 151 | dashboard metrics failures | housekeeping | n | LOG-ONLY | display pipeline |
| MultiAssetManager.js:166, 171, 192, 247 [SWALLOWED] | switch-asset guards / WS notify | mixed | n | LOG-ONLY | dead/disabled runtime-switch path (SessionRouter owns transitions) |
| ModuleAutoLoader.js:143, 180, 195 | module directory/require failures | housekeeping | n | LOG-ONLY | startup bootstrap |
| MessageQueue.js:48, 69, 86 | queue drop/age-out/processing error | feed-death | n | LOG-ONLY | backpressure by design |
| TimeFrameManager.js:218, 252 | bad timeframe key / invalid candle | mixed | n | LOG-ONLY | registration guard / explicit failure result |
| PositionSizer.js:57 | calculate() got non-positive/undefined balance | position-state | n | **PROMOTE** | corrupt balance reaching live sizing math |
| PositionSizer.js:62 | calculate() got non-positive/undefined price | feed-death | n | LOG-ONLY | protective zero-size result |
| PnLTracker.js:10 | initialize refused invalid starting balance | position-state | n | **PROMOTE** | P&L/drawdown baseline feeding RiskManager never set |
| PnLTracker.js:23 | recordTrade dropped non-finite P&L | position-state | n | **PROMOTE** | real outcome excluded from realized P&L history |
| FeatureExtractor.js:45 | feature vector not computable | data-integrity | y | LOG-ONLY | already traced |
| FeatureExtractor.js:304 | computeSignature got malformed array | data-integrity | n | LOG-ONLY | pattern lookup only |
| DrawdownTracker.js:10 | initialize refused invalid starting balance | risk-guard | n | **PROMOTE** | drawdown-halt baseline never set, kill-switch silently defeated |
| DrawdownTracker.js:21 | recordConfirmedPnl ignored non-finite P&L | risk-guard | n | **PROMOTE** | understated drawdown risks a missed HALT |
| DecisionAutopsyLogger.js:51 | primary autopsy write failed | data-integrity | n | LOG-ONLY | fallback attempted next |
| DecisionAutopsyLogger.js:60 | fallback autopsy write ALSO failed | data-integrity | n | **PROMOTE** | decision-trail record lost on both paths |
| DecisionLedgerLogger.js:45 | writeOnClose failed schema validation, diverted | data-integrity | n | **PROMOTE** | completed trade's entry never reaches main journal |
| DecisionLedgerLogger.js:56 | schema validation itself threw, diverted | data-integrity | n | **PROMOTE** | same journal loss |
| DecisionLedgerLogger.js:120 | buffered flush failed | data-integrity | n | LOG-ONLY | buffered mode is backtest-only |
| DecisionLedgerLogger.js:129 | _appendLine write failed | data-integrity | n | **PROMOTE** | shared path backs live immediate-write journal |

### Misc core C (IndicatorEngine, IndicatorSnapshotDTO, RiskManager, PnLCalculator, PipelineSnapshot, PerformanceValidator, OptimizedIndicators, MarketRegimeDetector, FeatureFlagManager, ExitContractManager, DynamicPositionSizer, ContractValidator, AuthFailureGuard, AssetConfigManager, TradeNarrator, RuntimeAuditSink, CryptoMarketFeed, WhaleFilings, NewsSearchProvider) — 55 sites

| site | fires when | class | trace | proposal | why |
|---|---|---|---|---|---|
| indicators/IndicatorEngine.js:31 | TPO module require failed, disabled for session | housekeeping | n | LOG-ONLY | init noise, graceful degrade |
| dto/IndicatorSnapshotDTO.js:81 | snapshot fails zod validation, null returned | data-integrity | n | LOG-ONLY | zero callers |
| RiskManager.js:250 | _triggerAlert: reconciliation delta or rail-buffer order block | risk-guard | n | **PROMOTE** | exactly the RECONCILIATION/ORDER_BLOCKED classes ntfy keys on, never reach the bus |
| PnLCalculator.js:51 | invalid/zero entry price → returns 0% P&L | position-state | n | **PROMOTE** | masks corrupt entry price as real 0%, feeds exit/risk decisions |
| PipelineSnapshot.js:91, 173, 192, 234, 261, 274, 286, 297, 310, 352, 365, 380, 400, 434 (12 SWALLOWED) | diagnostic snapshot builder failures | housekeeping | n | LOG-ONLY | read-only diagnostic mirror |
| PerformanceValidator.js:197 | strategy component auto-disabled below threshold | risk-guard | n | **PROMOTE** | live behavior mutation with no durable record a component went dark |
| OptimizedIndicators.js:200 | indicator calc threw/non-finite, marked unavailable | data-integrity | y | LOG-ONLY | INDICATORS_UNAVAILABLE trace fires; console is duplicate |
| MarketRegimeDetector.js:687 | restart() threw resetting state | data-integrity | n | LOG-ONLY | rethrown, rare admin path |
| FeatureFlagManager.js:117 | features.json unreadable, flags default {} | housekeeping | n | LOG-ONLY | fails safe to all-off |
| ExitContractManager.js:65 | trade direction missing/invalid, exit math refused (6 call sites) | position-state | n | **PROMOTE** | live open position's exit management refused mid-flight, unmanaged-trade risk |
| DynamicPositionSizer.js:280 | narrator sizing hook threw post-compute | housekeeping | n | LOG-ONLY | cosmetic post-hoc |
| ContractValidator.js:337 | contract assertion failed in non-strict mode, execution continues | data-integrity | n | **PROMOTE** | invalid data keeps flowing through module boundaries feeding live decisions |
| AuthFailureGuard.js:105 | broker auth failure recorded; threshold engages global KillSwitch | broker-reject | n | **PROMOTE** | KILL-class escalation with zero bus visibility |
| AssetConfigManager.js:366 | unrecognized asset type silently gets crypto config | data-integrity | n | **PROMOTE** | wrong asset class's risk/sizing/stops active with no signal |
| TradeNarrator.js:350, 405, 457, 514, 599, 651, 732, 771, 805, 830, 872 (all SWALLOWED) | narration format/emit throws | housekeeping | n | LOG-ONLY | documented pure-cosmetic sink, must never throw |
| RuntimeAuditSink.js:26, 39 [SWALLOWED] | timestamp/stringify fallbacks in fatal-audit writer | housekeeping | n | LOG-ONLY | trivial serialization guards |
| RuntimeAuditSink.js:202 [SWALLOWED] | stderr fallback ALSO failed after primary fatal-journal write failed | data-integrity | n | **PROMOTE** | total silent loss of fatal-event truth trail; bus is the last independent channel |
| CryptoMarketFeed.js:216, 253, 271, 281, 282, 293, 303 (3 SWALLOWED) | dashboard-only Kraken public feed failures | feed-death | n | LOG-ONLY | explicitly dashboard-only relay, self-healing reconnect |
| WhaleFilings.js:155, 240, 259 [all SWALLOWED] | ARK/13F fetch-parse failures | feed-death | n | LOG-ONLY | read-only dashboard garnish, skip-on-failure by design |
| NewsSearchProvider.js:443, 552 [SWALLOWED] | EDGAR/whale enrichment legs fail | data-integrity | n | LOG-ONLY | documented additive decoration |

---

## Inheritance notes surfaced during census (list only — NOT fixed, NOT in scope)

- `OrderExecutor.js:3831` dead code guarded by `if (false && …)`.
- `TradeIntelligenceEngine.evaluate()` and its 'evaluation' event have zero callers/listeners — 15 catch sites in dead advisory code.
- `StateManager.js:3936` `isInSync()` has no call sites.
- `core/ErrorHandler.js` module is entirely dead (no callers).
- `SingletonLock.js:188` monitor-loop catch does not exit while its siblings (178/184) do — asymmetric fail-safe.
- `CandleStore.js:344` swallowed read makes a save merge destructive across symbols.
- `tradeLogger.js:133` corrupt-read + save sequence is journal-destructive.
- Notifier keyword gap: `*_UNAVAILABLE` event family (Alpaca funnel, OrderRouter) reaches the bus but matches no notifier tier — census proposes additive keyword-visible emissions at those sites; expanding the notifier itself is out of territory and NOT proposed.

## HOLD

Phase 1 complete. Awaiting Trey's row rulings. No emission changes made. Phase 2 executes only rows ruled PROMOTE, additive-only, one logical class per commit, with forced-failure runtime receipts and full adversarial layer per commit.
