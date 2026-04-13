# OGZPrime Apex Readiness Audit
**Date:** 2026-04-12
**Purpose:** Apex evaluation deployment readiness — single-account reliability, risk, durability
**Tool:** Mercury-2 RAG

---

## SECTION 1 — SINGLE-ACCOUNT EXECUTION RELIABILITY

### Q1: In the full trading loop from market data ingestion to order placement, are there any unhandled promise rejections or async operations without error handling that could crash the loop?

**Yes – there is at least one async operation in the trading loop that lacks explicit error handling and could surface an unhandled promise rejection.**

| Location | Issue | Evidence |
|----------|-------|----------|
| `core/CandleProcessor.js` – `startBackfillRetry` | The `setInterval` callback is `async` and calls `await this.attemptBackfill(...)` without a surrounding `try/catch`. If `attemptBackfill` rejects, the rejection bubbles out of the interval handler and becomes unhandled. | 【3†L23-L38】 |
| `run-empire-v2.js` – global handlers | The process does install a handler for `unhandledRejection`, but it only logs the reason and *does not* shut down the bot. This means a rejection that reaches the global handler will not crash the process, but the lack of a shutdown may leave the bot in an inconsistent state. | 【1†L13-L20】 |

**Other async sections (e.g., `EventLoopMonitor.handleCriticalLag`) already wrap their async calls in `try/catch` and therefore do not pose this risk.** 【2†L13-L22】.**Conclusion:** The back‑fill retry loop is the primary spot where an async operation can reject without being caught, potentially crashing the trading loop. No other unhandled async spots are evident in the provided snippets.

---

### Q2: What happens in TradingLoop when the broker WebSocket disconnects mid-cycle? Does the loop recover automatically or hang?

not in retrieved context.

---

### Q3: What happens in OrderExecutor when an order placement API call times out? Does the order state get reconciled correctly?

not in retrieved context.

---

### Q4: Are there any process.exit() calls in the core trading path? List each one and its trigger condition

not in retrieved context

---

### Q5: Does the bot handle SIGINT and SIGTERM cleanly — flush state, close positions, disconnect broker, exit without corrupting state files?

not in retrieved context.

---

## SECTION 2 — STATE PERSISTENCE AND RECOVERY

### Q6: How does StateManager persist state between bot runs? File location, format, write frequency, crash-safety

**StateManager persistence**

- **File location** – `state.json` under the data directory (default `<project>/data/state.json`; configurable via `paths.dataDir` / `paths.stateFile`).  
  *Citation*: `core/StateManager.js:826-857` (determines `dataDir` and `stateFile`); `core/StateManager.js:862-918` (same logic for loading).

- **File format** – JSON. The `activeTrades` Map is converted to an array of `[key,value]` pairs before `JSON.stringify` and reconverted to a `Map` after `JSON.parse`.  
  *Citation*: `core/StateManager.js:826-857` (Map → Array conversion); `core/StateManager.js:862-918` (Array → Map restoration).

- **Write frequency** – StateManager is saved **after every state update** (auto‑save).  
  *Citation*: `CHANGELOG.md:3868-3873` (“Auto‑saves after every state update”).

- **Crash‑safety / recovery** – -  * On startup, `load()` reads the JSON file, restores the Map, and merges it into `this.state`.  
  * Errors are caught; if loading fails, `this.state.activeTrades` is re‑initialized to an empty `Map`.  
  * In back‑test mode, loading/saving is skipped to avoid corrupting real state.  
  *Citation*: `core/StateManager.js:862-918` (try/catch, Map restoration, back‑test guard); `core/StateManager.js:826-857` (try/catch, back‑test guard).  

Thus, StateManager persists the bot’s state in a JSON file (`data/state.json` by default), serializing Maps as arrays, writing after each state change, and safely re‑loading (or re‑initializing) on restart.

---

### Q7: If the bot crashes during an open position, does it recover the position from broker state plus local state on restart?

The bot does **not** guarantee a correct recovery of an open position after a crash.  

