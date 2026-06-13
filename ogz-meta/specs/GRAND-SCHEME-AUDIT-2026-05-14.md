# GRAND-SCHEME Audit — Spec vs Current Code

**Author:** Wolf (Claude Opus 4.7)
**Date:** 2026-05-14
**Operator:** Trey Buhidar
**Reference spec:** `ogz-meta/specs/GRAND-SCHEME.md` (dated 2026-04-07)
**Audited against:** repo extracted 2026-05-14, post-15-commits state

**Purpose:** Map every claim in GRAND-SCHEME against current code reality. For each section: spec quote, current state read from code, gap, honest effort estimate.

**Operating principle:** No design decisions in this doc. No "I'd build it this way." Just spec → reality → gap → size.

---

## Trading Engine

### Bottom layer — broker adapter abstraction

**Spec quote:** "The bot abstracts brokers behind a common adapter interface (`IBrokerAdapter.js`, `BrokerFactory.js`, `BrokerRegistry.js`). Each broker — Alpaca, IBKR, Schwab, Tastyworks, Kraken, Coinbase, Binance, OANDA, Gemini, Uphold — implements the same contract."

**Spec coverage list:** Alpaca, IBKR, Schwab, Tastyworks, Kraken, Coinbase, Binance, OANDA, Gemini, Uphold (10 brokers).

**Current state:**
- IBrokerAdapter.js — EXISTS (interface with 25 "must be implemented" throws)
- BrokerFactory.js — EXISTS (dynamic adapter creation via registry, validates required methods)
- BrokerRegistry.js — EXISTS (broker metadata, file paths, asset types)
- AlpacaAdapter.js — EXISTS, 689 lines, zero unimplemented throws
- InteractiveBrokersAdapter.js — EXISTS, 463 lines
- SchwabAdapter.js — EXISTS, 583 lines
- TastyworksAdapter.js — EXISTS, 477 lines
- KrakenIBrokerAdapter.js — EXISTS, 424 lines (plus a separate KrakenAdapterV2.js in core/)
- CoinbaseAdapter.js — EXISTS, 528 lines
- BinanceAdapter.js — EXISTS, 606 lines
- OandaAdapter.js — EXISTS, 499 lines
- GeminiAdapter.js — EXISTS, 567 lines
- UpholdAdapter.js — EXISTS, 439 lines
- BONUS: CMEAdapter.js — EXISTS, 443 lines (futures, not on spec list but built)

**Verification:** 12 adapters present (10 specced + 2 extras CME and Kraken-V2). Every adapter has zero unimplemented-method throws → structural skeletons are filled in.

**Gap:** STRUCTURAL = NONE. The 10 specced adapters all exist with implementations. CME bonus.

**FUNCTIONAL GAP (NOT verified):** Whether each adapter actually transacts correctly against its real broker API. Implementation existing ≠ implementation correct. Each adapter's endpoint URLs, auth, payload shapes, response parsers need verification against each broker's actual REST/WebSocket docs. **This audit was not done.**

**Effort to verify functional correctness:** 2-3 hours per adapter (read docs, trace implementation, identify wrong endpoints or stale auth patterns). 12 adapters × 2.5 hrs = ~30 hours total. Could be parallelized per broker.

**Effort to FIX any broken adapter:** Depends on what's broken. Endpoint URLs are 1-hour fixes. Auth model changes (OAuth refresh, session expiry) are 4-8 hours. Symbol notation per broker is 1-2 hours. Order shape is 2-4 hours. WebSocket reconnection logic is 4-8 hours.

**Realistic ask:** "Are my active brokers (Alpaca, Kraken) actually working?" Audit those two first. ~5 hours. Other 10 can wait until they're actually needed.

---

### Middle layer — strategies and orchestration

**Spec quote:** "Independent strategy modules emit signals each candle. The StrategyOrchestrator collects them, picks the highest-confidence winner, hands the trade to the executor with a per-strategy locked exit contract, and uses confluence (multiple agreeing strategies) to scale position size from 1x to 2.5x."

**Strategy list in spec:** RSI, EMASMACrossover, MADynamicSR, LiquiditySweep, MarketRegime, MultiTimeframe, OGZTPO, OpeningRangeBreakout, SmartMoneySweep (9 strategies).

