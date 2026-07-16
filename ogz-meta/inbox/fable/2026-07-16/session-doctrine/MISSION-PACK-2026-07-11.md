# MISSION-PACK-2026-07-11 — PASTE-READY LANES 1-7
Companion to WIRING-MANIFEST-2026-07-11.md. Each block below is a complete,
self-contained mission: paste to the named executor verbatim. Order per
manifest. Laws apply to every lane: one lane one commit; diff to Trey before
commit; P0 via ogz-meta/gates/multi-runtime-gate-runner.js --p0 expected
8338.146639366509 exact unless the lane says otherwise; behavior tests only
(a test that cannot fail when the BOT is wrong is not written); tool claims
carry telemetry or are unclaimed; no new gates; no unrequested anything;
fourth shape (fix producers, no throws in trading loop); CHANGELOG entry for
the lane only.

=====================================================================
## LANE 1 → CODEX (small): TAKEPROFITCHECKER — VERIFY-OR-WIRE
=====================================================================
CODEX MISSION: TakeProfitChecker verify-or-wire. One lane, one commit.
CLAIM (July-01 strategy-edge audit): core/exit/TakeProfitChecker.js is
instantiated but never invoked in the exit path — TP exits may be dead.
DO:
1. Serena method-callers on TakeProfitChecker.check (one symbol per call,
   telemetry attached). Also grep-lead: ExitDecider orchestration order.
2. IF CALLED: report the call chain file:line, add one behavior test
   proving a TP-hit exits via this checker, mark manifest Lane 1 VERIFIED,
   done — no code change.
3. IF NOT CALLED: wire into ExitDecider's checker sequence per prior art
   ogz-meta/ledger/INSTRUCTIONS-PHASE-10-EXIT-CHECKERS.md (April refactor
   order: StopLoss -> BreakEven -> Trailing -> TakeProfit -> MaxHold —
   confirm intended order from that doc, do not invent).
VERIFY: red test — fixture trade crossing its TP exits via
TakeProfitChecker on new code, FAILS on parent commit. Focused exit
suites green. P0: if TP exits were genuinely dead, P0 MAY MOVE — report
the delta with the trace, do NOT auto-rebaseline, Trey rules the new
anchor. If P0 holds exact, state plainly whether P0's path exercises TP
exits at all (dataset check), per the P0-blindness lesson.

=====================================================================
## LANE 2 → DC (small): TRACE-07 — CLOSE-PATH SKELETON PRODUCER
=====================================================================
DC MISSION: TRACE-07 fix. Your own census finding (93 hits, current path).
Close-path decision-ledger records arrive missing candleTimestamp/symbol;
schema correctly rejects them to malformed files (June 28 + July 7 entries).
DO:
1. Read StateManager close path (~L2703-2759 at census time — re-locate at
   HEAD). Identify every close ROUTE that builds the ledger record
   (manual close, TTL close, reconciliation close, exit-intent release).
2. Fourth shape: fix the PRODUCER — every close route carries full context
   (candleTimestamp, symbol, venue identity if present on the trade).
   No guard added, no schema loosened, no throw.
3. VERIFY: focused test per close route asserting the record carries
   candleTimestamp+symbol; run your census extractor once more scoped to
   CLOSE_NULL_META — malformed count must stop growing (delta zero on new
   records). P0 exact. Diff to Trey before commit.

=====================================================================
## LANE 3 → CODEX (medium): DPS — THE FOUR-MONTH WIRE
=====================================================================
CODEX MISSION: DynamicPositionSizer wiring per the March 20 spec. One lane.
SPEC (binding prior art): ogz-meta/ledger/DYNAMIC-POSITION-SIZER-WIRING.md.
CONFESSION AT HEAD: run-empire-v2.js:1060 "DynamicPositionSizer NOT WIRED -
needs tuning. Using inline confidence multiplier."
STATE: module clean (DPS-ARCH-01 landed: null inputs -> {sizeUSD:0,
blocked:true}); ENABLE_DPS gate exists (CRIT-12, run-empire:269-281).
DO:
1. Wire DPS into OrderExecutor's sizing path exactly where the March spec
   says. The inline confidence multiplier DIES IN THE SAME COMMIT — no
   dual sizing path, no fallback to inline when DPS returns blocked
   (blocked means NO TRADE, per fourth shape — refusing producer, not
   fallback consumer).
2. DPS reads RESOLVED config only (no raw env). ENABLE_DPS becomes a
   launchProfile key: explicit in every profile, NO default —
   backtest-p0: false (anchor protected). production/paper: Trey rules
   at diff review — propose false until sweeps tune it.
3. Serena callers on the inline multiplier site before deletion — every
   consumer of the old path identified, listed.
VERIFY: red test — DPS-on fixture produces different sizing than parent's
inline output; DPS blocked-input fixture refuses the trade (no order sent).
AST: zero raw env reads for DPS keys. P0 exact (DPS off in backtest-p0).
Focused sizing suites green. Diff to Trey.

=====================================================================
## LANE 4 → CODEX (medium): PID OUTPUT WIRING — CLOSE THE LOOP
=====================================================================
CODEX MISSION: PID controller output wiring. One lane.
STATE: inputs live (OrderExecutor:4038/:4598 feed onTradeClose). Question:
do outputs steer ANYTHING? Spec: ogz-meta/ledger/PID-CONTROLLER.md (May) —
targets: sizing multiplier, regime boost multiplier, trailing stop ATR mult.
DO:
1. Serena callers on PIDController output getters. IF consumed: report the
   chain, add behavior test, mark VERIFIED, done.
