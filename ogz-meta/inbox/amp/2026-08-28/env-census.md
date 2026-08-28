# Environment Variable Census

Date: 2026-08-28

Agent: Amp

Mission: HYGIENE, read-only runtime census; verdicts reserved for Trey.

## Method and interpretation

- Scope: `core/`, `foundation/`, `modules/`, `brokers/`, `run-empire-v2.js`, `trai_brain/`, `scripts/`, `server/`, `utils/`, `tools/`, and `ogzprime-ssl-server.js`; directories named `test`, `tests`, and `__tests__` excluded.
- JavaScript/TypeScript: Babel AST (tree-sitter-equivalent parser), 257 files, 0 parse failures. The AST walk resolves direct `process.env.NAME`, bracket/computed reads, aliases/default parameters bound to `process.env`, destructuring, ConfigLoader helper calls, and computed-reader helper callsites.
- Python: Python `ast`, 5 files, 0 parse failures. Shell: all 5 files passed Bash syntax parsing; inherited uppercase parameters were then inspected from the parsed scripts.
- Completeness cross-check: an independent lexical enumeration of static JavaScript `process.env.NAME` and ConfigLoader helper names found 469 names; all 469 are present. AST/data-flow processing added helper-mediated, statically resolvable computed, and bulk reads that lexical direct-property matching cannot see.
- Reader ownership is physical: a read in `foundation/ConfigLoader.js` is “ConfigLoader”; every other environment read is a direct bypass, including aliases such as `env = process.env`.
- Computed rows are pseudo-names such as `<computed:key>`; they preserve reads whose runtime variable name cannot be statically enumerated, including bulk environment copies/enumeration. Statically resolved helper and allowlist callsites remain separate named rows and are marked computed when their underlying read uses `process.env[expr]` or an aliased equivalent.
- “Reachable from `run-empire-v2.js`” is **y** when any listed reader module is in its static import/require closure or its verified dynamic startup closure. The latter includes immediate `core/*.js` and `utils/*.js` loaded by `ModuleAutoLoader.loadAll()`, plus Alpaca and Kraken adapters selected through BrokerFactory. It does not mean every function is invoked in every profile.
- Defaults list each AST-visible falsy fallback expression at the reader; an expression naming another variable is a continuation rather than a literal. “Fabricates” is narrowly **yes** only where a fallback supplies missing broker/instrument/account/candle/fee identity or financial truth; ordinary feature, execution-policy, timeout, and diagnostic defaults are **no**. Config-backed required values are shown as config fallbacks, not literals.
- `.env.example` membership is name-based and ignores duplicate declarations.

## Referenced variables

