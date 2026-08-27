'use strict';

const fs = require('fs');
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

const CLAUDE_SUBSCRIPTION_OVERRIDE_ENV = Object.freeze([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'LLM_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'ANTHROPIC_VERTEX_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_PROFILE',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'ANTHROPIC_FOUNDRY_RESOURCE',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'CLOUD_ML_REGION',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_CONFIG_DIR',
  'NODE_OPTIONS',
  'NODE_PATH',
]);

const TRUSTED_CLAUDE_LAUNCHERS = Object.freeze([
  '/usr/local/bin/claude',
  '/usr/bin/claude',
  '/opt/homebrew/bin/claude',
]);
const TRUSTED_CLAUDE_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

function buildClaudeSubscriptionEnv(sourceEnv = process.env) {
  const childEnv = { ...sourceEnv };
  for (const name of CLAUDE_SUBSCRIPTION_OVERRIDE_ENV) delete childEnv[name];
  for (const name of Object.keys(childEnv)) {
    if (/(^|_)MCP(_|$)/i.test(name)) delete childEnv[name];
  }
  childEnv.PATH = TRUSTED_CLAUDE_PATH;
  return childEnv;
}

function modeString(mode) {
  return (mode & 0o777).toString(8).padStart(4, '0');
}

function claudeExecutableTrustError(message, details = {}) {
  const error = new Error(message);
  error.code = 'CLAUDE_CODE_EXECUTABLE_UNTRUSTED';
  error.executableTrust = { trusted: false, ...details };
  return error;
}

function assertTrustedPathOwnership(filePath, { fsImpl = fs, requiredUid = 0 } = {}) {
  const checked = [];
  let current = path.resolve(filePath);
  while (true) {
    const stat = fsImpl.statSync(current);
    if (typeof stat.uid === 'number' && stat.uid !== requiredUid) {
      throw claudeExecutableTrustError(`Claude Code trust check rejected non-root-owned path: ${current}`, {
        failedCheck: 'root_owned', path: current, observedUid: stat.uid, requiredUid,
      });
    }
    if ((stat.mode & 0o022) !== 0) {
      throw claudeExecutableTrustError(`Claude Code trust check rejected group/world-writable path: ${current}`, {
        failedCheck: 'not_group_or_world_writable', path: current, mode: modeString(stat.mode),
      });
    }
    checked.push({ path: current, uid: typeof stat.uid === 'number' ? stat.uid : null, mode: modeString(stat.mode) });
    if (current === path.parse(current).root) break;
    current = path.dirname(current);
  }
  return checked;
}

function resolveTrustedClaudeExecutable({
  fsImpl = fs,
  candidates = TRUSTED_CLAUDE_LAUNCHERS,
  requiredUid = 0,
} = {}) {
  const launcherPath = candidates.find(candidate => fsImpl.existsSync(candidate));
  if (!launcherPath) {
    throw claudeExecutableTrustError('Trusted first-party Claude Code executable was not found in a rooted system installation', {
      failedCheck: 'rooted_system_launcher', checkedLaunchers: [...candidates],
    });
  }
  const launcherStat = fsImpl.lstatSync(launcherPath);
  if (typeof launcherStat.uid === 'number' && launcherStat.uid !== requiredUid) {
    throw claudeExecutableTrustError(`Claude Code trust check rejected non-root-owned launcher: ${launcherPath}`, {
      failedCheck: 'root_owned_launcher', launcherPath, observedUid: launcherStat.uid, requiredUid,
    });
  }
  const realpath = fsImpl.realpathSync(launcherPath);
  if (!/(^|\/)@anthropic-ai\/claude-code\/(?:bin\/claude(?:\.exe)?|cli\.js)$/.test(realpath.replace(/\\/g, '/'))) {
    throw claudeExecutableTrustError(`Claude Code trust check rejected non-Anthropic installation target: ${realpath}`, {
      failedCheck: 'anthropic_package_realpath', launcherPath, realpath,
    });
  }
  const targetStat = fsImpl.statSync(realpath);
  if (!targetStat.isFile() || (targetStat.mode & 0o111) === 0) {
    throw claudeExecutableTrustError(`Claude Code trust check rejected non-executable target: ${realpath}`, {
      failedCheck: 'executable_regular_file', launcherPath, realpath, mode: modeString(targetStat.mode),
    });
  }
  const checkedPaths = assertTrustedPathOwnership(realpath, { fsImpl, requiredUid });
  assertTrustedPathOwnership(path.dirname(launcherPath), { fsImpl, requiredUid });
  return {
    trusted: true,
    launcherPath,
    realpath,
    ownerUid: typeof targetStat.uid === 'number' ? targetStat.uid : null,
    mode: modeString(targetStat.mode),
    version: null,
    checks: ['rooted_system_launcher', 'anthropic_package_realpath', 'root_owned', 'not_group_or_world_writable'],
    checkedPaths: checkedPaths.map(entry => entry.path),
  };
}

