/**
 * TradingLoop - Clean Rewrite
 *
 * Direction-agnostic. Broker-agnostic. No legacy filters.
 * 
 * FLOW:
 *   1. Gather data (indicators, patterns, regime, orchestrator)
 *   2. Check exits on active positions
 *   3. Check entries (any direction, same logic)
 *   4. Execute
 *
 * RULES:
 *   - Direction is DATA, not a special case. Buy and sell use identical paths.
 *   - Config is the ONLY source of truth. No hardcoded strings, no buried overrides.
 *   - Exit decisions and entry decisions are INDEPENDENT. An exit does not block an entry.
 *   - All actions flow through a single decision object to OrderExecutor.
 *
 * @module core/TradingLoop
 */

'use strict';

const { c: _c, o: _o, h: _h, l: _l, v: _v, t: _t } = require('./CandleHelper');
const { getInstance: getStateManager } = require('./StateManager');
const { RegimeDetector } = require('./RegimeDetector');
const FeatureExtractor = require('./FeatureExtractor');
const FeatureFlagManager = require('./FeatureFlagManager');
const TradingConfig = require('./TradingConfig');
const { getInstance: getExitContractManager } = require('./ExitContractManager');
const CandlePatternDetector = require('./CandlePatternDetector');
const { getNarrator } = require('./TradeNarrator');
const { createTraceId, emitTrace } = require('./TraceSpine');
const { stampPatternMaturity } = require('./PatternMaturity');
const flagManager = FeatureFlagManager.getInstance();

const candlePatternDetector = new CandlePatternDetector();
const stateManager = getStateManager();
const exitContractManager = getExitContractManager();
const SCOPED_DASHBOARD_FRAME_TYPES = new Set([
  'signal_analysis',
  'bot_thinking',
  'golden_setup_state',
  'gate_event'
]);

class TradingLoop {
  constructor(ctx) {
    this.ctx = ctx;
    this.analyzing = false;
    this.pendingExitSymbols = new Set();
    console.log('[TradingLoop] Initialized (clean rewrite - direction agnostic)');
  }

  _diag(stage, fields = {}) {
    if (process.env.STRATEGY_DIAG !== 'true') return;
    const parts = Object.entries(fields).map(([key, value]) => {
      let rendered = value;
      if (typeof value === 'number') {
        rendered = Number.isFinite(value) ? value.toFixed(4) : String(value);
      } else if (typeof value === 'boolean') {
        rendered = value ? 'true' : 'false';
      } else if (value === null || value === undefined) {
        rendered = 'null';
      } else if (Array.isArray(value)) {
        rendered = value.join(',');
      } else if (typeof value === 'object') {
        rendered = JSON.stringify(value);
      }
      return `${key}=${rendered}`;
    });
    console.log(`[PIPE][${stage}] ${parts.join(' ')}`);
  }

