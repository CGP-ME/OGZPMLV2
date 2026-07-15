Mercury, run G5 STRATEGY LOGIC COHERENCE on OpeningRangeBreakout only.

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
- Strategy module, part 1: `modules/OpeningRangeBreakout.js:1-200`
- Strategy module, part 2: `modules/OpeningRangeBreakout.js:200-368`
- Orchestrator construction and registration: `core/StrategyOrchestrator.js:655-657`, `core/StrategyOrchestrator.js:1701-1739`, `core/StrategyOrchestrator.js:1906-1918`, `core/StrategyOrchestrator.js:2515-2521`
- Exit contract: `config/trading.config.json:1340-1353`
- Strategy config: `config/trading.config.json:1716-1725`
- Operator intent: `ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:147-149`

Indictment materials:
- OpeningRangeBreakout is supposed to trade the opening range break with ICT-style FVG confirmation.
- It should not fire on standing alignment or generic breakout noise; it should tie the entry to opening range, post-break FVG, and valid structural exit geometry.
- Current code should be judged as landed code, not desired future architecture.

Attack the full causal chain:

1. THESIS -> TRIGGER
Does the implementation actually detect an opening range breakout plus FVG confirmation? Name any market state that satisfies the trigger while violating the thesis, and any thesis-valid state the trigger misses. Cite file:line.

2. TRIGGER -> DIRECTION
Is the direction assignment correct in all regime contexts? Construct a concrete counterexample candle sequence where the strategy votes the wrong side, or state none found. Cite file:line.

3. CONFIDENCE MATH
Do confidence values move with thesis quality? Identify any term that can invert, saturate, dead-zone, or auto-pass the vote. Show arithmetic using landed config values. Cite file:line.

4. EXIT FIT
Does the exit geometry match an opening-range/FVG breakout thesis? Evaluate structural stop/target hints, static exit contract, max hold, and invalidation conditions. Cite file:line.

5. PLATFORM INTERACTION
Name any platform layer that silently contradicts OpeningRangeBreakout's assumptions: session timing, timeframe assumptions, symbol-scoped state, FVG scan window, final minStrategyConfidence gating, or exit-contract override handling. Cite file:line.

Rules:
- Logic only. Do not propose code changes.
- Every claim must carry file:line evidence or a constructed counterexample.
- No wiring-only findings unless the platform interaction directly contradicts the strategy thesis.
- Verdict vocabulary only: coherent, coherent-with-flaws, incoherent.
