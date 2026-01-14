/**
 * ============================================================================
 * InteractiveBrokersAdapter - Universal Broker Adapter for Interactive Brokers
 * ============================================================================
 * 
 * Implements IBrokerAdapter for Interactive Brokers (IBKR)
 * Supports: Stocks, Options, Futures, Forex, Bonds
 * 
 * NOTE: Requires IBGateway or TWS running locally on port 7497
 * 
 * @author OGZPrime Team
 * @version 1.0.0
 * ============================================================================
 */

const IBrokerAdapter = require('../foundation/IBrokerAdapter');
const axios = require('axios');

class InteractiveBrokersAdapter extends IBrokerAdapter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.baseUrl = config.baseUrl || 'http://localhost:5000';  // IB Gateway REST API
        this.accountId = config.accountId;
        this.connected = false;
        this.nextOrderId = 1;
        this.accountSummary = {};
    }

    // =========================================================================
    // CONNECTION MANAGEMENT
    // =========================================================================

    async connect() {
        try {
            // Check if IB Gateway is running
            const status = await this._apiCall('GET', '/iserver/account');
            if (status) {
                this.connected = true;
                // Get account ID if not provided
                if (!this.accountId) {
                    const accounts = await this._apiCall('GET', '/iserver/accounts');
                    if (accounts && accounts.length > 0) {
                        this.accountId = accounts[0].accountId;
                    }
                }
                console.log('✅ Interactive Brokers adapter connected');
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Interactive Brokers connection failed:', error.message);
            return false;
        }
    }

    async disconnect() {
        this.connected = false;
        console.log('🔌 Interactive Brokers adapter disconnected');
        return true;
    }

    isConnected() {
        return this.connected;
    }

    // =========================================================================
    // API HELPERS
    // =========================================================================

    async _apiCall(method, endpoint, data = null) {
        try {
            const config = {
                method,
                url: this.baseUrl + endpoint,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                config.data = data;
            }

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`API Call failed [${method} ${endpoint}]:`, error.message);
            throw error;
        }
    }

    // =========================================================================
    // ACCOUNT INFO
    // =========================================================================

    async getBalance() {
        try {
            const accounts = await this._apiCall('GET', '/iserver/accounts');
            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
            }

            const accountId = this.accountId || accounts[0].accountId;
            const summary = await this._apiCall('GET', `/iserver/account/${accountId}/summary`);

            const balances = {
                USD: parseFloat(summary.totalcashvalue?.value || 0),
                equity: parseFloat(summary.equity?.value || 0),
                buyingPower: parseFloat(summary.buyingpower?.value || 0)
            };

            return balances;
        } catch (error) {
            throw new Error(`Failed to get balance: ${error.message}`);
        }
    }

    async getPositions() {
        try {
            const accountId = this.accountId;
            const response = await this._apiCall('GET', `/iserver/account/${accountId}/portfolio/positions`);

            return response.map(pos => ({
                symbol: pos.contractDesc,
                size: pos.position,
                side: pos.position > 0 ? 'long' : 'short',
                entryPrice: pos.avgPrice || null,
                currentPrice: pos.mktPrice || null,
                pnl: pos.unrealizedPnl || null,
                contractId: pos.conid
            }));
        } catch (error) {
            throw new Error(`Failed to get positions: ${error.message}`);
        }
    }

    async getOpenOrders() {
        try {
            const response = await this._apiCall('GET', '/iserver/orders');

            return response.orders.map(order => ({
                orderId: order.id,
                symbol: order.acctId,
                type: order.orderType,
                side: order.side,
                price: parseFloat(order.price),
                amount: parseFloat(order.quantity),
                status: order.status
            }));
        } catch (error) {
            throw new Error(`Failed to get open orders: ${error.message}`);
        }
    }

    // =========================================================================
    // ORDER MANAGEMENT
    // =========================================================================

    async placeOrder(order) {
        const { symbol, side, amount, price, type, options = {} } = order;

        try {
            // First, resolve the contract for the symbol
            const contracts = await this._apiCall('GET', `/iserver/secdef/search?symbol=${symbol}`);
            if (!contracts || contracts.length === 0) {
                throw new Error(`Symbol not found: ${symbol}`);
            }

            const contractId = contracts[0].conid;

            // Build order
            const order = {
                acctId: this.accountId,
                conid: contractId,
                orderType: price ? 'LMT' : 'MKT',
                side: side,
                quantity: amount.toString(),
                tif: 'GTC'  // Good Till Cancel
            };

            if (price) {
                order.price = price.toString();
            }

            if (options.stopLoss) {
                order.auxPrice = options.stopLoss.toString();
                order.orderType = 'STP';
            }

            if (options.takeProfit) {
                // Would require bracket order - simplified here
                console.warn('⚠️ Take profit orders require bracket orders');
            }

            // Place the order
            const response = await this._apiCall('POST', '/iserver/orders', { orders: [order] });

            return {
                orderId: response.orders?.[0]?.id || 'pending',
                status: 'pending',
                symbol: symbol,
                side: side,
                price: price,
                amount: amount
            };
        } catch (error) {
            throw new Error(`Failed to place order: ${error.message}`);
        }
    }

    async cancelOrder(orderId) {
        try {
            await this._apiCall('DELETE', `/iserver/orders/${orderId}`);
            return true;
        } catch (error) {
            console.error(`Failed to cancel order: ${error.message}`);
            return false;
        }
    }

    async modifyOrder(orderId, modifications) {
        try {
            await this._apiCall('PUT', `/iserver/orders/${orderId}`, modifications);
            return { orderId, ...modifications };
        } catch (error) {
            throw new Error(`Failed to modify order: ${error.message}`);
        }
    }

    async getOrderStatus(orderId) {
        try {
            const response = await this._apiCall('GET', `/iserver/orders/${orderId}`);
            
            return {
                orderId: response.id,
                status: response.status,
                filledAmount: parseFloat(response.filledQuantity || 0),
                remainingAmount: parseFloat(response.quantity) - parseFloat(response.filledQuantity || 0)
            };
        } catch (error) {
            throw new Error(`Failed to get order status: ${error.message}`);
        }
    }

    // =========================================================================
    // MARKET DATA
    // =========================================================================

    async getTicker(symbol) {
        try {
            const contracts = await this._apiCall('GET', `/iserver/secdef/search?symbol=${symbol}`);
            if (!contracts || contracts.length === 0) {
                throw new Error(`Symbol not found: ${symbol}`);
            }

            const contractId = contracts[0].conid;
            const response = await this._apiCall('GET', `/iserver/marketdata/${contractId}`);

            return {
                bid: parseFloat(response.bid || 0),
                ask: parseFloat(response.ask || 0),
                last: parseFloat(response.last || 0),
                volume: parseFloat(response.volume || 0)
            };
        } catch (error) {
            throw new Error(`Failed to get ticker: ${error.message}`);
        }
    }

    async getCandles(symbol, timeframe = '1m', limit = 100) {
        try {
            const contracts = await this._apiCall('GET', `/iserver/secdef/search?symbol=${symbol}`);
            if (!contracts || contracts.length === 0) {
                throw new Error(`Symbol not found: ${symbol}`);
            }

            const contractId = contracts[0].conid;
            const barrierType = this._timeframeToBarrier(timeframe);

            const response = await this._apiCall('GET', 
                `/iserver/marketdata/${contractId}/hist?bar=${barrierType}&outsideRth=true`
            );

            if (!response.data) {
                return [];
            }

            return response.data.map(candle => ({
                t: candle[0] / 1000,
                o: candle[1],
                h: candle[2],
                l: candle[3],
                c: candle[4],
                v: candle[5]
            }));
        } catch (error) {
            throw new Error(`Failed to get candles: ${error.message}`);
        }
    }

    async getOrderBook(symbol, depth = 20) {
        try {
            const contracts = await this._apiCall('GET', `/iserver/secdef/search?symbol=${symbol}`);
            if (!contracts || contracts.length === 0) {
                throw new Error(`Symbol not found: ${symbol}`);
            }

            const contractId = contracts[0].conid;
            const response = await this._apiCall('GET', `/iserver/marketdata/${contractId}/book`);

            return {
                bids: response.bid?.map(b => [b.price, b.size]) || [],
                asks: response.ask?.map(a => [a.price, a.size]) || []
            };
        } catch (error) {
            throw new Error(`Failed to get order book: ${error.message}`);
        }
    }

    // =========================================================================
    // REAL-TIME SUBSCRIPTIONS
    // =========================================================================

    subscribeToTicker(symbol, callback) {
        // IB Gateway REST API doesn't have WebSocket subscriptions
        // Implement polling instead
        this._startPolling(symbol, 'ticker', callback);
    }

    subscribeToCandles(symbol, timeframe, callback) {
        this._startPolling(symbol, `candles-${timeframe}`, callback);
    }

    subscribeToOrderBook(symbol, callback) {
        this._startPolling(symbol, 'orderbook', callback);
    }

    subscribeToAccount(callback) {
        this._startPolling(null, 'account', callback);
    }

    unsubscribeAll() {
        this._stopPolling();
    }

    _pollingIntervals = new Map();

    _startPolling(symbol, type, callback) {
        const key = `${symbol}-${type}`;
        
        if (this._pollingIntervals.has(key)) {
            clearInterval(this._pollingIntervals.get(key));
        }

        const interval = setInterval(async () => {
            try {
                if (type === 'ticker') {
                    const data = await this.getTicker(symbol);
                    callback({ ...data, symbol });
                } else if (type.startsWith('candles')) {
                    const timeframe = type.split('-')[1];
                    const data = await this.getCandles(symbol, timeframe, 1);
                    if (data.length > 0) callback(data[0]);
                } else if (type === 'orderbook') {
                    const data = await this.getOrderBook(symbol);
                    callback(data);
                } else if (type === 'account') {
                    const balance = await this.getBalance();
                    callback(balance);
                }
            } catch (error) {
                console.error(`Polling error for ${key}:`, error.message);
            }
        }, 1000);  // Poll every second

        this._pollingIntervals.set(key, interval);
    }

    _stopPolling() {
        for (const interval of this._pollingIntervals.values()) {
            clearInterval(interval);
        }
        this._pollingIntervals.clear();
    }

    // =========================================================================
    // ASSET INFORMATION
    // =========================================================================

    getAssetType() {
        return 'stocks';  // Primary, but supports options, futures, forex
    }

    getBrokerName() {
        return 'interactivebrokers';
    }

    async getSupportedSymbols() {
        // IB supports thousands of symbols - would need to fetch from their master list
        // For now, return common symbols
        return [
            'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'NVDA', 'META', 'SPY', 'QQQ'
        ];
    }

    getMinOrderSize(symbol) {
        return 1;  // 1 share minimum
    }

    getFees() {
        return {
            maker: 0.001,
            taker: 0.001,
            fixed: 1  // $1 per order
        };
    }

    isTradeableNow(symbol) {
        // Check US market hours (simplified)
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const day = now.getDay();

        // Monday-Friday, 9:30 AM - 4:00 PM EST
        if (day === 0 || day === 6) return false;
        const time = hours * 100 + minutes;
        return time >= 930 && time < 1600;
    }

    // =========================================================================
    // SYMBOL NORMALIZATION
    // =========================================================================

    _toBrokerSymbol(symbol) {
        return symbol.toUpperCase();
    }

    fromBrokerSymbol(brokerSymbol) {
        return brokerSymbol;
    }

    _timeframeToBarrier(timeframe) {
        const map = {
            '1m': '1min',
            '5m': '5min',
            '15m': '15min',
            '1h': '1h',
            '4h': '4h',
            '1d': '1d'
        };
        return map[timeframe] || '1min';
    }
}

module.exports = InteractiveBrokersAdapter;
