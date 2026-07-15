# codex1: G5 DonchianBreakout logic attack post-reindex

## Index Contract

- Index timestamp: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD attacked: a476afbed787c79a210f427a8509afa11123f9a0
- Chunk count: 10155
- Freshness ruling: PASS. The index matches HEAD, so the report is not stale against lane-relevant code.

## Verdict

coherent-with-flaws

DonchianBreakout is recognizable as a basic channel-breakout strategy: it buys a close above the prior Donchian upper channel and emits an ATR-derived stop hint. The logic flaws are not enough to call the strategy incoherent, but they are live enough to require Trey ruling before tournament trust: weak false-breakout discrimination, long-only config despite the module carrying short-side code, low-quality breakout confidence floor, and a stop hint path with no minimum noise floor after normalization.

## Two-Tier Result

- Mercury Pass 1: coherent-with-flaws.
- Mercury Pass 1 telemetry: tool_calls=18, succeeded=18, failed=0; tools=list_files:1/1/0, open_file:12/12/0, search:5/5/0.
- Fable Review: needs_more_evidence.
- Fable challenge: Mercury's strongest exitContractHint claim rested on an unverified negative. Fable required tracing the hint after `validateStructuralLevelOverride()` returns ignored.
- Mercury Recheck: completed the requested lifecycle trace.
- Mercury Recheck telemetry: tool_calls=17, succeeded=17, failed=0; tools=open_file:10/10/0, search:7/7/0.

## Tier Disagreements

Fable rejected three Mercury claims as under-proven:

- A single-candle breakout that reverses next bar is a known false-positive class, but not by itself a logical contradiction. It is hindsight unless tied to a missing filter doctrine.
- The short-side/config drift concern is hypothetical unless the live config or strategy thesis requires shorts now.
- The "malformed exitContractHint passes unnoticed" claim needed downstream lifecycle proof, not only the early return in structural-level validation.

The recheck supported only the narrower exit-hint conclusion: the hint is finite/sign-validated, then merged, with no demonstrated minimum stop floor or clamp.

## Findings

### 1. Thesis to Trigger

The trigger is mechanically coherent for a Donchian breakout:

- `modules/DonchianBreakout.js:70-71` builds the prior channel from `candles.slice(0, -1)`, so the current candle is not included in the breakout boundary.
- `modules/DonchianBreakout.js:80-87` emits a buy when the current close is above the prior upper channel.
- `modules/DonchianBreakout.js:90-98` emits a sell only when shorts are allowed and the close is below the lower channel.

Flaw: the trigger has no close-confirm, follow-through, volume, or retest requirement. A one-bar spike above the prior channel satisfies the trigger while failing the stronger "trend continuation" thesis. That is a false-positive class, not a proof that the trigger is direction-incoherent.

### 2. Trigger to Direction

The direction assignment is internally consistent when enabled:

- Upper-channel break maps to buy at `modules/DonchianBreakout.js:80-87`.
- Lower-channel break maps to sell at `modules/DonchianBreakout.js:90-98`.

Current landed config is long-only:

- `config/trading.config.json:1727-1740` sets `allowShorts` to `false`.

That means the downside breakout half of the module is dormant in current profile behavior. This is not a wrong-side bug today, but it should be treated as a thesis/config mismatch if Donchian is expected to trade both breakout directions.

### 3. Confidence Math

The confidence formula is simple and non-inverting:

- `modules/DonchianBreakout.js:120-121` returns `0.55 + min(0.30, extensionAtr * 0.15)`, clamped between 0 and 1.
- `config/trading.config.json:1365-1377` sets the Donchian exit contract `minConfidence` to `null`, so there is no strategy-specific confidence dead-zone at the contract layer.

Flaw: the base confidence floor is 0.55 even for a barely-over-channel breakout. Extension increases confidence in the thesis direction, but weak marginal breaks start above 50 percent before any independent quality proof.

### 4. Exit Fit

The exit shape is partially thesis-aligned:

- `modules/DonchianBreakout.js:78` computes stop distance as `atrStopMult * atr / price * 100`.
- `modules/DonchianBreakout.js:103-117` emits an `exitContractHint` with the ATR stop, static take profit, trailing stop, activation, max hold, and invalidation list.
- `config/trading.config.json:1727-1740` gives the strategy `atrStopMult=2.5`, `takeProfitPercent=12`, `trailingStopPercent=1.5`, `trailingActivation=1`, and `maxHoldTimeMinutes=10080`.
- `config/trading.config.json:1365-1377` mirrors the static contract with `takeProfitPercent=12`, trailing values, and `maxHoldTimeMinutes=10080`.

Flaw supported by Mercury recheck: the dynamic stop hint has sign/finite validation, but no stop floor was proven downstream.

- `core/StrategyOrchestrator.js:135-138` ignores structural-level validation when an `exitContractHint` is present.
- `core/StrategyOrchestrator.js:568-576` validates only that `stopLossPercent` is a negative finite risk distance.
- `core/StrategyOrchestrator.js:2515-2518` merges the normalized hint into `signalOverrides`.

So low-ATR regimes can produce a very tight Donchian stop unless another later component, outside the traced lifecycle, imposes a floor. No such floor was proven in this G5 packet.

### 5. Platform Interactions

- `config/trading.config.json:1488-1504` has the global trend-regime gate disabled, so Donchian currently does not receive a platform trend-only filter despite being a trend-following breakout.
- `core/StrategyOrchestrator.js:2093` applies strategy MTF confluence after candidate selection, so any MTF effect is post-trigger confidence adjustment, not a trigger-quality proof.

## Reliability Note

Post-reindex G5 evidence is usable: the active Mercury index matched HEAD, and both Mercury passes reported zero tool failures. Fable materially improved the answer by rejecting unsupported claims and forcing the exitContractHint lifecycle trace. No code was changed in this mission.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-donchian-logic-attack-prompt-post-reindex.md`
- Raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-donchian-bridge-output-post-reindex.txt`
- Summary: `ogz-meta/inbox/fable/2026-07-14/codex1-summary-g5-donchian-post-reindex.md`
