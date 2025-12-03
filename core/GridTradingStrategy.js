/**
 * GRID TRADING STRATEGY MODULE
 * Implements grid bot functionality for OGZPrime
 * Places buy/sell orders at fixed price intervals
 * Perfect for sideways/ranging markets
 */

class GridTradingStrategy {
    constructor(config = {}) {
        // Grid configuration
        this.gridLevels = config.gridLevels || 10;              // Number of grid levels
        this.gridSpacing = config.gridSpacing || 0.002;         // 0.2% spacing between levels
        this.orderSize = config.orderSize || 100;               // Size per grid order in USD
        this.upperBound = config.upperBound || null;            // Upper price bound
        this.lowerBound = config.lowerBound || null;            // Lower price bound
        this.autoRange = config.autoRange !== false;           // Auto-detect range from ATR

        // Grid state
        this.gridOrders = new Map();                            // Active grid orders
        this.centerPrice = null;                                // Grid center price
        this.lastUpdateTime = Date.now();
        this.totalProfit = 0;
        this.completedTrades = 0;

        // Performance tracking
        this.gridStats = {
            buysTriggered: 0,
            sellsTriggered: 0,
            profitPerGrid: [],
            averageHoldTime: 0,
            gridEfficiency: 0
        };

        console.log('🎯 Grid Trading Strategy initialized');
        console.log(`   📊 Grid Levels: ${this.gridLevels}`);
        console.log(`   📏 Grid Spacing: ${(this.gridSpacing * 100).toFixed(2)}%`);
        console.log(`   💰 Order Size: $${this.orderSize}`);
    }

    /**
     * Initialize grid based on current market conditions
     */
    initializeGrid(currentPrice, indicators = {}) {
        this.centerPrice = currentPrice;

        // Auto-detect range if enabled
        if (this.autoRange && indicators.atr) {
            const atrPercent = (indicators.atr / currentPrice) * 100;

            // Set bounds based on ATR (2x ATR for range)
            this.upperBound = currentPrice * (1 + (atrPercent * 2) / 100);
            this.lowerBound = currentPrice * (1 - (atrPercent * 2) / 100);

            console.log(`📊 Auto-range detected from ATR:`);
            console.log(`   Upper: $${this.upperBound.toFixed(2)}`);
            console.log(`   Lower: $${this.lowerBound.toFixed(2)}`);
        } else if (!this.upperBound || !this.lowerBound) {
            // Default range if not specified
            this.upperBound = currentPrice * (1 + this.gridSpacing * this.gridLevels / 2);
            this.lowerBound = currentPrice * (1 - this.gridSpacing * this.gridLevels / 2);
        }

        // Calculate actual grid spacing based on bounds
        const range = this.upperBound - this.lowerBound;
        const actualSpacing = range / this.gridLevels;

        // Clear existing orders
        this.gridOrders.clear();

        // Create grid levels
        for (let i = 0; i < this.gridLevels; i++) {
            const price = this.lowerBound + (actualSpacing * i);
            const orderId = `grid_${Date.now()}_${i}`;

            // Determine order type based on position relative to current price
            const orderType = price < currentPrice ? 'BUY' : 'SELL';

            this.gridOrders.set(orderId, {
                id: orderId,
                price: price,
                type: orderType,
                size: this.orderSize,
                status: 'PENDING',
                level: i,
                createdAt: Date.now()
            });
        }

        console.log(`\n🎯 GRID INITIALIZED:`);
        console.log(`   📊 ${this.gridLevels} levels from $${this.lowerBound.toFixed(2)} to $${this.upperBound.toFixed(2)}`);
        console.log(`   💰 Total capital allocated: $${this.orderSize * this.gridLevels}`);
        console.log(`   📈 ${this.getActiveOrders('BUY').length} buy orders below $${currentPrice.toFixed(2)}`);
        console.log(`   📉 ${this.getActiveOrders('SELL').length} sell orders above $${currentPrice.toFixed(2)}`);

        return this.gridOrders;
    }

    /**
     * Update grid based on new price - check for triggered orders
     */
    updateGrid(currentPrice, currentPosition = 0) {
        const triggeredOrders = [];
        const now = Date.now();

        // Check each grid order
        for (const [orderId, order] of this.gridOrders) {
            if (order.status !== 'PENDING') continue;

            // Check if order should trigger
            const shouldTrigger =
                (order.type === 'BUY' && currentPrice <= order.price) ||
                (order.type === 'SELL' && currentPrice >= order.price);

            if (shouldTrigger) {
                // Mark as triggered
                order.status = 'TRIGGERED';
                order.triggeredAt = now;
                order.triggeredPrice = currentPrice;

                triggeredOrders.push(order);

                // Update stats
                if (order.type === 'BUY') {
                    this.gridStats.buysTriggered++;
                } else {
                    this.gridStats.sellsTriggered++;
                }

                console.log(`\n🎯 GRID ORDER TRIGGERED:`);
                console.log(`   ${order.type === 'BUY' ? '📈' : '📉'} ${order.type} at $${currentPrice.toFixed(2)}`);
                console.log(`   Grid Level: ${order.level}/${this.gridLevels}`);
                console.log(`   Target: $${order.price.toFixed(2)}`);
            }
        }

        // Recreate triggered orders on opposite side
        for (const triggered of triggeredOrders) {
            this.recreateOppositeOrder(triggered, currentPrice);
        }

        // Calculate grid efficiency
        this.updateGridEfficiency(currentPrice);

        return triggeredOrders;
    }

