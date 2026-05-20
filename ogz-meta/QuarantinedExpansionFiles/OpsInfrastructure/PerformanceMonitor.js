/**
 * Performance monitoring system for OGZ Prime trading bot operations
 * Tracks timing metrics and provides performance analysis
 */

// 📁 FILE: core/PerformanceMonitor.js

/**
 * Monitors and analyzes performance metrics for trading operations
 */
class PerformanceMonitor {
  /**
   * Initialize performance monitor with bot reference
   * @param {Object} ogzPrime - Reference to main OGZ Prime trading bot
   */
  constructor(ogzPrime) {
    // Store reference to main trading bot
    this.ogzPrime = ogzPrime;
    
    // Performance metrics storage for different operation types
    this.metrics = {
      tickProcessingTime: [],    // Time to process incoming price ticks
      analysisTime: [],          // Time for market analysis operations
      orderExecutionTime: [],    // Time to execute trading orders
      patternMatchTime: [],      // Time for pattern recognition
      wsLatency: []             // WebSocket communication latency
    };
  }
  
  /**
   * Measure execution time of an operation and store metrics
   * @param {string} operation - Type of operation being measured
   * @param {Function} fn - Function to execute and measure
   * @returns {*} Result from executing the measured function
   */
  measurePerformance(operation, fn) {
    // Start high-resolution timer
    const start = process.hrtime.bigint();
    
    // Execute the measured function
    const result = fn();
    
    // End timer and calculate duration
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert nanoseconds to milliseconds
    
    // Initialize metrics array if it doesn't exist
    if (!this.metrics[operation]) {
      this.metrics[operation] = [];
    }
    
    // Store measurement with timestamp and duration
    this.metrics[operation].push({
      timestamp: Date.now(),
      duration
    });
    
    // Maintain sliding window of last 1000 measurements for memory efficiency
    if (this.metrics[operation].length > 1000) {
      this.metrics[operation].shift();
    }
    
    // Alert if operation exceeds performance threshold
    if (duration > this.getThreshold(operation)) {
      console.warn(`⚠️ Slow ${operation}: ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }
  
  /**
   * Get performance threshold for specific operation type
   * @param {string} operation - Operation type to get threshold for
   * @returns {number} Threshold in milliseconds for alerting
   */
  getThreshold(operation) {
    // Performance thresholds for different operation types
    const thresholds = {
      tickProcessingTime: 10,    // Price tick processing should be fast
      analysisTime: 100,         // Market analysis can take longer
      orderExecutionTime: 50,    // Order execution should be responsive
      patternMatchTime: 20,      // Pattern matching should be quick
      wsLatency: 100            // WebSocket latency threshold
    };
    
    // Return specific threshold or default 50ms
    return thresholds[operation] || 50;
  }
  
  /**
   * Generate comprehensive performance statistics report
   * @returns {Object} Performance report with statistics for each operation type
   */
  getPerformanceReport() {
    const report = {};
    
    // Calculate statistics for each operation type
    Object.entries(this.metrics).forEach(([operation, measurements]) => {
      // Skip operations with no measurements
      if (measurements.length === 0) return;
      
      // Extract duration values and sort for percentile calculations
      const durations = measurements.map(m => m.duration);
      const sorted = durations.sort((a, b) => a - b);
      
      // Calculate comprehensive performance statistics
      report[operation] = {
        avg: durations.reduce((a, b) => a + b, 0) / durations.length,  // Average duration
        min: sorted[0],                                                // Minimum duration
        max: sorted[sorted.length - 1],                               // Maximum duration
        p50: sorted[Math.floor(sorted.length * 0.5)],                // 50th percentile (median)
        p95: sorted[Math.floor(sorted.length * 0.95)],               // 95th percentile
        p99: sorted[Math.floor(sorted.length * 0.99)],               // 99th percentile
        samples: durations.length                                     // Number of samples
      };
    });
    
    return report;
  }
}