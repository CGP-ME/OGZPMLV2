/**
 * StrategyOrchestrator.js — Isolated Strategy Entry Pipeline
 * ============================================================
 * 
 * THE FIX FOR THE SOUPY POOLED CONFIDENCE PROBLEM.
 * 
 * BEFORE (broken):
 *   All signals → blend into one number → trade on that number
 *   Result: 8 weak signals = high confidence = bad trade
 * 
 * AFTER (this file):
 *   Each strategy evaluates independently → highest confidence WINS →
 *   winner OWNS the trade (its exit contract, its SL/TP) →
 *   confluence only affects POSITION SIZING (2x for 2 agree, 3x for 3)
 * 
 * INTEGRATION:
 *   const orchestrator = new StrategyOrchestrator(config);
 *   const result = orchestrator.evaluate(indicators, patterns, regime, priceHistory, extras);
 *   // result = { action, direction, confidence, winnerStrategy, exitContract, sizingMultiplier, ... }
 * 
 * WIRING INTO run-empire-v2.js:
 *   Replace the tradingBrain.getDecision() call in analyzeAndTrade() with:
 *     const orchResult = this.strategyOrchestrator.evaluate(indicators, patterns, regime, priceHistory, extras);
 *   Then use orchResult.direction, orchResult.confidence, orchResult.exitContract, orchResult.sizingMultiplier
 * 
 * @module core/StrategyOrchestrator
 */

'use strict';

const { getInstance: getExitContractManager } = require('./ExitContractManager');
const { getNarrator } = require('./TradeNarrator');
// Cache singleton at module load — narrator.enabled is sealed from env vars
// in the constructor, so one lookup lasts the process lifetime. Hot-path
// hooks below check `narrator.enabled` directly; when OFF, the try/catch
// frame is never entered (zero allocation per C1 contract).
const narrator = getNarrator();
const MAExtensionFilter = require('./MAExtensionFilter');
const TradingConfig = require('./TradingConfig');
const OpeningRangeBreakout = require('../modules/OpeningRangeBreakout');

// FIX 2026-03-19: Self-contained strategies — each computes its own signals
// No more ctx.extras handoff — each strategy owns its signal computation
const EMASMACrossoverSignal = require('../modules/EMASMACrossoverSignal');
const MADynamicSR = require('../modules/MADynamicSR');
const LiquiditySweepDetector = require('../modules/LiquiditySweepDetector');
const MultiTimeframeAdapter = require('../modules/MultiTimeframeAdapter');
const OgzTpoIntegration = require('./OgzTpoIntegration');
const SmartMoneySweep = require('../modules/SmartMoneySweep');

class StrategyOrchestrator {
  constructor(config = {}) {
    // Minimum confidence a single strategy needs to fire a trade
    // This is PER-STRATEGY, not aggregate — much more meaningful
    // TUNE 2026-02-27: Raised from 0.25 to filter garbage signals
    this.minStrategyConfidence = TradingConfig.get('confidence.minStrategyConfidence') ?? 0.01;

    // FIX 2026-03-19: Extracted hardcoded thresholds to config
    this.regimeMinConfidence = TradingConfig.get('confidence.regimeMinConfidence') ?? 0.30;
    this.confluenceMinScore = TradingConfig.get('confidence.confluenceMinScore') ?? 0.30;
    this.tpoStrengthMin = TradingConfig.get('confidence.tpoStrengthMin') ?? 0.03;

    // Minimum confluence signals to allow entry (default: 1 = winner alone is enough)
    this.minConfluenceCount = config.minConfluenceCount ?? 1;

    // Position sizing multipliers based on how many strategies agree
    this.confluenceSizing = config.confluenceSizing ?? {
      1: 1.0,   // Single strategy — base size
      2: 1.5,   // Two agree — 1.5x
      3: 2.0,   // Three agree — 2x
      4: 2.5,   // Four+ agree — 2.5x (cap)
    };

    // Strategy definitions — each has an evaluate function
    // These are pluggable: add/remove strategies by editing this array
    this.strategies = [];

    // Opening Range Breakout stateful strategy instance
    // MUST be initialized BEFORE _registerBuiltinStrategies() so closure captures it
    this.orbStrategy = new OpeningRangeBreakout();

    // MA Extension Filter for trend confirmation + first-touch skip
    this.maExtensionFilter = new MAExtensionFilter();

    // FIX 2026-03-19: Self-contained signal modules
    // Each strategy owns its signal computation — no ctx.extras handoff
    this.emaCrossoverModule = new EMASMACrossoverSignal();
    this.maDynamicSRModule = new MADynamicSR();
    this.liquiditySweepModule = new LiquiditySweepDetector({ disableSessionCheck: true });
    const BreakAndRetest = require('../modules/BreakAndRetest');
    this.breakAndRetestModule = new BreakAndRetest();
    const NoWickImbalance = require('../modules/NoWickImbalance');
    this.noWickModule = new NoWickImbalance({
      maxCandleAge: 9,
      slBreathingATR: 0.3,
      swingLookback: 20,
      minBodyPercent: 0.3
    });
    this.mtfAdapter = new MultiTimeframeAdapter({
      activeTimeframes: TradingConfig.get('orchestrator.mtfTimeframes') || ['1m', '5m', '15m', '1h', '4h']
    });
    this.tpoIntegration = new OgzTpoIntegration();
    this.smartMoneySweepModule = new SmartMoneySweep(
      TradingConfig.get('strategies.SmartMoneySweep') || {}
    );

    // SOLO_STRATEGY mode: only enable specified strategies for isolated testing
    // Usage: SOLO_STRATEGY=RSI node tools/parallel-backtest.js ...
    // Supports comma-separated: SOLO_STRATEGY=RSI,EMASMACrossover
    this.soloStrategies = process.env.SOLO_STRATEGY
      ? process.env.SOLO_STRATEGY.split(',').map(s => s.trim().toLowerCase())
      : null;
    if (this.soloStrategies) {
      console.log(`[StrategyOrchestrator] SOLO MODE: Only ${this.soloStrategies.join(', ')} enabled`);
    }

    // FIX 2026-03-19: Load orchestrator config from TradingConfig (no hardcodes)
    this.minCandlesEMA = TradingConfig.get('orchestrator.minCandlesEMA') ?? 20;
    this.minCandlesMASR = TradingConfig.get('orchestrator.minCandlesMASR') ?? 50;
    this.minCandlesSweep = TradingConfig.get('orchestrator.minCandlesSweep') ?? 20;
    this.minCandlesMTF = TradingConfig.get('orchestrator.minCandlesMTF') ?? 30;
    this.minCandlesTPO = TradingConfig.get('orchestrator.minCandlesTPO') ?? 30;
    this.fibDistanceEMA = TradingConfig.get('orchestrator.fibDistanceEMA') ?? 0.5;
    this.fibDistanceMASR = TradingConfig.get('orchestrator.fibDistanceMASR') ?? 0.5;
    this.fibDistanceSweep = TradingConfig.get('orchestrator.fibDistanceSweep') ?? 0.8;
    this.fibBoostNormal = TradingConfig.get('orchestrator.fibBoostNormal') ?? 0.10;
    this.fibBoostGolden = TradingConfig.get('orchestrator.fibBoostGolden') ?? 0.15;
    this.tpoStrengthMultiplier = TradingConfig.get('orchestrator.tpoStrengthMultiplier') ?? 10;

    // Stats tracking
    this.lastEvaluation = null;
    this.evalCount = 0;

    // DIAGNOSTIC FUNNELS - track where signals die (MUST be before _registerBuiltinStrategies)
    this.diagFunnel = {
      EMASMACrossover: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      MADynamicSR: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      RSI: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      LiquiditySweep: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      OGZTPO: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
      SmartMoneySweep: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
    };

    // Register built-in strategies (uses diagFunnel, so must come after)
    this._registerBuiltinStrategies();
  }

