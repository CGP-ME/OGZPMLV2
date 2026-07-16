# FABIO-ENTRIES-SPEC — delta-print entry zones (source doc 1 of 5)
Source: Trey research archive — Fabio (Deep Charts), "best entries using
orderflow." Extracted 2026-07-13. Companion to ORDERFLOW-CONFIRMATION-SPEC
and the AMT doctrine block (same school: auction market theory + orderflow).

## THE METHOD (entry-zone construction, in order)
F1. DAY CONTEXT FIRST (profile shape): session opens with aggressive
    breakout + ACCEPTANCE beyond value (e.g. below VAL) = trend/imbalance
    scenario — market seeking new balance, expect DIRECTION. This gates
    everything: the entries below are continuation entries WITH that frame.
F2. ANCHORED SWING PROFILE: profile the PREVIOUS SWING LEG (not the day) —
    "this is dynamic" — find where the leg's delta pressure concentrated.
    (= the anchored/event-keyed profiling from the AMT doctrine, applied.)
F3. THE ENTRY AREA = DELTA PRINT: the price band inside that swing where
    (a) heavy one-sided delta executed AND (b) BIG TRADES (large prints)
    supported the volume. Institutional reload zone — "if the move
    continues, aggressive positions reload from this area."
F4. CONFLUENCE UPGRADE: delta-print band + value-area edge (VAH/VAL) +
    big-trades cluster stacking at one price = "super strong area."
    Set the alert there; that is the trade location.
F5. EXECUTION: on approach of the area, watch for the aggressive side
    re-entering (big trades firing again = defenders present) → enter in
    trend direction, STOP just beyond the area ("protect above the area").
    Re-entries valid on subsequent tests while the area holds (fractal —
    same logic on the next swing's profile).
F6. ABSORPTION VARIANT: absorbed counter-side + aggressive with-trend side
    "putting a lock" on price = limit order at the area is justified
    pre-touch (highest-conviction form).
F7. TARGETS: prior swing points; RR 1:2 to 1:5 depending on stop placement
    tightness against the area.
F8. DOCTRINE LINE (source verbatim-adjacent): "the only thing that moves
    price is volume — you need execution for the market to auction." No
    indicator mysticism; entries anchor to where execution actually
    happened.

## OGZ MAPPING
- F1 = the day-type/pre-market prediction engine (already specced tonight).
- F2/F3 = anchored swing profiling + delta concentration — requires the
  CTX-DATA delta feed (crypto true-delta free; stocks tick-rule) + the
  event-keyed VP pass (AMT doctrine advanced tier). Big-trades detection =
  large-print filter on the trade stream (new, small feature).
- F4 = confluence scoring across VP levels + delta bands — the bot's
  existing confluence/confidence architecture is the natural home.
- F5 stop placement = "beyond the defended area" is STRUCTURAL stop
  placement — Lane 6b terrain-aware exit geometry input.
- Nearest existing consumers: SMS (absorption/initiative vocabulary),
  LiquiditySweep (zone + defense logic), BreakRetest (retest of defended
  levels). Same conclusion as the whole CTX-DATA vein: upgrades existing
  hunters from shadow-inference to receipt-reading.
- SEQUENCING LAW: post-walks, post-raw-edge, post-fee-sweeps. Banked as
  design intent, not a build order.
