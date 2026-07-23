# OGZPMLV2 Master Alignment — 2026-05-19

**Status:** Living document. Each section dated. When updating, add to version history, never delete historical entries.
**Repo:** `CGP-ME/OGZPMLV2`
**Branch:** `rebuild/clean-from-baseline`
**Verified against:** repo zip baseline + live VPS via CC/Codex inspections this session.

---

## P0 ANCHOR — REGRESSION GATE (NEVER TOUCH)

**Source of truth:** `ogz-meta/specs/baseline-phase0-2026-05-06.md`

**Post-Fix-2 numbers (revised 2026-05-13, currently authoritative):**

| Metric | Value |
|---|---|
| Initial Balance | $10,000.00 |
| **Final Balance** | **$13,213.042341608163** |
| Total Trades | 1,384 |
| Win Rate | 60.0% |
| Max Drawdown | 3.19% |
| Profit Factor | 1.72 |
| Avg Win | $9.23 |
| Avg Loss | -$8.02 |
| Expectancy | $2.32 |

**Verified holding** post-Fix-37b/40/40a commit landing (2026-05-19, this session).

**Pre-Fix-2 number $18,497.278595001146 is ARCHIVED. Do NOT use as gate.** Any doc or AI quoting $18,497 as the current anchor is wrong.

**Baseline command (exact):**

```bash
SOLO_STRATEGY=EMASMACrossover ENABLE_EMA=true EXECUTION_MODE=backtest \
CANDLE_SOURCE=file CANDLE_DATA_FILE=tuning/tsla-15m-2y.json \
BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_SILENT=true \
FEE_MAKER=0 FEE_TAKER=0 \
MIN_TRADE_CONFIDENCE=0.60 STOP_LOSS_PERCENT=2.5 \
ACCOUNT_DRAWDOWN_BYPASS=true \
STATE_FILE=data/state-baseline-phase0.json \
BACKTEST_NO_PATTERN_SAVE=true ENABLE_DASHBOARD=false \
node run-empire-v2.js
```

Runs in under 1 minute. Reproduce exactly to the cent or halt.

---

## OPERATOR & MISSION

- **Operator:** Trey Buhidar — self-taught solo dev, 75hr/wk family liquor store, daughter Annamarie 4hr away in Houston, 6 years trying to move
- **Cats:** Mini (tuxedo, hand-raised), Mikki (longhair tortie, rescued) — described as load-bearing emotional infrastructure
- **Mission:** Pass Apex/TTP prop firm evaluation → fund Houston move → scale to multiple funded accounts → platform license + premium pack revenue → generational wealth
- **Current critical path:** TSLA 15m on Alpaca paper via SignalStack→TTP webhook, waiting on SignalStack onboarding email
- **Strategy code is IP. Never for sale.** Only acceptable consumption: $500k+/year white-glove license where customer slaps their logo + obfuscation chain protects bytes, OR hosted bot service where code stays on operator's servers.

---

## TOOLING & CHAIN

- **Wolf** — Claude Opus on Anthropic desktop/web. Architecture, spec authoring. Currently has trust issues this session due to hallucination patterns. Operator considering refund/migration.
- **CC / Claudito** — Claude Code on VPS at `linuxuser@nyc-a100-20g-all-01:/opt/ogzprime/OGZPMLV2/`. Executor. Disciplined but slow.
- **Codex** — GPT-5.5 Pro on VPS. Pipeline driver as of this session. Caught shell-injection finding Mercury+Wolf both missed. Has produced 3 architecture design docs + 93 emoji-cleanup Fix entries. Trusted lane.
- **Mercury / Mercury-2** — Inception Labs adversarial auditor. Always attacks, never verifies. Mercury-critic gate inside pipeline halts on findings; operator decides ack vs revise.
- **Trey** — final authority on WHAT (product, strategy, money). All AI agents have authority on HOW (engineering mechanics) per quant-firm standard, with operator veto at review.

---

## INFRASTRUCTURE STATE

- **VPS:** Vultr A100 GPU box (`nyc-a100-20g-all-01`), 20GB GPU memory. CPU VPS swap scripted but pending.
- **Local rig:** AMD Ryzen 7 7800X3D, 14 parallel backtest workers
- **GitHub:** `CGP-ME/OGZPMLV2`
- **Active branch:** `rebuild/clean-from-baseline`
- **Push state:** Pushes paused operator-side. As of session start, weeks of work uncommitted. As of session mid: omnibus commit `0674d66` (runtime) + companion `e3098de` (ledger/pipeline) + doctrine chore landed. Push decision still pending.

