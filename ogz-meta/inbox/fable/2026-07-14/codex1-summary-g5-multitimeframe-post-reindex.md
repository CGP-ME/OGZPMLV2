# codex1: G5 MultiTimeframe logic attack post-reindex

## Index Contract

- Index timestamp: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD attacked: a476afbed787c79a210f427a8509afa11123f9a0
- Chunk count: 10155
- Freshness ruling: PASS. The index matches HEAD, so this report is not stale against lane-relevant code.

## Verdict

incoherent

The first Mercury pass had citation defects and overclaims, so I am not accepting it wholesale. Fable forced the load-bearing claim through a focused recheck. The recheck confirmed the core break: the config declares that 1h and 4h must be ready for MultiTimeframe, but the scoring path aggregates whatever timeframes are currently ready and the orchestrator does not enforce the configured higher-timeframe readiness before scoring or voting.

That breaks the strategy thesis. This is supposed to be a higher-timeframe confluence strategy; the landed code can score and vote from lower-timeframe readiness alone.

## Two-Tier Result

- Mercury Pass 1: `incoherent`.
- Mercury Pass 1 telemetry: tool_calls=12, succeeded=12, failed=0; tools=grep:1/1/0, list_files:1/1/0, open_file:9/9/0, search:1/1/0.
- Fable Review: `found_break`.
- Fable challenge: Mercury cited impossible line numbers in `modules/MultiTimeframeAdapter.js`, overclaimed exit-contract absence from the vote function alone, and drifted into wiring findings.
- Mercury Recheck: confirmed the actual confluence aggregation site and confirmed no `requireHigherTFReady` guard before scoring.
- Mercury Recheck telemetry: tool_calls=9, succeeded=9, failed=0; tools=open_file:7/7/0, search:2/2/0.

## Tier Disagreements

Fable rejected or narrowed these Mercury claims:

- `getConfluenceScore()` citations at lines 736-739 and 754-791 were impossible because `modules/MultiTimeframeAdapter.js` ends at line 479.
- The wrong-side counterexample used normative weights and a malformed reversed range rather than a direct contradiction.
- The "generic exits" claim was unsupported because Mercury did not trace downstream exit-contract consumption.
- The `score` versus `confluenceScore` field mismatch claim contradicted `core/StrategyOrchestrator.js:1623-1626`, which reads both.
- Pipeline toggle and diagnostic-funnel points were wiring-only and outside this G5 logic attack unless tied directly to the strategy thesis.

Accepted after recheck:

- The confluence aggregation loop uses `this.readyTimeframes`, not the configured higher-timeframe readiness list.
- `config.trading.config.json` declares `multiTimeframeMtf.requireHigherTFReady = ["1h", "4h"]`.
- `_getMtfConfluenceForEvaluation()` does not check that list before calling `getConfluence()` / `getConfluenceScore()`.

## Findings

### 1. Thesis to Trigger

The thesis is higher-timeframe confluence. The code does not require the configured higher timeframes before building a vote.

- `modules/MultiTimeframeAdapter.js:350-352` loops over `this.readyTimeframes` and skips only missing indicators.
- `modules/MultiTimeframeAdapter.js:399-400` accumulates `weightedScore` and `totalWeight` for each ready timeframe.
- `modules/MultiTimeframeAdapter.js:412` sets `analysis.confluenceScore = weightedScore / totalWeight`.
- `config/trading.config.json:1779-1785` declares `multiTimeframeMtf.requireHigherTFReady` as `["1h", "4h"]`.
- `core/StrategyOrchestrator.js:783-788` checks only total candle count against `minCandlesMTF`.
- `core/StrategyOrchestrator.js:803-812` ingests the latest candle, then calls `getConfluence()` or `getConfluenceScore()`.
- `core/StrategyOrchestrator.js:818-821` returns that confluence without checking whether 1h and 4h are ready.

This means a lower-timeframe-only ready set can produce a confluence score. A strategy named and configured as MTF can become "timeframes I currently have" instead of "higher timeframe confluence confirmed."

