'use strict';

const path = require('path');
const { execFile } = require('child_process');
const config = require('./config');

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function normalizeClaudeCodeFrames(parsed) {
  return Array.isArray(parsed) ? parsed : [parsed];
}

function extractAnswerFromClaudeCodeFrames(frames) {
  const resultFrame = [...frames].reverse().find(frame => frame && frame.type === 'result' && typeof frame.result === 'string');
  if (resultFrame) return resultFrame.result;

  const assistantFrame = [...frames].reverse().find(frame => frame && frame.type === 'assistant' && frame.message);
  const content = assistantFrame && assistantFrame.message && assistantFrame.message.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter(part => part && part.type === 'text')
      .map(part => part.text || '')
      .join('\n')
      .trim();
  }

  return null;
}

function splitJsonValuesFromLine(line) {
  const values = [];
  let start = -1;
  let depth = 0;
  let quote = null;
  let escaping = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{' || char === '[') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if ((char === '}' || char === ']') && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        values.push(line.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return values;
}

function extractClaudeCodeResult(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return '';

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const jsonLikeLines = text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.startsWith('{') || line.startsWith('['));
    const parsedFrames = [];
    for (const line of jsonLikeLines) {
      for (const candidate of splitJsonValuesFromLine(line)) {
        try {
          parsedFrames.push(...normalizeClaudeCodeFrames(JSON.parse(candidate)));
        } catch (lineError) {
          // Keep scanning older JSON-like frames; Claude Code can interleave text.
        }
      }
    }
    const lineAnswer = extractAnswerFromClaudeCodeFrames(parsedFrames);
    return lineAnswer == null ? text : lineAnswer;
  }

  return extractAnswerFromClaudeCodeFrames(normalizeClaudeCodeFrames(parsed)) || text;
}

class ClaudeCodeConsensusClient {
  constructor(clientOptions) {
    this.providerName = clientOptions.provider;
    this.model = clientOptions.model;
    this.command = clientOptions.command;
    this.permissionMode = clientOptions.permissionMode;
    this.maxTokens = clientOptions.maxTokens;
    this.minimumTokens = clientOptions.minimumTokens;
    this.temperature = clientOptions.temperature;
    this.requestTimeoutMs = clientOptions.requestTimeoutMs;
    this.systemPrompt = clientOptions.systemPrompt;
    this.requestCount = 0;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const answer = await this.runClaudeCode(
      'Reply with exactly: FABLE_OK',
      'Reply only with the exact requested literal text.'
    );
    if (answer.trim() !== 'FABLE_OK') {
      throw new Error(`Claude Code Fable warmup returned unexpected output: ${answer.slice(0, 120)}`);
    }
    this.initialized = true;
  }

  async generateResponse(prompt) {
    await this.initialize();
    return this.runClaudeCode(prompt, this.systemPrompt);
  }

