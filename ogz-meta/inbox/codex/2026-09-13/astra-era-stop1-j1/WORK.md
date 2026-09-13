# STOP 1 J1 investigation

## 1. Current main-bot sequence

The executable sequence is not the sequence described by its comments.

1. ConfigLoader is required and executed first (`run-empire-v2.js:3-5`). It reads `.env` with `dotenv.parse`, merges file values with `process.env`, validates, freezes, and returns a local snapshot (`foundation/ConfigLoader.js:473-492,1478-1535`). It restores its private `activeEnv` after construction and never hydrates `process.env` (`:1486-1507`).
2. Sentry is required before the durable sink and custom handlers (`run-empire-v2.js:36-37`). `instrument.js:39-57` reads only `process.env`, despite claiming ConfigLoader loaded `.env`, and supplies a credential-bearing hardcoded fallback at `:41`.
3. The durable `RuntimeAuditSink` is imported and instantiated only at `run-empire-v2.js:116,124-126`. Its bootstrap handlers are registered at `:315-329`.
4. ModuleAutoLoader enumerates and requires every JavaScript file in `utils/` and `core/` at `core/ModuleAutoLoader.js:130-203,251-273`. That enumeration imports Telegram and Discord. Their `dotenv.config()` calls mutate `process.env`; Telegram captures and instantiates immediately (`utils/telegramNotifier.js:44-52,239-249`), while Discord captures at import and exports an immediately created singleton (`utils/discordNotifier.js:47-54,472-484`).
5. The runner later requires the same cached notifier modules (`run-empire-v2.js:387-392`). TrAI resolves its dynamic key from `process.env` during bot construction (`run-empire-v2.js:766-779`; `core/trai_llm_config.js:54-83`). Ntfy and dashboard authentication are also read from `process.env` later (`run-empire-v2.js:1060-1083`; `core/NtfyTraceNotifier.js:194-202`; `core/WebSocketManager.js:107-133`).
6. The same ambient mutation supplies noncredential startup inputs to reached consumers. `EnhancedPatternChecker` constructs pattern memory without configuration, so `UnifiedPatternMemory` reads `BROKER`/`ASSET_CLASS` from `process.env` and throws if neither resolves (`run-empire-v2.js:594-600`; `core/EnhancedPatternRecognition.js:382-393`; `core/UnifiedPatternMemory.js:191-206,246-257`). The bot's stock-history helper also falls back to `process.env` when its existing `options.config` is omitted (`run-empire-v2.js:2337-2371`; `server/stock-data-adapter.js:10-20,42-68`).
7. `core/trai_core.js:67-69` imports the bot's read-only toolbox inside a swallowed catch. That toolbox imports full Mercury configuration merely to use `SKIP_DIRS` and `mercury.ignore` policy (`trai_brain/read_only_tools.js:1-11,31-35`). Full config initializes the configured embedding provider and reads the dynamically named key at import (`trai_brain/mercury-bridge/config.js:310-335`; `mercury.config.json:8-13`). A missing key silently removes the toolbox even though repository search itself does not need embeddings (`core/trai_core.js:113-121,886-898`).

Constructed sequence: launch `node run-empire-v2.js` with a clean inherited environment and credentials present only in `.env`; remove the two notifier dotenv calls as an isolated cleanup.

Mechanical result: ConfigLoader can still resolve its private broker values, but the selected TrAI key, ntfy topic, dashboard token, Telegram values, Discord values, pattern-memory identity, and bot stock-history configuration are absent from their existing ambient consumers. The read-only toolbox can also become unavailable because repository policy is coupled to unrelated embedding initialization. This is why the old two-line cleanup is not authorized.

Disposition: **IMPLEMENTATION REQUIRED**. Move the source and all affected consumers atomically.

## 2. Current credential consumers do not share one contract

The active broker adapters receive explicit options from ConfigLoader (`run-empire-v2.js:179-190,797-875`; `brokers/AlpacaAdapter.js:35-61`; `kraken_adapter_simple.js:71-74`). That part is directionally correct.

The surrounding services are not:

