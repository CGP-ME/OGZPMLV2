# LONG-ONLY BUGS — Complete Audit
## Every place the pipeline assumes buy-only

Found by line-by-line comparison of PineScript (which handles both directions)
against Node.js pipeline (which only handles longs).

---

## BUG 1: TradingLoop.js:473 — No SELL decision branch
**File:** core/TradingLoop.js, line 473
**What it does:** Only enters trades when `tradingDirection === 'buy'`
**What's missing:** No equivalent block for `tradingDirection === 'sell'`
```javascript
// LINE 473 - ONLY checks for buy
if (decision.action === 'HOLD' && !sameDirectionBlock &&
    activeTrades.length < maxPositions &&
    tradingDirection === 'buy' && (orchResult.confidence / 100) >= minConfidence) {
```
**Fix:** Add parallel block after line 514 for `tradingDirection === 'sell'` with same risk checks, but `action: 'SELL_SHORT'` and `direction: 'short'`

---

## BUG 2: TradingLoop.js:497-498 — Hardcoded long direction
**File:** core/TradingLoop.js, lines 497-498
**What it does:** Decision always says BUY/long regardless of orchestrator direction
```javascript
decision = {
  action: 'BUY',
  direction: 'long',  // HARDCODED
  confidence: orchResult.confidence,
};
```
**Fix:** Use `tradingDirection` to set action/direction dynamically

---

## BUG 3: TradingLoop.js:509-510 — Fallback also hardcoded long
**File:** core/TradingLoop.js, lines 509-510
**Same bug as #2** in the fallback path (when riskManager not available)
```javascript
decision = {
  action: 'BUY',
  direction: 'long',  // HARDCODED
  confidence: orchResult.confidence
};
```

---

## BUG 4: TradingLoop.js:403 — Active trades filter only finds BUYs
**File:** core/TradingLoop.js, line 403
**What it does:** Only considers BUY trades as "active"
```javascript
const activeTrades = allTrades.filter(t => t.action === 'BUY');
```
**Fix:** Filter for all open trades: `t.action === 'BUY' || t.action === 'SELL_SHORT'`

---

## BUG 5: OrderExecutor.js:210 — Only handles BUY entry
**File:** core/OrderExecutor.js, line 210
**What it does:** Position opening only runs for `action === 'BUY'`
```javascript
if (decision.action === 'BUY') {
  // ... entire position opening logic
```
**Fix:** Add `else if (decision.action === 'SELL_SHORT')` block that opens a short position

---

## BUG 6: OrderExecutor.js:325-326 — Dashboard broadcast hardcoded long
**File:** core/OrderExecutor.js, lines 325-326
```javascript
action: 'BUY',
direction: 'long',
```
**Fix:** Use actual trade direction

---

## BUG 7: OrderExecutor.js:349-384 — SELL path assumes closing a long
**File:** core/OrderExecutor.js, lines 349-384
**What it does:** Every SELL is treated as closing a long position. Looks for matching BUY trade.
```javascript
} else if (decision.action === 'SELL') {
  // Find the matching BUY trade
  const buyTrades = stateManager.getAllTrades()
    .filter(t => t.action === 'BUY')
```
**Fix:** Need to distinguish between:
- `SELL` = closing a long position (find matching BUY)
- `COVER` = closing a short position (find matching SELL_SHORT)

---

## BUG 8: OrderExecutor.js:389 — PnL calculation long-only
**File:** core/OrderExecutor.js, line 389
```javascript
const pnl = ((price - buyTrade.entryPrice) / buyTrade.entryPrice) * 100;
```
**Fix:** For shorts: `((buyTrade.entryPrice - price) / buyTrade.entryPrice) * 100`

---

## BUG 9: OrderExecutor.js:400 — PnL dollars long-only
**File:** core/OrderExecutor.js, line 400
```javascript
pnlDollars: buyTrade.size * (price - buyTrade.entryPrice),
```
**Fix:** For shorts: `buyTrade.size * (buyTrade.entryPrice - price)`

---