**Current state:**

**Strategies that EXIST in code (verified by file search):**
- EMASMACrossoverSignal.js — `/modules/`
- MADynamicSR.js — `/modules/`
- LiquiditySweepDetector.js — `/modules/`
- MultiTimeframeAdapter.js — `/modules/`
- SmartMoneySweep.js — `/modules/` (with v4 in pine-transpiler)
- OpeningRangeBreakout.js — `/modules/`
- MarketRegimeDetector.js — `/core/`

**Strategies CLAIMED but NOT FOUND:**
- **RSI** — no RSIStrategy.js or RSI module file found
- **OGZTPO** — no OGZTPO.js found (OgzTpoIntegration.js exists in ogz-meta but no module)

**Gap:** 2 of 9 claimed strategies not present as modules. RSI is referenced throughout the codebase (Fix doc, backtest configs, walk-forward validation results) — suggests RSI logic exists somewhere not in `/modules/`, possibly inline in StrategyOrchestrator or as a method. Needs deeper trace. OGZTPO file exists in ogz-meta but not wired as a strategy module.

**Effort to confirm RSI location:** 30 min grep + read.

**Effort to wire OGZTPO as a strategy:** Cannot estimate without reading OgzTpoIntegration.js to see what state it's in.

**Orchestrator behavior:**
- "Picks highest-confidence winner" — YES, verified at StrategyOrchestrator.js line 726 (`winnerStrategy`, returns top-confidence signal)
- "Per-strategy locked exit contract" — PARTIAL. exitContract concept exists at lines 361, 970, 995, 1009. But spec says "_validated fingerprints" — searched, found NONE. The lock-with-fingerprint mechanism is not implemented. Exit contracts get set per-strategy but can drift from spec because there's no validation hash.
- "Confluence scales 1x to 2.5x" — YES, exists at line 67 (`this.confluenceSizing`), with confluence boost logic. Line 14 comment says "2x for 2 agree, 3x for 3" — doesn't match spec's "1x to 2.5x." Either spec is stale or code over-shoots.

**Gap on confluence:** Spec says max 2.5x. Code's comment claims up to 3x. Need to read actual sizing logic to see real ceiling. Could be a real divergence.

**Gap on exit contract validation:** No `_validated` fingerprint mechanism. Strategy tuning can drift without anything catching it. This is a real architectural gap matching what the audit found (Fix 22 — MaxProfitManager tier-target `||` collapse — is a symptom of this; tuned values can silently revert to defaults).

**Effort to add _validated fingerprints:** Medium. Each exit contract gets hashed with key params at strategy definition time; orchestrator verifies hash matches when applying. ~1-2 days work + tests.

---

### Key invariants (per spec)

**Spec quote:** "Position size flows in USD throughout the entire pipeline (no asset-unit conversions)"

**Current state:** Verified — OrderExecutor.js line 126 (`const usdAmount = positionSize * price`) and line 810 comment (`FIX VALUE-USD-DOUBLE-MULT: usdAmount IS USD`) confirm USD-throughout convention. Fix 1 (value_usd × price) was specifically about correcting recording layer that had drifted from this invariant. **HOLDS.**

**Spec quote:** "Exit contracts are locked per strategy with `_validated` fingerprints"

**Current state:** GAP — see above. Mechanism does not exist.

**Spec quote:** "Backtests and live trading must use identical code paths with only the execution layer swapped"

**Current state:** Partially verified. BACKTEST_MODE env var gates several branches in OrderExecutor. Need to audit how many branches the backtest mode adds vs. swaps cleanly. Project memory says SignalStack webhook is the live path, BacktestRecorder is the backtest path, both flow through same StateManager. Looks structurally aligned but full verification not done.

**Effort to fully verify identical-path invariant:** Medium. Read every `if (BACKTEST_MODE)` branch and classify each as "execution layer swap" (acceptable) vs. "logic change" (violation).

**Spec quote:** "Every account is isolated — one process, one state file, one log directory, one kill switch per account"

