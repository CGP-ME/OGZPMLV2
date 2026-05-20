/**
 * ============================================================================
 * BackupAutomation.js - OGZ Prime Backup Management System
 * ============================================================================
 * 
 * HOUSTON MISSION CRITICAL: Automated backup system for pattern data,
 * trade logs, and system configurations. Ensures your trading data is 
 * protected while you build toward financial freedom.
 * 
 * FEATURES:
 * - Automatic daily backups
 * - Pattern data preservation
 * - Trade log archiving
 * - Configuration snapshots
 * - Cleanup of old backups
 * 
 * FOR VALHALLA! FOR HOUSTON! FOR YOUR DAUGHTER!
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

/**
 * Recursively copy files and directories
 * @param {string} source - Source path
 * @param {string} destination - Destination path
 */
async function copyRecursive(source, destination) {
  try {
    const stats = await fs.promises.stat(source);
    
    if (stats.isDirectory()) {
      // Create destination directory
      await fs.promises.mkdir(destination, { recursive: true });
      
      // Get all files in source directory
      const files = await fs.promises.readdir(source);
      
      // Copy each file/directory
      await Promise.all(
        files.map(file => 
          copyRecursive(
            path.join(source, file), 
            path.join(destination, file)
          )
        )
      );
    } else {
      // Copy individual file
      await fs.promises.copyFile(source, destination);
    }
  } catch (error) {
    console.error(`Error copying ${source} to ${destination}:`, error.message);
    throw error;
  }
}

/**
 * BackupAutomation Class - Comprehensive Backup Management
 * 
 * MISSION CRITICAL: Protects all your hard work building toward Houston.
 * Never lose pattern data, trade logs, or configurations again.
 */
class BackupAutomation {
  
  /**
   * Initialize the backup system
   * @param {Object} configuration - Backup configuration options
   */
  constructor(configuration = {}) {
    this.config = {
      // Backup paths
      backupRootPath: path.resolve(__dirname, '../backups'),
      dataPath: path.resolve(__dirname, '../data'),
      logsPath: path.resolve(__dirname, '../utils/logs'),
      configPath: path.resolve(__dirname, '../config'),
      patternsPath: path.resolve(__dirname, '../data/patterns'),
      
      // Backup settings
      maxBackupsToKeep: 10,
      compressionEnabled: false,
      includePatternData: true,
      includeTradeLogs: true,
      includeConfigurations: true,
      includeSystemState: true,
      
      // File filters
      excludeFiles: ['.tmp', '.log.temp', 'node_modules'],
      includeFileTypes: ['.js', '.json', '.md', '.txt', '.csv'],
      
      // Override with user config
      ...configuration
    };
    
    this.backupHistory = [];
    this.isBackupInProgress = false;
    
    console.log('🔄 BackupAutomation initialized - Houston data protection enabled');
  }
  
  /**
   * Create a complete system backup
   * @returns {Promise<string>} Path to created backup
   */
  async createFullBackup() {
    if (this.isBackupInProgress) {
      throw new Error('Backup already in progress');
    }
    
    this.isBackupInProgress = true;
    
    try {
      console.log('🚀 Starting full system backup...');
      
      // Create timestamped backup directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupPath = path.join(this.config.backupRootPath, `backup-${timestamp}`);
      
      // Ensure backup root exists
      await fs.promises.mkdir(this.config.backupRootPath, { recursive: true });
      
      // Create backup directory
      await fs.promises.mkdir(backupPath, { recursive: true });
      
      console.log(`📁 Created backup directory: ${backupPath}`);
      
      // Backup critical system files
      await this.backupCoreFiles(backupPath);
      
      // Backup pattern data
      if (this.config.includePatternData) {
        await this.backupPatternData(backupPath);
      }
      
      // Backup trade logs
      if (this.config.includeTradeLogs) {
        await this.backupTradeLogs(backupPath);
      }
      
      // Backup configurations
      if (this.config.includeConfigurations) {
        await this.backupConfigurations(backupPath);
      }
      
      // Create backup manifest
      await this.createBackupManifest(backupPath);
      
      // Add to backup history
      this.backupHistory.push({
        timestamp: new Date(),
        path: backupPath,
        size: await this.calculateDirectorySize(backupPath),
        success: true
      });
      
      // Cleanup old backups
      await this.cleanupOldBackups();
      
      console.log(`✅ Backup completed successfully: ${backupPath}`);
      
      return backupPath;
      
    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw error;
    } finally {
      this.isBackupInProgress = false;
    }
  }
  