  _ledgerText(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`[LEDGER] ${label} missing or blank`);
    }
    return value.trim();
  }

  _ledgerConfidence01(value, label) {
    const confidence = Number(value);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`[LEDGER] ${label} must be explicit 0..1 confidence (got ${value})`);
    }
    return confidence;
  }

  _ledgerDirection(direction, label) {
    const normalized = this._ledgerText(direction, label).toLowerCase();
    if (normalized === 'buy' || normalized === 'long') return 'long';
    if (normalized === 'sell' || normalized === 'short') return 'short';
    if (normalized === 'hold') return 'hold';
    throw new Error(`[LEDGER] ${label} unsupported direction ${JSON.stringify(direction)}`);
  }

  _ledgerStrategyName(result, index) {
    return this._ledgerText(result?.strategyName || result?.name, `allResults[${index}].strategyName`);
  }

  _ledgerSignalMetadata(result, index) {
    const signalData = result?.signalData;
    if (!signalData || typeof signalData !== 'object') return {};

    const metadata = {};
    if (Object.prototype.hasOwnProperty.call(signalData, 'signalBasis')) {
      metadata.signalBasis = this._ledgerText(signalData.signalBasis, `allResults[${index}].signalData.signalBasis`);
    }
    if (Object.prototype.hasOwnProperty.call(signalData, 'crossoverCount')) {
      const crossoverCount = Number(signalData.crossoverCount);
      if (!Number.isInteger(crossoverCount) || crossoverCount < 0) {
        throw new Error(`[LEDGER] allResults[${index}].signalData.crossoverCount must be a non-negative integer (got ${signalData.crossoverCount})`);
      }
      metadata.crossoverCount = crossoverCount;
    }
    return metadata;
  }

  _ledgerAllResults(orchResult) {
    if (!Array.isArray(orchResult?.allResults)) {
      throw new Error('[LEDGER] orchResult.allResults missing or not an array');
    }
    if (orchResult.allResults.length === 0) {
      throw new Error('[LEDGER] orchResult.allResults empty for executable decision');
    }
    return orchResult.allResults;
  }

  _ledgerWinnerName(orchResult) {
    return this._ledgerText(orchResult?.winnerStrategy, 'orchResult.winnerStrategy');
  }

  _ledgerStrategySignal(result, index, indicators) {
    return {
      name: this._ledgerStrategyName(result, index),
      direction: this._ledgerDirection(result?.direction, `allResults[${index}].direction`),
      baseConfidence: this._ledgerConfidence01(result?.confidence, `allResults[${index}].confidence`),
      reason: this._ledgerText(result?.reason || result?.reasons?.join('; '), `allResults[${index}].reason`),
      ...this._ledgerSignalMetadata(result, index),
      indicatorValues: {
        rsi: indicators.rsi,
        ema20: indicators.ema20,
        ema50: indicators.ema50,
        atr: indicators.atr,
        trend: indicators.trend,
      },
    };
  }

  _ledgerCompetingStrategy(result, index, winnerName) {
    const name = this._ledgerStrategyName(result, index);
    return {
      name,
      adjustedConfidence: this._ledgerConfidence01(result?.confidence, `allResults[${index}].confidence`),
      rejected: name !== winnerName,
      rejectReason: name !== winnerName ? 'Lower confidence than winner' : null,
      ...this._ledgerSignalMetadata(result, index),
    };
  }

  _directionGateStatus(direction, directionFilter, enableShorts) {
    const validFilters = new Set(['both', 'long_only', 'short_only']);
    const validDirections = new Set(['buy', 'sell', 'hold']);
    if (typeof directionFilter !== 'string' || !validFilters.has(directionFilter)) {
      throw new Error(`[DIRECTION-GATE] pipeline.directionFilter expected one of both,long_only,short_only; got ${JSON.stringify(directionFilter)}`);
    }
    if (typeof enableShorts !== 'boolean') {
      throw new Error(`[DIRECTION-GATE] features.enableShorts expected boolean, got ${typeof enableShorts} (${enableShorts})`);
    }
    if (typeof direction !== 'string' || !validDirections.has(direction)) {
      throw new Error(`[DIRECTION-GATE] decision direction expected one of buy,sell,hold; got ${JSON.stringify(direction)}`);
    }

    const filterBlocksLong = directionFilter === 'short_only' && direction === 'buy';
    const filterBlocksShort = directionFilter === 'long_only' && direction === 'sell';
    const filterPassed = !(filterBlocksLong || filterBlocksShort);
    const shortsPassed = direction !== 'sell' || enableShorts === true;
    const reason = filterPassed ? (shortsPassed ? null : 'shorts_disabled') : 'direction_filter';

    return {
      allowed: filterPassed && shortsPassed,
      reason,
      direction,
      directionFilter,
      enableShorts,
      filterPassed,
      shortsPassed,
    };
  }

  _patternScope(symbol) {
    const cfg = this.ctx.config || {};
    const routerEnabled = this.ctx.runner?.sessionRouter?.enabled === true;
    const runtimeScope = this.ctx.runner && typeof this.ctx.runner.getCandleScopeEnvelope === 'function'
      ? this.ctx.runner.getCandleScopeEnvelope()
      : {};
    const scope = {
      symbol,
      brokerId: runtimeScope.brokerId || (!routerEnabled ? cfg.brokerId : null),
      accountId: runtimeScope.accountId || cfg.accountId,
      accountIdSource: runtimeScope.accountIdSource || cfg.accountIdSource,
      assetClass: runtimeScope.assetClass || (!routerEnabled ? cfg.assetClass : null),
      executionMode: cfg.enableBacktestMode ? 'backtest' : (runtimeScope.executionMode || (!routerEnabled ? cfg.executionMode : null)),
      timeframe: runtimeScope.timeframe || (!routerEnabled ? (cfg.timeframe || this.ctx.candleTimeframe) : null),
    };
    if (routerEnabled) {
      const missing = [];
      const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
      if (!hasText(scope.brokerId)) missing.push('brokerId');
      if (!hasText(scope.assetClass)) missing.push('assetClass');
      if (!hasText(scope.executionMode)) missing.push('executionMode');
      if (!hasText(scope.timeframe)) missing.push('timeframe');
      if (missing.length > 0) {
        throw new Error(`[SESSION-SCOPE] TradingLoop runtime scope incomplete (${missing.join(', ')}) - refusing static config fallback`);
      }
    }
    return scope;
  }

  _dashboardScope(symbol) {
    const cfg = this.ctx.config || {};
    const routerEnabled = this.ctx.runner?.sessionRouter?.enabled === true;
    const runtimeScope = this.ctx.runner && typeof this.ctx.runner.getCandleScopeEnvelope === 'function'
      ? this.ctx.runner.getCandleScopeEnvelope()
      : {};
    const scope = {
      symbol,
      asset: symbol,
      brokerId: runtimeScope.brokerId || (!routerEnabled ? cfg.brokerId : null),
      accountId: runtimeScope.accountId || cfg.accountId || null,
      accountIdSource: runtimeScope.accountIdSource || cfg.accountIdSource || null,
      assetClass: runtimeScope.assetClass || (!routerEnabled ? cfg.assetClass : null),
      executionMode: cfg.enableBacktestMode ? 'backtest' : (runtimeScope.executionMode || (!routerEnabled ? cfg.executionMode : null)),
      timeframe: runtimeScope.timeframe || (!routerEnabled ? (cfg.timeframe || this.ctx.candleTimeframe) : null),
    };
    if (routerEnabled) {
      const missing = [];
      const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
      if (!hasText(scope.brokerId)) missing.push('brokerId');
      if (!hasText(scope.assetClass)) missing.push('assetClass');
      if (!hasText(scope.executionMode)) missing.push('executionMode');
      if (!hasText(scope.timeframe)) missing.push('timeframe');
      if (missing.length > 0) {
        throw new Error(`[SESSION-SCOPE] TradingLoop dashboard scope incomplete (${missing.join(', ')}) - refusing static config fallback`);
      }
    }
    return scope;
  }

  _missingDashboardScopeFields(frame) {
    if (!frame || !SCOPED_DASHBOARD_FRAME_TYPES.has(frame.type)) return [];
    const missing = [];
    const hasText = (value) => value !== null && value !== undefined && String(value).trim() !== '';
    for (const field of ['symbol', 'brokerId', 'accountId', 'assetClass', 'executionMode', 'timeframe']) {
      if (!hasText(frame[field])) missing.push(field);
    }
    return missing;
  }

  _sendDashboardFrame(frame) {
    const ws = this.ctx.dashboardWs;
    if (!ws || ws.readyState !== 1) return false;

    const missingScope = this._missingDashboardScopeFields(frame);
    if (missingScope.length > 0) {
      console.error(`[TradingLoop] ${frame?.type || 'dashboard'} scope incomplete (${missingScope.join(', ')}) - refusing unscoped websocket frame`);
      return false;
    }

    try {
      ws.send(JSON.stringify(frame));
      return true;
    } catch (err) {
      console.error(`[TradingLoop] dashboard ${frame?.type || 'unknown'} broadcast failed: ${err.message}`);
      return false;
    }
  }

  _broadcastGateEvent({ traceId, signalId, symbol, action, kind, decision, riskGates, reason }) {
    const gates = Array.isArray(riskGates) ? riskGates : [];
    if (gates.length === 0) return false;

    const failedGate = gates.find(g => g && g.passed === false);
    const missingPassGate = gates.find(g => !g || typeof g.passed !== 'boolean');
    const passed = gates.length > 0 && !failedGate && !missingPassGate;
    const eventKind = kind === 'eval_pass' && !passed ? 'risk_check' : (kind || (passed ? 'eval_pass' : 'risk_block'));
    const rejectReason = reason
      || failedGate?.rejectReason
      || decision?.blockReason
      || (missingPassGate ? 'risk gate missing pass state' : null);
    const scope = this._dashboardScope(symbol);

    const frame = {
      type: 'gate_event',
      timestamp: Date.now(),
      traceId: traceId || decision?.traceId || null,
      signalId: signalId || decision?.signalId || null,
      action: action || decision?.action || null,
      kind: eventKind,
      passed,
      reason: rejectReason,
      riskGates: gates,
      data: {
        ...scope,
        traceId: traceId || decision?.traceId || null,
        signalId: signalId || decision?.signalId || null,
        action: action || decision?.action || null,
        kind: eventKind,
        passed,
        reason: rejectReason,
        riskGates: gates,
      },
      ...scope,
    };
    const sentFrame = this._sendDashboardFrame(frame);
    try { getNarrator().gateDecision(frame); } catch (_) { /* narrator is non-critical */ }
    return sentFrame;
  }

  _isClosingShort(activeTrade) {
    const action = String(activeTrade.action || '').trim().toUpperCase();
    const direction = String(activeTrade.direction || '').trim().toLowerCase();
    if (direction === 'short' || action === 'SELL_SHORT') return true;
    if (direction === 'long' || action === 'BUY') return false;
    throw new Error(`[TradingLoop] active trade ${activeTrade.orderId || activeTrade.id || 'unknown'} missing close side`);
  }

  _checkTtpConsistencyProfitCap(activeTrade, price) {
    const evalRules = this.ctx.evalRules || this.ctx.config?.evalRules || {};
    const cfg = evalRules.ttp?.consistency || {};
    if (evalRules.enabled !== true || evalRules.ttp?.enabled !== true) {
      return { enabled: false, shouldExit: false };
    }

    if (cfg.enabled !== true) {
      throw new Error('[TTP_CONSISTENCY] consistency rule disabled or missing while TTP eval rules are enabled');
    }

    const stockAliases = ['stocks', 'stock', 'equities', 'equity', 'etfs', 'etf'];
    const runtimeScope = this._patternScope(activeTrade.symbol || this.ctx.marketData?.symbol || null);
    const runtimeAssetClass = String(runtimeScope.assetClass || '').trim().toLowerCase();
    if (!runtimeAssetClass) {
      throw new Error('[TTP_CONSISTENCY] runtime assetClass missing while TTP eval rules are enabled');
    }
    if (!stockAliases.includes(runtimeAssetClass)) {
      return { enabled: true, shouldExit: false, reason: 'non_stock_runtime_asset_class', assetClass: runtimeAssetClass };
    }
    const tradeAssetClass = String(activeTrade.assetClass || '').trim().toLowerCase();
    if (tradeAssetClass && !stockAliases.includes(tradeAssetClass)) {
      throw new Error(`[TTP_CONSISTENCY] active trade ${activeTrade.orderId || activeTrade.id || 'unknown'} assetClass=${tradeAssetClass} conflicts with stock runtime`);
    }

    const profitTargetDollars = Number(cfg.profitTargetDollars);
    const maxPositionProfitRatio = Number(cfg.maxPositionProfitRatio);
    if (!Number.isFinite(profitTargetDollars) || profitTargetDollars <= 0) {
      throw new Error(`[TTP_CONSISTENCY] invalid profitTargetDollars=${cfg.profitTargetDollars}`);
    }
    if (!Number.isFinite(maxPositionProfitRatio) || maxPositionProfitRatio <= 0 || maxPositionProfitRatio > 1) {
      throw new Error(`[TTP_CONSISTENCY] invalid maxPositionProfitRatio=${cfg.maxPositionProfitRatio}`);
    }

    const entryPrice = Number(activeTrade.entryPrice);
    const sizeUsd = Number(activeTrade.sizeUsd ?? activeTrade.size);
    const currentPrice = Number(price);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new Error(`[TTP_CONSISTENCY] active trade ${activeTrade.orderId || activeTrade.id || 'unknown'} missing valid entryPrice`);
    }
    if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) {
      throw new Error(`[TTP_CONSISTENCY] active trade ${activeTrade.orderId || activeTrade.id || 'unknown'} missing valid sizeUsd/size`);
    }
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error(`[TTP_CONSISTENCY] invalid current price ${price}`);
    }

    const isShort = this._isClosingShort(activeTrade);
    const pnlDollars = isShort
      ? sizeUsd * ((entryPrice - currentPrice) / entryPrice)
      : sizeUsd * ((currentPrice - entryPrice) / entryPrice);
    const maxPositionProfitDollars = profitTargetDollars * maxPositionProfitRatio;

    return {
      enabled: true,
      shouldExit: pnlDollars >= maxPositionProfitDollars,
      ruleId: 'TTP_CONSISTENCY_PROFIT_CAP',
      tradeId: activeTrade.id || activeTrade.orderId || null,
      symbol: activeTrade.symbol || null,
      direction: isShort ? 'short' : 'long',
      entryPrice,
      currentPrice,
      sizeUsd,
      pnlDollars,
      profitTargetDollars,
      maxPositionProfitRatio,
      maxPositionProfitDollars,
    };
  }

  _buildTtpConsistencyExitDecision(activeTrade, price, symbol, traceId, source) {
    const consistencyCheck = this._checkTtpConsistencyProfitCap(activeTrade, price);
    if (consistencyCheck.enabled) {
      emitTrace(this.ctx, 'TTP_CONSISTENCY_CHECK', {
        traceId,
        symbol,
        source,
        tradeId: consistencyCheck.tradeId,
        shouldExit: consistencyCheck.shouldExit,
        pnlDollars: consistencyCheck.pnlDollars,
        maxPositionProfitDollars: consistencyCheck.maxPositionProfitDollars,
        maxPositionProfitRatio: consistencyCheck.maxPositionProfitRatio,
        profitTargetDollars: consistencyCheck.profitTargetDollars,
        reason: consistencyCheck.reason || null,
      });
    }
    if (!consistencyCheck.shouldExit) return null;

    const isClosingShort = this._isClosingShort(activeTrade);
    return {
      action: isClosingShort ? 'COVER' : 'SELL',
      direction: 'close',
      confidence: 100,
      exitReason: 'ttp_consistency_profit_cap',
      tradeId: activeTrade.id || activeTrade.orderId,
      traceId,
      signalId: `${traceId}:exit`,
    };
  }

  /**
   * Main analysis loop. Called on every candle.
   * CC-C Commit 5/6: `symbol` is REQUIRED. No null-default fallback to
   * ctx.tradingPair — that path was the multi-broker-arbitrage single-leg-
   * liquidation footgun (Mercury Pass 3 finding G). Callers must pass the
   * symbol explicitly: single-symbol mode passes `this.tradingPair` from the
   * runner; multi-symbol mode (commit 6+) passes per-dispatch symbol from
   * the OHLC handler. Throws on missing/invalid so callers fail loud.
   */
  async analyzeAndTrade(symbol, traceId = createTraceId('trace')) {
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error(
        `TradingLoop.analyzeAndTrade requires explicit non-empty string symbol; got ${JSON.stringify(symbol)}`
      );
    }
    // Concurrency guard — one analysis at a time
    if (this.analyzing) {
      emitTrace(this.ctx, 'ANALYSIS_SKIP', { traceId, symbol, reason: 'concurrency_guard' });
      return;
    }
    this.analyzing = true;

    try {
      await this._analyze(symbol, traceId);
    } finally {
      this.analyzing = false;
      await this._drainPendingExitChecks();
    }
  }

  /**
   * Exit-only monitor for sub-candle protection. Entry decisions remain
   * candle-close driven so live/paper cadence matches the backtest path.
   */
  async checkExitsOnly(symbol) {
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error(
        `TradingLoop.checkExitsOnly requires explicit non-empty string symbol; got ${JSON.stringify(symbol)}`
      );
    }
    if (this.analyzing) {
      this.pendingExitSymbols.add(symbol);
      this._diag('EXIT_ONLY_QUEUED', { symbol });
      return;
    }
    this.analyzing = true;

    try {
      await this._checkExitsOnly(symbol);
    } finally {
      this.analyzing = false;
      await this._drainPendingExitChecks();
    }
  }

  async _drainPendingExitChecks() {
    if (!this.pendingExitSymbols || this.pendingExitSymbols.size === 0) return;
    const symbols = Array.from(this.pendingExitSymbols);
    this.pendingExitSymbols.clear();
    for (const symbol of symbols) {
      await this.checkExitsOnly(symbol);
    }
  }

  async _checkExitsOnly(symbol) {
    const traceId = createTraceId('trace');
    emitTrace(this.ctx, 'EXIT_ONLY_START', { traceId, symbol });
    const symCtx = this.ctx.symbolContexts?.get(symbol);
    const marketData = symCtx?.marketData
      ?? (this.ctx.marketData?.symbol === symbol ? this.ctx.marketData : null);
    const stateLastPrice = typeof stateManager.getLastPrice === 'function'
      ? stateManager.getLastPrice(symbol)
      : null;
    const price = Number.isFinite(stateLastPrice) && stateLastPrice > 0
      ? stateLastPrice
      : marketData?.price;
    const priceSource = Number.isFinite(stateLastPrice) && stateLastPrice > 0
      ? 'state_last_price'
      : (marketData?.priceSource || 'market_data');
    if (!Number.isFinite(price) || price <= 0) {
      this._diag('EXIT_ONLY_NO_PRICE', {
        symbol,
        marketSymbol: this.ctx.marketData?.symbol || 'missing'
      });
      return;
    }

    const activeTrades = stateManager.getTradesBySymbol(symbol);
    if (activeTrades.length === 0) return;

    const priceHistory = symCtx?.priceHistory ?? this.ctx.priceHistory;
    const indicatorEngine = symCtx?.indicatorEngine ?? this.ctx.indicatorEngine;
    const fibonacciDetector = symCtx?.fibonacciDetector ?? this.ctx.fibonacciDetector;
    const dtoState = indicatorEngine.getSnapshot();
    const indicators = dtoState.indicators || {};
    indicators.ema12 = indicators.ema9 ?? null;
    indicators.ema26 = indicators.ema21 ?? null;
    indicators.volatility = indicators.atr ?? null;
    indicators.bbWidth = indicators.bb?.bandwidth ?? null;
    indicators.bollingerBands = indicators.bb;
    indicators.trend = indicators.superTrendDirection ?? null;

    let nearestFibLevel = null;
    if (fibonacciDetector && priceHistory.length >= 30) {
      const fibLevels = fibonacciDetector.update(priceHistory);
      if (fibLevels) nearestFibLevel = fibonacciDetector.getNearestLevel(price);
    }
    const rawIndicatorState = typeof indicatorEngine.getRawState === 'function'
      ? indicatorEngine.getRawState()
      : null;
    const nearestStructure = this._nearestStructure(price, nearestFibLevel, rawIndicatorState?.sr);

    const _initialBalance = this.ctx.backtestRecorder?.startingBalance ?? stateManager.get('initialBalance');
    if (!Number.isFinite(_initialBalance) || _initialBalance <= 0) {
      throw new Error(`TradingLoop exit-only: initialBalance unavailable from backtestRecorder.startingBalance and stateManager.get('initialBalance') (got ${_initialBalance})`);
    }

    for (const activeTrade of activeTrades) {
      const consistencyDecision = this._buildTtpConsistencyExitDecision(
        activeTrade,
        price,
        symbol,
        traceId,
        'exit_only'
      );
      if (consistencyDecision) {
        await this.ctx.executeTrade(consistencyDecision, { totalConfidence: 100 }, price, indicators, [], null, null, symbol);
        return;
      }

      exitContractManager.updateMaxProfit(activeTrade, price);

      const exitCheck = exitContractManager.checkExitConditions(activeTrade, price, {
        indicators,
        currentTime: priceSource === 'state_last_price' ? Date.now() : (marketData?.timestamp ?? Date.now()),
        accountBalance: this.ctx.backtestRecorder?.balance ?? stateManager.getEquity(price),
        initialBalance: _initialBalance,
        currentPosition: stateManager.get('position'),
        currentPrice: price,
        priceSource
      });

      if (exitCheck.shouldExit) {
        if (!exitCheck.exitReason) {
          throw new Error('[MED-01] exitCheck.shouldExit=true but exitCheck.exitReason missing — exit-checker contract violation');
        }
        const isClosingShort = this._isClosingShort(activeTrade);
        await this.ctx.executeTrade({
          action: isClosingShort ? 'COVER' : 'SELL',
          direction: 'close',
          confidence: exitCheck.confidence || 100,
          exitReason: exitCheck.exitReason,
          tradeId: activeTrade.id || activeTrade.orderId,
          traceId,
          signalId: `${traceId}:exit`
        }, { totalConfidence: exitCheck.confidence || 100 }, price, indicators, [], null, null, symbol);
        return;
      }

      const mpm = this.ctx.maxProfitManagers?.get(activeTrade.id || activeTrade.orderId);
      if (mpm?.state?.active) {
        if (!Number.isFinite(indicators.volatility)) {
          console.warn('[HIGH-02] indicators.volatility missing/non-finite — passing null to MaxProfitManager.update; dynamic trailing update will be skipped unless ATR is present');
        }
        const profitResult = mpm.update(price, {
          volatility: indicators.volatility ?? null,
          trend: indicators.trend || 'sideways',
          volume: marketData?.volume || 0,
          atr: indicators.atr,
          rsi: indicators.rsi,
          candle: priceHistory[priceHistory.length - 1],
          recentCandles: priceHistory.slice(-20),
          nearestStructure
        });

        if (profitResult && (profitResult.action === 'exit_full' || profitResult.action === 'exit_partial')) {
          const isClosingShort = this._isClosingShort(activeTrade);
          await this.ctx.executeTrade({
            action: isClosingShort ? 'COVER' : 'SELL',
            direction: 'close',
            confidence: 100,
            exitSize: profitResult.exitSize,
            exitFraction: profitResult.exitFraction,
            exitReason: profitResult.reason,
            tradeId: activeTrade.id || activeTrade.orderId,
            traceId,
            signalId: `${traceId}:exit`
          }, { totalConfidence: 100 }, price, indicators, [], null, null, symbol);
          return;
        }
      }
    }
  }

  async _analyze(symbol, traceId = createTraceId('trace')) {
    // CC-C Commit 5/6: `symbol` is REQUIRED. analyzeAndTrade enforces this
    // upstream; the redundant check here is defense-in-depth in case _analyze
    // is ever called from a sibling path that bypasses analyzeAndTrade.
    if (typeof symbol !== 'string' || !symbol) {
      throw new Error(
        `TradingLoop._analyze requires explicit non-empty string symbol; got ${JSON.stringify(symbol)}`
      );
    }
    // CC-C Multi-Symbol Commit 4: resolve per-symbol context if wired.
    // symCtx may be null when commit 6's per-symbol context wiring hasn't
    // been activated yet for this symbol; the per-data-type `symCtx?.X ??
    // this.ctx.X` resolvers below handle that gracefully (commit 4's surface,
    // not commit 5's — kept as-is, separate concern).
    const symCtx = this.ctx.symbolContexts?.get(symbol);
    // _gatherData re-resolves indicatorEngine/fibonacciDetector via its own
    // symCtx pass — declaring them here too was dead code (Mercury attack #4).
    const priceHistory = symCtx?.priceHistory ?? this.ctx.priceHistory;
    const analysisScope = this._dashboardScope(symbol);
    emitTrace(this.ctx, 'ANALYSIS_START', {
      traceId,
      symbol,
      route: symCtx ? 'symbolContext' : 'global',
      brokerId: analysisScope.brokerId,
      assetClass: analysisScope.assetClass,
      timeframe: analysisScope.timeframe,
      priceHistory: priceHistory.length,
    });
    console.log(`[VIS][TradingLoop] analyze symbol=${symbol} route=${symCtx ? 'symbolContext' : 'global'} marketSymbol=${this.ctx.marketData?.symbol || '(missing)'} priceHistory=${priceHistory.length} broker=${analysisScope.brokerId || '(missing)'} assetClass=${analysisScope.assetClass || '(missing)'}`);
    if (symCtx && !this._firstAnalyzedSymbols) this._firstAnalyzedSymbols = new Set();
    if (symCtx && !this._firstAnalyzedSymbols.has(symbol)) {
      console.log(`[BOOT][TradingLoop] first analysis cycle for ${symbol} via symCtx path`);
      this._firstAnalyzedSymbols.add(symbol);
    }

    const { price } = this.ctx.marketData;

    // ─── WARMUP CHECK ───
    if (priceHistory.length < 15) {
      this._diag('WARMUP_BLOCK', {
        symbol,
        priceHistory: priceHistory.length,
        required: 15
      });
      emitTrace(this.ctx, 'ANALYSIS_SKIP', {
        traceId,
        symbol,
        reason: 'warmup',
        priceHistory: priceHistory.length,
        required: 15,
      });
      return;
    }

    // ─── GATHER DATA ───
    const { indicators, patterns, regime, tpoResult, fibLevels, nearestFibLevel, nearestStructure } = this._gatherData(price, symCtx, symbol);

    // ─── RUN ORCHESTRATOR ───
    const orchResult = this.ctx.strategyOrchestrator.evaluate(
      indicators, patterns, regime, priceHistory,
      {
        // CC-C Multi-Symbol Commit 4/6: prefer per-symbol signal outputs when
        // available (populated by CandleProcessor commit 3 onto symCtx). Fall
        // back to the legacy global runner / ctx refs for single-symbol mode.
        emaCrossoverSignal: symCtx?.emaCrossoverSignal ?? this.ctx.runner?.emaCrossoverSignal ?? this.ctx.emaCrossoverSignal,
        maDynamicSRSignal: symCtx?.maDynamicSRSignal ?? this.ctx.runner?.maDynamicSRSignal ?? this.ctx.maDynamicSRSignal,
        // 2026-05-04: breakRetestSignal removed — orchestrator now owns BreakAndRetest instance directly.
        liquiditySweepSignal: this.ctx.runner?.liquiditySweepSignal || this.ctx.liquiditySweepSignal,
        mtfAdapter: this.ctx.runner?.mtfAdapter || this.ctx.mtfAdapter,
        tpoResult,
        price,
        fibLevels,
        nearestFibLevel,
        volumeProfile: symCtx?.volumeProfile ?? this.ctx.runner?.volumeProfile ?? this.ctx.volumeProfile,
        symbol,
        // HIGH-16: pass timeframe so orchestrator can validate + scale SL/TP
        // per timeframe instead of falling back to '15m' silently.
        timeframe: this.ctx.candleTimeframe,
      }
    );

    const tradingDirection = orchResult.direction; // 'buy', 'sell', or 'hold'
    // HIGH-25: throw on non-finite orchestrator confidence. `undefined/100` and
    // `NaN/100` both produce NaN; `NaN < minConfidence` is false, so all entries
    // would silently block with no alert. Post-CRIT-09/CRIT-10 the orchestrator
    // always emits confidence — this throw catches future regressions visibly.
    // Caught by runner at run-empire-v2.js:1466-1471 (logs and skips tick).
    if (!Number.isFinite(orchResult.confidence)) {
      throw new Error(`[HIGH-25] orchResult.confidence non-finite (got ${orchResult.confidence}) — investigate StrategyOrchestrator output`);
    }
    if (orchResult.confidence < 0 || orchResult.confidence > 100) {
      throw new Error(`[HIGH-25] orchResult.confidence out of range 0..100 (got ${orchResult.confidence}) — investigate StrategyOrchestrator output`);
    }
    const confidence = orchResult.confidence / 100;
    const confidenceData = { totalConfidence: orchResult.confidence };
    this._diag('ORCH_RESULT', {
      symbol,
      direction: tradingDirection,
      confidencePct: orchResult.confidence,
      winner: orchResult.winnerStrategy || 'none',
      allResults: Array.isArray(orchResult.allResults) ? orchResult.allResults.length : 0,
      exitContract: !!orchResult.exitContract
    });
    emitTrace(this.ctx, 'STRATEGY_DECISION', {
      traceId,
      symbol,
      direction: tradingDirection,
      confidencePct: orchResult.confidence,
      winnerStrategy: orchResult.winnerStrategy || null,
      candidateCount: Array.isArray(orchResult.allResults) ? orchResult.allResults.length : 0,
      hasExitContract: !!orchResult.exitContract,
    });

    // ─── DIRECTION FILTER (configurable, not hardcoded) ───
    const directionFilter = TradingConfig.get('pipeline.directionFilter');
    const enableShorts = TradingConfig.get('features.enableShorts');
    const minConfidence = this.ctx.config.minTradeConfidence;

    // ─── LOG ───
    const cleanPrice = Math.round(price).toLocaleString();
    console.log(`\n📊 $${cleanPrice} | Conf: ${orchResult.confidence.toFixed(0)}% | RSI: ${Math.round(indicators.rsi)} | ${indicators.trend} | ${regime.currentRegime || 'analyzing'}`);
    console.log(`🔍 PRE-DECISION: direction=${tradingDirection}, conf=${orchResult.confidence.toFixed(1)}%`);

    // ─── TPO OVERRIDE ───
    let overrideSignal = null;
    let signalSource = null;
    let finalDirection = tradingDirection;

    if (tpoResult?.signal?.highProbability) {
      if (tpoResult.signal.strength > TradingConfig.get('confidence.tpoStrengthMin')) {
        overrideSignal = tpoResult.signal;
        signalSource = 'TPO';
        finalDirection = tpoResult.signal.action === 'BUY' ? 'buy' : 'sell';
      }
    }

    const directionGate = this._directionGateStatus(finalDirection, directionFilter, enableShorts);
    if (!directionGate.allowed) {
      this._diag('DIRECTION_GATE_BLOCK', {
        symbol,
        reason: directionGate.reason,
        filter: directionFilter,
        enableShorts,
        direction: finalDirection,
        confidencePct: orchResult.confidence
      });
      emitTrace(this.ctx, 'DECISION_SKIP', {
        traceId,
        symbol,
        reason: directionGate.reason,
        filter: directionFilter,
        enableShorts,
        direction: finalDirection,
        finalDirection,
        confidencePct: orchResult.confidence,
        minConfidencePct: minConfidence * 100,
      });
      console.log(`[DIRECTION-GATE] Blocked ${finalDirection}: reason=${directionGate.reason} filter=${directionFilter} enableShorts=${enableShorts}`);
      this._broadcastAndReturn(symbol, price, indicators, patterns, regime, orchResult, confidenceData);
      return;
    }

    // ─── TRAI (async observer, non-blocking) ───
    this._runTRAI(finalDirection, orchResult, indicators, patterns, regime, price, symbol);

    // ═══════════════════════════════════════════════════════════════
    // DECISION ENGINE — Direction agnostic
    // Step 1: Check exits on ALL active positions
    // Step 2: Check if a new entry is valid
    // Step 3: Execute whatever decision was made
    // ═══════════════════════════════════════════════════════════════

    // CC-C Commit 5/6: symbol is REQUIRED at this layer (entry-checked
    // above). The prior `?? this.ctx.tradingPair` dispatch resolver was
    // ripped per Mercury Pass 3 finding G — under multi-broker arbitrage
    // a missing-symbol fallback to ctx.tradingPair could exit-check the
    // wrong leg, leaving the other broker's positions unchecked (single-
    // leg liquidation, real-money risk). All callers (runner.analyzeAndTrade,
    // run15mTradingCycle, the interval cycle, BacktestRunner) now pass
    // symbol explicitly.
    const activeTrades = stateManager.getTradesBySymbol(symbol);
    const maxPositions = TradingConfig.get('positionSizing.maxPositions') ?? 3;

    let decision = { action: 'HOLD', confidence: orchResult.confidence };
    this._diag('ENTRY_CONTEXT', {
      symbol,
      finalDirection,
      confidencePct: orchResult.confidence,
      minConfidencePct: minConfidence * 100,
      activeTrades: activeTrades.length,
      maxPositions,
      directionFilter,
      enableShorts
    });

    // ─── STEP 1: EXIT CHECK ───
    // Check each active position for exit conditions
    // This is INDEPENDENT of entry signals
    const currentPosition = stateManager.get('position');
    // FIX 2026-03-29: Use activeTrades.length only - net position=0 when long+short cancel out
    const hasOpenPosition = activeTrades.length > 0;
    if (hasOpenPosition) {
      // CRIT-08-followup-C: refuse $10K phantom default in exit-check context.
      // The prior chain `?? 10000` would silently pass $10K to
      // exitContractManager.checkExitConditions if both backtestRecorder
      // and stateManager initialBalance were missing — masking a setup
      // bug while exit calculations ran against phantom capital. Pre-money
      // fail-loud, hoisted out of the for-loop (same value per iteration).
      const _initialBalance = this.ctx.backtestRecorder?.startingBalance ?? stateManager.get('initialBalance');
      if (!Number.isFinite(_initialBalance) || _initialBalance <= 0) {
        throw new Error(`TradingLoop exit-check: initialBalance unavailable from backtestRecorder.startingBalance and stateManager.get('initialBalance') (got ${_initialBalance}) — refusing $10K phantom default`);
      }
      for (const activeTrade of activeTrades) {
        const consistencyDecision = this._buildTtpConsistencyExitDecision(
          activeTrade,
          price,
          symbol,
          traceId,
          'candle_exit'
        );
        if (consistencyDecision) {
          decision = consistencyDecision;
          break;
        }

        exitContractManager.updateMaxProfit(activeTrade, price);

        const exitCheck = exitContractManager.checkExitConditions(activeTrade, price, {
        indicators,
        currentTime: this.ctx.marketData?.timestamp ?? Date.now(),
        // FIX 2026-04-09: Use getEquity() for live mode to get true account value
        accountBalance: this.ctx.backtestRecorder?.balance ?? stateManager.getEquity(price),
        initialBalance: _initialBalance,
        currentPosition: stateManager.get('position'),
        currentPrice: price
      });

      if (exitCheck.shouldExit) {
        console.log(`[EXIT-CONTRACT] ${exitCheck.details}`);
        // Determine correct exit action based on what we're closing
        const isClosingShort = this._isClosingShort(activeTrade);
        // MED-01: throw on missing exitReason. All exit checkers
        // (TakeProfitChecker/StopLossChecker/MaxHoldChecker/etc.) MUST emit
        // a specific reason. Halt-class — refuses to silently attribute the
        // exit as 'signal' when the source contract is broken.
        if (exitCheck.shouldExit && !exitCheck.exitReason) {
          throw new Error('[MED-01] exitCheck.shouldExit=true but exitCheck.exitReason missing — exit-checker contract violation');
        }
        decision = {
          action: isClosingShort ? 'COVER' : 'SELL',
          direction: 'close',
          confidence: exitCheck.confidence || 100,
          exitReason: exitCheck.exitReason,
          tradeId: activeTrade.id
        };
        break; // Exit one position per candle
      }

      // MaxProfitManager check — per-trade instance from Map
      const mpm = this.ctx.maxProfitManagers?.get(activeTrade.id);
      if (mpm?.state?.active) {
        const recentCandles = priceHistory.slice(-20);
        // HIGH-02: was `volatility: indicators.volatility || 0` — masked
        // missing volatility as 0, causing MaxProfitManager.updateTrailingStop
        // to compute zero-volatility ATR adjustments (tight trailing fires
        // immediately on minor noise). Now: preserve explicit zero with `??`,
        // log when truly missing so the silent-bypass is observable.
        if (!Number.isFinite(indicators.volatility)) {
          console.warn('[HIGH-02] indicators.volatility missing/non-finite — passing null to MaxProfitManager.update; dynamic trailing update will be skipped unless ATR is present');
        }
        const profitResult = mpm.update(price, {
          volatility: indicators.volatility ?? null,
          trend: indicators.trend || 'sideways',
          volume: this.ctx.marketData?.volume || 0,
          atr: indicators.atr,
          rsi: indicators.rsi,
          candle: priceHistory[priceHistory.length - 1],
          recentCandles,
          nearestStructure
        });

        if (profitResult && (profitResult.action === 'exit_full' || profitResult.action === 'exit_partial')) {
          const isClosingShort = this._isClosingShort(activeTrade);
          decision = {
            action: isClosingShort ? 'COVER' : 'SELL',
            direction: 'close',
            confidence: 100,
            exitSize: profitResult.exitSize,
            exitFraction: profitResult.exitFraction,
            exitReason: profitResult.reason,
            tradeId: activeTrade.id
          };
          break;
        }
      }
      } // end for (const activeTrade of activeTrades)
    } // end if (hasOpenPosition)

    // ─── STEP 2: ENTRY CHECK ───
    // Only if no exit was triggered AND we have a directional signal
    if (decision.action === 'HOLD' && finalDirection !== 'hold' && confidence >= minConfidence) {
      const globalHaltReason = stateManager.isHalted() ? stateManager.getHaltReason() : null;
      const symbolHaltReason = stateManager.isSymbolHalted(symbol) ? stateManager.getSymbolHaltReason(symbol) : null;

      // Same-direction stacking check
      const hasPositionInDirection = activeTrades.some(t => {
        if (finalDirection === 'buy') return t.direction === 'long' || t.action === 'BUY';
        if (finalDirection === 'sell') return t.direction === 'short' || t.action === 'SELL_SHORT';
        return false;
      });

      // FIX 2026-03-29: Opposite direction = close existing + open new (PineScript behavior)
      // On same ticker, don't hedge - flip the position instead
      const hasOppositePosition = activeTrades.some(t => {
        if (finalDirection === 'buy') return t.direction === 'short' || t.action === 'SELL_SHORT';
        if (finalDirection === 'sell') return t.direction === 'long' || t.action === 'BUY';
        return false;
      });

      if (globalHaltReason) {
        this._diag('ENTRY_BLOCK', {
          symbol,
          reason: 'global_halt',
          detail: globalHaltReason
        });
        console.error(`[ENTRY] Blocked: new entries halted globally - ${globalHaltReason}`);
        decision = { action: 'HOLD', confidence: orchResult.confidence, blockReason: globalHaltReason };
      } else if (symbolHaltReason) {
        this._diag('ENTRY_BLOCK', {
          symbol,
          reason: 'symbol_halt',
          detail: symbolHaltReason
        });
        console.error(`[ENTRY] Blocked: ${symbol} entries halted - ${symbolHaltReason}`);
        decision = { action: 'HOLD', confidence: orchResult.confidence, blockReason: symbolHaltReason };
      } else if (hasPositionInDirection) {
        this._diag('ENTRY_BLOCK', {
          symbol,
          reason: 'same_direction_position',
          direction: finalDirection,
          activeTrades: activeTrades.length
        });
        console.log(`[ENTRY] Blocked: already holding ${finalDirection === 'buy' ? 'long' : 'short'} position`);
        decision = { action: 'HOLD', confidence: orchResult.confidence, blockReason: 'same_direction_position' };
      } else if (hasOppositePosition) {
        this._diag('ENTRY_BLOCK', {
          symbol,
          reason: 'opposite_position_flip_first',
          direction: finalDirection,
          activeTrades: activeTrades.length
        });
        // Close opposite position first, then open new in next candle
        // This mimics PineScript's strategy.entry which replaces positions
        const oppositeTrade = activeTrades.find(t => {
          if (finalDirection === 'buy') return t.direction === 'short' || t.action === 'SELL_SHORT';
          if (finalDirection === 'sell') return t.direction === 'long' || t.action === 'BUY';
          return false;
        });
        if (oppositeTrade) {
          const isClosingShort = oppositeTrade.direction === 'short' || oppositeTrade.action === 'SELL_SHORT';
          console.log(`[FLIP] Closing ${isClosingShort ? 'short' : 'long'} to flip to ${finalDirection}`);
          decision = {
            action: isClosingShort ? 'COVER' : 'SELL',
            direction: 'close',
            confidence: confidence,
            exitReason: 'flip_position',
            tradeId: oppositeTrade.id
          };
          // Note: New position opens on next signal after close completes
        }
      } else if (activeTrades.length >= maxPositions) {
        this._diag('ENTRY_BLOCK', {
          symbol,
          reason: 'max_positions',
          activeTrades: activeTrades.length,
          maxPositions
        });
        console.log(`[ENTRY] Blocked: at max positions (${activeTrades.length}/${maxPositions})`);
        decision = { action: 'HOLD', confidence: orchResult.confidence, blockReason: 'max_positions' };
      } else {
        this._diag('RISK_CHECK_START', {
          symbol,
          direction: finalDirection,
          confidencePct: orchResult.confidence,
          minConfidencePct: minConfidence * 100
        });
        // ─── RISK CHECK ───
        decision = this._checkRiskAndBuildDecision(finalDirection, orchResult, minConfidence, confidence);
        if (decision && decision.action === 'HOLD' && Array.isArray(decision.riskGates) && decision.riskGates.length > 0) {
          decision.traceId = decision.traceId || traceId;
          decision.signalId = decision.signalId || `${traceId}:signal`;
          this._broadcastGateEvent({
            traceId: decision.traceId,
            signalId: decision.signalId,
            symbol,
            action: decision.action,
            kind: 'risk_block',
            decision,
            riskGates: decision.riskGates,
            reason: decision.blockReason || 'risk gate blocked entry',
          });
        }
        // CC-A Change 2: stamp indicator state at entry on the decision so
        // BacktestRecorder Change 1 (record.atrAtEntry / regimeAtEntry /
        // rsiAtEntry) gets real values instead of null. Read-only — no new
        // computation; just copying already-computed indicator readings.
        if (decision && decision.action !== 'HOLD') {
          decision.atrAtEntry = indicators?.atr ?? null;
          decision.regimeAtEntry = regime?.currentRegime ?? null;
          decision.rsiAtEntry = indicators?.rsi ?? null;
        }
      }
    }

    if (decision.action === 'HOLD') {
      const reasons = [];
      if (finalDirection === 'hold') reasons.push('hold_direction');
      if (confidence < minConfidence) reasons.push('below_min_confidence');
      this._diag('ENTRY_SKIP', {
        symbol,
        reason: reasons.length > 0 ? reasons.join('|') : 'not_entry_candidate',
        finalDirection,
        confidencePct: orchResult.confidence,
        minConfidencePct: minConfidence * 100,
        decisionAction: decision.action
      });
      emitTrace(this.ctx, 'DECISION_SKIP', {
        traceId,
        symbol,
        reason: reasons.length > 0 ? reasons.join('|') : (decision.blockReason || 'not_entry_candidate'),
        finalDirection,
        confidencePct: orchResult.confidence,
        minConfidencePct: minConfidence * 100,
      });
    }

    // ─── ATTACH OVERRIDE LEVELS ───
    if (overrideSignal && decision.action !== 'HOLD') {
      decision.signalSource = signalSource;
      decision.overrideSignal = overrideSignal;
      if (overrideSignal.levels) {
        decision.suggestedStopLoss = overrideSignal.levels.stopLoss || overrideSignal.stop;
        decision.suggestedTakeProfit = overrideSignal.levels.takeProfit || overrideSignal.target1;
      } else if (overrideSignal.stop && overrideSignal.target1) {
        decision.suggestedStopLoss = overrideSignal.stop;
        decision.suggestedTakeProfit = overrideSignal.target1;
      }
    }

    // ─── STORE STATE ───
    this.ctx.lastConfidence = confidenceData.totalConfidence;
    this.ctx.lastDirection = finalDirection;

    // ─── BROADCAST ───
    this._broadcastDecision(symbol, price, indicators, patterns, regime, orchResult, decision, confidenceData, minConfidence);

    // ─── EXECUTE ───
    if (decision.action !== 'HOLD') {
      const isEntryAction = decision.action === 'BUY' || decision.action === 'SELL_SHORT';
      decision.traceId = decision.traceId || traceId;
      decision.signalId = decision.signalId || `${traceId}:signal`;
      this._diag('EXECUTE_HANDOFF', {
        symbol,
        action: decision.action,
        direction: decision.direction || 'none',
        confidencePct: decision.confidence,
        winner: orchResult.winnerStrategy || 'none',
        exitContract: !!orchResult.exitContract
      });
      let riskGates = Array.isArray(decision.riskGates) ? decision.riskGates : [];
      if (isEntryAction) {
        const executionDirectionGate = this._directionGateStatus(finalDirection, directionFilter, enableShorts);
        // L5: Capture risk gates that were checked during entry evaluation.
        // Pre-trade gates built here (warmup, min_confidence, direction_filter, shorts_enabled, same_direction_block,
        // max_positions). RiskManager contributes its own gates (drawdown_circuit, daily/weekly/monthly
        // loss limits, recovery min_confidence) via decision.riskGates — appended below.
        riskGates = [
          { gate: 'warmup', threshold: 15, value: priceHistory.length, passed: priceHistory.length >= 15 },
          { gate: 'min_confidence', threshold: minConfidence, value: confidence, passed: confidence >= minConfidence },
          { gate: 'direction_filter', threshold: directionFilter, value: finalDirection, passed: executionDirectionGate.filterPassed },
          { gate: 'shorts_enabled', threshold: true, value: finalDirection === 'sell' ? enableShorts : 'not_applicable', passed: executionDirectionGate.shortsPassed },
          { gate: 'same_direction_block', threshold: null, value: finalDirection, passed: !activeTrades.some(t => (finalDirection === 'buy' && (t.direction === 'long' || t.action === 'BUY')) || (finalDirection === 'sell' && (t.direction === 'short' || t.action === 'SELL_SHORT'))) },
          { gate: 'max_positions', threshold: maxPositions, value: activeTrades.length, passed: activeTrades.length < maxPositions },
          ...riskGates,
        ];

        // L1+L2: Attach full ledger data to entry decisions for StateManager.openPosition.
        const allResults = this._ledgerAllResults(orchResult);
        const winnerName = this._ledgerWinnerName(orchResult);
        const winnerIndex = allResults.findIndex((result, index) => this._ledgerStrategyName(result, index) === winnerName);
        const winnerSignalMetadata = winnerIndex >= 0 ? this._ledgerSignalMetadata(allResults[winnerIndex], winnerIndex) : {};
        const ledgerScope = this._patternScope(symbol);
        decision.ledgerData = {
          candleTimestamp: this.ctx.marketData.timestamp || Date.now(),
          symbol,
          brokerId: ledgerScope.brokerId || null,
          accountId: ledgerScope.accountId || null,
          accountIdSource: ledgerScope.accountIdSource || null,
          assetClass: ledgerScope.assetClass || null,
          timeframe: ledgerScope.timeframe || null,
          executionMode: ledgerScope.executionMode || 'paper',
          traceId: decision.traceId,
          signalId: decision.signalId,
          // L2: every strategy that fired — winner AND losers with indicator values
          strategySignals: allResults.map((result, index) => this._ledgerStrategySignal(result, index, indicators)),
          // L2: orchestrator decision with competing strategies
          orchestratorDecision: {
            winnerStrategy: winnerName,
            finalConfidence: confidence,
            ...winnerSignalMetadata,
            reason: allResults.length > 1
              ? `${winnerName} (${orchResult.confidence.toFixed(1)}%) selected over ${allResults.length - 1} alternatives`
              : `${winnerName} selected at ${orchResult.confidence.toFixed(1)}%`,
            competingStrategies: allResults.map((result, index) => this._ledgerCompetingStrategy(result, index, winnerName)),
          },
          confluence: orchResult.confluence ? {
            // HIGH-17: ledger honesty for confluence count. Zero strategies
            // agreeing IS meaningful info; `|| 1` lied it as one. Use `??`
            // mirroring CRIT-07-followup semantics for sizingMultiplier.
            count: orchResult.confluence.count ?? 1,
            agreeingStrategies: orchResult.confluence.strategies || [],
            // CRIT-07-followup: mirror OrderExecutor's `??` semantics on the
            // ledger side. With `||` an actual sizingMultiplier of 0 would
            // be silently logged as 1.0 — diverging from the (correctly
            // CRIT-07-preserved) zero used by the actual sizing math at
            // OrderExecutor.js:274 (BUY) and :428 (SHORT).
            sizingMultiplier: orchResult.sizingMultiplier ?? 1.0,
            reason: `${orchResult.confluence.count ?? 1} strategies agree on ${orchResult.direction}`,
          } : { count: 1, sizingMultiplier: 1.0 },
          exitContract: orchResult.exitContract || null,
          // L5: risk gates checked before entry
          riskGates,
        };
      }
      emitTrace(this.ctx, 'EXECUTE_HANDOFF', {
        traceId: decision.traceId,
        signalId: decision.signalId,
        symbol,
        action: decision.action,
        direction: decision.direction || null,
        confidencePct: decision.confidence,
        winner: orchResult.winnerStrategy || null,
        signalBasis: orchResult.allResults?.find(r => r.strategyName === orchResult.winnerStrategy)?.signalData?.signalBasis || null,
        crossoverCount: orchResult.allResults?.find(r => r.strategyName === orchResult.winnerStrategy)?.signalData?.crossoverCount ?? null,
        riskGateCount: riskGates.length,
      });
      if (isEntryAction) {
        this._broadcastGateEvent({
          traceId: decision.traceId,
          signalId: decision.signalId,
          symbol,
          action: decision.action,
          kind: 'eval_pass',
          decision,
          riskGates,
        });
      }
      const executionResult = await this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult, symbol);
      const executionSuccess = typeof executionResult?.success === 'boolean'
        ? executionResult.success
        : false;
      const executionReason = executionResult?.reason
        || (typeof executionResult?.success === 'boolean' ? null : 'execute_trade_return_missing_success');
      this._diag('EXECUTE_RETURN', {
        symbol,
        action: decision.action,
        success: executionSuccess,
        orderId: executionResult?.orderId || null,
        reason: executionReason,
        orderAccepted: executionResult?.orderAccepted ?? null,
        stateMutationSucceeded: executionResult?.stateMutationSucceeded ?? null
      });
      emitTrace(this.ctx, 'EXECUTE_RETURN', {
        traceId: decision.traceId,
        signalId: decision.signalId,
        symbol,
        action: decision.action,
        success: executionSuccess,
        orderId: executionResult?.orderId || null,
        reason: executionReason,
        orderAccepted: executionResult?.orderAccepted ?? null,
        stateMutationSucceeded: executionResult?.stateMutationSucceeded ?? null,
      });
    }
  }

  /**
   * Risk check + build decision — SAME LOGIC for buy and sell.
   * The ONLY difference is the action string and direction label.
   */
  _checkRiskAndBuildDecision(direction, orchResult, minConfidence, confidence) {
    // Map direction to action/label
    const actionMap = {
      buy:  { action: 'BUY',        direction: 'long'  },
      sell: { action: 'SELL_SHORT',  direction: 'short' }
    };
    const mapped = actionMap[direction];
    if (!mapped) return { action: 'HOLD', confidence: 0 };

    if (this.ctx.riskManager) {
      // L5 observability: collect riskGates arrays from both RiskManager calls.
      // Each call returns its own array of {gate, threshold, value, passed, rejectReason}.
      // Concatenated and surfaced to caller so StateManager can attach to the trade ledger.
      const riskCheck = this.ctx.riskManager.isTradingAllowed();
      const riskGates = [...(riskCheck.riskGates || [])];
      this._diag('RISK_ALLOWED', {
        direction,
        allowed: riskCheck.allowed,
        reason: riskCheck.reason || 'none',
        gates: riskGates.length
      });
      if (!riskCheck.allowed) {
        console.log(`[RISK] BLOCK: ${riskCheck.reason} - ${mapped.direction} rejected`);
        return { action: 'HOLD', confidence: 0, blockReason: riskCheck.reason, riskGates };
      }

      const riskAssessment = this.ctx.riskManager.assessTradeRisk({
        confidence,
        direction
      });
      riskGates.push(...(riskAssessment.riskGates || []));
      this._diag('RISK_ASSESSMENT', {
        direction,
        approved: riskAssessment.approved,
        reason: riskAssessment.reason || 'none',
        riskLevel: riskAssessment.riskLevel || 'unknown',
        gates: riskGates.length
      });

      if (!riskAssessment.approved) {
        console.log(`[RISK] BLOCK: ${riskAssessment.reason} - ${mapped.direction} rejected`);
        return { action: 'HOLD', confidence: 0, blockReason: riskAssessment.reason, riskGates };
      }

      console.log(`[DECISION] ${mapped.action}: Confidence ${orchResult.confidence.toFixed(1)}% >= ${(minConfidence * 100).toFixed(0)}% | Direction: ${mapped.direction}`);
      if (riskAssessment.riskLevel !== 'LOW') {
        console.log(`[RISK] Level: ${riskAssessment.riskLevel} - ${riskAssessment.recommendation}`);
      }

      return {
        action: mapped.action,
        direction: mapped.direction,
        confidence: orchResult.confidence,
        riskLevel: riskAssessment.riskLevel,
        riskRecommendation: riskAssessment.recommendation,
        riskGates,
      };
    }

    // Fallback if no riskManager
    console.log(`[DECISION] ${mapped.action}: Confidence ${orchResult.confidence.toFixed(1)}% >= ${(minConfidence * 100).toFixed(0)}% | Direction: ${mapped.direction}`);
    return {
      action: mapped.action,
      direction: mapped.direction,
      confidence: orchResult.confidence
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DATA GATHERING — unchanged from original, just extracted
  // ═══════════════════════════════════════════════════════════════

  _gatherData(price, symCtx = null, symbol = null) {
    // CC-C Multi-Symbol Commit 4/6: same per-symbol shadowing pattern as
    // _analyze. When symCtx is passed, route data-gathering reads through it;
    // otherwise fall back to this.ctx.* for single-symbol legacy callers.
    const priceHistory       = symCtx?.priceHistory       ?? this.ctx.priceHistory;
    const indicatorEngine    = symCtx?.indicatorEngine    ?? this.ctx.indicatorEngine;
    const fibonacciDetector  = symCtx?.fibonacciDetector  ?? this.ctx.fibonacciDetector;

    // Indicators
    const dtoState = indicatorEngine.getSnapshot();
    const indicators = dtoState.indicators;
    indicators.ema12 = indicators.ema9 ?? null;
    indicators.ema26 = indicators.ema21 ?? null;
    indicators.volatility = indicators.atr ?? null;
    indicators.bbWidth = indicators.bb?.bandwidth ?? null;
    indicators.bollingerBands = indicators.bb;
    indicators.trend = indicators.superTrendDirection ?? null;

    // Patterns
    const patternScope = this._patternScope(symbol);
    const memoryPatterns = this.ctx.patternChecker.analyzePatterns({
      candles: priceHistory,
      trend: indicators.trend,
      macd: indicators.macd?.macd ?? indicators.macd?.macdLine ?? null,
      macdSignal: indicators.macd?.signal ?? indicators.macd?.signalLine ?? null,
      rsi: indicators.rsi,
      volume: this.ctx.marketData.volume ?? null,
      ...patternScope
    });
    // 2026-05-04: Re-enabled per Wolf strategy-resurrection spec.
    // Original disable (2026-03-20 ceb0ffb) cited 2000+ garbage entries in
    // pattern_performance — root cause was unbounded JSON-of-features signature
    // keying, fixed in EnhancedPatternRecognition._signatureFromFeatures().
    // Re-enable safe with quantized signatures + 70% conf filter below.
    const rawCandlePatterns = candlePatternDetector.detect(priceHistory, {
      rsi: indicators.rsi,
      trend: indicators.trend,
      macd: indicators.macd?.macd ?? null,
      volume: this.ctx.marketData?.volume ?? null
    });
    const minPatternConf = TradingConfig.get('confidence.candlePatternMinConfidence') || 0.70;
    const candlePatterns = rawCandlePatterns.filter(p => (p.confidence || 0) >= minPatternConf);
    const patterns = [...candlePatterns, ...memoryPatterns];

    // Record patterns for learning (skip in backtest/replay modes)
    if (patterns.length > 0 && !this.ctx.backtestFast) {
      const telemetry = require('./Telemetry').getTelemetry();
      const canRecordPatternObservations =
        !this.ctx.config?.enableBacktestMode &&
        process.env.BACKTEST_NO_PATTERN_SAVE !== 'true' &&
        typeof this.ctx.patternChecker?.memory?.recordObservation === 'function';
      const canReadPatternStats =
        typeof this.ctx.patternChecker?.memory?.getPatternStats === 'function';
      if (canRecordPatternObservations && !canReadPatternStats) {
        throw new Error('[PATTERN][OBSERVE] pattern memory records observations but exposes no getPatternStats readback');
      }
      let recordedObservations = 0;
      patterns.forEach(pattern => {
        // MED-08: skip telemetry record for nameless patterns instead of
        // collapsing them all into 'unknown_pattern' bucket. Detector contract
        // requires .signature OR .name; refuse to bucket-hash without either.
        const signature = pattern.signature || pattern.name;
        if (!signature) {
          return;
        }
        if (!Array.isArray(pattern.features)) {
          pattern.features = FeatureExtractor.extractArray({ indicators, candles: priceHistory });
        }
        let observed = null;
        if (canRecordPatternObservations && Array.isArray(pattern.features) && pattern.features.length > 0) {
          observed = this.ctx.patternChecker.memory.recordObservation(pattern.features, {
            timestamp: this.ctx.marketData?.timestamp ?? Date.now(),
            strategy: pattern.name || pattern.type,
            price,
            ...patternScope,
          });
          if (observed) recordedObservations++;
        }
        if (Array.isArray(pattern.features) && pattern.features.length > 0) {
          const stats = canReadPatternStats
            ? this.ctx.patternChecker.memory.getPatternStats(pattern.features, patternScope)
            : null;
          if (canReadPatternStats && observed && !stats) {
            throw new Error(`[PATTERN][OBSERVE] memory recorded ${observed} but getPatternStats returned no stats`);
          }
          stampPatternMaturity(pattern, stats);
        }
        telemetry.event('pattern_detected', { signature, confidence: pattern.confidence, price });
      });
      if (recordedObservations > 0) {
        this._patternObservationCount = (this._patternObservationCount || 0) + recordedObservations;
        if (this._patternObservationCount === recordedObservations || this._patternObservationCount % 100 === 0) {
          console.log(`[PATTERN][OBSERVE] recorded=${recordedObservations} total=${this._patternObservationCount} price=${price}`);
        }
      }
    }
    this.ctx.broadcastPatternAnalysis(patterns, indicators, symbol);

    // Regime
    const _regimeDetector = new RegimeDetector();
    const regimeResult = _regimeDetector.detect(indicators, priceHistory);
    // MED-09: trust RegimeDetector's contract — every return path
    // (RegimeDetector.js:65, 91, 231, 239, 247, 254) supplies a .regime field.
    // Soft-warn + || 'unknown' fallback was dead defense. Throw if the
    // contract is genuinely broken instead of silently masking.
    if (!regimeResult.regime) {
      throw new Error(`[MED-09] RegimeDetector.detect returned no .regime field — detector contract violation`);
    }
    const regime = {
      currentRegime: regimeResult.regime,
      confidence: regimeResult.confidence,
      parameters: regimeResult.details || {}
    };
    this.ctx.marketRegime = regime;

    // Fibonacci
    let fibLevels = null;
    let nearestFibLevel = null;
    if (fibonacciDetector && priceHistory.length >= 30) {
      fibLevels = fibonacciDetector.update(priceHistory);
      if (fibLevels) nearestFibLevel = fibonacciDetector.getNearestLevel(price);
    }

    const rawIndicatorState = typeof indicatorEngine.getRawState === 'function'
      ? indicatorEngine.getRawState()
      : null;
    const nearestStructure = this._nearestStructure(price, nearestFibLevel, rawIndicatorState?.sr);

    // TPO
    let tpoResult = null;
    if (this.ctx.ogzTpo && priceHistory.length > 0) {
      const latestCandle = priceHistory[priceHistory.length - 1];
      tpoResult = this.ctx.ogzTpo.update({
        o: _o(latestCandle), h: _h(latestCandle), l: _l(latestCandle), c: _c(latestCandle),
        t: latestCandle.time || Date.now()
      });
      if (tpoResult?.signal) {
        console.log(`\n🎯 OGZ TPO Signal: ${tpoResult.signal.action} (${tpoResult.signal.zone}) | Strength: ${(tpoResult.signal.strength * 100).toFixed(2)}%`);
      }
    }

    return { indicators, patterns, regime, tpoResult, fibLevels, nearestFibLevel, nearestStructure };
  }

  _nearestStructure(price, nearestFibLevel = null, sr = null) {
    if (!Number.isFinite(price) || price <= 0) return null;

    const candidates = [];
    if (nearestFibLevel && Number.isFinite(nearestFibLevel.price) && Number.isFinite(nearestFibLevel.distance)) {
      candidates.push({
        type: 'fibonacci',
        level: nearestFibLevel.level,
        price: nearestFibLevel.price,
        distance: nearestFibLevel.distance,
        isGoldenZone: nearestFibLevel.isGoldenZone
      });
    }

    const addLevels = (levels, type) => {
      if (!Array.isArray(levels)) return;
      for (const levelPrice of levels) {
        if (!Number.isFinite(levelPrice) || levelPrice <= 0) continue;
        candidates.push({
          type,
          price: levelPrice,
          distance: Math.abs(price - levelPrice) / price * 100
        });
      }
    };

    addLevels(sr?.supports, 'support');
    addLevels(sr?.resistances, 'resistance');

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }

  // ═══════════════════════════════════════════════════════════════
  // TRAI — async observer, non-blocking
  // ═══════════════════════════════════════════════════════════════

  _runTRAI(direction, orchResult, indicators, patterns, regime, price, symbol) {
    const skipTRAI = this.ctx.config.enableBacktestMode && !this.ctx.traiEnableBacktest;
    if (!this.ctx.trai || skipTRAI) return;

    try {
      const patternScope = this._patternScope(symbol);
      this.ctx.trai.processDecision(
        { action: direction.toUpperCase(), confidence: orchResult.confidence, patterns, indicators, price, timestamp: Date.now(), ...patternScope },
        { volatility: indicators.volatility, trend: indicators.trend, volume: this.ctx.marketData.volume || 'normal', regime: regime.currentRegime || 'unknown', indicators, positionSize: stateManager.get('balance') * TradingConfig.get('positionSizing.basePositionSize'), currentPosition: stateManager.get('position'), ...patternScope }
      ).then(d => { if (d?.id) this.ctx._lastTraiDecision = d; })
       .catch(err => console.warn('[TRAI] Error:', err.message));
    } catch (e) {
      console.error('TRAI error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD BROADCAST
  // ═══════════════════════════════════════════════════════════════

  _broadcastAndReturn(symbol, price, indicators, patterns, regime, orchResult, confidenceData) {
    this._broadcastDecision(symbol, price, indicators, patterns, regime, orchResult, { action: 'HOLD' }, confidenceData, 0);
  }

  _finiteDashboardNumber(...values) {
    for (const value of values) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
    return null;
  }

  _dashboardIndicatorsPayload(indicators) {
    const macd = indicators?.macd;
    return {
      rsi: this._finiteDashboardNumber(indicators?.rsi),
      atr: this._finiteDashboardNumber(indicators?.atr),
      macd: this._finiteDashboardNumber(macd?.macd, macd?.macdLine, macd),
      macdSignal: this._finiteDashboardNumber(macd?.signal, macd?.signalLine, indicators?.macdSignal),
      macdHistogram: this._finiteDashboardNumber(macd?.hist, macd?.histogram, indicators?.macdHistogram),
      volume: this._finiteDashboardNumber(indicators?.volume, this.ctx.marketData?.volume)
    };
  }

  _broadcastDecision(symbol, price, indicators, patterns, regime, orchResult, decision, confidenceData, minConfidence) {
    const scope = this._dashboardScope(symbol);
    const dashboardIndicators = this._dashboardIndicatorsPayload(indicators);
    const winnerResult = Array.isArray(orchResult?.allResults)
      ? orchResult.allResults.find(r => r.strategyName === orchResult.winnerStrategy)
      : null;
    const winnerSignalData = winnerResult?.signalData || {};

    // Signal analysis broadcast
    const signals = orchResult?.signalBreakdown?.signals || [];
    this._sendDashboardFrame({
      type: 'signal_analysis',
      timestamp: Date.now(),
      ...scope,
      signal: {
        symbol,
        direction: orchResult.direction,
        confidence: orchResult.confidence,
        reasons: orchResult.reasons || [],
        meta: { signalsFired: signals.length, bullishCount: signals.filter(s => s.direction === 'buy').length, bearishCount: signals.filter(s => s.direction === 'sell').length },
        signals
      },
      modules: {
        orchestrator: orchResult ? {
          winner: orchResult.winnerStrategy,
          direction: orchResult.direction,
          confidence: orchResult.confidence,
          confluence: orchResult.confluence,
          sizingMultiplier: orchResult.sizingMultiplier,
          signalBasis: winnerSignalData.signalBasis || null,
          crossoverCount: winnerSignalData.crossoverCount ?? null,
        } : null,
        regime: { regime: regime?.currentRegime || 'unknown', confidence: regime?.confidence || 0 }
      }
    });

    // Chain-of-thought broadcast + Strategy Winner HUD
    const reasoning = decision.action === 'HOLD'
      ? (decision.blockReason
        ? `Blocked: ${decision.blockReason}`
        : `Waiting: Confidence ${decision.confidence?.toFixed(1) || 0}% < ${(minConfidence * 100).toFixed(0)}% minimum`)
      : `${decision.action}: Confidence ${decision.confidence?.toFixed(1)}% | ${orchResult.winnerStrategy || 'signal'}`;
    this._sendDashboardFrame({
      type: 'bot_thinking',
      timestamp: Date.now(),
      ...scope,
      message: reasoning,
      confidence: decision.confidence,
      data: {
        ...scope,
        reasoning,
        price,
        regime: regime?.currentRegime || 'unknown',
        module: orchResult.winnerStrategy || 'orchestrator',
        indicators: dashboardIndicators
      },
      // Strategy Winner HUD: full battleground for confidence bar chart.
      // Show ALL configured strategies (zero-confidence placeholders for
      // non-firing) so the heatbar reflects the complete roster, not
      // only what produced a signal this cycle. Public `name` is
      // anonymized via TradeNarrator.labelFor() (Strategy-A/B/C);
      // `realName` is kept on the wire for internal tooling.
      strategy_stack: (() => {
        const orch = this.ctx.strategyOrchestrator;
        if (!orch || !Array.isArray(orch.strategies)) return undefined;
        const narrator = getNarrator();
        const labelOf = narrator && typeof narrator.labelFor === 'function'
          ? n => narrator.labelFor(n)
          : n => n;
        const firing = new Map((orchResult.allResults || []).map(r => [r.strategyName, r]));
        return orch.strategies
          .map(s => {
            const fired = firing.get(s.name);
            return {
              id: s.name,
              realName: s.name,
              name: labelOf(s.name),
              confidence: fired ? fired.confidence : 0,
              direction: fired ? (fired.direction || 'hold') : 'hold',
              signalBasis: fired?.signalData?.signalBasis || null,
              crossoverCount: fired?.signalData?.crossoverCount ?? null
            };
          })
          .sort((a, b) => b.confidence - a.confidence);
      })(),
      winner_id: orchResult.winnerStrategy || null
    });

    // Golden Setup Emitter: proximity score + confluence matrix
    const conditions = [
      { label: 'RSI Oversold/Overbought', status: (indicators.rsi < 30 || indicators.rsi > 70) ? 'MET' : 'WAITING', weight: 0.2 },
      { label: 'EMA Trend Alignment', status: (indicators.ema20 > indicators.ema50) ? 'MET' : 'WAITING', weight: 0.2 },
      { label: 'Strategy Confluence', status: (orchResult.confluence?.count >= 2) ? 'MET' : 'WAITING', weight: 0.2 },
      { label: 'High Confidence', status: (orchResult.confidence >= 65) ? 'MET' : 'WAITING', weight: 0.2 },
      { label: 'Regime Favorable', status: (regime?.currentRegime === 'trending_up' || regime?.currentRegime === 'trending_down') ? 'MET' : 'WAITING', weight: 0.2 }
    ];
    const proximity = conditions.reduce((acc, c) => acc + (c.status === 'MET' ? c.weight : 0), 0);
    this._sendDashboardFrame({
      type: 'golden_setup_state',
      ...scope,
      proximity,
      is_golden: proximity >= 0.8,
      conditions,
      timestamp: Date.now()
    });
  }
}

module.exports = TradingLoop;
