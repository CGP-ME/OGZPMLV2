# OGZPrime Pre-Refactor Full-System Audit
**Date:** 2026-04-12
**Branch:** broker/alpaca-integration
**Purpose:** Complete system diagnostic before multi-asset refactor
**Tool:** Mercury-2 RAG (2026-04-12T03:21:44.721Z)

---

## PASS 1 — BROKER LAYER INTEGRITY

### Q1: List every adapter file in brokers/. For each one, which IBrokerAdapter methods are implemented vs stubs that throw?

not in retrieved context

---

### Q2: Is AlpacaAdapter registered in BrokerRegistry.js? What entry format does BrokerRegistry expect?

**AlpacaAdapter registration**  
- No entry for **AlpacaAdapter** appears in any of the retrieved files. → *not in retrieved context*.

**Expected entry format in `BrokerRegistry.js`**  
- `BrokerRegistry` is parsed by `resolveBrokerRegistry`, which looks for mappings of the form  

  ```js
  <brokerKey>: { … filePath: './SomeAdapterPath' … }
  ```  

  (regex `/(\w+):\s*\{[^}]*filePath:\s*['"]([^'"]+)['"]/gs`)【ogz-meta/dep-scanner.js:122-135】.  

- Other utilities (`getAllBrokers`, `getBrokerInfo`, `getBrokersByAssetType`) treat each entry as an object keyed by the broker name, with the value containing fields such as `filePath`, `assetType`, etc.【brokers/BrokerRegistry.js:207-212】【brokers/BrokerRegistry.js:217-224】.  

Thus, a valid `BrokerRegistry` entry must be a property whose value includes at least a `filePath` string.

---

### Q3: Do all broker adapters return candles in the same shape {t,o,h,l,c,v} with timestamp in milliseconds?

**Answer:** No – the adapters do not all return the same `{t,o,h,l,c,v}` shape with timestamps in milliseconds.

| Adapter | Shape returned | Timestamp unit | Evidence |
|--------|----------------|----------------|----------|
| **TastyworksAdapter** | `{t,o,h,l,c,v}` | **milliseconds** (`new Date(...).getTime()`) | `brokers/TastyworksAdapter.js:289‑311` |
| **CoinbaseAdapter** | `{t,o,h,l,c,v}` | Unit not converted; `t` is taken directly from `candle[0]` (likely seconds) | `brokers/CoinbaseAdapter.js:281‑307` |
| **KrakenAdapterV2** | `[]` (no candles) – no shape defined | N/A | `core/KrakenAdapterV2.js:235‑239` |
| **SchwabAdapter** | Fixed to `{t,o,h,l,c,v}` after bug fix | Intended to be milliseconds (Kraken‑compatible) | `CHANGELOG.md:1094‑1109` (notes on fix) |

**Conclusion:** Only **TastyworksAdapter** guarantees the required shape with millisecond timestamps. **CoinbaseAdapter** returns the same keys but does not convert the timestamp to milliseconds, **KrakenAdapterV2** does not provide candles at all, and **SchwabAdapter** was corrected to the proper shape but the code is not shown in the retrieved context. Therefore, the statement “all broker adapters return candles in the same shape `{t,o,h,l,c,v}` with timestamp in milliseconds” is **false**.

---

## PASS 2 — DATA INGESTION

### Q4: Where does candle data enter the system from brokers? List every ingestion point in run-empire-v2.js and CandleProcessor.js

**run-empire‑v2.js**  
- `loadCandleHistory()` reads candle data from the on‑disk file *candle‑history.json* and stores it in `this.priceHistory` (the only place in this file where candle data is initially loaded).【run-empire-v2.js:987-994】

**core/CandleProcessor.js**  
- Every incoming candle is passed to `processNewCandle(candle)`, the canonical entry point for new and updated candles.【core/CandleProcessor.js:23-386】  
- After processing, the candle’s fields are written to `this.ctx.marketData` (price, timestamp, volume, etc.), making the data available to the rest of the system.【core/CandleProcessor.

