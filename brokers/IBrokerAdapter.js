/**
 * ============================================================================
 * IBrokerAdapter - Universal Broker Interface
 * ============================================================================
 * 
 * ALL broker adapters must implement this interface.
 * This ensures any asset type (crypto, stocks, options, forex, futures)
 * can be traded with the same bot logic.
 * 
 * EMPIRE V2 FOUNDATION
 * 
 * @author OGZPrime Team
 * @version 2.0.0
 * ============================================================================
 */

const EventEmitter = require('events');

class IBrokerAdapter extends EventEmitter {
    constructor() {
        super();
        if (new.target === IBrokerAdapter) {
            throw new Error('IBrokerAdapter is an interface - extend it, don\'t instantiate it');
        }
    }

    // =========================================================================
    // CONNECTION MANAGEMENT
    // =========================================================================

    /**
     * Connect to the broker
     * @returns {Promise<boolean>} Success status
     */
    async connect() {
        throw new Error('connect() must be implemented');
    }

    /**
     * Disconnect from the broker
     * @returns {Promise<void>}
     */
    async disconnect() {
        throw new Error('disconnect() must be implemented');
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        throw new Error('isConnected() must be implemented');
    }

    // =========================================================================
    // ACCOUNT + ORDERS
    // =========================================================================

    /**
     * Get account balance
     * @returns {Promise<Object>} { currency: amount, ... }
     */
    async getBalance() {
        throw new Error('getBalance() must be implemented');
    }

    /**
     * Get open positions
     * @returns {Promise<Array>} [{ symbol, size, entryPrice, currentPrice, pnl }, ...]
     */
    async getPositions() {
        throw new Error('getPositions() must be implemented');
    }

    /**
     * Get open orders
     * @returns {Promise<Array>} [{ orderId, symbol, type, side, price, amount, status }, ...]
     */
    async getOpenOrders() {
        throw new Error('getOpenOrders() must be implemented');
    }

    /**
     * Place an order
     * @param {Object} order - Universal order object { symbol, side, amount, price, type, ... }
     * @returns {Promise<Object>} { orderId, status, ... }
     */
    async placeOrder(order) {
        throw new Error('placeOrder() must be implemented');
    }

    /**
     * Cancel an order
     * @param {string} orderId - Order ID to cancel
     * @returns {Promise<boolean>} Success status
     */
    async cancelOrder(orderId) {
        throw new Error('cancelOrder() must be implemented');
    }

    // =========================================================================
    // MARKET DATA
    // =========================================================================

    /**
     * Get current ticker/price
     * @param {string} symbol - Trading pair/symbol
     * @returns {Promise<Object>} { bid, ask, last, volume, ... }
     */
    async getTicker(symbol) {
        throw new Error('getTicker() must be implemented');
    }

    /**
     * Get order book
     * @param {string} symbol - Trading pair/symbol
     * @param {number} depth - Number of levels
     * @returns {Promise<Object>} { bids: [[price, amount], ...], asks: [[price, amount], ...] }
     */
    async getOrderBook(symbol, depth = 10) {
        throw new Error('getOrderBook() must be implemented');
    }

    /**
     * Get OHLCV candles
     * @param {string} symbol - Trading pair/symbol
     * @param {string} timeframe - '1m', '5m', '15m', '1h', '4h', '1d'
     * @param {number} limit - Number of candles
     * @returns {Promise<Array>} [{ o, h, l, c, v, t }, ...]
     */
    async getCandles(symbol, timeframe = '1m', limit = 100) {
        throw new Error('getCandles() must be implemented');
    }

    // =========================================================================
    // METADATA
    // =========================================================================

    /**
     * Get the asset type this broker handles
     * @returns {string} 'crypto' | 'stocks' | 'options' | 'forex' | 'futures'
     */
    getAssetType() {
        throw new Error('getAssetType() must be implemented');
    }

    /**
     * Get broker name/identifier
     * @returns {string} e.g., 'kraken', 'binance', etc.
     */
    getBrokerName() {
        throw new Error('getBrokerName() must be implemented');
    }

    /**
     * Get supported symbols/pairs
     * @returns {Promise<Array>} ['BTC/USD', 'ETH/USD', ...]
     */
    async getSupportedSymbols() {
        throw new Error('getSupportedSymbols() must be implemented');
    }

    /**
     * Get minimum order size for a symbol
     * @param {string} symbol 
     * @returns {number}
     */
    getMinOrderSize(symbol) {
        throw new Error('getMinOrderSize() must be implemented');
    }

    /**
     * Get trading fees
     * @returns {Object} { maker: 0.001, taker: 0.002 }
     */
    getFees() {
        throw new Error('getFees() must be implemented');
    }

    /**
     * Check if symbol is tradeable right now
     * @param {string} symbol 
     * @returns {boolean}
     */
    isTradeableNow(symbol) {
        throw new Error('isTradeableNow() must be implemented');
    }

    // =========================================================================
    // SYMBOL NORMALIZATION (Override if needed)
    // =========================================================================

    /**
     * Convert universal symbol to broker-specific format
     * @param {string} symbol - Universal format (e.g., 'BTC/USD')
     * @returns {string} Broker format (e.g., 'XBTUSD' for Kraken)
     */
    toBrokerSymbol(symbol) {
        return symbol; // Default: no conversion
    }

    /**
     * Convert broker-specific symbol to universal format
     * @param {string} brokerSymbol - Broker format
     * @returns {string} Universal format
     */
    fromBrokerSymbol(brokerSymbol) {
        return brokerSymbol; // Default: no conversion
    }
}

module.exports = IBrokerAdapter;
