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
const flagManager = FeatureFlagManager.getInstance();

const candlePatternDetector = new CandlePatternDetector();
const stateManager = getStateManager();
const exitContractManager = getExitContractManager();

class TradingLoop {
  constructor(ctx) {
    this.ctx = ctx;
    this.analyzing = false;
    // BUG FIX 2026-04-28 (Mercury catch): per-trade close-dispatch mutex.
    // analyzeAndTrade() and checkExitsOnly() can run concurrently if a 15m
    // candle closes during a 15s timer tick. Without this set, both paths
    // can call executeTrade for the same tradeId → StateManager.closePosition
    // double-fires, MaxProfitManager.update double-advances, pnl
    // double-counts. Set guards EVERY exit-dispatch site in this class.
    this._exitInFlight = new Set();
    console.log('[TradingLoop] Initialized (clean rewrite - direction agnostic)');
  }

  /**
   * Mutex helper — wraps an async exit dispatch with the _exitInFlight
   * guard. If the tradeId is already being closed by the OTHER path, this
   * caller skips. Otherwise marks in-flight, runs the dispatch, releases
   * in a finally so a thrown error doesn't leak the lock.
   */
  async _dispatchExit(tradeId, dispatchFn) {
    if (!tradeId) return false;
    if (this._exitInFlight.has(tradeId)) {
      console.log(`[EXIT-MUTEX] skip — ${tradeId} already in flight`);
      return false;
    }
    this._exitInFlight.add(tradeId);
    try {
      await dispatchFn();
      return true;
    } finally {
      this._exitInFlight.delete(tradeId);
    }
  }

  /**
   * Main analysis loop. Called on every candle.
   */
  async analyzeAndTrade() {
    // Concurrency guard — one analysis at a time
    if (this.analyzing) return;
    this.analyzing = true;

    try {
      await this._analyze();
    } finally {
      this.analyzing = false;
    }
  }

