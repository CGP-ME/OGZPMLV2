/**
 * OGZ Prime Valhalla Edition - Complete Integration Script
 * * This script connects all frontend components with the backend trading system,
 * configures FX features, and enables modules to interact with each other.
 * * CRITICAL: This script is loaded as an ES6 module in valhalla-dashboard.html (type="module").
 * All other modules imported here MUST also be valid ES6 modules.
 */

// ====================== CONFIGURATION LOADER ======================

/**
 * Loads the OGZ_CONFIG from ./ogz-core-config.js.
 * Provides default values if the config file is not found.
 * @returns {Promise<Object>} A promise that resolves with the configuration object.
 */
async function loadConfig() {
  try {
    // Dynamically import the config file as a classic script to get its global var
    await new Promise((resolve, reject) => {
      const configScript = document.createElement('script');
      configScript.src = './ogz-core-config.js';
      configScript.onload = resolve;
      configScript.onerror = reject;
      document.head.appendChild(configScript);
    });

    const loadedConfig = window.OGZ_CONFIG || { fxEnabled: true, commentaryMode: "sassy" };
    console.log('✅ OGZ Configuration loaded');
    console.log(`   > FX Enabled: ${loadedConfig.fxEnabled ? 'YES' : 'NO'}`);
    console.log(`   > Commentary Mode: ${loadedConfig.commentaryMode}`);
    return loadedConfig;
  } catch (error) {
    console.warn('⚠️ Configuration file not found or failed to load, using defaults:', error);
    const defaultConfig = { fxEnabled: true, commentaryMode: "sassy" };
    // Guard against double assignment
    if (!window.OGZ_CONFIG) {
      window.OGZ_CONFIG = defaultConfig; 
    }
    return window.OGZ_CONFIG;
  }
}

// ====================== MODULE LOADER FUNCTIONS (Classic Scripts) ======================

/**
 * Loads a classic JavaScript script that sets up global variables/functions.
 * @param {string} src - The path to the script file.
 * @returns {Promise<boolean>} A promise that resolves to true if loaded, false otherwise.
 */
async function loadClassicScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn(`⚠️ Failed to load classic script: ${src}`);
      resolve(false); // Resolve false on error, don't break the chain
    };
    document.head.appendChild(script);
  });
}

/**
 * Loads the FX engine script if enabled in the configuration.
 * @param {Object} config - The OGZ configuration object.
 * @returns {Promise<boolean>} A promise that resolves to true if loaded, false otherwise.
 */
async function loadFX(config) {
  if (!config.fxEnabled) {
    console.log('ℹ️ FX Engine disabled in config');
    return false;
  }
  const success = await loadClassicScript('./ogz-fx-engine.js');
  if (success) {
    console.log('✨ FX Engine activated');
    document.body.classList.add('ogzp-fx-enabled');
  } else {
    console.warn('⚠️ FX Engine failed to load');
  }
  return success;
}

/**
 * Loads the commentary system script if enabled in the configuration.
 * @param {Object} config - The OGZ configuration object.
 * @returns {Promise<boolean>} A promise that resolves to true if loaded, false otherwise.
 */
async function loadCommentary(config) {
  if (!config.commentaryMode) {
    console.log('ℹ️ Commentary System disabled in config');
    return false;
  }
  const success = await loadClassicScript('./ogzp-core-mind.js');
  if (success) {
    console.log(`💬 Commentary System activated in ${config.commentaryMode} mode`);
    if (typeof window.ogzpSay === 'function') {
      setTimeout(() => {
        window.ogzpSay('OGZ Prime Valhalla Edition online. Ready to conquer the markets.');
      }, 1500);
    }
  } else {
    console.warn('⚠️ Commentary System failed to load');
  }
  return success;
}

// ====================== ES6 INDICATOR MODULES LOADER ======================

/**
 * Dynamically imports all required indicator modules (ES6 Modules) and makes their functions
 * globally accessible by assigning them to `window.OGZP`.
 * @returns {Promise<Object>} A promise that resolves with an object containing the loaded modules' status.
 */