- Sentry reads ambient process state and has a source fallback (`instrument.js:39-57`).
- Telegram and Discord capture ambient values at module import (`utils/telegramNotifier.js:44-52`; `utils/discordNotifier.js:47-54`).
- TrAI accepts an explicit environment argument but callers omit it (`core/trai_llm_config.js:54-83`; `run-empire-v2.js:766-779`; `ogzprime-ssl-server.js:238-249`).
- Ntfy and dashboard WebSocket code accept or read ambient environment independently (`core/NtfyTraceNotifier.js:194-202`; `core/WebSocketManager.js:107-133`).
- BotStateFrame uses credential presence as a fallback broker detector (`core/BotStateFrame.js:99-130`), coupling secret availability to telemetry identity.
- The dashboard independently reads auth, broker-data, news, LLM, and Polygon inputs (`ogzprime-ssl-server.js:46,156-177,238-262,295-313,1136-1160,1797-1819`). Its stock/news helpers already accept explicit environment or resolved configuration (`server/dashboard-stock-stream-config.js:93-190`; `server/stock-data-adapter.js:10-39,62-68`; `core/NewsSearchProvider.js:71-137`).
- News selection also requires allowlisted nonsecret companion values such as `NEWS_SEARCH_PROVIDER`, `BRIGHTDATA_SERP_ZONE`, and `EDGAR_USER_AGENT`; a key-only view is insufficient (`core/NewsSearchProvider.js:78-82,103-136`).
- The bot process separately calls both stock-history helpers without the explicit configuration already used by the dashboard process (`run-empire-v2.js:2354-2368`; `ogzprime-ssl-server.js:1926-1933`).
- The declared checkout process performs its own dotenv load and ambient Stripe construction (`public/stripe-checkout.js:11-16`; declaration at `ecosystem.config.js:198-206`).
- The declared supervisor reads its optional capability-bearing deadman URL from ambient process state (`scripts/supervisor-daemon.js:45-58,223-244`; declaration at `ecosystem.config.js:208-247`).
- The supervisor also conditionally imports the module path named by `SUPERVISOR_ALERT_HOOK` (`scripts/supervisor-daemon.js:202-219`). That nonsecret companion configuration must reach the supervisor view without changing whether or how the extension is enabled.

Disposition: **IMPLEMENTATION REQUIRED** for the declared entrypoints and live consumers in `CREDENTIAL-CENSUS.tsv`.

## 3. Early failures are incompletely reported

The earliest current durable recorder is sound for bounded local appends: it constructs a scoped JSONL record, writes synchronously, and falls back to stderr without throwing (`core/RuntimeAuditSink.js:125-205`). It is simply installed too late.

Failures before its construction include ConfigLoader import/load, configuration validation, Sentry import/initialization, and imports between Sentry and the sink (`run-empire-v2.js:3-6,36-37,108-126`). ModuleAutoLoader adds another gap: optional module import errors are caught, printed, and not propagated (`core/ModuleAutoLoader.js:168-203`), so global exception handlers cannot record them.

The dashboard has a similar module-import boundary. News configuration is resolved at module load and can throw before the server listens (`ogzprime-ssl-server.js:252-262,2398-2403`; `core/NewsSearchProvider.js:71-137`). No equivalent durable early recorder is installed in that entrypoint.

Ntfy does not solve the earliest case. It is installed after bot construction has already resolved TrAI and built brokers (`run-empire-v2.js:766-875,1060-1077`). Missing ntfy configuration cannot notify its own absence. Its current handler schedules asynchronous delivery and returns before the request outcome (`core/NtfyTraceNotifier.js:169-202`).

Disposition: **IMPLEMENTATION REQUIRED**. Install the existing durable sink before non-built-in configuration/service imports, route producer-caught load failures into it, and record the remote-notification state honestly. J1 must not call a queued attempt "delivered."

## 4. Route-specific credential validation is not coherent

ConfigLoader conditionally validates Alpaca credentials when Alpaca is the selected broker (`foundation/ConfigLoader.js:1273-1288`). The bot constructor then unconditionally calls `validateEnvironment()` (`run-empire-v2.js:557-570`), whose implementation requires Kraken credentials whenever the run is not a backtest (`:1464-1479`). Because the runner constructs only Kraken and Alpaca adapters and decides which are needed from SessionRouter (`:797-858`), an Alpaca-only route can be rejected for absent Kraken credentials.

