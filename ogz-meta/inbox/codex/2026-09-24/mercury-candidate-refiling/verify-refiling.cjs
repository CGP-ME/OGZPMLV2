'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
const bridge = path.join(root, 'trai_brain/mercury-bridge');
require(path.join(bridge, 'ask'));
const { runReactLoop } = require(path.join(bridge, 'react-loop'));
const { createToolAdapter } = require(path.join(bridge, 'tool-adapter'));
const { buildRunLedgerEntry } = require(path.join(bridge, 'run-ledger'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const call = (id, file) => ({ tool_calls: [{ id, type: 'function', function: {
  name: 'open_file', arguments: JSON.stringify({ path: file, start_line: 1, end_line: 15 }),
} }] });
async function main() {
  const candidates = [
    'CANDIDATE SET: examined 1 of 2\ntools/serena-bridge.js:1-15; another reader remains.',
    'CANDIDATE SET: examined 2 of 2\ntools/serena-bridge.js:1-15\ntrai_brain/mercury-bridge/run-ledger.js:1-15',
    'CANDIDATE SET: examined 2 of 2\nRevised alternatives: tools/serena-bridge.js:1-15 and trai_brain/mercury-bridge/run-ledger.js:1-15; keep both.',
  ];
  const final = 'VERDICT: cannot_verify\nADVERSARIAL_REVIEW_BLOCKING: yes\nOnly short ranges were examined: tools/serena-bridge.js:1-15 and trai_brain/mercury-bridge/run-ledger.js:1-15.';
  const responses = [call('one', 'tools/serena-bridge.js'), { content: candidates[0] },
    call('two', 'trai_brain/mercury-bridge/run-ledger.js'), { content: 'Premature decision before refiling.' },
    { content: candidates[1] }, { content: candidates[2] }, { content: final }];
  let cursor = 0;
  const prompts = [];
  const client = { generateWithTools: async messages => {
    prompts.push(messages.at(-1).content);
    if (cursor >= responses.length) throw new Error('Diagnostic response sequence exhausted');
    return responses[cursor++];
  } };
  const result = await runReactLoop({ client, toolAdapter: createToolAdapter({ repoRoot: root }),
    userQuery: 'Local candidate-state diagnostic; no provider review', maxTokens: 7750 });
  const ledger = buildRunLedgerEntry({ repoRoot: root, query: 'Local candidate-state diagnostic', result });
  const receipt = { observedAt: new Date().toISOString(), syntheticProvider: true, actualRepositoryTools: true,
    iterations: result.iterations, iterationLimit: result.iterationLimit, termination: result.termination,
    toolCalls: result.history.length, finalMatches: result.answer === final,
    revisionIterations: ledger.candidate_set.revisions.map(r => r.iteration),
    candidateRevisionsMatch: ledger.candidate_set.revisions.every((r, i) => r.content === candidates[i]),
    revisionRequiredAfterNewTools: prompts[3].includes('revised CANDIDATE SET'),
    prematureDecisionReturned: result.answer.includes('Premature decision'),
    sourceHashes: ['react-loop.js', 'run-ledger.js'].map(file => ({ file, sha256: sha(fs.readFileSync(path.join(bridge, file))) })),
    limitations: ['Deterministic state-transition execution, not proof a live model exhausts discovery.',
      'No added iteration ceiling; no provider, DB, bot, broker, PM2, Jest or reindex.'] };
  receipt.passed = result.iterations === 7 && result.iterationLimit === null && receipt.finalMatches
    && receipt.candidateRevisionsMatch && receipt.revisionIterations.join(',') === '2,5,6'
    && receipt.revisionRequiredAfterNewTools && !receipt.prematureDecisionReturned;
  fs.writeFileSync(path.join(__dirname, 'refiling-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt));
  if (!receipt.passed) process.exitCode = 1;
}
main().catch(error => { console.error(`${error.name}: ${error.message}`); process.exitCode = 1; });
