/**
 * Provider-Agnostic LLM Client for TRAI
 * ══════════════════════════════════════════════════════════════
 * 
 * Drop-in replacement for persistent_llm_client.js
 * Supports: Mercury-2, Claude API, OpenAI-compatible, Ollama
 * 
 * Config is constructor-owned. Callers must pass an explicit provider/model/
 * endpoint/token config resolved by the runtime config layer.
 * 
 * Usage (same interface as old client):
 *   const client = new PersistentLLMClient(resolvedLlmConfig);
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
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    requestFormat: 'openai',  // Mercury uses OpenAI-compatible format
  },
  claude: {
    name: 'Claude (Anthropic)',
    authHeader: 'x-api-key',
    authPrefix: '',
    requestFormat: 'anthropic',
  },
  openai: {
    name: 'OpenAI-Compatible',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    requestFormat: 'openai',
  },
  ollama: {
    name: 'Ollama (Local)',
    authHeader: null,
    authPrefix: '',
    requestFormat: 'ollama',
  },
  ollamacloud: {
    name: 'Ollama Cloud',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    requestFormat: 'openai',
  },
};

function requireConfigObject(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('PersistentLLMClient requires explicit LLM config');
  }
  return config;
}

function requireString(config, key) {
  if (typeof config[key] !== 'string' || config[key].trim() === '') {
    throw new Error(`PersistentLLMClient config.${key} must be a non-empty string`);
  }
  return config[key].trim();
}

function requireNumber(config, key, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(config[key]) || config[key] < min || config[key] > max) {
    throw new Error(`PersistentLLMClient config.${key} must be a finite number between ${min} and ${max}`);
  }
  return config[key];
}

function requireInteger(config, key, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) {
    throw new Error(`PersistentLLMClient config.${key} must be an integer between ${min} and ${max}`);
  }
  return config[key];
}

class PersistentLLMClient {
  constructor(config) {
    const resolvedConfig = requireConfigObject(config);

    this.providerName = requireString(resolvedConfig, 'provider').toLowerCase();
    const providerConfig = PROVIDERS[this.providerName];

    if (!providerConfig) {
      throw new Error(`Unknown LLM provider: ${this.providerName}. Valid: ${Object.keys(PROVIDERS).join(', ')}`);
    }

    this.provider = providerConfig;
    this.baseUrl = requireString(resolvedConfig, 'baseUrl').replace(/\/+$/, '');
    this.model = requireString(resolvedConfig, 'model');
    this.apiKey = resolvedConfig.authRequired === false ? '' : requireString(resolvedConfig, 'apiKey');
    this.maxTokens = requireInteger(resolvedConfig, 'maxTokens', { min: 1, max: 200000 });
    this.minimumTokens = requireInteger(resolvedConfig, 'minimumTokens', { min: 0, max: 200000 });
    this.temperature = requireNumber(resolvedConfig, 'temperature', { min: 0, max: 2 });
    this.requestTimeoutMs = requireInteger(resolvedConfig, 'requestTimeoutMs', { min: 1000, max: 300000 });
    this.systemPrompt = requireString(resolvedConfig, 'systemPrompt');
    this.openaiExtraBody = resolvedConfig.openaiExtraBody
      && typeof resolvedConfig.openaiExtraBody === 'object'
      && !Array.isArray(resolvedConfig.openaiExtraBody)
      ? JSON.parse(JSON.stringify(resolvedConfig.openaiExtraBody))
      : {};
    this.skipWarmup = resolvedConfig.skipWarmup === true;

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
    console.log('[TRAI] LLM client initializing...');
    console.log(`   Provider: ${this.provider.name}`);
    console.log(`   Model:    ${this.model}`);
    console.log(`   Endpoint: ${this.baseUrl}`);

    try {
      this.isReady = true;
      // Quick health check
      if (this.providerName === 'ollama') {
        await this._ollamaHealthCheck();
      } else if (!this.skipWarmup) {
        // For cloud providers, do a minimal test call
        const warmupStart = Date.now();
        const warmupResponse = await this.generateRawResponse('Respond with READY.', 10);
        if (!String(warmupResponse || '').trim()) {
          throw new Error('TRAI LLM warm-up returned an empty response');
        }
        const warmupTime = Date.now() - warmupStart;
        console.log(`[TRAI] LLM warm-up complete (${warmupTime}ms)`);
      }

      console.log(`[TRAI] LLM client ready. Provider: ${this.provider.name} | Model: ${this.model}`);
    } catch (error) {
      console.error('[TRAI] LLM initialization failed:', error.message);
      this.isReady = false;
      throw error;
    }
  }

  /**
   * Generate response — provider-agnostic
   * @param {string} prompt - The prompt to send
   * @param {number} maxTokens - Max tokens to generate
   * @returns {Promise<string>} - The generated response text
   */
  async generateResponse(prompt, maxTokens = null) {
    let tokens = maxTokens == null ? this.maxTokens : maxTokens;

    if (this.minimumTokens > 0 && tokens < this.minimumTokens) {
      tokens = this.minimumTokens;
    }

    if (!this.isReady) {
      throw new Error('PersistentLLMClient.generateResponse called before successful initialize');
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
        console.warn(`[TRAI] Slow inference: ${latency}ms`);
      }

      // Clean response
      responseText = this._cleanResponse(responseText);

      if (!responseText || responseText.length < 5) {
        throw new Error('TRAI LLM response empty after cleaning');
      }

      return responseText;

    } catch (error) {
      this.errors++;
      console.error(`[TRAI] Inference error (${this.provider.name}):`, error.message);

      throw error;
    }
  }

  async generateResponseWithMetadata(prompt, maxTokens = null) {
    let tokens = maxTokens == null ? this.maxTokens : maxTokens;
    if (this.minimumTokens > 0 && tokens < this.minimumTokens) tokens = this.minimumTokens;
    if (!this.isReady) {
      throw new Error('PersistentLLMClient.generateResponseWithMetadata called before successful initialize');
    }

    const startedAt = new Date();
    const startedMs = Date.now();
    let request;
    if (this.provider.requestFormat === 'anthropic') {
      request = {
        url: `${this.baseUrl}/messages`,
        body: {
          model: this.model,
          max_tokens: tokens,
          messages: [{ role: 'user', content: prompt }],
          system: this.systemPrompt,
        },
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      };
    } else if (this.provider.requestFormat === 'openai') {
      request = {
        url: `${this.baseUrl}/chat/completions`,
        body: {
          ...this.openaiExtraBody,
          model: this.model,
          max_tokens: tokens,
          temperature: this.temperature,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: prompt },
          ],
        },
        headers: {
          'Content-Type': 'application/json',
          [this.provider.authHeader]: `${this.provider.authPrefix}${this.apiKey}`,
        },
      };
    } else {
      request = {
        url: `${this.baseUrl}/api/generate`,
        body: {
          model: this.model,
          prompt,
          system: this.systemPrompt,
          stream: false,
          keep_alive: '20m',
          options: { num_predict: tokens, temperature: this.temperature },
        },
        headers: { 'Content-Type': 'application/json' },
      };
    }

    try {
      const httpResult = await this._httpRequestWithMetadata(request.url, 'POST', request.body, request.headers);
      const rawText = httpResult.rawBody.toString('utf8');
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (error) {
        error.providerMetadata = this._responseMetadata({
          startedAt,
          startedMs,
          rawBody: httpResult.rawBody,
          statusCode: httpResult.statusCode,
          parseStatus: 'invalid_json',
        });
        throw error;
      }

      let answer = '';
      let appliedModel = null;
      let termination = null;
      if (this.provider.requestFormat === 'anthropic') {
        answer = Array.isArray(data.content) ? data.content.map(part => part.text || '').join('\n') : '';
        appliedModel = data.model || null;
        termination = data.stop_reason || null;
      } else if (this.provider.requestFormat === 'openai') {
        answer = data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content || ''
          : '';
        appliedModel = data.model || null;
        termination = data.choices && data.choices[0] ? data.choices[0].finish_reason || null : null;
      } else {
        answer = data.response || '';
        appliedModel = data.model || null;
        termination = data.done_reason || (data.done === true ? 'done' : null);
      }
      const metadata = this._responseMetadata({
        startedAt,
        startedMs,
        rawBody: httpResult.rawBody,
        statusCode: httpResult.statusCode,
        appliedModel,
        termination,
        parseStatus: answer ? 'parsed' : 'empty_answer',
      });
      if (!appliedModel) {
        const error = new Error('Provider response omitted applied model identity');
        error.providerMetadata = metadata;
        throw error;
      }
      if (!termination) {
        const error = new Error('Provider response omitted termination status');
        error.providerMetadata = metadata;
        throw error;
      }
      if (['length', 'max_tokens'].includes(String(termination || '').toLowerCase())) {
        const error = new Error('Provider response terminated before completion');
        error.providerMetadata = metadata;
        throw error;
      }
      if (!answer) {
        const error = new Error('Provider response omitted answer content');
        error.providerMetadata = metadata;
        throw error;
      }
      this.requestCount += 1;
      this.totalLatency += metadata.latencyMs;
      return { answer, metadata };
    } catch (error) {
      this.errors += 1;
      if (!error.providerMetadata) {
        error.providerMetadata = this._responseMetadata({
          startedAt,
          startedMs,
          rawBody: error.rawResponse || Buffer.alloc(0),
          statusCode: error.statusCode || null,
          parseStatus: 'request_failed',
        });
      }
      throw error;
    }
  }

  /**
   * Generate a response WITHOUT applying _cleanResponse() post-processing.
   * Use this for structured output (tool calls, JSON, XML, code) where
   * sentence-truncation heuristics would destroy valid content.
   *
   * Added 2026-04-08 to unblock mercury-bridge Layer 4 (ReAct loop).
   * The default generateResponse() remains unchanged for TRAI chat mode.
   */
  async generateRawResponse(prompt, maxTokens = null) {
    let tokens = maxTokens == null ? this.maxTokens : maxTokens;

    if (this.minimumTokens > 0 && tokens < this.minimumTokens) {
      tokens = this.minimumTokens;
    }

    const startTime = Date.now();

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

    return responseText || '';
  }

  /**
   * Generate a response using Mercury-2 native tool calling via OpenAI-compatible
   * tools parameter. Returns the full assistant message object from the API.
   *
   * messages: array of {role, content, tool_call_id?, tool_calls?}
   * tools: array of {type: "function", function: {name, description, parameters}}
   * options: {maxTokens?, toolChoice?, temperature?}
   *
   * Returns: {role: "assistant", content: string|null, tool_calls?: [...]}
   *
   * Added 2026-04-08 for mercury-bridge Layer 4 native tool calling rewrite.
   */
  async generateWithTools(messages, tools, options = {}) {
    if (this.provider.requestFormat !== 'openai') {
      throw new Error(`generateWithTools requires OpenAI-format provider, got: ${this.provider.requestFormat}`);
    }

    let tokens = options.maxTokens == null ? this.maxTokens : options.maxTokens;
    if (this.minimumTokens > 0 && tokens < this.minimumTokens) {
      tokens = this.minimumTokens;
    }

    const body = {
      ...this.openaiExtraBody,
      model: this.model,
      messages: messages,
      tools: tools,
      max_tokens: tokens,
    };

    if (options.toolChoice) {
      body.tool_choice = options.toolChoice;
    }
    if (options.temperature != null) {
      body.temperature = options.temperature;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers[this.provider.authHeader] = `${this.provider.authPrefix}${this.apiKey}`;
    }

    const startTime = Date.now();

    const response = await this._httpRequest(
      `${this.baseUrl}/chat/completions`,
      'POST',
      body,
      headers
    );

    const latency = Date.now() - startTime;
    this.requestCount++;
    this.totalLatency += latency;

    const data = JSON.parse(response);
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error(`Unexpected response shape: ${JSON.stringify(data).slice(0, 500)}`);
    }

    return data.choices[0].message;
  }

  async generateWithToolsWithMetadata(messages, tools, options = {}) {
    if (this.provider.requestFormat !== 'openai') {
      throw new Error(`generateWithToolsWithMetadata requires OpenAI-format provider, got: ${this.provider.requestFormat}`);
    }
    let tokens = options.maxTokens == null ? this.maxTokens : options.maxTokens;
    if (this.minimumTokens > 0 && tokens < this.minimumTokens) tokens = this.minimumTokens;
    const body = {
      ...this.openaiExtraBody,
      model: this.model,
      messages,
      tools,
      max_tokens: tokens,
    };
    if (options.toolChoice) body.tool_choice = options.toolChoice;
    if (options.temperature != null) body.temperature = options.temperature;
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers[this.provider.authHeader] = `${this.provider.authPrefix}${this.apiKey}`;
    const startedAt = new Date();
    const startedMs = Date.now();
    try {
      const httpResult = await this._httpRequestWithMetadata(
        `${this.baseUrl}/chat/completions`, 'POST', body, headers
      );
      const rawText = httpResult.rawBody.toString('utf8');
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (error) {
        error.providerMetadata = this._responseMetadata({
          startedAt, startedMs, rawBody: httpResult.rawBody,
          statusCode: httpResult.statusCode, parseStatus: 'invalid_json',
        });
        throw error;
      }
      const choice = data.choices && data.choices[0];
      const metadata = this._responseMetadata({
        startedAt,
        startedMs,
        rawBody: httpResult.rawBody,
        statusCode: httpResult.statusCode,
        appliedModel: data.model || null,
        termination: choice ? choice.finish_reason || null : null,
        parseStatus: choice && choice.message ? 'parsed' : 'unexpected_shape',
      });
      if (!metadata.appliedModel) {
        const error = new Error('Provider response omitted applied model identity');
        error.providerMetadata = metadata;
        throw error;
      }
      if (!metadata.termination) {
        const error = new Error('Provider response omitted termination status');
        error.providerMetadata = metadata;
        throw error;
      }
      if (['length', 'max_tokens'].includes(String(metadata.termination || '').toLowerCase())) {
        const error = new Error('Provider response terminated before completion');
        error.providerMetadata = metadata;
        throw error;
      }
      if (!choice || !choice.message) {
        const error = new Error('Unexpected provider response shape');
        error.providerMetadata = metadata;
        throw error;
      }
      this.requestCount += 1;
      this.totalLatency += metadata.latencyMs;
      return { message: choice.message, metadata };
    } catch (error) {
      this.errors += 1;
      if (!error.providerMetadata) {
        error.providerMetadata = this._responseMetadata({
          startedAt, startedMs, rawBody: error.rawResponse || Buffer.alloc(0),
          statusCode: error.statusCode || null, parseStatus: 'request_failed',
        });
      }
      throw error;
    }
  }

  _responseMetadata({ startedAt, startedMs, rawBody, statusCode, appliedModel = null, termination = null, parseStatus }) {
    const finishedAt = new Date();
    return {
      provider: this.providerName,
      requestedModel: this.model,
      appliedModel,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      latencyMs: Date.now() - startedMs,
      statusCode,
      termination,
      parseStatus,
      rawResponse: Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || ''),
    };
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
      ...this.openaiExtraBody,
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
        throw new Error(`Configured Ollama model '${this.model}' not found. Available: ${available}`);
      }
      
      // Warmup
      console.log(`[TRAI] Warming up ${this.model}...`);
      const start = Date.now();
      await this._callOllama('Hello', 10);
      console.log(`[TRAI] Warmup: ${Date.now() - start}ms`);
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

  // ─── HTTP Helper ───────────────────────────────────────────────

  _httpRequest(url, method, body, headers) {
    return this._httpRequestWithMetadata(url, method, body, headers)
      .then(result => result.rawBody.toString('utf8'));
  }

  _httpRequestWithMetadata(url, method, body, headers) {
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
        timeout: this.requestTimeoutMs,
      };

      const req = lib.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks);
          if (res.statusCode >= 400) {
            const error = new Error(`HTTP ${res.statusCode}: ${rawBody.toString('utf8', 0, 200)}`);
            error.statusCode = res.statusCode;
            error.rawResponse = rawBody;
            reject(error);
          } else {
            resolve({ statusCode: res.statusCode, headers: res.headers, rawBody });
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
    console.log('[TRAI] LLM client shutdown');
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