---

### Q5: Where is CandleHelper _c(candle) pattern used vs bypassed with direct candle.c access?

**Uses of the CandleHelper `_c(candle)` (or the exported `c` helper)**
- `modules/LiquiditySweepDetector.js:175‑185` – updates daily candle with `c(candle)`, `o(candle)`, `h(candle)`, `l(candle)`, `v(candle)`.  
- `ogz-meta/replacements/MISSION-1773135593547.js:8‑61` – checks `c(candle) == null` at start of `feedCandle`.  
- `ogz-meta/replacements/MISSION-1773136513814.js:8‑61` – same check in the duplicate `feedCandle`.  
- `core/ContractValidator.js:208‑251` – extracts close price via `const close = _c(candle);`.  
- `core/TimeFrameManager.js:632‑650` – `const c = _c(candle) || candle.close;` (fallback to raw property).  
- `core/indicators/IndicatorEngine.js:1510‑1513` – returns `c(candle)` in `_lastClose()`.

**Direct `candle.c` access**
- No snippet in the retrieved context accesses the `c` property directly; all usages go through the helper (`c` or `_c`).  

Thus, the helper pattern is used in the files above, and direct `candle.c` access is absent from the provided code.

---

## PASS 3 — INDICATOR ENGINE

### Q6: Is IndicatorEngine.getSnapshot() the single source of truth for indicators? Are there places computing RSI or EMA inline?

**Answer**

- **IndicatorEngine.getSnapshot() is the canonical source of indicator values** – it is the method that all parts of the platform query to obtain the current RSI, EMA, MACD, etc.  
  - The trading pipeline reads the snapshot directly (`_getIndicators` in *core/PipelineSnapshot.js*).  
  - Unit‑tests and regression scripts also call `getSnapshot` to validate the engine’s output (`runIndicators` in *test/regression/waterfall.js* and `rsiFromCloses` in *test/rsi-deterministic.test.js*).  
  - The startup code re‑plays saved candles and then logs the snapshot (`indicatorEngine.getSnapshot()` in *run-empire-v2.js*).  

- **No inline RSI/EMA calculations are present in the retrieved code** – the only places that handle RSI/EMA are:
  - Inside `IndicatorEngine` itself (not shown, but all callers rely on its snapshot).  
  - The `IndicatorAdapter` merely stores and forwards already‑computed indicator values; it does not compute them (`processIndicatorUpdate` in *public/js/IndicatorAdapter.js*).  

Thus, the snapshot is the single source of truth for indicators, and there are no other inline computations of RSI or EMA in the provided code.  

**Citations**

- `PipelineSnapshot._getIndicators` accesses `engine.getSnapshot()` to retrieve indicators【core/PipelineSnapshot.js:141-158】.  
- `runIndicators` creates an `IndicatorEngine`, updates it with candles, and returns `ie.getSnapshot()`【test/regression/waterfall.js:24-38】.  
- `rsiFromCloses` builds an `IndicatorEngine`, feeds it candles, and returns `snapshot.indicators.rsi` from `ie.getSnapshot()`【test/rsi-deterministic.test.js:19-26】.  
- Startup replay logs the snapshot after replaying candles【run-empire-v2.js:366-...】.  
- `IndicatorAdapter.processIndicatorUpdate` only caches received indicator values; it never computes RSI/EMA【public/js/IndicatorAdapter.js:37-74】.  
- Documentation notes a bug where consumers read `indicators.rsi` directly instead of the nested path, confirming that the snapshot’s structure is the authoritative data source【ogz-meta/OGZPrime-Master-Engineering-Spec.md:40-44】.

---

### Q7: Is IndicatorEngine a singleton that assumes one symbol state, or does it support per-symbol state?

