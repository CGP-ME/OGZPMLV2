/**
 * @fileoverview Sentry Error Monitoring - MUST BE LOADED FIRST
 *
 * Initializes Sentry error tracking before any other code runs.
 * Catches all unhandled errors and sends them to Sentry dashboard.
 *
 * @description
 * CRITICAL: This file MUST be required at the very top of run-empire-v2.js
 * BEFORE any other imports. Sentry needs to instrument Node.js before
 * other modules are loaded to properly capture stack traces.
 *
 * WHAT GETS CAPTURED:
 * - Uncaught exceptions
 * - Unhandled promise rejections
 * - Manual Sentry.captureException() calls
 * - Performance traces (10% sampling)
 *
 * ENVIRONMENT TAGGING:
 * Errors are tagged with environment (paper/production) so you can
 * filter in the Sentry dashboard.
 *
 * DASHBOARD:
 * View errors at: https://sentry.io/organizations/ogzprime/
 *
 * @module instrument
 * @requires @sentry/node
 *
 * @example
 * // In run-empire-v2.js (MUST be first line):
 * require('./instrument.js');
 *
 * // Later, to manually capture an error:
 * const Sentry = require('./instrument.js');
 * Sentry.captureException(error);
 */

const Sentry = require("@sentry/node");
const { load: loadConfig } = require('./foundation/ConfigLoader');

const runtimeConfig = loadConfig({ silent: true, role: 'bot' }).config;
const sentryDsn = runtimeConfig.monitoring.sentryDsn;
const sentryEnabled = runtimeConfig.monitoring.sentryEnabled === true && Boolean(sentryDsn);

if (!sentryEnabled) {
  console.log('[SENTRY] Disabled or no DSN configured');
  module.exports = { captureException: () => {}, captureMessage: () => {} };
  return;
}

Sentry.init({
  dsn: sentryDsn,

  // Send default PII (IP addresses, etc) - useful for debugging
  sendDefaultPii: runtimeConfig.monitoring.sentrySendDefaultPii,

  // Environment tag - helps filter errors by mode
  environment: runtimeConfig.mode.execution,

  // Release version - helps track when bugs were introduced
  release: runtimeConfig.monitoring.sentryRelease,

  // Sample rate for performance monitoring (1.0 = 100%)
  tracesSampleRate: runtimeConfig.monitoring.sentryTracesSampleRate,
});

console.log('[SENTRY] Error monitoring initialized');

module.exports = Sentry;
