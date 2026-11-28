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
 * 4. Fail: retry the same scoped gap using ConfigLoader dataFeed settings
 *
 * @module core/CandleProcessor
 */

'use strict';

const ConfigLoader = require('../foundation/ConfigLoader');
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
    addConfiguredStockSymbols(symbols, getConfigValue('execution.symbols'));
    const brokerId = getConfigValue('execution.broker');
    const assetClass = getConfigValue('execution.assetClass');
    if (brokerId === 'alpaca' || assetClass === 'stocks') {
      addConfiguredStockSymbols(symbols, getConfigValue('execution.tradingPair'));
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
  return Number.isInteger(value) && value >= ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.minimumIntegerEpochMs');
}

function cleanScopeValue(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned ? cleaned : null;
}

function cleanStatusText(value) {
  const cleaned = cleanScopeValue(value);
  if (!cleaned) return null;
  return cleaned.replace(/[^\w:.-]/g, '_').slice(0, ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.statusTextLimit'));
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
  const redacted = redactErrorMessage(value, ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.redactedStatusTextLimit'));
  return cleanStatusText(redacted);
}

class CandleProcessor {
  constructor(ctx) {
    this.ctx = ctx;
    this.dataFeedConfig = this._resolveDataFeedConfig();

    // Gap recovery state
    this.candleIntervalMs = this._resolveCandleIntervalMs();
    this.gapThresholdMultiplier = this.dataFeedConfig.gapThresholdMultiplier;
    this.backfillJobs = new Map();
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

  _buildDashboardIndicators(renderPacket, marketData, indicatorSnapshot) {
    const snapshotIndicators = indicatorSnapshot.indicators;

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
    const config = this.ctx?.config?.dataFeed;
    if (!config || typeof config !== 'object') {
      throw new Error('CandleProcessor: dataFeed config missing');
    }
    return config;
  }

  _resolveCandleIntervalMs() {
    const timeframe = this.ctx?.candleTimeframe;
    const intervalMs = timeframeToMs(timeframe);
    if (!intervalMs) {
      throw new Error(`CandleProcessor: invalid candle timeframe for gap recovery (${timeframe})`);
    }
    return intervalMs;
  }

  _resolveCandleTimeframe(candle) {
    const timeframe = candle?.timeframe;
    if (typeof timeframe !== 'string' || !timeframe.trim()) {
      throw new Error(`CandleProcessor.processNewCandle: missing candle timeframe for symbol=${candle?.symbol || '(missing)'}`);
    }
    return timeframe.trim();
  }

  _resolveCandleScopeContext(candle) {
    const accountId = cleanScopeValue(candle.accountId);
    const accountIdSource = cleanScopeValue(candle.accountIdSource);

    return {
      brokerId: cleanScopeValue(candle.brokerId),
      accountId,
      accountIdSource,
      assetClass: cleanScopeValue(candle.assetClass),
      executionMode: cleanScopeValue(candle.executionMode),
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
      brokerId: candle?.brokerId || null,
      accountId: candle?.accountId || null,
      assetClass: candle?.assetClass || null,
      executionMode: candle?.executionMode || null,
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
    const frameCtx = this.ctx.getSymbolTimeframeContext(candleStoreSymbol, candleTimeframe);
    const primarySymbol = normalizeCandleSymbol(this.ctx.tradingPair);
    const candleSymbol = normalizeCandleSymbol(candleStoreSymbol);
    const isLegacyRootMirrorCandle = candleSymbol === primarySymbol
      && candleTimeframe === this.ctx.candleTimeframe;
    const updateHistory = frameCtx.priceHistory;

    // Check if this is an update to existing candle or a new candle.
    // In multi-symbol mode, the legacy root history is the primary-symbol mirror
    // only. Non-primary symbols update CandleStore/SymbolTradingContext without
    // overwriting the primary root snapshot.
    const existingIndex = updateHistory.findIndex(c => c.etime === candle.etime);
    const isUpdate = existingIndex !== -1;

    if (isUpdate) {
      // UPDATE existing candle (same etime, new OHLCV values as candle forms)
      if (isLegacyRootMirrorCandle) {
        this.ctx.priceHistory[existingIndex] = candle;
      }
      this.ctx._candleStore.addCandle(
        candleStoreSymbol,
        candleTimeframe,
        candle
      );

      // Feed IndicatorEngine for real-time updates
      if (isLegacyRootMirrorCandle && this.ctx.indicatorEngine) {
        this.ctx.indicatorEngine.updateCandle({
          t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
        });
      }

      // CC-C Multi-Symbol Commit 3/6: per-symbol indicator update on UPDATE path.
      // Mirrors the global indicatorEngine.updateCandle above against the symbol's
      // own context. Global path stays alive as fallback for not-yet-migrated
      // consumers (commits 4-6 phase it out).
      frameCtx.indicatorEngine.updateCandle({
        t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
      });
      this.ctx.strategyOrchestrator.ingestMarketCandle(candleStoreSymbol, candle);
      if (isLegacyRootMirrorCandle && this.ctx.volumeProfile) this.ctx.volumeProfile.update(candle, this.ctx.priceHistory);
      if (frameCtx.volumeProfile) frameCtx.volumeProfile.update(candle, frameCtx.priceHistory);
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
    if (isLegacyRootMirrorCandle) {
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
    if (isLegacyRootMirrorCandle && this.ctx.indicatorEngine) {
      this.ctx.indicatorEngine.updateCandle({
        t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
      });
    }

    // Feed modular entry systems (only on NEW candles, not updates)
    this.ctx.strategyOrchestrator.ingestMarketCandle(candleStoreSymbol, candle);
    if (isLegacyRootMirrorCandle && this.ctx.emaCrossover) this.ctx.emaCrossoverSignal = this.ctx.emaCrossover.update(candle, this.ctx.priceHistory);
    if (isLegacyRootMirrorCandle && this.ctx.maDynamicSR) this.ctx.maDynamicSRSignal = this.ctx.maDynamicSR.update(candle, this.ctx.priceHistory);
    // 2026-05-04: BreakAndRetest moved to self-contained pattern (owned by StrategyOrchestrator).
    if (isLegacyRootMirrorCandle && this.ctx.liquiditySweep) this.ctx.liquiditySweepSignal = this.ctx.liquiditySweep.feedCandle(candle);

    if (isLegacyRootMirrorCandle && this.ctx.volumeProfile) this.ctx.volumeProfile.update(candle, this.ctx.priceHistory);

    // CC-C Multi-Symbol Commit 3/6: per-symbol routing for NEW-candle path.
    // Routes the new candle to its SymbolTradingContext's signal modules and
    // indicatorEngine. symCtx.priceHistory is a getter onto candleStore (Trey
    // directive #1) so it already reflects the addCandle write at line ~107.
    // Existing global signal updates above (lines ~120-125) stay alive as
    // fallback for not-yet-migrated consumers; commits 4-6 phase them out.
    // First-time-seen-per-symbol log uses [BOOT] tag so silent backtest shows
    // the routing actually fired without spamming every candle.
    {
      this._firstCandleSeenSymbols ??= new Set();
      const sym = frameCtx.symbol;
      if (!this._firstCandleSeenSymbols.has(sym)) {
        console.log(`[VIS][CandleProcessor] first route candleSymbol=${candle.symbol} selected=${sym} ctxTradingPair=${normalizeCandleSymbol(this.ctx.tradingPair) || '(missing)'} price=${candle.c}`);
        this._firstCandleSeenSymbols.add(sym);
      }
      console.log(`[VIS][CandleProcessor] route candleSymbol=${candle.symbol} selected=${sym} price=${candle.c} candles=${frameCtx.priceHistory.length}`);
      frameCtx.indicatorEngine.updateCandle({
        t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v
      });
      if (frameCtx.emaCrossover)   frameCtx.emaCrossoverSignal = frameCtx.emaCrossover.update(candle, frameCtx.priceHistory);
      if (frameCtx.maDynamicSR)    frameCtx.maDynamicSRSignal  = frameCtx.maDynamicSR.update(candle, frameCtx.priceHistory);
      if (frameCtx.volumeProfile)  frameCtx.volumeProfile.update(candle, frameCtx.priceHistory);
    }
    if (traceId) {
      emitTrace(this.ctx, 'CANDLE_ACCEPTED', {
        traceId,
        symbol: candleStoreSymbol,
        timeframe: candleTimeframe,
        update: false,
        priceHistory: frameCtx.priceHistory.length,
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
    if (isLegacyRootMirrorCandle && this.ctx.priceHistory.length <= ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.warmupLogCandleCount')) {
      const candleTime = new Date(candle.t).toLocaleTimeString();
      console.log(`Candle #${this.ctx.priceHistory.length}/15 [${candleTime}]`);
    }

    // Trim history to 250
    if (isLegacyRootMirrorCandle && this.ctx.priceHistory.length > ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.legacyHistoryLimit')) {
      this.ctx.priceHistory = this.ctx.priceHistory.slice(-ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.legacyHistoryLimit'));
    }

    // Save counter
    if (isLegacyRootMirrorCandle && persist) {
      this.ctx.candleSaveCounter++;
      if (this.ctx.candleSaveCounter >= ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.saveEveryCandles')) {
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
    const closeBoundary = lastDayPhase.rthCloseMinute - ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.expectedCloseSlopMinutes');  // 30-min slop for last bar pre-close
    const isAfterClose = last.minuteOfDay >= closeBoundary;
    const isBeforeOpen = next.minuteOfDay <= ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.expectedNextOpenHour') * 60;  // 10:00 ET morning slop
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
   * The owning adapter receives the original interval, including its known
   * left candle. Its range receipt distinguishes unavailable history from a
   * fully queried interval with no native bars between the known boundaries.
   * Symbol, timeframe and owner stay attached to this job across retries.
   *
   * @param {Object} job - Gap bounds, immutable candle scope and owning broker
   * @returns {Object} { candles, coverage } with an explicit completion result
   */
  async attemptBackfill(job) {
    const { gapStart, gapEnd, traceContext, broker } = job;
    const intervalMs = timeframeToMs(traceContext.timeframe);
    const range = { start: gapStart - intervalMs, end: gapEnd - intervalMs };
    const unavailable = (reason, error = null) => ({
      candles: [], coverage: { ...range, complete: false, reason, error },
    });
    try {
      if (!broker || typeof broker.getCandles !== 'function') {
        console.error('[GAP-RECOVERY] Owning broker does not support getCandles()');
        return unavailable('broker_range_api_unavailable');
      }

      const rawSymbol = traceContext.symbol;
      const symbol = normalizeCandleSymbol(rawSymbol);
      if (!symbol) {
        console.error(`[GAP-RECOVERY] Missing candle symbol for backfill (raw=${rawSymbol})`);
        return unavailable('candle_symbol_unavailable');
      }

      const timeframe = cleanScopeValue(traceContext.timeframe);
      if (!timeframeToMs(timeframe)) {
        console.error(`[GAP-RECOVERY] Missing/invalid candle timeframe for backfill (${timeframe})`);
        return unavailable('candle_timeframe_unavailable');
      }

      const brokerId = cleanScopeValue(broker.getBrokerName());
      if (!brokerId) {
        console.error(`[GAP-RECOVERY] Missing broker identity for ${symbol} backfill; refusing broker-ambiguous REST fetch`);
        return unavailable('broker_identity_unavailable');
      }

      const assetClass = cleanScopeValue(traceContext.assetClass);
      const brokerKey = brokerId.toLowerCase();
      const stockSymbol = looksLikeStockSymbol(symbol) || looksLikeConfiguredStockSymbol(symbol);
      const cryptoUsdSymbol = looksLikeUsdCryptoSymbol(symbol) && !stockSymbol;
      if (brokerKey === 'kraken' && (
        assetClass === 'stocks' || stockSymbol
      )) {
        console.error(`[GAP-RECOVERY] Refusing to backfill stock symbol ${symbol} through Kraken`);
        return unavailable('broker_asset_mismatch');
      }
      if (brokerKey === 'alpaca' && (assetClass === 'crypto' || cryptoUsdSymbol)) {
        console.error(`[GAP-RECOVERY] Refusing to backfill crypto symbol ${symbol} through Alpaca`);
        return unavailable('broker_asset_mismatch');
      }

      // Limit controls page size; the fixed range controls which history is
      // requested. It does not slide forward when a retry or pacing is delayed.
      const fetchCount = Math.ceil((gapEnd - gapStart) / intervalMs)
        + this.dataFeedConfig.gapBackfillBufferCandles;

      console.log(`[GAP-RECOVERY] Fetching ${symbol} ${timeframe} native range ${range.start} to ${range.end}`);

      const result = await broker.getCandles(symbol, timeframe, fetchCount, range);
      const coverage = result?.coverage;
      if (!coverage || coverage.start !== range.start || coverage.end !== range.end) {
        return unavailable('broker_range_coverage_unavailable');
      }
      if (coverage.complete !== true) return { candles: [], coverage };

      const rawCandles = result.candles;
      if (!Array.isArray(rawCandles)) {
        return unavailable('provider_bars_unavailable');
      }

      // Normalize every returned candle through the shared shape-translator
      // so both Kraken-array format and Alpaca-object format converge to
      // the canonical 9-element array before filtering / sorting / replay.
      const normalized = rawCandles.map(c => normalizeOhlc(c));

      if (normalized.some(c => !c || !isIntegerEpochMs(c[0]) || !isIntegerEpochMs(c[1])
        || c[1] !== c[0] + intervalMs || ![c[2], c[3], c[4], c[5], c[7]].every(Number.isFinite))) {
        return unavailable('provider_candle_invalid');
      }
      if (!normalized.some(c => c[0] === range.start)) {
        return unavailable('range_start_unavailable');
      }

      // Filter to only candles within the gap. Canonical array positions:
      // [0]=time(ms), [1]=etime, [2]=o, [3]=h, [4]=l, [5]=c, [6]=vwap, [7]=v, [8]=count
      // Both observed boundaries already exist. Replay only the native bars
      // between them, never count the right boundary as a recovered candle.
      const gapCandles = normalized.filter(arr => arr[1] > gapStart && arr[1] < gapEnd);

      // Sort chronologically by start-time [0] (oldest first — critical
      // for indicator replay which expects monotonic time)
      gapCandles.sort((a, b) => a[0] - b[0]);

      return { candles: gapCandles, coverage };

    } catch (error) {
      console.error(`[GAP-RECOVERY] Backfill failed: ${error.message}`);
      return unavailable('backfill_request_failed', error.message);
    }
  }

  /**
   * Own the initial request and every retry for this exact scoped gap.
   * @param {number} gapStart - Start timestamp
   * @param {number} gapEnd - End timestamp
   */
  startBackfill(gapStart, gapEnd, traceContext) {
    const router = this.ctx.sessionRouter;
    if (this.ctx._shutdownRequested || router?.stopping || router?.transitionInProgress) {
      emitTrace(this.ctx, 'GAP_BACKFILL_CANCELLED', {
        ...traceContext, gapStart, gapEnd,
        reason: this.ctx._shutdownRequested || router?.stopping ? 'shutdown' : 'session_transition',
      });
      return;
    }
    const key = JSON.stringify([
      traceContext.brokerId, traceContext.accountId, traceContext.assetClass,
      traceContext.executionMode, traceContext.symbol, traceContext.timeframe,
      traceContext.sessionRouterEpoch, gapStart, gapEnd,
    ]);
    const existing = this.backfillJobs.get(key);
    if (existing) return existing.pending;
    const job = {
      key, gapStart, gapEnd, traceContext: { ...traceContext },
      broker: router?.activeBroker, timer: null,
    };
    this.backfillJobs.set(key, job);
    job.pending = this._runBackfill(job);
    return job.pending;
  }

  async _runBackfill(job) {
    if (this.backfillJobs.get(job.key) !== job) return;
    const { candles, coverage } = await this.attemptBackfill(job);
    // Handoff/stop retires the producer before a late response can be replayed.
    if (this.backfillJobs.get(job.key) !== job) return;
    if (coverage.complete === true) {
      if (candles.length > 0) this.handleBackfillSuccess(candles, {
        ...job.traceContext, gapStart: job.gapStart, gapEnd: job.gapEnd,
      });
      this._finishBackfill(job, 'completed', { coverage, recoveredCandles: candles.length });
      return;
    }
    console.error(`[GAP-RECOVERY] Backfill unavailable for ${job.traceContext.symbol} ${job.traceContext.timeframe}: ${coverage.reason}${coverage.error ? ` (${coverage.error})` : ''}; retry in ${this.backfillRetryDelayMs}ms`);
    emitTrace(this.ctx, 'GAP_BACKFILL_RETRY_SCHEDULED', {
      ...job.traceContext, gapStart: job.gapStart, gapEnd: job.gapEnd,
      retryDelayMs: this.backfillRetryDelayMs,
      coverage,
    });
    // Schedule after settlement: a slow request cannot overlap its next retry.
    job.timer = setTimeout(() => {
      job.timer = null;
      job.pending = this._runBackfill(job);
    }, this.backfillRetryDelayMs);
  }

  _finishBackfill(job, reason, receipt = {}) {
    if (job.timer !== null) clearTimeout(job.timer);
    this.backfillJobs.delete(job.key);
    emitTrace(this.ctx, reason === 'completed' ? 'GAP_BACKFILL_COMPLETED' : 'GAP_BACKFILL_CANCELLED', {
      ...job.traceContext, gapStart: job.gapStart, gapEnd: job.gapEnd, reason, ...receipt,
    });
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
      const candle = {
        t: arr[0],
        etime: arr[1],
        o: arr[2],
        h: arr[3],
        l: arr[4],
        c: arr[5],
        v: arr[7],
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
    const now = Date.now();
    const isBacktesting = getConfigValue('mode.backtest') || this.ctx.config?.enableBacktestMode;
    // An interval end dates the candle, not the delivery of its latest update.
    // In particular, a REST refresh can legitimately carry old completed bars.
    const sourceEventTimeMs = toTimestampMs(wrappedInput?.sourceEventTime);
    const sourceEventKind = cleanScopeValue(wrappedInput?.sourceEventKind);
    const sourceEventAgeMs = sourceEventTimeMs === null ? null : now - sourceEventTimeMs;
    const candleEndAgeMs = now - candleEndTimeMs;
    const sourceEventStatus = isBacktesting ? 'historical_replay'
      : sourceEventTimeMs === null || !sourceEventKind ? 'unavailable'
        : sourceEventAgeMs < 0 ? 'future_timestamp'
          : sourceEventAgeMs > this.dataFeedConfig.staleDataMaxAgeMs ? 'delayed' : 'on_time';
    if (traceId) {
      emitTrace(this.ctx, 'CANDLE_PROCESSOR_RECEIVED', {
        traceId,
        symbol: stampedSymbol || null,
        symbolSource,
        timeframe: sourceTimeframe,
        timeframeSource,
        close: Number(close),
        etime: candleEndTimeMs,
        sourceEventTimeMs,
        sourceEventKind,
        sourceEventAgeMs,
        sourceEventStatus,
        candleEndAgeMs,
        receivedAt: now,
      });
    }

    const staleAssetClass = wrappedInput?.assetClass || this.ctx.config?.assetClass;
    const staleBrokerId = wrappedInput?.brokerId || this.ctx.config?.brokerId;
    if (sourceEventStatus === 'unavailable' || sourceEventStatus === 'future_timestamp') {
      console.error(`[DATA UPDATE] ${sourceEventStatus} | symbol=${stampedSymbol} timeframe=${sourceTimeframe} source=${sourceEventKind} sourceEventTimeMs=${sourceEventTimeMs} receivedAt=${new Date(now).toISOString()}`);
    } else if (
      sourceEventStatus === 'delayed' &&
      !this._isExpectedStockMarketQuiet(staleAssetClass, staleBrokerId)
    ) {
      console.error(`[DATA UPDATE DELAYED] symbol=${stampedSymbol} timeframe=${sourceTimeframe} source=${sourceEventKind} sourceEventAgeMs=${sourceEventAgeMs} candleEndAgeMs=${candleEndAgeMs} limitMs=${this.dataFeedConfig.staleDataMaxAgeMs} receivedAt=${new Date(now).toISOString()}`);
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
    const frameCtx = this.ctx.getSymbolTimeframeContext(candle.symbol, candle.timeframe);
    const gapHistory = frameCtx.priceHistory;
    const lastCandle = gapHistory[gapHistory.length - 1];
    const isNewCandle = !lastCandle || lastCandle.etime !== candle.etime;
    const candleIntervalMs = timeframeToMs(candle.timeframe);

    // GAP DETECTION: Check for gaps only on new candles, not in backtest
    if (isNewCandle && lastCandle && !isBacktesting) {
      const gapMs = candle.etime - lastCandle.etime;
      const gapThreshold = candleIntervalMs * this.gapThresholdMultiplier;

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
          const missingCandles = Math.floor(gapMs / candleIntervalMs) - 1;
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
            sessionRouterEpoch: wrappedInput?.sessionRouterEpoch,
          };

          this.startBackfill(lastCandle.etime, candle.etime, gapTraceContext);
        }
      }
    }

    // ONE CANONICAL PATH - all candles (new and updates) go through processNewCandle
    const acceptedAsNew = this.processNewCandle(candle, { traceId, source: 'handleMarketData' });

    const previousNative = frameCtx.lastNativeData;
    const sameNativeOwner = previousNative?.sessionRouterEpoch === wrappedInput?.sessionRouterEpoch
      && previousNative?.brokerId === candle.brokerId && previousNative?.accountId === candle.accountId;
    if (!isBacktesting && sourceEventStatus === 'on_time'
        && (!sameNativeOwner || sourceEventTimeMs > previousNative.eventTimeMs
          || candle.t >= previousNative.candleStartTimeMs)) {
      frameCtx.lastNativeData = {
        eventTimeMs: sameNativeOwner ? Math.max(sourceEventTimeMs, previousNative.eventTimeMs) : sourceEventTimeMs,
        // One native refresh may deliver several bars with the same event clock.
        candleStartTimeMs: sameNativeOwner ? Math.max(candle.t, previousNative.candleStartTimeMs) : candle.t,
        // Preserve what native ingress actually delivered, independently of REST cache updates.
        candle: !sameNativeOwner || candle.t >= previousNative.candleStartTimeMs
          ? { t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v }
          : previousNative.candle,
        receivedAt: now,
        source: sourceEventKind,
        brokerId: candle.brokerId,
        accountId: candle.accountId,
        sessionRouterEpoch: wrappedInput.sessionRouterEpoch,
      };
    }

    // A late correction replaces its historical bar without moving the current
    // market-data snapshot backward. Read the newest bar from the canonical store.
    const latestCandle = frameCtx.priceHistory.at(-1);
    // MED-07: propagate null for unparseable volume instead of phantom 0.
    // Distinguishes "no trades" (legitimate zero) from "broker fed garbage"
    // (null). Downstream consumers must check finiteness before using.
    const _parsedVolume = parseFloat(latestCandle.v);
    const marketData = {
      symbol: latestCandle.symbol,
      price: latestCandle.c,
      timestamp: latestCandle.t,
      timeframe: latestCandle.timeframe,
      sessionRouterEpoch: wrappedInput?.sessionRouterEpoch,
      sessionRouterTransitionId: wrappedInput?.sessionRouterTransitionId,
      systemTime: Date.now(),  // Keep system time separately if needed
      volume: Number.isFinite(_parsedVolume) ? _parsedVolume : null,
      open: latestCandle.o,
      high: latestCandle.h,
      low: latestCandle.l
    };
    if (normalizeCandleSymbol(candle.symbol) === normalizeCandleSymbol(this.ctx.tradingPair)
        && candle.timeframe === this.ctx.candleTimeframe) {
      this.ctx.marketData = marketData;
    }
    frameCtx.marketData = marketData;

    // CHANGE 663: Broadcast market data to dashboard
    // BACKTEST_FAST: Skip dashboard broadcast entirely
    if (!getConfigValue('backtest.fast') && this.ctx.dashboardWsConnected && this.ctx.dashboardWs) {
      try {
        // CHANGE 2025-12-23: Use IndicatorEngine render packet for dashboard
        const renderPacket = frameCtx.indicatorEngine.getRenderPacket({ maxPoints: ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.renderRequestMaxPoints') });

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
        const _initialBalance = stateManager.get('initialBalance') ?? getConfigValue('startingBalance');
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
        const dashboardTimeframe = candle.timeframe;

        const dashboardTimestamp = candle.t;
        const dashboardIndicators = this._buildDashboardIndicators(renderPacket, marketData, frameCtx.indicatorEngine.getSnapshot());
        const dashboardCandle = {
          symbol: dashboardSymbol,
          timeframe: candle.timeframe,
          open: parseFloat(open),
          high: parseFloat(high),
          low: parseFloat(low),
          close: price,
          volume: parseFloat(volume),
          timestamp: dashboardTimestamp,
          etime: candle.etime
        };
        const dashboardCandles = frameCtx.priceHistory.slice(ConfigLoader.getInternalsFileValue('indicators.candleProcessorPolicy.dashboardCandleSliceStart'));
        const dashboardPricePayload = {
          type: 'price',  // CHANGE 2025-12-11: Match frontend expected message type
          symbol: dashboardSymbol,
          asset: dashboardSymbol,
          price,
          close: price,
          volume: dashboardCandle.volume,
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
            volume: dashboardCandle.volume,
            timestamp: dashboardTimestamp,
            candle: dashboardCandle,
            indicators: dashboardIndicators,
            // History and indicators belong to the incoming native candle's frame.
            candles: dashboardCandles,
            timeframe: dashboardTimeframe,
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
        this.ctx.broadcastEdgeAnalytics(candle);
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

    return { acceptedAsNew, candle, marketData };
  }

  /**
   * Cleanup on shutdown
   */
  cleanup(reason = 'candle_processor_cleanup') {
    for (const job of this.backfillJobs.values()) this._finishBackfill(job, reason);
  }
}

module.exports = CandleProcessor;
