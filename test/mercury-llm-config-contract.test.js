'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const baseMercuryConfig = require('../mercury.config.json');

async function withEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  jest.resetModules();
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    jest.resetModules();
  }
}

function mergeConfig(base, overrides = {}) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && base[key]
      && typeof base[key] === 'object'
      && !Array.isArray(base[key])
    ) {
      result[key] = mergeConfig(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function withMercuryConfig(overrides, fn, env = {}) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ogz-mercury-llm-config-'));
  const configPath = path.join(tmpRoot, 'mercury.config.json');
  const config = mergeConfig(baseMercuryConfig, overrides);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  try {
    return await withEnv({
      MERCURY_CONFIG_FILE: configPath,
      ...env,
    }, fn);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

describe('Mercury LLM config contract', () => {
  test('environment LLM values do not override mercury.config.json', async () => {
    await withMercuryConfig({}, () => {
      const config = require('../trai_brain/mercury-bridge/config');

      expect(config.MERCURY_LLM_PROVIDER).toBe('mercury');
      expect(config.MERCURY_LLM_BASE_URL).toBe('https://api.inceptionlabs.ai/v1');
      expect(config.MERCURY_LLM_MODEL).toBe('mercury-2');
      expect(config.MERCURY_LLM_API_KEY_ENV).toBe('INCEPTION_API_KEY');
      expect(config.MERCURY_LLM_CLIENT_MAX_TOKENS).toBe(7750);
      expect(config.MERCURY_LLM_CLIENT_MIN_TOKENS).toBe(400);
      expect(config.MERCURY_LLM_REQUEST_TIMEOUT_MS).toBe(300000);
      expect(config.MERCURY_LLM_TEMPERATURE).toBe(baseMercuryConfig.llm.temperature);
      expect(config.AGENTIC_MAX_ITERATIONS).toBe(60);
      expect(config.AGENTIC_MAX_TOKENS).toBe(7750);
      expect(config.SINGLE_SHOT_MAX_TOKENS).toBe(2000);
    }, {
      LLM_PROVIDER: 'openai',
      LLM_BASE_URL: 'https://api.openai.com/v1',
      LLM_MODEL: 'gpt-4o-mini',
      LLM_MAX_TOKENS: '1',
      LLM_TEMPERATURE: '0.1',
      MERCURY_MAX_ITERATIONS: '1',
    });
  });

  test('LLM API key must come from the configured key env', async () => {
    await withMercuryConfig({
      llm: {
        apiKeyEnv: 'MERCURY_TEST_LLM_KEY',
      },
    }, () => {
      const { resolveMercuryLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');

      expect(() => resolveMercuryLlmClientOptions({ systemPrompt: 'configured prompt' }))
        .toThrow(/Configured Mercury LLM API key env is missing: MERCURY_TEST_LLM_KEY/);
    }, {
      MERCURY_TEST_LLM_KEY: undefined,
      LLM_API_KEY: 'fallback-must-not-be-read',
      INCEPTION_API_KEY: 'fallback-must-not-be-read',
      MERCURY_API_KEY: 'fallback-must-not-be-read',
      OPENAI_API_KEY: 'fallback-must-not-be-read',
      ANTHROPIC_API_KEY: 'fallback-must-not-be-read',
    });
  });

  test('resolved LLM client options use configured identity and configured key only', async () => {
    await withMercuryConfig({
      llm: {
        apiKeyEnv: 'MERCURY_TEST_LLM_KEY',
      },
    }, () => {
      const { resolveMercuryLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      const options = resolveMercuryLlmClientOptions({ systemPrompt: 'configured prompt' });

      expect(options).toMatchObject({
        provider: 'mercury',
        baseUrl: 'https://api.inceptionlabs.ai/v1',
        model: 'mercury-2',
        apiKey: 'configured-key',
        authRequired: true,
        maxTokens: 7750,
        minimumTokens: 400,
        temperature: baseMercuryConfig.llm.temperature,
        requestTimeoutMs: 300000,
        systemPrompt: 'configured prompt',
      });
    }, {
      MERCURY_TEST_LLM_KEY: 'configured-key',
      LLM_API_KEY: 'fallback-must-not-be-read',
      INCEPTION_API_KEY: 'fallback-must-not-be-read',
      MERCURY_API_KEY: 'fallback-must-not-be-read',
      OPENAI_API_KEY: 'fallback-must-not-be-read',
      ANTHROPIC_API_KEY: 'fallback-must-not-be-read',
    });
  });

  test('Mercury evidence posture stays locked to current config contract', () => {
    const prompt = baseMercuryConfig.agentic.systemPrompt.join('\n');

    expect(baseMercuryConfig.llm.temperature).toBe(0.8);
    expect(baseMercuryConfig.agentic.maxIterations).toBe(60);
    expect(baseMercuryConfig.agentic.maxTokens).toBe(7750);
    expect(prompt).toContain('file:line citations');
    expect(prompt).toContain('dependency blast radius');
    expect(prompt).toContain('Do not optimize for speed');
    expect(prompt).toContain('say exactly what evidence is missing');
    expect(prompt).not.toContain('Budget: aim');
    expect(prompt).not.toContain('CONCRETE_BREAK_FOUND');
    expect(prompt).not.toContain('NO_CONCRETE_BREAK_FOUND');
    expect(prompt).not.toContain('break-my-fix answers must');
    expect(prompt).not.toContain('dirty diff');
  });

  test('LLM client options require a config-owned system prompt', async () => {
    await withMercuryConfig({}, () => {
      const { resolveMercuryLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');

      expect(() => resolveMercuryLlmClientOptions())
        .toThrow(/Mercury LLM systemPrompt must be supplied from mercury\.config\.json/);
    }, {
      INCEPTION_API_KEY: 'configured-key',
    });
  });

  test('agentic numeric overrides fail loud before runtime work', async () => {
    await withMercuryConfig({}, async () => {
      const { runAgentic } = require('../trai_brain/mercury-bridge/ask');

      await expect(runAgentic('break this', { quiet: true, maxIterations: 0 }))
        .rejects.toThrow(/--max-iterations must be a positive integer/);
      await expect(runAgentic('break this', { quiet: true, maxIterations: 59 }))
        .rejects.toThrow(/--max-iterations must match mercury\.config\.json value 60/);
      await expect(runAgentic('break this', { quiet: true, maxTokens: Number.NaN }))
        .rejects.toThrow(/--max-tokens must be a positive integer/);
      await expect(runAgentic('break this', { quiet: true, maxTokens: 2000 }))
        .rejects.toThrow(/--max-tokens must match mercury\.config\.json value 7750/);
      await expect(runAgentic('break this', { quiet: true, topK: Number.NaN }))
        .rejects.toThrow(/--top-k must be a non-negative integer/);
    });
  });

  test('single-shot numeric overrides fail loud before runtime work', async () => {
    await withMercuryConfig({}, async () => {
      const { ask } = require('../trai_brain/mercury-bridge/searcher');

      await expect(ask('break this', { topK: 0, verbose: false }))
        .rejects.toThrow(/topK must be a positive integer/);
      await expect(ask('break this', { maxTokens: Number.NaN, verbose: false }))
        .rejects.toThrow(/maxTokens must be a positive integer/);
      await expect(ask('break this', { maxTokens: 7750, verbose: false }))
        .rejects.toThrow(/maxTokens must match mercury\.config\.json value 2000/);
    });
  });
});
