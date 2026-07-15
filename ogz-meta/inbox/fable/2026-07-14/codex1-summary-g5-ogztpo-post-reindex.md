# codex1: G5 OGZTPO logic attack post-reindex

## Index Contract

- Index timestamp: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD attacked: a476afbed787c79a210f427a8509afa11123f9a0
- Chunk count: 10155
- Freshness ruling: PASS. The index matches HEAD, so this report is not stale against lane-relevant code.

## Verdict

coherent-with-flaws

The raw Mercury verdict was `incoherent`, but Fable correctly challenged the load-bearing overclaims. The current orchestrator does enforce high-probability zone signals and minimum strength before OGZTPO can vote, so the "unfiltered neutral crossover can trade" indictment is false for the actual trade path. The remaining findings are still material: OGZTPO is not using its config block cleanly, it has two oscillator copies in the repo, confidence has an effective hidden floor interaction, and dynamic TPO levels can override the static OGZTPO contract geometry.

## Two-Tier Result

- Mercury Pass 1: `incoherent`.
- Mercury Pass 1 telemetry: tool_calls=10, succeeded=10, failed=0; tools=list_files:1/1/0, open_file:9/9/0.
- Fable Review: `needs_more_evidence`.
- Fable challenge: Mercury failed to prove downstream absence of the `highProbability` gate, overclaimed that the static exit contract is never consulted, and did not answer the two-oscillator-copy question.
- Mercury Recheck: confirmed `core/OgzTpoIntegration.js` imports `../src/indicators/ogzTwoPoleOscillator`, and that the imported file contains the crossover detector and dynamic-level helper.
- Mercury Recheck telemetry: tool_calls=5, succeeded=5, failed=0; tools=open_file:4/4/0, search:1/1/0.

## Tier Disagreements

Fable rejected or narrowed these Mercury claims:

- "The integration never checks `highProbability`, so neutral crosses can trade" is incomplete because `core/StrategyOrchestrator.js:1672-1677` checks both `tpo.signal.highProbability` and `tpoStrengthMin` before returning a strategy vote.
- "The static contract is never consulted" is unsupported. `core/ExitContractManager.js:658-666` starts with the strategy default contract, and `core/ExitContractManager.js:167-168` uses the exact strategy contract when it exists.
- The feature-flag-off claim is wiring-only for this path. The orchestrator constructs `new OgzTpoIntegration()` directly at `core/StrategyOrchestrator.js:681`; it does not use `OgzTpoIntegration.fromFeatureFlags()` in the strategy registration path.
- The saturation claim is plausible as math but was overstated without proving the oscillator's practical amplitude distribution.

Accepted after recheck and local mechanical follow-up:

- The imported strategy oscillator is `src/indicators/ogzTwoPoleOscillator.js`, not `core/ogzTwoPoleOscillator.js`.
- There is a second TPO copy used by `core/indicators/IndicatorEngine.js`, so dashboard/indicator state can be based on different implementation bytes than the strategy integration.
- Dynamic levels are attached by the integration and converted by the orchestrator into contract overrides when OGZTPO wins.

## Findings

### 1. Thesis to Trigger

The core trigger is coherent on the actual trade path:

- `src/indicators/ogzTwoPoleOscillator.js:252-260` reads current and previous TPO/lag values.
- `src/indicators/ogzTwoPoleOscillator.js:262-276` emits `BUY` on bullish crossover and marks high probability only when current TPO is at or below the lower zone.
- `src/indicators/ogzTwoPoleOscillator.js:279-293` emits `SELL` on bearish crossover and marks high probability only when current TPO is at or above the upper zone.
- `core/OgzTpoIntegration.js:248-257` passes the raw crossover into `finalSignal`.
- `core/StrategyOrchestrator.js:1672-1673` rejects any signal that is missing or not `highProbability`.
- `core/StrategyOrchestrator.js:1675-1677` reads strength and rejects strength below `tpoStrengthMin`.

The integration by itself is permissive, but the strategy vote path is not. A neutral-zone crossover can exist in `finalSignal`, but it cannot become an OGZTPO vote because the orchestrator returns null before direction assignment.

### 2. Trigger to Direction

Direction mapping is coherent:

- `src/indicators/ogzTwoPoleOscillator.js:262-276` maps bullish crossover to `action: 'BUY'`.
- `src/indicators/ogzTwoPoleOscillator.js:279-293` maps bearish crossover to `action: 'SELL'`.
- `core/StrategyOrchestrator.js:1679-1680` maps `BUY` to `buy`, `SELL` to `sell`, and rejects anything else.

No wrong-side counterexample is accepted from this attack. A valid TPO bullish cross produces buy, and a valid bearish cross produces sell.

### 3. Confidence Math

The confidence math is directionally sensible but has a hidden effective threshold:

