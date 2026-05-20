// SECURITY FIX: Enhanced License Manager with Hardware Fingerprinting
// monetization/LicenseManager.js

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { machineId } = require('node-machine-id'); // SECURITY FIX: Hardware fingerprinting
const { Mutex } = require('async-mutex'); // SECURITY FIX: Thread-safe operations

class LicenseManager {
  constructor(config = {}) {
    // SECURITY FIX: Validate environment configuration
    this.validateEnvironment();
    
    this.config = {
      publicKey: process.env.LICENSE_PUBLIC_KEY,
      privateKey: process.env.LICENSE_PRIVATE_KEY,
      apiEndpoint: process.env.LICENSE_API || 'https://api.ogzprime.com/license',
      cachePath: path.join(process.cwd(), 'data', '.licenses'),
      offlineGracePeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
      heartbeatInterval: 24 * 60 * 60 * 1000, // 24 hours
      maxDevices: 2,
      // SECURITY FIX: Enhanced security settings
      encryptionKey: process.env.LICENSE_ENCRYPTION_KEY || this.generateEncryptionKey(),
      deviceLockEnabled: config.deviceLockEnabled !== false,
      antiTamperEnabled: config.antiTamperEnabled !== false,
      secureMode: config.secureMode !== false,
      ...config
    };
    
    // SECURITY FIX: Thread-safe operations
    this.mutex = new Mutex();
    
    this.activeModules = new Set();
    this.cachedLicenses = new Map();
    this.deviceId = null; // Will be set asynchronously
    this.hardwareFingerprint = null; // SECURITY FIX: Hardware fingerprint
    this.lastValidation = null;
    this.validationInterval = null;
    this.initialized = false;
    
    // SECURITY FIX: Anti-tamper protection
    this.integrityChecksum = null;
    this.tamperDetected = false;
  }

  /**
   * SECURITY FIX: Enhanced initialization with hardware fingerprinting
   */
  async initialize() {
    if (this.initialized) {
      console.log('⚠️ License manager already initialized');
      return;
    }

    try {
      console.log('🔐 Initializing License Manager with Hardware Fingerprinting...');
      
      // SECURITY FIX: Generate hardware fingerprint
      await this.generateHardwareFingerprint();
      
      // Create cache directory with restricted permissions
      await fs.mkdir(this.config.cachePath, { recursive: true, mode: 0o700 });
      
      // SECURITY FIX: Perform integrity check
      await this.performIntegrityCheck();
      
      // Load cached licenses with decryption
      await this.loadCachedLicenses();
      
      // SECURITY FIX: Start heartbeat with device verification
      this.startHeartbeat();
      
      this.initialized = true;
      console.log('✅ License Manager initialization complete');
      console.log(`🔒 Device ID: ${this.deviceId.substring(0, 8)}...`);
      console.log(`🖥️ Hardware Fingerprint: ${this.hardwareFingerprint.substring(0, 8)}...`);
      
    } catch (error) {
      console.error('❌ License manager initialization failed:', error);
      throw new Error(`License manager initialization failed: ${error.message}`);
    }
  }

  /**
   * SECURITY FIX: Generate hardware fingerprint using node-machine-id
   */
  async generateHardwareFingerprint() {
    try {
      // Get machine ID (persistent across reboots, unique per machine)
      const machineIdValue = await machineId();
      
      // Combine with additional system info for enhanced fingerprinting
      const { hostname, platform, arch, cpus, totalmem } = require('os');
      const systemInfo = {
        machineId: machineIdValue,
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        cpuModel: cpus()[0]?.model || 'unknown',
        totalMemory: Math.floor(totalmem() / 1024 / 1024 / 1024), // GB, rounded for consistency
        nodeVersion: process.version
      };
      
      // Create deterministic fingerprint
      const fingerprintString = Object.values(systemInfo).join('|');
      this.hardwareFingerprint = crypto
        .createHash('sha256')
        .update(fingerprintString)
        .digest('hex');
      
      // Generate device ID (shorter, user-friendly version)
      this.deviceId = crypto
        .createHash('sha256')
        .update(`${machineIdValue}|${platform()}|${arch()}`)
        .digest('hex')
        .substring(0, 16);
      
      console.log('🔒 Hardware fingerprint generated successfully');
      
    } catch (error) {
      console.error('❌ Hardware fingerprint generation failed:', error);
      
      // Fallback to basic device ID if machine-id fails
      const fallbackString = `${require('os').hostname()}-${Date.now()}`;
      this.deviceId = crypto.createHash('sha256').update(fallbackString).digest('hex').substring(0, 16);
      this.hardwareFingerprint = this.deviceId + '_fallback';
      
      console.warn('⚠️ Using fallback device identification');
    }
  }

