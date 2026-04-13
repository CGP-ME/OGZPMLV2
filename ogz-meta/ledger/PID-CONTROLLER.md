import { useState } from "react";

// ═══════════════════════════════════════════════════════════
// OGZPrime PID Controller — System Architecture
// ═══════════════════════════════════════════════════════════

const COLORS = {
  bg: "#0a0a0a", card: "#111", border: "#1a1a1a",
  green: "#00C853", greenDim: "#00C85333",
  cyan: "#00BCD4", cyanDim: "#00BCD41a",
  orange: "#FF9800", orangeDim: "#FF98001a",
  red: "#FF5252", redDim: "#FF52521a",
  purple: "#7C4DFF", purpleDim: "#7C4DFF1a",
  yellow: "#FFD600", yellowDim: "#FFD6001a",
  text: "#eee", dim: "#888", muted: "#555",
};

function Box({ x, y, w, h, label, sublabel, color, icon, children }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8}
        fill={color + "12"} stroke={color} strokeWidth={1.5} />
      <text x={x + w/2} y={y + 22} textAnchor="middle"
        fill={color} fontSize={11} fontWeight={700} letterSpacing={1}>
        {icon} {label}
      </text>
      {sublabel && (
        <text x={x + w/2} y={y + 38} textAnchor="middle"
          fill={COLORS.dim} fontSize={9}>
          {sublabel}
        </text>
      )}
      {children}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, color = COLORS.dim, label, dashed }) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return (
    <g>
      <defs>
        <marker id={`arrow-${color.replace('#','')}`} viewBox="0 0 10 7" refX="10" refY="3.5"
          markerWidth={8} markerHeight={6} orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill={color} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={1.5}
        strokeDasharray={dashed ? "6,4" : "none"}
        markerEnd={`url(#arrow-${color.replace('#','')})`} />
      {label && (
        <text x={midX} y={midY - 6} textAnchor="middle"
          fill={color} fontSize={8} fontWeight={600}>
          {label}
        </text>
      )}
    </g>
  );
}

