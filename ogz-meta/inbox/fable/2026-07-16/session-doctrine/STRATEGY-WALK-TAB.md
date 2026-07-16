# STRATEGY-WALK-TAB — running findings + required work per module
Started 2026-07-13 (walk night). Grades against HEAD 9338d59+.
Format: STATUS | what it does today | what needs to happen | Trey rulings pending.

## RSI (StrategyOrchestrator:1484) — WALKED ✓
DOES: IndicatorEngine Wilder-14 RSI, config 30/70 levels, confidence 0.50@threshold→0.90@15-deep, silent between extremes. Producer clean.
FINDING: contract minConfidence 0.6 (enforced at Orch:1994) makes EFFECTIVE entry ~26.25/73.75 — the 26-30 zone votes but never trades. 0.6 entered config file 2026-04-22 (post-March-validation stamp); true birth unbounded (may predate in old regime).
FINDING: dormant ||25/||75 defaults in code (config wins; landmines only).
TAB: [ ] sweep grids oversold-level × minConfidence JOINTLY on fee-real profile (their interaction IS the entry) [ ] kill dormant || defaults with strategies config family [ ] exit geometry (-0.8/+1.0/240m) → Lane 6b sweep [ ] re-stamp post-sweep.
RULINGS PENDING: none — sweep decides levels per Trey.

## EMASMACrossover (modules/EMASMACrossoverSignal.js) — WALKED ✓ = LANE 8a
DOES: 5 weighted MA pairs; live mode = PERSISTENT ALIGNMENT voting (votes every candle in any trend — the 157K-trade fee furnace). Crossover-events mode EXISTS (entryEventsOnly + confirmBars) but hidden default FALSE via strategyBehavior.emaCrossover.entryEventsOnly (Orch:365); strategies.EMASMACrossover ABSENT from config.
GUTTING (verbatim, "COMMENTED FILTERS - move to orchestrator if needed later"): signal decay, divergence velocity, snapback, blowoff — all dead code, IOU never honored, header still advertises them. P1 violation in the flesh.
TREY INTENT (ruled tonight): EMA family = CROSS EVENTS + BOUNCE/RETEST.
TAB: [ ] entryEventsOnly:true + confirmBars value (Trey/sweep) [ ] strategies.EMASMACrossover block lands explicit; hidden default dies [ ] restore gutted trio? (RULING PENDING: decay/snapback/blowoff — all/some/none) [ ] contract -0.5/+1.0 + ema_cross_reversal invalidation re-validated for events mode [ ] header updated to tell the truth.

## EMATrendRetest (modules/EMATrendRetest.js) — WALKED ✓ = LANE 8b
DOES: the bounce/retest play, WELL-BUILT: EMA slope trend qual, ATR touch zone, close-away confirmation, over-extension reject, OWN complete exit geometry (atrStopMult/targetRR/R-trailing/maxHold), session-aware, REFUSES construction without every key explicit (no hidden defaults — built to constitution standard).
STATUS: DORMANT (shouldInstantiateDormantStrategy gate :1824), strategies.EMATrendRetest ABSENT, no contract block.
TAB: [ ] Trey rules/sweeps its parameter values → config block [ ] enable flag on (backtest profiles first) [ ] WIRING VERIFY: does its internal exit geometry actually govern, or does generic ladder override (TakeProfitChecker-class question) [ ] transcript numbers seed values if source found.

