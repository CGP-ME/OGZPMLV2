# OGZPMLV2 FIX SPEC — Organized by Module

**Date:** 2026-05-13
**Author:** Wolf (Claude Opus 4.7)
**Rule:** One change, one commit. Trey picks fix, hands to Claudito, verifies, approves, moves to next.

**Multi-timeframe is out of scope for this doc.** Separate plan later.

---

## How to read this

Each module has a section header. All fixes that touch that file are pasted underneath, verbatim from the source specs. Fix numbers are from the original specs (v3 half-fix audit, Phase 1.5, SessionRouter audit, shorts audit). Numbers don't restart per module — they keep their original IDs so cross-references in older docs still work.

## Source specs

- **v3 half-fix audit:** 25 fixes (Fix 1–25)
- **Phase 1.5 extended audit:** Findings 1.5-X (CandleProcessor, PatternMemoryBank, EnhancedPatternRecognition, AlpacaAdapter, TradeIntelligenceEngine)
- **SessionRouter completion:** 15 gaps (numbered Gap 4.1–4.15 in roadmap)
- **Shorts pipeline parity:** Gaps 3.1–3.6 in roadmap
- **Multi-Symbol Commit 6:** Pulled from existing spec
- **RiskManager re-enable:** Items from master plan Phase 7

## Operating contract

**Trey:** Picks next fix. Hands to Claudito. Verifies. Approves. Moves on.
**Claudito:** Executes one fix at a time. P0 verify after each. Stops on mismatch. Reports diff.
**Mercury:** On-demand second opinion. Trey calls Mercury for catch-swallow fixes and ambiguous spec blocks.
**Wolf:** Maintains this doc. No code execution.

**P0 anchor baseline:** TSLA 15m 2yr backtest, $18,497.278595001146 / 1,384 trades / 60.0% WR. Shifts after fixes that change trade math (Fix 1, 2, 17, 18, 19). Document new anchor in commit message when it shifts.

---


# core/OrderExecutor.js

**Fixes from v3 audit:** 1, 5, 6, 8, 16, 17

---

### Fix 1: value_usd × price double-multiplication (CC finding, verified)

**File:** `core/OrderExecutor.js`
**Lines:** 447 (BUY), 448 (BUY fees), 614 (SHORT), 615 (SHORT fees), 783 (SELL sellValue), 843 (SELL value_usd), 844 (SELL fees), 1249 (COVER value_usd), 1250 (COVER fees)
**Status:** FIXED in 0e4dde9 — 2026-05-13

**Bug:** `adjustedPositionSize` (and `usdAmount`, `shortSize`) are already USD per line 109 comment "Position size stays in USD." But every TradingProofLogger call multiplies by price again: `value_usd: adjustedPositionSize * price`. Result:
- TSLA at $425, $250 position → recorded as `value_usd = $106,250`
- BTC at $80k, $1648 position → recorded as `value_usd = $131,840,000`

This is the source of the $96M-$133M phantom values you saw in proof logs.

**IMPORTANT:** Internal trade state and StateManager P&L computation are CORRECT (StateManager.js:584 uses `closeSize × priceChangePercent` — proper formula). The bug is display-only. The 10.07% daily loss alert you saw is a REAL 10% loss; RiskManager reads from state, not from TradingProofLogger.

**Fix:** Remove the `* price` multiplication everywhere TradingProofLogger expects USD. Also remove from fees computation.

**str_replace target (BUY, lines 446-448):**
```
            size: adjustedPositionSize,
            value_usd: adjustedPositionSize * price,
            fees: (adjustedPositionSize * price) * TradingConfig.get('fees.makerFee', 0.0025),  // From TradingConfig
```

**str_replace replacement (BUY):**
```
            size: adjustedPositionSize,
            // FIX VALUE-USD-DOUBLE-MULT: adjustedPositionSize is already USD (see line 109).
            // Prior code multiplied USD × price, producing nonsense values (e.g. $250 TSLA
            // position recorded as $106,250). Internal P&L was correct because StateManager
            // uses the proper formula at line 584; this was a display-layer bug.
            value_usd: adjustedPositionSize,
            fees: adjustedPositionSize * TradingConfig.get('fees.makerFee', 0.0025),
```

**Apply the same fix at:**
- Lines 614-615 (SHORT entry) — same shape, `adjustedPositionSize * price` → `adjustedPositionSize`
- Lines 843-844 (SELL exit) — `sellValue` is `usdAmount * price` (line 783) — replace `sellValue` with `usdAmount` everywhere it's used as a display value; fix the fees formula similarly
- Lines 1249-1250 (COVER exit) — `shortSize * price` → `shortSize`

**Special note for line 783:**

**str_replace target:**
```
            const usdAmount = positionAmount;
            const sellValue = usdAmount * price;  // USD position × price (for display)
            const entryValue = usdAmount * buyTrade.entryPrice;  // USD position × entry price
            const profitLoss = sellValue - entryValue;
```

**str_replace replacement:**
```
            // FIX VALUE-USD-DOUBLE-MULT: usdAmount IS USD. Prior code multiplied by price
            // producing inflated display values; subtraction (sellValue - entryValue)
            // happened to give the right SIGN but wrong magnitude. Use the proper formula:
            // pnl = usdAmount × ((price - entryPrice) / entryPrice).
            const usdAmount = positionAmount;
            const sellValue = usdAmount;  // already USD — for display
            const profitLoss = buyTrade.entryPrice > 0
              ? usdAmount * ((price - buyTrade.entryPrice) / buyTrade.entryPrice)
              : 0;
```

Then update line 786's console.log to use the new variable names, and line 843's `value_usd: sellValue` works (sellValue == usdAmount now, both USD).

**Verification:**
- `grep -n "VALUE-USD-DOUBLE-MULT" core/OrderExecutor.js` → 4+ hits (BUY, SHORT, SELL, COVER)
- `grep -n "adjustedPositionSize \* price\|shortSize \* price\|sellValue.*usdAmount \* price" core/OrderExecutor.js` → 0 hits
- P0 anchor: **WILL CHANGE.** Backtest P&L was correct internally; the proof-logger output was corrupted. After fix, proof-logger output matches internal state. Document new anchor.

**Operator note:** This is a display-only bug. Bot's internal P&L and risk decisions were always on correct numbers. The dashboard, ledger, and proof page were lying. Fix makes display match reality.

---

### Fix 5: P2-B — silent buyTrades[0] fallback on tradeId mismatch

**File:** `core/OrderExecutor.js`
**Lines:** 673-678
**Status:** FIXED in d54e48d — 2026-05-13

**Bug:** If `decision.tradeId` doesn't match any active trade, silently falls back to `buyTrades[0]` (oldest). Multi-position mode mis-attributes exits.

**str_replace target:**
```
            if (decision.tradeId) {
              buyTrade = buyTrades.find(t => t.orderId === decision.tradeId || t.id === decision.tradeId);
            }
            if (!buyTrade) {
              buyTrade = buyTrades[0];
            }
```

**str_replace replacement:**
```
            if (decision.tradeId) {
              buyTrade = buyTrades.find(t => t.orderId === decision.tradeId || t.id === decision.tradeId);
            }
            if (!buyTrade) {
              // FIX P2-B: surface the fallback. Single-position mode: buyTrades[0] is the only trade, fallback benign.
              // Multi-position mode: silently mis-attributes exit to oldest trade instead of orchestrator-targeted one.
              console.warn(`[OrderExecutor] WARN P2-B: tradeId '${decision.tradeId}' not found in ${buyTrades.length} active trades for ${symbol}. Falling back to oldest (${buyTrades[0]?.orderId || buyTrades[0]?.id}). Exit may attribute to wrong position.`);
              buyTrade = buyTrades[0];
            }
```

**Verification:** `grep -n "WARN P2-B" core/OrderExecutor.js` → 1 hit. P0 unchanged. Apply same pattern to SHORT-side mirror (around line 1100+).

---

## TIER 2 — ARCHITECTURAL (catch-swallow chain)

---

### Fix 6: OrderExecutor outer catch swallows audit throws

**File:** `core/OrderExecutor.js`
**Lines:** 124 (try opens), 1365 (catch closes)
**Status:** FIXED in 4d56a02 — 2026-05-13

**Bug:** Outer try-catch eats every throw inside `executeTrade`:
- HIGH-06 (slippage at 148)
- HIGH-08 BUY (winnerStrategy at 291)
- HIGH-08 SHORT (winnerStrategy at 471)
- MED-02 BUY (entryPrice at 698)
- MED-02 SHORT (entryPrice at 1138)
- MED-03 BUY (entryStrategy at 721)
- MED-03 SHORT (entryStrategy at 1159)

Plus the MaxProfitManager CRIT-02-followup throws called from line 367 (BUY) and 540 (SHORT) — `MaxProfitManager.start` throws on missing volatility (line 326) or missing confidence (line 336). **During indicator warmup (first 14 candles after any restart), volatility is null and every trade attempt silently fails here.**

**Fix:** Differentiate audit throws from infrastructure errors. Audit-prefixed throws re-throw past the wrapper.

**str_replace target:**
```
    } catch (error) {
      console.error(`❌ Trade execution failed at checkpoint between CP3 and CP4`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);
      console.error(`   Decision: ${decision?.action}, Confidence: ${decision?.confidence}`);
      console.error(`   Position size: ${positionSize}`);

      // Phase 4 REWRITE: tradingBrain.errorHandler deleted - error logging above is sufficient
    }
  }
}
```

**str_replace replacement:**
```
    } catch (error) {
      // FIX TIER-2-EXECUTE-CATCH: audit-prefixed throws (CRIT/HIGH/MED/RUN/EXIT/MOD/TRAI/PNLC/RISK/BTR/SESSION/DPS/PS)
      // are intentional halts on bad state. Without this differentiation, the wrapper
      // turns every "fail-loud" spec into fail-silent behavior. Re-throw audit prefixes
      // so they reach run-empire-v2's promise-rejection handler (operator-visible).
      // Also re-throw MaxProfitManager.start errors (no audit prefix but explicit halt).
      const isAuditThrow = error.message && /^\[(?:CRIT|HIGH|MED|RUN|EXIT|MOD|TRAI|PNLC|RISK|BTR|SESSION|DPS|PS)-/.test(error.message);
      const isMpmHalt = error.message && error.message.startsWith('MaxProfitManager.start:');
      if (isAuditThrow || isMpmHalt) {
        console.error(`[FAIL-LOUD] ${error.message}`);
        throw error;
      }

      console.error(`❌ Trade execution failed at checkpoint between CP3 and CP4`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Stack trace:`, error.stack);
      console.error(`   Decision: ${decision?.action}, Confidence: ${decision?.confidence}`);
      console.error(`   Position size: ${positionSize}`);

      // Phase 4 REWRITE: tradingBrain.errorHandler deleted - error logging above is sufficient
    }
  }
}
```

**Verification:** `grep -n "TIER-2-EXECUTE-CATCH" core/OrderExecutor.js` → 1 hit. P0 anchor: depends on whether backtest data triggers any audit throws. Clean backtest data → no change. **Live/paper runs with warmup volatility=null will now visibly halt during warmup** instead of silently dropping the first 14 candles' trade attempts.

---

### Fix 8: CRIT-06 fallback uses phantom confidence=0

**File:** `core/OrderExecutor.js`
**Lines:** 297-302 (BUY), 476-481 (SHORT)
**Status:** HALF-FIXED — absent-orchResult halt works (264/460), but missing-exitContract fallback still uses `confidence: orchResult?.confidence || 0`

**str_replace target (BUY):**
```
          // Use orchestrator's exit contract if provided, otherwise create fallback
          const exitContract = orchResult?.exitContract
            || exitContractManager.createExitContract(
                entryStrategy,
                { confidence: orchResult?.confidence || 0 },
                { volatility: indicators.volatility ?? null }
              );
```

**str_replace replacement (BUY):**
```
          // FIX CRIT-06-FALLBACK: refuse to fabricate confidence=0 exit contract.
          // Post-Fix-7 (TIER-2-ORCH-CATCH) HIGH-15/16 propagate so exitContract should
          // never be missing in practice — this halt catches future regressions.
          let exitContract;
          if (orchResult?.exitContract) {
            exitContract = orchResult.exitContract;
          } else {
            if (!Number.isFinite(orchResult?.confidence) || orchResult.confidence <= 0) {
              throw new Error(`[CRIT-06] BUY entry: orchResult missing exitContract AND has unusable confidence (${orchResult?.confidence}) — refusing to fabricate phantom-confidence contract`);
            }
            exitContract = exitContractManager.createExitContract(
              entryStrategy,
              { confidence: orchResult.confidence },
              { volatility: indicators.volatility ?? null }
            );
          }
```

**Apply same pattern to SHORT path (lines 476-481).**

**Verification:** `grep -n "FIX CRIT-06-FALLBACK\|\\[CRIT-06\\] BUY entry\\|\\[CRIT-06\\] SHORT entry" core/OrderExecutor.js` → 3 hits. P0 unchanged.

---

### Fix 16: Webhook fractional-asset quantity=0 silent send

**File:** `core/OrderExecutor.js`
**Lines:** 394-403 (BUY), 563-573 (SHORT), 806-815 (SELL), 1214-1223 (COVER)
**Status:** FIXED in 0a9ce7f — 2026-05-14

**Bug:** For fractional assets (BTC $80k on $1648 position → 0 shares after Math.floor), the webhook adapter sends `quantity: 0` which SignalStack rejects. Detection-only; emit fires unconditionally.

**str_replace target (BUY):**
```
            if (this.ctx.webhookAdapter) {
              const shares = Math.floor(adjustedPositionSize / price);
              if (shares < 1) {
                console.warn(`[WebhookOrder] DRIFT: BUY entry qty=${shares} (positionSize=${adjustedPositionSize.toFixed(2)} price=${price.toFixed(2)}) — bot opened long internally but no webhook sent. TTP will not see this entry; subsequent SELL will reference a position TTP doesn't hold.`);
              }
              this.ctx.webhookAdapter.emit({
                action: 'buy',
                symbol,
                quantity: shares,
                orderType: 'market',
              }).catch(err => console.warn(`[WebhookOrder] BUY emit failed: ${err.message}`));
            }
```

**str_replace replacement (BUY):**
```
            if (this.ctx.webhookAdapter) {
              const shares = Math.floor(adjustedPositionSize / price);
              if (shares < 1) {
                // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                // internal position and broker is real (operator must know) but emitting
                // quantity=0 just generates ValidationError without changing the outcome.
                console.warn(`[WebhookOrder] DRIFT BLOCKED: BUY entry qty=${shares} (positionSize=$${adjustedPositionSize.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot opened internally; TTP won't see this entry. INVESTIGATE: position size too small for asset price, or wrong asset class for strategy.`);
              } else {
                this.ctx.webhookAdapter.emit({
                  action: 'buy',
                  symbol,
                  quantity: shares,
                  orderType: 'market',
                }).catch(err => console.warn(`[WebhookOrder] BUY emit failed: ${err.message}`));
              }
            }
```

**str_replace target (SHORT, lines 571-582):**
```
            if (this.ctx.webhookAdapter) {
              const shares = Math.floor(adjustedPositionSize / price);
              if (shares < 1) {
                console.warn(`[WebhookOrder] DRIFT: SELL_SHORT entry qty=${shares} (positionSize=${adjustedPositionSize.toFixed(2)} price=${price.toFixed(2)}) — bot opened short internally but no webhook sent. TTP will not see this entry; subsequent COVER will reference a position TTP doesn't hold.`);
              }
              this.ctx.webhookAdapter.emit({
                action: 'sell',
                symbol,
                quantity: shares,
                orderType: 'market',
              }).catch(err => console.warn(`[WebhookOrder] SELL_SHORT emit failed: ${err.message}`));
            }
```

**str_replace replacement (SHORT):**
```
            if (this.ctx.webhookAdapter) {
              const shares = Math.floor(adjustedPositionSize / price);
              if (shares < 1) {
                // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                // internal position and broker is real (operator must know) but emitting
                // quantity=0 just generates ValidationError without changing the outcome.
                console.warn(`[WebhookOrder] DRIFT BLOCKED: SELL_SHORT entry qty=${shares} (positionSize=$${adjustedPositionSize.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot opened internally; TTP won't see this entry. INVESTIGATE: position size too small for asset price, or wrong asset class for strategy.`);
              } else {
                this.ctx.webhookAdapter.emit({
                  action: 'sell',
                  symbol,
                  quantity: shares,
                  orderType: 'market',
                }).catch(err => console.warn(`[WebhookOrder] SELL_SHORT emit failed: ${err.message}`));
              }
            }
