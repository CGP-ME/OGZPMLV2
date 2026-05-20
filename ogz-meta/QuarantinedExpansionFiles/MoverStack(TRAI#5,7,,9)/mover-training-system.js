// ==========================================
// FILE: mover-training-system.js
// Massive markdown training system for The Mover
// ==========================================
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class MoverTrainingSystem extends EventEmitter {
  constructor(moverCore, moverMemory) {
    super();
    this.core = moverCore;
    this.memory = moverMemory;
    
    this.config = {
      batchSize: 1000,              // Process 1000 lines at a time
      trainingDir: './training-data',
      outputDir: './trained-knowledge',
      maxConcurrentBatches: 5,
      enableProgressLogging: true,
      saveCheckpoints: true,
      checkpointInterval: 10000     // Every 10k lines
    };
    
    this.trainingStats = {
      totalLinesProcessed: 0,
      totalFiles: 0,
      currentFile: '',
      startTime: null,
      knowledgeExtracted: 0,
      patternsDetected: 0
    };
    
    this.knowledgeBase = {
      tradingConcepts: new Map(),
      strategies: new Map(),
      marketInsights: new Map(),
      technicalAnalysis: new Map(),
      riskManagement: new Map(),
      personalityTraits: new Map()
    };
  }

  async trainOnMarkdownCorpus(inputPath) {
    console.log(`[TrainingSystem] Starting massive markdown training on: ${inputPath}`);
    this.trainingStats.startTime = Date.now();
    
    try {
      // Check if it's a file or directory
      const stats = await fs.stat(inputPath);
      
      if (stats.isFile()) {
        await this.processMarkdownFile(inputPath);
      } else if (stats.isDirectory()) {
        await this.processMarkdownDirectory(inputPath);
      }
      
      // Save all extracted knowledge
      await this.saveTrainingResults();
      
      console.log(`[TrainingSystem] Training complete! Processed ${this.trainingStats.totalLinesProcessed} lines`);
      console.log(`[TrainingSystem] Knowledge extracted: ${this.trainingStats.knowledgeExtracted} concepts`);
      console.log(`[TrainingSystem] Patterns detected: ${this.trainingStats.patternsDetected}`);
      
      return this.getTrainingReport();
      
    } catch (error) {
      console.error('[TrainingSystem] Training failed:', error);
      throw error;
    }
  }

  async processMarkdownDirectory(dirPath) {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      
      if (file.isDirectory()) {
        await this.processMarkdownDirectory(fullPath); // Recursive
      } else if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
        await this.processMarkdownFile(fullPath);
      }
    }
  }

  async processMarkdownFile(filePath) {
    this.trainingStats.currentFile = path.basename(filePath);
    this.trainingStats.totalFiles++;
    
    console.log(`[TrainingSystem] Processing file ${this.trainingStats.totalFiles}: ${this.trainingStats.currentFile}`);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      // Process in batches to handle massive files
      for (let i = 0; i < lines.length; i += this.config.batchSize) {
        const batch = lines.slice(i, i + this.config.batchSize);
        await this.processBatch(batch, filePath, i);
        
        // Checkpoint every 10k lines
        if ((this.trainingStats.totalLinesProcessed % this.config.checkpointInterval) === 0) {
          await this.saveCheckpoint();
        }
      }
      
    } catch (error) {
      console.error(`[TrainingSystem] Error processing ${filePath}:`, error);
    }
  }

  async processBatch(lines, filePath, startIndex) {
    const batchKnowledge = {
      concepts: [],
      strategies: [],
      patterns: [],
      insights: []
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = startIndex + i + 1;
      
      // Extract different types of knowledge
      const extracted = this.extractKnowledgeFromLine(line, filePath, lineNumber);
      
      if (extracted) {
        batchKnowledge.concepts.push(...extracted.concepts);
        batchKnowledge.strategies.push(...extracted.strategies);
        batchKnowledge.patterns.push(...extracted.patterns);
        batchKnowledge.insights.push(...extracted.insights);
      }
      
      this.trainingStats.totalLinesProcessed++;
    }
    
    // Store batch knowledge in memory system
    await this.storeBatchKnowledge(batchKnowledge);
    
    // Progress logging
    if (this.config.enableProgressLogging && (this.trainingStats.totalLinesProcessed % 5000) === 0) {
      const elapsed = Date.now() - this.trainingStats.startTime;
      const linesPerSecond = Math.round(this.trainingStats.totalLinesProcessed / (elapsed / 1000));
      console.log(`[TrainingSystem] Progress: ${this.trainingStats.totalLinesProcessed} lines processed (${linesPerSecond} lines/sec)`);
    }
  }

  extractKnowledgeFromLine(line, filePath, lineNumber) {
    const extracted = {
      concepts: [],
      strategies: [],
      patterns: [],
      insights: []
    };
    
    const lineLower = line.toLowerCase();
    
    // Trading concepts extraction
    if (this.containsTradingConcept(lineLower)) {
      extracted.concepts.push({
        type: 'trading_concept',
        content: line.trim(),
        source: `${path.basename(filePath)}:${lineNumber}`,
        confidence: this.calculateConceptConfidence(line)
      });
    }
    
    // Strategy patterns
    if (this.containsStrategy(lineLower)) {
      extracted.strategies.push({
        type: 'strategy',
        content: line.trim(),
        source: `${path.basename(filePath)}:${lineNumber}`,
        effectiveness: this.estimateStrategyEffectiveness(line)
      });
    }
    
    // Market patterns
    if (this.containsPattern(lineLower)) {
      extracted.patterns.push({
        type: 'pattern',
        content: line.trim(),
        source: `${path.basename(filePath)}:${lineNumber}`,
        reliability: this.estimatePatternReliability(line)
      });
    }
    
    // Market insights
    if (this.containsInsight(lineLower)) {
      extracted.insights.push({
        type: 'insight',
        content: line.trim(),
        source: `${path.basename(filePath)}:${lineNumber}`,
        importance: this.calculateInsightImportance(line)
      });
    }
    
    // Personality traits for The Mover
    if (this.containsPersonalityTrait(lineLower)) {
      extracted.insights.push({
        type: 'personality',
        content: line.trim(),
        source: `${path.basename(filePath)}:${lineNumber}`,
        relevance: this.calculatePersonalityRelevance(line)
      });
    }
    
    return extracted.concepts.length > 0 || extracted.strategies.length > 0 || 
           extracted.patterns.length > 0 || extracted.insights.length > 0 ? extracted : null;
  }

  containsTradingConcept(line) {
    const tradingKeywords = [
      'profit', 'loss', 'trade', 'buy', 'sell', 'entry', 'exit', 'stop loss',
      'take profit', 'risk', 'reward', 'position', 'leverage', 'margin',
      'volume', 'price action', 'support', 'resistance', 'trend', 'reversal',
      'breakout', 'pullback', 'consolidation', 'volatility', 'liquidity'
    ];
    
    return tradingKeywords.some(keyword => line.includes(keyword));
  }

  containsStrategy(line) {
    const strategyKeywords = [
      'strategy', 'approach', 'method', 'technique', 'system', 'algorithm',
      'indicator', 'signal', 'setup', 'confluence', 'divergence', 'momentum',
      'scalping', 'swing trading', 'day trading', 'position trading'
    ];
    
    return strategyKeywords.some(keyword => line.includes(keyword));
  }

  containsPattern(line) {
    const patternKeywords = [
      'pattern', 'formation', 'flag', 'triangle', 'wedge', 'channel',
      'head and shoulders', 'double top', 'double bottom', 'cup and handle',
      'ascending', 'descending', 'symmetrical', 'pennant', 'diamond'
    ];
    
    return patternKeywords.some(keyword => line.includes(keyword));
  }

  containsInsight(line) {
    const insightKeywords = [
      'insight', 'observation', 'analysis', 'conclusion', 'finding',
      'discovery', 'research', 'study', 'data shows', 'evidence suggests',
      'market behavior', 'psychology', 'sentiment', 'correlation'
    ];
    
    return insightKeywords.some(keyword => line.includes(keyword));
  }

  containsPersonalityTrait(line) {
    const personalityKeywords = [
      'personality', 'character', 'attitude', 'behavior', 'style',
      'confident', 'aggressive', 'conservative', 'patient', 'disciplined',
      'focused', 'analytical', 'intuitive', 'experienced', 'professional'
    ];
    
    return personalityKeywords.some(keyword => line.includes(keyword));
  }

  calculateConceptConfidence(line) {
    // Simple confidence scoring based on line content
    let confidence = 0.5;
    
    if (line.includes('$') || line.includes('%')) confidence += 0.2;
    if (line.length > 50) confidence += 0.1;
    if (line.includes('proven') || line.includes('tested')) confidence += 0.2;
    
    return Math.min(confidence, 1.0);
  }

  estimateStrategyEffectiveness(line) {
    let effectiveness = 0.5;
    
    if (line.includes('successful') || line.includes('profitable')) effectiveness += 0.3;
    if (line.includes('consistent') || line.includes('reliable')) effectiveness += 0.2;
    if (line.includes('backtested') || line.includes('proven')) effectiveness += 0.2;
    
    return Math.min(effectiveness, 1.0);
  }

  estimatePatternReliability(line) {
    let reliability = 0.5;
    
    if (line.includes('high probability') || line.includes('reliable')) reliability += 0.3;
    if (line.includes('historical') || line.includes('data')) reliability += 0.2;
    if (line.includes('confirmation') || line.includes('confluence')) reliability += 0.2;
    
    return Math.min(reliability, 1.0);
  }

  calculateInsightImportance(line) {
    let importance = 0.5;
    
    if (line.includes('critical') || line.includes('important')) importance += 0.3;
    if (line.includes('key') || line.includes('essential')) importance += 0.2;
    if (line.includes('fundamental') || line.includes('core')) importance += 0.2;
    
    return Math.min(importance, 1.0);
  }

  calculatePersonalityRelevance(line) {
    let relevance = 0.5;
    
    if (line.includes('trader') || line.includes('trading')) relevance += 0.3;
    if (line.includes('mindset') || line.includes('psychology')) relevance += 0.2;
    if (line.includes('professional') || line.includes('expert')) relevance += 0.2;
    
    return Math.min(relevance, 1.0);
  }

  async storeBatchKnowledge(batchKnowledge) {
    // Store in The Mover's memory system
    for (const concept of batchKnowledge.concepts) {
      const eventId = this.memory.recordEvent('training_concept', concept);
      this.knowledgeBase.tradingConcepts.set(eventId, concept);
      this.trainingStats.knowledgeExtracted++;
    }
    
    for (const strategy of batchKnowledge.strategies) {
      const eventId = this.memory.recordEvent('training_strategy', strategy);
      this.knowledgeBase.strategies.set(eventId, strategy);
      this.trainingStats.knowledgeExtracted++;
    }
    
    for (const pattern of batchKnowledge.patterns) {
      const eventId = this.memory.recordEvent('training_pattern', pattern);
      this.knowledgeBase.technicalAnalysis.set(eventId, pattern);
      this.trainingStats.patternsDetected++;
    }
    
    for (const insight of batchKnowledge.insights) {
      const eventId = this.memory.recordEvent('training_insight', insight);
      
      if (insight.type === 'personality') {
        this.knowledgeBase.personalityTraits.set(eventId, insight);
      } else {
        this.knowledgeBase.marketInsights.set(eventId, insight);
      }
      
      this.trainingStats.knowledgeExtracted++;
    }
  }

  async saveCheckpoint() {
    const checkpoint = {
      stats: this.trainingStats,
      knowledgeBaseSizes: {
        tradingConcepts: this.knowledgeBase.tradingConcepts.size,
        strategies: this.knowledgeBase.strategies.size,
        patterns: this.knowledgeBase.technicalAnalysis.size,
        insights: this.knowledgeBase.marketInsights.size,
        personality: this.knowledgeBase.personalityTraits.size
      },
      timestamp: Date.now()
    };
    
    const checkpointPath = path.join(this.config.outputDir, `checkpoint_${this.trainingStats.totalLinesProcessed}.json`);
    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
    
    console.log(`[TrainingSystem] Checkpoint saved: ${this.trainingStats.totalLinesProcessed} lines processed`);
  }

  async saveTrainingResults() {
    await fs.mkdir(this.config.outputDir, { recursive: true });
    
    // Save knowledge bases
    const knowledgeBases = {
      tradingConcepts: Array.from(this.knowledgeBase.tradingConcepts.values()),
      strategies: Array.from(this.knowledgeBase.strategies.values()),
      technicalAnalysis: Array.from(this.knowledgeBase.technicalAnalysis.values()),
      marketInsights: Array.from(this.knowledgeBase.marketInsights.values()),
      personalityTraits: Array.from(this.knowledgeBase.personalityTraits.values())
    };
    
    for (const [category, data] of Object.entries(knowledgeBases)) {
      const filePath = path.join(this.config.outputDir, `${category}.json`);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    }
    
    // Save training report
    const report = this.getTrainingReport();
    const reportPath = path.join(this.config.outputDir, 'training_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Update The Mover's core knowledge
    await this.updateMoverKnowledge();
    
    console.log(`[TrainingSystem] Training results saved to: ${this.config.outputDir}`);
  }

  async updateMoverKnowledge() {
    // Inject the most important knowledge into The Mover's core
    const topConcepts = Array.from(this.knowledgeBase.tradingConcepts.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 100);
    
    const topStrategies = Array.from(this.knowledgeBase.strategies.values())
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 50);
    
    const topPersonality = Array.from(this.knowledgeBase.personalityTraits.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 25);
    
    // Update The Mover's core knowledge
    this.core.updateKnowledgeBase({
      concepts: topConcepts,
      strategies: topStrategies,
      personality: topPersonality
    });
    
    console.log(`[TrainingSystem] Updated Mover's core with top knowledge items`);
  }

  getTrainingReport() {
    const duration = Date.now() - this.trainingStats.startTime;
    const linesPerSecond = Math.round(this.trainingStats.totalLinesProcessed / (duration / 1000));
    
    return {
      summary: {
        totalLinesProcessed: this.trainingStats.totalLinesProcessed,
        totalFiles: this.trainingStats.totalFiles,
        processingTime: `${Math.round(duration / 1000)}s`,
        averageSpeed: `${linesPerSecond} lines/second`,
        knowledgeExtracted: this.trainingStats.knowledgeExtracted,
        patternsDetected: this.trainingStats.patternsDetected
      },
      
      knowledgeBreakdown: {
        tradingConcepts: this.knowledgeBase.tradingConcepts.size,
        strategies: this.knowledgeBase.strategies.size,
        technicalAnalysis: this.knowledgeBase.technicalAnalysis.size,
        marketInsights: this.knowledgeBase.marketInsights.size,
        personalityTraits: this.knowledgeBase.personalityTraits.size
      },
      
      quality: {
        averageConceptConfidence: this.calculateAverageConfidence(),
        averageStrategyEffectiveness: this.calculateAverageEffectiveness(),
        averagePatternReliability: this.calculateAverageReliability()
      }
    };
  }

  calculateAverageConfidence() {
    const concepts = Array.from(this.knowledgeBase.tradingConcepts.values());
    if (concepts.length === 0) return 0;
    
    const totalConfidence = concepts.reduce((sum, concept) => sum + concept.confidence, 0);
    return (totalConfidence / concepts.length).toFixed(3);
  }

  calculateAverageEffectiveness() {
    const strategies = Array.from(this.knowledgeBase.strategies.values());
    if (strategies.length === 0) return 0;
    
    const totalEffectiveness = strategies.reduce((sum, strategy) => sum + strategy.effectiveness, 0);
    return (totalEffectiveness / strategies.length).toFixed(3);
  }

  calculateAverageReliability() {
    const patterns = Array.from(this.knowledgeBase.technicalAnalysis.values());
    if (patterns.length === 0) return 0;
    
    const totalReliability = patterns.reduce((sum, pattern) => sum + pattern.reliability, 0);
    return (totalReliability / patterns.length).toFixed(3);
  }

  // Query the trained knowledge
  queryKnowledge(query, category = 'all', limit = 10) {
    const results = [];
    
    const searchInCategory = (knowledgeMap, categoryName) => {
      for (const [id, item] of knowledgeMap) {
        if (item.content.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            id,
            category: categoryName,
            content: item.content,
            source: item.source,
            score: item.confidence || item.effectiveness || item.reliability || item.importance || item.relevance || 0.5
          });
        }
      }
    };
    
    if (category === 'all' || category === 'concepts') {
      searchInCategory(this.knowledgeBase.tradingConcepts, 'trading_concepts');
    }
    
    if (category === 'all' || category === 'strategies') {
      searchInCategory(this.knowledgeBase.strategies, 'strategies');
    }
    
    if (category === 'all' || category === 'patterns') {
      searchInCategory(this.knowledgeBase.technicalAnalysis, 'technical_analysis');
    }
    
    if (category === 'all' || category === 'insights') {
      searchInCategory(this.knowledgeBase.marketInsights, 'market_insights');
    }
    
    if (category === 'all' || category === 'personality') {
      searchInCategory(this.knowledgeBase.personalityTraits, 'personality_traits');
    }
    
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

module.exports = MoverTrainingSystem;
