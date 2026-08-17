# CONFIG-TRUTH CENSUS pass0

Date: 2026-08-16
Agent: codex
Mode: read-only mechanical census plus this artifact
Owned output: `ogz-meta/inbox/codex/2026-08-16/config-truth-census-pass0.md`

## Methodology

I mechanically searched current runtime-surface files for behavior-tuning values:

- direct env reads: `process.env`
- silent literal fallbacks: `|| <literal>`
- default numeric params: `period = N`, `limit = N`, and adjacent tuning param names
- module constants: upper-case `const`/`let`/`var` assigned literal values

Scope was intentionally pass0/high-signal, not exhaustive remediation. I searched existing high-signal paths:

- `core/`
- `modules/`
- `brokers/`
- `foundation/`
- `run-empire-v2.js`
- `public/js`
- `public/*.js`
- `tools/`
- `scripts/`
- `config/` for env/config ownership reads

I excluded `*.pipeline-backup` from count totals.

## Commands And Counts

Commands used for counted search:

```bash
rg -l --stats -g "*.js" -g "*.json" -g "!*.pipeline-backup" "process\.env" core modules brokers foundation run-empire-v2.js public/js public/*.js tools scripts config
rg -l --stats -g "*.js" -g "!*.pipeline-backup" "\|\|\s*([-+]?[0-9]+(?:\.[0-9]+)?|true|false|'[^']*'|\"[^\"]*\")" core modules brokers foundation run-empire-v2.js public/js public/*.js tools scripts
rg -l --stats -g "*.js" -g "!*.pipeline-backup" "\b(?:period|lookback|window|length|limit|max|min|threshold|confidence|stopLoss|takeProfit|trailingStop|risk|timeout|interval|cooldown)\s*=\s*[-+]?[0-9]+" core modules brokers foundation run-empire-v2.js public/js public/*.js tools scripts
rg -l --stats -g "*.js" -g "!*.pipeline-backup" "^\s*(?:const|let|var)\s+[A-Z][A-Z0-9_]+\s*=\s*([-+]?[0-9]+(?:\.[0-9]+)?|true|false|'[^']*'|\"[^\"]*\")" core modules brokers foundation run-empire-v2.js public/js public/*.js tools scripts
```

Count totals:

| Pattern bucket | Matches | Matched lines | Files with matches | Files searched |
| --- | ---: | ---: | ---: | ---: |
| `process.env` | 175 | 170 | 54 | 276 |
| `|| literal` | 1705 | 1629 | 186 | 272 |
| numeric default params / tuning names | 105 | 103 | 56 | 272 |
| uppercase literal constants | 319 | 319 | 76 | 272 |

Additional tight reads used `rg -n -C 1` against the files shown in the table below. One initial broad file listing included nonexistent `dashboard` and returned that path error; the counted commands above use existing paths only.

## Census Rows

Pass0 rows below are representative high-signal runtime rows, not every one of the 1,705 fallback matches. `config-owned=Y` means the observed value is routed through `foundation/ConfigLoader.js`, `config/trading.config.json`, a config object supplied by that path, or a required config reader. `silent fallback=Y` means the runtime expression can substitute a literal/default without a fail-loud missing-value path at that row.

