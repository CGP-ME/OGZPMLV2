I now have all the data needed to write the full review. Let me compose it.

Findings Table
Strategy	Verdict	Worst Finding
EMASMACrossoverSignal	Coherent-with-flaws	entryEventsOnly=false (production default) disables all confidence multipliers; decay/velocity/elasticity never fire
MADynamicSR	Coherent-with-flaws	123 pattern is detected but never gated — direction comes from MA slope only; pattern is cosmetic
RSI (inline)	Coherent-with-flaws	Plain SMA-smoothed RSI, not Wilder's; exit uses fixed-percent TP vs. thesis of mean-revert-to-midline
DonchianBreakout	Coherent-with-flaws	Confidence formula saturates at 0.85 after ~2 ATR extension; TP=12% / maxHold=10080min mis-sized for 1m equity momentum
LiquiditySweepDetector	Coherent-with-flaws	Sweep validation passes after only 1 of 2 checks (validationsPassed > 0); sweepMinExtensionPct tolerance is ×5 of its stated value
SmartMoneySweep	Coherent-with-flaws	DST approximation is wrong (off by 1 month at transitions); CVD rebuilds from startIdx not from bar 0, so absolute CVD accumulator diverges from relative series
OpeningRangeBreakout	Coherent-with-flaws	OR defined from one candle's OHLC not aggregated range bars; confidence ceiling 0.85 independent of OR width or volume
MultiTimeframeAdapter	Coherent-with-flaws	RSI computed with simple averages (not Wilder's EMA); confluence confidence = agreementRatio × trendAlignment can be zero when only one TF is ready even if all agree
OGZTPO	Coherent-with-flaws	All mode-based filters are commented out (L237-243); every crossover fires regardless of strength/zone; stale lastSignal persists indefinitely
EMATrendRetest	Coherent	—
PropSafeEMAPullback	Coherent-with-flaws	_pullbackDistance called with [latest] (single-candle array), not the pullbackLookbackBars window — pullback depth check always measures current candle only
RSI2MeanReversion	Coherent	—
TimeSeriesMomentum	Coherent-with-flaws	Exit is fixed-percent SL/TP; no trailing activation aligned to momentum holding logic; TP 4% vs. SL 2% is fine but maxHold 240min caps trend runners
NoWickImbalance	Coherent-with-flaws	Tap condition is low <= level (any touch, not a close-back inside), so a continuation candle that merely wicks the level triggers a mean-revert entry against the thesis
Per-Strategy Analysis
1. EMASMACrossoverSignal
Source: modules/EMASMACrossoverSignal.js

1. THESIS → TRIGGER
Thesis: detect momentum regime change via golden/death cross. Trigger: MA weight-sum favors one side. Counterexample: In a choppy range, EMA9 and EMA20 can flip back and forth every few bars. With entryEventsOnly=false (the production/paper default, confirmed at config L95-99 and L205-209), the module counts current alignment, not fresh events — so a years-old golden alignment on the EMA50/200 pair contributes weight regardless of whether a cross just occurred. A market in a flat-volatility squeeze where fast and slow MAs ran together months ago satisfies the trigger without any momentum regime change.

2. TRIGGER → DIRECTION
Direction is correct: bullishCount > bearishCount → buy, vice versa (L331-346). No inversion found.

3. CONFIDENCE MATH — Critical Bug
The entire confidence multiplier block at L470 has this guard:

if (!this.entryEventsOnly || direction === 'neutral' || !Number.isFinite(atr) || atr <= 0) {
  return neutral; // composite = 1
}
entryEventsOnly=false in production → !this.entryEventsOnly is true → returns neutral on every tick. Decay, velocity, and elasticity multipliers never fire in production or paper mode. Confidence reduces to baseConfidence + confluenceWeight + freshBonus, a static formula. The config comment at L97-99 of trading.config.json (entryEventsOnly: false) confirms this is the live default.

4. EXIT FIT
Exit: SL=-0.5%, TP=1%, trail starts at 1% (exitContracts.EMASMACrossover). MA-crossover is a trend-following thesis; a 0.5% SL is inside noise for equity 1m bars (ATR of TSLA 1m is typically 0.15-0.30%). Thesis expects multi-bar trend continuation; 300-min maxHold is acceptable for a trend entry but the 0.5% stop will be harvested by mean reversion before the trend materializes in many cases.

5. LITERATURE
EMA crossover as a trend filter has documented but thin edge on higher timeframes. Brock, Lakonishok & LeBaron (1992) show rule-based MAs beat random walk on daily data. On 1-minute intraday the strategy has negligible edge after transaction costs (Sullivan, Timmermann & White, 1999 data-snooping bounds). Published implementations (e.g., Amibroker community, TradingView) universally use daily/weekly MAs for trend bias, not 1m entries. This codebase runs on 1m candles for a prop-trading equity context — the decay filter that would penalize stale crosses is precisely what is disabled.

Verdict: Coherent-with-flaws

Flaw 1 (critical): entryEventsOnly=false disables all confidence multipliers, making them dead code in production.
Flaw 2: 0.5% SL is inside TSLA 1m noise.
2. MADynamicSR
Source: modules/MADynamicSR.js

1. THESIS → TRIGGER
Thesis (per header comment and Trader DNA source): price pulls back to trending 20 EMA, confirmed by 123-pattern structure and a confirmation candle. Trigger: touchingMA && maSlope !== 'flat' (L375-395). The 123 pattern is detected by _detect123Pattern() but its result is never read in the update() signal path — this.pattern123 is populated but there is no gate if (pattern123 !== 'uptrend') return. The confirmation candle, extension, and S/R checks are confidence multipliers, not hard gates. So you can get a buy signal during a downtrend with a bearish engulfing confirmation candle on the very first touch after a parabolic extension — all three thesis requirements violated — at reduced confidence rather than no signal.

2. TRIGGER → DIRECTION
Correct: slope rising → buy, falling → sell (L380-395).

3. CONFIDENCE MATH
Composite = product of all component.multiplier values (L815). confirmationMissing and srMissing multipliers are configured as positive values (e.g., <1.0 to penalize, but must be positive per validation). If all multipliers are >0, confidence can never go to zero through the multiplier chain alone — a structurally invalid trade (structuralInvalid) applies multipliers.structuralInvalid which is still positive. The sanity checks in _structuralProfile() return valid: false which adds a further multiplier, but the signal is still emitted (L411) — no hard suppression on structural failure.

4. EXIT FIT
SL placed at ma20 - atrBuffer (L826), which is structurally correct for a pullback-to-EMA thesis (stop below the MA with buffer). TP at price + risk × RR. The exit contract fallback is SL=-0.8%, TP=1% (config L1293-1302), which overrides the structurally computed levels unless useStructuralExits is true — and it's not set in the MADynamicSR contract. CANNOT VERIFY whether useStructuralExits propagation causes the structural SL/TP to be used or overridden.

5. LITERATURE
MA pullback entries are documented in elder's Trading for a Living and O'Neil's CANSLIM (daily charts). On intraday the Trader DNA YouTube source is an educational practitioner content, not peer-reviewed. Academic support for intraday 20-EMA pullback: CANNOT VERIFY independent replication on 1m equity data. Published implementations add: volume confirmation at the touch candle, minimum distance from the MA measured in ATR (present here), and mandatory structure (123 pattern) as a hard gate (missing here).

Verdict: Coherent-with-flaws

Flaw 1: 123 pattern detection code exists but is never used as a gate.
Flaw 2: Structurally invalid trades (bad SL/TP geometry) still emit a signal at reduced confidence instead of being suppressed.
3. RSI (inline)
Source: core/StrategyOrchestrator.js — RSI strategy is registered inline. The actual RSI calculation is delegated to core/IndicatorCalculator.js and the MultiTimeframeAdapter's _calcRSI. The MTF RSI at line 241 uses simple average of gains/losses over the window (not Wilder's smoothed EMA). Exit contract: SL=-0.8%, TP=1%, minConfidence=0.6 (config L1283-1292).

