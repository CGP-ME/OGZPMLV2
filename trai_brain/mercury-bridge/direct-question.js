#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const config = require('./config');
const { createDirectModelClient } = require('./llm-client');
const { accountProviderAttempt } = require('./cost-accounting');
const { createToolAdapter } = require('./tool-adapter');
const {
  callMercuryWithRetry,
  stringifyToolResultForHistory,
  summarizeToolTelemetry,
} = require('./react-loop');
const { responseStopReason } = require('../../core/persistent_llm_client');
const {
  buildDirectQuestionLedgerEntry,
  buildPromptProvenance,
  createRawRunId,
  redactSensitiveText,
  writeRawProviderOutput,
  writeRunLedgerEntry,
} = require('./run-ledger');

function parseArgs(argv) {
  const args = {
    mode: 'direct',
    provider: null,
    promptFile: null,
    contextFiles: [],
    maxTokens: null,
    maxIterations: null,
    quiet: false,
    help: false,
    prompt: '',
  };
  const positional = [];
  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--quiet') args.quiet = true;
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length).trim().toLowerCase();
    else if (arg.startsWith('--provider=')) args.provider = arg.slice('--provider='.length).trim().toLowerCase();
    else if (arg.startsWith('--prompt-file=')) args.promptFile = arg.slice('--prompt-file='.length).trim();
    else if (arg.startsWith('--context-file=')) args.contextFiles.push(arg.slice('--context-file='.length).trim());
    else if (arg.startsWith('--max-tokens=')) {
      const raw = arg.slice('--max-tokens='.length);
      if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error('--max-tokens must be a positive integer');
      args.maxTokens = Number(raw);
    } else if (arg.startsWith('--max-iterations=')) {
      const raw = arg.slice('--max-iterations='.length);
      if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error('--max-iterations must be a positive integer');
      args.maxIterations = Number(raw);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown direct-question flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  args.prompt = positional.join(' ').trim();
  if (args.mode !== 'direct') throw new Error('direct-question.js supports only --mode=direct');
  if (!args.help && !args.provider) {
    throw new Error(`--provider is required; choose from ${config.listDirectQuestionProviders().join(', ')}`);
  }
  if (args.promptFile && args.prompt) throw new Error('Use either --prompt-file or a positional prompt, not both');
  if (!args.help && !args.promptFile && !args.prompt) throw new Error('A direct question or --prompt-file is required');
  return args;
}

function readRepoInputFile(fileValue, label, repoRoot) {
  const rootReal = fs.realpathSync(repoRoot);
  const absolute = fs.realpathSync(path.resolve(repoRoot, fileValue));
  const relative = path.relative(rootReal, absolute).replace(/\\/g, '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`${label} must resolve inside the repository`);
  }
  if (path.basename(relative).toLowerCase().startsWith('.env')) {
    throw new Error(`${label} cannot be an environment file`);
  }
  const content = fs.readFileSync(absolute, 'utf8');
  if (!content.trim()) throw new Error(`${label} is empty: ${relative}`);
  return {
    content,
    path: relative,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: Buffer.byteLength(content, 'utf8'),
  };
}

function readPromptInput(args, repoRoot = config.REPO_ROOT) {
  let question = args.prompt;
  let promptSource = { type: 'argv' };
  if (args.promptFile) {
    const source = readRepoInputFile(args.promptFile, '--prompt-file', repoRoot);
    question = source.content;
    promptSource = { type: 'file', path: source.path, sha256: source.sha256, bytes: source.bytes };
  }
  const contextSources = (args.contextFiles || []).map((fileValue) => {
    const source = readRepoInputFile(fileValue, '--context-file', repoRoot);
    return { type: 'file', path: source.path, sha256: source.sha256, bytes: source.bytes, content: source.content };
  });
  const contextBlock = contextSources.length === 0 ? '' : [
    '',
    'AUTHORIZED CONTEXT FILES (explicitly supplied by Trey; verify their claims against current code):',
    ...contextSources.flatMap((source, index) => [
      '',
      `--- CONTEXT ${index + 1}: ${path.basename(source.path)} ---`,
      source.content,
    ]),
  ].join('\n');
  return {
    prompt: `${question}${contextBlock}`,
    promptSource,
    contextSources: contextSources.map(({ content, ...receipt }) => receipt),
  };
}

