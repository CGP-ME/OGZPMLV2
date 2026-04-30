/**
 * SessionRouter.js — Dual-broker session orchestration
 * ====================================================
 *
 * Watches the NYSE clock and switches the active data feed between Kraken
 * (crypto, 24/7) and Alpaca (stocks, RTH only). Sequential operation —
 * only ONE feed active at a time.
 *
 * On RTH open (09:30 ET, M-F, non-holiday):
 *   - Pause trading
 *   - Unsubscribe Kraken feed
 *   - Register Alpaca with stock symbols in OrderRouter
 *   - Subscribe Alpaca to stock symbols
 *   - Re-attach the OHLC callback to Alpaca
 *   - Resume trading
 *
 * On RTH close (16:00 ET, or 13:00 on early-close days):
 *   - Pause trading
 *   - Force-close any open stock positions using LIVE market price
 *     (NOT entry price — that would compute P&L = $0)
 *   - Unsubscribe Alpaca feed
 *   - Register Kraken with crypto symbols in OrderRouter
 *   - Subscribe Kraken to primary crypto symbol
 *   - Re-attach OHLC callback to Kraken
 *   - Resume trading
 *
 * Gated by `SESSION_ROUTER_ENABLED` env (default false). When off, the bot
 * runs single-broker exactly as it does today — no behavior change. Phase 0
 * baseline must reproduce byte-exact with the gate disabled.
 *
 * Source: ogz-meta/ledger/CC-SPEC-SESSION-ROUTER-IMPL_1.md (Wolf v2)
 * Calendar: foundation/MarketCalendar.js (replaces Wolf's nyse-calendar.js
 * proposal — single source of truth for NYSE holidays and sessions).
 *
 * @date 2026-04-26
 */

'use strict';

