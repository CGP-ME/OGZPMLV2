/**
 * CandleProcessor - Phase 19 Extraction + Gap Recovery
 *
 * Handles incoming market data from WebSocket.
 * Includes gap detection and REST API backfill recovery.
 *
 * Gap Recovery Flow:
 * 1. Gap detected using ConfigLoader dataFeed threshold
 * 2. Attempt REST backfill through the broker adapter
 * 3. Success: splice candles, replay through indicators, continue
 * 4. Fail: halt and recover using ConfigLoader dataFeed retry settings
 *
 * @module core/CandleProcessor
 */

'use strict';

const { getInstance: getStateManager } = require('./StateManager');
const { get: getConfigValue } = require('../foundation/ConfigLoader');
const { normalizeOhlc, toTimestampMs } = require('../foundation/ohlc-normalize');
const { getInstance: getMarketCalendar } = require('../foundation/MarketCalendar');
const { emitTrace } = require('./TraceSpine');
const stateManager = getStateManager();

// Candle accessors (V2 format)
const _o = (candle) => candle?.o ?? candle?.open ?? 0;
const _h = (candle) => candle?.h ?? candle?.high ?? 0;
const _l = (candle) => candle?.l ?? candle?.low ?? 0;
const _c = (candle) => candle?.c ?? candle?.close ?? 0;