## BUG 10: OrderExecutor.js:410 — Direction hardcoded long in trade record
**File:** core/OrderExecutor.js, line 410
```javascript
direction: 'long',
```
**Fix:** Use actual trade direction from the entry

---

## BUG 11: StateManager.js:295 — openPosition hardcodes BUY
**File:** core/StateManager.js, line 295
```javascript
action: 'BUY',
```
**Fix:** Accept direction parameter from caller

---

## BUG 12: StateManager.js:362 — closePosition rejects zero/negative position
**File:** core/StateManager.js, line 362
```javascript
if (this.state.position <= 0) {
  console.error('[StateManager] No position to close!');
  return { success: false, error: 'No position to close' };
}
```
**Problem:** Short positions would have negative position values. This blocks closing shorts.
**Fix:** Check `this.state.position === 0` instead, or track longs/shorts separately

---

## BUG 13: StateManager.js:372 — PnL calculation long-only
**File:** core/StateManager.js, line 372
```javascript
const pnl = closeSize * (price - this.state.entryPrice);
```
**Fix:** For shorts: `closeSize * (this.state.entryPrice - price)`

---

## BUG 14: StateManager.js:373-374 — Price change percent long-only
**File:** core/StateManager.js, lines 373-374
```javascript
? ((price - this.state.entryPrice) / this.state.entryPrice)
```
**Fix:** For shorts: `((this.state.entryPrice - price) / this.state.entryPrice)`

---

## BUG 15: ExitContractManager.js:106 — PnL percent long-only
**File:** core/ExitContractManager.js, line 106
```javascript
const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
```
**This affects ALL exit checks:** SL, TP, trailing stop, max hold.
For a short trade, price going DOWN is profit, but this formula says it's a loss.
**Fix:** Check trade direction: if short, `pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100`

---

## BUG 16: DynamicTrailingStop.js:75 — PnL long-only
**File:** core/exit/DynamicTrailingStop.js, line 75
```javascript
const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
```
**Same issue as Bug 15** — trailing stop will trigger incorrectly on shorts.

---

## BUG 17: StateManager.js:295 — Trade record missing direction field
**File:** core/StateManager.js, line 292-303
The trade object created in openPosition doesn't store the trade's direction (long vs short).
Without this, closePosition and exit checkers can't know which PnL formula to use.
**Fix:** Add `direction: context.direction || 'long'` to the trade object

---

## SUMMARY

| # | File | Line | Issue |
|---|------|------|-------|
| 1 | TradingLoop.js | 473 | No SELL decision branch |
| 2 | TradingLoop.js | 497-498 | Hardcoded BUY/long |
| 3 | TradingLoop.js | 509-510 | Fallback hardcoded BUY/long |
| 4 | TradingLoop.js | 403 | Active trades only finds BUYs |
| 5 | OrderExecutor.js | 210 | Only handles BUY entry |
| 6 | OrderExecutor.js | 325-326 | Dashboard broadcast hardcoded |
| 7 | OrderExecutor.js | 349-384 | SELL assumes closing long |
| 8 | OrderExecutor.js | 389 | PnL calc long-only |
| 9 | OrderExecutor.js | 400 | PnL dollars long-only |
| 10 | OrderExecutor.js | 410 | Direction hardcoded long |
| 11 | StateManager.js | 295 | openPosition hardcodes BUY |
| 12 | StateManager.js | 362 | Rejects negative position |
| 13 | StateManager.js | 372 | PnL calc long-only |
| 14 | StateManager.js | 373-374 | Price change % long-only |
| 15 | ExitContractManager.js | 106 | PnL % long-only (affects ALL exits) |
| 16 | DynamicTrailingStop.js | 75 | PnL long-only |
| 17 | StateManager.js | 295 | No direction stored on trade |

**17 bugs across 5 files.** Every single one must be fixed for shorts to work end-to-end.
The SmartMoneySweep module is fine — 535 longs, 530 shorts generated correctly.
The pipeline eats every short at Bug 1 and would miscalculate PnL at Bugs 8-16 even if they got through.