**Current state:**
- State file isolation — STATE_FILE env var supported (P0 sets `STATE_FILE=data/state-baseline-phase0.json`)
- Process isolation — bot is single-process per run; multiple accounts = multiple `node run-empire-v2.js` invocations with different env. No multi-account-in-one-process. Aligns with spec.
- Kill switch — KillSwitch.js EXISTS in core/
- Log directory per account — uncertain, would need to verify how logs are namespaced

**Gap:** Looks aligned but verification incomplete on log directory namespacing. Probably fine.

**Effort to fully verify:** Small. 1 hour code read.

---

## Multi-Broker / Multi-Direction / Multi-Position / Multi-Timeframe Scanner

**Spec quote:** "Multi broker multi directional multi position multi time frame scanner that watches eight to ten specified tickers on every time frame checking it against known patterns and setups trying to find the best one or a good enough 1 to take the trade. All of the strategies fire independently they have their independent pipeline's in their own exit independent. As the architecture develops the strategies can become more robust adding liquidity manipulation checks and fake out reversal checks and whatever else that you use multi time frame validation for. Checking for liquidity checking for manipulation candles all of the above. More robust strategies better signals more profit less trade. And it can swap between crypto and stocks automatically autonomously."

This is the BIG one. Five requirements:

**1. Multi-broker simultaneous:** Bot runs against multiple brokers at once.

**Current state:** Single-broker-at-a-time. `BROKER=alpaca` or `BROKER=kraken` env var selects. Adapters exist for 10+ brokers but only one is active per process. Spec implies parallel.

**Gap:** Architectural. Need either (a) multi-broker-in-one-process orchestration or (b) explicit process-fleet with cross-process coordination. Process-fleet matches "account isolation" invariant — probably the spec-intended path.

**Effort:** Process-fleet management is medium. Multi-broker-in-one-process is large rewrite.

**2. Multi-directional:** Long and short.

**Current state:** SHORT branch exists in OrderExecutor (line 478+). `DIRECTION_FILTER` env var filters to long_only / short_only / both. `ENABLE_SHORTS=true/false` toggles.

**Gap:** Mechanism exists but not validated. P0 uses `ENABLE_SHORTS=false long_only`. Shorts have not been backtested honestly post-Fix-2. Could work, could not.

**Effort to validate shorts:** Small — re-run a backtest with shorts enabled, capture honest numbers, see what happens.

**3. Multi-position:** Multiple concurrent open trades.

**Current state:** activeTrades Map exists in StateManager keyed by orderId. F9 (per-trade MPM Map) landed in earlier commit cb04261. unrealizedPnL computed live from all activeTrades.

**Gap:** Foundations are there. Operator said one piece is built but "questionable if it works." Need to verify by running a backtest with maxPositions>1 and confirming each trade maintains independent state (entry, MPM tier, exit contract, attribution). Not tested in this audit.

**Effort to verify:** 1-2 hours. Run a maxPositions=3 backtest, inspect trade-by-trade records for cross-contamination.

**Effort to fix any cross-contamination found:** Unknown until found. Could be small (one shared variable) or large (every consumer reads from `this.state.<thing>` instead of `trade.<thing>`).

**4. Multi-timeframe parallel scanning, 8-10 tickers, all timeframes, strategies fire independently:**

**Current state:** Single-ticker, single-timeframe, serial. AdaptiveTimeframeSelector switches timeframes — but serially. MultiAssetManager exists but is tier-2, not on hot path per project memory. SOLO_STRATEGY env literally constrains to one strategy.

**Gap:** This is the largest gap by far. The bot's main loop is fundamentally not what the spec describes. Single-ticker single-TF single-strategy is the current architecture; spec demands N-ticker × M-timeframe × K-strategy fanout with independent pipelines.

**Effort:** Large rewrite of main loop. 2-4 weeks of focused work. Probably needs to coexist with current single-stream mode for P0 anchor preservation. Possibly an entire new orchestration tier above StrategyOrchestrator.

**5. Crypto/stocks autonomous switching:**

**Current state:** SessionRouter EXISTS. Partial handoffs wired. Project memory says 2 of 15 critical handoffs done. Crypto/stocks asset class detection logic in SessionRouter and SymbolContexts.

**Gap:** 13 of 15 handoffs not wired. Operator already flagged: "the 15 handoffs aren't necessary till arbitrage or until customers request them."

