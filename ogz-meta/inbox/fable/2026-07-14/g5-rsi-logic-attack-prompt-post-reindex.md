Mercury, break my fix.

G5 STRATEGY LOGIC COHERENCE attack on landed RSI strategy code at HEAD.

Index freshness contract for this run:
- Active Mercury index timestamp: 2026-07-14T21:29:42.731Z
- Active Mercury indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- Current HEAD at dispatch must match that SHA. If it does not, halt as stale_index.

Use the full adversarial review mechanism: Mercury prosecutes the strategy logic first; Fable reviews Mercury's citations and challenges unsupported claims; if Fable challenges Mercury, Mercury rechecks only the exact challenged point. Report tier disagreements verbatim.

Scope:
- core/StrategyOrchestrator.js:1127-1156
- core/StrategyOrchestrator.js:1495-1545
- core/StrategyOrchestrator.js:2008-2045
- config/trading.config.json:1283-1291
- config/trading.config.json:1672-1676
- ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:20-33
- ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:134-150

Intent/doctrine:
- RSI = mean-reversion extreme strategy.
- Oversold should produce long only when the market state supports exhaustion/reversal rather than catching a falling knife.
- Overbought should produce short only when the market state supports exhaustion/reversal rather than shorting strength blindly.
- Exit geometry should match a mean-reversion target thesis, not a generic trend runner.
- Confidence math must not create votes that cannot clear the downstream minimum confidence threshold.

Attack the LOGIC of RSI, not generic wiring.

Trace the full causal chain and attack every link:

1. THESIS -> TRIGGER
Does the RSI threshold condition actually detect exhaustion/reversal? Name any market state that satisfies the trigger while violating the thesis, and any thesis-valid state the trigger misses. File:line.

2. TRIGGER -> DIRECTION
Is the direction assignment correct in all regime contexts? Construct a concrete counterexample candle/indicator sequence where it votes the wrong side, or state none found with evidence. File:line.

3. CONFIDENCE MATH
Do confidence terms move confidence in the thesis direction in all branches? Find any term that can invert, saturate, or dead-zone votes so they can never clear minConfidence. Show the arithmetic using landed config values.

4. EXIT FIT
Does exit geometry fit RSI mean reversion? Cite contract values against the strategy intent.

5. INTERACTION
Name any platform layer (regime boosts, fee model, session gates, timeframe assumptions, MTF annotations) that silently contradicts RSI assumptions.

Rules:
- Every claim needs file:line evidence or a constructed counterexample.
- Do not report wiring-only findings owned by G1-G4.
- Verdict vocabulary: coherent / coherent-with-flaws / incoherent.
