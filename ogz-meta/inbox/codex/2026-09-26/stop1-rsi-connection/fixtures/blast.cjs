'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../../../..');
const packet = path.resolve(__dirname, '..');
const clone = path.join(root, 'ogz-meta/inbox/codex/2026-09-26/mercury-exit-receipt/private/cold-pull-5gJPFK');
const { getBlastRadius } = require(path.join(clone, 'tools/serena-bridge'));
const { scanRepo } = require(path.join(clone, 'tools/serena-symbol-scanner'));
(async () => {
  const scan = scanRepo(clone);
  const receipt = { at: new Date().toISOString(), boundary: 'Existing Mercury dependency and Serena AST tooling; static candidates, not execution completeness',
    filesScanned: scan.filesScanned, filesParsed: scan.filesParsed, parsers: scan.parsers, errors: scan.errors, fileReceipts: scan.fileReceipts,
    references: scan.propertyRefs.filter(row => ['rsiPeriod','rsiExitLong','exitAbove','exitContractHint'].includes(row.property)),
    callers: scan.methodCalls.filter(row => ['createExitContract','getDefaultContract','checkInvalidationConditions'].includes(row.method)),
    blast: await Promise.all(['core/StrategyOrchestrator.js','core/ExitContractManager.js'].map(file => getBlastRadius(file))) };
  const out = path.join(packet, 'private/blast.json');
  const bytes = JSON.stringify(receipt, null, 2) + '\n'; fs.writeFileSync(out, bytes, {flag:'wx',mode:0o600});
  console.log(JSON.stringify({receipt:path.relative(root,out),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
    filesScanned:receipt.filesScanned,filesParsed:receipt.filesParsed,errors:receipt.errors,references:receipt.references.length,callers:receipt.callers.length,
    blast:receipt.blast.map(x=>({file:x.file,callers:x.callerCount,truncated:x.truncated}))}));
})();
