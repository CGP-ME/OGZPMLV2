/**
 * mercury-bridge Layer 4 — Native Tool Calling ReAct Loop
 *
 * Uses Mercury-2's native OpenAI-compatible tool calling via the `tools`
 * parameter on /v1/chat/completions. Mercury returns structured tool_calls
 * in the assistant message instead of generated text we have to parse.
 *
 * Flow per iteration:
 *   1. Send messages array + tools schema to client.generateWithTools()
 *   2. Receive assistant message with either tool_calls or content
 *   3. If tool_calls: execute each, append results as role:tool messages, loop
 *   4. If content: return as final answer
 *
 * Retry wrapper handles HTTP 429/502/503/504 and empty responses per
 * Inception Labs API guidance on handling transient failures.
 *
 * Rewritten 2026-04-08 to use native tool calling instead of text parsing.
 * Replaces: fenced tool_call parsing, bare-JSON fallback parser, example-
 * driven prompt format, text-based history serialization.
 */

'use strict';

const config = require('./config');

const REPO_FILE_PATH_PATTERN = '[^`<>"\\n\\r:]*\\.[A-Za-z0-9][A-Za-z0-9._-]*';
const FILE_LINE_CITATION_PATTERN = new RegExp(String.raw`\b${REPO_FILE_PATH_PATTERN}:\d+(?:[-‑–—]\d+)?\b`);
const RUN_CHECK_ARTIFACT_CITATION_PATTERN = /\bogz-meta\/cognition-history\/mercury-execution\/[\w./-]+\.log:\d+(?:[-‑–—]\d+)?\b/;
const MAX_TOOL_ARGUMENT_HISTORY_CHARS = 2000;
const MAX_TOOL_RESULT_HISTORY_CHARS = 12000;

function hasFileLineCitation(content) {
  return FILE_LINE_CITATION_PATTERN.test(content || '');
}

function hasToolHandleCitation(content) {
  return /【[^】]+†L\d+(?:[-‑–—]L?\d+)?】/.test(content || '');
}

function hasUnsupportedRunCheckClaim(content) {
  const answer = String(content || '');
  const claimsRunCheckResult = /\brun_check\b[\s\S]{0,160}\b(?:result|artifact|command|stdout|stderr|exit_code|exit code|timed_out|timed out|passed|failed|green|red|proves?|proved|evidence)\b/i.test(answer)
    || /\b(?:result|artifact|command|stdout|stderr|exit_code|exit code|timed_out|timed out|passed|failed|green|red|proves?|proved|evidence)\b[\s\S]{0,160}\brun_check\b/i.test(answer);
  if (!claimsRunCheckResult) return false;
  return !RUN_CHECK_ARTIFACT_CITATION_PATTERN.test(answer);
}

