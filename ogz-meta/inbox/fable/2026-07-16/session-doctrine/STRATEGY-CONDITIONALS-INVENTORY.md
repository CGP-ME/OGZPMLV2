# STRATEGY CONDITIONALS INVENTORY — 2026-07-16
Every conditional across the roster, classified for tournament toggling.
HARD = gates existence (signal suppressed if failed). NUDGE = multiplies/
adds confidence (signal survives, weighted). PARAM = numeric shape knob.
DEAD/COSMETIC = looks like a condition, currently does nothing (three-team
findings) — fix or expose before sweeping. All paths under
config/trading.config.json strategies.<Name> unless noted.

## MADynamicSR (richest gate set — per-flag ablation built in)
conditionFlags.* (each true/false — HARD when on, per R2 design):
- trendGate          HARD  slope must be non-flat (minSlopePct, slopeLookback params)
- extension          HARD  max distance from MA in ATR (maxExtensionAtr)
- firstTouchAfterParabolic HARD  cooldown after parabolic runs
- pullbackCooldown   HARD  bars between touch entries (patternPersistBars)
- confirmationCandle HARD  confirmation candle required
- srAlignment        HARD  200MA S/R side agreement
- structuralValidity HARD-ish  bad SL/TP geometry → multiplier, NOT suppression
  (TEAM3 FLAW: structural-invalid still emits at reduced conf — final-shape input)
approachRules.* (Codex packet approved, landing): HARD side-of-approach —
- allowLongFromAbove (default ON), allowLongFromBelowBullReclaim (default
  OFF — tournament arm), allowLongFromBelowOutsideBull (OFF), symmetric
  short arms. THE regime-conditional gate.
NUDGE: multipliers.* (touchQualityWeight, confirmationMissing, srMissing…)
PARAM: touchZonePct, srTestCount, atrPeriod, baseConfidence, maxConfidence
DEAD/COSMETIC: 123-pattern (_detect123Pattern computed, NEVER gated — Team 3)

## EMASMACrossover
MODE SWITCH (profile-level strategyBehavior.emaCrossover.entryEventsOnly):
- entryEventsOnly=true → events-only entries + trio LIVE
- entryEventsOnly=false → alignment mode + TRIO DEAD (guard at :470 —
  G5+Team3 convergent). OPEN TREY RULING. This one flag flips the whole
  strategy's nature. P0 pins false.
NUDGE (only when events-mode ON): decay (decayBars, decayMinMultiplier),
velocity (velocityWindowBars/Scale/MaxBoost/MaxPenalty), elasticity
(elasticityMinAtr/MaxAtr/Scale/MaxBoost/MaxPenalty), freshCrossoverBonus
PARAM: baseConfidence, confluenceWeight, maxConfidence

## RSI (inline)
HARD: oversoldLevel / overboughtLevel crossings (period param)
TREY SPEC (queued): period→5, buy<35, exit>50, 200MA hard filter (below =
NO trades). Current code lacks the 200MA gate — final-shape input.
FLAW (Team 3): simple-average RSI, not Wilder's — values run hot vs charts.
CANNOT VERIFY: rsiExitLong consumption as dynamic exit.

## DonchianBreakout
HARD: entryPeriod channel break; allowShorts
PARAM: atrStopMult, takeProfitPercent (12% — Team 3: unreachable on 1m,
trail is de facto only exit — final-shape input), trailingStopPercent,
trailingActivation, maxHoldTimeMinutes (10080 = 7 days on 1m — mis-scaled)
NUDGE: extension-scaled confidence (saturates 0.85 ~2ATR — Team 3)

## LiquiditySweep
HARD: sweepLookbackBars swing break + sweepMinExtensionPct (FLAW: tolerance
×5 stated value — Team 3), entryWindowMinutes, candle patterns
(hammerBodyMaxPct/WickMinRatio, engulfMinRatio)
BROKEN GATE: validationsPassed > 0 — passes on 1 of 2 checks (Team 3)
DISABLED GATE: disableSessionCheck=true — session thesis detached (Team 3)
PARAM: atrMultiplier, stopBufferPct

