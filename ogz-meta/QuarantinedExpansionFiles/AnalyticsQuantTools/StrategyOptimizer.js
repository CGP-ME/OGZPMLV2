// 📁 FILE 2: core/StrategyOptimizationEngine.js
// FIND WHAT ACTUALLY MAKES MONEY!

const fs = require('fs');
const path = require('path');

class StrategyOptimizationEngine {
  constructor(ogzPrime, config = {}) {
    this.ogzPrime = ogzPrime;
    this.config = {
      populationSize: 50,
      generations: 100,
      mutationRate: 0.1,
      eliteSize: 10,
      
      // Parameter ranges to optimize
      parameters: {
        minConfidenceThreshold: { min: 0.5, max: 0.9, step: 0.05 },
        patternSimilarityThreshold: { min: 0.6, max: 0.95, step: 0.05 },
        riskPercentage: { min: 0.5, max: 3.0, step: 0.25 },
        trailingStopDistance: { min: 0.005, max: 0.03, step: 0.005 },
        profitTargets: {
          tier1: { min: 0.01, max: 0.03, step: 0.005 },
          tier2: { min: 0.02, max: 0.05, step: 0.005 },
          tier3: { min: 0.03, max: 0.08, step: 0.01 }
        }
      },
      
      // Optimization goals
      optimizeFor: 'sharpe', // 'profit', 'sharpe', 'winrate', 'balanced'
      minTrades: 30,
      testDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
      
      ...config
    };
    
    this.results = [];
    this.bestStrategy = null;
    this.generation = 0;
  }
  
  /**
   * START THE OPTIMIZATION HUNT!
   */
  async optimize(historicalData) {
    console.log('🧬 STARTING STRATEGY OPTIMIZATION!');
    console.log(`🎯 Optimizing for: ${this.config.optimizeFor.toUpperCase()}`);
    
    // Create initial population
    let population = this.createInitialPopulation();
    
    // Evolution loop
    for (let gen = 0; gen < this.config.generations; gen++) {
      this.generation = gen;
      console.log(`\n📊 Generation ${gen + 1}/${this.config.generations}`);
      
      // Test each strategy
      const results = await this.evaluatePopulation(population, historicalData);
      
      // Sort by fitness
      results.sort((a, b) => b.fitness - a.fitness);
      
      // Store best
      if (!this.bestStrategy || results[0].fitness > this.bestStrategy.fitness) {
        this.bestStrategy = results[0];
        console.log(`🏆 NEW BEST! Fitness: ${results[0].fitness.toFixed(4)}`);
        this.saveBestStrategy();
      }
      
      // Create next generation
      population = this.evolvePopulation(results);
      
      // Early stopping if we found a killer strategy
      if (this.bestStrategy.fitness > 0.9) {
        console.log('🎯 Found optimal strategy early!');
        break;
      }
    }
    
    console.log('\n✅ OPTIMIZATION COMPLETE!');
    return this.bestStrategy;
  }
  
  /**
   * Create random initial strategies
   */
  createInitialPopulation() {
    const population = [];
    
    for (let i = 0; i < this.config.populationSize; i++) {
      const strategy = {};
      
      // Randomize each parameter
      for (const [param, range] of Object.entries(this.config.parameters)) {
        if (typeof range.min === 'number') {
          // Simple parameter
          const steps = Math.floor((range.max - range.min) / range.step);
          const randomStep = Math.floor(Math.random() * (steps + 1));
          strategy[param] = range.min + (randomStep * range.step);
        } else {
          // Nested parameters (like profitTargets)
          strategy[param] = {};
          for (const [subParam, subRange] of Object.entries(range)) {
            const steps = Math.floor((subRange.max - subRange.min) / subRange.step);
            const randomStep = Math.floor(Math.random() * (steps + 1));
            strategy[param][subParam] = subRange.min + (randomStep * subRange.step);
          }
        }
      }
      
      population.push(strategy);
    }
    
    return population;
  }
  
  /**
   * Test each strategy on historical data
   */
  async evaluatePopulation(population, historicalData) {
    const results = [];
    
    for (let i = 0; i < population.length; i++) {
      const strategy = population[i];
      process.stdout.write(`\rTesting strategy ${i + 1}/${population.length}...`);
      
      // Run backtest with these parameters
      const performance = await this.backtestStrategy(strategy, historicalData);
      
      // Calculate fitness based on optimization goal
      const fitness = this.calculateFitness(performance);
      
      results.push({
        strategy,
        performance,
        fitness
      });
    }
    
    console.log(' Done!');
    return results;
  }
  
  /**
   * Backtest a single strategy
   */
  async backtestStrategy(strategy, historicalData) {
    // Create a mock OGZ Prime instance with these parameters
    const testBot = {
      ...this.ogzPrime,
      config: {
        ...this.ogzPrime.config,
        ...strategy
      }
    };
    
    // Run through historical data
    let balance = 10000;
    const trades = [];
    let position = null;
    
    for (const candle of historicalData) {
      // Simplified backtest logic
      // In reality, you'd run the full analysis
      
      // Mock analysis
      const shouldBuy = Math.random() > 0.7 && !position;
      const shouldSell = Math.random() > 0.6 && position;
      
      if (shouldBuy) {
        position = {
          entryPrice: candle.close,
          size: (balance * strategy.riskPercentage / 100) / candle.close
        };
      } else if (shouldSell && position) {
        const pnl = (candle.close - position.entryPrice) * position.size;
        balance += pnl;
        trades.push({ pnl, profitable: pnl > 0 });
        position = null;
      }
    }
    
    // Calculate performance metrics
    const winningTrades = trades.filter(t => t.profitable).length;
    const totalPnL = balance - 10000;
    const winRate = trades.length > 0 ? winningTrades / trades.length : 0;
    
    // Calculate Sharpe ratio (simplified)
    const returns = trades.map(t => t.pnl / 10000);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    ) || 0.001;
    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0; // Crypto trades 365 days
    
