// core/SingletonLock.js - CRITICAL SAFETY SYSTEM
// Prevents multiple bot instances from running simultaneously
// ADD THIS TO YOUR BOT STARTUP (run-trading-bot files)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const childProcess = require('child_process');

class OGZSingletonLock {
  constructor(botName = 'ogz-prime', options = {}) {
    this.botName = botName;
    // CHANGE: Use DATA_DIR for lock file if set (enables isolated testing instances)
    // This allows gates/test instances to run alongside main bot without conflict
    const lockDir = process.env.DATA_DIR || process.cwd();
    this.lockFile = path.join(lockDir, `.${botName}.lock`);
    this.pid = process.pid;
    this.startTime = Date.now();
    this.lockToken = crypto.randomBytes(16).toString('hex');
    this.onIntegrityFailure = typeof options.onIntegrityFailure === 'function'
      ? options.onIntegrityFailure
      : null;
    this.lockMonitorInterval = null;
    this.integrityFailureReported = false;
    this.lastAcquisitionFailure = null;
  }

  /**
   * Check if we should skip the lock (backtest/test mode)
   * Centralized here - not scattered in run-empire-v2.js
   */
  shouldSkipLock() {
    const isFileSource = process.env.CANDLE_SOURCE === 'file';
    const isBacktestMode = process.env.EXECUTION_MODE === 'backtest' ||
                           process.env.BACKTEST_MODE === 'true' ||
                           process.env.TEST_MODE === 'true';
    // Require BOTH: file source AND backtest mode
    return isFileSource && isBacktestMode;
  }

  /**
   * Acquire lock with full safety checks
   */
  acquireLock() {
    // Skip lock entirely for backtests (file source + backtest mode)
    if (this.shouldSkipLock()) {
      if (process.env.BACKTEST_SILENT !== 'true') {
        console.log(`🔓 [${this.botName}] Lock skipped (backtest mode)`);
      }
      return true;
    }

    console.log(`[${this.botName}] Attempting to acquire singleton lock...`);

    const lockData = {
      pid: this.pid,
      botName: this.botName,
      startTime: this.startTime,
      token: this.lockToken,
      hostname: os.hostname(),
      nodeVersion: process.version,
      platform: process.platform
    };

    const candidateFile = `${this.lockFile}.${this.pid}.${this.lockToken}.candidate`;
    const reclaimFile = `${this.lockFile}.reclaim-mutex`;
    let reclaimFd = null;
    let acquired = false;
    let failure = null;

    try {
      this.writeLockCandidate(candidateFile, lockData);
      acquired = this.publishLockCandidate(candidateFile);

      if (!acquired) {
        let observedLock = null;
        try {
          observedLock = this.readLockData();
        } catch (error) {
          if (error.code === 'ENOENT') {
            acquired = this.publishLockCandidate(candidateFile);
          } else {
            failure = `existing lock metadata is unreadable: ${error.message}`;
          }
        }

        if (!acquired && !failure && observedLock) {
          if (!this.hasValidLockIdentity(observedLock)) {
            failure = 'existing lock metadata has no valid owner identity';
          } else if (this.isProcessRunning(observedLock.pid)) {
            failure = `already owned by running PID ${observedLock.pid}`;
          } else {
            reclaimFd = this.claimStaleLock(reclaimFile);
            if (reclaimFd === null) {
              failure = 'another process is already reclaiming the stale owner';
            } else {
              let currentLock = null;
              try {
                currentLock = this.readLockData();
              } catch (error) {
                if (error.code !== 'ENOENT') {
                  failure = `lock changed during stale-owner recovery: ${error.message}`;
                }
              }

              if (!failure && currentLock) {
                if (!this.isSameLockIdentity(currentLock, observedLock)) {
                  failure = 'lock owner changed during stale-owner recovery';
                } else if (this.isProcessRunning(currentLock.pid)) {
                  failure = `lock owner PID ${currentLock.pid} became active during recovery`;
                } else {
                  fs.unlinkSync(this.lockFile);
                }
              }

              if (!failure) {
                acquired = this.publishLockCandidate(candidateFile);
                if (!acquired) {
                  failure = 'another process acquired the lock during stale-owner recovery';
                }
              }
            }
          }
        }
      }
    } catch (error) {
      failure = `exclusive lock creation failed: ${error.message}`;
    } finally {
      if (reclaimFd !== null) {
        this.releaseStaleClaim(reclaimFd);
      }
      this.removeCandidate(candidateFile);
    }

    if (!acquired || failure) {
      this.lastAcquisitionFailure = failure || 'ownership was not acquired';
      console.error(`[${this.botName}] Singleton lock acquisition failed: ${this.lastAcquisitionFailure}`);
      return false;
    }

    console.log(`[${this.botName}] Singleton lock acquired successfully`);
    console.log(`   PID: ${this.pid}`);
    console.log(`   Token: ${this.lockToken}`);
    console.log(`   Lock file: ${this.lockFile}`);

    // Verify lock integrity every 30 seconds
    this.startLockMonitoring();

    return true;
  }

