# LIQUIDITY-LEDGER-SPEC — teaching the bot the liquidity cycle
Dictated from Trey's dawn synthesis 2026-07-13: "unswept liquidity is a debt
the market must collect; the sweep's aftermath classifies the move; break-
retest is the collection at a manufactured level." Architecture maps the
insight onto existing machinery. SEQUENCING: design banked now; builds enter
per standing law (post-rulings, wire-effect A/B per consumer).

## THE FOUR PIECES

P1. THE LIQUIDITY LEDGER (new component — the only real build; ~200 lines,
    pure candle math, zero new feeds):
    Per symbol, a standing state object updated per candle:
    - UNSWEPT LEVELS: swing highs/lows that were RESPECTED (tap-and-hold,
      Marco L1: high respecting prior highs = liquidity building above)
      and not yet traded through. Metadata per level: side, born-at,
      respect count, distance from price, age.
    - SPENT LEVELS: swept levels (Marco L2/L3 liquidity blocks) — retained
      as stop-placement terrain (no reason for revisit = protection).
    - NAKED POCs from the VP engine (already computed) enter the ledger as
      unswept volume-levels — AMT and Marco vocabularies unified in one list.
    - MANUFACTURED LEVELS: on any structure break, the broken level enters
      the ledger as fresh two-sided liquidity (breakout stops inside,
      fader stops beyond) — the break-retest debt, Trey's third click.
    Same architectural shape as CandlePatternDetector / RegimeDetector:
    a detector service feeding ctx, no trade authority of its own.

P2. SWEEP DETECTION (exists — upgrade, not build): LiquiditySweep and SMS
    already detect sweep events. Upgrade: consume the ledger — a sweep OF
    A LEDGER LEVEL is first-class (the debt being serviced); a wick past
    a random swing is noise. Sweep quality = level's respect count + age.

P3. COLLECTION CLASSIFIER (new, ~50 lines): on sweep of a ledger level,
    classify the aftermath:
    - sweep_rejected: close(s) back inside the level = harvest = the move
      existed FOR the liquidity → counter-trend context fires (Da Vinci
      entry moment; the (H+L)/2 sweep-and-reclaim family generalized).
    - sweep_accepted: N closes holding beyond = the level was fuel for
      continuation → trend context fires.
    Emits events + writes the level spent in the ledger.

P4. CONSUMPTION (all existing architecture — this is why it's cheap):
    a. CONFIDENCE CONTEXT (contextParams multipliers, the standing law —
       no binary gates): sweep_rejected at a ledger level boosts the
       mean-revert/sweep family (LS, SMS, RSI at extremes); sweep_accepted
       boosts the continuation family (BreakRetest, Donchian, ORB, TSM).
    b. VETO CLASS (Marco F3 blue-box law): counter-trend entries between
       price and an unswept ledger level = muted hard (the one place a
       near-gate is doctrine-justified; still expressed as a multiplier
       floor per confidence-as-filter).
    c. TARGET MENU (Lane 6b era): nearest opposing unswept levels = the
       structural target list (Marco D6, Fabio swing targets) replacing
       fixed takeProfitPercent for sweep-family strategies.
    d. STOP TERRAIN (Lane 6b): spent levels/liquidity blocks = stop homes
       (Marco D5, Fabio H4, Trey's terrain trail — third convergence).
    e. DAY-TYPE ENGINE INPUT: magnet bias — the nearest heavy unswept
       level exerts directional pull; pre-market prediction consumes the
       overnight ledger state.

## BUILD ORDER (when it enters, per wire-effect protocol)
1. P1 ledger as observability first: compute + log + (optional) dashboard,
   ZERO trade influence. Its accuracy gets eyeballed against real charts
   before anything consumes it.
2. P3 classifier on top, same observability-only status.
3. P4a/b consumers enter ONE AT A TIME as flag A/B lanes — baseline sweep,
   flag on, delta ledger, Trey rules. No-effect = halt-and-diagnose (the
   enforcement clause).
4. P4c/d ride Lane 6b (exit geometry) when that era opens.
VERDICT STANDARD: the ledger earns trade influence by measured delta, not
by doctrine beauty. The doctrine tells us where to look; the wire-effect
ledger tells us if it pays.
