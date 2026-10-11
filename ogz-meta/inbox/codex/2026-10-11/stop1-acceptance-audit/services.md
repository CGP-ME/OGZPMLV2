# Stop1 auxiliary services and internals audit

This is a read-only audit of the live dirty tree at HEAD `cb566d93a46dca8673def2f76ea685f5be0b148e`. The working tree was already dirty; no production file, process, PM2 state, save path, or network client was invoked. The per-key inventory is in `services.coverage.json`.

## Loader and precedence

`foundation/ConfigLoader.js:1165-1170` reads the service settings. Bot construction merges the settings with credentials and internal service groups at `foundation/ConfigLoader.js:1267-1301`; `dashboard` and `observability` internals are separately exposed at `:1205-1210` and `:1262`. `applyRunDescriptor` then overwrites dashboard, notifications, and webhook enablement at `foundation/ConfigLoader.js:985-992`. Therefore the saved settings values for `services.dashboard.enabled`, `services.notifications.enabled`, and `services.webhookOrders.enabled` can be replaced by the active run descriptor. This is a real precedence path, not an unused token reference.

The bot path removes `internals.tooling` and checkout/supervisor from the bot proof/config view (`foundation/ConfigLoader.js:2206-2217`). The market-data role separately constructs `tooling.dataParity` and `tooling.stockDownload` (`foundation/ConfigLoader.js:638-662`), and `tools/data-parity-check.js:11` reads `tooling.dataParity`. `tooling.stockDownload` had loader evidence only in the current source census; no current production/CLI consumer was found in the bounded search, so it is marked `loader_only_no_current_consumer_found` rather than working.

## Verified effects

- Dashboard service fields are assembled into the dashboard role (`foundation/ConfigLoader.js:560-609`, `:1267-1277`). `ogzprime-ssl-server.js:103` consumes `secureCookies`; `ogzprime-ssl-server.js:1184-1199` consumes stock and crypto settings; `ogzprime-ssl-server.js:2502-2503` binds the configured host/port. Bot startup gates dashboard creation at `run-empire-v2.js:1151` and `:1477`. Stock stream fields are conditional: URL/feed validation is performed only when `streamEnabled` is true (`foundation/ConfigLoader.js:1481-1484`).
- Checkout is a real separate service role. `public/stripe-checkout.js:50-63` loads the checkout role and captures `priceMap`; `:80-91` uses price map, trial days, success URL, and cancel URL; `:121` uses the configured port. Loader validation is at `foundation/ConfigLoader.js:1553-1566`. The bot role deliberately excludes checkout (`foundation/ConfigLoader.js:2212-2214`).
- News provider settings are consumed by `core/NewsSearchProvider.js:69-110` and initialized by the dashboard server at `ogzprime-ssl-server.js:303-305`. EDGAR TTL, lookback, cache cap, and parse-per-call values are read on the live EDGAR path at `core/NewsSearchProvider.js:306`, `:419`, `:435-446`, and `:467`. This is a per-call/cache decision path, not constructor-only plumbing. `edgarUserAgent` is passed to SEC requests at `core/NewsSearchProvider.js:295-302`; credentials and Bright Data zone remain environment-backed in `foundation/ConfigLoader.js:1281-1283`.
- Notification enablement has real consumers: `core/NtfyTraceNotifier.js:196-202`, `utils/telegramNotifier.js:47-50`, and `utils/discordNotifier.js:52-55`. Telegram timeout and interval are captured by its module at `utils/telegramNotifier.js:57` and `:100`; ntfy timeout is passed by `core/NtfyTraceNotifier.js:202`. These are constructor/module-load effects and require restart to change.
- Voice flags are passed into the TRAI constructor at `run-empire-v2.js:807-830`, so the current values affect only a TRAI-enabled startup and are constructor-captured. Narrator flags and label seed are captured in `core/TradeNarrator.js:273-293`; changing them after construction has no verified refresh callback.
- Webhook settings are assembled at `foundation/ConfigLoader.js:1249-1255` and consumed when `WebhookOrderAdapter` is constructed at `run-empire-v2.js:1352-1362`. `entryThrottleMs` is checked for every order in `core/WebhookOrderAdapter.js:49-52`, `:126-128`, while enabled/dry-run posture is constructor state. Loader safety checks include live-mode dry-run and URL requirements at `foundation/ConfigLoader.js:1915-1975` and `:2025-2026`.
- Dashboard internals are used by bot/server paths, including `run-empire-v2.js:1131`, `:1480`, `:3375`, `core/StateManager.js:4667`, and `core/DashboardDepthCoalescer.js:5-29`. Observability values are mixed: trace settings are copied at bot construction (`run-empire-v2.js:1330-1347`), while strategy diagnostics and smart-money/backtest debug are read by consumers at `core/TradingLoop.js:75-76` and `core/StrategyOrchestrator.js:817-879`. No runtime refresh was established.
- Monitoring values are consumed at process initialization by `instrument.js:42-63`; deployment values are consumed statically by `ecosystem.config.js:6` and are not evidence that PM2 has adopted them.
- Decision-record settings are module-load captures: `core/DecisionLedgerLogger.js:8-11` captures buffer/validation and `core/DecisionAutopsyLogger.js:7-18` captures enablement/fallback directory. The fallback path creates directories when called (`core/DecisionAutopsyLogger.js:18-21`), but this audit did not call it.

## Concrete gaps and mismatches

