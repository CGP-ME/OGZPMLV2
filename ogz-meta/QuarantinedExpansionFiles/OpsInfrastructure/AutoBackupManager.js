// AutoBackupManager.js - Never lose trading data again!
// Automated backups with compression and rotation

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

// Promisify compression functions for async/await usage
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * AutoBackupManager - Comprehensive backup system for OGZPrime trading bot
 * Handles automated pattern, state, and full system backups with compression and retention
 */
class AutoBackupManager {
  constructor(ogzPrime, config = {}) {
    // Reference to main trading bot instance
    this.ogzPrime = ogzPrime;
    
    // Backup configuration with intelligent defaults
    this.config = {
      // Backup settings
      backupDir: path.join(process.cwd(), 'backups'),
      
      // Backup frequencies (in minutes)
      patternBackupInterval: 60,      // Every hour - pattern memory changes frequently
      stateBackupInterval: 360,       // Every 6 hours - trading state less volatile
      fullBackupInterval: 1440,       // Every 24 hours - complete system snapshot
      
      // Retention policies - balance storage vs safety
      maxPatternBackups: 24,          // Keep 24 hours of pattern backups
      maxStateBackups: 7,             // Keep 7 days of state backups
      maxFullBackups: 30,             // Keep 30 days of full backups
      
      // Compression settings - optimize storage
      enableCompression: true,
      compressionLevel: 6,            // 1-9, higher = better compression
      
      // Cloud backup (future feature)
      enableCloudBackup: false,
      cloudProvider: null,
      
      ...config
    };
    
    // Backup system runtime state
    this.isRunning = false;
    
    // Timer references for interval management
    this.timers = {
      pattern: null,
      state: null,
      full: null
    };
    
    // Backup operation statistics
    this.stats = {
      lastPatternBackup: null,
      lastStateBackup: null,
      lastFullBackup: null,
      totalBackups: 0,
      totalSize: 0,
      failures: 0
    };
    
    // Create backup directory structure on initialization
    this.ensureBackupDirectory();
  }
  