**Effort:** Medium. Each handoff is a few hours of wiring. 13 × few hours = a few weeks total. Deferred per operator.

---

## Asset Class Roadmap

**Spec:** Stocks (primary, Alpaca), Crypto (90% built, paused), Options (Tastyworks, half-built), Futures (IBKR), Forex (OANDA lowest), Arbitrage (phase 2).

**Current state:**

- **Stocks:** Alpaca adapter exists, 689 lines, primary deployment target. Aligned with spec.
- **Crypto:** Kraken/Coinbase/Binance/Gemini/Uphold adapters all exist. Multi-broker support is there structurally. "90% built, paused" probably refers to crypto-specific strategy tuning and arbitrage logic, not adapter completeness.
- **Options:** TastyworksAdapter.js exists, 477 lines. "Half-built" — would need to read to verify which methods are real vs. skeleton. Did not audit.
- **Futures:** InteractiveBrokersAdapter.js exists, 463 lines. CMEAdapter.js exists as bonus. Not wired into live deployment per current P0.
- **Forex:** OandaAdapter.js exists, 499 lines.
- **Arbitrage:** `ogz-meta/specs/arbitrage-equivalence-deferred.md` exists — the spec was started and deferred. NO arbitrage engine in code.

**Gap on arbitrage:** Complete. No cross-broker spread detection logic, no arbitrage execution path, no inventory management. Adapters provide the substrate (place orders on 3 venues), engine to coordinate doesn't exist.

**Effort on arbitrage:** Medium-Large. Spread detection is easy (compare bid/ask across venues). Execution is hard (atomic cross-venue trades, slippage, inventory rebalancing). Real arbitrage with risk management is 2-4 weeks.

---

## TRAI — Brain Layer

**Spec describes 9 TRAI responsibilities. Current state of each:**

### 1. News crawler + NLP layer
**Spec:** Reuters, Yahoo Finance, SEC EDGAR, Polygon news, sector feeds. Sentiment per headline. Tag by ticker/urgency/novelty/direction. Real-time confidence modulation. Suspend trading on dangerous days.

**Current state:** TRAIWebContext.js exists — would need to read to know what it actually does. Polygon API used for OHLCV (verified) but news endpoint integration not confirmed. No NLP sentiment pipeline visible. **MISSING.**

**Effort:** Large. News ingestion + NLP + real-time confidence routing is its own subsystem. 3-6 weeks honest. Could leverage existing LLM (Mercury) for sentiment which reduces the build to ingestion + routing.

### 2. Whale watcher
**Spec:** Unusual options activity, dark pool prints, block trades, 13F, Form 4, short interest, ETF rebalance. Highest-priority signal source (30-60 min lead time on big moves).

**Current state:** From operator's audit dump tonight — `mover-whale-tracker.js` exists with Pelosi/Crenshaw congress tracking config. NOT wired into OGZPrime trading loop. Lives in the Mover (TRAI v1) personality stack. Real data sources (UOA feeds, dark pool reads) not connected. **MISSING in OGZPrime; partial in Mover/TRAI v1.**

**Effort:** Large. Whale data sources are paid feeds ($$). Architecture to wire whale-confidence into signal generation is medium. Total: 4-8 weeks plus data costs.

### 3. Pattern modulator
**Spec:** LLM-backed pattern modulation. Spec says this is the smallest piece but the only one currently implemented.

**Current state:** VERIFIED. TRAIDecisionModule.js exists (with pending Fix 18 and Fix 19 affecting feature vector and positionSize). TRAIPatternIntegration.js exists. Pattern memory query → LLM evaluation → confidence boost/penalty pipeline is real. Aligned with spec's own admission.

**Gap:** Pending fixes (18, 19) need to land for the modulator to operate on honest features instead of fabricated ones.

### 4. Trade analyst and pattern sculptor
**Spec:** TRAI reviews every closed trade, identifies winner/loser patterns, proposes refinements. Continuous improvement loop.

**Current state:** Pattern recording exists (PatternMemoryBank, TRAIDecisionModule.recordPatternResult). The "review and propose refinements" loop does NOT exist in code. No spec proposal generator, no automated refinement pipeline. **MISSING.**