Disposition: **IMPLEMENTATION REQUIRED, ASSIGNED TO J4**. J1 must feed one truthful source into this path but must not redesign required-component/readiness semantics. J4 removes the stale unconditional check and binds credential requirements to the selected session routes.

## 5. Registered alternate adapters

BrokerRegistry names additional adapters, and Gemini, Schwab, and Uphold contain ambient credential fallbacks. The only non-test production callers of `createBrokerAdapter()` are the explicit Kraken and Alpaca constructions at `run-empire-v2.js:846,858`; the factory itself is at `brokers/BrokerFactory.js:25-62`.

Disposition: **UNREACHABLE FROM THE CURRENT MAIN RUNNER** for J1. Do not edit these adapters in this packet. If a later package authorizes one as a runtime route, explicit credential injection becomes part of that route's activation work.

## 6. Standalone tooling versus the bot's shared policy dependency

Standalone Mercury executors, downloaders, provider probes, gate scripts, and fixtures have separate process boundaries and their own credential conventions. J0 keeps their provider/transport work in J17. Their credential loading does not establish the bot/dashboard source and is not redesigned by J1.

The bot's reached `read_only_tools.js` dependency is different. It needs the same repository skip/ignore policy but currently imports full Mercury configuration, which initializes embeddings and reads a credential. J1 must extract a pure repository-policy module used by both callers so bot tools do not acquire an embedding-key requirement. The current `trai_core.js:67-69` catch also hides toolbox initialization failure from ModuleAutoLoader, so the explicit construction path must report named optional-tool unavailability without making it a bot requirement. The policy rules themselves remain unchanged.

Disposition: **IMPLEMENTATION REQUIRED** for the shared policy extraction; **BELONGS TO SEPARATE TOOLING WORK** for Mercury provider, transport, indexing, pricing, and execution behavior.

## 7. Existing receipts are incomplete

`RuntimeConfigProof` records redacted presence/source only for the four broker secrets and the SignalStack URL (`core/RuntimeConfigProof.js:20-43,64-91`). It does not prove which source supplied Sentry, TrAI, ntfy, dashboard auth/data/news, Telegram, Discord, Stripe, or the supervisor capability URL.

Notifier startup messages say configured or missing but do not name a source (`utils/telegramNotifier.js:50-60`; `utils/discordNotifier.js:73-89`). Dashboard readiness reports missing key names for stock data (`server/dashboard-stock-stream-config.js:93-154`; `ogzprime-ssl-server.js:1543-1559`) but not a joined bootstrap revision.

Disposition: **IMPLEMENTATION REQUIRED**. J1 adds a redacted bootstrap receipt with source-file metadata, requested key names, presence, source class, process role, and consumer. It records no credential value, per-key hash, prefix, suffix, or length.

The supervisor's ledger HMAC key is not a bootstrap input. It is generated and persisted under the supervisor's existing owner (`core/Supervisor.js:143,848-877`). J1 keeps that ownership unchanged and does not include the key or its derivation in bootstrap receipts.

## 8. No new refusal or control authority

The bootstrap source reports `present`, `absent`, or `source_unavailable` for credential inputs and supplies allowlisted nonsecret companion values without interpreting them. It does not decide whether the bot trades, exit a process, create a halt, retry a provider, flatten a position, or grant a fallback credential. Those decisions remain with the actual service and the later J3/J4 lifecycle/readiness packages.

This is deliberately not a fail-closed wrapper. It removes accidental source coupling and makes the existing outcome observable.

## Footer

WHAT I DID: traced the declared processes from source read through each current credential consumer and classified each J1 finding.

WHAT I DID NOT DO: infer deployed PM2 state, authorize a new service, or treat a source-level constructed sequence as a runtime incident.

WHAT I ASSUMED: Stripe and the supervisor count as declared runtime candidates because they are present in the current ecosystem descriptor; actual process activation remains unproved.
