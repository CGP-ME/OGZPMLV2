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

const DEFAULT_SYSTEM_PROMPT = `You are a code review and architecture assistant for the OGZPrime algorithmic trading platform, a Node.js codebase.

Your job is to answer the user's question accurately with file:line citations, using the tools provided.

You have access to tools (grep, open_file, get_chunk, list_files) for gathering evidence from the codebase. Use them deliberately, not exhaustively.

STOPPING DISCIPLINE:
- Tools are for gathering evidence you don't already have, NOT for cross-checking evidence you already gathered.
- After each tool call, ask yourself: "Do I now have enough to answer the user's question with specific file:line citations?" If yes, STOP CALLING TOOLS and write your final answer immediately.
- If starter context already contains a direct answer (e.g. a fix_history record for a historical bug query), cite it and answer. Do not re-verify via tools unless starter context is clearly insufficient.
- Budget: aim to answer within 4-6 tool calls. If you are on call 7+, you should be synthesizing, not searching.

ANSWER FORMAT:
- Lead with the direct answer to the user's question.
- Cite file:line for every factual claim. Never invent paths or line numbers.
- Do not recap your search process — the user cares about the answer, not the path you took.
- If you cannot answer with available evidence, say so explicitly and list what you were unable to find.`;

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
 *   maxIterations: number (default 10)
 *   maxTokens: number (default 2000)
 *   verbose: boolean — log iteration progress to stderr
 *
 * returns: {answer, iterations, termination, history}
 */
async function runReactLoop(params) {
  const {
    client,
    toolAdapter,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    userQuery,
    starterContext = [],
    maxIterations = 10,
    maxTokens = 2000,
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

  messages.push({ role: 'user', content: userQuery });

  const history = [];
  const SYNTHESIS_NUDGE_THRESHOLD = parseInt(process.env.SYNTHESIS_NUDGE_THRESHOLD || '6', 10);
  let nudgeFired = false;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (verbose) {
      console.error(`[REACT] Iteration ${iteration}/${maxIterations}`);
      console.error(`[REACT] Message history: ${messages.length} messages`);
    }

    // Synthesis nudge: after N tool-calling iterations, tell Mercury to stop and answer
    if (iteration === SYNTHESIS_NUDGE_THRESHOLD && !nudgeFired) {
      nudgeFired = true;
      messages.push({
        role: 'user',
        content: `You have gathered substantial evidence through ${iteration - 1} tool calls. Review what you have and provide your final answer now with file:line citations. If critical evidence is missing, name exactly what is missing and answer with the evidence you have. Do not call more tools unless absolutely necessary.`,
      });
      if (verbose) console.error(`[REACT] Synthesis nudge injected at iteration ${iteration}`);
    }

    // After synthesis nudge, force Mercury to answer (no more tool calls)
    const effectiveToolChoice = nudgeFired ? 'none' : 'auto';

    let assistantMsg;
    try {
      assistantMsg = await callMercuryWithRetry(
        client,
        messages,
        tools,
        { maxTokens, toolChoice: effectiveToolChoice },
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

module.exports = {
  runReactLoop,
  callMercuryWithRetry,
  DEFAULT_SYSTEM_PROMPT,
};
