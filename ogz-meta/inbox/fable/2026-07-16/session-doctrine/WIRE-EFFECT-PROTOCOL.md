# WIRE-EFFECT-PROTOCOL — the auditable regiment for hooking components in
Ordered by Trey 2026-07-13. Governs EVERY wiring lane from now on.
Principle: a wire is not "done" when connected — it is done when its EFFECT
is MEASURED. Baseline → wire → identical rerun → delta = the component's
receipt. No wire lands without its number.

## THE REGIMENT (per component)
STEP 0 — PRECONDITIONS (already landed, this is why they matter):
  - Hermetic backtest env (ec1bce8): ambient env cannot poison either run —
    A=A is PROVABLE, not assumed.
  - One-lane-one-commit law: exactly ONE wire changes between runs.
  - Config fingerprint + commit SHA stamped on every run report.

STEP 1 — BASELINE RUN (the "before"):
  - Dataset: tsla-15m (1yr window; the standing 2y file sliced or full —
    SAME file both runs, byte-identical, hash recorded).
  - Profile: the fee-real sweep profile (fees ON — we measure what survives
    reality, not fantasy). Same profile name both runs.
  - Run the standard sweep (matrix-sweep or single-config backtest as the
    lane requires). Archive: report path, config fingerprint, commit SHA,
    candle-file hash.

STEP 2 — THE WIRE (one component, one commit):
  - PREFERRED MODE — FLAG A/B (same commit): if the component is profile-
    toggleable (ENABLE_DPS, entryEventsOnly, strategy enabled flags,
    pidControl.enabled), land the wire with the flag OFF-by-default, then
    run baseline (flag off) and effect run (flag on) ON THE SAME COMMIT.
    Cleanest possible A/B — zero unrelated drift possible.
  - FALLBACK MODE — COMMIT A/B: when the wire cannot be flagged (structural
    rewires), baseline on parent commit, effect run on the wire commit.
    P0 exactness on untouched lanes remains required as drift detection.

STEP 3 — EFFECT RUN (the "after"): identical invocation, identical dataset
  hash, identical profile, ONLY the wire's flag/commit differs.

STEP 4 — THE DELTA REPORT (the component's receipt):
  net P&L | PF | WR | trade count | maxDD | avg win / avg loss |
  per-strategy breakdown of the same | fees paid.
  VERDICT (one of): MOVED THE NEEDLE (+) / NO EFFECT / MADE IT WORSE (−) /
  CHANGED SHAPE (trade count/mix shifted materially — needs Trey read even
  if net is flat).
  Every delta row appends to ogz-meta/ledger/WIRE-EFFECT-LEDGER.md:
  date | component | mode(flag/commit) | baseline-ref | after-ref | delta
  summary | verdict | Trey ruling (keep on / revert / tune).

STEP 5 — TREY RULES on the receipt. No-effect wires get investigated
  (wired-but-not-consumed is the house disease — a flat delta on a
  supposedly live component is a finding, not a shrug). Negative wires
  revert or queue for tuning. Positive wires keep their flag ON in the
  profiles Trey names.

## LAWS
L1. One wire per measurement. Two components between runs = zero receipts.
L2. Fee-real always. A component that only helps fee-free is not help.
L3. The delta is the claim. "Wired in" without a delta row = NOT DONE.
L4. No-effect is a first-class result — it catches decorative wiring
    (TakeProfitChecker-class) at birth instead of months later.
L5. Dataset hash + config fingerprint + SHA on every row — the ledger must
    be re-runnable by anyone, forever.
L6. Expansion after single-ticker proof: multi-ticker (NVDA/SPY/QQQ) and
    walk-forward windows are the SECOND pass for components that moved the
    needle — robustness after effect, not instead of it.

## IMMEDIATE APPLICATIONS (the queue, in manifest-lane order)
- Lane 8a EMASMA events-mode: flag A/B (entryEventsOnly false→true) —
  the churner-vs-events question gets its number.
- Lane 8b EMATrendRetest wake: flag A/B (enabled false→true) — the benched
  module's first-ever receipt.
- Lane 3 DPS: flag A/B (ENABLE_DPS) — the four-month wire measured on arrival.
- Lane 1 TakeProfitChecker: commit A/B — does giving TP exits a voice move
  anything?
- Lane 4 PID outputs: flag A/B (pidControl.enabled).
- regimeBoosts magnitudes: sweep-grid the table values (1.15/0.85 are
  hand-set folklore until a delta says otherwise).
- Per walk verdicts: every re-enabled/re-configured strategy enters through
  this protocol. No exceptions.
