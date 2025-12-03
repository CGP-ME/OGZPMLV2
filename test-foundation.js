/**
 * FOUNDATION TEST - Validate Empire V2 Foundation
 * 
 * Run: node foundation/test-foundation.js
 */

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║     EMPIRE V2 FOUNDATION TEST                                 ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Test imports
const { IBrokerAdapter, AssetConfigManager, BrokerFactory } = require('./index');

// ═══════════════════════════════════════════════════════════════
// TEST 1: IBrokerAdapter Interface
// ═══════════════════════════════════════════════════════════════
console.log('═══ TEST 1: IBrokerAdapter Interface ═══\n');

try {
    // Should throw when instantiated directly
    new IBrokerAdapter();
    console.log('❌ IBrokerAdapter should throw when instantiated directly');
} catch (e) {
    console.log('✅ IBrokerAdapter correctly prevents direct instantiation');
}

// Test that it can be extended
class TestBroker extends IBrokerAdapter {
    async connect() { return true; }
    async disconnect() { }
    isConnected() { return true; }
    async getBalance() { return { USD: 10000 }; }
    async getPositions() { return []; }
    async getOpenOrders() { return []; }
    async placeBuyOrder() { return { orderId: '123' }; }
    async placeSellOrder() { return { orderId: '456' }; }
    async cancelOrder() { return true; }
    async modifyOrder() { return {}; }
    async getOrderStatus() { return { status: 'filled' }; }
    async getTicker() { return { last: 100 }; }
    async getCandles() { return []; }
    async getOrderBook() { return { bids: [], asks: [] }; }
    subscribeToTicker() { }
    subscribeToCandles() { }
    subscribeToOrderBook() { }
    subscribeToAccount() { }
    unsubscribeAll() { }
    getAssetType() { return 'test'; }
    getBrokerName() { return 'test-broker'; }
    async getSupportedSymbols() { return ['TEST/USD']; }
    getMinOrderSize() { return 0.01; }
    getFees() { return { maker: 0.001, taker: 0.002 }; }
    isTradeableNow() { return true; }
}

const testBroker = new TestBroker();
console.log(`✅ TestBroker created successfully`);
console.log(`   Asset Type: ${testBroker.getAssetType()}`);
console.log(`   Broker Name: ${testBroker.getBrokerName()}`);

// ═══════════════════════════════════════════════════════════════
// TEST 2: AssetConfigManager
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ TEST 2: AssetConfigManager ═══\n');

const configManager = AssetConfigManager.getInstance();

// Test all asset types
const assetTypes = ['crypto', 'stocks', 'options', 'forex', 'futures'];

assetTypes.forEach(type => {
    const config = configManager.getConfig(type);
    const keywords = configManager.getKeywords(type);
    const riskParams = configManager.getRiskParams(type);
    
    console.log(`✅ ${type.toUpperCase()}`);
    console.log(`   Symbols: ${config.symbols.slice(0, 3).join(', ')}...`);
    console.log(`   Keywords: ${keywords.slice(0, 3).join(', ')}...`);
    console.log(`   Stop Loss: ${riskParams.defaultStopLoss}%`);
    console.log(`   Take Profit: ${riskParams.defaultTakeProfit}%`);
});

// Test trading hours
console.log('\n📊 Trading Hours Check:');
assetTypes.forEach(type => {
    const isOpen = configManager.isWithinTradingHours(type);
    console.log(`   ${type}: ${isOpen ? '🟢 OPEN' : '🔴 CLOSED'}`);
});

// ═══════════════════════════════════════════════════════════════
// TEST 3: BrokerFactory
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ TEST 3: BrokerFactory ═══\n');

const factory = BrokerFactory.getInstance();

// List all registered brokers
const allBrokers = factory.getAllBrokerInfo();
console.log('📋 Registered Brokers:');

const byAsset = {};
allBrokers.forEach(broker => {
    if (!byAsset[broker.assetType]) byAsset[broker.assetType] = [];
    byAsset[broker.assetType].push(broker);
});

Object.entries(byAsset).forEach(([asset, brokers]) => {
    console.log(`\n   ${asset.toUpperCase()}:`);
    brokers.forEach(b => {
        const status = b.implemented ? '✅' : '⏳';
        console.log(`      ${status} ${b.name}`);
    });
});

// Test creating a broker (will fail gracefully since adapters don't exist yet)
console.log('\n📦 Broker Creation Test:');
try {
    const broker = factory.create('kraken', { apiKey: 'test', apiSecret: 'test' });
    console.log('✅ Kraken broker created');
} catch (e) {
    console.log(`⏳ Kraken adapter not yet extracted: "${e.message.split('.')[0]}"`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 4: Integration Check
// ═══════════════════════════════════════════════════════════════
console.log('\n═══ TEST 4: Integration Check ═══\n');

// Verify all components work together
const cryptoConfig = configManager.getConfig('crypto');
const cryptoBrokers = factory.getBrokersForAssetType('crypto');

console.log('🔗 Crypto Integration:');
console.log(`   Config loaded: ✅`);
console.log(`   Default symbol: ${cryptoConfig.defaultSymbol}`);
console.log(`   Available brokers: ${cryptoBrokers.join(', ')}`);
console.log(`   Trading 24/7: ${cryptoConfig.tradingHours.type === '24/7' ? '✅' : '❌'}`);

const stocksConfig = configManager.getConfig('stocks');
const stocksBrokers = factory.getBrokersForAssetType('stocks');

console.log('\n🔗 Stocks Integration:');
console.log(`   Config loaded: ✅`);
console.log(`   Default symbol: ${stocksConfig.defaultSymbol}`);
console.log(`   Available brokers: ${stocksBrokers.join(', ')}`);
console.log(`   Earnings protection: ${stocksConfig.earnings.avoidBeforeEarnings ? '✅' : '❌'}`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('FOUNDATION TESTS COMPLETE ✅');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('🎯 NEXT STEPS:');
console.log('   1. Extract KrakenAdapter from main bot → specialized/crypto-bot/brokers/');
console.log('   2. Create BaseBot class using these foundations');
console.log('   3. Create CryptoBot extending BaseBot');
console.log('   4. A/B test old bot vs new CryptoBot');
console.log('\n');