async function loadIndicatorModules() {
  window.OGZP = window.OGZP || {}; // Ensure OGZP object exists for module exports

  try {
    const modules = await Promise.allSettled([ // Use allSettled to ensure all promises run, even if one fails
      import('./modules/fibOverlay.js'),
      import('./modules/goalTracker.js'),
      import('./modules/leaderboardUploader.js'),
      import('./modules/sparkleEffects.js'),
      import('./modules/stochasticOverlay.js'),
      import('./modules/supportResistance.js'),
      import('./modules/trendLines.js'),
      import('./TimeframeManager.js') // Frontend TimeframeManager // Frontend TimeframeManager
    ]);

    let loadedStatus = {};
    modules.forEach((result, index) => {
      // Map index to module name for logging and specific assignments
      const moduleNames = [
        'fibOverlay', 'goalTracker', 'leaderboardUploader', 'sparkleEffects',
        'stochasticOverlay', 'supportResistance', 'trendLines', 'frontendTimeframeManager'
      ];
      const moduleName = moduleNames[index];

      if (result.status === 'fulfilled') {
        console.log(`✅ Loaded module: ${moduleName}`);
        // Assign exports from the module to window.OGZP
        // This is key for ES6 modules to be globally usable by other classic scripts or onclicks
        Object.assign(window.OGZP, result.value);
        loadedStatus[moduleName] = true;
      } else {
        console.warn(`⚠️ Failed to load module: ${moduleName}. Reason:`, result.reason);
        loadedStatus[moduleName] = false;
      }
    });

    console.log('🧩 All indicator modules loading attempt completed.');
    return loadedStatus;

  } catch (error) {
    console.error('❌ Critical error during ES6 module loading:', error);
    return {};
  }
}

// ====================== DASHBOARD LOADER ======================

/**
 * Loads the main dashboard script.
 * @returns {Promise<boolean>} A promise that resolves to true if loaded, false otherwise.
 */
async function loadDashboard() {
  const success = await loadClassicScript('./final-dashboard.js');
  if (success) {
    console.log('📊 Dashboard loaded successfully');
  } else {
    console.error('❌ Dashboard failed to load');
  }
  return success;
}

// ====================== GLOBAL HELPER FUNCTIONS (Aliasing to OGZP) ======================

/**
 * Sets up global helper functions on the window object, aliasing them to functions
 * exposed via `window.OGZP` after ES6 modules are loaded.
 * This function should be called very early in the initialization.
 */
function setupGlobalHelpers() {
  window.OGZP = window.OGZP || {}; // Ensure window.OGZP exists as a container

  // Alias for showNotification (used by stochasticOverlay.js)
  window.showNotification = function(message, type = 'info') {
    if (window.OGZP.showPopup && typeof window.OGZP.showPopup === 'function') {
      window.OGZP.showPopup(message, type);
    } else {
      console.warn(`Notification: ${message} (type: ${type}) - OGZP.showPopup not available yet.`);
    }
  };

  // Alias for animateGlow (used by goalTracker.js)
  window.animateGlow = function(elementId, color) {
    if (window.OGZP.animateGlowEffect && typeof window.OGZP.animateGlowEffect === 'function') {
      window.OGZP.animateGlowEffect(elementId, color);
    } else {
      console.warn(`Animate glow for ${elementId} not available.`);
    }
  };

  // Generic sparkle trigger
  window.triggerSparkle = function(element, type = 'default') {
    if (window.OGZP.triggerSparkleEffect && typeof window.OGZP.triggerSparkleEffect === 'function') {
      window.OGZP.triggerSparkleEffect(element, type);
    } else if (element) {
      element.classList.add('pulse-effect'); // Fallback CSS animation
      setTimeout(() => element.classList.remove('pulse-effect'), 1000);
    }
  };

  // Generic sparkle explosion trigger
  window.triggerSparkleExplosion = function() {
    if (window.OGZP.triggerSparkleExplosion && typeof window.OGZP.triggerSparkleExplosion === 'function') {
      window.OGZP.triggerSparkleExplosion();
    } else {
      console.warn('Sparkle explosion module not loaded, using basic fallback.');
      const colors = ['#00ff00', '#ffd700', '#ff69b4', '#00bfff', '#ff00ff'];
      for (let i = 0; i < 5; i++) { 
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle-burst'; 
        sparkle.style.position = 'absolute';
        sparkle.style.width = '15px'; sparkle.style.height = '15px'; sparkle.style.borderRadius = '50%';
        sparkle.style.background = colors[Math.floor(Math.random() * colors.length)];
        sparkle.style.left = Math.random() * 100 + '%'; sparkle.style.top = Math.random() * 100 + '%';
        sparkle.style.opacity = 1;
        sparkle.style.animation = 'sparkleFade 0.8s ease-out forwards'; // Assuming sparkleFade is in valhalla-style.css
        document.body.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 800);
      }
    }
  };
  
  // Update goals helper
  window.updateGoals = function(pnl, wasWin) {
    if (window.OGZP.goalTracker && typeof window.OGZP.goalTracker.updateTrade === 'function') {
      window.OGZP.goalTracker.updateTrade(pnl, wasWin);
    } else {
      console.warn('Goal tracker not ready or updateTrade not found.');
    }
  };
  
  // Update chart overlays helper (used by FrontendTimeframeManager)
  window.updateChartOverlays = function(chart) {
    if (window.OGZP.FrontendTimeframeManager && window.frontendTfManager && typeof window.frontendTfManager.updateOverlaysForTimeframe === 'function') {
        window.frontendTfManager.updateOverlaysForTimeframe(chart);
    } else {
        console.warn('Frontend Timeframe Manager not ready for overlay updates.');
    }
  };

  // Placeholder for manualBuy, manualSell, killBot until final-dashboard.js loads
  window.manualBuy = (...args) => console.warn('manualBuy called before loaded:', args);
  window.manualSell = (...args) => console.warn('manualSell called before loaded:', args);
  window.killBot = (...args) => console.warn('killBot called before loaded:', args);
  window.closePopup = (...args) => console.warn('closePopup called before loaded:', args);
}