function parseClaudeCodeVersion(stdout) {
  const value = Buffer.isBuffer(stdout) ? stdout.toString('utf8').trim() : String(stdout || '').trim();
  const match = value.match(/^(\d+\.\d+\.\d+) \(Claude Code\)$/);
  if (!match) throw new Error('Claude Code executable returned an untrusted version signature');
  return match[1];
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

function parseClaudeCodeFrames(stdout) {
  const text = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || '');
  const frames = [];
  for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    for (const candidate of splitJsonValuesFromLine(line)) {
      try {
        frames.push(...normalizeClaudeCodeFrames(JSON.parse(candidate)));
      } catch (error) {
        // Parse status is reported by the caller; retain every valid provider frame.
      }
    }
  }
  if (frames.length === 0) {
    try {
      frames.push(...normalizeClaudeCodeFrames(JSON.parse(text)));
    } catch (error) {
      // The caller will fail loudly when no provider identity/result frame exists.
    }
  }
  return frames;
}

function extractClaudeCodeAppliedModel(frames) {
  const reported = [];
  for (const frame of frames) {
    if (frame && frame.type === 'system' && frame.subtype === 'init' && typeof frame.model === 'string') {
      reported.push(frame.model);
    }
    if (frame && frame.message && typeof frame.message.model === 'string') reported.push(frame.message.model);
    if (frame && frame.event && frame.event.message && typeof frame.event.message.model === 'string') {
      reported.push(frame.event.message.model);
    }
    if (frame && frame.modelUsage && typeof frame.modelUsage === 'object') {
      reported.push(...Object.keys(frame.modelUsage));
    }
  }
  return reported.find(value => value && value !== '<synthetic>') || null;
}

function claudeAppliedModelMatchesAlias(requestedModel, appliedModel) {
  const requested = String(requestedModel || '').toLowerCase();
  const applied = String(appliedModel || '').toLowerCase();
  if (!['fable', 'opus'].includes(requested)) return false;
  return new RegExp(`(^|[-_.])${requested}($|[-_.])`).test(applied);
}

class ClaudeCodeIncompleteResponseError extends Error {
  constructor(subconditions, providerMetadata) {
    const conditions = Array.isArray(subconditions) ? subconditions : [subconditions];
    super(`Claude Code response was incomplete: ${conditions.join(',')}`);
    this.name = 'ClaudeCodeIncompleteResponseError';
    this.code = 'CLAUDE_CODE_INCOMPLETE_RESPONSE';
    this.subcondition = conditions[0];
    this.subconditions = conditions;
    this.providerMetadata = providerMetadata;
  }
}

