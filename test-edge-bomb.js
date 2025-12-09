
const TradingBrain = require('./core/OptimizedTradingBrain');
const brain = new TradingBrain();

try {
    const signal = brain.analyzeMarket({
        price: NaN,
        volume: 100,
        timestamp: Date.now()
    });

    if (!signal || typeof signal.confidence !== 'number') {
        console.error('Invalid signal returned');
        process.exit(1);
    }
} catch (error) {
    console.error('Failed on edge case:', error);
    process.exit(1);
}
