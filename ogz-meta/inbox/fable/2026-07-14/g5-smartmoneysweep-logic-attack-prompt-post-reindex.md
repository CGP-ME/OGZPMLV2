Mercury, run G5 STRATEGY LOGIC COHERENCE on SmartMoneySweep only.

Index contract:
- Indexed at: 2026-07-14T21:29:42.731Z
- Indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- HEAD to attack: a476afbed787c79a210f427a8509afa11123f9a0
- If your retrieved/indexed context disagrees with HEAD for these files, say stale_index and stop.

Tool discipline:
- Do not request any `open_file` range larger than 250 lines.
- Use the split ranges below.
- If a tool call fails, classify the run as inconclusive_toolfail instead of issuing a verdict.

Use the full adversarial review mechanism: Mercury prosecutes the strategy logic first; Fable reviews Mercury's citations and challenges unsupported claims; if Fable challenges Mercury, Mercury rechecks only the exact challenged point. Report tier disagreements verbatim.

Scope:
- Strategy module, part 1: `modules/SmartMoneySweep.js:1-220`
- Strategy module, part 2: `modules/SmartMoneySweep.js:220-440`
- Strategy module, part 3: `modules/SmartMoneySweep.js:440-660`
- Strategy module, part 4: `modules/SmartMoneySweep.js:660-880`
- Strategy module, part 5: `modules/SmartMoneySweep.js:880-1040`
- Orchestrator construction and registration: `core/StrategyOrchestrator.js:682-683`, `core/StrategyOrchestrator.js:1743-1785`, `core/StrategyOrchestrator.js:1906-1918`, `core/StrategyOrchestrator.js:2446-2464`
- Exit contract: `config/trading.config.json:1354-1363`
- Strategy config: `config/trading.config.json:1686-1715`
- Operator intent: `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:143-149`

Indictment materials:
- SmartMoneySweep is supposed to trade failed breaks / liquidity grabs in range conditions with deterministic smart-money structure.
- It should use VP/IVB/sweep/candle classification to identify absorption and reversal, not generic momentum or ambiguous candle noise.
- Current code should be judged as landed code, not desired future architecture.

Attack the full causal chain:

1. THESIS -> TRIGGER
Does the implementation actually detect failed breaks / smart-money sweeps? Name any market state that satisfies the trigger while violating the thesis, and any thesis-valid state the trigger misses. Cite file:line.

2. TRIGGER -> DIRECTION
Is the direction assignment correct in all regime contexts? Construct a concrete counterexample candle sequence where the strategy votes the wrong side, or state none found. Cite file:line.

3. CONFIDENCE MATH
Do the condition counts and confidence math move confidence in the thesis's direction in every branch? Identify any term that can invert, saturate, dead-zone, or auto-pass the vote. Show arithmetic using landed config values. Cite file:line.

4. EXIT FIT
Does the exit geometry match a smart-money sweep reversal thesis? Evaluate structural stop/target hints, static exit contract, max hold, daily loss state, and invalidation conditions. Cite file:line.

5. PLATFORM INTERACTION
Name any platform layer that silently contradicts SmartMoneySweep's assumptions: regime assignment, fee model, session semantics, timeframe assumptions, symbol-scoped state, daily loss attribution, or final minStrategyConfidence gating. Cite file:line.

Rules:
- Logic only. Do not propose code changes.
- Every claim must carry file:line evidence or a constructed counterexample.
- No wiring-only findings unless the platform interaction directly contradicts the strategy thesis.
- Verdict vocabulary only: coherent, coherent-with-flaws, incoherent.
