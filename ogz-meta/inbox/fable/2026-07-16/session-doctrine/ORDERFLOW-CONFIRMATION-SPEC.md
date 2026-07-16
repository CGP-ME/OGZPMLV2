# ORDERFLOW-CONFIRMATION-SPEC — canonical rules from source
Source: Trey research archive — funded prop trader interview (footprint/delta
method, $150K+ funded, E-mini S&P). Extracted 2026-07-13.
Nature: NOT a strategy — a CONFIRMATION LAYER over any location-based strategy.
Source's own claim: "whatever your strategy is, order flow as confirmation
improves win rate significantly." Maps 1:1 to OGZ confidence-as-filter doctrine.

## THE PROTOCOL (in priority order — source repeats: location > all)
R1. LOCATION FIRST (non-negotiable). No signal means anything at a random
    price. Zones marked top-down: 4H zones → refine 1H → 15m → execute 5m.
    Zone anatomy (impulse-rest-impulse):
      demand: impulse green + rest candle(s) + impulse green
      supply: impulse red + rest + impulse red
      support flip: impulse red + rest + impulse green
    Base = ALL rest candles (flag), always using FULL wicks of the base.
    Mitigated (broken-through) zones are dead. Multiple prior touches do NOT
    invalidate a zone — but no touch is tradeable without confirmation.
R2. TIMING: session-scoped. Trade only during chosen session (source: first
    hour after NY open). Zones marked PRE-session; pre-session S/R can be
    invalidated by the open — the tradeable event is the first post-open
    touch of a pre-marked zone.
R3. CONFIRMATION: footprint/delta at the zone, entry only AFTER the
    confirmation candle CLOSES. Never on the touch itself.

## DELTA RULES (per candle: delta = market buys − market sells)
D1. Aligned readings are ordinary: green candle + positive delta = bullish,
    red + negative = bearish. No special signal.
D2. TRAPPED-TRADER DIVERGENCES are THE signal:
    - At SUPPORT/demand: BULLISH candle + NEGATIVE delta = heavy sellers
      absorbed, sellers trapped → BUY above candle high, SL below candle low.
    - At RESISTANCE/supply: BEARISH candle + POSITIVE delta = heavy buyers
      absorbed, buyers trapped → SHORT below candle low, SL above high.
D3. PRICE OUTRANKS DELTA, always. Never counter-trade candle color because
    delta disagrees — the divergence signals strength of the PRICE side,
    not the delta side.
D4. Footprint shows MARKET orders only; limit orders live in the DOM
    (separate instrument, not required by this protocol).

## FOOTPRINT SHAPES AT ZONES (intra-candle volume distribution)
S1. P-shape at RESISTANCE after a run-up = short signal (SL above high).
S2. b-shape at SUPPORT after a decline = buy signal (SL below low).
    (Distinct from the day-profile P/b in the AMT doctrine — same logic,
    candle scale.)

## EXITS / RR
E1. Starting standard: fixed 1:2 RR minimum, every trade.
E2. Advanced: targets = next roadblock (opposing zone) on the 5m map.

## SCOPE NOTES
- Works for reversal AND continuation (uptrend → trade demand zones;
  downtrend → trade supply zones). Higher-timeframe trend not required
  for the day-trade horizon.
- "SMC / supply-demand / order flow are the same thing packaged
  differently" — source's own words; aligns with OGZ's SMS/LS vocabulary.

## OGZ MAPPING (for the CTX-DATA / confirmation-layer era — post-walks)
- LOCATION: already computed — SMS zones, LiquiditySweep boxes, BreakRetest
  levels, VP HVN/LVN + naked POCs (AMT doctrine). The zone inventory exists.
- DELTA FEED: crypto = TRUE delta free (Kraken/Binance taker-side tags);
  stocks = tick-rule approximation from Alpaca quotes+trades (CTX-DATA lane).
- ARCHITECTURE: confirmation = confidence multiplier at entry (Trey's
  confidence-as-filter law). A zone-touch signal WITHOUT confirmation gets
  muted, WITH trapped-trader divergence gets boosted. No binary gates.
- ENTRY MECHANICS: "buy above confirmation-candle high / SL below its low"
  = a stop-entry trigger pattern; OGZ currently enters market-on-signal —
  adopting trigger-style entries is a Trey intent decision, noted not assumed.
- SEQUENCING LAW (manifest): blocked behind walks + raw-edge proof + fee
  sweeps, same as all CTX-DATA items.
