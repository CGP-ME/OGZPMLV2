'use strict';
// Run only with scripts/test-isolated.py. Captures actual prompt assembly;
// the provider is an observation seam, with no network or model judgment.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const baseline = process.argv.includes('--baseline');
if (baseline) fs.copyFileSync(path.join(__dirname, 'baseline-mercury-config.json'), 'mercury.config.json');
fs.writeFileSync('mercury.ignore', JSON.parse(fs.readFileSync(path.join(__dirname, 'ignore-contract.json'), 'utf8')));
const question = 'Scope: queued entry input ownership when another candle arrives before execution. How does this fail or cost me money in production? Cite the relevant producers and consumers.';
const phrase = 'How does this fail or cost me money in production?';
const pre = require(path.resolve('trai_brain/claude-bridge/pre-bash'));
const finish = require(path.resolve('trai_brain/claude-bridge/finish-gate'));
const { runReactLoop } = require(path.resolve('trai_brain/mercury-bridge/react-loop'));
const command = text => `node trai_brain/mercury-bridge/ask.js --agentic --attack --max-tokens=7750 ${JSON.stringify(text)}`;

async function main() {
  const hooks = {
    newQuestion: pre.mercuryFramingReason(command(question)),
    retiredQuestion: pre.mercuryFramingReason(command('Mercury, break my fix.')),
    prescribedApproval: pre.mercuryFramingReason(command('Report only no_break_found.')),
    unfinishedReviewAccepted: finish.isAdversarialMercuryProof({ mercury: { prompt: question, completed: false } }),
  };
  assert.equal(hooks.newQuestion, null);
  assert.equal(hooks.retiredQuestion, 'retired_generic_prompt');
  assert.equal(hooks.prescribedApproval, 'leading_question');
  assert.equal(hooks.unfinishedReviewAccepted, false);
  let captured, calls = 0;
  const result = await runReactLoop({
    client: { async generateWithTools(messages) {
      calls += 1;
      captured = structuredClone(messages);
      return { content: 'VERDICT: cannot_verify\nWHY THIS VERDICT: Request capture only; no source investigation.\nMISSING EVIDENCE: Production scenario investigation.\nWHAT I DID: Captured the assembled request.\nWHAT I DID NOT DO: Evaluate a production defect.\nWHAT I ASSUMED: none\nIF INCOMPLETE, WHY: Provider observation seam.' };
    } },
    toolAdapter: { buildToolSchema: () => [], execute: async () => { assert.fail('No tool call expected in request capture'); } },
    userQuery: question, attack: true, verbose: false,
  });
  const system = captured.filter(m => m.role === 'system').map(m => m.content).join('\n');
  assert.equal(system.includes(phrase), !baseline);
  assert(system.includes('Investigate the one question asked.'));
  assert(system.includes('Do not assume a defect exists or that a change is correct.'));
  assert(system.includes('Choose your own evidence path and assess relevant alternatives.'));
  assert(captured.some(m => m.role === 'user' && m.content === question));
  assert.equal(calls, 1);
  const digest = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'candidate', externalCalls: 0,
    actualRequestAssemblyCalls: calls, question, systemContainsProductionRiskQuestion: system.includes(phrase),
    existingIndependenceAndScopeInstructionsDelivered: true, userQuestionUnchanged: true, hooks,
    termination: result.termination, modelJudgment: 'not exercised; captured request only',
    sourceHashes: Object.fromEntries(['mercury.config.json', 'trai_brain/mercury-bridge/config.js',
      'trai_brain/mercury-bridge/react-loop.js', 'trai_brain/shared/mercury-question.js',
      'trai_brain/claude-bridge/pre-bash.js', 'trai_brain/claude-bridge/finish-gate.js'].map(f => [f, digest(f)])),
  }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
