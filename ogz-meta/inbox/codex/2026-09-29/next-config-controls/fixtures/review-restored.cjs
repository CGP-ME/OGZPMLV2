'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const identity = JSON.parse(fs.readFileSync(path.join(packet, 'CANDIDATE.json')));
process.env.MERCURY_HARNESS_TREE = identity.harness;
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(packet, 'private/ledger'));
require('../../mercury-source-identity/fixtures/candidate-loader.cjs');
let query = 'Mercury, break my fix. Attack the isolated RSI confidence settings migration in the selected candidate against its baseline. Find a setting accepted by the new schema that fails to reach the retained RSI consumer correctly, changes unrelated behavior, or violates existing consumer requirements. Require exact source evidence for each finding. Numerical tuning and runtime activation are outside this migration.';
const cp = require('node:child_process');
const evidenceSources = ['core/StrategyOrchestrator.js:416-450', 'core/StrategyOrchestrator.js:1840-1875'];
query += '\nFable requested the retained RSI consumer in the previous incomplete review. The following exact selected-tree source is supplied as additional evidence, not as a restriction on the audit. The previous run remains incomplete; assess this candidate independently.\n';
for (const descriptor of evidenceSources) {
  const [, file, start, end] = descriptor.match(/^(.*):(\d+)-(\d+)$/);
  const source = cp.execFileSync('git', ['show', identity.candidate + ':' + file], {cwd: root, encoding: 'utf8'});
  query += '\n' + descriptor + '\n' + source.split('\n').slice(Number(start)-1, Number(end)).join('\n') + '\n';
}
fs.writeFileSync(path.join(packet, 'private/restored-review-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  reviewRef: identity.candidate, reviewBase: identity.base, evidenceSources,
  maxTokens: 7750, reviewersExplicit: true, reviewers: JSON.parse(fs.readFileSync(path.join(packet, 'private/kimi-restoration.json'))).ok ? 'mercury,fable,kimi' : 'mercury,fable',
}).then(result => {
  fs.writeFileSync(path.join(packet, 'private/restored-review-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({answer: result.answer, termination: result.termination,
    run: result.runLedgerEntry?.run_id, verdict: result.runLedgerEntry?.verdict,
    consensusOk: result.consensus?.ok}, null, 2));
}).catch(error => { console.error(error.stack); process.exitCode = 1; });
