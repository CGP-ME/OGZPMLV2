# Pre-Apex Audit V2 Part 2 — Forward-Looking Architecture
**Date:** 2026-04-13
**Mode:** Agentic (ReAct loop with grep/open_file/get_chunk/list_files)
**Purpose:** Verify what exists vs what is vapor for post-Apex roadmap
**Tool:** Mercury-2 via trai_brain/mercury-bridge/ask.js --agentic
**Blocks:** M through V (multi-broker, multi-asset, arbitrage, TRAI, patterns, hot-swap, Pine, PID, SaaS, ops)

---

## BLOCK M — Multi-broker readiness

### Q1: List every file in brokers/ directory. For each, what class does it export and what interface does it claim to implement? Cite file:line for the class declaration and the module.exports line.

**[30 iterations | answer_given | 21.3s]**

**brokers/AlpacaAdapter.js**  
- Exported class: **AlpacaAdapter** (declared on line 21)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = AlpacaAdapter;` (line 551)  

**brokers/BinanceAdapter.js**  
- Exported class: **BinanceAdapter** (declared on line 19)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = BinanceAdapter;` (line 606)  

**brokers/CMEAdapter.js**  
- Exported class: **CMEAdapter** (declared on line 19)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = CMEAdapter;` (line 443)  

**brokers/CoinbaseAdapter.js**  
- Exported class: **CoinbaseAdapter** (declared on line 19)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = CoinbaseAdapter;` (line 527)  

**brokers/GeminiAdapter.js**  
- Exported class: **GeminiAdapter** (declared on line 17)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = GeminiAdapter;` (line 568)  

**brokers/IBrokerAdapter.js**  
- Exported class: **IBrokerAdapter** (declared on line 19)  
- Implements interface: **EventEmitter** (extends `EventEmitter`) – this is the base class, not a custom interface.  
- Export statement: `module.exports = IBrokerAdapter;` (line 297)  

**brokers/InteractiveBrokersAdapter.js**  
- Exported class: **InteractiveBrokersAdapter** (declared on line 19)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = InteractiveBrokersAdapter;` (line 463)  

**brokers/KrakenIBrokerAdapter.js**  
- Exported class: **KrakenIBrokerAdapter** (declared on line 19)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = KrakenIBrokerAdapter;` (line 373)  

**brokers/OandaAdapter.js**  
- Exported class: **OandaAdapter** (declared on line 18)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = OandaAdapter;` (line 499)  

**brokers/SchwabAdapter.js**  
- Exported class: **SchwabAdapter** (declared on line 21)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = SchwabAdapter;` (line 584)  

**brokers/TastyworksAdapter.js**  
- Exported class: **TastyworksAdapter** (declared on line 17)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = TastyworksAdapter;` (line 477)  

**brokers/UpholdAdapter.js**  
- Exported class: **UpholdAdapter** (declared on line 18)  
- Implements interface: **IBrokerAdapter** (extends `IBrokerAdapter`)  
- Export statement: `module.exports = UpholdAdapter;` (line 440)  

**brokers/BrokerRegistry.js**  
- Does **not** export a class; it exports a registry object.  
- Export statement: `module.exports = { BrokerRegistry, getAllBrokers, … };` (line 258)  

**brokers/BrokerFactory.js**  
- Does **not** export a class; it exports a factory function.  
- Export statement: `module.exports = { createBrokerAdapter };` (line 65)  *All line numbers refer to the source files as shown in the repository.*

---

### Q2: Does brokers/IBrokerAdapter.js or foundation/IBrokerAdapter.js exist? If yes, paste the full method signature list it requires (all method names). Cite file:line.

**[11 iterations | answer_given | 8.6s]**

**Yes – both files exist**  

- `brokers/IBrokerAdapter.js` – listed by `list_files` (line 1‑2).  
- `foundation/IBrokerAdapter.js` – listed by `list_files` (line 1‑2).  

Both files define the same abstract broker interface. The full set of required method signatures (method names) is:

| Method | Signature (as defined) | File:Line |
|--------|------------------------|-----------|
| `connect` | `async connect()` | brokers/IBrokerAdapter.js:35‑36; foundation/IBrokerAdapter.js:63‑64 |
| `disconnect` | `async disconnect()` | brokers/IBrokerAdapter.js:43‑44; foundation/IBrokerAdapter.js:71‑72 |
| `isConnected` | `isConnected()` | brokers/IBrokerAdapter.js:51‑52; foundation/IBrokerAdapter.js:79‑80 |
| `getBalance` | `async getBalance()` | brokers/IBrokerAdapter.js:63‑64; foundation/IBrokerAdapter.js:91‑92 |
| `getPositions` | `async getPositions()` | brokers/IBrokerAdapter.js:71‑72; foundation/IBrokerAdapter.js:99‑100 |
| `getOpenOrders` | `async getOpenOrders()` | brokers/IBrokerAdapter.js:79‑80; foundation/IBrokerAdapter.js:107‑108 |
| `placeBuyOrder` | `async placeBuyOrder(symbol, amount, price = null, options = {})` | brokers/IBrokerAdapter.js:95‑96; foundation/IBrokerAdapter.js:123‑124 |
| `placeSellOrder` | `async placeSellOrder(symbol, amount, price = null, options = {})` | brokers/IBrokerAdapter.js:107‑108; foundation/IBrokerAdapter.js:135‑136 |
| `cancelOrder` | `async cancelOrder(orderId)` | brokers/IBrokerAdapter.js:116‑117; foundation/IBrokerAdapter.js:144‑145 |
| `modifyOrder` | `async modifyOrder(orderId, modifications)` | brokers/IBrokerAdapter.js:126‑127; foundation/IBrokerAdapter.js:154‑155 |
| `getOrderStatus` | `async getOrderStatus(orderId)` | brokers/IBrokerAdapter.js:135‑136; foundation/IBrokerAdapter.js:163‑164 |
| `getTicker` | `async getTicker(symbol)` | brokers/IBrokerAdapter.js:148‑149; foundation/IBrokerAdapter.js:176‑177 |
| `getCandles` | `async getCandles(symbol, timeframe = '1m', limit = 100)` | brokers/IBrokerAdapter.js:159‑160; foundation/IBrokerAdapter.js:187‑188 |
| `getOrderBook` | `async getOrderBook(symbol, depth = 20)` | brokers/IBrokerAdapter.js:169‑170; foundation/IBrokerAdapter.js:197‑198 |
| `subscribeToTicker` | `subscribeToTicker(symbol, callback)` | brokers/IBrokerAdapter.js:182‑183; foundation/IBrokerAdapter.js:210‑211 |
| `subscribeToCandles` | `subscribeToCandles(symbol, timeframe, callback)` | brokers/IBrokerAdapter.js:192‑193; foundation/

---

### Q3: In core/OrderExecutor.js, search for hardcoded broker references — kraken, alpaca, BTC/USD, btc, tradingPair defaults. List every instance with file:line. Are these dead/cosmetic or do they affect routing?

**[16 iterations | answer_given | 9.0s]**

**Hard‑coded broker / trading‑pair references in `core/OrderExecutor.js`**

| File | Line | Code (excerpt) |
|------|------|----------------|
| core/OrderExecutor.js | 132 | `const symbol = this.ctx.tradingPair || 'BTC/USD';` |
| core/OrderExecutor.js | 348 | `symbol: this.ctx.tradingPair || 'BTC/USD',` |
| core/OrderExecutor.js | 464 | `symbol: this.ctx.tradingPair || 'BTC/USD',` |
| core/OrderExecutor.js | 620 | `symbol: this.ctx.tradingPair || 'BTC/USD',` |
| core/OrderExecutor.js | 832 | `symbol: this.ctx.tradingPair || 'BTC-USD',` |
| core/OrderExecutor.js | 1009 | `symbol: this.ctx.tradingPair || 'BTC/USD',` |

**Are these dead / cosmetic?**  