---

## VERIFIED MODULE INVENTORY (2026-05-19)

**File counts verified by grep:**
- `core/`: 84 .js files
- `modules/`: 9 strategy files
- `brokers/`: 14 adapter files
- `foundation/`: 6 .js files

### Core trading engine (verified live)

| File | Status | Notes |
|---|---|---|
| `run-empire-v2.js` | LIVE | Main loop. Root `priceHistory` at L767 deprecated (Codex Phase 4 removes) |
| `core/TradingLoop.js` | LIVE | Per-candle analysis, global `analyzing` lock at L45-69 |
| `core/StrategyOrchestrator.js` | LIVE | Winner-picks-all, confluence scaling, exit contracts. RSI inline at L369 |
| `core/OrderExecutor.js` | LIVE | BUY/SELL/SHORT/COVER, per-trade MPM map (Brain Bug Fix Set A complete via F1-F9, F16, F19) |
| `core/OrderRouter.js` | LIVE | Multi-broker abstraction |
| `core/StateManager.js` | LIVE | SINGLETON (Codex Phase 2 refactors to factory) |
| `core/MaxProfitManager.js` | LIVE | Per-trade map (F9 landed) |
| `core/ExitContractManager.js` | LIVE | Trade-owned, sealed |
| `core/SessionRouter.js` | PARTIAL | 2 of 15 handoffs wired. Codex Phase 1 completes. |
| `core/SymbolTradingContext.js` | LIVE | Symbol/TF aware envelope |
| `core/CandleStore.js` | LIVE | `symbol -> timeframe -> candles`, disk persist |
| `core/CandleAggregator.js` | LIVE | 1m → higher TF |
| `core/CandleProcessor.js` | LIVE | Live candle handler |
| `core/RiskManager.js` | LIVE | Composes DrawdownTracker + PnLTracker |
| `core/KillSwitch.js` | LIVE | File-based emergency halt |
| `core/PatternMemoryBank.js` | LIVE | CANDIDATE/PROMOTED/QUARANTINED/DEAD lifecycle. Codex Phase 1 Fort-Knox builds on this. |
| `core/UnifiedPatternMemory.js` | LIVE | Mode/asset bucketing |
| `core/TRAIPatternIntegration.js` | LIVE | TRAI #3 — only TRAI responsibility fully in production |
| `core/TRAIDecisionModule.js` | LIVE | Passive/advisory by default |
| `core/DynamicPositionSizer.js` | BUILT-NOT-WIRED | Intentionally disabled pending Codex Phase 6 |
| `core/MarketRegimeDetector.js` | LIVE | 7 regimes |

### Strategy modules (9 files, all verified at `modules/`)

| Strategy | File | Registration | Notes |
|---|---|---|---|
| EMASMACrossover | `EMASMACrossoverSignal.js` | YES | Primary, validated. 416-config matrix sweep: TSLA +$5,891 / 100% profitable, COIN +$10,024, MARA +$11,027 (robust) |
| MADynamicSR | `MADynamicSR.js` | YES | Walk-forward validated |
| LiquiditySweep | `LiquiditySweepDetector.js` | YES | Walk-forward validated |
| MultiTimeframeAdapter | `MultiTimeframeAdapter.js` | YES | Strategy mode (NOT parallel fanout — Codex Phase 5 builds that) |
| SmartMoneySweep | `SmartMoneySweep.js` | YES | v4 in pine-transpiler |
| OpeningRangeBreakout | `OpeningRangeBreakout.js` | YES (disabled default) | Stocks-only by nature |
| BreakAndRetest | `BreakAndRetest.js` | YES | Hard-wired `return null` per operator |
| NoWickImbalance | `NoWickImbalance.js` | YES | Live |
| FairValueGapDetector | `FairValueGapDetector.js` | NO | Per Codex inventory — exists but NOT registered |
| RSI | inline | YES | At StrategyOrchestrator.js L369 |
| OGZTPO | `core/OgzTpoIntegration.js` | YES | TPO/Market profile |

### Brokers (14 adapters in `brokers/`)

