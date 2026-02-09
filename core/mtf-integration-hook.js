// mtf-integration-hook.js - Wire MultiTimeframeAdapter Into OGZPrime
// ═══════════════════════════════════════════════════════════════════════
// DROP THIS INTO YOUR MAIN BOT FILE OR REQUIRE IT
// Zero changes to core architecture needed
// ═══════════════════════════════════════════════════════════════════════

const MultiTimeframeAdapter = require('./MultiTimeframeAdapter');

/**
 * Initialize and wire the multi-timeframe system into your existing bot
 * 
 * USAGE IN YOUR MAIN BOT:
 * 
 *   const { initMultiTimeframe } = require('./mtf-integration-hook');
 *   
 *   // In your bot's constructor or init:
 *   this.mtf = await initMultiTimeframe({
 *     polygonApiKey: process.env.POLYGON_API_KEY,
 *     ticker: 'X:BTCUSD',
 *   });
 *   
 *   // In your WebSocket onTick handler (when 1m candle closes):
 *   this.mtf.ingestCandle(candle);
 *   
 *   // In your analyzePatterns / performTradingCycle:
 *   const confluence = this.mtf.getConfluenceScore();
 *   if (!confluence.shouldTrade) {
 *     console.log('⏸️ MTF says wait:', confluence.reasoning.join(' | '));
 *     return;
 *   }
 */

async function initMultiTimeframe(config = {}) {
  const mtf = new MultiTimeframeAdapter({
    polygonApiKey: config.polygonApiKey || process.env.POLYGON_API_KEY,
    ticker: config.ticker || 'X:BTCUSD',
    activeTimeframes: config.activeTimeframes || [
      '1m', '5m', '15m', '30m', '1h', '4h', '1d', '5d', '1M'
    ],
    backfillDays: config.backfillDays || 365,
    // If you're on Polygon free tier, keep this at 13000ms
    // Paid tier can go down to 200ms
    apiCallDelayMs: config.apiCallDelayMs || 13000,
    ...config,
  });

  // Listen for updates
  mtf.on('timeframes_updated', (data) => {
    if (data.confluence && data.confluence.shouldTrade) {
      console.log(`🎯 MTF Signal: ${data.confluence.overallBias.toUpperCase()} | ` +
        `Score: ${(data.confluence.confluenceScore * 100).toFixed(1)}% | ` +
        `Confidence: ${(data.confluence.confidence * 100).toFixed(1)}%`);
    }
  });

  mtf.on('backfill_complete', (data) => {
    console.log('🏁 MTF Backfill complete. Ready timeframes:', data.readyTimeframes.join(', '));
  });

  // Start historical backfill (runs async, bot can start trading once complete)
  try {
    await mtf.backfillHistoricalData();
  } catch (err) {
    console.error('⚠️ MTF backfill had errors but continuing:', err.message);
  }

  return mtf;
}

/**
 * Enhanced trade decision that uses MTF confluence
 * Drop this into your trading brain's decision flow
 * 
 * @param {Object} mtf - MultiTimeframeAdapter instance
 * @param {Object} currentAnalysis - Your existing analysis from OptimizedTradingBrain
 * @param {string} proposedDirection - 'buy' or 'sell'
 * @returns {Object} Enhanced decision with MTF context
 */
function enhanceTradeDecision(mtf, currentAnalysis, proposedDirection) {
  const confluence = mtf.getConfluenceScore();
  const rsiCheck = mtf.getMultiTimeframeRSIConfirmation(proposedDirection);
  const ytd = mtf.getYTDAnalysis();

  // Start with existing confidence
  let adjustedConfidence = currentAnalysis.confidence || 0.5;
  const reasons = [];

  // BOOST: Multi-timeframe agreement
  if (confluence.shouldTrade && confluence.suggestedDirection === proposedDirection) {
    adjustedConfidence *= 1.3;
    reasons.push(`MTF confluence CONFIRMS ${proposedDirection} (${(confluence.confluenceScore * 100).toFixed(0)}%)`);
  }

  // REDUCE: Multi-timeframe disagreement  
  if (confluence.shouldTrade && confluence.suggestedDirection !== proposedDirection) {
    adjustedConfidence *= 0.5;
    reasons.push(`⚠️ MTF confluence OPPOSES - suggests ${confluence.suggestedDirection}`);
  }

  // BOOST: RSI confirmation across timeframes
  if (rsiCheck.confirmed) {
    adjustedConfidence *= 1.15;
    reasons.push(`RSI confirmed on ${rsiCheck.confirmingTimeframes}/${rsiCheck.totalTimeframes} timeframes`);
  }

  // REDUCE: Trading against strong higher-timeframe trend
  const dailyIndicators = mtf.getIndicators('1d');
  const fourHourIndicators = mtf.getIndicators('4h');
  
  if (dailyIndicators && dailyIndicators.trend) {
    if ((proposedDirection === 'buy' && dailyIndicators.trend === 'bearish') ||
        (proposedDirection === 'sell' && dailyIndicators.trend === 'bullish')) {
      adjustedConfidence *= 0.7;
      reasons.push(`⚠️ Trading AGAINST daily trend (${dailyIndicators.trend})`);
    } else {
      adjustedConfidence *= 1.1;
      reasons.push(`Daily trend aligned: ${dailyIndicators.trend}`);
    }
  }

  if (fourHourIndicators && fourHourIndicators.trend) {
    if ((proposedDirection === 'buy' && fourHourIndicators.trend === 'bearish') ||
        (proposedDirection === 'sell' && fourHourIndicators.trend === 'bullish')) {
      adjustedConfidence *= 0.8;
      reasons.push(`⚠️ 4H trend opposing: ${fourHourIndicators.trend}`);
    }
  }

  // YTD context (are we near yearly highs/lows?)
  if (ytd) {
    const priceRange = ytd.highOfYear - ytd.lowOfYear;
    const positionInRange = (ytd.currentPrice - ytd.lowOfYear) / priceRange;
    
    if (proposedDirection === 'buy' && positionInRange > 0.9) {
      adjustedConfidence *= 0.85;
      reasons.push(`⚠️ Price near YTD high (${(positionInRange * 100).toFixed(0)}th percentile)`);
    }
    if (proposedDirection === 'sell' && positionInRange < 0.1) {
      adjustedConfidence *= 0.85;
      reasons.push(`⚠️ Price near YTD low (${(positionInRange * 100).toFixed(0)}th percentile)`);
    }
  }

  // Cap confidence
  adjustedConfidence = Math.min(0.98, Math.max(0.05, adjustedConfidence));

  return {
    originalConfidence: currentAnalysis.confidence || 0.5,
    adjustedConfidence,
    mtfApproved: confluence.shouldTrade && confluence.suggestedDirection === proposedDirection,
    confluenceScore: confluence.confluenceScore,
    trendAlignment: confluence.trendAlignment,
    overallBias: confluence.overallBias,
    rsiConfirmed: rsiCheck.confirmed,
    reasons,
    timeframeBreakdown: confluence.timeframeSignals,
    shouldProceed: adjustedConfidence > 0.45,
  };
}

module.exports = { initMultiTimeframe, enhanceTradeDecision, MultiTimeframeAdapter };