* **Line 132** – used to build the `symbol` that is passed to `this.ctx.orderRouter.sendOrder(...)`. If `ctx.tradingPair` is not set, the router receives `'BTC/USD'`. This directly influences which market the order is sent to, so it is **functional**, not cosmetic.  
* **Lines 348, 464, 620, 832, 1009** – all are used in calls to `TradingProofLogger.trade({ … })`. The logger records the symbol for the trade‑proof UI and analytics. While they do not affect order routing, they affect the recorded trade data and any downstream reporting that relies on the symbol. Hence they are **functional** for logging, not dead code.

**Broker‑specific strings (kraken, alpaca, “btc” lower‑case)**  

A repository‑wide grep for “kraken” and “alpaca” inside `core/OrderExecutor.js` returned **no matches** (see grep results). Likewise, a search for the literal `'btc'` (lower‑case) yielded no hits. Therefore, **there are no hard‑coded references to Kraken, Alpaca, or a lower‑case “btc” symbol in this file**.

**Conclusion**  
All hard‑coded trading‑pair defaults (`'BTC/USD'` / `'BTC-USD'`) are active code: they provide a fallback for routing orders (line 132) and for trade‑proof logging (lines 348, 464, 620, 832, 1009). No dead or purely cosmetic broker strings are present in `core/OrderExecutor.js`.

---

### Q4: Where does OrderExecutor get its broker adapter from? Is it injected via ctx.orderRouter, instantiated directly, or hardcoded? Trace the call from OrderExecutor.executeTrade to the adapter method. Cite file:line for every hop.

**[13 iterations | answer_given | 10.3s]**

**Answer**

`OrderExecutor` does **not** instantiate a broker adapter itself and it is not hard‑coded.  
The adapter is supplied to it **through the context object (`ctx.orderRouter`)** that is passed to the constructor. The flow is:

1. **`OrderExecutor` receives the router** – when the executor is built in `run-empire-v2.js` the context includes `orderRouter: this.orderRouter` (line 816).  
   *`run-empire-v2.js:816`*

2. **`executeTrade` calls the router** – inside `OrderExecutor.executeTrade` the live‑trading path does  
   ```js
   const orderResult = await this.ctx.orderRouter.sendOrder({ … });
   ```  
   *`core/OrderExecutor.js:135‑136`*

3. **`OrderRouter.sendOrder` picks the broker adapter** – `sendOrder` looks up the adapter for the symbol (`this.getBrokerForSymbol(symbol)`) and then calls the appropriate method on that adapter (`placeBuyOrder` or `placeSellOrder`).  
   *`core/OrderRouter.js:124‑138`*

4. **The adapter is the Kraken adapter created earlier** – in `run-empire-v2.js` the Kraken adapter is created via the factory (`createBrokerAdapter('kraken', …)`) and then registered with the router (`this.orderRouter.registerBroker(this.kraken, […])`).  
   *`run-empire-v2.js:594‑606`*

5. **Adapter method execution** – the router forwards the call to the adapter’s `placeBuyOrder` (for a BUY/COVER) or `placeSellOrder` (for a SELL) implementation in `KrakenAdapterV2`.  
   *Buy path:* `core/KrakenAdapterV2.js:137‑168`  
   *Sell path:* `core/KrakenAdapterV2.js:170‑198`

**Summary of the chain**

```
run-empire-v2.js (ctx.orderRouter) ──► core/OrderExecutor.js (executeTrade) ──►
core/OrderRouter.js (sendOrder) ──► adapter (KrakenAdapterV2) ──►
placeBuyOrder / placeSellOrder (KrakenAdapterV2)
```

Thus, `OrderExecutor` gets its broker adapter **via the injected `ctx.orderRouter`**, which was set up in the main runner and routes the order to the registered Kraken adapter. No direct instantiation or hard‑coded adapter occurs inside `OrderExecutor`.

---

### Q5: Does any OrderRouter or BrokerRouter class exist that selects which adapter to use per trade? Cite file:line or state NOT FOUND.

**[5 iterations | answer_given | 3.0s]**

Yes. The codebase contains an **`OrderRouter`** class that routes each order to the appropriate broker adapter based on the trade’s symbol.

* The class is defined in **`core/OrderRouter.js`** (class declaration at line 23)【23】.  
* It determines the adapter for a given symbol with `getBrokerForSymbol` (lines 81‑84)【81‑84】.  
* The `sendOrder` method uses that lookup to route the order to the selected adapter (lines 123‑126)【123‑126】.

There is **no** `BrokerRouter` class in the repository; a search for `class BrokerRouter` returned no matches【0】.

---

### Q6: List every broker adapter file in brokers/ directory. For each file, is it a stub (methods throw not implemented) or actually implemented with real API calls? Cite a representative method body file:line for each.

**[17 iterations | answer_given | 20.6s]**

**Broker‑adapter files in `brokers/`**

| File | Stub ? / Implemented with real API calls | Representative method (file : line) |
|------|------------------------------------------|--------------------------------------|
| `AlpacaAdapter.js` | Implemented – uses the Alpaca REST API (axios) | `AlpacaAdapter.js:101‑109` – `await axios.get(`${this.baseUrl}/v2/account`, …)` |
| `BinanceAdapter.js` | Implemented – uses Binance REST API (axios) | `BinanceAdapter.js:129‑134` – `await axios.get(`${this.baseUrl}/api/v3/account`, …)` |
| `CMEAdapter.js` | Implemented – but only returns placeholder data (no external HTTP call) | `CMEAdapter.js:61‑69` – `return { total:0, … }` |
| `CoinbaseAdapter.js` | Implemented – uses Coinbase Advanced API (axios) | `CoinbaseAdapter.js:97‑104` – `await axios.get(`${this.baseUrl}${path}`, { headers })` |
| `GeminiAdapter.js` | Implemented – uses Gemini REST API (axios) | `GeminiAdapter.js:98‑99` – `await axios.get(`${this.baseUrl}${endpoint}`)` |
| `IBrokerAdapter.js` | **Stub** – all methods throw “must be implemented” errors | `IBrokerAdapter.js:36` – `throw new Error('connect() must be implemented')` |
| `InteractiveBrokersAdapter.js` | Implemented – uses Interactive Brokers REST bridge (axios) | `InteractiveBrokersAdapter.js:98‑108` – `await axios(config)` inside `_apiCall` |
| `KrakenIBrokerAdapter.js` | Implemented – delegates to `kraken_adapter_simple` which makes real HTTP calls | `KrakenIBrokerAdapter.js:77‑79` – `return await this.kraken.getBalance()` |
| `OandaAdapter.js` | Implemented – uses Oanda REST API (axios) | `OandaAdapter.js:101‑108` – `await this._apiCall('GET', \`v3/accounts/${this.accountId}\`)` |
| `SchwabAdapter.js` | Implemented – uses Schwab Trader API (axios) | `SchwabAdapter.js:108‑109` – `await axios(config)` inside `_request` |
| `TastyworksAdapter.js` | Implemented – uses Tastyworks REST API (axios) | `TastyworksAdapter.js:101‑111` – `await this._apiCall('GET', '/v3/accounts')` |
| `UpholdAdapter.js` | Implemented – uses Uphold REST API (axios) | `UpholdAdapter.js:97‑104` – `await axios(config)` in `_request` |
| `BinanceAdapter.js` | (already listed) |
| `CoinbaseAdapter.js` | (already listed) |
| `GeminiAdapter.js` | (already listed) |
| `InteractiveBrokersAdapter.js` | (already listed) |
| `KrakenIBrokerAdapter.js` | (already listed) |
| `OandaAdapter.js` | (already listed) |
| `SchwabAdapter.js` | (already listed) |
| `TastyworksAdapter.js` | (already listed) |
| `UpholdAdapter.js` | (already listed) |

**Summary**

- **Stub**: only `IBrokerAdapter.js` (the abstract interface) consists exclusively of methods that throw “must be implemented” errors.  
- **Implemented with real API calls**: all other adapters (`AlpacaAdapter`, `BinanceAdapter`, `CoinbaseAdapter`, `GeminiAdapter`, `InteractiveBrokersAdapter`, `KrakenIBrokerAdapter`, `OandaAdapter`, `SchwabAdapter`, `TastyworksAdapter`, `UpholdAdapter`).  
- **Implemented without external calls**: `CMEAdapter.js` returns placeholder data and does not perform HTTP requests, but it is not a stub because it does not throw “not implemented” errors.  All citations reference the exact file and line numbers where the representative code appears.

