// OGZ Prime Module Integrator - FIXED ES6 MODULE LOADING

// Initialize module loading sequence when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  
  // Sequential loading chain to ensure proper dependency order
  // 1. Load configuration first
  loadScript('./ogz-core-config.js')
    .then(() => {
      // Log configuration status for debugging
      console.log("✅ Config loaded - FX:", window.OGZ_CONFIG.fxEnabled, "Commentary:", window.OGZ_CONFIG.commentaryMode);
      
      // 2. Load FX if enabled in configuration
      if (window.OGZ_CONFIG && window.OGZ_CONFIG.fxEnabled) {
        return loadScript('./ogz-fx-engine.js');
      }
      return Promise.resolve();
    })
    .then(() => {
      // 3. Load commentary if enabled in configuration
      if (window.OGZ_CONFIG && window.OGZ_CONFIG.commentaryMode) {
        return loadScript('./ogzp-core-mind.js');
      }
      return Promise.resolve();
    })
    .then(() => {
      // 4. Load all the indicator modules AS ES6 MODULES
      return loadModules();
    })
    .then(() => {
      // 5. Finally load the main dashboard after all dependencies ready
      return loadScript('./final-dashboard.js');
    })
    .catch((error) => {
      console.error("Failed to load modules:", error);
    });
});

/**
 * Loads regular JavaScript files by creating script elements
 * @param {string} src - Path to the JavaScript file
 * @returns {Promise} Resolves when script loads, rejects on error
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Loads ES6 modules by creating script elements with type="module"
 * @param {string} src - Path to the ES6 module file
 * @returns {Promise} Resolves when module loads, rejects on error
 */
function loadModule(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.type = 'module'; // This is the key!
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Loads all ES6 indicator modules using dynamic imports and creates global references
 * Uses Promise.all for parallel loading of all modules
 */
async function loadModules() {
  try {
    // Import all modules using dynamic imports for ES6 compatibility
    const [
      fibModule,
      goalModule,
      leaderboardModule,
      sparkleModule,
      stochasticModule,
      srModule,
      trendModule
    ] = await Promise.all([
      import('./modules/fibOverlay.js'),
      import('./modules/goalTracker.js'),
      import('./modules/leaderboardUploader.js'),
      import('./modules/sparkleEffects.js'),
      import('./modules/stochasticOverlay.js'),
      import('./modules/supportResistance.js'),
      import('./modules/trendLines.js')
    ]);
    
    // Make functions globally available for legacy compatibility
    // Check for named exports first, fallback to default exports
    window.drawFibonacciLevels = fibModule.drawFibonacciLevels || fibModule.default;
    window.goalTracker = goalModule.goalTracker || goalModule.default;
    window.uploadLeaderboardStats = leaderboardModule.uploadLeaderboardStats || leaderboardModule.default;
    window.triggerSparkleEffect = sparkleModule.triggerSparkleEffect || sparkleModule.default;
    window.updateStochasticDisplay = stochasticModule.updateStochasticDisplay || stochasticModule.default;
    window.drawSupportResistance = srModule.drawSupportResistance || srModule.default;
    window.drawTrendLine = trendModule.drawTrendLine || trendModule.default;
    
    // Create the global OGZP object as central namespace for all trading functions
    window.OGZP = {
      drawFibonacciLevels: window.drawFibonacciLevels,
      goalTracker: window.goalTracker,
      uploadLeaderboardStats: window.uploadLeaderboardStats,
      triggerSparkleEffect: window.triggerSparkleEffect,
      updateStochasticDisplay: window.updateStochasticDisplay,
      drawSupportResistance: window.drawSupportResistance,
      drawTrendLine: window.drawTrendLine,
      
      /**
       * Updates all chart indicators in sequence
       * @param {Object} chart - Chart.js chart instance
       */
      updateAllIndicators: function(chart) {
        // Validate chart object and required data structure
        if (!chart || !chart.data || !chart.data.datasets) return;
        
        // Draw support and resistance levels first
        if (window.drawSupportResistance) window.drawSupportResistance(chart);
        
        // Extract price data from first dataset
        const priceData = chart.data.datasets[0]?.data;
        if (!priceData) return;
        
        // Calculate and draw trend lines if sufficient data points
        if (priceData.length > 10 && window.drawTrendLine) {
          const firstFive = priceData.slice(0, 5);
          const lastFive = priceData.slice(-5);
          const firstAvg = firstFive.reduce((a, b) => a + b, 0) / firstFive.length;
          const lastAvg = lastFive.reduce((a, b) => a + b, 0) / lastFive.length;
          const direction = lastAvg > firstAvg ? 'up' : 'down';
          window.drawTrendLine(chart, direction);
        }
        
        // Calculate and draw Fibonacci levels based on price range
        if (priceData.length > 0 && window.drawFibonacciLevels) {
          const high = Math.max(...priceData);
          const low = Math.min(...priceData);
          window.drawFibonacciLevels(chart, high, low);
        }
      }
    };
    
    console.log('✅ All ES6 modules loaded successfully');
    
  } catch (error) {
    console.error('❌ Error loading ES6 modules:', error);
    // Fallback - load as regular scripts with exports removed
    console.log('Attempting fallback loading...');
  }
}

/**
 * Creates glow effect on specified element with optional color
 * @param {string} elementId - DOM element ID to animate
 * @param {string} color - CSS color value for glow effect
 */
window.animateGlow = function(elementId, color) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  // Add glow CSS class and custom color styling
  element.classList.add('glow-effect');
  if (color) {
    element.style.boxShadow = `0 0 10px ${color}, 0 0 20px ${color}`;
  }
  
  // Remove glow effect after 3 seconds
  setTimeout(() => {
    element.classList.remove('glow-effect');
    element.style.boxShadow = '';
  }, 3000);
};

/**
 * Displays popup notification with auto-dismiss
 * @param {string} message - Text message to display
 * @param {string} type - Popup type for styling (info, success, error, warning)
 */
window.showPopup = function(message, type = 'info') {
  // Create popup element with message and styling
  const popup = document.createElement('div');
  popup.className = `popup popup-${type}`;
  popup.textContent = message;
  document.body.appendChild(popup);
  
  // Auto-dismiss popup after 3 seconds with fade animation
  setTimeout(() => {
    popup.classList.add('fade-out');
    setTimeout(() => popup.remove(), 500);
  }, 3000);
};

/**
 * Creates celebratory sparkle burst effect across the screen
 * Generates 10 sparkle elements at random positions with staggered timing
 */
window.triggerSparkleExplosion = function() {
  // Create 10 sparkles with 100ms delays between each
  for (let i = 0; i < 10; i++) {
    setTimeout(() => {
      // Create sparkle element at random screen position
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle-burst';
      sparkle.style.left = Math.random() * window.innerWidth + 'px';
      sparkle.style.top = Math.random() * window.innerHeight + 'px';
      document.body.appendChild(sparkle);
      // Remove sparkle after 1 second animation
      setTimeout(() => sparkle.remove(), 1000);
    }, i * 100);
  }
};