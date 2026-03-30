/**
 * Provider-Agnostic LLM Client for TRAI
 * ══════════════════════════════════════════════════════════════
 * 
 * Drop-in replacement for persistent_llm_client.js
 * Supports: Mercury-2, Claude API, OpenAI-compatible, Ollama
 * 
 * Config via env vars:
 *   LLM_PROVIDER=mercury|claude|openai|ollama  (default: mercury)
 *   LLM_API_KEY=your-api-key
 *   LLM_MODEL=model-name
 *   LLM_BASE_URL=custom-endpoint  (for OpenAI-compatible)
 *   LLM_MAX_TOKENS=1000
 *   LLM_TEMPERATURE=0.6
 * 
 * Usage (same interface as old client):
 *   const client = new PersistentLLMClient();
 *   await client.initialize();
 *   const response = await client.generateResponse("Your prompt here");
 */
'use strict';

const https = require('https');
const http = require('http');

// ─── Provider Configs ────────────────────────────────────────────

const PROVIDERS = {
  mercury: {
    name: 'Mercury-2 (Inception Labs)',
    baseUrl: 'https://api.inceptionlabs.ai/v1',
    defaultModel: 'mercury-2',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    requestFormat: 'openai',  // Mercury uses OpenAI-compatible format
  },
  claude: {
    name: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    authHeader: 'x-api-key',
    authPrefix: '',
    requestFormat: 'anthropic',
  },
  openai: {
    name: 'OpenAI-Compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    requestFormat: 'openai',
  },
  ollama: {
    name: 'Ollama (Local)',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'trai',
    authHeader: null,
    authPrefix: '',
    requestFormat: 'ollama',
  },
};

class PersistentLLMClient {
  constructor(config = {}) {
    // Provider selection
    this.providerName = (config.provider || process.env.LLM_PROVIDER || 'mercury').toLowerCase();
    const providerConfig = PROVIDERS[this.providerName];
    
    if (!providerConfig) {
      throw new Error(`Unknown LLM provider: ${this.providerName}. Valid: ${Object.keys(PROVIDERS).join(', ')}`);
    }

    this.provider = providerConfig;
    this.baseUrl = config.baseUrl || process.env.LLM_BASE_URL || providerConfig.baseUrl;
    this.model = config.model || process.env.LLM_MODEL || providerConfig.defaultModel;
    this.apiKey = config.apiKey || process.env.LLM_API_KEY || process.env.INCEPTION_API_KEY || process.env.MERCURY_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '';
    this.maxTokens = config.maxTokens || Number(process.env.LLM_MAX_TOKENS || 1000);
    this.temperature = config.temperature || Number(process.env.LLM_TEMPERATURE || 0.6);
    
    // TRAI system prompt
    this.systemPrompt = config.systemPrompt || `You are TRAI, the AI trading advisor for OGZPrime. You analyze market conditions, evaluate trade setups, explain trading decisions, and provide actionable insights. You have access to technical indicators, volume profile data, pattern recognition, and market regime analysis. Be direct, data-driven, and specific. When analyzing trades, reference the actual numbers — entry price, stop loss, take profit, confidence score, and the conditions that triggered the signal.`;

    // Stats
    this.isReady = false;
    this.requestCount = 0;
    this.totalLatency = 0;
    this.errors = 0;
  }

  /**
   * Initialize — verify provider is reachable
   */
  async initialize() {
    console.log(`🚀 TRAI LLM Client initializing...`);
    console.log(`   Provider: ${this.provider.name}`);
    console.log(`   Model:    ${this.model}`);
    console.log(`   Endpoint: ${this.baseUrl}`);

    // Validate API key for cloud providers
    if (this.providerName !== 'ollama' && !this.apiKey) {
      console.warn(`⚠️ No API key set for ${this.provider.name}. Set LLM_API_KEY env var.`);
      console.warn(`   TRAI will operate in degraded mode (pattern-only, no LLM analysis).`);
      this.isReady = false;
      return;
    }

    try {
      // Quick health check
      if (this.providerName === 'ollama') {
        await this._ollamaHealthCheck();
      } else {
        // For cloud providers, do a minimal test call
        const warmupStart = Date.now();
        await this.generateResponse('Respond with OK.', 10);
        const warmupTime = Date.now() - warmupStart;
        console.log(`✅ TRAI LLM warm-up complete (${warmupTime}ms)`);
      }

      this.isReady = true;
      console.log(`✅ TRAI LLM Client Ready! Provider: ${this.provider.name} | Model: ${this.model}`);
    } catch (error) {
      console.error(`❌ TRAI LLM initialization failed:`, error.message);
      console.log(`💡 TRAI will operate in degraded mode (pattern-only, no LLM analysis).`);
      this.isReady = false;
    }
  }