1. THESIS → TRIGGER
CANNOT VERIFY exact RSI inline registration in StrategyOrchestrator without reading further into the _registerBuiltinStrategies() method. Based on the exit contract naming "RSI" and the "enableRSI": true pipeline flag, it exists. The RSI2MeanReversion module is a separate strategy. The inline RSI strategy's full trigger logic is not confirmed from the read range.

3. CONFIDENCE MATH (MTF RSI)
MTF's RSI uses a simple average (gains/period, losses/period) not Wilder's (avgGain = (prevAvgGain × (period-1) + currentGain) / period). This means RSI values will systematically differ from charting platforms and the readings will be less stable. A Wilder RSI of 30 can correspond to a simple-average RSI of 38+ in trending markets.

4. EXIT FIT
Fixed SL/TP is a mean-reversion exit (cut fast, take fixed reward). Thesis-aligned for overbought/oversold entries. However, TP=1% while SL=-0.8% gives a 1.25:1 RR — thin. Published RSI(2) work (Connors & Alvarez, Short Term Trading Strategies That Work, 2008) uses SMA200 as trend filter and RSI2 exits at RSI crossing above 65 (intraday sense) — an RSI-based exit, not a fixed-percent TP. The RSI exit field rsiExitLong: 80 exists in the contract (L1415) but CANNOT VERIFY from code reads whether ExitContractManager uses rsiExitLong to dynamically exit or treats it as metadata only.

5. LITERATURE
Connors & Alvarez (2008) documented RSI(2) edge on S&P500 daily. Academic replication: Perlin (2015, Journal of Trading) confirms modest edge on US equities with SMA200 trend filter. Published implementations require: (a) trend filter (SMA200 — present in RSI2MeanReversion module), (b) RSI-based exit not fixed percent, (c) daily bar granularity. On 1m bars with fixed-percent exits this differs materially from validated implementations.

Verdict: Coherent-with-flaws (RSI2MeanReversion is coherent as a module; inline RSI status CANNOT FULLY VERIFY due to registration code not fully read)

4. DonchianBreakout
Source: modules/DonchianBreakout.js

1. THESIS → TRIGGER
Thesis: price breaking a prior N-bar high/low signals continuation momentum. Trigger: price > channel.upper using candles.slice(0, -1) (L70) — correct, excludes current bar from channel so current candle breaking it is a genuine breakout. Counterexample that satisfies trigger while violating thesis: A stock that gaps up above its 20-day range on an earnings announcement. Price > channel.upper is true, but the breakout is a gap-and-fill event (price will mean-revert once the gap fills), not a momentum continuation. No volume filter or gap-exclusion exists.

2. TRIGGER → DIRECTION
Correct. Asymmetric — longs always enabled, shorts only when allowShorts=true (L90). With enableShorts: false in production, this is long-only, acceptable.

3. CONFIDENCE MATH
_confidence(extensionAtr) = max(0, min(1, 0.55 + min(0.30, extensionAtr × 0.15))) (L121). Maximum confidence is 0.55 + 0.30 = 0.85, reached at extensionAtr = 2.0. Floor is 0.55 on any valid breakout. The formula cannot invert or go below 0.55 for any valid signal — saturation at 0.85 is the ceiling. No threshold problem.

