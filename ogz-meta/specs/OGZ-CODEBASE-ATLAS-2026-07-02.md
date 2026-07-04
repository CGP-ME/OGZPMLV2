# OGZ CODEBASE ATLAS — Full Documentation Survey
**Compiled:** 2026-07-02 late session · **Method:** 3 parallel read-agents consumed ogz-meta root (30 docs), ogz-meta/specs (26 docs), ogz-meta/ledger root (113 files)
**Companion to:** TREY-ARCHITECTURE-SPEC-2026-07-02.md (the constitution). This is the map; that is the law.
**Status:** SEED — CC's Component Atlas lane verifies against VPS-side code and refines.

---

## 1. THE DOCTRINE LAYER (ogz-meta root) — what the system is SUPPOSED to be

- **GRAND-SCHEME.md (CURRENT-LAW):** 3-layer platform — (1) multi-broker/multi-asset/multi-direction engine, (2) cross-broker arbitrage, (3) TRAI 9-function brain. Monetization phases: eval extraction → crypto arb → options → white-glove licensing (NOT subscriptions) → sell-or-royalties. Invariants: USD sizing throughout, locked per-strategy exit contracts w/ _validated fingerprints, backtest==live code, per-account isolation.
- **OGZPrime-Master-Engineering-Spec.md:** the 8 root-cause bugs of March (RSI c.c, nested DTO, parallel-universe backtest, phantom shorts, fee chaos ×6 files, MADynamicSR trend filter, LiquiditySweep timeframe, 10-gate stacking) + 5-phase cure (Zod DTOs, deterministic tests, AST remediation, pipeline toggles, waterfall regression).
- **PID-CONTROLLER.md + PIDvsMATRIX+PHASE2.md:** 3 nested feedback loops (position sizing 0.3-2.0x, per-strategy regime boost 0.5-1.5x, ATR trailing-stop 1.0-3.5x), every-N-trades, 50-trade warmup, clamped. Doctrine: Tournament (offline) locks the config envelope → PID adapts live WITHIN envelope → drift escalates to TRAI. Interpretation 2 (self-triggering mini-tournaments) is post-funding.
- **Strategy&Tuning.md:** data-source doctrine — TradingView (RTH-only) vs Polygon (consolidated) differ $6-26 on VP levels; strategies are locked to their training data source; Pine transpiler validated to 5.5% variance.
- **AGENTS.md / 04_guardrails / 05_landmines / claudito_context:** the operating law (already known).
- **Orchestration model (BACKTEST-PIPELINE-AUDIT):** winner-takes-all — all strategies evaluate per candle, highest confidence wins; confluence scales size (spec ceiling 2.5x; a code comment claims 3x — unresolved). Sizing stack: 5% base × conf(0.5-2.5x) × confluence(1-2.5x).

## 2. THE SPECS LAYER — standing law vs unexecuted proposals

**STANDING LAW (enforced or applied):** baseline-phase0 anchor gate · config-consolidation-migration-gates · pattern-bank-separation Phase 1 (applied 4/22) · OPERATOR-DESIGN-GAPS (permanent debt record) · repository-architecture (Mercury index rules) · serena-mercury-integration (live) · eval-go-no-go-checklist.

**SPEC'D BUT ZERO CODE (the big two):**
- **resilience-and-supervision.md** — the complete watchdog architecture: ResilientWebSocket layer + Supervisor state machine (HEALTHY→DEGRADED→UNHEALTHY→DEAD) with graduated response, getHealth() contract on every subsystem, PM2 + external deadman switch (SMS on heartbeat loss). **This is the runtime watchdog demanded after the 7/02 exit incident — it was fully specified, 11 phases, and never built.**
- **MULTI-RUNTIME-IMPLEMENTATION-SPEC** — 7-phase expansion to multi-symbol/TF/direction/broker. Scope-envelope work since (scopeKey v2) partially delivers Phase 1.