  /**
   * Generate response — provider-agnostic
   * @param {string} prompt - The prompt to send
   * @param {number} maxTokens - Max tokens to generate
   * @returns {Promise<string>} - The generated response text
   */
  async generateResponse(prompt, maxTokens = null) {
    let tokens = maxTokens || this.maxTokens;

    // Mercury-2 uses internal reasoning tokens (~50-100), so enforce higher minimum
    if (this.providerName === 'mercury' && tokens < 400) {
      tokens = 400;
    }

    if (!this.isReady && this.requestCount > 0) {
      return this._fallbackResponse(prompt);
    }

    const startTime = Date.now();

    try {
      let responseText;

      switch (this.provider.requestFormat) {
        case 'anthropic':
          responseText = await this._callAnthropic(prompt, tokens);
          break;
        case 'openai':
          responseText = await this._callOpenAI(prompt, tokens);
          break;
        case 'ollama':
          responseText = await this._callOllama(prompt, tokens);
          break;
        default:
          throw new Error(`Unknown request format: ${this.provider.requestFormat}`);
      }

      const latency = Date.now() - startTime;
      this.requestCount++;
      this.totalLatency += latency;

      if (latency > 10000) {
        console.warn(`⚠️ Slow TRAI inference: ${latency}ms`);
      }

      // Clean response
      responseText = this._cleanResponse(responseText);

      if (!responseText || responseText.length < 5) {
        console.warn('⚠️ TRAI response empty after cleaning');
        return this._fallbackResponse(prompt);
      }

      return responseText;

    } catch (error) {
      this.errors++;
      console.error(`❌ TRAI inference error (${this.provider.name}):`, error.message);

      // Check for content filter error
      if (error.message && error.message.includes('content_filter')) {
        return "I can help with technical analysis, chart patterns, and market data — but I can't give direct buy/sell recommendations. Try asking about indicators, setups, or what a pattern means instead!";
      }

      // Don't throw — return degraded response
      return this._fallbackResponse(prompt);
    }
  }

  // ─── Provider-Specific Call Methods ────────────────────────────

  async _callAnthropic(prompt, maxTokens) {
    const body = {
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      system: this.systemPrompt,
    };

    const response = await this._httpRequest(
      `${this.baseUrl}/messages`,
      'POST',
      body,
      {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      }
    );

    const data = JSON.parse(response);
    if (data.content && data.content.length > 0) {
      return data.content.map(c => c.text || '').join('\n');
    }
    throw new Error(data.error?.message || 'Empty Anthropic response');
  }

