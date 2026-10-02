'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'CANDIDATE.json')));
fs.mkdirSync(path.join(__dirname, 'private'), {recursive:true});
const configFile = path.join(__dirname, 'private/harness-mercury.config.json');
fs.writeFileSync(configFile, require('node:child_process').execFileSync('git', ['show', identity.harness + ':mercury.config.json'], {cwd:root}));
process.env.MERCURY_CONFIG_FILE = configFile;
process.env.MERCURY_HARNESS_TREE = identity.harness;
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(__dirname, 'private/ledger'));
require('../../2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs');
const query = 'Mercury, break my fix. The selected change removes the obsolete six-line exit-selector block in the runner constructor. Canonical settings do not supply exits.exitSystem; its sole active consumer calls toUpperCase on that absent value. Retire this dead selector without adding a replacement, changing exit policy, disabling real exit initialization, or changing unrelated configuration. Require current source evidence for any remaining reference, behavior regression or scope violation.';
fs.mkdirSync(path.join(__dirname, 'private'), {recursive:true});
fs.writeFileSync(path.join(__dirname, 'private/review-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  reviewRef: identity.candidate, reviewBase: identity.base,
  maxTokens: 7750, reviewersExplicit: true, reviewers: 'mercury',
}).then(result => {
  fs.writeFileSync(path.join(__dirname, 'private/review-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({termination:result.termination,run:result.runLedgerEntry?.run_id,verdict:result.runLedgerEntry?.verdict,consensusOk:result.consensus?.ok}));
}).catch(error => { console.error(error.stack); process.exitCode=1; });