function normalizeCandleSymbol(symbol) {
  if (typeof symbol !== 'string' || !symbol.trim()) return null;
  let normalized = symbol.trim().toUpperCase().replace('XBT', 'BTC').split('/').join('-');
  if (!normalized.includes('-') && normalized.endsWith('USD') && normalized.length === 6) {
    normalized = `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }
  return normalized;
}

function looksLikeStockSymbol(symbol) {
  return typeof symbol === 'string' && /^[A-Z]{1,5}$/.test(symbol);
}

function looksLikeUsdCryptoSymbol(symbol) {
  return typeof symbol === 'string' && /^[A-Z0-9]+-USD$/.test(symbol);
}

function stockBaseSymbol(symbol) {
  const normalized = normalizeCandleSymbol(symbol);
  if (!normalized) return null;
  return normalized.endsWith('-USD') ? normalized.slice(0, -4) : normalized;
}

function addConfiguredStockSymbols(symbols, raw) {
  String(raw || '').split(',').forEach(symbol => {
    if (symbol.trim()) symbols.add(symbol.trim().toUpperCase());
  });
}

function configuredStockSymbols() {
  const symbols = new Set();
  try {
    addConfiguredStockSymbols(symbols, getConfigValue('broker.alpacaSymbols'));
    const brokerId = getConfigValue('broker.id');
    const assetClass = getConfigValue('broker.assetClass');
    if (brokerId === 'alpaca' || assetClass === 'stocks') {
      addConfiguredStockSymbols(symbols, getConfigValue('broker.tradingPair'));
    }
  } catch (err) {
    throw new Error(`[GAP-RECOVERY] Unable to read stock symbol config for broker guard: ${err.message}`);
  }
  return symbols;
}

function looksLikeConfiguredStockSymbol(symbol) {
  const base = stockBaseSymbol(symbol);
  return !!base && configuredStockSymbols().has(base);
}

function timeframeToMs(timeframe) {
  if (typeof timeframe !== 'string' || !timeframe.trim()) return null;
  const match = timeframe.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unitMs = { m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[match[2]];
  return value * unitMs;
}

function isIntegerEpochMs(value) {
  return Number.isInteger(value) && value >= 1e12;
}

function cleanScopeValue(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
}

function cleanStatusText(value) {
  const cleaned = cleanScopeValue(value);
  if (!cleaned) return null;
  return cleaned.replace(/[^\w:.-]/g, '_').slice(0, 80);
}

function redactErrorMessage(value, maxLength) {
  const cleaned = cleanScopeValue(value);
  if (!cleaned) return null;
  const redacted = cleaned
    .replace(/((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');
  return redacted.slice(0, maxLength);
}

function cleanRedactedStatusText(value) {
  const redacted = redactErrorMessage(value, 80);
  return cleanStatusText(redacted);
}

class CandleProcessor {
  constructor(ctx) {
    this.ctx = ctx;
    this.dataFeedConfig = this._resolveDataFeedConfig();

    // Gap recovery state
    this.candleIntervalMs = this._resolveCandleIntervalMs();
    this.gapThresholdMultiplier = this.dataFeedConfig.gapThresholdMultiplier;
    this.cleanCandleCount = 0;
    this.cleanCandlesRequired = this.dataFeedConfig.gapRecoveryCleanCandlesRequired;
    this.backfillRetryInterval = null;
    this.backfillRetryDelayMs = this.dataFeedConfig.gapBackfillRetryDelayMs;
    this.lastBrokerStatusTimestampByKey = new Map();
    this.brokerStatusDedupeMaxKeys = this._resolveDashboardInt('dashboard.brokerStatusDedupeMaxKeys');
    this.errorEventDedupeMs = this._resolveDashboardInt('dashboard.errorEventDedupeMs', { allowZero: true });
    this.errorEventMessageMaxLength = this._resolveDashboardInt('dashboard.errorEventMessageMaxLength');
    this.errorEventDedupeMaxKeys = this._resolveDashboardInt('dashboard.errorEventDedupeMaxKeys');
    this.lastErrorEventAtByKey = new Map();

    // RTH-aware gap detection (CC-SPEC-RTH-GAP-DETECTION.md, 2026-05-05).
    // MarketCalendar is the single source of truth for NYSE sessions, holidays,
    // half-days, and DST. The gap detector uses it via _isExpectedMarketClose
    // to skip legitimate overnight/weekend closes that aren't real data gaps.
    this.marketCalendar = getMarketCalendar();

    console.log('[CandleProcessor] Initialized with gap recovery');
  }

  _resolveDashboardInt(path, options = {}) {
    const value = Number(getConfigValue(path));
    if (!Number.isFinite(value) || value < 0 || (!options.allowZero && value === 0)) {
      throw new Error(`CandleProcessor: ${path} config missing/invalid`);
    }
    return Math.floor(value);
  }

  _enforceMapCap(map, maxKeys) {
    while (map.size > maxKeys) {
      const oldestKey = map.keys().next().value;
      if (oldestKey === undefined) break;
      map.delete(oldestKey);
    }
  }

  _numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  _firstNumberOrNull(...values) {
    for (const value of values) {
      const numeric = this._numberOrNull(value);
      if (numeric !== null) return numeric;
    }
    return null;
  }

  _buildDashboardIndicators(renderPacket, marketData) {
    let snapshotIndicators = null;
    if (this.ctx.indicatorEngine && typeof this.ctx.indicatorEngine.getSnapshot === 'function') {
      const snapshot = this.ctx.indicatorEngine.getSnapshot();
      if (snapshot && typeof snapshot === 'object' && snapshot.indicators && typeof snapshot.indicators === 'object') {
        snapshotIndicators = snapshot.indicators;
      }
    }

    const renderIndicators = renderPacket
      && typeof renderPacket === 'object'
      && renderPacket.indicators
      && typeof renderPacket.indicators === 'object'
      ? renderPacket.indicators
      : null;

    const snapshot = snapshotIndicators || {};
    const render = renderIndicators || {};
    const snapshotMacd = snapshot.macd;
    const renderMacd = render.macd;

    return {
      rsi: this._firstNumberOrNull(snapshot.rsi, render.rsi),
      atr: this._firstNumberOrNull(snapshot.atr, render.atr),
      macd: this._firstNumberOrNull(
        snapshotMacd && typeof snapshotMacd === 'object' ? (snapshotMacd.macd ?? snapshotMacd.macdLine) : snapshotMacd,
        renderMacd && typeof renderMacd === 'object' ? (renderMacd.macd ?? renderMacd.macdLine) : renderMacd
      ),
      macdSignal: this._firstNumberOrNull(
        snapshot.macdSignal,
        snapshotMacd && typeof snapshotMacd === 'object' ? (snapshotMacd.signal ?? snapshotMacd.signalLine) : null,
        render.macdSignal,
        renderMacd && typeof renderMacd === 'object' ? (renderMacd.signal ?? renderMacd.signalLine) : null
      ),
      macdHistogram: this._firstNumberOrNull(
        snapshot.macdHistogram,
        snapshotMacd && typeof snapshotMacd === 'object' ? (snapshotMacd.hist ?? snapshotMacd.histogram) : null,
        render.macdHistogram,
        renderMacd && typeof renderMacd === 'object' ? (renderMacd.hist ?? renderMacd.histogram) : null
      ),
      volume: this._firstNumberOrNull(snapshot.volume, render.volume, marketData?.volume),
    };
  }

  _broadcastBrokerStatus(status) {
    try {
      const ws = this.ctx?.dashboardWs;
      if (!ws || ws.readyState !== 1) return false;

      const brokerName = cleanStatusText(status?.name)?.toLowerCase();
      if (!brokerName || typeof status?.ok !== 'boolean') return false;

      const frame = {
        type: 'broker_status',
        name: brokerName,
        ok: status.ok,
        timestamp: Number.isFinite(Number(status.timestamp)) ? Number(status.timestamp) : Date.now()
      };

      for (const field of ['symbol', 'timeframe', 'source', 'reason']) {
        const value = cleanStatusText(status[field]);
        if (value) frame[field] = value;
      }

      for (const field of ['attemptedCount', 'successCount']) {
        const value = Number(status[field]);
        if (Number.isFinite(value) && value >= 0) frame[field] = Math.floor(value);
      }

      const statusKey = [
        frame.name,
        frame.ok ? 'ok' : 'down',
        frame.symbol || '',
        frame.timeframe || '',
        frame.source || '',
        frame.reason || ''
      ].join('|');
      if (this.lastBrokerStatusTimestampByKey.get(statusKey) === frame.timestamp) return false;
      this.lastBrokerStatusTimestampByKey.set(statusKey, frame.timestamp);
      this._enforceMapCap(this.lastBrokerStatusTimestampByKey, this.brokerStatusDedupeMaxKeys);

      ws.send(JSON.stringify(frame));
      return true;
    } catch (error) {
      console.error('[CandleProcessor] broker_status broadcast failed:', error.message);
      return false;
    }
  }

  _broadcastErrorEvent(error, context = {}) {
    try {
      const ws = this.ctx?.dashboardWs;
      if (!ws || ws.readyState !== 1) return false;

      const message = redactErrorMessage(error?.message || error, this.errorEventMessageMaxLength);
      if (!message) return false;

      const timestamp = Date.now();
      const frame = {
        type: 'error_event',
        source: 'candle_processor.dashboard_broadcast',
        severity: 'warning',
        message,
        timestamp
      };

      for (const field of ['symbol', 'timeframe', 'brokerId', 'accountId', 'assetClass', 'executionMode', 'traceId']) {
        const value = cleanRedactedStatusText(context[field]);
        if (value) frame[field] = value;
      }

      const eventKey = [
        frame.source,
        frame.message,
        frame.symbol || '',
        frame.timeframe || '',
        frame.brokerId || '',
        frame.accountId || '',
        frame.assetClass || '',
        frame.executionMode || '',
        frame.traceId || ''
      ].join('|');
      const lastSentAt = this.lastErrorEventAtByKey.get(eventKey) || 0;
      if (this.errorEventDedupeMs > 0 && timestamp - lastSentAt < this.errorEventDedupeMs) return false;
      this.lastErrorEventAtByKey.set(eventKey, timestamp);
      this._enforceMapCap(this.lastErrorEventAtByKey, this.errorEventDedupeMaxKeys);

      ws.send(JSON.stringify(frame));
      return true;
    } catch (sendError) {
      console.error('[CandleProcessor] error_event broadcast failed:', sendError.message);
      return false;
    }
  }

  _resolveDataFeedConfig() {
    const config = this.ctx?.config?.dataFeed || getConfigValue('dataFeed');
    if (!config || typeof config !== 'object') {
      throw new Error('CandleProcessor: dataFeed config missing');
    }
    return config;
  }

  _resumeDataFeedPause(scope, reason) {
    if (typeof stateManager.resumeTradingIfPausedBy !== 'function') {
      return;
    }

    stateManager.resumeTradingIfPausedBy('data_feed_liveness', {
      scope,
      legacyReasonPrefixes: ['Liveness watchdog:', 'Stale data:', 'Data gap:'],
      reason,
      resumeSource: 'data_feed_liveness',
    }).then(result => {
      if (result?.resumed || result?.reason === 'not_paused') {
        this.ctx.staleFeedPaused = false;
        this.ctx.feedRecoveryCandles = 0;
        this.cleanCandleCount = 0;
      }
    }).catch(error => {
      console.error(`[CandleProcessor] Failed to recover data-feed pause: ${error.message}`);
    });
  }

  _resolveCandleIntervalMs() {
    const timeframe = this.ctx?.candleTimeframe;
    const intervalMs = timeframeToMs(timeframe);
    if (!intervalMs) {
      throw new Error(`CandleProcessor: invalid candle timeframe for gap recovery (${timeframe})`);
    }
    return intervalMs;
  }

  /**
   * CC-C Multi-Symbol Commit 3/6: resolve which SymbolTradingContext a candle
   * belongs to. Returns the matching context or null. Multi-step resolution
   * handles three real-world cases:
   *   1. Multi-symbol production: candles arrive with `candle.symbol` stamped
   *      (live broker WS or BacktestRunner with SYMBOL_MAP) → direct lookup.
   *   2. Single-symbol with aligned tradingPair: ctx.tradingPair matches a
   *      Map key → direct lookup. Common for live single-symbol mode.
   *   3. Missing-symbol single-symbol legacy feed: if no candle symbol exists,
   *      fall back to ctx.tradingPair or the sole registered context.
   *      Explicit candle symbols never fall back to a different context.
   * Returns null in pathological cases (multi-symbol Map with neither
   * candle.symbol nor a matching tradingPair); caller skips routing safely.
   */
  _resolveSymCtx(candle) {
    const map = this.ctx.symbolContexts;
    if (!map || map.size === 0) return null;
    const candleSymbol = normalizeCandleSymbol(candle.symbol);
    const tradingPair = normalizeCandleSymbol(this.ctx.tradingPair);
    if (candleSymbol && map.has(candleSymbol)) return map.get(candleSymbol);
    if (candleSymbol) {
      this._missingCandleContextSymbols ??= new Set();
      if (!this._missingCandleContextSymbols.has(candleSymbol)) {
        this._missingCandleContextSymbols.add(candleSymbol);
        console.error(`[VIS][CandleProcessor] symbol=${candleSymbol} has no SymbolTradingContext; contexts=${Array.from(map.keys()).join(',') || '(none)'} ctxTradingPair=${tradingPair || '(missing)'}`);
      }
      return null;
    }
    if (tradingPair && map.has(tradingPair)) return map.get(tradingPair);
    if (map.size === 1) return map.values().next().value;
    return null;
  }

  _resolveCandleTimeframe(candle) {
    const timeframe = candle?.timeframe;
    if (typeof timeframe !== 'string' || !timeframe.trim()) {
      throw new Error(`CandleProcessor.processNewCandle: missing candle timeframe for symbol=${candle?.symbol || '(missing)'}`);
    }
    return timeframe.trim();
  }

  _resolveCandleScopeContext(candle) {
    const config = this.ctx?.config || {};
    const accountId = cleanScopeValue(candle.accountId) || cleanScopeValue(config.accountId);
    const accountIdSource = cleanScopeValue(candle.accountIdSource)
      || (accountId === 'default' ? 'default' : accountId ? 'config' : null);
    const executionMode = cleanScopeValue(candle.executionMode)
      || (config.enableBacktestMode ? 'backtest' : cleanScopeValue(config.executionMode));

    return {
      brokerId: cleanScopeValue(candle.brokerId) || cleanScopeValue(config.brokerId),
      accountId,
      accountIdSource,
      assetClass: cleanScopeValue(candle.assetClass) || cleanScopeValue(config.assetClass),
      executionMode,
      timeframe: cleanScopeValue(candle.timeframe),
    };
  }

  _emitCandleScopeRejected(traceId, candle, missingFields, source) {
    if (!traceId) return;
    emitTrace(this.ctx, 'CANDLE_SCOPE_REJECTED', {
      traceId,
      source: source || 'processNewCandle',
      missingFields,
      symbol: candle?.symbol || null,
      timeframe: candle?.timeframe || null,
      brokerId: candle?.brokerId || this.ctx?.config?.brokerId || null,
      accountId: candle?.accountId || this.ctx?.config?.accountId || null,
      assetClass: candle?.assetClass || this.ctx?.config?.assetClass || null,
      executionMode: candle?.executionMode || this.ctx?.config?.executionMode || null,
      scopeKey: candle?.scopeKey || null,
      scopeKeyPresent: Boolean(candle?.scopeKey),
    });
  }

  _attachCandleScope(candle, options = {}) {
    const traceContext = this._resolveTraceContext(options);
    const traceId = traceContext.traceId || candle?.traceId || null;
    const source = traceContext.source || candle?.source || 'processNewCandle';
    const missing = [];

    if (!candle || typeof candle !== 'object' || Array.isArray(candle)) {
      this._emitCandleScopeRejected(traceId, candle, ['candle'], source);
      throw new Error('CandleProcessor.processNewCandle missing immutable candle scope field(s): candle');
    }

    const symbol = normalizeCandleSymbol(candle.symbol);
    if (!symbol) missing.push('symbol');

    const scopeContext = this._resolveCandleScopeContext(candle);
    for (const field of ['brokerId', 'accountId', 'assetClass', 'executionMode', 'timeframe']) {
      if (!cleanScopeValue(scopeContext[field])) missing.push(field);
    }

    if (missing.length > 0) {
      this._emitCandleScopeRejected(traceId, candle, missing, source);
      throw new Error(`CandleProcessor.processNewCandle missing immutable candle scope field(s): ${missing.join(', ')}`);
    }

    const scope = stateManager.buildTradeScope(
      scopeContext,
      symbol,
      'CandleProcessor.processNewCandle'
    );

    Object.assign(candle, {
      symbol: scope.symbol,
      brokerId: scope.brokerId,
      accountId: scope.accountId,
      accountIdSource: scope.accountIdSource,
      assetClass: scope.assetClass,
      executionMode: scope.executionMode,
      timeframe: scope.timeframe,
      scopeKey: scope.key,
      scopeKeyVersion: 2,
    });

    return { candle, scope };
  }

  _stampRuntimeScopeFields(candle) {
    const scopeContext = this._resolveCandleScopeContext(candle);
    return {
      ...candle,
      brokerId: scopeContext.brokerId,
      accountId: scopeContext.accountId,
      accountIdSource: scopeContext.accountIdSource,
      assetClass: scopeContext.assetClass,
      executionMode: scopeContext.executionMode,
    };
  }

  _resolveTraceContext(options = {}) {
    if (!options) return {};
    if (typeof options === 'string') return { traceId: options };
    if (typeof options === 'object') return options;
    return {};
  }

  /**
   * Process a candle - ONE CANONICAL PATH
   * Phase 5 REWRITE: Handles both new candles AND updates to existing candles
   * Used by live feed, backfill replay, and intra-candle updates
   * @param {Object} candle - Candle in V2 format { o, h, l, c, v, t, etime }
   * @param {Object} [options]
   * @param {boolean} [options.persist=true] - persist periodic live history
   * @returns {boolean} true if new candle, false if update to existing
   */
  processNewCandle(candle, options = {}) {
    const persist = options.persist !== false;
    const traceId = this._resolveTraceContext(options).traceId || candle?.traceId || null;
    const scoped = this._attachCandleScope(candle, options);
    candle = scoped.candle;
    const candleTimeframe = this._resolveCandleTimeframe(candle);
    const invalidTimestampFields = [];
    if (!isIntegerEpochMs(candle?.t)) invalidTimestampFields.push('t');
    if (!isIntegerEpochMs(candle?.etime)) invalidTimestampFields.push('etime');
    if (invalidTimestampFields.length > 0) {
      const message = `CandleProcessor.processNewCandle invalid millisecond timestamp field(s): ${invalidTimestampFields.join(', ')} symbol=${candle?.symbol || '(missing)'} timeframe=${candleTimeframe || '(missing)'}`;
      console.error(`[OHLC] ${message}`);
      throw new Error(message);
    }

    const candleStoreSymbol = candle.symbol;
    const symCtx = this._resolveSymCtx(candle);
    const hasSymbolContexts = this.ctx.symbolContexts instanceof Map && this.ctx.symbolContexts.size > 0;
    const primarySymbol = normalizeCandleSymbol(this.ctx.tradingPair);
    const candleSymbol = normalizeCandleSymbol(candleStoreSymbol);
    const shouldUpdateLegacyRoot = !hasSymbolContexts || !primarySymbol || candleSymbol === primarySymbol;
    const updateHistory = shouldUpdateLegacyRoot ? this.ctx.priceHistory : (symCtx?.priceHistory || []);

    // Check if this is an update to existing candle or a new candle.
    // In multi-symbol mode, the legacy root history is the primary-symbol mirror
    // only. Non-primary symbols update CandleStore/SymbolTradingContext without
    // overwriting the primary root snapshot.
    const existingIndex = updateHistory.findIndex(c => c.etime === candle.etime);
    const isUpdate = existingIndex !== -1;

    if (isUpdate) {
      // UPDATE existing candle (same etime, new OHLCV values as candle forms)
      if (shouldUpdateLegacyRoot) {
        this.ctx.priceHistory[existingIndex] = candle;
      }
      this.ctx._candleStore.addCandle(
        candleStoreSymbol,
        candleTimeframe,
        candle
      );

      // Feed IndicatorEngine for real-time updates
      if (shouldUpdateLegacyRoot && this.ctx.indicatorEngine) {
        this.ctx.indicatorEngine.updateCandle({
          t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
        });
      }

      // CC-C Multi-Symbol Commit 3/6: per-symbol indicator update on UPDATE path.
      // Mirrors the global indicatorEngine.updateCandle above against the symbol's
      // own context. Global path stays alive as fallback for not-yet-migrated
      // consumers (commits 4-6 phase it out).
      if (symCtx) {
        symCtx.indicatorEngine.updateCandle({
          t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
        });
      }
      if (traceId) {
        emitTrace(this.ctx, 'CANDLE_ACCEPTED', {
          traceId,
          symbol: candleStoreSymbol,
          timeframe: candleTimeframe,
          update: true,
          priceHistory: updateHistory.length,
          close: candle.c,
          etime: candle.etime,
          brokerId: candle.brokerId,
          accountId: candle.accountId,
          assetClass: candle.assetClass,
          executionMode: candle.executionMode,
          scopeKey: candle.scopeKey,
        });
      }
      return false; // Was update, not new
    }

    // NEW candle - smart insert: push if latest, splice if backfill
    if (shouldUpdateLegacyRoot) {
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
    }

    this.ctx._candleStore.addCandle(
      candleStoreSymbol,
      candleTimeframe,
      candle
    );

    // Feed IndicatorEngine
    if (shouldUpdateLegacyRoot && this.ctx.indicatorEngine) {
      this.ctx.indicatorEngine.updateCandle({
        t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
      });
    }

    // Feed modular entry systems (only on NEW candles, not updates)
    if (shouldUpdateLegacyRoot && this.ctx.mtfAdapter) this.ctx.mtfAdapter.ingestCandle(candle);
    if (shouldUpdateLegacyRoot && this.ctx.emaCrossover) this.ctx.emaCrossoverSignal = this.ctx.emaCrossover.update(candle, this.ctx.priceHistory);
    if (shouldUpdateLegacyRoot && this.ctx.maDynamicSR) this.ctx.maDynamicSRSignal = this.ctx.maDynamicSR.update(candle, this.ctx.priceHistory);
    // 2026-05-04: BreakAndRetest moved to self-contained pattern (owned by StrategyOrchestrator).
    if (shouldUpdateLegacyRoot && this.ctx.liquiditySweep) this.ctx.liquiditySweepSignal = this.ctx.liquiditySweep.feedCandle(candle);

    if (shouldUpdateLegacyRoot && this.ctx.volumeProfile) this.ctx.volumeProfile.update(candle, this.ctx.priceHistory);

    // CC-C Multi-Symbol Commit 3/6: per-symbol routing for NEW-candle path.
    // Routes the new candle to its SymbolTradingContext's signal modules and
    // indicatorEngine. symCtx.priceHistory is a getter onto candleStore (Trey
    // directive #1) so it already reflects the addCandle write at line ~107.
    // Existing global signal updates above (lines ~120-125) stay alive as
    // fallback for not-yet-migrated consumers; commits 4-6 phase them out.
    // First-time-seen-per-symbol log uses [BOOT] tag so silent backtest shows
    // the routing actually fired without spamming every candle.
    {
      if (symCtx) {
        this._firstCandleSeenSymbols ??= new Set();
        const sym = symCtx.symbol;
        if (!this._firstCandleSeenSymbols.has(sym)) {
          console.log(`[VIS][CandleProcessor] first route candleSymbol=${candle.symbol} selected=${sym} ctxTradingPair=${normalizeCandleSymbol(this.ctx.tradingPair) || '(missing)'} price=${candle.c}`);
          this._firstCandleSeenSymbols.add(sym);
        }
        console.log(`[VIS][CandleProcessor] route candleSymbol=${candle.symbol} selected=${sym} price=${candle.c} candles=${this.ctx.priceHistory.length}`);
        symCtx.indicatorEngine.updateCandle({
          t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
        });
        if (symCtx.emaCrossover)   symCtx.emaCrossoverSignal = symCtx.emaCrossover.update(candle, symCtx.priceHistory);
        if (symCtx.maDynamicSR)    symCtx.maDynamicSRSignal  = symCtx.maDynamicSR.update(candle, symCtx.priceHistory);
        if (symCtx.volumeProfile)  symCtx.volumeProfile.update(candle, symCtx.priceHistory);
      }
    }
    if (traceId) {
      emitTrace(this.ctx, 'CANDLE_ACCEPTED', {
        traceId,
        symbol: candleStoreSymbol,
        timeframe: candleTimeframe,
        update: false,
        priceHistory: this.ctx.priceHistory.length,
        close: candle.c,
        etime: candle.etime,
        brokerId: candle.brokerId,
        accountId: candle.accountId,
        assetClass: candle.assetClass,
        executionMode: candle.executionMode,
        scopeKey: candle.scopeKey,
      });
    }

    // Warmup log (only first 20 candles)
    if (this.ctx.priceHistory.length <= 20) {
      const candleTime = new Date(candle.t).toLocaleTimeString();
      console.log(`Candle #${this.ctx.priceHistory.length}/15 [${candleTime}]`);
    }

    // Trim history to 250
    if (this.ctx.priceHistory.length > 250) {
      this.ctx.priceHistory = this.ctx.priceHistory.slice(-250);
    }

    // Save counter
    if (persist) {
      this.ctx.candleSaveCounter++;
      if (this.ctx.candleSaveCounter >= 5) {
        this.ctx.saveCandleHistory();
        this.ctx.candleSaveCounter = 0;
      }
    }

    return true; // Was new candle
  }

  /**
   * Returns true iff the gap from lastEtime → nextEtime is wholly explained
   * by a US equity market closure (overnight 16:00→09:30 ET, weekend Fri→Mon,
   * holiday). Uses MarketCalendar.getNYTimeParts for DST-safe NYSE conversion.
   *
   * Spec semantics (CC-SPEC-RTH-GAP-DETECTION.md):
   *   - Weekend gap: last weekday is Fri, next weekday is Mon
   *   - Overnight gap: last bar at-or-after 15:30 ET, next bar at-or-before
   *     10:00 ET, on different calendar days
   * @private
   */
  _isExpectedMarketClose(lastEtime, nextEtime) {
    // Defensive guard (Mercury attack finding d): fail closed on non-finite inputs.
    // If we can't reason about the timestamps, don't skip the gap — backfill
    // attempt + halt path is the correct fail-safe behavior.
    if (!Number.isFinite(lastEtime) || !Number.isFinite(nextEtime)) return false;

    const last = this.marketCalendar.getNYTimeParts(new Date(lastEtime));
    const next = this.marketCalendar.getNYTimeParts(new Date(nextEtime));

    // Weekend: Fri close → Mon open
    if (last.weekday === 'Fri' && next.weekday === 'Mon') return true;

    // Overnight: last at-or-after the day's actual RTH close (handles half-days
    // like day-after-Thanksgiving 13:00 ET via MarketCalendar.getMarketPhase),
    // next at-or-before 10:00 ET morning open, on different calendar dates.
    // Mercury attack finding b: hardcoded 15:30 missed half-day early closes.
    const lastDayPhase = this.marketCalendar.getMarketPhase(new Date(lastEtime));
    // Mercury attack finding e: if rthCloseMinute is undefined/NaN (calendar
    // missing the day's phase data), `undefined - 30 = NaN`, isAfterClose
    // becomes false, function returns false, caller triggers backfill on a
    // legit overnight pause — resurrects the bug 349172a was meant to fix.
    // Fail-safe direction: if we can't determine the close, return false
    // and let gap-recovery + halt handle it. Same logic as line 147.
    if (!Number.isFinite(lastDayPhase.rthCloseMinute)) return false;
    const closeBoundary = lastDayPhase.rthCloseMinute - 30;  // 30-min slop for last bar pre-close
    const isAfterClose = last.minuteOfDay >= closeBoundary;
    const isBeforeOpen = next.minuteOfDay <= 10 * 60;  // 10:00 ET morning slop
    const differentDays = last.date !== next.date;
    return isAfterClose && isBeforeOpen && differentDays;
  }

  _isExpectedStockMarketQuiet(assetClass, brokerId) {
    const cleanAssetClass = cleanScopeValue(assetClass || this.ctx.config?.assetClass);
    const cleanBrokerId = cleanScopeValue(brokerId || this.ctx.config?.brokerId);
    const isStockScope = cleanAssetClass === 'stocks' || cleanBrokerId === 'alpaca';
    if (!isStockScope) return false;

    const phase = this.marketCalendar.getMarketPhase(new Date());
    if (phase.phase && phase.phase !== 'rth' && phase.isRTH === true) {
      console.error(`[STALE DATA] market phase contradicts isRTH; treating liveness as active | broker=${cleanBrokerId || '(missing)'} assetClass=${cleanAssetClass || '(missing)'} phase=${phase.phase} isRTH=${phase.isRTH}`);
      return false;
    }
    if (phase.phase === 'rth' && phase.isRTH !== true) {
      console.error(`[STALE DATA] market phase contradicts isRTH; treating liveness as active | broker=${cleanBrokerId || '(missing)'} assetClass=${cleanAssetClass || '(missing)'} phase=${phase.phase} isRTH=${phase.isRTH}`);
      return false;
    }
    if (phase.isRTH === false) return true;
    if (phase.isRTH !== true) {
      console.error(`[STALE DATA] market phase missing boolean isRTH; treating liveness as active | broker=${cleanBrokerId || '(missing)'} assetClass=${cleanAssetClass || '(missing)'} phase=${phase?.phase || '(missing)'}`);
    }
    return false;
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
  async attemptBackfill(gapStart, gapEnd, traceContext = {}) {
    try {
      const broker = this.ctx.sessionRouter?.activeBroker || this.ctx.kraken;
      if (!broker || typeof broker.getCandles !== 'function') {
        console.error('[GAP-RECOVERY] Active broker does not support getCandles() — adapter misconfigured');
        return [];
      }

      const rawSymbol = traceContext.symbol;
      const symbol = normalizeCandleSymbol(rawSymbol);
      if (!symbol) {
        console.error(`[GAP-RECOVERY] Missing candle symbol for backfill (raw=${rawSymbol})`);
        return [];
      }

      const timeframe = cleanScopeValue(traceContext.timeframe);
      if (!timeframeToMs(timeframe)) {
        console.error(`[GAP-RECOVERY] Missing/invalid candle timeframe for backfill (${timeframe})`);
        return [];
      }

      const brokerId = cleanScopeValue(
        traceContext.brokerId || broker.id || broker.brokerId || this.ctx.config?.brokerId
      );
      if (!brokerId) {
        console.error(`[GAP-RECOVERY] Missing broker identity for ${symbol} backfill; refusing broker-ambiguous REST fetch`);
        return [];
      }

      const assetClass = cleanScopeValue(traceContext.assetClass || this.ctx.config?.assetClass);
      const brokerKey = brokerId.toLowerCase();
      const stockSymbol = looksLikeStockSymbol(symbol) || looksLikeConfiguredStockSymbol(symbol);
      const cryptoUsdSymbol = looksLikeUsdCryptoSymbol(symbol) && !stockSymbol;
      if (brokerKey === 'kraken' && (
        assetClass === 'stocks' || stockSymbol
      )) {
        console.error(`[GAP-RECOVERY] Refusing to backfill stock symbol ${symbol} through Kraken`);
        return [];
      }
      if (brokerKey === 'alpaca' && (assetClass === 'crypto' || cryptoUsdSymbol)) {
        console.error(`[GAP-RECOVERY] Refusing to backfill crypto symbol ${symbol} through Alpaca`);
        return [];
      }

      // Calculate how many candles we need
      const missingCount = Math.ceil((gapEnd - gapStart) / this.candleIntervalMs);
      const fetchCount = missingCount + this.dataFeedConfig.gapBackfillBufferCandles;

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
   */
  startBackfillRetry(gapStart, gapEnd, traceContext = {}) {
    if (this.backfillRetryInterval) return; // Already retrying

    console.log(`[GAP-RECOVERY] Starting retry loop (every ${this.backfillRetryDelayMs}ms)`);

    this.backfillRetryInterval = setInterval(async () => {
      console.log('[GAP-RECOVERY] Retry attempt...');

      const candles = await this.attemptBackfill(gapStart, gapEnd, traceContext);

      if (candles.length > 0) {
        console.log(`[GAP-RECOVERY] Retry succeeded: ${candles.length} candles`);
        this.handleBackfillSuccess(candles, {
          ...this._resolveTraceContext(traceContext),
          gapStart,
          gapEnd,
        });
        this.stopBackfillRetry();
      }
    }, this.backfillRetryDelayMs);
  }

  /**
   * Stop the retry loop
   */
  stopBackfillRetry() {
    if (this.backfillRetryInterval) {
      clearInterval(this.backfillRetryInterval);
      this.backfillRetryInterval = null;
    }
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
  handleBackfillSuccess(candles, traceContext = {}) {
    const traceOptions = this._resolveTraceContext(traceContext);
    const traceId = traceOptions.traceId || null;
    const replaySymbol = normalizeCandleSymbol(traceOptions.symbol);
    const replayTimeframe = cleanScopeValue(traceOptions.timeframe);
    const replayScope = {
      symbol: replaySymbol,
      timeframe: replayTimeframe,
      brokerId: traceOptions.brokerId,
      accountId: traceOptions.accountId,
      accountIdSource: traceOptions.accountIdSource,
      assetClass: traceOptions.assetClass,
      executionMode: traceOptions.executionMode,
    };
    const missingReplayScope = [];
    for (const field of ['symbol', 'brokerId', 'accountId', 'assetClass', 'executionMode', 'timeframe']) {
      if (!cleanScopeValue(replayScope[field])) missingReplayScope.push(field);
    }
    if (missingReplayScope.length > 0) {
      this._emitCandleScopeRejected(traceId, replayScope, missingReplayScope, traceOptions.source || 'gap_backfill');
      throw new Error(`CandleProcessor.handleBackfillSuccess missing immutable candle scope field(s): ${missingReplayScope.join(', ')}`);
    }
    console.log(`[GAP-RECOVERY] Processing ${candles.length} backfilled candles`);
    if (traceId) {
      emitTrace(this.ctx, 'GAP_BACKFILL_REPLAY', {
        traceId,
        source: traceOptions.source || 'gap_backfill',
        candles: candles.length,
        gapStart: traceOptions.gapStart,
        gapEnd: traceOptions.gapEnd,
      });
    }

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
        symbol: replaySymbol,
        timeframe: replayTimeframe,
        brokerId: replayScope.brokerId,
        accountId: replayScope.accountId,
        accountIdSource: replayScope.accountIdSource,
        assetClass: replayScope.assetClass,
        executionMode: replayScope.executionMode,
        traceId,
      };
      this.processNewCandle(this._stampRuntimeScopeFields(candle), {
        traceId,
        source: traceOptions.source || 'gap_backfill',
      });
    });

    console.log(`[GAP-RECOVERY] Backfilled ${candles.length} candles via REST`);
  }

  /**
   * Handle incoming market data from WebSocket
   * Kraken OHLC format: [channelID, [time, etime, open, high, low, close, vwap, volume, count], channelName, pair]
   */
  handleMarketData(ohlcInput, traceContext = {}) {
    const traceOptions = this._resolveTraceContext(traceContext);
    const wrappedInput = ohlcInput && typeof ohlcInput === 'object' && !Array.isArray(ohlcInput)
      ? ohlcInput
      : null;
    const traceId = traceOptions.traceId || wrappedInput?.traceId || wrappedInput?.data?.traceId || null;
    const payloadSymbol = normalizeCandleSymbol(wrappedInput?.symbol || wrappedInput?.data?.symbol || wrappedInput?.data?.S);
    const contextSymbol = normalizeCandleSymbol(this.ctx.tradingPair);
    const stampedSymbol = payloadSymbol || contextSymbol;
    const symbolSource = payloadSymbol ? 'payload' : contextSymbol ? 'ctx.tradingPair' : 'missing';
    const payloadTimeframe = typeof wrappedInput?.timeframe === 'string' && wrappedInput.timeframe.trim()
      ? wrappedInput.timeframe.trim()
      : null;
    const sourceTimeframe = payloadTimeframe || this.ctx.candleTimeframe;
    const timeframeSource = payloadTimeframe ? 'payload' : this.ctx.candleTimeframe ? 'ctx.candleTimeframe' : 'missing';
    if (typeof sourceTimeframe !== 'string' || !sourceTimeframe.trim()) {
      this._emitCandleScopeRejected(traceId, { symbol: stampedSymbol || null }, ['timeframe'], 'handleMarketData');
      throw new Error(`CandleProcessor.handleMarketData: missing candle timeframe for symbol=${stampedSymbol || this.ctx.tradingPair || '(missing)'}`);
    }
    if (!stampedSymbol) {
      this._emitCandleScopeRejected(traceId, { timeframe: sourceTimeframe }, ['symbol'], 'handleMarketData');
      throw new Error(`CandleProcessor.handleMarketData: missing candle symbol for timeframe=${sourceTimeframe}`);
    }
    const ohlcData = Array.isArray(ohlcInput)
      ? ohlcInput
      : normalizeOhlc(wrappedInput?.data ?? ohlcInput);

    // OHLC data is array: [time, etime, open, high, low, close, vwap, volume, count]
    if (!Array.isArray(ohlcData) || ohlcData.length < 8) {
      console.warn('[OHLC] Invalid OHLC data format:', ohlcInput);
      return;
    }

    const [time, etime, open, high, low, close, vwap, volume, count] = ohlcData;
    const candleTimeMs = toTimestampMs(time);
    const candleEndTimeMs = toTimestampMs(etime ?? time);
    if (!Number.isInteger(candleTimeMs) || !Number.isInteger(candleEndTimeMs)) {
      console.warn('[OHLC] Invalid OHLC timestamp:', {
        symbol: stampedSymbol,
        timeframe: sourceTimeframe,
        time,
        etime,
      });
      return;
    }
    if (traceId) {
      emitTrace(this.ctx, 'CANDLE_PROCESSOR_RECEIVED', {
        traceId,
        symbol: stampedSymbol || null,
        symbolSource,
        timeframe: sourceTimeframe,
        timeframeSource,
        close: Number(close),
        etime: candleEndTimeMs,
      });
    }

    // CHANGE 2026-01-16: Track when we last received ANY data (for liveness watchdog)
    this.ctx.lastDataReceived = Date.now();

    // STALE DATA DETECTION: Check if DATA ITSELF is old (not arrival time)
    // FIX BACKTEST_001: Skip stale check in backtest mode - historical data is intentionally old
    const isBacktesting = getConfigValue('mode.backtest') || this.ctx.config?.enableBacktestMode;
    const now = Date.now();
    const dataAge = now - candleEndTimeMs;

    const staleAssetClass = wrappedInput?.assetClass || this.ctx.config?.assetClass;
    const staleBrokerId = wrappedInput?.brokerId || this.ctx.config?.brokerId;
    if (
      dataAge > this.dataFeedConfig.staleDataMaxAgeMs &&
      !isBacktesting &&
      !this._isExpectedStockMarketQuiet(staleAssetClass, staleBrokerId)
    ) {
      console.error('[STALE DATA]', Math.round(dataAge / 1000), 'seconds old');

      // AUTO-PAUSE TRADING
      if (!this.ctx.staleFeedPaused) {
        console.error('[STALE DATA] PAUSING NEW ENTRIES DUE TO STALE DATA');
        this.ctx.staleFeedPaused = true;

        // Notify StateManager to pause
        try {
          stateManager.pauseTrading(`Stale data: ${Math.round(dataAge / 1000)}s old`, {
            source: 'data_feed_liveness',
            recoverable: true,
            scope: {
              symbol: stampedSymbol,
              timeframe: sourceTimeframe,
              brokerId: wrappedInput?.brokerId,
              accountId: wrappedInput?.accountId,
              assetClass: wrappedInput?.assetClass,
              executionMode: wrappedInput?.executionMode,
            },
          });
        } catch (error) {
          console.error('Failed to pause via StateManager:', error.message);
        }
      }
    } else if (this.ctx.staleFeedPaused && dataAge < this.dataFeedConfig.staleDataRecoveryAgeMs) {
      console.log('[STALE DATA] Fresh data restored, checking recoverable pause owner');
      this._resumeDataFeedPause({
        symbol: stampedSymbol,
        timeframe: sourceTimeframe,
        brokerId: wrappedInput?.brokerId,
        accountId: wrappedInput?.accountId,
        assetClass: wrappedInput?.assetClass,
        executionMode: wrappedInput?.executionMode,
      }, 'fresh candle restored stale data feed');
    }

    let price = parseFloat(close);
    if (!price || isNaN(price)) return;

    // Build proper OHLCV candle structure from Kraken OHLC stream
    const candle = this._stampRuntimeScopeFields({
      o: parseFloat(open),
      h: parseFloat(high),
      l: parseFloat(low),
      c: parseFloat(close),
      v: parseFloat(volume),
      t: candleTimeMs,  // Actual timestamp for display
      etime: candleEndTimeMs,  // End time for deduplication
      timeframe: sourceTimeframe,
      symbol: stampedSymbol,
      symbolSource,
      timeframeSource,
      brokerId: wrappedInput?.brokerId,
      accountId: wrappedInput?.accountId,
      accountIdSource: wrappedInput?.accountIdSource,
      assetClass: wrappedInput?.assetClass,
      executionMode: wrappedInput?.executionMode,
      traceId,
    });

    // Phase 5 REWRITE: ONE CANONICAL PATH - always call processNewCandle
    // processNewCandle now handles both updates (same etime) and new candles
    const gapSymCtx = this._resolveSymCtx(candle);
    const gapHistory = gapSymCtx?.priceHistory || this.ctx.priceHistory;
    const lastCandle = gapHistory[gapHistory.length - 1];
    const isNewCandle = !lastCandle || lastCandle.etime !== candle.etime;

    // GAP DETECTION: Check for gaps only on new candles, not in backtest
    if (isNewCandle && lastCandle && !isBacktesting) {
      const gapMs = candle.etime - lastCandle.etime;
      const gapThreshold = this.candleIntervalMs * this.gapThresholdMultiplier;

      if (gapMs > gapThreshold) {
        // RTH-aware: skip gap halt for legitimate stocks overnight/weekend closes.
        // CC-SPEC-RTH-GAP-DETECTION.md. Mercury attack finding c: negative-match
        // classifier accepted separator-less crypto pairs (BTCUSDC). Tightened
        // to positive US-equity-ticker shape: 1-5 uppercase letters, no digits.
        const gapSymbol = normalizeCandleSymbol(candle.symbol || lastCandle.symbol || this.ctx.tradingPair);
        const gapAssetClass = cleanScopeValue(candle.assetClass || lastCandle.assetClass || this.ctx.config?.assetClass);
        const isStocksMode = gapAssetClass === 'stocks' || (
          gapAssetClass !== 'crypto' && looksLikeStockSymbol(gapSymbol)
        );
        if (isStocksMode && this._isExpectedMarketClose(lastCandle.etime, candle.etime)) {
          console.log(`[GAP-RECOVERY] Overnight/weekend gap ${gapMs}ms - expected for stocks, skipping`);
        } else {
          const missingCandles = Math.floor(gapMs / this.candleIntervalMs) - 1;
          console.warn(`[GAP-RECOVERY] Gap detected: ${gapMs}ms (${missingCandles} candles missing)`);

          const gapTraceContext = {
            traceId,
            source: 'gap_backfill',
            symbol: candle.symbol,
            timeframe: candle.timeframe,
            brokerId: candle.brokerId,
            accountId: candle.accountId,
            accountIdSource: candle.accountIdSource,
            assetClass: candle.assetClass,
            executionMode: candle.executionMode,
          };

          this.attemptBackfill(lastCandle.etime, candle.etime, gapTraceContext).then(backfilledCandles => {
            if (backfilledCandles.length > 0) {
              this.handleBackfillSuccess(backfilledCandles, {
                ...gapTraceContext,
                gapStart: lastCandle.etime,
                gapEnd: candle.etime,
              });
              this.cleanCandleCount = 0;
            } else {
              console.error('[GAP-RECOVERY] Backfill failed, halting trading');
              this.ctx.staleFeedPaused = true;
              stateManager.pauseTrading(`Data gap: ${missingCandles} candles missing, backfill failed`, {
                source: 'data_feed_liveness',
                recoverable: true,
                scope: {
                  symbol: candle.symbol,
                  timeframe: candle.timeframe,
                  brokerId: candle.brokerId,
                  accountId: candle.accountId,
                  assetClass: candle.assetClass,
                  executionMode: candle.executionMode,
                },
              });
              this.startBackfillRetry(lastCandle.etime, candle.etime, {
                ...gapTraceContext,
                source: 'gap_backfill_retry',
              });
            }
          });
        }
      }
    }

    // Track clean candles for recovery after gap
    if (isNewCandle && this.ctx.staleFeedPaused && this.backfillRetryInterval) {
      this.cleanCandleCount++;
      if (this.cleanCandleCount >= this.cleanCandlesRequired) {
        this.stopBackfillRetry();
        console.log(`[GAP-RECOVERY] ${this.cleanCandleCount} clean candles - checking recoverable pause owner`);
        this._resumeDataFeedPause({
          symbol: candle.symbol,
          timeframe: candle.timeframe,
          brokerId: candle.brokerId,
          accountId: candle.accountId,
          assetClass: candle.assetClass,
          executionMode: candle.executionMode,
        }, `${this.cleanCandleCount} clean candles restored gap recovery`);
      }
    }

    // ONE CANONICAL PATH - all candles (new and updates) go through processNewCandle
    this.processNewCandle(candle, { traceId, source: 'handleMarketData' });

    // Store latest market data
    // MED-07: propagate null for unparseable volume instead of phantom 0.
    // Distinguishes "no trades" (legitimate zero) from "broker fed garbage"
    // (null). Downstream consumers must check finiteness before using.
    const _parsedVolume = parseFloat(volume);
    const marketData = {
      symbol: candle.symbol || null,
      price,
      timestamp: candleTimeMs,  // Use candle's actual timestamp
      timeframe: candle.timeframe,
      systemTime: Date.now(),  // Keep system time separately if needed
      volume: Number.isFinite(_parsedVolume) ? _parsedVolume : null,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low)
    };
    this.ctx.marketData = marketData;
    const symCtx = this._resolveSymCtx(candle);
    if (symCtx) symCtx.marketData = marketData;

    // CHANGE 663: Broadcast market data to dashboard
    // BACKTEST_FAST: Skip dashboard broadcast entirely
    if (!getConfigValue('backtest.fast') && this.ctx.dashboardWsConnected && this.ctx.dashboardWs) {
      try {
        // CHANGE 2025-12-23: Use IndicatorEngine render packet for dashboard
        const renderPacket = this.ctx.indicatorEngine.getRenderPacket({ maxPoints: 200 });

        // CHANGE 2026-01-23: Calculate performance stats for dashboard
        // BUGFIX 2026-01-23: Include position value in P&L calculation!
        const currentEquity = stateManager.getEquity(price);
        const currentPosition = stateManager.get('position') || 0;
        const totalAccountValue = currentEquity;
        // CRIT-08-followup-D: refuse $10K phantom default in dashboard
        // P&L broadcast. Original `|| 10000` would silently broadcast a lie
        // about totalPnL (totalAccountValue - phantomInitialBalance) to the
        // user's dashboard if both stateManager and config sources were
        // missing. Better to crash the broadcast than show fake P&L.
        const _initialBalance = stateManager.get('initialBalance') ?? getConfigValue('backtest.initialBalance');
        if (!Number.isFinite(_initialBalance) || _initialBalance <= 0) {
          throw new Error(`CandleProcessor dashboard broadcast: initialBalance unavailable from stateManager + config (got ${_initialBalance}) — refusing to broadcast phantom P&L`);
        }
        const initialBalance = _initialBalance;
        const totalPnL = totalAccountValue - initialBalance;  // Correct: includes open position
        // Phase 4 REWRITE: executionLayer deleted - use stateManager for trade stats
        const closedTrades = stateManager.get('closedTrades') || [];
        const winningTrades = closedTrades.filter(t => t.pnl > 0).length;
        const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

        const dashboardSymbol = candle.symbol;
        const dashboardTimeframe = this.ctx.dashboardTimeframe || candle.timeframe;

        const dashboardTimestamp = marketData.timestamp;
        const dashboardIndicators = this._buildDashboardIndicators(renderPacket, marketData);
        const dashboardCandle = {
          symbol: dashboardSymbol,
          timeframe: candle.timeframe,
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: price,
          volume: parseFloat(volume),
          timestamp: dashboardTimestamp
        };
        const dashboardCandles = this.ctx.getCandlesForTimeframe(dashboardTimeframe).slice(-50);
        const dashboardPricePayload = {
          type: 'price',  // CHANGE 2025-12-11: Match frontend expected message type
          symbol: dashboardSymbol,
          asset: dashboardSymbol,
          price,
          close: price,
          volume: marketData.volume,
          timestamp: dashboardTimestamp,
          timeframe: dashboardTimeframe,
          candle: dashboardCandle,
          indicators: dashboardIndicators,
          candles: dashboardCandles,
          overlays: renderPacket.overlays,
          equity: currentEquity,
          position: stateManager.get('position'),
          totalTrades: stateManager.get('totalTrades') || closedTrades.length,
          totalPnL,
          winRate,
          data: {
            symbol: dashboardSymbol,
            asset: dashboardSymbol,
            price: price,
            close: price,
            volume: marketData.volume,
            timestamp: dashboardTimestamp,
            candle: dashboardCandle,
            indicators: dashboardIndicators,
            // CHANGE 2026-01-29: Send candles for dashboard's selected timeframe
            candles: dashboardCandles,
            timeframe: dashboardTimeframe,  // Tell dashboard what timeframe this is
            overlays: renderPacket.overlays,  // FIX: Should be 'overlays' not 'series'!
            equity: currentEquity,
            position: stateManager.get('position'),
            totalTrades: stateManager.get('totalTrades') || closedTrades.length,
            // CHANGE 2026-01-23: Include performance stats
            totalPnL: totalPnL,
            winRate: winRate
          }
        };
        this.ctx.dashboardWs.send(JSON.stringify(dashboardPricePayload));
        this._broadcastBrokerStatus({
          name: candle.brokerId,
          ok: true,
          symbol: dashboardSymbol,
          timeframe: dashboardTimeframe,
          source: 'candle_processor',
          attemptedCount: 1,
          successCount: 1,
          timestamp: dashboardTimestamp
        });

        // Broadcast edge analytics data
        this.ctx.broadcastEdgeAnalytics(price, parseFloat(volume), candle);
      } catch (error) {
        const contextParts = [
          candle.symbol ? `symbol=${candle.symbol}` : null,
          candle.timeframe ? `timeframe=${candle.timeframe}` : null,
          candle.brokerId ? `broker=${candle.brokerId}` : null
        ].filter(Boolean).join(' ');
        const suffix = contextParts ? ` (${contextParts})` : '';
        console.error(`[CandleProcessor] Dashboard broadcast failed${suffix}:`, error.stack || error.message);
        this._broadcastErrorEvent(error, {
          symbol: candle.symbol,
          timeframe: candle.timeframe,
          brokerId: candle.brokerId,
          accountId: candle.accountId,
          assetClass: candle.assetClass,
          executionMode: candle.executionMode,
          traceId
        });
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