function SystemDiagram() {
  return (
    <svg viewBox="0 0 780 520" style={{ width: "100%", background: COLORS.bg }}>
      {/* Title */}
      <text x={390} y={30} textAnchor="middle" fill={COLORS.green} fontSize={16} fontWeight={700} letterSpacing={2}>
        OGZPrime PID CONTROLLER ARCHITECTURE
      </text>
      <text x={390} y={48} textAnchor="middle" fill={COLORS.dim} fontSize={10}>
        Adaptive feedback loop for autonomous parameter optimization
      </text>

      {/* ─── TARGET (Setpoint) ─── */}
      <Box x={20} y={80} w={160} h={55} label="SETPOINT" sublabel="Target equity curve" color={COLORS.yellow} icon="🎯" />

      {/* ─── ERROR CALCULATOR ─── */}
      <Box x={220} y={80} w={140} h={55} label="ERROR (e)" sublabel="actual − target" color={COLORS.red} icon="⚡">
        <text x={290} y={120} textAnchor="middle" fill={COLORS.red} fontSize={8}>
          e(t) = measured − setpoint
        </text>
      </Box>

      {/* ─── PID CONTROLLER ─── */}
      <Box x={240} y={180} w={300} h={130} label="PID CONTROLLER" sublabel="" color={COLORS.cyan} icon="🧠">
        {/* P */}
        <rect x={260} y={210} width={80} height={40} rx={4} fill={COLORS.greenDim} stroke={COLORS.green} strokeWidth={1} />
        <text x={300} y={225} textAnchor="middle" fill={COLORS.green} fontSize={10} fontWeight={700}>P</text>
        <text x={300} y={238} textAnchor="middle" fill={COLORS.dim} fontSize={7}>Kp × e(t)</text>
        <text x={300} y={248} textAnchor="middle" fill={COLORS.muted} fontSize={6}>React NOW</text>
        {/* I */}
        <rect x={350} y={210} width={80} height={40} rx={4} fill={COLORS.orangeDim} stroke={COLORS.orange} strokeWidth={1} />
        <text x={390} y={225} textAnchor="middle" fill={COLORS.orange} fontSize={10} fontWeight={700}>I</text>
        <text x={390} y={238} textAnchor="middle" fill={COLORS.dim} fontSize={7}>Ki × Σe(t)</text>
        <text x={390} y={248} textAnchor="middle" fill={COLORS.muted} fontSize={6}>Accumulated</text>
        {/* D */}
        <rect x={440} y={210} width={80} height={40} rx={4} fill={COLORS.purpleDim} stroke={COLORS.purple} strokeWidth={1} />
        <text x={480} y={225} textAnchor="middle" fill={COLORS.purple} fontSize={10} fontWeight={700}>D</text>
        <text x={480} y={238} textAnchor="middle" fill={COLORS.dim} fontSize={7}>Kd × de/dt</text>
        <text x={480} y={248} textAnchor="middle" fill={COLORS.muted} fontSize={6}>Rate of change</text>
        {/* Output formula */}
        <text x={390} y={295} textAnchor="middle" fill={COLORS.cyan} fontSize={9} fontWeight={600}>
          output = P + I + D → clamp(0.3, 2.0)
        </text>
      </Box>

      {/* ─── ACTUATORS (what PID adjusts) ─── */}
      <Box x={120} y={350} w={540} h={80} label="ACTUATORS — What Gets Adjusted" sublabel="" color={COLORS.orange} icon="🔧">
        {[
          { x: 140, label: "Position\nSize", val: "0.5-5%" },
          { x: 240, label: "Regime\nBoosts", val: "0.5-1.5x" },
          { x: 340, label: "Trail\nParams", val: "ATR mult" },
          { x: 440, label: "Confidence\nFloor", val: "0.25-0.60" },
          { x: 540, label: "Max\nPositions", val: "1-5" },
        ].map((a, i) => (
          <g key={i}>
            <rect x={a.x} y={370} width={80} height={45} rx={4}
              fill={COLORS.card} stroke={COLORS.orange + "44"} strokeWidth={1} />
            <text x={a.x + 40} y={385} textAnchor="middle" fill={COLORS.text} fontSize={8} fontWeight={600}>
              {a.label.split('\n')[0]}
            </text>
            <text x={a.x + 40} y={395} textAnchor="middle" fill={COLORS.text} fontSize={8} fontWeight={600}>
              {a.label.split('\n')[1]}
            </text>
            <text x={a.x + 40} y={408} textAnchor="middle" fill={COLORS.muted} fontSize={7}>{a.val}</text>
          </g>
        ))}
      </Box>

      {/* ─── PLANT (Trading System) ─── */}
      <Box x={580} y={80} w={170} h={55} label="PLANT" sublabel="OGZPrime trading engine" color={COLORS.green} icon="⚙️" />

      {/* ─── SENSOR (Measurement) ─── */}
      <Box x={580} y={180} w={170} h={70} label="SENSOR" sublabel="Performance metrics" color={COLORS.purple} icon="📊">
        <text x={665} y={228} textAnchor="middle" fill={COLORS.dim} fontSize={7}>
          Sharpe · DD · WinRate · P&L slope
        </text>
        <text x={665} y={240} textAnchor="middle" fill={COLORS.dim} fontSize={7}>
          Equity curve · Consecutive losses
        </text>
      </Box>

      {/* ─── ARROWS ─── */}
      <Arrow x1={180} y1={107} x2={218} y2={107} color={COLORS.yellow} />
      <Arrow x1={360} y1={107} x2={578} y2={107} color={COLORS.red} label="adjusted params" />
      <Arrow x1={665} y1={135} x2={665} y2={178} color={COLORS.green} label="trades execute" />
      <Arrow x1={580} y1={215} x2={362} y2={215} color={COLORS.purple} label="measured performance" dashed />
      <Arrow x1={290} y1={135} x2={290} y2={178} color={COLORS.red} label="error signal" />
      <Arrow x1={390} y1={310} x2={390} y2={348} color={COLORS.cyan} label="PID output" />
      <Arrow x1={660} y1={390} x2={750} y2={390} color={COLORS.orange} />
      <path d="M 750 390 L 750 107 L 752 107" stroke={COLORS.orange} strokeWidth={1.5} fill="none"
        strokeDasharray="6,4" markerEnd={`url(#arrow-${COLORS.orange.replace('#','')})`} />
      <text x={760} y={250} fill={COLORS.orange} fontSize={8} fontWeight={600}
        transform="rotate(90, 760, 250)">feedback loop</text>

      {/* ─── LOOP TIMING ─── */}
      <text x={390} y={470} textAnchor="middle" fill={COLORS.dim} fontSize={9}>
        Loop interval: every N trades (default 10) · NOT every candle · Smooth adjustment, no whiplash
      </text>
      <text x={390} y={485} textAnchor="middle" fill={COLORS.muted} fontSize={8}>
        Anti-windup: integral clamped · Output rate-limited · Min 50-trade warmup before active
      </text>

      {/* Legend */}
      <text x={390} y={510} textAnchor="middle" fill={COLORS.muted} fontSize={8}>
        All Kp/Ki/Kd gains and clamp ranges stored in TradingConfig with env() calls for matrix sweep
      </text>
    </svg>
  );
}