    /**
     * Recreate order on opposite side after execution
     */
    recreateOppositeOrder(executedOrder, currentPrice) {
        const newOrderId = `grid_${Date.now()}_${executedOrder.level}`;
        const oppositeType = executedOrder.type === 'BUY' ? 'SELL' : 'BUY';

        // Calculate profit target (1 grid spacing away)
        const profitTarget = executedOrder.type === 'BUY'
            ? executedOrder.price * (1 + this.gridSpacing)
            : executedOrder.price * (1 - this.gridSpacing);

        // Create new order
        const newOrder = {
            id: newOrderId,
            price: profitTarget,
            type: oppositeType,
            size: this.orderSize,
            status: 'PENDING',
            level: executedOrder.level,
            createdAt: Date.now(),
            parentOrder: executedOrder.id
        };

        this.gridOrders.set(newOrderId, newOrder);

        // Remove old order
        this.gridOrders.delete(executedOrder.id);

        // Calculate and record profit if this was a round trip
        if (executedOrder.parentOrder) {
            const profit = Math.abs(profitTarget - executedOrder.price) * (this.orderSize / executedOrder.price);
            this.totalProfit += profit;
            this.completedTrades++;
            this.gridStats.profitPerGrid.push(profit);

            console.log(`   💰 Grid profit: $${profit.toFixed(2)} (Total: $${this.totalProfit.toFixed(2)})`);
        }
    }

    /**
     * Get grid trading signal
     */
    getGridSignal(currentPrice, indicators = {}) {
        // Initialize grid if needed
        if (!this.centerPrice || this.gridOrders.size === 0) {
            this.initializeGrid(currentPrice, indicators);
        }

        // Check for triggered orders
        const triggeredOrders = this.updateGrid(currentPrice);

        // Return first triggered order as signal
        if (triggeredOrders.length > 0) {
            const order = triggeredOrders[0];
            return {
                action: order.type,
                confidence: 0.95,  // Grid orders have high confidence
                size: order.size,
                reason: `Grid level ${order.level} triggered at $${currentPrice.toFixed(2)}`,
                gridStats: this.getStats()
            };
        }

        // Check if grid needs rebalancing
        if (this.needsRebalancing(currentPrice)) {
            console.log('🔄 Grid needs rebalancing');
            this.initializeGrid(currentPrice, indicators);
        }

        return {
            action: 'HOLD',
            confidence: 0,
            reason: 'Waiting for grid levels',
            gridStats: this.getStats()
        };
    }

    /**
     * Check if grid needs rebalancing
     */
    needsRebalancing(currentPrice) {
        // Rebalance if price moves outside grid bounds
        if (currentPrice > this.upperBound || currentPrice < this.lowerBound) {
            return true;
        }

        // Rebalance if too many orders on one side
        const buyOrders = this.getActiveOrders('BUY').length;
        const sellOrders = this.getActiveOrders('SELL').length;
        const imbalance = Math.abs(buyOrders - sellOrders) / this.gridLevels;

        return imbalance > 0.7;  // 70% imbalance threshold
    }

    /**
     * Update grid efficiency metrics
     */
    updateGridEfficiency(currentPrice) {
        const activeOrders = Array.from(this.gridOrders.values())
            .filter(o => o.status === 'PENDING');

        if (activeOrders.length === 0) {
            this.gridStats.gridEfficiency = 0;
            return;
        }

        // Calculate how well distributed orders are around current price
        const distances = activeOrders.map(o => Math.abs(o.price - currentPrice));
        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        const idealDistance = (this.upperBound - this.lowerBound) / (this.gridLevels * 2);

        this.gridStats.gridEfficiency = Math.max(0, Math.min(100,
            (1 - Math.abs(avgDistance - idealDistance) / idealDistance) * 100
        ));
    }

    /**
     * Get active orders by type
     */
    getActiveOrders(type = null) {
        const orders = Array.from(this.gridOrders.values())
            .filter(o => o.status === 'PENDING');

        if (type) {
            return orders.filter(o => o.type === type);
        }

        return orders;
    }

    /**
     * Get grid statistics
     */
    getStats() {
        const avgProfit = this.gridStats.profitPerGrid.length > 0
            ? this.gridStats.profitPerGrid.reduce((a, b) => a + b, 0) / this.gridStats.profitPerGrid.length
            : 0;

        return {
            totalProfit: this.totalProfit,
            completedTrades: this.completedTrades,
            buysTriggered: this.gridStats.buysTriggered,
            sellsTriggered: this.gridStats.sellsTriggered,
            averageProfit: avgProfit,
            gridEfficiency: this.gridStats.gridEfficiency,
            activeOrders: this.getActiveOrders().length,
            buyOrders: this.getActiveOrders('BUY').length,
            sellOrders: this.getActiveOrders('SELL').length
        };
    }

    /**
     * Export grid state for persistence
     */
    exportState() {
        return {
            gridOrders: Array.from(this.gridOrders.entries()),
            centerPrice: this.centerPrice,
            upperBound: this.upperBound,
            lowerBound: this.lowerBound,
            totalProfit: this.totalProfit,
            completedTrades: this.completedTrades,
            gridStats: this.gridStats
        };
    }

    /**
     * Import saved grid state
     */
    importState(state) {
        if (state.gridOrders) {
            this.gridOrders = new Map(state.gridOrders);
        }
        this.centerPrice = state.centerPrice || null;
        this.upperBound = state.upperBound || null;
        this.lowerBound = state.lowerBound || null;
        this.totalProfit = state.totalProfit || 0;
        this.completedTrades = state.completedTrades || 0;
        this.gridStats = state.gridStats || this.gridStats;
    }
}

module.exports = GridTradingStrategy;