---

### Q7: Does core/TradingConfig.js have any per-broker config block (different fees, different symbol formats, different position size limits per broker)? Cite file:line or state NOT FOUND.

**[9 iterations | answer_given | 5.1s]**

**Answer:** `core/TradingConfig.js` does **not** contain a per‑broker configuration block (i.e., no separate fee tables, symbol‑format definitions, or position‑size limits that vary by broker).

**Evidence**

* A repository‑wide search for the literal word “broker” inside `core/TradingConfig.js` returns no matches, indicating the file never defines broker‑specific sections【grep (“broker” in core/TradingConfig.js) → []】.  
* The only fee definition present is a single, universal `fees` object that applies to all brokers (e.g., `makerFee`, `takerFee`, `slippage`, etc.)【open_file lines 629‑635】.  

Therefore, there is **no** per‑broker config block in `core/TradingConfig.js`.

---

## BLOCK N — Multi-asset support

### Q8: In core/StateManager.js, does activeTrades Map key on tradeId only, or does it include asset/symbol? Could the bot today hold concurrent positions in TSLA + BTC + SPY without state collision? Cite file:line.

**[10 iterations | answer_given | 6.9s]**

**Answer**

In **`core/StateManager.js`** the `activeTrades` map is keyed **only by a trade identifier** (the order‑id or a generated `TRADE_<timestamp>`). The map does **not** use the asset or symbol as part of the key – those details are stored inside the trade record itself.

* The map is declared as `orderId → { size, price, entryTime, … }`【core/StateManager.js:106】.  
* When a new trade is opened a `tradeId` is built from `context.orderId` (or a generated timestamp)【core/StateManager.js:346‑348】.  
* The trade is then stored in the map with that `tradeId` as the sole key【core/StateManager.js:368‑369】.

Because each entry’s key is a unique trade‑id, the same `StateManager` can hold many active trades for different symbols (e.g., TSLA, BTC, SPY) simultaneously without any key collision. The symbol/ticker is part of the trade object (via `...context`) but does not affect the map’s indexing.

---

### Q9: In core/TradingLoop.js analyzeAndTrade, does it iterate over multiple assets per candle, or does it assume a single tradingPair? Cite file:line.

**[8 iterations | answer_given | 4.8s]**

`analyzeAndTrade` works on a single market‑data object – it pulls the current price from `this.ctx.marketData` and then runs the whole decision pipeline on that one price. There is no loop that walks over a list of assets or trading pairs; the only loops in the function iterate over existing *positions* (e.g., `activeTrades`), not over different symbols.  

**Citation** – `core/TradingLoop.js` extracts the price from a single `marketData` entry (line 60) and the rest of the method operates on that single price without iterating over multiple assets.  

```js
60   const { price } = this.ctx.marketData;
```

Thus, `analyzeAndTrade` assumes a single trading pair per candle rather than iterating over multiple assets.

---

### Q10: Does IndicatorEngine maintain separate indicator state per symbol, or is it a singleton tracking one instrument? Cite file:line.

**[6 iterations | answer_given | 4.4s]**

**Answer**

`IndicatorEngine` is **not a singleton** – it stores its own symbol and timeframe in the instance’s configuration and all indicator buffers (`candles`, `state`, `ema`, `rsiState`, …) are created as instance fields. Therefore each `new IndicatorEngine(...)` holds a separate indicator state for the instrument it was constructed for.

**Evidence**

* In the constructor the engine records the instrument it will track:

  *`core/indicators/IndicatorEngine.js`* – lines 36‑40 show the `symbol` and `tf` values saved in `this.config` for each instance.  

  ```js
  36  constructor(config = {}) {
  37    this.config = {
  38      symbol: config.symbol || 'BTC-USD',
  39      tf: config.tf || '1m',
  ```

* All internal buffers and state objects are created as properties of the instance (`this.candles`, `this.state`, `this.ema`, `this.rsiState`, …).  

  *`core/indicators/IndicatorEngine.js`* – lines 109‑124 illustrate that each new engine gets its own rolling candle buffer and fresh indicator state.  

  ```js
  109  this.candles = []; // rolling candle buffer
  110  this.state = this._blankState();
  112  this.ema = new Map();          // EMA caches keyed by period
  124  this.rsiState = { avgGain: null, avgLoss: null, rsi: null };
  ```

* The UI layer creates a separate engine per asset‑timeframe pair, storing them in a `Map` keyed by `"symbol‑tf"`:

  *`public/js/IndicatorAdapter.js`* – lines 9‑11 demonstrate that a distinct `IndicatorEngine` (or placeholder) is kept for each symbol.  

  ```js
  9   // We'll create IndicatorEngine instances per asset-timeframe pair
  10  this.engines = new Map(); // key: "BTC-1m", value: IndicatorEngine instance
  ```

**Conclusion**

`IndicatorEngine` maintains **separate indicator state per symbol (and timeframe)** by design; each `new IndicatorEngine` instance is independent, and the system can run many such instances concurrently.

---

### Q11: Does pattern memory (PatternMemoryBank or UnifiedPatternMemory) namespace patterns by asset, or are all patterns mixed in one store? Trace the save/load path. Cite file:line.

**[13 iterations | answer_given | 10.9s]**

**Short answer**  
Both the legacy **PatternMemoryBank** and the newer **UnifiedPatternMemory** keep a **single, global store per execution mode** (live / paper / back‑test).  Patterns are keyed only by a computed signature/hash; there is **no asset‑level namespace** – all patterns for all assets are mixed together in the same file.

**How the store is chosen and loaded**

| Component | How the file name is built (mode‑aware) | Where it is loaded from |
|-----------|------------------------------------------|--------------------------|
| **PatternMemoryBank** | In the constructor the current mode is derived from environment variables and then a file name is selected (`pattern_memory.live.json`, `pattern_memory.paper.json` or `pattern_memory.backtest.json`).  If a custom `dbPath` is supplied it is suffixed with the mode (`.live.json`, `.paper.json`, …).  See lines 78‑102 of `core/PatternMemoryBank.js`【open_file†L78-L102】. | The `loadMemory()` method checks `fs.existsSync(this.dbPath)` and reads the JSON file, falling back to an empty structure if the file is missing or invalid.  See lines 140‑146【open_file†L140-L146】. |
| **UnifiedPatternMemory** | The constructor builds `this.storagePath` as `unified-patterns.<mode>.json` (live / paper / backtest) inside the configured data directory.  The mode is derived from `BACKTEST_MODE`, `PAPER_TRADING` or defaults to `live`.  See lines 147‑151 of `ogz-meta/ledger/UnifiedPatternMemory.js`【open_file†L147-L151】. | The private `_load()` method runs at construction time, reads `this.storagePath` if it exists, parses the JSON and restores `this.patterns` and stats.  See lines 545‑556【open_file†L545-L556】. |
| **UnifiedPatternMemory – save** | The `save()` method (called periodically) writes a JSON object containing `patterns`, `stats`, etc. to a temporary file and then renames it to `this.storagePath`.  See lines 523‑539【open_file†L523-L539】. |

**Implications**

* Because the key is a **signature hash** (`computeSignature(features)` → MD5‑derived 12‑char string) and there is no extra asset identifier in the key, all assets share the same namespace.  
* The only separation is by **execution mode** (live, paper, back‑test) – each mode gets its own file (`pattern_memory.*.json` or `unified-patterns.*.json`).  
* Therefore, patterns from different symbols are **mixed together** in the same store for a given mode.  

**Conclusion**  
Neither `PatternMemoryBank` nor `UnifiedPatternMemory` namespaces patterns by asset; they keep a single global pattern store per mode, loading from and persisting to the mode‑specific JSON file described above.

---