**⚠ PROPHECY DOC — PLATFORM-VISION-VERIFIED-FINDINGS-2026-05-19:** ten named, verified code bugs including **A6 KillSwitch unwired, A7 shutdown-exits-cleanly-but-leaves-positions-open, A4 reconciler Kraken-only, A3 trade_updates stream unused, A1 client_order_id not plumbed.** The 2026-07-02 live incident (couldn't shut down flat, stranded shorts, journal/broker desync) was the detonation of bugs this doc named six weeks earlier. Fix list existed; was never executed as a lane. **Monday priority: re-audit A1-A10 line by line against current code — several may still be live.**

**eval-go-no-go-checklist-2026-05-23:** 8 gates; only 3 of 11 items had landed (runtime posture guard, 5% volume rule, 15:50 cutoff) when the eval went live. "State & Broker Truth" gate — the one that would have caught the desync — was RED.

**config-consolidation-migration-gates-2026-06-08 — DEFINITIVE ANSWER to "did the config migration ever happen":** NO — the spec's own "Current Open Work That Blocks Completion" section is still active. ConfigLoader and TradingConfig both still read env independently. The 2-day effort produced the gate framework and partial slices, not completion. This is CC's armed ConfigLoader mission.

**Decision ledger:** L1/L2/L4/L6/L7/L8 shipped; **L3 (confidence modifiers), L5 (risk gates), L9 (lessons) never wired.** (M-A's fee_edge gate row began filling L5 on 7/01.)

**OPERATOR-DESIGN-GAPS (the 6, mapped to the new constitution):** SessionRouter 13/15 handoffs deferred · multi-directional spec awaited (→ archive has MultiDirectionalTrader built) · sealed per-trade environments partial ("one piece questionable") · multi-TF parallel scan unbuilt (→ P8) · cross-TF confirmation unbuilt (→ P4) · unknown "questionable" multi-TF piece unidentified.

**Anchor genealogy (for the record):** baseline-phase0 doc says $10,000.27/1,410tr (06-04 revision) · AGENTS.md says 10,687 · BACKTEST-OPS says 10,710 · executable gate enforced 10,663 until fee-parity → **8,338 (ttp_real, current)**. Historical: $18,497→$13,213 was the Fix-2 dual-write correction (May). Multiple stale anchor claims in docs — all non-executable references need the Document Accuracy sweep.

## 3. THE LEDGER LAYER (archive) — what exists that production never got

- **Entry/exit doctrine (entryexit.md):** two worlds — **World B (current): shared exit pipeline** (generic tiers/stops applied to all strategies) vs **World A (the goal): per-strategy self-contained entries+exits.** The constitution's P1/P2 is World A. The doctrine fight is that old.
- **1R ceiling root cause (named in ledger analysis):** TakeProfit priority > TrailingStop in the shared exit path — winners get capped at target instead of trailing. Same disease the 7/02 tail data showed ($12 designed vs $129 abandoned).
- **Wire-in-ready archive modules (REAL, judged by method inventory):** DynamicPositionSizer.js · ConfigLoader.js (ledger copy) · persistent_llm_client.js · AdaptiveTimeframeSelector.js · SmartMoneySweep.js. Integration stubs: 01-orchestrator-registration.js, 02-tradingconfig-sms.js.
- **From the May-13 inventory transcript (separate archive/mover.zip, cross-referenced):** TRAI 8-of-9 built (Mover stack: news+sentiment, whale tracker, support, content, chat server, ops) · MultiDirectionalTrader (1,200 lines) · AdaptiveRiskManagementSystem (10 regime multipliers, ATR stops, Kelly, circuit breakers) · CorrelationAnalyzer · PerformanceAnalyzer (edge-decay + entry/exit quality scoring = behavioral forensics engine) · payments/licensing/obfuscation/mobile/docker stack.
- **PHASES-4-14-EXTRACTION-ROADMAP:** ~40% complete; modular design clear, execution incomplete.
- **Work-queue specs (CC-SPEC-*/CODEX-*/INSTRUCTIONS-PHASE-10/11/12):** exit-checker extraction, break-even manager, exit decider, Alpaca timeframe ingestion, symbol-scoped aggregation — several delivered by later lanes, others open; need dedup against current state.

## 4. CROSS-CONNECTIONS TO CURRENT WORK (2026-07-02)

| Tonight's item | Prior art in the docs |
|---|---|
| TREY SPEC P2 (strategy-owned exits) | entryexit.md World A doctrine; GRAND-SCHEME locked-contract invariant; _validated fingerprints spec'd, never implemented |
| Runtime watchdog demand | resilience-and-supervision.md — complete spec, zero code |
| Exit-rail incident | PLATFORM-VISION A6/A7/A4/A3 — named 5/19, never fixed |
| Regime gating + ATR stops (TREY SPEC 2-3) | AdaptiveRiskManagementSystem (archive, built) + PID Loop 3 spec |
| Tier-truncation of winners | 1R ceiling: TP-beats-trailing priority, documented in ledger |
| Weekend sweep → tuned envelope → live | PIDvsMATRIX doctrine: Tournament locks envelope, PID adapts within it |
| Config "one file" question | Migration officially incomplete per its own gate doc |
| Broker-truth reconciliation audit | eval checklist "State & Broker Truth" gate — was RED at eval start |
| Behavioral forensics dossiers | PerformanceAnalyzer (archive) already scores entry/exit quality |

## 5. CONTRADICTIONS REQUIRING RULINGS (queue for Trey, non-urgent)
1. Confluence ceiling: 2.5x (spec) vs 3x (code comment) — resolve by code trace, fix whichever is wrong.
2. Pattern memory namespacing: DEC-002 said global ("a setup is a setup"); current runtime is scope-keyed per symbol/TF (P7). Evolution happened — retire DEC-002 formally.
3. L5 risk gates: MASTER-ROLLOUT checkbox says shipped; doc-alignment proved not wired (M-A began fixing). Correct the rollout doc.
4. Anchor references: 4 different numbers across docs vs 1 executable truth. Sweep all non-executable anchor mentions.
5. RSI + OGZTPO strategies: specced in the 9-roster; module locations unclear/unwired per audit. Find or formally retire.
