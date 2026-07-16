# FABIO-IVB-SPEC — initial balance breakout, statistically armed (doc 5 of 5)
Source: Trey research archive — Fabio/Deep Charts, "deep statistical
analysis orderflow" (the IVB model — the one independently audited by a
market maker per doc 4). Extracted 2026-07-13. This is the CAPSTONE doc:
it composes everything from docs 1-4 + the AMT doctrine into one concrete,
backtestable model built on a published-1990 edge (Crabel ORB).

## THE BASE EDGE (statistical foundation)
V1. ORB/IVB: first 15/30/60min of the cash session = the day's
    highest-volume battle. The side that breaks the range first won it —
    statistically predictive of day direction up to a measurable
    excursion level. Positive PF standalone since Crabel 1990. (OGZ
    already has OpeningRangeBreakout — this doc is its upgrade path.)
V2. Session-type distribution matters: the same range logic INVERTS
    inside the range — until a true break, fade top/bottom (mean-revert
    on absorption/exhaustion at the extremes); after acceptance, go with
    (trend). One structure, two regime-conditional models — the
    balance/imbalance teams trading THE SAME LEVELS.

## MODEL 1 — IVB + VOLUME PROFILE (location upgrade)
M1. Define IB top/bottom (A/B). Fixed-profile the IB window: find its
    internal POC + value area.
M2. On breakout + acceptance beyond the range: the band between value
    area edge and the IB POC = "the real block of orders" — the reload
    zone where the winning side defends on retrace. Entry there, not at
    the naive breakout price → materially better RR (1:2-2.5 vs 1:1).
M3. INVALIDATION IS STRUCTURAL: candle CLOSE accepting back through the
    opposite value edge kills the setup — you exit on auction failure,
    not at a distance-based stop. (Lane 6b: this is what
    invalidationConditions were born for.)

## MODEL 2 — IVB + ORDERFLOW TRIGGER (timing upgrade)
M4. After breakout, on the retrace into the M2 band: require the
    orderflow confirmation — aggressive counter-side hitting the zone
    with ZERO price result (absorption at the IB POC), or counter-side
    exhaustion + with-trend aggression at the level. Then enter tight.
    (= ORDERFLOW-CONFIRMATION-SPEC D2/D3 + FABIO-ENTRIES F5, applied at
    a statistically-defined level.)

## MODEL 3 — STATISTICAL TARGETS (the "deep analysis" layer)
M5. Years of data mined for post-IB-breakout excursion distributions →
    TP1 = the excursion level hit with 65-70% probability, TP2 = lower-
    probability extension. Targets from measured session behavior, not
    hope. (= doc-3 K6 statistical exits, productized. For OGZ: the
    excursion study is a BACKTESTABLE research task on existing candle
    data — no orderflow feed required for the target layer.)
M6. Division of labor: statistics own direction-probability + targets;
    the trader (or bot's confidence stack) owns location + confirmation.

## OGZ MAPPING (the richest of the five)
- OpeningRangeBreakout module: currently a naive-break model. Upgrade
  ladder IN ORDER OF DATA DEPENDENCY:
  (a) M5 excursion-distribution study on existing TSLA/NVDA/SPY 15m data
      → statistical TP levels for ORB. NO new feeds needed. Sweepable now.
  (b) M1/M2 VP-band entries: IB-window fixed profile → POC/VA band entry
      on retrace. Needs only the VP engine ALREADY WIRED. No new feeds.
  (c) M3 structural invalidation → exit contract invalidationConditions
      (value-edge re-acceptance) — Lane 6b input.
  (d) M4 orderflow trigger → CTX-DATA delta feeds (crypto free/true,
      stocks tick-rule). The only stage needing new data.
  Stages (a)-(c) are buildable from what exists TODAY — the highest-value
  no-new-data upgrade identified in the entire five-doc series.
- V2 = the AMT day-type engine consuming ONE structure: IB range as the
  balance box; inside = mean-revert team, accepted-outside = trend team.
  Concrete implementation of the balance/imbalance roster split.
- Walk implication: the ORB walk (upcoming) grades the existing module
  against this spec — what it has, what stages (a)-(d) it's missing.
- SEQUENCING LAW: stages (a)-(b) are legitimate sweep-era work (no new
  feeds); (d) stays post-walks/post-fee-proof per the standing law.
