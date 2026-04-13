import { useState, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
// OGZPrime Command Center
// Boomer-proof trading control panel
// Phase 1: Config generator (generates commands/env)
// Phase 2: Wire to WebSocket API for live control
// ═══════════════════════════════════════════════════════════

const STRATEGIES = [
  { id: "RSI", label: "RSI Extreme", desc: "Mean reversion on RSI oversold/overbought" },
  { id: "EMASMACrossover", label: "EMA Crossover", desc: "Trend following on moving average crosses" },
  { id: "MADynamicSR", label: "MA Support/Resistance", desc: "Bounce trades off dynamic S/R levels" },
  { id: "LiquiditySweep", label: "Liquidity Sweep", desc: "Institutional sweep reversal entries" },
  { id: "SmartMoneySweep", label: "Smart Money Sweep", desc: "Smart money concept sweeps" },
];

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

const ASSET_CLASSES = [
  { id: "crypto", label: "Crypto", tickers: ["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD"] },
  { id: "stocks", label: "Stocks", tickers: ["TSLA", "AAPL", "NVDA", "GOOGL", "MSFT", "AMZN", "META", "NFLX"] },
];

const DATA_FILES = [
  { id: "tsla-15m-2y", label: "TSLA 15m (2 Year)", file: "tuning/tsla-15m-2y.json" },
  { id: "tsla-15m-18mo", label: "TSLA 15m (18 Month)", file: "tuning/tsla-15m-18mo.json" },
  { id: "tsla-15m-10mo", label: "TSLA 15m (10 Month)", file: "tuning/tsla-15m-10mo.json" },
  { id: "tsla-15m-year1", label: "TSLA 15m (Year 1 - Train)", file: "tuning/tsla-15m-year1.json" },
  { id: "tsla-15m-year2", label: "TSLA 15m (Year 2 - Test)", file: "tuning/tsla-15m-year2.json" },
  { id: "tsla-1h-2y", label: "TSLA 1h (2 Year)", file: "tuning/tsla-1h-2y.json" },
];

// ─── Toggle Switch ───
function Toggle({ on, onChange, size = "md" }) {
  const sizes = {
    sm: { w: 40, h: 22, dot: 16, pad: 3 },
    md: { w: 52, h: 28, dot: 22, pad: 3 },
    lg: { w: 64, h: 34, dot: 28, pad: 3 },
  };
  const s = sizes[size];
  return (
    <div
      onClick={onChange}
      style={{
        width: s.w, height: s.h, borderRadius: s.h,
        background: on ? "#00C853" : "#333",
        cursor: "pointer", position: "relative",
        transition: "background 0.2s",
        border: on ? "1px solid #00E676" : "1px solid #555",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: s.dot, height: s.dot, borderRadius: "50%",
        background: on ? "#fff" : "#888",
        position: "absolute", top: s.pad,
        left: on ? s.w - s.dot - s.pad : s.pad,
        transition: "left 0.2s, background 0.2s",
        boxShadow: on ? "0 0 8px rgba(0,200,83,0.5)" : "none",
      }} />
    </div>
  );
}

// ─── Section Card ───
function Section({ title, icon, children, accent = "#00C853" }) {
  return (
    <div style={{
      background: "#111", borderRadius: 12,
      border: `1px solid ${accent}22`,
      padding: "20px 24px", marginBottom: 16,
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700, letterSpacing: 1.5,
        textTransform: "uppercase", color: accent,
        marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span> {title}
      </div>
      {children}
    </div>
  );
}

// ─── Pill Selector ───
function PillSelect({ options, value, onChange, multi = false }) {
  const isSelected = (opt) => multi ? value.includes(opt) : value === opt;
  const handleClick = (opt) => {
    if (multi) {
      onChange(isSelected(opt) ? value.filter(v => v !== opt) : [...value, opt]);
    } else {
      onChange(opt);
    }
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map(opt => {
        const label = typeof opt === "object" ? opt.label : opt;
        const val = typeof opt === "object" ? opt.id : opt;
        return (
          <div key={val} onClick={() => handleClick(val)} style={{
            padding: "6px 14px", borderRadius: 6, cursor: "pointer",
            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
            background: isSelected(val) ? "#00C853" : "#222",
            color: isSelected(val) ? "#000" : "#999",
            border: isSelected(val) ? "1px solid #00E676" : "1px solid #333",
          }}>
            {label}
          </div>
        );
      })}
    </div>
  );
}

// ─── Slider with Label ───
function SliderControl({ label, value, onChange, min, max, step = 0.01, unit = "%", desc }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, color: "#00C853", fontWeight: 700, fontFamily: "monospace" }}>
          {typeof value === "number" ? value.toFixed(step < 1 ? 2 : 0) : value}{unit}
        </span>
      </div>
      {desc && <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{desc}</div>}
      <input type="range" min={min} max={max} step={step}
        value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#00C853" }}
      />
    </div>
  );
}

