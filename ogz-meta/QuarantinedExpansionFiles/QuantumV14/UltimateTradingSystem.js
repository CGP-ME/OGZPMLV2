// ===================================================================
// ULTIMATE TRADING SYSTEM - THE FINAL BOSS! 🎯🚀💎
// ===================================================================
// Integrates EVERYTHING: Correlation + Multi-Directional + Learning + Hitch
// THE MOST ADVANCED TRADING SYSTEM EVER CREATED!

const EventEmitter = require('events');
const CorrelationAnalyzer = require('./CorrelationAnalyzer');
const MultiDirectionalTrader = require('./MultiDirectionalTrader');

class UltimateTradingSystem extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Core settings
      primaryAsset: config.primaryAsset || 'BTC',
      enableAdvancedFeatures: config.enableAdvancedFeatures !== false,
      
      // System components
      enableCorrelationAnalysis: config.enableCorrelationAnalysis !== false,
      enableMultiDirectional: config.enableMultiDirectional !== false,
      enableLearning: config.enableLearning !== false,
      
      // Integration settings
      analysisInterval: config.analysisInterval || 30000,    // 30 seconds
      rebalanceInterval: config.rebalanceInterval || 300000, // 5 minutes
      
      // Risk management
      maxSystemExposure: config.maxSystemExposure || 0.8,   // 80% max total exposure
      emergencyStopLoss: config.emergencyStopLoss || 0.15,  // 15% emergency stop
      
      ...config
    };
    
    // Initialize core components
    this.correlationAnalyzer = new CorrelationAnalyzer({
      primaryAsset: this.config.primaryAsset,
      correlationAssets: ['ETH', 'BNB', 'SOL', 'MATIC', 'AVAX', 'DXY', 'SPX', 'GOLD', 'VIX'],
      enableArbitrage: true,
      correlationThreshold: 0.7,
      divergenceThreshold: 0.3
    });
    
    this.multiDirectionalTrader = new MultiDirectionalTrader({
      enableShorts: true,
      enableHedging: true,
      arbitrage: true,
      pairTrading: true,
      regimeAdaptive: true,
      maxLongExposure: 0.6,
      maxShortExposure: 0.4,
      deltaNeutralMode: false
    });
    
    // System state
    this.systemState = {
      active: false,
      mode: 'normal',
      lastAnalysis: 0,
      lastRebalance: 0,
      emergencyMode: false,
      totalPnL: 0,
      
      // Performance tracking
      totalTrades: 0,
      winningTrades: 0,
      correlationTrades: 0,
      arbitrageTrades: 0,
      multiDirectionalTrades: 0
    };
    
    // Market intelligence
    this.marketIntelligence = {
      currentRegime: 'unknown',
      dominantAsset: null,
      riskLevel: 0.5,
      opportunityScore: 0,
      correlationStrength: 0,
      volatilityLevel: 'normal',
      
      // Signals aggregation
      signals: [],
      opportunities: [],
      activeStrategies: new Set()
    };
    
    // Integration with external systems
    this.externalSystems = {
      mainBot: null,
      learningSystem: null,
      hitchSystem: null,
      websocketManager: null
    };
    
    // Setup event flow
    this.setupEventFlow();
    
    console.log('🎯 ULTIMATE TRADING SYSTEM INITIALIZED!');
    console.log('🌐 Correlation Analysis: ENABLED');
    console.log('🔄 Multi-Directional Trading: ENABLED');
    console.log('💎 Arbitrage Detection: ENABLED');
    console.log('🧠 Adaptive Regime Detection: ENABLED');
    console.log('⚡ READY TO DOMINATE ALL MARKET CONDITIONS!');
  }
  
  /**
   * Setup event flow between all components
   */
  setupEventFlow() {
    // Correlation signals → Multi-directional trader
    this.correlationAnalyzer.on('analysis', async (analysis) => {
      await this.processCorrelationAnalysis(analysis);
    });
    
    // Multi-directional trader events
    this.multiDirectionalTrader.on('positionOpened', (position) => {
      this.onPositionOpened(position);
    });
    
    this.multiDirectionalTrader.on('positionClosed', (position) => {
      this.onPositionClosed(position);
    });
    
    this.multiDirectionalTrader.on('arbitrageExecuted', (arbitrage) => {
      this.onArbitrageExecuted(arbitrage);
    });
    
    this.multiDirectionalTrader.on('pairTradeExecuted', (pairTrade) => {
      this.onPairTradeExecuted(pairTrade);
    });
  }
  
  /**
   * Start the ultimate trading system
   */
  async start() {
    console.log('🚀 STARTING ULTIMATE TRADING SYSTEM...');
    
    this.systemState.active = true;
    
    // Start analysis loop
    this.analysisInterval = setInterval(() => {
      this.runSystemAnalysis();
    }, this.config.analysisInterval);
    
    // Start rebalancing loop
    this.rebalanceInterval = setInterval(() => {
      this.runSystemRebalance();
    }, this.config.rebalanceInterval);
    
    console.log('✅ ULTIMATE TRADING SYSTEM ONLINE!');
    console.log('🔄 Analysis running every 30 seconds');
    console.log('⚖️ Rebalancing every 5 minutes');
    
    this.emit('systemStarted');
  }
  
  /**
   * Stop the system
   */
  async stop() {
    console.log('🛑 STOPPING ULTIMATE TRADING SYSTEM...');
    
    this.systemState.active = false;
    
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
    }
    
    if (this.rebalanceInterval) {
      clearInterval(this.rebalanceInterval);
    }
    
    console.log('✅ System stopped gracefully');
    this.emit('systemStopped');
  }
  
  /**
   * Connect external systems
   */
  connectExternalSystems(systems) {
    this.externalSystems = { ...this.externalSystems, ...systems };
    
    if (systems.mainBot) {
      console.log('🤖 Connected to main trading bot');
    }
    
    if (systems.learningSystem) {
      console.log('🧠 Connected to learning system');
    }
    
    if (systems.hitchSystem) {
      console.log('🗣️ Connected to Hitch NLP system');
    }
    
    if (systems.websocketManager) {
      console.log('🌐 Connected to WebSocket manager');
    }
  }
  
  /**
   * Main system analysis - THE BRAIN OPERATION!
   */
  async runSystemAnalysis() {
    if (!this.systemState.active) return;
    
    try {
      console.log('🧠 RUNNING ULTIMATE SYSTEM ANALYSIS...');
      
      // Update market intelligence
      await this.updateMarketIntelligence();
      
      // Check for emergency conditions
      this.checkEmergencyConditions();
      
      // Generate integrated signals
      const integratedSignals = await this.generateIntegratedSignals();
      
      // Execute top strategies
      await this.executeTopStrategies(integratedSignals);
      
      // Update system metrics
      this.updateSystemMetrics();
      
      this.systemState.lastAnalysis = Date.now();
      
      this.emit('analysisComplete', {
        marketIntelligence: this.marketIntelligence,
        signals: integratedSignals,
        systemState: this.systemState
      });
      
    } catch (error) {
      console.error('❌ System analysis error:', error);
      this.emit('analysisError', error);
    }
  }
  
  /**
   * Update market intelligence from all sources
   */
  async updateMarketIntelligence() {
    // Get latest correlation analysis
    const correlationSummary = this.correlationAnalyzer.getAnalysisSummary();
    
    // Get multi-directional trader status
    const traderStatus = this.multiDirectionalTrader.getStatus();
    
    // Update market intelligence
    this.marketIntelligence = {
      ...this.marketIntelligence,
      currentRegime: correlationSummary.regime,
      dominantAsset: correlationSummary.dominantAsset,
      riskLevel: correlationSummary.riskLevel,
      correlationStrength: correlationSummary.correlationStrength,
      
      // Aggregate signals
      signals: correlationSummary.topSignals || [],
      opportunities: correlationSummary.opportunities || [],
      
      // Trading status
      exposure: traderStatus.exposure,
      activeStrategies: traderStatus.strategyState.activeStrategies
    };
    
    // Calculate opportunity score
    this.marketIntelligence.opportunityScore = this.calculateOpportunityScore();
    
    console.log(`📊 Market Intelligence Updated:`);
    console.log(`   Regime: ${this.marketIntelligence.currentRegime}`);
    console.log(`   Risk Level: ${(this.marketIntelligence.riskLevel * 100).toFixed(0)}%`);
    console.log(`   Opportunity Score: ${(this.marketIntelligence.opportunityScore * 100).toFixed(0)}%`);
    console.log(`   Active Signals: ${this.marketIntelligence.signals.length}`);
  }
  
  /**
   * Calculate overall opportunity score
   */
  calculateOpportunityScore() {
    let score = 0;
    
    // Base score from regime
    const regimeScores = {
      'bull': 0.8,
      'bear': 0.7,
      'risk-on': 0.8,
      'risk-off': 0.6,
      'decorrelated': 0.9, // High opportunities for arbitrage
      'volatile': 0.5,
      'ranging': 0.6,
      'crash': 0.3
    };
    
    score += regimeScores[this.marketIntelligence.currentRegime] || 0.5;
    
    // Boost for signals
    score += (this.marketIntelligence.signals.length * 0.1);
    
    // Boost for opportunities
    score += (this.marketIntelligence.opportunities.length * 0.15);
    
    // Reduce for high risk
    score *= (1 - this.marketIntelligence.riskLevel * 0.3);
    
    // Boost for low correlation (arbitrage opportunities)
    if (this.marketIntelligence.correlationStrength < 0.4) {
      score += 0.2;
    }
    
    return Math.min(1.0, Math.max(0.1, score));
  }
  
  /**
   * Check for emergency conditions
   */
  checkEmergencyConditions() {
    const exposure = this.marketIntelligence.exposure;
    
    // Check total exposure
    if (exposure && exposure.total > this.config.maxSystemExposure) {
      console.log('⚠️ EMERGENCY: Total exposure exceeds limit!');
      this.triggerEmergencyMode('exposure_limit');
    }
    
    // Check if in crash regime with high exposure
    if (this.marketIntelligence.currentRegime === 'crash' && exposure && exposure.net > 0.3) {
      console.log('⚠️ EMERGENCY: Crash detected with high long exposure!');
      this.triggerEmergencyMode('crash_exposure');
    }
    
    // Check risk level
    if (this.marketIntelligence.riskLevel > 0.8) {
      console.log('⚠️ HIGH RISK: Enabling defensive mode');
      this.systemState.mode = 'defensive';
    } else if (this.systemState.mode === 'defensive' && this.marketIntelligence.riskLevel < 0.5) {
      console.log('✅ Risk normalized, returning to normal mode');
      this.systemState.mode = 'normal';
    }
  }
  
  /**
   * Trigger emergency mode
   */
  triggerEmergencyMode(reason) {
    this.systemState.emergencyMode = true;
    this.systemState.emergencyReason = reason;
    
    console.log(`🚨 EMERGENCY MODE ACTIVATED: ${reason}`);
    
    // Send emergency command to main bot if connected
    if (this.externalSystems.mainBot && this.externalSystems.mainBot.emergencyStop) {
      this.externalSystems.mainBot.emergencyStop(reason);
    }
    
    // Send emergency command via Hitch if connected
    if (this.externalSystems.hitchSystem) {
      this.externalSystems.hitchSystem.processCommand(`emergency stop due to ${reason}`);
    }
    
    this.emit('emergencyTriggered', { reason, timestamp: Date.now() });
  }
  
  /**
   * Generate integrated signals from all systems
   */
  async generateIntegratedSignals() {
    const integratedSignals = [];
    
    // Process correlation signals
    for (const signal of this.marketIntelligence.signals) {
      const enhancedSignal = await this.enhanceSignalWithMultiDirectional(signal);
      integratedSignals.push(enhancedSignal);
    }
    
    // Process arbitrage opportunities
    for (const opportunity of this.marketIntelligence.opportunities) {
      if (opportunity.type === 'STATISTICAL_ARBITRAGE' || opportunity.type === 'CORRELATION_ARBITRAGE') {
        integratedSignals.push({
          type: 'ARBITRAGE',
          subtype: opportunity.type,
          action: 'EXECUTE_ARBITRAGE',
          confidence: opportunity.confidence,
          expectedProfit: opportunity.expectedProfit,
          assets: opportunity.assets,
          reasoning: opportunity.reasoning,
          priority: 'high'
        });
      }
    }
    
    // Sort by confidence and priority
    integratedSignals.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      return b.confidence - a.confidence;
    });
    
    return integratedSignals;
  }
  
  /**
   * Enhance correlation signal with multi-directional analysis
   */
  async enhanceSignalWithMultiDirectional(signal) {
    // Create market data for multi-directional analysis
    const marketData = {
      volatility: { current: 0.03, average: 0.02, level: 'normal' },
      trend: { direction: signal.action === 'BUY' ? 'up' : 'down', strength: signal.confidence },
      momentum: { rsi: 50, macd: 'neutral' },
      volume: { ratio: 1.2 },
      correlations: {
        regime: this.marketIntelligence.currentRegime,
        strength: this.marketIntelligence.correlationStrength,
        signals: this.marketIntelligence.signals,
        opportunities: this.marketIntelligence.opportunities
      }
    };
    
    // Get multi-directional evaluation
    const evaluation = await this.multiDirectionalTrader.evaluateTrade(signal, marketData);
    
    return {
      ...signal,
      multiDirectional: evaluation,
      enhancedConfidence: evaluation.confidence,
      suggestedDirection: evaluation.direction,
      suggestedSize: evaluation.size,
      hedgeRequired: evaluation.hedge,
      arbitrageOpportunity: evaluation.arbitrage,
      reasoning: evaluation.reasoning
    };
  }
  
  /**
   * Execute top strategies
   */
  async executeTopStrategies(signals) {
    if (this.systemState.emergencyMode) {
      console.log('🚨 Emergency mode active - no new trades');
      return;
    }
    
    const maxNewTrades = this.systemState.mode === 'defensive' ? 1 : 3;
    let newTrades = 0;
    
    for (const signal of signals.slice(0, 5)) { // Top 5 signals
      if (newTrades >= maxNewTrades) break;
      
      try {
        if (signal.type === 'ARBITRAGE') {
          await this.executeArbitrageStrategy(signal);
          newTrades++;
        } else if (signal.enhancedConfidence > 0.7) {
          await this.executeDirectionalStrategy(signal);
          newTrades++;
        }
        
        // Small delay between trades
        await this.delay(1000);
        
      } catch (error) {
        console.error(`❌ Error executing strategy:`, error);
      }
    }
    
    console.log(`✅ Executed ${newTrades} strategies this cycle`);
  }
  
  /**
   * Execute arbitrage strategy
   */
  async executeArbitrageStrategy(signal) {
    console.log('💎 EXECUTING ARBITRAGE STRATEGY...');
    
    const opportunity = {
      type: signal.subtype,
      assets: signal.assets,
      expectedProfit: signal.expectedProfit,
      confidence: signal.confidence,
      reasoning: signal.reasoning
    };
    
    const result = await this.multiDirectionalTrader.executeArbitrage(opportunity);
    
    if (result) {
      this.systemState.arbitrageTrades++;
      this.systemState.totalTrades++;
      
      console.log(`💎 Arbitrage executed: ${signal.subtype}`);
      console.log(`📈 Expected profit: ${signal.expectedProfit.toFixed(2)}%`);
    }
  }
  
  /**
   * Execute directional strategy
   */
  async executeDirectionalStrategy(signal) {
    console.log('🎯 EXECUTING DIRECTIONAL STRATEGY...');
    
    const trade = {
      direction: signal.suggestedDirection,
      asset: signal.asset,
      size: signal.suggestedSize,
      entry: 0, // Would be filled by execution system
      confidence: signal.enhancedConfidence,
      reasoning: signal.reasoning,
      regime: this.marketIntelligence.currentRegime,
      type: signal.multiDirectional?.positionType || 'standard'
    };
    
    // Execute main position
    const position = await this.multiDirectionalTrader.openPosition(trade);
    
    if (position) {
      this.systemState.multiDirectionalTrades++;
      this.systemState.totalTrades++;
      
      // Execute hedge if required
      if (signal.hedgeRequired && signal.hedgeRequired.required) {
        const hedgeTrade = {
          ...trade,
          direction: signal.hedgeRequired.direction,
          size: signal.hedgeRequired.size,
          type: 'hedge'
        };
        
        await this.multiDirectionalTrader.openPosition(hedgeTrade);
        console.log(`🛡️ Hedge executed: ${signal.hedgeRequired.reason}`);
      }
      
      console.log(`🎯 Directional trade executed: ${trade.direction.toUpperCase()} ${trade.asset}`);
    }
  }
  
  /**
   * Run system rebalancing
   */
  async runSystemRebalance() {
    if (!this.systemState.active || this.systemState.emergencyMode) return;
    
    console.log('⚖️ RUNNING SYSTEM REBALANCE...');
    
    const exposure = this.marketIntelligence.exposure;
    const regime = this.marketIntelligence.currentRegime;
    
    // Regime-based rebalancing
    if (regime === 'crash' && exposure && exposure.long > 0.3) {
      console.log('💥 CRASH REGIME: Reducing long exposure');
      await this.reduceExposure('long', 0.5);
    }
    
    if (regime === 'bull' && exposure && exposure.short > 0.2) {
      console.log('📈 BULL REGIME: Reducing short exposure');
      await this.reduceExposure('short', 0.7);
    }
    
    if (regime === 'volatile' && exposure && Math.abs(exposure.net) > 0.4) {
      console.log('⚡ VOLATILE REGIME: Reducing net exposure');
      await this.balanceExposure();
    }
    
    this.systemState.lastRebalance = Date.now();
  }
  
  /**
   * Process correlation analysis results
   */
  async processCorrelationAnalysis(analysis) {
    console.log('🌐 PROCESSING CORRELATION ANALYSIS...');
    
    // Update market intelligence
    this.marketIntelligence.currentRegime = analysis.regime;
    this.marketIntelligence.dominantAsset = analysis.dominantAsset;
    this.marketIntelligence.correlationStrength = analysis.correlations?.strength || 0;
    
    // Process high-confidence signals immediately
    for (const signal of analysis.signals) {
      if (signal.confidence > 0.8 && signal.type === 'CORRELATION_BREAKOUT') {
        console.log(`🔥 HIGH-CONFIDENCE CORRELATION SIGNAL: ${signal.reason}`);
        
        // Add to priority queue
        this.marketIntelligence.signals.unshift(signal);
      }
    }
    
    // Process arbitrage opportunities immediately
    for (const opportunity of analysis.opportunities) {
      if (opportunity.confidence > 0.8) {
        console.log(`💎 HIGH-CONFIDENCE ARBITRAGE: ${opportunity.reasoning}`);
        
        // Execute immediately if profitable enough
        if (opportunity.expectedProfit > 1.5) {
          await this.executeArbitrageStrategy({
            type: 'ARBITRAGE',
            subtype: opportunity.type,
            confidence: opportunity.confidence,
            expectedProfit: opportunity.expectedProfit,
            assets: opportunity.assets,
            reasoning: opportunity.reasoning
          });
        }
      }
    }
  }
  
  /**
   * Handle position events
   */
  onPositionOpened(position) {
    console.log(`📊 Position opened: ${position.asset} ${position.direction.toUpperCase()}`);
    
    // Update learning system if connected
    if (this.externalSystems.learningSystem) {
      this.externalSystems.learningSystem.processLogWithLearning({
        level: 'info',
        message: `Position opened: ${position.asset} ${position.direction} @ ${position.entry}`,
        timestamp: Date.now(),
        data: { position, regime: this.marketIntelligence.currentRegime }
      });
    }
    
    this.emit('positionOpened', position);
  }
  
  onPositionClosed(position) {
    const pnlPercent = (position.realizedPnL * 100).toFixed(2);
    console.log(`📊 Position closed: ${position.asset} ${position.direction.toUpperCase()} | PnL: ${pnlPercent}%`);
    
    // Update system stats
    this.systemState.totalPnL += position.realizedPnL;
    
    if (position.realizedPnL > 0) {
      this.systemState.winningTrades++;
    }
    
    // Update learning system if connected
    if (this.externalSystems.learningSystem) {
      this.externalSystems.learningSystem.processLogWithLearning({
        level: 'info',
        message: `Position closed with ${position.realizedPnL > 0 ? 'profit' : 'loss'}: ${pnlPercent}%`,
        timestamp: Date.now(),
        data: { position, pnl: position.realizedPnL }
      });
    }
    
    this.emit('positionClosed', position);
  }
  
  onArbitrageExecuted(arbitrage) {
    console.log(`💎 Arbitrage executed: ${arbitrage.type} | Expected: ${arbitrage.expectedProfit.toFixed(2)}%`);
    this.emit('arbitrageExecuted', arbitrage);
  }
  
  onPairTradeExecuted(pairTrade) {
    console.log(`🤝 Pair trade executed: ${pairTrade.assets.join('/')}`);
    this.emit('pairTradeExecuted', pairTrade);
  }
  
  /**
   * Update market prices (called from external price feeds)
   */
  updateMarketPrices(prices) {
    // Feed to correlation analyzer
    this.correlationAnalyzer.updatePrices(prices);
  }
  
  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    const traderPerformance = this.multiDirectionalTrader.getPerformanceSummary();
    
    return {
      systemState: this.systemState,
      marketIntelligence: this.marketIntelligence,
      performance: {
        ...traderPerformance,
        systemPnL: this.systemState.totalPnL,
        totalTrades: this.systemState.totalTrades,
        winRate: this.systemState.totalTrades > 0 
          ? (this.systemState.winningTrades / this.systemState.totalTrades * 100).toFixed(1) + '%'
          : '0%',
        arbitrageRate: this.systemState.totalTrades > 0
          ? (this.systemState.arbitrageTrades / this.systemState.totalTrades * 100).toFixed(1) + '%'
          : '0%'
      },
      connectedSystems: {
        mainBot: !!this.externalSystems.mainBot,
        learningSystem: !!this.externalSystems.learningSystem,
        hitchSystem: !!this.externalSystems.hitchSystem,
        websocketManager: !!this.externalSystems.websocketManager
      },
      lastUpdate: Date.now()
    };
  }
  
  /**
   * Execute Hitch command
   */
  async executeHitchCommand(command) {
    console.log(`🗣️ Processing Hitch command: ${command}`);
    
    // Route to appropriate system
    if (command.includes('emergency stop')) {
      this.triggerEmergencyMode('hitch_command');
    } else if (command.includes('activate aggressive')) {
      this.systemState.mode = 'aggressive';
      console.log('⚡ Switched to AGGRESSIVE mode');
    } else if (command.includes('activate conservative')) {
      this.systemState.mode = 'defensive';
      console.log('🛡️ Switched to CONSERVATIVE mode');
    } else if (command.includes('analyze market')) {
      await this.runSystemAnalysis();
    } else if (command.includes('rebalance')) {
      await this.runSystemRebalance();
    }
    
    return {
      success: true,
      action: command,
      systemMode: this.systemState.mode,
      timestamp: Date.now()
    };
  }
  
  // Helper methods
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async reduceExposure(direction, targetReduction) {
    // Implementation would close positions to reduce exposure
    console.log(`🔄 Reducing ${direction} exposure by ${(targetReduction * 100).toFixed(0)}%`);
  }
  
  async balanceExposure() {
    // Implementation would balance long/short exposure
    console.log('⚖️ Balancing exposure to reduce net risk');
  }
  
  updateSystemMetrics() {
    // Update various system metrics
    this.marketIntelligence.lastUpdate = Date.now();
  }
}

module.exports = UltimateTradingSystem;