// ====================== MAIN INITIALIZATION SEQUENCE ======================

/**
 * Main initialization function for OGZ Prime Valhalla Edition frontend.
 * Orchestrates the loading of all necessary scripts and modules.
 */
async function initOGZPrime() {
  // Prevent double initialization during bootstorm
  if (window.OGZ_PRIME_INITIALIZED) {
    console.log('🔰 OGZ Prime already initialized, skipping duplicate initialization');
    return;
  }
  
  // Respect bootstorm sequence - don't auto-init if bootstorm is controlling the flow
  if (window.OGZ_BOOTSTORM_ACTIVE) {
    console.log('🔰 OGZ Bootstorm active - initialization will be handled by bootstorm sequence');
    return;
  }
  
  window.OGZ_PRIME_INITIALIZED = true;
  console.log('🔰 OGZ Prime Valhalla Edition - Initialization Starting');
  
  // Setup global helpers very early
  setupGlobalHelpers();
  
  try {
    const config = await loadConfig(); // Load config first
    await Promise.all([loadFX(config), loadCommentary(config)]); // Load classic scripts in parallel
    const modulesStatus = await loadIndicatorModules(); // Load ES6 modules
    const dashboardLoaded = await loadDashboard(); // Load final-dashboard.js (classic script)

    console.log('✅ OGZ Prime Valhalla Edition initialization complete');
    console.log('System status:', { config, modulesLoaded: modulesStatus, dashboardLoaded });
    
    // Dispatch a custom event when everything is loaded
    document.dispatchEvent(new CustomEvent('ogzprime-ready', { detail: { config, modulesStatus, dashboardLoaded } }));
    
    if (dashboardLoaded) {
      window.showNotification('OGZ Prime Valhalla Edition Ready!', 'success'); // Use showNotification here
      document.body.classList.add('ogzp-loaded');
      if (config.fxEnabled) {
        document.body.classList.add('ogzp-fx-enabled');
      }
    } else {
      window.showNotification('OGZ Prime initialization completed with errors', 'warning');
    }
  } catch (error) {
    console.error('❌ Fatal error during OGZ Prime initialization:', error);
    window.showNotification('System initialization failed!', 'error');
  }
}

// Run initialization when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOGZPrime);
} else {
  initOGZPrime();
}

// ====================== CRITICAL CSS STYLES (Inline) ======================

// These styles are crucial for popups and loading effects.
// They are added directly here for guaranteed availability.
const criticalStyles = document.createElement('style');
criticalStyles.textContent = `
  .ogzp-loaded {
    transition: background-color 0.5s ease, box-shadow 0.5s ease;
  }
  
  .ogzp-fx-enabled {
    box-shadow: inset 0 0 100px rgba(157, 113, 199, 0.3);
  }
  
  .pulse-effect {
    animation: pulse 0.8s ease-out;
  }
  
  .ogz-popup {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    background-color: #333;
    color: white;
    font-family: 'Maven Pro', sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 9999;
    opacity: 1;
    transition: opacity 0.5s ease;
  }
  
  .ogz-popup.success {
    background-color: #00aa88;
  }
  
  .ogz-popup.error {
    background-color: #ff3333;
  }
  
  .ogz-popup.warning {
    background-color: #ff9900;
  }
  
  .ogz-popup.fade-out {
    opacity: 0;
  }
  
  @keyframes pulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
  }
`;
document.head.appendChild(criticalStyles);
