# Test Authority Census — Phase 1

Date: 2026-08-28
Mandate: HYGIENE
Checkout: `codex/multi-asset-symbol-state` at `2d6eed4459634abf20687b62fca681f2a72c3272`
Disposition authority: Trey rules every row. These are census classifications, not deletion or retention rulings.

## Scope and method

- Census universe was regenerated with `rg --files -g '*.test.js' | LC_ALL=C sort`: **195 files**.
- “Real runner loaded” means the test imports and instantiates/calls `run-empire-v2.js` or `core/BacktestRunner.js`. Reading runner source, testing worker-env construction, or importing a tool that could launch a runner is **not** runner load.
- “Trade-path execution” means executable strategy, orchestration, risk, state, order, broker-routing, cutoff, or runtime candle-path code is called. Static source assertions are marked no even when they inspect trade-path files.
- “Broker involvement” distinguishes real adapter code with mocked transport, injected/fake adapter boundaries, config/identity-only references, and none. No row contacted a live broker.
- “Can stay green” is scoped to the integrated behavior named by the test. “Yes” identifies the unexercised seam that can break while the asserted slice remains green.
- Git regression evidence is **UNRESOLVED for every row**. This Orb began at a one-commit shallow boundary; `git log --all -- '*.test.js'` exposes only the synthetic boundary commit, which introduced the entire visible tree and cannot prove a test ever caught a regression. Fetching history would mutate `.git` outside the Phase 1 territory, so no SHA is manufactured.
- Classification meanings:
  - `KEEP-RUNTIME-PROOF`: loads a real runtime/backtest runner and exercises the named runtime path.
  - `KEEP-TRIPWIRE`: focused executable or static contract with bounded authority.
  - `REMOVE-CANDIDATE`: duplicate/archived test outside the active Jest collection; candidate only.
  - `UNRESOLVED`: authority could not be established from this checkout.
- Test execution was not attempted: `node_modules` is absent and the bootstrap gate probe fails on missing `axios`. Installing dependencies would modify outside the authorized territory. Census findings are therefore source-derived, not a green-suite claim.

## Census

