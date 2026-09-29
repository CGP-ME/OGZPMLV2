'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const identity = JSON.parse(fs.readFileSync(path.join(packet, 'CANDIDATE.json')));
process.env.MERCURY_HARNESS_TREE = identity.harness;
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(packet, 'private/ledger'));
require('../../mercury-source-identity/fixtures/candidate-loader.cjs');
const query = 'Mercury, break my fix. Attack the EMA crossover confidence settings migration in the selected candidate against its baseline. Find an accepted edit or forced replacement that fails to reach every retained production consumer, corrupts accumulated state or configuration ownership, breaks existing numeric coercion, or violates existing consumer bounds. Trey explicitly authorized rejection of invalid forced replacements before publication, with a named error while the bot keeps its current valid settings; no new throw or bot shutdown is authorized. Require exact producer/consumer source evidence. Numerical tuning and runtime activation are outside this migration.';
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
