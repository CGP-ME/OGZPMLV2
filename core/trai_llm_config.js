'use strict';

const fs = require('fs');
const path = require('path');

const TRADING_CONFIG_PATH = path.join(__dirname, '..', 'config', 'trading.config.json');

function readTradingConfig(configPath = TRADING_CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function requireObject(value, pathLabel) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[TRAI-LLM-CONFIG] ${pathLabel} must be an object`);
  }
  return value;
}

function requireString(value, pathLabel) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[TRAI-LLM-CONFIG] ${pathLabel} must be a non-empty string`);
  }
  return value.trim();
}

function requireNumber(value, pathLabel, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`[TRAI-LLM-CONFIG] ${pathLabel} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function requireInteger(value, pathLabel, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`[TRAI-LLM-CONFIG] ${pathLabel} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertValidUrl(value, pathLabel) {
  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`[TRAI-LLM-CONFIG] ${pathLabel} must not contain credentials, query parameters, or fragments`);
  }
  return value.replace(/\/+$/, '');
}

function resolveTraiLlmConfig(options = {}) {
  const sourceConfig = options.config || readTradingConfig(options.configPath);
  const env = options.env || process.env;
  const traiConfig = requireObject(sourceConfig.trai, 'trai');
  const llmConfig = requireObject(traiConfig.llm, 'trai.llm');

  const provider = requireString(llmConfig.provider, 'trai.llm.provider').toLowerCase();
  const baseUrl = assertValidUrl(requireString(llmConfig.baseUrl, 'trai.llm.baseUrl'), 'trai.llm.baseUrl');
  const model = requireString(llmConfig.model, 'trai.llm.model');
  const authRequired = llmConfig.authRequired !== false;
  const apiKeyEnv = authRequired ? requireString(llmConfig.apiKeyEnv, 'trai.llm.apiKeyEnv') : '';
  const apiKey = authRequired ? requireString(env[apiKeyEnv], `env.${apiKeyEnv}`) : '';

  return Object.freeze({
    provider,
    baseUrl,
    model,
    apiKey,
    apiKeyEnv,
    authRequired,
    maxTokens: requireInteger(llmConfig.maxTokens, 'trai.llm.maxTokens', { min: 1, max: 200000 }),
    minimumTokens: requireInteger(llmConfig.minimumTokens, 'trai.llm.minimumTokens', { min: 0, max: 200000 }),
    temperature: requireNumber(llmConfig.temperature, 'trai.llm.temperature', { min: 0, max: 2 }),
    requestTimeoutMs: requireInteger(llmConfig.requestTimeoutMs, 'trai.llm.requestTimeoutMs', { min: 1000, max: 300000 }),
    systemPrompt: requireString(llmConfig.systemPrompt, 'trai.llm.systemPrompt'),
  });
}

module.exports = {
  TRADING_CONFIG_PATH,
  readTradingConfig,
  resolveTraiLlmConfig,
};
