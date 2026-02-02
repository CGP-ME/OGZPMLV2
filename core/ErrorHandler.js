/**
 * @fileoverview ErrorHandler - Centralized Error Management with Circuit Breaker
 *
 * Provides circuit breaker pattern, error escalation, and recovery mechanisms.
 * Prevents cascading failures and enables proper debugging of trading errors.
 *
 * @description
 * ARCHITECTURE ROLE:
 * ErrorHandler sits between all trading components and provides fault tolerance.
 * When a module experiences repeated failures, the circuit breaker trips to
 * prevent further damage while allowing time for recovery.
 *
 * CIRCUIT BREAKER PATTERN:
 * ```
 * Normal → (5 errors) → OPEN (blocking) → (60s) → Half-Open → (success) → Normal
 *                                                           → (failure) → OPEN
 * ```
 *
 * ERROR LEVELS:
 * - CRITICAL: Execution failures, position errors (trips circuit breaker)
 * - WARNING: Non-fatal issues, logged but continue operation
 * - INFO: Debugging information, no action needed
 *
 * @module core/ErrorHandler
 *
 * @example
 * const ErrorHandler = require('./core/ErrorHandler');
 * const errorHandler = new ErrorHandler({
 *   maxErrorsBeforeCircuitBreak: 5,
 *   circuitBreakResetMs: 60000  // 1 minute cooldown
 * });
 *
 * // Report critical error
 * const result = errorHandler.reportCritical('ExecutionLayer', error, { orderId });
 * if (result.circuitActive) {
 *   console.log('Circuit breaker tripped - pausing module');
 * }
 *
 * // Check before operation
 * if (errorHandler.isCircuitBreakerActive('ExecutionLayer')) {
 *   return; // Skip operation, circuit is open
 * }
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
      return {
        blocked: true,
        circuitActive: true,
        errorCount: this.errorCounts.get(moduleName),
        message: msg
      };
    }

    return {
      blocked: false,
      moduleName,
      errorCount: this.errorCounts.get(moduleName),
      circuitActive: false
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