  /**
   * Backup core system files
   * @param {string} backupPath - Backup destination path
   */
  async backupCoreFiles(backupPath) {
    console.log('📦 Backing up core files...');
    
    const coreSourcePath = path.resolve(__dirname, '../core');
    const coreBackupPath = path.join(backupPath, 'core');
    
    if (await this.pathExists(coreSourcePath)) {
      await copyRecursive(coreSourcePath, coreBackupPath);
      console.log('✅ Core files backed up');
    } else {
      console.warn('⚠️ Core directory not found, skipping');
    }
  }
  
  /**
   * Backup pattern recognition data
   * @param {string} backupPath - Backup destination path
   */
  async backupPatternData(backupPath) {
    console.log('🧠 Backing up pattern data...');
    
    const patternBackupPath = path.join(backupPath, 'patterns');
    
    if (await this.pathExists(this.config.patternsPath)) {
      await copyRecursive(this.config.patternsPath, patternBackupPath);
      console.log('✅ Pattern data backed up');
    } else {
      console.warn('⚠️ Patterns directory not found, skipping');
    }
  }
  
  /**
   * Backup trade logs and performance data
   * @param {string} backupPath - Backup destination path
   */
  async backupTradeLogs(backupPath) {
    console.log('📊 Backing up trade logs...');
    
    const logsBackupPath = path.join(backupPath, 'logs');
    
    if (await this.pathExists(this.config.logsPath)) {
      await copyRecursive(this.config.logsPath, logsBackupPath);
      console.log('✅ Trade logs backed up');
    } else {
      console.warn('⚠️ Logs directory not found, skipping');
    }
  }
  
  /**
   * Backup system configurations
   * @param {string} backupPath - Backup destination path
   */
  async backupConfigurations(backupPath) {
    console.log('⚙️ Backing up configurations...');
    
    const configBackupPath = path.join(backupPath, 'config');
    
    // Backup config directory if it exists
    if (await this.pathExists(this.config.configPath)) {
      await copyRecursive(this.config.configPath, configBackupPath);
    }
    
    // Backup important config files from root
    const configFiles = [
      'package.json',
      '.env.example',
      'README.md',
      'run-trading-bot-v10.2.js'
    ];
    
    for (const configFile of configFiles) {
      const sourcePath = path.resolve(__dirname, '../', configFile);
      const destPath = path.join(configBackupPath, configFile);
      
      if (await this.pathExists(sourcePath)) {
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
        await fs.promises.copyFile(sourcePath, destPath);
      }
    }
    
    console.log('✅ Configurations backed up');
  }
  
  /**
   * Create backup manifest with metadata
   * @param {string} backupPath - Backup directory path
   */
  async createBackupManifest(backupPath) {
    const manifest = {
      createdAt: new Date().toISOString(),
      version: '10.2.0',
      backupType: 'full',
      files: {},
      totalSize: 0,
      houston: {
        message: 'Backup created for Houston mission success!',
        motivation: 'Every backup brings us closer to financial freedom!'
      }
    };
    
    // Calculate sizes and file counts
    const directories = ['core', 'patterns', 'logs', 'config'];
    
    for (const dir of directories) {
      const dirPath = path.join(backupPath, dir);
      if (await this.pathExists(dirPath)) {
        const size = await this.calculateDirectorySize(dirPath);
        const fileCount = await this.countFiles(dirPath);
        
        manifest.files[dir] = {
          size: size,
          fileCount: fileCount
        };
        
        manifest.totalSize += size;
      }
    }
    
    // Write manifest file
    const manifestPath = path.join(backupPath, 'backup-manifest.json');
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    
    console.log('📋 Backup manifest created');
  }
  