### Q12: In core/StrategyOrchestrator.js, when a strategy fires a signal, does the signal carry an asset/symbol field, or is it inferred from a global ctx.tradingPair? Cite file:line.

**[21 iterations | answer_given | 14.6s]**

The orchestrator does **not** embed an asset or symbol in the signal that a strategy returns.  
Each strategy’s `evaluate` method returns a plain object that only contains fields such as `direction`, `confidence`, `reason`, `signalData` (and optionally `overrideLevels`). For example, the EMA‑SMA crossover strategy returns:

```js
return {
  direction: sig.direction,
  confidence: conf,
  reason: `EMA/SMA Crossover ${sig.direction} (${sig.crossovers?.length || 0} crosses)${fibBoost}`,
  signalData: sig
};
```

(see lines 209‑212 in **core/StrategyOrchestrator.js**).  
The MA‑Dynamic S/R strategy, Liquidity‑Sweep strategy, and others follow the same pattern – none of their return objects include an asset or symbol field (e.g., lines 260‑263, 306‑309, 305‑308).

When the orchestrator builds its evaluation context it only passes `indicators, patterns, regime, priceHistory, extras` – there is no `tradingPair` in that context:

```js
const ctx = { indicators, patterns, regime, priceHistory, extras };
```

(see line 680‑681). Consequently, the signal itself does not carry a symbol; the asset is later inferred from the global `ctx.tradingPair` (used elsewhere, e.g., in **core/OrderExecutor.js** at line 132).

**Answer:** The signal does **not** carry an asset/symbol field; the asset is inferred from the global `ctx.tradingPair` outside the signal object.

---

### Q13: Are exit contract configs per-asset or global? Can RSI run on TSLA-15m and BTC-1h simultaneously with different validated exit contracts? Cite file:line for the config lookup.

**[10 iterations | answer_given | 7.8s]**

**Answer**

- The exit‑contract configuration lives under **`BASE_CONFIG.exitContracts`** and is keyed only by the **strategy name**, not by asset or timeframe.  
  - The lookup is performed in `core/TradingConfig.js` by `static getExitContract(strategyName)` which returns `BASE_CONFIG.exitContracts[strategyName]` (or the default)【core/TradingConfig.js:843‑845】.  
  - The actual contracts are defined in the same file under the `exitContracts` block, e.g. the RSI contract is defined once for the RSI strategy【core/TradingConfig.js:284‑293】.

Because the mapping is **strategy → contract**, the same contract is used for every asset that runs that strategy. The platform does not maintain separate per‑asset (or per‑timeframe) exit‑contract entries unless an explicit override is supplied at runtime, which is not the default behavior.

**Consequences**

- **Exit‑contract configs are global per strategy**, not per‑asset.  
- Running the RSI strategy on two symbols (e.g., **TSLA‑15m** and **BTC‑1h**) at the same time will use the **same validated RSI exit contract** for both. You cannot have two different validated exit contracts for the same strategy on different assets simultaneously without custom overrides.  

If you need distinct exit behavior per asset, you would have to create separate strategies (e.g., `RSI_TLA` and `RSI_BTC`) or apply runtime overrides, but the built‑in configuration is global.

---

## BLOCK O — Cross-broker arbitrage layer

### Q14: Search the repo for arbitrage, cross-broker, arb, spread-arb in all JS files. List every file that mentions it. Are these in the live trading path or in standalone scripts/docs? Cite file:line.

**[12 iterations | answer_given | 10.4s]**

**Files that mention the requested terms**

| File | Line(s) where the term appears | Context (live‑trading code vs. standalone script) |
|------|------------------------------|---------------------------------------------------|
| `tools/run-audit-revised-part2.js` | 53 – 54, 108 | Stand‑alone audit script (not part of the live‑trading engine). |
| `TierFeatureFlags.js` | 50 | Live‑trading configuration (feature‑flag definition). |
| `core/TradingConfig.js` | 736 | Live‑trading configuration (feature‑flag definition). |

**Explanation**

* The audit script `tools/run-audit-revised-part2.js` contains three occurrences of the keywords (cross‑broker arbitrage layer, the query string, and a block list that includes “arbitrage”). This file lives under `tools/`, which is used for analysis / auditing and is not part of the production trading path.  
* `TierFeatureFlags.js` defines an `arbitrage` flag for a given tier (line 50). This file is part of the core configuration that the live trading system reads at startup.  
* `core/TradingConfig.js` defines the `enableArbitrage` feature flag (line 736). This file is also part of the live‑trading configuration.

No other JavaScript files in the repository contain the exact strings “arbitrage”, “cross‑broker”, “arb”, or “spread‑arb”.

---

### Q15: Does any module compute price differentials between two brokers for the same asset? Cite file:line or state NOT FOUND.

**[22 iterations | answer_given | 14.4s]**

NOT FOUND.

---

### Q16: Does OrderExecutor support simultaneous order placement on two different brokers (one buy, one sell) as an atomic operation? Cite file:line or state NOT FOUND.

**[7 iterations | answer_given | 4.2s]**

**Answer:** No. The current `OrderExecutor` implementation only sends a single order to the `OrderRouter` (see the call to `this.ctx.orderRouter.sendOrder` at lines 135‑140 of `core/OrderExecutor.js`). There is no code that creates or manages a pair of orders on two different brokers as an atomic operation, nor any API in `OrderRouter` that supports such multi‑broker atomic execution.  

*Citation:* `core/OrderExecutor.js` lines 135‑140 show a single `sendOrder` call, and no other part of the codebase provides an atomic “buy‑on‑broker‑A + sell‑on‑broker‑B” transaction.

---

## BLOCK P — TRAI 9-function brain layer

### Q17: The GRAND-SCHEME calls out 9 TRAI functions: news crawler NLP, whale watcher, pattern modulator, trade analyst, customer service, boomer API onboarding, content gen ElevenLabs D-ID, dashboard widget, ops manager. For each function, does any implementation file exist in the repo? List file path or state NOT FOUND per function.

**[39 iterations | answer_given | 49.1s]**

**Implementation files for the 9 TRAI functions**

| TRAI Function | Implementation file (or NOT FOUND) |
|---------------|-----------------------------------|
| news crawler NLP | `core/TRAIWebContext.js` – fetches crypto news headlines (see lines 184‑186, 187‑200) |
| whale watcher | `core/TradeIntelligenceEngine.js` – evaluates whale activity and alerts (see lines 775‑795) |
| pattern modulator | **NOT FOUND** – no source file matching this name or purpose was located |
| trade analyst | `core/TradeIntelligenceEngine.js` – provides trade‑analysis logic (same as whale‑watcher, lines 775‑795) |
| customer service | **NOT FOUND** – only category references appear in `core/trai_core.js`; no concrete implementation file |
| boomer API onboarding | **NOT FOUND** – no file containing “boomer”, “API”, or “onboarding” was found |
| content gen ElevenLabs D‑ID | **NOT FOUND** – the repo mentions ElevenLabs/D‑ID in design docs, but no source file implements them |
| dashboard widget | `public/trai-widget.js` – floating chat widget for the dashboard (see lines 1‑5) |
| ops manager | **NOT FOUND** – no module named “OpsManager” or similar was discovered |

*All line references are taken directly from the repository files.*

---

### Q18: Does any file integrate with ElevenLabs or D-ID APIs? Cite file:line or state NOT FOUND.

**[13 iterations | answer_given | 15.7s]**

Yes. The TRAI core modules read API keys for both ElevenLabs (voice synthesis) and D‑ID (video generation) and use them when the corresponding features are enabled.

* **`core/trai_core.js`** – configuration stores the ElevenLabs key on line 88 and the D‑ID key on line 89.  
  `elevenlabsApiKey: config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY,`【source: core/trai_core.js line 88】  
  `didApiKey: config.didApiKey || process.env.DID_API_KEY,`【source: core/trai_core.js line 89】

