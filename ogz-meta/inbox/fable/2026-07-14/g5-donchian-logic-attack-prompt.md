Mercury, break my fix.

G5 STRATEGY LOGIC COHERENCE attack on landed DonchianBreakout code at HEAD.

Scope:
- modules/DonchianBreakout.js:1-135
- core/StrategyOrchestrator.js:1814-1825, 1919, 2446-2464
- config/trading.config.json:1365-1377, 1727-1737
- ogz-meta/specs/TREY-ARCHITECTURE-SPEC-2026-07-02.md:20-33, 134-150

Intent/doctrine:
- DonchianBreakout = trend-following breakout strategy.
- A close above the prior Donchian channel high should imply upside breakout continuation; a close below channel low should imply downside breakout continuation when shorts are enabled.
- Exit geometry should match a trend breakout thesis: wide enough stop/ATR logic, runner/trailing behavior, and no mean-reversion target mismatch.
- Confidence math must scale with breakout quality and not create unreachable or misleading votes.

Attack the LOGIC of DonchianBreakout, not generic wiring.

Trace the full causal chain and attack every link:
1. THESIS->TRIGGER: does prior-channel close breakout actually detect continuation breakout? Name any market state that satisfies the trigger while violating the thesis, and any thesis-valid state the trigger misses. File:line.
2. TRIGGER->DIRECTION: is direction assignment correct in all regime contexts? Construct a concrete counterexample candle/indicator sequence where it votes the wrong side, or state none found with evidence. File:line.
3. CONFIDENCE MATH: do confidence terms move confidence in the thesis direction in all branches? Find any term that can invert, saturate, or dead-zone votes so they can never clear minConfidence. Show the arithmetic using landed config values.
4. EXIT FIT: does exit geometry fit Donchian trend breakout? Cite contract values and exitContractHint behavior against the strategy intent.
5. INTERACTION: name any platform layer (regime boosts, fee model, session gates, timeframe assumptions, MTF annotations, short enablement) that silently contradicts Donchian assumptions.

Rules:
- Every claim needs file:line evidence or a constructed counterexample.
- Do not report wiring-only findings owned by G1-G4.
- Verdict vocabulary: coherent / coherent-with-flaws / incoherent.
- Fable review must grade Mercury's citations and challenge unsupported claims; tier disagreements are findings.
