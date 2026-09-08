# STOP 1 — CONFIG SORT — every value the bot loads, where it comes from today, where it goes

Frozen tree `e54a8b8`. Fable's read, Sept 5 2026. Second independent read required per Trey's rule before any executor cuts.

## How the stack works today (ConfigLoader.js:1478-1537, 392-444, 485-527)

1. `.env` read first — the floor (`:1480`).
2. Process environment (= pm2 `ecosystem.config.js` stamps) overlays and wins (`:1481`).
3. `PROFILE` pinned from env or JSON default (`:549-558`).
4. Tuning profile, if named, overwrites everything (`:516-527`). Not active on the box.
5. Per value: env var if set, else `trading.config.json`, else a hardcoded default (`:392-396`).

Trey's words: one config, `.env` keys only, no silent overrides. Verdict: DIVERGES, BACKWARDS. Ruling Sept 4/5: two files — SETTINGS (anything a customer or Trey changes) and INTERNALS (static/system) — plus `.env` = keys + `PROFILE` only; loader refuses boot and names the key on any behavioral value found in env or the pm2 file.

## Counts

- DELETE (no reader): 23
- ENV: 9
- INTERNALS: 40
- INTERNALS (derive from PROFILE): 8
- SETTINGS: 104
- pm2 stamps total: 116; read only by the loader: 54; read by the loader AND directly by other code: 36; read directly only: 3; read by nobody: 23
- loader env-backed values total: 116; of those stamped by pm2: 48; not stamped (fall to `.env` or default): 68

Two independent reads already agree on the 23 dead stamps: Fable grep census (this file) and Amp's AST census `ogz-meta/inbox/amp/2026-08-28/env-census.md` (none of the 23 appear as referenced). `.env` contents are on the box and not visible here — the `.env` column is for Claude Code/Codex to fill (names only).

## Real direct readers of process.env in live code (outside the loader; doc/test/script hits excluded)

| Key | File:line | Note |
|---|---|---|
| EXECUTION_MODE, BACKTEST_MODE, CANDLE_SOURCE | core/SingletonLock.js:26-28 | lock-file naming |
| BACKTEST_MODE | core/TRAIDecisionModule.js:1029 | TrAI mode pick |
| BROKER, TRADING_PAIR | core/MultiAssetManager.js:40-52 | asset selection |
| BROKER, ASSET_CLASS, TRADING_PAIR | core/UnifiedPatternMemory.js:193-206 | **pattern-bank bucket** — file `unified-patterns.<mode>.<bucket>.json` (:210); throws at boot if class unknown |
| EXECUTION_MODE | ogzprime-ssl-server.js:1319 | dashboard |
| NODE_ENV, PAPER_TRADING | instrument.js:57 | Sentry env tag |
| BACKTEST_MODE, FEE_MAKER, FEE_TAKER, ENABLE_TRAI | run-empire-v2.js:1772-1778 | log lines only |

Amp's census lists more bypass readers in `server/`, `trai_brain/`, `tools/` — reconcile there for the full set.

## The sort

Columns: key | loader path | pm2 stamp value | who reads it | fallback if unset | proposed file. `.env` column omitted (box-only). Proposed file is Fable's proposal by category — Trey rules per category.

