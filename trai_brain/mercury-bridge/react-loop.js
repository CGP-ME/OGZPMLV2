/**
 * Mercury Bridge — ReAct Loop
 * ══════════════════════════════════════════════════════════════
 * Agentic iteration layer. Mercury gets tool access to the actual
 * codebase via `tool-adapter.js` and can iteratively drill into
 * files until it has enough information to answer.
 *
 * This solves the embedding-similarity failure mode: when initial
 * RAG retrieval returns docs instead of code, Mercury can just
 * grep for the real thing and open it directly.
 *
 * Flow:
 *   1. Hybrid retrieval returns "starter context" (top-K chunks)
 *   2. ReAct loop sends system prompt + query + starter context to Mercury
 *   3. Mercury responds — either with tool_call markup or with final answer
 *   4. If tool_call: execute it, append result to history, loop (max N iterations)
 *   5. If final answer: return it
 *
 * Uses markdown-fence markup for tool calls because Mercury-2's Inception
 * Labs API server chokes on angle-bracket content in model output (HTTP 503).
 * Fences contain zero angle brackets and are heavily trained in LLM data:
 *
 *     ```tool_call
 *     {"tool": "grep", "args": {"query": "exitSize"}}
 *     ```
 *
 * And results come back as:
 *
 *     ```tool_result
 *     {"matches": [...]}
 *     ```
 */

'use strict';

const path = require('path');

const config = require('./config');

// Lazy-loaded — only required when runReactLoop actually runs, so that
// parseToolCall and buildPrompt can be unit-tested without depending on
// the repo's core/ layout being present.
let _PersistentLLMClient = null;
function getPersistentLLMClient() {
  if (_PersistentLLMClient) return _PersistentLLMClient;
  _PersistentLLMClient = require(
    path.join(config.REPO_ROOT, 'core', 'persistent_llm_client.js')
  );
  return _PersistentLLMClient;
}

// ─────────────────────────────────────────────────────────────
// RETRY WRAPPER
// ─────────────────────────────────────────────────────────────

/**
 * Wrap a Mercury call with exponential backoff retry.
 * Retries on: HTTP 429, 502, 503, 504, empty responses, network errors.
 * Does NOT retry on: parse errors, auth errors, 4xx (except 429).
 *
 * Added 2026-04-08 per Inception Labs API guidance on handling 503/429.
 */
