/**
 * PIDController.js — Adaptive Parameter Optimization
 * ===================================================
 * Sits ON TOP of the orchestrator. Reads performance
 * metrics, adjusts ConfigLoader values in real time.
 *
 * NOT a strategy. NOT an exit checker. A META-CONTROLLER
 * that tunes the system while it runs.
 *
 * DESIGN (Trey's PID Architecture):
 *   - Loop 1: Position Sizing — equity slope → size multiplier
 *   - Loop 2: Regime Boosts — per-strategy P&L → boost adjustment
 *   - Loop 3: Trailing Stop — MFE capture → ATR multiplier
 *
 * KEY PRINCIPLES:
 *   - Runs every N trades (default 10), NOT every candle
 *   - 50-trade warmup before activation
 *   - Rate-limited output (max 10% change per cycle)
 *   - Anti-windup on integral term
 *   - All Kp/Ki/Kd in ConfigLoader with env() for matrix sweep
 *
 * @module core/PIDController
 * @author Trey (Architecture) + Claude (Implementation)
 * @date 2026-04-05
 */

'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');

// ═══════════════════════════════════════════════════════════════════════════
// PID LOOP — Single feedback loop implementation
// ═══════════════════════════════════════════════════════════════════════════

class PIDLoop {
  constructor(name, config = {}) {
    this.name = name;
    this.Kp = config.Kp || 0.3;          // Proportional gain
    this.Ki = config.Ki || 0.05;         // Integral gain
    this.Kd = config.Kd || 0.1;          // Derivative gain
    this.setpoint = config.setpoint || 0;
    this.integralMax = config.integralMax || 5.0;
    this.outputMin = config.outputMin || 0.3;
    this.outputMax = config.outputMax || 2.0;
    this.rateLimit = config.rateLimit || 0.10; // max 10% change per cycle

    // State
    this.integral = 0;
    this.prevError = 0;
    this.prevOutput = 1.0;
    this.history = [];      // { error, output, timestamp }
  }

  /**
   * Core PID computation
   * @param {number} measured — current value
   * @returns {number} output (clamped, rate-limited)
   */
  update(measured) {
    const error = measured - this.setpoint;

    // P — react to current error
    const P = this.Kp * error;

    // I — accumulate error over time (with anti-windup)
    this.integral += error;
    this.integral = Math.max(-this.integralMax,
                    Math.min(this.integralMax, this.integral));
    const I = this.Ki * this.integral;

    // D — react to rate of change
    const D = this.Kd * (error - this.prevError);
    this.prevError = error;

    // Raw output
    let output = 1.0 + P + I + D;

    // Clamp to safe range
    output = Math.max(this.outputMin,
             Math.min(this.outputMax, output));

    // Rate limit — prevent whiplash
    const maxDelta = this.prevOutput * this.rateLimit;
    if (Math.abs(output - this.prevOutput) > maxDelta) {
      output = this.prevOutput +
        Math.sign(output - this.prevOutput) * maxDelta;
    }

    this.prevOutput = output;
    this.history.push({
      error, output, measured,
      P, I: this.integral, D,
      timestamp: Date.now()
    });

    // Keep bounded history
    if (this.history.length > 200) this.history.shift();

    return output;
  }

  reset() {
    this.integral = 0;
    this.prevError = 0;
    this.prevOutput = 1.0;
    this.history = [];
  }