  async runClaudeCode(prompt, systemPrompt) {
    const args = [
      '-p',
      '--model', this.model,
      '--permission-mode', this.permissionMode,
      '--output-format', 'json',
      '--no-session-persistence',
      '--tools', '',
      '--system-prompt', systemPrompt,
      prompt,
    ];
    const childEnv = { ...process.env };
    delete childEnv.ANTHROPIC_API_KEY;
    delete childEnv.CLAUDE_API_KEY;
    delete childEnv.LLM_API_KEY;

    const { stdout } = await execFileAsync(this.command, args, {
      cwd: config.REPO_ROOT,
      env: childEnv,
      timeout: this.requestTimeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    this.requestCount += 1;
    return extractClaudeCodeResult(stdout);
  }
}

function resolveMercuryLlmClientOptions({ systemPrompt } = {}) {
  if (typeof systemPrompt !== 'string' || systemPrompt.trim() === '') {
    throw new Error('Mercury LLM systemPrompt must be supplied from mercury.config.json');
  }

  let apiKey = '';
  if (config.MERCURY_LLM_PROVIDER !== 'ollama') {
    apiKey = process.env[config.MERCURY_LLM_API_KEY_ENV];
    if (!apiKey) {
      throw new Error(`Configured Mercury LLM API key env is missing: ${config.MERCURY_LLM_API_KEY_ENV}`);
    }
  }

  return {
    provider: config.MERCURY_LLM_PROVIDER,
    baseUrl: config.MERCURY_LLM_BASE_URL,
    model: config.MERCURY_LLM_MODEL,
    apiKey,
    authRequired: config.MERCURY_LLM_PROVIDER !== 'ollama',
    maxTokens: config.MERCURY_LLM_CLIENT_MAX_TOKENS,
    minimumTokens: config.MERCURY_LLM_CLIENT_MIN_TOKENS,
    temperature: config.MERCURY_LLM_TEMPERATURE,
    requestTimeoutMs: config.MERCURY_LLM_REQUEST_TIMEOUT_MS,
    systemPrompt,
  };
}

function resolveConsensusLlmClientOptions({ systemPrompt = config.CONSENSUS_SYSTEM_PROMPT } = {}) {
  if (typeof systemPrompt !== 'string' || systemPrompt.trim() === '') {
    throw new Error('Consensus LLM systemPrompt must be supplied from mercury.config.json');
  }

  const authRequired = config.CONSENSUS_PROVIDER !== 'claude-code' && config.CONSENSUS_PROVIDER !== 'ollama';
  let apiKey = '';
  if (authRequired) {
    apiKey = process.env[config.CONSENSUS_API_KEY_ENV];
    if (!apiKey) {
      throw new Error(`Configured consensus LLM API key env is missing: ${config.CONSENSUS_API_KEY_ENV}`);
    }
  }

  return {
    provider: config.CONSENSUS_PROVIDER,
    baseUrl: config.CONSENSUS_BASE_URL,
    model: config.CONSENSUS_MODEL,
    apiKey,
    authRequired,
    command: config.CONSENSUS_COMMAND,
    permissionMode: config.CONSENSUS_PERMISSION_MODE,
    maxTokens: config.CONSENSUS_CLIENT_MAX_TOKENS,
    minimumTokens: config.CONSENSUS_CLIENT_MIN_TOKENS,
    temperature: config.CONSENSUS_TEMPERATURE,
    requestTimeoutMs: config.CONSENSUS_REQUEST_TIMEOUT_MS,
    openaiExtraBody: config.CONSENSUS_OPENAI_EXTRA_BODY,
    systemPrompt,
  };
}

function createMercuryLlmClient({ systemPrompt } = {}) {
  const PersistentLLMClient = require(path.join(config.REPO_ROOT, 'core', 'persistent_llm_client.js'));
  const clientOptions = resolveMercuryLlmClientOptions({ systemPrompt });
  const client = new PersistentLLMClient(clientOptions);

  if (client.providerName !== clientOptions.provider) {
    throw new Error(`Mercury LLM provider mismatch: expected ${clientOptions.provider}, got ${client.providerName}`);
  }
  if (client.baseUrl !== clientOptions.baseUrl) {
    throw new Error(`Mercury LLM baseUrl mismatch: expected ${clientOptions.baseUrl}, got ${client.baseUrl}`);
  }
  if (client.model !== clientOptions.model) {
    throw new Error(`Mercury LLM model mismatch: expected ${clientOptions.model}, got ${client.model}`);
  }
  if (client.maxTokens !== clientOptions.maxTokens) {
    throw new Error(`Mercury LLM maxTokens mismatch: expected ${clientOptions.maxTokens}, got ${client.maxTokens}`);
  }
  if (client.minimumTokens !== clientOptions.minimumTokens) {
    throw new Error(`Mercury LLM minimumTokens mismatch: expected ${clientOptions.minimumTokens}, got ${client.minimumTokens}`);
  }
  if (client.temperature !== clientOptions.temperature) {
    throw new Error(`Mercury LLM temperature mismatch: expected ${clientOptions.temperature}, got ${client.temperature}`);
  }
  if (client.requestTimeoutMs !== clientOptions.requestTimeoutMs) {
    throw new Error(`Mercury LLM requestTimeoutMs mismatch: expected ${clientOptions.requestTimeoutMs}, got ${client.requestTimeoutMs}`);
  }
  if (client.systemPrompt !== clientOptions.systemPrompt) {
    throw new Error('Mercury LLM system prompt was not sourced from mercury.config.json');
  }
  if (client.provider.authHeader) {
    if (client.apiKey !== clientOptions.apiKey) {
      throw new Error('Mercury LLM API key was not sourced from the configured key env');
    }
  } else {
    client.apiKey = '';
  }

  return client;
}

function createConsensusLlmClient({ systemPrompt = config.CONSENSUS_SYSTEM_PROMPT } = {}) {
  const clientOptions = resolveConsensusLlmClientOptions({ systemPrompt });
  if (clientOptions.provider === 'claude-code') {
    return new ClaudeCodeConsensusClient(clientOptions);
  }

  const PersistentLLMClient = require(path.join(config.REPO_ROOT, 'core', 'persistent_llm_client.js'));
  const client = new PersistentLLMClient(clientOptions);

  if (client.providerName !== clientOptions.provider) {
    throw new Error(`Consensus LLM provider mismatch: expected ${clientOptions.provider}, got ${client.providerName}`);
  }
  if (client.baseUrl !== clientOptions.baseUrl) {
    throw new Error(`Consensus LLM baseUrl mismatch: expected ${clientOptions.baseUrl}, got ${client.baseUrl}`);
  }
  if (client.model !== clientOptions.model) {
    throw new Error(`Consensus LLM model mismatch: expected ${clientOptions.model}, got ${client.model}`);
  }
  if (client.maxTokens !== clientOptions.maxTokens) {
    throw new Error(`Consensus LLM maxTokens mismatch: expected ${clientOptions.maxTokens}, got ${client.maxTokens}`);
  }
  if (client.minimumTokens !== clientOptions.minimumTokens) {
    throw new Error(`Consensus LLM minimumTokens mismatch: expected ${clientOptions.minimumTokens}, got ${client.minimumTokens}`);
  }
  if (client.temperature !== clientOptions.temperature) {
    throw new Error(`Consensus LLM temperature mismatch: expected ${clientOptions.temperature}, got ${client.temperature}`);
  }
  if (client.requestTimeoutMs !== clientOptions.requestTimeoutMs) {
    throw new Error(`Consensus LLM requestTimeoutMs mismatch: expected ${clientOptions.requestTimeoutMs}, got ${client.requestTimeoutMs}`);
  }
  if (JSON.stringify(client.openaiExtraBody) !== JSON.stringify(clientOptions.openaiExtraBody)) {
    throw new Error('Consensus LLM OpenAI extra body was not sourced from mercury.config.json');
  }
  if (client.systemPrompt !== clientOptions.systemPrompt) {
    throw new Error('Consensus LLM system prompt was not sourced from mercury.config.json');
  }
  if (client.apiKey !== clientOptions.apiKey) {
    throw new Error('Consensus LLM API key was not sourced from the configured key env');
  }

  return client;
}

module.exports = {
  extractClaudeCodeResult,
  ClaudeCodeConsensusClient,
  resolveMercuryLlmClientOptions,
  createMercuryLlmClient,
  resolveConsensusLlmClientOptions,
  createConsensusLlmClient,
};
