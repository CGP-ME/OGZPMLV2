import { useState, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════
// OGZPrime Command Center v3
// Smart CSV | Persistent State | Black/Gold/Red Brand
// ═══════════════════════════════════════════════════════════════════

const C = {
  bg: "#08080A", bgCard: "rgba(255,200,50,0.02)", bgCardHover: "rgba(255,200,50,0.04)",
  border: "rgba(255,180,0,0.08)", borderActive: "rgba(255,180,0,0.25)",
  gold: "#FFB800", goldDim: "#FFB80055", goldBright: "#FFD54F",
  red: "#FF2D2D", redDim: "#FF2D2D55", redBg: "rgba(255,45,45,0.08)",
  green: "#00E676", greenDim: "#00E67655", greenBg: "rgba(0,230,118,0.08)",
  text: "#D4C9A8", textDim: "#665E45", textMid: "#998F6E",
  white: "#F0E8D0",
};

const fmt = (n, d = 2) => Number(n).toFixed(d);
const fmtUsd = (n) => (n >= 0 ? "+$" : "-$") + Math.abs(n).toFixed(2);
const fmtPct = (n) => (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";

// ─── Smart CSV Parser ────────────────────────────────────────────

function detectFormat(headers) {
  const h = headers.map(x => x.toLowerCase().trim());
  if (h.includes("trade_number") && h.includes("entry_price")) return "ogzprime";
  if (h.includes("vah") && h.includes("val") && h.includes("long")) return "tradingview";
  if (h.includes("type") && h.includes("profit")) return "mt4";
  if (h.includes("open") && h.includes("close") && h.includes("volume")) return "ohlcv";
  return "generic";
}

function parseCSV(text) {
  const sep = text.indexOf("\t") > -1 && text.indexOf(",") === -1 ? "\t" : ",";
  const lines = text.trim().split("\n");
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ""));
  const format = detectFormat(headers);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/^["']|["']$/g, ""));
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || "");
    return obj;
  });
  return { format, headers, rows, rawText: text };
}

function processData(parsed) {
  switch (parsed.format) {
    case "ogzprime": return processOGZPrime(parsed.rows);
    case "tradingview": return processTradingView(parsed.rows);
    default: return processGeneric(parsed.rows, parsed.headers);
  }
}

function processOGZPrime(rows) {
  const trades = rows.map((r, i) => ({
    id: Number(r.trade_number) || i + 1,
    date: r.entry_time ? new Date(Number(r.entry_time)).toISOString().slice(0, 10) : r.date || "",
    direction: r.direction || "long",
    entry: Number(r.entry_price) || 0,
    exit: Number(r.exit_price) || 0,
    pnl: Number(r.net_pnl_dollars) || Number(r.pnl) || 0,
    pnlPct: Number(r.net_pnl_percent) || 0,
    fees: Number(r.fees_dollars) || 0,
    strategy: r.strategy_name || "Unknown",
    confidence: Number(r.confidence) || 0,
    exitReason: r.exit_reason || "unknown",
    balance: Number(r.balance_after) || 0,
    holdMins: Number(r.hold_time_minutes) || 0,
  }));
  return buildMetrics(trades, "OGZPrime Backtest");
}