function previewUncitedAnswer(content) {
  const compact = String(content || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '(empty content)';
  return compact.length > 500 ? `${compact.slice(0, 500)}...` : compact;
}

function truncateForHistory(value, maxChars) {
  const text = String(value == null ? '' : value);
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars for Mercury context budget]`,
    truncated: true,
    originalChars: text.length,
  };
}

function compactToolCallForHistory(toolCall) {
  if (!toolCall || !toolCall.function) return toolCall;
  const rawArgs = toolCall.function.arguments;
  if (typeof rawArgs !== 'string') return toolCall;
  const compacted = truncateForHistory(rawArgs, MAX_TOOL_ARGUMENT_HISTORY_CHARS);
  if (!compacted.truncated) return toolCall;
  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      arguments: JSON.stringify({
        _mercury_context_compacted: true,
        original_chars: compacted.originalChars,
        argument_preview: compacted.text,
      }),
    },
  };
}

function compactAssistantMessageForHistory(assistantMsg) {
  if (!assistantMsg || !Array.isArray(assistantMsg.tool_calls)) return assistantMsg;
  return {
    ...assistantMsg,
    tool_calls: assistantMsg.tool_calls.map(compactToolCallForHistory),
  };
}

function stringifyToolResultForHistory(toolResult) {
  const raw = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
  const compacted = truncateForHistory(raw, MAX_TOOL_RESULT_HISTORY_CHARS);
  if (!compacted.truncated) return raw;
  return JSON.stringify({
    _mercury_context_compacted: true,
    original_chars: compacted.originalChars,
    result_preview: compacted.text,
    note: 'Tool result was compacted before reinsertion into Mercury context. Re-run a narrower tool call if omitted lines are needed.',
  });
}

function normalizeToolHandleCitations(content) {
  return String(content || '')
    .replace(
    new RegExp(String.raw`(\`?)(${REPO_FILE_PATH_PATTERN})\1([^\n]{0,500})【open_file†L(\d+)(?:[-‑–—]L?(\d+))?】`, 'g'),
    (match, tick, filePath, between, startLine, endLine) => {
      const range = endLine ? `${startLine}-${endLine}` : startLine;
      return `${tick}${filePath}${tick}${between}${filePath}:${range}`;
    }
  )
    .replace(
      new RegExp(String.raw`\bFile:\s*\`?(${REPO_FILE_PATH_PATTERN})\`?\s*(?:\*+)?\s*Lines?:\s*(\d+)(?:[-‑–—](\d+))?`, 'gi'),
      (match, filePath, startLine, endLine) => `${filePath}:${endLine ? `${startLine}-${endLine}` : startLine}`
    )
    .replace(
      new RegExp(String.raw`\`?(${REPO_FILE_PATH_PATTERN})\`?\s+lines?\s*\(?(\d+)(?:[-‑–—](\d+))?\)?`, 'gi'),
      (match, filePath, startLine, endLine) => `${filePath}:${endLine ? `${startLine}-${endLine}` : startLine}`
    );
}

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findToolAvailabilityContradiction(content, history = []) {
  const answer = String(content || '');
  const invokedTools = new Set(
    history
      .filter((entry) => entry && entry.toolName && !(entry.toolResult && entry.toolResult.error))
      .map((entry) => entry.toolName)
  );

  for (const toolName of invokedTools) {
    const escaped = escapeRegexLiteral(toolName);
    const sameSentence = '[^.\\n!?:;]{0,180}';
    const negativeAvailabilityPatterns = [
      new RegExp(`\\b${escaped}\\b${sameSentence}\\b(?:not\\s+(?:exposed|listed|available|registered|implemented|usable)|missing|omitted|unavailable|unexposed)\\b`, 'i'),
      new RegExp(`\\b${escaped}\\b${sameSentence}\\b(?:cannot|can't|can\\s+not)\\s+(?:be\\s+)?(?:invoked|called|used|seen|found)\\b`, 'i'),
      new RegExp(`\\b(?:not\\s+(?:exposed|listed|available|registered|implemented|usable)|missing|omitted|unavailable|unexposed)\\b${sameSentence}\\b${escaped}\\b`, 'i'),
      new RegExp(`\\b(?:cannot|can't|can\\s+not)\\s+(?:be\\s+)?(?:invoke|invoked|call|called|use|used|see|seen|find|found)\\b${sameSentence}\\b${escaped}\\b`, 'i'),
    ];
    if (negativeAvailabilityPatterns.some((pattern) => pattern.test(answer))) {
      return toolName;
    }
  }
  return null;
}

function hasUnsupportedTestOutcomeClaim(content, history = []) {
  const answer = String(content || '');
  const claimsTestOutcome = /\btest(?:s| suite| case)?\b[\s\S]{0,180}\b(?:fails?|failed|passes?|passed|green|red)\b/i.test(answer)
    || /\b(?:fails?|failed|passes?|passed|green|red)\b[\s\S]{0,180}\btest(?:s| suite| case)?\b/i.test(answer);
  if (!claimsTestOutcome) return false;
  return !history.some((entry) => {
    if (!entry || (entry.toolResult && entry.toolResult.error)) return false;
    if (entry.toolName === 'run_check' && entry.toolResult && entry.toolResult.source === 'run_check') {
      return true;
    }
    return /test|jest|npm/i.test(entry.toolName || '');
  });
}