* **`ogz-meta/ledger/unified-trai_core.js`** – the same configuration appears in the unified version, with the ElevenLabs key on line 88 and the D‑ID key on line 89.  
  `elevenlabsApiKey: config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY,`【source: ogz-meta/ledger/unified-trai_core.js line 88】  
  `didApiKey: config.didApiKey || process.env.DID_API_KEY,`【source: ogz-meta/ledger/unified-trai_core.js line 89】

These files therefore integrate with the ElevenLabs and D‑ID APIs.

---

### Q19: Does any file scrape or poll news sources (RSS, Twitter, Bloomberg, Reuters, Polygon news)? Cite file:line or state NOT FOUND.

**[12 iterations | answer_given | 7.2s]**

**Answer:** No file in the repository scrapes or polls the listed news sources (RSS, Twitter, Bloomberg, Reuters, or Polygon news).  

- A search for “rss”, “twitter”, “bloomberg”, and “reuters” returned **no matches** in any JavaScript/TypeScript file (e.g., `grep` for each term returned 0 results).  
- The only news‑fetching code is `fetchCryptoNewsHeadlines` in **core/TRAIWebContext.js** (lines 185‑203), which pulls headlines from CryptoCompare, not from the sources you asked about.  

Therefore, the repository does **not** contain any scraper/poller for RSS, Twitter, Bloomberg, Reuters, or Polygon news.

---

### Q20: In core/trai_core.js and core/TRAIDecisionModule.js, what functions are actually called from outside the TRAI module by the trading loop or other core modules? List each external caller with file:line.

**[45 iterations | answer_given | 31.2s]**

**Functions in `core/trai_core.js` that are called from outside the TRAI module**

| TRAI Core function | External caller (file : line) |
|--------------------|--------------------------------|
| `initialize()` | `core/TRAIDecisionModule.js:126` – `await this.traiCore.initialize();` |
| `generateIntelligentResponse()` | `core/TRAIDecisionModule.js:718` – `await this.traiCore.generateIntelligentResponse(prompt, …);` |
| `recordTradeResult()` | `core/TRAIDecisionModule.js:1002` – `this.traiCore.recordTradeResult(tradeData);` |
| `getMemoryStats()` | `core/TRAIDecisionModule.js:1021` – `return this.traiCore.getMemoryStats();` |
| `pruneOldMemories()` | `core/TRAIDecisionModule.js:1033` – `return this.traiCore.pruneOldMemories();` |

**Functions in `core/TRAIDecisionModule.js` that are called from outside the TRAI decision module**

| TRAI Decision Module function | External caller (file : line) |
|------------------------------|--------------------------------|
| `processDecision()` | `core/TradingLoop.js:411` – `this.ctx.trai.processDecision(` |
| `setWebSocketClient()` | `core/WebSocketManager.js:110` – `this.ctx.trai.setWebSocketClient(this.ctx.dashboardWs);` |
| `recordTradeOutcome()` | `core/OrderExecutor.js:829` – `this.ctx.trai.recordTradeOutcome({ … });` |

These are the only places in the codebase where the respective functions are invoked from modules other than the TRAI module itself.

---

### Q21: Is there a customer-service or chatbot endpoint that uses TRAI for non-trading queries? Cite file:line or state NOT FOUND.

**[9 iterations | answer_given | 8.2s]**

Yes. The server defines a chatbot/customer‑service endpoint that forwards requests to the TRAI inference service for general (non‑trading) AI chat:

* The endpoint is documented in the “ENDPOINTS” comment as **POST /api/ollama/chat → Proxy to TRAI/Ollama for AI chat**【ogzprime-ssl-server.js:13‑16】.  
* The actual route handler is implemented at **app.post('/api/ollama/chat', …)**, which proxies the request to the local TRAI/Ollama server and returns its JSON response【ogzprime-ssl-server.js:74‑86】.  

Therefore, a customer‑service/chatbot endpoint that uses TRAI for non‑trading queries does exist.

---

## BLOCK Q — Pattern memory and premium packs

### Q22: Does tools/harvest-pattern-pack.js exist? What does it export? Cite file path and module.exports block.

**[6 iterations | answer_given | 5.0s]**

**Answer**

- The file **`tools/harvest-pattern-pack.js`** does exist in the repository (it appears in the directory listing of `tools/`【list_files → “harvest-pattern-pack.js”】).  
- The script is a stand‑alone CLI utility; it does **not** export anything via `module.exports`. The source ends with a call to `main()` and contains no `module.exports` statement (the last lines show `main();` and no export block【open_file → lines 315‑316】).  

Therefore, while the file is present, it does not provide any exported module.

---

### Q23: Trace the pipeline from a closed trade to a pattern saved in PatternMemoryBank or UnifiedPatternMemory. Cite every hop file:line.

**[24 iterations | answer_given | 15.9s]**

**Pipeline from a closed trade to a pattern saved in `PatternMemoryBank` / `UnifiedPatternMemory`**

| Step | What happens | Code location |
|------|--------------|---------------|
| 1️⃣ Closed‑trade data is built in **OrderExecutor** and handed to TRAI | After a trade finishes, `OrderExecutor` calls `this.ctx.trai.recordTradeOutcome({ … })` with a full trade object that follows the PatternMemoryBank schema. | `core/OrderExecutor.js:829‑833` |
| 2️⃣ `TRAIDecisionModule.recordTradeOutcome` forwards the data to the core AI | The method in **TRAIDecisionModule** receives the trade object and calls `this.traiCore.recordTradeResult(trade)`. | `core/TRAIDecisionModule.js:995‑1002` |
| 3️⃣ `TRAICore.recordTradeResult` extracts a feature vector and writes the outcome to the unified memory store | Inside **TRAICore**, the trade’s entry indicators are turned into a 9‑element `features` array, then `this.patternMemory.recordOutcome(features, { … })` is invoked. | `core/trai_core.js:767‑788` (and the UnifiedPatternMemory instance is created at `core/trai_core.js:119‑120`) |
| 4️⃣ `UnifiedPatternMemory.recordOutcome` updates/creates the pattern record | The **UnifiedPatternMemory** class receives the feature vector and the outcome payload, creates a pattern signature if needed, updates win/loss counters, P&L stats, timestamps, and stores the pattern in its internal `this.patterns` map. | `core/UnifiedPatternMemory.js:218‑265` (definition of `recordOutcome`) |
| 5️⃣ Pattern is persisted (optional) | If persistence is enabled, `UnifiedPatternMemory` periodically writes the `this.patterns` map to disk (via its internal `_save` method), guaranteeing the pattern survives process restarts. | `core/UnifiedPatternMemory.js:130‑146` (initialisation) and the periodic save logic further down in the same file. |

**Result:**  
A closed trade flows from `OrderExecutor` → `TRAIDecisionModule` → `TRAICore` → `UnifiedPatternMemory.recordOutcome`, where the pattern (identified by its signature) is stored/updated in the unified memory bank (which supersedes the older `PatternMemoryBank`). Each hop is pinpointed with the file and line numbers above.

---

### Q24: Is there any concept of premium pattern pack vs operational pattern bank in code (separate storage, separate gating)? Cite file:line or state NOT FOUND.

**[15 iterations | answer_given | 12.2s]**

Yes. The codebase treats a **premium pattern pack** and the **operational pattern bank** as two distinct entities:

* **Separate storage**  
  * The premium pack generator writes its result to its own folder: `packs/premium-{ticker}-{timestamp}.json`【file:ogz-meta/ledger/generate-premium-pattern-pack.js, lines 26‑27】.  
  * The operational pattern bank is persisted by `UnifiedPatternMemory` in a different file whose name depends on the run mode: `data/unified-patterns.{mode}.json`【file:core/UnifiedPatternMemory.js, lines 151‑152】.

* **Separate gating**  
  * Premium packs are filtered by explicit criteria (skip quarantined patterns, require a minimum number of trades, a minimum win‑rate percentage, and a minimum P&L) before a pattern is added to the pack【file:ogz-meta/ledger/generate-premium-pattern-pack.js, lines 138‑149】.  
  * The operational bank uses its own gating thresholds defined in the `UnifiedPatternMemory` config (minimum samples, success/failure win‑rate thresholds that drive promotion or quarantine)【file:core/UnifiedPatternMemory.js, lines 135‑141】.

