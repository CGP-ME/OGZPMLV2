// ==========================================
// FILE: mover-integration-hub.js
// Central hub connecting all Mover capabilities
// ==========================================
const EventEmitter = require('events');

// Import required modules
const TechSupport = require('./mover-tech-support');
const ContentCreator = require('./mover-content-creator');
const SalesEngine = require('./mover-sales-engine');
const HitchConnector = require('./mover-hitch-connector');

class MoverIntegrationHub extends EventEmitter {
  constructor(moverCore, moverMemory) {
    super();
    this.core = moverCore;
    this.memory = moverMemory;
    
    // Initialize all modules
    try {
      this.hitch = new HitchConnector();
      this.content = new ContentCreator(moverCore, moverMemory);
      this.support = new TechSupport(moverCore, moverMemory);
      this.sales = new SalesEngine(moverCore, moverMemory);
      
      console.log('[MoverIntegrationHub] All modules initialized successfully');
    } catch (error) {
      console.warn('[MoverIntegrationHub] Some modules failed to initialize:', error.message);
      console.log('[MoverIntegrationHub] Running in basic mode');
    }
    
    // Connect everything
    this.setupIntegrations();
  }

  setupIntegrations() {
    // Only setup Hitch integrations if it's available
    if (this.hitch && typeof this.hitch.on === 'function') {
      // When Hitch gets market-moving news, adjust trading
      this.hitch.on('market_moving_news', async (news) => {
        await this.core.processTradeEvent({
          type: 'news_alert',
          ...news,
          action: 'ADJUST_STRATEGY'
        });
        
        // Create content about it
        const content = await this.content.generateSocialMediaPost({
          type: 'breaking_news',
          ...news
        });
        
        this.broadcast('content_created', content);
      });
    } else {
      console.log('[MoverIntegrationHub] Hitch integration disabled - running in basic mode');
    }

    // When profitable trade happens, create content
    this.core.on('narration', async (event) => {
      if (event.data.profitLoss > 100) {
        // Generate YouTube short
        const shortForm = await this.content.generateShortFormContent(event.data);
        
        // Update sales page with fresh results
        await this.sales.updateLiveResults(event.data);
        
        this.broadcast('profitable_trade_content', shortForm);
      }
    });

    // Customer support integration
    if (this.support && typeof this.support.on === 'function') {
      this.support.on('issue_resolved', async (ticket) => {
        // Learn from the solution
        await this.memory.recordEvent('support_solution', ticket);
        
        // Create FAQ content
        const faq = await this.content.generateFAQ(ticket);
        
        this.broadcast('new_faq', faq);
      });
    }
  }

  async handleUserQuery(query, context) {
    // Determine intent
    const intent = await this.determineIntent(query);
    
    switch (intent.type) {
      case 'technical_support':
        return await this.support.diagnoseProblem(query);
        
      case 'sales_question':
        return await this.sales.handleObjection(intent.objection, context);
        
      case 'performance_inquiry':
        return await this.generatePerformanceReport(context);
        
      case 'setup_help':
        return await this.generateSetupGuide(context);
        
      default:
        return await this.core.processTradeEvent({
          type: 'user_query',
          query,
          context
        });
    }
  }

  async generateDailyReport() {
    const trading = await this.core.getSessionReport();
    const news = this.hitch && this.hitch.getRecentNews ? this.hitch.getRecentNews(10) : [];
    const support = await this.support.checkSystemHealth();
    const sales = await this.sales.getDailyConversions();
    
    return {
      executive_summary: {
        profit_loss: trading.profitLoss,
        system_health: support.overall_status,
        new_customers: sales.conversions,
        content_created: await this.content.getDailyContent()
      },
      
      detailed_sections: {
        trading,
        market_events: news,
        technical_status: support,
        sales_pipeline: sales
      },
      
      recommendations: await this.generateRecommendations(),
      
      scheduled_tasks: await this.getScheduledTasks()
    };
  }

  async determineIntent(query) {
    const queryLower = query.toLowerCase();
    
    // Technical support keywords
    if (queryLower.includes('error') || queryLower.includes('not working') || 
        queryLower.includes('broken') || queryLower.includes('help')) {
      return { type: 'technical_support' };
    }
    
    // Sales keywords
    if (queryLower.includes('price') || queryLower.includes('buy') || 
        queryLower.includes('cost') || queryLower.includes('subscription')) {
      return { type: 'sales_question', objection: query };
    }
    
    // Performance keywords
    if (queryLower.includes('profit') || queryLower.includes('performance') || 
        queryLower.includes('results') || queryLower.includes('returns')) {
      return { type: 'performance_inquiry' };
    }
    
    // Setup keywords
    if (queryLower.includes('setup') || queryLower.includes('install') || 
        queryLower.includes('configure')) {
      return { type: 'setup_help' };
    }
    
    return { type: 'general_query' };
  }

  async generatePerformanceReport(context) {
    const sessionReport = this.core.getSessionReport();
    const memoryStats = this.memory.getMemoryStats();
    
    return {
      trading_performance: sessionReport,
      system_metrics: memoryStats,
      recommendations: [
        'Continue current strategy based on positive results',
        'Consider increasing position size if win rate maintains above 60%',
        'Monitor drawdown levels closely'
      ]
    };
  }

  async generateSetupGuide(context) {
    return {
      quick_start: [
        '1. Ensure Node.js is installed',
        '2. Run: npm install in the mover directory',
        '3. Copy .env.example to .env and configure your settings',
        '4. Start with: node mover-server.js',
        '5. Open http://localhost:4000 in your browser'
      ],
      environment_variables: [
        'BOT_WS_URL - WebSocket URL of your trading bot',
        'MOVER_PERSONALITY - Choose your AI personality',
        'VOICE_ENABLED - Enable voice narration'
      ],
      troubleshooting: [
        'If connection fails, check if trading bot is running',
        'Verify firewall settings allow WebSocket connections',
        'Check logs in ./logs directory for detailed errors'
      ]
    };
  }

  async generateRecommendations() {
    const health = await this.support.checkSystemHealth();
    const trading = this.core.getSessionReport();
    
    const recommendations = [];
    
    if (parseFloat(trading.winRate) < 50) {
      recommendations.push('Consider adjusting trading strategy - win rate below 50%');
    }
    
    if (health.recent_errors?.shortTerm?.length > 5) {
      recommendations.push('Multiple recent errors detected - review system stability');
    }
    
    return recommendations;
  }

  async getScheduledTasks() {
    return [
      { task: 'Daily performance report', time: '09:00', status: 'scheduled' },
      { task: 'Memory cleanup', time: '00:00', status: 'scheduled' },
      { task: 'System health check', time: 'every hour', status: 'active' }
    ];
  }

  broadcast(event, data) {
    // Send to all connected systems
    this.emit(event, data);
    
    // Log for memory
    this.memory.recordEvent(event, data);
  }
}

module.exports = MoverIntegrationHub;