- `config/trading.config.json:9` sets `confidence.tpoStrengthMin` to 0.03.
- `config/trading.config.json:1753` sets `orchestrator.tpoStrengthMultiplier` to 10.
- `core/StrategyOrchestrator.js:1675-1677` rejects strength below 0.03.
- `core/StrategyOrchestrator.js:1687-1690` returns `confidence: Math.min(1.0, strength * tpoStrengthMultiplier)`.
- `core/StrategyOrchestrator.js:2442-2447` later filters qualified candidates by `this.minStrategyConfidence`.
- `config/trading.config.json:5` sets `confidence.minStrategyConfidence` to 0.35.

Arithmetic:

- Strength 0.030 passes `tpoStrengthMin`, returns confidence 0.30, then fails the 0.35 ranking threshold.
- Strength 0.035 returns confidence 0.35 and can qualify.
- Strength 0.070 returns confidence 0.70.
- Strength 0.100 returns confidence 1.00.

The effective strength floor is therefore 0.035, not the config-visible `tpoStrengthMin` of 0.03. That is not a side-inversion, but it is a transparency defect: the real entry floor is the interaction between two config values.

### 4. Exit Fit

OGZTPO has both a static contract and dynamic TPO levels:

- `config/trading.config.json:1332-1339` defines static OGZTPO exit geometry: -2 percent stop, 2.5 percent take profit, 0.6 percent trailing stop, 0.8 percent trailing activation, 240 minute max hold.
- `src/indicators/ogzTwoPoleOscillator.js:308-334` computes dynamic levels from volatility and a 1.5R target.
- `core/OgzTpoIntegration.js:259-265` attaches those dynamic levels when `dynamicSL` is enabled.
- `core/StrategyOrchestrator.js:1693-1696` returns those levels as `overrideLevels`.
- `core/StrategyOrchestrator.js:131-185` validates structural levels and converts them to percent overrides.
- `core/StrategyOrchestrator.js:2079-2085` stores those converted overrides on the candidate.
- `core/StrategyOrchestrator.js:2515-2527` applies structural overrides to `signalOverrides`.
- `core/StrategyOrchestrator.js:2567-2570` creates the exit contract from the winner strategy plus `signalOverrides`.
- `core/ExitContractManager.js:663-666` starts with the strategy default contract.
- `core/ExitContractManager.js:682-700` then applies signal-specific overrides when present.

Accepted finding: Mercury was wrong that the static contract is never consulted. It is the base. But for OGZTPO wins with valid dynamic levels, the stop/take-profit percentages can be overwritten by volatility-derived structural levels. That can be valid architecture, but it means the actual exit geometry is not the static OGZTPO config alone.

### 5. Platform Interaction

Three platform interactions matter:

1. Config ownership is incomplete in the strategy path.
   - `core/StrategyOrchestrator.js:681` constructs `new OgzTpoIntegration()` with no config object.
   - `core/OgzTpoIntegration.js:64-87` fills mode, dynamicSL, confluence, voteWeight, lengths, and mode thresholds from constructor defaults plus any passed config.
   - The visible strategy path does not pass the `config/trading.config.json` `ogzTpoMtf` block at `config/trading.config.json:1786-1790`.

2. There are two oscillator implementations in the repo.
   - `core/OgzTpoIntegration.js:33-39` imports `../src/indicators/ogzTwoPoleOscillator`.
   - `core/indicators/IndicatorEngine.js:26-29` imports `../ogzTwoPoleOscillator`.
   - `src/indicators/ogzTwoPoleOscillator.js:308-334` validates dynamic-level inputs.
   - `core/ogzTwoPoleOscillator.js:308-329` has a same-named helper without those validations.

   The strategy integration uses the `src/` copy. Indicator snapshots can use the `core/` copy. That is a platform truth risk: the dashboard/indicator engine and strategy vote may not be describing the exact same oscillator implementation.

3. Warmup has two layers.
   - `config/trading.config.json:1747` sets `minCandlesTPO` to 30.
   - `core/StrategyOrchestrator.js:1655-1656` rejects before calling the integration if candle history is shorter than `minCandlesTPO`.
   - `core/OgzTpoIntegration.js:182-188` also returns not-ready until `normLength + 5`; with default normLength 25, that is also 30.

   At current values these match. If one changes without the other, the effective warmup becomes the stricter of two places.

## Reliability Note

Evidence quality is usable with caveats:

- Active Mercury index matched HEAD.
- Mercury Pass 1 and recheck had zero tool failures.
- Fable materially corrected Mercury's overclaims.
- The bridge recheck answered the oscillator-copy question only; I resolved the remaining Fable follow-up mechanically from local code reads.
- No code was changed in this mission.

## Artifacts

- Prompt: `ogz-meta/inbox/fable/2026-07-14/g5-ogztpo-logic-attack-prompt-post-reindex.md`
- Raw bridge output: `ogz-meta/inbox/fable/2026-07-14/g5-ogztpo-bridge-output-post-reindex.txt`
- Summary: `ogz-meta/inbox/fable/2026-07-14/codex1-summary-g5-ogztpo-post-reindex.md`
