// 📁 FILE: core/DataCompressionModule.js
const zlib = require('zlib');
const fs = require('fs').promises;

/**
 * DataCompressionModule - Compresses and archives old pattern data to save memory
 * Automatically moves stale patterns to compressed archives while keeping active patterns in memory
 */
class DataCompressionModule {
  /**
   * Initialize data compression module with archival configuration
   * @param {Object} config - Compression settings and thresholds
   */
  constructor(config = {}) {
    // Compression configuration with default values
    this.config = {
      compressionThreshold: 30, // Days before patterns are considered old and archived
      compressionLevel: 9,      // Gzip compression level (1-9, higher = better compression)
      archivePath: 'data/archives/', // Directory for storing compressed archives
      ...config // Merge user-provided configuration overrides
    };
  }
  
  /**
   * Compress old patterns based on age threshold and return active patterns
   * Separates patterns into active vs stale, compresses old ones, keeps recent ones in memory
   * @param {Object} patternMemory - Complete pattern memory data
   * @returns {Object} Active patterns only (old patterns removed and archived)
   */
  async compressOldPatterns(patternMemory) {
    const now = Date.now();
    // Convert threshold days to milliseconds for timestamp comparison
    const thresholdMs = this.config.compressionThreshold * 24 * 60 * 60 * 1000;
    
    // Storage for pattern separation
    const toCompress = {}; // Old patterns to be archived
    const toKeep = {};     // Recent patterns to stay in memory
    
    // Separate old patterns from recent patterns based on last seen timestamp
    Object.entries(patternMemory).forEach(([key, pattern]) => {
      // Get timestamp of most recent pattern occurrence
      const lastSeen = pattern.results?.[pattern.results.length - 1]?.timestamp || 0;
      
      // Compare age against threshold to decide compression
      if (now - lastSeen > thresholdMs) {
        toCompress[key] = pattern; // Pattern is old, archive it
      } else {
        toKeep[key] = pattern;     // Pattern is recent, keep in memory
      }
    });
    
    // Process old patterns if any exist
    if (Object.keys(toCompress).length > 0) {
      // Compress old patterns to gzip format
      const compressed = await this.compress(JSON.stringify(toCompress));
      
      // Generate timestamped filename for archive
      const filename = `patterns_${new Date().toISOString().split('T')[0]}.gz`;
      
      // Write compressed archive to disk
      await fs.writeFile(
        `${this.config.archivePath}${filename}`,
        compressed
      );
      
      console.log(`📦 Compressed ${Object.keys(toCompress).length} old patterns`);
      
      // Return only active patterns (memory footprint reduced)
      return toKeep;
    }
    
    // No old patterns found, return original memory unchanged
    return patternMemory;
  }
  
  /**
   * Compress data using gzip with configured compression level
   * @param {string} data - String data to compress
   * @returns {Promise<Buffer>} Compressed data buffer
   */
  compress(data) {
    return new Promise((resolve, reject) => {
      // Use zlib gzip with configured compression level
      zlib.gzip(data, { level: this.config.compressionLevel }, (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }
  
  /**
   * Decompress archived pattern data from gzip file
   * @param {string} filename - Archive filename to decompress
   * @returns {Promise<Object>} Decompressed pattern data
   */
  async decompress(filename) {
    // Read compressed file from archive directory
    const compressed = await fs.readFile(`${this.config.archivePath}${filename}`);
    
    return new Promise((resolve, reject) => {
      // Decompress gzip data back to JSON
      zlib.gunzip(compressed, (err, decompressed) => {
        if (err) reject(err);
        else resolve(JSON.parse(decompressed.toString())); // Parse JSON from decompressed string
      });
    });
  }
}

module.exports = DataCompressionModule;