// ─── PID LOOP DETAILS ───
function LoopDetail({ title, icon, color, items }) {
  return (
    <div style={{
      background: COLORS.card, borderRadius: 10, padding: "16px 20px",
      border: `1px solid ${color}22`, marginBottom: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: 1, marginBottom: 10 }}>
        {icon} {title}
      </div>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: "6px 0", borderBottom: i < items.length - 1 ? `1px solid ${COLORS.border}` : "none",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.text, fontWeight: 500 }}>{item.label}</div>
            <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>{item.desc}</div>
          </div>
          <div style={{
            fontSize: 10, color, fontFamily: "'Fira Code', monospace",
            background: color + "11", padding: "2px 8px", borderRadius: 4,
            flexShrink: 0, marginLeft: 12,
          }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PIDArchitecture() {
  const [tab, setTab] = useState("diagram");

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ padding: "20px 24px", maxWidth: 800, margin: "0 auto" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          <span style={{ color: COLORS.green }}>OGZ</span>PRIME
          <span style={{ color: COLORS.dim, fontSize: 12, marginLeft: 8 }}>PID CONTROLLER SPEC</span>
        </div>
        <div style={{ fontSize: 12, color: COLORS.dim, marginBottom: 20 }}>
          Adaptive feedback loop that learns from trade outcomes and adjusts system parameters in real time
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 20 }}>
          {[
            { id: "diagram", label: "System Diagram" },
            { id: "loops", label: "PID Loops" },
            { id: "code", label: "Module Skeleton" },
          ].map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600,
              color: tab === t.id ? COLORS.green : COLORS.muted,
              borderBottom: tab === t.id ? `2px solid ${COLORS.green}` : "2px solid transparent",
            }}>
              {t.label}
            </div>
          ))}
        </div>

        {/* ═══ DIAGRAM TAB ═══ */}
        {tab === "diagram" && (
          <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
            <SystemDiagram />
          </div>
        )}

        {/* ═══ LOOPS TAB ═══ */}
        {tab === "loops" && <>
          <LoopDetail title="LOOP 1 — POSITION SIZING" icon="📐" color={COLORS.green} items={[
            { label: "Setpoint", desc: "Target equity curve slope (e.g. +0.5% per week)", value: "configurable" },
            { label: "Measured", desc: "Actual rolling equity slope over last N trades", value: "20-trade window" },
            { label: "Error", desc: "actual_slope − target_slope", value: "can be ±" },
            { label: "P action", desc: "Losing streak → shrink size immediately", value: "Kp = 0.3" },
            { label: "I action", desc: "Prolonged underperformance → gradual size reduction", value: "Ki = 0.05" },
            { label: "D action", desc: "Drawdown accelerating → emergency size cut", value: "Kd = 0.1" },
            { label: "Output", desc: "Position size multiplier applied to basePositionSize", value: "clamp(0.3, 2.0)" },
            { label: "Anti-windup", desc: "Integral term clamped to prevent over-accumulation", value: "max ±5.0" },
          ]} />

          <LoopDetail title="LOOP 2 — REGIME BOOST ADAPTATION" icon="🌊" color={COLORS.cyan} items={[
            { label: "Setpoint", desc: "Each strategy profitable in its assigned regime", value: "P&L > 0" },
            { label: "Measured", desc: "Per-strategy P&L within each regime classification", value: "rolling 50 trades" },
            { label: "Error", desc: "Strategy losing in regime it should win → negative error", value: "per strategy" },
            { label: "P action", desc: "EMA losing in 'trending' → reduce trending EMA boost", value: "Kp = 0.02" },
            { label: "I action", desc: "Persistent underperformance → slowly shift boost down", value: "Ki = 0.005" },
            { label: "D action", desc: "Sudden strategy failure → fast dampening", value: "Kd = 0.01" },
            { label: "Output", desc: "Adjusted regime boost multiplier per strategy", value: "clamp(0.5, 1.5)" },
          ]} />

          <LoopDetail title="LOOP 3 — TRAILING STOP ADAPTATION" icon="🛡️" color={COLORS.orange} items={[
            { label: "Setpoint", desc: "Target: capture 60%+ of max favorable excursion (MFE)", value: "0.60 MFE ratio" },
            { label: "Measured", desc: "Actual exit P&L ÷ peak P&L on trailing stop exits", value: "rolling avg" },
            { label: "Error", desc: "Giving back too much profit → tighten trail", value: "MFE ratio gap" },
            { label: "P action", desc: "Recent trails giving back 80% of profit → tighten now", value: "Kp = 0.15" },
            { label: "I action", desc: "Consistently loose trails → gradual ATR multiplier reduction", value: "Ki = 0.03" },
            { label: "D action", desc: "Trail performance improving → ease off adjustment", value: "Kd = 0.05" },
            { label: "Output", desc: "ATR multiplier adjustment for DynamicTrailingStop", value: "clamp(1.0, 3.5)" },
          ]} />

          <div style={{
            padding: "12px 16px", borderRadius: 8, background: COLORS.card,
            border: `1px dashed ${COLORS.muted}`, fontSize: 11, color: COLORS.dim,
            lineHeight: 1.6, marginTop: 8,
          }}>
            <strong style={{ color: COLORS.yellow }}>Important:</strong> PID runs every N trades (default 10), not every candle.
            50-trade warmup before activation. All Kp/Ki/Kd values in TradingConfig with env() for matrix sweep.
            Rate-limited output changes (max 10% shift per update cycle) to prevent oscillation.
          </div>
        </>}

        {/* ═══ CODE TAB ═══ */}
        {tab === "code" && (
          <pre style={{
            background: "#050505", border: `1px solid ${COLORS.border}`, borderRadius: 10,
            padding: 20, fontSize: 11, color: COLORS.green, fontFamily: "'Fira Code', monospace",
            overflow: "auto", lineHeight: 1.7, whiteSpace: "pre-wrap",
          }}>{`/**
 * PIDController.js — Adaptive Parameter Optimization
 * ===================================================
 * Sits ON TOP of the orchestrator. Reads performance
 * metrics, adjusts TradingConfig values in real time.
 *
 * NOT a strategy. NOT an exit checker. A META-CONTROLLER
 * that tunes the system while it runs.
 *
 * @module core/PIDController
 */

const TradingConfig = require('./TradingConfig');

class PIDLoop {
  constructor(name, config = {}) {
    this.name = name;
    this.Kp = config.Kp || 0.3;      // Proportional gain
    this.Ki = config.Ki || 0.05;     // Integral gain
    this.Kd = config.Kd || 0.1;      // Derivative gain
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
}

class PIDController {
  constructor(config = {}) {
    this.enabled = config.enabled ?? true;
    this.updateInterval = config.updateInterval || 10; // trades
    this.warmupTrades = config.warmupTrades || 50;
    this.tradesSinceUpdate = 0;
    this.totalTrades = 0;

    // === LOOP 1: Position Sizing ===
    this.positionLoop = new PIDLoop('position_sizing', {
      Kp: TradingConfig.get('pid.positionKp') || 0.30,
      Ki: TradingConfig.get('pid.positionKi') || 0.05,
      Kd: TradingConfig.get('pid.positionKd') || 0.10,
      setpoint: TradingConfig.get('pid.targetEquitySlope') || 0.005,
      outputMin: 0.3,   // minimum 30% of base size
      outputMax: 2.0,   // maximum 200% of base size
    });

    // === LOOP 2: Regime Boost Adaptation ===
    this.regimeLoops = {};
    for (const strat of ['RSI','EMASMACrossover','MADynamicSR',
                          'LiquiditySweep','SmartMoneySweep']) {
      this.regimeLoops[strat] = new PIDLoop('regime_' + strat, {
        Kp: TradingConfig.get('pid.regimeKp') || 0.02,
        Ki: TradingConfig.get('pid.regimeKi') || 0.005,
        Kd: TradingConfig.get('pid.regimeKd') || 0.01,
        setpoint: 0, // target: profitable (P&L > 0)
        outputMin: 0.5,
        outputMax: 1.5,
      });
    }

    // === LOOP 3: Trailing Stop Adaptation ===
    this.trailLoop = new PIDLoop('trailing_stop', {
      Kp: TradingConfig.get('pid.trailKp') || 0.15,
      Ki: TradingConfig.get('pid.trailKi') || 0.03,
      Kd: TradingConfig.get('pid.trailKd') || 0.05,
      setpoint: TradingConfig.get('pid.targetMFERatio') || 0.60,
      outputMin: 1.0,
      outputMax: 3.5,
    });

    // Performance tracking
    this.recentTrades = [];   // rolling window
    this.windowSize = config.windowSize || 20;
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
    if (this.totalTrades < this.warmupTrades) return;

    // Update every N trades
    if (this.tradesSinceUpdate >= this.updateInterval) {
      this.tradesSinceUpdate = 0;
      this._runUpdateCycle();
    }
  }

  _runUpdateCycle() {
    const trades = this.recentTrades;
    if (trades.length < 5) return;

    // === LOOP 1: Position Sizing ===
    const equitySlope = this._calcEquitySlope(trades);
    const posMult = this.positionLoop.update(equitySlope);
    // Apply: adjust base position size multiplier
    // (read by OrderExecutor via TradingConfig or ctx)

    // === LOOP 2: Regime Boosts ===
    for (const [strat, loop] of Object.entries(this.regimeLoops)) {
      const stratTrades = trades.filter(
        t => t.strategyName === strat
      );
      if (stratTrades.length >= 3) {
        const avgPnl = stratTrades.reduce(
          (s, t) => s + (t.netPnlDollars || 0), 0
        ) / stratTrades.length;
        loop.update(avgPnl);
      }
    }

    // === LOOP 3: Trailing Stop ===
    const trailExits = trades.filter(
      t => t.exitReason === 'trailing_stop'
    );
    if (trailExits.length >= 3) {
      const avgMFE = trailExits.reduce((s, t) => {
        const peak = t.maxProfitPercent || 0;
        const actual = t.netPnlPercent || 0;
        return s + (peak > 0 ? actual / peak : 0);
      }, 0) / trailExits.length;
      this.trailLoop.update(avgMFE);
    }

    console.log('[PID] Update cycle:', {
      positionMult: posMult.toFixed(3),
      trailATR: this.trailLoop.prevOutput.toFixed(3),
      trades: this.totalTrades,
    });
  }

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

  getState() {
    return {
      enabled: this.enabled,
      totalTrades: this.totalTrades,
      positionMultiplier: this.positionLoop.prevOutput,
      trailMultiplier: this.trailLoop.prevOutput,
      regimeBoosts: Object.fromEntries(
        Object.entries(this.regimeLoops).map(
          ([k, v]) => [k, v.prevOutput]
        )
      ),
    };
  }
}

module.exports = { PIDController, PIDLoop };`}
          </pre>
        )}
      </div>
    </div>
  );
}