function parseClaudeAuthStatus(stdout) {
  let status;
  try {
    status = JSON.parse(Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout || ''));
  } catch (error) {
    throw new Error('Claude auth status returned malformed JSON');
  }
  if (
    status.loggedIn !== true
    || status.authMethod !== 'claude.ai'
    || status.apiProvider !== 'firstParty'
    || typeof status.subscriptionType !== 'string'
    || status.subscriptionType.trim() === ''
  ) {
    throw new Error('Claude auth status is not a first-party claude.ai subscription');
  }
  return {
    loggedIn: true,
    authMethod: status.authMethod,
    apiProvider: status.apiProvider,
    subscriptionType: status.subscriptionType,
  };
}

class ClaudeCodeConsensusClient {
  constructor(clientOptions) {
    this.providerName = clientOptions.provider;
    this.model = clientOptions.model;
    this.permissionMode = clientOptions.permissionMode;
    this.maxTokens = clientOptions.maxTokens;
    this.minimumTokens = clientOptions.minimumTokens;
    this.temperature = clientOptions.temperature;
    this.requestTimeoutMs = clientOptions.requestTimeoutMs;
    this.systemPrompt = clientOptions.systemPrompt;
    this.execFileAsync = clientOptions.execFileAsync || execFileAsync;
    this.resolveExecutable = clientOptions.resolveExecutable || resolveTrustedClaudeExecutable;
    this.requestCount = 0;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const startedAt = new Date();
    const startedMs = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    try {
      this.executableTrust = this.resolveExecutable();
      const versionResult = await this.execFileAsync(this.executableTrust.realpath, ['--version'], {
        cwd: config.REPO_ROOT,
        env: buildClaudeSubscriptionEnv(),
        timeout: this.requestTimeoutMs,
        maxBuffer: 1024 * 1024,
        encoding: null,
      });
      this.executableTrust.version = parseClaudeCodeVersion(versionResult.stdout);
    } catch (error) {
      if (this.executableTrust && !this.executableTrust.version) {
        this.executableTrust = {
          ...this.executableTrust,
          trusted: false,
          failedCheck: 'version_signature',
        };
      }
      error.providerMetadata = {
        provider: this.providerName,
        requestedModel: this.model,
        appliedModel: null,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedMs,
        exitCode: error.code == null ? null : error.code,
        termination: 'executable_trust_check_failed',
        parseStatus: 'not_started',
        rawResponse: Buffer.alloc(0),
        rawError: Buffer.alloc(0),
        providerFrames: [],
        toolsAvailable: [],
        executableTrust: error.executableTrust || this.executableTrust || null,
      };
      throw error;
    }
    try {
      const result = await this.execFileAsync(this.executableTrust.realpath, ['auth', 'status', '--json'], {
        cwd: config.REPO_ROOT,
        env: buildClaudeSubscriptionEnv(),
        timeout: this.requestTimeoutMs,
        maxBuffer: 1024 * 1024,
        encoding: null,
      });
      stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '');
      stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr || '');
    } catch (error) {
      stdout = Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.from(error.stdout || '');
      stderr = Buffer.isBuffer(error.stderr) ? error.stderr : Buffer.from(error.stderr || '');
      error.providerMetadata = {
        provider: this.providerName,
        requestedModel: this.model,
        appliedModel: null,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedMs,
        exitCode: error.code == null ? null : error.code,
        termination: 'auth_check_failed',
        parseStatus: 'request_failed',
        rawResponse: stdout,
        rawError: stderr,
        providerFrames: [],
        toolsAvailable: [],
        executableTrust: this.executableTrust,
      };
      throw error;
    }
    try {
      this.authStatus = parseClaudeAuthStatus(stdout);
    } catch (error) {
      error.providerMetadata = {
        provider: this.providerName,
        requestedModel: this.model,
        appliedModel: null,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedMs,
        exitCode: 0,
        termination: 'auth_check_failed',
        parseStatus: 'invalid_auth_status',
        rawResponse: stdout,
        rawError: stderr,
        providerFrames: [],
        toolsAvailable: [],
        executableTrust: this.executableTrust,
      };
      throw error;
    }
    this.initialized = true;
  }

  async generateResponse(prompt) {
    await this.initialize();
    return this.runClaudeCode(prompt, this.systemPrompt);
  }

  async generateResponseWithMetadata(prompt) {
    await this.initialize();
    return this.runClaudeCodeWithMetadata(prompt, this.systemPrompt);
  }

  async runClaudeCode(prompt, systemPrompt) {
    const result = await this.runClaudeCodeWithMetadata(prompt, systemPrompt);
    return result.answer;
  }

  async runClaudeCodeWithMetadata(prompt, systemPrompt) {
    const args = [
      '-p',
      '--model', this.model,
      '--permission-mode', this.permissionMode,
      '--output-format', 'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--disable-slash-commands',
      '--tools', '',
      '--strict-mcp-config',
      '--system-prompt', systemPrompt,
      prompt,
    ];
    const startedAt = new Date();
    const startedMs = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    try {
      const result = await this.execFileAsync(this.executableTrust.realpath, args, {
        cwd: config.REPO_ROOT,
        env: buildClaudeSubscriptionEnv(),
        timeout: this.requestTimeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        encoding: null,
      });
      stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '');
      stderr = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr || '');
    } catch (error) {
      stdout = Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.from(error.stdout || '');
      stderr = Buffer.isBuffer(error.stderr) ? error.stderr : Buffer.from(error.stderr || '');
      error.providerMetadata = this.buildMetadata({ startedAt, startedMs, stdout, stderr, exitCode: error.code });
      throw error;
    }
    const metadata = this.buildMetadata({ startedAt, startedMs, stdout, stderr, exitCode: 0 });
    if (!metadata.appliedModel) {
      const error = new Error('Claude Code response omitted applied model identity');
      error.providerMetadata = metadata;
      throw error;
    }
    if (!claudeAppliedModelMatchesAlias(this.model, metadata.appliedModel)) {
      const error = new Error('Claude Code applied model does not match the requested challenger alias');
      error.providerMetadata = metadata;
      throw error;
    }
    const answer = extractClaudeCodeResult(stdout);
    const incompleteSubconditions = [];
    if (!answer) incompleteSubconditions.push('empty_answer');
    if (!metadata.termination) incompleteSubconditions.push('missing_termination');
    if (metadata.termination === 'provider_error') incompleteSubconditions.push('provider_error_termination');
    if (metadata.toolsAvailable.length > 0) incompleteSubconditions.push('unexpected_exposed_tools');
    if (incompleteSubconditions.length > 0) {
      throw new ClaudeCodeIncompleteResponseError(incompleteSubconditions, metadata);
    }
    this.requestCount += 1;
    return { answer, metadata };
  }

  buildMetadata({ startedAt, startedMs, stdout, stderr, exitCode }) {
    const frames = parseClaudeCodeFrames(stdout);
    const resultFrame = [...frames].reverse().find(frame => frame && frame.type === 'result');
    const initFrame = frames.find(frame => frame && frame.type === 'system' && frame.subtype === 'init');
    return {
      provider: this.providerName,
      requestedModel: this.model,
      appliedModel: extractClaudeCodeAppliedModel(frames),
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedMs,
      exitCode,
      termination: resultFrame
        ? (resultFrame.is_error === true ? 'provider_error' : resultFrame.subtype || 'result')
        : null,
      parseStatus: frames.length > 0 ? (resultFrame ? 'parsed' : 'missing_result_frame') : 'invalid_frames',
      rawResponse: stdout,
      rawError: stderr,
      providerFrames: frames,
      toolsAvailable: initFrame && Array.isArray(initFrame.tools) ? initFrame.tools : [],
      authStatus: this.authStatus,
      executableTrust: this.executableTrust,
    };
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
    skipWarmup: true,
  };
}

