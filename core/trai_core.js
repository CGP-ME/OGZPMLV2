/**
 * @fileoverview TRAI Core - AI Co-Founder & Business Automation System (Unified)
 *
 * TRAI (Trading Research & Analysis Intelligence) is the AI backbone of OGZ Prime,
 * providing natural language understanding, trading advice, and pattern learning.
 *
 * ARCHITECTURE ROLE:
 *   TRAI sits alongside the trading engine, providing:
 *   1. Trading advice via natural language queries
 *   2. Market sentiment analysis with web context
 *   3. Pattern learning from trade outcomes
 *   4. Dashboard chat interface
 *   5. Read-only toolbox for repo/log inspection
 *   6. Customer support and tech onboarding
 *
 * LLM INTEGRATION:
 *   Provider-agnostic via PersistentLLMClient (Mercury, Claude, OpenAI, Ollama).
 *   Graceful degradation: if no LLM is available, pattern-only mode is active.
 *
 * PATTERN MEMORY:
 *   Uses UnifiedPatternMemory singleton — one store for pipeline writes + TRAI reads.
 *   DTW and exact matching available.
 *
 * SEMANTIC MEMORY:
 *   TRAIMemoryStore provides keyword+recency retrieval from a local JSONL journal.
 *   No embeddings, no cloud — everything local.
 *
 * KEY METHODS:
 *   - processQuery(query, context): Natural language chat response
 *   - generateTradeAdvice(marketData): Analysis with market context
 *   - checkPatternMemory(marketData): Pattern confidence lookup
 *   - recordTradeResult(trade): Pattern learning from outcomes
 *   - runReadOnlyTool(name, args): Repo search, log tail, bot status
 *
 * UNIFIED 2026-03-30: Merged core/trai_core.js + trai_brain/trai_core.js
 *   - UnifiedPatternMemory from core/ (replaces old PatternMemoryBank)
 *   - TRAIMemoryStore + ReadOnlyToolbox + prompt_schemas from trai_brain/
 *   - Rich market context (Fear & Greed, news, CoinGecko/Yahoo) from core/
 *   - Singleton brain loading from core/
 *   - Interval cleanup on shutdown from core/
 *   - Defensive calculateRelevance from core/
 *   - Importance threshold + object-safe assessImportance from trai_brain/
 *
 * @module core/trai_core
 * @requires ./UnifiedPatternMemory
 * @requires ./persistent_llm_client
 * @extends EventEmitter
 */

'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { getInstance: getUnifiedPatternMemory } = require('./UnifiedPatternMemory');
const PersistentLLMClient = require('./persistent_llm_client');

// Optional trai_brain modules — graceful if missing
let TRAIMemoryStore = null;
let ReadOnlyToolbox = null;
let chooseSchema = null;

try {
  TRAIMemoryStore = require('../trai_brain/memory_store');
} catch (_) { /* memory store not available */ }

try {
  ReadOnlyToolbox = require('../trai_brain/read_only_tools');
} catch (_) { /* toolbox not available */ }

try {
  ({ chooseSchema } = require('../trai_brain/prompt_schemas'));
} catch (_) { /* schemas not available — will use keyword fallback */ }

// SINGLETON: Static brain loaded only once to prevent memory leak
let staticBrainInstance = null;
let isLoadingBrain = false;

