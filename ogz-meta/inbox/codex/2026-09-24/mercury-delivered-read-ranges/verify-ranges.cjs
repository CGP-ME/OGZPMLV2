'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '../../../../..');
const bridge = path.join(root, 'trai_brain/mercury-bridge');
require(path.join(bridge, 'ask'));
const { createToolAdapter } = require(path.join(bridge, 'tool-adapter'));
const { serializeToolResultForHistory, summarizeToolTelemetry } = require(path.join(bridge, 'react-loop'));
const { buildRunLedgerEntry } = require(path.join(bridge, 'run-ledger'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const adapter = createToolAdapter({ repoRoot: root });
  const cases = [];
  for (const [tool, args] of [
    ['open_file', { path: 'foundation/ConfigLoader.js', start_line: 1, end_line: 500 }],
    ['git_show', { ref: 'HEAD', path: 'foundation/ConfigLoader.js', start_line: 1, end_line: 500 }],
    ['open_file', { path: 'tools/serena-bridge.js', start_line: 1, end_line: 15 }],
  ]) {
    const result = await adapter.execute(tool, args);
    if (result.error) throw new Error(result.error);
    const serialized = serializeToolResultForHistory(tool, result);
    const delivered = JSON.parse(serialized.content);
    const entry = { iteration: 1, toolName: tool, toolArgs: args, toolResult: result, toolDelivery: serialized.delivery };
    const telemetry = summarizeToolTelemetry([entry]);
    const ledger = buildRunLedgerEntry({ repoRoot: root, query: 'Local delivered-range diagnostic', result: { toolTelemetry: telemetry } });
    const claimed = ledger.file_reads[0];
    const exactText = result.text.split('\n').slice(0, delivered.end_line - delivered.start_line + 1).join('\n');
    const legacy = summarizeToolTelemetry([{ ...entry, toolDelivery: undefined }]);
    cases.push({ tool, args, rawChars: JSON.stringify(result).length, deliveredChars: serialized.content.length,
      delivery: serialized.delivery, readReceipt: claimed,
      deliveredContentHash: sha(delivered.text), sourcePrefixHash: sha(exactText),
      legacyReadCount: legacy.fileReads.length,
      matches: claimed.startLine === delivered.start_line && claimed.endLine === delivered.end_line
        && delivered.text === exactText && serialized.content.length <= 12000
        && (serialized.delivery.truncated ? legacy.fileReads.length === 0 : legacy.fileReads.length === 1) });
  }
  const hugeLine = { file: 'synthetic-one-line.txt', start_line: 1, end_line: 1, total_lines: 1, text: `    1\t${'x'.repeat(20000)}` };
  const hugeDelivery = serializeToolResultForHistory('open_file', hugeLine);
  const hugeTelemetry = summarizeToolTelemetry([{ toolName: 'open_file', toolResult: hugeLine, toolDelivery: hugeDelivery.delivery }]);
  const receipt = { observedAt: new Date().toISOString(), cases,
    unrepresentableLine: { delivery: hugeDelivery.delivery, fileReads: hugeTelemetry.fileReads },
    sourceSha256: sha(fs.readFileSync(path.join(bridge, 'react-loop.js'))),
    passed: cases.every(c => c.matches) && hugeTelemetry.fileReads.length === 0,
    limitations: ['Actual file-tool/serializer/ledger execution, not model consumption or full review.',
      'Synthetic oversized single line exercises missing-range reporting without creating a source file.',
      'No provider, DB, Jest, bot, broker, PM2 or reindex operation.'] };
  fs.writeFileSync(path.join(__dirname, 'range-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt));
  if (!receipt.passed) process.exitCode = 1;
}
main().catch(error => { console.error(`${error.name}: ${error.message}`); process.exitCode = 1; });
