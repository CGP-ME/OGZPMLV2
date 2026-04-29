/**
 * CandleProcessor - Phase 19 Extraction + Gap Recovery
 *
 * Handles incoming market data from WebSocket.
 * Includes gap detection and REST API backfill recovery.
 *
 * Gap Recovery Flow:
 * 1. Gap detected (>1.5x candle interval)
 * 2. Attempt REST backfill via kraken.getHistoricalOHLC()
 * 3. Success: splice candles, replay through indicators, continue
 * 4. Fail: THEN halt, retry every 60s, resume after 3 clean candles
 *
 * @module core/CandleProcessor
 */

'use strict';

const { getInstance: getStateManager } = require('./StateManager');
const { get: getConfigValue } = require('../foundation/ConfigLoader');
const { normalizeOhlc } = require('../foundation/ohlc-normalize');
const stateManager = getStateManager();

// Candle accessors (V2 format)
const _o = (candle) => candle?.o ?? candle?.open ?? 0;
const _h = (candle) => candle?.h ?? candle?.high ?? 0;
const _l = (candle) => candle?.l ?? candle?.low ?? 0;
const _c = (candle) => candle?.c ?? candle?.close ?? 0;

class CandleProcessor {
  constructor(ctx) {
    this.ctx = ctx;

    // Gap recovery state.
    //
    // Multi-Symbol Phase 3 follow-up (Wolf Bug 2 fix, 2026-04-29): under
    // 1m-only subscriptions (Phase 3), the OLD 15m-interval gap detector
    // was mathematically dead — gap threshold 22.5 min vs typical 1m
    // arrival means real 1m gaps (broker pause, network blip) were SILENT.
    // The detector now fires on AGGREGATED candle emissions, not raw 1m
    // arrivals. _lastAggEmission Map tracks the last per-timeframe emission
    // time; if the active TF hasn't emitted within its expected interval *
    // gapThresholdMultiplier, the detector trips on the AGGREGATED layer
    // (the layer the strategies actually trade on).
    //
    // candleIntervalMs is preserved for attemptBackfill's missing-candle
    // count math, but gap DETECTION uses _lastAggEmission instead of
    // raw-1m timestamp deltas.
    this.candleIntervalMs = 60 * 1000; // 1 minute — matches 1m feed interval
    this.gapThresholdMultiplier = 1.5; // Gap if > 1.5x active TF interval (no emission)
    this.cleanCandleCount = 0;
    this.cleanCandlesRequired = 3;
    this.backfillRetryInterval = null;
    this.backfillRetryDelayMs = 60000; // 60 seconds
    // Per-(symbol, TF) last-emission MONOTONIC timestamps (ms since process
    // start, via process.hrtime.bigint). Mercury attack re-pass finding (1)
    // fix (2026-04-29): wall-clock Date.now() is vulnerable to OS clock
    // jumps (NTP corrections, VM suspend/resume) and would trip the gap
    // detector spuriously after a forward clock jump. Monotonic clock is
    // immune. Event-loop stalls are correctly-detected gaps (the bot was
    // unresponsive; data DID stop flowing) — not a false positive class.
    this._lastAggEmission = {};
    // Same monotonic basis for the throttle clock.
    this._lastGapCheckLog = 0;
    // Mercury attack finding (2) re-fix: gate the no-emission warning on
    // RAW 1m CANDLE COUNT for the active symbol, not on wall-clock uptime.
    // Counter-based invariant: "if we've seen N raw 1m candles but no
    // active-TF emission, the aggregator must be misconfigured." Restart-
    // independent within a session; crash-loop scenarios surface via PM2
    // logs, not via this warning.
    this._rawCandleCount = {};  // symbol → count
    this._loggedNoEmissionWarning = false;
    // BUG FIX 2026-04-28: latch gap-detection while retry is in flight.
    // Without this, every new live candle re-detects the same gap (the
    // pre-gap lastCandle pointer never advances until backfill succeeds),
    // re-halts trading, re-fires the safety-stop banner, infinite oscillation.
    this._gapRecoveryInProgress = false;
    // Mercury attack re-pass (B) fix 2026-04-29: permanent give-up latch
    // for partial-misconfig retry exhaustion. When the partial-misconfig
    // backfill path retries for 30 min and no aggregator emission lands
    // for the active TF, the config is genuinely wrong — replaying 1m
    // candles through a misconfigured aggregator will never produce the
    // missing TF. Setting this stops the outer infinite loop (handleMarket
    // Data → partial-misconfig → backfill → retry exhaustion → repeat).
    // Cleared automatically on any aggregator emission for that (symbol,
    // tf) — proof config is now correct, hot-reload self-heals — or on
    // venue swap via resetGapState().
    this._misconfigDetected = {};  // symbol → { tf → true }
    this._lastMisconfigErrorLog = 0;  // monotonic-ms throttle for repeat alarms

    console.log('[CandleProcessor] Initialized with gap recovery');
  }

