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
  const dirtyDiffChangedFiles = extractDirtyDiffChangedFiles(starterContext);
  const openedDirtyDiffFiles = new Set();

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  if (starterContext && starterContext.length > 0) {
    const contextText = starterContext
      .map((c, i) => `[${i + 1}] ${c.source || 'unknown'} (sim=${(c.similarity || 0).toFixed(3)})\n${c.text || ''}`)
      .join('\n\n');
    const hasDirtyDiffContext = starterContext.some((c) => c.kind === 'dirty_diff');
    const contextIntro = hasDirtyDiffContext
      ? [
        'Neutral dirty diff context for the current break-my-fix review:',
        '- Start by opening the changed repo files listed in this context with tools.',
        '- Do not infer the fix target from unrelated TODO/FIX comments or old docs.',
        '- This is not a scope limit. After checking changed files, search sibling paths for the same bug class.',
      ].join('\n')
      : 'Starter context from RAG retrieval (may or may not be relevant — trust tool results over this if they conflict):';
    messages.push({
      role: 'system',
      content: `${contextIntro}\n\n${contextText}`,
    });
  }

  // Investigation trace hint: inject prior successful path as bias
  if (traceHint) {
    messages.push({
      role: 'system',
      content: traceHint,
    });
  }

  messages.push({ role: 'user', content: userQuery });

  const history = [];

  // Loop detection: track recent tool calls to catch Mercury repeating itself
  const RECENT_WINDOW = 8;
  const DUP_THRESHOLD = 3;
  const recentToolHashes = [];

  function hashToolCall(tc) {
    return `${tc.function?.name}:${JSON.stringify(tc.function?.arguments || {})}`;
  }

  function detectLoop(toolCall) {
    const hash = hashToolCall(toolCall);
    recentToolHashes.push(hash);
    if (recentToolHashes.length > RECENT_WINDOW) recentToolHashes.shift();
    const count = recentToolHashes.filter(h => h === hash).length;
    return count >= DUP_THRESHOLD;
  }

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
      return {
        answer: `(Mercury call failed: ${err.message})`,
        iterations: iteration - 1,
        termination: 'error',
        history,
      };
    }

    // Append assistant message to conversation for next turn
    messages.push(assistantMsg);

    const hasToolCalls = Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0;

    if (hasToolCalls) {
      if (verbose) console.error(`[REACT] Assistant requested ${assistantMsg.tool_calls.length} tool call(s)`);

      // Loop detection: if Mercury is repeating the same exact tool call, break out
      const loopDetected = assistantMsg.tool_calls.some(tc => detectLoop(tc));
      if (loopDetected) {
        if (verbose) console.error(`[REACT] Loop detected — Mercury is repeating tool calls. Forcing synthesis.`);
        // Remove the assistant message with tool_calls (can't leave it dangling)
        messages.pop();
        // Add a synthesis-forcing user message
        messages.push({
          role: 'user',
          content: 'You have been repeating the same tool calls. Stop searching and provide your final answer now using the evidence you have already gathered. Cite file:line for every claim.',
        });
        continue;
      }

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
            content: JSON.stringify({ error: `Invalid JSON in arguments: ${err.message}`, raw: rawArgs }),
          });
          history.push({ iteration, toolName, toolArgs: null, toolResult: { error: 'arg parse failed' }, toolCallId: toolCall.id });
          continue;
        }

        let toolResult;
        const dirtyDiffGateError = getDirtyDiffGateError({
          toolName,
          toolArgs,
          changedFiles: dirtyDiffChangedFiles,
          openedFiles: openedDirtyDiffFiles,
        });
        if (dirtyDiffGateError) {
          if (verbose) console.error(`[REACT] Dirty diff gate blocked ${toolName}(${JSON.stringify(toolArgs).slice(0, 200)})`);
          toolResult = { error: dirtyDiffGateError };
        } else {
          if (verbose) console.error(`[REACT] Executing ${toolName}(${JSON.stringify(toolArgs).slice(0, 200)})`);
          try {
            toolResult = await toolAdapter.execute(toolName, toolArgs);
          } catch (err) {
            toolResult = { error: err.message };
          }
          markDirtyDiffFileOpened({ toolName, toolArgs, toolResult, changedFiles: dirtyDiffChangedFiles, openedFiles: openedDirtyDiffFiles });
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
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        });
      }
      continue;
    }

    // No tool calls — this is the final answer
    if (verbose) console.error(`[REACT] Final answer on iteration ${iteration}`);
    return {
      answer: assistantMsg.content || '(empty content)',
      iterations: iteration,
      termination: 'answer_given',
      history,
    };
  }

  return {
    answer: '(max iterations reached without a final answer)',
    iterations: maxIterations,
    termination: 'max_iterations',
    history,
  };
}

function normalizeRepoPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function sectionLines(text, heading) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const result = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('## ')) break;
    const trimmed = line.trim();
    if (trimmed && trimmed !== '(none)') result.push(trimmed);
  }
  return result;
}

function extractDirtyDiffChangedFiles(starterContext = []) {
  const changed = new Set();
  for (const context of starterContext) {
    if (!context || context.kind !== 'dirty_diff') continue;
    for (const heading of ['## git diff --cached --name-only', '## git diff --name-only']) {
      for (const filePath of sectionLines(context.text, heading)) {
        changed.add(normalizeRepoPath(filePath));
      }
    }
  }
  return changed;
}

function getDirtyDiffGateError({ toolName, toolArgs, changedFiles, openedFiles }) {
  if (!changedFiles || changedFiles.size === 0) return null;
  const unopened = [...changedFiles].filter((filePath) => !openedFiles.has(filePath));
  if (unopened.length === 0) return null;
  if (toolName === 'open_file' && changedFiles.has(normalizeRepoPath(toolArgs && toolArgs.path))) {
    return null;
  }
  return [
    'Break-my-fix dirty-diff gate: open every tracked changed file before broad search.',
    `Remaining changed files: ${unopened.join(', ')}`,
    'After that, search sibling paths for the same bug class.',
  ].join(' ');
}

function markDirtyDiffFileOpened({ toolName, toolArgs, toolResult, changedFiles, openedFiles }) {
  if (toolName !== 'open_file' || !changedFiles || changedFiles.size === 0) return;
  if (toolResult && toolResult.error) return;
  const filePath = normalizeRepoPath(toolArgs && toolArgs.path);
  if (changedFiles.has(filePath)) openedFiles.add(filePath);
}

module.exports = {
  runReactLoop,
  callMercuryWithRetry,
  extractDirtyDiffChangedFiles,
  getDirtyDiffGateError,
  AGENTIC_SYSTEM_PROMPT: config.AGENTIC_SYSTEM_PROMPT,
};