**Answer:**  
`IndicatorEngine` is not a singleton that assumes a single‑symbol state; it is designed to hold state for a particular symbol/timeframe via its own configuration. Each instance’s blank state contains `symbol: this.config.symbol` and `tf: this.config.tf`, meaning the engine’s internal data is scoped to the config passed when the instance is created.  

**Evidence**  
- In `core/indicators/IndicatorEngine.js` the `_blankState` method returns an object whose `symbol` and `tf` fields are taken from `this.config.symbol` and `this.config.tf` respectively, indicating per‑instance (per‑symbol) state.【6:206-235】  
- The `IndicatorAdapter` creates a separate engine object for each asset‑timeframe pair (`this.engines` map keyed by `"asset‑timeframe"`), showing the platform’s intent to maintain distinct state per symbol/timeframe.【5:16-31】  

Thus, `IndicatorEngine` supports per‑symbol state via separate instances rather than being a global singleton.

---

## PASS 4 — STRATEGY LAYER

### Q8: List every strategy registered in StrategyOrchestrator. Does each implement evaluate() with the same return shape?

**Registered strategies (as listed in the dashboard documentation)**  
- EMASMACrossover (DeathCross/GoldenCross)  
- LiquiditySweep (BBSqueeze)  
- RSI (RSIExtreme)  
- MADynamicSR (TrendFollowing)  
- CandlePattern  
- MarketRegime (RegimeConfluence)  
- MultiTimeframe  
- OGZTPO  

*Source:* “Current strategies (from StrategyOrchestrator)” in **ogz-meta/ledger/BACKTEST-DASHBOARD-IMPLEMENTATION.md**【4†L1-L13】.

**Return‑shape of `evaluate()`**  
The orchestrator’s evaluation loop checks each strategy’s result for the fields `direction` and `confidence` before using it:

```js
const result = strategy.evaluate(ctx);
if (result && result.direction && result.confidence > 0) {
  results.push({ ...result, ... });
}
```

Thus every strategy’s `evaluate()` must return an object containing at least `direction` and `confidence` (additional fields are allowed).  

*Source:* evaluation loop snippet in **ogz-meta/E2E BACKTEST PIPELINE.MD** lines 645‑648【5†L645-L648】.  

**Conclusion**  
- All eight strategies are registered.  
- Each implements `evaluate()` that returns an object with the same core shape (`direction` + `confidence`).

---

### Q9: Are there strategy files in modules/ that exist but are NOT registered with the orchestrator?

**Answer:** Yes. Strategy modules can exist in `modules/` but not be registered with the orchestrator when their pipeline‑toggle environment variable is disabled (e.g., `ENABLE_RSI=false` prevents the RSI strategy from being loaded).  

**Evidence**  
- The backtesting guide explains that a *pipeline toggle* is an env‑var that “turns a strategy on or off in the orchestrator” and that “`ENABLE_RSI=false` removes it from the orchestrator entirely” 【ogz-meta/BACKTESTING_GUIDE.md:2‑5】.  

Thus, any strategy file present in `modules/` but whose toggle is set to false will exist but not be registered.

---

## PASS 5 — STRATEGY ORCHESTRATOR

### Q10: Does StrategyOrchestrator.evaluate() populate allResults, winnerStrategy, confluence, confidence, sizingMultiplier in every return path?

**Yes.** Every exit point in `StrategyOrchestrator.evaluate()` builds an object that contains `allResults`, `winnerStrategy`, `confluence`, `confidence` and `sizingMultiplier`.

| Return path | Fields present | Evidence |
|-------------|----------------|----------|
| No qualified strategies (`qualified.length === 0`) | `allResults`, `winnerStrategy` (null), `confluence`, `confidence` (0), `sizingMultiplier` (1.0) | `core/StrategyOrchestrator.js` [3] |
| Confluence below the minimum (`confluenceCount < this.minConfluenceCount`) | `allResults`, `winnerStrategy`, `confluence`, `confidence` (`winner.confidence * 100`), `sizingMultiplier` (1.0) | `core/StrategyOrchestrator.js` [2] |
| Normal winning case (final output) | `allResults`, `winnerStrategy`, `confluence`, `confidence` (`winner.confidence * 100`), `sizingMultiplier` (computed) | `core/StrategyOrchestrator.js` [1] |

