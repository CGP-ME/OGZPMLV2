# FABIO-LIQUIDITY-SPEC — book liquidity mechanics + heatmap patterns (doc 2 of 5)
Source: Trey research archive — Fabio (Deep Charts), liquidity heatmap
foundation. Extracted 2026-07-13. Companion to FABIO-ENTRIES-SPEC,
ORDERFLOW-CONFIRMATION-SPEC, AMT doctrine.

## MICRO-MECHANICS (the physics everything else stands on)
M1. Two forces only: AGGRESSIVE market orders (eat liquidity, pay spread,
    "fill me now" — time certainty, price uncertainty) vs PASSIVE limit
    orders (offer liquidity — price certainty, no fill certainty). Their
    matching IS price movement: aggression exceeding a level's passive
    size steps price to the next level until demand is filled.
M2. BOOK SLOPE = PATH OF LEAST RESISTANCE: fixed effort moves price toward
    the side with LESS total passive liquidity. Sum the resting size above
    vs below; the thin side is where price travels easiest. Core
    short-horizon directional read.
M3. Retail liquidity heuristics (stops above highs/below lows) are only
    ~60-70% accurate because they GUESS where liquidity rests; the book
    shows it. (Relevant to LiquiditySweep: its price-derived sweep levels
    are the guessing version of this read.)

## BOOK PATTERNS (order book / DOM level)
B1. BID RELOAD: large passive size appearing with-trend in compression =
    someone big wants filled; algos front-run it → price magnetized to it.
    CAVEAT: classic spoofing vector (orders not meant to fill) — treat as
    probability info, not certainty.
B2. ICEBERG (invisible liquidity): small displayed size refilling
    endlessly as it's consumed — hundreds of reloads behind an 8-lot.
    Needs reload-detection (repeated refills at one price), not raw size.
B3. BOOK SWEEP: fast consumption of stacked levels near session/range
    extremes — entry with asymmetric RR (risk ticks, make multiples).
B4. BOOK FLIP: liquidity walls migrating to CLOSE the door behind price
    (e.g. loading above as price falls) = confirmation of continuation →
    trail stops behind the flipping walls / add.

## HEATMAP SETUPS (pattern playbook)
H1. BUYERS RELOAD + ABSORPTION at a resting wall (with-trend): mean-revert
    off the protection wall; repeated absorbed strikes (3x in example) =
    defended; targets = opposing liquidity levels.
H2. RELOAD-THEN-AGGRESSION at a level: passive reload + aggressive orders
    same side same time = intent to FUEL a move → high-probability
    break-and-retest; enter breakout protected below the reload wall;
    TP ladder = successive resting-liquidity areas.
H3. SELLERS RELOAD mirror of H2.
H4. STOP PLACEMENT LAW: cover beyond the NEXT liquidity wall, not the
    naive swing low — walls are where defense happens; stops inside the
    accumulation zone get spiked out. (Lane 6b terrain input, book edition.)
H5. THE GRILL (multi-wall consumption): aggression slicing through stacked
    walls = sustained move; each consumed wall = partial-profit point;
    exhaustion likely at the final cluster → reversal risk there.
H6. AGGRESSIVE BREAKOUT + FRESH RELOAD BEHIND IT = sustain intent (not
    absorption) — probability booster for break-retest continuation.
H7. LIQUIDITY CLUSTER WALL / FAILED AUCTION: repeated strikes absorbed at
    a stacked wall, second attempt can't exceed first = failed auction →
    reverse toward path of least resistance.
H8. CLUSTER OVERRIDES SINGLE WALL: absorption at one level BELOW a 4-deep
    stacked cluster higher = the single wall likely gets filled through;
    don't short into it. Depth structure outranks single-level reads.
H9. FUEL-SIDE ASYMMETRY (stoookie grill): fresh liquidity repeatedly added
    BEHIND the move (fueling) with NOTHING protective on the far side =
    directional conviction read.
R1. SCOPE LAW (source's own): this is MICRO-mechanics — always requires
    higher-timeframe frame/bias first (profile, VWAP, IVB, statistical
    levels). Book patterns confirm/execute a framed idea; they are not
    the idea.

## OGZ MAPPING
- FEED: this doctrine requires DEPTH data (book levels over time), not just
  trades — crypto venue: free full-depth websockets (Kraken/Binance), the
  CTX-DATA lane's book-imbalance item is this spec's ingest. Equities
  depth: deferred-until-funded (TotalView-class), tick-rule delta only.
- CONSUMERS: LiquiditySweep upgrades from price-guessed sweep levels to
  observed liquidity walls (B3/H7 are literally its thesis measured);
  SMS absorption logic gets book-confirmed (H1/H7); exit geometry gains
  H4 (stops beyond walls) + H5 (partials per consumed wall) for Lane 6b;
  path-of-least-resistance (M2) is a directional-confidence context input.
- ARCHITECTURE: all of it enters as confidence context per the standing
  law — book patterns boost/mute framed signals, never originate them (R1
  aligns exactly with confidence-as-filter).
- SPOOF CAUTION (B1) encoded: displayed size is intent-claims, executed
  prints are receipts — weight prints > book, consistent with
  ORDERFLOW-CONFIRMATION-SPEC's price>delta hierarchy.
- SEQUENCING LAW: post-walks, post-raw-edge, post-fee-sweeps.
