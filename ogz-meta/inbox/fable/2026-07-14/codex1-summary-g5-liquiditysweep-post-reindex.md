# codex1: G5 LiquiditySweep logic attack post-reindex

## Index Contract

- Index timestamp: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD attacked: a476afbed787c79a210f427a8509afa11123f9a0
- Chunk count: 10155
- Freshness ruling: PASS. The index matches HEAD, so this report is not stale against lane-relevant code.

## Verdict

coherent-with-flaws

LiquiditySweep still resembles the intended strategy shape: opening manipulation candle, later box exit, reversal pattern, then reversal entry. The flaws are serious enough that the strategy is not tournament-trustworthy without Trey ruling: validation fields are computed but not load-bearing, weak signals can pass the 0.35 gate with only manip-candle plus one pattern weight, hammer-style structural exits drop to static contract behavior, and the platform has a root feed / snapshot path that can describe a different detector instance than the one voting.

I am not accepting Mercury's broader `incoherent` verdict as stated. Fable correctly challenged several overclaims, and the recheck narrowed the confidence claim.

## Two-Tier Result

- First post-reindex LiquiditySweep run: rejected. Mercury had a failed oversized `open_file` call, so Fable review was skipped as `inconclusive_toolfail`.
- Second post-reindex run: accepted for reporting.
- Mercury Pass 1: `incoherent`.
- Mercury Pass 1 telemetry: tool_calls=11, succeeded=11, failed=0; tools=open_file:10/10/0, search:1/1/0.
- Fable Review: `needs_more_evidence`.
- Fable challenge: Mercury used default confidence weights without proving whether the landed config overrides them, overclaimed that any manip candle caps at 1.0, did not inspect the actual `minStrategyConfidence`, and left the wick-vs-close sweep path under-proven.
- Mercury Recheck: completed the requested confidence/gating recheck.
- Mercury Recheck telemetry: tool_calls=37, succeeded=37, failed=0; tools=list_files:1/1/0, open_file:12/12/0, search:24/24/0.

## Tier Disagreements

Fable rejected or narrowed these Mercury claims:

- "Any manip-candle pass will reach the 1.0 cap" is false.
- "Almost always passes gating" was unsupported until the actual 0.35 gate was inspected.
- "Wick-only sweeps never signal" was under-proven because Mercury had not traced the sweep-validation path.
- "Exit can remain open indefinitely" was an absence claim without tracing the platform exit-contract consumer.
- Duplicate root feed / snapshot semantics were explicitly scoped but omitted by Mercury Pass 1.

The recheck supported this narrower confidence statement: a manip candle alone is 0.20 and does not pass, but manip candle plus the smallest single additional weight is 0.35, exactly equal to the strategy gate, so weak one-confirmation signals can pass.

## Findings

### 1. Thesis to Trigger

The intended thesis is failed breaks / liquidity grabs in range conditions. The implementation has the rough shape, but the validation fields do not own the trigger:

- `modules/LiquiditySweepDetector.js:293-310` requires finite daily ATR and `range >= atrMultiplier * dailyATR` for the opening manipulation candle.
- `modules/LiquiditySweepDetector.js:316-325` computes `sweepsHighs`, `sweepsLows`, `closesInsideRange`, and `validationScore`.
- `modules/LiquiditySweepDetector.js:326-330` only increments stats/logs when validation passes, then enters `watching_for_exit` regardless.
- `modules/LiquiditySweepDetector.js:343-352` sets `exitSide` only when a later candle closes outside the opening box.

Supported flaw: an opening candle can fail both sweep validation and inside-range validation, but still proceed to `watching_for_exit` if it passed the ATR range test. That means the code can trade "large opening candle + later outside close + reversal pattern" without proving the opening candle actually swept prior highs/lows or rejected back into range.

### 2. Trigger to Direction

The direction mapping is coherent for the exit-side reversal model:

- `modules/LiquiditySweepDetector.js:378-388` maps a break below the box plus bullish hammer/engulfing to bullish.
- `modules/LiquiditySweepDetector.js:391-400` maps a break above the box plus bearish hammer/engulfing to bearish.
- `modules/LiquiditySweepDetector.js:412-415` maps bullish patterns to buy geometry and bearish patterns to sell geometry.
- `modules/LiquiditySweepDetector.js:439-445` emits the final `buy` or `sell` signal based on that bullish/bearish mapping.

Rejected overclaim: Mercury's broad "mis-assigns direction" claim is not proven by the cited code. A lower-box sweep followed by a bullish reversal pattern is supposed to be a buy; an upper-box sweep followed by a bearish reversal pattern is supposed to be a sell.

Remaining flaw: the later `exitSide` transition is close-based (`c(bar) > box.high` / `< box.low`) at `modules/LiquiditySweepDetector.js:343-352`; wick-only box breaches do not start reversal-pattern watch. That can miss thesis-valid wick sweeps that do not close outside the box.

### 3. Confidence Math