function directAttemptReceipt({
  selected,
  metadata = {},
  status,
  error = null,
  rawOutput = null,
  prompt,
  attemptNumber = 1,
  retry = 0,
  toolsAvailable = [],
} = {}) {
  const accounting = accountProviderAttempt(metadata, {
    provider: selected.id,
    model: selected.model,
    pricing: selected.pricing,
  });
  return {
    attempt: attemptNumber,
    retry,
    mode: 'direct',
    status,
    selected_provider: selected.id,
    requested_provider: selected.transportProvider,
    requested_model: selected.model,
    applied_model: metadata.appliedModel || null,
    started_at: metadata.startedAt || null,
    finished_at: metadata.finishedAt || null,
    latency_ms: metadata.latencyMs == null ? null : metadata.latencyMs,
    status_code: metadata.statusCode == null ? null : metadata.statusCode,
    termination: metadata.termination || (error ? 'error' : null),
    stopped_because: redactSensitiveText(
      metadata.stoppedBecause && metadata.stoppedBecause !== 'provider_stop_reason_absent'
        ? metadata.stoppedBecause
        : responseStopReason({
          termination: metadata.termination,
          statusCode: metadata.statusCode,
          maxTokens: selected.maxTokens,
          providerError: error && error.message,
        })
    ),
    parse_status: metadata.parseStatus || null,
    input_provenance: buildPromptProvenance(prompt),
    tokens: accounting.tokens,
    usage_absence: accounting.usage_absence,
    cost: accounting.cost,
    cost_absence: accounting.cost_absence,
    tools: {
      enabled: toolsAvailable.length > 0,
      available: toolsAvailable,
      calls: [],
      total: 0,
      succeeded: 0,
      failed: 0,
    },
    raw_output: rawOutput,
    error: error ? {
      name: error.name || 'Error',
      message: redactSensitiveText(error.message || String(error)),
    } : null,
  };
}

function createDirectProviderAudit({ selected, prompt, repoRoot, rawRunId, writeRaw, toolsAvailable }) {
  return {
    attempts: [],
    lastMetadata: null,
    record(metadata = {}, context = {}) {
      this.lastMetadata = metadata;
      const attemptNumber = this.attempts.length + 1;
      const rawOutput = writeRaw({
        repoRoot,
        runId: rawRunId,
        stage: `direct-${selected.id}`,
        attempt: attemptNumber,
        bytes: metadata.rawResponse || Buffer.alloc(0),
        now: metadata.startedAt ? new Date(metadata.startedAt) : new Date(),
      });
      return directAttemptReceipt({
        selected,
        metadata,
        status: context.status,
        error: context.error ? new Error(context.error) : null,
        rawOutput,
        prompt,
        attemptNumber,
        retry: context.retry || 0,
        toolsAvailable,
      });
    },
  };
}

function directToolSchema(toolAdapter) {
  const excluded = new Set(['get_chunk', 'run_check']);
  return toolAdapter.buildToolSchema().filter(tool => (
    tool && tool.function && !excluded.has(tool.function.name)
  ));
}

async function runDirectToolLoop({
  client,
  toolAdapter,
  prompt,
  systemPrompt,
  maxIterations = null,
  decisionSteerIteration,
  maxTokens,
  providerAudit,
  verbose = false,
} = {}) {
  const tools = directToolSchema(toolAdapter);
  const toolsAvailable = tools.map(tool => tool.function.name).sort();
  const toolInstruction = [
    'Read-only repository tools are available for this direct question.',
    'Use them whenever the question requires current repository evidence; do not claim a file was read or a path was traced unless a tool result in this run supports it.',
    'Do not modify the repository. Do not seek, open, or infer another model\'s answer.',
    'Return your own final answer when your investigation is complete.',
  ].join('\n');
  const dispatchedSystemPrompt = `${systemPrompt}\n\n${toolInstruction}`;
  const messages = [
    { role: 'system', content: dispatchedSystemPrompt },
    { role: 'user', content: prompt },
  ];
  const history = [];
  let decisionSteerSentAt = null;

  for (let iteration = 1; maxIterations == null || iteration <= maxIterations; iteration += 1) {
    if (verbose) {
      const iterationScope = maxIterations == null ? `${iteration}` : `${iteration}/${maxIterations}`;
      console.error(`[DIRECT] Iteration ${iterationScope}`);
    }
    const assistantMessage = await callMercuryWithRetry(
      client,
      messages,
      tools,
      { maxTokens, toolChoice: 'auto', temperature: client.temperature },
      verbose,
      providerAudit
    );
    const toolCalls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];
    if (toolCalls.length === 0) {
      const answer = typeof assistantMessage.content === 'string' ? assistantMessage.content.trim() : '';
      return {
        answer,
        termination: 'answer_given',
        iterations: iteration,
        history,
        toolTelemetry: summarizeToolTelemetry(history),
        toolsAvailable,
        systemPrompt: dispatchedSystemPrompt,
        iterationLimit: maxIterations,
        decisionSteerIteration,
        decisionSteerSentAt,
      };
    }

    messages.push(assistantMessage);
    for (const toolCall of toolCalls) {
      const toolName = toolCall && toolCall.function && toolCall.function.name;
      let toolArgs;
      let toolResult;
      try {
        if (!toolsAvailable.includes(toolName)) {
          throw new Error(`Tool is unavailable in direct read-only mode: ${toolName || '<missing>'}`);
        }
        const rawArgs = toolCall && toolCall.function ? toolCall.function.arguments : null;
        toolArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});
        toolResult = await toolAdapter.execute(toolName, toolArgs);
      } catch (error) {
        toolArgs = toolArgs || null;
        toolResult = { error: error.message || String(error) };
      }
      history.push({
        iteration,
        toolName,
        toolArgs,
        toolResult,
        toolCallId: toolCall.id,
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: stringifyToolResultForHistory(toolResult),
      });
    }
    if (decisionSteerSentAt == null && iteration === decisionSteerIteration) {
      messages.push({
        role: 'user',
        content: [
          `You have completed ${iteration} investigation iterations.`,
          'If materially relevant paths remain unread, continue investigating them.',
          'Otherwise stop calling tools and deliver the final answer from the evidence gathered.',
          'Thoroughness is measured by relevant coverage and instruction-following, not by tool-call count alone.',
        ].join(' '),
      });
      decisionSteerSentAt = iteration;
    }
  }

  return {
    answer: null,
    termination: 'max_iterations',
    iterations: maxIterations,
    history,
    toolTelemetry: summarizeToolTelemetry(history),
    toolsAvailable,
    systemPrompt: dispatchedSystemPrompt,
    iterationLimit: maxIterations,
    decisionSteerIteration,
    decisionSteerSentAt,
  };
}

