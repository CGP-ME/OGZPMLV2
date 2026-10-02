'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'CANDIDATE.json')));
process.env.MERCURY_HARNESS_TREE = identity.harness;
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(__dirname, 'private/ledger'));
require('../../2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs');
const query = 'Mercury, break my fix. The selected change exposes the existing RSI2MeanReversion confidenceBase, confidenceDepthMultiplier and maxConfidence controls through the existing settings publication path. Existing registered consumers must adopt saved values on their next evaluation without replacing retained instances, changing strategy math or altering explicitly injected configurations. Preserve existing numeric domains, Number-compatible forced replacement and maxConfidence >= confidenceBase relation. Trey authorized explicit rejection of invalid forced replacements while retaining current valid settings. Require current source evidence for findings.';
fs.mkdirSync(path.join(__dirname, 'private'), {recursive:true});
fs.writeFileSync(path.join(__dirname, 'private/review-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  reviewRef: identity.candidate, reviewBase: identity.base,
  maxTokens: 7750, reviewersExplicit: true, reviewers: 'mercury,kimi',
}).then(result => {
  fs.writeFileSync(path.join(__dirname, 'private/review-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({termination:result.termination,run:result.runLedgerEntry?.run_id,verdict:result.runLedgerEntry?.verdict,consensusOk:result.consensus?.ok}));
}).catch(error => { console.error(error.stack); process.exitCode=1; });
