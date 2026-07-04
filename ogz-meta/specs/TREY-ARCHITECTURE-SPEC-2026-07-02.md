# TREY ARCHITECTURE SPEC — Canonical Strategy Doctrine
**Author:** Trey (The Architect) · **Recorded:** 2026-07-02
**Status:** CONSTITUTION. Agent work that violates this spec is defective regardless of tests passing.
**Enforcement:** every strategy audit, Lab dossier, and roster decision grades against these six principles.

---

## P1 — SELF-CONTAINED STRATEGIES
Every strategy is an isolated unit: its own entry logic, its own exit logic, no blending
with other strategies' internals. A strategy can be added, removed, or tuned without
touching any other strategy.

**Current state: PARTIALLY VIOLATED.**
Entry logic is modular (modules/*Signal.js) ✓. But EMASMACrossoverSignal was gutted
2026-era ("STRIPPED DOWN... platform handles filtering, not strategy") — its event logic
(signal decay), snapback, and blowoff detection were commented out with an IOU that the
orchestrator would take them. StrategyOrchestrator contains ZERO references to any of it.
The strategy still emits permanently-dead snapback/blowoff fields.
→ Restoration owed: event-driven behavior returns to the strategy (TREY SPEC 001 item 1).
→ Audit owed: same gutting check across all remaining roster strategies.

## P2 — STRATEGY-OWNED EXITS
Each strategy defines its own stop, target, and trail geometry. No generic platform
exit ladder applied uniformly to everyone.

**Current state: VIOLATED.**
Modules emit stopLoss: null / takeProfit: null and defer to ECM platform defaults.
The generic tier ladder scalps every strategy identically — eval evidence: designed
exits captured ~9% of available move ($12 banked vs $129 abandoned on 2026-07-02).
Config supports per-strategy exitContracts.<strategy>.* (proven by the matrix override
work, commit 792f4803) — the plumbing exists; the strategies just don't use it.
→ Each strategy gets its own exit contract: trend strategies get runners (ATR trail),
  mean-reversion strategies get targets. Exit geometry is a strategy property, not a
  platform property.

## P3 — TIMEFRAME-SPECIFIC TUNING
A strategy's entries and exits are tuned to the timeframe it trades. Same strategy on
15m and 1h is two configs, not one.

**Current state: UNVALIDATED.**
EMASMACrossoverSignal header still says "Feed a new 1-minute candle" while running 15m.
Periods/thresholds were never re-validated after the transplant. No per-timeframe
config surface currently distinguishes tunings.
→ Weekend campaign sweeps per-timeframe; per-timeframe contract keys follow.

## P4 — MTF CONFLUENCE
Each strategy runs multi-timeframe scans; higher-timeframe agreement boosts
confidence/confluence at signal time.

**Current state: PARTIAL / NEEDS TRUTH AUDIT.**
An mtfConfluenceBooster exists (BacktestRunner stats path, orchestrator MTF test).
Unknown whether it materially influences live decisions or is another corpse field.

**OPERATOR RULING (2026-07-02): MA pairs are allocated by timeframe.** Fast structure
(EMA 9/20, optionally 50) is evaluated on the trading timeframe (15m and under) and
times entries. Slow structure (50/200) is evaluated on 1h+ via the MTF layer and serves
as regime/bias congruence input — it does NOT vote as an entry signal on the trading
timeframe. Rationale: 200-period on 15m is semantically meaningless (neither intraday
structure nor the institutionally-watched daily 200); this split also removes the
200-bar warmup burden from the entry path and converts the slow pairs from fake
same-timeframe confluence votes into the true higher-timeframe congruence check.
→ Behavioral audit: show its actual contribution distribution across the eval's 68
  live trades and the backtest window. If it never changes a decision, it's dead —
  fix or remove, no zombie fields.

## P5 — MULTI-STRATEGY CONFLUENCE
When multiple strategies vie for the same direction at the same moment, that agreement
is itself a confidence/confluence boost at the orchestrator.

**Current state: BUILT BUT POISONED.**
Orchestrator ranking/confluence chain exists, but additive-then-clamp boosts saturate
confidence to 100 (F7; four live clamp sites at StrategyOrchestrator :1136/:1191/:1248/:1291).
When everything is 100, agreement is meaningless.
→ M-L desaturation (headroom-bounded boosts) paired with consumer recalibration via
  Lab data — already ruled, queued behind the money path.

## P6 — CONTEXT CONFIDENCE INPUTS
News sentiment and mechanical setup quality ("how the setup looks") contribute
confidence/confluence, alongside pattern memory.

**Current state: BUILT-BUT-DORMANT / RECENTLY REPAIRED.**
News: provider-explicit search shipped (NewsSearchProvider), intentionally OFF for cost;
one env var re-enables; injection review required before news ever touches decisions.
Setup quality: pattern memory was contaminated for months by fabricated feature vectors
(Fix 18 / M-N — real vectors restored 2026-07-01; mitigation neutralized patternMultiplier
until re-learning). TRAI advisory layer: designed, dormant, has its own phased mission.
→ Order: pattern memory re-learns on real vectors → TRAI advisory (attributed, budgeted)
  → news last, with injection review.

## P7 — EXPERIENTIAL PATTERN MEMORY
The bot remembers its own history per setup: has it seen this setup before, has it
traded it before, on this symbol, in this regime — and prior outcomes adjust
confidence/sizing on the next encounter.

**Current state: EXISTS, RECOVERING FROM CONTAMINATION.**
UnifiedPatternMemory + PatternMemoryBank exist and are scope-keyed per
broker/account/asset/symbol/timeframe ✓ — the memory architecture is real. But it was
fed fabricated feature vectors for months (Fix 18), meaning everything it "learned" was
learned from fiction. M-N (2026-07-01) restored real feature vectors; the pattern
sizing multiplier is deliberately neutralized until memory re-learns on truth.
→ Re-learning period on real vectors (paper/eval), THEN re-enable pattern-driven
  sizing with attribution. Backtest pattern memory stays isolated from live memory
  (operator ruling: no backtest pattern persistence into live stores).

**OPERATOR RULING (2026-07-02): pattern memory is SETUP-KEYED, not symbol-keyed.**
Recognition is symbol-agnostic — "I've seen this mechanical setup before" transfers
across tickers. The symbol enters only at execution: position sizing and stop/exit
geometry scale to that symbol's volatility. Implementation requirement: patterns
must be stored volatility-normalized (ATR-relative, not dollar-relative) for
cross-symbol matching to be meaningful. This retires the per-symbol-memory ambiguity;
DEC-002's "a setup is a setup" stands, refined with volatility-aware execution.

## P8 — UNIVERSE SCANNER
The bot maintains a ticker list and actively hunts it at all times — scanning for
mechanical setups AND remembered patterns, on any configured timeframe, with
higher-timeframe checks boosting whatever it finds. TRAI participates as a context
layer (news, pattern-system additions) on top of the scan. Strategies subscribe to
the scanner's finds; the bot goes where setups are, not just where it happens to be
watching.

**Current state: DEGENERATE FORM ONLY.**
Today's bot is a fixed 5-6 symbol watchlist processing candles per symbol — a scanner
with the hunting removed. Per-symbol scan locks (A2, shipped 2026-07-01) fixed the
serialization lottery within that list, which is a prerequisite. No dynamic universe,
no setup-first scanning, no scanner→strategy subscription flow.
→ Sequencing: this is the LAST layer, deliberately — a scanner multiplies whatever it
  feeds. Feeding it into saturated confidence, generic exits, and unproven strategies
  multiplies losses. Order: strategies proven fee-positive (P1-P3) → confluence honest
  (P4-P5) → memory trustworthy (P7) → THEN the scanner scales the working machine
  across a universe. The 100+ passed-evals inventory vision rides on this layer.

---

## OPERATOR STRATEGY DOCTRINE (rulings, 2026-07-02 — audit code against these; doctrine wins)
- **EMA dual-play:** (a) crossover = regime/momentum context; (b) EMA-as-dynamic-S/R
  pullback entries in trend direction, HTF congruence required. Pullback play is the
  primary entry doctrine (EMATrendRetest / PropSafeEMAPullback embody it).
- **Rubber-band law:** approach velocity into the MA predicts bounce strength —
  snapback/divergence-velocity logic (stripped from EMASMA ~146-168) gets restored
  in-strategy and swept.
- **MA timeframe allocation:** 9/20(/50) on trading TF ≤15m as entry structure;
  50/200 on 1h+ as regime/bias congruence only (see P4 ruling).
- **Regime roster — same level, same event, opposite trade:** BreakAndRetest is
  trending-only (in a range, "breaks" are mostly stop-harvest sweeps that reverse).
  Range regime is LiquiditySweep/SmartMoneySweep's home turf — they trade the failed
  break. Regime decides who's on duty; nobody trades outside their home regime.
- **Mechanical purity law:** NoWickImbalance is ~100% mechanical and ALL newest-generation
  strategies (NoWick, Donchian, TSMOM, RSI2MR, PropSafeEMA, EMATrendRetest, ORB, B&R,
  SMS, FVG) are required to be — deterministic rules, no fuzzy/heuristic scoring creep.
  Audit item per strategy: verify mechanical purity; any discretionary weighting found
  is a defect. This law underpins P7 (setup-keyed memory requires mechanical setup
  signatures to match across symbols) and the white-box business moat.
- **ORB doctrine (operator variant, keys PDH/PDL not just opening range):** first 15m
  candle breaking previous day's high/low arms the play. Entry either (a) wait for
  pullback, enter with trend, or (b) if a fair value gap already sits outside
  yesterday's range (size-qualified in ATRs), enter immediately on displacement.
  AUDIT ITEM: coded OpeningRangeBreakout.js almost certainly implements textbook OR,
  not this — reconcile, doctrine wins. FVG confluence composable via FairValueGapDetector.

---

## STANDING LAWS THAT SERVE THIS SPEC
- Root fixes only; no fallbacks, no defaults, no bandaids (operator doctrine, hookify).
- No agent claim exists without a commit hash + a runnable verification command.
- Venue truth outranks internal truth: broker round-trip proof before any route trades;
  daily journal-vs-broker reconciliation; venue-contract tests per broker.
- The bot's default state is OFF. Trading is earned via the Restart Contract, verified
  by the operator personally.
- Measurement precedes tuning: ttp_real fees + pessimistic execution in every backtest.
  A strategy that cannot beat real costs does not trade, no matter how pretty its logic.