  getState() {
    return {
      name: this.name,
      output: this.prevOutput,
      integral: this.integral,
      prevError: this.prevError,
      historyLength: this.history.length,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PID CONTROLLER — Orchestrates all loops
// ═══════════════════════════════════════════════════════════════════════════

class PIDController {
  constructor(config = {}) {
    this.enabled = config.enabled ?? ConfigLoader.get('pid.enabled') ?? true;
    this.updateInterval = config.updateInterval || ConfigLoader.get('pid.updateInterval') || 10;
    this.warmupTrades = config.warmupTrades || ConfigLoader.get('pid.warmupTrades') || 50;
    this.tradesSinceUpdate = 0;
    this.totalTrades = 0;

    // === LOOP 1: Position Sizing ===
    // Target: maintain positive equity slope
    this.positionLoop = new PIDLoop('position_sizing', {
      Kp: ConfigLoader.get('pid.positionKp') || 0.30,
      Ki: ConfigLoader.get('pid.positionKi') || 0.05,
      Kd: ConfigLoader.get('pid.positionKd') || 0.10,
      setpoint: ConfigLoader.get('pid.targetEquitySlope') || 0.005,
      outputMin: 0.3,   // minimum 30% of base size
      outputMax: 2.0,   // maximum 200% of base size
      integralMax: 5.0,
      rateLimit: 0.10,
    });

    // === LOOP 2: Regime Boost Adaptation ===
    // Target: each strategy profitable in its assigned regime
    this.regimeLoops = {};
    const strategies = ['RSI', 'EMASMACrossover', 'MADynamicSR', 'LiquiditySweep', 'SmartMoneySweep'];
    for (const strat of strategies) {
      this.regimeLoops[strat] = new PIDLoop(`regime_${strat}`, {
        Kp: ConfigLoader.get('pid.regimeKp') || 0.02,
        Ki: ConfigLoader.get('pid.regimeKi') || 0.005,
        Kd: ConfigLoader.get('pid.regimeKd') || 0.01,
        setpoint: 0, // target: profitable (P&L > 0)
        outputMin: 0.5,
        outputMax: 1.5,
        integralMax: 3.0,
        rateLimit: 0.10,
      });
    }

    // === LOOP 3: Trailing Stop Adaptation ===
    // Target: capture 60%+ of max favorable excursion
    this.trailLoop = new PIDLoop('trailing_stop', {
      Kp: ConfigLoader.get('pid.trailKp') || 0.15,
      Ki: ConfigLoader.get('pid.trailKi') || 0.03,
      Kd: ConfigLoader.get('pid.trailKd') || 0.05,
      setpoint: ConfigLoader.get('pid.targetMFERatio') || 0.60,
      outputMin: 1.0,
      outputMax: 3.5,
      integralMax: 2.0,
      rateLimit: 0.10,
    });

    // Performance tracking
    this.recentTrades = [];   // rolling window
    this.windowSize = config.windowSize || ConfigLoader.get('pid.windowSize') || 20;

    // Output state (read by other modules)
    this.outputs = {
      positionMultiplier: 1.0,
      trailMultiplier: 1.0,
      regimeBoosts: {},
    };

    console.log(`[PID] Controller initialized | enabled=${this.enabled} | warmup=${this.warmupTrades} | interval=${this.updateInterval}`);
  }

  /**
   * Called after every trade close
   * @param {Object} trade — completed trade result
   */
  onTradeClose(trade) {
    if (!this.enabled) return;

    this.totalTrades++;
    this.tradesSinceUpdate++;
    this.recentTrades.push(trade);
    if (this.recentTrades.length > this.windowSize) {
      this.recentTrades.shift();
    }

    // Wait for warmup
    if (this.totalTrades < this.warmupTrades) {
      if (this.totalTrades % 10 === 0) {
        console.log(`[PID] Warmup: ${this.totalTrades}/${this.warmupTrades} trades`);
      }
      return;
    }

    // Update every N trades
    if (this.tradesSinceUpdate >= this.updateInterval) {
      this.tradesSinceUpdate = 0;
      this._runUpdateCycle();
    }
  }

  /**
   * Core update cycle — runs all PID loops
   */
  _runUpdateCycle() {
    const trades = this.recentTrades;
    if (trades.length < 5) return;

    // === LOOP 1: Position Sizing ===
    const equitySlope = this._calcEquitySlope(trades);
    const posMult = this.positionLoop.update(equitySlope);
    this.outputs.positionMultiplier = posMult;

    // === LOOP 2: Regime Boosts ===
    for (const [strat, loop] of Object.entries(this.regimeLoops)) {
      const stratTrades = trades.filter(t => t.strategyName === strat);
      if (stratTrades.length >= 3) {
        const avgPnl = stratTrades.reduce(
          (s, t) => s + (t.netPnlDollars || 0), 0
        ) / stratTrades.length;
        const output = loop.update(avgPnl);
        this.outputs.regimeBoosts[strat] = output;
      }
    }

    // === LOOP 3: Trailing Stop ===
    const trailExits = trades.filter(t => t.exitReason === 'trailing_stop');
    if (trailExits.length >= 3) {
      const avgMFE = trailExits.reduce((s, t) => {
        const peak = t.maxProfitPercent || t.maxFavorableExcursion || 0;
        const actual = t.netPnlPercent || 0;
        return s + (peak > 0 ? actual / peak : 0);
      }, 0) / trailExits.length;
      const trailMult = this.trailLoop.update(avgMFE);
      this.outputs.trailMultiplier = trailMult;
    }

    console.log(`[PID] Update #${Math.floor(this.totalTrades / this.updateInterval)}:`, {
      positionMult: posMult.toFixed(3),
      trailATR: this.outputs.trailMultiplier.toFixed(3),
      equitySlope: equitySlope.toFixed(4),
      trades: this.totalTrades,
    });
  }

  /**
   * Calculate equity curve slope from recent trades
   * Uses linear regression
   */
  _calcEquitySlope(trades) {
    if (trades.length < 2) return 0;

    const cumPnl = [];
    let sum = 0;
    for (const t of trades) {
      sum += t.netPnlDollars || 0;
      cumPnl.push(sum);
    }

    // Simple linear regression slope
    const n = cumPnl.length;
    const xMean = (n - 1) / 2;
    const yMean = cumPnl.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (cumPnl[i] - yMean);
      den += (i - xMean) ** 2;
    }
    return den > 0 ? num / den : 0;
  }

  /**
   * Get position size multiplier (called by OrderExecutor)
   */
  getPositionMultiplier() {
    if (!this.enabled || this.totalTrades < this.warmupTrades) {
      return 1.0;
    }
    return this.outputs.positionMultiplier;
  }

  /**
   * Get regime boost adjustment for a strategy (called by StrategyOrchestrator)
   */
  getRegimeBoostAdjustment(strategyName) {
    if (!this.enabled || this.totalTrades < this.warmupTrades) {
      return 1.0;
    }
    return this.outputs.regimeBoosts[strategyName] || 1.0;
  }

  /**
   * Get trailing stop ATR multiplier (called by DynamicTrailingStop)
   */
  getTrailMultiplier() {
    if (!this.enabled || this.totalTrades < this.warmupTrades) {
      return 1.0;
    }
    return this.outputs.trailMultiplier;
  }

  /**
   * Get full state for logging/dashboard
   */
  getState() {
    return {
      enabled: this.enabled,
      totalTrades: this.totalTrades,
      warmupRemaining: Math.max(0, this.warmupTrades - this.totalTrades),
      tradesSinceUpdate: this.tradesSinceUpdate,
      outputs: { ...this.outputs },
      loops: {
        position: this.positionLoop.getState(),
        trail: this.trailLoop.getState(),
        regime: Object.fromEntries(
          Object.entries(this.regimeLoops).map(([k, v]) => [k, v.getState()])
        ),
      },
    };
  }

  /**
   * Reset all loops (for new backtest run)
   */
  reset() {
    this.totalTrades = 0;
    this.tradesSinceUpdate = 0;
    this.recentTrades = [];
    this.outputs = {
      positionMultiplier: 1.0,
      trailMultiplier: 1.0,
      regimeBoosts: {},
    };
    this.positionLoop.reset();
    this.trailLoop.reset();
    for (const loop of Object.values(this.regimeLoops)) {
      loop.reset();
    }
    console.log('[PID] Controller reset');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let instance = null;

function getPIDController() {
  if (!instance) {
    instance = new PIDController();
  }
  return instance;
}

function resetPIDController() {
  if (instance) {
    instance.reset();
  }
}

module.exports = { PIDController, PIDLoop, getPIDController, resetPIDController };
