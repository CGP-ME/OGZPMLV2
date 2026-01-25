// Sentry Error Monitoring - must be loaded FIRST before any other code
// This catches all unhandled errors and sends them to Sentry dashboard

const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://c9c25aed186f9ab079bf338bb4cb9df5@o4509868139085824.ingest.us.sentry.io/4509868141772800",

  // Send default PII (IP addresses, etc) - useful for debugging
  sendDefaultPii: true,

  // Environment tag - helps filter errors by mode
  environment: process.env.NODE_ENV || (process.env.PAPER_TRADING === 'true' ? 'paper' : 'production'),

  // Release version - helps track when bugs were introduced
  release: "ogzprime@2.0.0",

  // Sample rate for performance monitoring (1.0 = 100%)
  tracesSampleRate: 0.1,  // 10% of transactions for performance
});

console.log('🛡️ Sentry error monitoring initialized');

module.exports = Sentry;