**Effort:** Medium. Pattern memory has the data; LLM can read it; output proposals via Mercury. 2-3 weeks.

### 5. Customer service and technical support
**Spec:** TRAI handles inbound questions, knows source code + state + history + customer context.

**Current state:** Project memory mentions Mover has a `mover-tech-support.js` (in TRAI v1/Mover stack). NOT integrated with OGZPrime live deployment. **MISSING in OGZPrime production; partial in Mover.**

**Effort:** Medium. Mover has the foundation, integration into ogzprime.com is medium scope. 3-4 weeks.

### 6. Boomer onboarding assistant
**Spec:** Walks non-technical users through broker API key setup, broker-by-broker.

**Current state:** Does not exist in code. **MISSING.**

**Effort:** Medium. Content-heavy (one walkthrough per broker × 10 brokers). 2-3 weeks if videos already exist; longer if creating from scratch.

### 7. Content generation
**Spec:** ElevenLabs voice + D-ID face. Long-tail SEO ("How to get [broker] API key" videos). Performance reports. Daily/weekly TikTok/YouTube/Instagram shorts. Zero human input.

**Current state:** From operator's audit tonight — `mover-content-creator.js` exists with template engine. ElevenLabs/D-ID integrations NOT confirmed. VoiceManager.js and VoiceFXSystem.js exist for personality voice (different use case). **MISSING for content-generation specifically.**

**Effort:** Large. Templates + voice + face + publishing pipeline + SEO is a real product on its own. 4-8 weeks.

### 8. Dashboard widget and website chat
**Spec:** TRAI is the chatbot on ogzprime.com. Same persona/knowledge/continuity across traders/prospects/support.

**Current state:** Dashboard exists. Chatbot widget does NOT exist in code I read. **MISSING.**

**Effort:** Medium. Integration with Mercury, persona constraints, knowledge retrieval. 2-3 weeks.

### 9. Operations manager
**Spec:** Ranks events by priority (trade outcomes, errors, news, customer messages, anomalies). Pings Trey only when something needs human attention. Rest runs autonomously.