### 2. Trigger to Direction

Direction assignment is mechanically straightforward after confluence is built:

- `modules/MultiTimeframeAdapter.js:419-424` maps final score above 0.15 to bullish and below -0.15 to bearish bias.
- `modules/MultiTimeframeAdapter.js:429-433` emits `direction` from `overallBias` once confidence and absolute score pass.
- `core/StrategyOrchestrator.js:1634-1642` rejects neutral/missing confluence, checks score magnitude, then returns `direction: confluence.direction`.

The accepted direction defect is inherited from the bad trigger. If the score is built without required higher-timeframe readiness, the direction may be internally consistent with the available low-timeframe signals while still violating the intended MTF thesis.

### 3. Confidence Math

The confidence math has a real dead-zone bug:

- `modules/MultiTimeframeAdapter.js:347-348` initializes `trendMatches`, `trendTotal`, and `primaryTrend`.
- `modules/MultiTimeframeAdapter.js:393-397` only increments trend totals when a primary trend exists.
- `modules/MultiTimeframeAdapter.js:417` assigns `trendAlignment` only when `trendTotal > 0`.
- `modules/MultiTimeframeAdapter.js:425-427` sets `analysis.confidence = agreementRatio * analysis.trendAlignment`.

If `trendTotal` is zero, `analysis.trendAlignment` remains the initialized value from the analysis object. The exact initialized value needs a separate code read before calling it NaN in all cases; the accepted finding is narrower: confidence depends on a trend-alignment term that may not be populated by the same ready-timeframe set that produced a score. That can suppress otherwise directional scores before they reach `shouldTrade`.

The score and strategy gate are otherwise explicit:

- `core/StrategyOrchestrator.js:1623-1626` reads `confluence.score` or `confluence.confluenceScore`, then uses absolute value.
- `core/StrategyOrchestrator.js:1627-1629` uses `confluence.confidence` when finite, otherwise score magnitude.
- `core/StrategyOrchestrator.js:1634-1635` drops missing/neutral confluence and scores below `confluenceMinScore`.

### 4. Exit Fit

The code has a static `MultiTimeframe` exit contract:

- `config/trading.config.json:1324-1331` sets stop loss -2 percent, take profit 2.5 percent, trailing stop 0.8 percent, trailing activation 1 percent, max hold 300 minutes, and no invalidation conditions.

Mercury's claim that the strategy "falls back to generic exits" is not accepted from the visible vote code alone. The vote returns `direction`, `confidence`, `reason`, and `signalData` at `core/StrategyOrchestrator.js:1637-1642`; downstream exit-contract attachment is outside the proof Mercury supplied here. The useful exit-fit finding is weaker: the visible static contract is not obviously tailored to the higher-timeframe readiness requirement, and no MTF-specific structural exit geometry is emitted by the strategy vote itself.

### 5. Platform Interaction

The platform contradiction that matters is source-timeframe strictness versus missing higher-timeframe readiness enforcement:

- `core/StrategyOrchestrator.js:791-794` throws when the latest candle lacks a `timeframe`.
- `core/StrategyOrchestrator.js:803-812` ingests one latest candle into the symbol-scoped MTF adapter and scores the adapter.
- `config/trading.config.json:1779-1785` has a higher-timeframe readiness rule.

So the platform is strict about the presence of a source timeframe, but not strict about the required higher timeframes being ready. That is exactly the wrong place to be strict for the strategy thesis.

## Reliability Note

Evidence quality is usable after narrowing:

- Active Mercury index matched HEAD.
- Mercury Pass 1 had zero tool failures but bad citations and scope drift.
- Fable caught those citation defects and forced a one-point recheck.
- Mercury Recheck had zero tool failures and confirmed the accepted load-bearing defect.
- No code was changed in this mission.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-multitimeframe-logic-attack-prompt-post-reindex.md`
- Raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-multitimeframe-bridge-output-post-reindex.txt`
- Summary: `ogz-meta/inbox/fable/2026-07-14/codex1-summary-g5-multitimeframe-post-reindex.md`