function processTradingView(rows) {
  const trades = [];
  let openTrade = null;
  let tradeId = 0;

  for (const r of rows) {
    const price = Number(r.close);
    const time = Number(r.time) * 1000;
    const isLong = r.Long === "1";
    const isShort = r.Short === "1";
    if (!isLong && !isShort) {
      if (openTrade) {
        const isL = openTrade.direction === "long";
        const sl = openTrade.sl;
        const tp = openTrade.tp;
        const lo = Number(r.low);
        const hi = Number(r.high);
        if (sl && ((isL && lo <= sl) || (!isL && hi >= sl))) {
          openTrade.exit = sl;
          openTrade.exitReason = "stop_loss";
          openTrade.pnl = isL ? sl - openTrade.entry : openTrade.entry - sl;
          openTrade.balance = 10000 + trades.reduce((s,t) => s + (t.pnl || 0), 0) + openTrade.pnl;
          trades.push({ ...openTrade });
          openTrade = null;
        } else if (tp && ((isL && hi >= tp) || (!isL && lo <= tp))) {
          openTrade.exit = tp;
          openTrade.exitReason = "take_profit";
          openTrade.pnl = isL ? tp - openTrade.entry : openTrade.entry - tp;
          openTrade.balance = 10000 + trades.reduce((s,t) => s + (t.pnl || 0), 0) + openTrade.pnl;
          trades.push({ ...openTrade });
          openTrade = null;
        }
      }
      continue;
    }

    if (openTrade) {
      openTrade.exit = price;
      const isL = openTrade.direction === "long";
      openTrade.pnl = isL ? price - openTrade.entry : openTrade.entry - price;
      openTrade.exitReason = "signal_flip";
      openTrade.balance = 10000 + trades.reduce((s,t) => s + (t.pnl || 0), 0) + openTrade.pnl;
      trades.push({ ...openTrade });
      openTrade = null;
    }

    tradeId++;
    openTrade = {
      id: tradeId,
      date: new Date(time).toISOString().slice(0, 10),
      direction: isLong ? "long" : "short",
      entry: price,
      exit: 0, pnl: 0, pnlPct: 0, fees: 0,
      strategy: "TradingView Signal",
      confidence: 75, exitReason: "",
      balance: 0, holdMins: 0,
      sl: isLong ? (Number(r["Long SL"]) || 0) : (Number(r["Short SL"]) || 0),
      tp: isLong ? (Number(r["Long TP"]) || 0) : (Number(r["Short TP"]) || 0),
    };
  }
  return buildMetrics(trades.filter(t => t.exit > 0), "TradingView Signals");
}

function processGeneric(rows, headers) {
  const pnlCol = headers.find(h => /pnl|profit|return/i.test(h));
  const dirCol = headers.find(h => /dir|side|type/i.test(h));
  const dateCol = headers.find(h => /date|time/i.test(h));
  const entryCol = headers.find(h => /entry|open|buy/i.test(h));
  const exitCol = headers.find(h => /exit|close|sell/i.test(h));

  const trades = rows.map((r, i) => ({
    id: i + 1,
    date: dateCol ? r[dateCol] : "",
    direction: dirCol ? (r[dirCol].toLowerCase().includes("short") || r[dirCol].toLowerCase().includes("sell") ? "short" : "long") : "long",
    entry: entryCol ? Number(r[entryCol]) || 0 : 0,
    exit: exitCol ? Number(r[exitCol]) || 0 : 0,
    pnl: pnlCol ? Number(r[pnlCol]) || 0 : 0,
    pnlPct: 0, fees: 0, strategy: "Imported", confidence: 0,
    exitReason: "unknown", balance: 0, holdMins: 0,
  }));

  let bal = 10000;
  trades.forEach(t => { bal += t.pnl; t.balance = bal; });
  return buildMetrics(trades, "Imported Strategy");
}