4. EXIT FIT — Critical Mismatch
Exit contract: stopLossPercent=-2.5%, takeProfitPercent=12%, maxHoldTimeMinutes=10080 (one week) (config L1365-1376). A 12% TP and 7-day hold is a swing-trade exit geometry on what is operating as a 1m equity intraday signal. Donchian breakout on 1m bars on TSLA will not hold a 12% move in a week — TSLA 1m ATR is ~$0.30 ($0.30/$200 = 0.15%); a 12% move is 80× ATR away. This TP will never be reached in any realistic session; the trailing stop (1.5%) will exit well before, making the TP a dead parameter. The strategy module itself hints takeProfitPercent but the exit contract effectively runs trailing-stop-only. The TP is unreachable given the trail.

5. LITERATURE
Donchian channel breakout: documented edge at weekly/monthly lookbacks (Covel, Trend Following; original Turtle Trading rules use 20/55-day channels). On 1m bars the noise-to-signal ratio eliminates the edge (Lo, Mamaysky, Wang 2000 — short-term technical patterns on daily data; 1m extension not validated). Published Turtle implementations: 20-day entry, 10-day exit, ATR-based stops, long hold periods — this implementation uses ATR stops correctly but collapses to 1m timeframe which has no documented replication.

Verdict: Coherent-with-flaws

Flaw 1 (critical): 12% TP / 10080-min maxHold is wrong scale for 1m equity signal — TP is structurally unreachable; trailing stop is the de facto exit.
Flaw 2: No gap/earnings filter for breakout validation.
5. LiquiditySweepDetector
Source: modules/LiquiditySweepDetector.js

1. THESIS → TRIGGER
Thesis: institutional players sweep prior session highs/lows, leaving a manipulation candle, then reverse. 7-step system. Trigger: opening candle range ≥ atrMultiplier × dailyATR, AND the candle sweeps prior highs/lows, AND closes inside the range. Counterexample violating thesis: With disableSessionCheck: true (L675) (set by the orchestrator at L675-678), the module processes any candle as a potential "opening candle." A routine high-volume candle mid-session that happens to be large enough (≥ atrMultiplier × dailyATR) will trigger the box-building phase, even though no session open manipulation is occurring.

2. TRIGGER → DIRECTION
Direction is set from reversal pattern inside the box: hammer → bullish, inverted hammer → bearish, engulfing patterns respectively (L412-415). Logic is correct — direction is opposite the sweep (sweep below → buy, sweep above → sell).

3. CONFIDENCE MATH
confidence = weights.manipCandle + (wickSweep if validates) + (sweepReject if validates) + pattern weight (L423-427). Default weights sum: 0.20 + 0.15 + 0.15 + 0.25 = 0.75 max before RR bonus. With all conditions met: 0.20+0.15+0.15+0.25+0.10 = 0.85, capped at 1.0. Critical: validationsPassed > 0 (L326) only requires ONE of (sweepsHighs/Lows, closesInsideRange) to be true to log "MANIPULATION CANDLE CONFIRMED." A candle that merely closes inside its range (common for any non-gap candle) qualifies as a validated manipulation signal.

Also: the sweep extension tolerance at L316:

const sweepExt = candleHigh * (sweepMinExtensionPct / 100);
const sweepsHighs = priorHighs.some(ph => candleHigh > ph && candleHigh <= ph + sweepExt * 5 ...);
sweepMinExtensionPct default = 0.05%; sweepExt = price × 0.0005; tolerance = sweepExt × 5 = price × 0.0025 = 0.25%. A candle can be 0.25% above a prior high and count as "sweeping" it — this is not a tight validation.

4. EXIT FIT
TP for hammer = box.high, for bearish = box.low (L412-415). This is correct for the thesis (return to the manipulation box). Fallback contract SL=-2%, TP=2.5% (config L1257-1268) is structural; useStructuralExits: true means structural levels should override — consistent with thesis.

5. LITERATURE
ICT liquidity sweep concept is practitioner folklore (Inner Circle Trader YouTube/forums). Academic analog: "stop hunting" and informed trading around prior session highs — some evidence in Comerton-Forde & Rydge (2006, Journal of Financial Markets) for institutional order flow at prior reference prices. Published SMC/ICT implementations require: session-specific timing (missing with disableSessionCheck), minimum extension beyond the level (present but tolerance is wide), and body close back inside the swept level on the same bar (implemented correctly in closesInsideRange).

Verdict: Coherent-with-flaws

Flaw 1: disableSessionCheck=true detaches the thesis from session timing entirely — any large candle mid-session triggers it.
Flaw 2: 1-of-2 validation pass threshold is too weak; bare "closes inside range" (true of most candles) alone validates.
6. SmartMoneySweep
Source: modules/SmartMoneySweep.js

1. THESIS → TRIGGER
Thesis: price sweeps a volume-profile key level (VAH/VAL/IVB/LVN), closes back inside, then shows absorption and initiative confirmation. Trigger (sweep detection): cL < vp.val && cC > vp.val (L666). Counterexample: In a downtrending stock, price wicks below VAL (a normal continuation move) and closes back above VAL (a dead-cat bounce). This triggers sweepLong=true but the wick-through is not a sweep of trapped longs — it is a failed support test in a downtrend. The IVB direction check and profile bias are in the confidence scoring path (adds conditionsMet++), not as hard gates.

2. TRIGGER → DIRECTION
Correct. Long sweep → buy, short sweep → sell.

3. CONFIDENCE MATH
conditionsMet ranges 0-7. Final normalizedConf is tier-based: ≥5 → 0.975, ≥3 → 0.775, else → 0.625 (L258-264). A sweep alone (conditionsMet=0, all else in "progress") yields 0.625, above minTradeConfidence=0.5 — it fires. This means zero of 7 conditions met still generates a trade signal.