// ─── Row ───
function Row({ label, desc, children }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid #1a1a1a",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: "#eee", fontWeight: 500 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ marginLeft: 16 }}>{children}</div>
    </div>
  );
}

// ─── Command Output ───
function CommandOutput({ command, label }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>{label}</span>
        <div onClick={copy} style={{
          padding: "4px 12px", borderRadius: 4, cursor: "pointer",
          background: copied ? "#00C853" : "#222", color: copied ? "#000" : "#00C853",
          fontSize: 11, fontWeight: 700, border: "1px solid #00C85344",
          transition: "all 0.2s",
        }}>
          {copied ? "✓ COPIED" : "COPY"}
        </div>
      </div>
      <pre style={{
        background: "#0a0a0a", border: "1px solid #222", borderRadius: 8,
        padding: 14, fontSize: 11, color: "#00E676", fontFamily: "'Fira Code', 'Courier New', monospace",
        overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
        lineHeight: 1.6, maxHeight: 200,
      }}>{command}</pre>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function OGZPrimeCommandCenter() {
  // Strategy toggles
  const [strategies, setStrategies] = useState(
    Object.fromEntries(STRATEGIES.map(s => [s.id, s.id === "RSI" || s.id === "EMASMACrossover"]))
  );

  // Direction
  const [direction, setDirection] = useState("both"); // long_only, short_only, both
  const [shortsEnabled, setShortsEnabled] = useState(false);

  // Asset
  const [assetClass, setAssetClass] = useState("stocks");
  const [ticker, setTicker] = useState("TSLA");
  const [timeframe, setTimeframe] = useState("15m");

  // Risk
  const [basePositionPct, setBasePositionPct] = useState(1);
  const [maxPositionPct, setMaxPositionPct] = useState(5);
  const [maxPositions, setMaxPositions] = useState(3);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(10);
  const [hardStopPct, setHardStopPct] = useState(5);

  // Fees
  const [feeMaker, setFeeMaker] = useState(0);
  const [feeTaker, setFeeTaker] = useState(0);

  // Filters
  const [atrEnabled, setAtrEnabled] = useState(false);
  const [atrMinPct, setAtrMinPct] = useState(0.15);

  // Backtest
  const [dataFile, setDataFile] = useState("tsla-15m-2y");
  const [drawdownBypass, setDrawdownBypass] = useState(true);
  const [traiEnabled, setTraiEnabled] = useState(false);
  const [showCommand, setShowCommand] = useState(false);

  // Tab
  const [tab, setTab] = useState("strategies");

  // Build command
  const buildCommand = useCallback(() => {
    const activeStrats = Object.entries(strategies).filter(([, v]) => v).map(([k]) => k);
    const file = DATA_FILES.find(f => f.id === dataFile)?.file || "tuning/tsla-15m-2y.json";

    const parts = [
      `SOLO_STRATEGY=${activeStrats.join(",")}`,
      `EXECUTION_MODE=backtest`,
      `CANDLE_SOURCE=file`,
      `CANDLE_DATA_FILE=${file}`,
      `BACKTEST_MODE=true`,
      `BACKTEST_FAST=true`,
      `BACKTEST_NO_PATTERN_SAVE=true`,
      `FEE_MAKER=${feeMaker}`,
      `FEE_TAKER=${feeTaker}`,
      `ENABLE_TRAI=${traiEnabled}`,
      `ENABLE_SHORTS=${shortsEnabled}`,
      drawdownBypass ? `ACCOUNT_DRAWDOWN_BYPASS=true` : null,
      atrEnabled ? `ATR_FILTER_ENABLED=true` : null,
      atrEnabled ? `ATR_MIN_PERCENT=${atrMinPct}` : null,
      `BASE_POSITION_SIZE=${(basePositionPct / 100).toFixed(2)}`,
      `MAX_POSITION_SIZE_PCT=${(maxPositionPct / 100).toFixed(2)}`,
      `MAX_POSITIONS=${maxPositions}`,
      direction !== "both" ? `DIRECTION_FILTER=${direction}` : null,
    ].filter(Boolean);

    return parts.join(" \\\n  ") + " \\\n  node run-empire-v2.js";
  }, [strategies, dataFile, feeMaker, feeTaker, traiEnabled, shortsEnabled,
      drawdownBypass, atrEnabled, atrMinPct, basePositionPct, maxPositionPct,
      maxPositions, direction]);

  const activeCount = Object.values(strategies).filter(Boolean).length;

  const tabs = [
    { id: "strategies", label: "Strategies", icon: "🎯" },
    { id: "risk", label: "Risk & Sizing", icon: "🛡️" },
    { id: "backtest", label: "Run Backtest", icon: "🧪" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#eee",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      padding: 0,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{
        background: "#080808", borderBottom: "2px solid #00C853",
        padding: "16px 24px",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>
              <span style={{ color: "#00C853" }}>OGZ</span>PRIME
              <span style={{ color: "#555", fontSize: 12, marginLeft: 8, fontWeight: 400 }}>COMMAND CENTER</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{
              padding: "4px 12px", borderRadius: 4,
              background: "#00C85322", color: "#00C853",
              fontSize: 11, fontWeight: 700,
            }}>
              {activeCount} STRATEGIES ACTIVE
            </div>
            <div style={{
              padding: "4px 12px", borderRadius: 4,
              background: shortsEnabled ? "#00C85322" : "#ff444422",
              color: shortsEnabled ? "#00C853" : "#ff4444",
              fontSize: 11, fontWeight: 700,
            }}>
              SHORTS {shortsEnabled ? "ON" : "OFF"}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{
        display: "flex", gap: 0, background: "#080808",
        borderBottom: "1px solid #1a1a1a", padding: "0 24px",
      }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "12px 20px", cursor: "pointer",
            borderBottom: tab === t.id ? "2px solid #00C853" : "2px solid transparent",
            color: tab === t.id ? "#00C853" : "#666",
            fontSize: 13, fontWeight: 600, transition: "all 0.15s",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span>{t.icon}</span> {t.label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px", maxWidth: 720, margin: "0 auto" }}>

        {/* ═══ STRATEGIES TAB ═══ */}
        {tab === "strategies" && (
          <>
            <Section title="Trading Direction" icon="↕️">
              <Row label="Enable Short Selling" desc="Allow opening short positions (requires margin)">
                <Toggle on={shortsEnabled} onChange={() => {
                  setShortsEnabled(!shortsEnabled);
                  if (!shortsEnabled) setDirection("both");
                  if (shortsEnabled && direction === "short_only") setDirection("long_only");
                }} size="lg" />
              </Row>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Direction Filter</div>
                <PillSelect
                  options={[
                    { id: "long_only", label: "📈 Long Only" },
                    { id: "both", label: "↕️ Both Directions" },
                    ...(shortsEnabled ? [{ id: "short_only", label: "📉 Short Only" }] : []),
                  ]}
                  value={direction}
                  onChange={setDirection}
                />
              </div>
            </Section>

            <Section title="Active Strategies" icon="🎯">
              {STRATEGIES.map(s => (
                <Row key={s.id} label={s.label} desc={s.desc}>
                  <Toggle
                    on={strategies[s.id]}
                    onChange={() => setStrategies({ ...strategies, [s.id]: !strategies[s.id] })}
                    size="lg"
                  />
                </Row>
              ))}
            </Section>

            <Section title="Asset & Timeframe" icon="📊" accent="#00BCD4">
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Asset Class</div>
                <PillSelect options={ASSET_CLASSES} value={assetClass} onChange={(v) => {
                  setAssetClass(v);
                  setTicker(ASSET_CLASSES.find(a => a.id === v)?.tickers[0] || "TSLA");
                }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Ticker</div>
                <PillSelect
                  options={ASSET_CLASSES.find(a => a.id === assetClass)?.tickers.map(t => ({ id: t, label: t })) || []}
                  value={ticker} onChange={setTicker}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Timeframe</div>
                <PillSelect options={TIMEFRAMES.map(t => ({ id: t, label: t }))} value={timeframe} onChange={setTimeframe} />
              </div>
            </Section>

            <Section title="Filters" icon="🔬" accent="#FF9800">
              <Row label="ATR Volatility Filter" desc="Skip trades when market is too dead">
                <Toggle on={atrEnabled} onChange={() => setAtrEnabled(!atrEnabled)} />
              </Row>
              {atrEnabled && (
                <div style={{ marginTop: 8 }}>
                  <SliderControl label="Minimum ATR %" value={atrMinPct} onChange={setAtrMinPct}
                    min={0.05} max={1.0} step={0.05} desc="Below this = no trades (market too quiet)" />
                </div>
              )}
            </Section>
          </>
        )}

        {/* ═══ RISK TAB ═══ */}
        {tab === "risk" && (
          <>
            <Section title="Position Sizing" icon="📐" accent="#00BCD4">
              <SliderControl label="Base Position Size" value={basePositionPct} onChange={setBasePositionPct}
                min={0.5} max={10} step={0.5} desc="% of account per trade (before confluence multiplier)" />
              <SliderControl label="Max Position Size" value={maxPositionPct} onChange={setMaxPositionPct}
                min={1} max={25} step={1} desc="Hard cap — confluence can't push past this" />
              <SliderControl label="Max Concurrent Positions" value={maxPositions} onChange={setMaxPositions}
                min={1} max={10} step={1} unit="" desc="How many trades open at once" />
            </Section>

            <Section title="Circuit Breakers" icon="⚡" accent="#FF5252">
              <SliderControl label="Account Max Drawdown" value={maxDrawdownPct} onChange={setMaxDrawdownPct}
                min={5} max={30} step={1} desc="Force close everything if account drops this much" />
              <SliderControl label="Hard Stop Loss (per trade)" value={hardStopPct} onChange={setHardStopPct}
                min={1} max={10} step={0.5} desc="Absolute maximum loss on any single trade" />
            </Section>

            <Section title="Fees" icon="💸" accent="#FF9800">
              <SliderControl label="Maker Fee" value={feeMaker * 100} onChange={v => setFeeMaker(v / 100)}
                min={0} max={0.5} step={0.01} desc="Fee for limit orders" />
              <SliderControl label="Taker Fee" value={feeTaker * 100} onChange={v => setFeeTaker(v / 100)}
                min={0} max={0.5} step={0.01} desc="Fee for market orders" />
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 6,
                background: "#1a1a0a", border: "1px solid #FF980033",
                fontSize: 12, color: "#FF9800",
              }}>
                Round-trip cost: {((feeMaker + feeTaker) * 100).toFixed(2)}% — set both to 0 for fee-free backtesting
              </div>
            </Section>
          </>
        )}

        {/* ═══ BACKTEST TAB ═══ */}
        {tab === "backtest" && (
          <>
            <Section title="Backtest Configuration" icon="🧪" accent="#7C4DFF">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Data File</div>
                <PillSelect options={DATA_FILES} value={dataFile} onChange={setDataFile} />
              </div>

              <Row label="Bypass Account Drawdown" desc="Don't force-close on account drawdown during backtest">
                <Toggle on={drawdownBypass} onChange={() => setDrawdownBypass(!drawdownBypass)} size="lg" />
              </Row>
              <Row label="Enable TRAI (AI Advisor)" desc="Let TRAI analyze trades — slower but adds AI insights">
                <Toggle on={traiEnabled} onChange={() => setTraiEnabled(!traiEnabled)} />
              </Row>
            </Section>

            <Section title="Current Config Summary" icon="📋" accent="#00BCD4">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["Strategies", Object.entries(strategies).filter(([,v]) => v).map(([k]) => k).join(", ") || "None"],
                  ["Direction", direction === "both" ? "Long & Short" : direction === "long_only" ? "Long Only" : "Short Only"],
                  ["Shorts", shortsEnabled ? "Enabled" : "Disabled"],
                  ["Position Size", `${basePositionPct}% base / ${maxPositionPct}% max`],
                  ["Max Positions", maxPositions],
                  ["Fees", `${(feeMaker*100).toFixed(2)}% / ${(feeTaker*100).toFixed(2)}%`],
                  ["ATR Filter", atrEnabled ? `On (${atrMinPct}%)` : "Off"],
                  ["Drawdown Bypass", drawdownBypass ? "Yes" : "No"],
                ].map(([k, v]) => (
                  <div key={k} style={{
                    padding: "8px 12px", borderRadius: 6,
                    background: "#0a0a0a", border: "1px solid #1a1a1a",
                  }}>
                    <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>{k}</div>
                    <div style={{ fontSize: 13, color: "#eee", fontWeight: 600, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Generate Button */}
            <div
              onClick={() => setShowCommand(true)}
              style={{
                padding: "16px 24px", borderRadius: 10, cursor: "pointer",
                background: "linear-gradient(135deg, #00C853, #00E676)",
                color: "#000", fontSize: 16, fontWeight: 700,
                textAlign: "center", letterSpacing: 1,
                boxShadow: "0 4px 20px rgba(0,200,83,0.3)",
                transition: "transform 0.1s, box-shadow 0.1s",
                marginBottom: 16,
              }}
              onMouseDown={e => e.currentTarget.style.transform = "scale(0.98)"}
              onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            >
              🚀 GENERATE BACKTEST COMMAND
            </div>

            {showCommand && (
              <Section title="Ready to Run" icon="⚡" accent="#00E676">
                <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
                  Copy this command and paste it into your VPS terminal:
                </div>
                <CommandOutput command={buildCommand()} label="Backtest Command" />
                <div style={{
                  marginTop: 12, padding: "10px 14px", borderRadius: 6,
                  background: "#0a1a0a", border: "1px solid #00C85333",
                  fontSize: 12, color: "#00C853", lineHeight: 1.6,
                }}>
                  <strong>Next step:</strong> SSH into your VPS, <code style={{ background: "#1a1a1a", padding: "2px 6px", borderRadius: 3 }}>cd /opt/ogzprime/OGZPMLV2</code>, paste the command above, and hit Enter.
                </div>
              </Section>
            )}

            {/* Future: Wire to WebSocket */}
            <div style={{
              padding: "14px 18px", borderRadius: 8,
              background: "#111", border: "1px dashed #333",
              fontSize: 12, color: "#555", textAlign: "center",
              marginTop: 8,
            }}>
              🔮 Phase 2: "Run Backtest" button will execute directly via WebSocket API — no terminal needed
            </div>
          </>
        )}
      </div>
    </div>
  );
}