  /**
   * Create backup directory structure if it doesn't exist
   */
  ensureBackupDirectory() {
    // Define required backup directories
    const dirs = [
      this.config.backupDir,
      path.join(this.config.backupDir, 'patterns'),
      path.join(this.config.backupDir, 'state'),
      path.join(this.config.backupDir, 'full')
    ];
    
    // Create each directory recursively if missing
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  /**
   * Start automated backup system
   */
  start() {
    // Prevent multiple instances running
    if (this.isRunning) {
      console.log('⚠️ Backup manager already running');
      return;
    }
    
    this.isRunning = true;
    console.log('💾 Automated backup system started');
    
    // Perform immediate initial backups on startup
    this.backupPatterns();
    this.backupState();
    
    // Schedule recurring pattern backups (most frequent)
    this.timers.pattern = setInterval(() => {
      this.backupPatterns();
    }, this.config.patternBackupInterval * 60 * 1000);
    
    // Schedule recurring state backups (medium frequency)
    this.timers.state = setInterval(() => {
      this.backupState();
    }, this.config.stateBackupInterval * 60 * 1000);
    
    // Schedule recurring full backups (least frequent, most comprehensive)
    this.timers.full = setInterval(() => {
      this.backupFull();
    }, this.config.fullBackupInterval * 60 * 1000);
    
    // Clean up old backups to maintain storage limits
    this.cleanupOldBackups();
  }
  
  /**
   * Stop backup system and clear all timers
   */
  stop() {
    this.isRunning = false;
    
    // Clear all scheduled backup timers
    Object.values(this.timers).forEach(timer => {
      if (timer) clearInterval(timer);
    });
    
    console.log('💾 Backup system stopped');
  }
  
  /**
   * Backup pattern memory - most critical trading intelligence
   */
  async backupPatterns() {
    try {
      console.log('💾 Backing up pattern memory...');
      
      // Collect pattern memory data from pattern checker
      const patternData = {
        timestamp: new Date().toISOString(),
        version: this.ogzPrime.config.version,
        patterns: this.ogzPrime.patternChecker?.memory?.memory || {},
        stats: this.ogzPrime.patternChecker?.getMemoryStats() || {}
      };
      
      // Generate unique filename with optional compression extension
      const filename = `patterns_${Date.now()}.json${this.config.enableCompression ? '.gz' : ''}`;
      const filepath = path.join(this.config.backupDir, 'patterns', filename);
      
      // Save backup with compression if enabled
      await this.saveBackup(filepath, patternData);
      
      // Update backup statistics
      this.stats.lastPatternBackup = new Date();
      this.stats.totalBackups++;
      
      console.log('✅ Pattern backup complete');
    } catch (error) {
      console.error('❌ Pattern backup failed:', error);
      this.stats.failures++;
    }
  }
  
  /**
   * Backup system state - trading position, balance, recent performance
   */
  async backupState() {
    try {
      console.log('💾 Backing up system state...');
      
      // Collect comprehensive system state data
      const stateData = {
        timestamp: new Date().toISOString(),
        version: this.ogzPrime.config.version,
        
        // Current trading state - critical for recovery
        balance: this.ogzPrime.tradingBrain?.balance,
        position: this.ogzPrime.tradingBrain?.position,
        tradeHistory: this.ogzPrime.tradingBrain?.tradeHistory?.slice(-100), // Last 100 trades only
        
        // Risk management state
        riskState: this.ogzPrime.riskManager?.getRiskSummary(),
        
        // Performance analytics state
        performance: this.ogzPrime.performanceAnalyzer?.getPerformanceSummary(),
        
        // System operational status
        status: this.ogzPrime.status,
        config: {
          assetName: this.ogzPrime.config.assetName,
          profileName: this.ogzPrime.config.profileName
        }
      };
      
      // Generate unique filename for state backup
      const filename = `state_${Date.now()}.json${this.config.enableCompression ? '.gz' : ''}`;
      const filepath = path.join(this.config.backupDir, 'state', filename);
      
      // Save state backup
      await this.saveBackup(filepath, stateData);
      
      // Update statistics
      this.stats.lastStateBackup = new Date();
      this.stats.totalBackups++;
      
      console.log('✅ State backup complete');
    } catch (error) {
      console.error('❌ State backup failed:', error);
      this.stats.failures++;
    }
  }
  
  /**
   * Full system backup - complete bot state snapshot
   */
  async backupFull() {
    try {
      console.log('💾 Performing full system backup...');
      
      // Comprehensive backup of entire system state
      const fullBackup = {
        timestamp: new Date().toISOString(),
        version: this.ogzPrime.config.version,
        
        // Complete bot configuration
        config: this.ogzPrime.config,
        
        // All pattern recognition data
        patterns: {
          memory: this.ogzPrime.patternChecker?.memory?.memory || {},
          stats: this.ogzPrime.patternChecker?.getMemoryStats() || {}
        },
        
        // Complete trading history and financial state
        trading: {
          balance: this.ogzPrime.tradingBrain?.balance,
          initialBalance: this.ogzPrime.config.initialBalance,
          position: this.ogzPrime.tradingBrain?.position,
          tradeHistory: this.ogzPrime.tradingBrain?.tradeHistory || [],
          dailyStats: this.ogzPrime.status?.dailyStats
        },
        
        // Risk management complete state
        risk: this.ogzPrime.riskManager?.state,
        
        // Performance analytics complete data
        performance: {
          summary: this.ogzPrime.performanceAnalyzer?.getPerformanceSummary(),
          patterns: this.ogzPrime.performanceAnalyzer?.state?.patternPerformance,
          recommendations: this.ogzPrime.performanceAnalyzer?.state?.recommendations
        },
        
        // Technical analysis levels
        technicalLevels: {
          fibonacci: this.ogzPrime.fibonacciLevels,
          supportResistance: this.ogzPrime.supportResistanceLevels
        }
      };
      
      // Generate unique filename for full backup
      const filename = `full_backup_${Date.now()}.json${this.config.enableCompression ? '.gz' : ''}`;
      const filepath = path.join(this.config.backupDir, 'full', filename);
      
      // Save complete backup
      await this.saveBackup(filepath, fullBackup);
      
      // Update statistics
      this.stats.lastFullBackup = new Date();
      this.stats.totalBackups++;
      
      console.log('✅ Full backup complete');
      
      // Cleanup old backups after successful full backup
      await this.cleanupOldBackups();
      
    } catch (error) {
      console.error('❌ Full backup failed:', error);
      this.stats.failures++;
    }
  }
  
  /**
   * Save backup data to file with optional gzip compression
   */
  async saveBackup(filepath, data) {
    // Convert data to JSON string
    const jsonData = JSON.stringify(data, null, 2);
    
    if (this.config.enableCompression) {
      // Compress data using gzip with configured compression level
      const compressed = await gzip(jsonData, {
        level: this.config.compressionLevel
      });
      
      // Write compressed data to file
      await fs.promises.writeFile(filepath, compressed);
      
      // Update storage statistics
      this.stats.totalSize += compressed.length;
      
      // Log compression efficiency
      const ratio = ((1 - compressed.length / jsonData.length) * 100).toFixed(1);
      console.log(`📦 Compressed ${(jsonData.length / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB (${ratio}% reduction)`);
    } else {
      // Write uncompressed JSON data
      await fs.promises.writeFile(filepath, jsonData);
      this.stats.totalSize += jsonData.length;
    }
  }
  
  /**
   * Restore system state from backup file
   */
  async restoreFromBackup(backupPath) {
    try {
      console.log(`📂 Restoring from backup: ${backupPath}`);
      
      let data;
      // Handle compressed backup files
      if (backupPath.endsWith('.gz')) {
        const compressed = await fs.promises.readFile(backupPath);
        const decompressed = await gunzip(compressed);
        data = JSON.parse(decompressed.toString());
      } else {
        // Handle uncompressed backup files
        const content = await fs.promises.readFile(backupPath, 'utf8');
        data = JSON.parse(content);
      }
      
      console.log(`✅ Backup loaded (${data.timestamp})`);
      return data;
      
    } catch (error) {
      console.error('❌ Failed to restore backup:', error);
      throw error;
    }
  }
  
  /**
   * Clean up old backups based on retention policy to manage storage
   */
  async cleanupOldBackups() {
    console.log('🗑️ Cleaning up old backups...');
    
    const now = Date.now();
    let deletedCount = 0;
    let freedSpace = 0;
    
    // Define cleanup tasks for each backup type with retention periods
    const cleanupTasks = [
      {
        dir: path.join(this.config.backupDir, 'patterns'),
        maxAge: this.config.maxPatternBackups * 60 * 60 * 1000 // Convert hours to ms
      },
      {
        dir: path.join(this.config.backupDir, 'state'),
        maxAge: this.config.maxStateBackups * 24 * 60 * 60 * 1000 // Convert days to ms
      },
      {
        dir: path.join(this.config.backupDir, 'full'),
        maxAge: this.config.maxFullBackups * 24 * 60 * 60 * 1000 // Convert days to ms
      }
    ];
    
    // Process each backup type directory
    for (const task of cleanupTasks) {
      try {
        const files = await fs.promises.readdir(task.dir);
        
        // Check each file's age against retention policy
        for (const file of files) {
          const filepath = path.join(task.dir, file);
          const stats = await fs.promises.stat(filepath);
          
          // Delete files older than retention period
          if (now - stats.mtimeMs > task.maxAge) {
            freedSpace += stats.size;
            await fs.promises.unlink(filepath);
            deletedCount++;
          }
        }
      } catch (error) {
        console.error(`Error cleaning ${task.dir}:`, error);
      }
    }
    
    // Log cleanup results
    if (deletedCount > 0) {
      console.log(`🗑️ Deleted ${deletedCount} old backups, freed ${(freedSpace / 1024 / 1024).toFixed(2)}MB`);
    }
  }
  
  /**
   * Get list of available backups with metadata
   */
  async listBackups(type = 'all') {
    const backups = [];
    
    // Determine which backup types to list
    const dirs = type === 'all' 
      ? ['patterns', 'state', 'full']
      : [type];
    
    // Scan each backup directory
    for (const dir of dirs) {
      try {
        const dirPath = path.join(this.config.backupDir, dir);
        const files = await fs.promises.readdir(dirPath);
        
        // Collect metadata for each backup file
        for (const file of files) {
          const filepath = path.join(dirPath, file);
          const stats = await fs.promises.stat(filepath);
          
          backups.push({
            type: dir,
            filename: file,
            path: filepath,
            size: stats.size,
            created: stats.mtime,
            compressed: file.endsWith('.gz')
          });
        }
      } catch (error) {
        console.error(`Error listing ${dir} backups:`, error);
      }
    }
    
    // Sort backups by creation date (newest first)
    backups.sort((a, b) => b.created - a.created);
    
    return backups;
  }
  
  /**
   * Emergency backup - called on system crashes or unexpected shutdowns
   */
  async emergencyBackup() {
    console.log('🚨 EMERGENCY BACKUP IN PROGRESS...');
    
    try {
      // Collect only critical data for speed during emergency
      const emergencyData = {
        timestamp: new Date().toISOString(),
        type: 'EMERGENCY',
        reason: 'System crash or shutdown',
        
        // Most critical trading data for recovery
        balance: this.ogzPrime.tradingBrain?.balance,
        position: this.ogzPrime.tradingBrain?.position,
        lastTrades: this.ogzPrime.tradingBrain?.tradeHistory?.slice(-10),
        
        // Pattern memory count (not full data for speed)
        patterns: Object.keys(this.ogzPrime.patternChecker?.memory?.memory || {}).length,
        
        // Last known market price
        lastPrice: this.ogzPrime.timeframeData[this.ogzPrime.config.primaryTimeframe]?.candles?.slice(-1)[0]?.close
      };
      
      // Use simple filename without compression for speed
      const filename = `EMERGENCY_${Date.now()}.json`;
      const filepath = path.join(this.config.backupDir, filename);
      
      // Save without compression for maximum speed during emergency
      await fs.promises.writeFile(filepath, JSON.stringify(emergencyData, null, 2));
      
      console.log('✅ Emergency backup saved');
      return filepath;
      
    } catch (error) {
      console.error('❌ EMERGENCY BACKUP FAILED:', error);
      return null;
    }
  }
  
  /**
   * Get comprehensive backup system statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalSizeMB: (this.stats.totalSize / 1024 / 1024).toFixed(2),
      successRate: this.stats.totalBackups > 0 
        ? ((this.stats.totalBackups - this.stats.failures) / this.stats.totalBackups * 100).toFixed(1)
        : 0
    };
  }
  
  /**
   * Manual backup trigger for specific backup types
   */
  async manualBackup(type = 'full') {
    console.log(`🔧 Manual ${type} backup requested`);
    
    // Execute specific backup type based on request
    switch (type) {
      case 'patterns':
        return await this.backupPatterns();
      case 'state':
        return await this.backupState();
      case 'full':
        return await this.backupFull();
      default:
        throw new Error(`Unknown backup type: ${type}`);
    }
  }
}

module.exports = AutoBackupManager;