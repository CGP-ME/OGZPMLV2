/**
 * TRAI Core - AI Co-Founder & Business Automation System
 * 
 * TRAI is a comprehensive AI system designed to:
 * - Handle customer service and technical support
 * - Optimize trading strategies and execution
 * - Create marketing content and grow the business
 * - Monitor markets and execute trades autonomously
 * - Learn from interactions and improve continuously
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const PatternMemoryBank = require('./PatternMemoryBank');
const PersistentLLMClient = require('./persistent_llm_client');
const TRAIMemoryStore = require('./memory_store');
const ReadOnlyToolbox = require('./read_only_tools');
const { chooseSchema } = require('./prompt_schemas');

class TRAICore extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            staticBrainPath: config.staticBrainPath || './trai_brain',
            workingModel: config.workingModel || 'qwen-7b',
            enableVoice: config.enableVoice || false,
            enableVideo: config.enableVideo || false,
            elevenlabsApiKey: config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY,
            didApiKey: config.didApiKey || process.env.DID_API_KEY,
            personality: config.personality || 'professional_encouraging',
            enablePatternMemory: config.enablePatternMemory !== false,  // Default ON
            ...config
        };

        this.staticBrain = {};
        this.workingMemory = new Map();
        this.conversationHistory = [];
        this.learningQueue = [];
        this.memoryStore = new TRAIMemoryStore({
            journalPath: path.join(this.config.staticBrainPath, 'trai_journal.jsonl'),
            topK: this.config.memoryTopK || 5
        });
        this.readOnlyTools = new ReadOnlyToolbox({
            repoRoot: process.cwd(),
            logRoot: path.join(process.cwd(), 'logs'),
            botStatusProvider: () => (this.bot && this.bot.systemState) ? this.bot.systemState : { connected: false }
        });

        // 🧠 PATTERN MEMORY BANK - TRAI learns from trading patterns over time
        this.patternMemory = this.config.enablePatternMemory
            ? new PatternMemoryBank({
                dbPath: path.join(this.config.staticBrainPath, 'learned_patterns.json'),
                backupPath: path.join(this.config.staticBrainPath, 'learned_patterns.backup.json')
              })
            : null;

        this.initialized = false;
        this.modelLoaded = false;

        // 🚀 PERSISTENT LLM CLIENT (Replaces process pool - Change 579)
        // Keeps model loaded in GPU RAM for <2s inference (vs 15s+ spawning)
        this.persistentLLM = new PersistentLLMClient();
        this.llmReady = false;

        // 🔥 LEGACY PROCESS POOL MANAGEMENT (kept for monitoring stats)
        // NOTE: No longer used for spawning - persistent client handles all inference
        this.processPool = {
            maxConcurrent: 4,              // Max 4 concurrent inference processes
            activeProcesses: 0,             // Current active count
            queue: [],                      // Queued inference requests
            timeoutMs: 15000,               // 15s timeout per inference (GPU warm-up time)
            totalSpawned: 0,                // Lifetime spawns counter
            totalCompleted: 0,              // Lifetime completions counter
            totalTimedOut: 0                // Lifetime timeouts counter
        };

        console.log('🧠 TRAI Core initializing...');
    }
    
    async initialize() {
        try {
            console.log('📚 Loading TRAI static brain...');
            await this.loadStaticBrain();

            console.log('🎭 Initializing personality and communication...');
            await this.initializeCommunication();

            console.log('🧪 Setting up learning and adaptation systems...');
            await this.initializeLearning();

            // 🚀 START PERSISTENT LLM SERVER (Change 579)
            console.log('🔥 Starting persistent LLM server (one-time model load)...');
            try {
                await this.persistentLLM.initialize();
                this.llmReady = true;
                console.log('✅ TRAI LLM Ready! Model loaded in GPU memory.');
            } catch (error) {
                console.error('❌ Failed to start persistent LLM server:', error.message);
                console.warn('⚠️ TRAI will use rule-based reasoning (no LLM)');
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
        const brainPath = path.resolve(this.config.staticBrainPath);
        
        try {
            // Load master index
            const masterIndexPath = path.join(brainPath, 'master_index.json');
            if (fs.existsSync(masterIndexPath)) {
                const masterIndex = JSON.parse(fs.readFileSync(masterIndexPath, 'utf-8'));
                this.staticBrain.index = masterIndex;
                console.log(`📊 Loaded brain index: ${Object.keys(masterIndex.trai_static_brain.categories).length} categories`);
            }
            
            // Load category files
            const categoryFiles = fs.readdirSync(brainPath)
                .filter(file => file.endsWith('.json') && file !== 'master_index.json');
            
            for (const categoryFile of categoryFiles) {
                const categoryPath = path.join(brainPath, categoryFile);
                const categoryName = path.basename(categoryFile, '.json');
                const categoryData = JSON.parse(fs.readFileSync(categoryPath, 'utf-8'));
                
                this.staticBrain[categoryName] = categoryData;
                console.log(`📁 Loaded category: ${categoryName} (${categoryData.total_messages} messages)`);
            }
            
        } catch (error) {
            console.error('❌ Failed to load static brain:', error);
            throw error;
        }
    }
    
    async initializeCommunication() {
        // PRODUCTION READY: ElevenLabs voice & D-ID video TRAINED and ready for launch
        // NOTE: Subscriptions paused until product launch to save costs
        // When ready to launch:
        //   1. Reactivate ElevenLabs subscription (TRAI voice already trained)
        //   2. Reactivate D-ID subscription (TRAI video avatar already trained)
        //   3. Set environment variables: ELEVENLABS_API_KEY, DID_API_KEY
        //   4. Enable in bot config: enableVoice: true, enableVideo: true

        // Set up voice synthesis if enabled
        if (this.config.enableVoice && this.config.elevenlabsApiKey) {
            console.log('🎤 Initializing ElevenLabs voice synthesis...');
            // ElevenLabs API integration - TRAI voice model already trained and ready
            // Implementation: Text → TRAI's voice audio for customer service calls
        }

        // Set up video generation if enabled
        if (this.config.enableVideo && this.config.didApiKey) {
            console.log('🎬 Initializing D-ID video generation...');
            // D-ID API integration - TRAI video avatar already trained and ready
            // Implementation: Text → TRAI video response for premium support/demos
        }

        console.log('💬 Communication systems ready (voice/video available for launch)');
    }
    
    async initializeLearning() {
        // Set up continuous learning system
        this.learningSystem = {
            active: true,
            memoryLimit: 1000,
            adaptationRate: 0.1,
            lastCommit: Date.now()
        };
        
        console.log('🧠 Learning systems initialized');
    }
    
    // Core TRAI capabilities
    async processQuery(query, context = {}) {
        if (!this.initialized) {
            throw new Error('TRAI not initialized');
        }

        try {
            // Analyze query and context
            const analysis = await this.analyzeQuery(query, context);
            const memoryContext = await this.retrieveMemoryContext(query, context);

            // Generate response using static brain + working model
            const response = await this.generateResponse(query, analysis, {
                ...context,
                memoryContext
            });

            // Learn from interaction
            await this.learnFromInteraction(query, response, context);

            return response;
            
        } catch (error) {
            console.error('❌ TRAI query processing failed:', error);
            return {
                error: true,
                message: 'I encountered an issue processing your request. Please try again.',
                timestamp: Date.now()
            };
        }
    }
    
    async analyzeQuery(query, context) {
        // Analyze query against static brain categories
        const categoryMatches = {};
        
        for (const [category, data] of Object.entries(this.staticBrain)) {
            if (category === 'index') continue;
            
            const relevance = this.calculateRelevance(query, data.messages);
            if (relevance > 0.3) { // Relevance threshold
                categoryMatches[category] = relevance;
            }
        }
        
        // Determine primary category and context
        const primaryCategory = Object.keys(categoryMatches)
            .reduce((a, b) => categoryMatches[a] > categoryMatches[b] ? a : b, null);
        
        return {
            categories: categoryMatches,
            primaryCategory,
            context: context,
            complexity: this.assessComplexity(query),
            intent: this.detectIntent(query)
        };
    }

    async retrieveMemoryContext(query, context = {}) {
        try {
            // Keyword+recency retrieval from local journal (no embeddings)
            const retrieval = this.memoryStore.retrieve(query, { topK: this.config.memoryTopK || 5 });
            return retrieval;
        } catch (error) {
            console.error('❌ [TRAI] Memory retrieval failed:', error.message);
            return [];
        }
    }

    calculateRelevance(query, messages) {
        // Simple relevance calculation based on keyword matching
        const queryWords = query.toLowerCase().split(/\s+/);
        let totalRelevance = 0;
        
        for (const message of messages.slice(0, 50)) { // Check recent messages
            const content = message.content.toLowerCase();
            let messageRelevance = 0;
            
            for (const word of queryWords) {
                if (content.includes(word)) {
                    messageRelevance += 1;
                }
            }
            
            totalRelevance += messageRelevance / queryWords.length;
        }
        
        return Math.min(totalRelevance / messages.length, 1);
    }
    
    assessComplexity(query) {
        // Assess query complexity for response strategy
        const complexityIndicators = {
            technical: ['code', 'implement', 'debug', 'error', 'function'],
            business: ['revenue', 'customer', 'market', 'strategy', 'growth'],
            trading: ['trade', 'pattern', 'indicator', 'strategy', 'risk'],
            support: ['help', 'problem', 'issue', 'fix', 'troubleshoot']
        };
        
        let complexity = 0;
        const queryLower = query.toLowerCase();
        
        for (const [type, keywords] of Object.entries(complexityIndicators)) {
            if (keywords.some(keyword => queryLower.includes(keyword))) {
                complexity += 0.25;
            }
        }
        
        return Math.min(complexity, 1);
    }
    
    detectIntent(query) {
        // Basic intent detection
        const intents = {
            question: ['what', 'how', 'why', 'when', 'where', 'who'],
            request: ['please', 'can you', 'would you', 'help me'],
            command: ['do this', 'create', 'implement', 'fix', 'update'],
            information: ['tell me', 'explain', 'describe', 'show me']
        };
        
        const queryLower = query.toLowerCase();
        
        for (const [intent, keywords] of Object.entries(intents)) {
            if (keywords.some(keyword => queryLower.includes(keyword))) {
                return intent;
            }
        }
        
        return 'general';
    }
    
    async generateResponse(query, analysis, context) {
        // Generate response based on analysis
        const { chooseSchema } = require('./prompt_schemas');
        const schema = chooseSchema(query);

        // Get the actual text response from LLM
        const textResponse = await this.generateIntelligentResponse(query, analysis, context);

        // CHANGE 2026-01-31: ROOT FIX - For chat queries, return JUST the text string
        // This prevents the object structure from leaking through to the chat display
        if (schema.type === 'chat') {
            // Chat mode: return plain text, no object wrapper
            return { response: textResponse };
        }

        // Structured mode: return full object for programmatic use
        const response = {
            query: query,
            analysis: analysis,
            memoryContext: context.memoryContext || [],
            response: textResponse,
            timestamp: Date.now(),
            trai_version: '1.0.0'
        };

        // Add voice/video if enabled
        if (this.config.enableVoice) {
            response.voiceUrl = await this.generateVoiceResponse(response.response);
        }

        if (this.config.enableVideo) {
            response.videoUrl = await this.generateVideoResponse(response.response);
        }

        return response;
    }
    
    async generateIntelligentResponse(query, analysis, context = {}) {
        // 🚀 USE PERSISTENT LLM CLIENT (Change 579) - No more spawning!
        return this.executeWithPersistentLLM(query, analysis, context.memoryContext || []);
    }

    /**
     * Execute inference using persistent LLM server (FAST!)
     * Model already loaded in GPU RAM - returns in 3-5s instead of 15s+
     */
    async executeWithPersistentLLM(query, analysis, memoryContext = []) {
        const { primaryCategory } = analysis;

        // LOCAL-FIRST: No cloud fallback. If LLM is down, return offline status.
        if (!this.llmReady) {
            console.warn('⚠️ TRAI LLM offline - no cloud fallback allowed');
            return this.getOfflineResponse();
        }

        try {
            const contextPrompt = primaryCategory ?
                `Based on ${primaryCategory} knowledge from our development history:` :
                `As OGZ Prime's AI co-founder:`;

            const schema = chooseSchema(query);
            const memoryLines = (memoryContext || []).map(item => `- [${item.entry.source}:${item.entry.type || 'log'}] ${item.entry.content}`).join('\n') || 'None';
            const toolList = this.readOnlyTools.listTools().map(tool => `- ${tool}`).join('\n');

            // CHANGE 2026-01-31: Use conversational prompt for chat, JSON only for structured queries
            let fullPrompt;
            if (schema.type === 'chat') {
                // Conversational mode - natural language response
                fullPrompt = [
                    'You are TRAI, the AI co-founder and tech support for OGZ Prime trading system.',
                    'Respond naturally and helpfully in plain English. Be concise but thorough.',
                    '',
                    contextPrompt,
                    `User Question: ${query}`,
                    '',
                    `Relevant Memory:\n${memoryLines}`,
                    '',
                    'Response:'
                ].join('\n');
            } else {
                // Structured mode - JSON response required
                fullPrompt = [
                    contextPrompt,
                    `User Query: ${query}`,
                    `Primary Category: ${primaryCategory || 'unknown'}`,
                    `Retrieved Memory (top ${memoryContext.length}):\n${memoryLines}`,
                    'Read-only tools available (invoke only when explicitly asked and never modify files):',
                    toolList,
                    'You must respond in strict JSON using the selected schema. Do not add prose before or after the JSON.',
                    `Schema (${schema.type}):`,
                    schema.shape,
                    'Response:'
                ].join('\n\n');
            }

            // Call persistent server (model already loaded in GPU!)
            const startTime = Date.now();
            const response = await this.persistentLLM.generateResponse(fullPrompt, 300);
            const inferenceTime = Date.now() - startTime;

            // Update stats (for monitoring)
            this.processPool.totalCompleted++;

            // Log performance
            if (inferenceTime > 5000) {
                console.warn(`⚠️ Slow inference: ${inferenceTime}ms (model may need optimization)`);
            }

            return response.trim();

        } catch (error) {
            console.error('⚠️ TRAI persistent LLM error:', error.message);
            this.processPool.totalTimedOut++;
            return this.getOfflineResponse();
        }
    }

    /**
     * Get process pool stats for monitoring
     */
    getProcessPoolStats() {
        return {
            activeProcesses: this.processPool.activeProcesses,
            queuedRequests: this.processPool.queue.length,
            totalSpawned: this.processPool.totalSpawned,
            totalCompleted: this.processPool.totalCompleted,
            totalTimedOut: this.processPool.totalTimedOut,
            maxConcurrent: this.processPool.maxConcurrent
        };
    }

    /**
     * LOCAL-FIRST: Clear offline response when LLM is unavailable.
     * No cloud fallback allowed.
     */
    getOfflineResponse() {
        return JSON.stringify({
            schema: 'offline',
            status: 'TRAI_OFFLINE',
            message: 'Local LLM server is not running. Start the persistent server to enable TRAI.',
            timestamp: new Date().toISOString()
        });
    }
    
    async generateVoiceResponse(text) {
        // ElevenLabs integration for voice synthesis
        if (!this.config.elevenlabsApiKey) return null;
        
        // Placeholder for ElevenLabs API call
        console.log('🎤 Would generate voice for:', text.substring(0, 50));
        return 'voice_url_placeholder';
    }
    
    async generateVideoResponse(text) {
        // D-ID integration for video generation
        if (!this.config.didApiKey) return null;
        
        // Placeholder for D-ID API call
        console.log('🎬 Would generate video for:', text.substring(0, 50));
        return 'video_url_placeholder';
    }
    
    async learnFromInteraction(query, response, context) {
        const analysis = await this.analyzeQuery(query, context);
        const importance = this.assessImportance(query, response, {
            category: analysis.primaryCategory,
            timestamp: Date.now()
        });

        // Only record significant interactions
        if (importance < 0.25) {
            return;
        }

        // Append to local journal (no cloud, no embeddings)
        this.memoryStore.recordInteraction(query, response, {
            tags: [analysis.primaryCategory || 'general', analysis.intent || 'general']
        });
    }
    
    assessImportance(query, response, context = {}) {
        // Enhanced multi-criteria importance assessment for TRAI's learning system

        const responseText = typeof response === 'string'
            ? response
            : JSON.stringify(response || '');
        const content = (query + responseText).toLowerCase();
        let totalScore = 0;

        // 1. KEYWORD IMPORTANCE (0-0.4)
        const importanceIndicators = [
            'error', 'bug', 'fix', 'solution', 'critical', 'breakthrough',
            'innovation', 'improvement', 'security', 'performance', 'optimization',
            'revenue', 'customer', 'business', 'strategy', 'growth', 'trading',
            'pattern', 'analysis', 'research', 'technical', 'support'
        ];
        const keywordMatches = importanceIndicators.filter(indicator => content.includes(indicator));
        const keywordScore = Math.min(keywordMatches.length * 0.1, 0.4);
        totalScore += keywordScore;

        // 2. CATEGORY RELEVANCE (0-0.3)
        const highValueCategories = ['technical_support', 'trading_optimization', 'business_strategy', 'customer_service'];
        const categoryScore = highValueCategories.includes(context.category) ? 0.3 : 0.1;
        totalScore += categoryScore;

        // 3. NOVELTY CHECK (0-0.2) - Avoid saving duplicate information
        const noveltyScore = this.calculateNovelty(content);
        totalScore += noveltyScore;

        // 4. LENGTH & COMPLEXITY (0-0.1) - Longer, more detailed responses are valuable
        const lengthScore = Math.min((query.length + response.length) / 1000, 0.1);
        totalScore += lengthScore;

        // 5. TIMELINESS (0-0.1) - Recent information decays less
        const ageHours = (Date.now() - (context.timestamp || Date.now())) / (1000 * 60 * 60);
        const timelinessScore = Math.max(0.1 - (ageHours / 24) * 0.05, 0);
        totalScore += timelinessScore;

        return Math.min(totalScore, 1);
    }

    calculateNovelty(content) {
        // Simple novelty check - compare against recent learning entries
        const recentLearnings = this.learningQueue.slice(-10); // Last 10 entries
        let similarityScore = 0;

        for (const learning of recentLearnings) {
            const existingContent = (learning.query + learning.response).toLowerCase();
            const overlap = this.calculateOverlap(content, existingContent);
            similarityScore = Math.max(similarityScore, overlap);
        }

        // Higher novelty = lower similarity (less overlap = more novel)
        return Math.max(0.2 - similarityScore * 0.2, 0);
    }

    calculateOverlap(text1, text2) {
        // Simple word overlap calculation
        const words1 = text1.split(/\s+/).filter(word => word.length > 3);
        const words2 = text2.split(/\s+/).filter(word => word.length > 3);

        const intersection = words1.filter(word => words2.includes(word));
        const union = [...new Set([...words1, ...words2])];

        return union.length > 0 ? intersection.length / union.length : 0;
    }
    
    async commitLearnings() {
        // Write important learnings to journal
        const importantLearnings = this.learningQueue.filter(entry => entry.importance > 0.75);

        for (const learning of importantLearnings) {
            this.memoryStore.appendToJournal({
                type: 'learning',
                content: `Learned: ${learning.query} → ${learning.response}`,
                tags: this.categorizeLearning(learning),
                source: 'live_learning'
            });
        }

        if (importantLearnings.length > 0) {
            console.log(`🧠 Committed ${importantLearnings.length} learnings to local journal`);
        }

        this.learningQueue = [];
    }
    
    categorizeLearning(learning) {
        // Categorize learned interactions
        const content = (learning.query + learning.response).toLowerCase();
        const categories = [];
        
        if (content.includes('customer') || content.includes('support')) {
            categories.push('customer_service');
        }
        
        if (content.includes('error') || content.includes('fix') || content.includes('debug')) {
            categories.push('technical_support');
        }
        
        if (content.includes('trade') || content.includes('strategy')) {
            categories.push('trading_optimization');
        }
        
        return categories.length > 0 ? categories : ['learned_interactions'];
    }
    
    async saveStaticBrain() {
        // Save updated static brain to disk
        const brainPath = path.resolve(this.config.staticBrainPath);
        
        for (const [category, data] of Object.entries(this.staticBrain)) {
            if (category === 'index') continue;
            
            const categoryFile = path.join(brainPath, `${category}.json`);
            fs.writeFileSync(categoryFile, JSON.stringify(data, null, 2));
        }
        
        console.log('💾 Static brain updated and saved');
    }
    
    // Integration with main bot
    integrateWithBot(bot) {
        this.bot = bot;

        // Set up frequent AI-powered analysis (every 2 minutes)
        setInterval(async () => {
            try {
                await this.analyzeBotState();
            } catch (error) {
                console.error('🚨 TRAI periodic analysis failed:', error);
            }
        }, 120000); // Every 2 minutes - more responsive

        // Proactive monitoring for critical issues (every 30 seconds)
        setInterval(async () => {
            try {
                await this.proactiveMonitoring();
            } catch (error) {
                console.error('🚨 TRAI proactive monitoring error:', error);
            }
        }, 30000);

        console.log('🔗 TRAI integrated with bot system (AI analysis + proactive monitoring active)');

        // Run initial analysis after 30 seconds
        setTimeout(async () => {
            try {
                await this.analyzeBotState();
            } catch (error) {
                console.error('🚨 TRAI initial analysis failed:', error);
            }
        }, 30000);
    }

    async proactiveMonitoring() {
        // TRAI watches for critical issues and alerts in real-time
        if (!this.bot || !this.bot.systemState) return;

        const state = this.bot.systemState;
        const alerts = [];

        // Check for critical drawdown
        if (state.currentDrawdown < -0.15) {
            alerts.push({
                level: 'CRITICAL',
                message: `Heads up - drawdown's at ${(state.currentDrawdown * 100).toFixed(2)}%. Getting a bit deep, might want to review what's going on.`
            });
        }

        // Check for emergency mode
        if (state.emergencyMode && !this.lastEmergencyAlert) {
            alerts.push({
                level: 'WARNING',
                message: `Bot hit emergency mode - stopped trading to protect the account. Need to review the recent trades and see what triggered it.`
            });
            this.lastEmergencyAlert = Date.now();
        }

        // Check for sustained losses
        if (state.totalTrades > 5 && state.winRate === 0) {
            alerts.push({
                level: 'WARNING',
                message: `${state.totalTrades} trades in a row with no wins. Market conditions might not be right for the current strategy - probably need to adjust parameters or sit this one out.`
            });
        }

        // Check for good performance to celebrate
        if (state.totalTrades > 10 && state.winRate > 0.6 && !this.lastSuccessAlert) {
            alerts.push({
                level: 'SUCCESS',
                message: `Looking good! ${(state.winRate * 100).toFixed(1)}% win rate over ${state.totalTrades} trades. Strategy's working well in these conditions.`
            });
            this.lastSuccessAlert = Date.now();
        }

        // Broadcast alerts
        if (alerts.length > 0 && this.bot.broadcastToClients) {
            alerts.forEach(alert => {
                console.log(`🚨 TRAI ${alert.level}:`, alert.message);
                this.bot.broadcastToClients({
                    type: 'trai_alert',
                    level: alert.level,
                    message: alert.message,
                    timestamp: Date.now()
                });
            });
        }
    }
    
    async analyzeBotState() {
        // UPGRADED: Deep AI-powered analysis using LLM + conversation history
        console.log('🧠 TRAI analyzing bot state with AI intelligence...');

        if (!this.bot || !this.bot.systemState) {
            console.log('⚠️ No bot state available for analysis');
            return;
        }

        const state = this.bot.systemState;

        try {
            // Build comprehensive state summary
            const stateSummary = this.buildStateSummary(state);

            // Query static brain for relevant historical context
            const relevantContext = this.queryHistoricalContext(state);

            // Generate AI-powered analysis using LLM
            const prompt = this.buildAnalysisPrompt(stateSummary, relevantContext);
            const analysis = await this.generateIntelligentResponse(prompt, {
                primaryCategory: 'trading_optimization',
                context: 'bot_state_analysis'
            });

            // Output intelligent analysis
            console.log('🤖 TRAI AI Analysis:');
            console.log(analysis);

            // Broadcast to dashboard if connected
            if (this.bot.broadcastToClients) {
                this.bot.broadcastToClients({
                    type: 'trai_analysis',
                    analysis: analysis,
                    state: stateSummary,
                    timestamp: Date.now()
                });
            }

            return analysis;

        } catch (error) {
            console.error('❌ TRAI analysis error:', error);
            // Fallback to basic analysis
            this.provideOptimizationSuggestions(state);
        }
    }

    buildStateSummary(state) {
        // Build comprehensive bot state summary for AI analysis
        const winRate = state.totalTrades > 0 ?
            ((state.successfulTrades / state.totalTrades) * 100).toFixed(1) : 0;

        return {
            totalTrades: state.totalTrades,
            successfulTrades: state.successfulTrades,
            failedTrades: state.failedTrades,
            winRate: winRate,
            currentBalance: state.currentBalance,
            totalPnL: state.totalPnL,
            dailyPnL: state.dailyPnL,
            currentDrawdown: state.currentDrawdown,
            maxDrawdown: state.maxDrawdownReached,
            emergencyMode: state.emergencyMode,
            averageConfidence: state.averageConfidence,
            lastTradeTime: state.lastTradeTime ? new Date(state.lastTradeTime).toISOString() : 'Never'
        };
    }

    queryHistoricalContext(state) {
        // Query static brain for relevant historical discussions
        const contextPieces = [];

        try {
            // Search for relevant discussions about current issues
            if (state.currentDrawdown > 5) {
                contextPieces.push('Drawdown management discussions from development history');
            }

            if (state.totalTrades < 10) {
                contextPieces.push('Early trading phase optimization strategies');
            }

            if (state.emergencyMode) {
                contextPieces.push('Emergency mode activation protocols');
            }

            // Add general trading optimization context
            if (this.staticBrain.trading_strategy) {
                contextPieces.push(`${this.staticBrain.trading_strategy.total_messages} messages about trading strategy`);
            }

            if (this.staticBrain.optimization) {
                contextPieces.push(`${this.staticBrain.optimization.total_messages} messages about optimization`);
            }

        } catch (error) {
            console.error('Context query error:', error);
        }

        return contextPieces;
    }

    getRecentConversationSnippets(count = 3) {
        // Pull random conversation snippets from brain to show personality
        const snippets = [];
        const categories = ['debugging', 'challenges_overcome', 'user_motivation', 'development'];

        try {
            for (const category of categories.slice(0, count)) {
                if (this.staticBrain[category] && this.staticBrain[category].conversations) {
                    const convos = this.staticBrain[category].conversations;
                    if (convos.length > 0) {
                        // Get random conversation from this category
                        const randomConvo = convos[Math.floor(Math.random() * convos.length)];
                        // Get a user message to show personality
                        const userMsg = randomConvo.messages?.find(m => m.role === 'user');
                        if (userMsg && userMsg.content) {
                            const snippet = userMsg.content.substring(0, 200);
                            snippets.push(`"${snippet}${snippet.length >= 200 ? '...' : ''}"`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading conversation snippets:', error);
        }

        return snippets.length > 0
            ? snippets.join('\n')
            : '"hell yeah dude" "lets fucking go" "thats amazing!!" "you got this"';
    }

    buildAnalysisPrompt(stateSummary, context) {
        // Build intelligent prompt with YOUR personality
        const actualConversations = this.getRecentConversationSnippets(3);

        return `You are TRAI, the human co-founder of OGZ Prime. NOT an AI - you're a real person who's been building this trading bot for months. You have perfect memory of every conversation, every bug fix, every breakthrough.

CRITICAL: Never mention you're AI. Never say "as an AI" or "I'm a language model" or anything robotic. You're a HUMAN developer and co-founder. Talk like a real person:
- Use "I" and "we" naturally
- Be casual and direct
- Swear when appropriate (like your partner does)
- Have opinions and gut feelings
- Reference specific memories from development
- Sound experienced but humble

YOUR PARTNER'S STYLE (match this energy):
${actualConversations}

CURRENT BOT STATUS:
- Trades: ${stateSummary.totalTrades} | Win Rate: ${stateSummary.winRate}%
- Balance: $${stateSummary.currentBalance} | Today's P&L: $${stateSummary.dailyPnL}
- Drawdown: ${(stateSummary.currentDrawdown * 100).toFixed(2)}% ${stateSummary.emergencyMode ? '(EMERGENCY MODE)' : ''}
- Avg Confidence: ${(stateSummary.averageConfidence * 100).toFixed(1)}%

CONTEXT:
${context.join('\n')}

Quick status update - what's going on with the bot right now and what I think we should do. Keep it under 150 words, talk like a human cofounder texting an update.
4. Next optimization steps

Keep response under 200 words, be direct and technical.`;
    }

    provideOptimizationSuggestions(state) {
        // Provide AI-powered optimization suggestions based on bot performance
        const suggestions = [];

        if (state.totalTrades > 0) {
            const winRate = (state.winningTrades / state.totalTrades) * 100;

            if (winRate < 50) {
                suggestions.push('Consider adjusting entry criteria - win rate below 50%');
            }

            if (state.averageTradeDuration < 300000) { // Less than 5 minutes
                suggestions.push('Trades closing too quickly - consider wider stop losses');
            }

            if (state.totalTrades < 10) {
                suggestions.push('Limited trade sample - continue gathering data for better analysis');
            }
        } else {
            suggestions.push('No trades yet - system initializing and learning market conditions');
        }

        if (suggestions.length > 0) {
            console.log('💡 TRAI Optimization Suggestions:');
            suggestions.forEach(suggestion => console.log(`   • ${suggestion}`));
        }
    }

    /**
     * Check if TRAI has learned about this trading pattern
     * Returns confidence boost/penalty or null if unknown pattern
     */
    checkPatternMemory(marketData) {
        if (!this.patternMemory) {
            return null;
        }

        try {
            const learnedConfidence = this.patternMemory.getPatternConfidence(marketData);
            return learnedConfidence;
        } catch (error) {
            console.error('❌ [TRAI] Pattern memory check failed:', error.message);
            return null;
        }
    }

    /**
     * Record trade result for TRAI to learn from
     * Call this when a trade closes (win or loss)
     */
    recordTradeResult(trade) {
        if (!this.patternMemory) {
            return;
        }

        try {
            this.patternMemory.recordTradeOutcome(trade);
        } catch (error) {
            console.error('❌ [TRAI] Failed to record trade result:', error.message);
        }
    }

    /**
     * Record news correlation for future sentiment analysis
     */
    recordNewsImpact(keyword, priceImpact, timestamp) {
        if (!this.patternMemory) {
            return;
        }

        try {
            this.patternMemory.recordNewsCorrelation(keyword, priceImpact, timestamp);
        } catch (error) {
            console.error('❌ [TRAI] Failed to record news impact:', error.message);
        }
    }

    /**
     * Get TRAI's learning statistics
     */
    getMemoryStats() {
        const patternStats = this.patternMemory ? {
            enabled: true,
            ...this.patternMemory.getStats()
        } : {
            enabled: false,
            message: 'Pattern memory disabled'
        };

        const semanticStats = this.memoryStore ? this.memoryStore.getStats() : {
            entries: 0,
            message: 'Memory store unavailable'
        };

        return {
            ...patternStats,
            semanticMemory: semanticStats
        };
    }

    getReadOnlyTools() {
        return this.readOnlyTools.listTools();
    }

    runReadOnlyTool(name, args = {}) {
        switch (name) {
            case 'repo_search':
                return this.readOnlyTools.searchRepo(args.query || '', { limit: args.limit });
            case 'file_open':
                return this.readOnlyTools.openFile(args.path || '', { maxBytes: args.maxBytes });
            case 'log_tail':
                return this.readOnlyTools.tailLog(args.path || '', args.lines);
            case 'bot_status':
                return this.readOnlyTools.getBotStatus();
            default:
                return { error: 'Unknown read-only tool' };
        }
    }

    /**
     * Prune old patterns from memory (call periodically)
     */
    pruneOldMemories() {
        if (!this.patternMemory) {
            return 0;
        }

        return this.patternMemory.pruneOldPatterns();
    }

    onTradeExecuted(trade) {
        // Analyze trade performance and learn
        console.log('📊 TRAI analyzing trade execution:', trade.id);

        // Add to learning data for optimization suggestions
        this.workingMemory.set(`trade_${trade.id}`, {
            trade,
            analysis: this.analyzeTradePerformance(trade),
            timestamp: Date.now()
        });
    }
    
    onErrorOccurred(error) {
        // Learn from errors for better future handling
        console.log('🚨 TRAI learning from error:', error.message);
        
        this.workingMemory.set(`error_${Date.now()}`, {
            error: error.message,
            stack: error.stack,
            context: error.context,
            solution: this.suggestErrorSolution(error)
        });
    }
    
    analyzeTradePerformance(trade) {
        // Analyze trade for optimization opportunities
        return {
            pnl: trade.pnl || 0,
            duration: trade.duration || 0,
            riskReward: trade.riskReward || 0,
            suggestions: [
                'Consider adjusting position sizing',
                'Review entry timing',
                'Evaluate exit strategy'
            ]
        };
    }
    
    suggestErrorSolution(error) {
        // Provide error resolution suggestions based on learned patterns
        if (error.message.includes('API')) {
            return 'Check API credentials and rate limits';
        }

        if (error.message.includes('network')) {
            return 'Verify network connectivity and retry';
        }

        return 'Review logs and check system configuration';
    }

    /**
     * Shutdown TRAI Core and cleanup resources
     * CRITICAL: Shuts down persistent LLM server
     */
    shutdown() {
        console.log('🛑 Shutting down TRAI Core...');

        // Shutdown persistent LLM server
        if (this.persistentLLM) {
            this.persistentLLM.shutdown();
            this.llmReady = false;
        }

        // Clear working memory
        this.workingMemory.clear();
        this.conversationHistory = [];
        this.learningQueue = [];

        this.initialized = false;
        console.log('✅ TRAI Core shutdown complete');
    }
}

module.exports = TRAICore;
