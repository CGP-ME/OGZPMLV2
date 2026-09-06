# REVIEW — MISSION 0: STOP 1 LEAF MANIFEST

Disagreements between frames, how each was adjudicated, and the caveats a cold-puller should press on.

## Adjudicated disagreements

### 1. DynamicTrailingStop (Z0006–Z0012)
- **Census-recon agent:** claimed the TRAIL_* env keys reach a live DynamicTrailingStop bypass.
- **Literals-core-B agent:** claimed DynamicTrailingStop is an unwired class.
- **Adjudication (CC, grep on HEAD):** zero live `require` of DynamicTrailingStop in core/, modules/, run-empire-v2.js. Its logic was lifted into ExitContractManager (`_updateTrailingStopState`); the live trail config is `exitLogic.trail` (env-backed, ConfigLoader.js:2860–2875). Core B correct. Z0006–Z0012 corrected to live_path=none with "CORRECTED at assembly" notes.

### 2. exitContracts source-of-truth class (X surface)
- Early X rows were written on the assumption the whole exitContracts JSON block is BASE_CONFIG-shadowed (true for the older contracts).
- **Post-compaction re-read of ConfigLoader.js:2770–2778** proved the five newest contracts (PropSafeEMAPullback, EMATrendRetest, RSI2MeanReversion, TimeSeriesMomentum, NoWickImbalance) are `requiredConfiguredPlainObject` — the JSON is their live source. X rows carry the distinction per contract (`INERT-shadowed by ConfigLoader.js:NNNN` vs `LIVE - required from JSON, ConfigLoader.js:NNNN`).
- **Consequence for the surgery:** a config-cut that treats all of exitContracts as decorative would silently change live behavior for those five strategies. This is the single most load-bearing correction in the manifest.

## Findings a cold-puller should verify first

1. **Rebuilt sections are single-sourced.** X0177–X0301 and P0001–P0582 were rebuilt post-compaction by CC alone from disk reads (receipts in EVIDENCE.md). Everything else had a Sonnet enumeration pass + CC assembly. The rebuilt rows are the natural place to hunt for error.
2. **Denominator deltas** (1,654 vs 1,692; 77 vs 73) are explained as array-element accounting but NOT proven — a cold count of trading.config.json leaves under a stated counting rule would settle it.
3. **"same accessor as P00xx" / "same SL reader set as X0001" references.** Reader compression is used inside the P and X sections (a key's accessor is identical across profiles/contracts by construction — one ConfigLoader call site serves all). Verify the anchor rows (P0002–P0084, X0001–X0015) and the compression holds or falls with them.
4. **Nine dead invalidation labels.** JSON-configured condition strings with no dispatcher case (list in EVIDENCE.md). Each is a row-level ruling: dead string to delete, or missing case to implement. Manifest does not decide; rows carry the fact.
5. **backtest-ttp-5k-max misnomer** (P0438): profile named for TTP but `venueGuards.ttp.enabled=false`. Either the name lies or the value does — owner call.
6. **Sonnet enumeration under Ruling 8.** Enumeration/readers ran on auxiliary Sonnet frames. Dispositions are mechanical copies from the ruled sort (or HOLD), and CC (Fable seat) owns the column — but the *reader* columns from those 12 agents were spot-checked, not exhaustively re-derived. The Z-section reconnaissance rows exist precisely to cross-check the literal-surface agents against Codex's census.

## Self-review verdict

The manifest is complete against its own totality checks (every top-level key covered, sums reconcile, no blank readers, no missing columns). Its two known soft spots are named above (#1, #2). Nothing in the manifest is a guess: every unplaceable leaf is HOLD-NEEDS-OWNER (340 rows), every claimed reader has a file:line, and every corrected row says it was corrected.
