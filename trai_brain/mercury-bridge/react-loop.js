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

const FILE_LINE_CITATION_PATTERN = /\b[\w./-]+\.(?:js|mjs|cjs|json|md|css|html|yml|yaml|txt):\d+(?:[-‑–—]\d+)?\b/;
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
  if (!/\brun_check\b/i.test(answer)) return false;
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
    /(`?)([\w./-]+\.(?:js|mjs|cjs|json|md|css|html|yml|yaml|txt))\1([^.\n]{0,260})【open_file†L(\d+)(?:[-‑–—]L?(\d+))?】/g,
    (match, tick, filePath, between, startLine, endLine) => {
      const range = endLine ? `${startLine}-${endLine}` : startLine;
      return `${tick}${filePath}${tick}${between}${filePath}:${range}`;
    }
  )
    .replace(
      /\bFile:\s*`?([\w./-]+\.(?:js|mjs|cjs|json|md|css|html|yml|yaml|txt))`?\s*(?:\*+)?\s*Lines?:\s*(\d+)(?:[-‑–—](\d+))?/gi,
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

  // Loop detection: track recent tool calls to catch Mercury repeating itself
  const RECENT_WINDOW = 8;
  const DUP_THRESHOLD = 3;
  const recentToolHashes = [];
  let citationRepairRequested = false;
  let contradictionRepairRequested = false;
  let unsupportedClaimRepairRequested = false;

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

    const hasToolCalls = Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0;
    // Append assistant message to conversation for next turn. Tool arguments can
    // be huge or malformed; keep the executable original in this iteration, but
    // compact the conversation copy so one bad probe cannot consume the next
    // Mercury input window.
    messages.push(hasToolCalls ? compactAssistantMessageForHistory(assistantMsg) : assistantMsg);

    if (hasToolCalls) {
      if (verbose) console.error(`[REACT] Assistant requested ${assistantMsg.tool_calls.length} tool call(s)`);

      // Loop detection: if Mercury is repeating the same exact tool call, break out
      const loopDetected = assistantMsg.tool_calls.some(tc => detectLoop(tc));
      if (loopDetected) {
        if (verbose) console.error(`[REACT] Loop detected — Mercury is repeating tool calls. Forcing synthesis.`);
        // Remove the assistant message with tool_calls (can't leave it dangling)
        messages.pop();
        // Add a correctness-first synthesis message without pressuring speed.
        messages.push({
          role: 'user',
          content: 'You are repeating the same tool call. If that call cannot add new evidence, synthesize only from already gathered evidence with file:line citations for every factual claim. If the evidence is insufficient, say exactly what additional evidence or iterations are still needed instead of producing a brittle answer.',
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
    if (!hasFileLineCitation(finalAnswer) || hasToolHandleCitation(finalAnswer) || hasUnsupportedRunCheckClaim(finalAnswer)) {
      if (!citationRepairRequested) {
        citationRepairRequested = true;
        messages.push({
          role: 'user',
          content: 'Your answer is missing file:line citations in the required `path/to/file.js:123-130` format, it still contains tool-handle citations, or it claims a run_check result without citing the execution artifact as `ogz-meta/cognition-history/mercury-execution/name.log:line`. Tool-handle citations like `【open_file†L1-L2】`, `【run_check†L1-L2】`, and bare phrases like "lines 12-14" do not count. Use tools if needed, then return a final answer with only literal `path:line` citations for every factual claim. If no cited answer can be proven from available evidence, say what evidence is missing.',
        });
        continue;
      }
      if (verbose) console.error(`[REACT] Final answer missing file:line citations, contains tool handles, or has uncited run_check claims after repair request`);
      return {
        answer: `(Mercury final answer missing file:line citations, contains tool handles, or has uncited run_check claims after repair request)\n\nRejected answer preview: ${previewUncitedAnswer(finalAnswer)}`,
        iterations: iteration,
        termination: 'citation_missing',
        history,
      };
    }

    if (hasUnsupportedTestOutcomeClaim(finalAnswer, history) || hasConceptualProofClaim(finalAnswer)) {
      if (!unsupportedClaimRepairRequested) {
        unsupportedClaimRepairRequested = true;
        messages.push({
          role: 'user',
          content: 'Your answer made a concrete proof claim without executable evidence. Do not claim a test passes or fails unless a test-run tool result is in the history. Do not use conceptual reproduction or "no additional evidence needed" as proof of a concrete break. Re-evaluate from executed tool results and current code only; if the exact behavior cannot be proven with available tools, say what evidence is missing.',
        });
        continue;
      }
      if (verbose) console.error(`[REACT] Final answer repeated unsupported test/conceptual proof claim after repair request`);
      return {
        answer: `(Mercury final answer repeated unsupported test/conceptual proof claim after repair request)\n\nRejected answer preview: ${previewUncitedAnswer(finalAnswer)}`,
        iterations: iteration,
        termination: 'unsupported_proof_claim',
        history,
      };
    }

    const contradictedTool = findToolAvailabilityContradiction(finalAnswer, history);
    if (contradictedTool) {
      if (!contradictionRepairRequested) {
        contradictionRepairRequested = true;
        messages.push({
          role: 'user',
          content: `Your answer says ${contradictedTool} is missing, unavailable, not exposed, or cannot be invoked, but this same investigation already executed ${contradictedTool} successfully. Re-evaluate from the actual tool results and return a cited answer. Do not claim a tool is unavailable after using it.`,
        });
        continue;
      }
      if (verbose) console.error(`[REACT] Final answer contradicted successful tool use after repair request`);
      return {
        answer: `(Mercury final answer contradicted successful ${contradictedTool} tool use after repair request)\n\nRejected answer preview: ${previewUncitedAnswer(finalAnswer)}`,
        iterations: iteration,
        termination: 'self_contradiction',
        history,
      };
    }

    if (verbose) console.error(`[REACT] Final answer on iteration ${iteration}`);
    return {
      answer: finalAnswer,
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
  AGENTIC_SYSTEM_PROMPT: config.AGENTIC_SYSTEM_PROMPT,
};
