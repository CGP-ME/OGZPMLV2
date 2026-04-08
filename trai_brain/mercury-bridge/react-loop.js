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

Your job is to answer the user's question about the codebase accurately, with file:line citations for every factual claim, using the tools provided.

You can iteratively call tools to search the repo, open files, and verify ground truth. Starter context (if provided) comes from initial RAG retrieval and may surface documentation instead of actual code. Trust tool results over starter context when they disagree.

Core principles:
1. Accuracy over speed. Use tools to verify before stating.
2. Cite file:line for every factual claim. Never invent paths or line numbers.
3. Before citing a specific line in your final answer, open a narrow range (5-10 lines) around that line with open_file to confirm the claim is in the visible text. Do not cite from grep snippets alone.
4. If tool results contradict each other, surface the contradiction.
5. If you cannot find an answer after reasonable tool use, say so plainly. Do not confabulate.
6. Be terse in your final answer. Lead with the conclusion, then show the evidence.`;

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
        { maxTokens, toolChoice: 'auto' },
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