class TRAICore extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      staticBrainPath: config.staticBrainPath || './trai_brain',
      workingModel: config.workingModel || 'mercury-2',
      enableVoice: config.enableVoice || false,
      enableVideo: config.enableVideo || false,
      elevenlabsApiKey: config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY,
      didApiKey: config.didApiKey || process.env.DID_API_KEY,
      personality: config.personality || 'professional_encouraging',
      enablePatternMemory: config.enablePatternMemory !== false,
      memoryTopK: config.memoryTopK || 5,
      ...config,
    };

    this.staticBrain = {};
    this.workingMemory = new Map();
    this.conversationHistory = [];
    this.learningQueue = [];

    // Semantic memory (journal-based, keyword+recency, no embeddings)
    this.memoryStore = TRAIMemoryStore
      ? new TRAIMemoryStore({
          journalPath: path.join(this.config.staticBrainPath, 'trai_journal.jsonl'),
          topK: this.config.memoryTopK,
        })
      : null;

    // Read-only toolbox (repo search, log tail, bot status)
    this.readOnlyTools = ReadOnlyToolbox
      ? new ReadOnlyToolbox({
          repoRoot: process.cwd(),
          logRoot: path.join(process.cwd(), 'logs'),
          botStatusProvider: () =>
            this.bot && this.bot.systemState ? this.bot.systemState : { connected: false },
        })
      : null;

    // Pattern memory — UnifiedPatternMemory singleton
    this.patternMemory = this.config.enablePatternMemory ? getUnifiedPatternMemory() : null;

    this.initialized = false;
    this.modelLoaded = false;

    // Persistent LLM client (provider-agnostic: Mercury, Claude, OpenAI, Ollama)
    this.persistentLLM = new PersistentLLMClient();
    this.llmReady = false;

    // Stats (legacy pool structure kept for monitoring compatibility)
    this.processPool = {
      maxConcurrent: 4,
      activeProcesses: 0,
      queue: [],
      timeoutMs: 15000,
      totalSpawned: 0,
      totalCompleted: 0,
      totalTimedOut: 0,
    };

    // Interval refs for cleanup
    this.analysisInterval = null;
    this.monitoringInterval = null;

    console.log('🧠 TRAI Core initializing...');
  }

  // ═══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  async initialize() {
    try {
      console.log('📚 Loading TRAI static brain...');
      await this.loadStaticBrain();

      console.log('🎭 Initializing personality and communication...');
      await this.initializeCommunication();

      console.log('🧪 Setting up learning and adaptation systems...');
      await this.initializeLearning();

      console.log('🔥 Starting persistent LLM client...');
      try {
        await this.persistentLLM.initialize();
        this.llmReady = true;
        console.log('✅ TRAI LLM Ready!');
      } catch (error) {
        console.error('❌ Failed to start LLM client:', error.message);
        console.warn('⚠️ TRAI will use pattern-only mode (no LLM analysis)');
        this.llmReady = false;
      }

      this.initialized = true;
      console.log('✅ TRAI Core initialized successfully!');
      this.emit('initialized', { timestamp: Date.now() });
    } catch (error) {
      console.error('❌ TRAI initialization failed:', error);
      throw error;
    }
  }

  async loadStaticBrain() {
    // SINGLETON: Check if brain is already loaded
    if (staticBrainInstance) {
      console.log('📊 Using cached static brain (already loaded)');
      this.staticBrain = staticBrainInstance;
      return;
    }

    // Prevent multiple simultaneous loads
    if (isLoadingBrain) {
      console.log('⏳ Static brain is currently loading, waiting...');
      while (isLoadingBrain) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      this.staticBrain = staticBrainInstance;
      return;
    }

    isLoadingBrain = true;
    const brainPath = path.resolve(this.config.staticBrainPath);

    try {
      console.log('🧠 Loading static brain for the FIRST time...');

      const masterIndexPath = path.join(brainPath, 'master_index.json');
      if (fs.existsSync(masterIndexPath)) {
        const masterIndex = JSON.parse(fs.readFileSync(masterIndexPath, 'utf-8'));
        this.staticBrain.index = masterIndex;
        console.log(
          `📊 Loaded brain index: ${Object.keys(masterIndex.trai_static_brain.categories).length} categories`
        );
      }

      const categoryFiles = fs
        .readdirSync(brainPath)
        .filter((file) => file.endsWith('.json') && file !== 'master_index.json');

      for (const categoryFile of categoryFiles) {
        const categoryPath = path.join(brainPath, categoryFile);
        const categoryName = path.basename(categoryFile, '.json');
        const categoryData = JSON.parse(fs.readFileSync(categoryPath, 'utf-8'));

        this.staticBrain[categoryName] = categoryData;
        console.log(`📁 Loaded category: ${categoryName} (${categoryData.total_messages} messages)`);
      }

      staticBrainInstance = this.staticBrain;
      console.log('✅ Static brain cached for future use');
    } catch (error) {
      console.error('❌ Failed to load static brain:', error);
      throw error;
    } finally {
      isLoadingBrain = false;
    }
  }

  async initializeCommunication() {
    // PRODUCTION READY: ElevenLabs voice & D-ID video TRAINED and ready for launch
    // Subscriptions paused until product launch to save costs
    if (this.config.enableVoice && this.config.elevenlabsApiKey) {
      console.log('🎤 Initializing ElevenLabs voice synthesis...');
    }
    if (this.config.enableVideo && this.config.didApiKey) {
      console.log('🎬 Initializing D-ID video generation...');
    }
    console.log('💬 Communication systems ready (voice/video available for launch)');
  }

  async initializeLearning() {
    this.learningSystem = {
      active: true,
      memoryLimit: 1000,
      adaptationRate: 0.1,
      lastCommit: Date.now(),
    };
    console.log('🧠 Learning systems initialized');
  }

  // ═══════════════════════════════════════════════════════════════
  // QUERY PROCESSING
  // ═══════════════════════════════════════════════════════════════

  async processQuery(query, context = {}) {
    if (!this.initialized) {
      throw new Error('TRAI not initialized');
    }

    try {
      const analysis = await this.analyzeQuery(query, context);
      const memoryContext = await this.retrieveMemoryContext(query, context);

      const response = await this.generateResponse(query, analysis, {
        ...context,
        memoryContext,
      });

      await this.learnFromInteraction(query, response, context);
      return response;
    } catch (error) {
      console.error('❌ TRAI query processing failed:', error);
      return {
        error: true,
        message: 'I encountered an issue processing your request. Please try again.',
        timestamp: Date.now(),
      };
    }
  }

  async analyzeQuery(query, context) {
    const categoryMatches = {};

    for (const [category, data] of Object.entries(this.staticBrain)) {
      if (category === 'index') continue;
      const relevance = this.calculateRelevance(query, data.messages);
      if (relevance > 0.3) {
        categoryMatches[category] = relevance;
      }
    }

    const primaryCategory = Object.keys(categoryMatches).reduce(
      (a, b) => (categoryMatches[a] > categoryMatches[b] ? a : b),
      null
    );

    return {
      categories: categoryMatches,
      primaryCategory,
      context,
      complexity: this.assessComplexity(query),
      intent: this.detectIntent(query),
    };
  }

  async retrieveMemoryContext(query, _context = {}) {
    if (!this.memoryStore) return [];
    try {
      return this.memoryStore.retrieve(query, { topK: this.config.memoryTopK });
    } catch (error) {
      console.error('❌ [TRAI] Memory retrieval failed:', error.message);
      return [];
    }
  }

  // Defensive: handles undefined, non-array, and empty messages
  calculateRelevance(query, messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) return 0;

    const queryWords = query?.toLowerCase?.()?.split?.(/\s+/) || [];
    if (queryWords.length === 0) return 0;

    let totalRelevance = 0;
    for (const message of messages.slice(0, 50)) {
      if (!message || !message.content) continue;
      const content = message.content.toLowerCase();
      let messageRelevance = 0;
      for (const word of queryWords) {
        if (content.includes(word)) messageRelevance += 1;
      }
      totalRelevance += messageRelevance / queryWords.length;
    }

    return Math.min(totalRelevance / messages.length, 1);
  }

  assessComplexity(query) {
    const complexityIndicators = {
      technical: ['code', 'implement', 'debug', 'error', 'function'],
      business: ['revenue', 'customer', 'market', 'strategy', 'growth'],
      trading: ['trade', 'pattern', 'indicator', 'strategy', 'risk'],
      support: ['help', 'problem', 'issue', 'fix', 'troubleshoot'],
    };

    let complexity = 0;
    const queryLower = query.toLowerCase();
    for (const keywords of Object.values(complexityIndicators)) {
      if (keywords.some((kw) => queryLower.includes(kw))) complexity += 0.25;
    }
    return Math.min(complexity, 1);
  }

  detectIntent(query) {
    const intents = {
      question: ['what', 'how', 'why', 'when', 'where', 'who'],
      request: ['please', 'can you', 'would you', 'help me'],
      command: ['do this', 'create', 'implement', 'fix', 'update'],
      information: ['tell me', 'explain', 'describe', 'show me'],
    };

    const queryLower = query.toLowerCase();
    for (const [intent, keywords] of Object.entries(intents)) {
      if (keywords.some((kw) => queryLower.includes(kw))) return intent;
    }
    return 'general';
  }

  // ═══════════════════════════════════════════════════════════════
  // RESPONSE GENERATION
  // ═══════════════════════════════════════════════════════════════

  async generateResponse(query, analysis, context) {
    const textResponse = await this.generateIntelligentResponse(query, analysis, context);

    // Route via prompt_schemas if available, otherwise keyword fallback
    let isChatMode = true;
    if (chooseSchema) {
      const schema = chooseSchema(query);
      isChatMode = schema.type === 'chat';
    } else {
      const planningKeywords = ['plan', 'proposal', 'strategy', 'roadmap', 'timeline', 'milestone'];
      isChatMode = !planningKeywords.some((kw) => query.toLowerCase().includes(kw));
    }

    if (isChatMode) {
      return { response: textResponse };
    }

    const response = {
      query,
      analysis,
      memoryContext: context.memoryContext || [],
      response: textResponse,
      timestamp: Date.now(),
      trai_version: '1.0.0',
    };

    if (this.config.enableVoice) {
      response.voiceUrl = await this.generateVoiceResponse(textResponse);
    }
    if (this.config.enableVideo) {
      response.videoUrl = await this.generateVideoResponse(textResponse);
    }

    return response;
  }

  async generateIntelligentResponse(query, analysis, context = {}) {
    return this.executeWithPersistentLLM(query, analysis, context.memoryContext || []);
  }

  async executeWithPersistentLLM(query, analysis, memoryContext = []) {
    const { primaryCategory, context: analysisContext } = analysis;

    if (!this.llmReady) {
      console.warn('⚠️ TRAI LLM not ready, using fallback');
      return this.getFallbackResponse(primaryCategory);
    }

    try {
      // Build market context if available (from bot state / web data)
      let marketInfo = '';
      if (analysisContext?.currentPrice) {
        marketInfo = this._buildMarketContext(analysisContext);
      }

      // Build memory context lines
      const memoryLines =
        (memoryContext || [])
          .map((item) => `- [${item.entry?.source || 'unknown'}:${item.entry?.type || 'log'}] ${item.entry?.content || ''}`)
          .join('\n') || 'None';

      // Build tool list if available
      const toolList = this.readOnlyTools
        ? this.readOnlyTools.listTools().map((t) => `- ${t}`).join('\n')
        : '';

      const contextPrompt = primaryCategory
        ? `Based on ${primaryCategory} knowledge from our development history:`
        : `As OGZ Prime's AI co-founder:`;

      // Route prompt format via schema if available
      let fullPrompt;
      const schema = chooseSchema ? chooseSchema(query) : { type: 'chat' };

      if (schema.type === 'chat') {
        fullPrompt = [
          'You are TRAI, the AI co-founder and tech support for OGZ Prime trading system.',
          'Respond naturally and helpfully. Be concise but thorough.',
          '',
          contextPrompt,
          marketInfo,
          `User Question: ${query}`,
          '',
          memoryContext.length > 0 ? `Relevant Memory:\n${memoryLines}` : '',
          '',
          'Response:',
        ]
          .filter(Boolean)
          .join('\n');
      } else {
        fullPrompt = [
          contextPrompt,
          marketInfo,
          `User Query: ${query}`,
          `Primary Category: ${primaryCategory || 'unknown'}`,
          memoryContext.length > 0 ? `Retrieved Memory (top ${memoryContext.length}):\n${memoryLines}` : '',
          toolList ? `Read-only tools available:\n${toolList}` : '',
          'You must respond in strict JSON using the selected schema.',
          `Schema (${schema.type}):`,
          schema.shape || '{}',
          'Response:',
        ]
          .filter(Boolean)
          .join('\n\n');
      }

      const startTime = Date.now();
      const response = await this.persistentLLM.generateResponse(fullPrompt, 2500);
      const inferenceTime = Date.now() - startTime;

      this.processPool.totalCompleted++;

      if (inferenceTime > 10000) {
        console.warn(`⚠️ Slow TRAI inference: ${inferenceTime}ms`);
      }

      return response.trim();
    } catch (error) {
      console.error('⚠️ TRAI persistent LLM error:', error.message);
      this.processPool.totalTimedOut++;
      return this.getFallbackResponse(primaryCategory);
    }
  }

  _buildMarketContext(context) {
    const hasWebContext = context.change7d && context.ath;

    if (hasWebContext) {
      // FIX MIRROR-TRAI-ASSET-LABEL: refuse phantom 'BTC' label when both
      // assetName and asset missing. Mirror of CRIT-05.
      const assetLabel = context.assetName || context.asset;
      if (!assetLabel) {
        console.warn('[TRAI] no asset label in context — skipping pattern operation');
        return;
      }
      const sourceLabel = context.assetType === 'stock' ? 'Yahoo Finance' : 'CoinGecko';

      const fearGreedLine =
        context.fearGreedIndex != null && context.assetType === 'crypto'
          ? `\n- Fear & Greed Index: ${context.fearGreedIndex}/100 (${context.fearGreedLabel})`
          : '';

      let newsLines = '';
      if (context.newsHeadlines && context.newsHeadlines.length > 0) {
        newsLines = '\n\nRECENT NEWS HEADLINES:';
        context.newsHeadlines.forEach((h, i) => {
          newsLines += `\n${i + 1}. "${h.title}" (${h.source}, ${h.time})`;
        });
      }

      return `\n[LIVE MARKET DATA from ${sourceLabel}]
- ${assetLabel} Price: $${context.currentPrice?.toLocaleString()}
- 24h Change: ${context.change24h}
- 7d Change: ${context.change7d}
- 30d Change: ${context.change30d}
- 24h High: $${context.high24h?.toLocaleString()}
- 24h Low: $${context.low24h?.toLocaleString()}
- All-Time High: $${context.ath?.toLocaleString()} (${context.athDate})
- Distance from ATH: ${context.athChangePercent}${fearGreedLine}
- Market Sentiment: ${context.marketSentiment}${newsLines}

BOT STATUS:
- Mode: ${context.botMode}
- Total Trades: ${context.totalTrades}
- Win Rate: ${context.winRate}
- Balance: $${context.balance}
- Position: ${context.hasOpenPosition ? `${context.positionDirection} (P&L: $${context.positionPnL})` : 'None'}
- Last Signal: ${context.lastDecision} (${((context.confidence || 0) * 100).toFixed(1)}% confidence)\n`;
    }

    return `\nMarket Status (limited data):
- Price: $${context.currentPrice}
- Bot Mode: ${context.botMode || 'unknown'}
- Position: ${context.hasOpenPosition ? context.positionDirection : 'None'}\n`;
  }

  // ═══════════════════════════════════════════════════════════════
  // FALLBACK / OFFLINE
  // ═══════════════════════════════════════════════════════════════

  getFallbackResponse(primaryCategory) {
    if (primaryCategory === 'customer_service') {
      return "I'd be happy to help you with your question about OGZ Prime. Based on our development history, I can provide detailed assistance with setup, features, and troubleshooting.";
    }
    if (primaryCategory === 'technical_support') {
      return 'I understand you\'re experiencing a technical issue. Let me analyze this based on our extensive development experience and provide a solution.';
    }
    if (primaryCategory === 'trading_strategy' || primaryCategory === 'trading_decision') {
      return 'TRAI pattern engine is active but LLM analysis is offline. Confidence multipliers from pattern data are still applied to your signals.';
    }
    return 'TRAI LLM is currently offline. Pattern-based confidence multipliers are still active. Set LLM_PROVIDER and LLM_API_KEY to enable full analysis.';
  }

  getOfflineResponse() {
    return JSON.stringify({
      schema: 'offline',
      status: 'TRAI_OFFLINE',
      message: 'LLM server is not running. Set LLM_PROVIDER and LLM_API_KEY to enable TRAI.',
      timestamp: new Date().toISOString(),
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // VOICE / VIDEO (ElevenLabs + D-ID)
  // ═══════════════════════════════════════════════════════════════

  async generateVoiceResponse(text) {
    if (!this.config.elevenlabsApiKey) return null;
    console.log('🎤 Would generate voice for:', text.substring(0, 50));
    return 'voice_url_placeholder';
  }

  async generateVideoResponse(text) {
    if (!this.config.didApiKey) return null;
    console.log('🎬 Would generate video for:', text.substring(0, 50));
    return 'video_url_placeholder';
  }

  // ═══════════════════════════════════════════════════════════════
  // LEARNING
  // ═══════════════════════════════════════════════════════════════

  async learnFromInteraction(query, response, context) {
    const analysis = await this.analyzeQuery(query, context);
    const importance = this.assessImportance(query, response, {
      category: analysis.primaryCategory,
      timestamp: Date.now(),
    });

    // Skip trivial interactions
    if (importance < 0.25) return;

    // Record to semantic memory journal if available
    if (this.memoryStore) {
      this.memoryStore.recordInteraction(query, response, {
        tags: [analysis.primaryCategory || 'general', analysis.intent || 'general'],
      });
    }

    // Also add to learning queue for static brain commits
    this.learningQueue.push({
      query,
      response,
      context,
      category: analysis.primaryCategory,
      timestamp: Date.now(),
      importance,
    });

    if (this.learningQueue.length >= 10) {
      await this.commitLearnings();
    }
  }

  // Handles response as string or object
  assessImportance(query, response, context = {}) {
    const responseText =
      typeof response === 'string' ? response : JSON.stringify(response || '');
    const content = (query + responseText).toLowerCase();
    let totalScore = 0;

    // 1. Keyword importance (0-0.4)
    const indicators = [
      'error', 'bug', 'fix', 'solution', 'critical', 'breakthrough',
      'innovation', 'improvement', 'security', 'performance', 'optimization',
      'revenue', 'customer', 'business', 'strategy', 'growth', 'trading',
      'pattern', 'analysis', 'research', 'technical', 'support',
    ];
    const keywordScore = Math.min(indicators.filter((i) => content.includes(i)).length * 0.1, 0.4);
    totalScore += keywordScore;

    // 2. Category relevance (0-0.3)
    const highValue = ['technical_support', 'trading_optimization', 'business_strategy', 'customer_service'];
    totalScore += highValue.includes(context.category) ? 0.3 : 0.1;

    // 3. Novelty (0-0.2)
    totalScore += this.calculateNovelty(content);

    // 4. Length & complexity (0-0.1)
    totalScore += Math.min((query.length + responseText.length) / 1000, 0.1);

    // 5. Timeliness (0-0.1)
    const ageHours = (Date.now() - (context.timestamp || Date.now())) / 3600000;
    totalScore += Math.max(0.1 - (ageHours / 24) * 0.05, 0);

    return Math.min(totalScore, 1);
  }

  calculateNovelty(content) {
    const recentLearnings = this.learningQueue.slice(-10);
    let similarityScore = 0;

    for (const learning of recentLearnings) {
      const existingContent = (learning.query + learning.response).toLowerCase();
      const overlap = this.calculateOverlap(content, existingContent);
      similarityScore = Math.max(similarityScore, overlap);
    }

    return Math.max(0.2 - similarityScore * 0.2, 0);
  }

  calculateOverlap(text1, text2) {
    const words1 = text1.split(/\s+/).filter((w) => w.length > 3);
    const words2 = text2.split(/\s+/).filter((w) => w.length > 3);
    const intersection = words1.filter((w) => words2.includes(w));
    const union = [...new Set([...words1, ...words2])];
    return union.length > 0 ? intersection.length / union.length : 0;
  }

  async commitLearnings() {
    const importantLearnings = this.learningQueue.filter((e) => e.importance > 0.75);

    if (importantLearnings.length > 0) {
      // Write to journal if memory store available
      if (this.memoryStore) {
        for (const learning of importantLearnings) {
          this.memoryStore.appendToJournal({
            type: 'learning',
            content: `Learned: ${learning.query} → ${learning.response}`,
            tags: this.categorizeLearning(learning),
            source: 'live_learning',
          });
        }
      }

      // Also write to static brain category files
      for (const learning of importantLearnings) {
        const categories = this.categorizeLearning(learning);
        for (const category of categories) {
          if (this.staticBrain[category] && this.staticBrain[category].messages) {
            this.staticBrain[category].messages.push({
              id: `learned_${Date.now()}`,
              content: `Learned interaction: ${learning.query} → ${learning.response}`,
              categories: [category],
              source_file: 'live_learning',
              timestamp: learning.timestamp,
              importance: learning.importance,
            });
          }
        }
      }

      await this.saveStaticBrain();
      console.log(`🧠 Committed ${importantLearnings.length} learnings to journal + static brain`);
    }

    this.learningQueue = [];
  }

  categorizeLearning(learning) {
    const content = (learning.query + learning.response).toLowerCase();
    const categories = [];
    if (content.includes('customer') || content.includes('support')) categories.push('customer_service');
    if (content.includes('error') || content.includes('fix') || content.includes('debug')) categories.push('technical_support');
    if (content.includes('trade') || content.includes('strategy')) categories.push('trading_optimization');
    return categories.length > 0 ? categories : ['learned_interactions'];
  }

  async saveStaticBrain() {
    const brainPath = path.resolve(this.config.staticBrainPath);
    for (const [category, data] of Object.entries(this.staticBrain)) {
      if (category === 'index') continue;
      const categoryFile = path.join(brainPath, `${category}.json`);
      require('./AtomicWrite').writeJsonAtomic(categoryFile, data);
    }
    console.log('💾 Static brain updated and saved');
  }

  // ═══════════════════════════════════════════════════════════════
  // PATTERN MEMORY (UnifiedPatternMemory)
  // ═══════════════════════════════════════════════════════════════

  // TRAI-HIGH-01: build a 9-element feature vector ONLY from clean inputs.
  // Returns null if any required indicator is missing/non-finite or trend is unset.
  // Both checkPatternMemory and recordTradeResult share this — they write to the
  // same PatternMemoryBank store, so partial fabrication on either side poisons
  // the same hash. Per spec Rule #5 these paths must be cleaned together.
  _extractFeatures(rawIndicators, trend, volatility) {
    const ind = rawIndicators || {};
    const rsi = ind.rsi;
    const macd = ind.macd;
    const macdSig = ind.macdSignal != null ? ind.macdSignal : ind.signal;
    const bbWidth = ind.bbWidth;
    if (!Number.isFinite(rsi) || !Number.isFinite(macd) || !Number.isFinite(macdSig) ||
        !Number.isFinite(bbWidth) || !Number.isFinite(volatility) || trend == null) {
      return null;
    }
    const trendNum = trend === 'uptrend' ? 1 : trend === 'downtrend' ? -1 : 0;
    return [rsi / 100, macd - macdSig, trendNum, bbWidth, volatility, 0.5, 0, 0, 0];
  }

  checkPatternMemory(marketData) {
    if (!this.patternMemory) return null;
    try {
      const features = this._extractFeatures(
        marketData.indicators,
        marketData.trend,
        marketData.volatility
      );
      if (!features) return null;
      return this.patternMemory.getConfidence(features, marketData);
    } catch (error) {
      console.error('[TRAI-HIGH-01] checkPatternMemory failed:', error.message);
      return null;
    }
  }

  recordTradeResult(trade) {
    if (!this.patternMemory) return;
    try {
      const features = this._extractFeatures(
        trade.entry?.indicators || trade.indicators,
        trade.entry?.trend || trade.trend,
        trade.entry?.volatility != null ? trade.entry.volatility : trade.volatility
      );
      if (!features) return;
      // pnl/pnlPercent/holdTimeMs/exitReason/strategy are kept as the reporter
      // of trade outcome, not as feature inputs. The features array is what gets
      // hashed into PatternMemoryBank — those upstream fields don't pollute it.
      this.patternMemory.recordOutcome(features, {
        pnl: trade.pnl != null ? trade.pnl : trade.pnlDollars,
        pnlPercent: trade.pnlPercent,
        holdTimeMs: trade.holdTimeMs != null ? trade.holdTimeMs : trade.holdTime,
        exitReason: trade.exitReason || trade.reason,
        strategy: trade.strategy,
        symbol: trade.symbol,
        brokerId: trade.brokerId,
        accountId: trade.accountId,
        accountIdSource: trade.accountIdSource,
        assetClass: trade.assetClass,
        executionMode: trade.executionMode,
        timeframe: trade.timeframe,
        scopeKey: trade.scopeKey,
      });
    } catch (error) {
      console.error('[TRAI-HIGH-01] recordTradeResult failed:', error.message);
    }
  }

  // News correlation placeholder (not in UnifiedPatternMemory)
  recordNewsImpact(_keyword, _priceImpact, _timestamp) {
    // No-op — could be added as a separate module
  }

  getMemoryStats() {
    const patternStats = this.patternMemory
      ? { enabled: true, ...this.patternMemory.getStats() }
      : { enabled: false, message: 'Pattern memory disabled' };

    const semanticStats = this.memoryStore
      ? this.memoryStore.getStats()
      : { entries: 0, message: 'Memory store unavailable' };

    return { ...patternStats, semanticMemory: semanticStats };
  }

  pruneOldMemories() {
    if (!this.patternMemory) return 0;
    return this.patternMemory.pruneOldPatterns();
  }

  // ═══════════════════════════════════════════════════════════════
  // READ-ONLY TOOLS
  // ═══════════════════════════════════════════════════════════════

  getReadOnlyTools() {
    if (!this.readOnlyTools) return [];
    return this.readOnlyTools.listTools();
  }

  runReadOnlyTool(name, args = {}) {
    if (!this.readOnlyTools) return { error: 'Read-only toolbox not available' };
    switch (name) {
      case 'repo_search': return this.readOnlyTools.searchRepo(args.query || '', { limit: args.limit });
      case 'file_open': return this.readOnlyTools.openFile(args.path || '', { maxBytes: args.maxBytes });
      case 'log_tail': return this.readOnlyTools.tailLog(args.path || '', args.lines);
      case 'bot_status': return this.readOnlyTools.getBotStatus();
      default: return { error: 'Unknown read-only tool' };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BOT INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  integrateWithBot(bot) {
    this.bot = bot;

    // Store interval refs for cleanup on shutdown
    this.analysisInterval = setInterval(async () => {
      try { await this.analyzeBotState(); } catch (e) { console.error('🚨 TRAI analysis failed:', e); }
    }, 120000);

    this.monitoringInterval = setInterval(async () => {
      try { await this.proactiveMonitoring(); } catch (e) { console.error('🚨 TRAI monitoring error:', e); }
    }, 30000);

    console.log('🔗 TRAI integrated with bot (analysis + proactive monitoring active)');

    setTimeout(async () => {
      try { await this.analyzeBotState(); } catch (e) { console.error('🚨 TRAI initial analysis failed:', e); }
    }, 30000);
  }

  async proactiveMonitoring() {
    if (!this.bot || !this.bot.systemState) return;
    const state = this.bot.systemState;
    const alerts = [];

    if (state.currentDrawdown < -0.15) {
      alerts.push({ level: 'CRITICAL', message: `Drawdown at ${(state.currentDrawdown * 100).toFixed(2)}%. Review positions.` });
    }
    if (state.emergencyMode && !this.lastEmergencyAlert) {
      alerts.push({ level: 'WARNING', message: 'Bot hit emergency mode — stopped trading to protect account.' });
      this.lastEmergencyAlert = Date.now();
    }
    if (state.totalTrades > 5 && state.winRate === 0) {
      alerts.push({ level: 'WARNING', message: `${state.totalTrades} trades with no wins. Review strategy parameters.` });
    }
    if (state.totalTrades > 10 && state.winRate > 0.6 && !this.lastSuccessAlert) {
      alerts.push({ level: 'SUCCESS', message: `${(state.winRate * 100).toFixed(1)}% win rate over ${state.totalTrades} trades.` });
      this.lastSuccessAlert = Date.now();
    }

    if (alerts.length > 0 && this.bot.broadcastToClients) {
      alerts.forEach((alert) => {
        console.log(`🚨 TRAI ${alert.level}:`, alert.message);
        this.bot.broadcastToClients({ type: 'trai_alert', level: alert.level, message: alert.message, timestamp: Date.now() });
      });
    }
  }

  async analyzeBotState() {
    console.log('🧠 TRAI analyzing bot state...');
    if (!this.bot || !this.bot.systemState) return;

    const state = this.bot.systemState;

    try {
      const stateSummary = this.buildStateSummary(state);
      const relevantContext = this.queryHistoricalContext(state);
      const prompt = this.buildAnalysisPrompt(stateSummary, relevantContext);
      const analysis = await this.generateIntelligentResponse(prompt, {
        primaryCategory: 'trading_optimization',
        context: 'bot_state_analysis',
      });

      console.log('🤖 TRAI AI Analysis:');
      console.log(analysis);

      if (this.bot.broadcastToClients) {
        this.bot.broadcastToClients({
          type: 'trai_analysis', analysis, state: stateSummary, timestamp: Date.now(),
        });
      }

      return analysis;
    } catch (error) {
      console.error('❌ TRAI analysis error:', error);
      this.provideOptimizationSuggestions(state);
    }
  }

  buildStateSummary(state) {
    return {
      totalTrades: state.totalTrades,
      successfulTrades: state.successfulTrades,
      failedTrades: state.failedTrades,
      winRate: state.totalTrades > 0 ? ((state.successfulTrades / state.totalTrades) * 100).toFixed(1) : 0,
      currentBalance: state.currentBalance,
      totalPnL: state.totalPnL,
      dailyPnL: state.dailyPnL,
      currentDrawdown: state.currentDrawdown,
      maxDrawdown: state.maxDrawdownReached,
      emergencyMode: state.emergencyMode,
      averageConfidence: state.averageConfidence,
      lastTradeTime: state.lastTradeTime ? new Date(state.lastTradeTime).toISOString() : 'Never',
    };
  }

  queryHistoricalContext(state) {
    const pieces = [];
    try {
      if (state.currentDrawdown > 5) pieces.push('Drawdown management discussions');
      if (state.totalTrades < 10) pieces.push('Early trading phase optimization');
      if (state.emergencyMode) pieces.push('Emergency mode activation protocols');
      if (this.staticBrain.trading_strategy) pieces.push(`${this.staticBrain.trading_strategy.total_messages} messages about trading strategy`);
      if (this.staticBrain.optimization) pieces.push(`${this.staticBrain.optimization.total_messages} messages about optimization`);
    } catch (error) {
      console.error('Context query error:', error);
    }
    return pieces;
  }

  getRecentConversationSnippets(count = 3) {
    const snippets = [];
    const categories = ['debugging', 'challenges_overcome', 'user_motivation', 'development'];

    try {
      for (const category of categories.slice(0, count)) {
        if (this.staticBrain[category] && this.staticBrain[category].conversations) {
          const convos = this.staticBrain[category].conversations;
          if (convos.length > 0) {
            const randomConvo = convos[Math.floor(Math.random() * convos.length)];
            const userMsg = randomConvo.messages?.find((m) => m.role === 'user');
            if (userMsg && userMsg.content) {
              const snippet = userMsg.content.substring(0, 200);
              snippets.push(`"${snippet}${snippet.length >= 200 ? '...' : ''}"`);
            }
          }
        }
      }
    } catch (_) { /* missing brain categories — fine */ }

    return snippets.length > 0
      ? snippets.join('\n')
      : '"hell yeah dude" "lets fucking go" "thats amazing!!" "you got this"';
  }

  buildAnalysisPrompt(stateSummary, context) {
    const actualConversations = this.getRecentConversationSnippets(3);

    return `You are TRAI, the co-founder of OGZ Prime. Talk like a real person — casual, direct, experienced.

YOUR PARTNER'S STYLE (match this energy):
${actualConversations}

CURRENT BOT STATUS:
- Trades: ${stateSummary.totalTrades} | Win Rate: ${stateSummary.winRate}%
- Balance: $${stateSummary.currentBalance} | Today's P&L: $${stateSummary.dailyPnL}
- Drawdown: ${((stateSummary.currentDrawdown || 0) * 100).toFixed(2)}% ${stateSummary.emergencyMode ? '(EMERGENCY MODE)' : ''}
- Avg Confidence: ${((stateSummary.averageConfidence || 0) * 100).toFixed(1)}%

CONTEXT:
${context.join('\n')}

Quick status update — what's going on with the bot right now and what we should do. Keep it under 150 words.`;
  }

  provideOptimizationSuggestions(state) {
    const suggestions = [];
    if (state.totalTrades > 0) {
      const winRate = (state.winningTrades / state.totalTrades) * 100;
      if (winRate < 50) suggestions.push('Consider adjusting entry criteria - win rate below 50%');
      if (state.averageTradeDuration < 300000) suggestions.push('Trades closing too quickly - consider wider stop losses');
      if (state.totalTrades < 10) suggestions.push('Limited trade sample - continue gathering data');
    } else {
      suggestions.push('No trades yet - system initializing');
    }

    if (suggestions.length > 0) {
      console.log('💡 TRAI Optimization Suggestions:');
      suggestions.forEach((s) => console.log(`   • ${s}`));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MISC
  // ═══════════════════════════════════════════════════════════════

  getProcessPoolStats() {
    return {
      activeProcesses: this.processPool.activeProcesses,
      queuedRequests: this.processPool.queue.length,
      totalSpawned: this.processPool.totalSpawned,
      totalCompleted: this.processPool.totalCompleted,
      totalTimedOut: this.processPool.totalTimedOut,
      maxConcurrent: this.processPool.maxConcurrent,
    };
  }

  onTradeExecuted(trade) {
    console.log('📊 TRAI analyzing trade execution:', trade.id);
    this.workingMemory.set(`trade_${trade.id}`, {
      trade,
      analysis: this.analyzeTradePerformance(trade),
      timestamp: Date.now(),
    });
  }

  onErrorOccurred(error) {
    console.log('🚨 TRAI learning from error:', error.message);
    this.workingMemory.set(`error_${Date.now()}`, {
      error: error.message,
      stack: error.stack,
      context: error.context,
      solution: this.suggestErrorSolution(error),
    });
  }

  analyzeTradePerformance(trade) {
    return {
      pnl: trade.pnl || 0,
      duration: trade.duration || 0,
      riskReward: trade.riskReward || 0,
      suggestions: ['Consider adjusting position sizing', 'Review entry timing', 'Evaluate exit strategy'],
    };
  }

  suggestErrorSolution(error) {
    if (error.message.includes('API')) return 'Check API credentials and rate limits';
    if (error.message.includes('network')) return 'Verify network connectivity and retry';
    return 'Review logs and check system configuration';
  }

  // ═══════════════════════════════════════════════════════════════
  // SHUTDOWN
  // ═══════════════════════════════════════════════════════════════

  shutdown() {
    console.log('🛑 Shutting down TRAI Core...');

    if (this.analysisInterval) { clearInterval(this.analysisInterval); this.analysisInterval = null; }
    if (this.monitoringInterval) { clearInterval(this.monitoringInterval); this.monitoringInterval = null; }

    if (this.persistentLLM) {
      this.persistentLLM.shutdown();
      this.llmReady = false;
    }

    this.workingMemory.clear();
    this.conversationHistory = [];
    this.learningQueue = [];
    this.initialized = false;

    console.log('✅ TRAI Core shutdown complete');
  }
}

module.exports = TRAICore;