## LiquiditySweep (modules/LiquiditySweepDetector.js) — WALKED (surface) ✓
DOES: 7-step institutional-sweep system (ATR filter → manip candle → box → exit → reversal → entry → SL/TP), timeframe-agnostic since FIX-2026-03-10. Config EXISTS and populated (lookback 50, ext 0.1%, ATR 0.25×, hammer/engulf params, 90min entry window, enabled). Contract validated 3/20: -2/+2.5, structural exits flag, liquidity_absorbed invalidation. Funnel diagnostics exist (Orch:718 evaluated→traded counters).
KNOWN HISTORY: 50%+ max_hold death rate (old exits era); MOD-HIGH-02 open from crown-jewel audit: ATR candle-filter bypass claim — DEFERRED TO THIS WALK, not yet traced.
CODE SMELL: || defaults throughout (weights ||0.15 etc.) — dormant where config covers keys, live for any key config omits. Weights NOT in config block → weights are running on code defaults RIGHT NOW.
TAB: [ ] trace MOD-HIGH-02: does the ATR manip-candle filter actually gate (or bypass on ATR=0/missing)? [ ] deep walk of the 7 steps vs header promise (MADynamicSR precedent: 7-condition spec commented out — verify LS's steps LIVE) [ ] weights into config explicit or ruled code-owned [ ] max_hold 50% death: does 180min fit the setup's actual resolution time on 15m? (sweep) [ ] useStructuralExits + liquidity_absorbed invalidation: verify wired (invalidationConditions were [] platform-wide in ECM read — contradiction to resolve).

## SmartMoneySweep (modules/SmartMoneySweep.js) — WALKED (surface) ✓
GOLD: header carries an ANSWER KEY — "Port of SmartMoneySweep v4 PineScript.
PineScript answer key: TSLA 15m, 207 trades, PF 1.555." The strategy has a
documented source-performance target — re-validation = parity test against
the Pine original's numbers (fee question separate; 1.555 presumably pre-fee).
DOES: fully self-contained SMC engine — own Volume Profile (VAH/VAL/POC/LVN),
IVB range, candle classification (absorption/initiative/CVD/exhaustion),
sweep detection over bars 1-3 + inCash/inValid/canTrade gates + absorption
confirmation on the sweep candle. Rich config block EXISTS (vpDays 5, 50
bins, VA 70%, absorption/initiative params). Emits overrideLevels — module
computes its own SL/TP levels.
CONTRACT: -0.3/+1.5 (tightest stop + 1:5 RR in roster), maxHold 900min (15
HOURS — longest), useStructuralExits, sweep_absorbed invalidation, NO
_validated stamp.
HISTORY: the 530-dead-sells strategy (long_only config, now explicit choice);
MOD-HIGH-01 ATR=0→TP=entry FIXED verbatim (:864, graded in crown jewel).
FLAGS: (1) -0.3% stop on TSLA 15m is INSIDE single-candle noise — unless
overrideLevels/structural exits govern instead of the contract number, this
stop is a random-exit generator. OWNERSHIP TRACE NEEDED: contract -0.3 vs
module overrideLevels — who actually sets the live stop? (2) sells: when
shorts flip on (one-word profile edit), SMS is the primary beneficiary —
its short side has never traded live.
TAB: [ ] SL/TP ownership trace (overrideLevels vs contract vs generic ladder)
[ ] parity backtest vs Pine answer key (207 trades / PF 1.555, TSLA 15m)
[ ] fee-real verdict after parity [ ] stamp after re-validation [ ] short
side unlocks with direction ruling.

## CandlePattern REFERENCE TAXONOMY (Trey-supplied sheet, 2026-07-13 — target
vocabulary for detector expansion + DASH-PATTERNS card; build DEMAND-DRIVEN
per ruling, not poster-completion):
- NEUTRAL: doji, spinning top, marubozu (=NoWick kinship — unify), star
- SINGLES bull: hammer, inverted hammer, dragonfly doji, bullish spinning top
  | bear: hanging man, shooting star, bearish spinning top, gravestone doji
- DOUBLES bull: bullish kicker, bullish engulfing, bullish harami, piercing
  line, tweezer bottom | bear: bearish kicker, bearish engulfing, bearish
  harami, dark cloud, tweezer top
- TRIPLES bull: morning star, bullish abandoned baby, three white soldiers,
  bullish three line strike, morning doji star | bear: evening star, bearish
  abandoned baby, three black crows, bearish three line strike, evening doji star
- CONFIRMATIONS: three inside up, three outside up | three inside down,
  three outside down
- CURRENT DETECTOR COVERAGE (~9): hammer, shooting star, doji, both
  engulfings, morning/evening star, double top/bottom. Gap = everything else.