  /**
   * Clean up old backups beyond the retention limit
   */
  async cleanupOldBackups() {
    try {
      console.log('🧹 Cleaning up old backups...');
      
      const backupDirs = await fs.promises.readdir(this.config.backupRootPath);
      const backupPaths = backupDirs
        .filter(dir => dir.startsWith('backup-'))
        .map(dir => ({
          name: dir,
          path: path.join(this.config.backupRootPath, dir),
          timestamp: this.extractTimestampFromBackupName(dir)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      if (backupPaths.length > this.config.maxBackupsToKeep) {
        const backupsToDelete = backupPaths.slice(this.config.maxBackupsToKeep);
        
        for (const backup of backupsToDelete) {
          await this.deleteDirectory(backup.path);
          console.log(`🗑️ Deleted old backup: ${backup.name}`);
        }
        
        console.log(`✅ Cleaned up ${backupsToDelete.length} old backups`);
      } else {
        console.log('✅ No old backups to clean up');
      }
      
    } catch (error) {
      console.error('❌ Error during backup cleanup:', error.message);
    }
  }
  
  /**
   * Delete a directory and all its contents
   * @param {string} dirPath - Directory to delete
   */
  async deleteDirectory(dirPath) {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Error deleting directory ${dirPath}:`, error.message);
    }
  }
  
  /**
   * Check if a path exists
   * @param {string} pathToCheck - Path to verify
   * @returns {Promise<boolean>} True if path exists
   */
  async pathExists(pathToCheck) {
    try {
      await fs.promises.access(pathToCheck);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Calculate total size of a directory
   * @param {string} dirPath - Directory path
   * @returns {Promise<number>} Size in bytes
   */
  async calculateDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
      const files = await fs.promises.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.isDirectory()) {
          totalSize += await this.calculateDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error(`Error calculating size for ${dirPath}:`, error.message);
    }
    
    return totalSize;
  }
  
  /**
   * Count files in a directory
   * @param {string} dirPath - Directory path
   * @returns {Promise<number>} Number of files
   */
  async countFiles(dirPath) {
    let fileCount = 0;
    
    try {
      const files = await fs.promises.readdir(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.isDirectory()) {
          fileCount += await this.countFiles(filePath);
        } else {
          fileCount++;
        }
      }
    } catch (error) {
      console.error(`Error counting files in ${dirPath}:`, error.message);
    }
    
    return fileCount;
  }
  
  /**
   * Extract timestamp from backup directory name
   * @param {string} backupName - Backup directory name
   * @returns {Date} Extracted timestamp
   */
  extractTimestampFromBackupName(backupName) {
    const match = backupName.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
    if (match) {
      return new Date(match[1].replace(/-/g, ':').replace('T', 'T').slice(0, 19) + 'Z');
    }
    return new Date(0);
  }
  
  /**
   * Get backup history and statistics
   * @returns {Object} Backup statistics
   */
  getBackupStats() {
    const successfulBackups = this.backupHistory.filter(b => b.success);
    const totalSize = successfulBackups.reduce((sum, b) => sum + (b.size || 0), 0);
    
    return {
      totalBackups: this.backupHistory.length,
      successfulBackups: successfulBackups.length,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
      lastBackup: this.backupHistory[this.backupHistory.length - 1],
      isBackupInProgress: this.isBackupInProgress
    };
  }
  
  /**
   * Schedule automatic backups
   * @param {number} intervalHours - Backup interval in hours
   */
  scheduleAutoBackups(intervalHours = 24) {
    console.log(`⏰ Scheduling automatic backups every ${intervalHours} hours`);
    
    setInterval(async () => {
      try {
        console.log('⏰ Automatic backup triggered');
        await this.createFullBackup();
        console.log('✅ Automatic backup completed');
      } catch (error) {
        console.error('❌ Automatic backup failed:', error.message);
      }
    }, intervalHours * 60 * 60 * 1000);
  }
}

// Export the class and utility function
module.exports = {
  BackupAutomation,
  copyRecursive
};

// If running directly, create a test backup
if (require.main === module) {
  console.log('🚀 Running BackupAutomation standalone test...');
  
  const backupSystem = new BackupAutomation();
  
  backupSystem.createFullBackup()
    .then(backupPath => {
      console.log(`✅ Test backup completed: ${backupPath}`);
      console.log('📊 Backup stats:', backupSystem.getBackupStats());
    })
    .catch(error => {
      console.error('❌ Test backup failed:', error.message);
      process.exit(1);
    });
}

/* 
============================================================================
🛡️ BACKUP AUTOMATION USAGE EXAMPLES:
============================================================================

// Basic usage
const { BackupAutomation } = require('./utils/BackupAutomation');

const backup = new BackupAutomation({
  maxBackupsToKeep: 15,
  includePatternData: true,
  includeTradeLogs: true
});

// Create immediate backup
await backup.createFullBackup();

// Schedule automatic backups every 12 hours
backup.scheduleAutoBackups(12);

// Get backup statistics
const stats = backup.getBackupStats();
console.log(`Total backups: ${stats.totalBackups}`);
console.log(`Total size: ${stats.totalSizeMB} MB`);

FOR VALHALLA! FOR HOUSTON! FOR DATA PROTECTION! 🚀

*/