  async _analyze() {
    const { price } = this.ctx.marketData;

    // ─── WARMUP CHECK ───
    if (this.ctx.priceHistory.length < 15) return;

    // ─── GATHER DATA ───
    const { indicators, patterns, regime, tpoResult, fibLevels, nearestFibLevel } = this._gatherData(price);

    // ─── RUN ORCHESTRATOR ───
    const orchResult = this.ctx.strategyOrchestrator.evaluate(
      indicators, patterns, regime, this.ctx.priceHistory,
      {
        emaCrossoverSignal: this.ctx.runner?.emaCrossoverSignal || this.ctx.emaCrossoverSignal,
        maDynamicSRSignal: this.ctx.runner?.maDynamicSRSignal || this.ctx.maDynamicSRSignal,
        breakRetestSignal: this.ctx.runner?.breakRetestSignal || this.ctx.breakRetestSignal,
        liquiditySweepSignal: this.ctx.runner?.liquiditySweepSignal || this.ctx.liquiditySweepSignal,
        mtfAdapter: this.ctx.runner?.mtfAdapter || this.ctx.mtfAdapter,
        tpoResult,
        price,
        fibLevels,
        nearestFibLevel,
        volumeProfile: this.ctx.runner?.volumeProfile || this.ctx.volumeProfile,
      }
    );

    const tradingDirection = orchResult.direction; // 'buy', 'sell', or 'hold'
    const confidence = orchResult.confidence / 100; // normalize to 0-1
    const confidenceData = { totalConfidence: orchResult.confidence };

    // ─── DIRECTION FILTER (configurable, not hardcoded) ───
    const directionFilter = TradingConfig.get('pipeline.directionFilter') || 'both';
    if (directionFilter === 'long_only' && tradingDirection === 'sell') {
      console.log(`🚫 Direction filter: long_only — sell blocked`);
      this._broadcastAndReturn(price, indicators, patterns, regime, orchResult, confidenceData);
      return;
    }
    if (directionFilter === 'short_only' && tradingDirection === 'buy') {
      console.log(`🚫 Direction filter: short_only — buy blocked`);
      this._broadcastAndReturn(price, indicators, patterns, regime, orchResult, confidenceData);
      return;
    }

    // ─── TRAI (async observer, non-blocking) ───
    this._runTRAI(tradingDirection, orchResult, indicators, patterns, regime, price);

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

    // ═══════════════════════════════════════════════════════════════
    // DECISION ENGINE — Direction agnostic
    // Step 1: Check exits on ALL active positions
    // Step 2: Check if a new entry is valid
    // Step 3: Execute whatever decision was made
    // ═══════════════════════════════════════════════════════════════

    const allTrades = stateManager.getAllTrades();
    const activeTrades = allTrades.filter(t => t.action === 'BUY' || t.action === 'SELL_SHORT');
    const maxPositions = TradingConfig.get('positionSizing.maxPositions') || 3;
    const minConfidence = this.ctx.config.minTradeConfidence;

    let decision = { action: 'HOLD', confidence: orchResult.confidence };

    // ─── STEP 1: EXIT CHECK ───
    // Check each active position for exit conditions
    // This is INDEPENDENT of entry signals
    const currentPosition = stateManager.get('position');
    // FIX 2026-03-29: Use activeTrades.length only - net position=0 when long+short cancel out
    const hasOpenPosition = activeTrades.length > 0;
    if (hasOpenPosition) for (const activeTrade of activeTrades) {
      exitContractManager.updateMaxProfit(activeTrade, price);

      const exitCheck = exitContractManager.checkExitConditions(activeTrade, price, {
        indicators,
        currentTime: this.ctx.marketData?.timestamp || Date.now(),
        // FIX 2026-04-09: Use getEquity() for live mode to get true account value
        accountBalance: this.ctx.backtestRecorder?.balance ?? stateManager.getEquity(price),
        initialBalance: this.ctx.backtestRecorder?.startingBalance ?? stateManager.get('initialBalance') ?? 10000,
        currentPosition: stateManager.get('position'),
        currentPrice: price
      });

      if (exitCheck.shouldExit) {
        console.log(`[EXIT-CONTRACT] ${exitCheck.details}`);
        // Determine correct exit action based on what we're closing
        const isClosingShort = activeTrade.direction === 'short' || activeTrade.action === 'SELL_SHORT';
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
        const recentCandles = this.ctx.priceHistory.slice(-20);
        const profitResult = mpm.update(price, {
          volatility: indicators.volatility || 0,
          trend: indicators.trend || 'sideways',
          volume: this.ctx.marketData?.volume || 0,
          atr: indicators.atr,
          rsi: indicators.rsi,
          candle: this.ctx.priceHistory[this.ctx.priceHistory.length - 1],
          recentCandles,
          nearestStructure: null  // TODO: wire in structure levels later
        });

        if (profitResult && (profitResult.action === 'exit_full' || profitResult.action === 'exit_partial')) {
          const isClosingShort = activeTrade.direction === 'short' || activeTrade.action === 'SELL_SHORT';
          decision = {
            action: isClosingShort ? 'COVER' : 'SELL',
            direction: 'close',
            confidence: orchResult.confidence,
            exitSize: profitResult.exitSize,
            exitFraction: profitResult.exitFraction,
            exitReason: profitResult.reason,
            tradeId: activeTrade.id
          };
          break;
        }
      }
    }

    // ─── STEP 2: ENTRY CHECK ───
    // Only if no exit was triggered AND we have a directional signal
    if (decision.action === 'HOLD' && finalDirection !== 'hold' && confidence >= minConfidence) {

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

      if (hasPositionInDirection) {
        console.log(`[ENTRY] Blocked: already holding ${finalDirection === 'buy' ? 'long' : 'short'} position`);
      } else if (hasOppositePosition) {
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
        console.log(`[ENTRY] Blocked: at max positions (${activeTrades.length}/${maxPositions})`);
      } else {
        // ─── RISK CHECK ───
        decision = this._checkRiskAndBuildDecision(finalDirection, orchResult, minConfidence);
      }
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
    this._broadcastDecision(price, indicators, patterns, regime, orchResult, decision, confidenceData, minConfidence);

    // ─── EXECUTE ───
    if (decision.action !== 'HOLD') {
      // L5: Capture risk gates that were checked during entry evaluation.
      // Pre-trade gates built here (warmup, min_confidence, direction_filter, same_direction_block,
      // max_positions). RiskManager contributes its own gates (drawdown_circuit, daily/weekly/monthly
      // loss limits, recovery min_confidence) via decision.riskGates — appended below.
      const riskGates = [
        { gate: 'warmup', threshold: 15, value: this.ctx.priceHistory.length, passed: this.ctx.priceHistory.length >= 15 },
        { gate: 'min_confidence', threshold: minConfidence, value: confidence, passed: confidence >= minConfidence },
        { gate: 'direction_filter', threshold: null, value: finalDirection, passed: !(directionFilter === 'long_only' && finalDirection === 'sell') && !(directionFilter === 'short_only' && finalDirection === 'buy') },
        { gate: 'same_direction_block', threshold: null, value: finalDirection, passed: !activeTrades.some(t => (finalDirection === 'buy' && (t.direction === 'long' || t.action === 'BUY')) || (finalDirection === 'sell' && (t.direction === 'short' || t.action === 'SELL_SHORT'))) },
        { gate: 'max_positions', threshold: maxPositions, value: activeTrades.length, passed: activeTrades.length < maxPositions },
        ...(decision.riskGates || []),
      ];

      // L1+L2: Attach full ledger data to decision for StateManager.openPosition
      const allResults = orchResult.allResults || [];
      const winnerName = orchResult.winnerStrategy || null;
      decision.ledgerData = {
        candleTimestamp: this.ctx.marketData.timestamp || Date.now(),
        symbol: this.ctx.config?.tradingPair || this.ctx.config?.symbol || 'unknown',
        timeframe: this.ctx.config?.timeframe || '15m',
        executionMode: this.ctx.config?.enableBacktestMode ? 'backtest' : (this.ctx.config?.executionMode || 'paper'),
        // L2: every strategy that fired — winner AND losers with indicator values
        strategySignals: allResults.map(s => ({
          name: s.strategyName || s.name || 'unknown',
          direction: s.direction === 'buy' ? 'long' : s.direction === 'sell' ? 'short' : 'hold',
          baseConfidence: (s.confidence || 0),
          reason: s.reason || s.reasons?.join('; ') || 'signal fired',
          indicatorValues: {
            rsi: indicators.rsi,
            ema20: indicators.ema20,
            ema50: indicators.ema50,
            atr: indicators.atr,
            trend: indicators.trend,
          },
        })),
        // L2: orchestrator decision with competing strategies
        orchestratorDecision: {
          winnerStrategy: winnerName,
          finalConfidence: (orchResult.confidence || 0) / 100,
          reason: allResults.length > 1
            ? `${winnerName} (${(orchResult.confidence || 0).toFixed(1)}%) selected over ${allResults.length - 1} alternatives`
            : `${winnerName} selected at ${(orchResult.confidence || 0).toFixed(1)}%`,
          competingStrategies: allResults.map(r => ({
            name: r.strategyName || r.name || 'unknown',
            adjustedConfidence: (r.confidence || 0),
            rejected: (r.strategyName || r.name) !== winnerName,
            rejectReason: (r.strategyName || r.name) !== winnerName ? 'Lower confidence than winner' : null,
          })),
        },
        confluence: orchResult.confluence ? {
          count: orchResult.confluence.count || 1,
          agreeingStrategies: orchResult.confluence.strategies || [],
          sizingMultiplier: orchResult.sizingMultiplier || 1.0,
          reason: `${orchResult.confluence.count || 1} strategies agree on ${orchResult.direction}`,
        } : { count: 1, sizingMultiplier: 1.0 },
        exitContract: orchResult.exitContract || null,
        // L5: risk gates checked before entry
        riskGates,
      };
      // Mutex guard for EXIT dispatches only — entries are new tradeIds.
      // SELL/COVER share state with checkExitsOnly()'s parallel exit path;
      // BUY/SELL_SHORT are entries (no concurrency conflict possible since
      // a new tradeId is created downstream by openPosition).
      const isExit = decision.action === 'SELL' || decision.action === 'COVER';
      if (isExit && decision.tradeId) {
        await this._dispatchExit(decision.tradeId, () =>
          this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult)
        );
      } else {
        await this.ctx.executeTrade(decision, confidenceData, price, indicators, patterns, null, orchResult);
      }
    }
  }

