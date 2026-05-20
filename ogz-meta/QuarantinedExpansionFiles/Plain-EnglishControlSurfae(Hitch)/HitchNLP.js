// ===================================================================
// HITCH NLP CORE - Natural Language Trading Interface
// ===================================================================
// TB&E Tool: Intelligent interpreter between human intent and trading logic

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class HitchNLP extends EventEmitter {
  constructor(ogzPrime) {
    super();
    
    this.ogzPrime = ogzPrime; // Reference to main trading system
    this.commandHistory = [];
    this.impactTracker = new Map();
    this.activeContext = {};
    
    // Command patterns and their handlers
    this.commandPatterns = this.initializeCommandPatterns();
    
    // Initialize logger
    this.logger = new HitchLogger();
    
    console.log('🧠 HITCH NLP INITIALIZED - Ready for natural language commands');
  }
  
  /**
   * Main entry point for natural language processing
   */
  async processCommand(input, metadata = {}) {
    console.log(`\n🎤 HITCH PROCESSING: "${input}"`);
    
    const startTime = Date.now();
    const commandId = `hitch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create command record
    const commandRecord = {
      id: commandId,
      input: input,
      timestamp: startTime,
      metadata: metadata,
      context: { ...this.activeContext },
      results: null,
      impact: null,
      error: null
    };
    
    try {
      // Parse and understand the command
      const interpretation = await this.interpretCommand(input);
      console.log('🧠 Interpretation:', interpretation);
      
      // Validate against OGZPrime capabilities
      const validation = await this.validateCommand(interpretation);
      if (!validation.valid) {
        throw new Error(`Invalid command: ${validation.reason}`);
      }
      
      // Generate structured updates
      const updates = await this.generateUpdates(interpretation);
      
      // Apply updates to OGZPrime
      const results = await this.applyUpdates(updates);
      
      // Track impact
      const impact = await this.trackImpact(commandId, interpretation, results);
      
      // Update command record
      commandRecord.results = results;
      commandRecord.impact = impact;
      commandRecord.processingTime = Date.now() - startTime;
      
      // Store in history
      this.commandHistory.push(commandRecord);
      await this.logger.logCommand(commandRecord);
      
      // Emit success event
      this.emit('commandProcessed', commandRecord);
      
      return {
        success: true,
        commandId: commandId,
        interpretation: interpretation,
        updates: updates,
        results: results,
        impact: impact,
        message: this.generateSuccessMessage(interpretation, results)
      };
      
    } catch (error) {
      console.error('❌ HITCH Error:', error);
      
      commandRecord.error = error.message;
      this.commandHistory.push(commandRecord);
      await this.logger.logCommand(commandRecord);
      
      return {
        success: false,
        commandId: commandId,
        error: error.message,
        suggestions: this.generateSuggestions(input, error)
      };
    }
  }
  
  /**
   * Interpret natural language into structured command
   */
  async interpretCommand(input) {
    const normalized = input.toLowerCase().trim();
    const interpretation = {
      intent: null,
      entities: {},
      conditions: [],
      actions: [],
      modifiers: {},
      confidence: 0
    };
    
    // Check each pattern
    for (const [pattern, handler] of this.commandPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        const result = handler(match, normalized);
        if (result.confidence > interpretation.confidence) {
          Object.assign(interpretation, result);
        }
      }
    }
    
    // If no pattern matched, try AI interpretation
    if (interpretation.confidence < 0.5) {
      const aiInterpretation = await this.aiInterpret(input);
      if (aiInterpretation.confidence > interpretation.confidence) {
        Object.assign(interpretation, aiInterpretation);
      }
    }
    
    // Enhance with context
    this.enhanceWithContext(interpretation);
    
    return interpretation;
  }
  
  /**
   * Initialize command patterns
   */
  initializeCommandPatterns() {
    return new Map([
      // Trading condition patterns
      [/only trade.*when (.*)/i, (match, input) => ({
        intent: 'setTradingCondition',
        conditions: this.parseConditions(match[1]),
        confidence: 0.9
      })],
      
      // Profile activation patterns
      [/activate (\w+) profile/i, (match) => ({
        intent: 'activateProfile',
        entities: { profile: match[1] },
        confidence: 0.95
      })],
      
      // Time-based restrictions
      [/avoid trades? (after|before|between) ([\d:]+\s*(?:am|pm|cst|est)?)/i, (match) => ({
        intent: 'setTimeRestriction',
        entities: { 
          timeType: match[1],
          time: match[2]
        },
        confidence: 0.9
      })],
      
      // Risk management
      [/set (?:risk|position size) (?:to )?(\d+(?:\.\d+)?%?)/i, (match) => ({
        intent: 'setRiskParameter',
        entities: {
          value: parseFloat(match[1].replace('%', ''))
        },
        confidence: 0.95
      })],
      
      // Analysis requests
      [/summarize (today's|yesterday's|this week's) (.*)/i, (match) => ({
        intent: 'summarizePerformance',
        entities: {
          period: match[1],
          metric: match[2]
        },
        confidence: 0.85
      })],
      
      // Indicator conditions
      [/rsi (?:is )?(below|above|between) ([\d\s,and]+)/i, (match) => ({
        intent: 'setIndicatorCondition',
        entities: {
          indicator: 'rsi',
          operator: match[1],
          values: this.parseValues(match[2])
        },
        confidence: 0.9
      })],
      
      // MACD conditions
      [/macd (?:crosses? )?(up|down|above|below)/i, (match) => ({
        intent: 'setIndicatorCondition',
        entities: {
          indicator: 'macd',
          condition: match[1]
        },
        confidence: 0.9
      })],
      
      // Stop/Start commands
      [/(stop|pause|halt) (?:all )?trading/i, (match) => ({
        intent: 'controlTrading',
        entities: { action: 'stop' },
        confidence: 0.95
      })],
      
      [/(start|resume|begin) trading/i, (match) => ({
        intent: 'controlTrading',
        entities: { action: 'start' },
        confidence: 0.95
      })]
    ]);
  }
  
  /**
   * Parse conditions from natural language
   */
  parseConditions(conditionText) {
    const conditions = [];
    
    // RSI conditions
    const rsiMatch = conditionText.match(/rsi (?:is )?(?:below|under|<) (\d+)/i);
    if (rsiMatch) {
      conditions.push({
        type: 'indicator',
        indicator: 'rsi',
        operator: 'below',
        value: parseInt(rsiMatch[1])
      });
    }
    
    // MACD conditions
    const macdMatch = conditionText.match(/macd crosses? (up|down)/i);
    if (macdMatch) {
      conditions.push({
        type: 'indicator',
        indicator: 'macd',
        condition: `cross_${macdMatch[1]}`
      });
    }
    
    // Trend conditions
    const trendMatch = conditionText.match(/(up|down|bull|bear)(?:ish)? trend/i);
    if (trendMatch) {
      conditions.push({
        type: 'market',
        condition: 'trend',
        direction: trendMatch[1].includes('up') || trendMatch[1].includes('bull') ? 'up' : 'down'
      });
    }
    
    // Volume conditions
    const volumeMatch = conditionText.match(/volume (?:is )?(?:above|over|>) (?:average|avg|(\d+))/i);
    if (volumeMatch) {
      conditions.push({
        type: 'market',
        condition: 'volume',
        operator: 'above',
        value: volumeMatch[1] || 'average'
      });
    }
    
    return conditions;
  }

  /**
   * Parse numeric values from text
   */
  parseValues(text) {
    const numbers = text.match(/\d+/g);
    return numbers ? numbers.map(n => parseInt(n)) : [];
  }

  /**
   * Enhance interpretation with context
   */
  enhanceWithContext(interpretation) {
    // Add current market context
    if (this.ogzPrime && this.ogzPrime.tradingBrain) {
      this.activeContext.currentPosition = this.ogzPrime.tradingBrain.position;
      this.activeContext.currentBalance = this.ogzPrime.tradingBrain.balance;
      this.activeContext.isTrading = this.ogzPrime.state?.isRunning || false;
    }
    
    // Add context to interpretation
    interpretation.context = { ...this.activeContext };
  }

  /**
   * Validate command against OGZPrime capabilities
   */
  async validateCommand(interpretation) {
    if (!interpretation.intent) {
      return { valid: false, reason: 'No intent recognized' };
    }
    
    // Check if OGZPrime is available
    if (!this.ogzPrime) {
      return { valid: false, reason: 'OGZPrime not available' };
    }
    
    // Validate specific intents
    switch (interpretation.intent) {
      case 'activateProfile':
        if (!interpretation.entities.profile) {
          return { valid: false, reason: 'No profile specified' };
        }
        break;
        
      case 'setRiskParameter':
        if (!interpretation.entities.value || interpretation.entities.value < 0 || interpretation.entities.value > 50) {
          return { valid: false, reason: 'Invalid risk value (must be 0-50%)' };
        }
        break;
    }
    
    return { valid: true };
  }
  
  /**
   * Generate OGZPrime updates from interpretation
   */
  async generateUpdates(interpretation) {
    const updates = {
      config: {},
      rules: [],
      actions: [],
      patches: []
    };
    
    switch (interpretation.intent) {
      case 'setTradingCondition':
        updates.rules = interpretation.conditions.map(cond => ({
          type: 'tradingRule',
          condition: cond,
          action: 'requireForEntry'
        }));
        break;
        
      case 'activateProfile':
        updates.config.profileName = interpretation.entities.profile;
        updates.actions.push({
          type: 'switchProfile',
          profile: interpretation.entities.profile
        });
        break;
        
      case 'setTimeRestriction':
        updates.config.tradingHours = this.parseTimeRestriction(interpretation.entities);
        break;
        
      case 'setRiskParameter':
        updates.config.riskPercent = interpretation.entities.value / 100;
        updates.config.maxPositionSize = Math.min(interpretation.entities.value * 2, 25) / 100;
        break;
        
      case 'controlTrading':
        updates.actions.push({
          type: interpretation.entities.action === 'stop' ? 'stopTrading' : 'startTrading'
        });
        break;
        
      case 'setIndicatorCondition':
        updates.rules.push({
          type: 'indicatorRule',
          indicator: interpretation.entities.indicator,
          condition: interpretation.entities
        });
        break;
    }
    
    // Generate patch file
    if (Object.keys(updates.config).length > 0 || updates.rules.length > 0) {
      const patch = await this.generatePatch(updates);
      updates.patches.push(patch);
    }
    
    return updates;
  }

  /**
   * Parse time restrictions
   */
  parseTimeRestriction(entities) {
    const restriction = {};
    
    if (entities.timeType === 'after') {
      restriction.stopTime = entities.time;
    } else if (entities.timeType === 'before') {
      restriction.startTime = entities.time;
    } else if (entities.timeType === 'between') {
      restriction.startTime = entities.startTime;
      restriction.stopTime = entities.endTime;
    }
    
    return restriction;
  }
  
  /**
   * Generate .ogzpatch file
   */
  async generatePatch(updates) {
    const timestamp = new Date().toISOString();
    const patchId = `hitch_${Date.now()}`;
    
    const patch = {
      id: patchId,
      created: timestamp,
      source: 'hitch_nlp',
      description: 'NLP-generated configuration update',
      updates: updates,
      rollback: this.generateRollback(updates)
    };
    
    // Save patch file
    const patchPath = path.join(process.cwd(), 'patches', `${patchId}.ogzpatch`);
    await fs.mkdir(path.dirname(patchPath), { recursive: true });
    await fs.writeFile(patchPath, JSON.stringify(patch, null, 2));
    
    return {
      id: patchId,
      path: patchPath,
      content: patch
    };
  }

  /**
   * Generate rollback information
   */
  generateRollback(updates) {
    const rollback = {
      config: {},
      rules: [],
      actions: []
    };
    
    // Store current config values for rollback
    if (updates.config && this.ogzPrime.config) {
      Object.keys(updates.config).forEach(key => {
        if (this.ogzPrime.config[key] !== undefined) {
          rollback.config[key] = this.ogzPrime.config[key];
        }
      });
    }
    
    return rollback;
  }
  
  /**
   * Apply updates to OGZPrime
   */
  async applyUpdates(updates) {
    const results = {
      applied: [],
      failed: [],
      warnings: []
    };
    
    // Apply config updates
    if (updates.config && Object.keys(updates.config).length > 0) {
      try {
        Object.assign(this.ogzPrime.config, updates.config);
        results.applied.push({
          type: 'config',
          changes: updates.config
        });
        
        // Reinitialize if needed
        if (updates.config.profileName) {
          await this.ogzPrime.loadProfile();
        }
      } catch (error) {
        results.failed.push({
          type: 'config',
          error: error.message
        });
      }
    }
    
    // Apply rules
    for (const rule of updates.rules) {
      try {
        if (!this.ogzPrime.tradingRules) {
          this.ogzPrime.tradingRules = [];
        }
        this.ogzPrime.tradingRules.push(rule);
        results.applied.push({
          type: 'rule',
          rule: rule
        });
      } catch (error) {
        results.failed.push({
          type: 'rule',
          rule: rule,
          error: error.message
        });
      }
    }
    
    // Execute actions
    for (const action of updates.actions) {
      try {
        await this.executeAction(action);
        results.applied.push({
          type: 'action',
          action: action
        });
      } catch (error) {
        results.failed.push({
          type: 'action',
          action: action,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Execute specific action
   */
  async executeAction(action) {
    switch (action.type) {
      case 'stopTrading':
        if (this.ogzPrime.state) {
          this.ogzPrime.state.isRunning = false;
        }
        if (this.ogzPrime.pauseTrading) {
          this.ogzPrime.pauseTrading('Stopped by Hitch command');
        }
        console.log('🛑 Trading stopped by Hitch');
        break;
        
      case 'startTrading':
        if (this.ogzPrime.state) {
          this.ogzPrime.state.isRunning = true;
        }
        if (this.ogzPrime.resumeTrading) {
          this.ogzPrime.resumeTrading();
        }
        console.log('▶️ Trading started by Hitch');
        break;
        
      case 'switchProfile':
        this.ogzPrime.config.profileName = action.profile;
        if (this.ogzPrime.loadProfile) {
          await this.ogzPrime.loadProfile();
        }
        console.log(`🔄 Switched to ${action.profile} profile`);
        break;
    }
  }
  
  /**
   * Track impact of command
   */
  async trackImpact(commandId, interpretation, results) {
    const impact = {
      commandId: commandId,
      timestamp: Date.now(),
      metrics: {
        configChanges: results.applied.filter(r => r.type === 'config').length,
        rulesAdded: results.applied.filter(r => r.type === 'rule').length,
        actionsExecuted: results.applied.filter(r => r.type === 'action').length,
        failures: results.failed.length
      },
      tracking: {
        startBalance: this.ogzPrime.tradingBrain?.balance || 0,
        startPositions: this.ogzPrime.tradingBrain?.position ? 1 : 0
      }
    };
    
    // Store for future comparison
    this.impactTracker.set(commandId, impact);
    
    // Set up monitoring
    this.setupImpactMonitoring(commandId, impact);
    
    return impact;
  }
  
  /**
   * Monitor ongoing impact
   */
  setupImpactMonitoring(commandId, initialImpact) {
    // Monitor for 24 hours
    const monitorDuration = 24 * 60 * 60 * 1000;
    
    const interval = setInterval(() => {
      const currentBalance = this.ogzPrime.tradingBrain?.balance || 0;
      const balanceChange = currentBalance - initialImpact.tracking.startBalance;
      
      const impactUpdate = {
        timestamp: Date.now(),
        balanceChange: balanceChange,
        percentChange: initialImpact.tracking.startBalance > 0 ? (balanceChange / initialImpact.tracking.startBalance) * 100 : 0,
        tradesExecuted: this.ogzPrime.tradingBrain?.tradeHistory?.length || 0
      };
      
      // Update impact record
      const impact = this.impactTracker.get(commandId);
      if (impact) {
        if (!impact.updates) impact.updates = [];
        impact.updates.push(impactUpdate);
        
        // Log significant changes
        if (Math.abs(impactUpdate.percentChange) > 1) {
          console.log(`📊 HITCH Impact Update for ${commandId}: ${impactUpdate.percentChange.toFixed(2)}% change`);
        }
      }
    }, 60000); // Check every minute
    
    // Clean up after monitoring period
    setTimeout(() => {
      clearInterval(interval);
      this.finalizeImpact(commandId);
    }, monitorDuration);
  }

  /**
   * Finalize impact tracking
   */
  finalizeImpact(commandId) {
    const impact = this.impactTracker.get(commandId);
    if (impact && impact.updates && impact.updates.length > 0) {
      const finalUpdate = impact.updates[impact.updates.length - 1];
      console.log(`📈 HITCH Final Impact for ${commandId}: ${finalUpdate.percentChange.toFixed(2)}% total change over 24h`);
    }
  }
  
  /**
   * Generate success message
   */
  generateSuccessMessage(interpretation, results) {
    const applied = results.applied.length;
    const failed = results.failed.length;
    
    let message = `✅ Hitch processed your command successfully!\n`;
    
    if (applied > 0) {
      message += `Applied ${applied} update${applied > 1 ? 's' : ''}:\n`;
      results.applied.forEach(r => {
        message += `  • ${this.describeUpdate(r)}\n`;
      });
    }
    
    if (failed > 0) {
      message += `\n⚠️ ${failed} update${failed > 1 ? 's' : ''} failed:\n`;
      results.failed.forEach(r => {
        message += `  • ${r.type}: ${r.error}\n`;
      });
    }
    
    return message;
  }

  /**
   * Describe an update in human-readable terms
   */
  describeUpdate(update) {
    switch (update.type) {
      case 'config':
        const changes = Object.keys(update.changes);
        return `Config updated: ${changes.join(', ')}`;
      case 'rule':
        return `Trading rule added: ${update.rule.type}`;
      case 'action':
        return `Action executed: ${update.action.type}`;
      default:
        return `${update.type} update applied`;
    }
  }

  /**
   * Generate suggestions for failed commands
   */
  generateSuggestions(input, error) {
    const suggestions = [];
    
    if (input.includes('stop') || input.includes('halt')) {
      suggestions.push('Try: "stop trading" or "pause all trading"');
    }
    
    if (input.includes('risk') || input.includes('position')) {
      suggestions.push('Try: "set risk to 2%" or "set position size to 1.5%"');
    }
    
    if (input.includes('profile')) {
      suggestions.push('Try: "activate conservative profile" or "switch to scalper profile"');
    }
    
    if (input.includes('rsi') || input.includes('macd')) {
      suggestions.push('Try: "only trade when RSI is below 30" or "avoid trades when MACD is negative"');
    }
    
    if (suggestions.length === 0) {
      suggestions.push('Try commands like: "stop trading", "set risk to 2%", "activate conservative profile"');
    }
    
    return suggestions;
  }
  
  /**
   * AI-powered interpretation fallback
   */
  async aiInterpret(input) {
    // This would connect to an AI service for complex interpretation
    // For now, return a basic analysis
    
    const words = input.toLowerCase().split(' ');
    const interpretation = {
      intent: 'unknown',
      entities: {},
      confidence: 0.3
    };
    
    // Look for key action words
    if (words.includes('stop') || words.includes('halt')) {
      interpretation.intent = 'controlTrading';
      interpretation.entities.action = 'stop';
      interpretation.confidence = 0.7;
    } else if (words.includes('start') || words.includes('begin')) {
      interpretation.intent = 'controlTrading';
      interpretation.entities.action = 'start';
      interpretation.confidence = 0.7;
    } else if (words.includes('risk') || words.includes('position')) {
      interpretation.intent = 'setRiskParameter';
      interpretation.confidence = 0.6;
    }
    
    return interpretation;
  }
}

// ===================================================================
// HITCH LOGGER - Track all interactions and impact
// ===================================================================

class HitchLogger {
  constructor() {
    this.logPath = path.join(process.cwd(), 'logs', 'hitch');
    this.ensureLogDirectory();
  }
  
  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create Hitch log directory:', error);
    }
  }
  
  async logCommand(commandRecord) {
    try {
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logPath, `hitch_commands_${date}.jsonl`);
      
      await fs.appendFile(logFile, JSON.stringify(commandRecord) + '\n');
    } catch (error) {
      console.error('Failed to log Hitch command:', error);
    }
  }
  
  async getCommandHistory(filter = {}) {
    const commands = [];
    
    try {
      const files = await fs.readdir(this.logPath);
      
      for (const file of files) {
        if (file.startsWith('hitch_commands_')) {
          const content = await fs.readFile(path.join(this.logPath, file), 'utf8');
          const lines = content.trim().split('\n');
          
          for (const line of lines) {
            try {
              const command = JSON.parse(line);
              
              // Apply filters
              if (filter.startDate && command.timestamp < filter.startDate) continue;
              if (filter.endDate && command.timestamp > filter.endDate) continue;
              if (filter.intent && command.interpretation?.intent !== filter.intent) continue;
              
              commands.push(command);
            } catch (e) {
              // Skip invalid lines
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to read command history:', error);
    }
    
    return commands.sort((a, b) => b.timestamp - a.timestamp);
  }
}

// ===================================================================
// HITCHPLAY - Replay system for impact analysis
// ===================================================================

class HitchPlay {
  constructor(hitchNLP) {
    this.hitch = hitchNLP;
  }
  
  async replayCommand(commandId) {
    // Find command in history
    const history = await this.hitch.logger.getCommandHistory();
    const command = history.find(c => c.id === commandId);
    
    if (!command) {
      throw new Error(`Command ${commandId} not found`);
    }
    
    console.log(`\n🔄 HITCHPLAY: Replaying command ${commandId}`);
    console.log(`Original input: "${command.input}"`);
    console.log(`Original time: ${new Date(command.timestamp).toLocaleString()}`);
    
    // Show original results
    console.log('\n📊 Original Results:');
    if (command.results) {
      console.log(`  Applied: ${command.results.applied.length}`);
      console.log(`  Failed: ${command.results.failed.length}`);
    }
    
    // Show impact over time
    const impact = this.hitch.impactTracker.get(commandId);
    if (impact && impact.updates) {
      console.log('\n📈 Impact Timeline:');
      impact.updates.forEach(update => {
        const time = new Date(update.timestamp).toLocaleString();
        console.log(`  ${time}: ${update.percentChange >= 0 ? '+' : ''}${update.percentChange.toFixed(2)}% (${update.tradesExecuted} trades)`);
      });
    }
    
    return {
      command: command,
      impact: impact,
      suggestion: this.generateReplayInsights(command, impact)
    };
  }
  
  generateReplayInsights(command, impact) {
    const insights = [];
    
    if (impact && impact.updates && impact.updates.length > 0) {
      const finalUpdate = impact.updates[impact.updates.length - 1];
      
      if (finalUpdate.percentChange > 2) {
        insights.push('✅ This command led to significant profits');
      } else if (finalUpdate.percentChange < -2) {
        insights.push('⚠️ This command resulted in losses');
      } else {
        insights.push('➡️ This command had neutral impact');
      }
      
      if (finalUpdate.tradesExecuted > 50) {
        insights.push('🔥 High trading activity followed this command');
      }
    }
    
    return insights;
  }
}

// Export all components
module.exports = {
  HitchNLP,
  HitchLogger,
  HitchPlay
};