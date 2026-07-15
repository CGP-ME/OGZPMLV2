Mercury, run G5 STRATEGY LOGIC COHERENCE on LiquiditySweep only.

Index contract:
- Indexed at: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD to attack: a476afbed787c79a210f427a8509afa11123f9a0
- If your retrieved/indexed context disagrees with HEAD for these files, say stale_index and stop.

Use the full adversarial review mechanism: Mercury prosecutes the strategy logic first; Fable reviews Mercury's citations and challenges unsupported claims; if Fable challenges Mercury, Mercury rechecks only the exact challenged point. Report tier disagreements verbatim.

Scope:
- Strategy module, part 1: `modules/LiquiditySweepDetector.js:1-260`
- Strategy module, part 2: `modules/LiquiditySweepDetector.js:260-509`
- Orchestrator construction and registration: `core/StrategyOrchestrator.js:668-671`, `core/StrategyOrchestrator.js:1408-1452`, `core/StrategyOrchestrator.js:1906-1914`, `core/StrategyOrchestrator.js:2446-2464`
- Legacy root feed / snapshot consumers for platform interaction only: `core/CandleProcessor.js:607-612`, `core/PipelineSnapshot.js:263-274`
- Exit contract: `config/trading.config.json:1257-1268`
- Strategy config: `config/trading.config.json:1659-1670`
- Operator intent: `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:143-146`

Indictment materials:
- LiquiditySweep is supposed to trade failed breaks / liquidity grabs in range conditions.
- It should identify an opening manipulation candle, wait for a sweep outside the box, then enter the reversal with structural exits.
- Current code should be judged as landed code, not desired future architecture.

Attack the full causal chain:

1. THESIS -> TRIGGER
Does the implementation actually detect failed breaks / liquidity sweeps? Name any market state that satisfies the trigger while violating the thesis, and any thesis-valid state the trigger misses. Cite file:line.

2. TRIGGER -> DIRECTION
Is the direction assignment correct in all regime contexts? Construct a concrete counterexample candle sequence where the strategy votes the wrong side, or state none found. Cite file:line.

3. CONFIDENCE MATH
Do the confidence weights move confidence in the thesis's direction in every branch? Identify any multiplier/weight that can invert, saturate, dead-zone, or auto-pass the vote. Show arithmetic using landed config values. Cite file:line.

4. EXIT FIT
Does the exit geometry match a liquidity-sweep reversal thesis? Evaluate structural stop/target hints, static exit contract, max hold, and invalidation conditions. Cite file:line.

5. PLATFORM INTERACTION
Name any platform layer that silently contradicts LiquiditySweep's assumptions: regime assignment, fee model, session/opening-range semantics, timeframe assumptions, symbol-scoped state, duplicate root feed versus orchestrator feed, snapshot/reporting behavior, or final minStrategyConfidence gating. Cite file:line.

Rules:
- Logic only. Do not propose code changes.
- Every claim must carry file:line evidence or a constructed counterexample.
- No wiring-only findings unless the platform interaction directly contradicts the strategy thesis.
- Verdict vocabulary only: coherent, coherent-with-flaws, incoherent.