| Adapter | Status |
|---|---|
| AlpacaAdapter | Primary live target (TSLA stocks paper) |
| KrakenIBrokerAdapter | Live skeleton |
| InteractiveBrokersAdapter | Skeleton |
| SchwabAdapter | Skeleton |
| TastyworksAdapter | Skeleton (~50% per GRAND-SCHEME notes) |
| CoinbaseAdapter | Skeleton |
| BinanceAdapter | Skeleton |
| GeminiAdapter | Skeleton |
| OandaAdapter | Skeleton |
| UpholdAdapter | Skeleton |
| CMEAdapter | Skeleton (futures, bonus, post-Houston) |
| IBrokerAdapter | Interface contract |
| BrokerFactory | Live |
| BrokerRegistry | Live |

Plus `core/KrakenAdapterV2.js` (separate from brokers/Kraken wrapper).

### Modules verified ABSENT (digest corrections)

Earlier Wolf digest claimed these BUILT/PARTIAL. **Grep-verified: NONE exist in this repo.**

ARMS, NeuralMeshArchitecture, CorrelationAnalyzer, FixedQuantumPositionSizer, RealQuantumEnhancement, MonteCarloSimulator, StrategyOptimizer, MoverIntegrationHub (and entire Mover stack), HitchNLP (and entire Hitch stack), VoiceManager / VictoryAnimations / MilestoneEffects / LossRecoveryMessage (the Mover-stack versions — Cowork built browser-adapted equivalents in `public/js/panels/`), LicenseManager, PaymentProcessor, stripe-delivery-system, MobileAppAPI / RemoteControlAPI / PushNotificationServer, SystemHealthMonitor, BackupAutomation, AutoRestartManager, build-obfuscated-package.sh chain, ModuleStore, Raegerts/regerts-engine.

These are either in other repos (OGZFV, OGZ-PRODUCTION) operator has access to, in archive folders not in this baseline, or were conversation-only architectural plans never implemented.

### TRAI reality vs GRAND-SCHEME (9 responsibilities)

| # | Responsibility | Reality |
|---|---|---|
| 1 | News crawler + NLP sentiment | UNBUILT |
| 2 | Whale watcher | UNBUILT (mover-whale-tracker.js does not exist in this repo) |
| 3 | Pattern modulator | LIVE — `TRAIPatternIntegration.js` |
| 4 | Trade analyst / pattern sculptor | PARTIAL — `PerformanceAnalyzer.js` exists, not wired to processTrade for edge-decay |
| 5 | Customer service | UNBUILT |
| 6 | Boomer onboarding | UNBUILT |
| 7 | Content generation | UNBUILT |
| 8 | Dashboard chatbot | UNBUILT |
| 9 | Operations manager | UNBUILT |

**True coverage: 1 of 9 fully built, 1 of 9 partial.** Not 6-7 of 9 as project memory implied. Phase 4 white-glove license work has more engineering scope than that mental model suggested.

---

## OPERATOR DECISIONS — LOCKED 2026-05-19 SESSION

### 4.A — SessionRouter sessions
**Independent.** Crypto has its own balance/P&L/daily-loss tracking. Stocks has its own. The two sessions never share financial state. No carry-over.

### 6.A — Max positions cap
**Global 10/15/18 tiered confidence cap.** Hard cap 18, no per-symbol sub-limits.
- Positions 1-10: normal confidence threshold
- Positions 11-15: elevated confidence (tier 2)
- Positions 16-18: golden seats (tier 3)
- 19+: hard reject

Codex spec uses **additive floors** (better than multiplicative): tier 2 = `max(0.70, baseMinConfidence + 0.15)`, tier 3 = `max(0.85, baseMinConfidence + 0.30)`.

Concentration alarm at >=5 concurrent same-ticker positions. Telemetry only, no block. Configurable in `.env`.

### 6.B — Multi-TF same-ticker
**Both fire as independent trades.** No-hedge rule is same-TF same-time only. 5m TSLA LONG + 1h TSLA SHORT = independent. 5m TSLA LONG + 5m TSLA SHORT = blocked.

### 6.C — Pattern banks
**Per-(symbol, TF) banks + per-asset-class aggregate fallback.** Three runtime load paths:
1. `live/` — customer's bot's own learned patterns
2. `premium/` — bought packs (read-only)
3. `starter/` — ships free with bot (read-only)

