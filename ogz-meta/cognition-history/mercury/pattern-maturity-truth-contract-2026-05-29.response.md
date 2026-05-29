Initial Mercury result:

- No path found where missing sample evidence or zero observations became `New`.
- Found a real silent-gap path where `recordObservation()` could return a signature but `getPatternStats()` could return no stats, leaving maturity absent after a successful observation write.
- Found a real stale-classification gap: high counts without `lastSeen` could become `Confirmed` or `Mature` because recency evidence was optional.
- Found a dashboard consistency risk where primary pattern fields and `allPatterns` fields were built by separate logic.
- Found no evidence this slice changes strategy selection, confidence scoring, risk checks, order execution, canonical Pattern Card names, or geometry rendering.

Fixes applied after the attack:

- `core/PatternMaturity.js` now requires `lastSeen` before assigning any maturity tier.
- `core/TradingLoop.js` now throws if pattern memory reports a successful observation write but cannot read stats back for the same features and scope.
- `core/TradingLoop.js` now refuses observation writes from pattern memory implementations that expose `recordObservation()` without `getPatternStats()`, so the write side cannot silently outrun dashboard/narrator readback.
- `run-empire-v2.js` now builds the primary pattern and `allPatterns` rows through one shared item builder so maturity/sampleCount cannot diverge between the two representations.

Final recheck result:

- Mercury found no remaining concrete path where missing or zero evidence becomes `New`.
- Mercury found no remaining concrete path where a repeated observed pattern increments `timesSeen` but still lacks maturity/sampleCount.
- Mercury found no remaining concrete path where stale patterns become `Confirmed` or `Mature`.
- Mercury found no trading-decision, risk, or execution consumer for the new maturity fields.
- Mercury found no canonical Pattern Card name/geometry claim in this slice and no new evidence-fabricating fallback.