function hasConceptualProofClaim(content) {
  const answer = String(content || '');
  return /\bconceptual\b[\s\S]{0,240}\bno additional evidence needed\b/i.test(answer)
    || /\bno additional evidence (?:is )?required\b/i.test(answer);
}

function finalAnswerEvidenceFailures(content) {
  const failures = [];
  if (!hasFileLineCitation(content)) failures.push('missing_file_line_citation');
  if (hasToolHandleCitation(content)) failures.push('tool_handle_citation');
  if (hasUnsupportedRunCheckClaim(content)) failures.push('uncited_run_check_claim');
  return failures;
}

// A flag whose trigger is unrecoverable is testimony about evidence that no
// longer exists: every flag carries the quoted sentence that fired it.
function matchClaimWindow(content, pattern) {
  const text = String(content || '');
  const match = text.match(pattern);
  if (!match) return null;
  const start = Math.max(0, match.index - 100);
  const end = Math.min(text.length, match.index + match[0].length + 140);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

const REFERENCE_CLAIM_PATTERN = /\b(?:\d+\s+callers?|no callers?|zero call ?sites?|only caller|nothing (?:calls|imports|references|invokes)|never (?:called|invoked|imported|referenced|used)|imported by nothing|not (?:imported|referenced|called|invoked|used)\s+(?:by\s+)?(?:anything|anywhere)|un(?:used|wired|referenced)\b|dead code)\b/i;
const REFERENCE_EVIDENCE_TOOLS = /^(?:serena_blast_radius|serena_property_refs|serena_method_callers|serena_class_fields|find_references|find_definition)$/;
const EXHAUSTIVE_SEARCH_CLAIM_PATTERN = /\b(?:only (?:place|occurrence|match|file|caller)|no (?:production(?:-code)?|source|other|current repo|repo)[^.]{0,120}(?:contains|matches|calls|imports|references|invokes|uses|has|contains a)|no other (?:source )?files?|all other matches|none of (?:the|those|them)|zero matches|there are no)\b/i;
const SEARCH_EVIDENCE_TOOLS = /^(?:search|grep|regex_grep)$/;

function matchUnsupportedReferenceClaim(content, history = []) {
  const quote = matchClaimWindow(content, REFERENCE_CLAIM_PATTERN);
  if (!quote) return null;
  const hasAstEvidence = history.some((entry) => (
    entry
    && entry.toolName
    && REFERENCE_EVIDENCE_TOOLS.test(entry.toolName)
    && !(entry.toolResult && entry.toolResult.error)
  ));
  return hasAstEvidence ? null : quote;
}

function matchUnsupportedExhaustiveSearchClaim(content, history = []) {
  const quote = matchClaimWindow(content, EXHAUSTIVE_SEARCH_CLAIM_PATTERN);
  if (!quote) return null;

  const searchEntries = history.filter((entry) => (
    entry
    && entry.toolName
    && SEARCH_EVIDENCE_TOOLS.test(entry.toolName)
    && entry.toolResult
    && !entry.toolResult.error
  ));
  if (searchEntries.length === 0) {
    return quote;
  }

  const weakSearch = searchEntries.some((entry) => (
    entry.toolResult.truncated
    || (Array.isArray(entry.toolResult.warnings) && entry.toolResult.warnings.length > 0)
  ));
  return weakSearch ? quote : null;
}

function assessFinalAnswerQuality(content, history = []) {
  const flags = [];
  const evidence = [];
  const add = (flag, quote) => {
    flags.push(flag);
    evidence.push({ flag, evidence: quote || null });
  };

  if (!hasFileLineCitation(content)) {
    add('missing_file_line_citation', 'no file:line citation anywhere in the final answer');
  }
  if (hasToolHandleCitation(content)) {
    add('tool_handle_citation', matchClaimWindow(content, /【[^】]+†L\d+(?:[-‑–—]L?\d+)?】/));
  }
  if (hasUnsupportedRunCheckClaim(content)) {
    add('uncited_run_check_claim', matchClaimWindow(content, /\brun_check\b[\s\S]{0,160}\b(?:result|artifact|command|stdout|stderr|exit_code|exit code|timed_out|timed out|passed|failed|green|red|proves?|proved|evidence)\b/i));
  }
  if (hasUnsupportedTestOutcomeClaim(content, history)) {
    add('unsupported_test_outcome_claim', matchClaimWindow(content, /\btest(?:s| suite| case)?\b[\s\S]{0,180}\b(?:fails?|failed|passes?|passed|green|red)\b/i)
      || matchClaimWindow(content, /\b(?:fails?|failed|passes?|passed|green|red)\b[\s\S]{0,180}\btest(?:s| suite| case)?\b/i));
  }
  if (hasConceptualProofClaim(content)) {
    add('conceptual_proof_claim', matchClaimWindow(content, /\bconceptual\b[\s\S]{0,240}\bno additional evidence needed\b/i)
      || matchClaimWindow(content, /\bno additional evidence (?:is )?required\b/i));
  }
  const referenceClaim = matchUnsupportedReferenceClaim(content, history);
  if (referenceClaim) {
    add('unsupported_reference_claim', referenceClaim);
  }
  const exhaustiveSearchClaim = matchUnsupportedExhaustiveSearchClaim(content, history);
  if (exhaustiveSearchClaim) {
    add('unsupported_exhaustive_search_claim', exhaustiveSearchClaim);
  }

  const contradictedTool = findToolAvailabilityContradiction(content, history);
  if (contradictedTool) {
    add(`tool_availability_contradiction:${contradictedTool}`, matchClaimWindow(content, new RegExp(escapeRegexLiteral(contradictedTool), 'i')));
  }

  return {
    flags,
    evidence,
    ok: flags.length === 0,
  };
}

function isFailedToolResult(toolName, result) {
  if (!result || typeof result !== 'object') return true;
  if (result.error) return true;
  if (toolName === 'run_check') {
    if (result.timed_out) return true;
    if (result.signal) return true;
    if (typeof result.exit_code === 'number' && result.exit_code !== 0) return true;
  }
  return false;
}

function compactTelemetryValue(value, maxChars = 500) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > maxChars ? `${value.slice(0, maxChars)}...[truncated ${value.length - maxChars} chars]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => compactTelemetryValue(entry, maxChars));
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
      if (['text', 'diff', 'body', 'stdout', 'stderr'].includes(key)) continue;
      output[key] = compactTelemetryValue(raw, maxChars);
    }
    return output;
  }
  return String(value);
}

function summarizeToolResultForTelemetry(toolName, result, failed) {
  if (!result || typeof result !== 'object') {
    return { error: 'missing tool result' };
  }
  if (failed) {
    return { error: result.error || 'tool returned failure result' };
  }
  const summary = {};
  for (const key of [
    'source',
    'file',
    'path',
    'ref',
    'target',
    'requested_target',
    'start_line',
    'end_line',
    'total',
    'filesScanned',
    'callerCount',
    'riskLevel',
    'file_count',
    'truncated',
    'latencyMs',
    'exit_code',
    'signal',
    'timed_out',
    'status',
    'artifact_citation',
  ]) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      summary[key] = compactTelemetryValue(result[key], 200);
    }
  }
  if (toolName === 'list_files') {
    summary.total = result.total;
  }
  return summary;
}

function summarizeToolTelemetry(history = []) {
  const byTool = {};
  const calls = [];
  const filesOpened = new Set();
  const runCheckArtifacts = [];
  let total = 0;
  let succeeded = 0;
  let failed = 0;

  for (const entry of history || []) {
    if (!entry || !entry.toolName) continue;
    total += 1;
    if (!byTool[entry.toolName]) {
      byTool[entry.toolName] = {
        calls: 0,
        succeeded: 0,
        failed: 0,
      };
    }

    const toolStats = byTool[entry.toolName];
    toolStats.calls += 1;

    const result = entry.toolResult;
    const isFailure = isFailedToolResult(entry.toolName, result);
    if (isFailure) {
      failed += 1;
      toolStats.failed += 1;
    } else {
      succeeded += 1;
      toolStats.succeeded += 1;
    }

    calls.push({
      iteration: entry.iteration == null ? null : entry.iteration,
      name: entry.toolName,
      status: isFailure ? 'failed' : 'succeeded',
      args: compactTelemetryValue(entry.toolArgs || {}, 500),
      result: summarizeToolResultForTelemetry(entry.toolName, result, isFailure),
    });

    if (!isFailure && entry.toolName === 'open_file' && result.file) {
      filesOpened.add(`${result.file}:${result.start_line || 1}-${result.end_line || result.start_line || 1}`);
    }
    if (!isFailure && entry.toolName === 'git_show' && result.path) {
      filesOpened.add(`${result.ref || 'git'}:${result.path}:${result.start_line || 1}-${result.end_line || result.start_line || 1}`);
    }
    if (entry.toolName === 'run_check' && result && typeof result === 'object' && result.artifact_citation) {
      runCheckArtifacts.push(result.artifact_citation);
    }
  }

  const runChecks = (history || [])
    .filter((entry) => entry && entry.toolName === 'run_check' && entry.toolResult && typeof entry.toolResult === 'object')
    .map((entry) => {
      const result = entry.toolResult;
      const failedRunCheck = isFailedToolResult(entry.toolName, result);
      return {
        profile: result.profile || (entry.toolArgs && entry.toolArgs.profile) || 'run_check',
        command: result.command || ((entry.toolArgs && Array.isArray(entry.toolArgs.command)) ? entry.toolArgs.command.join(' ') : ''),
        exit_code: typeof result.exit_code === 'number' ? result.exit_code : null,
        signal: result.signal || '',
        timed_out: result.timed_out === true,
        status: failedRunCheck ? 'failed' : 'passed',
        artifact_citation: result.artifact_citation || '',
        error: result.error || '',
      };
    });

  return {
    total,
    succeeded,
    failed,
    byTool,
    calls,
    filesOpened: Array.from(filesOpened).sort(),
    runCheckArtifacts,
    runChecks,
  };
}

function attachToolTelemetry(result, history) {
  return {
    ...result,
    toolTelemetry: summarizeToolTelemetry(history),
  };
}

function formatToolTelemetry(telemetry = {}) {
  const byTool = telemetry.byTool || {};
  const toolSummary = Object.keys(byTool)
    .sort()
    .map((toolName) => {
      const stats = byTool[toolName];
      return `${toolName}:${stats.calls}/${stats.succeeded}/${stats.failed}`;
    })
    .join(', ') || 'none';
  const openedCount = Array.isArray(telemetry.filesOpened) ? telemetry.filesOpened.length : 0;
  const runCheckCount = Array.isArray(telemetry.runCheckArtifacts) ? telemetry.runCheckArtifacts.length : 0;
  const runChecks = Array.isArray(telemetry.runChecks) ? telemetry.runChecks : [];
  const failedCalls = Array.isArray(telemetry.calls)
    ? telemetry.calls
      .filter((call) => call.status === 'failed')
      .map((call) => `${call.name}(${JSON.stringify(call.args || {}).slice(0, 160)}):${call.result && call.result.error ? call.result.error : 'failed'}`)
      .join('; ')
    : '';
  const runCheckLedger = runChecks.length > 0
    ? runChecks.map((check) => {
      const outcome = check.timed_out
        ? 'timed_out'
        : (check.signal ? `signal=${check.signal}` : `exit_code=${check.exit_code == null ? 'n/a' : check.exit_code}`);
      const artifact = check.artifact_citation ? ` artifact=${check.artifact_citation}` : '';
      const error = check.error ? ` error=${check.error}` : '';
      return `${check.status}:${check.profile} ${outcome}${artifact}${error}`;
    }).join('; ')
    : 'none';
  return [
    `tool_calls=${telemetry.total || 0}`,
    `succeeded=${telemetry.succeeded || 0}`,
    `failed=${telemetry.failed || 0}`,
    `tools=${toolSummary}`,
    `files_opened=${openedCount}`,
    `run_check_artifacts=${runCheckCount}`,
    `failed_calls=${failedCalls || 'none'}`,
    `run_checks=${runCheckLedger}`,
  ].join(' | ');
}

/**
 * Wrap generateWithTools with exponential backoff retry.
 * Retries on HTTP 429/502/503/504, empty responses, network errors.
 */
async function callMercuryWithRetry(client, messages, tools, options, verbose) {
  const maxRetries = 3;
  const baseDelayMs = 500;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const assistantMsg = await client.generateWithTools(messages, tools, options);

      const hasToolCalls = Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0;
      const hasContent = assistantMsg.content && assistantMsg.content.trim() !== '';

      if (!hasToolCalls && !hasContent) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          if (verbose) console.error(`[REACT] Empty response (no tool_calls, no content), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      if (attempt > 0 && verbose) {
        console.error(`[REACT] Recovered after ${attempt} retry(ies)`);
      }
      return assistantMsg;
    } catch (err) {
      const msg = err.message || String(err);
      const isRetriable = /HTTP (429|502|503|504)/.test(msg) || /ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
      if (isRetriable && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        if (verbose) console.error(`[REACT] ${msg.slice(0, 120)}, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('callMercuryWithRetry: max retries exceeded');
}

/**
 * Run a ReAct loop using Mercury-2 native tool calling.
 *
 * params:
 *   client: PersistentLLMClient instance (must support generateWithTools)
 *   toolAdapter: object with .execute(name, args) and .buildToolSchema() methods
 *   systemPrompt: string (optional, defaults to DEFAULT_SYSTEM_PROMPT)
 *   userQuery: string — the user's question
 *   starterContext: array of {source, similarity, text} from RAG (optional)
 *   maxIterations: number (configured in mercury.config.json)
 *   maxTokens: number (configured in mercury.config.json)
 *   temperature: number (configured in mercury.config.json)
 *   verbose: boolean — log iteration progress to stderr
 *
 * returns: {answer, iterations, termination, history}
 */
async function runReactLoop(params) {
  const {
    client,
    toolAdapter,
    systemPrompt = config.AGENTIC_SYSTEM_PROMPT,
    userQuery,
    starterContext = [],
    traceHint = null,
    blastRadius = null,
    maxIterations = config.AGENTIC_MAX_ITERATIONS,
    maxTokens = config.AGENTIC_MAX_TOKENS,
    temperature = config.MERCURY_LLM_TEMPERATURE,
    verbose = false,
  } = params;

  if (!client || typeof client.generateWithTools !== 'function') {
    throw new Error('runReactLoop requires a client with generateWithTools()');
  }
  if (!toolAdapter || typeof toolAdapter.execute !== 'function' || typeof toolAdapter.buildToolSchema !== 'function') {
    throw new Error('runReactLoop requires a toolAdapter with execute() and buildToolSchema()');
  }
  if (!userQuery || typeof userQuery !== 'string') {
    throw new Error('runReactLoop requires a userQuery string');
  }

  const tools = toolAdapter.buildToolSchema();

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  if (starterContext && starterContext.length > 0) {
    const contextText = starterContext
      .map((c, i) => `[${i + 1}] ${c.source || 'unknown'} (sim=${(c.similarity || 0).toFixed(3)})\n${c.text || ''}`)
      .join('\n\n');
    messages.push({
      role: 'system',
      content: `Starter context from RAG retrieval (may or may not be relevant — trust tool results over this if they conflict):\n\n${contextText}`,
    });
  }

  // Investigation trace hint: inject prior successful path as bias
  if (traceHint) {
    messages.push({
      role: 'system',
      content: traceHint,
    });
  }

  // Blast radius: who imports the file under attack. Caller list comes from
  // tools/serena-bridge.js (dep-scanner inverse map). Mercury sees this as a
  // separate system message so it can reason about which callers a proposed
  // change affects without re-discovering the call graph.
  if (blastRadius) {
    messages.push({
      role: 'system',
      content: blastRadius,
    });
  }

  messages.push({ role: 'user', content: userQuery });

  const history = [];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (verbose) {
      console.error(`[REACT] Iteration ${iteration}/${maxIterations}`);
      console.error(`[REACT] Message history: ${messages.length} messages`);
    }

    let assistantMsg;
    try {
      assistantMsg = await callMercuryWithRetry(
        client,
        messages,
        tools,
        { maxTokens, toolChoice: 'auto', temperature },
        verbose
      );
    } catch (err) {
      if (verbose) console.error(`[REACT] Mercury call failed permanently: ${err.message}`);
      return attachToolTelemetry({
        answer: `(Mercury call failed: ${err.message})`,
        iterations: iteration - 1,
        termination: 'error',
        history,
      }, history);
    }

    const hasToolCalls = Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0;
    // Append assistant message to conversation for next turn. Tool arguments can
    // be huge or malformed; keep the executable original in this iteration, but
    // compact the conversation copy so one bad probe cannot consume the next
    // Mercury input window.
    messages.push(hasToolCalls ? compactAssistantMessageForHistory(assistantMsg) : assistantMsg);

    if (hasToolCalls) {
      if (verbose) console.error(`[REACT] Assistant requested ${assistantMsg.tool_calls.length} tool call(s)`);

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function && toolCall.function.name;
        const rawArgs = toolCall.function && toolCall.function.arguments;

        let toolArgs;
        try {
          toolArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs || {});
        } catch (err) {
          if (verbose) console.error(`[REACT] Failed to parse tool args for ${toolName}: ${err.message}`);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: stringifyToolResultForHistory({
              error: `Invalid JSON in arguments: ${err.message}`,
              raw: truncateForHistory(rawArgs, 1000).text,
            }),
          });
          history.push({ iteration, toolName, toolArgs: null, toolResult: { error: 'arg parse failed' }, toolCallId: toolCall.id });
          continue;
        }

        if (verbose) console.error(`[REACT] Executing ${toolName}(${JSON.stringify(toolArgs).slice(0, 200)})`);

        let toolResult;
        try {
          toolResult = await toolAdapter.execute(toolName, toolArgs);
        } catch (err) {
          toolResult = { error: err.message };
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
      continue;
    }

    // No tool calls — this is the final answer
    const finalAnswer = normalizeToolHandleCitations(assistantMsg.content || '(empty content)');
    const answerQuality = assessFinalAnswerQuality(finalAnswer, history);

    if (verbose) console.error(`[REACT] Final answer on iteration ${iteration}`);
    return attachToolTelemetry({
      answer: finalAnswer,
      answerQuality,
      iterations: iteration,
      termination: 'answer_given',
      history,
    }, history);
  }

  return attachToolTelemetry({
    answer: '(max iterations reached without a final answer)',
    iterations: maxIterations,
    termination: 'max_iterations',
    history,
  }, history);
}

module.exports = {
  runReactLoop,
  callMercuryWithRetry,
  hasFileLineCitation,
  hasToolHandleCitation,
  hasUnsupportedRunCheckClaim,
  previewUncitedAnswer,
  normalizeToolHandleCitations,
  compactAssistantMessageForHistory,
  stringifyToolResultForHistory,
  findToolAvailabilityContradiction,
  hasUnsupportedTestOutcomeClaim,
  hasConceptualProofClaim,
  matchUnsupportedExhaustiveSearchClaim,
  finalAnswerEvidenceFailures,
  assessFinalAnswerQuality,
  summarizeToolTelemetry,
  formatToolTelemetry,
  AGENTIC_SYSTEM_PROMPT: config.AGENTIC_SYSTEM_PROMPT,
};