  async _callOpenAI(prompt, maxTokens) {
    const body = {
      model: this.model,
      max_tokens: maxTokens,
      temperature: this.temperature,
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt },
      ],
    };

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers[this.provider.authHeader] = `${this.provider.authPrefix}${this.apiKey}`;
    }

    const response = await this._httpRequest(
      `${this.baseUrl}/chat/completions`,
      'POST',
      body,
      headers
    );

    const data = JSON.parse(response);
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message?.content || '';
    }
    throw new Error(data.error?.message || 'Empty OpenAI response');
  }

  async _callOllama(prompt, maxTokens) {
    const body = {
      model: this.model,
      prompt: prompt,
      system: this.systemPrompt,
      stream: false,
      keep_alive: '20m',
      options: {
        num_predict: maxTokens,
        temperature: this.temperature,
        stop: ['<|end▁of▁sentence|>', '<｜end▁of▁sentence｜>'],
      },
    };

    const response = await this._httpRequest(
      `${this.baseUrl}/api/generate`,
      'POST',
      body,
      { 'Content-Type': 'application/json' }
    );

    const data = JSON.parse(response);
    // DeepSeek R1 puts reasoning in 'thinking' field, final answer in 'response'
    // If response is empty but thinking exists, extract useful content from thinking
    if (data.response) {
      return data.response;
    }
    if (data.thinking) {
      // Extract the conclusion/answer from thinking (last sentence often has the answer)
      const thinking = data.thinking.trim();
      const sentences = thinking.split(/[.!?]\s+/);
      // Return last meaningful sentence as the "answer"
      return sentences[sentences.length - 1] || thinking.slice(-200);
    }
    return '';
  }

  async _ollamaHealthCheck() {
    try {
      const response = await this._httpRequest(
        `${this.baseUrl}/api/tags`,
        'GET',
        null,
        { 'Content-Type': 'application/json' }
      );
      const data = JSON.parse(response);
      const models = data.models || [];
      const hasModel = models.some(m => m.name === this.model || m.name === `${this.model}:latest`);
      
      if (!hasModel) {
        const available = models.map(m => m.name).join(', ');
        console.warn(`⚠️ Ollama model '${this.model}' not found. Available: ${available}`);
        const hasDeepseek = models.some(m => m.name.includes('deepseek'));
        if (hasDeepseek) {
          this.model = models.find(m => m.name.includes('deepseek')).name;
          console.log(`✅ Falling back to: ${this.model}`);
        } else {
          throw new Error(`No model found. Run: ollama pull ${this.model}`);
        }
      }
      
      // Warmup
      console.log(`🔥 Warming up ${this.model}...`);
      const start = Date.now();
      await this._callOllama('Hello', 10);
      console.log(`✅ Warmup: ${Date.now() - start}ms`);
    } catch (e) {
      throw new Error(`Ollama not reachable at ${this.baseUrl}: ${e.message}`);
    }
  }

  // ─── Response Cleaning ─────────────────────────────────────────

  _cleanResponse(text) {
    if (!text) return '';

    // Remove thinking tags (DeepSeek/reasoning models)
    if (text.includes('<think>') && text.includes('</think>')) {
      text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    } else if (text.includes('<think>') && !text.includes('</think>')) {
      const idx = text.indexOf('<think>');
      text = idx > 10 ? text.substring(0, idx) : '';
    }
    text = text.replace(/<\/think>/g, '');

    // Clean leading garbage
    text = text.replace(/^[\s.,;:!?\-\n\r]+/, '');
    
    // Remove LLM output labels
    text = text.replace(/^(advice|response|answer|output|result|reply|analysis|recommendation|summary)[\s:]+/i, '');

    // Truncate at last complete sentence if cut off
    text = text.trim();
    if (text.length > 20 && !/[.!?]$/.test(text)) {
      const lastEnd = Math.max(text.lastIndexOf('.'), text.lastIndexOf('?'), text.lastIndexOf('!'));
      if (lastEnd > text.length * 0.5) {
        text = text.substring(0, lastEnd + 1);
      }
    }

    return text.trim();
  }

  // ─── Fallback (No LLM Available) ───────────────────────────────

  _fallbackResponse(prompt) {
    const lower = prompt.toLowerCase();
    
    if (lower.includes('bitcoin') || lower.includes('btc') || lower.includes('crypto')) {
      return 'TRAI is operating in pattern-only mode. LLM analysis unavailable. Check your LLM_API_KEY configuration.';
    }
    if (lower.includes('should i') || lower.includes('trade')) {
      return 'TRAI pattern engine is active but LLM analysis is offline. Confidence multipliers from pattern data are still applied to your signals.';
    }
    
    return 'TRAI LLM is currently offline. Pattern-based confidence multipliers are still active. Set LLM_PROVIDER and LLM_API_KEY to enable full analysis.';
  }

  // ─── HTTP Helper ───────────────────────────────────────────────

  _httpRequest(url, method, body, headers) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers: headers || {},
        timeout: 60000,
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // ─── Status ────────────────────────────────────────────────────

  shutdown() {
    console.log('🛑 TRAI LLM Client shutdown');
    this.isReady = false;
  }

  getStatus() {
    return {
      ready: this.isReady,
      provider: this.providerName,
      providerName: this.provider.name,
      model: this.model,
      endpoint: this.baseUrl,
      requestCount: this.requestCount,
      errors: this.errors,
      avgLatency: this.requestCount > 0 ? Math.round(this.totalLatency / this.requestCount) : 0,
    };
  }
}

module.exports = PersistentLLMClient;
