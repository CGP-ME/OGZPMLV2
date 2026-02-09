// MultiTimeframeAdapter.js - OGZPrime Multi-Timeframe Analysis Engine
// ═══════════════════════════════════════════════════════════════════════
// PURPOSE: Gives the trading brain EYES across ALL timeframes
// PLUGS INTO: TimeframeManager, OptimizedIndicators, TradingBrain
// MODULAR: Drop-in module, zero changes to existing core required
// ═══════════════════════════════════════════════════════════════════════

const EventEmitter = require('events');

class MultiTimeframeAdapter extends EventEmitter {
  constructor(config = {}) {
    super();

    // ── Timeframe Definitions ──────────────────────────────────────────
    // Every timeframe the bot will track, with Polygon REST span mappings
    this.TIMEFRAME_CONFIG = {
      '1m':  { ms: 60000,        polygonSpan: 'minute',  polygonMult: 1,   maxCandles: 1440,  aggregate: false },
      '5m':  { ms: 300000,       polygonSpan: 'minute',  polygonMult: 5,   maxCandles: 576,   aggregate: true  },
      '15m': { ms: 900000,       polygonSpan: 'minute',  polygonMult: 15,  maxCandles: 384,   aggregate: true  },
      '30m': { ms: 1800000,      polygonSpan: 'minute',  polygonMult: 30,  maxCandles: 336,   aggregate: true  },
      '1h':  { ms: 3600000,      polygonSpan: 'hour',    polygonMult: 1,   maxCandles: 720,   aggregate: true  },
      '4h':  { ms: 14400000,     polygonSpan: 'hour',    polygonMult: 4,   maxCandles: 360,   aggregate: true  },
      '1d':  { ms: 86400000,     polygonSpan: 'day',     polygonMult: 1,   maxCandles: 365,   aggregate: true  },
      '5d':  { ms: 432000000,    polygonSpan: 'day',     polygonMult: 5,   maxCandles: 200,   aggregate: true  },
      '1M':  { ms: 2629746000,   polygonSpan: 'month',   polygonMult: 1,   maxCandles: 120,   aggregate: true  },
      '3M':  { ms: 7889238000,   polygonSpan: 'month',   polygonMult: 3,   maxCandles: 40,    aggregate: true  },
      '6M':  { ms: 15778476000,  polygonSpan: 'month',   polygonMult: 6,   maxCandles: 20,    aggregate: true  },
    };

    // ── Config ─────────────────────────────────────────────────────────
    this.config = {
      polygonApiKey: config.polygonApiKey || process.env.POLYGON_API_KEY,
      ticker: config.ticker || 'X:BTCUSD',
      activeTimeframes: config.activeTimeframes || ['1m', '5m', '15m', '1h', '4h', '1d', '5d', '1M'],
      indicatorPeriods: {
        rsi: 14,
        smaFast: 10,
        smaSlow: 50,
        ema: 21,
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        atr: 14,
        bollingerPeriod: 20,
        bollingerStd: 2,
      },
      // Historical backfill depth (how far back to fetch on init)
      backfillDays: config.backfillDays || 365,
      // REST API rate limit (Polygon free tier = 5/min)
      apiCallDelayMs: config.apiCallDelayMs || 13000,
      // Minimum candles needed before timeframe is "ready"
      minCandlesForAnalysis: config.minCandlesForAnalysis || 50,
      ...config,
    };

    // ── Candle Storage Per Timeframe ───────────────────────────────────
    this.candles = new Map();           // timeframe -> candle[]
    this.pendingCandles = new Map();    // timeframe -> partial candle being built
    this.indicators = new Map();        // timeframe -> latest indicator snapshot
    this.readyTimeframes = new Set();   // timeframes with enough data
    this.lastUpdate = new Map();        // timeframe -> timestamp of last candle close

    // ── State ──────────────────────────────────────────────────────────
    this.initialized = false;
    this.backfillComplete = false;
    this.stats = {
      candlesProcessed: 0,
      aggregationsPerformed: 0,
      indicatorCalculations: 0,
      confluenceChecks: 0,
      apiCallsMade: 0,
      errors: 0,
    };

    // Initialize storage for all active timeframes
    for (const tf of this.config.activeTimeframes) {
      this.candles.set(tf, []);
      this.pendingCandles.set(tf, null);
      this.indicators.set(tf, null);
      this.lastUpdate.set(tf, 0);
    }

    console.log('🕐 MultiTimeframeAdapter initialized');
    console.log(`   Active timeframes: ${this.config.activeTimeframes.join(', ')}`);
  }