  /**
   * Exit-only monitoring (added 2026-04-28 per Wolf's spec).
   *
   * Called by run-empire-v2.js's tradingInterval timer (default 15s) so
   * open positions get sub-candle exit protection without re-running
   * the FULL analyzeAndTrade() pipeline (which would open new positions
   * on noise).
   *
   * Mirrors the exit branch of _analyze() (L143-199) — same checks,
   * same executeTrade dispatch, but skips strategy evaluation + entry
   * gates entirely. Entries fire only on candle close (L1215 of
   * run-empire-v2.js).
   */
  async checkExitsOnly() {
    // BUG FIX 2026-04-28 (Mercury catch round 2): share `this.analyzing` flag
    // with analyzeAndTrade so the two methods are MUTUALLY EXCLUSIVE.
    // Per-tradeId mutex below stops dispatch double-fire, but state-mutating
    // calls earlier in the loop (exitContractManager.updateMaxProfit,
    // MaxProfitManager.update) fire BEFORE the dispatch — without method-
    // level exclusion they would still double-advance MPM internal state
    // when a candle close fires during a 15s timer tick. Skip cost: at most
    // we miss ONE 15s exit-monitor cycle per candle close. Acceptable.
    if (this.analyzing) return;

    const stateManager = require('./StateManager').getInstance();
    const allTrades = stateManager.getAllTrades();
    const activeTrades = allTrades.filter(t => t.action === 'BUY' || t.action === 'SELL_SHORT');
    if (activeTrades.length === 0) return;

    const price = this.ctx.marketData?.price;
    if (!price) return;

    this.analyzing = true;
    try {

    // Use the existing snapshot getter for indicators — same path _analyze uses.
    const dtoState = this.ctx.indicatorEngine.getSnapshot();
    const indicators = dtoState.indicators || {};

    const exitContractManager = getExitContractManager();

    for (const activeTrade of activeTrades) {
      // Update MaxProfit tracking before evaluating exit conditions.
      exitContractManager.updateMaxProfit(activeTrade, price);

      // 1. ExitContractManager check — SL, max-hold, invalidation
      const exitCheck = exitContractManager.checkExitConditions(activeTrade, price, {
        indicators,
        currentTime: this.ctx.marketData?.timestamp || Date.now(),
        accountBalance: this.ctx.backtestRecorder?.balance ?? stateManager.getEquity(price),
        initialBalance: this.ctx.backtestRecorder?.startingBalance ?? stateManager.get('initialBalance') ?? 10000,
        currentPosition: stateManager.get('position'),
        currentPrice: price
      });

      if (exitCheck.shouldExit) {
        console.log(`[EXIT-MONITOR] ${exitCheck.details}`);
        const isClosingShort = activeTrade.direction === 'short' || activeTrade.action === 'SELL_SHORT';
        const decision = {
          action: isClosingShort ? 'COVER' : 'SELL',
          direction: 'close',
          confidence: exitCheck.confidence || 100,
          exitReason: exitCheck.exitReason,
          tradeId: activeTrade.id
        };
        await this._dispatchExit(activeTrade.id, () =>
          this.ctx.executeTrade(decision, { totalConfidence: 100 }, price, indicators, [], null, null)
        );
        continue;
      }

      // 2. MaxProfitManager check — per-trade trailing/profit-lock
      const mpm = this.ctx.maxProfitManagers?.get(activeTrade.id);
      if (mpm?.state?.active) {
        // Mutex BEFORE update so we don't double-advance MPM internal state
        // when a candle close + 15s tick interleave on the same trade.
        if (this._exitInFlight.has(activeTrade.id)) continue;

        const recentCandles = this.ctx.priceHistory.slice(-20);
        const profitResult = mpm.update(price, {
          volatility: indicators.volatility || 0,
          trend: indicators.trend || 'sideways',
          volume: this.ctx.marketData?.volume || 0,
          atr: indicators.atr,
          rsi: indicators.rsi,
          candle: this.ctx.priceHistory[this.ctx.priceHistory.length - 1],
          recentCandles,
          nearestStructure: null
        });

        if (profitResult && (profitResult.action === 'exit_full' || profitResult.action === 'exit_partial')) {
          const isClosingShort = activeTrade.direction === 'short' || activeTrade.action === 'SELL_SHORT';
          const decision = {
            action: isClosingShort ? 'COVER' : 'SELL',
            direction: 'close',
            confidence: 100,
            exitSize: profitResult.exitSize,
            exitFraction: profitResult.exitFraction,
            exitReason: profitResult.reason,
            tradeId: activeTrade.id
          };
          await this._dispatchExit(activeTrade.id, () =>
            this.ctx.executeTrade(decision, { totalConfidence: 100 }, price, indicators, [], null, null)
          );
        }
      }
    }

    } finally {
      this.analyzing = false;
    }
  }

