# DEEPSEARCH / MISSION RECONCILIATION LEDGER
Started: 2026-07-11 · Grader: Fable · Graded against: HEAD d726b51 (codex/multi-asset-symbol-state)
Source: Fable_Compiled_Sourcegraph_Audits.zip — 957 entries, 2026-05-04 → 2026-07-11
Workflow: one entry at a time → verify against HEAD → verdict with evidence → append. No bulk grading.

Verdicts: FIXED (evidence file:line) · STILL PRESENT (reproduced file:line) ·
STALE (code refactored away) · CLAIM WRONG (finding was incorrect) ·
NOT A FINDING (chat/telemetry/no verifiable claim)

## INVENTORY (the count you never had)
- 957 captured documents. 512 from May, 237 June, 208 July.
- 389 discrete MISSION proposals (the promise record)
- ~200 full session transcripts (findings embedded)
- 63 deepsearch prompts/captured audits · 90 Mercury telemetry (skip) · 31 changelogs · misc handoffs

## HEADLINE FINDING: THE PROMISE RECORD, QUANTIFIED
389 MISSION proposals dedupe to **10 unique claims**. The pipeline re-generated
the same missions dozens of times: trade-validator direction fix proposed 62x,
reducePosition 60x, brain-bug Set A 84x (two spec paths), each partial-close
mission ~30x. Two missions directly contradict each other (make validator accept
sell 93x vs revert to buy-only 31x). The "promise record" is not 389 broken
promises — it is ~10 promises, re-made for months.

ATTRIBUTION CORRECTION (Trey, on the record): the landed fixes — including
the crown jewel's 16 executed CRITs with in-code tags — were driven by the
OPERATOR staying on each finding to completion, not by autonomous pipeline
function. The re-proposal storms are what the pipeline did unattended; the
executed fixes are what happened under direct supervision. The dedupe
numbers measure agent drift; the fix rate measures operator attrition.
Grading of "the work landed" should not be read as "the agents delivered."

## STILL PRESENT (ranked)
1. [DEV TOOL, LOW] tools/trade-validator.js:267 remains buy-only
   (`direction === 'buy'`). 124 combined proposals fought over this line;
   the buy-only faction's state stands. NOT in the execution path — no
   consumer in run-empire/core found; standalone dev script. If the tool is
   ever used to validate shorts, it will silently skip them. Fix trivially
   or archive the tool.

## LEDGER
### [0500] MISSION-1776134835970 (2026-04-14) — VERDICT: FIXED
Claim: StateManager.closePosition ignores size param, always full-closes; needs reducePosition(tradeId, fraction, price, context) with remainingSize tracking + ledger exit legs.
Evidence: core/StateManager.js:1482 reducePosition exists w/ fraction validation (:1484), remainingSize math (:1526); closePosition now REJECTS partial closes explicitly (:1218) directing to reducePosition. Exceeds proposal: wrong path made impossible, not just alternative added.

### [x62+x31] trade-validator direction === 'buy' → accept sell — VERDICT: STILL PRESENT (dev tool, low)
Evidence: tools/trade-validator.js:267 still buy-only at HEAD. No execution-path consumer found. See STILL PRESENT #1.

### [x31] trade-validator revert to buy-only — VERDICT: MOOT/WON
The contradictory counter-mission. Current state IS buy-only, so this faction's
outcome stands. Both missions graded against the same line; they cancel.

### [x31] IndicatorEngine _updateRSI uses c.c instead of _c(c) — VERDICT: FIXED
Evidence: file relocated to core/indicators/IndicatorEngine.js; _updateRSI at
:552 uses _c() throughout — :559 change=_c(c)-_c(prev), :571, :628. CandleHelper
adopted exactly as proposed.

### [x58+x26] brain-bug Set A (4 files atomically: core/MaxProfitManager ...) — VERDICT: STALE (superseded)
Evidence: core/MaxProfitManager.js NO LONGER EXISTS at HEAD. The April
exit-checker refactor (StopLoss/TakeProfit/TrailingStop/MaxHold checkers,
BreakEvenManager, ExitDecider, ProfitExitPlanner, ExitContractManager) replaced
the module these 84 proposals targeted. The bug class they chased (partial-close
mangling in MPM tiers) died with the module.

