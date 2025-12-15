// public/modules/timeframeManager.js - Frontend Timeframe Management
// Handles UI timeframe switching and chart data management

/**
 * Frontend Timeframe Manager - UI Controller for Multiple Timeframes
 * Works with backend TimeframeManager to display different chart timeframes
 */
class FrontendTimeframeManager {
  constructor(chartInstance) {
    this.chart = chartInstance;
    this.currentTimeframe = '1m';
    this.availableTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
    this.timeframeData = {};
    this.maxDataPoints = 100; // Limit for performance
    
    // Initialize data storage for each timeframe
    this.availableTimeframes.forEach(tf => {
      this.timeframeData[tf] = {
        labels: [],
        prices: [],
        volumes: [],
        lastUpdate: 0
      };
    });
    
    // Create UI controls
    this.createTimeframeControls();
    
    console.log('📊 Frontend Timeframe Manager initialized');
  }
  
  /**
   * Create timeframe selection buttons in the UI
   */
  createTimeframeControls() {
    // Find or create timeframe controls container
    let controlsContainer = document.getElementById('timeframe-controls');
    
    if (!controlsContainer) {
      controlsContainer = document.createElement('div');
      controlsContainer.id = 'timeframe-controls';
      controlsContainer.className = 'timeframe-controls';
      
      // Insert into chart container (assuming it exists)
      const chartContainer = document.querySelector('.chart-container');
      if (chartContainer) {
        chartContainer.appendChild(controlsContainer);
      } else {
        console.warn('Timeframe controls container could not be attached: .chart-container not found.');
        document.body.appendChild(controlsContainer); // Fallback to body
      }
    }
    
    // Create buttons for each timeframe
    controlsContainer.innerHTML = this.availableTimeframes.map(tf => `
      <button 
        class="timeframe-btn ${tf === this.currentTimeframe ? 'active' : ''}" 
        data-timeframe="${tf}"
        onclick="window.frontendTfManager.switchTimeframe('${tf}')"
      >
        ${tf.toUpperCase()}
      </button>
    `).join('');
  }
  
  /**
   * Process incoming WebSocket data for different timeframes
   * @param {Object} data - WebSocket data from backend
   */
  processTimeframeData(data) {
    // Handle candle data from backend
    if (data.type === 'candle' && data.timeframe) {
      this.updateTimeframeData(data.timeframe, data);
      
      // Update chart if this is the current timeframe
      if (data.timeframe === this.currentTimeframe) {
        this.updateChart();
        // Also update overlays when chart data changes
        this.updateOverlaysForTimeframe();
      }
    }
    
    // Handle multi-timeframe analysis data (if backend sends full candles for other TFs)
    if (data.type === 'analysis' && data.timeframes) {
      Object.entries(data.timeframes).forEach(([tf, tfData]) => {
        if (tfData.candles && tfData.candles.length > 0) {
          this.updateTimeframeFromCandles(tf, tfData.candles);
        }
      });
    }
  }
  
  /**
   * Update data for a specific timeframe from a single candle update.
   * @param {string} timeframe - Timeframe identifier
   * @param {Object} data - Candle data (e.g., { timestamp, price, volume })
   */
  updateTimeframeData(timeframe, data) {
    if (!this.timeframeData[timeframe]) {
      // If timeframe not initialized, add it dynamically
      this.timeframeData[timeframe] = { labels: [], prices: [], volumes: [], lastUpdate: 0 };
    }
    
    const tfData = this.timeframeData[timeframe];
    const timestamp = new Date(data.timestamp);
    const timeLabel = this.formatTimeLabel(timestamp, timeframe);
    
    // Add new data point
    tfData.labels.push(timeLabel);
    tfData.prices.push(data.price || data.close); // Use price or close
    tfData.volumes.push(data.volume || 0);
    tfData.lastUpdate = Date.now();
    
    // Limit data points for performance
    if (tfData.labels.length > this.maxDataPoints) {
      tfData.labels.shift();
      tfData.prices.shift();
      tfData.volumes.shift();
    }
  }
  
