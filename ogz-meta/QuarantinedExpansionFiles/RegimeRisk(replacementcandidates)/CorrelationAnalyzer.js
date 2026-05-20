// ===================================================================
// CORRELATION ANALYZER - THE MARKET ORACLE! 🌐💎
// ===================================================================
// Tracks cross-asset relationships for MAXIMUM EDGE
// When one market moves, we ALREADY KNOW what's next!

const EventEmitter = require('events');

class CorrelationAnalyzer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Assets to track
      primaryAsset: config.primaryAsset || 'BTC',
      correlationAssets: config.correlationAssets || [
        'ETH',
        'BNB', 
        'SOL',
        'MATIC',
        'AVAX',
        'DXY',    // Dollar strength index
        'SPX',    // S&P 500
        'GOLD',   // Safe haven indicator
        'VIX'     // Volatility index
      ],
      
      // Correlation settings
      lookbackPeriod: config.lookbackPeriod || 100,        // Candles to analyze
      updateInterval: config.updateInterval || 60000,       // Update every minute
      correlationThreshold: config.correlationThreshold || 0.7,  // Strong correlation
      
      // Signal generation
      divergenceThreshold: config.divergenceThreshold || 0.3,   // Correlation break
      momentumLag: config.momentumLag || 5,                     // Candles for momentum
      
      // Risk analysis
      riskOnThreshold: config.riskOnThreshold || 0.6,
      flightToQualityThreshold: config.flightToQualityThreshold || -0.5,
      
      ...config
    };
    
    // State tracking
    this.state = {
      correlations: new Map(),           // Asset pair correlations
      momentum: new Map(),               // Momentum scores per asset
      marketRegime: 'neutral',           // risk-on, risk-off, neutral
      dominantAsset: null,               // Current market leader
      correlationStrength: 0,            // Overall market correlation
      lastUpdate: 0,
      
      // Historical tracking
      correlationHistory: [],
      regimeHistory: [],
      signalHistory: []
    };
    
    // Data storage
    this.priceData = new Map();         // Asset -> price array
    this.returns = new Map();           // Asset -> returns array
    
    // Analysis results
    this.signals = [];
    this.opportunities = [];
    
    console.log('🌐 Multi-Asset Correlation Analyzer initialized');
    console.log(`📊 Tracking: ${this.config.correlationAssets.join(', ')}`);
  }
  
  /**
   * Update price data for an asset
   * @param {string} asset - Asset symbol
   * @param {number} price - Current price
   */
  updatePrice(asset, price) {
    if (!this.priceData.has(asset)) {
      this.priceData.set(asset, []);
      this.returns.set(asset, []);
    }
    
    const prices = this.priceData.get(asset);
    prices.push(price);
    
    // Calculate return if we have previous price
    if (prices.length > 1) {
      const return_ = (price - prices[prices.length - 2]) / prices[prices.length - 2];
      this.returns.get(asset).push(return_);
    }
    
    // Maintain lookback period
    if (prices.length > this.config.lookbackPeriod) {
      prices.shift();
      this.returns.get(asset).shift();
    }
    
    // Auto-analyze if all assets updated
    if (this.shouldAnalyze()) {
      this.analyze();
    }
  }
  
  /**
   * Bulk update prices (more efficient)
   * @param {Object} prices - { BTC: 50000, ETH: 3000, ... }
   */
  updatePrices(prices) {
    Object.entries(prices).forEach(([asset, price]) => {
      this.updatePrice(asset, price);
    });
  }
  
  /**
   * Main analysis function - where the MAGIC happens!
   */
  analyze() {
    console.log('🔍 Running multi-asset correlation analysis...');
    
    // 1. Calculate all correlations
    this.calculateCorrelations();
    
    // 2. Detect market regime
    this.detectMarketRegime();
    
    // 3. Find momentum leaders/laggards
    this.analyzeMomentum();
    
    // 4. Generate trading signals
    this.generateSignals();
    
    // 5. Identify opportunities
    this.findOpportunities();
    
    // Update state
    this.state.lastUpdate = Date.now();
    
    // Emit comprehensive analysis
    this.emit('analysis', {
      correlations: Object.fromEntries(this.state.correlations),
      regime: this.state.marketRegime,
      momentum: Object.fromEntries(this.state.momentum),
      signals: this.signals,
      opportunities: this.opportunities,
      dominantAsset: this.state.dominantAsset
    });
    
    return this.getAnalysisSummary();
  }
  
  /**
   * Calculate correlations between all asset pairs
   */
  calculateCorrelations() {
    const assets = Array.from(this.returns.keys());
    
    // Clear previous correlations
    this.state.correlations.clear();
    
    // Calculate correlation for each pair
    for (let i = 0; i < assets.length; i++) {
      for (let j = i + 1; j < assets.length; j++) {
        const asset1 = assets[i];
        const asset2 = assets[j];
        const returns1 = this.returns.get(asset1);
        const returns2 = this.returns.get(asset2);
        
        if (returns1.length >= 20 && returns2.length >= 20) {
          const correlation = this.pearsonCorrelation(returns1, returns2);
          const key = `${asset1}/${asset2}`;
          
          this.state.correlations.set(key, {
            value: correlation,
            strength: this.getCorrelationStrength(correlation),
            direction: correlation > 0 ? 'positive' : 'negative'
          });
        }
      }
    }
    
    // Calculate overall market correlation
    this.calculateMarketCorrelation();
  }
  
  /**
   * Pearson correlation coefficient
   */
  pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
      sumY2 += y[i] * y[i];
    }
    
    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return isNaN(correlation) ? 0 : correlation;
  }
  
  /**
   * Detect current market regime
   */
  detectMarketRegime() {
    // Check crypto correlations
    const btcEthCorr = this.state.correlations.get('BTC/ETH')?.value || 0;
    const cryptoCorrelations = [];
    
    ['ETH', 'BNB', 'SOL', 'MATIC'].forEach(asset => {
      const corr = this.state.correlations.get(`BTC/${asset}`)?.value;
      if (corr !== undefined) cryptoCorrelations.push(corr);
    });
    
    const avgCryptoCorr = cryptoCorrelations.length > 0 
      ? cryptoCorrelations.reduce((a, b) => a + b) / cryptoCorrelations.length
      : 0;
    
    // Check traditional market correlations
    const btcDxyCorr = this.state.correlations.get('BTC/DXY')?.value || 0;
    const btcSpxCorr = this.state.correlations.get('BTC/SPX')?.value || 0;
    const btcGoldCorr = this.state.correlations.get('BTC/GOLD')?.value || 0;
    
    // Determine regime
    if (avgCryptoCorr > this.config.riskOnThreshold && btcSpxCorr > 0.3) {
      this.state.marketRegime = 'risk-on';
      console.log('🟢 RISK-ON detected! Cryptos moving together, positive equity correlation');
    } else if (btcGoldCorr > 0.5 && btcDxyCorr < -0.3) {
      this.state.marketRegime = 'risk-off';
      console.log('🔴 RISK-OFF detected! Flight to safety, inverse DXY correlation');
    } else if (avgCryptoCorr < 0.3) {
      this.state.marketRegime = 'decorrelated';
      console.log('🟡 DECORRELATED market! Opportunities for asset rotation');
    } else {
      this.state.marketRegime = 'neutral';
    }
  }
  
  /**
   * Analyze momentum across assets
   */
  analyzeMomentum() {
    this.state.momentum.clear();
    let maxMomentum = -Infinity;
    let dominantAsset = null;
    
    for (const [asset, returns] of this.returns.entries()) {
      if (returns.length >= this.config.momentumLag) {
        // Recent momentum
        const recentReturns = returns.slice(-this.config.momentumLag);
        const momentum = recentReturns.reduce((a, b) => a + b, 0);
        
        // Volatility-adjusted momentum
        const volatility = this.calculateVolatility(recentReturns);
        const sharpeRatio = volatility > 0 ? momentum / volatility : 0;
        
        this.state.momentum.set(asset, {
          raw: momentum,
          sharpe: sharpeRatio,
          rank: 0, // Will be set after sorting
          trend: momentum > 0 ? 'bullish' : 'bearish'
        });
        
        if (sharpeRatio > maxMomentum) {
          maxMomentum = sharpeRatio;
          dominantAsset = asset;
        }
      }
    }
    
    this.state.dominantAsset = dominantAsset;
    
    // Rank assets by momentum
    this.rankAssetsByMomentum();
  }
  
  /**
   * Generate trading signals based on correlations
   */
  generateSignals() {
    this.signals = [];
    
    // 1. Correlation Breakout Signals
    this.detectCorrelationBreakouts();
    
    // 2. Momentum Rotation Signals
    this.detectMomentumRotation();
    
    // 3. Regime Change Signals
    this.detectRegimeChanges();
    
    // 4. Divergence Signals
    this.detectDivergences();
    
    // Sort signals by confidence
    this.signals.sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Detect when correlations break down (opportunities!)
   */
  detectCorrelationBreakouts() {
    // Check if normally correlated assets are diverging
    const btcEthCorr = this.state.correlations.get('BTC/ETH');
    
    if (btcEthCorr && Math.abs(btcEthCorr.value) < this.config.divergenceThreshold) {
      const btcMomentum = this.state.momentum.get('BTC');
      const ethMomentum = this.state.momentum.get('ETH');
      
      if (btcMomentum && ethMomentum) {
        if (btcMomentum.trend === 'bullish' && ethMomentum.trend === 'bearish') {
          this.signals.push({
            type: 'CORRELATION_BREAKOUT',
            action: 'BUY',
            asset: 'ETH',
            reason: 'ETH lagging BTC rally - catch-up trade',
            confidence: 0.75,
            timeframe: 'medium',
            metadata: {
              correlation: btcEthCorr.value,
              btcMomentum: btcMomentum.raw,
              ethMomentum: ethMomentum.raw
            }
          });
        }
      }
    }
  }
  
  /**
   * Detect momentum rotation between assets
   */
  detectMomentumRotation() {
    const rankings = this.getMomentumRankings();
    
    if (rankings.length >= 3) {
      // Look for assets moving up in rankings
      const rising = rankings.filter(r => r.rankChange > 2);
      const falling = rankings.filter(r => r.rankChange < -2);
      
      rising.forEach(asset => {
        this.signals.push({
          type: 'MOMENTUM_ROTATION',
          action: 'BUY',
          asset: asset.symbol,
          reason: `${asset.symbol} gaining momentum rank (+${asset.rankChange})`,
          confidence: 0.65 + (asset.rankChange * 0.05),
          timeframe: 'short',
          metadata: {
            previousRank: asset.previousRank,
            currentRank: asset.rank,
            momentum: asset.momentum
          }
        });
      });
    }
  }
  
  /**
   * Find arbitrage and pair trading opportunities
   */
  findOpportunities() {
    this.opportunities = [];
    
    // 1. Statistical Arbitrage
    this.findStatArbOpportunities();
    
    // 2. Pair Trading Opportunities
    this.findPairTradingOpps();
    
    // 3. Sector Rotation Opportunities  
    this.findSectorRotationOpps();
  }
  
  /**
   * Get analysis summary for decision making
   */
  getAnalysisSummary() {
    return {
      regime: this.state.marketRegime,
      correlationStrength: this.state.correlationStrength,
      dominantAsset: this.state.dominantAsset,
      topSignals: this.signals.slice(0, 3),
      opportunities: this.opportunities.slice(0, 3),
      riskLevel: this.calculateMarketRisk(),
      recommendation: this.generateRecommendation()
    };
  }
  
  /**
   * Generate trading recommendation based on all factors
   */
  generateRecommendation() {
    const regime = this.state.marketRegime;
    const risk = this.calculateMarketRisk();
    
    if (regime === 'risk-on' && risk < 0.3) {
      return {
        action: 'INCREASE_POSITION',
        confidence: 0.8,
        reasoning: 'Risk-on environment with low market risk'
      };
    } else if (regime === 'risk-off' && risk > 0.7) {
      return {
        action: 'REDUCE_POSITION',
        confidence: 0.85,
        reasoning: 'Risk-off environment with high market risk'
      };
    } else if (regime === 'decorrelated') {
      return {
        action: 'ROTATE_ASSETS',
        confidence: 0.7,
        reasoning: 'Decorrelated market favors asset rotation'
      };
    }
    
    return {
      action: 'MAINTAIN_POSITION',
      confidence: 0.6,
      reasoning: 'Neutral market conditions'
    };
  }
  
  // === HELPER METHODS ===
  
  shouldAnalyze() {
    // Check if we have enough data for all tracked assets
    const minDataPoints = 20;
    let readyAssets = 0;
    
    for (const asset of this.config.correlationAssets) {
      const returns = this.returns.get(asset);
      if (returns && returns.length >= minDataPoints) {
        readyAssets++;
      }
    }
    
    return readyAssets >= this.config.correlationAssets.length * 0.8;
  }
  
  calculateVolatility(returns) {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance);
  }
  
  getCorrelationStrength(correlation) {
    const abs = Math.abs(correlation);
    if (abs > 0.8) return 'very_strong';
    if (abs > 0.6) return 'strong';
    if (abs > 0.4) return 'moderate';
    if (abs > 0.2) return 'weak';
    return 'very_weak';
  }
  
  calculateMarketRisk() {
    // Composite risk score based on multiple factors
    let risk = 0;
    
    // VIX contribution
    const vixReturns = this.returns.get('VIX');
    if (vixReturns && vixReturns.length > 0) {
      const vixLevel = vixReturns[vixReturns.length - 1];
      risk += vixLevel > 0 ? 0.3 : -0.1;
    }
    
    // Correlation breakdown risk
    if (this.state.correlationStrength < 0.3) {
      risk += 0.2;
    }
    
    // DXY strength risk
    const dxyMomentum = this.state.momentum.get('DXY');
    if (dxyMomentum && dxyMomentum.trend === 'bullish') {
      risk += 0.2;
    }
    
    return Math.max(0, Math.min(1, risk));
  }
  
  calculateMarketCorrelation() {
    // Average correlation between major crypto assets
    const cryptoCorrs = [];
    
    ['BTC/ETH', 'BTC/BNB', 'ETH/BNB', 'BTC/SOL'].forEach(pair => {
      const corr = this.state.correlations.get(pair);
      if (corr) cryptoCorrs.push(Math.abs(corr.value));
    });
    
    this.state.correlationStrength = cryptoCorrs.length > 0
      ? cryptoCorrs.reduce((a, b) => a + b) / cryptoCorrs.length
      : 0;
  }
  
  rankAssetsByMomentum() {
    const momentumArray = Array.from(this.state.momentum.entries())
      .map(([asset, data]) => ({
        asset,
        sharpe: data.sharpe
      }))
      .sort((a, b) => b.sharpe - a.sharpe);
    
    momentumArray.forEach((item, index) => {
      const data = this.state.momentum.get(item.asset);
      data.rank = index + 1;
    });
  }
  
  getMomentumRankings() {
    // TODO: Compare with previous rankings for rank change
    return Array.from(this.state.momentum.entries())
      .map(([asset, data]) => ({
        symbol: asset,
        rank: data.rank,
        momentum: data.sharpe,
        trend: data.trend,
        rankChange: 0 // Would need historical tracking
      }))
      .sort((a, b) => a.rank - b.rank);
  }
  
  detectRegimeChanges() {
    if (this.state.regimeHistory.length > 0) {
      const previousRegime = this.state.regimeHistory[this.state.regimeHistory.length - 1];
      
      if (previousRegime !== this.state.marketRegime) {
        this.signals.push({
          type: 'REGIME_CHANGE',
          action: this.state.marketRegime === 'risk-on' ? 'BUY' : 'SELL',
          asset: this.config.primaryAsset,
          reason: `Market regime shift: ${previousRegime} → ${this.state.marketRegime}`,
          confidence: 0.8,
          timeframe: 'medium',
          metadata: {
            previousRegime,
            currentRegime: this.state.marketRegime,
            correlationStrength: this.state.correlationStrength
          }
        });
      }
    }
    
    this.state.regimeHistory.push(this.state.marketRegime);
    if (this.state.regimeHistory.length > 100) {
      this.state.regimeHistory.shift();
    }
  }
  
  detectDivergences() {
    // Look for assets moving opposite to their normal correlation
    for (const [pair, corrData] of this.state.correlations.entries()) {
      if (Math.abs(corrData.value) > this.config.correlationThreshold) {
        const [asset1, asset2] = pair.split('/');
        const momentum1 = this.state.momentum.get(asset1);
        const momentum2 = this.state.momentum.get(asset2);
        
        if (momentum1 && momentum2) {
          // Strong correlation but opposite momentum = divergence
          if (corrData.value > 0 && momentum1.trend !== momentum2.trend) {
            this.signals.push({
              type: 'DIVERGENCE',
              action: momentum1.trend === 'bullish' ? 'BUY' : 'SELL',
              asset: asset2,
              reason: `${asset2} diverging from correlated ${asset1}`,
              confidence: 0.7,
              timeframe: 'short',
              metadata: {
                correlation: corrData.value,
                asset1Momentum: momentum1.raw,
                asset2Momentum: momentum2.raw
              }
            });
          }
        }
      }
    }
  }
  
  findStatArbOpportunities() {
    // Find assets that have deviated from their normal correlation
    for (const [pair, corrData] of this.state.correlations.entries()) {
      if (corrData.strength === 'very_strong' || corrData.strength === 'strong') {
        const [asset1, asset2] = pair.split('/');
        const returns1 = this.returns.get(asset1);
        const returns2 = this.returns.get(asset2);
        
        if (returns1 && returns2 && returns1.length >= 10) {
          // Calculate recent deviation from expected relationship
          const recentReturns1 = returns1.slice(-5).reduce((a, b) => a + b, 0);
          const recentReturns2 = returns2.slice(-5).reduce((a, b) => a + b, 0);
          const expectedReturn2 = recentReturns1 * corrData.value;
          const deviation = Math.abs(recentReturns2 - expectedReturn2);
          
          if (deviation > 0.02) { // 2% deviation threshold
            this.opportunities.push({
              type: 'STATISTICAL_ARBITRAGE',
              assets: [asset1, asset2],
              action: recentReturns2 < expectedReturn2 ? 'LONG_SHORT' : 'SHORT_LONG',
              expectedProfit: deviation * 100,
              confidence: 0.65,
              reasoning: `${asset2} has deviated ${(deviation * 100).toFixed(1)}% from expected correlation with ${asset1}`
            });
          }
        }
      }
    }
  }
  
  findPairTradingOpps() {
    // Identify highly correlated pairs for pair trading
    const strongPairs = [];
    
    for (const [pair, corrData] of this.state.correlations.entries()) {
      if (corrData.value > 0.85) {
        strongPairs.push({
          pair,
          correlation: corrData.value,
          assets: pair.split('/')
        });
      }
    }
    
    strongPairs.forEach(({ pair, correlation, assets }) => {
      this.opportunities.push({
        type: 'PAIR_TRADING',
        assets,
        correlation,
        strategy: 'MEAN_REVERSION',
        confidence: correlation * 0.8,
        reasoning: `Strong correlation (${(correlation * 100).toFixed(1)}%) suitable for pair trading`
      });
    });
  }
  
  findSectorRotationOpps() {
    // Compare crypto sectors (DeFi, L1, L2, etc.)
    const sectors = {
      DeFi: ['UNI', 'AAVE', 'COMP'],
      L1: ['ETH', 'SOL', 'AVAX'],
      L2: ['MATIC', 'ARB', 'OP']
    };
    
    // This would need sector classifications in config
    // Simplified version for now
    if (this.state.marketRegime === 'risk-on') {
      const ethMomentum = this.state.momentum.get('ETH');
      const btcMomentum = this.state.momentum.get('BTC');
      
      if (ethMomentum && btcMomentum && ethMomentum.sharpe > btcMomentum.sharpe) {
        this.opportunities.push({
          type: 'SECTOR_ROTATION',
          fromSector: 'STORE_OF_VALUE',
          toSector: 'SMART_CONTRACT_PLATFORMS',
          confidence: 0.7,
          reasoning: 'ETH outperforming BTC suggests rotation to DeFi/Smart contracts'
        });
      }
    }
  }
}

module.exports = CorrelationAnalyzer;