```

**str_replace target (SELL exit, lines 833-846):**
```
              if (this.ctx.webhookAdapter) {
                const exitUsd = isPartialClose ? positionAmount * fraction : positionAmount;
                const shares = Math.floor(exitUsd / price);
                if (shares < 1) {
                  console.warn(`[WebhookOrder] DRIFT: SELL ${isPartialClose ? 'partial' : 'full'} exit qty=${shares} (exitUsd=${exitUsd.toFixed(2)} price=${price.toFixed(2)}) — bot reduced position but no webhook sent. TTP long position will diverge until next full-close emit.`);
                }
                this.ctx.webhookAdapter.emit({
                  action: 'sell',
                  symbol,
                  quantity: shares,
                  orderType: 'market',
                  bypassThrottle: true,  // exits MUST go through; vendor-side throttle is TTP's concern
                }).catch(err => console.warn(`[WebhookOrder] SELL emit failed: ${err.message}`));
              }
```

**str_replace replacement (SELL exit):**
```
              if (this.ctx.webhookAdapter) {
                const exitUsd = isPartialClose ? positionAmount * fraction : positionAmount;
                const shares = Math.floor(exitUsd / price);
                if (shares < 1) {
                  // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                  // internal position and broker is real (operator must know) but emitting
                  // quantity=0 just generates ValidationError without changing the outcome.
                  console.warn(`[WebhookOrder] DRIFT BLOCKED: SELL ${isPartialClose ? 'partial' : 'full'} exit qty=${shares} (exitUsd=$${exitUsd.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot reduced position internally; TTP long position will diverge until next viable emit. INVESTIGATE: exit USD too small for asset price, or partial-close fraction too aggressive.`);
                } else {
                  this.ctx.webhookAdapter.emit({
                    action: 'sell',
                    symbol,
                    quantity: shares,
                    orderType: 'market',
                    bypassThrottle: true,  // exits MUST go through; vendor-side throttle is TTP's concern
                  }).catch(err => console.warn(`[WebhookOrder] SELL emit failed: ${err.message}`));
                }
              }
```

**str_replace target (COVER, lines 1251-1263):**
```
            if (this.ctx.webhookAdapter) {
              const shares = Math.floor(shortSize / price);
              if (shares < 1) {
                console.warn(`[WebhookOrder] DRIFT: COVER qty=${shares} (shortSize=${shortSize.toFixed(2)} price=${price.toFixed(2)}) — bot covered internally but no webhook sent. TTP short position will diverge until next full-close emit.`);
              }
              this.ctx.webhookAdapter.emit({
                action: 'buy',
                symbol,
                quantity: shares,
                orderType: 'market',
                bypassThrottle: true,  // exits MUST go through; vendor-side throttle is TTP's concern
              }).catch(err => console.warn(`[WebhookOrder] COVER emit failed: ${err.message}`));
            }
```

**str_replace replacement (COVER):**
```
            if (this.ctx.webhookAdapter) {
              const shares = Math.floor(shortSize / price);
              if (shares < 1) {
                // FIX WEBHOOK-FRACTIONAL: skip emit on known-bad signal. Drift between
                // internal position and broker is real (operator must know) but emitting
                // quantity=0 just generates ValidationError without changing the outcome.
                console.warn(`[WebhookOrder] DRIFT BLOCKED: COVER qty=${shares} (shortSize=$${shortSize.toFixed(2)} / price=$${price.toFixed(2)}) — webhook not sent. Bot covered internally; TTP short position will diverge until next viable emit. INVESTIGATE: short USD too small for asset price.`);
              } else {
                this.ctx.webhookAdapter.emit({
                  action: 'buy',
                  symbol,
                  quantity: shares,
                  orderType: 'market',
                  bypassThrottle: true,  // exits MUST go through; vendor-side throttle is TTP's concern
                }).catch(err => console.warn(`[WebhookOrder] COVER emit failed: ${err.message}`));
              }
            }
```

**Verification:** `grep -c "FIX WEBHOOK-FRACTIONAL\|DRIFT BLOCKED" core/OrderExecutor.js` → 4+ hits. P0 unchanged (backtest skips webhook).

**Operator note for eval:** For TSLA at $425 on $5K @ 5% sizing = $250 = 0 shares. Eval position sizing must yield ≥ 1 TSLA share at TSLA's price, OR add fractional-share support if TTP accepts. Verify TTP's order policy. If TPT requires integer shares, sizing for TSLA needs to be ~$425+ per trade minimum.

---

### Fix 17: Wire the absolute position cap (currently dead config)

**File:** `core/OrderExecutor.js`
**Line:** ~102 (after MAX_POSITION_SIZE cap)
**Status:** FIXED in e23ebe7 — 2026-05-14

**str_replace target:**
```
    if (basePositionPercent > maxPositionPercent) {
      console.log(`⚠️ Position capped: ${(basePositionPercent * 100).toFixed(2)}% → ${(maxPositionPercent * 100).toFixed(2)}% (MAX_POSITION_SIZE limit)`);
      basePositionPercent = maxPositionPercent;
    }
```

**str_replace replacement:**
```
    if (basePositionPercent > maxPositionPercent) {
      console.log(`⚠️ Position capped: ${(basePositionPercent * 100).toFixed(2)}% → ${(maxPositionPercent * 100).toFixed(2)}% (MAX_POSITION_SIZE limit)`);
      basePositionPercent = maxPositionPercent;
    }
    // FIX TIER-4-ABSOLUTE-CAP: enforce absoluteCapPercent. Cap existed in
    // TradingConfig.js:497 but had no consumer — peak single-trade was
    // theoretically 31.25% (5% × 2.5 conf × 2.5 confluence) with no actual ceiling.
    const absoluteCap = TradingConfig.get('positionSizing.absoluteCapPercent');
    if (Number.isFinite(absoluteCap) && absoluteCap > 0 && basePositionPercent > absoluteCap) {
      console.log(`⚠️ Position absolute-capped: ${(basePositionPercent * 100).toFixed(2)}% → ${(absoluteCap * 100).toFixed(2)}% (ABSOLUTE_POSITION_CAP)`);
      basePositionPercent = absoluteCap;
    }
```

**Verification:** `grep -n "FIX TIER-4-ABSOLUTE-CAP" core/OrderExecutor.js` → 1 hit. P0 anchor: **WILL CHANGE.** Default cap is 0.15 (15%); backtest peak sizing was 0.3125 (31.25%). Document new anchor.

---

## TIER 5 — RULE VIOLATIONS (centralize config)

---


# core/StateManager.js

**Fixes from v3 audit:** 2, 3, 4

---

### Fix 2: P1-A — `trade.size` stale after partial close

**File:** `core/StateManager.js`
**Line:** 742
**Status:** FIXED in 498a16e — 2026-05-13

**Bug:** `reducePosition()` updates `trade.sizeUsd = remainingSize` but leaves `trade.size` at the original full amount. Every consumer reading `trade.size` after a partial close gets pre-reduction value:
- `OrderExecutor.js:700` — P&L against full original size
- `OrderExecutor.js:716` — `size: buyTrade.size || 1` recorded with stale value
- `OrderExecutor.js:741, 961, 966, 1006, 1140` — same pattern

**str_replace target:**
```
      trade.sizeUsd = remainingSize;
```

**str_replace replacement:**
```
      trade.sizeUsd = remainingSize;
      trade.size = remainingSize;  // FIX P1-A: keep both fields in sync — OrderExecutor reads trade.size for P&L computation, fees, console logs
```

**Verification:** `grep -n "FIX P1-A" core/StateManager.js` → 1 hit. P0 anchor will shift (partial-close logic was already wrong; the new anchor IS correct).

---

### Fix 3: S10-BUG-1 — `closedTradeRecord` missing symbol

**File:** `core/StateManager.js`
**Lines:** 645-655
**Status:** FIXED in 8b379ae — 2026-05-13

**Bug:** Closed-trade records have no `symbol` field. Per-ticker analytics impossible.

**str_replace target:**
```
    const closedTradeRecord = {
      tradeId,
      pnl,
      pnlPercent,
      direction: tradeDirection,
      entryPrice: tradeEntryPrice,
      exitPrice: price,
      strategy: trade.entryStrategy || trade.strategy || 'unknown',
      holdMs: Date.now() - (trade.entryTime || trade.timestamp || 0),
      closedAt: Date.now()
    };
```

**str_replace replacement:**
```
    const closedTradeRecord = {
      tradeId,
      symbol: trade.symbol || null,  // FIX S10-BUG-1: carry symbol for per-ticker analytics
      pnl,
      pnlPercent,
      direction: tradeDirection,
      entryPrice: tradeEntryPrice,
      exitPrice: price,
      strategy: trade.entryStrategy || trade.strategy || 'unknown',
      holdMs: Date.now() - (trade.entryTime || trade.timestamp || 0),
      closedAt: Date.now()
    };