  /**
   * Monotonic milliseconds since process start. Mercury attack re-pass
   * finding (1) fix (2026-04-29): all gap-detector timestamps use this
   * instead of Date.now() so OS clock jumps (NTP forward shifts, VM
   * suspend/resume) cannot spuriously trip the detector. Comparisons
   * across processes are not meaningful (different origins) but the
   * detector only ever compares timestamps recorded in this same
   * process lifetime, so that constraint is harmless.
   */
  _monoMs() {
    return Number(process.hrtime.bigint() / 1_000_000n);
  }

  /**
   * Process a candle - ONE CANONICAL PATH
   * Phase 5 REWRITE: Handles both new candles AND updates to existing candles
   * Used by live feed, backfill replay, and intra-candle updates
   * @param {Object} candle - Candle in V2 format { o, h, l, c, v, t, etime }
   * @returns {boolean} true if new candle, false if update to existing
   */
  processNewCandle(candle) {
    // Multi-Symbol Phase 1+2+3+4 (2026-04-29): symbol-routed candle pipeline.
    // candle.symbol now reliably set by normalizeOhlc → handleMarketData.
    // Fallback chain handles backfill / synthetic / non-broker paths.
    const symbol = candle.symbol || this.ctx.activeSymbol || this.ctx.tradingPair || 'UNKNOWN';

    // Resolve the ACTIVE trading symbol — Phase 6 will replace this with a
    // multi-symbol scanner; until then, only the active symbol drives
    // analyzeAndTrade + the legacy global priceHistory pointer (used by
    // the dashboard payload + unmigrated readers).
    let activeSymbol;
    const sr = this.ctx.sessionRouter;
    if (sr && sr.enabled) {
      activeSymbol = sr.activeSession === 'stocks'
        ? (sr.stockSymbols?.[0] || 'TSLA')
        : (sr.cryptoSymbols?.[0] || 'BTC/USD');
    } else {
      activeSymbol = this.ctx.tradingPair || 'UNKNOWN';
    }
    const isActive = (symbol === activeSymbol);

    // ALWAYS write 1m to candleStore + feed aggregator (per-symbol).
    this.ctx._candleStore.addCandle(symbol, '1m', candle);

    // Mercury attack re-pass (2) re-fix: track raw 1m candle count per symbol
    // for the no-emission-yet config-sanity warning in handleMarketData. Counts
    // ALL 1m candles (active or not), so even non-active symbols' counts grow
    // and Phase 6 scanner inherits the same defense without further plumbing.
    this._rawCandleCount[symbol] = (this._rawCandleCount[symbol] || 0) + 1;

    let completedCandles = [];
    if (this.ctx.candleAggregator) {
      completedCandles = this.ctx.candleAggregator.ingest(symbol, candle);
      for (const { timeframe, candle: aggCandle } of completedCandles) {
        this.ctx._candleStore.addCandle(symbol, timeframe, aggCandle);
        // mtfAdapter is still single-symbol internally; only feed for active.
        if (isActive && this.ctx.mtfAdapter) {
          this.ctx.mtfAdapter.ingestCandle(aggCandle, timeframe);
        }
        // Wolf Bug 2 fix (2026-04-29): track last per-(symbol, TF) emission
        // monotonic-ms (Mercury attack re-pass (1) fix — not wall-clock,
        // immune to OS clock jumps). Gap detector reads this for the active
        // symbol's active timeframe. Updated for ALL symbols so Phase 6
        // scanner can per-symbol gap-check too without further plumbing.
        if (!this._lastAggEmission[symbol]) this._lastAggEmission[symbol] = {};
        this._lastAggEmission[symbol][timeframe] = this._monoMs();
        // Mercury attack re-pass (B) fix 2026-04-29: emission proves the
        // aggregator IS configured for this (symbol, tf). If a misconfig
        // latch was set (operator hot-fixed config, restart not required),
        // clear it silently — recoveries don't deserve the alarm channel.
        if (this._misconfigDetected[symbol]?.[timeframe]) {
          this._misconfigDetected[symbol][timeframe] = false;
        }
      }
    }

    // Phase 4: route to per-symbol SymbolContext. Each context owns its own
    // priceHistory + IndicatorEngine + RegimeDetector. ALL symbols get their
    // own context — no cross-contamination. Phase 6 scanner will iterate
    // these contexts to pick the best setup across the universe.
    let symbolCtx = null;
    let isNew = false;
    if (typeof this.ctx.getSymbolContext === 'function') {
      symbolCtx = this.ctx.getSymbolContext(symbol);
      isNew = symbolCtx.ingestCandle(candle);
    }

    // Active-symbol-only legacy bridges. The global `this.ctx.priceHistory`
    // and `this.ctx.indicatorEngine` (module-level singleton) are kept as
    // pointers/aliases for unmigrated consumers (dashboard payload, backtest
    // runner, warmStateFromBroker). All WRITES go through SymbolContext;
    // these aliases just expose the active symbol's data to legacy readers.
    if (!isActive) {
      // Non-active symbols: data collected into candleStore + symbolCtx,
      // ready for Phase 6 scanner. No legacy-global updates, no trigger.
      return isNew;
    }

    // Sync the legacy global priceHistory pointer to the active symbol's
    // context. NOT a wrapper — same array reference.
    if (symbolCtx && this.ctx.priceHistory !== symbolCtx.priceHistory) {
      this.ctx.priceHistory = symbolCtx.priceHistory;
    }

    // Sync the legacy global indicatorEngine pointer to the active symbol's
    // context. Same reasoning — backwards-compat for unmigrated readers.
    if (symbolCtx && this.ctx.indicatorEngine !== symbolCtx.indicatorEngine) {
      this.ctx.indicatorEngine = symbolCtx.indicatorEngine;
    }

    // Strategy modules still operate on the global single-symbol view.
    // Phase 6 will move them into per-symbol-per-tf evaluation. Until then,
    // they read from the active symbol's priceHistory (now synced above).
    if (isNew) {
      if (this.ctx.mtfAdapter) this.ctx.mtfAdapter.ingestCandle(candle);
      if (this.ctx.emaCrossover) this.ctx.emaCrossoverSignal = this.ctx.emaCrossover.update(candle, this.ctx.priceHistory);
      if (this.ctx.maDynamicSR) this.ctx.maDynamicSRSignal = this.ctx.maDynamicSR.update(candle, this.ctx.priceHistory);
      if (this.ctx.breakAndRetest) this.ctx.breakRetestSignal = this.ctx.breakAndRetest.update(candle, this.ctx.priceHistory);
      if (this.ctx.liquiditySweep) this.ctx.liquiditySweepSignal = this.ctx.liquiditySweep.feedCandle(candle);
      if (this.ctx.volumeProfile) this.ctx.volumeProfile.update(candle, this.ctx.priceHistory);

      // Phase 3 trigger relocation: analyzeAndTrade fires on the active
      // symbol's aggregator HTF emission (was broker's native 15m frame).
      const activeTf = this.ctx.timeframeSelector?.currentTimeframe || '15m';
      const triggerEmission = completedCandles.find(e => e.timeframe === activeTf);
      if (triggerEmission && typeof this.ctx.analyzeAndTrade === 'function') {
        console.log(`V2: ${activeTf} candle closed (aggregator-emitted) for ${symbol} — running trading analysis`);
        this.ctx.analyzeAndTrade().catch(e =>
          console.error('[CANDLE-CLOSE] Trading cycle error:', e.message)
        );
      }
    }

    // Warmup log (only first 20 candles)
    if (this.ctx.priceHistory.length <= 20) {
      const candleTime = new Date(candle.t).toLocaleTimeString();
      console.log(`✅ Candle #${this.ctx.priceHistory.length}/15 [${candleTime}]`);
    }

    // Trim history to 250
    if (this.ctx.priceHistory.length > 250) {
      this.ctx.priceHistory = this.ctx.priceHistory.slice(-250);
    }

    // Save counter
    this.ctx.candleSaveCounter++;
    if (this.ctx.candleSaveCounter >= 5) {
      this.ctx.saveCandleHistory();
      this.ctx.candleSaveCounter = 0;
    }

    return true; // Was new candle
  }