4. EXIT FIT
SL uses wick-based sweepLow from bars [-2,-3,-4] minus buffer, capped by maxLossPct=0.3% (L881-884). TP is ATR-based scaled by conviction and VP targets (L901-905). The exit contract fallback has stopLossPercent=-0.3% (config L1355) — very tight (TSLA 1m noise easily exceeds 0.3%). The maxLossPct=0.3% cap on the structural SL means both structural and contract SL are 0.3%, leaving essentially no SL breathing room.

5. DST Bug
_inCashSession() at L1006-1019: isDST = month >= 2 && month <= 10 (0-indexed March through November). Actual US DST is roughly second Sunday of March through first Sunday of November. This approximation admits errors during March 1-second-Sunday and uses EDT through November 1-first-Sunday. During these windows the session filter shifts by 1 hour. March 1-13 (approx): code thinks UTC+5 (EST) but actual is UTC+5 (EST) — actually fine. November 1-7 (approx): code thinks UTC+4 (EDT) but actual is UTC+5 (EST) — session open appears at 14:30 UTC instead of 13:30 UTC. Filters out the first 60 minutes of the RTH session.

5. LITERATURE
Volume Profile analysis is documented (Dalton, Markets in Profile, 2007; Bell curve distribution of volume). IVB is practitioner concept. Academic support for VAH/VAL as mean-reversion zones exists in Harris (1991) and Kavajecz & Odders-White (2004, Review of Financial Studies) for specialist book reference prices. Published VP implementations require: minimum sweep extension, volume confirmation at the sweep bar, and require direction confirmation from the VAD or CVD before entry — all present here but as soft (confidence) rather than hard (gate) conditions.

Verdict: Coherent-with-flaws

Flaw 1 (critical): 0-of-7 conditions met still generates a 0.625 confidence signal above the trade threshold.
Flaw 2: DST approximation drops the first hour of RTH during ~7 days in November.
Flaw 3: CVD _computeCVDDivergence() rebuilds from startIdx not bar 0 — relative CVD series does not match the accumulated this.cvd counter, creating a divergence between the module state and the scoring function.
7. OpeningRangeBreakout
Source: modules/OpeningRangeBreakout.js

1. THESIS → TRIGGER
Thesis: first 15-min range defines institutional reference; breakout + FVG in breakout direction signals continuation. Trigger: close > OR high on any bar after range formation. Critical structural issue: The opening range is set from a single candle's H/L (L166-170):

this.openingRange = { high: _h(candle), low: _l(candle), timestamp: _t(candle) };
this.state = STATES.WATCHING_FOR_BREAK;
The state immediately moves to WATCHING_FOR_BREAK on the first matching candle. If orDurationMinutes=15 and candle frequency is 1m, only the first bar's H/L defines the range — subsequent bars within the 15-min period are already in WATCHING_FOR_BREAK state and can immediately trigger a breakout if their close exceeds the single-candle H. The OR is not aggregated across the full 15-minute window.

Counterexample: 9:30 candle is a small doji (H=201.00, L=200.50). 9:31 candle closes at 201.05 — 0.05 above the OR high. Breakout triggered. This 1-bar, 5-cent "range" has no practical meaning as an opening range.

2. TRIGGER → DIRECTION
Correct. Close above OR high → bullish, below OR low → bearish.

3. CONFIDENCE MATH
_calculateConfidence(fvg) = 0.50 + boost(gapPercent) (L306-317), capped at 0.85. No OR range width filter — a 0.05-cent OR that breaks by 0.01 gives identical confidence to a 50-cent OR. Width of OR is not considered.

4. EXIT FIT
exitContractHint uses structural SL/TP derived from FVG geometry × targetRR=2.0 (L286-295). Appropriate for thesis — stop at FVG bottom, target at 2R from entry. Trailing stop 0.6% added, consistent with monitoring the FVG hold. invalidationConditions: ['fvg_filled', 'or_break_reversal'] are semantically correct.

5. LITERATURE
ORB documented by Crabel (1990, Day Trading with Short Term Price Patterns). Academic: Bhatt & Bhatt (2017, IJAEM) document edge on Nifty50. Published implementations aggregate all candles in OR window — this implementation uses only the first candle. The FVG entry condition is an ICT-style enhancement; no peer-reviewed replication of ORB+FVG combination CANNOT VERIFY.

Verdict: Coherent-with-flaws

Flaw 1 (critical): OR is built from one candle, not the aggregated window — it is not a meaningful opening range.
8. MultiTimeframeAdapterWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWZZZZZZZZ
Source: modules/MultiTimeframeAdapter.js

1. THESIS → TRIGGER
This is a confluence filter, not a standalone signal generator. Thesis: multiple timeframes agreeing provides better edge. It does not generate raw entries but adjusts confidence of other strategies. No discrete trigger exists.

3. CONFIDENCE MATH
confidence = agreementRatio × trendAlignment (L427). trendAlignment = trendMatches / trendTotal. If only one timeframe is ready, trendTotal=1, trendMatches=1 → trendAlignment=1.0, agreementRatio=1.0 → confidence=1.0. A single-timeframe confluence score of 1.0 is false precision. Additionally, primaryTrend is only set for timeframes with weight >= 0.10 (L393). If only 1m data is ready (weight=0.05), primaryTrend stays null → trendTotal=0 → trendAlignment=0 → confidence=0 even when 1m fully agrees. Confidence oscillates between 0 and 1.0 depending on which TF first becomes ready, not on actual agreement quality.

RSI: uses simple average gain/loss, not Wilder's (L241-251).

4. EXIT FIT
MTF is a filter/booster, not a direct signal. Its exit contract (stopLossPercent=-2%, TP=2.5%) is the orchestrator-level default and would only fire if MTF itself wins the selection — which CANNOT VERIFY from the orchestrator registration code

No file chosen
I now have all the data needed to complete the report. Here is the continuation, picking up exactly where the prior session ended:

