// 📁 FILE: core/CPUOptimizer.js

/**
 * CPUOptimizer - Dynamically adjusts processing intensity based on trading activity
 * Reduces CPU usage during idle periods while maintaining full performance during active trading
 */
class CPUOptimizer {
  /**
   * Initialize CPU optimizer with trading bot instance
   * @param {Object} ogzPrime - Main trading bot instance for activity monitoring
   */
  constructor(ogzPrime) {
    // Reference to main trading bot for activity coordination
    this.ogzPrime = ogzPrime;
    
    // Current throttle multiplier (1 = full speed, higher = more throttled)
    this.throttleLevel = 1;
    
    // Timestamp of last recorded trading activity
    this.lastActivity = Date.now();
  }
  
  /**
   * Calculate optimal throttle level based on time since last activity
   * Implements progressive throttling: more idle time = more CPU savings
   * @returns {number} Current throttle level multiplier
   */
  optimizeForActivity() {
    const timeSinceActivity = Date.now() - this.lastActivity;
    
    // Progressive throttling based on inactivity duration
    if (timeSinceActivity < 60000) {
      this.throttleLevel = 1; // Full speed - active trading (< 1 minute idle)
    } else if (timeSinceActivity < 300000) {
      this.throttleLevel = 2; // Half speed - moderate idle (< 5 minutes idle)
    } else if (timeSinceActivity < 900000) {
      this.throttleLevel = 4; // Quarter speed - extended idle (< 15 minutes idle)
    } else {
      this.throttleLevel = 10; // Minimal processing - deep idle (> 15 minutes idle)
    }
    
    return this.throttleLevel;
  }
  
  /**
   * Determine if current tick should be processed based on throttle level
   * Uses modulo operation to skip ticks during throttled periods
   * @param {number} tickCount - Current tick counter for processing decision
   * @returns {boolean} True if this tick should be processed
   */
  shouldProcess(tickCount) {
    // Process every Nth tick where N = throttleLevel (1 = every tick, 10 = every 10th tick)
    return tickCount % this.throttleLevel === 0;
  }
  
  /**
   * Record new trading activity and reset throttling to full speed
   * Called when trades, analysis, or user interactions occur
   */
  recordActivity() {
    // Update activity timestamp for throttle calculation
    this.lastActivity = Date.now();
    
    // Reset to full speed processing for immediate responsiveness
    this.throttleLevel = 1;
  }
}