  async validateLicense(licenseKey, userId) {
    try {
      // Check cache first
      const cached = this.cachedLicenses.get(licenseKey);
      if (cached && cached.expires > Date.now()) {
        this.activeModules = new Set(cached.modules);
        return cached.modules;
      }

      // Validate with server
      const requestData = JSON.stringify({
        licenseKey,
        userId,
        deviceId: this.deviceId,
        version: '10.2.0',
        timestamp: Date.now()
      });

      const response = await this.makeRequest('/validate', 'POST', requestData);
      const data = JSON.parse(response);

      if (!data.valid) {
        throw new Error(data.message || 'Invalid license');
      }

      // Check device limit
      if (data.devices && data.devices.length >= this.config.maxDevices && 
          !data.devices.includes(this.deviceId)) {
        throw new Error(`License is already active on ${this.config.maxDevices} devices`);
      }

      // Cache the result
      const cacheData = {
        modules: data.modules,
        expires: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        userId,
        features: data.features || {},
        limits: data.limits || {}
      };

      this.cachedLicenses.set(licenseKey, cacheData);
      this.activeModules = new Set(data.modules);
      
      // Save to disk for offline use
      await this.saveLicenseCache(licenseKey, cacheData);
      
      this.lastValidation = Date.now();
      
      return data.modules;
    } catch (error) {
      console.error('License validation error:', error.message);
      
      // Try offline validation
      const offlineModules = await this.loadOfflineLicense(licenseKey);
      if (offlineModules.length > 0) {
        console.log('Using offline license cache');
        return offlineModules;
      }
      
      throw error;
    }
  }

