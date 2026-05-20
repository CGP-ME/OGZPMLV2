/**
 * Comprehensive system health monitoring for OGZ Prime trading bot
 * Monitors CPU, memory, disk, network, and provides automated recovery
 */

// 📊 FILE 3: deployment/SystemHealthMonitor.js
// Your 24/7 guardian - keeps OGZ Prime healthy!

const os = require('os');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * System health monitor with automated recovery and alerting
 */
class SystemHealthMonitor extends EventEmitter {
  /**
   * Initialize system health monitor with comprehensive configuration
   * @param {Object} ogzPrime - Reference to main OGZ Prime trading bot
   * @param {Object} config - Health monitoring configuration options
   */
  constructor(ogzPrime, config = {}) {
    super();
    
    // Store reference to main trading bot
    this.ogzPrime = ogzPrime;
    
    // Comprehensive monitoring configuration
    this.config = {
      // Monitoring check intervals
      cpuCheckInterval: 5000,        // CPU check every 5 seconds
      memoryCheckInterval: 10000,    // Memory check every 10 seconds
      diskCheckInterval: 60000,      // Disk check every 1 minute
      networkCheckInterval: 30000,   // Network check every 30 seconds
      
      // Health thresholds for alerting
      cpuWarningThreshold: 70,       // 70% CPU usage warning
      cpuCriticalThreshold: 90,      // 90% CPU usage critical
      memoryWarningThreshold: 80,    // 80% memory usage warning
      memoryCriticalThreshold: 95,   // 95% memory usage critical
      diskWarningThreshold: 85,      // 85% disk usage warning
      diskCriticalThreshold: 95,     // 95% disk usage critical
      
      // Automated recovery actions
      autoRestartOnCritical: true,
      throttleOnHighCPU: true,
      cleanupOnHighDisk: true,
      
      // Logging configuration
      logPath: path.join(process.cwd(), 'logs', 'health'),
      retainDays: 7,
      
      // Merge user-provided configuration
      ...config
    };
    
    // Current health state tracking
    this.health = {
      cpu: { usage: 0, status: 'healthy' },
      memory: { usage: 0, status: 'healthy', available: 0 },
      disk: { usage: 0, status: 'healthy', available: 0 },
      network: { latency: 0, status: 'healthy' },
      system: { uptime: 0, status: 'healthy' },
      
      alerts: [],
      metrics: {
        tradesPerHour: 0,
        errorsPerHour: 0,
        restarts: 0
      }
    };
    
    // Active monitoring interval references
    this.monitors = {};
    
    // Performance history with sliding windows
    this.history = {
      cpu: [],      // CPU usage history
      memory: [],   // Memory usage history
      errors: []    // Error occurrence history
    };
    
    // Ensure log directory exists for health logging
    if (!fs.existsSync(this.config.logPath)) {
      fs.mkdirSync(this.config.logPath, { recursive: true });
    }
    
    console.log('🏥 System Health Monitor initialized - Guardian Angel Active!');
  }
  
  /**
   * Start all health monitoring intervals
   * Start all monitoring
   * @returns {boolean} Success status of monitor startup
   */
  start() {
    console.log('🏥 Starting health monitoring...');
    
    // Start CPU usage monitoring
    this.monitors.cpu = setInterval(() => {
      this.checkCPU();
    }, this.config.cpuCheckInterval);
    
    // Start memory usage monitoring
    this.monitors.memory = setInterval(() => {
      this.checkMemory();
    }, this.config.memoryCheckInterval);
    
    // Start disk usage monitoring
    this.monitors.disk = setInterval(() => {
      this.checkDisk();
    }, this.config.diskCheckInterval);
    
    // Start network latency monitoring
    this.monitors.network = setInterval(() => {
      this.checkNetwork();
    }, this.config.networkCheckInterval);
    
    // Start system metrics collection
    this.monitors.metrics = setInterval(() => {
      this.updateMetrics();
    }, 60000); // Every minute
    
    // Start daily log cleanup
    this.monitors.cleanup = setInterval(() => {
      this.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000); // Daily
    
    // Perform initial comprehensive health check
    this.performFullHealthCheck();
    
    return true;
  }
  
  /**
   * Monitor CPU usage and detect performance issues
   * Check CPU usage
   */
  checkCPU() {
    // Get CPU information from OS
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    // Calculate total CPU time and idle time
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });
    
    // Calculate average idle and total time across all cores
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    // Update current CPU usage
    this.health.cpu.usage = usage;
    