| Key | Loader path (ConfigLoader.js line) | pm2 stamp | Reader | Fallback | Proposed |
|---|---|---|---|---|---|
| `ABSOLUTE_POSITION_CAP` | — | 0.15 | LOADER+BYPASS | — | SETTINGS |
| `ACCOUNT_DRAWDOWN_PCT` | — | -3.0 | DEAD | — | DELETE (no reader) |
| `ALPACA_API_KEY` | broker.alpacaApiKey (:976) | — | loader only | '' | ENV |
| `ALPACA_API_SECRET` | broker.alpacaApiSecret (:977) | — | loader only | '' | ENV |
| `ALPACA_MODE` | broker.alpacaMode (:978) | paper | LOADER+BYPASS | '' | INTERNALS (derive from PROFILE) |
| `ALPACA_SYMBOLS` | broker.alpacaSymbols (:979) | TSLA,NVDA,COIN,MARA,RIOT | LOADER+BYPASS | '' | SETTINGS |
| `ASSET_CLASS` | broker.assetClass (:983) | stocks | LOADER+BYPASS | _isKraken ? 'crypto' : 'stocks' | SETTINGS |
| `ATR_CONTRACTS_ENABLED` | strategyBehavior.atrContracts.enabled (:838) | — | loader only | JSON else false | SETTINGS |
| `ATR_FILTER_ENABLED` | filters.atrEnabled (:907) | true | LOADER+BYPASS | JSON required | SETTINGS |
| `ATR_MIN_PERCENT` | filters.atrMinPercent (:908) | 0.40 | LOADER | JSON required | SETTINGS |
| `ATR_STOP_MULTIPLIER` | strategyBehavior.atrContracts.stopMultiplier (:839) | — | loader only | JSON else 2.0 | SETTINGS |
| `ATR_TRAILING_ACTIVATION_R` | strategyBehavior.atrContracts.trailingActivationR (:841) | — | loader only | JSON else 1.0 | SETTINGS |
| `ATR_TRAIL_MULTIPLIER` | strategyBehavior.atrContracts.trailMultiplier (:840) | — | loader only | JSON else 2.0 | SETTINGS |
| `BACKTEST_FAST` | backtest.fast (:732) | — | loader only | false | INTERNALS |
| `BACKTEST_MODE` | — | false | LOADER+BYPASS | — | INTERNALS (derive from PROFILE) |
| `BACKTEST_NO_PATTERN_SAVE` | backtest.noPatternSave (:733) | — | loader only | false | INTERNALS |
| `BACKTEST_SILENT` | backtest.silent (:730) | — | loader only | false | INTERNALS |
| `BACKTEST_VERBOSE` | backtest.verbose (:731) | — | loader only | false | INTERNALS |
| `BASE_POSITION_PCT` | — | 0.01 | LOADER | — | SETTINGS |
| `BASE_POSITION_SIZE` | sizing.basePositionSize (:787) | 0.01 | LOADER+BYPASS | 0.01 | SETTINGS |
| `BE_SCALEOUT_ENABLED` | exitLogic.beScaleOut.enabled (:802) | — | loader only | JSON else true | SETTINGS |
| `BE_SCALEOUT_FEE_BUFFER` | exitLogic.beScaleOut.feeBufferPercent (:806) | — | loader only | JSON else 0.05 | SETTINGS |
| `BE_SCALEOUT_FRACTION` | exitLogic.beScaleOut.scaleOutFraction (:805) | — | loader only | JSON else 0.5 | SETTINGS |
| `BE_SCALEOUT_TRIGGER` | exitLogic.beScaleOut.triggerType (:803) | — | loader only | JSON else 'one_to_one_r' | SETTINGS |
| `BE_SCALEOUT_TRIGGER_PCT` | exitLogic.beScaleOut.fixedPercentTrigger (:804) | — | loader only | JSON else 0.5 | SETTINGS |
| `BOOT_REST_HYDRATION_LIMIT` | dataFeed.bootRestHydrationLimit (:761) | 60 | LOADER | 60 | INTERNALS |
| `BOT_TIER` | misc.botTier (:1055) | — | loader only | 'ml' | INTERNALS |
| `BROKER` | — | alpaca | LOADER+BYPASS | — | SETTINGS |
| `BROKER_ACCOUNT_ID` | broker.accountId (:984) | — | loader only | 'default' | INTERNALS |
| `CANDLE_DATA_FILE` | backtest.candleDataFile (:727) | — | loader only | '' | INTERNALS |
| `CANDLE_FILE` | backtest.candleFile (:728) | — | loader only | '' | INTERNALS |
| `CANDLE_SOURCE` | mode.candleSource (:720) | live | LOADER+BYPASS | 'websocket' | INTERNALS (derive from PROFILE) |
| `CANDLE_TIMEFRAME` | broker.candleTimeframe (:981) | 15m | LOADER+BYPASS | '15m' | SETTINGS |
| `CONFIRM_LIVE_TRADING` | — | false | LOADER+BYPASS | — | INTERNALS (derive from PROFILE) |
| `DASHBOARD_BROKER_STATUS_DEDUPE_MAX_KEYS` | dashboard.brokerStatusDedupeMaxKeys (:1049) | — | loader only | 200 | INTERNALS |
| `DASHBOARD_EDGE_ANALYTICS_MAX_SCOPES` | dashboard.edgeAnalyticsMaxScopes (:1050) | — | loader only | 200 | INTERNALS |
| `DASHBOARD_ERROR_EVENT_DEDUPE_MAX_KEYS` | dashboard.errorEventDedupeMaxKeys (:1048) | — | loader only | 200 | INTERNALS |
| `DASHBOARD_ERROR_EVENT_DEDUPE_MS` | dashboard.errorEventDedupeMs (:1046) | — | loader only | 5000 | INTERNALS |
| `DASHBOARD_ERROR_EVENT_MESSAGE_MAX_LENGTH` | dashboard.errorEventMessageMaxLength (:1047) | — | loader only | 500 | INTERNALS |
| `DIRECTION_FILTER` | — | both | LOADER+BYPASS | — | SETTINGS |
| `DOTENV_CONFIG_PATH` | paths.envFile (:740) | — | loader only | '.env' | ENV |
| `ENABLE_BREAKRETEST` | — | true | DEAD | — | DELETE (no reader) |
| `ENABLE_DASHBOARD` | strategies.enableDashboard (:1029) | true | LOADER+BYPASS | true | SETTINGS |
| `ENABLE_DONCHIAN` | — | true | LOADER | — | SETTINGS |
| `ENABLE_DYNAMIC_SIZING` | — | true | LOADER+BYPASS | — | SETTINGS |
| `ENABLE_EMA_TREND_RETEST` | — | true | LOADER | — | SETTINGS |
| `ENABLE_MTF` | — | true | BYPASS | — | SETTINGS |
| `ENABLE_MTF_CONFLUENCE_BOOSTER` | — | true | DEAD | — | DELETE (no reader) |
| `ENABLE_NOWICK` | — | true | DEAD | — | DELETE (no reader) |
| `ENABLE_ORB` | — | true | DEAD | — | DELETE (no reader) |
| `ENABLE_PROPSAFE_EMA` | — | true | LOADER | — | SETTINGS |
| `ENABLE_RSI2_MR` | — | true | LOADER | — | SETTINGS |
| `ENABLE_SMS` | — | true | BYPASS | — | SETTINGS |
| `ENABLE_STRATEGY_MTF_CONFLUENCE` | — | true | DEAD | — | DELETE (no reader) |
| `ENABLE_TRAI` | trai.enabled (:999) | true | LOADER+BYPASS | true | SETTINGS |
| `ENABLE_TSMOM` | — | true | LOADER | — | SETTINGS |
| `ENTRY_CONSISTENCY_CAP_BUFFER` | — | 0.98 | LOADER | — | SETTINGS |
| `ENTRY_DAILY_LOSS_RISK_FRACTION` | — | 1.0 | LOADER | — | SETTINGS |
| `ENTRY_MAX_STOCK_NOTIONAL` | — | 5000 | LOADER | — | SETTINGS |
| `ENTRY_MAX_STOCK_SHARES` | — | 0 | LOADER | — | SETTINGS |
| `ENTRY_MIN_STOCK_SHARES` | — | 2 | LOADER | — | SETTINGS |
| `ENTRY_STOCK_SHARE_RANGE_ENABLED` | — | true | LOADER | — | SETTINGS |
| `EVAL_RULES_ENABLED` | — | true | DEAD | — | DELETE (no reader) |
| `EVAL_TRACE_BACKTEST` | observability.evalTraceBacktest (:755) | — | loader only | false | INTERNALS |
| `EVAL_TRACE_ENABLED` | observability.evalTraceEnabled (:754) | — | loader only | true | INTERNALS |
| `EXECUTION_MODE` | — | paper | LOADER+BYPASS | — | INTERNALS (derive from PROFILE) |
| `EXIT_SYSTEM` | exits.exitSystem (:862) | legacy | LOADER+BYPASS | 'maxprofit' | SETTINGS |
| `FAST_BACKTEST` | backtest.fastBacktest (:734) | — | loader only | false | INTERNALS |
| `FEE_MAKER` | — | 0 | LOADER+BYPASS | — | SETTINGS |
| `FEE_MIN_ORDER` | fees.minOrderFee (:880) | 0.75 | LOADER | 0 | SETTINGS |
| `FEE_MODEL` | fees.model (:875) | per_share_minimum | LOADER+BYPASS | 'percent' | SETTINGS |
| `FEE_PER_SHARE` | fees.perShare (:879) | 0.005 | LOADER | 0 | SETTINGS |
| `FEE_SLIPPAGE` | — | 0.0005 | LOADER+BYPASS | — | SETTINGS |
| `FEE_TAKER` | — | 0 | LOADER+BYPASS | — | SETTINGS |
| `FINAL_TARGET` | tiers.final (:870) | 0.025 | LOADER+BYPASS | 0.025 | SETTINGS |
| `FRESH_START` | backtest.freshStart (:735) | — | loader only | false | INTERNALS |
| `GAP_BACKFILL_BUFFER_CANDLES` | dataFeed.gapBackfillBufferCandles (:772) | 5 | LOADER | 5 | INTERNALS |
| `GAP_BACKFILL_RETRY_DELAY_MS` | dataFeed.gapBackfillRetryDelayMs (:774) | 60000 | LOADER | 60000 | INTERNALS |
| `GAP_RECOVERY_CLEAN_CANDLES_REQUIRED` | dataFeed.gapRecoveryCleanCandlesRequired (:773) | 3 | LOADER | 3 | INTERNALS |
| `GAP_THRESHOLD_MULTIPLIER` | dataFeed.gapThresholdMultiplier (:771) | 1.5 | LOADER | 1.5 | INTERNALS |
| `INITIAL_BALANCE` | backtest.initialBalance (:729) | — | loader only | 10000 | SETTINGS |
| `JOURNAL_DATA_DIR` | — | /opt/ogzprime/OGZPMLV2/data/journal | LOADER | — | INTERNALS |
| `KRAKEN_API_KEY` | broker.apiKey (:974) | — | loader only | '' | ENV |
| `KRAKEN_API_SECRET` | broker.apiSecret (:975) | — | loader only | '' | ENV |
| `LIVENESS_ACTIVE_TIMEFRAME_MULTIPLIER` | dataFeed.activeTimeframeMultiplier (:765) | 1.5 | LOADER | 1.5 | INTERNALS |
| `LIVENESS_ACTIVE_TIMEFRAME_SLACK_MS` | dataFeed.activeTimeframeSlackMs (:766) | 60000 | LOADER | 60000 | INTERNALS |
| `LIVENESS_BACKFILL_LIMIT` | dataFeed.livenessBackfillLimit (:762) | 10 | LOADER | 10 | INTERNALS |
| `LIVENESS_CHECK_INTERVAL_MS` | dataFeed.livenessCheckIntervalMs (:763) | 60000 | LOADER | 60000 | INTERNALS |
| `LIVENESS_EXPECTED_QUIET_LOG_INTERVAL_MS` | dataFeed.expectedQuietLogIntervalMs (:775) | 300000 | LOADER | 300000 | INTERNALS |
| `LIVENESS_MAX_BACKFILL_AGE_MULTIPLIER` | dataFeed.maxBackfillAgeMultiplier (:767) | 2 | LOADER | 2 | INTERNALS |
| `LIVENESS_MAX_BACKFILL_AGE_SLACK_MS` | dataFeed.maxBackfillAgeSlackMs (:768) | 60000 | LOADER | 60000 | INTERNALS |
| `LIVENESS_MAX_DATA_SILENCE_MS` | dataFeed.maxDataSilenceMs (:764) | 120000 | LOADER | 120000 | INTERNALS |
| `LIVE_TRADING` | — | false | LOADER+BYPASS | — | INTERNALS (derive from PROFILE) |
| `MASR_MTF_1H_TREND_CONFLICT_MULT` | — | 0.95 | LOADER | — | SETTINGS |
| `MAX_CONFIDENCE` | confidence.maxConfidence (:782) | — | loader only | JSON required | SETTINGS |
| `MAX_HOLD_MINUTES` | exits.maxHoldMinutes (:861) | — | loader only | 240 | SETTINGS |
| `MAX_POSITIONS` | sizing.maxPositions (:789) | — | loader only | 3 | SETTINGS |
| `MAX_POSITION_PCT` | — | 0.05 | LOADER | — | SETTINGS |
| `MAX_POSITION_SIZE_PCT` | sizing.maxPositionSize (:788) | 0.05 | LOADER+BYPASS | 0.05 | SETTINGS |
| `MIN_STRATEGY_CONFIDENCE` | confidence.minStrategyConfidence (:781) | — | loader only | JSON required | SETTINGS |
| `MIN_TRADE_CONFIDENCE` | — | 0.5 | LOADER+BYPASS | — | SETTINGS |
| `MTF_BOOSTER_BOOST_MTF_CANDIDATE` | — | false | DEAD | — | DELETE (no reader) |
| `MTF_BOOSTER_CONFLICT_MULT` | — | 0.88 | DEAD | — | DELETE (no reader) |
| `MTF_BOOSTER_MAX_MULT` | — | 1.15 | DEAD | — | DELETE (no reader) |
| `MTF_BOOSTER_MIN_CONFIDENCE` | — | 0.45 | DEAD | — | DELETE (no reader) |
| `MTF_BOOSTER_MIN_SCORE` | — | 0.30 | DEAD | — | DELETE (no reader) |
| `MTF_BOOSTER_PENALIZE_CONFLICTS` | — | true | DEAD | — | DELETE (no reader) |
| `MTF_BOOSTER_STRENGTH_MULT` | — | 0.20 | DEAD | — | DELETE (no reader) |
| `MTF_MISSING_HIGHER_TF_MULT` | — | 1.00 | DEAD | — | DELETE (no reader) |
| `MTF_TIMEFRAMES` | orchestrator.mtfTimeframes (:846) | — | loader only | JSON else ['1m', '5m', '15m', '1h', '4h'] | SETTINGS |
| `NODE_ENV` | — | production | LOADER+BYPASS | — | ENV |
| `PAPER_TRADING` | — | true | LOADER+BYPASS | — | INTERNALS (derive from PROFILE) |
| `PRIMARY_ASSET` | — | TSLA | BYPASS | — | SETTINGS |
| `PROFILE` | — | paper | LOADER+BYPASS | — | ENV |
| `RSI_MTF_4H_TREND_CONFLICT_MULT` | — | 0.95 | LOADER | — | SETTINGS |
| `SENTRY_DSN` | monitoring.sentryDsn (:748) | — | loader only | '' | ENV |
| `SENTRY_ENABLED` | monitoring.sentryEnabled (:749) | — | loader only | true | INTERNALS |
| `SIGNALSTACK_WEBHOOK_URL` | webhookOrders.webhookUrl (:992) | — | loader only | '' | ENV |
| `STALE_DATA_MAX_AGE_MS` | dataFeed.staleDataMaxAgeMs (:769) | 120000 | LOADER | 120000 | INTERNALS |
| `STALE_DATA_RECOVERY_AGE_MS` | dataFeed.staleDataRecoveryAgeMs (:770) | 30000 | LOADER | 30000 | INTERNALS |
| `STATE_FILE` | paths.stateFile (:741) | data/state-paper.json | LOADER | '' | INTERNALS (derive from PROFILE) |
| `STOP_LOSS_PERCENT` | exits.stopLossPercent (:857) | — | loader only | JSON required | SETTINGS |
| `SUBSCRIPTION_TIER` | misc.subscriptionTier (:1058) | — | loader only | 'ML' | INTERNALS |
| `SYMBOL_LOSS_COOLDOWN_CONSECUTIVE_LOSSES` | entryLogic.symbolLossCooldown.consecutiveLosses (:795) | 2 | LOADER | JSON entryLogic?.symbolLossCooldown?.consecutiveLosses || 2 | SETTINGS |
| `SYMBOL_LOSS_COOLDOWN_ENABLED` | entryLogic.symbolLossCooldown.enabled (:794) | true | LOADER | JSON entryLogic?.symbolLossCooldown?.enabled === true | SETTINGS |
| `SYMBOL_LOSS_COOLDOWN_MINUTES` | entryLogic.symbolLossCooldown.cooldownMinutes (:796) | 120 | LOADER | JSON entryLogic?.symbolLossCooldown?.cooldownMinutes || 120 | SETTINGS |
| `TAKE_PROFIT_PERCENT` | exits.takeProfitPercent (:858) | — | loader only | JSON required | SETTINGS |
| `TIER1_EXIT_FRACTION` | exitLogic.tieredExit.tier1ExitFraction (:810) | 0.30 | LOADER | JSON else 0.3 | SETTINGS |
| `TIER1_TARGET` | tiers.tier1 (:867) | 0.007 | LOADER+BYPASS | 0.007 | SETTINGS |
| `TIER2_EXIT_FRACTION` | exitLogic.tieredExit.tier2ExitFraction (:811) | 0.30 | LOADER | JSON else 0.3 | SETTINGS |
| `TIER2_TARGET` | tiers.tier2 (:868) | 0.010 | LOADER+BYPASS | 0.010 | SETTINGS |
| `TIER3_EXIT_FRACTION` | exitLogic.tieredExit.tier3ExitFraction (:812) | 0.20 | LOADER | JSON else 0.2 | SETTINGS |
| `TIER3_TARGET` | tiers.tier3 (:869) | 0.015 | LOADER+BYPASS | 0.015 | SETTINGS |
| `TIERED_EXIT_ENABLED` | exitLogic.tieredExit.enabled (:809) | — | loader only | JSON else true | SETTINGS |
| `TIER_HIGH_CONF_MULT` | exitLogic.tieredExit.highConfidenceMultiplier (:817) | — | loader only | JSON else 1.2 | SETTINGS |
| `TIER_HIGH_CONF_THRESHOLD` | exitLogic.tieredExit.highConfidenceThreshold (:816) | — | loader only | JSON else 0.8 | SETTINGS |
| `TIER_LOW_CONF_MULT` | exitLogic.tieredExit.lowConfidenceMultiplier (:819) | — | loader only | JSON else 0.8 | SETTINGS |
| `TIER_LOW_CONF_THRESHOLD` | exitLogic.tieredExit.lowConfidenceThreshold (:818) | — | loader only | JSON else 0.6 | SETTINGS |
| `TIER_MARKET_ADAPTATION_ENABLED` | exitLogic.tieredExit.enableMarketAdaptation (:813) | — | loader only | JSON else true | SETTINGS |
| `TIER_RANGE_MULT` | exitLogic.tieredExit.rangingTargetMultiplier (:815) | — | loader only | JSON else 0.8 | SETTINGS |
| `TIER_TREND_MULT` | exitLogic.tieredExit.trendingTargetMultiplier (:814) | — | loader only | JSON else 1.3 | SETTINGS |
| `TRACE_EVENT_MAX_BUFFERED_BYTES` | observability.traceEventMaxBufferedBytes (:756) | — | loader only | 1048576 | INTERNALS |
| `TRADE_INTELLIGENCE_SHADOW` | misc.tradeIntelligenceShadow (:1057) | — | loader only | false | INTERNALS |
| `TRADING_INTERVAL` | broker.tradingInterval (:982) | — | loader only | 15000 | INTERNALS |
| `TRADING_PAIR` | broker.tradingPair (:980) | TSLA | LOADER+BYPASS | _isKraken ? 'BTC-USD' : 'TSLA' | SETTINGS |
| `TRADING_PROFILE` | misc.tradingProfile (:1056) | — | loader only | 'balanced' | SETTINGS |
| `TRAILING_ACTIVATION` | exits.trailingActivation (:860) | — | loader only | JSON required | SETTINGS |
| `TRAILING_STOP_PERCENT` | exits.trailingStopPercent (:859) | — | loader only | JSON required | SETTINGS |
| `TRAIL_ATR_MULTIPLIER` | trail.atrMultiplier (:956) | — | loader only | 2.0 | SETTINGS |
| `TRAIL_MIN_ACTIVATION` | trail.minActivation (:957) | — | loader only | 1.5 | SETTINGS |
| `TRAIL_STRUCTURE_TIGHTEN` | trail.structureTighten (:959) | — | loader only | 0.5 | SETTINGS |
| `TRAIL_TREND_WIDEN` | trail.trendWiden (:958) | — | loader only | 1.5 | SETTINGS |
| `TRAI_ENABLE_BACKTEST` | trai.enableBacktest (:1006) | true | LOADER+BYPASS | false | SETTINGS |
| `TRAI_MAX_CONF` | trai.maxConf (:1005) | — | loader only | 0.95 | SETTINGS |
| `TRAI_MAX_RISK` | trai.maxRisk (:1003) | — | loader only | 0.03 | SETTINGS |
| `TRAI_MIN_CONF` | trai.minConf (:1004) | — | loader only | 0.40 | SETTINGS |
| `TRAI_MODE` | trai.mode (:1000) | passive | LOADER+BYPASS | 'passive' | SETTINGS |
| `TRAI_VETO` | trai.vetoPower (:1002) | false | LOADER+BYPASS | false | SETTINGS |
| `TRAI_WEIGHT` | trai.weight (:1001) | 0.2 | LOADER+BYPASS | 0.2 | SETTINGS |
| `TREND_REGIME_GATE_ENABLED` | strategyBehavior.trendRegimeGate.enabled (:830) | — | loader only | JSON else false | SETTINGS |
| `TREND_REGIME_GATE_MIN_CONFIDENCE` | strategyBehavior.trendRegimeGate.minConfidence (:831) | — | loader only | JSON else 0.25 | SETTINGS |
| `TTP_ACCOUNT_LIMITS_ENABLED` | — | true | LOADER | — | SETTINGS |
| `TTP_BLOCK_ENTRIES_AFTER_CUTOFF` | — | true | DEAD | — | DELETE (no reader) |
| `TTP_CONSISTENCY_ENABLED` | — | true | LOADER | — | SETTINGS |
| `TTP_CONSISTENCY_MAX_POSITION_PROFIT_RATIO` | — | 0.30 | LOADER | — | SETTINGS |
| `TTP_DAILY_LOSS_PAUSE_ENABLED` | — | true | DEAD | — | DELETE (no reader) |
| `TTP_EARNINGS_BLOCK_ENTRIES` | — | true | LOADER | — | SETTINGS |
| `TTP_EARNINGS_RESTRICTION_ENABLED` | — | true | LOADER | — | SETTINGS |
| `TTP_ENTRY_BUFFER_MINUTES_BEFORE_CUTOFF` | — | 30 | LOADER | — | SETTINGS |
| `TTP_LIQUIDATION_ENABLED` | — | true | DEAD | — | DELETE (no reader) |
| `TTP_LIQUIDATION_MINUTES_BEFORE_CLOSE` | — | 10 | LOADER | — | SETTINGS |
| `TTP_MARKET_TIME_ENABLED` | — | true | DEAD | — | DELETE (no reader) |
| `TTP_MAX_LOSS_ENABLED` | — | true | DEAD | — | DELETE (no reader) |
| `TTP_MAX_PROFIT_TARGET_INITIAL_BALANCE_RATIO` | — | 0.06 | LOADER | — | SETTINGS |
| `TTP_RULES_ENABLED` | — | true | DEAD | — | DELETE (no reader) |
| `TTP_VOLUME_CAP_ENABLED` | — | true | DEAD | — | DELETE (no reader) |
| `TTP_VOLUME_CAP_FALLBACK_TO_RECENT` | — | false | DEAD | — | DELETE (no reader) |
| `TTP_VOLUME_CAP_MAX_REFERENCE_AGE_MS` | — | 180000 | LOADER | — | SETTINGS |
| `TTP_VOLUME_CAP_PERCENT` | — | 0.05 | LOADER | — | SETTINGS |
| `TTP_VOLUME_CAP_TIMEFRAME` | — | 1m | LOADER | — | SETTINGS |
| `WEBHOOK_DRY_RUN` | webhookOrders.dryRun (:991) | — | loader only | true | SETTINGS |
| `WEBHOOK_ORDERS_ENABLED` | webhookOrders.enabled (:990) | — | loader only | false | SETTINGS |
| `WEBHOOK_ORDER_LOG_CAP` | webhookOrders.orderLogCap (:994) | 500 | LOADER | 500 | INTERNALS |
| `WEBHOOK_TIMEOUT_MS` | webhookOrders.timeoutMs (:993) | 5000 | LOADER | 5000 | INTERNALS |

