# CONFIG-TRUTH CENSUS pass0b

Date: 2026-08-17
Agent: Codex
Mode: read-only mechanical redo of pass0a after anchor miss
Supersedes: `ogz-meta/inbox/codex/2026-08-16/config-truth-census-pass0.md` for census coverage. The prior file remains pass0a/high-signal intake.
Owned output: `ogz-meta/inbox/codex/2026-08-17/config-truth-census-pass0b.md`

## Reproducible Universe

Universe command:

```bash
rg --files core modules brokers foundation backtest config run-empire-v2.js | rg '\.(js|json)$' | rg -v '(^|/)(__tests__|test|tests|specs)(/|$)|\.pipeline-backup$'
```

Universe files: 164. Candidate lines: 2361. Bucketed coverage: 2361/2361 candidate lines (100%).

Runtime roots included: `core/`, `modules/`, `brokers/`, `foundation/`, `backtest/`, `config/`, `run-empire-v2.js`. Tests/specs and `*.pipeline-backup` are excluded by command. Public/dashboard/tools/scripts are not in this runtime-surface pass.

## Five Disjoint Buckets

Bucket assignment is first-match wins, in this order, so every candidate line appears in exactly one bucket:

| Bucket | Rule | Count |
| --- | --- | ---: |
| B1_ENV_READ | line reads `process.env` | 101 |
| B2_CONFIG_FALLBACK | config/options/settings expression falls back with `||` or `??` to a literal | 303 |
| B3_DEFAULT_PARAM | function/arrow/method parameter has a literal default | 535 |
| B4_MODULE_CONSTANT | top-level uppercase constant/var has a literal assignment | 83 |
| B5_INLINE_FALLBACK | remaining literal fallback with `||` or `??` | 1339 |

Column meanings: `central-config-owned=Y` only when the line itself is in `foundation/ConfigLoader.js` or `config/`; constructor-local `config.* || literal` is intentionally `N` until a reader proves one-roof ownership. `silent-fallback=Y` means a literal/default can be substituted at that line without this line itself refusing loudly.

## Remediation Doctrine

This census is not a gate request. Runtime must be incapable of being silent, and fixes that come from this ledger follow Fourth Shape discipline:

- If the producer is internal and alive, fix the producer so the silent fallback state cannot be created.
- If the value belongs under config, move ownership to the one config reader or name the missing config key for Trey ruling.
- If the input is a true external boundary, route only that cell with loud evidence; do not stop the bot or fail-close the organism.
- Tests that preserve silent defaults, false market data, or unnecessary gates are not doctrine; they are candidates for rewrite or deletion unless governance explicitly placed them.
- A downstream gate is not the fix when an upstream producer can be repaired.

## Required Anchor Receipts

### IndicatorEngine fallback anchor

| Bucket | file:line | central-config-owned | silent-fallback | code |
| --- | --- | --- | --- | --- |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:51` | N | Y | `smaPeriods: config.smaPeriods \|\| [20, 50, 200],` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:52` | N | Y | `emaPeriods: config.emaPeriods \|\| [20, 50, 200],` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:53` | N | Y | `bbPeriod: config.bbPeriod \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:54` | N | Y | `bbStdDev: config.bbStdDev \|\| 2,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:55` | N | Y | `atrPeriod: config.atrPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:58` | N | Y | `rsiPeriod: config.rsiPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:59` | N | Y | `stochRsiPeriod: config.stochRsiPeriod \|\| 14,` |

### OptimizedIndicators question-default anchor

| Bucket | file:line | central-config-owned | silent-fallback | code |
| --- | --- | --- | --- | --- |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:53` | N | Y | `const RSI_PERIOD_QUESTION_DEFAULT = 14;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:54` | N | Y | `const MACD_FAST_PERIOD_QUESTION_DEFAULT = 12;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:55` | N | Y | `const MACD_SLOW_PERIOD_QUESTION_DEFAULT = 26;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:56` | N | Y | `const MACD_SIGNAL_PERIOD_QUESTION_DEFAULT = 9;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:57` | N | Y | `const VOLATILITY_PERIOD_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:58` | N | Y | `const BOLLINGER_PERIOD_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:59` | N | Y | `const BOLLINGER_STD_DEV_QUESTION_DEFAULT = 2;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:60` | N | Y | `const ATR_PERIOD_QUESTION_DEFAULT = 14;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:61` | N | Y | `const TREND_SHORT_PERIOD_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:62` | N | Y | `const TREND_LONG_PERIOD_QUESTION_DEFAULT = 50;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:63` | N | Y | `const CACHE_SIZE_QUESTION_DEFAULT = 1000;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:64` | N | Y | `const MACD_HISTORY_SIZE_QUESTION_DEFAULT = 50;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:65` | N | Y | `const TWO_POLE_SMA_LENGTH_QUESTION_DEFAULT = 25;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:66` | N | Y | `const TWO_POLE_FILTER_LENGTH_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:67` | N | Y | `const TWO_POLE_UPPER_THRESHOLD_QUESTION_DEFAULT = 0.5;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:68` | N | Y | `const TWO_POLE_LOWER_THRESHOLD_QUESTION_DEFAULT = -0.5;` |

Anchor check: IndicatorEngine rows found: 7. OptimizedIndicators rows found: 16.

## Full Candidate Ledger

