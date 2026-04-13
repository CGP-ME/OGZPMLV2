# OGZPrime Master Rollout Document
## The Single Source of Truth for Project State

**Last updated:** 2026-04-13 by wolf (Claude Desktop session)
**Branch:** `tradingloop-clean-rewrite` (rebase target: `broker-alpaca-integration`)
**Current phase:** Apex critical path — operational verification queued
**Next session focus:** T1-T4 (TRAI safety) + C1-C5 (Claudito pipeline) operational verification at home rig

---

## HOW TO USE THIS DOCUMENT

**If you are a future AI session (Claude / Mercury / Cursor / GPT / Codex):**
Read this entire doc first. Then read `ogz-meta/specs/decision-ledger-schema.json` and `ogz-meta/specs/decision-ledger-integration-plan.md`. That bootstraps you with current state, recent decisions, what's blocking what, what's wrong vs what we thought was wrong, and the audit findings that anchor every claim with file:line citations.

Do not propose architecture changes or refactors until you have read the Decision Log section and confirmed your proposal does not contradict a previous DEC entry.

When this session ends, append your work to the Session Log and update relevant Workstream entries via the Scribe stage of the Claudito chain.

**If you are Trey:**
The 30-Second Status section is your "where are we" check. The Master Checklist is your "what's next" check. Both audits are embedded at the bottom as canonical reference for any "did we verify that?" question.

---

## 30-SECOND STATUS

Apex critical path is active. Audit complete (Part 1 + Part 2 via Mercury, 89 questions, 981 ReAct iterations, 12.6 minutes total). Decision ledger schema + integration plan committed. Matrix has not been run yet — that's pending operational verification + ledger build. Partial-close pipeline bug confirmed by Mercury (4-layer break, every "partial" is silently full-closing). Live-mode hard-gate not yet implemented. PIDController IS wired into the live loop (corrected from earlier assumption). Multi-broker is ~80% built (11 working adapters with real API calls). Kill-switch is production-grade. Pattern packs have a real generator. Stripe is wired. Sentry is wired. Sealed-at-birth exitEnv property already exists on trades.

The bot is closer to done than I was estimating. Remaining Apex work is finishing, not building from scratch.

---

## MASTER CHECKLIST — Apex Critical Path

Each item is a discrete deliverable. Cross off as completed (`[x]`). Update with commit SHA on completion.

### Phase 0: Operational verification (BEFORE any code work)