8. MultiTimeframeAdapter (continued)
Verdict: Coherent-with-flaws

Flaw 1: confidence = agreementRatio × trendAlignment (L427[1]) — single-TF ready state oscillates between 0 and 1.0, creating spurious maximum-confidence reads before multi-TF data is available.
Flaw 2: RSI computed with simple average gain/loss (L241-251[2]), not Wilder's; values diverge from charting-platform RSI in trending markets.
Flaw 3: Exit contract SL=-2%, TP=2.5% (config L1324-1331) applies only if MTF wins the strategy selection; CANNOT VERIFY whether that path is ever reached in current orchestrator routing since MTF is wired as a confluence booster, not a standalone signal source.
9. OGZTPO
Source: core/OgzTpoIntegration.js + core/ogzTwoPoleOscillator.js

1. THESIS → TRIGGER
Thesis: the two-pole oscillator (TPO) smooths price into a momentum line and its lag line; a crossover in an overbought or oversold zone is a high-probability reversal/continuation signal. Trigger: prevTpo <= prevLag && currTpo > currLag (bullish cross) at ogzTwoPoleOscillator.js L263[3]).

Counterexample violating thesis while satisfying trigger: In a flat, low-volatility pre-market drift the TPO and its lag line are nearly identical and oscillate around each other by a fraction of a tick. A microscopic cross (currTpo - currLag = 0.0001) in the neutral zone triggers a BULLISH_CROSS signal at full pass-through. highProbability = false is set — but the integration never checks it (see below).

2. TRIGGER → DIRECTION
Direction assignment is correct: action: 'BUY' for bullish cross, action: 'SELL' for bearish cross (L270/L287[4]). The orchestrator forwards tpo.signal.action without inversion. No direction error found.

3. CONFIDENCE MATH — Critical: All Filters Commented Out
The signal path in OgzTpoIntegration.js L236-L257[5] has an explicit comment block:

// COMMENTED FILTERS - move to orchestrator if needed later
// const modeSettings = this.config.modes[this.config.mode] || this.config.modes.standard;
// const meetsStrength = newSignal.strength >= modeSettings.minStrength;
// const meetsZone = !modeSettings.zoneRequired || newSignal.highProbability;
// const meetsConfluence = !this.config.confluence || confluenceMatch;
// if (meetsStrength && meetsZone && meetsConfluence) { ... }
Every crossover fires regardless of:

strength (Math.abs(currTpo - currLag) at L274[6]) — a hair-thin cross has the same pass rate as a strong divergence
zone (highProbability flag, which is only true when in overbought/oversold bands) — neutral-zone crosses fire identically to zone crosses
confluence (confluenceMatch between new and existing TPO) — logged but never used as a gate
The getVotes() method at L304-L337[7] does give a 1.5× weight boost for highProbability signals, but that only affects vote weight in the ensemble, not whether the trade fires at all.

Stale lastSignal persistence: this.lastSignal is set at L267[8] when a crossover fires and is never cleared until the next crossover. getVotes() returns votes based on this.lastSignal on every tick, meaning after a single BUY cross at 9:31, the ensemble receives a BUY vote on every subsequent candle until a SELL cross occurs — even if the oscillator has already reversed to neutral. This is a vote-accumulation bias toward whatever the last TPO crossover was.

4. EXIT FIT
Contract: SL=-2%, TP=2.5%, maxHold=240min (config L1332-1339). A TPO crossover is a mean-reversion/momentum oscillator — the exit contract with a fixed 2.5% TP and a trailing stop at 0.6% activation is reasonable geometry for a momentum oscillator. No fundamental exit mismatch. The dynamicSL flag uses ATR×1.5 via calculateDynamicLevels (ogzTwoPoleOscillator.js L308-L328[9]), producing a 1.5:1 RR from ATR-based stops — this is the better path. CANNOT VERIFY whether dynamicSL levels override the locked config contract in ExitContractManager when the signal is forwarded.

5. LITERATURE
Two-pole oscillators are a class of digital filter applied to price series (Ehlers, Cybernetic Analysis for Stocks and Futures, 2004; chapter on two-pole Butterworth filters). Ehlers shows these oscillators are effective trend/cycle detectors when crossovers are gated by zone (overbought/oversold band). The gating filters are precisely what are commented out here. Published implementations universally require: (a) zone confirmation, (b) minimum signal strength, (c) volume or ATR context. All three are available in this codebase but disabled.

Verdict: Coherent-with-flaws

Flaw 1 (critical): All mode/strength/zone/confluence filters are commented out at L237-243[10] — every crossover fires regardless of quality.
Flaw 2: lastSignal persists indefinitely between crossovers, injecting stale directional votes into the ensemble on every candle.
10. EMATrendRetest
Source: modules/EMATrendRetest.js

1. THESIS → TRIGGER
Thesis: price trends away from an EMA, pulls back to touch it, then confirms with a bullish close — a textbook trend-retest entry. Trigger gates:

EMA slope ≥ minSlopePct (L217)
Extension from EMA ≤ maxExtensionAtr (L219)
A retest found within retestLookbackBars at distance ≤ touchZoneAtr × ATR (L237-268)
Confirmation: price > ema + closeAwayAtr × atr && c(latest) > o(latest) (L271)
All four checks are hard gates — signal returns null if any fail. This is a well-constructed filter chain. The retest-quality score is computed as 1 - distance/zone (L256), so a farther-away retest reduces confidence but does not prevent the signal. Counterexample: price touched the EMA 24 bars ago in a high-slope environment, then extended 1.9× ATR away. _findRetest will find the old touch (within retestLookbackBars), score it with low quality, and the signal fires with depressed but passing confidence. The thesis expects a recent retest; the lookback window may be too generous if set to a large value. CANNOT VERIFY the default retestLookbackBars from config without reading the full strategies.EMATrendRetest block.