* If the process dies after `StateManager.reducePosition` but before `MPM.commit()`, the broker may hold only part of the asset while the local `StateManager` loads only that same partial amount, leaving the high‑water‑mark out of sync (the broker holds 50 % of the asset, the local state loads 50 % of the asset, but MaxProfitManager rehydrates 100 % of the asset)【1:1-1150】.  
* The specification explicitly calls the crash‑recovery design “critical” and notes that there is **no restart reconciliation protocol** defined for the divergence window between `reducePosition` and `commit()`【2:1-1150】.  
* A later fix (CHANGELOG entry) added a persistence guard that prevents the bot from wiping its state on restart, allowing trades and balances to persist, but it does not address the broker‑state vs. local‑state divergence issue【8:3868-3873】.  

Therefore, on restart the bot reloads its local state, but without a defined reconciliation step it may be out of sync with the broker’s actual position.

---

### Q8: Is there any in-memory state in the trading path that is not persisted to disk?

Yes. The current design has a window where execution‑side state is held only in memory and not durably written: after `StateManager.reducePosition` runs but before `MPM.commit()` completes, the position reduction lives only in‑memory, creating a divergence risk if a crash occurs. 【ogz-meta/todocontext47.

---

### Q9: Are balance and positions reconciled against the broker on startup, or does the bot trust its local state file only?

The bot does **not** rely only on its local state file at startup – it performs a startup reconciliation with the broker (exchange) and blocks trading until that sync completes, making the exchange the truth source before any trades begin.  

- **Exchange Reconciliation System** – “Startup Reconciliation: Blocks trading until initial sync completes – Ensures state matches exchange before any trades”【CHANGELOG.md:3401-3428】.  
- Integration points in `run-empire-v2.js` (lines 311‑317) show the reconciler is initialized during startup【CHANGELOG.md:3401-3428】.

---

## SECTION 3 — ALPACA ADAPTER DEPTH

### Q10: Does AlpacaAdapter handle Alpaca order status lifecycle — new, accepted, filled, partially_filled, canceled, rejected, expired? Are all states mapped?

**Answer:**  
AlpacaAdapter does not explicitly map the full Alpaca order‑status lifecycle. It simply returns the raw `status` field from Alpaca’s API responses without converting it to internal constants for each state (new, accepted, filled, partially_filled, canceled, rejected, expired).

**Evidence**

- `getOpenOrders` builds each order object with `status: order.status` directly from the API response【3:134-152】.  
- `getOrderStatus` returns `status: response.data.status` unchanged from the API response【4:241-255】.  

No code in the retrieved context translates these raw strings into a comprehensive set of internal status values, so the adapter does not provide a complete mapping for all lifecycle states.

---

### Q11: What does AlpacaAdapter do when Alpaca returns a 429 rate limit response?

not in retrieved context.

---

### Q12: Does isTradeableNow() correctly block trades outside regular trading hours for stocks?

**Answer**

- **TastyworksAdapter** – blocks weekends and any time before 9:30 or after 16:00 (local time) → `return time >= 930 && time < 1600;`【1:441-451】.  
- **InteractiveBrokersAdapter** – same logic as Tastyworks (local time) → `return time >= 930 && time < 1600;`【2:425-436】.  
- **AlpacaAdapter** – converts current time to Eastern Time, then blocks weekends and times outside 9:30‑16:00 ET → `return decimalTime >= 9.5 && decimalTime < 16;`【6:447-460】.  
- **SchwabAdapter** – delegates to a market calendar that knows holidays and sessions → `return calendar.isOpen(new Date(), session);`【4:497-501】.  

**Conclusion**  
All four stock‑related adapters block trades outside regular US market hours, but Tastyworks and InteractiveBrokers use the local system time (which may not be ET) and thus could be inaccurate for users outside the Eastern Time zone. Alpaca and Schwab correctly handle the Eastern Time zone (Alpaca) or use a full calendar (Schwab).

---

## SECTION 4 — RISK MANAGEMENT AND DRAWDOWN

### Q13: Where is max account drawdown enforced? Is there a hard circuit breaker that halts trading before a configurable drawdown limit?

**Enforcement location**

- **RiskManager.isTradingAllowed()** checks the draw‑down tracker and blocks new trades when the max draw‑down is exceeded.  
  `core/RiskManager.js:157-168`