  /**
   * Risk check + build decision — SAME LOGIC for buy and sell.
   * The ONLY difference is the action string and direction label.
   */
  _checkRiskAndBuildDecision(direction, orchResult, minConfidence) {
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
      if (!riskCheck.allowed) {
        console.log(`🛑 RISK BLOCK: ${riskCheck.reason} — ${mapped.direction} rejected`);
        return { action: 'HOLD', confidence: 0, blockReason: riskCheck.reason, riskGates };
      }

      const riskAssessment = this.ctx.riskManager.assessTradeRisk({
        confidence: orchResult.confidence / 100,
        direction
      });
      riskGates.push(...(riskAssessment.riskGates || []));

      if (!riskAssessment.approved) {
        console.log(`🛑 RISK BLOCK: ${riskAssessment.reason} — ${mapped.direction} rejected`);
        return { action: 'HOLD', confidence: 0, blockReason: riskAssessment.reason, riskGates };
      }

      console.log(`✅ ${mapped.action} DECISION: Confidence ${orchResult.confidence.toFixed(1)}% >= ${(minConfidence * 100).toFixed(0)}% | Direction: ${mapped.direction}`);
      if (riskAssessment.riskLevel !== 'LOW') {
        console.log(`   ⚠️ Risk level: ${riskAssessment.riskLevel} — ${riskAssessment.recommendation}`);
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
    console.log(`✅ ${mapped.action} DECISION: Confidence ${orchResult.confidence.toFixed(1)}% >= ${(minConfidence * 100).toFixed(0)}% | Direction: ${mapped.direction}`);
    return {
      action: mapped.action,
      direction: mapped.direction,
      confidence: orchResult.confidence
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DATA GATHERING — unchanged from original, just extracted
  // ═══════════════════════════════════════════════════════════════

  _gatherData(price) {
    // Indicators
    const dtoState = this.ctx.indicatorEngine.getSnapshot();
    const indicators = dtoState.indicators;
    indicators.ema12 = indicators.ema9 || price;
    indicators.ema26 = indicators.ema21 || price;
    indicators.volatility = indicators.atr || 0;
    indicators.bbWidth = indicators.bb?.bandwidth || 0;
    indicators.bollingerBands = indicators.bb;
    indicators.trend = indicators.superTrendDirection || 'sideways';

    // Patterns
    const memoryPatterns = this.ctx.patternChecker.analyzePatterns({
      candles: this.ctx.priceHistory,
      trend: indicators.trend,
      macd: indicators.macd?.macd || indicators.macd?.macdLine || 0,
      macdSignal: indicators.macd?.signal || indicators.macd?.signalLine || 0,
      rsi: indicators.rsi,
      volume: this.ctx.marketData.volume || 0
    });
    const rawCandlePatterns = []; // Disabled — memoryPatterns only
    const minPatternConf = TradingConfig.get('confidence.candlePatternMinConfidence') || 0.70;
    const candlePatterns = rawCandlePatterns.filter(p => (p.confidence || 0) >= minPatternConf);
    const patterns = [...candlePatterns, ...memoryPatterns];

    // Record patterns for learning (skip in fast backtest)
    if (patterns.length > 0 && !this.ctx.backtestFast) {
      const telemetry = require('./Telemetry').getTelemetry();
      patterns.forEach(pattern => {
        const signature = pattern.signature || pattern.name || 'unknown_pattern';
        if (!Array.isArray(pattern.features)) {
          pattern.features = FeatureExtractor.extractArray({ indicators, candles: this.ctx.priceHistory });
        }
        telemetry.event('pattern_detected', { signature, confidence: pattern.confidence, price });
      });
    }
    this.ctx.broadcastPatternAnalysis(patterns, indicators);

    // Regime
    const _regimeDetector = new RegimeDetector();
    const regimeResult = _regimeDetector.detect(indicators, this.ctx.priceHistory);
    const regime = {
      currentRegime: regimeResult.regime || 'unknown',
      confidence: regimeResult.confidence || 0,
      parameters: regimeResult.details || {}
    };
    this.ctx.marketRegime = regime;

    // Fibonacci
    let fibLevels = null;
    let nearestFibLevel = null;
    if (this.ctx.fibonacciDetector && this.ctx.priceHistory.length >= 30) {
      fibLevels = this.ctx.fibonacciDetector.update(this.ctx.priceHistory);
      if (fibLevels) nearestFibLevel = this.ctx.fibonacciDetector.getNearestLevel(price);
    }

    // TPO
    let tpoResult = null;
    if (this.ctx.ogzTpo && this.ctx.priceHistory.length > 0) {
      const latestCandle = this.ctx.priceHistory[this.ctx.priceHistory.length - 1];
      tpoResult = this.ctx.ogzTpo.update({
        o: _o(latestCandle), h: _h(latestCandle), l: _l(latestCandle), c: _c(latestCandle),
        t: latestCandle.time || Date.now()
      });
      if (tpoResult?.signal) {
        console.log(`\n🎯 OGZ TPO Signal: ${tpoResult.signal.action} (${tpoResult.signal.zone}) | Strength: ${(tpoResult.signal.strength * 100).toFixed(2)}%`);
      }
    }

    return { indicators, patterns, regime, tpoResult, fibLevels, nearestFibLevel };
  }

  // ═══════════════════════════════════════════════════════════════
  // TRAI — async observer, non-blocking
  // ═══════════════════════════════════════════════════════════════

  _runTRAI(direction, orchResult, indicators, patterns, regime, price) {
    const skipTRAI = this.ctx.config.enableBacktestMode && !this.ctx.traiEnableBacktest;
    if (!this.ctx.trai || skipTRAI) return;

    try {
      this.ctx.trai.processDecision(
        { action: direction.toUpperCase(), confidence: orchResult.confidence, patterns, indicators, price, timestamp: Date.now() },
        { volatility: indicators.volatility, trend: indicators.trend, volume: this.ctx.marketData.volume || 'normal', regime: regime.currentRegime || 'unknown', indicators, positionSize: stateManager.get('balance') * TradingConfig.get('positionSizing.basePositionSize'), currentPosition: stateManager.get('position') }
      ).then(d => { if (d?.id) this.ctx._lastTraiDecision = d; })
       .catch(err => console.warn('⚠️ [TRAI] Error:', err.message));
    } catch (e) {
      console.error('⚠️ TRAI error:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD BROADCAST
  // ═══════════════════════════════════════════════════════════════

  _broadcastAndReturn(price, indicators, patterns, regime, orchResult, confidenceData) {
    this._broadcastDecision(price, indicators, patterns, regime, orchResult, { action: 'HOLD' }, confidenceData, 0);
  }

  _broadcastDecision(price, indicators, patterns, regime, orchResult, decision, confidenceData, minConfidence) {
    // Signal analysis broadcast
    if (this.ctx.dashboardWs && this.ctx.dashboardWs.readyState === 1) {
      try {
        const signals = orchResult?.signalBreakdown?.signals || [];
        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'signal_analysis',
          timestamp: Date.now(),
          signal: {
            direction: orchResult.direction,
            confidence: orchResult.confidence,
            reasons: orchResult.reasons || [],
            meta: { signalsFired: signals.length, bullishCount: signals.filter(s => s.direction === 'buy').length, bearishCount: signals.filter(s => s.direction === 'sell').length },
            signals
          },
          modules: {
            orchestrator: orchResult ? { winner: orchResult.winnerStrategy, direction: orchResult.direction, confidence: orchResult.confidence, confluence: orchResult.confluence, sizingMultiplier: orchResult.sizingMultiplier } : null,
            regime: { regime: regime?.currentRegime || 'unknown', confidence: regime?.confidence || 0 }
          }
        }));
      } catch (e) { /* fail silently */ }
    }

    // Chain-of-thought broadcast + Strategy Winner HUD
    if (this.ctx.dashboardWsConnected && this.ctx.dashboardWs) {
      try {
        const reasoning = decision.action === 'HOLD'
          ? `Waiting: Confidence ${decision.confidence?.toFixed(1) || 0}% < ${(minConfidence * 100).toFixed(0)}% minimum`
          : `${decision.action}: Confidence ${decision.confidence?.toFixed(1)}% | ${orchResult.winnerStrategy || 'signal'}`;
        // Strategy Winner HUD: full battleground for confidence bar chart.
        // FIX 2026-04-27: orchResult.allResults only contains strategies that
        // FIRED this cycle. Enrich with the full configured-strategy list
        // (zero-confidence placeholders for non-firing) so the dashboard
        // battleground always shows ALL contenders, not just the winner.
        //
        // Also IP-shield: real strategy names go through TradeNarrator's
        // labelFor() so the dashboard sees "Strategy-A/B/C" instead of
        // "EMASMACrossover" / "RSI" / etc. Same seed = same labels across
        // all panels (heatbar, battleground, leaderboard via narrator).
        const { getNarrator } = require('./TradeNarrator');
        const narrator = getNarrator();
        const firedById = new Map(
          (orchResult.allResults || []).map(s => [s.strategyName, s])
        );
        const allStrategyNames = (this.ctx.strategyOrchestrator?.strategies || [])
          .map(s => s.name);
        const fullStack = allStrategyNames.map(name => {
          const fired = firedById.get(name);
          const label = narrator.labelFor(name);
          return {
            id: label,
            name: label,
            realName: name,    // kept for any internal tooling that needs it
            confidence: fired ? fired.confidence : 0,
            direction: fired ? fired.direction : 'hold',
          };
        }).sort((a, b) => b.confidence - a.confidence);

        const winnerLabel = orchResult.winnerStrategy
          ? narrator.labelFor(orchResult.winnerStrategy)
          : null;

        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'bot_thinking',
          timestamp: Date.now(),
          message: reasoning,
          confidence: decision.confidence,
          data: { reasoning, price, regime: regime?.currentRegime || 'unknown', module: winnerLabel || 'orchestrator' },
          strategy_stack: fullStack.length ? fullStack : undefined,
          winner_id: winnerLabel
        }));
      } catch (e) { /* fail silently */ }

      // Golden Setup Emitter: proximity score + confluence matrix
      try {
        const conditions = [
          { label: 'RSI Oversold/Overbought', status: (indicators.rsi < 30 || indicators.rsi > 70) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'EMA Trend Alignment', status: (indicators.ema20 > indicators.ema50) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'Strategy Confluence', status: (orchResult.confluence?.count >= 2) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'High Confidence', status: (orchResult.confidence >= 65) ? 'MET' : 'WAITING', weight: 0.2 },
          { label: 'Regime Favorable', status: (regime?.currentRegime === 'trending_up' || regime?.currentRegime === 'trending_down') ? 'MET' : 'WAITING', weight: 0.2 }
        ];
        const proximity = conditions.reduce((acc, c) => acc + (c.status === 'MET' ? c.weight : 0), 0);
        this.ctx.dashboardWs.send(JSON.stringify({
          type: 'golden_setup_state',
          proximity,
          is_golden: proximity >= 0.8,
          conditions,
          timestamp: Date.now()
        }));
      } catch (e) { /* fail silently */ }
    }
  }
}

module.exports = TradingLoop;
