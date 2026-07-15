# codex1: G5 OpeningRangeBreakout logic attack post-reindex

## Index Contract

- Index timestamp: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD attacked: a476afbed787c79a210f427a8509afa11123f9a0
- Chunk count: 10155
- Freshness ruling: PASS. The index matches HEAD, so this report is not stale against lane-relevant code.

## Verdict

incoherent

OpeningRangeBreakout has the intended high-level pieces: session open, opening range, close beyond range, FVG scan, limit entry, structural exit hint. But the load-bearing opening-range producer is wrong for any sub-15m feed: every candle inside the OR window replaces the range wholesale instead of locking the first OR candle or accumulating max/min across the window. That can create breakouts that do not exist under the true opening range. Since the opening range is the strategy's root thesis object, this breaks the causal chain before FVG confirmation.

## Two-Tier Result

- Mercury Pass 1: `incoherent`.
- Mercury Pass 1 telemetry: tool_calls=13, succeeded=13, failed=0; tools=list_files:1/1/0, open_file:11/11/0, search:1/1/0.
- Fable Review: `needs_more_evidence`.
- Fable challenge: Mercury's strongest claim was the OR overwrite; Fable required verbatim proof and a valid counterexample because Mercury's first counterexample was arithmetically broken.
- Mercury Recheck: confirmed the overwrite and supplied a valid candle sequence.
- Mercury Recheck telemetry: tool_calls=2, succeeded=2, failed=0; tools=git_show:1/1/0, open_file:1/1/0.

## Tier Disagreements

Fable rejected or narrowed these Mercury claims:

- The first OR-overwrite counterexample was invalid, but the recheck produced a valid one.
- "Min-confidence gating is absent" was not proven and is not needed for the verdict.
- "State shared across symbols" was hedged and not proven; the visible registration uses `_getSymbolStrategyModule()`.
- Max-hold and invalidation absence claims were not traced across exit consumers, so they stay as unaccepted overclaims.

## Findings

### 1. Thesis to Trigger

The strategy is supposed to trade opening-range breakouts with FVG confirmation. The opening range itself is not stable under the current code:

- `modules/OpeningRangeBreakout.js:161-164` checks whether the candle timestamp is inside the opening range period.
- `modules/OpeningRangeBreakout.js:165-170` then replaces `this.openingRange` with that candle's high/low.
- There is no `if (!this.openingRange)` guard and no `Math.max` / `Math.min` accumulation.
- `modules/OpeningRangeBreakout.js:187-201` fires breakout direction from the current `this.openingRange`.

Concrete counterexample from the recheck:

- 09:00-09:05 candle: high 105, low 95. True first OR candle range is 105/95.
- 09:05-09:10 candle: high 102, low 98. Code overwrites OR to 102/98.
- 09:10-09:15 candle: high 101, low 99. Code overwrites OR to 101/99.
- 09:15-09:20 candle closes 104. Code fires bullish breakout because 104 > 101.
- Under the first OR candle, 104 is below 105, so no bullish breakout exists.

This is not a tuning issue. It changes the object the strategy claims to break.

### 2. Trigger to Direction

Once `openingRange` is accepted, direction mapping is straightforward:

- `modules/OpeningRangeBreakout.js:187-193` maps close above OR high to bullish and immediately checks FVG.
- `modules/OpeningRangeBreakout.js:196-201` maps close below OR low to bearish and immediately checks FVG.
- `modules/OpeningRangeBreakout.js:260-263` maps bullish FVG to buy and bearish FVG to sell.

The direction bug is inherited from the bad OR object. The module can vote bullish against a rewritten range even when the true first OR range would produce no trade.

### 3. Confidence Math

Confidence is simple and not config-owned:

- `modules/OpeningRangeBreakout.js:306-317` starts at 0.50, adds 0.15 for FVG gap between 0.3 and 1.0 percent, adds 0.10 for 1.0 to 1.5 percent, and caps at 0.85.
- `config/trading.config.json:1716-1725` configures session/FVG scan and target geometry, but does not configure confidence constants.
- `config/trading.config.json:1340-1353` sets `minConfidence` to null.

This confidence model does move in the intended direction for moderate FVG quality, but it is shallow: a valid signal is 0.50, cleaner gap is 0.65, larger acceptable gap is 0.60, and nothing else in OR/FVG context affects confidence.

### 4. Exit Fit

Exit fit is structurally plausible:

- `modules/OpeningRangeBreakout.js:247-253` asks the FVG detector to calculate entry, stop, target from entry level, stop buffer, and target RR.
- `modules/OpeningRangeBreakout.js:254-258` rejects invalid geometry.
- `modules/OpeningRangeBreakout.js:286-295` emits an `exitContractHint` with stopLossPercent, takeProfitPercent, trailing values, max hold, and invalidation conditions.
- `config/trading.config.json:1340-1353` has matching static ORB exit contract values and invalidations.

Fable correctly refused Mercury's broader "never enforced" claim. This G5 report does not assert that max hold or invalidations are absent downstream.

### 5. Platform Interaction

Two interactions matter:

- `core/StrategyOrchestrator.js:1711-1718` feeds only `latestCandle` into the scoped ORB module. If the active feed is 1m or 5m, ORB receives multiple candles inside the 15-minute OR window and the overwrite bug is active.
- `core/StrategyOrchestrator.js:1712-1717` uses `_getSymbolStrategyModule()` for symbol scoping, so Mercury's shared-state claim is not accepted without further caller-level proof.

## Reliability Note

Evidence quality is usable:

- Active Mercury index matched HEAD.
- Mercury Pass 1 and recheck had zero tool failures.
- Fable forced the load-bearing OR overwrite claim through a narrower proof and rejected unsupported side claims.
- No code was changed in this mission.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-openingrangebreakout-logic-attack-prompt-post-reindex.md`
- Raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-openingrangebreakout-bridge-output-post-reindex.txt`
- Summary: `ogz-meta/inbox/fable/2026-07-14/codex1-summary-g5-openingrangebreakout-post-reindex.md`
