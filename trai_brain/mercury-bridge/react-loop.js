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
 *   additionalSystemContext: string — extra system context supplied by caller (optional)
 *   requireToolUseBeforeAnswer: boolean — fail closed if Mercury answers before
 *     using repo tools (used for break-my-fix acceptance gates)
 *   reviewFiles: repo-relative files in the dirty diff under review. This does
 *     not restrict tools; it only rejects off-target final answers.
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
    additionalSystemContext = null,
    requireToolUseBeforeAnswer = false,
    reviewFiles = [],
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

  if (additionalSystemContext) {
    messages.push({
      role: 'system',
      content: additionalSystemContext,
    });
  }

  messages.push({ role: 'user', content: userQuery });

  const history = [];
  let requiredToolUseReprompted = false;
  let offTargetReprompted = false;

  const normalizedReviewFiles = Array.isArray(reviewFiles)
    ? reviewFiles.map((file) => String(file).trim()).filter(Boolean)
    : [];

  function answerMentionsReviewFile(answer) {
    if (normalizedReviewFiles.length === 0) return true;
    const text = String(answer || '');
    return normalizedReviewFiles.some((file) => text.includes(file));
  }

  function isMetaBreakMyFixAnswer(answer) {
    return /how to invoke break-my-fix|how to invoke break my fix|prepend the exact phrase|routing is triggered|describe routing behavior|routed as|queryType|starter-context policy|starter context policy|boostType|system will treat it as/i
      .test(String(answer || ''));
  }

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
    const finalAnswer = assistantMsg.content || '(empty content)';
    if (requireToolUseBeforeAnswer && history.length === 0) {
      if (!requiredToolUseReprompted) {
        requiredToolUseReprompted = true;
        if (verbose) console.error('[REACT] Refusing zero-tool break-my-fix answer; requiring repo-tool evidence');
        messages.push({
          role: 'user',
          content: [
            'This is a break-my-fix gate. You must use the available repo tools before answering.',
            'You are running the attack now; do not explain how to invoke break-my-fix or describe routing behavior as the answer.',
            'The fix under review is the supplied dirty diff context; use full repo tools to inspect sibling failures, bypass paths, and existing mitigations connected to that diff.',
            'Do not ask the user to paste code that the bridge already supplied or that repo tools can inspect.',
            'Final answer must be concrete breakage with evidence, or no concrete breakage found after tool inspection.',
          ].join(' '),
        });
        continue;
      }

      if (verbose) console.error('[REACT] Break-my-fix refused to use repo tools; failing closed');
      return {
        answer: 'Break-my-fix failed closed: Mercury answered without using repo tools, so no adversarial evidence was produced.',
        iterations: iteration,
        termination: 'no_tool_evidence',
        history,
      };
    }

    if (
      requireToolUseBeforeAnswer
      && (!answerMentionsReviewFile(finalAnswer) || isMetaBreakMyFixAnswer(finalAnswer))
    ) {
      if (!offTargetReprompted) {
        offTargetReprompted = true;
        if (verbose) console.error('[REACT] Refusing off-target break-my-fix answer; requiring dirty-diff verdict');
        messages.push({
          role: 'user',
          content: [
            'That answer is off target for this break-my-fix gate.',
            normalizedReviewFiles.length > 0
              ? `The dirty diff under review includes: ${normalizedReviewFiles.join(', ')}.`
              : 'The dirty diff context supplied by the bridge is the review target.',
            'Use full repo tools as needed, but the final verdict must break or clear the current dirty diff and cite the relevant reviewed file path.',
            'Do not answer with instructions about how to invoke break-my-fix or unrelated repository findings.',
          ].join(' '),
        });
        continue;
      }

      if (verbose) console.error('[REACT] Break-my-fix stayed off target; failing closed');
      return {
        answer: 'Break-my-fix failed closed: Mercury final answer did not address the dirty diff under review.',
        iterations: iteration,
        termination: 'off_target_answer',
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
  AGENTIC_SYSTEM_PROMPT: config.AGENTIC_SYSTEM_PROMPT,
};