| file:line | what it tunes | config-owned Y/N | silent fallback Y/N |
| --- | --- | --- | --- |
| `foundation/ConfigLoader.js:720` | `CANDLE_SOURCE` defaults to `websocket` | Y | Y |
| `foundation/ConfigLoader.js:729` | backtest `INITIAL_BALANCE` defaults to `10000` | Y | Y |
| `foundation/ConfigLoader.js:730` | `BACKTEST_SILENT` defaults to `false` | Y | Y |
| `foundation/ConfigLoader.js:731` | `BACKTEST_VERBOSE` defaults to `false` | Y | Y |
| `foundation/ConfigLoader.js:732` | `BACKTEST_FAST` defaults to `false` | Y | Y |
| `foundation/ConfigLoader.js:733` | `BACKTEST_NO_PATTERN_SAVE` defaults to `false` | Y | Y |
| `foundation/ConfigLoader.js:761` | boot REST hydration candle limit defaults to `60` | Y | Y |
| `foundation/ConfigLoader.js:762` | liveness backfill limit defaults to `10` | Y | Y |
| `foundation/ConfigLoader.js:763` | liveness check interval defaults to `60000ms` | Y | Y |
| `foundation/ConfigLoader.js:764` | max data silence defaults to `120000ms` | Y | Y |
| `foundation/ConfigLoader.js:765` | active timeframe liveness multiplier defaults to `1.5` | Y | Y |
| `foundation/ConfigLoader.js:771` | gap threshold multiplier defaults to `1.5` | Y | Y |
| `foundation/ConfigLoader.js:772` | gap backfill buffer defaults to `5` candles | Y | Y |
| `foundation/ConfigLoader.js:780` | live/profile min trade confidence is required from launch profile | Y | N |
| `foundation/ConfigLoader.js:781` | min strategy confidence allows env override, config fallback | Y | N |
| `foundation/ConfigLoader.js:787` | base position size defaults to `0.01` | Y | Y |
| `foundation/ConfigLoader.js:788` | max position size defaults to `0.05` | Y | Y |
| `foundation/ConfigLoader.js:795` | symbol loss cooldown consecutive losses falls back to config or `2` | Y | Y |
| `foundation/ConfigLoader.js:796` | symbol loss cooldown minutes falls back to config or `120` | Y | Y |
| `foundation/ConfigLoader.js:831` | trend-regime min confidence falls back to config or `0.25` | Y | Y |
| `foundation/ConfigLoader.js:839` | ATR contract stop multiplier falls back to config or `2.0` | Y | Y |
| `foundation/ConfigLoader.js:840` | ATR contract trail multiplier falls back to config or `2.0` | Y | Y |
| `foundation/ConfigLoader.js:841` | ATR contract trailing activation R falls back to config or `1.0` | Y | Y |
| `foundation/ConfigLoader.js:2267` | candle pattern min confidence env/config path | Y | N |
| `foundation/ConfigLoader.js:3190` | orchestrator min candles for sweep defaults to `20` | Y | Y |
| `foundation/ConfigLoader.js:3191` | orchestrator min candles for MTF defaults to `30` | Y | Y |
| `foundation/ConfigLoader.js:3267` | ATR filter enabled defaults to `false` | Y | Y |
| `foundation/ConfigLoader.js:3278` | trend-regime gate enabled defaults to `false` | Y | Y |
| `foundation/ConfigLoader.js:3290` | ATR contracts enabled defaults to `false` | Y | Y |
| `foundation/ConfigLoader.js:3650` | dynamic sizing feature defaults to enabled | Y | Y |
| `foundation/ConfigLoader.js:3680` | risk manager component toggle defaults to enabled | Y | Y |
| `foundation/ConfigLoader.js:3681` | TRAI component toggle defaults to enabled | Y | Y |
| `foundation/ConfigLoader.js:3974` | unknown exit contract falls back to `contracts.default` | Y | Y |
| `foundation/ConfigLoader.js:4019` | unknown regime multipliers fall back to `{1.0,1.0}` | Y | Y |
| `foundation/ConfigLoader.js:4042` | tuning profile default comes from config default profile | Y | N |
| `run-empire-v2.js:9` | backtest fast mode read from resolved config | Y | N |
| `run-empire-v2.js:209` | DATA_DIR display falls back to `(default: ./data)` text | Y | Y |
| `run-empire-v2.js:211` | TEST_MODE display falls back to `false` | Y | Y |
| `run-empire-v2.js:278` | `ENABLE_DPS` direct env module-load gate | N | N |
| `run-empire-v2.js:687` | MTF active timeframes fall back to six literals | Y | Y |
| `run-empire-v2.js:756` | exit system falls back config -> feature flag -> `maxprofit` | Y | Y |
| `run-empire-v2.js:1749` | backtest fingerprint display falls back to `false` | N | Y |
| `run-empire-v2.js:1752` | fee maker fingerprint display falls back to `default` | N | Y |
| `run-empire-v2.js:1755` | `ENABLE_TRAI` fingerprint display falls back to `true` | N | Y |
| `run-empire-v2.js:1759` | `SMS_VP_RTH_ONLY` fingerprint display falls back to `true` | N | Y |
| `run-empire-v2.js:2314` | dashboard historical candle request limit default `200` | N | Y |
| `core/StrategyOrchestrator.js:824` | confluence sizing multipliers constructor default object | N | Y |
| `core/StrategyOrchestrator.js:882` | min MTF candles falls back to `30` after ConfigLoader read | Y | Y |
| `core/StrategyOrchestrator.js:985` | `STRATEGY_DIAG` direct env diagnostic gate | N | N |
| `core/StrategyOrchestrator.js:1612` | MADynamicSR confidence missing/zero coerces to `0` | N | Y |
| `core/StrategyOrchestrator.js:1675` | LiquiditySweep confidence missing/zero coerces to `0` | N | Y |
| `core/StrategyOrchestrator.js:1797` | pattern confidence missing/zero coerces to `0` | N | Y |
| `core/StrategyOrchestrator.js:1824` | market regime confidence missing/zero coerces to `0` | N | Y |
| `core/StrategyOrchestrator.js:2494` | regime confidence uses nullish fallback `0` | N | Y |
| `core/StrategyOrchestrator.js:2742` | confluence sizing falls back to configured 4-count or `2.5` | N | Y |
| `core/TradingLoop.js:2153` | candle pattern min confidence falls back to `0.70` | Y | Y |
| `core/TradingLoop.js:2154` | raw candle pattern confidence missing/zero coerces to `0` | N | Y |
| `core/TradingLoop.js:2162` | `BACKTEST_NO_PATTERN_SAVE` direct env gate | N | N |
| `core/TradingLoop.js:2303` | TRAI context volume/regime fallbacks and config position size read | Y | Y |
| `core/exit/DynamicTrailingStop.js:41` | trail ATR multiplier env/config/literal `2.0` chain | N | Y |
| `core/exit/DynamicTrailingStop.js:45` | trail activation env/config/literal `1.5` chain | N | Y |
| `core/exit/DynamicTrailingStop.js:48` | trend widen multiplier env/config/literal `1.5` chain | N | Y |
| `core/exit/DynamicTrailingStop.js:51` | structure tighten multiplier env/config/literal `0.5` chain | N | Y |
| `core/exit/DynamicTrailingStop.js:54` | min trail percent config/literal `0.3` chain | N | Y |
| `core/exit/DynamicTrailingStop.js:57` | max trail percent config/literal `3.0` chain | N | Y |
| `core/exit/DynamicTrailingStop.js:60` | round number proximity config/literal `0.5` chain | N | Y |
| `core/MultiAssetManager.js:40` | broker-aware default asset path still defaults broker to `kraken` | N | Y |
| `core/MultiAssetManager.js:47` | missing `TRADING_PAIR` falls back to computed default asset | N | Y |
| `core/UnifiedPatternMemory.js:193` | backtest pattern bucket reads `TRADING_PAIR` with empty-string fallback | N | Y |
| `core/UnifiedPatternMemory.js:200` | asset class direct env read with broker inference fallback | N | Y |
| `core/UnifiedPatternMemory.js:248` | pattern memory data dir config/env/path fallback | N | Y |
| `core/UnifiedPatternMemory.js:1141` | similar-pattern threshold and limit defaults `0.8`, `5` | N | Y |
| `core/PatternMemoryBank.js:183` | pattern bank data dir env/path fallback | N | Y |
| `core/PatternMemoryBank.js:998` | top-pattern limit/status defaults `50`, promoted | N | Y |
| `core/PatternMemoryBank.js:1020` | worst-pattern limit default `50` | N | Y |
| `modules/BreakAndRetest.js:52` | session lookback default `96` | N | Y |
| `modules/BreakAndRetest.js:55` | SR zone width default `0.5` | N | Y |
| `modules/BreakAndRetest.js:58` | minimum level tests default `2` | N | Y |
| `modules/BreakAndRetest.js:61` | swing lookback default `5` | N | Y |
| `modules/BreakAndRetest.js:65` | break confirmation percent default `0.15` | N | Y |
| `modules/BreakAndRetest.js:68` | breaker body ATR ratio default `0.4` | N | Y |
| `modules/BreakAndRetest.js:72` | retest zone percent default `0.3` | N | Y |
| `modules/BreakAndRetest.js:75` | max retest wait default `20` | N | Y |
| `modules/BreakAndRetest.js:89` | reward/risk ratio default `1.5` | N | Y |
| `modules/BreakAndRetest.js:601` | ATR helper period default `14` | N | Y |
| `modules/SmartMoneySweep.js:49` | volume profile days default `5` | Y | Y |
| `modules/SmartMoneySweep.js:50` | volume profile bins default `50` | Y | Y |
| `modules/SmartMoneySweep.js:51` | value area percent default `70` | Y | Y |
| `modules/SmartMoneySweep.js:56` | initial volume balance minutes default `30` | Y | Y |
| `modules/SmartMoneySweep.js:78` | SMS ATR length default `14` | Y | Y |
| `modules/SmartMoneySweep.js:84` | SMS max hold bars default `60` | Y | Y |
| `modules/SmartMoneySweep.js:85` | SMS max daily losses default `3` | Y | Y |
| `modules/SmartMoneySweep.js:112` | SMS debug direct env gate | N | Y |
| `modules/SmartMoneySweep.js:117` | VP lookback bars fallback `0` | Y | Y |
| `modules/MultiTimeframeAdapter.js:93` | base timeframe falls back to `1m` | Y | Y |
| `modules/MultiTimeframeAdapter.js:99` | active timeframe list falls back to six literals | Y | Y |
| `modules/MultiTimeframeAdapter.js:131` | min candles for MTF analysis defaults to `30` | Y | Y |
| `modules/LiquiditySweepDetector.js:69` | liquidity sweep weight values are required config | Y | N |
| `modules/LiquiditySweepDetector.js:78` | liquidity sweep ATR period defaults to `14` | Y | Y |
| `modules/LiquiditySweepDetector.js:79` | liquidity sweep entry window defaults to `90` minutes | Y | Y |
| `modules/LiquiditySweepDetector.js:80` | opening range minutes default `15` | Y | Y |
| `modules/LiquiditySweepDetector.js:84` | stop buffer percent default `0.05` | Y | Y |
| `modules/LiquiditySweepDetector.js:87` | sweep lookback bars default `20` | Y | Y |
| `modules/LiquiditySweepDetector.js:229` | `BACKTEST_VERBOSE` direct env diagnostic gate | N | N |
| `modules/OpeningRangeBreakout.js:122` | OR duration minutes required from config | Y | N |
| `modules/OpeningRangeBreakout.js:123` | OR min width ATR required from config | Y | N |
| `modules/OpeningRangeBreakout.js:134` | OR stop buffer percent required from config | Y | N |
| `modules/OpeningRangeBreakout.js:135` | OR target RR required from config | Y | N |
| `modules/PropSafeEMAPullback.js:101` | prop EMA ATR period normalized from required config | Y | N |
| `modules/PropSafeEMAPullback.js:111` | prop EMA confidence base normalized from required config | Y | N |
| `modules/EMATrendRetest.js:111` | EMA retest ATR period normalized from required config | Y | N |
| `modules/EMATrendRetest.js:118` | EMA retest confidence base normalized from required config | Y | N |
| `modules/RSI2MeanReversion.js:80` | RSI2 mean-reversion confidence base normalized from required config | Y | N |
| `modules/TimeSeriesMomentum.js:82` | time-series momentum lookback normalized from required config | Y | N |
| `modules/TimeSeriesMomentum.js:93` | TSM partial exit falls back to inline object | Y | Y |
| `modules/TimeSeriesMomentum.js:94` | TSM confidence base normalized from required config | Y | N |
| `brokers/AlpacaAdapter.js:26` | Alpaca stream bar timeframe hard constant `1m` | N | Y |
| `brokers/AlpacaAdapter.js:496` | Alpaca historical candle defaults timeframe `1m`, limit `100` | N | Y |
| `brokers/AlpacaAdapter.js:794` | unknown Alpaca interval falls back to `1m` interval | N | Y |
| `brokers/KrakenIBrokerAdapter.js:80` | Kraken health data timeout defaults to `60000ms` | N | Y |
| `brokers/KrakenIBrokerAdapter.js:296` | Kraken candles default timeframe `1m`, limit `100` | N | Y |
| `brokers/KrakenIBrokerAdapter.js:305` | unknown Kraken candle interval falls back to `1` minute | N | Y |
| `brokers/KrakenIBrokerAdapter.js:490` | Kraken minimum order size falls back to default minimum | N | Y |
| `brokers/GeminiAdapter.js:22` | Gemini credentials direct env fallback | N | Y |
| `brokers/GeminiAdapter.js:24` | Gemini sandbox direct env/literal fallback | N | Y |
| `brokers/GeminiAdapter.js:367` | Gemini candles default timeframe `1m`, limit `100` | N | Y |
| `brokers/GeminiAdapter.js:457` | Gemini minimum order size falls back to `0.001` | N | Y |
| `brokers/UpholdAdapter.js:22` | Uphold credentials direct env fallback | N | Y |
| `brokers/UpholdAdapter.js:25` | Uphold sandbox default `false` | N | Y |
| `brokers/UpholdAdapter.js:281` | Uphold candles default timeframe `1h`, limit `100` | N | Y |
| `brokers/UpholdAdapter.js:373` | Uphold minimum order size falls back to `$1` | N | Y |
| `brokers/SchwabAdapter.js:25` | Schwab credentials direct env fallback | N | Y |
| `brokers/SchwabAdapter.js:398` | Schwab candles default timeframe `1D`, limit `100` | N | Y |
| `brokers/SchwabAdapter.js:402` | Schwab candle period hardcoded `10` | N | Y |
| `brokers/SchwabAdapter.js:404` | Schwab non-1m/non-5m frequency falls back to `30` | N | Y |
| `brokers/CMEAdapter.js:23` | CME base URL fallback literal | N | Y |
| `brokers/CMEAdapter.js:25` | CME backend fallback `interactive-brokers` | N | Y |
| `brokers/CMEAdapter.js:177` | CME candles default timeframe `1m`, limit `100` | N | Y |
| `brokers/InteractiveBrokersAdapter.js:23` | IB base URL hard fallback to localhost | N | Y |
| `brokers/InteractiveBrokersAdapter.js:277` | IB candles default timeframe `1m`, limit `100` | N | Y |
| `brokers/InteractiveBrokersAdapter.js:459` | unknown IB timeframe falls back to `1min` | N | Y |
| `brokers/CoinbaseAdapter.js:281` | Coinbase candles default timeframe `1m`, limit `100` | N | Y |
| `brokers/CoinbaseAdapter.js:466` | unknown Coinbase granularity falls back to `60` seconds | N | Y |
| `brokers/BinanceAdapter.js:341` | Binance candles default timeframe `1m`, limit `100` | N | Y |
| `brokers/OandaAdapter.js:284` | Oanda candles default timeframe `M1`, limit `100` | N | Y |
| `brokers/TastyworksAdapter.js:289` | Tastyworks candles default timeframe `1m`, limit `100` | N | Y |