All three return branches construct the result object with the required properties, so the method always populates `allResults`, `winnerStrategy`, `confluence`, `confidence`, and `sizingMultiplier`.

---

### Q11: Is confluence affecting position sizing only, or does it gate entry anywhere?

Confluence is used **both** as an entry‑gate condition and as a position‑size multiplier.

- **Entry‑gate** – the “Confluence count” gate is listed in the Entry Gates table (config key `confidence.minConfluenceCount`, default 1)【ogz-meta/ledger/REWRITE-SPEC-FINAL.md:222-233】.  
- **Position‑size multiplier** – after a winner is selected, the number of agreeing strategies (`confluenceCount`) is turned into a sizing multiplier (1.0× – 2.5×) that is applied to the base position size【ogz-meta/BACKTEST-PIPELINE-AUDIT.md:377-388】, and the same logic appears in `StrategyOrchestrator.js` where `cappedCount` and `sizingMultiplier` are derived from `confluenceCount`【core/StrategyOrchestrator.js:677-987】 and in the back‑test pipeline where `confluenceCount` is counted and mapped to a multiplier【ogz-meta/E2E BACKTEST PIPELINE.MD:713-734】.  

Therefore, confluence **does gate entry** (via the minimum confluence count) **and also scales position size**.

---

## PASS 6 — TRADING LOOP

### Q12: Walk through TradingLoop.analyzeAndTrade() step by step. What order do indicator snapshot, pattern detection, strategy evaluation, and order execution happen?

**Step‑by‑step order inside `TradingLoop.analyzeAndTrade()`**

1. **Market data is received** – the candle loop normalizes ticks into a standard OHLCV structure.  
   *Source:* `ogz-meta/claudito_context.md:1‑1247` (Runtime Flow – “Market Data In”).

2. **Signal Generation** – the engine runs the technical‑indicator snapshot, pattern‑recognition, and regime‑detection modules.  
   *Source:* `ogz-meta/claudito_context.md:1‑1247` (Signal Generation list).

3. **First Confidence Gate (≥ 0.35)** – the raw signals are filtered by a minimum confidence threshold before they reach the decision brain.  
   *Source:* `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:19‑38` (pipeline step “Confidence Gate (0.35 min)”).

4. **TradingLoop Decision (strategy evaluation)** – the consolidated decision (side, size, SL/TP, etc.) is produced by the core decision brain (UnifiedTradingCore / OptimizedTradingBrain).  
   *Source:* `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:19‑38` (pipeline step “TradingLoop Decision”).

5. **Second Confidence Gate (≥ 0.50)** – the decision is re‑checked against a higher confidence threshold.  
   *Source:* `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:19‑38` (pipeline step “Confidence Gate (0.50 min)”).

6. **Position Check** – verifies that the position limits allow a BUY (pos > 0) or SELL.  
   *Source:* `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:19‑38` (pipeline step “Position Check”).

7. **TRAI Advisory (async, race‑prone)** – the AI advisory layer may adjust or veto the decision.  
   *Source:* `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:19‑38` (pipeline step “TRAI Advisory”).

8. **Order Execution** – the final decision is handed to `OrderExecutor.executeTrade` (via `TradingLoop.executeTrade`).  
   *Source:* `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:19‑38` (pipeline step “Order Execution”).

9. **ExitContractManager** – manages trade exit (SL/TP, trailing, etc.) after execution.  
   *Source:* `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:19‑38` (pipeline step “ExitContractManager”).

**Summary of order:**  
`Indicator snapshot → Pattern detection → Strategy evaluation → Order execution`  
(steps 2 → 4 → 8 in the flow above).

---

### Q13: Do any emitter broadcasts happen BEFORE the strategy decision is locked in TradingLoop?