    // Maintain sliding window of CPU history (1 hour at 5-second intervals)
    this.history.cpu.push({ time: Date.now(), usage });
    if (this.history.cpu.length > 720) {
      this.history.cpu.shift();
    }
    
    // Evaluate CPU usage against thresholds
    if (usage >= this.config.cpuCriticalThreshold) {
      this.health.cpu.status = 'critical';
      this.handleCritical('cpu', usage);
    } else if (usage >= this.config.cpuWarningThreshold) {
      this.health.cpu.status = 'warning';
      this.handleWarning('cpu', usage);
    } else {
      this.health.cpu.status = 'healthy';
    }
  }
  
  /**
   * Monitor memory usage and available memory
   * Check memory usage
   */
  checkMemory() {
    // Get system memory information
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usage = (usedMem / totalMem) * 100;
    
    // Update memory statistics
    this.health.memory.usage = usage;
    this.health.memory.available = Math.round(freeMem / 1024 / 1024); // Convert to MB
    
    // Maintain sliding window of memory history (1 hour at 10-second intervals)
    this.history.memory.push({ time: Date.now(), usage });
    if (this.history.memory.length > 360) {
      this.history.memory.shift();
    }
    
    // Evaluate memory usage against thresholds
    if (usage >= this.config.memoryCriticalThreshold) {
      this.health.memory.status = 'critical';
      this.handleCritical('memory', usage);
    } else if (usage >= this.config.memoryWarningThreshold) {
      this.health.memory.status = 'warning';
      this.handleWarning('memory', usage);
    } else {
      this.health.memory.status = 'healthy';
    }
  }
  
  /**
   * Monitor disk usage and available space
   * Check disk usage
   */
  checkDisk() {
    // Get disk usage information using system command
    const diskPath = process.cwd();
    
    require('child_process').exec('df -k ' + diskPath, (error, stdout) => {
      if (error) {
        console.error('Disk check error:', error);
        return;
      }
      
      // Parse disk usage output
      const lines = stdout.split('\n');
      const data = lines[1].split(/\s+/);
      const usage = parseInt(data[4]);
      
      // Update disk statistics
      this.health.disk.usage = usage;
      this.health.disk.available = Math.round(parseInt(data[3]) / 1024); // Convert to MB
      
      // Evaluate disk usage against thresholds
      if (usage >= this.config.diskCriticalThreshold) {
        this.health.disk.status = 'critical';
        this.handleCritical('disk', usage);
      } else if (usage >= this.config.diskWarningThreshold) {
        this.health.disk.status = 'warning';
        this.handleWarning('disk', usage);
        
        // Automatically clean up disk space if enabled
        if (this.config.cleanupOnHighDisk) {
          this.performDiskCleanup();
        }
      } else {
        this.health.disk.status = 'healthy';
      }
    });
  }
  
  /**
   * Monitor network latency and connectivity
   * Check network latency
   */
  checkNetwork() {
    // Test network latency using HTTPS request
    const start = Date.now();
    
    require('https').get('https://www.google.com', (res) => {
      const latency = Date.now() - start;
      this.health.network.latency = latency;
      
      // Evaluate network performance
      if (latency > 1000) {
        this.health.network.status = 'warning';
        this.handleWarning('network', latency);
      } else {
        this.health.network.status = 'healthy';
      }
    }).on('error', (err) => {
      // Handle network connectivity issues
      this.health.network.status = 'critical';
      this.handleCritical('network', 0);
    });
  }
  
  /**
   * Update trading and system metrics
   * Update system metrics
   */
  updateMetrics() {
    // Calculate metrics for the past hour
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    
    // Calculate trades per hour from trading history
    if (this.ogzPrime.tradingBrain) {
      const recentTrades = this.ogzPrime.tradingBrain.tradeHistory.filter(
        t => new Date(t.exitTime).getTime() > hourAgo
      );
      this.health.metrics.tradesPerHour = recentTrades.length;
    }
    
    // Calculate errors per hour from error history
    const recentErrors = this.history.errors.filter(e => e.time > hourAgo);
    this.health.metrics.errorsPerHour = recentErrors.length;
    
    // Update system uptime
    this.health.system.uptime = process.uptime();
    
    // Log current health metrics
    this.logHealthMetrics();
  }
  
  /**
   * Handle warning-level health conditions
   * Handle warning conditions
   * @param {string} component - Component triggering the warning
   * @param {number} value - Metric value that triggered the warning
   */
  handleWarning(component, value) {
    // Create warning alert object
    const alert = {
      level: 'warning',
      component,
      value,
      message: `${component} usage at ${value.toFixed(1)}%`,
      timestamp: new Date()
    };
    
    // Store alert and emit event
    this.health.alerts.push(alert);
    this.emit('warning', alert);
    
    // Log warning to file system
    this.logAlert(alert);
    
    // Send mobile notification if available
    if (this.ogzPrime.mobileMonitor) {
      this.ogzPrime.mobileMonitor.createAlert(
        'System Warning',
        alert.message,
        'medium',
        'system'
      );
    }
  }
  
  /**
   * Handle critical-level health conditions with automated recovery
   * Handle critical conditions
   * @param {string} component - Component in critical state
   * @param {number} value - Metric value that triggered critical alert
   */
  handleCritical(component, value) {
    // Create critical alert object
    const alert = {
      level: 'critical',
      component,
      value,
      message: `CRITICAL: ${component} at ${value.toFixed(1)}%!`,
      timestamp: new Date()
    };
    
    // Store alert and emit event
    this.health.alerts.push(alert);
    this.emit('critical', alert);
    
    // Log critical alert
    this.logAlert(alert);
    
    // Execute component-specific recovery actions
    switch (component) {
      case 'cpu':
        if (this.config.throttleOnHighCPU) {
          this.throttleSystem();
        }
        break;
      
      case 'memory':
        this.freeMemory();
        break;
      
      case 'disk':
        this.performDiskCleanup();
        break;
      
      case 'network':
        console.log('🌐 Network issues detected - check connection');
        break;
    }
    
    // Schedule automatic restart if critical and enabled
    if (this.config.autoRestartOnCritical && this.health.metrics.restarts < 3) {
      this.scheduleRestart();
    }
  }
  
  /**
   * Reduce system load to manage high CPU usage
   * Throttle system to reduce CPU usage
   */
  throttleSystem() {
    console.log('🐌 Throttling system due to high CPU...');
    
    // Increase analysis throttle to reduce CPU load
    if (this.ogzPrime.analysisThrottle) {
      this.ogzPrime.analysisThrottle = Math.min(5, this.ogzPrime.analysisThrottle * 2);
    }
    
    // Notify system of throttling
    this.emit('throttled', { reason: 'high_cpu' });
  }
  
  /**
   * Attempt to free system memory
   * Free up memory
   */
  freeMemory() {
    console.log('🧹 Attempting to free memory...');
    
    // Clear indicator caches if available
    if (this.ogzPrime.indicators) {
      this.ogzPrime.indicators.clearCache();
    }
    
    // Trim trade history to conserve memory
    if (this.ogzPrime.tradingBrain && this.ogzPrime.tradingBrain.tradeHistory.length > 1000) {
      this.ogzPrime.tradingBrain.tradeHistory = 
        this.ogzPrime.tradingBrain.tradeHistory.slice(-500);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  /**
   * Clean up disk space by removing old files
   * Clean up disk space
   */
  performDiskCleanup() {
    console.log('🗑️ Performing disk cleanup...');
    
    // Clean old log files
    this.cleanupOldLogs();
    
    // Clean old pattern memory backups
    const patternBackupPath = path.join(this.config.patternMemoryDirectory, 'backups');
    if (fs.existsSync(patternBackupPath)) {
      this.cleanupDirectory(patternBackupPath, 7); // Keep 7 days
    }
  }
  
  /**
   * Schedule automatic system restart for critical conditions
   * Schedule system restart
   */
  scheduleRestart() {
    console.log('🔄 Scheduling system restart in 60 seconds...');
    
    // Increment restart counter
    this.health.metrics.restarts++;
    
    // Schedule restart with delay for cleanup
    setTimeout(() => {
      console.log('🔄 Executing scheduled restart...');
      
      // Close any open trading positions before restart
      if (this.ogzPrime.tradingBrain?.isInPosition()) {
        this.ogzPrime.emergencyClosePosition('System restart required');
      }
      
      // Exit process (PM2 or systemd will restart)
      process.exit(0);
    }, 60000);
  }
  
  /**
   * Remove old log files based on retention policy
   * Clean up old logs
   */
  cleanupOldLogs() {
    const cutoffTime = Date.now() - (this.config.retainDays * 24 * 60 * 60 * 1000);
    
    // Clean health monitoring logs
    this.cleanupDirectory(this.config.logPath, this.config.retainDays);
    
    // Clean trade logs if directory exists
    const tradeLogPath = path.join(this.config.logDirectory, 'trades');
    if (fs.existsSync(tradeLogPath)) {
      this.cleanupDirectory(tradeLogPath, this.config.retainDays);
    }
  }
  
  /**
   * Remove old files from specified directory
   * Clean up directory
   * @param {string} dirPath - Directory path to clean
   * @param {number} retainDays - Number of days to retain files
   */
  cleanupDirectory(dirPath, retainDays) {
    if (!fs.existsSync(dirPath)) return;
    
    // Calculate cutoff time for file deletion
    const cutoffTime = Date.now() - (retainDays * 24 * 60 * 60 * 1000);
    
    // Process each file in directory
    fs.readdirSync(dirPath).forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      // Delete files older than retention period
      if (stats.mtime.getTime() < cutoffTime) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted old file: ${file}`);
      }
    });
  }
  
  /**
   * Execute comprehensive system health check
   * Perform full health check
   * @returns {Object} Complete health report
   */
  performFullHealthCheck() {
    console.log('🏥 Performing full health check...');
    
    // Execute all health checks
    this.checkCPU();
    this.checkMemory();
    this.checkDisk();
    this.checkNetwork();
    this.updateMetrics();
    
    // Generate comprehensive health report
    const report = this.generateHealthReport();
    this.emit('health_check', report);
    
    return report;
  }
  
  /**
   * Compile comprehensive health status report
   * Generate health report
   * @returns {Object} Detailed health report with all metrics
   */
  generateHealthReport() {
    const overallStatus = this.calculateOverallStatus();
    
    return {
      timestamp: new Date(),
      overall: overallStatus,
      components: {
        cpu: { ...this.health.cpu },
        memory: { ...this.health.memory },
        disk: { ...this.health.disk },
        network: { ...this.health.network },
        system: { ...this.health.system }
      },
      metrics: { ...this.health.metrics },
      alerts: this.health.alerts.slice(-10), // Last 10 alerts
      recommendations: this.generateRecommendations()
    };
  }
  
  /**
   * Determine overall system health status
   * Calculate overall system status
   * @returns {string} Overall status ('healthy', 'warning', 'critical')
   */
  calculateOverallStatus() {
    const statuses = [
      this.health.cpu.status,
      this.health.memory.status,
      this.health.disk.status,
      this.health.network.status
    ];
    
    // Return worst status found
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    return 'healthy';
  }
  
  /**
   * Generate system optimization recommendations
   * Generate system recommendations
   * @returns {Array} Array of recommendation objects
   */
  generateRecommendations() {
    const recommendations = [];
    
    // CPU-based recommendations
    if (this.health.cpu.usage > 60) {
      recommendations.push({
        type: 'performance',
        message: 'Consider reducing analysis frequency to lower CPU usage'
      });
    }
    
    // Memory-based recommendations
    if (this.health.memory.usage > 70) {
      recommendations.push({
        type: 'memory',
        message: 'Memory usage high - consider increasing system RAM'
      });
    }
    
    // Disk-based recommendations
    if (this.health.disk.usage > 70) {
      recommendations.push({
        type: 'storage',
        message: 'Disk usage high - enable log rotation or increase storage'
      });
    }
    
    // Stability-based recommendations
    if (this.health.metrics.errorsPerHour > 10) {
      recommendations.push({
        type: 'stability',
        message: 'High error rate detected - check system logs'
      });
    }
    
    return recommendations;
  }
  
  /**
   * Log current health metrics to file
   * Log health metrics
   */
  logHealthMetrics() {
    // Generate daily log file path
    const logFile = path.join(
      this.config.logPath,
      `health-${new Date().toISOString().split('T')[0]}.json`
    );
    
    // Create log entry with complete health data
    const entry = {
      timestamp: new Date(),
      health: this.generateHealthReport()
    };
    
    // Append entry to daily log file
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  }
  
  /**
   * Log alert information to file
   * Log alert
   * @param {Object} alert - Alert object to log
   */
  logAlert(alert) {
    // Generate daily alert log file path
    const logFile = path.join(
      this.config.logPath,
      `alerts-${new Date().toISOString().split('T')[0]}.json`
    );
    
    // Append alert to daily log file
    fs.appendFileSync(logFile, JSON.stringify(alert) + '\n');
  }
  
  /**
   * Get current health status
   * Get health status
   * @returns {Object} Current health report
   */
  getStatus() {
    return this.generateHealthReport();
  }
  
  /**
   * Stop all health monitoring and perform final check
   * Stop monitoring
   */
  stop() {
    console.log('🏥 Stopping health monitoring...');
    
    // Clear all monitoring intervals
    Object.values(this.monitors).forEach(interval => {
      clearInterval(interval);
    });
    
    // Perform final health check before shutdown
    this.performFullHealthCheck();
  }
}

module.exports = SystemHealthMonitor;