  /**
   * Print diagnostic funnel at end of backtest
   */
  printDiagnosticFunnel() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  STRATEGY DIAGNOSTIC FUNNEL - Where Signals Die');
    console.log('═══════════════════════════════════════════════════════════════');
    for (const [name, f] of Object.entries(this.diagFunnel)) {
      if (f.evaluated === 0) continue;
      const pctNonNull = f.evaluated > 0 ? (f.moduleNonNull / f.evaluated * 100).toFixed(2) : 0;
      const pctNonNeutral = f.moduleNonNull > 0 ? (f.nonNeutral / f.moduleNonNull * 100).toFixed(2) : 0;
      const pctConf = f.nonNeutral > 0 ? (f.passedConf / f.nonNeutral * 100).toFixed(2) : 0;
      console.log(`\n  ${name}:`);
      console.log(`    Candles evaluated:     ${f.evaluated}`);
      console.log(`    Module returned value: ${f.moduleNonNull} (${pctNonNull}%)`);
      console.log(`    Non-neutral direction: ${f.nonNeutral} (${pctNonNeutral}% of above)`);
      console.log(`    Passed confidence:     ${f.passedConf} (${pctConf}% of above)`);
      console.log(`    Actually traded:       ${f.traded}`);
    }
    console.log('\n═══════════════════════════════════════════════════════════════\n');
  }

  /**
   * Register the built-in strategies that map to existing modules.
   * Each strategy has:
   *   - name: identifier (matches ExitContractManager DEFAULT_CONTRACTS keys)
   *   - evaluate(ctx): returns { direction, confidence, reason } or null
   */
  _registerBuiltinStrategies() {
    // Helper: check if strategy should be registered (respects SOLO_STRATEGY mode)
    const shouldRegister = (name) => {
      if (!this.soloStrategies) return true;  // No filter — register all
      return this.soloStrategies.includes(name.toLowerCase());
    };

    // ─── 1. EMA/SMA Crossover Strategy ───
    // FIX 2026-03-19: Self-contained — computes crossovers internally from raw candles
    const emaCrossoverModule = this.emaCrossoverModule;
    const minCandlesEMA = this.minCandlesEMA;
    const fibDistanceEMA = this.fibDistanceEMA;
    const fibBoostNormal = this.fibBoostNormal;
    const fibBoostGolden = this.fibBoostGolden;
    const diagEMA = this.diagFunnel.EMASMACrossover;
    if (shouldRegister('EMASMACrossover')) this.strategies.push({
      name: 'EMASMACrossover',
      evaluate: (ctx) => {
        diagEMA.evaluated++;
        // Self-contained: compute signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesEMA) return null;

        const latestCandle = candles[candles.length - 1];
        const sig = emaCrossoverModule.update(latestCandle, candles);
        if (sig) diagEMA.moduleNonNull++;

        // DIAGNOSTIC: Log signal computation
        if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {
          console.log(`[DIAG] EMACrossover computed: dir=${sig.direction} conf=${(sig.confidence||0).toFixed(2)}`);
        }
        if (!sig || sig.direction === 'neutral' || !sig.direction) return null;
        diagEMA.nonNeutral++;
        let conf = sig.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;
        diagEMA.passedConf++;

        // Fib level boost: if price is bouncing at a fib level, this is a stronger setup
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < fibDistanceEMA) {
          // Price is within fib distance — boost confidence
          const boost = fib.isGoldenZone ? fibBoostGolden : fibBoostNormal;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` + Fib ${(fib.level * 100).toFixed(1)}% (${fib.isGoldenZone ? 'GOLDEN ZONE' : 'near level'})`;
        }

        return {
          direction: sig.direction,
          confidence: conf,
          reason: `EMA/SMA Crossover ${sig.direction} (${sig.crossovers?.length || 0} crosses)${fibBoost}`,
          signalData: sig
        };
      }
    });

    // ─── 2. MA Dynamic S/R Strategy ───
    // FIX 2026-03-19: Self-contained — computes S/R levels internally from raw candles
    const maDynamicSRModule = this.maDynamicSRModule;
    const minCandlesMASR = this.minCandlesMASR;
    const fibDistanceMASR = this.fibDistanceMASR;
    const diagMASR = this.diagFunnel.MADynamicSR;
    if (shouldRegister('MADynamicSR')) this.strategies.push({
      name: 'MADynamicSR',
      evaluate: (ctx) => {
        diagMASR.evaluated++;
        // Self-contained: compute signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesMASR) return null;

        const latestCandle = candles[candles.length - 1];
        const sig = maDynamicSRModule.update(latestCandle, candles);
        if (sig && sig.direction) diagMASR.moduleNonNull++;

        // DIAGNOSTIC: Log signal computation
        if (process.env.STRATEGY_DIAG === 'true' && sig && sig.direction !== 'neutral') {
          console.log(`[DIAG] MADynamicSR computed: dir=${sig.direction} conf=${(sig.confidence||0).toFixed(2)}`);
        }
        if (!sig || sig.direction === 'neutral' || !sig.direction) return null;
        diagMASR.nonNeutral++;
        let conf = sig.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;
        diagMASR.passedConf++;

        // MADynamicSR handles extension detection internally (slope detection, first-touch skip)
        const price = candles.length > 0 ? candles[candles.length - 1]?.c : null;

        // Fib level boost: bounce at MA + fib level = very strong S/R
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < fibDistanceMASR) {
          const boost = fib.isGoldenZone ? fibBoostGolden : fibBoostNormal;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` + Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
        }

        // FIX 2026-03-20: sl/tp extraction removed - exit contracts handle exits now

        return {
          direction: sig.direction,
          confidence: conf,
          reason: sig.reason || `MA Dynamic S/R ${sig.direction} (level touch)${fibBoost}`,
          signalData: sig,
          // FIX 2026-03-20: Removed overrideLevels - let exit contracts handle SL/TP
        };
      }
    });

    // ─── 3. Liquidity Sweep Strategy ───
    // FIX 2026-03-19: Self-contained — computes sweeps internally from raw candles
    const liquiditySweepModule = this.liquiditySweepModule;
    const minCandlesSweep = this.minCandlesSweep;
    const fibDistanceSweep = this.fibDistanceSweep;
    if (shouldRegister('LiquiditySweep')) this.strategies.push({
      name: 'LiquiditySweep',
      evaluate: (ctx) => {
        // Self-contained: compute signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesSweep) {
          if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] LiquiditySweep: NOT ENOUGH CANDLES (${candles?.length || 0} < ${minCandlesSweep})`);
          return null;
        }

        const latestCandle = candles[candles.length - 1];
        const sig = liquiditySweepModule.feedCandle(latestCandle);

        // DIAGNOSTIC: Log every call to see why no signals
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] LiquiditySweep: called, sig=${sig ? JSON.stringify({hasSignal: sig.hasSignal, direction: sig.direction, confidence: sig.confidence}) : 'null'}`);
        }
        if (!sig || !sig.hasSignal) return null;
        if (!sig.direction || sig.direction === 'neutral') return null;
        let conf = sig.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;

        // Fib level boost: sweep reversal at a fib level = institutional level
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < fibDistanceSweep) {
          const boost = fib.isGoldenZone ? fibBoostGolden : fibBoostNormal;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` @ Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
        }

        return {
          direction: sig.direction,
          confidence: conf,
          reason: `Liquidity Sweep ${sig.direction} (${sig.sweepType || 'institutional'})${fibBoost}`,
          signalData: sig,
          // FIX 2026-02-23: Pass structural stops from sweep analysis
          overrideLevels: sig.stopLoss && sig.takeProfit ? {
            stopLoss: sig.stopLoss,
            takeProfit: sig.takeProfit
          } : null
        };
      }
    });

    // ─── 4. Break & Retest Strategy (Desi Trades) ───
    // 2026-05-04: Migrated to self-contained pattern (was return-null disabled
    // since 2026-02-23). Calls BreakAndRetest.update() inline like LiquiditySweep.
    if (shouldRegister('BreakRetest')) {
      const breakAndRetestModule = this.breakAndRetestModule;
      this.strategies.push({
        name: 'BreakRetest',
        evaluate: (ctx) => {
          const candles = ctx.priceHistory;
          if (!candles || candles.length === 0) return null;
          const latestCandle = candles[candles.length - 1];
          const sig = breakAndRetestModule.update(latestCandle, candles);
          if (!sig || !sig.direction || sig.direction === 'neutral') return null;
          let conf = sig.confidence || 0;
          if (conf < this.minStrategyConfidence) return null;
          const fib = ctx.extras?.nearestFibLevel;
          let fibBoost = '';
          if (fib && fib.distance < 0.5) {
            const boost = fib.isGoldenZone ? 0.12 : 0.08;
            conf = Math.min(1.0, conf + boost);
            fibBoost = ` @ Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
          }
          return {
            direction: sig.direction,
            confidence: conf,
            reason: sig.reason || `Break & Retest ${sig.direction}${fibBoost}`,
            signalData: sig,
            exitContract: { stopLoss: sig.stopLoss, takeProfit: sig.takeProfit, pt2: sig.pt2 }
          };
        }
      });
    }

    // ─── 5. RSI Extreme Strategy ───
    // FIX 2026-03-06: Read thresholds from TradingConfig per STRATEGY-REWRITE-SPEC
    if (shouldRegister('RSI')) this.strategies.push({
      name: 'RSI',  // RSI Extreme strategy
      evaluate: (ctx) => {
        const rsi = ctx.indicators?.rsi;
        if (rsi == null) return null;

        const rsiConfig = TradingConfig.get('strategies.RSI') || {};
        const oversold = rsiConfig.oversoldLevel || 25;
        const overbought = rsiConfig.overboughtLevel || 75;

        // Only fire on extremes — not the gradient nonsense
        // FIX 2026-03-13: Boost confidence so RSI=25 passes 50% gate
        // OLD: 0.3 + (strength * 0.5) gave 0.30 at threshold — too weak
        // NEW: 0.5 + (strength * 0.4) gives 0.50 at threshold, 0.90 at extreme
        if (rsi < oversold) {
          const strength = Math.min(1.0, (oversold - rsi) / 15); // Stronger as RSI drops
          return {
            direction: 'buy',
            confidence: 0.5 + (strength * 0.4), // 0.50 - 0.90
            reason: `RSI Oversold (${rsi.toFixed(1)} < ${oversold})`,
            signalData: { rsi }
          };
        }
        if (rsi > overbought) {
          const strength = Math.min(1.0, (rsi - overbought) / 15);
          return {
            direction: 'sell',
            confidence: 0.5 + (strength * 0.4), // 0.50 - 0.90
            reason: `RSI Overbought (${rsi.toFixed(1)} > ${overbought})`,
            signalData: { rsi }
          };
        }
        return null;
      }
    });

    // ─── 5. Pattern Recognition Strategy ───
    if (shouldRegister('CandlePattern')) this.strategies.push({
      name: 'CandlePattern',
      evaluate: (ctx) => {
        const patterns = ctx.patterns || [];
        if (patterns.length === 0) return null;

        // Use the highest-confidence pattern
        const best = patterns.reduce((a, b) =>
          (b.confidence || 0) > (a.confidence || 0) ? b : a, patterns[0]);

        if (!best || !best.direction || best.direction === 'neutral') return null;
        const conf = best.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;

        return {
          direction: best.direction === 'bullish' ? 'buy' : best.direction === 'bearish' ? 'sell' : best.direction,
          confidence: conf,
          reason: `Pattern: ${best.name || best.type || 'detected'} (${(conf * 100).toFixed(0)}%)`,
          signalData: best
        };
      }
    });

    // ─── 6. Market Regime + Trend Strategy ───
    if (shouldRegister('MarketRegime')) this.strategies.push({
      name: 'MarketRegime',
      evaluate: (ctx) => {
        const regime = ctx.regime;
        const trend = ctx.indicators?.trend;

        // DIAGNOSTIC: Log why no signals
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] MarketRegime: regime=${regime?.currentRegime || 'null'} trend=${trend || 'null'} conf=${regime?.confidence || 0}`);
        }

        // Structural: no regime data at all → can't vote
        if (!regime || !regime.currentRegime) return null;

        const regimeConf = regime.confidence || 0;
        const regimeName = regime.currentRegime.toLowerCase();
        const isBullRegime = regimeName.includes('bull') || regimeName.includes('uptrend') || regimeName.includes('accumulation');
        const isBearRegime = regimeName.includes('bear') || regimeName.includes('downtrend') || regimeName.includes('distribution');

        // Structural: no directional regime (ranging/volatile/unknown) → no directional vote
        if (!isBullRegime && !isBearRegime) return null;

        const isBullTrend = trend === 'bullish' || trend === 'uptrend';
        const isBearTrend = trend === 'bearish' || trend === 'downtrend';

        // Trend alignment modulates confidence — multipliers, not gates (let it flow)
        let trendMult;
        if ((isBullRegime && isBullTrend) || (isBearRegime && isBearTrend)) {
          trendMult = 1.0;   // full agreement
        } else if ((isBullRegime && isBearTrend) || (isBearRegime && isBullTrend)) {
          trendMult = 0.4;   // direct conflict — signal survives, heavily damped
        } else {
          trendMult = 0.7;   // trend unknown/neutral — moderate damping
        }

        const direction = isBullRegime ? 'buy' : 'sell';
        const finalConf = regimeConf * 0.8 * trendMult;
        const agreementLabel = trendMult === 1.0 ? 'aligned' : trendMult === 0.4 ? 'conflict' : 'partial';

        return {
          direction,
          confidence: finalConf,
          reason: `Regime: ${regime.currentRegime} + Trend: ${trend || 'unknown'} [${agreementLabel}]`,
          signalData: regime
        };
      }
    });

    // ─── 7. Multi-Timeframe Confluence Strategy ───
    // FIX 2026-03-19: Self-contained — owns its MTF adapter internally
    const mtfAdapterModule = this.mtfAdapter;
    const minCandlesMTF = this.minCandlesMTF;
    if (shouldRegister('MultiTimeframe')) this.strategies.push({
      name: 'MultiTimeframe',
      evaluate: (ctx) => {
        // Self-contained: ingest candle and compute confluence internally
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesMTF) {
          if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] MultiTimeframe: NOT ENOUGH CANDLES (${candles?.length || 0} < ${minCandlesMTF})`);
          return null;
        }

        // Feed latest candle to MTF adapter
        const latestCandle = candles[candles.length - 1];
        try {
          mtfAdapterModule.ingestCandle(latestCandle);
        } catch (e) {
          if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] MultiTimeframe: ingestCandle error: ${e.message}`);
          return null;
        }

        let confluence;
        try {
          confluence = mtfAdapterModule.getConfluence ? mtfAdapterModule.getConfluence() : mtfAdapterModule.getConfluenceScore();
        } catch (e) {
          if (process.env.STRATEGY_DIAG === 'true') console.log(`[DIAG] MultiTimeframe: getConfluence error: ${e.message}`);
          return null;
        }

        // DIAGNOSTIC: Log every call
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] MultiTimeframe: confluence=${confluence ? JSON.stringify({dir: confluence.direction, score: confluence.score}) : 'null'}`);
        }

        if (!confluence || !confluence.direction || confluence.direction === 'neutral') return null;
        if ((confluence.score || 0) < this.confluenceMinScore) return null;

        return {
          direction: confluence.direction,
          confidence: confluence.score || 0,
          reason: `MTF Confluence: ${confluence.direction} (${confluence.timeframes?.join(', ') || 'multiple'})`,
          signalData: confluence
        };
      }
    });

    // ─── 8. OGZ TPO Strategy ───
    // FIX 2026-03-19: Self-contained — owns its TPO integration internally
    const tpoIntegrationModule = this.tpoIntegration;
    const minCandlesTPO = this.minCandlesTPO;
    const tpoStrengthMultiplier = this.tpoStrengthMultiplier;
    if (shouldRegister('OGZTPO')) this.strategies.push({
      name: 'OGZTPO',  // OGZ TPO strategy
      evaluate: (ctx) => {
        // Self-contained: compute TPO signal from raw candle data
        const candles = ctx.priceHistory;
        if (!candles || candles.length < minCandlesTPO) return null;

        const latestCandle = candles[candles.length - 1];
        let tpo;
        try {
          tpo = tpoIntegrationModule.update(latestCandle);
        } catch (e) {
          return null;
        }

        if (!tpo || !tpo.signal) return null;
        if (!tpo.signal.highProbability) return null; // Only fire on high probability

        const action = tpo.signal.action;
        const strength = tpo.signal.strength || 0;
        if (strength < this.tpoStrengthMin) return null;

        const direction = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : null;
        if (!direction) return null;

        // DIAGNOSTIC: Log TPO signal computation
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] OGZTPO computed: dir=${direction} strength=${(strength * 100).toFixed(1)}%`);
        }

        return {
          direction,
          confidence: Math.min(1.0, strength * tpoStrengthMultiplier), // Scale 0.03-0.1 → 0.3-1.0
          reason: `OGZ TPO ${tpo.signal.zone} (strength: ${(strength * 100).toFixed(1)}%)`,
          signalData: tpo.signal,
          // TPO provides its own levels
          overrideLevels: tpo.signal.levels ? {
            stopLoss: tpo.signal.levels.stopLoss,
            takeProfit: tpo.signal.levels.takeProfit,
          } : null
        };
      }
    });

    // ─── 9. Opening Range Breakout Strategy ───
    // ICT-style session-based strategy with FVG entry
    const orbInstance = this.orbStrategy;
    if (shouldRegister('OpeningRangeBreakout')) this.strategies.push({
      name: 'OpeningRangeBreakout',
      evaluate: (ctx) => {
        // ORB needs the latest candle from priceHistory
        const candles = ctx.priceHistory;
        if (!candles || candles.length === 0) return null;

        const latestCandle = candles[candles.length - 1];
        const signal = orbInstance.update(latestCandle);

        // DIAGNOSTIC: Log every call
        if (process.env.STRATEGY_DIAG === 'true') {
          console.log(`[DIAG] OpeningRangeBreakout: signal=${signal ? JSON.stringify({dir: signal.direction, conf: signal.confidence}) : 'null'} candle_time=${latestCandle?.time || 'unknown'}`);
        }

        if (!signal) return null;

        // Consume the signal so it doesn't fire again
        orbInstance.consumeSignal();

        return {
          direction: signal.direction,
          confidence: signal.confidence,
          reason: signal.reason,
          signalData: signal,
          // ORB provides structural levels from FVG
          overrideLevels: {
            stopLoss: signal.stop,
            takeProfit: signal.target,
          },
          // Pass order type hint
          orderTypeHint: signal.orderType,
          limitPrice: signal.limitPrice,
        };
      }
    });

    // ─── 10. Smart Money Sweep Strategy (Fabio + Marco Composite) ───
    // Self-contained: computes VP, IVB, sweep detection, candle classification internally
    const smartMoneySweepModule = this.smartMoneySweepModule;
    const diagSMS = this.diagFunnel.SmartMoneySweep;
    if (shouldRegister('SmartMoneySweep')) this.strategies.push({
      name: 'SmartMoneySweep',
      evaluate: (ctx) => {
        diagSMS.evaluated++;
        const candles = ctx.priceHistory;
        if (!candles || candles.length < 50) return null;

        const latestCandle = candles[candles.length - 1];
        const sig = smartMoneySweepModule.update(latestCandle, candles);

        if (sig) diagSMS.moduleNonNull++;

        if (process.env.STRATEGY_DIAG === 'true' && sig) {
          console.log(`[DIAG] SmartMoneySweep: dir=${sig.direction} conf=${(sig.confidence||0).toFixed(2)} conds=${sig.conditionsMet}`);
        }
        if (!sig || !sig.direction) return null;
        diagSMS.nonNeutral++;

        let conf = sig.confidence || 0;
        if (conf < this.minStrategyConfidence) return null;
        diagSMS.passedConf++;

        // Fib level boost (same pattern as other strategies)
        const fib = ctx.extras?.nearestFibLevel;
        let fibBoost = '';
        if (fib && fib.distance < 0.5) {
          const boost = fib.isGoldenZone ? 0.15 : 0.10;
          conf = Math.min(1.0, conf + boost);
          fibBoost = ` + Fib ${(fib.level * 100).toFixed(1)}%${fib.isGoldenZone ? ' GOLDEN' : ''}`;
        }

        return {
          direction: sig.direction,
          confidence: conf,
          reason: sig.reason + fibBoost,
          signalData: sig.signalData,
          overrideLevels: sig.overrideLevels,
        };
      }
    });

    const noWickModule = this.noWickModule;
    if (shouldRegister('NoWickImbalance')) this.strategies.push({
      name: 'NoWickImbalance',
      evaluate: (ctx) => {
        try {
          return noWickModule.evaluate(ctx);
        } catch (e) {
          if (process.env.STRATEGY_DIAG === 'true') {
            console.warn('[NoWickImbalance] evaluate threw:', e.message);
          }
          return null;
        }
      }
    });

    // Apply pipeline toggles - filter strategies based on env vars
    this._applyPipelineToggles();
  }

  /**
   * Filter registered strategies based on pipeline toggles.
   * Called once at end of _registerBuiltinStrategies().
   * Logs exactly which strategies are active/disabled - no silent failures.
   */
  _applyPipelineToggles() {
    const pipeline = TradingConfig.get('pipeline') || {};
    const toggleMap = {
      'RSI': pipeline.enableRSI,
      'MADynamicSR': pipeline.enableMADynamicSR,
      'EMASMACrossover': pipeline.enableEMACrossover,
      'LiquiditySweep': pipeline.enableLiquiditySweep,
      'BreakRetest': pipeline.enableBreakRetest,
      'MarketRegime': pipeline.enableMarketRegime,
      'MultiTimeframe': pipeline.enableMultiTimeframe,
      'OGZTPO': pipeline.enableOGZTPO,
      'OpeningRangeBreakout': pipeline.enableOpeningRangeBreakout,
      'SmartMoneySweep': pipeline.enableSmartMoneySweep,
      'NoWickImbalance': pipeline.enableNoWickImbalance,
    };

    const before = this.strategies.length;
    const disabled = [];

    this.strategies = this.strategies.filter(s => {
      const toggle = toggleMap[s.name];
      if (toggle === false) {
        disabled.push(s.name);
        return false;
      }
      return true;
    });

    if (disabled.length > 0) {
      console.log(`[PIPELINE] Disabled ${disabled.length} strategies: ${disabled.join(', ')}`);
    }
    console.log(`[PIPELINE] Active strategies: ${this.strategies.map(s => s.name).join(', ')} (${this.strategies.length}/${before})`);
  }

  /**
   * Main entry point — evaluate all strategies independently, pick winner.
   * 
   * @param {Object} indicators - From IndicatorEngine.getSnapshot()
   * @param {Array} patterns - From EnhancedPatternRecognition.analyzePatterns()
   * @param {Object} regime - From MarketRegimeDetector.analyzeMarket()
   * @param {Array} priceHistory - Candle history
   * @param {Object} extras - { emaCrossoverSignal, maDynamicSRSignal, liquiditySweepSignal, mtfAdapter, tpoResult, price }
   * @returns {Object} { action, direction, confidence, winnerStrategy, exitContract, sizingMultiplier, confluence, allResults }
   */
  evaluate(indicators, patterns = [], regime = null, priceHistory = [], extras = {}) {
    this.evalCount++;

    const ctx = { indicators, patterns, regime, priceHistory, extras };

    // Narrator: pattern-spotted event. narrator is the module-cached
    // singleton; disabled path is property-access + branch-taken (zero
    // allocation). Try/catch only entered when enabled AND patterns
    // present so a formatter throw on unexpected shape can't interrupt
    // evaluate().
    if (narrator.enabled && Array.isArray(patterns) && patterns.length > 0) {
      try {
        narrator.patternSpotted(patterns);
      } catch (e) {
        console.warn('[Narrator] patternSpotted hook failed:', e && e.message);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHANGE 2026-02-23: Volume Profile Chop Filter (Fabio Valentino)
    // Only trend follow when OUT OF BALANCE (price outside value area)
    // When BALANCED (inside VA) = choppy market, trend strategies bleed fees
    // ═══════════════════════════════════════════════════════════════════════
    // DISABLED 2026-03-09: VP chop filter was one of 6 stacked gates killing signals
    // MADynamicSR now has its own slope/extension filters. VP chop filter is redundant.
    // TODO: Full gate audit needed — one filter, one job, no overlap.
    // const TREND_STRATEGIES = ['MADynamicSR', 'EMASMACrossover', 'MultiTimeframe', 'MarketRegime'];
    let vpMarketState = null;
    let skipTrendStrategies = false;  // Always false now — strategies handle their own filtering

    // ─── Step 1: Run ALL strategies independently ───
    const results = [];
    for (const strategy of this.strategies) {
      // DISABLED 2026-03-09: VP chop filter removed — strategies handle own filtering
      // if (skipTrendStrategies && TREND_STRATEGIES.includes(strategy.name)) {
      //   continue;
      // }

      try {
        const result = strategy.evaluate(ctx);
        if (result && result.direction && result.confidence > 0) {
          results.push({
            ...result,
            strategyName: strategy.name,
          });
        }
      } catch (err) {
        console.warn(`⚠️ [StrategyOrchestrator] ${strategy.name} threw: ${err.message}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ATR PRE-ENTRY FILTER — Data-driven threshold from backtest analysis
    // FIX 2026-03-13: 0.40% killed 74% of 15m BTC candles. Lowered to 0.15%
    // Original: Winners at 0.58%, losers at 0.34%, midpoint 0.40%
    // ═══════════════════════════════════════════════════════════════════════
    // CRIT-09: Pre-money fail-loud on missing price. Previously
    // `extras.price || (priceHistory[last]?.c ?? 0)` silently degraded
    // to filterPrice=0, which short-circuited the ATR filter (gate
    // `filterATRpct > 0`) and let strategies fire into dead-market
    // state. Now: switch to `??` to distinguish "missing" from
    // "explicit zero", then halt all candidates if price is unusable.
    const filterPrice = extras.price ?? (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : null);
    if (!Number.isFinite(filterPrice) || filterPrice <= 0) {
      console.warn('[FILTER:atr] HALT — no valid price (extras.price + priceHistory both unusable). Clearing all candidates.');
      results.length = 0;
    }
    // CRIT-10: Distinguish missing ATR from genuine zero. Previously
    // `indicators?.atr || 0` silently turned a missing/undefined ATR
    // into 0, then the gate at `filterATRpct > 0` skipped the filter
    // — invisible bypass. Now: `??` preserves the "missing" semantic,
    // and we emit a warning so the bypass is observable. (Asymmetric
    // with CRIT-09: missing price = catastrophic halt; missing ATR =
    // benign warmup edge, log + skip.)
    const filterATR = indicators?.atr ?? null;
    if (filterATR === null) {
      console.warn('[FILTER:atr] ATR unavailable — filter cannot evaluate (likely warmup or upstream gap). Skipping ATR gate.');
    }
    const filterATRpct = (filterATR && filterPrice > 0) ? (filterATR / filterPrice) * 100 : 0;

    // ATR filter: Per-strategy threshold via exitContracts.{strategy}.atrMinPercent
    // null = fall back to global filters.atrMinPercent (zero behavior change default)
    const atrFilterEnabled = TradingConfig.get('filters.atrEnabled');
    const globalAtrMin = TradingConfig.get('filters.atrMinPercent');
    if (atrFilterEnabled && filterATRpct > 0 && results.length > 0) {
      const contracts = TradingConfig.BASE_CONFIG.exitContracts;
      for (let i = results.length - 1; i >= 0; i--) {
        const r = results[i];
        const contract = contracts[r.strategyName] || contracts.default || {};
        const threshold = contract.atrMinPercent != null ? contract.atrMinPercent : globalAtrMin;
        if (filterATRpct < threshold) {
          if (this.evalCount % 200 === 0) {
            console.log(`[FILTER:atr] Skipped ${r.strategyName} — ATR ${filterATRpct.toFixed(3)}% below ${threshold}% (${contract.atrMinPercent != null ? 'per-strategy' : 'global'})`);
          }
          results.splice(i, 1);
        }
      }
    }

    // ─── Step 2: Sort by confidence (highest first) ───
    results.sort((a, b) => b.confidence - a.confidence);

    // ─── Step 2.5: Regime-based strategy boosting ───
    // FIX 2026-04-05: Read from TradingConfig for matrix sweep optimization
    // Multipliers, not gates. Losers still fire, just sized smaller.
    const regimeBoosts = TradingConfig.get('regimeBoosts') || {};

    // Classify regime name to category (trending_up/trending_down → trending, etc.)
    const rawRegime = regime?.currentRegime?.toLowerCase() || 'unknown';
    const regimeConfidence = regime?.confidence || 0;
    let regimeType = 'unknown';
    if (regimeConfidence >= 0.25) {
      if (rawRegime.includes('bull') || rawRegime.includes('uptrend') ||
          rawRegime.includes('bear') || rawRegime.includes('downtrend') ||
          rawRegime.includes('trending') || rawRegime.includes('momentum')) {
        regimeType = 'trending';
      } else if (rawRegime.includes('rang') || rawRegime.includes('sideways') ||
                 rawRegime.includes('consolidat') || rawRegime.includes('accumulation')) {
        regimeType = 'ranging';
      } else if (rawRegime.includes('volat') || rawRegime.includes('chaos') ||
                 rawRegime.includes('distribution') || rawRegime.includes('crash')) {
        regimeType = 'volatile';
      } else if (rawRegime.includes('dead') || rawRegime.includes('quiet') ||
                 rawRegime.includes('low_vol') || rawRegime.includes('flat')) {
        regimeType = 'dead';
      }
    }

    const boosts = regimeBoosts[regimeType] || {};
    const regimePositionMultiplier = boosts._positionSizeMultiplier || 1.0;

    if (Object.keys(boosts).length > 0 && results.length > 0) {
      for (const result of results) {
        const boost = boosts[result.strategyName] || 1.0;
        if (boost !== 1.0) {
          result.confidence *= boost;
        }
      }
      // Re-sort after boosting
      results.sort((a, b) => b.confidence - a.confidence);
    }

    // ─── Step 2.6: Volume Profile-based strategy boosting ───
    // FIX 2026-04-05: Auction Market Theory - boost based on price position
    const volumeProfileBoosts = TradingConfig.get('volumeProfileBoosts') || {};
    const volumeProfile = extras.volumeProfile;
    const currentPrice = extras.price || (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : 0);

    if (volumeProfile && currentPrice && Object.keys(volumeProfileBoosts).length > 0 && results.length > 0) {
      const vpProfile = typeof volumeProfile.getProfile === 'function' ? volumeProfile.getProfile() : volumeProfile;

      if (vpProfile && vpProfile.poc && vpProfile.vah && vpProfile.val) {
        // Classify price position relative to VP levels
        let vpZone = 'inValueArea';  // Default
        const pocThreshold = 0.002;  // Within 0.2% of POC = "at POC"
        const lvnProximity = 0.003;  // Within 0.3% of nearest LVN = "in LVN"

        const priceToPocPct = Math.abs(currentPrice - vpProfile.poc) / vpProfile.poc;

        if (currentPrice > vpProfile.vah) {
          vpZone = 'aboveVAH';
        } else if (currentPrice < vpProfile.val) {
          vpZone = 'belowVAL';
        } else if (priceToPocPct <= pocThreshold) {
          vpZone = 'atPOC';
        } else {
          // Check if near an LVN
          const lvns = vpProfile.lvns || [];
          for (const lvn of lvns) {
            const distPct = Math.abs(currentPrice - lvn.price) / currentPrice;
            if (distPct <= lvnProximity) {
              vpZone = 'inLVN';
              break;
            }
          }
        }

        const vpBoosts = volumeProfileBoosts[vpZone] || {};

        if (Object.keys(vpBoosts).length > 0) {
          for (const result of results) {
            // Check for _allStrategies (used in inLVN)
            const boost = vpBoosts._allStrategies || vpBoosts[result.strategyName] || 1.0;
            if (boost !== 1.0) {
              result.confidence *= boost;
            }
          }
          // Re-sort after VP boosting
          results.sort((a, b) => b.confidence - a.confidence);
          console.log(`📊 [VP] Zone: ${vpZone} | POC: ${vpProfile.poc?.toFixed(0)} | VAH: ${vpProfile.vah?.toFixed(0)} | VAL: ${vpProfile.val?.toFixed(0)}`);
        }
      }
    }

    // DEBUG 2026-03-06: Why is confidence 0?
    if (results.length > 0) {
      console.log(`🔍 [ORCH] ${results.length} strategies returned signals:`);
      results.slice(0, 5).forEach(r => console.log(`   - ${r.strategyName}: ${(r.confidence * 100).toFixed(1)}% ${r.direction}`));
    } else {
      console.log(`🔍 [ORCH] 0 strategies returned signals (all returned null or conf=0)`);
    }

    // Narrator: strategy-eval event. Uses module-cached singleton.
    // Disabled path: property-access + branch-taken, zero allocation.
    if (narrator.enabled && results.length > 0) {
      try {
        narrator.strategyEval(results, results[0]);
      } catch (e) {
        console.warn('[Narrator] strategyEval hook failed:', e && e.message);
      }
    }

    // ─── Step 3: Filter by minimum confidence threshold ───
    const qualified = results.filter(r => r.confidence >= this.minStrategyConfidence);

    if (qualified.length === 0) {
      this.lastEvaluation = { action: 'HOLD', results, qualified: [] };
      return {
        action: 'HOLD',
        direction: 'hold',
        confidence: 0,
        winnerStrategy: null,
        exitContract: null,
        sizingMultiplier: 1.0,
        confluence: { count: 0, strategies: [] },
        allResults: results,
        reasons: results.length > 0
          ? [`No strategy above ${(this.minStrategyConfidence * 100).toFixed(0)}% threshold (best: ${results[0]?.strategyName} at ${(results[0]?.confidence * 100).toFixed(0)}%)`]
          : ['No signals detected']
      };
    }

    // ─── Step 4: Winner = highest confidence ───
    const winner = qualified[0];

    // ─── Step 5: Count confluence (how many strategies agree on direction) ───
    const agreeing = qualified.filter(r => r.direction === winner.direction);
    const confluenceCount = agreeing.length;

    // Check minimum confluence requirement
    if (confluenceCount < this.minConfluenceCount) {
      this.lastEvaluation = { action: 'HOLD', results, qualified, winner, confluenceCount };
      return {
        action: 'HOLD',
        direction: 'hold',
        confidence: winner.confidence * 100,  // FIX 2026-02-26: Match BUY/SELL format (0-100)
        winnerStrategy: winner.strategyName,
        exitContract: null,
        sizingMultiplier: 1.0,
        confluence: { count: confluenceCount, strategies: agreeing.map(r => r.strategyName) },
        allResults: results,
        reasons: [`Need ${this.minConfluenceCount} confluent signals, got ${confluenceCount}`]
      };
    }

    // ─── Step 6: Position sizing multiplier from confluence × regime ───
    const cappedCount = Math.min(confluenceCount, 4);
    const rawSizingMultiplier = this.confluenceSizing[cappedCount] || this.confluenceSizing[4] || 2.5;
    const sizingMultiplier = rawSizingMultiplier * regimePositionMultiplier;

    // ─── Step 7: Create exit contract from winning strategy ───
    let exitContract = null;
    try {
      const ecm = getExitContractManager();
      const price = extras.price || (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : 0);

      // If the winning strategy provided its own levels (e.g. TPO), use them
      const signalOverrides = {};
      // DEBUG: Log winner object keys to trace overrideLevels flow
      console.log(`[EXIT-DEBUG] Winner "${winner.strategyName}" keys: ${Object.keys(winner).join(', ')}`);
      console.log(`[EXIT-DEBUG] Winner overrideLevels type: ${typeof winner.overrideLevels}, value: ${JSON.stringify(winner.overrideLevels)}`);
      if (winner.overrideLevels) {
        const isShort = winner.direction === 'sell';
        if (winner.overrideLevels.stopLoss && price) {
          // FIX 2026-03-27: SL% must always be negative (how far price can move against you)
          // For shorts, stopLoss is ABOVE entry → raw calc is positive → negate it
          const rawSL = ((winner.overrideLevels.stopLoss - price) / price) * 100;
          signalOverrides.stopLossPercent = isShort ? -Math.abs(rawSL) : rawSL;
        }
        if (winner.overrideLevels.takeProfit && price) {
          // FIX 2026-03-27: TP% must always be positive (how far price needs to move in your favor)
          // For shorts, takeProfit is BELOW entry → raw calc is negative → make positive
          const rawTP = ((winner.overrideLevels.takeProfit - price) / price) * 100;
          signalOverrides.takeProfitPercent = isShort ? Math.abs(rawTP) : rawTP;
        }
        // DEBUG: Log override level conversion
        console.log(`[EXIT-DEBUG] ${winner.strategyName} overrideLevels → Price=$${price?.toFixed(2)} SL=$${winner.overrideLevels.stopLoss?.toFixed(2)} TP=$${winner.overrideLevels.takeProfit?.toFixed(2)} → SL%=${signalOverrides.stopLossPercent?.toFixed(2)}% TP%=${signalOverrides.takeProfitPercent?.toFixed(2)}%`);
      } else {
        console.log(`[EXIT-DEBUG] ${winner.strategyName} NO overrideLevels — will use TradingConfig defaults`);
      }

      // FIX 2026-02-23: Convert ATR to percentage (was passing raw $ causing inflation)
      const volPct = indicators?.atr && price ? (indicators.atr / price * 100) : (indicators?.volatility || 0);
      // FIX 2026-03-19: Pass timeframe for per-timeframe exit parameters
      const timeframe = extras.timeframe || TradingConfig.get('candle.interval') || '15m';
      exitContract = ecm.createExitContract(
        winner.strategyName,
        { ...signalOverrides, confidence: winner.confidence },
        { volatility: volPct, timeframe }
      );
    } catch (err) {
      console.warn(`⚠️ [StrategyOrchestrator] Failed to create exit contract: ${err.message}`);
    }

    // ─── Step 8: Build reasons list ───
    const reasons = [
      `🏆 Winner: ${winner.strategyName} (${(winner.confidence * 100).toFixed(0)}%) — ${winner.reason}`,
      `🤝 Confluence: ${confluenceCount} strategies agree on ${winner.direction.toUpperCase()}`,
      `📏 Sizing: ${sizingMultiplier}x base position`,
    ];

    // Add supporting strategies
    agreeing.slice(1).forEach(r => {
      reasons.push(`  ✅ ${r.strategyName}: ${r.reason}`);
    });

    // Log opposing strategies (info only)
    const opposing = qualified.filter(r => r.direction !== winner.direction);
    opposing.forEach(r => {
      reasons.push(`  ⚠️ Opposing: ${r.strategyName} says ${r.direction} (${(r.confidence * 100).toFixed(0)}%)`);
    });

    const output = {
      action: winner.direction === 'buy' ? 'BUY' : winner.direction === 'sell' ? 'SELL' : 'HOLD',
      direction: winner.direction,
      confidence: winner.confidence * 100, // Convert to percentage for compatibility with existing code
      winnerStrategy: winner.strategyName,
      exitContract,
      sizingMultiplier,
      confluence: {
        count: confluenceCount,
        strategies: agreeing.map(r => r.strategyName),
        opposing: opposing.map(r => ({ name: r.strategyName, direction: r.direction, confidence: r.confidence })),
      },
      allResults: results,
      reasons,
      // Signal breakdown for trade logging (compatible with existing signalBreakdown format)
      signalBreakdown: {
        winnerStrategy: winner.strategyName,
        winnerConfidence: winner.confidence,
        confluenceCount,
        sizingMultiplier,
        signals: results.map(r => ({
          name: r.strategyName,
          direction: r.direction,
          confidence: r.confidence,
          reason: r.reason,
        })),
      },
    };

    this.lastEvaluation = output;

    // Log decision
    console.log(`\n🎯 [ORCHESTRATOR] ${output.action} | ${winner.strategyName} @ ${(winner.confidence * 100).toFixed(0)}% | Confluence: ${confluenceCount}x (sizing: ${sizingMultiplier}x)`);
    if (agreeing.length > 1) {
      console.log(`   Supporting: ${agreeing.slice(1).map(r => r.strategyName).join(', ')}`);
    }

    return output;
  }

  /**
   * Get last evaluation for debugging / dashboard
   */
  getLastEvaluation() {
    return this.lastEvaluation;
  }

  /**
   * Register a custom strategy at runtime
   * @param {Object} strategy - { name: string, evaluate: function(ctx) }
   */
  registerStrategy(strategy) {
    if (!strategy.name || typeof strategy.evaluate !== 'function') {
      throw new Error('Strategy must have name and evaluate function');
    }
    this.strategies.push(strategy);
    console.log(`📌 [StrategyOrchestrator] Registered strategy: ${strategy.name}`);
  }

  /**
   * Remove a strategy by name
   */
  removeStrategy(name) {
    this.strategies = this.strategies.filter(s => s.name !== name);
    console.log(`🗑️ [StrategyOrchestrator] Removed strategy: ${name}`);
  }

  /**
   * Forward trade result to strategy module for daily loss tracking
   * FIX 2026-03-29: Wire up SMS dailyLosses counter
   * @param {string} strategyName - The strategy that made the trade
   * @param {number} pnl - The P&L of the closed trade (positive = win, negative = loss)
   */
  recordTradeResult(strategyName, pnl) {
    if (strategyName === 'SmartMoneySweep' && this.smartMoneySweepModule) {
      this.smartMoneySweepModule.recordTradeResult(pnl);
      console.log(`[SMS-DAILY] Recorded trade result: $${pnl.toFixed(2)} → dailyLosses=${this.smartMoneySweepModule.dailyLosses}`);
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    return {
      registeredStrategies: this.strategies.map(s => s.name),
      evaluationCount: this.evalCount,
      lastResult: this.lastEvaluation ? {
        action: this.lastEvaluation.action,
        winner: this.lastEvaluation.winnerStrategy,
        confluence: this.lastEvaluation.confluence?.count || 0,
      } : null,
    };
  }
}

module.exports = { StrategyOrchestrator };
