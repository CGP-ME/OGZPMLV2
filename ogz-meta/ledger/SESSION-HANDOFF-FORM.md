# OGZPrime Session Handoff Form

> **MANDATORY**: Every AI session fills out this form at START (Sections 1-3) and END (Sections 4-7).
> Save completed forms to: `ogz-meta/sessions/SESSION-{YYYY-MM-DD}-{HH-MM}-{slug}.md`
> This is how the next claude walks in cold and knows everything.

---

## ═══════════════════════════════════════════
## SECTION 1: SESSION IDENTITY
## ═══════════════════════════════════════════

| Field | Value |
|-------|-------|
| **Date** | |
| **AI Platform** | Claude / GPT / Grok / Claude Code / Other: |
| **Session Goal** | *One sentence: what was requested* |
| **Complexity** | Low (patch) / Medium (module) / High (architecture) / Critical (production fix) |
| **Modules In Scope** | *List every file you expect to touch* |

---

## ═══════════════════════════════════════════
## SECTION 2: BOT STATE AT SESSION START
## ═══════════════════════════════════════════

> Pull this from PM2, StateManager, and bot console. If you can't access VPS, ask Trey.

### 2a. Process State
| Field | Value |
|-------|-------|
| **PM2 Status** | online / stopped / erroring |
| **Uptime** | |
| **Restarts** | |
| **Memory Usage** | |
| **CPU Usage** | |

### 2b. Trading State
| Field | Value |
|-------|-------|
| **Mode** | PAPER / LIVE / BACKTEST / TEST |
| **In Position** | Yes (amount, entry price, asset) / No |
| **Balance** | $ |
| **Active Asset** | BTC-USD / ETH-USD / etc. |
| **Daily P&L** | $ |
| **Total Trades Today** | |
| **Win Rate (session)** | |

### 2c. Connection State
| Field | Value |
|-------|-------|
| **Kraken WS** | Connected / Disconnected |
| **Dashboard WS** | Connected / Disconnected |
| **Last Data Received** | *timestamp or "Xs ago"* |
| **SSL Server** | Running / Down |
| **Dashboard Accessible** | Yes (URL) / No |

### 2d. Known Issues at Start
> List anything broken, degraded, or concerning when you walked in.
- 
- 

---

## ═══════════════════════════════════════════
## SECTION 3: CONTEXT CHECK
## ═══════════════════════════════════════════

> Confirm you've read the required architecture docs before touching anything.

- [ ] Read `ogz-meta/04_guardrails-and-rules.md`
- [ ] Read `ogz-meta/05_landmines-and-gotchas.md`
- [ ] Read relevant architecture diagrams (`ogzprime-architecture.mermaid`, `ogzprime-broker-chain.mermaid`, `ogzprime-data-structures.mermaid`)
- [ ] Read `ogz-meta/06_recent-changes.md`
- [ ] Confirmed: **No code changes without pipeline approval**

### Key Architecture Facts (verify you understand):
- `bot.kraken` = KrakenIBrokerAdapter (from BrokerFactory)
- `bot.kraken.kraken` = kraken_adapter_simple (underlying connection)
- `bot.kraken.kraken.ws` = raw Kraken WebSocket
- `stateManager` = SINGLETON, source of truth for position/balance
- `stateManager.get('position')` returns BTC amount (0 = no position)
- Trading pair formats: `BTC-USD` (config) → `BTC/USD` (internal) → `XBT/USD` (Kraken WS) → `XXBTZUSD` (Kraken private API)
- Pattern memory lives in `data/pattern-memory.{mode}.json` via EnhancedPatternRecognition
- `./pattern_memory.json` in root is LEGACY DEAD — do not use

---

## ═══════════════════════════════════════════
## SECTION 4: WORK PERFORMED
## ═══════════════════════════════════════════

> Fill this out as you work. Be specific — the next AI reads this.

### 4a. Files Created
| File | Lines | Purpose |
|------|-------|---------|
| | | |

### 4b. Files Modified
| File | Lines Changed | What Changed | Why |
|------|---------------|--------------|-----|
| | | | |

### 4c. Files Deleted
| File | Why |
|------|-----|
| | |