  // ════════════════════════════════════════════════════════════════════
  // SECTION 1: REAL-TIME CANDLE INGESTION & AGGREGATION
  // ════════════════════════════════════════════════════════════════════

  /**
   * Feed a 1-minute candle from the WebSocket into ALL timeframes
   * This is the PRIMARY entry point - called every time a 1m candle closes
   * @param {Object} candle - { timestamp, open, high, low, close, volume }
   */
  ingestCandle(candle) {
    if (!candle || !candle.close || !candle.timestamp) return;

    this.stats.candlesProcessed++;

    // Store the raw 1m candle
    this._addCandle('1m', candle);

    // Aggregate into every higher timeframe
    for (const tf of this.config.activeTimeframes) {
      if (tf === '1m') continue;

      const tfConfig = this.TIMEFRAME_CONFIG[tf];
      if (!tfConfig) continue;

      this._aggregateInto(tf, candle);
    }

    // Recalculate indicators on timeframes that just closed a candle
    this._recalculateIndicators();

    // Emit update event for the trading brain
    this.emit('timeframes_updated', {
      timestamp: candle.timestamp,
      price: candle.close,
      readyTimeframes: Array.from(this.readyTimeframes),
      confluence: this.getConfluenceScore(),
    });
  }

  /**
   * Aggregate a 1m candle into a higher timeframe's pending candle
   * @private
   */
  _aggregateInto(timeframe, minuteCandle) {
    const tfConfig = this.TIMEFRAME_CONFIG[timeframe];
    const interval = tfConfig.ms;

    // Calculate which higher-timeframe candle this minute belongs to
    const candleStart = Math.floor(minuteCandle.timestamp / interval) * interval;
    let pending = this.pendingCandles.get(timeframe);

    if (!pending || pending.timestamp !== candleStart) {
      // Previous candle is complete - store it if it exists
      if (pending && pending.timestamp) {
        this._addCandle(timeframe, { ...pending });
        this.stats.aggregationsPerformed++;
      }

      // Start new candle
      pending = {
        timestamp: candleStart,
        open: minuteCandle.open,
        high: minuteCandle.high,
        low: minuteCandle.low,
        close: minuteCandle.close,
        volume: minuteCandle.volume || 0,
        tickCount: 1,
      };
    } else {
      // Update existing pending candle
      pending.high = Math.max(pending.high, minuteCandle.high);
      pending.low = Math.min(pending.low, minuteCandle.low);
      pending.close = minuteCandle.close;
      pending.volume += (minuteCandle.volume || 0);
      pending.tickCount++;
    }

    this.pendingCandles.set(timeframe, pending);
  }