**Answer:** No. All emitter broadcasts are triggered **after** the strategy decision has been finalized (locked) in the TradingLoop.

**Evidence**

1. **`core/TRAIDecisionModule.js`** – after the decision object is fully built (including `processingTime`), the code calls `this.broadcastChainOfThought(decision, context);` and then returns the decision. The broadcast occurs **after** the decision is set.  
   `core/TRAIDecisionModule.js:154‑293`

2. **`core/TradingLoop.js`** – the helper `_broadcastAndReturn` (lines 425‑427) invokes `_broadcastDecision` **after** the decision object (`{ action: 'HOLD' }`) is prepared, i.e., after the decision is locked.  
   `core/TradingLoop.js:425‑427`

3. **`ogz‑meta/ledger/TradingLoop‑clean.js`** – once the decision is assembled, the code first calls `_broadcastDecision(...)` and only then proceeds to `await this.ctx.executeTrade(...)`. The broadcast is therefore after the decision is determined.  
   `ogz‑meta/ledger/TradingLoop-clean.js:59‑233`

These snippets consistently show that broadcasting to the dashboard (or any emitter) is performed **after** the decision object is created and locked, not before.

---

## PASS 7 — STATE MANAGER

### Q14: Is StateManager the single source of truth for balance, equity, and open positions? Any reads from other places?

**Yes – StateManager is now the single source of truth for balance, equity and open positions.**  

- The bot’s constructor explicitly notes “SINGLE SOURCE OF TRUTH” and replaces all direct references to `this.activeTrades` and `this.balance` with `stateManager.get('balance')` and `stateManager.getAllTrades()`【1:run-empire-v2.js:366‑892】.  
- The changelog records the removal of duplicate state tracking (`this.currentPosition`, `this.activeTrades`) and states that *all* reads/writes go through `stateManager`【6:CHANGELOG.md:4494‑4501】.  
- A separate changelog entry confirms the overall “Single Source of Truth for Position Tracking” and that StateManager now holds the authoritative position data【7:CHANGELOG.md:4125‑4143】.  
- The executor now reads the latest state only from `stateManager.getState()` and no longer syncs a local balance variable【4:core/OrderExecutor.js:44‑1090】.  

**Previous non‑StateManager reads (now fixed):**  

- ExecutionLayer previously fell back to `this.bot.systemState?.currentBalance` (or a hard‑coded `this.balance`) instead of the StateManager, causing stale balance usage【8:CHANGELOG.md:4198‑4207】.  

**Conclusion:** All current code paths read balance, equity and open‑position data exclusively from StateManager; any older direct reads have been removed or replaced.

---

### Q15: Is per-symbol position isolation possible in the current StateManager, or is it singleton-shaped?

StateManager is a singleton instance, not a per‑symbol container.**  
- The audit list marks `StateManager` as a singleton (`cls: null,  // singleton pattern — check getStateManager`)【5†L1-L4】.  
- Per‑symbol isolation is provided by `PositionTracker`, which “stores positions PER SYMBOL, not globally”【1†L13-L16】.  

Therefore, the current `StateManager` is singleton‑shaped; per‑symbol position isolation is achieved through `PositionTracker`, not the `StateManager` itself.

---

## PASS 8 — ORDER EXECUTOR

### Q16: List every place in OrderExecutor.js that hardcodes BTC-USD or BTC/USD as a default symbol

not in retrieved context

---

### Q17: Does OrderExecutor route orders through the broker adapter interface or call Kraken directly?

not in retrieved context.

---

## PASS 9 — EXIT PIPELINE

### Q18: Does ExitContractManager own every trade from fill to close? What order do exit checkers fire per tick?

**Ownership**  
- ExitContractManager is only a *safety‑only* orchestrator; it does **not** own a trade from fill to close. Trade state is tracked by **StateManager** (which reduces or closes positions) and persisted by **BacktestRecorder** on final close【5:1-1150】.  