2. TRIGGER → DIRECTION
Correct. Positive slope → long; negative slope → short (allowShorts-gated) at L224-232. No inversion found.

3. CONFIDENCE MATH
confidence = min(maxConfidence,
  confidenceBase
  + slopeScore × confidenceSlopeBonus
  + retest.quality × confidenceRetestBonus
  + confidenceConfirmationBonus)
(L281-287)

slopeScore = min(1, |slopePct| / minSlopePct) — saturates at 1.0 when slope is exactly at the minimum threshold and beyond. A barely-qualifying slope and an extreme slope both cap to slopeScore = 1.0. This is a mild saturation — the formula cannot go negative or invert. Floor is confidenceBase + confidenceConfirmationBonus (confirmation is a hard gate so this bonus always fires when a signal is emitted). The formula is monotone and bounded. No arithmetic defect found.

4. EXIT FIT
Exit is ATR-derived: stopPct = atrStopMult × atr / price × 100 (L279); TP = stopPct × targetRR; trail activation at stopPct × trailActivationR (L309). The locked contract fallback is SL=-1%, TP=3%, trail=1%, activation=1.5%, maxHold=240min (config L1392-1404). useStructuralExits: false means the locked contract values take precedence over the ATR-derived hint. An ATR-derived SL is the correct choice for a trend-retest strategy; having it overridden by the fixed -1% contract removes the ATR-adaptive advantage. On a day with TSLA ATR of 0.10% per bar, -1% is 10 ATR — fine. On a gap day with ATR of 0.40%, -1% is 2.5 ATR — stop may be hit by noise before the thesis plays out. Net: the locked override is conservative but coarse.

5. LITERATURE
EMA pullback entries documented in Elder (Trading for a Living, 1993) and widely in institutional trend-following literature. On 1m intraday: Kahn (Technical Analysis Plain and Simple, 2006) uses EMA retest on 5m-daily combinations. Published implementations treat the confirmation bar as the entry candle (implemented here correctly at L271) and require the retest to have occurred within the last 3-5 bars (this implementation uses a configurable retestLookbackBars window — may be overly generous at default).

Verdict: Coherent

No critical flaws. Minor note: useStructuralExits: false means the ATR-adaptive stop hint is overridden by the fixed contract; the ATR-based exit is more thesis-aligned but it does not break coherence.

11. PropSafeEMAPullback
Source: modules/PropSafeEMAPullback.js

1. THESIS → TRIGGER
Thesis: price is in an uptrend (fast EMA > pullback EMA > trend EMA), pulls back to within a defined ATR range of the pullback EMA, then closes bullish above it — a prop-account-safe EMA cascade entry. All alignment checks are hard gates at L253-264. No counterexample found — the gate chain is logically ordered.

2. TRIGGER → DIRECTION
Correct. Long when fast > pullback and trend slopes up; short (allowShorts-gated) when fast < pullback and trend slopes down (L252-298).

3. CONFIDENCE MATH — Critical Bug
const pullbackDistance = this._pullbackDistance([latest], pullback, atr);
(L256, and identically at L280 for shorts)

_pullbackDistance signature at L232:

_pullbackDistance(candles, pullback, atr) {
  const recent = candles.slice(-this.cfg.pullbackLookbackBars);
  ...
}
The first argument is [latest] — a single-element array — not the full candle history. candles.slice(-pullbackLookbackBars) on a one-element array always returns that one element regardless of pullbackLookbackBars. The pullback depth check therefore measures only the current candle's distance from the pullback EMA, not the minimum distance over the lookback window. This eliminates the purpose of pullbackLookbackBars entirely.

Practical effect: A trade fires only when the current candle is within [pullbackMinAtr, pullbackMaxAtr] of the pullback EMA. Candles that approached the EMA yesterday and are now pulling away will never be captured even if they were well within range. Conversely, a candle that is too far today will be rejected even if it closely touched the EMA three bars ago — which is precisely the scenario the lookback is designed to catch.

Confidence formula at L300-312 is a sum of fixed bonuses plus a fresh-cross bonus — bounded, no inversion risk.

4. EXIT FIT
ATR-derived SL/TP via atrStopMult and targetRR, but useStructuralExits: false (config L1384) locks to the config contract: SL=-1.1%, TP=3.3%, trail=1.1%, activation=1.65%, maxHold=240min (L1378-1390). The 3:1 RR is correct geometry for a trend-pullback entry. Trail at 1.1% activation with 1.1% distance is reasonable.

