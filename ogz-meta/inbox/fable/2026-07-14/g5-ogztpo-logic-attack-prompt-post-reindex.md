MERCURY ATTACK TEMPLATE -- G5: STRATEGY LOGIC COHERENCE

Index contract:
- Active index timestamp: 2026-07-14T21:29:42.731Z
- Active indexed SHA: a476afbed787c79a210f427a8509afa11123f9a0
- Current HEAD to attack: a476afbed787c79a210f427a8509afa11123f9a0
- If your retrieved/indexed context disagrees with HEAD for these files, say stale_index and stop.

Scope:
- core/OgzTpoIntegration.js:60-337
- src/indicators/ogzTwoPoleOscillator.js:106-353
- core/StrategyOrchestrator.js:624-708 and 1646-1699
- config/trading.config.json:1-10, 1332-1339, 1744-1753, 1786-1790

Operator intent:
OGZTPO is the two-pole oscillator strategy. It should detect real TPO crossovers, only trade high-probability zone crosses, convert action to the correct side, scale confidence from signal strength honestly, and use the TPO dynamic levels/static OGZTPO exit contract in a way that matches the oscillator thesis.

PROMPT:
You are attacking the LOGIC of OGZTPO, not its wiring. Trace the full causal chain and attack every link:

1. THESIS -> TRIGGER
Does the entry condition actually detect what the TPO crossover thesis claims? Name any market state that satisfies the trigger while violating the thesis, and any thesis-valid state the trigger misses. File:line.

2. TRIGGER -> DIRECTION
Is the BUY/SELL assignment correct in all oscillator/regime contexts? Construct a concrete counterexample candle/TPO sequence where it votes the wrong side, or state none found. File:line.

3. CONFIDENCE MATH
Does strength/highProbability/confluence/mode/voteWeight/tpoStrengthMin/tpoStrengthMultiplier move confidence in the thesis direction? Any inversion, saturation, dead-zone, or config value that makes votes unable to clear or too easy to clear? Show arithmetic using landed config values. File:line.

4. EXIT FIT
Does the exit geometry match the OGZTPO thesis? Compare dynamic levels from the TPO integration to the static OGZTPO exit contract and the orchestrator overrideLevels path. Cite file:line.

5. PLATFORM INTERACTION
Name any platform layer that silently contradicts OGZTPO assumptions: feature-flag defaults, inline self-contained registration, warmup, two oscillator copies, TPO MTF config block, static strategy config, or final minStrategyConfidence gating. Cite file:line.

Rules:
- Logic only. Do not propose code changes.
- Every claim must carry file:line evidence or a constructed counterexample.
- No wiring-only findings unless the platform interaction directly contradicts the strategy thesis.
- Verdict vocabulary only: coherent, coherent-with-flaws, incoherent.