async function callMercuryWithRetry(client, prompt, maxTokens, verbose) {
  const maxRetries = 3;
  const baseDelayMs = 500;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.generateRawResponse(prompt, maxTokens);
      if (!response || response.trim() === '') {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          if (verbose) console.error(`[REACT] Empty response, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return '';
      }
      if (attempt > 0 && verbose) {
        console.error(`[REACT] Recovered after ${attempt} retry(ies)`);
      }
      return response;
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

// ─────────────────────────────────────────────────────────────
// TOOL CALL PARSING
// ─────────────────────────────────────────────────────────────

/**
 * Parse a Mercury response for tool_call markup. Returns the first
 * tool call found (if any) along with the surrounding text.
 *
 * Robust to:
 *   - Extra whitespace inside the tags
 *   - Leading/trailing text in the response
 *   - JSON with trailing commas or minor formatting issues
 *   - Multiple tool calls (takes the first one — we loop one step at a time)
 *
 * Returns:
 *   { hasToolCall: boolean, toolName?: string, toolArgs?: object,
 *     parseError?: string, preamble?: string, raw: string }
 */
function parseToolCall(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return { hasToolCall: false, raw: responseText || '' };
  }

  // Match ```tool_call ... ``` fenced blocks. We use markdown fences
  // instead of XML tags because Mercury-2's Inception Labs API server
  // chokes on angle-bracket content in model output (HTTP 503 with
  // "unexpected tokens remaining in message header"). Fences contain
  // zero angle brackets and are heavily represented in LLM training data.
  // Primary: look for ```tool_call fenced block
  const match = responseText.match(/```tool_call\s*\n([\s\S]*?)\n```/);
  if (match) {
    const preamble = responseText.slice(0, match.index).trim();
    const jsonBlob = match[1].trim();

    // Try to parse JSON. Handle common LLM formatting quirks.
    let parsed;
    try {
      parsed = JSON.parse(jsonBlob);
    } catch (err) {
      // Try cleaning trailing commas
      try {
        const cleaned = jsonBlob
          .replace(/,(\s*[}\]])/g, '$1')  // trailing commas
          .replace(/^```(?:json)?\s*/i, '') // markdown fences
          .replace(/\s*```$/i, '');
        parsed = JSON.parse(cleaned);
      } catch (err2) {
        return {
          hasToolCall: true,
          parseError: `Failed to parse tool_call JSON: ${err.message}. Raw: ${jsonBlob.slice(0, 200)}`,
          preamble,
          raw: responseText,
        };
      }
    }

    // Flexible field names: support both {tool, args} and {name, arguments}
    const toolName = parsed.tool || parsed.name || parsed.tool_name;
    const toolArgs = parsed.args || parsed.arguments || parsed.parameters || {};

    if (!toolName) {
      return {
        hasToolCall: true,
        parseError: `tool_call missing "tool" field. Parsed: ${JSON.stringify(parsed).slice(0, 200)}`,
        preamble,
        raw: responseText,
      };
    }

    return {
      hasToolCall: true,
      toolName,
      toolArgs,
      preamble,
      raw: responseText,
    };
  }

  // Fallback: salvage bare JSON when Mercury drops the fence but intent is clear.
  // Greedy match (not *?) to handle nested objects like {"tool":"x","args":{...}}
  const bareJsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (bareJsonMatch) {
    try {
      const parsed = JSON.parse(bareJsonMatch[0].replace(/,(\s*[}\]])/g, '$1'));
      // If it already has a tool field, use it directly
      if (parsed.tool || parsed.name) {
        return {
          hasToolCall: true,
          toolName: parsed.tool || parsed.name,
          toolArgs: parsed.args || parsed.arguments || {},
          preamble: '',
          raw: responseText,
          recovered: 'bare_json_with_tool_field',
        };
      }
      // If it has distinctive arg patterns, infer the tool name
      let inferredTool = null;
      if (parsed.query !== undefined) inferredTool = 'grep';
      else if (parsed.path !== undefined && parsed.start_line === undefined && parsed.end_line === undefined) inferredTool = 'list_files';
      else if (parsed.path !== undefined) inferredTool = 'open_file';
      else if (parsed.id !== undefined) inferredTool = 'get_chunk';

      if (inferredTool) {
        return {
          hasToolCall: true,
          toolName: inferredTool,
          toolArgs: parsed,
          preamble: '',
          raw: responseText,
          recovered: `bare_json_inferred_as_${inferredTool}`,
        };
      }
    } catch (err) {
      // Not parseable JSON, fall through
    }
  }

  return { hasToolCall: false, raw: responseText };
}

// ─────────────────────────────────────────────────────────────
// PROMPT ASSEMBLY
// ─────────────────────────────────────────────────────────────

/**
 * Build the full prompt for a Mercury turn. Includes system prompt,
 * tool documentation, user query, starter context, and conversation
 * history up to this point.
 *
 * Mercury doesn't have a native messages array format via our current
 * persistent_llm_client (which takes a prompt string), so we serialize
 * the whole conversation into one big prompt each turn. At max 10
 * iterations and modest tool results, this stays well under Mercury's
 * context limit.
 */
