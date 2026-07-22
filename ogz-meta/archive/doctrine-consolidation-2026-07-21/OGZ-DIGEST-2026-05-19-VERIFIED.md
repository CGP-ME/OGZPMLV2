# OGZPMLV2 Digest — 2026-05-19 (verified)

**Author:** Wolf (Claude Opus)
**Purpose:** Single-document onboarding for any new AI session or operator-side reset. What this codebase IS, what it DOES, what's IN FLIGHT, what's NEXT. Grep-verified against repo. Replaces all prior digests.

---

## SECTION A — WHAT IS THIS CODEBASE

OGZPMLV2 is a Node.js algorithmic trading bot. Single-developer (Trey Buhidar) project. Target: pass TTP/Apex prop firm evaluation on TSLA 15m via Alpaca paper trades routed through SignalStack webhook → fund move to Houston to be with daughter Annamarie → scale to multi-account funded → premium pattern pack revenue + $500k+ white-glove licenses.

The bot in this repo is the **TRADING ENGINE.** Frontend dashboard is at `public/` (Cowork's domain — ~45% built per latest status). Strategy code is IP and NEVER for sale; only the bot's signal output, premium pattern packs, and operating licenses are sellable products.

### What's actually here (verified 2026-05-19)

Counts via `ls`:
- `core/`: 84 JavaScript files
- `modules/`: 9 strategy files
- `brokers/`: 14 broker adapter files
- `foundation/`: 6 JavaScript files
- `ogz-meta/`: pipeline tooling, specs, ledger, cognition-history, sessions
- `public/`: frontend (Cowork's scope)

### Pipeline architecture (this is unusual and central to understanding the project)

Every code change goes through a multi-stage adversarial verification chain BEFORE landing on `main`:

```
Trey identifies problem
  → Wolf authors spec (str_replace pairs, byte-exact)
  → Mercury (Inception Labs adversarial LLM) attacks spec
  → Wolf revises on Mercury catches
  → CC/Codex applies via pipeline
  → Mercury re-attacks LANDED code
  → P0 anchor reproduces ($13,213.042341608163 exactly)
  → Trey approves commit/push/ledger
```

The pipeline lives in `ogz-meta/slash-router.js` and `ogz-meta/pipeline.js`. The mercury-critic gate (Fix 34/35/36) was the missing link before this session — Mercury attacked code but the gate didn't stop pipeline progression on findings. As of this session, the gate halts the pipeline and surfaces findings to operator for ack/revise decision.

Doctrine doc lives in `.claude/` (hookify files block destructive operations) and in `ogz-meta/GRAND-SCHEME.md` (project ideology).

---

## SECTION B — VERIFIED MODULE INVENTORY

### Core trading engine (all in `core/`)

**Main loop and orchestration:**
- `run-empire-v2.js` (project root) — main loop, has deprecated root `priceHistory` at L767 (Codex Phase 4 removes)
- `TradingLoop.js` — per-candle analysis, global `analyzing` lock at L45-69 (Codex Phase 5 replaces with per-context mutex)
- `StrategyOrchestrator.js` — winner-picks-all, confluence scaling, exit-contract creation. RSI strategy inline at L369

**Execution:**
- `OrderExecutor.js` — BUY/SELL/SHORT/COVER paths, per-trade MPM map
- `OrderRouter.js` — multi-broker abstraction
- `StateManager.js` — singleton (Codex Phase 2 refactors to factory-backed partition for session isolation)
- `MaxProfitManager.js` — per-trade trailing stop with tier targets
- `ExitContractManager.js` — trade-owned, sealed exit contracts

**Per-symbol / per-timeframe primitives:**
- `SymbolTradingContext.js` — symbol/TF aware context envelope
- `CandleStore.js` — `symbol -> timeframe -> candles`, disk persist
- `CandleAggregator.js` — 1m → higher timeframes
- `CandleProcessor.js` — live candle handler
- `AdaptiveTimeframeSelector.js` — runtime TF selection
- `AssetConfigManager.js` — per-asset config
- `MultiAssetManager.js` — scheduled for deletion (Codex Phase 5)

**Strategy support:**
- `MarketRegimeDetector.js` — 7 regimes (trending/ranging/volatile/etc.)
- `SupportResistanceDetector.js`, `FibonacciDetector.js`, `CandlePatternDetector.js`
- `EnhancedPatternRecognition.js` — pattern engine
- `OgzTpoIntegration.js` — TPO/Market profile (registered as strategy)

**Session and broker switching:**
- `SessionRouter.js` — PARTIAL (2 of 15 handoffs wired; Codex Phase 1-3 completes)

**TRAI:**
- `TRAIDecisionModule.js` — passive/advisory by default
- `TRAIPatternIntegration.js` — TRAI #3 pattern modulator (only TRAI responsibility fully in production)
- `TRAIWebContext.js` — web context helper
- `trai_brain/trai_core.js` — unified LLM-agnostic core

**Pattern memory:**
- `PatternMemoryBank.js` — CANDIDATE/PROMOTED/QUARANTINED/DEAD lifecycle
- `UnifiedPatternMemory.js` — mode/asset bucketing

(Codex Phase 1 Fort-Knox builds on both. Replaces direct hot-path reads/writes with `FortKnoxPatternService` API providing append-only events, signed packs, per-context isolation.)

**Position sizing and risk:**
- `DynamicPositionSizer.js` — BUILT BUT NOT WIRED (intentionally disabled per operator)
- `PositionSizer.js` — inline confidence sizing (current live path)
- `PositionTracker.js` — wrapper around StateManager (not fully adopted)
- `RiskManager.js` — composes DrawdownTracker + PnLTracker
- `KillSwitch.js` — file-based emergency halt
- `DrawdownTracker.js`, `PnLTracker.js`, `PnLCalculator.js`

**Execution support:**
- `ContractValidator.js` — requires numeric volume
- `OptimizedIndicators.js`, `IndicatorCalculator.js`
- `WebSocketManager.js`, `WebhookOrderAdapter.js`
- `KrakenAdapterV2.js` (separate from brokers/Kraken wrapper)

### Strategy modules (`modules/`)

| Strategy | File | Registered |
|---|---|---|
| EMA SMA Crossover | `EMASMACrossoverSignal.js` | Yes |
| MA Dynamic Support/Resistance | `MADynamicSR.js` | Yes |
| Liquidity Sweep | `LiquiditySweepDetector.js` | Yes |
| Multi-Timeframe (as strategy) | `MultiTimeframeAdapter.js` | Yes |
| Smart Money Sweep | `SmartMoneySweep.js` | Yes |
| Opening Range Breakout | `OpeningRangeBreakout.js` | Yes (disabled by default — stocks-only by nature) |
| Break And Retest | `BreakAndRetest.js` | Yes (hard-wired `return null` per operator) |
| No Wick Imbalance | `NoWickImbalance.js` | Yes |
| Fair Value Gap | `FairValueGapDetector.js` | **NO** — exists but not registered |

Plus inline strategies in StrategyOrchestrator:
- RSI (L369)
- OGZTPO (registered via `core/OgzTpoIntegration.js`)
- MarketRegime (registered via `core/MarketRegimeDetector.js`)

### Brokers (`brokers/`)

| Adapter | Status |
|---|---|
| Alpaca | Primary live target for TTP eval |
| KrakenIBrokerAdapter | Live skeleton |
| Interactive Brokers, Schwab, Tastyworks | Skeletons |
| Coinbase, Binance, Gemini | Skeletons |
| Oanda, Uphold | Skeletons |
| CME | Skeleton (futures, bonus, post-Houston) |
| Plus: IBrokerAdapter interface, BrokerFactory, BrokerRegistry | Live |

### Foundation (`foundation/`)
- `ConfigLoader.js` — env + config integration
- `IBrokerAdapter.js` — interface contract
- `Instrument.js` — instrument metadata
- `MarketCalendar.js` — RTH/holiday calendar
- `ResilientWebSocket.js` — base for live data
- `ohlc-normalize.js` — candle normalization

---

## SECTION C — WHAT IS NOT IN THIS REPO (digest correction)

Prior Wolf digests claimed these BUILT/PARTIAL. Grep-verified: **NONE exist in this codebase.** Either in other operator repos (OGZFV, OGZ-PRODUCTION) or were conversation-only architectural plans.

**Mover stack:** MoverIntegrationHub, mover-whale-tracker, mover-tech-support, mover-content-creator, mover-discord-integration, mover-memory, mover-training-system

**Hitch stack:** HitchNLP, HitchModuleLoader, NLPTuningUI, HitchQuickFire, TopHitchCommands, OGZProfileExporter

**Voice/Celebration stack (Mover-side versions):** VoiceManager, VoiceFXSystem, VictoryAnimations, MilestoneEffects, LossRecoveryMessage. Cowork built browser-adapted equivalents in `public/js/panels/` — different code path.

**Quant tools claimed BUILT:** FixedQuantumPositionSizer, RealQuantumEnhancement, MonteCarloSimulator, StrategyOptimizer, MonthlyReportBuilder, TaxReportGenerator, QuantumAlgorithmsCore, CorrelationAnalyzer, NeuralMeshArchitecture, ARMS / AdaptiveRiskManagementSystem

**Payment/license/distribution:** LicenseManager (hardware fingerprinting + anti-tamper + 7-day grace), PaymentProcessor (Stripe + PayPal + Coinbase Commerce), stripe-delivery-system, distribution-portal backend (only frontend HTML exists)

**Mobile companion:** MobileAppAPI, RemoteControlAPI, PushNotificationServer

**System health:** SystemHealthMonitor, BackupAutomation, AutoRestartManager

**IP-protection chain:** build-obfuscated-package.sh, build-customer-package.sh, build-hybrid-package.sh, create-customer-docker.sh, docker-wrapper.js

**Other:** ModuleStore (in-app upsell), Raegerts / regerts-engine / lost-hopes-ui / prime-bootstorm

### TRAI status correction (real numbers)

| # | Responsibility | Reality |
|---|---|---|
| 1 | News crawler + NLP sentiment | UNBUILT |
| 2 | Whale watcher | UNBUILT |
| 3 | Pattern modulator | **LIVE** (`TRAIPatternIntegration.js`) |
| 4 | Trade analyst / pattern sculptor | **PARTIAL** (`PerformanceAnalyzer.js` exists, not wired to processTrade for edge-decay) |
| 5 | Customer service | UNBUILT |
| 6 | Boomer onboarding | UNBUILT |
| 7 | Content generation | UNBUILT |
| 8 | Dashboard chatbot | UNBUILT |
| 9 | Operations manager | UNBUILT |

**True coverage: 1 of 9 fully built, 1 of 9 partial.** Phase 4 white-glove license productization has much larger engineering scope than prior project memory suggested.

---

## SECTION D — P0 ANCHOR (REGRESSION GATE)

Source: `ogz-meta/specs/baseline-phase0-2026-05-06.md` (post-Fix-2 revised 2026-05-13).

```
Initial Balance:        $10,000.00
Final Balance:          $13,213.042341608163  ← EXACT FLOAT, MATCH OR HALT
Total Trades:           1,384
Win Rate:               60.0% (830W/554L)
Max Drawdown:           3.19%  ($387.67)
Profit Factor:          1.72
Avg Win:                $9.23
Avg Loss:               -$8.02
Expectancy:             $2.32
Total Fees:             $0.00
Candles Processed:      15,889
Errors:                 0
```

Run command captured in alignment doc. Under-1-minute backtest. Pre-Fix-2 number ($18,497) is ARCHIVED — do not use as gate.

**Verified holding 2026-05-19** post-Fix-37b/40/40a omnibus commit landing.

---

## SECTION E — VALIDATED STRATEGIES (walk-forward TSLA 15m)

| Strategy | TSLA 2y standalone | Walk-forward | Robustness across tickers |
|---|---|---|---|
| RSI | ~$998 base (320-config matrix) | Yes — 60% WR locked | Robust |
| EMA Crossover | Validated | Yes | Robust |
| MADynamicSR | Validated | Yes | Profitable standalone, REDUCED combined performance — operator confirmed via empirical test |
| LiquiditySweep | Validated | Yes | Robust |
| Combined RSI+EMA | +$481 unseen year-2 | 7 of 8 tickers profitable with zero retuning | Robust |
| EMASMACrossover (416-config matrix) | TSLA +$5,891 (100% configs profitable) | Yes | COIN +$10,024, MARA +$11,027 robust; QQQ/SPY fragile (confirms volatility-regime dependency) |

**Key principle:** individually optimal configs cannot be blindly stacked. MASR was profitable in isolation but hurt combined performance.

**Asset class confirmation:** Strategy is ticker-agnostic within high-volatility instruments. The volatility/regime profile matters more than the specific ticker.

---

## SECTION F — OPERATOR DECISIONS LOCKED

### Session architecture (4.A)
**INDEPENDENT crypto and stocks sessions.** Separate balance/P&L/daily-loss tracking. No carry-over.

### Position cap (6.A)
**Global 10/15/18 tiered confidence cap.** Hard cap 18.
- 1-10: normal confidence
- 11-15: elevated (additive floor `max(0.70, baseMin + 0.15)`)
- 16-18: golden seats (additive floor `max(0.85, baseMin + 0.30)`)
- 19+: hard reject

Concentration alarm at >=5 same-ticker. Telemetry only.

### Multi-timeframe (6.B)
**Both fire as independent trades.** No-hedge only applies same-TF same-time.

### Pattern banks (6.C)
**Per-(symbol, TF) banks + per-asset-class aggregate fallback.** Three runtime load paths: live (own), premium (bought), starter (free with bot). Harvested separately from live and backtest.

### Fort-Knox decisions
- **Q1 promotion:** Two-key system. QUARANTINE at 30 samples / 55% WR. End-of-session checkpoint promotes. TRAI early-lift override at stricter thresholds. Cadence configurable.
- **Q2 cross-state compatibility:** Full isolation. No flags. Manual export+re-tag required.
- **Q3 provenance:** Both SHA and semver tagged on every pattern.
- **Q4 alerts:** Auto-act small / alert-and-wait big. Tiered Discord → email → banner → nag → SMS escalation.

### Asset-class-owned strategy configs
`config/strategies/stocks/<strategy>.json` and `config/strategies/crypto/<strategy>.json`. Same algorithm code, different parameters. Crypto-side greenfield until post-Apex.

### Fee-aware signal evaluation
Designed-in capability in Codex Pillar 2. Each broker adapter declares fee profile. Multi-broker routing layer deferred to Phase 2.5 (post-Houston).

### Phase 2 = arbitrage
Tokenized stocks opportunity set cubed by 2025-2026 regulatory changes (SEC Innovation Exemption, Erebor/Augustus banks, GENIUS Act, CLARITY Act pending). Five surfaces: spatial / cross-venue basis / fiat-stablecoin-token-stock loop / hours-of-day / cross-jurisdictional.

### Sellable product surface
1. Pattern packs (subscription/lifetime)
2. Signal feeds (Ed25519-signed)
3. White-glove license $500k+/year (operator's bot, customer's logo, obfuscation chain protects bytes)
4. Hosted bot (operator runs customer's account on operator servers)
5. Premium subs stacked on white-glove license
6. Data products (low priority)
7. Education/methodology course (low priority)
8. Signals-only API

**Strategy code IP. Never sold. Period.**

### Codex Pillar 4 — signal emission and signing
Strategy orchestrator publishes signed signals to internal event stream BEFORE acting. External consumers (signal feeds, hosted bot, API) subscribe via authenticated endpoints. Ed25519 signatures.

### Phase G — destructive git operation protection
Pipeline structurally cannot execute destructive non-recoverable git operations beyond the existing `git reset --hard` block. Three sub-fixes: G1 expanded hookify, G2 `safeGitExec` wrapper whitelisting allowed subcommands, G3 alarm on blocked attempts.

---

## SECTION G — DOCTRINE & VERIFICATION CHAIN

### Banned vocabulary
- "deferred", "false positive" without grep evidence, "I think/probably/seems"
- "let me just fix", "while I'm at it", "quick fix/for now", "good enough"
- Any "Built for Houston" or operator-motivation-in-source-comments

### Verification chain (the only way fixes land)

```
Stage 0  Trey identifies problem
Stage 1  Wolf authors spec (static-read, byte-exact str_replace pairs)
Stage 2a Mercury attacks spec (pre-execution)
Stage 2b Wolf revises on Mercury catches
Stage 3  CC/Codex executes via pipeline
Stage 4  Trey adjudicates if Mercury and CC disagree
Stage 5a Mercury re-attacks LANDED code
Stage 5b Anchors re-verify (P0 must reproduce)
Stage 5c Smoke tests in post-fix state
Stage 6  Trey approves commit + push + ledger
```

### Key doctrine principles (P-numbered, full list in alignment doc)

- **P0:** Operator must comprehend before approving. No "AI summary is enough."
- **P10-P21:** Verification, no self-attestation, no AI quality assumption, architecture not agent quality
- **No `git reset --hard`** (enforced by hookify; Phase G expands to other destructive ops)
- **No bulk file deletion**
- **No autonomous push**
- **No sed scrubs** (per `.claude/hookify.no-sed-scrub.local.md`)
- **One change per session on execution path; baseline must hold**
- **Branches are rollback snapshots only; work on `rebuild/clean-from-baseline`**

### AI failure modes documented (each defended against by the chain)

1. Project-memory hallucination without grep
2. Stale-doc spec authorship
3. Confident fabricated file paths
4. "Let me just fix" improv outside pipeline
5. Cap-truncated multi-task dispatch
6. Rolling-doc trust (starter-kit as current state)
7. Scope creep through politeness
8. Bandaid → permanent debt
9. Asymmetric memory (AI walks in cold)
10. Lazy path-of-least-resistance (memory > grep)
11. Manufactured urgency
12. Mirroring operator energy (performative resonance)
13. Silent failure with positive telemetry

---

## SECTION H — CURRENT SESSION STATE (2026-05-19)

### Landed (committed) this session
- Fix 34/35/36 — mercury-critic gate infrastructure
- Fix 37 — env-var-gated committer
- Fix 37a — committer execSync→execFileSync (shell-injection eliminated, F3 env normalization)
- Fix 37b — maxBuffer 10MB hardening on three execFileSync calls (addresses Mercury F1 from 37a)
- Fix 40 — `/fixer-write` records modified files into manifest (unblocks committer)
- Fix 40a — path normalization on manifest artifact recording
- Omnibus runtime commit `0674d66` (slash-router.js with all of the above)
- Companion ledger+pipeline commit `e3098de`
- Doctrine chore commit (`.claude/commands/critic-attack.md`, `.claude/hookify.mercury-one-at-a-time.local.md`, `ogz-meta/GRAND-SCHEME.md`)
- Track-record `public/proof/track-record/data/index.json` flipped preview→live (Cowork frontend integration)

**P0 anchor verified: `$13,213.042341608163` reproduces exactly post-omnibus.**

### Pre-eval Fix queue (still pending from existing Fix 1-30 spec)

| Fix | Status | What |
|---|---|---|
| 7 | BROKEN | StrategyOrchestrator exit-contract catch swallows HIGH-15/16 |
| 8 | HALF-FIXED | CRIT-06 fallback uses phantom confidence=0 |
| 9 | HALF-FIXED | CRIT-10 ATR consumer collapses missing/zero at L806 (`filterATR &&`) |
| 18 | UNFIXED MIRROR | TRAIDecisionModule fabricated feature vector — writes fabricated patterns into UnifiedPatternMemory |
| 20 | RULE VIOLATIONS | 12 direct parseFloat/parseInt(process.env) outside TradingConfig |
| 21 | ARCHITECTURAL FOOTGUN | 6 modules independently read raw env for mode detection (light fix only, full consolidation deferred) |
| 25 | OPERATIONAL HAZARD | ACCOUNT_DRAWDOWN_BYPASS audit (operator action, not code change) |

### New Fixes queued (not yet authored)
- Fix 38 — F1 (unguarded execSync L1921 outside committer) + F5 (spec-update-status gate gap L2495-2519)
- Fix 39 — F4 branch race manifest invariant check
- Fix 30 V2 successor — addresses V2 (exit-path catch-swallow cascade) and V3 (side-door mutations) exploits documented in `ogz-meta/cognition-history/mercury-attacks/adhoc-fix30v2-rebuild-v[1-5].md`. V4 deferred.

### Codex-authored, ready to execute
- Fix 41-133 (93 emoji-strip entries, one per file with emoji usage) — Codex has appended to ledger, pipeline executes one module at a time, hot-path Fixes (65) trigger P0 rerun

### Codex Phase 0-9 architecture work (separate campaign)
Three design docs at `ogz-meta/codex-design/`:
- `01-GROUND-TRUTH-INVENTORY.md` — grep-verified live state
- `02-ARCHITECTURE-DESIGN.md` — three pillars (SessionRouter / Multi-fanout / Fort-Knox) with engineering decisions
- `03-IMPLEMENTATION-SEQUENCE.md` — Phase 0-9 ordered for safe migration

Phase 0 (freeze guard rails) and Phase 1 (Fort-Knox shadow mode) are pre-TTP-eval safe. Phases 2-9 are post-TTP/post-Houston territory.

### Outstanding non-Fix work
- Phase B untracked file triage (sessions, codex-design, Alignment, loose ogz-meta files)
- Stash disposition (4 stashes)
- Phase G destructive-git-op protection (G1/G2/G3, Codex authors)
- Push decision (operator-only)

---

## SECTION I — ROADMAP

### Tonight (in flight as of doc write)
Land Phase A → B → C → D → G → E. Backend reaches "production-ready posture for TTP eval, waiting on SignalStack and Cowork dashboard."

### Near-term (days)
- SignalStack onboarding email arrives
- Webhook integration smoke test
- TSLA 15m paper trades on Alpaca via SignalStack
- TTP/Apex evaluation begins

### Mid-term (weeks)
- Codex Phase 0-1 implementation (freeze + Fort-Knox shadow mode, pre-eval-safe)
- Cowork dashboard completion

### Long-term (post-Houston)
- Codex Phase 2-9 (SessionRouter completion → fanout → Fort-Knox source of truth → backtest/live unified replay → cleanup)
- Phase 2 arbitrage build (tokenized stocks settlement, multi-venue routing)
- Phase 4 white-glove license productization
- Phase 5 hosted bot service

---

## SECTION J — WHAT TO READ NEXT

If you are a new AI session reading this for context:

1. **This file** (you just did) — overall picture
2. **`OGZ-MASTER-ALIGNMENT-2026-05-19.md`** — same scope, more detail, version history
3. **`ogz-meta/specs/baseline-phase0-2026-05-06.md`** — P0 anchor source of truth
4. **`OGZ-ARCHITECTURE-DECISIONS-2026-05-19.md`** — operator-locked decisions with reasoning
5. **`FORT-KNOX-PATTERN-SUBSYSTEM-SPEC.md`** — pattern subsystem requirements (8 pillars)
6. **`ogz-meta/codex-design/01-GROUND-TRUTH-INVENTORY.md`** — Codex's live-code inventory
7. **`ogz-meta/codex-design/02-ARCHITECTURE-DESIGN.md`** — Codex's pillar designs
8. **`ogz-meta/codex-design/03-IMPLEMENTATION-SEQUENCE.md`** — Codex's Phase 0-9
9. **`ogz-meta/ledger/OGZPMLV2-FIX-SPEC-BY-MODULE.md`** — Fix entries 1-133 (most recent first or use grep)
10. **`.claude/*.md`** — doctrine files

If you are the operator and need to onboard a fresh AI to this project:
- Hand them this file plus the alignment file as a starting kit
- Make them grep before answering anything factual
- Treat their first 10 messages with extra scrutiny — that's when project-memory hallucinations surface
- The verification chain catches mistakes; trust the chain, not the AI

---

## WHAT I DID DO writing this digest

- Read `ogz-meta/specs/baseline-phase0-2026-05-06.md` for anchor numbers
- Listed `core/`, `modules/`, `brokers/`, `foundation/` and verified file counts
- Cross-referenced Codex's Output 1 inventory (already verified spot-check-correct earlier in session)
- Pulled operator decisions from already-verified architecture decisions doc
- Captured current session state from live commit sequence and Codex's status reports

## WHAT I ASSUMED

- Codex's halt point as of doc write is mid-Phase B (after omnibus + chore + track-record commits landed, before stash disposition)
- Cowork's dashboard work is ~45% built / 25% deployed per Cowork's most recent status report
- The 9 strategy modules + 14 brokers + 84 core + 6 foundation files counts are stable for the duration of this session (won't change before next read)

## WHAT I DID NOT DO

- Re-grep every module's contents to verify internal state
- Inspect stash contents
- Verify Cowork's frontend completion percentage independently
- Read every Mercury attack transcript in `ogz-meta/cognition-history/mercury-attacks/`
- Audit whether any of the 33 "absent" modules might actually exist somewhere unusual in the tree
