/**
 * 🎯 PERFORMANCE DASHBOARD INTEGRATION
 * 
 * This module connects all the hidden performance tracking systems
 * to the live dashboard for real-time visibility and content creation
 */

const EventEmitter = require('events');
const path = require('path');

// Import all the hidden performance modules
const PerformanceVisualizer = require('./PerformanceVisualizer');
const PerformanceValidator = require('./PerformanceValidator');
// Phase 2 REWRITE: TradingProfileManager deleted - profiles now in ConfigLoader
// CHANGE 2025-12-11: TradingSafetyNet commented out - module doesn't exist

const RUNTIME_PROFILE_DISABLED_REASON = 'runtime_profile_switch_not_wired';

class PerformanceDashboardIntegration extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      updateInterval: config.updateInterval || 5000, // 5 second updates
      enableVisualizations: config.enableVisualizations !== false,
      ...config,
      enableProfileTracking: config.enableProfileTracking === true
    };

    if (this.config.enableProfileTracking) {
      throw new Error(
        `[PerformanceDashboardIntegration] Profile tracking is disabled: ${RUNTIME_PROFILE_DISABLED_REASON}`
      );
    }
    
    // Initialize all performance modules
    this.visualizer = new PerformanceVisualizer({
      outputDir: path.join(process.cwd(), 'public', 'performance'),
      captureFrequency: 10, // Every 10 trades
      generateHtml: true
    });
    
    this.validator = new PerformanceValidator();

    // Real-time metrics storage
    this.liveMetrics = {
      performance: {},
      profiles: {},
      visualizations: {},
      lastUpdate: Date.now()
    };
    
    // Start real-time updates
    this.startRealTimeUpdates();
    
    console.log('🎯 Performance Dashboard Integration initialized');
  }
  
  /**
   * 📊 TRACK TRADE: Connect to main trading bot
   */
  trackTrade(tradeData, currentBalance) {
    try {
      // Update visualizer
      if (this.config.enableVisualizations) {
        this.visualizer.trackTrade(tradeData, currentBalance);
      }
      
      // Update validator
      this.validator.recordTrade(tradeData);
      
      // Emit update for dashboard
      this.emit('metricsUpdate', this.getLiveMetrics());
      
    } catch (error) {
      console.error('❌ Performance tracking error:', error);
    }
  }
  
  /**
   * 📈 GET LIVE METRICS: For dashboard display
   */
  getLiveMetrics() {
    try {
      // Get performance metrics
      const performanceReport = this.validator.getPerformanceReport();
      
      // Get visualization data
      const visualizationData = this.visualizer?.getMetrics?.() || {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 1,
        sharpeRatio: 0,
        maxDrawdown: 0,
        currentBalance: 10000
      };
      
      this.liveMetrics = {
        performance: {
          totalTrades: performanceReport.overview.totalTrades,
          winRate: (performanceReport.overview.winRate * 100).toFixed(2),
          totalPnL: performanceReport.overview.totalPnL.toFixed(2),
          bestComponent: performanceReport.overview.bestComponent,
          worstComponent: performanceReport.overview.worstComponent,
          components: performanceReport.components
        },
        
        profiles: this.getRuntimeProfileStatus(),
        
        visualizations: {
          totalTrades: visualizationData.totalTrades,
          winRate: (visualizationData.winRate * 100).toFixed(2),
          profitFactor: visualizationData.profitFactor.toFixed(2),
          sharpeRatio: visualizationData.sharpeRatio.toFixed(2),
          maxDrawdown: (visualizationData.maxDrawdown * 100).toFixed(2),
          currentBalance: visualizationData.currentBalance.toFixed(2)
        },
        
        lastUpdate: Date.now(),
        timestamp: new Date().toISOString()
      };
      
      return this.liveMetrics;
      
    } catch (error) {
      console.error('❌ Error getting live metrics:', error);
      return this.liveMetrics; // Return last known good state
    }
  }

  getRuntimeProfileStatus() {
    return {
      enabled: false,
      reason: RUNTIME_PROFILE_DISABLED_REASON,
      activeProfile: null,
      availableProfiles: [],
      profileStats: null
    };
  }
  
  /**
   * 🔄 START REAL-TIME UPDATES: For dashboard
   */
  startRealTimeUpdates() {
    // CHANGE 2026-01-29: Store interval for cleanup
    this.realTimeUpdateInterval = setInterval(() => {
      try {
        const metrics = this.getLiveMetrics();
        this.emit('dashboardUpdate', metrics);
      } catch (error) {
        console.error('❌ Real-time update error:', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * CHANGE 2026-01-29: Shutdown to clear intervals
   */
  shutdown() {
    if (this.realTimeUpdateInterval) {
      clearInterval(this.realTimeUpdateInterval);
      this.realTimeUpdateInterval = null;
    }
  }
  
  /**
   * 📊 GET PERFORMANCE CHARTS: For content creation
   */
  getPerformanceCharts() {
    return this.visualizer.generateChartData();
  }
  
  /**
   * 📈 GET DETAILED REPORT: For analysis
   */
  getDetailedReport() {
    return {
      performance: this.validator.getPerformanceReport(),
      profiles: this.getRuntimeProfileStatus(),
      visualizations: this.visualizer.getDetailedMetrics()
    };
  }
  
  /**
   * 🎯 VALIDATE TRADE: Before execution
   */
  validateTrade(tradeParams) {
    return { approved: true, reason: 'Performance dashboard is telemetry-only' };
  }
  
  /**
   * SWITCH PROFILE: Change trading profile
   */
  switchProfile(profileName) {
    const requestedProfile = typeof profileName === 'string' && profileName.trim()
      ? profileName.trim()
      : 'unknown';

    throw new Error(
      `[PerformanceDashboardIntegration] Runtime profile switch rejected for '${requestedProfile}': ${RUNTIME_PROFILE_DISABLED_REASON}`
    );
  }
}

module.exports = PerformanceDashboardIntegration;