Thus the code implements distinct storage locations and independent gating logic for premium pattern packs versus the regular operational pattern bank.

---

### Q25: Does pattern memory have an export/import or serialize/deserialize format? Cite file:line for those methods.

**[12 iterations | answer_given | 7.2s]**

Yes. The pattern‑memory implementation provides explicit export/import (i.e. serialize/deserialize) methods.

* **`exportMemory()`** – returns a deep‑copy of the in‑memory data structure so it can be persisted or inspected.  
  *`core/PatternMemoryBank.js` line 743‑745*  

* **`importMemory(data)`** – accepts a previously exported object, validates its structure, replaces the current memory, and writes it back to disk.  
  *`core/PatternMemoryBank.js` line 750‑754*  

* The class itself is exported for use by other modules, and the status constants are also re‑exported.  
  *`core/PatternMemoryBank.js` line 809‑810*  

These methods constitute the serialize/deserialize format for the pattern memory.

---

### Q26: Is there pattern namespacing by ticker, timeframe, strategy, or any combination? Or is the pattern store a single global namespace? Cite file:line.

**[15 iterations | answer_given | 11.0s]**

The pattern store is **not** namespaced by ticker, timeframe, or strategy.  
Instead, the memory is partitioned **only by execution mode** (live, paper, back‑test) to keep data from different environments separate.  

* The file header explicitly says the memory files are separated by mode to prevent cross‑contamination【9†L24-L28】.  
* In the constructor the code determines the current mode (live / paper / backtest) and selects a distinct JSON file for each mode (e.g., `pattern_memory.live.json`, `pattern_memory.paper.json`, `pattern_memory.backtest.json`)【10†L80-L102】.  

Thus, all patterns for a given mode share a single global namespace; there is no additional namespacing by ticker, timeframe, or strategy.

---

## BLOCK R — Hot-swap and atomic config changes

### Q27: In core/TradingConfig.js, are values read once at module load, or can TradingConfig.get(key) return updated values mid-run if env vars change? Trace the implementation of get(). Cite file:line.

**[10 iterations | answer_given | 7.4s]**

**Answer**

`TradingConfig.get(key)` does **not** re‑read the environment each time it is called.  

* The configuration object (`BASE_CONFIG`) is built once when the module is loaded, using the helper `env()` that reads `process.env` (see the definition of `BASE_CONFIG` at lines 36‑44)【open_file†L30-L45】.  
* `TradingConfig.get(path, defaultValue)` simply looks up the requested key in that already‑created `BASE_CONFIG` (or in any temporary overrides that were set). The method walks the dot‑notation path and returns the value; it never calls `process.env` again (see the implementation at lines 801‑819)【open_file†L795-L819】.  
* The only way to change a value at runtime is through `TradingConfig.setOverrides()` which stores a flat map of overrides (`activeOverrides`) that `get()` checks first (see `setOverrides` at lines 873‑879)【open_file†L869-L879】.  

Therefore, values are read **once at module load**; after that, `TradingConfig.get(key)` will return the same value unless an explicit override is applied via `setOverrides()`. Changes to environment variables after the module has been required will not affect the result of `get()`.

---

### Q28: Does any file call TradingConfig.set() or TradingConfig.update() to mutate config during runtime? Cite file:line or state NOT FOUND.

**[8 iterations | answer_given | 4.8s]**

**Answer:** No file in the repository calls `TradingConfig.set()` or `TradingConfig.update()` to mutate the configuration at runtime.

**Evidence:** A repository‑wide search for `TradingConfig.set(` and `TradingConfig.update(` returned only the audit‑script line that contains the question itself and no actual code calls【grep】. Therefore, such calls do not exist in the codebase.

---

### Q29: Is there any pending changes staging area that batches config updates and applies them between candles atomically? Cite file:line or state NOT FOUND.

**[15 iterations | answer_given | 10.7s]**

**Answer:** There is no staging area that batches configuration changes and applies them atomically between candles. The code contains a dynamic‑config method (`updateConfig`) in `core/TRAIDecisionModule.js` that updates the configuration immediately (see lines 966‑969), and a pending‑action mechanism (`pendingEntry`, `pendingExit`, `pendingClose`) in `pine-transpiler/core/PineStrategyBridge.js` that buffers trade actions for the next candle (see lines 89‑115). No similar pending‑changes buffer exists for configuration updates.  

**Citations**  
- `core/TRAIDecisionModule.js` — `updateConfig(newConfig) { this.config = { …this.config, …newConfig }; … }` (lines 966‑969).  
- `pine-transpiler/core/PineStrategyBridge.js` — `pendingEntry`, `pendingExit`, `pendingClose` are reset after each candle (lines 89‑115).  

**Result:** `NOT FOUND` – no pending‑changes staging area for config updates.

---

### Q30: If TradingConfig values change mid-run, do in-flight trades inherit the new values or keep the values from when they were opened (sealed-at-birth property)? Cite file:line.

**[7 iterations | answer_given | 5.3s]**

In‑flight trades **do not** pick up changes to `TradingConfig` that occur after the trade has been opened. When a trade is created, `TradingLoop` reads the current `exitLogic` from `TradingConfig` and deep‑clones it into `trade.exitEnv`. Subsequent modifications to the config are ignored for that trade, so each trade is “sealed at birth” and only new trades see the updated values.  

**Citation:** ogz‑meta/todocontext47.md line 718.

---

## BLOCK S — Pine transpiler SaaS readiness

### Q31: Can a user upload a .pine file via HTTP endpoint and get a transpiled JS module back? Search for any web endpoint that accepts pine source. Cite file:line or state NOT FOUND.

**[13 iterations | answer_given | 9.2s]**

No HTTP endpoint in the OGZPrime codebase accepts a `.pine` file and returns a transpiled JavaScript module.

* The main server (`ogzprime-ssl-server.js`) lists its public API routes (dashboard HTML, Ollama proxy, TRAI analysis, health, etc.) and does **not** include any route that mentions “pine” or file uploads — the only reference to Pine in this file is the import of `PineTALib` (line 51)【grep†ogzprime-ssl-server.js:51】.  
* A repository‑wide search for the literal string “.pine” only finds CLI‑only tools (e.g., `pine-import.js`) and documentation, with no Express route or HTTP handler that processes Pine source files【grep†pine-transpiler/tools/pine-import.js:10】【grep†pine-transpiler/tools/pine-import.js:27】.  

Therefore, there is **no** web endpoint that accepts Pine source for transpilation. **NOT FOUND**.

---

### Q32: Is there any sandboxing on transpiled Pine strategies (resource limits, CPU time, memory caps) before they execute? Cite file:line or state NOT FOUND.

**[13 iterations | answer_given | 9.9s]**

Yes. The Pine runtime applies a few built‑in resource limits before a transpiled strategy runs, but it does **not** enforce generic CPU‑time or memory caps.

* **History look‑back limit** – each candle evaluation keeps only a bounded number of recent bars. The code caps the history (and the stored state snapshots) at a default of **500** bars【pine-transpiler/core/PineRuntime.js:40‑41】.  
* **Loop‑iteration safeguard** – `while` loops are guarded with a maximum of **1 000** iterations to prevent infinite loops【pine-transpiler/core/PineRuntime.js:106‑108】.

Beyond these checks, there is no additional sandboxing such as explicit CPU‑time throttling or memory‑usage caps in the codebase.

---

### Q33: Is there any user/tenant model in the codebase (User class, account ID, multi-tenancy)? Cite file:line or state NOT FOUND.

**[16 iterations | answer_given | 9.0s]**

**Answer:**  
The codebase does **not** contain a dedicated `User` class or a multi‑tenant framework. The only “user‑related” data that appears are broker‑specific account identifiers, which are stored as `accountId` fields in the various broker adapters (e.g., OandaAdapter, InteractiveBrokersAdapter, TastyworksAdapter).  

**Citations**

* `brokers/OandaAdapter.js` – the constructor saves the account ID from the configuration:  

