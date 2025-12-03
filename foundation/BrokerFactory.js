/**
 * ============================================================================
 * BrokerFactory - Universal Broker Instantiation
 * ============================================================================
 * 
 * Factory pattern for creating broker instances.
 * Supports all asset types with a unified interface.
 * 
 * EMPIRE V2 FOUNDATION
 * 
 * Usage:
 *   const broker = BrokerFactory.create('kraken', { apiKey: '...', apiSecret: '...' });
 *   const broker = BrokerFactory.create('tdameritrade', { clientId: '...', refreshToken: '...' });
 * 
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

class BrokerFactory {
    constructor() {
        // Registry of available brokers
        this.registry = new Map();
        
        // Register default brokers
        this.registerDefaults();
    }

    /**
     * Register default broker adapters
     */
    registerDefaults() {
        // Crypto brokers
        this.register('kraken', {
            assetType: 'crypto',
            loader: () => this.loadBroker('specialized/crypto-bot/brokers/KrakenAdapter'),
            fallback: () => this.loadBroker('core/KrakenAdapter') // Current location
        });
        
        this.register('coinbase', {
            assetType: 'crypto',
            loader: () => this.loadBroker('specialized/crypto-bot/brokers/CoinbaseAdapter')
        });
        
        this.register('binance', {
            assetType: 'crypto',
            loader: () => this.loadBroker('specialized/crypto-bot/brokers/BinanceAdapter')
        });

        // Stock brokers
        this.register('tdameritrade', {
            assetType: 'stocks',
            loader: () => this.loadBroker('specialized/stocks-bot/brokers/TDAmeritradeAdapter')
        });
        
        this.register('schwab', {
            assetType: 'stocks',
            loader: () => this.loadBroker('specialized/stocks-bot/brokers/SchwabAdapter')
        });
        
        this.register('fidelity', {
            assetType: 'stocks',
            loader: () => this.loadBroker('specialized/stocks-bot/brokers/FidelityAdapter')
        });
        
        this.register('interactivebrokers', {
            assetType: 'stocks',
            loader: () => this.loadBroker('specialized/stocks-bot/brokers/InteractiveBrokersAdapter')
        });

        // Options brokers
        this.register('tastyworks', {
            assetType: 'options',
            loader: () => this.loadBroker('specialized/options-bot/brokers/TastyworksAdapter')
        });

        // Forex brokers
        this.register('oanda', {
            assetType: 'forex',
            loader: () => this.loadBroker('specialized/forex-bot/brokers/OandaAdapter')
        });
        
        this.register('fxcm', {
            assetType: 'forex',
            loader: () => this.loadBroker('specialized/forex-bot/brokers/FXCMAdapter')
        });

        // Futures brokers
        this.register('cme', {
            assetType: 'futures',
            loader: () => this.loadBroker('specialized/futures-bot/brokers/CMEAdapter')
        });
        
        this.register('ice', {
            assetType: 'futures',
            loader: () => this.loadBroker('specialized/futures-bot/brokers/ICEAdapter')
        });

        console.log(`📦 BrokerFactory initialized with ${this.registry.size} brokers`);
    }

    /**
     * Register a new broker type
     * @param {string} brokerName - Broker identifier
     * @param {Object} options - { assetType, loader, fallback }
     */
    register(brokerName, options) {
        this.registry.set(brokerName.toLowerCase(), options);
    }

    /**
     * Load a broker module dynamically
     * @param {string} path - Module path
     * @returns {Class|null} Broker class or null
     */
    loadBroker(path) {
        try {
            return require(`../${path}`);
        } catch (e) {
            try {
                return require(`./${path}`);
            } catch (e2) {
                return null;
            }
        }
    }

    /**
     * Create a broker instance
     * @param {string} brokerName - Broker identifier (e.g., 'kraken', 'tdameritrade')
     * @param {Object} config - Broker-specific configuration
     * @returns {IBrokerAdapter} Broker instance
     */
    create(brokerName, config = {}) {
        const normalizedName = brokerName.toLowerCase();
        const registration = this.registry.get(normalizedName);

        if (!registration) {
            throw new Error(`Unknown broker: ${brokerName}. Available: ${this.getAvailableBrokers().join(', ')}`);
        }

        // Try to load the broker class
        let BrokerClass = registration.loader();
        
        // Try fallback if main loader fails
        if (!BrokerClass && registration.fallback) {
            BrokerClass = registration.fallback();
        }

        if (!BrokerClass) {
            throw new Error(`Broker adapter not implemented: ${brokerName}. Create ${normalizedName} adapter first.`);
        }

        // Create instance
        const broker = new BrokerClass(config);
        
        console.log(`🔌 Created ${brokerName} broker (${registration.assetType})`);
        
        return broker;
    }

    /**
     * Check if a broker is available
     * @param {string} brokerName 
     * @returns {boolean}
     */
    isAvailable(brokerName) {
        const registration = this.registry.get(brokerName.toLowerCase());
        if (!registration) return false;

        const BrokerClass = registration.loader() || (registration.fallback && registration.fallback());
        return !!BrokerClass;
    }

    /**
     * Get list of all registered brokers
     * @returns {Array<string>}
     */
    getAvailableBrokers() {
        return Array.from(this.registry.keys());
    }

    /**
     * Get brokers for a specific asset type
     * @param {string} assetType 
     * @returns {Array<string>}
     */
    getBrokersForAssetType(assetType) {
        const brokers = [];
        for (const [name, options] of this.registry.entries()) {
            if (options.assetType === assetType) {
                brokers.push(name);
            }
        }
        return brokers;
    }

    /**
     * Get asset type for a broker
     * @param {string} brokerName 
     * @returns {string|null}
     */
    getAssetType(brokerName) {
        const registration = this.registry.get(brokerName.toLowerCase());
        return registration?.assetType || null;
    }

    /**
     * Get broker info
     * @param {string} brokerName 
     * @returns {Object}
     */
    getBrokerInfo(brokerName) {
        const registration = this.registry.get(brokerName.toLowerCase());
        if (!registration) return null;

        return {
            name: brokerName,
            assetType: registration.assetType,
            implemented: this.isAvailable(brokerName)
        };
    }

    /**
     * Get all broker info
     * @returns {Array<Object>}
     */
    getAllBrokerInfo() {
        return this.getAvailableBrokers().map(name => this.getBrokerInfo(name));
    }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance
 * @returns {BrokerFactory}
 */
BrokerFactory.getInstance = function() {
    if (!instance) {
        instance = new BrokerFactory();
    }
    return instance;
};

/**
 * Static create method for convenience
 * @param {string} brokerName 
 * @param {Object} config 
 * @returns {IBrokerAdapter}
 */
BrokerFactory.create = function(brokerName, config) {
    return BrokerFactory.getInstance().create(brokerName, config);
};

/**
 * Static method to check availability
 * @param {string} brokerName 
 * @returns {boolean}
 */
BrokerFactory.isAvailable = function(brokerName) {
    return BrokerFactory.getInstance().isAvailable(brokerName);
};

module.exports = BrokerFactory;
