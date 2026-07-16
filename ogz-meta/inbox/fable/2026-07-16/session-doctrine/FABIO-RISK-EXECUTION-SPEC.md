# FABIO-RISK-EXECUTION-SPEC — compounding risk model + execution discipline (doc 3 of 5)
Source: Trey research archive — Fabio Valentini interview (Robbins World Cup
scalping podium: 68% / 88% / 218% quarters, ~500 trades/cup, <20% maxDD).
Extracted 2026-07-13. Highest kinship doc yet: his laws are OGZ's laws
independently derived by a human at world-championship level.

## RISK MODEL (the 218% architecture)
K1. COMPOUND FROM DAY-PROFITS, NEVER FROM BASE: start day risking 0.25%/trade
    at 1:3-1:4 RR. After banking early winners (~3%), set most aside (2%),
    redeploy the remainder at elevated risk (0.5% → later 2-2.5% shots
    FUNDED ENTIRELY BY THE DAY'S PROFIT). Worst case = flat on the day.
    Escalation across the quarter is also profit-funded, gradual
    (0.25→0.35→0.40), never conviction-funded.
K2. THREE STOPS = DONE FOR THE DAY. A 3-loss streak means the ENVIRONMENT
    is wrong for the model (consolidation), not that the next trade is due.
    Stop trading; tomorrow one good trade covers it.
    [OGZ note: this is a DAILY-LOSS HALT expressed as consecutive-stop
    count — relates directly to the open daily-loss fail-open ruling.]
K3. RETURN = f(edge, FREQUENCY, risk): with high execution count you
    compound small edges at low risk (his way, low DD); low-frequency
    models can only raise risk (gambling shape). Sample size IS the
    drawdown control.
K4. WIN RATE > HOME RUNS: statistical analysis (MAE study) killed his
    ride-the-wave trailing approach — big explosive days are RARE; daily
    compounded small profits beat waiting for 1:10s. Monte Carlo on
    1:30-chasing shows 30-40 trade losing streaks — psychologically and
    mathematically untenable. Minimum 1:2 RR, ~50% WR, balance.
K5. COMMISSIONS = ~10% OF PROFIT even at world-cup level ("218% was really
    240%"). Fee-reality kinship: OGZ's fee wall is the same force at
    smaller scale; his answer was frequency×small-edge WITH fees priced in.
K6. STATISTICAL EXITS: know the session's deviation probabilities (e.g.
    3rd VWAP std dev reached in only ~7% of sessions → TAKE the 1:3, don't
    hold for the 7% event). Average-range-based partials (take at the
    average move, not the dream move).

## EXECUTION MODEL (the four-box checklist)
X1. NARRATIVE/BIAS: price structure = the RESULT of volume — direction of
    the day from structure breaks/acceptance (AMT for volume traders).
X2. POINT OF INTEREST: not a zone — a LEVEL: inside the demand/supply area,
    find the price of maximum aggression (peak volume/delta) — one
    horizontal line. (= FABIO-ENTRIES delta-print, restated.)
X3. TRIGGER: order flow aggression AT the POI in bias direction — volume
    pushing AND price following through. NEVER the initial touch ("falling
    knife" — first-move reversal catching ≈5-10% probability). React,
    don't predict; join pressure, don't fade it.
X4. CONFIRMATION STACK before entry: structure ✓, POI ✓, orderflow
    aggression ✓, price follow-up ✓ (+ CVD pressure, VWAP deviation
    location). Boxes ticked = known-edge trade (~1:3 @ 50%). Untinked =
    no trade. [= OGZ confidence-as-filter checklist, human edition.]
X5. TIMEFRAME CASCADE: 15m bias → 1m refine → 15s execution (or volume/
    range bars when tape is gappy/thin — removes time, shows the battle).
    Futures-only luxury (no spread); the cascade is the structure.
X6. NO OPENING TRADES: skip the first minutes of session (volatility too
    big for tight stops); trade after INITIAL BALANCE forms, then trade
    the breakout direction of the balance.
X7. TRAIL BY STRUCTURE+VOLUME: trail stop with the move; exit on structure
    break CONFIRMED by aggressive counter-volume (his stats: that combo
    → high stop-out probability; banking 1:1.5 early beats donating the
    runner). Break-even applied once aggression confirms, not instantly —
    let the market breathe unless volatility is immediate-reaction type.
X8. REVERSALS ARE A PRIVILEGE: only taken WITH day-profit banked AND at
    statistical extremes (2nd+ std dev), targeting fair value (session
    POC = highest-probability magnet). His reversal stats: ~40% @ 1:2.5
    vs trend-following 50-60% — reversals are competition-mode extras,
    not the business.
X9. ONE ASSET, ONE POSITION: focus is finite; he dropped intermarket
    correlation models (edge decayed) for depth on one asset. Statistical
    self-knowledge of ONE instrument > breadth.

## OGZ MAPPING
- K1 → position-sizing era: profit-funded risk escalation is a PID/sizing
  policy candidate (risk multiplier keyed to realized day P&L, floor at
  base risk). Matches Trey's confidence-as-multiplier instinct.
- K2 → the daily-loss guard ruling (currently fail-open on stale anchor):
  consecutive-stop count is anchor-free — needs no TTP date to work.
  Candidate secondary guard answering the open Mercury finding.
- K3/K4 → strategy roster philosophy: OGZ's high-frequency small-edge
  shape is the RIGHT shape per the man who won with it — IF fees are
  priced (K5) and RR floors hold (the exit-shape P2 work).
- K6/X8 → session VP POC as reversal target + VWAP std-dev context =
  CTX-DATA items already logged; his usage supplies the probability
  framing.
- X2/X3 → LiquiditySweep/SMS upgrade path (delta-print POI + aggression
  trigger), same as FABIO-ENTRIES.
- X6 → initial-balance awareness for session strategies (ORB is literally
  this; the skip-the-open rule is config ORB already half-has).
- X7 → Lane 6b: structure-break + counter-volume as exit condition beats
  blind trailing percentages; his MAE finding IS Trey's amputated-winners
  P2 finding from the other side (don't hold for home runs ≠ amputate at
  +1%; the answer is statistical exits at average-move levels).
- SEQUENCING LAW unchanged: post-walks, post-raw-edge, post-fee-sweeps.
