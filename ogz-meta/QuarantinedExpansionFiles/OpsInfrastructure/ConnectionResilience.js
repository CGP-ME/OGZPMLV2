/**
 * 🛡️ CONNECTION RESILIENCE SYSTEM
 * FIXED: Properly detects and handles stale data
 * Monitors all WebSocket connections and data feeds
 * Auto-recovers from connection failures
 */

const path = require('path');
const fs = require('fs');

class ConnectionResilience {
  constructor(ogzPrime) {
    this.ogzPrime = ogzPrime;
    
    // Connection state with proper tracking
    this.connectionState = {
      dataFeed: {
        status: 'unknown',
        lastData: Date.now(), // Initialize to now
        reconnectAttempts: 0,
        isReconnecting: false
      },
      guiWebSocket: {
        status: 'unknown',
        lastPing: Date.now()
      },
      controlWebSocket: {
        status: 'unknown',
        lastPing: Date.now()
      }
    };
    
    // Configuration
    this.config = {
      checkInterval: 5000,          // Check every 5 seconds
      dataStaleTimeout: 30000,      // 30 seconds = stale
      criticalStaleTimeout: 60000,  // 60 seconds = critical
      maxReconnectAttempts: 10,
      emergencyStateFile: path.join(process.cwd(), 'data', 'emergency_state.json')
    };
    
    // Start monitoring immediately
    this.startMonitoring();
    
    // Hook into market data updates
    this.setupDataTracking();
    
    console.log('🛡️ Connection Resilience System: ACTIVE');
  }
  
  /**
   * Setup tracking of incoming data
   */
  setupDataTracking() {
    // Track every market data update
    if (this.ogzPrime.on) {
      this.ogzPrime.on('market_data_update', () => {
        this.connectionState.dataFeed.lastData = Date.now();
      });
      
      // Track simulation ticks
      this.ogzPrime.on('simulation_tick', () => {
        this.connectionState.dataFeed.lastData = Date.now();
      });
    }
    
    // Also track through marketData updates
    const originalProcessTick = this.ogzPrime.processTick?.bind(this.ogzPrime);
    if (originalProcessTick) {
      this.ogzPrime.processTick = (tick) => {
        this.connectionState.dataFeed.lastData = Date.now();
        return originalProcessTick(tick);
      };
    }
  }
  
  /**
   * Start monitoring with proper interval
   */
  startMonitoring() {
    // Clear any existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Start checking
    this.checkInterval = setInterval(() => {
      this.checkDataFreshness();
    }, this.config.checkInterval);
    
    console.log('👁️ Monitoring started - checking every 5 seconds');
  }
  
  /**
   * Check if data is fresh
   */
  checkDataFreshness() {
    const now = Date.now();
    const dataAge = now - this.connectionState.dataFeed.lastData;
    
    // Log current state
    if (dataAge > 10000) { // Log if older than 10 seconds
      console.log(`📊 Data age: ${(dataAge/1000).toFixed(1)}s`);
    }
    
    // Check thresholds
    if (dataAge > this.config.criticalStaleTimeout) {
      // CRITICAL - Force restart
      console.error(`🚨 CRITICAL: Data ${(dataAge/1000).toFixed(0)}s old - FORCING RESTART`);
      this.forceDataRestart();
      
    } else if (dataAge > this.config.dataStaleTimeout) {
      // WARNING - Attempt reconnection
      console.warn(`⚠️ WARNING: Data ${(dataAge/1000).toFixed(0)}s old - attempting recovery`);
      this.handleStaleData();
      
    } else if (dataAge < 5000 && this.connectionState.dataFeed.status !== 'healthy') {
      // Data is flowing again
      console.log('✅ Data feed healthy');
      this.connectionState.dataFeed.status = 'healthy';
      this.connectionState.dataFeed.reconnectAttempts = 0;
    }
  }
  