- Location-annotation law: patterns surface WITH zone context (post-demotion),
  both in confidence inputs and on the dashboard card.

## TimeSeriesMomentum — WALKED ✓ (18 of 18 — ROSTER COMPLETE)
Classic TSM (N-bar return vs minReturn + trend-SMA filter — the academically
documented momentum edge). Constitution-grade: 11 required keys, confidence
stack fully config-owned, validation throws. DORMANT: config absent,
contract absent. Same profile as the sleeping second generation.
TAB: [ ] wake decision with the dormant batch [ ] values Trey/sweep
[ ] imbalance-team member — regime coverage when boosts expand.

# ===== FINAL ROSTER CENSUS (walk phase closed 2026-07-13 dawn) =====
LIVE, working-with-findings: RSI (sole fee survivor; effective-26 gate),
Donchian (best contract; trail-vs-TP contradiction), LiquiditySweep
(MOD-HIGH-02 untraced; weights on code defaults), SMS (Pine answer key;
stop-ownership trace), ORB (Trey's design; 1-bar OR flag; IVB upgrade
ladder), MTF (voter+service dual role; confluence math unread).
LIVE, diseased: EMASMA (churner mode; gutted trio), MADynamicSR (gutted +
direction-incoherent + regime-boosted), OGZTPO (gutted; silent catch),
CandlePattern (location-blind — RULED: demote to confirmation service),
MarketRegime-voter (double-dip — RULED: dead).
DORMANT, constitution-grade (the sleeping second generation): EMATrendRetest,
PropSafeEMAPullback, RSI2MeanReversion, TimeSeriesMomentum, NoWick
(built-to-spec, contractless).
UNRESOLVED: VolumeProfile as strategies-config key — voter or boost-only?
(one check remains). FVGDetector = ORB helper, not standalone.
CROSS-CUTTING LAWS DRAFTED: confidence-values-in-config (PropSafe as
reference); regime detector volatile-trumps-trending ordering bug;
trendRegimeGate + atrContracts flags OFF nobody ruled; pullback-family
consolidation (3 implementations → 1).

# ===== TREY RULING 2026-07-13: RISK AUTHORITY CONSOLIDATION =====
ALL halt/veto power in the bot consolidates into ONE seat: RiskManager.
- Everything else — strategies, planners, exit checkers, fee models,
  regime, PnLTracker — emits OPINIONS (signals, scores, confidence).
  Zero refusal authority anywhere outside the seat.
- RiskManager holds ONLY Trey-ordered vetoes, each a named, config-owned
  rule with anti-limbo paperwork (who ordered / values / profile / what
  unblocks). Current ordered set: R-DD daily-loss + trailing-DD guard
  (venue-neutral, self-computed), Fabio-K2 consecutive-stop day-halt,
  position caps IF Trey ratifies them. Nothing enters the seat without
  a ruling.
- isTradingAllowed() = the single choke point (TradingLoop already
  calls it). One place to audit, one place to test, one place to read.
- Two-layer law: confidence stack shapes entries (analog, multipliers);
  RiskManager protects capital (binary, centralized, Trey-owned law).
- AUDIT FIRST (rides ahead of R-DD implementation): full inventory of
  RiskManager + PnLTracker's current occupants — every score, label,
  recommendation, refusal path; git blame each; disposition table to
  Trey (keep-as-ordered / kill / absorb-into-R-DD). April-11-era
  freelancing dies unless ratified. THEN R-DD builds the guard INTO the
  cleaned seat as its first legitimate tenant.

# TREY RULING 2026-07-14: RSI SPEC (dictated)
Buy: RSI(5) < 35. Exit: RSI(5) > 50. Regime filter: 200MA — price above
= trading allowed (bull), below = NO trades (not shorts — no trades).
Connors-family asymmetric mean reversion. Maps to: RSI config (period→5,
oversold→35, exit→50 as config keys, sweep-tunable around these seeds);
200MA filter = strategy-owned condition (PropSafe pattern, config-
exposed, NOT the broken regime detector). Tournament: these are Trey's
seed values; grid sweeps around them. Applies to live RSI strategy;
RSI2MeanReversion (dormant) stays separate (RSI-2 variant).