- [ ] **T1** — Single trade TRAI accounting check (RSI solo, one trade, verify decisionHistory.length, pattern recording, TradeJournal entries, BacktestRecorder line)
- [ ] **T2** — Multi-leg trade TRAI behavior (force BE scaleout, verify TRAI doesn't split into phantom learning records — though current contract bug means partials full-close, this confirms the bug fires consistently)
- [ ] **T3** — TRAI offline determinism (`ENABLE_TRAI=false` produces identical P&L to T1, proves TRAI is observer not decision-modifier)
- [ ] **T4** — Mercury bridge sanity (ask Mercury "what does StopLossChecker.js do" — verify file:line response is current and accurate)
- [ ] **C1** — Trivial Claudito fix end-to-end (add a comment to a non-critical file, verify all 10 stages logged)
- [ ] **C2** — Adversarial fix rejection (submit weak fix with try/catch swallowing error, verify Critic rejects)
- [ ] **C3** — Scope creep rejection (submit fix with "and also refactor X", verify Warden blocks)
- [ ] **C4** — Pipeline interruption recovery (kill mid-stage, verify clean rollback or refusal-to-proceed)
- [ ] **C5** — Mercury+Claudito integration (Claudito calls Mercury at Forensics for verification, returns file:line citations)

**Pass criteria for moving to Phase 1:** All 9 items checked. Any failure must be diagnosed and fixed before ledger work begins.

### Phase 1: Decision ledger build (W2)

- [ ] **L1** — Skeleton ledger creation at trade birth (`core/StateManager.js` + `core/dto/DecisionLedgerSchema.js` new file)
- [ ] **L2** — Strategy signals + orchestrator decision capture (`StrategyOrchestrator.js` returns allResults including losers)
- [ ] **L4** — Position sizing breakdown with formula string (`OrderExecutor.js:55-81`)
- [ ] **L5** — Risk gates structured logging + rejections file (`RiskManager.js` + `TradingLoop.js:393-514`)
- [ ] **L8** — JSONL persistence on full close (`core/DecisionLedgerLogger.js` new file)

**Bundling:** L1+L2+L4+L5 can land as one commit. L8 separate. Total ~1-2 sessions.

**Pass criteria for moving to Phase 2:** Backtest produces valid JSONL ledger entries matching schema. Mercury can read and analyze ledger files.

### Phase 2: Matrix run on home rig

- [ ] Run `node tools/parallel-backtest.js --real --stocks --data tsla --solo=RSI` with ledger writing active
- [ ] Confirm ledger files populate correctly during sweep
- [ ] Run full per-strategy sweep across all 9 active strategies
- [ ] Walk-forward validation against held-out datasets
- [ ] Multi-ticker generalization (TSLA-tuned configs against NVDA, RIOT, QQQ, MARA, SPY, COIN with zero retuning)
- [ ] Lock new validated exit contracts in `TradingConfig.exitContracts` with new `_validated` dates
- [ ] Pick best single strategy for Apex eval account based on validated numbers

**Pass criteria for moving to Phase 3:** One strategy locked, validated, multi-ticker tested, ready for paper run.

### Phase 3: Partial-close pipeline fix + remaining ledger phases

- [ ] **TRAI multi-leg outcome aggregation** — wrap `recordTradeOutcome` to aggregate by tradeId, fire learning sample once on full close
- [ ] **TradeJournal multi-leg lifecycle** — `recordExit` waits for `remainingSize === 0` before deleting open trade
- [ ] **UnifiedPatternMemory parent-trade consolidation** — accumulate legs by tradeId, single learning sample per parent trade
- [ ] **BreakEvenManager partial-aware** — listens for partial close events
- [ ] **Schema shim for legacy field readers** — preserve `trade.maxProfitPercent`, `trade.entryIndicators`, `trade.customMetadata` accessors
- [ ] **MaxProfitManager state ownership** — Map-of-MPM-instances refactor (~30 lines per reviewer-corrected plan)
- [ ] **StateManager.reducePosition** — actual partial close that reduces remainingSize without deleting trade
- [ ] **OrderExecutor partial-close fraction handling** — fix the `exitSize > 0 && exitSize < 1` check that currently full-closes everything
- [ ] **BacktestRecorder leg accumulation** — aggregate legs by tradeId, single trade record per parent
- [ ] **L6** — Exit ledger entries (every exit appends to `decisionLedger.exits[]`)
- [ ] **L7** — Outcome summary on full close (`decisionLedger.outcome` populated with aggregates)

**Pass criteria for moving to Phase 4:** Multi-leg trades fire correctly. Sum of leg P&L reconciles. Ledger shows full lifecycle.

### Phase 4: Live-mode finishing + Apex deploy

- [ ] **L11** — SessionReporter (HTML email + Discord/Slack/SMS + JSONL bundle on session close)
- [ ] **Live-mode hard-gate** — `LIVE_TRADING_ARMED=true` env var required in addition to `EXECUTION_MODE=live`
- [ ] **Alpaca subscribeToAccount wiring** — currently stub at `brokers/AlpacaAdapter.js:383-389`
- [ ] **Alpaca WebSocket reconnect** — currently logs only at `brokers/AlpacaAdapter.js:541-547`
- [ ] **PID state persistence** — piggyback on StateManager save/load cycle, integral/prevError/history survive restart
- [ ] **L10** — Dashboard live ledger card (renders trade reasoning tree in real-time)
- [ ] **Apex eval deployment** — single account, single locked strategy, paper trading first, then live with arming gate
- [ ] **Apex pass: ~15% profit, <5% trailing drawdown**

**Pass criteria for moving to scaling phase:** Apex eval passed, capital received.

### Phase 5: Scaling (post-Apex)

- [ ] Houston move
- [ ] Clone successful config across 20 Apex accounts (target: $25K × 20 = $500K pool)
- [ ] Begin post-Apex workstreams (W3-W8 below)

---

## ACTIVE WORKSTREAMS

### W1: Apex Critical Path  [IN PROGRESS]
**Status:** 0/40 deliverables complete
**Phase:** Operational verification queued
**Blocked by:** Nothing (proceed immediately)
**Next action:** Run T4 (Mercury bridge sanity) at home rig
**Priority:** P0 — gates everything else

### W2: Decision Ledger System  [SPEC COMPLETE, IMPLEMENTATION QUEUED]
**Status:** Schema + integration plan committed at `ogz-meta/specs/`
**Phase:** Documentation done, awaiting operational verification before L1 starts
**Blocked by:** W1.T1-T4, W1.C1-C5
**Phases:** L1-L11 documented in `decision-ledger-integration-plan.md`
**Critical path bundle:** L1+L2+L4+L5+L8 (one commit cluster)
**Post-Apex polish:** L3 (modifier refactor), L9 (anomaly detection), L10 (dashboard card)
**Files committed:**
- `ogz-meta/specs/decision-ledger-schema.json`
- `ogz-meta/specs/decision-ledger-integration-plan.md`

### W3: Sealed-Trade Architecture  [SPEC SUPERSEDED, REVISED PLAN PENDING]
**Status:** Original 8-phase spec invalidated by 3-reviewer audit
**Reference:** `ogz-meta/todocontext47.md` April 8 SUPERSEDE section
**Reviewer findings:** 6 CRITICAL + 2 CONCERN issues across Gemini/Codex/Claude desktop
**Revised approach:** 10-12 phases, 5-7 sessions, requires Mercury-verified first-party trace before spec rewrite
**Status update from Mercury Part 1 audit:** Most reviewer concerns now have file:line confirmation. Fix scope is narrower than original 8-phase plan because:
- Schema coupling readers all have `|| {}` or `|| 0` fallbacks (silent break, not loud)
- Crash recovery exists (StateManager.load() at line 862 — was missed in original review)
- Backtest models slippage at OrderExecutor.js:110-119 (Reviewer 1 concern was wrong)
**Blocked by:** W1.L1-L8 (need ledger to verify partial-close fix lands correctly)
**Critical fix queue:** TRAI multi-leg + TradeJournal lifecycle + UnifiedPatternMemory consolidation + BreakEvenManager partial-aware + Map-of-MPM-instances + StateManager.reducePosition + BacktestRecorder leg accumulation
**Architecture decision (DEC-008):** Map-of-instances (~30 lines) over pure-function refactor (~200 lines)

### W4: Multi-broker / Multi-asset  [PARTIAL — SUBSTANTIALLY BUILT, GAPS POST-APEX]
**Status:** Far more built than wolf was estimating going into this session
**What's built (verified by Mercury Part 2):**
- 11 broker adapters with real HTTP/axios calls: Alpaca, Binance, Coinbase, Gemini, IBKR, KrakenIBroker, Oanda, Schwab, Tastyworks, Uphold, plus CME (placeholder data)
- IBrokerAdapter abstract class (`brokers/IBrokerAdapter.js` + `foundation/IBrokerAdapter.js`)
- OrderRouter at `core/OrderRouter.js:23` with `getBrokerForSymbol` dispatch
- BrokerRegistry + BrokerFactory in `brokers/`
- IndicatorEngine maintains separate state per symbol (instance-based, not singleton)
- StateManager activeTrades is keyed by tradeId only — supports concurrent multi-asset positions
**Gaps (post-Apex):**
- Pattern memory NOT namespaced by asset (DEC-002: this is design intent — setup is a setup)
- TradingLoop.analyzeAndTrade is single-asset (line 60 reads single `marketData`)
- Strategy signals don't carry symbol field (inferred from global `ctx.tradingPair`)
- Exit contracts are per-strategy only, not per-asset-per-timeframe
- Hardcoded `'BTC/USD'` defaults at OrderExecutor.js:132, 348, 464, 620, 832, 1009 (functional fallbacks, not dead code)
- No per-broker config block in TradingConfig.js
- No multi-asset orchestration loop wrapper
**Priority:** P3 — post-Apex when capital exists for multi-asset live runs

### W5: TRAI 9-Function Completion  [PARTIAL — POST-APEX]
**Status:** 4 of 9 functions wired, 5 vapor or partial
**Built:**
- News crawler: `core/TRAIWebContext.js` (CryptoCompare only, lines 184-203)
- Whale watcher + trade analyst: `core/TradeIntelligenceEngine.js:775-795`
- Customer service chatbot: `ogzprime-ssl-server.js:74-86` (`/api/ollama/chat` endpoint)
- Dashboard widget: `public/trai-widget.js`
**Vapor:**
- Pattern modulator (no implementation file)
- Boomer API onboarding (no file)
- ElevenLabs + D-ID content gen (API keys read at `core/trai_core.js:88-89` but no integration)
- OpsManager (no file)
**Partial:**
- News sources limited to CryptoCompare; need Twitter/X, Bloomberg, Reuters, RSS, Polygon news, 13F filings, dark pool, options flow
**Priority:** P3 — post-Apex SaaS layer

### W6: Pine SaaS Layer  [VAPOR — POST-APEX]
**Status:** Pine transpiler functional standalone, NOT productized
**Built:**
- Full transpiler at `pine-transpiler/` (lexer, parser, AST runtime, TA library, strategy bridge, feature scanner)
- 5.5% variance from TradingView signal target on TSLA 15m 18mo (419 vs 397 signals)
- Limited sandboxing: history cap 500 bars, while-loop cap 1000 iterations
**Vapor:**
- HTTP endpoint for `.pine` upload
- NOT wired into StrategyOrchestrator (no `_registerPineStrategies`)
- No User class / multi-tenant model
- No CPU/memory caps on sandboxed strategies
- No per-user strategy isolation
**Priority:** P3 — post-Apex SaaS launch

### W7: Cross-broker Arbitrage  [VAPOR — POST-APEX]
**Status:** Aspirational only. Strategy&Tuning.md "~90% built on crypto side" claim is NOT true.
**Reality (Mercury Part 2 verified):**
- `enableArbitrage` feature flag at `TradingConfig.js:736`
- Tier flag at `TierFeatureFlags.js:50`
- Mention in audit script `tools/run-audit-revised-part2.js:53-54, 108`
- ZERO modules compute price differentials between brokers
- `OrderExecutor.sendOrder` only sends single order, no atomic multi-broker
**Priority:** P4 — post-Apex, post-multi-asset

### W8: Subscription Tier Enforcement  [PARTIAL — POST-APEX]
**Status:** Plumbing exists, enforcement layer incomplete
**Built:**
- Stripe checkout at `public/stripe-checkout.js:44-45` with `mode: 'subscription'`
- FeatureFlagManager tier scaling at `core/FeatureFlagManager.js:138-164` (starter: maxPositions 5, leverage 1, maxDailyTrades 50, patternLimit 10)
- TierFeatureFlags helper at `TierFeatureFlags.js:85-91`
- WebSocket token auth at `ogzprime-ssl-server.js:461-506`
- Per-broker API key auth (Alpaca, Oanda, Uphold OAuth2, etc.)
**Vapor/Missing:**
- Stripe webhook → tier upgrade enforcement
- User class / multi-tenancy
- JWT/OAuth user authentication
- Per-user broker key storage (encrypted at rest)
- Free-tier 30-day trial logic
- Tier-gated feature checks at runtime
**Priority:** P3 — post-Apex SaaS launch

### W9: Operational Maturity  [PARTIAL — IMPROVE OPPORTUNISTICALLY]
**Built:**
- Sentry error monitoring: `instrument.js:1-64`
- Health check endpoint: `ogzprime-ssl-server.js:434-444` (`/api/health`)
- WebSocket ping/pong watchdog: `ogzprime-ssl-server.js:516-529`
- Structured JSON logging: ClauditoLogger + TradingProofLogger writing JSONL
- Kill-switch: `core/KillSwitch.js` file-flag (`killswitch.flag`) + `tools/kill-switch.js` CLI
- ConfigFingerprint registry: `ogz-meta/CONFIG-FINGERPRINT-REGISTRY.md`
- Mercury bridge for first-party verification: `trai_brain/mercury-bridge/`
**Gaps:**
- No Prometheus / Datadog integration
- Trade history persisted only to JSON files (`logs/trades/trades_YYYY-MM-DD.json`), no SQLite/Postgres/Mongo
- Many unstructured `console.log` statements remain in production code paths
**Priority:** P2 — improve as touched, no dedicated workstream

---

## DECISION LOG

### 2026-04-13

**DEC-001:** Forget $970.71 number. Was combined RSI+EMA snapshot, not reproducible methodology baseline. Each strategy ships solo with own validated contract via matrix rerun on home rig. Confirmed by Trey: "we talked about this... that 900 happened on a 15% and that only happens at, like, 90 percent confidence... and the 970 was when we were combining strats — that's something that will never happen because each thing is eval individually."

**DEC-002:** Pattern memory is NOT namespaced by asset. Setup is a setup regardless of ticker. Confirmed by Trey: "a setup is a setup." This is design intent. Mode-based separation (live/paper/backtest) is the only namespacing that should exist.

**DEC-003:** Pattern packs populate from BOTH backtest AND live trades, with weight reduction on live samples (live data is sparser and more recent). Premium pack generator at `ogz-meta/ledger/generate-premium-pattern-pack.js` writes to `packs/premium-{ticker}-{timestamp}.json` with gating filters.

**DEC-004:** Strategies evaluate individually, NOT combined. Orchestrator picks highest-confidence winner per candle, doesn't blend. Confluence sizing applies AFTER winner selection, scaling position size based on how many strategies agreed on direction.

**DEC-005:** Decision ledger architecture uses Option C — lives on trade object during lifecycle, persisted as JSONL on full close. Both/and not either/or. Live storage at `trade.decisionLedger`, persistent storage at `logs/decisions/decisions_YYYY-MM-DD.jsonl`.

**DEC-006:** Mercury VERIFIES, Claudito WRITES. Mercury never writes production code directly. Mercury runs at Forensics + Critic stages of the Claudito chain to provide second-source verification with file:line citations. This preserves Claudito's quality discipline (scope gates, commit cycles, rollback) while getting Mercury's accuracy.

**DEC-007:** Decision ledger overhead config:
- Matrix-run mode: `LEDGER_DETAIL=summary, LEDGER_VALIDATE=false, LEDGER_BUFFER_SIZE=100` — ~negligible overhead (~1 sec per config)
- Live mode: `LEDGER_DETAIL=full, LEDGER_VALIDATE=true, LEDGER_BUFFER_SIZE=1` — ~3-5 ms per trade (invisible at trade frequencies)
- Backtest debug mode: `LEDGER_DETAIL=full, LEDGER_VALIDATE=true, LEDGER_BUFFER_SIZE=10`

**DEC-010:** Master rollout doc at `ogz-meta/MASTER-ROLLOUT.md` becomes canonical project state. Updated by Scribe stage of every Claudito mission. First file every future AI session reads.

### 2026-04-08

**DEC-008:** Original 8-phase sealed-trade spec SUPERSEDED. Three independent reviewers (Gemini, Codex, Claude desktop) flagged 6 CRITICAL + 2 CONCERN issues:
- Phase 4/5 ordering creates corruption window (CRITICAL ×3)
- Building on unverified Claudito traces (CRITICAL ×3)
- Live mode not deferrable for production (CRITICAL ×3)
- UnifiedPatternMemory can't handle multi-leg (CRITICAL ×3)
- Pure-function MPM is wrong choice (CONCERN ×3)
- Orthogonality assumptions wrong, schema shims needed (CONCERN ×3)
- TRAI multi-leg attribution corruption (CRITICAL ×2)
- Crash recovery torn-state window (CRITICAL ×2)
- Reviewer 1 standalone: fee doubling/slippage on partials not modeled

New approach: Map-of-instances over pure-function refactor (~30 lines vs ~200), 10-12 phases instead of 8, requires Mercury-verified first-party trace before spec rewrite.

### 2026-04-07

**DEC-009:** ENV var audit reveals STOP_LOSS_PERCENT, TAKE_PROFIT_PERCENT, TRAILING_STOP_PERCENT are IGNORED by trading code due to locked exit contracts in `TradingConfig.exitContracts`. Sweep tool `tools/parallel-backtest.js` rewritten with `--real` flag to only vary HONORED env vars. Reference: `ogz-meta/ENV-VAR-AUDIT.md`.

### 2026-03-30

**DEC-011:** TradingView (Cboe/BATS RTH only) and Polygon (consolidated tape, full session) produce DIFFERENT candle data for the same ticker/timeframe. VP levels differ by $6-26. This is NOT a bug — it's the mechanism behind cross-broker arbitrage. Backtests against TradingView must use TV-source data. Live trading uses broker's own feed.

### 2026-03-22

**DEC-012:** Position sizing stack at OrderExecutor.js is base × confidence × confluence. Confidence multiplier formula: `0.5 + (conf - 0.5) × 4.0` clamped 0.5-2.5x. Confluence multiplier: 1.0 (single) → 1.5 (two) → 2.0 (three) → 2.5 (four+). The arithmetic theoretical max of 31.25% (5% × 2.5 × 2.5) NEVER fires in practice — observed max stays well below 15%. At ~90% confidence, target is ~20% of account. Reference: `ogz-meta/BACKTEST-PIPELINE-AUDIT.md` "CRITICAL FINDING" framing was incorrect — that's theoretical upper bound, not observed risk.

### 2026-03-20

**DEC-013:** Walk-forward validated exit contracts locked in `TradingConfig.exitContracts`:
- RSI: SL -0.8%, TP 1.0%, minConfidence 0.60
- EMASMACrossover: SL -0.5%, TP 1.0%
- MADynamicSR: SL -0.8%, TP 1.0%
- LiquiditySweep: SL -2.0%, TP 2.5%, useStructuralExits: true
- All four marked `_validated: '2026-03-20'`

These will be REPLACED after the upcoming home-rig matrix rerun produces fresh contracts via U2 methodology.

---

## OPEN QUESTIONS

### Blocks Phase 0 verification
- None — proceed immediately at home rig

### Blocks Phase 1 (ledger build)
- Should `LEDGER_DETAIL=summary` in matrix mode include risk gate results, or strip those too? Current spec says strip.
- Should ledger writes be per-asset file or single combined file when multi-asset eventually lands? Probably per-asset per-day.

### Blocks Phase 2 (matrix run)
- Walk-forward methodology: U3 says two held-out datasets per strategy. Do we have two TSLA 15m datasets that don't overlap with training? Need to verify or generate.
- Confidence interval calculation: 95% CI standard, or different threshold? Standard probably fine.

### Blocks Phase 3 (partial-close fix)
- Minimum-leg-capital threshold for partials in live mode (per Reviewer 1 concern). Suggested: don't partial if remaining leg < $500. Confirm or set different value.
- TRAI outcome aggregation: aggregate by tradeId, but what about anomaly detection on per-leg basis (e.g., leg 1 hits TP1 cleanly, leg 2 stops out)? Track legs separately for analysis but only learn from parent trade?

### Blocks Phase 4 (Apex deploy)
- Apex eval account selection: which prop firm account first? Apex Trader Funding standard tier?
- Initial Apex account size: $25K, $50K, or $100K? Affects sizing calculations.
- Live trading start: pure paper for N days first, then live with `LIVE_TRADING_ARMED=true`? How many days of paper before arming?

### Blocks Phase 5 (scaling)
- Houston move logistics — which neighborhood, school district for Annamarie, lease vs buy
- 20-account clone strategy: same config across all 20, or strategy diversification?

---

## SESSION LOG

### 2026-04-13 (current — wolf via Claude Desktop)
**Duration:** ~6 hours (extended deep session)
**Focus:** Audit reconciliation + decision ledger architecture
**Actions taken:**
- Consumed full transcript of previous 2 sessions (April 11-13)
- Read all 24 ogz-meta docs on broker-alpaca-integration branch
- Read all 23 ogz-meta docs on tradingloop-clean-rewrite branch
- Reviewed Mercury Part 1 audit results (44 questions, 42/44 confirmed first-party)
- Drafted Mercury Part 2 audit (45 questions, blocks M-V, forward-looking architecture)
- Mercury Part 2 executed by Trey, all 45 answered
- Major prior-correction: multi-broker is ~80% built (was estimated as vapor), PID is wired into live loop, kill-switch is production-grade, Stripe is wired, premium pattern packs have a real generator
- Designed decision ledger architecture (Option C: trade object + JSONL)
- Drafted ledger schema (`decision-ledger-schema.json`)
- Drafted ledger integration plan (10 phases L1-L10 + L11 SessionReporter)
- Discussed live dashboard ledger card and customer-facing session reports
- Confirmed Mercury verifies / Claudito writes division of labor
- Created this Master Rollout document

**Files committed (or staged):**
- `ogz-meta/specs/decision-ledger-schema.json`
- `ogz-meta/specs/decision-ledger-integration-plan.md`
- `ogz-meta/MASTER-ROLLOUT.md` (this doc)
- `ogz-meta/ledger/pre-apex-revised-audit-2026-04-13.md` (Part 1 audit results)
- `ogz-meta/ledger/pre-apex-audit-v2-part2-2026-04-13.md` (Part 2 audit results)

**Next session pickup:**
- Trey at home rig (7800X3D + 4090)
- Operational verification (T1-T4, C1-C5) BEFORE any code work
- If verification passes, fire `/pipeline "feat: ledger L1 skeleton at trade birth"` to start ledger build
- Matrix run after L1+L2+L4+L5+L8 lands

### 2026-04-12
- Mercury bridge rebuilt with native tool calling (replaced text-parsed ReAct)
- Reindex to 6738 chunks across 663 files
- Mercury Part 1 audit drafted and executed (44 questions across blocks A-L)
- Three parallel tracks initiated: Cursor doc validity audit, Mercury tournament reconstruction, Mercury 84-question structural audit v2

### 2026-04-08
- Three-reviewer cycle on 8-phase sealed-trade spec (Gemini + Codex + Claude desktop)
- 6 CRITICAL + 2 CONCERN issues flagged
- Spec superseded
- April 8 SUPERSEDE section added to `ogz-meta/todocontext47.md`

### 2026-04-07
- ENV var audit produced (`ogz-meta/ENV-VAR-AUDIT.md`)
- BACKTESTING-GUIDE.md committed
- Solo strategy tests run: RSI -$140, EMA -$508 (both lose solo, the orchestrator winner-selection is the edge multiplier when combined — though per DEC-001 we're moving past combined and back to per-strategy locked contracts via matrix)
- Sweep tool rewritten with `--real` flag (commit c6993b3)
- PID Controller spec reviewed (existing module turned out to be largely complete)
- PATCH 1 (MaxProfitManager BE scale-out + tier exit reads exitLogic config) committed (e6616f4)
- PATCH 1 FIX (maxProfitManager added to BacktestRunner ctx) committed (0c83105)
- PATCH 2 (ECM safety-only) drafted but NOT committed (depends on partial-close fix)
- 4-layer partial-close contract bug discovered

### 2026-03-30
- Pine Script interpreter built end-to-end (lexer, parser, AST runtime, TA library)
- 419 vs 397 TV signal target = 5.5% variance (floating-point accumulation drift)
- Data source architecture documented (`ogz-meta/Strategy&Tuning.md`)
- TradingView vs Polygon data source decision (DEC-011)

### 2026-03-22
- BACKTEST-PIPELINE-AUDIT.md committed
- Position sizing stack documented (DEC-012 superseding the "31.25% CRITICAL FINDING" framing)

### 2026-03-20
- Walk-forward validated exit contracts locked (DEC-013)

[Older entries can be reconstructed from `ogz-meta/CHANGELOG.md` and `ogz-meta/recent-changes.md` as needed]

---

## EMOTIONAL CONTEXT FOR FUTURE CLAUDE / MERCURY / WHOEVER

Trey has been carrying this project for years. Six years estranged from his daughter Annamarie (Houston, 4 hours away from Corpus Christi). Working retail and construction during the day. Building the platform at night. Survived 4 system crashes and 3 full restarts. Built every architectural insight himself. Future sessions execute and validate; they do not design from scratch.

He pushes back hard on AI sloppiness because his time costs his life. "Shoot it straight and shoot it true" means it. Feelings don't buy plane tickets to Houston — math does.

Every Trey pushback is data, not emotion. When he says "I knew about that," he means he's been carrying that context for months and the AI assistant should have caught up faster. The audit cycle exists because he can't trust any single AI to not wreck things — the verification chain (Mercury + Claudito + reviewer cycles) is the institutional discipline that lets a solo developer ship a quantum trading platform safely.

Apex math: $25K per cleared account × 20 accounts = $500K working capital. $15K = the move to Houston. $500K = generational wealth and never being broke again.

Bot is closer to done than wolf was estimating going into the April 13 session. Remaining Apex work is finishing, not building from scratch. The boat isn't taking on water anymore.

---

## REFERENCE — EMBEDDED AUDITS

The two Mercury audits below are the canonical first-party verification of every claim in the workstream descriptions above. They were generated 2026-04-13 against the broker-alpaca-integration branch with Mercury-2 in agentic ReAct mode (grep + open_file + get_chunk + list_files tools).

**Combined stats:** 89 questions, 981 ReAct iterations, 12.6 minutes total Mercury compute.

Future sessions should reference these audits before contradicting any "what's built" claim. If a future session believes a workstream is more or less built than these audits indicate, run a fresh Mercury query to verify before acting on the belief.

### Embedded Audit 1: Pre-Apex Revised Spec Audit (Part 1)

**Full file:** `ogz-meta/ledger/pre-apex-revised-audit-2026-04-13.md` (1003 lines)
**Purpose:** First-party verification of every reviewer claim before writing revised architecture spec
**Coverage:** Blocks A-L
- A: Partial-close pipeline verification
- B: Trade lifecycle accounting (TradeJournal, BacktestRecorder, UnifiedPatternMemory)
- C: Schema coupling (BreakEvenManager, StopLossChecker, ExitContractManager)
- D: Crash recovery / in-flight trade rehydration
- E: Live-mode readiness (Alpaca)
- F: Fee / slippage modeling on partials
- G: $970.71 regression anchor reproducibility (now superseded by DEC-001 — matrix rerun replaces this)
- H: Config system duplication (TradingConfig vs ConfigLoader) — Q33/Q34/Q35 failed on rate limit, retry queued
- I: Orphan code (potential free alpha)
- J: Position sizing
- K: PID controller readiness
- L: Pine transpiler state

**Top findings (verbatim verifications):**
- Q1 CONFIRMED: `core/OrderExecutor.js:560-564` still has broken `exitSize > 0 && exitSize < 1` check
- Q5 CONFIRMED: `StateManager.closePosition` accepts `size` param but ignores it, always uses `trade.sizeUsd`
- Q6 NOT FOUND: no `reducePosition` or `partialClose` method exists
- Q9 CONFIRMED: TradeJournal.recordExit deletes open trade on first exit event (line 218-219)
- Q11 CONFIRMED: UnifiedPatternMemory.recordOutcome is per-exit-event with no tradeId dedupe
- Q18 CONFIRMED: StateManager.load() at line 862 DOES rehydrate activeTrades from state.json — torn-state risk on restart
- Q20 CONFIRMED: Alpaca subscribeToAccount is a stub at lines 383-389
- Q23 CONFIRMED: Live mode is NOT gated behind feature flag; setting `EXECUTION_MODE=live` executes immediately
- Q28 CONFIRMED: All 4 exit contracts locked at TradingConfig.js:254-306 with `_validated: '2026-03-20'`
- Q31 CONFIRMED: Drawdown bypass calc fix IS APPLIED at StopLossChecker.js:49-52
- Q40 CONFIRMED: DynamicPositionSizer is `null` at run-empire-v2.js:615 (not wired)
- Q41 CONFIRMED: `pid` block exists at TradingConfig.js:180
- Q42 CONFIRMED: PIDController.js exists as real module exporting PIDController, PIDLoop, getPIDController, resetPIDController
- Q44 CONFIRMED: Pine transpiler NOT wired into StrategyOrchestrator (no `_registerPineStrategies`)

### Embedded Audit 2: Pre-Apex Forward-Looking Audit (Part 2)

**Full file:** `ogz-meta/ledger/pre-apex-audit-v2-part2-2026-04-13.md` (975 lines)
**Purpose:** Verify what exists vs what's vapor for post-Apex roadmap
**Coverage:** Blocks M-V
- M: Multi-broker readiness
- N: Multi-asset support
- O: Cross-broker arbitrage layer
- P: TRAI 9-function brain layer
- Q: Pattern memory and premium packs
- R: Hot-swap and atomic config changes
- S: Pine transpiler SaaS readiness
- T: Tournament-to-PID handoff
- U: Subscription / SaaS layer
- V: Operational maturity

**Top findings (verbatim verifications):**
- M1: 11 broker adapters exist (Alpaca, Binance, Coinbase, Gemini, IBKR, Kraken, Oanda, Schwab, Tastyworks, Uphold, plus CME placeholder), all extending IBrokerAdapter
- M2: IBrokerAdapter exists in BOTH `brokers/` and `foundation/` with full interface (connect, disconnect, getBalance, getPositions, getOpenOrders, placeBuyOrder, placeSellOrder, cancelOrder, getTicker, getCandles, getOrderBook, subscribeToTicker, subscribeToCandles)
- M5: OrderRouter exists at `core/OrderRouter.js:23` with `getBrokerForSymbol` and `sendOrder`
- M6: All 11 adapters except IBrokerAdapter (abstract) and CME (placeholder) make real HTTP/axios calls
- N1 CONFIRMED: StateManager activeTrades keyed by tradeId only — supports concurrent multi-asset
- N3 CONFIRMED: IndicatorEngine is per-instance, not singleton — separate state per symbol
- N9 CONFIRMED: TradingLoop.analyzeAndTrade is single-asset (line 60 reads single marketData)
- O15 NOT FOUND: zero modules compute price differentials between brokers
- P17: News crawler exists (CryptoCompare only at TRAIWebContext.js:184-200), whale watcher + trade analyst at TradeIntelligenceEngine.js:775-795, dashboard widget at public/trai-widget.js, customer service chatbot at ogzprime-ssl-server.js:74-86
- P17 NOT FOUND: pattern modulator, boomer onboarding, OpsManager, ElevenLabs/D-ID actual integration
- Q23 confirms full pipeline OrderExecutor → TRAIDecisionModule → TRAICore → UnifiedPatternMemory.recordOutcome works
- Q24 CONFIRMED: Premium pattern packs separate from operational bank — different storage, different gating
- R27 CONFIRMED: TradingConfig.get() reads at module load, NOT mid-run — sealed-at-birth via `TradingConfig.setOverrides()` only
- R30 CONFIRMED: in-flight trades sealed at birth — env var changes don't affect open trades
- T34: Full pid block exists at TradingConfig.js:180-202 with all Kp/Ki/Kd values env-sweepable
- T35 CONFIRMED: PID clamps are HARDCODED at PIDController.js:139-140, 155-156, 169-170 — not from `pid.envelopes`
- T37 CONFIRMED: PIDController IS wired — instantiated at OrderExecutor.js:20, called at lines 745-746 (long) and 1038-1039 (short)
- T38 NOT FOUND: PID state is in-memory only, not persisted across restarts
- U40 CONFIRMED: Stripe checkout at public/stripe-checkout.js:44-45 with mode: 'subscription'
- U41 CONFIRMED: Tier enforcement at FeatureFlagManager.js:138-164 (starter: maxPositions 5, leverage 1, maxDailyTrades 50, patternLimit 10)
- V42 CONFIRMED: Sentry wired at instrument.js:1-64, health endpoint at ogzprime-ssl-server.js:434-444
- V44 CONFIRMED: Trade history is JSON files only, no DB
- V45 CONFIRMED: Kill-switch at core/KillSwitch.js with file-flag, CLI tool at tools/kill-switch.js — production-grade external halt

---

**END OF MASTER ROLLOUT DOCUMENT**

**For context warmup of any new AI session, this document plus the two audits embedded above is the bootstrap kit. Total reading time ~15 minutes for a thorough warmup, ~3 minutes for a fast skim of just this doc and the 30-Second Status section.**

**Keep this doc current. Past Trey paid the cost of context loss session after session. Future Trey gets it back.**