  /**
   * Attempt to backfill missing candles via REST API.
   *
   * Broker-agnostic: calls the canonical IBrokerAdapter.getCandles()
   * method (defined at foundation/IBrokerAdapter.js:187), which every
   * adapter past and future implements per their own API. The legacy
   * variable name `this.ctx.kraken` is preserved — it holds whichever
   * broker adapter BrokerFactory returned (Alpaca on stocks mode,
   * Kraken on crypto mode, future adapters on their asset classes).
   *
   * Symbol + timeframe come from config, NOT hardcoded. Returned
   * candles go through the OHLC normalizer so any broker's native
   * shape (Kraken arrays, Alpaca objects, etc.) converges to the
   * canonical 9-element array the rest of the pipeline expects.
   *
   * @param {number} gapStart - Start timestamp of gap (ms)
   * @param {number} gapEnd - End timestamp of gap (ms)
   * @returns {Array} Backfilled candles or empty array on failure
   */
  async attemptBackfill(gapStart, gapEnd) {
    try {
      const broker = this.ctx.kraken;  // Variable name legacy — holds active adapter
      if (!broker || typeof broker.getCandles !== 'function') {
        console.error('[GAP-RECOVERY] Active broker does not support getCandles() — adapter misconfigured');
        return [];
      }

      // Resolve symbol + timeframe from context / env / fallback chain.
      // Prefer runtime config, then the ALPACA_SYMBOLS env var (first
      // symbol for single-instrument mode), then a safe default.
      const resolvedConfig = this.ctx.resolvedConfig || this.ctx.config;
      const symbol = resolvedConfig?.config?.broker?.tradingPair
                     || (process.env.ALPACA_SYMBOLS || '').split(',')[0].trim()
                     || 'TSLA';
      const timeframe = resolvedConfig?.config?.broker?.candleTimeframe || '1m';

      // Calculate how many candles we need
      const missingCount = Math.ceil((gapEnd - gapStart) / this.candleIntervalMs);
      const fetchCount = missingCount + 5; // Small buffer

      console.log(`[GAP-RECOVERY] Fetching ${fetchCount} ${timeframe} candles of ${symbol} to fill ${missingCount} missing`);

      const rawCandles = await broker.getCandles(symbol, timeframe, fetchCount);

      if (!rawCandles || rawCandles.length === 0) {
        console.error('[GAP-RECOVERY] REST API returned no candles');
        return [];
      }

      // Normalize every returned candle through the shared shape-translator
      // so both Kraken-array format and Alpaca-object format converge to
      // the canonical 9-element array before filtering / sorting / replay.
      const normalized = rawCandles
        .map(c => normalizeOhlc(c))
        .filter(Boolean);

      if (!normalized.length) {
        console.error(`[GAP-RECOVERY] All ${rawCandles.length} candles failed normalization`);
        return [];
      }

      // Filter to only candles within the gap. Canonical array positions:
      // [0]=time(ms), [1]=etime, [2]=o, [3]=h, [4]=l, [5]=c, [6]=vwap, [7]=v, [8]=count
      // etime not always set (e.g., Alpaca normalized); fall back to [0].
      const gapCandles = normalized.filter(arr => {
        const et = arr[1] != null ? arr[1] : arr[0];
        return et > gapStart && et <= gapEnd;
      });

      // Sort chronologically by start-time [0] (oldest first — critical
      // for indicator replay which expects monotonic time)
      gapCandles.sort((a, b) => a[0] - b[0]);

      return gapCandles;

    } catch (error) {
      console.error(`[GAP-RECOVERY] Backfill failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Start retry loop for failed backfill
   * @param {number} gapStart - Start timestamp
   * @param {number} gapEnd - End timestamp
   * @param {{symbol: string, tf: string}} [misconfigKey] - if set, retry was
   *   triggered from the partial-misconfig branch (aggregator never emitted
   *   for active TF despite raw 1m candles flowing). On timeout, this writes
   *   _misconfigDetected[symbol][tf]=true so the outer handleMarketData loop
   *   stops re-firing the same recovery path forever. Cleared on next
   *   aggregator emission for that key (self-heal) or venue swap.
   */
  startBackfillRetry(gapStart, gapEnd, misconfigKey = null) {
    if (this.backfillRetryInterval) return; // Already retrying

    // Mercury attack finding (3) fix: bound retry duration. Without this,
    // a permanent broker-down condition leaves _gapRecoveryInProgress=true
    // FOREVER (latch only cleared on success path), blocking ALL future
    // gap detection until the bot restarts. Cap retries to 30 minutes
    // — long enough to ride out transient outages, short enough that a
    // permanent failure doesn't permanently disable gap defense.
    const RETRY_MAX_DURATION_MS = 30 * 60 * 1000;  // 30 minutes
    const retryStartedAt = Date.now();

    console.log(`[GAP-RECOVERY] Starting retry loop (every ${this.backfillRetryDelayMs/1000}s, max ${RETRY_MAX_DURATION_MS/60000}min)`);

    this.backfillRetryInterval = setInterval(async () => {
      const elapsedMs = Date.now() - retryStartedAt;

      // Timeout: declare permanent failure, clear latch, halt retries.
      if (elapsedMs >= RETRY_MAX_DURATION_MS) {
        console.error(`[GAP-RECOVERY] Retry budget exhausted (${RETRY_MAX_DURATION_MS/60000}min). Halting retries; gap-detection re-enabled. Manual intervention may be required.`);
        // Mercury attack re-pass (B) fix: if this retry was triggered from
        // the partial-misconfig branch, the failure proves the aggregator
        // is wrong for (symbol, tf). Set the permanent latch so the outer
        // handleMarketData loop stops re-firing the same recovery on every
        // subsequent 1m candle. Self-heals on next aggregator emission for
        // this key (e.g., operator hot-fixes config) or on venue swap.
        if (misconfigKey) {
          if (!this._misconfigDetected[misconfigKey.symbol]) {
            this._misconfigDetected[misconfigKey.symbol] = {};
          }
          this._misconfigDetected[misconfigKey.symbol][misconfigKey.tf] = true;
          console.error(`[GAP-RECOVERY] FATAL MISCONFIG: aggregator never emitted ${misconfigKey.tf} for ${misconfigKey.symbol} after 30min of retries. Verify CandleAggregator targetTimeframes in config. Auto-recovery suspended for this (symbol, tf) until next emission lands or venue swap.`);
        }
        this.stopBackfillRetry();
        this._gapRecoveryInProgress = false;  // CRITICAL — re-enable detection
        return;
      }

      console.log(`[GAP-RECOVERY] Retry attempt (elapsed ${Math.round(elapsedMs/60000)}m / ${RETRY_MAX_DURATION_MS/60000}m budget)...`);

      const candles = await this.attemptBackfill(gapStart, gapEnd);

      if (candles.length > 0) {
        console.log(`[GAP-RECOVERY] Retry succeeded: ${candles.length} candles`);
        this.handleBackfillSuccess(candles);
        this.stopBackfillRetry();
        // Release the gap-detection latch so future, distinct gaps can be
        // detected. Same-gap re-detection is already prevented by
        // handleBackfillSuccess advancing the lastCandle pointer.
        this._gapRecoveryInProgress = false;
      }
    }, this.backfillRetryDelayMs);
  }

  /**
   * Stop the retry loop AND clear the gap-recovery latch.
   *
   * Mercury attack re-pass finding (3) fix (2026-04-29): make this method
   * safe to call from any code path. Previously the latch was only cleared
   * in startBackfillRetry's success / timeout branches; if any other path
   * (manual pause, shutdown, future maintenance handler) called
   * stopBackfillRetry directly, the latch would stick true forever and
   * block all future gap detection. Coupling the latch reset here makes
   * the method idempotent and defensive.
   */
  stopBackfillRetry() {
    if (this.backfillRetryInterval) {
      clearInterval(this.backfillRetryInterval);
      this.backfillRetryInterval = null;
    }
    this._gapRecoveryInProgress = false;
  }

  /**
   * Mercury attack finding (5) fix (2026-04-29): clear gap-detector state
   * on session transitions. Called by SessionRouter on crypto<->stocks swap
   * (alongside candleAggregator.resetAll and symbolContexts.clear). Without
   * this, _lastAggEmission carries stale per-symbol entries from the prior
   * venue — when SessionRouter switches activeSession, the gap detector
   * may read either the wrong symbol's lastEmitMs (false positive) or
   * find no entry for the new symbol (silent miss until first new
   * emission). Wiping state on swap matches the rest of the swap-time
   * cleanup contract.
   */
  resetGapState() {
    this._lastAggEmission = {};
    this._lastGapCheckLog = 0;
    this._gapRecoveryInProgress = false;
    this._rawCandleCount = {};
    this._loggedNoEmissionWarning = false;
    // Mercury attack re-pass (B) fix 2026-04-29: clear misconfig latches
    // on venue swap. Even if the previous venue had a permanent latch set,
    // the new venue may have correct config — give it a fresh chance.
    this._misconfigDetected = {};
    this._lastMisconfigErrorLog = 0;
    this.stopBackfillRetry();
    this.cleanCandleCount = 0;
    console.log('[CandleProcessor] gap-detector state reset (session swap)');
  }

  /**
   * Handle successful backfill - process through canonical path.
   *
   * Inputs are canonical 9-element arrays from the normalizer:
   *   [time(ms), etime(ms), open, high, low, close, vwap, volume, count]
   *
   * processNewCandle() expects object form { t, etime, o, h, l, c, v }.
   * Convert here so the canonical array semantics stay inside the
   * backfill pipeline and processNewCandle's call sites don't need to
   * learn about arrays.
   *
   * @param {Array<Array>} candles - Normalized canonical arrays (sorted)
   */
  handleBackfillSuccess(candles) {
    console.log(`[GAP-RECOVERY] Processing ${candles.length} backfilled candles`);

    // One canonical path - dedupe + insert + indicators all in one
    candles.forEach(arr => {
      // Normalizer output: [t(ms), etime(ms), o, h, l, c, vwap, v, count]
      // Fall back to t if etime missing (Alpaca single-timestamp case).
      const candle = {
        t: arr[0],
        etime: arr[1] != null ? arr[1] : arr[0],
        o: arr[2],
        h: arr[3],
        l: arr[4],
        c: arr[5],
        v: arr[7] != null ? arr[7] : 0,
      };
      this.processNewCandle(candle);
    });

    console.log(`[GAP-RECOVERY] Backfilled ${candles.length} candles via REST`);
  }

  /**
   * Handle incoming market data from WebSocket
   * Kraken OHLC format: [channelID, [time, etime, open, high, low, close, vwap, volume, count], channelName, pair]
   */
  handleMarketData(ohlcData) {

    // OHLC data is array: [time, etime, open, high, low, close, vwap, volume, count]
    if (!Array.isArray(ohlcData) || ohlcData.length < 8) {
      console.warn('⚠️ Invalid OHLC data format:', ohlcData);
      return;
    }

    const [time, etime, open, high, low, close, vwap, volume, count] = ohlcData;

    // CHANGE 2026-01-16: Track when we last received ANY data (for liveness watchdog)
    this.ctx.lastDataReceived = Date.now();

    // STALE DATA DETECTION: Check if DATA ITSELF is old (not arrival time)
    // FIX BACKTEST_001: Skip stale check in backtest mode - historical data is intentionally old
    const isBacktesting = getConfigValue('mode.backtest') || this.ctx.config?.enableBacktestMode;
    const now = Date.now();
    const dataAge = now - (etime * 1000); // etime is in SECONDS, convert to milliseconds

    // If data is more than 2 minutes old, it's stale (but NOT during backtesting!)
    if (dataAge > 120000 && !isBacktesting) {
      console.error('🚨 STALE DATA:', Math.round(dataAge / 1000), 'seconds old');

      // AUTO-PAUSE TRADING
      if (!this.ctx.staleFeedPaused) {
        console.error('⏸️ PAUSING NEW ENTRIES DUE TO STALE DATA');
        this.ctx.staleFeedPaused = true;

        // Notify StateManager to pause
        try {
          stateManager.pauseTrading(`Stale data: ${Math.round(dataAge / 1000)}s old`);
        } catch (error) {
          console.error('Failed to pause via StateManager:', error.message);
        }
      }
    } else if (this.ctx.staleFeedPaused && dataAge < 30000) {
      // Data is fresh again - resume
      console.log('✅ Fresh data restored, resuming');
      this.ctx.staleFeedPaused = false;
      this.ctx.feedRecoveryCandles = 0;
      stateManager.resumeTrading();
    }

    let price = parseFloat(close);
    if (!price || isNaN(price)) return;

    // Build proper OHLCV candle structure from Kraken OHLC stream
    const candle = {
      o: parseFloat(open),
      h: parseFloat(high),
      l: parseFloat(low),
      c: parseFloat(close),
      v: parseFloat(volume),
      t: parseFloat(time) * 1000,  // Actual timestamp for display
      etime: parseFloat(etime) * 1000,  // End time for deduplication
      // Multi-Symbol Phase 3 Bug 1 plumbing (2026-04-29): symbol propagates
      // from normalizeOhlc's preserved array property → candle object → the
      // per-symbol routing in processNewCandle. Without this, candle.symbol
      // would be undefined and routing falls through to global tradingPair
      // (the silent-contamination bug Wolf caught).
      symbol: ohlcData.symbol || null,
    };

    // Phase 5 REWRITE: ONE CANONICAL PATH - always call processNewCandle
    // processNewCandle now handles both updates (same etime) and new candles
    const lastCandle = this.ctx.priceHistory[this.ctx.priceHistory.length - 1];
    const isNewCandle = !lastCandle || lastCandle.etime !== candle.etime;

    // ONE CANONICAL PATH - all candles (new and updates) go through processNewCandle.
    // processNewCandle is also where _lastAggEmission gets updated when the
    // aggregator emits HTF candles — needed by the gap detector below.
    this.processNewCandle(candle);

    // Multi-Symbol Phase 3 follow-up — Wolf Bug 2 fix (2026-04-29):
    // GAP DETECTION on the AGGREGATED layer, not raw 1m. The OLD block
    // here compared raw 1m candle.etime deltas against a 15m * 1.5
    // threshold. With Phase 3's '1m'-only subscriptions, that threshold
    // (22.5 min) was unreachable for normal 1m gaps — silent failure.
    //
    // New layer: track wall-clock time of last aggregator emission per
    // (symbol, timeframe). If the active symbol's active TF (typically
    // 15m) hasn't emitted within tfIntervalMs * 1.5, trip the detector.
    // This catches "1m feed silently slowed" without spurious triggers
    // on quiet-market 1m delays.
    if (isNewCandle && !isBacktesting && !this._gapRecoveryInProgress) {
      // Resolve active symbol + TF (mirrors processNewCandle's logic).
      let activeSymbol;
      const sr = this.ctx.sessionRouter;
      if (sr && sr.enabled) {
        activeSymbol = sr.activeSession === 'stocks'
          ? (sr.stockSymbols?.[0] || 'TSLA')
          : (sr.cryptoSymbols?.[0] || 'BTC/USD');
      } else {
        activeSymbol = this.ctx.tradingPair || 'UNKNOWN';
      }
      const activeTf = this.ctx.timeframeSelector?.currentTimeframe || '15m';
      const TF_MS = { '1m':60000, '5m':300000, '15m':900000, '30m':1800000, '1h':3600000, '4h':14400000, '1d':86400000 };
      const tfIntervalMs = TF_MS[activeTf] || 900000;

      const lastEmitMs = this._lastAggEmission?.[activeSymbol]?.[activeTf] || 0;
      // Mercury attack re-pass finding (2) re-fix (2026-04-29): gate the
      // no-emission warning on RAW 1m CANDLE COUNT for the active symbol,
      // not on wall-clock uptime. Counter-based invariant is restart-
      // independent within a session — "if we've seen N candles but no
      // active-TF emission, the aggregator must be misconfigured."
      // Threshold of 30 candles = 30 minutes of 1m feed at 1-per-minute,
      // which is 2x a typical 15m emission cycle.
      //
      // Mercury attack re-pass finding (1) RE-FIX (Wolf 2026-04-29 deep
      // read): the original `if (lastEmitMs > 0)` guard left a 30-minute
      // BLIND WINDOW for partial-misconfig aggregator (emits 5m+30m but
      // not 15m). During that window, gap detection is silent for the
      // active TF. Fix: when rawCount >= threshold AND no emission, ALSO
      // trigger backfill (not just warn). Past 30 candles is conclusive
      // evidence of misconfig OR multi-symbol-blind state — the bot needs
      // backfill regardless of which.
      const NO_EMISSION_RAW_THRESHOLD = 30;
      if (lastEmitMs === 0) {
        const rawCount = this._rawCandleCount?.[activeSymbol] || 0;
        if (rawCount >= NO_EMISSION_RAW_THRESHOLD) {
          // Mercury attack re-pass (B) fix 2026-04-29: if a prior misconfig
          // retry exhausted the 30min budget for this (symbol, tf), don't
          // re-fire backfill on every subsequent 1m candle (infinite outer
          // loop). Just rate-limit-error-log and skip. Latch clears auto
          // when an aggregator emission lands for this key (proof config
          // is fixed) or on venue swap via resetGapState().
          const MISCONFIG_LOG_THROTTLE_MS = 10 * 60 * 1000;  // 10min
          if (this._misconfigDetected[activeSymbol]?.[activeTf]) {
            const nowMono = this._monoMs();
            if (nowMono - this._lastMisconfigErrorLog > MISCONFIG_LOG_THROTTLE_MS) {
              console.error(`[GAP-RECOVERY] MISCONFIG LATCHED for ${activeSymbol}/${activeTf} — aggregator still not emitting active TF. Auto-recovery suspended. Fix CandleAggregator targetTimeframes (hot-reload OK) or restart bot. Latch clears on next emission or venue swap.`);
              this._lastMisconfigErrorLog = nowMono;
            }
            return;  // skip both branches; misconfig is operator-fix
          }
          if (!this._loggedNoEmissionWarning) {
            console.warn(`[GAP-RECOVERY] No ${activeTf} emission for ${activeSymbol} after ${rawCount} raw 1m candles — verify CandleAggregator targetTimeframes includes ${activeTf}. Triggering backfill.`);
            this._loggedNoEmissionWarning = true;
          }
          // Fix (1): also trip backfill for partial-misconfig case.
          // Same path as the gap-detected branch below; we just don't
          // have a lastEmitMs to derive gapStart from, so window is
          // estimated from rawCount * 60_000 (1 candle per minute).
          this._gapRecoveryInProgress = true;
          const gapEnd = Date.now();
          const gapStart = gapEnd - (rawCount * 60 * 1000);
          const misconfigKey = { symbol: activeSymbol, tf: activeTf };
          this.attemptBackfill(gapStart, gapEnd).then(backfilledCandles => {
            if (backfilledCandles.length > 0) {
              this.handleBackfillSuccess(backfilledCandles);
              // Mercury Round-2 Attack F re-fix 2026-04-29: in the actual
              // misconfig case (aggregator targetTimeframes excludes
              // activeTf), backfill always returns 1m candles from broker
              // — replay through aggregator never emits activeTf, so
              // _lastAggEmission stays 0. The retry-budget timeout latch
              // is unreachable here because backfill keeps "succeeding."
              // Detect misconfig at success time: if replay didn't produce
              // any aggregator emission for active TF, set the latch now.
              const stillNoEmission = !(this._lastAggEmission[activeSymbol]?.[activeTf]);
              if (stillNoEmission) {
                if (!this._misconfigDetected[activeSymbol]) {
                  this._misconfigDetected[activeSymbol] = {};
                }
                this._misconfigDetected[activeSymbol][activeTf] = true;
                console.error(`[GAP-RECOVERY] FATAL MISCONFIG: backfill succeeded but aggregator did not emit ${activeTf} for ${activeSymbol}. Verify CandleAggregator targetTimeframes. Auto-recovery suspended for this (symbol, tf) until next emission lands or venue swap.`);
              }
              this.cleanCandleCount = 0;
              this._gapRecoveryInProgress = false;
            } else {
              console.warn(`[GAP-RECOVERY] Misconfig backfill failed; retry loop every ${this.backfillRetryDelayMs/1000}s.`);
              this.startBackfillRetry(gapStart, gapEnd, misconfigKey);
            }
          });
          return;  // skip the normal lastEmitMs > 0 branch
        }
      }
      // Only check after we've HAD at least one emission. Fresh-start
      // (no emissions yet) is not a gap, just warmup.
      if (lastEmitMs > 0) {
        // Mercury attack re-pass finding (1) re-fix: monotonic clock for
        // staleness math. Date.now() was vulnerable to OS clock jumps.
        const stalenessMs = this._monoMs() - lastEmitMs;
        // Mercury attack finding (1) fix: minimum threshold floor of 5 minutes
        // regardless of TF. With activeTf='1m' the raw threshold is 90s, which
        // trips on every 2-min normal-market pause. The floor protects short-
        // TF configs from spurious triggers without weakening long-TF defense.
        const MIN_GAP_THRESHOLD_MS = 5 * 60 * 1000;  // 5 min
        const gapThreshold = Math.max(
          tfIntervalMs * this.gapThresholdMultiplier,
          MIN_GAP_THRESHOLD_MS
        );
        if (stalenessMs > gapThreshold) {
          // Throttle log: at most one warn per active-TF interval (monotonic).
          if (this._monoMs() - this._lastGapCheckLog > tfIntervalMs) {
            console.warn(`[GAP-RECOVERY] No ${activeTf} emission for ${activeSymbol} in ${Math.round(stalenessMs/60000)}m (threshold ${Math.round(gapThreshold/60000)}m) — triggering backfill`);
            this._lastGapCheckLog = this._monoMs();
          }
          this._gapRecoveryInProgress = true;

          // Backfill window endpoints in WALL-CLOCK ms (the broker REST API
          // expects wall-clock timestamps). Derive gapStart from current
          // wall-clock minus stalenessMs (monotonic delta is reliable, then
          // applied as offset against current wall clock for the API call).
          const gapEnd = Date.now();
          const gapStart = gapEnd - stalenessMs;
          this.attemptBackfill(gapStart, gapEnd).then(backfilledCandles => {
            if (backfilledCandles.length > 0) {
              this.handleBackfillSuccess(backfilledCandles);
              this.cleanCandleCount = 0;
              this._gapRecoveryInProgress = false;
            } else {
              console.warn(`[GAP-RECOVERY] Backfill failed; retry loop every ${this.backfillRetryDelayMs/1000}s. Trading remains active.`);
              this.startBackfillRetry(gapStart, gapEnd);
            }
          });
        }
      }
    }

    // Track clean candles for recovery after gap
    if (isNewCandle && this.ctx.staleFeedPaused && this.backfillRetryInterval) {
      this.cleanCandleCount++;
      if (this.cleanCandleCount >= this.cleanCandlesRequired) {
        console.log(`✅ [GAP-RECOVERY] ${this.cleanCandleCount} clean candles - resuming trading`);
        this.ctx.staleFeedPaused = false;
        this.cleanCandleCount = 0;
        this.stopBackfillRetry();
        stateManager.resumeTrading();
      }
    }

    // Store latest market data
    this.ctx.marketData = {
      price,
      timestamp: parseFloat(time) * 1000,  // Use candle's actual timestamp
      systemTime: Date.now(),  // Keep system time separately if needed
      volume: parseFloat(volume) || 0,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low)
    };

    // CHANGE 663: Broadcast market data to dashboard
    // BACKTEST_FAST: Skip dashboard broadcast entirely
    if (!getConfigValue('backtest.fast') && this.ctx.dashboardWsConnected && this.ctx.dashboardWs) {
      try {
        // CHANGE 2025-12-23: Use IndicatorEngine render packet for dashboard
        const renderPacket = this.ctx.indicatorEngine.getRenderPacket({ maxPoints: 200 });

        // CHANGE 2026-01-23: Calculate performance stats for dashboard
        // BUGFIX 2026-01-23: Include position value in P&L calculation!
        // FIX 2026-04-27: Broadcast equity (initialBalance + realizedPnL + unrealizedPnL),
        // not state.balance (free-cash sentinel that doesn't move post FIX 2026-03-28).
        // Resolves the dashboard $298 vs Alpaca-account-equity display mismatch.
        const currentEquity = stateManager.getEquity(price);
        const currentPosition = stateManager.get('position') || 0;
        const positionValue = currentPosition * price;  // Current market value of position
        const totalAccountValue = currentEquity;  // FIX 2026-04-27: equity already includes unrealized; was free-cash + position duplicate-count
        // FIX 2026-02-26: Use StateManager instead of hardcoded value
        const initialBalance = stateManager.get('initialBalance') || getConfigValue('backtest.initialBalance') || 10000;
        const totalPnL = totalAccountValue - initialBalance;  // Correct: includes open position
        // Phase 4 REWRITE: executionLayer deleted - use stateManager for trade stats
        const closedTrades = stateManager.get('closedTrades') || [];
        const winningTrades = closedTrades.filter(t => t.pnl > 0).length;
        const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

        // FIX 2026-04-27: include `symbol` so the dashboard's live-tick
        // consumers (asset-tf-card on the left rail) auto-flip on
        // SessionRouter swaps without waiting for historical_candles.
        // Resolution priority matches fetchAndSendHistoricalCandles:
        //   1. SessionRouter active session primary symbol (when enabled)
        //   2. assetManager activeAsset (legacy single-broker)
        //   3. config tradingPair (last resort)
        let activeSymbol;
        const sr = this.ctx.sessionRouter;
        if (sr && sr.enabled && sr.activeSession) {
          activeSymbol = sr.activeSession === 'stocks'
            ? (sr.stockSymbols?.[0] || 'TSLA')
            : (sr.cryptoSymbols?.[0] || 'BTC/USD');
        } else if (this.ctx.assetManager) {
          activeSymbol = this.ctx.assetManager.toSlashFormat(
            this.ctx.assetManager.activeAsset
          );
        } else {
          activeSymbol = this.ctx.tradingPair || 'BTC/USD';
        }

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'price',  // CHANGE 2025-12-11: Match frontend expected message type
          data: {
            symbol: activeSymbol,
            price: price,
            candle: {
              open: parseFloat(open),
              high: parseFloat(high),
              low: parseFloat(low),
              close: price,
              volume: parseFloat(volume),
              timestamp: Date.now()
            },
            indicators: renderPacket.indicators,  // Use IndicatorEngine output
            // Multi-Symbol Phase 2 (2026-04-29): repointed from
            // ctx.getCandlesForTimeframe (killed) → candleStore as single
            // source of truth. Symbol is the resolved active symbol above.
            candles: this.ctx._candleStore.getCandles(activeSymbol, this.ctx.dashboardTimeframe).slice(-50),
            timeframe: this.ctx.dashboardTimeframe,  // Tell dashboard what timeframe this is
            overlays: renderPacket.overlays,  // FIX: Should be 'overlays' not 'series'!
            equity: currentEquity,  // FIX 2026-04-27: renamed from 'balance' — now broadcasts equity (initialBalance + realized + unrealized PnL)
            position: stateManager.get('position'),
            totalTrades: stateManager.get('totalTrades') || closedTrades.length,
            // CHANGE 2026-01-23: Include performance stats
            totalPnL: totalPnL,
            winRate: winRate
          }
        }));

        // Broadcast edge analytics data
        this.ctx.broadcastEdgeAnalytics(price, parseFloat(volume), candle);
      } catch (error) {
        // Fail silently - don't let dashboard issues affect trading
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  cleanup() {
    this.stopBackfillRetry();
  }
}

module.exports = CandleProcessor;