function resolveConsensusLlmClientOptions({
  systemPrompt = config.CONSENSUS_SYSTEM_PROMPT,
  model = config.CONSENSUS_MODEL,
  execFileAsync: execOverride,
} = {}) {
  if (typeof systemPrompt !== 'string' || systemPrompt.trim() === '') {
    throw new Error('Consensus LLM systemPrompt must be supplied from mercury.config.json');
  }

  return {
    provider: config.CONSENSUS_PROVIDER,
    baseUrl: '',
    model,
    apiKey: '',
    authRequired: false,
    permissionMode: config.CONSENSUS_PERMISSION_MODE,
    maxTokens: config.CONSENSUS_CLIENT_MAX_TOKENS,
    minimumTokens: config.CONSENSUS_CLIENT_MIN_TOKENS,
    temperature: config.CONSENSUS_TEMPERATURE,
    requestTimeoutMs: config.CONSENSUS_REQUEST_TIMEOUT_MS,
    openaiExtraBody: config.CONSENSUS_OPENAI_EXTRA_BODY,
    systemPrompt,
    execFileAsync: execOverride,
  };
}

function resolveKimiTieBreakerClientOptions({ systemPrompt = config.CONSENSUS_SYSTEM_PROMPT } = {}) {
  const apiKey = process.env[config.TIE_BREAKER_API_KEY_ENV];
  if (!apiKey) throw new Error(`Configured Kimi tie-breaker key env is missing: ${config.TIE_BREAKER_API_KEY_ENV}`);
  return {
    provider: config.TIE_BREAKER_PROVIDER,
    baseUrl: config.TIE_BREAKER_BASE_URL,
    model: config.TIE_BREAKER_MODEL,
    apiKey,
    authRequired: true,
    maxTokens: config.TIE_BREAKER_CLIENT_MAX_TOKENS,
    minimumTokens: config.TIE_BREAKER_CLIENT_MIN_TOKENS,
    temperature: config.TIE_BREAKER_TEMPERATURE,
    requestTimeoutMs: config.TIE_BREAKER_REQUEST_TIMEOUT_MS,
    openaiExtraBody: config.TIE_BREAKER_OPENAI_EXTRA_BODY,
    systemPrompt,
    skipWarmup: true,
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

function createClaudeChallengerClient({ systemPrompt = config.CONSENSUS_SYSTEM_PROMPT, model, execFileAsync: execOverride } = {}) {
  return new ClaudeCodeConsensusClient(resolveConsensusLlmClientOptions({ systemPrompt, model, execFileAsync: execOverride }));
}

function createFableChallengerClient(options = {}) {
  return createClaudeChallengerClient({ ...options, model: config.CONSENSUS_MODEL });
}

function createOpusChallengerClient(options = {}) {
  return createClaudeChallengerClient({ ...options, model: config.CONSENSUS_EMERGENCY_MODEL });
}

function createKimiTieBreakerClient({ systemPrompt = config.CONSENSUS_SYSTEM_PROMPT } = {}) {
  const clientOptions = resolveKimiTieBreakerClientOptions({ systemPrompt });
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

function createConsensusLlmClient(options = {}) {
  return createFableChallengerClient(options);
}

module.exports = {
  extractClaudeCodeResult,
  parseClaudeCodeFrames,
  extractClaudeCodeAppliedModel,
  claudeAppliedModelMatchesAlias,
  ClaudeCodeIncompleteResponseError,
  parseClaudeAuthStatus,
  parseClaudeCodeVersion,
  buildClaudeSubscriptionEnv,
  CLAUDE_SUBSCRIPTION_OVERRIDE_ENV,
  TRUSTED_CLAUDE_LAUNCHERS,
  TRUSTED_CLAUDE_PATH,
  assertTrustedPathOwnership,
  resolveTrustedClaudeExecutable,
  ClaudeCodeConsensusClient,
  resolveMercuryLlmClientOptions,
  createMercuryLlmClient,
  resolveConsensusLlmClientOptions,
  createConsensusLlmClient,
  resolveKimiTieBreakerClientOptions,
  createFableChallengerClient,
  createOpusChallengerClient,
  createKimiTieBreakerClient,
};