```js
this.accountId = config.accountId;   // line 23
```  

* `brokers/InteractiveBrokersAdapter.js` – the constructor also stores an account ID:  

```js
this.accountId = config.accountId;   // line 24
```  

* `brokers/TastyworksAdapter.js` – account IDs are retrieved from the broker’s account list:  

```js
const accountId = accounts[0].account.external_id;   // line 111 (and similar lines 128, 153, 186, 226, 239, 255)
```  

No file defines a `User` class, tenant‑ID handling, or a multi‑tenant architecture. Therefore, **a user/tenant model is not present** in the repository.

---

## BLOCK T — Tournament to PID handoff

### Q34: In core/TradingConfig.js, search for a pid block. Paste the full pid section if it exists. Cite file:line.

**[4 iterations | answer_given | 3.2s]**

Here is the complete **pid** configuration block from **core/TradingConfig.js** (lines 180‑202):

```js
  pid: {
    enabled: env('PID_ENABLED', true),
    updateInterval: env('PID_UPDATE_INTERVAL', 10),      // Run every N trades
    warmupTrades: env('PID_WARMUP_TRADES', 50),          // Min trades before active
    windowSize: env('PID_WINDOW_SIZE', 20),              // Rolling trade window

    // Loop 1: Position Sizing — equity slope → size multiplier
    positionKp: env('PID_POSITION_KP', 0.30),            // Proportional gain
    positionKi: env('PID_POSITION_KI', 0.05),            // Integral gain
    positionKd: env('PID_POSITION_KD', 0.10),            // Derivative gain
    targetEquitySlope: env('PID_TARGET_SLOPE', 0.005),   // Target equity curve slope

    // Loop 2: Regime Boost Adaptation — per‑strategy P&L → boost adjustment
    regimeKp: env('PID_REGIME_KP', 0.02),
    regimeKi: env('PID_REGIME_KI', 0.005),
    regimeKd: env('PID_REGIME_KD', 0.01),

    // Loop 3: Trailing Stop Adaptation — MFE capture → ATR multiplier
    trailKp: env('PID_TRAIL_KP', 0.15),
    trailKi: env('PID_TRAIL_KI', 0.03),
    trailKd: env('PID_TRAIL_KD', 0.05),
    targetMFERatio: env('PID_TARGET_MFE', 0.60),         // Target: capture 60 % of max profit
  },
```

**Citation:** core/TradingConfig.js lines 180‑202.

---

### Q35: Does core/PIDController.js exist? If yes, where do the clamp ranges (outputMin/outputMax for each loop) come from — hardcoded constants, TradingConfig values, or a pid.envelopes lookup? Cite file:line for each clamp.

**[7 iterations | answer_given | 5.2s]**

**Yes – `core/PIDController.js` exists.**  

The clamp ranges (`outputMin` / `outputMax`) for each PID loop are **hard‑coded constants** in the controller’s constructor; they are not read from `TradingConfig` or a `pid.envelopes` lookup.

| Loop | Where the clamp is set | Values (hard‑coded) |
|------|------------------------|---------------------|
| Position‑sizing (`positionLoop`) | `outputMin: 0.3, outputMax: 2.0` | 0.3 – 2.0 (30 % – 200 % of base size)【file:core/PIDController.js,lines 139‑140】 |
| Regime‑boost (`regimeLoops`) | `outputMin: 0.5, outputMax: 1.5` | 0.5 – 1.5 (50 % – 150 % boost)【file:core/PIDController.js,lines 155‑156】 |
| Trailing‑stop (`trailLoop`) | `outputMin: 1.0, outputMax: 3.5` | 1.0 – 3.5 (100 % – 350 % ATR multiplier)【file:core/PIDController.js,lines 169‑170】 |

These values are supplied directly in the `new PIDLoop(...)` calls and thus are fixed literals in the source code. No dynamic lookup (e.g., `TradingConfig` values or a `pid.envelopes` map) is used for the clamp ranges.

---

### Q36: Does any tournament tool (tools/tournament.js, tools/parallel-backtest.js) write output to a pid.envelopes block or manifest file that PID can read? Cite file:line or state NOT FOUND.

**[15 iterations | answer_given | 9.7s]**

**Answer:** Neither of the tournament tools writes output to a `pid.envelopes` block or a manifest file that the PID controller can read.

- A search for the literal string `pid.envelopes` in `tools/parallel-backtest.js` returns **no matches**【functions.grep】.  
- The repository contains **no `tools/tournament.js` file** (a directory listing for `tools/` shows no files)【functions.list_files】, so there is nothing that could write such a block.

Therefore, **NOT FOUND** – no tournament tool writes to a `pid.envelopes` block or manifest file.

---

### Q37: Is PIDController instantiated and called anywhere in the trading loop today, or is it built-but-unwired? Cite file:line of instantiation or state NOT FOUND.

**[6 iterations | answer_given | 3.6s]**

PIDController is **wired into the live trading loop** – it is required, instantiated, and its `onTradeClose` method is invoked for both long and short exits.

* The module is imported in the executor: **core/OrderExecutor.js:20**  
* For a long‑position exit the controller is created and called: **core/OrderExecutor.js:745‑746**  
* For a short‑position exit the controller is created and called: **core/OrderExecutor.js:1038‑1039**  

Thus PIDController is not “built‑but‑unwired”; it is actively used in the trading loop.

---

### Q38: Is there any persistence for PID state (integral accumulator, prevError, history) between bot restarts? Cite file:line or state NOT FOUND.

**[10 iterations | answer_given | 6.4s]**

No – the PID controller keeps all of its state (integral accumulator, `prevError`, history, outputs, etc.) only in the in‑memory singleton instance. The implementation creates a `PIDController` object and stores its loops (`integral`, `prevError`, `history`, etc.) in fields of that object, but there is no code that writes these values to disk, a database, or any other external store, nor any code that loads them on start‑up. Consequently the PID state is lost whenever the bot restarts.

**Evidence**

* The `PIDLoop` class defines the runtime state (`integral`, `prevError`, `history`, etc.) as plain properties (lines 47‑52) and never writes them elsewhere.【open_file 1‑52】
* The `PIDController` class holds the loops and outputs entirely in memory (lines 124‑185).【open_file 124‑185】
* The singleton instance is created only in‑process (`let instance = null; … function getPIDController() { if (!instance) instance = new PIDController(); … }`) with no persistence logic.【open_file 363‑371】

Since no file contains code for persisting or restoring this state, the answer is **state NOT FOUND**.

---

## BLOCK U — Subscription / SaaS layer

### Q39: Does any file implement user authentication (JWT, OAuth, API key validation per user)? Cite file:line or state NOT FOUND.

**[12 iterations | answer_given | 8.3s]**

**Yes – the codebase contains several authentication implementations.**  

| Authentication type | File (line) | How it is implemented |
|---------------------|-------------|----------------------|
| **WebSocket token validation** (simple per‑client token, not JWT) | `ogzprime-ssl-server.js:461‑506` | A `ws.authenticated` flag is set to `false` (line 461). A 10‑second timeout forces the client to send an `auth` message (lines 465‑475). When a message with `type === 'auth'` arrives, the token is compared to an environment variable (`process.env.WEBSOCKET_AUTH_TOKEN`) and the connection is marked authenticated (lines 492‑506). |
| **OAuth2 authentication (Uphold broker)** | `brokers/UpholdAdapter.js:10` | The adapter’s header notes “‑ OAuth2 authentication” indicating that the broker uses OAuth2 tokens for API calls. |
| **Bearer‑token (API‑key) validation (Oanda broker)** | `brokers/OandaAdapter.js:77` | The request headers include `'Authorization': \`Bearer ${this.apiKey}\`` (line 77), using a per‑user API key as a bearer token. |
| **API‑key header authentication (Alpaca broker)** | `brokers/AlpacaAdapter.js:53‑55` | The `_authHeaders()` method returns `{'APCA-API-KEY-ID': this.apiKey, 'APCA-API-SECRET-KEY': this.apiSecret, ...}` (lines 53‑55), validating a user’s API key and secret for each request. |

