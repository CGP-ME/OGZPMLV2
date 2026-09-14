# STOP 1 J1 evidence

## Frozen source

- Branch: `astra-era`
- Investigated revision: `0c3760240272653a446ef1e4e3772c3ad8104209`
- J0 control: `ogz-meta/inbox/codex/2026-09-12/astra-era-stop1-j0/CONTROLLING-SPEC.md:122-180`

The commits between J0 and this revision change packet documents only. Current source claims were rechecked against the frozen tree.

## Mechanical coverage

- Declared PM2 application records: 4 of 4 read at `ecosystem.config.js:54-248`.
- Alternate watch application records: 2 of 2 read at `ecosystem.watch.config.js:1-47`.
- Main-runner BrokerFactory call sites: 2 of 2, explicit Kraken/Alpaca at `run-empire-v2.js:846,858`.
- Current dotenv file read/mutation sites on declared runtime paths: 6 of 6 traced.
- ModuleAutoLoader top-level candidates: 110 of 110 enumerated, 107 under `core/` and three under `utils/`.
- Codex literal-require/autoload closure: 167 files.
- Codex factory-expanded closure after adding the two runtime-selected adapters and newly reached dependencies: 171 files.
- Files in the 167-file closure containing `process.env` or dotenv syntax: 41 of 41 listed below; the four factory additions add no direct input reader.
- Credential/capability/nonsecret cutover rows: 30 of 30 classified in `CREDENTIAL-CENSUS.tsv`.

The 167/171/41 counts are static candidates, not a claim that every file executes or that every environment behavior is correct. Astra reported 168 factory-expanded candidates and 26 tracked dotenv sites; Codex's stated mechanical definitions reproduce 171 and 27. The consequential 41-file list reproduces exactly. Dynamic supervisor extensions cannot have a finite checkout denominator.

## Complete 41-file preservation candidate list

These are the complete direct-input candidates in the defined closure. Each live reader must receive a source-class and destination disposition for the atomic configuration cut; inclusion alone does not authorize an edit:

1. `core/BacktestRunner.js`
2. `core/BotStateFrame.js`
3. `core/CryptoMarketFeed.js`
4. `core/DashboardDepthCoalescer.js`
5. `core/DataFileInstrument.js`
6. `core/DecisionAutopsyLogger.js`
7. `core/DecisionLedgerLogger.js`
8. `core/EnhancedPatternRecognition.js`
9. `core/FeatureFlagManager.js`
10. `core/MarketRegimeDetector.js`
11. `core/MultiAssetManager.js`
12. `core/NtfyTraceNotifier.js`
13. `core/OptimizedIndicators.js`
14. `core/OutputPaths.js`
15. `core/PatternMemoryBank.js`
16. `core/RuntimeAuditSink.js`
17. `core/SingletonLock.js`
18. `core/StrategyOrchestrator.js`
19. `core/TRAIDecisionModule.js`
20. `core/TradeNarrator.js`
21. `core/TradingLoop.js`
22. `core/UnifiedPatternMemory.js`
23. `core/WebSocketManager.js`
24. `core/trai_core.js`
25. `core/trai_llm_config.js`
26. `ecosystem.config.js`
27. `foundation/ConfigLoader.js`
28. `instrument.js`
29. `modules/LiquiditySweepDetector.js`
30. `modules/SmartMoneySweep.js`
31. `ogz-meta/claudito-logger.js`
32. `ogzprime-ssl-server.js`
33. `public/stripe-checkout.js`
34. `run-empire-v2.js`
35. `scripts/supervisor-daemon.js`
36. `server/dashboard-session-auth.js`
37. `server/dashboard-stock-stream-config.js`
38. `server/stock-data-adapter.js`
39. `trai_brain/mercury-bridge/config.js`
40. `utils/discordNotifier.js`
41. `utils/telegramNotifier.js`

## Key source receipts

- Private ConfigLoader dotenv parse and merge: `foundation/ConfigLoader.js:473-492,1478-1507`.
- Sentry ambient read and hardcoded fallback: `instrument.js:39-57`.
- Sink construction after early imports: `run-empire-v2.js:3-6,36-37,108-126`.
- ModuleAutoLoader enumeration/catches: `core/ModuleAutoLoader.js:130-203,251-297`.
- Telegram and Discord producers: `utils/telegramNotifier.js:44-52,239-249`; `utils/discordNotifier.js:47-54,472-484`.
- Dashboard, checkout, and descriptor producers: `ogzprime-ssl-server.js:46`; `public/stripe-checkout.js:13`; `ecosystem.config.js:5-13`.
- Singleton inputs: `core/SingletonLock.js:10-43`; construction at `run-empire-v2.js:431-437`.
- Asset identity: `core/MultiAssetManager.js:30-57`; construction at `run-empire-v2.js:1889-1890`.
- TrAI pack path: `core/TRAIDecisionModule.js:88-91`; construction at `run-empire-v2.js:769-779`.
- Pattern storage/save inputs: `core/UnifiedPatternMemory.js:226-250`; `core/TradingLoop.js:2157-2163`.
- Output/narrator/session inputs: `core/OutputPaths.js:11-17,46-53`; `core/TradeNarrator.js:290-309`; `server/dashboard-session-auth.js:92-113`.
- Bot read-only toolbox coupling and missing reporter connection: `core/trai_core.js:67-69,113-121,886-898`; `core/TRAIDecisionModule.js:133-145`; `trai_brain/read_only_tools.js:1-11,31-35`; `trai_brain/mercury-bridge/config.js:310-335`.
- Credential-derived telemetry identity and live caller: `core/BotStateFrame.js:99-145`; `core/WebSocketManager.js:399-410`.
- Configuration-dependent fatal context and raw diagnostics: `run-empire-v2.js:143-163,193-203,315-329,3650-3655`; `core/ModuleAutoLoader.js:179-200`.
- Supervisor deadman diagnostic and dynamic hook: `scripts/supervisor-daemon.js:202-242`.
- Supervisor-owned generated HMAC key: `core/Supervisor.js:143,848-877`.
- Durable sink behavior: `core/RuntimeAuditSink.js:3-4,125-205`.

## Proof limits

No bot, dashboard, Stripe service, supervisor, PM2 process, broker, provider, webhook, Sentry event, ntfy request, Telegram request, Discord request, or phone was operated.

No deployed environment, process revision, credential delivery, authentication, recovery, or notification result is proved.

The ignored `.env` was not read during this correction. No value or value-derived fingerprint is present in the packet.

## Footer

WHAT I DID: recorded the frozen source receipts, independently reproduced the 41-file candidate list, and disclosed the two aggregate-count differences instead of copying them as fact.

WHAT I DID NOT DO: treat syntax matches as implementation authorization or claim runtime acceptance.

WHAT I ASSUMED: the implementation must rerun this census and every direct receipt at its eventual landed SHA.
