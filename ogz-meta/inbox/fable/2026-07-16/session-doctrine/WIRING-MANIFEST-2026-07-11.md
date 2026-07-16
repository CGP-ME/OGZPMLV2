# WIRING-MANIFEST-2026-07-11 — CONNECT EVERYTHING
Operator: Trey. Compiled by: Fable (full-archive timeline holder as of this date).
LAW: the WIRE is the deliverable. A lane is done when behavior changes and a red
test proves it — never when code exists. "Exists but unconnected" = NOT DONE.
DISCIPLINE: one lane, one commit, P0 after every lane (8338.146639366509 exact
unless the lane's spec says the anchor legitimately moves — then delta reported,
Trey rules). Diff to Trey before commit. No new gates, no unrequested anything.

## FIRING ORDER (Trey's rulings: small-to-large inside his 4-item testability list)

### LANE 0 — IN FLIGHT: SESSION ROUTER ALWAYS-ON (Codex, active)
Wire: router becomes THE routing layer; static mode per profile; operator-commanded
transitions run June TransitionStore machinery; env gate + router-off codepath DIE.
Riders: TRAI local pattern-key scoping (TRAIDecisionModule:78/:968) + TTP venue
scope (EvalRuleEngine:158) + TRAI fabrication-mirror check (fix-queue L741) same file.
Proof: static-equivalence red test (fails on parent), P0 exact, caller graphs
(Serena, one symbol per call, telemetry attached), COMPLIANCE TABLE against
ogz-meta/codex-design/02-*SESSIONROUTER-FINAL-SIGNOFF-2026-05-20.md +
SAGA-INVARIANTS (epoch fencing / idempotent intents / crash-resume journal —
static-dormant items marked DORMANT-UNTIL-SCHEDULED, not missing).
Status: Phase 0.5 accepted; inventory regenerating against Phase 1 diff; gaps 1-4 ruled.

### LANE 1 — TAKEPROFITCHECKER: VERIFY-OR-WIRE (small)
Claim (July audit): instantiated, never called. Wire point: the exit-checker chain
(ExitDecider orchestration). DO: Serena callers on TakeProfitChecker.check* — if
truly uncalled, wire into ExitDecider sequence per the Phase-10 instructions doc
(ogz-meta/ledger/INSTRUCTIONS-PHASE-10-EXIT-CHECKERS.md is prior art). Proof:
red test — a trade hitting TP exits via TakeProfitChecker on new code, does not
on parent. P0: may legitimately move if TP exits were dead — report delta.

### LANE 2 — TRACE-07: CLOSE-PATH SKELETON PRODUCER (small)
DC census finding, 93 hits, current: close records missing candleTimestamp/symbol
→ schema rejects to malformed. Producer: StateManager close path (~L2703-2759).
Fourth shape: fix the producer to carry full context; no guard added. Proof:
focused test — close record from every close route carries candleTimestamp+symbol;
malformed count stops growing (DC re-census after).

### LANE 3 — DPS: THE 4-MONTH WIRE (medium)
Spec: ogz-meta/ledger/DYNAMIC-POSITION-SIZER-WIRING.md (2026-03-20). Confession:
run-empire-v2.js:1060 "DynamicPositionSizer NOT WIRED - Using inline confidence
multiplier." Module is clean (DPS-ARCH-01 nulls+blocked landed); ENABLE_DPS gate
exists (CRIT-12). DO: wire per the March spec into OrderExecutor sizing path;
inline multiplier dies the same commit (no dual path). DPS reads resolved config
only. backtest-p0 profile: ENABLE_DPS explicitly false → P0 exact. Proof: red
test — with DPS on, sizing differs from inline output on a known fixture; with
missing inputs, {sizeUSD:0, blocked:true} refuses (test exists per DPS-ARCH-01).

### LANE 4 — PID OUTPUT WIRING: CLOSE THE LOOP (medium)
Inputs live (OrderExecutor:4038/:4598 onTradeClose). Question: do outputs steer
anything? DO: Serena callers on PIDController getters/outputs. If consumed nowhere:
wire outputs to the three targets in PID-CONTROLLER.md (sizing multiplier, regime
boost, trailing ATR multiplier) as ADVISORY-CAPPED adjustments (bounded, logged,
per-profile enable flag, default false everywhere including production until Trey
arms it). Proof: red test with flag on; P0 exact (flag off in backtest-p0).

### LANE 5 — EXIT-HIGH-02: TRAIL_* ENV CHAINS DIE (small, rides exits work)
DynamicTrailingStop.js:41-50 parseFloat(env)||config||hardcoded. DO: params move
to profile ownership (exits family keys), env reads die, no defaults — explicit
per profile (values = current effective values, verbatim, so behavior is frozen).
Proof: AST zero env reads in file; P0 exact (values identical, source moved).

### LANE 6 — PER-STRATEGY EXIT CONTRACTS: THE $12-vs-$129 WOUND (medium-large)
P2 of TREY-ARCHITECTURE-SPEC: strategies emit stopLoss:null/takeProfit:null and
defer to the generic platform ladder that scalps everyone identically. Plumbing
PROVEN (exitContracts.<strategy>.* — commit 792f4803). DO in two steps:
6a (wire, now): populate exitContracts.<strategy>.* for all 16 with CURRENT
    EFFECTIVE values (behavior frozen, ownership moved). Proof: P0 exact.
6b (values, after sweeps): per-strategy geometry from the April-panel sweeps —
    trend strategies get ATR-trail runners, mean-reversion gets targets, per
    Trey's P2 ruling. Proof: per-strategy red tests + sweep evidence. P0 moves
    legitimately here — new anchor ruled by Trey.

