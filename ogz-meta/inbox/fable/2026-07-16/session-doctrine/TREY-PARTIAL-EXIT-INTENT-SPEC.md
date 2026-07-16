# TREY-PARTIAL-EXIT-INTENT-SPEC — the original design, dictated 2026-07-13
Source: Trey, verbatim intent (pre-dating his regime/AMT knowledge — see
upgrade note). This is the DESIGN the partial machinery was always supposed
to implement. MPM was the cancerous implementation of THIS valid concept
(standing record). Lane 6b input.

## THE DESIGN (two mechanisms)
P1. RISK-NEUTRALIZATION PARTIAL (the 50% sale):
    Trigger is NOT a fixed percent. It is the RISK-FREE POINT: the price
    at which selling 50% of the position realizes enough profit that the
    trade as a whole can no longer lose — the realized half covers the
    worst-case outcome on the remaining half (stop distance), INCLUDING
    ALL FEES (entry fees already paid + exit fees on both the partial and
    the eventual remainder exit). Fees push this trigger materially
    further from entry — the fee-blind version fires too early and locks
    a net-negative "breakeven."
    Formula shape: partial fires at price p where
      0.5·qty·(p − entry) − fees_total ≥ 0.5·qty·(entry − stop)
    i.e. realized gain ≥ remaining risk, fee-true.
P2. TERRAIN-AWARE TRAIL ON THE REMAINDER:
    The surviving 50% runs with a DYNAMIC trailing stop that is
    STRUCTURE-MODULATED:
      - TIGHTENS as price approaches support/resistance (reversal
        territory — defend gains where reversals actually happen)
      - OPENS UP between levels (open space — let it breathe, don't get
        wicked out mid-run)
    In tonight's AMT vocabulary (which Trey acquired AFTER designing
    this): tighten at HVN walls / value edges / flipped POCs; loosen
    through LVN air pockets. The design IS the HVN/LVN doctrine applied
    to exits — invented independently from first principles.

## KINSHIPS (banked groundwork this converges with)
- FABIO X7: trail by structure + exit on structure-break confirmed by
  counter-volume — same instinct, orderflow edition.
- FABIO K6/M5: statistical exits at average-move levels — candidate for
  SETTING the partial's minimum distance when the risk-free point sits
  inside noise.
- FABIO-LIQUIDITY H4/H5: stops beyond walls, partials per consumed wall —
  the book-data edition of P2.
- BreakAndRetest module doctrine (PT1 scale-50%, run rest): same shape,
  strategy-local instance of this global design.
- AMT doctrine terrain law: targets die inside HVNs, accelerate through
  LVNs — P2's modulation map, already wired via VolumeProfile.

## UPGRADE NOTE (Trey's own caveat: designed pre-regime-knowledge)
Regime overlay now available: partial aggressiveness can be
regime-conditional — ranging/balance: take the partial eagerly (mean
reversion will give it back); trending/imbalance: risk-free point still
fires but trail opens wider (P-day lets runners run). Consumes the
existing regime layer + AMT day-type engine. Trey ruling on whether the
overlay is wanted v1 or later.

## IMPLEMENTATION CAUTIONS (the trauma record)
C1. The June 4 partial-accounting repin (cfca5a57, −$3,255) proved the
    ACCOUNTING layer is where partials kill: realized-PnL attribution,
    position-size mutation, P0 anchor integrity. Any implementation
    must be execution-confirmed (the post-MPM law: StateManager mutates
    only from confirmed executions) with its own red tests on the
    accounting math before any behavior test.
C2. DynamicTrailingStop.js EXISTS in core/exit/ (P2's natural home) but
    carries EXIT-HIGH-02 (TRAIL_* env chains at :41-50 — hidden-default
    disease, on the reconciliation STILL-PRESENT list). It gets cleaned
    in the same lane that implements P2, not before, not silently.
C3. ProfitExitPlanner (stateless, emits exit_partial intents) is the
    post-MPM implementation seat — P1 belongs there as a planner rule,
    NOT as a new manager class. No new MPMs.
C4. Sequencing: Lane 6b (exit geometry) era, post-walks, wire-effect
    protocol applies — partial ON vs OFF is a flag A/B with the delta
    ledger deciding, per strategy.
