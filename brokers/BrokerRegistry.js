/**
 * ============================================================================
 * BrokerRegistry - Master Broker Implementation Registry
 * ============================================================================
 * 
 * Maps all available broker adapters with metadata
 * 
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

const BrokerRegistry = {
    // =========================================================================
    // CRYPTO BROKERS
    // =========================================================================
    
    kraken: {
        name: 'Kraken',
        assetType: 'crypto',
        filePath: './KrakenIBrokerAdapter',  // Uses IBroker-compliant wrapper
        description: 'Spot crypto trading, high liquidity',
        features: ['spot', 'margin', 'staking'],
        supported: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD'],
        fees: { maker: 0.0016, taker: 0.0026 },
        timeframe: 'realtime'
    },

    coinbase: {
        name: 'Coinbase',
        assetType: 'crypto',
        filePath: './CoinbaseAdapter',
        description: 'Spot crypto with 100+ pairs',
        features: ['spot', 'advanced-orders'],
        supported: ['BTC/USD', 'ETH/USD', 'SOL/USD'],
        fees: { maker: 0.004, taker: 0.006 },
        timeframe: 'realtime'
    },

    binance: {
        name: 'Binance',
        assetType: 'crypto',
        filePath: './BinanceAdapter',
        description: 'Largest crypto exchange - spot & futures',
        features: ['spot', 'margin', 'futures', 'options'],
        supported: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'],
        fees: { maker: 0.001, taker: 0.001 },
        timeframe: 'realtime'
    },

    gemini: {
        name: 'Gemini',
        assetType: 'crypto',
        filePath: './GeminiAdapter',
        description: 'US-regulated crypto exchange with sandbox mode',
        features: ['spot', 'advanced-orders', 'sandbox'],
        supported: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'LINK/USD', 'AAVE/USD'],
        fees: { maker: 0.001, taker: 0.0035 },
        timeframe: 'realtime'
    },

    // =========================================================================
    // STOCK BROKERS
    // =========================================================================

    interactivebrokers: {
        name: 'Interactive Brokers',
        assetType: 'stocks',
        filePath: './InteractiveBrokersAdapter',
        description: 'Full market access: stocks, options, futures, forex',
        features: ['stocks', 'options', 'futures', 'forex', 'bonds'],
        supported: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'],
        fees: { perShare: 0.001, minimum: 1 },
        timeframe: '930-1600 EST'
    },

    tdameritrade: {
        name: 'TD Ameritrade',
        assetType: 'stocks',
        filePath: './TDAmeritradeAdapter',  // TODO: Create
        description: 'Popular US stock broker',
        features: ['stocks', 'options', 'margin'],
        supported: ['AAPL', 'GOOGL', 'MSFT'],
        fees: { commission: 0 },
        timeframe: '930-1600 EST'
    },

    schwab: {
        name: 'Schwab',
        assetType: 'stocks',
        filePath: './SchwabAdapter',  // TODO: Create
        description: 'Commission-free stock trading',
        features: ['stocks', 'etf', 'options'],
        supported: ['AAPL', 'GOOGL', 'MSFT'],
        fees: { commission: 0 },
        timeframe: '930-1600 EST'
    },

    fidelity: {
        name: 'Fidelity',
        assetType: 'stocks',
        filePath: './FidelityAdapter',  // TODO: Create
        description: 'Full-service stock broker',
        features: ['stocks', 'options', 'bonds'],
        supported: ['AAPL', 'GOOGL', 'MSFT'],
        fees: { commission: 0 },
        timeframe: '930-1600 EST'
    },

    // =========================================================================
    // OPTIONS BROKERS
    // =========================================================================

    tastyworks: {
        name: 'Tastyworks',
        assetType: 'options',
        filePath: './TastyworksAdapter',
        description: 'Options-focused broker with advanced tools',
        features: ['options', 'spreads', 'iron-condors', 'stocks'],
        supported: ['SPY', 'QQQ', 'AAPL', 'TSLA'],
        fees: { perContract: 0.65 },
        timeframe: '930-1600 EST'
    },

    // =========================================================================
    // FOREX BROKERS
    // =========================================================================

    oanda: {
        name: 'OANDA',
        assetType: 'forex',
        filePath: './OandaAdapter',
        description: 'Forex and CFD trading with tight spreads',
        features: ['forex', 'cfd', 'commodities', 'indices'],
        supported: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
        fees: { spread: 0.0002 },
        timeframe: '24/5'
    },

    fxcm: {
        name: 'FXCM',
        assetType: 'forex',
        filePath: './FXCMAdapter',  // TODO: Create
        description: 'Forex and CFD broker',
        features: ['forex', 'cfd'],
        supported: ['EUR/USD', 'GBP/USD'],
        fees: { spread: 0.0003 },
        timeframe: '24/5'
    },

    // =========================================================================
    // FUTURES BROKERS
    // =========================================================================

    cme: {
        name: 'CME (Chicago Mercantile Exchange)',
        assetType: 'futures',
        filePath: './CMEAdapter',
        description: 'E-mini S&P 500, Nasdaq, oil, gold futures',
        features: ['futures', 'options-on-futures'],
        supported: ['ES', 'NQ', 'CL', 'GC', 'SI'],
        fees: { perContract: 2.25 },
        timeframe: '24/5 Globex'
    },

    ice: {
        name: 'ICE',
        assetType: 'futures',
        filePath: './ICEAdapter',  // TODO: Create
        description: 'Energy, metals, agriculture futures',
        features: ['futures', 'options-on-futures'],
        supported: ['BRN', 'RBOB', 'SB', 'CT'],
        fees: { perContract: 2.5 },
        timeframe: '24/5'
    },

    // =========================================================================
    // SPECIALIZED
    // =========================================================================

    bybit: {
        name: 'Bybit',
        assetType: 'crypto',
        filePath: './BinanceAdapter',  // Can reuse - compatible API
        description: 'Crypto derivatives exchange',
        features: ['perpetuals', 'options'],
        supported: ['BTC/USDT', 'ETH/USDT'],
        fees: { maker: 0.0001, taker: 0.0002 },
        timeframe: 'realtime'
    },

    deribit: {
        name: 'Deribit',
        assetType: 'crypto',
        filePath: './DeribitAdapter',  // TODO: Create
        description: 'Crypto options specialist',
        features: ['options', 'perpetuals'],
        supported: ['BTC', 'ETH'],
        fees: { maker: 0.0005, taker: 0.0005 },
        timeframe: 'realtime'
    }
};

/**
 * Get all brokers
 */
function getAllBrokers() {
    return Object.entries(BrokerRegistry).map(([key, value]) => ({
        id: key,
        ...value
    }));
}

/**
 * Get brokers by asset type
 */
function getBrokersByAssetType(assetType) {
    return Object.entries(BrokerRegistry)
        .filter(([_, broker]) => broker.assetType === assetType)
        .map(([key, value]) => ({
            id: key,
            ...value
        }));
}

/**
 * Get broker info
 */
function getBrokerInfo(brokerName) {
    const broker = BrokerRegistry[brokerName.toLowerCase()];
    if (!broker) {
        return null;
    }
    return {
        id: brokerName.toLowerCase(),
        ...broker
    };
}

/**
 * Check if adapter file exists and is implemented
 */
const path = require('path');

function isImplemented(brokerName) {
    const broker = BrokerRegistry[brokerName.toLowerCase()];
    if (!broker) return false;

    try {
        const resolved = path.resolve(__dirname, broker.filePath);
        require(resolved);
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    BrokerRegistry,
    getAllBrokers,
    getBrokersByAssetType,
    getBrokerInfo,
    isImplemented
};
