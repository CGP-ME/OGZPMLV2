'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SUBSCRIPTION_ENDPOINT = 'https://chatgpt.com/backend-api/codex';
const CODEX_LAUNCHER = '/usr/local/bin/codex';

function subscriptionEnv(source = process.env) {
  const env = { ...source };
  for (const key of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
  env.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  // HTTP SSE exposes the service response model; exec JSONL alone does not.
  env.RUST_LOG = 'codex_api::sse::responses=trace';
  return env;
}

function invoke(command, args, options) {
  return new Promise(resolve => {
    const { input, ...execOptions } = options;
    let inputError = null;
    const child = execFile(command, args, execOptions, (error, stdout, stderr) => resolve({ error: error || inputError, stdout, stderr }));
    if (input !== undefined) {
      child.stdin.on('error', error => { inputError = error; });
      child.stdin.end(input);
    }
  });
}

function parseCodexTapes(stdout, stderr, requestedModel) {
  const frames = [];
  const events = [];
  const parseErrors = [];
  for (const line of String(stdout).split('\n').filter(Boolean)) {
    try {
      const frame = JSON.parse(line);
      if (frame && typeof frame === 'object' && !Array.isArray(frame)) frames.push(frame);
      else parseErrors.push('invalid_exec_frame');
    } catch { parseErrors.push('invalid_exec_jsonl'); }
  }
  for (const line of String(stderr).split('\n')) {
    const offset = line.indexOf('SSE event: ');
    if (offset < 0) continue;
    const payload = line.slice(offset + 'SSE event: '.length);
    if (payload === '[DONE]') continue;
    try {
      const event = JSON.parse(payload);
      if (event && typeof event === 'object' && !Array.isArray(event)) events.push(event);
      else parseErrors.push('invalid_provider_event');
    } catch { parseErrors.push('invalid_provider_sse'); }
  }
  const observations = events.filter(event => event.response || event.type === 'response.completed').map(event => ({
    event: event.type, responseId: event.response?.id, model: event.response?.model || null,
  }));
  const completed = events.filter(event => event.type === 'response.completed');
  for (const event of completed) {
    if (!event.response || typeof event.response.model !== 'string') parseErrors.push('invalid_provider_completion');
  }
  const models = [...new Set(observations.map(item => item.model).filter(Boolean))];
  const identityVerified = completed.length > 0 && observations.every(item => item.model === requestedModel);
  const calls = events.filter(event => event.type === 'response.output_item.done'
    && ['function_call', 'custom_tool_call'].includes(event.item && event.item.type))
    .map(event => ({ id: event.item.call_id, name: event.item.name,
      arguments: event.item.arguments === undefined ? event.item.input : event.item.arguments,
      status: 'requested' }));
  const catalogs = events.filter(event => Array.isArray(event.response?.tools));
  const names = (tool, prefix = '') => {
    const pending = [{ tool, prefix }], found = [];
    while (pending.length) {
      const entry = pending.pop(), value = entry.tool;
      if (!value || typeof value !== 'object' || typeof value.name !== 'string') {
        parseErrors.push('invalid_provider_tool_catalog_entry');
      } else if (value.type !== 'namespace') {
        found.push(entry.prefix + value.name);
      } else if (!Array.isArray(value.tools)) {
        parseErrors.push('invalid_provider_tool_namespace');
      } else {
        for (let index = value.tools.length - 1; index >= 0; index -= 1) {
          pending.push({ tool: value.tools[index], prefix: entry.prefix + value.name + '.' });
        }
      }
    }
    return found;
  };
  const available = [...new Set(catalogs.flatMap(event => event.response.tools.flatMap(tool => names(tool))))];
  const tools = {
    enabled: true,
    available,
    availability_status: catalogs.length ? 'provider_response_catalog' : 'catalog_not_exposed_by_exec_stream',
    calls,
    total: calls.length,
    succeeded: null,
    failed: null,
    outcome_status: 'see_exec_events_and_raw_tapes',
    execution_events: frames.filter(frame => frame.item && frame.item.type !== 'agent_message'),
  };
  const answer = frames.filter(frame => frame.type === 'item.completed' && frame.item && frame.item.type === 'agent_message')
    .map(frame => frame.item.text).at(-1) || '';
  const complete = frames.some(frame => frame.type === 'turn.completed');
  return { frames, events, parseErrors, observations, models, completed, identityVerified, tools, answer, complete };
}

class CodexChallengerClient {
  constructor(options) {
    Object.assign(this, options);
    this.providerName = 'codex-subscription';
    this.requestCount = 0;
    this.invoke = options.invoke || invoke;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    const realpath = fs.realpathSync(CODEX_LAUNCHER);
    const packagePath = path.resolve(path.dirname(realpath), '../package.json');
    const packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const version = await this.invoke(CODEX_LAUNCHER, ['--version'], this.execOptions());
    const auth = await this.invoke(CODEX_LAUNCHER, ['login', 'status'], this.execOptions());
    this.executableTrust = {
      trusted: packageInfo.name === '@openai/codex' && !version.error
        && String(version.stdout).trim() === `codex-cli ${packageInfo.version}`,
      realpath, version: String(version.stdout).trim(), package: packageInfo.name,
    };
    this.authStatus = { authenticated: !auth.error && /Logged in using ChatGPT/.test(String(auth.stdout) + String(auth.stderr)), method: 'chatgpt_subscription' };
    this.initialization = { version, auth };
    this.initialized = true;
  }

  execOptions() {
    return { cwd: this.repoRoot, env: subscriptionEnv(), timeout: this.requestTimeoutMs,
      maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' };
  }

  async generateResponseWithMetadata(prompt) {
    await this.initialize();
    const started = Date.now();
    const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
      '--sandbox', 'read-only', '--json', '--model', this.model, '--cd', this.repoRoot,
      '-c', 'approval_policy="never"', '-c', 'forced_login_method="chatgpt"',
      '-c', 'model_provider="panel-subscription"',
      '-c', 'model_providers.panel-subscription.name="ChatGPT subscription"',
      '-c', `model_providers.panel-subscription.base_url="${SUBSCRIPTION_ENDPOINT}"`,
      '-c', 'model_providers.panel-subscription.wire_api="responses"',
      '-c', 'model_providers.panel-subscription.requires_openai_auth=true',
      '-c', 'model_providers.panel-subscription.supports_websockets=false',
      '-c', `developer_instructions=${JSON.stringify(this.systemPrompt.replace('You do not have repo tools in this review pass.',
        'Use the available tools for read-only evidence inspection in the supplied working directory; it is the selected source snapshot when a review ref is pinned. Do not substitute the parent checkout. Do not edit files, call other reviewers, or change runtime state.'))}`,
      '-'];
    const result = await this.invoke(CODEX_LAUNCHER, args, { ...this.execOptions(), input: prompt });
    this.requestCount += 1;
    const parsed = parseCodexTapes(result.stdout, result.stderr, this.model);
    const termination = result.error ? 'error' : (parsed.complete ? 'stop' : 'incomplete');
    const metadata = {
      provider: this.providerName, requestedModel: this.model,
      appliedModel: parsed.models.at(-1) || null, appliedModels: parsed.models,
      verdictModels: parsed.completed.map(event => event.response?.model ?? null),
      modelObservations: parsed.observations, modelTransitions: [],
      identityPosture: { status: parsed.identityVerified ? 'verified' : 'identity_conflict',
        authority: 'provider_response_sse', reason: parsed.identityVerified ? 'every_response_model_matches' : 'missing_or_mismatched_provider_model' },
      startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString(), latencyMs: Date.now() - started,
      exitCode: result.error ? result.error.code : 0, termination,
      stoppedBecause: result.error ? result.error.message : termination,
      providerError: result.error ? { name: result.error.name, message: result.error.message,
        code: result.error.code || null, signal: result.error.signal || null, killed: result.error.killed === true } : null,
      parseStatus: parsed.parseErrors.length ? 'parse_errors' : (parsed.complete ? 'complete' : 'incomplete'), parseErrors: parsed.parseErrors,
      initialization: this.initialization || null,
      usage: parsed.frames.findLast(frame => frame.type === 'turn.completed')?.usage || null,
      rawResponse: Buffer.from(result.stdout || ''), rawError: Buffer.from(result.stderr || ''),
      providerFrames: parsed.events, toolsAvailable: parsed.tools.available, tools: parsed.tools,
      providerErrors: parsed.frames.filter(frame => frame.type === 'error' || frame.type === 'turn.failed'),
      authStatus: this.authStatus, executableTrust: this.executableTrust,
      invocation: { executable: CODEX_LAUNCHER, args, subscriptionEndpoint: SUBSCRIPTION_ENDPOINT,
        configuredMaxTokens: this.maxTokens, outputTokenLimitEnforced: false },
    };
    // Preserve the answer and every diagnostic. Existing panel routing owns seat handling.
    return { answer: parsed.answer, metadata };
  }
}

module.exports = { CodexChallengerClient, parseCodexTapes, subscriptionEnv };
