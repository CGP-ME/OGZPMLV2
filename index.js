/**
 * ============================================================================
 * FOUNDATION INDEX - Empire V2 Core Exports
 * ============================================================================
 * 
 * Central export point for all foundation modules.
 * 
 * Usage:
 *   const { IBrokerAdapter, BrokerFactory, AssetConfigManager } = require('./foundation');
 * 
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

// Interfaces
const IBrokerAdapter = require('./interfaces/IBrokerAdapter');

// Config
const AssetConfigManager = require('./config/AssetConfigManager');

// Factories
const BrokerFactory = require('./factories/BrokerFactory');

module.exports = {
    // Interfaces
    IBrokerAdapter,
    
    // Config
    AssetConfigManager,
    
    // Factories
    BrokerFactory,
    
    // Convenience methods
    createBroker: BrokerFactory.create,
    getAssetConfig: (assetType) => AssetConfigManager.getInstance().getConfig(assetType)
};
