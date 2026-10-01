'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../../..');
const identity = JSON.parse(fs.readFileSync(path.join(__dirname, 'CANDIDATE.json'), 'utf8'));
process.env.MERCURY_HARNESS_TREE = identity.harness;
process.env.MERCURY_RUN_LEDGER_DIR = path.relative(root, path.join(__dirname, 'private/ledger'));
require('../../2026-09-29/mercury-source-identity/fixtures/candidate-loader.cjs');
const query = 'Mercury, break my fix. Complete the Stop1 configuration migration for the existing MADynamicSR baseConfidence, touchQualityWeight and maxConfidence controls: saved settings must reach initialized retained runner, symbol-context and orchestrator consumers on the next evaluation without resetting detector state; explicit injected configurations remain pinned. Trey authorized named rejection of invalid forced replacements before publication while retaining current valid settings. Correct the observed mismatch that allowed a replacement maxConfidence above the existing orchestrator zero-to-one confidence domain. Preserve the positive finite base/weight domain, existing configuration ownership and all unrelated work. Do not invent sizing calibration, defaults, strategy changes, shutdowns or new trading gates. Attack the complete selected change with current source evidence and report actual findings and limits.';
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