2. IF NOT CONSUMED (expected): wire outputs to the three May-spec targets
   as BOUNDED ADVISORY adjustments: hard min/max clamps from the spec,
   every adjustment logged to the decision ledger with pid contribution
   visible, gated by launchProfile key pidControl.enabled — EXPLICIT per
   profile, false EVERYWHERE including production until Trey arms it.
   No default.
VERIFY: red test with flag on (adjustment visibly applied + clamped +
ledger-stamped); flag-off path byte-identical to parent behavior; P0 exact
(false in backtest-p0). Diff to Trey.

=====================================================================
## LANE 5 → CODEX (small): TRAIL_* ENV CHAINS DIE (EXIT-HIGH-02)
=====================================================================
CODEX MISSION: DynamicTrailingStop config ownership. One lane.
FINDING (May-6 audit EXIT-HIGH-02, confirmed at HEAD): DynamicTrailingStop.js
:41-50 — TRAIL_ATR_MULTIPLIER / TRAIL_MIN_ACTIVATION / TRAIL_TREND_WIDEN
(and siblings in the block) read parseFloat(process.env)||config||hardcoded.
Last live fallback chain in the exit path; invisible to profiles/fingerprint.
DO: params move to launchProfile exits keys, explicit per profile, NO
defaults; the values written are the CURRENT EFFECTIVE values verbatim
(behavior frozen, ownership moved). Env reads die. Resolver refuses absent.
VERIFY: AST zero env reads in the file; startup fingerprint prints resolved
trail params; P0 exact (values identical by construction). Red test: a
profile missing the exits block refuses boot naming the key. Diff to Trey.

=====================================================================
## LANE 6a → CODEX (medium): PER-STRATEGY EXIT CONTRACTS — WIRE STEP
=====================================================================
CODEX MISSION: per-strategy exit-contract population, ownership step only.
CONTEXT (TREY-ARCHITECTURE-SPEC P2, the $12-vs-$129 wound): plumbing
PROVEN (exitContracts.<strategy>.* precedence — commit 792f4803);
strategies emit stopLoss:null/takeProfit:null and fall to the generic
platform ladder. This lane moves OWNERSHIP, not geometry.
DO: populate exitContracts.<strategyName>.* blocks for ALL 16 strategies
in the one config file with the CURRENT EFFECTIVE generic values each
strategy resolves today (trace each strategy's actual resolved exit params
at HEAD and write those numbers verbatim). Precedence already prefers
per-strategy blocks — after this lane, every strategy reads its OWN block.
NO behavior change by construction.
VERIFY: per-strategy resolution test (each strategy resolves its named
block, not the generic); P0 exact. Diff to Trey.
NOTE: Lane 6b (real per-strategy geometry — trend runners vs mean-reversion
targets) comes AFTER the April-panel exits sweeps produce numbers; 6b's
P0 will legitimately move and Trey rules the new anchor. Do not attempt 6b.

=====================================================================
## LANE 7 → CODEX (large): CONTEXTPARAMS — MTF INTO EXECUTION
=====================================================================
CODEX MISSION: contextParams table + pure selector, per ratified spec
ogz-meta (or /mnt outputs) TREY-CONTEXT-PARAMS-SPEC-2026-07-10.md. Binding.
DO:
1. contextParams section in config/trading.config.json keyed
   "assetClass:timeframe" — first block "stocks:15m" carrying CURRENT
   effective values verbatim (confidence floor, exits, ATR mults,
   maxHold). Flat, complete, no inheritance.
2. Pure selector: params(assetClass, timeframe) -> frozen block. Computed
   fresh at decision time. NO caching, NO current-context variable, NO
   setter. Missing key -> trade refused with key named (never neighbor
   fallback).
3. Every decision-ledger row stamps contextKey.
4. P4 rider (TREY-ARCHITECTURE-SPEC): MA-pair allocation by timeframe —
   fast pair (9/20) on trading TF times entries; slow pair (50/200) on
   1h+ enters as MTF BIAS only, never entry votes. Implement per spec's
   P4 ruling; booster contribution audit (does confluence booster ever
   change a decision at HEAD? distribution over eval ledger + backtest
   window) reported as evidence, zombie fields fixed-or-removed per Trey
   ruling at diff review.
VERIFY: refusal red test (unlisted context refuses, fails on parent);
ledger rows carry contextKey; AST: no timeframe-conditional param reads
outside the selector; P0 exact (stocks:15m block = current values).
Diff to Trey.

=====================================================================
## STANDING CONTEXT FOR ANY EXECUTOR (paste if agent seems lost):
Read ogz-meta/inbox/fable/WIRING-MANIFEST-2026-07-11.md and
ogz-meta/Alignment/README.md; run the cold-start bootstrap; the manifest's
closing paragraph is the 14-month timeline. Constitution:
ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md. Router bible:
ogz-meta/codex-design/*SESSIONROUTER*2026-05-20*. Trey is the architect;
his rulings supersede; receipts or it didn't happen.
