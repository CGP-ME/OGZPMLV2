'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const PersistentLLMClient = require('../core/persistent_llm_client');
const TRAICore = require('../core/trai_core');
const { resolveTraiLlmConfig } = require('../core/trai_llm_config');
const tradingConfig = require('../config/trading.config.json');

const explicitClientConfig = Object.freeze({
  provider: 'mercury',
  baseUrl: 'https://configured.example/v1',
  model: 'configured-model',
  apiKey: 'configured-key',
  authRequired: true,
  maxTokens: 1234,
  minimumTokens: 400,
  temperature: 0.4,
  requestTimeoutMs: 45000,
  systemPrompt: 'configured system prompt',
});

function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

describe('TRAI LLM config contract', () => {
  test('PersistentLLMClient refuses bare construction', () => {
    expect(() => new PersistentLLMClient()).toThrow(/requires explicit LLM config/);
  });

  test('TRAICore refuses construction without explicit llmConfig', () => {
    expect(() => new TRAICore()).toThrow(/requires explicit llmConfig/);
  });

  test('PersistentLLMClient ignores ambient LLM fallback env values', () => {
    withEnv({
      LLM_PROVIDER: 'openai',
      LLM_BASE_URL: 'https://api.openai.com/v1',
      LLM_MODEL: 'gpt-4o-mini',
      LLM_API_KEY: 'ambient-key',
      INCEPTION_API_KEY: 'ambient-inception-key',
      LLM_MAX_TOKENS: '1',
      LLM_TEMPERATURE: '0.1',
    }, () => {
      const client = new PersistentLLMClient(explicitClientConfig);

      expect(client.providerName).toBe('mercury');
      expect(client.baseUrl).toBe('https://configured.example/v1');
      expect(client.model).toBe('configured-model');
      expect(client.apiKey).toBe('configured-key');
      expect(client.maxTokens).toBe(1234);
      expect(client.minimumTokens).toBe(400);
      expect(client.temperature).toBe(0.4);
      expect(client.requestTimeoutMs).toBe(45000);
      expect(client.systemPrompt).toBe('configured system prompt');
    });
  });

  test('cloud providers require an explicit apiKey value', () => {
    expect(() => new PersistentLLMClient({
      ...explicitClientConfig,
      apiKey: '',
    })).toThrow(/config\.apiKey must be a non-empty string/);
  });

  test('ollama allows auth-free config only when authRequired is false', () => {
    const client = new PersistentLLMClient({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'configured-local-model',
      apiKey: '',
      authRequired: false,
      maxTokens: 1000,
      minimumTokens: 0,
      temperature: 0.3,
      requestTimeoutMs: 10000,
      systemPrompt: 'configured local prompt',
    });

    expect(client.providerName).toBe('ollama');
    expect(client.apiKey).toBe('');
  });

  test('initialize accepts short non-empty warmup responses without using cleaned chat fallback', async () => {
    const client = new PersistentLLMClient(explicitClientConfig);
    const requestSpy = jest.spyOn(client, '_httpRequest').mockResolvedValue(JSON.stringify({
      choices: [{ message: { content: 'OK' } }],
    }));

    await expect(client.initialize()).resolves.toBeUndefined();

    expect(client.isReady).toBe(true);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    requestSpy.mockRestore();
  });

  test('resolveTraiLlmConfig uses the configured key env and rejects fallback key names', () => {
    const config = {
      trai: {
        llm: {
          provider: 'mercury',
          baseUrl: 'https://api.inceptionlabs.ai/v1',
          model: 'mercury-2',
          apiKeyEnv: 'TRAI_TEST_LLM_KEY',
          authRequired: true,
          maxTokens: 1000,
          minimumTokens: 400,
          temperature: 0.8,
          requestTimeoutMs: 60000,
          systemPrompt: 'configured prompt',
        },
      },
    };

    expect(() => resolveTraiLlmConfig({
      config,
      env: {
        LLM_API_KEY: 'ambient-key',
        INCEPTION_API_KEY: 'ambient-inception-key',
      },
    })).toThrow(/env\.TRAI_TEST_LLM_KEY must be a non-empty string/);

    const resolved = resolveTraiLlmConfig({
      config,
      env: {
        TRAI_TEST_LLM_KEY: 'configured-key',
        LLM_API_KEY: 'ambient-key',
        INCEPTION_API_KEY: 'ambient-inception-key',
      },
    });

    expect(resolved).toMatchObject({
      provider: 'mercury',
      baseUrl: 'https://api.inceptionlabs.ai/v1',
      model: 'mercury-2',
      apiKey: 'configured-key',
      apiKeyEnv: 'TRAI_TEST_LLM_KEY',
      maxTokens: 1000,
      minimumTokens: 400,
      temperature: 0.8,
      requestTimeoutMs: 60000,
      systemPrompt: 'configured prompt',
    });
  });

  test('canonical trading config owns the TRAI LLM runtime block', () => {
    expect(tradingConfig.trai.llm).toMatchObject({
      provider: 'mercury',
      baseUrl: 'https://api.inceptionlabs.ai/v1',
      model: 'mercury-2',
      apiKeyEnv: 'INCEPTION_API_KEY',
      authRequired: true,
      maxTokens: 1000,
      minimumTokens: 400,
      temperature: 0.8,
      requestTimeoutMs: 60000,
    });
    expect(typeof tradingConfig.trai.llm.systemPrompt).toBe('string');
    expect(tradingConfig.trai.llm.systemPrompt.length).toBeGreaterThan(50);
  });

  test('tracked runtime callers do not construct PersistentLLMClient without explicit config', () => {
    const repoRoot = path.join(__dirname, '..');
    const ignoredRuntimeScanFiles = new Set([
      path.join('core', 'persistent_llm_client.js'),
    ]);

    const trackedJsFiles = childProcess.execFileSync('git', ['ls-files', '*.js'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(relativePath => !relativePath.startsWith('test/'))
      .filter(relativePath => !relativePath.startsWith('ogz-meta/ledger/'))
      .filter(relativePath => !relativePath.startsWith('ogz-meta/cognition-history/'))
      .filter(relativePath => !ignoredRuntimeScanFiles.has(relativePath))
      .filter(relativePath => fs.existsSync(path.join(repoRoot, relativePath)));

    const violations = trackedJsFiles.filter((relativePath) => {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        return /new\s+PersistentLLMClient\s*\(\s*\)/.test(source)
          || /new\s+PersistentLLMClient\s*\(\s*\{\s*provider\s*:/s.test(source);
      });

    expect(violations).toEqual([]);
  });
});
