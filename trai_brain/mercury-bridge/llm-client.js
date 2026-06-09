'use strict';

const path = require('path');
const config = require('./config');

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
    maxTokens: config.MERCURY_LLM_CLIENT_MAX_TOKENS,
    temperature: config.MERCURY_LLM_TEMPERATURE,
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
  if (client.temperature !== clientOptions.temperature) {
    throw new Error(`Mercury LLM temperature mismatch: expected ${clientOptions.temperature}, got ${client.temperature}`);
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

module.exports = {
  resolveMercuryLlmClientOptions,
  createMercuryLlmClient,
};
