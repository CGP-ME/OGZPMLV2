'use strict';
// Explicit synthetic configuration for these isolated unit suites. Does not load .env.
module.exports = function loadCanonicalTestSnapshot() {
  const ConfigLoader = require('../../foundation/ConfigLoader');
  const originalEnv = process.env;
  process.env = { ...originalEnv, PROFILE: 'paper', KRAKEN_API_KEY: 'test-kraken-key', KRAKEN_API_SECRET: 'test-kraken-secret', ALPACA_API_KEY: 'test-alpaca-key', ALPACA_API_SECRET: 'test-alpaca-secret', WEBSOCKET_AUTH_TOKEN: 'test-dashboard-token' };
  try { return ConfigLoader.load({ role: 'bot', loadDotenv: false, silent: true }); }
  finally { process.env = originalEnv; }
};