## Flags from this read (stop-1 findings, not fixes)

1. **23 dead pm2 stamps** — set every boot, read by nobody: `ACCOUNT_DRAWDOWN_PCT` (Part C deleted its reader), 9 `TTP_*_ENABLED` flags + `EVAL_RULES_ENABLED` (the TTP chain now reads `trading.config.json`, so the pm2 file claims a switch it no longer holds), 10 `MTF_BOOSTER_*`/`ENABLE_*MTF*` knobs (the booster is not configured by these; whether it exists at all is a stop-3 question), 3 strategy enables `ENABLE_BREAKRETEST/NOWICK/ORB` (no reader — those strategies are not switchable from here).
2. **Duplicate names for the same idea**: `BASE_POSITION_SIZE` and `BASE_POSITION_PCT`; `MAX_POSITION_SIZE_PCT` and `MAX_POSITION_PCT`. Both stamped. Which one the sizer honors is a stop-4 read.
3. **`EXIT_SYSTEM`**: loader default `maxprofit` (:862), pm2 stamps `legacy`, pm2 wins. So the running bot is on the legacy exit system by override. Stop 6.
4. **TrAI**: pm2 stamps `ENABLE_TRAI=true`, `TRAI_MODE=passive`, `TRAI_ENABLE_BACKTEST=true`. Trey's spec says TrAI has been turned off the entire time. Env says on-passive. Stop 10.
5. **Mode flags**: `EXECUTION_MODE`, `PAPER_TRADING`, `LIVE_TRADING`, `CONFIRM_LIVE_TRADING`, `BACKTEST_MODE`, `ALPACA_MODE`, `CANDLE_SOURCE`, `STATE_FILE` are eight separate stamps that all mean 'paper'. One `PROFILE` should derive all eight. Today they can disagree.
6. **Pattern bank bucket** is chosen from direct env reads (`ASSET_CLASS`/`BROKER`) and the file name carries `<mode>.<bucket>` — the five-bank shape Trey ruled exists by filename. Whether `mode` separates paper/live/backtest correctly is stop 9.
7. **Only one env-override refusal exists** (`confidence.minTradeConfidence`, live only, :3775). The general refusal Trey ruled July 10 is not in the code.
8. **The pm2 file reads `.env` for account/TTP values** (`ecosystem.config.js:16-35`) and re-stamps them — a second path from `.env` into the process, bypassing the loader's source tracking for those keys.