**Current state:** Discord integration exists (mover-discord-integration.js per operator's audit). Priority routing does NOT exist as a structured system. Some console logging is severity-tagged but no escalation policy. **MISSING.**

**Effort:** Medium. Event taxonomy + priority rules + routing (Discord/SMS/email). 2-3 weeks.

**TRAI summary:** 1 of 9 responsibilities implemented (pattern modulator, the smallest piece per spec). 8 of 9 missing or only present in the Mover/TRAI v1 stack that isn't wired into OGZPrime production.

---

## Phase Roadmap Status

**Phase 1 — Apex extraction:** UNSTARTED. Bot has not run an Apex eval.

**Phase 2 — Crypto arbitrage:** SPEC DEFERRED in ogz-meta. No engine code.

**Phase 3 — Options:** TastyworksAdapter half-built. Not wired.

**Phase 4 — Public release:** Phase 4 licensing stack exists (LicenseManager, PaymentProcessor, Stripe pipeline, obfuscation chain, legal docs) per operator's audit tonight. Not deployed. Not selling.

**Phase 5 — Sell or scale:** Future state.

---

## Summary Table

| Spec Item | Status | Gap Size | Effort to Close |
|---|---|---|---|
| 10 broker adapters | STRUCTURAL: PRESENT | FUNCTIONAL audit not done | 2-3h per adapter to verify; unknown to fix |
| Strategy orchestration | MOSTLY ALIGNED | RSI location unclear; OGZTPO unwired; no `_validated` fingerprints; confluence ceiling drift | 1-2 days each |
| USD-throughout sizing | HOLDS | None | None |
| Exit contract locking | PARTIAL | No fingerprint mechanism | 1-2 days |
| Account isolation | LOOKS ALIGNED | Verification incomplete | 1 hour |
| Multi-broker simultaneous | UNBUILT | Architectural | Medium (process-fleet) |
| Multi-direction | EXISTS, unvalidated | Shorts not honest-tested | Small (run backtest) |
| Multi-position | FOUNDATIONS PRESENT | Not verified clean | 1-2h to test |
| Multi-timeframe parallel scanning (8-10 tickers) | UNBUILT | Main loop rewrite | 2-4 weeks |
| Crypto/stocks autonomous switching | 2/15 handoffs | Deferred per operator | Few weeks total when needed |
| Arbitrage engine | SPEC DEFERRED, NO CODE | Complete | 2-4 weeks |
| TRAI #1 News crawler | UNBUILT | Complete | 3-6 weeks |
| TRAI #2 Whale watcher | MISSING in OGZPrime; partial in Mover | Complete | 4-8 weeks + data costs |
| TRAI #3 Pattern modulator | EXISTS | Pending fixes 18,19 | 1-2 days for fixes |
| TRAI #4 Trade analyst loop | UNBUILT | Complete | 2-3 weeks |
| TRAI #5 Customer service | Partial in Mover | Integration | 3-4 weeks |
| TRAI #6 Boomer onboarding | UNBUILT | Complete | 2-3 weeks |
| TRAI #7 Content generation | Partial templates only | Voice/face/pipeline missing | 4-8 weeks |
| TRAI #8 Dashboard chat | UNBUILT | Complete | 2-3 weeks |
| TRAI #9 Operations manager | UNBUILT | Complete | 2-3 weeks |
| Phase 1 Apex extraction | UNSTARTED | First eval not run | Tune + run + pass |
| Phase 2 Crypto arbitrage | DEFERRED | No engine | 2-4 weeks |
| Phase 3 Options | Adapter half-built | Unknown completion | 2-3 weeks |
| Phase 4 Licensing | Built but not deployed | Sales channel | Variable |

---

## What this audit means for the eval timer

The critical path to Phase 1 (Apex extraction → Houston) does NOT require closing most of the gaps in this document. What it actually requires:

1. **Trading engine works honestly** — substantially DONE post-Fix-2. A few execution-touching fixes (8, 22, 23) remain that could affect eval performance.
2. **One strategy clears Apex's bar** — UNKNOWN until strategies are re-validated on post-Fix-2 honest math.
3. **Account isolation works** — LOOKS ALIGNED, needs final verification but no obvious blockers.
4. **Kill switch works** — KillSwitch.js exists, verify it actually halts.

Everything else (multi-broker simultaneous, multi-TF parallel scanning, TRAI buildout, arbitrage, content generation, licensing, etc.) is post-Apex work per operator's own phase roadmap. They are NOT blockers for the eval.

The audit fix backlog gets the bot honest. Strategy re-validation surfaces whether any strategy clears Apex. If yes → run eval → extract → move. If no → tune or pivot, but at least the work is bounded.

---

## Honest disclosures

**WHAT I VERIFIED (this audit):**
- All 10 specced broker adapters exist as filled-in skeletons (zero unimplemented throws)
- 7 of 9 strategy files exist in /modules/; RSI and OGZTPO not found as modules
- USD-throughout invariant holds in OrderExecutor
- exitContract concept exists but no `_validated` fingerprint mechanism
- activeTrades Map and per-trade MPM foundations exist
- SessionRouter exists with partial handoffs
- TRAIDecisionModule + TRAIPatternIntegration + TRAIWebContext + trai_core exist
- Arbitrage spec deferred at ogz-meta/specs/, no engine code
- KillSwitch.js exists

**WHAT I ASSUMED:**
- That GRAND-SCHEME.md from 2026-04-07 is current operator intent (operator confirmed this conversation)
- That adapter "filled in" ≠ "verified working against live broker" — the functional audit was not in scope
- That project memory's claim of "TastyworksAdapter half-built" matches current state — did not deep-audit

**WHAT I DID NOT DO:**
- Verify any adapter against its broker's actual REST/WebSocket API docs
- Trace RSI strategy location (might be inline somewhere, or might be genuinely absent)
- Test multi-position cleanliness with a real run
- Audit TastyworksAdapter for actual completion state
- Read TRAIWebContext, TRAIPatternIntegration in depth
- Read every TRAI v1 / Mover file from operator's parallel audit (separate stream, separate scope)

This audit is a structural reality check. It is not a build plan. Operator decides what to act on based on Apex timer and capital constraints.