1. `services.notifications.enabled` has descriptor precedence (`foundation/ConfigLoader.js:986-990`) and real notification consumers, but the active effect is module-load/constructor scoped. A settings save alone cannot be called a live notification refresh.
2. Voice and narrator controls are constructor-captured. The tree shows no refresh callback for `services.voice.audioEnabled`, `services.voice.videoEnabled`, or the narrator flags/seed; a dashboard save can update the loader view without changing an already-running TRAI or `TradeNarrator` instance.
3. `internals.deployment` is a static PM2 source. `ecosystem.config.js:6` loads it, but this audit intentionally did not restart PM2; runtime adoption is unresolved.
4. `internals.tooling.stockDownload` is present and validated by role-loader paths but has no current live CLI consumer in the bounded search. It is recorded as a likely dead/legacy leaf, not as working behavior. `tooling.dataParity` does have a direct CLI consumer at `tools/data-parity-check.js:11`.
5. `internals.decisionRecords` values are captured at module load. They are not per-record reads, so changing them requires a fresh process/module load; no refresh mechanism was found.

## Evidence and reproducibility

The inventory was produced from the current `config/settings.json`, `config/internals.json`, `foundation/ConfigLoader.js`, the supplied `auxiliary-key-census.json`, and bounded `rg` source searches. Values that could expose credentials or price identifiers are omitted/redacted in the coverage JSON. Hashes and the HEAD-vs-working-tree distinction are recorded in `services.coverage.json`; SHA-256 file hashes are distinct from Git blob IDs.

The exact read-only inventory inputs/commands were:

```sh
jq -r '.[] | select(.key|test("services\\.(dashboard|checkout|news|notifications|voice|narrator|webhookOrders)|internals\\.(tooling|deployment|services|dashboard|monitoring|observability|decisionRecords)")) | [.owner,.key,.type] | @tsv' ogz-meta/inbox/codex/2026-10-11/stop1-acceptance-audit/auxiliary-key-census.json
jq '{dashboard,decisionRecords,deployment,monitoring,observability,services,tooling:{dataParity,stockDownload}}' config/internals.json
rg -n "services\\.notifications|services\\.checkout|services\\.news|services\\.voice|services\\.narrator|services\\.webhookOrders|dataParity|stockDownload|internals\\.deployment|internals\\.decisionRecords|observability\\." --glob '!ogz-meta/**' --glob '*.js'
sha256sum config/settings.json config/internals.json foundation/ConfigLoader.js
git rev-parse HEAD:config/settings.json HEAD:config/internals.json HEAD:foundation/ConfigLoader.js
```

No credentials were printed, no networked module was run, and no runtime/save/restart test was claimed.

## Independent scope checks requested by root

These checks were read against the current tree, without edits to production code:

- `PatternBasedExitModel.evaluateExit` has a definition at `core/PatternBasedExitModel.js:81` and no current caller was found outside the class. The instance is constructed at `run-empire-v2.js:739-740`, but construction alone does not prove evaluation or exit effect.
- The eight `featureCatalog.PATTERN_EXIT_MODEL.settings` leaves not read through `this.config` in the class are `minPatternExitConfidence`, `targetConfidenceWeight`, `minTargetAdjustment`, `maxTargetAdjustment`, `stopConfidenceWeight`, `patternTrailWeight`, `reversalPatterns`, and `exhaustionThreshold`. The class instead uses hardcoded continuation pattern lists at `core/PatternBasedExitModel.js:418-422`; these are concrete unread/config mismatch findings.
- `trai.maxConf` is passed as `maxConfidenceOverride` at `run-empire-v2.js:815`, but no `maxConfidenceOverride` consumer was found in `core/TRAIDecisionModule.js`; the module reads `minConfidenceOverride` at `:761-768`. This max-confidence path is unresolved/dead from current evidence.
- `trai.vetoPower` is passed at `run-empire-v2.js:811`, then forcibly set to `false` in `core/TRAIDecisionModule.js:43-47`. This is intentional policy ownership in current code, but the setting is not authoritative behavior.
- `proofPublication` does have downstream consumers in `ogz-meta/claudito-logger.js:376-392` and `:643-734`; it is not an unused nine-leaf group. The audit did not verify publication output or runtime activation.
- `tierPolicy` is loaded by `FeatureFlagManager` at `core/FeatureFlagManager.js:66-72`; its access, daily-trade, leverage, and scaling helpers are called at `:279-318`. It is therefore consumed, though this audit did not establish that every UI-exposed tier field gates the trading path.
- The auxiliary source census was expanded against 383 files and 343 runtime call sites. `proofPublication` is excluded from the unused findings because `ogz-meta/claudito-logger.js` is an actual runtime consumer.
- `misc.tradeIntelligenceShadow` is assigned from config at `run-empire-v2.js:757-758`; `TradeIntelligenceEngine` is constructed at `:747-756`. No separate method invocation was found in the bounded search, so this remains constructor/cache/log evidence rather than a verified trade-path effect.
- Additional static consumers are now covered: `tooling.confidenceGrid` via `tools/grid-search-confidence.js:27`, `tooling.matrixSweep` via `tools/matrix-sweep.js:94`, `core/DataFileInstrument.js:20`, and `tools/harvest-pattern-pack.js:46`, `tooling.weekendCampaign` via `tools/weekend-campaign-gauntlet.js:11`, and all `services.supervisor` leaves via `scripts/supervisor-daemon.js:70` and its runtime uses at `:197` and `:275-284`.
