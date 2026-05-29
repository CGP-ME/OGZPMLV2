Mercury attack request: Pattern maturity truth contract

Context:
We are changing the Pattern Card / narrator maturity contract so the dashboard stops showing every detected pattern as "New" when no sample evidence exists.

Exact files and ranges to attack:
- core/PatternMaturity.js:1-94
- core/TradingLoop.js:1208-1246
- core/UnifiedPatternMemory.js:827-950
- run-empire-v2.js:2720-2840
- core/TradeNarrator.js:355-395
- test/pattern-maturity.test.js:1-51
- test/trade-narrator-no-emoji.test.js:140-176

Architecture intent:
- Missing pattern sample evidence must not become "New".
- A real count of zero observations must not become "New".
- "New" starts at one real observation.
- TradingLoop should stamp detected patterns from actual UnifiedPatternMemory stats after recordObservation/getPatternStats, not from invented dashboard defaults.
- pattern_analysis frames should include maturity/sampleCount only when maturity evidence exists.
- TradeNarrator.patternSpotted should omit maturity text and maturity payload fields when evidence is missing.
- This slice does not solve canonical TA naming or geometry rendering; do not treat Gap B as fixed.
- This slice must not alter signal decisions, confidence, order execution, exits, or pattern-memory scoring. It is telemetry/narration metadata only.

Attack questions:
1. Construct an input pattern with no sample/memory evidence that still produces dashboard or narrator maturity "New".
2. Construct an input pattern with zero observations that still produces maturity "New".
3. Construct a repeated observed pattern where recordObservation increments timesSeen but pattern_analysis or narrator still lacks maturity/sampleCount.
4. Construct a stale old pattern where lastSeen is older than the stale window but the frame says Confirmed or Mature.
5. Find any path where the new maturity stamping mutates pattern fields used by strategy selection, confidence scoring, risk checks, or order execution.
6. Find any dashboard frame where primary pattern maturity and allPatterns maturity disagree for the same pattern object.
7. Find any place this change claims to fix canonical Pattern Card SVG names or geometry without real canonical names/geometry being emitted.
8. Find any new fallback/default/string substitution introduced by this change that makes backend evidence look more complete than it is.

Return concrete file:line findings only. If a claim is theoretical, provide the exact call sequence needed to trigger it.