const EventEmitter = require('events');
const { getMarketPhase, getNYTimeParts } = require('../foundation/MarketCalendar');
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
    // Wolf CC-SPEC-POST-PHASE3 Commit 5 (2026-04-30): FAULTED state.
    // Set true when a transition catch fires. Once true, _checkTransition
    // short-circuits — no further auto-resume, no more transition attempts.
    // Existing-position exits remain allowed (stateManager.resumeTrading is
    // NOT called from the catch). Manual recovery: clear flag from a debug
    // RPC or process restart after operator review.
    this.faulted = false;

    this.stockSymbols = config.stockSymbols || ['TSLA','SPY','QQQ','NVDA','COIN','MARA','RIOT'];
    this.cryptoSymbols = config.cryptoSymbols || ['BTC/USD','ETH/USD','SOL/USD'];

    this.onOhlcCallback = null;

    // Bot context — set via wire() for access to marketData.price during force-close
    this.ctx = null;

    console.log(`[SessionRouter] Initialized | enabled=${this.enabled} | interval=${this.checkIntervalMs}ms`);
  }

  /**
   * Wire SessionRouter to its dependencies.
   * @param {Object} krakenAdapter - Kraken broker adapter instance
   * @param {Object} alpacaAdapter - Alpaca broker adapter instance
   * @param {Object} orderRouter - OrderRouter instance
   * @param {Function} onOhlcCallback - The OHLC handler from run-empire-v2 (eventData) => void
   * @param {Object} ctx - Bot context (`this` from run-empire) — gives access to marketData/priceHistory
   */
  wire(krakenAdapter, alpacaAdapter, orderRouter, onOhlcCallback, ctx) {
    this.krakenAdapter = krakenAdapter;
    this.alpacaAdapter = alpacaAdapter;
    this.orderRouter = orderRouter;
    this.onOhlcCallback = onOhlcCallback;
    this.ctx = ctx || null;
    console.log('[SessionRouter] Wired — Kraken + Alpaca + OrderRouter');
  }

  /**
   * Pull current market price from CandleProcessor's ctx.marketData.
   * Used for force-close P&L computation at session boundary. Returns null
   * if no price data available (pre-first-tick).
   *
   * CRITICAL: closePosition computes P&L as (exitPrice - entryPrice).
   * If we passed entryPrice as exitPrice, every force-close would book
   * P&L = $0 — wrong. Live price is the right input here.
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

  /**
   * Broker-first liquidation on session transition. Wolf CC-SPEC-POST-PHASE3
   * Commit 4: prior code only called stateManager.closePosition() at swap
   * time, leaving real broker positions open. On live, bot thought it was
   * flat while Alpaca still held the stocks, then re-entered into a
   * doubled position on next session.
   *
   * Order of operations:
   *   1. Cancel open orders on outgoing broker (clears the book before close)
   *   2. Fetch broker positions; for each, place a close order using the
   *      exact share count from the broker (isShareQty=true). For spot
   *      crypto (Kraken), getPositions returns [] and steps 2-3 are no-ops.
   *   3. Poll up to 10s for broker to confirm flat. Throw on timeout.
   *   4. Close StateManager records using current price.
   *
   * Throws on:
   *   - Broker not flat after 10s (positions stuck)
   *   - StateManager.closePosition failure (record corruption)
   * Caller (transition method) catches and routes to FAULTED state (Commit 5).
   */
  async _brokerFirstLiquidation(outgoingBroker, brokerLabel) {
    // Mercury Round-3 attack D: defensive method-existence checks.
    // Inconsistent to typeof-guard cancelAllOrders but not the methods we
    // actually require for the liquidation contract. A missing required
    // method is an adapter contract violation, not a recoverable state —
    // throw with a clear diagnostic instead of letting JS produce a
    // confusing TypeError mid-flow.
    if (typeof outgoingBroker.getPositions !== 'function') {
      throw new Error(`${brokerLabel} adapter does not implement getPositions`);
    }
    if (typeof outgoingBroker.placeBuyOrder !== 'function' || typeof outgoingBroker.placeSellOrder !== 'function') {
      throw new Error(`${brokerLabel} adapter missing placeBuyOrder/placeSellOrder`);
    }

    // Step 1: Cancel open orders on outgoing broker.
    // Mercury Round-1 attack B: log a warning if cancelAllOrders returns
    // false (partial cancel). Per Wolf's spec the failure is non-fatal at
    // this layer (any uncanceled order will surface via reconciliation),
    // but we surface the signal so operators see partial cancels in logs.
    if (typeof outgoingBroker.cancelAllOrders === 'function') {
      const ok = await outgoingBroker.cancelAllOrders();
      if (ok) {
        console.log(`[SessionRouter] ${brokerLabel} open orders canceled`);
      } else {
        console.warn(`[SessionRouter] ${brokerLabel} cancelAllOrders returned partial/failure — proceeding; uncanceled orders may fill before close`);
      }
    }

    // Step 2: Get broker positions and close each one.
    // Mercury Round-1 attacks C/D/E: best-effort closes with strict
    // side/size validation. Old pattern's per-trade try/catch preserved
    // (collect failures, throw with full list at end) so operators see
    // every position that needs attention, not just the first failure.
    const brokerPositions = await outgoingBroker.getPositions();
    if (brokerPositions && brokerPositions.length > 0) {
      const failedCloses = [];
      for (const pos of brokerPositions) {
        // Mercury Round-5 attack F: null/non-object position entry. If
        // getPositions returns [null, ...], pos.side access throws
        // outside the per-position try/catch. Skip with warning.
        if (!pos || typeof pos !== 'object') {
          console.warn(`[SessionRouter] ${brokerLabel}: skipping null/non-object position entry`);
          continue;
        }
        // Attack D + Round-2 attack E: strict side validation with
        // case-normalization. Adapter contract specifies lowercase, but
        // a future broker adapter could emit 'LONG'/'SHORT'. Normalize
        // then strict-check; defaulting to 'buy' on null/undefined would
        // close a long by buying = doubling exposure.
        const normalizedSide = typeof pos.side === 'string' ? pos.side.toLowerCase() : null;
        if (normalizedSide !== 'long' && normalizedSide !== 'short') {
          console.error(`[SessionRouter] ${brokerLabel}: invalid pos.side='${pos.side}' for ${pos.symbol} — skipping`);
          failedCloses.push({ symbol: pos.symbol, error: `invalid side: ${pos.side}` });
          continue;
        }
        // Attack E: skip zero/non-finite-size positions defensively.
        // The adapter's amount guard would throw and abort the loop;
        // skipping here gives operators a clearer warning.
        const size = Math.abs(pos.size);
        if (!Number.isFinite(size) || size === 0) {
          console.warn(`[SessionRouter] ${brokerLabel}: skipping invalid-size position ${pos.symbol} (size=${pos.size})`);
          continue;
        }
        const closeSide = normalizedSide === 'long' ? 'sell' : 'buy';
        const placeFn = closeSide === 'sell' ? 'placeSellOrder' : 'placeBuyOrder';
        try {
          // Mercury Round-2 attack G + Round-3 attack B + Round-4 attack B
          // + Round-5 attacks A/B/C: inspect order-placement response with
          // robust status normalization. Alpaca can return 200-OK with
          // status='rejected'/'expired'/'canceled'/'suspended' (client-side
          // rejection passes through REST cleanly). Defenses:
          //   - malformed result (null/non-object) → fail
          //   - missing status field → fail (broker contract violation)
          //   - non-string status (e.g. numeric 400) → fail
          //   - case-insensitive blacklist match → fail
          // Keeps permissive about novel valid statuses while catching the
          // documented failure modes regardless of casing.
          const result = await outgoingBroker[placeFn](pos.symbol, size, null, { isShareQty: true });
          if (!result || typeof result !== 'object') {
            throw new Error(`broker returned malformed result (got ${result})`);
          }
          const status = typeof result.status === 'string' ? result.status.toLowerCase() : null;
          if (!status) {
            throw new Error(`broker returned no status field (orderId=${result.orderId})`);
          }
          const FAILURE_STATUSES = new Set(['rejected', 'expired', 'canceled', 'suspended']);
          if (FAILURE_STATUSES.has(status)) {
            throw new Error(`order ${status} by broker (orderId=${result.orderId})`);
          }
          console.log(`[SessionRouter] ${brokerLabel} close: ${closeSide} ${size} ${pos.symbol}`);
        } catch (closeErr) {
          console.error(`[SessionRouter] ${brokerLabel} close failed for ${pos.symbol}:`, closeErr.message);
          failedCloses.push({ symbol: pos.symbol, error: closeErr.message });
        }
      }
      if (failedCloses.length > 0) {
        const errMsg = `${brokerLabel} close attempts failed for ${failedCloses.length} position(s): ${failedCloses.map(f => `${f.symbol}(${f.error})`).join(', ')}`;
        throw new Error(errMsg);
      }

      // Step 3: Wait for broker to confirm flat (up to 10s).
      // Mercury Round-3 attack C: track flat-state in the loop instead
      // of doing a redundant final getPositions(). Prior shape did
      // poll-while-not-flat, break, then RE-CHECK with a fresh fetch.
      // That created a race window where a position could open between
      // the break and the re-check, producing a spurious 'NOT flat'
      // failure even though the loop confirmed flatness moments ago.
      let isFlat = false;
      let retries = 10;
      while (retries-- > 0) {
        const remaining = await outgoingBroker.getPositions();
        if (!remaining || remaining.length === 0) {
          isFlat = true;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!isFlat) {
        throw new Error(`${brokerLabel} NOT flat after close (10s timeout)`);
      }
      console.log(`[SessionRouter] ${brokerLabel} confirmed flat`);
    }

    // Step 4: Close StateManager records (broker is now flat).
    // Mercury Round-1 attack F: per-record try/catch + collect failures,
    // mirroring step 2's best-effort pattern. A single bad record
    // shouldn't leave the rest stale.
    const activeTrades = this.stateManager.state.activeTrades;
    if (activeTrades && activeTrades.size > 0) {
      const currentPrice = this._getCurrentPrice();
      const failedRecordCloses = [];
      for (const [orderId, trade] of [...activeTrades.entries()]) {
        const exitPrice = currentPrice || trade.entryPrice;
        try {
          await this.stateManager.closePosition(exitPrice, false, null, {
            orderId,
            exitReason: 'session_transition',
            tradeId: trade.tradeId || orderId,
          });
        } catch (recErr) {
          console.error(`[SessionRouter] StateManager close failed for ${orderId}:`, recErr.message);
          failedRecordCloses.push({ orderId, error: recErr.message });
        }
      }
      if (failedRecordCloses.length > 0) {
        const errMsg = `StateManager close failed for ${failedRecordCloses.length} record(s): ${failedRecordCloses.map(f => `${f.orderId}(${f.error})`).join(', ')}`;
        throw new Error(errMsg);
      }
    }
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
    // Wolf CC-SPEC-POST-PHASE3 Commit 5: stop attempting transitions once
    // faulted. A FAULTED router stays paused until operator review and
    // process restart. Continuing to fire transition attempts after a
    // failure would compound state divergence.
    if (this.faulted) return;
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
    // Mercury Commit-5 attack E: capture source session at method entry.
    // activeSession may be mutated mid-transition (e.g., set to 'stocks'
    // on the success path before the resumeTrading call); using the live
    // value in the faulted event reports the wrong direction. Capture
    // here so diagnostic accurately reflects what we transitioned FROM.
    const sourceSession = this.activeSession;
    console.log(`[SessionRouter] TRANSITION: crypto -> stocks at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);

    try {
      await this.stateManager.pauseTrading('SessionRouter: transitioning to stocks');

      // Wolf CC-SPEC-POST-PHASE3 Commit 4 (2026-04-30): broker-first
      // liquidation. The prior code only ran stateManager.closePosition()
      // without submitting actual broker close orders, so on live the bot
      // would record itself flat while Kraken still held the BTC position.
      // _brokerFirstLiquidation now: cancels open Kraken orders, gets
      // broker positions (Kraken spot returns [] — step 2-3 no-op for
      // spot crypto), then closes StateManager records at current price
      // (still the crypto price here — runs BEFORE the unsubscribe below).
      // The price-capture concern from the BUG FIX 2026-04-28 comment is
      // preserved: _getCurrentPrice() inside _brokerFirstLiquidation reads
      // ctx.marketData.price BEFORE the krakenAdapter.unsubscribeAll line.
      await this._brokerFirstLiquidation(this.krakenAdapter, 'Kraken');

      if (this.krakenAdapter.unsubscribeAll) this.krakenAdapter.unsubscribeAll();
      if (this.krakenAdapter.removeAllListeners) this.krakenAdapter.removeAllListeners('ohlc');

      // FIX 2026-04-27 (Bot Swap Resilience audit): Reset cross-asset state
      // BEFORE the new feed is wired so no candles arrive during reset.
      // Without this, IndicatorEngine carries stale crypto state into the
      // first stock candles (RSI/EMA/MACD bleeding 14-200 candles deep).
      if (this.ctx && this.ctx.indicatorEngine && typeof this.ctx.indicatorEngine.reset === 'function') {
        this.ctx.indicatorEngine.reset();
      }
      if (this.ctx && Array.isArray(this.ctx.priceHistory)) {
        this.ctx.priceHistory.length = 0;
      }
      // Multi-Symbol Phase 2 Q2 fix (2026-04-29): wipe streaming aggregator
      // state across the swap. Otherwise old-asset's in-progress 5m/15m/30m
      // buffers persist; if that asset later returns, the aggregator
      // re-mixes stale candles into the new period. Per-symbol map = full
      // resetAll() since the active asset just changed.
      if (this.ctx && this.ctx.candleAggregator && typeof this.ctx.candleAggregator.resetAll === 'function') {
        this.ctx.candleAggregator.resetAll();
      }
      // Multi-Symbol Phase 3 follow-up — Wolf Bug 2 + Mercury attack (5) fix
      // (2026-04-29): wipe the gap-detector state on session swap. The
      // CandleProcessor's _lastAggEmission map carries per-(symbol, TF) wall-
      // clock timestamps from the OLD venue; if not cleared, the gap detector
      // can fire false positives (reading a stale crypto entry while now in
      // stocks session) or silently miss real gaps (lookup falls into an
      // empty bucket for the new symbol). Match the rest of the swap-time
      // reset contract — when the venue changes, all per-venue caches die.
      //
      // Mercury re-attack finding (5) — loud-with-guard: keep the typeof
      // guard so a missing candleProcessor doesn't crash mid-transition
      // (a half-completed swap is itself a half-swapped state), but emit
      // a loud console.error so the skip is observable instead of silent.
      // Once Commit 5 (FAULTED state machine) ships, the crash becomes
      // safe to surface and this guard can be removed.
      if (this.ctx && this.ctx.candleProcessor) {
        this.ctx.candleProcessor.resetGapState();
      } else {
        console.error('[SESSION-ROUTER] FATAL: candleProcessor missing during venue transition — gap detector state NOT reset. Bot may be in half-swapped state. Investigate ctx wiring immediately.');
      }
      // Multi-Symbol Phase 4 (2026-04-29): clear all per-symbol contexts.
      // Each context owns its own priceHistory + IndicatorEngine + Regime
      // state. Across a venue swap, those buffers are cross-asset stale
      // (TSLA's 200-candle EMA → BTC's first crypto candles). Reset all,
      // then clear the map so re-activated symbols get fresh contexts.
      if (this.ctx && this.ctx.symbolContexts && typeof this.ctx.symbolContexts.forEach === 'function') {
        for (const [, sc] of this.ctx.symbolContexts) {
          if (typeof sc.reset === 'function') sc.reset();
        }
        this.ctx.symbolContexts.clear();
      }
      // 2026-04-28: NoWickImbalance pending-levels are per-asset — wipe on swap.
      if (this.ctx?.strategyOrchestrator?.noWickModule?.reset) {
        try { this.ctx.strategyOrchestrator.noWickModule.reset(); }
        catch (e) { console.warn('[SessionRouter] NoWick reset failed:', e.message); }
      }
      // FIX 2026-04-27 (Asset Isolation audit): Also clear the on-disk
      // candle-history.json. Without this, restart-after-swap replays
      // mixed-asset candles through indicatorEngine.computeBatch() at
      // run-empire-v2.js:721-722 — reproducing the indicator-state leak
      // we just fixed in-memory, just via the restart path.
      try {
        const fs = require('fs');
        const path = require('path');
        const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
        if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
      } catch (err) {
        console.warn('[SessionRouter] candle-history clear failed:', err.message);
      }

      if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);

      // Multi-Symbol Phase 3 (2026-04-29): subscribe to ALL stockSymbols on '1m'.
      // Aggregator builds 5m/15m/30m per-symbol from 1m. CandleProcessor's
      // active-symbol guard (Phase 3) ensures only the primary symbol's candles
      // touch global priceHistory/IndicatorEngine — other symbols' data is
      // collected into _candleStore + candleAggregator awaiting Phase 4's
      // SymbolContext consumers. Always '1m' regardless of CANDLE_TIMEFRAME
      // env to avoid the dual-writer collision (native HTF + aggregator HTF).
      if (this.alpacaAdapter.subscribeToCandles) {
        for (const symbol of this.stockSymbols) {
          this.alpacaAdapter.subscribeToCandles(symbol, '1m');
          console.log(`[SessionRouter] Subscribed to ${symbol} 1m bars`);
        }
      }

      if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);

      this.activeSession = 'stocks';
      this.activeBroker = this.alpacaAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();

      this.emit('transition', { from: 'crypto', to: 'stocks', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: stocks session');
      this._kickHistoricalBackfill('stocks');
      // Wolf CC-SPEC-POST-PHASE3 Commit 9 (2026-04-30): post-swap
      // reconciliation. paperMode reconcilers no-op; live reconcilers
      // verify the new venue's broker state matches StateManager records.
      // Failure-mode in live: if reconciliation fails, ExchangeReconciler
      // calls stateManager.pauseTrading internally — operator must review.
      // Optional-chained because reconciler may not be wired (e.g., during
      // backtest mode where the wire-up at run-empire-v2.js is skipped).
      if (this.ctx?.reconciler) {
        // Mercury Round-1 attack B: post-swap reconciliation failure means
        // broker state doesn't match StateManager records. Catching+
        // continuing would let the transition mark ACTIVE despite divergent
        // state — exactly the half-swapped class of bug FAULTED is meant
        // to expose. Rethrow so the outer catch routes to FAULTED.
        try {
          await this.ctx.reconciler.reconcileNow();
          console.log('[SessionRouter] Post-swap reconciliation complete');
        } catch (recErr) {
          console.error('[SessionRouter] Post-swap reconciliation threw:', recErr.message);
          throw new Error(`post-swap reconciliation failed: ${recErr.message}`);
        }
      }

    } catch (err) {
      // Wolf CC-SPEC-POST-PHASE3 Commit 5: enter FAULTED state instead of
      // silently auto-resuming. Auto-resume after a failed transition meant
      // the bot would re-enter the new venue while half-swapped (broker
      // not flat, stale subscriptions, etc.) — the half-swapped-state
      // class of bugs Mercury Finding 5 (Commit 1) called out. FAULTED
      // freezes further transitions; operator must review logs and
      // restart the process. Existing-position exits remain allowed
      // (stateManager.resumeTrading is intentionally NOT called).
      console.error(`[SessionRouter] TRANSITION FAILED (crypto -> stocks): ${err.message}`);
      console.error('[SessionRouter] Entering FAULTED state — entries disabled, manual review required');
      this.faulted = true;
      // Mercury Commit-5 attack D: wrap emit in try/catch. EventEmitter is
      // synchronous; a listener that throws would propagate out of this
      // catch block and bypass the FAULTED state we just entered. Wrap so
      // a buggy listener can't undo the safety entry.
      try {
        this.emit('faulted', { error: err.message, from: sourceSession, target: 'stocks' });
      } catch (emitErr) {
        console.error('[SessionRouter] faulted event listener threw:', emitErr.message);
      }
    } finally {
      this.transitionInProgress = false;
    }
  }

  async _transitionToCrypto(now) {
    this.transitionInProgress = true;
    const ny = getNYTimeParts(now);
    const sourceSession = this.activeSession;  // Mercury Commit-5 attack E: capture before mutation
    console.log(`[SessionRouter] TRANSITION: stocks -> crypto at ${ny.hour}:${String(ny.minute).padStart(2,'0')} ET`);

    try {
      await this.stateManager.pauseTrading('SessionRouter: transitioning to crypto');

      // Wolf CC-SPEC-POST-PHASE3 Commit 4 (2026-04-30): broker-first
      // liquidation. Critical for the stocks→crypto direction: prior code
      // only called stateManager.closePosition() without submitting Alpaca
      // close orders, so on live the bot would mark itself flat while
      // Alpaca still held the stock positions — leading to doubled exposure
      // when crypto session re-entered. _brokerFirstLiquidation now: cancels
      // open Alpaca orders, queries Alpaca for live positions, places
      // close orders for each (using the broker's exact share count via
      // isShareQty=true), polls for flat (10s timeout), then closes
      // StateManager records. Throws on broker-not-flat — caller (catch
      // block below) will route to FAULTED state once Commit 5 ships.
      await this._brokerFirstLiquidation(this.alpacaAdapter, 'Alpaca');

      if (this.alpacaAdapter.unsubscribeAll) this.alpacaAdapter.unsubscribeAll();
      if (this.alpacaAdapter.removeAllListeners) this.alpacaAdapter.removeAllListeners('ohlc');

      // FIX 2026-04-27 (Bot Swap Resilience audit): Reset cross-asset state
      // BEFORE the new feed is wired so no candles arrive during reset.
      // Without this, IndicatorEngine carries stale stock state into the
      // first crypto candles (RSI/EMA/MACD bleeding 14-200 candles deep).
      if (this.ctx && this.ctx.indicatorEngine && typeof this.ctx.indicatorEngine.reset === 'function') {
        this.ctx.indicatorEngine.reset();
      }
      if (this.ctx && Array.isArray(this.ctx.priceHistory)) {
        this.ctx.priceHistory.length = 0;
      }
      // Multi-Symbol Phase 2 Q2 fix (2026-04-29): wipe streaming aggregator
      // state across the swap. Otherwise old-asset's in-progress 5m/15m/30m
      // buffers persist; if that asset later returns, the aggregator
      // re-mixes stale candles into the new period. Per-symbol map = full
      // resetAll() since the active asset just changed.
      if (this.ctx && this.ctx.candleAggregator && typeof this.ctx.candleAggregator.resetAll === 'function') {
        this.ctx.candleAggregator.resetAll();
      }
      // Multi-Symbol Phase 3 follow-up — Wolf Bug 2 + Mercury attack (5) fix
      // (2026-04-29): wipe the gap-detector state on session swap. The
      // CandleProcessor's _lastAggEmission map carries per-(symbol, TF) wall-
      // clock timestamps from the OLD venue; if not cleared, the gap detector
      // can fire false positives (reading a stale crypto entry while now in
      // stocks session) or silently miss real gaps (lookup falls into an
      // empty bucket for the new symbol). Match the rest of the swap-time
      // reset contract — when the venue changes, all per-venue caches die.
      //
      // Mercury re-attack finding (5) — loud-with-guard: keep the typeof
      // guard so a missing candleProcessor doesn't crash mid-transition
      // (a half-completed swap is itself a half-swapped state), but emit
      // a loud console.error so the skip is observable instead of silent.
      // Once Commit 5 (FAULTED state machine) ships, the crash becomes
      // safe to surface and this guard can be removed.
      if (this.ctx && this.ctx.candleProcessor) {
        this.ctx.candleProcessor.resetGapState();
      } else {
        console.error('[SESSION-ROUTER] FATAL: candleProcessor missing during venue transition — gap detector state NOT reset. Bot may be in half-swapped state. Investigate ctx wiring immediately.');
      }
      // Multi-Symbol Phase 4 (2026-04-29): clear all per-symbol contexts.
      // Each context owns its own priceHistory + IndicatorEngine + Regime
      // state. Across a venue swap, those buffers are cross-asset stale
      // (TSLA's 200-candle EMA → BTC's first crypto candles). Reset all,
      // then clear the map so re-activated symbols get fresh contexts.
      if (this.ctx && this.ctx.symbolContexts && typeof this.ctx.symbolContexts.forEach === 'function') {
        for (const [, sc] of this.ctx.symbolContexts) {
          if (typeof sc.reset === 'function') sc.reset();
        }
        this.ctx.symbolContexts.clear();
      }
      // 2026-04-28: NoWickImbalance pending-levels are per-asset — wipe on swap.
      if (this.ctx?.strategyOrchestrator?.noWickModule?.reset) {
        try { this.ctx.strategyOrchestrator.noWickModule.reset(); }
        catch (e) { console.warn('[SessionRouter] NoWick reset failed:', e.message); }
      }
      // FIX 2026-04-27 (Asset Isolation audit): Also clear the on-disk
      // candle-history.json. Without this, restart-after-swap replays
      // mixed-asset candles through indicatorEngine.computeBatch() at
      // run-empire-v2.js:721-722 — reproducing the indicator-state leak
      // we just fixed in-memory, just via the restart path.
      try {
        const fs = require('fs');
        const path = require('path');
        const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
        if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
      } catch (err) {
        console.warn('[SessionRouter] candle-history clear failed:', err.message);
      }

      if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);

      // Multi-Symbol Phase 3 (2026-04-29): subscribe to ALL cryptoSymbols on '1m'.
      // Same pattern as stocks side — aggregator builds HTF, active-symbol guard
      // in CandleProcessor preserves single-symbol trading correctness.
      if (this.krakenAdapter.subscribeToCandles) {
        for (const symbol of this.cryptoSymbols) {
          this.krakenAdapter.subscribeToCandles(symbol, '1m');
          console.log(`[SessionRouter] Subscribed to ${symbol} 1m bars`);
        }
      }

      if (this.onOhlcCallback && this.krakenAdapter.on) this.krakenAdapter.on('ohlc', this.onOhlcCallback);

      this.activeSession = 'crypto';
      this.activeBroker = this.krakenAdapter;
      this.lastTransitionAt = Date.now();

      await this.stateManager.resumeTrading();

      this.emit('transition', { from: 'stocks', to: 'crypto', at: now.toISOString() });
      console.log('[SessionRouter] ACTIVE: crypto session');
      this._kickHistoricalBackfill('crypto');
      // Wolf Commit 9 post-swap reconciliation — see matching block in
      // _transitionToStocks above for full reasoning.
      if (this.ctx?.reconciler) {
        // Mercury Round-1 attack B: post-swap reconciliation failure means
        // broker state doesn't match StateManager records. Catching+
        // continuing would let the transition mark ACTIVE despite divergent
        // state — exactly the half-swapped class of bug FAULTED is meant
        // to expose. Rethrow so the outer catch routes to FAULTED.
        try {
          await this.ctx.reconciler.reconcileNow();
          console.log('[SessionRouter] Post-swap reconciliation complete');
        } catch (recErr) {
          console.error('[SessionRouter] Post-swap reconciliation threw:', recErr.message);
          throw new Error(`post-swap reconciliation failed: ${recErr.message}`);
        }
      }

    } catch (err) {
      // Wolf CC-SPEC-POST-PHASE3 Commit 5: enter FAULTED state. See
      // matching comment in _transitionToStocks above for full reasoning.
      console.error(`[SessionRouter] TRANSITION FAILED (stocks -> crypto): ${err.message}`);
      console.error('[SessionRouter] Entering FAULTED state — entries disabled, manual review required');
      this.faulted = true;
      try {
        this.emit('faulted', { error: err.message, from: sourceSession, target: 'crypto' });
      } catch (emitErr) {
        console.error('[SessionRouter] faulted event listener threw:', emitErr.message);
      }
    } finally {
      this.transitionInProgress = false;
    }
  }

  _activateCrypto() {
    // FIX 2026-04-27: clear stale on-disk candle-history.json on initial
    // activation too — not just on transitions. Cold boot when previous
    // run ended on the OTHER asset replays foreign candles through
    // indicatorEngine and stalls warmup. Same bug class as 4433126,
    // different trigger.
    try {
      const fs = require('fs');
      const path = require('path');
      const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
      if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
    } catch (err) {
      console.warn('[SessionRouter] candle-history clear failed:', err.message);
    }

    this.activeSession = 'crypto';
    this.activeBroker = this.krakenAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.krakenAdapter, this.cryptoSymbols);
    // Multi-Symbol Phase 3 (2026-04-29): subscribe to all cryptoSymbols on '1m'.
    if (this.krakenAdapter.subscribeToCandles) {
      for (const symbol of this.cryptoSymbols) {
        this.krakenAdapter.subscribeToCandles(symbol, '1m');
        console.log(`[SessionRouter] Subscribed to ${symbol} 1m bars`);
      }
    }
    if (this.onOhlcCallback && this.krakenAdapter.on) this.krakenAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: crypto');
    this._kickHistoricalBackfill('crypto');
  }

  _activateStocks() {
    // FIX 2026-04-27: see _activateCrypto — same cold-boot stale-state fix.
    try {
      const fs = require('fs');
      const path = require('path');
      const candleFile = path.join(__dirname, '..', 'data', 'candle-history.json');
      if (fs.existsSync(candleFile)) fs.writeFileSync(candleFile, '[]');
    } catch (err) {
      console.warn('[SessionRouter] candle-history clear failed:', err.message);
    }

    this.activeSession = 'stocks';
    this.activeBroker = this.alpacaAdapter;
    if (this.orderRouter) this.orderRouter.registerBroker(this.alpacaAdapter, this.stockSymbols);
    // Multi-Symbol Phase 3 (2026-04-29): subscribe to ALL stockSymbols on '1m'.
    // Re-introduces multi-symbol subscribe — REVERSED the 2026-04-27 single-symbol
    // revert. The 4/27 phantom-position incident ($987k phantom on $10k account
    // from MARA/QQQ contaminating TSLA) was caused by symbol-agnostic
    // CandleProcessor (BTC-USD hardcode) routing every symbol's candle to one
    // priceHistory. That root cause is closed by Phase 1+2 (be83caf):
    //   - candleStore is per-(symbol, TF)
    //   - CandleAggregator is per-symbol
    //   - CandleProcessor's active-symbol guard ensures only the primary
    //     symbol's candles touch global priceHistory/IndicatorEngine until
    //     Phase 4's SymbolContext lands.
    if (this.alpacaAdapter.subscribeToCandles) {
      for (const symbol of this.stockSymbols) {
        this.alpacaAdapter.subscribeToCandles(symbol, '1m');
        console.log(`[SessionRouter] Subscribed to ${symbol} 1m bars`);
      }
    }
    if (this.onOhlcCallback && this.alpacaAdapter.on) this.alpacaAdapter.on('ohlc', this.onOhlcCallback);
    console.log('[SessionRouter] Initial activation: stocks');
    this._kickHistoricalBackfill('stocks');
  }

  /**
   * Trigger REST-fetch of historical candles for the active asset.
   *
   * Live/paper mode doesn't auto-fetch historical bars on boot — the
   * existing path only fires on dashboard 'request_historical' messages
   * (WebSocketManager.js:152). On a cold-boot stocks-active session, the
   * chart sat empty and the right-rail HUD showed 0.00 forever until the
   * user happened to switch timeframes.
   *
   * Fired after activation with a small delay so:
   *   1. dashboardWs has time to connect (we ship to all connected tabs)
   *   2. this.ctx.kraken has been pointed at the active broker by the
   *      cold-boot pickup at run-empire-v2.js:1112
   *
   * Both 1m + 15m so all chart-timeframe selections have data.
   */
  _kickHistoricalBackfill(session) {
    const ctx = this.ctx;
    if (!ctx) return;
    const symbol = session === 'stocks'
      ? (this.stockSymbols[0] || 'TSLA')
      : (this.cryptoSymbols[0] || 'BTC/USD');

    // Hot-swap the pattern bank to the active session's bucket so BTC
    // patterns don't land in unified-patterns.*.stocks.json (and vice
    // versa). The bucket was previously locked at boot via TRADING_PAIR
    // env — SessionRouter swaps brokers at runtime and the bank's
    // storagePath never moved. Trey 2026-04-28: "if we contaminated both
    // sets with the session router im going to be furious."
    try {
      const { getInstance } = require('./UnifiedPatternMemory');
      const memory = getInstance();
      if (memory && typeof memory.switchBucket === 'function') {
        memory.switchBucket(session);
      }
    } catch (e) {
      console.warn('[SessionRouter] pattern-bank swap failed:', e.message);
    }

    // STEP 1 — Warm priceHistory + IndicatorEngine from prior 200 candles
    // BEFORE the first live candle arrives. This is the fix for the
    // "9:30 ET swap → 65 candles missing → infinite gap-recovery loop"
    // bug other-Claude diagnosed 2026-04-28 morning. Without it, the
    // first live candle has no warm sequential predecessor and the gap
    // detector trips on cross-asset timestamps (BTC etime vs TSLA etime).
    setTimeout(async () => {
      try {
        if (typeof ctx.warmStateFromBroker === 'function') {
          await ctx.warmStateFromBroker(symbol, '15m', 200);
        }
      } catch (e) { console.warn('[SessionRouter] warm-load failed:', e.message); }
    }, 3000);

    // STEP 2 — Fetch + broadcast for the dashboard's chart history. These
    // populate the visible chart, separate from the bot's internal warm
    // buffer above.
    if (typeof ctx.fetchAndSendHistoricalCandles !== 'function') return;
    setTimeout(() => {
      try {
        ctx.fetchAndSendHistoricalCandles('1m', 500, symbol);
      } catch (e) { console.warn('[SessionRouter] historical 1m kick failed:', e.message); }
    }, 4000);
    setTimeout(() => {
      try {
        ctx.fetchAndSendHistoricalCandles('15m', 500, symbol);
      } catch (e) { console.warn('[SessionRouter] historical 15m kick failed:', e.message); }
    }, 5000);
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
