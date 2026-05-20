// ==========================================
// FILE: mover-memory.js
// Context and doctrine management system
// ==========================================
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class MoverMemory extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      memoryDir: config.memoryDir || './memory',
      maxMemorySize: config.maxMemorySize || 10000,
      persistInterval: config.persistInterval || 60000, // 1 minute
      ...config
    };
    
    this.shortTermMemory = []; // Recent events
    this.longTermMemory = {};  // Key insights and patterns
    this.doctrineLibrary = {}; // Loaded doctrine files
    this.contextWindow = [];   // Current conversation context
    
    this.initializeMemorySystem();
  }

  async initializeMemorySystem() {
    try {
      // Ensure memory directory exists
      await fs.mkdir(this.config.memoryDir, { recursive: true });
      
      // Load existing memories
      await this.loadPersistedMemory();
      
      // Start persistence interval
      this.persistenceInterval = setInterval(() => {
        this.persistMemory().catch(console.error);
      }, this.config.persistInterval);
      
      console.log('[MoverMemory] Memory system initialized');
    } catch (error) {
      console.error('[MoverMemory] Initialization error:', error);
    }
  }

  async ingestDoctrine(doctrinePath, doctrineId) {
    try {
      const content = await fs.readFile(doctrinePath, 'utf8');
      let doctrine;
      
      // Handle different doctrine formats
      if (doctrinePath.endsWith('.json')) {
        doctrine = JSON.parse(content);
      } else if (doctrinePath.endsWith('.md')) {
        doctrine = this.parseMarkdownDoctrine(content);
      } else {
        doctrine = { raw: content, type: 'text' };
      }
      
      // Store in library
      this.doctrineLibrary[doctrineId] = {
        id: doctrineId,
        path: doctrinePath,
        content: doctrine,
        loadedAt: Date.now(),
        version: doctrine.version || '1.0'
      };
      
      // Extract key rules and insights
      const insights = this.extractInsights(doctrine);
      this.updateLongTermMemory('doctrine', doctrineId, insights);
      
      this.emit('doctrine_ingested', { 
        doctrineId, 
        insightCount: insights.length 
      });
      
      console.log(`[MoverMemory] Ingested doctrine: ${doctrineId}`);
      return insights;
    } catch (error) {
      console.error(`[MoverMemory] Failed to ingest doctrine:`, error);
      throw error;
    }
  }

  parseMarkdownDoctrine(markdown) {
    const doctrine = {
      sections: {},
      rules: [],
      guidelines: []
    };
    
    const lines = markdown.split('\n');
    let currentSection = 'general';
    
    lines.forEach(line => {
      if (line.startsWith('# ')) {
        currentSection = line.substring(2).toLowerCase().replace(/\s+/g, '_');
        doctrine.sections[currentSection] = [];
      } else if (line.startsWith('- Rule:')) {
        doctrine.rules.push(line.substring(7).trim());
      } else if (line.startsWith('- Guideline:')) {
        doctrine.guidelines.push(line.substring(12).trim());
      } else if (line.trim() && doctrine.sections[currentSection]) {
        doctrine.sections[currentSection].push(line.trim());
      }
    });
    
    return doctrine;
  }

  extractInsights(doctrine) {
    const insights = [];
    
    // Extract rules
    if (doctrine.rules) {
      doctrine.rules.forEach(rule => {
        insights.push({
          type: 'rule',
          content: rule,
          priority: rule.priority || 'normal',
          conditions: rule.conditions || []
        });
      });
    }
    
    // Extract trading strategies
    if (doctrine.strategies) {
      Object.entries(doctrine.strategies).forEach(([name, strategy]) => {
        insights.push({
          type: 'strategy',
          name,
          content: strategy,
          triggerConditions: strategy.triggers || []
        });
      });
    }
    
    // Extract personality traits
    if (doctrine.personality) {
      insights.push({
        type: 'personality',
        traits: doctrine.personality.traits || [],
        responses: doctrine.personality.responses || {}
      });
    }
    
    return insights;
  }

  recordEvent(eventType, eventData) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      data: eventData,
      timestamp: Date.now(),
      context: this.getCurrentContext()
    };
    
    // Add to short-term memory
    this.shortTermMemory.push(event);
    
    // Maintain memory size limit
    if (this.shortTermMemory.length > this.config.maxMemorySize) {
      // Move oldest events to long-term memory if significant
      const removed = this.shortTermMemory.splice(0, 100);
      this.compressToLongTerm(removed);
    }
    
    // Update context window
    this.updateContextWindow(event);
    
    return event.id;
  }

  compressToLongTerm(events) {
    // Analyze events for patterns and insights
    const patterns = this.detectPatterns(events);
    const summary = this.generateSummary(events);
    
    // Store compressed insights
    const compressionId = `comp_${Date.now()}`;
    this.updateLongTermMemory('compression', compressionId, {
      eventCount: events.length,
      timeRange: {
        start: events[0].timestamp,
        end: events[events.length - 1].timestamp
      },
      patterns,
      summary,
      significantEvents: events.filter(e => this.isSignificant(e))
    });
  }

  detectPatterns(events) {
    const patterns = [];
    
    // Trade outcome patterns
    const tradeEvents = events.filter(e => e.type === 'trade');
    if (tradeEvents.length > 5) {
      const winRate = tradeEvents.filter(t => t.data.profitLoss > 0).length / tradeEvents.length;
      patterns.push({
        type: 'trade_performance',
        winRate,
        sampleSize: tradeEvents.length
      });
    }
    
    // Time-based patterns
    const hourlyDistribution = {};
    events.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    });
    
    const peakHour = Object.entries(hourlyDistribution)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (peakHour) {
      patterns.push({
        type: 'activity_pattern',
        peakHour: parseInt(peakHour[0]),
        eventsInPeakHour: peakHour[1]
      });
    }
    
    return patterns;
  }

  generateSummary(events) {
    const summary = {
      totalEvents: events.length,
      eventTypes: {},
      keyOutcomes: []
    };
    
    events.forEach(event => {
      summary.eventTypes[event.type] = (summary.eventTypes[event.type] || 0) + 1;
      
      if (this.isSignificant(event)) {
        summary.keyOutcomes.push({
          type: event.type,
          outcome: event.data.outcome || event.data.profitLoss || 'recorded'
        });
      }
    });
    
    return summary;
  }

  isSignificant(event) {
    // Trade with high profit/loss
    if (event.type === 'trade' && Math.abs(event.data.profitLoss || 0) > 100) {
      return true;
    }
    
    // System alerts
    if (event.type === 'alert' || event.type === 'error') {
      return true;
    }
    
    // Milestone events
    if (event.data.milestone || event.data.achievement) {
      return true;
    }
    
    return false;
  }

  updateContextWindow(event) {
    this.contextWindow.push({
      type: event.type,
      summary: this.summarizeEvent(event),
      timestamp: event.timestamp
    });
    
    // Keep only last 20 items in context
    if (this.contextWindow.length > 20) {
      this.contextWindow = this.contextWindow.slice(-20);
    }
  }

  summarizeEvent(event) {
    switch (event.type) {
      case 'trade':
        return `${event.data.action} ${event.data.asset} at $${event.data.price}`;
      case 'analysis':
        return `Market ${event.data.marketRegime}, confidence ${event.data.confidence}%`;
      case 'alert':
        return event.data.message || 'System alert';
      default:
        return event.type;
    }
  }

  getCurrentContext() {
    return {
      recentEvents: this.contextWindow.slice(-5),
      activeDoctrines: Object.keys(this.doctrineLibrary),
      memoryStats: {
        shortTermSize: this.shortTermMemory.length,
        longTermCategories: Object.keys(this.longTermMemory)
      }
    };
  }

  updateLongTermMemory(category, key, value) {
    if (!this.longTermMemory[category]) {
      this.longTermMemory[category] = {};
    }
    
    this.longTermMemory[category][key] = {
      value,
      updatedAt: Date.now(),
      accessCount: 0
    };
  }

  recall(query, options = {}) {
    const results = {
      shortTerm: [],
      longTerm: [],
      doctrine: []
    };
    
    // Search short-term memory
    results.shortTerm = this.shortTermMemory.filter(event => {
      return this.matchesQuery(event, query);
    }).slice(-(options.limit || 10));
    
    // Search long-term memory
    Object.entries(this.longTermMemory).forEach(([category, items]) => {
      Object.entries(items).forEach(([key, item]) => {
        if (this.matchesQuery(item.value, query)) {
          results.longTerm.push({
            category,
            key,
            ...item
          });
          item.accessCount++;
        }
      });
    });
    
    // Search doctrine
    Object.entries(this.doctrineLibrary).forEach(([id, doctrine]) => {
      const matches = this.searchDoctrine(doctrine.content, query);
      if (matches.length > 0) {
        results.doctrine.push({
          doctrineId: id,
          matches
        });
      }
    });
    
    return results;
  }

  matchesQuery(item, query) {
    const queryLower = query.toLowerCase();
    const itemStr = JSON.stringify(item).toLowerCase();
    return itemStr.includes(queryLower);
  }

  searchDoctrine(doctrine, query) {
    const matches = [];
    const queryLower = query.toLowerCase();
    
    // Search rules
    if (doctrine.rules) {
      doctrine.rules.forEach((rule, index) => {
        if (JSON.stringify(rule).toLowerCase().includes(queryLower)) {
          matches.push({ type: 'rule', index, content: rule });
        }
      });
    }
    
    // Search sections
    if (doctrine.sections) {
      Object.entries(doctrine.sections).forEach(([section, content]) => {
        if (JSON.stringify(content).toLowerCase().includes(queryLower)) {
          matches.push({ type: 'section', section, content });
        }
      });
    }
    
    return matches;
  }

  async persistMemory() {
    try {
      const memoryState = {
        shortTermMemory: this.shortTermMemory.slice(-1000), // Keep last 1000
        longTermMemory: this.longTermMemory,
        contextWindow: this.contextWindow,
        timestamp: Date.now()
      };
      
      const filePath = path.join(
        this.config.memoryDir, 
        `memory_${new Date().toISOString().split('T')[0]}.json`
      );
      
      await fs.writeFile(filePath, JSON.stringify(memoryState, null, 2));
      
      console.log('[MoverMemory] Memory persisted successfully');
    } catch (error) {
      console.error('[MoverMemory] Failed to persist memory:', error);
    }
  }

  async loadPersistedMemory() {
    try {
      const files = await fs.readdir(this.config.memoryDir);
      const memoryFiles = files.filter(f => f.startsWith('memory_')).sort();
      
      if (memoryFiles.length > 0) {
        const latestFile = memoryFiles[memoryFiles.length - 1];
        const filePath = path.join(this.config.memoryDir, latestFile);
        const content = await fs.readFile(filePath, 'utf8');
        const memoryState = JSON.parse(content);
        
        this.shortTermMemory = memoryState.shortTermMemory || [];
        this.longTermMemory = memoryState.longTermMemory || {};
        this.contextWindow = memoryState.contextWindow || [];
        
        console.log(`[MoverMemory] Loaded memory from ${latestFile}`);
      }
    } catch (error) {
      console.error('[MoverMemory] Failed to load persisted memory:', error);
    }
  }

  getMemoryStats() {
    return {
      shortTermCount: this.shortTermMemory.length,
      longTermCategories: Object.keys(this.longTermMemory),
      longTermTotalItems: Object.values(this.longTermMemory)
        .reduce((sum, category) => sum + Object.keys(category).length, 0),
      doctrineCount: Object.keys(this.doctrineLibrary).length,
      contextWindowSize: this.contextWindow.length
    };
  }

  cleanup() {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    return this.persistMemory();
  }
}

module.exports = MoverMemory;