  /**
   * Update timeframe data from an array of candles (e.g., from a snapshot).
   * @param {string} timeframe - Timeframe identifier
   * @param {Array} candles - Array of candle data
   */
  updateTimeframeFromCandles(timeframe, candles) {
    if (!this.timeframeData[timeframe]) {
      // If timeframe not initialized, add it dynamically
      this.timeframeData[timeframe] = { labels: [], prices: [], volumes: [], lastUpdate: 0 };
    }

    const tfData = this.timeframeData[timeframe];
    
    // Clear existing data before loading new set
    tfData.labels = [];
    tfData.prices = [];
    tfData.volumes = [];
    
    // Process candles (limit to recent data for performance)
    const recentCandles = candles.slice(-this.maxDataPoints);
    
    recentCandles.forEach(candle => {
      const timestamp = new Date(candle.timestamp);
      const timeLabel = this.formatTimeLabel(timestamp, timeframe);
      
      tfData.labels.push(timeLabel);
      tfData.prices.push(candle.close);
      tfData.volumes.push(candle.volume || 0);
    });
    
    tfData.lastUpdate = Date.now();
  }
  
  /**
   * Format time label based on timeframe.
   * @param {Date} timestamp - Timestamp to format.
   * @param {string} timeframe - Current timeframe.
   * @returns {string} Formatted label.
   */
  formatTimeLabel(timestamp, timeframe) {
    const options = { hour12: false };
    
    switch (timeframe) {
      case '1m':
      case '5m':
      case '15m':
      case '30m':
        return timestamp.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        });
      
