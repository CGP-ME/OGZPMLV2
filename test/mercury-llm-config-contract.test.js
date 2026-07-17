'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const baseMercuryConfig = require('../mercury.config.json');
const { createToolAdapter } = require('../trai_brain/mercury-bridge/tool-adapter');

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
      expect(config.MERCURY_LLM_API_KEY_ENV).toBe(baseMercuryConfig.llm.apiKeyEnv);
      expect(config.MERCURY_LLM_CLIENT_MAX_TOKENS).toBe(7750);
      expect(config.MERCURY_LLM_CLIENT_MIN_TOKENS).toBe(400);
      expect(config.MERCURY_LLM_REQUEST_TIMEOUT_MS).toBe(300000);
      expect(config.MERCURY_LLM_TEMPERATURE).toBe(baseMercuryConfig.llm.temperature);
      expect(config.CONSENSUS_DEFAULT_ENABLED).toBe(false);
      expect(config.CONSENSUS_PROVIDER).toBe('openai');
      expect(config.CONSENSUS_BASE_URL).toBe('https://api.moonshot.ai/v1');
      expect(config.CONSENSUS_MODEL).toBe('kimi-k3');
      expect(config.CONSENSUS_API_KEY_ENV).toBe('MOONSHOT_API_KEY');
      expect(config.CONSENSUS_COMMAND).toBe('claude');
      expect(config.CONSENSUS_PERMISSION_MODE).toBe('dontAsk');
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

  test('explicit consensus client options use the configured Kimi reviewer key', async () => {
    await withMercuryConfig({}, () => {
      const { resolveConsensusLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      const options = resolveConsensusLlmClientOptions();

      expect(options).toMatchObject({
        provider: 'openai',
        baseUrl: 'https://api.moonshot.ai/v1',
        model: 'kimi-k3',
        apiKey: 'placeholder-moonshot-key',
        authRequired: true,
        command: 'claude',
        permissionMode: 'dontAsk',
        maxTokens: 2000,
        minimumTokens: 200,
        temperature: 1,
        requestTimeoutMs: 300000,
      });
      expect(options.systemPrompt).toContain('adversarial reviewer');
    }, {
      MOONSHOT_API_KEY: 'placeholder-moonshot-key',
      ANTHROPIC_API_KEY: undefined,
      CLAUDE_API_KEY: undefined,
      LLM_API_KEY: 'fallback-must-not-be-read',
    });
  });

  test('malformed MERCURY_ADVERSARIAL_REVIEW env does not abort config load', async () => {
    await withMercuryConfig({}, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      expect(config.ADVERSARIAL_REVIEW_DEFAULT_ENABLED).toBe(false);
    }, {
      MERCURY_ADVERSARIAL_REVIEW: 'maybe',
    });

    await withMercuryConfig({}, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      expect(config.ADVERSARIAL_REVIEW_DEFAULT_ENABLED).toBe(false);
    }, {
      MERCURY_ADVERSARIAL_REVIEW: '',
    });
  });

  test('resolved API consensus client options use configured key only when provider is claude', async () => {
    await withMercuryConfig({
      consensus: {
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-fable-5',
        apiKeyEnv: 'MERCURY_TEST_FABLE_KEY',
        temperature: 0,
      },
    }, () => {
      const { resolveConsensusLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      const options = resolveConsensusLlmClientOptions();

      expect(options).toMatchObject({
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-fable-5',
        apiKey: 'TEST_PLACEHOLDER_FABLE_TOKEN',
        authRequired: true,
        maxTokens: 2000,
        minimumTokens: 200,
        temperature: 0,
        requestTimeoutMs: 300000,
      });
      expect(options.systemPrompt).toContain('adversarial reviewer');
    }, {
      MERCURY_TEST_FABLE_KEY: 'TEST_PLACEHOLDER_FABLE_TOKEN',
      ANTHROPIC_API_KEY: 'fallback-must-not-be-read',
      CLAUDE_API_KEY: 'fallback-must-not-be-read',
      LLM_API_KEY: 'fallback-must-not-be-read',
    });
  });

  test('OpenAI-compatible consensus client can target Kimi with configured key only', async () => {
    await withMercuryConfig({
      consensus: {
        provider: 'openai',
        baseUrl: 'https://api.moonshot.ai/v1',
        model: 'kimi-k3',
        temperature: 1,
        apiKeyEnv: 'MOONSHOT_TEST_KEY',
      },
    }, () => {
      const { resolveConsensusLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      const options = resolveConsensusLlmClientOptions();

      expect(options).toMatchObject({
        provider: 'openai',
        baseUrl: 'https://api.moonshot.ai/v1',
        model: 'kimi-k3',
        apiKey: 'placeholder-moonshot-key',
        authRequired: true,
        maxTokens: 2000,
        minimumTokens: 200,
        temperature: 1,
        requestTimeoutMs: 300000,
      });
      expect(options.systemPrompt).toContain('adversarial reviewer');
    }, {
      MOONSHOT_TEST_KEY: 'placeholder-moonshot-key',
      ANTHROPIC_API_KEY: 'fallback-must-not-be-read',
      CLAUDE_API_KEY: 'fallback-must-not-be-read',
      LLM_API_KEY: 'fallback-must-not-be-read',
    });
  });

  test('Ollama Cloud consensus client uses bearer key and OpenAI-format provider path', async () => {
    await withMercuryConfig({
      consensus: {
        provider: 'ollamacloud',
        baseUrl: 'https://ollama.com/v1',
        model: 'qwen3-coder:480b-cloud',
        apiKeyEnv: 'OLLAMA_CLOUD_TEST_KEY',
      },
    }, () => {
      const { resolveConsensusLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      const options = resolveConsensusLlmClientOptions();

      expect(options).toMatchObject({
        provider: 'ollamacloud',
        baseUrl: 'https://ollama.com/v1',
        model: 'qwen3-coder:480b-cloud',
        apiKey: 'placeholder-ollama-cloud-key',
        authRequired: true,
      });
    }, {
      OLLAMA_CLOUD_TEST_KEY: 'placeholder-ollama-cloud-key',
      OLLAMA_API_KEY: 'fallback-must-not-be-read',
      LLM_API_KEY: 'fallback-must-not-be-read',
    });
  });

  test('Ollama consensus client is auth-free and local-only', async () => {
    await withMercuryConfig({
      consensus: {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'qwen-coder-480b',
        apiKeyEnv: null,
      },
    }, () => {
      const { resolveConsensusLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');
      const options = resolveConsensusLlmClientOptions();

      expect(options).toMatchObject({
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'qwen-coder-480b',
        apiKey: '',
        authRequired: false,
      });
    }, {
      OLLAMA_API_KEY: 'fallback-must-not-be-read',
      LLM_API_KEY: 'fallback-must-not-be-read',
    });

    await withMercuryConfig({
      consensus: {
        provider: 'ollama',
        baseUrl: 'https://remote-ollama.example',
        model: 'qwen-coder-480b',
        apiKeyEnv: null,
      },
    }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config'))
        .toThrow(/consensus\.provider=ollama requires a local endpoint/);
    });
  });

  test('API consensus client key is required for remote providers', async () => {
    await withMercuryConfig({
      consensus: {
        provider: 'claude',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-fable-5',
        apiKeyEnv: 'MERCURY_TEST_FABLE_KEY',
      },
    }, () => {
      const config = require('../trai_brain/mercury-bridge/config');
      const { resolveConsensusLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');

      expect(config.CONSENSUS_MODEL).toBe('claude-fable-5');
      expect(() => resolveConsensusLlmClientOptions())
        .toThrow(/Configured consensus LLM API key env is missing: MERCURY_TEST_FABLE_KEY/);
    }, {
      MERCURY_TEST_FABLE_KEY: undefined,
      ANTHROPIC_API_KEY: 'fallback-must-not-be-read',
    });

    await withMercuryConfig({
      consensus: {
        provider: 'openai',
        baseUrl: 'https://api.moonshot.ai/v1',
        model: 'kimi-k3',
        apiKeyEnv: 'MOONSHOT_TEST_KEY',
      },
    }, () => {
      const { resolveConsensusLlmClientOptions } = require('../trai_brain/mercury-bridge/llm-client');

      expect(() => resolveConsensusLlmClientOptions())
        .toThrow(/Configured consensus LLM API key env is missing: MOONSHOT_TEST_KEY/);
    }, {
      MOONSHOT_TEST_KEY: undefined,
    });
  });

  test('consensus endpoint rejects ambiguous or secret-bearing URLs', async () => {
    for (const baseUrl of [
      'https://api.anthropic.com/v1?proxy=1',
      'https://api.anthropic.com/v1#models',
      ['https://user', ':pass@api.anthropic.com/v1'].join(''),
    ]) {
      await withMercuryConfig({
        consensus: { provider: 'claude', baseUrl, apiKeyEnv: 'MERCURY_TEST_FABLE_KEY' },
      }, () => {
        expect(() => require('../trai_brain/mercury-bridge/config'))
          .toThrow(/consensus\.baseUrl must not contain credentials, query parameters, or fragments/);
      }, {
        MERCURY_TEST_FABLE_KEY: 'TEST_PLACEHOLDER_FABLE_TOKEN',
      });
    }
  });

  test('claude-code consensus rejects API key env because auth is owned by Claude Code', async () => {
    await withMercuryConfig({
      consensus: {
        provider: 'claude-code',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
      },
    }, () => {
      expect(() => require('../trai_brain/mercury-bridge/config'))
        .toThrow(/consensus\.apiKeyEnv must be empty when consensus\.provider=claude-code/);
    });
  });

  test('Claude Code result parser accepts JSON result frames and assistant fallback', async () => {
    await withMercuryConfig({}, () => {
      const { extractClaudeCodeResult } = require('../trai_brain/mercury-bridge/llm-client');

      expect(extractClaudeCodeResult(JSON.stringify([
        { type: 'system', subtype: 'init' },
        { type: 'assistant', message: { content: [{ type: 'text', text: 'draft answer' }] } },
        { type: 'result', result: 'final answer' },
      ]))).toBe('final answer');

      expect(extractClaudeCodeResult(JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'assistant answer' }] },
      }))).toBe('assistant answer');

      expect(extractClaudeCodeResult(JSON.stringify({
        type: 'assistant',
        message: { content: 'assistant string answer' },
      }))).toBe('assistant string answer');

      expect(extractClaudeCodeResult('plain text answer')).toBe('plain text answer');
    });
  });

  test('Claude Code result parser skips invalid trailing JSON-like text', async () => {
    await withMercuryConfig({}, () => {
      const { extractClaudeCodeResult } = require('../trai_brain/mercury-bridge/llm-client');
      const output = [
        JSON.stringify({ type: 'result', result: 'real result' }),
        '{ invalid snippet',
      ].join('\n');

      expect(extractClaudeCodeResult(output)).toBe('real result');
      expect(extractClaudeCodeResult('{"type":"result","result":"same-line"}{ invalid snippet'))
        .toBe('same-line');
    });
  });

  test('Claude Code result parser prefers frames over later valid non-frame JSON', async () => {
    await withMercuryConfig({}, () => {
      const { extractClaudeCodeResult } = require('../trai_brain/mercury-bridge/llm-client');

      expect(extractClaudeCodeResult([
        JSON.stringify({ type: 'result', result: 'GOOD' }),
        '[1,2]',
      ].join('\n'))).toBe('GOOD');

      expect(extractClaudeCodeResult([
        JSON.stringify({ type: 'assistant', message: { content: 'assistant good' } }),
        '{"not":"a frame"}',
      ].join('\n'))).toBe('assistant good');
    });
  });

  test('Claude Code result parser extracts frames from concatenated JSON values', async () => {
    await withMercuryConfig({}, () => {
      const { extractClaudeCodeResult } = require('../trai_brain/mercury-bridge/llm-client');

      expect(extractClaudeCodeResult('[{"type":"result","result":"final"}]{"extra":"data"}'))
        .toBe('final');
    });
  });

  test('Mercury evidence posture stays locked to current config contract', () => {
    const prompt = baseMercuryConfig.agentic.systemPrompt.join('\n');

    expect(baseMercuryConfig.llm.temperature).toBe(0.8);
    expect(baseMercuryConfig.traceMemory.enabled).toBe(true);
    expect(baseMercuryConfig.traceMemory.collection).toBe('investigation_traces_guarded_v1');
    expect(baseMercuryConfig.traceMemory.captureMode).toBe('manual');
    expect(baseMercuryConfig.agentic.maxIterations).toBe(60);
    expect(baseMercuryConfig.agentic.maxTokens).toBe(7750);
    expect(prompt).toContain('You are Mercury, the adversarial verification gate');
    expect(prompt).toContain('Every concrete claim must be backed by file:line citations');
    expect(prompt).toContain('tool-handle citations like `【open_file†L1-L2】`');
    expect(prompt).toContain('Use the right tool for the evidence you need');
    expect(prompt).toContain('do not assume the current diff is the whole answer');
    expect(prompt).toContain('Use indexed RAG chunks as orientation and memory');
    expect(prompt).toContain('Use serena_blast_radius');
    expect(prompt).toContain('enumerate the plausible outcomes and mutable paths');
    expect(prompt).toContain('answer only with the surviving deterministic conclusion');
    expect(prompt).toContain('prove the full reachable control flow');
    expect(prompt).toContain('execute that exact call or sequence');
    expect(prompt).toContain('Do not claim tests pass or fail unless you have an actual test-run result');
    expect(prompt).toContain('If the user says "break my fix", attack the available evidence');
    expect(prompt).toContain('without assuming one file, diff, branch, memory entry, or prior path is sufficient');
    expect(prompt).toContain('Correctness outranks speed');
    expect(prompt).toContain('Do not stop at the first plausible finding');
    expect(prompt).toContain('say what additional evidence or iterations are needed');
    expect(prompt).toContain('say exactly what evidence is missing');
    expect(prompt).not.toContain('If yes, STOP CALLING TOOLS');
    expect(prompt).not.toContain('Budget: aim');
    expect(prompt).not.toContain('CONCRETE_BREAK_FOUND');
    expect(prompt).not.toContain('NO_CONCRETE_BREAK_FOUND');
    expect(prompt).not.toContain('Use git_diff target=current first');
    expect(prompt).not.toContain('follow it as your opening strategy');
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

  test('Mercury tool docs do not reintroduce current-diff-first cage guidance', () => {
    const toolDocs = createToolAdapter().buildToolDocs();

    expect(toolDocs).toContain('Inspect active, staged, working, or recent-commit changes when the review depends on what changed');
    expect(toolDocs).toContain('do not assume the current diff is the whole answer');
    expect(toolDocs).not.toContain('Use git_diff target=current first');
  });
});