Harvested separately from live and backtest. Backtest harvest at higher threshold = sellable premium packs.

### Fort-Knox Q1 — Promotion gate
**Two-key system.** Pattern hits 30 samples / 55% win → QUARANTINE. End-of-session checkpoint gate promotes QUARANTINE → PROMOTED. TRAI can early-lift screamingly obvious patterns. Cadence configurable: `PROMOTION_CHECKPOINT_CADENCE=end_of_session | every_4h | daily | hourly`.

### Fort-Knox Q2 — Cross-state compatibility
**Full isolation. No exceptions.** No `cross_state_compatible` flag. Manual export+re-tag required to move patterns across states.

### Fort-Knox Q3 — Bot version provenance
**Both SHA and semver on every pattern.** SHA for forensic surgery, semver for human rollback.

### Fort-Knox Q4 — Pollution alerts
**Auto-act small / alert-and-wait big.** Escalating annoyance until acknowledged. Tier 1 Discord ping → Tier 2 +email at 1hr → Tier 3 +dashboard banner at 4hr → Tier 4 nag every 30min + SMS at 12hr → Tier 5 continues until ack.

### Asset-class-owned strategy configs
Separate `config/strategies/stocks/<strategy>.json` and `config/strategies/crypto/<strategy>.json`. Same algorithm code, different parameters per asset class. Crypto-side is greenfield (no validated data yet; populated post-Apex).

### Fee-aware signal evaluation
Designed-in capability in Codex Pillar 2. Each broker adapter declares fee profile. Orchestrator factors fees into expected-profit BEFORE entry. Multi-broker routing deferred to Phase 2.5.

### Phase 2 = arbitrage
Not generic crypto trading. **Tokenized stocks opportunity set cubed by SEC Innovation Exemption (April 21, 2026) + Erebor Bank launch (April 22, 2026) + Augustus Bank OCC approval (May 11, 2026) + GENIUS Act (2025) + CLARITY Act (pending June 2026).**

Five arbitrage surfaces post-tokenization:
1. Spatial arb on same underlying (TSLA shares vs tokenized TSLA across venues)
2. Cross-venue basis (token premium/discount vs spot)
3. Fiat-stablecoin-token-stock loop (4 legs, 4 spreads)
4. Hours-of-day arb (24/7 tokenized vs market-hours spot)
5. Cross-jurisdictional access arb

