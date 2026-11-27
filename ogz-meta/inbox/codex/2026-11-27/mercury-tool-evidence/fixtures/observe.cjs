'use strict';

require('../../../../../../test/helpers/require-isolation.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const root = process.cwd();
const ignore = require('../../../2026-11-26/mercury-focused-request/fixtures/mercury-ignore.json');
assert.equal(hash(ignore.text), ignore.sha256);
fs.writeFileSync(path.join(root, 'mercury.ignore'), ignore.text);
const { createToolAdapter } = require(path.join(root, 'trai_brain/mercury-bridge/tool-adapter'));
const { assessFinalAnswerQuality, runReactLoop } = require(path.join(root, 'trai_brain/mercury-bridge/react-loop'));
const config = require(path.join(root, 'trai_brain/mercury-bridge/config'));
const repaired = process.argv[2] === 'after';
const sample = path.join(__dirname, 'sample-repo');
fs.mkdirSync(sample, { recursive: true });
fs.writeFileSync(path.join(sample, 'leaf.js'), 'module.exports = {};\n');
fs.writeFileSync(path.join(sample, 'caller.js'), [
  "// require('./leaf'); service.execute();",
  'const service = { execute() { return 1; } };',
  "const description = 'service.execute()';",
  'service.execute();',
  '',
].join('\n'));
const adapter = createToolAdapter({ repoRoot: sample });
const answer = 'VERDICT: cannot_verify\nWHY THIS VERDICT: caller.js:2 defines execute, but it is unused.\nMISSING EVIDENCE: Call-site ownership remains unknown.';
const inputs = [
  ['find_definition', { symbol: 'execute', file: 'caller.js' }],
  ['find_references', { symbol: 'execute', file: 'caller.js' }],
  ['serena_blast_radius', { path: 'leaf.js' }],
  ['serena_method_callers', { method: 'execute', scope: 'caller.js' }],
];

async function main() {
  const observations = [];
  for (const [toolName, args] of inputs) {
    const result = await adapter.execute(toolName, args);
    assert.ok(!result.error, JSON.stringify(result));
    const quality = assessFinalAnswerQuality(answer, [{ toolName, toolArgs: args, toolResult: result }]);
    const flagged = quality.flags.includes('unsupported_reference_claim');
    assert.equal(flagged, repaired && toolName !== 'serena_method_callers');
    if (toolName === 'serena_blast_radius') {
      assert.equal(result.callerCount, 1, 'The regex dependency scanner matches the comment');
      if (repaired) assert.equal(result.precision, 'regex');
    }
    if (toolName === 'serena_method_callers') assert.equal(result.total, 1, 'AST caller scan excludes comments and strings');
    observations.push({ tool: toolName, source: result.source, precision: result.precision || null,
      matches: result.total ?? result.callerCount, answerQuality: quality });
  }
  const failed = assessFinalAnswerQuality(answer, [{ toolName: 'serena_method_callers', toolResult: { error: 'fixture scanner unavailable' } }]);
  assert.ok(failed.flags.includes('unsupported_reference_claim'));
  const absent = assessFinalAnswerQuality(answer, [{ toolName: 'serena_method_callers' }]);
  assert.equal(absent.flags.includes('unsupported_reference_claim'), repaired);
  const requests = [];
  const client = { systemPrompt: config.AGENTIC_SYSTEM_PROMPT, maxTokens: 7750, minimumTokens: 400,
    async generateWithTools(messages, tools, options) {
      requests.push(JSON.parse(JSON.stringify({ messages, tools, options })));
      if (requests.length === 1) return { role: 'assistant', content: null, tool_calls: [{ id: 'fixture-reference',
        type: 'function', function: { name: 'find_references', arguments: JSON.stringify({ symbol: 'execute', file: 'caller.js' }) } }] };
      assert.equal(requests.length, 2, 'No automatic retry or answer suppression');
      return { role: 'assistant', content: answer };
    },
  };
  const loop = await runReactLoop({ client, toolAdapter: adapter, userQuery: 'Which callers invoke execute?', maxTokens: 7750 });
  assert.equal(loop.answer, answer);
  assert.equal(loop.termination, 'answer_given');
  assert.equal(loop.iterationLimit, null);
  assert.equal(loop.answerQuality.flags.includes('unsupported_reference_claim'), repaired);
  assert.ok(requests[0].tools.some(t => t.function.name === 'find_references'));
  assert.ok(requests[0].tools.some(t => t.function.name === 'serena_method_callers'));
  if (repaired) assert.ok(requests[0].messages[0].content.includes('Regex results are leads, not AST evidence'));
  console.log('OBSERVATION_JSON=' + JSON.stringify({ mode: process.argv[2], observations,
    failedAstFlagged: failed.flags, absentAstFlagged: absent.flags, returnedAnswerUnchanged: loop.answer === answer,
    loopFlags: loop.answerQuality.flags, providerCalls: requests.length, iterationLimit: loop.iterationLimit,
    files: Object.fromEntries(['mercury.config.json', 'trai_brain/mercury-bridge/react-loop.js',
      'trai_brain/mercury-bridge/tool-adapter.js'].map(f => [f, hash(fs.readFileSync(path.join(root, f)))])),
    limitations: 'Synthetic source and provider answers through real tools and loop; no live model or trading proof.' }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