  /**
   * Add a completed candle to storage with size management
   * @private
   */
  _addCandle(timeframe, candle) {
    const arr = this.candles.get(timeframe);
    if (!arr) return;

    const tfConfig = this.TIMEFRAME_CONFIG[timeframe];
    const max = tfConfig ? tfConfig.maxCandles : 500;

    arr.push(candle);

    // Trim to max size
    if (arr.length > max) {
      arr.splice(0, arr.length - max);
    }

    this.lastUpdate.set(timeframe, candle.timestamp);

    // Mark as ready if we have enough data
    if (arr.length >= this.config.minCandlesForAnalysis) {
      this.readyTimeframes.add(timeframe);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // SECTION 2: INDICATOR CALCULATIONS PER TIMEFRAME
  // ════════════════════════════════════════════════════════════════════

  /**
   * Recalculate indicators for all timeframes that have enough data
   * @private
   */
  _recalculateIndicators() {
    for (const tf of this.readyTimeframes) {
      const candleArr = this.candles.get(tf);
      if (!candleArr || candleArr.length < this.config.minCandlesForAnalysis) continue;

      const closes = candleArr.map(c => c.close);
      const highs = candleArr.map(c => c.high);
      const lows = candleArr.map(c => c.low);
      const volumes = candleArr.map(c => c.volume || 0);

      try {
        const snapshot = {
          timeframe: tf,
          timestamp: Date.now(),
          candleCount: candleArr.length,
          price: closes[closes.length - 1],

          // RSI
          rsi: this._calcRSI(closes, this.config.indicatorPeriods.rsi),

          // Moving Averages
          smaFast: this._calcSMA(closes, this.config.indicatorPeriods.smaFast),
          smaSlow: this._calcSMA(closes, this.config.indicatorPeriods.smaSlow),
          ema: this._calcEMA(closes, this.config.indicatorPeriods.ema),

          // MACD
          macd: this._calcMACD(closes),

          // ATR (for volatility context)
          atr: this._calcATR(highs, lows, closes, this.config.indicatorPeriods.atr),

          // Bollinger Bands
          bollinger: this._calcBollinger(closes, this.config.indicatorPeriods.bollingerPeriod, this.config.indicatorPeriods.bollingerStd),

          // Trend determination
          trend: null,
          trendStrength: 0,

          // Volume analysis
          volumeSMA: this._calcSMA(volumes, 20),
          volumeRatio: 0,
        };

        // Derive trend from MAs
        if (snapshot.smaFast && snapshot.smaSlow) {
          if (snapshot.smaFast > snapshot.smaSlow) {
            snapshot.trend = 'bullish';
            snapshot.trendStrength = Math.min(1, (snapshot.smaFast - snapshot.smaSlow) / snapshot.smaSlow * 100);
          } else {
            snapshot.trend = 'bearish';
            snapshot.trendStrength = Math.min(1, (snapshot.smaSlow - snapshot.smaFast) / snapshot.smaFast * 100);
          }
        }

        // Volume ratio (current vs average)
        if (snapshot.volumeSMA && snapshot.volumeSMA > 0) {
          snapshot.volumeRatio = volumes[volumes.length - 1] / snapshot.volumeSMA;
        }

        this.indicators.set(tf, snapshot);
        this.stats.indicatorCalculations++;

      } catch (err) {
        this.stats.errors++;
        console.error(`❌ MTF indicator error on ${tf}:`, err.message);
      }
    }
  }

  // ── Indicator Math (self-contained, no external deps) ──────────────

  _calcRSI(closes, period) {
    if (closes.length < period + 1) return null;
    let gains = 0, losses = 0;

    // Initial average
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  _calcSMA(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  _calcEMA(data, period) {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  _calcMACD(closes) {
    const fast = this._calcEMA(closes, this.config.indicatorPeriods.macdFast);
    const slow = this._calcEMA(closes, this.config.indicatorPeriods.macdSlow);
    if (fast === null || slow === null) return null;

    const macdLine = fast - slow;
    // Approximate signal line from recent MACD values
    // For a proper signal line we'd need to track MACD history
    return {
      macdLine,
      histogram: macdLine, // Simplified - full impl tracks signal line history
      bullish: macdLine > 0,
    };
  }

  _calcATR(highs, lows, closes, period) {
    if (highs.length < period + 1) return null;
    const trueRanges = [];
    for (let i = highs.length - period; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  _calcBollinger(closes, period, stdDev) {
    const sma = this._calcSMA(closes, period);
    if (sma === null) return null;

    const slice = closes.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: sma + (std * stdDev),
      middle: sma,
      lower: sma - (std * stdDev),
      bandwidth: ((sma + std * stdDev) - (sma - std * stdDev)) / sma,
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // SECTION 3: MULTI-TIMEFRAME CONFLUENCE SCORING
  // ════════════════════════════════════════════════════════════════════

  /**
   * Get a confluence score across all ready timeframes
   * This is what the trading brain should call before making decisions
   * @returns {Object} Confluence analysis
   */
  getConfluenceScore() {
    this.stats.confluenceChecks++;

    const analysis = {
      timestamp: Date.now(),
      readyTimeframes: Array.from(this.readyTimeframes),
      totalTimeframes: this.config.activeTimeframes.length,

      // Directional consensus
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,

      // Signal strength
      overallBias: 'neutral',  // 'strong_bullish', 'bullish', 'neutral', 'bearish', 'strong_bearish'
      confluenceScore: 0,       // -1 (full bearish) to +1 (full bullish)
      confidence: 0,            // 0-1 how confident we are

      // RSI consensus
      rsiAverage: 0,
      rsiExtreme: false,

      // Trend alignment
      trendAlignment: 0,       // 0-1, how aligned are trends across timeframes

      // Per-timeframe breakdown
      timeframeSignals: {},

      // Actionable output
      shouldTrade: false,
      suggestedDirection: null,
      reasoning: [],
    };

    if (this.readyTimeframes.size === 0) {
      analysis.reasoning.push('No timeframes ready yet - waiting for data');
      return analysis;
    }

    // Weight higher timeframes more heavily (trend > noise)
    const weights = {
      '1m':  0.05,
      '5m':  0.08,
      '15m': 0.10,
      '30m': 0.10,
      '1h':  0.15,
      '4h':  0.17,
      '1d':  0.15,
      '5d':  0.08,
      '1M':  0.06,
      '3M':  0.04,
      '6M':  0.02,
    };

    let weightedScore = 0;
    let totalWeight = 0;
    let rsiSum = 0;
    let rsiCount = 0;
    let trendMatches = 0;
    let trendTotal = 0;
    let primaryTrend = null;

    for (const tf of this.readyTimeframes) {
      const ind = this.indicators.get(tf);
      if (!ind) continue;

      const weight = weights[tf] || 0.05;
      let signal = 0; // -1 to +1

      // RSI signal
      if (ind.rsi !== null) {
        rsiSum += ind.rsi;
        rsiCount++;

        if (ind.rsi < 30) signal += 0.4;       // Oversold = bullish signal
        else if (ind.rsi > 70) signal -= 0.4;   // Overbought = bearish signal
        else if (ind.rsi < 45) signal += 0.1;
        else if (ind.rsi > 55) signal -= 0.1;
      }

      // Trend signal from MAs
      if (ind.trend === 'bullish') {
        signal += 0.3 * Math.min(1, ind.trendStrength);
        analysis.bullishCount++;
      } else if (ind.trend === 'bearish') {
        signal -= 0.3 * Math.min(1, ind.trendStrength);
        analysis.bearishCount++;
      } else {
        analysis.neutralCount++;
      }

      // MACD signal
      if (ind.macd) {
        signal += ind.macd.bullish ? 0.2 : -0.2;
      }

      // Bollinger position
      if (ind.bollinger && ind.price) {
        const bbRange = ind.bollinger.upper - ind.bollinger.lower;
        if (bbRange > 0) {
          const bbPosition = (ind.price - ind.bollinger.lower) / bbRange;
          if (bbPosition < 0.2) signal += 0.1;        // Near lower band = potential bounce
          else if (bbPosition > 0.8) signal -= 0.1;   // Near upper band = potential rejection
        }
      }

      // Clamp signal
      signal = Math.max(-1, Math.min(1, signal));

      // Track primary trend from highest-weight ready timeframe
      if (!primaryTrend && ind.trend && weight >= 0.10) {
        primaryTrend = ind.trend;
      }

      // Trend alignment tracking
      if (ind.trend && primaryTrend) {
        trendTotal++;
        if (ind.trend === primaryTrend) trendMatches++;
      }

      weightedScore += signal * weight;
      totalWeight += weight;

      // Store per-timeframe breakdown
      analysis.timeframeSignals[tf] = {
        signal: signal > 0.15 ? 'bullish' : signal < -0.15 ? 'bearish' : 'neutral',
        strength: Math.abs(signal),
        rsi: ind.rsi ? Math.round(ind.rsi * 10) / 10 : null,
        trend: ind.trend,
        macdBullish: ind.macd ? ind.macd.bullish : null,
        weight,
      };
    }

    // Calculate final scores
    if (totalWeight > 0) {
      analysis.confluenceScore = weightedScore / totalWeight;
    }

    if (rsiCount > 0) {
      analysis.rsiAverage = rsiSum / rsiCount;
      analysis.rsiExtreme = analysis.rsiAverage < 30 || analysis.rsiAverage > 70;
    }

    if (trendTotal > 0) {
      analysis.trendAlignment = trendMatches / trendTotal;
    }

    // Determine overall bias
    const score = analysis.confluenceScore;
    if (score > 0.4) analysis.overallBias = 'strong_bullish';
    else if (score > 0.15) analysis.overallBias = 'bullish';
    else if (score < -0.4) analysis.overallBias = 'strong_bearish';
    else if (score < -0.15) analysis.overallBias = 'bearish';
    else analysis.overallBias = 'neutral';

    // Confidence based on how many timeframes agree
    const agreementRatio = Math.max(analysis.bullishCount, analysis.bearishCount) /
      (analysis.bullishCount + analysis.bearishCount + analysis.neutralCount || 1);
    analysis.confidence = agreementRatio * analysis.trendAlignment;

    // Trading recommendation
    analysis.shouldTrade = analysis.confidence > 0.5 && Math.abs(score) > 0.15;
    if (analysis.shouldTrade) {
      analysis.suggestedDirection = score > 0 ? 'buy' : 'sell';
    }

    // Build reasoning
    analysis.reasoning = this._buildReasoning(analysis);

    return analysis;
  }

  /**
   * Build human-readable reasoning for the confluence score
   * @private
   */
  _buildReasoning(analysis) {
    const reasons = [];

    reasons.push(`${analysis.readyTimeframes.length}/${analysis.totalTimeframes} timeframes active`);

    if (analysis.trendAlignment > 0.7) {
      reasons.push(`Strong trend alignment: ${Math.round(analysis.trendAlignment * 100)}% of timeframes agree`);
    } else if (analysis.trendAlignment < 0.4) {
      reasons.push(`⚠️ Low trend alignment: mixed signals across timeframes`);
    }

    if (analysis.rsiExtreme) {
      reasons.push(`RSI extreme detected (avg: ${Math.round(analysis.rsiAverage)})`);
    }

    if (analysis.bullishCount > analysis.bearishCount * 2) {
      reasons.push(`Overwhelming bullish consensus: ${analysis.bullishCount} bullish vs ${analysis.bearishCount} bearish`);
    } else if (analysis.bearishCount > analysis.bullishCount * 2) {
      reasons.push(`Overwhelming bearish consensus: ${analysis.bearishCount} bearish vs ${analysis.bullishCount} bullish`);
    }

    reasons.push(`Confluence: ${(analysis.confluenceScore * 100).toFixed(1)}% | Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);

    return reasons;
  }

  // ════════════════════════════════════════════════════════════════════
  // SECTION 4: HISTORICAL BACKFILL FROM POLYGON REST API
  // ════════════════════════════════════════════════════════════════════

  /**
   * Fetch historical data from Polygon REST API to backfill timeframes
   * Call this on startup BEFORE the bot starts trading
   * @param {Function} fetchFn - Optional custom fetch function (for testing)
   */
  async backfillHistoricalData(fetchFn = null) {
    const fetch = fetchFn || (await import('node-fetch')).default;

    console.log('📥 Starting historical data backfill...');
    console.log(`   Ticker: ${this.config.ticker}`);
    console.log(`   Lookback: ${this.config.backfillDays} days`);

    const now = Date.now();
    const startDate = new Date(now - (this.config.backfillDays * 86400000));

    // Fetch 1-day candles first (covers 1d, 5d, 1M, 3M, 6M, YTD, ALL)
    await this._fetchAndStore(fetch, 'day', 1, startDate, new Date(now), '1d');

    // Fetch 1-hour candles (covers 1h, 4h) - last 30 days
    const thirtyDaysAgo = new Date(now - (30 * 86400000));
    await this._fetchAndStore(fetch, 'hour', 1, thirtyDaysAgo, new Date(now), '1h');

    // Fetch 5-minute candles (covers 5m, 15m, 30m) - last 7 days
    const sevenDaysAgo = new Date(now - (7 * 86400000));
    await this._fetchAndStore(fetch, 'minute', 5, sevenDaysAgo, new Date(now), '5m');

    // Fetch 1-minute candles - last 2 days (for immediate scalping context)
    const twoDaysAgo = new Date(now - (2 * 86400000));
    await this._fetchAndStore(fetch, 'minute', 1, twoDaysAgo, new Date(now), '1m');

    this.backfillComplete = true;
    this.initialized = true;

    // Aggregate daily data into 5d, 1M, 3M, 6M
    this._aggregateHistoricalData();

    // Calculate indicators on all filled timeframes
    this._recalculateIndicators();

    console.log('✅ Historical backfill complete!');
    this._printStatus();

    this.emit('backfill_complete', {
      readyTimeframes: Array.from(this.readyTimeframes),
      candleCounts: this._getCandleCounts(),
    });
  }

  /**
   * Fetch data from Polygon REST API and store directly
   * @private
   */
  async _fetchAndStore(fetch, timespan, multiplier, startDate, endDate, targetTimeframe) {
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${this.config.ticker}/range/${multiplier}/${timespan}/${start}/${end}?adjusted=true&sort=asc&limit=50000&apiKey=${this.config.polygonApiKey}`;

    try {
      console.log(`   📊 Fetching ${multiplier}${timespan} data (${start} to ${end})...`);
      this.stats.apiCallsMade++;

      const response = await fetch(url);
      if (!response.ok) {
        console.error(`   ❌ Polygon API error: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      const results = data.results || [];

      console.log(`   ✅ Received ${results.length} candles for ${targetTimeframe}`);

      for (const bar of results) {
        const candle = {
          timestamp: bar.t,
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v || 0,
        };
        this._addCandle(targetTimeframe, candle);
      }

      // Rate limit delay
      await new Promise(r => setTimeout(r, this.config.apiCallDelayMs));

    } catch (err) {
      this.stats.errors++;
      console.error(`   ❌ Backfill error for ${targetTimeframe}:`, err.message);
    }
  }

  /**
   * Aggregate daily candles into larger timeframes (5d, 1M, 3M, 6M)
   * @private
   */
  _aggregateHistoricalData() {
    const dailyCandles = this.candles.get('1d') || [];
    if (dailyCandles.length === 0) return;

    console.log('   🔄 Aggregating daily data into higher timeframes...');

    // Build 5-day candles from daily
    this._buildHigherFromLower(dailyCandles, '5d', 5);

    // Build monthly candles from daily
    this._buildMonthlyCandles(dailyCandles, '1M');

    // Build 3M candles from monthly
    const monthlyCandles = this.candles.get('1M') || [];
    this._buildHigherFromLower(monthlyCandles, '3M', 3);

    // Build 6M candles from monthly
    this._buildHigherFromLower(monthlyCandles, '6M', 6);

    // Also aggregate hourly into 4h
    const hourlyCandles = this.candles.get('1h') || [];
    this._buildHigherFromLower(hourlyCandles, '4h', 4);

    // Aggregate 5m into 15m and 30m
    const fiveMinCandles = this.candles.get('5m') || [];
    this._buildHigherFromLower(fiveMinCandles, '15m', 3);
    this._buildHigherFromLower(fiveMinCandles, '30m', 6);
  }

  /**
   * Build higher timeframe candles by grouping N lower candles
   * @private
   */
  _buildHigherFromLower(lowerCandles, targetTf, groupSize) {
    if (!this.config.activeTimeframes.includes(targetTf)) return;
    if (lowerCandles.length < groupSize) return;

    const higherCandles = [];
    for (let i = 0; i <= lowerCandles.length - groupSize; i += groupSize) {
      const group = lowerCandles.slice(i, i + groupSize);
      higherCandles.push({
        timestamp: group[0].timestamp,
        open: group[0].open,
        high: Math.max(...group.map(c => c.high)),
        low: Math.min(...group.map(c => c.low)),
        close: group[group.length - 1].close,
        volume: group.reduce((sum, c) => sum + (c.volume || 0), 0),
      });
    }

    for (const candle of higherCandles) {
      this._addCandle(targetTf, candle);
    }

    console.log(`   ✅ Built ${higherCandles.length} ${targetTf} candles`);
  }

  /**
   * Build monthly candles respecting calendar months
   * @private
   */
  _buildMonthlyCandles(dailyCandles, targetTf) {
    if (!this.config.activeTimeframes.includes(targetTf)) return;

    const months = new Map();
    for (const candle of dailyCandles) {
      const d = new Date(candle.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!months.has(key)) {
        months.set(key, []);
      }
      months.get(key).push(candle);
    }

    for (const [, group] of months) {
      if (group.length < 5) continue; // Skip incomplete months
      const monthCandle = {
        timestamp: group[0].timestamp,
        open: group[0].open,
        high: Math.max(...group.map(c => c.high)),
        low: Math.min(...group.map(c => c.low)),
        close: group[group.length - 1].close,
        volume: group.reduce((sum, c) => sum + (c.volume || 0), 0),
      };
      this._addCandle(targetTf, monthCandle);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // SECTION 5: PUBLIC API FOR TRADING BRAIN INTEGRATION
  // ════════════════════════════════════════════════════════════════════

  /**
   * Get the latest indicators for a specific timeframe
   * @param {string} timeframe - e.g. '1h', '4h', '1d'
   * @returns {Object|null} Indicator snapshot or null if not ready
   */
  getIndicators(timeframe) {
    return this.indicators.get(timeframe) || null;
  }

  /**
   * Get all indicator snapshots across all ready timeframes
   * @returns {Object} Map of timeframe -> indicator snapshot
   */
  getAllIndicators() {
    const result = {};
    for (const [tf, ind] of this.indicators) {
      if (ind) result[tf] = ind;
    }
    return result;
  }

  /**
   * Get candles for a specific timeframe
   * @param {string} timeframe
   * @param {number} count - How many candles to return (from most recent)
   * @returns {Array} Candle array
   */
  getCandles(timeframe, count = 100) {
    const arr = this.candles.get(timeframe) || [];
    return arr.slice(-count);
  }

  /**
   * Check if a specific timeframe is ready for analysis
   * @param {string} timeframe
   * @returns {boolean}
   */
  isReady(timeframe) {
    return this.readyTimeframes.has(timeframe);
  }

  /**
   * Get a quick multi-timeframe RSI check
   * Used for fast entry/exit confirmation
   * @param {string} direction - 'buy' or 'sell'
   * @returns {Object} { confirmed, agreement, details }
   */
  getMultiTimeframeRSIConfirmation(direction) {
    let confirming = 0;
    let total = 0;
    const details = {};

    for (const tf of this.readyTimeframes) {
      const ind = this.indicators.get(tf);
      if (!ind || ind.rsi === null) continue;

      total++;
      let confirms = false;

      if (direction === 'buy') {
        confirms = ind.rsi < 55; // Not overbought
      } else {
        confirms = ind.rsi > 45; // Not oversold
      }

      if (confirms) confirming++;

      details[tf] = {
        rsi: Math.round(ind.rsi * 10) / 10,
        confirms,
      };
    }

    const agreement = total > 0 ? confirming / total : 0;

    return {
      confirmed: agreement >= 0.6,
      agreement,
      confirmingTimeframes: confirming,
      totalTimeframes: total,
      details,
    };
  }

  /**
   * Get YTD analysis (special timeframe - calendar year)
   * @returns {Object} YTD performance stats
   */
  getYTDAnalysis() {
    const dailyCandles = this.candles.get('1d') || [];
    if (dailyCandles.length === 0) return null;

    const currentYear = new Date().getFullYear();
    const ytdCandles = dailyCandles.filter(c => new Date(c.timestamp).getFullYear() === currentYear);

    if (ytdCandles.length === 0) return null;

    const firstClose = ytdCandles[0].open;
    const lastClose = ytdCandles[ytdCandles.length - 1].close;
    const highOfYear = Math.max(...ytdCandles.map(c => c.high));
    const lowOfYear = Math.min(...ytdCandles.map(c => c.low));

    return {
      timeframe: 'YTD',
      startPrice: firstClose,
      currentPrice: lastClose,
      changePercent: ((lastClose - firstClose) / firstClose) * 100,
      highOfYear,
      lowOfYear,
      range: highOfYear - lowOfYear,
      candleCount: ytdCandles.length,
      trend: lastClose > firstClose ? 'bullish' : 'bearish',
    };
  }

  /**
   * Get ALL-TIME analysis from available data
   * @returns {Object} All-time performance stats
   */
  getAllTimeAnalysis() {
    const dailyCandles = this.candles.get('1d') || [];
    if (dailyCandles.length === 0) return null;

    const firstClose = dailyCandles[0].open;
    const lastClose = dailyCandles[dailyCandles.length - 1].close;
    const allTimeHigh = Math.max(...dailyCandles.map(c => c.high));
    const allTimeLow = Math.min(...dailyCandles.map(c => c.low));

    return {
      timeframe: 'ALL',
      startPrice: firstClose,
      currentPrice: lastClose,
      changePercent: ((lastClose - firstClose) / firstClose) * 100,
      allTimeHigh,
      allTimeLow,
      totalRange: allTimeHigh - allTimeLow,
      drawdownFromATH: ((allTimeHigh - lastClose) / allTimeHigh) * 100,
      candleCount: dailyCandles.length,
      dataSpanDays: dailyCandles.length,
      trend: lastClose > firstClose ? 'bullish' : 'bearish',
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // SECTION 6: STATUS & DIAGNOSTICS
  // ════════════════════════════════════════════════════════════════════

  _getCandleCounts() {
    const counts = {};
    for (const [tf, arr] of this.candles) {
      counts[tf] = arr.length;
    }
    return counts;
  }

  _printStatus() {
    console.log('\n📊 ═══ Multi-Timeframe Status ═══');
    for (const tf of this.config.activeTimeframes) {
      const arr = this.candles.get(tf) || [];
      const ready = this.readyTimeframes.has(tf);
      const ind = this.indicators.get(tf);
      const rsi = ind && ind.rsi ? `RSI: ${ind.rsi.toFixed(1)}` : 'RSI: --';
      const trend = ind && ind.trend ? `Trend: ${ind.trend}` : 'Trend: --';
      console.log(`   ${ready ? '✅' : '⏳'} ${tf.padEnd(4)} | ${String(arr.length).padStart(5)} candles | ${rsi.padEnd(12)} | ${trend}`);
    }
    console.log(`   📈 Stats: ${this.stats.candlesProcessed} processed, ${this.stats.apiCallsMade} API calls, ${this.stats.errors} errors`);
    console.log('═══════════════════════════════════\n');
  }

  getStatus() {
    return {
      initialized: this.initialized,
      backfillComplete: this.backfillComplete,
      readyTimeframes: Array.from(this.readyTimeframes),
      candleCounts: this._getCandleCounts(),
      stats: { ...this.stats },
      confluence: this.getConfluenceScore(),
      ytd: this.getYTDAnalysis(),
      allTime: this.getAllTimeAnalysis(),
    };
  }

  /**
   * Clean shutdown
   */
  destroy() {
    this.candles.clear();
    this.pendingCandles.clear();
    this.indicators.clear();
    this.readyTimeframes.clear();
    this.removeAllListeners();
    console.log('🕐 MultiTimeframeAdapter destroyed');
  }
}

module.exports = MultiTimeframeAdapter;
