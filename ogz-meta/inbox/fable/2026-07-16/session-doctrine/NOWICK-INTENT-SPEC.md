# NOWICK-INTENT-SPEC — canonical source rules
Source: B Effects "compensation play" via backtest video transcript (Trey-supplied 2026-07-11)
Purpose: grading document for the NoWickImbalance strategy walk. Code is graded
against THIS, not against what the code currently does.
Source performance context: ~60 trades / 4 asset-months, 55-62% WR at 1:1 RR,
fees NOT counted. OGZ campaign actual: 30,751 trades — 3 orders of magnitude
mismatch. Primary walk question: which filters exist and gate.

## SETUP DEFINITION
Wickless candle (LONG): GREEN candle with NO bottom wick. Top wick OK, no wicks OK.
Wickless candle (SHORT): RED candle with NO upper wick. Bottom wick OK, no wicks OK.

## ENTRY RULES (all eight must pass)
R1. Wickless candle present (above definition).
R2. TREND: longs only in uptrend, shorts only in downtrend. Source used
    BOS/CHoCH structure (LuxAlgo SMC): break of structure = recent swing
    high/low broken by candle CLOSE; trend holds until opposing BOS/CHoCH.
R3. RETURN WINDOW: within 9 candles after the wickless candle, price must
    touch INTO the zone beyond the wickless candle's flat end (below its low
    for longs, above its high for shorts). Touch = entry. No touch in 9
    candles = setup expired.
R4. SESSION FILTER: no entries during first 3 hours of Asian session
    (Tokyo 09:00-12:00 JST).
R5. NEWS FILTER: no entries within ±2 hours of red-folder news affecting
    either currency of the pair (source: ForexFactory calendar).
R6. IMBALANCE/FVG FILTER: no UNFILLED imbalance AGAINST the trade within a
    40-candle lookback. Against = below entry (longs) / above entry (shorts).
    Filled if price covered >= HALF the gap. EXEMPT if the imbalance sits
    inside the stop-loss range.
R7. SWING-POSITION FILTER: reject wickless candles formed at the LOWEST point
    of the swing (uptrend) / HIGHEST point (downtrend).
R8. NEAR-TOUCH INVALIDATION: if price came close to the zone without touching,
    moved away, and returns later — entry is invalid.

## EXITS / SIZING
SL: slightly beyond recent extreme (10-candle lookback; extend to 15 if SL
    lands too close to entry), ~10-20 pips beyond.
TP: 1:1 risk-reward. (Source: raise to 1:2/1:3 only with experience.)
SPLIT RULE: two adjacent wickless candles both triggered on the same candle
    = two half-size positions at their respective levels.

## CONTEXT
Timeframe: 15m. Source assets: USDJPY, GBPUSD, gold (forex/CFD).
OGZ adaptation questions for Trey during the walk: session filter mapping for
stocks/crypto venues; news filter feasibility; BOS/CHoCH implementation vs
whatever trend proxy the code uses; whether 1:1 RR survives $1.50+ TTP fees
(the fee-war class — 1:1 scalps at 55-62% WR are marginal BEFORE fees by the
source's own numbers).

## WALK CHECKLIST (code vs this spec)
[ ] R1 wickless definition exact (no-bottom-wick math, float tolerance?)
[ ] R2 trend gate exists and gates (what defines trend in code?)
[ ] R3 9-candle window exists (or does it enter immediately/forever?)
[ ] R4 session filter exists
[ ] R5 news filter exists (expected: absent — note as intent decision)
[ ] R6 imbalance filter w/ 40-lookback + half-fill + SL exemption
[ ] R7 swing-position rejection
[ ] R8 near-touch invalidation
[ ] SL/TP: 10-lookback SL + 1:1 TP vs whatever exit contract does
[ ] Split-position rule
[ ] TRADE COUNT RECONCILIATION: which missing/dead filters explain 30,751