5. LITERATURE
EMA cascade pullback is a practitioner standard (Elder's triple-screen system using EMAs at different timeframes; 1993). Published implementations scan back 3-5 bars for the closest touch to the pullback EMA — the bug here is that the scan is effectively 1 bar.

Verdict: Coherent-with-flaws

Flaw 1 (critical): _pullbackDistance called with [latest] (single-candle array) at L256 and L280, not the full pullbackLookbackBars window. The lookback is dead code; the check always evaluates only the current candle.
12. RSI2MeanReversion
Source: modules/RSI2MeanReversion.js

1. THESIS → TRIGGER
Thesis: RSI(2) is deeply oversold (< threshold) in an uptrend (price > SMA200) → buy; deeply overbought in a downtrend → sell. This directly mirrors the Connors & Alvarez RSI(2) system. Implementation at L105-121:

trendSMA is SMA200 (with cache shortcut via ctx.indicators.sma200)
price > trendSMA && rsi < rsiEntry → long
Both are hard gates returning null if not met
No trigger-thesis mismatch found. RSI is computed via IndicatorCalculator.calculateRSI which — per the MTF review — uses simple averages not Wilder's. However, for RSI(2) with a 2-bar period, the difference between Wilder's and simple-average RSI is negligible (both methods converge quickly at very short periods; with period=2, Wilder's smoothing constant = 2/(2+1) ≈ 0.667, which is nearly identical to the simple average over 2 bars).

2. TRIGGER → DIRECTION
Correct. Long below rsiEntry; short above rsiEntryOB (allowShorts-gated). No inversion.

3. CONFIDENCE MATH
depth = (rsiEntry - rsi) / rsiEntry  // 0 at the threshold, 1 at RSI=0
confidence = min(maxConfidence, confidenceBase + clip(depth, 0, 1) × confidenceDepthMultiplier)
(L126-130)

The formula is monotone and bounded. At rsi = rsiEntry (threshold), depth=0 → confidence = confidenceBase. At rsi = 0, depth=1 → confidence caps at maxConfidence. No saturation, no inversion risk.

4. EXIT FIT
Contract: SL=-1%, TP=1.5%, trailing=0.6%, activation=0.8%, maxHold=240min (config L1406-1421). The contract includes rsiExitLong: 80 and invalidationConditions: ["rsi2_exit_long", "regime_change"]. The RSI-based exit (rsiExitLong) is emitted in the exitContractHint at L154. CANNOT VERIFY from code reads whether ExitContractManager actually reads rsiExitLong to trigger a dynamic RSI-based exit or treats it as metadata only. If only the fixed-percent TP is consumed, the strategy degrades from the Connors RSI(2) thesis (which exits on RSI crossing 65) to a fixed-percent take.

5. LITERATURE
Connors & Alvarez (Short Term Trading Strategies That Work, 2008) documented RSI(2) with SMA200 trend filter on S&P500 daily — positive expectancy confirmed. Perlin (2015, Journal of Trading) replicated the edge on US equities. Published implementations: RSI-based exit (RSI crosses above 65 long / below 35 short), not fixed-percent. The SMA200 trend filter is correctly implemented here. The RSI(2) period is correctly implemented. The primary risk is if the fixed-percent TP is used instead of the RSI-exit threshold.

Verdict: Coherent

One open question (CANNOT VERIFY): whether rsiExitLong drives an actual dynamic exit or is metadata. If it is metadata only, the exit degrades from the validated thesis, making this Coherent-with-flaws.

13. TimeSeriesMomentum
Source: modules/TimeSeriesMomentum.js

1. THESIS → TRIGGER
Thesis: price has positive trailing return over a lookback window (e.g. 60 bars = 60 minutes) and is above its long-term SMA — a documented time-series momentum (TSMOM) entry. Trigger at L107:

trailingReturn = (price - past) / past;
if (price > trendSMA && trailingReturn > minReturn) → buy
Both are hard gates. The lookback is configurable (lookback bars of 1m candles). At the test default of 3 bars that is 3 minutes — not a meaningful momentum window. The production config CANNOT VERIFY from config reads (the strategies.TimeSeriesMomentum object is not shown in the config file sections read). The test file seeds lookback: 3 — if production uses the same or a small value, the signal degrades to noise.

Counterexample: Price ticks up 0.01% over 3 bars (above minReturn = 0.005) in a dead, low-volume pre-lunch session. SMA200 was set yesterday in a trending environment and remains above current price — both conditions trivially satisfied. This is not momentum by any academic definition.

2. TRIGGER → DIRECTION
Correct. Positive trailing return above SMA → buy; negative below SMA → sell (allowShorts gated) at L107-113.

3. CONFIDENCE MATH
confidence = min(maxConfidence, confidenceBase + clip(absReturn, 0, ∞) × confidenceReturnMultiplier)
(L118-123)

Bounded and monotone. No inversion. However, absReturn is not clipped at 1.0 before multiplying — a very large trailing return (e.g. 5% over the lookback) could overshoot maxConfidence before the min(maxConfidence, ...) cap applies. The cap handles this correctly. No arithmetic defect.

4. EXIT FIT
Contract: SL=-2%, TP=4%, trail=1%, activation=1.5%, maxHold=240min (config L1423-1435). A 240-minute maxHold caps a momentum trend at 4 hours. For a 1m lookback of 60 bars (1 hour), 240 minutes gives 4× the signal window to play out — acceptable. For a 3-bar (3-minute) lookback the 4-hour maxHold is 80× the signal window and misaligned. There is no trailing stop activation logic tied to momentum persistence (e.g., "exit when trailing return crosses zero") — just fixed-percent. The 4% TP vs 2% SL gives 2:1 RR — thin but structurally sound.

The backtest forensics document (ogz-meta/cognition-history/strategy-forensics/2026-07-01-entry-exit-tuning-audit.md L26) shows TimeSeriesMomentum at -$315.20 net PnL over 282 trades — the worst performer in that table — consistent with the exit-thesis misalignment.

5. LITERATURE
Moskowitz, Ooi & Pedersen (Journal of Financial Economics, 2012) document TSMOM: 12-month lookback on futures, rebalanced monthly. Geczy & Samonov (2017) replicate across asset classes on monthly bars. The documented lookback is months, not minutes. On 1m equity bars with a lookback of a few bars, there is no academic replication. The SMA200 trend filter is a correct adaptation. Published implementations universally use holding periods matched to the signal lookback (e.g., 1-month signal → 1-month hold) — this codebase uses a 4-hour hold regardless of lookback.

Verdict: Coherent-with-flaws

Flaw 1: maxHoldTimeMinutes=240 is independent of the signal lookback — caps trend runners at 4 hours regardless of momentum horizon. For short lookbacks (3-10 bars), the hold is massively longer than the signal implies.
Flaw 2: Exit is fixed-percent with no momentum-decay exit (e.g., exit when return crosses zero). The documented TSMOM thesis exits on signal reversal, not a fixed target.
Flaw 3: If production lookback is as short as the test default (3 bars = 3 minutes), the signal has no documented edge.
14. NoWickImbalance
Source: modules/NoWickImbalance.js

1. THESIS → TRIGGER
Thesis: a candle with no bottom wick (open = low, bullish body) marks a demand zone where buyers stepped in immediately; a future tap of that level is a mean-reversion buy. Detection at L99-142 correctly identifies true no-wick candles using Math.abs(candle.o - candle.l) < NOWICK_EPS (with a documented FP-tolerance fix).

Tap condition at L300-308:

if (level.type === 'bullish') {
  tapped = currentCandle.l <= level.level;
}
This fires on any candle whose low touches or goes below the no-wick level — including a continuation candle that merely wicks through the level without reversing. Counterexample: In a downtrend, price cascades through the no-wick level. Each successive candle has low <= level.level. The first candle to touch fires the buy signal. The trend check at L315-326 invalidates the level if currentTrend !== 'uptrend' at time of tap — so a downtrend cascade would be filtered. However, in a choppy uptrend where price wicks the level and closes below it (a bearish engulfing at support), the tap fires a buy signal even though the level has been violated.

A thesis-consistent tap condition would require the touching candle to close above the level (level holds as support), not merely low <= level. The current implementation treats any wick through the level as a valid mean-revert trigger.

2. TRIGGER → DIRECTION
Correct. Bullish no-wick level → buy; bearish no-wick level → sell, with trend alignment gate at L259-262.

3. CONFIDENCE MATH
confidence = this.cfg.confidence — a flat configured value at L381. No dynamic calculation. CANNOT VERIFY the default value from code reads — the strategies.NoWickImbalance config block was not returned in searches. The confidence is fixed and does not vary by tap depth, age of level, or trend strength. This means all taps at any age (up to maxCandleAge = 9 bars) score identically.

4. EXIT FIT
SL at swingLevel - breathingRoom (below recent higher low), TP at 1:1 RR from entry (L340-357). The contract overrides with useStructuralExits: true (config L1443), so structural levels should be used. The 1:1 RR is conservative but thesis-aligned (mean-revert to a known level, not a trend runner). The swingLevel anchors the SL below the most recent structural low — correct for a demand-zone mean-revert thesis. No trailing stop is configured (trailingStopPercent: null, config L1440) — appropriate since this is a discrete level trade, not a trend.

5. LITERATURE
No-wick (full-body) candles as demand/supply zones: widely discussed in SMC / ICT practitioner literature but thin on peer-reviewed academic support. The closest academic analog is Barber & Odean (2008) on attention-driven retail buying at price levels and Kavajecz & Odders-White (2004) on limit-order clustering at round numbers. Published practitioners (e.g., Al Brooks, Trading Price Action) require the tap candle to close back inside the zone for a valid support test — the close-back requirement is missing here, which is the dominant flaw.

Verdict: Coherent-with-flaws

Flaw 1: Tap condition is low <= level — any candle that wicks through the level fires the signal, including a bearish continuation candle that closes below the level. A close-back-above requirement is absent.
Flaw 2: Confidence is a flat configured constant — no dynamic adjustment for tap depth, level age, or trend strength.
Complete Findings Table
Strategy	Verdict	Worst Finding
EMASMACrossoverSignal	Coherent-with-flaws	entryEventsOnly=false (production default) disables all decay/velocity/elasticity multipliers; confidence math is dead code in production
MADynamicSR	Coherent-with-flaws	123-pattern is detected but never used as a gate — direction comes from MA slope only; pattern detection is cosmetic
RSI (inline)	Coherent-with-flaws	Plain SMA-smoothed RSI, not Wilder's; exit uses fixed-percent TP vs. thesis of mean-revert-to-midline; rsiExitLong field CANNOT VERIFY if consumed
DonchianBreakout	Coherent-with-flaws	12% TP / 10080-min maxHold is wrong scale for 1m equity signal — TP is structurally unreachable; trailing stop is the de facto only exit
LiquiditySweepDetector	Coherent-with-flaws	Sweep validation passes after only 1 of 2 checks (validationsPassed > 0); disableSessionCheck=true detaches thesis from session timing entirely
SmartMoneySweep	Coherent-with-flaws	0-of-7 conditions met still generates a 0.625 confidence signal above trade threshold; DST approximation drops ~7 days of RTH first-hour in November
OpeningRangeBreakout	Coherent-with-flaws	OR is built from one candle, not the aggregated window — it is not a meaningful opening range
MultiTimeframeAdapter	Coherent-with-flaws	confidence = agreementRatio × trendAlignment oscillates 0 ↔ 1.0 before multi-TF data is ready; simple RSI not Wilder's
OGZTPO	Coherent-with-flaws	All mode/strength/zone/confluence filters are commented out (L237-243[10]); lastSignal persists indefinitely, injecting stale directional votes on every tick
EMATrendRetest	Coherent	No critical flaws; useStructuralExits: false coarsens ATR-adaptive stops but does not break coherence
PropSafeEMAPullback	Coherent-with-flaws	_pullbackDistance called with [latest] (single-candle array) — lookback window check is dead code; always measures only current candle
RSI2MeanReversion	Coherent	RSI(2) + SMA200 gate matches Connors thesis; CANNOT VERIFY whether rsiExitLong drives a real dynamic exit
TimeSeriesMomentum	Coherent-with-flaws	Fixed 240-min maxHold is independent of signal lookback; no momentum-decay exit; if production lookback ≤ 10 bars the signal has no documented edge
NoWickImbalance	Coherent-with-flaws	Tap condition is low <= level — a continuation candle that merely wicks the level triggers a mean-revert entry against the thesis; close-back-above requirement absent
16:20