## Third behavioral config file the sort missed: `config/features.json`

Found via the April `CONFIG-FINGERPRINT-REGISTRY.md` / `ENV-VAR-AUDIT.md` leads, verified at e54a8b8. 73 values (19 toggles + 54 settings) across 17 feature blocks. Read directly by `core/FeatureFlagManager.js:113` (`require` of the file path), NOT through ConfigLoader — so none of these appear in the loader's source tracking or the boot config proof. Consumers: `core/PositionSizer.js:18-20`, `core/TradingLoop.js:27`, `core/OgzTpoIntegration.js:28`, `TierFeatureFlags.js`.

| Block | Values | Notes / where it collides |
|---|---|---|
| EXIT_SYSTEM | enabled=true, activeSystem=**maxprofit**, hardStopAlwaysOn=true, hardStopPercent=-1.5 | Third definition of the exit system: pm2 says `legacy`, loader default says `maxprofit`, this file says `maxprofit`. Which one the code honors is stop 6. A -1.5% hard stop "always on" is not in Trey's spec. |
| PATTERN_BASED_SIZING | enabled=true, min 0.75, max **1.5**, requiredSamples 5 | Trey's "1.5x on a proven setup" exists here as a claim. Stop 4/9. |
| PATTERN_DOMINANCE | enabled=**false**, elite/proven/weak thresholds, size multipliers 1.5/1.2/0.75 | Disabled. Overlaps PATTERN_BASED_SIZING. |
| PATTERN_MEMORY_PARTITION | enabled=true, live/paper/backtest → `pattern_memory.<mode>.json`, backtestPersist=false | **Second pattern-bank naming scheme.** UnifiedPatternMemory writes `unified-patterns.<mode>.<bucket>.json` (UnifiedPatternMemory.js:210). Two bank systems or one dead one — stop 9. |
| PATTERN_EXIT_MODEL | enabled=true, shadowMode=true, 7 settings | Shadow. Stop 6. |
| PAPER_TRADING | enabled=true | A **ninth** flag that means "paper." |
| CIRCUIT_BREAKER | enabled=true, maxErrors 5, resetTimeMs 300000 | Something that stops on errors. Trey's law: nothing stops the bot. Stop 8 must read what it actually does. |
| TRAI_INFERENCE | enabled=**false** | vs pm2 `ENABLE_TRAI=true`. Stop 10. |
| AGGRESSIVE_LEARNING_MODE | enabled=false, positionSizeMultiplier 2.0, minConfidenceThreshold 20 | OrderExecutor.js:19 says this was deleted in a Phase 4 rewrite; the block is still here. Dead-candidate. |
| MA_EXTENSION_FILTER | enabled=false, shadow, 7 settings | |
| ML_ENHANCED_SIGNALS, ADVANCED_INDICATORS, ML_VOLUME_ANALYSIS, OGZ_TPO | enabled=true, indicator periods and weights (voteWeight 0.35) | Confidence-math inputs. Stop 3. |
| WEBSOCKET_DASHBOARD, BACKTEST_API | enabled=true | |

