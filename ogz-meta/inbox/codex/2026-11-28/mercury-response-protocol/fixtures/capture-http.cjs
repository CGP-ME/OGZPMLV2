'use strict';

require('../../../../../../test/helpers/require-isolation.cjs')();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const root = process.cwd();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const verifyPreload = process.argv.includes('--verify-request-capture');
const ignore = require('./mercury-ignore.json');
assert.equal(hash(ignore.text), ignore.sha256);
// Only the launcher's disposable filesystem receives this public policy.
fs.writeFileSync(path.join(root, 'mercury.ignore'), ignore.text);

const captures = [];
const originalHttpsRequest = https.request;
const originalHttpRequest = http.request;
const syntheticCredential = 'synthetic-protocol-fixture-only';
const nativeAssistant = {
  role: 'assistant',
  content: 'Synthetic native investigation.\n\n<',
  tool_call_id: null,
  reasoning_details: [{ type: 'reasoning.encrypted', data: 'synthetic-opaque-state' }],
  tool_calls: [
    { id: 'fixture_native_a', type: 'function', function: {
      name: 'grep', arguments: JSON.stringify({ query: 'synthetic marker α', file_pattern: '*.js' }),
    } },
    { id: 'fixture_native_b', type: 'function', function: {
      name: 'regex_grep', arguments: JSON.stringify({ query: 'synthetic.*marker', file_pattern: '*.js', limit: 2 }),
    } },
  ],
};
const finalAssistant = {
  role: 'assistant',
  content: 'Synthetic non-native response: <|inc_tool_call_ml|invoke name="grep">fixture</|inc_tool_call_ml|invoke>',
  tool_calls: null,
  tool_call_id: null,
  reasoning_details: [{ type: 'reasoning.encrypted', data: 'synthetic-final-state' }],
};