- **StopLossChecker** contains the draw‑down circuit‑breaker logic that computes `accountDrawdown` from `context.accountBalance` and `context.initialBalance`.  
  `ogz-meta/todocontext47.md:49-52`

**Configuration**

- The max draw‑down limit is read from the environment (`MAX_DRAWDOWN = 18%`).  
  `ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md:44-49`

- The draw‑down circuit breaker can be disabled with the env var `ACCOUNT_DRAWDOWN_BYPASS` (handled in `StopLossChecker.js`).  
  `ogz-meta/ENV-VAR-AUDIT.md:44-61`

**Hard circuit‑breaker**

- The system includes a “DD Circuit Breaker” exit type that triggers when the max draw‑down is hit.  
  `ogz-meta/BACKTEST-PIPELINE-AUDIT.md:325-332`

- However, a bug notes that the exit‑contract manager never checks the hard stop‑loss percent, meaning the circuit breaker is **currently disabled** unless the above checks are active.  
  `ogz-meta/ledger/mercury-2-audit-2026-03-13.md:121-141`

**Conclusion**

- Max account draw‑down is enforced via `RiskManager.isTradingAllowed()` (which calls `drawdownTracker.isMaxDrawdownExceeded()`) and the `StopLossChecker` draw‑down logic.  
- A hard circuit breaker exists conceptually (DD Circuit Breaker) and is configurable via `MAX_DRAWDOWN`, but it can be bypassed with `ACCOUNT_DRAWDOWN_BYPASS` and is currently missing in `ExitContractManager.js`.

---

### Q14: What happens if StateManager reports a drawdown exceeding the configured threshold? Does the bot stop trading or just warn?

**Effect:**  
- The bot **stops trading** when the drawdown exceeds the configured maximum.  

**Why:**  
- `DrawdownTracker.isMaxDrawdownExceeded()` returns `true` once `state.currentDrawdown >= config.maxDrawdownPercent`【core/DrawdownTracker.js:149-151】.  
- `RiskManager.isTradingAllowed()` checks that method and, if true, returns `{ allowed: false, reason: 'Max drawdown exceeded' }`, which prevents any further trade execution【core/RiskManager.js:157-168】.  

**Additional behavior:**  
- The same condition also triggers a **CRITICAL alert** in `TRAI.proactiveMonitoring()` (when `state.currentDrawdown < -0.15`)【core/trai_core.js:858-884】, but the primary action is to block trading.

---

### Q15: Is daily loss limit enforced separately from total drawdown limit?

Yes. The platform checks the daily loss limit and the total drawdown limit as independent conditions.  

- `isTradingAllowed()` first tests the drawdown (`this.drawdownTracker.isMaxDrawdownExceeded()`) and then checks the loss‑limit breaches (`breaches.daily`, `breaches.weekly`, `breaches.monthly`) separately【core/RiskManager.js:157-168】.  
- `assessTradeRisk()` also evaluates the drawdown limit first and only afterward returns a daily‑loss breach (`breaches.daily`) as a distinct block【core/RiskManager.js:86-151】.  

Thus the daily loss limit is enforced independently of the overall drawdown limit.

---

### Q16: Is there logic for trailing drawdown where the high-water-mark moves up and the drawdown line chases it?

Yes. The platform includes a trailing‑drawdown implementation that keeps a moving high‑water‑mark (peak equity) and computes the drawdown relative to that peak.