The confidence issue is real, but narrower than Mercury first claimed:

- `modules/LiquiditySweepDetector.js:55-59` defines default weights: manipCandle 0.20, wickSweep 0.15, sweepReject 0.15, hammerPattern 0.25, engulfPattern 0.25.
- `config/trading.config.json:1659-1670` configures strategy thresholds but does not provide weight overrides.
- `modules/LiquiditySweepDetector.js:423-438` sums the weights, applies RR adjustment only when `overrideLevels` exists, then clamps to 0..1.
- `config/trading.config.json:5` sets `confidence.minStrategyConfidence` to 0.35.
- `core/StrategyOrchestrator.js:629` reads `confidence.minStrategyConfidence`.
- `core/StrategyOrchestrator.js:1442-1443` drops LiquiditySweep only if `conf < this.minStrategyConfidence`.

Arithmetic:

- Manip candle alone: 0.20. Rejected by 0.35 gate.
- Manip candle + smallest one additional weight: 0.20 + 0.15 = 0.35. Accepted because the gate rejects only `< 0.35`, not `<= 0.35`.
- Manip candle + hammer only: 0.20 + 0.25 = 0.45. Accepted.
- All five weights: 1.00 before RR bonus; final stays 1.00 after clamp.

Supported flaw: because validation fields are not load-bearing, a signal can pass the final gate with manip-candle plus one pattern weight even when `sweepsHighs`, `sweepsLows`, and `closesInsideRange` did not confirm the liquidity-sweep thesis.

### 4. Exit Fit

The strategy has two exit behaviors:

- Engulfing patterns with known entry can produce structural `overrideLevels`.
- Hammer / inverted hammer patterns set `entry = null`, so structural override levels are not produced.

Evidence:

- `modules/LiquiditySweepDetector.js:39-47` returns override levels only when entry, stopLoss, and takeProfit are all finite positive prices and on the correct side.
- `modules/LiquiditySweepDetector.js:412-413` sets `entry = null` for hammer and inverted hammer.
- `modules/LiquiditySweepDetector.js:416-421` only invalidates geometry when a non-null entry exists and override construction fails.
- `modules/LiquiditySweepDetector.js:439-445` emits `overrideLevels` even when null.
- `core/StrategyOrchestrator.js:1454-1461` forwards `sig.overrideLevels || null`.
- `config/trading.config.json:1257-1268` says LiquiditySweep uses structural exits and has a static fallback contract of -2 percent stop, 2.5 percent take profit, 0.5 percent trailing, 0.7 activation, and 180 minute max hold.

Supported flaw: hammer-style LiquiditySweep signals are thesis-native reversals, but they do not carry entry-known structural stop/target levels. They fall back to static contract behavior unless a downstream layer reconstructs structure later. That weakens the "structural exits" claim for part of the strategy's own pattern set.

### 5. Platform Interaction

Two platform issues are supported:

1. Range-regime ownership is not enforced in the registration snippet.
   - `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:143-146` says range regime is LiquiditySweep/SmartMoneySweep home turf and nobody trades outside their home regime.
   - `core/StrategyOrchestrator.js:1906-1914` shows the enable map for strategy registration, not a regime gate.

2. Dashboard/snapshot visibility can come from a root detector path that is not the symbol-scoped voting instance.
   - `core/CandleProcessor.js:607-612` can feed `this.ctx.liquiditySweep` and write `this.ctx.liquiditySweepSignal`.
   - `core/StrategyOrchestrator.js:1422-1431` evaluates a symbol-scoped LiquiditySweep module and feeds it the latest candle.
   - `core/PipelineSnapshot.js:263-274` reports `bot.liquiditySweepSignal || bot.liquiditySweep.getSignal?.()`.

That is not a pure strategy-logic break, but it directly affects operator truth: the dashboard can report a LiquiditySweep phase/confidence from the root feed while actual trade voting comes from the orchestrator-scoped module.

## Reliability Note

Evidence quality is usable with caveats:

- The accepted run used the fresh index and had zero tool failures in both Mercury Pass 1 and Mercury Recheck.
- Fable materially corrected Mercury's overclaims.
- I resolved Fable's wick-vs-close residual mechanically from `modules/LiquiditySweepDetector.js:316-352`: wick sweep validation is computed on the opening candle, while the later exit-side transition is close-based only.
- No code was changed in this mission.

## Artifacts

- Prompt, rejected first attempt: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-logic-attack-prompt-post-reindex.md`
- Raw rejected first attempt: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-bridge-output-post-reindex.txt`
- Prompt, accepted rerun: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-logic-attack-prompt-post-reindex-r2.md`
- Raw accepted rerun: `ogz-meta/inbox/fable/2026-07-14/g5-liquiditysweep-bridge-output-post-reindex-r2.txt`
- Summary: `ogz-meta/inbox/fable/2026-07-14/codex1-summary-g5-liquiditysweep-post-reindex.md`