**Proposed:** toggles and their settings → SETTINGS (they are exactly what a user flips); tier scaling in `TierFeatureFlags.js` → INTERNALS; the file itself is deleted once its rows live in the two files, and FeatureFlagManager reads through ConfigLoader. Counts in the header do not yet include these 73; the sort total becomes 257.

## Also checked from the April docs (leads, verified at e54a8b8)

- `core/TradingConfig.js` (the "two-config-loader problem," ENV-VAR-AUDIT item 4): **gone**. Zero live requires. Resolved.
- Per-strategy locked exit contracts now live in `config/trading.config.json:1254` and are read via ConfigLoader (`ExitContractManager.js:253-258`). One file for those. Good.
- `config/snapshots/` (the "Phase 6 manifest" the fingerprint registry says superseded it): scaffold only, `.gitkeep` + README, **no code writes it**. The registry points at a thing that doesn't exist.
- `nearestStructure never populated` (registry known-issue 8, April): DynamicTrailingStop's structure tightening had no data feeding it. Trey's exit style B depends on exactly that. Lead for stop 6, unverified at e54a8b8.
- `CLAUDE.md`: stale door — "work on main," routine `git push --force` command, required reading pointed at `ogz-meta/ledger/` (ruled contaminated), P0 as law. Docs truth-up.

## Slice 4 — `trading.config.json` read against the spec (Sept 5)

Coverage: 31 sections / 1,692 values. Read in full: confidence, risk, authFailureGuard, positionSizing, exits, exitLogic, entryLogic, orchestrator, pipeline, trai, patternMemory, holdTimes, fees, filters, timeframeConfig, universalLimits, fundTarget, startingBalance, features, scalper, strategyBehavior (≈330 values) + launchProfiles.paper (82 values) with production and backtest-trey-spec diffed. Not read value-by-value: strategies (313), exitContracts (301), tuningProfiles (102), regimeBoosts/volumeProfileBoosts/regimeMultipliers/pid/profiles/feeProfiles (≈120) — deferred to stops 3/4/6.

**Correction to the source list:** six sources, not three — `.env`; pm2 env stamps; `trading.config.json` base values; `trading.config.json` **launchProfiles** (profile-only values, read via `requiredLaunchProfile*`, NOT overridable by env — e.g. `pipeline.directionFilter`, `sessionRouter.*`, `venueGuards.*`, `risk.guardMode`, `confluence.*`); `config/features.json`; hardcoded code defaults. `mode.*` (paper/live/backtest/confirmLive) is already derived from the launch profile's `mode` (`ConfigLoader.js:688-718`) — PROFILE→mode exists; the eight mode stamps are decoration plus three direct readers (`SingletonLock.js:26-28`, `BotStateFrame.js`, `instrument.js:57`).

| Trey's words say | Code does (file:line) | Class |
|---|---|---|
| Both directions | `launchProfiles.paper.pipeline.directionFilter = "long_only"`; read only from the launch profile (`ConfigLoader.js:1041`); enforced `TradingLoop.js:692` (blocks every sell entry). pm2 `DIRECTION_FILTER=both` has no live reader. Only `backtest-trey-spec` says `both`. | **BACKWARDS** — the paper bot is long-only |
| Up to 8 assets open, one per asset | `positionSizing.maxPositions = 3`; `pipeline.positionMode = "single"` | DIFFERENT (who honors which: stop 4) |
| One trade per asset, no hedging | `features.enableHedging = true` (inside trading.config.json — a 4th toggle surface); reader unknown | BACKWARDS as written |
| 5% normal / 7.5% boosted / 25% total out | `positionSizing`: base 1%, max 5%; `entryLogic.sizing`: base 1%, max 5%, absoluteCap 15%; multipliers stack: confidence curve → 2.5x, confluence → 2x (two different tables: `{1,1.5,2,2.5}` vs `[1,1,1.25,1.5,1.75,2]`), volatility 0.4–1.5x; pattern multipliers all 1.0 | DIFFERENT + duplicated block |
| Two exit styles, one per strategy, twin-run | `exitLogic.beScaleOut` ON (= style A: sell half at 1R); `exitLogic.trail` ON with `structureTightenMultiplier 0.5` (= style B); ALSO ON: tieredExit, profitFloor (4 tiers), reversalDetection (exitFraction 1), legacy `exits.*` block, `timeframeConfig` per-TF SL/TP/maxHold, per-strategy `exitContracts`; pm2 `EXIT_SYSTEM=legacy` = features.json "all systems active, NOT RECOMMENDED" | DIFFERENT — everything on at once (stop 6) |
| Let winners ride | max hold in 4 places: `holdTimes.defaultMaxHold 180`, `exits.maxHoldMinutes` (loader default 240), `timeframeConfig.*.maxHoldMin`, `exitContracts.*.maxHoldTimeMinutes`; `holdTimes.tighteningSchedule` squeezes trail by age (disabled: `enableTimeBasedAdjustments=false`) | EXTRA |
| Losses → warnings only | `entryLogic.symbolLossCooldown`: 2 losses → 120 min no entries on that symbol. JSON `enabled=false`, pm2 stamps `true`, pm2 wins → ON today. Entered July 2 (`25b4490`) with eval work; reader `StateManager.js:1676, :3973-3979` | **RULED Sept 6 (Trey): "none" — delete everywhere, eval included.** Stop-1 boundary packet: stamp, JSON block, reader |
| TrAI on | `pipeline.enableTRAI=true`, `trai.enabled=true`, `trai.llm.provider=mercury`, key `INCEPTION_API_KEY`; Mercury account inactive since Aug 28; failed init is swallowed (`run-empire-v2.js:1841-1849`) | mechanism candidate for "off the whole time" (stop 10) |
| Auto-switch crypto↔stocks | `launchProfiles.paper.sessionRouter.mode="static"`, `staticSession="stocks"`, `forceCloseOnSessionEnd=true`, `cryptoSymbols=[BTC-USD]` | the switch has never run on paper (stop 8) |
| Entry floor? | `confidence.minTradeConfidence=0.5`, `minStrategyConfidence=0.35`, `confluenceMinScore=0.3`, `regimeMinConfidence=0.3`, `candlePatternMinConfidence=0.7` | code's answer: 50% trades today |
| Paper: eval guards off | `launchProfiles.paper.venueGuards.ttp.enabled=false` but every child guard `enabled=true` underneath (volumeCap, marketTime cutoff 10m/buffer 30m, accountLimits dailyLoss $50 / maxLoss equity 4850, earnings, consistency); `production` flips master to true + `risk.guardMode=venueRailBuffer` | whether master=false disables children: stop 4 |
| — | `universalLimits = {}` (empty section); `pipeline.candleFile="tuning/full-45k.json"` in live base; `features.enableArbitrage=true` (reader unknown); `fundTarget=25000`, `startingBalance=10000` (readers unknown); `fees` 0/0 in JSON vs pm2 per-share 0.005/min 0.75 | dead/odd — stop 4 |
| — | `patternMemory.*` and `patternMemory.bank.*` carry duplicate thresholds (minSamples 10, success .65, failure .35) | two pattern systems again (stop 9) |
| — | `filters.atrMinPercent` JSON 0.15 vs pm2 0.40 → 0.40 effective | override in the wild |

**Confidence-math inputs located for stop 3:** `confluence.mtfService.weights` (1m .05, 5m .08, 15m .10, 30m .10, 1h .15, 4h .17, 1d .15), `confluence.mtfBooster` (min score .3, min conf .45, strength .2, max 1.15, conflict .88), `orchestrator.*Mtf` per-strategy veto/boost multipliers, `orchestrator.fibBoost*`, `regimeBoosts`, `volumeProfileBoosts`, `regimeMultipliers`, `risk.counterTrendReduction/.lowConfidenceReduction/.highConfidenceBoost`, `trai.weight .2`, features.json `OGZ_TPO.voteWeight .35`.

## Totality sweep — every place a value can come from, enumerated first, then decided (Sept 5, after Trey's correction)