| Bucket | file:line | central-config-owned | silent-fallback | code |
| --- | --- | --- | --- | --- |
| B3_DEFAULT_PARAM | `backtest/OptimizedBacktestEngine.js:15` | N | Y | `constructor(tier = 'ml') {` |
| B3_DEFAULT_PARAM | `backtest/OptimizedBacktestEngine.js:175` | N | Y | `const { rsiOversold = 30, rsiOverbought = 70 } = params;` |
| B3_DEFAULT_PARAM | `backtest/OptimizedBacktestEngine.js:211` | N | Y | `const { value, threshold = 0 } = indicators.twoPoleOsc;` |
| B5_INLINE_FALLBACK | `backtest/OptimizedBacktestEngine.js:223` | N | Y | `const volumeMultiplier = params.volumeMultiplier \|\| 2.0;` |
| B1_ENV_READ | `backtest/OptimizedBacktestEngine.js:370` | N | Y | `const tier = process.env.TRADING_TIER \|\| 'ml';` |
| B1_ENV_READ | `backtest/backtest-api.js:31` | N | Y | `const PORT = process.env.BACKTEST_PORT \|\| 3011;` |
| B5_INLINE_FALLBACK | `backtest/backtest-api.js:75` | N | Y | `const priceData = await loadHistoricalData(params.period \|\| '30d');` |
| B3_DEFAULT_PARAM | `backtest/backtest-api.js:113` | N | Y | `async function loadHistoricalData(period = '30d') {` |
| B3_DEFAULT_PARAM | `backtest/backtest-api.js:314` | N | Y | `const { rsiOverbought = 70, rsiOversold = 30 } = params;` |
| B3_DEFAULT_PARAM | `backtest/backtest-api.js:425` | N | Y | `const { paramGrid, baseParams = {} } = req.body;` |
| B5_INLINE_FALLBACK | `backtest/backtest-api.js:457` | N | Y | `const priceData = await loadHistoricalData(baseParams.period \|\| '30d');` |
| B5_INLINE_FALLBACK | `backtest/backtest-api.js:637` | N | Y | `const returns = parseFloat(job.metrics?.totalReturn \|\| job.bestResult?.metrics?.totalReturn \|\| -999);` |
| B4_MODULE_CONSTANT | `brokers/AlpacaAdapter.js:26` | N | Y | `const STREAM_BAR_TIMEFRAME = '1m';` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:29` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/AlpacaAdapter.js:41` | N | Y | `const mode = String(config.mode \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:43` | N | Y | `throw new Error(`[Alpaca] mode must be explicitly set to paper or live, got ${mode \|\| '(missing)'}`);` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:92` | N | Y | `_captureAccountIdentity(accountPayload = {}) {` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:331` | N | Y | `price: parseFloat(order.limit_price \|\| order.filled_avg_price \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:333` | N | Y | `filledAmount: parseFloat(order.filled_qty \|\| 0),` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:346` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:350` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:354` | N | Y | `async _placeOrder(symbol, qty, side, price = null, options = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/AlpacaAdapter.js:361` | N | Y | `time_in_force: options.timeInForce \|\| 'day'` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:387` | N | Y | `price: parseFloat(response.data.limit_price \|\| response.data.filled_avg_price \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:440` | N | Y | `filledAmount: parseFloat(response.data.filled_qty \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:441` | N | Y | `remainingAmount: parseFloat(response.data.qty) - parseFloat(response.data.filled_qty \|\| 0)` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:460` | N | Y | `return response.data \|\| [];` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:485` | N | Y | `bid: parseFloat(snap.latestQuote?.bp \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:486` | N | Y | `ask: parseFloat(snap.latestQuote?.ap \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:487` | N | Y | `last: parseFloat(snap.latestTrade?.p \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:488` | N | Y | `volume: parseFloat(snap.dailyBar?.v \|\| snap.minuteBar?.v \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:496` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:519` | N | Y | `return (response.data.bars \|\| []).map(bar => ({` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:533` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:659` | N | Y | `const trades = [], quotes = [], bars = [];` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:693` | N | Y | `accountIdSource: this.accountIdSource \|\| 'broker',` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:764` | N | Y | `return map[tf] \|\| '1Min';` |
| B5_INLINE_FALLBACK | `brokers/AlpacaAdapter.js:917` | N | Y | `console.error(`[Alpaca] Received bar for unsubscribed symbol ${msg.S \|\| '(missing)'}`);` |
| B3_DEFAULT_PARAM | `brokers/AlpacaAdapter.js:951` | N | Y | `const trades = [], quotes = [], bars = [];` |
| B3_DEFAULT_PARAM | `brokers/BinanceAdapter.js:20` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `brokers/BinanceAdapter.js:209` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/BinanceAdapter.js:213` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/BinanceAdapter.js:217` | N | Y | `async _placeOrder(symbol, side, amount, price, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/BinanceAdapter.js:341` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/BinanceAdapter.js:365` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B3_DEFAULT_PARAM | `brokers/BrokerFactory.js:25` | N | Y | `function createBrokerAdapter(brokerId, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/CMEAdapter.js:20` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/CMEAdapter.js:23` | N | Y | `this.baseUrl = config.baseUrl \|\| 'https://www.cmegroup.com/api';` |
| B2_CONFIG_FALLBACK | `brokers/CMEAdapter.js:25` | N | Y | `this.backend = config.backend \|\| 'interactive-brokers';  // IB connection for orders` |
| B3_DEFAULT_PARAM | `brokers/CMEAdapter.js:84` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/CMEAdapter.js:88` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/CMEAdapter.js:92` | N | Y | `async _placeOrder(symbol, side, amount, price, options = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/CMEAdapter.js:107` | N | Y | `timeInForce: options.timeInForce \|\| 'DAY',` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:163` | N | Y | `bid: parseFloat(data.last \|\| data.bid \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:164` | N | Y | `ask: parseFloat(data.last \|\| data.ask \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:165` | N | Y | `last: parseFloat(data.last \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:166` | N | Y | `volume: parseInt(data.volume \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:167` | N | Y | `openInterest: parseInt(data.openInterest \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/CMEAdapter.js:177` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/CMEAdapter.js:196` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:345` | N | Y | `month: ['', 'F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'][month + 1] \|\| 'Z',` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:424` | N | Y | `return this.contractSpecs.get(symbol)?.tickSize \|\| 0.01;` |
| B5_INLINE_FALLBACK | `brokers/CMEAdapter.js:428` | N | Y | `return this.contractSpecs.get(symbol)?.contractSize \|\| 1;` |
| B3_DEFAULT_PARAM | `brokers/CoinbaseAdapter.js:20` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `brokers/CoinbaseAdapter.js:71` | N | Y | `generateAuthHeaders(method, path, body = '') {` |
| B3_DEFAULT_PARAM | `brokers/CoinbaseAdapter.js:157` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/CoinbaseAdapter.js:182` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/CoinbaseAdapter.js:281` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/CoinbaseAdapter.js:309` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B5_INLINE_FALLBACK | `brokers/CoinbaseAdapter.js:466` | N | Y | `return map[timeframe] \|\| 60;` |
| B1_ENV_READ | `brokers/GeminiAdapter.js:22` | N | Y | `apiKey: config.apiKey \|\| process.env.GEMINI_EXCHANGE_API_KEY,` |
| B1_ENV_READ | `brokers/GeminiAdapter.js:23` | N | Y | `apiSecret: config.apiSecret \|\| process.env.GEMINI_EXCHANGE_API_SECRET,` |
| B1_ENV_READ | `brokers/GeminiAdapter.js:24` | N | Y | `sandbox: config.sandbox \|\| process.env.GEMINI_SANDBOX === 'true' \|\| false,` |
| B3_DEFAULT_PARAM | `brokers/GeminiAdapter.js:53` | N | Y | `_generateAuthHeaders(path, payload = {}) {` |
| B3_DEFAULT_PARAM | `brokers/GeminiAdapter.js:78` | N | Y | `async _request(endpoint, payload = {}) {` |
| B3_DEFAULT_PARAM | `brokers/GeminiAdapter.js:275` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/GeminiAdapter.js:279` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/GeminiAdapter.js:292` | N | Y | `options: options.orderOptions \|\| []` |
| B5_INLINE_FALLBACK | `brokers/GeminiAdapter.js:306` | N | Y | `price: parseFloat(order.price \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/GeminiAdapter.js:341` | N | Y | `avgPrice: parseFloat(order.avg_execution_price \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/GeminiAdapter.js:367` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/GeminiAdapter.js:374` | N | Y | `async getOrderBook(symbol, depth = 10) {` |
| B5_INLINE_FALLBACK | `brokers/GeminiAdapter.js:457` | N | Y | `return minimums[symbol] \|\| 0.001;` |
| B3_DEFAULT_PARAM | `brokers/IBrokerAdapter.js:95` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/IBrokerAdapter.js:107` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/IBrokerAdapter.js:159` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/IBrokerAdapter.js:169` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B3_DEFAULT_PARAM | `brokers/InteractiveBrokersAdapter.js:20` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/InteractiveBrokersAdapter.js:23` | N | Y | `this.baseUrl = config.baseUrl \|\| 'http://localhost:5000';  // IB Gateway REST API` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:108` | N | Y | `USD: parseFloat(summary.totalcashvalue?.value \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:109` | N | Y | `equity: parseFloat(summary.equity?.value \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:110` | N | Y | `buyingPower: parseFloat(summary.buyingpower?.value \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/InteractiveBrokersAdapter.js:160` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/InteractiveBrokersAdapter.js:164` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/InteractiveBrokersAdapter.js:168` | N | Y | `async _placeOrder(symbol, side, amount, price, options = {}) {` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:206` | N | Y | `orderId: response.orders?.[0]?.id \|\| 'pending',` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:244` | N | Y | `filledAmount: parseFloat(response.filledQuantity \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:245` | N | Y | `remainingAmount: parseFloat(response.quantity) - parseFloat(response.filledQuantity \|\| 0)` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:267` | N | Y | `bid: parseFloat(response.bid \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:268` | N | Y | `ask: parseFloat(response.ask \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:269` | N | Y | `last: parseFloat(response.last \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:270` | N | Y | `volume: parseFloat(response.volume \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/InteractiveBrokersAdapter.js:277` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/InteractiveBrokersAdapter.js:308` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:319` | N | Y | `bids: response.bid?.map(b => [b.price, b.size]) \|\| [],` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:320` | N | Y | `asks: response.ask?.map(a => [a.price, a.size]) \|\| []` |
| B5_INLINE_FALLBACK | `brokers/InteractiveBrokersAdapter.js:459` | N | Y | `return map[timeframe] \|\| '1min';` |
| B3_DEFAULT_PARAM | `brokers/KrakenIBrokerAdapter.js:22` | N | Y | `constructor(options = {}) {` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:78` | N | Y | `const reconnectAttempts = (inner && inner.reconnectAttempts) \|\| 0;` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:79` | N | Y | `const lastDataAt = (inner && inner.lastDataAt) \|\| 0;` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:80` | N | Y | `const dataTimeout = (inner && inner.dataTimeout) \|\| 60000;` |
| B3_DEFAULT_PARAM | `brokers/KrakenIBrokerAdapter.js:159` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:172` | N | Y | `status: result.status \|\| 'pending',` |
| B3_DEFAULT_PARAM | `brokers/KrakenIBrokerAdapter.js:177` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:190` | N | Y | `status: result.status \|\| 'pending',` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:219` | N | Y | `const side = String(direction \|\| '').toLowerCase();` |
| B3_DEFAULT_PARAM | `brokers/KrakenIBrokerAdapter.js:296` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:305` | N | Y | `const interval = timeframeToInterval[timeframe] \|\| 1;` |
| B3_DEFAULT_PARAM | `brokers/KrakenIBrokerAdapter.js:311` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:365` | N | Y | `const timeframe = data.timeframe \|\| '1m';` |
| B5_INLINE_FALLBACK | `brokers/KrakenIBrokerAdapter.js:440` | N | Y | `timeframe: data.timeframe \|\| '1m',` |
| B2_CONFIG_FALLBACK | `brokers/KrakenIBrokerAdapter.js:540` | N | Y | `throw new Error(`[KrakenIBroker] ${canonical} has no Kraken REST OHLC pair; broker=${cfg.broker \|\| 'missing'}`);` |
| B3_DEFAULT_PARAM | `brokers/OandaAdapter.js:19` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `brokers/OandaAdapter.js:71` | N | Y | `async _apiCall(method, endpoint, data = null, stream = false) {` |
| B5_INLINE_FALLBACK | `brokers/OandaAdapter.js:121` | N | Y | `size: Math.abs(parseFloat(pos.long?.units \|\| 0) + parseFloat(pos.short?.units \|\| 0)),` |
| B5_INLINE_FALLBACK | `brokers/OandaAdapter.js:122` | N | Y | `side: parseFloat(pos.long?.units \|\| 0) > 0 ? 'long' : 'short',` |
| B5_INLINE_FALLBACK | `brokers/OandaAdapter.js:123` | N | Y | `entryPrice: parseFloat(pos.long?.averagePrice \|\| pos.short?.averagePrice \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/OandaAdapter.js:143` | N | Y | `price: parseFloat(order.priceBound \|\| order.price \|\| 0),` |
| B3_DEFAULT_PARAM | `brokers/OandaAdapter.js:156` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/OandaAdapter.js:160` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/OandaAdapter.js:164` | N | Y | `async _placeOrder(symbol, side, amount, price, options = {}) {` |
| B5_INLINE_FALLBACK | `brokers/OandaAdapter.js:233` | N | Y | `return response.orderUpdateTransaction \|\| {};` |
| B5_INLINE_FALLBACK | `brokers/OandaAdapter.js:246` | N | Y | `filledAmount: parseFloat(response.order.filledUnits \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/OandaAdapter.js:247` | N | Y | `remainingAmount: parseFloat(response.order.units \|\| 0) - parseFloat(response.order.filledUnits \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/OandaAdapter.js:284` | N | Y | `async getCandles(symbol, timeframe = 'M1', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/OandaAdapter.js:307` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B1_ENV_READ | `brokers/SchwabAdapter.js:25` | N | Y | `clientId: config.clientId \|\| process.env.SCHWAB_CLIENT_ID,` |
| B1_ENV_READ | `brokers/SchwabAdapter.js:26` | N | Y | `clientSecret: config.clientSecret \|\| process.env.SCHWAB_CLIENT_SECRET,` |
| B1_ENV_READ | `brokers/SchwabAdapter.js:27` | N | Y | `refreshToken: config.refreshToken \|\| process.env.SCHWAB_REFRESH_TOKEN,` |
| B1_ENV_READ | `brokers/SchwabAdapter.js:28` | N | Y | `accountNumber: config.accountNumber \|\| process.env.SCHWAB_ACCOUNT_NUMBER,` |
| B2_CONFIG_FALLBACK | `brokers/SchwabAdapter.js:29` | N | Y | `sandbox: config.sandbox \|\| false,` |
| B3_DEFAULT_PARAM | `brokers/SchwabAdapter.js:91` | N | Y | `async _request(url, method = 'GET', data = null) {` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:189` | N | Y | `bid: parseFloat(data.bidPrice \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:190` | N | Y | `ask: parseFloat(data.askPrice \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:191` | N | Y | `last: parseFloat(data.lastPrice \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:192` | N | Y | `volume: parseInt(data.totalVolume \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:220` | N | Y | `total: balances.liquidationValue \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:221` | N | Y | `free: balances.availableFunds \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:222` | N | Y | `used: balances.buyingPower \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:225` | N | Y | `total: balances.liquidationValue \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:226` | N | Y | `free: balances.availableFunds \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:227` | N | Y | `used: (balances.liquidationValue \|\| 0) - (balances.availableFunds \|\| 0)` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:243` | N | Y | `const positions = account.securitiesAccount.positions \|\| [];` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:248` | N | Y | `amount: Math.abs(pos.longQuantity \|\| pos.shortQuantity \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:249` | N | Y | `entryPrice: pos.averagePrice \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:250` | N | Y | `currentPrice: pos.marketValue / Math.abs(pos.longQuantity \|\| pos.shortQuantity \|\| 1),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:251` | N | Y | `pnl: pos.currentDayProfitLoss \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:252` | N | Y | `pnlPercent: pos.currentDayProfitLossPercentage \|\| 0` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:273` | N | Y | `price: order.price \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:274` | N | Y | `amount: order.quantity \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:275` | N | Y | `filled: order.filledQuantity \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:276` | N | Y | `remaining: order.remainingQuantity \|\| 0,` |
| B3_DEFAULT_PARAM | `brokers/SchwabAdapter.js:287` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/SchwabAdapter.js:291` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/SchwabAdapter.js:301` | N | Y | `session: options.session \|\| 'NORMAL',` |
| B2_CONFIG_FALLBACK | `brokers/SchwabAdapter.js:302` | N | Y | `duration: options.duration \|\| 'DAY',` |
| B2_CONFIG_FALLBACK | `brokers/SchwabAdapter.js:309` | N | Y | `assetType: options.assetType \|\| 'EQUITY'` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:332` | N | Y | `price: price \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:366` | N | Y | `filled: order.filledQuantity \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:367` | N | Y | `remaining: order.remainingQuantity \|\| 0,` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:368` | N | Y | `avgPrice: order.averagePrice \|\| 0` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:387` | N | Y | `bid: parseFloat(data.bidPrice \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:388` | N | Y | `ask: parseFloat(data.askPrice \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:389` | N | Y | `last: parseFloat(data.lastPrice \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/SchwabAdapter.js:390` | N | Y | `volume: parseInt(data.totalVolume \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/SchwabAdapter.js:398` | N | Y | `async getCandles(symbol, timeframe = '1D', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/SchwabAdapter.js:425` | N | Y | `async getOrderBook(symbol, depth = 10) {` |
| B3_DEFAULT_PARAM | `brokers/SchwabAdapter.js:497` | N | Y | `isTradeableNow(symbol, session = 'regular') {` |
| B3_DEFAULT_PARAM | `brokers/TastyworksAdapter.js:18` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `brokers/TastyworksAdapter.js:175` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/TastyworksAdapter.js:179` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/TastyworksAdapter.js:183` | N | Y | `async _placeOrder(symbol, action, amount, price, options = {}) {` |
| B2_CONFIG_FALLBACK | `brokers/TastyworksAdapter.js:204` | N | Y | `time_in_force: options.timeInForce \|\| 'Day',` |
| B5_INLINE_FALLBACK | `brokers/TastyworksAdapter.js:282` | N | Y | `iv: parseFloat(quote.implied_volatility \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/TastyworksAdapter.js:289` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/TastyworksAdapter.js:313` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B1_ENV_READ | `brokers/UpholdAdapter.js:22` | N | Y | `clientId: config.clientId \|\| process.env.UPHOLD_CLIENT_ID,` |
| B1_ENV_READ | `brokers/UpholdAdapter.js:23` | N | Y | `clientSecret: config.clientSecret \|\| process.env.UPHOLD_CLIENT_SECRET,` |
| B1_ENV_READ | `brokers/UpholdAdapter.js:24` | N | Y | `accessToken: config.accessToken \|\| process.env.UPHOLD_ACCESS_TOKEN,` |
| B2_CONFIG_FALLBACK | `brokers/UpholdAdapter.js:25` | N | Y | `sandbox: config.sandbox \|\| false,` |
| B3_DEFAULT_PARAM | `brokers/UpholdAdapter.js:49` | N | Y | `async _request(endpoint, method = 'GET', data = null) {` |
| B5_INLINE_FALLBACK | `brokers/UpholdAdapter.js:130` | N | Y | `const available = parseFloat(card.available \|\| 0);` |
| B5_INLINE_FALLBACK | `brokers/UpholdAdapter.js:131` | N | Y | `const cardBalance = parseFloat(card.balance \|\| 0);` |
| B3_DEFAULT_PARAM | `brokers/UpholdAdapter.js:188` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `brokers/UpholdAdapter.js:192` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B5_INLINE_FALLBACK | `brokers/UpholdAdapter.js:228` | N | Y | `price: parseFloat(transaction.destination.rate \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/UpholdAdapter.js:252` | N | Y | `filled: parseFloat(transaction.destination.amount \|\| 0),` |
| B5_INLINE_FALLBACK | `brokers/UpholdAdapter.js:254` | N | Y | `avgPrice: parseFloat(transaction.destination.rate \|\| 0)` |
| B3_DEFAULT_PARAM | `brokers/UpholdAdapter.js:281` | N | Y | `async getCandles(symbol, timeframe = '1h', limit = 100) {` |
| B3_DEFAULT_PARAM | `brokers/UpholdAdapter.js:287` | N | Y | `async getOrderBook(symbol, depth = 10) {` |
| B5_INLINE_FALLBACK | `brokers/UpholdAdapter.js:373` | N | Y | `return minimums[symbol] \|\| 1;` |
| B3_DEFAULT_PARAM | `core/AdaptiveTimeframeSelector.js:35` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/AdaptiveTimeframeSelector.js:43` | N | Y | `this.minRewardToRisk = config.minRewardToRisk \|\| 2.0;` |
| B2_CONFIG_FALLBACK | `core/AdaptiveTimeframeSelector.js:58` | N | Y | `this.allowedTimeframes = config.allowedTimeframes \|\| ['5m', '15m', '30m', '1h'];` |
| B2_CONFIG_FALLBACK | `core/AdaptiveTimeframeSelector.js:61` | N | Y | `this.minSwitchIntervalMs = config.minSwitchIntervalMs \|\| 5 * 60 * 1000; // 5 min minimum` |
| B2_CONFIG_FALLBACK | `core/AdaptiveTimeframeSelector.js:65` | N | Y | `this.currentTimeframe = config.defaultTimeframe \|\| '15m';` |
| B5_INLINE_FALLBACK | `core/AdaptiveTimeframeSelector.js:94` | N | Y | `let bestScore = scores[bestTf] \|\| 0;` |
| B5_INLINE_FALLBACK | `core/AdaptiveTimeframeSelector.js:105` | N | Y | `const currentScore = scores[this.currentTimeframe] \|\| 0;` |
| B5_INLINE_FALLBACK | `core/AdaptiveTimeframeSelector.js:130` | N | Y | `score: scores[this.currentTimeframe] \|\| 0,` |
| B5_INLINE_FALLBACK | `core/AdaptiveTimeframeSelector.js:135` | N | Y | `reason: details[this.currentTimeframe]?.reason \|\| 'default',` |
| B5_INLINE_FALLBACK | `core/AdaptiveTimeframeSelector.js:183` | N | Y | `const strength = indicators.trendStrength \|\| 0.5;` |
| B5_INLINE_FALLBACK | `core/AdaptiveTimeframeSelector.js:189` | N | Y | `factors.push(`trend: ${trendScore.toFixed(2)} (${indicators.trend \|\| 'unknown'})`);` |
| B5_INLINE_FALLBACK | `core/AssetConfigManager.js:378` | N | Y | `return this.getConfig(assetType).newsKeywords \|\| [];` |
| B5_INLINE_FALLBACK | `core/AssetConfigManager.js:387` | N | Y | `return this.getConfig(assetType).correlatedPairs \|\| [];` |
| B5_INLINE_FALLBACK | `core/AssetConfigManager.js:396` | N | Y | `return this.getConfig(assetType).symbols \|\| [];` |
| B2_CONFIG_FALLBACK | `core/AssetConfigManager.js:423` | N | Y | `return config.minOrderSize[symbol] \|\| config.minOrderSize.default \|\| 1;` |
| B3_DEFAULT_PARAM | `core/AssetConfigManager.js:457` | N | Y | `isWeekend(timezone = 'UTC') {` |
| B5_INLINE_FALLBACK | `core/AssetConfigManager.js:476` | N | Y | `for (const session of Object.values(hoursConfig.sessions \|\| {})) {` |
| B2_CONFIG_FALLBACK | `core/AssetConfigManager.js:513` | N | Y | `return config.features?.[feature] \|\| false;` |
| B5_INLINE_FALLBACK | `core/AssetConfigManager.js:522` | N | Y | `return this.getConfig(assetType).features \|\| {};` |
| B3_DEFAULT_PARAM | `core/AtomicWrite.js:25` | N | Y | `function writeJsonAtomic(filePath, data, options = {}) {` |
| B3_DEFAULT_PARAM | `core/AtomicWrite.js:47` | N | Y | `function writeStringAtomic(filePath, content, options = {}) {` |
| B5_INLINE_FALLBACK | `core/AuthFailureGuard.js:97` | N | Y | `const prior = this.failuresByBroker.get(broker) \|\| [];` |
| B5_INLINE_FALLBACK | `core/AuthFailureGuard.js:121` | N | Y | `failures: (this.failuresByBroker.get(key) \|\| []).slice(),` |
| B4_MODULE_CONSTANT | `core/BacktestConfigOverrides.js:4` | N | Y | `const CONFIDENCE_OVERRIDE_PATH = 'confidence.minTradeConfidence';` |
| B4_MODULE_CONSTANT | `core/BacktestConfigOverrides.js:5` | N | Y | `const BROKER_TIMEFRAME_OVERRIDE_PATH = 'broker.candleTimeframe';` |
| B4_MODULE_CONSTANT | `core/BacktestConfigOverrides.js:7` | N | Y | `const MTF_SERVICE_MIN_READY_PATH = 'orchestrator.mtfConfluenceService.minReadyTimeframes';` |
| B3_DEFAULT_PARAM | `core/BacktestConfigOverrides.js:41` | N | Y | `function parseBacktestConfigOverrides(raw, options = {}) {` |
| B5_INLINE_FALLBACK | `core/BacktestConfigOverrides.js:51` | N | Y | `String(executionMode \|\| '').toLowerCase() !== 'backtest' \|\|` |
| B5_INLINE_FALLBACK | `core/BacktestConfigOverrides.js:52` | N | Y | `String(candleSource \|\| '').toLowerCase() !== 'file' \|\|` |
| B3_DEFAULT_PARAM | `core/BacktestConfigOverrides.js:121` | N | Y | `function applyBacktestConfigOverrides(raw, options = {}) {` |
| B3_DEFAULT_PARAM | `core/BacktestRecorder.js:74` | N | Y | `static validateTradeScope(trade, caller = 'BacktestRecorder.validateTradeScope') {` |
| B3_DEFAULT_PARAM | `core/BacktestRecorder.js:140` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:170` | N | Y | `const entryPrice = trade.entryPrice \|\| 0;` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:171` | N | Y | `const exitPrice = trade.exitPrice \|\| 0;` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:189` | N | Y | `: (trade.size \|\| trade.sizeUsd \|\| 1);` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:248` | N | Y | `const strategyName = trade.strategyName \|\| trade.winner \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:268` | N | Y | `entryTime: trade.entryTime \|\| trade.entryCandle?.time \|\| '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:269` | N | Y | `exitTime: trade.exitTime \|\| trade.exitCandle?.time \|\| '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:272` | N | Y | `entryPrice: trade.entryPrice \|\| 0,` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:273` | N | Y | `exitPrice: trade.exitPrice \|\| 0,` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:274` | N | Y | `stopLoss: trade.stopLoss \|\| trade.exitContract?.stopLoss \|\| 0,` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:275` | N | Y | `takeProfit: trade.takeProfit \|\| trade.exitContract?.takeProfit \|\| 0,` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:300` | N | Y | `confidence: trade.confidence \|\| 0,` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:301` | N | Y | `exitReason: trade.exitReason \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:320` | N | Y | `reason: trade.reason \|\| '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:321` | N | Y | `holdTimeMinutes: trade.holdTimeMinutes \|\| 0,` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:360` | N | Y | `const weekday = parts.find(p => p.type === 'weekday')?.value \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:361` | N | Y | `const hour = parseInt(parts.find(p => p.type === 'hour')?.value \|\| '0');` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:362` | N | Y | `const minute = parseInt(parts.find(p => p.type === 'minute')?.value \|\| '0');` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:385` | N | Y | `const holdMin = record.holdTimeMinutes \|\| 0;` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:392` | N | Y | `const conf = record.confidence \|\| 0;` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:403` | N | Y | `const er = (record.exitReason \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:410` | N | Y | `else record.exitType = er \|\| 'unknown';` |
| B3_DEFAULT_PARAM | `core/BacktestRecorder.js:432` | N | Y | `exportCSV(filepath = './backtest-trades.csv') {` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:499` | N | Y | `t.positionEffect ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:505` | N | Y | `t.entryOrderQuantity ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:506` | N | Y | `t.entryOrderQuantityUnit ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:507` | N | Y | `t.remainingOrderQuantityBeforeExit ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:508` | N | Y | `t.remainingOrderQuantityUnit ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:509` | N | Y | `t.exitOrderQuantity ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:510` | N | Y | `t.exitOrderQuantityUnit ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:511` | N | Y | `t.closedOrderQuantity ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:512` | N | Y | `t.quantityUnit ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:513` | N | Y | `t.entryFeeQuantity ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:514` | N | Y | `t.exitFeeQuantity ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:525` | N | Y | `t.dayOfWeek ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:526` | N | Y | `t.hourET ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:527` | N | Y | `t.session ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:528` | N | Y | `t.holdBucket ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:529` | N | Y | `t.confidenceTier ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:530` | N | Y | `t.symbol ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:531` | N | Y | `t.brokerId ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:532` | N | Y | `t.accountId ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:533` | N | Y | `t.accountIdSource ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:534` | N | Y | `t.assetClass ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:535` | N | Y | `t.executionMode ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:536` | N | Y | `t.timeframe ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:537` | N | Y | `t.scopeKey ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:538` | N | Y | `t.scopeKeyVersion ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:541` | N | Y | `t.exitType ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:543` | N | Y | `t.regimeAtEntry ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:545` | N | Y | `t.confidenceContributors ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:546` | N | Y | `t.mtfConfluenceSnapshot?.direction ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:547` | N | Y | `t.mtfConfluenceSnapshot?.confluenceScore ?? t.mtfConfluenceSnapshot?.score ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:548` | N | Y | `t.mtfConfluenceSnapshot?.confidence ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:551` | N | Y | `t.partialFraction ?? '',` |
| B5_INLINE_FALLBACK | `core/BacktestRecorder.js:552` | N | Y | `t.frozenExitPolicy?.policyHash ?? ''` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:43` | N | Y | `const match = String(timeframe \|\| '').trim().match(/^(\d+)(sec\|s\|m\|h\|d)$/i);` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:45` | N | Y | `throw new Error(`BacktestRunner: cannot derive candle interval for timeframe '${timeframe \|\| '(missing)'}'`);` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:72` | N | Y | `v: rawCandle.volume ?? rawCandle.v ?? 0,` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:256` | N | Y | `const rate = (processedCount / (elapsed \|\| 1)).toFixed(0);` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:282` | N | Y | `console.error(`[BacktestRunner] BACKTEST_END_CLOSE refused for trade ${tradeId \|\| '<unknown>'}: active_trade_direction_unknown`);` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:344` | N | Y | `const trades = this.ctx.backtestRecorder?.trades \|\| [];` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:348` | N | Y | `const totalPnL = trades.reduce((sum, t) => sum + (t.netPnlDollars \|\| 0), 0);` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:380` | N | Y | `const wins = patternStats.totalWins \|\| 0;` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:381` | N | Y | `const losses = patternStats.totalLosses \|\| 0;` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:385` | N | Y | `console.log(`      📊 Patterns Recorded: ${patternStats.tradeResults \|\| 0}`);` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:389` | N | Y | `console.log(`      🎯 Promoted Patterns: ${patternStats.promoted \|\| 0}`);` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:390` | N | Y | `console.log(`      🔬 Candidates: ${patternStats.candidates \|\| 0}`);` |
| B1_ENV_READ | `core/BacktestRunner.js:397` | N | N | `const envRoot = process.env.BACKTEST_OUTPUT_DIR;` |
| B1_ENV_READ | `core/BacktestRunner.js:398` | N | Y | `const rawReportTag = process.env.BACKTEST_REPORT_TAG \|\| '';` |
| B1_ENV_READ | `core/BacktestRunner.js:410` | N | N | `if (process.env.CANDLE_DATA_FILE) {` |
| B1_ENV_READ | `core/BacktestRunner.js:411` | N | N | `const reportAssetSlug = deriveReportAssetSlugFromDataFile(process.env.CANDLE_DATA_FILE);` |
| B3_DEFAULT_PARAM | `core/BacktestRunner.js:471` | N | Y | `// actual initialBalance differs (e.g., INITIAL_BALANCE=50000).` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:483` | N | Y | `return (_tier ?? 'ML').toUpperCase();` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:499` | N | Y | `console.log('Total Trades: ' + (report.metrics.totalTrades \|\| 'N/A'));` |
| B5_INLINE_FALLBACK | `core/BacktestRunner.js:500` | N | Y | `console.log('Win Rate: ' + (report.metrics.winRate \|\| 'N/A'));` |
| B1_ENV_READ | `core/BacktestRunner.js:531` | N | N | `const csvPath = process.env.BACKTEST_OUTPUT_DIR` |
| B4_MODULE_CONSTANT | `core/BotStateFrame.js:3` | N | Y | `const EASTERN_TIME_ZONE = 'America/New_York';` |
| B4_MODULE_CONSTANT | `core/BotStateFrame.js:4` | N | Y | `const STOCK_OPEN_HOUR = 9;` |
| B4_MODULE_CONSTANT | `core/BotStateFrame.js:5` | N | Y | `const STOCK_OPEN_MINUTE = 30;` |
| B4_MODULE_CONSTANT | `core/BotStateFrame.js:6` | N | Y | `const STOCK_CLOSE_HOUR = 16;` |
| B4_MODULE_CONSTANT | `core/BotStateFrame.js:7` | N | Y | `const STOCK_CLOSE_MINUTE = 0;` |
| B5_INLINE_FALLBACK | `core/BotStateFrame.js:11` | N | Y | `return value === true \|\| value === 1 \|\| String(value \|\| '').toLowerCase() === 'true' \|\| String(value \|\| '') === '1';` |
| B5_INLINE_FALLBACK | `core/BotStateFrame.js:44` | N | Y | `const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second \|\| 0);` |
| B5_INLINE_FALLBACK | `core/BotStateFrame.js:129` | N | Y | `String(env.ASSET_CLASS \|\| '').toLowerCase() === 'stocks' \|\|` |
| B5_INLINE_FALLBACK | `core/BotStateFrame.js:130` | N | Y | `String(env.BROKER \|\| '').toLowerCase() === 'alpaca';` |
| B3_DEFAULT_PARAM | `core/BotStateFrame.js:133` | N | Y | `function buildBotStateFrame(ctx = {}, options = {}) {` |
| B5_INLINE_FALLBACK | `core/BotStateFrame.js:141` | N | Y | `) \|\| 'paper';` |
| B5_INLINE_FALLBACK | `core/CandleAggregator.js:163` | N | Y | `volume += _v(candle) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/CandleAggregator.js:226` | N | Y | `return this.TIMEFRAME_MS[timeframe] \|\| 0;` |
| B5_INLINE_FALLBACK | `core/CandleHelper.js:57` | N | Y | `v: (candle) => candle?.volume ?? candle?.v ?? 0,` |
| B5_INLINE_FALLBACK | `core/CandleHelper.js:76` | N | Y | `volume: candle?.volume ?? candle?.v ?? 0,` |
| B5_INLINE_FALLBACK | `core/CandleHelper.js:85` | N | Y | `_v: (candle) => candle?.volume ?? candle?.v ?? 0,` |
| B3_DEFAULT_PARAM | `core/CandlePatternDetector.js:31` | N | Y | `detect(candles, indicators = {}) {` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:36` | N | Y | `o: candle.o ?? candle.open ?? 0,` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:37` | N | Y | `h: candle.h ?? candle.high ?? 0,` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:38` | N | Y | `l: candle.l ?? candle.low ?? 0,` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:39` | N | Y | `c: candle.c ?? candle.close ?? 0,` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:40` | N | Y | `v: candle.v ?? candle.volume ?? 0,` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:41` | N | Y | `t: candle.t ?? candle.time ?? candle.timestamp ?? 0` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:127` | N | Y | `_range(candle) { return h(candle) - l(candle) \|\| 0.001; }` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:287` | N | Y | `const avgRange = (Math.max(...highs) - Math.min(...lows)) \|\| 1;` |
| B3_DEFAULT_PARAM | `core/CandlePatternDetector.js:291` | N | Y | `let minIdx1 = -1, minIdx2 = -1;` |
| B5_INLINE_FALLBACK | `core/CandlePatternDetector.js:334` | N | Y | `const avgRange = (Math.max(...highs) - Math.min(...lows)) \|\| 1;` |
| B3_DEFAULT_PARAM | `core/CandlePatternDetector.js:337` | N | Y | `let maxIdx1 = -1, maxIdx2 = -1;` |
| B3_DEFAULT_PARAM | `core/CandlePatternDetector.js:566` | N | Y | `_findPeaks(data, minPeaks = 3) {` |
| B3_DEFAULT_PARAM | `core/CandlePatternDetector.js:576` | N | Y | `_findTroughs(data, minTroughs = 3) {` |
| B3_DEFAULT_PARAM | `core/CandlePatternDetector.js:589` | N | Y | `let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:26` | N | Y | `const _o = (candle) => candle?.o ?? candle?.open ?? 0;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:27` | N | Y | `const _h = (candle) => candle?.h ?? candle?.high ?? 0;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:28` | N | Y | `const _l = (candle) => candle?.l ?? candle?.low ?? 0;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:29` | N | Y | `const _c = (candle) => candle?.c ?? candle?.close ?? 0;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:55` | N | Y | `String(raw \|\| '').split(',').forEach(symbol => {` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:148` | N | Y | `_resolveDashboardInt(path, options = {}) {` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:194` | N | Y | `const snapshot = snapshotIndicators \|\| {};` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:195` | N | Y | `const render = renderIndicators \|\| {};` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:250` | N | Y | `frame.symbol \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:251` | N | Y | `frame.timeframe \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:252` | N | Y | `frame.source \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:253` | N | Y | `frame.reason \|\| ''` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:267` | N | Y | `_broadcastErrorEvent(error, context = {}) {` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:292` | N | Y | `frame.symbol \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:293` | N | Y | `frame.timeframe \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:294` | N | Y | `frame.brokerId \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:295` | N | Y | `frame.accountId \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:296` | N | Y | `frame.assetClass \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:297` | N | Y | `frame.executionMode \|\| '',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:298` | N | Y | `frame.traceId \|\| ''` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:300` | N | Y | `const lastSentAt = this.lastErrorEventAtByKey.get(eventKey) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:375` | N | Y | `console.error(`[VIS][CandleProcessor] symbol=${candleSymbol} has no SymbolTradingContext; contexts=${Array.from(map.keys()).join(',') \|\| '(none)'} ctxTradingPair=${tradingPair \|\| '(missing)'}`);` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:387` | N | Y | `throw new Error(`CandleProcessor.processNewCandle: missing candle timeframe for symbol=${candle?.symbol \|\| '(missing)'}`);` |
| B2_CONFIG_FALLBACK | `core/CandleProcessor.js:393` | N | Y | `const config = this.ctx?.config \|\| {};` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:414` | N | Y | `source: source \|\| 'processNewCandle',` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:427` | N | Y | `_attachCandleScope(candle, options = {}) {` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:430` | N | Y | `const source = traceContext.source \|\| candle?.source \|\| 'processNewCandle';` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:484` | N | Y | `_resolveTraceContext(options = {}) {` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:500` | N | Y | `processNewCandle(candle, options = {}) {` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:510` | N | Y | `const message = `CandleProcessor.processNewCandle invalid millisecond timestamp field(s): ${invalidTimestampFields.join(', ')} symbol=${candle?.symbol \|\| '(missing)'} timeframe=${candleTimeframe \|\| '(missing)'}`;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:521` | N | Y | `const updateHistory = shouldUpdateLegacyRoot ? this.ctx.priceHistory : (symCtx?.priceHistory \|\| []);` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:629` | N | Y | `console.log(`[VIS][CandleProcessor] first route candleSymbol=${candle.symbol} selected=${sym} ctxTradingPair=${normalizeCandleSymbol(this.ctx.tradingPair) \|\| '(missing)'} price=${candle.c}`);` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:731` | N | Y | `console.error(`[STALE DATA] market phase contradicts isRTH; treating liveness as active \| broker=${cleanBrokerId \|\| '(missing)'} assetClass=${cleanAssetClass \|\| '(missing)'} phase=${phase.phase} isRTH=${phase.isRTH}`);` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:735` | N | Y | `console.error(`[STALE DATA] market phase contradicts isRTH; treating liveness as active \| broker=${cleanBrokerId \|\| '(missing)'} assetClass=${cleanAssetClass \|\| '(missing)'} phase=${phase.phase} isRTH=${phase.isRTH}`);` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:740` | N | Y | `console.error(`[STALE DATA] market phase missing boolean isRTH; treating liveness as active \| broker=${cleanBrokerId \|\| '(missing)'} assetClass=${cleanAssetClass \|\| '(missing)'} phase=${phase?.phase \|\| '(missing)'}`);` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:762` | N | Y | `async attemptBackfill(gapStart, gapEnd, traceContext = {}) {` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:856` | N | Y | `startBackfillRetry(gapStart, gapEnd, traceContext = {}) {` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:901` | N | Y | `handleBackfillSuccess(candles, traceContext = {}) {` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:920` | N | Y | `this._emitCandleScopeRejected(traceId, replayScope, missingReplayScope, traceOptions.source \|\| 'gap_backfill');` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:927` | N | Y | `source: traceOptions.source \|\| 'gap_backfill',` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:957` | N | Y | `source: traceOptions.source \|\| 'gap_backfill',` |
| B3_DEFAULT_PARAM | `core/CandleProcessor.js:968` | N | Y | `handleMarketData(ohlcInput, traceContext = {}) {` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:985` | N | Y | `throw new Error(`CandleProcessor.handleMarketData: missing candle timeframe for symbol=${stampedSymbol \|\| this.ctx.tradingPair \|\| '(missing)'}`);` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:1190` | N | Y | `const currentPosition = stateManager.get('position') \|\| 0;` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:1193` | N | Y | `// P&L broadcast. Original `\|\| 10000` would silently broadcast a lie` |
| B5_INLINE_FALLBACK | `core/CandleProcessor.js:1204` | N | Y | `const closedTrades = stateManager.get('closedTrades') \|\| [];` |
| B3_DEFAULT_PARAM | `core/CandleStore.js:17` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/CandleStore.js:19` | N | Y | `maxCandles: config.maxCandles \|\| 500,` |
| B2_CONFIG_FALLBACK | `core/CandleStore.js:20` | N | Y | `persist: config.persist \|\| false,` |
| B5_INLINE_FALLBACK | `core/CandleStore.js:234` | N | Y | `return symbolStore.get(timeframe) \|\| [];` |
| B3_DEFAULT_PARAM | `core/CandleStore.js:244` | N | Y | `static create(maxCandles = 500) {` |
| B3_DEFAULT_PARAM | `core/CandleStore.js:252` | N | Y | `static fromArray(symbol, timeframe, candles, config = {}) {` |
| B3_DEFAULT_PARAM | `core/CandleStore.js:274` | N | Y | `loadFromDisk(filePath, symbol, timeframe, maxAgeMs = 4 * 60 * 60 * 1000) {` |
| B3_DEFAULT_PARAM | `core/CandleStore.js:328` | N | Y | `saveToDisk(filePath, symbol, timeframe, maxCandles = 200) {` |
| B3_DEFAULT_PARAM | `core/ContractValidator.js:28` | N | Y | `constructor(options = {}) {` |
| B3_DEFAULT_PARAM | `core/ContractValidator.js:354` | N | Y | `static createMonitor(options = {}) {` |
| B3_DEFAULT_PARAM | `core/ContractValidator.js:365` | N | Y | `static createStrict(options = {}) {` |
| B4_MODULE_CONSTANT | `core/CryptoMarketFeed.js:38` | N | Y | `const KRAKEN_PUBLIC_WS_URL = 'wss://ws.kraken.com';` |
| B4_MODULE_CONSTANT | `core/CryptoMarketFeed.js:39` | N | Y | `const BOOK_DEPTH = 25;` |
| B4_MODULE_CONSTANT | `core/CryptoMarketFeed.js:40` | N | Y | `const WATCHDOG_MS = 60_000;` |
| B4_MODULE_CONSTANT | `core/CryptoMarketFeed.js:41` | N | Y | `const BACKOFF_MIN_MS = 1_000;` |
| B4_MODULE_CONSTANT | `core/CryptoMarketFeed.js:42` | N | Y | `const BACKOFF_MAX_MS = 30_000;` |
| B4_MODULE_CONSTANT | `core/CryptoMarketFeed.js:43` | N | Y | `const NEAR_MID_BAND = 0.02; // walls/imbalance measured within +/-2% of mid` |
| B4_MODULE_CONSTANT | `core/CryptoMarketFeed.js:44` | N | Y | `const TRADE_WINDOW_MS = 5 * 60 * 1000; // buySellRatio rolling window` |
| B1_ENV_READ | `core/CryptoMarketFeed.js:72` | N | Y | `wallMinUsd = Number(process.env.DASHBOARD_WALL_MIN_USD) \|\| 1_000_000,` |
| B1_ENV_READ | `core/CryptoMarketFeed.js:73` | N | Y | `whaleTradeMinUsd = Number(process.env.DASHBOARD_WHALE_TRADE_MIN_USD) \|\| 250_000,` |
| B5_INLINE_FALLBACK | `core/CryptoMarketFeed.js:115` | N | Y | `if (now - (lastDepthEmitAt.get(asset) \|\| 0) < emitIntervalMs) return;` |
| B5_INLINE_FALLBACK | `core/CryptoMarketFeed.js:161` | N | Y | `const recent = (trades.get(asset) \|\| []).filter(t => t.at >= windowStart);` |
| B5_INLINE_FALLBACK | `core/CryptoMarketFeed.js:174` | N | Y | `const list = trades.get(asset) \|\| [];` |
| B5_INLINE_FALLBACK | `core/DashboardBroadcaster.js:30` | N | Y | `const raw = String(symbol \|\| '').trim().toUpperCase();` |
| B5_INLINE_FALLBACK | `core/DashboardBroadcaster.js:36` | N | Y | `const text = String(value \|\| '').trim();` |
| B5_INLINE_FALLBACK | `core/DashboardBroadcaster.js:193` | N | Y | `const source = this._cleanScopeValue(candle?.source \|\| 'candle_processor');` |
| B5_INLINE_FALLBACK | `core/DashboardBroadcaster.js:285` | N | Y | `const avgVolume = priceHistory.slice(-20).reduce((sum, c) => sum + (_v(c) \|\| 0), 0) / 20;` |
| B5_INLINE_FALLBACK | `core/DashboardBroadcaster.js:314` | N | Y | `const spreadPercent = (spread / price) \|\| 0;` |
| B4_MODULE_CONSTANT | `core/DashboardDepthCoalescer.js:3` | N | Y | `const DEFAULT_DASHBOARD_DEPTH_MIN_INTERVAL_MS = 1000;` |
| B1_ENV_READ | `core/DashboardDepthCoalescer.js:5` | N | N | `function resolveDashboardDepthMinIntervalMs(rawValue = process.env.DASHBOARD_DEPTH_MIN_INTERVAL_MS) {` |
| B5_INLINE_FALLBACK | `core/DashboardDepthCoalescer.js:47` | N | Y | `const lastSentAt = this.lastSentAt.get(symbol) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/DashboardDepthCoalescer.js:87` | N | Y | `const lastSentAt = this.lastSentAt.get(symbol) \|\| 0;` |
| B1_ENV_READ | `core/DataFileInstrument.js:14` | N | Y | `const raw = process.env.OGZ_CRYPTO_BASES \|\| 'btc,eth,sol,doge,xrp,ada,ltc,bch,link,avax,matic,dot,shib';` |
| B5_INLINE_FALLBACK | `core/DataFileInstrument.js:22` | N | Y | `...(parallelConfig.stockDataShortcutKeys \|\| []),` |
| B5_INLINE_FALLBACK | `core/DataFileInstrument.js:23` | N | Y | `...(matrixConfig.stockTickers \|\| []),` |
| B1_ENV_READ | `core/DecisionAutopsyLogger.js:8` | N | N | `const AUTOPSY_ENABLED = process.env.DECISION_AUTOPSY_ENABLED !== 'false';` |
| B1_ENV_READ | `core/DecisionAutopsyLogger.js:17` | N | N | `const dir = process.env.DECISION_AUTOPSY_FALLBACK_DIR` |
| B1_ENV_READ | `core/DecisionAutopsyLogger.js:18` | N | N | `? process.env.DECISION_AUTOPSY_FALLBACK_DIR.replace(/\\/g, '/')` |
| B5_INLINE_FALLBACK | `core/DecisionAutopsyLogger.js:36` | N | Y | `const cloned = safeJsonClone(record) \|\| {};` |
| B1_ENV_READ | `core/DecisionLedgerLogger.js:9` | N | Y | `const LEDGER_BUFFER_SIZE = parseInt(process.env.LEDGER_BUFFER_SIZE \|\| '1', 10);` |
| B1_ENV_READ | `core/DecisionLedgerLogger.js:10` | N | N | `const LEDGER_VALIDATE = process.env.LEDGER_VALIDATE !== 'false';` |
| B3_DEFAULT_PARAM | `core/DynamicPositionSizer.js:17` | N | Y | `*                        low vol=1.5x, normal=1.0x, high vol=0.6x` |
| B3_DEFAULT_PARAM | `core/DynamicPositionSizer.js:53` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `core/DynamicPositionSizer.js:59` | N | Y | `?? 0.01; // 1%` |
| B5_INLINE_FALLBACK | `core/DynamicPositionSizer.js:63` | N | Y | `?? 0.05; // 5%` |
| B2_CONFIG_FALLBACK | `core/DynamicPositionSizer.js:112` | N | Y | `this.kellyMinSamples = config.kellyMinSamples ?? 20; // Need 20+ trades for Kelly` |
| B5_INLINE_FALLBACK | `core/DynamicPositionSizer.js:212` | N | Y | `patternStatus = patternResult.status \|\| 'neutral';` |
| B5_INLINE_FALLBACK | `core/DynamicPositionSizer.js:219` | N | Y | `const totalTrades = (patternResult.stats.wins \|\| 0) + (patternResult.stats.losses \|\| 0);` |
| B3_DEFAULT_PARAM | `core/DynamicPositionSizer.js:330` | N | Y | `const { wins = 0, losses = 0, avgWin = 0, avgLoss = 0 } = stats;` |
| B4_MODULE_CONSTANT | `core/DynamicPositionSizer.js:336` | N | Y | `const L = 1 - W;                       // Loss rate` |
| B3_DEFAULT_PARAM | `core/EMACalibrator.js:13` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/EMACalibrator.js:15` | N | Y | `this.periods = config.periods \|\| [20, 30, 50, 75, 100, 150, 200];` |
| B2_CONFIG_FALLBACK | `core/EMACalibrator.js:18` | N | Y | `this.touchThreshold = config.touchThreshold \|\| 0.5;  // 0.5%` |
| B2_CONFIG_FALLBACK | `core/EMACalibrator.js:21` | N | Y | `this.bounceThreshold = config.bounceThreshold \|\| 0.5;  // 0.5% move away` |
| B2_CONFIG_FALLBACK | `core/EMACalibrator.js:22` | N | Y | `this.lookAhead = config.lookAhead \|\| 5;  // candles to check after touch` |
| B5_INLINE_FALLBACK | `core/EMACalibrator.js:198` | N | Y | `const dataPath = process.argv[2] \|\| './data/btc-15m-2024-2025.json';` |
| B4_MODULE_CONSTANT | `core/EnhancedPatternRecognition.js:43` | N | Y | `const USE_OPTIMIZED_INDICATORS_QUESTION_DEFAULT = true;` |
| B4_MODULE_CONSTANT | `core/EnhancedPatternRecognition.js:44` | N | Y | `const FLAT_CANDLE_WICK_RATIO_QUESTION_DEFAULT = 0.5;` |
| B4_MODULE_CONSTANT | `core/EnhancedPatternRecognition.js:45` | N | Y | `const DEFAULT_PATTERN_QUALITY_QUESTION_DEFAULT = 0.3;` |
| B3_DEFAULT_PARAM | `core/EnhancedPatternRecognition.js:150` | N | Y | `static unavailable(reason, details = {}) {` |
| B3_DEFAULT_PARAM | `core/EnhancedPatternRecognition.js:382` | N | Y | `constructor(options = {}) {` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:421` | N | Y | `candles: marketData.candles \|\| [],` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:434` | N | Y | `unavailableFields: features.unavailableFields \|\| [],` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:435` | N | Y | `candleCount: features.candleCount ?? (marketData.candles \|\| []).length,` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:446` | N | Y | `name: result?.bestMatch?.pattern \|\| 'Learning Pattern',` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:447` | N | Y | `confidence: result?.confidence ?? 0,` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:448` | N | Y | `direction: result?.direction \|\| 'neutral',` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:453` | N | Y | `reason: result?.reason \|\| 'New pattern being learned'` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:490` | N | Y | `let decayedSuccessRate = stats.successRate \|\| 0;` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:514` | N | Y | `decayedSuccessRate = (stats.successRate \|\| 0) * Math.max(0.1, decayMultiplier);` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:518` | N | Y | `timesSeen: stats.seenCount \|\| 0,` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:519` | N | Y | `wins: stats.successCount \|\| 0,` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:521` | N | Y | `originalSuccessRate: stats.successRate \|\| 0, // Keep original for comparison` |
| B1_ENV_READ | `core/EnhancedPatternRecognition.js:556` | N | N | `if (process.env.BACKTEST_FAST !== 'true') {` |
| B5_INLINE_FALLBACK | `core/EnhancedPatternRecognition.js:557` | N | Y | `console.log(`Pattern RECORDED: features[${featuresOrSignature.length}], pnl=${result?.pnl?.toFixed(2) \|\| '?'}%, total=${this.stats.tradeResults}`);` |
| B3_DEFAULT_PARAM | `core/EnhancedPatternRecognition.js:589` | N | Y | `evaluatePattern(features, options = {}) {` |
| B3_DEFAULT_PARAM | `core/EnhancedPatternRecognition.js:621` | N | Y | `evaluatePatternFastPath(features, options = {}) {` |
| B3_DEFAULT_PARAM | `core/EnhancedPatternRecognition.js:688` | N | Y | `findSimilarPatterns(features, threshold = 0.8, limit = 5) {` |
| B3_DEFAULT_PARAM | `core/ErrorHandler.js:46` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/ErrorHandler.js:48` | N | Y | `maxErrorsBeforeCircuitBreak: config.maxErrorsBeforeCircuitBreak \|\| 5,` |
| B2_CONFIG_FALLBACK | `core/ErrorHandler.js:49` | N | Y | `circuitBreakResetMs: config.circuitBreakResetMs \|\| 60000, // 1 minute` |
| B3_DEFAULT_PARAM | `core/ErrorHandler.js:63` | N | Y | `reportCritical(moduleName, error, context = {}) {` |
| B3_DEFAULT_PARAM | `core/ErrorHandler.js:97` | N | Y | `reportWarning(moduleName, error, context = {}) {` |
| B5_INLINE_FALLBACK | `core/ErrorHandler.js:108` | N | Y | `const current = this.errorCounts.get(moduleName) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/ErrorHandler.js:121` | N | Y | `const errorCount = this.errorCounts.get(moduleName) \|\| 0;` |
| B2_CONFIG_FALLBACK | `core/EvalRuleEngine.js:7` | N | Y | `this.config = config \|\| {};` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:33` | N | Y | `Object.assign(inputs, marketTimeResult.inputs \|\| {});` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:48` | N | Y | `Object.assign(inputs, earningsResult.inputs \|\| {});` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:63` | N | Y | `Object.assign(inputs, accountLimitsResult.inputs \|\| {});` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:78` | N | Y | `Object.assign(inputs, result.inputs \|\| {});` |
| B2_CONFIG_FALLBACK | `core/EvalRuleEngine.js:110` | N | Y | `const cfg = this.config.ttp?.marketTime \|\| {};` |
| B2_CONFIG_FALLBACK | `core/EvalRuleEngine.js:159` | N | Y | `const cfg = this.config.ttp?.marketTime \|\| {};` |
| B3_DEFAULT_PARAM | `core/EvalRuleEngine.js:216` | N | Y | `_ttpMarketTimeVenueScope(entryPlan = {}) {` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:351` | N | Y | `const observed = Date.parse(`${String(value \|\| '').trim()}T00:00:00.000Z`);` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:352` | N | Y | `const target = Date.parse(`${String(expected \|\| '').trim()}T00:00:00.000Z`);` |
| B2_CONFIG_FALLBACK | `core/EvalRuleEngine.js:385` | N | Y | `const cfg = this.config.ttp?.accountLimits \|\| {};` |
| B2_CONFIG_FALLBACK | `core/EvalRuleEngine.js:492` | N | Y | `const cfg = this.config.ttp?.volumeCap \|\| {};` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:537` | N | Y | `const candles = this.getCandles(entryPlan.symbol, timeframe) \|\| [];` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:540` | N | Y | `return this._fail('TTP_VOLUME_5_PERCENT', referenceResult.reason \|\| 'missing_reference_volume', {` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:552` | N | Y | `const alreadyReservedShares = this.openingVolumeReservations.get(key) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:614` | N | Y | `source: status.source \|\| 'provider.hasEarningsTonight',` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:621` | N | Y | `source: status.source \|\| 'provider.earningsTonight',` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:636` | N | Y | `const statusDate = String(manualStatus.date \|\| '').trim();` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:645` | N | Y | `const targetSymbol = String(symbol \|\| '').trim().toUpperCase();` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:647` | N | Y | `if (String(configuredSymbol \|\| '').trim().toUpperCase() !== targetSymbol) continue;` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:717` | N | Y | `return `${String(symbol \|\| '').trim().toUpperCase()}:${timeMs}`;` |
| B5_INLINE_FALLBACK | `core/EvalRuleEngine.js:721` | N | Y | `const prefix = `${String(symbol \|\| '').trim().toUpperCase()}:`;` |
| B3_DEFAULT_PARAM | `core/EvalRuleEngine.js:731` | N | Y | `_fail(ruleId, reason, inputs = {}) {` |
| B3_DEFAULT_PARAM | `core/EventLoopMonitor.js:11` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/EventLoopMonitor.js:13` | N | Y | `this.warningThreshold = config.warningThreshold \|\| 100;  // 100ms warning` |
| B2_CONFIG_FALLBACK | `core/EventLoopMonitor.js:14` | N | Y | `this.criticalThreshold = config.criticalThreshold \|\| 500; // 500ms critical` |
| B2_CONFIG_FALLBACK | `core/EventLoopMonitor.js:15` | N | Y | `this.checkInterval = config.checkInterval \|\| 1000;        // Check every second` |
| B2_CONFIG_FALLBACK | `core/EventLoopMonitor.js:16` | N | Y | `this.maxHistory = config.maxHistory \|\| 100;` |
| B3_DEFAULT_PARAM | `core/EventLoopMonitor.js:269` | N | Y | `testLag(duration = 1000) {` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:63` | N | Y | `const tradeId = firstNonEmptyString(trade?.id, trade?.orderId) \|\| '<unknown>';` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:111` | N | Y | `const { timeframes, ...runtimeContract } = contract \|\| {};` |
| B3_DEFAULT_PARAM | `core/ExitContractManager.js:274` | N | Y | `getDefaultContract(strategyName, context = {}) {` |
| B3_DEFAULT_PARAM | `core/ExitContractManager.js:335` | N | Y | `checkExitConditions(trade, currentPrice, context = {}) {` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:362` | N | Y | `const contract = trade.exitContract \|\| this.getDefaultContract(trade.entryStrategy \|\| 'default', context);` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:385` | N | Y | `context.indicators \|\| {},` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:392` | N | Y | `details: `${trade.entryStrategy \|\| 'Strategy'} invalidated: ${invalidation.reason}`,` |
| B3_DEFAULT_PARAM | `core/ExitContractManager.js:445` | N | Y | `checkInvalidationConditions(conditions, trade, indicators, context = {}) {` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:525` | N | Y | `const period = positiveIntegerOrNull(trade.exitContract?.rsiPeriod) \|\| 2;` |
| B3_DEFAULT_PARAM | `core/ExitContractManager.js:576` | N | Y | `_checkChannelTrail(contract, trade, currentPrice, context = {}) {` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:611` | N | Y | `details: `${trade.entryStrategy \|\| 'Strategy'} channel trail: current price ${price.toFixed(2)} crossed ${bars}-bar ${isShort ? 'high' : 'low'} ${channelStop.toFixed(2)}`,` |
| B3_DEFAULT_PARAM | `core/ExitContractManager.js:707` | N | Y | `_updateProfitStopState(trade, currentPrice, pnlPercent, context = {}) {` |
| B3_DEFAULT_PARAM | `core/ExitContractManager.js:724` | N | Y | `_updateTrailingStopState(trade, currentPrice, pnlPercent, context = {}) {` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:725` | N | Y | `const contract = trade.exitContract \|\| {};` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:729` | N | Y | `const trailConfig = this.trailConfig \|\| {};` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:739` | N | Y | `const indicators = context.indicators \|\| {};` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:758` | N | Y | `const trend = String(indicators.trend \|\| context.trend \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:837` | N | Y | `const feeBuffer = Math.max(0, finiteOrNull(feeBufferPercent) ?? 0) / 100;` |
| B3_DEFAULT_PARAM | `core/ExitContractManager.js:936` | N | Y | `createExitContract(strategyName, signal = {}, context = {}) {` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:942` | N | Y | `const timeframe = normalizeTimeframeValue(context.timeframe) \|\| '15m';` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:1017` | N | Y | `const volThreshold = ConfigLoader.get('exits.volatilityThreshold') ?? 5.0;` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:1018` | N | Y | `const volSlMult = ConfigLoader.get('exits.volatilitySlMultiplier') ?? 1.15;` |
| B5_INLINE_FALLBACK | `core/ExitContractManager.js:1019` | N | Y | `const volTpMult = ConfigLoader.get('exits.volatilityTpMultiplier') ?? 1.20;` |
| B4_MODULE_CONSTANT | `core/FeatureExtractor.js:19` | N | Y | `const FEATURE_VECTOR_UNAVAILABLE = 'feature_vector_unavailable';` |
| B4_MODULE_CONSTANT | `core/FeatureExtractor.js:25` | N | Y | `const VOLATILITY_PERCENT_CEILING_QUESTION_DEFAULT = 5;` |
| B4_MODULE_CONSTANT | `core/FeatureExtractor.js:26` | N | Y | `const VOLUME_RATIO_CEILING_QUESTION_DEFAULT = 2;` |
| B4_MODULE_CONSTANT | `core/FeatureExtractor.js:27` | N | Y | `const MACD_DELTA_RANGE_QUESTION_DEFAULT = 1000;` |
| B3_DEFAULT_PARAM | `core/FeatureExtractor.js:33` | N | Y | `static unavailable(reason, details = {}) {` |
| B5_INLINE_FALLBACK | `core/FeatureExtractor.js:156` | N | Y | `bb: indicators.bb ?? { percentB: indicators.bbPercentB },` |
| B5_INLINE_FALLBACK | `core/FeatureExtractor.js:173` | N | Y | `bb: indicators.bb ?? { percentB: indicators.bbPercentB },` |
| B5_INLINE_FALLBACK | `core/FeatureExtractor.js:215` | N | Y | `const volumes = candles.slice(-20).map(c => v(c) ?? 0).filter(vol => vol > 0);` |
| B3_DEFAULT_PARAM | `core/FeatureFlagManager.js:61` | N | Y | `constructor(options = {}) {` |
| B1_ENV_READ | `core/FeatureFlagManager.js:68` | N | Y | `this.tier = process.env.TRADING_TIER \|\| 'ml';` |
| B3_DEFAULT_PARAM | `core/FeatureFlagManager.js:86` | N | Y | `static getInstance(options = {}) {` |
| B3_DEFAULT_PARAM | `core/FeatureFlagManager.js:103` | N | Y | `_detectMode(options = {}) {` |
| B5_INLINE_FALLBACK | `core/FeatureFlagManager.js:115` | N | Y | `return data.features \|\| {};` |
| B2_CONFIG_FALLBACK | `core/FeatureFlagManager.js:221` | N | Y | `return feature?.settings \|\| {};` |
| B3_DEFAULT_PARAM | `core/FeeModel.js:32` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/FeeModel.js:33` | N | Y | `const model = String(config.model \|\| 'percent').trim().toLowerCase();` |
| B2_CONFIG_FALLBACK | `core/FeeModel.js:39` | N | Y | `this.makerFee = nonNegativeNumber(config.makerFee ?? 0, 'makerFee');` |
| B2_CONFIG_FALLBACK | `core/FeeModel.js:40` | N | Y | `this.takerFee = nonNegativeNumber(config.takerFee ?? 0, 'takerFee');` |
| B2_CONFIG_FALLBACK | `core/FeeModel.js:45` | N | Y | `this.perShare = nonNegativeNumber(config.perShare ?? 0, 'perShare');` |
| B2_CONFIG_FALLBACK | `core/FeeModel.js:46` | N | Y | `this.minOrderFee = nonNegativeNumber(config.minOrderFee ?? 0, 'minOrderFee');` |
| B3_DEFAULT_PARAM | `core/FeeModel.js:60` | N | Y | `static percent({ makerFee = 0, takerFee = 0, totalRoundTrip = null } = {}) {` |
| B3_DEFAULT_PARAM | `core/FeeModel.js:78` | N | Y | `static feeContextFromTrade(trade = {}) {` |
| B3_DEFAULT_PARAM | `core/FibonacciDetector.js:16` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `core/FibonacciDetector.js:330` | N | Y | `getSuggestion(price, timeframe = 'primary') {` |
| B5_INLINE_FALLBACK | `core/FibonacciDetector.js:352` | N | Y | `const trendLower = (this.state.trend \|\| '').toLowerCase().trim();` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:79` | N | Y | `static calculateRSI(candles, period = 14) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:87` | N | Y | `static calculateWilderRSI(candles, period = 14) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:95` | N | Y | `static calculateWilderRSIFromCloses(closes, period = 14) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:150` | N | Y | `static calculateMACD(candles, fast = 12, slow = 26, signal = 9) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:198` | N | Y | `static calculateBB(candles, period = 20, stdDev = 2) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:240` | N | Y | `static calculateATR(candles, period = 14) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:276` | N | Y | `static calculateWilderATR(candles, period = 14) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:315` | N | Y | `static calculateATRPercent(candles, period = 14) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:365` | N | Y | `static calculateDonchian(candles, period = 20) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:417` | N | Y | `static determineTrend(candles, shortPeriod = 20, longPeriod = 50) {` |
| B3_DEFAULT_PARAM | `core/IndicatorCalculator.js:445` | N | Y | `static calculateVolatility(candles, period = 20) {` |
| B3_DEFAULT_PARAM | `core/KillSwitch.js:88` | N | Y | `enableKillSwitch(reason = 'Manual activation') {` |
| B5_INLINE_FALLBACK | `core/KillSwitch.js:172` | N | Y | `const error = new Error(`KILL SWITCH ACTIVE: ${status.reason \|\| 'Trading blocked'}`);` |
| B3_DEFAULT_PARAM | `core/KrakenAdapterV2.js:53` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `core/KrakenAdapterV2.js:118` | N | Y | `symbol: trade.symbol \|\| 'XBT/USD',` |
| B5_INLINE_FALLBACK | `core/KrakenAdapterV2.js:122` | N | Y | `pnl: trade.pnl \|\| 0` |
| B3_DEFAULT_PARAM | `core/KrakenAdapterV2.js:137` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `core/KrakenAdapterV2.js:170` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `core/KrakenAdapterV2.js:235` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `core/KrakenAdapterV2.js:241` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B3_DEFAULT_PARAM | `core/MAExtensionFilter.js:12` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:14` | N | Y | `this.slopeWindow = config.slopeWindow \|\| 5;           // Bars for slope calc` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:15` | N | Y | `this.slopeTh = config.slopeTh \|\| 0.001;               // Trend slope threshold` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:16` | N | Y | `this.slope200Th = config.slope200Th \|\| 0.0005;        // Sideways 200MA threshold` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:19` | N | Y | `this.extTh = config.extTh \|\| 1.5;                     // Extension threshold` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:20` | N | Y | `this.accelTh = config.accelTh \|\| 0.2;                 // Acceleration threshold` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:21` | N | Y | `this.touchBand = config.touchBand \|\| 0.3;             // Touch band (ATR units)` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:24` | N | Y | `this.skipTimeout = config.skipTimeout \|\| 20;          // Bars before reset` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:25` | N | Y | `this.usePercentBand = config.usePercentBand \|\| false; // Use % instead of ATR` |
| B2_CONFIG_FALLBACK | `core/MAExtensionFilter.js:26` | N | Y | `this.percentBand = config.percentBand \|\| 0.005;       // 0.5% band if no ATR` |
| B3_DEFAULT_PARAM | `core/MAExtensionFilter.js:288` | N | Y | `captureConsolidationZone(lookback = 10) {` |
| B3_DEFAULT_PARAM | `core/MarketRegimeDetector.js:35` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `core/MarketRegimeDetector.js:243` | N | Y | `analyzeMarket(candles, indicators = {}) {` |
| B1_ENV_READ | `core/MarketRegimeDetector.js:278` | N | N | `if (process.env.BACKTEST_VERBOSE && this.updateCount % 500 === 0) {` |
| B5_INLINE_FALLBACK | `core/MarketRegimeDetector.js:281` | N | Y | `console.log(`[DEEP-REGIME] volatility=${this.metrics.volatility?.toFixed(4)\|\|0} thresholds: low=${this.config.lowVolThreshold} high=${this.config.highVolThreshold}`);` |
| B5_INLINE_FALLBACK | `core/MarketRegimeDetector.js:282` | N | Y | `console.log(`[DEEP-REGIME] trendStrength=${this.metrics.trendStrength?.toFixed(4)\|\|0} threshold=${this.config.strongTrendThreshold}`);` |
| B5_INLINE_FALLBACK | `core/MarketRegimeDetector.js:283` | N | Y | `console.log(`[DEEP-REGIME] trendDirection=${this.metrics.trendDirection?.toFixed(4)\|\|0}`);` |
| B5_INLINE_FALLBACK | `core/MarketRegimeDetector.js:284` | N | Y | `console.log(`[DEEP-REGIME] volumeRatio=${this.metrics.volumeRatio?.toFixed(4)\|\|0} pricePos=${this.metrics.pricePosition?.toFixed(4)\|\|0} momentum=${this.metrics.momentum?.toFixed(4)\|\|0}`);` |
| B5_INLINE_FALLBACK | `core/MarketRegimeDetector.js:286` | N | Y | `console.log(`[DEEP-REGIME] confidence=${regimeConfidence?.toFixed(4)\|\|0}`);` |
| B3_DEFAULT_PARAM | `core/MarketRegimeDetector.js:324` | N | Y | `calculateATR(candles, period = 14) {` |
| B3_DEFAULT_PARAM | `core/MarketRegimeDetector.js:387` | N | Y | `calculateSwingTrend(candles, lookback = 10) {` |
| B5_INLINE_FALLBACK | `core/MarketRegimeDetector.js:607` | N | Y | `if (values.length < period) return values[values.length - 1] \|\| 0;` |
| B3_DEFAULT_PARAM | `core/MarketRegimeDetector.js:613` | N | Y | `calculateADX(candles, period = 14) {` |
| B5_INLINE_FALLBACK | `core/MarketRegimeDetector.js:741` | N | Y | `const strength = regimeData?.strength \|\| this.regimeStrength \|\| 0.5;` |
| B3_DEFAULT_PARAM | `core/MemoryManager.js:44` | N | Y | `constructor(maxSize = 1000) {` |
| B3_DEFAULT_PARAM | `core/MemoryManager.js:70` | N | Y | `getLast(n = 1) {` |
| B3_DEFAULT_PARAM | `core/MemoryManager.js:101` | N | Y | `constructor(maxAgeMs = 3600000) { // 1 hour default` |
| B3_DEFAULT_PARAM | `core/MemoryManager.js:170` | N | Y | `constructor(maxSize = 1000, maxAgeMs = 3600000) {` |
| B3_DEFAULT_PARAM | `core/MessageQueue.js:19` | N | Y | `constructor(options = {}) {` |
| B2_CONFIG_FALLBACK | `core/MessageQueue.js:28` | N | Y | `maxQueueSize: options.maxQueueSize \|\| 100,` |
| B2_CONFIG_FALLBACK | `core/MessageQueue.js:29` | N | Y | `minProcessingGapMs: options.minProcessingGapMs \|\| 5,` |
| B2_CONFIG_FALLBACK | `core/MessageQueue.js:30` | N | Y | `staleThresholdMs: options.staleThresholdMs \|\| 5000,` |
| B3_DEFAULT_PARAM | `core/ModuleAutoLoader.js:131` | N | Y | `loadDirectory(dirName, options = {}) {` |
| B3_DEFAULT_PARAM | `core/ModuleAutoLoader.js:268` | N | Y | `validateModules(requirements = {}) {` |
| B5_INLINE_FALLBACK | `core/ModuleInitializer.js:64` | N | Y | `featureFlags: featureFlags.features \|\| {},` |
| B5_INLINE_FALLBACK | `core/ModuleInitializer.js:65` | N | Y | `patternDominance: featureFlags.features?.PATTERN_DOMINANCE?.enabled \|\| false` |
| B1_ENV_READ | `core/MultiAssetManager.js:40` | N | Y | `const activeBroker = (process.env.BROKER \|\| 'kraken').toLowerCase();` |
| B1_ENV_READ | `core/MultiAssetManager.js:47` | N | Y | `const configuredAsset = process.env.TRADING_PAIR \|\| defaultAsset;` |
| B1_ENV_READ | `core/MultiAssetManager.js:52` | N | N | `const configuredBroker = process.env.BROKER ? process.env.BROKER.toLowerCase() : null;` |
| B5_INLINE_FALLBACK | `core/MultiAssetManager.js:203` | N | Y | `const oldConfig = this.getConfig(this.bot._previousAsset \|\| 'BTC-USD');` |
| B5_INLINE_FALLBACK | `core/MultiAssetManager.js:204` | N | Y | `const oldWsPair = oldConfig?.krakenWs \|\| 'XBT/USD';` |
| B2_CONFIG_FALLBACK | `core/MultiAssetManager.js:279` | N | Y | `return price.toFixed(cfg?.decimals \|\| 2);` |
| B2_CONFIG_FALLBACK | `core/MultiAssetManager.js:285` | N | Y | `return cfg?.minOrder \|\| 0.001;` |
| B3_DEFAULT_PARAM | `core/NewsSearchProvider.js:216` | N | Y | `throw new Error(`Bright Data SERP response is not JSON (brd_json=1 expected): ${err.message}`);` |
| B4_MODULE_CONSTANT | `core/NewsSearchProvider.js:288` | N | Y | `const EDGAR_TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;` |
| B4_MODULE_CONSTANT | `core/NewsSearchProvider.js:289` | N | Y | `const EDGAR_SUBMISSIONS_TTL_MS = 15 * 60 * 1000;` |
| B4_MODULE_CONSTANT | `core/NewsSearchProvider.js:290` | N | Y | `const EDGAR_LOOKBACK_DAYS = 90;` |
| B4_MODULE_CONSTANT | `core/NewsSearchProvider.js:369` | N | Y | `const EDGAR_FORM4_CACHE_MAX = 200;` |
| B4_MODULE_CONSTANT | `core/NewsSearchProvider.js:370` | N | Y | `const EDGAR_FORM4_PARSE_PER_CALL = 3;` |
| B5_INLINE_FALLBACK | `core/NewsSearchProvider.js:396` | N | Y | `const txnBlocks = xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/g) \|\| [];` |
| B5_INLINE_FALLBACK | `core/NewsSearchProvider.js:412` | N | Y | `return (b.shares * (b.price \|\| 1)) - (a.shares * (a.price \|\| 1));` |
| B5_INLINE_FALLBACK | `core/NewsSearchProvider.js:485` | N | Y | `const accession = String(recent.accessionNumber[i] \|\| '').replace(/-/g, '');` |
| B5_INLINE_FALLBACK | `core/NewsSearchProvider.js:531` | N | Y | `(EDGAR_INSIDER_FORMS_RE.test(f.form \|\| '') \|\| /^Insider Form 4/.test(f.title) ? insider : rest).push(f);` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:35` | N | Y | `return payload?.symbol \|\| payload?.fields?.symbol \|\| 'UNKNOWN';` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:39` | N | Y | `return payload?.positionEffect \|\| payload?.fields?.positionEffect \|\| 'unknown_effect';` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:43` | N | Y | `const fields = payload?.fields \|\| {};` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:54` | N | Y | `const fields = payload?.fields \|\| {};` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:76` | N | Y | `const reason = fields.exitReason \|\| fields.reason \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:88` | N | Y | `const event = String(payload?.event \|\| '');` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:89` | N | Y | `const fields = payload?.fields \|\| {};` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:91` | N | Y | `const reason = fields.reason \|\| fields.error \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:102` | N | Y | `const event = String(payload?.event \|\| '');` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:103` | N | Y | `const fields = payload?.fields \|\| {};` |
| B5_INLINE_FALLBACK | `core/NtfyTraceNotifier.js:112` | N | Y | `const reason = fields.reason \|\| fields.error \|\| 'unknown';` |
| B4_MODULE_CONSTANT | `core/OgzTpoIntegration.js:41` | N | Y | `const REQUIRED_MODES = ['conservative', 'standard', 'aggressive'];` |
| B4_MODULE_CONSTANT | `core/OgzTpoIntegration.js:42` | N | Y | `const MISSING_TIMESTAMP_BAR = 'missing-timestamp-bar';` |
| B3_DEFAULT_PARAM | `core/OgzTpoIntegration.js:72` | N | Y | `function requireInteger(value, path, options = {}) {` |
| B5_INLINE_FALLBACK | `core/OgzTpoIntegration.js:130` | N | Y | `const mode = String(source.mode \|\| '').trim();` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:34` | N | Y | `const INDICATORS_UNAVAILABLE = 'indicators_unavailable';` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:53` | N | Y | `const RSI_PERIOD_QUESTION_DEFAULT = 14;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:54` | N | Y | `const MACD_FAST_PERIOD_QUESTION_DEFAULT = 12;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:55` | N | Y | `const MACD_SLOW_PERIOD_QUESTION_DEFAULT = 26;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:56` | N | Y | `const MACD_SIGNAL_PERIOD_QUESTION_DEFAULT = 9;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:57` | N | Y | `const VOLATILITY_PERIOD_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:58` | N | Y | `const BOLLINGER_PERIOD_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:59` | N | Y | `const BOLLINGER_STD_DEV_QUESTION_DEFAULT = 2;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:60` | N | Y | `const ATR_PERIOD_QUESTION_DEFAULT = 14;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:61` | N | Y | `const TREND_SHORT_PERIOD_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:62` | N | Y | `const TREND_LONG_PERIOD_QUESTION_DEFAULT = 50;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:63` | N | Y | `const CACHE_SIZE_QUESTION_DEFAULT = 1000;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:64` | N | Y | `const MACD_HISTORY_SIZE_QUESTION_DEFAULT = 50;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:65` | N | Y | `const TWO_POLE_SMA_LENGTH_QUESTION_DEFAULT = 25;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:66` | N | Y | `const TWO_POLE_FILTER_LENGTH_QUESTION_DEFAULT = 20;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:67` | N | Y | `const TWO_POLE_UPPER_THRESHOLD_QUESTION_DEFAULT = 0.5;` |
| B4_MODULE_CONSTANT | `core/OptimizedIndicators.js:68` | N | Y | `const TWO_POLE_LOWER_THRESHOLD_QUESTION_DEFAULT = -0.5;` |
| B3_DEFAULT_PARAM | `core/OptimizedIndicators.js:186` | N | Y | `_indicatorsUnavailable(reason, details = {}) {` |
| B1_ENV_READ | `core/OptimizedIndicators.js:248` | N | N | `const minCandles = process.env.TESTING === 'true' ? 1 : MACD_SLOW_PERIOD_QUESTION_DEFAULT;` |
| B5_INLINE_FALLBACK | `core/OptimizedIndicators.js:520` | N | Y | `console.log(`🔍 [ATR] Entry: priceData.length=${priceData?.length \|\| 0}, period=${period}`);` |
| B5_INLINE_FALLBACK | `core/OptimizedIndicators.js:524` | N | Y | `console.log(`⚠️ [ATR] Insufficient data (need ${period + 1}, have ${priceData?.length \|\| 0})`);` |
| B4_MODULE_CONSTANT | `core/OrderExecutor.js:31` | N | Y | `const DIRECTION_INTEGRITY_EXIT_REFUSAL = 'direction_integrity_exit_refusal';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:57` | N | Y | `const direction = String(trade?.direction \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:58` | N | Y | `const action = String(trade?.action \|\| '').trim().toUpperCase();` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:69` | N | Y | `async _haltDirectionIntegrityExitRefusal({ symbol, reason, traceId, signalId, decisionId, tradeId, action, metadata = {} }) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:135` | N | Y | `async _haltBrokerOrderReconciliationRequired({ symbol, reason, traceId, signalId, decisionId, tradeId = null, action, positionEffect, brokerOrderId = null, brokerName = null, orderAccepted = null, metadata = {} }) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:194` | N | Y | `const traiSignal = traiDecision?.originalSignal \|\| {};` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:201` | N | Y | `&& String(traiDecision.mode \|\| '') !== 'passive'` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:202` | N | Y | `&& String(traiSignal.symbol \|\| '') === String(symbol \|\| '')` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:203` | N | Y | `&& String(traiSignal.action \|\| '').toUpperCase() === String(decision?.action \|\| '').toUpperCase()` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:228` | N | Y | `_recordBacktestTrade(tradeRecord, context = {}) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:246` | N | Y | `console.error(`[BACKTEST-RECORDER] ${symbol \|\| 'UNKNOWN'} trade ${tradeId \|\| 'unknown'} unrecorded/untrusted; manual reconciliation required: ${err.message}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:289` | N | Y | `throw new Error(`[ORDER-PLAN] ${label} active trade ${trade?.orderId \|\| trade?.id \|\| 'missing-id'} missing positive sizeUsd/size; refusing to plan or record a zero-dollar exit`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:293` | N | Y | `const entryIndicators = trade?.entryIndicators \|\| {};` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:295` | N | Y | `const storedIndicators = trade?.indicators \|\| {};` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:359` | N | Y | `const reason = status.reason \|\| 'SessionRouter failed-safe entry block';` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:383` | N | Y | `_runtimeScope(symbol = null, overrides = {}, options = {}) {` |
| B2_CONFIG_FALLBACK | `core/OrderExecutor.js:384` | N | Y | `const cfg = this.ctx.config \|\| {};` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:399` | N | Y | `Object.entries(overrides \|\| {}).filter(([, value]) => value !== undefined && value !== null)` |
| B2_CONFIG_FALLBACK | `core/OrderExecutor.js:404` | N | Y | `const accountId = scoped.accountId \|\| (!routerEnabled ? cfg.accountId : null) \|\| 'default';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:436` | N | Y | `rejectReason: detail \|\| reason \|\| 'symbol cooldown active',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:447` | N | Y | `reason: reason \|\| 'symbol_cooldown',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:459` | N | Y | `reason: reason \|\| 'symbol_cooldown',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:498` | N | Y | `reason: field.reason \|\| 'stale_ttp_operational_data',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:499` | N | Y | `message: field.message \|\| 'Stale TTP operational data is quarantined; trading continues',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:516` | N | Y | `policy: inputs.policy \|\| 'stale_ttp_data_quarantined_trading_continues',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:523` | N | Y | `.map(gate => `${gate.field \|\| 'unknown'}${Number.isFinite(gate.ageDays) ? ` ageDays=${gate.ageDays}` : ''}`)` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:582` | N | Y | `const assetClass = String((scope && scope.assetClass) \|\| this._runtimeScope().assetClass \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:597` | N | Y | `const brokerId = String((scope && scope.brokerId) \|\| this._runtimeScope(scope?.symbol \|\| null).brokerId \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:626` | N | Y | `const normalize = (value) => String(value \|\| '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:638` | N | Y | `_normalizeOrderQuantity(rawQuantity, scope = null, options = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:656` | N | Y | `_orderQuantityFromSizeUsd(sizeUsd, price, scope = null, options = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:754` | N | Y | `_extractWebhookOrderId(result = {}) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:760` | N | Y | `const response = result?.response \|\| {};` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:782` | N | Y | `const symbol = String(orderPlan?.symbol \|\| 'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:783` | N | Y | `const actionKey = String(action \|\| 'ORDER').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:788` | N | Y | `_webhookResponseBody(result = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:793` | N | Y | `_webhookResponseJson(result = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:803` | N | Y | `_isWebhookBrokerFlatResult(action, result = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:810` | N | Y | `_extractWebhookFillProof(action, result = {}) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:812` | N | Y | `const parsed = this._webhookResponseJson(result) \|\| {};` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:823` | N | Y | `\|\| ''` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:872` | N | Y | `return String(symbol \|\| '').trim().toUpperCase().replace('/', '-');` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:892` | N | Y | `_matchingBrokerPositionForExit(exitPlan, positions = []) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:902` | N | Y | `_unparseableBrokerPositionForExit(exitPlan, positions = []) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:950` | N | Y | `venue: exitPlan?.executionVenue \|\| exitPlan?.brokerId \|\| 'broker',` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:976` | N | Y | `_matchingOpenExitOrderForIntent(exitPlan, pendingExitIntent, orders = []) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:993` | N | Y | `_unmatchableOpenExitOrderForIntent(exitPlan, pendingExitIntent, orders = []) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1028` | N | Y | `if (targetBroker && String(brokerName \|\| '').trim().toLowerCase() !== targetBroker.trim().toLowerCase()) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1041` | N | Y | `errors.push(`${brokerName}:${err?.message \|\| 'open_order_read_failed'}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1050` | N | Y | `error: errors[0] \|\| 'no_open_order_reader_for_exit_broker',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1088` | N | Y | `released = { success: false, released: false, reason: err?.message \|\| 'release_exception' };` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1090` | N | Y | `const releaseReason = released?.reason \|\| released?.error \|\| 'release_unknown';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1106` | N | Y | `const logLine = `[EXECUTION-FILL] ${ok ? 'Released' : 'Failed to release'} exit intent ${intentId} for ${exitPlan.symbol} reason=${reason} ageMs=${ageMs ?? 'unknown'} origin=${JSON.stringify(origin)}`;` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1154` | N | Y | `console.error(`[EXECUTION-FILL] ${haltReason} ageMs=${ageMs ?? 'unknown'} origin=${JSON.stringify(origin)}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1220` | N | Y | `reason: openOrderState.error \|\| 'open_order_reconciliation_unavailable',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1240` | N | Y | `reason: openOrderState.error \|\| 'open_order_reconciliation_unavailable',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1243` | N | Y | `return { released: false, reason: openOrderState.error \|\| 'open_order_reconciliation_unavailable', ageMs };` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:1266` | N | Y | `async reconcilePersistedExitIntents(context = {}) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1283` | N | Y | `signalId: context.signalId \|\| 'startup_exit_intent_reconcile',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1284` | N | Y | `decisionId: context.decisionId \|\| 'startup',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1302` | N | Y | `signalId: context.signalId \|\| 'startup_exit_intent_reconcile',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1303` | N | Y | `decisionId: context.decisionId \|\| 'startup',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1343` | N | Y | `return { available: false, positions: [], matchingPosition: null, error: err.message \|\| 'broker_position_read_failed' };` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1574` | N | Y | `const contract = entryPlan.exitContract \|\| {};` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:1707` | N | Y | `_dashboardTradePayload(payload, trade = {}) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1716` | N | Y | `throw new Error(`dashboard trade symbol mismatch orderId=${orderIdForMismatch \|\| 'unknown'} payload=${payloadSymbol} trade=${tradeSymbol}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1722` | N | Y | `const accountId = trade.accountId \|\| runtimeScope.accountId \|\| 'default';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1769` | N | Y | `console.warn(`[OrderExecutor] dashboard ${frame?.type \|\| 'unknown'} broadcast skipped: socket missing`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1774` | N | Y | `console.warn(`[OrderExecutor] dashboard ${frame?.type \|\| 'unknown'} broadcast skipped: socket not open readyState=${ws.readyState}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1782` | N | Y | `console.error(`[OrderExecutor] dashboard ${frame?.type \|\| 'unknown'} broadcast failed: ${err.message}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1811` | N | Y | `console.log(`Pattern learning skipped: ${patternName \|\| 'missing-pattern-name'} -> ${pnl.toFixed(2)}% (no entry features)`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1831` | N | Y | `this.patternOutcomeRejectedSinceHealth = (this.patternOutcomeRejectedSinceHealth \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1832` | N | Y | `console.warn(`[PATTERN][OUTCOME] skipped pattern=${patternName \|\| 'missing-pattern-name'} tradeId=${trade.orderId \|\| trade.id} missing=${missing.join(',')}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1853` | N | Y | `this.patternOutcomeRejectedSinceHealth = (this.patternOutcomeRejectedSinceHealth \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1854` | N | Y | `console.error(`[PATTERN][OUTCOME] recordPatternResult rejected pattern=${patternName \|\| 'missing-pattern-name'} tradeId=${trade.orderId \|\| trade.id} scopeKey=${trade.scopeKey}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1857` | N | Y | `console.log(`Pattern learning: ${patternName \|\| 'missing-pattern-name'} -> ${outcomePnl.toFixed(2)}%`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1862` | N | Y | `this.tradeExitCount = (this.tradeExitCount \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:1863` | N | Y | `const rejectedSinceHealth = this.patternOutcomeRejectedSinceHealth \|\| 0;` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:1896` | N | Y | `_broadcastDashboardTrade(payload, trade = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:1905` | N | Y | `_broadcastBrokerOrderResult(baseFields, result = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:2288` | N | Y | `_buildEntryPlan({ decision, symbol, price, positionSize, currentBalance, currentEquity, tradeConfidence, confidenceMultiplier, orchResult, entryVolatility, absoluteCapPercent, forceWholeShares = false }) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2292` | N | Y | `const sizingMultiplier = orchResult?.sizingMultiplier ?? 1.0;` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2401` | N | Y | `console.error(`[ORDER-PLAN] Refusing ${decision.action} ${symbol}: requested tradeId=${decision.tradeId} matched no open ${openAction} trade; candidates=${candidateTradeIds.join(',') \|\| 'none'}`);` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:2407` | N | Y | `_buildExitPlan({ decision, symbol, price, forceWholeShares = false }) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2416` | N | Y | `accountId: trade.accountId \|\| 'default',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2430` | N | Y | `throw new Error(`[ORDER-PLAN] active trade ${trade.orderId \|\| trade.id \|\| 'unknown'} missing immutable scope field(s): ${missingStoredScope.join(', ')} - refusing to plan exit against current SessionRouter scope`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2436` | N | Y | `throw new Error(`[ORDER-PLAN] exitFraction must be finite and inside (0,1] for ${trade.orderId \|\| trade.id \|\| 'unknown'}; got ${JSON.stringify(decision.exitFraction)}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2441` | N | Y | `throw new Error(`[ORDER-PLAN] active trade ${trade.orderId \|\| trade.id \|\| 'unknown'} missing remainingOrderQuantity; refusing to recalc live exit quantity from current price`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2445` | N | Y | `throw new Error(`[ORDER-PLAN] active trade ${trade.orderId \|\| trade.id \|\| 'unknown'} missing stored quantity unit; refusing to infer from current route`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2449` | N | Y | `throw new Error(`[ORDER-PLAN] active trade ${trade.orderId \|\| trade.id \|\| 'unknown'} quantity unit mismatch: stored=${remainingOrderQuantityUnit} planned=${quantityUnit}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2480` | N | Y | `throw new Error(`[ORDER-PLAN] active trade ${trade.orderId \|\| trade.id \|\| 'unknown'} planned non-positive exit quantity ${orderQuantity} from remaining=${remainingOrderQuantity} fraction=${exitFraction}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2579` | N | Y | `return result \|\| { allowed: true };` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:2585` | N | Y | `_emitWebhookOrderWithResult(action, signal, traceFields = {}) {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2618` | N | Y | `console.warn(`[WebhookOrder] ${action} blocked before emit: expected webhook action ${expectedWebhookAction}, got ${signal?.action \|\| 'missing'}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2654` | N | Y | `const normalizedResult = result \|\| { sent: false, reason: 'missing_webhook_result' };` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:2689` | N | Y | `_emitWebhookOrder(action, signal, traceFields = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:2774` | N | Y | `const executionReturn = (success, details = {}) => ({` |
| B3_DEFAULT_PARAM | `core/OrderExecutor.js:2793` | N | Y | `const blockedReturn = (reason, details = {}) => executionReturn(false, { reason, ...details });` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2822` | N | Y | `const pauseReason = stateManager.get('pauseReason') \|\| stateManager.get('lastError') \|\| 'StateManager.isTrading=false';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2842` | N | Y | `reason: brokerVerificationBlock.code \|\| 'broker_unverifiable',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2847` | N | Y | `return blockedReturn(brokerVerificationBlock.code \|\| 'broker_unverifiable', {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2860` | N | Y | `const blockReason = symbolHaltCode \|\| 'halted';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2877` | N | Y | `console.error(`[ENTRY] Refusing ${decision.action} for ${symbol}: same-symbol hedge blocked existing=${hedgeBlock.existingDirection} trade=${hedgeBlock.existingTradeId \|\| 'unknown'} next=${hedgeBlock.nextDirection}`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2905` | N | Y | `// equity is reserved in open trades. The old `\|\| 10000` upgraded that to` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:2922` | N | Y | `// CRIT-02: Phantom 50% confidence. Previously trailing `\|\| 0.5` upgraded` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3052` | N | Y | `const blockReason = entryPlan.stockShareRangeBlockReason \|\| 'non_positive_order_quantity';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3126` | N | Y | `passedRules: gateResult?.passedRules \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3133` | N | Y | `: (gateResult.reason \|\| 'pre_order_entry_gate');` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3225` | N | Y | `const reason = reservationBlockOverride?.reason \|\| reserved?.reason \|\| reserved?.error \|\| 'exit_intent_not_reserved';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3240` | N | Y | `return blockedReturn(reservationBlockOverride?.reason \|\| 'exit_intent_not_reserved', {` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3290` | N | Y | `const webhookReason = webhookResult?.reason \|\| 'not_sent';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3357` | N | Y | `reason: reconciled?.error \|\| 'broker_flat_reconcile_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3529` | N | Y | `const knownRejectReason = orderResult.reason \|\| orderResult.error \|\| 'broker_order_rejected';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3690` | N | Y | `confidence: p.confidence \|\| 0,` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3691` | N | Y | `features: this._normalizePatternFeatureVector(p.features) \|\| []  // CRITICAL: Required for pattern learning!` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3692` | N | Y | `})) \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3740` | N | Y | `console.warn(`[TRAI] Skipped async observer decision learning for orderId: ${unifiedResult.orderId \|\| 'unknown'} until order correlation is explicit`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3798` | N | Y | `patterns: patterns \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3802` | N | Y | `bullishScore: orchResult?.bullishScore ?? 0,` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3803` | N | Y | `bearishScore: orchResult?.bearishScore \|\| 0,` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3804` | N | Y | `reasoning: orchResult?.reasoning \|\| '',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3813` | N | Y | `riskGates: entryPlan.riskGates \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3851` | N | Y | `reason: positionResult.error \|\| 'state_open_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3877` | N | Y | `detail: positionResult.error \|\| 'state_open_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3961` | N | Y | `patterns: patterns \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:3987` | N | Y | `}, openedTrade \|\| { orderId: unifiedResult.orderId, symbol });` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4012` | N | Y | `reason: unifiedResult.patterns?.map(p => p.name).join(' + ') \|\| 'Signal-based entry',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4066` | N | Y | `patterns: patterns \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4070` | N | Y | `bullishScore: orchResult?.bullishScore ?? 0,` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4071` | N | Y | `bearishScore: orchResult?.bearishScore \|\| 0,` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4072` | N | Y | `reasoning: orchResult?.reasoning \|\| '',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4081` | N | Y | `riskGates: entryPlan.riskGates \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4118` | N | Y | `reason: positionResult.error \|\| 'state_open_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4144` | N | Y | `detail: positionResult.error \|\| 'state_open_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4222` | N | Y | `patterns: patterns \|\| [],` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4246` | N | Y | `}, openedTrade \|\| { orderId: unifiedResult.orderId, symbol });` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4271` | N | Y | `reason: unifiedResult.patterns?.map(p => p.name).join(' + ') \|\| 'Signal-based short entry',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4344` | N | Y | `const stateExitFraction = executedExitPlan?.stateExitFraction ?? 1;` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4469` | N | Y | `const loggedStrategy = this._firstNonEmptyString(buyTrade.entryStrategy, buyTrade.strategy) ?? 'missing';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4471` | N | Y | `const loggedExitReason = this._firstNonEmptyString(completeTradeResult.exitReason) ?? 'missing';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4503` | N | Y | `reason: closeResult.error \|\| 'state_close_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4533` | N | Y | `detail: closeResult.error \|\| 'state_close_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4695` | N | Y | ``RSI at exit: ${indicators.rsi?.toFixed(1) \|\| 'N/A'}`` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:4980` | N | Y | `const coverStateExitFraction = executedExitPlan?.stateExitFraction ?? 1;` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5098` | N | Y | `const loggedStrategy = this._firstNonEmptyString(shortTrade.entryStrategy, shortTrade.strategy) ?? 'missing';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5099` | N | Y | `const loggedExitReason = this._firstNonEmptyString(completeTradeResult.exitReason) ?? 'missing';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5130` | N | Y | `reason: closeResult.error \|\| 'state_close_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5160` | N | Y | `detail: closeResult.error \|\| 'state_close_failed',` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5490` | N | Y | `console.log(`${decision.action} executed: ${tradeResult.orderId \|\| 'SIMULATED'} \| Size: $${(tradeResult.amount ?? positionSize).toFixed(2)}\n`);` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5508` | N | Y | `const blockReason = tradeResult?.reason \|\| 'trade_result_not_successful_without_reason';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5514` | N | Y | `const releaseReason = released?.reason \|\| released?.error \|\| 'release_failed';` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5549` | N | Y | `stateMutationSucceeded: tradeResult?.stateMutationSucceeded ?? false,` |
| B5_INLINE_FALLBACK | `core/OrderExecutor.js:5558` | N | Y | `reason: error?.message \|\| 'post_broker_order_state_exception',` |
| B5_INLINE_FALLBACK | `core/OrderRouter.js:101` | N | Y | `const raw = String(symbol \|\| '').trim();` |
| B3_DEFAULT_PARAM | `core/OrderRouter.js:135` | N | Y | `const { symbol, side, amount, type = 'market', price, options = {}, traceId, signalId, decisionId } = order;` |
| B3_DEFAULT_PARAM | `core/OrderRouter.js:196` | N | Y | `async getAllPositions(options = {}) {` |
| B3_DEFAULT_PARAM | `core/OrderRouter.js:237` | N | Y | `async cancelAllOpenOrders(options = {}) {` |
| B5_INLINE_FALLBACK | `core/OrderRouter.js:260` | N | Y | `for (const order of orders \|\| []) {` |
| B5_INLINE_FALLBACK | `core/OrderRouter.js:315` | N | Y | `return String(name \|\| '').trim().toLowerCase();` |
| B3_DEFAULT_PARAM | `core/OrderRouter.js:318` | N | Y | `getBrokerNamesByAssetType(assetTypes = []) {` |
| B5_INLINE_FALLBACK | `core/OrderRouter.js:320` | N | Y | `.map(type => String(type \|\| '').trim().toLowerCase())` |
| B5_INLINE_FALLBACK | `core/OrderRouter.js:327` | N | Y | `? String(adapter.getAssetType() \|\| '').trim().toLowerCase()` |
| B1_ENV_READ | `core/OutputPaths.js:12` | N | N | `const envRoot = process.env.BACKTEST_OUTPUT_DIR;` |
| B1_ENV_READ | `core/OutputPaths.js:36` | N | N | `const envRoot = process.env.BACKTEST_OUTPUT_DIR;` |
| B1_ENV_READ | `core/OutputPaths.js:48` | N | N | `const envRoot = process.env.BACKTEST_OUTPUT_DIR;` |
| B1_ENV_READ | `core/OutputPaths.js:61` | N | N | `const envRoot = process.env.BACKTEST_OUTPUT_DIR;` |
| B3_DEFAULT_PARAM | `core/PIDController.js:36` | N | Y | `constructor(name, config = {}) {` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:38` | N | Y | `this.Kp = config.Kp \|\| 0.3;          // Proportional gain` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:39` | N | Y | `this.Ki = config.Ki \|\| 0.05;         // Integral gain` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:40` | N | Y | `this.Kd = config.Kd \|\| 0.1;          // Derivative gain` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:41` | N | Y | `this.setpoint = config.setpoint \|\| 0;` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:42` | N | Y | `this.integralMax = config.integralMax \|\| 5.0;` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:43` | N | Y | `this.outputMin = config.outputMin \|\| 0.3;` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:44` | N | Y | `this.outputMax = config.outputMax \|\| 2.0;` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:45` | N | Y | `this.rateLimit = config.rateLimit \|\| 0.10; // max 10% change per cycle` |
| B3_DEFAULT_PARAM | `core/PIDController.js:125` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:126` | N | Y | `this.enabled = config.enabled ?? ConfigLoader.get('pid.enabled') ?? true;` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:127` | N | Y | `this.updateInterval = config.updateInterval \|\| ConfigLoader.get('pid.updateInterval') \|\| 10;` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:128` | N | Y | `this.warmupTrades = config.warmupTrades \|\| ConfigLoader.get('pid.warmupTrades') \|\| 50;` |
| B5_INLINE_FALLBACK | `core/PIDController.js:135` | N | Y | `Kp: ConfigLoader.get('pid.positionKp') \|\| 0.30,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:136` | N | Y | `Ki: ConfigLoader.get('pid.positionKi') \|\| 0.05,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:137` | N | Y | `Kd: ConfigLoader.get('pid.positionKd') \|\| 0.10,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:138` | N | Y | `setpoint: ConfigLoader.get('pid.targetEquitySlope') \|\| 0.005,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:151` | N | Y | `Kp: ConfigLoader.get('pid.regimeKp') \|\| 0.02,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:152` | N | Y | `Ki: ConfigLoader.get('pid.regimeKi') \|\| 0.005,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:153` | N | Y | `Kd: ConfigLoader.get('pid.regimeKd') \|\| 0.01,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:165` | N | Y | `Kp: ConfigLoader.get('pid.trailKp') \|\| 0.15,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:166` | N | Y | `Ki: ConfigLoader.get('pid.trailKi') \|\| 0.03,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:167` | N | Y | `Kd: ConfigLoader.get('pid.trailKd') \|\| 0.05,` |
| B5_INLINE_FALLBACK | `core/PIDController.js:168` | N | Y | `setpoint: ConfigLoader.get('pid.targetMFERatio') \|\| 0.60,` |
| B2_CONFIG_FALLBACK | `core/PIDController.js:177` | N | Y | `this.windowSize = config.windowSize \|\| ConfigLoader.get('pid.windowSize') \|\| 20;` |
| B5_INLINE_FALLBACK | `core/PIDController.js:235` | N | Y | `(s, t) => s + (t.netPnlDollars \|\| 0), 0` |
| B5_INLINE_FALLBACK | `core/PIDController.js:246` | N | Y | `const peak = t.maxProfitPercent \|\| t.maxFavorableExcursion \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PIDController.js:247` | N | Y | `const actual = t.netPnlPercent \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PIDController.js:272` | N | Y | `sum += t.netPnlDollars \|\| 0;` |
| B3_DEFAULT_PARAM | `core/PIDController.js:280` | N | Y | `let num = 0, den = 0;` |
| B5_INLINE_FALLBACK | `core/PIDController.js:305` | N | Y | `return this.outputs.regimeBoosts[strategyName] \|\| 1.0;` |
| B3_DEFAULT_PARAM | `core/PatternBasedExitModel.js:16` | N | Y | `constructor(options = {}) {` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:19` | N | Y | `minPatternExitConfidence: options.minPatternExitConfidence \|\| 0.60,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:20` | N | Y | `minReversalConfidence: options.minReversalConfidence \|\| 0.65,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:24` | N | Y | `targetConfidenceWeight: options.targetConfidenceWeight \|\| 0.3,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:25` | N | Y | `minTargetAdjustment: options.minTargetAdjustment \|\| 0.8,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:26` | N | Y | `maxTargetAdjustment: options.maxTargetAdjustment \|\| 1.5,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:30` | N | Y | `stopConfidenceWeight: options.stopConfidenceWeight \|\| 0.25,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:31` | N | Y | `minStopAdjustment: options.minStopAdjustment \|\| 0.7,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:32` | N | Y | `maxStopAdjustment: options.maxStopAdjustment \|\| 1.3,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:36` | N | Y | `patternTrailWeight: options.patternTrailWeight \|\| 0.2,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:45` | N | Y | `reversalExitPercent: options.reversalExitPercent \|\| 0.5,` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:49` | N | Y | `exhaustionThreshold: options.exhaustionThreshold \|\| 0.7,` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:105` | N | Y | `direction: position.direction?.toLowerCase() \|\| 'buy',` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:107` | N | Y | `size: position.size \|\| 1,` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:108` | N | Y | `entryPatterns: position.patterns \|\| [],` |
| B2_CONFIG_FALLBACK | `core/PatternBasedExitModel.js:228` | N | Y | `const regimeMultiplier = this.config.regimeExitMultipliers[regime] \|\| 1.0;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:274` | N | Y | `const avgGain = stats.avgPnL \|\| stats.averageGain \|\| 0.01;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:275` | N | Y | `const winRate = stats.winRate \|\| (stats.wins / stats.timesSeen) \|\| 0.5;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:276` | N | Y | `const occurrences = stats.timesSeen \|\| stats.occurrences \|\| 1;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:305` | N | Y | `const maxDrawdown = stats.maxDrawdown \|\| stats.avgDrawdown \|\| 0.015;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:306` | N | Y | `const winRate = stats.winRate \|\| 0.5;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:307` | N | Y | `const occurrences = stats.timesSeen \|\| 1;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:341` | N | Y | `const patternType = (pattern.type \|\| pattern.name \|\| '').toLowerCase().replace(/\s+/g, '_');` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:344` | N | Y | `const confidence = pattern.confidence \|\| pattern.stats?.winRate \|\| 0.6;` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:477` | N | Y | `const patternType = (pattern.type \|\| pattern.name \|\| '').toLowerCase().replace(/\s+/g, '_');` |
| B3_DEFAULT_PARAM | `core/PatternBasedExitModel.js:543` | N | Y | `stopTracking(result = {}) {` |
| B5_INLINE_FALLBACK | `core/PatternBasedExitModel.js:545` | N | Y | `console.log(`[PatternBasedExitModel] Exit tracking stopped. P&L: ${(result.pnl \|\| 0).toFixed(2)}`);` |
| B3_DEFAULT_PARAM | `core/PatternMaturity.js:17` | N | Y | `function resolvePatternSampleCount(pattern = {}, stats = null) {` |
| B3_DEFAULT_PARAM | `core/PatternMaturity.js:44` | N | Y | `function maturityFromSamples(sampleCount, timestamps = {}, now = Date.now()) {` |
| B3_DEFAULT_PARAM | `core/PatternMaturity.js:61` | N | Y | `function resolvePatternMaturity(pattern = {}, stats = null, now = Date.now()) {` |
| B3_DEFAULT_PARAM | `core/PatternMemoryBank.js:159` | N | Y | `function resolveInitialMode(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/PatternMemoryBank.js:160` | N | Y | `const explicitMode = String(config.mode \|\| config.executionMode \|\| '').trim().toLowerCase();` |
| B3_DEFAULT_PARAM | `core/PatternMemoryBank.js:167` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/PatternMemoryBank.js:170` | N | Y | `const featureFlags = config.featureFlags \|\| {};` |
| B2_CONFIG_FALLBACK | `core/PatternMemoryBank.js:171` | N | Y | `const partitionSettings = featureFlags.PATTERN_MEMORY_PARTITION?.settings \|\| {};` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:177` | N | Y | `error.missingFields = constructorScope.missingFields \|\| [];` |
| B1_ENV_READ | `core/PatternMemoryBank.js:183` | N | Y | `const dataDir = process.env.DATA_DIR \|\| path.join(__dirname, '..');` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:233` | N | Y | `counts[record.status] = (counts[record.status] \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:341` | N | Y | `let patterns = data.patterns \|\| {};` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:344` | N | Y | `for (const [hash, record] of Object.entries(data.successfulPatterns \|\| {})) {` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:347` | N | Y | `for (const [hash, record] of Object.entries(data.failedPatterns \|\| {})) {` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:366` | N | Y | `for (const [hash, record] of Object.entries(patterns \|\| {})) {` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:418` | N | Y | `const sampleCount = (old.wins \|\| 0) + (old.losses \|\| 0);` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:419` | N | Y | `const avgPnLPercent = sampleCount > 0 ? (old.totalPnL \|\| 0) / sampleCount : 0;` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:421` | N | Y | `name: old.name \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:422` | N | Y | `data: old.pattern \|\| old.data \|\| {},` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:425` | N | Y | `winCount: old.wins \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:426` | N | Y | `lossCount: old.losses \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:427` | N | Y | `totalPnL: old.totalPnL \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:828` | N | Y | `pattern: indicators.primaryPattern \|\| 'none',` |
| B3_DEFAULT_PARAM | `core/PatternMemoryBank.js:998` | N | Y | `getTopPatterns(limit = 50, status = STATUS.PROMOTED) {` |
| B3_DEFAULT_PARAM | `core/PatternMemoryBank.js:1020` | N | Y | `getWorstPatterns(limit = 50) {` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:1117` | N | Y | `counts[record.status] = (counts[record.status] \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:1126` | N | Y | `const promotedCount = counts.PROMOTED \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:1131` | N | Y | `quarantined: counts.QUARANTINED \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:1132` | N | Y | `candidates: counts.CANDIDATE \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PatternMemoryBank.js:1133` | N | Y | `dead: counts.DEAD \|\| 0,` |
| B3_DEFAULT_PARAM | `core/PatternQualityScoring.js:95` | N | Y | `isElitePattern(patternId, strategy = 'general') {` |
| B3_DEFAULT_PARAM | `core/PatternQualityScoring.js:115` | N | Y | `getElitePatterns(patternIds, strategy = 'general') {` |
| B5_INLINE_FALLBACK | `core/PatternQualityScoring.js:136` | N | Y | `const patternIds = patterns?.map(p => p.signature \|\| p.name) \|\| [];` |
| B5_INLINE_FALLBACK | `core/PatternQualityScoring.js:158` | N | Y | `regime: regime \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/PatternQualityScoring.js:180` | N | Y | `const elitePatterns = this.getElitePatterns(params.patterns?.map(p => p.signature \|\| p.name) \|\| []);` |
| B3_DEFAULT_PARAM | `core/PatternScope.js:20` | N | Y | `function normalizePatternScope(input = {}, caller = 'PatternScope') {` |
| B3_DEFAULT_PARAM | `core/PatternScope.js:79` | N | Y | `function requirePatternScope(input = {}, caller = 'PatternScope') {` |
| B5_INLINE_FALLBACK | `core/PatternScope.js:84` | N | Y | `error.missingFields = scope.missingFields \|\| [];` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:64` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/PerformanceAnalyzer.js:121` | N | Y | `console.log(`   Tracking ${config.trackingMetrics?.length \|\| 0} metrics`);` |
| B2_CONFIG_FALLBACK | `core/PerformanceAnalyzer.js:122` | N | Y | `console.log(`   Update interval: ${config.updateInterval \|\| 60000}ms`);` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:220` | N | Y | `processTrade(trade, analysisData = {}) {` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:358` | N | Y | `scoreTradeQuality(trade, analysisData = {}) {` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:413` | N | Y | `scoreEntryQuality(trade, analysisData = {}) {` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:422` | N | Y | `const confidence = analysisData.patternEvaluation.confidence \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:433` | N | Y | `const normalizedTrend = (analysisData.trend \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:434` | N | Y | `const normalizedDirection = (trade.direction \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:454` | N | Y | `const normalizedDirection = (trade.direction \|\| '').toLowerCase();` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:489` | N | Y | `scoreExitQuality(trade, analysisData = {}) {` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:534` | N | Y | `const normalizedDirection = (trade.direction \|\| '').toLowerCase();` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:563` | N | Y | `scorePatternAccuracy(trade, analysisData = {}) {` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:605` | N | Y | `const normalizedDirection = (direction \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:654` | N | Y | `const normalizedDirection = (direction \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/PerformanceAnalyzer.js:664` | N | Y | `const normalizedLevelType = (level.type \|\| '').toLowerCase();` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:988` | N | Y | `getRecentTrades(count = 10) {` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:1011` | N | Y | `getTopPatterns(count = 5) {` |
| B3_DEFAULT_PARAM | `core/PerformanceAnalyzer.js:1128` | N | Y | `log(message, level = 'info') {` |
| B4_MODULE_CONSTANT | `core/PerformanceDashboardIntegration.js:17` | N | Y | `const RUNTIME_PROFILE_DISABLED_REASON = 'runtime_profile_switch_not_wired';` |
| B3_DEFAULT_PARAM | `core/PerformanceDashboardIntegration.js:20` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/PerformanceDashboardIntegration.js:24` | N | Y | `updateInterval: config.updateInterval \|\| 5000, // 5 second updates` |
| B3_DEFAULT_PARAM | `core/PerformanceValidator.js:11` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/PerformanceValidator.js:14` | N | Y | `minProfitabilityThreshold: config.minProfitabilityThreshold \|\| 0.55, // 55% win rate minimum` |
| B2_CONFIG_FALLBACK | `core/PerformanceValidator.js:15` | N | Y | `minProfitRatio: config.minProfitRatio \|\| 1.2,                       // 1.2:1 profit ratio minimum` |
| B2_CONFIG_FALLBACK | `core/PerformanceValidator.js:16` | N | Y | `evaluationPeriod: config.evaluationPeriod \|\| 86400000,              // 24 hours evaluation period` |
| B2_CONFIG_FALLBACK | `core/PerformanceValidator.js:17` | N | Y | `minSampleSize: config.minSampleSize \|\| 10,                          // Min 10 trades for evaluation` |
| B2_CONFIG_FALLBACK | `core/PerformanceValidator.js:26` | N | Y | `enableAutoDisable: config.enableAutoDisable \|\| false,               // Auto-disable poor performers` |
| B3_DEFAULT_PARAM | `core/PerformanceValidator.js:96` | N | Y | `recordTrade(trade, involvedComponents = []) {` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:99` | N | Y | `pnl: trade.pnl \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:101` | N | Y | `size: trade.size \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:102` | N | Y | `duration: trade.duration \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:103` | N | Y | `fees: trade.fees \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:104` | N | Y | `netPnL: (trade.pnl \|\| 0) - (trade.fees \|\| 0),` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:105` | N | Y | `strategy: trade.strategy \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:106` | N | Y | `timeframe: trade.timeframe \|\| '1m',` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:107` | N | Y | `marketCondition: trade.marketCondition \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:108` | N | Y | `metadata: trade.metadata \|\| {}` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:376` | N | Y | `metrics: component.metrics \|\| {}` |
| B5_INLINE_FALLBACK | `core/PerformanceValidator.js:387` | N | Y | `metrics: data.metrics \|\| {}` |
| B3_DEFAULT_PARAM | `core/PerformanceValidator.js:411` | N | Y | `overrideComponent(componentName, enabled, reason = 'Manual override') {` |
| B3_DEFAULT_PARAM | `core/PerformanceVisualizer.js:63` | N | Y | `constructor(options = {}) {` |
| B2_CONFIG_FALLBACK | `core/PerformanceVisualizer.js:73` | N | Y | `captureFrequency: options.captureFrequency \|\| 100,` |
| B5_INLINE_FALLBACK | `core/PerformanceVisualizer.js:642` | N | Y | `<td>${trade.patternId \|\| 'Unknown'}</td>` |
| B3_DEFAULT_PARAM | `core/PipelineSnapshot.js:41` | N | Y | `constructor(bot, options = {}) {` |
| B2_CONFIG_FALLBACK | `core/PipelineSnapshot.js:43` | N | Y | `this.intervalMs = options.intervalMs \|\| 30 * 60 * 1000; // 30 minutes` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:80` | N | Y | `? (this._cleanTelemetryText(snap.regime?.current) \|\| 'REGIME_NOT_RECORDED')` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:81` | N | Y | `: (this._cleanTelemetryText(snap.regime?.unavailableReason) \|\| 'REGIME_NOT_RECORDED');` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:82` | N | Y | `const conf = snap.lastConfidence?.toFixed(1) \|\| '0';` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:83` | N | Y | `const position = snap.position \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:84` | N | Y | `const candles = snap.candleCount \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:85` | N | Y | `const trades = snap.tradeStats?.total \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:90` | N | Y | `const message = this._cleanTelemetryText(e?.message) \|\| 'SNAPSHOT_ERROR_WITHOUT_MESSAGE';` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:107` | N | Y | `? [...(runtimeScope.missingFields \|\| [])]` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:125` | N | Y | `candleCount: bot.priceHistory?.length \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:140` | N | Y | `position: this._safeGet(() => this._getStateValue(stateManager, 'position', bot.position ?? 0)),` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:141` | N | Y | `balance: this._safeGet(() => this._getStateValue(stateManager, 'balance', bot.balance ?? 0)),` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:146` | N | Y | `lastConfidence: this._safeGet(() => bot.lastConfidence \|\| bot.confidenceData?.totalConfidence \|\| 0),` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:147` | N | Y | `lastDirection: this._safeGet(() => bot.lastDirection \|\| bot.confidenceData?.direction \|\| 'neutral'),` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:172` | N | Y | `return bot.lastPrice \|\| bot.marketData?.price \|\| 0;` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:202` | N | Y | `parameters: bot.marketRegime?.parameters \|\| {},` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:229` | N | Y | `parameters: bot.marketRegime?.parameters \|\| {},` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:242` | N | Y | `errorMessage: this._cleanTelemetryText(e?.message) \|\| 'REGIME_ERROR_WITHOUT_MESSAGE'` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:253` | N | Y | `const sig = bot.emaCrossoverSignal \|\| bot.emaCrossover.getSignal?.() \|\| {};` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:255` | N | Y | `direction: sig.direction \|\| 'neutral',` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:256` | N | Y | `confidence: sig.confidence \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:257` | N | Y | `confluence: sig.confluence \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:258` | N | Y | `blowoff: sig.blowoff \|\| false` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:266` | N | Y | `const sig = bot.liquiditySweepSignal \|\| bot.liquiditySweep.getSignal?.() \|\| {};` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:268` | N | Y | `direction: sig.direction \|\| 'neutral',` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:269` | N | Y | `confidence: sig.confidence \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:270` | N | Y | `phase: sig.phase \|\| 'waiting',` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:271` | N | Y | `hasSignal: sig.hasSignal \|\| false` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:279` | N | Y | `const sig = bot.maDynamicSRSignal \|\| bot.maDynamicSR.getSignal?.() \|\| {};` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:281` | N | Y | `direction: sig.direction \|\| 'neutral',` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:282` | N | Y | `confidence: sig.confidence \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:283` | N | Y | `activeSignals: sig.activeSignals \|\| 0` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:342` | N | Y | `const totalPnl = closed.reduce((s, t) => s + (t.pnl \|\| 0), 0);` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:360` | N | Y | `pendingDecisions: bot.pendingTraiDecisions?.size \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:361` | N | Y | `patternMemorySize: bot.trai.patternMemory?.size \|\| 0` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:371` | N | Y | `const stats = bot.riskManager.getStats?.() \|\| {};` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:373` | N | Y | `dailyPnL: stats.dailyPnL \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:374` | N | Y | `dailyTrades: stats.dailyTrades \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:375` | N | Y | `maxDrawdown: stats.maxDrawdown \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PipelineSnapshot.js:376` | N | Y | `riskLevel: stats.riskLevel \|\| 'normal'` |
| B3_DEFAULT_PARAM | `core/PnLCalculator.js:20` | N | Y | `constructor(options = {}) {` |
| B3_DEFAULT_PARAM | `core/PnLCalculator.js:49` | N | Y | `calculatePnLPercent(entryPrice, currentPrice, side = 'long') {` |
| B3_DEFAULT_PARAM | `core/PnLCalculator.js:73` | N | Y | `calculatePnLDollars(entryPrice, currentPrice, size, side = 'long') {` |
| B3_DEFAULT_PARAM | `core/PnLCalculator.js:92` | N | Y | `calculateNetPnL(entryPrice, currentPrice, size, side = 'long') {` |
| B3_DEFAULT_PARAM | `core/PnLCalculator.js:140` | N | Y | `calculateBreakEven(entryPrice, side = 'long', context = null) {` |
| B3_DEFAULT_PARAM | `core/PnLTracker.js:8` | N | Y | `initialize(balance, sessionId = 'default') {` |
| B3_DEFAULT_PARAM | `core/PnLTracker.js:20` | N | Y | `recordTrade(trade = {}) {` |
| B3_DEFAULT_PARAM | `core/PnLTracker.js:69` | N | Y | `reset(newBalance = null, sessionId = 'default') {` |
| B3_DEFAULT_PARAM | `core/PolicyBuilder.js:558` | N | Y | `function buildForTrade(options = {}) {` |
| B4_MODULE_CONSTANT | `core/PositionEffect.js:12` | N | Y | `const HOLD_POSITION_EFFECT = 'hold';` |
| B4_MODULE_CONSTANT | `core/PositionEffect.js:13` | N | Y | `const UNKNOWN_POSITION_EFFECT = 'unknown_effect';` |
| B3_DEFAULT_PARAM | `core/PositionSizer.js:23` | N | Y | `constructor(options = {}) {` |
| B2_CONFIG_FALLBACK | `core/PositionSizer.js:37` | N | Y | `this.minPositionPercent = options.minPositionPercent ?? 0.01;` |
| B2_CONFIG_FALLBACK | `core/PositionSizer.js:38` | N | Y | `this.useKelly = options.useKelly \|\| false;` |
| B3_DEFAULT_PARAM | `core/PositionSizer.js:54` | N | Y | `const { balance, price, confidence, flags = {} } = params;` |
| B5_INLINE_FALLBACK | `core/PositionSizer.js:131` | N | Y | `const patternIds = patterns.map(p => p.id \|\| p.signature \|\| p.name \|\| 'unknown');` |
| B3_DEFAULT_PARAM | `core/PositionTracker.js:59` | N | Y | `constructor(options = {}) {` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:87` | N | Y | `caller: caller \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:219` | N | Y | `confidence: metadata.confidence \|\| 0,` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:220` | N | Y | `patterns: metadata.patterns \|\| [],` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:221` | N | Y | `entryIndicators: metadata.entryIndicators \|\| {},` |
| B3_DEFAULT_PARAM | `core/PositionTracker.js:253` | N | Y | `patchTrade(orderId, patch, caller = 'unknown') {` |
| B3_DEFAULT_PARAM | `core/PositionTracker.js:328` | N | Y | `_resolveCloseAction(metadata = {}) {` |
| B3_DEFAULT_PARAM | `core/PositionTracker.js:342` | N | Y | `_selectTradeForClose(metadata = {}) {` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:412` | N | Y | `const side = trade.side \|\| 'long';` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:440` | N | Y | `exitReason: exitReason \|\| 'signal',` |
| B3_DEFAULT_PARAM | `core/PositionTracker.js:466` | N | Y | `getPositionInfo(metadata = {}) {` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:472` | N | Y | `position: activeTrade?.size ?? 0,` |
| B5_INLINE_FALLBACK | `core/PositionTracker.js:474` | N | Y | `entryPrice: activeTrade?.entryPrice \|\| 0,` |
| B3_DEFAULT_PARAM | `core/PositionTracker.js:538` | N | Y | `getActiveTradeSnapshot(metadata = {}) {` |
| B3_DEFAULT_PARAM | `core/ProfitExitPlanner.js:50` | N | Y | `function none(reason, evidence = {}) {` |
| B3_DEFAULT_PARAM | `core/ProfitExitPlanner.js:143` | N | Y | `function remainingFractionForQuantity(snapshot, targetQuantity, filledQuantity = 0) {` |
| B3_DEFAULT_PARAM | `core/ProfitExitPlanner.js:286` | N | Y | `function plan(snapshot, market = {}) {` |
| B3_DEFAULT_PARAM | `core/RegimeDetector.js:35` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/RegimeDetector.js:39` | N | Y | `trendThreshold: config.trendThreshold \|\| 0.005,` |
| B2_CONFIG_FALLBACK | `core/RegimeDetector.js:40` | N | Y | `strongTrendThreshold: config.strongTrendThreshold \|\| 0.015,` |
| B2_CONFIG_FALLBACK | `core/RegimeDetector.js:44` | N | Y | `volatilityThreshold: config.volatilityThreshold \|\| 0.012,` |
| B2_CONFIG_FALLBACK | `core/RegimeDetector.js:47` | N | Y | `trendLookback: config.trendLookback \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/RegimeDetector.js:48` | N | Y | `volatilityLookback: config.volatilityLookback \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/RegimeDetector.js:51` | N | Y | `minTrendConsistency: config.minTrendConsistency \|\| 0.5` |
| B3_DEFAULT_PARAM | `core/RegimeDetector.js:272` | N | Y | `let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:7` | N | Y | `function describeProducer(tradeParams = {}) {` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:16` | N | Y | `function scrubInputs(input = {}) {` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:27` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:42` | N | Y | `initializeBalance(balance, context = {}) {` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:43` | N | Y | `this.pnlTracker.initialize(balance, context.sessionId \|\| context.session \|\| 'default');` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:48` | N | Y | `recordTradeResult(trade = {}) {` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:56` | N | Y | `reportExternalLedgerDelta(externalLedger = {}) {` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:59` | N | Y | `const source = externalLedger.source \|\| externalLedger.venue \|\| 'external_ledger';` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:73` | N | Y | `const dollars = Math.abs(report.deltaDollars ?? 0);` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:92` | N | Y | `assessTradeRisk(tradeParams = {}, context = {}) {` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:120` | N | Y | `riskGates.push(...(allowed.riskGates \|\| []));` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:126` | N | Y | `blockType: allowed.blockType \|\| 'VENUE_RAIL_BUFFER',` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:141` | N | Y | `isTradingAllowed(context = {}) {` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:154` | N | Y | `const sessionId = context.sessionId \|\| context.session \|\| context.activeSession \|\| 'default';` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:155` | N | Y | `const venue = context.venue \|\| context.executionVenue \|\| context.sessionVenue \|\| 'default';` |
| B3_DEFAULT_PARAM | `core/RiskManager.js:232` | N | Y | `reset(newBalance = null, context = {}) {` |
| B5_INLINE_FALLBACK | `core/RiskManager.js:233` | N | Y | `this.pnlTracker.reset(newBalance, context.sessionId \|\| context.session \|\| 'default');` |
| B5_INLINE_FALLBACK | `core/RiskManagerConfig.js:16` | N | Y | `throw new Error(`[RISK-CONFIG] risk.${configPath} requires explicit profile source; got ${source \|\| '(missing source)'}`);` |
| B3_DEFAULT_PARAM | `core/RiskManagerConfig.js:45` | N | Y | `function requireNullablePercent(riskConfig, riskSources, configPath, { requiredWhenEnabled = false, enabled = false } = {}) {` |
| B3_DEFAULT_PARAM | `core/RiskManagerConfig.js:76` | N | Y | `function buildRiskManagerConfig(riskConfig, sources = {}) {` |
| B4_MODULE_CONSTANT | `core/RuntimeAuditSink.js:6` | N | Y | `const DEFAULT_FILE_NAME = 'fatal-events.jsonl';` |
| B3_DEFAULT_PARAM | `core/RuntimeAuditSink.js:44` | N | Y | `function sanitizeValue(value, depth = 0, seen = new WeakSet()) {` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:52` | N | Y | `name: value.name \|\| 'Error',` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:53` | N | Y | `message: value.message \|\| '',` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:90` | N | Y | `name: input.name \|\| 'Error',` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:91` | N | Y | `message: input.message \|\| '',` |
| B3_DEFAULT_PARAM | `core/RuntimeAuditSink.js:126` | N | Y | `constructor(options = {}) {` |
| B3_DEFAULT_PARAM | `core/RuntimeAuditSink.js:136` | N | Y | `buildRecord(eventType, input, context = {}) {` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:138` | N | Y | `const env = this.env \|\| {};` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:142` | N | Y | `eventType: String(eventType \|\| 'runtimeFatal'),` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:166` | N | Y | `context: sanitizeValue(context.extra \|\| {}),` |
| B3_DEFAULT_PARAM | `core/RuntimeAuditSink.js:170` | N | Y | `capture(eventType, input, context = {}) {` |
| B5_INLINE_FALLBACK | `core/RuntimeAuditSink.js:193` | N | Y | `eventType: String(eventType \|\| 'runtimeFatal'),` |
| B3_DEFAULT_PARAM | `core/RuntimeConfigProof.js:51` | N | Y | `function buildRuntimeConfigProof(snapshot, ConfigLoader, options = {}) {` |
| B4_MODULE_CONSTANT | `core/SessionRouter.js:46` | N | Y | `const SESSION_ROUTER_WIND_DOWN_SOURCE = 'session_router_wind_down';` |
| B4_MODULE_CONSTANT | `core/SessionRouter.js:47` | N | Y | `const RTH_OPEN_MINUTE = 9 * 60 + 30;` |
| B4_MODULE_CONSTANT | `core/SessionRouter.js:48` | N | Y | `const WIND_DOWN_SOFT_STOP_MINUTES = 30;` |
| B4_MODULE_CONSTANT | `core/SessionRouter.js:49` | N | Y | `const WIND_DOWN_WARN_MINUTES = 15;` |
| B4_MODULE_CONSTANT | `core/SessionRouter.js:50` | N | Y | `const WIND_DOWN_FORCE_FLATTEN_MINUTES = 5;` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:53` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/SessionRouter.js:56` | N | Y | `this.mode = String(config.mode \|\| '').trim().toLowerCase();` |
| B2_CONFIG_FALLBACK | `core/SessionRouter.js:57` | N | Y | `this.staticSession = String(config.staticSession \|\| '').trim().toLowerCase() \|\| null;` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:59` | N | Y | `throw new Error(`[SessionRouter] mode must be static or scheduled, got ${this.mode \|\| '(missing)'}`);` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:62` | N | Y | `throw new Error(`[SessionRouter] staticSession must be stocks or crypto when mode=static, got ${this.staticSession \|\| '(missing)'}`);` |
| B2_CONFIG_FALLBACK | `core/SessionRouter.js:65` | N | Y | `this.checkIntervalMs = config.fast ? 1000 : (config.checkIntervalMs \|\| 60000);` |
| B2_CONFIG_FALLBACK | `core/SessionRouter.js:129` | N | Y | `this.transitionStore = config.transitionStore \|\| new TransitionStore(config.transitionStoreOptions \|\| {});` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:134` | N | Y | `console.log(`[SessionRouter] Initialized \| mode=${this.mode} \| staticSession=${this.staticSession \|\| '(none)'} \| interval=${this.checkIntervalMs}ms`);` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:322` | N | Y | `from: this.activeSession \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:366` | N | Y | `await this._enterFailedSafe(this.activeSession \|\| 'unknown', 'unknown', err, now, {` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:591` | N | Y | `_emitSessionRouterTrace(eventName, fields = {}) {` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:593` | N | Y | `emitTrace(this.ctx \|\| {}, eventName, {` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:603` | N | Y | `const from = this.activeSession \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:615` | N | Y | `reason: `SessionRouter wind-down phase=${this.windDownPhase} direction=${this.windDownDirection \|\| 'unknown'}`,` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:632` | N | Y | `reason: this.failedSafeEntryBlockReason \|\| `SessionRouter failed safe: ${this.failedSafeReason \|\| 'unknown'}`,` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:644` | N | Y | `_createTransitionContext(from, to, now, details = {}) {` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:659` | N | Y | `_beginTransitionContext(from, to, now, details = {}) {` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:735` | N | Y | `_recordTransitionEvent(eventName, transitionContext, details = {}) {` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:749` | N | Y | `_brokerIntentDetails(transitionContext, brokerId, action, details = {}) {` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:785` | N | Y | `async _executeBrokerIntent(transitionContext, brokerId, action, execute, details = {}) {` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:790` | N | Y | `throw new Error(`SessionRouter broker intent ${action \|\| '(missing)'} missing execution function`);` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:850` | N | Y | `const reason = status.safeModeReason \|\| status.lastEvent \|\| status.state \|\| 'unknown transition-store recovery state';` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:900` | N | Y | `accountIdSource: adapterIdentity?.accountIdSource \|\| adapterIdentity?.source \|\| 'broker:adapter'` |
| B2_CONFIG_FALLBACK | `core/SessionRouter.js:909` | N | Y | `accountIdSource: config.accountIdSource \|\| 'config'` |
| B2_CONFIG_FALLBACK | `core/SessionRouter.js:1041` | N | Y | `const accountId = config.accountId \|\| 'default';` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:1057` | N | Y | `_handoffPatternMemory(targetSession, transitionContext, timeframe, details = {}) {` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1080` | N | Y | `throw new Error(`SessionRouter pattern memory handoff refused switch: ${result.reason \|\| 'unknown reason'}`);` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1084` | N | Y | `throw new Error(`SessionRouter pattern memory handoff target mismatch: expected ${expectedMode}/${expectedBucket}/${expectedStorageFile}, got ${result.mode \|\| '(missing)'}/${result.assetBucket \|\| '(missing)'}/${storageFile \|\| '(missing)'}`);` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1151` | N | Y | `console.warn(`[SessionRouter] Rejected OHLC callback: ${reason} \| expected=${expected.sessionName}/${expected.brokerId}/epoch:${expected.epoch} active=${this.activeSession \|\| '(none)'}/${event.activeBrokerId \|\| '(none)'}/epoch:${this.activeCallbackEpoch \|\| '(none)'}`);` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1163` | N | Y | `return `session mismatch: active=${this.activeSession \|\| '(none)'}`;` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1166` | N | Y | `return `broker mismatch: active=${this._brokerIdFor(this.activeBroker, null) \|\| '(none)'}`;` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1169` | N | Y | `return `epoch mismatch: active=${this.activeCallbackEpoch \|\| '(none)'}`;` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1248` | N | Y | `return FIAT_BALANCE_SYMBOLS.has(String(symbol \|\| '').toUpperCase());` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1259` | N | Y | `\|\| ''` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1273` | N | Y | `symbol: symbol \|\| '(missing)',` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1285` | N | Y | `const status = String(order.status \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1291` | N | Y | `orderId: order.orderId \|\| order.id \|\| order.txid \|\| '(missing)',` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1292` | N | Y | `symbol: order.symbol \|\| order.pair \|\| order.instrument \|\| '(missing)',` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1293` | N | Y | `side: order.side \|\| order.type \|\| '(missing)',` |
| B5_INLINE_FALLBACK | `core/SessionRouter.js:1294` | N | Y | `status: status \|\| '(missing)',` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:1333` | N | Y | `async _reconcileBrokerRestBeforeActivation(sourceAdapter, targetAdapter, transitionContext, details = {}) {` |
| B3_DEFAULT_PARAM | `core/SessionRouter.js:1385` | N | Y | `async _enterFailedSafe(from, to, err, now, options = {}) {` |
| B3_DEFAULT_PARAM | `core/SingletonLock.js:10` | N | Y | `constructor(botName = 'ogz-prime') {` |
| B1_ENV_READ | `core/SingletonLock.js:14` | N | Y | `const lockDir = process.env.DATA_DIR \|\| process.cwd();` |
| B1_ENV_READ | `core/SingletonLock.js:26` | N | N | `const isFileSource = process.env.CANDLE_SOURCE === 'file';` |
| B1_ENV_READ | `core/SingletonLock.js:27` | N | Y | `const isBacktestMode = process.env.EXECUTION_MODE === 'backtest' \|\|` |
| B1_ENV_READ | `core/SingletonLock.js:28` | N | Y | `process.env.BACKTEST_MODE === 'true' \|\|` |
| B1_ENV_READ | `core/SingletonLock.js:29` | N | N | `process.env.TEST_MODE === 'true';` |
| B1_ENV_READ | `core/SingletonLock.js:40` | N | N | `if (process.env.BACKTEST_SILENT !== 'true') {` |
| B3_DEFAULT_PARAM | `core/SingletonLock.js:267` | N | Y | `async function checkCriticalPorts(ports = [3001, 3002, 3003, 3010]) {` |
| B4_MODULE_CONSTANT | `core/StateManager.js:100` | N | Y | `const TTP_CUTOFF_FLATNESS_PAUSE_SOURCE = 'ttp_cutoff_unverified_broker_flatness';` |
| B4_MODULE_CONSTANT | `core/StateManager.js:101` | N | Y | `const DIRECTION_INTEGRITY_EXIT_REFUSAL = 'direction_integrity_exit_refusal';` |
| B4_MODULE_CONSTANT | `core/StateManager.js:102` | N | Y | `const BROKER_UNVERIFIABLE = 'broker_unverifiable';` |
| B4_MODULE_CONSTANT | `core/StateManager.js:103` | N | Y | `const TTP_CUTOFF_FLATNESS_PAUSE_PREFIX = '[TTP_MARKET_TIME] broker flatness unverified after cutoff';` |
| B4_MODULE_CONSTANT | `core/StateManager.js:104` | N | Y | `const DATA_FEED_LIVENESS_PAUSE_SOURCE = 'data_feed_liveness';` |
| B3_DEFAULT_PARAM | `core/StateManager.js:228` | N | Y | `function initialBeScaleOutState(status = 'idle') {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:274` | N | Y | `const direction = String(trade?.direction \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/StateManager.js:275` | N | Y | `const action = String(trade?.action \|\| '').trim().toUpperCase();` |
| B3_DEFAULT_PARAM | `core/StateManager.js:303` | N | Y | `function activeTradeDirectionRefusal(tradeId, trade, caller, extra = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:304` | N | Y | `const resolvedTradeId = tradeId \|\| trade?.orderId \|\| trade?.id \|\| '<unknown>';` |
| B3_DEFAULT_PARAM | `core/StateManager.js:328` | N | Y | `function activeTradeIdentityIssuesForTrade(trade, fallbackTradeId = '<unknown>') {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:329` | N | Y | `const tradeId = trade?.orderId \|\| trade?.id \|\| fallbackTradeId \|\| '<unknown>';` |
| B3_DEFAULT_PARAM | `core/StateManager.js:387` | N | Y | `function normalizeBeScaleOutState(value, legacy = false) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:412` | N | Y | `const value = String(reason \|\| '').trim().toLowerCase();` |
| B3_DEFAULT_PARAM | `core/StateManager.js:431` | N | Y | `function withExitLifecycleFields(trade, { legacy = false, reset = false } = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:614` | N | Y | `initializeFreshState(initialBalance, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:680` | N | Y | `const realizedPnL = finiteNumberOrNull(this.state.realizedPnL) ?? 0;` |
| B5_INLINE_FALLBACK | `core/StateManager.js:724` | N | Y | `[`${trade?.orderId \|\| trade?.id \|\| tradeId \|\| '<unknown>'}: missing valid direction`],` |
| B5_INLINE_FALLBACK | `core/StateManager.js:796` | N | Y | `reservedCapital += trade.sizeUsd \|\| trade.size \|\| 0;` |
| B5_INLINE_FALLBACK | `core/StateManager.js:826` | N | Y | `[`${trade?.orderId \|\| trade?.id \|\| tradeId \|\| '<unknown>'}: invalid sizeUsd=${trade?.sizeUsd} size=${trade?.size}`],` |
| B5_INLINE_FALLBACK | `core/StateManager.js:836` | N | Y | `[`${trade?.orderId \|\| trade?.id \|\| tradeId \|\| '<unknown>'}: invalid direction=${trade?.direction}`],` |
| B5_INLINE_FALLBACK | `core/StateManager.js:870` | N | Y | `[`${trade?.orderId \|\| trade?.id \|\| tradeId \|\| '<unknown>'}: invalid sizeUsd=${trade?.sizeUsd} size=${trade?.size}`],` |
| B5_INLINE_FALLBACK | `core/StateManager.js:881` | N | Y | `[`${trade?.orderId \|\| trade?.id \|\| tradeId \|\| '<unknown>'}: invalid direction=${trade?.direction}`],` |
| B3_DEFAULT_PARAM | `core/StateManager.js:926` | N | Y | `async updateState(updates, context = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:937` | N | Y | `_statePersistenceFailureResult(saveResult = {}, context = {}, snapshot = null) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:942` | N | Y | `const action = context.action \|\| 'STATE_UPDATE';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:944` | N | Y | `const errorMessage = saveResult.error \|\| saveResult.reason \|\| 'state persistence failed';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:966` | N | Y | `code: saveResult.code \|\| 'STATE_PERSIST_FAILED',` |
| B5_INLINE_FALLBACK | `core/StateManager.js:985` | N | Y | `code: saveResult.code \|\| 'STATE_PERSIST_FAILED',` |
| B3_DEFAULT_PARAM | `core/StateManager.js:995` | N | Y | `_recordStatePersistenceBoundaryFailure(saveResult = {}, source = 'StateManager.save', metadata = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:996` | N | Y | `const errorMessage = saveResult.error \|\| saveResult.reason \|\| 'state persistence failed';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:999` | N | Y | `code: saveResult.code \|\| 'STATE_PERSIST_FAILED',` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1015` | N | Y | `_applyStateUpdatesLocked(updates, context = {}, options = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1081` | N | Y | `action: context.action \|\| 'STATE_UPDATE',` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1091` | N | Y | `code: error.code \|\| 'STATE_UPDATE_FAILED',` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1147` | N | Y | `async openPosition(size, price, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1325` | N | Y | `const nextActiveTrades = new Map(this.state.activeTrades \|\| []);` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1341` | N | Y | `const existingId = sameSymbolUnknownTrade.orderId \|\| sameSymbolUnknownTrade.id \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1352` | N | Y | `const existingId = sameSymbolOppositeTrade.orderId \|\| sameSymbolOppositeTrade.id \|\| 'unknown';` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1420` | N | Y | `_rejectOpenPositionScope(err, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1426` | N | Y | `code: err.code \|\| 'SCOPE_REJECTED',` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1444` | N | Y | `_rejectOpenPositionIdentity(message, missingFields = [], context = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1457` | N | Y | `_rejectOpenPositionExitContract(err, context = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1470` | N | Y | `_rejectOpenPositionQuantity(quantityIssues, context = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1484` | N | Y | `_rejectOpenPositionLedger(err, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1489` | N | Y | `code: err.code \|\| 'LEDGER_SKELETON_REJECTED',` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1542` | N | Y | `async closePosition(price, partial = false, size = null, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1610` | N | Y | `const nextActiveTrades = new Map(this.state.activeTrades \|\| []);` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1688` | N | Y | `closedTrades: [...(this.state.closedTrades \|\| []), closedTradeRecord],` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1743` | N | Y | `async reconcileBrokerFlat(tradeId, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1773` | N | Y | `reason: context.reason \|\| 'broker_flat_no_open_position',` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1789` | N | Y | `reconciledTrades: [...(this.state.reconciledTrades \|\| []), reconciliation],` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1815` | N | Y | `async reducePosition(tradeId, fraction, price, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1850` | N | Y | `const nextActiveTrades = new Map(this.state.activeTrades \|\| []);` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1944` | N | Y | `_activeTradeQuantityIssuesForTrade(trade, fallbackTradeId = '<unknown>') {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:1945` | N | Y | `const tradeId = trade?.orderId \|\| trade?.id \|\| fallbackTradeId \|\| '<unknown>';` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1993` | N | Y | `_activeTradeIdentityIssuesForTrade(trade, fallbackTradeId = '<unknown>') {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:1997` | N | Y | `_normalizeActiveTradesInput(value, caller = 'StateManager.activeTrades', { resetLifecycle = false } = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2064` | N | Y | `_recordDirectionIntegritySymbolHalt(symbol, reason, metadata = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2078` | N | Y | `...(this.state.symbolEntryHalts \|\| {}),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2141` | N | Y | `const resolvedTradeId = trade?.orderId \|\| trade?.id \|\| tradeId \|\| '<unknown>';` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2202` | N | Y | `quarantineActiveTradesForSymbol(symbol, issues = [], source = 'StateManager.quarantineActiveTradesForSymbol') {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2417` | N | Y | `const nextHalts = { ...(this.state.symbolEntryHalts \|\| {}) };` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2447` | N | Y | `getBrokerVerificationEntryBlock(scope = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2473` | N | Y | `affectedSymbols: lane.affectedSymbols \|\| [],` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2474` | N | Y | `tradeIds: lane.tradeIds \|\| [],` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2554` | N | Y | `async pauseTrading(reason, options = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2597` | N | Y | `async resumeTrading(context = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2621` | N | Y | `_pauseScopeMatches(expectedScope = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2643` | N | Y | `const pauseReason = String(this.state.pauseReason \|\| '').trim();` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2644` | N | Y | `const lastError = String(this.state.lastError \|\| '').trim();` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2653` | N | Y | `const pauseReason = String(this.state.pauseReason \|\| '');` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2654` | N | Y | `return pauseReason.trim() ? pauseReason : String(this.state.lastError \|\| '');` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2670` | N | Y | `const pauseReason = String(this.state.pauseReason \|\| this.state.lastError \|\| '').trim();` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2679` | N | Y | `console.warn(`[StateManager] Cleared persisted data-feed liveness pause on load: ${pauseReason \|\| 'unknown liveness pause'}`);` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2729` | N | Y | `async resumeTradingIfPausedBy(source, options = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2736` | N | Y | `const pauseReason = String(this.state.pauseReason \|\| this.state.lastError \|\| '');` |
| B2_CONFIG_FALLBACK | `core/StateManager.js:2758` | N | Y | `if (!this._pauseScopeMatches(options.scope \|\| {})) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2810` | N | Y | `const caller = stack.split('\n')[2]?.trim() \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2813` | N | Y | `this._bypassViolations = this._bypassViolations \|\| [];` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2844` | N | Y | `const trades = new Map(this.state.activeTrades \|\| []);` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2887` | N | Y | `markActiveTradeJournalFailure(orderId, failure = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2893` | N | Y | `const trades = new Map(this.state.activeTrades \|\| []);` |
| B5_INLINE_FALLBACK | `core/StateManager.js:2950` | N | Y | `const trades = new Map(this.state.activeTrades \|\| []);` |
| B3_DEFAULT_PARAM | `core/StateManager.js:2999` | N | Y | `async reserveExitSlot(tradeId, intentId, options = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:3130` | N | Y | `async markExitSlotAccepted(tradeId, intentId, options = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3193` | N | Y | `brokerOrderIds: Array.from(new Set([...(nextTrade.beScaleOutState.brokerOrderIds \|\| []), brokerOrderId])),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3201` | N | Y | `brokerOrderIds: Array.from(new Set([...(tier.brokerOrderIds \|\| []), brokerOrderId])),` |
| B3_DEFAULT_PARAM | `core/StateManager.js:3236` | N | Y | `async releaseExitSlot(tradeId, intentId, options = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:3327` | N | Y | `async applyFill(fill = {}) {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:3329` | N | Y | `const invalidFill = (error, extra = {}) => ({` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3451` | N | Y | `const pendingStatus = pending.lifecycleState \|\| pending.status \|\| 'reserved';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3495` | N | Y | `if (String(trade.remainingOrderQuantityUnit \|\| '').trim() !== filledQuantityUnit) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3608` | N | Y | `backtestRecorderStatus: firstNonEmptyString(fill.recordingFailure.backtestRecorderStatus) \|\| 'unrecorded',` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3659` | N | Y | `...(recordingFailureFields \|\| {}),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3669` | N | Y | `filledQuantity: Number(pending.filledQuantity \|\| 0) + filledQuantity,` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3671` | N | Y | `brokerOrderIds: Array.from(new Set([...(pending.brokerOrderIds \|\| []), brokerOrderId])),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3686` | N | Y | `...(recordingFailureFields \|\| {}),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3689` | N | Y | `const filledTotal = Number(nextTrade.beScaleOutState.filledQuantity \|\| 0) + filledQuantity;` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3695` | N | Y | `brokerOrderIds: Array.from(new Set([...(nextTrade.beScaleOutState.brokerOrderIds \|\| []), brokerOrderId])),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3704` | N | Y | `const filledTotal = Number(tier.filledQuantity \|\| 0) + filledQuantity;` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3710` | N | Y | `brokerOrderIds: Array.from(new Set([...(tier.brokerOrderIds \|\| []), brokerOrderId])),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3730` | N | Y | `...(closedTradeRecord ? { closedTrades: [...(this.state.closedTrades \|\| []), closedTradeRecord] } : {}),` |
| B3_DEFAULT_PARAM | `core/StateManager.js:3783` | N | Y | `normalizeSymbol(symbol, caller = 'StateManager.normalizeSymbol') {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:3792` | N | Y | `buildTradeScope(context, symbol, caller = 'StateManager.buildTradeScope') {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:3874` | N | Y | `setDashboardRuntimeScope(context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:3947` | N | Y | `return this._bypassViolations \|\| [];` |
| B2_CONFIG_FALLBACK | `core/StateManager.js:3989` | N | Y | `cfg = cfg \|\| {};` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4017` | N | Y | `const existingStreaks = this.state.symbolLossStreaks \|\| {};` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4018` | N | Y | `const previous = existingStreaks[normalized] \|\| {};` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4039` | N | Y | `...(this.state.symbolEntryHalts \|\| {}),` |
| B3_DEFAULT_PARAM | `core/StateManager.js:4053` | N | Y | `_normalizeSymbolEntryHaltsCollection(symbolEntryHalts, source = 'StateManager.symbolEntryHalts') {` |
| B3_DEFAULT_PARAM | `core/StateManager.js:4083` | N | Y | `_normalizeSymbolEntryHaltsMutation(symbolEntryHalts, context = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4090` | N | Y | `this.state.symbolEntryHalts \|\| {},` |
| B3_DEFAULT_PARAM | `core/StateManager.js:4115` | N | Y | `async haltSymbol(symbol, reason, metadata = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4120` | N | Y | `console.error(`[StateManager] REFUSING UNAUTHORIZED SYMBOL ENTRY HALT: ${normalized} - ${reason \|\| 'unspecified'} (code=${code \|\| 'missing'})`);` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4125` | N | Y | `requestedReason: reason \|\| 'unspecified',` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4130` | N | Y | `const halts = { ...(this.state.symbolEntryHalts \|\| {}) };` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4132` | N | Y | `reason: reason \|\| 'unspecified',` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4164` | N | Y | `const halts = { ...(this.state.symbolEntryHalts \|\| {}) };` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4190` | N | Y | `this._alertListeners = this._alertListeners \|\| [];` |
| B3_DEFAULT_PARAM | `core/StateManager.js:4199` | N | Y | `save(options = {}) {` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4440` | N | Y | `const tradeId = trade?.id \|\| trade?.orderId \|\| '<unknown>';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4498` | N | Y | `const symbolHaltCount = Object.keys(this.state.symbolEntryHalts \|\| {}).length;` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4809` | N | Y | `: new Map(Object.entries(state.lastPrices \|\| {}));` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4823` | N | Y | `const entryPrice = Number(trade.entryPrice ?? trade.price ?? 0);` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4824` | N | Y | `const sizeUsd = Number(trade.sizeUsd ?? trade.size ?? 0);` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4844` | N | Y | `const accountId = trade.accountId \|\| trade.account \|\| 'default';` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4871` | N | Y | `status: trade.status \|\| 'open',` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4887` | N | Y | `: new Map(Object.entries(state.lastPrices \|\| {}));` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4906` | N | Y | `missingPriceSymbols.add(symbol \|\| rawSymbol \|\| trade.id \|\| trade.orderId \|\| 'unknown');` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4937` | N | Y | `? [...(runtimeScope.missingFields \|\| [])]` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4962` | N | Y | `equityIntegrity: state.equityIntegrity \|\| { status: 'trusted', excludedTrades: [] },` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4968` | N | Y | `quarantinedTrades: state.quarantinedTrades \|\| [],` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4970` | N | Y | `brokerVerificationIntegrity: state.brokerVerificationIntegrity \|\| { status: 'trusted', lanes: [] },` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4971` | N | Y | `symbolEntryHalts: state.symbolEntryHalts \|\| {},` |
| B5_INLINE_FALLBACK | `core/StateManager.js:4975` | N | Y | `...(authoritativeRuntimeScope \|\| {}),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:5003` | N | Y | `...(authoritativeRuntimeScope \|\| {}),` |
| B5_INLINE_FALLBACK | `core/StateManager.js:5024` | N | Y | `console.log(`Position: ${this.state.position} @ ${this.state.entryPrice \|\| 'N/A'}`);` |
| B4_MODULE_CONSTANT | `core/StrategyOrchestrator.js:59` | N | Y | `const MTF_CONFLUENCE_STATS_KEY = '__OGZ_MTF_CONFLUENCE_STATS';` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:81` | N | Y | `function boundedConfidenceFromRankingScore(score, label = 'publicConfidence') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:136` | N | Y | `const strategyName = result.strategyName \|\| result.name \|\| 'unknown_strategy';` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:214` | N | Y | `structuralExitOverrides: validation.signalOverrides \|\| {},` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:364` | N | Y | `function resolveSignalTimeframe(result, ctx, strategyName = 'strategy') {` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:385` | N | Y | `function requiredRsiNumber(config, key, { min = null, max = null, integer = false, path = `strategies.RSI.${key}` } = {}) {` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:440` | N | Y | `function booleanConfigValue(value, fallback = false) {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:451` | N | Y | `...(ConfigLoader.get('strategies.EMASMACrossover') \|\| {}),` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:473` | N | Y | `strategies: new Set(strategyList.map(name => String(name \|\| '').trim()).filter(Boolean)),` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:568` | N | Y | `const learned = memory.getConfidence(featureVector.features, ctx.extras?.patternScope \|\| {});` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:581` | N | Y | `source: learned?.source \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:582` | N | Y | `status: learned?.status \|\| stats?.status \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:729` | N | Y | `const tpMode = explicitTpMode \|\| 'percent';` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:810` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:814` | N | Y | `this.minStrategyConfidence = ConfigLoader.get('confidence.minStrategyConfidence') ?? 0.01;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:817` | N | Y | `this.regimeMinConfidence = ConfigLoader.get('confidence.regimeMinConfidence') ?? 0.30;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:818` | N | Y | `this.confluenceMinScore = ConfigLoader.get('confidence.confluenceMinScore') ?? 0.30;` |
| B2_CONFIG_FALLBACK | `core/StrategyOrchestrator.js:821` | N | Y | `this.minConfluenceCount = config.minConfluenceCount ?? 1;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:864` | N | Y | `ConfigLoader.get('strategies.SmartMoneySweep') \|\| {}` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:867` | N | Y | `ConfigLoader.get('strategies.DonchianBreakout') \|\| {}` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:870` | N | Y | `const soloFilter = ConfigLoader.get('strategies.soloFilter') \|\| [];` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:879` | N | Y | `this.minCandlesEMA = ConfigLoader.get('orchestrator.minCandlesEMA') ?? 20;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:880` | N | Y | `this.minCandlesMASR = ConfigLoader.get('orchestrator.minCandlesMASR') ?? 50;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:881` | N | Y | `this.minCandlesSweep = ConfigLoader.get('orchestrator.minCandlesSweep') ?? 20;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:882` | N | Y | `this.minCandlesMTF = ConfigLoader.get('orchestrator.minCandlesMTF') ?? 30;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:883` | N | Y | `this.minCandlesTPO = ConfigLoader.get('orchestrator.minCandlesTPO') ?? 30;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:884` | N | Y | `this.fibDistanceEMA = ConfigLoader.get('orchestrator.fibDistanceEMA') ?? 0.5;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:885` | N | Y | `this.fibDistanceMASR = ConfigLoader.get('orchestrator.fibDistanceMASR') ?? 0.5;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:886` | N | Y | `this.fibDistanceSweep = ConfigLoader.get('orchestrator.fibDistanceSweep') ?? 0.8;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:887` | N | Y | `this.fibBoostNormal = ConfigLoader.get('orchestrator.fibBoostNormal') ?? 0.10;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:888` | N | Y | `this.fibBoostGolden = ConfigLoader.get('orchestrator.fibBoostGolden') ?? 0.15;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:923` | N | Y | `const serviceConfig = ConfigLoader.get('orchestrator.mtfConfluenceService') \|\| {};` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:926` | N | Y | `activeTimeframes: ConfigLoader.get('orchestrator.mtfTimeframes') \|\| ['1m', '5m', '15m', '1h', '4h'],` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:985` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:986` | N | Y | `console.log(`[DIAG] MultiTimeframe: NOT ENOUGH CANDLES (${candles?.length \|\| 0} < ${this.minCandlesMTF})`);` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1006` | N | N | `if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] MultiTimeframe: ingestCandle error: ${e.message}`);` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1014` | N | N | `if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] MultiTimeframe: getConfluence error: ${e.message}`);` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1018` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1033` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1049` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1109` | N | Y | `unavailableReason: reason \|\| 'unavailable',` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1130` | N | Y | `const direction = confluence.direction \|\| 'neutral';` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1163` | N | Y | `const booster = ConfigLoader.get('orchestrator.mtfConfluenceBooster') \|\| {};` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1164` | N | Y | `const strategyMtf = ConfigLoader.get('orchestrator.strategyMtfConfluence') \|\| {};` |
| B2_CONFIG_FALLBACK | `core/StrategyOrchestrator.js:1169` | N | Y | `const config = ConfigLoader.get('orchestrator.mtfConfluenceBooster') \|\| {};` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1192` | N | Y | `const strategyConfig = ConfigLoader.get(`strategies.${result.strategyName}`) \|\| {};` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1193` | N | Y | `const strategyBoost = strategyConfig.confluenceBoost \|\| {};` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1253` | N | Y | `const strategyMtfConfig = ConfigLoader.get('orchestrator.strategyMtfConfluence') \|\| {};` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:1258` | N | Y | `const applyPenalty = (name, multiplier, reason, extra = {}) => {` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:1282` | N | Y | `const add = (name, amount, extra = {}) => {` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:1298` | N | Y | `const multiply = (name, multiplier, extra = {}) => {` |
| B2_CONFIG_FALLBACK | `core/StrategyOrchestrator.js:1315` | N | Y | `const cfg = ConfigLoader.get('orchestrator.emaCrossoverMtf') \|\| {};` |
| B2_CONFIG_FALLBACK | `core/StrategyOrchestrator.js:1362` | N | Y | `const cfg = ConfigLoader.get('orchestrator.maDynamicSRMtf') \|\| {};` |
| B2_CONFIG_FALLBACK | `core/StrategyOrchestrator.js:1395` | N | Y | `const cfg = ConfigLoader.get('orchestrator.rsiMtf') \|\| {};` |
| B2_CONFIG_FALLBACK | `core/StrategyOrchestrator.js:1424` | N | Y | `const cfg = ConfigLoader.get('orchestrator.ogzTpoMtf') \|\| {};` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1486` | N | N | `const verbose = process.env.STRATEGY_DIAG === 'true';` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1493` | N | Y | `const trend = ctx.indicators?.trend \|\| 'n/a';` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1494` | N | Y | `const regime = ctx.regime?.currentRegime \|\| 'n/a';` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1543` | N | Y | `diagEMA[key] = (diagEMA[key] \|\| 0) + (Number(sig.diagnostics[key]) \|\| 0);` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1548` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1549` | N | Y | `console.log(`[DIAG] EMACrossover computed: dir=${sig.direction} conf=${(sig.confidence\|\|0).toFixed(2)}`);` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1607` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1608` | N | Y | `console.log(`[DIAG] MADynamicSR computed: dir=${sig.direction} conf=${(sig.confidence\|\|0).toFixed(2)}`);` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1612` | N | Y | `let conf = sig.confidence \|\| 0;` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1651` | N | Y | `if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] LiquiditySweep: NOT ENOUGH CANDLES (${candles?.length \|\| 0} < ${minCandlesSweep})`);` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1667` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1675` | N | Y | `let conf = sig.confidence \|\| 0;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1690` | N | Y | `reason: `Liquidity Sweep ${sig.direction} (${sig.sweepType \|\| 'institutional'})${fibBoost}`,` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1717` | N | Y | `let conf = sig.confidence \|\| 0;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1789` | N | Y | `const patterns = ctx.patterns \|\| [];` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1794` | N | Y | `(b.confidence \|\| 0) > (a.confidence \|\| 0) ? b : a, patterns[0]);` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1797` | N | Y | `const conf = best.confidence \|\| 0;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1803` | N | Y | `reason: `Pattern: ${best.name \|\| best.type \|\| 'detected'} (${(conf * 100).toFixed(0)}%)`,` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1817` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1818` | N | Y | `console.log(`[DIAG] MarketRegime: regime=${regime?.currentRegime \|\| 'null'} trend=${trend \|\| 'null'} conf=${regime?.confidence \|\| 0}`);` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1824` | N | Y | `const regimeConf = regime.confidence \|\| 0;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1852` | N | Y | `reason: `Regime: ${regime.currentRegime} + Trend: ${trend \|\| 'unknown'} [${agreementLabel}]`,` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1890` | N | Y | `const strength = tpo.signal.strength \|\| 0;` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1896` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1935` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1936` | N | Y | `console.log(`[DIAG] OpeningRangeBreakout: signal=${signal ? JSON.stringify({dir: signal.direction, conf: signal.confidence}) : 'null'} candle_time=${latestCandle?.time \|\| 'unknown'}`);` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1974` | N | Y | `ConfigLoader.get('strategies.SmartMoneySweep') \|\| {}` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:1981` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && sig) {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1982` | N | Y | `console.log(`[DIAG] SmartMoneySweep: dir=${sig.direction} conf=${(sig.confidence\|\|0).toFixed(2)} conds=${sig.conditionsMet}`);` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:1987` | N | Y | `let conf = sig.confidence \|\| 0;` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2020` | N | N | `if (process.env.STRATEGY_DIAG === 'true') {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2036` | N | Y | `ConfigLoader.get('strategies.DonchianBreakout') \|\| {}` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2119` | N | Y | `const pipeline = ConfigLoader.get('pipeline') \|\| {};` |
| B3_DEFAULT_PARAM | `core/StrategyOrchestrator.js:2172` | N | Y | `evaluate(indicators, patterns = [], regime = null, priceHistory = [], extras = {}) {` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2250` | N | Y | `if (process.env.STRATEGY_DIAG === 'true' \|\| this.evalCount % 200 === 0) {` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2356` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && rawStrategyResults.length > 0) {` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2363` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && contractConfidenceDropped.length > 0) {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2373` | N | Y | `// `extras.price \|\| (priceHistory[last]?.c ?? 0)` silently degraded` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2398` | N | Y | `// `indicators?.atr \|\| 0` silently turned a missing/undefined ATR` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2437` | N | Y | `if (process.env.STRATEGY_DIAG === 'true' \|\| this.evalCount % 200 === 0) {` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2465` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && atrDropped.length > 0) {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2485` | N | Y | `const rawRegime = regime?.currentRegime?.toLowerCase() \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2487` | N | Y | `// (RegimeDetector regression). The ?? 0 below remains for the case where` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2494` | N | Y | `const regimeConfidence = regime?.confidence ?? 0;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2513` | N | Y | `const boosts = regimeBoosts[regimeType] \|\| {};` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2514` | N | Y | `const regimePositionMultiplier = boosts._positionSizeMultiplier \|\| 1.0;` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2541` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && trendRegimeDropped.length > 0) {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2548` | N | Y | `const boost = boosts[result.strategyName] \|\| 1.0;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2606` | N | Y | `const lvns = vpProfile.lvns \|\| [];` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2616` | N | Y | `const vpBoosts = volumeProfileBoosts[vpZone] \|\| {};` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2621` | N | Y | `const boost = vpBoosts._allStrategies \|\| vpBoosts[result.strategyName] \|\| 1.0;` |
| B1_ENV_READ | `core/StrategyOrchestrator.js:2658` | N | N | `if (process.env.STRATEGY_DIAG === 'true' && rawStrategyResults.length > 0) {` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2742` | N | Y | `const rawSizingMultiplier = this.confluenceSizing[cappedCount] \|\| this.confluenceSizing[4] \|\| 2.5;` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2822` | N | Y | `{ ...(entry.structuralExitOverrides \|\| {}), confidence: publicWinnerConfidence },` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2970` | N | Y | `ConfigLoader.get('strategies.SmartMoneySweep') \|\| {}` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2974` | N | Y | `console.log(`[SMS-DAILY] Recorded trade result: $${pnl.toFixed(2)} symbol=${symbol \|\| 'legacy'} dailyLosses=${smsModule.dailyLosses}`);` |
| B5_INLINE_FALLBACK | `core/StrategyOrchestrator.js:2988` | N | Y | `confluence: this.lastEvaluation.confluence?.count \|\| 0,` |
| B3_DEFAULT_PARAM | `core/Supervisor.js:112` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/Supervisor.js:114` | N | Y | `const opts = Object.assign({}, DEFAULTS, config.options \|\| {});` |
| B2_CONFIG_FALLBACK | `core/Supervisor.js:116` | N | Y | `this.label = config.label \|\| '[Supervisor]';` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:181` | N | Y | `existing._defGeneration = (existing._defGeneration \|\| 0) + 1;` |
| B3_DEFAULT_PARAM | `core/Supervisor.js:192` | N | Y | `// reset (lastRedAt=0, healAttempts=0) only happens after sustained` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:344` | N | Y | `entry._mutexSkipCount = (entry._mutexSkipCount \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:369` | N | Y | `const defGenAtStart = entry._defGeneration \|\| 0;` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:419` | N | Y | `if ((entry._defGeneration \|\| 0) !== defGenAtStart) {` |
| B3_DEFAULT_PARAM | `core/Supervisor.js:503` | N | Y | `// poll cycle in DEGRADED (lastRedAt=0 → set to now → redDuration=0 →` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:652` | N | Y | `entry._alertFailures = (entry._alertFailures \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:857` | N | Y | `console.warn(`${this.label} hmac key read failed [${e.code \|\| 'unknown'}]: ${e.message}; regenerating`);` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:866` | N | Y | `console.error(`${this.label} hmac key write failed [${e.code \|\| 'unknown'}]: ${e.message} — entries will be unsigned and replay will reject all entries`);` |
| B5_INLINE_FALLBACK | `core/Supervisor.js:939` | N | Y | `console.error(`${this.label} ledger append failed [${err.code \|\| 'unknown'}]:`, err.message, '(path:', this.ledgerPath + ')');` |
| B3_DEFAULT_PARAM | `core/SupportResistanceDetector.js:16` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `core/SupportResistanceDetector.js:141` | N | Y | `priceFrequency[highRounded] = (priceFrequency[highRounded] \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/SupportResistanceDetector.js:142` | N | Y | `priceFrequency[lowRounded] = (priceFrequency[lowRounded] \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/SupportResistanceDetector.js:304` | N | Y | `volumeProfile[midPrice] = (volumeProfile[midPrice] \|\| 0) + v(candle);` |
| B5_INLINE_FALLBACK | `core/SupportResistanceDetector.js:389` | N | Y | `methodCounts[level.method] = (methodCounts[level.method] \|\| 0) + 1;` |
| B3_DEFAULT_PARAM | `core/SupportResistanceDetector.js:486` | N | Y | `getSuggestion(price, timeframe = 'primary') {` |
| B3_DEFAULT_PARAM | `core/SymbolTradingContext.js:41` | N | Y | `constructor(symbol, candleStore, config = {}) {` |
| B5_INLINE_FALLBACK | `core/SymbolTradingContext.js:108` | N | Y | `const decimals = this.metadata?.decimals ?? 2;` |
| B5_INLINE_FALLBACK | `core/SymbolTradingContext.js:114` | N | Y | `return this.metadata?.minOrder ?? 1;` |
| B4_MODULE_CONSTANT | `core/TRAIDecisionModule.js:32` | N | Y | `const VERSION_HASH = 'v2.0.0-telem';` |
| B3_DEFAULT_PARAM | `core/TRAIDecisionModule.js:39` | N | Y | `constructor(config = {}) {` |
| B1_ENV_READ | `core/TRAIDecisionModule.js:90` | N | Y | `process.env.TRAI_PATTERN_PACK_PATH \|\| './data/pattern-pack.json'` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:256` | N | Y | `...(decision.riskAssessment.factors \|\| []),` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:318` | N | Y | `const fallbackAction = (signal.action \|\| 'HOLD').toString().toUpperCase();` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:408` | N | Y | `patternMemoryUsed: decision.patternMemoryMatch \|\| false,` |
| B3_DEFAULT_PARAM | `core/TRAIDecisionModule.js:469` | N | Y | `_extractPatternMemoryFeatures(context = {}) {` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:470` | N | Y | `const ind = context.indicators \|\| {};` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:542` | N | Y | `const actionLower = (signal.action \|\| '').toString().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:646` | N | Y | `const actionLower = (action \|\| '').toString().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:792` | N | Y | `const originalActionLower = (originalAction \|\| '').toString().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:829` | N | Y | `const prompt = `${symbol} ${signal.action} ${(signal.confidence * 100).toFixed(0)}%, RSI ${context.indicators?.rsi?.toFixed(0) \|\| 'N/A'}, ${context.trend \|\| 'sideways'} trend.` |
| B3_DEFAULT_PARAM | `core/TRAIDecisionModule.js:849` | N | Y | `generateRuleBasedReasoning(decision, context = {}) {` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:865` | N | Y | `const rsi = context.indicators.rsi?.toFixed(1) \|\| '?';` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:866` | N | Y | `const trend = context.trend ?? 'missing';` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:867` | N | Y | `const vol = context.volatility?.toFixed(3) \|\| '?';` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:936` | N | Y | `const patterns = (signal?.patterns \|\| []).map(p => p.name \|\| p).filter(Boolean).sort().join(',');` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:939` | N | Y | `const scope = normalizePatternScope(context \|\| {}, 'TRAIDecisionModule.generatePatternKey');` |
| B1_ENV_READ | `core/TRAIDecisionModule.js:1029` | N | N | `const tradingMode = process.env.BACKTEST_MODE === 'true' ? 'backtest' :` |
| B1_ENV_READ | `core/TRAIDecisionModule.js:1030` | N | Y | `(process.env.TRADING_MODE === 'live' \|\| process.env.ENABLE_LIVE_TRADING === 'true') ? 'live' : 'paper';` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:1053` | N | Y | `patternIds: (signal?.patterns \|\| []).map(p => p.id \|\| p.name \|\| p).slice(0, 5),` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:1054` | N | Y | `riskFlags: decision.riskAssessment?.factors \|\| []` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:1061` | N | Y | `reasonSummary: (decision.reasoning \|\| '').slice(0, 200),` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:1064` | N | Y | `chosenPatternIds: (decision.adjustments \|\| []).map(a => a.type).slice(0, 5),` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:1094` | N | Y | `(this.state.successfulTrades + this.state.failedTrades) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TRAIDecisionModule.js:1158` | N | Y | `console.warn(`[TRAI] Skipped trade outcome learning: ${tradeData.tradeId \|\| 'unknown trade'} did not produce a valid pattern outcome`);` |
| B5_INLINE_FALLBACK | `core/TRAIPatternIntegration.js:46` | N | Y | `this.patterns = pack.patterns \|\| [];` |
| B5_INLINE_FALLBACK | `core/TRAIPatternIntegration.js:47` | N | Y | `this.antiPatterns = pack.antiPatterns \|\| [];` |
| B3_DEFAULT_PARAM | `core/TRAIPatternIntegration.js:75` | N | Y | `evaluate(signal, context = {}) {` |
| B5_INLINE_FALLBACK | `core/TRAIPatternIntegration.js:152` | N | Y | `dims.direction = signal.direction \|\| context.direction \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/TRAIPatternIntegration.js:173` | N | Y | `const conf = signal.confidence \|\| context.confidence \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TRAIPatternIntegration.js:189` | N | Y | `const price = context.entryPrice \|\| signal.price \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:128` | N | Y | `const coins = response.data.coins \|\| [];` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:149` | N | Y | `const quotes = response.data.quotes \|\| [];` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:176` | N | Y | `nextUpdate: data.time_until_update \|\| 'unknown'` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:198` | N | Y | `})) \|\| [];` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:229` | N | Y | `price: market.current_price?.usd \|\| 0,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:233` | N | Y | `high24h: market.high_24h?.usd \|\| 0,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:234` | N | Y | `low24h: market.low_24h?.usd \|\| 0,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:235` | N | Y | `ath: market.ath?.usd \|\| 0,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:236` | N | Y | `athDate: market.ath_date?.usd?.split('T')[0] \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:238` | N | Y | `marketCap: market.market_cap?.usd \|\| 0,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:239` | N | Y | `marketCapRank: data.market_cap_rank \|\| 0,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:240` | N | Y | `sentimentUp: data.sentiment_votes_up_percentage \|\| 50,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:241` | N | Y | `sentimentDown: data.sentiment_votes_down_percentage \|\| 50,` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:244` | N | Y | `newsHeadlines: newsHeadlines \|\| []` |
| B5_INLINE_FALLBACK | `core/TRAIWebContext.js:286` | N | Y | `marketCap: meta.marketCap \|\| 0,` |
| B3_DEFAULT_PARAM | `core/Telemetry.js:10` | N | Y | `constructor(options = {}) {` |
| B2_CONFIG_FALLBACK | `core/Telemetry.js:11` | N | Y | `this.enabled = options.enabled ?? true;` |
| B2_CONFIG_FALLBACK | `core/Telemetry.js:12` | N | Y | `this.logToConsole = options.logToConsole ?? false; // Don't spam console` |
| B3_DEFAULT_PARAM | `core/Telemetry.js:51` | N | Y | `event(type, payload = {}) {` |
| B3_DEFAULT_PARAM | `core/Telemetry.js:80` | N | Y | `metric(name, value, tags = {}) {` |
| B3_DEFAULT_PARAM | `core/TimeFrameManager.js:25` | N | Y | `constructor(baseTimeframe = "1m", config = {}) {` |
| B3_DEFAULT_PARAM | `core/TimeFrameManager.js:216` | N | Y | `addTimeframe(timeframe, options = {}) {` |
| B3_DEFAULT_PARAM | `core/TimeFrameManager.js:320` | N | Y | `getCandles(timeframe, count = 100, options = {}) {` |
| B5_INLINE_FALLBACK | `core/TimeFrameManager.js:353` | N | Y | `const candleArray = this.candles.get(timeframe) \|\| [];` |
| B5_INLINE_FALLBACK | `core/TimeFrameManager.js:365` | N | Y | `result = result.map(c => [_t(c) \|\| c.timestamp, _o(c) \|\| c.open, _h(c) \|\| c.high, _l(c) \|\| c.low, _c(c) \|\| c.close, _v(c) \|\| c.volume \|\| 0]);` |
| B5_INLINE_FALLBACK | `core/TimeFrameManager.js:367` | N | Y | `result = result.map(c => [_o(c) \|\| c.open, _h(c) \|\| c.high, _l(c) \|\| c.low, _c(c) \|\| c.close, _v(c) \|\| c.volume \|\| 0]);` |
| B3_DEFAULT_PARAM | `core/TimeFrameManager.js:408` | N | Y | `getCurrentCandle(timeframe, includePending = false) {` |
| B3_DEFAULT_PARAM | `core/TimeFrameManager.js:441` | N | Y | `aggregateCandles(sourceCandles, targetTimestamp, method = 'OHLCV') {` |
| B5_INLINE_FALLBACK | `core/TimeFrameManager.js:465` | N | Y | `const volumes = candles.map(c => _v(c) \|\| c.volume \|\| 0);` |
| B5_INLINE_FALLBACK | `core/TimeFrameManager.js:488` | N | Y | `const volume = _v(candle) \|\| candle.volume \|\| 0;` |
| B3_DEFAULT_PARAM | `core/TimeFrameManager.js:769` | N | Y | `exportData(timeframes = null, options = {}) {` |
| B5_INLINE_FALLBACK | `core/TimeFrameManager.js:960` | N | Y | `return (direction \|\| '').toString().toLowerCase(); // CHANGE 614` |
| B5_INLINE_FALLBACK | `core/TimeFrameManager.js:970` | N | Y | `return (signal \|\| '').toString().toLowerCase(); // CHANGE 614` |
| B4_MODULE_CONSTANT | `core/TraceSpine.js:3` | N | Y | `const TRACE_EVENT_MAX_BUFFERED_BYTES_LIMIT = 16777216;` |
| B4_MODULE_CONSTANT | `core/TraceSpine.js:4` | N | Y | `const TRACE_EVENT_MAX_ARRAY_ITEMS = 100;` |
| B4_MODULE_CONSTANT | `core/TraceSpine.js:5` | N | Y | `const TRACE_EVENT_MAX_OBJECT_KEYS = 100;` |
| B4_MODULE_CONSTANT | `core/TraceSpine.js:6` | N | Y | `const TRACE_SCOPE_KEYS = ['symbol', 'timeframe', 'brokerId', 'accountId', 'assetClass', 'executionMode', 'scopeKey'];` |
| B4_MODULE_CONSTANT | `core/TraceSpine.js:7` | N | Y | `const TRACE_REQUIRED_SCOPE_KEYS = ['symbol', 'timeframe', 'brokerId', 'accountId', 'assetClass', 'executionMode'];` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:10` | N | Y | `function createTraceId(prefix = 'trace', now = () => Date.now()) {` |
| B5_INLINE_FALLBACK | `core/TraceSpine.js:11` | N | Y | `const safePrefix = String(prefix \|\| 'trace').replace(/[^a-zA-Z0-9_-]/g, '_');` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:18` | N | Y | `function isTraceEnabled(ctx = {}) {` |
| B2_CONFIG_FALLBACK | `core/TraceSpine.js:19` | N | Y | `const config = ctx.config \|\| {};` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:45` | N | Y | `function sanitizeTracePayload(value, depth = 0, seen = new WeakSet()) {` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:53` | N | Y | `function sanitizeTracePayloadUnsafe(value, depth = 0, seen = new WeakSet()) {` |
| B5_INLINE_FALLBACK | `core/TraceSpine.js:104` | N | Y | `return Object.entries(fields \|\| {});` |
| B2_CONFIG_FALLBACK | `core/TraceSpine.js:158` | N | Y | `const cfg = (ctx && ctx.config) \|\| {};` |
| B5_INLINE_FALLBACK | `core/TraceSpine.js:200` | N | Y | `out.scopeStatus = out.scopeStatus \|\| 'missing_runtime_scope';` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:220` | N | Y | `function buildTraceEventPayload(ctx, event, fields, fieldsCoerced = false) {` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:243` | N | Y | `function notifyTraceSubscribers(ctx, event, fields, fieldsCoerced = false) {` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:268` | N | Y | `function emitTraceEventToDashboard(ctx, event, fields, fieldsCoerced = false) {` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:276` | N | Y | `function emitTraceEventToDashboardUnsafe(ctx, event, fields, fieldsCoerced = false) {` |
| B3_DEFAULT_PARAM | `core/TraceSpine.js:313` | N | Y | `function emitTrace(ctx, event, fields = {}) {` |
| B3_DEFAULT_PARAM | `core/TradeIntelligenceEngine.js:47` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `core/TradeIntelligenceEngine.js:102` | N | Y | `evaluate(trade, marketData, indicators, context = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:209` | N | Y | `// HIGH-18: was `indicators.adx \|\| 20` which silently produced WEAK_TREND` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:619` | N | Y | `// `currentDrawdown ?? 0` substituted phantom 0 for missing data,` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:634` | N | Y | `// HIGH-19/20/21: same-function risk-context fallbacks. `\|\| 0`` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:639` | N | Y | `// HIGH-19: was `?? 0` which silently suppressed LOSING_STREAK` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:651` | N | Y | `// HIGH-20: was `?? 0` which silently suppressed BAD_DAY/GOOD_DAY` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:665` | N | Y | `// HIGH-21: was `?? 0` which silently suppressed HIGH_EXPOSURE` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:866` | N | Y | `const tradePatterns = trade.patterns \|\| [];` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:943` | N | Y | `const avgPnl = similarTrades.reduce((sum, t) => sum + (t.pnl \|\| 0), 0) / similarTrades.length;` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1105` | N | Y | `(scores.regime?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1106` | N | Y | `(scores.momentum?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1107` | N | Y | `(scores.structure?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1108` | N | Y | `(scores.candle?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1109` | N | Y | `(scores.tradeContext?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1110` | N | Y | `(scores.risk?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1111` | N | Y | `(scores.volume?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1112` | N | Y | `(scores.trai?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1113` | N | Y | `(scores.whale?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1114` | N | Y | `(scores.pattern?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1115` | N | Y | `(scores.history?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1116` | N | Y | `(scores.botConfidence?.score \|\| 0) +` |
| B5_INLINE_FALLBACK | `core/TradeIntelligenceEngine.js:1117` | N | Y | `(scores.ema?.score \|\| 0);` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:107` | N | Y | `function roundFiniteOrNull(value, decimals = 2) {` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:144` | N | Y | `const n = positiveNumberOrNull(sizeUsd) ?? 1;` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:160` | N | Y | `function exitNotionalConflictOrNull(exit, expectedNotional, options = {}) {` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:177` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/TradeJournal.js:202` | N | Y | `maxInMemoryTrades: config.maxInMemoryTrades \|\| 5000,` |
| B2_CONFIG_FALLBACK | `core/TradeJournal.js:203` | N | Y | `maxEquityPoints: config.maxEquityPoints \|\| 10000,` |
| B2_CONFIG_FALLBACK | `core/TradeJournal.js:204` | N | Y | `autoSaveInterval: config.autoSaveInterval \|\| 60000,  // 1 min` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:497` | N | Y | `partialExitCount: (nonNegativeIntegerOrNull(entry.partialExitCount) ?? 0) + 1,` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:523` | N | Y | `recordOpenTradeReconciliation(details = {}) {` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:625` | N | Y | `getEquityCurve(limit = 500) {` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:654` | N | Y | `getTradeHistory(filters = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:669` | N | Y | `const perPage = filters.perPage \|\| 50;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:670` | N | Y | `const page = filters.page \|\| 1;` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:760` | N | Y | `getDailySummaries(days = 90) {` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:777` | N | Y | `d.grossPnl += trade.grossPnl \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:778` | N | Y | `d.fees += trade.fees \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:779` | N | Y | `d.netPnl += trade.netPnl \|\| 0;` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:926` | N | Y | `exportCSV(options = {}) {` |
| B2_CONFIG_FALLBACK | `core/TradeJournal.js:927` | N | Y | `const since = options.since \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:957` | N | Y | `(t.patterns \|\| []).map(p => p.name).join('; '),` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:958` | N | Y | `t.indicators?.rsi?.toFixed(1) \|\| '',` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:959` | N | Y | `t.indicators?.macd?.toFixed(4) \|\| '',` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:960` | N | Y | `t.indicators?.trend \|\| '',` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:961` | N | Y | `t.balanceAfter?.toFixed(2) \|\| ''` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1097` | N | Y | `s.grossPnl += trade.grossPnl \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1098` | N | Y | `s.totalFees += trade.fees \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1125` | N | Y | `s._winHoldTime += trade.holdTimeMs \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1128` | N | Y | `s._lossHoldTime += trade.holdTimeMs \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1130` | N | Y | `s._totalHoldTime += trade.holdTimeMs \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1149` | N | Y | `s.largestPosition = Math.max(s.largestPosition, trade.usdValue \|\| 0);` |
| B3_DEFAULT_PARAM | `core/TradeJournal.js:1256` | N | Y | `_appendFile(filepath, line, options = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1362` | N | Y | `partialExitCount: (nonNegativeIntegerOrNull(entry.partialExitCount) ?? 0) + 1,` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1464` | N | Y | `b.netPnl += trade.netPnl \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1465` | N | Y | `b.totalHoldTime += trade.holdTimeMs \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournal.js:1515` | N | Y | `if (String(record.scopeKey \|\| '') !== this.scope.scopeKey) {` |
| B4_MODULE_CONSTANT | `core/TradeJournalBridge.js:34` | N | Y | `const JOURNAL_INFRASTRUCTURE_FAILURE_SOURCE = 'journal_persistence_down';` |
| B4_MODULE_CONSTANT | `core/TradeJournalBridge.js:35` | N | Y | `const JOURNAL_INFRASTRUCTURE_FAILURE_THRESHOLD = 3;` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:73` | N | Y | `function roundedNumberOrNull(v, digits = 2) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:115` | N | Y | `const message = nonEmptyStringOrNull(err?.message) \|\| '';` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:132` | N | Y | `return ['EXIT', 'SELL', 'COVER'].includes(type) \|\| ['EXIT', 'SELL', 'COVER'].includes(action);` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:368` | N | Y | `function exitActionOrNull(exitRecord, normalizedData = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:383` | N | Y | `if (err instanceof Error) return err.message \|\| err.name \|\| 'Error';` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:513` | N | Y | `function resolveJournalDataDir(bot, config = {}, scope = resolveJournalScope(bot)) {` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:521` | N | Y | `function resolveReplayDir(journalDataDir, config = {}) {` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:533` | N | Y | `constructor(bot, config = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:618` | N | Y | `throw new Error(`Entry ${entryData?.orderId \|\| 'unknown'} missing activeTrade.symbol; refusing boot-scope journal attribution`);` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:991` | N | Y | `_recordTradeLogClose(exitRecord, source = 'logTrade') {` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:1142` | N | Y | `_recordVisibilityFailure(eventType, details = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1151` | N | Y | `eventType: String(eventType \|\| 'trade_visibility_failure'),` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1235` | N | Y | `emitTrace(this.bot \|\| {}, 'TRADE_JOURNAL_RECONCILIATION_REQUIRED', {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1275` | N | Y | `emitTrace(this.bot \|\| {}, 'TRADE_JOURNAL_INFRASTRUCTURE_HALTED', {` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:1301` | N | Y | `_recordJournalPersistenceSuccess(context = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1322` | N | Y | `emitTrace(this.bot \|\| {}, 'TRADE_JOURNAL_INFRASTRUCTURE_RECOVERED', {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1340` | N | Y | `const reason = `Trade visibility failure could not be persisted: eventType=${record.eventType \|\| 'unknown'} orderId=${record.orderId \|\| 'unknown'}`;` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1368` | N | Y | `const maxPending = Math.max(1, Math.floor(this._maxPendingVisibilityErrors \|\| 50));` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:1543` | N | Y | `_pushTradeClosedNotification(orderId, exitRecord, replayPath, options = {}) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1588` | N | Y | `case 'request_journal_breakdowns': bridge._sendBreakdown(msg.dimension \|\| 'regime'); break;` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1678` | N | Y | `.sort((a, b) => Number(a.timestamp \|\| 0) - Number(b.timestamp \|\| 0));` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1683` | N | Y | `.reduce((sum, bundle) => sum + (bundle.journal?.openTrades?.size \|\| 0), 0);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1691` | N | Y | `const netPnl = trades.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) \|\| 0), 0);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1692` | N | Y | `const wins = trades.filter(trade => (finiteNumberOrNull(trade.netPnl) \|\| 0) > 0);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1693` | N | Y | `const losses = trades.filter(trade => (finiteNumberOrNull(trade.netPnl) \|\| 0) < 0);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1694` | N | Y | `const grossWins = wins.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) \|\| 0), 0);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1695` | N | Y | `const grossLosses = losses.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) \|\| 0), 0);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1697` | N | Y | `const todayTrades = trades.filter(trade => new Date(Number(trade.timestamp \|\| 0)).toISOString().split('T')[0] === todayKey);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1698` | N | Y | `const todayPnl = todayTrades.reduce((sum, trade) => sum + (finiteNumberOrNull(trade.netPnl) \|\| 0), 0);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1699` | N | Y | `const todayWins = todayTrades.filter(trade => (finiteNumberOrNull(trade.netPnl) \|\| 0) > 0).length;` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1701` | N | Y | `const startingBalance = finiteNumberOrNull(this._journalStartingBalance) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1708` | N | Y | `const sortedByPnl = trades.slice().sort((a, b) => (finiteNumberOrNull(a.netPnl) \|\| 0) - (finiteNumberOrNull(b.netPnl) \|\| 0));` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1718` | N | Y | `const pnl = finiteNumberOrNull(trade.netPnl) \|\| 0;` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:1790` | N | Y | `_combinedReplayList(limit = 50) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1792` | N | Y | `.flatMap(bundle => bundle.replay?.listReplays?.(limit) \|\| [])` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1793` | N | Y | `.sort((a, b) => Number(b.savedAt \|\| b.timestamp \|\| 0) - Number(a.savedAt \|\| a.timestamp \|\| 0))` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1811` | N | Y | `const pnl = finiteNumberOrNull(trade.netPnl) \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1814` | N | Y | `bucket.totalHoldTime += finiteNumberOrNull(trade.holdTimeMs) \|\| 0;` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:1917` | N | Y | `_sendReplayList(limit = 50) {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1954` | N | Y | `const target = idx + (parseInt(req.query.direction) \|\| 1);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1963` | N | Y | `app.get('/api/replays', (req, res) => res.json(bridge._combinedReplayList(parseInt(req.query.limit) \|\| 50)));` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1965` | N | Y | `app.get('/api/journal/equity', (req, res) => res.json(bridge.journal.getEquityCurve(parseInt(req.query.limit) \|\| 500)));` |
| B3_DEFAULT_PARAM | `core/TradeJournalBridge.js:1982` | N | Y | `const sendJSON = (data, status = 200) => {` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:1994` | N | Y | `const target = idx + (parseInt(url.searchParams.get('direction')) \|\| 1);` |
| B5_INLINE_FALLBACK | `core/TradeJournalBridge.js:2002` | N | Y | `if (url.pathname === '/api/replays') return sendJSON(this._combinedReplayList(parseInt(url.searchParams.get('limit')) \|\| 50));` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:116` | N | Y | `const n = samples \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:118` | N | Y | `const r = winRate > 1 ? winRate / 100 : (winRate \|\| 0);` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:126` | N | Y | `const p = Math.abs(pct \|\| 0);` |
| B3_DEFAULT_PARAM | `core/TradeNarrator.js:150` | N | Y | `function fmtPct(v, digits = 2) {` |
| B3_DEFAULT_PARAM | `core/TradeNarrator.js:155` | N | Y | `function fmtUsd(v, digits = 2) {` |
| B3_DEFAULT_PARAM | `core/TradeNarrator.js:183` | N | Y | `function roundedNumberOrNull(v, digits = 2) {` |
| B3_DEFAULT_PARAM | `core/TradeNarrator.js:270` | N | Y | `function renderUserLine(key, fields = {}) {` |
| B1_ENV_READ | `core/TradeNarrator.js:307` | N | N | `const seed = process.env.NARRATOR_LABEL_SEED` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:366` | N | Y | `.sort((a, b) => (b.confidence \|\| 0) - (a.confidence \|\| 0))` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:373` | N | Y | `const conf = p.confidence != null ? fmtPct((p.confidence \|\| 0) * (p.confidence > 1 ? 1 : 100), 0) : '—';` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:374` | N | Y | `const sig = p.signature \|\| p.id \|\| '';` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:393` | N | Y | `conviction: confidenceBucket(best.confidence \|\| 0),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:415` | N | Y | `.sort((a, b) => (b.confidence \|\| 0) - (a.confidence \|\| 0));` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:421` | N | Y | `const dir = (r.direction \|\| '—').toUpperCase();` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:422` | N | Y | `const conf = fmtPct((r.confidence \|\| 0) * 100, 1);` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:435` | N | Y | `direction: (r.direction \|\| 'hold').toLowerCase(),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:436` | N | Y | `conviction: confidenceBucket(r.confidence \|\| 0),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:442` | N | Y | `? String(winner.direction \|\| '').toLowerCase()` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:476` | N | Y | ``confidence  ${(multipliers.confidence \|\| 1).toFixed(2)}x`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:477` | N | Y | ``volatility  ${(multipliers.volatility \|\| 1).toFixed(2)}x`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:478` | N | Y | ``pattern     ${(multipliers.pattern \|\| 1).toFixed(2)}x  (${patternStatus})`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:479` | N | Y | ``confluence  ${(multipliers.confluence \|\| 1).toFixed(2)}x`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:480` | N | Y | ``combined    ${(multipliers.combined \|\| 1).toFixed(2)}x`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:560` | N | Y | ``   tradeId:    ${tradeId \|\| '—'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:561` | N | Y | ``   strategy:   ${strategy \|\| '—'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:562` | N | Y | ``   direction:  ${(direction \|\| '—').toUpperCase()}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:564` | N | Y | ``   confidence: ${fmtPct((confidence \|\| 0) * (confidence > 1 ? 1 : 100), 1)}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:572` | N | Y | `const label = this.labelFor(strategy \|\| 'unknown');` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:585` | N | Y | `direction: (direction \|\| 'long').toLowerCase(),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:586` | N | Y | `conviction: confidenceBucket(confidence \|\| 0),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:618` | N | Y | ``   tradeId:       ${tradeId \|\| '—'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:623` | N | Y | ``   locked profit: ${fmtPct((profitPercent \|\| 0) * 100, 2)}  (${fmtUsd(partialPnl)})`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:639` | N | Y | `tier: tier \|\| 1,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:640` | N | Y | `locked_pct: Number(((profitPercent \|\| 0) * 100).toFixed(2)),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:647` | N | Y | `pnl_usd: fmtUsd(payload.pnl_usd \|\| 0),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:671` | N | Y | `const strat = strategy \|\| (ctxRec && ctxRec.strategy) \|\| 'unknown';` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:685` | N | Y | ``   tradeId:    ${tradeId \|\| '—'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:691` | N | Y | ``   reason:     ${reason \|\| '—'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:723` | N | Y | `pnl_pct: fmtPct(payload.pnl_pct \|\| 0, 2),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:724` | N | Y | `pnl_usd: fmtUsd(payload.pnl_usd \|\| 0),` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:739` | N | Y | `const kind = String(frame.kind \|\| frame.gate_kind \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:761` | N | Y | ``   kind:     ${payload.gate_kind \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:762` | N | Y | ``   symbol:   ${payload.symbol \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:763` | N | Y | ``   traceId:  ${payload.traceId \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:794` | N | Y | ``   broker:   ${payload.broker \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:795` | N | Y | ``   symbol:   ${payload.symbol \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:796` | N | Y | ``   action:   ${payload.action \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:797` | N | Y | ``   orderId:  ${payload.orderId \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:798` | N | Y | ``   reason:   ${payload.reason \|\| '-'}`,` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:924` | N | Y | `const r = String(reason \|\| '').toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:946` | N | Y | `const s = String(name \|\| 'Pattern').slice(0, 40);` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:947` | N | Y | `return s.replace(/[^\w\s\-]/g, '').trim() \|\| 'Pattern';` |
| B5_INLINE_FALLBACK | `core/TradeNarrator.js:952` | N | Y | `const r = String(reason \|\| '').toLowerCase();` |
| B3_DEFAULT_PARAM | `core/TradeReplayCapture.js:76` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/TradeReplayCapture.js:81` | N | Y | `this.candlesBefore = config.candlesBefore \|\| 60;   // candles before entry` |
| B2_CONFIG_FALLBACK | `core/TradeReplayCapture.js:82` | N | Y | `this.candlesAfter = config.candlesAfter \|\| 30;     // candles after exit` |
| B5_INLINE_FALLBACK | `core/TradeReplayCapture.js:186` | N | Y | `const currentCandles = (priceHistory \|\| []).slice(-this.candlesBefore).map(candle => ({` |
| B3_DEFAULT_PARAM | `core/TradeReplayCapture.js:263` | N | Y | `listReplays(limit = 100) {` |
| B3_DEFAULT_PARAM | `core/TradingLoop.js:74` | N | Y | `_diag(stage, fields = {}) {` |
| B1_ENV_READ | `core/TradingLoop.js:75` | N | N | `if (process.env.STRATEGY_DIAG !== 'true') return;` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:113` | N | Y | `console.warn(`[MARKET-SCOPE][FALLBACK] ${stage} symbol=${symbol} reason=${reason} scopedMarketSymbol=${scopedMarketSymbol \|\| 'missing'} using global marketData symbol=${marketSymbol \|\| 'missing'}`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:118` | N | Y | `scopedMarketSymbol: scopedMarketSymbol \|\| 'missing',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:119` | N | Y | `marketSymbol: marketSymbol \|\| 'missing'` |
| B3_DEFAULT_PARAM | `core/TradingLoop.js:359` | N | Y | `_autopsyStrategySignals(orchResult, indicators = {}) {` |
| B3_DEFAULT_PARAM | `core/TradingLoop.js:500` | N | Y | `_entryRiskGates(finalDirection, directionFilter, priceHistory, activeTrades, maxPositions, minConfidence, confidence, riskGates = [], decisionInstantKey = null) {` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:572` | N | Y | `executionMode: scope.executionMode \|\| 'paper',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:627` | N | Y | `action: decision?.action \|\| 'HOLD',` |
| B2_CONFIG_FALLBACK | `core/TradingLoop.js:722` | N | Y | `const cfg = this.ctx.config \|\| {};` |
| B2_CONFIG_FALLBACK | `core/TradingLoop.js:751` | N | Y | `const cfg = this.ctx.config \|\| {};` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:796` | N | Y | `console.error(`[TradingLoop] ${frame?.type \|\| 'dashboard'} scope incomplete (${missingScope.join(', ')}) - refusing unscoped websocket frame`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:804` | N | Y | `console.error(`[TradingLoop] dashboard ${frame?.type \|\| 'unknown'} broadcast failed: ${err.message}`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:851` | N | Y | `const action = String(activeTrade.action \|\| '').trim().toUpperCase();` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:852` | N | Y | `const direction = String(activeTrade.direction \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:855` | N | Y | `throw new Error(`[TradingLoop] active trade ${activeTrade.orderId \|\| activeTrade.id \|\| 'unknown'} missing close side`);` |
| B2_CONFIG_FALLBACK | `core/TradingLoop.js:859` | N | Y | `const evalRules = this.ctx.evalRules \|\| this.ctx.config?.evalRules \|\| {};` |
| B2_CONFIG_FALLBACK | `core/TradingLoop.js:860` | N | Y | `const cfg = evalRules.ttp?.consistency \|\| {};` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:871` | N | Y | `const runtimeAssetClass = String(runtimeScope.assetClass \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:878` | N | Y | `const tradeAssetClass = String(activeTrade.assetClass \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:880` | N | Y | `throw new Error(`[TTP_CONSISTENCY] active trade ${activeTrade.orderId \|\| activeTrade.id \|\| 'unknown'} assetClass=${tradeAssetClass} conflicts with stock runtime`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:896` | N | Y | `throw new Error(`[TTP_CONSISTENCY] active trade ${activeTrade.orderId \|\| activeTrade.id \|\| 'unknown'} missing valid entryPrice`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:899` | N | Y | `throw new Error(`[TTP_CONSISTENCY] active trade ${activeTrade.orderId \|\| activeTrade.id \|\| 'unknown'} missing valid sizeUsd/size`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1048` | N | Y | `: (marketData?.priceSource \|\| 'market_data');` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1053` | N | Y | `marketSymbol: this.ctx.marketData?.symbol \|\| 'missing'` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1093` | N | Y | `const indicators = dtoState.indicators \|\| {};` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1272` | N | Y | `console.log(`[VIS][TradingLoop] analyze symbol=${symbol} route=${symCtx ? 'symbolContext' : 'global'} marketSymbol=${this.ctx.marketData?.symbol \|\| '(missing)'} priceHistory=${priceHistory.length} broker=${analysisScope.brokerId \|\| '(missing)'} assetClass=${analysisScope.assetClass \|\| '(missing)'}`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1286` | N | Y | `marketSymbol: this.ctx.marketData?.symbol \|\| 'missing'` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1384` | N | Y | `winner: orchResult.winnerStrategy \|\| 'none',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1405` | N | Y | `console.log(`\n📊 $${cleanPrice} \| Conf: ${orchResult.confidence.toFixed(0)}% \| RSI: ${Math.round(indicators.rsi)} \| ${indicators.trend} \| ${regime.currentRegime \|\| 'analyzing'}`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1451` | N | Y | `maxPositions: ConfigLoader.get('positionSizing.maxPositions') ?? 3,` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1499` | N | Y | `maxPositions: ConfigLoader.get('positionSizing.maxPositions') ?? 3,` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1527` | N | Y | `const maxPositions = ConfigLoader.get('positionSizing.maxPositions') ?? 3;` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1549` | N | Y | `// The prior chain `?? 10000` would silently pass $10K to` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1592` | N | Y | `priceSource: marketData?.priceSource \|\| 'market_data',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1693` | N | Y | `console.error(`[ENTRY] Blocked: simultaneous opposite ${finalDirection} entry for ${symbol}; trade=${oppositeStatus.tradeId \|\| 'unknown'}`);` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1733` | N | Y | `reason: decision.blockReason \|\| 'risk gate blocked entry',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1784` | N | Y | `reason: reasons.length > 0 ? reasons.join('\|') : (decision.blockReason \|\| 'not_entry_candidate'),` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1861` | N | Y | `winner: orchResult.winnerStrategy \|\| 'none',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1900` | N | Y | `executionMode: ledgerScope.executionMode \|\| 'paper',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1922` | N | Y | `// agreeing IS meaningful info; `\|\| 1` lied it as one. Use `??`` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1924` | N | Y | `count: orchResult.confluence.count ?? 1,` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1925` | N | Y | `agreeingStrategies: orchResult.confluence.strategies \|\| [],` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1931` | N | Y | `sizingMultiplier: orchResult.sizingMultiplier ?? 1.0,` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1932` | N | Y | `reason: `${orchResult.confluence.count ?? 1} strategies agree on ${orchResult.direction}`,` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1947` | N | Y | `...(orchResult.signalBreakdown \|\| {}),` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1966` | N | Y | `...(decision.ledgerData.confluence \|\| {}),` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:1967` | N | Y | `sizingMultiplier: entry.sizingMultiplier ?? decision.ledgerData.confluence?.sizingMultiplier ?? 1.0,` |
| B3_DEFAULT_PARAM | `core/TradingLoop.js:2037` | N | Y | `_checkRiskAndBuildDecision(direction, orchResult, minConfidence, confidence, riskContext = {}) {` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2051` | N | Y | `const riskGates = [...(riskCheck.riskGates \|\| [])];` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2055` | N | Y | `reason: riskCheck.reason \|\| 'none',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2066` | N | Y | `strategyName: orchResult.winnerStrategy \|\| orchResult.strategy \|\| 'unknown_strategy',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2069` | N | Y | `riskGates.push(...(riskAssessment.riskGates \|\| []));` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2073` | N | Y | `reason: riskAssessment.reason \|\| 'none',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2074` | N | Y | `riskLevel: riskAssessment.riskLevel \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2153` | N | Y | `const minPatternConf = ConfigLoader.get('confidence.candlePatternMinConfidence') \|\| 0.70;` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2154` | N | Y | `const candlePatterns = rawCandlePatterns.filter(p => (p.confidence \|\| 0) >= minPatternConf);` |
| B1_ENV_READ | `core/TradingLoop.js:2162` | N | N | `process.env.BACKTEST_NO_PATTERN_SAVE !== 'true' &&` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2203` | N | Y | `this._patternObservationCount = (this._patternObservationCount \|\| 0) + recordedObservations;` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2216` | N | Y | `// Soft-warn + \|\| 'unknown' fallback was dead defense. Throw if the` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2224` | N | Y | `parameters: regimeResult.details \|\| {}` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2303` | N | Y | `{ volatility: indicators.volatility, trend: indicators.trend, volume: marketData?.volume \|\| 'normal', regime: regime.currentRegime \|\| 'unknown', indicators, positionSize: stateManager.get('balance') * ConfigLoader.get('positionSizing.basePositionSize'), currentPosition: stateManager.get('position'), ...patternScope }` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2345` | N | Y | `const winnerSignalData = winnerResult?.signalData \|\| {};` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2348` | N | Y | `const signals = orchResult?.signalBreakdown?.signals \|\| [];` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2357` | N | Y | `reasons: orchResult.reasons \|\| [],` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2371` | N | Y | `regime: { regime: regime?.currentRegime \|\| 'unknown', confidence: regime?.confidence \|\| 0 }` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2379` | N | Y | `: `Waiting: Confidence ${decision.confidence?.toFixed(1) \|\| 0}% < ${(minConfidence * 100).toFixed(0)}% minimum`)` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2380` | N | Y | `: `${decision.action}: Confidence ${decision.confidence?.toFixed(1)}% \| ${orchResult.winnerStrategy \|\| 'signal'}`;` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2391` | N | Y | `regime: regime?.currentRegime \|\| 'unknown',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2392` | N | Y | `module: orchResult.winnerStrategy \|\| 'orchestrator',` |
| B5_INLINE_FALLBACK | `core/TradingLoop.js:2408` | N | Y | `const firing = new Map((orchResult.allResults \|\| []).map(r => [r.strategyName, r]));` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:91` | N | Y | `const premarketRecoveryCheck = String(state.phase \|\| '').toLowerCase() === 'pre';` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:101` | N | Y | `const closedSessionRecovery = ['ah', 'closed', 'holiday'].includes(String(state.phase \|\| '').toLowerCase());` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:139` | N | Y | `results: cancelResult.results \|\| [],` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:322` | N | Y | `this.logger.log(`[TTP_MARKET_TIME] cutoff enforcement complete date=${state.currentDateET} closed=${closed.length} orphanClosed=${orphanClosed.length} cancelled=${cancelResult?.cancelled \|\| 0} brokerFlatVerified=${brokerFlatVerified}`);` |
| B3_DEFAULT_PARAM | `core/TtpCutoffEnforcer.js:351` | N | Y | `async _routeEnforcementException(error, context = {}) {` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:353` | N | Y | `const key = context.key \|\| `${state.currentDateET \|\| 'unknown'}:${Number.isFinite(state.cutoffMinute) ? state.cutoffMinute : 'unknown'}`;` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:354` | N | Y | `const reason = error && error.message ? error.message : String(error \|\| 'unknown cutoff enforcement exception');` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:368` | N | Y | `context.closed \|\| [],` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:369` | N | Y | `context.orphanClosed \|\| [],` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:379` | N | Y | `closed: context.closed \|\| [],` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:380` | N | Y | `orphanClosed: context.orphanClosed \|\| [],` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:415` | N | Y | `const assetClass = String(trade?.assetClass \|\| this.assetClass \|\| '').trim().toLowerCase();` |
| B3_DEFAULT_PARAM | `core/TtpCutoffEnforcer.js:419` | N | Y | `_expectedBrokerPositions(activeTrades, symbolScope, state, options = {}) {` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:443` | N | Y | `: (existing?.quantity \|\| 0) + quantity;` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:454` | N | Y | `const direction = String(trade?.direction \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:456` | N | Y | `const action = String(trade?.action \|\| trade?.type \|\| '').trim().toUpperCase();` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:463` | N | Y | `const unit = String(trade?.remainingOrderQuantityUnit \|\| trade?.entryOrderQuantityUnit \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:522` | N | Y | `const side = String(position?.side \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:546` | N | Y | `const get = (type) => (parts.find(part => part.type === type) \|\| {}).value;` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:552` | N | Y | `const direction = String(trade?.direction \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:553` | N | Y | `const action = String(trade?.action \|\| '').trim().toUpperCase();` |
| B3_DEFAULT_PARAM | `core/TtpCutoffEnforcer.js:627` | N | Y | `_affectedSymbolsForQuarantine(closed = [], orphanClosed = [], failures = []) {` |
| B3_DEFAULT_PARAM | `core/TtpCutoffEnforcer.js:653` | N | Y | `async _quarantineUnverifiedBrokerFlatness(state, closed, orphanClosed, cancelResult, failures = []) {` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:711` | N | Y | `quarantine.persistenceError = result.error \|\| 'unknown_error';` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:742` | N | Y | `quarantine.haltErrors = [...(quarantine.haltErrors \|\| []), { symbol, error: error.message \|\| String(error) }];` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:781` | N | Y | `const error = `[TTP_MARKET_TIME] broker flatness quarantine clear failed: ${result.error \|\| 'unknown_error'}`;` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:787` | N | Y | `return { cleared: false, reason, error: result.error \|\| 'unknown_error' };` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:838` | N | Y | `const normalized = String(assetClass \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `core/TtpCutoffEnforcer.js:870` | N | Y | `.map(name => String(name \|\| '').trim().toLowerCase())` |
| B3_DEFAULT_PARAM | `core/TwoPoleOscillator.js:9` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/TwoPoleOscillator.js:11` | N | Y | `this.smaLength = config.smaLength \|\| 25;           // SMA period for deviation` |
| B2_CONFIG_FALLBACK | `core/TwoPoleOscillator.js:12` | N | Y | `this.filterLength = config.filterLength \|\| 15;      // Two-pole filter length (15 = balanced)` |
| B2_CONFIG_FALLBACK | `core/TwoPoleOscillator.js:15` | N | Y | `this.extremeOverbought = config.extremeOverbought \|\| 1.0;   // Pullback imminent` |
| B2_CONFIG_FALLBACK | `core/TwoPoleOscillator.js:16` | N | Y | `this.overbought = config.overbought \|\| 0.5;                 // Standard overbought` |
| B2_CONFIG_FALLBACK | `core/TwoPoleOscillator.js:18` | N | Y | `this.oversold = config.oversold \|\| -0.5;                     // Standard oversold` |
| B2_CONFIG_FALLBACK | `core/TwoPoleOscillator.js:19` | N | Y | `this.extremeOversold = config.extremeOversold \|\| -1.0;       // Bounce imminent` |
| B5_INLINE_FALLBACK | `core/TwoPoleOscillator.js:395` | N | Y | `const current = this.oscillatorHistory[this.oscillatorHistory.length - 1] \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TwoPoleOscillator.js:396` | N | Y | `const filtered = this.filteredHistory[this.filteredHistory.length - 1] \|\| 0;` |
| B5_INLINE_FALLBACK | `core/TwoPoleOscillator.js:457` | N | Y | `price: this.priceHistory[i] \|\| 0` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:156` | N | Y | `...(overrides \|\| {}),` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:182` | N | Y | `function resolveInitialMode(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/UnifiedPatternMemory.js:183` | N | Y | `const explicitMode = String(config.mode \|\| config.executionMode \|\| '').trim().toLowerCase();` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:193` | N | Y | `let ticker = sanitizePatternBucket(process.env.TRADING_PAIR \|\| '');` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:194` | N | N | `if (!ticker && process.env.CANDLE_DATA_FILE) {` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:195` | N | N | `ticker = sanitizePatternBucket(deriveReportAssetSlugFromDataFile(process.env.CANDLE_DATA_FILE));` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:197` | N | Y | `return ticker \|\| 'default';` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:200` | N | N | `const cls = process.env.ASSET_CLASS` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:201` | N | Y | `\|\| ((process.env.BROKER \|\| '').toLowerCase() === 'kraken' ? 'crypto' :` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:202` | N | Y | `(process.env.BROKER \|\| '').toLowerCase() === 'alpaca' ? 'stocks' : null);` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:226` | N | Y | `constructor(config = {}) {` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:230` | N | N | `persistToDisk: patternMemoryConfig.persistToDisk && process.env.BACKTEST_NO_PATTERN_SAVE !== 'true',` |
| B1_ENV_READ | `core/UnifiedPatternMemory.js:248` | N | Y | `this.dataDir = config.dataDir \|\| process.env.DATA_DIR \|\| (config.storagePath ? path.dirname(config.storagePath) : path.join(process.cwd(), 'data'));` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:289` | N | Y | `recordObservation(features, metadata = {}) {` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:401` | N | Y | `getConfidence(features, scopeInput = {}) {` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:476` | N | Y | `shouldAvoid(features, scopeInput = {}) {` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:488` | N | Y | `isPromoted(features, scopeInput = {}) {` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:616` | N | Y | `const statusDiff = (statusOrder[a[1].status] \|\| 2) - (statusOrder[b[1].status] \|\| 2);` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:790` | N | Y | `this.stats = { ...buildDefaultStats(), ...(data.stats \|\| {}) };` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:818` | N | Y | `switchSessionScope(scopeInput, details = {}) {` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:848` | N | Y | `reason: details.reason \|\| 'session_scope_switch',` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:877` | N | Y | `async forceBackup(reason = 'manual') {` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:919` | N | Y | `error.missingFields = scope.missingFields \|\| [];` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:1083` | N | Y | `getPatternStats(features, scopeInput = {}) {` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:1107` | N | Y | `evaluatePattern(features, options = {}) {` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:1128` | N | Y | `timesSeen: result.stats?.timesSeen \|\| 0,` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:1129` | N | Y | `winRate: result.stats?.winRate \|\| 0,` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:1130` | N | Y | `avgPnL: result.stats?.avgPnL \|\| 0,` |
| B3_DEFAULT_PARAM | `core/UnifiedPatternMemory.js:1141` | N | Y | `findSimilarPatterns(featuresOrQuery, threshold = 0.8, limit = 5) {` |
| B5_INLINE_FALLBACK | `core/UnifiedPatternMemory.js:1145` | N | Y | `: (featuresOrQuery.features \|\| []);` |
| B3_DEFAULT_PARAM | `core/VolumeProfile.js:40` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/VolumeProfile.js:43` | N | Y | `this.numBins = config.numBins \|\| 50;` |
| B2_CONFIG_FALLBACK | `core/VolumeProfile.js:46` | N | Y | `this.valueAreaPct = config.valueAreaPct \|\| 0.70;` |
| B2_CONFIG_FALLBACK | `core/VolumeProfile.js:49` | N | Y | `this.sessionLookback = config.sessionLookback \|\| 96;  // 96 x 15min = 24 hours` |
| B2_CONFIG_FALLBACK | `core/VolumeProfile.js:52` | N | Y | `this.lvnThresholdPct = config.lvnThresholdPct \|\| 0.20;` |
| B2_CONFIG_FALLBACK | `core/VolumeProfile.js:55` | N | Y | `this.hvnThresholdPct = config.hvnThresholdPct \|\| 0.60;` |
| B2_CONFIG_FALLBACK | `core/VolumeProfile.js:58` | N | Y | `this.recalcInterval = config.recalcInterval \|\| 5;` |
| B2_CONFIG_FALLBACK | `core/VolumeProfile.js:62` | N | Y | `this.outOfBalancePct = config.outOfBalancePct \|\| 0.5;` |
| B5_INLINE_FALLBACK | `core/VolumeProfile.js:247` | N | Y | `const cdVol = v(cd) \|\| 1; // Fallback to 1 if no volume` |
| B5_INLINE_FALLBACK | `core/VolumeProfile.js:265` | N | Y | `const maxDist = cdHigh - cdLow \|\| 1;` |
| B5_INLINE_FALLBACK | `core/WebSocketManager.js:30` | N | Y | `console.warn(`[WebSocketManager] Ignoring dashboard asset_change ${requestedAsset \|\| '(missing)'} - dashboard asset selection is display-only until SessionRouter owns broker transitions`);` |
| B1_ENV_READ | `core/WebSocketManager.js:109` | N | Y | `const wsUrl = process.env.WS_URL \|\| 'ws://localhost:3010/ws';` |
| B1_ENV_READ | `core/WebSocketManager.js:122` | N | N | `const authToken = process.env.WEBSOCKET_AUTH_TOKEN;` |
| B5_INLINE_FALLBACK | `core/WebSocketManager.js:245` | N | Y | `const newTimeframe = msg.timeframe \|\| '1m';` |
| B5_INLINE_FALLBACK | `core/WebSocketManager.js:256` | N | Y | `const timeframe = msg.timeframe \|\| '1m';` |
| B5_INLINE_FALLBACK | `core/WebSocketManager.js:257` | N | Y | `const limit = msg.limit \|\| 200;` |
| B5_INLINE_FALLBACK | `core/WebSocketManager.js:292` | N | Y | `const reason = msg.reason \|\| 'Manual pause from dashboard';` |
| B4_MODULE_CONSTANT | `core/WebSocketManager.js:334` | N | Y | `const PING_INTERVAL = 15000; // 15 seconds (more aggressive)` |
| B4_MODULE_CONSTANT | `core/WebSocketManager.js:335` | N | Y | `const PONG_TIMEOUT = 30000;  // 30 seconds (miss 2 pings = dead)` |
| B4_MODULE_CONSTANT | `core/WebSocketManager.js:336` | N | Y | `const DATA_TIMEOUT = 60000;  // 60 seconds no data = force reconnect` |
| B5_INLINE_FALLBACK | `core/WebSocketManager.js:357` | N | Y | `const timeSinceLastPong = Date.now() - (this.ctx.lastPongReceived \|\| 0);` |
| B5_INLINE_FALLBACK | `core/WebSocketManager.js:385` | N | Y | `const timeSinceData = Date.now() - (this.ctx.lastDashboardMessageReceived \|\| 0);` |
| B3_DEFAULT_PARAM | `core/WebhookOrderAdapter.js:41` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/WebhookOrderAdapter.js:42` | N | Y | `this.webhookUrl = config.webhookUrl \|\| '';` |
| B2_CONFIG_FALLBACK | `core/WebhookOrderAdapter.js:46` | N | Y | `this.timeout = config.timeout \|\| 5000;` |
| B2_CONFIG_FALLBACK | `core/WebhookOrderAdapter.js:48` | N | Y | `this.orderLogCap = config.orderLogCap \|\| 500;` |
| B4_MODULE_CONSTANT | `core/WhaleFilings.js:44` | N | Y | `const ARK_CSV_BASE = 'https://assets.ark-funds.com/fund-documents/funds-etf-csv/';` |
| B4_MODULE_CONSTANT | `core/WhaleFilings.js:45` | N | Y | `const ARK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;` |
| B4_MODULE_CONSTANT | `core/WhaleFilings.js:46` | N | Y | `const TICKER_MAP_TTL_MS = 24 * 60 * 60 * 1000;` |
| B4_MODULE_CONSTANT | `core/WhaleFilings.js:47` | N | Y | `const SUBMISSIONS_TTL_MS = 24 * 60 * 60 * 1000;` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:173` | N | Y | `return _tickerTitleMap.bySymbol.get(symbol) \|\| '';` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:178` | N | Y | `return _clean(name).toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/)[0] \|\| '';` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:211` | N | Y | `const xmlFiles = (index.directory.item \|\| [])` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:219` | N | Y | `const blocks = xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/g) \|\| [];` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:221` | N | Y | `const issuer = (block.match(/<(?:\w+:)?nameOfIssuer>([^<]*)/) \|\| [])[1] \|\| '';` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:222` | N | Y | `const value = Number((block.match(/<(?:\w+:)?value>([^<]*)/) \|\| [])[1]);` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:223` | N | Y | `const shares = Number((block.match(/<(?:\w+:)?sshPrnamt>([^<]*)/) \|\| [])[1]);` |
| B5_INLINE_FALLBACK | `core/WhaleFilings.js:226` | N | Y | `const agg = holdings.get(key) \|\| { issuer: _clean(issuer), shares: 0, value: 0 };` |
| B3_DEFAULT_PARAM | `core/WhaleFilings.js:271` | N | Y | `async function whaleActivityForSymbol(symbol, { userAgent, maxRows = 3 } = {}) {` |
| B3_DEFAULT_PARAM | `core/dto/DecisionLedgerSchema.js:162` | N | Y | `function buildLedgerRejection(message, missingFields = [], validationIssues = []) {` |
| B3_DEFAULT_PARAM | `core/dto/DecisionLedgerSchema.js:178` | N | Y | `function createLedgerSkeleton(input = {}) {` |
| B5_INLINE_FALLBACK | `core/exit/BreakEvenManager.js:35` | N | Y | `const contract = trade.exitContract \|\| {};` |
| B3_DEFAULT_PARAM | `core/exit/BreakEvenManager.js:48` | N | Y | `// Without this, riskAmount=0 makes (maxProfit >= 0) true on the first tick,` |
| B5_INLINE_FALLBACK | `core/exit/BreakEvenManager.js:59` | N | Y | `const maxProfit = trade.maxProfitPercent \|\| 0;` |
| B5_INLINE_FALLBACK | `core/exit/BreakEvenManager.js:83` | N | Y | `const contract = trade.exitContract \|\| {};` |
| B5_INLINE_FALLBACK | `core/exit/BreakEvenManager.js:84` | N | Y | `const riskAmount = Math.abs(contract.stopLossPercent ?? 1.0);` |
| B5_INLINE_FALLBACK | `core/exit/BreakEvenManager.js:85` | N | Y | `return (trade.maxProfitPercent \|\| 0) >= riskAmount;` |
| B3_DEFAULT_PARAM | `core/exit/DynamicTrailingStop.js:36` | N | Y | `constructor(config = {}) {` |
| B1_ENV_READ | `core/exit/DynamicTrailingStop.js:41` | N | Y | `atrMultiplier: parseFloat(process.env.TRAIL_ATR_MULTIPLIER) \|\| config.atrMultiplier \|\| 2.0,` |
| B1_ENV_READ | `core/exit/DynamicTrailingStop.js:45` | N | Y | `minActivation: parseFloat(process.env.TRAIL_MIN_ACTIVATION) \|\| config.minActivation \|\| 1.5,` |
| B1_ENV_READ | `core/exit/DynamicTrailingStop.js:48` | N | Y | `trendWidenMultiplier: parseFloat(process.env.TRAIL_TREND_WIDEN) \|\| config.trendWidenMultiplier \|\| 1.5,` |
| B1_ENV_READ | `core/exit/DynamicTrailingStop.js:51` | N | Y | `structureTightenMultiplier: parseFloat(process.env.TRAIL_STRUCTURE_TIGHTEN) \|\| config.structureTightenMultiplier \|\| 0.5,` |
| B2_CONFIG_FALLBACK | `core/exit/DynamicTrailingStop.js:54` | N | Y | `minTrailPercent: config.minTrailPercent \|\| 0.3,` |
| B2_CONFIG_FALLBACK | `core/exit/DynamicTrailingStop.js:57` | N | Y | `maxTrailPercent: config.maxTrailPercent \|\| 3.0,` |
| B2_CONFIG_FALLBACK | `core/exit/DynamicTrailingStop.js:60` | N | Y | `roundNumberProximity: config.roundNumberProximity \|\| 0.5,` |
| B5_INLINE_FALLBACK | `core/exit/DynamicTrailingStop.js:83` | N | Y | `trade.maxProfitPercent = Math.max(trade.maxProfitPercent \|\| 0, pnlPercent);` |
| B3_DEFAULT_PARAM | `core/exit/DynamicTrailingStop.js:99` | N | Y | `calculateTrailDistance(context = {}) {` |
| B3_DEFAULT_PARAM | `core/exit/DynamicTrailingStop.js:100` | N | Y | `const { atr = 0, price = 0, trend = 'sideways', rsi = 50, nearestStructure = null, maxProfitPercent = 0 } = context;` |
| B3_DEFAULT_PARAM | `core/exit/DynamicTrailingStop.js:180` | N | Y | `check(trade, pnlPercent, context = {}) {` |
| B5_INLINE_FALLBACK | `core/exit/DynamicTrailingStop.js:217` | N | Y | `trend: context.trend \|\| 'unknown',` |
| B3_DEFAULT_PARAM | `core/exit/DynamicTrailingStop.js:233` | N | Y | `getTrailInfo(trade, context = {}) {` |
| B5_INLINE_FALLBACK | `core/exit/MaxHoldChecker.js:31` | N | Y | `const contract = trade.exitContract \|\| {};` |
| B5_INLINE_FALLBACK | `core/exit/MaxHoldChecker.js:46` | N | Y | `details: `${trade.entryStrategy \|\| 'Strategy'} max hold: ${holdTimeMinutes.toFixed(0)} min >= ${contract.maxHoldTimeMinutes} min (P&L ${pnlPercent.toFixed(2)}%)`,` |
| B3_DEFAULT_PARAM | `core/exit/StopLossChecker.js:27` | N | Y | `check(trade, currentPrice, pnlPercent, context = {}) {` |
| B5_INLINE_FALLBACK | `core/exit/StopLossChecker.js:28` | N | Y | `const contract = trade.exitContract \|\| {};` |
| B5_INLINE_FALLBACK | `core/exit/StopLossChecker.js:50` | N | Y | `details: `${trade.entryStrategy \|\| 'Strategy'} ${stopType}: ${pnlPercent.toFixed(2)}% <= ${effectiveStop.toFixed(2)}%`,` |
| B5_INLINE_FALLBACK | `core/exit/TakeProfitChecker.js:19` | N | Y | `const contract = trade.exitContract \|\| {};` |
| B5_INLINE_FALLBACK | `core/exit/TakeProfitChecker.js:29` | N | Y | `details: `${trade.entryStrategy \|\| 'Strategy'} TP: ${pnlPercent.toFixed(2)}% >= ${contract.takeProfitPercent}%`,` |
| B5_INLINE_FALLBACK | `core/exit/TrailingStopChecker.js:41` | N | Y | `trade.maxProfitPercent = Math.max(trade.maxProfitPercent \|\| 0, pnlPercent);` |
| B5_INLINE_FALLBACK | `core/exit/TrailingStopChecker.js:52` | N | Y | `const contract = trade.exitContract \|\| {};` |
| B5_INLINE_FALLBACK | `core/exit/TrailingStopChecker.js:58` | N | Y | `const activationThreshold = contract.trailingActivation \|\| 0;` |
| B3_DEFAULT_PARAM | `core/exit/TrailingStopChecker.js:73` | N | Y | `// effectiveStop may be null when contract has no stop (stopLossPercent=0/null);` |
| B3_DEFAULT_PARAM | `core/indicators/IndicatorEngine.js:36` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:48` | N | Y | `tf: config.tf \|\| '1m',` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:51` | N | Y | `smaPeriods: config.smaPeriods \|\| [20, 50, 200],` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:52` | N | Y | `emaPeriods: config.emaPeriods \|\| [20, 50, 200],` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:53` | N | Y | `bbPeriod: config.bbPeriod \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:54` | N | Y | `bbStdDev: config.bbStdDev \|\| 2,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:55` | N | Y | `atrPeriod: config.atrPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:58` | N | Y | `rsiPeriod: config.rsiPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:59` | N | Y | `stochRsiPeriod: config.stochRsiPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:60` | N | Y | `stochRsiK: config.stochRsiK \|\| 3,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:61` | N | Y | `stochRsiD: config.stochRsiD \|\| 3,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:64` | N | Y | `adxPeriod: config.adxPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:67` | N | Y | `superTrendPeriod: config.superTrendPeriod \|\| 10,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:68` | N | Y | `superTrendMultiplier: config.superTrendMultiplier \|\| 3,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:71` | N | Y | `keltnerPeriod: config.keltnerPeriod \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:72` | N | Y | `keltnerMultiplier: config.keltnerMultiplier \|\| 1.5,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:75` | N | Y | `donchianPeriod: config.donchianPeriod \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:78` | N | Y | `macdFast: config.macdFast \|\| 12,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:79` | N | Y | `macdSlow: config.macdSlow \|\| 26,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:80` | N | Y | `macdSignal: config.macdSignal \|\| 9,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:83` | N | Y | `mfiPeriod: config.mfiPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:86` | N | Y | `twoPolePeriod: config.twoPolePeriod \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:87` | N | Y | `twoPoleNormalizeByATR: config.twoPoleNormalizeByATR ?? true,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:90` | N | Y | `ogzTpoEnabled: config.ogzTpoEnabled ?? true,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:91` | N | Y | `ogzTpoLength: config.ogzTpoLength \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:92` | N | Y | `ogzTpoNormLength: config.ogzTpoNormLength \|\| 25,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:93` | N | Y | `ogzTpoVolLength: config.ogzTpoVolLength \|\| 20,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:94` | N | Y | `ogzTpoLagBars: config.ogzTpoLagBars \|\| 4,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:95` | N | Y | `ogzTpoEmitMarkers: config.ogzTpoEmitMarkers ?? true,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:98` | N | Y | `ichimokuTenkan: config.ichimokuTenkan \|\| 9,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:99` | N | Y | `ichimokuKijun: config.ichimokuKijun \|\| 26,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:100` | N | Y | `ichimokuSenkouB: config.ichimokuSenkouB \|\| 52,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:101` | N | Y | `ichimokuDisplacement: config.ichimokuDisplacement \|\| 26,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:104` | N | Y | `pivotLeft: config.pivotLeft \|\| 3,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:105` | N | Y | `pivotRight: config.pivotRight \|\| 3,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:106` | N | Y | `srClusterPct: config.srClusterPct \|\| 0.0025, // 0.25% clustering tolerance` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:107` | N | Y | `maxSRLevels: config.maxSRLevels \|\| 12,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:110` | N | Y | `trendMinPivots: config.trendMinPivots \|\| 3,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:111` | N | Y | `trendMaxLookback: config.trendMaxLookback \|\| 200,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:114` | N | Y | `maxCandles: config.maxCandles \|\| 2000,` |
| B2_CONFIG_FALLBACK | `core/indicators/IndicatorEngine.js:115` | N | Y | `maxSeriesPoints: config.maxSeriesPoints \|\| 400,` |
| B5_INLINE_FALLBACK | `core/indicators/IndicatorEngine.js:372` | N | Y | `volume: _v(lastCandle) ?? 0,` |
| B3_DEFAULT_PARAM | `core/indicators/IndicatorEngine.js:567` | N | Y | `let sumG = 0, sumL = 0;` |
| B3_DEFAULT_PARAM | `core/indicators/IndicatorEngine.js:618` | N | Y | `_getRSISeries(lookback = 200) {` |
| B3_DEFAULT_PARAM | `core/indicators/IndicatorEngine.js:634` | N | Y | `let sumG = 0, sumL = 0;` |
| B3_DEFAULT_PARAM | `core/indicators/IndicatorEngine.js:680` | N | Y | `let sumTR = 0, sumPDM = 0, sumMDM = 0;` |
| B3_DEFAULT_PARAM | `core/indicators/IndicatorEngine.js:729` | N | Y | `_computeDXSeries(lookback = 50) {` |
| B3_DEFAULT_PARAM | `core/indicators/IndicatorEngine.js:747` | N | Y | `let sumTR = 0, sumPDM = 0, sumMDM = 0;` |
| B5_INLINE_FALLBACK | `core/indicators/IndicatorEngine.js:861` | N | Y | `if (_c(c) > this.obvState.prevClose) this.obvState.obv += (_v(c) \|\| 0);` |
| B5_INLINE_FALLBACK | `core/indicators/IndicatorEngine.js:862` | N | Y | `else if (_c(c) < this.obvState.prevClose) this.obvState.obv -= (_v(c) \|\| 0);` |
| B5_INLINE_FALLBACK | `core/indicators/IndicatorEngine.js:877` | N | Y | `const rawFlow = tp * (_v(c) \|\| 0);` |
| B5_INLINE_FALLBACK | `core/indicators/IndicatorEngine.js:1004` | N | Y | `const v = _v(c) \|\| 0;` |
| B3_DEFAULT_PARAM | `core/indicators/TwoPoleOscillator.js:92` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/indicators/TwoPoleOscillator.js:94` | N | Y | `this.tpoLength = config.tpoLength \|\| 20;` |
| B2_CONFIG_FALLBACK | `core/indicators/TwoPoleOscillator.js:95` | N | Y | `this.normLength = config.normLength \|\| 25;` |
| B2_CONFIG_FALLBACK | `core/indicators/TwoPoleOscillator.js:96` | N | Y | `this.volLength = config.volLength \|\| 20;` |
| B2_CONFIG_FALLBACK | `core/indicators/TwoPoleOscillator.js:97` | N | Y | `this.lagBars = config.lagBars \|\| 4;` |
| B3_DEFAULT_PARAM | `core/indicators/TwoPoleOscillator.js:321` | N | Y | `getRenderData(maxPoints = 200) {` |
| B3_DEFAULT_PARAM | `core/invariants.js:27` | N | Y | `function assertNoRecursion(depth = 0, maxDepth = 10) {` |
| B3_DEFAULT_PARAM | `core/ogzTwoPoleOscillator.js:308` | N | Y | `function calculateDynamicLevels(entryPrice, vol, direction, multiplier = 1.5) {` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:135` | N | Y | `if (!String(warmupResponse \|\| '').trim()) {` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:248` | N | Y | `return responseText \|\| '';` |
| B3_DEFAULT_PARAM | `core/persistent_llm_client.js:263` | N | Y | `async generateWithTools(messages, tools, options = {}) {` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:337` | N | Y | `return data.content.map(c => c.text \|\| '').join('\n');` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:339` | N | Y | `throw new Error(data.error?.message \|\| 'Empty Anthropic response');` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:368` | N | Y | `return data.choices[0].message?.content \|\| '';` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:370` | N | Y | `throw new Error(data.error?.message \|\| 'Empty OpenAI response');` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:419` | N | Y | `const models = data.models \|\| [];` |
| B5_INLINE_FALLBACK | `core/persistent_llm_client.js:482` | N | Y | `headers: headers \|\| {},` |
| B4_MODULE_CONSTANT | `core/session-router/TransitionStore.js:8` | N | Y | `const DEFAULT_STALE_LOCK_MS = 120000;` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:56` | N | Y | `constructor(options = {}) {` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:124` | N | Y | `writeState(update = {}) {` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:133` | N | Y | `: Number(priorState.epoch \|\| 0),` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:161` | N | Y | `appendEvent(event = {}) {` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:168` | N | Y | `event: event.event \|\| 'TRANSITION_EVENT',` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:205` | N | Y | `_brokerIntentIdentity(details = {}) {` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:221` | N | Y | `buildBrokerIntentId(details = {}) {` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:239` | N | Y | `_appendBrokerIntentRecord(record = {}) {` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:261` | N | Y | `recordBrokerIntent(details = {}) {` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:292` | N | Y | `commitBrokerIntent(intentId, details = {}) {` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:308` | N | Y | `throw new Error(`broker intent ${intentId} cannot commit from status ${latest.status \|\| '(missing)'}`);` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:325` | N | Y | `failBrokerIntent(intentId, reason, details = {}) {` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:334` | N | Y | `reason: reason \|\| 'unknown broker intent failure'` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:395` | N | Y | `recordTransitionEvent(eventName, details = {}) {` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:418` | N | Y | `markRecoveryRequired(reason, details = {}) {` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:440` | N | Y | `acquireLock(details = {}) {` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:460` | N | Y | `error: state.data.safeModeReason \|\| 'transition recovery required'` |
| B3_DEFAULT_PARAM | `core/session-router/TransitionStore.js:516` | N | Y | `releaseLock(expected = {}) {` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:542` | N | Y | `error: `transition lock owner mismatch: expected ${expected.transitionId}, found ${lock.data.transitionId \|\| '(missing)'}`` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:595` | N | Y | `...(state.data \|\| {}),` |
| B5_INLINE_FALLBACK | `core/session-router/TransitionStore.js:619` | N | Y | `if (eventProjection && Number(eventProjection.lastEventSeq \|\| 0) > Number(state.data.lastEventSeq \|\| 0)) {` |
| B3_DEFAULT_PARAM | `core/tradeLogger.js:73` | N | Y | `formatNullableNumber(value, decimals = 2) {` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:255` | N | Y | `macdCrossover: tradeData.macdCrossover \|\| false,` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:279` | N | Y | `fibLevels: tradeData.fibLevels \|\| [],` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:287` | N | Y | `secondaryReasons: tradeData.secondaryReasons \|\| [],` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:289` | N | Y | `conflictingSignals: tradeData.conflictingSignals \|\| [],` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:292` | N | Y | `timeframeConcurrence: tradeData.timeframeConcurrence \|\| false` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:324` | N | Y | `isNewPattern: tradeData.isNewPattern \|\| false` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:332` | N | Y | `newsEvents: tradeData.newsEvents \|\| [],` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:333` | N | Y | `economicEvents: tradeData.economicEvents \|\| [],` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:361` | N | Y | `features: tradeData.features \|\| [],` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:428` | N | Y | `const trend = t.analysis?.trend ?? 'missing';` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:429` | N | Y | `trendBreakdown[trend] = (trendBreakdown[trend] \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:435` | N | Y | `const reason = t.exitSignal?.exitReason ?? t.exitReason ?? 'missing';` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:436` | N | Y | `exitReasonBreakdown[reason] = (exitReasonBreakdown[reason] \|\| 0) + 1;` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:471` | N | Y | `profitFactor: wins.reduce((sum, t) => sum + t.pnl, 0) / Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0)) \|\| 0,` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:495` | N | Y | `houstonProgress: trades.length > 0 ? trades[trades.length - 1].houstonFund?.progress \|\| 0 : 0,` |
| B5_INLINE_FALLBACK | `core/tradeLogger.js:496` | N | Y | `currentBalance: trades.length > 0 ? trades[trades.length - 1].balanceAfter \|\| 0 : 0,` |
| B3_DEFAULT_PARAM | `core/trai_core.js:80` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `core/trai_core.js:84` | N | Y | `staticBrainPath: config.staticBrainPath \|\| './trai_brain',` |
| B2_CONFIG_FALLBACK | `core/trai_core.js:85` | N | Y | `workingModel: config.workingModel \|\| 'mercury-2',` |
| B2_CONFIG_FALLBACK | `core/trai_core.js:86` | N | Y | `enableVoice: config.enableVoice \|\| false,` |
| B2_CONFIG_FALLBACK | `core/trai_core.js:87` | N | Y | `enableVideo: config.enableVideo \|\| false,` |
| B1_ENV_READ | `core/trai_core.js:88` | N | Y | `elevenlabsApiKey: config.elevenlabsApiKey \|\| process.env.ELEVENLABS_API_KEY,` |
| B1_ENV_READ | `core/trai_core.js:89` | N | Y | `didApiKey: config.didApiKey \|\| process.env.DID_API_KEY,` |
| B2_CONFIG_FALLBACK | `core/trai_core.js:90` | N | Y | `personality: config.personality \|\| 'professional_encouraging',` |
| B2_CONFIG_FALLBACK | `core/trai_core.js:92` | N | Y | `memoryTopK: config.memoryTopK \|\| 5,` |
| B3_DEFAULT_PARAM | `core/trai_core.js:268` | N | Y | `async processQuery(query, context = {}) {` |
| B3_DEFAULT_PARAM | `core/trai_core.js:319` | N | Y | `async retrieveMemoryContext(query, _context = {}) {` |
| B5_INLINE_FALLBACK | `core/trai_core.js:333` | N | Y | `const queryWords = query?.toLowerCase?.()?.split?.(/\s+/) \|\| [];` |
| B5_INLINE_FALLBACK | `core/trai_core.js:405` | N | Y | `memoryContext: context.memoryContext \|\| [],` |
| B3_DEFAULT_PARAM | `core/trai_core.js:421` | N | Y | `async generateIntelligentResponse(query, analysis, context = {}) {` |
| B5_INLINE_FALLBACK | `core/trai_core.js:422` | N | Y | `return this.executeWithPersistentLLM(query, analysis, context.memoryContext \|\| []);` |
| B3_DEFAULT_PARAM | `core/trai_core.js:425` | N | Y | `async executeWithPersistentLLM(query, analysis, memoryContext = []) {` |
| B5_INLINE_FALLBACK | `core/trai_core.js:441` | N | Y | `(memoryContext \|\| [])` |
| B5_INLINE_FALLBACK | `core/trai_core.js:442` | N | Y | `.map((item) => `- [${item.entry?.source \|\| 'unknown'}:${item.entry?.type \|\| 'log'}] ${item.entry?.content \|\| ''}`)` |
| B5_INLINE_FALLBACK | `core/trai_core.js:443` | N | Y | `.join('\n') \|\| 'None';` |
| B5_INLINE_FALLBACK | `core/trai_core.js:478` | N | Y | ``Primary Category: ${primaryCategory \|\| 'unknown'}`,` |
| B5_INLINE_FALLBACK | `core/trai_core.js:483` | N | Y | `schema.shape \|\| '{}',` |
| B5_INLINE_FALLBACK | `core/trai_core.js:551` | N | Y | `- Last Signal: ${context.lastDecision} (${((context.confidence \|\| 0) * 100).toFixed(1)}% confidence)\n`;` |
| B5_INLINE_FALLBACK | `core/trai_core.js:556` | N | Y | `- Bot Mode: ${context.botMode \|\| 'unknown'}` |
| B5_INLINE_FALLBACK | `core/trai_core.js:619` | N | Y | `tags: [analysis.primaryCategory \|\| 'general', analysis.intent \|\| 'general'],` |
| B3_DEFAULT_PARAM | `core/trai_core.js:639` | N | Y | `assessImportance(query, response, context = {}) {` |
| B5_INLINE_FALLBACK | `core/trai_core.js:641` | N | Y | `typeof response === 'string' ? response : JSON.stringify(response \|\| '');` |
| B5_INLINE_FALLBACK | `core/trai_core.js:763` | N | Y | `Object.prototype.hasOwnProperty.call(trade \|\| {}, 'features') \|\|` |
| B5_INLINE_FALLBACK | `core/trai_core.js:764` | N | Y | `Object.prototype.hasOwnProperty.call(trade \|\| {}, 'entryFeatures') \|\|` |
| B5_INLINE_FALLBACK | `core/trai_core.js:765` | N | Y | `Object.prototype.hasOwnProperty.call(trade?.entry \|\| {}, 'features')` |
| B5_INLINE_FALLBACK | `core/trai_core.js:785` | N | Y | `const ind = rawIndicators \|\| {};` |
| B3_DEFAULT_PARAM | `core/trai_core.js:891` | N | Y | `runReadOnlyTool(name, args = {}) {` |
| B5_INLINE_FALLBACK | `core/trai_core.js:894` | N | Y | `case 'repo_search': return this.readOnlyTools.searchRepo(args.query \|\| '', { limit: args.limit });` |
| B5_INLINE_FALLBACK | `core/trai_core.js:895` | N | Y | `case 'file_open': return this.readOnlyTools.openFile(args.path \|\| '', { maxBytes: args.maxBytes });` |
| B5_INLINE_FALLBACK | `core/trai_core.js:896` | N | Y | `case 'log_tail': return this.readOnlyTools.tailLog(args.path \|\| '', args.lines);` |
| B3_DEFAULT_PARAM | `core/trai_core.js:1015` | N | Y | `getRecentConversationSnippets(count = 3) {` |
| B5_INLINE_FALLBACK | `core/trai_core.js:1051` | N | Y | `- Drawdown: ${((stateSummary.currentDrawdown \|\| 0) * 100).toFixed(2)}% ${stateSummary.emergencyMode ? '(EMERGENCY MODE)' : ''}` |
| B5_INLINE_FALLBACK | `core/trai_core.js:1052` | N | Y | `- Avg Confidence: ${((stateSummary.averageConfidence \|\| 0) * 100).toFixed(1)}%` |
| B5_INLINE_FALLBACK | `core/trai_core.js:1113` | N | Y | `pnl: trade.pnl \|\| 0,` |
| B5_INLINE_FALLBACK | `core/trai_core.js:1114` | N | Y | `duration: trade.duration \|\| 0,` |
| B5_INLINE_FALLBACK | `core/trai_core.js:1115` | N | Y | `riskReward: trade.riskReward \|\| 0,` |
| B3_DEFAULT_PARAM | `core/trai_llm_config.js:54` | N | Y | `function resolveTraiLlmConfig(options = {}) {` |
| B5_INLINE_FALLBACK | `core/trai_symbol_extractor.js:16` | N | Y | `const text = String(prompt \|\| '');` |
| B3_DEFAULT_PARAM | `core/trai_symbol_extractor.js:26` | N | Y | `function extractSymbol(prompt, options = {}) {` |
| B5_INLINE_FALLBACK | `core/trai_symbol_extractor.js:27` | N | Y | `const upperPrompt = String(prompt \|\| '').toUpperCase();` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:495` | Y | Y | `function applyTuningProfileEnv(sourceEnv, sourceOverrides = {}) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:503` | Y | Y | `const profileName = String(sourceEnv[selectedKey] \|\| '').trim();` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:508` | Y | Y | `const definitions = tradingConfigFile.tuningProfiles?.definitions \|\| {};` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:518` | Y | Y | `for (const [key, value] of Object.entries(profile.env \|\| {})) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:549` | Y | Y | `const explicitProfileName = String(sourceEnv.PROFILE \|\| '').trim();` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:554` | Y | Y | `const defaultProfileName = String(launchProfiles.defaultProfile \|\| '').trim();` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:562` | Y | Y | `const mode = String(profile?.mode \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:577` | Y | Y | `const mode = String(router.mode \|\| '').trim().toLowerCase();` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:582` | Y | Y | `const staticSession = String(router.staticSession \|\| '').trim().toLowerCase();` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:613` | Y | Y | `function applyLaunchProfileEnv(sourceEnv, sourceOverrides = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:627` | Y | Y | `function buildEffectiveEnv(sourceEnv, sourceOverrides = {}, launchProfileContext = null) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:795` | Y | Y | `consecutiveLosses: track('entryLogic.symbolLossCooldown.consecutiveLosses', envInt('SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES', tradingConfigFile.entryLogic?.symbolLossCooldown?.consecutiveLosses \|\| 2)),` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:796` | Y | Y | `cooldownMinutes: track('entryLogic.symbolLossCooldown.cooldownMinutes', envFloat('SYMBOL_LOSS_COOLDOWN_MINUTES', tradingConfigFile.entryLogic?.symbolLossCooldown?.cooldownMinutes \|\| 120)),` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:1113` | Y | Y | `function validate(config, sources = {}) {` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1122` | Y | Y | `errors.push(`mode.execution must be live, paper, or backtest; got ${config.mode.execution \|\| '(missing)'}`);` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1149` | Y | Y | `const feeModel = String(config.fees.model \|\| '').trim().toLowerCase();` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1189` | Y | Y | `errors.push(`risk.guardMode must be off or venueRailBuffer; got ${config.risk.guardMode \|\| '(missing)'}`);` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1202` | Y | Y | `const sessionRouter = config.sessionRouter \|\| {};` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1204` | Y | Y | `errors.push(`sessionRouter.mode must be static or scheduled; got ${sessionRouter.mode \|\| '(missing)'}`);` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1207` | Y | Y | `errors.push(`sessionRouter.staticSession must be stocks or crypto when mode=static; got ${sessionRouter.staticSession \|\| '(missing)'}`);` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1224` | Y | Y | `for (const [strategyName, strategyConfig] of Object.entries(config.strategies \|\| {})) {` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1242` | Y | Y | `const minTradeConfidenceExplicit = /^config:launchProfiles\.[^.]+\.confidence\.minTradeConfidence$/.test(String(minTradeConfidenceSource \|\| ''));` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1244` | Y | Y | `errors.push(`LIVE_TRADING=true requires launchProfiles.<profile>.confidence.minTradeConfidence, got ${minTradeConfidenceSource \|\| 'missing'}`);` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1281` | Y | Y | `errors.push(`ALPACA_MODE must be explicitly set to paper or live when BROKER=alpaca outside backtest mode, got ${config.broker.alpacaMode \|\| '(missing)'}`);` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:1304` | Y | Y | `for (const [name, value] of Object.entries(config.dataFeed \|\| {})) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1356` | Y | Y | `if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ttpAccountLimits.accountStartOfDayDate \|\| ''))) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1357` | Y | Y | `warnings.push(`TTP_ACCOUNT_START_OF_DAY_DATE should be YYYY-MM-DD for daily loss pause, got ${ttpAccountLimits.accountStartOfDayDate \|\| '(missing)'}; entries will be blocked by TTP account limits until refreshed`);` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1385` | Y | Y | `if (!/^\d{4}-\d{2}-\d{2}$/.test(String(manualStatus.date \|\| ''))) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1386` | Y | Y | `warnings.push(`TTP_EARNINGS_STATUS_JSON.date should be YYYY-MM-DD, got ${manualStatus.date \|\| '(missing)'}; stale manual earnings status will block entries until refreshed`);` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1394` | Y | Y | `if (!String(symbol \|\| '').trim()) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:1478` | Y | Y | `function buildSnapshot(sourceEnv = process.env, opts = {}) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:1479` | Y | Y | `const envPath = sourceEnv.DOTENV_CONFIG_PATH \|\| '.env';` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:1538` | Y | Y | `function snapshot(sourceEnv = process.env, opts = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:1542` | Y | Y | `function load(opts = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:1895` | Y | Y | `function assertConfigLoaderOwnedPathsNotOverridden(flatOverrides, source, options = {}) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:2089` | Y | Y | `Object.prototype.hasOwnProperty.call(profile.env \|\| {}, key)` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:2098` | Y | Y | `const unmapped = Object.keys(profile.env \|\| {}).filter(key => !PROFILE_ENV_CONFIG_PATHS[key]);` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:2111` | Y | Y | `evidence: Object.freeze([...(profile.evidence \|\| [])]),` |
| B1_ENV_READ | `foundation/ConfigLoader.js:3720` | Y | N | `return process.env.JEST_WORKER_ID !== undefined;` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:3723` | Y | Y | `function isFileBackedBacktestContext(options = {}) {` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:3725` | Y | Y | `String(options.executionMode \|\| '').toLowerCase() === 'backtest' &&` |
| B2_CONFIG_FALLBACK | `foundation/ConfigLoader.js:3726` | Y | Y | `String(options.candleSource \|\| '').toLowerCase() === 'file' &&` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:3730` | Y | Y | `function isValidatedBacktestOverrideContext(options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:3743` | Y | Y | `function assertBacktestOverrideMutationAllowed(options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:3751` | Y | Y | `function assertTuningProfileMutationAllowed(options = {}) {` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:3791` | Y | Y | `return String(profileName \|\| '').trim();` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:3808` | Y | Y | `const value = String(rawValue \|\| '').trim();` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:3816` | Y | Y | `const values = String(rawValue \|\| '').split(',').map(item => item.trim()).filter(Boolean);` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:3882` | Y | Y | `const reason = flatState.reason \|\| 'state_not_flat';` |
| B5_INLINE_FALLBACK | `foundation/ConfigLoader.js:4019` | Y | Y | `return BASE_CONFIG.regimeMultipliers[regime] \|\| { slMultiplier: 1.0, tpMultiplier: 1.0 };` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:4144` | Y | Y | `static applyTuningProfile(profileName = BASE_CONFIG.tuningProfiles.defaultProfile, options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:4265` | Y | Y | `static async runWithTuningProfile(profileName, callback, options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:4297` | Y | Y | `static applyOverrideMap(overrides, source, options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:4303` | Y | Y | `const flatten = (obj, prefix = '') => {` |
| B3_DEFAULT_PARAM | `foundation/ConfigLoader.js:4327` | Y | Y | `static applyBacktestConfigOverrides(overrides, options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/IBrokerAdapter.js:123` | N | Y | `async placeBuyOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/IBrokerAdapter.js:135` | N | Y | `async placeSellOrder(symbol, amount, price = null, options = {}) {` |
| B3_DEFAULT_PARAM | `foundation/IBrokerAdapter.js:187` | N | Y | `async getCandles(symbol, timeframe = '1m', limit = 100) {` |
| B3_DEFAULT_PARAM | `foundation/IBrokerAdapter.js:197` | N | Y | `async getOrderBook(symbol, depth = 20) {` |
| B3_DEFAULT_PARAM | `foundation/Instrument.js:60` | N | Y | `constructor(data = {}) {` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:62` | N | Y | `this.symbol = data.symbol \|\| '';                    // Canonical symbol (e.g., 'SPY', 'BTC')` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:63` | N | Y | `this.name = data.name \|\| '';                        // Full name (e.g., 'SPDR S&P 500 ETF Trust')` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:73` | N | Y | `this.currency = data.currency \|\| 'USD';             // Quote currency` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:74` | N | Y | `this.country = data.country \|\| 'US';                // Country of listing` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:78` | N | Y | `this.brokerSymbols = data.brokerSymbols \|\| {};` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:83` | N | Y | `this.shortable = data.shortable \|\| false;           // Can be shorted` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:84` | N | Y | `this.marginable = data.marginable \|\| false;         // Eligible for margin` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:85` | N | Y | `this.optionsEligible = data.optionsEligible \|\| false; // Has options chain` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:88` | N | Y | `this.fractionalEnabled = data.fractionalEnabled \|\| false;` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:93` | N | Y | `this.lotSize = data.lotSize \|\| 1;                   // Minimum tradeable quantity` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:94` | N | Y | `this.priceIncrement = data.priceIncrement \|\| 0.01;  // Tick size` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:95` | N | Y | `this.quantityPrecision = data.quantityPrecision \|\| 0; // Decimal places for qty` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:96` | N | Y | `this.pricePrecision = data.pricePrecision \|\| 2;     // Decimal places for price` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:99` | N | Y | `this.tradingHours = data.tradingHours \|\| 'regular'; // 'regular', 'extended', '24/7'` |
| B3_DEFAULT_PARAM | `foundation/Instrument.js:260` | N | Y | `constructor(data = {}) {` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:267` | N | Y | `this.symbol = data.symbol \|\| '';                    // Canonical symbol` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:268` | N | Y | `this.side = data.side \|\| 'buy';                     // 'buy' or 'sell'` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:269` | N | Y | `this.type = data.type \|\| 'market';                  // 'market', 'limit', 'stop', 'stop_limit', 'trailing_stop'` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:270` | N | Y | `this.timeInForce = data.timeInForce \|\| 'day';       // 'day', 'gtc', 'ioc', 'fok'` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:273` | N | Y | `this.quantity = data.quantity \|\| 0;                 // Requested quantity` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:274` | N | Y | `this.filledQuantity = data.filledQuantity \|\| 0;     // Quantity filled so far` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:288` | N | Y | `this.commission = data.commission \|\| 0;` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:289` | N | Y | `this.fees = data.fees \|\| 0;` |
| B5_INLINE_FALLBACK | `foundation/Instrument.js:297` | N | Y | `this.extendedHours = data.extendedHours \|\| false;   // Pre/after market order` |
| B3_DEFAULT_PARAM | `foundation/MarketCalendar.js:40` | N | Y | `constructor(options = {}) {` |
| B2_CONFIG_FALLBACK | `foundation/MarketCalendar.js:42` | N | Y | `this.timezone = options.timezone \|\| 'America/New_York';` |
| B3_DEFAULT_PARAM | `foundation/MarketCalendar.js:271` | N | Y | `isOpen(date = new Date(), session = 'any') {` |
| B3_DEFAULT_PARAM | `foundation/MarketCalendar.js:304` | N | Y | `getTimeUntilOpen(date = new Date(), session = 'regular') {` |
| B5_INLINE_FALLBACK | `foundation/MarketCalendar.js:389` | N | Y | `const get = (t) => (parts.find(p => p.type === t) \|\| {}).value;` |
| B5_INLINE_FALLBACK | `foundation/MarketCalendar.js:415` | N | Y | `const phase = phaseMap[session] \|\| 'closed';` |
| B5_INLINE_FALLBACK | `foundation/MarketCalendar.js:424` | N | Y | `nextTransition = `Holiday: ${holiday.name \|\| 'closed'}`;` |
| B2_CONFIG_FALLBACK | `foundation/ResilientWebSocket.js:101` | N | Y | `this.label = config.label \|\| '[ResilientWS]';` |
| B2_CONFIG_FALLBACK | `foundation/ResilientWebSocket.js:103` | N | Y | `const opts = Object.assign({}, DEFAULTS, config.options \|\| {});` |
| B5_INLINE_FALLBACK | `foundation/ohlc-normalize.js:95` | N | Y | `const v = _num(input.v ?? input.volume) ?? 0;` |
| B3_DEFAULT_PARAM | `modules/BreakAndRetest.js:49` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:52` | N | Y | `this.sessionLookback = config.sessionLookback \|\| 96;  // 96 x 15min = 24 hours` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:55` | N | Y | `this.srZonePct = config.srZonePct \|\| 0.5;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:58` | N | Y | `this.minLevelTests = config.minLevelTests \|\| 2;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:61` | N | Y | `this.swingLookback = config.swingLookback \|\| 5;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:65` | N | Y | `this.breakConfirmPct = config.breakConfirmPct \|\| 0.15;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:68` | N | Y | `this.minBreakerBodyRatio = config.minBreakerBodyRatio \|\| 0.4;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:72` | N | Y | `this.retestZonePct = config.retestZonePct \|\| 0.3;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:75` | N | Y | `this.maxRetestWait = config.maxRetestWait \|\| 20;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:78` | N | Y | `this.minBattleCandles = config.minBattleCandles \|\| 3;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:81` | N | Y | `this.maxBattleCandles = config.maxBattleCandles \|\| 15;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:85` | N | Y | `this.ntzMaxRangePct = config.ntzMaxRangePct \|\| 2.0;` |
| B2_CONFIG_FALLBACK | `modules/BreakAndRetest.js:89` | N | Y | `this.rewardRiskRatio = config.rewardRiskRatio \|\| 1.5;` |
| B5_INLINE_FALLBACK | `modules/BreakAndRetest.js:337` | N | Y | `source: level.source \|\| 'sr_zone',` |
| B5_INLINE_FALLBACK | `modules/BreakAndRetest.js:351` | N | Y | `source: level.source \|\| 'sr_zone',` |
| B5_INLINE_FALLBACK | `modules/BreakAndRetest.js:453` | N | Y | `confidence += Math.min(0.10, (this.activeBreak?.levelTests \|\| 1) * 0.05); // Level quality` |
| B5_INLINE_FALLBACK | `modules/BreakAndRetest.js:458` | N | Y | ``S/R tested ${this.activeBreak?.levelTests \|\| '?'}x`;` |
| B5_INLINE_FALLBACK | `modules/BreakAndRetest.js:508` | N | Y | `confidence += Math.min(0.10, (this.activeBreak?.levelTests \|\| 1) * 0.05);` |
| B5_INLINE_FALLBACK | `modules/BreakAndRetest.js:513` | N | Y | ``S/R tested ${this.activeBreak?.levelTests \|\| '?'}x`;` |
| B3_DEFAULT_PARAM | `modules/BreakAndRetest.js:601` | N | Y | `_calcATR(priceHistory, period = 14) {` |
| B5_INLINE_FALLBACK | `modules/BreakAndRetest.js:640` | N | Y | `barsWaiting: this.barCount - (this.activeBreak?.breakBar \|\| 0),` |
| B2_CONFIG_FALLBACK | `modules/DonchianBreakout.js:23` | N | Y | `const cfg = { ...(base \|\| {}), ...(overrides \|\| {}) };` |
| B3_DEFAULT_PARAM | `modules/DonchianBreakout.js:62` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `modules/DonchianBreakout.js:80` | N | Y | `invalidationConditions: [...(cfg.invalidationConditions \|\| ['donchian_channel_reentry'])],` |
| B4_MODULE_CONSTANT | `modules/EMASMACrossoverSignal.js:49` | N | Y | `const REQUIRED_BOOLEAN_KEYS = ['enabled'];` |
| B3_DEFAULT_PARAM | `modules/EMASMACrossoverSignal.js:84` | N | Y | `function readConfig(overrides = {}) {` |
| B5_INLINE_FALLBACK | `modules/EMASMACrossoverSignal.js:95` | N | Y | `...(overrides \|\| {}),` |
| B3_DEFAULT_PARAM | `modules/EMASMACrossoverSignal.js:149` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `modules/EMATrendRetest.js:34` | N | Y | `const match = String(value \|\| '').match(/^(\d{2}):(\d{2})$/);` |
| B5_INLINE_FALLBACK | `modules/EMATrendRetest.js:55` | N | Y | `const raw = Array.isArray(value) ? value : String(value \|\| '').split(',');` |
| B2_CONFIG_FALLBACK | `modules/EMATrendRetest.js:73` | N | Y | `const cfg = { ...(base \|\| {}), ...(overrides \|\| {}) };` |
| B3_DEFAULT_PARAM | `modules/EMATrendRetest.js:163` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `modules/FairValueGapDetector.js:25` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `modules/FairValueGapDetector.js:26` | N | Y | `this.minFVGPercent = config.minFVGPercent \|\| 0.05; // 0.05% minimum gap size` |
| B2_CONFIG_FALLBACK | `modules/FairValueGapDetector.js:27` | N | Y | `this.maxFVGPercent = config.maxFVGPercent \|\| 2.0;  // 2% max (filter extreme gaps)` |
| B3_DEFAULT_PARAM | `modules/FairValueGapDetector.js:183` | N | Y | `calculateLevels(fvg, entryLevel = 'top', stopBufferPct = 0.05, targetRR = 2.0) {` |
| B3_DEFAULT_PARAM | `modules/LiquiditySweepDetector.js:35` | N | Y | `function requiredConfigNumber(config, key, { min = 0, exclusiveMin = false } = {}) {` |
| B3_DEFAULT_PARAM | `modules/LiquiditySweepDetector.js:66` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:67` | N | Y | `const weightConfig = config.weights \|\| {};` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:78` | N | Y | `atrPeriod: config.atrPeriod \|\| 14,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:79` | N | Y | `entryWindowMinutes: config.entryWindowMinutes \|\| 90,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:80` | N | Y | `openingRangeMinutes: config.openingRangeMinutes \|\| 15,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:81` | N | Y | `hammerBodyMaxPct: config.hammerBodyMaxPct \|\| 0.35,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:82` | N | Y | `hammerWickMinRatio: config.hammerWickMinRatio \|\| 2.0,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:83` | N | Y | `engulfMinRatio: config.engulfMinRatio \|\| 1.0,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:84` | N | Y | `stopBufferPct: config.stopBufferPct \|\| 0.05,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:87` | N | Y | `sweepLookbackBars: config.sweepLookbackBars \|\| 20,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:89` | N | Y | `sessionOpenHour: config.sessionOpenHour ?? 14,` |
| B2_CONFIG_FALLBACK | `modules/LiquiditySweepDetector.js:90` | N | Y | `sessionOpenMinute: config.sessionOpenMinute ?? 30,` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:121` | N | Y | `dailyCandles: this.state?.dailyCandles \|\| [],` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:124` | N | Y | `priorHighs: this.state?.priorHighs \|\| [],` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:125` | N | Y | `priorLows: this.state?.priorLows \|\| [],` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:215` | N | Y | `const barsNeeded = this._openingRangeBars \|\| 1;` |
| B1_ENV_READ | `modules/LiquiditySweepDetector.js:229` | N | N | `if (process.env.BACKTEST_VERBOSE) {` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:231` | N | Y | `if ((this.stats?.totalSessionsAnalyzed \|\| 0) % 10 === 0 \|\| this.state.phase !== 'waiting_for_open') {` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:232` | N | Y | `console.log(`[DEEP-LIQSWEEP] time=${candleTs} phase=${this.state.phase} interval=${this._candleIntervalMin\|\|'?'}m ATR=${this.state.dailyATR?.toFixed(4)\|\|'null'}`);` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:247` | N | Y | `v: candles.reduce((s, bar) => s + (v(bar) \|\| 0), 0),` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:254` | N | Y | `this._dailyCandle = { o: o(candle), h: h(candle), l: l(candle), c: c(candle), v: v(candle) \|\| 0, t: t(candle) };` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:260` | N | Y | `this._dailyCandle.v += (v(candle) \|\| 0);` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:354` | N | Y | `const maxBars = this._entryWindowBars \|\| 6;` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:467` | N | Y | `console.log(`[LiquiditySweep] SIGNAL ${direction.toUpperCase()} via ${pattern.type} \| Conf: ${(confidence * 100).toFixed(1)}% \| Interval: ${this._candleIntervalMin\|\|'?'}m`);` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:484` | N | Y | `const maxBars = this._entryWindowBars \|\| 6;` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:510` | N | Y | `const maxBars = this._entryWindowBars \|\| 6;` |
| B5_INLINE_FALLBACK | `modules/LiquiditySweepDetector.js:512` | N | Y | `phase: this.state.phase, dailyATR: this.state.dailyATR?.toFixed(2) \|\| 'N/A',` |
| B5_INLINE_FALLBACK | `modules/MADynamicSR.js:95` | N | Y | `merged.conditionFlags = { ...(base.conditionFlags \|\| {}), ...(override.conditionFlags \|\| {}) };` |
| B5_INLINE_FALLBACK | `modules/MADynamicSR.js:98` | N | Y | `merged.approachRules = { ...(base.approachRules \|\| {}), ...(override.approachRules \|\| {}) };` |
| B5_INLINE_FALLBACK | `modules/MADynamicSR.js:101` | N | Y | `merged.multipliers = { ...(base.multipliers \|\| {}), ...(override.multipliers \|\| {}) };` |
| B5_INLINE_FALLBACK | `modules/MADynamicSR.js:104` | N | Y | `merged.structural = { ...(base.structural \|\| {}), ...(override.structural \|\| {}) };` |
| B3_DEFAULT_PARAM | `modules/MADynamicSR.js:148` | N | Y | `function loadResolvedConfig(overrides = {}) {` |
| B3_DEFAULT_PARAM | `modules/MADynamicSR.js:232` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `modules/MADynamicSR.js:1147` | N | Y | `_emptySignal(reason = 'insufficient_data', context = {}) {` |
| B5_INLINE_FALLBACK | `modules/MADynamicSR.js:1155` | N | Y | `srAlignment: context.srAlignment \|\| { aligned: false },` |
| B5_INLINE_FALLBACK | `modules/MADynamicSR.js:1156` | N | Y | `confirmation: context.confirmation \|\| { bullish: false, bearish: false },` |
| B4_MODULE_CONSTANT | `modules/MultiTimeframeAdapter.js:34` | N | Y | `const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];` |
| B3_DEFAULT_PARAM | `modules/MultiTimeframeAdapter.js:90` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `modules/MultiTimeframeAdapter.js:93` | N | Y | `const baseTimeframe = cleanTimeframe(config.baseTimeframe) \|\| '1m';` |
| B2_CONFIG_FALLBACK | `modules/MultiTimeframeAdapter.js:99` | N | Y | `...(config.activeTimeframes \|\| ['1m', '5m', '15m', '1h', '4h', '1d']),` |
| B2_CONFIG_FALLBACK | `modules/MultiTimeframeAdapter.js:117` | N | Y | `...(config.maxCandlesByTimeframe \|\| {}),` |
| B2_CONFIG_FALLBACK | `modules/MultiTimeframeAdapter.js:129` | N | Y | `...(config.indicatorPeriods \|\| {}),` |
| B2_CONFIG_FALLBACK | `modules/MultiTimeframeAdapter.js:131` | N | Y | `minCandlesForAnalysis: config.minCandlesForAnalysis \|\| 30,` |
| B3_DEFAULT_PARAM | `modules/MultiTimeframeAdapter.js:384` | N | Y | `let weightedScore = 0, totalWeight = 0;` |
| B3_DEFAULT_PARAM | `modules/MultiTimeframeAdapter.js:385` | N | Y | `let rsiSum = 0, rsiCount = 0;` |
| B3_DEFAULT_PARAM | `modules/MultiTimeframeAdapter.js:386` | N | Y | `let trendMatches = 0, trendTotal = 0;` |
| B5_INLINE_FALLBACK | `modules/MultiTimeframeAdapter.js:465` | N | Y | `(analysis.bullishCount + analysis.bearishCount + analysis.neutralCount \|\| 1);` |
| B5_INLINE_FALLBACK | `modules/MultiTimeframeAdapter.js:495` | N | Y | `return this.candles.get(tf) \|\| [];` |
| B2_CONFIG_FALLBACK | `modules/NoWickImbalance.js:54` | N | Y | `const cfg = { ...(base \|\| {}), ...(overrides \|\| {}) };` |
| B3_DEFAULT_PARAM | `modules/NoWickImbalance.js:108` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `modules/OpeningRangeBreakout.js:61` | N | Y | `function requiredNumber(config, key, { min = 0, exclusiveMin = false } = {}) {` |
| B3_DEFAULT_PARAM | `modules/OpeningRangeBreakout.js:99` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `modules/PropSafeEMAPullback.js:36` | N | Y | `const match = String(value \|\| '').match(/^(\d{2}):(\d{2})$/);` |
| B2_CONFIG_FALLBACK | `modules/PropSafeEMAPullback.js:58` | N | Y | `const cfg = { ...(base \|\| {}), ...(overrides \|\| {}) };` |
| B3_DEFAULT_PARAM | `modules/PropSafeEMAPullback.js:152` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `modules/RSI2MeanReversion.js:25` | N | Y | `const cfg = { ...(base \|\| {}), ...(overrides \|\| {}) };` |
| B3_DEFAULT_PARAM | `modules/RSI2MeanReversion.js:88` | N | Y | `constructor(config = {}) {` |
| B3_DEFAULT_PARAM | `modules/SmartMoneySweep.js:47` | N | Y | `constructor(config = {}) {` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:49` | N | Y | `this.vpDays = config.vpDays \|\| 5;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:50` | N | Y | `this.vpBins = config.vpBins \|\| 50;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:51` | N | Y | `this.valueAreaPct = config.valueAreaPct \|\| 70;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:52` | N | Y | `this.bodyWeightPct = config.bodyWeightPct \|\| 70;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:53` | N | Y | `this.lvnPctile = config.lvnPctile \|\| 20;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:56` | N | Y | `this.ivbMinutes = config.ivbMinutes \|\| 30;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:57` | N | Y | `this.cashSessionStart = config.cashSessionStartHour \|\| 9;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:58` | N | Y | `this.cashSessionStartMin = config.cashSessionStartMinute \|\| 30;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:59` | N | Y | `this.cashSessionEndHour = config.cashSessionEndHour \|\| 16;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:60` | N | Y | `this.cashSessionEndMin = config.cashSessionEndMinute \|\| 0;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:63` | N | Y | `this.volAvgLen = config.volAvgLen \|\| 20;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:64` | N | Y | `this.absorbBodyPct = config.absorbBodyPct \|\| 35;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:65` | N | Y | `this.absorbWickPct = config.absorbWickPct \|\| 60;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:66` | N | Y | `this.absorbVolMult = config.absorbVolMult \|\| 1.2;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:67` | N | Y | `this.initBodyPct = config.initBodyPct \|\| 60;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:69` | N | Y | `this.absorbBodyProgPct = config.absorbBodyProgPct \|\| 50;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:70` | N | Y | `this.absorbWickProgPct = config.absorbWickProgPct \|\| 40;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:71` | N | Y | `this.absorbVolProgMult = config.absorbVolProgMult \|\| 0.9;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:72` | N | Y | `this.initBodyProgPct = config.initBodyProgPct \|\| 45;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:75` | N | Y | `this.cvdDivLen = config.cvdDivLen \|\| 10;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:78` | N | Y | `this.atrLen = config.atrLen \|\| 14;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:79` | N | Y | `this.lowConvATRMult = config.lowConvATRMult \|\| 0.5;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:80` | N | Y | `this.midConvATRMult = config.midConvATRMult \|\| 1.0;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:81` | N | Y | `this.highConvATRMult = config.highConvATRMult \|\| 1.5;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:82` | N | Y | `this.slBufferPct = config.slBufferPct \|\| 0.15;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:83` | N | Y | `this.maxLossPct = config.maxLossPct \|\| 0.3;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:84` | N | Y | `this.maxHoldBars = config.maxHoldBars \|\| 60;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:85` | N | Y | `this.maxDailyLosses = config.maxDailyLosses \|\| 3;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:89` | N | Y | `this.validSessionStartHour = config.validSessionStartHour \|\| 9;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:90` | N | Y | `this.validSessionStartMin = config.validSessionStartMinute \|\| 45;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:91` | N | Y | `this.validSessionEndHour = config.validSessionEndHour \|\| 15;` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:92` | N | Y | `this.validSessionEndMin = config.validSessionEndMinute \|\| 45;` |
| B1_ENV_READ | `modules/SmartMoneySweep.js:112` | N | Y | `this.DEBUG = config.debug \|\| process.env.SMS_DEBUG === 'true';` |
| B2_CONFIG_FALLBACK | `modules/SmartMoneySweep.js:117` | N | Y | `this.vpLookbackBars = config.vpLookbackBars \|\| 0;` |
| B2_CONFIG_FALLBACK | `modules/TimeSeriesMomentum.js:28` | N | Y | `const cfg = { ...(base \|\| {}), ...(overrides \|\| {}) };` |
| B2_CONFIG_FALLBACK | `modules/TimeSeriesMomentum.js:93` | N | Y | `partialExit: Object.freeze({ ...(cfg.partialExit \|\| { enabled: false, triggerR: 1, fraction: 0.5, remainderTrail: 'atr' }) }),` |
| B3_DEFAULT_PARAM | `modules/TimeSeriesMomentum.js:102` | N | Y | `constructor(config = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:17` | N | Y | `const msg = args[0]?.toString() \|\| '';` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:128` | N | Y | `function resolveRuntimeAccountIdentity(enableBacktestMode, brokerConfig = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:136` | N | Y | `const accountId = brokerConfig.accountId \|\| 'default';` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:143` | N | Y | `function buildRuntimeAuditContext(runtimeScope, extra = {}) {` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:144` | N | Y | `const config = resolvedConfig.config \|\| {};` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:145` | N | Y | `const broker = config.broker \|\| {};` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:146` | N | Y | `const mode = config.mode \|\| {};` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:149` | N | Y | `: (mode.liveTrading ? 'live' : (mode.execution \|\| 'paper'));` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:165` | N | Y | `function resolveAlpacaSymbols(brokerConfig = {}, options = {}) {` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:179` | N | Y | `function buildAlpacaAdapterOptions(brokerConfig = {}, options = {}) {` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:193` | N | Y | `function captureRuntimeFatal(eventType, input, runtimeScope, extra = {}) {` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:209` | N | Y | `console.log(`   DATA_DIR: ${resolvedConfig.config.paths.dataDir \|\| '(default: ./data)'}`);` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:211` | N | Y | `console.log(`   TEST_MODE: ${resolvedConfig.config.mode.testMode \|\| false}`);` |
| B1_ENV_READ | `run-empire-v2.js:278` | N | N | `const ENABLE_DPS = process.env.ENABLE_DPS === 'true';` |
| B1_ENV_READ | `run-empire-v2.js:352` | N | N | `applyBacktestConfigOverrides(process.env.BACKTEST_CONFIG_OVERRIDES_JSON, {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:443` | N | Y | `const { EnhancedPatternChecker } = EnhancedPatternRecognition \|\| {};` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:482` | N | Y | `function getDirectionDisplayLabel(direction, assetType = 'crypto') {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:547` | N | Y | `candle.v ?? 0,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:584` | N | Y | `this.pipeline = _pipelineCfg ?? {};` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:663` | N | Y | `this.patternExitModel = new PatternBasedExitModel(featureFlags.features.PATTERN_EXIT_MODEL.settings \|\| {});` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:684` | N | Y | `const mtfServiceConfig = ConfigLoader.get('orchestrator.mtfConfluenceService') \|\| {};` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:687` | N | Y | `activeTimeframes: ConfigLoader.get('orchestrator.mtfTimeframes') \|\| ['1m', '5m', '15m', '1h', '4h', '1d'],` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:707` | N | Y | `const emaConfig = ConfigLoader.get('strategies.EMASMACrossover') ?? {};` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:710` | N | Y | `const masrConfig = ConfigLoader.get('strategies.MADynamicSR') ?? {};` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:712` | N | Y | `entryMaPeriod: masrConfig.entryMaPeriod ?? 20,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:713` | N | Y | `srMaPeriod: masrConfig.srMaPeriod ?? 200,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:714` | N | Y | `touchZonePct: masrConfig.touchZonePct ?? 0.6,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:715` | N | Y | `srTestCount: masrConfig.srTestCount ?? 2,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:716` | N | Y | `swingLookback: masrConfig.swingLookback ?? 3,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:717` | N | Y | `srZonePct: masrConfig.srZonePct ?? 1.0,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:718` | N | Y | `slopeLookback: masrConfig.slopeLookback ?? 5,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:719` | N | Y | `minSlopePct: masrConfig.minSlopePct ?? 0.03,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:720` | N | Y | `extensionPct: masrConfig.extensionPct ?? 2.0,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:721` | N | Y | `skipFirstTouch: masrConfig.skipFirstTouch ?? true,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:722` | N | Y | `atrPeriod: masrConfig.atrPeriod ?? 14,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:723` | N | Y | `patternPersistBars: masrConfig.patternPersistBars ?? 15,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:742` | N | Y | `const vpConfig = ConfigLoader.get('strategies.VolumeProfile') ?? {};` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:744` | N | Y | `sessionLookback: vpConfig.sessionLookback ?? 96,    // 96 x 15min = 24 hours` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:745` | N | Y | `numBins: vpConfig.numBins ?? 50,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:746` | N | Y | `valueAreaPct: vpConfig.valueAreaPct ?? 0.70,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:747` | N | Y | `outOfBalancePct: vpConfig.outOfBalancePct ?? 0.5,   // FIX: Was 0.1%, needs 0.5%` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:748` | N | Y | `recalcInterval: vpConfig.recalcInterval ?? 5,` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:756` | N | Y | `this.activeExitSystem = resolvedConfig.config.exits.exitSystem \|\| featureFlags.features?.EXIT_SYSTEM?.settings?.activeSystem \|\| 'maxprofit';` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:830` | N | Y | `sessionRouteUsesCrypto ? (this.sessionRouterConfig.cryptoSymbols \|\| []) : [],` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:840` | N | Y | `console.log(`[EMPIRE V2] SessionRouter route active — mode=${sessionRouterMode} staticSession=${staticSession \|\| '(none)'}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:897` | N | Y | `source: `sessionRouter:${this.sessionRouter?.activeSession \|\| 'unknown'}`,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:919` | N | Y | `console.error(`[VIS][OHLC][Runner] dropped ${tf} SessionRouter candle: missing symbol \| session=${this.sessionRouter?.activeSession \|\| '(none)'} contexts=${describeSymbolContexts(this.symbolContexts)}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:924` | N | Y | `source: `sessionRouter:${this.sessionRouter?.activeSession \|\| 'unknown'}`,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:938` | N | Y | `const visKey = `session:${this.sessionRouter?.activeSession \|\| 'unknown'}:${sym}:${tf}`;` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:941` | N | Y | `console.log(`[VIS][OHLC][Runner] source=sessionRouter session=${this.sessionRouter?.activeSession \|\| '(none)'} timeframe=${tf} symbolSource=${symbolSource} payloadSymbol=${eventSymbol \|\| rawSymbol \|\| '(missing)'} symbol=${sym} close=${ohlcData[5]} contexts=${describeSymbolContexts(this.symbolContexts)}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:969` | N | Y | `source: `sessionRouter:${this.sessionRouter?.activeSession \|\| 'unknown'}`,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:990` | N | Y | `console.log(`[VIS][TradingCycle] waiting for new ${tf} candle boundary before analysis \| symbol=${sym} etime=${storedCandle.candle?.etime \|\| '(missing)'}`);` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:1084` | N | Y | `console.log(`[VIS][BOOT][SymbolContexts] broker=${resolvedConfig.config.broker.id} sessionRouterMode=${sessionRouterMode \|\| '(missing)'} staticSession=${staticSession \|\| '(none)'} tradingPair=${this.tradingPair} registered=${describeSymbolContexts(this.symbolContexts)} quarantined=${Array.from(this.symbolContextQuarantine.keys()).join(',') \|\| '(none)'}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1103` | N | Y | `console.log(`IndicatorEngine synced with priceHistory (RSI: ${indicatorEngine.getSnapshot().indicators?.rsi?.toFixed(1) \|\| 'warming up'})`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1120` | N | Y | `console.log(`Signal modules synced (EMA states: ${Object.values(emaSnap.crossoverState).filter(s => s.side !== 'none').length}, SR swings: ${srSnap.swings?.length \|\| 0})`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1183` | N | Y | `console.log('Using existing state - Balance:', currentState.balance, 'Trades:', currentState.activeTrades?.size \|\| 0);` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:1191` | N | Y | `// Without this, peakBalance=0, drawdown=Infinity, checkRiskLimits() blocks ALL trades` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:1314` | N | Y | `// resolvedConfig); the original chain `\|\| 'BTC-USD'` was a silent fallback` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:1342` | N | Y | `.includes(String(this.config.assetClass \|\| '').trim().toLowerCase());` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1534` | N | Y | `// saved candles. Original `\|\| 'BTC-USD'` would silently load the` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1584` | N | Y | `const stocks = (this.sessionRouter.stockSymbols \|\| []).map(normalizeRuntimeSymbol).filter(Boolean);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1603` | N | Y | `v: Number(raw?.v ?? raw?.volume ?? 0)` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:1611` | N | Y | `_getRestRecoveryScopeEnvelope(source, symbol, timeframe, overrides = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1740` | N | Y | `const runtimePipeline = ConfigLoader.get('pipeline') \|\| {};` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1741` | N | Y | `const runtimeSoloFilter = ConfigLoader.get('strategies.soloFilter') \|\| [];` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:1747` | N | Y | `console.log(`  CANDLE_DATA_FILE=${resolvedConfig.config.backtest.candleDataFile \|\| 'default'}`);` |
| B1_ENV_READ | `run-empire-v2.js:1749` | N | Y | `console.log(`  BACKTEST_MODE=${process.env.BACKTEST_MODE \|\| 'false'}`);` |
| B1_ENV_READ | `run-empire-v2.js:1750` | N | Y | `console.log(`  BACKTEST_FAST=${process.env.BACKTEST_FAST \|\| 'false'}`);` |
| B1_ENV_READ | `run-empire-v2.js:1751` | N | Y | `console.log(`  BACKTEST_NO_PATTERN_SAVE=${process.env.BACKTEST_NO_PATTERN_SAVE \|\| 'false'}`);` |
| B1_ENV_READ | `run-empire-v2.js:1752` | N | Y | `console.log(`  FEE_MAKER=${process.env.FEE_MAKER \|\| 'default'}`);` |
| B1_ENV_READ | `run-empire-v2.js:1753` | N | Y | `console.log(`  FEE_TAKER=${process.env.FEE_TAKER \|\| 'default'}`);` |
| B1_ENV_READ | `run-empire-v2.js:1755` | N | Y | `console.log(`  ENABLE_TRAI=${process.env.ENABLE_TRAI \|\| 'true'}`);` |
| B1_ENV_READ | `run-empire-v2.js:1759` | N | Y | `console.log(`  SMS_VP_RTH_ONLY=${process.env.SMS_VP_RTH_ONLY \|\| 'true'}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1796` | N | Y | `const reason = sessionStartResult?.reason \|\| 'SessionRouter did not produce an active broker';` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:1880` | N | Y | `startupEntryBlocks.push(stateManager.get('pauseReason') \|\| stateManager.get('lastError') \|\| 'StateManager.isTrading=false');` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:1905` | N | Y | `attachDashboardDepthUpdates(adapter, isActive, allowedSymbols = []) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2050` | N | Y | `return this.symbolTimeframeHistories.get(canonicalSymbol)?.get(timeframe) \|\| [];` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2069` | N | Y | `getCandleScopeEnvelope(overrides = {}) {` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2146` | N | Y | `promoteBrokerAccountIdentity(adapter, context = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2158` | N | Y | `console.warn(`[SCOPE][Account] broker=${brokerId \|\| '(unknown)'} source=${context.source \|\| 'runtime'} has no verified account identity; runtime scope remains incomplete`);` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2172` | N | Y | `resolveBrokerAccountScope(brokerId, overrides = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2177` | N | Y | `accountIdSource: overrides.accountIdSource \|\| 'scope',` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:2195` | N | Y | `accountIdSource: this.config.accountIdSource \|\| 'config',` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2202` | N | Y | `syncDashboardRuntimeScope(symbol = this.tradingPair, overrides = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2303` | N | Y | `const globalCached = this.getCandlesForTimeframe(timeframe) \|\| [];` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2314` | N | Y | `async fetchAndSendHistoricalCandles(timeframe, limit = 200, requestedAsset = null) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2505` | N | Y | `const reason = error && error.message ? error.message : String(error \|\| 'unknown exit monitor failure');` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2507` | N | Y | `console.error(`[EXIT-MONITOR] ${normalizedSymbol \|\| '(missing-symbol)'} failed: ${reason}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2554` | N | Y | `reason: haltResult?.reason \|\| 'haltSymbol_failed',` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2581` | N | Y | `const reason = error && error.message ? error.message : String(error \|\| 'unknown TTP cutoff enforcement failure');` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2637` | N | Y | `reason: haltResult?.reason \|\| 'haltSymbol_failed',` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2663` | N | Y | `getTtpExitPrice(symbol, trade, brokerPositions = []) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2739` | N | Y | `const activeSilenceDuration = Date.now() - (this.lastActiveTimeframeDataReceived \|\| 0);` |
| B2_CONFIG_FALLBACK | `run-empire-v2.js:2770` | N | Y | `const assetClass = resolvedConfig.config.broker.assetClass \|\| '';` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2776` | N | Y | `console.error(`[WATCHDOG] market phase contradicts isRTH; treating liveness as active \| broker=${brokerId} assetClass=${assetClass \|\| '(missing)'} phase=${phase.phase} isRTH=${phase.isRTH}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2780` | N | Y | `console.error(`[WATCHDOG] market phase contradicts isRTH; treating liveness as active \| broker=${brokerId} assetClass=${assetClass \|\| '(missing)'} phase=${phase.phase} isRTH=${phase.isRTH}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2785` | N | Y | `console.error(`[WATCHDOG] market phase missing boolean isRTH; treating liveness as active \| broker=${brokerId} assetClass=${assetClass \|\| '(missing)'} phase=${phase?.phase \|\| '(missing)'}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2793` | N | Y | `console.log(`[WATCHDOG] market data quiet expected \| broker=${brokerId} assetClass=${assetClass \|\| '(missing)'} phase=${phase.phase} next=${phase.nextTransition}`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2911` | N | Y | `console.error(`[WATCHDOG] LIVENESS: missing symbol/timeframe (symbol=${symbol \|\| '(missing)'} timeframe=${timeframe \|\| '(missing)'}) - not pausing trading`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2915` | N | Y | `console.warn(`[WATCHDOG] LIVENESS: brokerSilent=${brokerSilent} brokerSilence=${Math.round(brokerSilenceDuration / 1000)}s activeTimeframeSilent=${activeTimeframeSilent} activeSilence=${Math.round(activeSilenceDuration / 1000)}s activeLimit=${Math.round(activeLimitMs / 1000)}s \| symbol=${symbol} timeframe=${timeframe} lastBrokerSymbol=${this.lastBrokerDataSymbol \|\| '(none)'} lastBrokerTimeframe=${this.lastBrokerDataTimeframe \|\| '(none)'} lastActiveSymbol=${this.lastActiveTimeframeSymbol \|\| '(none)'} lastActiveTimeframe=${this.lastActiveTimeframe \|\| '(none)'} - attempting REST backfill`);` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2959` | N | Y | `const reason = status.reason \|\| 'SessionRouter failed-safe entry block';` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2972` | N | Y | `console.error(`[SESSION_ROUTER] Refusing new entry while failed-safe is active \| symbol=${canonicalSymbol \|\| '(missing)'} reason=${reason}`);` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2981` | N | Y | `_registerRoutableSymbolContexts(rawSymbols, metadata = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:2982` | N | Y | `const symbols = [...new Set((rawSymbols \|\| []).map(normalizeRuntimeSymbol).filter(Boolean))];` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:2997` | N | Y | `_recordSymbolContextRegistrationFailure(symbol, error, metadata = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3023` | N | Y | `record.quarantinedActiveTrades = activeTradeQuarantine?.quarantined \|\| 0;` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3033` | N | Y | `console.error(`[BOOT][SymbolContexts] QUARANTINED ${canonicalSymbol \|\| symbol \|\| '(missing)'}: ${reason} - removed from route set before broker subscription`);` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:3266` | N | Y | `emitDashboardErrorEvent(source, error, context = {}) {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3298` | N | Y | `const candles = this.symbolContexts?.get(symbol)?.priceHistory \|\| this.priceHistory \|\| [];` |
| B3_DEFAULT_PARAM | `run-empire-v2.js:3379` | N | Y | `async fetchWebMarketContext(query = '') {` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3428` | N | Y | `newsHeadlines: webContext.newsHeadlines \|\| [],` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3441` | N | Y | `totalTrades: stats.totalTrades \|\| 0,` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3442` | N | Y | `winRate: stats.winRate \|\| '0%',` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3443` | N | Y | `balance: stats.balance \|\| '0.00',` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3449` | N | Y | `lastDecision: this.lastDecisionContext?.decision \|\| 'HOLD',` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3450` | N | Y | `confidence: this.lastDecisionContext?.confidence \|\| 0` |
| B5_INLINE_FALLBACK | `run-empire-v2.js:3468` | N | Y | `: (response.message \|\| response.text \|\| 'Unable to generate response'),` |

## Footer

WHAT I DID DO: rebuilt pass0 as a reproducible mechanical universe; used five disjoint buckets; counted N-of-M coverage; verified the IndicatorEngine and OptimizedIndicators anchors are present; wrote this read-only artifact.

WHAT I DID NOT DO: edit runtime code, tests, config, PM2 state, broker state, or remediation priorities; claim every candidate is a bug; start Rank 2 in this commit.

WHAT I ASSUMED: pass0b is a candidate census, not a remediation ruling; false positives remain candidates until a later decision pass classifies them.