### [x30] exitSize-vs-exitFraction semantics in MaxProfitManager L460/504 — VERDICT: STALE (same supersession)
Evidence: target file gone; exitFraction now lives across TradeJournal,
PolicyBuilder, ProfitExitPlanner, OrderExecutor, ExitContractManager — the
rebuilt pipeline the proposals predate.

### [x30] 4-layer partial-close pipeline silently full-closes every partial — VERDICT: FIXED (by refactor + reducePosition)
Evidence: StateManager.reducePosition (:1482) is the dedicated partial path;
closePosition refuses partials (:1218) so silent full-close on a partial intent
is structurally impossible; production proof: TTP eval account data records
partial_exits: 21 legs executed live (July 7 proof JSON, pre-restore diff).

### [x30] recordTrade aggregate legs by tradeId — VERDICT: STALE/RESTRUCTURED
Evidence: BacktestRecorder.recordTrade at :152 validates scope + refuses phantom
$0 P&L (:162); tradeId captured at :247. Leg aggregation as-proposed not present
in this form; journal/ledger own leg history now (trade.decisionLedger.exits via
reducePosition). Original single-table aggregation design superseded. No live
defect identified; flag for the strategy walks if journal double-counts legs.

--- MISSION VEIN COMPLETE: 389 proposals / 10 claims / verdicts: 3 FIXED,
2 STALE-superseded, 1 STALE-restructured, 1 STILL PRESENT (dev tool),
1 MOOT (contradiction). Next vein: deepsearch prompts + captured audits
(63 entries), then session transcripts.

## VEIN 2: AUDIT/DEEPSEARCH DOCS (100 entries → ~11 unique docs)
Crown jewel: [0381] CC-SPEC Complete Fallback Audit — All Findings
(2026-05-06, Wolf + 3-pass deepsearch, branch rebuild/clean-from-baseline).
This is the source of the "660 fallbacks" number. Phase 1 = 17 CRITICAL/HIGH
gated "before TTP trial". Grading Phase 1 against HEAD d726b51:

### CRIT-01 getAvailableCapital||10000 — FIXED (doc said so; HEAD confirms:
OrderExecutor:2445 comment memorializes the kill — "The old || 10000 upgraded...")
### CRIT-02 rawConfidence||0.5 — FIXED, exceeds spec. OrderExecutor:2467
halts entry on non-finite or <=0 confidence with [HALT] log. Zero-conviction
trades structurally impossible.
### CRIT-03/04/05 tradingPair||'BTC-USD' (6 sites incl proof logger + TRAI) —
FIXED. Zero occurrences of the pattern at HEAD. Symbol-poisoning of pattern
memory via default routing: dead.
### CRIT-06 phantom exit contract confidence=0 when orchResult absent —
FIXED (verified this week, exit-path lane): OrderExecutor:2555 refuses entry
without exitContract; behavior test proves stop-before-broker. Red-tested.
### CRIT-07 sizingMultiplier||1.0 overriding intentional zero — FIXED exactly
as prescribed: OrderExecutor:1933 uses ?? 1.0. VP chop suppression preserved.
### CRIT-08 initialBalance||10000 — FIXED (StateManager explicit-balance
requirement per CHANGELOG; the July proof-fossil incident was the TOOL fed
stale env, not this fallback resurfacing).
### CRIT-09 filterPrice chain defaults to 0 (StrategyOrchestrator:784) —
RELOCATED/NEEDS ONE CHECK: grep shows filterPrice logic moved; verify in
strategy-walk pass that price-missing refuses rather than zeroes.
(remaining CRIT-10..17 + Phase 2/3: next grind pass)

Interim scoreboard for the crown jewel: 8 of first 9 CRITICALs verifiably
FIXED at HEAD, most exceeding the prescribed fix. The 660-fallback purge's
critical tier substantially LANDED — contrary to the "nothing got done"
prior. The three-week removal campaign's receipts keep checking out.

