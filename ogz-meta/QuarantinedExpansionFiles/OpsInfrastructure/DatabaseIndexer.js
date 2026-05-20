// 📁 FILE: core/DatabaseIndexer.js
class DatabaseIndexer {
  constructor(patternMemoryPath) {
    this.indexPath = patternMemoryPath.replace('.json', '_index.json');
    this.indices = {
      byWinRate: {},
      byFrequency: {},
      byRecency: {},
      byProfitability: {}
    };
  }
  
  async buildIndices(patterns) {
    console.log('🔨 Building pattern indices...');
    
    Object.entries(patterns).forEach(([key, pattern]) => {
      // Win rate index
      const winRate = pattern.wins / (pattern.timesSeen || 1);
      const winRateBucket = Math.floor(winRate * 10) / 10; // 0.1 buckets
      if (!this.indices.byWinRate[winRateBucket]) {
        this.indices.byWinRate[winRateBucket] = [];
      }
      this.indices.byWinRate[winRateBucket].push(key);
      
      // Frequency index
      const freqBucket = Math.floor(pattern.timesSeen / 10) * 10; // 10s buckets
      if (!this.indices.byFrequency[freqBucket]) {
        this.indices.byFrequency[freqBucket] = [];
      }
      this.indices.byFrequency[freqBucket].push(key);
      
      // Recency index
      if (pattern.results && pattern.results.length > 0) {
        const lastSeen = pattern.results[pattern.results.length - 1].timestamp;
        const daysSince = Math.floor((Date.now() - lastSeen) / (24 * 60 * 60 * 1000));
        if (!this.indices.byRecency[daysSince]) {
          this.indices.byRecency[daysSince] = [];
        }
        this.indices.byRecency[daysSince].push(key);
      }
      
      // Profitability index
      const avgProfit = pattern.totalPnL / (pattern.timesSeen || 1);
      const profitBucket = Math.floor(avgProfit / 10) * 10; // $10 buckets
      if (!this.indices.byProfitability[profitBucket]) {
        this.indices.byProfitability[profitBucket] = [];
      }
      this.indices.byProfitability[profitBucket].push(key);
    });
    
    // Save indices
    await this.saveIndices();
    
    console.log('✅ Indices built successfully');
    return this.indices;
  }
  
  async queryPatterns(criteria) {
    // Fast lookups using indices
    let candidates = new Set();
    
    if (criteria.minWinRate) {
      for (let rate = criteria.minWinRate; rate <= 1; rate += 0.1) {
        const bucket = Math.floor(rate * 10) / 10;
        if (this.indices.byWinRate[bucket]) {
          this.indices.byWinRate[bucket].forEach(key => candidates.add(key));
        }
      }
    }
    
    if (criteria.minFrequency) {
      for (let freq = criteria.minFrequency; freq <= 1000; freq += 10) {
        const bucket = Math.floor(freq / 10) * 10;
        if (this.indices.byFrequency[bucket]) {
          this.indices.byFrequency[bucket].forEach(key => candidates.add(key));
        }
      }
    }
    
    return Array.from(candidates);
  }
}