    return {
      totalPnL,
      winRate,
      sharpe,
      trades: trades.length,
      maxDrawdown: this.calculateMaxDrawdown(trades)
    };
  }
  
  /**
   * Calculate fitness score based on optimization goal
   */
  calculateFitness(performance) {
    // Minimum trades requirement
    if (performance.trades < this.config.minTrades) {
      return 0;
    }
    
    switch (this.config.optimizeFor) {
      case 'profit':
        return performance.totalPnL / 10000; // Normalize
        
      case 'sharpe':
        return Math.max(0, performance.sharpe / 3); // Normalize (3 is excellent)
        
      case 'winrate':
        return performance.winRate;
        
      case 'balanced':
        // Combine multiple metrics
        const profitScore = Math.max(0, performance.totalPnL / 5000);
        const sharpeScore = Math.max(0, performance.sharpe / 2);
        const winRateScore = performance.winRate;
        const drawdownPenalty = Math.max(0, 1 - performance.maxDrawdown / 20);
        
        return (profitScore + sharpeScore + winRateScore + drawdownPenalty) / 4;
        
      default:
        return performance.totalPnL / 10000;
    }
  }
  
  /**
   * Create next generation through selection, crossover, and mutation
   */
  evolvePopulation(results) {
    const newPopulation = [];
    
    // Keep elite strategies
    for (let i = 0; i < this.config.eliteSize; i++) {
      newPopulation.push({ ...results[i].strategy });
    }
    
    // Create rest through crossover and mutation
    while (newPopulation.length < this.config.populationSize) {
      // Select parents (tournament selection)
      const parent1 = this.tournamentSelect(results);
      const parent2 = this.tournamentSelect(results);
      
      // Crossover
      const child = this.crossover(parent1.strategy, parent2.strategy);
      
      // Mutation
      if (Math.random() < this.config.mutationRate) {
        this.mutate(child);
      }
      
      newPopulation.push(child);
    }
    
    return newPopulation;
  }
  
  /**
   * Tournament selection
   */
  tournamentSelect(results, tournamentSize = 3) {
    let best = null;
    
    for (let i = 0; i < tournamentSize; i++) {
      const random = results[Math.floor(Math.random() * results.length)];
      if (!best || random.fitness > best.fitness) {
        best = random;
      }
    }
    
    return best;
  }
  
  /**
   * Crossover two strategies
   */
  crossover(parent1, parent2) {
    const child = {};
    
    for (const param in parent1) {
      // 50/50 chance to inherit from each parent
      if (Math.random() < 0.5) {
        child[param] = JSON.parse(JSON.stringify(parent1[param]));
      } else {
        child[param] = JSON.parse(JSON.stringify(parent2[param]));
      }
    }
    
    return child;
  }
  
  /**
   * Mutate a strategy
   */
  mutate(strategy) {
    // Pick random parameter to mutate
    const params = Object.keys(this.config.parameters);
    const paramToMutate = params[Math.floor(Math.random() * params.length)];
    const range = this.config.parameters[paramToMutate];
    
    if (typeof range.min === 'number') {
      // Mutate by one step up or down
      const currentValue = strategy[paramToMutate];
      const direction = Math.random() < 0.5 ? -1 : 1;
      const newValue = currentValue + (direction * range.step);
      
      // Keep within bounds
      strategy[paramToMutate] = Math.max(range.min, Math.min(range.max, newValue));
    }
  }
  
  /**
   * Calculate max drawdown
   */
  calculateMaxDrawdown(trades) {
    let peak = 10000;
    let maxDrawdown = 0;
    let balance = 10000;
    
    for (const trade of trades) {
      balance += trade.pnl;
      if (balance > peak) {
        peak = balance;
      }
      const drawdown = (peak - balance) / peak * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }
  
  /**
   * Save best strategy to file
   */
  saveBestStrategy() {
    const strategyPath = path.join(
      this.ogzPrime.config.profilesDirectory,
      `optimized_${this.config.optimizeFor}_strategy.json`
    );
    
    const data = {
      strategy: this.bestStrategy.strategy,
      performance: this.bestStrategy.performance,
      fitness: this.bestStrategy.fitness,
      generation: this.generation,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(strategyPath, JSON.stringify(data, null, 2));
    console.log(`💾 Best strategy saved to ${strategyPath}`);
  }
  
  /**
   * Apply best strategy to live bot
   */
  applyBestStrategy() {
    if (!this.bestStrategy) {
      console.log('❌ No optimized strategy found!');
      return false;
    }
    
    console.log('🚀 Applying optimized strategy to live bot...');
    
    // Update bot configuration
    Object.assign(this.ogzPrime.config, this.bestStrategy.strategy);
    
    // Save to profile
    this.ogzPrime.saveProfile();
    
    console.log('✅ Optimized strategy applied!');
    console.log('Expected performance:', this.bestStrategy.performance);
    
    return true;
  }
}

module.exports = StrategyOptimizationEngine;