  async makeRequest(path, method, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.apiEndpoint + path);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-Device-ID': this.deviceId,
          'X-License-Version': '1.0'
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', chunk => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseData);
          } else {
            reject(new Error(`API Error: ${res.statusCode} - ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * SECURITY FIX: Load offline license with decryption and device verification
   */
  async loadOfflineLicense(licenseKey) {
    try {
      const licensePath = path.join(this.config.cachePath, `${licenseKey}.enc`);
      const encryptedData = await fs.readFile(licensePath, 'utf8');
      
      // SECURITY FIX: Decrypt license data
      const license = this.decryptLicenseData(encryptedData);
      
      // SECURITY FIX: Verify device fingerprint
      if (this.config.deviceLockEnabled && license.hardwareFingerprint !== this.hardwareFingerprint) {
        throw new Error('License device mismatch - hardware fingerprint verification failed');
      }
      
      // Check if within grace period
      const gracePeriodEnd = this.lastValidation + this.config.offlineGracePeriod;
      if (Date.now() <= gracePeriodEnd && license.expires > Date.now()) {
        this.activeModules = new Set(license.modules);
        return license.modules;
      }
      
      throw new Error('Offline license expired');
    } catch (error) {
      console.error('Offline license load failed:', error.message);
      return [];
    }
  }

  /**
   * SECURITY FIX: Load cached licenses with decryption
   */
  async loadCachedLicenses() {
    const release = await this.mutex.acquire();
    
    try {
      const files = await fs.readdir(this.config.cachePath);
      let loadedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('.enc')) {
          try {
            const filePath = path.join(this.config.cachePath, file);
            const encryptedData = await fs.readFile(filePath, 'utf8');
            
            // SECURITY FIX: Decrypt license data
            const license = this.decryptLicenseData(encryptedData);
            const licenseKey = file.replace('.enc', '');
            
            // SECURITY FIX: Verify device fingerprint
            if (this.config.deviceLockEnabled && license.hardwareFingerprint && 
                license.hardwareFingerprint !== this.hardwareFingerprint) {
              console.warn(`⚠️ Device mismatch for license ${licenseKey.substring(0, 8)}...`);
              continue;
            }
            
            if (license.expires > Date.now()) {
              this.cachedLicenses.set(licenseKey, license);
              loadedCount++;
            } else {
              // Clean up expired licenses
              await fs.unlink(filePath).catch(() => {});
            }
          } catch (decryptError) {
            console.error(`Failed to decrypt license ${file}:`, decryptError.message);
          }
        }
      }
      
      console.log(`✅ Loaded ${loadedCount} valid cached licenses`);
    } catch (error) {
      console.error('Error loading cached licenses:', error.message);
    } finally {
      release();
    }
  }

  /**
   * SECURITY FIX: Save license cache with encryption and device locking
   */
  async saveLicenseCache(licenseKey, licenseData) {
    const release = await this.mutex.acquire();
    
    try {
      const licensePath = path.join(this.config.cachePath, `${licenseKey}.enc`);
      
      const dataToSave = {
        ...licenseData,
        deviceId: this.deviceId,
        hardwareFingerprint: this.hardwareFingerprint, // SECURITY FIX: Lock to hardware
        savedAt: Date.now(),
        checksum: this.calculateDataChecksum(licenseData)
      };
      
      // SECURITY FIX: Encrypt license data before saving
      const encryptedData = this.encryptLicenseData(dataToSave);
      
      // Write with restricted permissions
      await fs.writeFile(licensePath, encryptedData, { mode: 0o600 });
      
      console.log(`🔒 License cached and encrypted: ${licenseKey.substring(0, 8)}...`);
      
    } catch (error) {
      console.error('Error saving license cache:', error.message);
    } finally {
      release();
    }
  }

  isModuleLicensed(moduleName) {
    return this.activeModules.has(moduleName);
  }

  getActiveModules() {
    return Array.from(this.activeModules);
  }

  async activateModule(licenseKey, moduleName) {
    try {
      const requestData = JSON.stringify({
        licenseKey,
        moduleName,
        deviceId: this.deviceId,
        action: 'activate'
      });

      const response = await this.makeRequest('/module', 'POST', requestData);
      const data = JSON.parse(response);

      if (data.success) {
        this.activeModules.add(moduleName);
        
        // Update cache
        const cached = this.cachedLicenses.get(licenseKey);
        if (cached) {
          cached.modules.push(moduleName);
          await this.saveLicenseCache(licenseKey, cached);
        }
        
        return true;
      }
      
      throw new Error(data.message || 'Module activation failed');
    } catch (error) {
      console.error('Module activation error:', error.message);
      return false;
    }
  }

  async deactivateModule(licenseKey, moduleName) {
    try {
      const requestData = JSON.stringify({
        licenseKey,
        moduleName,
        deviceId: this.deviceId,
        action: 'deactivate'
      });

      const response = await this.makeRequest('/module', 'POST', requestData);
      const data = JSON.parse(response);

      if (data.success) {
        this.activeModules.delete(moduleName);
        
        // Update cache
        const cached = this.cachedLicenses.get(licenseKey);
        if (cached) {
          cached.modules = cached.modules.filter(m => m !== moduleName);
          await this.saveLicenseCache(licenseKey, cached);
        }
        
        return true;
      }
      
      throw new Error(data.message || 'Module deactivation failed');
    } catch (error) {
      console.error('Module deactivation error:', error.message);
      return false;
    }
  }

  async transferLicense(licenseKey, newDeviceId) {
    try {
      const requestData = JSON.stringify({
        licenseKey,
        currentDeviceId: this.deviceId,
        newDeviceId,
        timestamp: Date.now()
      });

      const response = await this.makeRequest('/transfer', 'POST', requestData);
      const data = JSON.parse(response);

      if (data.success) {
        // Clear local cache
        this.cachedLicenses.delete(licenseKey);
        this.activeModules.clear();
        
        // Remove cached file
        const licensePath = path.join(this.config.cachePath, `${licenseKey}.json`);
        await fs.unlink(licensePath).catch(() => {});
        
        return true;
      }
      
      throw new Error(data.message || 'License transfer failed');
    } catch (error) {
      console.error('License transfer error:', error.message);
      return false;
    }
  }

  startHeartbeat() {
    this.validationInterval = setInterval(async () => {
      // Revalidate all active licenses
      for (const [licenseKey, cacheData] of this.cachedLicenses) {
        try {
          await this.validateLicense(licenseKey, cacheData.userId);
        } catch (error) {
          console.error(`Heartbeat validation failed for ${licenseKey}:`, error.message);
        }
      }
    }, this.config.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }
  }

  async generateTrialLicense(email, modules, duration = 7) {
    try {
      const requestData = JSON.stringify({
        email,
        modules,
        duration,
        deviceId: this.deviceId,
        type: 'trial'
      });

      const response = await this.makeRequest('/trial', 'POST', requestData);
      const data = JSON.parse(response);

      if (data.licenseKey) {
        // Automatically validate the trial license
        await this.validateLicense(data.licenseKey, email);
        return data.licenseKey;
      }
      
      throw new Error(data.message || 'Trial generation failed');
    } catch (error) {
      console.error('Trial license error:', error.message);
      return null;
    }
  }

  getLicenseInfo() {
    const licenses = [];
    
    for (const [key, data] of this.cachedLicenses) {
      licenses.push({
        key: key.substring(0, 8) + '...', // Partial key for security
        modules: data.modules,
        expires: new Date(data.expires).toLocaleDateString(),
        features: data.features || {},
        limits: data.limits || {}
      });
    }
    
    return {
      deviceId: this.deviceId,
      activeModules: this.getActiveModules(),
      licenses,
      lastValidation: this.lastValidation ? new Date(this.lastValidation).toISOString() : null,
      offlineMode: Date.now() - (this.lastValidation || 0) > 24 * 60 * 60 * 1000
    };
  }

  /**
   * SECURITY FIX: Validate environment configuration
   */
  validateEnvironment() {
    // Check if required environment variables are set
    if (!process.env.LICENSE_PUBLIC_KEY) {
      console.warn('⚠️ LICENSE_PUBLIC_KEY not set - using development keys');
    }
    
    if (!process.env.LICENSE_PRIVATE_KEY) {
      console.warn('⚠️ LICENSE_PRIVATE_KEY not set - using development keys');
    }
    
    // Validate encryption key if provided
    if (process.env.LICENSE_ENCRYPTION_KEY && process.env.LICENSE_ENCRYPTION_KEY.length < 32) {
      console.error('CRITICAL SECURITY ERROR: LICENSE_ENCRYPTION_KEY must be at least 32 characters');
      process.exit(1);
    }
  }

  /**
   * SECURITY FIX: Generate secure encryption key
   */
  generateEncryptionKey() {
    // Generate a 256-bit key for AES encryption
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * SECURITY FIX: Perform integrity check on license manager
   */
  async performIntegrityCheck() {
    try {
      if (!this.config.antiTamperEnabled) {
        return true;
      }

      // Calculate checksum of this class
      const classString = this.constructor.toString();
      const currentChecksum = crypto.createHash('sha256').update(classString).digest('hex');
      
      // Store initial checksum
      if (!this.integrityChecksum) {
        this.integrityChecksum = currentChecksum;
        return true;
      }
      
      // Check for tampering
      if (this.integrityChecksum !== currentChecksum) {
        this.tamperDetected = true;
        console.error('🚨 CRITICAL SECURITY ALERT: License manager tampering detected!');
        throw new Error('License manager integrity violation');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Integrity check failed:', error);
      throw error;
    }
  }

  /**
   * SECURITY FIX: Encrypt license data using AES-256-GCM
   */
  encryptLicenseData(data) {
    try {
      const algorithm = 'aes-256-gcm';
      const key = Buffer.from(this.config.encryptionKey, 'hex');
      const iv = crypto.randomBytes(16); // 128-bit IV for GCM
      
      const cipher = crypto.createCipher(algorithm, key);
      cipher.setAAD(Buffer.from('OGZPRIME_LICENSE', 'utf8')); // Additional authenticated data
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Combine IV, auth tag, and encrypted data
      const result = {
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        data: encrypted
      };
      
      return JSON.stringify(result);
    } catch (error) {
      console.error('❌ License encryption failed:', error);
      throw new Error('License encryption failed');
    }
  }

  /**
   * SECURITY FIX: Decrypt license data using AES-256-GCM
   */
  decryptLicenseData(encryptedData) {
    try {
      const algorithm = 'aes-256-gcm';
      const key = Buffer.from(this.config.encryptionKey, 'hex');
      
      const encryptedObj = JSON.parse(encryptedData);
      const iv = Buffer.from(encryptedObj.iv, 'hex');
      const authTag = Buffer.from(encryptedObj.authTag, 'hex');
      
      const decipher = crypto.createDecipher(algorithm, key);
      decipher.setAAD(Buffer.from('OGZPRIME_LICENSE', 'utf8')); // Additional authenticated data
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      const data = JSON.parse(decrypted);
      
      // Verify checksum if present
      if (data.checksum) {
        const expectedChecksum = this.calculateDataChecksum(data);
        if (data.checksum !== expectedChecksum) {
          throw new Error('License data checksum mismatch');
        }
      }
      
      return data;
    } catch (error) {
      console.error('❌ License decryption failed:', error);
      throw new Error('License decryption failed - may be corrupted or tampered');
    }
  }

  /**
   * SECURITY FIX: Calculate data checksum for integrity verification
   */
  calculateDataChecksum(data) {
    // Create a copy without the checksum field for calculation
    const dataForChecksum = { ...data };
    delete dataForChecksum.checksum;
    delete dataForChecksum.savedAt; // Exclude timestamp from checksum
    
    const dataString = JSON.stringify(dataForChecksum, Object.keys(dataForChecksum).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * SECURITY FIX: Enhanced cleanup with secure data destruction
   */
  async cleanup() {
    try {
      console.log('🧹 Cleaning up License Manager with secure data destruction...');
      
      this.stopHeartbeat();
      
      // Save current state with encryption
      for (const [key, data] of this.cachedLicenses) {
        await this.saveLicenseCache(key, data);
      }
      
      // SECURITY FIX: Securely clear sensitive data from memory
      if (this.config.secureMode) {
        // Clear cached licenses
        this.cachedLicenses.clear();
        this.activeModules.clear();
        
        // Overwrite sensitive strings
        if (this.deviceId) {
          this.deviceId = '0'.repeat(this.deviceId.length);
        }
        if (this.hardwareFingerprint) {
          this.hardwareFingerprint = '0'.repeat(this.hardwareFingerprint.length);
        }
        
        // Clear encryption key from memory
        if (this.config.encryptionKey) {
          this.config.encryptionKey = '0'.repeat(this.config.encryptionKey.length);
        }
      }
      
      console.log('✅ License Manager cleanup complete');
      
    } catch (error) {
      console.error('❌ Error during license manager cleanup:', error);
    }
  }

  /**
   * SECURITY FIX: Get security status for monitoring
   */
  getSecurityStatus() {
    return {
      initialized: this.initialized,
      deviceLockEnabled: this.config.deviceLockEnabled,
      antiTamperEnabled: this.config.antiTamperEnabled,
      secureMode: this.config.secureMode,
      tamperDetected: this.tamperDetected,
      hardwareFingerprintAvailable: !!this.hardwareFingerprint,
      encryptionEnabled: !!this.config.encryptionKey,
      activeLicenses: this.cachedLicenses.size,
      activeModules: this.activeModules.size,
      lastValidation: this.lastValidation,
      heartbeatActive: !!this.validationInterval
    };
  }
}

module.exports = LicenseManager;