## Coverage Notes

- Rows above: 130
- Counted files searched: 272 JS runtime files for fallback/default/constant patterns; 276 JS/JSON files for `process.env`
- High-signal runtime rows include config loader, main entrypoint, orchestrator/trading loop, pattern memory, trailing exits, strategy modules, and broker adapters.
- Dashboard files, tools, and scripts were counted, but only sampled where directly adjacent to runtime/backtest/trading behavior.
- This report does not claim every fallback is a bug. It classifies current behavior-tuning surfaces by mechanical evidence.

## WHAT I DID DO

- Used `rg`/read-only inspection for the census.
- Created only `ogz-meta/inbox/codex/2026-08-16/config-truth-census-pass0.md`.
- Counted the broad candidate surface and made pass0 coverage explicit.
- Enumerated high-signal runtime behavior-tuning values with file:line evidence.

## WHAT I DID NOT DO

- I did not edit `core/`, `modules/`, `brokers/`, `foundation/`, `run-empire-v2.js`, config files, tests, package files, or runtime state.
- I did not run runtime commands, tests, backtests, PM2, Mercury, or any fix pipeline.
- I did not commit, stage, push, or change git state.
- I did not decide remediation priority or mark any row as a confirmed bug.

## WHAT I ASSUMED

- `config-owned=Y` can include values routed through `foundation/ConfigLoader.js` and `config/trading.config.json`, even if a downstream constructor still contains a fallback.
- `silent fallback=Y` means a literal/default can be substituted at that row without a fail-loud missing-value path.
- Pass0 means high-signal current runtime coverage with counted scope, not exhaustive hand-classification of all 1,705 `|| literal` matches.