```

**Verification:** `grep -n "FIX S10-BUG-1" core/StateManager.js` → 1 hit. P0 anchor unchanged (additive field).

---

### Fix 4: P2-E — null-symbol zombie trades

**File:** `core/StateManager.js`
**Line:** ~408
**Status:** FIXED in e29d2d5 — 2026-05-13

**Bug:** If both `context.symbol` and `context.ledgerData.symbol` are missing, trade opens with `symbol: null`. `getTradesBySymbol(symbol)` filters on symbol value, so null-symbol trade never matches any query. Exit path can't find it. Permanent zombie position.

**str_replace target:**
```
    const tradeSymbol = tradeSymbolRaw
      ? String(tradeSymbolRaw).toUpperCase().replace('XBT', 'BTC').replace('/', '-')
      : null;
    const trade = {
```

**str_replace replacement:**
```
    const tradeSymbol = tradeSymbolRaw
      ? String(tradeSymbolRaw).toUpperCase().replace('XBT', 'BTC').replace('/', '-')
      : null;

    // FIX P2-E: refuse to open trades with null symbol — they become invisible
    // to getTradesBySymbol() and the exit path can never find them.
    if (!tradeSymbol) {
      console.error(`[StateManager] openPosition BLOCKED — no symbol resolved from context. context.symbol=${context.symbol}, ledgerData.symbol=${context.ledgerData?.symbol}`);
      return { success: false, error: 'No symbol resolved — refusing to open invisible trade' };
    }

    const trade = {
```

**Verification:** `grep -n "FIX P2-E" core/StateManager.js` → 1 hit. P0 unchanged.

---


# core/StrategyOrchestrator.js

**Fixes from v3 audit:** 7, 9, 23

---

### Fix 7: StrategyOrchestrator exit-contract catch swallows HIGH-15/16

**File:** `core/StrategyOrchestrator.js`
**Line:** 1066-1068
**Status:** BROKEN — catch logs warning, leaves exitContract undefined, routes back through CRIT-06 phantom-confidence fallback

**str_replace target:**
```
    } catch (err) {
      console.warn(`⚠️ [StrategyOrchestrator] Failed to create exit contract: ${err.message}`);
    }
```

**str_replace replacement:**
```
    } catch (err) {
      // FIX TIER-2-ORCH-CATCH: re-throw audit prefixes. HIGH-15/16 throws indicate
      // unresolvable volPct or missing timeframe — proceeding would route execution
      // through OrderExecutor's exit-contract fallback (phantom confidence=0).
      // Surfacing the throw forces operator intervention instead of silent mis-pricing.
      const isAuditThrow = err.message && /^\[(?:CRIT|HIGH|MED|RUN|EXIT|MOD|TRAI|PNLC|RISK|BTR|SESSION|DPS|PS)-/.test(err.message);
      if (isAuditThrow) {
        console.error(`[FAIL-LOUD] ${err.message}`);
        throw err;
      }
      console.warn(`⚠️ [StrategyOrchestrator] Failed to create exit contract: ${err.message}`);
    }
```

**Verification:** `grep -n "TIER-2-ORCH-CATCH" core/StrategyOrchestrator.js` → 1 hit. P0 anchor unchanged.

---

### Fix 9: CRIT-10 ATR consumer collapses missing/zero

**File:** `core/StrategyOrchestrator.js`
**Line:** 806
**Status:** HALF-FIXED — `??` at 802 preserves missing-vs-zero, but consumer at 806 uses `filterATR &&` which collapses genuine zero back into "missing" bucket

**str_replace target:**
```
    const filterATR = indicators?.atr ?? null;
    if (filterATR === null) {
      console.warn('[FILTER:atr] ATR unavailable — filter cannot evaluate (likely warmup or upstream gap). Skipping ATR gate.');
    }
    const filterATRpct = (filterATR && filterPrice > 0) ? (filterATR / filterPrice) * 100 : 0;
```

**str_replace replacement:**
```
    const filterATR = indicators?.atr ?? null;
    if (filterATR === null) {
      console.warn('[FILTER:atr] ATR missing — filter skipped (warmup or upstream gap)');
    } else if (filterATR === 0) {
      // FIX CRIT-10-CONSUMER: distinguish genuine zero (flat market) from missing.
      // Both skip the filter, but zero-ATR is a real signal — strategies firing
      // into a flatlined market is a configuration problem, not a warmup edge.
      console.warn('[FILTER:atr] ATR is zero — flat market detected. Strategies will fire unfiltered.');
    }
    const filterATRpct = (Number.isFinite(filterATR) && filterATR > 0 && filterPrice > 0)
      ? (filterATR / filterPrice) * 100
      : 0;
```

**Verification:** `grep -n "FIX CRIT-10-CONSUMER" core/StrategyOrchestrator.js` → 1 hit. P0 unchanged.

---

## TIER 3 — MIRROR SITES

---

### Fix 23: StrategyOrchestrator:894 currentPrice fallback (CRIT-09 mirror)

**File:** `core/StrategyOrchestrator.js`
**Line:** 894
**Status:** FIXED in c64daa1 — 2026-05-14

**Bug:** `const currentPrice = extras.price || (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : 0);`

Genuine zero price collapses to 0. Downstream VP zone math at line 905 (`Math.abs(currentPrice - vpProfile.poc) / vpProfile.poc`) produces nonsense distance, nonsense zone classification, nonsense boost multipliers applied to strategy confidence.

**Fix:**

**str_replace target:**
```
    const currentPrice = extras.price || (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : 0);
```

**str_replace replacement:**
```
    // FIX MIRROR-CRIT-09-VP: mirror of CRIT-09 hardening at line 790. Prior code used
    // `||` which collapsed genuine zero price; VP zone math downstream produced
    // nonsense distance and zone classification when price was 0.
    const currentPrice = extras.price ?? (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.c : null);
    if (currentPrice != null && (!Number.isFinite(currentPrice) || currentPrice <= 0)) {
      console.warn('[FILTER:vp] currentPrice non-positive — VP zone boosting will be skipped');
    }
```

Then update the consumer at line 896:

**str_replace target:**
```
    if (volumeProfile && currentPrice && Object.keys(volumeProfileBoosts).length > 0 && results.length > 0) {
```

**str_replace replacement:**
```
    if (volumeProfile && Number.isFinite(currentPrice) && currentPrice > 0 && Object.keys(volumeProfileBoosts).length > 0 && results.length > 0) {
```

**Verification:** `grep -n "FIX MIRROR-CRIT-09-VP" core/StrategyOrchestrator.js` → 1 hit. P0 unchanged.

---


# core/TRAIDecisionModule.js

**Fixes from v3 audit:** 11, 18, 19

---

### Fix 11: BTC-USD fallback in TRAIDecisionModule signal recording

**File:** `core/TRAIDecisionModule.js`
**Line:** 897
**Status:** FIXED in f450d30 — 2026-05-13

**str_replace target:**
```
        symbol: signal?.symbol || 'BTC-USD',
```

**str_replace replacement:**
```
        // FIX MIRROR-TRAI-SYMBOL: refuse phantom BTC-USD when signal.symbol missing.
        // Same poisoning class as CRIT-04/05; original spec audited OrderExecutor's
        // TradingProofLogger calls but missed this site.
        symbol: (() => {
          if (!signal?.symbol) {
            console.warn('[TRAI] signal.symbol missing — record will be skipped');
            return null;
          }
          return signal.symbol;
        })(),
```

After this change, downstream code that consumes `record.symbol` will see `null` instead of phantom 'BTC-USD'. CC: view surrounding context (lines 890-910) and add an early-return after the `symbol:` assignment if `null` would cause downstream issues — `if (!record.symbol) return;` or equivalent for the function's contract.

**Verification:** `grep -n "FIX MIRROR-TRAI-SYMBOL" core/TRAIDecisionModule.js` → 1 hit. P0 unchanged.

---

### Fix 18: TRAIDecisionModule:387-397 fabricated feature vector (mirror of TRAI-HIGH-01)

**File:** `core/TRAIDecisionModule.js`
**Lines:** 387-397
**Status:** UNFIXED MIRROR of TRAI-HIGH-01 — original spec fixed `core/trai_core.js:_extractFeatures` but never audited TRAIDecisionModule's identical fabrication. Both modules write to the same UnifiedPatternMemory store.

**str_replace target:**
```
      // Extract features from context.indicators
      const ind = context.indicators || {};
      const features = [
        (ind.rsi || 50) / 100,  // RSI normalized to 0-1
        (ind.macd || 0) - (ind.macdSignal || ind.signal || 0),  // MACD delta
        context.trend === 'uptrend' ? 1 : context.trend === 'downtrend' ? -1 : 0,  // Trend encoded
        ind.bbWidth || 0.02,  // Bollinger width
        context.volatility || 0.01,  // Volatility
        0.5,  // Wick ratio (default - not available in indicators)
        0,    // Price change (default)
        0,    // Volume change (default)
        0     // Last direction (default)
      ];
```

**str_replace replacement:**
```
      // FIX TRAI-DM-FABRICATION: mirror of TRAI-HIGH-01 fix in trai_core.js.
      // Original audit only patched trai_core; TRAIDecisionModule retained identical
      // fabrication. Phantom RSI=50%, bbWidth=2%, volatility=1% collapsed pattern
      // bucket diversity in those dimensions for every signal hitting this path.
      const ind = context.indicators || {};
      const rsi = ind.rsi;
      const macd = ind.macd;
      const macdSig = ind.macdSignal != null ? ind.macdSignal : ind.signal;
      const bbWidth = ind.bbWidth;
      const volatility = context.volatility;
      if (!Number.isFinite(rsi) || !Number.isFinite(macd) || !Number.isFinite(macdSig) ||
          !Number.isFinite(bbWidth) || !Number.isFinite(volatility) || context.trend == null) {
        console.warn('[TRAI-DM] feature extraction skipped — missing/non-finite indicator inputs');
        return null;
      }
      const features = [
        rsi / 100,
        macd - macdSig,
        context.trend === 'uptrend' ? 1 : context.trend === 'downtrend' ? -1 : 0,
        bbWidth,
        volatility,
        0.5,  // wick ratio placeholder — not yet wired
        0,    // price change placeholder
        0,    // volume change placeholder
        0     // last direction placeholder
      ];
```

**Verification:** `grep -n "FIX TRAI-DM-FABRICATION" core/TRAIDecisionModule.js` → 1 hit. P0 anchor may shift — TRAI was producing learned patterns from fabricated features. Document new anchor.

---

### Fix 19: TRAIDecisionModule:624 phantom 1% positionSize

**File:** `core/TRAIDecisionModule.js`
**Line:** 624

**str_replace target:**
```
    // Calculate max loss based on position size and stop loss
    const positionSize = context.positionSize || 0.01;
    const stopLoss = signal.stopLossPercent || this.config.emergencyStopLoss;
```

**str_replace replacement:**
```
    // FIX TRAI-DM-POSITION: refuse phantom 1% positionSize default. Risk
    // assessment computes maxLoss = positionSize × stopLoss; phantom 1% silently
    // passed trades whose actual size could be 5-15%.
    if (!Number.isFinite(context.positionSize) || context.positionSize <= 0) {
      console.warn(`[TRAI-DM] risk assessment skipped — invalid positionSize (${context.positionSize})`);
      return { approved: true, riskScore: 0, factors: ['skipped_due_to_missing_position_size'], maxLoss: null };
    }
    const positionSize = context.positionSize;
    const stopLoss = signal.stopLossPercent || this.config.emergencyStopLoss;
```

**Verification:** `grep -n "FIX TRAI-DM-POSITION" core/TRAIDecisionModule.js` → 1 hit. P0 may shift if backtest exercised TRAI risk assessment.

---


# core/trai_core.js

**Fixes from v3 audit:** 12

---

### Fix 12: BTC fallback in trai_core asset label

**File:** `core/trai_core.js`
**Line:** 509
**Status:** FIXED in eeee2e7 — 2026-05-13

**str_replace target:**
```
      const assetLabel = context.assetName || context.asset || 'BTC';
```

**str_replace replacement:**
```
      // FIX MIRROR-TRAI-ASSET-LABEL: refuse phantom 'BTC' label when both
      // assetName and asset missing. Mirror of CRIT-05.
      const assetLabel = context.assetName || context.asset;
      if (!assetLabel) {
        console.warn('[TRAI] no asset label in context — skipping pattern operation');
        return;
      }
```

**CC note:** View trai_core.js:500-520 to confirm the early-return type matches function contract. Return `null`, `false`, or `undefined` as appropriate.

**Verification:** `grep -n "FIX MIRROR-TRAI-ASSET-LABEL" core/trai_core.js` → 1 hit. P0 unchanged.

---


# core/indicators/IndicatorEngine.js

**Fixes from v3 audit:** 10

---

### Fix 10: BTC-USD fallback in IndicatorEngine constructor

**File:** `core/indicators/IndicatorEngine.js`
**Line:** 38
**Status:** FIXED in 3442d24 — 2026-05-13

**str_replace target:**
```
      symbol: config.symbol || 'BTC-USD',
```

**str_replace replacement:**
```
      // FIX MIRROR-INDICATOR-SYMBOL: constructor must throw on missing symbol.
      // RUN-HIGH-01 hardened run-empire-v2.js caller; future callers that instantiate
      // IndicatorEngine without threading symbol need to fail loud, not silently
      // default to BTC-USD.
      symbol: (() => {
        if (typeof config.symbol !== 'string' || !config.symbol) {
          throw new Error(`[MIRROR-INDICATOR-SYMBOL] IndicatorEngine constructor requires explicit symbol (got ${JSON.stringify(config.symbol)}) — refusing BTC-USD default`);
        }
        return config.symbol;
      })(),
```

**Verification:** `grep -n "FIX MIRROR-INDICATOR-SYMBOL" core/indicators/IndicatorEngine.js` → 1 hit. P0 unchanged.

---


# core/TradeJournal.js

**Fixes from v3 audit:** 13

---

### Fix 13: $10K fallback in TradeJournal constructor

**File:** `core/TradeJournal.js`
**Line:** 62
**Status:** FIXED in 6aa2d64 — 2026-05-14

**str_replace target:**
```
      startingBalance: config.startingBalance || 10000,
```

**str_replace replacement:**
```
      // FIX MIRROR-JOURNAL-BALANCE: refuse phantom $10K default. CRIT-08 hardened
      // StateManager.getEquity; TradeJournal mirror was not audited.
      startingBalance: (() => {
        if (!Number.isFinite(config.startingBalance) || config.startingBalance <= 0) {
          throw new Error(`[MIRROR-JOURNAL-BALANCE] TradeJournal requires positive finite startingBalance (got ${config.startingBalance}) — refusing $10K phantom`);
        }
        return config.startingBalance;
      })(),
```

**Verification:** `grep -n "FIX MIRROR-JOURNAL-BALANCE" core/TradeJournal.js` → 1 hit. P0 unchanged.

---


# core/MaxProfitManager.js

**Fixes from v3 audit:** 22

---

### Fix 22: MaxProfitManager tier-target `||`-collapse

**File:** `core/MaxProfitManager.js`
**Lines:** 111, 113, 115, 117
**Status:** FIXED in 94db97f — 2026-05-14

**str_replace target:**
```
      firstTierTarget: TradingConfig.get('exits.profitTiers.tier1') || 0.007,
      firstTierExit: TradingConfig.get('exitLogic.tieredExit.tier1ExitFraction', 0.30),
      secondTierTarget: TradingConfig.get('exits.profitTiers.tier2') || 0.010,
      secondTierExit: TradingConfig.get('exitLogic.tieredExit.tier2ExitFraction', 0.30),
      thirdTierTarget: TradingConfig.get('exits.profitTiers.tier3') || 0.015,
      thirdTierExit: TradingConfig.get('exitLogic.tieredExit.tier3ExitFraction', 0.20),
      finalTarget: TradingConfig.get('exits.profitTiers.final') || 0.025,
```

**str_replace replacement:**
```
      // FIX TIER-5-MPM-TIER-COLLAPSE: prior code mixed two patterns in same block.
      // Target fields used `|| 0.007` (silent zero collapse). Exit fraction fields
      // used `.get(key, default)` (correct). Unified.
      firstTierTarget: TradingConfig.get('exits.profitTiers.tier1', 0.007),
      firstTierExit: TradingConfig.get('exitLogic.tieredExit.tier1ExitFraction', 0.30),
      secondTierTarget: TradingConfig.get('exits.profitTiers.tier2', 0.010),
      secondTierExit: TradingConfig.get('exitLogic.tieredExit.tier2ExitFraction', 0.30),
      thirdTierTarget: TradingConfig.get('exits.profitTiers.tier3', 0.015),
      thirdTierExit: TradingConfig.get('exitLogic.tieredExit.tier3ExitFraction', 0.20),
      finalTarget: TradingConfig.get('exits.profitTiers.final', 0.025),
```

**Verification:** `grep -n "FIX TIER-5-MPM-TIER-COLLAPSE" core/MaxProfitManager.js` → 1 hit. P0 unchanged.

---


# core/SessionRouter.js

**Fixes from v3 audit:** 14

---

### Fix 14: SessionRouter `_activateCrypto` BTC-USD fallback

**File:** `core/SessionRouter.js`
**Line:** 253
**Status:** FIXED in 9935663 — 2026-05-13

**str_replace target:**
```
    const primaryCrypto = this.cryptoSymbols[0] || 'BTC-USD';
```

**str_replace replacement:**
```
    // FIX MIRROR-SESSION-CRYPTO: refuse silent BTC-USD default. Same class as
    // SESSION-HIGH-01 which hardened _setActiveSession but left this mirror.
    if (!Array.isArray(this.cryptoSymbols) || this.cryptoSymbols.length === 0) {
      throw new Error('[MIRROR-SESSION-CRYPTO] SessionRouter._activateCrypto: cryptoSymbols empty/non-array — refusing BTC-USD default');
    }
    const primaryCrypto = this.cryptoSymbols[0];
```

**Verification:** `grep -n "FIX MIRROR-SESSION-CRYPTO" core/SessionRouter.js` → 1 hit. SessionRouter disabled so P0 unchanged.

---

## TIER 4 — FOOTGUNS

---


# core/BacktestRecorder.js

**Fixes from v3 audit:** 24

---

### Fix 24: BacktestRecorder:177 direct env read + 'unknown' sentinel

**File:** `core/BacktestRecorder.js`
**Line:** 177
**Status:** FIXED in 203f087 — 2026-05-14

**Bug:** `record.symbol = trade.symbol || process.env.TRADING_PAIR || 'unknown';` — three problems in one line:
1. Direct env read in core (violates TradingConfig.js:9 rule)
2. `'unknown'` sentinel papers over missing-data failure
3. If `trade.symbol` is null AND env is set, env wins — masks upstream Fix 4 (P2-E) failure

**Sequencing:** Fix 4 (P2-E) must land first. Post-P2-E, trade.symbol is guaranteed non-null at openPosition. Missing here = upstream regression, throw to surface it.

**str_replace target:**
```
        // Symbol (stamped explicitly so harvester doesn't need env-context)
        record.symbol = trade.symbol || process.env.TRADING_PAIR || 'unknown';
```

**str_replace replacement:**
```
        // FIX TIER-5-BTR-SYMBOL: refuse silent env fallback and 'unknown' sentinel.
        // Post-Fix 4 (P2-E), trade.symbol is guaranteed non-null at openPosition.
        // Missing here is an upstream regression — halt instead of hiding.
        if (typeof trade.symbol !== 'string' || !trade.symbol) {
          throw new Error(`[TIER-5-BTR-SYMBOL] BacktestRecorder.recordTrade: trade.symbol missing (got ${JSON.stringify(trade.symbol)}) — upstream P2-E violation`);
        }
        record.symbol = trade.symbol;
```

**Verification:** `grep -n "FIX TIER-5-BTR-SYMBOL" core/BacktestRecorder.js` → 1 hit. P0 anchor: post-Fix-4, throw never fires in healthy backtest. **Sequence: Fix 4 (P2-E) before Fix 24.**

---


# foundation/ConfigLoader.js

**Fixes from v3 audit:** 15

---

### Fix 15: ConfigLoader broker-default disagreement

**File:** `foundation/ConfigLoader.js`
**Lines:** 176, 184, 192
**Status:** FIXED in ae5cb67 — 2026-05-14

**str_replace target:**
```
    broker: {
      // RUN-INFO-01: BROKER routed through ConfigLoader instead of raw process.env reads.
      id: (() => {
        const r = envStr('BROKER', 'alpaca');
        return track('broker.id', { value: String(r.value).toLowerCase(), source: r.source });
      })(),
      apiKey: track('broker.apiKey', envStr('KRAKEN_API_KEY', '')),
      apiSecret: track('broker.apiSecret', envStr('KRAKEN_API_SECRET', '')),
      // Default asset derived from BROKER: kraken -> BTC-USD, else -> TSLA.
      // Prevents crypto default on stock brokers. Explicit TRADING_PAIR wins.
      tradingPair: track('broker.tradingPair', envStr('TRADING_PAIR',
        (process.env.BROKER || 'kraken').toLowerCase() === 'kraken' ? 'BTC-USD' : 'TSLA')),
      candleTimeframe: track('broker.candleTimeframe', envStr('CANDLE_TIMEFRAME', '15m')),
      tradingInterval: track('broker.tradingInterval', envInt('TRADING_INTERVAL', 15000)),
      // SESSION-HIGH-02: explicit asset-class field — derived from BROKER if
      // ASSET_CLASS env unset. Replaces the slash-based detection heuristic
      // in UnifiedPatternMemory which mis-classified BTC-USD (with dash) as
      // 'stocks'. Slash characters are not a reliable discriminator.
      assetClass: track('broker.assetClass', envStr('ASSET_CLASS',
        (process.env.BROKER || 'kraken').toLowerCase() === 'kraken' ? 'crypto' : 'stocks')),
    },
```

**str_replace replacement:**
```
    broker: (() => {
      // FIX TIER-4-BROKER-COHERENCE: single resolved brokerId for all defaults.
      // Prior code: id defaulted to 'alpaca'; tradingPair/assetClass branches
      // independently defaulted their logic key to 'kraken'. When BROKER env
      // was unset, you got id=alpaca + tradingPair=BTC-USD + assetClass=crypto.
      // Alpaca routing pointed at crypto it can't trade.
      const _brokerIdResult = envStr('BROKER', 'alpaca');
      const _brokerId = String(_brokerIdResult.value).toLowerCase();
      const _isKraken = _brokerId === 'kraken';
      return {
        id: track('broker.id', { value: _brokerId, source: _brokerIdResult.source }),
        apiKey: track('broker.apiKey', envStr('KRAKEN_API_KEY', '')),
        apiSecret: track('broker.apiSecret', envStr('KRAKEN_API_SECRET', '')),
        tradingPair: track('broker.tradingPair', envStr('TRADING_PAIR', _isKraken ? 'BTC-USD' : 'TSLA')),
        candleTimeframe: track('broker.candleTimeframe', envStr('CANDLE_TIMEFRAME', '15m')),
        tradingInterval: track('broker.tradingInterval', envInt('TRADING_INTERVAL', 15000)),
        assetClass: track('broker.assetClass', envStr('ASSET_CLASS', _isKraken ? 'crypto' : 'stocks')),
      };
    })(),
```

**Verification:** `grep -n "FIX TIER-4-BROKER-COHERENCE" foundation/ConfigLoader.js` → 1 hit. P0 unchanged (P0 sets BROKER=alpaca + TRADING_PAIR=TSLA explicitly).

---


# run-empire-v2.js

**Fixes from v3 audit:** 21

---

### Fix 21: Mode-detection consistency guard (light fix; full refactor deferred)

**File:** `run-empire-v2.js`
**Location:** near top of bot startup, after ConfigLoader resolves
**Status:** ARCHITECTURAL FOOTGUN — 6 modules independently read raw env to detect mode. This guard surfaces conflicts; full consolidation deferred to its own spec.

**Add at startup:**
```javascript
// FIX TIER-5-MODE-CONSISTENCY: assert env mode flags are not contradictory.
// Mode detection currently scattered across tradeLogger, UPM, TRAI-DM, FeatureFlagManager,
// PatternMemoryBank, SingletonLock — six independent readers of raw env. Conflicting
// flags cause modules to disagree silently. This guard catches operator drift before
// any module instantiates with mis-resolved mode.
(() => {
  const modeFlags = {
    BACKTEST_MODE: process.env.BACKTEST_MODE === 'true',
    PAPER_TRADING: process.env.PAPER_TRADING === 'true',
    LIVE_TRADING: process.env.LIVE_TRADING === 'true',
    ENABLE_LIVE_TRADING: process.env.ENABLE_LIVE_TRADING === 'true',
    TEST_MODE: process.env.TEST_MODE === 'true',
    TRADING_MODE: process.env.TRADING_MODE,
  };
  const activeBools = ['BACKTEST_MODE', 'PAPER_TRADING', 'LIVE_TRADING', 'ENABLE_LIVE_TRADING', 'TEST_MODE']
    .filter(k => modeFlags[k]);
  if (activeBools.length > 1) {
    throw new Error(`[TIER-5-MODE-CONSISTENCY] multiple mode boolean flags active simultaneously: ${activeBools.join(', ')} — set ONLY ONE`);
  }
  if (modeFlags.TRADING_MODE && activeBools.length > 0) {
    console.warn(`[TIER-5-MODE-CONSISTENCY] TRADING_MODE=${modeFlags.TRADING_MODE} co-exists with boolean flag ${activeBools[0]} — modules may disagree on resolved mode`);
  }
})();
```

**Verification:** Set BACKTEST_MODE=true AND LIVE_TRADING=true in test env; bot must refuse to start. P0 unchanged in healthy env.

**Future spec:** `CC-SPEC-MODE-CONSOLIDATION` — resolve mode once in ConfigLoader, all consumers read from there.

---


# MULTI-FILE

**Fixes from v3 audit:** 20

---

### Fix 20: Centralize env reads — DTS, UPM, DLL (multi-step)

**Files:** `core/TradingConfig.js`, `core/exit/DynamicTrailingStop.js`, `core/UnifiedPatternMemory.js`, `core/DecisionLedgerLogger.js`
**Status:** RULE VIOLATIONS — 12 direct `parseFloat/parseInt(process.env...)` reads outside TradingConfig. All three modules are live and running.

The project rule at `core/TradingConfig.js:9` says: "If you find parseFloat(process.env.TRADING_PARAM) anywhere else, it's a bug." 12 violations exist in live code:

- `core/exit/DynamicTrailingStop.js:38, 42, 45, 48` — TRAIL_ATR_MULTIPLIER, TRAIL_MIN_ACTIVATION, TRAIL_TREND_WIDEN, TRAIL_STRUCTURE_TIGHTEN
- `core/UnifiedPatternMemory.js:135-141` — PATTERN_MIN_SAMPLES, PATTERN_SUCCESS_THRESHOLD, PATTERN_FAILURE_THRESHOLD, PATTERN_MAX_AGE_DAYS, PATTERN_DECAY_HALFLIFE, PATTERN_MAX_STORED, PATTERN_DTW_THRESHOLD
- `core/DecisionLedgerLogger.js:9` — LEDGER_BUFFER_SIZE

**Step 1 (commit 20a) — register keys in TradingConfig.js**

After viewing TradingConfig.js's existing config blocks, add these sections:

```javascript
// Trail config
trail: {
  atrMultiplier: env('TRAIL_ATR_MULTIPLIER', 2.0),
  minActivation: env('TRAIL_MIN_ACTIVATION', 1.5),
  trendWidenMultiplier: env('TRAIL_TREND_WIDEN', 1.5),
  structureTightenMultiplier: env('TRAIL_STRUCTURE_TIGHTEN', 0.5),
},

// Pattern memory config
patternMemory: {
  minSamples: env('PATTERN_MIN_SAMPLES', 10),
  successThreshold: env('PATTERN_SUCCESS_THRESHOLD', 0.65),
  failureThreshold: env('PATTERN_FAILURE_THRESHOLD', 0.35),
  maxAgeDays: env('PATTERN_MAX_AGE_DAYS', 90),
  decayHalflifeDays: env('PATTERN_DECAY_HALFLIFE', 30),
  maxPatterns: env('PATTERN_MAX_STORED', 10000),
  dtwThreshold: env('PATTERN_DTW_THRESHOLD', 0.62),
},

// Ledger config
ledger: {
  bufferSize: env('LEDGER_BUFFER_SIZE', 1),
},
```

After Step 1: P0 verify to confirm no behavior change (keys added but consumers unchanged).

**Step 2 (commit 20b) — switch DynamicTrailingStop consumers**

**str_replace target:**
```
      atrMultiplier: parseFloat(process.env.TRAIL_ATR_MULTIPLIER) || config.atrMultiplier || 2.0,

      // Minimum profit before trailing activates (must clear fees)
      // 1.5% means worst-case trailing exit is ~1.0% after trail, still clears 0.65% fees
      minActivation: parseFloat(process.env.TRAIL_MIN_ACTIVATION) || config.minActivation || 1.5,

      // Trend multiplier: in strong trends, widen the trail
      trendWidenMultiplier: parseFloat(process.env.TRAIL_TREND_WIDEN) || config.trendWidenMultiplier || 1.5,

      // Structure tighten: near S/R or fib, tighten the trail
      structureTightenMultiplier: parseFloat(process.env.TRAIL_STRUCTURE_TIGHTEN) || config.structureTightenMultiplier || 0.5,
```

**str_replace replacement:**
```
      // FIX TIER-5-ENV-RULE-VIOLATION: prior code violated TradingConfig.js:9 rule
      // "If you find parseFloat(process.env.TRADING_PARAM) anywhere else, it's a bug."
      // Reads now go through TradingConfig single source of truth.
      atrMultiplier: config.atrMultiplier ?? require('../TradingConfig').get('trail.atrMultiplier'),
      minActivation: config.minActivation ?? require('../TradingConfig').get('trail.minActivation'),
      trendWidenMultiplier: config.trendWidenMultiplier ?? require('../TradingConfig').get('trail.trendWidenMultiplier'),
      structureTightenMultiplier: config.structureTightenMultiplier ?? require('../TradingConfig').get('trail.structureTightenMultiplier'),
```

**Step 3 (commit 20c) — switch UnifiedPatternMemory consumers**

**str_replace target:**
```
    this.config = {
      minSamples: parseInt(process.env.PATTERN_MIN_SAMPLES) || config.minSamples || 10,
      successThreshold: parseFloat(process.env.PATTERN_SUCCESS_THRESHOLD) || config.successThreshold || 0.65,
      failureThreshold: parseFloat(process.env.PATTERN_FAILURE_THRESHOLD) || config.failureThreshold || 0.35,
      maxAgeDays: parseInt(process.env.PATTERN_MAX_AGE_DAYS) || config.maxAgeDays || 90,
      decayHalflifeDays: parseInt(process.env.PATTERN_DECAY_HALFLIFE) || config.decayHalflifeDays || 30,
      maxPatterns: parseInt(process.env.PATTERN_MAX_STORED) || config.maxPatterns || 10000,
      dtwThreshold: parseFloat(process.env.PATTERN_DTW_THRESHOLD) || config.dtwThreshold || 0.62,
```

**str_replace replacement:**
```
    // FIX TIER-5-ENV-RULE-VIOLATION: reads moved to TradingConfig.
    const _TC = require('./TradingConfig');
    this.config = {
      minSamples: config.minSamples ?? _TC.get('patternMemory.minSamples'),
      successThreshold: config.successThreshold ?? _TC.get('patternMemory.successThreshold'),
      failureThreshold: config.failureThreshold ?? _TC.get('patternMemory.failureThreshold'),
      maxAgeDays: config.maxAgeDays ?? _TC.get('patternMemory.maxAgeDays'),
      decayHalflifeDays: config.decayHalflifeDays ?? _TC.get('patternMemory.decayHalflifeDays'),
      maxPatterns: config.maxPatterns ?? _TC.get('patternMemory.maxPatterns'),
      dtwThreshold: config.dtwThreshold ?? _TC.get('patternMemory.dtwThreshold'),
```

**Step 4 (commit 20d) — switch DecisionLedgerLogger**

**str_replace target:**
```
const LEDGER_BUFFER_SIZE = parseInt(process.env.LEDGER_BUFFER_SIZE || '1', 10);
```

**str_replace replacement:**
```
// FIX TIER-5-ENV-RULE-VIOLATION: read moved to TradingConfig.
const LEDGER_BUFFER_SIZE = require('./TradingConfig').get('ledger.bufferSize');
```

**Verification:**
- `grep -rn "parseFloat(process.env\|parseInt(process.env" core/ --include="*.js" | grep -v "TradingConfig.js"` → 0 hits
- `grep -rn "FIX TIER-5-ENV-RULE-VIOLATION" core/` → 3 hits
- P0 verify after each step

---


# .env

**Fixes from v3 audit:** 25

---

### Fix 25: ACCOUNT_DRAWDOWN_BYPASS audit note (operator action, not code change)

**File:** `.env` (operator-managed, lives on VPS)
**Status:** OPERATIONAL HAZARD if used in live trading

**Bug:** `.env` has `ACCOUNT_DRAWDOWN_BYPASS=true` per project memory. Flag was intended for parallel-backtester (comment at `core/TradingConfig.js:665`: "Skip drawdown check (for parallel backtester)"). Production runs with this enabled bypass the drawdown protection in `core/exit/StopLossChecker.js:48`.

**Fix:** Operator decision required.

**Status under current operator decisions:** RiskManager is intentionally bypassed (per operator). This flag is downstream of that — even if drawdown bypass were off, RiskManager wouldn't enforce it because RiskManager itself is off. So this is a no-op in current state.

**Action item for the post-eval session when RiskManager gets re-enabled:** also verify `ACCOUNT_DRAWDOWN_BYPASS=false` in `.env`. Keep `=true` only in `tools/parallel-backtest.js` worker env (lines 152, 192, 193 explicitly set it).

**Verification:** `grep -n "ACCOUNT_DRAWDOWN_BYPASS" .env` should show `=false` for live mode (when ready). Currently irrelevant because RiskManager is bypassed regardless.

---

### Fix 26: SymbolContexts caller missing symbol (companion to Fix 10)

**File:** `core/SymbolTradingContext.js`
**Line:** 107
**Status:** FIXED in 0d6538a — 2026-05-13

**Bug:** SymbolTradingContext constructor does `this.indicatorEngine = new IndicatorEngine(config.indicatorConfig)`. The `symbol` variable is already in scope as the first constructor arg, but it never gets threaded into the IndicatorEngine config. Result: per-symbol context registration fails for every symbol once Fix 10's throw is in place.

**str_replace target:**
```
        this.indicatorEngine = new IndicatorEngine(config.indicatorConfig);
```

**str_replace replacement:**
```
        // FIX 26 (companion to MIRROR-INDICATOR-SYMBOL): thread the per-symbol
        // `symbol` (already in scope as constructor arg) into IndicatorEngine
        // config. Prior code passed config.indicatorConfig verbatim, which is
        // undefined for callers that supply only { timeframe } (e.g.
        // run-empire-v2.js:799). Fix 10's constructor throw exposed this —
        // before Fix 10 the missing symbol silently defaulted to BTC-USD
        // inside what was supposed to be a per-symbol context for TSLA.
        this.indicatorEngine = new IndicatorEngine({ ...config.indicatorConfig, symbol });
```

**Verification:** `grep -n "FIX 26" core/SymbolTradingContext.js` → 1 hit. P0 anchor (Full) unchanged. Fast P0 may shift back from $10,060.32 → $10,202.95 (restoring the per-symbol context's TSLA registration recovers the indicator init order). Order matters: this fix must land **before** Fix 10's constructor throw, otherwise BOOT prints the failure and per-symbol context for TSLA stays unregistered.

---

### Fix 27: TradeJournalBridge balance coercion + nullish coalescing

**File:** `core/TradeJournalBridge.js`
**Line:** 39
**Status:** FIXED in 43d0f4c — 2026-05-14

**Bug:** Bridge forwards `config.startingBalance` raw to TradeJournal. Two failure paths: (1) env arrives as string `"10000"` → truthy `||` passes through → TradeJournal's `Number.isFinite("10000")` returns false → constructor throws with confusing error. (2) `config.startingBalance === 0` → `||` falls through to fallback → silent override of explicit zero.

**str_replace target:**
```
    this.journal = new TradeJournal({
      dataDir: config.dataDir || path.join(process.cwd(), 'data', 'journal'),
      startingBalance: config.startingBalance || TradingConfig.get('startingBalance', 10000),
      ...config
    });
```

**str_replace replacement:**
```
    // FIX MIRROR-JOURNAL-BALANCE companion: coerce raw env-string values to Number,
    // use ?? not || to preserve explicit 0 (constructor will reject 0 as invalid balance,
    // surfacing real upstream bug rather than hiding under $10K phantom).
    // SPREAD ORDER CRITICAL: ...config must come FIRST, then startingBalance override LAST.
    // Mercury caught Wolf's initial spec putting startingBalance before ...config which
    // caused the spread to silently overwrite the coerced value with raw config input —
    // re-introducing the exact bug Fix 27 was meant to fix.
    const _rawStartingBalance = config.startingBalance ?? TradingConfig.get('startingBalance');
    this.journal = new TradeJournal({
      dataDir: config.dataDir || path.join(process.cwd(), 'data', 'journal'),
      ...config,
      startingBalance: Number(_rawStartingBalance),
    });
```

**Verification:** `grep -n "MIRROR-JOURNAL-BALANCE companion" core/TradeJournalBridge.js` → 1 hit. P0 anchor unchanged (backtest path doesn't construct TradeJournal in EXECUTION_MODE=backtest). Spec history: initial replacement had spread order bug (Mercury caught it on first --execute run, transcript fix27-TradeJournalBridge-attack-2026-05-14T15-29-20-402Z.md); Wolf patched the order.

---

### Fix 28: TradingConfig add envNumber() strict helper

**File:** `core/TradingConfig.js`
**Lines:** 18-24 (env helper region) + 1105-1112 (CONVENIENCE EXPORTS region)
**Status:** FIXED in 0cc6163 — 2026-05-15

**Bug:** Current `env()` helper has polymorphic return — returns Number when parseFloat succeeds, returns raw string when it fails (`isNaN(num) ? val : num`). Footgun for any caller expecting numeric type — silent type drift propagates. Solution: additive `envNumber()` helper that strictly returns Number or throws. Leave `env()` unchanged for legacy callers.

**Multi-block rationale:** Original single-block spec attached `module.exports.envNumber = envNumber` at the helper's definition site (~line 46). CC + Mercury empirically verified the attachment was wiped by the late `module.exports = TradingConfig;` reassignment at line 1130 — `require('./core/TradingConfig').envNumber === undefined` after the original fix landed. Patched spec uses two str_replace pairs: pair 1 inserts the function definition only; pair 2 attaches the export AFTER the late reassignment in the CONVENIENCE EXPORTS section.

**str_replace target (Pair 1, helper definition):**
```
// Helper to parse env vars with fallback
const env = (key, fallback) => {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  const num = parseFloat(val);
  return isNaN(num) ? val : num;
};
```

**str_replace replacement (Pair 1, helper definition):**
```
// Helper to parse env vars with fallback
const env = (key, fallback) => {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  const num = parseFloat(val);
  return isNaN(num) ? val : num;
};

// FIX 28: Strict numeric env reader — returns Number, throws on non-numeric.
// Used by Fix 20 (DTS/UPM/DLL env-read centralization) to surface bad config
// loudly rather than silently coerce strings/NaN through to risk math.
// NOTE: module.exports attachment for this function is in a separate str_replace
// pair below — must be attached AFTER the module.exports = TradingConfig line
// at ~1130, otherwise the late reassignment wipes the attachment.
const envNumber = (key, fallback) => {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  const num = Number(val);
  if (!Number.isFinite(num)) {
    throw new Error(`[FIX-28] envNumber: ${key}="${val}" is not a finite number`);
  }
  return num;
};
```

**str_replace target (Pair 2, export attach AFTER late reassignment):**
```
// CONVENIENCE EXPORTS (for quick access to common values)
// =============================================================================

module.exports = TradingConfig;
module.exports.BASE_CONFIG = BASE_CONFIG;

// Quick accessors for the most commonly used values
module.exports.MIN_CONFIDENCE = () => TradingConfig.get('confidence.minTradeConfidence');
```

**str_replace replacement (Pair 2, export attach AFTER late reassignment):**
```
// CONVENIENCE EXPORTS (for quick access to common values)
// =============================================================================

module.exports = TradingConfig;
module.exports.BASE_CONFIG = BASE_CONFIG;
module.exports.envNumber = envNumber;  // FIX 28: attached AFTER late reassignment

// Quick accessors for the most commonly used values
module.exports.MIN_CONFIDENCE = () => TradingConfig.get('confidence.minTradeConfidence');
```

**Verification:** `grep -n "FIX 28" core/TradingConfig.js` → 2 hits (function comment + export-line comment). Empirical smoke test after both pairs apply: `node -e "const TC = require('./core/TradingConfig'); console.log(typeof TC.envNumber);"` must print `function`. If it prints `undefined`, halt before commit. P0 anchor unchanged (additive helper, no caller updates in this fix).

---

### Fix 29: BacktestRecorder remove $10K phantom (Fix 13 sibling site)

**File:** `core/BacktestRecorder.js`
**Line:** 21
**Status:** FIXED in ac7cf18 — 2026-05-15

**Bug:** Same `config.startingBalance || 10000` silent phantom that Fix 13 eliminated in TradeJournal. Mercury caught the sibling site — backtest path can silently default to $10K while live path throws (post-Fix-13), creating divergent behavior across the same config object.

**str_replace target:**
```
class BacktestRecorder {
    constructor(config = {}) {
        this.startingBalance = config.startingBalance || 10000;
```

**str_replace replacement:**
```
class BacktestRecorder {
    constructor(config = {}) {
        // FIX MIRROR-RECORDER-BALANCE: phantom $10K fallback removed. Mirror
        // of Fix 13 (TradeJournal). Same coerce/finite/positive check pattern.
        const rawBalance = config.startingBalance;
        const numericBalance = Number(rawBalance);
        if (!Number.isFinite(numericBalance) || numericBalance <= 0) {
          throw new Error(`[MIRROR-RECORDER-BALANCE] BacktestRecorder requires positive finite startingBalance (got ${rawBalance}) — refusing $10K phantom`);
        }
        this.startingBalance = numericBalance;
```

**Verification:** `grep -n "FIX MIRROR-RECORDER-BALANCE" core/BacktestRecorder.js` → 1 hit. **P0 anchor may change behavior:** if any backtest path was hitting the silent $10K fallback, this commit will throw and break backtest. Two outcomes: (a) anchor holds → no path was hitting the phantom → clean commit; (b) throw → caller needs explicit balance → surface for operator, do NOT add fallback back, caller fix is separate spec.

---

### Fix 30: TradeJournal stats invariant guard (Mercury #4)

**File:** `core/TradeJournal.js`
**Line:** 710
**Status:** UNTOUCHED — Mercury theoretical-invariant catch per CC-SPEC-FIX-13-COMPANION-BUNDLE.md

**Bug:** If any caller wraps the new Fix 13 constructor throw in try/catch and proceeds anyway, `this.stats.startingBalance` ends up undefined. Then `_updateStats` computes `netPnlPercent = s.netPnl / s.startingBalance * 100` → division by undefined → `NaN` → corrupts every downstream analytic (drawdown, win-rate, etc.) silently. Belt-and-suspenders guard against the case where the constructor throw is bypassed.

**str_replace target:**
```
    s.netPnlPercent = s.startingBalance > 0 ? (s.netPnl / s.startingBalance * 100) : 0;
```

**str_replace replacement:**
```
    // FIX MIRROR-JOURNAL-INVARIANT: refuse silent NaN propagation through analytics.
    // Belt-and-suspenders — constructor throw should prevent the state, but if
    // upstream catch+ignores, this fires loudly rather than silently zeroing.
    if (!Number.isFinite(s.startingBalance) || s.startingBalance <= 0) {
      throw new Error(`[MIRROR-JOURNAL-INVARIANT] stats.startingBalance must be positive finite (got ${s.startingBalance}) — refusing NaN-corrupt analytics`);
    }
    s.netPnlPercent = (s.netPnl / s.startingBalance) * 100;
```

**Verification:** `grep -n "FIX MIRROR-JOURNAL-INVARIANT" core/TradeJournal.js` → 1 hit. P0 anchor unchanged in clean code (guard doesn't fire when balance is valid).

---

## TIER 6 — Lower priority half-fixes (deferred but documented)

**This section was dropped in v2 rewrite by accident. Restored in v3. These are real findings; each one's blast radius is small or hot-path-irrelevant. Documented here so they don't get lost.**

Operator can sweep these in a single "lint + harden" PR later, or leave them until they cause an observable problem.

### `core/OrderExecutor.js:716` — `size: buyTrade.size || 1`
Silent fallback to size=1 if buyTrade.size is falsy. After Fix 2 (P1-A) lands, if size is ever zero post-partial-close, this `|| 1` masks it. Should be removed or replaced with fail-loud throw once Fix 2 has landed.

### `core/OrderExecutor.js:940-946` and 1278-1283 — 10 `|| 0` / `|| 'unknown'` fallbacks
Feeding PID controller `onTradeClose` calls. Audit Rule #1 violations. PID consumers currently zero (output path has zero consumers per project memory) so blast radius is small. Will matter when PID gets wired.

### `core/MultiAssetManager.js:268` — `this.bot._previousAsset || 'BTC-USD'`
MAM scheduled for deletion in Multi-Symbol Commit 6 (per project memory). Either delete with commit 6 or harden in the interim.

### `core/OrderExecutor.js:380, 552` — `asset: this.ctx.config.symbol || 'BTC'`
Discord notification path. Cosmetic but mirrors CRIT-04 pattern. Low priority.

### `core/dto/DecisionLedgerSchema.js:103` — `symbol: symbol || 'unknown'`
Schema-layer silent fallback. Should throw post-Fix-4.

### `core/StateManager.js:104` — `initialBalance: 10000` hardcoded in default state
CRIT-08 throws in `getEquity` if state has no initialBalance, but the constructor pre-seeds it to 10000. Phantom-balance lives in fresh state. Overridden in practice by `.env STARTING_BALANCE` flow at `run-empire-v2.js:869-885`.

### `core/TradingConfig.js:854` — `env('STARTING_BALANCE', 10000)` — silent $10K default
Same pattern. If env unset, silent $10K. Pair with the StateManager:104 fix above.

### `core/StateManager.js:441-455` — ledger skeleton silent defaults
`|| Date.now()`, `|| '15m'`, `|| 'backtest'`. Corrupts ledger accuracy when upstream fails to thread real values; does not change trade behavior.

### `core/StrategyOrchestrator.js:496, 504, 542, 666` — STRATEGY_DIAG-gated silent catches (13 total gates)
MTF, TPO, NoWick modules silently skip on errors unless `STRATEGY_DIAG=true` in env. Should default to summary-mode warnings so strategy failures are observable.

### `core/StrategyOrchestrator.js:774` — strategy-level catch
Wraps every individual `strategy.evaluate(ctx)` call. If a strategy throws because of bad upstream data, console.warn fires and that strategy silently skips for the cycle. Hides legitimate strategy regressions.

### `core/trai_core.js:763` and `core/TRAIDecisionModule.js:387-397` slots 5-8
Feature vector slots 5-8 are hardcoded constants (`0.5, 0, 0, 0` for wick ratio, price change, volume change, last direction). Spec said "build from clean inputs" — these are placeholders pending future wiring. Fixes 11 and 18 address the upstream fabrication, but slots 5-8 themselves remain constants.

### `core/PIDController.js:38-45, 135-158` — 20+ `config.X || hardcoded` patterns
PID currently has zero output consumers (per project memory) so cleanup is low-priority. Will matter when PID gets wired into position sizing / regime boosting / trailing-stop adaptation.

### `core/RegimeDetector.js:39-51` — 6 `config.X || hardcoded` thresholds
**Calibrated for BTC** ("1.2% ATR on 15m candles = elevated volatility for BTC" per line 43 comment). TSLA 15m ATR % is significantly different. Regime classification won't be accurate on TSLA without env overrides for trendThreshold, volatilityThreshold, etc.

### `core/MarketRegimeDetector.js:741` — `strength || 0.5` phantom 50% default
If both `regimeData.strength` and `this.regimeStrength` are missing, regime vote uses phantom 50% strength. Same TRAI-fabrication pattern.

### `core/IndicatorEngine.js:38` already fixed in Fix 10 (Tier 3) — see there.

### `core/SessionRouter.js:253` already fixed in Fix 14 (Tier 3) — see there.

---



These are real findings but their preconditions don't apply right now:

1. **RiskManager 3-timeframe gate mislabel** (`core/RiskManager.js:130, 135, 140` — all three call `_gate('daily_loss_limit', ...)`). RiskManager bypassed currently; fix when re-enabling.

2. **`orderTypeHint` dead field** (`core/StrategyOrchestrator.js:609` sets it, nothing reads it). ORB strategy not enabled; if ORB gets enabled the limit-vs-market intent will be silently downgraded. Fix when enabling ORB.

3. **COVER tier-exit asymmetry** (TradingLoop emits exitFraction for COVER but OrderExecutor's COVER branch ignores it per code comment at 1262-1264). SHORT learning blocks asymmetry. Separate spec — long-vs-short pipeline parity.

4. **MultiAssetManager dead code** (loaded but scheduled for deletion in multi-symbol commit 6).

5. **STRATEGY_DIAG-gated catches** (13 catches default to silent in StrategyOrchestrator). Lower priority — strategies still work, just less observable.

6. **CC's "disabled in comments" inventory** — SafetyNet, Reconciler, EventLoopMonitor, DynamicPositionSizer, RiskManager bypass. **Intentionally off per operator decision. Not bugs.** Re-enable in dedicated sessions, one at a time, post-eval.

---

## Execution order (final)

```
TIER 1: Fixes 1-5    — eval-blocking display + state correctness
TIER 2: Fixes 6-9    — catch-swallow chain (the big architectural win)
TIER 3: Fixes 10-14  — mirror sites
TIER 4: Fixes 15-17  — footguns
TIER 5: Fixes 18-22  — rule violations + mode guard
```

22 fixes, ~25 commits including Fix 20's sub-commits. P0 anchor will shift after Fixes 1, 2, 17, 18, 19. Document new anchor when it does.

---

## Honest disclosures

1. **Fix 1 (value_usd) is display-only.** Internal P&L was always correct. The bot's risk decisions and StateManager were operating on right numbers. The dashboard, ledger, and proof page were lying. Operator-facing instrumentation gets fixed; trading logic was already fine.

2. **The 10.07% daily loss alert was REAL.** It came from StateManager's correct P&L. Not a display artifact. **You actually lost ~10%.** That's the question to dig into next — not the display bug, but why the bot lost 10% on BTC paper trading. The answer is probably in strategy calibration (regime thresholds are BTC-calibrated; you're not running an evaluated strategy on BTC), not in the code.

3. **Fix 6 (outer catch differentiation) is the highest-impact change.** Right now during indicator warmup (first 14 candles of any run), every trade attempt silently fails because MaxProfitManager throws on null volatility. Bot looks dead for the first 14 candles every restart. After Fix 6, the warmup halt is visible.

4. **RiskManager stays bypassed by operator decision.** When you re-enable, expect to find more bugs — comments suggest it was disabled for a reason. Separate session, separate spec.

5. **Fix 20 (env-rule violations) needs Step 1 before Steps 2-4.** If a TradingConfig key isn't registered before its consumer switches to read it, behavior breaks silently. P0 after Step 1 is non-negotiable.

6. **None of this addresses long-vs-short pipeline asymmetry.** COVER ignoring exitFraction, SHORT learning blocks not symmetric — those are the next spec after this lands.

7. **I have not re-verified P0 backtest invariance** for any of the fixes here. CC must run P0 after each commit and confirm anchor match or shift-explained-by-fix.

8. **The intentionally-disabled safety modules** (SafetyNet, Reconciler, EventLoopMonitor, DynamicPositionSizer, RiskManager) are the operator's call. They're documented in code with comments. Re-enabling each one is its own future session. Not part of this spec.

---

**Spec complete. 22 fixes. Catch-swallow chain broken. Mirror sites closed. Defaults that agree. Rule violations brought into compliance. Operator-disabled safety stays disabled.**

---



# ============================================================
# PHASE 1.5 EXTENDED AUDIT FINDINGS
# ============================================================

These were discovered in the second audit pass on modules not covered by the v3 spec. Same format. Same standard. One change one commit.


## core/TradeIntelligenceEngine.js:675 — Phase 1.5

**Findings:** 1.5-TIE-2

---

### Finding 1.5-TIE-2: Line 675 catch-swallow

**Severity:** LOW (currently moot, would become MEDIUM if TIE gets wired)

**File:** `core/TradeIntelligenceEngine.js:675`
**Code:** `} catch (error) { console.error('[TradeIntelligence] Risk evaluation error:', error.message); }`

**Bug pattern:** Same as Phase 1 Fix 6/7 (OrderExecutor outer catch, StrategyOrchestrator exit-contract catch). Swallows real errors, returns partial result.

**Fix (when TIE gets wired):** Replace with explicit handling — either re-throw to surface the error or write to ledger via a TIE-specific telemetry path.

**Currently moot** because evaluateRiskState is never called. Document and fix when TIE integration lands.

---

## Module 3: `core/PipelineSnapshot.js` (240 lines)

**Purpose:** 30-min full bot state capture to JSONL for postmortem. Self-starts on interval, reads bot module state, writes snapshot file.

**Wired:** Yes per code comment (line 17 docs usage). Need to verify run-empire-v2.js actually constructs it.

**Audit results:**

| Check | Result |
|---|---|
| Direct env reads | NONE |
| Hardcoded fallbacks | 35 found. All defensive reads on optional state fields (`snap.price?.toFixed(2) || 'N/A'`, `bot.priceHistory?.length || 0`, etc.). Diagnostic data capture; missing field = display "N/A" is correct behavior, not silent bug. |
| Empty catches | TBD (not deep-audited) |
| TODO/FIXME | NONE |

**Findings: ZERO from signal audit.** Module is observational, not control-flow. Safe by design.

---

## Module 4: `core/Telemetry.js` (230 lines)

**Purpose:** Metrics collection and JSONL logging. In-memory metrics for quick access, batch writes.

**Audit results:**

| Check | Result |
|---|---|
| Direct env reads | NONE |
| Hardcoded fallbacks | 0 matching pattern. Uses `??` for defaults consistently. |
| TODO/FIXME | NONE |

**Findings: ZERO.** Module is clean.

---

## Module 5: `core/CandleProcessor.js` (602 lines)

**Purpose:** Receives candle ticks from broker WebSockets, normalizes shapes (Kraken array, Alpaca object), gap recovery via REST API, routes to indicator/strategy pipeline.

---


## core/CandleProcessor.js:283-285 — Phase 1.5

**Findings:** 1.5-CP-1

---

### Finding 1.5-CP-1: Triple-fallback chain with env read + hardcoded 'TSLA'

**Severity:** MEDIUM. Same pattern as Phase 1 Fix 24 (BacktestRecorder symbol with hardcoded sentinel).

**File:** `core/CandleProcessor.js:283-285`

**Code:**
```javascript
const symbol = resolvedConfig?.config?.broker?.tradingPair
               || (process.env.ALPACA_SYMBOLS || '').split(',')[0].trim()
               || 'TSLA';
```

**Bug:**
1. Direct env read in core/ (rule violation per TradingConfig.js:9)
2. Hardcoded `'TSLA'` silent default
3. Chain means if config is missing AND env is unset, GAP-RECOVERY silently fetches TSLA candles regardless of actual trading symbol

**Path is gap-recovery (WebSocket drops candles → REST backfill).** Wrong-symbol backfill = TSLA candles injected into a BTC pattern memory bank, TSLA price action evaluated as BTC. Bank corruption + indicator pollution.

**Fix:**

**str_replace target:**
```javascript
      // Resolve symbol + timeframe from context / env / fallback chain.
      // Prefer runtime config, then the ALPACA_SYMBOLS env var (first
      // symbol for single-instrument mode), then a safe default.
      const resolvedConfig = this.ctx.resolvedConfig || this.ctx.config;
      const symbol = resolvedConfig?.config?.broker?.tradingPair
                     || (process.env.ALPACA_SYMBOLS || '').split(',')[0].trim()
                     || 'TSLA';
      const timeframe = resolvedConfig?.config?.broker?.candleTimeframe || '1m';
```

**str_replace replacement:**
```javascript
      // FIX 1.5-CP-1: refuse silent env fallback and hardcoded 'TSLA' sentinel.
      // Gap recovery against the wrong symbol corrupts pattern banks and indicators.
      // resolvedConfig.config.broker.tradingPair is set at boot via ConfigLoader's
      // strict-symbol path. If missing here, that's an upstream regression.
      const resolvedConfig = this.ctx.resolvedConfig || this.ctx.config;
      const symbol = resolvedConfig?.config?.broker?.tradingPair;
      if (typeof symbol !== 'string' || !symbol) {
        throw new Error(`[GAP-RECOVERY 1.5-CP-1] CandleProcessor cannot resolve symbol from resolvedConfig.broker.tradingPair (got ${JSON.stringify(symbol)}) — refusing to default to 'TSLA' which would corrupt pattern memory for the actual trading symbol`);
      }
      const timeframe = resolvedConfig?.config?.broker?.candleTimeframe;
      if (typeof timeframe !== 'string' || !timeframe) {
        throw new Error(`[GAP-RECOVERY 1.5-CP-1] CandleProcessor cannot resolve timeframe from resolvedConfig.broker.candleTimeframe (got ${JSON.stringify(timeframe)})`);
      }
```

**Verification:** `grep -n "FIX 1.5-CP-1" core/CandleProcessor.js` → 1 hit. P0 verifies — TSLA backtest still passes because tradingPair is set correctly there.

---

## Module 6: `core/PatternMemoryBank.js` (826 lines)

**Purpose:** PatternMemorySystem with mode-aware persistence. Records trade outcomes against pattern signatures, supports DTW similarity matching, time decay, statistical promotion/quarantine.

---


## core/PatternMemoryBank.js:82-88, 110, 314-315 — Phase 1.5

**Findings:** 1.5-PMB-1

---

### Finding 1.5-PMB-1: Mode-detection scattered (rule violation, same pattern as Phase 1 Fix 21)

**Severity:** MEDIUM. Already covered architecturally by Phase 1 Fix 21 (mode-consistency guard) but ADDS THIS MODULE to the list of consumers needing the centralization fix.

**File:** `core/PatternMemoryBank.js:82-88, 110, 314-315`

**Code:**
```javascript
// Lines 82-88 (constructor):
if (process.env.BACKTEST_MODE === 'true') { mode = 'backtest'; }
else if (process.env.TRADING_MODE === 'live' || process.env.ENABLE_LIVE_TRADING === 'true') { mode = 'live'; }
else if (process.env.TRADING_MODE === 'paper' || process.env.PAPER_TRADING === 'true') { mode = 'paper'; }

// Line 110:
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..');

// Lines 314-315:
const tradingMode = process.env.BACKTEST_MODE === 'true' ? 'backtest' :
                   (process.env.TRADING_MODE === 'live' || process.env.ENABLE_LIVE_TRADING === 'true') ? 'live' : 'paper';
```

**Bug:** 6 direct env reads. Mode detection is duplicated from UnifiedPatternMemory:160-161 and other places. Phase 1 Fix 21 added a runtime guard; the full centralization needs each consumer (this module, others) updated to consume from a single source.

**Fix:** Replace direct env reads with TradingConfig.get('mode.execution') and TradingConfig.get('paths.dataDir'). Requires ConfigLoader to expose these (most already do; verify before fixing).

**str_replace target (lines 81-88):**
```javascript
        // Mode-aware pattern memory persistence to prevent contamination
        let mode = 'paper';  // Default to paper
        if (process.env.BACKTEST_MODE === 'true') {
            mode = 'backtest';
        } else if (process.env.TRADING_MODE === 'live' || process.env.ENABLE_LIVE_TRADING === 'true') {
            mode = 'live';
        } else if (process.env.TRADING_MODE === 'paper' || process.env.PAPER_TRADING === 'true') {
            mode = 'paper';
        }
```

**str_replace replacement:**
```javascript
        // FIX 1.5-PMB-1: consume mode from TradingConfig SSOT instead of direct env reads.
        // Mode-detection rule violation; centralized via Phase 1 Fix 21 guard.
        const TradingConfig = require('./TradingConfig');
        let mode = TradingConfig.get('mode.execution');
        if (typeof mode !== 'string' || !['backtest', 'paper', 'live'].includes(mode)) {
          throw new Error(`[FIX 1.5-PMB-1] PatternMemoryBank: TradingConfig.get('mode.execution') returned ${JSON.stringify(mode)} — expected backtest|paper|live`);
        }
```

Same pattern for lines 110 (DATA_DIR) and 314-315 (tradingMode in second function). Three sub-commits.

**Verification:** `grep -n "FIX 1.5-PMB-1" core/PatternMemoryBank.js` → 3 hits. Confirm `grep -n "process\.env\." core/PatternMemoryBank.js` returns 0 hits after.

---

## Module 7: `core/EnhancedPatternRecognition.js` (700 lines)

---


## core/EnhancedPatternRecognition.js:479 — Phase 1.5

**Findings:** 1.5-EPR-1

---

### Finding 1.5-EPR-1: Direct env read for BACKTEST_FAST logging gate

**Severity:** LOW. Rule violation but blast radius is one log line.

**File:** `core/EnhancedPatternRecognition.js:479`

**Code:** `if (process.env.BACKTEST_FAST !== 'true') { console.log(...); }`

**Fix:**

**str_replace target:**
```javascript
    if (process.env.BACKTEST_FAST !== 'true') {
      console.log(`✅ Pattern RECORDED: features[${featuresOrSignature.length}], pnl=${result?.pnl?.toFixed(2) || '?'}%, total=${this.stats.tradeResults}`);
    }
```

**str_replace replacement:**
```javascript
    // FIX 1.5-EPR-1: consume from TradingConfig SSOT instead of direct env read.
    if (!TradingConfig.get('mode.backtestFast', false)) {
      console.log(`✅ Pattern RECORDED: features[${featuresOrSignature.length}], pnl=${result?.pnl?.toFixed(2) || '?'}%, total=${this.stats.tradeResults}`);
    }
```

Verify `TradingConfig` is imported at top of file; if not, add the import. Add `mode.backtestFast` to ConfigLoader if not present.

---

## Module 8: `core/PerformanceAnalyzer.js` (44KB)

**Audit signals:** 0 env reads, 10 hardcoded `||`, 0 TODOs.

**Status:** Quick signal pass shows clean. Need deeper audit when phase begins. Tentatively zero findings.

---

## Module 9: `foundation/MarketCalendar.js`

**Audit results:**

| Check | Result |
|---|---|
| Direct env reads | NONE |
| Hardcoded fallbacks | 3 (timezone default, phaseMap fallback, holiday name fallback). All defensible. |
| TODO/FIXME | NONE |

**Findings: ZERO.** Module is clean.

---

## Module 10: `brokers/AlpacaAdapter.js` (27KB)

---


## brokers/AlpacaAdapter.js:25, 26, 29 — Phase 1.5

**Findings:** 1.5-AA-1

---

### Finding 1.5-AA-1: Direct env reads for API credentials (architectural inconsistency, not necessarily a bug)

**File:** `brokers/AlpacaAdapter.js:25, 26, 29`

**Code:**
```javascript
this.apiKey = config.apiKey || process.env.ALPACA_API_KEY;
this.apiSecret = config.apiSecret || process.env.ALPACA_API_SECRET;
const mode = (config.mode || process.env.ALPACA_MODE || 'paper').toLowerCase();
```

**Status:** INCONSISTENT with codebase rule. ALPACA_SYMBOLS goes through ConfigLoader, ALPACA_API_KEY does not.

**Operator decision required:** Two reasonable patterns —
- **Option A:** Adapter is the boundary, reads its own credentials (current behavior, leaves env reads in adapter)
- **Option B:** ConfigLoader resolves all env including credentials, adapter takes resolved config

Recommend Option B for consistency. Add `broker.credentials.apiKey` and `broker.credentials.apiSecret` to ConfigLoader. Treat this as architectural cleanup, not a bug per se.

---



# ============================================================
# SESSIONROUTER COMPLETION — 15 GAPS
# ============================================================

**File:** `core/SessionRouter.js`

SessionRouter has 2 of 15 critical handoffs wired. These are the missing 13 (plus 2 partial). Each gap is its own commit per the rule. The gap descriptions are pulled verbatim from the master plan Phase 4 — they describe what's missing and the fix approach, but most need a CC spec block (str_replace targets) written when their turn comes up.

### Gap 4.1 — Crypto position force-close on NYSE open
- Mirror lines 184-209 (which currently force-close stocks on NYSE close) into `_transitionToStocks`
- Each crypto trade closed at its symbol's last-known price
- Test: open BTC, NYSE opens, position closes with correct P&L

### Gap 4.2 — Historic candle loading on session transition
- After subscribing to new session's symbols, before allowing trades, fetch ~50 historical candles per symbol
- For Alpaca: use historical bars API
- For Kraken: use historical OHLC REST endpoint
- Block trading on the new session until indicators have ≥14 candles of warmup
- Test: NYSE opens, bot starts stocks session, doesn't take a trade in first 3.5 hours of garbage indicators

### Gap 4.3 — Pattern bank switching
- `UnifiedPatternMemory` currently has fixed storagePath. Needs a `setAssetBucket(bucket)` method that saves current state, loads new bank from disk
- Call from SessionRouter on transition
- Stocks session writes to `unified-patterns.{mode}.stocks.json`
- Crypto session writes to `unified-patterns.{mode}.crypto.json`
- Test: trade on stocks, transition to crypto, trade on crypto, verify each bank has only its own asset's patterns

### Gap 4.4 — Balance/equity/P&L behavior across sessions
- Operator decision required: are sessions independent accounts, or one account across both?
- If independent: snapshot balance at transition, store per-session
- If one account: explicit doc that P&L is unified, daily counter resets on NYSE midnight (or operator-defined)
- Test: 9% loss on crypto then 1% on stocks → operator sees what the policy says they should see (either two separate dailies or one combined)

### Gap 4.5 — IndicatorEngine reinitialize for new symbol
- Boot-time IndicatorEngine instantiated with one symbol
- On transition, either re-instantiate per active symbol, OR refactor IndicatorEngine to be symbol-aware via parameter (probably better — eliminates re-init cost)
- Per-symbol IndicatorEngine state (rolling windows, EMAs) MUST be isolated per symbol
- Test: TSLA EMA shouldn't shift when BTC arrives, and vice versa

### Gap 4.6 — priceHistory clearing on transition
- After Multi-Symbol Commit 6 (Phase 5), the legacy `priceHistory` is gone. Then this is automatic.
- Until Commit 6: explicit clear in `_transitionToStocks` and `_transitionToCrypto`
- Test: priceHistory contains only active-session candles after transition

### Gap 4.7 — SymbolTradingContext registration for active session
- SessionRouter currently doesn't register SymbolTradingContexts for the new session's symbols
- On transition, `this.symbolContexts.delete(oldSymbol); this.symbolContexts.set(newSymbol, new SymbolTradingContext(...))`
- Test: stocks session activates, symbolContexts Map contains TSLA/SPY/NVDA/QQQ contexts

### Gap 4.8 — Webhook adapter session-aware routing
- WebhookOrderAdapter currently points at SignalStack → TPT (stocks broker)
- Need second adapter for crypto session (Kraken's own order API, NOT a webhook)
- SessionRouter sets `ctx.activeOrderAdapter` based on session
- OrderExecutor reads from `ctx.activeOrderAdapter` instead of hardcoded `ctx.webhookAdapter`
- Test: crypto signal fires → Kraken order; stocks signal fires → SignalStack webhook

### Gap 4.9 — RiskManager state reset across sessions
- (When RiskManager gets re-enabled in Phase 6) — drawdown / loss-limit state needs explicit per-session or unified policy
- Same operator decision as Gap 4.4

### Gap 4.10 — Daily/weekly/monthly counter reset boundary
- Operator decision: NYSE midnight, UTC midnight, or per-session?
- Current code has implicit assumptions; needs to be explicit
- Test: counter resets at the configured boundary; doesn't reset twice per day or skip a day

### Gap 4.11 — State serialization includes active session
- If bot restarts mid-stocks-session, must resume in stocks session
- StateManager.save() must persist `activeSession`, `activeBroker`, `lastTransitionAt`
- StateManager.load() must restore them; SessionRouter.start() checks restored value vs phase at boot
- Test: kill the bot during stocks session at 11am ET, restart, bot resumes stocks (doesn't switch to crypto then back)

### Gap 4.12 — pauseTrading actually pauses trading
- Currently flips `isTrading=false` flag
- TradingLoop, CandleProcessor, OrderExecutor must each check `isTrading` and skip if false
- Verify these checks exist; add if missing
- Test: pauseTrading called, send a fake signal through, no trade fires

### Gap 4.13 — `_activateCrypto` BTC-USD fallback (Fix 14 from v3 spec)
- Already in Phase 1. Listed here for SessionRouter completeness.

### Gap 4.14 — Transition during open position is atomic
- What happens if a NEW signal arrives DURING transition? Currently `transitionInProgress` flag blocks new transitions but doesn't block signal processing.
- TradingLoop should also skip when `sessionRouter.transitionInProgress = true`
- Test: trigger a transition, immediately fire a signal during the transition window, signal queues until transition completes (or drops with warning)

### Gap 4.15 — getStatus exposes everything operator needs to monitor
- Current `getStatus()` returns session, broker, transition state, market phase
- Add: lastForceCloseCount, lastBankSwitchTime, lastWarmupCount, pendingTransition (next scheduled)
- Dashboard reads this for operator visibility


---



# ============================================================
# SHORTS PIPELINE PARITY — 6 GAPS
# ============================================================

**Primary file:** `core/OrderExecutor.js` (with one gap in `core/SessionRouter.js` overlapping the SessionRouter completion list above)

Every BUY/SELL/long code path needs a verified SELL_SHORT/COVER/short mirror. Gaps pulled verbatim from master plan Phase 3:

### Gap 3.1 — COVER ignores exitFraction
- **File:** `core/OrderExecutor.js:1183`
- **Bug:** `stateManager.closePosition(price, false, null, ...)` — hardcoded full-close. Compare to SELL branch (lines 753-768) which checks `decision.exitFraction` and routes to `reducePosition` for partial.
- **Impact:** MPM tier exits on shorts always close 100% instead of intended fraction (30%, 30%, 20%, 20% tiers all become a single 100% exit). The MaxProfitManager's tier system is dead on shorts.
- **Fix:** Refactor COVER branch to check `decision.exitFraction` and route to `reducePosition` for partial closes. Mirror the SELL branch structure exactly. ~30 lines.

### Gap 3.2 — No partial-close cleanup for shorts in MPM map
- **File:** `core/OrderExecutor.js:1074` (BUY side) vs missing equivalent in COVER (~line 1300+)
- **Bug:** SELL branch has `if (!isPartialClose && this.ctx.maxProfitManagers)` cleanup. COVER doesn't have this because COVER has no isPartialClose at all.
- **Fix:** After Gap 3.1, COVER branch will have isPartialClose. Add the symmetric MPM-map cleanup.

### Gap 3.3 — patternChecker.recordPatternResult missing on COVER
- **File:** `core/OrderExecutor.js:889` (BUY side) vs missing in COVER
- **Bug:** Short trade outcomes don't get recorded into the pattern recognition system. Bot can't learn which patterns predict good shorts.
- **Fix:** Mirror the line 889 block in the COVER path. Pattern memory learns from both directions.

### Gap 3.4 — Direction-asymmetric force-close on session transition
- **File:** `core/SessionRouter.js`
- **Bug:** `_transitionToCrypto` (lines 184-209) force-closes stock positions. `_transitionToStocks` does NOT force-close crypto positions. Open BTC sits abandoned for 6.5h of NYSE day.
- **Fix:** Mirror force-close logic in `_transitionToStocks`. (Also part of Phase 4, but listed here for shorts-parity completeness.)

### Gap 3.5 — Audit every SELL/COVER pair
- Go through OrderExecutor methodically. Every line that handles SELL has a COVER mirror. Any asymmetry in:
  - Logging (TradingProofLogger calls)
  - Notifications (Telegram, Discord)
  - Dashboard broadcasts
  - State transitions
  - Pattern recording
  - TRAI learning
  - Webhook emission
  ...gets fixed.
- Same audit for openPosition variants — every BUY-entry path has a SELL_SHORT-entry mirror; verify exact symmetry.

### Gap 3.6 — direction parameter consistency
- StateManager uses `direction: 'long'/'short'`. OrderExecutor uses `action: 'BUY'/'SELL_SHORT'`. MaxProfitManager uses `direction: 'buy'/'sell'`. ExitContractManager uses both depending on context.
- This isn't a bug per se but it's a footgun every time someone adds new code.
- **Fix:** Pick ONE convention (recommend `direction: 'long'/'short'` because it doesn't conflate entry action with position direction). Rewrite all consumers to use it. Add a normalizer at any boundary that receives the old form.


---



# ============================================================
# MULTI-SYMBOL COMMIT 6 (PATH B)
# ============================================================

**Source:** `CC-SPEC-MULTI-SYMBOL-COMMIT-6-PATH-B.md` (existing spec, pasted in full below)

Goal: eliminate legacy `this.priceHistory` dual-write. Delete `core/MultiAssetManager.js`. Replace all consumers with CandleStore lookups.

# CC-SPEC: Multi-Symbol Commit 6 — Path B Refactor

**Author:** Wolf (fresh instance, 2026-05-12)
**Predecessor:** `ogz-meta/sessions/session-2026-05-10-cc-c-6a-architecture-finding.md` (CC-C's Path B proposal, 6/6 Mercury findings real)
**Verified against:** rebuild-clean-from-baseline zip v8 uploaded 2026-05-12
**Rule:** Every line citation re-verified by Wolf against the v8 zip. No memory.
**Status:** SPEC — do NOT execute before TTP eval. See "When to land this."

---

## When to land this

**NOT BEFORE THE EVAL.** The dual-write architecture does not affect single-symbol TSLA backtest correctness — only one symbol exists in `symbolContexts`, so `symCtx` resolution and root-array resolution agree by construction in the eval workload. The eval is what funds Houston. Don't gamble it on a refactor that addresses a multi-symbol-correctness bug the eval doesn't exercise.

**Land after the eval passes**, when:
- TTP $47 5K MAX eval has cleared
- Bot is live on SignalStack with WEBHOOK_DRY_RUN=false
- A stable Phase 0 backtest baseline is recaptured under live-eval-config (numbers will differ from the pre-eval anchor after FIX 1 lands)
- There is a 4+ hour uninterrupted window for the refactor

**Override condition:** If, between now and eval start, the dual-write produces an *observable* corruption in the TSLA single-symbol path that breaks the eval, land this anyway. The corruption mechanism in CC-C's session doc (`map.size === 1` fallback) cannot fire when only TSLA is registered AND only TSLA candles flow — but if multi-symbol subscriptions get enabled by accident (`ALPACA_SYMBOLS=TSLA,NVDA` instead of `TSLA`), the corruption is live. Audit the eval startup env before flipping the switch.

---

## What's currently in the zip (post-6a working tree)

CC-C's 6a edits to CandleProcessor, CandleStore, ContractValidator, and AlpacaAdapter are present in v8 (uncommitted at zip-export time per CC-C's session doc). Specifically:

- `core/CandleProcessor.js:65-72` — `_resolveSymCtx` with the 3-strategy fallback exists
- `core/CandleProcessor.js:88, 92-98, 125, 135, 139-145, 197` — dual-write to `ctx.priceHistory` AND `_candleStore.addCandle()` is live
- `core/SymbolTradingContext.js:129-132` — `priceHistory` getter delegating to `candleStore.getCandles()` exists
- `core/CandleStore.js:106` — `getCandles` returns `[...candles]` shallow copy

**These are the structures Path B addresses.**

## What Mercury found (6/6 real, from CC-C session doc)

| # | Finding | Mechanism |
|---|---------|-----------|
| 1 | Storage key ≠ priceHistory symbol | Line 88 writes raw candle into global root array BEFORE line 97-104 resolves the storage key. Two writes, two symbol resolutions, can disagree. |
| 2 | Single-entry fallback exploitability | `if (map.size === 1) return sole entry` at `_resolveSymCtx` line 70 — accepts a wrong-symbol candle silently. |
| 3 | Slash/dash mismatch survives in multi-symbol | When `map.size > 1` and `candle.symbol` is slash-form, both map.has() calls miss; `_storageKey` falls through to the slash form. |
| 4 | Three-step resolver is a band-aid | Resolver-as-architecture violates "caller knows the symbol." |
| 5 | Coherence broken — root mechanism | Dual writes to two stores with two key resolutions = state desync by design. |
| 6 | Throw-behavior regression vs. CRIT-05-followup | Old code threw on missing-symbol; new code accepts missing-symbol via single-entry fallback. |

Findings 1, 2, 3, 6 are surface symptoms of #5 (the root cause). #4 is the architectural class.

---

## Path B — 5 steps

Each step is a separate commit with its own P0 baseline check. **Phase 0 invariance** (no behavior change for single-symbol TSLA) must hold across all 5 steps.

---

### Step 1 — Confirm SymbolTradingContext.priceHistory getter is authoritative

**File:** `core/SymbolTradingContext.js`
**Lines:** 124-132

**What to verify (no code change):**
```js
get priceHistory() {
    if (!this.candleStore) return EMPTY_PRICE_HISTORY;
    return this.candleStore.getCandles(this.symbol, this.timeframe) || EMPTY_PRICE_HISTORY;
}
```

This getter is the foundation. Path B's entire architecture relies on it being correct.

**Verification commands:**
```bash
# 1. Confirm the getter exists at the right line
grep -n "get priceHistory()" core/SymbolTradingContext.js
# expect: 129:    get priceHistory() {

# 2. Confirm EMPTY_PRICE_HISTORY is frozen (Mercury fix #1 from CC-C session)
grep -n "EMPTY_PRICE_HISTORY = Object.freeze" core/SymbolTradingContext.js
# expect: 32:const EMPTY_PRICE_HISTORY = Object.freeze([]);

# 3. Confirm CandleStore.getCandles returns the right shape
grep -A 3 "getCandles(symbol, timeframe, limit = null)" core/CandleStore.js
# expect: returns Array of OHLCV candles, shallow-copied via [...candles]
```

**No commit. This step is a verification gate before Step 2.**

---

### Step 2 — Make `bot.priceHistory` a getter onto the active symCtx

**This is the load-bearing decision.** Two options were on the table in CC-C's session doc. CC-C's Path B Step 2 said "Delete root `bot.priceHistory`." I'm proposing a tighter variant: **don't delete it, make it a getter.** Rationale:

- 25 sites in run-empire-v2.js reference `this.priceHistory` (reads, not writes)
- 19 of those reads are in places that legitimately need "the current symbol's candle history" — heartbeat, warmup check, dashboard sync, snapshot capture
- Deleting the field forces 19 read-site migrations + a decision per site about which symCtx to read from
- Making it a getter onto the active symCtx solves all 19 reads with one diff
- Eliminates the divergence at its source (the getter delegates to the same store the per-symbol contexts read from) without forcing a 19-site sweep

**File:** `run-empire-v2.js`
**Lines:** 767, 1185, 1187

**Current code at line 767:**
```js
    this.priceHistory = [];  // 1m candles for trading logic
```

**Current code at lines 1185-1187 (inside `loadCandleHistory`):**
```js
    this.priceHistory = [];
    this._candleStore.loadFromDisk(candleFile, symbol, '1m');
    this.priceHistory = this._candleStore.getCandles(symbol, '1m');
```

**Fix — replace the line-767 initialization with a getter:**

```js
    // CC-C Multi-Symbol Commit 6 (Path B Step 2):
    // priceHistory is no longer a stored array on the bot. It's a getter onto
    // the active symbol's SymbolTradingContext.priceHistory, which itself is a
    // getter onto _candleStore.getCandles(symbol, timeframe). Single source of
    // truth: _candleStore. No snapshot, no divergence.
    //
    // The "active symbol" in single-symbol mode is the sole symbolContexts entry.
    // In multi-symbol mode, callers that legitimately need "the current symbol's
    // history" must read symCtx.priceHistory directly with the symbol they're
    // operating on — the bot-level getter is a backward-compat shim for hot-path
    // consumers (heartbeat, warmup, dashboard sync) that historically read the
    // global array.
    //
    // Defined via Object.defineProperty so subsequent `this.priceHistory = X`
    // assignments throw (setter intentionally absent) — surfaces any code path
    // that still tries to write to the snapshot.
    Object.defineProperty(this, 'priceHistory', {
      get: () => {
        // Resolve active symCtx: env-resolved single-symbol path uses
        // this.tradingPair. If symbolContexts has exactly one entry and
        // tradingPair lookup fails (e.g., slash/dash mismatch), fall through to
        // the sole entry — preserves single-symbol Phase 0 invariance.
        if (!this.symbolContexts || this.symbolContexts.size === 0) return [];
        const tp = this.tradingPair;
        const direct = tp && this.symbolContexts.get(tp);
        if (direct) return direct.priceHistory;
        // Normalize and retry (slash → dash, XBT → BTC).
        if (tp) {
          const normalized = String(tp).toUpperCase().replace('XBT', 'BTC').replace('/', '-');
          const norm = this.symbolContexts.get(normalized);
          if (norm) return norm.priceHistory;
        }
        // Single-entry fallback (Phase 0 single-symbol mode). Multi-symbol mode
        // with tradingPair unresolved is a config bug — return empty array and
        // let downstream warmup checks gate.
        if (this.symbolContexts.size === 1) return this.symbolContexts.values().next().value.priceHistory;
        return [];
      },
      enumerable: true,
      configurable: false,
    });
```

**Fix — delete lines 1185-1187 entirely (loadCandleHistory's priceHistory hydration):**

The candleStore is still loaded by `_candleStore.loadFromDisk()` at line 1186 (keep that). The two `this.priceHistory = ...` lines at 1185 and 1187 become dead writes — the new getter computes priceHistory from candleStore on read, so the assignment-then-overwrite pattern is meaningless and the assignment would throw (no setter).

**Current code at 1185-1187:**
```js
    this.priceHistory = [];
    this._candleStore.loadFromDisk(candleFile, symbol, '1m');
    this.priceHistory = this._candleStore.getCandles(symbol, '1m');
```

**Replace with:**
```js
    // CC-C Commit 6: priceHistory is a getter on candleStore. loadFromDisk
    // hydrates the store; the getter sees the candles on next read. No
    // direct assignment needed — and would throw, since Step 2's defineProperty
    // omits a setter.
    this._candleStore.loadFromDisk(candleFile, symbol, '1m');
```

**Also delete 5 ctx-forwarding lines that propagate the old snapshot into module ctx objects.** These are now redundant because module ctx objects already hold a ref to `this` (the bot), and reading `this.priceHistory` resolves via the new getter.

**File:** `run-empire-v2.js`
**Lines:** 1643, 1772, 1992, 2001, 2010

Current code at line 1643:
```js
    this.tradingLoop.ctx.priceHistory = this.priceHistory;
```

Replace with:
```js
    // CC-C Commit 6: ctx.priceHistory propagation removed. TradingLoop's ctx
    // is `this` (the bot) — `this.ctx.priceHistory` resolves through the
    // bot's priceHistory getter automatically.
```

Apply the same deletion-with-comment at lines 1772 (backtestRunner.ctx), 1992, 2001, 2010 (dashboardBroadcaster.ctx). Five separate sites, same pattern.

**Verification after Step 2:**
```bash
# 1. Confirm getter exists
grep -n "Object.defineProperty(this, 'priceHistory'" run-empire-v2.js
# expect: one hit near line 767

# 2. Confirm no remaining `this.priceHistory =` assignments
grep -n "this\.priceHistory =" run-empire-v2.js
# expect: ZERO hits

# 3. Confirm no remaining ctx.priceHistory = propagation
grep -n "\.ctx\.priceHistory =" run-empire-v2.js
# expect: ZERO hits

# 4. Run P0 — must match new anchor (post-FIX-1 anchor from 4-fixes addendum)
CANDLE_FILE=data/tsla-15m-2y.json TRADING_PAIR=TSLA BROKER=alpaca ASSET_CLASS=stocks ENABLE_SHORTS=false DIRECTION_FILTER=both MIN_TRADE_CONFIDENCE=0.60 STOP_LOSS_PERCENT=2.5 BACKTEST_FAST=true STARTING_BALANCE=10000 node run-empire-v2.js 2>&1 | tail -5
```

**Halt condition:** If P0 drifts from the post-FIX-1 anchor, revert. The most likely failure mode is a consumer that mutates the array it gets from `priceHistory` (assumes ownership) — find that consumer and fix it before re-landing Step 2.

---

### Step 3 — Remove the dual-write in CandleProcessor.processNewCandle

**File:** `core/CandleProcessor.js`
**Lines:** 81-208 (the whole `processNewCandle` method)

The current method does two things on every candle:
1. Mutates `this.ctx.priceHistory` directly (lines 88, 125, 135, 197)
2. Calls `this.ctx._candleStore.addCandle(...)` (lines 92, 139)

After Step 2, `this.ctx.priceHistory` is a getter — the direct mutations at 88, 125, 135 throw (no setter). So Step 3 must replace those mutations with no-ops at the same time as Step 2 lands. **Practical sequencing: Step 2 and Step 3 must land in the SAME COMMIT.** Splitting them leaves a broken intermediate state.

**Current code at lines 86-120 (UPDATE branch):**
```js
    if (isUpdate) {
      // UPDATE existing candle (same etime, new OHLCV values as candle forms)
      this.ctx.priceHistory[existingIndex] = candle;
      // ... (lines 89-98: candleStore.addCandle with fail-loud)
      // ... (lines 100-105: this.ctx.indicatorEngine.updateCandle)
      // ... (lines 107-118: per-symbol indicator via _resolveSymCtx)
      return false;
    }
```

**Replace with:**
```js
    if (isUpdate) {
      // CC-C Commit 6 Step 3: single-write path. _candleStore is the only writer.
      // priceHistory is now a getter on SymbolTradingContext that delegates to
      // candleStore — the in-place update at the candleStore level is automatically
      // visible to all consumers reading via getter. No separate root-array write.
      this.ctx._candleStore.addCandle(
        candle.symbol || this.ctx.tradingPair || (() => {
          throw new Error('CandleProcessor.processNewCandle (UPDATE): missing candle.symbol AND ctx.tradingPair — refusing to default to BTC-USD');
        })(),
        '15m',
        candle
      );

      // Indicator updates — global path stays alive for backward-compat with
      // legacy consumers; per-symbol path runs via symCtx (Step 4 removes the
      // global path and threads symCtx in by argument).
      if (this.ctx.indicatorEngine) {
        this.ctx.indicatorEngine.updateCandle({
          t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
        });
      }
      const symCtx = this._resolveSymCtx(candle);
      if (symCtx) {
        symCtx.indicatorEngine.updateCandle({
          t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
        });
      }
      return false;
    }
```

**Current code at lines 122-145 (NEW-candle branch):**
```js
    // NEW candle - smart insert: push if latest, splice if backfill
    const lastCandle = this.ctx.priceHistory[this.ctx.priceHistory.length - 1];
    if (!lastCandle || candle.etime > lastCandle.etime) {
      this.ctx.priceHistory.push(candle);
    } else {
      // Backfill case: insert in timestamp order
      let insertIndex = 0;
      for (let i = this.ctx.priceHistory.length - 1; i >= 0; i--) {
        if (this.ctx.priceHistory[i].etime < candle.etime) {
          insertIndex = i + 1;
          break;
        }
      }
      this.ctx.priceHistory.splice(insertIndex, 0, candle);
    }
    // CRIT-05-followup: NEW candle path — same fail-loud guard.
    this.ctx._candleStore.addCandle(
      candle.symbol || this.ctx.tradingPair || (() => {
        throw new Error('CandleProcessor.processNewCandle (NEW): missing candle.symbol AND ctx.tradingPair — refusing to default to BTC-USD');
      })(),
      '15m',
      candle
    );
```

**Replace with:**
```js
    // NEW candle — single-write through _candleStore. The store handles
    // ordering (CC-C Commit 6 Step 3: addCandle is responsible for smart-insert
    // and backfill ordering, not CandleProcessor). priceHistory getter reads
    // the ordered candles via candleStore.getCandles(symbol, timeframe).
    this.ctx._candleStore.addCandle(
      candle.symbol || this.ctx.tradingPair || (() => {
        throw new Error('CandleProcessor.processNewCandle (NEW): missing candle.symbol AND ctx.tradingPair — refusing to default to BTC-USD');
      })(),
      '15m',
      candle
    );
```

**Pre-requisite for this replacement:** `CandleStore.addCandle` must handle backfill ordering and de-dup correctly. **Verify before applying:**

```bash
grep -A 30 "addCandle(symbol, timeframe, candle)" core/CandleStore.js
```

Read the addCandle implementation. If it appends-only (no backfill-ordering, no de-dup), Step 3 cannot land as written — addCandle has to be hardened first. If addCandle already handles ordering (which is plausible since the existing dual-write relies on the store doing the right thing), Step 3 is safe. **CC: do not apply this replacement until you've personally read addCandle and confirmed it handles the backfill case the CandleProcessor previously handled inline.**

**Current code at lines 189-198 (trim):**
```js
    // Warmup log (only first 20 candles)
    if (this.ctx.priceHistory.length <= 20) {
      const candleTime = new Date(candle.t).toLocaleTimeString();
      console.log(`✅ Candle #${this.ctx.priceHistory.length}/15 [${candleTime}]`);
    }

    // Trim history to 250
    if (this.ctx.priceHistory.length > 250) {
      this.ctx.priceHistory = this.ctx.priceHistory.slice(-250);
    }
```

**Replace with:**
```js
    // Warmup log via getter (single-symbol mode resolves to the active symCtx).
    const ph = this.ctx.priceHistory;
    if (ph.length <= 20) {
      const candleTime = new Date(candle.t).toLocaleTimeString();
      console.log(`✅ Candle #${ph.length}/15 [${candleTime}]`);
    }
    // Trim is now CandleStore's responsibility (configured maxCandles=250 at
    // construction site, run-empire-v2.js:769). The slice() reassignment at the
    // old root-array level is unreachable with the getter — and would throw.
```

**Confirm CandleStore enforces the trim:** the construction site is `new CandleStore({ maxCandles: 250 })` at run-empire-v2.js:769. Read `CandleStore.addCandle` to confirm it trims to `maxCandles` on each push. If it doesn't, Step 3 leaks memory — fix CandleStore first.

**Verification after Step 2+3 combined commit:**
```bash
# 1. No this.ctx.priceHistory direct writes
grep -n "this\.ctx\.priceHistory\s*=\|this\.ctx\.priceHistory\[.*\]\s*=\|this\.ctx\.priceHistory\.push\|this\.ctx\.priceHistory\.splice" core/CandleProcessor.js
# expect: ZERO hits

# 2. P0 — must match post-FIX-1 anchor
[same P0 command as above]

# 3. Memory check on a long backtest
# After ~15,000 candles, candleStore.getCandles(symbol, '15m').length should be 250 (capped)
# Not 15,000. If it's 15,000, CandleStore isn't trimming and Step 3 broke memory bounds.
```

**Halt condition:** Any P0 drift, OR memory growth past 250 candles per symbol in candleStore.

---

### Step 4 — Move storage-key resolution OUT of CandleProcessor

**File:** `core/CandleProcessor.js`
**Lines:** 65-72 (`_resolveSymCtx`), 81 (`processNewCandle` signature), 92-95, 112-118, 139-142, 172-187

This is the structural fix for Mercury findings 2, 3, 4, 6 — the silent-fallback class of bugs. Eliminate the resolver. Make the caller pass symCtx in by argument.

**Current signature:**
```js
processNewCandle(candle) {
```

**New signature:**
```js
processNewCandle(candle, symCtx) {
  if (!symCtx) {
    throw new Error('CandleProcessor.processNewCandle: symCtx required. Caller must resolve symbol→symCtx before calling. Resolver-as-fallback removed in Commit 6 Step 4 to eliminate silent mis-routing (Mercury findings 2, 3, 4, 6).');
  }
```

**Delete the helper at lines 65-72:**
```js
  _resolveSymCtx(candle) {
    // ... entire method body
  }
```

**Replace internal callers of `_resolveSymCtx(candle)` with the symCtx argument:**

Lines 112-118 (UPDATE path, per-symbol indicator):
```js
// BEFORE:
const symCtx = this._resolveSymCtx(candle);
if (symCtx) {
  symCtx.indicatorEngine.updateCandle({...});
}

// AFTER:
symCtx.indicatorEngine.updateCandle({...});
```

Lines 172-187 (NEW path, per-symbol routing):
```js
// BEFORE:
const symCtx = this._resolveSymCtx(candle);
if (symCtx) {
  this._firstCandleSeenSymbols ??= new Set();
  // ... etc
}

// AFTER:
this._firstCandleSeenSymbols ??= new Set();
const sym = symCtx.symbol;
if (!this._firstCandleSeenSymbols.has(sym)) {
  console.log(`[BOOT][CandleProcessor] first candle routed to ${sym} context`);
  this._firstCandleSeenSymbols.add(sym);
}
symCtx.indicatorEngine.updateCandle({...});
if (symCtx.emaCrossover)   symCtx.emaCrossoverSignal = symCtx.emaCrossover.update(candle, symCtx.priceHistory);
if (symCtx.maDynamicSR)    symCtx.maDynamicSRSignal  = symCtx.maDynamicSR.update(candle, symCtx.priceHistory);
if (symCtx.volumeProfile)  symCtx.volumeProfile.update(candle, symCtx.priceHistory);
```

**Replace the storage-key resolution in addCandle calls:**

```js
// BEFORE (lines 92-98 and 139-145):
this.ctx._candleStore.addCandle(
  candle.symbol || this.ctx.tradingPair || (() => {
    throw new Error('...');
  })(),
  '15m',
  candle
);

// AFTER:
this.ctx._candleStore.addCandle(symCtx.symbol, symCtx.timeframe, candle);
```

`symCtx.symbol` is the dash-canonical, registered symbol. `symCtx.timeframe` was set at SymbolTradingContext construction (run-empire-v2.js:799, `timeframe: '15m'`). Single source. No fallback.

**Now update every caller of `processNewCandle`** — they must resolve symCtx before calling.

```bash
grep -rn "processNewCandle\|candleProcessor\." --include="*.js" 2>/dev/null | grep -v ".pipeline-backup" | grep -v "ogz-meta"
```

CC: run this grep. For each caller, look at what symbol it's processing (broker tag, backfill loader, etc.) and resolve to symCtx before the call. The current fallback chain (`candle.symbol || ctx.tradingPair`) becomes the caller's responsibility, with a clear failure mode (throw if no symCtx) instead of a silent fallback.

**Verification after Step 4:**
```bash
# 1. _resolveSymCtx is gone
grep -n "_resolveSymCtx" core/CandleProcessor.js
# expect: ZERO hits

# 2. All processNewCandle callers updated
grep -rn "processNewCandle" --include="*.js" 2>/dev/null | grep -v ".pipeline-backup" | grep -v "ogz-meta"
# every result should pass symCtx as second argument

# 3. P0 — must match post-FIX-1 anchor
[same P0 command]
```

**Halt condition:** Any P0 drift OR a `processNewCandle` caller that can't cleanly resolve symCtx (signal: that path uses a stringly-typed symbol with no registered context — handle that case explicitly, don't paper over it).

---

### Step 5 — Tighten `CandleStore.getCandles` semantics

**File:** `core/CandleStore.js`
**Line:** 106

**Current:**
```js
return [...candles]; // Return copy to prevent external mutation
```

This is a shallow copy. It defends against external mutation of the candleStore's internal array, but it means:
- Every read allocates a new array
- Consumers that hold the result across multiple reads see different references
- The "priceHistory getter on SymbolTradingContext" technically returns a different array reference on every read

**Two ways forward:**

**Option A — Live reference (no copy):**
```js
return candles;
```
Faster, single reference. But callers that mutate the result (e.g., `result.push(x)` thinking they're not affecting the store) silently corrupt the store. **Audit needed:** every consumer of `getCandles` to confirm none mutate the result.

**Option B — Two methods:**
```js
getCandles(symbol, timeframe, limit = null) {
  // ... existing logic, returns [...candles] (snapshot)
}

getCandlesLive(symbol, timeframe) {
  // returns the live internal array reference — for hot-path consumers
  return this._getCandles(symbol, timeframe);
}
```
Make `SymbolTradingContext.priceHistory` getter use `getCandlesLive`. Snapshot consumers (saveToDisk, replay) keep using `getCandles`. **Audit needed:** classify each consumer as snapshot vs. live.

**CC: do not pick the option yourself.** Run the audit and propose to Trey + Wolf with the list of consumers and the recommended classification per site. This is the one step where the right answer depends on observed behavior, not just spec.

**Audit command:**
```bash
grep -rn "\.getCandles(" --include="*.js" 2>/dev/null | grep -v ".pipeline-backup" | grep -v "ogz-meta" | grep -v "core/CandleStore.js"
```

For each hit, read the surrounding 10 lines and answer: does this consumer mutate the result? Examples of mutation: `.push`, `.splice`, `[i] = newValue`, sort-in-place, reverse-in-place. If yes → keep snapshot semantics (Option A breaks this caller). If all consumers are read-only → Option A is safe.

**Verification after Step 5:**
- Audit results documented in a session note
- Chosen option implemented
- P0 unchanged

---

## Step-by-step execution and P0 anchor management

```
Pre-flight: P0 → confirm current state matches post-FIX-1 anchor (from 4-fixes addendum)
Step 1:     Verification only, no commit. Read SymbolTradingContext getter.
Step 2+3:   ONE COMMIT (atomic — splitting them leaves a broken state).
            Verify P0 matches post-FIX-1 anchor.
Step 4:     Separate commit. Verify P0 matches post-FIX-1 anchor.
Step 5:     Separate commit AFTER audit + Trey/Wolf approval on Option A vs B.
            Verify P0 matches post-FIX-1 anchor.
```

**Anchor expectations:**
- Steps 2+3, 4, 5 are pure refactors. P&L math is unchanged.
- P0 must match the post-FIX-1 anchor BIT-IDENTICAL after each step.
- ANY drift = revert + investigate. Phase 0 invariance is the contract.

---

## Mercury attack prompt (after each step)

```
ADVERSARIAL: Multi-Symbol Commit 6 Step [N] refactors priceHistory from a
stored array to a getter, removes dual-writes in CandleProcessor, and threads
symCtx as a required argument. Attack the change.

1. The bot.priceHistory getter resolves the active symCtx via this.tradingPair
   lookup with a single-entry fallback. If tradingPair is set but
   symbolContexts is empty (boot order race), what does the getter return? Trace.

2. CandleStore.addCandle is now the only writer. If addCandle is called with
   the same etime twice (live tick correction → final candle), does the store
   de-dup, replace, or duplicate? Trace through the addCandle implementation.

3. processNewCandle now requires symCtx. If a caller passes undefined (broker
   adapter that hasn't been updated), the throw fires. Does the throw propagate
   cleanly to a fail-loud log, or does some upstream catch swallow it silently?
   Trace the call chain.

4. The 5 ctx-forwarding deletions at run-empire-v2.js:1643, 1772, 1992, 2001,
   2010 assume that TradingLoop/BacktestRunner/DashboardBroadcaster ctx
   already inherits `this.priceHistory` via the bot reference. Verify each
   module's ctx structure. Does any of them store ctx by value (snapshot)
   rather than by reference?

5. SymbolTradingContext.priceHistory getter delegates to
   candleStore.getCandles(symbol, timeframe), which returns [...candles]
   (shallow copy). Does any indicator/strategy mutate the returned array?
   If yes, where, and what's the consequence under the new architecture?

6. The single-entry fallback in bot.priceHistory getter
   (this.symbolContexts.size === 1) preserves Phase 0 single-symbol behavior
   even when tradingPair lookup fails. Is this the same fallback class Mercury
   flagged in finding #2 of the 6a audit? If yes, why is it acceptable here
   but not in _resolveSymCtx?
```

(Answer to #6 in advance: the bot-level getter only runs when a caller asks "give me the bot's idea of priceHistory" — there is no per-candle routing decision being made. The `_resolveSymCtx` finding was about routing an *incoming* candle to the wrong bucket. The bot.priceHistory getter is read-only; nothing gets routed by it. Different semantic, same fallback shape, different consequence class.)

---

## Files touched (complete)

| File | Lines | Change |
|------|-------|--------|
| `core/SymbolTradingContext.js` | (none — verify only) | Confirm getter is authoritative |
| `run-empire-v2.js` | 767, 1185-1187, 1643, 1772, 1992, 2001, 2010 | Getter for priceHistory + delete ctx-forwarding |
| `core/CandleProcessor.js` | 65-72, 81, 88, 92-98, 112-118, 125, 135, 139-145, 172-187, 189-198 | Single-write + remove resolver + require symCtx |
| `core/CandleStore.js` | 106, possibly add `getCandlesLive` | Per Step 5 audit |
| (every `processNewCandle` caller) | TBD by Step 4 audit | Pass symCtx |

---

## What this spec does NOT cover

- **MultiAssetManager deletion.** CC-C's session doc Step 2 mentioned it; this spec scopes commit 6 to the dual-write refactor only. MultiAssetManager has a `switchAsset` method (`core/MultiAssetManager.js:174`) that does live WS resubscription + dashboard notification — that's behavior, not just metadata. SymbolTradingContext only absorbed the metadata (ASSET_REGISTRY). Deleting MultiAssetManager removes the live-asset-switch capability entirely. **Separate spec, separate decision.** If you want to delete it in commit 6, add Step 6 with the migration plan for `switchAsset` semantics.

- **TradingLoop `symCtx?.priceHistory ?? this.ctx.priceHistory` fallback at lines 88, 513.** This fallback becomes redundant after Step 2 (the right-hand side now resolves through the same getter as the left), but the code still works. Cleanup pass — not blocking.

- **Pre-existing `ENABLE_SHORTS` dead flag** (defined at TradingConfig.js:809, never read). Separate cleanup, not in commit 6 scope.

- **The 4 blocking fixes** (see CC-SPEC-4-BLOCKING-FIXES-BEFORE-EVAL.md and its addendum). Those land first, before any of this.

---

## TL;DR — what to feed CC

When the green light comes:
1. Read this spec
2. Read CC-C's session doc at `ogz-meta/sessions/session-2026-05-10-cc-c-6a-architecture-finding.md`
3. Confirm post-FIX-1 anchor is captured
4. Execute Step 1 (verification)
5. Execute Step 2+3 as ONE commit, P0, verify
6. Execute Step 4, P0, verify
7. Run Step 5 audit, present to Trey + Wolf, get explicit go/no-go on Option A vs B
8. Execute Step 5 chosen option, P0, verify
9. Mercury attack pass after each step. Real findings get their own commits.


---



# ============================================================
# RISKMANAGER RE-ENABLE
# ============================================================

**File:** `core/RiskManager.js`

Operator note: RiskManager is intentionally bypassed (`RISK_MANAGER_BYPASS=true`). Re-enable AFTER all other fixes land, in a separate session, to identify what's wrong when RM is active.

## Phase 7 — RiskManager re-enable

**Goal:** Flip `RISK_MANAGER_BYPASS=false` and verify every gate works correctly. Find and fix whatever bug caused RiskManager to be disabled in the first place.

**Source:** project memory note "RiskManager bypass intentional, will be re-enabled in a separate session AFTER the bot is trading correctly, to identify what RiskManager is doing wrong when active"

**Action items:**

### Gap 7.1 — RiskManager 3-timeframe gate mislabel
- `core/RiskManager.js:130, 135, 140` — all three timeframes call `_gate('daily_loss_limit', ...)` with the same gate name
- Fix: rename to `daily_loss_limit`, `weekly_loss_limit`, `monthly_loss_limit` respectively

### Gap 7.2 — Investigate WHY RiskManager was originally disabled
- Operator memory: "got disabled during something because of something"
- Need: re-enable in paper mode, observe what trips, document each finding
- Could be: drawdown calc on wrong balance basis, threshold calibrated for wrong account size, gates firing on transient state during initialization, etc.

### Gap 7.3 — RiskManager state across sessions
- (From Phase 4 Gap 4.9) Make sure RiskManager state behaves correctly across session transitions
- Verify daily counter resets at the configured boundary (Phase 4 Gap 4.10)

### Gap 7.4 — Verify each gate against an attack
- Drawdown circuit: simulate -10% balance, verify circuit fires
- Daily loss: simulate hitting daily limit, verify block
- Weekly/monthly: same
- Confidence: low-confidence trade, verify gate
- Recovery mode: enter recovery, verify higher confidence threshold

### Gap 7.5 — ACCOUNT_DRAWDOWN_BYPASS audit
- (Fix 25 from Phase 1) Verify `.env` has `ACCOUNT_DRAWDOWN_BYPASS=false` for live runs
- Parallel-backtester explicitly sets `=true` in its worker env — confirm that still works
- Bot start logs the resolved value clearly

**Phase 7 exit criteria:**
- `RISK_MANAGER_BYPASS=false` in production .env
- All gates verified active via simulated breach
- Cause of original disable understood and documented
- P0 + P1 + Phase 7 attack tests all green

---


# ============================================================
# GHOST MODULES — DISPOSITION DECISION REQUIRED
# ============================================================

These modules exist in the codebase but are NOT wired into the live trading pipeline. Auditing fallback patterns inside them is wasted work — the bugs (if any) don't fire because the code doesn't execute. Each one needs an operator decision: wire it, or delete it.

## `core/TradeIntelligenceEngine.js` (1378 lines)

Status: instantiated at run-empire-v2.js:489. Log says "ACTIVE". `tradeIntelligence.evaluate()` has ZERO callers anywhere in the codebase (verified by grep).

Operator decision needed:
- **Wire:** Call `this.tradeIntelligence.evaluate(trade, marketData, indicators, context)` per active trade per candle from TradingLoop. Use result to augment/override exit decisions. Requires Mercury attack + 13-dimension weight tuning.
- **Delete:** Remove file from repo and instantiation from run-empire-v2.js.
- **Document as deferred:** Same status as DynamicPositionSizer ("intentionally unwired pending tuning"). Add explicit comment so it doesn't get audited again.

## `core/PatternMemoryBank.js` (826 lines)

Status: exists in repo. No `new PatternMemoryBank()` anywhere. Predecessor or alternative to UnifiedPatternMemory (which IS wired). UnifiedPatternMemory supersedes this.

Operator decision needed:
- **Delete:** Remove file. UnifiedPatternMemory has fully replaced it.
- **Keep with comment:** Document why it's there if there's a reason.

## `core/EnhancedPatternRecognition.js` (700 lines)

Status: exists in repo. No `new EnhancedPatternRecognition()` anywhere.

Operator decision needed:
- **Wire:** Find where it should be called.
- **Delete:** Remove if superseded.

## `core/Telemetry.js` (230 lines)

Status: class exists, not instantiated.

Operator decision needed:
- **Wire:** Instantiate at boot, call from PerformanceAnalyzer / OrderExecutor / etc.
- **Delete:** Remove if PipelineSnapshot covers the use case.

## `core/DynamicPositionSizer.js`

Status: per project memory, intentionally unwired pending tuning. NOT a ghost module — explicit deferral.

Action: add a comment in the file's header stating "INTENTIONALLY UNWIRED — pending tuning per operator decision 2026-XX-XX" so future audits don't flag it.

---

# ============================================================
# OPERATOR DECISIONS REQUIRED
# ============================================================

Pulled from across all sections. Each one blocks the work it's attached to.

1. **Ghost module dispositions** (above) — 4 modules need wire-or-delete decision
2. **Pattern bank cleanup before TSLA eval** — archive existing paper banks on VPS before starting fix execution
3. **ACCOUNT_DRAWDOWN_BYPASS audit** (Fix 25) — operator action when RiskManager re-enabled
4. **Phase 4 SessionRouter Decision 4.4** — balance/equity policy across sessions (per-session independent or unified account)
5. **AlpacaAdapter API credentials** (Finding 1.5-AA-1) — Option A (adapter reads env) or Option B (ConfigLoader resolves all)
6. **MultiAssetManager deletion timing** (Multi-Symbol Commit 6) — delete during Commit 6 work, no separate decision needed
7. **Daily/weekly/monthly counter reset boundary** (SessionRouter Gap 4.10) — NYSE midnight, UTC midnight, or per-session

---

# ============================================================
# ANCHOR HISTORY
# ============================================================

| Date | Value | Reason for shift | Commit |
|---|---|---|---|
| 2026-05-12 (baseline) | $18,497.278595001146 / 1,384 trades / 60.0% WR | Initial P0 reference | (pre-session) |

Update this table as fixes land and anchor shifts.

---

# ============================================================
# HALT LOG TEMPLATE
# ============================================================

When Claudito halts, append entry here:

```
Halt timestamp: 
Fix ID being executed: 
Halt reason (P0 shift / diff mismatch / Mercury flag / new finding / Trey-invoked): 
What was committed before halt (commit hash if any): 
What needs to happen to resume: 
```