// Substitute only the network boundary. Production request-body construction,
// JSON.stringify, req.write and response parsing remain active.
https.request = (options, callback) => {
  const req = new EventEmitter();
  req.once('response', callback);
  const writes = [];
  req.write = chunk => { writes.push(Buffer.from(chunk)); return true; };
  req.destroy = () => { req.destroyed = true; };
  req.end = () => {
    const wire = Buffer.concat(writes);
    const index = captures.length;
    assert.ok(index < 2, 'Unexpected extra transport request');
    captures.push({ options, wire });
    queueMicrotask(() => {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.headers = { 'content-type': 'application/json' };
      req.emit('response', res);
      res.emit('data', Buffer.from(JSON.stringify({
        model: 'mercury-3',
        choices: [{ message: index === 0 ? nativeAssistant : finalAssistant,
          finish_reason: index === 0 ? 'tool_calls' : 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70,
          completion_tokens_details: { reasoning_tokens: 5 } },
      })));
      res.emit('end');
    });
  };
  return req;
};
http.request = () => { assert.fail('Unexpected HTTP transport'); };

async function main() {
  const preload = verifyPreload ? require('./request-capture-preload.cjs') : null;
  const config = require(path.join(root, 'trai_brain/mercury-bridge/config'));
  process.env[config.MERCURY_LLM_API_KEY_ENV] = syntheticCredential;
  const { createMercuryLlmClient } = require(path.join(root, 'trai_brain/mercury-bridge/llm-client'));
  const { runReactLoop } = require(path.join(root, 'trai_brain/mercury-bridge/react-loop'));
  const { createToolAdapter } = require(path.join(root, 'trai_brain/mercury-bridge/tool-adapter'));
  const { createExplicitContinuation } = require(path.join(root, 'trai_brain/mercury-bridge/explicit-continuation'));
  const { serializeProviderRequest } = require(path.join(root, 'trai_brain/mercury-bridge/evidence-ingestion'));
  const nativeTools = createToolAdapter({ repoRoot: root });
  const schema = nativeTools.buildToolSchema();
  const executions = [];
  const toolAdapter = {
    buildToolSchema: () => nativeTools.buildToolSchema(),
    execute: async (name, args) => {
      executions.push({ name, args });
      return { source: 'synthetic_fixture', total: 1, truncated: false,
        matches: [{ file: 'synthetic.js', line: 1, text: 'synthetic marker α' }] };
    },
  };
  const question = 'Inspect only the synthetic native-tool exchange. No repository finding is requested.';
  const contract = createExplicitContinuation({
    corpus: { corpus_sha256: hash('synthetic-empty-corpus'), artifacts: [] },
    reviewTargets: [],
    previous: { termination: 'not_started', iterations: 0, providerAttempts: [],
      candidateSet: { content: '', coverage: { unresolved: [] } },
      shardedReview: { map: [], candidates: [], synthesis_attempts: [], coverage: {} } },
    maxRequestBytes: config.AGENTIC_EXPLICIT_REVIEW_REQUEST_MAX_BYTES,
    originalQuery: question,
  });
  const client = createMercuryLlmClient({ systemPrompt: config.AGENTIC_SYSTEM_PROMPT });
  const providerAudit = verifyPreload
    ? require(path.join(root, 'trai_brain/mercury-bridge/ask')).createProviderAudit('synthetic_native_source', {
      repoRoot: root, rawRunId: 'synthetic-request-capture',
    }) : null;
  const result = await runReactLoop({
    client, toolAdapter, userQuery: question, explicitReviewContract: contract,
    maxIterations: null, maxTokens: 7750, providerAudit,
  });
  assert.equal(captures.length, 2);
  assert.equal(executions.length, 2);
  assert.deepEqual(executions, nativeAssistant.tool_calls.map(call => ({
    name: call.function.name, args: JSON.parse(call.function.arguments),
  })));
  const requests = captures.map(capture => JSON.parse(capture.wire.toString('utf8')));
  const receipt = contract.receipt();
  assert.equal(receipt.requests.length, 2);
  assert.equal(receipt.archived_exchanges.length, 0);
  for (const [index, request] of requests.entries()) {
    const capture = captures[index];
    assert.equal(capture.options.hostname, 'api.inceptionlabs.ai');
    assert.equal(capture.options.path, '/v1/chat/completions');
    assert.equal(capture.options.method, 'POST');
    assert.equal(capture.options.headers['Content-Type'], 'application/json');
    assert.equal(capture.options.headers.Authorization, 'Bearer ' + syntheticCredential);
    assert.equal(request.model, 'mercury-3');
    assert.equal(request.reasoning_effort, 'low');
    assert.equal(request.max_tokens, 7750);
    assert.equal(request.temperature, config.MERCURY_LLM_TEMPERATURE);
    assert.equal(request.tool_choice, 'auto');
    assert.equal(Object.hasOwn(request, 'options'), false);
    assert.equal(capture.wire.toString('utf8').includes(syntheticCredential), false);
    assert.deepEqual(request.tools, [...schema, contract.receiptTool]);
    assert.equal(new Set(request.tools.map(tool => tool.function.name)).size, request.tools.length);
    for (const tool of request.tools) {
      assert.equal(tool.type, 'function');
      assert.equal(typeof tool.function.name, 'string');
      assert.equal(tool.function.parameters.type, 'object');
      for (const field of tool.function.parameters.required || []) {
        assert.ok(Object.hasOwn(tool.function.parameters.properties, field));
      }
    }
    const envelope = serializeProviderRequest(request.messages, request.tools, {
      maxTokens: 7750, toolChoice: 'auto', temperature: config.MERCURY_LLM_TEMPERATURE,
    });
    assert.equal(hash(envelope), receipt.requests[index].request_sha256);
    assert.notEqual(hash(capture.wire), receipt.requests[index].request_sha256);
  }
  const history = requests[1].messages.slice(-3);
  assert.deepEqual(history[0], nativeAssistant);
  assert.deepEqual(history.slice(1).map(message => ({
    role: message.role, tool_call_id: message.tool_call_id,
  })), nativeAssistant.tool_calls.map(call => ({ role: 'tool', tool_call_id: call.id })));
  for (const message of history.slice(1)) {
    assert.equal(JSON.parse(message.content).source, 'synthetic_fixture');
  }
  assert.equal(result.iterationLimit, null);
  assert.equal(result.termination, 'answer_given');
  assert.equal(result.answer, finalAssistant.content);
  assert.equal(result.history.length, 2);
  assert.equal(requests[1].messages.some(message =>
    typeof message.content === 'string' && message.content.includes('inc_tool_call')), false);

  const sourceFiles = [
    'core/persistent_llm_client.js',
    'trai_brain/mercury-bridge/llm-client.js',
    'trai_brain/mercury-bridge/config.js',
    'trai_brain/mercury-bridge/react-loop.js',
    'trai_brain/mercury-bridge/explicit-continuation.js',
    'trai_brain/mercury-bridge/evidence-ingestion.js',
    'trai_brain/mercury-bridge/tool-adapter.js',
    'mercury.config.json', 'mercury.ignore', 'config/internals.json',
  ];
  if (verifyPreload) {
    const events = fs.readFileSync(path.join(preload.directory, 'events.jsonl'), 'utf8')
      .trim().split('\n').map(line => JSON.parse(line));
    assert.equal(fs.statSync(preload.directory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.dirname(preload.directory)).mode & 0o777, 0o700);
    assert.equal(events.filter(entry => entry.event === 'request_started').length, captures.length);
    assert.equal(providerAudit.attempts.length, captures.length);
    for (const [index, capture] of captures.entries()) {
      const ordinal = index + 1;
      const saved = events.find(entry => entry.event === 'request_end_called' && entry.ordinal === ordinal);
      assert.ok(saved);
      const body = fs.readFileSync(path.join(preload.directory, saved.body_file));
      assert.deepEqual(body, capture.wire);
      assert.equal(saved.body_sha256, hash(capture.wire));
      assert.equal(saved.body_bytes, capture.wire.length);
      const response = events.find(entry => entry.event === 'response_ended' && entry.ordinal === ordinal);
      const rawReceipt = providerAudit.attempts[index].raw_output;
      assert.ok(response);
      assert.equal(response.response_sha256, rawReceipt.sha256);
      assert.equal(response.response_bytes, rawReceipt.bytes);
      assert.equal(response.status_code, providerAudit.attempts[index].status_code);
      assert.equal(hash(fs.readFileSync(path.join(root, rawReceipt.path))), response.response_sha256);
      assert.equal(fs.statSync(path.join(root, rawReceipt.path)).mode & 0o777, 0o600);
    }
    for (const name of fs.readdirSync(preload.directory)) {
      const file = path.join(preload.directory, name);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      const text = fs.readFileSync(file, 'utf8');
      assert.equal(text.includes(syntheticCredential), false);
      assert.equal(text.includes('Authorization'), false);
    }
    console.log('REQUEST_CAPTURE_OBSERVATION_JSON=' + JSON.stringify({
      synthetic: true, externalNetworkCalls: 0, realProviderCalls: 0,
      fixtureSha256: hash(fs.readFileSync(__filename)),
      preloadSha256: hash(fs.readFileSync(path.join(__dirname, 'request-capture-preload.cjs'))),
      sourceHashes: Object.fromEntries([...sourceFiles, 'trai_brain/mercury-bridge/ask.js',
        'trai_brain/mercury-bridge/run-ledger.js'].map(file => [file, hash(fs.readFileSync(path.join(root, file)))])),
      requests: captures.map((capture, index) => ({ ordinal: index + 1,
        bytes: capture.wire.length, sha256: hash(capture.wire),
        rawResponseSha256: providerAudit.attempts[index].raw_output.sha256 })),
      assertions: { actualClientBytesPreserved: true, nativeHistoryPreserved: true,
        existingRawAuditPreservedAndMatched: true, privateFiles0600: true,
        privateDirectories0700: true, noCredentialOrAuthorizationHeaderCaptured: true,
        noRequestBodiesPrinted: true },
      limitations: ['Synthetic transport only; no provider/TLS/server behavior exercised.',
        'Capture records client write/end bytes, not proof of remote receipt.',
        'No historical request10 reconstruction or Mercury review clearance.'],
    }));
    return;
  }
  console.log('SERIALIZATION_OBSERVATION_JSON=' + JSON.stringify({
    synthetic: true, externalNetworkCalls: 0, realProviderCalls: 0,
    boundary: 'Real config resolver, tool schema builder, ReAct native history, explicit continuation, PersistentLLMClient and HTTPS JSON writer; substituted https.request response stream and tool execution.',
    sourceHashes: Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(path.join(root, file)))])),
    fixtureSha256: hash(fs.readFileSync(__filename)),
    requests: captures.map((capture, index) => ({
      ordinal: index + 1, method: capture.options.method,
      host: capture.options.hostname, path: capture.options.path,
      headerNames: Object.keys(capture.options.headers), authorizationIsSynthetic: true,
      wireBytes: capture.wire.length, wireSha256: hash(capture.wire),
      internalEnvelopeBytes: receipt.requests[index].request_bytes,
      internalEnvelopeSha256: receipt.requests[index].request_sha256,
      tools: requests[index].tools.map(tool => tool.function.name),
      messageRoles: requests[index].messages.map(message => message.role),
      serializedBodyUtf8: capture.wire.toString('utf8'),
    })),
    assertions: {
      nativeSchemaPreserved: true, assistantMessagePreservedExactly: true,
      opaqueReasoningDetailsPreserved: true, parallelToolResultIdsMatched: true,
      unicodeAndArgumentStringsPreserved: true, realJsonWriterCaptured: true,
      internalEnvelopeHashDiffersFromWireBody: true,
      priorAssistantTrailingLessThanPreserved: true, noHistoryArchival: true,
      syntheticFinalMarkupNotExecuted: true,
    },
    syntheticResult: { iterations: result.iterations, termination: result.termination,
      toolExecutions: executions.length, returnedText: result.answer },
    limitations: [
      'Two synthetic transport requests, not historical request10 or a paid provider response.',
      'Historical exact prepared messages and outgoing HTTP bytes were not retained; this cannot reconstruct their full content.',
      'Schema checks cover native structural shape and preservation, not exhaustive provider JSON Schema acceptance.',
      'No provider tokenization, prompt-sensitivity, tool selection, server-side parsing, TLS, socket or chunked-transfer behavior was exercised.',
      'Synthetic final inc_tool_call text was supplied deliberately by the fake response; this does not reproduce or identify its historical cause.',
      'No Mercury clearance or trading-runtime verification is implied.',
    ],
  }));
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; })
  .finally(() => { https.request = originalHttpsRequest; http.request = originalHttpRequest; });

