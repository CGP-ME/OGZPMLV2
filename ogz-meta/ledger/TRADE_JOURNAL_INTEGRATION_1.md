# OGZPrime Trade Journal + Instant Replay — Integration Guide

## What You're Getting

**5 files, ~3,800 lines, zero npm dependencies.**

| File | Lines | What It Does |
|------|-------|--------------|
| `TradeJournal.js` | 971 | Analytics engine — 40+ metrics, append-only ledger, tax-ready CSV |
| `TradeJournalBridge.js` | 409 | Auto-wires journal + replay into bot, serves HTTP routes |
| `TradeReplayCapture.js` | 210 | Captures candle snapshots at entry/exit for visual replay |
| `trade-journal.html` | 1,129 | Journal dashboard — equity curve, stats, calendar heatmap |
| `trade-replay.html` | 846 | Instant replay card — full chart with indicators, trade markers |

### The Killer Feature
When a trade closes, the bot **automatically**:
1. Records it in the journal ledger (crash-safe append-only)
2. Captures surrounding candle data (60 before + 30 after)
3. Saves a self-contained replay file
4. Pushes a WebSocket notification to the dashboard with a **"View Replay"** button
5. The replay renders a full TradingView chart with entry/exit markers, EMAs, Bollinger Bands, VWAP, volume — all auto-populated

No clicking export. No manual charting. Trade closes → replay is ready instantly.

---

## File Placement

```
OGZPMLV2-master/
├── core/
│   ├── TradeJournal.js          ← NEW
│   ├── TradeJournalBridge.js    ← NEW
│   └── TradeReplayCapture.js    ← NEW
├── public/
│   ├── trade-journal.html       ← NEW
│   └── trade-replay.html        ← NEW
└── data/
    └── journal/                 ← Auto-created at runtime
        ├── trade-ledger.jsonl
        ├── equity-snapshots.jsonl
        ├── journal-stats.json
        ├── replays/
        │   └── {orderId}.json   ← One per trade
        └── exports/
```

---

## Integration Steps (3 changes total)

### Step 1: Copy files
```bash
cp TradeJournal.js TradeJournalBridge.js TradeReplayCapture.js ~/OGZPMLV2-master/core/
cp trade-journal.html trade-replay.html ~/OGZPMLV2-master/public/
```

### Step 2: Wire into run-empire-v2.js

**At the top** (~line 10-20), add the require:
```javascript
const { TradeJournalBridge } = require('./core/TradeJournalBridge');
```

**In `startBot()`** after all modules are initialized (~line 510-520), add ONE line:
```javascript
this.journalBridge = new TradeJournalBridge(this);
```

### Step 3: Add routes to ogzprime-ssl-server.js

**Option A — If using Express:**
```javascript
// After your other app.get() routes:
if (bot.journalBridge) bot.journalBridge.registerRoutes(app);
```

**Option B — If using raw HTTP handler:**
```javascript
// In your request handler, before your existing routes:
if (bot.journalBridge && bot.journalBridge.handleRequest(req, res)) return;
```

### Step 4: Restart
```bash
pm2 restart ogzprime-bot
pm2 restart ogzprime-dashboard  # or whatever your server process is
```

---

## URLs After Integration

| URL | Page |
|-----|------|
| `https://ogzprime.com/journal` | Trade Journal dashboard |
| `https://ogzprime.com/replay?id={orderId}` | Instant replay for specific trade |
| `https://ogzprime.com/api/journal/stats` | JSON stats endpoint |
| `https://ogzprime.com/api/journal/equity` | Equity curve data |
| `https://ogzprime.com/api/journal/breakdown/{dim}` | Performance breakdown |
| `https://ogzprime.com/api/replays` | List all replays |
| `https://ogzprime.com/api/replay/{orderId}` | Single replay data |

---

## WebSocket Messages

### Bot → Dashboard (auto-pushed)
| Type | When | Data |
|------|------|------|
| `trade_closed_replay` | Every trade close | orderId, pnl, replayUrl, isWin |
| `journal_snapshot` | Every 30s | Full stats + recent trades |

### Dashboard → Bot (on request)
| Type | Purpose |
|------|---------|
| `request_journal` | Get full journal snapshot |
| `request_journal_equity` | Get equity curve |
| `request_journal_breakdowns` | Get performance by dimension |
| `request_journal_calendar` | Get daily P&L calendar |
| `request_replay` | Get replay data for orderId |
| `request_replay_list` | List all available replays |

---

## Data Storage

All data lives in `data/journal/` — add this to `.gitignore`:
```
data/journal/
```

The ledger is append-only JSONL. If the bot crashes mid-write, you lose at most one line. Stats are rebuilt from the ledger on startup, so the cache file is an optimization, not source of truth.

Replay files are self-contained JSON — each one has the candle data, entry/exit markers, indicators, and metadata needed to render the chart completely offline.

---

## Safety

- **Journal errors never crash the bot.** Every recording is wrapped in try/catch.
- **Bridge uses monkey-patching.** Original functions execute first, journal records after.
- **Bounded memory.** 5K trades in memory, 10K equity points, older data stays on disk.
- **Zero external dependencies.** Only Node.js built-ins.
- **No modifications to existing modules.** All changes are in NEW files.

---

## What the Replay Card Shows

For every single trade, automatically:
- ✅ Full candlestick chart with entry/exit arrow markers
- ✅ Entry/exit price lines (dashed)
- ✅ EMA 20, 50, 200 (toggleable)
- ✅ Bollinger Bands (toggleable)
- ✅ VWAP (toggleable)
- ✅ Volume bars (toggleable)
- ✅ P&L verdict banner (win/loss with exact dollar + percent)
- ✅ Timeline showing entry → hold time → exit
- ✅ Pattern tags that were active at entry
- ✅ Indicator values at entry (RSI, MACD, trend)
- ✅ Confidence score and regime
- ✅ Exit reason
- ✅ Screenshot button (saves chart as PNG)
- ✅ Prev/Next trade navigation
- ✅ Raw JSON export
- ✅ Print-friendly

All indicator calculations are **harvested directly from your existing dashboard** — same EMA, Bollinger, VWAP code. Zero duplication of logic, guaranteed visual consistency.