function buildPrompt(systemPrompt, toolDocs, userQuery, starterContext, history) {
  const lines = [];

  lines.push(systemPrompt);
  lines.push('');
  lines.push(toolDocs);
  lines.push('');
  lines.push('─── INSTRUCTIONS ───');
  lines.push('');
  lines.push('To call a tool, output a fenced `tool_call` block exactly like the example calls shown above for each tool. Copy the format exactly — the outer ```tool_call and ``` markers are required. Do not output bare JSON.');
  lines.push('');
  lines.push('Rules:');
  lines.push('1. Use tools to verify claims before stating them. Do NOT guess file paths or line numbers.');
  lines.push('2. Use `grep` first to find where something lives. Use `open_file` to see the actual code.');
  lines.push('3. After each tool call, STOP and wait for the tool_result block. Do not emit multiple tool calls in one turn.');
  lines.push('4. When you have enough information to answer the user question with confidence, provide your FINAL ANSWER with no tool_call markup. Cite file:line for every factual claim.');
  lines.push('5. If you cannot find the answer after several tool calls, say so plainly — do not invent information.');
  lines.push('6. The starter context below is from an initial RAG retrieval. It may or may not be relevant. Trust tool results over starter context when they conflict.');
  lines.push('');

  lines.push('─── USER QUERY ───');
  lines.push(userQuery);
  lines.push('');

  if (starterContext && starterContext.length > 0) {
    lines.push('─── STARTER CONTEXT (from initial retrieval) ───');
    starterContext.forEach((chunk, idx) => {
      lines.push(`### [${idx + 1}] ${chunk.file_path}:${chunk.start_line}-${chunk.end_line} (${chunk.kind}: ${chunk.name || 'unnamed'}, sim=${(chunk.similarity || 0).toFixed(3)})`);
      lines.push('```');
      lines.push(chunk.text || '');
      lines.push('```');
      lines.push('');
    });
  } else {
    lines.push('─── NO STARTER CONTEXT ───');
    lines.push('(Initial retrieval returned no results. Use tools to find the answer.)');
    lines.push('');
  }

  if (history && history.length > 0) {
    lines.push('─── CONVERSATION SO FAR ───');
    for (const turn of history) {
      lines.push('');
      lines.push(`## Turn ${turn.turnNumber}`);
      lines.push('');
      lines.push('ASSISTANT:');
      lines.push(turn.assistantResponse);
      lines.push('');
      if (turn.toolResult !== undefined) {
        lines.push('```tool_result');
        lines.push(typeof turn.toolResult === 'string'
          ? turn.toolResult
          : JSON.stringify(turn.toolResult, null, 2));
        lines.push('```');
      }
    }
    lines.push('');
    lines.push(`## Turn ${history.length + 1}`);
    lines.push('');
    lines.push('It is now your turn. Either make another tool call OR provide your final answer.');
  } else {
    lines.push('─── BEGIN ───');
    lines.push('');
    lines.push('Make your first tool call, or if the starter context is sufficient, provide your final answer directly.');
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────

/**
 * Run the ReAct loop.
 *
 * @param {Object} opts
 * @param {string} opts.query — the user question
 * @param {Array} opts.starterContext — top-K chunks from initial retrieval
 * @param {Object} opts.toolAdapter — from createToolAdapter()
 * @param {number} [opts.maxIterations=10] — safety cap
 * @param {number} [opts.maxTokens=2000] — Mercury max tokens per turn
 * @param {boolean} [opts.verbose=true] — log progress
 * @param {string} [opts.systemPrompt] — override default
 *
 * Returns:
 *   {
 *     finalAnswer: string,
 *     iterations: number,
 *     history: Array<{turnNumber, assistantResponse, toolCall, toolResult}>,
 *     terminationReason: 'answer_given' | 'max_iterations' | 'parse_error',
 *     totalLatencyMs: number,
 *   }
 */
async function runReactLoop(opts = {}) {
  const {
    query,
    starterContext = [],
    toolAdapter,
    maxIterations = 10,
    maxTokens = 2000,
    verbose = true,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
  } = opts;

  if (!query) throw new Error('runReactLoop requires a query');
  if (!toolAdapter) throw new Error('runReactLoop requires a toolAdapter');

  const t0 = Date.now();

  // Initialize Mercury client (lazy load to avoid hard dependency at module-load time)
  const PersistentLLMClient = getPersistentLLMClient();
  const client = new PersistentLLMClient({ provider: 'mercury' });
  await client.initialize();

  const toolDocs = toolAdapter.buildToolDocs();
  const history = [];
  let terminationReason = 'max_iterations';
  let finalAnswer = null;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (verbose) {
      console.log(`\n[REACT] Iteration ${iteration}/${maxIterations}`);
    }

    const prompt = buildPrompt(systemPrompt, toolDocs, query, starterContext, history);

    if (verbose) {
      console.log(`[REACT] Prompt length: ${prompt.length} chars`);
    }

    let response;
    try {
      response = await callMercuryWithRetry(client, prompt, maxTokens, verbose);
    } catch (err) {
      if (verbose) {
        console.error(`[REACT] Mercury call failed: ${err.message}`);
      }
      terminationReason = 'llm_error';
      finalAnswer = `ReAct loop failed on iteration ${iteration}: ${err.message}`;
      break;
    }

    if (!response || response.trim().length === 0) {
      if (verbose) {
        console.warn('[REACT] Mercury returned empty response');
      }
      terminationReason = 'empty_response';
      finalAnswer = '(Mercury returned an empty response. The query may have triggered a content filter or rate limit.)';
      break;
    }

    const parsed = parseToolCall(response);

    // No tool call = Mercury has decided to answer
    if (!parsed.hasToolCall) {
      if (verbose) {
        console.log(`[REACT] Final answer given on iteration ${iteration}`);
      }
      terminationReason = 'answer_given';
      finalAnswer = response.trim();
      break;
    }

    // Parse error — tell Mercury what went wrong, give it another chance
    if (parsed.parseError) {
      if (verbose) {
        console.warn(`[REACT] Parse error on iteration ${iteration}: ${parsed.parseError}`);
      }
      history.push({
        turnNumber: iteration,
        assistantResponse: response,
        toolCall: null,
        toolResult: {
          error: `Your tool_call was malformed: ${parsed.parseError}. Please retry with valid JSON inside a \`\`\`tool_call fenced block.`,
        },
      });
      continue;
    }

    // Execute the tool
    if (verbose) {
      const recoveredTag = parsed.recovered ? ` [${parsed.recovered}]` : '';
      console.log(`[REACT] Executing tool: ${parsed.toolName}(${JSON.stringify(parsed.toolArgs).slice(0, 200)})${recoveredTag}`);
    }

    let toolResult;
    try {
      toolResult = await toolAdapter.execute(parsed.toolName, parsed.toolArgs);
    } catch (err) {
      toolResult = { error: `tool execution threw: ${err.message}` };
    }

    if (verbose) {
      const preview = JSON.stringify(toolResult).slice(0, 300);
      console.log(`[REACT] Tool result: ${preview}${preview.length >= 300 ? '...' : ''}`);
    }

    history.push({
      turnNumber: iteration,
      assistantResponse: response,
      toolCall: { name: parsed.toolName, args: parsed.toolArgs },
      toolResult,
    });
  }

  if (terminationReason === 'max_iterations' && !finalAnswer) {
    finalAnswer = '(ReAct loop hit max iterations without producing a final answer. The last tool results are available in the history.)';
  }

  const totalLatencyMs = Date.now() - t0;
  return {
    finalAnswer,
    iterations: history.length,
    history,
    terminationReason,
    totalLatencyMs,
  };
}

// ─────────────────────────────────────────────────────────────
// DEFAULT SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a code review and architecture assistant for the OGZPrime algorithmic trading platform, a Node.js codebase.

Your job is to answer the user's question about the codebase accurately, with file:line citations for every factual claim, using the tools provided.

You have access to an agentic tool loop. You can iteratively search the repo, open files, and fetch chunks until you have enough information to answer confidently. The starter context you receive may or may not be relevant — it comes from a semantic retrieval that sometimes surfaces documentation instead of actual code. Trust tool results over starter context when they disagree.

Core principles:
1. Accuracy over speed. Use tools to verify before stating.
2. Cite file:line for every factual claim. Never invent paths or line numbers.
3. If tool results contradict each other, surface the contradiction.
4. If you cannot find an answer, say so plainly. Do not confabulate.
5. Be terse in your final answer. Lead with the conclusion, then show the evidence.`;

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

module.exports = {
  runReactLoop,
  parseToolCall,
  buildPrompt,
  DEFAULT_SYSTEM_PROMPT,
};