## SmartMoneySweep
NUDGE-ONLY DISEASE (Team 3 critical): conditions score = conditionsMet*100
+ rawConfidence — 0-of-7 conditions still emits 0.625 conf ABOVE threshold.
Conditions (absorb body/wick/vol families, init body, CVD divergence,
LVN location, IVB timing) are all currently NUDGES that read as gates.
Final-shape input: which become HARD minimums (minConditions gate).
HARD: vpRthOnly, sweepMaxOffset, maxDailyLosses/maxHoldBars (exit-side)
PARAM: vpDays/Bins, valueAreaPct, lvnPctile, ATR conviction mults, DST
approximation (BROKEN — off ~1mo at transitions), CVD accumulator drift.

## OpeningRangeBreakout
HARD: OR break (BROKEN: last-candle-wins OR — not a range; three-team
convergent, rebuild on TFE 15m aggregation = final-shape input),
FVG required (minFVGPercent..maxFVGPercent window), entryLevel
PARAM: orDurationMinutes, fvgScanBars, stopBufferPct, targetRR
MISSING GATE (Team 3): no OR-width filter — 5-cent range == 50-cent range.

## OGZTPO (post-restoration df3a11a)
HARD: mode filters (modes.*, restored), tradingLoopOverrideMinStrength,
lastSignalTtlBars (ghost-signal TTL — new)
NUDGE: strengthConfidenceMultiplier, confluenceBonusStrength, voteWeight
PARAM: tpoLength, normLength, volLength, lagBars, dynamicLevelMultipliers

## NoWickImbalance
HARD: level touch (BROKEN per thesis: low<=level fires on ANY wick incl.
continuation candles — close-back-inside requirement ABSENT — Team 3;
final-shape input), maxCandleAge, minBodyPercent, swingLookback
PARAM: slBreathingATR, confidence (flat)

## PropSafeEMAPullback
HARD: cross recency (crossLookbackBars), pullback depth window
(pullbackMinAtr..pullbackMaxAtr — BROKEN: measures single candle,
lookback window dead — Team 3 critical), requireRth (rthStartET/EndET),
allowShorts
NUDGE: confidenceTrendBonus/PullbackBonus/ConfirmationBonus/FreshCrossBonus
PARAM: fast/pullback/trend EMA periods, atrStopMult, targetRR, trail pair,
maxHoldTimeMinutes

## EMATrendRetest (cleanest — Team 3: coherent)
HARD: minSlopePct over slopeLookbackBars, retest touch (touchZoneAtr),
closeAwayAtr confirmation, maxExtensionAtr, requireRth, allowShorts
NUDGE: confidenceSlopeBonus/RetestBonus/ConfirmationBonus
PARAM: emaPeriods, atrStopMult, targetRR, trail pair, maxHold

## RSI2MeanReversion (Trey seeds live)
HARD: rsiEntry (<10), trendPeriod 200MA gate, rsiEntryOB (95 blowoff
skip), allowShorts(false), rsi2_exit_long (>80 — dedicated key, no generic
substitute; WAKE proof)
NUDGE: confidenceDepthMultiplier (deeper oversold = more conf)
PARAM: stopLossPercent, takeProfitPercent, trail pair, maxHold

## TimeSeriesMomentum
HARD: lookback return sign + minReturn threshold, trendPeriod alignment,
allowShorts
NUDGE: confidenceReturnMultiplier
PARAM: stopLossPercent/takeProfitPercent, trail pair, maxHoldTimeMinutes
(240min — Team 3: caps trend runners, contradicts thesis — final-shape)

## PLATFORM-LEVEL GATES (apply to all — sweep dimensions, not per-strat)
- confidence.minTradeConfidence (THE entry bar; matrix already sweeps it)
- orchestrator minCandles* (warmup per strategy), fibDistance*/fibBoost*
- confluence: regimeMinConfidence, confluenceMinScore, tpoStrengthMin
- exitContracts.<Strategy>: SL/TP/trail/maxHold per strategy (the exit
  geometry — Lane 6b arms: atrContracts, partial-exit intent, terrain)
- RiskManager (post R-DD): Trey-ratified vetoes only
- REMOVED by ruling (never sweep back): fee gate, minProfitAfterFees,
  dormant gate, riskManagerBypass-era blocks pending audit

## SWEEP GUIDANCE
1. DEAD/COSMETIC and BROKEN entries must be fixed or explicitly excluded
   pre-tournament — sweeping a dead flag burns compute measuring noise.
2. MADynamicSR conditionFlags is the ablation template: every strategy's
   HARD gates should be reachable as flags the same way (final-shape work).
3. Combination sweeps: flags are binary dims (2^n) — prioritize per-flag
   ablation (all-on minus one) before full combinatorics.
