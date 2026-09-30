'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'CANDIDATE.json'), 'utf8'));
process.env.MERCURY_HARNESS_TREE = identity.harness;
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(__dirname, 'private/ledger'));
require('../../2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs');
const query = 'Mercury, break my fix. Operator-requested outcome: the adversarial panel owns reviewer conclusions; remove host-mandated candidate submission, schema-compliance retries, and whole-file-read acceptance while preserving honest source/call/failure receipts, substantive panel-requested rechecks, and bounded request transport. Preserve TRAI, the actual reviewer panel, the pipeline, and operator restrictions. Attack the complete selected change against that task; delivery of an answer is not certification of its correctness.';
fs.mkdirSync(path.join(__dirname, 'private'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'private/review-prompt.txt'), query);
require(path.join(root, 'trai_brain/mercury-bridge/ask')).runAgentic(query, {
  reviewRef: identity.candidate,
  reviewBase: identity.base,
  maxTokens: 7750,
  reviewersExplicit: true,
  reviewers: 'mercury,fable,kimi',
}).then(result => {
  fs.writeFileSync(path.join(__dirname, 'private/review-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ termination: result.termination, run: result.runLedgerEntry?.run_id,
    verdict: result.runLedgerEntry?.verdict, consensusOk: result.consensus?.ok }));
}).catch(error => { console.error(error.stack); process.exitCode = 1; });
