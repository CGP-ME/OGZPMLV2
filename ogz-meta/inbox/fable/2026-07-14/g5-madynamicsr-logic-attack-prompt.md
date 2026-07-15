Mercury, break my fix.

G5 STRATEGY LOGIC COHERENCE attack on landed MADynamicSR code at HEAD.

Scope:
- modules/MADynamicSR.js:1-1070
- core/StrategyOrchestrator.js:47, 666-667, 1094-1118, 1348-1405, 1908
- config/trading.config.json:1293-1311, 1592-1624, 1766-1771
- ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:20-33, 134-148

Intent/doctrine:
- MADynamicSR = dynamic moving-average support/resistance, not bare proximity.
- Correct direction requires trend coherence: long pullbacks into rising MA support, short pullbacks into falling MA resistance.
- Restored Trader DNA system should include trend gate, extension/elasticity check, first-touch-after-parabolic skip, pullback cooldown, confirmation candle, S/R alignment, and structural SL/TP validity.
- Confidence filters may down/up-weight setup quality, but direction incoherence is not allowed.

Attack the LOGIC of MADynamicSR, not generic wiring.

Trace the full causal chain and attack every link:
1. THESIS->TRIGGER: does the entry condition actually detect the thesis? Name any market state that satisfies the trigger while violating the thesis, and any thesis-valid state the trigger misses. File:line.
2. TRIGGER->DIRECTION: is direction assignment correct in all regime contexts? Construct a concrete counterexample candle sequence where it votes the wrong side, or state none found with evidence. File:line.
3. CONFIDENCE MATH: do multipliers move confidence in the thesis direction in all branches? Find any term that can invert, saturate, or dead-zone votes so they can never clear minConfidence. Show the arithmetic.
4. EXIT FIT: does exit geometry fit a dynamic support/resistance pullback thesis? Cite contract values against the module intent.
5. INTERACTION: name any platform layer (regime boosts, fee model, session gates, timeframe assumptions, MTF annotations) that silently contradicts MADynamicSR assumptions.

Rules:
- Every claim needs file:line evidence or a constructed counterexample.
- Do not report wiring-only findings owned by G1-G4.
- Verdict vocabulary: coherent / coherent-with-flaws / incoherent.
- Fable review must grade Mercury's citations and challenge unsupported claims; tier disagreements are findings.
