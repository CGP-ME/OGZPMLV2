# CC Spec: Session Router Implementation

**Date:** 2026-04-24
**Branch:** `alpaca/stocks-paper-flip`
**Author:** Wolf (Claude 4.6, claude.ai)
**Scope:** 6 files (2 new, 4 modified), touches `core/` and `run-empire-v2.js` — **Phase 0 REQUIRED**
**Commit discipline:** 1 atomic commit. Syntax-check all files. Baseline verify with SESSION_ROUTER_ENABLED=false.

---

## What This Does

Bot trades crypto 24/7 via Kraken, automatically switches to stocks via Alpaca during NYSE Regular Trading Hours (09:30-16:00 ET), then back to Kraken after hours. Sequential operation — only ONE feed active at a time. On RTH open: pause Kraken subscription, start Alpaca. On RTH close: force-close stock positions, pause Alpaca, resume Kraken.

Gated behind `SESSION_ROUTER_ENABLED=false` (default). When off, bot runs exactly as it does today — single broker, no switching. Flip to `true` to enable dual-broker 24/7 operation.

---

## Decisions (locked by Trey, do not change)

1. **Sequential (not parallel)** — ONE feed active at a time
2. **Apex watchlist** — stocks: `['TSLA','SPY','QQQ','NVDA','COIN','MARA','RIOT']`, crypto: `['BTC/USD','ETH/USD','SOL/USD']`
3. **Same strategies both sessions** — no per-asset strategy filtering
4. **NYSE calendar** — import from `foundation/nyse-calendar.js` (new file)

---

## Files

| # | File | Target path | Change type |
|---|------|-------------|-------------|
| 01 | `nyse-calendar.js` | `foundation/nyse-calendar.js` | **NEW** |
| 02 | `SessionRouter.js` | `core/SessionRouter.js` | **NEW** |
| 03 | `session-phase.js` | `public/js/panels/session-phase.js` | **MODIFY** (import calendar) |
| 04 | `run-empire-v2.js` | `run-empire-v2.js` | **MODIFY** (wire SessionRouter) |
| 05 | `TradingConfig.js` | `core/TradingConfig.js` | **MODIFY** (add session defaults) |
| 06 | `config/trading.config.json` | `config/trading.config.json` | **MODIFY** (add sessions block) |

---

## File 1: `foundation/nyse-calendar.js` (NEW)

Single source of truth for NYSE holidays, early-close days, session boundaries, and DST-aware market phase detection.

```javascript
'use strict';

// NYSE full-day closures 2026-2027
const HOLIDAYS = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
    '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

// Early-close days (RTH closes at 13:00 ET instead of 16:00)
const EARLY_CLOSE = new Set([
    '2026-11-27', '2026-12-24',
    '2027-11-26', '2027-12-23',
]);

// Session boundaries (minutes from midnight ET)
const SESSIONS = {
    PRE_OPEN:  4 * 60,          // 04:00 ET
    RTH_OPEN:  9 * 60 + 30,     // 09:30 ET
    RTH_CLOSE: 16 * 60,         // 16:00 ET
    AH_CLOSE:  20 * 60,         // 20:00 ET
};

function getNYTimeParts(date) {
    const d = date || new Date();
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, weekday: 'short',
    });
    const parts = dtf.formatToParts(d);
    const get = (t) => (parts.find(p => p.type === t) || {}).value;
    const hour = parseInt(get('hour'), 10) % 24;
    const minute = parseInt(get('minute'), 10);
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        hour, minute,
        weekday: get('weekday'),
        minuteOfDay: hour * 60 + minute,
    };
}

function getMarketPhase(date) {
    const ny = getNYTimeParts(date);
    const mod = ny.minuteOfDay;

    if (ny.weekday === 'Sat' || ny.weekday === 'Sun') {
        return { phase: 'closed', isRTH: false, isOpen: false, nextTransition: 'Pre-market Monday 04:00 ET', rthCloseMinute: SESSIONS.RTH_CLOSE };
    }
    if (HOLIDAYS.has(ny.date)) {
        return { phase: 'closed', isRTH: false, isOpen: false, nextTransition: 'Holiday', rthCloseMinute: SESSIONS.RTH_CLOSE };
    }

    const rthClose = EARLY_CLOSE.has(ny.date) ? 13 * 60 : SESSIONS.RTH_CLOSE;

    if (mod < SESSIONS.PRE_OPEN) return { phase: 'closed', isRTH: false, isOpen: false, nextTransition: 'Pre-market 04:00 ET', rthCloseMinute: rthClose };
    if (mod < SESSIONS.RTH_OPEN) return { phase: 'pre', isRTH: false, isOpen: true, nextTransition: 'RTH opens 09:30 ET', rthCloseMinute: rthClose };
    if (mod < rthClose) return { phase: 'rth', isRTH: true, isOpen: true, nextTransition: EARLY_CLOSE.has(ny.date) ? 'Early close 13:00 ET' : 'RTH closes 16:00 ET', rthCloseMinute: rthClose };
    if (mod < SESSIONS.AH_CLOSE) return { phase: 'ah', isRTH: false, isOpen: true, nextTransition: 'After-hours ends 20:00 ET', rthCloseMinute: rthClose };
    return { phase: 'closed', isRTH: false, isOpen: false, nextTransition: 'Pre-market 04:00 ET', rthCloseMinute: rthClose };
}

module.exports = { HOLIDAYS, EARLY_CLOSE, SESSIONS, getNYTimeParts, getMarketPhase };
```

