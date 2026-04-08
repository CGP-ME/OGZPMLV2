// ═══════════════════════════════════════════════════════════════════
// PATCH: StrategyOrchestrator.js — SmartMoneySweep Registration
// ═══════════════════════════════════════════════════════════════════
//
// FILE: core/StrategyOrchestrator.js
//
// ── CHANGE 1: Add import at top (after existing module imports) ──
// Add this line after the OgzTpoIntegration require:
//
//   const SmartMoneySweep = require('../modules/SmartMoneySweep');
//
// ── CHANGE 2: Add module instantiation in constructor ──
// Add this line after: this.tpoIntegration = new OgzTpoIntegration();
//
//   this.smartMoneySweepModule = new SmartMoneySweep(
//     TradingConfig.get('strategies.SmartMoneySweep') || {}
//   );
//
// ── CHANGE 3: Add diagnostic funnel entry ──
// Add this inside this.diagFunnel = { ... }:
//
//   SmartMoneySweep: { evaluated: 0, moduleNonNull: 0, nonNeutral: 0, passedConf: 0, traded: 0 },
//
// ── CHANGE 4: Add strategy registration in _registerBuiltinStrategies() ──
// Add this block BEFORE the _applyPipelineToggles() call at the end:

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

// ── CHANGE 5: Add toggle in _applyPipelineToggles() toggleMap ──
// Add this entry to the toggleMap object:
//
//   'SmartMoneySweep': pipeline.enableSmartMoneySweep,