      case '1h':
      case '4h':
        return timestamp.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          hour12: false 
        });
      
      case '1d':
        return timestamp.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      
      default:
        return timestamp.toLocaleTimeString('en-US', options);
    }
  }
  
  /**
   * Switches the currently displayed timeframe on the chart.
   * @param {string} newTimeframe - Target timeframe.
   */
  switchTimeframe(newTimeframe) {
    if (!this.availableTimeframes.includes(newTimeframe)) {
      console.warn(`Invalid timeframe: ${newTimeframe}`);
      return;
    }
    
    if (newTimeframe === this.currentTimeframe) return;
    
    console.log(`📊 Switching timeframe: ${this.currentTimeframe} → ${newTimeframe}`);
    
    // Update current timeframe
    this.currentTimeframe = newTimeframe;
    
    // Update UI buttons
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.timeframe === newTimeframe);
    });
    
    // Update chart with new timeframe data
    this.updateChart();
    
    // Trigger sparkle effect on button if the function is loaded
    if (window.OGZP && window.OGZP.triggerSparkleEffect) {
      const activeBtn = document.querySelector(`.timeframe-btn[data-timeframe="${newTimeframe}"]`);
      if (activeBtn) {
        window.OGZP.triggerSparkleEffect(activeBtn, 'timeframe');
      }
    }
    
    // Broadcast timeframe change (for backend to potentially send more data)
    this.broadcastTimeframeChange(newTimeframe);
  }
  
  /**
   * Updates the Chart.js instance with data from the current timeframe.
   */
  updateChart() {
    if (!this.chart) return;
    
    const tfData = this.timeframeData[this.currentTimeframe];
    if (!tfData || !tfData.labels.length) return;
    
    // Update chart data
    this.chart.data.labels = [...tfData.labels];
    this.chart.data.datasets[0].data = [...tfData.prices];
    
    // Add volume dataset if available (assuming it's the second dataset for simplicity)
    // You might need more sophisticated handling if datasets change dynamically
    // if (tfData.volumes.length > 0 && this.chart.data.datasets.length > 1) {
    //   this.chart.data.datasets[1].data = [...tfData.volumes];
    // }
    
    // Update chart title (if title plugin is configured)
    if (this.chart.options.plugins && this.chart.options.plugins.title) {
      this.chart.options.plugins.title.text = `Price Chart - ${this.currentTimeframe.toUpperCase()}`;
    }
    
    // Update chart smoothly (or 'none' for instant update)
    this.chart.update('none');

    // After updating the chart, re-draw overlays for the new timeframe
    this.updateOverlaysForTimeframe();
  }
  
  /**
   * Gets data for the currently active timeframe.
   * @returns {Object} Current timeframe data.
   */
  getCurrentTimeframeData() {
    return {
      timeframe: this.currentTimeframe,
      data: this.timeframeData[this.currentTimeframe],
      lastUpdate: this.timeframeData[this.currentTimeframe].lastUpdate
    };
  }
  
  /**
   * Gets data freshness status for all timeframes.
   * @returns {Object} Freshness status.
   */
  getDataFreshness() {
    const now = Date.now();
    const freshness = {};
    
    this.availableTimeframes.forEach(tf => {
      const data = this.timeframeData[tf];
      const age = now - data.lastUpdate;
      
      freshness[tf] = {
        lastUpdate: data.lastUpdate,
        ageMinutes: Math.floor(age / 60000),
        fresh: age < 300000, // Fresh if updated within 5 minutes
        dataPoints: data.labels.length
      };
    });
    
    return freshness;
  }
  
  /**
   * Broadcasts timeframe change to other components (e.g., backend via WebSocket).
   * @param {string} newTimeframe - New timeframe.
   */
  broadcastTimeframeChange(newTimeframe) {
    // Custom event for other frontend components to react
    const event = new CustomEvent('timeframeChanged', {
      detail: {
        timeframe: newTimeframe,
        data: this.timeframeData[newTimeframe]
      }
    });
    document.dispatchEvent(event);
    
    // Update indicators overlay with timeframe info
    const indicatorsContainer = document.getElementById('indicators-container');
    if (indicatorsContainer) {
      let tfDisplay = indicatorsContainer.querySelector('.timeframe-display');
      if (!tfDisplay) {
        tfDisplay = document.createElement('div');
        tfDisplay.className = 'timeframe-display';
        indicatorsContainer.insertBefore(tfDisplay, indicatorsContainer.firstChild);
      }
      tfDisplay.textContent = `Timeframe: ${newTimeframe.toUpperCase()}`;
    }

    // If there's a GUI WebSocket, send a message to the backend to switch timeframe
    // This assumes the backend has a way to receive and process this command
    if (window.guiSocket && window.guiSocket.readyState === WebSocket.OPEN) {
      window.guiSocket.send(JSON.stringify({
        action: 'switch_timeframe',
        timeframe: newTimeframe
      }));
      console.log(`[GUI] Sent timeframe switch command to backend: ${newTimeframe}`);
    }
  }
  
  /**
   * Gets trading context for the current timeframe.
   * @returns {Object} Trading context.
   */
  getTradingContext() {
    const currentData = this.timeframeData[this.currentTimeframe];
    
    if (!currentData.prices.length) {
      return { available: false };
    }
    
    const prices = currentData.prices;
    const latest = prices[prices.length - 1];
    const previous = prices.length > 1 ? prices[prices.length - 2] : latest;
    
    return {
      available: true,
      timeframe: this.currentTimeframe,
      currentPrice: latest,
      previousPrice: previous,
      change: latest - previous,
      changePercent: ((latest - previous) / previous * 100).toFixed(2),
      trend: latest > previous ? 'up' : latest < previous ? 'down' : 'flat',
      dataAge: Date.now() - currentData.lastUpdate
    };
  }
  
  /**
   * Updates chart overlays (Fibonacci, Support/Resistance, Trend Lines) based on the current timeframe.
   */
  updateOverlaysForTimeframe() {
    if (!this.chart || !window.OGZP) return; // Ensure chart and OGZP global object exist
    
    const currentData = this.timeframeData[this.currentTimeframe];
    if (!currentData || !currentData.prices || currentData.prices.length === 0) return;
    
    // Clear existing overlays before drawing new ones
    this.chart.data.datasets = this.chart.data.datasets.filter(ds => 
      !ds.label?.startsWith("Fib") && 
      !ds.label?.startsWith("Support") && 
      !ds.label?.startsWith("Resistance") &&
      !ds.label?.startsWith("Trend Line")
    );

    // Apply overlays based on current timeframe
    switch (this.currentTimeframe) {
      case '1m':
      case '5m':
        // Short-term: Focus on support/resistance
        if (window.OGZP.drawSupportResistance) {
          window.OGZP.drawSupportResistance(this.chart);
        }
        break;
        
      case '15m':
      case '30m':
      case '1h':
        // Medium-term: Add Fibonacci levels
        if (window.OGZP.drawFibonacciLevels && currentData.prices.length > 20) {
          const high = Math.max(...currentData.prices);
          const low = Math.min(...currentData.prices);
          window.OGZP.drawFibonacciLevels(this.chart, high, low);
        }
        break;
        
      case '4h':
      case '1d':
        // Long-term: Trend lines and major levels
        if (window.OGZP.drawTrendLine && currentData.prices.length > 10) {
          const direction = this.getTradingContext().trend === 'up' ? 'up' : 'down';
          window.OGZP.drawTrendLine(this.chart, direction);
        }
        break;
    }
    this.chart.update(); // Update chart to show new overlays
  }
}

// Export the class for ES6 module loading
export { FrontendTimeframeManager };

// Auto-initialize when chart is ready (handled by complete-integration.js now via ogzprime-ready event)
// The event listener for 'wsMessage' is also handled in final-dashboard.js which is fine,
// or it could be moved here if TimeframeManager wants to directly consume it.