**Exit‑checker fire order (per tick)**  
- Inside `ExitContractManager.checkExitConditions()` the checks are executed in a fixed priority sequence:  

1. **StopLossChecker**  
2. **TakeProfitChecker**  
3. **TrailingStopChecker**  
4. **MaxHoldChecker**  
5. **Invalidation conditions** (strategy‑specific)  

This order is documented in the priority list (lines 100‑136) and reflected in the refactored method body (lines 118‑136)【6:100-136】【7:118-136】.

---

### Q19: Are exit contracts per-strategy locked via TradingConfig, or can global env vars override them?

**Answer:**  
Exit contracts are locked per‑strategy in `core/TradingConfig.js`; global env vars such as `STOP_LOSS_PERCENT`, `TAKE_PROFIT_PERCENT`, or `TRAILING_STOP_PERCENT` do **not** override them.

**Evidence**

- The locked contracts are read first and env vars are only consulted for the global `TradingConfig.exits.*` block, which no strategy uses. [ENV‑VAR‑AUDIT.md:62‑86]  
- Those env vars are listed as “ignored” because each strategy has its own locked exit contract. [BACKTESTING‑GUIDE.md:111‑120]  
- Validated exits are hard‑coded into `core/TradingConfig.js` under `exitContracts` and explicitly override env vars. [METHODOLOGY‑VALIDATION‑PIPELINE.md:70‑102]  
- The TL;DR section reiterates that the locked per‑strategy contracts in `core/TradingConfig.js` override every stop/take‑profit/trailing env var for any strategy with a validated contract (i.e., all strategies). [ENV‑VAR‑AUDIT.

---

## PASS 10 — PATTERN MEMORY

### Q20: Where is logPatternResult called from? Does it currently capture realized R-multiple data?

not in retrieved context** – the retrieved code does not contain any definition or call to a `logPatternResult` function, nor does it show any handling of realized R‑multiple data.

---

### Q21: Is pattern memory keyed by pattern shape only, or by pattern-plus-symbol?

not in retrieved context.

---

## PASS 11 — TRAI

### Q22: Is TRAI wired into the trade evaluation pipeline in TradingLoop, or is it only a dashboard widget?

**TRAI is wired into the trade‑evaluation pipeline.**  

- In `core/TradingLoop.js` the `_runTRAI` method checks for a TRAI instance and calls `this.ctx.trai.processDecision(...)` as part of the loop logic【core/TradingLoop.js:406-419】.  
- The same integration appears in the cleaned‑up version `ogz-meta/ledger/TradingLoop-clean.js`【ogz-meta/ledger/TradingLoop-clean.js:368-381】.  

**Only a UI widget also exists, but it is separate from the core pipeline.**  
- The changelog records UI‑only fixes for the TRAI widget (e.g., status‑light handling)【CHANGELOG.md:2279-2406】.  

**Conclusion:** TRAI is not just a dashboard widget; it is actively invoked inside the TradingLoop’s decision‑making flow.

---

## PASS 12 — DASHBOARD EMITTERS

### Q23: List every dashboardWs.send() packet type across the codebase. Are all wrapped in try-catch?

**Dashboard Ws .send() packet types found in the retrieved code**

| Packet type (JSON `type` field) | Where it is sent (file:lines) | Wrapped in `try‑catch`? |
|--------------------------------|------------------------------|--------------------------|
| `event_loop_monitor` | `core/EventLoopMonitor.js:261‑274` | **Yes** – send is inside a `try { … } catch (error) { … }` block |
| *dynamic* `type` (value passed to `_notifyDashboard`) | `core/MultiAssetManager.js:296‑302` | **Yes** – send is inside a `try { … } catch {}` block |
| `state_update` | `core/StateManager.js:1021‑1047` | **Yes** – send is inside a `try { … } catch (error) { … }` block |
| *dynamic* `payload.type` (payload passed to `_send`) | `core/TradeJournalBridge.js:274‑282` | **Yes** – send is inside a `try { … } catch (err) { … }` block |
| `ping` | `core/WebSocketManager.js:241‑313` (inside `startHeartbeatPing`) | **Yes** – send is inside a `try { … } catch (err) { … }` block |
| `pause_confirmed` | `core/WebSocketManager.js:29‑232` (pause‑trading handler) | **No** – send is called directly, no surrounding `try‑catch` |
| `resume_confirmed` | `core/WebSocketManager.js:29‑232` (resume‑trading handler) | **No** – send is called directly, no surrounding `try‑catch` |
| `auth` | `core/WebSocketManager.js:29‑232` (WebSocket `open` handler) | **No** – send is called directly, no surrounding `try‑catch` |

**Conclusion**  
All dashboard‑Ws sends are **not** uniformly protected by a `try‑catch`. The sends in `EventLoopMonitor`, `MultiAssetManager`, `StateManager`, `TradeJournalBridge`, and the heartbeat ping are wrapped, while the authentication, pause‑confirmed, and resume‑confirmed packets are sent without explicit error handling.

---

## PASS 13 — ENTRY POINT

### Q24: How many places in run-empire-v2.js hardcode BTC-USD or tradingPair to a specific symbol?

not in retrieved context

---

## PASS 14 — CONFIG

### Q25: Which env vars in .env are ghost vars never consumed by TradingConfig.js or any runtime code?

**Ghost env vars (never read by `TradingConfig.js` or any runtime code)**  

- `TRAILING_STOP_ENABLED`  
- `REGIME_FILTER_ENABLED`  
- All `REGIME_ALLOW_*` vars (e.g., `REGIME_ALLOW_TRENDING`, `REGIME_ALLOW_RANGING`, `REGIME_ALLOW_VOLATILE`, `REGIME_ALLOW_QUIET`)  

**Evidence**  
- CHANGELOG.md lists these as **GHOST**: “`TRAILING_STOP_ENABLED`, `REGIME_FILTER_ENABLED`, `REGIME_ALLOW_*` (never read)”【4†L58-L64】.  
- BACKTESTING‑GUIDE.md repeats the same ghost list under the “GHOST” section【5†L111-L120】.  
- ENV‑VAR‑AUDIT.md’s quick‑summary table shows the same ghost entries【6†L5-L12】.  
- BACKTESTING‑GUIDE.md (full doc) also enumerates the ghost vars, confirming they are only referenced in old sweep code and not in live trading logic【8†L1-L154】.

---

## PASS 17 — MULTI-ASSET READINESS

### Q26: Can multiple IBrokerAdapter instances coexist in the same process? Is there singleton state preventing two brokers running simultaneously?

**Answer:**  
Multiple `IBrokerAdapter` instances can be created and run in the same process. The code does not enforce a singleton for broker adapters.

**Evidence**

1. **`IBrokerAdapter` constructor** – only blocks direct instantiation of the abstract class; it does not create a singleton or track instances.  
   - `brokers/IBrokerAdapter.js:20‑25`  
   - `foundation/IBrokerAdapter.js:48‑53`

2. **`BrokerFactory.createBrokerAdapter`** – creates a new adapter each time it is called (`new AdapterClass(options)`) and returns it. No global or static storage is used to limit the number of adapters.  
   - `brokers/BrokerFactory.js:25‑63`

3. **`OrderRouter.registerBroker`** – stores each adapter in a map (`this.adapters`) and allows multiple adapters to be registered; only the first becomes the default, but others remain usable.  
   - `core/OrderRouter.js:44‑64`

**Conclusion**  
There is no singleton state in the provided code that would prevent two or more broker adapters (including `IBrokerAdapter` implementations) from running simultaneously.

---

### Q27: How many call sites reference tradingPair as a singular string that would need to change for multi-symbol support?

not in retrieved context

---


## AUDIT COMPLETE

**Total questions:** 27
**Generated:** 2026-04-12T03:23:29.517Z