| File | Entry points reached | Real runner loaded | Trade-path execution | Broker involvement | Mocked boundaries | Can stay green while integrated behavior is broken | Git evidence it caught a real regression | Classification |
|---|---|:---:|:---:|---|---|---|---|---|
| `ogz-meta/inbox/codex/2026-07-14/worktree-collapse/OGZPMLV2-profile-verify-20260604/untracked/test/backtest-worker-env.test.js` | archived `backtest-worker-env`, tuning profiles, confidence grid | N | N | config identity only | environment inputs | Y — archived copy is ignored by active Jest and cannot guard current modules | UNRESOLVED | REMOVE-CANDIDATE |
| `ogz-meta/inbox/codex/2026-07-14/worktree-collapse/OGZPMLV2-tfe-phase2/untracked/test/timeframe-engine.test.js` | archived `TimeframeEngine` | N | Y | none | clock/candle fixtures | Y — archived copy is ignored by active Jest and duplicates the live test | UNRESOLVED | REMOVE-CANDIDATE |
| `pine-transpiler/__tests__/PineCorpus.catalog.test.js` | `PineRuntime`, corpus catalog | N | N | none | corpus files | Y — catalog/load coverage does not prove emitted strategy integration | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineFeatureScanner.refusal.test.js` | `PineFeatureScanner`, CLI refusal scan | N | N | none | temp Pine sources / child process | Y — scanner rules can pass while runtime semantics break | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineParityHarness.test.js` | `PineParityHarness` | N | N | none | fixture candles and TradingView exports | Y — harness integrity does not prove live strategy bridge wiring | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineParser.call-vs-def.test.js` | `PineLexer`, `PineParser` | N | N | none | source strings | Y — parser slice does not execute runtime | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineRuntime.cast-fns.test.js` | `PineRuntime` casts | N | N | none | synthetic Pine bars | Y — cast behavior can pass while strategy integration fails | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineRuntime.fabrication-purge.test.js` | `PineRuntime` TA execution | N | Y | none | synthetic Pine programs/bars | Y — Pine-only execution omits OGZ orchestration and orders | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineRuntime.load-refusal.test.js` | `PineRuntime` load gate | N | N | none | source strings | Y — refusal gate does not prove supported programs execute correctly | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineRuntime.noop-ta-arg.repro.test.js` | `PineRuntime` compile/load | N | N | none | synthetic Pine programs | Y — targeted type refusal omits integration | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineRuntime.sms-v4-behavior.test.js` | `PineRuntime`, SMS-v4 corpus | N | Y | none | frozen corpus fixture | Y — frozen Pine signals do not reach OGZ orders | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineRuntime.tv-oracle.test.js` | `PineRuntime` arithmetic | N | N | none | synthetic programs | Y — arithmetic parity is isolated | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineRuntime.type-violation.test.js` | `PineRuntime` type gate | N | N | none | synthetic programs | Y — type gate omits runtime integration | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineTALib.edge-evidence.test.js` | `PineTALib` | N | N | none | numeric vectors | Y — indicator unit vectors omit parser/runtime/trading integration | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineTALib.golden.test.js` | `PineTALib`, shared `IndicatorCalculator` | N | Y | none | numeric goldens | Y — math parity omits orchestrator and execution | UNRESOLVED | KEEP-TRIPWIRE |
| `pine-transpiler/__tests__/PineTupleAssignment.test.js` | lexer → parser → runtime → TA library | N | N | none | synthetic Pine source | Y — transpiler pipeline omits OGZ strategy bridge/orders | UNRESOLVED | KEEP-TRIPWIRE |
| `test/active-trade-direction-writer-guard.test.js` | Serena scanner over active-trade writers | N | N | none | filesystem/source scan | Y — static writer grep cannot prove dynamic direction flow | UNRESOLVED | KEEP-TRIPWIRE |
| `test/adaptive-timeframe-fee-model.test.js` | `FeeModel` → `AdaptiveTimeframeSelector` | N | Y | fee model only | numeric fee context | Y — no runner, market feed, or order route | UNRESOLVED | KEEP-TRIPWIRE |
| `test/aggregate-source-backfill.test.js` | runtime source contract scan | N | N | none | filesystem/source text | Y — static absence/presence checks miss dynamic candle routing | UNRESOLVED | KEEP-TRIPWIRE |
| `test/alpaca-adapter-candles.test.js` | real `AlpacaAdapter` methods | N | Y | Alpaca adapter; HTTP mocked | `axios`, trace sink | Y — no Alpaca network/account and no runner consumer | UNRESOLVED | KEEP-TRIPWIRE |
| `test/alpaca-data-stream-resilience.test.js` | real `AlpacaAdapter` stream state machine | N | Y | Alpaca adapter; WS mocked | `ResilientWebSocket`, timers, trace | Y — fake socket cannot prove provider protocol/live reconnect | UNRESOLVED | KEEP-TRIPWIRE |
| `test/auth-failure-guard.test.js` | `AuthFailureGuard`, Kraken and Alpaca adapter error paths, `KillSwitch` | N | Y | adapter code; transports mocked | ConfigLoader, `ws`, `axios`, trace | Y — synthetic failures omit live provider payloads and runner halt wiring | UNRESOLVED | KEEP-TRIPWIRE |
| `test/backtest-config-overrides.test.js` | `BacktestConfigOverrides` → `ConfigLoader` | N | Y | config identity only | process environment/module cache | Y — config acceptance does not run a backtest | UNRESOLVED | KEEP-TRIPWIRE |
| `test/backtest-recorder-scope.test.js` | `BacktestRecorder`, `BacktestRunner` helper paths | Y | Y | broker identity fields only | synthetic trades/runner context | Y — recorder assertions omit full candle-to-order runner loop | UNRESOLVED | KEEP-RUNTIME-PROOF |
| `test/backtest-report-asset-slug.test.js` | standalone report slug helper | N | N | data-file identity only | fixture instrument/file path | Y — filename authority does not prove runner behavior | UNRESOLVED | KEEP-TRIPWIRE |
| `test/backtest-runner-runtime-path.test.js` | real `BacktestRunner` → scoped candle processor/trading-cycle callback | Y | Y | injected runtime broker identity | ConfigLoader, StateManager, ledger, synthetic candle file | Y — proves the covered runner boundary, but state/broker/order execution remain mocked | UNRESOLVED | KEEP-RUNTIME-PROOF |
| `test/backtest-worker-env.test.js` | worker-env builder, profiles, fees, confidence grid | N | N | config identity only | parent env, temp dotenv/config, child-process inspection | Y — launch contract can pass while spawned runner behavior breaks | UNRESOLVED | KEEP-TRIPWIRE |
| `test/bot-state-frame.test.js` | `BotStateFrame` | N | N | static broker/profile projection | clock/session fixtures | Y — frame projection omits runtime producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/campaign-integrity.test.js` | `campaign-integrity` validator | N | N | report identity only | report/data fixtures, hashes | Y — artifact validation cannot prove campaign execution correctness | UNRESOLVED | KEEP-TRIPWIRE |
| `test/candle-aggregator-completeness.test.js` | `CandleAggregator` | N | Y | none | candle fixtures | Y — aggregation unit omits source feed and consumers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/candle-history-runtime-timeframe.test.js` | real `run-empire-v2` history load/save methods | Y | Y | runner broker construction bypassed | instrument and singleton lock | Y — covered history methods run, but broker/feed/trading cycle are not integrated | UNRESOLVED | KEEP-RUNTIME-PROOF |
| `test/chart-panel-symbol-filter.test.js` | dashboard chart panel in VM | N | N | symbol labels only | DOM, WebSocket, timers | Y — VM stubs omit browser/server integration | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claude-bridge-edit-ledger.test.js` | bridge read/edit ledger hooks | N | N | none | temp files/session IDs | Y — hook units omit actual Claude host lifecycle | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claude-bridge-finish-gate.test.js` | bridge finish gate | N | N | path classification only | git/tree/proof fixtures | Y — synthetic receipts omit host enforcement | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claude-bridge-hook-input.test.js` | hook input reader | N | N | none | stdin objects | Y — parser unit omits host hook delivery | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claude-bridge-policy.test.js` | bridge ignore policy | N | N | none | temp paths/config | Y — policy unit omits all hook integration | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claude-bridge-pre-bash.test.js` | bridge Bash gate | N | N | none | command strings / child process | Y — command classifier cannot prove every shell/host bypass is closed | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claude-bridge-proof-writer.test.js` | proof writer → finish gate | N | N | path classification only | temp proof files | Y — paperwork validation omits actual mission execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claude-bridge-task-contract.test.js` | task contract → pre-read/edit/bash | N | N | path classification only | hook/session fixtures | Y — direct function tests omit host sequencing | UNRESOLVED | KEEP-TRIPWIRE |
| `test/claudito-track-record-config.test.js` | `claudito-logger` proof publisher | N | N | account/broker labels only | `AtomicWrite`, env/config fixtures | Y — generated proof contract omits raw journal/runtime provenance | UNRESOLVED | KEEP-TRIPWIRE |
| `test/config-audit-no-env-mutation.test.js` | `config-audit` → `ConfigLoader` | N | N | broker config only | temp dotenv/repo | Y — audit tool can pass while consumers bypass it | UNRESOLVED | KEEP-TRIPWIRE |
| `test/config-boundary-detector.test.js` | config scanner → `ConfigLoader` | N | N | broker config only | source fixtures | Y — scanner patterns do not prove runtime ownership | UNRESOLVED | KEEP-TRIPWIRE |
| `test/config-loader-live-guard.test.js` | real `ConfigLoader` profile/live guards | N | Y | broker identity/config only | trading config module, env | Y — config guard omits runner and broker connection | UNRESOLVED | KEEP-TRIPWIRE |
| `test/config-loader-no-process-env-mutation.test.js` | `ConfigLoader` resolution | N | N | broker config only | temp config/env | Y — loader unit omits consumer behavior | UNRESOLVED | KEEP-TRIPWIRE |
| `test/core-module-init-contract.test.js` | dashboard core module registry in VM | N | N | none | DOM/VM module stubs | Y — simulated shell omits browser integration | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-asset-change-runtime-guard.test.js` | `WebSocketManager`, `MultiAssetManager`, symbol context/registry | N | Y | transition-owner boundary faked | socket/bot/transition collaborators | Y — no server, broker transition, or runner | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-bot-state-contract.test.js` | server source + `BotStateFrame` + frontend source | N | N | broker labels only | source text | Y — static producer/consumer strings do not prove message flow | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-broadcaster-symbol.test.js` | `DashboardBroadcaster` | N | N | symbol normalization only | websocket clients/time | Y — fake clients omit server transport and producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-depth-coalescer.test.js` | `DashboardDepthCoalescer` | N | N | market-depth identity only | timer/send callbacks | Y — coalescer unit omits feed and dashboard socket | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-empire-scope-contract.test.js` | dashboard source contracts | N | N | market venue labels only | source text | Y — static contract misses runtime state mutation | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-equity-source-contract.test.js` | `CandleProcessor` → `StateManager` dashboard frames | N | Y | broker/account projection only | bot, websocket, storage collaborators | Y — no runner, feed, or real persisted account | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-layout-containment.test.js` | dashboard HTML/CSS contracts | N | N | none | source text | Y — static CSS checks omit browser layout/rendering | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-market-scope.test.js` | market-scope helper → ticker-frame helper | N | N | venue identity validation | input envelopes | Y — helper unit omits broker feed/server routing | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-milestone-effects-flag.test.js` | milestone panel in VM | N | N | none | DOM/localStorage/timers | Y — VM omits browser module lifecycle | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-panel-mount-contract.test.js` | panel source/mount contracts | N | N | none | source text/Intl fallback | Y — static contracts omit rendered dashboard | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-pattern-contract.test.js` | pattern producer contract | N | N | none | input objects | Y — normalization helper omits pattern engine and client | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-profile-command-runtime-guard.test.js` | `WebSocketManager`, performance integration, `StateManager` | N | Y | none | dashboard socket/bot/state collaborators | Y — direct handlers omit server authentication and runner lifecycle | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-session-auth.test.js` | dashboard cookie/ticket auth | N | N | none | request/response/time | Y — helper test omits TLS/proxy/WebSocket deployment | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-stock-stream-config.test.js` | stock stream config helper | N | N | Alpaca stream config only | source/env inputs | Y — no adapter or stream connection | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-ticker-frame.test.js` | ticker frame builder | N | N | Alpaca/Kraken-shaped inputs | snapshots | Y — frame unit omits real feed and broadcast | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-token-leak-static.test.js` | dashboard server/public/ignore source scans | N | N | none | filesystem and child-process grep | Y — static containment omits deployed proxy/cache responses | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dashboard-v2-ghost-modules-contract.test.js` | v2 shell/module source contracts | N | N | none | source text | Y — static imports/mounts omit browser execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/data-feed-liveness-no-pause.test.js` | runner liveness source contract | N | N | feed labels only | source text | Y — static assertion does not execute watchdog/state interactions | UNRESOLVED | KEEP-TRIPWIRE |
| `test/data-parity-check.test.js` | `data-parity-check` | N | N | journal broker identity only | candle/report/journal fixtures | Y — parity validator cannot prove live and backtest producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/decision-autopsy-logger.test.js` | `DecisionAutopsyLogger` | N | Y | none | temp filesystem | Y — logger unit omits decision/execution producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/decision-autopsy-report.test.js` | autopsy report generator | N | N | broker labels only | autopsy files | Y — reporting can pass while runtime logging is absent/wrong | UNRESOLVED | KEEP-TRIPWIRE |
| `test/decision-ledger-logger-validation.test.js` | `DecisionLedgerLogger` validation route | N | Y | none | schema module, filesystem | Y — logger failure route omits full decision path | UNRESOLVED | KEEP-TRIPWIRE |
| `test/decision-ledger-schema.test.js` | `DecisionLedgerSchema` | N | Y | broker fields only | DTO objects | Y — schema unit omits all producers and persistence | UNRESOLVED | KEEP-TRIPWIRE |
| `test/donchian-breakout.test.js` | indicator → `DonchianBreakout` → orchestrator registration | N | Y | none | candles/config | Y — signal tests omit winner selection, exits, and orders | UNRESOLVED | KEEP-TRIPWIRE |
| `test/dynamic-position-sizer-pattern-mitigation.test.js` | `DynamicPositionSizer` → config | N | Y | broker constraints/config only | pattern/config fixtures | Y — sizing unit omits executor/broker acceptance | UNRESOLVED | KEEP-TRIPWIRE |
| `test/ecosystem-eval-profile.test.js` | ecosystem config → eval deploy wrapper | N | N | Alpaca/SignalStack config only | env, dotenv, PM2 command builder | Y — does not touch real PM2, broker, or webhook | UNRESOLVED | KEEP-TRIPWIRE |
| `test/ema-crossover-trey-spec.test.js` | `EMASMACrossoverSignal` | N | Y | none | candles/config | Y — strategy unit omits orchestrator/execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/ema-trend-retest.test.js` | `EMATrendRetest` → orchestrator registration | N | Y | none | candles/config | Y — no runner or execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/eval-live-posture-gate.test.js` | eval posture gate → `ConfigLoader` | N | Y | Alpaca/webhook/PM2 identity, no connection | env, PM2 snapshots, HTTP client inputs | Y — posture metadata can pass while live broker/webhook behavior fails | UNRESOLVED | KEEP-TRIPWIRE |
| `test/eval-rule-engine.test.js` | `EvalRuleEngine` | N | Y | volume/calendar provider inputs faked | candles, clock, provider responses | Y — rule engine unit omits executor and provider runtime | UNRESOLVED | KEEP-TRIPWIRE |
| `test/eval-signal-path-proof.test.js` | real `TradingLoop` → `OrderExecutor` → `OrderRouter` methods | N | Y | router/broker boundary injected | StateManager, proof logger, broker/router collaborators | Y — broad path slice still mocks state persistence and all broker effects | UNRESOLVED | KEEP-TRIPWIRE |
| `test/eval-trade-inspector-timezone.test.js` | eval inspector formatter | N | N | none | timestamps | Y — formatting omits trade data production | UNRESOLVED | KEEP-TRIPWIRE |
| `test/event-loop-monitor-alert-only.test.js` | `EventLoopMonitor` → `StateManager` policy | N | Y | none | StateManager, timers/logger | Y — synthetic lag omits actual event-loop/runtime load | UNRESOLVED | KEEP-TRIPWIRE |
| `test/exit-contract-manager-ownership.test.js` | `ExitContractManager` → frozen policy/config | N | Y | broker fee/config fields only | contracts/config | Y — contract birth omits strategy winner and execution consumers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/exit-geometry-producers.test.js` | FVG/liquidity/no-wick/SMS/oscillator producers | N | Y | none | candles/config | Y — producer contracts omit orchestrator/executor | UNRESOLVED | KEEP-TRIPWIRE |
| `test/feature-flag-manager-no-emoji.test.js` | `FeatureFlagManager` | N | N | profile labels only | console/env/filesystem | Y — logging/config unit omits consumers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/fee-model.test.js` | fee → PnL → recorder → exit helpers | N | Y | fee profiles only | fills/trades/config | Y — calculations omit broker fill semantics and runner | UNRESOLVED | KEEP-TRIPWIRE |
| `test/fetch-stock-data-script.test.js` | stock fetch script | N | N | Alpaca request construction only | HTTP fetch/config, fixture bars | Y — request shape test omits live API/download integrity | UNRESOLVED | KEEP-TRIPWIRE |
| `test/frontend-websocket-lifecycle.test.js` | frontend WebSocket lifecycle in VM | N | N | broker symbols only | WebSocket, DOM, timers | Y — VM socket omits server/auth/network | UNRESOLVED | KEEP-TRIPWIRE |
| `test/fvg-detector.test.js` | `FairValueGapDetector` | N | Y | none | candles | Y — detector unit omits registration/orchestration | UNRESOLVED | KEEP-TRIPWIRE |
| `test/indicator-calculator-rsi.test.js` | shared RSI/ATR calculator | N | Y | none | numeric candles | Y — indicator math omits all consumers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/instrument-env.test.js` | instrument-env resolver | N | N | Alpaca/Kraken identity only | config objects | Y — identity mapping omits adapters/runners | UNRESOLVED | KEEP-TRIPWIRE |
| `test/kraken-adapter-simple-execute-trade.test.js` | real simple Kraken adapter `executeTrade` | N | Y | Kraken adapter; placement method mocked | order placement/auth/client | Y — no Kraken API and no upstream executor | UNRESOLVED | KEEP-TRIPWIRE |
| `test/kraken-adapter-simple-symbol.test.js` | simple Kraken adapter stream parser + depth adapter | N | Y | Kraken adapter; WS mocked | `ws`, callbacks | Y — fake WS omits real payload/reconnect and runner | UNRESOLVED | KEEP-TRIPWIRE |
| `test/kraken-ibroker-execute-trade-symbol.test.js` | `KrakenIBrokerAdapter.executeTrade` | N | Y | Kraken wrapper; inner adapter mocked | underlying Kraken calls | Y — wrapper test omits real adapter/network/upstream route | UNRESOLVED | KEEP-TRIPWIRE |
| `test/legacy-chart-startup-contract.test.js` | legacy chart source contract | N | N | symbol labels only | source text | Y — static checks omit browser/socket | UNRESOLVED | KEEP-TRIPWIRE |
| `test/liquidity-sweep-interval.test.js` | `LiquiditySweepDetector` interval path | N | Y | none | clock/candles | Y — detector unit omits runtime source timing and execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/live-report-outcome-contract.test.js` | live-report panel VM | N | N | broker/trace labels only | DOM, module bus, messages | Y — VM rendering omits backend trace/trade producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/liveness-watchdog-market-phase-contract.test.js` | `MarketCalendar` + watchdog source | N | N | market calendar only | clock/source text | Y — does not execute runner watchdog or feed | UNRESOLVED | KEEP-TRIPWIRE |
| `test/marketing-pages-static-contract.test.js` | marketing HTML/JS static contract | N | N | none | source/filesystem | Y — no browser, endpoints, or deployment | UNRESOLVED | KEEP-TRIPWIRE |
| `test/masr-restoration.test.js` | `MADynamicSR` | N | Y | none | candles/config | Y — strategy unit omits orchestrator/execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/matrix-sweep-surface.test.js` | matrix-sweep/tooling/env/profile surface | N | N | broker/config identity only | worker launcher, config, filesystem | Y — launch matrix can pass while workers/backtests fail | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-consensus.test.js` | Mercury adversarial review → Fable consensus → CLI parsing | N | N | none | provider commands/responses, filesystem | Y — mocked providers omit actual model/CLI service behavior | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-embed-index-identity.test.js` | Mercury config → Mongo-store identity | N | N | none | config/env/Mongo metadata | Y — no live embedding/index query | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-index-scope.test.js` | config → indexer/router/searcher/tools | N | N | none | child process, filesystem, Mongo/search | Y — mocked storage/tools omit live full index | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-llm-config-contract.test.js` | Mercury config → LLM client/CLI/searcher | N | N | none | provider/env/config responses | Y — no real provider round trip | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-provider-preflight.test.js` | provider preflight | N | N | none | provider clients/errors | Y — classified stubs omit current credentials/network/provider | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-react-loop.test.js` | Mercury ReAct loop/evidence gates | N | N | none | tools and LLM responses | Y — synthetic tools/model omit live investigation | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-run-ledger.test.js` | Mercury run ledger | N | N | broker tokens only as redaction fixtures | filesystem, provider/consensus results | Y — ledger unit omits actual dispatch and evidence truth | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-serena-ast-tools.test.js` | Mercury tool adapter → Serena scanner | N | N | none | temp source/tool calls | Y — bounded fixtures omit repository-scale AST behavior | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-substrate-digest.test.js` | substrate digest | N | N | none | ledger records | Y — summary formatter omits live Mercury runs | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-tool-descriptions.test.js` | tool schema descriptions | N | N | none | schema text | Y — descriptions do not prove tools execute correctly | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mercury-trace-memory.test.js` | trace-memory guard/config | N | N | none | child process/config | Y — no live Mongo trace lifecycle | UNRESOLVED | KEEP-TRIPWIRE |
| `test/mtf-runtime-base-timeframe-contract.test.js` | runner source contract | N | N | broker timeframe labels only | source text | Y — static ordering check omits runner construction | UNRESOLVED | KEEP-TRIPWIRE |
| `test/multi-runtime-gate-runner-eval-pm2.test.js` | multi-runtime gate command/report builder | N | N | PM2 broker config only | PM2/env/child command | Y — explicitly avoids real PM2 and gate worker | UNRESOLVED | KEEP-TRIPWIRE |
| `test/multi-timeframe-adapter-source-timeframe.test.js` | `MultiTimeframeAdapter` | N | Y | none | candles/filesystem source checks | Y — adapter unit omits orchestrator and runtime feed | UNRESOLVED | KEEP-TRIPWIRE |
| `test/news-ticker-source-state.test.js` | news ticker panel VM | N | N | news provider states only | DOM/module bus/messages | Y — fake messages omit provider/backend | UNRESOLVED | KEEP-TRIPWIRE |
| `test/nowick-imbalance-scope.test.js` | `NoWickImbalance` → orchestrator state scope | N | Y | none | candles/config/orchestrator collaborators | Y — no runner/order execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/ntfy-trace-notifier.test.js` | `NtfyTraceNotifier` | N | Y | notification HTTP endpoint only | fetch/trace/env | Y — mocked notifier transport omits runtime trace producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/ogz-tpo-integration.test.js` | `OgzTpoIntegration` | N | Y | none | config/candles/oscillator inputs | Y — strategy unit omits orchestrator/orders | UNRESOLVED | KEEP-TRIPWIRE |
| `test/ohlc-normalize.test.js` | OHLC normalizer | N | Y | Kraken-shaped values only | data objects | Y — parser unit omits adapter/feed consumers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/opening-range-breakout.test.js` | `OpeningRangeBreakout` state machine | N | Y | none | candles/clock | Y — strategy unit omits orchestrator/execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/order-executor-no-emoji.test.js` | static `OrderExecutor` source scan | N | N | none | source text | Y — cosmetic tripwire says nothing about executor behavior | UNRESOLVED | KEEP-TRIPWIRE |
| `test/order-executor-pause-gate.test.js` | real `OrderExecutor.executeTrade` and internal entry/exit/reconciliation paths | N | Y | router/webhook/broker reads all injected | StateManager, logger, router, webhook, gate, recorder, broker snapshots | Y — extensive executor coverage still replaces every external/state integration boundary | UNRESOLVED | KEEP-TRIPWIRE |
| `test/order-executor-trai-learning-payload.test.js` | `OrderExecutor` → TRAI core/decision learning payload | N | Y | broker/router effects injected | StateManager, logger, TRAI/storage collaborators | Y — no runner, broker, or persistent learning store integration | UNRESOLVED | KEEP-TRIPWIRE |
| `test/order-router-cancel.test.js` | real `OrderRouter` cancellation/position aggregation | N | Y | fake registered adapters | adapter methods, trace | Y — fake adapters omit provider capabilities and runner | UNRESOLVED | KEEP-TRIPWIRE |
| `test/order-router-explicit-registration.test.js` | real `OrderRouter` lookup/send | N | Y | fake registered adapters | adapter methods, trace | Y — registration unit omits factory, credentials, and provider | UNRESOLVED | KEEP-TRIPWIRE |
| `test/parallel-backtest-solo-env.test.js` | parallel-backtest launcher/env/profile surface | N | N | broker/config identity only | worker launcher and environment | Y — never executes worker runner | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pattern-card-flat-outcome.test.js` | pattern-card source contract | N | N | none | source text | Y — static rendering assertion omits browser/messages | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pattern-maturity.test.js` | `PatternMaturity` | N | Y | none | sample counts | Y — classifier unit omits memory producers/consumers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pattern-memory-eviction-boundary.test.js` | `PatternMemoryBank`, `UnifiedPatternMemory`, caller census | N | Y | scope config only | filesystem/config/time | Y — direct stores and static caller counts omit runtime concurrency | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pattern-memory-flood.test.js` | indicators → feature extractor → pattern recognition | N | Y | none | synthetic 500-candle stream | Y — local pipeline omits runtime persistence and trade outcomes | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pattern-memory-scope.test.js` | `UnifiedPatternMemory` ↔ `PatternMemoryBank` scoped storage | N | Y | broker/scope identity only | temp filesystem/config/time | Y — persistence units omit runner handoff/concurrency | UNRESOLVED | KEEP-TRIPWIRE |
| `test/persistent-llm-client-metadata.test.js` | persistent LLM client wrapper | N | N | none | provider responses/client methods | Y — no real inference service | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pipeline-operator-review-contract.test.js` | pipeline/slash-router source and historical git source | N | N | hot-path names only | filesystem/git show | Y — static absence checks cannot prove all commit paths or runtime enforcement | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pipeline-snapshot-scope.test.js` | `PipelineSnapshot` | N | Y | broker/account scope only | bot/StateManager view | Y — snapshot projection omits live state producer | UNRESOLVED | KEEP-TRIPWIRE |
| `test/pipeline-snapshot-state-source.test.js` | `PipelineSnapshot` → mocked singleton StateManager | N | Y | none | StateManager | Y — state source is mocked, so singleton/runtime wiring may break | UNRESOLVED | KEEP-TRIPWIRE |
| `test/policy-builder.test.js` | `PolicyBuilder` → frozen exit policy/config | N | Y | fee/broker policy fields only | config/contracts | Y — policy unit omits strategy and executor ownership | UNRESOLVED | KEEP-TRIPWIRE |
| `test/position-effect-trace-contract.test.js` | position effect → trace → recorder/StateManager | N | Y | broker verbs modeled only | StateManager/storage/trace subscribers | Y — no order router or broker fill | UNRESOLVED | KEEP-TRIPWIRE |
| `test/position-tracker-exit-contract.test.js` | `PositionTracker` → StateManager delegate | N | Y | none | StateManager | Y — delegation test omits real state lifecycle and executor caller | UNRESOLVED | KEEP-TRIPWIRE |
| `test/profit-exit-planner.test.js` | `ProfitExitPlanner` → frozen policy | N | Y | explicitly no broker/state fields | policy/market fixtures | Y — planner intentionally omits broker/state execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/propsafe-ema-pullback.test.js` | indicator → `PropSafeEMAPullback` → orchestrator registration | N | Y | none | candles/config | Y — signal unit omits runner/order path | UNRESOLVED | KEEP-TRIPWIRE |
| `test/rest-recovery-trace-contract.test.js` | runner source contract | N | N | REST source labels only | source text | Y — static trace call checks omit recovery execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/risk-manager-config.test.js` | risk config → `RiskManager` plus runner source wiring | N | Y | broker constraints modeled only | config/state/logger | Y — does not run runner or broker checks | UNRESOLVED | KEEP-TRIPWIRE |
| `test/rsi-deterministic.test.js` | `IndicatorEngine` → indicator DTO | N | Y | none | textbook vectors | Y — indicator math omits strategy/execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/rsi2-mean-reversion.test.js` | `RSI2MeanReversion` → orchestrator registration | N | Y | none | candles/config | Y — strategy unit omits runner/orders | UNRESOLVED | KEEP-TRIPWIRE |
| `test/runtime-audit-sink.test.js` | `RuntimeAuditSink` | N | Y | broker/scope fields only | temp filesystem/time | Y — sink persistence omits runtime producers/response | UNRESOLVED | KEEP-TRIPWIRE |
| `test/runtime-config-proof.test.js` | `RuntimeConfigProof` | N | Y | broker/config provenance only | config receipts | Y — proof serialization omits actual runtime consumption | UNRESOLVED | KEEP-TRIPWIRE |
| `test/runtime-log-no-emoji.test.js` | static runtime source scan | N | N | none | source text | Y — cosmetic tripwire cannot prove runtime behavior | UNRESOLVED | KEEP-TRIPWIRE |
| `test/secret-scanner-template.test.js` | secret scanner | N | N | credential-name fixtures only | source strings/config | Y — scanner patterns can miss deployed/generated secrets | UNRESOLVED | KEEP-TRIPWIRE |
| `test/serena-symbol-scanner.test.js` | Serena tree-sitter scanner | N | N | none | temp source files | Y — fixture AST coverage omits repository/language edge cases | UNRESOLVED | KEEP-TRIPWIRE |
| `test/session-router-epoch-fencing.test.js` | real `SessionRouter` transition/OHLC callbacks | N | Y | broker/session collaborators fake | adapters, state, memory, clock/filesystem | Y — broker and runner boundaries are injected | UNRESOLVED | KEEP-TRIPWIRE |
| `test/session-router-fail-safe.test.js` | real `SessionRouter` transition/flatten/reconcile logic | N | Y | fake broker adapters/REST positions | executeTrade, adapters, StateManager, memory, storage | Y — no real runner, broker, or order execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/session-router-runtime-scope.test.js` | `TradingLoop` + `OrderExecutor` scope/payload methods | N | Y | webhook/router boundaries injected | StateManager, logger, router/webhook/dashboard | Y — no router transition, runner, or broker integration | UNRESOLVED | KEEP-TRIPWIRE |
| `test/session-router-stock-symbol-config.test.js` | real `SessionRouter` plus `run-empire-v2` constructor/methods | Y | Y | broker constructors bypassed | instrument, bot/router collaborators | Y — exercises runner configuration but not feed/order/provider integration | UNRESOLVED | KEEP-RUNTIME-PROOF |
| `test/session-router-transition-journal.test.js` | real `SessionRouter` → transition store/journal/intents | N | Y | fake broker side effects | executeTrade, adapters, filesystem, state/memory | Y — durable journal logic omits actual broker/provider effects | UNRESOLVED | KEEP-TRIPWIRE |
| `test/session-router-transition-store-status.test.js` | static router status → transition store | N | Y | none | temp transition files | Y — status projection omits transition execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/session-router-transition-store.test.js` | `TransitionStore` | N | Y | broker intent records only | filesystem/clock | Y — store unit omits SessionRouter and broker side effects | UNRESOLVED | KEEP-TRIPWIRE |
| `test/single-broker-subscription-symbols.test.js` | real `run-empire-v2` subscription/execute methods + SessionRouter | Y | Y | broker/feed/order methods injected | instrument, singleton, StateManager, adapters/router | Y — broad runner slice still has no provider/network/persistence integration | UNRESOLVED | KEEP-RUNTIME-PROOF |
| `test/smart-money-sweep-conviction-ladder.test.js` | `SmartMoneySweep` → config ladder | N | Y | none | candles/config | Y — strategy unit omits orchestrator/orders | UNRESOLVED | KEEP-TRIPWIRE |
| `test/state-manager-apply-fill-ledger.test.js` | real `StateManager.applyFill` → trace/ledger/persistence | N | Y | broker fill fields modeled only | decision ledger, filesystem/config | Y — no broker/executor and ledger logger is mocked | UNRESOLVED | KEEP-TRIPWIRE |
| `test/state-manager-dashboard-frame.test.js` | real StateManager mutation → dashboard frame | N | Y | account/broker scope only | filesystem/websocket/config | Y — no executor/broker fill producer | UNRESOLVED | KEEP-TRIPWIRE |
| `test/state-manager-load.test.js` | real StateManager load/recovery/persist paths | N | Y | broker reconciliation data modeled | AtomicWrite, temp files/config | Y — no runner/broker reconciliation owner | UNRESOLVED | KEEP-TRIPWIRE |
| `test/state-manager-open-position-scope.test.js` | real StateManager open/update/set/save boundaries | N | Y | broker/scope fields modeled | temp files/config/collaborators | Y — state units omit executor/router/provider | UNRESOLVED | KEEP-TRIPWIRE |
| `test/stock-data-adapter-ticker.test.js` | stock data adapter snapshot method | N | N | Alpaca client mocked | Alpaca snapshot API | Y — no real API/feed/broadcast | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-lab.test.js` | strategy-lab dossier generator | N | N | report broker/fee identity only | matrix/report files | Y — analysis tool cannot prove strategy runtime | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-breakretest-exits.test.js` | real orchestrator BreakRetest exit-contract path | N | Y | none | strategies/config/candles | Y — no runner/executor/broker | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-confidence-attribution.test.js` | real orchestrator ranking/attribution | N | Y | none | strategy outputs/config | Y — winner scoring omits executor/broker | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-contract-confidence.test.js` | real orchestrator confidence → exit-contract birth | N | Y | none | strategies/config/candles | Y — no runner/order route | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-ema-crossover-validity.test.js` | orchestrator EMA lane | N | Y | none | candles/config | Y — signal/contract slice omits execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-learning-shadow.test.js` | orchestrator winner → learning snapshot | N | Y | scope identity only | pattern memory/config | Y — pattern store and executor integration omitted | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-mtf-config-loader.test.js` | orchestrator MTF config consumption | N | Y | none | ConfigLoader/adapter state | Y — narrow config path omits runtime candles | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-mtf-source-timeframe.test.js` | orchestrator → mocked MTF adapter | N | Y | none | `MultiTimeframeAdapter`, config/candles | Y — central MTF implementation is mocked | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-mtf-strategy-confluence.test.js` | orchestrator strategy-specific MTF scoring | N | Y | none | adapter outputs/config | Y — no live timeframe readiness or execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-orb-exit-hint.test.js` | orchestrator ORB exit-hint path | N | Y | none | strategy result/config | Y — no runner/executor | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-pipeline-toggles.test.js` | orchestrator roster/toggles → config | N | Y | none | config/source fixtures | Y — registration tests omit runner and trade birth execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-rsi-truth.test.js` | shared RSI → inline orchestrator RSI lane | N | Y | none | candle seeds/config | Y — no runner/executor | UNRESOLVED | KEEP-TRIPWIRE |
| `test/strategy-orchestrator-symbol-state.test.js` | orchestrator stateful strategy instances by symbol | N | Y | none | strategy/config/candles | Y — isolated calls omit concurrent runtime routing | UNRESOLVED | KEEP-TRIPWIRE |
| `test/symbol-routing.test.js` | `CandleProcessor` → symbol context → StateManager paths | N | Y | Kraken/Alpaca-shaped events, adapters absent | bot/state/context collaborators | Y — no actual adapter, runner subscription, or order path | UNRESOLVED | KEEP-TRIPWIRE |
| `test/time-series-momentum.test.js` | `TimeSeriesMomentum` → orchestrator registration | N | Y | none | candles/config | Y — strategy unit omits runner/orders | UNRESOLVED | KEEP-TRIPWIRE |
| `test/timeframe-engine.test.js` | `TimeframeEngine` | N | Y | none | candles/config/filesystem contract | Y — engine unit omits feed/router consumers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trace-spine.test.js` | `TraceSpine` emit/dashboard/subscriber paths | N | Y | broker/scope fields only | subscribers/logger/dashboard | Y — synthetic trace calls omit runtime producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/track-record-timezone-contract.test.js` | track-record frontend source | N | N | none | source text | Y — timezone static check omits generated data/browser | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trade-journal-bridge-scope.test.js` | `TradeJournalBridge` scoped persistence/rebuild | N | Y | broker/scope identity only | filesystem/journal inputs | Y — bridge tests omit executor/StateManager/broker lifecycle | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trade-journal-today-stats.test.js` | `TradeJournal` persistence/stats | N | Y | broker/scope identity only | filesystem/clock/trades | Y — journal unit omits runtime producers | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trade-logger-honest-null.test.js` | trade logger → ConfigLoader | N | Y | broker labels only | filesystem/config | Y — logger unit omits execution producer and dashboard consumer | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trade-narrator-no-emoji.test.js` | `TradeNarrator` | N | Y | broker labels only | trade/architect inputs/logger | Y — prose unit omits runtime trade truth | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trade-replay-capture-contract.test.js` | `TradeReplayCapture` | N | Y | broker/scope fields only | filesystem/trade snapshots | Y — capture unit omits live trade lifecycle and replay consumer | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trading-config-profile.test.js` | ConfigLoader → profile manager/tuning/worker env | N | Y | broker/profile identity only | env/config/module cache | Y — profile resolution omits runner/broker execution | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trading-loop-trace-spine.test.js` | real `TradingLoop` analysis/trace paths | N | Y | broker/scope values injected | StateManager, exit contracts, autopsy logger, strategies/bot | Y — runner, real orchestrator state, order executor, and broker are absent | UNRESOLVED | KEEP-TRIPWIRE |
| `test/tradingconfig-no-dotenv-double-load.test.js` | ConfigLoader import ownership | N | N | none | `dotenv` | Y — import-count tripwire omits config behavior | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trai-brain-section-render.test.js` | TRAI dashboard panel VM | N | N | none | DOM/module bus | Y — renderer omits backend/TRAI socket | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trai-llm-config-contract.test.js` | TRAI LLM config → persistent client → TRAI core | N | N | none | provider process/client/config | Y — no real inference server or runner | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trai-pipeline-default.test.js` | ConfigLoader TRAI toggle | N | Y | none | env/config | Y — default resolution omits TRAI construction/decision path | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trai-symbol-extractor.test.js` | TRAI symbol extractor | N | N | none | text/source fixture | Y — NLP helper omits query/runtime integration | UNRESOLVED | KEEP-TRIPWIRE |
| `test/trai-widget-auth-token.test.js` | TRAI widget auth in VM | N | N | none | DOM/WebSocket/token meta | Y — VM omits server session/auth deployment | UNRESOLVED | KEEP-TRIPWIRE |
| `test/ttp-cutoff-enforcer.test.js` | real `TtpCutoffEnforcer` → eval rule → order/state/flatten decisions | N | Y | fake OrderRouter/broker positions/orders | StateManager, OrderRouter, executeTrade, clock/logger | Y — all broker, persistence, and executor effects are injected | UNRESOLVED | KEEP-TRIPWIRE |
| `test/watchlist-symbol-match.test.js` | watchlist panel VM | N | N | broker symbol shapes only | DOM/module bus/messages | Y — fake messages omit backend feed | UNRESOLVED | KEEP-TRIPWIRE |
| `test/webhook-order-adapter.test.js` | real `WebhookOrderAdapter` posture/send preparation | N | Y | SignalStack webhook transport mocked | fetch/config | Y — no real webhook acknowledgement or upstream executor | UNRESOLVED | KEEP-TRIPWIRE |
| `test/weekend-campaign-gauntlet.test.js` | weekend campaign signal-frequency validator | N | Y | report identity only | synthetic candles/campaign results | Y — frequency sanity omits runner, fees, state, exits, and broker | UNRESOLVED | KEEP-TRIPWIRE |

## Regenerated counts

| Measure | Count |
|---|---:|
| Total `*.test.js` files | 195 |
| Active Jest territory (`pine-transpiler/__tests__` + `test`) | 193 |
| Archived inbox copies ignored by Jest | 2 |
| Real runner loaded: Y | 5 |
| Real runner loaded: N | 190 |
| `KEEP-RUNTIME-PROOF` | 5 |
| `KEEP-TRIPWIRE` | 188 |
| `REMOVE-CANDIDATE` | 2 |
| `UNRESOLVED` classification | 0 |
| Git regression evidence `UNRESOLVED` | 195 |

## Authority observations

1. The suite is predominantly tripwire-level authority: 188 files directly test modules, static source contracts, tools, or simulated browser code without loading a real runner.
2. Five files load a real runner, but every one replaces one or more state, broker, transport, or orchestration boundaries. They prove named runtime slices, not live end-to-end trading.
3. Broker-facing tests execute real adapter/router classes but no live broker. HTTP, WebSocket, order, account, position, or adapter collaborators are mocked/injected.
4. The two `ogz-meta/inbox/.../*.test.js` files are preservation artifacts, are excluded by `package.json` Jest `testPathIgnorePatterns`, and duplicate live test subjects. Their `REMOVE-CANDIDATE` label is not a deletion ruling.
5. Static contract tests are intentionally classified as tripwires rather than runtime proof. They can catch deleted strings/imports/guards but cannot establish control flow, deployment, network, or broker truth.

## Inherited doctrine-violation receipts

These are receipts only. No file was changed and no ruling is made.

| File read closely | Inherited violation/contradiction observed |
|---|---|
| `CLAUDE.md` | Contains emoji in headings and banners while the same repository doctrine bans emoji in docs/output. |
| `ogz-meta/ledger/ogzprime-architecture.mermaid` | Contains extensive emoji despite the no-emoji doctrine; also presents stale architecture (`AdvancedExecutionLayer`, direct Kraken-centered runner flow) that conflicts with current live modules and the maintained Alignment warning that diagrams are context, not live truth. |
| `ogz-meta/ledger/ogzprime-broker-chain.mermaid` | Contains emoji and describes a Kraken-only execution chain as authoritative while current checkout tests and current branch posture are multi-broker/Alpaca-oriented. |
| `ogz-meta/ledger/ogzprime-data-structures.mermaid` | Contains emoji; states active trade `size` is base currency while current `GRAND-SCHEME.md` says position size flows in USD throughout. |
| `ogz-meta/claudito_context.md` | Describes `UnifiedTradingCore.js` and `ExecutionLayer.js` as architecture despite maintained Alignment explicitly recording those paths as hallucinated/absent; also contains extensive emoji under a no-emoji doctrine. |
| `ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md` | Still contains emoji-bearing historical/code blocks (for example the `Houston Mission Status` and `spec-update-status` blocks found by the bootstrap grep) despite the no-emoji doctrine. |
| `ogz-meta/sessions/session-2026-07-02-fable-consensus-exit-telemetry-and-sweep-config.md` | Records a P0 gate as current proof, but the newer 2026-08-03/06 session explicitly records Trey's removal of P0 authority. This is dated-session drift, not a mutation request. |

## Territory verification target

The only mission output is this file. The final Git check must show no worktree change outside `ogz-meta/inbox/amp/2026-08-28/test-authority-census.md`; the subsequent local commit is the separately authorized docs-only shipping action and will not be pushed.