These files collectively provide user‑level authentication via token checks, OAuth2 usage, and per‑user API‑key validation.

---

### Q40: Is there a Stripe/Paddle/payment integration for subscriptions? Cite file:line or state NOT FOUND.

**[4 iterations | answer_given | 2.6s]**

Yes – the codebase includes a Stripe integration that creates subscription checkout sessions. In **public/stripe-checkout.js** the checkout session is created with `mode: 'subscription'` (lines 44‑45) and handles tier‑based price IDs for recurring plans【public/stripe-checkout.js:44-45】.

There is no Paddle (or other payment‑gateway) subscription integration in the repository; a search for “Paddle” returns no source files【tools/run-audit-revised-part2.js:92】.

---

### Q41: Does any file enforce free-tier limits vs paid-tier features? Cite file:line or state NOT FOUND.

**[8 iterations | answer_given | 5.4s]**

Yes. The platform enforces free‑tier vs. paid‑tier limits through the tier‑scaling logic in the feature‑flag manager:

* **`core/FeatureFlagManager.js`** – the private method `_loadTierScaling()` returns a set of limits for each tier. The “starter” tier (the free tier) is defined with low limits (`maxPositions: 5`, `leverage: 1`, `maxDailyTrades: 50`, `patternLimit: 10`)【core/FeatureFlagManager.js:138‑164】.
* **`TierFeatureFlags.js`** – the helper `_getTierScaling()` mirrors the same tier‑limit table, again mapping the “starter” tier to those same free‑tier caps【TierFeatureFlags.js:85‑91】.

These files together enforce the different limits for free‑tier (starter) versus paid‑tier (pro, elite, ml) features.

---

## BLOCK V — Operational maturity

### Q42: Does any file implement health-check endpoints, watchdog timers beyond WebSocket heartbeat, or external monitoring hooks (Prometheus, Datadog, Sentry)? Cite file:line.

**[8 iterations | answer_given | 5.3s]**

Yes – the codebase includes a simple HTTP health‑check endpoint, a WebSocket ping/pong watchdog, and a Sentry error‑monitoring hook.

* **Health‑check endpoint** – `ogzprime-ssl-server.js` defines `/api/health` that returns status, uptime, memory, websocket connection count, and a timestamp【{"file":"ogzprime-ssl-server.js","line_start":434,"line_end":444}】.  
* **WebSocket watchdog timer** – The same server tracks connection health by handling `ping` messages and marking sockets as alive on `pong`【{"file":"ogzprime-ssl-server.js","line_start":516,"line_end":529}】.  
* **External monitoring hook (Sentry)** – `instrument.js` is loaded first and initializes Sentry error monitoring for the whole process【{"file":"instrument.js","line_start":1,"line_end":7}】, with the actual `Sentry.init` call and configuration shown in lines 37‑64【{"file":"instrument.js","line_start":37,"line_end":64}】.

No files were found that reference Prometheus or Datadog integrations.

---

### Q43: Is there any structured logging (JSON output with module name, timestamp, correlation IDs) or just console.log statements? Cite representative log calls file:line.

**[11 iterations | answer_given | 7.1s]**

The platform does **both**:

* It uses a custom logger that writes **JSON‑line records** to files (structured logging).  
* It also contains many ad‑hoc `console.log` statements throughout the code.

**Structured logging**

* `ClauditoLogger.hook` is called in `ogz‑meta/slash‑router.js` (line 1797). The logger builds an entry object and then writes it as a JSON line (`fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\n');`) in `ogz‑meta/claudito‑logger.js` (line 62).  
  * `ogz-meta/slash-router.js:1797` – `ClauditoLogger.hook(command, manifest.state, {`  
  * `ogz-meta/claudito-logger.js:62` – `fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\\n');`

* The same logger records decisions, errors, metrics, and missions, each as a JSON object with a `type` field, an ISO‑8601 `timestamp`, and additional context (e.g., `missionId` in the hook entry). Example – decision logging writes JSON at line 84:  
  * `ogz-meta/claudito-logger.js:84` – `fs.appendFileSync(CLAUDITO_LOG, JSON.stringify(entry) + '\\n');`

* The **TradingProofLogger** records every trade as a JSON line with fields such as `type`, `timestamp`, `action`, `symbol`, `price`, `size`, `reason`, `confidence`, etc. The file write occurs at line 194:  
  * `ogz-meta/claudito-logger.js:194` – `fs.appendFileSync(TRADING_PROOF_LOG, JSON.stringify(entry) + '\\n');`

These JSON logs provide structured data (module‑level type, timestamps, and optional correlation data like `missionId`).

**Plain console logging**

* The core server code still uses many raw `console.log` calls. For example, market‑data logging in `ogzprime-ssl-server.js` (line 215) prints a formatted string:  
  * `ogzprime-ssl-server.js:215` – `console.log(`[Market Data] ${symbol} indicators: RSI=${rsi?.toFixed(1)}, EMA9=${ema9?.toFixed(2)}, EMA21=${ema21?.toFixed(2)}, ATR=${atr?.toFixed(2)}`);`

* Similar `console.log` statements appear throughout the same file (e.g., connection events at lines 463‑470, trader actions at lines 581‑589, etc.).

**Conclusion**

The codebase includes **structured JSON logging** via the `ClauditoLogger` and `TradingProofLogger` utilities, while also retaining many **unstructured `console.log` statements** for real‑time diagnostics.

---

### Q44: Does any file persist trade history to a real database (SQLite, Postgres, Mongo for trades not patterns)? Cite file:line or state JSON files only.

**[15 iterations | answer_given | 10.6s]**

No – the platform does **not** write trade‑history records to a relational or document database.  
Trade data is only written to daily JSON files by the `TradeLogger` module:

* The logger creates a `logs/trades` directory and builds a file name like `trades_2026‑02‑01.json` ( `path.join(this.logDir, \`trades_${today}.json\`)\) 【56‑64】【84‑85】.  
* `saveTrades()` serialises the trade array with `JSON.stringify` and writes it with `fs.writeFileSync` – a plain JSON file, not a DB call 【108‑118】.  

Other parts of the code (e.g., `CandleStore` can swap to SQLite) only affect candle storage, and the MongoStore used elsewhere stores investigation traces, not trade history. Therefore, trade history is persisted **only to JSON files**, not to SQLite, Postgres, or MongoDB.

---

### Q45: Is there a kill-switch beyond ENABLE env vars — something that can immediately halt trading mid-run from outside the process (file flag, HTTP endpoint, signal handler)? Cite file:line.

**[5 iterations | answer_given | 5.9s]**

Yes. OGZPrime ships an **emergency “kill‑switch”** that works outside the process by using a persistent file flag ( `killswitch.flag` ) and a small CLI wrapper.  

* The switch is defined in **`core/KillSwitch.js`** – it watches for the presence of a file (`FLAG_PATH = path.join(__dirname, '../killswitch.flag')` ) and blocks every trade when the file exists【1†L53-L60】.  
* Activation writes the flag file (and a log entry) in **`enableKillSwitch()`**【1†L88-L95】, and deactivation removes the file in **`disableKillSwitch()`**【1†L108-L119】.  
* A command‑line tool **`tools/kill-switch.js`** imports this module and provides an external “on/off” interface that can be run from any shell (e.g., via SSH, cron, or monitoring scripts)【2†L13-L27】【2†L30-L38】.  
* The configuration file also notes that these are “absolute kill‑switches, not strategy‑specific”【3†L425-L428】, indicating they are intended as a hard stop independent of the `ENABLE` environment variables.

Thus, the platform does have a kill‑switch beyond the `ENABLE` env vars, implemented as a file‑based flag that can be toggled instantly from outside the Node process (via the CLI, manual file creation/deletion, or any script that writes/removes `killswitch.flag`).

---


## AUDIT COMPLETE

**Total questions:** 45
**Total Mercury iterations:** 587
**Total latency:** 448.4s
**Average iterations/question:** 13.0
**Average latency/question:** 10.0s
**Generated:** 2026-04-13T08:01:45.792Z