### 4d. Integration Patches (for modules that need wiring into existing code)
> Exact line numbers, before/after, copy-paste ready.

```
Patch 1: [file] line ~XXX
OLD: ...
NEW: ...
```

### 4e. Bugs Found
| Bug | Severity | Fixed? | Details |
|-----|----------|--------|---------|
| | Critical/High/Medium/Low | Yes/No/Deferred | |

### 4f. Decisions Made
> Document WHY you chose one approach over another. The next AI needs to know your reasoning.
- 
- 

---

## ═══════════════════════════════════════════
## SECTION 5: BOT STATE AT SESSION END
## ═══════════════════════════════════════════

> Same fields as Section 2. This is how we verify nothing broke.

### 5a. Process State
| Field | Value |
|-------|-------|
| **PM2 Status** | online / stopped / erroring |
| **Uptime** | |
| **Restarts** | |
| **Memory Usage** | |
| **CPU Usage** | |

### 5b. Trading State
| Field | Value |
|-------|-------|
| **Mode** | PAPER / LIVE / BACKTEST / TEST |
| **In Position** | Yes (amount, entry price, asset) / No |
| **Balance** | $ |
| **Active Asset** | |
| **Daily P&L** | $ |
| **Total Trades Today** | |
| **Win Rate (session)** | |

### 5c. Connection State
| Field | Value |
|-------|-------|
| **Kraken WS** | Connected / Disconnected |
| **Dashboard WS** | Connected / Disconnected |
| **Last Data Received** | |
| **SSL Server** | Running / Down |
| **Dashboard Accessible** | Yes / No |

### 5d. Verification Checklist
- [ ] Bot is running (PM2 online)
- [ ] No crash loops (restarts = 0 or same as start)
- [ ] Kraken WS connected and receiving data
- [ ] Dashboard WS connected
- [ ] Dashboard loads and shows live data
- [ ] Pattern memory recording with PnL > 0 on wins
- [ ] No new errors in PM2 logs (`pm2 logs --lines 50`)
- [ ] StateManager position/balance consistent
- [ ] If I changed trading logic: verified a trade cycle completed successfully
- [ ] If I changed WS logic: verified reconnect works (kill and confirm auto-reconnect)
- [ ] If I changed dashboard: verified chart renders, controls work

### 5e. New Issues Introduced
> Be honest. If you broke something or left something fragile, say so.
- 
- 

---

## ═══════════════════════════════════════════
## SECTION 6: HANDOFF TO NEXT SESSION
## ═══════════════════════════════════════════

### What's Ready to Deploy
> Files that are built, tested, and ready for VPS integration.
- 

### What's In Progress
> Started but not finished. Include current state and what's left.
- 

### What Needs Attention
> Known issues, fragile areas, things that need monitoring.
- 

### Recommended Next Steps
> If you were the next AI, what would you do first?
1. 
2. 
3. 

---

## ═══════════════════════════════════════════
## SECTION 7: QUICK REFERENCE FOR NEXT SESSION
## ═══════════════════════════════════════════

### Critical Commands
```bash
# Check bot status
pm2 status

# Check bot logs (last 100 lines)
pm2 logs ogzprime --lines 100

# Check StateManager
# (from node REPL in project dir)
const sm = require('./core/StateManager'); sm.getState();

# Check pattern memory
cat data/pattern-memory.paper.json | python3 -m json.tool | head -50

# Restart bot
pm2 restart ogzprime

# Stop bot (CAREFUL - closes positions if mid-trade)
pm2 stop ogzprime
```

### Active File Locations
| What | Where |
|------|-------|
| Bot entry point | `run-empire-v2.js` |
| Core modules | `core/` |
| Broker adapters | `brokers/` |
| Dashboard | `public/unified-dashboard.html` |
| SSL Server | `ogzprime-ssl-server.js` |
| State persistence | `data/state.json` |
| Pattern memory | `data/pattern-memory.{mode}.json` |
| Candle history | `data/candle-history.json` |
| Environment config | `.env` |
| Architecture diagrams | `ogz-meta/ogzprime-*.mermaid` |
| Session logs | `ogz-meta/sessions/` |

---

*Form version: 1.0 | Created: 2026-02-10 | Author: The Architect (Trey) + Claude*