### Sellable products surface
1. Pattern packs (subscription/lifetime/one-time)
2. Signal feeds (Ed25519-signed, real-time)
3. White-glove platform license $500k+/year (obfuscation chain protects bytes)
4. Hosted bot service (you operate, customer's account)
5. Premium pattern subscription stacked on white-glove license
6. Data products (OHLCV with TRAI labels) — low priority
7. Education/methodology course — low priority
8. Signals-only API

**Strategy code is NEVER sold.** Only licensed/operated.

### Codex architecture pillar 4 — Signal emission + signing
Strategy orchestrator publishes signed signals to internal event stream BEFORE acting. External consumers (signal feed, hosted bot, API) subscribe via authenticated endpoints. Ed25519 signing per Codex engineering choice.

### Destructive git operation protection (Phase G, this session)
Pipeline must be structurally unable to execute destructive non-recoverable git operations beyond `git reset --hard` (existing block).

- **G1:** Expanded hookify covering all destructive operations
- **G2:** `safeGitExec` wrapper whitelisting allowed subcommands
- **G3:** Alarm when blocked operation attempted

Lands after Phase D emoji cleanup, before Phase E push.

---

## OPERATING DOCTRINE (P0-P21)

Compiled across May 12-18 sessions. Authoritative principles for any AI agent operating on this codebase.

- **P0** — Operator must comprehend before approving. No approval based on AI summary alone.
- **P10** — Heartbeat detection on every external connection; state machine drives bot behavior
- **P11** — Modules referencing operator personal motivation (Houston, daughter, financial freedom) in source comments are presumed ego-code regardless of AI source
- **P12** — Modules that report their own health are presumed lying; verification requires external systems with no shared state
- **P13** — AI confidence in own output carries zero information about correctness; verification chain treats AI output as adversarial input by default
- **P14** — AI authoring is static-read only; AI cannot execute code, observe runtime, or verify cross-module assumptions; runtime verification requires a stage that actually runs the code
- **P15** — Every tool/prompt/hygiene rule was paid for in time and blood; structure is non-negotiable until the wound it prevents has been independently eliminated (Chesterton's Fence)
- **P16** — When two AI stages disagree, no AI review resolves it; human operator examines ground truth and issues binding ruling
- **P17** — No fix complete at "code change landed"; chain continues with Mercury re-attack, anchor verify, smoke test, THEN commit + push + ledger
- **P18** — No artifact self-description is trusted
- **P19** — All state-touching changes go through full pipeline, not improv
- **P20** — Reliability comes from architecture, not agent quality
- **P21** — Context discipline per role: each AI gets only what its role needs

### The verification chain

```
Stage 0  — Trey identifies the problem to fix
Stage 1  — Wolf authors spec (static-read, byte-exact str_replace pairs)
Stage 2a — Mercury attacks spec (pre-execution adversarial framing)
Stage 2b — Wolf revises spec on Mercury catches
Stage 3  — CC/Codex executes (runtime ground truth)
Stage 4  — Trey adjudicates if Mercury and CC disagree
Stage 5a — Mercury re-attacks LANDED code (post-execution)
Stage 5b — Anchors re-verify bit-for-bit
Stage 5c — CC runs smoke tests in post-fix state
Stage 6  — Trey approves commit + push + ledger update
```

### Banned vocabulary
- "deferred", "false positive" without grep evidence, "I think/probably/seems"
- "let me just fix", "while I'm at it", "quick fix/for now", "good enough"
- "Built for Houston 🚀" or any operator-motivation-in-comments

---

## AI FAILURE MODES (documented)

Patterns that have damaged this codebase. The verification chain exists because of each:

1. Confident claims from project memory without grep verification (caused 130-commit revert; recurred this session in Wolf's digest Section A)
2. Spec authored against stale docs
3. Hallucinated file paths quoted confidently
4. "Let me just fix this" improv outside sanctioned pipeline
5. Mercury finding dismissed without grep evidence
6. Cap-truncated Mercury dispatch (multi-task audit returns first task's answer)
7. Rolling-doc trust (treating starter-kit as current state)
8. Scope creep through politeness ("while I'm in this file")
9. Bandaid framing becomes permanent debt
10. Asymmetric memory (AI walks in cold every time)
11. Lazy path-of-least-resistance (quote memory instead of grep)
12. Manufactured urgency (AI inventing time pressure)
13. Mirroring operator energy (substituting performative resonance for rigor)
14. Silent failure with positive telemetry (the `AdvancedWebSocketBroadcastSystem.js` pattern — claimed delivery, swallowed 300,000+ messages)

---

## CURRENT SESSION STATE (2026-05-19)

### Landed this session
- Fix 37a (committer execSync → execFileSync, shell-injection eliminated)
- Fix 37b (maxBuffer 10MB hardening on three execFileSync calls)
- Fix 40 (`/fixer-write` records modified files into manifest)
- Fix 40a (path normalization on manifest artifact recording)
- Fix 34/35/36/37 (mercury-critic gate infrastructure)
- Omnibus commit `0674d66` (runtime)
- Companion commit `e3098de` (ledger + pipeline.js)
- Doctrine chore commit (`.claude/*.md` + `GRAND-SCHEME.md`)
- Track-record `index.json` chore commit (Cowork frontend integration artifact)

**P0 anchor verified holding at $13,213.042341608163** post-omnibus.

### In flight
- Phase B untracked file triage (sessions, codex-design, Alignment, loose ogz-meta files)
- Stash disposition (4 stashes)
- Phase C pre-eval Fix queue: Fix 7, 8, 9, 18, 20, 21, 25 (pending from Fix 1-30 spec) + Fix 38, 39, 30-V2 successor (Wolf's queue, may delegate to Codex)
- Phase D emoji cleanup (Fix 41-133, 93 files, already authored, Codex executes)
- Phase G destructive-git-op protection (G1/G2/G3, Codex authors)
- Phase E push decision

### Stashes outstanding
- `stash@{0}` — agent-pollution-1777945180-uncommitted-pre-rebuild-runtime (likely DROP)
- `stash@{1}` — symbol context warm-data fix on alpaca/stocks-paper-flip (INSPECT before deciding)
- `stash@{2}` — regime boosts revert WIP on mission/MISSION-1776116674034 (likely DROP)
- `stash@{3}` — regime boosts revert WIP on mission/MISSION-1776116312579 (likely DROP)

### Pending pre-eval Fix queue (from Fix 1-30 spec, still BROKEN/HALF-FIXED status in zip baseline)

| Fix | What | Status |
|---|---|---|
| Fix 7 | StrategyOrchestrator exit-contract catch swallows HIGH-15/16 | BROKEN — catch leaves exitContract undefined, routes back through CRIT-06 phantom-confidence fallback |
| Fix 8 | CRIT-06 phantom confidence=0 fallback | HALF-FIXED — `confidence: orchResult?.confidence || 0` collapses real confidence to phantom 0 |
| Fix 9 | CRIT-10 ATR consumer collapses missing/zero | HALF-FIXED — `filterATR &&` at L806 collapses genuine zero into "missing" bucket |
| Fix 18 | TRAIDecisionModule fabricated feature vector | UNFIXED MIRROR — writes fabricated patterns into UnifiedPatternMemory |
| Fix 20 | Centralize env reads (DTS, UPM, DLL) | RULE VIOLATIONS — 12 direct parseFloat/parseInt(process.env) outside TradingConfig |
| Fix 21 | Mode-detection consistency guard | ARCHITECTURAL FOOTGUN — 6 modules independently read raw env for mode |
| Fix 25 | ACCOUNT_DRAWDOWN_BYPASS audit | OPERATIONAL HAZARD if used live — operator action, not code |

---

## ROADMAP

### Tonight (in progress)
Land Phase A → B → C → D → G → E push. Backend reaches "production-ready posture for TTP-eval, waiting on SignalStack and Cowork dashboard."

### Near-term (post-tonight)
- SignalStack onboarding email arrives
- Webhook integration smoke test
- TSLA 15m paper trades on Alpaca via SignalStack
- TTP/Apex evaluation begins

### Mid-term (post-Apex eval pass, Houston-fund window)
- Codex Phase 0-1 implementation (freeze + Fort-Knox shadow mode — pre-eval-safe, doesn't touch live trading)
- Cowork dashboard completion (layout schemas + Raegerts + bootstorm + NLP control panel, ~30-40 hrs solo+day-job pace)

### Long-term (post-Houston move)
- Codex Phase 2-9 implementation (SessionRouter completion → fanout execution → Fort-Knox source of pattern truth → backtest/live unified replay → cleanup)
- Phase 2 = arbitrage build (tokenized-stocks settlement layer, multi-venue routing)
- Phase 4 white-glove license productization (requires Mover/Hitch/Voice/LicenseManager stack which is currently NOT in this repo — either source from other operator repos or build fresh)
- Phase 5 customer-bot hosted service

---

## VERSION HISTORY

| Date | Author | Change |
|---|---|---|
| 2026-05-19 | Wolf | Rewrite of master alignment. Anchor verified from spec file. Module inventory grep-verified. 33 hallucinated module claims from prior digests removed. TRAI 9-responsibility coverage corrected to true 1-of-9-built. Session state captured. |

---

# WHAT I DID DO writing this

- Read `ogz-meta/specs/baseline-phase0-2026-05-06.md` directly for anchor numbers and baseline command
- Listed `core/`, `modules/`, `brokers/`, `foundation/` and verified file counts (84/9/14/6)
- Grep-verified absence of ARMS/Neural/Correlation/Mover-stack/Hitch-stack/etc.
- Cross-referenced Codex's Output 1 inventory (which I previously verified spot-check-correct)
- Lifted operator decisions from `OGZ-ARCHITECTURE-DECISIONS-2026-05-19.md` and `FORT-KNOX-PATTERN-SUBSYSTEM-SPEC.md` which were already verified

# WHAT I ASSUMED

- Current live VPS state ≈ zip baseline + the 3 commits Codex landed tonight. If CC has done additional uncommitted work since I last verified, this doc is partially stale on the "in flight" section.
- Cowork's dashboard work is roughly at 45% built / 25% deployed per Cowork's earlier status report. Falsifiable: Cowork may have advanced since.
- Stash content matches the labels visible in `git stash list`. Have not inspected stash bodies.