  writeLockCandidate(candidateFile, lockData) {
    let fd = null;
    try {
      fd = fs.openSync(candidateFile, 'wx', 0o600);
      fs.writeFileSync(fd, `${JSON.stringify(lockData, null, 2)}\n`, 'utf8');
      fs.fsyncSync(fd);
    } catch (error) {
      try {
        if (fd !== null) fs.closeSync(fd);
      } finally {
        fd = null;
        this.removeCandidate(candidateFile);
      }
      throw error;
    } finally {
      if (fd !== null) fs.closeSync(fd);
    }
  }

  publishLockCandidate(candidateFile) {
    try {
      fs.linkSync(candidateFile, this.lockFile);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    }
  }

  removeCandidate(candidateFile) {
    try {
      fs.unlinkSync(candidateFile);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`[${this.botName}] Failed to remove lock candidate: ${error.message}`);
      }
    }
  }

  readLockData() {
    return JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
  }

  hasValidLockIdentity(lockData) {
    return Number.isInteger(lockData?.pid) &&
      lockData.pid > 0 &&
      Number.isFinite(lockData?.startTime) &&
      typeof lockData?.token === 'string' &&
      lockData.token.length > 0;
  }

  isSameLockIdentity(left, right) {
    return left?.pid === right?.pid &&
      left?.startTime === right?.startTime &&
      left?.token === right?.token;
  }

  claimStaleLock(reclaimFile) {
    let fd = null;
    try {
      fd = fs.openSync(reclaimFile, 'a+', 0o600);
      fs.fchmodSync(fd, 0o600);
      const result = childProcess.spawnSync('/usr/bin/flock', ['--nonblock', '3'], {
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'pipe', fd]
      });

      if (result.error) throw result.error;
      if (result.status === 0) return fd;

      fs.closeSync(fd);
      fd = null;
      return null;
    } catch (error) {
      if (fd !== null) fs.closeSync(fd);
      throw error;
    }
  }

  releaseStaleClaim(reclaimFd) {
    try {
      fs.closeSync(reclaimFd);
    } catch (error) {
      console.error(`[${this.botName}] Failed to release stale-owner mutex: ${error.message}`);
    }
  }

  /**
   * Check if a process is still running
   */
  isProcessRunning(pid) {
    try {
      // Process.kill with signal 0 just checks if process exists
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // ESRCH means process doesn't exist
      return error.code !== 'ESRCH';
    }
  }

  reportIntegrityFailure(code, message, cause = null) {
    if (this.integrityFailureReported) return false;
    this.integrityFailureReported = true;
    if (this.lockMonitorInterval) {
      clearInterval(this.lockMonitorInterval);
      this.lockMonitorInterval = null;
    }

    const error = cause instanceof Error ? cause : new Error(message);
    if (!error.code) error.code = code;
    error.lockCode = code;
    error.lockFile = this.lockFile;
    console.error(`[${this.botName}] ${message}`);

    if (!this.onIntegrityFailure) {
      console.error(`[${this.botName}] No singleton integrity-failure owner is installed`);
      return false;
    }

    try {
      const outcome = this.onIntegrityFailure(error);
      if (outcome && typeof outcome.catch === 'function') {
        outcome.catch((handlerError) => {
          console.error(`[${this.botName}] Integrity-failure owner rejected: ${handlerError.message}`);
        });
      }
      return true;
    } catch (handlerError) {
      console.error(`[${this.botName}] Integrity-failure owner threw: ${handlerError.message}`);
      return false;
    }
  }

  checkLockIntegrity() {
    try {
      if (!fs.existsSync(this.lockFile)) {
        return this.reportIntegrityFailure(
          'SINGLETON_LOCK_MISSING',
          'Singleton lock file disappeared while this process was running'
        );
      }

      const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
      if (lockData.token !== this.lockToken || lockData.pid !== this.pid) {
        return this.reportIntegrityFailure(
          'SINGLETON_LOCK_OWNERSHIP_CHANGED',
          'Singleton lock ownership changed while this process was running'
        );
      }
      return true;
    } catch (error) {
      return this.reportIntegrityFailure(
        'SINGLETON_LOCK_MONITOR_FAILED',
        `Singleton lock integrity check failed: ${error.message}`,
        error
      );
    }
  }

  /**
   * Monitor lock integrity
   */
  startLockMonitoring() {
    this.lockMonitorInterval = setInterval(() => {
      this.checkLockIntegrity();
    }, 30000);
  }

  /**
   * Release the lock
   */
  releaseLock() {
    // CHANGE 2026-01-29: Clear monitoring interval
    if (this.lockMonitorInterval) {
      clearInterval(this.lockMonitorInterval);
      this.lockMonitorInterval = null;
    }

    try {
      if (fs.existsSync(this.lockFile)) {
        const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));

        // Only remove if we own the lock
        if (lockData.pid === this.pid && lockData.token === this.lockToken) {
          fs.unlinkSync(this.lockFile);
          console.log(`[${this.botName}] Singleton lock released`);
          return true;
        } else {
          console.warn(`[${this.botName}] Lock file owned by different process - not removing`);
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Error releasing lock:`, error.message);
      return false;
    }
  }

  /**
   * Check if we hold the lock
   */
  hasLock() {
    try {
      if (!fs.existsSync(this.lockFile)) return false;
      
      const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
      return lockData.pid === this.pid && lockData.token === this.lockToken;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get lock status information
   */
  getLockStatus() {
    try {
      if (!fs.existsSync(this.lockFile)) {
        return { locked: false, message: 'No lock file exists' };
      }
      
      const lockData = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
      const isOwnLock = lockData.pid === this.pid && lockData.token === this.lockToken;
      
      return {
        locked: true,
        isOwnLock,
        data: lockData,
        message: isOwnLock ? 'Lock owned by this process' : 'Lock owned by another process'
      };
    } catch (error) {
      return { locked: false, error: error.message };
    }
  }
}

// ============================================================================
// ADDITIONAL SAFETY: PORT CHECKER
// ============================================================================

const net = require('net');

/**
 * Check if critical ports are available before starting
 */
async function checkCriticalPorts(ports = [3001, 3002, 3003, 3010]) {
  console.log('🔍 Checking critical ports availability...');
  
  for (const port of ports) {
    const inUse = await isPortInUse(port);
    if (inUse) {
      console.error(`
🚨 PORT ${port} ALREADY IN USE!
This likely means another bot instance is running.

Check what's using the port:
  Linux/Mac: lsof -i :${port}
  Windows: netstat -ano | findstr :${port}

Kill the process or use different ports.
      `);
      return false;
    }
  }
  
  console.log('✅ All critical ports available');
  return true;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      resolve(err.code === 'EADDRINUSE');
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    
    server.listen(port);
  });
}

// ============================================================================
// USAGE INTEGRATION
// ============================================================================

/**
 * Add this to the TOP of your bot files (run-trading-bot-*.js):
 * 
 * const { OGZSingletonLock, checkCriticalPorts } = require('./core/SingletonLock');
 * 
 * // At the very start of your bot
 * async function startBot() {
 *   // Create lock for this specific bot
 *   const lock = new OGZSingletonLock('valhalla-bot'); // or 'v13-bot'
 *   
 *   // Acquire lock (will exit if another instance running)
 *   lock.acquireLock();
 *   
 *   // Check ports
 *   const portsOk = await checkCriticalPorts([3001, 3002, 3003, 3010]);
 *   if (!portsOk) process.exit(1);
 *   
 *   // Now start your bot safely
 *   console.log('🚀 Starting bot with singleton protection...');
 *   // ... rest of your bot initialization
 * }
 */

module.exports = { 
  OGZSingletonLock, 
  checkCriticalPorts,
  isPortInUse
};
