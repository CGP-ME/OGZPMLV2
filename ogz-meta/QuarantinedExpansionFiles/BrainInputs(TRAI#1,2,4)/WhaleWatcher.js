// WhaleWatcher.js - Track and mirror trades from institutional investors
// Follows public filings (13F, insider buys) from big players

const EventEmitter = require('events');

class WhaleWatcher extends EventEmitter {
  constructor() {
    super();
    
    // Whales to track
    this.whales = {
      'warren-buffett': {
        name: 'Warren Buffett',
        entity: 'Berkshire Hathaway',
        cik: '0001067983', // SEC CIK number
        priority: 10,
        allocation: 0.2 // 20% of whale pool
      },
      'cathie-wood': {
        name: 'Cathie Wood',
        entity: 'ARK Invest',
        priority: 8,
        allocation: 0.15,
        feeds: ['https://ark-invest.com/trades'] // Daily trade updates
      },
      'michael-burry': {
        name: 'Michael Burry',
        entity: 'Scion Asset Management',
        cik: '0001649339',
        priority: 7,
        allocation: 0.1
      },
      'nancy-pelosi': {
        name: 'Nancy Pelosi',
        entity: 'Congressional Disclosure',
        priority: 9,
        allocation: 0.15,
        source: 'house.gov/disclosures'
      },
      'bill-ackman': {
        name: 'Bill Ackman',
        entity: 'Pershing Square',
        cik: '0001336528',
        priority: 6,
        allocation: 0.1
      },
      'ray-dalio': {
        name: 'Ray Dalio',
        entity: 'Bridgewater Associates',
        cik: '0001350694',
        priority: 7,
        allocation: 0.1
      }
    };
    
    // User's whale pool settings
    this.whalePool = {
      enabled: false,
      totalAllocation: 0, // $ amount user wants to mirror
      activeWhales: new Set(),
      pendingTrades: [],
      executedTrades: new Map()
    };
    
    // Track recent filings
    this.recentFilings = new Map();
    this.lastCheckTime = Date.now();
    
    console.log('🐋 WHALE WATCHER INITIALIZED');
    console.log('📊 Tracking: Buffett, Cathie Wood, Pelosi, Burry, Ackman, Dalio');
  }
  
  /**
   * Enable whale following with allocated capital
   */
  enableWhalePool(amount, whaleList = []) {
    this.whalePool.enabled = true;
    this.whalePool.totalAllocation = amount;
    
    // If no specific whales, follow all high priority ones
    if (whaleList.length === 0) {
      whaleList = Object.keys(this.whales)
        .filter(w => this.whales[w].priority >= 7);
    }
    
    whaleList.forEach(whale => this.whalePool.activeWhales.add(whale));
    
    console.log(`🐋 WHALE POOL ACTIVATED`);
    console.log(`💰 Allocation: $${amount.toLocaleString()}`);
    console.log(`👁️ Following: ${Array.from(this.whalePool.activeWhales).join(', ')}`);
    
    // Start monitoring
    this.startMonitoring();
    
    return {
      enabled: true,
      amount,
      whales: Array.from(this.whalePool.activeWhales)
    };
  }
  
  /**
   * Process new whale trade alert
   */
  async processWhaleAlert(alert) {
    const { whale, action, symbol, shares, price, filing } = alert;
    
    if (!this.whalePool.activeWhales.has(whale)) {
      return null; // Not following this whale
    }
    
    const whaleConfig = this.whales[whale];
    const allocationAmount = this.whalePool.totalAllocation * whaleConfig.allocation;
    
    console.log(`\n🐋 WHALE ALERT: ${whaleConfig.name}`);
    console.log(`📈 ${action}: ${shares} shares of ${symbol} at $${price}`);
    console.log(`💼 Source: ${filing}`);
    
    // Calculate our mirror position
    const ourShares = Math.floor(allocationAmount / price);
    
    if (ourShares > 0) {
      const trade = {
        id: `whale_${Date.now()}`,
        whale: whale,
        whaleName: whaleConfig.name,
        action: action.toUpperCase(),
        symbol: symbol,
        shares: ourShares,
        price: price,
        totalValue: ourShares * price,
        originalShares: shares,
        filing: filing,
        timestamp: Date.now(),
        status: 'pending'
      };
      
      this.whalePool.pendingTrades.push(trade);
      
      // Emit for execution
      this.emit('whale-trade', trade);
      
      console.log(`🎯 MIRROR TRADE: ${action} ${ourShares} ${symbol} ($${trade.totalValue.toFixed(2)})`);
      
      return trade;
    }
    
    return null;
  }
  
  /**
   * Check for new 13F filings
   */
  async check13FFilings() {
    console.log('📋 Checking for new 13F filings...');
    
    // This would connect to SEC EDGAR API
    // For now, return mock data for testing
    const mockFilings = [
      {
        whale: 'warren-buffett',
        action: 'BUY',
        symbol: 'AAPL',
        shares: 1000000,
        price: 175.50,
        filing: '13F-Q4-2024'
      }
    ];
    
    for (const filing of mockFilings) {
      await this.processWhaleAlert(filing);
    }
  }
  
  /**
   * Check Congressional disclosures
   */
  async checkCongressionalDisclosures() {
    console.log('🏛️ Checking Congressional disclosures...');
    
    // Would scrape house.gov/disclosures
    // Pelosi's husband's trades are legendary
    
    const mockDisclosure = {
      whale: 'nancy-pelosi',
      action: 'BUY',
      symbol: 'NVDA',
      shares: 5000,
      price: 450.00,
      filing: 'House Periodic Transaction Report'
    };
    
    // Only process if recent (within 45 days as required by STOCK Act)
    await this.processWhaleAlert(mockDisclosure);
  }
  
  /**
   * Check ARK Invest daily trades
   */
  async checkARKTrades() {
    console.log('🚀 Checking ARK Invest daily trades...');
    
    // ARK publishes daily - this is gold!
    // Would fetch from ark-invest.com/trades
    
    const mockARKTrade = {
      whale: 'cathie-wood',
      action: 'BUY',
      symbol: 'TSLA',
      shares: 50000,
      price: 180.00,
      filing: 'ARK Daily Trade Update'
    };
    
    await this.processWhaleAlert(mockARKTrade);
  }
  
  /**
   * Start monitoring for whale trades
   */
  startMonitoring() {
    // Check different sources at different intervals
    
    // 13F filings (quarterly, check daily for new ones)
    this.filing13FInterval = setInterval(() => {
      this.check13FFilings();
    }, 24 * 60 * 60 * 1000); // Daily
    
    // Congressional (check twice daily)
    this.congressInterval = setInterval(() => {
      this.checkCongressionalDisclosures();
    }, 12 * 60 * 60 * 1000); // Twice daily
    
    // ARK trades (check every hour during market hours)
    this.arkInterval = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      if (hour >= 9 && hour <= 16) { // Market hours
        this.checkARKTrades();
      }
    }, 60 * 60 * 1000); // Hourly
    
    console.log('🔍 Whale monitoring active');
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring() {
    clearInterval(this.filing13FInterval);
    clearInterval(this.congressInterval);
    clearInterval(this.arkInterval);
    
    console.log('🔍 Whale monitoring stopped');
  }
  
  /**
   * Get whale pool status
   */
  getPoolStatus() {
    const executed = Array.from(this.whalePool.executedTrades.values());
    const totalInvested = executed.reduce((sum, t) => sum + t.totalValue, 0);
    const totalReturn = executed.reduce((sum, t) => sum + (t.currentValue - t.totalValue), 0);
    
    return {
      enabled: this.whalePool.enabled,
      allocation: this.whalePool.totalAllocation,
      invested: totalInvested,
      returns: totalReturn,
      returnPct: totalInvested > 0 ? (totalReturn / totalInvested * 100) : 0,
      activeWhales: Array.from(this.whalePool.activeWhales),
      pendingTrades: this.whalePool.pendingTrades.length,
      executedTrades: executed.length,
      topPerformer: this.getTopPerformer()
    };
  }
  
  /**
   * Get top performing whale
   */
  getTopPerformer() {
    const whalePerformance = new Map();
    
    this.whalePool.executedTrades.forEach(trade => {
      const current = whalePerformance.get(trade.whale) || { trades: 0, returns: 0 };
      current.trades++;
      current.returns += (trade.currentValue || trade.totalValue) - trade.totalValue;
      whalePerformance.set(trade.whale, current);
    });
    
    let topWhale = null;
    let topReturns = -Infinity;
    
    whalePerformance.forEach((perf, whale) => {
      if (perf.returns > topReturns) {
        topReturns = perf.returns;
        topWhale = whale;
      }
    });
    
    return topWhale ? {
      whale: this.whales[topWhale].name,
      returns: topReturns,
      trades: whalePerformance.get(topWhale).trades
    } : null;
  }
  
  /**
   * Execute a whale mirror trade
   */
  async executeTrade(trade) {
    console.log(`🐋 EXECUTING WHALE TRADE: ${trade.action} ${trade.shares} ${trade.symbol}`);
    
    // Mark as executed
    trade.status = 'executed';
    trade.executedAt = Date.now();
    
    this.whalePool.executedTrades.set(trade.id, trade);
    
    // Remove from pending
    const pendingIndex = this.whalePool.pendingTrades.findIndex(t => t.id === trade.id);
    if (pendingIndex > -1) {
      this.whalePool.pendingTrades.splice(pendingIndex, 1);
    }
    
    // Emit completion
    this.emit('trade-executed', trade);
    
    return trade;
  }
}

module.exports = WhaleWatcher;