/**
 * ERROR HANDLER - Centralized Error Management
 * 
 * Provides circuit breaker pattern, error escalation, and recovery mechanisms
 * Prevents silent failures and enables proper debugging
 */

class ErrorHandler {
  constructor(config = {}) {
    this.config = {
      maxErrorsBeforeCircuitBreak: config.maxErrorsBeforeCircuitBreak || 5,
      circuitBreakResetMs: config.circuitBreakResetMs || 60000, // 1 minute
      enableLogging: config.enableLogging !== false,
      ...config
    };

    // Error tracking
    this.errorCounts = new Map(); // Module -> error count
    this.circuitBreakers = new Map(); // Module -> circuit state
    this.lastErrors = new Map(); // Module -> last error details
  }

  /**
   * Report a critical error with proper escalation
   */
  reportCritical(moduleName, error, context = {}) {
    if (this.config.enableLogging) {
      console.error(`\n❌ [CRITICAL] ${moduleName} Error:`);
      console.error(`   Message: ${error.message}`);
      console.error(`   Context: ${JSON.stringify(context)}`);
      console.error(`   Stack: ${error.stack}`);
    }

    this.incrementErrorCount(moduleName);
    this.lastErrors.set(moduleName, { error, context, timestamp: Date.now() });

    // Check circuit breaker
    if (this.isCircuitBreakerActive(moduleName)) {
      const msg = `Circuit breaker active for ${moduleName}. Too many errors.`;
      if (this.config.enableLogging) console.error(`🛑 ${msg}`);
      throw new Error(msg);
    }

    return {
      moduleName,
      errorCount: this.errorCounts.get(moduleName),
      circuitActive: this.isCircuitBreakerActive(moduleName)
    };
  }

  /**
   * Report a warning-level error that can continue
   */
  reportWarning(moduleName, error, context = {}) {
    if (this.config.enableLogging) {
      console.warn(`⚠️ [WARNING] ${moduleName}: ${error.message}`);
    }
    this.lastErrors.set(moduleName, { error, context, timestamp: Date.now() });
  }

  /**
   * Increment error count for a module
   */
  incrementErrorCount(moduleName) {
    const current = this.errorCounts.get(moduleName) || 0;
    const newCount = current + 1;
    this.errorCounts.set(moduleName, newCount);

    if (this.config.enableLogging && newCount % 2 === 0) {
      console.warn(`⚠️ ${moduleName} error count: ${newCount}/${this.config.maxErrorsBeforeCircuitBreak}`);
    }
  }

  /**
   * Check if circuit breaker is active for a module
   */
  isCircuitBreakerActive(moduleName) {
    const errorCount = this.errorCounts.get(moduleName) || 0;
    return errorCount > this.config.maxErrorsBeforeCircuitBreak;
  }

  /**
   * Reset error count for a module (manual recovery)
   */
  resetErrorCount(moduleName) {
    this.errorCounts.delete(moduleName);
    this.circuitBreakers.delete(moduleName);
    if (this.config.enableLogging) {
      console.log(`✅ Error count reset for ${moduleName}`);
    }
  }

  /**
   * Get error statistics
   */
  getStats() {
    return {
      totalModulesWithErrors: this.errorCounts.size,
      errors: Array.from(this.errorCounts.entries()).map(([module, count]) => ({
        module,
        count,
        circuitActive: this.isCircuitBreakerActive(module),
        lastError: this.lastErrors.get(module)
      }))
    };
  }

  /**
   * Get last error for a module
   */
  getLastError(moduleName) {
    return this.lastErrors.get(moduleName);
  }
}

module.exports = ErrorHandler;