- **core/PerformanceVisualizer.js** – `calculateDrawdown()` iterates over equity points, updates `peak` whenever a higher balance is seen, and then calculates `currentDrawdown` as the percentage drop from that peak. This is exactly a trailing drawdown where the drawdown line “chases” the moving high‑water‑mark.  

  `core/PerformanceVisualizer.

---

## SECTION 5 — STRATEGY STACK VALIDATION

### Q17: Which strategies in the StrategyOrchestrator have validated exit contracts in TradingConfig?

**Strategies with validated (locked) exit contracts in `TradingConfig`**

- EMASMACrossover  
- MADynamicSR  
- RSI  
- OGZTPO  
- MultiTimeframe  
- LiquiditySweep  

**Evidence**  
- The “ACTUAL LOCKED VALUES from TradingConfig.js” list shows each of these strategies with locked `stopLossPercent` and `takeProfitPercent` values【ogz-meta/BACKTEST-PIPELINE-AUDIT.md:333-346】.  
- The `exitContracts` block in the Phase‑H4 lock step also contains entries for these strategies, confirming they are hard‑coded and validated【ogz-meta/METHODOLOGY-VALIDATION-PIPELINE.md:70-102】.

---

### Q18: Is there a way to restrict the orchestrator to only run a curated subset of strategies via SOLO_STRATEGY env var?

Yes. The orchestrator can be limited to a curated list of strategies by setting the **`SOLO_STRATEGY`** environment variable to a comma‑separated list of strategy names (e.g., `SOLO_STRATEGY=RSI,EMASMACrossover`).  

- In the orchestrator constructor the variable is read and parsed into `this.soloStrategies` — if set, only those strategies are allowed to fire [core/StrategyOrchestrator.js:46‑57]【1†L46-L57】.  
- The docs describe the mode and its usage: “SOLO_STRATEGY=RSI # Single strategy” and “SOLO_STRATEGY=RSI,EMASMACrossover # Comma‑separated for combos” [BACKTESTING-OPS.md:45‑57]【3†L45-L57】.  
- Additional clarification notes that the orchestrator evaluates only the named strategies when `SOLO_STRATEGY` is present [BACKTESTING‑GUIDE.md:23‑38]【4†L23-L38】.  

Thus, by defining `SOLO_STRATEGY` you restrict the orchestrator to the specified subset.

---

### Q19: Do validated exit contracts persist across restarts without drift?

**Answer:** Yes. Validated exit contracts are sealed into each trade at creation (deep‑cloned from `TradingConfig`) and, because trades are serialized and re‑loaded on restart, those contracts remain unchanged—no drift occurs.

**Evidence**

- The trade model stores a **sealed exit environment** that is a deep clone of the config at birth, and “Env var changes mid‑run do NOT affect in‑flight trades.” 【8:1‑1150】  
- The platform’s state‑persistence fix ensures “Trades … now persist through restarts.” 【7:3868‑3873】  

Together, these indicate that once an exit contract is validated and attached to a trade, it is retained exactly across process restarts.

---

## SECTION 6 — BACKTEST FRAMEWORK HONESTY

### Q20: Does the backtest engine use the same code path as live trading for strategy evaluation and exit contract resolution?

Yes. The backtest engine runs the identical pipeline as live trading – it calls `handleMarketData()`, then `analyzeAndTrade()`, which invokes `StrategyOrchestrator.evaluate()` for strategy scoring and uses the same exit‑management components (`StopLossChecker / TrailingStop`). The only difference is that `EXECUTION_MODE=backtest` disables broker connections and reads candles from a file, but all other logic is unchanged【1:9‑28】. This is reinforced by the design statement that “Backtests and live trading must use identical code paths with only the execution layer swapped”【5:23‑46】.

---

### Q21: Does the backtester simulate fees and slippage correctly for stock trading?

**Answer**

- **Slippage** – The backtester applies a slippage factor when simulating fills in back‑test/paper mode.  
  - `slippagePercent = TradingConfig.get('fees.slippage') || 0.0005;  // 0.05% default` (core/OrderExecutor.js : 57‑58)【5】  

- **Fees** – The fee model used by the back‑tester does **not** match the full round‑trip cost for stocks.  
  - The verification output states the overall “Fees/slippage: 0.5 % per trade”【2】.  
  - StateManager (the source of truth for live P&L) uses a 0.65 % round‑trip (0.25 % entry + 0.40 % exit)【2】.  
  - BacktestRecorder, which only drives the summary print‑out, calculates fees as `entryFee = entryValue * this.feePerSide; exitFee = exitValue * this.feePerSide; totalFees = entryFee + exitFee;` (both sides use the same `feePerSide`)【8】, resulting in a 0.50 % round‑trip (0.25 % × 2)【2】.  

**Conclusion**  
The back‑tester correctly simulates slippage, but its fee simulation is simplified—using only the maker fee for both entry and exit—so it under‑estimates the true stock‑trading round‑trip cost (0.50 % vs. the actual 0.65 %).

