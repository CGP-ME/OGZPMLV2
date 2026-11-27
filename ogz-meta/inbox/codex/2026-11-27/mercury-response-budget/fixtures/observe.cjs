'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
// The launcher omits .ignore files; restore the previously captured public policy
// only in this disposable fixture filesystem, never on the host.
const ignore = require('../../../2026-11-26/mercury-focused-request/fixtures/mercury-ignore.json');
assert.equal(hash(ignore.text), ignore.sha256);
fs.writeFileSync(path.join(root, 'mercury.ignore'), ignore.text);
const config = require(path.join(root, 'trai_brain/mercury-bridge/config'));
process.env[config.MERCURY_LLM_API_KEY_ENV] = 'synthetic-fixture-credential';
const { createMercuryLlmClient } = require(path.join(root, 'trai_brain/mercury-bridge/llm-client'));
const { runReactLoop } = require(path.join(root, 'trai_brain/mercury-bridge/react-loop'));
const { createExplicitContinuation } = require(path.join(root, 'trai_brain/mercury-bridge/explicit-continuation'));
const question = 'Scope: ownership of a queued candle. How does this fail or cost me money in production?';
const finalMessage = { role: 'assistant', content: 'VERDICT: cannot_verify\nWHY THIS VERDICT: Offline transport observation only.\nMISSING EVIDENCE: Actual source investigation and runtime behavior.' };
const reasoning = [{ type: 'reasoning.encrypted', data: 'synthetic-provider-state' }];
const toolMessage = { role: 'assistant', content: null, reasoning_details: reasoning,
  tool_calls: [{ id: 'fixture-tool', type: 'function', function: { name: 'read_fixture', arguments: '{}' } }] };
const toolAdapter = {
  buildToolSchema: () => [{ type: 'function', function: { name: 'read_fixture', description: 'Read synthetic evidence',
    parameters: { type: 'object', properties: {} } } }],
  execute: async name => { assert.equal(name, 'read_fixture'); return { evidence: 'synthetic source boundary' }; },
};
const reminder = messages => messages.filter(m => m.role === 'system' && m.content.startsWith('RESPONSE TOKEN BUDGET:'));

async function exercise(responses, options = {}) {
  const client = createMercuryLlmClient({ systemPrompt: config.AGENTIC_SYSTEM_PROMPT });
  const requests = [];
  client._httpRequestWithMetadata = async (url, method, body) => {
    assert.equal(url, config.MERCURY_LLM_BASE_URL + '/chat/completions');
    assert.equal(method, 'POST');
    requests.push(JSON.parse(JSON.stringify(body)));
    const response = responses[requests.length - 1];
    assert.ok(response, 'Unexpected extra provider dispatch');
    return { statusCode: 200, rawBody: Buffer.from(JSON.stringify({ model: 'mercury-3',
      choices: [{ message: response.message, finish_reason: response.finish }],
      usage: { prompt_tokens: 30, completion_tokens: 10,
        completion_tokens_details: { reasoning_tokens: response.finish === 'length' ? 10 : 2 } } })) };
  };
  const result = await runReactLoop({ client, toolAdapter, userQuery: question, ...options });
  for (const request of requests) {
    const budget = reminder(request.messages);
    assert.equal(budget.length, 1);
    assert.ok(budget[0].content.includes(`${request.max_tokens}-token allowance`));
    assert.ok(request.messages.some(m => m.role === 'user' && m.content === question));
    assert.equal(request.reasoning_effort, 'low');
    assert.equal(request.model, 'mercury-3');
  }
  return { requests, result };
}

async function main() {
  const ordinary = await exercise([{ message: toolMessage, finish: 'tool_calls' }, { message: finalMessage, finish: 'stop' }]);
  assert.equal(ordinary.requests.length, 2);
  assert.equal(ordinary.requests[0].max_tokens, 7750);
  assert.deepEqual(ordinary.requests[1].messages.find(m => m.role === 'assistant').reasoning_details, reasoning);
  assert.deepEqual(ordinary.requests[0].tools, ordinary.requests[1].tools);
  assert.equal(ordinary.result.iterationLimit, null);
  assert.equal(ordinary.result.termination, 'answer_given');
  assert.ok(ordinary.result.answer.includes('VERDICT: cannot_verify'));

  const configured = await exercise([{ message: finalMessage, finish: 'stop' }], { maxTokens: 1750 });
  assert.equal(configured.requests[0].max_tokens, 1750);
  const floor = await exercise([{ message: finalMessage, finish: 'stop' }], { maxTokens: 100 });
  assert.equal(floor.requests[0].max_tokens, config.MERCURY_LLM_CLIENT_MIN_TOKENS);
  const failed = await exercise([{ message: { role: 'assistant', content: null }, finish: 'length' }]);
  assert.equal(failed.requests.length, 1);
  assert.equal(failed.result.termination, 'error');
  assert.ok(!failed.result.answer.includes('VERDICT: no_break_found'));

  const contract = createExplicitContinuation({
    corpus: { corpus_sha256: 'synthetic-fixture', artifacts: [] }, reviewTargets: [],
    previous: { termination: 'not_started', iterations: 0, providerAttempts: [],
      candidateSet: { content: '', coverage: { unresolved: [] } },
      shardedReview: { map: [], candidates: [], synthesis_attempts: [], coverage: {} } },
    maxRequestBytes: 16000, originalQuery: question,
  });
  const fixed = ordinary.requests[0].messages;
  const initial = contract.prepare(fixed, [], { maxTokens: 7750 }, []);
  assert.ok(!initial.error);
  contract.acknowledge();
  const compacted = contract.prepare([...fixed, toolMessage,
    { role: 'tool', tool_call_id: 'fixture-tool', content: 'synthetic evidence '.repeat(2000) }], [], { maxTokens: 7750 }, []);
  assert.ok(!compacted.error);
  assert.equal(contract.receipt().archived_exchanges.length, 1);
  assert.deepEqual(reminder(compacted.messages), reminder(fixed));
  assert.ok(compacted.receipt.request_bytes <= compacted.receipt.max_request_bytes);

  console.log('OBSERVATION_JSON=' + JSON.stringify({
    realProviderCalls: 0,
    boundary: 'Actual Mercury config resolver, ReAct loop, provider request serializer and explicit continuation; synthetic HTTP responses and tool evidence.',
    sourceSha256: hash(fs.readFileSync(path.join(root, 'trai_brain/mercury-bridge/react-loop.js'))),
    reminder: reminder(fixed)[0].content,
    observedRequests: [ordinary, configured, floor, failed].map(({ requests, result }) => ({
      calls: requests.length, maxTokens: requests[0].max_tokens, reasoningEffort: requests[0].reasoning_effort,
      termination: result.termination, iterationLimit: result.iterationLimit })),
    continuation: { archivedExchanges: 1, reminderPreserved: true, requestBytes: compacted.receipt.request_bytes,
      requestLimitBytes: compacted.receipt.max_request_bytes },
    reasoningStatePreserved: true, truncationRemainsIncomplete: true,
  }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