Method: (A) list every config-shaped file in the tree (json/env/yaml/toml/ini) outside ogz-meta/node_modules/tests/data — 26 files; (B) list every file-read call in live code (`readFileSync`/`readFile`/`require('*.json')`/`dotenv`) — 60 sites. Classify each. The decision step follows the enumeration, not the other way round.

**Behavioral config sources for the running bot (final count: 6):**
1. `.env` via dotenv (`ConfigLoader.js:476`)
2. process env = pm2 `ecosystem.config.js` stamps (`:1481`)
3. `config/trading.config.json` base values (`:28`)
4. `config/trading.config.json` → `launchProfiles.<PROFILE>` (profile-only values; env cannot touch them; `requiredLaunchProfile*`)
5. `config/features.json` via `FeatureFlagManager.js:114` (bypasses loader)
6. Hardcoded numeric literals in decision code — candidate set **66 lines in 9 files** (`modules/EMASMACrossoverSignal.js` 19, `core/DynamicPositionSizer.js` 15, `modules/MADynamicSR.js` 10, `core/TradingLoop.js` 9, `core/StrategyOrchestrator.js` 6, `core/PositionSizer.js` 3, `core/TRAIDecisionModule.js` 2, `modules/MultiTimeframeAdapter.js` 1, `core/OrderExecutor.js` 1). Regex-enumerated (weight/multiplier/threshold/boost = literal), not yet read; read at stops 3/4/6. Some will be false positives; the set is what gets decided over.

**Files that look like config and are not sources (traps):**
- `profiles/paper.env`, `profiles/production.env`, `profiles/backtest-{all,masr,rsi}.env` — **no live reader** (`ModuleAutoLoader.js:125` names a `profiles` dir path but never loads these). `profiles/paper.env` says `DIRECTION_FILTER=both` and `ENABLE_TRAI=false` — the opposite of what the live paper profile does. Five files that will mislead any human or agent who opens them. DELETE-CANDIDATE.
- `config/pattern-descriptions.json` — 16 pattern names → English descriptions, display text only (`run-empire-v2.js:3394`). INTERNALS/asset, not behavior.
- `config/.env.example` — documentation; not read.
- `mercury.config.json` — read only by `trai_brain/mercury-bridge/*` (agent tooling), not by the bot's TrAI path. Not a bot source.
- `.claude/settings.json`, `.vscode/*`, `.github/*`, `docker-compose.yml`, `trai_brain/claude-bridge/ignore-policy.json` — tooling, not bot.
- `BASELINE-matrix-2026-04-07.json`, `backtest/results/*.json` — outputs, not inputs.

