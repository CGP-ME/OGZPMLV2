'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const identity = JSON.parse(fs.readFileSync(path.join(packet, 'CANDIDATE.json')));
process.env.MERCURY_HARNESS_TREE = identity.harness;
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(packet, 'private/ledger'));
require('../../mercury-source-identity/fixtures/candidate-loader.cjs');
const query = 'Mercury, break my fix. Attack the isolated RSI confidence settings migration in the selected candidate against its baseline. Find a setting accepted by the new schema that fails to reach the retained RSI consumer correctly, changes unrelated behavior, or violates existing consumer requirements. Require exact source evidence for each finding. Numerical tuning and runtime activation are outside this migration.';
fs.writeFileSync(path.join(packet, 'private/review-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  reviewRef: identity.candidate, reviewBase: identity.base,
  maxTokens: 7750, reviewersExplicit: true, reviewers: 'mercury,fable,kimi',
}).then(result => {
  fs.writeFileSync(path.join(packet, 'private/review-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({answer: result.answer, termination: result.termination,
    run: result.runLedgerEntry?.run_id, verdict: result.runLedgerEntry?.verdict,
    consensusOk: result.consensus?.ok}, null, 2));
}).catch(error => { console.error(error.stack); process.exitCode = 1; });
