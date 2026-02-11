# OGZPrime Multi-Asset Integration Guide

## What You're Getting

**1 new file, 3 surgical patches.**

| File | What It Does |
|------|--------------|
| `MultiAssetManager.js` (270 lines) | Symbol mapping (15 assets), WS resubscription, candle cache per asset |

### How It Works
Dashboard dropdown sends `asset_change` → bot receives it → MultiAssetManager:
1. Caches current BTC candles
2. Unsubscribes Kraken WS from XBT/USD
3. Subscribes to new pair (e.g., ETH/USD)
4. Fetches historical candles from Kraken REST
5. Sends new candle data to dashboard chart
6. All trading logic works with new asset automatically

Switching back restores cached candles instantly.

---

## File Placement

```bash
cp MultiAssetManager.js ~/OGZPMLV2-master/core/
```

---

## Patch 1: run-empire-v2.js — Add require + instantiation

**At the top** (near line ~190, after other requires):
```javascript
const MultiAssetManager = require('./core/MultiAssetManager');
```

**In `startBot()`** (near line ~510, after other module inits):
```javascript
this.assetManager = new MultiAssetManager(this);
```

---

## Patch 2: run-empire-v2.js — Handle `asset_change` from dashboard

**In the dashboard WS message handler** (after the `timeframe_change` block, around line 806):

```javascript
          // MULTI-ASSET: Handle asset switching from dashboard
          if (msg.type === 'asset_change') {
            if (this.assetManager) {
              this.assetManager.switchAsset(msg.asset);
            }
            return;
          }
```

---

## Patch 3: run-empire-v2.js — Fix `fetchAndSendHistoricalCandles` to use active asset

**In `fetchAndSendHistoricalCandles()`** (line ~1362), change:
```javascript
// OLD:
const symbol = process.env.TRADING_PAIR || 'BTC/USD';
```
To:
```javascript
// NEW:
const symbol = this.assetManager
  ? this.assetManager.toSlashFormat(this.assetManager.activeAsset)
  : (process.env.TRADING_PAIR || 'BTC/USD');
```

---

## Patch 4: kraken_adapter_simple.js — Expand symbol converter

**Replace the `convertToKrakenSymbol` method** (around line ~378):

```javascript
  convertToKrakenSymbol(symbol) {
    // Full Kraken symbol mapping for all supported assets
    const map = {
      'BTC-USD':   'XXBTZUSD',  'BTC/USD':   'XXBTZUSD',
      'ETH-USD':   'XETHZUSD',  'ETH/USD':   'XETHZUSD',
      'SOL-USD':   'SOLUSD',    'SOL/USD':   'SOLUSD',
      'XRP-USD':   'XXRPZUSD',  'XRP/USD':   'XXRPZUSD',
      'ADA-USD':   'ADAUSD',    'ADA/USD':   'ADAUSD',
      'DOT-USD':   'DOTUSD',    'DOT/USD':   'DOTUSD',
      'AVAX-USD':  'AVAXUSD',   'AVAX/USD':  'AVAXUSD',
      'LINK-USD':  'LINKUSD',   'LINK/USD':  'LINKUSD',
      'MATIC-USD': 'MATICUSD',  'MATIC/USD': 'MATICUSD',
      'UNI-USD':   'UNIUSD',    'UNI/USD':   'UNIUSD',
      'ATOM-USD':  'ATOMUSD',   'ATOM/USD':  'ATOMUSD',
      'LTC-USD':   'XLTCZUSD',  'LTC/USD':   'XLTCZUSD',
      'DOGE-USD':  'XDGUSD',    'DOGE/USD':  'XDGUSD',
      'SHIB-USD':  'SHIBUSD',   'SHIB/USD':  'SHIBUSD',
      'APT-USD':   'APTUSD',    'APT/USD':   'APTUSD',
    };
    return map[symbol] || symbol.replace('-', '').replace('/', '');
  }
```

---

## What Already Works (No Changes Needed)

- ✅ Dashboard dropdown (15 assets in HTML)
- ✅ Dashboard `changeAsset()` sends `asset_change` message via WS
- ✅ Dashboard clears chart on asset change
- ✅ `fetchAndSendHistoricalCandles()` already fetches from Kraken REST
- ✅ `getHistoricalOHLC()` already accepts arbitrary pairs
- ✅ OHLC message parser already reads pair from `msg[3]`
- ✅ Chart renders whatever candle data it receives

## What These Patches Fix

- ❌→✅ Bot ignoring `asset_change` messages (no handler)
- ❌→✅ WS subscription hardcoded to `['XBT/USD']`
- ❌→✅ Symbol converter only mapping BTC
- ❌→✅ Historical fetch always requesting BTC candles
- ❌→✅ No candle cache when switching between assets

---

## Testing

After integration:
1. Open dashboard
2. Select "Ethereum (ETH)" from asset dropdown
3. Bot console should show:
   ```
   🔄 MultiAsset: Switching BTC-USD → ETH-USD (Ethereum)
      💾 Cached 200 candles for BTC-USD
      📡 Resubscribed: XBT/USD → ETH/USD (ticker + 7 OHLC)
   ✅ MultiAsset: Now trading Ethereum (ETH-USD)
   ```
4. Dashboard chart should load ETH candles
5. Switch back to BTC — cached candles restore instantly

---

## Important Notes

- **Trading continues on whatever asset is active.** If you switch to ETH, the bot trades ETH.
- **Each asset gets its own candle cache.** Switching back and forth doesn't lose history.
- **Position management is per-asset.** Don't switch assets while in a position unless you want to close on the new asset's price action.
- **Min order sizes vary wildly.** BTC min is 0.0001, DOGE min is 10, SHIB min is 100,000. The module tracks these.
