/**
 * ============================================================================
 * BrokerFactory - Dynamic Broker Adapter Creation
 * ============================================================================
 *
 * Creates broker adapters from the registry at runtime
 * This is the glue between the registry and actual implementation
 *
 * EMPIRE V2 FOUNDATION
 *
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

const path = require('path');
const { getBrokerInfo } = require('./BrokerRegistry');

/**
 * Create a broker adapter instance
 * @param {string} brokerId - Broker identifier from registry
 * @param {Object} options - Broker-specific options (API keys, etc.)
 * @returns {IBrokerAdapter} Configured broker adapter instance
 */
function createBrokerAdapter(brokerId, options = {}) {
  const info = getBrokerInfo(brokerId);
  if (!info) {
    throw new Error(`[BrokerFactory] Unknown broker: ${brokerId}`);
  }

  console.log(`🏭 [BrokerFactory] Creating adapter for ${info.name} (${info.assetType})`);

  // Resolve adapter path relative to /brokers directory
  const adapterPath = path.resolve(__dirname, info.filePath);

  try {
    const AdapterClass = require(adapterPath);

    // Create instance with options
    const adapter = new AdapterClass(options);

    // Sanity checks (fail fast if adapter doesn't implement interface)
    const requiredMethods = [
      'connect', 'disconnect', 'isConnected',
      'getBrokerName', 'getAssetType',
      'getBalance', 'getPositions',
      'placeBuyOrder', 'placeSellOrder'
    ];

    for (const method of requiredMethods) {
      if (typeof adapter[method] !== 'function') {
        throw new Error(`[BrokerFactory] ${brokerId} adapter missing required method: ${method}()`);
      }
    }

    console.log(`✅ [BrokerFactory] ${info.name} adapter created successfully`);
    return adapter;

  } catch (error) {
    console.error(`❌ [BrokerFactory] Failed to create ${brokerId} adapter:`, error.message);
    throw error;
  }
}

module.exports = { createBrokerAdapter };