---

## File 2: `core/SessionRouter.js` (NEW)

Full module — EventEmitter, checks market phase every 60s, transitions between crypto and stocks.

```javascript
'use strict';

const EventEmitter = require('events');
const { getMarketPhase, getNYTimeParts } = require('../foundation/nyse-calendar');
const { getInstance: getStateManager } = require('./StateManager');

class SessionRouter extends EventEmitter {
  constructor(config = {}) {
    super();
    this.enabled = config.enabled !== false;
    this.clock = config.clock || (() => Date.now());
    this.checkIntervalMs = config.fast ? 1000 : 60000;

    this.krakenAdapter = null;
    this.alpacaAdapter = null;
    this.orderRouter = null;
    this.stateManager = getStateManager();

    this.activeSession = null;   // 'crypto' | 'stocks' | null
    this.activeBroker = null;
    this.transitionInProgress = false;
    this.lastTransitionAt = 0;
    this.intervalId = null;

    this.stockSymbols = config.stockSymbols || ['TSLA','SPY','QQQ','NVDA','COIN','MARA','RIOT'];
    this.cryptoSymbols = config.cryptoSymbols || ['BTC/USD','ETH/USD','SOL/USD'];

    this.onOhlcCallback = null;

    // Bot context — set via wire() for access to marketData.price
    this.ctx = null;

    console.log(`[SessionRouter] Initialized | enabled=${this.enabled} | interval=${this.checkIntervalMs}ms`);
  }

  wire(krakenAdapter, alpacaAdapter, orderRouter, onOhlcCallback, ctx) {
    this.krakenAdapter = krakenAdapter;
    this.alpacaAdapter = alpacaAdapter;
    this.orderRouter = orderRouter;
    this.onOhlcCallback = onOhlcCallback;
    this.ctx = ctx || null;
    console.log('[SessionRouter] Wired — Kraken + Alpaca + OrderRouter');
  }

  /**
   * Get current market price from CandleProcessor's ctx.marketData.
   * Used for force-close P&L computation at session boundary.
   * Returns null if no price data available (pre-first-tick).
   */
  _getCurrentPrice() {
    if (this.ctx && this.ctx.marketData && this.ctx.marketData.price > 0) {
      return this.ctx.marketData.price;
    }
    // Fallback: try the last candle in priceHistory
    if (this.ctx && this.ctx.priceHistory && this.ctx.priceHistory.length > 0) {
      const lastCandle = this.ctx.priceHistory[this.ctx.priceHistory.length - 1];
      return lastCandle[5] || lastCandle.close || null;  // index 5 = close in canonical array
    }
    return null;
  }

  start() {
    if (!this.enabled) {
      console.log('[SessionRouter] Disabled (SESSION_ROUTER_ENABLED=false)');
      return;
    }
    if (!this.krakenAdapter || !this.alpacaAdapter) {
      console.error('[SessionRouter] Cannot start — missing broker adapters. Call wire() first.');
      return;
    }

    const phase = getMarketPhase(new Date(this.clock()));
    if (phase.isRTH) {
      this._activateStocks();
    } else {
      this._activateCrypto();
    }

    this.intervalId = setInterval(() => {
      try { this._checkTransition(); }
      catch (err) { console.error('[SessionRouter] Check failed:', err.message); }
    }, this.checkIntervalMs);

    console.log(`[SessionRouter] Started | initial session: ${this.activeSession}`);
  }

  _checkTransition() {
    if (this.transitionInProgress) return;

    const now = new Date(this.clock());
    const phase = getMarketPhase(now);

    if (this.activeSession === 'crypto' && phase.isRTH) {
      this._transitionToStocks(now);
      return;
    }

    if (this.activeSession === 'stocks' && !phase.isRTH) {
      this._transitionToCrypto(now);
      return;
    }
  }

  async _transitionToStocks(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    console.log(`[SessionRouter] TRANSITION: crypto -> stocks at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);

    try {
      await this.stateManager.pauseTrading('SessionRouter: transitioning to stocks');

      if (this.krakenAdapter.unsubscribeAll) this.krakenAdapter.unsubscribeAll();
      if (this.krakenAdapter.removeAllListeners) this.krakenAdapter.removeAllListeners('ohlc');

      if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);

      const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
      for (const symbol of this.stockSymbols) {
        if (this.alpacaAdapter.subscribeToCandles) this.alpacaAdapter.subscribeToCandles(symbol, timeframe);
      }

      if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);

      this.activeSession = 'stocks';
      this.activeBroker = this.alpacaAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();

      this.emit('transition', { from: 'crypto', to: 'stocks', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: stocks session');

    } catch (err) {
      console.error('[SessionRouter] Transition to stocks FAILED:', err.message);
      try { await this.stateManager.resumeTrading(); } catch (e) {}
    } finally {
      this.transitionInProgress = false;
    }
  }

  async _transitionToCrypto(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    console.log(`[SessionRouter] TRANSITION: stocks -> crypto at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);

    try {
      await this.stateManager.pauseTrading('SessionRouter: transitioning to crypto');

      // Force-close open stock positions
      // CRITICAL: Use current market price from ctx.marketData, NOT trade.entryPrice.
      // closePosition computes P&L as (exitPrice - entryPrice). Using entryPrice
      // as both entry AND exit produces P&L = $0, which is wrong.
      const activeTrades = this.stateManager.state.activeTrades;
      if (activeTrades && activeTrades.size > 0) {
        const currentPrice = this._getCurrentPrice();
        console.log(`[SessionRouter] Force-closing ${activeTrades.size} stock position(s) at $${currentPrice}...`);
        for (const [orderId, trade] of activeTrades.entries()) {
          try {
            const exitPrice = currentPrice || trade.price || trade.entryPrice;
            await this.stateManager.closePosition(exitPrice, false, null, {
              orderId,
              exitReason: 'session_close',
              tradeId: trade.tradeId || orderId,
            });
            console.log(`[SessionRouter] Closed position ${orderId}`);
          } catch (closeErr) {
            console.error(`[SessionRouter] Failed to close ${orderId}:`, closeErr.message);
          }
        }
      }

      if (this.alpacaAdapter.unsubscribeAll) this.alpacaAdapter.unsubscribeAll();
      if (this.alpacaAdapter.removeAllListeners) this.alpacaAdapter.removeAllListeners('ohlc');

      if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);

      const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
      const primaryCrypto = this.cryptoSymbols[0] || 'BTC/USD';
      if (this.krakenAdapter.subscribeToCandles) this.krakenAdapter.subscribeToCandles(primaryCrypto, timeframe);

      if (this.onOhlcCallback && this.krakenAdapter.on) this.krakenAdapter.on('ohlc', this.onOhlcCallback);

      this.activeSession = 'crypto';
      this.activeBroker = this.krakenAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();

      this.emit('transition', { from: 'stocks', to: 'crypto', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: crypto session');

    } catch (err) {
      console.error('[SessionRouter] Transition to crypto FAILED:', err.message);
      try { await this.stateManager.resumeTrading(); } catch (e) {}
    } finally {
      this.transitionInProgress = false;
    }
  }

  _activateCrypto() {
    this.activeSession = 'crypto';
    this.activeBroker = this.krakenAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    if (this.krakenAdapter.subscribeToCandles) this.krakenAdapter.subscribeToCandles(this.cryptoSymbols[0] || 'BTC/USD', timeframe);
    if (this.onOhlcCallback && this.krakenAdapter.on) this.krakenAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: crypto');
  }

  _activateStocks() {
    this.activeSession = 'stocks';
    this.activeBroker = this.alpacaAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);
    const timeframe = process.env.CANDLE_TIMEFRAME || '15m';
    for (const symbol of this.stockSymbols) {
      if (this.alpacaAdapter.subscribeToCandles) this.alpacaAdapter.subscribeToCandles(symbol, timeframe);
    }
    if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: stocks');
  }

  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    console.log('[SessionRouter] Stopped');
  }

  getStatus() {
    return {
      enabled: this.enabled,
      activeSession: this.activeSession,
      activeBroker: this.activeBroker?.constructor?.name || null,
      transitionInProgress: this.transitionInProgress,
      lastTransitionAt: this.lastTransitionAt ? new Date(this.lastTransitionAt).toISOString() : null,
      marketPhase: getMarketPhase(new Date(this.clock())),
    };
  }
}

module.exports = SessionRouter;
```

---

## File 3: `public/js/panels/session-phase.js` (MODIFY)

Add a comment above the HOLIDAYS and EARLY_CLOSE sets pointing to the source of truth:

```javascript
// Source of truth: foundation/nyse-calendar.js
// If updating holidays, update BOTH files (or dynamically load from /api/trai/session-context)
```

Documentation-only change. No functional change.

---

## File 4: `run-empire-v2.js` (MODIFY)

### 4a. Import SessionRouter (near line 174)

```javascript
const SessionRouter = require('./core/SessionRouter');
```

### 4b. Replace single-broker block (lines 594-618) with dual-path

```javascript
    // BROKER SETUP
    const sessionRouterEnabled = process.env.SESSION_ROUTER_ENABLED === 'true';

    if (sessionRouterEnabled) {
      console.log('[EMPIRE V2] SessionRouter enabled — creating Kraken + Alpaca adapters');
      const krakenAdapter = createBrokerAdapter('kraken', {
        apiKey: resolvedConfig.config.broker.apiKey,
        apiSecret: resolvedConfig.config.broker.apiSecret,
      });
      const alpacaAdapter = createBrokerAdapter('alpaca', {});

      this.sessionRouter = new SessionRouter({
        enabled: true,
        fast: process.env.SESSION_ROUTER_FAST === 'true',
        stockSymbols: (process.env.ALPACA_SYMBOLS || 'TSLA,SPY,QQQ,NVDA,COIN,MARA,RIOT').split(',').map(s => s.trim()),
        cryptoSymbols: ['BTC/USD', 'ETH/USD', 'SOL/USD'],
      });

      // Wire adapters + OrderRouter + ohlc callback + bot context
      this.orderRouter = new OrderRouter();
      this.sessionRouter.wire(krakenAdapter, alpacaAdapter, this.orderRouter, (eventData) => {
        const timeframe = eventData.timeframe || '1m';
        const raw = eventData.data || eventData;
        const ohlcData = normalizeOhlc(raw);
        if (!ohlcData) { console.warn('[OHLC] dropped unnormalizable payload'); return; }
        this.storeTimeframeCandle(timeframe, ohlcData);
        if (timeframe === '1m') this.handleMarketData(ohlcData);
        if (timeframe === '5m' && this.timeframeSelector) this.timeframeSelector.evaluate(ohlcData[5]);
      }, this);  // 'this' = bot context, gives SessionRouter access to this.marketData

      this.kraken = this.sessionRouter.activeBroker;
      this.sessionRouter.on('transition', (ev) => {
        this.kraken = this.sessionRouter.activeBroker;
        console.log(`[EMPIRE V2] Session transition: ${ev.from} -> ${ev.to}`);
      });

    } else {
      // Single-broker fallback (current behavior, Apex eval default)
      const brokerId = process.env.BROKER || 'alpaca';
      const adapterOptions = brokerId === 'kraken'
        ? { apiKey: resolvedConfig.config.broker.apiKey, apiSecret: resolvedConfig.config.broker.apiSecret }
        : {};
      this.kraken = createBrokerAdapter(brokerId, adapterOptions);
      console.log('[EMPIRE V2] Single-broker mode: ' + brokerId);

      this.orderRouter = new OrderRouter();
      const routedSymbols = brokerId === 'alpaca'
        ? (process.env.ALPACA_SYMBOLS || 'TSLA').split(',').map(s => s.trim())
        : ['BTC/USD', 'XBT/USD', 'ETH/USD', 'SOL/USD'];
      this.orderRouter.registerBroker(this.kraken, routedSymbols);
    }
```

### 4c. Start after boot (after `this.isRunning = true`)

```javascript
    if (this.sessionRouter) this.sessionRouter.start();
```

### 4d. Stop on shutdown

```javascript
    if (this.sessionRouter) this.sessionRouter.stop();
```

### 4e. Guard subscribeToMarketData (top of method)

```javascript
    if (this.sessionRouter && this.sessionRouter.enabled) {
      console.log('[EMPIRE V2] SessionRouter active — skipping manual subscription');
      return;
    }
```

---

## File 5: `core/TradingConfig.js` (MODIFY)

Add after the `filters:` block:

```javascript
    sessions: {
      routerEnabled: false,
      stockSymbols: ['TSLA','SPY','QQQ','NVDA','COIN','MARA','RIOT'],
      cryptoSymbols: ['BTC/USD','ETH/USD','SOL/USD'],
      checkIntervalMs: 60000,
      forceCloseOnSessionEnd: true,
    },
```

---

## File 6: `config/trading.config.json` (MODIFY)

Add sessions block:

```json
  "sessions": {
    "routerEnabled": false,
    "stockSymbols": ["TSLA","SPY","QQQ","NVDA","COIN","MARA","RIOT"],
    "cryptoSymbols": ["BTC/USD","ETH/USD","SOL/USD"],
    "checkIntervalMs": 60000,
    "forceCloseOnSessionEnd": true
  }
```

---

## Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `SESSION_ROUTER_ENABLED` | `false` | Enable dual-broker session routing |
| `SESSION_ROUTER_FAST` | `false` | 1s check interval for testing |
| `ALPACA_SYMBOLS` | `TSLA,SPY,QQQ,NVDA,COIN,MARA,RIOT` | Stock watchlist |

---

## Verification

### Phase 0 baseline (REQUIRED)

With `SESSION_ROUTER_ENABLED` unset:

```bash
SOLO_STRATEGY=EMASMACrossover ENABLE_EMA=true \
EXECUTION_MODE=backtest CANDLE_SOURCE=file \
CANDLE_DATA_FILE=tuning/tsla-15m-2y.json \
BACKTEST_MODE=true BACKTEST_FAST=true BACKTEST_SILENT=true \
FEE_MAKER=0 FEE_TAKER=0 MIN_TRADE_CONFIDENCE=0.60 \
STOP_LOSS_PERCENT=2.5 ACCOUNT_DRAWDOWN_BYPASS=true \
STATE_FILE=data/state-session-router-verify.json \
BACKTEST_NO_PATTERN_SAVE=true ENABLE_DASHBOARD=false \
ATR_FILTER_ENABLED=true ATR_MIN_PERCENT=0.15 \
DIRECTION_FILTER=long_only ENABLE_SHORTS=false ENABLE_TRAI=false \
EXIT_SYSTEM=legacy \
node run-empire-v2.js
```

**Expected:** `$17,950.589592711076 / 1430 / 57.55% WR / 2.63% DD / 2.69 PF`

### Syntax check

```bash
node --check foundation/nyse-calendar.js && echo "OK"
node --check core/SessionRouter.js && echo "OK"
node --check core/TradingConfig.js && echo "OK"
node --check run-empire-v2.js && echo "OK"
```

---

## Adversarial Mercury prompt

```
Adversarial audit of Session Router (core/SessionRouter.js + run-empire-v2.js wiring).
READ the actual code. Try to break it. For each task, cite file:line.

TASK 1 — Force-close uses stale price:
_transitionToCrypto force-closes stock positions using trade.price
(the ENTRY price, not current market price). This means P&L
calculation on forced close is wrong. Does StateManager.closePosition
compute P&L from the price argument or from stored trade data?

TASK 2 — Listener leak on transition:
Each transition calls adapter.on('ohlc', callback). If the callback
isn't the SAME function reference each time, old listeners accumulate.
Does removeAllListeners('ohlc') before re-adding actually clear them?
What if another module also listens to 'ohlc'?

TASK 3 — OrderRouter.registerBroker overwrite:
Each transition calls orderRouter.registerBroker() with new symbols.
Does registerBroker REPLACE the existing mapping or APPEND? If it
appends, after 10 transitions there are 10 copies of TSLA mapped.

TASK 4 — Race between transition and trade:
_transitionToCrypto pauses trading, closes positions, then resumes.
But pauseTrading is async. What if a trade is mid-execution when
pause fires? Is there a lock?

TASK 5 — this.kraken reference after transition:
run-empire-v2.js sets this.kraken = this.sessionRouter.activeBroker
on transition events. But other code reads this.kraken synchronously.
Is there a race where this.kraken points to the old adapter?

TASK 6 — Backtest with SESSION_ROUTER_ENABLED=true:
If someone runs a backtest with SESSION_ROUTER_ENABLED=true, the
router tries to create both adapters. Does BrokerFactory work without
API keys? Does the router crash trying to subscribe?

Report: total issues, severity, file:line. Verdict: SHIP IT / FIX FIRST.
```

---

## Commit message

```
feat(core): Session Router — dual-broker crypto/stocks session switching

- foundation/nyse-calendar.js: NYSE holidays, early-close days, session
  boundaries, DST-aware market phase detection via Intl
- core/SessionRouter.js: EventEmitter, checks market phase every 60s,
  transitions between Kraken (crypto 24/7) and Alpaca (stocks RTH).
  Sequential — one feed active at a time. Force-closes stock positions
  on RTH end. Gated by SESSION_ROUTER_ENABLED=false (default).
- run-empire-v2.js: dual-adapter creation when router enabled, single-
  broker fallback preserved as default. subscribeToMarketData guard.
- TradingConfig + trading.config.json: sessions block with watchlists

Phase 0 verified with SESSION_ROUTER_ENABLED=false (default):
$17,950.589592711076 / 1430 / 57.55% WR / 2.63% DD / 2.69 PF.
```

---

## ADDENDUM 2026-05-06 — Pattern bank swap requirement

**Discovered during off-hours Kraken verification.** When SessionRouter switches venues (Kraken ↔ Alpaca), the active pattern bank file MUST also swap. Currently `core/UnifiedPatternMemory.js:181-184` infers asset class from `TRADING_PAIR` env at construction time:

```js
let cls = process.env.ASSET_CLASS;
if (!cls) {
    const tp = process.env.TRADING_PAIR || '';
    if (tp.includes('/')) cls = 'crypto';   // BTC/USD → crypto
    else if (tp) cls = 'stocks';            // TSLA, BTC-USD → stocks (BUG)
    else cls = 'default';
}
```

Two problems this addendum addresses:

**Problem 1 — Inference logic is fragile.** `BTC-USD` (dash) falls through to `'stocks'` because the slash-detector misses it. Manual verification on 2026-05-06 caught this: `TRADING_PAIR=BTC-USD` + Kraken adapter still loaded `unified-patterns.paper.stocks.json` and would have written BTC-derived patterns into the TSLA bucket if the bot had reached pattern observation. Fix in this PR: replace slash-only detection with a normalized comparison (e.g. enumerate known crypto symbols, or strip separators and check against a known crypto-base list `{BTC, ETH, SOL, XBT, ...}`). `ASSET_CLASS` env override stays as the explicit escape hatch.

**Problem 2 — SessionRouter venue switch must swap pattern banks.** Pattern bank is selected ONCE at `UnifiedPatternMemory` construction. SessionRouter today swaps the broker adapter and feed subscription, but the singleton `unifiedPatternMemory` instance keeps writing to whichever bucket it was constructed with. After an RTH-open transition (Kraken→Alpaca), the bot would be feeding TSLA candles into the crypto pattern bank, or vice versa. Required SessionRouter behavior:

1. On `_transitionToCrypto`: pause writes, persist current state to `paper.stocks.json`, swap `unifiedPatternMemory` to the crypto bank file (`paper.crypto.json`), reload from disk
2. On `_transitionToStocks`: symmetric — persist to `paper.crypto.json`, swap to `paper.stocks.json`
3. Atomic swap: no candle should be processed during the swap window. Pause the trading loop's candle handler while the swap completes, then resume.

**Implementation hint:** add `unifiedPatternMemory.swapBank(newAssetClass)` method that does `await this.persist()`, then re-initializes `this.storagePath` and `this.patterns` from the new file. SessionRouter calls this inside `_transitionToCrypto` / `_transitionToStocks` immediately after pausing trading and before subscribing to the new feed.

**Why this matters:** Pattern memory is the bot's learned edge. Cross-asset contamination breaks the per-asset learning model — TSLA's RSI-trend patterns don't generalize to BTC's volatility regime, and vice versa. A bot that runs SessionRouter for a week without bank-swapping would silently corrupt both banks beyond recovery.

**Symptom you'd see if this isn't fixed:** stocks bank keeps growing during off-hours (when bot is on Kraken), crypto bank stays frozen during RTH (when bot is on Alpaca). Verifiable by `md5sum` of both bank files at venue transition boundaries.