async function executeDirectQuestion({
  providerId,
  prompt,
  promptSource = null,
  contextSources = [],
  maxTokens = null,
  maxIterations = null,
  verbose = false,
  repoRoot = config.REPO_ROOT,
  selected = config.resolveDirectQuestionProvider(providerId),
  createClient = () => createDirectModelClient(providerId),
  toolAdapter = null,
  runLoop = runDirectToolLoop,
  now = () => new Date(),
  writeRaw = writeRawProviderOutput,
  writeLedger = writeRunLedgerEntry,
} = {}) {
  if (typeof prompt !== 'string' || prompt.trim() === '') throw new Error('A non-empty direct question is required');
  const requestedMaxTokens = maxTokens == null ? selected.maxTokens : maxTokens;
  if (!Number.isInteger(requestedMaxTokens) || requestedMaxTokens < 1 || requestedMaxTokens > selected.maxTokens) {
    throw new Error(`--max-tokens must be between 1 and the configured direct limit ${selected.maxTokens}`);
  }
  const requestedMaxIterations = maxIterations;
  if (requestedMaxIterations != null
      && (!Number.isInteger(requestedMaxIterations) || requestedMaxIterations < 1)) {
    throw new Error('--max-iterations must be a positive integer');
  }
  const startedAt = now();
  const rawRunId = createRawRunId(startedAt);
  const directTools = toolAdapter || createToolAdapter({ repoRoot });
  const toolsAvailable = directToolSchema(directTools).map(tool => tool.function.name).sort();
  const providerAudit = createDirectProviderAudit({
    selected, prompt, repoRoot, rawRunId, writeRaw, toolsAvailable,
  });
  let client = null;
  let loopResult = null;
  try {
    client = createClient();
    await client.initialize();
    loopResult = await runLoop({
      client,
      toolAdapter: directTools,
      prompt,
      systemPrompt: selected.systemPrompt,
      maxIterations: requestedMaxIterations,
      decisionSteerIteration: selected.decisionSteerIteration,
      maxTokens: requestedMaxTokens,
      providerAudit,
      verbose,
    });
    if (loopResult.termination !== 'answer_given' || !String(loopResult.answer || '').trim()) {
      const incomplete = new Error(`Direct model did not produce a final answer: ${loopResult.termination}`);
      incomplete.directLoopResult = loopResult;
      throw incomplete;
    }
    const metadata = providerAudit.lastMetadata || {};
    const entry = buildDirectQuestionLedgerEntry({
      repoRoot,
      prompt,
      promptSource,
      contextSources,
      systemPrompt: loopResult.systemPrompt,
      providerId: selected.id,
      transportProvider: selected.transportProvider,
      requestedModel: selected.model,
      attempts: providerAudit.attempts,
      answer: loopResult.answer,
      metadata,
      toolTelemetry: loopResult.toolTelemetry,
      toolsAvailable: loopResult.toolsAvailable,
      iterations: loopResult.iterations,
      iterationLimit: loopResult.iterationLimit,
      decisionSteerIteration: loopResult.decisionSteerIteration,
      decisionSteerSentAt: loopResult.decisionSteerSentAt,
      termination: loopResult.termination,
      startedAt,
      finishedAt: now(),
    });
    const runLedger = writeLedger({ repoRoot, entry, now: new Date(entry.created_at) });
    return {
      answer: loopResult.answer,
      metadata,
      attempts: providerAudit.attempts,
      attempt: providerAudit.attempts.at(-1),
      entry,
      runLedger,
      selected,
      loopResult,
    };
  } catch (error) {
    loopResult = error.directLoopResult || loopResult;
    const metadata = error.providerMetadata || providerAudit.lastMetadata || {
      provider: client && client.providerName || selected.transportProvider,
      requestedModel: client && client.model || selected.model,
      startedAt: startedAt.toISOString(),
      finishedAt: now().toISOString(),
      termination: 'error',
      parseStatus: 'request_failed',
    };
    if (providerAudit.attempts.length === 0) {
      providerAudit.attempts.push(providerAudit.record(metadata, {
        status: 'failed', retry: 0, error: error.message,
      }));
    }
    const ledgerSystemPrompt = loopResult && loopResult.systemPrompt
      ? loopResult.systemPrompt
      : selected.systemPrompt;
    const entry = buildDirectQuestionLedgerEntry({
      repoRoot,
      prompt,
      promptSource,
      contextSources,
      systemPrompt: ledgerSystemPrompt,
      providerId: selected.id,
      transportProvider: selected.transportProvider,
      requestedModel: selected.model,
      attempts: providerAudit.attempts,
      metadata,
      toolTelemetry: loopResult && loopResult.toolTelemetry || {},
      toolsAvailable: loopResult && loopResult.toolsAvailable || toolsAvailable,
      iterations: loopResult && loopResult.iterations || null,
      iterationLimit: loopResult ? loopResult.iterationLimit : requestedMaxIterations,
      decisionSteerIteration: loopResult
        ? loopResult.decisionSteerIteration
        : selected.decisionSteerIteration,
      decisionSteerSentAt: loopResult && loopResult.decisionSteerSentAt || null,
      termination: loopResult && loopResult.termination || 'error',
      startedAt,
      finishedAt: now(),
      error,
    });
    error.directQuestionLedger = writeLedger({ repoRoot, entry, now: new Date(entry.created_at) });
    error.directQuestionAttempts = providerAudit.attempts;
    throw error;
  }
}