### LANE 7 — MTF INTO EXECUTION: CONTEXTPARAMS (large — item 1 of the 4)
Spec: TREY-CONTEXT-PARAMS-SPEC-2026-07-10 (ratified). contextParams table in the
one config file keyed assetClass:timeframe, pure selector at decision time,
missing key = refuse named, provenance stamped on ledger rows. Plus P4 ruling:
MA pairs allocated by timeframe (fast 9/20 on trading TF times entries; 50/200
on 1h+ via MTF as bias only — never entry votes). Plus P4 truth audit: booster
contribution distribution across eval's 68 live trades + backtest window — if it
never changes a decision, fix or remove, no zombie fields.
Proof: refusal red test, ledger contextKey stamps, P0 exact (stocks:15m block
carries current values verbatim).

### LANE 8 — EMASMA RESTORATION (large — needs Trey walk first)
P1: gutted 2026-era; signal decay/snapback/blowoff commented out with an IOU the
orchestrator never honored (zero references). DO NOT wire blind: this lane STARTS
with the Trey line-by-line walk (intent declared), then restoration per TREY SPEC
001 item 1. Then the same gutting audit across the remaining roster.

### PARKED-WITH-NAMES (not wires, decisions/investigations):
- **LANE CTX-DATA — CONTEXT-DATA EDGE LAYER (Trey-ordered 2026-07-13,
  post-walks/post-fee-sweeps). Per-venue, per-timeframe context feeds,
  homed in contextParams + router venue identity (both landed/queued):
  CRYPTO (free, highest signal): order-book depth/imbalance via exchange
  websockets (Kraken/Binance publish full depth — real short-horizon
  signal, unlike equities), perp funding rates + open interest (crowding/
  squeeze context), liquidation levels/cascades (upgrades LiquiditySweep/
  SMS from inference to observation), stablecoin/exchange flows (regime).
  STOCKS (free tier first): VWAP + anchored VWAP (the institutional
  intraday reference — highest edge-per-dollar equities add), RVOL
  (participation filter), index internals SPY/QQQ trend + VIX as bias
  gate, L1 quote imbalance. Paid depth feeds (TotalView-class) DEFERRED
  until funded account pays for its own data. Options flow: Tier-3,
  revisit funded. Earnings/event calendar as VETO blackout table (cheap,
  NoWick source rule-5 pattern).
  ARCHITECTURE LAW: all features enter as confidence-context multipliers
  per Trey's confidence-as-filter doctrine — no binary gates; keyed
  assetClass:timeframe in contextParams; venue identity from router.
  SEQUENCE: blocked behind walks + raw-edge proof + fee-real sweeps —
  context multiplied onto unverified strategies multiplies noise.**
- **LANE DC-0 — ARTIFACT PLACEMENT ARCHITECTURE (OWED SINCE DC's
  INTRODUCTION — this was Trey's original request when DC entered the
  workflow, never executed, repeatedly displaced by tactical work).
  The absence of it caused: Mercury index poisoning (untracked
  .mercuryignore, proposals in evidence pool), the ENOBUFS bridge
  failure (untracked cognition pile), unauditable run ledgers, invisible
  evidence files. Mission: read-only inventory of every runtime write
  target (logs, backtest-results, worker-reports, cognition-history,
  mercury-runs, ledger, inbox, proposals) — size/tracked/indexed — plus
  the LIVE .mercuryignore contents; deliver placement table; Trey rules
  the should-be column; second pass executes (mercuryignore committed,
  gitignore for runtime noise, index-eligibility list version-controlled).
  PRIORITY: rides with/before the Mercury integrity lane — the index
  diet and the index freshness are the same repair.**
- Shorts: production/paper long_only is now an EXPLICIT profile choice; one-word
  flip when Trey rules + TTP permits.
- ALPACA-HIGH-01 (account stream not wired) + MOD-HIGH-02 (LiquiditySweep ATR
  filter bypass) + KILL-5 (SELL-no-BUY reset) + KILL-1/3: strategy-walk era.
- Proof-vs-TTP win-rate reconciliation: blocks proof pages joining SEO.
- tools/trade-validator.js:267 buy-only: trivial; fix or archive the tool.
- Scheduled router movement: 6 documented blockers (fees venue-owned, per-venue
  capital, hydration scope, backfill semantics, intent-zero proof, dashboard) —
  gate the SCHEDULE, not the always-on wire.
- Slices 4-8 config families: frozen by operator order; slice-8 env hard-fail
  lands when Trey unfreezes.

## THE TIMELINE THIS MANIFEST PRESERVES (one paragraph, for any future agent):
Bot = 14 months, multiple rebuilds; capability on disk ≠ capability in use.
Archive reconciliation (2026-07-11, 957 docs) verified: critical fallback purge
LANDED (16/17 CRITs, in-code tags), mission pipeline was 10 promises re-proposed
389x, Grand Scheme's broker fleet EXISTS (11 adapters, skeleton-or-better), TRAI
is 1-of-9 built (honestly labeled). The disease is the WIRE: DPS, router, MTF,
per-strategy exits, TakeProfit — built-ish, connected to nothing. Operator built
the entire enforcement stack (hooks, AGENTS.md, ground rules, Mercury+Fable
tiers, multi-model audits, replay-the-breaker QA); the workers were the leak.
Constitution: ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md (P1-P7, graded).
Router bible: ogz-meta/codex-design/*SESSIONROUTER*2026-05-20*. Current gate:
EXPECTED_P0 in ogz-meta/gates/multi-runtime-gate-runner.js:18. After lanes 0-7 +
walks: raw-edge vs fee-survival testing on the REAL machine, then eval, then money.