**Runtime files that shape behavior but are STATE, not config (later stops):**
- `core/KillSwitch.js:115,146` flag file (Trey's manual kill) — stop 8
- `core/AuthFailureGuard.js:90` quarantine flag file — stop 8
- `core/SingletonLock.js` lock file — stop 1 runtime (one instance)
- `core/StateManager.js:4311` state file — stop 7
- `core/CandleStore.js:281,340` candle cache — stop 2
- `core/PatternMemoryBank.js:283`, `core/UnifiedPatternMemory.js:796,891` — two pattern-bank readers, two systems — stop 9
- `core/TRAIPatternIntegration.js:45` pattern pack (path passed in at construction, `:30`) — stop 9
- `core/trai_core.js:212,226` TrAI knowledge index — stop 10
- `core/session-router/TransitionStore.js` — stop 8
- `core/TradeJournal.js`, `core/TradeReplayCapture.js`, `core/tradeLogger.js`, `core/PerformanceAnalyzer.js:1104`, `core/Telemetry.js:180` — records — stop 7

**New finding from the sweep:** `PatternMemoryBank.js:161` and `UnifiedPatternMemory.js:184` call `ConfigLoader.load({silent:true})` at runtime to learn the mode. `load()` rebuilds the whole snapshot from `.env` + process env each call (`:1542-1545`). So the pattern banks re-read `.env` from disk mid-run and can see a different config than the bot booted with. Cut item: `load()` once at boot; everyone else uses `get()`.

## Second-read reconciliation — Sol (ChatGPT seat), Sept 5 — SLICE-1/2/3 + SOURCE-REVIEW zip

Method: Sol read blind at e54a8b8 via the GitHub connector, transcribed loader/autoloader functions into isolated Node probes and ran them (config-probes.cjs, boot-probes.cjs, extracted-source-probes.cjs). Fable verified every Sol finding below against the frozen tree before recording it.

**Fable corrected by Sol (recorded as corrections, per doctrine):**
- Slice-1 line "env beats JSON every time" — FALSE as a blanket. Profile-owned values (direction, TTP enable, min confidence, mode, sessionRouter, venueGuards, risk.guardMode, confluence) ignore env. Precedence must be recorded per path.
- "Overrides are not silent, every value's origin is printed at boot" — OVERSTATED. `RuntimeConfigProof` prints a hand-selected field list; `pipeline.directionFilter` and liveness timings absent; compat side prints without provenance (`core/RuntimeConfigProof.js:50-202`).
- Sorting weights into INTERNALS by name — WRONG RULE. Weights affecting entries/confidence/sizing/exits are trading behavior → SETTINGS. Sort by purpose, not name. Fable's `Proposed` column is re-sorted below.
- Hardcoded-literal sweep excluded `run-empire-v2.js` — GAP. Sol found trading parameters as constructor literals there: TradeIntelligenceEngine(profitTakePartial 1.5, profitTrailTight 2.5, lossWarning 0.5, lossCut 1.5, minHoldTime 2, staleTradeTime 30) at `:637-683`; FibonacciDetector(100/3/0.5); MessageQueue(50/5ms/3000ms) at `:1220-1240`. Candidate set → 66 + these.
- Fable's bypass-reader census covered only pm2-stamped or loader-read keys — GAP. Env keys that are neither, read directly: `ENABLE_DPS` (`run-empire-v2.js:279`), `TRADING_TIER` (`FeatureFlagManager.js:68`). Amp's census has the full set; use it as the denominator for bypass readers.

**Sol findings, new, verified by Fable at e54a8b8:**
| # | Finding | Receipt |
|---|---|---|
| S1 | Config fingerprint blind to nested values: `JSON.stringify(safe, Object.keys(safe).sort())` treats the array as a property allowlist at every depth; stop-loss 0.8→4.2 and paper→live leave the hash unchanged (Sol P01/P02) | `ConfigLoader.js:1453` |
| S2 | EMASMACrossover settings block dropped from snapshot: `track()` expects `{value,source}`, `requiredConfiguredPlainObject` returns the bare object → snapshot `undefined`; EMA still works via `get()` compat fallback | `ConfigLoader.js:1030, :75-83` |
| S3 | Permissive parsing: `"0.8garbage"`→0.8 labeled env; `"garbage"`→fallback labeled `default`; JSON-derived fallbacks labeled `default` not `config:path`; `"TRUE"/"FALSE"` for booleans → fallback | `ConfigLoader.js:392-444` |
| S4 | pm2 pre-reads `.env` (`ecosystem.config.js:16-35`) so dotenv values arrive as process env; provenance lost | `ConfigLoader.js:485-492, 1481` |
| S5 | Live trading welded to eval: validator refuses live unless `venueGuards.ttp.enabled=true` | `ConfigLoader.js:1250-1254` — **RULED Sept 6 (Trey): rip it out.** Deleted at the stop-1 boundary, same packet as the cut |
| S6 | Legacy `BASE_CONFIG` built at import time with direct env reads, before `.env` is parsed; `getAll()` = BASE_CONFIG + overrides, never the snapshot; `getExitContract()` reads BASE_CONFIG directly → inconsistent read surfaces; a UI on `getAll()` shows wrong values | `ConfigLoader.js:3972, 4373-4380` |
| S7 | `load({silent:true})` at entry stores warnings/errors in the snapshot; nothing ever prints them (zero readers of `snapshot.warnings`) | `run-empire-v2.js:5`; `ConfigLoader.js:1490-1538` |
| S8 | `ModuleAutoLoader.loadAll()` prints `ALL MODULES LOADED` unconditionally; a required module that throws is caught → `{}` | `core/ModuleAutoLoader.js:127-269` (Sol boot-probe reproduced) |
| S9 | `validateEnvironment()` requires Kraken key+secret regardless of active route (stock-only static route still needs them) | `run-empire-v2.js:1464-1485` |
| S10 | Startup failure → `shutdown()` → `process.exit(0)`: failure reported as clean exit | `run-empire-v2.js:1910-1927, 3586` |
| S11 | Dynamic sizing NOT WIRED: `ENABLE_DPS` conditionally requires the module; constructor sets `dynamicPositionSizer = null` ("NOT WIRED - needs tuning. Using inline confidence multiplier"); OrderExecutor gets no DPS. `features.json PATTERN_BASED_SIZING enabled=true` has no live path here. Trey's 1.5x spec item currently has no wiring | `run-empire-v2.js:268-280, 1043-1045` |
| S12 | Two tier identities: `BOT_TIER` via loader → `TierFeatureFlags`; `TRADING_TIER` via env → `FeatureFlagManager`; two scaling tables | `run-empire-v2.js:567-578`; `FeatureFlagManager.js:61-168`; `TierFeatureFlags.js` |
| S13 | JSON `positionSizing.{basePositionSize,maxPositionSize,maxPositions}` exist but the snapshot readers use env or literals .01/.05/3 — matching numbers hide that the JSON leaf is not the owner | `ConfigLoader.js:786-809`; `trading.config.json:1111-1131` |
| S14 | EMA effective warmup: configured 10 → derived ≥200 when `entryEventsOnly` (documented derivation, not a bug by itself) | `modules/EMASMACrossoverSignal.js:145-185` |

**Two-reader agreement (Fable + Sol, independent):** handler contradiction kills the bot on any unhandled rejection (both reproduced); launchProfiles as an env-immune layer; `features.json` independent source; pm2 `.env` pre-read; permissive parsing; selective boot proof; constructor success ≠ readiness; direction long-only on paper; EXIT_SYSTEM three-way; TTP master-off-children-on in paper.

**Open disagreement (check, not ruling):** the 23 dead pm2 stamps — Fable grep + Amp AST census agree; Sol declines a dead verdict without its own check → Sol verifies against `ogz-meta/inbox/amp/2026-08-28/env-census.md`.

**Refinement to Trey's Sept 5 refusal ruling (Sol, accepted):** the boot refusal applies to keys defined in settings.json/internals.json found in env or the pm2 file — not to arbitrary OS variables.

**Re-sort rule (applied to the table above on the cut):** SETTINGS = anything a customer or Trey would change, including every weight/multiplier/threshold that touches entries, confidence, sizing, exits, sessions, symbols, warnings, eval policy. INTERNALS = implementation constants only (buffers, batching, retry mechanics, log dedupe, protocol timings, paths). Names decide nothing.

**Additional cut items from the second read:** fix fingerprint producer (S1); fix EMA envelope (S2); strict parsing + true source labels (S3); one read surface — retire `BASE_CONFIG`/`getAll()`/`getExitContract()` or make them aliases proven to return the snapshot (S6); print or route snapshot warnings (S7); autoloader reports per-module outcome, no unconditional success (S8); route-specific credential requirements (S9); startup failure exits non-zero (S10); one tier identity (S12); one owner per sizing concept (S13). DPS wiring (S11) is a stop-4 decision, not a config-cut item.

## Executed evidence — real loader, frozen tree, pm2 stamps applied (Fable, Sept 6)

Method: `node_modules/dotenv@16.6.1` installed into the e54a8b8 checkout (the loader's only dependency); dummy credentials in env; every `ogz-prime-v2` stamp from the frozen `ecosystem.config.js` applied (140 keys); `ConfigLoader.load({silent:true})` called; values, sources, warnings, fingerprint read. No `.env` file present (so `.env`-only values fall to defaults — which is what exposes them, see below).

| Path | Value | Source | Note |
|---|---|---|---|
| mode.execution | paper | launchProfiles.paper.mode | PROFILE→mode works |
| pipeline.directionFilter | **long_only** | launchProfiles.paper.pipeline.directionFilter | proven by execution |
| exits.exitSystem | legacy | env:EXIT_SYSTEM (pm2) | |
| filters.atrMinPercent | 0.4 | env:ATR_MIN_PERCENT (pm2) | |
| broker.alpacaSymbols | TSLA,NVDA,COIN,MARA,RIOT | env:ALPACA_SYMBOLS (pm2) | |
| entryLogic.symbolLossCooldown.enabled | true | env (pm2) | RULED: delete everywhere |
| trai.enabled | true | env:ENABLE_TRAI (pm2) | box log: "TRAI initialization failed" ×2 |
| sessionRouter.mode / staticSession | static / stocks | launchProfiles.paper | |
| confidence.minTradeConfidence | 0.5 | launchProfiles.paper | |
| sizing.basePositionSize / maxPositionSize | 0.01 / 0.05 | env (pm2) | JSON leaf not the owner (S13) |
| exits.stopLossPercent | **0.8 (default)** | default | Aug 24 boot proof: **1.5 from env** — not a pm2 stamp → came from the box `.env` |
| exits.maxHoldMinutes | 240 | default | |
| pipeline.positionMode / positionSizing.maxPositions / strategies.EMASMACrossover | undefined | (untracked) | snapshot holes; S2 reproduced |
| warnings | 1 (fee-tier static-validation) | — | never printed anywhere; S7 reproduced |
| **fingerprint** | **31f19fb84642b861** | — | **identical to the Aug 24 boot proof despite stop loss 0.8 vs 1.5** — S1 reproduced on the real loader |

**Findings from execution:**
- **No drift.** Claude Code's Sept 6 "drift" table (ALPACA_SYMBOLS=TSLA, ATR 0.15 "on disk") compared the JSON base layer against the pm2-stamped effective value; the frozen pm2 file stamps `TSLA,NVDA,COIN,MARA,RIOT` (`ecosystem.config.js:93`) and `0.40` (`:111`). A restart at e54a8b8 produces the same config and the same fingerprint. Claim struck (Ruling 13).
- **Behavioral values live in the box `.env`:** `STOP_LOSS_PERCENT=1.5`, `TAKE_PROFIT_PERCENT=2`, `TRAILING_STOP_PERCENT=0.035`, `WEBHOOK_ORDERS_ENABLED=false`, `WEBHOOK_DRY_RUN=true` appear in the Aug 24 boot proof as `env:*` but are not stamped by `ecosystem.config.js` → they come from `.env` via pm2's dotenv pre-read. The July 10 amendment (".env credentials-only") is violated on the box today, not just in the code's permissiveness. Cut item: these five migrate to settings/internals; `.env` refusal names them.
- **Fingerprint blindness is live, not a fixture result:** different stop-loss, identical hash on the real loader.

**Nine env keys added to the sort from Sol's register (unstamped, loader- or bypass-read, missed by Fable's stamp∪track method):** `DATA_DIR`, `ENABLE_DPS`, `TRADING_TIER`, `SOLO_STRATEGY`, `TEST_MODE`, `FEE_TOTAL_ROUNDTRIP`, `TTP_ACCOUNT_START_OF_DAY_DATE`, `TTP_ACCOUNT_START_OF_DAY_EQUITY`, `TTP_EARNINGS_STATUS_JSON`. Sol's register: 227 config-path rows; proposed 170 customer settings / ~30 internals / 6 secrets; Sol never examined the 23 dead stamps or the eight mode flags (they have no config path).

**Box receipts (Claude Code, Sept 6, on-disk pm2 logs, verified counts):** BROKER_TRUTH_UNAVAILABLE 9,669 (first at error-log line 46, i.e. from boot); ALPACA_DATA_STREAM_STALE 9,655; WATCHDOG LIVENESS 182; AUTH_UNAVAILABLE 9; WS_TRANSPORT_UNAVAILABLE 5; **TRAI initialization failed 2**; orders reaching the executor 0; state saves 0; process created 2026-08-24T10:36Z, 0 restarts, singleton lock never contested; NTFY_TOPIC absent from the process env (Trey: certain) → no runtime notifier for the life of the process, and no boot line names that absence (`run-empire-v2.js:1071-1077`). Claude Code's `STOP-1-BOOT-CONFIG-TRUTH.md` (uncommitted): counts and boot stamp = evidence, keep; its verdict line ("one config, sourced cleanly, no contradictory layering") contradicts both reads and is struck.

## Slice 5 — the parts previously skipped, now read (Sept 6): tuningProfiles, strategies, exitContracts, six tables, hardcoded literals

Coverage, stated precisely: `trading.config.json` **read** value-by-value in every section (1,692 / 1,692) — meaning each value's identity, location, layer, and precedence are known. **Reader/consumer verification** (who reads it, called on the live path, supposed to be there, makes sense) is done for: all 116 pm2 stamps (three-method census), and for the JSON values Trey's spec spoke to (direction, hedging, cooldown, fees, PID, loss gates, sessions, exit system, regimeMultipliers, profiles). It is NOT done for the remaining ~1,500 JSON leaves or for the literal surface. That per-leaf six-question verification is the manifest mission (boundary spec 1.6), performed by the executor with an AST reader census and cold-pulled by both readers before the cut. Hardcoded-literal candidates read line by line (66 + Sol's 12); the class is wider (boundary spec 1.6).

**tuningProfiles (102 values):** 4 named bundles of env overrides — `current-eval` (17 keys), `ttp-5k-max` (27), `trey-spec` (30), `legacy-wide` (15); union 37 keys, all sizing/tiers/ATR/exit-system/fees. `defaultProfile=current-eval` but a bundle applies only when `TUNING_PROFILE`/`BACKTEST_TUNING_PROFILE` is set (`ConfigLoader.js:508-527`); boot proof `activeProfile=null` → none active on the box. In the two-file design these are **presets**: named sets of SETTINGS values selectable from the UI, not an env-override layer. `ttp-5k-max`/`trey-spec` carry `ABSOLUTE_POSITION_CAP=1.00`, `MAX_POSITION 0.10` (backtest economics).

**strategies (313 values, 14 blocks) — findings against the spec:**
- **Five strategies are long-only in their own config:** `allowShorts=false` on DonchianBreakout, PropSafeEMAPullback, EMATrendRetest, RSI2MeanReversion, TimeSeriesMomentum. Flipping `directionFilter` to `both` does not make these short. MADynamicSR allows shorts (`allowShortFromBelow=true`). Whether the other eight have any short code path at all is stop 3. MDT is per-strategy work, not one switch.
- **`confluenceBoost.enabled=false, weight=0` on every strategy.** Per-strategy confluence contribution is zero across the board today.
- **Loss gate inside a strategy:** SmartMoneySweep `maxDailyLosses=3` (+ `maxLossPct`, `maxHoldBars`). Trey's law: no loss stops → DELETE-CANDIDATE, his word at stop 3.
- Session logic duplicated inside strategies: `requireRth=true`, `rthStartET/EndET 09:30/16:00` hardcoded in PropSafe and EMATrendRetest configs; ORB has its own session open. SessionRouter is supposed to own this. Stop 3/8.
- OGZTPO `voteWeight=0.25` here (boot banner agrees) vs `features.json 0.35` → this file wins; features.json value is dead for that key.
- RSI block matches Trey's July 14 spec (period 5, buy<35, exit>50, 200MA filter). CLEAN as configured.
- Exits are configured inside strategy blocks too (targetRR, atrStopMult, trail*, maxHoldTimeMinutes 240, partialExit) — a fourth exit layer.

**exitContracts (301 values, 16 strategies + default):** per-strategy locked SL/TP/trail/maxHold/partialExit/invalidation. Every `partialExit.enabled=false`. `_validated` dates March 20 or null. `default` contract: SL -2%, TP 2.5%, trail 0.6%, maxHold 240m, `maxConcurrentEntries=1`. NoWickImbalance `maxConcurrentEntries=2` (stacking allowed for one strategy — vs Trey's one-trade-per-asset; stop 4). `scaleIn` blocks present, all disabled.

**Membership mismatch across the three strategy lists:** `pipeline.enable*` (17 incl. EMACrossover, mapped to EMASMACrossover at `StrategyOrchestrator.js:2227`); `strategies` blocks (14, includes VolumeProfile which has no pipeline enable); `exitContracts` (16 + default: has BreakRetest, CandlePattern, MarketRegime which have **no strategies block**). Three lists, three memberships.

**Six tables:** `regimeBoosts` (22) and `volumeProfileBoosts` (21) — live, read by `StrategyOrchestrator.js`; cover only the 5 original strategies, the other 10 get no regime/volume adjustment. `regimeMultipliers` (14) — read only inside ConfigLoader, **no consumer** → dead table. `profiles` (24: scalper/day_trader/swing/conservative/balanced/quantum) — read only as `misc.tradingProfile` for a log line (`run-empire-v2.js:616, :3191`); no behavior consumer found → **a sixth notion of "profile," dead beyond the banner** ("Trading Profile: BALANCED"). `pid` (15, `enabled=true`) — a PID controller fed on every trade close (`OrderExecutor.js:4901, :5530`), warmup 50 trades, gains for position/regime/trail; **an adaptive layer Trey never specified**; whether its outputs feed sizing/trail back is unread (stop 4/6). `feeProfiles` (17): `ttp_real` = $0.005/share min $0.75 — and the paper bot on **Alpaca** is running that model (boot proof `FEE_MODEL=per_share_minimum`); Alpaca charges no per-share commission → paper P&L carries fees the venue doesn't charge. Fees must be per-broker. Stop 4.

**Hardcoded literals, read (66 candidates → 27 real parameters + Sol's 12 = 39):**
| Where | What | Proposed |
|---|---|---|
| `core/PositionSizer.js:112` | **the live sizing rule**: `multiplier = 0.5 + (conf-0.5)*4.0` — the "inline confidence multiplier" that replaces the unwired DPS | SETTINGS (two constants) |
| `core/DynamicPositionSizer.js:71-76, :85-90` | confidence→size curve (6 pts) and volatility→size curve (6 pts) | SETTINGS if DPS is ever wired; dead today (S11) |
| `modules/EMASMACrossoverSignal.js:152-156` | five crossover-pair weights 1.0/1.2/1.5/1.0/1.4 | SETTINGS |
| `core/TRAIDecisionModule.js:47` | `confidenceWeight: 0.3` vs `trading.config.json trai.weight 0.2` — two answers | stop 10 |
| `core/TradingLoop.js:504, :1329` | warmup gate threshold 15 bars | INTERNALS |
| `core/StrategyOrchestrator.js:2710` | `pocThreshold 0.002` | SETTINGS |
| `core/TradingLoop.js:2432-2438` | dashboard "proximity" conditions (RSI 30/70, EMA20>50, confluence≥2, conf≥65, regime) with weights | display only; INTERNALS |
| `run-empire-v2.js:637-683` (Sol) | TradeIntelligenceEngine 1.5/2.5/0.5/1.5/2/30 | SETTINGS |
| `run-empire-v2.js:1220-1240` (Sol) | FibonacciDetector 100/3/0.5; MessageQueue 50/5/3000 | SETTINGS / INTERNALS |
| remaining 39 of the 66 | initializers (`multiplier: 1`, `totalWeight = 0`) — not parameters | false positives, dropped |

**Category updates from slice 5:** tuning profiles → SETTINGS presets; strategy blocks → SETTINGS (per-strategy section, incl. `allowShorts` and per-strategy exits); exitContracts → SETTINGS (per-strategy exits; one owner per strategy after stop 6 collapses the four exit layers); regimeBoosts/volumeProfileBoosts → SETTINGS (weights); regimeMultipliers → DELETE (no reader); profiles table → DELETE-CANDIDATE (banner only); pid → RULING-NEEDED at stop 4 (unspecified adaptive layer); feeProfiles → SETTINGS, keyed per broker; the 27 real literals → as tabled.

---
**WHAT I DID:** ran the real ConfigLoader at e54a8b8 with all 140 pm2 stamps applied (Sept 6); read Sol's 227-row register + probes; read run-empire-v2.js structure + constructor + start() + main() + shutdown() (slice 3, with a Node probe proving the rejection-handler order); read trading.config.json sections listed under slice 4 + launchProfiles; read ENV-VAR-AUDIT.md, CONFIG-FINGERPRINT-REGISTRY.md, CLAUDE.md, 04_guardrails, 05_landmines (headers + config grep), features.json (all 73 values), FeatureFlagManager readers; regex-extracted all 116 `track(...env...)` values from ConfigLoader.js at e54a8b8; extracted all 116 pm2 stamps for `ogz-prime-v2`; grep-censused every stamp's readers across the tree (excluding tests/scripts/docs/ogz-meta); cross-checked the 23 dead stamps against Amp's AST census; read UnifiedPatternMemory.js:186-212.
**WHAT I DID NOT DO:** boot the bot or connect a broker; read the PID controller's output consumers; read strategy short-side code paths (stop 3); read `.env` (box-only); verify Amp's census beyond the 23-key cross-check; read the launch-profile side effects (:1851 area).
**WHAT I ASSUMED:** the 'Proposed' column is my category proposal, not a ruling; `mode` in the pattern-bank filename means paper/live/backtest (unverified).