---

### Q22: Is the per-trade equity accounting from the March 28 refactor propagated through both backtest and live code paths?

**Answer:** No. The March 28 per‑trade‑equity refactor was not fully propagated to both backtest and live code paths.  

- The refactor made `closePosition()` leave `state.balance` unchanged (only `realizedPnL` updates), but the backtest summary still reads `stateManager.get('balance')`, which remains at the constant initial value (≈ $10 000). This yields two different “Final Balance” lines in backtest output【1:3‑9】.  
- The fix to use the proper equity getter (`stateManager.getEquity(price)`) was later added in `core/TradingLoop.js` to correct the backtest path, indicating the original propagation was missing【2:149‑150】.

---

## SECTION 7 — MULTI-WEEK OPERATIONAL DURABILITY

### Q23: Are there any unbounded data structures in the running bot that grow forever and could cause memory issues over weeks?

Yes. The TRAI process pool can grow without bound, leading to ever‑increasing memory usage over weeks.  

- **Evidence:** The changelog lists “TRAI process pool unbounded growth” as a identified bug【CHANGELOG.md:4643‑4656】.

---

### Q24: Does the bot log to disk with rotation or bounded log size?

The bot does **not** implement disk‑log rotation or a bounded file size.  

- It keeps a **bounded in‑memory transaction log**: when `this.transactionLog` exceeds `this.maxLogSize` the oldest entry is removed (`shift()`)【core/StateManager.js:951‑956】.  
- The only disk writes shown are a single metrics JSON file (`fs.writeFileSync(metricsFile, …)`) in `telemetry-report.js` and a pipeline‑snapshot JSONL file in `PipelineSnapshot.js`; neither includes rotation or size‑limiting logic.  

Thus, logging to disk is not rotated or size‑bounded in the provided code.

---

### Q25: Does the WebSocket reconnection logic have exponential backoff with a ceiling?

**Answer:** Yes. The WebSocket reconnection logic implements exponential back‑off and caps the delay.

**Evidence:**  
- In `kraken_adapter_simple.js` the reconnection delay is computed as  
  `delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);`  
  with `baseDelay = 5000` ms and `maxDelay = 300000` ms (5 minutes)【1:577-827】. This shows an exponential increase that is limited by a ceiling of 5 minutes.

---

### Q26: Is there a heartbeat or health check mechanism that alerts if the bot silently stops trading?

**Yes – the platform includes a “liveness watchdog” that acts as a heartbeat and raises an alert when the bot stops receiving market data.**  

- The watchdog is added in **`run-empire-v2.js`** (lines 978‑1006) and runs a periodic check every 60 seconds.  
- If **no market data has been received for 2 minutes**, it **pauses trading and logs a loud alert** (see the CHANGELOG entry).  
- This mechanism catches the case where the feed goes completely dark, preventing the bot from silently continuing without fresh data.  

*Source:* CHANGELOG.md 2516‑2532 describes the Liveness Watchdog implementation and its behavior.

---

## SECTION 8 — APEX-SPECIFIC RULES

### Q27: Does the bot enforce any consistency rule limiting single-day profit contribution percentage?

not in retrieved context.

---

### Q28: Does the bot respect prohibited strategy types like martingale or grid trading?

not in retrieved context.

---

### Q29: Is there a configuration surface for Apex parameters like daily loss limit, max drawdown, minimum trading days, and profit target?

**Answer:**  
- The platform does expose Apex‑related limits, but only through two places:  

  1. **Back‑test documentation** – the “APEX EVAL TARGETS” section lists the profit target, the maximum trailing drawdown, and notes that the daily loss limit varies by account.   
  2. **Risk‑management configuration** – the fingerprint registry defines hard‑coded defaults for “Max Drawdown” (18 %) and “Max Daily Loss” (10 %) that are read from the .env file.  

- There is **no explicit configuration entry** for “minimum trading days” in the retrieved material.  

**Evidence:**  

- `ogz-meta/BACKTEST-OPS.md:351-363` – shows profit ~15 %, max trailing drawdown < 5 %, daily loss limit varies.  
- `ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md:44-49` – shows Max Drawdown = 18 % and Max Daily Loss = 10 % (from .env).  