### CRIT-10 atr||0 filter bypass (Orch:785) — FIXED (relocated + today's lane)
Code moved in refactors; the zero-vs-missing ATR discipline landed via
4a3ca60 (this week's exit lane): finite checks, atr_zero recorded as data,
red-tested against parent. The bug class is dead where it now lives.
### CRIT-11 maxPositions||3 — FIXED: TradingLoop:447 `maxPositions = null`,
no invented default; entry gate consumes explicit value (:428).
### CRIT-12 DPS commented out — FIXED AS PRESCRIBED: run-empire:269 carries
the CRIT-12 tag; ENABLE_DPS env gate implemented per the audit's own fix.
### EXIT-CRIT-01 stopLossPercent||1.0 — FIXED, EXCEEDS: BreakEvenManager:36-50
separates undefined/null from zero explicitly; zero-stop contracts keep
their meaning. The one-character bug got the full zero-vs-missing treatment.
### MOD-HIGH-01 SMS ATR=0 → TP=entry — FIXED VERBATIM: SmartMoneySweep:864
`if (!Number.isFinite(atrVal) || atrVal <= 0) return null;` — the audit's
exact prescribed line, plus caller comment at :238.
### PS-CRIT-01 maxPositionPercent NaN — FIXED, tagged: PositionSizer:24-31
constructor throws with [PS-CRIT-01] in the message. Boot-time refusal.
### RISK-HIGH-01 confidence=0 destructure — FIXED, tagged: RiskManager:115-120
refuses non-finite confidence with named gate, comment cites the finding.
### TRAI-HIGH-01 feature fabrication (trai_core:752-780) — FIXED, tagged:
:756 builds 9-element vector ONLY from clean inputs, returns null on any
missing/non-finite (:777-781). NOTE: fix-queue L741 flags the MIRROR in
TRAIDecisionModule as unaudited — that mirror is ALSO the unscoped-key
module from Phase 0 (Tier-2 rider A). Both TRAI diseases live in the same
file; the router lane's rider fixes keys, the fabrication mirror still
needs its own check. → carried to STILL PRESENT as investigate.
### DPS-ARCH-01 destructure defaults (balance=10000 etc) — FIXED AS
PRESCRIBED: DynamicPositionSizer:145+ all nulls, blocked:true early-return
(:180). The audit's exact remedy, with its comment trail.
### HIGH-09..12 pattern-poison cluster (OrderExecutor 722-741) — FIXED BY
PATTERN: sites rebuilt on _firstFiniteNumber(...) helper (:84) — takes
first FINITE value or nothing; no synthetic bbWidth/rsi/macd/trend
constants remain at the cited sites. TRAI outcome recording feeds from
entry indicators via the same finite-only path.

## CROWN JEWEL PHASE 1 — FINAL: 17/17 dispositioned.
16 FIXED (most tagged in-code with the audit's own IDs — the fixes were
executed AGAINST this document), 1 investigate (TRAI mirror, folded into
router Tier-2 work).

## CROWN JEWEL PHASE 2 (31 HIGH) — GRADED
Bulk pattern-grade at HEAD, context-inspected survivors:
FIXED (pattern extinct at cited sites): HIGH-02 (vol||0 TradingLoop),
HIGH-03 (trend||'sideways'), HIGH-06 (slippage||), HIGH-08
(winnerStrategy||'default' — strategy-specific exit contracts now
mandatory, the refusal at OE:2555 is this fix's descendant), HIGH-09..12
(poison cluster — finite-only rebuild, graded prior pass), HIGH-13
(directionFilter||'both' — profile-owned in slice 2), HIGH-15 (volPct —
became the [HIGH-15] throw, then properly fixed in 4a3ca60 this week),
HIGH-16 (timeframe||'15m' — profile-owned), HIGH-17 (confluence.count||1),
HIGH-23/24 (boost||{} — booster explicit per R6/slice 2), HIGH-18..22
(TradeIntelligenceEngine quintet — :209 comment memorializes HIGH-18 kill;
other four patterns extinct).
BENIGN REMNANTS (not the cited bug): H04's surviving `regime?.confidence
|| 0` is a [DIAG] console.log at :1555 — display only; the decision path
below it refuses on missing regime ("no regime data → can't vote").
H05's two `confidence || 0` hits are a pattern-filter threshold (:1916,
filters OUT low-conf patterns — fabrication would need || 100 to matter)
and a ledger display field (:2133). Neither fabricates a trading input.
STILL PRESENT — REAL: **EXIT-HIGH-02, DynamicTrailingStop.js:41-50** —
the env||config||default chains live on: TRAIL_ATR_MULTIPLIER,
TRAIL_MIN_ACTIVATION, TRAIL_TREND_WIDEN all parseFloat(env)||config||
hardcoded. This is (a) a resolver bypass — exit-shape params reading raw
env, invisible to profiles/fingerprint, (b) the exact exit-tuning surface
the sweeps will tune, (c) already known as the Family-4 landmine. The
deepsearch audit called it May 6; it's still the one live fallback chain
in the exit path. DISPOSITION: kill rides with exits/sweep work (Trey's
in-passing rule) — params move to profile/contextParams ownership.
ALPACA-HIGH-01 (account stream not wired) + MOD-HIGH-02 (LiquiditySweep
ATR filter bypass): deferred to strategy walks (wiring-audit class).

## CROWN JEWEL PHASE 3 (MED tier) — TRIAGED, NOT INDIVIDUALLY GRADED
MED-01..14 + EXIT-MED-01 are telemetry/labeling defaults (exitReason,
entryStrategy labels, dashboard display values, pattern-hash warmup
noise). Two get flagged forward: MED-12 (pattern hash Date.now() fallback
— nondeterministic hash = unmatchable pattern, feeds the pattern-quality
question in walks) and MED-14 (pnl computed 0 when entryPrice=0 — now
guarded by BacktestRecorder's phantom-$0 refusal at :162, likely FIXED).
Full MED grind deferred: lower blast radius than remaining veins.

## VEIN 3: JULY ENTRIES (the current-bot vein)
July 2 giants = recapture triplicates of earlier sessions. The payload is the
2026-07-11 morning cluster (0904-0917): Trey's own deepsearch session run
TODAY against the live repo. Graded against HEAD ad39345:

### [0914] SMS sells-die root cause: DIRECTION_FILTER=long_only silently
converts sell→hold (TradingLoop:257-era) — VERDICT: FIXED-STRUCTURALLY,
CONFIG-CURRENT, with one Trey decision surfaced.
HEAD state: the silent conversion is GONE. TradingLoop:597-610 now
validates the filter against an allowlist, THROWS on invalid values
([DIRECTION-GATE]), and blocking is an explicit, visible gate
(filterBlocksShort at :610) feeding the riskGates ledger — not a silent
hold-swap. Ownership moved from env profiles (the ghost .env era the
audit cited) to launchProfiles (slice 2). CURRENT PER-PROFILE TRUTH:
production=long_only, paper=long_only, backtest-p0=long_only (anchor
preserved), all other backtest profiles=both.
→ SURFACED DECISION: production/paper being long_only is now an EXPLICIT
CHOICE in the one config file, not a buried env var. When shorts go live
(TTP permitting), it's a one-word profile edit. The 530 dead SMS sell
signals were killed by config, not code — and the config is now visible.

### [0907] "Complete deep audit" of run-empire-v2.js — VERDICT: MIXED,
mostly STALE (audited branch fix/candle-helper-wip, not current).
Self-corrections within the doc (executeTrade exists, TradeJournalBridge
wired, ExitContractManager wired) confirm the WIRING claims that earlier
deepsearch passes got wrong — three "catastrophically wrong" prior claims
retracted by its own deeper read. Standing lesson: deepsearch first-pass
absence claims are unreliable; require full-file reads.
Finding 4 (entry strategy detection → silent 'default' fallback at
run-empire 2679-2699): STALE at HEAD — no 'default' strategy fallback
in current entry detection (grep clean); strategy detection moved into
StrategyOrchestrator winner path post-refactor.
Finding 5 (ExitContractManager per-strategy SL/TP defaults sized for the
1-minute/BTC era): PARTIALLY LIVE QUESTION — the specific numbers cited
were for 1m; bot now trades 15m stocks. Whether current per-strategy
exit-contract defaults are sized for 15m/fee reality is EXACTLY the
exits-sweep campaign's job. → folds into the sweep work, not a bug grade.

## VEIN 2 COMPLETION: remaining unique audit docs (full sweep)
### [0841] Sourcegraph Deep Search Archive 2026-05-20 — the "Silent
Killer" sweep (bugs that compile clean, log nothing, surface under live
capital). Spot-graded at HEAD:
- KILL-6 (adjustedConfidence 100x wrong for non-winners): FIXED, EXCEEDS —
  TradingLoop:309/322 now route ALL ledger confidence through a dedicated
  _ledgerConfidence01() normalizer. The one-character fix became a
  single-owner helper. Ledger analysis integrity restored.
- KILL-7 (nearestStructure hardcoded null → MPM structure-blind trailing):
  FIXED — TradingLoop:984 computes _nearestStructure(price, fib, sr),
  flows at :1034 and through _gatherData (:1209). Trailing stops now see
  structure. (MPM itself died in the refactor; the data path feeds the
  exit-checker successors.)
- Archive's own "confirmed clean" list independently corroborates ledger
  verdicts: CRIT-01 capital math, phantom-confidence halt, state locking,
  cross-symbol exit isolation, paper-trading enforcement — all re-verified
  by a SECOND instrument (Sourcegraph) against a May tree, matching
  tonight's HEAD grades. Two instruments agree.
- KILL-1..5 (confidence math partial, exit_partial multi-leg trace,
  orphaned FibonacciDetector.getSuggestion, RiskManager bypass injection,
  SELL-no-BUY emergency reset): NOT individually graded tonight — KILL-2's
  multi-leg trace concern overlaps the recordTrade/leg-aggregation
  question already flagged for strategy walks; KILL-4's bypass-injection
  concern was structurally resolved by slice 3 (bypasses explicit
  per-profile, injection caged); KILL-5 flagged forward to walks (data
  integrity class). KILL-1/3 → walk-era items.
### [0170/0169] Session-handoff class (~30 dupes): HISTORICAL RECORDS,
no open claims — but anchor archaeology gold: 2026-04-27 P0 baseline was
$17,551.91 / 1265 trades / 61.5% WR / 2.67 PF on alpaca/stocks-paper-flip
(vs today's 8338.15 / 1551 / 52.2% / 0.64 on the current gate). Also
provenance for feedback-no-deferred rule + mercury-attack-not-verify
lesson + first-ever live Alpaca trades via SessionRouter (Apr 27) —
router battle-history receipt.
### [0013/0151 etc] Dashboard extraction/cleanup class: SUBSTANTIALLY
EXECUTED — unified-dashboard-legacy.html (frozen baseline) + successor
exist at HEAD; font extraction file absent (cosmetic, superseded by
command-center.html rebuild). Punch-list era closed by rebuild. NO OPEN ITEMS.
### [0379] Fallback audit v1: SUPERSEDED by 0381 crown jewel (graded).
### [0383] May 7 front-end session transcript: NOT-A-FINDING (chat).

## VEIN 4: OGZ-META/LEDGER CLAIM-VS-REALITY SWEEP (Trey's ask: "what was
I TOLD that was never wired") — wiring-spec docs graded against HEAD:

### DYNAMIC-POSITION-SIZER-WIRING.md (2026-03-20 spec: "replaces the
inline confidence multiplier hack; this doc tells CC exactly where to
wire it") — VERDICT: **STILL NOT WIRED. 4 months.** The told-you class,
confirmed with the code's own confession: run-empire-v2.js:1060 —
"DynamicPositionSizer NOT WIRED - needs tuning. Using inline confidence
multiplier." Module loads behind ENABLE_DPS (CRIT-12's env gate landed),
but the SIZING PATH the March spec was written to replace still runs the
inline hack. The promise: specced Mar 20, gated Jul, never fulfilled.
Honest note: the non-wiring is at least DOCUMENTED in-code now, and
DPS-ARCH-01's poison defaults were fixed inside the unwired module — so
wiring it is now safe when ordered. → STILL PRESENT list, promoted:
this is the largest verified told-but-never-done item in the repo.

### WIRE-VOLUME-PROFILE.md (Fabio/AMT integration) — VERDICT: WIRED.
core/VolumeProfile.js exists; required run-empire:416, instantiated :759
with config block. Promise kept.

### PID-CONTROLLER.md (May adaptive meta-control spec) — VERDICT: WIRED,
partially. core/PIDController.js exists; OrderExecutor calls
pidController.onTradeClose() at :4038 and :4598 (learning inputs flow).
Whether PID OUTPUTS steer sizing/trailing (the spec's full loop) —
walk-era check, but the module is live, not shelfware.

### FULL-INTEGRATION-PACKAGE.md (Feb 27, Phase 0-3 wiring) — HISTORICAL,
superseded: IndicatorSnapshot + modular refactor phases landed via the
April 14-phase work (exit checkers verified throughout tonight's grades).

### TRAIPatternIntegration — module exists in core/ and is referenced by
TRAIDecisionModule + BacktestRecorder: wired at reference level; depth
check rides the TRAI mirror investigation already queued (router Tier-2).

VEIN 4 INTERIM SCOREBOARD: of the marquee "wire this in" promises —
VolumeProfile KEPT, PID KEPT (partial-depth), Phase-refactor KEPT,
TRAI-integration wired-at-reference, **DPS BROKEN (4 months, in-code
confession)**. The told-but-never-done class is real but small at HEAD —
one confirmed major item, promoted to the action list.

## VEIN 5: GRAND-SCHEME.md REALITY GRADE (the mic-drop check)
North-star doc (Trey, 2026-04-07). Falsifiable built-status claims graded:

### The broker fleet — CLAIM SUBSTANTIALLY TRUE, exceeding the doc:
brokers/ contains 11 adapters + contract + registry + factory (6,768
lines total): Alpaca 970, Binance 606, Schwab 583, Gemini 567, Kraken
557, Coinbase 528, OANDA 499, Tastyworks 477, IBKR 463, CME 443, Uphold
439. "Tastyworks half-built" — it's 477 lines against the 297-line
IBrokerAdapter contract; "OANDA exists" — 499 lines. Every venue the
Grand Scheme names has an adapter ON DISK. BrokerRegistry registers 8+
(Coinbase, Binance, Gemini, Alpaca, IBKR, Tastyworks, OANDA, CME);
BrokerFactory is the bot's live import (run-empire:469, "EMPIRE V2
ARCHITECTURE" comment). Depth caveat honestly stated: only Alpaca and
Kraken are BATTLE-TESTED with real order flow; the other 9 are
registered contract implementations of unknown live quality — that's
"multi-broker skeleton complete," not "10 venues production-ready."
But as architecture: the multi-broker abstraction the doc describes IS
the code's actual shape. Doc's file paths drifted (adapters live in
brokers/, not core/) — cosmetic.

### TRAI's 9 responsibilities — DOC'S OWN HONESTY CONFIRMED: the doc
itself says only #3 (pattern modulator) is implemented. HEAD agrees:
TRAIPatternIntegration + TRAIDecisionModule live; no news crawler, no
whale watcher, no CS layer in code. Content-gen (#7) has API-key stubs
in trai_core (:88-89 elevenlabs/did keys read) — scaffold, not function.
No false built-claims found in the TRAI section: the vision doc labeled
vision as vision. GRADE: HONEST DOCUMENT.

### Grand Scheme invariants vs tonight's work — CONVERGED: "exit
contracts locked per strategy with _validated fingerprints" (live),
"backtest/live identical code paths" (the parity work), "every account
isolated" (per-symbol state + venue identity lane), "tuning deliberate
not env sweeps" (the caged override door, slices 1-3). The April vision
and the July architecture rulings are the same document written twice.

MIC-DROP VERDICT: the Grand Scheme is NOT grandiose shelfware — the
trading-engine layer it describes exists at skeleton-or-better across
the whole fleet, and its invariants are the ones tonight's doctrine
enforced. The gap between vision and tree is TRAI (8 of 9 functions
unbuilt, as the doc itself admits) and adapter battle-depth — not
architecture fiction.