function printHelp() {
  console.log('Direct model question mode (no adversarial protocol)');
  console.log('Usage: node trai_brain/mercury-bridge/direct-question.js --provider=kimi|deepseek|glm "question"');
  console.log('       node trai_brain/mercury-bridge/direct-question.js --provider=glm --prompt-file=path/to/prompt.md --context-file=path/to/evidence.md');
  console.log('Options: --mode=direct --context-file=PATH (repeatable) --max-tokens=N --max-iterations=N (optional operator limit) --quiet');
}

function formatCost(cost) {
  if (!cost || !Number.isFinite(cost.amount)) return 'unavailable';
  return `${cost.amount.toFixed(9)} ${cost.currency}`;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    if (args.help) {
      printHelp();
      return;
    }
    const input = readPromptInput(args);
    const result = await executeDirectQuestion({
      providerId: args.provider,
      prompt: input.prompt,
      promptSource: input.promptSource,
      contextSources: input.contextSources,
      maxTokens: args.maxTokens,
      maxIterations: args.maxIterations,
      verbose: !args.quiet,
    });
    console.log('');
    console.log('═══ DIRECT MODEL ANSWER ═══');
    console.log(`mode:            direct`);
    console.log(`provider:        ${result.selected.id}`);
    console.log(`transport:       ${result.selected.transportProvider}`);
    console.log(`requested model: ${result.selected.model}`);
    console.log(`applied model:   ${result.metadata.appliedModel || 'not reported'}`);
    console.log(`termination:     ${result.metadata.stoppedBecause || result.metadata.termination || 'not reported'}`);
    console.log(`iterations:      ${result.loopResult.iterations}`);
    console.log(`tool calls:      ${result.loopResult.toolTelemetry.total || 0}`);
    console.log(`tokens:          ${JSON.stringify(result.attempt.tokens)}`);
    console.log(`cost:            ${formatCost(result.attempt.cost)}`);
    console.log(`run ledger:      ${result.runLedger.citation}`);
    console.log('');
    console.log(result.answer);
  } catch (error) {
    console.error('');
    console.error('═══ DIRECT MODEL CALL FAILED ═══');
    console.error(redactSensitiveText(error.message || String(error)));
    if (error.directQuestionLedger) console.error(`run ledger: ${error.directQuestionLedger.citation}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  readPromptInput,
  directAttemptReceipt,
  createDirectProviderAudit,
  directToolSchema,
  runDirectToolLoop,
  executeDirectQuestion,
  formatCost,
};