| Name | Every reader file:line | ConfigLoader or direct bypass | Computed read | Reachable from run-empire-v2 | Default and fabrication | In config/.env.example | Verdict |
|---|---|---|---|---|---|---|---|
| `<computed:EMBED_API_KEY_ENV>` | trai_brain/mercury-bridge/config.js:192 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:all environment entries>` | foundation/ConfigLoader.js:516,616,628,1481<br>tools/config-audit.js:102<br>tools/weekend-campaign-gauntlet.js:164,1087<br>trai_brain/mercury-bridge/llm-client.js:66<br>trai_brain/mercury-bridge/tool-adapter.js:1081,1090 | ConfigLoader + direct `process.env`/environment bypass | y | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:config.MERCURY_LLM_API_KEY_ENV>` | trai_brain/mercury-bridge/llm-client.js:560 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:config.TIE_BREAKER_API_KEY_ENV>` | trai_brain/mercury-bridge/llm-client.js:608 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:envKey>` | tools/config-audit.js:181 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:envName>` | trai_brain/mercury-bridge/config.js:76 | direct `process.env`/environment bypass | y | n | trai_brain/mercury-bridge/config.js:76 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:key>` | core/BotStateFrame.js:10<br>foundation/ConfigLoader.js:488,1939<br>scripts/supervisor-daemon.js:45<br>server/dashboard-stock-stream-config.js:52<br>tools/backtest-worker-env.js:309,310 | ConfigLoader + direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:52 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:name>` | core/TradeNarrator.js:69<br>trai_brain/mercury-bridge/adversarial-review.js:19 | direct `process.env`/environment bypass | y | y | trai_brain/mercury-bridge/adversarial-review.js:19 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `<computed:selectedKey>` | foundation/ConfigLoader.js:503 | ConfigLoader | y | y | foundation/ConfigLoader.js:503 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `ABSOLUTE_POSITION_CAP` | foundation/ConfigLoader.js:2920 | ConfigLoader | y | y | foundation/ConfigLoader.js:2920 -> 0.15<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_API_KEY` | core/BotStateFrame.js:120,127<br>core/NewsSearchProvider.js:104<br>foundation/ConfigLoader.js:976<br>server/dashboard-stock-stream-config.js:96,104,142,151<br>tools/data-parity-check.js:374 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:127 -> cleanString(env.ALPACA_MODE)<br>foundation/ConfigLoader.js:976 -> ''<br>server/dashboard-stock-stream-config.js:96 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:104 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:142 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:151 -> none (missing -> null/empty)<br>tools/data-parity-check.js:374 -> process.env.APCA_API_KEY_ID<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_API_SECRET` | core/NewsSearchProvider.js:105<br>foundation/ConfigLoader.js:977<br>server/dashboard-stock-stream-config.js:97,105,143,152<br>tools/data-parity-check.js:375 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:977 -> ''<br>server/dashboard-stock-stream-config.js:97 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:105 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:143 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:152 -> none (missing -> null/empty)<br>tools/data-parity-check.js:375 -> process.env.APCA_API_SECRET_KEY<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_DATA_STREAM_URL` | server/dashboard-stock-stream-config.js:140,149 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:140 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:149 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_MODE` | core/BotStateFrame.js:128<br>foundation/ConfigLoader.js:978,2982 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:128 -> String(env.ASSET_CLASS \|\| '').toLowerCase() === 'stocks'<br>foundation/ConfigLoader.js:978 -> ''<br>foundation/ConfigLoader.js:2982 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DATA_ADJUSTMENT` | server/dashboard-stock-stream-config.js:100,108 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:100 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:108 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DATA_FEED` | server/dashboard-stock-stream-config.js:99,107 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:99 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:107 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DATA_URL` | server/dashboard-stock-stream-config.js:98,106 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:98 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:106 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_CHUNK_MONTHS` | server/dashboard-stock-stream-config.js:168,180 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:168 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:180 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_END` | scripts/fetch-stock-data.js:47 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_FILENAME_TIMEFRAME` | server/dashboard-stock-stream-config.js:166,178 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:166 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:178 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_LIMIT` | server/dashboard-stock-stream-config.js:167,179 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:167 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:179 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_OUTPUT_DIR` | server/dashboard-stock-stream-config.js:163,175 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:163 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:175 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_OUTPUT_FILE` | scripts/fetch-stock-data.js:48 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_RATE_LIMIT_MS` | server/dashboard-stock-stream-config.js:169,181 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:169 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:181 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_SESSION_PROFILE` | scripts/fetch-stock-data.js:49 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_START` | scripts/fetch-stock-data.js:46 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_SYMBOLS` | server/dashboard-stock-stream-config.js:162,174 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:162 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:174 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_TIMEFRAME` | server/dashboard-stock-stream-config.js:165,177 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:165 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:177 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_DOWNLOAD_YEARS` | server/dashboard-stock-stream-config.js:164,176 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:164 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:176 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_STOCK_STREAM_FEED` | server/dashboard-stock-stream-config.js:141,150 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:141 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:150 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `ALPACA_SYMBOLS` | core/BotStateFrame.js:126<br>foundation/ConfigLoader.js:979,2983 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:126 -> cleanString(env.ALPACA_API_KEY)<br>foundation/ConfigLoader.js:979 -> ''<br>foundation/ConfigLoader.js:2983 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `APCA_API_KEY_ID` | tools/data-parity-check.js:374 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `APCA_API_SECRET_KEY` | tools/data-parity-check.js:375 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `API_PORT` | ogzprime-ssl-server.js:64 | direct `process.env`/environment bypass | n | n | ogzprime-ssl-server.js:64 -> 3010<br>silently fabricates trading-critical data: **no** | y |  |
| `APPDATA` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `ARCHITECT_NARRATOR` | core/TradeNarrator.js:292 | direct `process.env`/environment bypass | y | y | core/TradeNarrator.js:292 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `ASSET_CLASS` | core/BotStateFrame.js:129<br>core/UnifiedPatternMemory.js:200<br>foundation/ConfigLoader.js:983,2986 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:129 -> ''<br>core/UnifiedPatternMemory.js:200 -> (process.env.BROKER \|\| '').toLowerCase() === 'kraken' ? 'crypto' : (process.env.BROKER \|\| '').toLowerCase() === 'alpaca' ? 'stocks' : null<br>foundation/ConfigLoader.js:983 -> _isKraken ? 'crypto' : 'stocks'<br>foundation/ConfigLoader.js:2986 -> env('BROKER', 'alpaca') === 'kraken' ? 'crypto' : 'stocks'<br>silently fabricates trading-critical data: **yes** | n |  |
| `ATR_CONTRACTS_ENABLED` | foundation/ConfigLoader.js:838,3290 | ConfigLoader | y | y | foundation/ConfigLoader.js:838 -> configuredValue('strategyBehavior.atrContracts.enabled', false)<br>foundation/ConfigLoader.js:3290 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `ATR_FILTER_ENABLED` | foundation/ConfigLoader.js:907,3267<br>tools/config-audit.js:264 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:907 -> requiredConfiguredBool('filters.atrEnabled')<br>foundation/ConfigLoader.js:3267 -> false<br>tools/config-audit.js:264 -> 'false (DISABLED)'<br>silently fabricates trading-critical data: **no** | n |  |
| `ATR_MIN_PERCENT` | foundation/ConfigLoader.js:908,3268<br>tools/config-audit.js:265 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:908 -> requiredConfiguredNumber('filters.atrMinPercent')<br>foundation/ConfigLoader.js:3268 -> 0.15<br>tools/config-audit.js:265 -> 0.15<br>silently fabricates trading-critical data: **no** | n |  |
| `ATR_STOP_MULTIPLIER` | foundation/ConfigLoader.js:839,3291 | ConfigLoader | y | y | foundation/ConfigLoader.js:839 -> configuredValue('strategyBehavior.atrContracts.stopMultiplier', 2.0)<br>foundation/ConfigLoader.js:3291 -> 2.0<br>silently fabricates trading-critical data: **no** | n |  |
| `ATR_TRAILING_ACTIVATION_R` | foundation/ConfigLoader.js:841,3293 | ConfigLoader | y | y | foundation/ConfigLoader.js:841 -> configuredValue('strategyBehavior.atrContracts.trailingActivationR', 1.0)<br>foundation/ConfigLoader.js:3293 -> 1.0<br>silently fabricates trading-critical data: **no** | n |  |
| `ATR_TRAIL_MULTIPLIER` | foundation/ConfigLoader.js:840,3292 | ConfigLoader | y | y | foundation/ConfigLoader.js:840 -> configuredValue('strategyBehavior.atrContracts.trailMultiplier', 2.0)<br>foundation/ConfigLoader.js:3292 -> 2.0<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_CONFIG_OVERRIDES_JSON` | run-empire-v2.js:352 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_FAST` | core/EnhancedPatternRecognition.js:556<br>foundation/ConfigLoader.js:732<br>run-empire-v2.js:1750<br>tools/config-audit.js:271 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:732 -> false<br>run-empire-v2.js:1750 -> 'false'<br>tools/config-audit.js:271 -> 'false'<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_MODE` | core/SingletonLock.js:28<br>core/TRAIDecisionModule.js:1029<br>run-empire-v2.js:1749<br>tools/config-audit.js:215 | direct `process.env`/environment bypass | y | y | core/SingletonLock.js:28 -> process.env.TEST_MODE === 'true'<br>run-empire-v2.js:1749 -> 'false'<br>tools/config-audit.js:215 -> 'false'<br>silently fabricates trading-critical data: **no** | y |  |
| `BACKTEST_NO_PATTERN_SAVE` | core/TradingLoop.js:2162<br>core/UnifiedPatternMemory.js:230<br>foundation/ConfigLoader.js:733<br>run-empire-v2.js:1751<br>tools/config-audit.js:273 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:733 -> false<br>run-empire-v2.js:1751 -> 'false'<br>tools/config-audit.js:273 -> 'false'<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_OUTPUT_DIR` | core/BacktestRunner.js:397,531<br>core/OutputPaths.js:12,36,48,61<br>tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_REPORT_TAG` | core/BacktestRunner.js:398 | direct `process.env`/environment bypass | n | y | core/BacktestRunner.js:398 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_SILENT` | core/SingletonLock.js:40<br>foundation/ConfigLoader.js:730<br>tools/config-audit.js:270 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:730 -> false<br>tools/config-audit.js:270 -> 'false'<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_TUNING_PROFILE` | foundation/ConfigLoader.js:496,503 | ConfigLoader | y | y | foundation/ConfigLoader.js:503 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `BACKTEST_VERBOSE` | core/MarketRegimeDetector.js:278<br>foundation/ConfigLoader.js:731<br>modules/LiquiditySweepDetector.js:229<br>tools/config-audit.js:272 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:731 -> false<br>tools/config-audit.js:272 -> 'false'<br>silently fabricates trading-critical data: **no** | n |  |
| `BASE_POSITION_PCT` | foundation/ConfigLoader.js:2918 | ConfigLoader | y | y | foundation/ConfigLoader.js:2918 -> 0.01<br>silently fabricates trading-critical data: **no** | n |  |
| `BASE_POSITION_SIZE` | foundation/ConfigLoader.js:787,2324<br>tools/config-audit.js:226 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:787 -> 0.01<br>foundation/ConfigLoader.js:2324 -> 0.01<br>tools/config-audit.js:226 -> 0.01<br>silently fabricates trading-critical data: **no** | y |  |
| `BE_SCALEOUT_ENABLED` | foundation/ConfigLoader.js:802,2818 | ConfigLoader | y | y | foundation/ConfigLoader.js:802 -> configuredValue('exitLogic.beScaleOut.enabled', true)<br>foundation/ConfigLoader.js:2818 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `BE_SCALEOUT_FEE_BUFFER` | foundation/ConfigLoader.js:806,2822 | ConfigLoader | y | y | foundation/ConfigLoader.js:806 -> configuredValue('exitLogic.beScaleOut.feeBufferPercent', 0.05)<br>foundation/ConfigLoader.js:2822 -> 0.05<br>silently fabricates trading-critical data: **no** | n |  |
| `BE_SCALEOUT_FRACTION` | foundation/ConfigLoader.js:805,2821 | ConfigLoader | y | y | foundation/ConfigLoader.js:805 -> configuredValue('exitLogic.beScaleOut.scaleOutFraction', 0.5)<br>foundation/ConfigLoader.js:2821 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `BE_SCALEOUT_TRIGGER` | foundation/ConfigLoader.js:803,2819 | ConfigLoader | y | y | foundation/ConfigLoader.js:803 -> configuredValue('exitLogic.beScaleOut.triggerType', 'one_to_one_r')<br>foundation/ConfigLoader.js:2819 -> 'one_to_one_r'<br>silently fabricates trading-critical data: **no** | n |  |
| `BE_SCALEOUT_TRIGGER_PCT` | foundation/ConfigLoader.js:804,2820 | ConfigLoader | y | y | foundation/ConfigLoader.js:804 -> configuredValue('exitLogic.beScaleOut.fixedPercentTrigger', 0.5)<br>foundation/ConfigLoader.js:2820 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `BOOT_REST_HYDRATION_LIMIT` | foundation/ConfigLoader.js:761,2960 | ConfigLoader | y | y | foundation/ConfigLoader.js:761 -> 60<br>foundation/ConfigLoader.js:2960 -> 60<br>silently fabricates trading-critical data: **no** | n |  |
| `BOT_TIER` | foundation/ConfigLoader.js:1055 | ConfigLoader | y | y | foundation/ConfigLoader.js:1055 -> 'ml'<br>silently fabricates trading-critical data: **no** | n |  |
| `BREAKEVEN_EXIT_PERCENT` | foundation/ConfigLoader.js:2475 | ConfigLoader | y | y | foundation/ConfigLoader.js:2475 -> 50<br>silently fabricates trading-critical data: **no** | y |  |
| `BREAKEVEN_STOP_ENABLED` | foundation/ConfigLoader.js:2826 | ConfigLoader | y | y | foundation/ConfigLoader.js:2826 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `BREAKEVEN_STOP_TRIGGER_PCT` | foundation/ConfigLoader.js:2827 | ConfigLoader | y | y | foundation/ConfigLoader.js:2827 -> 0.2<br>silently fabricates trading-critical data: **no** | n |  |
| `BREAKEVEN_TRIGGER` | foundation/ConfigLoader.js:2474 | ConfigLoader | y | y | foundation/ConfigLoader.js:2474 -> 0.5<br>silently fabricates trading-critical data: **no** | y |  |
| `BRIGHTDATA_API_KEY` | core/NewsSearchProvider.js:125 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `BRIGHTDATA_SERP_ZONE` | core/NewsSearchProvider.js:126 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `BROKER` | core/BotStateFrame.js:104,130<br>core/MultiAssetManager.js:40,52<br>core/UnifiedPatternMemory.js:201,202<br>foundation/ConfigLoader.js:969,2981,2984,2986 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:130 -> ''<br>core/MultiAssetManager.js:40 -> 'kraken'<br>core/UnifiedPatternMemory.js:201 -> ''<br>core/UnifiedPatternMemory.js:202 -> ''<br>foundation/ConfigLoader.js:969 -> 'alpaca'<br>foundation/ConfigLoader.js:2981 -> 'alpaca'<br>foundation/ConfigLoader.js:2984 -> 'alpaca'<br>foundation/ConfigLoader.js:2986 -> 'alpaca'<br>silently fabricates trading-critical data: **yes** | n |  |
| `BROKER_ACCOUNT_ID` | foundation/ConfigLoader.js:984,2987 | ConfigLoader | y | y | foundation/ConfigLoader.js:984 -> 'default'<br>foundation/ConfigLoader.js:2987 -> 'default'<br>silently fabricates trading-critical data: **yes** | n |  |
| `CANDLE_DATA_FILE` | core/BacktestRunner.js:410,411<br>core/UnifiedPatternMemory.js:194,195<br>foundation/ConfigLoader.js:727<br>tools/config-audit.js:268 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:727 -> ''<br>tools/config-audit.js:268 -> 'none'<br>silently fabricates trading-critical data: **no** | n |  |
| `CANDLE_FILE` | foundation/ConfigLoader.js:728,3691<br>tools/strategy-parity.js:28<br>tools/trade-validator.js:43 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:728 -> ''<br>foundation/ConfigLoader.js:3691 -> 'tuning/full-45k.json'<br>tools/strategy-parity.js:28 -> 'tuning/full-45k.json'<br>tools/trade-validator.js:43 -> 'tuning/full-45k.json'<br>silently fabricates trading-critical data: **yes** | n |  |
| `CANDLE_PATTERN_MIN_CONFIDENCE` | foundation/ConfigLoader.js:2267 | ConfigLoader | y | y | foundation/ConfigLoader.js:2267 -> requiredConfigNumber('confidence.candlePatternMinConfidence')<br>silently fabricates trading-critical data: **no** | n |  |
| `CANDLE_SOURCE` | core/SingletonLock.js:26<br>foundation/ConfigLoader.js:720,3690<br>tools/config-audit.js:218 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:720 -> 'websocket'<br>foundation/ConfigLoader.js:3690 -> 'live'<br>tools/config-audit.js:218 -> 'websocket'<br>silently fabricates trading-critical data: **yes** | n |  |
| `CANDLE_TIMEFRAME` | foundation/ConfigLoader.js:981,2985 | ConfigLoader | y | y | foundation/ConfigLoader.js:981 -> '15m'<br>foundation/ConfigLoader.js:2985 -> '15m'<br>silently fabricates trading-critical data: **yes** | n |  |
| `COMSPEC` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `CONFLUENCE_MIN_SCORE` | foundation/ConfigLoader.js:2269 | ConfigLoader | y | y | foundation/ConfigLoader.js:2269 -> requiredConfigNumber('confidence.confluenceMinScore')<br>silently fabricates trading-critical data: **no** | n |  |
| `ComSpec` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_BROKER_STATUS_DEDUPE_MAX_KEYS` | foundation/ConfigLoader.js:1049,3366 | ConfigLoader | y | y | foundation/ConfigLoader.js:1049 -> 200<br>foundation/ConfigLoader.js:3366 -> 200<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_CRYPTO_PRICE_INTERVAL_MS` | ogzprime-ssl-server.js:1154 | direct `process.env`/environment bypass | n | n | ogzprime-ssl-server.js:1154 -> 5000<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_CRYPTO_PRICE_SYMBOLS` | ogzprime-ssl-server.js:1142 | direct `process.env`/environment bypass | n | n | ogzprime-ssl-server.js:1142 -> process.env.WATCHLIST_CRYPTO_SYMBOLS<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_DEPTH_MIN_INTERVAL_MS` | core/DashboardDepthCoalescer.js:5 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_EDGE_ANALYTICS_MAX_SCOPES` | foundation/ConfigLoader.js:1050,3367 | ConfigLoader | y | y | foundation/ConfigLoader.js:1050 -> 200<br>foundation/ConfigLoader.js:3367 -> 200<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_ERROR_EVENT_DEDUPE_MAX_KEYS` | foundation/ConfigLoader.js:1048,3365 | ConfigLoader | y | y | foundation/ConfigLoader.js:1048 -> 200<br>foundation/ConfigLoader.js:3365 -> 200<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_ERROR_EVENT_DEDUPE_MS` | foundation/ConfigLoader.js:1046,3363 | ConfigLoader | y | y | foundation/ConfigLoader.js:1046 -> 5000<br>foundation/ConfigLoader.js:3363 -> 5000<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_ERROR_EVENT_MESSAGE_MAX_LENGTH` | foundation/ConfigLoader.js:1047,3364 | ConfigLoader | y | y | foundation/ConfigLoader.js:1047 -> 500<br>foundation/ConfigLoader.js:3364 -> 500<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_STATE_UPDATE_HEARTBEAT_MS` | foundation/ConfigLoader.js:3362 | ConfigLoader | y | y | foundation/ConfigLoader.js:3362 -> 30000<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_STOCK_PRICE_INTERVAL_MS` | ogzprime-ssl-server.js:1149 | direct `process.env`/environment bypass | n | n | ogzprime-ssl-server.js:1149 -> 5000<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_STOCK_PRICE_SYMBOLS` | server/dashboard-stock-stream-config.js:120,127 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:120 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:127 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_STOCK_STREAM_ENABLED` | server/dashboard-stock-stream-config.js:135 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_TOKEN_CHECK_BASE_URL` | scripts/check-dashboard-token-containment.js:63 | direct `process.env`/environment bypass | n | n | scripts/check-dashboard-token-containment.js:63 -> DEFAULT_BASE_URL<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_WALL_MIN_USD` | core/CryptoMarketFeed.js:72 | direct `process.env`/environment bypass | n | y | core/CryptoMarketFeed.js:72 -> 1_000_000<br>silently fabricates trading-critical data: **no** | n |  |
| `DASHBOARD_WHALE_TRADE_MIN_USD` | core/CryptoMarketFeed.js:73 | direct `process.env`/environment bypass | n | y | core/CryptoMarketFeed.js:73 -> 250_000<br>silently fabricates trading-critical data: **no** | n |  |
| `DATA_DIR` | core/PatternMemoryBank.js:183<br>core/SingletonLock.js:14<br>core/UnifiedPatternMemory.js:248<br>foundation/ConfigLoader.js:657 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/PatternMemoryBank.js:183 -> path.join(__dirname, '..')<br>core/SingletonLock.js:14 -> process.cwd()<br>core/UnifiedPatternMemory.js:248 -> config.storagePath ? path.dirname(config.storagePath) : path.join(process.cwd(), 'data')<br>foundation/ConfigLoader.js:657 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `DECISION_AUTOPSY_ENABLED` | core/DecisionAutopsyLogger.js:8 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `DECISION_AUTOPSY_FALLBACK_DIR` | core/DecisionAutopsyLogger.js:17,18 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `DID_API_KEY` | core/trai_core.js:89 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `DISCORD_STATS_WEBHOOK_URL` | utils/discordNotifier.js:53 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `DISCORD_STATUS_WEBHOOK_URL` | utils/discordNotifier.js:54 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `DONCHIAN_ALLOW_SHORTS` | foundation/ConfigLoader.js:3072 | ConfigLoader | y | y | foundation/ConfigLoader.js:3072 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `DONCHIAN_ATR_PERIOD` | foundation/ConfigLoader.js:3070 | ConfigLoader | y | y | foundation/ConfigLoader.js:3070 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `DONCHIAN_ATR_STOP_MULT` | foundation/ConfigLoader.js:3071 | ConfigLoader | y | y | foundation/ConfigLoader.js:3071 -> 2.5<br>silently fabricates trading-critical data: **no** | n |  |
| `DONCHIAN_ENTRY_PERIOD` | foundation/ConfigLoader.js:3069 | ConfigLoader | y | y | foundation/ConfigLoader.js:3069 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `DOTENV_CONFIG_PATH` | foundation/ConfigLoader.js:740,1479<br>tools/config-audit.js:100 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:740 -> '.env'<br>foundation/ConfigLoader.js:1479 -> '.env'<br>tools/config-audit.js:100 -> '.env'<br>silently fabricates trading-critical data: **no** | n |  |
| `DYNAMIC_SIZING_ENABLED` | foundation/ConfigLoader.js:2917 | ConfigLoader | y | y | foundation/ConfigLoader.js:2917 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `EDGAR_USER_AGENT` | core/NewsSearchProvider.js:109,119 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `ELEVENLABS_API_KEY` | core/trai_core.js:88 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `EMA_MTF_4H_MACD_BOOST_MULT` | foundation/ConfigLoader.js:3204 | ConfigLoader | y | y | foundation/ConfigLoader.js:3204 -> 1.15<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_MTF_FRESH_50_200_MIN_1H_TREND_STRENGTH` | foundation/ConfigLoader.js:3205 | ConfigLoader | y | y | foundation/ConfigLoader.js:3205 -> 0.30<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_MTF_HOURLY_TREND_VETO_MULT` | foundation/ConfigLoader.js:3203 | ConfigLoader | y | y | foundation/ConfigLoader.js:3203 -> 0.95<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_ALLOW_SHORTS` | foundation/ConfigLoader.js:3136 | ConfigLoader | y | y | foundation/ConfigLoader.js:3136 -> requiredConfiguredBool('strategies.EMATrendRetest.allowShorts')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_ATR_PERIOD` | foundation/ConfigLoader.js:3115 | ConfigLoader | y | y | foundation/ConfigLoader.js:3115 -> requiredConfiguredNumber('strategies.EMATrendRetest.atrPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_ATR_STOP_MULT` | foundation/ConfigLoader.js:3127 | ConfigLoader | y | y | foundation/ConfigLoader.js:3127 -> requiredConfiguredNumber('strategies.EMATrendRetest.atrStopMult')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_CLOSE_AWAY_ATR` | foundation/ConfigLoader.js:3120 | ConfigLoader | y | y | foundation/ConfigLoader.js:3120 -> requiredConfiguredNumber('strategies.EMATrendRetest.closeAwayAtr')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_CONFIDENCE_BASE` | foundation/ConfigLoader.js:3122 | ConfigLoader | y | y | foundation/ConfigLoader.js:3122 -> requiredConfiguredNumber('strategies.EMATrendRetest.confidenceBase')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_CONFIDENCE_CONFIRMATION_BONUS` | foundation/ConfigLoader.js:3125 | ConfigLoader | y | y | foundation/ConfigLoader.js:3125 -> requiredConfiguredNumber('strategies.EMATrendRetest.confidenceConfirmationBonus')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_CONFIDENCE_RETEST_BONUS` | foundation/ConfigLoader.js:3124 | ConfigLoader | y | y | foundation/ConfigLoader.js:3124 -> requiredConfiguredNumber('strategies.EMATrendRetest.confidenceRetestBonus')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_CONFIDENCE_SLOPE_BONUS` | foundation/ConfigLoader.js:3123 | ConfigLoader | y | y | foundation/ConfigLoader.js:3123 -> requiredConfiguredNumber('strategies.EMATrendRetest.confidenceSlopeBonus')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_LOOKBACK` | foundation/ConfigLoader.js:3118 | ConfigLoader | y | y | foundation/ConfigLoader.js:3118 -> requiredConfiguredNumber('strategies.EMATrendRetest.retestLookbackBars')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_MAX_CONFIDENCE` | foundation/ConfigLoader.js:3126 | ConfigLoader | y | y | foundation/ConfigLoader.js:3126 -> requiredConfiguredNumber('strategies.EMATrendRetest.maxConfidence')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_MAX_EXTENSION_ATR` | foundation/ConfigLoader.js:3121 | ConfigLoader | y | y | foundation/ConfigLoader.js:3121 -> requiredConfiguredNumber('strategies.EMATrendRetest.maxExtensionAtr')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_MAX_HOLD_MINUTES` | foundation/ConfigLoader.js:3131 | ConfigLoader | y | y | foundation/ConfigLoader.js:3131 -> requiredConfiguredNumber('strategies.EMATrendRetest.maxHoldTimeMinutes')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_MIN_SLOPE_PCT` | foundation/ConfigLoader.js:3117 | ConfigLoader | y | y | foundation/ConfigLoader.js:3117 -> requiredConfiguredNumber('strategies.EMATrendRetest.minSlopePct')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_PERIODS` | foundation/ConfigLoader.js:3114 | ConfigLoader | y | y | foundation/ConfigLoader.js:3114 -> configuredValue('strategies.EMATrendRetest.emaPeriods')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_REQUIRE_RTH` | foundation/ConfigLoader.js:3132 | ConfigLoader | y | y | foundation/ConfigLoader.js:3132 -> requiredConfiguredBool('strategies.EMATrendRetest.requireRth')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_RTH_END_ET` | foundation/ConfigLoader.js:3134 | ConfigLoader | y | y | foundation/ConfigLoader.js:3134 -> configuredValue('strategies.EMATrendRetest.rthEndET')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_RTH_START_ET` | foundation/ConfigLoader.js:3133 | ConfigLoader | y | y | foundation/ConfigLoader.js:3133 -> configuredValue('strategies.EMATrendRetest.rthStartET')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_SESSION_TIMEZONE` | foundation/ConfigLoader.js:3135 | ConfigLoader | y | y | foundation/ConfigLoader.js:3135 -> configuredValue('strategies.EMATrendRetest.sessionTimeZone')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_SLOPE_LOOKBACK` | foundation/ConfigLoader.js:3116 | ConfigLoader | y | y | foundation/ConfigLoader.js:3116 -> requiredConfiguredNumber('strategies.EMATrendRetest.slopeLookbackBars')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_TARGET_RR` | foundation/ConfigLoader.js:3128 | ConfigLoader | y | y | foundation/ConfigLoader.js:3128 -> requiredConfiguredNumber('strategies.EMATrendRetest.targetRR')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_TOUCH_ZONE_ATR` | foundation/ConfigLoader.js:3119 | ConfigLoader | y | y | foundation/ConfigLoader.js:3119 -> requiredConfiguredNumber('strategies.EMATrendRetest.touchZoneAtr')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_TRAIL_ACTIVATION_R` | foundation/ConfigLoader.js:3129 | ConfigLoader | y | y | foundation/ConfigLoader.js:3129 -> requiredConfiguredNumber('strategies.EMATrendRetest.trailActivationR')<br>silently fabricates trading-critical data: **no** | n |  |
| `EMA_TREND_RETEST_TRAIL_DISTANCE_R` | foundation/ConfigLoader.js:3130 | ConfigLoader | y | y | foundation/ConfigLoader.js:3130 -> requiredConfiguredNumber('strategies.EMATrendRetest.trailDistanceR')<br>silently fabricates trading-critical data: **no** | n |  |
| `ENABLE_ARBITRAGE` | foundation/ConfigLoader.js:3653 | ConfigLoader | y | y | foundation/ConfigLoader.js:3653 -> true<br>silently fabricates trading-critical data: **no** | y |  |
| `ENABLE_DASHBOARD` | foundation/ConfigLoader.js:1029,3683 | ConfigLoader | y | y | foundation/ConfigLoader.js:1029 -> true<br>foundation/ConfigLoader.js:3683 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `ENABLE_DPS` | run-empire-v2.js:278 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `ENABLE_DYNAMIC_SIZING` | foundation/ConfigLoader.js:3650 | ConfigLoader | y | y | foundation/ConfigLoader.js:3650 -> true<br>silently fabricates trading-critical data: **no** | y |  |
| `ENABLE_HEDGING` | foundation/ConfigLoader.js:3654 | ConfigLoader | y | y | foundation/ConfigLoader.js:3654 -> true<br>silently fabricates trading-critical data: **no** | y |  |
| `ENABLE_LEARNING` | foundation/ConfigLoader.js:3652 | ConfigLoader | y | y | foundation/ConfigLoader.js:3652 -> true<br>silently fabricates trading-critical data: **no** | y |  |
| `ENABLE_LIVE_TRADING` | core/BotStateFrame.js:142<br>core/TRAIDecisionModule.js:1030 | direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:142 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `ENABLE_NOTIFICATIONS` | foundation/ConfigLoader.js:3684 | ConfigLoader | y | y | foundation/ConfigLoader.js:3684 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `ENABLE_RISK` | foundation/ConfigLoader.js:3680 | ConfigLoader | y | y | foundation/ConfigLoader.js:3680 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `ENABLE_TRAI` | foundation/ConfigLoader.js:999,3681<br>run-empire-v2.js:1755 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:999 -> true<br>foundation/ConfigLoader.js:3681 -> true<br>run-empire-v2.js:1755 -> 'true'<br>silently fabricates trading-critical data: **no** | y |  |
| `ENABLE_VOLATILITY_SCALING` | foundation/ConfigLoader.js:3651 | ConfigLoader | y | y | foundation/ConfigLoader.js:3651 -> true<br>silently fabricates trading-critical data: **no** | y |  |
| `ENTRY_CONSISTENCY_CAP_BUFFER` | foundation/ConfigLoader.js:2926 | ConfigLoader | y | y | foundation/ConfigLoader.js:2926 -> 0.98<br>silently fabricates trading-critical data: **no** | n |  |
| `ENTRY_DAILY_LOSS_RISK_FRACTION` | foundation/ConfigLoader.js:2927 | ConfigLoader | y | y | foundation/ConfigLoader.js:2927 -> 1.0<br>silently fabricates trading-critical data: **no** | n |  |
| `ENTRY_MAX_STOCK_NOTIONAL` | foundation/ConfigLoader.js:2925 | ConfigLoader | y | y | foundation/ConfigLoader.js:2925 -> 0<br>silently fabricates trading-critical data: **no** | n |  |
| `ENTRY_MAX_STOCK_SHARES` | foundation/ConfigLoader.js:2924 | ConfigLoader | y | y | foundation/ConfigLoader.js:2924 -> 0<br>silently fabricates trading-critical data: **no** | n |  |
| `ENTRY_MIN_STOCK_SHARES` | foundation/ConfigLoader.js:2923 | ConfigLoader | y | y | foundation/ConfigLoader.js:2923 -> 0<br>silently fabricates trading-critical data: **no** | n |  |
| `ENTRY_STOCK_SHARE_RANGE_ENABLED` | foundation/ConfigLoader.js:2922 | ConfigLoader | y | y | foundation/ConfigLoader.js:2922 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `EVAL_TRACE_BACKTEST` | foundation/ConfigLoader.js:755 | ConfigLoader | y | y | foundation/ConfigLoader.js:755 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `EVAL_TRACE_ENABLED` | foundation/ConfigLoader.js:754 | ConfigLoader | y | y | foundation/ConfigLoader.js:754 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `EXECUTION_MODE` | core/BotStateFrame.js:137<br>core/SingletonLock.js:27<br>ogzprime-ssl-server.js:1319<br>tools/config-audit.js:214 | direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:137 -> env.TRADING_MODE<br>core/SingletonLock.js:27 -> process.env.BACKTEST_MODE === 'true'<br>tools/config-audit.js:214 -> 'paper'<br>silently fabricates trading-critical data: **no** | n |  |
| `EXIT_SYSTEM` | foundation/ConfigLoader.js:862,2471 | ConfigLoader | y | y | foundation/ConfigLoader.js:862 -> 'maxprofit'<br>foundation/ConfigLoader.js:2471 -> 'maxprofit'<br>silently fabricates trading-critical data: **no** | n |  |
| `EXIT_VOL_SL_MULT` | foundation/ConfigLoader.js:2495 | ConfigLoader | y | y | foundation/ConfigLoader.js:2495 -> 1.15<br>silently fabricates trading-critical data: **no** | n |  |
| `EXIT_VOL_THRESHOLD` | foundation/ConfigLoader.js:2494 | ConfigLoader | y | y | foundation/ConfigLoader.js:2494 -> 5.0<br>silently fabricates trading-critical data: **no** | n |  |
| `EXIT_VOL_TP_MULT` | foundation/ConfigLoader.js:2496 | ConfigLoader | y | y | foundation/ConfigLoader.js:2496 -> 1.20<br>silently fabricates trading-critical data: **no** | n |  |
| `FAST_BACKTEST` | foundation/ConfigLoader.js:734 | ConfigLoader | y | y | foundation/ConfigLoader.js:734 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `FEES_PCT` | tools/trade-validator.js:48 | direct `process.env`/environment bypass | n | n | tools/trade-validator.js:48 -> 0.50<br>silently fabricates trading-critical data: **no** | n |  |
| `FEE_MAKER` | foundation/ConfigLoader.js:659,3254<br>run-empire-v2.js:1752<br>tools/config-audit.js:244 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:659 -> 0<br>foundation/ConfigLoader.js:3254 -> 0<br>run-empire-v2.js:1752 -> 'default'<br>tools/config-audit.js:244 -> 0.0025<br>silently fabricates trading-critical data: **yes** | y |  |
| `FEE_MIN_ORDER` | foundation/ConfigLoader.js:880,3260<br>tools/config-audit.js:248 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:880 -> 0<br>foundation/ConfigLoader.js:3260 -> 0<br>tools/config-audit.js:248 -> 0<br>silently fabricates trading-critical data: **yes** | n |  |
| `FEE_MODEL` | foundation/ConfigLoader.js:875,3253<br>tools/config-audit.js:243 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:875 -> 'percent'<br>foundation/ConfigLoader.js:3253 -> 'percent'<br>tools/config-audit.js:243 -> 'percent'<br>silently fabricates trading-critical data: **yes** | n |  |
| `FEE_PER_SHARE` | foundation/ConfigLoader.js:879,3259<br>tools/config-audit.js:247 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:879 -> 0<br>foundation/ConfigLoader.js:3259 -> 0<br>tools/config-audit.js:247 -> 0<br>silently fabricates trading-critical data: **yes** | n |  |
| `FEE_SAFETY_BUFFER` | foundation/ConfigLoader.js:3258 | ConfigLoader | y | y | foundation/ConfigLoader.js:3258 -> 0<br>silently fabricates trading-critical data: **yes** | y |  |
| `FEE_SLIPPAGE` | foundation/ConfigLoader.js:3256 | ConfigLoader | y | y | foundation/ConfigLoader.js:3256 -> 0.0005<br>silently fabricates trading-critical data: **yes** | y |  |
| `FEE_TAKER` | foundation/ConfigLoader.js:660,3255<br>run-empire-v2.js:1753<br>tools/config-audit.js:245 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:660 -> 0<br>foundation/ConfigLoader.js:3255 -> 0<br>run-empire-v2.js:1753 -> 'default'<br>tools/config-audit.js:245 -> 0.004<br>silently fabricates trading-critical data: **yes** | y |  |
| `FEE_TOTAL_ROUNDTRIP` | foundation/ConfigLoader.js:661,3257<br>tools/config-audit.js:246 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:661 -> feeMakerConfig.value + feeTakerConfig.value<br>foundation/ConfigLoader.js:3257 -> 0<br>tools/config-audit.js:246 -> ConfigLoader.get('fees.totalRoundTrip')<br>silently fabricates trading-critical data: **yes** | y |  |
| `FIB_BOOST_GOLDEN` | foundation/ConfigLoader.js:3199 | ConfigLoader | y | y | foundation/ConfigLoader.js:3199 -> 0.15<br>silently fabricates trading-critical data: **no** | n |  |
| `FIB_BOOST_NORMAL` | foundation/ConfigLoader.js:3198 | ConfigLoader | y | y | foundation/ConfigLoader.js:3198 -> 0.10<br>silently fabricates trading-critical data: **no** | n |  |
| `FIB_DISTANCE_EMA` | foundation/ConfigLoader.js:3195 | ConfigLoader | y | y | foundation/ConfigLoader.js:3195 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `FIB_DISTANCE_MASR` | foundation/ConfigLoader.js:3196 | ConfigLoader | y | y | foundation/ConfigLoader.js:3196 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `FIB_DISTANCE_SWEEP` | foundation/ConfigLoader.js:3197 | ConfigLoader | y | y | foundation/ConfigLoader.js:3197 -> 0.8<br>silently fabricates trading-critical data: **no** | n |  |
| `FINAL_TARGET` | foundation/ConfigLoader.js:870,2485<br>tools/config-audit.js:240 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:870 -> 0.025<br>foundation/ConfigLoader.js:2485 -> 0.050<br>tools/config-audit.js:240 -> 0.050<br>silently fabricates trading-critical data: **no** | y |  |
| `FRESH_START` | foundation/ConfigLoader.js:735 | ConfigLoader | y | y | foundation/ConfigLoader.js:735 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `FUND_TARGET` | foundation/ConfigLoader.js:3703 | ConfigLoader | y | y | foundation/ConfigLoader.js:3703 -> 25000<br>silently fabricates trading-critical data: **no** | y |  |
| `GAP_BACKFILL_BUFFER_CANDLES` | foundation/ConfigLoader.js:772,2971 | ConfigLoader | y | y | foundation/ConfigLoader.js:772 -> 5<br>foundation/ConfigLoader.js:2971 -> 5<br>silently fabricates trading-critical data: **no** | n |  |
| `GAP_BACKFILL_RETRY_DELAY_MS` | foundation/ConfigLoader.js:774,2973 | ConfigLoader | y | y | foundation/ConfigLoader.js:774 -> 60000<br>foundation/ConfigLoader.js:2973 -> 60000<br>silently fabricates trading-critical data: **no** | n |  |
| `GAP_RECOVERY_CLEAN_CANDLES_REQUIRED` | foundation/ConfigLoader.js:773,2972 | ConfigLoader | y | y | foundation/ConfigLoader.js:773 -> 3<br>foundation/ConfigLoader.js:2972 -> 3<br>silently fabricates trading-critical data: **no** | n |  |
| `GAP_THRESHOLD_MULTIPLIER` | foundation/ConfigLoader.js:771,2970 | ConfigLoader | y | y | foundation/ConfigLoader.js:771 -> 1.5<br>foundation/ConfigLoader.js:2970 -> 1.5<br>silently fabricates trading-critical data: **no** | n |  |
| `GEMINI_EXCHANGE_API_KEY` | brokers/GeminiAdapter.js:22 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `GEMINI_EXCHANGE_API_SECRET` | brokers/GeminiAdapter.js:23 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `GEMINI_SANDBOX` | brokers/GeminiAdapter.js:24 | direct `process.env`/environment bypass | n | n | brokers/GeminiAdapter.js:24 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `GITHUB_TOKEN` | trai_brain/mercury-bridge/tool-adapter.js:837 | direct `process.env`/environment bypass | n | n | trai_brain/mercury-bridge/tool-adapter.js:837 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `HIGH_VOL_MULTIPLIER` | foundation/ConfigLoader.js:2330 | ConfigLoader | y | y | foundation/ConfigLoader.js:2330 -> 0.6<br>silently fabricates trading-critical data: **no** | y |  |
| `HIGH_VOL_THRESHOLD` | foundation/ConfigLoader.js:2332 | ConfigLoader | y | y | foundation/ConfigLoader.js:2332 -> 0.035<br>silently fabricates trading-critical data: **no** | y |  |
| `HOME` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `INCEPTION_API_KEY` | scripts/cpu-vps-setup.sh:33,57,61<br>scripts/mercury-analyze.js:12 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `INCEPTION_API_KEY_DEV` | trai_brain/mercury-bridge/llm-client.js:560 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `INITIAL_BALANCE` | foundation/ConfigLoader.js:729<br>tools/config-audit.js:269 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:729 -> 10000<br>tools/config-audit.js:269 -> 10000<br>silently fabricates trading-critical data: **yes** | n |  |
| `ISOLATE` | tools/trade-validator.js:44 | direct `process.env`/environment bypass | n | n | tools/trade-validator.js:44 -> process.argv.find(a => a.startsWith('--strategy='))?.split('=')[1]<br>silently fabricates trading-critical data: **no** | n |  |
| `JEST_WORKER_ID` | foundation/ConfigLoader.js:3720 | ConfigLoader | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `JOURNAL_DATA_DIR` | foundation/ConfigLoader.js:658 | ConfigLoader | y | y | foundation/ConfigLoader.js:658 -> defaultJournalDataDir(dataDirConfig.value)<br>silently fabricates trading-critical data: **no** | n |  |
| `KRAKEN_API_KEY` | core/BotStateFrame.js:119<br>foundation/ConfigLoader.js:974 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:974 -> ''<br>silently fabricates trading-critical data: **no** | y |  |
| `KRAKEN_API_SECRET` | foundation/ConfigLoader.js:975 | ConfigLoader | y | y | foundation/ConfigLoader.js:975 -> ''<br>silently fabricates trading-critical data: **no** | y |  |
| `KRAKEN_REST_TICKER_URL` | ogzprime-ssl-server.js:1160 | direct `process.env`/environment bypass | n | n | ogzprime-ssl-server.js:1160 -> 'https://api.kraken.com/0/public/Ticker'<br>silently fabricates trading-critical data: **no** | n |  |
| `LEDGER_BUFFER_SIZE` | core/DecisionLedgerLogger.js:9 | direct `process.env`/environment bypass | n | y | core/DecisionLedgerLogger.js:9 -> '1'<br>silently fabricates trading-critical data: **no** | n |  |
| `LEDGER_VALIDATE` | core/DecisionLedgerLogger.js:10 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_ACTIVE_TIMEFRAME_MULTIPLIER` | foundation/ConfigLoader.js:765,2964 | ConfigLoader | y | y | foundation/ConfigLoader.js:765 -> 1.5<br>foundation/ConfigLoader.js:2964 -> 1.5<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_ACTIVE_TIMEFRAME_SLACK_MS` | foundation/ConfigLoader.js:766,2965 | ConfigLoader | y | y | foundation/ConfigLoader.js:766 -> 60000<br>foundation/ConfigLoader.js:2965 -> 60000<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_BACKFILL_LIMIT` | foundation/ConfigLoader.js:762,2961 | ConfigLoader | y | y | foundation/ConfigLoader.js:762 -> 10<br>foundation/ConfigLoader.js:2961 -> 10<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_CHECK_INTERVAL_MS` | foundation/ConfigLoader.js:763,2962 | ConfigLoader | y | y | foundation/ConfigLoader.js:763 -> 60000<br>foundation/ConfigLoader.js:2962 -> 60000<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_EXPECTED_QUIET_LOG_INTERVAL_MS` | foundation/ConfigLoader.js:775,2974 | ConfigLoader | y | y | foundation/ConfigLoader.js:775 -> 300000<br>foundation/ConfigLoader.js:2974 -> 300000<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_MAX_BACKFILL_AGE_MULTIPLIER` | foundation/ConfigLoader.js:767,2966 | ConfigLoader | y | y | foundation/ConfigLoader.js:767 -> 2<br>foundation/ConfigLoader.js:2966 -> 2<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_MAX_BACKFILL_AGE_SLACK_MS` | foundation/ConfigLoader.js:768,2967 | ConfigLoader | y | y | foundation/ConfigLoader.js:768 -> 60000<br>foundation/ConfigLoader.js:2967 -> 60000<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVENESS_MAX_DATA_SILENCE_MS` | foundation/ConfigLoader.js:764,2963 | ConfigLoader | y | y | foundation/ConfigLoader.js:764 -> 120000<br>foundation/ConfigLoader.js:2963 -> 120000<br>silently fabricates trading-critical data: **no** | n |  |
| `LIVE_TRADING` | core/BotStateFrame.js:142<br>scripts/generate-live-proof.js:242,299<br>tools/config-audit.js:217 | direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:142 -> false<br>tools/config-audit.js:217 -> 'false'<br>silently fabricates trading-critical data: **no** | y |  |
| `LLM_PROVIDER` | scripts/cpu-vps-setup.sh:46 | direct `process.env`/environment bypass | n | n | scripts/cpu-vps-setup.sh:46 -> 'mercury' (script writes it to .env)<br>silently fabricates trading-critical data: **no** | n |  |
| `LOCALAPPDATA` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `LOW_VOL_MULTIPLIER` | foundation/ConfigLoader.js:2329 | ConfigLoader | y | y | foundation/ConfigLoader.js:2329 -> 1.5<br>silently fabricates trading-critical data: **no** | y |  |
| `LOW_VOL_THRESHOLD` | foundation/ConfigLoader.js:2331 | ConfigLoader | y | y | foundation/ConfigLoader.js:2331 -> 0.015<br>silently fabricates trading-critical data: **no** | y |  |
| `MASR_MTF_1H_TREND_CONFLICT_MULT` | foundation/ConfigLoader.js:3209 | ConfigLoader | y | y | foundation/ConfigLoader.js:3209 -> 0.95<br>silently fabricates trading-critical data: **no** | n |  |
| `MASR_MTF_4H_ALIGN_BOOST` | foundation/ConfigLoader.js:3210 | ConfigLoader | y | y | foundation/ConfigLoader.js:3210 -> 0.08<br>silently fabricates trading-critical data: **no** | n |  |
| `MASR_MTF_4H_COMPRESSION_BANDWIDTH` | foundation/ConfigLoader.js:3211 | ConfigLoader | y | y | foundation/ConfigLoader.js:3211 -> 0.01<br>silently fabricates trading-critical data: **no** | n |  |
| `MASR_MTF_REQUIRE_HOURLY_TREND_ALIGN` | foundation/ConfigLoader.js:3208 | ConfigLoader | y | y | foundation/ConfigLoader.js:3208 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `MAX_CONFIDENCE` | foundation/ConfigLoader.js:782,2265<br>tools/config-audit.js:223 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:782 -> requiredConfiguredNumber('confidence.maxConfidence')<br>foundation/ConfigLoader.js:2265 -> requiredConfigNumber('confidence.maxConfidence')<br>tools/config-audit.js:223 -> 0.95<br>silently fabricates trading-critical data: **no** | y |  |
| `MAX_DRAWDOWN` | scripts/generate-live-proof.js:240 | direct `process.env`/environment bypass | n | n | scripts/generate-live-proof.js:240 -> '18'<br>silently fabricates trading-critical data: **yes** | y |  |
| `MAX_HOLD_MINUTES` | foundation/ConfigLoader.js:861 | ConfigLoader | y | y | foundation/ConfigLoader.js:861 -> 240<br>silently fabricates trading-critical data: **no** | n |  |
| `MAX_POSITIONS` | foundation/ConfigLoader.js:789,2326<br>tools/config-audit.js:228 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:789 -> 3<br>foundation/ConfigLoader.js:2326 -> 3<br>tools/config-audit.js:228 -> 3<br>silently fabricates trading-critical data: **no** | n |  |
| `MAX_POSITION_PCT` | foundation/ConfigLoader.js:2919 | ConfigLoader | y | y | foundation/ConfigLoader.js:2919 -> 0.05<br>silently fabricates trading-critical data: **no** | n |  |
| `MAX_POSITION_SIZE_PCT` | foundation/ConfigLoader.js:788,2325<br>tools/config-audit.js:227 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:788 -> 0.05<br>foundation/ConfigLoader.js:2325 -> 0.05<br>tools/config-audit.js:227 -> 0.05<br>silently fabricates trading-critical data: **no** | y |  |
| `MAX_RISK_PER_TRADE` | foundation/ConfigLoader.js:2276<br>scripts/generate-live-proof.js:239 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:2276 -> 0.02<br>scripts/generate-live-proof.js:239 -> '0.02'<br>silently fabricates trading-critical data: **no** | y |  |
| `MERCURY_ADVERSARIAL_REVIEW` | trai_brain/mercury-bridge/config.js:332 | direct `process.env`/environment bypass | y | n | trai_brain/mercury-bridge/config.js:332 -> null<br>silently fabricates trading-critical data: **no** | n |  |
| `MERCURY_CONFIG_FILE` | trai_brain/mercury-bridge/config.js:15,16 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `MERCURY_RUN_LEDGER_DIR` | trai_brain/mercury-bridge/run-ledger.js:9 | direct `process.env`/environment bypass | n | n | trai_brain/mercury-bridge/run-ledger.js:9 -> DEFAULT_RUN_LEDGER_DIR<br>silently fabricates trading-critical data: **no** | n |  |
| `MERCURY_WEBFETCH_ALLOWLIST` | trai_brain/mercury-bridge/tool-adapter.js:807 | direct `process.env`/environment bypass | n | n | trai_brain/mercury-bridge/tool-adapter.js:807 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `MERCURY_WEBFETCH_MAX_BYTES` | trai_brain/mercury-bridge/tool-adapter.js:834 | direct `process.env`/environment bypass | n | n | trai_brain/mercury-bridge/tool-adapter.js:834 -> '204800'<br>silently fabricates trading-critical data: **no** | n |  |
| `MIN_CANDLES_EMA` | foundation/ConfigLoader.js:3188 | ConfigLoader | y | y | foundation/ConfigLoader.js:3188 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `MIN_CANDLES_MASR` | foundation/ConfigLoader.js:3189 | ConfigLoader | y | y | foundation/ConfigLoader.js:3189 -> 50<br>silently fabricates trading-critical data: **no** | n |  |
| `MIN_CANDLES_MTF` | foundation/ConfigLoader.js:3191 | ConfigLoader | y | y | foundation/ConfigLoader.js:3191 -> 30<br>silently fabricates trading-critical data: **no** | n |  |
| `MIN_CANDLES_SWEEP` | foundation/ConfigLoader.js:3190 | ConfigLoader | y | y | foundation/ConfigLoader.js:3190 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `MIN_CANDLES_TPO` | foundation/ConfigLoader.js:3192 | ConfigLoader | y | y | foundation/ConfigLoader.js:3192 -> 30<br>silently fabricates trading-critical data: **no** | n |  |
| `MIN_HOLD_TIME_MINUTES` | foundation/ConfigLoader.js:3238 | ConfigLoader | y | y | foundation/ConfigLoader.js:3238 -> 0.0<br>silently fabricates trading-critical data: **no** | y |  |
| `MIN_STRATEGY_CONFIDENCE` | foundation/ConfigLoader.js:781,2266<br>tools/config-audit.js:222 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:781 -> requiredConfiguredNumber('confidence.minStrategyConfidence')<br>foundation/ConfigLoader.js:2266 -> requiredConfigNumber('confidence.minStrategyConfidence')<br>tools/config-audit.js:222 -> 0.35<br>silently fabricates trading-critical data: **no** | n |  |
| `MIN_TRADE_CONFIDENCE` | tools/config-audit.js:221 | direct `process.env`/environment bypass | y | n | tools/config-audit.js:221 -> 0.01<br>silently fabricates trading-critical data: **no** | y |  |
| `MOONSHOT_API_KEY` | trai_brain/mercury-bridge/llm-client.js:608 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `MPM_HIGH_VOLATILITY_THRESHOLD` | foundation/ConfigLoader.js:2880 | ConfigLoader | y | y | foundation/ConfigLoader.js:2880 -> 2.0<br>silently fabricates trading-critical data: **no** | n |  |
| `MPM_LOG_LEVEL` | foundation/ConfigLoader.js:2856 | ConfigLoader | y | y | foundation/ConfigLoader.js:2856 -> 'info'<br>silently fabricates trading-critical data: **no** | n |  |
| `MPM_LOW_VOLATILITY_THRESHOLD` | foundation/ConfigLoader.js:2879 | ConfigLoader | y | y | foundation/ConfigLoader.js:2879 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `MPM_TIME_BASED_ADJUSTMENTS_ENABLED` | foundation/ConfigLoader.js:3237 | ConfigLoader | y | y | foundation/ConfigLoader.js:3237 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `MPM_TRACK_PERFORMANCE` | foundation/ConfigLoader.js:2855 | ConfigLoader | y | y | foundation/ConfigLoader.js:2855 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `MPM_VOLATILITY_ADJUSTMENT_ENABLED` | foundation/ConfigLoader.js:2878 | ConfigLoader | y | y | foundation/ConfigLoader.js:2878 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `MPM_VOLATILITY_LOOKBACK_PERIODS` | foundation/ConfigLoader.js:2881 | ConfigLoader | y | y | foundation/ConfigLoader.js:2881 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `MTF_TIMEFRAMES` | foundation/ConfigLoader.js:846 | ConfigLoader | y | y | foundation/ConfigLoader.js:846 -> configuredValue('orchestrator.mtfTimeframes', ['1m', '5m', '15m', '1h', '4h'])<br>silently fabricates trading-critical data: **no** | n |  |
| `NARRATOR_LABEL_SEED` | core/TradeNarrator.js:307 | direct `process.env`/environment bypass | n | y | core/TradeNarrator.js:307 -> crypto.randomBytes(8).toString('hex')<br>silently fabricates trading-critical data: **no** | n |  |
| `NEWS_SEARCH_PROVIDER` | core/NewsSearchProvider.js:79 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `NODE_ENV` | server/dashboard-session-auth.js:101,113 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `NODE_OPTIONS` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `NODE_PATH` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `NTFY_TOPIC` | core/NtfyTraceNotifier.js:195 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `OGZTPO_MTF_1H_MACD_BOOST_MULT` | foundation/ConfigLoader.js:3222 | ConfigLoader | y | y | foundation/ConfigLoader.js:3222 -> 1.08<br>silently fabricates trading-critical data: **no** | n |  |
| `OGZTPO_MTF_4H_BANDWIDTH_THRESHOLD` | foundation/ConfigLoader.js:3223 | ConfigLoader | y | y | foundation/ConfigLoader.js:3223 -> 0.015<br>silently fabricates trading-critical data: **no** | n |  |
| `OGZTPO_MTF_4H_TREND_BOOST_MULT` | foundation/ConfigLoader.js:3221 | ConfigLoader | y | y | foundation/ConfigLoader.js:3221 -> 1.12<br>silently fabricates trading-critical data: **no** | n |  |
| `OGZ_CRYPTO_BASES` | core/DataFileInstrument.js:14 | direct `process.env`/environment bypass | n | y | core/DataFileInstrument.js:14 -> 'btc,eth,sol,doge,xrp,ada,ltc,bch,link,avax,matic,dot,shib'<br>silently fabricates trading-critical data: **no** | n |  |
| `OPENAI_API_KEY` | trai_brain/mercury-bridge/config.js:192 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `PAPER_TRADING` | core/BotStateFrame.js:143<br>tools/config-audit.js:216 | direct `process.env`/environment bypass | y | y | core/BotStateFrame.js:143 -> false<br>tools/config-audit.js:216 -> 'false'<br>silently fabricates trading-critical data: **no** | n |  |
| `PATH` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `PATHEXT` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_ENABLED` | foundation/ConfigLoader.js:2437 | ConfigLoader | y | y | foundation/ConfigLoader.js:2437 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_POSITION_KD` | foundation/ConfigLoader.js:2445 | ConfigLoader | y | y | foundation/ConfigLoader.js:2445 -> 0.10<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_POSITION_KI` | foundation/ConfigLoader.js:2444 | ConfigLoader | y | y | foundation/ConfigLoader.js:2444 -> 0.05<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_POSITION_KP` | foundation/ConfigLoader.js:2443 | ConfigLoader | y | y | foundation/ConfigLoader.js:2443 -> 0.30<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_REGIME_KD` | foundation/ConfigLoader.js:2451 | ConfigLoader | y | y | foundation/ConfigLoader.js:2451 -> 0.01<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_REGIME_KI` | foundation/ConfigLoader.js:2450 | ConfigLoader | y | y | foundation/ConfigLoader.js:2450 -> 0.005<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_REGIME_KP` | foundation/ConfigLoader.js:2449 | ConfigLoader | y | y | foundation/ConfigLoader.js:2449 -> 0.02<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_TARGET_MFE` | foundation/ConfigLoader.js:2457 | ConfigLoader | y | y | foundation/ConfigLoader.js:2457 -> 0.60<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_TARGET_SLOPE` | foundation/ConfigLoader.js:2446 | ConfigLoader | y | y | foundation/ConfigLoader.js:2446 -> 0.005<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_TRAIL_KD` | foundation/ConfigLoader.js:2456 | ConfigLoader | y | y | foundation/ConfigLoader.js:2456 -> 0.05<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_TRAIL_KI` | foundation/ConfigLoader.js:2455 | ConfigLoader | y | y | foundation/ConfigLoader.js:2455 -> 0.03<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_TRAIL_KP` | foundation/ConfigLoader.js:2454 | ConfigLoader | y | y | foundation/ConfigLoader.js:2454 -> 0.15<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_UPDATE_INTERVAL` | foundation/ConfigLoader.js:2438 | ConfigLoader | y | y | foundation/ConfigLoader.js:2438 -> 10<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_WARMUP_TRADES` | foundation/ConfigLoader.js:2439 | ConfigLoader | y | y | foundation/ConfigLoader.js:2439 -> 50<br>silently fabricates trading-critical data: **no** | n |  |
| `PID_WINDOW_SIZE` | foundation/ConfigLoader.js:2440 | ConfigLoader | y | y | foundation/ConfigLoader.js:2440 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `POLYGON_API_KEY` | ogzprime-ssl-server.js:296<br>scripts/download-tsla-polygon.js:11<br>scripts/download-tsla-walkback.js:13<br>scripts/download-tsla-walkforward.js:14 | direct `process.env`/environment bypass | n | n | ogzprime-ssl-server.js:296 -> ''<br>silently fabricates trading-critical data: **no** | y |  |
| `POSITION_MODE` | foundation/ConfigLoader.js:3697 | ConfigLoader | y | y | foundation/ConfigLoader.js:3697 -> 'single'<br>silently fabricates trading-critical data: **no** | n |  |
| `POST_BREAKEVEN_TRAIL` | foundation/ConfigLoader.js:2476 | ConfigLoader | y | y | foundation/ConfigLoader.js:2476 -> 5.0<br>silently fabricates trading-critical data: **no** | y |  |
| `PROFILE` | foundation/ConfigLoader.js:549<br>tools/config-audit.js:213 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:549 -> ''<br>tools/config-audit.js:213 -> 'missing'<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_ENABLED` | foundation/ConfigLoader.js:2887 | ConfigLoader | y | y | foundation/ConfigLoader.js:2887 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T1_AT` | foundation/ConfigLoader.js:2889 | ConfigLoader | y | y | foundation/ConfigLoader.js:2889 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T1_LOCK` | foundation/ConfigLoader.js:2889 | ConfigLoader | y | y | foundation/ConfigLoader.js:2889 -> 0.30<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T2_AT` | foundation/ConfigLoader.js:2890 | ConfigLoader | y | y | foundation/ConfigLoader.js:2890 -> 1.0<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T2_LOCK` | foundation/ConfigLoader.js:2890 | ConfigLoader | y | y | foundation/ConfigLoader.js:2890 -> 0.50<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T3_AT` | foundation/ConfigLoader.js:2891 | ConfigLoader | y | y | foundation/ConfigLoader.js:2891 -> 1.5<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T3_LOCK` | foundation/ConfigLoader.js:2891 | ConfigLoader | y | y | foundation/ConfigLoader.js:2891 -> 0.70<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T4_AT` | foundation/ConfigLoader.js:2892 | ConfigLoader | y | y | foundation/ConfigLoader.js:2892 -> 2.0<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_FLOOR_T4_LOCK` | foundation/ConfigLoader.js:2892 | ConfigLoader | y | y | foundation/ConfigLoader.js:2892 -> 0.85<br>silently fabricates trading-critical data: **no** | n |  |
| `PROFIT_PROTECTION` | foundation/ConfigLoader.js:2477 | ConfigLoader | y | y | foundation/ConfigLoader.js:2477 -> 1.5<br>silently fabricates trading-critical data: **no** | y |  |
| `PROPSAFE_EMA_ALLOW_SHORTS` | foundation/ConfigLoader.js:3109 | ConfigLoader | y | y | foundation/ConfigLoader.js:3109 -> requiredConfiguredBool('strategies.PropSafeEMAPullback.allowShorts')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_ATR_PERIOD` | foundation/ConfigLoader.js:3089 | ConfigLoader | y | y | foundation/ConfigLoader.js:3089 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.atrPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_ATR_STOP_MULT` | foundation/ConfigLoader.js:3094 | ConfigLoader | y | y | foundation/ConfigLoader.js:3094 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.atrStopMult')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_CONFIDENCE_BASE` | foundation/ConfigLoader.js:3099 | ConfigLoader | y | y | foundation/ConfigLoader.js:3099 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceBase')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_CONFIDENCE_CONFIRMATION_BONUS` | foundation/ConfigLoader.js:3102 | ConfigLoader | y | y | foundation/ConfigLoader.js:3102 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceConfirmationBonus')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_CONFIDENCE_FRESH_CROSS_BONUS` | foundation/ConfigLoader.js:3103 | ConfigLoader | y | y | foundation/ConfigLoader.js:3103 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceFreshCrossBonus')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_CONFIDENCE_PULLBACK_BONUS` | foundation/ConfigLoader.js:3101 | ConfigLoader | y | y | foundation/ConfigLoader.js:3101 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidencePullbackBonus')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_CONFIDENCE_TREND_BONUS` | foundation/ConfigLoader.js:3100 | ConfigLoader | y | y | foundation/ConfigLoader.js:3100 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.confidenceTrendBonus')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_CROSS_LOOKBACK` | foundation/ConfigLoader.js:3090 | ConfigLoader | y | y | foundation/ConfigLoader.js:3090 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.crossLookbackBars')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_FAST_PERIOD` | foundation/ConfigLoader.js:3086 | ConfigLoader | y | y | foundation/ConfigLoader.js:3086 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.fastEmaPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_MAX_CONFIDENCE` | foundation/ConfigLoader.js:3104 | ConfigLoader | y | y | foundation/ConfigLoader.js:3104 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.maxConfidence')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_MAX_HOLD_MINUTES` | foundation/ConfigLoader.js:3098 | ConfigLoader | y | y | foundation/ConfigLoader.js:3098 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.maxHoldTimeMinutes')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_PULLBACK_LOOKBACK` | foundation/ConfigLoader.js:3091 | ConfigLoader | y | y | foundation/ConfigLoader.js:3091 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackLookbackBars')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_PULLBACK_MAX_ATR` | foundation/ConfigLoader.js:3093 | ConfigLoader | y | y | foundation/ConfigLoader.js:3093 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackMaxAtr')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_PULLBACK_MIN_ATR` | foundation/ConfigLoader.js:3092 | ConfigLoader | y | y | foundation/ConfigLoader.js:3092 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackMinAtr')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_PULLBACK_PERIOD` | foundation/ConfigLoader.js:3087 | ConfigLoader | y | y | foundation/ConfigLoader.js:3087 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.pullbackEmaPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_REQUIRE_RTH` | foundation/ConfigLoader.js:3105 | ConfigLoader | y | y | foundation/ConfigLoader.js:3105 -> requiredConfiguredBool('strategies.PropSafeEMAPullback.requireRth')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_RTH_END_ET` | foundation/ConfigLoader.js:3107 | ConfigLoader | y | y | foundation/ConfigLoader.js:3107 -> configuredValue('strategies.PropSafeEMAPullback.rthEndET')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_RTH_START_ET` | foundation/ConfigLoader.js:3106 | ConfigLoader | y | y | foundation/ConfigLoader.js:3106 -> configuredValue('strategies.PropSafeEMAPullback.rthStartET')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_SESSION_TIMEZONE` | foundation/ConfigLoader.js:3108 | ConfigLoader | y | y | foundation/ConfigLoader.js:3108 -> configuredValue('strategies.PropSafeEMAPullback.sessionTimeZone')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_TARGET_RR` | foundation/ConfigLoader.js:3095 | ConfigLoader | y | y | foundation/ConfigLoader.js:3095 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.targetRR')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_TRAIL_ACTIVATION_R` | foundation/ConfigLoader.js:3096 | ConfigLoader | y | y | foundation/ConfigLoader.js:3096 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.trailActivationR')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_TRAIL_DISTANCE_R` | foundation/ConfigLoader.js:3097 | ConfigLoader | y | y | foundation/ConfigLoader.js:3097 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.trailDistanceR')<br>silently fabricates trading-critical data: **no** | n |  |
| `PROPSAFE_EMA_TREND_PERIOD` | foundation/ConfigLoader.js:3088 | ConfigLoader | y | y | foundation/ConfigLoader.js:3088 -> requiredConfiguredNumber('strategies.PropSafeEMAPullback.trendEmaPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_DEAD_EMA` | foundation/ConfigLoader.js:2383 | ConfigLoader | y | y | foundation/ConfigLoader.js:2383 -> 0.60<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_DEAD_MASR` | foundation/ConfigLoader.js:2384 | ConfigLoader | y | y | foundation/ConfigLoader.js:2384 -> 0.70<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_DEAD_POS_MULT` | foundation/ConfigLoader.js:2388 | ConfigLoader | y | y | foundation/ConfigLoader.js:2388 -> 0.50<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_DEAD_RSI` | foundation/ConfigLoader.js:2385 | ConfigLoader | y | y | foundation/ConfigLoader.js:2385 -> 0.70<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_DEAD_SMS` | foundation/ConfigLoader.js:2387 | ConfigLoader | y | y | foundation/ConfigLoader.js:2387 -> 0.50<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_DEAD_SWEEP` | foundation/ConfigLoader.js:2386 | ConfigLoader | y | y | foundation/ConfigLoader.js:2386 -> 0.50<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_MIN_CONFIDENCE` | foundation/ConfigLoader.js:2268 | ConfigLoader | y | y | foundation/ConfigLoader.js:2268 -> requiredConfigNumber('confidence.regimeMinConfidence')<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_RANGE_EMA` | foundation/ConfigLoader.js:2368 | ConfigLoader | y | y | foundation/ConfigLoader.js:2368 -> 0.85<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_RANGE_MASR` | foundation/ConfigLoader.js:2369 | ConfigLoader | y | y | foundation/ConfigLoader.js:2369 -> 0.85<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_RANGE_RSI` | foundation/ConfigLoader.js:2370 | ConfigLoader | y | y | foundation/ConfigLoader.js:2370 -> 1.15<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_RANGE_SMS` | foundation/ConfigLoader.js:2372 | ConfigLoader | y | y | foundation/ConfigLoader.js:2372 -> 1.10<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_RANGE_SWEEP` | foundation/ConfigLoader.js:2371 | ConfigLoader | y | y | foundation/ConfigLoader.js:2371 -> 1.00<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_TREND_EMA` | foundation/ConfigLoader.js:2361 | ConfigLoader | y | y | foundation/ConfigLoader.js:2361 -> 1.15<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_TREND_MASR` | foundation/ConfigLoader.js:2362 | ConfigLoader | y | y | foundation/ConfigLoader.js:2362 -> 1.15<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_TREND_RSI` | foundation/ConfigLoader.js:2363 | ConfigLoader | y | y | foundation/ConfigLoader.js:2363 -> 0.85<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_TREND_SMS` | foundation/ConfigLoader.js:2365 | ConfigLoader | y | y | foundation/ConfigLoader.js:2365 -> 1.00<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_TREND_SWEEP` | foundation/ConfigLoader.js:2364 | ConfigLoader | y | y | foundation/ConfigLoader.js:2364 -> 1.00<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_VOL_EMA` | foundation/ConfigLoader.js:2375 | ConfigLoader | y | y | foundation/ConfigLoader.js:2375 -> 0.70<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_VOL_MASR` | foundation/ConfigLoader.js:2376 | ConfigLoader | y | y | foundation/ConfigLoader.js:2376 -> 0.70<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_VOL_POS_MULT` | foundation/ConfigLoader.js:2380 | ConfigLoader | y | y | foundation/ConfigLoader.js:2380 -> 0.60<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_VOL_RSI` | foundation/ConfigLoader.js:2377 | ConfigLoader | y | y | foundation/ConfigLoader.js:2377 -> 1.10<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_VOL_SMS` | foundation/ConfigLoader.js:2379 | ConfigLoader | y | y | foundation/ConfigLoader.js:2379 -> 1.15<br>silently fabricates trading-critical data: **no** | n |  |
| `REGIME_VOL_SWEEP` | foundation/ConfigLoader.js:2378 | ConfigLoader | y | y | foundation/ConfigLoader.js:2378 -> 1.20<br>silently fabricates trading-critical data: **no** | n |  |
| `REVERSAL_DETECT_ENABLED` | foundation/ConfigLoader.js:2898 | ConfigLoader | y | y | foundation/ConfigLoader.js:2898 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `REVERSAL_EXIT_FRACTION` | foundation/ConfigLoader.js:2905 | ConfigLoader | y | y | foundation/ConfigLoader.js:2905 -> 1.0<br>silently fabricates trading-critical data: **no** | n |  |
| `REVERSAL_MIN_PROFIT` | foundation/ConfigLoader.js:2899 | ConfigLoader | y | y | foundation/ConfigLoader.js:2899 -> 0.3<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_ALLOW_SHORTS` | foundation/ConfigLoader.js:3146 | ConfigLoader | y | y | foundation/ConfigLoader.js:3146 -> requiredConfiguredBool('strategies.RSI2MeanReversion.allowShorts')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_CONFIDENCE_BASE` | foundation/ConfigLoader.js:3152 | ConfigLoader | y | y | foundation/ConfigLoader.js:3152 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.confidenceBase')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_CONFIDENCE_DEPTH_MULT` | foundation/ConfigLoader.js:3153 | ConfigLoader | y | y | foundation/ConfigLoader.js:3153 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.confidenceDepthMultiplier')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_ENTRY` | foundation/ConfigLoader.js:3142 | ConfigLoader | y | y | foundation/ConfigLoader.js:3142 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiEntry')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_ENTRY_OB` | foundation/ConfigLoader.js:3144 | ConfigLoader | y | y | foundation/ConfigLoader.js:3144 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiEntryOB')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_EXIT_LONG` | foundation/ConfigLoader.js:3143 | ConfigLoader | y | y | foundation/ConfigLoader.js:3143 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiExitLong')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_MAX_CONFIDENCE` | foundation/ConfigLoader.js:3154 | ConfigLoader | y | y | foundation/ConfigLoader.js:3154 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.maxConfidence')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_MAX_HOLD_MINUTES` | foundation/ConfigLoader.js:3151 | ConfigLoader | y | y | foundation/ConfigLoader.js:3151 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.maxHoldTimeMinutes')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_RSI_PERIOD` | foundation/ConfigLoader.js:3141 | ConfigLoader | y | y | foundation/ConfigLoader.js:3141 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.rsiPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_STOP_LOSS_PERCENT` | foundation/ConfigLoader.js:3147 | ConfigLoader | y | y | foundation/ConfigLoader.js:3147 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.stopLossPercent')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_TAKE_PROFIT_PERCENT` | foundation/ConfigLoader.js:3148 | ConfigLoader | y | y | foundation/ConfigLoader.js:3148 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.takeProfitPercent')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_TRAILING_ACTIVATION` | foundation/ConfigLoader.js:3150 | ConfigLoader | y | y | foundation/ConfigLoader.js:3150 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.trailingActivation')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_TRAILING_STOP_PERCENT` | foundation/ConfigLoader.js:3149 | ConfigLoader | y | y | foundation/ConfigLoader.js:3149 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.trailingStopPercent')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI2_MR_TREND_PERIOD` | foundation/ConfigLoader.js:3145 | ConfigLoader | y | y | foundation/ConfigLoader.js:3145 -> requiredConfiguredNumber('strategies.RSI2MeanReversion.trendPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI_MTF_1H_RSI_ALIGN_BOOST` | foundation/ConfigLoader.js:3216 | ConfigLoader | y | y | foundation/ConfigLoader.js:3216 -> 0.10<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI_MTF_1H_RSI_BUY_MAX` | foundation/ConfigLoader.js:3217 | ConfigLoader | y | y | foundation/ConfigLoader.js:3217 -> 40<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI_MTF_1H_RSI_SELL_MIN` | foundation/ConfigLoader.js:3218 | ConfigLoader | y | y | foundation/ConfigLoader.js:3218 -> 60<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI_MTF_4H_TREND_CONFLICT_MULT` | foundation/ConfigLoader.js:3215 | ConfigLoader | y | y | foundation/ConfigLoader.js:3215 -> 0.95<br>silently fabricates trading-critical data: **no** | n |  |
| `RSI_MTF_PENALIZE_AGAINST_4H_TREND` | foundation/ConfigLoader.js:3214 | ConfigLoader | y | y | foundation/ConfigLoader.js:3214 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `SCALPER_MAX_HOLD_TIME` | foundation/ConfigLoader.js:3355 | ConfigLoader | y | y | foundation/ConfigLoader.js:3355 -> 300000<br>silently fabricates trading-critical data: **no** | y |  |
| `SCALPER_MICRO_PROFIT` | foundation/ConfigLoader.js:3351 | ConfigLoader | y | y | foundation/ConfigLoader.js:3351 -> 0.005<br>silently fabricates trading-critical data: **no** | y |  |
| `SCALPER_MOMENTUM_SHIFT` | foundation/ConfigLoader.js:3353 | ConfigLoader | y | y | foundation/ConfigLoader.js:3353 -> 0.15<br>silently fabricates trading-critical data: **no** | y |  |
| `SCALPER_QUICK_PROFIT` | foundation/ConfigLoader.js:3352 | ConfigLoader | y | y | foundation/ConfigLoader.js:3352 -> 0.008<br>silently fabricates trading-critical data: **no** | y |  |
| `SCALPER_STOP_MULTIPLIER` | foundation/ConfigLoader.js:3354 | ConfigLoader | y | y | foundation/ConfigLoader.js:3354 -> 0.5<br>silently fabricates trading-critical data: **no** | y |  |
| `SCHWAB_ACCOUNT_NUMBER` | brokers/SchwabAdapter.js:28 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `SCHWAB_CLIENT_ID` | brokers/SchwabAdapter.js:25 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `SCHWAB_CLIENT_SECRET` | brokers/SchwabAdapter.js:26 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `SCHWAB_REFRESH_TOKEN` | brokers/SchwabAdapter.js:27 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `SENTRY_DSN` | foundation/ConfigLoader.js:748 | ConfigLoader | y | y | foundation/ConfigLoader.js:748 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `SENTRY_ENABLED` | foundation/ConfigLoader.js:749 | ConfigLoader | y | y | foundation/ConfigLoader.js:749 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `SIGNALSTACK_WEBHOOK_URL` | foundation/ConfigLoader.js:992 | ConfigLoader | y | y | foundation/ConfigLoader.js:992 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_ABSORB_BODY` | foundation/ConfigLoader.js:3038 | ConfigLoader | y | y | foundation/ConfigLoader.js:3038 -> 35<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_ABSORB_BODY_PROG` | foundation/ConfigLoader.js:3042 | ConfigLoader | y | y | foundation/ConfigLoader.js:3042 -> 50<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_ABSORB_VOL_MULT` | foundation/ConfigLoader.js:3040 | ConfigLoader | y | y | foundation/ConfigLoader.js:3040 -> 1.2<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_ABSORB_VOL_PROG_MULT` | foundation/ConfigLoader.js:3044 | ConfigLoader | y | y | foundation/ConfigLoader.js:3044 -> 0.9<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_ABSORB_WICK` | foundation/ConfigLoader.js:3039 | ConfigLoader | y | y | foundation/ConfigLoader.js:3039 -> 60<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_ABSORB_WICK_PROG` | foundation/ConfigLoader.js:3043 | ConfigLoader | y | y | foundation/ConfigLoader.js:3043 -> 40<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_ATR_LEN` | foundation/ConfigLoader.js:3047 | ConfigLoader | y | y | foundation/ConfigLoader.js:3047 -> 14<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_BODY_WEIGHT` | foundation/ConfigLoader.js:3034 | ConfigLoader | y | y | foundation/ConfigLoader.js:3034 -> 70<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_CVD_DIV_LEN` | foundation/ConfigLoader.js:3046 | ConfigLoader | y | y | foundation/ConfigLoader.js:3046 -> 10<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_DEBUG` | modules/SmartMoneySweep.js:112 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_HIGH_CONV_ATR` | foundation/ConfigLoader.js:3050 | ConfigLoader | y | y | foundation/ConfigLoader.js:3050 -> 1.5<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_INIT_BODY` | foundation/ConfigLoader.js:3041 | ConfigLoader | y | y | foundation/ConfigLoader.js:3041 -> 60<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_INIT_BODY_PROG` | foundation/ConfigLoader.js:3045 | ConfigLoader | y | y | foundation/ConfigLoader.js:3045 -> 45<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_IVB_MINUTES` | foundation/ConfigLoader.js:3036 | ConfigLoader | y | y | foundation/ConfigLoader.js:3036 -> 30<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_LOW_CONV_ATR` | foundation/ConfigLoader.js:3048 | ConfigLoader | y | y | foundation/ConfigLoader.js:3048 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_LVN_PCTILE` | foundation/ConfigLoader.js:3035 | ConfigLoader | y | y | foundation/ConfigLoader.js:3035 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_MAX_DAILY_LOSSES` | foundation/ConfigLoader.js:3054 | ConfigLoader | y | y | foundation/ConfigLoader.js:3054 -> 3<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_MAX_HOLD` | foundation/ConfigLoader.js:3053 | ConfigLoader | y | y | foundation/ConfigLoader.js:3053 -> 60<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_MAX_LOSS` | foundation/ConfigLoader.js:3052 | ConfigLoader | y | y | foundation/ConfigLoader.js:3052 -> 0.3<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_MID_CONV_ATR` | foundation/ConfigLoader.js:3049 | ConfigLoader | y | y | foundation/ConfigLoader.js:3049 -> 1.0<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_SL_BUFFER` | foundation/ConfigLoader.js:3051 | ConfigLoader | y | y | foundation/ConfigLoader.js:3051 -> 0.15<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_SWEEP_MAX_OFFSET` | foundation/ConfigLoader.js:3057 | ConfigLoader | y | y | foundation/ConfigLoader.js:3057 -> 3<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_VA_PCT` | foundation/ConfigLoader.js:3033 | ConfigLoader | y | y | foundation/ConfigLoader.js:3033 -> 70<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_VOL_AVG_LEN` | foundation/ConfigLoader.js:3037 | ConfigLoader | y | y | foundation/ConfigLoader.js:3037 -> 20<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_VP_BINS` | foundation/ConfigLoader.js:3032 | ConfigLoader | y | y | foundation/ConfigLoader.js:3032 -> 50<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_VP_DAYS` | foundation/ConfigLoader.js:3031 | ConfigLoader | y | y | foundation/ConfigLoader.js:3031 -> 5<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_VP_LOOKBACK_BARS` | foundation/ConfigLoader.js:3056 | ConfigLoader | y | y | foundation/ConfigLoader.js:3056 -> 0<br>silently fabricates trading-critical data: **no** | n |  |
| `SMS_VP_RTH_ONLY` | foundation/ConfigLoader.js:3055<br>run-empire-v2.js:1759 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:3055 -> true<br>run-empire-v2.js:1759 -> 'true'<br>silently fabricates trading-critical data: **no** | n |  |
| `SOLO_STRATEGY` | foundation/ConfigLoader.js:1011 | ConfigLoader | y | y | foundation/ConfigLoader.js:1011 -> config:'strategies.soloFilter'<br>silently fabricates trading-critical data: **no** | n |  |
| `STALE_DATA_MAX_AGE_MS` | foundation/ConfigLoader.js:769,2968 | ConfigLoader | y | y | foundation/ConfigLoader.js:769 -> 120000<br>foundation/ConfigLoader.js:2968 -> 120000<br>silently fabricates trading-critical data: **no** | n |  |
| `STALE_DATA_RECOVERY_AGE_MS` | foundation/ConfigLoader.js:770,2969 | ConfigLoader | y | y | foundation/ConfigLoader.js:770 -> 30000<br>foundation/ConfigLoader.js:2969 -> 30000<br>silently fabricates trading-critical data: **no** | n |  |
| `STARTING_BALANCE` | foundation/ConfigLoader.js:3704 | ConfigLoader | y | y | foundation/ConfigLoader.js:3704 -> 10000<br>silently fabricates trading-critical data: **yes** | y |  |
| `STATE_FILE` | foundation/ConfigLoader.js:741 | ConfigLoader | y | y | foundation/ConfigLoader.js:741 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `STOCK_TICKER_MAX_AGE_MS` | server/dashboard-stock-stream-config.js:121,128 | direct `process.env`/environment bypass | y | y | server/dashboard-stock-stream-config.js:121 -> none (missing -> null/empty)<br>server/dashboard-stock-stream-config.js:128 -> none (missing -> null/empty)<br>silently fabricates trading-critical data: **no** | n |  |
| `STOP_LOSS_PERCENT` | foundation/ConfigLoader.js:857,2467<br>scripts/generate-live-proof.js:241<br>tools/config-audit.js:231 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:857 -> requiredConfiguredNumber('exits.stopLossPercent')<br>foundation/ConfigLoader.js:2467 -> 0.8<br>scripts/generate-live-proof.js:241 -> '2.0'<br>tools/config-audit.js:231 -> 1.5<br>silently fabricates trading-critical data: **no** | y |  |
| `STRATEGY_DIAG` | core/StrategyOrchestrator.js:1005,1048,1587,1649,1708,1752,1768,1918,1997,2036,2082,2361,2473,2480,2554,2582,2658,2775<br>core/TradingLoop.js:75 | direct `process.env`/environment bypass | n | y | core/StrategyOrchestrator.js:2361 -> this.evalCount % 200 === 0<br>core/StrategyOrchestrator.js:2554 -> this.evalCount % 200 === 0<br>silently fabricates trading-critical data: **no** | n |  |
| `SUBSCRIPTION_TIER` | foundation/ConfigLoader.js:1058 | ConfigLoader | y | y | foundation/ConfigLoader.js:1058 -> 'ML'<br>silently fabricates trading-critical data: **no** | y |  |
| `SUPERVISOR_ALERT_HOOK` | scripts/supervisor-daemon.js:203 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:203 -> null<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_BOT_PROCESS` | scripts/supervisor-daemon.js:52 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:52 -> 'ogz-prime-v2'<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_DEADMAN_URL` | scripts/supervisor-daemon.js:54 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:54 -> null<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_DEGRADE_MS` | scripts/supervisor-daemon.js:57 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:57 -> 120000<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_HEALTH_URL` | scripts/supervisor-daemon.js:51 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:51 -> 'https://localhost:443/api/health'<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_HEAL_ATTEMPTS` | scripts/supervisor-daemon.js:58 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:58 -> 3<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_LEDGER_PATH` | scripts/supervisor-daemon.js:55 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:55 -> 'data/supervisor-ledger.jsonl'<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_POLL_MS` | scripts/supervisor-daemon.js:56 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:56 -> 30000<br>silently fabricates trading-critical data: **no** | n |  |
| `SUPERVISOR_RELAY_PROCESS` | scripts/supervisor-daemon.js:53 | direct `process.env`/environment bypass | y | n | scripts/supervisor-daemon.js:53 -> 'ogz-websocket'<br>silently fabricates trading-critical data: **no** | n |  |
| `SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES` | foundation/ConfigLoader.js:795 | ConfigLoader | y | y | foundation/ConfigLoader.js:795 -> tradingConfigFile.entryLogic?.symbolLossCooldown?.consecutiveLosses \|\| 2<br>silently fabricates trading-critical data: **no** | n |  |
| `SYMBOL_LOSS_COOLDOWN_ENABLED` | foundation/ConfigLoader.js:794 | ConfigLoader | y | y | foundation/ConfigLoader.js:794 -> tradingConfigFile.entryLogic?.symbolLossCooldown?.enabled === true<br>silently fabricates trading-critical data: **no** | n |  |
| `SYMBOL_LOSS_COOLDOWN_MINUTES` | foundation/ConfigLoader.js:796 | ConfigLoader | y | y | foundation/ConfigLoader.js:796 -> tradingConfigFile.entryLogic?.symbolLossCooldown?.cooldownMinutes \|\| 120<br>silently fabricates trading-critical data: **no** | n |  |
| `SYSTEMROOT` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `SystemRoot` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TAKE_PROFIT_PERCENT` | foundation/ConfigLoader.js:858,2468<br>tools/config-audit.js:232 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:858 -> requiredConfiguredNumber('exits.takeProfitPercent')<br>foundation/ConfigLoader.js:2468 -> 1.0<br>tools/config-audit.js:232 -> 2.0<br>silently fabricates trading-critical data: **no** | y |  |
| `TAVILY_API_KEY` | core/NewsSearchProvider.js:93<br>scripts/cpu-vps-setup.sh:40<br>trai_brain/mercury-bridge/tool-adapter.js:1656 | direct `process.env`/environment bypass | n | y | trai_brain/mercury-bridge/tool-adapter.js:1656 -> ''<br>silently fabricates trading-critical data: **no** | y |  |
| `TELEGRAM_BOT_TOKEN` | utils/telegramNotifier.js:47 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TELEGRAM_CHAT_ID` | utils/telegramNotifier.js:48 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TEMP` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TESTING` | core/OptimizedIndicators.js:248 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `TEST_MODE` | core/SingletonLock.js:29 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER1_EXIT_FRACTION` | foundation/ConfigLoader.js:810,2837 | ConfigLoader | y | y | foundation/ConfigLoader.js:810 -> configuredValue('exitLogic.tieredExit.tier1ExitFraction', 0.3)<br>foundation/ConfigLoader.js:2837 -> 0.30<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER1_TARGET` | foundation/ConfigLoader.js:867,2482<br>tools/config-audit.js:237 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:867 -> 0.007<br>foundation/ConfigLoader.js:2482 -> 0.015<br>tools/config-audit.js:237 -> 0.015<br>silently fabricates trading-critical data: **no** | y |  |
| `TIER2_EXIT_FRACTION` | foundation/ConfigLoader.js:811,2838 | ConfigLoader | y | y | foundation/ConfigLoader.js:811 -> configuredValue('exitLogic.tieredExit.tier2ExitFraction', 0.3)<br>foundation/ConfigLoader.js:2838 -> 0.30<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER2_TARGET` | foundation/ConfigLoader.js:868,2483<br>tools/config-audit.js:238 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:868 -> 0.010<br>foundation/ConfigLoader.js:2483 -> 0.020<br>tools/config-audit.js:238 -> 0.020<br>silently fabricates trading-critical data: **no** | y |  |
| `TIER3_EXIT_FRACTION` | foundation/ConfigLoader.js:812,2839 | ConfigLoader | y | y | foundation/ConfigLoader.js:812 -> configuredValue('exitLogic.tieredExit.tier3ExitFraction', 0.2)<br>foundation/ConfigLoader.js:2839 -> 0.20<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER3_TARGET` | foundation/ConfigLoader.js:869,2484<br>tools/config-audit.js:239 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:869 -> 0.015<br>foundation/ConfigLoader.js:2484 -> 0.030<br>tools/config-audit.js:239 -> 0.030<br>silently fabricates trading-critical data: **no** | y |  |
| `TIERED_EXIT_ENABLED` | foundation/ConfigLoader.js:809,2834 | ConfigLoader | y | y | foundation/ConfigLoader.js:809 -> configuredValue('exitLogic.tieredExit.enabled', true)<br>foundation/ConfigLoader.js:2834 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER_HIGH_CONF_MULT` | foundation/ConfigLoader.js:817,2849 | ConfigLoader | y | y | foundation/ConfigLoader.js:817 -> configuredValue('exitLogic.tieredExit.highConfidenceMultiplier', 1.2)<br>foundation/ConfigLoader.js:2849 -> 1.2<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER_HIGH_CONF_THRESHOLD` | foundation/ConfigLoader.js:816,2848 | ConfigLoader | y | y | foundation/ConfigLoader.js:816 -> configuredValue('exitLogic.tieredExit.highConfidenceThreshold', 0.8)<br>foundation/ConfigLoader.js:2848 -> 0.8<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER_LOW_CONF_MULT` | foundation/ConfigLoader.js:819,2851 | ConfigLoader | y | y | foundation/ConfigLoader.js:819 -> configuredValue('exitLogic.tieredExit.lowConfidenceMultiplier', 0.8)<br>foundation/ConfigLoader.js:2851 -> 0.8<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER_LOW_CONF_THRESHOLD` | foundation/ConfigLoader.js:818,2850 | ConfigLoader | y | y | foundation/ConfigLoader.js:818 -> configuredValue('exitLogic.tieredExit.lowConfidenceThreshold', 0.6)<br>foundation/ConfigLoader.js:2850 -> 0.6<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER_MARKET_ADAPTATION_ENABLED` | foundation/ConfigLoader.js:813,2843 | ConfigLoader | y | y | foundation/ConfigLoader.js:813 -> configuredValue('exitLogic.tieredExit.enableMarketAdaptation', true)<br>foundation/ConfigLoader.js:2843 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER_RANGE_MULT` | foundation/ConfigLoader.js:815,2845 | ConfigLoader | y | y | foundation/ConfigLoader.js:815 -> configuredValue('exitLogic.tieredExit.rangingTargetMultiplier', 0.8)<br>foundation/ConfigLoader.js:2845 -> 0.8<br>silently fabricates trading-critical data: **no** | n |  |
| `TIER_TREND_MULT` | foundation/ConfigLoader.js:814,2844 | ConfigLoader | y | y | foundation/ConfigLoader.js:814 -> configuredValue('exitLogic.tieredExit.trendingTargetMultiplier', 1.3)<br>foundation/ConfigLoader.js:2844 -> 1.3<br>silently fabricates trading-critical data: **no** | n |  |
| `TIGHT_TRAIL_DISTANCE` | foundation/ConfigLoader.js:2490 | ConfigLoader | y | y | foundation/ConfigLoader.js:2490 -> 0.015<br>silently fabricates trading-critical data: **no** | y |  |
| `TMP` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TRACE_EVENT_MAX_BUFFERED_BYTES` | foundation/ConfigLoader.js:756 | ConfigLoader | y | y | foundation/ConfigLoader.js:756 -> 1048576<br>silently fabricates trading-critical data: **no** | n |  |
| `TRADE_INTELLIGENCE_SHADOW` | foundation/ConfigLoader.js:1057 | ConfigLoader | y | y | foundation/ConfigLoader.js:1057 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `TRADING_INTERVAL` | foundation/ConfigLoader.js:982 | ConfigLoader | y | y | foundation/ConfigLoader.js:982 -> 15000<br>silently fabricates trading-critical data: **no** | n |  |
| `TRADING_MODE` | core/BotStateFrame.js:138<br>core/TRAIDecisionModule.js:1030 | direct `process.env`/environment bypass | n | y | core/BotStateFrame.js:138 -> ctx.config && ctx.config.executionMode<br>core/TRAIDecisionModule.js:1030 -> process.env.ENABLE_LIVE_TRADING === 'true'<br>silently fabricates trading-critical data: **no** | y |  |
| `TRADING_PAIR` | core/MultiAssetManager.js:47<br>core/UnifiedPatternMemory.js:193<br>foundation/ConfigLoader.js:980,2984 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/MultiAssetManager.js:47 -> defaultAsset<br>core/UnifiedPatternMemory.js:193 -> ''<br>foundation/ConfigLoader.js:980 -> _isKraken ? 'BTC-USD' : 'TSLA'<br>foundation/ConfigLoader.js:2984 -> env('BROKER', 'alpaca') === 'kraken' ? 'BTC-USD' : 'TSLA'<br>silently fabricates trading-critical data: **yes** | n |  |
| `TRADING_PROFILE` | foundation/ConfigLoader.js:1056 | ConfigLoader | y | y | foundation/ConfigLoader.js:1056 -> 'balanced'<br>silently fabricates trading-critical data: **no** | n |  |
| `TRADING_TIER` | core/FeatureFlagManager.js:68 | direct `process.env`/environment bypass | n | y | core/FeatureFlagManager.js:68 -> 'ml'<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAILING_ACTIVATION` | foundation/ConfigLoader.js:860,2470<br>tools/config-audit.js:234 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:860 -> requiredConfiguredNumber('exits.trailingActivation')<br>foundation/ConfigLoader.js:2470 -> 0.8<br>tools/config-audit.js:234 -> 2.5<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAILING_STOP_PERCENT` | foundation/ConfigLoader.js:859,2469<br>tools/config-audit.js:233 | ConfigLoader + direct `process.env`/environment bypass | y | y | foundation/ConfigLoader.js:859 -> requiredConfiguredNumber('exits.trailingStopPercent')<br>foundation/ConfigLoader.js:2469 -> 0.6<br>tools/config-audit.js:233 -> 3.5<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAIL_ATR_MULTIPLIER` | core/exit/DynamicTrailingStop.js:41<br>foundation/ConfigLoader.js:956,2863<br>tools/config-audit.js:276 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/exit/DynamicTrailingStop.js:41 -> config.atrMultiplier<br>foundation/ConfigLoader.js:956 -> 2.0<br>foundation/ConfigLoader.js:2863 -> 2.0<br>tools/config-audit.js:276 -> 2.0<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_DISTANCE` | foundation/ConfigLoader.js:2489 | ConfigLoader | y | y | foundation/ConfigLoader.js:2489 -> 0.025<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAIL_ENABLED` | foundation/ConfigLoader.js:2861 | ConfigLoader | y | y | foundation/ConfigLoader.js:2861 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_FEE_BUFFER` | foundation/ConfigLoader.js:2872 | ConfigLoader | y | y | foundation/ConfigLoader.js:2872 -> 0.65<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_MAX_PCT` | foundation/ConfigLoader.js:2871 | ConfigLoader | y | y | foundation/ConfigLoader.js:2871 -> 3.0<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_MIN_ACTIVATION` | core/exit/DynamicTrailingStop.js:45<br>foundation/ConfigLoader.js:957,2862<br>tools/config-audit.js:277 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/exit/DynamicTrailingStop.js:45 -> config.minActivation<br>foundation/ConfigLoader.js:957 -> 1.5<br>foundation/ConfigLoader.js:2862 -> 0.5<br>tools/config-audit.js:277 -> 1.5<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_MIN_PCT` | foundation/ConfigLoader.js:2870 | ConfigLoader | y | y | foundation/ConfigLoader.js:2870 -> 0.3<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_RATCHET_FLOOR` | foundation/ConfigLoader.js:2869 | ConfigLoader | y | y | foundation/ConfigLoader.js:2869 -> 0.6<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_RATCHET_RATE` | foundation/ConfigLoader.js:2868 | ConfigLoader | y | y | foundation/ConfigLoader.js:2868 -> 0.1<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_RATCHET_THRESHOLD` | foundation/ConfigLoader.js:2867 | ConfigLoader | y | y | foundation/ConfigLoader.js:2867 -> 3.0<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_ROUND_PROXIMITY` | foundation/ConfigLoader.js:2873 | ConfigLoader | y | y | foundation/ConfigLoader.js:2873 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_ROUND_TIGHTEN` | foundation/ConfigLoader.js:2874 | ConfigLoader | y | y | foundation/ConfigLoader.js:2874 -> 0.7<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_STRUCTURE_DIST` | foundation/ConfigLoader.js:2866 | ConfigLoader | y | y | foundation/ConfigLoader.js:2866 -> 1.0<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_STRUCTURE_TIGHTEN` | core/exit/DynamicTrailingStop.js:51<br>foundation/ConfigLoader.js:959,2865<br>tools/config-audit.js:279 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/exit/DynamicTrailingStop.js:51 -> config.structureTightenMultiplier<br>foundation/ConfigLoader.js:959 -> 0.5<br>foundation/ConfigLoader.js:2865 -> 0.5<br>tools/config-audit.js:279 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAIL_TREND_WIDEN` | core/exit/DynamicTrailingStop.js:48<br>foundation/ConfigLoader.js:958,2864<br>tools/config-audit.js:278 | ConfigLoader + direct `process.env`/environment bypass | y | y | core/exit/DynamicTrailingStop.js:48 -> config.trendWidenMultiplier<br>foundation/ConfigLoader.js:958 -> 1.5<br>foundation/ConfigLoader.js:2864 -> 1.5<br>tools/config-audit.js:278 -> 1.5<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_AUTO_HARVEST` | tools/matrix-sweep.js:1016 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_ENABLE_BACKTEST` | foundation/ConfigLoader.js:1006,3682 | ConfigLoader | y | y | foundation/ConfigLoader.js:1006 -> false<br>foundation/ConfigLoader.js:3682 -> true<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAI_ENABLE_EMBEDDINGS` | trai_brain/inference_server.py:202 | direct `process.env`/environment bypass | n | n | trai_brain/inference_server.py:202 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_HARVEST_BOOST_WR` | tools/matrix-sweep.js:1024 | direct `process.env`/environment bypass | n | n | tools/matrix-sweep.js:1024 -> '0.55'<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_HARVEST_MIN_TRADES` | tools/matrix-sweep.js:1023 | direct `process.env`/environment bypass | n | n | tools/matrix-sweep.js:1023 -> '20'<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_HARVEST_PENALTY_WR` | tools/matrix-sweep.js:1025 | direct `process.env`/environment bypass | n | n | tools/matrix-sweep.js:1025 -> '0.40'<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_MAX_CONF` | foundation/ConfigLoader.js:1005 | ConfigLoader | y | y | foundation/ConfigLoader.js:1005 -> 0.95<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAI_MAX_RISK` | foundation/ConfigLoader.js:1003 | ConfigLoader | y | y | foundation/ConfigLoader.js:1003 -> 0.03<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAI_MIN_CONF` | foundation/ConfigLoader.js:1004 | ConfigLoader | y | y | foundation/ConfigLoader.js:1004 -> 0.40<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAI_MODE` | foundation/ConfigLoader.js:1000 | ConfigLoader | y | y | foundation/ConfigLoader.js:1000 -> 'passive'<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAI_PATTERN_PACK_PATH` | core/TRAIDecisionModule.js:90 | direct `process.env`/environment bypass | n | y | core/TRAIDecisionModule.js:90 -> './data/pattern-pack.json'<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_RESEARCH_ENABLED` | trai_brain/research_mode.js:20 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_SEARCH_ENDPOINT` | trai_brain/research_mode.js:24 | direct `process.env`/environment bypass | n | n | trai_brain/research_mode.js:24 -> 'http://localhost:8888/search'<br>silently fabricates trading-critical data: **no** | n |  |
| `TRAI_VETO` | foundation/ConfigLoader.js:1002 | ConfigLoader | y | y | foundation/ConfigLoader.js:1002 -> false<br>silently fabricates trading-critical data: **no** | y |  |
| `TRAI_WEIGHT` | foundation/ConfigLoader.js:1001 | ConfigLoader | y | y | foundation/ConfigLoader.js:1001 -> 0.2<br>silently fabricates trading-critical data: **no** | y |  |
| `TREND_REGIME_GATE_ENABLED` | foundation/ConfigLoader.js:830,3278 | ConfigLoader | y | y | foundation/ConfigLoader.js:830 -> configuredValue('strategyBehavior.trendRegimeGate.enabled', false)<br>foundation/ConfigLoader.js:3278 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `TREND_REGIME_GATE_MIN_CONFIDENCE` | foundation/ConfigLoader.js:831,3279 | ConfigLoader | y | y | foundation/ConfigLoader.js:831 -> configuredValue('strategyBehavior.trendRegimeGate.minConfidence', 0.25)<br>foundation/ConfigLoader.js:3279 -> 0.25<br>silently fabricates trading-critical data: **no** | n |  |
| `TSMOM_ALLOW_SHORTS` | foundation/ConfigLoader.js:3164 | ConfigLoader | y | y | foundation/ConfigLoader.js:3164 -> requiredConfiguredBool('strategies.TimeSeriesMomentum.allowShorts')<br>silently fabricates trading-critical data: **no** | n |  |
| `TSMOM_CONFIDENCE_BASE` | foundation/ConfigLoader.js:3172 | ConfigLoader | y | y | foundation/ConfigLoader.js:3172 -> requiredConfiguredNumber('strategies.TimeSeriesMomentum.confidenceBase')<br>silently fabricates trading-critical data: **no** | n |  |
| `TSMOM_CONFIDENCE_RETURN_MULT` | foundation/ConfigLoader.js:3173 | ConfigLoader | y | y | foundation/ConfigLoader.js:3173 -> requiredConfiguredNumber('strategies.TimeSeriesMomentum.confidenceReturnMultiplier')<br>silently fabricates trading-critical data: **no** | n |  |
| `TSMOM_LOOKBACK` | foundation/ConfigLoader.js:3160 | ConfigLoader | y | y | foundation/ConfigLoader.js:3160 -> requiredConfiguredNumber('strategies.TimeSeriesMomentum.lookback')<br>silently fabricates trading-critical data: **no** | n |  |
| `TSMOM_MAX_CONFIDENCE` | foundation/ConfigLoader.js:3174 | ConfigLoader | y | y | foundation/ConfigLoader.js:3174 -> requiredConfiguredNumber('strategies.TimeSeriesMomentum.maxConfidence')<br>silently fabricates trading-critical data: **no** | n |  |
| `TSMOM_MIN_RETURN` | foundation/ConfigLoader.js:3163 | ConfigLoader | y | y | foundation/ConfigLoader.js:3163 -> requiredConfiguredNumber('strategies.TimeSeriesMomentum.minReturn')<br>silently fabricates trading-critical data: **no** | n |  |
| `TSMOM_TREND_PERIOD` | foundation/ConfigLoader.js:3161 | ConfigLoader | y | y | foundation/ConfigLoader.js:3161 -> requiredConfiguredNumber('strategies.TimeSeriesMomentum.trendPeriod')<br>silently fabricates trading-critical data: **no** | n |  |
| `TTP_ACCOUNT_START_OF_DAY_DATE` | foundation/ConfigLoader.js:935 | ConfigLoader | y | y | foundation/ConfigLoader.js:935 -> config:'venueGuards.ttp.accountLimits.accountStartOfDayDate'<br>silently fabricates trading-critical data: **no** | n |  |
| `TTP_ACCOUNT_START_OF_DAY_EQUITY` | foundation/ConfigLoader.js:936 | ConfigLoader | y | y | foundation/ConfigLoader.js:936 -> config:'venueGuards.ttp.accountLimits.accountStartOfDayEquity'<br>silently fabricates trading-critical data: **no** | n |  |
| `TTP_EARNINGS_STATUS_JSON` | foundation/ConfigLoader.js:943 | ConfigLoader | y | y | foundation/ConfigLoader.js:943 -> config:'venueGuards.ttp.earningsRestriction.manualStatus'<br>silently fabricates trading-critical data: **no** | n |  |
| `TUNING_PROFILE` | foundation/ConfigLoader.js:498,503 | ConfigLoader | y | y | foundation/ConfigLoader.js:503 -> ''<br>silently fabricates trading-critical data: **no** | n |  |
| `UPHOLD_ACCESS_TOKEN` | brokers/UpholdAdapter.js:24 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `UPHOLD_CLIENT_ID` | brokers/UpholdAdapter.js:22 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `UPHOLD_CLIENT_SECRET` | brokers/UpholdAdapter.js:23 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `USER` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `USERPROFILE` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `USER_NARRATOR` | core/TradeNarrator.js:293 | direct `process.env`/environment bypass | y | y | core/TradeNarrator.js:293 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_ABOVE_VAH_EMA` | foundation/ConfigLoader.js:2399 | ConfigLoader | y | y | foundation/ConfigLoader.js:2399 -> 1.20<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_ABOVE_VAH_MASR` | foundation/ConfigLoader.js:2400 | ConfigLoader | y | y | foundation/ConfigLoader.js:2400 -> 1.20<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_ABOVE_VAH_RSI` | foundation/ConfigLoader.js:2401 | ConfigLoader | y | y | foundation/ConfigLoader.js:2401 -> 0.80<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_ABOVE_VAH_SMS` | foundation/ConfigLoader.js:2403 | ConfigLoader | y | y | foundation/ConfigLoader.js:2403 -> 1.10<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_ABOVE_VAH_SWEEP` | foundation/ConfigLoader.js:2402 | ConfigLoader | y | y | foundation/ConfigLoader.js:2402 -> 1.10<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_AT_POC_EMA` | foundation/ConfigLoader.js:2413 | ConfigLoader | y | y | foundation/ConfigLoader.js:2413 -> 0.85<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_AT_POC_MASR` | foundation/ConfigLoader.js:2414 | ConfigLoader | y | y | foundation/ConfigLoader.js:2414 -> 0.85<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_AT_POC_RSI` | foundation/ConfigLoader.js:2415 | ConfigLoader | y | y | foundation/ConfigLoader.js:2415 -> 1.25<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_AT_POC_SMS` | foundation/ConfigLoader.js:2417 | ConfigLoader | y | y | foundation/ConfigLoader.js:2417 -> 0.90<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_AT_POC_SWEEP` | foundation/ConfigLoader.js:2416 | ConfigLoader | y | y | foundation/ConfigLoader.js:2416 -> 0.90<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_BELOW_VAL_EMA` | foundation/ConfigLoader.js:2406 | ConfigLoader | y | y | foundation/ConfigLoader.js:2406 -> 1.20<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_BELOW_VAL_MASR` | foundation/ConfigLoader.js:2407 | ConfigLoader | y | y | foundation/ConfigLoader.js:2407 -> 1.20<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_BELOW_VAL_RSI` | foundation/ConfigLoader.js:2408 | ConfigLoader | y | y | foundation/ConfigLoader.js:2408 -> 0.80<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_BELOW_VAL_SMS` | foundation/ConfigLoader.js:2410 | ConfigLoader | y | y | foundation/ConfigLoader.js:2410 -> 1.10<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_BELOW_VAL_SWEEP` | foundation/ConfigLoader.js:2409 | ConfigLoader | y | y | foundation/ConfigLoader.js:2409 -> 1.10<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_IN_LVN_ALL` | foundation/ConfigLoader.js:2420 | ConfigLoader | y | y | foundation/ConfigLoader.js:2420 -> 0.90<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_IN_VA_EMA` | foundation/ConfigLoader.js:2423 | ConfigLoader | y | y | foundation/ConfigLoader.js:2423 -> 0.95<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_IN_VA_MASR` | foundation/ConfigLoader.js:2424 | ConfigLoader | y | y | foundation/ConfigLoader.js:2424 -> 0.95<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_IN_VA_RSI` | foundation/ConfigLoader.js:2425 | ConfigLoader | y | y | foundation/ConfigLoader.js:2425 -> 1.10<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_IN_VA_SMS` | foundation/ConfigLoader.js:2427 | ConfigLoader | y | y | foundation/ConfigLoader.js:2427 -> 1.00<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_IN_VA_SWEEP` | foundation/ConfigLoader.js:2426 | ConfigLoader | y | y | foundation/ConfigLoader.js:2426 -> 1.00<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_NUM_BINS` | foundation/ConfigLoader.js:3022 | ConfigLoader | y | y | foundation/ConfigLoader.js:3022 -> 50<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_OUT_OF_BALANCE_PCT` | foundation/ConfigLoader.js:3024 | ConfigLoader | y | y | foundation/ConfigLoader.js:3024 -> 0.5<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_RECALC_INTERVAL` | foundation/ConfigLoader.js:3025 | ConfigLoader | y | y | foundation/ConfigLoader.js:3025 -> 5<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_SESSION_LOOKBACK` | foundation/ConfigLoader.js:3021 | ConfigLoader | y | y | foundation/ConfigLoader.js:3021 -> 96<br>silently fabricates trading-critical data: **no** | n |  |
| `VP_VALUE_AREA_PCT` | foundation/ConfigLoader.js:3023 | ConfigLoader | y | y | foundation/ConfigLoader.js:3023 -> 0.70<br>silently fabricates trading-critical data: **no** | n |  |
| `WATCHLIST_CRYPTO_SYMBOLS` | ogzprime-ssl-server.js:1142 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `WEBHOOK_DRY_RUN` | foundation/ConfigLoader.js:991 | ConfigLoader | y | y | foundation/ConfigLoader.js:991 -> true<br>silently fabricates trading-critical data: **no** | n |  |
| `WEBHOOK_ORDERS_ENABLED` | foundation/ConfigLoader.js:990 | ConfigLoader | y | y | foundation/ConfigLoader.js:990 -> false<br>silently fabricates trading-critical data: **no** | n |  |
| `WEBHOOK_ORDER_LOG_CAP` | foundation/ConfigLoader.js:994 | ConfigLoader | y | y | foundation/ConfigLoader.js:994 -> 500<br>silently fabricates trading-critical data: **no** | n |  |
| `WEBHOOK_TIMEOUT_MS` | foundation/ConfigLoader.js:993 | ConfigLoader | y | y | foundation/ConfigLoader.js:993 -> 5000<br>silently fabricates trading-critical data: **no** | n |  |
| `WEBSOCKET_AUTH_TOKEN` | core/WebSocketManager.js:122<br>ogzprime-ssl-server.js:157,1799 | direct `process.env`/environment bypass | n | y | none observed<br>silently fabricates trading-critical data: **no** | y |  |
| `WEEKEND_CAMPAIGN_DISK_RESERVE_MIB` | tools/weekend-campaign-gauntlet.js:800,826 | direct `process.env`/environment bypass | n | n | tools/weekend-campaign-gauntlet.js:800 -> DEFAULT_DISK_RESERVE_MIB<br>silently fabricates trading-critical data: **no** | n |  |
| `WEEKEND_CAMPAIGN_MIN_FREE_MIB` | tools/weekend-campaign-gauntlet.js:801,827 | direct `process.env`/environment bypass | n | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `WEEKEND_CAMPAIGN_PROJECTED_MIB_PER_RUN` | tools/weekend-campaign-gauntlet.js:802,828 | direct `process.env`/environment bypass | n | n | tools/weekend-campaign-gauntlet.js:802 -> 0<br>silently fabricates trading-critical data: **no** | n |  |
| `WINDIR` | tools/backtest-worker-env.js:309,310 | direct `process.env`/environment bypass | y | n | none observed<br>silently fabricates trading-critical data: **no** | n |  |
| `WS_PORT` | ogzprime-ssl-server.js:2399 | direct `process.env`/environment bypass | n | n | ogzprime-ssl-server.js:2399 -> 3010<br>silently fabricates trading-critical data: **no** | y |  |
| `WS_URL` | core/WebSocketManager.js:109 | direct `process.env`/environment bypass | n | y | core/WebSocketManager.js:109 -> 'ws://localhost:3010/ws'<br>silently fabricates trading-critical data: **no** | n |  |

## Variables declared in config/.env.example but read by nothing in scope

Count: 81 unique names. Duplicate declarations are shown with every declaration line. “Dead” means no statically named variable-specific read; generic computed and bulk environment reads cannot prove variable-specific consumption, so they do not suppress dead classification.

| Name | config/.env.example line(s) |
|---|---|
| `ACCOUNT_BALANCE` | 45 |
| `ANTHROPIC_API_KEY` | 122 |
| `API_EXTERNAL_URL` | 114 |
| `API_PASSWORD` | 35 |
| `API_USERNAME` | 34 |
| `ARCHON_API_KEY` | 118 |
| `AVATAR_ENABLED` | 43 |
| `AVATAR_IMAGE_URL` | 54 |
| `BOT_WS_URL` | 40 |
| `BTC_WALLET_ADDRESS` | 62, 157 |
| `CLAUDE_CODE_API_KEY` | 121 |
| `COINBASE_API_KEY_NAME` | 130 |
| `COINBASE_PRIVATE_KEY` | 132 |
| `CONFIDENCE_BOOST` | 251 |
| `CONFIDENCE_PENALTY` | 250 |
| `CONTROL_WEBSOCKET_PORT` | 26 |
| `DATABASE_URL` | 101 |
| `DATA_FRESHNESS_WINDOW` | 73 |
| `DATA_WEBSOCKET_PORT` | 24 |
| `DID_AVATAR_ID` | 53 |
| `ELEVENLABS_VOICE_ID` | 51 |
| `EMERGENCY_CONFIDENCE` | 64 |
| `ENABLE_PRICE_BROADCAST` | 159 |
| `FEATURE_FLAG` | 15 |
| `FIB_PROXIMITY` | 293 |
| `GEMINI_API_KEY` | 126 |
| `GOOGLE_API_KEY` | 125 |
| `GRAFANA_PASSWORD` | 113 |
| `GUI_WEBSOCKET_PORT` | 25 |
| `HOUSTON_TARGET` | 46 |
| `JWT_SECRET` | 33, 111 |
| `LICENSE_ENCRYPTION_KEY` | 139 |
| `LICENSE_PRIVATE_KEY` | 138 |
| `LICENSE_PUBLIC_KEY` | 137 |
| `LOG_DIRECTORY` | 13 |
| `LOG_LEVEL` | 12 |
| `MAX_DAILY_LOSS` | 69 |
| `MAX_POSITION_SIZE` | 65 |
| `MEMORY_DIR` | 44 |
| `MIN_PROFIT_TRAIL` | 261 |
| `MOBILE_PASSWORD` | 143 |
| `MOBILE_SECRET` | 142 |
| `MODULE_AUTOLOADER_PATH` | 84 |
| `MOVER_API_KEY` | 150 |
| `MOVER_HTTP_PORT` | 38 |
| `MOVER_PERSONALITY` | 41 |
| `MOVER_VOICE_API_KEY` | 151 |
| `MOVER_VPS_MODE` | 47 |
| `MOVER_WS_PORT` | 39 |
| `MPM_BREAKEVEN_THRESHOLD` | 260 |
| `OGZ_SSL_SERVER` | 91 |
| `OLLAMA_ENABLED` | 158 |
| `OLLAMA_URL` | 163 |
| `PATTERN_CONFIDENCE` | 63 |
| `PATTERN_UPDATE` | 71 |
| `PORT` | 94 |
| `POSTGRES_PASSWORD` | 110 |
| `PRIMARY_ASSET` | 61 |
| `REDIS_PASSWORD` | 112 |
| `REDIS_URL` | 102 |
| `RISK_CHECK` | 72 |
| `RISK_PER_TRADE` | 60 |
| `SITE_URL` | 115 |
| `SR_MAX_LEVELS` | 298 |
| `SR_MIN_STRENGTH` | 296 |
| `SR_PROXIMITY` | 297 |
| `SSL_ENABLED` | 30 |
| `SSL_SERVER_HOST` | 89 |
| `SSL_SERVER_PORT` | 90 |
| `STRIPE_SECRET_KEY` | 21 |
| `SUPABASE_ANON_KEY` | 107 |
| `SUPABASE_SERVICE_KEY` | 106 |
| `SUPABASE_URL` | 105 |
| `TRADE_INTERVAL` | 70 |
| `TRAI_BACKTEST_MODE` | 207 |
| `TRAI_ENABLE_LLM` | 206 |
| `USE_MODULE_AUTOLOADER` | 83 |
| `USE_SSL` | 11, 97 |
| `VOICE_ENABLED` | 42 |
| `WEBSOCKET_DOMAIN` | 10, 98 |
| `WS_HOST` | 96 |

## Verification totals

- Runtime source files inventoried: 267 (257 JavaScript/TypeScript, 5 Python, 5 shell).
- Named or computed census rows: 536.
- Unique names in `config/.env.example`: 151.
- Dead example names: 81.
- JavaScript/TypeScript parse failures: 0.
- Python parse failures: 0.
- Shell syntax failures: 0.

## Territory and hold

Only this census artifact is mission output. No runtime source, config key, environment variable, default, test, package manifest, PM2 state, or shared Git state was changed. Status: **HOLD for cold-pull**.
