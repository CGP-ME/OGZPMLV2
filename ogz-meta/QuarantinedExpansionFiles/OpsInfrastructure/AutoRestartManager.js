/**
 * Auto-restart manager for OGZ Prime trading bot process recovery
 * Handles crashes, exceptions, and automatic process restarts
 */

// AutoRestartManager.js
// 📁 FILE: core/AutoRestartManager.js
const { spawn } = require('child_process');

/**
 * Manages automatic restart functionality for crash recovery
 */
class AutoRestartManager {
  /**
   * Initialize restart manager with default configuration
   */
  constructor() {
    // Track number of restart attempts for safety limits
    this.restartAttempts = 0;
    
    // Maximum number of restarts before requiring manual intervention
    this.maxRestarts = 5;
    
    // Delay between restart attempts (5 seconds)
    this.restartDelay = 5000;
  }
  
  /**
   * Set up process event handlers for crash detection and recovery
   */
  setupCrashHandler() {
    // Handle uncaught exceptions (synchronous errors)
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      this.handleCrash(error, 'exception');
    });
    
    // Handle unhandled promise rejections (async errors)
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection:', reason);
      this.handleCrash(reason, 'rejection');
    });
    
    // Handle graceful shutdown signal
    process.on('SIGTERM', () => {
      console.log('📛 SIGTERM received');
      this.gracefulShutdown();
    });
  }
  
  /**
   * Handle process crashes with restart logic and safety limits
   * @param {Error} error - The error that caused the crash
   * @param {string} type - Type of crash ('exception' or 'rejection')
   */
  handleCrash(error, type) {
    // Save crash information for debugging
    this.saveCrashDump(error, type);
    
    // Check if restart attempts are within safety limit
    if (this.restartAttempts < this.maxRestarts) {
      console.log(`🔄 Attempting restart ${this.restartAttempts + 1}/${this.maxRestarts}...`);
      this.restart();
    } else {
      // Prevent infinite restart loops
      console.error('❌ Max restart attempts reached. Manual intervention required.');
      this.notifyEmergency(error);
    }
  }
  
  /**
   * Execute process restart by spawning new instance
   */
  restart() {
    // Increment restart attempt counter
    this.restartAttempts++;
    
    // Delay restart to prevent rapid cycling
    setTimeout(() => {
      // Spawn new process with same arguments
      const child = spawn(process.argv[0], process.argv.slice(1), {
        detached: true,    // Run independently of parent
        stdio: 'inherit'   // Inherit stdio streams
      });
      
      // Detach child process from parent
      child.unref();
      
      // Exit current process
      process.exit(0);
    }, this.restartDelay);
  }
  
  /**
   * Save crash dump data for debugging and analysis
   * @param {Error} error - The error that caused the crash
   * @param {string} type - Type of crash event
   */
  saveCrashDump(error, type) {
    // Compile comprehensive crash information
    const dump = {
      timestamp: new Date().toISOString(),
      type,
      error: {
        message: error.message,
        stack: error.stack
      },
      memory: process.memoryUsage(),           // Memory usage at crash
      uptime: process.uptime(),               // Process uptime before crash
      restartAttempts: this.restartAttempts   // Current restart attempt count
    };
    
    // Write crash dump to file system for analysis
    fs.writeFileSync(
      `crashes/crash_${Date.now()}.json`,
      JSON.stringify(dump, null, 2)
    );
  }
}