function buildMetrics(trades, source) {
  if (!trades.length) return null;
  const winners = trades.filter(t => t.pnl > 0);
  const losers = trades.filter(t => t.pnl <= 0);
  const grossW = winners.reduce((s, t) => s + t.pnl, 0);
  const grossL = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const startBal = trades[0].balance ? trades[0].balance - trades[0].pnl : 10000;
  const endBal = trades[trades.length - 1].balance || startBal + totalPnl;

  let peak = startBal, maxDD = 0;
  const eq = [{ trade: 0, equity: startBal }];
  let runBal = startBal;
  for (const t of trades) {
    runBal = t.balance || runBal + t.pnl;
    if (runBal > peak) peak = runBal;
    const dd = peak > 0 ? ((peak - runBal) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
    eq.push({ trade: t.id, equity: runBal, pnl: t.pnl });
  }

  let ws = 0, ls = 0, maxWs = 0, maxLs = 0;
  for (const t of trades) {
    if (t.pnl > 0) { ws++; ls = 0; if (ws > maxWs) maxWs = ws; }
    else { ls++; ws = 0; if (ls > maxLs) maxLs = ls; }
  }

  const exitMap = {};
  for (const t of trades) {
    const r = t.exitReason || "unknown";
    if (!exitMap[r]) exitMap[r] = { count: 0, pnl: 0 };
    exitMap[r].count++; exitMap[r].pnl += t.pnl;
  }
  const exitColors = { take_profit: C.green, stop_loss: C.red, trailing_stop: "#00B0FF", break_even: C.gold, max_hold_universal: "#B388FF", flip_position: "#FF9100", signal_flip: "#FF9100", hard_stop: C.red, profit_tier_1: "#69F0AE", account_drawdown: "#D50000" };
  const exitBreakdown = Object.entries(exitMap).map(([r, d]) => ({ reason: r, ...d, color: exitColors[r] || C.textDim })).sort((a, b) => b.count - a.count);

  return {
    source,
    summary: {
      strategyName: [...new Set(trades.map(t => t.strategy))].join(", "),
      startDate: trades[0].date, endDate: trades[trades.length - 1].date,
      startBalance: startBal, finalBalance: endBal,
      netPnL: totalPnl, netPnLPct: startBal > 0 ? (totalPnl / startBal) * 100 : 0,
      totalTrades: trades.length, winners: winners.length, losers: losers.length,
      winRate: trades.length > 0 ? (winners.length / trades.length) * 100 : 0,
      profitFactor: grossL > 0 ? grossW / grossL : grossW > 0 ? Infinity : 0,
      avgWin: winners.length > 0 ? grossW / winners.length : 0,
      avgWinPct: winners.length > 0 ? winners.reduce((s, t) => s + (t.pnlPct || (t.entry > 0 ? (t.pnl / t.entry) * 100 : 0)), 0) / winners.length : 0,
      avgLoss: losers.length > 0 ? -(grossL / losers.length) : 0,
      avgLossPct: losers.length > 0 ? losers.reduce((s, t) => s + (t.pnlPct || (t.entry > 0 ? (t.pnl / t.entry) * 100 : 0)), 0) / losers.length : 0,
      maxDrawdownPct: maxDD, losingStreak: maxLs, winningStreak: maxWs,
      totalFees: trades.reduce((s, t) => s + (t.fees || 0), 0),
    },
    equityCurve: eq, exitBreakdown, trades,
  };
}

// ─── Persistent Storage ──────────────────────────────────────────

async function saveRun(data) {
  try {
    const key = `run:${Date.now()}`;
    const runs = await loadRunList();
    runs.push({ key, name: data.source, date: new Date().toISOString(), trades: data.summary.totalTrades, pf: data.summary.profitFactor, pnl: data.summary.netPnL });
    await window.storage.set("ogz-run-list", JSON.stringify(runs));
    await window.storage.set(key, JSON.stringify(data));
    return key;
  } catch (e) { console.error("Save failed:", e); return null; }
}

async function loadRunList() {
  try {
    const r = await window.storage.get("ogz-run-list");
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}

async function loadRun(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function deleteRun(key) {
  try {
    const runs = await loadRunList();
    const filtered = runs.filter(r => r.key !== key);
    await window.storage.set("ogz-run-list", JSON.stringify(filtered));
    await window.storage.delete(key);
  } catch (e) { console.error("Delete failed:", e); }
}

// ─── Components ──────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: C.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || C.white, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function EquityCurve({ data }) {
  const w = 800, h = 260, pad = { t: 20, r: 20, b: 25, l: 60 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const mn = Math.min(...data.map(d => d.equity)), mx = Math.max(...data.map(d => d.equity)), rng = mx - mn || 1;
  const tx = i => pad.l + (i / (data.length - 1)) * iw;
  const ty = eq => pad.t + (1 - (eq - mn) / rng) * ih;
  const pth = data.map((d, i) => `${i === 0 ? "M" : "L"}${tx(i).toFixed(1)},${ty(d.equity).toFixed(1)}`).join(" ");
  const area = pth + ` L${tx(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l},${(pad.t + ih).toFixed(1)} Z`;
  const up = data[data.length - 1]?.equity >= data[0]?.equity;
  const clr = up ? C.gold : C.red;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
      <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={clr} stopOpacity="0.15" /><stop offset="100%" stopColor={clr} stopOpacity="0" /></linearGradient></defs>
      {Array.from({ length: 5 }, (_, i) => mn + (rng * i) / 4).map((v, i) => (
        <g key={i}><line x1={pad.l} y1={ty(v)} x2={w - pad.r} y2={ty(v)} stroke="rgba(255,184,0,0.04)" />
        <text x={pad.l - 8} y={ty(v) + 4} textAnchor="end" fill={C.textDim} fontSize="9" fontFamily="'JetBrains Mono', monospace">${fmt(v, 0)}</text></g>
      ))}
      <path d={area} fill="url(#eg)" /><path d={pth} fill="none" stroke={clr} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={tx(data.length - 1)} cy={ty(data[data.length - 1]?.equity)} r="3" fill={clr} />
    </svg>
  );
}

function TradeTable({ trades, page, setPage }) {
  const pp = 20, tp = Math.ceil(trades.length / pp), sl = trades.slice(page * pp, (page + 1) * pp);
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["#", "Date", "Dir", "Entry", "Exit", "P&L", "Exit", "Conf"].map(h => (
              <th key={h} style={{ padding: "8px 8px", textAlign: "left", color: C.textDim, fontSize: 9, textTransform: "uppercase", fontWeight: 500, letterSpacing: "0.08em" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{sl.map(t => (
            <tr key={t.id} style={{ borderBottom: `1px solid rgba(255,184,0,0.03)` }}>
              <td style={{ padding: "5px 8px", color: C.textDim }}>{t.id}</td>
              <td style={{ padding: "5px 8px", color: C.textMid }}>{t.date}</td>
              <td style={{ padding: "5px 8px" }}>
                <span style={{ color: t.direction === "long" ? C.gold : C.red, background: t.direction === "long" ? "rgba(255,184,0,0.1)" : C.redBg, padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600 }}>
                  {(t.direction || "?").toUpperCase()}
                </span>
              </td>
              <td style={{ padding: "5px 8px", color: C.text }}>${t.entry.toFixed(2)}</td>
              <td style={{ padding: "5px 8px", color: C.text }}>${t.exit.toFixed(2)}</td>
              <td style={{ padding: "5px 8px", color: t.pnl >= 0 ? C.green : C.red, fontWeight: 600 }}>{fmtUsd(t.pnl)}</td>
              <td style={{ padding: "5px 8px", color: C.textMid, fontSize: 11 }}>{(t.exitReason || "").replace(/_/g, " ")}</td>
              <td style={{ padding: "5px 8px", color: C.textDim }}>{t.confidence > 0 ? t.confidence.toFixed(0) + "%" : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "0 8px" }}>
        <span style={{ fontSize: 11, color: C.textDim }}>{page * pp + 1}–{Math.min((page + 1) * pp, trades.length)} of {trades.length}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {[["←", -1], ["→", 1]].map(([label, dir]) => (
            <button key={label} onClick={() => setPage(Math.max(0, Math.min(tp - 1, page + dir)))}
              style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.gold, padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────

export default function OGZPrimeCommandCenter() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [tradePage, setTradePage] = useState(0);
  const [savedRuns, setSavedRuns] = useState([]);
  const [formatInfo, setFormatInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRunList().then(runs => { setSavedRuns(runs); setLoading(false); });
  }, []);

  const handleFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const parsed = parseCSV(e.target.result);
      setFormatInfo({ format: parsed.format, rows: parsed.rows.length, headers: parsed.headers.length });
      const metrics = processData(parsed);
      if (metrics) {
        setData(metrics);
        const key = await saveRun(metrics);
        if (key) {
          const runs = await loadRunList();
          setSavedRuns(runs);
        }
      }
    };
    reader.readAsText(file);
  }, []);

  const loadSaved = useCallback(async (key) => {
    const d = await loadRun(key);
    if (d) setData(d);
  }, []);

  const deleteSaved = useCallback(async (key) => {
    await deleteRun(key);
    const runs = await loadRunList();
    setSavedRuns(runs);
  }, []);

  // ─── Landing / Load Screen ──────────────────────────────
  if (!data) return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Outfit', sans-serif", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.03em" }}>
            <span style={{ color: C.gold }}>OGZ</span><span style={{ color: C.red }}>Prime</span>
          </div>
          <div style={{ fontSize: 14, color: C.textMid, marginTop: 4 }}>Command Center</div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.gold; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = C.border; }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = C.border; if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
          onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".csv,.tsv,.txt"; inp.onchange = e => { if (e.target.files[0]) handleFile(e.target.files[0]); }; inp.click(); }}
          style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: "50px 30px", textAlign: "center", background: C.bgCard, cursor: "pointer", transition: "border-color 0.2s" }}
        >
          <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 16, color: C.gold, marginBottom: 6 }}>Drop CSV here</div>
          <div style={{ fontSize: 12, color: C.textDim }}>OGZPrime backtests · TradingView exports · MT4 reports · Any OHLCV</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 12, fontFamily: "'JetBrains Mono', monospace" }}>Auto-detects format</div>
        </div>

        {formatInfo && (
          <div style={{ marginTop: 12, padding: "8px 16px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.textMid }}>
            Detected: <span style={{ color: C.gold }}>{formatInfo.format}</span> · {formatInfo.rows} rows · {formatInfo.headers} columns
          </div>
        )}

        {/* Saved Runs */}
        {savedRuns.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 12, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Saved Runs</div>
            {savedRuns.map(run => (
              <div key={run.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 6, cursor: "pointer" }}
                onClick={() => loadSaved(run.key)}>
                <div>
                  <span style={{ color: C.gold, fontSize: 13, fontWeight: 500 }}>{run.name}</span>
                  <span style={{ color: C.textDim, fontSize: 11, marginLeft: 12 }}>{new Date(run.date).toLocaleDateString()}</span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                  <span style={{ color: C.textMid }}>{run.trades} trades</span>
                  <span style={{ color: run.pf >= 1 ? C.green : C.red }}>PF {Number(run.pf).toFixed(2)}</span>
                  <span style={{ color: run.pnl >= 0 ? C.green : C.red }}>{fmtUsd(run.pnl)}</span>
                  <button onClick={e => { e.stopPropagation(); deleteSaved(run.key); }}
                    style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Dashboard ──────────────────────────────────────────
  const { summary: s, equityCurve, exitBreakdown, trades } = data;
  const pnlClr = s.netPnL >= 0 ? C.green : C.red;
  const pfClr = s.profitFactor >= 1.2 ? C.green : s.profitFactor >= 1.0 ? C.gold : C.red;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}><span style={{ color: C.gold }}>OGZ</span><span style={{ color: C.red }}>Prime</span></div>
          <div style={{ width: 1, height: 18, background: C.border }} />
          <span style={{ fontSize: 12, color: C.textMid }}>{data.source}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: C.textDim }}>
          <span style={{ background: "rgba(255,184,0,0.1)", color: C.gold, padding: "3px 10px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>{s.strategyName}</span>
          <span>{s.startDate} → {s.endDate}</span>
          <button onClick={() => setData(null)} style={{ background: C.bgCard, border: `1px solid ${C.border}`, color: C.gold, padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>← Back</button>
        </div>
      </div>

      <div style={{ padding: "16px 24px", maxWidth: 1400, margin: "0 auto" }}>
        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 }}>
          <MetricCard label="Net P&L" value={fmtUsd(s.netPnL)} sub={fmtPct(s.netPnLPct)} accent={pnlClr} />
          <MetricCard label="Profit Factor" value={s.profitFactor === Infinity ? "∞" : fmt(s.profitFactor)} sub={`${s.winners}W / ${s.losers}L`} accent={pfClr} />
          <MetricCard label="Win Rate" value={fmt(s.winRate, 1) + "%"} sub={`${s.totalTrades} trades`} accent={s.winRate >= 50 ? C.green : C.gold} />
          <MetricCard label="Max Drawdown" value={fmt(s.maxDrawdownPct, 1) + "%"} accent={C.red} />
          <MetricCard label="Avg Win" value={fmtUsd(s.avgWin)} accent={C.green} />
          <MetricCard label="Avg Loss" value={"$" + fmt(Math.abs(s.avgLoss))} accent={C.red} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          {["overview", "trades", "analysis"].map(t => (
            <button key={t} onClick={() => { setTab(t); setTradePage(0); }} style={{
              background: "none", border: "none", color: tab === t ? C.gold : C.textDim,
              padding: "10px 20px", cursor: "pointer", fontSize: 13, fontWeight: 500,
              borderBottom: tab === t ? `2px solid ${C.gold}` : "2px solid transparent",
            }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Equity Curve</div>
              <EquityCurve data={equityCurve} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Exit Breakdown</div>
                <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                  {exitBreakdown.map((d, i) => (<div key={i} style={{ width: `${(d.count / s.totalTrades) * 100}%`, background: d.color }} />))}
                </div>
                {exitBreakdown.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 11 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: d.color }} />
                      <span style={{ color: C.textMid }}>{d.reason.replace(/_/g, " ")}</span>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: d.pnl >= 0 ? C.green : C.red }}>{d.count} · {fmtUsd(d.pnl)}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginBottom: 3 }}>Win Streak</div><div style={{ fontSize: 18, fontWeight: 700, color: C.gold, fontFamily: "'JetBrains Mono', monospace" }}>{s.winningStreak}</div></div>
                <div><div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginBottom: 3 }}>Loss Streak</div><div style={{ fontSize: 18, fontWeight: 700, color: C.red, fontFamily: "'JetBrains Mono', monospace" }}>{s.losingStreak}</div></div>
                <div><div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginBottom: 3 }}>Fees</div><div style={{ fontSize: 18, fontWeight: 700, color: C.textMid, fontFamily: "'JetBrains Mono', monospace" }}>${fmt(s.totalFees)}</div></div>
              </div>
            </div>
          </div>
        )}

        {tab === "trades" && (
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
            <TradeTable trades={trades} page={tradePage} setPage={setTradePage} />
          </div>
        )}

        {tab === "analysis" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>Direction Split</div>
              {["long", "short"].map(dir => {
                const dt = trades.filter(t => t.direction === dir);
                const wins = dt.filter(t => t.pnl > 0).length;
                const pnl = dt.reduce((s, t) => s + t.pnl, 0);
                return (
                  <div key={dir} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid rgba(255,184,0,0.04)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: dir === "long" ? C.gold : C.red, background: dir === "long" ? "rgba(255,184,0,0.1)" : C.redBg, padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600 }}>{dir.toUpperCase()}</span>
                      <span style={{ color: C.textMid, fontSize: 12 }}>{dt.length}</span>
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, display: "flex", gap: 14 }}>
                      <span style={{ color: C.textMid }}>{dt.length > 0 ? ((wins / dt.length) * 100).toFixed(0) : 0}%</span>
                      <span style={{ color: pnl >= 0 ? C.green : C.red, fontWeight: 600 }}>{fmtUsd(pnl)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 8, padding: 18 }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>Confidence Tiers</div>
              {[{ l: "Low (0-40%)", a: 0, b: 40 }, { l: "Mid (40-70%)", a: 40, b: 70 }, { l: "High (70-90%)", a: 70, b: 90 }, { l: "Max (90%+)", a: 90, b: 101 }].map(tier => {
                const tt = trades.filter(t => t.confidence >= tier.a && t.confidence < tier.b);
                const w = tt.filter(t => t.pnl > 0).length;
                const p = tt.reduce((s, t) => s + t.pnl, 0);
                return (
                  <div key={tier.l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid rgba(255,184,0,0.03)`, fontSize: 12 }}>
                    <span style={{ color: C.textMid }}>{tier.l}</span>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", display: "flex", gap: 14 }}>
                      <span style={{ color: C.textDim }}>{tt.length}</span>
                      <span style={{ color: C.textMid }}>{tt.length > 0 ? ((w / tt.length) * 100).toFixed(0) : 0}%</span>
                      <span style={{ color: p >= 0 ? C.green : C.red }}>{fmtUsd(p)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 20, padding: "12px 0", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim }}>
          <span>OGZPrime v14 · Command Center</span>
          <span>{new Date().toISOString().slice(0, 16).replace("T", " ")}</span>
        </div>
      </div>
    </div>
  );
}
