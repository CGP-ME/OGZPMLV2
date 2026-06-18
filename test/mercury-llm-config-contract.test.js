'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

  test('break-my-fix context is injected by the bridge only for break-my-fix prompts', async () => {
    await withMercuryConfig({}, () => {
      const { buildBreakMyFixDiffContext } = require('../trai_brain/mercury-bridge/ask');
      const gitOutput = jest.fn(() => {
        throw new Error('git must not be read for non-break prompts');
      });

      expect(buildBreakMyFixDiffContext('Find bugs in this change', gitOutput)).toBeNull();
      expect(gitOutput).not.toHaveBeenCalled();
    });
  });

  test('break-my-fix context prefers staged tracked diff to isolate one-change reviews', async () => {
    await withMercuryConfig({}, () => {
      const { buildBreakMyFixDiffContext } = require('../trai_brain/mercury-bridge/ask');
      const gitOutput = jest.fn((args) => {
        if (args[0] === 'status') return 'M  trai_brain/mercury-bridge/ask.js\n M core/EvalRuleEngine.js\n';
        if (args[0] === 'diff' && args[1] === '--cached') return 'diff --git a/trai_brain/mercury-bridge/ask.js b/trai_brain/mercury-bridge/ask.js\n+staged bridge change\n';
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

      const context = buildBreakMyFixDiffContext('Mercury, break my fix. Use the current dirty git diff.', gitOutput);

      expect(context).toContain('Neutral break-my-fix context supplied by mercury-bridge');
      expect(context).toContain('git status --short --untracked-files=no');
      expect(context).toContain('Diff source: staged tracked diff');
      expect(context).toContain('+staged bridge change');
      expect(gitOutput).toHaveBeenCalledWith(['status', '--short', '--untracked-files=no']);
      expect(gitOutput).toHaveBeenCalledWith(['diff', '--cached', '--no-ext-diff', '--']);
      expect(gitOutput).not.toHaveBeenCalledWith(['diff', '--no-ext-diff', '--']);
    });
  });

  test('break-my-fix context falls back to unstaged tracked diff when nothing is staged', async () => {
    await withMercuryConfig({}, () => {
      const { buildBreakMyFixDiffContext } = require('../trai_brain/mercury-bridge/ask');
      const gitOutput = jest.fn((args) => {
        if (args[0] === 'status') return ' M core/EvalRuleEngine.js\n';
        if (args[0] === 'diff' && args[1] === '--cached') return '';
        if (args[0] === 'diff') return 'diff --git a/core/EvalRuleEngine.js b/core/EvalRuleEngine.js\n+unstaged market-time change\n';
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

      const context = buildBreakMyFixDiffContext('Mercury, break my fix.', gitOutput);

      expect(context).toContain('Diff source: unstaged tracked diff');
      expect(context).toContain('+unstaged market-time change');
      expect(gitOutput).toHaveBeenCalledWith(['diff', '--no-ext-diff', '--']);
    });
  });

  test('break-my-fix changed-file scope prefers staged files and falls back to unstaged files', async () => {
    await withMercuryConfig({}, () => {
      const { listBreakMyFixChangedFiles } = require('../trai_brain/mercury-bridge/ask');
      const stagedGitOutput = jest.fn((args) => {
        if (args.includes('--cached')) return 'trai_brain/mercury-bridge/ask.js\n';
        throw new Error(`unstaged diff should not be read when staged files exist: ${args.join(' ')}`);
      });
      const unstagedGitOutput = jest.fn((args) => {
        if (args.includes('--cached')) return '';
        return 'core/EvalRuleEngine.js\ntest/eval-rule-engine.test.js\n';
      });

      expect(listBreakMyFixChangedFiles(stagedGitOutput)).toEqual(['trai_brain/mercury-bridge/ask.js']);
      expect(listBreakMyFixChangedFiles(unstagedGitOutput)).toEqual([
        'core/EvalRuleEngine.js',
        'test/eval-rule-engine.test.js',
      ]);
    });
  });

  test('break-my-fix context truncates oversized diffs loudly', async () => {
    await withMercuryConfig({}, () => {
      const { truncateForContext } = require('../trai_brain/mercury-bridge/ask');

      expect(truncateForContext('abcdef', 3)).toBe(
        'abc\n\n[bridge truncated dirty diff context at 3 characters; split the fix before Mercury if the omitted diff matters]'
      );
    });
  });

  test('single-shot CLI refuses break-my-fix prompts before RAG retrieval', () => {
    const result = spawnSync(process.execPath, [
      'trai_brain/mercury-bridge/ask.js',
      'Mercury, break my fix.',
    ], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('break-my-fix prompts require --agentic');
    expect(result.stdout).not.toContain('Embedding query');
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