# TREY RESEARCH BANK 2026-07-14 ("just thoughts" — quantifiedstrategies.com set)
Seed specs for tournament grids / future strategy configs. NOT lanes yet.
1. GOLDEN/DEATH CROSS: 50MA x 200MA — cross above = buy, below = sell.
   (Maps: EMASMACrossover family — slow-pair variant as sweep arm.)
2. TQQQ/BTAL annual rebalance: TQQQ 33% (3x lev) / BTAL 67%, January.
   (Portfolio-layer idea — post-eval era, not bot-lane.)
3. GOLD+IEF 2-step regime: monthly close, 12-mo total return of GLD AND
   IEF both positive → long; either negative → cash till next month-end.
   (Macro regime filter — day-type-engine-adjacent, monthly cadence.)
4. SPY RSI(2): buy <10, sell >80, enter/exit at close. VARIANT (stated
   statistically better): buy RSI(2)<10, exit when close > yesterday's
   HIGH. (Maps DIRECTLY: RSI2MeanReversion dormant module seed values.)
5. CHOP+RSI COMBO: Choppiness Index <50 (rangebound) + RSI(2)<20 → long;
   exit close > yesterday's close OR 5 days. Claimed: 0.69%/trade, 15%
   exposure, 8.5%/yr, maxDD 23%. (Chop index = regime filter the
   detector-rebuild could adopt; exit shape = time-capped structural.)
6. TURNAROUND TUESDAY: Monday close < Friday's LOW → buy Monday close;
   exit close > prior day high OR 4 days. Claimed 0.6%/trade, 11%
   exposure since 1993. (Seasonal/day-of-week class — new to roster.)
NOTE: items 4-6 exit shapes are all "close vs prior bar" structural
exits + time caps — kinship with Trey partial-exit intent + K6.

# TREY MASTER SEQUENCE (ruled 2026-07-14) — PLAN OF RECORD
A. ALL STRATEGIES ONLINE: dormant gate dies (five wake), OGZTPO
   restored, config exposure roster-wide. Nothing benched.
B. FULL REVIEW, four eyes per strategy: Trey + Fable(Desktop) walks +
   Mercury attack + Fable-tier review. Combined notes per strategy.
C. FINAL SHAPE: from combined notes Trey rules final form of ALL
   strategies; changes submitted as one coordinated campaign.
D. PLATFORM IN: TFE + SessionRouter fully integrated, all timeframes,
   strategies subscribe native — backtest pipeline == live trading
   pipeline. Same pipe it will trade.
E. BACKTEST EVERYTHING → fill the config table. Tournament on the
   finished machine only. Table rows are final, auditable, held.

# TREY RULING 2026-07-15: TABLE-GOVERNED RUNTIME
Tournament runs ALL finished strats × ALL timeframes on the finished
architecture. Config table = per-strategy × per-TF optimal shapes
(survivors only, via top-3/TF → walk-forward → cross-ticker). RUNTIME:
bot spots a setup on any frame → looks up that strategy×frame row →
auto-applies that exact shape (params, contract, confidence values).
No pre-ruled frame assignments — the tournament discovers where each
strategy performs; strategies subscribe to frames where their rows
survived. Table governs; nothing overrides.

# TREY RULING 2026-07-16: TWO-PASS REGIME TOURNAMENT
PASS 1 (preliminary sweeps): regime layer NEUTRAL for everyone — no
boosts, no penalties, flat field. All strats x all frames x flags.
Data reveals where each strategy actually performs (frame, regime
conditions, ticker personality).
CLASSIFY: from Pass-1 data + Trey intent, each strategy gets its regime
assignment (trend/range/volatile boost profile). Regime detector rebuild
(Choppiness Index candidate) enters HERE, not before.
PASS 2: regime boosts applied per classification, rerun, compare vs
Pass-1 numbers. The delta IS the verdict on the regime layer itself —
wire-effect protocol applied to regime: baseline, wire, delta, verdict.
No regime assignment survives on theory; only on delta.