No other retrieved chunk mentions a “minimum trading days” setting.

---

## SECTION 9 — PATTERN MEMORY DURING EVAL

### Q30: Does pattern memory write to disk during live trading or only in-memory?

Pattern memory is persisted to disk for live (and paper) trading; it is not limited to in‑memory only.  

- The constructor sets `persistenceEnabled` to **true** for any mode that is not `backtest` (or when `backtestPersist` is explicitly enabled)【core/PatternMemoryBank.js:79-135】.  
- After each recorded trade, `recordTradeOutcome` calls `this.saveMemory();` which writes the updated memory to the file determined by the mode【core/PatternMemoryBank.js:231-359】.  

Thus, during live trading the pattern memory is saved to the corresponding file (e.g., `pattern_memory.live.json`). In backtest mode persistence is disabled by default unless overridden.

---

### Q31: Does logPatternResult currently capture realized R-multiple data?

**Answer:** No – `recordPatternResult` does not capture realized R‑multiple data. It only validates the features array, forwards the result to `memory.recordPattern`, increments a trade counter, and logs the recorded pattern’s **pnl** (or “?” if missing). There is no handling or storage of an R‑multiple field.

**Evidence**

- `recordPatternResult` (core/EnhancedPatternRecognition.js:439‑465) shows:
  - Validation of `featuresOrSignature`.
  - Call to `this.memory.recordPattern(featuresOrSignature, result);`.
  - Increment of `this.stats.tradeResults`.
  - Logging that includes only `pnl` (`✅ Pattern RECORDED: … pnl=${result?.pnl?.toFixed(2) || '?'}%`).
  - No reference to an R‑multiple value.

---

### Q32: Is pattern memory write safe under concurrent access?

**Answer:**  
Pattern memory writes are **not** protected against concurrent access. The `saveMemory` method simply performs a synchronous file write (`fs.writeFileSync`) after an optional backup, with no locking, queuing, or other concurrency safeguards.

**Evidence:**  
- `core/PatternMemoryBank.js:716‑738` shows `saveMemory` checks `persistenceEnabled`, creates a backup if the file exists, then writes the memory with `fs.writeFileSync` and logs the result—no concurrency control is implemented.  

Therefore, concurrent invocations could overwrite each other’s data.

---

## SECTION 10 — CLONEABILITY

### Q33: List every singleton or process-global state in the codebase that would collide if two bot instances ran simultaneously

**Singleton / process‑global state that would collide with two bot instances**

| Item | Why it collides | Location |
|------|-----------------|----------|
| **Lock file** (`.<botName>.lock`) – created by `SingletonLock` and placed in `process.env.DATA_DIR` or the current working directory. Two instances would try to create/write the same lock file, causing a conflict. | `core/SingletonLock.js:10‑19` |
| **State file** (`data/state.json`) – the default file used by `StateManager` (via `STATE_FILE` env var) and read by `collectBotState`. Simultaneous instances would read/write the same production state file. | `ogz-meta/ledger/claude-code-alignment-march12.md:60‑75` (mentions `StateManager` defaults to `data/state.json`) and `ogz-meta/ogz-run.js:65‑108` (reads `data/state.json`) |
| **Environment variable `STATE_FILE`** – used to point to the state file; if not overridden per instance, both processes will reference the same file. | `ogz-meta/ledger/claude-code-alignment-march12.md:60‑75` (shows `process.env.STATE_FILE` being set for backtest isolation) |

These three globals (lock file, state file, and the `STATE_FILE` env var) are the only process‑wide resources identified in the retrieved context that would cause a collision when two bot instances run at the same time.

---

### Q34: Are there hardcoded file paths that would prevent running two instances on the same machine?

No – the retrieved code does not contain any hard‑coded absolute file paths that would block running multiple instances. The only path definitions are built dynamically in `core/ModuleAutoLoader.js` using `this.basePath` (e.g., `path.join(this.basePath, 'core')`, etc.)【3:89-128】. The audit notes hard‑coded values, but does not list any hard‑coded file paths【7:62-65】.

---


## AUDIT COMPLETE

**Total questions:** 34
**Generated:** 2026-04-12T13:40:32.063Z