  /**
   * Handle stale data with immediate action
   */
  handleStaleData() {
    const state = this.connectionState.dataFeed;
    
    // Don't spam reconnections
    if (state.isReconnecting) {
      return;
    }
    
    state.isReconnecting = true;
    state.status = 'stale';
    
    console.log('🔄 Attempting to restore data feed...');
    
    // Notify GUI if available
    if (this.ogzPrime.webSocketManager?.broadcast) {
      this.ogzPrime.webSocketManager.broadcast(this.ogzPrime.config.guiWebSocketPort, {
        type: 'data_stale_warning',
        message: 'Market data is stale - attempting recovery',
        timestamp: Date.now()
      });
    }
    
    // Attempt recovery
    setTimeout(() => {
      this.attemptDataRecovery();
    }, 1000);
  }
  
  /**
   * Force complete restart of data feed
   */
  forceDataRestart() {
    console.log('🔥 FORCING COMPLETE DATA RESTART');
    
    // Clear ALL intervals
    if (this.ogzPrime.simulationInterval) {
      clearInterval(this.ogzPrime.simulationInterval);
      this.ogzPrime.simulationInterval = null;
    }
    
    // Reset connection state
    this.connectionState.dataFeed = {
      status: 'restarting',
      lastData: Date.now(),
      reconnectAttempts: 0,
      isReconnecting: false
    };
    
    // Restart based on mode
    setTimeout(() => {
      if (this.ogzPrime.config?.mode === 'simulate' && this.ogzPrime.simulateMarketData) {
        console.log('🔄 Restarting simulation data feed...');
        this.ogzPrime.simulateMarketData();
      } else if (this.ogzPrime.polygonSocket?.connect) {
        console.log('🔄 Reconnecting to Polygon...');
        this.ogzPrime.polygonSocket.connect();
      }
      
      // Verify restart worked
      setTimeout(() => {
        const newAge = Date.now() - this.connectionState.dataFeed.lastData;
        if (newAge < 5000) {
          console.log('✅ Data feed successfully restored!');
        } else {
          console.error('❌ Data feed restart failed - manual intervention required');
        }
      }, 5000);
    }, 2000);
  }
  
  /**
   * Attempt data recovery without full restart
   */
  attemptDataRecovery() {
    const state = this.connectionState.dataFeed;
    
    // For simulation mode
    if (this.ogzPrime.config?.mode === 'simulate') {
      if (!this.ogzPrime.simulationInterval && this.ogzPrime.simulateMarketData) {
        console.log('📡 Simulation interval missing - restarting...');
        this.ogzPrime.simulateMarketData();
      }
    }
    
    // Check if recovery worked
    setTimeout(() => {
      const dataAge = Date.now() - state.lastData;
      if (dataAge < this.config.dataStaleTimeout) {
        console.log('✅ Data feed recovered');
        state.status = 'healthy';
      } else {
        console.log('❌ Recovery failed - escalating...');
        this.forceDataRestart();
      }
      state.isReconnecting = false;
    }, 5000);
  }
  
  /**
   * Get current health status
   */
  getHealthStatus() {
    const now = Date.now();
    const dataAge = now - this.connectionState.dataFeed.lastData;
    
    return {
      dataFeed: {
        ...this.connectionState.dataFeed,
        dataAge: dataAge,
        ageSeconds: (dataAge / 1000).toFixed(1),
        healthy: dataAge < this.config.dataStaleTimeout
      },
      guiWebSocket: this.connectionState.guiWebSocket,
      controlWebSocket: this.connectionState.controlWebSocket,
      timestamp: now
    };
  }

  /**
   * Update data timestamp manually
   */
  updateDataTimestamp() {
    this.connectionState.dataFeed.lastData = Date.now();
  }

  /**
   * Emergency stop all connections
   */
  emergencyStop() {
    console.log('🛑 EMERGENCY STOP - Halting all connections');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Save emergency state
    const emergencyData = {
      reason: 'EMERGENCY_STOP',
      timestamp: Date.now(),
      lastState: this.connectionState
    };
    
    try {
      fs.writeFileSync(this.config.emergencyStateFile, JSON.stringify(emergencyData, null, 2));
    } catch (error) {
      console.error('Failed to save emergency state:', error);
    }
  }

  /**
   * Cleanup on shutdown
   */
  shutdown() {
    console.log('🛑 Shutting down Connection Resilience');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

module.exports = ConnectionResilience;
